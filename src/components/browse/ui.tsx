import { Link } from "@tanstack/react-router";
import { Star, Film, AlertTriangle } from "lucide-react";
import type { CatalogItem } from "@/lib/movie-api/provider";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Tilt3D } from "./depth";

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
      <div className="relative aspect-[2/3] overflow-hidden rounded-2xl bg-muted ring-1 ring-inset ring-white/10">
        {item.poster ? (
          <img
            src={item.poster}
            alt={item.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.06] group-focus-within:scale-[1.06]"
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Film className="h-10 w-10 text-muted-foreground" />
          </div>
        )}
        {rank != null && (
          <span className="tilt__layer absolute left-2 top-2 inline-flex min-w-6 items-center justify-center rounded-full bg-background/70 px-1.5 py-0.5 text-[11px] font-bold text-primary backdrop-blur">
            #{rank}
          </span>
        )}
        {item.rating && (
          <span className="tilt__layer absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-background/70 px-1.5 py-0.5 text-[11px] font-semibold backdrop-blur">
            <Star className="h-3 w-3 fill-primary text-primary" />
            {item.rating}
          </span>
        )}
        {item.sourceLabel && (
          <span className="tilt__layer absolute bottom-2 left-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold lowercase tracking-wide text-primary-foreground backdrop-blur">
            {item.sourceLabel}
          </span>
        )}
      </div>
      <div className="tilt__layer mt-2.5 px-0.5">
        <p className="truncate text-sm font-semibold tracking-[-0.01em]">{item.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {[item.year, caption].filter(Boolean).join(" / ")}
        </p>
      </div>
    </>
  );
  const cls = "group block rounded-2xl outline-none";
  return (
    <div className="scene">
      <Tilt3D className={cls}>
        {item.type === "movie" ? (
          <Link to="/browse/movie/$id" params={{ id: item.id }} className="block">
            {inner}
          </Link>
        ) : (
          <Link to="/browse/series/$id" params={{ id: item.id }} className="block">
            {inner}
          </Link>
        )}
      </Tilt3D>
    </div>
  );
}

export function PosterRow({ title, items }: { title: string; items: CatalogItem[] }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-lg font-semibold tracking-[-0.02em] sm:text-xl">{title}</h2>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-4 [scrollbar-width:thin]">
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
      {items.map((i) => (
        <PosterCard key={i.type + i.id} item={i} />
      ))}
    </div>
  );
}

export function GridSkeleton({ n = 12 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="aspect-[2/3] animate-pulse rounded-2xl bg-muted" />
      ))}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="surface flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
      <p className="text-sm">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-depth btn-depth--primary text-sm">
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
