import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Film,
  LayoutGrid,
  List,
  Play,
  RefreshCw,
  Shield,
  Sparkles,
} from "lucide-react";
import { getMarvelCatalog } from "@/lib/movie-api/marvel.functions";
import {
  DEFAULT_MARVEL_SOURCE,
  MARVEL_SOURCES,
  getMarvelSource,
  type MarvelEntry,
} from "@/lib/movie-api/marvel";
import { ErrorState, PosterCard } from "@/components/browse/ui";

const SOURCE_STORAGE_KEY = "sb:marvel:source";

export const Route = createFileRoute("/_authenticated/browse/marvel")({
  head: () => ({
    meta: [
      { title: "Marvel chronological order — Stream Box" },
      {
        name: "description",
        content: "Every Marvel film and series in story order, with streams from 4KHDHub.",
      },
      { property: "og:title", content: "Marvel chronological order — Stream Box" },
      {
        property: "og:description",
        content: "Every Marvel film and series in story order, with streams from 4KHDHub.",
      },
    ],
  }),
  component: MarvelPage,
});

function MarvelPage() {
  const fetchMarvel = useServerFn(getMarvelCatalog);
  const [sourceId, setSourceId] = useState<string>(() => {
    if (typeof window === "undefined") return DEFAULT_MARVEL_SOURCE;
    try {
      return localStorage.getItem(SOURCE_STORAGE_KEY) || DEFAULT_MARVEL_SOURCE;
    } catch {
      return DEFAULT_MARVEL_SOURCE;
    }
  });
  const [universe, setUniverse] = useState<string>(
    () => getMarvelSource(sourceId).universes?.[0]?.id ?? "",
  );
  const [view, setView] = useState<"timeline" | "grid">("timeline");
  const [refreshNonce, setRefreshNonce] = useState(0);

  const source = getMarvelSource(sourceId);

  const q = useQuery({
    queryKey: ["marvel-chronology", sourceId, refreshNonce],
    queryFn: () => fetchMarvel({ data: { source: sourceId, refresh: refreshNonce > 0 } }),
    staleTime: 10 * 60_000,
  });

  // Follow the add-on's own tab list. This keeps working when a source declares
  // different (or differently named) catalogs.
  useEffect(() => {
    if (!q.data) return;
    const ids = q.data.universes.map((u) => u.id);
    if (!universe || !ids.includes(universe)) setUniverse(ids[0] ?? "");
  }, [q.data, universe]);

  const fallbackTabs =
    source.universes?.map((u) => ({ id: u.id, label: u.label })) ??
    ([] as { id: string; label: string }[]);
  const tabs = q.data?.universes.map((u) => ({ id: u.id, label: u.label })) ?? fallbackTabs;
  const active = q.data?.universes.find((u) => u.id === universe) ?? q.data?.universes[0];
  const items = active?.items ?? [];
  const total = q.data?.universes.reduce((n, u) => n + u.items.length, 0) ?? 0;
  const sourceError = q.isError ? (q.error as Error).message : q.data?.error;
  const refresh = () => setRefreshNonce((n) => n + 1);

  function chooseSource(id: string) {
    if (id === sourceId) return;
    setSourceId(id);
    setUniverse(getMarvelSource(id).universes?.[0]?.id ?? "");
    setRefreshNonce(0);
    try {
      localStorage.setItem(SOURCE_STORAGE_KEY, id);
    } catch {
      // Storage disabled — the choice still lasts for this session.
    }
  }

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-transparent" />
        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-primary">
              <Shield className="h-4 w-4" /> Marvel
            </p>
            <h1 className="font-display text-4xl sm:text-5xl">Chronological order</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Every Marvel film and series in story order, split by universe. Choose which Marvel
              add-on to browse, then open a title to find streams — 4KHDHub is checked alongside
              your installed add-ons.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 text-xs text-muted-foreground sm:items-end">
            {q.data?.addon.logo && (
              <img src={q.data.addon.logo} alt="" className="h-9 max-w-40 object-contain" />
            )}
            <p className="font-semibold text-foreground">
              {q.data?.addon.name ?? source.name}
              {q.data?.addon.version ? ` v${q.data.addon.version}` : ""}
            </p>
            {q.data && (
              <p>
                {total} titles · {q.data.universes.length} universes
              </p>
            )}
            <button
              onClick={refresh}
              disabled={q.isFetching}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-primary disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Add-on
        </span>
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          {MARVEL_SOURCES.map((s) => (
            <button
              key={s.id}
              onClick={() => chooseSource(s.id)}
              aria-pressed={sourceId === s.id}
              title={s.name}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-primary ${
                sourceId === s.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {q.isFetching && <span className="text-xs text-muted-foreground">Loading…</span>}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {tabs.map((u) => {
          const count = q.data?.universes.find((x) => x.id === u.id)?.items.length;
          const selected = (active?.id ?? universe) === u.id;
          return (
            <button
              key={u.id}
              onClick={() => setUniverse(u.id)}
              aria-pressed={selected}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-primary ${
                selected
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card hover:border-primary/50"
              }`}
            >
              {u.label}
              {count != null && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    selected
                      ? "bg-primary-foreground/20 text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h2 className="font-display text-2xl">{active?.title ?? source.name}</h2>
          <p className="text-sm text-muted-foreground">
            {active?.description || "Catalog from the selected Marvel add-on."}
          </p>
          <p className="text-xs text-muted-foreground/80">
            Ordered by the add-on's in-story chronology, not release date.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-card p-1">
          <button
            onClick={() => setView("timeline")}
            aria-pressed={view === "timeline"}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-primary ${
              view === "timeline"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-4 w-4" /> Timeline
          </button>
          <button
            onClick={() => setView("grid")}
            aria-pressed={view === "grid"}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-primary ${
              view === "grid"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <LayoutGrid className="h-4 w-4" /> Grid
          </button>
        </div>
      </div>

      {sourceError ? (
        <ErrorState message={sourceError} onRetry={refresh} />
      ) : q.isLoading ? (
        <TimelineSkeleton />
      ) : active?.error ? (
        <ErrorState message={active.error} onRetry={refresh} />
      ) : items.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-8 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-primary" />
          <p className="font-semibold">No titles in this catalog yet</p>
          <p className="text-sm text-muted-foreground">
            The add-on returned an empty catalog. Try refreshing in a moment.
          </p>
        </div>
      ) : view === "timeline" ? (
        <MarvelTimeline items={items} />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <PosterCard
              key={`${item.type}:${item.id}`}
              item={item}
              rank={item.rank}
              caption={item.era}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Chronology and artwork from the{" "}
        <a
          href={q.data?.source.manifestUrl ?? source.manifestUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline"
        >
          {q.data?.source.name ?? source.name} add-on
        </a>
        . Streams are resolved by 4KHDHub and your installed add-ons when you open a title.
      </p>
    </div>
  );
}

function EntryLink({
  item,
  className,
  children,
}: {
  item: MarvelEntry;
  className?: string;
  children: ReactNode;
}) {
  return item.type === "movie" ? (
    <Link to="/browse/movie/$id" params={{ id: item.id }} className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/browse/series/$id" params={{ id: item.id }} className={className}>
      {children}
    </Link>
  );
}

function MarvelTimeline({ items }: { items: MarvelEntry[] }) {
  return (
    <ol className="relative ml-3 space-y-3 border-l border-border pl-6">
      {items.map((item) => (
        <li key={`${item.type}:${item.id}`} className="relative">
          <span className="absolute -left-[2.375rem] top-4 flex h-7 w-7 items-center justify-center rounded-full border border-border bg-card text-[11px] font-bold text-primary">
            {item.rank}
          </span>
          <article className="flex gap-3 rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary/50">
            <EntryLink item={item} className="shrink-0">
              {item.poster ? (
                <img
                  src={item.poster}
                  alt={item.name}
                  loading="lazy"
                  className="h-28 w-20 rounded-lg object-cover"
                />
              ) : (
                <div className="flex h-28 w-20 items-center justify-center rounded-lg bg-muted">
                  <Film className="h-7 w-7 text-muted-foreground" />
                </div>
              )}
            </EntryLink>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <EntryLink
                  item={item}
                  className="font-semibold outline-none hover:text-primary focus-visible:ring-4 focus-visible:ring-primary"
                >
                  {item.name}
                </EntryLink>
                <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  {item.type === "series" ? "Series" : "Film"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[item.year, item.era].filter(Boolean).join(" · ") || "Chronology entry"}
              </p>
              {item.summary && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{item.summary}</p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Link
                  to="/browse/watch/$type/$id"
                  params={{ type: item.type, id: item.id }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-bold text-primary-foreground outline-none focus-visible:ring-4 focus-visible:ring-primary"
                >
                  <Play className="h-3.5 w-3.5 fill-current" /> Streams
                </Link>
                <EntryLink
                  item={item}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-primary"
                >
                  Details <ArrowRight className="h-3.5 w-3.5" />
                </EntryLink>
              </div>
            </div>
          </article>
        </li>
      ))}
    </ol>
  );
}

function TimelineSkeleton({ n = 8 }: { n?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-2xl border border-border bg-card p-3">
          <div className="h-28 w-20 animate-pulse rounded-lg bg-muted" />
          <div className="flex-1 space-y-2 py-1">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-full animate-pulse rounded bg-muted" />
            <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}
