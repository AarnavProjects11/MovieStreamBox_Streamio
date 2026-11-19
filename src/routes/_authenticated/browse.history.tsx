import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/browse/history")({
  head: () => ({
    meta: [
      { title: "Watch history — Stream Box" },
      { name: "description", content: "Pick up where you left off." },
      { property: "og:title", content: "Watch history — Stream Box" },
      { property: "og:description", content: "Pick up where you left off." },
    ],
  }),
  component: HistoryPage,
});

function HistoryPage() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["history"],
    queryFn: async () =>
      (
        await supabase
          .from("watch_history")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(200)
      ).data ?? [],
  });
  async function remove(id: string) {
    await supabase.from("watch_history").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["history"] });
  }
  return (
    <div className="max-w-3xl space-y-5">
      <h1 className="font-display text-3xl">Watch history</h1>
      {q.data && !q.data.length && (
        <p className="text-muted-foreground">You haven't watched anything yet.</p>
      )}
      <ul className="space-y-2">
        {q.data?.map((h) => (
          <li
            key={h.id}
            className="flex items-center gap-3 rounded-xl border border-border bg-card p-2"
          >
            {h.poster ? (
              <img src={h.poster} alt="" className="h-16 w-28 rounded-lg object-cover" />
            ) : (
              <div className="h-16 w-28 rounded-lg bg-muted" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{h.title}</p>
              <p className="text-xs text-muted-foreground">
                {h.season > 0 ? `S${h.season} · E${h.episode} · ` : ""}
                {new Date(h.updated_at).toLocaleString()}
              </p>
            </div>
            <Link
              to="/browse/watch/$type/$id"
              params={{ type: h.meta_type, id: h.meta_id }}
              search={h.season ? { s: h.season, e: h.episode } : {}}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary"
            >
              <Play className="h-4 w-4" />
              Resume
            </Link>
            <button
              onClick={() => remove(h.id)}
              aria-label="Remove from history"
              className="rounded-lg p-2 text-destructive focus-visible:ring-4 focus-visible:ring-destructive"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
