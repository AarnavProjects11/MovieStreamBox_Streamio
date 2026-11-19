// Anime section data: fetch the four anime-only Kitsu catalogs in one server
// call. The add-on is resolved directly (like the Marvel chronology) so the
// app's movie/series catalog plumbing does not have to understand the
// add-on's `anime` type.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { baseAddonUrl } from "./addon-url";
import {
  ANIME_CATALOGS,
  ANIME_KITSU_MANIFEST,
  dedupeAnime,
  toAnimeEntry,
  type AnimeCatalogId,
  type AnimeEntry,
} from "./anime";

export interface AnimeCatalogResult {
  id: AnimeCatalogId;
  label: string;
  title: string;
  description: string;
  items: AnimeEntry[];
  error?: string;
}

export interface AnimeSectionResponse {
  addon: {
    name: string;
    version?: string;
    logo?: string;
    manifestUrl: string;
  };
  catalogs: AnimeCatalogResult[];
}

export const getAnimeCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ refresh: z.boolean().optional() }).parse(input ?? {}))
  .handler(async ({ data }): Promise<AnimeSectionResponse> => {
    const [{ resolveAddon, invalidateAddonManifest }, { fetchCatalog }] = await Promise.all([
      import("./addons.server"),
      import("./stremio.server"),
    ]);

    if (data.refresh) invalidateAddonManifest(ANIME_KITSU_MANIFEST);

    const addon = await resolveAddon(ANIME_KITSU_MANIFEST);
    if (!addon) {
      throw new Error(
        "The Anime Kitsu add-on could not be reached. Check the connection and try again.",
      );
    }

    const base = baseAddonUrl(addon.manifestUrl);
    const catalogs = await Promise.all(
      ANIME_CATALOGS.map(async (catalog): Promise<AnimeCatalogResult> => {
        try {
          const raw = await fetchCatalog(base, "anime", catalog.id);
          const items = dedupeAnime(
            raw.map(toAnimeEntry).filter((entry): entry is AnimeEntry => entry !== null),
          );
          return { ...catalog, items };
        } catch (error) {
          return {
            ...catalog,
            items: [],
            error:
              error instanceof Error ? error.message : "This catalog is unavailable right now.",
          };
        }
      }),
    );

    return {
      addon: {
        name: addon.name,
        version: addon.version,
        logo: addon.logo,
        manifestUrl: addon.manifestUrl,
      },
      catalogs,
    };
  });
