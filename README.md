# StudyVillage

Un pequeño vecindario pixel-art para estudiar juntos: cada persona tiene su casa con plantas y habitaciones, y comparte voz, pantalla, pizarras, proyectos y tarjetas de repaso con sus amigos. Interfaz en **español e inglés**.

**Versión actual: 0.3.3** · Android, Windows, Linux y navegador.

## Descargar e instalar

Todos los instaladores están en **[Releases → v0.3.3](https://github.com/Javpato/HACKATHON/releases/tag/v0.3.3)**. No necesitas Node, Rust ni clonar el proyecto.

> Para jugar juntos, **todos deben usar la misma versión** (0.3.3).

### Android — `StudyVillage-0.3.3.apk`

1. Descarga el `.apk` en el teléfono (o pásalo por WhatsApp, Telegram, Drive o cable).
2. Ábrelo. Android avisará de «origen desconocido»: toca **Ajustes** y activa **Permitir de esta fuente** para la app con la que lo abriste.
3. Toca **Instalar**. Si Play Protect avisa, toca **Instalar de todos modos** (la app no viene de Play Store).
4. Si ya tenías una 0.3.x, se instala encima y conserva tus datos.

En vertical el teléfono funciona como una consola: la pantalla arriba sigue a tu personaje (zoom con **− / +**) y los controles van abajo. Puedes mover y redimensionar los controles en **Menú → Ajustes → Controles** (un diseño para vertical y otro para horizontal). En Android no se puede compartir pantalla; voz y cámara sí.

### Windows — `StudyVillage_0.3.3_x64-setup.exe`

1. Descarga y ejecuta el instalador.
2. El instalador no está firmado: si aparece SmartScreen, pulsa **Más información → Ejecutar de todas formas**.
3. Si el equipo no tiene WebView2, el instalador lo descarga.
4. Abre **StudyVillage** desde el menú Inicio.

### Linux — `.AppImage` o `.deb`

- **AppImage** (cualquier distribución):
  ```bash
  chmod +x StudyVillage_0.3.3_amd64.AppImage
  ./StudyVillage_0.3.3_amd64.AppImage
  ```
- **Debian / Ubuntu / Mint**:
  ```bash
  sudo apt install ./StudyVillage_0.3.3_amd64.deb
  ```
  Después ábrelo desde el menú de aplicaciones (**StudyVillage**).

Para compartir pantalla en Wayland hacen falta PipeWire y `xdg-desktop-portal` para tu escritorio.

### En el navegador

Con el proyecto clonado (ver [Desarrollo](#desarrollo)), `npm run dev` y abre `http://localhost:3000`. Para probar desde un teléfono en la misma red usa HTTPS: `SV_HTTPS=1 npm run dev` y abre `https://<ip-del-equipo>:3000` (el navegador solo permite el cifrado de la app en `localhost` o con HTTPS).

## Cómo se juega

1. Elige nombre y color. Todo se abre desde el botón **Menú** (tecla M).
2. **Abrir la aldea:** Menú → Aldea → «Abrir mi aldea». Copia la invitación y mándala a tus amigos; ellos la pegan en «Pega una invitación» → **Unirme** y tú los aceptas.
3. Camina con WASD/flechas, la cruceta táctil o tocando el suelo. **Doble clic o doble toque** (o **E** de cerca) abre casas, muebles, estaciones y portales.
4. La aldea tiene seis parcelas; la **Comunidad** está al norte y la **Biblioteca** al sur.
5. **Tu casa:** decórala (catálogo, girar, cuadrícula, mover puertas), añade **plantas y habitaciones** y decide quién entra. Cada habitación tiene sus propios proyectos, tarjetas, quizzes, notas y pizarras.
6. **Muebles:** escritorio → Proyectos (repositorio, Live Share de VS Code y tareas); librería y «Tarjetas de repaso» → Estudio (cuadernos, flashcards y quizzes); pizarra → pizarra colaborativa; mesa → voz; armario → ropa del personaje.
7. **En la plaza:** Hombres Lobo y Gartic Phone, con cámara opcional.
8. **Contactos:** añade a la gente de tu sesión, ponles apodo y comparte tu tarjeta (en Android, por WhatsApp).
9. Voz, pantalla y cámara siempre se activan con un gesto tuyo y se ve quién te escucha.

Los avisos aparecen de uno en uno (solo el último) y se cierran con **×**.

## Servidor propio (opcional)

Por defecto la aldea es P2P: el anfitrión coordina y nada se guarda en un servidor central. Si quieres que el mundo siga abierto aunque nadie esté conectado, hay un servidor propio (Node 24 + SQLite, hasta 24 personas): ver **[server/README.md](server/README.md)** y [docs/SERVER.md](docs/SERVER.md). Se conecta desde Menú → Ajustes → Servidores.

## Desarrollo

Requiere **Node 24** y npm.

```bash
git clone https://github.com/Javpato/HACKATHON.git
cd HACKATHON
npm ci
npm run dev          # http://localhost:3000
```

| Comando | Qué hace |
|---|---|
| `npm run check` | typecheck, tests unitarios (app y servidor), catálogo de idiomas, build web y servidor |
| `npm run test:e2e` | tests de navegador (Playwright; usa Chrome del sistema o `CHROME_PATH`) |
| `npm run desktop:build` | instaladores Tauri de Linux (deb + AppImage) |
| `npm run server:build` / `server:start` | compila y arranca el servidor propio |
| `CLAUDE_BIN=~/.local/bin/claude npm run i18n:update` | traduce los textos nuevos al inglés |

Textos nuevos de la interfaz: envuélvelos en `msg('…')` o `t('…')` y ejecuta `i18n:update`; el test de idioma falla si falta alguno.

**Android:** `npm run build && npx cap sync android && android/gradlew -p android assembleDebug` (necesita JDK 21 y el SDK de Android). El APK queda en `android/app/build/outputs/apk/debug/`.

**Windows y Linux:** el workflow [desktop.yml](.github/workflows/desktop.yml) compila el instalador de Windows y los paquetes de Linux en cada cambio en `main`; [check.yml](.github/workflows/check.yml) ejecuta todas las pruebas.

### Estructura

| Carpeta | Contenido |
|---|---|
| `app/src` | juego (TypeScript + Canvas): `ui/`, `world/`, `house/`, `minigames/`, `study/`, `media/`, `i18n/` |
| `app/tests` | tests unitarios (Vitest) y de navegador (`e2e/`, Playwright) |
| `app/src-tauri` | shell de escritorio (Tauri 2, Rust) |
| `android` | app Android (Capacitor) |
| `server` | servidor propio opcional (Node 24 + SQLite, Docker) |
| `scripts` | herramientas de traducción y HTTPS local |
| `docs` | [servidor](docs/SERVER.md), [estudio](docs/STUDY.md), [contratos](docs/CONTRACTS.md), [decisiones](docs/DECISIONS.md), [diseño visual](docs/VISUAL_DESIGN.md) |

## Privacidad

- La identidad es un par de claves (ECDSA P-256); los nombres no dan permisos. Puedes guardarla cifrada con contraseña.
- Las casas, notas y proyectos se quedan en tu equipo. Solo se publican nombres, tipos y posiciones de muebles.
- En modo P2P se usa la señalización gratuita de PeerJS y STUN: el proveedor ve metadatos y los participantes pueden conocer sus IP. Algunas redes impiden P2P y no se incluye TURN.
- La app no graba voz, pantalla ni cámara.

## Licencia

Pendiente de decidir. La procedencia de los recursos gráficos está en [ASSETS_LICENSES.md](ASSETS_LICENSES.md).
