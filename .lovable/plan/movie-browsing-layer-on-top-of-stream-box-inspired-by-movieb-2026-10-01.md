# Movie browsing layer on top of Stream Box (inspired by MovieBox-TUI)

## What I found in MovieBox-TUI
- Rust terminal app. Content comes from two kinds of sources:
  1. **Built-in scrapers** (MovieBox, 4KHDHub, Dramachi, CircleFTP, DhakaFlix) - these pull from unlicensed streaming sites. **I will not port these.** Their pages will show an "Unavailable" state.
  2. **Stremio add-on system** - a public, open protocol (`manifest.json`, `/catalog`, `/meta`, `/stream`). Ships with **Cinemeta** (public movie/TV metadata: posters, cast, seasons, episodes). This is what I will port.
- Also reused: shared `Provider` interface (search / details), quality tagging of streams (4K/1080p/720p), resume + history + favorites, MX Player/VLC hand-off.

## Kept exactly as-is
Sign-in, Google login, your `/dashboard` library, `/add` uploader, TorBox, themes, sorting/filters, bulk actions. A new "Browse" link is added to the dashboard header.

## New pages
```text
/browse                 Home: hero + Popular Movies / Popular Series rows + Continue watching
/browse/movies          Grid of movies (genre filter, infinite scroll)
/browse/series          Grid of TV shows
/browse/search          Live search (movies + series)
/browse/movie/$id       Details: backdrop, rating, cast, "Find streams", add to Library
/browse/series/$id      Details + season picker + episode list
/browse/watch/$type/$id Streams from your enabled add-ons, quality labels, Play in browser / MX Player / VLC / Save to library
/browse/addons          Add-on manager (Cinemeta built-in, add by manifest URL, toggle, remove)
/browse/library         Saved titles (favorites)
/browse/history         Watch history with resume
/browse/settings        Default player, preferred quality, provider status (scrapers shown as unavailable)
```
All D-pad friendly with the same cyan focus rings, cinematic dark styling, responsive for phone.

## Technical details
- `src/lib/movie-api/` adapter layer: `provider.ts` (interface mirroring the Rust trait), `stremio.server.ts` (fetch manifest/catalog/meta/stream with timeouts, validation), `quality.ts` (port of quality parsing), `movies.functions.ts` (server functions; frontend never calls providers directly).
- Unavailable providers registered with `capabilities: unavailable` + reason.
- New tables (RLS, per-user): `user_addons` (manifest_url, name, enabled), `watch_history` (meta_id, type, season, episode, title, poster, position, updated_at), `library_items` (meta_id, type, title, poster). Cinemeta seeded per user in code as a non-removable default.
- "Save to library" from a stream inserts into existing `media_streams` so it also appears on your TV dashboard.
- No DRM / header / rate-limit circumvention; streams requiring special auth headers are marked "not playable in browser".
