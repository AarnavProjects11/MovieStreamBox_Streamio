// In-app torrent playback through a self-hosted Webtor instance.
//
// This speaks the same tiny protocol as @webtor/embed-sdk-js: the iframe is
// opened at `<base>/show?id=<id>&mode=video`, posts back an `init` message, and
// is then handed the magnet. Doing it here (instead of loading the CDN SDK)
// keeps the app self-contained and lets us style the frame ourselves.
import { useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import type { TorrentSource } from "@/lib/webtor";

/** The Webtor iframe asks for its config and expects this shape back. */
interface WebtorInitPayload {
  id: string;
  baseUrl: string;
  width: string;
  height: null;
  mode: "video";
  magnet?: string;
  torrentUrl?: string;
  poster: string | null;
  title: string | null;
  header: boolean;
  controls: boolean;
  subtitles: never[];
  features: Record<string, unknown>;
  imdbId: string | null;
  lang: string | null;
  userlang: string | null;
  i18n: Record<string, unknown>;
  referer: string;
  version: string;
}

function makeId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `webtor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

export function WebtorPlayer({
  baseUrl,
  source,
  title,
  poster,
  onClose,
}: {
  baseUrl: string;
  source: TorrentSource;
  title?: string;
  poster?: string;
  onClose?: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);
  const id = useMemo(makeId, []);

  const src = useMemo(() => {
    const params = new URLSearchParams({ id, mode: "video" });
    return `${baseUrl}/show?${params.toString()}`;
  }, [baseUrl, id]);

  const openUrl = useMemo(() => {
    const params = new URLSearchParams({ id, mode: "video" });
    if (source.kind === "magnet") params.set("magnet", source.value);
    else params.set("torrentUrl", source.value);
    return `${baseUrl}/show?${params.toString()}`;
  }, [baseUrl, id, source]);

  // Build the handshake payload separately so the listener below never has a
  // dependency array whose size changes when props change (React errors on
  // that) and always answers with the current stream.
  const payload = useMemo<WebtorInitPayload>(
    () => ({
      id,
      baseUrl,
      width: "800px",
      height: null,
      mode: "video",
      ...(source.kind === "magnet" ? { magnet: source.value } : { torrentUrl: source.value }),
      poster: poster ?? null,
      title: title ?? null,
      header: true,
      controls: true,
      subtitles: [],
      features: {},
      imdbId: null,
      lang: null,
      userlang: null,
      i18n: {},
      referer: typeof window === "undefined" ? "" : window.location.href,
      version: "1.0.0",
    }),
    [id, baseUrl, source, title, poster],
  );

  // Webtor's iframe posts `{ id, name: "init" }` once it is ready; the parent
  // answers with the torrent details. Origin is "*" because a self-hosted
  // instance can live on any host.
  useEffect(() => {
    setLoaded(false);

    function onMessage(event: MessageEvent) {
      const data = event.data;
      if (!data || typeof data !== "object" || data.id !== id) return;
      if (data.name !== "init") return;
      const frame = frameRef.current;
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage({ id, name: "init", data: payload }, "*");
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [id, payload]);

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-black">
        <iframe
          ref={frameRef}
          src={src}
          title={title ? `${title} — Webtor` : "Webtor torrent player"}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; fullscreen; picture-in-picture"
          allowFullScreen
          onLoad={() => setLoaded(true)}
          className="aspect-video w-full"
        />
        {!loaded && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/60 text-xs text-white/80">
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Connecting to Webtor…
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          Streaming via Webtor at <span className="font-semibold">{baseUrl}</span>
        </span>
        <a
          href={openUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-primary underline-offset-4 hover:underline"
        >
          Open in Webtor <ExternalLink className="h-3 w-3" />
        </a>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto rounded-md border border-border px-2 py-1 font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-4 focus-visible:ring-primary"
          >
            Close player
          </button>
        )}
      </div>
    </div>
  );
}
