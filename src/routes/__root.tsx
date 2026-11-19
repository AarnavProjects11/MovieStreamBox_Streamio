import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { missingConfigVars } from "../lib/error-page";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  // A deployment that never had its Supabase variables set fails on every page;
  // name the missing variables instead of blaming the app.
  const missingVars = missingConfigVars(error);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {missingVars.length
            ? "This deployment is missing configuration"
            : "This page didn't load"}
        </h1>
        {missingVars.length ? (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-left text-xs leading-relaxed text-amber-900">
            <p className="font-medium">Missing: {missingVars.join(", ")}</p>
            <p className="mt-1">
              Add these to your hosting provider's environment variables and redeploy. Names
              starting with VITE_ are compiled into the bundle, so changing them needs a new build.
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Something went wrong on our end. You can try refreshing or head back home.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#1a1d2e" },
      { title: "Stream Box" },
      {
        name: "description",
        content:
          "Personal cloud video library for Android TV — D-pad navigation, MX Player & VLC deep-linking, TorBox and Webtor torrent streaming.",
      },
      { property: "og:title", content: "Stream Box" },
      {
        property: "og:description",
        content:
          "Personal cloud video library for Android TV — D-pad navigation, MX Player & VLC deep-linking, TorBox and Webtor torrent streaming.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Stream Box" },
      {
        name: "twitter:description",
        content:
          "Personal cloud video library for Android TV — D-pad navigation, MX Player & VLC deep-linking, TorBox and Webtor torrent streaming.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Hind:wght@300;400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    // Honor "Remember me" toggle: tab-scoped sessions are cleared when a fresh
    // tab opens without sessionStorage continuity.
    try {
      const ephemeral = localStorage.getItem("streambox.ephemeral") === "1";
      const tabAlive = sessionStorage.getItem("streambox.ephemeral") === "1";
      if (ephemeral && !tabAlive) {
        import("@/integrations/supabase/client").then(({ supabase }) => supabase.auth.signOut());
        localStorage.removeItem("streambox.ephemeral");
      } else if (ephemeral) {
        sessionStorage.setItem("streambox.ephemeral", "1");
      }
    } catch {}
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
      <Toaster richColors theme="dark" position="top-center" />
    </QueryClientProvider>
  );
}
