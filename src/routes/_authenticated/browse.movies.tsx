import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/components/browse/catalog-page";

export const Route = createFileRoute("/_authenticated/browse/movies")({
  head: () => ({
    meta: [
      { title: "Movies — Stream Box" },
      { name: "description", content: "Browse popular movies by genre." },
      { property: "og:title", content: "Movies — Stream Box" },
      { property: "og:description", content: "Browse popular movies by genre." },
    ],
  }),
  component: () => <CatalogPage type="movie" title="Movies" />,
});
