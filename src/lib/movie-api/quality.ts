// Port of MovieBox-TUI providers/addons/adapter.rs parse_quality / parse_codec
// and aggregator.rs quality_score.
export type Quality = "2160p" | "1080p" | "720p" | "480p";

export function parseQuality(text: string): Quality | null {
  const u = text.toUpperCase();
  const words = u.split(/[^A-Z0-9]/);
  if (u.includes("2160P") || u.includes("4K") || u.includes("UHD")) return "2160p";
  if (u.includes("1080P") || u.includes("FHD") || u.includes("FULL HD") || u.includes("FULLHD"))
    return "1080p";
  if (u.includes("720P") || words.includes("HD")) return "720p";
  if (u.includes("480P") || words.includes("SD")) return "480p";
  return null;
}

export function parseCodec(text: string): string | null {
  const u = text.toUpperCase();
  if (/HEVC|X265|H\.?265/.test(u)) return "HEVC";
  if (/X264|H\.?264|AVC/.test(u)) return "H.264";
  if (/AV1/.test(u)) return "AV1";
  return null;
}

export function parseSize(text: string): string | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s?(GB|MB|TB)/i);
  return m ? `${m[1]} ${m[2].toUpperCase()}` : null;
}

// Port of MovieBox-TUI providers/models.rs parse_size_bytes.
const SIZE_SUFFIXES: [string, number][] = [
  ["TIB", 1024 ** 4],
  ["TB", 1024 ** 4],
  ["T", 1024 ** 4],
  ["GIB", 1024 ** 3],
  ["GB", 1024 ** 3],
  ["G", 1024 ** 3],
  ["MIB", 1024 ** 2],
  ["MB", 1024 ** 2],
  ["M", 1024 ** 2],
  ["KIB", 1024],
  ["KB", 1024],
  ["K", 1024],
];

export function parseSizeBytes(text: string): number | null {
  const words = String(text ?? "")
    .split(/\s+/)
    .filter(Boolean);
  for (let i = 0; i < words.length; i++) {
    const clean = words[i].replace(/^[^A-Za-z0-9.]+|[^A-Za-z0-9.]+$/g, "").toUpperCase();
    const asNumber = Number.parseFloat(clean);
    const next = i + 1 < words.length ? words[i + 1].replace(/[^A-Za-z]/g, "").toUpperCase() : "";
    for (const [suffix, multiplier] of SIZE_SUFFIXES) {
      // "1.4GB"
      if (clean.endsWith(suffix) && clean.length > suffix.length) {
        const num = Number.parseFloat(clean.slice(0, -suffix.length));
        if (Number.isFinite(num) && num > 0) return Math.round(num * multiplier);
      }
      // "1.4 GB"
      if (Number.isFinite(asNumber) && asNumber > 0 && next === suffix)
        return Math.round(asNumber * multiplier);
    }
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function qualityScore(q: Quality | null): number {
  return q === "2160p" ? 40 : q === "1080p" ? 30 : q === "720p" ? 20 : q === "480p" ? 10 : 0;
}

export function qualityLabel(q: Quality | null) {
  return q === "2160p" ? "4K" : (q ?? "Auto");
}
