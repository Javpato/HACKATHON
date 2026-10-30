# StudyVillage implementation decisions

2026-10-30 — The current user explicitly authorized implementation and overrides the planning-only statements in the master specification. The complete 567-line specification was read before scaffolding.

- TypeScript, Vite, Canvas 2D; Tauri 2 is the provisional native shell. The browser build is a development/test fallback, not evidence of Linux desktop capture.
- First slice: media capability/permission/stop diagnostic. Real microphone, window/monitor capture, cross-machine transport, and desktop packaging require observed evidence. Unsupported or unavailable tests stay UNVERIFIED.
- Native prerequisites currently missing: Rust/Cargo and GTK/WebKitGTK development packages. Runtime GTK/WebKit libraries exist; they do not suffice to compile. Linux Mint 22.3, Cinnamon X11, Node 24.16.0, npm 11.13.0. System details are recorded only locally, never sent as telemetry.
- WebRTC via PeerJS free signaling; explicit STUN configuration, no TURN, no paid backend, no project upload. Connecting discloses IPs and signaling metadata. No network connection until host/join is clicked.
- Identity uses standard WebCrypto ECDSA P-256 signatures (widely supported by WebViews); not display names or PeerJS IDs. Private keys are memory-only by default. Optional persistence requires user passphrase encryption; no claim of OS keyring integration. Public contact export never includes a private key.
- Six fixed slots; host slot 0. Host and house-owner authority are distinct. Monotonic 60-second grace; no host migration. Voluntary leave has a bounded ACK timeout.
- Local profile/layout/contact/editor state only: SQLite in Tauri, IndexedDB in browser development. Remote houses, roster, invitations, tracks and remote board state remain in memory.
- Explicit public-house projection excludes private project metadata. No network message can open a file, launch a process, or invoke native commands. No shell/execution interface exists.
- Desktop media selection is controlled by OS APIs with visible consent and stop controls. System audio and six simultaneous shares are not promised.
- UX is Spanish; module/event/test identifiers are English. Art is original Canvas drawing, not third-party sprites. No final software or asset license selected.
- GitHub authentication is invalid. Local Git is initialized; no GitHub repository, public publication, release, or hosted infrastructure is created.

Evidence levels: DESIGNED, CODED, UNIT_TESTED, INTEGRATION_TESTED, TWO_LINUX_HOSTS_TESTED, WINDOWS_BUILD_ONLY, WINDOWS_RUNTIME_TESTED. Only use the last three after actual observation.

