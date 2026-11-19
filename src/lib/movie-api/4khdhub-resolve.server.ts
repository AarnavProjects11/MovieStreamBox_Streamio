// Resolves a 4KHDHub download link into the final, directly-playable file URL.
//
// 4KHDHub hands out links that point at a redirector chain:
//
//   greenmotors.club/?id=<enc>  ->  greenmotors.cc/homelander/  ->  hubcloud.ist/drive/<id>
//     ->  gamerxyt.com/hubcloud.php  ->  pixel.hubcloud.ist  ->  cryptonewz.online/dl.php?link=<file>
//
// The first hop hides its target in a payload that is base64 -> base64 -> ROT13 ->
// base64 -> JSON -> base64. Everything after that is plain HTML or a 302, so the
// whole chain can be walked server-side and handed to MX Player / VLC as a real
// file URL instead of a landing page.
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const TIMEOUT = 10_000;

/** How long a resolved link stays cached. */
const CACHE_TTL = 30 * 60 * 1000;

const resolvedCache = new Map<string, { at: number; value: ResolvedDownload | null }>();

export interface ResolvedDownload {
  /** The direct media URL. */
  url: string;
  /** The file name the host publishes, e.g. "Movie.2024.2160p.mkv". */
  filename?: string;
  /** The landing page the direct URL came from. */
  source?: string;
}

/** ROT13 over ASCII letters — the middle step of the redirector's payload. */
function rot13(input: string): string {
  return input.replace(/[a-zA-Z]/g, (c) => {
    const code = c.charCodeAt(0);
    const upper = c <= "Z";
    const plus = upper ? code <= 77 : code <= 109;
    return String.fromCharCode(code + (plus ? 13 : -13));
  });
}

/** base64 -> base64 -> ROT13 -> base64 -> JSON. */
function decodeRedirectorPayload(payload: string): { o?: string; l?: string } | null {
  try {
    let s = atob(payload);
    s = atob(s);
    s = rot13(s);
    s = atob(s);
    const parsed = JSON.parse(s);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchText(url: string, referer?: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        ...(referer ? { Referer: referer } : {}),
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** True when the URL points at 4KHDHub's download redirector. */
export function isRedirectorUrl(url: string): boolean {
  return /^https?:\/\/greenmotors\./i.test(String(url ?? ""));
}

/**
 * Walks the redirector chain and returns the final media URL.
 * Several landing URLs can be passed — the same file is often published on more
 * than one mirror, and only some of them can be resolved without an account.
 * Returns null when no candidate resolves.
 */
export async function resolveFourKHDHubDownload(
  landingUrl: string | string[],
): Promise<ResolvedDownload | null> {
  const candidates = (Array.isArray(landingUrl) ? landingUrl : [landingUrl]).filter(
    (u): u is string => !!u && isRedirectorUrl(u),
  );
  if (!candidates.length) return null;

  const key = candidates.join("|");
  const cached = resolvedCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.value;

  let value: ResolvedDownload | null = null;
  for (const candidate of candidates) {
    try {
      value = await walkChain(candidate);
    } catch {
      value = null;
    }
    if (value) break;
  }

  resolvedCache.set(key, { at: Date.now(), value });
  return value;
}

async function walkChain(landingUrl: string): Promise<ResolvedDownload | null> {
  const id = new URL(landingUrl).searchParams.get("id");
  if (!id) return null;

  // 1) The redirector hands its payload to the landing page through localStorage.
  const hop = await fetchText(`https://greenmotors.club/?id=${encodeURIComponent(id)}`);
  const payload = hop.match(/s\('o','([^']+)'/)?.[1];
  if (!payload) return null;

  const meta = decodeRedirectorPayload(payload);
  if (!meta?.o) return null;

  const hostUrl = atob(meta.o);

  // 2) Only the HubCloud chain is walkable without a session — HubDrive's API
  //    answers "Not signed in". Mirrors of the same file are tried in turn.
  if (!/hubcloud\.ist/i.test(hostUrl)) return null;

  const driveHtml = await fetchText(hostUrl);
  const filename =
    driveHtml
      .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
      ?.replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim() ||
    driveHtml
      .match(/class="file-title"[^>]*>([\s\S]*?)<\/div>/)?.[1]
      ?.replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // 3) The page publishes a "generate direct link" URL in plain HTML.
  const generator = driveHtml.match(/https:\/\/gamerxyt\.com\/hubcloud\.php\?[^"'\s<>]+/)?.[0];
  if (!generator) return null;

  const generatorHtml = await fetchText(generator, hostUrl);

  // 4) The generator now publishes the file itself on Cloudflare R2: either as
  //    hub2/<original filename>.mkv, or as an opaque hub/<id> object served with
  //    an attachment disposition carrying the real filename. Both are signed
  //    and directly playable, so take the first one on the page.
  const r2 = findR2File(generatorHtml);
  if (r2) return { url: r2, filename: filename || filenameFromUrl(r2), source: landingUrl };

  // 5) Older generator pages hand off through pixel -> cryptonewz.online/
  //    dl.php?link=<file>, a plain redirect that carries the file in its query.
  const pixel = generatorHtml.match(/https:\/\/pixel\.hubcloud\.ist\/\?id=[^"'\s<>]+/)?.[0];
  if (!pixel) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(pixel, {
      signal: controller.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html,*/*", Referer: hostUrl },
    });
    const direct = new URL(res.url).searchParams.get("link");
    if (!direct || !/^https?:\/\//i.test(direct)) return null;
    return { url: direct, filename: filename || undefined, source: landingUrl };
  } finally {
    clearTimeout(timer);
  }
}

/** The filename a signed R2 URL points at, when it carries one in its path. */
function filenameFromUrl(url: string): string | undefined {
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
    return /\.[a-z0-9]{2,5}$/i.test(name) ? name : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Pulls the first direct media URL out of a generator page. Newer pages embed
 * the file as `hub2/<name>.mkv`; some publish the opaque `hub/<id>` variant
 * instead. Entities are decoded first because the URLs sit inside JS strings.
 */
function findR2File(html: string): string | null {
  const decoded = html.replace(/&amp;/g, "&");
  const withName = decoded.match(
    /https:\/\/[a-z0-9-]+\.r2\.cloudflarestorage\.com\/hub2\/[^"'\s<>]+/i,
  )?.[0];
  if (withName) return withName;
  const opaque = decoded.match(
    /https:\/\/[a-z0-9-]+\.r2\.cloudflarestorage\.com\/hub\/[^"'\s<>]+/i,
  )?.[0];
  return opaque ?? null;
}
