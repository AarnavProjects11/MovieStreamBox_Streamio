// Web adaptation of MovieBox-TUI's `Provider` trait (src/providers/mod.rs)
// plus its Stremio add-on layer (src/providers/addons/models.rs).
import type { Quality } from "./quality";

export type MetaType = "movie" | "series";

export interface CatalogItem {
  id: string;
  type: MetaType;
  name: string;
  poster?: string;
  background?: string;
  year?: string;
  rating?: string;
  description?: string;
  genres?: string[];
  /** Which provider produced this entry, e.g. "4KHDHub". Add-on items leave it unset. */
  sourceLabel?: string;
}

export interface Episode {
  id: string;
  season: number;
  episode: number;
  title: string;
  thumbnail?: string;
  overview?: string;
  released?: string;
}

export interface MediaDetails extends CatalogItem {
  logo?: string;
  runtime?: string;
  cast?: string[];
  director?: string[];
  trailer?: string;
  episodes: Episode[];
  seasons: number[];
}

export interface StreamOption {
  addon: string;
  title: string;
  url: string | null; // direct http(s) URL if browser-playable
  magnet: string | null; // torrent-based stream (hand off to TorBox)
  externalUrl: string | null;
  /** An alternate landing page for the same file, used when the primary one cannot be resolved. */
  mirrorUrl?: string | null;
  embedUrl?: string | null; // iframe player, rendered instead of a <video> element
  /** Where this URL can be played: in a browser, only in an external player, or not at all. */
  playback?: "browser" | "external" | "none";
  quality: Quality | null;
  codec: string | null;
  size: string | null; // human label, e.g. "1.4 GB"
  sizeBytes?: number;
  sourceLabel?: string; // "Addon · Host", mirrors MovieBox-TUI's source label
  filename?: string;
  season?: number | null; // season pack this entry belongs to (4KHDHub series)
  /** Audio languages the source advertises, e.g. ["Hindi", "English"]. */
  languages?: string[];
  /** Subtitle tracks with a direct URL, used for in-browser captions. */
  subtitles?: { url: string; lang: string }[];
  /** Whether the source is known to include subtitles at all. */
  hasSubtitles?: boolean;
  needsHeaders: boolean; // provider requires custom headers -> not playable in browser
  notWebReady?: boolean;
}

export interface ProviderStatus {
  id: string;
  name: string;
  description: string;
  available: boolean;
  reason?: string;
}

/* ------------------------------------------------------------------ *
 * 4KHDHub
 * ------------------------------------------------------------------ */

export const FOURKHDHUB_NAME = "4KHDHub";

/** Ids are `4khd-<slug>` so they never collide with IMDb/TMDB ids from add-ons. */
export const FOURKHDHUB_PREFIX = "4khd-";

export function isFourKHDHubId(id: string): boolean {
  return String(id ?? "").startsWith(FOURKHDHUB_PREFIX);
}

export function toFourKHDHubId(slug: string): string {
  return `${FOURKHDHUB_PREFIX}${slug}`;
}

export function fromFourKHDHubId(id: string): string {
  return String(id ?? "").replace(new RegExp(`^${FOURKHDHUB_PREFIX}`), "");
}

// Built-in MovieBox-TUI scrapers are intentionally not ported.
export const PROVIDERS: ProviderStatus[] = [
  {
    id: "addons",
    name: "Stremio Add-ons",
    description:
      "Open add-on protocol (manifest.json + /catalog, /meta, /stream). Catalogs, metadata and streams all come from your installed add-ons.",
    available: true,
  },
  {
    id: "moviebox",
    name: "MovieBox",
    description: "Native scraper in MovieBox-TUI.",
    available: false,
    reason: "Unlicensed source — not exposed in the web app.",
  },
  {
    id: "4khdhub",
    name: "4KHDHub",
    description:
      "Direct-download index. Search results and title pages are scraped from the site's current mirror; each title exposes one download entry per quality and size, plus an embedded player.",
    available: true,
  },
  {
    id: "dramachi",
    name: "Dramachi",
    description: "Native scraper in MovieBox-TUI.",
    available: false,
    reason: "Unlicensed source — not exposed in the web app.",
  },
  {
    id: "bdix",
    name: "CircleFTP / DhakaFlix",
    description: "BDIX local mirrors (Bangladesh ISPs only).",
    available: false,
    reason: "Only reachable inside BDIX ISP networks; unavailable from the cloud.",
  },
];

/* ------------------------------------------------------------------ *
 * Add-ons (port of providers/addons/models.rs)
 * ------------------------------------------------------------------ */

export interface AddonCatalogExtra {
  name: string;
  isRequired?: boolean;
  options?: string[];
}

/** Mirrors a single entry of a manifest's `catalogs` array. */
export interface AddonCatalogDefinition {
  type: string;
  id: string;
  name?: string;
  extra?: AddonCatalogExtra[];
}

/** Mirrors MovieBox-TUI's `InstalledAddon`, resolved against the add-on's manifest. */
export interface ResolvedAddon {
  manifestUrl: string;
  name: string;
  version?: string;
  description?: string;
  logo?: string;
  enabled: boolean;
  /** New-moviebox `is_core()`: Cinemeta ships built in and cannot be removed. */
  core: boolean;
  providesCatalog: boolean;
  providesMeta: boolean;
  providesStream: boolean;
  types: string[];
  idPrefixes: string[];
  catalogs: AddonCatalogDefinition[];
  /** Manifest could not be fetched — the add-on is listed but contributes nothing. */
  unreachable?: boolean;
  /** Installed by the user rather than seeded from the recommended set. */
  custom?: boolean;
  /** User-marked as adult content — shows a dedicated 18+ section when enabled. */
  adult?: boolean;
}

/** Mirrors `InstalledAddon::CINEMETA_MANIFEST`. */
export const CINEMETA = "https://v3-cinemeta.strem.io/manifest.json";

function normalizeForCompare(raw: string) {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^stremio:\/\//, "https://")
    .replace(/\/+$/, "");
}

/** Mirrors `InstalledAddon::is_core()`. */
export function isCoreAddon(manifestUrl: string) {
  return (
    normalizeForCompare(manifestUrl).includes("cinemeta") ||
    normalizeForCompare(manifestUrl) === normalizeForCompare(CINEMETA)
  );
}

/** Mirrors `InstalledAddon::cinemeta_default()` — always present, never removable. */
const FALLBACK_YEAR = String(new Date().getFullYear());

export const CORE_ADDON: ResolvedAddon = {
  manifestUrl: CINEMETA,
  name: "Cinemeta",
  version: "3.0.14",
  description: "Official catalog and metadata for movies and series.",
  enabled: true,
  core: true,
  providesCatalog: true,
  providesMeta: true,
  providesStream: false,
  types: ["movie", "series"],
  idPrefixes: ["tt"],
  catalogs: [
    {
      type: "movie",
      id: "top",
      name: "Popular",
      extra: [{ name: "genre" }, { name: "search" }, { name: "skip" }],
    },
    {
      type: "series",
      id: "top",
      name: "Popular",
      extra: [{ name: "genre" }, { name: "search" }, { name: "skip" }],
    },
    {
      type: "movie",
      id: "imdbRating",
      name: "Featured",
      extra: [{ name: "genre" }, { name: "skip" }],
    },
    {
      type: "series",
      id: "imdbRating",
      name: "Featured",
      extra: [{ name: "genre" }, { name: "skip" }],
    },
    {
      type: "movie",
      id: "year",
      name: "New",
      extra: [{ name: "genre", isRequired: true, options: [FALLBACK_YEAR] }, { name: "skip" }],
    },
    {
      type: "series",
      id: "year",
      name: "New",
      extra: [{ name: "genre", isRequired: true, options: [FALLBACK_YEAR] }, { name: "skip" }],
    },
  ],
};

/** A concrete catalog an add-on offers, ready to be requested. */
export interface AddonCatalogTarget {
  key: string;
  label: string;
  addonName: string;
  manifestUrl: string;
  type: MetaType;
  catalogId: string;
  /** Extras that must always be sent (e.g. Cinemeta's "New" needs a year). */
  requiredExtras: { name: string; value: string }[];
  /** Genre options the catalog declares, for the filter chips. */
  genreOptions: string[];
  /** Whether the catalog accepts `skip` (infinite scroll) and `search`. */
  supportsSkip: boolean;
  supportsSearch: boolean;
}

/** Maps a Stremio type string onto the two types this app browses. */
export function toMetaType(type: string): MetaType | null {
  const t = String(type ?? "").toLowerCase();
  if (t === "movie") return "movie";
  if (t === "series" || t === "tv" || t === "anime") return "series";
  return null;
}

/** Does this add-on claim to serve `type`? Empty `types` means "unspecified". */
export function addonSupportsType(addon: ResolvedAddon, type: MetaType) {
  if (!addon.types.length) return true;
  return addon.types.some((t) => {
    const mapped = toMetaType(t);
    if (mapped) return mapped === type;
    // unknown types (channel, other...) never match movie/series
    return false;
  });
}

/**
 * The concrete `{type}` an add-on serves for one of this app's browse types.
 *
 * Most add-ons declare `movie`/`series`, but some legitimate ones (e.g. adult
 * catalogs) publish under their own type such as `Porn`. When the add-on
 * declares exactly one browsable-ish type that doesn't map, use it verbatim so
 * its catalogs, metadata and streams remain reachable. `channel`-style types
 * are never substituted.
 */
export function addonConcreteType(addon: ResolvedAddon, type: MetaType): string | null {
  if (!addon.types.length) return type;
  const mapped = addon.types.filter((t) => toMetaType(t) === type);
  if (mapped.length) return mapped[0];
  const candidates = addon.types.filter((t) => t && t.toLowerCase() !== "channel");
  if (candidates.length === 1) return candidates[0];
  return null;
}

/**
 * Mirrors `curated_catalog_presets` in providers/addons/models.rs, generalised to use the
 * catalogs each manifest actually declares instead of assuming Cinemeta's hardcoded ids.
 * Catalogs whose required extras we cannot supply (id lists, etc.) are skipped.
 */
export function curatedCatalogPresets(addons: ResolvedAddon[], limit = 6): AddonCatalogTarget[] {
  const catalogAddons = addons.filter((a) => a.enabled && a.providesCatalog);
  const multi = catalogAddons.length > 1;

  // Build each add-on's rows first, then interleave one round at a time: that keeps the
  // TUI's cap while guaranteeing every installed add-on contributes a browse row.
  const perAddon = catalogAddons.map((addon) => {
    const usable = addon.catalogs
      .map((c) => ({ catalog: c, type: toMetaType(c.type) }))
      .filter((x): x is { catalog: AddonCatalogDefinition; type: MetaType } => !!x.type)
      .filter(({ catalog }) =>
        (catalog.extra ?? [])
          .filter((e) => e.isRequired)
          .every((e) => e.name === "genre" && !!e.options?.length),
      )
      // "top" first, then the manifest's own order
      .sort((a, b) => Number(b.catalog.id === "top") - Number(a.catalog.id === "top"));

    return usable.map(({ catalog, type }): AddonCatalogTarget => {
      const base = catalog.name?.trim() || catalog.id;
      // Mirrors the TUI suffix: disambiguate rows when several catalog add-ons are installed.
      const suffix = multi ? ` (${addon.name})` : "";
      return {
        key: `${addon.manifestUrl}#${type}/${catalog.id}`,
        label: `${base} ${type === "movie" ? "Movies" : "Series"}${suffix}`,
        addonName: addon.name,
        manifestUrl: addon.manifestUrl,
        type,
        catalogId: catalog.id,
        requiredExtras: (catalog.extra ?? [])
          .filter((e) => e.isRequired && e.options?.length)
          .map((e) => ({ name: e.name, value: e.options![0] })),
        genreOptions: catalog.extra?.find((e) => e.name === "genre")?.options ?? [],
        supportsSkip: (catalog.extra ?? []).some((e) => e.name === "skip"),
        supportsSearch: (catalog.extra ?? []).some((e) => e.name === "search"),
      };
    });
  });

  const candidates: AddonCatalogTarget[] = [];
  const rounds = Math.max(0, ...perAddon.map((l) => l.length));
  for (let round = 0; round < rounds; round++) {
    for (const list of perAddon) {
      const target = list[round];
      if (target) candidates.push(target);
    }
  }

  // Round-robin gives every add-on its first catalog before any add-on gets a
  // second, so with several catalog add-ons installed the cap can be filled with
  // movie rows alone and no TV row is ever produced. Reserve one row of each
  // browse type first, then fill the remaining slots in round-robin order so
  // every add-on still contributes as soon as there is room.
  const targets: AddonCatalogTarget[] = [];
  const browseTypes: MetaType[] = ["movie", "series"];
  for (const type of browseTypes) {
    const first = candidates.find((t) => t.type === type);
    if (first) targets.push(first);
  }
  for (const candidate of candidates) {
    if (targets.length >= limit) break;
    if (!targets.includes(candidate)) targets.push(candidate);
  }

  return targets;
}

export const GENRES = [
  "Action",
  "Adventure",
  "Animation",
  "Comedy",
  "Crime",
  "Documentary",
  "Drama",
  "Family",
  "Fantasy",
  "History",
  "Horror",
  "Mystery",
  "Romance",
  "Sci-Fi",
  "Thriller",
];

// Recommended add-ons auto-installed for every user (legal sources only).
export const DEFAULT_ADDONS = [
  { name: "WatchHub", manifest_url: "https://watchhub.strem.io/manifest.json" },
  {
    name: "Public Domain Movies",
    manifest_url: "https://caching.stremio.net/publicdomainmovies.now.sh/manifest.json",
  },
  { name: "YouTube Channels", manifest_url: "https://v3-channels.strem.io/manifest.json" },
];
