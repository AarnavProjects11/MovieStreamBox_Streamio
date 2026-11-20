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
        <section className="scene">
          <div className="surface relative isolate overflow-hidden rounded-[26px] sm:rounded-[34px]">
            <img
              src={hero.background ?? hero.poster}
              alt=""
              className="absolute inset-0 h-full w-full scale-105 object-cover"
            />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(11,23,28,0.12)_0%,rgba(11,23,28,0.5)_52%,var(--color-background)_100%)]" />
            <div
              className="absolute inset-0 opacity-70"
              style={{ backgroundImage: "var(--hero-glow)" }}
              aria-hidden="true"
            />
            <div
              className="frame frame--handles pointer-events-none absolute inset-3 rounded-[18px] sm:inset-5 sm:rounded-[24px]"
              aria-hidden="true"
            />
            <div className="relative flex min-h-[420px] flex-col justify-end gap-4 p-6 pb-8 sm:min-h-[520px] sm:p-12">
              <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <span className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_14px_var(--ring)]" />
                Trending now
              </span>
              <h1 className="max-w-[16ch] text-balance font-display text-[clamp(2.1rem,7vw,4.6rem)] font-semibold leading-[0.94] tracking-[-0.035em]">
                {hero.name}
              </h1>
              <p className="line-clamp-3 max-w-[46ch] text-sm leading-relaxed text-muted-foreground sm:text-base">
                {hero.description}
              </p>
              <div className="mt-1 flex flex-wrap gap-2.5">
                <Link
                  to="/browse/watch/$type/$id"
                  params={{ type: hero.type, id: hero.id }}
                  className="btn-depth btn-depth--primary"
                >
                  <Play className="h-4 w-4 fill-current" /> Find streams
                </Link>
                <Link
                  to={hero.type === "movie" ? "/browse/movie/$id" : "/browse/series/$id"}
                  params={{ id: hero.id }}
                  className="btn-depth btn-depth--glass"
                >
                  <Info className="h-4 w-4" /> Details
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="h-80 animate-pulse rounded-[26px] bg-muted" />
      )}

      <div className={`grid gap-3 sm:grid-cols-2 ${adultMode ? "lg:grid-cols-3" : ""}`}>
        <Link
          to="/browse/marvel"
          className="surface group flex items-center gap-4 rounded-2xl p-4 outline-none transition-transform duration-300 hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/20 text-accent">
            <Shield className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-semibold">Marvel chronology</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              Every MCU, X-Men, Sony and classic Marvel title in story order, with streams.
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
        <Link
          to="/browse/anime"
          className="surface group flex items-center gap-4 rounded-2xl p-4 outline-none transition-transform duration-300 hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-semibold">Anime, only</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
              Trending, airing, popular and top-rated anime, with streams.
            </span>
          </span>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </Link>
        {adultMode && (
          <Link
            to="/browse/adult"
            className="surface group flex items-center gap-4 rounded-2xl p-4 outline-none transition-transform duration-300 hover:-translate-y-0.5 focus-visible:-translate-y-0.5"
          >
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-pink-500/15 text-pink-500">
              <Lock className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-base font-semibold">18+ section</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                Adult catalogs from the add-ons you marked 18+.
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-pink-500" />
          </Link>
        )}
      </div>

      {!!history.data?.length && (
        <section className="space-y-3">
          <h2 className="font-display text-lg font-semibold tracking-[-0.02em] sm:text-xl">
            Continue watching
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {history.data.map((h) => (
              <Link
                key={h.id}
                to="/browse/watch/$type/$id"
                params={{ type: h.meta_type, id: h.meta_id }}
                search={h.season ? { s: h.season, e: h.episode } : {}}
                className="surface w-56 shrink-0 overflow-hidden rounded-2xl transition-transform duration-300 hover:-translate-y-0.5"
              >
                {h.poster && <img src={h.poster} alt="" className="h-28 w-full object-cover" />}
                <div className="p-2.5">
                  <p className="truncate text-sm font-semibold">{h.title}</p>
                  {h.season > 0 && (
                    <p className="text-xs text-muted-foreground">
                      S{h.season} / E{h.episode}
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
