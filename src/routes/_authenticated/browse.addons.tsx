import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  Trash2,
  Puzzle,
  Shield,
  ShieldCheck,
  Sparkles,
  Plus,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  installAddon,
  installDefaultAddons,
  inspectAddon,
  listAddons,
  toggleAddonAdult,
} from "@/lib/movie-api/movies.functions";
import { CINEMETA, type ResolvedAddon } from "@/lib/movie-api/provider";
import { normalizeManifestUrl } from "@/lib/movie-api/addon-url";
import { isAdultAddon, setAdultFlag, useAdultFlags } from "@/lib/adult-flags";

export const Route = createFileRoute("/_authenticated/browse/addons")({
  head: () => ({
    meta: [
      { title: "Add-ons — Stream Box" },
      { name: "description", content: "Manage the add-ons Stream Box uses to find streams." },
      { property: "og:title", content: "Add-ons — Stream Box" },
      {
        property: "og:description",
        content: "Manage the add-ons Stream Box uses to find streams.",
      },
    ],
  }),
  component: AddonsPage,
});

function Capability({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${on ? "border-primary/60 bg-primary/10 text-primary" : "border-border text-muted-foreground line-through"}`}
    >
      {label}
    </span>
  );
}

function AddonMeta({ addon }: { addon?: ResolvedAddon }) {
  if (!addon) return <p className="text-xs text-muted-foreground">Checking manifest…</p>;
  const catalogs = addon.catalogs.map((c) => `${c.type}/${c.id}`).join(", ");
  return (
    <div className="mt-1.5 space-y-1">
      <div className="flex flex-wrap gap-1.5">
        <Capability label="Catalog" on={addon.providesCatalog} />
        <Capability label="Metadata" on={addon.providesMeta} />
        <Capability label="Streams" on={addon.providesStream} />
      </div>
      {catalogs && <p className="text-xs text-muted-foreground">Catalogs: {catalogs}</p>}
    </div>
  );
}

function AddonsPage() {
  const qc = useQueryClient();
  const install = useServerFn(installAddon);
  const inspect = useServerFn(inspectAddon);
  const listResolved = useServerFn(listAddons);
  const installDefaults = useServerFn(installDefaultAddons);
  const toggleAdultFn = useServerFn(toggleAddonAdult);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; name?: string; error?: string } | null>(null);
  const adultFlags = useAdultFlags();

  const rows = useQuery({
    queryKey: ["addons", "rows"],
    queryFn: async () =>
      (await supabase.from("user_addons").select("*").order("created_at")).data ?? [],
  });
  const resolved = useQuery({
    queryKey: ["addons", "resolved"],
    queryFn: () => listResolved({ data: {} }),
  });

  const byUrl = useMemo(() => {
    const map = new Map<string, ResolvedAddon>();
    for (const a of (resolved.data ?? []) as ResolvedAddon[]) map.set(a.manifestUrl, a);
    return map;
  }, [resolved.data]); // Stored rows can predate normalisation (the older install flow saved the raw input).
  const keyFor = (manifestUrl: string) => normalizeManifestUrl(manifestUrl);

  useEffect(() => {
    if (rows.data && rows.data.length === 0) {
      installDefaults().then(() => {
        qc.invalidateQueries({ queryKey: ["addons"] });
      });
    }
  }, [rows.data]);

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["addons"] });
    qc.invalidateQueries({ queryKey: ["catalogs"] });
    qc.invalidateQueries({ queryKey: ["adult-catalog"] });
    // The watch page keeps its stream list under this key; a new source must show up there.
    qc.invalidateQueries({ queryKey: ["streams"] });
  }

  async function addRecommended() {
    await installDefaults();
    toast.success("Recommended add-ons installed");
    refreshAll();
  }

  async function recheck() {
    const r = await listResolved({ data: { refresh: true } });
    const dead = ((r ?? []) as ResolvedAddon[]).filter((a) => a.unreachable);
    toast.success(
      dead.length
        ? `Re-checked manifests — ${dead.map((a) => a.name).join(", ")} still unreachable`
        : "Re-checked every add-on manifest",
    );
    refreshAll();
  }

  const urlSchema = z.object({ url: z.string().url("Enter a valid manifest URL").min(4).max(1000) });

  function validateUrl(raw: string): string | null {
    try {
      urlSchema.parse({ url: raw.trim() });
      return null;
    } catch (e: any) {
      return e?.errors?.[0]?.message ?? "Invalid URL";
    }
  }

  async function testManifest() {
    const u = url.trim();
    const err = validateUrl(u);
    if (err) {
      setTestResult({ ok: false, error: err });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const addon = await inspect({ data: { url: u } });
      setTestResult({ ok: true, name: addon.name });
    } catch (e: any) {
      setTestResult({ ok: false, error: e?.message ?? "Manifest could not be fetched" });
    } finally {
      setTesting(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const u = url.trim();
    const err = validateUrl(u);
    if (err) {
      toast.error(err);
      return;
    }
    setBusy(true);
    try {
      const addon = await install({ data: { url: u } });
      const caps = [
        addon.providesCatalog && "catalogs",
        addon.providesMeta && "metadata",
        addon.providesStream && "streams",
      ].filter(Boolean);
      toast.success(`Installed ${addon.name}`, {
        description: caps.length
          ? addon.providesStream
            ? `Provides ${caps.join(", ")} — open any title to see its streams.`
            : `Provides ${caps.join(", ")}. It declares no stream resource, so it won't add playable sources.`
          : "This add-on declares no catalog, metadata or stream resources.",
      });
      setUrl("");
      setTestResult(null);
      refreshAll();
    } catch (err: any) {
      const msg = err?.message ?? "Install failed";
      toast.error(msg);
      setTestResult({ ok: false, error: msg });
    } finally {
      setBusy(false);
    }
  }

  async function toggle(id: string, enabled: boolean) {
    await supabase.from("user_addons").update({ enabled }).eq("id", id);
    refreshAll();
  }

  function toggleAdult(manifestUrl: string, adult: boolean) {
    // Instant + always works: the flag is device-local. Mirror it to Supabase
    // best-effort in case the optional column exists.
    setAdultFlag(manifestUrl, adult);
    void toggleAdultFn({ data: { manifestUrl, adult } }).catch(() => {});
    qc.invalidateQueries({ queryKey: ["addons", "has-adult"] });
    qc.invalidateQueries({ queryKey: ["addons", "adult-list"] });
  }

  async function remove(id: string) {
    await supabase.from("user_addons").delete().eq("id", id);
    refreshAll();
  }

  const streamAddons = (resolved.data ?? []).filter((a) => a.enabled && a.providesStream);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl">Add-ons</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Stream Box speaks the open Stremio add-on protocol, like MovieBox-TUI. Installed add-ons
          supply the browse catalogs, the details pages and the streams. Only install add-ons you
          trust and that offer content you're allowed to watch.
        </p>
      </div>

      <form onSubmit={add} className="flex flex-col gap-2 sm:flex-row">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…/manifest.json"
          inputMode="url"
          className="flex-1 rounded-lg border-2 border-border bg-card px-4 py-3 outline-none focus:border-primary"
        />
        <div className="flex items-center gap-2">
          <button
            disabled={busy || testing}
            onClick={testManifest}
            className="rounded-lg border border-border px-4 py-3 font-semibold focus-visible:ring-4 focus-visible:ring-primary disabled:opacity-60"
          >
            {testing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "Test"
            )}
          </button>
          <button
            disabled={busy || !url.trim()}
            className="rounded-lg bg-primary px-5 py-3 font-bold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary disabled:opacity-60"
          >
            {busy ? "Checking…" : "Install"}
          </button>
        </div>
      </form>
      {testResult && (
        <div className={`rounded-lg border px-3 py-2 text-sm ${testResult.ok ? "border-green-500/40 bg-green-500/10 text-green-400" : "border-destructive/40 bg-destructive/10 text-destructive-foreground"}`}>
          {testResult.ok ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" />
          )}
          {testResult.ok ? `Valid manifest: ${testResult.name}` : testResult.error}
        </div>
      )}
      <p className="-mt-3 text-xs text-muted-foreground">
        Paste a Stremio manifest URL. Add-ons that declare a <b>stream</b> resource show up as
        sources on every watch page; local and LAN URLs can use plain http.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={addRecommended}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold focus-visible:ring-4 focus-visible:ring-primary"
        >
          <Plus className="h-4 w-4" /> Install recommended add-ons
        </button>
        <button
          onClick={recheck}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold focus-visible:ring-4 focus-visible:ring-primary"
        >
          <RefreshCw className="h-4 w-4" /> Re-check manifests
        </button>
      </div>

      {!streamAddons.length && (
        <p className="rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
          No enabled add-on provides streams yet — install one that declares a <b>stream</b>{" "}
          resource, otherwise the watch page has nothing to play.
        </p>
      )}

      <p className="rounded-xl border border-border bg-card p-3 text-xs leading-relaxed text-muted-foreground">
        Each add-on has an <b>All</b> / <b>18+</b> switch. Mark it <b>18+</b> to include its
        catalogs in the 18+ section. The section itself is hidden until you confirm your age from
        the profile menu (top right).
      </p>

      <ul className="space-y-3">
        <li className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Shield className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              Marvel chronology{" "}
              <span className="text-xs font-normal text-muted-foreground">(built-in section)</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Every Marvel film and series in story order, with a picker for the Marvel catalog
              add-on you want to browse. Streams still come from 4KHDHub and your enabled stream
              add-ons.
            </p>
          </div>
          <Link
            to="/browse/marvel"
            className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground outline-none focus-visible:ring-4 focus-visible:ring-primary"
          >
            Open
          </Link>
        </li>

        <li className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <Sparkles className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              Anime, only{" "}
              <span className="text-xs font-normal text-muted-foreground">(built-in section)</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Trending, airing, popular and top-rated anime, powered by the Anime Kitsu catalog
              add-on. Streams still come from 4KHDHub and your enabled stream add-ons.
            </p>
          </div>
          <Link
            to="/browse/anime"
            className="shrink-0 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground outline-none focus-visible:ring-4 focus-visible:ring-primary"
          >
            Open
          </Link>
        </li>

        <li className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
          <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">
              Cinemeta <span className="text-xs text-muted-foreground">(built in)</span>
            </p>
            <p className="truncate text-xs text-muted-foreground">{CINEMETA}</p>
            <AddonMeta addon={byUrl.get(keyFor(CINEMETA))} />
          </div>
          <span className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
            Always on
          </span>
        </li>

        {rows.data?.map((a) => {
          const info = byUrl.get(keyFor(a.manifest_url));
          const adult = isAdultAddon(a.manifest_url, adultFlags) || !!info?.adult;
          return (
            <li
              key={a.id}
              className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
            >
              <Puzzle className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {info?.name ?? a.name}
                  {info?.custom && (
                    <span className="ml-2 rounded border border-primary/50 bg-primary/10 px-1.5 py-0.5 align-middle text-[10px] font-bold uppercase tracking-wide text-primary">
                      Custom
                    </span>
                  )}
                  {info?.unreachable && (
                    <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5" /> unreachable
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-muted-foreground">{a.manifest_url}</p>
                {info?.unreachable ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Its manifest could not be fetched, so it contributes nothing right now.
                  </p>
                ) : (
                  <AddonMeta addon={info} />
                )}
              </div>
              <button
                onClick={() => toggle(a.id, !a.enabled)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold focus-visible:ring-4 focus-visible:ring-primary ${a.enabled ? "bg-primary text-primary-foreground" : "border border-border"}`}
              >
                {a.enabled ? "On" : "Off"}
              </button>
              <button
                onClick={() => toggleAdult(a.manifest_url, !adult)}
                role="switch"
                aria-checked={adult}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold focus-visible:ring-4 focus-visible:ring-primary ${adult ? "bg-pink-600 text-pink-50" : "border border-border"}`}
                title={adult ? "Adult content: on (shows in 18+ section)" : "Adult content: off"}
              >
                {adult ? "18+" : "All"}
              </button>
              <button
                onClick={() => remove(a.id)}
                aria-label={`Remove ${a.name}`}
                className="shrink-0 rounded-lg p-2 text-destructive focus-visible:ring-4 focus-visible:ring-destructive"
              >
                <Trash2 className="h-5 w-5" />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
