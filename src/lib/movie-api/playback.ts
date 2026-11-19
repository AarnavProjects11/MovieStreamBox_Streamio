// Where a stream URL can actually be played.
//
// Add-on "streams" are often not media at all — they are store pages
// (netflix.com/title/…, app.primevideo.com/…, youtube.com/results?…). Handing
// one of those to a <video> element or to MX Player always fails, so every
// stream is classified before the UI offers a player.

/** ".mp4", ".m3u8" — a browser can decode these. */
const BROWSER_MEDIA = /\.(mp4|m3u8|m4v|webm|ogv)(\?|#|$)/i;

/** ".mkv", ".avi" — an external player can decode these, a browser cannot. */
const PLAYER_MEDIA = /\.(mkv|avi|mov|ts|flv|wmv|mp4|m3u8|m4v|webm|ogv)(\?|#|$)/i;

/** Hosts that serve the bytes of a media file rather than a page. */
const MEDIA_HOSTS =
  /(^|\.)(video-downloads\.googleusercontent\.com|drive\.google\.com|docs\.google\.com|stream\.telegram\.org|cdn\.[a-z0-9.-]+\.[a-z]{2,}|media\.hu-buster\.com)$/i;

export type PlaybackTarget = "browser" | "external" | "none";

/**
 * Classifies a URL:
 *  - "browser"  — a browser <video> can play it directly.
 *  - "external" — only an external player (MX Player, VLC) can play it.
 *  - "none"     — it is a landing/store page; the user has to open it.
 */
export function playbackTarget(url: string | null | undefined): PlaybackTarget {
  const value = String(url ?? "").trim();
  if (!/^https?:\/\//i.test(value)) return "none";

  // A URL with a query string but no media extension is a page.
  if (BROWSER_MEDIA.test(value)) return "browser";
  if (PLAYER_MEDIA.test(value)) return "external";

  try {
    const host = new URL(value).hostname;
    if (MEDIA_HOSTS.test(host)) return "external";
  } catch {
    return "none";
  }

  return "none";
}

/** True when a browser can play the URL in a <video> element. */
export function isBrowserPlayable(url: string | null | undefined): boolean {
  return playbackTarget(url) === "browser";
}

/** True when an external player can play the URL. */
export function isExternalPlayable(url: string | null | undefined): boolean {
  return playbackTarget(url) !== "none";
}
