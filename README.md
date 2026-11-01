# StudyVillage

A small pixel-art neighbourhood for studying together. Everyone has their own house with floors and rooms, and shares voice, screen, whiteboards, projects and review cards with friends. The interface is available in **English and Spanish** (Menu → Settings → Profile → Language).

**Current version: 0.3.3** · Android, Windows, Linux and browser.

## Download and install

All installers are on **[Releases → v0.3.3](https://github.com/Javpato/HACKATHON/releases/tag/v0.3.3)**. You don't need Node, Rust or a copy of the source code.

> To play together, **everyone must use the same version** (0.3.3).

### Android — `StudyVillage-0.3.3.apk`

1. Download the `.apk` on your phone (or send it over WhatsApp, Telegram, Drive or a cable).
2. Open it. Android will warn about an "unknown source": tap **Settings** and turn on **Allow from this source** for the app you opened it with.
3. Tap **Install**. If Play Protect warns you, tap **Install anyway** (the app isn't from the Play Store).
4. If you already have a 0.3.x version, it installs on top and keeps your data.

Held upright, the phone works like a handheld console: the screen at the top follows your character (zoom with **− / +**) and the controls sit below it. You can move and resize the controls in **Menu → Settings → Controls**, with one layout for portrait and another for landscape. Screen sharing isn't available on Android; voice and camera are.

### Windows — `StudyVillage_0.3.3_x64-setup.exe`

1. Download and run the installer.
2. The installer isn't signed: if SmartScreen appears, click **More info → Run anyway**.
3. If the computer doesn't have WebView2, the installer downloads it.
4. Open **StudyVillage** from the Start menu.

### Linux — `.AppImage` or `.deb`

- **AppImage** (any distribution):
  ```bash
  chmod +x StudyVillage_0.3.3_amd64.AppImage
  ./StudyVillage_0.3.3_amd64.AppImage
  ```
- **Debian / Ubuntu / Mint**:
  ```bash
  sudo apt install ./StudyVillage_0.3.3_amd64.deb
  ```
  Then open **StudyVillage** from your applications menu.

Screen sharing on Wayland needs PipeWire and the `xdg-desktop-portal` backend for your desktop.

### In the browser

From a copy of the source (see [Development](#development)), run `npm run dev` and open `http://localhost:3000`. To try it from a phone on the same network, use HTTPS: `SV_HTTPS=1 npm run dev` and open `https://<computer-ip>:3000`. Browsers only allow the app's encryption on `localhost` or over HTTPS.

## How to play

1. Pick a name and a colour. Everything opens from the **Menu** button (M key).
2. **Open your village:** Menu → Village → **Open my village to others**. Copy the invitation and send it to your friends; they paste it into **Paste an invitation** → **Join**, and you accept them.
3. Walk with WASD/arrow keys, the touch pad, or by tapping the ground. **Double-click or double-tap** (or **E** up close) opens houses, furniture, stations and portals.
4. The village has six plots; the **Community** square is to the north and the **Library** to the south.
5. **Your house:** decorate it (catalogue, rotate, grid, move doors), add **floors and rooms**, and choose who can come in. Each room has its own projects, review cards, quizzes, notes and whiteboards.
6. **Furniture:**
   - Desk → Projects (repository, VS Code Live Share and tasks).
   - Bookshelf and **Review cards** → Study (notebooks, flashcards and quizzes).
   - Whiteboard → shared whiteboard.
   - Table → voice.
   - Wardrobe → your character's clothes.
7. **In the square:** Werewolves and Gartic Phone, with an optional camera.
8. **Contacts:** add people from your session, give them a nickname and share your contact card (on Android, via WhatsApp).
9. Voice, screen and camera only start when you choose to, and you can always see who is listening.

Notices show one at a time (only the latest) and close with **×**.

## Your own server (optional)

By default the village is peer-to-peer: the host coordinates and nothing is stored on a central server. If you want the world to stay open when nobody is online, you can run your own server (Node 24 + SQLite, up to 24 people). See **[server/README.md](server/README.md)** and [docs/SERVER.md](docs/SERVER.md). Connect to it from Menu → Settings → Servers.

## Development

Requires **Node 24** and npm.

```bash
git clone https://github.com/Javpato/HACKATHON.git
cd HACKATHON
npm ci
npm run dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run check` | typecheck, unit tests (app and server), language catalogue, web and server builds |
| `npm run test:e2e` | browser tests (Playwright; uses the system Chrome or `CHROME_PATH`) |
| `npm run desktop:build` | Tauri installers for Linux (deb + AppImage) |
| `npm run server:build` / `server:start` | build and start your own server |
| `CLAUDE_BIN=~/.local/bin/claude npm run i18n:update` | translate new interface text into English |

New interface text: wrap it in `msg('…')` or `t('…')` and run `i18n:update`. The language test fails if any text is missing from the catalogue.

**Android:** run `npm run build && npx cap sync android && android/gradlew -p android assembleDebug`. This needs JDK 21 and the Android SDK. The APK ends up in `android/app/build/outputs/apk/debug/`.

**Windows and Linux:** the [desktop.yml](.github/workflows/desktop.yml) workflow builds the Windows installer and the Linux packages on every change to `main`. [check.yml](.github/workflows/check.yml) runs every test.

### Project layout

| Folder | Contents |
|---|---|
| `app/src` | the game (TypeScript + Canvas): `ui/`, `world/`, `house/`, `minigames/`, `study/`, `media/`, `i18n/` |
| `app/tests` | unit tests (Vitest) and browser tests (`e2e/`, Playwright) |
| `app/src-tauri` | desktop shell (Tauri 2, Rust) |
| `android` | Android app (Capacitor) |
| `server` | optional self-hosted server (Node 24 + SQLite, Docker) |
| `scripts` | translation and local HTTPS tools |
| `docs` | [server](docs/SERVER.md), [study](docs/STUDY.md), [contracts](docs/CONTRACTS.md), [decisions](docs/DECISIONS.md), [visual design](docs/VISUAL_DESIGN.md) |

## Privacy

- Your identity is a key pair (ECDSA P-256); names grant no permissions. You can save it encrypted with a password.
- Houses, notes and projects stay on your device. Only furniture names, types and positions are published.
- Peer-to-peer mode uses PeerJS's free signalling service and STUN: the provider sees metadata, and participants can learn each other's IP addresses. Some networks block peer-to-peer connections, and no TURN relay is included.
- The app never records voice, screen or camera.

## License

Not decided yet. The origin of the graphic assets is recorded in [ASSETS_LICENSES.md](ASSETS_LICENSES.md).
