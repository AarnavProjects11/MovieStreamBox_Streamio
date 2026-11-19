# Agent Handoff — MovieStreamBox (Stream Box)

**Project:** Stream Box (MovieStreamBox) — personal Stremio-based streaming web app  
**Location:** `D:\Aarnav\Apps\MovieStreamBox\moviestreambox-main`  
**Framework:** TanStack Start (React 19 + Vite + Nitro), Tailwind CSS, Supabase auth  
**Connected to:** Lovable — **do not force-push / rewrite git history**  
**Git:** No local repo — changes are uncommitted  
**Date:** Wed Oct 28 2026

---

## What the App Does

Stream Box is a personal cinema app that:

- **Browses catalogs** from installed Stremio add-ons (Cinemeta built-in, plus user-installed)
- **Watches movies & TV shows** by aggregating streams from add-ons (TorBox optional; Webtor for self-hosted torrent streaming)
- **Series support** — seasons/episodes listed on details pages; streams fetched per episode
- **18+ adult section** — device-local age gate, per-add-on adult flags, hidden until confirmed
- **Marvel chronology** — choose between Chrono/Gonp Marvel add-on sources
- **My Streams / Library** — save torrents & direct links; play via Webtor
- **Settings** — player preference, quality, Webtor URL, theme
- **TV-optimized** — `tv-action` focus rings, keyboard navigation

---

## Key Architecture Files

| File | Purpose |
|------|---------|
| `src/lib/movie-api/movies.functions.ts` | Server fns: `getCatalogs`, `getDetails`, `getStreams`, `installAddon`, `inspectAddon`, `installDefaultAddons`, `toggleAddonAdult` |
| `src/lib/movie-api/stremio.server.ts` | Stremio client: `fetchManifest`, `fetchMeta`, `fetchStreams`, `aggregateStreams`, `resolveMeta`, `parseSeasonEpisode`, `streamItemToOption` |
| `src/lib/movie-api/provider.ts` | Types: `ResolvedAddon`, `StreamOption`, `Episode`, `MediaDetails`, `CatalogItem`; `CINEMETA`, `DEFAULT_ADDONS` |
| `src/lib/movie-api/addons.server.ts` | Add-on store: `resolveAddon`, `fetchAddonManifest`, `loadUserAddons`, `ensureDefaultAddons` |
| `src/lib/movie-api/downloads.functions.ts` | **NEW** — `getSeriesDownloads` server fn (per-episode download links + season ZIP packs) |
| `src/lib/movie-api/4khdhub.server.ts` | 4KHDHub direct-download provider |
| `src/lib/webtor.ts` | Webtor embed handshake, URL config |
| `src/lib/adult-flags.ts` | Device-local adult mode + per-add-on flags |
| `src/routes/_authenticated/route.tsx` | Auth guard + `NetflixLayout` wrapper |
| `src/routes/_authenticated/browse.tsx` | Browse shell (nav, profile menu, theme picker) — skips own header when Netflix theme active |
| `src/routes/_authenticated/browse.index.tsx` | Home page — hero + catalog rows (Netflix-style when theme active) |
| `src/routes/_authenticated/browse.watch.$type.$id.tsx` | Watch page — streams per episode, Webtor/TorBox playback |
| `src/routes/_authenticated/browse.series.$id.tsx` | Series details → `DetailsPage` |
| `src/routes/_authenticated/browse.addons.tsx` | Add-on management — install, test, recheck, toggle, remove |
| `src/routes/_authenticated/browse.settings.tsx` | Settings — player, quality, Webtor URL, theme selector |
| `src/components/browse/details.tsx` | Movie/series details page |
| `src/components/browse/series-downloads.tsx` | **NEW** — per-episode download links + season ZIP UI |
| `src/components/browse/netflix-layout.tsx` | **NEW** — Netflix shell (navbar, search, profile) |
| `src/components/browse/netflix-hero.tsx` | **NEW** — Netflix hero section |
| `src/components/browse/netflix-row.tsx` | **NEW** — Netflix horizontal movie rows |
| `src/components/browse/netflix-modal.tsx` | **NEW** — Netflix movie details modal |
| `src/hooks/use-theme.ts` | Theme state (system/midnight/noir/mint/aurora/paper/netflix) |
| `src/styles.css` | Theme variables (oklch) + TV utilities |
| `deploy/webtor/` | Docker Compose + Caddy + README for self-hosted Webtor |

---

## Changes Made Since Checkpoint Start

### 1. Series Download Panel (Per-Episode Download Links + Season ZIPs)

**Problem:** When viewing a series from an add-on, download links were hidden — only playable streams appeared on the watch page, and `.zip`/season-pack streams were filtered out because they're not browser-playable.

**Solution:**

- **`src/lib/movie-api/downloads.functions.ts`** — New `getSeriesDownloads` server fn:
  - Fetches streams for every episode of one season (max 50 eps, 4 concurrent, 25s deadline)
  - Classifies each stream as **season pack** (ZIP/rar/7z or "complete season" text/range) vs **per-episode file/page**
  - Dedupes pack URLs across episodes; shows pack once at top
  - Returns per-episode links sorted by quality (zip > file > page, then quality score)
  - Handles timeouts gracefully (partial results + retry)

- **`src/components/browse/series-downloads.tsx`** — UI component:
  - "Find Season N links" button (user-triggered, cached 5 min)
  - Shows season ZIP pack at top with Download ZIP button
  - Each episode: direct Download/Open Page links + Copy button
  - Metadata: quality, size, source, headers-required flag
  - Empty state: explains no direct links or no stream add-ons

- **`src/components/browse/details.tsx`** — Wired `SeriesDownloads` below episode grid (only when real episodes exist, scoped to active season)

### 2. Netflix Clone UI Theme (Full GUI Replacement)

**Problem:** App had a generic dark cinema theme. User wants it to look like Netflix using the clone at `C:\Users\Manav Kaushal\Downloads\netflix-clone-frontend-master`.

**Solution:**

- **`src/styles.css`** — Added `[data-theme="netflix"]` theme block: `#141414` black background, `#e50914` red accent, white text, red glow
- **`src/hooks/use-theme.ts`** — Registered `netflix` theme with swatches `["#141414", "#181818", "#e50914", "#ffffff"]`
- **`src/components/browse/netflix-layout.tsx`** — Netflix shell:
  - Fixed top navbar (transparent → black on scroll)
  - Netflix logo + Home/TV Shows/Movies/Recently Added/My List
  - Expanding search bar on focus
  - KIDS, DVD, bell, profile dropdown
- **`src/components/browse/netflix-hero.tsx`** — Hero with backdrop image, gradient overlay, title, rating/year/genre chips, Play + More Info buttons
- **`src/components/browse/netflix-row.tsx`** — Horizontal rows: section heading, posters scale on hover, neighbors shift, scroll shadow
- **`src/components/browse/netflix-modal.tsx`** — Details modal: backdrop, title, rating, release date, overview, Play + My List buttons, Escape to close
- **Static assets** — Copied from Netflix clone: `netflix-logo.png`, `play-button.svg`, `add.svg`, `search-icon.svg`, `bell-logo.svg`, `dropdown-arrow.svg` → `src/static/images/`
- **`src/routes/_authenticated/route.tsx`** — Wraps `Outlet` in `NetflixLayout` (pass-through when theme isn't netflix)
- **`src/routes/_authenticated/browse.tsx`** — Skips its own header when Netflix theme active (avoids double nav); imports `useTheme`
- **`src/routes/_authenticated/browse.index.tsx`** — Uses `NetflixHero` + `NetflixRow` instead of default hero/poster rows when Netflix theme
- **`src/routes/_authenticated/browse.settings.tsx`** — Added `ThemeSection` with swatch buttons for all themes including Netflix

### 3. Add-On Install / Fetch Error Fixes

**Problem:** Users got "fetch failed" or opaque "Install failed" when adding add-ons; broken manifests (`fun.qpef.workers.dev` → 500, `addon-marvel.gonp.deno.net` → 503) gave no useful feedback.

**Solution:**

- **`src/lib/movie-api/movies.functions.ts`** — Added `z.url()` validation to `installAddon` and `inspectAddon` input validators (rejects malformed URLs server-side with clear message)
- **`src/routes/_authenticated/browse.addons.tsx`**:
  - Client-side `z.url()` validation before install attempt
  - New **"Test" button** — calls `inspectAddon` to verify manifest is reachable before installing
  - Test result banner (green check with add-on name / red X with error message)
  - Install shows actual server error message instead of generic "Install failed"
- **`src/components/browse/netflix-layout.tsx`** — Fixed `<a href="...">` → `<Link to="...">` for SPA navigation (was causing full page reloads)
- **`src/routes/_authenticated/route.tsx`** — Fixed duplicate `createFileRoute` import

### 4. Build & Lint Status

- `tsc --noEmit` — clean
- `eslint` — 0 errors on changed files
- `npm run build` — passes (client + SSR + Nitro, Cloudflare module preset)
- Dev server runs on `http://localhost:8080`

---

## Known Limitations / Next Steps

1. **No Webtor instance running** — Docker not installed on dev machine; torrent playback via Webtor is unverified live. User needs to run Webtor container and set URL in Settings.
2. **Broken external manifests** — `https://fun.qpef.workers.dev/manifest.json` (500) and `https://addon-marvel.gonp.deno.net/manifest.json` (503) are down; Test button now reports them clearly.
3. **Pre-existing warnings** — `createServerFn().inputValidator()` deprecation across ~15 sites (cosmetic, build still passes); TanStack CSRF middleware recommendation in `src/start.ts`.
4. **Netflix theme is opt-in** — Users must select "Netflix Red" in Settings; other themes (midnight/noir/mint/aurora/paper) unchanged.

---

## Testing Notes

- Series downloads panel verified end-to-end with a synthetic test add-on at `http://localhost:9999/manifest.json` (now stopped). Confirmed: season ZIP shown once, per-episode links shown, external page links labeled "Open page", copy-to-clipboard works, "no direct link" state works.
- Build verified after all changes.
- Dev server was running on port 8080 during testing.

---

## Critical Constraints (from AGENTS.md)

- **Connected to Lovable** — Do not force-push, rebase, or squash pushed commits. Keep branch in working state.
- **No local git repo** — Changes are uncommitted.
- **No DB schema changes** — All features must work with existing tables.
- **Webtor must remain per-user** — No shared default server.