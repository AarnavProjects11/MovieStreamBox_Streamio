import { Link } from "@tanstack/react-router";
import { Star, Film, AlertTriangle } from "lucide-react";
import type { CatalogItem } from "@/lib/movie-api/provider";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export function PosterCard({
  item,
  rank,
  caption,
}: {
  item: CatalogItem;
  /** Optional chronology position, shown as a badge in the poster's top-left. */
  rank?: number;
  /** Optional line under the year, e.g. the Marvel add-on's in-story era. */
  caption?: string;
}) {
  const inner = (
    <>
      <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-muted">
        {item.poster ? (
          <img
            src={item.poster}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 group-focus-visible:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Film className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
        {rank != null && (
          <span className="absolute left-2 top-2 inline-flex min-w-6 items-center justify-center rounded-md bg-background/80 px-1.5 py-0.5 text-xs font-bold text-primary backdrop-blur">
            #{rank}
          </span>
        )}
        {item.rating && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-background/80 px-1.5 py-0.5 text-xs font-semibold backdrop-blur">
            <Star className="h-3 w-3 fill-primary text-primary" />
            {item.rating}
          </span>
        )}
        {item.sourceLabel && (
          <span className="absolute bottom-2 left-2 rounded-md bg-primary/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary-foreground backdrop-blur">
            {item.sourceLabel}
          </span>
        )}
      </div>
      <p className="mt-2 truncate text-sm font-semibold">{item.name}</p>
      <p className="truncate text-xs text-muted-foreground">
        {[item.year, caption].filter(Boolean).join(" · ")}
      </p>
    </>
  );
  const cls =
    "group block rounded-xl p-1 outline-none transition-transform focus-visible:scale-[1.06] focus-visible:ring-4 focus-visible:ring-primary";
  return item.type === "movie" ? (
    <Link to="/browse/movie/$id" params={{ id: item.id }} className={cls}>
      {inner}
    </Link>
  ) : (
    <Link to="/browse/series/$id" params={{ id: item.id }} className={cls}>
      {inner}
    </Link>
  );
}

export function PosterRow({ title, items }: { title: string; items: CatalogItem[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl tracking-wide">{title}</h2>
      <div className="-mx-1 flex gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]">
        {items.map((i) => (
          <div key={i.id} className="w-32 shrink-0 sm:w-40">
            <PosterCard item={i} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function PosterGrid({ items }: { items: CatalogItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((i) => (
        <PosterCard key={i.type + i.id} item={i} />
      ))}
    </div>
  );
}

export function GridSkeleton({ n = 12 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export type BrowseSettings = {
  player: "browser" | "mx" | "vlc";
  quality: "any" | "2160p" | "1080p" | "720p";
};
const KEY = "streambox.browseSettings";
const DEFAULTS: BrowseSettings = { player: "browser", quality: "any" };
// Ctrl+P cycles the preferred quality, the web counterpart of the TUI's Ctrl+P provider cycle.
const QUALITY_CYCLE: BrowseSettings["quality"][] = ["any", "2160p", "1080p", "720p"];
const SETTINGS_EVENT = "streambox:browse-settings";
const CYCLE_EVENT = "streambox:cycle-quality";
const QUALITY_LABEL: Record<BrowseSettings["quality"], string> = {
  any: "Best available",
  "2160p": "4K",
  "1080p": "1080p",
  "720p": "720p",
};

function readSettings(): BrowseSettings {
  try {
    const v = localStorage.getItem(KEY);
    return v ? { ...DEFAULTS, ...(JSON.parse(v) as Partial<BrowseSettings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function useBrowseSettings() {
  const [s, setS] = useState<BrowseSettings>(DEFAULTS);

  useEffect(() => {
    setS(readSettings());
    const onSettings = (e: Event) => {
      const detail = (e as CustomEvent<BrowseSettings>).detail;
      if (detail) setS(detail);
    };
    const onCycle = () => {
      const current = readSettings();
      const next: BrowseSettings = {
        ...current,
        quality: QUALITY_CYCLE[(QUALITY_CYCLE.indexOf(current.quality) + 1) % QUALITY_CYCLE.length],
      };
      localStorage.setItem(KEY, JSON.stringify(next));
      setS(next);
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: next }));
      toast(`Preferred quality: ${QUALITY_LABEL[next.quality]}`);
    };
    window.addEventListener(SETTINGS_EVENT, onSettings);
    window.addEventListener(CYCLE_EVENT, onCycle);
    return () => {
      window.removeEventListener(SETTINGS_EVENT, onSettings);
      window.removeEventListener(CYCLE_EVENT, onCycle);
    };
  }, []);

  const update = (p: Partial<BrowseSettings>) => {
    setS((cur) => {
      const n = { ...cur, ...p };
      localStorage.setItem(KEY, JSON.stringify(n));
      window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: n }));
      return n;
    });
  };
  return [s, update] as const;
}

export function intentHref(url: string, pkg: string) {
  const stripped = url.replace(/^https?:\/\//, "");
  const scheme = url.startsWith("https") ? "https" : "http";
  return `intent://${stripped}#Intent;scheme=${scheme};action=android.intent.action.VIEW;package=${pkg};type=video/*;end`;
}
