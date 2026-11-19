import { useSyncExternalStore } from "react";

export const THEMES = [
  { id: "system", label: "System default", swatches: ["#0a0a1a", "#fafafa", "#4f46e5", "#c9a84c"] },
  {
    id: "midnight",
    label: "Midnight Indigo",
    swatches: ["#0a0a1a", "#141432", "#1e1e5a", "#4f46e5"],
  },
  { id: "noir", label: "Noir & Gold", swatches: ["#0d0d0d", "#1a1a1a", "#c9a84c", "#f0d78c"] },
  { id: "mint", label: "Neon Mint", swatches: ["#0d1b2a", "#1b4332", "#2dd4a8", "#73ffb8"] },
  { id: "aurora", label: "Glass Aurora", swatches: ["#1a1a2e", "#16213e", "#4ade80", "#a78bfa"] },
  { id: "paper", label: "Paper (light)", swatches: ["#fafbfc", "#e8ecf1", "#94a3b8", "#3b82f6"] },
  { id: "netflix", label: "Netflix Red", swatches: ["#141414", "#181818", "#e50914", "#ffffff"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

/** Netflix is opt-in: the app keeps its previous default until the user picks it. */
const STORAGE_KEY = "streambox.theme";
const DEFAULT_THEME: ThemeId = "system";

function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

function prefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
}

function resolveTheme(t: ThemeId): Exclude<ThemeId, "system"> {
  if (t !== "system") return t;
  return prefersDark() ? "midnight" : "paper";
}

export function applyTheme(theme: ThemeId) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", resolveTheme(theme));
}

function readStored(): ThemeId {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isThemeId(saved) ? saved : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

/* ---------------------------------------------------------------- *
 * Shared store: every component that calls useTheme() sees the same
 * value, so switching themes in Settings updates the shell live.
 * ---------------------------------------------------------------- */

let currentTheme: ThemeId = DEFAULT_THEME;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ThemeId {
  return currentTheme;
}

function getServerSnapshot(): ThemeId {
  return DEFAULT_THEME;
}

if (typeof window !== "undefined") {
  currentTheme = readStored();
  applyTheme(currentTheme);

  // When the user is on "system", react to OS preference changes live.
  const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
  mq?.addEventListener?.("change", () => {
    if (currentTheme === "system") applyTheme("system");
  });
}

export function setTheme(next: ThemeId) {
  currentTheme = next;
  applyTheme(next);
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage disabled — the theme still applies for this session */
  }
  listeners.forEach((listener) => listener());
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { theme, setTheme };
}
