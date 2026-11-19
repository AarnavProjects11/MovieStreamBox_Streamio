import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * Layout for the TV section. TanStack nests `/browse/series/$id` under
 * `/browse/series`, so this route must render an outlet; the catalogue itself
 * lives in `browse.series.index.tsx`.
 */
export const Route = createFileRoute("/_authenticated/browse/series")({
  component: () => <Outlet />,
});
