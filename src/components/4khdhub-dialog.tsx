// "Add a 4KHDHub title" dialog — pastes a 4KHDHub post URL and saves the
// best-quality download variant to My Streams.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addFourKHDHubStream } from "@/lib/movie-api/4khdhub.functions";

export function AddFourKHDHubDialog({
  open,
  onClose,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [title, setTitle] = useState("");
  const [pageUrl, setPageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = useServerFn(addFourKHDHubStream);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const result = await submit({ data: { title: title.trim() || undefined, pageUrl } });
      toast.success(`Added “${result.stream.title}”`, {
        description:
          result.variants > 1 ? `${result.variants} quality variants on the page` : undefined,
      });
      setTitle("");
      setPageUrl("");
      onAdded();
    } catch (err) {
      toast.error((err as Error).message || "Could not extract the stream.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add from 4KHDHub</DialogTitle>
          <DialogDescription>
            Paste a 4KHDHub title page link. The highest-quality download variant is saved to My
            Streams.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="hub-title">Title (optional)</Label>
            <Input
              id="hub-title"
              placeholder="e.g. Dune: Part Two (2024)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
            />
          </div>

          <div>
            <Label htmlFor="hub-url">4KHDHub page URL</Label>
            <Input
              id="hub-url"
              placeholder="https://4khdhub.one/dune-part-two-movie-199/"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !pageUrl.trim()}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Extract &amp; Add
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
