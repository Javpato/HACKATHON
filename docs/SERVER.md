# Interaction, language, whiteboard and self-hosted server — release status

Date: 2026-11-01. Server owner's guide: [server/README.md](../server/README.md).

## 1. Interaction, map and customisation

- `app/src/input/gestures.ts`: a single double-tap recogniser (same object, ≤ 360 ms, ≤ 24 px) for mouse, finger and Pencil (Pointer Events).
- Double click / double tap opens houses, furniture, stations and portals instantly and from afar; it cancels any pending walk. Access checks still happen inside each action.
- Single click on a computer: does not walk or open (with touch controls turned off). With touch controls, one tap walks the character closer **without opening on arrival**.
- Two fingers or a decoration drag reset the sequence: they never count as a double tap.
- «Touch controls» preference (Automatic / Always visible / Hidden) saved on the device; «Hidden» is respected on touch screens too.
- Community to the north and Library to the south of the neighbourhood; the left and right edges stay free for neighbouring neighbourhoods.
- Loading and using PNG character sheets has been removed. Old data is still read, but the wardrobe avatar is drawn.

## 2. Español / English

- Settings → Profile → **Language**. Spanish by default; the choice is saved on the device.
- The switch happens in place: no reload or remount. Sessions, games, forms and drawings stay open (E2E test).
- Typed catalogue `app/src/i18n/catalogue.ts` (1725 messages, stable keys = Spanish text, named parameters).
  User names and content are never translated: they are passed as parameters.
- Translation: 53 texts reused from the other version; the rest with the Claude CLI in batches of 80, without tools, with
  a JSON schema and validation of parameters, `$…$` and whitespace. Total cost 0.61 USD; 0 entries rejected.
  `npm run i18n:update` only sends new or invalid texts. The app uses no translator at runtime.
- `npm run i18n:check` and `app/tests/i18n.test.ts` check keys, parameters, empty texts and coverage.

## 3. Whiteboard

- Text, strokes, lines, rectangles, circles and arrows are the same object (`BoardStroke`): selection, export and sync all include the same things. Old circles and arrows stay visible and are converted on import.
- **Select** with a rectangle or lasso; move, scale from the corner and adjust text width with the side handle.
- Context bar: Edit, Copy, Cut, Duplicate, Delete, Paste and **Format** (size independent of the pen, sans/serif/monospace, colour, bold, italic, underline, alignment, line wrapping). The format can be chosen before typing.
- Internal clipboard with format and geometry (also across whiteboards) and plain text for the system; pasting external text creates a new text.
- Each gesture is a signed transaction (≤ 128 objects): local preview and a single commit; undo/redo act on the whole gesture.
- Copying other people's objects is allowed; moving, changing or deleting them is not. A selection that contains other people's objects is never half-transformed.

## 4. Self-hosted server

- `server/`: Node 24 + its own WebSocket (RFC 6455, no dependencies) + SQLite (`node:sqlite`), Dockerfile, compose, example Caddyfile and guide.
- Capacity 1–24, neighbourhoods of six plots, `ceil(n/6)` up to four; lowering the capacity neither deletes nor kicks anyone out.
- Existing ECDSA identity; signed challenge per connection. One-time claim secret for the first administration.
  Private invitations with uses and expiry, revocable; only their hash is stored.
- Persistent residents separate from presence. Temporary identities: visitors without a plot.
- Server authority ≠ administration ≠ activity organisation (first person present). The admin can leave.
- Transactions before confirming; idempotent request identifiers; house revisions with conflicts that keep the draft; automatic reconnection.
- Persistent per-neighbourhood signing scope (`worldId-nN`): signatures survive restarts and cannot be replayed in another neighbourhood.
- Werewolves, Gartic, quizzes and projects run on the server (`ActivityRoom`) with the same protocol as the P2P host.
  Each room of a house gets its own copy, available only to people inside that room.
  Gartic bots: only with the organiser's Ollama, and they turn off if the organiser leaves.
- Media: native WebRTC signalled over WSS, limited to the scene/house/private call (`WsMediaEndpoint`).
- Client: Settings → **Servers** (save URL, check compatibility, connect, capacity, invitations, import house and whiteboards, change neighbourhood).

## Evidence (2026-11-01, Linux, Node 24.16.0, headless Chrome)

| Check | Result |
|---|---|
| `npm run typecheck` (app + server) | passed |
| App tests (Vitest) | 134/134 |
| Server tests with real sockets and identities | 19/19 |
| `npm run i18n:check` | 1725 messages validated |
| `npm run build` and `npm run server:build` | passed |
| E2E real server + two browsers: claim, invite, temporary visitor, capacity 10 → 2 neighbourhoods, admin leaves, crossing the right edge into neighbourhood 2, restart and reconnection | passed |
| E2E in-place language switch (no reload, draft and drawing kept) and whiteboard (format, selection, duplicate, undo, delete) | passed |
| E2E gestures: single click does nothing on a computer, double click opens, E works up close | passed |
| E2E **emulated** touch (phone): one tap walks closer without opening on arrival, double tap opens; «Hidden» is remembered | passed |
| Full Playwright suite | 49 passed, 0 failed, 6 skipped (LIVE P2P, on demand only) |

The server tests cover: 6 / 10 / 24 people and four neighbourhoods at most, rejection of the 25th, revoked invitations,
forged signatures, other people's objects, signalling outside the scene, visits to «ask permission» and «closed» houses, atomic
import, backup, and disk failure without a false confirmation.

## Unverified or pending

- **Physical devices**: not tested on an iPad, a phone or with an Apple Pencil. Tests use desktop Chrome and emulated screen sizes.
- **Voice/screen/camera in server mode**: implemented, but not tested with two browsers and real media.
- **Activities in server mode from the UI**: the server logic is tested; a full E2E game with two browsers is still missing.
- **Docker**: Dockerfile and compose are written, but not built here (Docker is not installed on this machine).
- **Real deployment**: waiting for the owner to provide their server.
- Texts generated by Ollama are still requested in Spanish.
