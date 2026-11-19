// Port of AddonClient::normalize_manifest_url / base_addon_url (providers/addons/client.rs).
// Kept free of server-only imports so the add-on manager can normalise stored URLs too.
export function normalizeManifestUrl(raw: string): string {
  let url = String(raw ?? "").trim();
  if (/^stremio:\/\//i.test(url)) url = `https://${url.replace(/^stremio:\/\//i, "")}`;
  else if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const cut = url.search(/[?#]/);
  const base = cut === -1 ? url : url.slice(0, cut);
  const suffix = cut === -1 ? "" : url.slice(cut);
  if (!/\/manifest\.json$/i.test(base)) return `${base.replace(/\/+$/, "")}/manifest.json${suffix}`;
  return url;
}

/** The add-on root, with `/manifest.json` stripped. */
export function baseAddonUrl(manifestUrl: string): string {
  const normalized = normalizeManifestUrl(manifestUrl);
  const idx = normalized.toLowerCase().lastIndexOf("/manifest.json");
  return idx === -1 ? normalized.replace(/\/+$/, "") : normalized.slice(0, idx);
}

/**
 * Loopback and private-LAN add-ons are allowed over plain http: they never leave the
 * local network, and self-hosted Stremio add-ons commonly serve without TLS.
 */
export function isLocalAddonUrl(raw: string): boolean {
  let host: string;
  try {
    host = new URL(normalizeManifestUrl(raw)).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "[::1]" ||
    host === "::1"
  )
    return true;

  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!v4) return false;
  const a = Number(v4[1]);
  const b = Number(v4[2]);
  return (
    a === 127 ||
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}
