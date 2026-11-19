import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: () => {
    // Land on the browsing experience; the _authenticated guard sends
    // signed-out visitors to /auth.
    throw redirect({ to: "/browse" });
  },
  component: () => null,
});
