import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { getAnimeCatalog } from "@/lib/movie-api/anime.functions";
import { ANIME_CATALOGS, ANIME_KITSU_MANIFEST, type AnimeCatalogId } from "@/lib/movie-api/anime";
import { ErrorState, PosterCard } from "@/components/browse/ui";

export const Route = createFileRoute("/_authenticated/browse/anime")({
  head: () => ({
    meta: [
      { title: "Anime — Stream Box" },
      {
        name: "description",
        content: "Trending, airing, popular and top-rated anime, with streams from 4KHDHub.",
      },
      { property: "og:title", content: "Anime — Stream Box" },
      {
        property: "og:description",
        content: "Trending, airing, popular and top-rated anime, with streams from 4KHDHub.",
      },
    ],
  }),
  component: AnimePage,
});

function AnimePage() {
  const fetchAnime = useServerFn(getAnimeCatalog);
  const [catalogId, setCatalogId] = useState<AnimeCatalogId>("kitsu-anime-trending");
  const [refreshNonce, setRefreshNonce] = useState(0);

  const q = useQuery({
    queryKey: ["anime-kitsu", refreshNonce],
    queryFn: () => fetchAnime({ data: { refresh: refreshNonce > 0 } }),
    staleTime: 10 * 60_000,
  });

  const active = q.data?.catalogs.find((c) => c.id === catalogId);
  const activeMeta = ANIME_CATALOGS.find((c) => c.id === catalogId) ?? ANIME_CATALOGS[0];
  const items = active?.items ?? [];
  const total = q.data?.catalogs.reduce((n, c) => n + c.items.length, 0) ?? 0;
  const refresh = () => setRefreshNonce((n) => n + 1);

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-transparent" />
        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-primary">
              <Sparkles className="h-4 w-4" /> Anime
            </p>
            <h1 className="font-display text-4xl sm:text-5xl">Anime, only</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Trending, airing, popular and top-rated anime from Kitsu&apos;s database. Open a title
              to find streams — 4KHDHub is checked alongside your installed add-ons.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 text-xs text-muted-foreground sm:items-end">
            {q.data?.addon.logo && (
              <img src={q.data.addon.logo} alt="" className="h-9 max-w-40 object-contain" />
            )}
            <p className="font-semibold text-foreground">
              {q.data?.addon.name ?? "Anime Kitsu"}
              {q.data?.addon.version ? ` v${q.data.addon.version}` : ""}
            </p>
            {q.data && (
              <p>
                {total} titles · {q.data.catalogs.length} catalogs
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

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        {ANIME_CATALOGS.map((c) => {
          const count = q.data?.catalogs.find((x) => x.id === c.id)?.items.length;
          const selected = catalogId === c.id;
          return (
            <button
              key={c.id}
              onClick={() => setCatalogId(c.id)}
              aria-pressed={selected}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-primary ${
                selected
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card hover:border-primary/50"
              }`}
            >
              {c.label}
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

      <div className="space-y-1">
        <h2 className="font-display text-2xl">{activeMeta.title}</h2>
        <p className="text-sm text-muted-foreground">{activeMeta.description}</p>
      </div>

      {q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={refresh} />
      ) : q.isLoading ? (
        <AnimeSkeleton />
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
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {items.map((item) => (
            <PosterCard key={`${item.type}:${item.id}`} item={item} caption={item.animeType} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Anime catalog and artwork from the{" "}
        <a
          href={q.data?.addon.manifestUrl ?? ANIME_KITSU_MANIFEST}
          target="_blank"
          rel="noreferrer"
          className="text-primary underline"
        >
          Anime Kitsu add-on
        </a>{" "}
        (Kitsu.io metadata, no streams). Streams are resolved by 4KHDHub and your installed add-ons
        when you open a title.
      </p>
    </div>
  );
}

function AnimeSkeleton({ n = 12 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="aspect-[2/3] animate-pulse rounded-xl bg-muted" />
          <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </div>
  );
}
