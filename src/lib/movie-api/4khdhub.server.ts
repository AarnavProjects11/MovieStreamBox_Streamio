// 4KHDHub provider — the web port of MovieBox-TUI's `4khdhub` scraper.
//
// 4KHDHub is a direct-download index: every title has a page that lists one
// download entry per quality/size variant plus an embedded online player.
// Everything here is read-only HTML parsing, so the same code works against
// whichever mirror is currently serving the site.
import { parseCodec, parseQuality, parseSize, parseSizeBytes } from "./quality";
import { detectLanguages, detectSubtitles, streamLanguageTags } from "./languages";
import {
  FOURKHDHUB_NAME,
  FOURKHDHUB_PREFIX,
  fromFourKHDHubId,
  isFourKHDHubId,
  toFourKHDHubId,
  type CatalogItem,
  type Episode,
  type MediaDetails,
  type StreamOption,
} from "./provider";

export { FOURKHDHUB_NAME, FOURKHDHUB_PREFIX, fromFourKHDHubId, isFourKHDHubId, toFourKHDHubId };

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT = 12_000;

/** The site rotates domains; every mirror serves the same catalogue. */
export const FOURKHDHUB_MIRRORS = [
  "https://4khdhub.one",
  "https://4khdhub.fans",
  "https://4khdhub.link",
  "https://4khdhub.dad",
];

/* ------------------------------------------------------------------ *
 * Text helpers
 * ------------------------------------------------------------------ */

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)));
}

/** Strips markup and collapses whitespace — the site's own copy is HTML-encoded. */
function plain(html: string | undefined | null): string {
  return decodeEntities(String(html ?? "").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

const GENRE_WORDS = new Set([
  "action",
  "action & adventure",
  "adventure",
  "animation",
  "comedy",
  "crime",
  "crime & thriller",
  "documentary",
  "drama",
  "family",
  "fantasy",
  "history",
  "horror",
  "kids",
  "mystery",
  "romance",
  "sci-fi",
  "sci-fi & fantasy",
  "science fiction",
  "thriller",
  "war",
  "western",
]);

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

/** Fetches a page, walking the mirror list until one answers with the real site. */
async function fetchHtml(
  path: string,
  signal?: AbortSignal,
): Promise<{ html: string; base: string }> {
  const errors: string[] = [];

  for (const base of FOURKHDHUB_MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch(`${base}${path}`, {
        signal: controller.signal,
        redirect: "follow",
        headers: {
          "User-Agent": UA,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (!res.ok) {
        errors.push(`${base} → HTTP ${res.status}`);
        continue;
      }
      const html = await res.text();
      // A retired mirror answers with the host's parked page instead of the site.
      if (html.includes("defaultwebpage.cgi") || html.length < 2000) {
        errors.push(`${base} → not the site`);
        continue;
      }
      return { html, base };
    } catch (error) {
      if (signal?.aborted) throw error;
      errors.push(`${base} → ${error instanceof Error ? error.message : "failed"}`);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  throw new Error(`4KHDHub is unreachable — ${errors.join("; ")}`);
}

/* ------------------------------------------------------------------ *
 * Catalogue cards
 * ------------------------------------------------------------------ */

export interface FourKHDHubCard {
  slug: string;
  title: string;
  type: "movie" | "series";
  poster?: string;
  year?: string;
  genres: string[];
  formats: string[];
}

/** Parses the `movie-card` grid used by the search page and every category page. */
export function parseCards(html: string): FourKHDHubCard[] {
  const cards: FourKHDHubCard[] = [];
  const seen = new Set<string>();

  for (const match of html.matchAll(
    /<a\s+href="([^"]+)"\s+class="movie-card"[^>]*>([\s\S]*?)<\/a>/g,
  )) {
    const slug = match[1].replace(/^\/+/, "").replace(/\/+$/, "");
    if (!slug || seen.has(slug)) continue;

    const card = match[2];
    const title = plain(card.match(/<h3 class="movie-card-title">([\s\S]*?)<\/h3>/)?.[1]);
    if (!title) continue;

    const meta = plain(card.match(/<p class="movie-card-meta">([\s\S]*?)<\/p>/)?.[1]);
    const formats = [...card.matchAll(/<span class="movie-card-format">([\s\S]*?)<\/span>/g)]
      .map((m) => plain(m[1]))
      .filter(Boolean);

    // Series cards carry a season range ("S01-S05") and a "Series" format tag.
    const isSeries =
      formats.some((f) => /series|episode/i.test(f)) || /S\d{1,2}\s*-\s*S?\d{1,2}/i.test(meta);

    seen.add(slug);
    cards.push({
      slug,
      title,
      type: isSeries ? "series" : "movie",
      poster: card.match(/<img src="([^"]+)"/)?.[1],
      year: meta.match(/[12]\d{3}/)?.[0],
      genres: formats.filter((f) => GENRE_WORDS.has(f.toLowerCase())),
      formats,
    });
  }

  return cards;
}

/* ------------------------------------------------------------------ *
 * Title pages
 * ------------------------------------------------------------------ */

export interface FourKHDHubDownload {
  id: string;
  /** The site's own variant label, e.g. "Dune: Part Two (2160p 4K UHD DV HDR10 BluRay)". */
  label: string;
  filename?: string;
  size?: string;
  sizeBytes?: number;
  /** Season packs carry the season in the header (series only). */
  season?: number;
  /** Audio languages shown on the variant's language badge. */
  languages: string[];
  links: { label: string; url: string }[];
}

export interface FourKHDHubPost {
  slug: string;
  url: string;
  title: string;
  type: "movie" | "series";
  year?: string;
  poster?: string;
  backdrop?: string;
  description?: string;
  director?: string[];
  cast?: string[];
  genres: string[];
  printFormats?: string;
  audio?: string;
  /** The embedded online player, when the page publishes one. */
  embedUrl?: string;
  downloads: FourKHDHubDownload[];
  seasons: number[];
}

function parseDownloads(html: string): FourKHDHubDownload[] {
  const downloads: FourKHDHubDownload[] = [];

  for (const chunk of html.split('<div class="download-item').slice(1)) {
    const id = chunk.match(/data-file-id="([^"]+)"/)?.[1];
    if (!id) continue;

    const codeEnd = chunk.indexOf("</code>");
    const header = codeEnd === -1 ? chunk : chunk.slice(0, codeEnd);

    const label = plain(header.match(/font-semibold">([\s\S]*?)<br>/)?.[1]);
    const season = Number(header.match(/episode-number[^>]*>\s*S?(\d{1,2})\s*</i)?.[1]) || 0;

    const badges = [...header.matchAll(/<span class="badge"[^>]*>([\s\S]*?)<\/span>/g)]
      .map((m) => plain(m[1]))
      .filter(Boolean);
    const size = badges.find((b) => /\d\s?(GB|MB|TB)\b/i.test(b));
    // The teal language badge reads like "Hindi, English"; every other badge is
    // a size or a source type ("BluRay", "WEB-DL"), which carry no languages.
    const languageBadge = badges.find((b) => detectLanguages(b).length > 0);

    const filename = plain(chunk.match(/class="file-title">([\s\S]*?)<\/div>/)?.[1]);

    const links: { label: string; url: string }[] = [];
    for (const anchor of chunk.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
      const href = anchor[1].match(/href="([^"]+)"/)?.[1];
      if (!href || !/^https?:\/\//i.test(href)) continue;
      const text = plain(anchor[2]);
      if (!/download/i.test(text)) continue;
      links.push({
        label: text.replace(/^Download\s+/i, "").trim() || "Download",
        url: href,
      });
    }

    if (!label && !links.length) continue;

    downloads.push({
      id,
      label: label || filename || "Download",
      filename: filename || undefined,
      size: size ?? parseSize(label) ?? undefined,
      sizeBytes: size ? (parseSizeBytes(size) ?? undefined) : (parseSizeBytes(label) ?? undefined),
      season: season || undefined,
      languages: languageBadge
        ? detectLanguages(languageBadge)
        : streamLanguageTags(`${label} ${filename}`),
      links,
    });
  }

  return downloads;
}

/** Parses a title page into metadata plus its download entries. */
export function parsePost(html: string, slug: string, base: string): FourKHDHubPost {
  const pageTitle = plain(html.match(/<h1 class="page-title">([\s\S]*?)<\/h1>/)?.[1]);
  const year =
    pageTitle.match(/[([]\s*([12]\d{3})\s*[)\]]/)?.[1] ?? pageTitle.match(/\b([12]\d{3})\b/)?.[1];
  const title = pageTitle.replace(/\s*[([]\s*[12]\d{3}\s*[)\]]\s*$/, "").trim() || pageTitle;

  const metadata: Record<string, string> = {};
  for (const item of html.matchAll(
    /<span class="metadata-label">([\s\S]*?)<\/span>\s*<span class="metadata-value"[^>]*>([\s\S]*?)<\/span>/g,
  )) {
    metadata[plain(item[1]).replace(/:$/, "").toLowerCase()] = plain(item[2]);
  }

  const poster = html.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
  const backdrop = html.match(/https:\/\/image\.tmdb\.org\/t\/p\/w780\/[a-z0-9]+\.jpg/i)?.[0];
  const description = plain(html.match(/<p class="mt-4">([\s\S]*?)<\/p>/)?.[1]);
  const embedUrl = html.match(/<iframe[^>]+id="videoPlayer"[^>]+src="([^"]+)"/)?.[1];

  const downloads = parseDownloads(html);
  // The page-level "Audios:" metadata covers variants whose own badge is absent.
  const pageLanguages = metadata.audios ? detectLanguages(metadata.audios) : [];
  if (pageLanguages.length) {
    for (const download of downloads) {
      if (!download.languages.length) download.languages = pageLanguages;
    }
  }
  const seasons = [...new Set(downloads.map((d) => d.season).filter((s): s is number => !!s))].sort(
    (a, b) => a - b,
  );

  const cast = metadata.stars
    ? metadata.stars
        .split(",")
        .map((name) => name.replace(/\s*\(.*?\)\s*$/, "").trim())
        .filter(Boolean)
    : [];

  const genres = [
    ...new Set(
      [...html.matchAll(/<span class="badge badge-outline"[^>]*>([\s\S]*?)<\/span>/g)]
        .map((m) => plain(m[1]))
        .filter((f) => GENRE_WORDS.has(f.toLowerCase())),
    ),
  ];

  return {
    slug,
    url: `${base}/${slug}/`,
    title,
    type: seasons.length ? "series" : "movie",
    year,
    poster,
    backdrop,
    description:
      description || plain(html.match(/<meta name="description" content="([^"]+)"/)?.[1]),
    director: metadata.director ? [metadata.director] : [],
    cast,
    genres,
    printFormats: metadata.prints,
    audio: metadata.audios,
    embedUrl,
    downloads,
    seasons,
  };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

export function isFourKHDHubUrl(url: string): boolean {
  return FOURKHDHUB_MIRRORS.some((m) => String(url ?? "").startsWith(m));
}

/** Searches the site's own search endpoint. */
export async function searchFourKHDHub(
  query: string,
  limit = 24,
  signal?: AbortSignal,
): Promise<FourKHDHubCard[]> {
  const trimmed = String(query ?? "").trim();
  if (!trimmed) return [];
  const { html } = await fetchHtml(`/?s=${encodeURIComponent(trimmed)}`, signal);
  return parseCards(html).slice(0, limit);
}

/** Loads a title page by slug. */
export async function fetchFourKHDHubPost(
  slug: string,
  signal?: AbortSignal,
): Promise<FourKHDHubPost> {
  const clean = String(slug ?? "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
  if (!clean) throw new Error("Missing 4KHDHub title id");
  const { html, base } = await fetchHtml(`/${clean}/`, signal);
  return parsePost(html, clean, base);
}

/** Turns a catalogue card into the app's catalogue shape. */
export function cardToCatalogItem(card: FourKHDHubCard): CatalogItem {
  return {
    id: toFourKHDHubId(card.slug),
    type: card.type,
    name: card.title,
    poster: card.poster,
    year: card.year,
    genres: card.genres,
    sourceLabel: FOURKHDHUB_NAME,
  };
}

/** Turns a title page into the app's detail shape. */
export function postToMediaDetails(post: FourKHDHubPost): MediaDetails {
  // The site publishes season packs rather than a per-episode list, so each
  // season becomes one selectable entry.
  const episodes: Episode[] = post.seasons.map((season) => {
    const pack = post.downloads.find((d) => d.season === season);
    return {
      id: `${post.slug}:${season}:0`,
      season,
      episode: 0,
      title: pack?.label ?? `Season ${season}`,
      overview: pack?.filename,
    };
  });

  return {
    id: toFourKHDHubId(post.slug),
    type: post.type,
    name: post.title,
    poster: post.poster,
    background: post.backdrop ?? post.poster,
    year: post.year,
    description: post.description,
    genres: post.genres,
    cast: post.cast,
    director: post.director,
    episodes,
    seasons: post.seasons,
    sourceLabel: FOURKHDHUB_NAME,
  };
}

/** Turns a title page into playable stream entries. */
export function postToStreams(post: FourKHDHubPost): StreamOption[] {
  const streams: StreamOption[] = [];

  for (const download of post.downloads) {
    if (!download.links.length) continue;

    // A variant usually offers two mirrors of the same file (HubCloud and
    // HubDrive). Only HubCloud's redirector can be resolved without an
    // account, so it becomes the primary and the other is kept as a mirror.
    const primary = download.links.find((l) => /hubcloud/i.test(l.url)) ?? download.links[0];
    const mirror = download.links.find((l) => l !== primary && l.url !== primary.url) ?? null;
    const descriptor = `${download.label} ${download.filename ?? ""} ${post.audio ?? ""}`;
    const languages = download.languages.length
      ? download.languages
      : streamLanguageTags(descriptor);
    // 4KHDHub does not publish a subtitle list. Multi-audio scene releases
    // ("MULTi", "DDP5.1 Hindi + English") almost always carry subtitle tracks,
    // so that combination is the signal the filter can honestly use.
    const hasSubtitles = detectSubtitles(descriptor) || languages.length > 1;

    streams.push({
      addon: FOURKHDHUB_NAME,
      title: `${download.label}${download.size ? `\n${download.size}` : ""}`.slice(0, 300),
      url: null,
      magnet: null,
      externalUrl: primary.url,
      mirrorUrl: mirror?.url ?? null,
      playback: "none",
      quality: parseQuality(download.label),
      codec: parseCodec(download.label),
      size: download.size ?? null,
      sizeBytes: download.sizeBytes,
      sourceLabel: `${FOURKHDHUB_NAME} · ${primary.label}`,
      filename: download.filename,
      needsHeaders: false,
      notWebReady: true,
      season: download.season ?? null,
      languages,
      hasSubtitles,
    });
  }

  if (post.embedUrl) {
    streams.push({
      addon: FOURKHDHUB_NAME,
      title: "4KHDHub online player",
      url: null,
      magnet: null,
      externalUrl: post.embedUrl,
      embedUrl: post.embedUrl,
      playback: "browser",
      quality: null,
      codec: null,
      size: null,
      sourceLabel: `${FOURKHDHUB_NAME} · Player`,
      needsHeaders: false,
      notWebReady: false,
      season: null,
      languages: post.audio ? detectLanguages(post.audio) : [],
      hasSubtitles: detectSubtitles(post.description ?? "") || !!post.audio,
    });
  }

  return streams;
}

function normalizeTitle(value: string): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Picks the catalogue card that best matches a title.
 * Exact matches win, then prefix matches, then substring matches.
 */
export function pickBestMatch(
  cards: FourKHDHubCard[],
  title: string,
  year?: string,
  type?: "movie" | "series",
): FourKHDHubCard | null {
  const wanted = normalizeTitle(title);
  if (!wanted) return null;

  let best: FourKHDHubCard | null = null;
  let bestScore = 0;

  for (const card of cards) {
    const candidate = normalizeTitle(card.title);
    if (!candidate) continue;

    let score = 0;
    if (candidate === wanted) score = 100;
    else if (candidate.startsWith(wanted) || wanted.startsWith(candidate)) score = 70;
    else if (candidate.includes(wanted) || wanted.includes(candidate)) score = 45;

    if (!score) continue;
    // Year is a strong signal: a same-name remake/reboot is usually the wrong
    // title, while an exact title with a matching year is almost always right.
    if (year && card.year) score += card.year === year ? 30 : -20;
    if (type && card.type === type) score += 5;
    else if (!type && card.type === "movie") score += 2;

    if (score > bestScore) {
      bestScore = score;
      best = card;
    }
  }

  return best;
}

/**
 * Resolves the 4KHDHub sources for a title.
 * `id` may be a 4KHDHub id (`4khd-<slug>`) or any other id, in which case the
 * title name is used to look the entry up in the site's search.
 */
export async function resolveFourKHDHubStreams(input: {
  id: string;
  type?: "movie" | "series";
  title?: string;
  year?: string;
  season?: number;
  signal?: AbortSignal;
}): Promise<StreamOption[]> {
  const { id, type, title, year, season, signal } = input;

  let post: FourKHDHubPost;
  if (isFourKHDHubId(id)) {
    post = await fetchFourKHDHubPost(fromFourKHDHubId(id), signal);
  } else {
    if (!title) return [];
    const cards = await searchFourKHDHub(title, 24, signal);
    // A series called "Daredevil" must not inherit the 2003 film's streams,
    // so when the caller knows the type, only same-type cards are eligible.
    const eligible = type ? cards.filter((c) => c.type === type) : cards;
    const match = pickBestMatch(eligible, title, year, type);
    if (!match) return [];
    post = await fetchFourKHDHubPost(match.slug, signal);
  }

  const streams = postToStreams(post);

  // Season packs only apply to the season they were cut for.
  if (season && season > 0) {
    const forSeason = streams.filter((s) => !s.season || s.season === season);
    if (forSeason.length) return forSeason;
  }

  return streams;
}
