// Marvel section data: fetch every catalog from the selected Marvel add-on in
// one server call. These add-ons are catalog-only, so they are resolved here
// directly instead of being added to the user's general catalog add-ons (which
// would flood the home page with Marvel rows).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getMarvelSource, toMarvelEntry, type MarvelEntry } from "./marvel";

export interface MarvelUniverseResult {
  /** Catalog id from the add-on. */
  id: string;
  label: string;
  title: string;
  description: string;
  items: MarvelEntry[];
  error?: string;
}

export interface MarvelCatalogResponse {
  source: {
    id: string;
    label: string;
    name: string;
    manifestUrl: string;
  };
  addon: {
    name: string;
    version?: string;
    description?: string;
    logo?: string;
    manifestUrl: string;
  };
  universes: MarvelUniverseResult[];
  /** Set when the selected add-on could not be reached at all. */
  error?: string;
}

interface CatalogTarget {
  id: string;
  type: string;
  label: string;
  title: string;
  description: string;
}

/** Turns the add-on's own catalog list into tabs, skipping search-only feeds. */
function discoverCatalogs(addon: {
  catalogs: {
    id: string;
    type: string;
    name?: string;
    extra?: { name: string; isRequired?: boolean }[];
  }[];
  name: string;
}): CatalogTarget[] {
  const list = addon.catalogs.filter(
    (c) => c.id && !(c.extra ?? []).some((e) => e.name === "search" && e.isRequired),
  );
  const seen = new Set<string>();
  return list
    .filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    })
    .map((c) => ({
      id: c.id,
      type: c.type,
      label: c.name?.trim() || c.id,
      title: c.name?.trim() || c.id,
      description: `Catalog published by ${addon.name}.`,
    }));
}

export const getMarvelCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ source: z.string().max(40).optional(), refresh: z.boolean().optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data }): Promise<MarvelCatalogResponse> => {
    const source = getMarvelSource(data.source);
    const [{ resolveAddon, invalidateAddonManifest }, { resolveAddonCatalogRaw }] =
      await Promise.all([import("./addons.server"), import("./stremio.server")]);

    // A failed manifest is cached briefly; an explicit refresh must clear it or
    // the Retry button would keep replaying the same failure.
    if (data.refresh) invalidateAddonManifest(source.manifestUrl);

    const addon = await resolveAddon(source.manifestUrl);
    if (!addon) {
      // Return a structured error rather than throwing: the picker must stay
      // usable so the other source can be selected.
      return {
        source: {
          id: source.id,
          label: source.label,
          name: source.name,
          manifestUrl: source.manifestUrl,
        },
        addon: { name: source.name, manifestUrl: source.manifestUrl },
        universes: [],
        error: `The ${source.name} add-on could not be reached (it may be temporarily down). Pick another source, or try Refresh in a moment.`,
      };
    }

    const targets: CatalogTarget[] = source.universes
      ? source.universes.map((u) => ({
          id: u.id,
          // Look up the real type in case the add-on changes it.
          type: addon.catalogs.find((c) => c.id === u.id)?.type ?? "movie",
          label: u.label,
          title: u.title,
          description: u.description,
        }))
      : discoverCatalogs(addon);

    const universes = await Promise.all(
      targets.map(async (target): Promise<MarvelUniverseResult> => {
        try {
          const items = await resolveAddonCatalogRaw(addon, target.type, target.id);
          return {
            id: target.id,
            label: target.label,
            title: target.title,
            description: target.description,
            items: items.map(toMarvelEntry),
          };
        } catch (error) {
          return {
            id: target.id,
            label: target.label,
            title: target.title,
            description: target.description,
            items: [],
            error:
              error instanceof Error ? error.message : "This catalog is unavailable right now.",
          };
        }
      }),
    );

    return {
      source: {
        id: source.id,
        label: source.label,
        name: addon.name || source.name,
        manifestUrl: addon.manifestUrl,
      },
      addon: {
        name: addon.name || source.name,
        version: addon.version,
        description: addon.description,
        logo: addon.logo,
        manifestUrl: addon.manifestUrl,
      },
      universes,
    };
  });
