import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { addStream, addStreamFromTorrentFile } from "@/lib/streams.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Link as LinkIcon, Upload, AlertTriangle, FileUp } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/add")({
  head: () => ({
    meta: [
      { title: "Add Stream · Stream Box" },
      {
        name: "description",
        content:
          "Paste a magnet, info hash, Drive link, or direct media URL — or upload a .torrent file.",
      },
    ],
  }),
  component: AddPage,
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = reader.result as string;
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function detectKind(raw: string): "torrent" | "drive" | "direct" | "empty" {
  const u = raw.trim();
  if (!u) return "empty";
  if (u.startsWith("magnet:") || /^[a-fA-F0-9]{40}$/.test(u) || /^[A-Z2-7]{32}$/.test(u))
    return "torrent";
  if (/drive\.google\.com|googleusercontent\.com/i.test(u)) return "drive";
  return "direct";
}

function AddPage() {
  const submitLink = useServerFn(addStream);
  const submitTorrent = useServerFn(addStreamFromTorrentFile);

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kind = detectKind(url);

  async function onSubmitLink(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setWarning(null);
    setError(null);
    setStage(
      kind === "torrent"
        ? "Saving the torrent and preparing a stream…"
        : kind === "drive"
          ? "Converting Google Drive link to a direct stream…"
          : "Saving stream link…",
    );
    try {
      const res = (await submitLink({ data: { title: title.trim(), url: url.trim() } })) as {
        warning: string | null;
      };
      if (res.warning) {
        setWarning(res.warning);
        toast.warning(res.warning);
      } else toast.success("Added to your library");
      setTitle("");
      setUrl("");
    } catch (err: any) {
      const msg = err?.message ?? "Failed to add stream";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  async function onSubmitTorrent(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error("Pick a .torrent file first");
    setBusy(true);
    setWarning(null);
    setError(null);
    setStage("Uploading .torrent to TorBox and waiting for a stream link…");
    try {
      const fileBase64 = await fileToBase64(file);
      const res = (await submitTorrent({
        data: { title: title.trim(), filename: file.name, fileBase64 },
      })) as { warning: string | null };
      if (res.warning) {
        setWarning(res.warning);
        toast.warning(res.warning);
      } else toast.success("Torrent added to your library");
      setTitle("");
      setFile(null);
    } catch (err: any) {
      const msg = err?.message ?? "Failed to upload torrent";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setStage(null);
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 sticky top-0 z-10 backdrop-blur">
        <div className="mx-auto max-w-xl px-4 py-3 flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link to="/dashboard" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold">Add to library</h1>
            <p className="truncate text-xs text-muted-foreground">Stream Box uploader</p>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-xl px-4 py-6 space-y-4">
        <Card className="p-5 bg-card border-border">
          <div className="mb-4">
            <Label htmlFor="title">Movie title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="The Matrix (1999)"
              maxLength={200}
            />
          </div>

          <Tabs defaultValue="link" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="link">
                <LinkIcon className="h-3.5 w-3.5 mr-1.5" /> Link
              </TabsTrigger>
              <TabsTrigger value="file">
                <FileUp className="h-3.5 w-3.5 mr-1.5" /> .torrent file
              </TabsTrigger>
            </TabsList>

            <TabsContent value="link" className="mt-4">
              <form onSubmit={onSubmitLink} className="space-y-3">
                <div>
                  <Label htmlFor="url">Paste link</Label>
                  <textarea
                    id="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="magnet:?xt=urn:btih:…  ·  info hash  ·  drive.google.com/…  ·  https://…/movie.mp4"
                    required
                    maxLength={4000}
                    rows={4}
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Magnets, info hashes, Google Drive URLs, or direct media (.mp4 / .mkv).
                  </p>
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={busy || !title.trim()}>
                  {busy ? (
                    "Processing…"
                  ) : (
                    <>
                      <Upload className="h-5 w-5" /> Add to library
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="file" className="mt-4">
              <form onSubmit={onSubmitTorrent} className="space-y-3">
                <div>
                  <Label htmlFor="torrent">Choose .torrent file</Label>
                  <input
                    id="torrent"
                    type="file"
                    accept=".torrent,application/x-bittorrent"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className="mt-1 block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
                  />
                  {file && (
                    <p className="mt-2 text-xs text-muted-foreground truncate">
                      {file.name} · {(file.size / 1024).toFixed(1)} KB
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Sent to TorBox when configured; otherwise saved for Webtor streaming.
                  </p>
                </div>
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={busy || !file || !title.trim()}
                >
                  {busy ? (
                    "Uploading…"
                  ) : (
                    <>
                      <FileUp className="h-5 w-5" /> Upload torrent
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>

        {busy && stage && (
          <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-primary/10 p-3 text-sm text-foreground">
            <span className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <div>
              <p className="font-medium">{stage}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Large torrents may take up to a minute on first cache.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive-foreground">
            <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium text-destructive">Something went wrong</p>
              <p className="text-xs text-muted-foreground break-words">{error}</p>
            </div>
          </div>
        )}

        {warning && (
          <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <span>{warning}</span>
          </div>
        )}

        <Card className="p-4 bg-card/60 border-border">
          <h3 className="text-sm font-semibold">Tips</h3>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground list-disc list-inside">
            <li>
              Torrents (magnet or .torrent file) are debridded through TorBox when a key is
              configured; otherwise magnets stay as torrents and stream through your self-hosted
              Webtor server.
            </li>
            <li>Drive links are auto-converted to direct download URLs.</li>
            <li>
              Temporary <code>googleusercontent.com</code> links may expire in hours.
            </li>
          </ul>
        </Card>
      </section>
    </main>
  );
}
