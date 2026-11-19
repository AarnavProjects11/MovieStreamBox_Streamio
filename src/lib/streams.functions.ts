import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const linkInput = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().min(3).max(4000),
});

type LinkKind = "torrent" | "google_drive" | "google_usercontent" | "direct";

function classifyLink(raw: string): LinkKind {
  const url = raw.trim();
  if (url.startsWith("magnet:")) return "torrent";
  // bare info hash (40 hex chars or 32 base32 chars)
  if (/^[a-fA-F0-9]{40}$/.test(url) || /^[A-Z2-7]{32}$/.test(url)) return "torrent";
  if (/googleusercontent\.com/i.test(url)) return "google_usercontent";
  if (/drive\.google\.com/i.test(url)) return "google_drive";
  return "direct";
}

function extractDriveId(url: string): string | null {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

function toMagnet(raw: string): string {
  const s = raw.trim();
  if (s.startsWith("magnet:")) return s;
  // bare hash -> magnet
  return `magnet:?xt=urn:btih:${s}`;
}

/**
 * While TorBox is still fetching, the row keeps `torbox:<torrentId>` in
 * `stream_url` so a later refresh polls the same torrent instead of queueing
 * a second copy.
 */
const TORBOX_PENDING = "torbox:";

function isPendingTorrent(streamUrl: string): boolean {
  return String(streamUrl ?? "").startsWith(TORBOX_PENDING);
}

function pendingTorrentId(streamUrl: string): number | null {
  if (!isPendingTorrent(streamUrl)) return null;
  const id = Number(String(streamUrl).slice(TORBOX_PENDING.length));
  return Number.isFinite(id) && id > 0 ? id : null;
}

function torboxApiKey(): string {
  const apiKey = process.env.TORBOX_API_KEY;
  if (!apiKey) throw new Error("TORBOX_API_KEY is not configured. Add it in project secrets.");
  return apiKey;
}

/** TorBox is optional: without a key, torrents stay as magnets for Webtor. */
function hasTorBoxKey(): boolean {
  return !!process.env.TORBOX_API_KEY;
}

async function createTorBoxTorrent(body: FormData): Promise<number | null> {
  const apiKey = torboxApiKey();
  const createRes = await fetch("https://api.torbox.app/v1/api/torrents/createtorrent", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body,
  });
  const createJson: any = await createRes.json().catch(() => ({}));
  if (!createRes.ok || createJson?.success === false) {
    throw new Error(createJson?.detail || createJson?.error || "TorBox createtorrent failed");
  }
  const torrentId: number | undefined =
    createJson?.data?.torrent_id ?? createJson?.data?.id ?? createJson?.data?.queued_id;
  return typeof torrentId === "number" ? torrentId : null;
}

interface TorBoxStatus {
  progress: number;
  state: string;
  ready: boolean;
  streamUrl: string | null;
}

/** Polls a TorBox torrent and resolves its download link once it is cached. */
async function pollTorBoxTorrent(torrentId: number): Promise<TorBoxStatus> {
  const apiKey = torboxApiKey();
  const listRes = await fetch(
    `https://api.torbox.app/v1/api/torrents/mylist?id=${torrentId}&bypass_cache=true`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  const listJson: any = await listRes.json().catch(() => ({}));
  const info: any = listJson?.data ?? {};
  const files: Array<{ id: number; size: number; name: string }> = Array.isArray(info.files)
    ? info.files
    : [];
  const biggest = [...files].sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];

  const progress: number = typeof info.progress === "number" ? info.progress : 0;
  const state: string = info.download_state ?? info.state ?? "downloading";
  const cached = progress >= 1 || info.download_finished === true || info.cached === true;

  if (!biggest || !cached) {
    return { progress, state, ready: false, streamUrl: null };
  }

  const dlRes = await fetch(
    `https://api.torbox.app/v1/api/torrents/requestdl?token=${encodeURIComponent(
      apiKey,
    )}&torrent_id=${torrentId}&file_id=${biggest.id}`,
  );
  const dlJson: any = await dlRes.json().catch(() => ({}));
  if (dlJson?.data && typeof dlJson.data === "string") {
    return { progress, state, ready: true, streamUrl: dlJson.data };
  }

  return { progress, state, ready: false, streamUrl: null };
}

async function processWithTorBox(magnet: string): Promise<string> {
  const form = new FormData();
  form.append("magnet", magnet);
  form.append("seed", "1");
  form.append("allow_zip", "false");

  const torrentId = await createTorBoxTorrent(form);
  // Without an id we cannot poll later, so keep the magnet as the fallback.
  return torrentId ? `${TORBOX_PENDING}${torrentId}` : magnet;
}

export const addStream = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => linkInput.parse(input))
  .handler(async ({ data, context }) => {
    const { title, url } = data;
    const kind = classifyLink(url);

    let stream_url = url;
    let type: "torrent" | "direct_link" = "direct_link";
    let warning: string | null = null;

    if (kind === "torrent") {
      const magnet = toMagnet(url);
      type = "torrent";
      if (hasTorBoxKey()) {
        stream_url = await processWithTorBox(magnet);
        if (isPendingTorrent(stream_url) || stream_url.startsWith("magnet:")) {
          warning =
            "Torrent queued in TorBox. Stream link will be available once download completes. Use Refresh to check.";
        }
      } else {
        // No debrid key: keep the magnet itself. Webtor can stream it on demand.
        stream_url = magnet;
        warning = "Saved as a torrent. Play it with Webtor from My Streams.";
      }
    } else if (kind === "google_drive") {
      const id = extractDriveId(url);
      if (!id) throw new Error("Could not extract Google Drive file ID.");
      stream_url = `https://docs.google.com/uc?export=download&id=${id}`;
      type = "direct_link";
    } else if (kind === "google_usercontent") {
      stream_url = url;
      type = "direct_link";
      warning = "This temporary link may expire in a few hours.";
    } else {
      // A 4KHDHub download link points at a redirector; resolve it so the
      // library holds a real media URL that a player can open.
      const { resolveFourKHDHubDownload } = await import("@/lib/movie-api/4khdhub-resolve.server");
      const resolved = await resolveFourKHDHubDownload(url).catch(() => null);
      stream_url = resolved?.url ?? url;
      type = "direct_link";
    }

    const { data: row, error } = await context.supabase
      .from("media_streams")
      .insert({
        user_id: context.userId,
        title,
        original_url: url,
        stream_url,
        type,
      })
      .select()
      .single();

    if (error) throw new Error(error.message);
    return { stream: row, warning };
  });

export const listStreams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("media_streams")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const deleteStream = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("media_streams").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refreshStream = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("media_streams")
      .select("id, original_url, stream_url, type")
      .eq("id", data.id)
      .single();
    if (error || !row) throw new Error(error?.message ?? "Stream not found");

    if (row.type !== "torrent") {
      // A 4KHDHub row saved while its redirector could not be walked still holds
      // the landing page; resolve it now and store the real file URL.
      const { isRedirectorUrl, resolveFourKHDHubDownload } =
        await import("@/lib/movie-api/4khdhub-resolve.server");
      if (isRedirectorUrl(row.stream_url)) {
        const resolved = await resolveFourKHDHubDownload(row.stream_url).catch(() => null);
        if (!resolved) {
          return {
            ready: false,
            progress: 0,
            stream_url: row.stream_url,
            state: "unresolved" as const,
          };
        }
        await context.supabase
          .from("media_streams")
          .update({ stream_url: resolved.url })
          .eq("id", row.id);
        return { ready: true, progress: 1, stream_url: resolved.url, state: "ready" as const };
      }
      return { ready: true, progress: 1, stream_url: row.stream_url, state: "ready" as const };
    }

    // Without a debrid key the row holds its original magnet; Webtor streams it
    // directly, so there is nothing to poll.
    if (!hasTorBoxKey()) {
      return {
        ready: false,
        progress: 0,
        stream_url: row.original_url,
        state: "torrent" as const,
      };
    }

    torboxApiKey();

    // A .torrent upload that never produced a torrent id can't be re-derived.
    const orig = row.original_url;
    if (orig.startsWith("torrent-file:") && !pendingTorrentId(row.stream_url)) {
      return { ready: false, progress: 0, stream_url: row.stream_url, state: "queued" as const };
    }

    // Reuse the torrent we already queued — creating a new one on every poll
    // would burn TorBox quota and never converge.
    let torrentId = pendingTorrentId(row.stream_url);
    if (!torrentId) {
      const magnet = orig.startsWith("magnet:") ? orig : toMagnet(orig);
      const form = new FormData();
      form.append("magnet", magnet);
      form.append("seed", "1");
      form.append("allow_zip", "false");
      torrentId = await createTorBoxTorrent(form);
      if (!torrentId) {
        return { ready: false, progress: 0, stream_url: row.stream_url, state: "queued" as const };
      }
      await context.supabase
        .from("media_streams")
        .update({ stream_url: `${TORBOX_PENDING}${torrentId}` })
        .eq("id", row.id);
    }

    const status = await pollTorBoxTorrent(torrentId);

    let stream_url = row.stream_url;
    let ready = false;
    if (status.ready && status.streamUrl) {
      stream_url = status.streamUrl;
      ready = true;
      await context.supabase.from("media_streams").update({ stream_url }).eq("id", row.id);
    }

    return {
      ready,
      progress: status.progress,
      stream_url,
      state: ready ? ("ready" as const) : (status.state as string),
    };
  });

export const updateStream = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(200).optional(),
        stream_url: z.string().trim().min(3).max(4000).optional(),
        favorite: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { id, ...patch } = data;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await context.supabase.from("media_streams").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkDeleteStreams = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("media_streams").delete().in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

export const bulkUpdateFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ ids: z.array(z.string().uuid()).min(1).max(200), favorite: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("media_streams")
      .update({ favorite: data.favorite })
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { ok: true, count: data.ids.length };
  });

const torrentFileInput = z.object({
  title: z.string().trim().min(1).max(200),
  filename: z.string().trim().min(1).max(300),
  // base64-encoded .torrent file contents
  fileBase64: z.string().min(10).max(8_000_000),
});

async function processTorrentFileWithTorBox(filename: string, bytes: Uint8Array): Promise<string> {
  // A .torrent upload needs a debrid service; there is no magnet to hand Webtor.
  if (!hasTorBoxKey()) return "";

  const form = new FormData();
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const blob = new Blob([ab], { type: "application/x-bittorrent" });
  form.append("file", blob, filename);
  form.append("seed", "1");
  form.append("allow_zip", "false");

  const torrentId = await createTorBoxTorrent(form);
  if (!torrentId) return "";

  // Poll once — TorBox often resolves small torrents immediately.
  const status = await pollTorBoxTorrent(torrentId);
  if (status.ready && status.streamUrl) return status.streamUrl;

  return `${TORBOX_PENDING}${torrentId}`;
}

export const addStreamFromTorrentFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => torrentFileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { title, filename, fileBase64 } = data;
    const bytes = Uint8Array.from(atob(fileBase64), (c) => c.charCodeAt(0));
    const streamUrl = await processTorrentFileWithTorBox(filename, bytes);

    let warning: string | null = null;
    let finalUrl = streamUrl;
    if (!finalUrl) {
      finalUrl = `torrent-file:${filename}`;
      warning = hasTorBoxKey()
        ? "Torrent queued in TorBox. Stream link will be available once download completes. Use Refresh to check."
        : "Uploaded .torrent saved, but no debrid service is configured. Add a TorBox key, or use a magnet link to stream with Webtor.";
    } else if (isPendingTorrent(finalUrl)) {
      warning =
        "Torrent queued in TorBox. Stream link will be available once download completes. Use Refresh to check.";
    }

    const { data: row, error } = await context.supabase
      .from("media_streams")
      .insert({
        user_id: context.userId,
        title,
        original_url: `torrent-file:${filename}`,
        stream_url: finalUrl,
        type: "torrent",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { stream: row, warning };
  });
