# Continuación — solicitud de vecindario persistente (2026-10-31)

Este archivo es el punto de continuación del trabajo iniciado sobre la copia de Gemini.
No presupone que las afirmaciones históricas de README/STATUS sigan verificadas.

## Diagnóstico de la copia recibida

- Compila y pasa 76 tests unitarios iniciales con Node 24.16.0.
- Ya había tres áreas dibujadas, portales, estaciones, joystick táctil, avatar configurable,
  clima sintetizado y captura ideal/máxima de 1920×1080 a 24 fps.
- Los botones de áreas y herramientas permitían saltarse el recorrido; los clics sobre
  portales, casas y estaciones también permitían entrar a distancia.
- No existe servidor de aplicación permanente. `VillageClient` coordina desde un navegador,
  usa PeerJS para señalización y cierra la sesión cuando se pierde el anfitrión.
- `removeMember` elimina casa y pizarra; el guardado SQLite de Tauri es local al cliente.
- `WorldExpansionUIController` instancia motores locales de juegos, notas, proyectos y
  flashcards. Su interfaz o nombre «multijugador» no demuestra sincronización entre equipos.
- El protocolo de posición no identifica el área del jugador: no basta conservar las
  coordenadas para sincronizar correctamente las tres áreas.
- Guardar una URL PeerJS o mantener un proceso Vite no convierte esto en servidor persistente.

## Bloque funcional completado: ajustes y exploración

- Ajustes en diálogo nativo con foco modal, cierre por Escape y disposición estrecha.
- Hora, clima, ciclo solar, partículas y audio dejan de ocupar el escenario.
- Sonido independiente del clima: lluvia, viento y ruido marrón sintetizados, volumen y
  preferencias de ambiente guardadas localmente.
- Nombre local del vecindario, nombre de casa, perfil y personalización de avatar en ajustes.
- Cuadrícula PNG local para personaje: tres columnas, cuatro filas (abajo/izquierda/derecha/arriba),
  validación de dimensiones/tamaño, persistencia y restauración del personaje original.
- Navegación principal: La aldea, Mi casa, Contactos. El editor sigue accesible por muebles.
- Se retiran los botones de áreas, Hombres Lobo, Gartic, apuntes y flashcards/IA.
- Clics en portales, estaciones y parcelas requieren proximidad; teclado E y acción táctil
  siguen usando la detección de proximidad existente. Mi casa conserva su acceso explícito.
- El título refleja la plaza o biblioteca al atravesar un portal.
- Pantalla solicita 3840×2160 ideal, sin límite de resolución de 1080p; 30 fps y presupuesto
  WebRTC de 12 Mbps. Es una solicitud, no certificación de captura real a 4K.
- npm genera package-lock.json; usar `npm ci` para repetir la instalación.

## Próximos bloques completos, en orden

### 1. Persistencia del mundo en proceso dedicado

Implementar `server/` con SQLite y migraciones versionadas. Separar el estado permanente
(miembros registrados, parcelas, casas, objetos, nombres y ambiente del mundo, mazos,
notas compartidas, pizarras y borrados) de presencia/conexiones transitorias.

Las parcelas deben conservarse al desconectar; el límite actual de seis miembros presentes
no debe borrar las casas de residentes ausentes. Solo la presencia es efímera.
Guardar cada cambio aceptado en transacción antes de confirmarlo. Probar cierre/reapertura,
revisionado, borrados y recuperación ante un cambio inválido. No persistir medios,
claves privadas de clientes, rutas locales, snippets o notas privadas por defecto.

### 2. Transporte y autoridad del servidor

Extraer el dominio de coordinación de `VillageClient` de PeerJS/DOM/medios. Agregar transporte
WebSocket para el proceso dedicado y el cliente, conservando el modo P2P actual.
Autenticar con challenge firmado por la identidad existente; las firmas actuales de casas
están ligadas a sessionId/epoch y necesitan un contrato de persistencia explícito.

Usar identidad estable de servidor, autorización de administración distinta de presencia,
validación de mensajes, límites de colas y revisión incremental. La dirección de un servidor
no concede permiso de administración. Incluir área en presencia/movimiento y en alcance de voz.
Probar dos clientes, salida del administrador, reconexión y reinicio del servidor con el
mismo mundo. Evitar confirmaciones optimistas que aparenten guardado tras un fallo de disco.

### 3. Conexión y operación

Agregar a ajustes una URL de servidor, estado y acción de conexión real una vez operativo
el bloque anterior. Documentar Node, directorio de datos, copias/restauración, variables,
Docker con volumen persistente, restart policy y HTTPS/WSS por proxy inverso.
No publicar un campo que aparente conectarse antes de disponer del transporte.

### 4. Sincronizar la expansión

Conectar juegos, objetos, notas compartidas, flashcards y pizarras al dominio autoritativo;
actualmente los motores locales no garantizan colaboración. Probar permisos y aislamiento
entre mundos. Los datos privados conservan el almacenamiento local salvo consentimiento.

### 5. Validación de dispositivos y medios reales

Las pruebas de viewport de Chrome cubren 390×844, 820×1180 y 1440×1000, pero no sustituyen
Safari/iPadOS ni Android real. Verificar controles, orientación, teclado virtual, permisos,
sonido y captura real entre dos equipos. Revisar también la interacción de muebles en casas:
el editor y las pizarras interiores conservan sus interacciones anteriores.

## Verificación de este bloque

- `npm run check`: aprobado; typecheck, 77 tests unitarios y build de producción.
- `CHROME_PATH=/usr/bin/google-chrome npx playwright test --config app/playwright.config.ts app/tests/e2e/settings.spec.ts`:
  ajustes en tres tamaños, persistencia tras recarga, clic lejano sin teletransporte,
  recorrido real andando a la plaza y apertura de Hombres Lobo por proximidad.
- Inspección visual del diálogo en teléfono; sin desbordamiento horizontal en los tres tamaños.
- Las pruebas históricas de expansión se adaptaron al recorrido físico y las de perfil a ajustes.
  Las tres pruebas afectadas (secciones, perfil persistido y expansión con flashcards) pasan.
  Junto a los cuatro tests nuevos: siete pruebas de navegador aprobadas. No se ejecutó toda la suite histórica.
- Captura real, servidor persistente y dispositivos físicos todavía pendientes.

## Bloque completado: pizarra simple (2026-10-31)

- Vista inicial: lápiz, texto, borrador, color, deshacer y Más.
- Más revela formas, mano, grosor, paleta, rehacer, vaciado con confirmación,
  zoom, nombre, permisos, exportación, fórmulas, IA, capas y ayuda.
- Panel cerrado inicialmente y al volver a entrar. Escape cierra primero las opciones.
  La herramienta avanzada seleccionada se indica en el botón Más al ocultar el panel.
- Superficie blanca, controles neutros redondeados, acento azul y cuadrícula tenue.
  Sin cabecera impresa en el lienzo, sombras interiores ni panel de inspector lateral;
  perfil, sesión y pie se ocultan mientras la pizarra está abierta. Navegación y regreso
  a la casa permanecen disponibles, también en móvil.
- Los avisos de solo lectura/capacidad siguen visibles sin abrir opciones avanzadas.
- Se corrigió el ancho heredado del canvas para evitar recortar el bitmap en móvil/iPad.
- Verificado: npm run check (77 tests y build) y 10 pruebas de navegador para dibujo,
  borrado, confirmación de vaciado, LaTeX, zoom, pizarras independientes, opciones y
  conservación exacta del dibujo al abrir/cerrar opciones. Tres tamaños de pantalla.
- El instalador en deliverables/windows/ corresponde al commit 41cefc6 del bloque anterior.
  Todavía no incluye esta simplificación de pizarra; el navegador local sí la incluye.


## Bloque completado: áreas multijugador y categorías de pizarra (2026-10-31)

- La posición de red incluye areaId (residential/community/study). La ausencia de área
  se interpreta como residential al leer datos antiguos. Actualizar todos los clientes:
  los binarios anteriores tienen un esquema estricto que no admite el nuevo campo.
- Los portales de teclado y clic comparten transición: publican inmediatamente área
  y posición de llegada, aunque el personaje no se mueva después. Una transición de área
  se envía sin esperar el intervalo de movimiento. Entrar a una sesión desde otra área
  también publica la ubicación actual. Al salir de una casa se conserva su área exterior.
- Renderizado y audiencia pública filtran por área y casa. Las llamadas privadas siguen
  siendo por acuerdo explícito de dos personas, independientemente de su área exterior.
- El coordinador retransmite la ubicación y actualiza snapshots al cambiar de área,
  incluyendo el área correcta para nuevos participantes. La interpolación de avatares
  se reinicia en el punto de llegada al pasar de escena.
- El canvas tiene una descripción accesible de la escena y personas presentes.
- Más se organiza en siete desplegables: Formas, Trazo y edición, Vista, Fórmulas,
  Asistente IA, Capas, Pizarra y archivo. Solo uno se abre a la vez. Todos aparecen
  cerrados al volver a entrar en la pizarra.
- Pruebas: 82 tests unitarios/integración, 10 tests de navegador de pizarra y un test
  LIVE con dos Chrome reales por PeerJS. El LIVE comprueba tránsito residencial/plaza/
  biblioteca, llegadas estacionarias, visibilidad en ambos sentidos y audiencia pública.
  Son dos navegadores en un equipo; no se afirma prueba entre dos redes/equipos físicos.
- El .exe anterior (commit 41cefc6) no contiene estas correcciones. Debe reconstruirse
  antes de probar en Windows o mezclarlo con clientes nuevos.


## Bloque completado: interfaz de juego, minijuegos reales y proyectos en VS Code (2026-10-31)

Petición: simplificar todo al estilo Animal Crossing / Pokopia, rehacer Hombres Lobo y Gartic
Phone (que no funcionaba), quitar el cuaderno de código y el arcade, apuntes al estilo Notion,
recuperar el clic para interactuar y arreglar el bloqueo al volver a la aldea.

- **Bloqueo al volver a la aldea (causa real):** el punto de aparición de la plaza (384, 230)
  estaba dentro del rectángulo de colisión de la hoguera de Hombres Lobo. «La aldea» devolvía
  al jugador a ese punto y cualquier paso chocaba. Se movió el punto a (384, 270) y
  `stepPosition` deja salir caminando a quien ya esté dentro de un obstáculo. Además, salir de
  una casa te deja en su puerta (barrio residencial) y Escape/cambiar de escena cierra la actividad.
- **Interfaz:** sin cabecera ni paneles laterales. La aldea ocupa la ventana; esquinas con lugar
  y «← Salir/Volver», voz rápida (micro, escuchar, pantalla) cuando hay sesión, avisos tipo
  bocadillo que se ocultan solos, solicitudes de acceso como tarjeta y botón **Menú** (tecla M)
  que abre un móvil con apps: Mi casa, Aldea (abrir/unirse/invitar, casas, personas), Voz,
  Proyectos, Apuntes, Tarjetas, Decorar, Contactos y Ajustes (perfil, identidad, controles).
- **Clic para interactuar:** clic en portal, puerta, estación o mueble → el personaje va andando
  por un camino A* (rodea árboles, vallas y muebles) y lo usa al llegar; sin teletransporte.
  En tu casa, clic sin arrastrar usa el mueble y arrastrar lo mueve.
- **Pizarra:** la Mano está junto a Lápiz, Texto y Borrador; ya no aparece en «Más».
- **Canal de actividades (`app.send`/`app.relay`):** nuevo en el protocolo. Los miembros solo
  hablan con el anfitrión, que entrega a una persona o a todas indicando el remitente autenticado; un
  miembro no puede reenviar como si fuera el anfitrión. Límite 56 000 caracteres por mensaje.
  Clientes anteriores rechazan estos mensajes por su esquema estricto: actualizar todos.
- **`SharedRoom`:** el anfitrión (o el propio equipo sin conexión) ejecuta el motor y envía a
  cada persona solo su vista. Los secretos (cartas, dibujos ajenos) no salen del anfitrión.
- **Hombres Lobo:** motor nuevo por turnos clásicos (lobos → vidente → guardián → bruja →
  amanecer → votación → veredicto), cartas barajadas con `crypto.getRandomValues`, bots que
  eligen al azar entre objetivos válidos, empates resueltos al azar en la manada y sin
  eliminación en la votación, 4–8 jugadores. Mesa con un icono pixel por rol.
- **Gartic Phone:** motor nuevo (escribir → dibujar → adivinar → … → álbum página a página),
  asientos barajados, dibujos vectoriales acotados, envío automático al acabar el tiempo y bots
  para practicar. Estética inspirada en garticphone.com.
- **Proyectos en VS Code:** se eliminaron el cuaderno de código, el ejecutor TS/Python/C++ y el
  espacio multiarchivo. «Proyectos» comparte con la aldea: repositorio (Clonar en VS Code con
  `vscode://vscode.git/clone`, vscode.dev para GitHub, copiar `git clone`), enlace de Live Share
  (solo hosts oficiales de Live Share/vscode.dev), quién trabaja y tareas. El anfitrión guarda la
  lista en su equipo. En Tauri, el comando `open_external` solo abre https y el clon de VS Code,
  pasando la URL como argumento sin shell. **No se ha compilado Tauri en este entorno**.
- **Apuntes:** editor de bloques tipo Notion (título, `/` para bloques, atajos Markdown, tareas,
  citas, código, fórmulas LaTeX renderizadas con MathJax, exportar .md). Se guarda como Markdown.
- Arcade eliminado del mundo y del código.

Verificación:
- `npm run check`: typecheck, 92 tests unitarios/integración y build. Nuevos: motores de Hombres
  Lobo y Gartic, reparto aleatorio, privacidad de cartas, 25 partidas completas solo con bots,
  enrutado del canal por el anfitrión (cliente real con transporte simulado), proyectos y enlaces,
  bloques de apuntes, A* y salida de un obstáculo.
- 27 pruebas de navegador (Chrome) actualizadas a la nueva interfaz en teléfono, iPad y escritorio,
  incluida la regresión del bloqueo (cerrar Hombres Lobo y volver caminando a la aldea).
- 3 pruebas LIVE con dos Chrome por PeerJS real: voz y llamada privada, portales, y un proyecto
  creado por el invitado que ve el anfitrión (y sus tareas en ambos sentidos) más una mesa de
  Hombres Lobo compartida donde cada uno solo ve su carta. Dos navegadores en un equipo, no dos redes.
- Pendiente: partida completa entre dos equipos reales, abrir una sesión Live Share real y
  compilar el shell nativo con el comando `open_external`.


## Rediseño retro y actividades — versión 0.2.0 (2026-10-31)

Este bloque sustituye la descripción de bots y tarjetas de los bloques anteriores.

- Tema compartido `ui/theme.css`: papel crema, madera, tinta cálida y verde para
  pizarra, proyectos, apuntes y actividades. Se conservan sus herramientas.
- Shift corre a 2,5 veces la velocidad; en táctil, mantener «Correr». El movimiento
  usa subpasos para no atravesar obstáculos. No se corre al editar/decorar.
- El anfitrión de la aldea puede terminar Hombres Lobo, Gartic y concursos desde
  cualquier fase, sin ocupar un asiento. La confirmación devuelve a todos al lobby.
- Hombres Lobo: catálogo de ocho cartas, sets Básico/Clásico/Vínculos y hasta doce
  sets personales guardados. Ciudadanos completan el reparto; configuraciones
  imposibles no arrancan. Cupido une dos personas, Cazador dispara al morir,
  Niña puede espiar con riesgo del 33 % de quedar expuesta a los lobos. Las vistas
  siguen filtrando cartas y secretos por destinatario.
- Gartic: eliminados los bots y dibujos prefabricados. Opciones avanzadas permite
  verificar un Ollama local con visión y salida de trazos JSON. Inferencia en serie,
  límites configurables, validación de trazos y descarte de respuestas tardías al
  terminar/cambiar partida. Si el modelo falla se aplica el tiempo del turno.
- Tarjetas: biblioteca vacía, crear/editar/ordenar/borrar, repaso con progreso local,
  preguntas de 2–4 opciones y concurso compartido por canal `study`. El anfitrión
  presenta y puntúa; invitados responden, con soluciones ocultas hasta resultados.
  Ollama queda en avanzadas, solo en el equipo anfitrión. No hay mazos de ejemplo
  ni generación ficticia. Migración oculta solo la plantilla antigua intacta.
- Apuntes nuevos vacíos; documentos editados existentes se conservan. Identidad
  local estable para nuevas páginas y mazos cuando todavía no hay identidad creada.
- Decoración explícita: catálogo con iconos, previsualización válida/inválida,
  cuadrícula opcional de 8 px, rotación de muebles de suelo y deshacer/rehacer.
  Se rechazan solapamientos y cambios que bloqueen entrada o acceso a muebles.
  `rotation` es opcional y no cambia la representación de casas antiguas.

Verificación local: `npm run check` pasó (100 tests y build). Pruebas de interfaz en
Chrome en teléfono, iPad y escritorio incluyen creación/repaso/persistencia,
rotar/deshacer/persistir muebles, cartas, cancelación y Ollama simulado. La prueba
Ollama valida la integración, no el rendimiento de un modelo real. Multijugador
LIVE usa dos navegadores del mismo equipo, no dos redes físicas.

Entrega: generar un único instalador Windows 0.2.0 desde el código final; comprobar
el artefacto y su hash. La compilación de Windows no prueba su ejecución real.
Los clientes de una aldea deben usar la misma versión del protocolo actualizado.

Comprobación final de 0.2.0:
- 100/100 pruebas de código; typecheck y build correctos.
- 34/34 pruebas locales de navegador; 5/5 LIVE ejecutadas por separado.
- Código guardado en rama privada `build/retro-activities-20261031`, commit final `871e85e` (base `9e6d401`).
- Build nativo: https://github.com/Javpato/HACKATHON/actions/runs/41243610268
- Entrega prevista: `deliverables/windows-0.2.0/` (instalador, ZIP, hash e información
  de build). No mezclar el .exe antiguo 0.1.0 con clientes 0.2.0.

- Última regresión corregida: si un enamorado abandona, se aplica el vínculo y
  el Cazador puede disparar; después continúa la fase/turno que estaba en curso.
  Se pausan los segundos restantes durante el disparo y se invalidan votos a
  quienes ya no viven. `npm run check`: 100 tests, build; prueba de navegador
  de Hombres Lobo repetida y correcta. El build previo fue cancelado.


Entrega final 0.2.0 completada:
- CI Windows y Linux correctos en run 41243610268.
- EXE y ZIP comprobados en deliverables/windows-0.2.0/. SHA-256 del instalador:
  c1b822754427a0e6a5e2b99f6b23531d93e66c35132688683acacbd0fbd92857.
- AppImage 0.2.0 descargada a deliverables/linux-0.2.0/appimage/ y abierta;
  ventana nativa StudyVillage confirmada con wmctrl. No se probó runtime Windows.
- Tres megaprompts solicitados en deliverables/replication-prompts/, con 64
  bloques canónicos, variantes sin IA comprobadas por TypeScript y dos smoke
  tests funcionales adicionales. Incluyen contratos/reglas/estados/aceptación.
- Bundle completo: deliverables/StudyVillage-tres-megaprompts-0.2.0.zip,
  con los 3 Markdown, capturas, manifiesto y snapshot de fuente sin secretos.
- La app no cambió durante la generación de prompts: app/src comparado byte a
  byte con checkout del commit compilado 871e85e.


## Cámaras opcionales en juegos — 0.2.1 (2026-10-31)

- Nuevo `media/game-camera.ts`: cámara independiente de voz/pantalla, captura
  solo tras gesto (ideal 1920x1080, 30 fps, audio false), permiso cancelable y
  descarte de resultados tardíos. No se activa una webcam física al abrir juegos.
- Relay autenticado `camera` anuncia qué juego está abierto. Se ofrece vídeo
  solo a miembros en la misma escena y con el mismo juego abierto. El receptor
  comprueba sesión/epoch/identidad/endpoint/token/escena/juego. Cerrar el panel,
  cambiar de juego/escena o terminar sesión detiene pistas y llamadas.
- Nuevo `ui/game-camera-ui.ts`: tarjeta cuadrada, esquinas 22 px, sombra suave,
  nombre y calidad real, vista propia en espejo. Dock lateral en escritorio/iPad
  y tira inferior en móvil; botón compacto si no hay vídeo. No tapa el tablero.
- Cámara y pantalla tienen conexiones distintas. WebRTC solicita hasta 6 Mbps
  para cámara y prioriza resolución, con adaptación real del navegador/red.
- `npm run check`: 104 tests y build. Siete pruebas nuevas de cámara en UI y
  una LIVE con dos Chrome pasaron usando webcams sintéticas: juegos diferentes
  no comparten vídeo; mismo juego sí, también con un visor sin cámara propia;
  cerrar detiene el envío. No se afirma prueba de una webcam física/Windows.
- Versión bump 0.2.1; reconstruir instaladores antes de entregar. Los clientes
  de una sesión deben actualizarse juntos por el canal de presencia nuevo.

Build de cámaras 0.2.1 en curso: rama privada `build/game-cameras-20261031`,
commit `6f4dc6470ef0c665e768b5f9576f4c47e070801c`, run
https://github.com/Javpato/HACKATHON/actions/runs/41247811287 .

Entrega de cámaras 0.2.1 completada:
- 104/104 tests de código y 47/47 tests Playwright (incluidos seis LIVE) pasaron.
- Windows y Linux compilados en run 41247811287. EXE/ZIP verificados en
  deliverables/windows-0.2.1/. SHA-256 del EXE:
  2b1af97450127d560a6f496af59f64d3b78e8f2af3dbad771cb0789515b60f45.
- AppImage 0.2.1 descargada y abierta desde deliverables/linux-0.2.1/appimage/.
- Segundo megaprompt ampliado con adenda de cámaras sin IA y código completo.
  Nuevo bundle: deliverables/StudyVillage-tres-megaprompts-0.2.1.zip.
  Se verificaron 73 bloques canónicos; versiones 0.2.0 conservadas.
- app/src comparado byte a byte con checkout compilado 6f4dc64.
- Cámara física y ejecución Windows no se afirmaron: vídeo probado con
  cámaras sintéticas en dos Chrome del mismo ordenador.

## Armario / vestidor (2026-11-01)

Implementado en el código de trabajo: armario físico instalado una sola vez en
casas nuevas/existentes cuando hay espacio válido; si el usuario lo retira no
se repone automáticamente. Se puede colocar otro desde Decorar.
Vestidor con vista previa giratoria, sombreros/lentes/ropa/sacos combinables,
colores opcionales, pelo/piel y auriculares. Guardar look persiste; descartar
conserva el anterior. Las hojas PNG personalizadas se conservan y se pueden
volver a usar. El aspecto se comparte en Member.appearance mediante avatar.update
validado por el anfitrión, sin cambiar identidad criptográfica ni muebles ajenos.
Archivos principales: assets/appearance.ts, ui/wardrobe-ui.ts, house/wardrobe.ts,
ui/art.ts, protocol/schema.ts, session/client.ts y bootstrap.ts.
Smoke de navegador PASS: llegar caminando al armario, combinar sombrero/lentes/
traje/saco, guardar y recargar conserva el look. Script /tmp/wardrobe-smoke.mjs;
captura /tmp/wardrobe-preview.png. Se redujeron anuncios de tokens redundantes
al recibir snapshots cosméticos: se anuncian al entrar/reconectar.
El usuario pidió terminar inmediatamente por falta de uso. No se ha reconstruido
el instalador: el .exe 0.2.1 entregado antes NO contiene este vestidor. Los cambios
están en el código y en la versión web local. Los megaprompts anteriores aún no
incluyen el vestidor.
