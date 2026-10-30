# Frozen module contract v1

Integrator owns `app/src/protocol/types.ts`, bootstrap, package/lockfiles, build configuration, docs, native shell and persistence. Networking owns identity/signaling/transport/session/media, runtime validators under protocol (not types.ts), and its tests. UI owns world/house/whiteboard/editor/ui and its tests. Work happens in separate worktrees; only the integrator merges. Changes to this contract require notifying the integrator first.

## Boundaries

- `VillageClient` (`session/client.ts`) is constructed with `LocalIdentity`, own `PublicHouse` and an optional options object. It exposes `subscribe(listener): unsubscribe`, `view`, and the methods in `VillageActions` below. It never writes disk, calls native filesystem APIs or imports UI modules.
- `createStudyUI(root, actions)` (`ui/app.ts`) returns `{update(view), destroy()}`. Render input is `AppView`; gestures call `AppActions`. Canvas/UI never imports PeerJS, native APIs or storage.
- Identity module (`identity/index.ts`) exports `generateIdentity(name,color)`, `encryptIdentity(identity,passphrase)`, `decryptIdentity(encrypted,passphrase)`, `exportContact(identity,friendCode)`, `parseContact(json)`. Use standard WebCrypto ECDSA P-256, SHA-256 fingerprints, authenticated challenge-response bound to session/epoch, both endpoints and fresh nonces. Contacts recompute fingerprints. Any incoming claimed identity must match the authenticated connection; reject replay/wrong epoch/wrong role before applying.
- Root handles local storage, diagnostics panel and local editor/import/export actions. UI may implement its editor view, but local file reads only follow a user selection. No automatic execution.

## Data rules

`types.ts` is the normative TypeScript surface. Houses identify their owner by cryptographic fingerprint. Layout snapshots contain only explicit public fields. Positions: finite logical coordinates 0..768 x 0..432. Furniture is 0..736 x 0..400, max 32 per house. Six members, first free slot, monotonic roster revision. Member.houseId is null on the map. Closed/unknown/offline owners cannot grant new visits. Owner edits only; coordinator does not edit others' layouts.

Network schema must be strict (unknown keys rejected). Maximum wire message 64 KiB; bounded reliable queues (max 128 messages / 1 MiB per peer); positions coalesced/dropped under backpressure. Maximum 120 messages/s with a short burst, pending approvals <=12, auth timeout <=15 s. Async verification is serialized with bounded input. Board: <=512 points/stroke, <=2,000 operations per board; author-only changes, idempotence, tombstones, capped offline retry with visible saturation. No unbounded reconnect/sync queues. Private keys, project paths, source content, SQL and commands have no network schema.

Pending visitors receive no roster/layout/media before authenticated approval. Mesh links are authenticated against coordinator-approved roster keys/endpoints. Media calls require an authenticated data link and current same-house membership, checked on receive and on every transition. Stop tracks and tear down outgoing/incoming calls before room changes, leave, kick, or host expiry. Signaling loss alone must not destroy healthy P2P links. Host recovery needs fresh authentication for the same session/epoch; detection uses local monotonic time.

## Integration

`AppView` is immutable from UI perspective; MediaStream references are ephemeral exceptions. UI must escape all remote strings with textContent. No source HTML interpolation. `render`/update must preserve focused inputs and mounted media elements. Local actions can fail; UI/root shows Spanish error without secrets. Media tests must explicitly label fake devices or synthetic streams; never describe loopback as two computers.

