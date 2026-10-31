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
