import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { THEMES, useTheme } from "@/hooks/use-theme";
import { PROVIDERS } from "@/lib/movie-api/provider";
import { useBrowseSettings, type BrowseSettings } from "@/components/browse/ui";
import {
  DEFAULT_WEBTOR_URL,
  getWebtorUrl,
  normalizeWebtorUrl,
  setWebtorUrl,
  useWebtorUrl,
} from "@/lib/webtor";

export const Route = createFileRoute("/_authenticated/browse/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Stream Box" },
      { name: "description", content: "Playback preferences and source status." },
      { property: "og:title", content: "Settings — Stream Box" },
      { property: "og:description", content: "Playback preferences and source status." },
    ],
  }),
  component: SettingsPage,
});

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="font-semibold">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map(([v, l]) => (
          <button
            key={v}
            onClick={() => onChange(v)}
            className={`rounded-full px-4 py-2 text-sm font-semibold focus-visible:ring-4 focus-visible:ring-primary ${value === v ? "bg-primary text-primary-foreground" : "border border-border bg-card"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Device-local URL of the self-hosted Webtor instance used to stream torrents. */
function WebtorSection() {
  const active = useWebtorUrl();
  const [draft, setDraft] = useState<string>("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setDraft(getWebtorUrl());
  }, [active]);

  function save(event: React.FormEvent) {
    event.preventDefault();
    setWebtorUrl(draft);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  }

  function clear() {
    setWebtorUrl("");
    setDraft("");
  }

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <div className="space-y-1">
        <h2 className="font-display text-xl">Webtor — torrent streaming</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Plays magnet and <code>.torrent</code> sources (including the 18+ catalogs) without
          TorBox. Run a{" "}
          <a
            href="https://github.com/webtor-io/self-hosted"
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            self-hosted Webtor instance
          </a>{" "}
          and paste its address below. The URL is stored on this device.
        </p>
      </div>

      <form onSubmit={save} className="flex flex-wrap items-center gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="https://webtor.example.com"
          aria-label="Webtor server URL"
          spellCheck={false}
          autoComplete="off"
          className="min-w-56 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-4 focus-visible:ring-primary"
        />
        <button
          type="submit"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground outline-none focus-visible:ring-4 focus-visible:ring-primary"
        >
          {saved ? "Saved" : "Save"}
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded-lg border border-border px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-4 focus-visible:ring-primary"
        >
          Clear
        </button>
      </form>

      <p className="text-xs text-muted-foreground">
        {active ? (
          <>
            Streaming through <span className="font-semibold text-foreground">{active}</span>
            {DEFAULT_WEBTOR_URL && active === DEFAULT_WEBTOR_URL ? " (deployment default)" : ""}.
          </>
        ) : (
          "No Webtor server configured yet — torrent sources will only offer Save to My Streams."
        )}
      </p>
      <p className="text-xs text-muted-foreground">
        If the embedded player says it isn&apos;t authorized, add this site&apos;s domain to the
        Webtor embed list (or start the server with{" "}
        <code className="rounded bg-muted px-1">EMBED_ONLY_AUTHORIZED=false</code>).
      </p>
      <p className="text-xs text-muted-foreground">
        Embedding a player cross-site requires the Webtor instance to be served over HTTPS with{" "}
        <code className="rounded bg-muted px-1">DOMAIN</code> set — a plain-HTTP instance cannot
        start a player inside Stream Box.
      </p>
    </section>
  );
}

/** Lets the user switch themes, including the new Netflix dark-cinema theme. */
function ThemeSection() {
  const { theme, setTheme } = useTheme();
  return (
    <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
      <div className="space-y-1">
        <h2 className="font-display text-xl">Theme</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Change the look and feel of Stream Box. The choice is saved on this device.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {THEMES.map((t) => {
          const active = theme === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t.id)}
              className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-card text-secondary-foreground hover:border-primary hover:bg-card/80"
              }`}
            >
              <span className="flex items-center gap-2">
                {t.swatches.map((c, i) => (
                  <span
                    key={i}
                    className="h-4 w-4 -ml-1 first:ml-0 rounded-full border border-black/40"
                    style={{ background: c }}
                  />
                ))}
              </span>
              <span className={active ? "font-bold" : ""}>{t.label}</span>
              {active && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function SettingsPage() {
  const [s, update] = useBrowseSettings();
  return (
    <div className="max-w-3xl space-y-8">
      <h1 className="font-display text-3xl">Settings</h1>
      <section className="space-y-5 rounded-2xl border border-border bg-card p-5">
        <Choice<BrowseSettings["player"]>
          label="Preferred player"
          value={s.player}
          onChange={(player) => update({ player })}
          options={[
            ["browser", "Browser"],
            ["mx", "MX Player"],
            ["vlc", "VLC"],
          ]}
        />
        <Choice<BrowseSettings["quality"]>
          label="Preferred quality"
          value={s.quality}
          onChange={(quality) => update({ quality })}
          options={[
            ["any", "Best available"],
            ["2160p", "4K"],
            ["1080p", "1080p"],
            ["720p", "720p"],
          ]}
        />
      </section>
      <WebtorSection />

      <ThemeSection />

      <section className="space-y-3">
        <h2 className="font-display text-xl">Sources</h2>
        {PROVIDERS.map((p) => (
          <div
            key={p.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4"
          >
            {p.available ? (
              <CheckCircle2 className="h-5 w-5 text-primary" />
            ) : (
              <XCircle className="h-5 w-5 text-muted-foreground" />
            )}
            <div>
              <p className="font-semibold">
                {p.name}{" "}
                <span className="text-xs text-muted-foreground">
                  {p.available ? "Available" : "Unavailable"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{p.reason ?? p.description}</p>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
