// Installed add-on loading — the web equivalent of MovieBox-TUI's config.rs add-on store
// plus cache.rs's manifest cache. Deliberately works with the existing `user_addons`
// table (manifest_url, name, enabled) so no schema change is required: each add-on's
// capabilities are resolved from its manifest and cached in process memory.
import type { SupabaseClient } from "@supabase/supabase-js";
import { CINEMETA, CORE_ADDON, DEFAULT_ADDONS, isCoreAddon, type ResolvedAddon } from "./provider";
import { isLocalAddonUrl, normalizeManifestUrl } from "./addon-url";
import { fetchManifest, manifestToAddon } from "./stremio.server";

const CACHE_TTL = 10 * 60 * 1000;
/** Failed manifests are retried sooner so a brief outage doesn't hide an add-on for long. */
const FAILURE_TTL = 60 * 1000;
const manifestCache = new Map<string, { at: number; addon: ResolvedAddon | null }>();

/** Fetches (and caches) an add-on manifest, mapped to the InstalledAddon shape. */
export async function resolveAddon(manifestUrl: string): Promise<ResolvedAddon | null> {
  const url = normalizeManifestUrl(manifestUrl);
  const hit = manifestCache.get(url);
  if (hit) {
    const ttl = hit.addon ? CACHE_TTL : FAILURE_TTL;
    if (Date.now() - hit.at < ttl) return hit.addon;
  }

  try {
    const addon = manifestToAddon(url, await fetchManifest(url));
    manifestCache.set(url, { at: Date.now(), addon });
    return addon;
  } catch {
    // Remember the failure briefly so a dead add-on doesn't slow every request.
    manifestCache.set(url, { at: Date.now(), addon: null });
    return null;
  }
}

export function invalidateAddonManifest(manifestUrl?: string) {
  if (manifestUrl) manifestCache.delete(normalizeManifestUrl(manifestUrl));
  else manifestCache.clear();
}

/**
 * Fetches a manifest for installation. Remote add-ons must be https; loopback/LAN
 * add-ons may be http, and a bare LAN address (normalised to https) is retried over
 * http because that is what self-hosted add-ons usually serve.
 */
export async function fetchAddonManifest(rawUrl: string): Promise<ResolvedAddon> {
  const url = normalizeManifestUrl(rawUrl);
  if (!/^https:\/\//i.test(url) && !isLocalAddonUrl(url))
    throw new Error("Manifest URL must use https (http is allowed for local add-ons)");

  try {
    return manifestToAddon(url, await fetchManifest(url));
  } catch (error) {
    if (!/^https:\/\//i.test(url) || !isLocalAddonUrl(url)) throw error;
    const httpUrl = `http://${url.slice("https://".length)}`;
    return manifestToAddon(httpUrl, await fetchManifest(httpUrl));
  }
}

interface AddonRow {
  manifest_url: string;
  name: string;
  enabled: boolean;
  adult?: boolean; // column may not exist yet — handled gracefully
}

/**
 * Every add-on for a user, enabled or not. Cinemeta is injected from code and is never
 * stored, mirroring `InstalledAddon::cinemeta_default()`.
 */
export async function loadUserAddons(supabase: SupabaseClient<any>): Promise<ResolvedAddon[]> {
  const { data, error } = await supabase
    .from("user_addons")
    .select("manifest_url, name, enabled, adult")
    .order("created_at");
  if (error) {
    // If the adult column doesn't exist yet, retry without it
    if (error.message.includes("adult")) {
      const { data: data2, error: error2 } = await supabase
        .from("user_addons")
        .select("manifest_url, name, enabled")
        .order("created_at");
      if (error2) throw new Error(error2.message);
      return loadUserAddonsFromRows((data2 ?? []) as AddonRow[]);
    }
    throw new Error(error.message);
  }

  return loadUserAddonsFromRows((data ?? []) as AddonRow[]);
}

async function loadUserAddonsFromRows(rows: AddonRow[]): Promise<ResolvedAddon[]> {
  const recommended = new Set(DEFAULT_ADDONS.map((a) => normalizeManifestUrl(a.manifest_url)));

  // The core add-on is never stored, but its manifest is resolved like any other so the
  // rows/names/extras below stay in sync with the live Cinemeta catalog list. If it is
  // unreachable we fall back to the hardcoded defaults.
  const [coreManifest, resolved] = await Promise.all([
    resolveAddon(CINEMETA),
    Promise.all(
      rows.map(async (row): Promise<ResolvedAddon | null> => {
        if (isCoreAddon(row.manifest_url)) return null; // already injected below
        const addon = await resolveAddon(row.manifest_url);
        const custom = !recommended.has(normalizeManifestUrl(row.manifest_url));
        if (!addon) {
          return {
            manifestUrl: normalizeManifestUrl(row.manifest_url),
            name: row.name || row.manifest_url,
            enabled: row.enabled,
            core: false,
            providesCatalog: false,
            providesMeta: false,
            providesStream: false,
            types: [],
            idPrefixes: [],
            catalogs: [],
            unreachable: true,
            custom,
            adult: row.adult ?? false,
          };
        }
        return {
          ...addon,
          name: addon.name || row.name,
          enabled: row.enabled,
          custom,
          adult: row.adult ?? false,
        };
      }),
    ),
  ]);

  const core: ResolvedAddon = coreManifest
    ? { ...coreManifest, enabled: true, core: true }
    : { ...CORE_ADDON };

  const seen = new Set<string>();
  return [core, ...(resolved.filter(Boolean) as ResolvedAddon[])].filter((a) => {
    if (seen.has(a.manifestUrl)) return false;
    seen.add(a.manifestUrl);
    return true;
  });
}

export async function loadEnabledAddons(supabase: SupabaseClient<any>): Promise<ResolvedAddon[]> {
  return (await loadUserAddons(supabase)).filter((a) => a.enabled);
}

/** Seeds the recommended add-ons when the user has none yet (idempotent). */
export async function ensureDefaultAddons(
  supabase: SupabaseClient<any>,
  userId: string,
): Promise<void> {
  const { count, error } = await supabase
    .from("user_addons")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error || count) return;
  await supabase.from("user_addons").upsert(
    DEFAULT_ADDONS.map((a) => ({ ...a, user_id: userId })),
    { onConflict: "user_id,manifest_url", ignoreDuplicates: true },
  );
}
