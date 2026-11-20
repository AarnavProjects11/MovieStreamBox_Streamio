import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Puzzle } from "lucide-react";
import { getCatalog, getCatalogs } from "@/lib/movie-api/movies.functions";
import { curatedCatalogPresets, GENRES, type MetaType } from "@/lib/movie-api/provider";
import { ErrorState, GridSkeleton, PosterGrid } from "./ui";
import { useBrowseKeys } from "./keyboard";

export function CatalogPage({ type, title }: { type: MetaType; title: string }) {
  const [genre, setGenre] = useState<string | undefined>();
  const fetchCatalogs = useServerFn(getCatalogs);
  const fetchCatalog = useServerFn(getCatalog);

  const catalogs = useQuery({
    queryKey: ["catalogs"],
    queryFn: () => fetchCatalogs(),
    staleTime: 5 * 60_000,
  });

  // The first catalog of this type declared by an enabled add-on.
  const preset = useMemo(() => {
    const addons = catalogs.data?.addons ?? [];
    return curatedCatalogPresets(addons, 12).find((p) => p.type === type);
  }, [catalogs.data, type]);

  const q = useInfiniteQuery({
    queryKey: ["catalog-inf", type, preset?.key, genre],
    enabled: !!preset,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      fetchCatalog({
        data: {
          type,
          addonUrl: preset!.manifestUrl,
          catalogId: preset!.catalogId,
          genre,
          skip: pageParam,
        },
      }),
    // Only offer pagination when the catalog actually declares a `skip` extra.
    getNextPageParam: (last, all) =>
      preset?.supportsSkip && last.length ? all.reduce((n, p) => n + p.length, 0) : undefined,
  });

  const items = q.data?.pages.flat() ?? [];
  // TUI keys: r refreshes the catalog, c clears the active genre filter.
  useBrowseKeys({ refresh: () => q.refetch(), clearQuery: () => setGenre(undefined) });
  const showGenreChips = !!preset && !preset.requiredExtras.some((e) => e.name === "genre");
  const genres = preset?.genreOptions.length ? preset.genreOptions : GENRES;
  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-4 py-2 text-sm font-semibold outline-none transition-colors ${active ? "bg-primary text-primary-foreground" : "glass text-foreground hover:bg-foreground/10"}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{title}</h1>
        {preset && (
          <p className="text-xs text-muted-foreground">
            {preset.label} · via {preset.addonName}
          </p>
        )}
      </div>

      {catalogs.isLoading && <GridSkeleton />}

      {!catalogs.isLoading && !preset && (
        <div className="surface space-y-3 rounded-2xl p-6 text-center">
          <Puzzle className="mx-auto h-8 w-8 text-primary" />
          <p className="font-semibold">No add-on offers a catalog for this</p>
          <p className="text-sm text-muted-foreground">
            Install an add-on that provides a {type === "movie" ? "movie" : "series"} catalog to
            browse here.
          </p>
        </div>
      )}

      {showGenreChips && (
        <div className="flex gap-2 overflow-x-auto pb-2">
          <button className={chip(!genre)} onClick={() => setGenre(undefined)}>
            Popular
          </button>
          {genres.map((g) => (
            <button key={g} className={chip(genre === g)} onClick={() => setGenre(g)}>
              {g}
            </button>
          ))}
        </div>
      )}

      {q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : q.isLoading && preset ? (
        <GridSkeleton />
      ) : (
        <PosterGrid items={items} />
      )}

      {q.hasNextPage && (
        <div className="flex justify-center">
          <button
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            className="btn-depth btn-depth--glass disabled:opacity-60"
          >
            {q.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
