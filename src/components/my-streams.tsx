// "My Streams" — the personal library of everything the user added, debridded
// through TorBox, or pulled straight from a 4KHDHub title page.
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  CheckSquare,
  Download,
  ExternalLink,
  Loader2,
  MonitorPlay,
  Play,
  Plus,
  RefreshCw,
  Square,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  bulkDeleteStreams,
  bulkUpdateFavorite,
  deleteStream,
  listStreams,
  refreshStream,
  updateStream,
} from "@/lib/streams.functions";
import { intentHref } from "@/components/browse/ui";
import { resolveFourKHDHubLink } from "@/lib/movie-api/4khdhub.functions";
import { AddFourKHDHubDialog } from "@/components/4khdhub-dialog";
import { WebtorPlayer } from "@/components/browse/webtor-player";
import { torrentSourceOf, useWebtorUrl, type TorrentSource } from "@/lib/webtor";

type StreamRow = {
  id: string;
  title: string;
  original_url: string;
  stream_url: string;
  type: "torrent" | "direct_link";
  created_at: string;
  favorite: boolean;
};

const TORBOX_PENDING = "torbox:";

/** 4KHDHub hands out redirector landing pages, which are not files. */
const REDIRECTOR = /^https?:\/\/greenmotors\./i;

function isPending(row: StreamRow) {
  return row.stream_url.startsWith(TORBOX_PENDING);
}

function isPlayable(row: StreamRow) {
  return !isPending(row) && /^https?:\/\//i.test(row.stream_url);
}

export function MyStreams() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listStreams);
  const remove = useServerFn(deleteStream);
  const patch = useServerFn(updateStream);
  const bulkRemove = useServerFn(bulkDeleteStreams);
  const bulkFavorite = useServerFn(bulkUpdateFavorite);
  const refresh = useServerFn(refreshStream);

  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [playing, setPlaying] = useState<StreamRow | null>(null);
  const [webtor, setWebtor] = useState<{ source: TorrentSource; title: string } | null>(null);
  const webtorUrl = useWebtorUrl();
  const [hubOpen, setHubOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [playError, setPlayError] = useState<string | null>(null);
  const [fallback, setFallback] = useState<StreamRow | null>(null);
  const saveUrl = useServerFn(updateStream);
  const resolveLink = useServerFn(resolveFourKHDHubLink);

  const list = useQuery({
    queryKey: ["my-streams"],
    queryFn: () => fetchList(),
  });

  const rows: StreamRow[] = useMemo(() => {
    const all = (list.data ?? []) as StreamRow[];
    const needle = filter.trim().toLowerCase();
    return all
      .filter((r) => (favoritesOnly ? r.favorite : true))
      .filter((r) => (needle ? r.title.toLowerCase().includes(needle) : true))
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [list.data, filter, favoritesOnly]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["my-streams"] });

  const toggleFavorite = useMutation({
    mutationFn: (row: StreamRow) => patch({ data: { id: row.id, favorite: !row.favorite } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  async function onDelete(row: StreamRow) {
    try {
      await remove({ data: { id: row.id } });
      setSelected((ids) => ids.filter((id) => id !== row.id));
      toast.success(`Removed “${row.title}”`);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /**
   * Plays a library row. 4KHDHub rows saved before the redirector could be walked
   * still hold its landing page, so those are resolved to the real file first and
   * the result is written back to the row.
   */
  async function playRow(row: StreamRow) {
    setWebtor(null);
    setPlayError(null);
    setFallback(null);
    setPlaying(null);
    let url = row.stream_url;
    if (REDIRECTOR.test(url)) {
      setResolvingId(row.id);
      try {
        const resolved = await resolveLink({ data: { url } });
        url = resolved.url;
        void saveUrl({ data: { id: row.id, stream_url: url } })
          .then(() => invalidate())
          .catch(() => undefined);
      } catch (e) {
        setFallback(row);
        setPlayError(
          (e as Error).message || "Could not resolve this link — open the source page instead.",
        );
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      } finally {
        setResolvingId(null);
      }
    }
    // Browsers cannot decode Matroska, which is all 4KHDHub publishes, so hand
    // over the resolved file instead of mounting a player that can never start.
    if (/\.mkv/i.test(url)) {
      setFallback({ ...row, stream_url: url });
      setPlayError(
        "4KHDHub publishes .mkv files, which browsers cannot decode. Download the file and open it in VLC or MX Player.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setPlaying({ ...row, stream_url: url });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onRefresh(row: StreamRow) {
    setBusyId(row.id);
    try {
      const result = await refresh({ data: { id: row.id } });
      if (result.ready) {
        toast.success("Ready to play");
      } else if (result.state === "torrent") {
        toast("Torrent saved — play it with Webtor.");
      } else if (result.state === "unresolved") {
        toast.error("Could not resolve that link — open the source page instead.");
      } else {
        const pct = Math.round((result.progress ?? 0) * 100);
        toast(`TorBox: ${result.state}${pct ? ` · ${pct}%` : ""}`);
      }
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function onBulkDelete() {
    if (!selected.length) return;
    try {
      await bulkRemove({ data: { ids: selected } });
      toast.success(`Removed ${selected.length} stream(s)`);
      setSelected([]);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  async function onBulkFavorite(value: boolean) {
    if (!selected.length) return;
    try {
      await bulkFavorite({ data: { ids: selected, favorite: value } });
      toast.success(value ? "Added to favourites" : "Removed from favourites");
      invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const allSelected = rows.length > 0 && selected.length === rows.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="font-display text-xl brand-gradient shrink-0 rounded focus-visible:ring-4 focus-visible:ring-primary"
          >
            STREAM BOX
          </Link>
          <h1 className="text-sm font-semibold text-muted-foreground">My Streams</h1>
          <div className="flex-1" />
          <Link
            to="/browse"
            className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold focus-visible:ring-4 focus-visible:ring-primary"
          >
            Browse
          </Link>
          <button
            onClick={() => setHubOpen(true)}
            className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold focus-visible:ring-4 focus-visible:ring-primary"
          >
            <Plus className="h-4 w-4" />
            4KHDHub
          </button>
          <Link
            to="/add"
            className="tv-action inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary"
          >
            <Plus className="h-4 w-4" />
            Add stream
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6">
        {playing?.stream_url && isPlayable(playing) && (
          <div className="overflow-hidden rounded-2xl border border-border bg-black">
            <video
              key={playing.stream_url}
              src={playing.stream_url}
              controls
              autoPlay
              className="aspect-video w-full"
              onError={() => {
                setFallback(playing);
                setPlayError(
                  "This file can't play in the browser — 4KHDHub serves 4K HEVC .mkv files. Download it, or open the source page and pick a smaller variant.",
                );
              }}
            />
          </div>
        )}

        {playError && fallback && (
          <div className="space-y-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-sm text-destructive">{playError}</p>
            <div className="flex flex-wrap gap-2">
              <a
                href={fallback.stream_url}
                download
                rel="noreferrer"
                className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
              >
                <Download className="h-4 w-4" /> Download file
              </a>
              <a
                href={fallback.original_url}
                target="_blank"
                rel="noreferrer"
                className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold"
              >
                <ExternalLink className="h-4 w-4" /> Open source page
              </a>
            </div>
          </div>
        )}

        {webtor && webtorUrl && (
          <WebtorPlayer
            baseUrl={webtorUrl}
            source={webtor.source}
            title={webtor.title}
            onClose={() => setWebtor(null)}
          />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by title…"
            aria-label="Filter streams"
            className="min-w-48 flex-1 rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-primary"
          />
          <button
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`tv-action inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:ring-4 focus-visible:ring-primary ${
              favoritesOnly ? "bg-primary text-primary-foreground" : "border border-border"
            }`}
          >
            <Star className="h-4 w-4" />
            Favourites
          </button>
          <button
            onClick={() => setSelected(allSelected ? [] : rows.map((r) => r.id))}
            className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold focus-visible:ring-4 focus-visible:ring-primary"
          >
            {allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            Select all
          </button>
        </div>

        {!!selected.length && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-sm">
            <span className="font-semibold">{selected.length} selected</span>
            <button
              onClick={() => onBulkFavorite(true)}
              className="tv-action rounded-lg border border-border px-3 py-1.5 text-xs font-bold focus-visible:ring-4 focus-visible:ring-primary"
            >
              Favourite
            </button>
            <button
              onClick={() => onBulkFavorite(false)}
              className="tv-action rounded-lg border border-border px-3 py-1.5 text-xs font-bold focus-visible:ring-4 focus-visible:ring-primary"
            >
              Unfavourite
            </button>
            <button
              onClick={onBulkDelete}
              className="tv-action rounded-lg border border-destructive/50 px-3 py-1.5 text-xs font-bold text-destructive focus-visible:ring-4 focus-visible:ring-destructive"
            >
              Delete
            </button>
          </div>
        )}

        {list.isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        )}

        {list.isError && (
          <p className="text-sm text-destructive">{(list.error as Error).message}</p>
        )}

        {!list.isLoading && !rows.length && (
          <div className="space-y-3 rounded-2xl border border-border bg-card p-6 text-center">
            <p className="font-semibold">Nothing here yet</p>
            <p className="text-sm text-muted-foreground">
              Add a magnet, a .torrent file or a 4KHDHub title page and it will show up here.
            </p>
            <div className="flex justify-center gap-2">
              <Link
                to="/add"
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground focus-visible:ring-4 focus-visible:ring-primary"
              >
                Add stream
              </Link>
              <button
                onClick={() => setHubOpen(true)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-semibold focus-visible:ring-4 focus-visible:ring-primary"
              >
                Add from 4KHDHub
              </button>
            </div>
          </div>
        )}

        <ul className="space-y-2">
          {rows.map((row) => {
            const pending = isPending(row);
            const playable = isPlayable(row);
            const checked = selected.includes(row.id);
            const torrent = torrentSourceOf({
              url: row.stream_url,
              originalUrl: row.original_url,
            });
            return (
              <li
                key={row.id}
                className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSelected((ids) =>
                      checked ? ids.filter((id) => id !== row.id) : [...ids, row.id],
                    )
                  }
                  aria-label={`Select ${row.title}`}
                  className="h-4 w-4 shrink-0 accent-primary"
                />

                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{row.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.type === "torrent" ? "Torrent" : "Direct link"}
                    {row.favorite ? " · ★" : ""} · {new Date(row.created_at).toLocaleDateString()}
                  </p>
                </div>

                {pending && (
                  <span className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    Queued in TorBox
                  </span>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => toggleFavorite.mutate(row)}
                    aria-label={row.favorite ? "Unfavourite" : "Favourite"}
                    className={`tv-action rounded-lg border border-border p-2 focus-visible:ring-4 focus-visible:ring-primary ${
                      row.favorite ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <Star className={`h-4 w-4 ${row.favorite ? "fill-primary" : ""}`} />
                  </button>

                  {row.type === "torrent" && (
                    <button
                      onClick={() => onRefresh(row)}
                      disabled={busyId === row.id}
                      aria-label="Refresh TorBox status"
                      className="tv-action rounded-lg border border-border p-2 focus-visible:ring-4 focus-visible:ring-primary"
                    >
                      {busyId === row.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </button>
                  )}

                  {torrent &&
                    (webtorUrl ? (
                      <button
                        onClick={() => {
                          setPlaying(null);
                          setWebtor({ source: torrent, title: row.title });
                        }}
                        className="tv-action inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"
                      >
                        <Play className="h-4 w-4" />
                        Webtor
                      </button>
                    ) : (
                      <Link
                        to="/browse/settings"
                        className="tv-action inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-semibold"
                      >
                        Set up Webtor
                      </Link>
                    ))}

                  {playable && (
                    <>
                      <button
                        onClick={() => void playRow(row)}
                        disabled={resolvingId === row.id}
                        className="tv-action inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
                      >
                        {resolvingId === row.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        {resolvingId === row.id ? "Resolving…" : "Play"}
                      </button>
                      <a
                        href={intentHref(row.stream_url, "com.mxtech.videoplayer.ad")}
                        target="_self"
                        aria-label="Open in MX Player"
                        className="tv-action rounded-lg border border-border p-2 focus-visible:ring-4 focus-visible:ring-primary"
                      >
                        <MonitorPlay className="h-4 w-4" />
                      </a>
                      <a
                        href={intentHref(row.stream_url, "org.videolan.vlc")}
                        target="_self"
                        aria-label="Open in VLC"
                        className="tv-action rounded-lg border border-border p-2 focus-visible:ring-4 focus-visible:ring-primary"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                    </>
                  )}

                  {row.original_url !== row.stream_url && (
                    <a
                      href={row.original_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="Open the source page"
                      className="tv-action rounded-lg border border-border p-2 focus-visible:ring-4 focus-visible:ring-primary"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}

                  <button
                    onClick={() => onDelete(row)}
                    aria-label={`Delete ${row.title}`}
                    className="tv-action rounded-lg border border-border p-2 text-destructive focus-visible:ring-4 focus-visible:ring-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </main>

      <AddFourKHDHubDialog
        open={hubOpen}
        onClose={() => setHubOpen(false)}
        onAdded={() => {
          setHubOpen(false);
          invalidate();
        }}
      />
    </div>
  );
}
