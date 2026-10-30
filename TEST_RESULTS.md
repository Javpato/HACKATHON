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
| GitHub authentication | PASS: authenticated as `Javpato`; private repo `Javpato/HACKATHON` created and `main` pushed. No workflow run observed yet. |
| Vitest full suite | PASS, 44 tests in 9 files |
| Vite production build | PASS, full app bundle (~117 kB bootstrap chunk) |
| Playwright browser suite | PASS, 9 tests: 3 diagnostic + 6 local village |
| Browser console on load | PASS, zero errors in dev and in `preview` production bundle |
| Local UI navigation / persistence / board undo / avatar movement | PASS, covered by `app/tests/e2e/village.spec.ts` |
| GitHub Actions desktop build | PASS on both runners (run `41121041595`): `windows-2022` produced `StudyVillage_0.1.0_x64-setup.exe` (NSIS, PE32, 2.7 MB); `ubuntu-22.04` produced `StudyVillage_0.1.0_amd64.deb` (4.1 MB) and `StudyVillage_0.1.0_amd64.AppImage` (79 MB). Unsigned. |
| Native Linux runtime (Tauri/WebKitGTK) | PASS, first observation: the CI AppImage launched on Linux Mint 22.3 / Cinnamon X11, opened a real 2560x1408 `StudyVillage` window and rendered the full UI (house interior, furniture list, nav, panels). Only benign `xapp-gtk3-module` GTK warnings. |
| Windows runtime | UNVERIFIED; the installer exists and is a valid PE32 NSIS binary, but it has not been installed or launched on Windows. |
| Visual overhaul: render loop | PASS, 61 rAF frames/s measured in page; frame pacing p50 16.7 ms, p95 16.8 ms idle, walking and indoors at 1920x1080 after caching the vignette and glow gradients (p95 was 33.4 ms before caching). |
| Visual overhaul: character animation | PASS, 4 of 4 consecutive frames differ while walking; idle breathing observed; remote peers interpolated, local peer drawn at exact position. |
| Visual overhaul: reduced motion | PASS, under `prefers-reduced-motion: reduce` the scene is byte-identical across 1 s with no input, and still responds to keys. Covered by e2e. |
| Visual overhaul: layout | PASS, zero horizontal overflow at 1600, 900 and 420 px wide; zero console errors in all three. |
| Visual overhaul: appearance | Reviewed by screenshot at each iteration in Chrome. |
| Visual overhaul: native rendering | PASS, the CI AppImage from run `41131050489` was launched on Linux Mint and rendered the whole new interface under WebKitGTK: chamfered `clip-path` panels, parchment cards and all six drawn SVG navigation icons with the ember active state. |
| Visual overhaul: native scene fade | PASS, driven through XTEST in the packaged app. Clicking "Mi casa" flipped the stage from green-dominant (G-R +38.3) to wood-dominant (G-R -26.1), confirming navigation, and mean luminance over the following frames ran 16.0, 54.1, 105.9, 120.5, 128.4 before settling at 131.0: an ease-out fade of roughly 275 ms against a 300 ms design. |

Local environment: Linux Mint 22.3 (Ubuntu noble), Cinnamon X11, x86_64. GTK/WebKitGTK runtime libraries exist; pkg-config development metadata is absent. `sudo -n true` reports a password is required. No system package installation was performed.

The browser tests needed loopback/browser subprocess access outside the restricted network sandbox. The synthetic test uses Canvas-generated video and an oscillator, two WebRTC peers in one browser, and no real capture source. The denial test overrides getUserMedia solely inside its test context. Neither qualifies as TWO_LINUX_HOSTS_TESTED.

See [the manual media protocol](docs/MEDIA_TEST_PROTOCOL.md) for the remaining real-hardware acceptance matrix.
