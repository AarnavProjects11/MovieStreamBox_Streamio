import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowRight, Play, Info, Puzzle, Shield, Sparkles, Lock } from "lucide-react";
import { getCatalogs } from "@/lib/movie-api/movies.functions";
import { PosterRow, ErrorState, GridSkeleton } from "@/components/browse/ui";
import { isAdultAddon, useAdultFlags, useAdultMode } from "@/lib/adult-flags";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";
import { NetflixRow } from "@/components/browse/netflix-row";
import type { CatalogItem } from "@/lib/movie-api/provider";

export const Route = createFileRoute("/_authenticated/browse/")({
  head: () => ({
    meta: [
      { title: "Browse — Stream Box" },
      { name: "description", content: "Discover popular movies and TV shows in Stream Box." },
      { property: "og:title", content: "Browse — Stream Box" },
      {
        property: "og:description",
        content: "Discover popular movies and TV shows in Stream Box.",
      },
    ],
  }),
  component: BrowseHome,
});

function BrowseHome() {
  const fetchCatalogs = useServerFn(getCatalogs);
  const adultMode = useAdultMode();
  const adultFlags = useAdultFlags();
  const { theme } = useTheme();
  const isNetflix = theme === "netflix";
  // Every row below comes from an installed add-on's own catalog list.
  const catalogs = useQuery({
    queryKey: ["catalogs"],
    queryFn: () => fetchCatalogs(),
    staleTime: 5 * 60_000,
  });
  const history = useQuery({
    queryKey: ["history", "recent"],
    queryFn: async () =>
      (
        await supabase
          .from("watch_history")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(12)
      ).data ?? [],
  });

  if (catalogs.isError)
    return (
      <ErrorState message={(catalogs.error as Error).message} onRetry={() => catalogs.refetch()} />
    );

  const addons = catalogs.data?.addons ?? [];
  // 18+ add-ons feed their own section, so their catalogs never reach the home rows.
  const adultManifests = new Set(
    addons
      .filter((a) => a.adult || isAdultAddon(a.manifestUrl, adultFlags))
      .map((a) => a.manifestUrl),
  );
  const rows = (catalogs.data?.rows ?? []).filter((r) => !adultManifests.has(r.manifestUrl));
  const hero = rows[0]?.items[0];
  const catalogAddons = addons.filter(
    (a) => a.enabled && a.providesCatalog && !adultManifests.has(a.manifestUrl),
  );

  if (isNetflix) {
    // Watch history is what the TV-style home shows as "Continue Watching".
    const continueWatching: CatalogItem[] = (history.data ?? [])
      .filter((h) => h.meta_id && h.title)
      .map((h) => ({
        id: h.meta_id,
        type: h.meta_type === "series" ? "series" : "movie",
        name: h.title,
        poster: h.poster ?? undefined,
      }));

    return (
      <div>
        <div className="nf-rows">
          {catalogs.isLoading && !rows.length && (
            <>
              <div className="nf-skeleton nf-skeleton--row" />
              <div className="nf-skeleton nf-skeleton--row" />
            </>
          )}

          {!catalogs.isLoading && !rows.length && (
            <div className="nf-empty">
              <p className="nf-empty__title">No catalog add-ons enabled</p>
              <p className="nf-empty__text">
                Browse rows come from your installed add-ons. Install one that provides a catalog to
                fill this page.
              </p>
              <Link to="/browse/addons" className="nf-btn">
                Manage add-ons
              </Link>
            </div>
          )}

          {!!continueWatching.length && (
            <NetflixRow title="Continue Watching" items={continueWatching} />
          )}

          {rows.map((r) => (
            <NetflixRow key={r.key} title={r.label} items={r.items} />
          ))}
        </div>

        {!!catalogAddons.length && (
          <p className="nf-credit">
            Browse catalogs provided by {catalogAddons.map((a) => a.name).join(", ")}.{" "}
            <Link to="/browse/addons">Manage add-ons</Link>
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {hero ? (
        <section className="relative -mx-4 -mt-6 overflow-hidden sm:mx-0 sm:rounded-3xl">
          <img
            src={hero.background ?? hero.poster}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />
          <div className="relative flex min-h-[320px] flex-col justify-end gap-3 p-6 sm:min-h-[420px] sm:p-10">
            <p className="text-xs uppercase tracking-[0.3em] text-primary">Trending now</p>
            <h1 className="max-w-2xl font-display text-4xl sm:text-6xl">{hero.name}</h1>
            <p className="line-clamp-3 max-w-xl text-sm text-muted-foreground">
              {hero.description}
            </p>
            <div className="flex gap-2">
              <Link
                to="/browse/watch/$type/$id"
                params={{ type: hero.type, id: hero.id }}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary focus-visible:scale-105"
              >
                <Play className="h-5 w-5 fill-current" /> Find streams
              </Link>
              <Link
                to={hero.type === "movie" ? "/browse/movie/$id" : "/browse/series/$id"}
                params={{ id: hero.id }}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/70 px-5 py-3 font-semibold focus-visible:ring-4 focus-visible:ring-primary"
              >
                <Info className="h-5 w-5" /> Details
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <div className="h-80 animate-pulse rounded-3xl bg-muted" />
      )}

      <div className={`grid gap-3 sm:grid-cols-2 ${adultMode ? "lg:grid-cols-3" : ""}`}>
        <Link
          to="/browse/marvel"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 outline-none transition-colors hover:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Shield className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg">Marvel chronology</span>
            <span className="block text-xs text-muted-foreground">
              Every MCU, X-Men, Sony and classic Marvel title in story order — with streams.
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
        <Link
          to="/browse/anime"
          className="group flex items-center gap-4 rounded-2xl border border-border bg-card p-4 outline-none transition-colors hover:border-primary/60 focus-visible:ring-4 focus-visible:ring-primary"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg">Anime, only</span>
            <span className="block text-xs text-muted-foreground">
              Trending, airing, popular and top-rated anime — with streams.
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
        {adultMode && (
          <Link
            to="/browse/adult"
            className="group flex items-center gap-4 rounded-2xl border border-pink-500/40 bg-card p-4 outline-none transition-colors hover:border-pink-500 focus-visible:ring-4 focus-visible:ring-pink-500"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-500/15 text-pink-500">
              <Lock className="h-6 w-6" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg">18+ section</span>
              <span className="block text-xs text-muted-foreground">
                Adult catalogs from the add-ons you marked 18+.
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-pink-500" />
          </Link>
        )}
      </div>

      {!!history.data?.length && (
        <section className="space-y-3">
          <h2 className="font-display text-xl tracking-wide">Continue watching</h2>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {history.data.map((h) => (
              <Link
                key={h.id}
                to="/browse/watch/$type/$id"
                params={{ type: h.meta_type, id: h.meta_id }}
                search={h.season ? { s: h.season, e: h.episode } : {}}
                className="w-56 shrink-0 overflow-hidden rounded-xl border border-border bg-card focus-visible:ring-4 focus-visible:ring-primary"
              >
                {h.poster && <img src={h.poster} alt="" className="h-28 w-full object-cover" />}
                <div className="p-2">
                  <p className="truncate text-sm font-semibold">{h.title}</p>
                  {h.season > 0 && (
                    <p className="text-xs text-muted-foreground">
                      S{h.season} · E{h.episode}
                    </p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {catalogs.isLoading && (
        <>
          <GridSkeleton n={6} />
          <GridSkeleton n={6} />
        </>
      )}

      {!catalogs.isLoading && !rows.length && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-6 text-center">
          <Puzzle className="mx-auto h-8 w-8 text-primary" />
          <p className="font-semibold">No catalog add-ons enabled</p>
          <p className="text-sm text-muted-foreground">
            Browse rows come from your installed add-ons. Install one that provides a catalog to
            fill this page.
          </p>
          <Link
            to="/browse/addons"
            className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary"
          >
            Manage add-ons
          </Link>
        </div>
      )}

      {rows.map((r) => (
        <PosterRow key={r.key} title={r.label} items={r.items} />
      ))}

      {!!catalogAddons.length && (
        <p className="text-xs text-muted-foreground">
          Browse catalogs provided by {catalogAddons.map((a) => a.name).join(", ")}.{" "}
          <Link to="/browse/addons" className="text-primary underline">
            Manage add-ons
          </Link>
        </p>
      )}
    </div>
  );
}
