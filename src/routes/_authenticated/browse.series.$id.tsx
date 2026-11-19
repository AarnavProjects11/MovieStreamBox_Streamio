import { createFileRoute } from "@tanstack/react-router";
import { DetailsPage } from "@/components/browse/details";

export const Route = createFileRoute("/_authenticated/browse/series/$id")({
  head: () => ({
    meta: [
      { title: "TV show details — Stream Box" },
      { name: "description", content: "Seasons, episodes and cast." },
      { property: "og:title", content: "TV show details — Stream Box" },
      { property: "og:description", content: "Seasons, episodes and cast." },
    ],
  }),
  component: SeriesDetailsRoute,
});

function SeriesDetailsRoute() {
  const { id } = Route.useParams();
  return <DetailsPage key={id} type="series" id={id} />;
}
