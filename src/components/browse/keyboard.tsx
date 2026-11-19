// Web counterpart of MovieBox-TUI's keyboard/overlay layer
// (src/tui/app/keyboard.rs, src/tui/overlay.rs, src/tui/screens/help.rs).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Terminal, CornerDownLeft, Keyboard } from "lucide-react";
import { toast } from "sonner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getCatalogs } from "@/lib/movie-api/movies.functions";
import {
  COMMANDS,
  commandContext,
  findCommand,
  helpSections,
  isTypingContext,
  matchShortcut,
  suggestCommands,
  type BrowseCommand,
  type CommandContext,
} from "./commands";

type HandlerMap = Partial<Record<string, () => void>>;

interface KeyboardApi {
  register: (handlers: HandlerMap) => () => void;
  openPalette: () => void;
  openHelp: () => void;
}

const KeyboardContext = createContext<KeyboardApi | null>(null);

const EMPTY_CTX: CommandContext = {
  hasCatalogAddons: false,
  hasStreamAddons: false,
  hasLiveTv: false,
};

/** Pages use this to opt into single-key actions (favorite, download, refresh, …). */
export function useBrowseKeys(handlers: HandlerMap) {
  const api = useContext(KeyboardContext);
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!api) return;
    return api.register({
      favorite: () => ref.current.favorite?.(),
      download: () => ref.current.download?.(),
      refresh: () => ref.current.refresh?.(),
      clearQuery: () => ref.current.clearQuery?.(),
    });
  }, [api]);
}

const PAGE_STEP = 6;

function focusableElements(): HTMLElement[] {
  const root = document.querySelector("main") ?? document.body;
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => el.offsetParent !== null);
}

/** Linear focus movement — DOM order matches visual order for the grids and rows used here. */
function moveFocus(delta: number | "start" | "end") {
  const items = focusableElements();
  if (!items.length) return;
  const current = document.activeElement as HTMLElement | null;
  const index = current ? items.indexOf(current) : -1;

  if (delta === "start") {
    items[0].focus();
    items[0].scrollIntoView({ block: "nearest" });
    return;
  }
  if (delta === "end") {
    const last = items[items.length - 1];
    last.focus();
    last.scrollIntoView({ block: "nearest" });
    return;
  }
  const next =
    index === -1
      ? delta > 0
        ? 0
        : items.length - 1
      : Math.min(items.length - 1, Math.max(0, index + delta));
  items[next]?.focus();
  items[next]?.scrollIntoView({ block: "nearest" });
}

/** Clears a React-controlled input the way the TUI's Ctrl+U does. */
function clearFocusedInput() {
  const el = document.activeElement as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el || (el.tagName !== "INPUT" && el.tagName !== "TEXTAREA")) return false;
  const proto = el.tagName === "INPUT" ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(el, "");
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function overlayOpen() {
  return !!document.querySelector('[role="dialog"][data-state="open"]');
}

export function BrowseKeyboard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const handlers = useRef(new Set<HandlerMap>());

  const fetchCatalogs = useServerFn(getCatalogs);
  // Shares the browse pages' cached query, so the palette costs no extra request.
  const catalogs = useQuery({
    queryKey: ["catalogs"],
    queryFn: () => fetchCatalogs(),
    staleTime: 5 * 60_000,
  });
  const ctx = useMemo(
    () => (catalogs.data ? commandContext(catalogs.data.addons) : EMPTY_CTX),
    [catalogs.data],
  );

  const register = useCallback((map: HandlerMap) => {
    handlers.current.add(map);
    return () => handlers.current.delete(map);
  }, []);

  const run = useCallback(
    (command: BrowseCommand) => {
      setPaletteOpen(false);
      switch (command.effect.kind) {
        case "route":
          navigate({ to: command.effect.to as never });
          break;
        case "help":
          setHelpOpen(true);
          break;
        case "clear":
          for (const h of handlers.current) h.clearQuery?.();
          toast.success("Cleared");
          break;
        case "signout":
          supabase.auth.signOut().then(() => navigate({ to: "/auth" }));
          break;
      }
    },
    [navigate],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = matchShortcut(e);
      if (!action) return;

      const typing = isTypingContext(e.target);
      const overlay = overlayOpen();

      // Typing wins over single-letter shortcuts; Ctrl-combos are explicit so they pass.
      if (typing && !e.ctrlKey && !e.metaKey) return;
      if (overlay && action.type !== "help" && action.type !== "palette") return;
      if (e.ctrlKey || e.metaKey) {
        if (action.type === "cycleQuality") {
          // useBrowseSettings listens for this and re-broadcasts to every consumer.
          window.dispatchEvent(new CustomEvent("streambox:cycle-quality"));
          e.preventDefault();
          return;
        }
        if (action.type === "clearInput") {
          if (clearFocusedInput()) e.preventDefault();
          return;
        }
      }

      switch (action.type) {
        case "palette":
          e.preventDefault();
          setPaletteOpen((v) => !v);
          break;
        case "help":
          e.preventDefault();
          setHelpOpen((v) => !v);
          break;
        case "back":
          if (!overlay) {
            e.preventDefault();
            window.history.back();
          }
          break;
        case "favorite":
          for (const h of handlers.current) h.favorite?.();
          e.preventDefault();
          break;
        case "download":
          for (const h of handlers.current) h.download?.();
          e.preventDefault();
          break;
        case "refresh":
          for (const h of handlers.current) h.refresh?.();
          e.preventDefault();
          break;
        case "clearQuery":
          for (const h of handlers.current) h.clearQuery?.();
          e.preventDefault();
          break;
        case "move":
          e.preventDefault();
          moveFocus(action.direction === "down" || action.direction === "right" ? 1 : -1);
          break;
        case "page":
          e.preventDefault();
          moveFocus(action.direction === "down" ? PAGE_STEP : -PAGE_STEP);
          break;
        case "edges":
          e.preventDefault();
          moveFocus(action.to === "start" ? "start" : "end");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const api = useMemo<KeyboardApi>(
    () => ({
      register,
      openPalette: () => setPaletteOpen(true),
      openHelp: () => setHelpOpen(true),
    }),
    [register],
  );

  return (
    <KeyboardContext.Provider value={api}>
      {children}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} ctx={ctx} onRun={run} />
      <HelpOverlay open={helpOpen} onOpenChange={setHelpOpen} />
    </KeyboardContext.Provider>
  );
}

/** Button + hint shown in the browse header so the palette is discoverable on touch. */
export function CommandHint() {
  const api = useContext(KeyboardContext);
  return (
    <button
      type="button"
      onClick={() => api?.openPalette()}
      aria-label="Open command palette"
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border px-1.5 py-1.5 text-xs font-semibold focus-visible:ring-4 focus-visible:ring-primary"
    >
      <Terminal className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Commands</span>
      <kbd className="hidden rounded border border-border bg-card px-1 text-[10px] text-muted-foreground sm:inline">
        /
      </kbd>
    </button>
  );
}

function CommandPalette({
  open,
  onOpenChange,
  ctx,
  onRun,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ctx: CommandContext;
  onRun: (command: BrowseCommand) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Prefix matching, exactly like SlashCommand::suggest.
  const available = suggestCommands(query, ctx);
  const unavailable = COMMANDS.filter(
    (c) => !c.isAvailable(ctx) && c.name.startsWith(query.trim().toLowerCase()),
  );
  const typed = findCommand(query, ctx);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl gap-0 overflow-hidden p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Run a Stream Box command or jump to a screen.</DialogDescription>
        </DialogHeader>
        <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2">
          <CommandInput
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder="/settings, /browse, /help…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && typed?.available) onRun(typed.command);
            }}
          />
          <CommandList className="max-h-[340px]">
            <CommandEmpty>No matching command.</CommandEmpty>
            {!!available.length && (
              <CommandGroup heading="Commands">
                {available.map((c) => (
                  <CommandItem key={c.name} value={c.name} onSelect={() => onRun(c)}>
                    <Terminal className="text-primary" />
                    <span className="font-semibold">{c.name}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {c.description(ctx)}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {!!unavailable.length && (
              <CommandGroup heading="Unavailable">
                {unavailable.map((c) => (
                  <CommandItem key={c.name} value={c.name} disabled>
                    <Terminal className="opacity-40" />
                    <span className="font-semibold">{c.name}</span>
                    <span className="ml-2 truncate text-xs text-muted-foreground">
                      {c.unavailableReason ?? "Not available"}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <CornerDownLeft className="h-3.5 w-3.5" /> run
          </span>
          <span className="inline-flex items-center gap-1">
            <Keyboard className="h-3.5 w-3.5" /> ? for keybindings
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HelpOverlay({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const sections = helpSections();
  const half = Math.ceil(sections.length / 2);
  const columns = [sections.slice(0, half), sections.slice(half)];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Keyboard &amp; commands</DialogTitle>
          <DialogDescription>
            Stream Box keeps MovieBox-TUI's keyboard-first flow. Press{" "}
            <kbd className="rounded border border-border px-1">?</kbd> to toggle this panel.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          {columns.map((column, i) => (
            <div key={i} className="space-y-4">
              {column.map((section) => (
                <section key={section.title} className="space-y-1.5">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-primary">
                    {section.title}
                  </h3>
                  <ul className="space-y-1">
                    {section.rows.map((row) => (
                      <li
                        key={row.key + row.description}
                        className="flex items-baseline gap-3 text-sm"
                      >
                        <kbd className="min-w-[92px] shrink-0 rounded border border-border bg-card px-2 py-0.5 text-xs font-semibold">
                          {row.key}
                        </kbd>
                        <span className="text-muted-foreground">{row.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
