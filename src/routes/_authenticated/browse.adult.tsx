import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Lock, RefreshCw, Puzzle } from "lucide-react";
import { getAddonCatalog, listAddons } from "@/lib/movie-api/movies.functions";
import { isAdultAddon, setAdultMode, useAdultFlags, useAdultMode } from "@/lib/adult-flags";
import type { AddonCatalogDefinition, ResolvedAddon } from "@/lib/movie-api/provider";
import { ErrorState, PosterGrid, GridSkeleton } from "@/components/browse/ui";

export const Route = createFileRoute("/_authenticated/browse/adult")({
  head: () => ({
    meta: [
      { title: "18+ — Stream Box" },
      { name: "description", content: "Adult content from your installed add-ons." },
      { property: "og:title", content: "18+ — Stream Box" },
      { property: "og:description", content: "Adult content from your installed add-ons." },
    ],
  }),
  component: AdultPage,
});

interface CatalogOption {
  id: string;
  name: string;
  type: string;
  /** Needs a search term, so it cannot be listed without one. */
  requiresSearch: boolean;
}

function toOptions(catalogs: AddonCatalogDefinition[]): CatalogOption[] {
  return catalogs
    .filter((c) => c.type && c.id)
    .map((c) => ({
      id: c.id,
      name: c.name?.trim() || c.id,
      type: c.type,
      requiresSearch: (c.extra ?? []).some((e) => e.name === "search" && e.isRequired),
    }));
}

function AdultPage() {
  const adultMode = useAdultMode();
  if (!adultMode) return <AdultGate />;
  return <AdultContent />;
}

/** Shown if the page is opened directly before the age gate is accepted. */
function AdultGate() {
  return (
    <div className="mx-auto max-w-lg space-y-4 rounded-2xl border border-border bg-card p-8 text-center">
      <Lock className="mx-auto h-8 w-8 text-pink-500" />
      <h1 className="font-display text-2xl">This section is 18+</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The adult section is hidden until you confirm you are 18 or older. Confirming adds it to the
        navigation on this device, and you can turn it off again from your profile menu.
      </p>
      <div className="flex flex-col justify-center gap-2 sm:flex-row">
        <button
          onClick={() => setAdultMode(true)}
          className="rounded-lg bg-pink-600 px-4 py-2 text-sm font-semibold text-pink-50 outline-none focus-visible:ring-4 focus-visible:ring-pink-500"
        >
          I am 18 or older
        </button>
        <Link
          to="/browse"
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-primary"
        >
          Take me back
        </Link>
      </div>
    </div>
  );
}

function AdultContent() {
  const list = useServerFn(listAddons);
  const fetchCatalog = useServerFn(getAddonCatalog);
  const flags = useAdultFlags();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Record<string, string[]>>({});

  const { data: addons, isLoading: loadingAddons } = useQuery({
    queryKey: ["addons", "adult-list"],
    queryFn: () => list({ data: {} }),
    staleTime: 30_000,
  });

  // Enabled catalog add-ons flagged as adult on this device (or in the DB, if
  // the optional `adult` column exists).
  const adultAddons = useMemo(
    () =>
      ((addons ?? []) as ResolvedAddon[]).filter(
        (a) => a.enabled && a.providesCatalog && (isAdultAddon(a.manifestUrl, flags) || !!a.adult),
      ),
    [addons, flags],
  );

  const catalogOptions = useMemo(() => {
    const out: Record<string, CatalogOption[]> = {};
    for (const addon of adultAddons) out[addon.manifestUrl] = toOptions(addon.catalogs);
    return out;
  }, [adultAddons]);

  // Default to the first few listable catalogs. Some add-ons publish hundreds of
  // studio/performer feeds, and fetching all of them on load is far too heavy.
  // The previous default was the very first catalog, which is often "Search"
  // and always came back empty.
  useEffect(() => {
    setSelected((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const addon of adultAddons) {
        const options = catalogOptions[addon.manifestUrl] ?? [];
        if (!options.length) continue;
        const defaults = options
          .filter((o) => !o.requiresSearch)
          .slice(0, 4)
          .map((o) => o.id);
        if (!next[addon.manifestUrl]?.length && defaults.length) {
          next[addon.manifestUrl] = defaults;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [adultAddons, catalogOptions]);

  const entries = useMemo(() => {
    const list: { addon: ResolvedAddon; catalog: CatalogOption }[] = [];
    for (const addon of adultAddons) {
      const options = catalogOptions[addon.manifestUrl] ?? [];
      for (const id of selected[addon.manifestUrl] ?? []) {
        const opt = options.find((o) => o.id === id);
        if (opt) list.push({ addon, catalog: opt });
      }
    }
    return list;
  }, [adultAddons, catalogOptions, selected]);

  const queries = useQueries({
    queries: entries.map(({ addon, catalog }) => ({
      queryKey: ["adult-catalog", addon.manifestUrl, catalog.type, catalog.id],
      queryFn: () =>
        fetchCatalog({
          data: {
            addonUrl: addon.manifestUrl,
            catalogType: catalog.type,
            catalogId: catalog.id,
          },
        }),
      staleTime: 5 * 60_000,
    })),
  });

  const isLoading = loadingAddons || queries.some((q) => q.isLoading);
  const firstError = queries.find((q) => q.isError)?.error as Error | undefined;

  const items = useMemo(() => {
    const seen = new Set<string>();
    const out = [];
    for (const q of queries) {
      for (const item of q.data ?? []) {
        const key = `${item.type}:${item.id}`;
        if (!item.id || seen.has(key)) continue;
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  }, [queries]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["addons", "adult-list"] });
    qc.invalidateQueries({ queryKey: ["adult-catalog"] });
  }

  function toggle(addon: ResolvedAddon, id: string) {
    const current = selected[addon.manifestUrl] ?? [];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setSelected({ ...selected, [addon.manifestUrl]: next });
  }

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-card">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-transparent" />
        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-8">
          <div className="space-y-2">
            <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.3em] text-primary">
              <Lock className="h-4 w-4" /> 18+
            </p>
            <h1 className="font-display text-4xl sm:text-5xl">Adult content</h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Catalogs from the add-ons you marked 18+ in the Add-ons page. Your flag is stored on
              this device.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 text-xs text-muted-foreground sm:items-end">
            <p>
              {items.length} titles · {adultAddons.length} add-on(s)
            </p>
            <button
              onClick={refresh}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-primary disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {!loadingAddons && adultAddons.length === 0 && (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-8 text-center">
          <Puzzle className="mx-auto h-8 w-8 text-primary" />
          <p className="font-semibold">No 18+ add-ons enabled</p>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            Install an add-on with catalogs, then press its <b>All</b> button on the Add-ons page so
            it reads <b>18+</b>. It will appear here.
          </p>
          <Link
            to="/browse/addons"
            className="inline-block rounded-lg bg-primary px-4 py-2 font-semibold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary"
          >
            Manage add-ons
          </Link>
        </div>
      )}

      {adultAddons.length > 0 && (
        <section className="space-y-4 rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Catalogs
          </h2>
          {adultAddons.map((addon) => {
            const options = catalogOptions[addon.manifestUrl] ?? [];
            const active = selected[addon.manifestUrl] ?? [];
            return (
              <div key={addon.manifestUrl} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">{addon.name}</p>
                  <div className="flex gap-2 text-[11px] font-semibold text-muted-foreground">
                    <button
                      onClick={() =>
                        setSelected({
                          ...selected,
                          [addon.manifestUrl]: options
                            .filter((o) => !o.requiresSearch)
                            .map((o) => o.id),
                        })
                      }
                      className="hover:text-foreground"
                    >
                      Select all
                    </button>
                    <button
                      onClick={() => setSelected({ ...selected, [addon.manifestUrl]: [] })}
                      className="hover:text-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {options.map((opt) => (
                    <button
                      key={`${opt.type}/${opt.id}`}
                      onClick={() => toggle(addon, opt.id)}
                      disabled={opt.requiresSearch}
                      title={opt.requiresSearch ? "Needs a search term" : undefined}
                      className={`rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        active.includes(opt.id)
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      {opt.name}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}

      {firstError ? (
        <ErrorState message={firstError.message} onRetry={refresh} />
      ) : isLoading ? (
        <GridSkeleton />
      ) : entries.length > 0 && items.length === 0 ? (
        <div className="space-y-2 rounded-2xl border border-border bg-card p-8 text-center">
          <p className="font-semibold">These catalogs came back empty</p>
          <p className="text-sm text-muted-foreground">
            Try another catalog above, or press Refresh.
          </p>
        </div>
      ) : items.length > 0 ? (
        <PosterGrid items={items} />
      ) : adultAddons.length > 0 ? (
        <p className="text-sm text-muted-foreground">Select at least one catalog above.</p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Content comes from your installed adult add-ons. Direct streams play as-is; torrent sources
        play in-app through your self-hosted Webtor server (set its URL in Settings).
      </p>
    </div>
  );
}
