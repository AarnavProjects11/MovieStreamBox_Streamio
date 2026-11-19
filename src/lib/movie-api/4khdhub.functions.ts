// Server functions for the 4KHDHub provider.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { parseQuality, qualityScore } from "./quality";

const addInput = z.object({
  title: z.string().trim().max(200).optional(),
  /** A 4KHDHub title page URL or a bare slug. */
  pageUrl: z.string().trim().min(4).max(1000),
});

/** Pulls the slug out of a 4KHDHub post URL. */
export function slugFromPageUrl(raw: string): string {
  const value = String(raw ?? "").trim();
  const match = value.match(/4khdhub\.[a-z]+\/([^/?#]+)/i);
  if (match) return match[1].replace(/\/+$/, "");
  return value.replace(/^\/+/, "").replace(/\/+$/, "");
}

export const addFourKHDHubStream = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => addInput.parse(i))
  .handler(async ({ data, context }) => {
    const [{ fetchFourKHDHubPost }, { resolveFourKHDHubDownload }] = await Promise.all([
      import("./4khdhub.server"),
      import("./4khdhub-resolve.server"),
    ]);

    const slug = slugFromPageUrl(data.pageUrl);
    if (!slug) throw new Error("That does not look like a 4KHDHub title link.");

    const post = await fetchFourKHDHubPost(slug);

    // Pick the highest-quality variant the page offers.
    const candidates = post.downloads
      .flatMap((download) => download.links.map((link) => ({ download, link })))
      .sort(
        (a, b) =>
          qualityScore(parseQuality(b.download.label)) -
          qualityScore(parseQuality(a.download.label)),
      );

    const best = candidates[0];
    if (!best) throw new Error("No download link found on that 4KHDHub page.");

    // Only the HubCloud redirector resolves without an account, so prefer it.
    const primary = candidates.find((c) => /hubcloud/i.test(c.link.url))?.link ?? best.link;
    const mirror = candidates.find((c) => c.link !== primary && c.link.url !== primary.url)?.link;

    // Resolve the redirector chain so the library holds a real media URL that
    // MX Player / VLC can open, not a landing page.
    const resolved = await resolveFourKHDHubDownload(
      mirror ? [primary.url, mirror.url] : [primary.url],
    ).catch(() => null);

    const title = data.title?.trim() || post.title;
    const { data: row, error } = await context.supabase
      .from("media_streams")
      .insert({
        user_id: context.userId,
        title,
        original_url: post.url,
        stream_url: resolved?.url ?? primary.url,
        type: "direct_link",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    return {
      stream: row,
      pageUrl: post.url,
      variants: post.downloads.length,
      quality: best.download.label,
      resolved: !!resolved,
    };
  });

const resolveInput = z.object({
  url: z.string().trim().min(8).max(2000),
  /** An alternate landing page for the same file, tried if the first fails. */
  mirrorUrl: z.string().trim().min(8).max(2000).optional(),
});

/**
 * Turns a 4KHDHub download link into the final media URL so the watch page can
 * hand a playable file to MX Player / VLC.
 */
export const resolveFourKHDHubLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => resolveInput.parse(i))
  .handler(async ({ data }) => {
    const { resolveFourKHDHubDownload } = await import("./4khdhub-resolve.server");
    const resolved = await resolveFourKHDHubDownload(
      data.mirrorUrl ? [data.url, data.mirrorUrl] : [data.url],
    );
    if (!resolved) {
      throw new Error("Could not resolve that file — use Open to reach it manually.");
    }
    return resolved;
  });
