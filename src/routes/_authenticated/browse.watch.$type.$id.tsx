import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  Play,
  Download,
  Loader2,
  MonitorPlay,
  Plus,
  ExternalLink,
  Lock,
  Puzzle,
  Magnet,
  SlidersHorizontal,
  Subtitles,
  Languages,
} from "lucide-react";
import { toast } from "sonner";
import { getDetails, getStreams, installAddon } from "@/lib/movie-api/movies.functions";
import { resolveFourKHDHubLink } from "@/lib/movie-api/4khdhub.functions";
import { FOURKHDHUB_NAME, FOURKHDHUB_PREFIX } from "@/lib/movie-api/provider";
import { languageCode } from "@/lib/movie-api/languages";
import { addStream } from "@/lib/streams.functions";
import { qualityLabel, qualityScore } from "@/lib/movie-api/quality";
import type { StreamOption } from "@/lib/movie-api/provider";
import { supabase } from "@/integrations/supabase/client";
import { ErrorState, intentHref, useBrowseSettings } from "@/components/browse/ui";
import { useBrowseKeys } from "@/components/browse/keyboard";
import { WebtorPlayer } from "@/components/browse/webtor-player";
import { torrentSourceOf, useWebtorUrl, type TorrentSource } from "@/lib/webtor";

export const Route = createFileRoute("/_authenticated/browse/watch/$type/$id")({
  validateSearch: z.object({ s: z.number().int().optional(), e: z.number().int().optional() }),
  beforeLoad: ({ params }) => {
    if (params.type !== "movie" && params.type !== "series") throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Watch — Stream Box" },
      {
        name: "description",
        content: "Pick a stream and play it in the browser, MX Player or VLC.",
      },
      { property: "og:title", content: "Watch — Stream Box" },
      {
        property: "og:description",
        content: "Pick a stream and play it in the browser, MX Player or VLC.",
      },
    ],
  }),
  component: WatchPage,
});

function WatchPage() {
  const { type: rawType, id } = Route.useParams();
  const type = rawType as "movie" | "series";
  const { s, e } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [settings] = useBrowseSettings();
  const fetchDetails = useServerFn(getDetails);
  const fetchStreams = useServerFn(getStreams);
  const add = useServerFn(addStream);
  const resolveLink = useServerFn(resolveFourKHDHubLink);
  const [busy, setBusy] = useState<StreamOption | null>(null);
  const meta = useQuery({
    queryKey: ["details", type, id],
    queryFn: () => fetchDetails({ data: { type, id } }),
  });
  // 4KHDHub is looked up by title, so the streams query waits for the details
  // (a 4KHDHub id already carries everything the provider needs).
  const isHub = id.startsWith(FOURKHDHUB_PREFIX);
  const q = useQuery({
    queryKey: ["streams", type, id, s ?? 0, e ?? 0],
    queryFn: () =>
      fetchStreams({
        data: {
          type,
          id,
          season: s ?? 0,
          episode: e ?? 0,
          title: meta.data?.name,
          year: meta.data?.year,
        },
      }),
    enabled: isHub || meta.isFetched,
  });
  const [playing, setPlaying] = useState<StreamOption | null>(null);
  const [webtor, setWebtor] = useState<{
    source: TorrentSource;
    title: string;
    poster?: string;
  } | null>(null);
  const webtorUrl = useWebtorUrl();
  const [addingSource, setAddingSource] = useState(false);

  const title = meta.data
    ? type === "series" && s
      ? `${meta.data.name} S${s}E${e}`
      : meta.data.name
    : "";

  useEffect(() => {
    if (!meta.data) return;
    const details = meta.data;
    void (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) return;
        const entry = {
          user_id: u.user.id,
          meta_id: id,
          meta_type: type,
          season: s ?? 0,
          episode: e ?? 0,
          title: details.name,
          poster: details.background ?? details.poster ?? null,
          updated_at: new Date().toISOString(),
        };
        const { error } = await supabase
          .from("watch_history")
          .upsert(entry, { onConflict: "user_id,meta_id,season,episode" });
        // Upsert needs a unique index on that tuple. Older projects without one
        // returned an error here and silently dropped every history write, so
        // fall back to a plain insert instead of losing the position.
        if (error) await supabase.from("watch_history").insert(entry);
      } catch {
        // History is best-effort: never break playback over it.
      }
    })();
  }, [meta.data, id, type, s, e]);

  const streams = useMemo(() => {
    const list = q.data?.streams ?? [];
    if (settings.quality === "any") return list;
    const pref = qualityScore(settings.quality);
    return [...list].sort(
      (a, b) => Math.abs(qualityScore(a.quality) - pref) - Math.abs(qualityScore(b.quality) - pref),
    );
  }, [q.data, settings.quality]);

  /* ------------------------------------------------------------------ *
   * Filters — episode, quality, audio language and subtitles
   * ------------------------------------------------------------------ */

  const [qualityFilter, setQualityFilter] = useState("any");
  const [languageFilter, setLanguageFilter] = useState("any");
  const [subtitleFilter, setSubtitleFilter] = useState<"any" | "yes" | "no">("any");

  const seasons = useMemo(() => {
    const fromDetails = meta.data?.seasons ?? [];
    if (fromDetails.length) return fromDetails;
    return [...new Set((meta.data?.episodes ?? []).map((ep) => ep.season))].sort((a, b) => a - b);
  }, [meta.data]);

  const activeSeason = s ?? seasons[0] ?? 1;

  const seasonEpisodes = useMemo(() => {
    const all = (meta.data?.episodes ?? []).filter((ep) => ep.season === activeSeason);
    const realEpisodes = all.filter((ep) => ep.episode > 0).sort((a, b) => a.episode - b.episode);
    // 4KHDHub publishes one season pack instead of a per-episode list.
    return realEpisodes.length ? realEpisodes : all.slice(0, 1);
  }, [meta.data, activeSeason]);

  const activeEpisode = e ?? seasonEpisodes[0]?.episode ?? 1;

  // A series opened without an episode jumps straight into its first one.
  useEffect(() => {
    if (type !== "series" || s !== undefined) return;
    const first = meta.data?.episodes?.find((ep) => ep.episode > 0) ?? meta.data?.episodes?.[0];
    if (!first) return;
    void navigate({ search: { s: first.season, e: first.episode }, replace: true });
  }, [type, s, meta.data, navigate]);

  const qualityOptions = useMemo(() => {
    const order = ["2160p", "1080p", "720p", "480p", "unknown"];
    const seen = new Map<string, string>();
    for (const st of streams) {
      const key = st.quality ?? "unknown";
      if (!seen.has(key)) seen.set(key, st.quality ? qualityLabel(st.quality) : "Unknown");
    }
    return [...seen.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [streams]);

  const languageOptions = useMemo(() => {
    const set = new Set<string>();
    for (const st of streams) for (const lang of st.languages ?? []) set.add(lang);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [streams]);

  const visibleStreams = useMemo(
    () =>
      streams.filter((st) => {
        if (qualityFilter !== "any" && (st.quality ?? "unknown") !== qualityFilter) return false;
        if (languageFilter !== "any" && !(st.languages ?? []).includes(languageFilter))
          return false;
        if (subtitleFilter === "yes" && !st.hasSubtitles) return false;
        if (subtitleFilter === "no" && st.hasSubtitles) return false;
        return true;
      }),
    [streams, qualityFilter, languageFilter, subtitleFilter],
  );

  const filtersActive =
    qualityFilter !== "any" || languageFilter !== "any" || subtitleFilter !== "any";

  function clearFilters() {
    setQualityFilter("any");
    setLanguageFilter("any");
    setSubtitleFilter("any");
  }

  async function saveToLibrary(st: StreamOption) {
    const url = st.url ?? st.magnet ?? st.externalUrl;
    if (!url) return;
    try {
      const r = await add({
        data: { title: title || st.title.slice(0, 200), url },
      });
      toast.success("Saved to My Streams", { description: r.warning ?? undefined });
    } catch (err: any) {
      toast.error(err?.message ?? "Could not save");
    }
  }

  /**
   * Streams a torrent in-app through a self-hosted Webtor instance. This is the
   * TorBox-free path used by the 18+ section, whose add-ons mostly publish
   * magnets rather than direct files.
   */
  function playWithWebtor(st: StreamOption) {
    const source = torrentSourceOf({ magnet: st.magnet, url: st.url });
    if (!source) {
      toast.error("This stream does not contain a torrent.");
      return;
    }
    if (!webtorUrl) {
      toast.error("No Webtor server configured", {
        description: "Add your self-hosted Webtor URL in Settings to stream torrents.",
      });
      return;
    }
    setPlaying(null);
    setWebtor({
      source,
      title: title || st.title,
      poster: undefined,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /**
   * Hands a stream to MX Player, VLC or the downloader. A 4KHDHub download link
   * is a redirector, so it is resolved to the real file first.
   */
  async function openInPlayer(st: StreamOption, target: "mx" | "vlc" | "download") {
    let url = st.url;
    if (!url && st.externalUrl) {
      setBusy(st);
      try {
        const resolved = await resolveLink({
          data: { url: st.externalUrl, mirrorUrl: st.mirrorUrl ?? undefined },
        });
        url = resolved.url;
      } catch (err) {
        // Fall back to the landing page so the user is never stuck.
        toast.error((err as Error).message || "Could not resolve that file.");
        window.open(st.mirrorUrl ?? st.externalUrl, "_blank", "noopener,noreferrer");
        setBusy(null);
        return;
      }
      setBusy(null);
    }
    if (!url) return;

    if (target === "download") {
      const a = document.createElement("a");
      a.href = url;
      a.download = st.filename || "";
      a.rel = "noreferrer";
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    const pkg = target === "mx" ? "com.mxtech.videoplayer.ad" : "org.videolan.vlc";
    window.location.href = intentHref(url, pkg);
  }

  // TUI keys: d downloads the best stream, r refreshes the source list.
  useBrowseKeys({
    download: () => {
      const best = streams[0];
      if (best) void saveToLibrary(best);
      else toast.error("No stream to save yet.");
    },
    refresh: () => q.refetch(),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-primary">Watch</p>
        <h1 className="font-display text-3xl">{title || "Loading…"}</h1>
      </div>

      {playing?.url && (
        <div className="overflow-hidden rounded-2xl border border-border bg-black">
          <video
            src={playing.url}
            controls
            autoPlay
            className="aspect-video w-full"
            onError={() =>
              toast.error("This stream can't play in the browser. Try MX Player or VLC.")
            }
          >
            {playing.subtitles?.map((track) => (
              <track
                key={track.url}
                kind="subtitles"
                src={track.url}
                label={track.lang}
                srcLang={languageCode(track.lang)}
              />
            ))}
          </video>
        </div>
      )}

      {playing?.embedUrl && (
        <div className="overflow-hidden rounded-2xl border border-border bg-black">
          <iframe
            src={playing.embedUrl}
            title={`${title || "Stream"} player`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="aspect-video w-full"
          />
        </div>
      )}

      {webtor && webtorUrl && (
        <WebtorPlayer
          baseUrl={webtorUrl}
          source={webtor.source}
          title={webtor.title}
          poster={webtor.poster}
          onClose={() => setWebtor(null)}
        />
      )}

      {q.isLoading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
          ))}
          <p className="text-sm text-muted-foreground">Asking your add-ons for streams…</p>
        </div>
      )}

      {q.isError && <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />}

      {q.data?.noStreamAddons && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6 text-center">
          <Puzzle className="mx-auto h-8 w-8 text-primary" />
          <p className="font-semibold">No stream add-ons enabled</p>
          <p className="text-sm text-muted-foreground">
            Cinemeta only provides catalogs and metadata. Install an add-on that provides streams to
            find playable sources.
          </p>
          <Link
            to="/browse/addons"
            className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary"
          >
            Manage add-ons
          </Link>
          <div className="mx-auto max-w-md text-left">
            <AddSourceInline onInstalled={() => q.refetch()} />
          </div>
        </div>
      )}

      {!!q.data?.errors.length && (
        <p className="text-xs text-destructive">
          Unavailable: {q.data.errors.map((x) => `${x.addon} (${x.error})`).join(", ")}
        </p>
      )}

      {!!q.data?.blocked.length && (
        <p className="text-xs text-muted-foreground">
          {q.data.blocked.join(", ")} answered but returned nothing this app can play.
        </p>
      )}

      {!!q.data?.sources.length && (
        <section className="rounded-xl border border-border bg-card/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Sources
            </span>
            {q.data.sources.map((src) => (
              <span
                key={`${src.addon}-${src.manifestUrl}`}
                title={src.reason ? `${src.addon}: ${src.reason}` : src.addon}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${
                  src.status === "ok"
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : src.status === "unavailable"
                      ? "border-destructive/40 text-destructive"
                      : "border-border text-muted-foreground"
                }`}
              >
                {src.addon}
                {src.custom && (
                  <span className="rounded bg-primary px-1 text-[9px] font-bold uppercase text-primary-foreground">
                    custom
                  </span>
                )}
                <span className="opacity-70">{sourceStatusText(src)}</span>
              </span>
            ))}
            <Link
              to="/browse/addons"
              className="ml-auto text-xs font-semibold text-muted-foreground underline-offset-4 hover:underline"
            >
              Manage
            </Link>
            <button
              onClick={() => setAddingSource((v) => !v)}
              className="text-xs font-semibold text-primary underline-offset-4 hover:underline"
            >
              {addingSource ? "Close" : "Add source"}
            </button>
          </div>
          {addingSource && (
            <div className="mt-3">
              <AddSourceInline
                onInstalled={() => {
                  setAddingSource(false);
                  q.refetch();
                }}
              />
            </div>
          )}
        </section>
      )}

      {!!streams.length && (
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-primary">
              <SlidersHorizontal className="h-4 w-4" /> Filters
            </span>
            <span className="text-xs text-muted-foreground">
              {visibleStreams.length} of {streams.length} streams
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {type === "series" && (
              <>
                <label className="space-y-1">
                  <span className="block text-xs text-muted-foreground">Season</span>
                  <select
                    value={activeSeason}
                    onChange={(event) => {
                      const nextSeason = Number(event.target.value);
                      const nextEpisode =
                        (meta.data?.episodes ?? [])
                          .filter((ep) => ep.season === nextSeason)
                          .sort((a, b) => a.episode - b.episode)[0]?.episode ?? 1;
                      void navigate({ search: { s: nextSeason, e: nextEpisode } });
                    }}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-primary"
                  >
                    {seasons.map((season) => (
                      <option key={season} value={season}>
                        Season {season}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="block text-xs text-muted-foreground">Episode</span>
                  <select
                    value={activeEpisode}
                    onChange={(event) =>
                      void navigate({ search: { s: activeSeason, e: Number(event.target.value) } })
                    }
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-primary"
                  >
                    {seasonEpisodes.map((ep) => (
                      <option key={`${ep.season}-${ep.episode}`} value={ep.episode}>
                        {ep.episode > 0 ? `E${ep.episode} · ${ep.title}` : "Full season pack"}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="space-y-1">
              <span className="block text-xs text-muted-foreground">Video quality</span>
              <select
                value={qualityFilter}
                onChange={(event) => setQualityFilter(event.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-primary"
              >
                <option value="any">Any quality</option>
                {qualityOptions.map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Languages className="h-3 w-3" /> Audio language
              </span>
              <select
                value={languageFilter}
                onChange={(event) => setLanguageFilter(event.target.value)}
                disabled={!languageOptions.length}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary"
              >
                <option value="any">
                  {languageOptions.length ? "Any language" : "Not reported"}
                </option>
                {languageOptions.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Subtitles className="h-3 w-3" /> Subtitles
              </span>
              <select
                value={subtitleFilter}
                onChange={(event) => setSubtitleFilter(event.target.value as "any" | "yes" | "no")}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-primary"
              >
                <option value="any">Any</option>
                <option value="yes">With subtitles</option>
                <option value="no">Without subtitles</option>
              </select>
            </label>
          </div>
          {filtersActive && (
            <button
              onClick={clearFilters}
              className="mt-3 text-xs font-semibold text-primary underline-offset-4 hover:underline"
            >
              Clear filters
            </button>
          )}
        </section>
      )}

      {q.data &&
        !q.data.noStreamAddons &&
        streams.length === 0 &&
        (type === "series" && s === undefined ? (
          <p className="text-muted-foreground">Pick a season and episode to look for streams.</p>
        ) : (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <p className="text-muted-foreground">
              No streams found for this title. Add another source and Stream Box will ask it right
              away.
            </p>
            <AddSourceInline onInstalled={() => q.refetch()} />
          </div>
        ))}

      {streams.length > 0 && visibleStreams.length === 0 && (
        <p className="text-muted-foreground">
          No streams match these filters.{" "}
          <button
            onClick={clearFilters}
            className="font-semibold text-primary underline underline-offset-4"
          >
            Clear filters
          </button>
        </p>
      )}

      <ul className="space-y-3">
        {visibleStreams.map((st, i) => {
          const embeddable = !!st.embedUrl;
          const browserPlayable =
            !!st.url && !st.needsHeaders && st.playback !== "none" && !st.notWebReady;
          const externalPlayerOk =
            !!st.url && !st.needsHeaders && st.playback !== "none" && !st.notWebReady;
          // A 4KHDHub download link points at a redirector; it becomes a real
          // media URL once the chain is walked. The embedded player is not a
          // redirector, so it is left alone.
          const resolvable =
            !st.url && !st.embedUrl && !!st.externalUrl && st.addon === FOURKHDHUB_NAME;
          const torrent = torrentSourceOf({ magnet: st.magnet, url: st.url });
          const key = `${i}`;
          const isBusy = busy === st;
          return (
            <li key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded bg-primary px-2 py-0.5 font-bold text-primary-foreground">
                  {qualityLabel(st.quality)}
                </span>
                {st.codec && (
                  <span className="rounded border border-border px-2 py-0.5">{st.codec}</span>
                )}
                {st.size && (
                  <span className="rounded border border-border px-2 py-0.5">{st.size}</span>
                )}
                {(st.languages ?? []).map((lang) => (
                  <span
                    key={lang}
                    className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5"
                  >
                    <Languages className="h-3 w-3" /> {lang}
                  </span>
                ))}
                {st.hasSubtitles && (
                  <span className="inline-flex items-center gap-1 rounded border border-border px-2 py-0.5">
                    <Subtitles className="h-3 w-3" /> Subs
                  </span>
                )}
                <span className="text-muted-foreground">via {st.sourceLabel ?? st.addon}</span>
              </div>
              {st.filename && <p className="text-xs text-muted-foreground">{st.filename}</p>}
              <p className="line-clamp-2 whitespace-pre-line text-sm">{st.title}</p>
              <div className="flex flex-wrap gap-2">
                {(browserPlayable || embeddable) && (
                  <button
                    onClick={() => setPlaying(st)}
                    className="tv-action inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
                  >
                    <Play className="h-4 w-4" />
                    Play here
                  </button>
                )}
                {externalPlayerOk && (
                  <>
                    <a
                      href={intentHref(st.url!, "com.mxtech.videoplayer.ad")}
                      target="_self"
                      className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                    >
                      <MonitorPlay className="h-4 w-4" />
                      MX Player
                    </a>
                    <a
                      href={intentHref(st.url!, "org.videolan.vlc")}
                      target="_self"
                      className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                    >
                      <MonitorPlay className="h-4 w-4" />
                      VLC
                    </a>
                    <a
                      href={st.url!}
                      download
                      className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </a>
                  </>
                )}
                {resolvable && (
                  <>
                    <button
                      onClick={() => openInPlayer(st, "mx")}
                      disabled={isBusy}
                      className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MonitorPlay className="h-4 w-4" />
                      )}
                      MX Player
                    </button>
                    <button
                      onClick={() => openInPlayer(st, "vlc")}
                      disabled={isBusy}
                      className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MonitorPlay className="h-4 w-4" />
                      )}
                      VLC
                    </button>
                    <button
                      onClick={() => openInPlayer(st, "download")}
                      disabled={isBusy}
                      className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      Download
                    </button>
                  </>
                )}
                {st.notWebReady && !resolvable && !torrent && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="h-4 w-4" />
                    {st.url
                      ? "Not web-ready — use an external player."
                      : "Not playable here — open it to reach the file."}
                  </span>
                )}{" "}
                {st.needsHeaders && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Lock className="h-4 w-4" />
                    Needs provider headers — not playable in the browser.
                  </span>
                )}
                {torrent && webtorUrl && (
                  <button
                    onClick={() => playWithWebtor(st)}
                    className="tv-action inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
                  >
                    <Magnet className="h-4 w-4" />
                    Play with Webtor
                  </button>
                )}
                {torrent && !webtorUrl && (
                  <Link
                    to="/browse/settings"
                    className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                  >
                    <Lock className="h-4 w-4" />
                    Set up Webtor to stream this
                  </Link>
                )}
                {st.externalUrl && !st.url && (
                  <a
                    href={st.externalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open
                  </a>
                )}
                {(st.url || st.magnet || st.externalUrl) && !st.needsHeaders && (
                  <button
                    onClick={() => saveToLibrary(st)}
                    className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                  >
                    <Plus className="h-4 w-4" />
                    Save to My Streams
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Short status for one add-on in the per-source report. */
function sourceStatusText(src: { status: string; streams: number; rawCount: number }) {
  if (src.status === "ok") return `${src.streams} stream${src.streams === 1 ? "" : "s"}`;
  if (src.status === "blocked") return "nothing playable";
  if (src.status === "unavailable") return "unavailable";
  if (src.status === "skipped") return "skipped";
  return "no results";
}

/**
 * Inline install for a custom stream add-on. The add-on is saved server-side first and the
 * stream query is then refetched, so a freshly installed source appears without leaving the
 * watch page.
 */
function AddSourceInline({ onInstalled }: { onInstalled: () => void }) {
  const install = useServerFn(installAddon);
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (!value) return;
    setBusy(true);
    try {
      const addon = await install({ data: { url: value } });
      setUrl("");
      qc.invalidateQueries({ queryKey: ["addons"] });
      if (addon.providesStream) {
        toast.success(`Added ${addon.name}`, {
          description: "Looking for its streams now…",
        });
        onInstalled();
      } else {
        toast.warning(`${addon.name} doesn't provide streams`, {
          description: "It only supplies catalogs or metadata, so it adds no playable sources.",
        });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Could not add that add-on");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row">
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="Stream add-on manifest — https://…/manifest.json"
        inputMode="url"
        className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus-visible:ring-4 focus-visible:ring-primary"
      />
      <button
        disabled={busy}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {busy ? "Adding…" : "Add source"}
      </button>
    </form>
  );
}
