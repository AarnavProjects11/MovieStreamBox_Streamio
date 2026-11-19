import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Download, ExternalLink, FileArchive, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  getSeriesDownloads,
  type DownloadLink,
  type SeriesDownloadsResult,
} from "@/lib/movie-api/downloads.functions";
import { qualityLabel } from "@/lib/movie-api/quality";
import type { Episode } from "@/lib/movie-api/provider";

/**
 * Season download panel for a series. Add-ons answer per episode, so the scan is
 * user-triggered and scoped to one season at a time. Shows the season ZIP/pack
 * (if an add-on offers one) above the per-episode links.
 */
export function SeriesDownloads({
  id,
  season,
  episodes,
}: {
  id: string;
  season: number;
  episodes: Episode[];
}) {
  const [open, setOpen] = useState(false);
  const fetchDownloads = useServerFn(getSeriesDownloads);

  const list = useMemo(
    () =>
      episodes
        .filter((e) => e.episode > 0)
        .sort((a, b) => a.episode - b.episode)
        .map((e) => ({ episode: e.episode, title: e.title })),
    [episodes],
  );

  const q = useQuery({
    queryKey: ["series-downloads", id, season, list.map((e) => e.episode).join(",")],
    queryFn: () => fetchDownloads({ data: { id, season, episodes: list } }),
    enabled: open && list.length > 0,
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!list.length) return null;

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex items-center gap-2 font-display text-xl">
            <Download className="h-5 w-5 text-primary" /> Downloads
          </h2>
          <p className="max-w-xl text-xs text-muted-foreground">
            Direct episode links and season ZIPs from your series add-ons. Nothing is downloaded
            until you open a link.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {open && (
            <button
              onClick={() => q.refetch()}
              disabled={q.isFetching}
              aria-label="Refresh download links"
              title="Refresh download links"
              className="tv-action inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
            </button>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="tv-action inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <Download className="h-4 w-4" />
            {open ? `Season ${season} links` : `Find Season ${season} links`}
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-4">
          {q.isLoading && (
            <div className="flex items-center gap-2 rounded-xl border border-border bg-background/60 p-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Asking your add-ons for download links — this can take a few seconds.
            </div>
          )}

          {q.isError && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <span>{(q.error as Error).message || "Could not load download links."}</span>
              <button
                onClick={() => q.refetch()}
                className="tv-action rounded-lg border border-border bg-background px-3 py-2 font-semibold hover:bg-muted"
              >
                Try again
              </button>
            </div>
          )}

          {q.data && <DownloadResults data={q.data} season={season} />}
        </div>
      )}
    </section>
  );
}

function DownloadResults({ data, season }: { data: SeriesDownloadsResult; season: number }) {
  const noLinks = !data.packs.length && data.episodes.every((e) => !e.links.length);

  return (
    <>
      {data.packs.length > 0 && (
        <div className="rounded-xl border border-primary/40 bg-primary/5 p-3 sm:p-4">
          <p className="flex items-center gap-2 text-sm font-bold">
            <FileArchive className="h-4 w-4 text-primary" />
            Season {season} pack
          </p>
          <div className="mt-2 grid gap-2">
            {data.packs.map((link) => (
              <LinkRow key={link.url} link={link} />
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        {data.episodes.map((group, index) => (
          <div
            key={group.episode}
            className={`p-3 sm:p-4 ${index ? "border-t border-border" : ""}`}
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="rounded bg-muted px-2 py-0.5 text-xs font-bold">
                E{group.episode}
              </span>
              <span className="min-w-0 truncate text-sm font-semibold">{group.title}</span>
            </div>
            {group.links.length > 0 ? (
              <div className="mt-2 grid gap-2">
                {group.links.map((link) => (
                  <LinkRow key={link.url} link={link} />
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                {group.timedOut
                  ? "Timed out — use refresh to try this episode again."
                  : "No direct download link from your add-ons."}
              </p>
            )}
          </div>
        ))}
      </div>

      {noLinks && (
        <div className="rounded-xl border border-border bg-background/60 p-4 text-sm">
          <p className="font-semibold">No direct download links for Season {season}.</p>
          <p className="mt-1 text-muted-foreground">
            {data.noStreamAddons
              ? "Install or enable a Stremio add-on that provides streams, then try again."
              : "Your add-ons may only offer torrents or streaming links for this show."}
          </p>
        </div>
      )}

      {data.timedOut && !noLinks && (
        <p className="text-xs text-muted-foreground">
          Some episodes did not answer in time. Refresh to fill in the missing links.
        </p>
      )}

      {!!data.sources.length && (
        <p className="text-xs text-muted-foreground">
          Checked {data.sources.length} add-on{data.sources.length === 1 ? "" : "s"}:{" "}
          {data.sources.map((s) => s.addon).join(", ")}
        </p>
      )}
    </>
  );
}

function LinkRow({ link }: { link: DownloadLink }) {
  const [copied, setCopied] = useState(false);
  const isPage = link.kind === "page";
  const Icon = link.kind === "zip" ? FileArchive : isPage ? ExternalLink : Download;
  const meta = [
    link.quality ? qualityLabel(link.quality) : null,
    link.size,
    link.source,
    link.needsHeaders ? "headers required" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      toast.success("Download link copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy the link");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background/60 px-2.5 py-2">
      <a
        href={link.url}
        target="_blank"
        rel="noreferrer"
        className="tv-action inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90"
      >
        <Icon className="h-3.5 w-3.5" />
        {link.kind === "zip" ? "Download ZIP" : isPage ? "Open page" : "Download"}
      </a>
      <span className="min-w-0 text-[11px] text-muted-foreground">{meta}</span>
      <button
        onClick={copy}
        aria-label="Copy download link"
        title="Copy download link"
        className="tv-action ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border hover:bg-muted"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <p className="w-full truncate text-xs text-muted-foreground" title={link.label}>
        {link.label}
      </p>
    </div>
  );
}
