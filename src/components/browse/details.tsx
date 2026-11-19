import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Play, Bookmark, BookmarkCheck, Star } from "lucide-react";
import { toast } from "sonner";
import { getDetails } from "@/lib/movie-api/movies.functions";
import type { MetaType } from "@/lib/movie-api/provider";
import { supabase } from "@/integrations/supabase/client";
import { ErrorState } from "./ui";
import { useBrowseKeys } from "./keyboard";
import { SeriesDownloads } from "./series-downloads";

export function DetailsPage({ type, id }: { type: MetaType; id: string }) {
  const fetchDetails = useServerFn(getDetails);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["details", type, id],
    queryFn: () => fetchDetails({ data: { type, id } }),
  });
  const saved = useQuery({
    queryKey: ["library-has", id],
    queryFn: async () =>
      !!(await supabase.from("library_items").select("id").eq("meta_id", id).maybeSingle()).data,
  });
  const [season, setSeason] = useState<number | null>(null);
  const d = q.data;
  const activeSeason = season ?? d?.seasons[0] ?? 1;
  const eps = useMemo(
    () => d?.episodes.filter((e) => e.season === activeSeason) ?? [],
    [d, activeSeason],
  );
  // TUI keys: f favorites the title, r refreshes the pane.
  useBrowseKeys({ favorite: toggleLibrary, refresh: () => q.refetch() });

  async function toggleLibrary() {
    if (!d) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    if (saved.data) {
      await supabase.from("library_items").delete().eq("meta_id", id);
      toast.success("Removed from Library");
    } else {
      const { error } = await supabase.from("library_items").insert({
        user_id: u.user.id,
        meta_id: id,
        meta_type: type,
        title: d.name,
        poster: d.poster ?? null,
      });
      if (error) return toast.error(error.message);
      toast.success("Saved to Library");
    }
    qc.invalidateQueries({ queryKey: ["library-has", id] });
    qc.invalidateQueries({ queryKey: ["library"] });
  }

  if (q.isError)
    return <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />;
  if (!d) return <div className="h-96 animate-pulse rounded-3xl bg-muted" />;

  return (
    <div className="space-y-8">
      <section className="relative -mx-4 -mt-6 overflow-hidden sm:mx-0 sm:rounded-3xl">
        {d.background && (
          <img src={d.background} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
        <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:p-10">
          {d.poster && (
            <img
              src={d.poster}
              alt={d.name}
              className="w-40 shrink-0 rounded-2xl shadow-2xl sm:w-56"
            />
          )}
          <div className="space-y-3">
            {d.logo ? (
              <img src={d.logo} alt={d.name} className="max-h-24 max-w-xs object-contain" />
            ) : (
              <h1 className="font-display text-4xl">{d.name}</h1>
            )}
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {d.sourceLabel && (
                <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-primary-foreground">
                  {d.sourceLabel}
                </span>
              )}
              {d.year && <span>{d.year}</span>}
              {d.runtime && <span>{d.runtime}</span>}
              {d.rating && (
                <span className="inline-flex items-center gap-1">
                  <Star className="h-4 w-4 fill-primary text-primary" />
                  {d.rating}
                </span>
              )}
              {d.genres?.slice(0, 4).map((g) => (
                <span key={g} className="rounded-full border border-border px-2 py-0.5">
                  {g}
                </span>
              ))}
            </div>
            <p className="max-w-2xl text-sm leading-relaxed">{d.description}</p>
            {!!d.cast?.length && (
              <p className="text-xs text-muted-foreground">
                <b>Cast:</b> {d.cast.slice(0, 6).join(", ")}
              </p>
            )}
            {!!d.director?.length && (
              <p className="text-xs text-muted-foreground">
                <b>Director:</b> {d.director.join(", ")}
              </p>
            )}
            <div className="flex flex-wrap gap-2 pt-2">
              {type === "movie" && (
                <Link
                  to="/browse/watch/$type/$id"
                  params={{ type, id }}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary focus-visible:scale-105"
                >
                  <Play className="h-5 w-5 fill-current" /> Find streams
                </Link>
              )}
              {type === "series" && d?.seasons?.length && (
                <Link
                  to="/browse/watch/$type/$id"
                  params={{ type: "series", id }}
                  search={{ s: d.seasons[0], e: 1 }}
                  className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary focus-visible:scale-105"
                >
                  <Play className="h-5 w-5 fill-current" /> Find streams
                </Link>
              )}
              <button
                onClick={toggleLibrary}
                className="inline-flex items-center gap-2 rounded-lg border border-border bg-card/70 px-5 py-3 font-semibold focus-visible:ring-4 focus-visible:ring-primary"
              >
                {saved.data ? (
                  <BookmarkCheck className="h-5 w-5 text-primary" />
                ) : (
                  <Bookmark className="h-5 w-5" />
                )}
                {saved.data ? "In Library" : "Add to Library"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {type === "series" && (
        <section className="space-y-4">
          <div className="flex gap-2 overflow-x-auto pb-2">
            {d.seasons.map((s) => (
              <button
                key={s}
                onClick={() => setSeason(s)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold focus-visible:ring-4 focus-visible:ring-primary ${s === activeSeason ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
              >
                Season {s}
              </button>
            ))}
          </div>
          {eps.length === 0 && <p className="text-muted-foreground">No episodes listed.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {eps.map((e) => (
              <Link
                key={e.id}
                to="/browse/watch/$type/$id"
                params={{ type: "series", id }}
                search={{ s: e.season, e: e.episode }}
                className="flex gap-3 rounded-xl border border-border bg-card p-2 outline-none focus-visible:ring-4 focus-visible:ring-primary focus-visible:scale-[1.02] transition-transform"
              >
                {e.thumbnail ? (
                  <img
                    src={e.thumbnail}
                    alt=""
                    loading="lazy"
                    className="h-20 w-32 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="h-20 w-32 shrink-0 rounded-lg bg-muted" />
                )}
                <div className="min-w-0">
                  <p className="text-xs text-primary">E{e.episode}</p>
                  <p className="truncate font-semibold">{e.title}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{e.overview}</p>
                </div>
              </Link>
            ))}
          </div>
          {eps.some((e) => e.episode > 0) && (
            <SeriesDownloads id={id} season={activeSeason} episodes={eps} />
          )}
        </section>
      )}
    </div>
  );
}
