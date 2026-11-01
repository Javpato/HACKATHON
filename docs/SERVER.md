# Interacción, idioma, pizarra y servidor propio — estado de la entrega

Fecha: 2026-11-01. Guía del dueño del servidor: [server/README.md](../server/README.md).

## 1. Interacción, mapa y personalización

- `app/src/input/gestures.ts`: un único reconocedor de doble toque (mismo objeto, ≤ 360 ms, ≤ 24 px) para ratón, dedo y Pencil (Pointer Events).
- Doble clic / doble toque abre casas, muebles, estaciones y portales al instante y desde lejos; cancela el recorrido pendiente. Las comprobaciones de acceso siguen dentro de cada acción.
- Clic simple en ordenador: no camina ni abre (con los controles táctiles desactivados). Con controles táctiles, un toque acerca al personaje **sin abrir al llegar**.
- Dos dedos o un arrastre de decoración reinician la secuencia: nunca cuentan como doble toque.
- Preferencia «Controles táctiles» (Automáticos / Siempre visibles / Ocultos) guardada en el dispositivo; «Ocultos» se respeta también en pantallas táctiles.
- Comunidad al norte y Biblioteca al sur del barrio; los bordes izquierdo y derecho quedan libres para los barrios vecinos.
- Retirada la carga y uso de hojas PNG del personaje. Los datos antiguos se leen, pero se dibuja el avatar del armario.

## 2. Español / English

- Ajustes → Perfil → **Idioma**. Español por defecto; la elección se guarda en el dispositivo.
- El cambio es en el sitio: sin recargar ni remontar. Sesiones, partidas, formularios y dibujos siguen abiertos (prueba E2E).
- Catálogo tipado `app/src/i18n/catalogue.ts` (1725 mensajes, claves estables = texto español, parámetros con nombre).
  Nombres y contenido de usuarios nunca se traducen: van como parámetros.
- Traducción: 53 textos reutilizados de la otra versión; el resto con Claude CLI en lotes de 80, sin herramientas, con
  esquema JSON y validación de parámetros, `$…$` y espacios. Coste total 0,61 USD; 0 entradas rechazadas.
  `npm run i18n:update` solo envía textos nuevos o inválidos. La app no usa ningún traductor en ejecución.
- `npm run i18n:check` y `app/tests/i18n.test.ts` comprueban claves, parámetros, textos vacíos y cobertura.

## 3. Pizarra

- Texto, trazos, líneas, rectángulos, círculos y flechas son el mismo objeto (`BoardStroke`): selección, exportación y sincronización incluyen lo mismo. Los círculos y flechas antiguos siguen visibles y se convierten al importar.
- **Seleccionar** con rectángulo o lazo; mover, escalar desde la esquina y ajustar el ancho del texto con el control lateral.
- Barra contextual: Editar, Copiar, Cortar, Duplicar, Eliminar, Pegar y **Formato** (tamaño independiente del lápiz, sans/serif/monoespaciada, color, negrita, cursiva, subrayado, alineación, ajuste de líneas). El formato se puede elegir antes de escribir.
- Portapapeles interno con formato y geometría (también entre pizarras) y texto plano para el sistema; pegar texto externo crea un texto nuevo.
- Cada gesto es una transacción firmada (≤ 128 objetos): previsualización local y una sola confirmación; deshacer/rehacer actúan sobre el gesto entero.
- Copiar lo ajeno está permitido; moverlo, cambiarlo o borrarlo no. Una selección con objetos ajenos no se transforma a medias.

## 4. Servidor propio

- `server/`: Node 24 + WebSocket propio (RFC 6455, sin dependencias) + SQLite (`node:sqlite`), Dockerfile, compose, Caddyfile de ejemplo y guía.
- Capacidad 1–24, barrios de seis parcelas, `ceil(n/6)` hasta cuatro; bajar la capacidad no borra ni expulsa.
- Identidad ECDSA existente; reto firmado por conexión. Secreto de instalación de un solo uso para la primera administración.
  Invitaciones privadas con usos y caducidad, revocables; solo se guarda su hash.
- Residentes persistentes separados de la presencia. Identidades temporales: visitantes sin parcela.
- Autoridad del servidor ≠ administración ≠ organización de actividades (primera persona presente). El admin puede irse.
- Transacciones antes de confirmar; identificadores de petición idempotentes; revisiones de casa con conflicto que conserva el borrador; reconexión automática.
- Ámbito de firma por barrio (`worldId-nN`) persistente: las firmas sobreviven a reinicios y no se pueden repetir en otro barrio.
- Hombres lobo, Gartic, concursos y proyectos se ejecutan en el servidor (`ActivityRoom`) con el mismo protocolo que el anfitrión P2P.
  Bots de Gartic: solo con el Ollama de quien organiza, y se desactivan si se va.
- Medios: WebRTC nativo señalizado por WSS, limitado a la escena/casa/llamada privada (`WsMediaEndpoint`).
- Cliente: Ajustes → **Servidores** (guardar URL, comprobar compatibilidad, conectar, capacidad, invitaciones, importar casa y pizarras, cambiar de barrio).

## Evidencia (2026-11-01, Linux, Node 24.16.0, Chrome headless)

| Comprobación | Resultado |
|---|---|
| `npm run typecheck` (app + server) | correcto |
| Pruebas de app (Vitest) | 134/134 |
| Pruebas del servidor con sockets e identidades reales | 13/13 |
| `npm run i18n:check` | 1725 mensajes validados |
| `npm run build` y `npm run server:build` | correctos |
| E2E servidor real + dos navegadores: reclamar, invitar, visitante temporal, capacidad 10 → 2 barrios, salida del admin, cruzar el borde derecho hacia el barrio 2, reinicio y reconexión | aprobada |
| E2E idioma en el sitio (sin recarga, borrador y dibujo conservados) y pizarra (formato, selección, duplicar, deshacer, eliminar) | aprobadas |
| E2E gestos: clic simple no hace nada en ordenador, doble clic abre, E funciona de cerca | aprobada |
| E2E táctil **emulado** (teléfono): un toque acerca sin abrir al llegar, doble toque abre; «Ocultos» se recuerda | aprobadas |
| Suite Playwright completa | 49 aprobadas, 0 fallos, 6 omitidas (LIVE P2P, solo bajo demanda) |

Las pruebas del servidor cubren: 6 / 10 / 24 personas y cuatro barrios como máximo, rechazo del 25.º, invitaciones revocadas,
firmas falsificadas, objetos ajenos, señalización fuera de escena, visitas a casas «pedir permiso» y «cerrada», importación
atómica, copia de seguridad y fallo de disco sin confirmación falsa.

## Sin verificar o pendiente

- **Dispositivos físicos**: no se ha probado en iPad, teléfono ni con Apple Pencil. Las pruebas usan Chrome de escritorio y tamaños de pantalla emulados.
- **Voz/pantalla/cámara en modo servidor**: implementado, pero sin prueba con dos navegadores y medios reales.
- **Actividades en modo servidor desde la interfaz**: la lógica del servidor está probada; falta una partida completa E2E con dos navegadores.
- **Docker**: Dockerfile y compose escritos, pero no construidos aquí (Docker no está instalado en este equipo).
- **Despliegue real**: pendiente de que el dueño proporcione su servidor.
- Los textos que genera Ollama siguen pidiéndose en español.
