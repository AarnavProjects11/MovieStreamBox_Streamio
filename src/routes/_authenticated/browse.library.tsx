import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PosterGrid } from "@/components/browse/ui";

export const Route = createFileRoute("/_authenticated/browse/library")({
  head: () => ({
    meta: [
      { title: "Library — Stream Box" },
      { name: "description", content: "Movies and shows you've saved." },
      { property: "og:title", content: "Library — Stream Box" },
      { property: "og:description", content: "Movies and shows you've saved." },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const q = useQuery({
    queryKey: ["library"],
    queryFn: async () =>
      (await supabase.from("library_items").select("*").order("created_at", { ascending: false }))
        .data ?? [],
  });
  const items = (q.data ?? []).map((r) => ({
    id: r.meta_id,
    type: r.meta_type as "movie" | "series",
    name: r.title,
    poster: r.poster ?? undefined,
  }));
  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl">Library</h1>
      {q.data && !items.length ? (
        <p className="text-muted-foreground">
          Nothing saved yet.{" "}
          <Link to="/browse" className="text-primary underline">
            Browse titles
          </Link>
        </p>
      ) : (
        <PosterGrid items={items} />
      )}
    </div>
  );
}
