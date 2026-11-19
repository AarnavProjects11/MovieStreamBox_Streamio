// Marvel Chronological add-on — metadata only. The add-on publishes one catalog
// per universe, already sorted by in-story chronology; streams still come from
// the watch page (4KHDHub plus any installed stream add-ons).
import type { CatalogItem } from "./provider";

export const MARVEL_ADDON_MANIFEST =
  "https://marvel-chrono-addon.houssam20.workers.dev/manifest.json";

/** The second Marvel catalog add-on people can switch to. */
export const MARVEL_GONP_MANIFEST = "https://addon-marvel.gonp.deno.net/manifest.json";

export interface MarvelSource {
  id: string;
  /** Short label for the source switcher. */
  label: string;
  /** Fallback display name, used before the manifest loads. */
  name: string;
  manifestUrl: string;
  /**
   * Known tab layout. When omitted, the tabs are discovered from the add-on's
   * own catalog list — so an add-on with different universes still works.
   */
  universes?: readonly MarvelUniverse[];
}

/** The five universes the add-on declares. `id` is also the catalog id. */
export const MARVEL_UNIVERSES = [
  {
    id: "mcu",
    label: "MCU",
    title: "Marvel Cinematic Universe",
    description: "Every MCU film and series, ordered by when it happens in the story.",
  },
  {
    id: "defenders",
    label: "Defenders & TV",
    title: "Defenders Saga & Marvel TV",
    description: "The street-level Netflix saga and Marvel's television era.",
  },
  {
    id: "xmen",
    label: "X-Men",
    title: "X-Men Universe",
    description: "The Fox mutant timeline, from 1845 to the animated revival.",
  },
  {
    id: "sony",
    label: "Spider-Man (Sony)",
    title: "Sony's Spider-Man Universe",
    description: "The Raimi and Amazing films, plus the Venom-verse.",
  },
  {
    id: "classic",
    label: "Classics",
    title: "Pre-MCU Classics",
    description: "Marvel's earlier film and TV adaptations, before the MCU.",
  },
] as const;

export type MarvelUniverse = (typeof MARVEL_UNIVERSES)[number];
export type MarvelUniverseId = MarvelUniverse["id"];

export const MARVEL_SOURCES: readonly MarvelSource[] = [
  {
    id: "chrono",
    label: "Chronological",
    name: "Marvel Chronological",
    manifestUrl: MARVEL_ADDON_MANIFEST,
    universes: MARVEL_UNIVERSES,
  },
  {
    id: "gonp",
    label: "Gonp",
    name: "Marvel (gonp)",
    manifestUrl: MARVEL_GONP_MANIFEST,
  },
];

export const DEFAULT_MARVEL_SOURCE = MARVEL_SOURCES[0].id;

export function getMarvelSource(id?: string): MarvelSource {
  return MARVEL_SOURCES.find((s) => s.id === id) ?? MARVEL_SOURCES[0];
}

export interface MarvelEntry extends CatalogItem {
  /** The add-on's 1-based position in the chronology. */
  rank: number;
  /** The in-story period, e.g. "1942–1945" or "2015–2018, Hell's Kitchen". */
  era?: string;
  /** The description without the "#1 in Marvel — …" header. */
  summary?: string;
}

/**
 * The add-on prefixes every description with its chronology header:
 * `#1 in Marvel — MCU (Chronological) — 1260 BC – 1896\n\n<summary>`.
 * Split that header off so the UI can show the rank and era without repeating
 * the add-on's own catalog name on every card.
 */
export function toMarvelEntry(item: CatalogItem, index: number): MarvelEntry {
  const raw = String(item.description ?? "").trim();
  const firstLine = raw.split(/\r?\n/)[0] ?? "";
  const rank = Number(firstLine.match(/^#\s*(\d+)/)?.[1]);

  // Add-ons other than the chronological one may ship a plain synopsis with no
  // "#1 in Marvel — …" header. Keep that text as the summary instead of
  // dropping the first paragraph.
  if (!Number.isFinite(rank) || rank <= 0) {
    return { ...item, rank: index + 1, summary: raw || undefined };
  }

  const parts = firstLine.split(" — ");
  const era = parts.length > 2 ? parts.slice(2).join(" — ").trim() : "";
  const summary = raw
    .split(/\r?\n\r?\n/)
    .slice(1)
    .join("\n\n")
    .trim();

  return {
    ...item,
    rank,
    era: era || undefined,
    summary: summary || undefined,
  };
}
