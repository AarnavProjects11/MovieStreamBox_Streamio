import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { searchTitles } from "@/lib/movie-api/movies.functions";
import { ErrorState, GridSkeleton, PosterGrid } from "@/components/browse/ui";
import { useBrowseKeys } from "@/components/browse/keyboard";

export const Route = createFileRoute("/_authenticated/browse/search")({
  head: () => ({
    meta: [
      { title: "Search — Stream Box" },
      { name: "description", content: "Search movies and TV shows." },
      { property: "og:title", content: "Search — Stream Box" },
      { property: "og:description", content: "Search movies and TV shows." },
    ],
  }),
  // The Netflix navbar submits its query here as ?q=…
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  component: SearchPage,
});

function SearchPage() {
  const { q: initialQuery } = Route.useSearch();
  const [text, setText] = useState(initialQuery ?? "");
  const [q, setQ] = useState((initialQuery ?? "").trim());
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 400);
    return () => clearTimeout(t);
  }, [text]);
  // A new ?q= from the navbar replaces whatever is in the box.
  useEffect(() => {
    if (!initialQuery) return;
    setText(initialQuery);
    setQ(initialQuery.trim());
  }, [initialQuery]);
  const search = useServerFn(searchTitles);
  const r = useQuery({
    queryKey: ["search", q],
    queryFn: () => search({ data: { query: q } }),
    enabled: q.length > 1,
  });
  // TUI keys: c clears the query, r re-runs the search.
  useBrowseKeys({
    clearQuery: () => {
      setText("");
      setQ("");
    },
    refresh: () => r.refetch(),
  });
  return (
    <div className="space-y-6">
      <label className="flex items-center gap-3 rounded-2xl border-2 border-border bg-card px-4 py-3 focus-within:border-primary">
        <Search className="h-6 w-6 text-muted-foreground" />
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          inputMode="search"
          placeholder="Search movies and TV shows…"
          className="w-full bg-transparent text-lg outline-none"
        />
      </label>
      {q.length < 2 ? (
        <p className="text-center text-muted-foreground">Type at least 2 characters.</p>
      ) : r.isError ? (
        <ErrorState message={(r.error as Error).message} onRetry={() => r.refetch()} />
      ) : r.isLoading ? (
        <GridSkeleton n={6} />
      ) : (
        <>
          {!r.data?.movies.length && !r.data?.series.length && !r.data?.fourKHDHub.length && (
            <p className="text-center text-muted-foreground">No results for “{q}”.</p>
          )}
          {!!r.data?.movies.length && (
            <section className="space-y-3">
              <h2 className="font-display text-xl">Movies</h2>
              <PosterGrid items={r.data.movies} />
            </section>
          )}
          {!!r.data?.series.length && (
            <section className="space-y-3">
              <h2 className="font-display text-xl">TV Shows</h2>
              <PosterGrid items={r.data.series} />
            </section>
          )}
          {!!r.data?.fourKHDHub.length && (
            <section className="space-y-3">
              <h2 className="font-display text-xl">4KHDHub</h2>
              <p className="text-xs text-muted-foreground">
                Direct-download sources from 4KHDHub — open one to see its quality and size
                variants.
              </p>
              <PosterGrid items={r.data.fourKHDHub} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
