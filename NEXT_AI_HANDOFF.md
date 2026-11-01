# Latest update — mobile follow-up completed

All eight requested mobile follow-up tasks are implemented sequentially. See [docs/MOBILE_FOLLOWUP.md](docs/MOBILE_FOLLOWUP.md). Tap/text selection is suppressed on touch UI, HUD editing has a grid and independent orientation previews, portrait phone uses a screen/control deck arrangement, game voice is compact, session contacts support private nicknames, floor/room doors can be dragged in decoration, resolved permission notifications clear, public JSON contact cards can be shared via WhatsApp, and the mobile board has a protected back button.

The game camera implementation/styles were not changed. Spanish and English catalogue: 1,910 messages. Full `npm run check` passes (168 app + 18 server tests); 13 final browser regression tests plus 3 focused Gartic camera checks pass. Native Android compilation and APK signing/assets were verified. Real WhatsApp recipient selection/send remains a physical-device check.

Current APK: `deliverables/android-0.3.2/StudyVillage-0.3.2-mobile-update.apk` (5.4 MB), same signing certificate as the previous APK. Protocol is now **4** because durable door positions extend signed public house metadata. Rebuild/restart server and clients together. Contacts added in a session store verified public identities without inventing friendship codes; nicknames stay local and are excluded from public card exports. No deployment or commit was made.

---

# Latest update — friend access and house management

The house/floor/room management UI now uses soft phone-style cards and 44 px controls. Menu → Rooms / Habitaciones → Allowed friends / Amigos autorizados lets owners select saved contacts separately for the house lobby and each room (up to 24 per list). All new UI is in Spanish and English.

Room access includes transit through the lobby and the relevant floor, but never other rooms. House access opens only the lobby. Trusted friends may enter a closed house. Automatic grants are rechecked and revoked when lists change; temporary manual approvals keep their original visit semantics. Identity fingerprints, not names or online status, authorize entry.

Self-hosted saves explicitly await the server's durable house-publish acknowledgement, including when the house has never been imported. Policies stay in the signed SQLite house document across restarts. Reconnecting does not republish stale local metadata. Decorations/imports preserve authoritative permission lists; explicit permission saves report revision conflicts. Server protocol is **3**: update the app and restart the server together.

Verification: `npm run check` passes (165 app tests, 18 server tests, 1,888 ES/EN messages, both builds). Seven affected browser tests cover desktop/phone/tablet lists and persistence, existing room/board behavior, and a real server restart followed by room entry with its owner offline. Screenshots are in `test-results/house-spaces-{phone,tablet,desktop}.png`. No deployment or commit was made.

---

# Latest update — requested improvements completed

All ten sequential tasks are implemented and verified. See [docs/UPGRADE_PROGRESS.md](docs/UPGRADE_PROGRESS.md) for completion evidence, controls, constraints and remaining physical-device verification.

Final checks: `npm run check` passes (160 app tests, 17 server tests, ES/EN catalogue, app/server builds); 25 affected browser checks pass. Server protocol is 2, so update/restart the server with the new client. No deployment, installer or commit was made.

Key additions: partial/stroke erasers with sizes, exclusive global voice channels, visible lamp sources, scoped private floor/room workspaces, mobile HUD editor, screen capture capability handling, headphone colors, side-facing bodies, 20-unit interaction reach and upright furniture facings.

---

# Handoff — interaction, English, editable board and self-hosted server

Status 2026-11-01: **the requested block is implemented and tested**, continued from an interrupted session.
Full status, evidence and remaining gaps: [docs/SERVER.md](docs/SERVER.md). Owner guide: [server/README.md](server/README.md).
No commit, deployment or installer was made.

## Rules that still apply

- Active project: this folder. `../lane-development-3katzf/studyvillage-recreado` is reference only.
- Git: the effective repository is an ancestor folder with many unrelated projects. Never run unscoped `git status/add` there.
- Do not edit files under `app/src` while Playwright runs against the Vite dev server: HMR reloads cause false failures.

## Where things are

| Area | Files |
|---|---|
| Gestures, touch preference | `app/src/input/gestures.ts`, `onStagePointerDown` in `app/src/ui/app.ts` |
| Language | `app/src/i18n.ts`, `app/src/i18n/{catalogue.ts,es.json,en.json}`, `scripts/i18n-*.mjs` |
| Board editor | `app/src/ui/board-editor.ts`, `app/src/whiteboard/selection.ts` |
| Server | `server/src/{main,world,store,ws}.ts`, `server/tests`, `server/Dockerfile` |
| Server contract + browser adapter | `app/src/server/{contracts,client}.ts`, `app/src/ui/servers-ui.ts` |
| Activities on a server | `applyRoomCommand`/`REMOTE_AUTHORITY` in `app/src/minigames/room.ts`, `ActivityRoom` in `server/src/world.ts` |

## Commands

```bash
npm run check            # typecheck (app+server), unit tests (app+server), i18n check, build, server bundle
npx playwright test --config app/playwright.config.ts   # browser suite (needs npm run server:build for server.spec)
CLAUDE_BIN=~/.local/bin/claude npm run i18n:update       # translate only new/invalid strings, rebuild, validate
```

New interface text: wrap it in `msg('…')` (DOM, live switch) or `t('…')` (one-off strings), then run `npm run i18n:update`.
`app/tests/i18n.test.ts` fails if a `msg()`/`t()` literal is missing from the catalogue.

## Not yet verified (see docs/SERVER.md)

Physical iPad/phone/Pencil; server-mode voice/screen/camera between two browsers; a full game through the UI on a server;
building the Docker image (Docker is not installed on this machine); deployment on the owner's real server.
