# StudyVillage test evidence

2026-10-30. Initial source baseline: `be14184`; implementation changes not yet committed. This file records observed outcomes, not acceptance promises. Final rerun and commit reference will be recorded after integration.

| Check | Observed result |
|---|---|
| Node/npm | 24.16.0 / 11.13.0 |
| TypeScript scaffold + diagnostic + storage | PASS |
| Vitest local storage | PASS, 6 tests |
| Vite production build | PASS, diagnostic slice |
| Chrome browser diagnostic | PASS, 3 tests: no signaling on load, synthetic real WebRTC audio/video/data loopback, simulated permission denial |
| Rust toolchain | Installed in isolated `/tmp` location; rustc 1.99.1 |
| Native SQLite tests | PASS, 5 tests: migration/roundtrip, rollback validation, privacy keys, newer schema refusal, corrupt-data preservation |
| Full native Linux build | BLOCKED: actual build fails in glib-sys; pkg-config cannot locate glib-2.0.pc. No Linux package produced. |
| Real microphone / screen capture | UNVERIFIED; no claim of observation |
| Two Linux machines / different networks | UNVERIFIED; no second host supplied |
| Windows build / runtime | UNVERIFIED; workflow configured only |
| GitHub authentication | FAIL: invalid existing token; no repository created or workflow run |

Local environment: Linux Mint 22.3 (Ubuntu noble), Cinnamon X11, x86_64. GTK/WebKitGTK runtime libraries exist; pkg-config development metadata is absent. `sudo -n true` reports a password is required. No system package installation was performed.

The browser tests needed loopback/browser subprocess access outside the restricted network sandbox. The synthetic test uses Canvas-generated video and an oscillator, two WebRTC peers in one browser, and no real capture source. The denial test overrides getUserMedia solely inside its test context. Neither qualifies as TWO_LINUX_HOSTS_TESTED.

See [the manual media protocol](docs/MEDIA_TEST_PROTOCOL.md) for the remaining real-hardware acceptance matrix.
