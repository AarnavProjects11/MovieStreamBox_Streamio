# Self-hosted Webtor for Stream Box

Stream Box does not run a torrent backend. Each user points their own copy at a
Webtor instance; this folder is a production-ready way to run one.

```
deploy/webtor/
  docker-compose.yml   Webtor + Caddy (automatic HTTPS)
  Caddyfile
  env.example          copy to .env and edit
```

## What you need

- A Linux box that is always on. A VPS with **2 vCPU / 4 GB RAM / 40 GB SSD**
  is comfortable for a few concurrent viewers; a home server or NAS works too.
- A domain or subdomain, e.g. `webtor.example.com`.
- Docker with the Compose plugin.
- Outbound internet. Inbound needs **80** and **443** only.
- Check your provider's acceptable-use policy: a torrent streamer is often
  treated as seedbox traffic.

Bandwidth budget: roughly **1.3 GB per hour per 3 Mbps viewer** (4K is ~4.5 GB/h).

## Option A — try it locally first (Windows/macOS/Linux)

Docker Desktop is enough. Use a port other than Stream Box's 8080:

```powershell
docker run -d --name webtor --restart unless-stopped `
  -e DOMAIN=http://localhost:8090 `
  -e ADMIN_PASSWORD=local-test-password `
  -p 8090:8080 `
  -v webtor-data:/data -v webtor-pgdata:/pgdata -v webtor-storage:/storage `
  ghcr.io/webtor-io/self-hosted:latest
```

Open <http://localhost:8090>, then in Stream Box set the Webtor URL to
`http://localhost:8090`.

Keep both on the **same hostname**: if Stream Box is at `127.0.0.1:8080`, point
Webtor at `127.0.0.1:8090`, not `localhost:8090`. Cross-site over plain HTTP
cannot keep the player session; `localhost` and `127.0.0.1` count as different
sites. A LAN IP also works only when both use that IP.

## Option B — real deployment with HTTPS

### 1. Point DNS at the server

Create an **A** record for `webtor.example.com` pointing at the server's IPv4
address (and an **AAAA** record if you use IPv6). Wait for it to resolve:

```bash
dig +short webtor.example.com
```

If you use Cloudflare, set the record to **DNS only (grey cloud)** for the first
start so Caddy can obtain its certificate. Proxying requires Full (strict) and a
Cloudflare origin certificate.

### 2. Install Docker (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y ca-certificates curl
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo tee /etc/apt/keyrings/docker.asc >/dev/null
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

### 3. Open only 80 and 443

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
```

Do **not** publish port 8080. In the compose file Webtor is only on the internal
network and Caddy proxies to it.

### 4. Copy the files and start

```bash
sudo mkdir -p /opt/webtor && sudo chown "$USER" /opt/webtor
cd /opt/webtor
# copy docker-compose.yml, Caddyfile and env.example here (scp/rsync)
cp env.example .env
nano .env          # set WEBTOR_DOMAIN and WEBTOR_ADMIN_PASSWORD
docker compose up -d
docker compose logs -f webtor
```

The first boot initialises PostgreSQL; give it 30–60 seconds. Then open
`https://webtor.example.com`.

### 5. Allow Stream Box to embed the player

1. Sign in to the Webtor UI with `ADMIN_PASSWORD`.
2. Open the profile page and add the **exact origin** Stream Box runs on to the
   embed domain list, e.g. `https://streambox.lovable.app` or your custom
   domain. `localhost` and `127.0.0.1` are always allowed.
3. Only if you cannot use the allow-list, set `EMBED_ONLY_AUTHORIZED: "false"`
   in `docker-compose.yml` and restart. That lets any site embed your instance.

### 6. Point Stream Box at it

Settings → **Webtor — torrent streaming** → paste
`https://webtor.example.com` → Save. Every torrent source then shows
**Play with Webtor**.

Legal test magnet (Sintel):

```
magnet:?xt=urn:btih:08ada5a7a6183aae1e09d831df6748d566095a10&dn=Sintel
```

## Storage

| Path       | Contents                                   | Disposable? |
| ---------- | ------------------------------------------ | ----------- |
| `/data`    | torrent download cache                     | yes         |
| `/pgdata`  | embedded PostgreSQL (accounts, library)    | **no**      |
| `/storage` | embedded S3 (posters, subtitles, Vault)    | partly no   |

`/storage` **must be a named Docker volume**, never a bind mount from Windows or
macOS: the S3 store keeps metadata in extended attributes that those mounts do
not support. A `[s3]`-prefixed error in the logs usually means this.

The autocleaner frees space automatically; tune it with `CLEANER_KEEP_FREE`
(default 25%) and `CLEANER_FREE` (default 35%). Content saved to Vault is kept
on purpose and is not cleaned.

## Backups

```bash
cd /opt/webtor
docker run --rm -v webtor_pgdata:/pgdata -v "$PWD":/backup \
  debian:stable-slim tar czf /backup/pgdata-$(date +%F).tgz -C / pgdata
docker run --rm -v webtor_storage:/storage -v "$PWD":/backup \
  debian:stable-slim tar --xattrs -czf /backup/storage-$(date +%F).tgz -C / storage
```

`tar --xattrs` (or `rsync -X`, `cp -a`) is required for `/storage`; a plain copy
silently loses the object metadata.

## Updates

```bash
cd /opt/webtor
docker compose pull
docker compose up -d
docker image prune -f
```

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| Caddy returns 502 | Webtor is still booting or crashed. `docker compose logs webtor`. |
| "CSRF token mismatch" | You opened the instance at `http://IP:8080` while `DOMAIN` is `https://…`. Use only the HTTPS URL. |
| Player says "not authorized" | The Stream Box origin is not in the embed list. Add the exact scheme + host, or set `EMBED_ONLY_AUTHORIZED=false`. |
| Player never starts on a remote site | It is HTTP. Cross-site embedding requires HTTPS + `DOMAIN`. |
| `[s3]` error at startup | `/storage` is a bind mount without xattr support. Use the named volume. |
| No certificate | DNS not pointing at the server, port 80 blocked, or Cloudflare proxying. Grey-cloud the record for the first run. |
| Torrents stall | UDP/outbound blocked, or a VPN container is not ready. See `WAIT_FOR_VPN`. |
| Disk fills up | Lower `CLEANER_KEEP_FREE`, add disk, or clear Vault. |

## Optional extras

Set these in `docker-compose.yml` (see the README of the image):

- `OSDB_API_KEY` — OpenSubtitles lookups.
- `TMDB_API_KEY`, `OMDB_API_KEY` — richer metadata.
- `WAIT_FOR_VPN=true` — when routed through Gluetun; combine with a VPN so the
  host IP is not visible in swarms.
- `DISABLE_WEBDAV=true`, `DISABLE_VIDEO_TRANSCODING=true` — trim features.

## Note

This instance is for your own use. You are the operator of whatever it streams;
keep the admin password private, keep `ONLY_AUTHORIZED` at its default, and use
the embed allow-list rather than opening the instance to the world.
