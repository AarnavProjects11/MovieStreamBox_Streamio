// Webtor (self-hosted) — a TorBox-free way to stream torrents.
//
// The self-hosted image exposes an embeddable player (the same protocol as
// webtor.io's embed SDK): an iframe at `<base>/show?id=<id>&mode=video` that is
// then handed the magnet through postMessage. Nothing here needs an API key.
//
// Configure a server either at build time (`VITE_WEBTOR_URL`) or per device in
// Settings. See https://github.com/webtor-io/self-hosted for deployment.

import { useEffect, useState } from "react";

const STORAGE_KEY = "streambox.webtorUrl";
const EVENT = "streambox:webtor-url";

/** Build-time default; empty when the deployment does not ship one. */
export const DEFAULT_WEBTOR_URL = String(
  (import.meta.env as Record<string, string | undefined>)?.VITE_WEBTOR_URL ?? "",
).trim();

/**
 * Webtor builds stream/download links from its own origin, so keep only
 * `scheme://host` and drop any path, query or trailing slash.
 */
export function normalizeWebtorUrl(raw: string): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `${url.protocol}//${url.host}`;
  } catch {
    return "";
  }
}

export function getWebtorUrl(): string {
  if (typeof window === "undefined") return DEFAULT_WEBTOR_URL;
  try {
    const saved = normalizeWebtorUrl(localStorage.getItem(STORAGE_KEY) ?? "");
    return saved || DEFAULT_WEBTOR_URL;
  } catch {
    return DEFAULT_WEBTOR_URL;
  }
}

export function setWebtorUrl(raw: string): void {
  const url = normalizeWebtorUrl(raw);
  try {
    if (url) localStorage.setItem(STORAGE_KEY, url);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage disabled — the value still applies for this session via the event.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: url }));
  }
}

export function useWebtorUrl(): string {
  const [url, setUrl] = useState<string>(() => getWebtorUrl());

  useEffect(() => {
    setUrl(getWebtorUrl());
    const onCustom = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string") setUrl(detail || DEFAULT_WEBTOR_URL);
    };
    const onStorage = () => setUrl(getWebtorUrl());
    window.addEventListener(EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return url;
}

export type TorrentSource =
  { kind: "magnet"; value: string } | { kind: "torrentUrl"; value: string };

/**
 * Picks the torrent out of whatever a stream or library row carries. A magnet
 * wins; then a direct magnet URL; then a `.torrent` file URL; finally a bare
 * info hash stored as the original URL.
 */
export function torrentSourceOf(input: {
  magnet?: string | null;
  url?: string | null;
  originalUrl?: string | null;
}): TorrentSource | null {
  const magnet = String(input.magnet ?? "").trim();
  if (magnet.startsWith("magnet:")) return { kind: "magnet", value: magnet };

  const url = String(input.url ?? "").trim();
  if (url.startsWith("magnet:")) return { kind: "magnet", value: url };
  if (/\.torrent(\?|$)/i.test(url)) return { kind: "torrentUrl", value: url };

  const original = String(input.originalUrl ?? "").trim();
  if (original.startsWith("magnet:")) return { kind: "magnet", value: original };
  if (/\.torrent(\?|$)/i.test(original)) return { kind: "torrentUrl", value: original };
  // A bare info hash was stored before a magnet was built for it.
  if (/^[a-fA-F0-9]{40}$/.test(original)) {
    return { kind: "magnet", value: `magnet:?xt=urn:btih:${original}` };
  }
  if (/^[A-Z2-7]{32}$/.test(original)) {
    return { kind: "magnet", value: `magnet:?xt=urn:btih:${original}` };
  }
  return null;
}

/** True when the URL points at a torrent, not at a browser-playable file. */
export function isTorrentStream(input: { magnet?: string | null; url?: string | null }): boolean {
  return torrentSourceOf(input) !== null;
}
