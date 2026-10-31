# StudyVillage

Cambios recientes y trabajo pendiente de servidor permanente: [punto de continuación](docs/CONTINUATION.md).

Un pequeño vecindario para estudiar juntos: casas propias, avatares, voz, pantalla y pizarra. Los proyectos permanecen en el equipo de su dueño. Interfaz en español, código TypeScript + Canvas, shell Tauri 2.

**Estado: implementación en integración; P0 no certificado.** El empaquetado nativo ya pasa en CI y el `.AppImage` arranca en Linux. Siguen sin evidencia la prueba entre dos equipos, la captura real de micrófono/pantalla y la ejecución en Windows. Consulta [STATUS](docs/STATUS.md) y [TEST_RESULTS](TEST_RESULTS.md). No se ha publicado el proyecto ni decidido una licencia final.

## Ejecutar la versión de desarrollo

Requiere Node 24 (probado 24.16.0) y npm.

```bash
npm ci
npm run dev
```

También existe `npm run demo`, que levanta Vite y abre el navegador. El recorrido guiado de lo que ya funciona está en [DEMO](docs/DEMO.md).

Abre `http://127.0.0.1:1420`. El servidor Vite es solo una herramienta local de desarrollo; la app empaquetada carga los recursos incluidos y no necesita Node ni un servidor de aplicación.

Para el primer gate de medios, abre `http://127.0.0.1:1420/?diagnostic=1`. Permite comprobar APIs, solicitar micrófono/pantalla, detener pistas, exportar resultados y ejecutar un loopback de medios sintéticos. La prueba sintética no valida una captura real ni otro equipo.

## Uso

1. Elige nombre y color. Tu identidad criptográfica es independiente del nombre.
2. Decora tu casa y guarda snippets localmente. Exporta/importa contactos para reconocer huellas; el código amigo no es un servicio de presencia.
3. «Abrir vecindario» conecta con la señalización gratuita. Copia la invitación y compártela fuera de la app. La persona invitada solicita acceso; el coordinador acepta o rechaza.
4. Hay seis parcelas fijas: coordinador en 0 y siguientes en el primer hueco libre. Cada persona conserva su propia casa. Entra con permiso, camina con WASD y usa los muebles.
5. Dentro de una casa, activa micrófono o comparte pantalla con un gesto explícito. Comprueba el indicador de quién te escucha. Detén la captura antes de mostrar contenido privado.
6. Pizarra por autor, ocultación local de capas, deshacer lo propio y exportar PNG. Los archivos abiertos en el editor o visor siguen siendo locales.
7. «Salir» siempre permite abandonar. Una caída inesperada del coordinador ofrece 60 segundos desde su detección; después se cierra la sesión, sin migración de host.

La identidad es temporal en RAM por defecto. Para reconocer el mismo contacto tras reiniciar, guárdala **cifrada con una contraseña** y desbloquéala en la siguiente apertura. No hay recuperación de contraseña ni integración de keyring del SO en esta entrega. La casa y el editor pueden persistir aunque uses una identidad temporal.

## Linux / Tauri

Desarrollo primario Linux. En Ubuntu/Mint instala los [prerrequisitos oficiales de Tauri](https://v2.tauri.app/start/prerequisites/) y Rust con rustup:

```bash
sudo apt-get update
sudo apt-get install libwebkit2gtk-4.1-dev build-essential curl file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  pkg-config libdbus-1-dev
```

Para Wayland, verifica PipeWire y el backend de `xdg-desktop-portal` de tu escritorio. Su instalación no garantiza que WebKitGTK implemente la captura requerida.

```bash
npm run desktop:dev
npm run desktop:build
```

Los paquetes se generan en `app/src-tauri/target/release/bundle/`. La configuración incluye deb y AppImage. **Este entorno no los genera:** faltan las bibliotecas de desarrollo y el intento observado falla en `glib-sys` por ausencia de `glib-2.0.pc`. En cambio el workflow de GitHub sí los produce, porque el runner instala esas bibliotecas. El `.AppImage` descargado de CI se ha ejecutado en este equipo y abre una ventana WebKitGTK real con la interfaz completa.

Se instaló una toolchain aislada en `/tmp/studyvillage-cargo` y `/tmp/studyvillage-rustup` para probar SQLite. No se modificaron los perfiles de shell. Es temporal; para reutilizarla mientras exista:

```bash
CARGO_HOME=/tmp/studyvillage-cargo RUSTUP_HOME=/tmp/studyvillage-rustup \
  PATH=/tmp/studyvillage-cargo/bin:$PATH \
  cargo test --locked --manifest-path app/src-tauri/Cargo.toml --no-default-features --lib
```

La matriz manual está en [MEDIA_TEST_PROTOCOL.md](docs/MEDIA_TEST_PROTOCOL.md). Si Tauri falla capturando en el entorno real y Electron funciona con evidencia, se puede cambiar el shell sin reemplazar el dominio/Canvas.

## Windows

En Windows se necesitan MSVC Build Tools, Rust y WebView2, según los prerrequisitos de Tauri. Ejecuta:

```powershell
npm ci
npm run desktop:build -- --config src-tauri/tauri.windows.conf.json
```

Se configura un instalador NSIS `.exe`. [.github/workflows/desktop.yml](.github/workflows/desktop.yml) compila Linux y Windows en runners de cada plataforma y conserva artifacts; no publica releases.

**El workflow ya se ha ejecutado y pasa en los dos runners.** Genera `StudyVillage_0.1.0_x64-setup.exe` (NSIS) en Windows y `.deb` + `.AppImage` en Linux. Descargar el instalador sin clonar nada:

```bash
gh run list --workflow "Desktop build only (no publication)"
gh run download <run-id> -n StudyVillage-Windows-BUILD-ONLY -D ./descargas
```

Esto es `WINDOWS_BUILD_ONLY`: el `.exe` existe y es un PE32 NSIS válido, pero **nadie lo ha instalado ni ejecutado en Windows**. Va sin firmar, así que SmartScreen avisará.

## Comprobar

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
cargo test --locked --manifest-path app/src-tauri/Cargo.toml --no-default-features --lib
```

Los tests de navegador usan Chrome del sistema (`/usr/bin/google-chrome`); se puede definir `CHROME_PATH`. En CI se instala Chromium de Playwright. Los tests de transporte simulado o del navegador en una máquina no sustituyen dos portátiles.

## Privacidad y límites

- PeerJS gratuito ayuda a descubrir endpoints; STUN ayuda a negociar ICE. El proveedor ve metadatos de señalización y los peers pueden conocer sus IP. No hay almacenamiento central de casas ni proyectos. Algunas redes impiden P2P; se informa el fallo y se puede reintentar. No se incluye TURN.
- Los mensajes tienen versión, esquema, autenticación y límites. La identidad se verifica con firmas ECDSA P-256 y challenge-response. Nombres iguales no conceden permisos.
- Solo se publican alias, tipos y coordenadas de muebles. Las rutas, archivos, snippets y claves privadas nunca forman parte de snapshots públicos. No existe ejecución remota ni API de acceso remoto al filesystem.
- SQLite guarda datos propios en el directorio de datos de Tauri; el navegador de desarrollo usa IndexedDB. SQLite no cifra tus snippets/proyectos. Las claves persistidas sí van cifradas de forma opt-in. Los datos remotos se conservan en RAM y se limpian al terminar; no se promete borrado forense del SO.
- Máximo seis miembros; colas, payloads y pizarra acotados. Voz tiene prioridad sobre la pantalla (captura ideal de hasta 4K/30 fps, limitada por navegador y conexión). Seis pantallas, voz privada, audio del sistema, webcam, packs, IA y editor colaborativo quedan en backlog.
- Las capturas pueden revelar notificaciones, contraseñas u otros archivos por decisión del usuario. La app no graba medios.

## Contribuir sin solapamientos

Los contratos están en [CONTRACTS.md](docs/CONTRACTS.md). El integrador controla tipos, bootstrap, dependencias y configuración. Usar una rama/worktree por agente y propiedad exclusiva de módulos; integrar solo tras tests. No pegar secretos, invitaciones o rutas en logs ni PR.

Git local inicializado y publicado en el repositorio **privado** `Javpato/HACKATHON`. Para continuar en otro equipo:

```bash
git clone https://github.com/Javpato/HACKATHON.git
cd HACKATHON && npm ci && npm run demo
```

El repositorio es privado: hace falta acceso con la cuenta propietaria o como colaborador. Los workflows de `.github/workflows/` siguen sin ejecutarse de forma remota.

No ejecutar publicación pública sin decisión humana. Código y assets tienen decisiones de licencia separadas pendientes; [ASSETS_LICENSES.md](ASSETS_LICENSES.md) registra la procedencia. Las referencias oficiales de [Tauri](https://v2.tauri.app/), [PeerJS](https://peerjs.com/client/getting-started) y [rusqlite](https://docs.rs/rusqlite/) documentan APIs, no validan nuestro hardware.
