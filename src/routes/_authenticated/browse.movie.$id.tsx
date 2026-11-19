import { createFileRoute } from "@tanstack/react-router";
import { DetailsPage } from "@/components/browse/details";

export const Route = createFileRoute("/_authenticated/browse/movie/$id")({
  head: () => ({
    meta: [
      { title: "Movie details — Stream Box" },
      { name: "description", content: "Movie details, cast and streams." },
      { property: "og:title", content: "Movie details — Stream Box" },
      { property: "og:description", content: "Movie details, cast and streams." },
    ],
  }),
  component: MovieDetailsRoute,
});

function MovieDetailsRoute() {
  const { id } = Route.useParams();
  return <DetailsPage key={id} type="movie" id={id} />;
}
