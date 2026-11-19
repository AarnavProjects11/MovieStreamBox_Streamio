// Movie API layer: the only surface the frontend talks to.
// Everything here is driven by the user's installed Stremio add-ons plus the
// built-in 4KHDHub provider, mirroring MovieBox-TUI's add-on provider
// (src/providers/addons/mod.rs) and its native scrapers.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { StreamSourceReport } from "./stremio.server";

const typeSchema = z.enum(["movie", "series"]);

const catalogInput = z.object({
  type: typeSchema,
  catalogId: z.string().max(80).optional(),
  addonUrl: z.string().max(1000).optional(),
  genre: z.string().max(60).optional(),
  skip: z.number().int().min(0).max(5000).optional(),
});

export const getCatalogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [
      { ensureDefaultAddons, loadEnabledAddons },
      { resolveCatalog },
      { curatedCatalogPresets },
    ] = await Promise.all([
      import("./addons.server"),
      import("./stremio.server"),
      import("./provider"),
    ]);
    // Seed the recommended add-ons so a fresh account lands on a populated
    // browse page instead of an empty one.
    await ensureDefaultAddons(context.supabase, context.userId);
    const addons = await loadEnabledAddons(context.supabase);
    const rows = await Promise.all(
      curatedCatalogPresets(addons).map(async (preset) => ({
        ...preset,
        items: await resolveCatalog(addons, preset.type, {
          addonUrl: preset.manifestUrl,
          catalogId: preset.catalogId,
        }).catch(() => []),
      })),
    );
    return { addons, rows: rows.filter((r) => r.items.length > 0) };
  });

export const getCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => catalogInput.parse(i))
  .handler(async ({ data, context }) => {
    const [{ loadEnabledAddons }, { resolveCatalog }] = await Promise.all([
      import("./addons.server"),
      import("./stremio.server"),
    ]);
    const addons = await loadEnabledAddons(context.supabase);
    return resolveCatalog(addons, data.type, {
      addonUrl: data.addonUrl,
      catalogId: data.catalogId,
      genre: data.genre,
      skip: data.skip,
    });
  });

/**
 * Fetches one catalog from one enabled add-on using the catalog's own declared
 * type. This is what powers sections outside the movie/series pair — notably
 * the 18+ section, whose add-ons publish catalogs under a type like `Porn`.
 */
export const getAddonCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        addonUrl: z.string().trim().min(4).max(1000),
        catalogType: z.string().trim().min(1).max(40),
        catalogId: z.string().trim().min(1).max(200),
        skip: z.number().int().min(0).max(5000).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const [{ loadEnabledAddons }, { resolveAddonCatalogRaw }, { normalizeManifestUrl }] =
      await Promise.all([
        import("./addons.server"),
        import("./stremio.server"),
        import("./addon-url"),
      ]);
    const addons = await loadEnabledAddons(context.supabase);
    const wanted = normalizeManifestUrl(data.addonUrl);
    const addon = addons.find((a) => a.manifestUrl === wanted);
    if (!addon) throw new Error("That add-on is not installed or is disabled.");
    const catalog = addon.catalogs.find(
      (c) => c.type === data.catalogType && c.id === data.catalogId,
    );
    if (!catalog) throw new Error("That add-on does not offer this catalog.");
    return resolveAddonCatalogRaw(addon, data.catalogType, data.catalogId, { skip: data.skip });
  });

export const searchTitles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ query: z.string().trim().min(1).max(100) }).parse(i))
  .handler(async ({ data, context }) => {
    const [
      { loadEnabledAddons },
      { searchCatalogAddons },
      { searchFourKHDHub, cardToCatalogItem },
    ] = await Promise.all([
      import("./addons.server"),
      import("./stremio.server"),
      import("./4khdhub.server"),
    ]);
    const addons = await loadEnabledAddons(context.supabase);

    // The add-on search and 4KHDHub are independent — one being down must not
    // hide the other.
    const [catalog, hub] = await Promise.all([
      searchCatalogAddons(addons, data.query),
      searchFourKHDHub(data.query).catch(() => []),
    ]);

    return {
      ...catalog,
      fourKHDHub: hub.map(cardToCatalogItem),
    };
  });

export const getDetails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ type: typeSchema, id: z.string().min(1).max(2000) }).parse(i))
  .handler(async ({ data, context }) => {
    const [
      { loadEnabledAddons },
      { resolveMeta },
      { isFourKHDHubId, fromFourKHDHubId, fetchFourKHDHubPost, postToMediaDetails },
    ] = await Promise.all([
      import("./addons.server"),
      import("./stremio.server"),
      import("./4khdhub.server"),
    ]);

    if (isFourKHDHubId(data.id)) {
      const post = await fetchFourKHDHubPost(fromFourKHDHubId(data.id));
      return postToMediaDetails(post);
    }

    const addons = await loadEnabledAddons(context.supabase);
    return resolveMeta(addons, data.type, data.id);
  });

export const getStreams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        type: typeSchema,
        id: z.string().min(1).max(2000),
        season: z.number().int().min(0).max(100).optional(),
        episode: z.number().int().min(0).max(10_000).optional(),
        /** Title name — lets 4KHDHub find the entry for an add-on title. */
        title: z.string().trim().max(200).optional(),
        year: z.string().trim().max(10).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const [
      { ensureDefaultAddons, loadEnabledAddons },
      { aggregateStreams, mergeStreams },
      { isFourKHDHubId, resolveFourKHDHubStreams },
    ] = await Promise.all([
      import("./addons.server"),
      import("./stremio.server"),
      import("./4khdhub.server"),
    ]);

    // Same first-run behaviour as the previous Cinemeta-only build: seed the
    // recommended add-ons, then aggregate streams from whatever is enabled.
    await ensureDefaultAddons(context.supabase, context.userId);
    const addons = await loadEnabledAddons(context.supabase);

    const fromHub = isFourKHDHubId(data.id);
    const addonStreams = fromHub
      ? { streams: [], errors: [], blocked: [], noStreamAddons: true, sources: [] }
      : await aggregateStreams(addons, data.type, data.id, data.season ?? 0, data.episode ?? 0);

    let hubStreams: Awaited<ReturnType<typeof resolveFourKHDHubStreams>> = [];
    let hubError: string | null = null;
    // 4KHDHub is a bonus source — it must never hold up the add-on streams.
    const hubController = new AbortController();
    const hubTimer = setTimeout(() => hubController.abort(), fromHub ? 12_000 : 6_000);
    try {
      hubStreams = await resolveFourKHDHubStreams({
        id: data.id,
        type: data.type,
        title: data.title,
        year: data.year,
        season: data.season ?? 0,
        signal: hubController.signal,
      });
    } catch (error) {
      if (!hubController.signal.aborted) {
        hubError = error instanceof Error ? error.message : "4KHDHub is unavailable";
      }
    } finally {
      clearTimeout(hubTimer);
    }

    const hubSource: StreamSourceReport = {
      addon: "4KHDHub",
      manifestUrl: "",
      custom: false,
      streams: hubStreams.length,
      rawCount: hubStreams.length,
      status: hubError ? "unavailable" : hubStreams.length ? "ok" : "empty",
      reason: hubError ?? (hubStreams.length ? undefined : "no matching release"),
    };

    return {
      streams: mergeStreams([...addonStreams.streams, ...hubStreams]),
      errors: [
        ...addonStreams.errors,
        ...(hubError ? [{ addon: "4KHDHub", error: hubError }] : []),
      ],
      blocked: addonStreams.blocked,
      noStreamAddons: !fromHub && addonStreams.noStreamAddons && hubStreams.length === 0,
      sources: [...addonStreams.sources, hubSource],
    };
  });

/** Every installed add-on (enabled or not) resolved against its manifest, for the manager UI. */
export const listAddons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({ refresh: z.boolean().optional() })
      .optional()
      .parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { loadUserAddons, invalidateAddonManifest } = await import("./addons.server");
    if (data?.refresh) invalidateAddonManifest();
    return loadUserAddons(context.supabase);
  });

/**
 * Installs a custom add-on from its manifest URL and returns the resolved add-on so the
 * caller can report exactly what it provides. Re-installing refreshes the name and
 * re-enables it instead of failing on the unique (user_id, manifest_url) row.
 */
export const installAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ url: z.string().url("Enter a valid manifest URL").trim().min(4).max(1000) }).parse(i))
  .handler(async ({ data, context }) => {
    const [
      { fetchAddonManifest, invalidateAddonManifest },
      { isCoreAddon },
      { normalizeManifestUrl },
    ] = await Promise.all([import("./addons.server"), import("./provider"), import("./addon-url")]);

    if (isCoreAddon(data.url)) throw new Error("Cinemeta is always built in.");

    const addon = await fetchAddonManifest(data.url);
    // The manifest was just fetched: store that result and drop any failure cached earlier.
    invalidateAddonManifest(addon.manifestUrl);

    const { error } = await context.supabase.from("user_addons").upsert(
      {
        user_id: context.userId,
        manifest_url: addon.manifestUrl,
        name: addon.name,
        enabled: true,
      },
      { onConflict: "user_id,manifest_url" },
    );
    if (error) throw new Error(error.message);

    return addon;
  });

export const inspectAddon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ url: z.string().url("Enter a valid manifest URL").trim().min(4).max(1000) }).parse(i))
  .handler(async ({ data }) => {
    const { fetchAddonManifest } = await import("./addons.server");
    return fetchAddonManifest(data.url);
  });

export const installDefaultAddons = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { DEFAULT_ADDONS } = await import("./provider");

    const rows = DEFAULT_ADDONS.map((a) => ({
      name: a.name,
      manifest_url: a.manifest_url,
      user_id: context.userId,
    }));
    const { error } = await context.supabase
      .from("user_addons")
      .upsert(rows, { onConflict: "user_id,manifest_url", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Best-effort mirror of the device-local adult flag into Supabase. The UI keeps
 * the flag in localStorage (the column may not exist), so a failure here must
 * never surface as "the toggle did nothing".
 */
export const toggleAddonAdult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ manifestUrl: z.string().trim().min(4).max(1000), adult: z.boolean() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_addons")
      // @ts-expect-error — the `adult` column is optional
      .update({ adult: data.adult })
      .eq("user_id", context.userId)
      .eq("manifest_url", data.manifestUrl);
    return { ok: true, persisted: !error };
  });
