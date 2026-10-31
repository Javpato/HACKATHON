# StudyVillage — Master Multiplayer Pixel-Art World Expansion Plan (`IMPLEMENTATION_PLAN.md`)

## 1. Existing Systems Identified in the Repository

- **Identity & Cryptographic Trust (`app/src/identity/`)**:
  - WebCrypto-backed `PublicIdentity` (`fingerprint` SHA-256 hex, `publicKey`, `displayName`, `color`), PBKDF2-SHA256 encrypted local storage (`EncryptedIdentity`), and signed contact cards (`Contact`).
- **P2P Session & Wire Protocol (`app/src/protocol/`, `app/src/session/`, `app/src/transport/`, `app/src/signaling/`)**:
  - Strict Zod schemas (`app/src/protocol/schema.ts`, `types.ts`) enforcing payload bounds (`65,536` bytes per message, max `6` members per neighborhood, `60s` host grace timeout, signed houses and board strokes, room-scoped media tokens).
- **2D Pixel-Art Rendering & Residential Village (`app/src/world/`, `app/src/house/`, `app/src/ui/art.ts`)**:
  - 2x HiDPI HTML5 Canvas (`1536×864` physical pixels over `768×432` logical units) with depth-sorted sprites (`baseline`), offscreen terrain caching, character walk/idle animation interpolation (`trackCharacter`), deterministic 6-parcel residential layout (`PARCELS`), and customizable house interiors (`drawHouseInterior`, `Furniture`).
- **Customizable Assets (`app/src/assets/custom-assets.ts`)**:
  - Declarative JSON asset pack validation (`validateAssetPack`) rejecting executable fields (`script`, `code`, `exec`, `wasm`, etc.) and enforcing `<= 512 KiB` PNG/JPEG/WebP data URLs.
- **Collaborative Whiteboard (`app/src/whiteboard/`)**:
  - Infinite camera (`BoardCamera`), per-author layers, freehand pen, line, rectangle, eraser, and inline text + MathJax LaTeX formula rendering (`math.ts`).
- **Local Code Editor & Offline Runner (`app/src/editor/`)**:
  - Local-first code notebook with TypeScript/JS, educational Python 3, and C++ transpilation/execution (`runner.ts`) plus study templates (`snippets.ts`).
- **Mobile & Touch Controls (`app/src/ui/mobile-controls.ts`, `app/src/ui/app.ts`)**:
  - Responsive virtual D-pad, contextual `E · Usar` action button, tap-to-walk, and two-finger pinch-to-zoom on whiteboards.

---

## 2. Components Reused Directly

- **Cryptographic Identity, Session Lifecycle & Media Rooms**: `app/src/identity/`, `app/src/session/client.ts`, `app/src/media/`, and `app/src/protocol/schema.ts` remain the authoritative foundation for player identity, host approval, and WebRTC voice/screen sharing.
- **Pixel-Art Toolkit (`app/src/ui/art.ts`)**: `PALETTE`, `fill`, `plate`, `contactShadow`, `glowPool`, `drawAvatar`, `drawTree`, `paintSceneFade`, and `reducedMotion()` are reused across all new world areas (`community`, `study`) and environmental overlays so visual style remains 100% cohesive and offline-safe.
- **Local Persistence (`app/src/storage/local-store.ts`)**: Extended backward-compatibly while preserving existing `LocalData` schema validation and IndexedDB/SQLite storage queues.
- **Existing Navigation & E2E Selectors**: All 5 primary navigation sections (`La aldea`, `Mi casa`, `Pizarra`, `Editor local`, `Contactos`), headings, and zero-external-network-on-boot guarantees tested by `app/tests/e2e/village.spec.ts` are preserved intact.

---

## 3. Components Extended

- **World & Scene Architecture (`app/src/world/`)**:
  - Extend `world/model.ts` and `world/draw.ts` with a multi-area registry (`app/src/world/areas.ts`) supporting:
    1. `residential` (**Barrio Residencial** — the 6 player houses + north/east/south pathways leading to the Community Plaza and Study Library).
    2. `community` (**Plaza Comunitaria** — shared neighborhood hub with interactive stations: Campfire/Round Table for **Werewolves / Loup-Garou**, Drawing Table for **Gartic Phone**, Arcade Machine, Large Community Whiteboard, Collaborative Project Terminal, and portal to the Study Library).
    3. `study` (**Biblioteca y Taller de Estudio** — dedicated creative & learning area with Shared Flashcard Podium, Secure Notes Desk, Study Whiteboard, Collaborative Project Desk, and Local Ollama AI Tutor Console).
    4. `house:<ownerId>` (Personal houses with owner-controlled furniture, custom sprites, renaming, and object-level permissions).
- **Whiteboard System (`app/src/whiteboard/`)**:
  - Extend with `app/src/whiteboard/boards-registry.ts` so every whiteboard is an independent persistent object keyed by stable `boardId` (personal house boards, community plaza board, study library board, and custom boards), supporting custom board names, custom sprites, circles/ellipses, arrows, element selection/move/resize/delete, author/collaborative undo & redo, remote participant cursors, and object-level view/edit permissions.
- **Editor & Collaborative Projects (`app/src/editor/`)**:
  - Extend into a multi-file VS Code–style workspace (`app/src/editor/projects.ts`) alongside the existing quick code notebook, featuring a file/folder tree, multi-tab editing, concurrent cursor/selection sync, project permissions, and **Host-Authorized Sandboxed Execution** bound to an immutable SHA-256 revision hash (preventing TOCTOU).

---

## 4. New Modules Created

| Module Path | Responsibility |
| --- | --- |
| `app/src/world/areas.ts` | Reusable scene/area definitions (`residential`, `community`, `study`, `house:<ownerId>`), portals, spawn points, occupancy tracking, and access rules. |
| `app/src/world/interactive-objects.ts` | Universal Interactive Object abstraction: stable `objectId`, type, editable `displayName`, custom sprite validation & assignment, collision/interaction rects, permissions (`public`, `participants`, `selected`, `host_only`, `private`), persistent state, and Zod schemas. |
| `app/src/world/environment.ts` | Synchronized Day/Night cycle (`morning`, `afternoon`, `sunset`, `evening`, `night`) + Weather (`clear`, `cloudy`, `light_rain`, `heavy_rain`, `fog`, `autumn_leaves`), window/lamp lighting, particle system, WebAudio synthesized ambient soundscape, and accessibility toggles. |
| `app/src/whiteboard/boards-registry.ts` | Independent multi-whiteboard store & sync manager keyed by `boardId`, supporting shapes (`circle`, `arrow`, `rectangle`, `line`, `pen`, `text`), selection/move/resize, undo/redo stacks, remote cursors, and per-board permissions. |
| `app/src/minigames/framework.ts` | Reusable multiplayer minigame state machine (`IDLE`, `LOBBY`, `STARTING`, `ACTIVE_ROUND`, `RESOLUTION`, `REVEAL`, `FINISHED`, `CANCELLED`), lobby management, timers, disconnect handling, and permission enforcement. |
| `app/src/minigames/werewolves.ts` | Authoritative Werewolves / Loup-Garou engine for 3–6 players (plus optional bot fill for practice/small groups), secret role filtering (`villager`, `werewolf`, `seer`, `witch`, `guard`), Night private actions, Day discussion & single-vote enforcement, elimination, and win conditions. |
| `app/src/minigames/gartic-phone.ts` | Complete Gartic Phone drawing & guessing chain engine: conflict-free modulo chain routing `(playerIdx + round) % N`, prompt phase, full canvas drawing phase, guessing phase, unrevealed chain privacy, and sequential animated Reveal Phase with reactions. |
| `app/src/editor/projects.ts` | Multi-file collaborative project explorer, tabs, concurrent file sync, permissions, and TOCTOU-safe Host-Authorized Execution workflow with sandboxed worker/timeout limits. |
| `app/src/notes/secure-notes.ts` | Non-executable Secure Notes application: notebooks/folders, independent `noteId`s, search, strict allowlist Markdown + LaTeX sanitizer (zero raw HTML/script/XSS/event-handler execution), private/shared permissions, and direct selection-to-flashcards workflow. |
| `app/src/ai/ollama-gateway.ts` | Optional Host-Side Local Ollama Gateway (`http://127.0.0.1:11434`, opt-in only), model discovery, strict Zod JSON validation, concurrency/rate limits, AbortController timeouts, Flashcard Deck generator/editor, and Multiplayer Study Session engine. |

---

## 5. Data Models and Network Messages

- **Area & Object Sync**:
  - `AreaId`: `'residential' | 'community' | 'study' | \`house:\${string}\``
  - `InteractiveObjectConfig`: `{ id, areaId, kind, displayName, customSpriteDataUrl, customColor, x, y, w, h, hasCollision, interactionRadius, ownerId, visibility, editPermission, usePermission, state }`
- **Environment State**:
  - `EnvironmentState`: `{ timeOfDay: 'morning' | 'afternoon' | 'sunset' | 'evening' | 'night', cycleMode: 'auto' | 'manual', cycleSpeed: number, weather: 'clear' | 'cloudy' | 'light_rain' | 'heavy_rain' | 'fog' | 'autumn_leaves', weatherIntensity: number, ambientAudioEnabled: boolean, ambientVolume: number, particleDensity: 'low' | 'medium' | 'high' | 'off', revision: number }`
- **Minigame Envelopes**:
  - `MinigameLobbyState`, `WerewolvesPrivateView` (strictly filtered per player so secret roles/actions never leak to unauthorized peers), `GarticChainSubmission`, `GarticRevealState`.
- **Collaborative Project & Execution Proposal**:
  - `ProjectWorkspace`: `{ id, name, ownerId, permission, files: Record<path, ProjectFile>, revision }`
  - `ExecutionProposal`: `{ requestId, projectId, proposerId, proposerName, command, entrypoint, args, cwd, envKeys, revisionHash, createdAt, status: 'pending' | 'approved' | 'denied' | 'running' | 'completed' | 'terminated' | 'failed' }`
- **Secure Notes & Flashcards**:
  - `SecureNote`: `{ id, notebookId, title, content, ownerId, visibility: 'private' | 'shared_read' | 'shared_write', updatedAt, tags }`
  - `FlashcardItem`: `{ id, question, answer, hint, explanation, sourceRef, topic, difficulty: 'easy' | 'medium' | 'hard', tags }`
  - `StudySessionState`: `{ sessionId, deckId, hostId, currentCardIndex, answerRevealed, participants, selfAssessments }`

---

## 6. Dependencies

- **Zero new heavy runtime dependencies required**:
  - Validation uses existing `zod` (`^4.6.7`).
  - LaTeX rendering uses existing `mathjax-full` (`3.2.2`).
  - Cryptography and SHA-256 revision hashing use native WebCrypto (`crypto.subtle`) / deterministic SHA-256.
  - Ambient audio uses native browser `AudioContext` synthesis (zero external MP3/CDN requests).

---

## 7. Testing Strategy

- **Unit & Integration Tests (`app/tests/*.test.ts` via Vitest)**:
  1. `world-expansion.test.ts`: Area definitions, portal transitions, interactive object registry, custom sprite validation, renaming, and permission checks.
  2. `whiteboard-multi.test.ts`: Independent `boardId` isolation, custom shapes/arrows/selection, undo/redo, and board permissions.
  3. `minigames.test.ts`: Reusable minigame framework lifecycle, Werewolves role assignment, night action resolution, single-vote day resolution, win conditions, and strict per-player secret role filtering; Gartic Phone modulo chain routing, round progression, and unrevealed chain privacy.
  4. `projects-and-notes.test.ts`: Secure Notes XSS/script/protocol sanitization guarantees; Collaborative Project file tree, revision hash computation, and TOCTOU-safe host execution approval/denial.
  5. `ollama-and-environment.test.ts`: Environment Day/Night & weather transitions; Host Ollama gateway opt-in enforcement, rate limiting, Zod validation of flashcards/quizzes, and multiplayer study session state machine.
- **Browser Verification**:
  - Verify compilation via `compile_applet`, run full Vitest suite via `npm test`, and inspect live rendered UI via `playwright-cli`.

---

## 8. Implementation Order & Risk Mitigation

1. **Phase A**: Write `IMPLEMENTATION_PLAN.md` and `OLLAMA_INTEGRATION_DESIGN.md`.
2. **Phase B**: Implement `app/src/world/areas.ts`, `app/src/world/interactive-objects.ts`, `app/src/world/environment.ts`, and update `app/src/world/draw.ts` to render the Residential Village (with Plaza & Library portals), Central Community Plaza (with interactive game/study stations), and Creative & Study Library (with study/AI/notes stations) + Day/Night & Weather overlays.
3. **Phase C**: Implement `app/src/whiteboard/boards-registry.ts` (independent multi-boards, shapes, selection, redo) and `app/src/notes/secure-notes.ts` (strictly non-executable Markdown + LaTeX notes & notebooks).
4. **Phase D**: Implement `app/src/minigames/framework.ts`, `app/src/minigames/werewolves.ts`, and `app/src/minigames/gartic-phone.ts`.
5. **Phase E**: Implement `app/src/editor/projects.ts` (VS Code–like multi-file workspace + TOCTOU-safe host-approved sandboxed execution).
6. **Phase G**: Implement `app/src/ai/ollama-gateway.ts` (opt-in local Ollama gateway, flashcard deck generator/editor, and multiplayer study session controller).
7. **Phase H**: Wire all systems cleanly into `app/src/ui/app.ts` and `app/src/ui/style.css` while preserving all existing E2E selectors and zero-external-requests-on-load behavior, then run comprehensive automated tests and browser checks.
