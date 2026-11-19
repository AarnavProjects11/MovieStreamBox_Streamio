// Stremio HTTP add-on client — web port of MovieBox-TUI
// src/providers/addons/{client.rs, adapter.rs, aggregator.rs, mod.rs}
import {
  formatBytes,
  parseCodec,
  parseQuality,
  parseSize,
  parseSizeBytes,
  qualityScore,
} from "./quality";
import { playbackTarget } from "./playback";
import { detectSubtitles, streamLanguageTags } from "./languages";
import {
  addonConcreteType,
  addonSupportsType,
  isCoreAddon,
  type AddonCatalogDefinition,
  type CatalogItem,
  type MediaDetails,
  toMetaType,
  type MetaType,
  type ResolvedAddon,
  type StreamOption,
} from "./provider";

const TIMEOUT = 12_000;
const STREAM_TIMEOUT = 5_000;

/* ------------------------------------------------------------------ *
 * URL handling (port of AddonClient::normalize_manifest_url / base_addon_url)
 * ------------------------------------------------------------------ */

import { baseAddonUrl, normalizeManifestUrl } from "./addon-url";

export { baseAddonUrl, normalizeManifestUrl };

/* ------------------------------------------------------------------ *
 * Transport
 * ------------------------------------------------------------------ */

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Node's fetch rejects every network failure as `TypeError: fetch failed` and keeps the
 * real reason in `.cause` (a socket error code, or an AggregateError when a host has
 * several addresses). Without unwrapping it the add-on screen can only say "fetch
 * failed", which is what made broken installs impossible to diagnose.
 */
function describeFetchError(error: any, url: string): string {
  if (error?.name === "AbortError" || error?.name === "TimeoutError") return "add-on timed out";

  if (error instanceof SyntaxError)
    return "the add-on did not return JSON — check the address points at manifest.json";

  const cause = error?.cause ?? error;
  const code = String(
    cause?.code ?? cause?.errno ?? cause?.errors?.[0]?.code ?? cause?.errors?.[0]?.errno ?? "",
  );
  const host = hostOf(url);

  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `${host} could not be resolved — check the add-on address`;
    case "ECONNREFUSED":
      return `${host} refused the connection`;
    case "ECONNRESET":
      return `${host} closed the connection unexpectedly`;
    case "ETIMEDOUT":
    case "UND_ERR_CONNECT_TIMEOUT":
    case "UND_ERR_HEADERS_TIMEOUT":
    case "UND_ERR_BODY_TIMEOUT":
      return `${host} did not respond in time`;
    case "CERT_HAS_EXPIRED":
      return `${host} has an expired certificate`;
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return `${host} uses a certificate this server does not trust`;
    case "ERR_INVALID_URL":
      return "that is not a valid add-on address";
    default:
      break;
  }

  const message = String(error?.message ?? "");
  if (message === "fetch failed") {
    const detail = String(cause?.message ?? "");
    return detail && detail !== message
      ? `could not reach ${host} (${detail})`
      : `could not reach ${host}`;
  }
  return message || "add-on request failed";
}

async function getJson(url: string, timeout = TIMEOUT): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": "StreamBox/1.0 (Addon-Client)" },
    });
    if (!res.ok) throw new Error(`add-on returned HTTP ${res.status}`);
    return await res.json();
  } catch (e: any) {
    throw new Error(describeFetchError(e, url));
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ *
 * Manifests (port of AddonManifest / fetch_manifest)
 * ------------------------------------------------------------------ */

export interface AddonManifest {
  id: string;
  name: string;
  version?: string;
  description?: string;
  logo?: string;
  background?: string;
  resources: string[];
  types: string[];
  idPrefixes: string[];
  catalogs: AddonCatalogDefinition[];
}

export async function fetchManifest(manifestUrl: string): Promise<AddonManifest> {
  const url = normalizeManifestUrl(manifestUrl);
  const json = await getJson(url);
  if (!json || typeof json !== "object" || Array.isArray(json))
    throw new Error("Not a valid add-on manifest");

  const name = String(json.name ?? "").trim();
  if (!name) throw new Error("Add-on manifest is missing a name");

  const resources = (Array.isArray(json.resources) ? json.resources : [])
    .map((r: any) => (typeof r === "string" ? r : r?.name))
    .filter((r: any): r is string => typeof r === "string" && !!r.trim())
    .map((r: string) => r.trim().toLowerCase());

  const catalogs = (Array.isArray(json.catalogs) ? json.catalogs : [])
    .filter((c: any) => c && typeof c.type === "string" && typeof c.id === "string")
    .map((c: any): AddonCatalogDefinition => ({
      type: String(c.type),
      id: String(c.id),
      name: typeof c.name === "string" ? c.name : undefined,
      extra: Array.isArray(c.extra)
        ? c.extra
            .filter((x: any) => x && typeof x.name === "string")
            .map((x: any) => ({
              name: String(x.name),
              isRequired: !!x.isRequired,
              options: Array.isArray(x.options) ? x.options.map(String) : undefined,
            }))
        : undefined,
    }));

  return {
    id: String(json.id ?? url),
    name,
    version: json.version != null ? String(json.version) : undefined,
    description: json.description != null ? String(json.description) : undefined,
    logo: typeof json.logo === "string" ? json.logo : undefined,
    background: typeof json.background === "string" ? json.background : undefined,
    resources,
    types: (Array.isArray(json.types) ? json.types : []).map(String),
    idPrefixes: (Array.isArray(json.idPrefixes) ? json.idPrefixes : []).map(String),
    catalogs,
  };
}

/** Mirrors `InstalledAddon::from_manifest`. */
export function manifestToAddon(manifestUrl: string, m: AddonManifest): ResolvedAddon {
  return {
    manifestUrl: normalizeManifestUrl(manifestUrl),
    name: m.name,
    version: m.version,
    description: m.description,
    logo: m.logo,
    enabled: true,
    core: isCoreAddon(manifestUrl),
    providesCatalog: m.resources.includes("catalog") || m.catalogs.length > 0,
    providesMeta: m.resources.includes("meta"),
    providesStream: m.resources.includes("stream"),
    types: m.types,
    idPrefixes: m.idPrefixes,
    catalogs: m.catalogs,
  };
}

/* ------------------------------------------------------------------ *
 * Resources (port of fetch_catalog / fetch_catalog_search / fetch_meta / fetch_streams)
 * ------------------------------------------------------------------ */

/** Tolerant `metas` / `items` / `results` / bare-array parsing. */
function parseCatalogMetas(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  for (const key of ["metas", "items", "results"]) {
    if (Array.isArray(raw?.[key])) return raw[key];
  }
  return [];
}

export async function fetchCatalog(
  base: string,
  type: string,
  catalogId: string,
  extra?: string,
): Promise<any[]> {
  const url = extra
    ? `${base}/catalog/${type}/${catalogId}/${extra}.json`
    : `${base}/catalog/${type}/${catalogId}.json`;
  return parseCatalogMetas(await getJson(url));
}

export async function fetchCatalogSearch(
  base: string,
  type: string,
  catalogId: string,
  query: string,
  extra?: string,
): Promise<any[]> {
  const q = encodeURIComponent(query.trim());
  const prefix = extra ? `${extra}&` : "";
  return parseCatalogMetas(
    await getJson(`${base}/catalog/${type}/${catalogId}/${prefix}search=${q}.json`),
  );
}

export async function fetchMeta(base: string, type: string, id: string): Promise<any> {
  const raw = await getJson(`${base}/meta/${type}/${encodeId(id)}.json`);
  return raw && typeof raw === "object" && raw.meta && typeof raw.meta === "object"
    ? raw.meta
    : raw;
}

export async function fetchStreams(base: string, type: string, id: string): Promise<any[]> {
  const raw = await getJson(`${base}/stream/${type}/${encodeId(id)}.json`, STREAM_TIMEOUT);
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw?.streams) ? raw.streams : [];
}

/** Encode an id path segment but keep the `:` that series stream ids rely on. */
function encodeId(id: string) {
  return encodeURIComponent(id).replace(/%3A/gi, ":");
}

/* ------------------------------------------------------------------ *
 * Adapters (port of adapter.rs)
 * ------------------------------------------------------------------ */

/** Mirrors `extract_4digit_year`: first 4-digit run starting with 1 or 2. */
export function extractYear(raw: unknown): string {
  if (raw == null) return "";
  const m = String(raw).match(/[12]\d{3}/);
  return m ? m[0] : "";
}

/** Mirrors `clean_stream_text`: drop emoji, collapse whitespace. */
export function cleanStreamText(input: string): string {
  return String(input ?? "")
    .replace(/[\p{Extended_Pictographic}\uFE0F\u20E3]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function posterOf(m: any): string | undefined {
  const p = m?.poster ?? m?.cover;
  return typeof p === "string" && p.trim() ? p : undefined;
}

/** Mirrors `meta_to_catalog_item` (ids stay bare so existing routes keep working). */
export function mapMetaToCatalogItem(m: any, fallbackType: MetaType): CatalogItem {
  const raw = String(m?.type ?? fallbackType).toLowerCase();
  const isSeries = raw === "series" || raw === "tv" || raw === "anime";
  const genres = Array.isArray(m?.genres) ? m.genres : Array.isArray(m?.genre) ? m.genre : [];
  return {
    id: String(m?.imdb_id ?? m?.id ?? ""),
    type: isSeries ? "series" : "movie",
    name: String(m?.name ?? m?.title ?? "Untitled"),
    poster: posterOf(m),
    background: typeof m?.background === "string" ? m.background : undefined,
    year: extractYear(m?.releaseInfo ?? m?.year ?? m?.released) || undefined,
    rating:
      m?.imdbRating != null
        ? String(m.imdbRating)
        : m?.rating != null
          ? String(m.rating)
          : undefined,
    description: m?.description ?? m?.overview ?? m?.synopsis ?? undefined,
    genres: genres.map(String),
  };
}

/** Mirrors `meta_detail_to_media_details` (season/episode map, fallback chains). */
export function metaDetailToMediaDetails(d: any, fallbackType: MetaType): MediaDetails {
  const videos: any[] = Array.isArray(d?.videos) ? d.videos : [];
  const raw = String(d?.type ?? fallbackType).toLowerCase();
  const isSeries = raw === "series" || raw === "tv" || raw === "anime" || videos.length > 0;

  // season -> episode -> episode (first wins, like BTreeMap::or_insert)
  const byKey = new Map<string, MediaDetails["episodes"][number]>();
  for (const v of videos) {
    const season = Number(v?.season ?? 1) || 1;
    const episode = Number(v?.episode ?? v?.number ?? 1) || 1;
    if (season <= 0) continue; // specials are not browsable
    const key = `${season}:${episode}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      id: String(v?.id ?? `${d?.id ?? ""}:${season}:${episode}`),
      season,
      episode,
      title: String(v?.title ?? v?.name ?? `Episode ${episode}`),
      thumbnail: typeof v?.thumbnail === "string" ? v.thumbnail : undefined,
      overview: v?.overview ?? v?.description ?? undefined,
      released: typeof v?.released === "string" ? v.released : undefined,
    });
  }

  const episodes = [...byKey.values()].sort((a, b) => a.season - b.season || a.episode - b.episode);
  const base = mapMetaToCatalogItem(d, isSeries ? "series" : "movie");
  return {
    ...base,
    logo: typeof d?.logo === "string" ? d.logo : undefined,
    runtime: d?.runtime != null ? String(d.runtime) : undefined,
    cast: Array.isArray(d?.cast)
      ? d.cast.map(String)
      : Array.isArray(d?.stars)
        ? d.stars.map(String)
        : [],
    director: Array.isArray(d?.director)
      ? d.director.map(String)
      : Array.isArray(d?.directors)
        ? d.directors.map(String)
        : [],
    trailer: d?.trailers?.[0]?.source ?? undefined,
    episodes,
    seasons: [...new Set(episodes.map((e) => e.season))].sort((a, b) => a - b),
  };
}

/** Mirrors `parse_season_episode`: S01E02, 1x02, "Season 1 Episode 2", "Episode 5". */
export function parseSeasonEpisode(text: string): [number, number] | null {
  const t = String(text ?? "");
  const se = t.match(/(?:^|[^A-Za-z0-9])S(\d{1,3})[\s._-]*E(\d{1,4})/i);
  if (se) return [Number(se[1]), Number(se[2])];

  const x = t.match(/(?:^|[^A-Za-z0-9])(\d{1,3})x(\d{1,4})(?![0-9])/i);
  if (x) {
    const s = Number(x[1]);
    const e = Number(x[2]);
    if (s > 0 && s < 100 && e > 0 && e < 10_000) return [s, e];
  }

  const full = t.match(/season\s+(\d{1,3})\s*[^\d]{0,12}?episode\s+(\d{1,4})/i);
  if (full) return [Number(full[1]), Number(full[2])];

  const ep = t.match(/episode\s+(\d{1,4})/i);
  if (ep) return [1, Number(ep[1])];

  return null;
}

/** Mirrors `extract_domain_label` (used for the "Addon · Host" source label). */
function extractDomainLabel(url: string): string | null {
  const clean = String(url ?? "")
    .trim()
    .replace(/^https?:\/\//i, "");
  const host = clean.split(/[/:?#]/)[0]?.trim();
  if (!host || /^\d+(\.\d+){3}$/.test(host)) return null;
  const parts = host.split(".");
  if (parts.length < 2) return null;
  const main =
    parts[parts.length - 2] === "co" || parts[parts.length - 2] === "com"
      ? parts[parts.length - 3]
      : parts[parts.length - 2];
  if (!main || ["www", "api", "cdn"].includes(main)) return null;
  return main
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Mirrors `detect_stream_host`. */
export function detectStreamHost(addonName: string, streamName: string, url: string): string {
  const labels: string[] = [];
  for (const line of String(streamName ?? "").split("\n")) {
    const trimmed = line
      .trim()
      .replace(/^[[(]+|[\])]+$/g, "")
      .trim();
    if (
      trimmed &&
      trimmed.toLowerCase() !== addonName.toLowerCase() &&
      !labels.some((l) => l.toLowerCase() === trimmed.toLowerCase())
    ) {
      labels.push(trimmed);
    }
  }
  const domain = extractDomainLabel(url);
  if (
    domain &&
    domain.toLowerCase() !== addonName.toLowerCase() &&
    !labels.some((l) => l.toLowerCase() === domain.toLowerCase())
  ) {
    labels.push(domain);
  }
  return labels.length ? `${addonName} · ${labels[0]}` : addonName;
}

/** Mirrors `stream_item_to_release` (whitelisted headers only). */
const ALLOWED_HEADERS = new Set([
  "user-agent",
  "referer",
  "origin",
  "range",
  "x-forwarded-for",
  "accept",
  "accept-language",
]);

export function streamItemToOption(
  addonName: string,
  item: any,
  season = 0,
  episode = 0,
): StreamOption | null {
  if (!item || typeof item !== "object") return null;

  const rawUrl = typeof item.url === "string" ? item.url.trim() : "";
  const url = /^https?:\/\//i.test(rawUrl) ? rawUrl : null;
  const infoHash = typeof item.infoHash === "string" ? item.infoHash.trim() : "";
  const magnet = !url && infoHash ? `magnet:?xt=urn:btih:${infoHash}` : null;
  const externalUrl =
    typeof item.externalUrl === "string" && /^https?:\/\//i.test(item.externalUrl)
      ? item.externalUrl
      : null;
  if (!url && !magnet && !externalUrl) return null;

  const name = typeof item.name === "string" ? item.name : "";
  const title = typeof item.title === "string" ? item.title : "";
  const description = typeof item.description === "string" ? item.description : "";
  const text = `${name} ${title} ${description}`;

  // Only keep streams that belong to the requested episode.
  if (season > 0 && episode > 0) {
    const found = parseSeasonEpisode(text);
    if (found && (found[0] !== season || found[1] !== episode)) return null;
  }

  const hints =
    item.behaviorHints && typeof item.behaviorHints === "object" ? item.behaviorHints : undefined;
  const headers: Record<string, string> = {};
  if (hints?.headers && typeof hints.headers === "object") {
    for (const [k, v] of Object.entries(hints.headers)) {
      if (ALLOWED_HEADERS.has(k.toLowerCase()) && typeof v === "string") headers[k] = v;
    }
  }

  const sizeBytes =
    typeof hints?.videoSize === "number" && hints.videoSize > 0
      ? hints.videoSize
      : (parseSizeBytes(text) ?? undefined);
  const rawLabel = title || description || name || "Stream";
  const cleanedSize = parseSize(text) ?? (sizeBytes ? formatBytes(sizeBytes) : null);

  // Stremio streams may carry their own subtitle tracks (opensubtitles-style
  // add-ons). Browsers only render WebVTT through <track>, so SRT entries are
  // counted for the filter but not handed to the player.
  const allSubtitles = Array.isArray(item.subtitles)
    ? item.subtitles
        .filter((s: any) => s && typeof s.url === "string")
        .map((s: any) => ({ url: String(s.url), lang: String(s.lang ?? s.id ?? "Unknown") }))
        .slice(0, 20)
    : [];
  const vttSubtitles = allSubtitles.filter((s: { url: string }) => /\.vtt(\?|$)/i.test(s.url));

  // Most add-ons already print the size in their label; appending it again showed
  // the same "1.4 GB" twice on the watch page. Compare ignoring whitespace, since
  // labels mix "1.4GB" and "1.4 GB".
  const squash = (value: string) => value.replace(/\s+/g, "").toLowerCase();
  const labelWithSize =
    cleanedSize && !squash(rawLabel).includes(squash(cleanedSize))
      ? `${rawLabel.split("\n")[0]}\n${cleanedSize}`
      : rawLabel;

  return {
    addon: addonName,
    title: labelWithSize.slice(0, 300),
    url,
    magnet,
    externalUrl,
    playback: url ? playbackTarget(url) : "none",
    quality: parseQuality(text),
    codec: parseCodec(text),
    size: cleanedSize,
    sizeBytes,
    sourceLabel: detectStreamHost(addonName, name, url ?? ""),
    filename:
      cleanStreamText(String(hints?.filename ?? title.split("\n")[0] ?? "")).slice(0, 240) ||
      undefined,
    languages: streamLanguageTags(text),
    subtitles: vttSubtitles,
    hasSubtitles: allSubtitles.length > 0 || detectSubtitles(text),
    needsHeaders: Object.keys(headers).length > 0,
    notWebReady: !!hints?.notWebReady || (url ? playbackTarget(url) !== "browser" : false),
  };
}

/* ------------------------------------------------------------------ *
 * Catalog resolution across installed add-ons
 * ------------------------------------------------------------------ */

function dedupeByKey(items: CatalogItem[]): CatalogItem[] {
  const seen = new Set<string>();
  return items.filter((i) => {
    if (!i.id) return false;
    const key = `${i.type}:${i.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickCatalogId(addon: ResolvedAddon, type: MetaType, preferred: string): string {
  const declared = addon.catalogs.filter((c) => toMetaType(c.type) === type);
  if (declared.some((c) => c.id === preferred)) return preferred;
  return declared.find((c) => c.id === "top")?.id ?? declared[0]?.id ?? preferred;
}

/** Builds the `/catalog/{type}/{id}/{extra}.json` path for one add-on, honouring declared extras. */
function catalogPath(
  addon: ResolvedAddon,
  type: MetaType,
  catalogId: string,
  opts: { genre?: string; skip?: number; search?: string },
) {
  const def = addon.catalogs.find((c) => c.type === type && c.id === catalogId);
  const extra = def?.extra ?? [];
  const declared = new Set(extra.map((e) => e.name));
  const hasRequiredGenre = extra.some((e) => e.isRequired && e.name === "genre");
  const parts: string[] = [];
  for (const req of extra.filter((e) => e.isRequired && e.options?.length)) {
    parts.push(`${req.name}=${encodeURIComponent(req.options![0])}`);
  }
  if (opts.search && (declared.has("search") || !declared.size))
    parts.push(`search=${encodeURIComponent(opts.search)}`);
  else if (opts.genre && declared.has("genre") && !hasRequiredGenre)
    parts.push(`genre=${encodeURIComponent(opts.genre)}`);
  if (opts.skip && opts.skip > 0 && declared.has("skip")) parts.push(`skip=${opts.skip}`);
  return parts.join("&");
}

/**
 * Fetches a catalog, preferring the add-on that declares it and falling back to the other
 * installed add-ons (mirrors the "try each enabled add-on, stop at the first that answers" loop).
 */
export async function resolveCatalog(
  addons: ResolvedAddon[],
  type: MetaType,
  opts: {
    addonUrl?: string;
    catalogId?: string;
    genre?: string;
    skip?: number;
    preferredAddonName?: string;
  } = {},
): Promise<CatalogItem[]> {
  const pool = addons.filter((a) => a.enabled && a.providesCatalog && addonSupportsType(a, type));
  const preferred = opts.addonUrl ? pool.find((a) => a.manifestUrl === opts.addonUrl) : undefined;
  const preferredByName =
    !preferred && opts.preferredAddonName
      ? pool.find((a) => a.name === opts.preferredAddonName)
      : undefined;
  const first = preferred ?? preferredByName;
  const ordered = first ? [first, ...pool.filter((a) => a !== first)] : pool;
  const page = opts.skip ?? 0;

  const errors: string[] = [];
  for (const addon of ordered) {
    const catalogId = pickCatalogId(addon, type, opts.catalogId ?? "top");
    const path = catalogPath(addon, type, catalogId, { genre: opts.genre, skip: opts.skip });
    try {
      const raw = await fetchCatalog(
        baseAddonUrl(addon.manifestUrl),
        type,
        catalogId,
        path || undefined,
      );
      const items = dedupeByKey(raw.map((m) => mapMetaToCatalogItem(m, type)));
      // Once a specific add-on (or a later page) is requested, an empty page is the real
      // answer — switching to another add-on here would corrupt pagination.
      if (items.length || first || page > 0) return items;
    } catch (e: any) {
      errors.push(`${addon.name}: ${e?.message ?? "failed"}`);
      if (first && page > 0)
        throw new Error(`${addon.name} catalog unavailable — ${e?.message ?? "failed"}`);
    }
  }

  if (errors.length) throw new Error(`No add-on catalog available — ${errors.join("; ")}`);
  return [];
}

/**
 * Movies + series across every enabled catalog add-on, deduped by id.
 * The add-on manager promises "search titles across installed add-ons", so unlike the
 * TUI's early `break` this keeps querying all of them instead of letting the first one win.
 */
export async function searchCatalogAddons(
  addons: ResolvedAddon[],
  query: string,
): Promise<{ movies: CatalogItem[]; series: CatalogItem[] }> {
  const pool = addons.filter((a) => a.enabled && (a.providesMeta || a.providesCatalog));
  const out: { movies: CatalogItem[]; series: CatalogItem[] } = { movies: [], series: [] };
  const seen = new Set<string>();

  for (const addon of pool) {
    const base = baseAddonUrl(addon.manifestUrl);
    const search = async (type: MetaType) => {
      const catalogId = pickCatalogId(addon, type, "top");
      const def = addon.catalogs.find((c) => c.type === type && c.id === catalogId);
      const declared = new Set((def?.extra ?? []).map((e) => e.name));
      if (declared.size && !declared.has("search")) return [];
      const extra = (def?.extra?.filter((e) => e.isRequired && e.options?.length) ?? [])
        .map((e) => `${e.name}=${encodeURIComponent(e.options![0])}`)
        .join("&");
      try {
        const raw = await fetchCatalogSearch(base, type, catalogId, query, extra || undefined);
        return raw.map((m) => mapMetaToCatalogItem(m, type));
      } catch {
        return [];
      }
    };

    const [movies, series] = await Promise.all([search("movie"), search("series")]);
    for (const item of [...movies, ...series]) {
      const key = `${item.type}:${item.id}`;
      if (!item.id || seen.has(key)) continue;
      seen.add(key);
      (item.type === "series" ? out.series : out.movies).push(item);
    }
  }

  return out;
}

/**
 * Fetches one catalog straight from one add-on, using the catalog's own declared
 * `type` (which may be outside this app's movie/series pair, e.g. `Porn`).
 * Required extras use their first declared option; `skip` is honoured.
 */
export async function resolveAddonCatalogRaw(
  addon: ResolvedAddon,
  catalogType: string,
  catalogId: string,
  opts: { genre?: string; skip?: number; search?: string } = {},
): Promise<CatalogItem[]> {
  const def = addon.catalogs.find((c) => c.type === catalogType && c.id === catalogId);
  const extra = def?.extra ?? [];
  const parts: string[] = [];

  for (const req of extra.filter((e) => e.isRequired && e.options?.length)) {
    parts.push(`${req.name}=${encodeURIComponent(req.options![0])}`);
  }
  if (opts.search) parts.push(`search=${encodeURIComponent(opts.search)}`);
  else if (opts.genre && extra.some((e) => e.name === "genre" && !e.isRequired)) {
    parts.push(`genre=${encodeURIComponent(opts.genre)}`);
  }
  if (opts.skip && opts.skip > 0) parts.push(`skip=${opts.skip}`);

  const raw = await fetchCatalog(
    baseAddonUrl(addon.manifestUrl),
    catalogType,
    catalogId,
    parts.join("&") || undefined,
  );
  // Items carry their own type; map anything that isn't series-like to `movie`
  // so the normal details/watch routes can open them.
  return dedupeByKey(raw.map((m) => mapMetaToCatalogItem(m, "movie")));
}

/** Mirrors the add-on Provider's `details()`: try the requested type first, then the others. */
export async function resolveMeta(
  addons: ResolvedAddon[],
  type: MetaType,
  id: string,
): Promise<MediaDetails> {
  const pool = addons.filter((a) => a.enabled && (a.providesMeta || a.providesCatalog));
  const typeOrder: MetaType[] = type === "series" ? ["series", "movie"] : ["movie", "series"];
  let fallback: { detail: any; type: MetaType } | null = null;

  for (const addon of pool) {
    // A namespaced id (`jstrm:`, `kitsu:`) only exists in the add-on that declares it.
    if (!addonSupportsId(addon, id)) continue;
    const base = baseAddonUrl(addon.manifestUrl);
    // Candidate request types: the app types this add-on maps to, plus its own
    // declared types so add-ons like the adult catalog (type `Porn`) answer.
    const attempts = new Set<string>();
    for (const t of typeOrder) {
      const concrete = addonConcreteType(addon, t);
      if (concrete) attempts.add(concrete);
    }
    for (const t of addon.types) if (t) attempts.add(t);
    for (const attempt of attempts) {
      try {
        const detail = await fetchMeta(base, attempt as string, id);
        if (!detail || typeof detail !== "object") continue;
        if (String(detail.id ?? "") !== id) continue;
        if (!String(detail.name ?? detail.title ?? "").trim()) continue;

        const videos: any[] = Array.isArray(detail.videos) ? detail.videos : [];
        const declared = String(detail.type ?? attempt).toLowerCase();
        const isSeries =
          declared === "series" || declared === "tv" || declared === "anime" || videos.length > 0;
        if (isSeries || attempt === type)
          return metaDetailToMediaDetails(detail, isSeries ? "series" : "movie");
        fallback ??= { detail, type: attempt as MetaType };
      } catch {
        // try the next type / add-on
      }
    }
  }

  if (fallback) return metaDetailToMediaDetails(fallback.detail, fallback.type);
  throw new Error("Title not found in any enabled add-on.");
}

/* ------------------------------------------------------------------ *
 * Stream aggregation (port of aggregator.rs)
 * ------------------------------------------------------------------ */

export type StreamSourceStatus = "ok" | "empty" | "blocked" | "unavailable" | "skipped";

/** One enabled stream add-on and what it did for this request. */
export interface StreamSourceReport {
  addon: string;
  manifestUrl: string;
  /** Installed by the user (not part of the recommended defaults). */
  custom: boolean;
  streams: number;
  rawCount: number;
  status: StreamSourceStatus;
  reason?: string;
}

export interface AggregatedStreams {
  streams: StreamOption[];
  errors: { addon: string; error: string }[];
  /** Add-ons that returned entries but nothing usable (e.g. torrent-only results). */
  blocked: string[];
  noStreamAddons: boolean;
  /** Per-add-on outcome, including add-ons that were skipped or returned nothing. */
  sources: StreamSourceReport[];
}

function streamKey(s: StreamOption) {
  return s.url ?? s.magnet ?? s.externalUrl ?? `${s.addon}:${s.title}`;
}

/** Mirrors the dedupe+merge+sort pass of `aggregate_streams`. */
export function mergeStreams(list: StreamOption[]): StreamOption[] {
  const byKey = new Map<string, StreamOption>();
  for (const s of list) {
    const key = streamKey(s);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...s });
      continue;
    }
    if (!existing.url && s.url) existing.url = s.url;
    if (!existing.magnet && s.magnet) existing.magnet = s.magnet;
    if (!existing.externalUrl && s.externalUrl) existing.externalUrl = s.externalUrl;
    if (!existing.embedUrl && s.embedUrl) existing.embedUrl = s.embedUrl;
    if (!existing.season && s.season) existing.season = s.season;
    if (!existing.sizeBytes && s.sizeBytes) {
      existing.sizeBytes = s.sizeBytes;
      existing.size = existing.size ?? s.size;
    }
    if (!existing.quality && s.quality) existing.quality = s.quality;
    if (!existing.codec && s.codec) existing.codec = s.codec;
    if (existing.addon !== s.addon && !existing.addon.split(", ").includes(s.addon))
      existing.addon = `${existing.addon}, ${s.addon}`;
  }

  return [...byKey.values()].sort(
    (a, b) =>
      qualityScore(b.quality) - qualityScore(a.quality) ||
      (b.sizeBytes ?? 0) - (a.sizeBytes ?? 0) ||
      (a.sourceLabel ?? a.addon).localeCompare(b.sourceLabel ?? b.addon),
  );
}

/** A declared `idPrefixes` list restricts which ids an add-on can answer for. */
function addonSupportsId(addon: ResolvedAddon, id: string) {
  if (!addon.idPrefixes.length) return true;
  const wanted = id.toLowerCase();
  return addon.idPrefixes.some((p) => p && wanted.startsWith(p.toLowerCase()));
}

/**
 * The concrete `{type}` to use for one add-on, or a human reason it cannot
 * answer. Add-ons whose only type is outside movie/series (e.g. `Porn`) are
 * still queried with their own type.
 */
function streamTarget(
  addon: ResolvedAddon,
  type: MetaType,
  id: string,
): { concreteType: string } | { reason: string } {
  if (!addonSupportsId(addon, id)) {
    return { reason: `expects ${addon.idPrefixes.join(", ")} ids` };
  }
  const concreteType = addonConcreteType(addon, type);
  if (!concreteType) {
    return {
      reason: `serves ${addon.types.length ? addon.types.join(", ") : "other types"}`,
    };
  }
  return { concreteType };
}

export async function aggregateStreams(
  addons: ResolvedAddon[],
  type: MetaType,
  subjectId: string,
  season = 0,
  episode = 0,
): Promise<AggregatedStreams> {
  const streamAddons = addons.filter((a) => a.enabled && a.providesStream);
  // Unreachable add-ons have no resolved capabilities, so include them explicitly:
  // otherwise a dead custom source disappears from the watch page without a trace.
  const monitored = addons.filter((a) => a.enabled && (a.providesStream || a.unreachable));
  // Keep namespaced ids (`tmdb:123`, `kitsu:4646`) intact — add-ons declare idPrefixes
  // against them, and stripping the namespace silently breaks those add-ons.
  const rawId = String(subjectId ?? "").trim();
  if (!rawId) throw new Error("Missing title id");
  const streamId =
    type === "series" && episode > 0 && !/:\d+:\d+$/.test(rawId)
      ? `${rawId}:${season}:${episode}`
      : rawId;

  const results = await Promise.all(
    monitored.map(
      async (addon): Promise<{ report: StreamSourceReport; streams: StreamOption[] }> => {
        const base = {
          addon: addon.name,
          manifestUrl: addon.manifestUrl,
          custom: !!addon.custom,
        };
        if (addon.unreachable) {
          return {
            report: {
              ...base,
              streams: 0,
              rawCount: 0,
              status: "unavailable",
              reason: "manifest unreachable",
            },
            streams: [],
          };
        }
        const target = streamTarget(addon, type, rawId);
        if ("reason" in target) {
          return {
            report: {
              ...base,
              streams: 0,
              rawCount: 0,
              status: "skipped",
              reason: target.reason,
            },
            streams: [],
          };
        }

        try {
          const items = await fetchStreams(
            baseAddonUrl(addon.manifestUrl),
            target.concreteType,
            streamId,
          );
          const streams = items
            .map((item) => streamItemToOption(addon.name, item, season, episode))
            .filter((s): s is StreamOption => !!s);
          const status: StreamSourceStatus =
            streams.length > 0 ? "ok" : items.length > 0 ? "blocked" : "empty";
          return {
            report: {
              ...base,
              streams: streams.length,
              rawCount: items.length,
              status,
              reason:
                status === "empty"
                  ? "no results for this title"
                  : status === "blocked"
                    ? "returned nothing this app can play"
                    : undefined,
            },
            streams,
          };
        } catch (e: any) {
          return {
            report: {
              ...base,
              streams: 0,
              rawCount: 0,
              status: "unavailable",
              reason: e?.message ?? "failed",
            },
            streams: [],
          };
        }
      },
    ),
  );

  return {
    streams: mergeStreams(results.flatMap((r) => r.streams)),
    errors: results
      .filter((r) => r.report.status === "unavailable")
      .map((r) => ({ addon: r.report.addon, error: r.report.reason! })),
    blocked: results.filter((r) => r.report.status === "blocked").map((r) => r.report.addon),
    noStreamAddons: streamAddons.length === 0,
    sources: results.map((r) => r.report),
  };
}
