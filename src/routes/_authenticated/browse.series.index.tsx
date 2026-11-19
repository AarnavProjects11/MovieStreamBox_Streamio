import { createFileRoute } from "@tanstack/react-router";
import { CatalogPage } from "@/components/browse/catalog-page";

export const Route = createFileRoute("/_authenticated/browse/series/")({
  head: () => ({
    meta: [
      { title: "TV Shows — Stream Box" },
      { name: "description", content: "Browse popular TV shows by genre." },
      { property: "og:title", content: "TV Shows — Stream Box" },
      { property: "og:description", content: "Browse popular TV shows by genre." },
    ],
  }),
  component: () => <CatalogPage type="series" title="TV Shows" />,
});
