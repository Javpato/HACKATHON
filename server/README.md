# StudyVillage self-hosted server

A persistent world that its owner installs and runs, on their own computer or on a VPS.
We ship the software; we do not host or operate any server.

- **Node 24**, **WebSocket** and built-in **SQLite** (`node:sqlite`). No runtime dependencies: a single `server.mjs` file.
- Without a server, the peer-to-peer village works as before: six people.
- With a server, the owner chooses **1 to 24 simultaneous connections** (residents and visitors count the same).
- Each neighbourhood has six plots. As many neighbourhoods as needed are created, up to **four**: 10 people → 2 neighbourhoods.
  Lowering the capacity does not delete houses or neighbourhoods or kick anyone out: it only limits new entries.
- Neighbourhoods form a left/right chain within the same server. Each has its own Community (north) and Library (south).
  Connecting servers run by different owners is not part of this release.

## What is stored and what is not

| Stored in SQLite | Stays on each device | Transient |
|---|---|---|
| Residents and plots, houses, access, furniture, house and neighbourhood whiteboards, group projects, invitations (only their SHA-256 fingerprint) | Private keys, private notes, local files and paths, Ollama settings | Presence, positions, calls, games in progress |

Each change is confirmed only after it has been written in a transaction. Requests carry an identifier:
repeating a request after losing the response does not apply the change twice. If the disk fails, the app
receives an error and keeps the draft. After a restart, houses, whiteboards and residents are still there;
games go back to the lobby.

## Quick install (Node 24)

```bash
git clone https://github.com/Javpato/HACKATHON.git && cd HACKATHON
npm ci
npm run server:build            # creates server/dist/server.mjs
DATA_DIR=/var/lib/studyvillage WORLD_NAME="My village" node server/dist/server.mjs
```

On first start a **one-time claim secret** is printed (also in `DATA_DIR/claim-secret.txt`, permissions 600):

```
[studyvillage] No administrator yet. One-time claim secret: …
```

Environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Where it listens |
| `DATA_DIR` | `./data` | Folder for `world.sqlite` (use a persistent volume) |
| `WORLD_NAME` | `StudyVillage` | Name shown to clients |
| `ALLOWED_ORIGINS` | `*` | Allowed web origins, comma-separated |
| `CLAIM_SECRET` | random | Set your own claim secret |
| `TLS_CERT` / `TLS_KEY` | — | Direct TLS, if you do not use a proxy |

## Docker

```bash
docker compose -f server/docker-compose.yml up -d --build
docker compose -f server/docker-compose.yml logs studyvillage | grep "claim secret"
```

Data lives in the `studyvillage-data` volume. The port is only published on `127.0.0.1`:
put an HTTPS proxy in front of it.

## HTTPS required (wss://)

Browsers require `wss://` outside this same machine. The simplest option is Caddy, which obtains the certificate by itself:

```
aldea.example.org {
	reverse_proxy 127.0.0.1:8787
}
```

(see `server/Caddyfile.example`). Open ports 80 and 443 on the VPS. With nginx, remember
`proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`.

## First administration and letting people in

1. In the app: **Settings → Identity**, save your encrypted identity.
2. **Settings → Servers**: enter `https://aldea.example.org`, press **Check**, paste the claim secret and **Connect**.
   Your identity becomes the administrator; the secret stops working. Knowing the URL grants no permission.
3. In **Manage server** you choose the capacity and create **private invitations** (name, uses, hours).
   The code is shown only once; you can revoke it at any time.
4. Whoever receives the invitation joins with it:
   - with a **saved identity** they become a resident and get a plot; afterwards they come back without an invitation or administrator;
   - with a **temporary identity** they join as a visitor, without a plot.
5. Each resident can press **Import my house and whiteboards**: it is copied to the server and the originals stay on their computer.

The administrator can disconnect: the world stays open, activities can be started and houses remain available.

## Activities, voice and Ollama

- Werewolves, Gartic Phone, quizzes and projects run **on the server**: each person receives only their own view.
  The first person present in the activity organises it; if they leave, the next one does.
  Each room of a house has its own copy of projects and quizzes, available only to people inside that room.
- Voice, screen and cameras remain WebRTC between people in the **same scene** (area, house or private call).
  The server only relays authenticated signalling; there is no global mesh. Up to 12 people at once per neighbourhood.
- Ollama remains personal. Gartic bots only work with the organiser's Ollama and only while they stay connected;
  if they leave, the bots are turned off instead of making up answers.

## Backups and restore

```bash
# Consistent copy while the server is running
DATA_DIR=/var/lib/studyvillage node server/dist/server.mjs backup /backups/aldea-$(date +%F).sqlite

# Restore (with the server STOPPED). The previous database is kept as world.sqlite.before-restore
DATA_DIR=/var/lib/studyvillage node server/dist/server.mjs restore /backups/aldea-2026-11-01.sqlite
```

In Docker: `docker compose -f server/docker-compose.yml exec studyvillage node server.mjs backup /data/backup.sqlite`.

## Checks

```bash
npm run server:test     # integration tests with real sockets and identities
npm run typecheck       # includes server/
```

Verified status and open items: see `docs/SERVER.md`.

## Automatic friend access

In **Menu → Rooms → Allowed friends**, owners can choose saved contacts separately for the house and for each room. The house list opens the lobby, even when the house is closed. A room list allows entering that room and passing through its lobby and floor; other rooms remain private. Each list holds up to 24 identities.

Connect to the server with a saved identity and wait for **“Saved on the server”** when you change a list. That save publishes the structure and permissions without importing your whiteboards or personal files. Permissions are stored in SQLite and work while the owner is offline, including after a server restart. The server must stay on and friends must be able to connect with their usual identity and invitation/residency. Removing a friend from the list revokes that automatic access.

This update uses protocol **3**. Update the clients and rebuild/restart the server together; existing data is preserved.

### Mobile update

Floor and room door positions now persist in the signed house document. This version uses protocol **4**: rebuild/restart the server together with the app. HUD grids, portrait/landscape control layouts and contact nicknames are local device preferences.
