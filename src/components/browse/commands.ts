// Port of MovieBox-TUI's command + keyboard layer (src/tui/commands.rs, src/tui/app/keyboard.rs)
// onto the web app's routes. Pure and dependency-free so it can be exercised headlessly.
import type { ResolvedAddon } from "@/lib/movie-api/provider";

export interface CommandContext {
  /** At least one enabled add-on provides catalogs (the TUI's `streaming_enabled`). */
  hasCatalogAddons: boolean;
  /** At least one enabled add-on provides streams. */
  hasStreamAddons: boolean;
  /** An add-on declares a live-TV style catalog (the TUI's `is_tv_mode` / `tv_enabled`). */
  hasLiveTv: boolean;
}

export type CommandEffect =
  { kind: "route"; to: string } | { kind: "help" } | { kind: "clear" } | { kind: "signout" };

export interface BrowseCommand {
  /** e.g. "/settings" — the TUI's `SlashCommand::name()`. */
  name: string;
  /** Extra spellings accepted by `parse` (e.g. "/?" and "/quit"). */
  aliases?: string[];
  /** Port of `SlashCommand::description(state)` — some text depends on context. */
  description: (ctx: CommandContext) => string;
  effect: CommandEffect;
  /** Port of `SlashCommand::is_available(state)`. */
  isAvailable: (ctx: CommandContext) => boolean;
  /** Shown when the command is listed but unavailable. */
  unavailableReason?: string;
}

export const COMMANDS: BrowseCommand[] = [
  {
    name: "/settings",
    description: () => "Interactive preferences, content modes & configuration",
    effect: { kind: "route", to: "/browse/settings" },
    isAvailable: () => true,
  },
  {
    name: "/config",
    description: (ctx) =>
      ctx.hasLiveTv ? "Manage TV playlist sources" : "Manage Stremio add-on manifests",
    effect: { kind: "route", to: "/browse/addons" },
    isAvailable: () => true,
  },
  {
    name: "/browse",
    description: () => "Curated, rated & most-watched views",
    effect: { kind: "route", to: "/browse/movies" },
    isAvailable: (ctx) => ctx.hasCatalogAddons,
    unavailableReason: "No enabled add-on provides catalogs to browse.",
  },
  {
    name: "/history",
    description: () => "Watch history & resume",
    effect: { kind: "route", to: "/browse/history" },
    isAvailable: () => true,
  },
  {
    name: "/favorites",
    description: () => "Starred media library",
    effect: { kind: "route", to: "/browse/library" },
    isAvailable: () => true,
  },
  {
    name: "/clear",
    description: () => "Clear search results and return to landing",
    effect: { kind: "clear" },
    isAvailable: () => true,
  },
  {
    name: "/help",
    aliases: ["/?"],
    description: () => "Open interactive keybinding help menu",
    effect: { kind: "help" },
    isAvailable: () => true,
  },
  {
    name: "/list",
    description: () => "Show all TV channels",
    effect: { kind: "route", to: "/browse/movies" },
    isAvailable: (ctx) => ctx.hasLiveTv,
    unavailableReason: "Live TV needs an add-on that provides TV catalogs.",
  },
  {
    name: "/exit",
    aliases: ["/quit", "/q"],
    description: () => "Exit application and restore terminal",
    effect: { kind: "signout" },
    isAvailable: () => true,
  },
];

/** Port of `SlashCommand::suggest` — prefix match against available commands only. */
export function suggestCommands(query: string, ctx: CommandContext): BrowseCommand[] {
  const lower = String(query ?? "")
    .trim()
    .toLowerCase();
  return COMMANDS.filter((c) => c.isAvailable(ctx) && c.name.startsWith(lower));
}

/** Port of `SlashCommand::description_for`. */
export function describeCommand(suggestion: string, ctx: CommandContext): string | null {
  const trimmed = String(suggestion ?? "").trim();
  if (!trimmed.startsWith("/")) return null;
  return COMMANDS.find((c) => matches(c, trimmed))?.description(ctx) ?? null;
}

function matches(command: BrowseCommand, input: string) {
  const lower = input.toLowerCase();
  return (
    command.name.toLowerCase() === lower ||
    (command.aliases ?? []).some((a) => a.toLowerCase() === lower)
  );
}

/** Port of `SlashCommand::parse`, plus the availability check the TUI defers to its caller. */
export function findCommand(
  input: string,
  ctx: CommandContext,
): { command: BrowseCommand; available: boolean } | null {
  const trimmed = String(input ?? "").trim();
  if (!trimmed.startsWith("/")) return null;
  const command = COMMANDS.find((c) => matches(c, trimmed));
  if (!command) return null;
  return { command, available: command.isAvailable(ctx) };
}

/** Derives the palette's context from the user's installed add-ons. */
export function commandContext(addons: ResolvedAddon[]): CommandContext {
  const enabled = (addons ?? []).filter((a) => a.enabled);
  return {
    hasCatalogAddons: enabled.some((a) => a.providesCatalog),
    hasStreamAddons: enabled.some((a) => a.providesStream),
    hasLiveTv: enabled.some((a) => a.catalogs.some((c) => c.type === "tv" || c.type === "channel")),
  };
}

/* ------------------------------------------------------------------ *
 * Keyboard map (port of src/tui/app/keyboard.rs)
 * ------------------------------------------------------------------ */

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type BrowseAction =
  | { type: "palette" }
  | { type: "help" }
  | { type: "favorite" }
  | { type: "download" }
  | { type: "refresh" }
  | { type: "clearQuery" }
  | { type: "clearInput" }
  | { type: "cycleQuality" }
  | { type: "back" }
  | { type: "move"; direction: "up" | "down" | "left" | "right" }
  | { type: "page"; direction: "up" | "down" }
  | { type: "edges"; to: "start" | "end" };

/**
 * Maps a key event to an action. `/` opens the command palette (the TUI's slash input),
 * `?` toggles help, hjkl mirror the arrow keys, and ctrl+p cycles the preferred quality
 * where the TUI cycles the active provider.
 */
export function matchShortcut(e: KeyLike): BrowseAction | null {
  const key = e.key;
  const ctrl = e.ctrlKey || e.metaKey;

  if (ctrl) {
    if (key.toLowerCase() === "p") return { type: "cycleQuality" };
    if (key.toLowerCase() === "u") return { type: "clearInput" };
    return null;
  }
  if (e.altKey) return null;

  switch (key) {
    case "/":
      return { type: "palette" };
    case "?":
      return { type: "help" };
    case "Escape":
      return { type: "back" };
    case "f":
      return { type: "favorite" };
    case "d":
      return { type: "download" };
    case "r":
      return { type: "refresh" };
    case "c":
      return { type: "clearQuery" };
    case "j":
    case "ArrowDown":
      return { type: "move", direction: "down" };
    case "k":
    case "ArrowUp":
      return { type: "move", direction: "up" };
    case "h":
    case "ArrowLeft":
      return { type: "move", direction: "left" };
    case "l":
    case "ArrowRight":
      return { type: "move", direction: "right" };
    case "PageDown":
      return { type: "page", direction: "down" };
    case "PageUp":
      return { type: "page", direction: "up" };
    case "Home":
      return { type: "edges", to: "start" };
    case "End":
      return { type: "edges", to: "end" };
    default:
      return null;
  }
}

/** Actions that would hijack typing, so they must not fire while a field has focus. */
export function isTypingContext(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

/** Shortcut reference rendered by the help overlay (port of screens/help.rs). */
export interface HelpSection {
  title: string;
  rows: { key: string; description: string }[];
}

export function helpSections(): HelpSection[] {
  return [
    {
      title: "Navigation",
      rows: [
        { key: "\u2191 / \u2193, k / j", description: "Move between cards & rows" },
        { key: "\u2190 / \u2192, h / l", description: "Step across a row" },
        { key: "Tab / S-Tab", description: "Switch tabs, filters & panes" },
        { key: "Home / End", description: "Jump to first / last item" },
        { key: "PgUp / PgDn", description: "Scroll a page at a time" },
        { key: "Esc", description: "Go back or dismiss popups" },
      ],
    },
    {
      title: "Actions",
      rows: [
        { key: "Enter", description: "Activate the focused item" },
        { key: "f", description: "Favorite / unfavorite title" },
        { key: "d", description: "Download the best stream" },
        { key: "r", description: "Refresh active results" },
        { key: "c", description: "Clear the search query" },
        { key: "Ctrl+U", description: "Clear the focused input" },
        { key: "Ctrl+P", description: "Cycle preferred quality" },
      ],
    },
    {
      title: "Content Modes",
      rows: [
        { key: "catalogs", description: "Browse rows come from your installed add-ons" },
        { key: "streams", description: "Playback sources come from your stream add-ons" },
      ],
    },
    {
      title: "Commands & Shortcuts",
      rows: [
        { key: "/", description: "Open the command palette" },
        { key: "/settings", description: "Preferences & maintenance" },
        { key: "/config", description: "Manage Stremio add-on manifests" },
        { key: "/browse", description: "Browse add-on catalogs" },
        { key: "/history", description: "Watch history & resume" },
        { key: "/favorites", description: "Starred media library" },
        { key: "/clear", description: "Clear search query & results" },
        { key: "/exit", description: "Sign out (the TUI's /exit)" },
        { key: "?", description: "Toggle this help menu" },
      ],
    },
  ];
}
