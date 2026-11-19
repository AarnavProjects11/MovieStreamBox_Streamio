/**
 * Per-device "this add-on is adult" flags.
 *
 * The `user_addons` table has no adult column, so the flag lives in
 * localStorage. Keys are stored as `sb:adult:<normalised manifest url>` —
 * splitting on ":" would break because manifest URLs contain a scheme.
 * A custom event keeps every mounted hook in sync without a page reload.
 */
import { useEffect, useState } from "react";
import { normalizeManifestUrl } from "./movie-api/addon-url";

const KEY_PREFIX = "sb:adult:";
/** Global gate: the user confirmed they are 18+ and want the section visible. */
const MODE_KEY = "sb:adult:mode";
export const ADULT_FLAGS_EVENT = "streambox:adult-flags";

function keyFor(manifestUrl: string) {
  return `${KEY_PREFIX}${normalizeManifestUrl(manifestUrl)}`;
}

export function loadAdultFlags(): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (typeof window === "undefined") return out;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(KEY_PREFIX) || key === MODE_KEY) continue;
      if (localStorage.getItem(key) === "1") out[key.slice(KEY_PREFIX.length)] = true;
    }
  } catch {
    // Private mode / storage disabled: the section simply stays hidden.
  }
  return out;
}

/** Has the user confirmed they are 18+ and turned the section on? */
export function isAdultMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setAdultMode(on: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (on) localStorage.setItem(MODE_KEY, "1");
    else localStorage.removeItem(MODE_KEY);
  } catch {
    // Ignore storage failures.
  }
  window.dispatchEvent(new CustomEvent(ADULT_FLAGS_EVENT));
}

/** Live view of the global 18+ mode; re-renders when it changes. */
export function useAdultMode(): boolean {
  // Seed from storage so the 18+ nav entry and gate do not flash off for a frame
  // before the effect reads localStorage.
  const [on, setOn] = useState<boolean>(() => isAdultMode());

  useEffect(() => {
    const sync = () => setOn(isAdultMode());
    sync();
    window.addEventListener(ADULT_FLAGS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ADULT_FLAGS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return on;
}

export function isAdultAddon(manifestUrl: string, flags = loadAdultFlags()): boolean {
  return flags[normalizeManifestUrl(manifestUrl)] === true;
}

export function setAdultFlag(manifestUrl: string, adult: boolean) {
  if (typeof window === "undefined") return;
  try {
    const key = keyFor(manifestUrl);
    if (adult) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    // Ignore storage failures — the UI still updates for this session.
  }
  window.dispatchEvent(new CustomEvent(ADULT_FLAGS_EVENT));
}

/** Live view of the adult flags; re-renders when any toggle changes. */
export function useAdultFlags(): Record<string, boolean> {
  // Seed from storage so flagged add-ons are filtered on the very first render
  // instead of flashing in a frame later.
  const [flags, setFlags] = useState<Record<string, boolean>>(() => loadAdultFlags());

  useEffect(() => {
    const sync = () => setFlags(loadAdultFlags());
    sync();
    window.addEventListener(ADULT_FLAGS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(ADULT_FLAGS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return flags;
}
