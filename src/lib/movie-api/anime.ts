// Anime section source: the Anime Kitsu catalog add-on (Kitsu.io metadata,
// catalog + meta only — it declares no stream resource). Its catalogs are
// anime-only and each entry carries an IMDb id, so the existing details/watch
// flow (Cinemeta metadata + 4KHDHub streams) works unchanged.
import type { CatalogItem, MetaType } from "./provider";

export const ANIME_KITSU_MANIFEST = "https://anime-kitsu.strem.fun/manifest.json";

/** The four anime-only catalogs shown as tabs. `id` is the add-on catalog id. */
export const ANIME_CATALOGS = [
  {
    id: "kitsu-anime-trending",
    label: "Trending",
    title: "Trending now",
    description: "What the anime community is watching right now.",
  },
  {
    id: "kitsu-anime-airing",
    label: "Airing",
    title: "Top airing",
    description: "Currently airing series, ranked by Kitsu members.",
  },
  {
    id: "kitsu-anime-popular",
    label: "Popular",
    title: "Most popular",
    description: "The most popular anime in the Kitsu database.",
  },
  {
    id: "kitsu-anime-rating",
    label: "Top rated",
    title: "Highest rated",
    description: "The highest-rated anime in the Kitsu database.",
  },
] as const;

export type AnimeCatalogId = (typeof ANIME_CATALOGS)[number]["id"];

export interface AnimeEntry extends CatalogItem {
  /** Kitsu's format label: TV, Movie, ONA, OVA, Special, Music. */
  animeType?: string;
}

/**
 * Maps one Kitsu catalog item to the app's CatalogItem. Items without a usable
 * IMDb id are dropped: the details/watch routes resolve metadata through
 * Cinemeta, which only understands `tt…` ids.
 */
export function toAnimeEntry(raw: any): AnimeEntry | null {
  const imdbId = String(raw?.imdb_id ?? "").trim();
  if (!/^tt\d+$/.test(imdbId)) return null;

  const type: MetaType = raw?.type === "movie" ? "movie" : "series";
  const year = String(raw?.releaseInfo ?? raw?.year ?? "").trim();
  const genres = Array.isArray(raw?.genres)
    ? raw.genres.filter((g: unknown): g is string => typeof g === "string" && !!g.trim())
    : undefined;

  return {
    id: imdbId,
    type,
    name: String(raw?.name ?? "").trim() || imdbId,
    poster: typeof raw?.poster === "string" ? raw.poster : undefined,
    background: typeof raw?.background === "string" ? raw.background : undefined,
    year: year || undefined,
    rating: raw?.imdbRating ? String(raw.imdbRating) : undefined,
    description: typeof raw?.description === "string" ? raw.description : undefined,
    genres,
    sourceLabel: "Anime Kitsu",
    animeType: typeof raw?.animeType === "string" ? raw.animeType : undefined,
  };
}

/** Kitsu lists each season separately; keep the first entry per IMDb title. */
export function dedupeAnime(entries: AnimeEntry[]): AnimeEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const key = `${entry.type}:${entry.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
