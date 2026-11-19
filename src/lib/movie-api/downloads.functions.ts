// Series download finder: asks every enabled stream add-on for each episode of a
// season and surfaces the download links it returns — the per-episode files plus
// any season ZIP/pack. Nothing is downloaded, installed or written here; the
// links are handed back for the UI to render.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { qualityScore, type Quality } from "./quality";
import type { StreamOption } from "./provider";

export type DownloadKind = "zip" | "file" | "page";

export interface DownloadLink {
  url: string;
  /** `zip` for an archive, `file` for a direct file, `page` for a landing page. */
  kind: DownloadKind;
  label: string;
  quality: Quality | null;
  size: string | null;
  source: string;
  /** The host requires Referer/User-Agent headers a plain link cannot send. */
  needsHeaders: boolean;
}

export interface EpisodeDownloadGroup {
  season: number;
  episode: number;
  title: string;
  links: DownloadLink[];
  /** This episode's add-on calls did not finish before the deadline. */
  timedOut?: boolean;
}

export interface SeriesDownloadsResult {
  /** Season ZIPs / complete-season packs, deduped across episodes. */
  packs: DownloadLink[];
  episodes: EpisodeDownloadGroup[];
  /** Per-add-on outcome, so an empty result can explain itself. */
  sources: { addon: string; status: string; reason?: string }[];
  noStreamAddons: boolean;
  /** At least one episode was cut off by the overall deadline. */
  timedOut: boolean;
}

const ARCHIVE_RE = /\.(zip|rar|7z)(?:[?#]|$)/i;
const STREAM_MANIFEST_RE = /\.(m3u8|mpd)(?:[?#]|$)/i;
const PACK_TEXT_RE =
  /(season\s*(?:pack|complete)|complete\s*season|full\s*season|all\s*episodes|series\s*pack)/i;
const RANGE_RE = /S\d{1,3}[\s._-]*E\d{1,4}\s*[-–—]\s*E?\d{1,4}/i;

/** S01E02 / 1x02 / "Season 1 Episode 2" — enough to tell an episode file from a pack. */
function parseEpisodeTag(text: string): [number, number] | null {
  const se = text.match(/(?:^|[^A-Za-z0-9])S(\d{1,3})[\s._-]*E(\d{1,4})/i);
  if (se) return [Number(se[1]), Number(se[2])];

  const x = text.match(/(?:^|[^A-Za-z0-9])(\d{1,3})x(\d{1,4})(?![0-9])/i);
  if (x) {
    const s = Number(x[1]);
    const e = Number(x[2]);
    if (s > 0 && s < 100 && e > 0 && e < 10_000) return [s, e];
  }

  const full = text.match(/season\s+(\d{1,3})\s*[^\d]{0,12}?episode\s+(\d{1,4})/i);
  if (full) return [Number(full[1]), Number(full[2])];
  return null;
}

function linkKind(st: StreamOption, archive: boolean): DownloadKind {
  if (!st.url) return "page";
  return archive ? "zip" : "file";
}

function toLink(st: StreamOption, kind: DownloadKind): DownloadLink | null {
  const url = (st.url ?? st.externalUrl ?? "").trim();
  if (!url) return null;
  const firstLine = String(st.title ?? "")
    .split("\n")[0]
    .trim();
  return {
    url,
    kind,
    label: (st.filename || firstLine || url).slice(0, 180),
    quality: st.quality ?? null,
    size: st.size ?? null,
    source: st.sourceLabel || st.addon || "Add-on",
    needsHeaders: !!st.needsHeaders,
  };
}

function sortLinks(a: DownloadLink, b: DownloadLink) {
  const rank = (l: DownloadLink) => (l.kind === "zip" ? 0 : l.kind === "file" ? 1 : 2);
  return rank(a) - rank(b) || qualityScore(b.quality) - qualityScore(a.quality);
}

/** Runs at most `limit` promises at once so a 24-episode season does not fan out. */
async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      out[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Resolves `null` when the promise is slower than `ms` or rejects. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), Math.max(1, ms));
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
    );
  });
}

const downloadInput = z.object({
  id: z.string().min(1).max(2000),
  season: z.number().int().min(0).max(100),
  episodes: z
    .array(
      z.object({
        episode: z.number().int().min(1).max(10_000),
        title: z.string().trim().max(300).optional(),
      }),
    )
    .min(1)
    .max(50),
});

/**
 * Fetches streams for every episode of one season and splits the results into
 * season packs (ZIPs / complete-season releases) and per-episode download links.
 * One add-on call per episode, four episodes at a time, with an overall deadline
 * so a slow add-on cannot hang the page.
 */
export const getSeriesDownloads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => downloadInput.parse(i))
  .handler(async ({ data, context }): Promise<SeriesDownloadsResult> => {
    const [{ ensureDefaultAddons, loadEnabledAddons }, { aggregateStreams }] = await Promise.all([
      import("./addons.server"),
      import("./stremio.server"),
    ]);

    await ensureDefaultAddons(context.supabase, context.userId);
    const addons = await loadEnabledAddons(context.supabase);

    const requested = [
      ...new Map(
        data.episodes.filter((e) => e.episode > 0).map((e) => [e.episode, e] as const),
      ).values(),
    ]
      .sort((a, b) => a.episode - b.episode)
      .slice(0, 50);

    if (!requested.length) {
      return {
        packs: [],
        episodes: [],
        sources: [],
        noStreamAddons: false,
        timedOut: false,
      };
    }

    const deadline = Date.now() + 25_000;
    let timedOut = false;

    type Agg = Awaited<ReturnType<typeof aggregateStreams>>;
    const results = await mapLimit(requested, 4, async (ep) => {
      const budget = deadline - Date.now();
      if (budget <= 0) {
        timedOut = true;
        return { ep, agg: null as Agg | null };
      }
      const agg = await withTimeout(
        aggregateStreams(addons, "series", data.id, data.season, ep.episode),
        budget,
      );
      if (!agg) timedOut = true;
      return { ep, agg };
    });

    const groups = new Map<
      number,
      { title: string; links: Map<string, DownloadLink>; timedOut: boolean }
    >();
    for (const ep of requested) {
      groups.set(ep.episode, {
        title: ep.title || `Episode ${ep.episode}`,
        links: new Map(),
        timedOut: true,
      });
    }

    const packs = new Map<string, DownloadLink>();
    const sources = new Map<string, { addon: string; status: string; reason?: string }>();
    let anyAnswered = false;
    let noStreamAddons = true;

    for (const { ep, agg } of results) {
      const group = groups.get(ep.episode)!;
      if (!agg) continue;
      anyAnswered = true;
      group.timedOut = false;
      noStreamAddons = noStreamAddons && agg.noStreamAddons;

      for (const source of agg.sources) {
        const previous = sources.get(source.addon);
        sources.set(source.addon, {
          addon: source.addon,
          status: source.status,
          reason: source.reason ?? previous?.reason,
        });
      }

      for (const stream of agg.streams) {
        const url = (stream.url ?? stream.externalUrl ?? "").trim();
        if (!url) continue;
        // HLS/DASH manifests are playlists, not downloadable files.
        if (STREAM_MANIFEST_RE.test(url)) continue;

        const text = `${stream.title ?? ""} ${stream.filename ?? ""}`;
        const archive = ARCHIVE_RE.test(url) || ARCHIVE_RE.test(text);
        const packText = PACK_TEXT_RE.test(text) || RANGE_RE.test(text);
        const tag = parseEpisodeTag(text);
        const taggedThisEpisode =
          !!tag && tag[0] === data.season && tag[1] === ep.episode && !RANGE_RE.test(text);
        // An archive with no episode tag (or a "complete season" / S01E01-E10
        // label) is a season pack; an archive tagged S01E02 is that episode's file.
        const isPack = packText || (archive && !taggedThisEpisode);

        const link = toLink(stream, linkKind(stream, archive));
        if (!link) continue;

        if (isPack) {
          const previous = packs.get(link.url);
          if (!previous) packs.set(link.url, link);
          else if ((!previous.size && link.size) || (!previous.quality && link.quality))
            packs.set(link.url, { ...previous, ...link });
        } else if (!group.links.has(link.url)) {
          group.links.set(link.url, link);
        }
      }
    }

    return {
      packs: [...packs.values()].sort(sortLinks),
      episodes: requested.map((ep) => {
        const group = groups.get(ep.episode)!;
        return {
          season: data.season,
          episode: ep.episode,
          title: group.title,
          links: [...group.links.values()].sort(sortLinks).slice(0, 8),
          ...(group.timedOut ? { timedOut: true } : {}),
        };
      }),
      sources: [...sources.values()],
      noStreamAddons: anyAnswered ? noStreamAddons : false,
      timedOut,
    };
  });
