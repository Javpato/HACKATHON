# MEGAPROMPT 1/3 — StudyVillage: base visual y funciones clásicas

## Instrucción para la IA que recibe este documento

Tienes una versión antigua de StudyVillage. Debes convertirla en la base funcional y visual descrita aquí. Implementa cambios reales, verifica el resultado y conserva los datos del usuario. Este documento es una especificación ejecutable: no respondas solamente con ideas o un plan. Trabaja en bloques pequeños, completos y comprobables; al terminar cada bloque deja la aplicación compilando y registra un punto de continuación.

Esta fase **no incluye juegos, concursos, Ollama, bots de dibujo, generación mediante IA ni controles de IA**. Sí incluye el mundo, casas, movimiento, decoración, pizarras independientes, apuntes, proyectos con VS Code, contactos, sesiones, voz/pantalla y tarjetas manuales con repaso. Oculta las estaciones y entradas de las funciones excluidas en esta fase. No dejes botones que abran pantallas vacías. La segunda fase añadirá los juegos y la tercera la integración local de IA.

La referencia es StudyVillage 0.2.0, código final `871e85e51ae204d10eaf301bbac85ad437438471`. No supongas que tu repositorio ya contiene los archivos nombrados: inspecciónalo, conserva lo que cumpla esta especificación y crea o adapta lo que falte. Los anexos al final contienen código de referencia real. Los bloques extraídos de una clase son métodos para integrar, no archivos completos para pegar aislados. Resuelve sus dependencias y declara sus campos. No implementes dos modelos paralelos para la misma función.

## 1. Resultado visual obligatorio

La aplicación es un pequeño mundo pixel art cálido, con madera, papel crema y verde vegetal. La interfaz de notas y proyectos mantiene su funcionamiento moderno, pero sus superficies pertenecen al mismo pueblo. No introduzcas una pantalla blanca genérica, un escritorio de paneles permanentes, neón, degradados azules de producto SaaS o barras de desarrollo.

Tokens exactos del tema compartido:

```css
:root {
  --paper: #fff8e9;
  --paper-soft: #f5e7cb;
  --paper-line: #d7bf95;
  --wood-dark: #443023;
  --wood-mid: #765338;
  --wood-light: #a77b50;
  --text-warm: #423223;
  --text-muted: #806a51;
  --accent-leaf: #416c46;
  --surface-shadow: 0 2px 0 #b39972, 0 7px 18px #35241412;
}
```

Usa bordes finos color pergamino, remates de madera de unos 3–5 px, esquinas suaves, sombras discretas y botones principales verdes con texto crema. Los iconos del mundo son píxeles dibujados con canvas/SVG de rectángulos; los documentos usan texto legible del sistema. No conviertas el texto largo en una fuente pixelada difícil de leer. Desactiva el suavizado al dibujar sprites: `ctx.imageSmoothingEnabled = false`.

Orden de CSS: estilo general existente → piel del juego (`ui/game.css`) → tema compartido (`ui/theme.css`). El tema debe redefinir variables y superficies de los componentes, no reescribir su comportamiento. Las familias `.pj-*` corresponden a proyectos y `.nb-*` a apuntes. Deben compartir tinta, borde, fondo y acento, incluidos formularios, selección, foco y barras superiores.

## 2. Estructura de pantalla y navegación

- El mundo ocupa toda la ventana. No hay sidebar fija de destinos ni editor local de código.
- Esquina superior: cápsula con nombre del lugar; en casa/pizarra existe un botón contextual para volver.
- Esquina inferior derecha: botón **Menú**, tecla **M**, que abre un teléfono con aplicaciones. En teléfono pequeño puede representarse por el icono del móvil.
- Apps de esta fase: Mi casa, Aldea, Voz cuando corresponda, Proyectos, Apuntes, Tarjetas, Decorar, Contactos y Ajustes. Las tarjetas son manuales; no existe «Jugar en grupo» todavía.
- No hay botones permanentes para barrio, plaza, biblioteca ni estaciones. Los portales/puertas se descubren en el mapa y se usan caminando. «Mi casa» conserva el acceso rápido a tu espacio propio y «Aldea» administra la sesión; no son un catálogo que teletransporta entre todas las estaciones.
- Un aviso es un bocadillo breve que se oculta solo. Los permisos de acceso pendientes se presentan como tarjetas claras.
- Escape cierra primero la operación/modal activa. La escena debe recuperar foco y movimiento al cerrar. No reabras inmediatamente la misma estación por conservar una tecla pulsada.
- Abrir un teléfono/modal o editar texto vacía teclas de movimiento, trayectoria e interacción pendiente. WASD, flechas, E y M no se interpretan al escribir en input/textarea/select/contenteditable.

Estados recomendados, adaptables a los nombres del proyecto antiguo:

```ts
pane: 'world' | 'house' | 'board';
currentArea: 'residential' | 'community' | 'study';
houseOwnerId: string | null;
phoneOpen: boolean;
activityOpen: boolean;
moveTarget: {x:number;y:number} | null;
movePath: {x:number;y:number}[];
pendingInteraction: {x:number;y:number; near():boolean; run():void} | null;
keys: Set<string>;
touchSprint: boolean;
```

Cerrar una vista no debe destruir una sesión de voz o una pizarra. Separar la vida de los servicios de la vida de sus paneles evita pérdidas y listeners duplicados.

## 3. Mundo, movimiento y portales reales

Lienzo lógico del mundo: **768 × 432**. Escala el canvas a su contenedor respetando la relación de aspecto y convierte coordenadas de puntero mediante su `getBoundingClientRect()`. No uses píxeles CSS directamente como coordenadas del mundo.

Movimiento: WASD/flechas; diagonal normalizada; exterior 110 unidades/segundo; Shift 275 (2,5 veces); interior base 105 con multiplicador 2,5. En táctil hay cruceta, acción contextual y botón **Correr** que actúa mientras se mantiene pulsado. Usa pointer capture y limpia su estado en pointerup, pointercancel, lostpointercapture y blur. Nunca dejes el personaje corriendo por un dedo que ya salió de la pantalla.

Cada frame: limita `dt` a 0,05 s, calcula vector, anula movimiento si hay teléfono/actividad/decoración, avanza con colisiones, actualiza dirección y publica posición cuando corresponda. Divide el desplazamiento en subpasos de como máximo 4 unidades para impedir que correr atraviese una valla fina. Si una posición antigua ya está dentro de un obstáculo, permite que salga; no la encierres para siempre.

El clic en una puerta, portal, estación o mueble crea una intención de interacción, calcula un camino A* y camina hasta un punto alcanzable cercano. A* usa la geometría real de colisión, radio del personaje y límites de escena. Al llegar, verifica otra vez `near()` antes de ejecutar `run()`. Si no hay camino, informa y conserva un estado utilizable. Clic en suelo camina; una tecla manual cancela el camino. E usa solamente una interacción cercana.

```text
interact(target):
  si target.near(): limpiar intención/camino; ejecutar target.run(); terminar
  si walkTo(target.x,target.y) logra calcular camino: pendingInteraction = target

tick:
  si input manual: cancelar intención y camino
  si hay camino: seguir siguiente nodo, pasando al siguiente a menos de 6 unidades
  stepPosition(...)
  al terminar camino:
    retirar primero pendingInteraction
    si near() sigue siendo cierto: run()
    si no: aviso breve, sin teletransportar
```

Áreas exteriores: `residential`, `community`, `study`. La plaza usa aparición `(384,270)`; no reaparezcas en `(384,230)`, dentro de la hoguera/obstáculo de la versión antigua. Las áreas y sus portales deben tener sus propios spawn, bounds y obstáculos. Salir de una casa devuelve a la puerta de esa casa en residencial. Dentro de una casa, E solo sale si estás cerca de la puerta; no uses E como salida global.

### Aislamiento multijugador que debe corregirse en todas las capas

Cambiar solamente el fondo o `currentArea` de la UI produce el bug en el que personas de escenas distintas se siguen viendo. La localización transmitida debe incluir `areaId`, incluso al llegar completamente quieto.

```ts
type WorldAreaId = 'residential' | 'community' | 'study';
interface Position {
  areaId?: WorldAreaId; // ausente en datos antiguos significa residential
  x:number; y:number;
  direction:'up'|'down'|'left'|'right'; moving:boolean;
}
function sameScene(member, area, houseId) {
  return member.connected
    && member.houseId === houseId
    && (houseId !== null || (member.position.areaId ?? 'residential') === area);
}
```

Al cruzar un portal: cerrar actividad, cancelar ruta/teclas, cambiar área y spawn, publicar de inmediato `{...spawn, areaId: destination, moving:false}`. No dependas de que x/y hayan cambiado ni del siguiente movimiento manual. Incluir `areaId` en igualdad, snapshots, reenvíos y firmas donde corresponda. El anfitrión debe comunicar cambios de área y recalcular público de medios. Renderizar avatares, lista de presentes y audio/pantalla públicos con el mismo predicado de escena. Una llamada privada aceptada es una excepción explícita, no una fuga del canal público.

## 4. Pizarras: identidad estable y separación estricta

Cada mueble pizarra es un documento independiente. Dos pizarras de una misma casa no comparten trazos, título, sprite, borrados, deshacer/rehacer ni cámara. Cambiar un nombre visible nunca cambia el identificador del documento.

Identificador canónico:

```ts
function houseBoardId(houseScopeId:string, furnitureId:string):string {
  const scope=(houseScopeId||'own').trim().slice(0,64);
  const item=(furnitureId||'board').trim().slice(0,64);
  return `house:${scope}:board:${item}`;
}
```

Para tu propia casa se usa el scope estable `own`, aunque todavía no guardaste una identidad criptográfica. Para visitar una casa se usa la identidad del propietario. Las pizarras de plaza/biblioteca tienen IDs fijos propios, por ejemplo `board:community-plaza`; no se reutiliza el ID de una casa.

La pizarra activa se resuelve así:

```text
si customBoardId existe: devolver customBoardId
si casa propia: scope = own; si no: scope = houseOwnerId
devolver houseBoardId(scope, activeBoardFurnitureId || board)
```

Mantén mapas por boardId de metadatos, trazos y elementos enriquecidos. Deshacer trazos necesita además autor: `(boardId, authorId)`. La cámara es un `Map<boardId, Camera>`. Los IDs de muebles se crean una vez y no se recalculan al moverlos, renombrarlos o reordenar una lista.

Compatibilidad antigua: los trazos de red cuyo boardId era el propietario de la casa solo se mezclan en la pizarra principal de esa casa (`furnitureId === 'board'`). **Nunca** mezcles esos trazos en una segunda/tercera pizarra. Combina persistidos + red válida + pendientes + offline por ID de trazo para no duplicarlos. Remapea al ID activo solo después de verificar a qué documento pertenecían.

Límite real de la referencia: el protocolo de trazos en red sincroniza la pizarra principal de la casa; las pizarras adicionales y estaciones conservan documentos separados y persistencia local. El registro tiene métodos de cursores/permisos, pero eso no demuestra su transporte remoto. No anuncies colaboración remota de todas las pizarras sin añadir y verificar ese protocolo por documento. La réplica mínima fiel conserva esta separación sin fingir sincronización adicional.

Persistencia actual de las pizarras: `studyvillage-whiteboards-v1`. Carga con validación y recuperación por documento; no borres todas las pizarras por una entrada corrupta. Un `BoardStroke` conserva `id, author, boardId, seq, color, width, tool, points, deleted, text?`. Límites de referencia: 512 puntos por trazo, 2.000 operaciones, texto 280 caracteres, coordenadas del tablero dentro de ±20.000. El registro adicional admite línea, rectángulo, círculo, flecha y texto, con `authorId`, `boardId`, permisos y `updatedAt`.

### Barra limpia y herramientas avanzadas

La vista inicial muestra **Lápiz, Texto, Borrador, Mano**, color actual, deshacer y **Más**. No muestres simultáneamente todos los colores, grosores, formas, capas y fórmulas. Dentro de Más agrupa claramente:

| Grupo | Contenido |
|---|---|
| Formas | Línea, rectángulo, círculo, flecha |
| Trazo | Color y grosor |
| Vista | Zoom, ajustar/restablecer y cámara |
| Capas | Autores visibles y ocultación local |
| Documento | Nombre, permisos, exportar, borrar lo propio |
| Texto y fórmulas | Texto manual/LaTeX y opciones de formato |

No hay botones de IA en esta fase. El canvas de escritura sigue blanco; marco y controles son papel/madera. Los detalles avanzados se expanden sin borrar lo que ya se dibujó ni reconstruir el canvas perdido. Conserva el estado del dibujo entre renders.

Pointerdown captura un único trazo de trabajo; pointermove añade puntos acotados; pointerup confirma; pointercancel no deja un trazo infinito ni captura bloqueada. Mano arrastra cámara, rueda/ctrl+rueda hacen zoom según el comportamiento existente, y dos dedos permiten desplazar/escalar sin añadir tinta accidental. El borrador elimina trazos propios alcanzados por hit-test; no blanquea píxeles de otros autores. «Borrar lo mío» pide una segunda pulsación y afecta solo al autor y documento activos. Deshacer no deshace a otro usuario ni otra pizarra. Ocultar una capa es local y no manda borrados.

Renderiza LaTeX con MathJax al dibujar notas; una fórmula no es HTML ejecutable. Exportar PNG debe capturar la vista/documento previsto de forma reproducible. «Volver a mi casa» retorna a la misma habitación desde la que se abrió la pizarra.

## 5. Decoración explícita, sin economía

Fuera del modo Decorar un clic usa el mueble. No muevas una estantería accidentalmente al intentar abrir apuntes. Solo el dueño puede editar su casa. Entrar en Decorar cancela movimiento/interacciones y desactiva caminar. Se puede recorrer el catálogo sin modificar la casa hasta confirmar una colocación válida.

Tipos: `desk, bookshelf, board, plant, table, frame, cabinet`. Catálogo con iconos reales dibujados usando el mismo renderer de muebles. Acciones flotantes: **Catálogo, Girar, Retirar, Deshacer, Rehacer, Cuadrícula, Terminar**. Los controles detallados antiguos quedan dentro de un desplegable, no como primera pantalla.

Estado de edición: `decorating`, `pendingFurniture`, `selectedFurnitureId`, `previewHouse`, `decorationInvalid`, `snapEnabled`, `drag {id,baseHouse,...}` y un historial. La previsualización válida/inválida muestra visualmente si se puede colocar; el documento definitivo no cambia hasta confirmar. Arrastrar usa copia previa, comprueba al soltar, y pointercancel descarta esa copia. Escape cancela primero preview/arrastre; la siguiente salida termina Decorar.

`Furniture.rotation?: 0|90|180|270` es opcional. Para 90/270 intercambia ancho/alto del rectángulo de colisión y gira el arte alrededor del centro real del footprint. Los rótulos siguen legibles/horizontales. Las piezas de pared como marco/pizarra no se giran como muebles de suelo. Cuadrícula opcional de 8 unidades. No introduzcas dinero, energía, niveles ni catálogo bloqueado.

Validación antes de cada commit, incluidos los botones antiguos «Añadir» y «Retirar»:

1. El footprint queda dentro de `HOUSE_BOUNDS`.
2. No se solapa con otro mueble.
3. `HOUSE_SPAWN` sigue libre para un personaje de radio 9.
4. A* encuentra un camino desde spawn hasta el punto de salida de la puerta.
5. Escritorio, estantería, pizarra, armario y mesa conservan al menos un punto de acceso alcanzable en alguno de sus cuatro lados.

Solo entonces guardar la casa, incrementar revisión y publicar su representación pública. `DecorationHistory` guarda hasta 50 instantáneas de **muebles**, no la casa completa. Undo/redo preservan nombre, tema y permisos actuales e incrementan revisión. Una acción nueva vacía redo. La serialización pública debe incluir `rotation` solo cuando existe; añadir siempre `rotation:0` rompería firmas antiguas. Añade el campo también al esquema separado de almacenamiento local.

## 6. Ajustes, avatar y ambiente

Clima/hora no quedan como controles permanentes encima del mapa: viven en Ajustes. Conserva los presets existentes de hora/clima y su efecto en iluminación. Climas de referencia: claro, nublado, lluvia ligera/fuerte, niebla y hojas otoñales. No los confundas con un reloj de cuenta atrás.

Ajustes incluye nombre/color del perfil, aspecto del avatar, carga de hoja de sprites con configuración de cuadrícula del personaje, nombre de casa/vecindario y sonido ambiente. Preserva los datos del avatar y muestra validación de imagen/cuadrícula; el archivo local no se publica como ruta del ordenador.

Ambiente usa `studyvillage-environment-v1`, con `ambientSound: 'weather'|'rain'|'wind'|'brown_noise'`. Sonido sintetizado con WebAudio y filtros: no depende de descargar canciones. Contexto de audio solo tras un gesto permitido; volumen/mute y dispose detienen/desconectan nodos. No prometas que los ajustes de ambiente locales son un reloj global sincronizado si el repositorio antiguo no implementa esa sincronización.

## 7. Apuntes: editor de bloques conservado

Implementa `SecureNotesPanel` y `SecureNotesStore` con cuadernos, páginas, búsqueda, título, bloques y exportación Markdown. Apariencia: lateral crema, documento papel, texto cálido, selección verde, sin chrome excesivo.

Bloques: párrafo, títulos, lista con viñetas/números, tarea con checkbox, cita, código y fórmula. Menú `/` y atajos Markdown convierten el bloque actual. Enter crea un bloque; Backspace al inicio fusiona/convierte cuando procede; no destruyas foco/cursor al guardar. Persistir el documento como Markdown permite exportar sin un formato propietario obligatorio. Los anexos del panel contienen el comportamiento preciso del editor.

Notas nuevas vacías. No siembres una bienvenida con demostraciones matemáticas ni tareas inventadas. Migración: oculta únicamente la plantilla antigua intacta identificada por ID, título, contenido y revisión originales; nunca elimines una nota que el usuario haya editado. Las páginas locales nuevas usan propietario estable `local-owner`, así siguen accesibles tras reiniciar con identidad temporal. Mantén también las identidades reales de páginas antiguas.

Texto del usuario no puede ejecutar HTML/JS. Escapar HTML antes de renderizar; enlaces solo http/https/mailto; nada de ejecutar el bloque de código. Los permisos de notas no crean por sí solos sincronización remota: la versión de referencia presenta los apuntes «En este equipo». No inventes un backend compartido que no exista.

## 8. Proyectos: VS Code y Live Share

Elimina el editor local y los runners TS/Python/C++ de la interfaz. La aplicación administra proyectos del grupo y abre herramientas reales; no simula un IDE.

Proyecto: id, título, descripción, repositorio, Live Share, propietario, personas trabajando, tareas y revisión/fechas según el modelo anexo. Interacciones: crear/editar, abrir/clonar repositorio en VS Code, abrir versión web cuando se soporte, copiar comando `git clone`, compartir enlace Live Share, unirse/dejar de trabajar, añadir/marcar/borrar tareas. Sin proyectos falsos en el primer inicio.

El anfitrión arbitra `GroupProjectsBoard` mediante el canal `projects`. Se guarda en su equipo con clave `studyvillage-group-projects-v1`. Invitados ven la lista y sus acciones se envían a la autoridad; no mantengas dos listas divergentes. Puede reutilizarse `SharedRoom` como transporte genérico de documentos sin introducir juegos: motor `apply/tick/viewFor/audience`, con tick sin animación para proyectos.

Enlaces: repositorio https validado o SSH `git@host:owner/repo` normalizado; clonar usa `vscode://vscode.git/clone?url=<encodeURIComponent(repo.git)>`; para GitHub puede abrirse `https://vscode.dev/github/owner/repo`. Live Share se restringe a los hosts admitidos del modelo anexo. No construyas comandos de shell con texto del usuario para ejecutarlos. Copiar el comando no equivale a ejecutarlo.

En Tauri implementa y registra `open_external`, con lista permitida de https y URI de clon de VS Code. Pasa la URL como argumento al abridor del SO, sin shell. En navegador usa un enlace real y `rel=noopener` para pestañas https. Esta capacidad no permite leer archivos remotos ni abrir un terminal a otra persona.

## 9. Tarjetas manuales, sin concurso ni IA

Biblioteca vacía → **Crear mazo** → nombre → **Crear** → editor de pregunta/respuesta → **Añadir tarjeta**. Biblioteca muestra nombre, cantidad de tarjetas y cantidad aprendida; acciones **Repasar** y **Editar**. Sin mazo de ejemplo, generación automática ni formulario de proveedor/modelo.

Editor: renombrar mazo, añadir/editar/ordenar/eliminar tarjetas, y borrar mazo con segunda confirmación. Permite borrar el último. En detalles opcionales: pista, explicación, etiquetas y dificultad. La pregunta/respuesta son el camino principal; las opciones de concurso se añaden en la fase 2.

Modelo separado de cualquier proveedor de IA:

```ts
interface FlashcardItem {
  id:string; question:string; answer:string;
  hint?:string; explanation?:string; sourceRef?:string;
  topic:string; difficulty:'easy'|'medium'|'hard'; tags:string[];
  choices?:string[]; correctChoice?:number; // reservados para fase 2; no UI de juego aquí
}
interface FlashcardDeck {
  id:string; title:string; topic:string;
  sourceType:'note'|'selection'|'topic'|'manual'; sourceNoteId?:string;
  ownerId:string; visibility?:'private'|'shared_read'|'shared_write';
  cards:FlashcardItem[]; createdAt:number; updatedAt:number;
  provider:'manual'|'local'; // nuevos mazos siempre manual
}
```

Los documentos antiguos pueden contener otro valor de procedencia. Normaliza la procedencia al cargar para esta distribución, conservando las tarjetas y sus IDs; no añadas dependencias ni ajustes de un proveedor. Los tipos reservados no activan ninguna función.

Crea `study/decks.ts` con validadores, repositorio manual y persistencia. API equivalente: `listDecks`, `getDeck`, `createManualDeck`, `saveDeck`, `renameDeck`, `reorderCard`, `deleteCard`, `deleteDeck`, `canEditDeck`, `setDeckVisibility`. Validar antes de mutar; máximo 100 tarjetas por mazo, pregunta 260, respuesta 400, título 120, pista 220, explicación 320, 8 etiquetas de 32 caracteres. Usar IDs persistentes. Nuevos mazos propios: `ownerId:'local-host'`, privados por defecto. No vincular la propiedad local a una identidad efímera nueva en cada arranque.

Repaso: una tarjeta grande, contador, **Revelar respuesta**, después **Lo sabía** y **Repasar**. Ambos guardan una marca y avanzan; al terminar mostrar retorno a biblioteca. No prometas repetición espaciada automática: la referencia guarda `mastered|review`, no un algoritmo SRS. Persistir en `studyvillage-review-v2`, clave `${deck.id}:${card.id}`. Migrar marcas anteriores sin sobrescribir nuevas. No perder el formulario cuando falle una validación: insertar un aviso en la vista actual.

## 10. Sesiones, contactos, medios y almacenamiento

Preserva el transporte y autenticación existentes si ya funcionan. Referencia: PeerJS/WebRTC, invitación fuera de banda, aprobación del coordinador, identidades ECDSA P-256, contactos exportables y clave privada opcionalmente cifrada. Máximo seis miembros y seis parcelas. No cambies el nombre visible por una identidad de seguridad. No conectes a señalización ni pidas micrófono al cargar la app sin acción del usuario.

Voz pública por escena; llamadas privadas requieren aceptación en ambos sentidos. Pantalla solo tras gesto y permiso real, con stop al terminar la fuente. Solicitar hasta 4K/30 fps como ideal, aceptar el tamaño real devuelto por navegador/conexión y mostrar estados reales. No prometas 4K si el SO entrega menos. Dejar la sesión detiene lo que corresponda y limpia medios remotos. Conservar canal público separado de llamada privada.

Persistencia de datos propios: SQLite en Tauri, IndexedDB en navegador y fallback RAM explícito. Mapas locales adicionales usan claves estables y JSON validado. No publiques rutas, snippets, archivos o claves privadas en `PublicHouse`. El snapshot público solo contiene dueño/revisión/nombre/tema/acceso y muebles con ID/tipo/coordenadas/alias/rotación opcional.

Esta fase **no implementa servidor permanente**. La referencia sigue usando un anfitrión conectado, con margen de reconexión de 60 s y sin migración automática. No describas una demo de servidor como si fuera persistencia 24/7 resuelta.

## 11. Mapa de archivos y conexión de módulos

| Archivo o módulo | Responsabilidad |
|---|---|
| `ui/app.ts` | Shell, teléfono, escena, entrada, pizarras, modo decoración |
| `ui/style.css`, `ui/game.css`, `ui/theme.css` | Base, distribución, materiales compartidos en ese orden |
| `ui/art.ts` | Paleta, pixel art, animación, avatar, placas |
| `world/model.ts` | Movimiento, colisiones, A*, puertas y parcelas |
| `world/location.ts` | Área por defecto y predicado de escena |
| `world/areas.ts`, `world/draw.ts` | Geometría/portales/renderers; omitir estaciones de fases posteriores |
| `world/environment.ts` | Hora, clima, iluminación, audio ambiente |
| `house/model.ts`, `house/draw.ts`, `house/decoration.ts` | Muebles, footprint, previews, validación, historial |
| `whiteboard/model.ts`, `draw.ts`, `math.ts`, `boards-registry.ts` | Trazos, cámaras, LaTeX, documentos separados |
| `session/board.ts`, `session/client.ts` | Publicación autenticada de trazos, presencia y escenas |
| `notes/secure-notes.ts`, `ui/notes-ui.ts` | Datos seguros y editor de bloques |
| `projects/group-projects.ts`, `ui/projects-ui.ts` | Proyectos compartidos y enlaces VS Code |
| `study/decks.ts`, panel manual | Biblioteca, edición y repaso sin proveedor |
| `protocol/types.ts`, `schema.ts` | Contratos y límites, con `areaId` y `rotation?` compatibles |
| `storage/local-store.ts` | Esquema local separado y representación pública compatible |
| `assets/avatar-sheet.ts`, `custom-assets.ts` | Hoja de personaje/cuadrícula y sprites manuales |
| `media/manager.ts`, `identity`, `transport`, `signaling` | Servicios clásicos conservados |
| `src-tauri/src/desktop.rs`, capabilities | Abrir enlaces permitidos; persistencia nativa |

## 12. Orden de implementación y definición de terminado

1. Inventariar versión antigua, datos y funciones existentes. Guardar baseline.
2. Tema compartido y shell limpio; compilar y abrir.
3. Movimiento/portales/presencia por escena; probar dos clientes quietos en áreas distintas.
4. Separación de pizarras y migración; probar dos muebles y recarga.
5. Limpieza de herramientas avanzadas sin perder trazos.
6. Notas/proyectos con estética consistente y persistencia conservada.
7. Tarjetas manuales vacías y repaso persistente.
8. Decoración explícita validada con historial.
9. Ajustes/avatar/sonido y revisión responsive.

Aceptación mínima reproducible:

- Viewports 390×844, 820×1180, 1440×1000: ninguna barra horizontal de documento, texto legible, scroll del panel activo y controles de al menos unos 44 px.
- Dibujar en pizarra A, cambiar nombre, abrir B y comprobar que está limpia; dibujar otra cosa en B; recargar y verificar ambos documentos/títulos. Undo/redo en B no cambia A.
- Abrir Más, usar Formas, cerrar Más: el trazo inicial sigue idéntico. Borrador y borrar lo propio no afectan a otro autor.
- E no sale de una casa desde el centro; sí junto a la puerta. Cerrar una actividad devuelve WASD.
- Dos clientes: uno cambia a biblioteca y el otro queda en plaza; no se ven ni oyen por canal público. El que llega quieto ya queda separado. Reunirse vuelve a permitir presencia/medios públicos.
- Shift recorre 2,5 veces la distancia en suelo libre, diagonal normalizada, sin atravesar paredes finas. Release/blur/pointercancel detiene sprint.
- Decorar: probar lugar inválido, colocar válido, girar, undo, redo, recargar; nombre y acceso no retroceden con undo.
- Notas y proyectos nuevos vacíos. Una nota editada antigua sobrevive la migración. Crear/guardar/exportar una página real.
- Crear un mazo, añadir/editar/ordenar/borrar, repasar y recargar; se conserva progreso. Borrar el último mazo deja biblioteca vacía utilizable.
- Inspección de red: sin solicitudes de IA, señalización, micrófono o pantalla espontáneas en el primer inicio.
- Typecheck, tests de contratos/movimiento/pizarras y build pasan. No fabriques PASS de medios reales, de dos equipos físicos ni de Windows si solo has probado Chrome local.

Al entregar, enumera funciones reales terminadas y evidencia. No confundas una UI de permiso con sincronización implementada, un IDE simulado con VS Code real ni un anfitrión P2P con servidor persistente.

## Anexos canónicos

Los anexos siguientes fijan algoritmos y componentes exactos de la referencia. Para esta fase adapta imports de infraestructura compartida, excluye generaciones de IA y no montes estaciones de juegos. Una anotación «fragmento de clase» indica que debes integrar métodos y campos dentro de tu controlador existente. Conserva sus invariantes aunque tus nombres locales sean diferentes.

<!-- GENERATED CANONICAL SOURCES -->

### app/src/world/location.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `d818724c21fe0c9e5d75dfce7345ac01ba43b9804b4d0e5c46b5e74ea5380762`.

```ts
import type { Member, Position } from '../protocol/types';

export type WorldAreaId = 'residential' | 'community' | 'study';
export const AREA_NAMES: Record<WorldAreaId, string> = {
  residential: 'La aldea', community: 'Plaza Comunitaria', study: 'Biblioteca y Estudio',
};
export function areaOf(position: Position): WorldAreaId { return position.areaId ?? 'residential'; }

/** House membership takes precedence over the outdoor area a visitor came from. */
export function isInScene(member: Member, area: WorldAreaId, houseId: string | null): boolean {
  return member.connected && member.houseId === houseId && (houseId !== null || areaOf(member.position) === area);
}
```

### app/src/world/model.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `a6eeb31c113f4f4236ad1a758d2f94aecc628c46847d21bfec7a2a3352e24e70`.

```ts
import { LIMITS, type AppView, type Position, type PublicHouse } from '../protocol/types';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Parcel extends Rect { slot: number; doorX: number; doorY: number }
export interface OccupiedParcel { parcel: Parcel; house: PublicHouse; name: string; ownerId: string; isOwn: boolean }

export const PARCELS: readonly Parcel[] = [
  { slot: 0, x: 47, y: 34, w: 114, h: 83, doorX: 104, doorY: 117 },
  { slot: 1, x: 327, y: 34, w: 114, h: 83, doorX: 384, doorY: 117 },
  { slot: 2, x: 607, y: 34, w: 114, h: 83, doorX: 664, doorY: 117 },
  { slot: 3, x: 47, y: 293, w: 114, h: 83, doorX: 104, doorY: 293 },
  { slot: 4, x: 327, y: 293, w: 114, h: 83, doorX: 384, doorY: 293 },
  { slot: 5, x: 607, y: 293, w: 114, h: 83, doorX: 664, doorY: 293 },
];

export const WORLD_SPAWN: Position = { x: 384, y: 215, direction: 'down', moving: false };
export const WORLD_TREES = [
  { x: 13, y: 157 }, { x: 183, y: 156 }, { x: 294, y: 157 },
  { x: 462, y: 155 }, { x: 574, y: 157 }, { x: 750, y: 158 },
  { x: 15, y: 275 }, { x: 186, y: 275 }, { x: 295, y: 275 },
  { x: 460, y: 275 }, { x: 574, y: 275 }, { x: 750, y: 275 },
] as const;

export function occupiedParcels(view: AppView): OccupiedParcel[] {
  const { network, identity, ownHouse } = view;
  const byOwner = new Map(network.houses.map((house) => [house.ownerId, house]));
  byOwner.set(identity.fingerprint, ownHouse);
  const members = network.members.filter((member) => member.connected);
  const slots = members.length
    ? members.map((member) => ({ ownerId: member.identity.fingerprint, slot: member.slot, name: member.identity.displayName }))
    : [{ ownerId: identity.fingerprint, slot: 0, name: identity.displayName }];
  if (!slots.some((member) => member.ownerId === identity.fingerprint)) {
    slots.push({ ownerId: identity.fingerprint, slot: 0, name: identity.displayName });
  }
  const usedSlots = new Set<number>();
  return slots.flatMap(({ ownerId, slot, name }) => {
    const parcel = PARCELS[slot];
    const house = byOwner.get(ownerId);
    if (!parcel || !house || usedSlots.has(slot)) return [];
    usedSlots.add(slot);
    return [{ parcel, house, name, ownerId, isOwn: ownerId === identity.fingerprint }];
  });
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function circleHitsRect(x: number, y: number, radius: number, rect: Rect): boolean {
  const nearestX = Math.max(rect.x, Math.min(x, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(y, rect.y + rect.h));
  return (x - nearestX) ** 2 + (y - nearestY) ** 2 < radius ** 2;
}

export function stepPosition(
  from: Position,
  vector: { x: number; y: number },
  dtSeconds: number,
  obstacles: readonly Rect[],
  bounds: Rect = { x: 0, y: 0, w: LIMITS.worldWidth, h: LIMITS.worldHeight },
  speed = 110,
): Position {
  const xDir = Math.sign(vector.x);
  const yDir = Math.sign(vector.y);
  const moving = xDir !== 0 || yDir !== 0;
  if (!moving) return { ...from, moving: false };
  const direction: Position['direction'] = Math.abs(vector.x) >= Math.abs(vector.y)
    ? (xDir < 0 ? 'left' : 'right')
    : (yDir < 0 ? 'up' : 'down');
  const dt = Math.max(0, Math.min(Number.isFinite(dtSeconds) ? dtSeconds : 0, 0.05));
  const length = Math.hypot(vector.x, vector.y) || 1;
  const radius = 9;
  const inBounds = (x: number, y: number) => x >= bounds.x + radius && x <= bounds.x + bounds.w - radius
    && y >= bounds.y + radius && y <= bounds.y + bounds.h - radius;
  const free = (x: number, y: number) => inBounds(x, y) && !obstacles.some((rect) => circleHitsRect(x, y, radius, rect));
  // A player already overlapping an obstacle (a spawn point under a new
  // object, an object moved onto them) may walk out instead of freezing.
  const inside = free(from.x, from.y) ? free : inBounds;
  let x = from.x;
  let y = from.y;
  const distance = Math.max(0, speed) * dt;
  const steps = Math.max(1, Math.ceil(distance / 4));
  for (let i = 0; i < steps; i++) {
    const nextX = x + vector.x / length * distance / steps;
    if (inside(nextX, y)) x = nextX;
    const nextY = y + vector.y / length * distance / steps;
    if (inside(x, nextY)) y = nextY;
  }
  return { x, y, direction, moving: x !== from.x || y !== from.y };
}

export function worldObstacles(occupied: readonly OccupiedParcel[]): Rect[] {
  return [
    ...occupied.map(({ parcel }) => ({ x: parcel.x - 2, y: parcel.y - 6, w: parcel.w + 4, h: parcel.h + 5 })),
    ...WORLD_TREES.map(({ x, y }) => ({ x: x - 11, y: y - 16, w: 22, h: 25 })),
  ];
}

/**
 * A walkable route for click-to-walk: A* over an 8px grid using the same
 * collision as stepPosition, then trimmed to the corners that matter. The goal
 * snaps to the nearest walkable cell, since you usually click on the thing you
 * want to use rather than next to it. Returns null when nothing is reachable.
 */
export function findPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  obstacles: readonly Rect[],
  bounds: Rect = { x: 0, y: 0, w: LIMITS.worldWidth, h: LIMITS.worldHeight },
): { x: number; y: number }[] | null {
  const cell = 8;
  const radius = 9;
  const cols = Math.floor(bounds.w / cell);
  const rows = Math.floor(bounds.h / cell);
  const center = (i: number) => ({ x: bounds.x + (i % cols) * cell + cell / 2, y: bounds.y + Math.floor(i / cols) * cell + cell / 2 });
  const free = (x: number, y: number) => x >= bounds.x + radius && x <= bounds.x + bounds.w - radius
    && y >= bounds.y + radius && y <= bounds.y + bounds.h - radius
    && !obstacles.some((rect) => circleHitsRect(x, y, radius, rect));
  const walkable = new Uint8Array(cols * rows);
  for (let i = 0; i < walkable.length; i++) { const c = center(i); walkable[i] = free(c.x, c.y) ? 1 : 0; }
  const indexOf = (p: { x: number; y: number }) => {
    const col = Math.max(0, Math.min(cols - 1, Math.floor((p.x - bounds.x) / cell)));
    const row = Math.max(0, Math.min(rows - 1, Math.floor((p.y - bounds.y) / cell)));
    return row * cols + col;
  };
  const nearestWalkable = (start: number): number => {
    if (walkable[start]) return start;
    const seen = new Uint8Array(cols * rows);
    const queue = [start];
    seen[start] = 1;
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      if (walkable[i]) return i;
      const col = i % cols;
      for (const n of [i - cols, i + cols, col > 0 ? i - 1 : -1, col < cols - 1 ? i + 1 : -1]) {
        if (n >= 0 && n < seen.length && !seen[n]) { seen[n] = 1; queue.push(n); }
      }
    }
    return -1;
  };
  const start = indexOf(from);
  const goal = nearestWalkable(indexOf(to));
  if (goal < 0) return null;
  // Someone standing inside an obstacle may still leave it.
  walkable[start] = 1;
  const g = new Float64Array(cols * rows).fill(Infinity);
  const came = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const open: number[] = [start];
  const h = (i: number) => { const a = center(i); const b = center(goal); return Math.hypot(a.x - b.x, a.y - b.y); };
  const f = new Float64Array(cols * rows).fill(Infinity);
  g[start] = 0;
  f[start] = h(start);
  while (open.length) {
    let best = 0;
    for (let k = 1; k < open.length; k++) if (f[open[k]] < f[open[best]]) best = k;
    const current = open.splice(best, 1)[0];
    if (current === goal) break;
    closed[current] = 1;
    const col = current % cols;
    const row = Math.floor(current / cols);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const c = col + dx; const r = row + dy;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const n = r * cols + c;
        if (!walkable[n] || closed[n]) continue;
        // No cutting corners between two blocked cells.
        if (dx && dy && (!walkable[row * cols + c] || !walkable[r * cols + col])) continue;
        const cost = g[current] + (dx && dy ? Math.SQRT2 : 1) * cell;
        if (cost < g[n]) {
          if (g[n] === Infinity) open.push(n);
          g[n] = cost;
          f[n] = cost + h(n);
          came[n] = current;
        }
      }
    }
  }
  if (goal !== start && came[goal] < 0) return null;
  const cells: number[] = [];
  for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.unshift(i);
  const points = cells.map(center);
  const target = free(to.x, to.y) ? { x: to.x, y: to.y } : null;
  if (target) points.push(target);
  // Keep only the waypoints needed to go around things.
  const clear = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 4);
    for (let s = 1; s <= steps; s++) if (!free(a.x + (b.x - a.x) * s / steps, a.y + (b.y - a.y) * s / steps)) return false;
    return true;
  };
  const route: { x: number; y: number }[] = [];
  let anchor = { x: from.x, y: from.y };
  for (let k = 0; k < points.length; k++) {
    const next = points[k + 1];
    if (next && clear(anchor, next)) continue;
    route.push(points[k]);
    anchor = points[k];
  }
  return route;
}

export function closestDoor(position: Position, occupied: readonly OccupiedParcel[], maxDistance = 32): OccupiedParcel | null {
  let closest: OccupiedParcel | null = null;
  let distance = maxDistance;
  for (const item of occupied) {
    const next = Math.hypot(item.parcel.doorX - position.x, item.parcel.doorY - position.y);
    if (next < distance) { closest = item; distance = next; }
  }
  return closest;
}
```

### app/src/house/model.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `b0489c8aaaab0af771b17ee71b445879d9ac7b57c12e9961cced8943cde6ebac`.

```ts
import { LIMITS, type Furniture, type FurnitureKind, type Position, type PublicHouse } from '../protocol/types';
import { type Rect, stepPosition } from '../world/model';

export const HOUSE_SPAWN: Position = { x: 384, y: 344, direction: 'up', moving: false };
export const HOUSE_BOUNDS: Rect = { x: 28, y: 72, w: 712, h: 334 };

/** The doorway at the bottom of every room, on the doormat. */
export const HOUSE_DOOR = { x: 384, y: 396 } as const;
const DOOR_REACH = 40;

/**
 * Whether the character is standing at the doorway. Leaving with E is only
 * allowed here, so a stray keypress in the middle of the room no longer ejects
 * the player to the village. Spawn (384,344) is deliberately out of reach.
 */
export function atHouseDoor(position: Position): boolean {
  return Math.abs(position.x - HOUSE_DOOR.x) <= DOOR_REACH && HOUSE_DOOR.y - position.y <= DOOR_REACH;
}
export const FURNITURE_KINDS: readonly FurnitureKind[] = ['desk', 'bookshelf', 'board', 'plant', 'table', 'frame', 'cabinet'];
export const FURNITURE_LABELS: Record<FurnitureKind, string> = {
  desk: 'Escritorio', bookshelf: 'Librería', board: 'Pizarra', plant: 'Planta',
  table: 'Mesa', frame: 'Cuadro', cabinet: 'Armario',
};

export const FURNITURE_ACTION_LABELS: Record<FurnitureKind, string> = {
  desk: 'Proyectos en VS Code',
  bookshelf: 'Tarjetas de repaso',
  board: 'Abrir pizarra colaborativa',
  plant: 'Cuidar planta',
  table: 'Mesa de estudio y voz',
  frame: 'Ver cuadro / imagen',
  cabinet: 'Abrir apuntes',
};

export const FURNITURE_PROMPT_LABELS: Record<FurnitureKind, string> = {
  desk: 'E · Proyectos',
  bookshelf: 'E · Tarjetas',
  board: 'E · Abrir Pizarra',
  plant: 'E · Cuidar planta',
  table: 'E · Mesa de voz',
  frame: 'E · Ver cuadro',
  cabinet: 'E · Apuntes',
};

export function furnitureRect(item: Furniture): Rect {
  const size: Record<FurnitureKind, [number, number]> = {
    desk: [69, 39], bookshelf: [45, 60], board: [66, 28], plant: [27, 27],
    table: [58, 42], frame: [34, 22], cabinet: [48, 45],
  };
  const rotated = item.rotation === 90 || item.rotation === 270;
  const [w, h] = rotated ? [...size[item.kind]].reverse() : size[item.kind];
  return { x: item.x, y: item.y, w, h };
}

export function clampFurniture(item: Furniture, x: number, y: number): Furniture {
  const rect = furnitureRect(item);
  return {
    ...item,
    x: Math.round(Math.max(HOUSE_BOUNDS.x, Math.min(LIMITS.worldWidth - 32, HOUSE_BOUNDS.x + HOUSE_BOUNDS.w - rect.w, x))),
    y: Math.round(Math.max(HOUSE_BOUNDS.y, Math.min(LIMITS.worldHeight - 32, HOUSE_BOUNDS.y + HOUSE_BOUNDS.h - rect.h, y))),
  };
}

export function canEditHouse(house: PublicHouse, fingerprint: string): boolean {
  return house.ownerId === fingerprint;
}

export function moveFurniture(house: PublicHouse, id: string, x: number, y: number, fingerprint: string): PublicHouse {
  if (!canEditHouse(house, fingerprint)) return house;
  const furniture = house.furniture.map((item) => item.id === id ? clampFurniture(item, x, y) : item);
  if (furniture.every((item, index) => item === house.furniture[index]
    || (item.x === house.furniture[index].x && item.y === house.furniture[index].y))) return house;
  return { ...house, revision: house.revision + 1, furniture };
}

export function addFurniture(house: PublicHouse, kind: FurnitureKind, fingerprint: string, id: string): PublicHouse {
  if (!canEditHouse(house, fingerprint) || house.furniture.length >= LIMITS.furniture || house.furniture.some((item) => item.id === id)) return house;
  const step = house.furniture.length % 5;
  const item: Furniture = { id, kind, x: 105 + step * 92, y: 145 + Math.floor(house.furniture.length / 5) * 48, publicAlias: '' };
  return { ...house, revision: house.revision + 1, furniture: [...house.furniture, clampFurniture(item, item.x, item.y)] };
}

export function deleteFurniture(house: PublicHouse, id: string, fingerprint: string): PublicHouse {
  if (!canEditHouse(house, fingerprint)) return house;
  const furniture = house.furniture.filter((item) => item.id !== id);
  return furniture.length === house.furniture.length ? house : { ...house, revision: house.revision + 1, furniture };
}

export function setFurnitureAlias(house: PublicHouse, id: string, alias: string, fingerprint: string): PublicHouse {
  if (!canEditHouse(house, fingerprint)) return house;
  const safeAlias = alias.trim().slice(0, 40);
  const furniture = house.furniture.map((item) => item.id === id ? { ...item, publicAlias: safeAlias } : item);
  return furniture.some((item, index) => item.publicAlias !== house.furniture[index].publicAlias)
    ? { ...house, revision: house.revision + 1, furniture }
    : house;
}

export function houseObstacles(house: PublicHouse): Rect[] {
  return house.furniture.filter((item) => item.kind !== 'frame' && item.kind !== 'board')
    .map((item) => furnitureRect(item));
}

export function stepHousePosition(from: Position, vector: { x: number; y: number }, dt: number, house: PublicHouse, speedMultiplier = 1): Position {
  return stepPosition(from, vector, dt, houseObstacles(house), HOUSE_BOUNDS, 105 * speedMultiplier);
}

export function hitFurniture(house: PublicHouse, x: number, y: number): Furniture | null {
  for (let i = house.furniture.length - 1; i >= 0; i--) {
    const item = house.furniture[i];
    const rect = furnitureRect(item);
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return item;
  }
  return null;
}

/**
 * Finds the nearest furniture item within reach of the character (`maxDistance`
 * from the furniture's bounding rectangle) so pressing E interacts with it.
 */
export function closestFurniture(position: Position, house: PublicHouse, maxDistance = 42): Furniture | null {
  let closest: Furniture | null = null;
  let best = maxDistance;
  for (const item of house.furniture) {
    const rect = furnitureRect(item);
    const nx = Math.max(rect.x, Math.min(position.x, rect.x + rect.w));
    const ny = Math.max(rect.y, Math.min(position.y, rect.y + rect.h));
    const dist = Math.hypot(position.x - nx, position.y - ny);
    if (dist <= best) {
      best = dist;
      closest = item;
    }
  }
  return closest;
}
```

### app/src/house/decoration.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `6a3a29e61681f6520af27e18f75c18ce9e1af61faba5b009dab0add8a6f8b9c9`.

```ts
import type { Furniture, PublicHouse } from '../protocol/types';
import { circleHitsRect, findPath } from '../world/model';
import { HOUSE_BOUNDS, HOUSE_DOOR, HOUSE_SPAWN, furnitureRect, houseObstacles } from './model';
export function placementError(house: PublicHouse, changedId: string): string | null {
  const item=house.furniture.find(f=>f.id===changedId);if(!item)return null;
  const rect=furnitureRect(item);const b=HOUSE_BOUNDS;
  if(rect.x<b.x||rect.y<b.y||rect.x+rect.w>b.x+b.w||rect.y+rect.h>b.y+b.h)return 'El mueble queda fuera de la habitación.';
  for(const other of house.furniture){if(other.id===item.id)continue;const r=furnitureRect(other);if(rect.x<r.x+r.w&&rect.x+rect.w>r.x&&rect.y<r.y+r.h&&rect.y+rect.h>r.y)return 'Los muebles se solapan.';}
  const obstacles=houseObstacles(house);
  if(obstacles.some(r=>circleHitsRect(HOUSE_SPAWN.x,HOUSE_SPAWN.y,9,r))||!findPath(HOUSE_SPAWN,{x:HOUSE_DOOR.x,y:HOUSE_DOOR.y-14},obstacles,HOUSE_BOUNDS))return 'Deja libre la entrada y el camino a la puerta.';
  for(const f of house.furniture.filter(f=>['desk','bookshelf','board','cabinet','table'].includes(f.kind))){
    const r=furnitureRect(f);const points=[{x:r.x+r.w/2,y:r.y+r.h+14},{x:r.x+r.w/2,y:r.y-14},{x:r.x-14,y:r.y+r.h/2},{x:r.x+r.w+14,y:r.y+r.h/2}];
    if(!points.some(p=>p.x>=b.x+9&&p.x<=b.x+b.w-9&&p.y>=b.y+9&&p.y<=b.y+b.h-9&&!obstacles.some(o=>circleHitsRect(p.x,p.y,9,o))&&findPath(HOUSE_SPAWN,p,obstacles,b)))return 'Ese cambio impide acceder a un mueble.';
  }
  return null;
}
export class DecorationHistory {
  private undoStack: Furniture[][]=[];private redoStack: Furniture[][]=[];
  remember(house: PublicHouse): void {this.undoStack.push(structuredClone(house.furniture));if(this.undoStack.length>50)this.undoStack.shift();this.redoStack=[];}
  undo(house: PublicHouse): PublicHouse|null {const previous=this.undoStack.pop();if(!previous)return null;this.redoStack.push(structuredClone(house.furniture));return {...house,furniture:previous,revision:house.revision+1};}
  redo(house: PublicHouse): PublicHouse|null {const next=this.redoStack.pop();if(!next)return null;this.undoStack.push(structuredClone(house.furniture));return {...house,furniture:next,revision:house.revision+1};}
}
```

### app/src/house/draw.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `b456742a85657ab81ff17c3eebed78d6bbd3596d8ae03a0c99a5b6a80a56bec7`.

```ts
import type { Furniture, PublicHouse } from '../protocol/types';
import { getFurnitureCustomColor, getFurnitureCustomSprite } from '../assets/custom-assets';
import {
  PALETTE, animClock, contactShadow, drawAvatar, fill, glowPool, hash01,
  ipx, paintSceneFade, plate, reducedMotion, seed, shade, text, trackCharacter,
} from '../ui/art';
import type { DrawPerson } from '../world/draw';
import { furnitureRect } from './model';

const W = 768;
const H = 432;
const WALL_BOTTOM = 72;

const [, moss1, moss2, , moss4] = PALETTE.moss;
const [earth0, earth1, earth2, earth3, earth4] = PALETTE.earth;
const [ember0, , ember2, ember3, ember4] = PALETTE.ember;

interface Sprite { baseline: number; paint: () => void }

interface Room {
  wall: string; wallLit: string; wallDark: string;
  floor: string; floorLit: string; floorDark: string;
  trim: string; rug: string; rugAlt: string;
}

function palette(house: PublicHouse): Room {
  const peach = house.theme === 'peach';
  const wall = peach ? '#e3bfa3' : '#bfd0ba';
  const floor = peach ? '#b98a5e' : '#a8814f';
  return {
    wall,
    wallLit: shade(wall, 20),
    wallDark: shade(wall, -34),
    floor,
    floorLit: shade(floor, 20),
    floorDark: shade(floor, -30),
    trim: peach ? '#8d5440' : '#39614c',
    rug: peach ? '#a6513c' : '#8a6246',
    rugAlt: peach ? '#d98f62' : '#c08f5c',
  };
}

/** Back wall: wallpaper, picture rail, wainscot panelling and skirting. */
function paintWall(ctx: CanvasRenderingContext2D, room: Room, time: number): void {
  fill(ctx, room.wall, 0, 0, W, WALL_BOTTOM);
  fill(ctx, room.wallLit, 0, 0, W, 8);
  // Faint vertical wallpaper stripes.
  for (let x = 0; x < W; x += 16) {
    fill(ctx, shade(room.wall, 8), x, 0, 4, WALL_BOTTOM - 18);
    if (seed(x / 16, 3) > 0.7) fill(ctx, shade(room.wall, 14), x + 7, 14, 2, 2);
  }
  // Wainscot along the bottom of the wall.
  fill(ctx, shade(room.wall, -14), 0, WALL_BOTTOM - 22, W, 22);
  for (let x = 6; x < W; x += 34) {
    fill(ctx, shade(room.wall, -4), x, WALL_BOTTOM - 18, 24, 12);
    fill(ctx, shade(room.wall, 10), x, WALL_BOTTOM - 18, 24, 2);
  }
  fill(ctx, room.trim, 0, WALL_BOTTOM - 24, W, 4);
  fill(ctx, room.trim, 0, WALL_BOTTOM - 6, W, 6);
  fill(ctx, shade(room.trim, 20), 0, WALL_BOTTOM - 6, W, 2);

  // Two windows with daylight and a sill.
  for (const x of [96, 604]) {
    fill(ctx, room.trim, x - 6, 14, 80, 44);
    fill(ctx, shade(room.trim, -18), x - 6, 54, 80, 6);
    const warm = 0.9 + Math.sin(time * 0.7 + x) * 0.05;
    ctx.fillStyle = `rgba(206,232,236,${warm})`;
    ctx.fillRect(ipx(x), ipx(20), 68, 34);
    // A hint of garden outside.
    fill(ctx, '#9cc8d2', x, 20, 68, 14);
    fill(ctx, moss2, x, 40, 68, 14);
    fill(ctx, moss4, x + 8, 36, 14, 8);
    fill(ctx, moss4, x + 44, 38, 12, 6);
    fill(ctx, '#f2efe0', x + 50, 23, 10, 6);
    fill(ctx, room.trim, x + 32, 20, 4, 34);
    fill(ctx, room.trim, x, 35, 68, 4);
    fill(ctx, earth3, x - 10, 58, 88, 6);
    fill(ctx, earth4, x - 10, 58, 88, 2);
    // Potted plant on the sill.
    fill(ctx, earth1, x + 54, 48, 14, 10);
    fill(ctx, moss2, x + 57, 40, 4, 9);
    fill(ctx, moss4, x + 53, 40, 6, 5);
    fill(ctx, moss4, x + 60, 38, 7, 6);
  }
}

/**
 * Wood flooring plus the light the windows throw across it.
 * Deliberately NO staggered vertical joints: combining horizontal rows with
 * offset vertical joints renders as brickwork, not floorboards.
 */
function paintFloor(ctx: CanvasRenderingContext2D, room: Room, time: number): void {
  fill(ctx, room.floor, 0, WALL_BOTTOM, W, H - WALL_BOTTOM);

  // Long planks running the width of the room, alternating tone very slightly.
  for (let y = WALL_BOTTOM; y < H; y += 18) {
    const band = Math.round((y - WALL_BOTTOM) / 18);
    fill(ctx, band % 2 ? shade(room.floor, 5) : shade(room.floor, -4), 0, y, W, 18);
    // A single soft seam, not a hard dark rule.
    ctx.fillStyle = 'rgba(60,40,24,0.17)';
    ctx.fillRect(0, ipx(y), W, 1);
    ctx.fillStyle = 'rgba(255,230,190,0.10)';
    ctx.fillRect(0, ipx(y) + 1, W, 1);
    // Grain: short horizontal strokes along the length of each board.
    for (let x = (band * 37) % 64; x < W; x += 64) {
      const n = seed(x / 64 + band * 3, band);
      if (n > 0.52) {
        ctx.fillStyle = 'rgba(70,46,26,0.10)';
        ctx.fillRect(ipx(x), ipx(y + 5 + n * 7), 26 + n * 22, 1);
      }
      // Occasional butt joint between boards, kept rare and short.
      if (n > 0.93) {
        ctx.fillStyle = 'rgba(60,40,24,0.20)';
        ctx.fillRect(ipx(x + 20), ipx(y) + 2, 1, 15);
      }
    }
  }

  // Contact shadow where the wall meets the floor.
  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = `rgba(28,42,34,${0.2 - i * 0.02})`;
    ctx.fillRect(0, WALL_BOTTOM + i, W, 1);
  }

  // Daylight falling from each window, skewed across the boards.
  for (const x of [96, 604]) {
    ctx.save();
    ctx.globalAlpha = 0.15 + Math.sin(time * 0.5 + x) * 0.02;
    ctx.fillStyle = '#fff3cf';
    ctx.beginPath();
    ctx.moveTo(x - 4, WALL_BOTTOM);
    ctx.lineTo(x + 72, WALL_BOTTOM);
    ctx.lineTo(x + 116, H);
    ctx.lineTo(x + 20, H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Rug: a warm woven piece that anchors the middle of the room.
  const rx = 252;
  const ry = 210;
  const rw = 264;
  const rh = 126;
  contactShadow(ctx, rx + rw / 2, ry + rh, rw * 0.44, 0.2);
  fill(ctx, shade(room.rug, -30), rx, ry, rw, rh);
  fill(ctx, room.rug, rx + 3, ry + 3, rw - 6, rh - 6);
  fill(ctx, shade(room.rug, 16), rx + 10, ry + 10, rw - 20, rh - 20);
  fill(ctx, room.rugAlt, rx + 20, ry + 20, rw - 40, rh - 40);
  fill(ctx, shade(room.rug, 10), rx + 34, ry + 32, rw - 68, rh - 64);
  // Woven motif.
  for (let i = 0; i < 7; i += 1) {
    fill(ctx, shade(room.rugAlt, 22), rx + 44 + i * 26, ry + 44, 12, 8);
    fill(ctx, shade(room.rugAlt, 22), rx + 44 + i * 26, ry + rh - 52, 12, 8);
  }
  for (let i = 0; i < 3; i += 1) {
    fill(ctx, shade(room.rug, -14), rx + 72 + i * 48, ry + 60, 24, 6);
  }
  // Fringe along the short ends.
  for (let i = 0; i < rh; i += 7) {
    fill(ctx, shade(room.rug, 34), rx - 3, ry + i, 3, 4);
    fill(ctx, shade(room.rug, 34), rx + rw, ry + i, 3, 4);
  }
}

/**
 * Side and front walls drawn in the margins HOUSE_BOUNDS leaves unwalkable
 * (x below 28, x above 740, y below 406), so the room reads as enclosed
 * without ever covering ground a character can stand on.
 */
function paintRoomFrame(ctx: CanvasRenderingContext2D, room: Room): void {
  // Dark stained skirting, keyed to the floor rather than the wall paint, so
  // the frame reads as joinery instead of a second wall colour.
  const deep = shade(room.floorDark, -26);
  const mid = shade(room.floorDark, -8);
  for (const [x, lit] of [[0, true], [746, false]] as const) {
    fill(ctx, deep, x, WALL_BOTTOM - 4, 22, H - WALL_BOTTOM);
    fill(ctx, lit ? mid : shade(deep, -8), x + (lit ? 0 : 8), WALL_BOTTOM - 4, 14, H - WALL_BOTTOM);
    for (let y = WALL_BOTTOM; y < H - 16; y += 30) fill(ctx, shade(deep, -8), x + 2, y, 18, 2);
  }
  fill(ctx, deep, 0, H - 18, W, 18);
  fill(ctx, mid, 0, H - 18, W, 11);
  for (let x = 4; x < W; x += 38) fill(ctx, shade(deep, -6), x, H - 16, 2, 9);
  fill(ctx, shade(room.trim, -14), 0, H - 20, W, 3);

  // The doorway out of the room, centred on the doormat. E only works here.
  fill(ctx, shade(deep, -22), 356, H - 20, 56, 20);
  fill(ctx, '#2a3d32', 360, H - 18, 48, 18);
  fill(ctx, 'rgba(255,214,150,0.35)', 362, H - 18, 44, 3);
  fill(ctx, room.trim, 352, H - 22, 6, 22);
  fill(ctx, room.trim, 410, H - 22, 6, 22);

  // Inner corner shadows so the joinery sits against the boards.
  for (let i = 0; i < 12; i += 1) {
    const a = (0.15 - i * 0.012).toFixed(3);
    ctx.fillStyle = `rgba(28,20,12,${a})`;
    ctx.fillRect(22 + i, WALL_BOTTOM, 1, H - WALL_BOTTOM - 18);
    ctx.fillRect(745 - i, WALL_BOTTOM, 1, H - WALL_BOTTOM - 18);
    ctx.fillRect(0, H - 19 - i, W, 1);
  }
}

/** Fixtures that belong to the building rather than to the furniture list. */
function paintFixtures(ctx: CanvasRenderingContext2D, room: Room, time: number): void {
  // A shelf of books and a clock on the back wall.
  fill(ctx, shade(earth0, -8), 300, 44, 70, 5);
  fill(ctx, earth2, 300, 44, 70, 2);
  const books = ['#c9604a', '#4b8f7e', '#d9a65c', '#7a6ba8'];
  for (let i = 0; i < 7; i += 1) {
    const bh = 10 + Math.floor(seed(i, 5) * 4);
    fill(ctx, books[i % books.length], 304 + i * 9, 44 - bh, 7, bh);
    fill(ctx, 'rgba(255,255,255,0.16)', 304 + i * 9, 44 - bh, 7, 2);
  }
  fill(ctx, shade(earth0, -6), 436, 20, 26, 26);
  fill(ctx, PALETTE.paper[3], 439, 23, 20, 20);
  fill(ctx, room.trim, 448, 26, 2, 8);
  fill(ctx, room.trim, 449, 32, 7, 2);
  void time;
}

/**
 * Warm ambient light over the middle of the room.
 * A visible pendant fitting was tried and removed: furniture positions are
 * user-controlled, so any fixed fitting eventually overlaps a wall-mounted
 * frame or board and reads as a drawing error. Light without a fixture has no
 * such failure mode.
 */
function paintLampPool(ctx: CanvasRenderingContext2D, time: number): void {
  const breathe = 1 + Math.sin(time * 0.6) * 0.015;
  glowPool(ctx, 384, 262, 210 * breathe, '255,208,140');
  glowPool(ctx, 384, 250, 120 * breathe, '255,226,176');
}

function paintFurniture(
  ctx: CanvasRenderingContext2D,
  item: Furniture,
  selected: boolean,
  nearby: boolean,
  time: number,
  perItemSprite?: HTMLImageElement | null,
): void {
  const { x, y, w, h } = furnitureRect(item);
  const wall = item.kind === 'frame' || item.kind === 'board';
  if (!wall) contactShadow(ctx, x + w / 2, y + h - 1, w * 0.46, 0.32);

  const customSprite = perItemSprite || getFurnitureCustomSprite(item.kind);
  const customColor = getFurnitureCustomColor(item.kind);
  const baseEarth0 = customColor ? shade(customColor, -38) : earth0;
  const baseEarth1 = customColor ? shade(customColor, -22) : earth1;
  const baseEarth2 = customColor || earth2;
  const baseEarth3 = customColor ? shade(customColor, 16) : earth3;
  const baseEarth4 = customColor ? shade(customColor, 32) : earth4;

  if (customSprite) {
    ctx.drawImage(customSprite, ipx(x), ipx(y), ipx(w), ipx(h));
  } else {
    switch (item.kind) {
      case 'desk': {
        // Legs, apron, top with a lit front edge, monitor, lamp and papers.
        fill(ctx, baseEarth0, x + 5, y + 20, 6, h - 20);
        fill(ctx, baseEarth0, x + w - 11, y + 20, 6, h - 20);
        fill(ctx, shade(baseEarth1, -10), x + 2, y + 16, w - 4, 8);
        fill(ctx, baseEarth2, x, y + 10, w, 10);
        fill(ctx, baseEarth4, x, y + 10, w, 4);
        fill(ctx, shade(baseEarth2, -16), x, y + 19, w, 3);
        fill(ctx, '#34504a', x + 14, y, 28, 14);
        fill(ctx, '#1f3a38', x + 16, y + 2, 24, 10);
        fill(ctx, '#7fc7c0', x + 17, y + 3, 22, 5);
        fill(ctx, '#34504a', x + 25, y + 13, 6, 4);
        fill(ctx, PALETTE.paper[4], x + 46, y + 4, 16, 7);
        fill(ctx, shade(PALETTE.paper[4], -22), x + 46, y + 9, 16, 2);
        fill(ctx, ember0, x + 6, y + 2, 4, 9);
        fill(ctx, ember4, x + 3, y, 10, 4);
        glowPool(ctx, x + 8, y + 16, 22);
        break;
      }
      case 'bookshelf': {
        fill(ctx, shade(baseEarth0, -12), x, y, w, h);
        fill(ctx, baseEarth1, x + 3, y + 2, w - 6, h - 4);
        fill(ctx, baseEarth2, x + 3, y + 2, 3, h - 4);
        for (let row = 0; row < 4; row += 1) {
          const sy = y + 6 + row * 14;
          fill(ctx, shade(baseEarth0, -6), x + 4, sy + 11, w - 8, 3);
          const count = 4 + Math.floor(seed(row, item.x) * 2);
          for (let col = 0; col < count; col += 1) {
            const n = seed(row * 7 + col, item.y);
            const bh = 8 + Math.floor(n * 3);
            const books = ['#c9604a', '#4b8f7e', '#d9a65c', '#7a6ba8', '#bf7f52'];
            fill(ctx, books[(row + col) % books.length], x + 6 + col * 8, sy + 11 - bh, 6, bh);
            fill(ctx, 'rgba(255,255,255,0.18)', x + 6 + col * 8, sy + 11 - bh, 6, 2);
          }
        }
        fill(ctx, moss2, x + w - 14, y + 2, 5, 7);
        fill(ctx, moss4, x + w - 17, y, 10, 5);
        break;
      }
      case 'board': {
        fill(ctx, shade(baseEarth0, -10), x, y, w, h);
        fill(ctx, baseEarth2, x + 1, y + 1, w - 2, 3);
        fill(ctx, '#f7f3e4', x + 4, y + 4, w - 8, h - 10);
        fill(ctx, shade('#f7f3e4', -16), x + 4, y + h - 8, w - 8, 2);
        fill(ctx, '#4b8f7e', x + 9, y + 9, 26, 3);
        fill(ctx, '#c9604a', x + 9, y + 15, 36, 3);
        fill(ctx, '#7a6ba8', x + 9, y + 20, 18, 2);
        fill(ctx, baseEarth1, x + 2, y + h - 5, w - 4, 4);
        fill(ctx, ember4, x + w - 16, y + h - 4, 8, 2);
        break;
      }
      case 'plant': {
        fill(ctx, shade(baseEarth1, -14), x + 5, y + 13, w - 10, h - 13);
        fill(ctx, baseEarth1, x + 5, y + 13, w - 13, h - 13);
        fill(ctx, baseEarth3, x + 3, y + 11, w - 6, 5);
        fill(ctx, shade(baseEarth1, -20), x + 5, y + h - 4, w - 10, 3);
        const sway = Math.sin(time * 1.1 + hash01(item.id) * 6) * 1.2;
        fill(ctx, moss1, x + 12, y + 2, 4, 12);
        fill(ctx, moss2, x + 4 + sway, y + 3, 10, 7);
        fill(ctx, moss4, x + 13 + sway, y - 1, 10, 8);
        fill(ctx, moss4, x + 2 + sway, y, 8, 5);
        fill(ctx, PALETTE.moss[5], x + 15 + sway, y - 2, 5, 3);
        break;
      }
      case 'table': {
        fill(ctx, baseEarth0, x + 6, y + 22, 6, h - 22);
        fill(ctx, baseEarth0, x + w - 12, y + 22, 6, h - 22);
        fill(ctx, shade(baseEarth1, -12), x + 2, y + 18, w - 4, 7);
        fill(ctx, baseEarth2, x, y + 8, w, 12);
        fill(ctx, baseEarth4, x, y + 8, w, 4);
        fill(ctx, shade(baseEarth2, -18), x, y + 19, w, 3);
        // A mug and a plate of something.
        fill(ctx, '#f4efdd', x + 14, y + 2, 10, 8);
        fill(ctx, '#d8d2bd', x + 14, y + 8, 10, 2);
        fill(ctx, '#c9604a', x + 32, y + 4, 14, 6);
        fill(ctx, ember4, x + 34, y + 2, 10, 3);
        ctx.fillStyle = `rgba(255,255,255,${0.14 + Math.sin(time * 1.4) * 0.06})`;
        ctx.fillRect(ipx(x + 18), ipx(y - 4), 2, 6);
        break;
      }
      case 'frame': {
        fill(ctx, shade(baseEarth0, -8), x, y, w, h);
        fill(ctx, baseEarth2, x + 2, y + 2, w - 4, h - 4);
        fill(ctx, PALETTE.paper[3], x + 4, y + 4, w - 8, h - 8);
        fill(ctx, '#8fb79f', x + 6, y + 6, w - 12, h - 12);
        fill(ctx, '#5d8f7c', x + 6, y + h - 12, w - 12, 6);
        fill(ctx, ember4, x + 10, y + 8, 5, 5);
        fill(ctx, 'rgba(255,255,255,0.22)', x + 4, y + 4, w - 8, 3);
        break;
      }
      case 'cabinet': {
        fill(ctx, shade(baseEarth0, -10), x, y, w, h);
        fill(ctx, baseEarth1, x + 2, y + 2, w - 4, h - 4);
        fill(ctx, baseEarth2, x + 2, y + 2, w - 4, 4);
        for (const dx of [6, w / 2 + 2]) {
          fill(ctx, shade(baseEarth2, -6), x + dx, y + 8, w / 2 - 8, h - 16);
          fill(ctx, baseEarth3, x + dx, y + 8, w / 2 - 8, 3);
          fill(ctx, shade(baseEarth0, -4), x + dx + 2, y + 14, w / 2 - 12, 2);
        }
        fill(ctx, ember4, x + w / 2 - 5, y + 22, 3, 4);
        fill(ctx, ember4, x + w / 2 + 3, y + 22, 3, 4);
        fill(ctx, baseEarth3, x, y + h - 5, w, 4);
        break;
      }
    }
  }

  if (nearby && !selected) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 224, 150, 0.9)';
    ctx.lineWidth = 1.75;
    ctx.strokeRect(ipx(x - 3), ipx(y - 3), ipx(w + 6), ipx(h + 6));
    ctx.restore();
  }

  if (selected) {
    // Animated marching highlight rather than a static dashed box.
    ctx.save();
    ctx.strokeStyle = ember3;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.lineDashOffset = -(time * 18) % 10;
    ctx.strokeRect(ipx(x - 4), ipx(y - 4), ipx(w + 8), ipx(h + 8));
    ctx.restore();
    for (const [cx, cy] of [[x - 4, y - 4], [x + w + 4, y - 4], [x - 4, y + h + 4], [x + w + 4, y + h + 4]]) {
      fill(ctx, ember4, cx - 2, cy - 2, 4, 4);
    }
  }

  if (item.publicAlias) {
    const label = item.publicAlias.slice(0, 24);
    ctx.font = '700 9px Inter, ui-sans-serif, system-ui, sans-serif';
    const width = Math.min(135, Math.ceil(ctx.measureText(label).width) + 16);
    plate(ctx, x + w / 2 - width / 2, y + h + 4, width, 15, 'rgba(251,244,226,0.95)', 'rgba(30,55,48,0.45)');
    text(ctx, label, x + w / 2, y + h + 15, PALETTE.paper[0], 9);
  }
}

let roomCache: HTMLCanvasElement | null = null;
let roomCacheKey = '';
let houseVignetteCache: HTMLCanvasElement | null = null;

function getRoomShell(house: PublicHouse, room: Room): HTMLCanvasElement | null {
  const key = house.theme;
  if (roomCache && roomCacheKey === key) return roomCache;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(2, 2);
  ctx.imageSmoothingEnabled = false;
  paintWall(ctx, room, 0);
  paintFloor(ctx, room, 0);
  paintRoomFrame(ctx, room);
  paintFixtures(ctx, room, 0);
  paintLampPool(ctx, 0);
  // A doormat at the entrance the characters spawn on.
  fill(ctx, shade(earth0, -6), 344, 380, 80, 18);
  fill(ctx, earth2, 348, 383, 72, 12);
  for (let i = 0; i < 9; i += 1) fill(ctx, shade(earth2, -18), 352 + i * 8, 385, 3, 8);
  roomCache = canvas;
  roomCacheKey = key;
  return canvas;
}

function getHouseVignette(): HTMLCanvasElement | null {
  if (houseVignetteCache) return houseVignetteCache;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(2, 2);
  const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.95);
  vignette.addColorStop(0, 'rgba(32,24,16,0)');
  vignette.addColorStop(1, 'rgba(32,24,16,0.26)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
  houseVignetteCache = canvas;
  return canvas;
}

export function drawHouseInterior(
  ctx: CanvasRenderingContext2D,
  house: PublicHouse,
  people: readonly DrawPerson[],
  selectedId: string | null,
  dt = 0,
  nearbyId: string | null = null,
  perItemSprites?: ReadonlyMap<string, HTMLImageElement | null>,
): void {
  ctx.imageSmoothingEnabled = false;
  // Held at a single frame when the viewer asked for reduced motion.
  const time = reducedMotion() ? 0 : animClock();
  const room = palette(house);

  const cachedRoom = getRoomShell(house, room);
  if (cachedRoom) {
    ctx.drawImage(cachedRoom, 0, 0, W, H);
  } else {
    paintWall(ctx, room, time);
    paintFloor(ctx, room, time);
    paintRoomFrame(ctx, room);
    paintFixtures(ctx, room, time);
    paintLampPool(ctx, time);
    fill(ctx, shade(earth0, -6), 344, 380, 80, 18);
    fill(ctx, earth2, 348, 383, 72, 12);
    for (let i = 0; i < 9; i += 1) fill(ctx, shade(earth2, -18), 352 + i * 8, 385, 3, 8);
  }

  // Hanging sign with the house name.
  const label = house.name.slice(0, 28);
  ctx.font = '700 12px Inter, ui-sans-serif, system-ui, sans-serif';
  const signW = Math.max(150, Math.min(300, Math.ceil(ctx.measureText(label).width) + 40));
  const signX = 384 - signW / 2;
  fill(ctx, room.trim, 384 - 2, 0, 4, 10);
  plate(ctx, signX, 8, signW, 26, PALETTE.paper[3], room.trim);
  fill(ctx, shade(PALETTE.paper[3], -10), signX + 6, 28, signW - 12, 2);
  text(ctx, label, 384, 26, PALETTE.paper[0], 12);

  const sprites: Sprite[] = [];
  for (const item of house.furniture) {
    const rect = furnitureRect(item);
    const wallItem = item.kind === 'frame' || item.kind === 'board';
    const itemSprite = perItemSprites?.get(item.id) ?? null;
    sprites.push({
      baseline: wallItem ? rect.y : rect.y + rect.h,
      paint: () => {
        if (!item.rotation) { paintFurniture(ctx, item, item.id === selectedId, item.id === nearbyId, time, itemSprite); return; }
        const base = furnitureRect({ ...item, rotation: 0 });
        ctx.save(); ctx.translate(item.x + rect.w / 2, item.y + rect.h / 2); ctx.rotate(item.rotation * Math.PI / 180); ctx.translate(-base.w / 2, -base.h / 2);
        paintFurniture(ctx, { ...item, x: 0, y: 0, rotation: 0, publicAlias: '' }, item.id === selectedId, item.id === nearbyId, time, itemSprite); ctx.restore();
        if (item.publicAlias) text(ctx, item.publicAlias.slice(0,24), item.x+rect.w/2, item.y+rect.h+12, PALETTE.paper[0], 9);
      },
    });
  }
  for (const person of people) {
    const id = person.identity.fingerprint || person.identity.displayName;
    const at = trackCharacter(id, person.position, dt, !person.isOwn, `house:${house.ownerId}`);
    sprites.push({
      baseline: at.y,
      paint: () => drawAvatar(ctx, at.x, at.y, person.identity, person.position, person.isOwn),
    });
  }
  sprites.sort((a, b) => a.baseline - b.baseline);
  for (const sprite of sprites) sprite.paint();

  // Warm corner falloff so the room feels enclosed.
  const cachedVignette = getHouseVignette();
  if (cachedVignette) {
    ctx.drawImage(cachedVignette, 0, 0, W, H);
  } else {
    const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.95);
    vignette.addColorStop(0, 'rgba(32,24,16,0)');
    vignette.addColorStop(1, 'rgba(32,24,16,0.26)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);
  }

  // Keyed by owner, so stepping from one house into another also reads as a
  // move rather than an instant content swap.
  paintSceneFade(ctx, `house:${house.ownerId}`, W, H, '22,16,10');
}

export function drawFurniturePreview(ctx: CanvasRenderingContext2D, kind: Furniture['kind']): void {
  ctx.clearRect(0, 0, 100, 90); ctx.imageSmoothingEnabled = false;
  paintFurniture(ctx, { id: 'preview', kind, x: 12, y: 10, publicAlias: '' }, false, false, 0);
}
```

### app/src/whiteboard/model.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `4cdb32837fdeac9b79c82d859cd89ba0b8afb0c350246ce45aceca7e4bff64d6`.

```ts
import { LIMITS, type BoardPoint, type BoardStroke } from '../protocol/types';

export type BoardTool = BoardStroke['tool'];
/** Tools that exist only in the UI and never become strokes. */
export type BoardUiTool = BoardTool | 'eraser' | 'hand';
export const BOARD_COLORS = ['#315f51', '#df7e6c', '#3d78a2', '#c48b39', '#322f45'] as const;

const EXTENT = LIMITS.boardExtent;
const clampAxis = (value: number) => Math.round(Math.max(-EXTENT, Math.min(EXTENT, Number.isFinite(value) ? value : 0)));

/**
 * The board is unbounded in practice: points are world coordinates kept only
 * inside ±boardExtent. With the default camera, world equals the old 768x432
 * frame, so drawings made before the board became infinite stay put.
 */
export function clampBoardPoint(point: BoardPoint): BoardPoint {
  return { x: clampAxis(point.x), y: clampAxis(point.y) };
}

export function makeStroke(
  boardId: string, author: string, seq: number, tool: BoardTool,
  color: string, width: number, points: readonly BoardPoint[], id: string = crypto.randomUUID(), text?: string,
): BoardStroke {
  const normalized = (tool === 'text' ? points.slice(0, 1) : points.slice(0, LIMITS.strokePoints)).map(clampBoardPoint);
  const stroke: BoardStroke = {
    id, author, boardId, seq: Math.max(1, Math.floor(seq)), tool,
    color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : BOARD_COLORS[0],
    width: Math.max(1, Math.min(12, Math.round(width))), points: normalized, deleted: false,
  };
  if (tool === 'text') stroke.text = (text ?? '').slice(0, LIMITS.boardText);
  return stroke;
}

export function boardAtCapacity(strokes: readonly BoardStroke[], boardId: string): boolean {
  return strokes.filter((stroke) => stroke.boardId === boardId).length >= LIMITS.boardOperations;
}

export function visibleStrokes(strokes: readonly BoardStroke[], boardId: string, hiddenAuthors: ReadonlySet<string>): BoardStroke[] {
  return strokes.filter((stroke) => stroke.boardId === boardId && !stroke.deleted && !hiddenAuthors.has(stroke.author));
}

export function canDeleteStroke(stroke: BoardStroke, author: string, boardId: string): boolean {
  return stroke.author === author && stroke.boardId === boardId && !stroke.deleted;
}

export function newestOwnStroke(strokes: readonly BoardStroke[], author: string, boardId: string): BoardStroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (canDeleteStroke(strokes[i], author, boardId)) return strokes[i];
  }
  return null;
}

export function nextSequence(strokes: readonly BoardStroke[], author: string, boardId: string): number {
  return 1 + strokes.reduce((max, stroke) => stroke.author === author && stroke.boardId === boardId ? Math.max(max, stroke.seq) : max, 0);
}

// --------------------------------------------------------------- eraser --

export interface BoardRect { x: number; y: number; w: number; h: number }

function distanceToSegment(p: BoardPoint, a: BoardPoint, b: BoardPoint): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSq)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Whether an eraser at `point` touches `stroke`. Text notes need their laid-out
 * box, which depends on fonts and rendered math, so the caller supplies it.
 */
export function strokeHit(stroke: BoardStroke, point: BoardPoint, radius: number, textBox?: BoardRect | null): boolean {
  if (stroke.deleted || !stroke.points.length) return false;
  const reach = radius + stroke.width / 2;
  const [first] = stroke.points;
  const last = stroke.points[stroke.points.length - 1];
  if (stroke.tool === 'text') {
    if (!textBox) return false;
    return point.x >= textBox.x - radius && point.x <= textBox.x + textBox.w + radius
      && point.y >= textBox.y - radius && point.y <= textBox.y + textBox.h + radius;
  }
  if (stroke.tool === 'rectangle') {
    const corners = [first, { x: last.x, y: first.y }, last, { x: first.x, y: last.y }];
    return corners.some((corner, i) => distanceToSegment(point, corner, corners[(i + 1) % 4]) <= reach);
  }
  if (stroke.tool === 'line') return distanceToSegment(point, first, last) <= reach;
  if (stroke.points.length === 1) return Math.hypot(point.x - first.x, point.y - first.y) <= reach;
  for (let i = 1; i < stroke.points.length; i += 1) {
    if (distanceToSegment(point, stroke.points[i - 1], stroke.points[i]) <= reach) return true;
  }
  return false;
}

// --------------------------------------------------------------- camera --

/** screen = (world - camera) * zoom, in the board canvas's logical units. */
export interface BoardCamera { x: number; y: number; zoom: number }
export const DEFAULT_CAMERA: BoardCamera = { x: 0, y: 0, zoom: 1 };
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;

export function screenToWorld(camera: BoardCamera, sx: number, sy: number): BoardPoint {
  return { x: sx / camera.zoom + camera.x, y: sy / camera.zoom + camera.y };
}

/** Zoom by `factor` while keeping the world point under the cursor fixed. */
export function zoomAt(camera: BoardCamera, sx: number, sy: number, factor: number): BoardCamera {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.zoom * factor));
  const anchor = screenToWorld(camera, sx, sy);
  return { zoom, x: anchor.x - sx / zoom, y: anchor.y - sy / zoom };
}

export function panBy(camera: BoardCamera, dxScreen: number, dyScreen: number): BoardCamera {
  return { ...camera, x: camera.x - dxScreen / camera.zoom, y: camera.y - dyScreen / camera.zoom };
}

/** World-space bounds of the given strokes, or null when there are none. */
export function strokesBounds(strokes: readonly BoardStroke[], textBox: (stroke: BoardStroke) => BoardRect | null): BoardRect | null {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const stroke of strokes) {
    if (stroke.deleted) continue;
    if (stroke.tool === 'text') {
      const box = textBox(stroke);
      if (!box) continue;
      minX = Math.min(minX, box.x); minY = Math.min(minY, box.y);
      maxX = Math.max(maxX, box.x + box.w); maxY = Math.max(maxY, box.y + box.h);
      continue;
    }
    const pad = stroke.width / 2;
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - pad); minY = Math.min(minY, point.y - pad);
      maxX = Math.max(maxX, point.x + pad); maxY = Math.max(maxY, point.y + pad);
    }
  }
  return Number.isFinite(minX) ? { x: minX, y: minY, w: maxX - minX, h: maxY - minY } : null;
}

/** A camera that frames `bounds` inside a view of the given size. */
export function fitCamera(bounds: BoardRect | null, viewW: number, viewH: number, padding = 48): BoardCamera {
  if (!bounds) return { ...DEFAULT_CAMERA };
  const zoom = Math.max(MIN_ZOOM, Math.min(1.5, Math.min(
    (viewW - padding * 2) / Math.max(1, bounds.w),
    (viewH - padding * 2) / Math.max(1, bounds.h),
  )));
  return { zoom, x: bounds.x + bounds.w / 2 - viewW / 2 / zoom, y: bounds.y + bounds.h / 2 - viewH / 2 / zoom };
}
```

### app/src/whiteboard/draw.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `61cbd2393d0671e1719eed594289ae89ddf223f89f6a3bba9b7ace94165177fc`.

```ts
import type { BoardPoint, BoardStroke } from '../protocol/types';
import { COLORS, text } from '../ui/art';
import { mathImage, mathReady, rasterStep, toTex, type MathImage } from './math';
import { DEFAULT_CAMERA, strokesBounds, type BoardCamera, type BoardRect } from './model';

export interface BoardDraft { points: readonly BoardPoint[]; tool: BoardStroke['tool']; color: string; width: number; text?: string }
/** Anything drawable: a stored stroke or an in-progress draft. */
type Drawable = Pick<BoardDraft, 'points' | 'tool' | 'color' | 'width' | 'text'>;

const PAPER = '#ffffff';
const GRID = '#eceef1';
const FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Width doubles as the text size for notes: Fino 16px, Medio 22px, Grueso 34px. */
export function textFontPx(width: number): number {
  return 10 + width * 3;
}

// ---------------------------------------------------------- text layout --

type Line =
  | { kind: 'text'; value: string; w: number; h: number }
  | { kind: 'math'; source: string; tex: string; image: MathImage | 'error' | null; w: number; h: number };

interface Layout { lines: Line[]; w: number; h: number }

/** Pixels per board unit for the frame being drawn; set by drawBoard. */
let currentRaster = 1;

/** A line that is nothing but one formula renders in display style. */
function isDisplayMath(raw: string): boolean {
  return /^\s*\$[^$]+\$\s*$/.test(raw);
}

let measurer: CanvasRenderingContext2D | null = null;
function measureContext(): CanvasRenderingContext2D | null {
  if (measurer) return measurer;
  try { measurer = document.createElement('canvas').getContext('2d'); } catch { measurer = null; }
  return measurer;
}

/**
 * Lays a note out line by line. A line containing $...$ renders as one TeX
 * expression (plain words around the math become \text{}); any other line is
 * ordinary text. Math that is still loading or failed to parse is measured as
 * its source so the box never collapses.
 */
function layout(stroke: Pick<BoardStroke, 'text' | 'width' | 'color'>, ctx?: CanvasRenderingContext2D | null): Layout {
  const size = textFontPx(stroke.width);
  const lineH = Math.round(size * 1.3);
  const c = ctx ?? measureContext();
  if (c) c.font = `600 ${size}px ${FONT}`;
  const lines: Line[] = [];
  for (const raw of (stroke.text ?? '').split('\n')) {
    const tex = toTex(raw);
    const textW = c ? c.measureText(raw).width : raw.length * size * 0.55;
    if (tex) {
      const image = mathImage(tex, Math.round(size * 1.15), stroke.color, isDisplayMath(raw), currentRaster);
      const ready = image && image !== 'error';
      lines.push({ kind: 'math', source: raw, tex, image, w: ready ? image.width : textW, h: ready ? Math.max(lineH, image.height + 4) : lineH });
    } else {
      lines.push({ kind: 'text', value: raw, w: textW, h: lineH });
    }
  }
  return { lines, w: Math.max(8, ...lines.map((line) => line.w)), h: Math.max(lineH, lines.reduce((sum, line) => sum + line.h, 0)) };
}

/** World-space box of a text note, for the eraser and for export bounds. */
export function textBox(stroke: BoardStroke): BoardRect | null {
  if (stroke.tool !== 'text' || !stroke.points.length) return null;
  const { w, h } = layout(stroke);
  return { x: stroke.points[0].x, y: stroke.points[0].y, w, h };
}

function drawNote(ctx: CanvasRenderingContext2D, stroke: Drawable): void {
  const anchor = stroke.points[0];
  if (!anchor) return;
  const size = textFontPx(stroke.width);
  const box = layout(stroke, ctx);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  let y = anchor.y;
  for (const line of box.lines) {
    if (line.kind === 'math' && line.image && line.image !== 'error') {
      ctx.drawImage(line.image.image, anchor.x, y + (line.h - line.image.height) / 2, line.image.width, line.image.height);
    } else {
      const failed = line.kind === 'math' && line.image === 'error';
      ctx.font = `${failed ? 500 : 600} ${size}px ${FONT}`;
      // Loading math shows its source in dark ink; broken math shows it in red so
      // the author can see what to fix.
      ctx.fillStyle = line.kind === 'math' ? (failed ? '#c0473a' : 'rgba(49,95,81,0.82)') : stroke.color;
      ctx.fillText(line.kind === 'math' ? line.source : line.value, anchor.x, y + (line.h - size) / 2);
    }
    y += line.h;
  }
}

// ----------------------------------------------------------- primitives --

function pathStroke(ctx: CanvasRenderingContext2D, stroke: Drawable): void {
  if (!stroke.points.length) return;
  if (stroke.tool === 'text') { drawNote(ctx, stroke); return; }
  const start = stroke.points[0];
  const end = stroke.points[stroke.points.length - 1];
  ctx.beginPath();
  ctx.lineWidth = stroke.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke.color;
  if (stroke.tool === 'pen') {
    ctx.moveTo(start.x, start.y);
    for (const point of stroke.points.slice(1)) ctx.lineTo(point.x, point.y);
    if (stroke.points.length === 1) ctx.lineTo(start.x + 0.1, start.y + 0.1);
  } else if (stroke.tool === 'line') {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
  } else {
    ctx.rect(Math.min(start.x, end.x), Math.min(start.y, end.y), Math.abs(start.x - end.x), Math.abs(start.y - end.y));
  }
  ctx.stroke();
}

/** Dot grid in world space, thinned out as you zoom out so it never turns to noise. */
function drawGrid(ctx: CanvasRenderingContext2D, camera: BoardCamera, w: number, h: number): void {
  let step = 24;
  while (step * camera.zoom < 14) step *= 2;
  const x0 = Math.floor(camera.x / step) * step;
  const y0 = Math.floor(camera.y / step) * step;
  const dot = Math.max(1.5, 2 * Math.min(1, camera.zoom));
  ctx.fillStyle = GRID;
  for (let wx = x0; wx <= camera.x + w / camera.zoom; wx += step) {
    for (let wy = y0; wy <= camera.y + h / camera.zoom; wy += step) {
      ctx.fillRect((wx - camera.x) * camera.zoom - dot / 2, (wy - camera.y) * camera.zoom - dot / 2, dot, dot);
    }
  }
  // Mark the world origin, so "Centrar" has an obvious home.
  const ox = -camera.x * camera.zoom;
  const oy = -camera.y * camera.zoom;
  if (ox > -10 && ox < w + 10 && oy > -10 && oy < h + 10) {
    ctx.fillStyle = 'rgba(207,111,60,0.5)';
    ctx.fillRect(ox - 5, oy - 1, 10, 2);
    ctx.fillRect(ox - 1, oy - 5, 2, 10);
  }
}

/**
 * Draws the board through a camera. `w` and `h` are the view's logical size;
 * strokes are in world units, so the same data renders at any pan and zoom.
 */
export function drawBoard(
  ctx: CanvasRenderingContext2D,
  strokes: readonly BoardStroke[],
  draft: BoardDraft | null = null,
  camera: BoardCamera = DEFAULT_CAMERA,
  w = 768,
  h = 432,
  chrome = true,
  pixelRatio = 1,
): void {
  ctx.imageSmoothingEnabled = true;
  currentRaster = rasterStep(camera.zoom * pixelRatio);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, camera, w, h);
  ctx.save();
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);
  for (const stroke of strokes) if (!stroke.deleted) pathStroke(ctx, stroke);
  if (draft?.points.length) pathStroke(ctx, draft);
  ctx.restore();
  if (chrome) {
    ctx.fillStyle = 'rgba(30,55,48,0.06)';
    ctx.fillRect(0, 0, w, 22);
    text(ctx, 'STUDYVILLAGE · PIZARRA', 12, 15, COLORS.ink, 9, 'left');
    text(ctx, `${Math.round(camera.zoom * 100)}%`, w - 12, 15, COLORS.ink, 9, 'right');
  }
}

/**
 * Renders the whole board, however far it extends, to a fresh canvas for PNG
 * export. Waits for every formula first, so the file never contains a
 * half-loaded placeholder.
 */
export async function renderBoardForExport(strokes: readonly BoardStroke[]): Promise<HTMLCanvasElement> {
  for (const stroke of strokes) {
    if (stroke.tool !== 'text' || stroke.deleted) continue;
    const size = Math.round(textFontPx(stroke.width) * 1.15);
    for (const raw of (stroke.text ?? '').split('\n')) {
      const tex = toTex(raw);
      if (tex) await mathReady(tex, size, stroke.color, isDisplayMath(raw), rasterStep(2));
    }
  }
  const pad = 40;
  const bounds = strokesBounds(strokes, textBox) ?? { x: 0, y: 0, w: 768 - pad * 2, h: 432 - pad * 2 };
  const scale = Math.min(2, 4096 / Math.max(bounds.w + pad * 2, bounds.h + pad * 2));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((bounds.w + pad * 2) * scale);
  canvas.height = Math.ceil((bounds.h + pad * 2) * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  drawBoard(ctx, strokes, null, { x: bounds.x - pad, y: bounds.y - pad, zoom: scale }, canvas.width, canvas.height, false, 1);
  return canvas;
}
```

### app/src/whiteboard/math.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `453c95c93660f22c5ae554283abd9509f68b54fbb7359f254c014e86861dfbc4`.

```ts
/**
 * LaTeX for the whiteboard.
 *
 * MathJax renders TeX to SVG made only of paths (fontCache: 'none'), so the
 * result needs no webfonts and contains no foreignObject. That matters twice:
 * the page CSP allows no font-src, and an SVG with foreignObject would taint
 * the canvas and break "Exportar PNG". The engine is loaded on first use only,
 * so people who never type a formula never download it.
 */

type Converter = (tex: string, display: boolean) => string;

let engine: Promise<Converter> | null = null;

function loadEngine(): Promise<Converter> {
  engine ??= (async () => {
    const [{ mathjax }, { TeX }, { SVG }, { liteAdaptor }, { RegisterHTMLHandler }] = await Promise.all([
      import('mathjax-full/js/mathjax.js'),
      import('mathjax-full/js/input/tex.js'),
      import('mathjax-full/js/output/svg.js'),
      import('mathjax-full/js/adaptors/liteAdaptor.js'),
      import('mathjax-full/js/handlers/html.js'),
      import('mathjax-full/js/input/tex/base/BaseConfiguration.js'),
      import('mathjax-full/js/input/tex/ams/AmsConfiguration.js'),
      import('mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js'),
    ]);
    const adaptor = liteAdaptor();
    RegisterHTMLHandler(adaptor);
    const doc = mathjax.document('', {
      InputJax: new TeX({ packages: ['base', 'ams', 'noundefined'] }),
      OutputJax: new SVG({ fontCache: 'none' }),
    });
    return (tex: string, display: boolean) => {
      const node = doc.convert(tex, { display });
      return adaptor.innerHTML(node);
    };
  })();
  return engine;
}

/**
 * Turns board text into TeX. Text wrapped in $...$ is math; everything else is
 * wrapped in \text{} so a line like "Area = $\pi r^2$" renders as one piece.
 * Returns null when the text has no math at all, so plain notes stay plain.
 */
export function toTex(source: string): string | null {
  if (!/\$[^$]+\$/.test(source)) return null;
  const parts = source.split(/(\$[^$]+\$)/g).filter((part) => part.length);
  const escape = (value: string) => value.replace(/([\\{}#%&_^~])/g, (c) => c === '\\' ? '\\backslash ' : `\\${c}`);
  return parts.map((part) => part.startsWith('$') && part.endsWith('$') && part.length > 2
    ? part.slice(1, -1)
    : `\\text{${escape(part)}}`).join('');
}

export interface MathImage { image: HTMLImageElement; width: number; height: number; baseline: number }
type Entry = { state: 'loading' } | { state: 'ready'; value: MathImage } | { state: 'error'; message: string };

const cache = new Map<string, Entry>();
/** Most recent ready image per formula at any resolution, shown while a sharper one loads. */
const fallback = new Map<string, MathImage>();
const MAX_CACHE = 300;
let mathGeneration = 0;

export function getMathGeneration(): number {
  return mathGeneration;
}

/**
 * Rasterisation steps. Formulas are drawn into the canvas as images, so they
 * must be rasterised at roughly the on-screen pixel density or zooming in
 * shows a blurry upscale. Snapping to a few steps keeps the cache bounded.
 */
export function rasterStep(pixelsPerUnit: number): number {
  for (const step of [1, 1.5, 2, 3, 4, 6]) if (pixelsPerUnit <= step) return step;
  return 8;
}

/**
 * Synchronous lookup for the render loop. The first call starts an async
 * render; until it decodes, the best previous resolution is returned, or null.
 * `width`/`height` are always in board units, whatever the raster density.
 */
export function mathImage(tex: string, sizePx: number, color: string, display = false, raster = 1): MathImage | 'error' | null {
  const base = `${sizePx}|${color}|${display ? 'D' : 'I'}|${tex}`;
  const key = `${raster}|${base}`;
  const hit = cache.get(key);
  if (hit?.state === 'ready') return hit.value;
  if (hit?.state === 'error') return 'error';
  if (!hit) {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(key, { state: 'loading' });
    void render(tex, sizePx, color, display, raster).then(
      (value) => { cache.set(key, { state: 'ready', value }); fallback.set(base, value); mathGeneration++; },
      (error: unknown) => { cache.set(key, { state: 'error', message: error instanceof Error ? error.message : 'TeX' }); mathGeneration++; },
    );
  }
  return fallback.get(base) ?? null;
}

async function render(tex: string, sizePx: number, color: string, display: boolean, raster: number): Promise<MathImage> {
  const convert = await loadEngine();
  const markup = convert(tex, display);
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = parsed.querySelector('svg');
  if (!svg || parsed.querySelector('parsererror')) throw new Error('TeX');
  // noundefined marks unknown commands in red; treat that as an error so the
  // board can show the source instead of a half-rendered formula.
  if (svg.querySelector('[data-mjx-error], [fill="red"]')) throw new Error('TeX');
  const viewBox = (svg.getAttribute('viewBox') || '').split(/\s+/).map(Number);
  if (viewBox.length !== 4 || viewBox.some((n) => !Number.isFinite(n))) throw new Error('TeX');
  // MathJax viewBox units are thousandths of an em.
  const scale = sizePx / 1000;
  const width = Math.max(1, Math.ceil(viewBox[2] * scale));
  const height = Math.max(1, Math.ceil(viewBox[3] * scale));
  const baseline = Math.ceil((viewBox[3] + viewBox[1]) * scale);
  // The image's natural size is the raster size; callers draw it at width x
  // height board units, so higher density means a sharper, not larger, result.
  svg.setAttribute('width', String(Math.ceil(width * raster)));
  svg.setAttribute('height', String(Math.ceil(height * raster)));
  svg.removeAttribute('style');
  svg.setAttribute('color', color);
  const text = new XMLSerializer().serializeToString(svg).replace(/currentColor/g, color);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { image, width, height, baseline };
  } finally {
    // Decoded pixels stay usable after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Wait for the engine, for export paths that must not draw placeholders. */
export async function mathReady(tex: string, sizePx: number, color: string, display = false, raster = 1): Promise<MathImage | 'error'> {
  for (let i = 0; i < 100; i += 1) {
    const key = `${raster}|${sizePx}|${color}|${display ? 'D' : 'I'}|${tex}`;
    const result = mathImage(tex, sizePx, color, display, raster);
    if (cache.get(key)?.state === 'loading') { await new Promise((resolve) => setTimeout(resolve, 30)); continue; }
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  return 'error';
}
```

### app/src/whiteboard/boards-registry.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `3a06b3f3d68f604abdad5288abb42c1e30f10629c5dc0eda943108e94d587a9f`.

```ts
import { z } from 'zod';
import { LIMITS, type BoardPoint, type BoardStroke } from '../protocol/types';
import { isValidCustomSpriteDataUrl, sanitizeObjectDisplayName } from '../world/interactive-objects';
import { clampBoardPoint } from './model';

/**
 * Part 4 — Multiplayer Whiteboard System
 *
 * Manages multiple independent, persistent whiteboards across the world
 * (personal house boards, community plaza board, study library boards, and
 * user-created boards). Each board is keyed by a stable `boardId` and never
 * overwrites another board's strokes, metadata, permissions, or undo/redo history.
 */

export type ExtendedBoardShapeKind = 'pen' | 'line' | 'rectangle' | 'circle' | 'arrow' | 'text';

export interface BoardRichElement {
  id: string;
  boardId: string;
  authorId: string;
  authorName: string;
  kind: ExtendedBoardShapeKind;
  color: string;
  width: number;
  points: BoardPoint[];
  text?: string;
  deleted: boolean;
  updatedAt: number;
}

export interface BoardRemoteCursor {
  userId: string;
  displayName: string;
  color: string;
  boardId: string;
  x: number;
  y: number;
  tool: string;
  updatedAt: number;
}

export type BoardAccessLevel = 'public_edit' | 'view_only' | 'selected_editors' | 'owner_only';

export interface WhiteboardMetadata {
  boardId: string;
  displayName: string;
  areaId: string;
  ownerId: string | null;
  customSpriteDataUrl: string | null;
  access: BoardAccessLevel;
  allowedEditors: string[];
  revision: number;
}

export const whiteboardMetadataSchema = z.object({
  boardId: z.string().min(1).max(128),
  displayName: z.string().min(1).max(48),
  areaId: z.string().min(1).max(96),
  ownerId: z.string().max(128).nullable(),
  customSpriteDataUrl: z
    .string()
    .refine((v) => isValidCustomSpriteDataUrl(v), 'Invalid sprite data URL')
    .nullable(),
  access: z.enum(['public_edit', 'view_only', 'selected_editors', 'owner_only']),
  allowedEditors: z.array(z.string().max(128)).max(16),
  revision: z.number().int().nonnegative(),
});

const STORAGE_KEY = 'studyvillage-whiteboards-v1';

/**
 * Generates a unique, deterministic persistent board ID for a physical
 * whiteboard furniture item inside a specific house.
 */
export function houseBoardId(houseScopeId: string, furnitureId: string): string {
  const scope = (houseScopeId || 'own').trim().slice(0, 64);
  const item = (furnitureId || 'board').trim().slice(0, 64);
  return `house:${scope}:board:${item}`;
}

export class WhiteboardRegistry {
  private metadata = new Map<string, WhiteboardMetadata>();
  private strokesByBoard = new Map<string, BoardStroke[]>();
  private elementsByBoard = new Map<string, BoardRichElement[]>();
  private redoStackByBoardAndAuthor = new Map<string, BoardStroke[]>();
  private richRedoByBoard = new Map<string, BoardRichElement[]>();
  private remoteCursors = new Map<string, BoardRemoteCursor>();
  private decodedSprites = new Map<string, HTMLImageElement>();

  constructor() {
    this.registerDefaultBoards();
    this.loadFromStorage();
  }

  private registerDefaultBoards(): void {
    const defaults: WhiteboardMetadata[] = [
      {
        boardId: 'board:community-plaza',
        displayName: 'Pizarra de la Plaza Comunitaria',
        areaId: 'community',
        ownerId: null,
        customSpriteDataUrl: null,
        access: 'public_edit',
        allowedEditors: [],
        revision: 1,
      },
      {
        boardId: 'board:study-library',
        displayName: 'Pizarra de Seminario (Biblioteca)',
        areaId: 'study',
        ownerId: null,
        customSpriteDataUrl: null,
        access: 'public_edit',
        allowedEditors: [],
        revision: 1,
      },
      {
        boardId: 'board:study-calculus',
        displayName: 'Pizarra de Cálculo y Demostraciones',
        areaId: 'study',
        ownerId: null,
        customSpriteDataUrl: null,
        access: 'public_edit',
        allowedEditors: [],
        revision: 1,
      },
    ];
    for (const def of defaults) {
      this.metadata.set(def.boardId, def);
    }
  }

  ensureBoard(boardId: string, fallbackName = 'Pizarra de estudio', areaId = 'house', ownerId: string | null = null): WhiteboardMetadata {
    const existing = this.metadata.get(boardId);
    if (existing) return existing;
    const created: WhiteboardMetadata = {
      boardId,
      displayName: sanitizeObjectDisplayName(fallbackName, 'Pizarra de estudio'),
      areaId,
      ownerId,
      customSpriteDataUrl: null,
      access: 'public_edit',
      allowedEditors: [],
      revision: 1,
    };
    this.metadata.set(boardId, created);
    return created;
  }

  listBoards(): WhiteboardMetadata[] {
    return Array.from(this.metadata.values());
  }

  getMetadata(boardId: string): WhiteboardMetadata {
    return this.ensureBoard(boardId);
  }

  getDecodedBoardSprite(boardId: string): HTMLImageElement | null {
    const img = this.decodedSprites.get(boardId);
    if (img && img.complete && img.naturalWidth > 0) return img;
    return null;
  }

  private decodeSpriteForBoard(boardId: string, dataUrl: string | null): void {
    if (!dataUrl || typeof Image === 'undefined') {
      this.decodedSprites.delete(boardId);
      return;
    }
    const img = new Image();
    img.src = dataUrl;
    this.decodedSprites.set(boardId, img);
  }

  // ---------------------------------------------------------------------------
  // Persistent Standard Strokes per BoardId
  // ---------------------------------------------------------------------------

  getStrokes(boardId: string): BoardStroke[] {
    return this.strokesByBoard.get(boardId) ?? [];
  }

  saveStroke(boardId: string, stroke: BoardStroke): void {
    const list = this.strokesByBoard.get(boardId) ?? [];
    const existingIdx = list.findIndex((s) => s.id === stroke.id);
    const normalized: BoardStroke = { ...stroke, boardId };
    if (existingIdx >= 0) {
      list[existingIdx] = normalized;
    } else if (list.length < LIMITS.boardOperations) {
      list.push(normalized);
    }
    this.strokesByBoard.set(boardId, list);
    this.saveToStorage();
  }

  markStrokeDeleted(boardId: string, strokeId: string): boolean {
    const list = this.strokesByBoard.get(boardId);
    if (!list) return false;
    const found = list.find((s) => s.id === strokeId && !s.deleted);
    if (!found) return false;
    found.deleted = true;
    this.saveToStorage();
    return true;
  }

  canView(boardId: string, userId: string, isHost = false): boolean {
    const meta = this.ensureBoard(boardId);
    if (isHost || (meta.ownerId && meta.ownerId === userId)) return true;
    return true;
  }

  canEdit(boardId: string, userId: string, isHost = false): boolean {
    const meta = this.ensureBoard(boardId);
    if (meta.ownerId && meta.ownerId === userId) return true;
    if (meta.ownerId === null && isHost && meta.access === 'owner_only') return true;
    switch (meta.access) {
      case 'public_edit':
        return true;
      case 'view_only':
        return meta.ownerId === userId || (meta.ownerId === null && isHost);
      case 'owner_only':
        return meta.ownerId === userId || (meta.ownerId === null && isHost);
      case 'selected_editors':
        return isHost || meta.allowedEditors.includes(userId);
      default:
        return false;
    }
  }

  canConfigure(boardId: string, userId: string, isHost = false): boolean {
    const meta = this.ensureBoard(boardId);
    if (meta.ownerId && meta.ownerId === userId) return true;
    if (meta.ownerId === null && isHost) return true;
    return false;
  }

  renameBoard(boardId: string, newName: string, actorId: string, isHost = false): WhiteboardMetadata {
    const meta = this.ensureBoard(boardId);
    if (!this.canConfigure(boardId, actorId, isHost)) {
      throw new Error('No tienes permiso para renombrar esta pizarra.');
    }
    const updated: WhiteboardMetadata = {
      ...meta,
      displayName: sanitizeObjectDisplayName(newName, 'Pizarra'),
      revision: meta.revision + 1,
    };
    whiteboardMetadataSchema.parse(updated);
    this.metadata.set(boardId, updated);
    this.saveToStorage();
    return updated;
  }

  setBoardCustomSprite(boardId: string, spriteDataUrl: string | null, actorId: string, isHost = false): WhiteboardMetadata {
    const meta = this.ensureBoard(boardId);
    if (!this.canConfigure(boardId, actorId, isHost)) {
      throw new Error('No tienes permiso para cambiar el sprite de esta pizarra.');
    }
    if (spriteDataUrl !== null && !isValidCustomSpriteDataUrl(spriteDataUrl)) {
      throw new Error('El sprite de pizarra debe ser una imagen PNG, JPEG o WebP válida de hasta 512 KB.');
    }
    const updated: WhiteboardMetadata = {
      ...meta,
      customSpriteDataUrl: spriteDataUrl,
      revision: meta.revision + 1,
    };
    whiteboardMetadataSchema.parse(updated);
    this.metadata.set(boardId, updated);
    this.decodeSpriteForBoard(boardId, spriteDataUrl);
    this.saveToStorage();
    return updated;
  }

  setBoardAccess(
    boardId: string,
    access: BoardAccessLevel,
    allowedEditors: string[],
    actorId: string,
    isHost = false,
  ): WhiteboardMetadata {
    const meta = this.ensureBoard(boardId);
    if (!this.canConfigure(boardId, actorId, isHost)) {
      throw new Error('No tienes permiso para cambiar los permisos de esta pizarra.');
    }
    const updated: WhiteboardMetadata = {
      ...meta,
      access,
      allowedEditors: allowedEditors.slice(0, 16),
      revision: meta.revision + 1,
    };
    whiteboardMetadataSchema.parse(updated);
    this.metadata.set(boardId, updated);
    this.saveToStorage();
    return updated;
  }

  setBoardSprite(boardId: string, spriteDataUrl: string | null, actorId: string, isHost = false): WhiteboardMetadata {
    return this.setBoardCustomSprite(boardId, spriteDataUrl, actorId, isHost);
  }

  setAccessLevel(boardId: string, access: BoardAccessLevel, actorId: string, isHost = false): WhiteboardMetadata {
    const meta = this.ensureBoard(boardId);
    return this.setBoardAccess(boardId, access, meta.allowedEditors, actorId, isHost);
  }

  // ---------------------------------------------------------------------------
  // Undo / Redo for standard BoardStrokes per (boardId, authorId)
  // ---------------------------------------------------------------------------

  pushRedoStroke(boardId: string, authorId: string, stroke: BoardStroke): void {
    const key = `${boardId}::${authorId}`;
    const stack = this.redoStackByBoardAndAuthor.get(key) ?? [];
    stack.push({ ...stroke, deleted: false });
    if (stack.length > 50) stack.shift();
    this.redoStackByBoardAndAuthor.set(key, stack);
  }

  popRedoStroke(boardId: string, authorId: string): BoardStroke | null {
    const key = `${boardId}::${authorId}`;
    const stack = this.redoStackByBoardAndAuthor.get(key);
    if (!stack || stack.length === 0) return null;
    return stack.pop() ?? null;
  }

  clearRedoStack(boardId: string, authorId: string): void {
    this.redoStackByBoardAndAuthor.delete(`${boardId}::${authorId}`);
  }

  hasRedoStroke(boardId: string, authorId: string): boolean {
    const stack = this.redoStackByBoardAndAuthor.get(`${boardId}::${authorId}`);
    return Boolean(stack && stack.length > 0);
  }

  // ---------------------------------------------------------------------------
  // Rich Elements (Circle, Arrow, Selectable/Movable/Resizable Shapes)
  // ---------------------------------------------------------------------------

  getRichElements(boardId: string): BoardRichElement[] {
    return (this.elementsByBoard.get(boardId) ?? []).filter((e) => !e.deleted);
  }

  addRichElement(
    boardId: string,
    authorId: string,
    authorName: string,
    kind: ExtendedBoardShapeKind,
    color: string,
    width: number,
    points: BoardPoint[],
    text?: string,
    isHost = false,
  ): BoardRichElement {
    if (!this.canEdit(boardId, authorId, isHost)) {
      throw new Error('Esta pizarra está en modo solo lectura para ti.');
    }
    const list = this.elementsByBoard.get(boardId) ?? [];
    if (list.length >= LIMITS.boardOperations) {
      throw new Error('La pizarra ha alcanzado el límite de elementos.');
    }
    const el: BoardRichElement = {
      id: crypto.randomUUID(),
      boardId,
      authorId,
      authorName: authorName.slice(0, 32),
      kind,
      color: /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#315f51',
      width: Math.max(1, Math.min(16, Math.round(width))),
      points: points.slice(0, LIMITS.strokePoints).map(clampBoardPoint),
      text: text ? text.slice(0, LIMITS.boardText) : undefined,
      deleted: false,
      updatedAt: Date.now(),
    };
    list.push(el);
    this.elementsByBoard.set(boardId, list);
    this.saveToStorage();
    return el;
  }

  moveRichElement(
    boardId: string,
    elementId: string,
    dx: number,
    dy: number,
    actorId: string,
    isHost = false,
  ): BoardRichElement | null {
    if (!this.canEdit(boardId, actorId, isHost)) return null;
    const list = this.elementsByBoard.get(boardId);
    if (!list) return null;
    const item = list.find((e) => e.id === elementId && !e.deleted);
    if (!item) return null;
    item.points = item.points.map((pt) => clampBoardPoint({ x: pt.x + dx, y: pt.y + dy }));
    item.updatedAt = Date.now();
    this.saveToStorage();
    return item;
  }

  resizeRichElement(
    boardId: string,
    elementId: string,
    newEndPoint: BoardPoint,
    actorId: string,
    isHost = false,
  ): BoardRichElement | null {
    if (!this.canEdit(boardId, actorId, isHost)) return null;
    const list = this.elementsByBoard.get(boardId);
    if (!list) return null;
    const item = list.find((e) => e.id === elementId && !e.deleted);
    if (!item || item.points.length < 1) return null;
    const clamped = clampBoardPoint(newEndPoint);
    if (item.points.length === 1) item.points.push(clamped);
    else item.points[item.points.length - 1] = clamped;
    item.updatedAt = Date.now();
    this.saveToStorage();
    return item;
  }

  deleteRichElement(boardId: string, elementId: string, actorId: string, isHost = false): boolean {
    if (!this.canEdit(boardId, actorId, isHost)) return false;
    const list = this.elementsByBoard.get(boardId);
    if (!list) return false;
    const item = list.find((e) => e.id === elementId && !e.deleted);
    if (!item) return false;
    item.deleted = true;
    const redo = this.richRedoByBoard.get(boardId) ?? [];
    redo.push(item);
    this.richRedoByBoard.set(boardId, redo);
    this.saveToStorage();
    return true;
  }

  hitTestRichElement(boardId: string, point: BoardPoint, radius = 10): BoardRichElement | null {
    const list = this.getRichElements(boardId);
    for (let i = list.length - 1; i >= 0; i--) {
      const el = list[i];
      if (el.points.length === 0) continue;
      const p0 = el.points[0];
      const p1 = el.points[el.points.length - 1];
      const minX = Math.min(p0.x, p1.x) - radius;
      const maxX = Math.max(p0.x, p1.x) + radius;
      const minY = Math.min(p0.y, p1.y) - radius;
      const maxY = Math.max(p0.y, p1.y) + radius;
      if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
        return el;
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Remote Participant Cursors
  // ---------------------------------------------------------------------------

  updateRemoteCursor(cursor: BoardRemoteCursor): void {
    this.remoteCursors.set(`${cursor.boardId}::${cursor.userId}`, {
      ...cursor,
      updatedAt: Date.now(),
    });
  }

  getActiveCursors(boardId: string, now = Date.now()): BoardRemoteCursor[] {
    const out: BoardRemoteCursor[] = [];
    for (const [key, cursor] of this.remoteCursors.entries()) {
      if (now - cursor.updatedAt > 8_000) {
        this.remoteCursors.delete(key);
        continue;
      }
      if (cursor.boardId === boardId) out.push(cursor);
    }
    return out;
  }

  /**
   * Renders rich shapes (circles, arrows, selected bounding boxes) and remote
   * participant cursors on top of the whiteboard canvas.
   */
  drawRichLayer(
    ctx: CanvasRenderingContext2D,
    boardId: string,
    selectedElementId: string | null = null,
    draftRich: { kind: ExtendedBoardShapeKind; points: BoardPoint[]; color: string; width: number } | null = null,
  ): void {
    const elements = this.getRichElements(boardId);
    const drawOne = (el: { kind: ExtendedBoardShapeKind; points: BoardPoint[]; color: string; width: number }, isSelected: boolean) => {
      if (el.points.length === 0) return;
      const p0 = el.points[0];
      const p1 = el.points[el.points.length - 1] ?? p0;
      ctx.save();
      ctx.strokeStyle = el.color;
      ctx.fillStyle = el.color;
      ctx.lineWidth = el.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.kind === 'circle') {
        const cx = (p0.x + p1.x) / 2;
        const cy = (p0.y + p1.y) / 2;
        const rx = Math.max(2, Math.abs(p1.x - p0.x) / 2);
        const ry = Math.max(2, Math.abs(p1.y - p0.y) / 2);
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (el.kind === 'arrow') {
        const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const headLen = Math.max(10, el.width * 3.2);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x - headLen * Math.cos(angle - Math.PI / 6), p1.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(p1.x - headLen * Math.cos(angle + Math.PI / 6), p1.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
      }

      if (isSelected) {
        const minX = Math.min(p0.x, p1.x) - 6;
        const minY = Math.min(p0.y, p1.y) - 6;
        const w = Math.abs(p1.x - p0.x) + 12;
        const h = Math.abs(p1.y - p0.y) + 12;
        ctx.strokeStyle = '#cf6f3c';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(minX, minY, w, h);
      }
      ctx.restore();
    };

    for (const el of elements) {
      drawOne(el, el.id === selectedElementId);
    }
    if (draftRich && draftRich.points.length > 0) {
      drawOne(draftRich, false);
    }

    // Remote cursors
    for (const cursor of this.getActiveCursors(boardId)) {
      ctx.save();
      ctx.fillStyle = cursor.color;
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '700 10px Inter, ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(cursor.displayName.slice(0, 14), cursor.x + 8, cursor.y - 4);
      ctx.restore();
    }
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const payload = {
        metadata: Array.from(this.metadata.entries()),
        strokes: Array.from(this.strokesByBoard.entries()),
        elements: Array.from(this.elementsByBoard.entries()),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        metadata?: [string, WhiteboardMetadata][];
        strokes?: [string, BoardStroke[]][];
        elements?: [string, BoardRichElement[]][];
      };
      if (Array.isArray(parsed.metadata)) {
        for (const [id, meta] of parsed.metadata) {
          const valid = whiteboardMetadataSchema.safeParse(meta);
          if (valid.success) {
            this.metadata.set(id, valid.data);
            this.decodeSpriteForBoard(id, valid.data.customSpriteDataUrl);
          }
        }
      }
      if (Array.isArray(parsed.strokes)) {
        for (const [id, list] of parsed.strokes) {
          if (Array.isArray(list)) {
            this.strokesByBoard.set(id, list.slice(0, LIMITS.boardOperations));
          }
        }
      }
      if (Array.isArray(parsed.elements)) {
        for (const [id, list] of parsed.elements) {
          if (Array.isArray(list)) {
            this.elementsByBoard.set(id, list.slice(0, LIMITS.boardOperations));
          }
        }
      }
    } catch {
      // Keep default state
    }
  }
}
```

### app/src/notes/secure-notes.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `63a7d0fca955e17605d3c60d22dff3177b2d793b54589f17df74afe27ef628b2`.

```ts
import { z } from 'zod';
import { toTex } from '../whiteboard/math';

/**
 * Part 9 — Secure Notes System
 *
 * A dedicated, strictly non-executable notes application separate from the
 * collaborative code project workspace.
 *
 * Security Guarantees:
 * - Zero terminal or code execution capabilities
 * - Zero raw HTML execution: all user text is HTML-entity escaped before formatting
 * - Strict URL protocol allowlist (`https:`, `http:`, `mailto:`); `javascript:`,
 *   `data:`, `vbscript:`, and `file:` URLs are stripped/neutralized
 * - No inline event handlers (`onload`, `onerror`, `onclick`, etc.)
 * - Independent note IDs organized into notebooks with private/shared permissions
 */

export type NoteVisibility = 'private' | 'shared_read' | 'shared_write';

export interface SecureNotebook {
  id: string;
  name: string;
  ownerId: string;
  createdAt: number;
}

export interface SecureNote {
  id: string;
  notebookId: string;
  title: string;
  content: string;
  ownerId: string;
  visibility: NoteVisibility;
  tags: string[];
  updatedAt: number;
  revision: number;
}

export const secureNoteSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9:_-]{1,96}$/),
  notebookId: z.string().regex(/^[A-Za-z0-9:_-]{1,96}$/),
  title: z.string().min(1).max(120),
  content: z.string().max(100_000),
  ownerId: z.string().min(1).max(128),
  visibility: z.enum(['private', 'shared_read', 'shared_write']),
  tags: z.array(z.string().max(32)).max(12),
  updatedAt: z.number().nonnegative(),
  revision: z.number().int().nonnegative(),
});

export function escapeHtmlStrict(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function sanitizeSafeHref(rawUrl: string): string | null {
  const trimmed = rawUrl.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed, 'https://studyvillage.local');
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:' || parsed.protocol === 'mailto:') {
      return escapeHtmlStrict(trimmed);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Renders a Markdown + LaTeX note into a strictly sanitized, non-executable HTML
 * string. Raw HTML tags in the source are escaped first, so `<script>`, `<img onerror>`,
 * `<iframe>`, `<svg>`, and `<object>` can NEVER execute as DOM elements.
 */
export function renderSafeMarkdownWithLatex(markdown: string): string {
  const normalized = markdown.replace(/\r\n/g, '\n').slice(0, 100_000);
  const lines = normalized.split('\n');
  const htmlBlocks: string[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let inList: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (inList) {
      htmlBlocks.push(`</${inList}>`);
      inList = null;
    }
  };

  const formatInline = (rawLine: string): string => {
    // 1. Escape all raw HTML characters first
    let safe = escapeHtmlStrict(rawLine);

    // 2. Display or inline math ($...$ or $$...$$)
    safe = safe.replace(/\$\$([^$]+)\$\$/g, (_, expr: string) => {
      const tex = toTex(`$${expr}$`) || expr;
      return `<span class="sv-note-math is-display" data-latex="${escapeHtmlStrict(tex)}">∑ ${expr}</span>`;
    });
    safe = safe.replace(/\$([^$]+)\$/g, (_, expr: string) => {
      const tex = toTex(`$${expr}$`) || expr;
      return `<span class="sv-note-math" data-latex="${escapeHtmlStrict(tex)}">${expr}</span>`;
    });

    // 3. Inline code `...`
    safe = safe.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 4. Bold **...** and Italic *...*
    safe = safe.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    safe = safe.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // 5. Links [label](url) — strictly checked against protocol allowlist
    safe = safe.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => {
      const unescapedUrl = url
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");
      const safeHref = sanitizeSafeHref(unescapedUrl);
      if (!safeHref) {
        return `<span class="sv-note-blocked-link" title="Enlace bloqueado por seguridad">${label}</span>`;
      }
      return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });

    return safe;
  };

  for (const line of lines) {
    if (line.trim().startsWith('```')) {
      closeList();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeLines = [];
      } else {
        inCodeBlock = false;
        htmlBlocks.push(`<pre class="sv-note-code"><code>${escapeHtmlStrict(codeLines.join('\n'))}</code></pre>`);
        codeLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    // Headings
    const hMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hMatch) {
      closeList();
      const level = hMatch[1].length;
      htmlBlocks.push(`<h${level}>${formatInline(hMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('> ')) {
      closeList();
      htmlBlocks.push(`<blockquote>${formatInline(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    // Task list / Unordered list
    const ulMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (ulMatch) {
      if (inList !== 'ul') {
        closeList();
        inList = 'ul';
        htmlBlocks.push('<ul>');
      }
      const itemBody = ulMatch[1];
      if (itemBody.startsWith('[x] ') || itemBody.startsWith('[X] ')) {
        htmlBlocks.push(`<li class="sv-note-task is-done">☑ ${formatInline(itemBody.slice(4))}</li>`);
      } else if (itemBody.startsWith('[ ] ')) {
        htmlBlocks.push(`<li class="sv-note-task">☐ ${formatInline(itemBody.slice(4))}</li>`);
      } else {
        htmlBlocks.push(`<li>${formatInline(itemBody)}</li>`);
      }
      continue;
    }

    // Ordered list
    const olMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (olMatch) {
      if (inList !== 'ol') {
        closeList();
        inList = 'ol';
        htmlBlocks.push('<ol>');
      }
      htmlBlocks.push(`<li>${formatInline(olMatch[1])}</li>`);
      continue;
    }

    closeList();
    htmlBlocks.push(`<p>${formatInline(trimmed)}</p>`);
  }

  closeList();
  if (inCodeBlock && codeLines.length > 0) {
    htmlBlocks.push(`<pre class="sv-note-code"><code>${escapeHtmlStrict(codeLines.join('\n'))}</code></pre>`);
  }

  return htmlBlocks.join('\n');
}

const STORAGE_KEY = 'studyvillage-secure-notes-v1';

export class SecureNotesStore {
  private notebooks = new Map<string, SecureNotebook>();
  private notes = new Map<string, SecureNote>();

  constructor(defaultOwnerId = 'local-owner') {
    this.seedDefaults(defaultOwnerId);
    const template = this.notes.get('note:welcome-study');
    this.notes.clear(); this.notebooks.delete('notebook:matematicas');
    this.loadFromStorage();
    const old = this.notes.get('note:welcome-study');
    if (old && template && old.revision === 1 && old.title === template.title && old.content === template.content) this.notes.delete(old.id);
  }

  private seedDefaults(ownerId: string): void {
    const defaultNb: SecureNotebook = {
      id: 'notebook:general',
      name: 'Cuaderno General de Estudio',
      ownerId,
      createdAt: Date.now(),
    };
    const mathNb: SecureNotebook = {
      id: 'notebook:matematicas',
      name: 'Matemáticas y Física',
      ownerId,
      createdAt: Date.now(),
    };
    this.notebooks.set(defaultNb.id, defaultNb);
    this.notebooks.set(mathNb.id, mathNb);

    const welcomeNote: SecureNote = {
      id: 'note:welcome-study',
      notebookId: defaultNb.id,
      title: 'Guía de Estudio Activo y Fórmulas',
      content: [
        '# Guía de Estudio Activo en la Biblioteca',
        '',
        'Este cuaderno es un **entorno seguro de apuntes** (sin ejecución de código ni scripts) diseñado para tomar notas en Markdown y LaTeX.',
        '',
        '## Conceptos Clave',
        '- [x] **Evocación activa**: Explicar una idea sin mirar los apuntes consolida la memoria a largo plazo.',
        '- [ ] **Repaso espaciado**: Transformar secciones difíciles en tarjetas de memoria (*flashcards*).',
        '- [ ] **Casos límite**: Verificar fórmulas con $n = 0$ y $n = 1$ antes de generalizar.',
        '',
        '## Fórmulas de Referencia',
        '- Fórmula cuadrática: $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$',
        '- Sumatoria de Gauss: $$\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}$$',
        '- Teorema fundamental del cálculo: $$\\int_{a}^{b} f(x)\\,dx = F(b) - F(a)$$',
      ].join('\n'),
      ownerId,
      visibility: 'shared_read',
      tags: ['estudio', 'calculo', 'flashcards'],
      updatedAt: Date.now(),
      revision: 1,
    };
    this.notes.set(welcomeNote.id, welcomeNote);
  }

  listNotebooks(): SecureNotebook[] {
    return Array.from(this.notebooks.values()).sort((a, b) => a.createdAt - b.createdAt);
  }

  createNotebook(name: string, ownerId: string): SecureNotebook {
    const clean = name.trim().slice(0, 60) || 'Nuevo Cuaderno';
    const nb: SecureNotebook = {
      id: `notebook:${crypto.randomUUID().slice(0, 12)}`,
      name: clean,
      ownerId,
      createdAt: Date.now(),
    };
    this.notebooks.set(nb.id, nb);
    this.saveToStorage();
    return nb;
  }

  listNotes(viewerId: string, notebookId?: string, searchQuery = ''): SecureNote[] {
    const q = searchQuery.trim().toLowerCase();
    const out: SecureNote[] = [];
    for (const note of this.notes.values()) {
      if (!this.canRead(note, viewerId)) continue;
      if (notebookId && note.notebookId !== notebookId) continue;
      if (q) {
        const hay = `${note.title} ${note.content} ${note.tags.join(' ')}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      out.push(note);
    }
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getNote(noteId: string, viewerId: string): SecureNote | null {
    const note = this.notes.get(noteId);
    if (!note || !this.canRead(note, viewerId)) return null;
    return note;
  }

  canRead(note: SecureNote, userId: string): boolean {
    if (note.ownerId === userId || note.ownerId === 'local-owner') return true;
    return note.visibility === 'shared_read' || note.visibility === 'shared_write';
  }

  canWrite(note: SecureNote, userId: string): boolean {
    if (note.ownerId === userId || note.ownerId === 'local-owner') return true;
    return note.visibility === 'shared_write';
  }

  createNote(params: {
    notebookId?: string;
    title: string;
    content?: string;
    ownerId: string;
    visibility?: NoteVisibility;
    tags?: string[];
  }): SecureNote {
    const notebookId = params.notebookId && this.notebooks.has(params.notebookId)
      ? params.notebookId
      : 'notebook:general';
    const note: SecureNote = {
      id: `note:${crypto.randomUUID().slice(0, 12)}`,
      notebookId,
      title: params.title.trim().slice(0, 120) || 'Apunte sin título',
      content: (params.content ?? '# Nuevo apunte\n\nEscribe tus notas aquí…').slice(0, 100_000),
      ownerId: params.ownerId,
      visibility: params.visibility ?? 'private',
      tags: (params.tags ?? []).map((t) => t.trim().slice(0, 32)).filter(Boolean).slice(0, 12),
      updatedAt: Date.now(),
      revision: 1,
    };
    secureNoteSchema.parse(note);
    this.notes.set(note.id, note);
    this.saveToStorage();
    return note;
  }

  updateNote(
    noteId: string,
    patch: Partial<Pick<SecureNote, 'title' | 'content' | 'visibility' | 'notebookId' | 'tags'>>,
    actorId: string,
  ): SecureNote {
    const existing = this.notes.get(noteId);
    if (!existing) throw new Error('Apunte no encontrado.');
    if (!this.canWrite(existing, actorId)) {
      throw new Error('No tienes permiso de escritura en este apunte.');
    }
    if (patch.visibility !== undefined && existing.ownerId !== actorId && existing.ownerId !== 'local-owner') {
      throw new Error('Solo quien creó el apunte puede cambiar su visibilidad.');
    }
    const updated: SecureNote = {
      ...existing,
      title: patch.title !== undefined ? (patch.title.trim().slice(0, 120) || existing.title) : existing.title,
      content: patch.content !== undefined ? patch.content.slice(0, 100_000) : existing.content,
      visibility: patch.visibility ?? existing.visibility,
      notebookId: patch.notebookId ?? existing.notebookId,
      tags: patch.tags ? patch.tags.slice(0, 12) : existing.tags,
      updatedAt: Date.now(),
      revision: existing.revision + 1,
    };
    secureNoteSchema.parse(updated);
    this.notes.set(noteId, updated);
    this.saveToStorage();
    return updated;
  }

  deleteNote(noteId: string, actorId: string): boolean {
    const existing = this.notes.get(noteId);
    if (!existing) return false;
    if (existing.ownerId !== actorId && existing.ownerId !== 'local-owner') {
      throw new Error('Solo quien creó el apunte puede eliminarlo.');
    }
    this.notes.delete(noteId);
    this.saveToStorage();
    return true;
  }

  private saveToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const payload = {
        notebooks: Array.from(this.notebooks.values()),
        notes: Array.from(this.notes.values()),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore quota errors
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        notebooks?: SecureNotebook[];
        notes?: SecureNote[];
      };
      if (Array.isArray(parsed.notebooks)) {
        for (const nb of parsed.notebooks) {
          if (nb && typeof nb.id === 'string' && typeof nb.name === 'string') {
            this.notebooks.set(nb.id, nb);
          }
        }
      }
      if (Array.isArray(parsed.notes)) {
        for (const n of parsed.notes) {
          const valid = secureNoteSchema.safeParse(n);
          if (valid.success) {
            this.notes.set(valid.data.id, valid.data);
          }
        }
      }
    } catch {
      // Keep defaults
    }
  }
}
```

### app/src/ui/notes-ui.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `92cc81f90c36320dbdea27902c0d01a77c0b37fd84ea3364d47f3208b8ff4d25`.

```ts
import { renderSafeMarkdownWithLatex, type SecureNote, type SecureNotesStore } from '../notes/secure-notes';
import { mathReady } from '../whiteboard/math';
import { monoIcon } from './pixel-icons';

/**
 * Notes as a calm, Notion-like page editor. A page is a list of blocks
 * (text, headings, lists, to-dos, quotes, code, formulas, dividers) edited in
 * place; it is stored as plain Markdown so older notes open unchanged.
 */

export type BlockType = 'p' | 'h1' | 'h2' | 'h3' | 'bullet' | 'number' | 'todo' | 'quote' | 'code' | 'math' | 'divider';
export interface Block { type: BlockType; text: string; done?: boolean }

const BLOCK_MENU: { type: BlockType; label: string; hint: string; keys: string }[] = [
  { type: 'p', label: 'Texto', hint: 'Un párrafo normal', keys: 'texto parrafo' },
  { type: 'h1', label: 'Título 1', hint: 'Encabezado grande', keys: 'titulo h1 encabezado' },
  { type: 'h2', label: 'Título 2', hint: 'Encabezado mediano', keys: 'titulo h2 subtitulo' },
  { type: 'h3', label: 'Título 3', hint: 'Encabezado pequeño', keys: 'titulo h3' },
  { type: 'todo', label: 'Lista de tareas', hint: 'Casillas para marcar', keys: 'tarea todo check casilla' },
  { type: 'bullet', label: 'Lista', hint: 'Lista con viñetas', keys: 'lista viñeta bullet' },
  { type: 'number', label: 'Lista numerada', hint: '1, 2, 3…', keys: 'numerada numero' },
  { type: 'quote', label: 'Cita', hint: 'Resaltar una idea', keys: 'cita quote' },
  { type: 'math', label: 'Fórmula', hint: 'LaTeX en bloque', keys: 'formula latex ecuacion math' },
  { type: 'code', label: 'Código', hint: 'Texto monoespaciado', keys: 'codigo code' },
  { type: 'divider', label: 'Separador', hint: 'Línea horizontal', keys: 'separador linea divider' },
];

const SHORTCUTS: [RegExp, BlockType, boolean?][] = [
  [/^### $/, 'h3'], [/^## $/, 'h2'], [/^# $/, 'h1'], [/^\[\] $|^- \[ \] $/, 'todo'], [/^\[x\] $/i, 'todo', true],
  [/^[-*] $/, 'bullet'], [/^1[.)] $/, 'number'], [/^> $/, 'quote'], [/^```$/, 'code'], [/^\$\$$/, 'math'], [/^---$/, 'divider'],
];

export function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      const body: string[] = [];
      while (++i < lines.length && !lines[i].startsWith('```')) body.push(lines[i]);
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }
    if (!line.trim()) continue;
    let m: RegExpExecArray | null;
    if ((m = /^\$\$(.*)\$\$\s*$/.exec(line.trim()))) blocks.push({ type: 'math', text: m[1].trim() });
    else if ((m = /^(#{1,3}) (.*)$/.exec(line))) blocks.push({ type: (`h${m[1].length}`) as BlockType, text: m[2] });
    else if ((m = /^\s*[-*] \[( |x|X)\] (.*)$/.exec(line))) blocks.push({ type: 'todo', text: m[2], done: m[1] !== ' ' });
    else if ((m = /^\s*[-*] (.*)$/.exec(line))) blocks.push({ type: 'bullet', text: m[1] });
    else if ((m = /^\s*\d+[.)] (.*)$/.exec(line))) blocks.push({ type: 'number', text: m[1] });
    else if ((m = /^> ?(.*)$/.exec(line))) blocks.push({ type: 'quote', text: m[1] });
    else if (/^(-{3,}|\*{3,})$/.test(line.trim())) blocks.push({ type: 'divider', text: '' });
    else blocks.push({ type: 'p', text: line });
  }
  return blocks.length ? blocks : [{ type: 'p', text: '' }];
}

export function serializeBlocks(blocks: readonly Block[]): string {
  let number = 0;
  const out: string[] = [];
  for (const b of blocks) {
    number = b.type === 'number' ? number + 1 : 0;
    const text = b.type === 'code' ? b.text : b.text.replace(/\n/g, ' ');
    switch (b.type) {
      case 'h1': out.push(`# ${text}`); break;
      case 'h2': out.push(`## ${text}`); break;
      case 'h3': out.push(`### ${text}`); break;
      case 'bullet': out.push(`- ${text}`); break;
      case 'number': out.push(`${number}. ${text}`); break;
      case 'todo': out.push(`- [${b.done ? 'x' : ' '}] ${text}`); break;
      case 'quote': out.push(`> ${text}`); break;
      case 'code': out.push('```', text, '```'); break;
      case 'math': out.push(`$$${text}$$`); break;
      case 'divider': out.push('---'); break;
      default: out.push(text);
    }
  }
  return out.join('\n');
}

/**
 * The Markdown renderer only marks formulas; this draws them with the same
 * MathJax engine as the whiteboard. A formula that fails keeps its source text.
 */
function typesetMath(container: HTMLElement, color = '#37352f'): void {
  for (const span of container.querySelectorAll<HTMLElement>('.sv-note-math[data-latex]')) {
    // The sanitizer escaped the source before tagging it; a textarea decodes
    // entities without ever parsing markup.
    const decoder = document.createElement('textarea');
    decoder.innerHTML = span.dataset.latex ?? '';
    const tex = decoder.value;
    const display = span.classList.contains('is-display');
    span.textContent = tex;
    void mathReady(tex, display ? 19 : 16, color, display, 2).then((math) => {
      if (math === 'error' || !span.isConnected) return;
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(math.width * 2);
      canvas.height = Math.ceil(math.height * 2);
      canvas.style.width = `${math.width}px`;
      canvas.style.height = `${math.height}px`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', tex);
      canvas.getContext('2d')?.drawImage(math.image, 0, 0, canvas.width, canvas.height);
      span.replaceChildren(canvas);
    });
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function btn(label: string, className: string): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

/** Plain-text editing where supported, so pasted styles never enter a note. */
function makeEditable(node: HTMLElement, on: boolean): void {
  if (!on) { node.contentEditable = 'false'; return; }
  try { node.contentEditable = 'plaintext-only'; } catch { node.contentEditable = 'true'; }
}

function caretOffset(node: HTMLElement): number {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !node.contains(sel.anchorNode)) return 0;
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(node);
  range.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
  return range.toString().length;
}

function placeCaret(node: HTMLElement, offset: number): void {
  node.focus();
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  let remaining = offset;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode();
  while (text) {
    const len = text.textContent?.length ?? 0;
    if (remaining <= len) { range.setStart(text, remaining); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); return; }
    remaining -= len;
    text = walker.nextNode();
  }
  range.selectNodeContents(node);
  range.collapse(false);
  sel.removeAllRanges();
  sel.addRange(range);
}

function timeAgo(ms: number): string {
  const min = Math.round((Date.now() - ms) / 60_000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return new Date(ms).toLocaleDateString('es');
}

export interface NotesPanelContext {
  store: SecureNotesStore;
  actorId(): string;
  close(): void;
  notify(message: string): void;
  makeDeck(note: SecureNote): void;
  makeAiDeck: ((note: SecureNote) => void) | null;
}

export class NotesPanel {
  readonly root = el('section', 'nb');
  private noteId: string | null = null;
  private notebookId = 'notebook:general';
  private query = '';
  private blocks: Block[] = [];
  private blockEls: HTMLElement[] = [];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private menu: { index: number; filter: string; active: number; el: HTMLElement } | null = null;
  private pageMenuOpen = false;
  private sidebar = el('nav', 'nb-sidebar');
  private page = el('article', 'nb-page');

  constructor(private readonly ctx: NotesPanelContext) {
    this.root.setAttribute('aria-label', 'Apuntes');
    this.root.append(this.sidebar, this.page);
  }

  mount(container: HTMLElement): void {
    container.replaceChildren(this.root);
    const notes = this.ctx.store.listNotes(this.ctx.actorId());
    if (!this.noteId || !this.ctx.store.getNote(this.noteId, this.ctx.actorId())) this.noteId = notes[0]?.id ?? null;
    if (this.noteId) this.notebookId = this.ctx.store.getNote(this.noteId, this.ctx.actorId())!.notebookId;
    this.renderSidebar();
    this.renderPage();
  }

  unmount(): void { this.flush(); this.root.remove(); }

  private note(): SecureNote | null { return this.noteId ? this.ctx.store.getNote(this.noteId, this.ctx.actorId()) : null; }

  private open(noteId: string): void {
    this.flush();
    this.noteId = noteId;
    this.pageMenuOpen = false;
    this.renderSidebar();
    this.renderPage();
  }

  private renderSidebar(): void {
    const actor = this.ctx.actorId();
    this.sidebar.replaceChildren();
    const head = el('div', 'nb-side-head');
    head.append(el('strong', '', 'Apuntes'), el('span', 'nb-local', 'En este equipo'));
    const search = el('label', 'nb-search');
    const input = el('input');
    input.type = 'search';
    input.placeholder = 'Buscar';
    input.value = this.query;
    input.setAttribute('aria-label', 'Buscar apuntes');
    input.addEventListener('input', () => { this.query = input.value; this.renderTree(tree); });
    search.append(monoIcon('search', 12), input);
    const tree = el('div', 'nb-tree');
    this.renderTree(tree);
    const addBook = btn('', 'nb-side-action');
    addBook.append(monoIcon('plus', 10), el('span', '', 'Nuevo cuaderno'));
    addBook.addEventListener('click', () => {
      const row = el('div', 'nb-new-book');
      const name = el('input');
      name.placeholder = 'Nombre del cuaderno';
      name.maxLength = 60;
      const commit = () => {
        if (name.value.trim()) {
          const book = this.ctx.store.createNotebook(name.value, actor);
          this.notebookId = book.id;
          this.createPage(book.id);
        } else this.renderSidebar();
      };
      name.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') this.renderSidebar(); });
      name.addEventListener('blur', commit, { once: true });
      row.append(name);
      addBook.replaceWith(row);
      name.focus();
    });
    this.sidebar.append(head, search, tree, addBook);
  }

  private renderTree(tree: HTMLElement): void {
    const actor = this.ctx.actorId();
    tree.replaceChildren();
    for (const book of this.ctx.store.listNotebooks()) {
      const notes = this.ctx.store.listNotes(actor, book.id, this.query);
      if (this.query && !notes.length) continue;
      const group = el('div', 'nb-book');
      const title = el('div', 'nb-book-title');
      title.append(el('span', '', book.name));
      const add = btn('', 'nb-icon-btn');
      add.append(monoIcon('plus', 10));
      add.title = 'Nueva página';
      add.setAttribute('aria-label', `Nueva página en ${book.name}`);
      add.addEventListener('click', () => this.createPage(book.id));
      title.append(add);
      group.append(title);
      for (const note of notes) {
        const row = btn('', 'nb-page-row');
        row.classList.toggle('is-active', note.id === this.noteId);
        row.append(monoIcon('notes', 12), el('span', '', note.title || 'Sin título'));
        row.addEventListener('click', () => this.open(note.id));
        group.append(row);
      }
      if (!notes.length) group.append(el('p', 'nb-empty-book', 'Sin páginas'));
      tree.append(group);
    }
  }

  private createPage(notebookId: string): void {
    const note = this.ctx.store.createNote({ notebookId, title: 'Sin título', content: '', ownerId: 'local-owner' });
    this.notebookId = notebookId;
    this.open(note.id);
    queueMicrotask(() => { const t = this.page.querySelector<HTMLElement>('.nb-title'); if (t) { t.focus(); document.getSelection()?.selectAllChildren(t); } });
  }

  private renderPage(): void {
    this.page.replaceChildren();
    const note = this.note();
    if (!note) {
      const empty = el('div', 'nb-blank');
      empty.append(el('h2', '', 'Aún no hay páginas'), el('p', '', 'Crea una página en un cuaderno para empezar.'));
      const create = btn('Nueva página', 'nb-primary');
      create.addEventListener('click', () => this.createPage(this.notebookId));
      empty.append(create);
      const close = this.closeButton();
      this.page.append(close, empty);
      return;
    }
    const canWrite = this.ctx.store.canWrite(note, this.ctx.actorId());
    const book = this.ctx.store.listNotebooks().find((b) => b.id === note.notebookId);
    const top = el('div', 'nb-topbar');
    const crumbs = el('div', 'nb-crumbs');
    crumbs.append(el('span', '', book?.name ?? 'Cuaderno'), el('span', 'nb-sep', '/'), el('span', '', note.title || 'Sin título'));
    const actions = el('div', 'nb-top-actions');
    actions.append(el('span', 'nb-edited', `Editado ${timeAgo(note.updatedAt)}`));
    const more = btn('', 'nb-icon-btn');
    more.append(el('span', 'nb-dots', '•••'));
    more.setAttribute('aria-label', 'Más opciones de la página');
    more.setAttribute('aria-expanded', String(this.pageMenuOpen));
    more.addEventListener('click', () => { this.pageMenuOpen = !this.pageMenuOpen; this.renderPage(); });
    actions.append(more, this.closeButton());
    top.append(crumbs, actions);
    if (this.pageMenuOpen) top.append(this.pageMenu(note, canWrite));

    const body = el('div', 'nb-body');
    const title = el('h1', 'nb-title');
    makeEditable(title, canWrite);
    title.textContent = note.title === 'Sin título' ? '' : note.title;
    title.dataset.placeholder = 'Sin título';
    title.setAttribute('aria-label', 'Título de la página');
    title.dataset.testid = 'secure-note-title';
    title.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.focusBlock(0, 0); }
    });
    title.addEventListener('input', () => this.scheduleSave());

    this.blocks = parseBlocks(note.content);
    const list = el('div', 'nb-blocks');
    list.dataset.testid = 'secure-note-content-input';
    this.blockEls = this.blocks.map((block, i) => this.blockElement(block, i, canWrite));
    list.append(...this.blockEls);
    list.addEventListener('click', (e) => {
      if (e.target === list && canWrite) {
        const last = this.blocks.length - 1;
        if (this.blocks[last].type !== 'p' || this.blocks[last].text) this.insertBlock(last + 1, { type: 'p', text: '' });
        else this.focusBlock(last, 0);
      }
    });
    body.append(title, list);
    if (canWrite) body.append(el('p', 'nb-hint', 'Escribe «/» para elegir un tipo de bloque. Atajos: # título, - lista, [] tarea, > cita, $$ fórmula.'));
    this.page.append(top, body);
  }

  private closeButton(): HTMLButtonElement {
    const close = btn('', 'nb-icon-btn');
    close.append(monoIcon('close', 12));
    close.setAttribute('aria-label', 'Cerrar apuntes');
    close.dataset.testid = 'expansion-modal-close';
    close.addEventListener('click', () => this.ctx.close());
    return close;
  }

  private pageMenu(note: SecureNote, canWrite: boolean): HTMLElement {
    const menu = el('div', 'nb-popover');
    const item = (label: string, action: () => void, disabled = false) => {
      const b = btn(label, 'nb-menu-item');
      b.disabled = disabled;
      b.addEventListener('click', () => { this.pageMenuOpen = false; action(); });
      menu.append(b);
    };
    item('Crear tarjetas de repaso', () => { this.flush(); this.ctx.makeDeck(this.note()!); });
    if (this.ctx.makeAiDeck) item('Generar tarjetas con IA', () => { this.flush(); this.ctx.makeAiDeck!(this.note()!); });
    item('Exportar como Markdown', () => {
      this.flush();
      const current = this.note()!;
      const blob = new Blob([`# ${current.title}\n\n${current.content}`], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${current.title.replace(/[^\w\-áéíóúñ ]+/gi, '').trim() || 'apunte'}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });
    item('Borrar página', () => {
      try {
        this.ctx.store.deleteNote(note.id, this.ctx.actorId());
        this.noteId = this.ctx.store.listNotes(this.ctx.actorId())[0]?.id ?? null;
        this.renderSidebar();
        this.renderPage();
      } catch (e) { this.ctx.notify(e instanceof Error ? e.message : 'No se pudo borrar.'); }
    }, !canWrite);
    return menu;
  }

  private blockElement(block: Block, index: number, canWrite: boolean): HTMLElement {
    const row = el('div', `nb-block is-${block.type}`);
    if (block.type === 'divider') {
      row.append(el('hr'));
      row.tabIndex = 0;
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); this.removeBlock(index, index - 1); }
        if (e.key === 'Enter') { e.preventDefault(); this.insertBlock(index + 1, { type: 'p', text: '' }); }
      });
      return row;
    }
    if (block.type === 'todo') {
      const box = el('input', 'nb-check');
      box.type = 'checkbox';
      box.checked = !!block.done;
      box.disabled = !canWrite;
      box.setAttribute('aria-label', 'Hecho');
      box.addEventListener('change', () => { block.done = box.checked; row.classList.toggle('is-done', box.checked); this.scheduleSave(); });
      row.classList.toggle('is-done', !!block.done);
      row.append(box);
    } else if (block.type === 'bullet') row.append(el('span', 'nb-marker', '•'));
    else if (block.type === 'number') {
      let n = 1;
      for (let i = index - 1; i >= 0 && this.blocks[i].type === 'number'; i--) n++;
      row.append(el('span', 'nb-marker', `${n}.`));
    }
    const text: HTMLElement = el(block.type === 'code' ? 'pre' : 'div', 'nb-text');
    makeEditable(text, canWrite);
    text.spellcheck = block.type !== 'code' && block.type !== 'math';
    text.dataset.placeholder = index === 0 && this.blocks.length === 1 ? 'Escribe algo, o «/» para ver bloques…' : block.type === 'math' ? 'Fórmula LaTeX' : block.type.startsWith('h') ? 'Título' : '';
    const showRendered = () => {
      if (block.type === 'math' && block.text.trim()) {
        text.innerHTML = renderSafeMarkdownWithLatex(`$$${block.text}$$`);
        typesetMath(text);
        row.classList.add('is-rendered');
      } else if (block.type !== 'code' && /\$[^$]+\$|\*\*[^*]+\*\*|\*[^*]+\*/.test(block.text)) {
        text.innerHTML = renderSafeMarkdownWithLatex(block.text).replace(/^<p>|<\/p>\s*$/g, '');
        typesetMath(text);
        row.classList.add('is-rendered');
      } else {
        text.textContent = block.text;
        row.classList.remove('is-rendered');
      }
    };
    showRendered();
    text.addEventListener('focus', () => {
      if (row.classList.contains('is-rendered')) {
        text.textContent = block.text;
        row.classList.remove('is-rendered');
        placeCaret(text, block.text.length);
      }
    });
    text.addEventListener('blur', () => { if (!this.menu) showRendered(); });
    text.addEventListener('input', () => this.onInput(index, text));
    text.addEventListener('keydown', (e) => this.onKey(e, index, text));
    row.append(text);
    return row;
  }

  private onInput(index: number, text: HTMLElement): void {
    const block = this.blocks[index];
    block.text = text.textContent ?? '';
    if (block.type !== 'code') {
      for (const [pattern, type, done] of SHORTCUTS) {
        if (pattern.test(block.text) && block.type !== type) {
          this.replaceBlock(index, { type, text: '', done: !!done });
          if (type === 'divider') this.insertBlock(index + 1, { type: 'p', text: '' });
          return;
        }
      }
    }
    if (block.text.startsWith('/') && !block.text.includes(' ')) this.openMenu(index, block.text.slice(1));
    else this.closeMenu();
    this.scheduleSave();
  }

  private onKey(e: KeyboardEvent, index: number, text: HTMLElement): void {
    const block = this.blocks[index];
    if (this.menu && this.menu.index === index) {
      const options = this.menuOptions();
      if (e.key === 'ArrowDown') { e.preventDefault(); this.menu.active = (this.menu.active + 1) % Math.max(1, options.length); this.paintMenu(); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); this.menu.active = (this.menu.active - 1 + options.length) % Math.max(1, options.length); this.paintMenu(); return; }
      if (e.key === 'Enter') { e.preventDefault(); const chosen = options[this.menu.active]; if (chosen) this.applyMenu(chosen.type); return; }
      if (e.key === 'Escape') { e.preventDefault(); this.closeMenu(); return; }
    }
    const offset = caretOffset(text);
    if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code') {
      e.preventDefault();
      const listy = block.type === 'bullet' || block.type === 'number' || block.type === 'todo';
      if (listy && !block.text) { this.replaceBlock(index, { type: 'p', text: '' }); return; }
      const before = block.text.slice(0, offset);
      const after = block.text.slice(offset);
      block.text = before;
      text.textContent = before;
      this.insertBlock(index + 1, { type: listy || block.type === 'quote' ? block.type : 'p', text: after }, 0);
      return;
    }
    if (e.key === 'Enter' && block.type === 'code' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.insertBlock(index + 1, { type: 'p', text: '' });
      return;
    }
    if (e.key === 'Backspace' && offset === 0 && !window.getSelection()?.toString()) {
      if (block.type !== 'p') { e.preventDefault(); this.replaceBlock(index, { type: 'p', text: block.text }, 0); return; }
      if (index > 0) {
        e.preventDefault();
        const prev = this.blocks[index - 1];
        if (prev.type === 'divider') { this.removeBlock(index - 1, index - 1, 0); return; }
        const join = prev.text.length;
        prev.text += block.text;
        this.removeBlock(index, index - 1, join);
      }
      return;
    }
    if (e.key === 'ArrowUp' && offset === 0 && index > 0) { e.preventDefault(); this.focusBlock(index - 1, Infinity); }
    if (e.key === 'ArrowDown' && offset === block.text.length && index < this.blocks.length - 1) { e.preventDefault(); this.focusBlock(index + 1, 0); }
  }

  private menuOptions(): typeof BLOCK_MENU {
    const f = (this.menu?.filter ?? '').toLowerCase();
    return BLOCK_MENU.filter((o) => !f || o.label.toLowerCase().includes(f) || o.keys.includes(f));
  }

  private openMenu(index: number, filter: string): void {
    if (!this.menu || this.menu.index !== index) {
      this.closeMenu();
      const menuEl = el('div', 'nb-slash');
      menuEl.setAttribute('role', 'listbox');
      this.menu = { index, filter, active: 0, el: menuEl };
      this.blockEls[index]?.append(menuEl);
    }
    this.menu.filter = filter;
    this.menu.active = Math.min(this.menu.active, Math.max(0, this.menuOptions().length - 1));
    this.paintMenu();
  }

  private paintMenu(): void {
    if (!this.menu) return;
    const options = this.menuOptions();
    this.menu.el.replaceChildren(el('div', 'nb-slash-title', 'Bloques'));
    if (!options.length) this.menu.el.append(el('p', 'nb-slash-none', 'Sin resultados'));
    options.forEach((o, i) => {
      const item = btn('', 'nb-slash-item');
      item.setAttribute('role', 'option');
      item.classList.toggle('is-active', i === this.menu!.active);
      item.append(el('strong', '', o.label), el('span', '', o.hint));
      item.addEventListener('mousedown', (e) => { e.preventDefault(); this.applyMenu(o.type); });
      this.menu!.el.append(item);
    });
  }

  private applyMenu(type: BlockType): void {
    if (!this.menu) return;
    const index = this.menu.index;
    this.closeMenu();
    this.replaceBlock(index, { type, text: '' });
    if (type === 'divider') this.insertBlock(index + 1, { type: 'p', text: '' });
  }

  private closeMenu(): void {
    this.menu?.el.remove();
    this.menu = null;
  }

  private rebuild(focus: number, caret: number): void {
    const note = this.note();
    if (!note) return;
    const canWrite = this.ctx.store.canWrite(note, this.ctx.actorId());
    const list = this.page.querySelector('.nb-blocks');
    if (!list) return;
    this.blockEls = this.blocks.map((block, i) => this.blockElement(block, i, canWrite));
    list.replaceChildren(...this.blockEls);
    this.focusBlock(focus, caret);
    this.scheduleSave();
  }

  private replaceBlock(index: number, block: Block, caret = 0): void { this.blocks[index] = block; this.rebuild(index, caret); }
  private insertBlock(index: number, block: Block, caret = 0): void { this.blocks.splice(index, 0, block); this.rebuild(index, caret); }
  private removeBlock(index: number, focus: number, caret = Infinity): void {
    this.blocks.splice(index, 1);
    if (!this.blocks.length) this.blocks.push({ type: 'p', text: '' });
    this.rebuild(Math.max(0, Math.min(focus, this.blocks.length - 1)), caret);
  }

  private focusBlock(index: number, caret: number): void {
    const row = this.blockEls[index];
    if (!row) return;
    const text = row.querySelector<HTMLElement>('.nb-text');
    if (!text) { row.focus(); return; }
    text.focus();
    placeCaret(text, Math.min(caret, this.blocks[index].text.length));
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 400);
  }

  private flush(): void {
    if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = null; } else return;
    const note = this.note();
    if (!note || !this.ctx.store.canWrite(note, this.ctx.actorId())) return;
    const titleEl = this.page.querySelector<HTMLElement>('.nb-title');
    const title = titleEl?.textContent?.trim() || 'Sin título';
    try {
      this.ctx.store.updateNote(note.id, { title, content: serializeBlocks(this.blocks) }, this.ctx.actorId());
      const active = this.sidebar.querySelector('.nb-page-row.is-active span');
      if (active && active.textContent !== title) active.textContent = title;
      const crumb = this.page.querySelector('.nb-crumbs span:last-child');
      if (crumb) crumb.textContent = title;
      const edited = this.page.querySelector('.nb-edited');
      if (edited) edited.textContent = 'Editado ahora mismo';
    } catch (e) {
      this.ctx.notify(e instanceof Error ? e.message : 'No se pudo guardar el apunte.');
    }
  }
}
```

### app/src/projects/group-projects.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `3c0cf98423297bf400ee8f1c746837360eb285f409059a6e51adf84ae4f8d79a`.

```ts
import type { RoomEngine } from '../minigames/room';

/**
 * Group projects worked on together in VS Code.
 *
 * StudyVillage does not edit code. It is the place where a group keeps its
 * projects: where the repository lives, the Live Share session someone is
 * hosting right now, who is working, and what is left to do. Every link opens
 * in the real VS Code (desktop or vscode.dev), so the group gets a full editor,
 * terminals, debugging and git instead of a toy notebook.
 *
 * The board is shared through the village host like a game: the host keeps
 * the list (and saves it on its machine), members send changes.
 */

export interface ProjectTask { id: string; text: string; done: boolean; by: string | null }
export interface GroupProject {
  id: string;
  name: string;
  description: string;
  repoUrl: string | null;
  liveShareUrl: string | null;
  liveShareBy: string | null;
  ownerId: string;
  ownerName: string;
  /** Who said "I'm in": id -> display name and color. */
  working: Record<string, { name: string; color: string }>;
  tasks: ProjectTask[];
  updatedAt: number;
}

export type ProjectsAction =
  | { kind: 'create'; name: string; description: string; repoUrl: string; me: Who }
  | { kind: 'edit'; id: string; name: string; description: string; repoUrl: string }
  | { kind: 'delete'; id: string }
  | { kind: 'live_share'; id: string; url: string; me: Who }
  | { kind: 'end_live_share'; id: string }
  | { kind: 'working'; id: string; on: boolean; me: Who }
  | { kind: 'add_task'; id: string; text: string }
  | { kind: 'toggle_task'; id: string; taskId: string; me: Who }
  | { kind: 'remove_task'; id: string; taskId: string };

export interface Who { name: string; color: string }
export interface ProjectsView { projects: GroupProject[] }

const MAX_PROJECTS = 24;
const MAX_TASKS = 40;
const STORAGE_KEY = 'studyvillage-group-projects-v1';

/** Live Share and vscode.dev hosts; any other link would be a phishing vector on a shared board. */
const LIVE_SHARE_HOSTS = new Set(['prod.liveshare.vsengsaas.visualstudio.com', 'vscode.dev', 'insiders.vscode.dev']);

export function parseLiveShareUrl(raw: string): string | null {
  const url = safeUrl(raw);
  if (!url || !LIVE_SHARE_HOSTS.has(url.hostname)) return null;
  if (url.hostname !== 'prod.liveshare.vsengsaas.visualstudio.com' && !url.pathname.startsWith('/liveshare/')) return null;
  return url.href;
}

/** An https repository address (GitHub, GitLab, Bitbucket, a self-hosted git…). */
export function parseRepoUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const ssh = /^git@([a-z0-9.-]+):([\w.-]+\/[\w./-]+?)(\.git)?$/i.exec(trimmed);
  const url = safeUrl(ssh ? `https://${ssh[1]}/${ssh[2]}` : trimmed);
  if (!url || url.pathname.split('/').filter(Boolean).length < 2) return null;
  return url.href.replace(/\/$/, '');
}

function safeUrl(raw: string): URL | null {
  try {
    const url = new URL(String(raw).trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 600) return null;
    return url;
  } catch { return null; }
}

/** Opens VS Code's own "Clone repository" flow for this address. */
export function vscodeCloneLink(repoUrl: string): string {
  const clone = repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`;
  return `vscode://vscode.git/clone?url=${encodeURIComponent(clone)}`;
}

/** vscode.dev opens GitHub and Azure repos straight in the browser. */
export function vscodeWebLink(repoUrl: string): string | null {
  const url = safeUrl(repoUrl);
  if (!url) return null;
  const path = url.pathname.replace(/\.git$/, '').split('/').filter(Boolean);
  if (url.hostname === 'github.com' && path.length >= 2) return `https://vscode.dev/github/${path[0]}/${path[1]}`;
  return null;
}

export function gitCloneCommand(repoUrl: string): string {
  return `git clone ${repoUrl.endsWith('.git') ? repoUrl : `${repoUrl}.git`}`;
}

export function repoLabel(repoUrl: string): string {
  const url = safeUrl(repoUrl);
  if (!url) return repoUrl;
  return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\.git$/, '')}`;
}

/** Opens a vetted link with the system: the desktop app asks the OS, the browser follows the link. */
export async function openExternal(url: string): Promise<void> {
  if (!url.startsWith('https://') && !url.startsWith('vscode://vscode.git/clone?url=')) throw new Error('Enlace no permitido.');
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) {
    const { invoke } = await import('@tauri-apps/api/core');
    await invoke('open_external', { url });
    return;
  }
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.rel = 'noopener noreferrer';
  if (url.startsWith('https://')) anchor.target = '_blank';
  anchor.click();
}

export class GroupProjectsBoard implements RoomEngine<ProjectsAction, ProjectsView> {
  projects: GroupProject[] = [];

  constructor(private readonly persist = true) {
    if (persist) this.load();
  }

  audience(): string[] { return []; }
  tick(): boolean { return false; }

  viewFor(): ProjectsView { return { projects: this.projects.map((p) => structuredClone(p)) }; }

  apply(actorId: string, action: ProjectsAction, now: number): void {
    if (action.kind === 'create') {
      if (this.projects.length >= MAX_PROJECTS) throw new Error('La aldea ya tiene el máximo de proyectos.');
      const name = text(action.name, 60);
      if (!name) throw new Error('Ponle un nombre al proyecto.');
      const repoUrl = action.repoUrl.trim() ? parseRepoUrl(action.repoUrl) : null;
      if (action.repoUrl.trim() && !repoUrl) throw new Error('El repositorio debe ser una dirección https (por ejemplo https://github.com/usuario/proyecto).');
      this.projects.unshift({
        id: `p${now.toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`,
        name, description: text(action.description, 280), repoUrl, liveShareUrl: null, liveShareBy: null,
        ownerId: actorId, ownerName: text(action.me.name, 32) || 'Alguien',
        working: {}, tasks: [], updatedAt: now,
      });
      return this.save();
    }
    const project = this.projects.find((p) => p.id === action.id);
    if (!project) throw new Error('Ese proyecto ya no existe.');
    switch (action.kind) {
      case 'edit': {
        const name = text(action.name, 60);
        if (!name) throw new Error('Ponle un nombre al proyecto.');
        const repoUrl = action.repoUrl.trim() ? parseRepoUrl(action.repoUrl) : null;
        if (action.repoUrl.trim() && !repoUrl) throw new Error('El repositorio debe ser una dirección https.');
        Object.assign(project, { name, description: text(action.description, 280), repoUrl });
        break;
      }
      case 'delete':
        if (project.ownerId !== actorId) throw new Error('Solo quien creó el proyecto puede borrarlo.');
        this.projects = this.projects.filter((p) => p !== project);
        return this.save();
      case 'live_share': {
        const url = parseLiveShareUrl(action.url);
        if (!url) throw new Error('Pega el enlace que copia Live Share (https://prod.liveshare.vsengsaas.visualstudio.com/join?…).');
        project.liveShareUrl = url;
        project.liveShareBy = text(action.me.name, 32) || 'Alguien';
        project.working[actorId] = who(action.me);
        break;
      }
      case 'end_live_share':
        project.liveShareUrl = null;
        project.liveShareBy = null;
        break;
      case 'working':
        if (action.on) project.working[actorId] = who(action.me);
        else delete project.working[actorId];
        break;
      case 'add_task': {
        const value = text(action.text, 140);
        if (!value) return;
        if (project.tasks.length >= MAX_TASKS) throw new Error('Demasiadas tareas: marca algunas como hechas y bórralas.');
        project.tasks.push({ id: `t${now.toString(36)}${project.tasks.length}`, text: value, done: false, by: null });
        break;
      }
      case 'toggle_task': {
        const task = project.tasks.find((t) => t.id === action.taskId);
        if (!task) return;
        task.done = !task.done;
        task.by = task.done ? text(action.me.name, 32) : null;
        break;
      }
      case 'remove_task':
        project.tasks = project.tasks.filter((t) => t.id !== action.taskId);
        break;
    }
    project.updatedAt = now;
    this.save();
  }

  /** Forget "working now" marks of people who are no longer here. */
  prune(present: ReadonlySet<string>): boolean {
    let changed = false;
    for (const project of this.projects) {
      for (const id of Object.keys(project.working)) if (!present.has(id)) { delete project.working[id]; changed = true; }
    }
    if (changed) this.save();
    return changed;
  }

  private save(): void {
    if (!this.persist) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.projects)); } catch { /* Quota or private mode: the board still works in memory. */ }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? JSON.parse(raw) as GroupProject[] : [];
      this.projects = Array.isArray(list) ? list.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string').slice(0, MAX_PROJECTS)
        .map((p) => ({ ...p, working: {}, tasks: Array.isArray(p.tasks) ? p.tasks : [] })) : [];
    } catch { this.projects = []; }
  }
}

function text(value: unknown, max: number): string { return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max); }
function who(me: Who): { name: string; color: string } {
  return { name: text(me.name, 32) || 'Alguien', color: /^#[0-9a-fA-F]{6}$/.test(me.color) ? me.color : '#7c8a7a' };
}
```

### app/src/ui/projects-ui.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `402bd8780c48e72bb9e76ccf30316c6ffcd4209f1bcd11a7dee59ef5bc9664f5`.

```ts
import {
  gitCloneCommand, openExternal, parseLiveShareUrl, repoLabel, vscodeCloneLink, vscodeWebLink,
  type GroupProject, type ProjectsAction, type ProjectsView,
} from '../projects/group-projects';
import { monoIcon } from './pixel-icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function btn(label: string, className = 'pj-btn'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

export interface ProjectsPanelContext {
  send(action: ProjectsAction): void;
  close(): void;
  notify(message: string): void;
  me(): { id: string; name: string; color: string; online: boolean; isHost: boolean };
}

/**
 * The group's project board. Code is written in VS Code; this is where the
 * group finds the repository, joins whoever is sharing a Live Share session,
 * sees who is working and keeps a short to-do list.
 */
export class ProjectsPanel {
  readonly root = el('section', 'pj');
  private view: ProjectsView | null = null;
  private selected: string | null = null;
  private mode: 'view' | 'create' | 'edit' = 'view';
  private errorText = '';
  /** A create or edit was sent; the next answer from the board closes the form. */
  private awaiting: 'create' | 'edit' | null = null;

  constructor(private readonly ctx: ProjectsPanelContext) {
    this.root.setAttribute('aria-label', 'Proyectos en VS Code');
  }

  mount(container: HTMLElement): void { container.replaceChildren(this.root); this.render(); }
  unmount(): void { this.root.remove(); }

  update(view: ProjectsView | null, error: string | null): void {
    if (view) {
      this.view = view;
      if (this.awaiting && !error) {
        if (this.awaiting === 'create') this.selected = view.projects[0]?.id ?? null;
        this.mode = 'view';
      }
      if (!this.selected || !view.projects.some((p) => p.id === this.selected)) this.selected = view.projects[0]?.id ?? null;
    }
    if (error || view) this.awaiting = null;
    this.errorText = error ?? '';
    // Someone else's change must not wipe what you are typing.
    const typing = this.root.contains(document.activeElement)
      && (document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement);
    if (!typing) this.render();
  }

  private render(): void {
    this.root.replaceChildren();
    const me = this.ctx.me();
    const head = el('header', 'pj-head');
    const titles = el('div');
    titles.append(el('h2', '', 'Proyectos del grupo'), el('p', '', me.online
      ? 'Compartidos con la aldea. El código se escribe en VS Code; aquí os coordináis.'
      : 'Sin conexión: se guardan en este equipo. Al abrir tu aldea los verá todo el grupo.'));
    const close = btn('', 'pj-icon-btn');
    close.append(monoIcon('close', 12));
    close.setAttribute('aria-label', 'Cerrar');
    close.dataset.testid = 'expansion-modal-close';
    close.addEventListener('click', () => this.ctx.close());
    head.append(el('span', 'pj-logo'), titles, close);
    head.querySelector('.pj-logo')!.append(monoIcon('code', 20));
    this.root.append(head);

    const body = el('div', 'pj-body');
    body.append(this.list(), this.detail());
    this.root.append(body);
  }

  private list(): HTMLElement {
    const side = el('aside', 'pj-list');
    const create = btn('', 'pj-btn pj-btn-primary pj-new');
    create.append(monoIcon('plus', 10), el('span', '', 'Nuevo proyecto'));
    create.addEventListener('click', () => { this.mode = 'create'; this.errorText = ''; this.render(); });
    side.append(create);
    const projects = this.view?.projects ?? [];
    if (!this.view) side.append(el('p', 'pj-muted', 'Cargando…'));
    for (const p of projects) {
      const row = btn('', 'pj-row');
      row.classList.toggle('is-active', p.id === this.selected && this.mode !== 'create');
      const top = el('span', 'pj-row-top');
      top.append(el('strong', '', p.name));
      if (p.liveShareUrl) top.append(el('span', 'pj-live', 'En vivo'));
      row.append(top, el('span', 'pj-row-sub', p.repoUrl ? repoLabel(p.repoUrl) : 'Sin repositorio'));
      const people = Object.values(p.working);
      if (people.length) row.append(this.faces(people));
      row.addEventListener('click', () => { this.selected = p.id; this.mode = 'view'; this.errorText = ''; this.render(); });
      side.append(row);
    }
    return side;
  }

  private faces(people: { name: string; color: string }[]): HTMLElement {
    const wrap = el('span', 'pj-faces');
    for (const person of people.slice(0, 5)) {
      const face = el('span', 'pj-face', person.name.slice(0, 1).toUpperCase());
      face.style.backgroundColor = person.color;
      face.title = person.name;
      wrap.append(face);
    }
    if (people.length > 5) wrap.append(el('span', 'pj-face is-more', `+${people.length - 5}`));
    return wrap;
  }

  private detail(): HTMLElement {
    const main = el('div', 'pj-detail');
    const project = this.view?.projects.find((p) => p.id === this.selected) ?? null;
    if (this.mode === 'create' || (this.mode === 'edit' && project)) {
      main.append(this.form(this.mode === 'edit' ? project : null));
      return main;
    }
    if (!project) {
      main.append(this.onboarding());
      return main;
    }
    const me = this.ctx.me();
    const title = el('div', 'pj-title-row');
    title.append(el('h3', '', project.name));
    const edit = btn('Editar', 'pj-btn pj-btn-quiet');
    edit.addEventListener('click', () => { this.mode = 'edit'; this.render(); });
    title.append(edit);
    main.append(title);
    if (project.description) main.append(el('p', 'pj-desc', project.description));
    main.append(el('p', 'pj-muted', `Creado por ${project.ownerName}`));
    if (this.errorText) main.append(el('p', 'pj-error', this.errorText));

    // Live Share: the heart of working together right now.
    const live = el('section', 'pj-section pj-live-box');
    if (project.liveShareUrl) {
      live.classList.add('is-live');
      live.append(el('h4', '', `Sesión en vivo de ${project.liveShareBy ?? 'alguien'}`),
        el('p', 'pj-muted', 'Entra para editar los mismos archivos a la vez, con cursores y terminal compartidos.'));
      const row = el('div', 'pj-actions');
      const join = btn('Unirme en VS Code', 'pj-btn pj-btn-primary');
      join.addEventListener('click', () => {
        if (!project.working[me.id]) this.ctx.send({ kind: 'working', id: project.id, on: true, me });
        this.open(project.liveShareUrl!);
      });
      const end = btn('Terminar sesión', 'pj-btn pj-btn-quiet');
      end.addEventListener('click', () => this.ctx.send({ kind: 'end_live_share', id: project.id }));
      row.append(join, end);
      live.append(row);
    } else {
      live.append(el('h4', '', 'Programad juntos con Live Share'));
      const steps = el('ol', 'pj-steps');
      for (const step of [
        'En VS Code, instala la extensión «Live Share» de Microsoft.',
        'Abre el proyecto y pulsa «Live Share» en la barra inferior. El enlace se copia solo.',
        'Pégalo aquí: todo el grupo verá un botón para unirse.',
      ]) steps.append(el('li', '', step));
      const form = el('form', 'pj-inline-form');
      const input = el('input', 'pj-input');
      input.placeholder = 'https://prod.liveshare.vsengsaas.visualstudio.com/join?…';
      input.setAttribute('aria-label', 'Enlace de Live Share');
      const share = btn('Compartir sesión', 'pj-btn pj-btn-primary');
      share.type = 'submit';
      form.append(input, share);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!parseLiveShareUrl(input.value)) { this.errorText = 'Ese no parece un enlace de Live Share. Cópialo desde VS Code (empieza por https://prod.liveshare…).'; this.render(); return; }
        this.ctx.send({ kind: 'live_share', id: project.id, url: input.value, me });
      });
      live.append(steps, form);
    }
    main.append(live);

    // Repository: open it in the real editor.
    const repo = el('section', 'pj-section');
    repo.append(el('h4', '', 'Repositorio'));
    if (project.repoUrl) {
      const url = project.repoUrl;
      const link = el('code', 'pj-repo', repoLabel(url));
      const row = el('div', 'pj-actions');
      const clone = btn('Clonar en VS Code', 'pj-btn');
      clone.title = 'Abre VS Code y te pregunta dónde guardar la copia';
      clone.addEventListener('click', () => this.open(vscodeCloneLink(url)));
      row.append(clone);
      const web = vscodeWebLink(url);
      if (web) {
        const webBtn = btn('Abrir en vscode.dev', 'pj-btn');
        webBtn.title = 'VS Code en el navegador, sin instalar nada';
        webBtn.addEventListener('click', () => this.open(web));
        row.append(webBtn);
      }
      const copy = btn('Copiar «git clone»', 'pj-btn pj-btn-quiet');
      copy.addEventListener('click', () => {
        void navigator.clipboard?.writeText(gitCloneCommand(url)).then(
          () => this.ctx.notify('Comando copiado. Pégalo en una terminal.'),
          () => this.ctx.notify(gitCloneCommand(url)),
        );
      });
      row.append(copy);
      repo.append(link, row);
    } else {
      repo.append(el('p', 'pj-muted', 'Añade la dirección del repositorio (GitHub, GitLab…) para que cualquiera pueda clonarlo con un clic.'));
      const add = btn('Añadir repositorio', 'pj-btn');
      add.addEventListener('click', () => { this.mode = 'edit'; this.render(); });
      repo.append(add);
    }
    main.append(repo);

    // Who is on it.
    const people = el('section', 'pj-section');
    people.append(el('h4', '', 'Trabajando ahora'));
    const working = Object.entries(project.working);
    if (working.length) {
      const chips = el('div', 'pj-chips');
      for (const [, person] of working) {
        const chip = el('span', 'pj-chip');
        const dot = el('span', 'pj-face', person.name.slice(0, 1).toUpperCase());
        dot.style.backgroundColor = person.color;
        chip.append(dot, el('span', '', person.name));
        chips.append(chip);
      }
      people.append(chips);
    } else people.append(el('p', 'pj-muted', 'Nadie todavía.'));
    const imIn = !!project.working[me.id];
    const toggle = btn(imIn ? 'Ya no estoy en ello' : 'Estoy trabajando en esto', imIn ? 'pj-btn pj-btn-quiet' : 'pj-btn');
    toggle.addEventListener('click', () => this.ctx.send({ kind: 'working', id: project.id, on: !imIn, me }));
    people.append(toggle);
    main.append(people);

    main.append(this.tasks(project));
    return main;
  }

  private tasks(project: GroupProject): HTMLElement {
    const me = this.ctx.me();
    const section = el('section', 'pj-section');
    const done = project.tasks.filter((t) => t.done).length;
    section.append(el('h4', '', project.tasks.length ? `Tareas · ${done}/${project.tasks.length}` : 'Tareas'));
    const list = el('ul', 'pj-tasks');
    for (const task of project.tasks) {
      const li = el('li', task.done ? 'is-done' : '');
      const label = el('label');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = task.done;
      box.addEventListener('change', () => this.ctx.send({ kind: 'toggle_task', id: project.id, taskId: task.id, me }));
      label.append(box, el('span', '', task.text));
      li.append(label);
      if (task.done && task.by) li.append(el('small', 'pj-muted', task.by));
      const remove = btn('', 'pj-icon-btn');
      remove.append(monoIcon('trash', 11));
      remove.setAttribute('aria-label', `Borrar tarea ${task.text}`);
      remove.addEventListener('click', () => this.ctx.send({ kind: 'remove_task', id: project.id, taskId: task.id }));
      li.append(remove);
      list.append(li);
    }
    const form = el('form', 'pj-inline-form');
    const input = el('input', 'pj-input');
    input.placeholder = 'Nueva tarea, p. ej. «Hacer la pantalla de inicio»';
    input.maxLength = 140;
    input.setAttribute('aria-label', 'Nueva tarea');
    const add = btn('Añadir', 'pj-btn');
    add.type = 'submit';
    form.append(input, add);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      this.ctx.send({ kind: 'add_task', id: project.id, text: input.value });
      input.value = '';
    });
    section.append(list, form);
    return section;
  }

  private form(project: GroupProject | null): HTMLElement {
    const form = el('form', 'pj-form');
    form.append(el('h3', '', project ? 'Editar proyecto' : 'Nuevo proyecto'));
    const name = el('input', 'pj-input');
    name.required = true;
    name.maxLength = 60;
    name.value = project?.name ?? '';
    name.placeholder = 'Proyecto final de Programación';
    const description = el('textarea', 'pj-input');
    description.maxLength = 280;
    description.rows = 3;
    description.value = project?.description ?? '';
    description.placeholder = 'Qué estáis construyendo y para cuándo.';
    const repo = el('input', 'pj-input');
    repo.value = project?.repoUrl ?? '';
    repo.placeholder = 'https://github.com/usuario/proyecto';
    const field = (label: string, control: HTMLElement, hint = '') => {
      const wrap = el('label', 'pj-field');
      wrap.append(el('span', '', label), control);
      if (hint) wrap.append(el('small', 'pj-muted', hint));
      return wrap;
    };
    form.append(field('Nombre', name), field('Descripción', description),
      field('Repositorio (opcional)', repo, 'Dirección https de GitHub, GitLab, Bitbucket u otro servidor git.'));
    if (this.errorText) form.append(el('p', 'pj-error', this.errorText));
    const actions = el('div', 'pj-actions');
    const save = btn(project ? 'Guardar' : 'Crear proyecto', 'pj-btn pj-btn-primary');
    save.type = 'submit';
    const cancel = btn('Cancelar', 'pj-btn pj-btn-quiet');
    cancel.addEventListener('click', () => { this.mode = 'view'; this.errorText = ''; this.render(); });
    actions.append(save, cancel);
    if (project && project.ownerId === this.ctx.me().id) {
      const del = btn('Borrar proyecto', 'pj-btn pj-btn-danger');
      del.addEventListener('click', () => {
        if (del.dataset.armed) { this.ctx.send({ kind: 'delete', id: project.id }); return; }
        del.dataset.armed = '1';
        del.textContent = '¿Seguro? Pulsa otra vez';
        setTimeout(() => { delete del.dataset.armed; del.textContent = 'Borrar proyecto'; }, 3_000);
      });
      actions.append(del);
    }
    form.append(actions);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const me = this.ctx.me();
      this.awaiting = project ? 'edit' : 'create';
      if (project) this.ctx.send({ kind: 'edit', id: project.id, name: name.value, description: description.value, repoUrl: repo.value });
      else this.ctx.send({ kind: 'create', name: name.value, description: description.value, repoUrl: repo.value, me });
    });
    queueMicrotask(() => name.focus());
    return form;
  }

  private onboarding(): HTMLElement {
    const box = el('div', 'pj-onboarding');
    const art = el('span', 'pj-logo is-big');
    art.append(monoIcon('code', 36));
    box.append(art, el('h3', '', 'Trabajad juntos en VS Code'),
      el('p', '', 'Crea un proyecto para el grupo: enlaza el repositorio, comparte tu sesión de Live Share y repartid las tareas. Todos lo verán desde la aldea.'));
    const create = btn('Crear el primer proyecto', 'pj-btn pj-btn-primary');
    create.addEventListener('click', () => { this.mode = 'create'; this.render(); });
    box.append(create);
    return box;
  }

  private open(url: string): void {
    openExternal(url).catch((error: unknown) => this.ctx.notify(error instanceof Error ? error.message : 'No se pudo abrir el enlace.'));
  }
}
```

### app/src/world/environment.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `000cc16e8630c901e098a36672e97b803d4eecb92869d04a9800c25270ea0d05`.

```ts
import { z } from 'zod';
import { reducedMotion } from '../ui/art';

/**
 * Part 7 — Environmental Events & Atmosphere
 *
 * Implements a synchronized Day/Night cycle (`morning`, `afternoon`, `sunset`,
 * `evening`, `night`) and Weather system (`clear`, `cloudy`, `light_rain`,
 * `heavy_rain`, `fog`, `autumn_leaves`) with local particle rendering,
 * warm window/lamp lighting, WebAudio ambient synthesis, and accessibility controls.
 */

export type TimeOfDay = 'morning' | 'afternoon' | 'sunset' | 'evening' | 'night';
export type WeatherKind = 'clear' | 'cloudy' | 'light_rain' | 'heavy_rain' | 'fog' | 'autumn_leaves';
export type ParticleQuality = 'off' | 'low' | 'medium' | 'high';

export interface EnvironmentState {
  timeOfDay: TimeOfDay;
  cycleMode: 'manual' | 'auto';
  /** Progress 0..1 within the full day cycle when auto mode is enabled */
  cycleProgress: number;
  /** Full day duration in seconds (default 300s = 5 minutes) */
  cycleDurationSeconds: number;
  weather: WeatherKind;
  weatherAutoChange: boolean;
  ambientAudioEnabled: boolean;
  ambientVolume: number;
  ambientSound: 'weather' | 'rain' | 'wind' | 'brown_noise';
  particleQuality: ParticleQuality;
  revision: number;
}

export const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: '🌅 Mañana clara',
  afternoon: '☀️ Tarde soleada',
  sunset: '🌇 Atardecer dorado',
  evening: '🌆 Crepúsculo',
  night: '🌙 Noche estrellada',
};

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  clear: '☀️ Despejado',
  cloudy: '☁️ Nublado suave',
  light_rain: '🌦️ Lluvia ligera',
  heavy_rain: '🌧️ Lluvia intensa',
  fog: '🌫️ Niebla de bosque',
  autumn_leaves: '🍂 Brisa de hojas',
};

export const environmentStateSchema = z.object({
  timeOfDay: z.enum(['morning', 'afternoon', 'sunset', 'evening', 'night']),
  cycleMode: z.enum(['manual', 'auto']),
  cycleProgress: z.number().min(0).max(1),
  cycleDurationSeconds: z.number().min(30).max(3600),
  weather: z.enum(['clear', 'cloudy', 'light_rain', 'heavy_rain', 'fog', 'autumn_leaves']),
  weatherAutoChange: z.boolean(),
  ambientAudioEnabled: z.boolean(),
  ambientVolume: z.number().min(0).max(1),
  ambientSound: z.enum(['weather', 'rain', 'wind', 'brown_noise']).default('weather'),
  particleQuality: z.enum(['off', 'low', 'medium', 'high']),
  revision: z.number().int().nonnegative(),
});

export interface LightingProfile {
  overlayColor: string;
  overlayAlpha: number;
  lampIntensity: number;
  windowWarmth: number;
  starAlpha: number;
  shadowStrength: number;
}

export function getLightingProfile(timeOfDay: TimeOfDay, weather: WeatherKind): LightingProfile {
  const base: Record<TimeOfDay, LightingProfile> = {
    morning: {
      overlayColor: '255, 232, 188',
      overlayAlpha: 0.06,
      lampIntensity: 0.15,
      windowWarmth: 0.45,
      starAlpha: 0,
      shadowStrength: 0.28,
    },
    afternoon: {
      overlayColor: '255, 248, 225',
      overlayAlpha: 0.0,
      lampIntensity: 0.1,
      windowWarmth: 0.35,
      starAlpha: 0,
      shadowStrength: 0.34,
    },
    sunset: {
      overlayColor: '235, 118, 68',
      overlayAlpha: 0.18,
      lampIntensity: 0.72,
      windowWarmth: 0.85,
      starAlpha: 0.2,
      shadowStrength: 0.3,
    },
    evening: {
      overlayColor: '38, 52, 88',
      overlayAlpha: 0.32,
      lampIntensity: 0.92,
      windowWarmth: 0.95,
      starAlpha: 0.65,
      shadowStrength: 0.24,
    },
    night: {
      overlayColor: '14, 24, 46',
      overlayAlpha: 0.46,
      lampIntensity: 1.0,
      windowWarmth: 1.0,
      starAlpha: 0.95,
      shadowStrength: 0.2,
    },
  };

  const profile = { ...base[timeOfDay] };
  if (weather === 'cloudy') {
    profile.overlayAlpha = Math.min(0.52, profile.overlayAlpha + 0.07);
    profile.shadowStrength *= 0.75;
  } else if (weather === 'light_rain') {
    profile.overlayColor = timeOfDay === 'night' ? '14, 26, 48' : '46, 68, 86';
    profile.overlayAlpha = Math.min(0.54, profile.overlayAlpha + 0.12);
    profile.lampIntensity = Math.max(profile.lampIntensity, 0.65);
  } else if (weather === 'heavy_rain') {
    profile.overlayColor = '24, 38, 56';
    profile.overlayAlpha = Math.min(0.58, profile.overlayAlpha + 0.18);
    profile.lampIntensity = Math.max(profile.lampIntensity, 0.85);
    profile.windowWarmth = Math.max(profile.windowWarmth, 0.9);
  } else if (weather === 'fog') {
    profile.overlayAlpha = Math.min(0.5, profile.overlayAlpha + 0.08);
  }
  return profile;
}

export function progressToTimeOfDay(progress: number): TimeOfDay {
  const p = ((progress % 1) + 1) % 1;
  if (p < 0.22) return 'morning';
  if (p < 0.5) return 'afternoon';
  if (p < 0.66) return 'sunset';
  if (p < 0.82) return 'evening';
  return 'night';
}

interface WeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
  color: string;
}

export class EnvironmentController {
  private state: EnvironmentState = {
    timeOfDay: 'afternoon',
    cycleMode: 'manual',
    cycleProgress: 0.35,
    cycleDurationSeconds: 240,
    weather: 'clear',
    weatherAutoChange: false,
    ambientAudioEnabled: false,
    ambientVolume: 0.35,
    ambientSound: 'weather',
    particleQuality: 'medium',
    revision: 1,
  };

  private particles: WeatherParticle[] = [];
  private audioCtx: AudioContext | null = null;
  private noiseNode: AudioNode | null = null;
  private gainNode: GainNode | null = null;
  private listeners = new Set<(state: EnvironmentState) => void>();

  constructor() {
    try {
      const raw = localStorage.getItem('studyvillage-environment-v1');
      if (raw) {
        const parsed = environmentStateSchema.safeParse(JSON.parse(raw));
        if (parsed.success) this.state = parsed.data;
      }
    } catch { /* Use defaults when storage is unavailable. */ }
  }

  getState(): EnvironmentState {
    return { ...this.state };
  }

  subscribe(listener: (state: EnvironmentState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  update(patch: Partial<EnvironmentState>, bumpRevision = true): EnvironmentState {
    const next: EnvironmentState = {
      ...this.state,
      ...patch,
      revision: bumpRevision ? this.state.revision + 1 : (patch.revision ?? this.state.revision),
    };
    if (patch.cycleProgress !== undefined && next.cycleMode === 'auto') {
      next.timeOfDay = progressToTimeOfDay(next.cycleProgress);
    }
    const parsed = environmentStateSchema.safeParse(next);
    if (!parsed.success) return this.state;
    const weatherChanged = parsed.data.weather !== this.state.weather || parsed.data.particleQuality !== this.state.particleQuality;
    const soundChanged = parsed.data.ambientSound !== this.state.ambientSound;
    this.state = parsed.data;
    try { localStorage.setItem('studyvillage-environment-v1', JSON.stringify(this.state)); } catch { /* Storage may be unavailable. */ }
    if (soundChanged && this.audioCtx) { void this.audioCtx.close(); this.audioCtx = null; this.gainNode = null; this.noiseNode = null; }
    if (weatherChanged) {
      this.rebuildParticles();
    }
    this.syncAmbientAudio();
    for (const listener of this.listeners) listener(this.getState());
    return this.getState();
  }

  applyRemoteState(raw: unknown): EnvironmentState {
    const parsed = environmentStateSchema.safeParse(raw);
    if (!parsed.success) return this.state;
    if (parsed.data.revision < this.state.revision) return this.state;
    return this.update(
      {
        timeOfDay: parsed.data.timeOfDay,
        cycleMode: parsed.data.cycleMode,
        cycleProgress: parsed.data.cycleProgress,
        cycleDurationSeconds: parsed.data.cycleDurationSeconds,
        weather: parsed.data.weather,
        weatherAutoChange: parsed.data.weatherAutoChange,
        revision: parsed.data.revision,
      },
      false,
    );
  }

  tick(dtSeconds: number): boolean {
    if (dtSeconds <= 0) return false;
    let changed = false;
    if (this.state.cycleMode === 'auto' && !reducedMotion()) {
      const nextProgress = (this.state.cycleProgress + dtSeconds / Math.max(30, this.state.cycleDurationSeconds)) % 1;
      const nextTod = progressToTimeOfDay(nextProgress);
      this.state.cycleProgress = nextProgress;
      if (nextTod !== this.state.timeOfDay) {
        this.state.timeOfDay = nextTod;
        changed = true;
        for (const listener of this.listeners) listener(this.getState());
      }
    }
    this.stepParticles(dtSeconds);
    return changed;
  }

  private rebuildParticles(): void {
    this.particles = [];
    if (this.state.particleQuality === 'off' || reducedMotion()) return;
    const mult = this.state.particleQuality === 'low' ? 0.45 : this.state.particleQuality === 'high' ? 1.35 : 1.0;

    let count = 0;
    if (this.state.weather === 'light_rain') count = Math.round(42 * mult);
    else if (this.state.weather === 'heavy_rain') count = Math.round(95 * mult);
    else if (this.state.weather === 'autumn_leaves') count = Math.round(26 * mult);
    else if (this.state.weather === 'fog') count = Math.round(14 * mult);
    else if (this.state.weather === 'cloudy') count = Math.round(8 * mult);

    const leafColors = ['#d97941', '#e6a145', '#b85332', '#c88a3b'];
    for (let i = 0; i < count; i++) {
      const seedA = ((i * 97 + 31) % 100) / 100;
      const seedB = ((i * 53 + 17) % 100) / 100;
      if (this.state.weather === 'light_rain' || this.state.weather === 'heavy_rain') {
        const heavy = this.state.weather === 'heavy_rain';
        this.particles.push({
          x: seedA * 768,
          y: seedB * 432,
          vx: heavy ? -48 : -24,
          vy: heavy ? 310 + seedA * 80 : 210 + seedA * 50,
          size: heavy ? 11 : 7,
          alpha: heavy ? 0.52 : 0.38,
          phase: seedA * Math.PI * 2,
          color: 'rgba(185, 220, 245, 0.72)',
        });
      } else if (this.state.weather === 'autumn_leaves') {
        this.particles.push({
          x: seedA * 768,
          y: seedB * 432,
          vx: 22 + seedA * 18,
          vy: 28 + seedB * 20,
          size: 4,
          alpha: 0.85,
          phase: seedA * Math.PI * 2,
          color: leafColors[i % leafColors.length],
        });
      } else if (this.state.weather === 'fog' || this.state.weather === 'cloudy') {
        this.particles.push({
          x: seedA * 768,
          y: 40 + seedB * 330,
          vx: 8 + seedA * 6,
          vy: 0,
          size: 90 + seedB * 70,
          alpha: this.state.weather === 'fog' ? 0.14 : 0.08,
          phase: seedA * Math.PI * 2,
          color: 'rgba(226, 238, 232, 1)',
        });
      }
    }
  }

  private stepParticles(dt: number): void {
    if (this.state.particleQuality === 'off' || reducedMotion()) return;
    if (this.particles.length === 0 && this.state.weather !== 'clear') {
      this.rebuildParticles();
    }
    for (const p of this.particles) {
      p.phase += dt * 2.2;
      if (this.state.weather === 'autumn_leaves') {
        p.x += (p.vx + Math.sin(p.phase) * 14) * dt;
        p.y += p.vy * dt;
      } else {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
      if (p.y > 440) {
        p.y = -10;
        p.x = (p.x + 137) % 768;
      }
      if (p.x > 790) p.x = -20;
      if (p.x < -30) p.x = 780;
    }
  }

  /**
   * Renders the synchronized Day/Night lighting tint, stars/fireflies at night,
   * and weather particles onto a 768x432 world/area canvas.
   */
  drawAtmosphere(
    ctx: CanvasRenderingContext2D,
    w = 768,
    h = 432,
    lampPositions: readonly { x: number; y: number }[] = [],
    isInterior = false,
  ): void {
    const profile = getLightingProfile(this.state.timeOfDay, this.state.weather);

    // 1. Weather particles (outdoor scenes only)
    if (!isInterior && this.state.particleQuality !== 'off' && !reducedMotion()) {
      ctx.save();
      if (this.state.weather === 'light_rain' || this.state.weather === 'heavy_rain') {
        ctx.strokeStyle = 'rgba(186, 222, 248, 0.58)';
        ctx.lineWidth = this.state.weather === 'heavy_rain' ? 1.6 : 1.2;
        ctx.beginPath();
        for (const p of this.particles) {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 0.035, p.y + p.size);
        }
        ctx.stroke();
      } else if (this.state.weather === 'autumn_leaves') {
        for (const p of this.particles) {
          ctx.fillStyle = p.color;
          ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size - 1);
        }
      } else if (this.state.weather === 'fog' || this.state.weather === 'cloudy') {
        for (const p of this.particles) {
          ctx.fillStyle = `rgba(224, 236, 232, ${p.alpha})`;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.size, p.size * 0.34, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // 2. Day/Night global color grade
    const effectiveAlpha = isInterior ? profile.overlayAlpha * 0.45 : profile.overlayAlpha;
    if (effectiveAlpha > 0.01) {
      ctx.save();
      ctx.fillStyle = `rgba(${profile.overlayColor}, ${effectiveAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    // 3. Warm lamp halos during sunset/evening/night or rain
    if (profile.lampIntensity > 0.25 && lampPositions.length > 0) {
      ctx.save();
      for (const lamp of lampPositions) {
        const radius = 58 * profile.lampIntensity;
        const grad = ctx.createRadialGradient(lamp.x, lamp.y, 2, lamp.x, lamp.y, radius);
        grad.addColorStop(0, `rgba(255, 218, 138, ${(0.42 * profile.lampIntensity).toFixed(3)})`);
        grad.addColorStop(0.55, `rgba(255, 192, 102, ${(0.16 * profile.lampIntensity).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(255, 192, 102, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lamp.x, lamp.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 4. Night fireflies / stars in outdoor areas
    if (!isInterior && profile.starAlpha > 0.2 && !reducedMotion()) {
      ctx.save();
      const now = performance.now() / 1000;
      for (let i = 0; i < 12; i++) {
        const fx = ((i * 67 + 43) % 720) + 24 + Math.sin(now * 0.9 + i) * 6;
        const fy = ((i * 89 + 29) % 360) + 32 + Math.cos(now * 1.1 + i * 2) * 5;
        const glow = (0.35 + 0.35 * Math.sin(now * 2.3 + i * 1.7)) * profile.starAlpha;
        ctx.fillStyle = `rgba(255, 240, 165, ${glow.toFixed(3)})`;
        ctx.fillRect(Math.round(fx), Math.round(fy), 3, 3);
      }
      ctx.restore();
    }
  }

  /**
   * Synthesizes gentle pink/brown noise for rain or forest breeze using the
   * browser's native WebAudio API — zero external audio file dependencies.
   */
  private syncAmbientAudio(): void {
    if (typeof window === 'undefined') return;
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;

    if (!this.state.ambientAudioEnabled || this.state.ambientVolume <= 0.01) {
      if (this.gainNode && this.audioCtx) {
        this.gainNode.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.15);
      }
      return;
    }

    try {
      if (!this.audioCtx) {
        this.audioCtx = new AudioContextCtor();
        const bufferSize = this.audioCtx.sampleRate * 2;
        const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
        const output = buffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          b0 = 0.997 * b0 + white * 0.029;
          b1 = 0.985 * b1 + white * 0.032;
          b2 = 0.950 * b2 + white * 0.048;
          output[i] = (b0 + b1 + b2) * 0.35;
        }
        const source = this.audioCtx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = this.audioCtx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = { weather: 650, rain: 2400, wind: 450, brown_noise: 180 }[this.state.ambientSound];

        this.gainNode = this.audioCtx.createGain();
        this.gainNode.gain.value = 0;

        source.connect(filter);
        filter.connect(this.gainNode);
        this.gainNode.connect(this.audioCtx.destination);
        source.start();
        this.noiseNode = source;
      }

      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {});
      }

      if (this.gainNode) {
        const weatherFactor = this.state.ambientSound !== 'weather' ? 0.18 :
          this.state.weather === 'heavy_rain'
            ? 0.25
            : this.state.weather === 'light_rain'
              ? 0.15
              : this.state.weather === 'autumn_leaves'
                ? 0.08
                : 0.04;
        this.gainNode.gain.setTargetAtTime(
          this.state.ambientVolume * weatherFactor,
          this.audioCtx.currentTime,
          0.25,
        );
      }
    } catch {
      // Ignore WebAudio autoplay restrictions in headless tests
    }
  }

  dispose(): void {
    try {
      this.noiseNode?.disconnect();
      void this.audioCtx?.close();
    } catch {
      // Ignore cleanup errors
    }
  }
}
```

### app/src/assets/avatar-sheet.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `caa381e416760c6777d418ce8e99b5b4989c2e31b2278dcdd169f380ee488fd7`.

```ts
/** Local PNG sheet: three animation columns, rows down/left/right/up. */
const KEY = 'studyvillage-avatar-sheet-v1';
let sheet: HTMLImageElement | null = null;
export function getAvatarSheet(): HTMLImageElement | null {
  return sheet?.complete && sheet.naturalWidth > 0 ? sheet : null;
}
export async function setAvatarSheet(data: string | null): Promise<void> {
  if (data === null) { localStorage.removeItem(KEY); sheet = null; return; }
  if (data.length > 700_000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)) throw new Error('Elige un PNG de hasta 512 KB.');
  const img = new Image();
  img.src = data;
  await img.decode();
  if (img.naturalWidth % 3 || img.naturalHeight % 4 || img.naturalWidth > 1536 || img.naturalHeight > 2048) {
    throw new Error('La cuadrícula debe tener 3 columnas y 4 filas iguales (máximo 1536 × 2048).');
  }
  localStorage.setItem(KEY, data);
  sheet = img;
}
export function loadAvatarSheet(): void {
  try { const data = localStorage.getItem(KEY); if (data) void setAvatarSheet(data).catch(() => {}); } catch { /* Keep the default avatar. */ }
}
```

### app/src/assets/custom-assets.ts

Archivo completo; conservar comportamiento y adaptar los imports de la base cuando sea necesario.

SHA-256 del bloque: `492620ceda38b6c7bfdd2552cfda9a754905f7b613c3b5bf70a8ee23bc76b02d`.

```ts
import type { FurnitureKind } from '../protocol/types';

export type HairStyle = 'short' | 'long' | 'curly' | 'beanie' | 'spiky';
export type AvatarAccessory = 'none' | 'glasses' | 'headphones' | 'hat';

export interface AvatarCustomization {
  hairStyle: HairStyle;
  hairColor: string;
  skinTone: string;
  accessory: AvatarAccessory;
}

export interface AssetPackManifest {
  schemaVersion: 1;
  name: string;
  author: string;
  license: string;
  avatar?: Partial<AvatarCustomization>;
  furnitureColors?: Partial<Record<FurnitureKind, string>>;
  furnitureSprites?: Partial<Record<FurnitureKind, string>>;
}

export const HAIR_STYLE_LABELS: Record<HairStyle, string> = {
  short: 'Corto clásico',
  long: 'Largo',
  curly: 'Rizado',
  beanie: 'Gorro de lana',
  spiky: 'Despeinado',
};

export const ACCESSORY_LABELS: Record<AvatarAccessory, string> = {
  none: 'Sin accesorio',
  glasses: 'Gafas de estudio',
  headphones: 'Auriculares',
  hat: 'Sombrero explorador',
};

export const SKIN_TONES = ['#f0c69a', '#e0ac7e', '#c98f63', '#9e6843', '#6e452b'] as const;
export const HAIR_COLORS = ['#2a2018', '#5a4530', '#a84a32', '#d9a441', '#3b6e8c', '#6c4b7d'] as const;

const STORAGE_KEY = 'studyvillage-custom-assets-v1';

const DEFAULT_AVATAR: AvatarCustomization = {
  hairStyle: 'short',
  hairColor: '#3f3124',
  skinTone: '#f0c69a',
  accessory: 'none',
};

let currentPack: AssetPackManifest = {
  schemaVersion: 1,
  name: 'Pack Base StudyVillage',
  author: 'Local',
  license: 'CC-BY-4.0',
  avatar: { ...DEFAULT_AVATAR },
  furnitureColors: {},
  furnitureSprites: {},
};

const decodedSprites = new Map<FurnitureKind, HTMLImageElement>();

function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
}

function isSafeDataImage(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 524_288
    && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
}

function refreshDecodedSprites(): void {
  decodedSprites.clear();
  if (typeof Image === 'undefined') return;
  const sprites = currentPack.furnitureSprites ?? {};
  for (const [kind, dataUrl] of Object.entries(sprites) as [FurnitureKind, string | undefined][]) {
    if (!dataUrl || !isSafeDataImage(dataUrl)) continue;
    const img = new Image();
    img.src = dataUrl;
    decodedSprites.set(kind, img);
  }
}

export function loadCustomAssets(): AssetPackManifest {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = validateAssetPack(JSON.parse(raw));
        currentPack = parsed;
        refreshDecodedSprites();
      }
    }
  } catch {
    // Keep defaults if localStorage is unavailable or corrupted.
  }
  return currentPack;
}

export function saveCustomAssets(pack: AssetPackManifest): AssetPackManifest {
  currentPack = validateAssetPack(pack);
  refreshDecodedSprites();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentPack));
    }
  } catch {
    // Ignore quota errors in restricted environments.
  }
  return currentPack;
}

export function getAvatarCustomization(): AvatarCustomization {
  return {
    hairStyle: currentPack.avatar?.hairStyle ?? DEFAULT_AVATAR.hairStyle,
    hairColor: isHexColor(currentPack.avatar?.hairColor) ? currentPack.avatar!.hairColor! : DEFAULT_AVATAR.hairColor,
    skinTone: isHexColor(currentPack.avatar?.skinTone) ? currentPack.avatar!.skinTone! : DEFAULT_AVATAR.skinTone,
    accessory: currentPack.avatar?.accessory ?? DEFAULT_AVATAR.accessory,
  };
}

export function updateAvatarCustomization(patch: Partial<AvatarCustomization>): AvatarCustomization {
  const next: AvatarCustomization = { ...getAvatarCustomization(), ...patch };
  saveCustomAssets({ ...currentPack, avatar: next });
  return next;
}

export function getFurnitureCustomColor(kind: FurnitureKind): string | null {
  const color = currentPack.furnitureColors?.[kind];
  return isHexColor(color) ? color : null;
}

export function setFurnitureCustomColor(kind: FurnitureKind, color: string | null): void {
  const nextColors = { ...(currentPack.furnitureColors ?? {}) };
  if (color && isHexColor(color)) nextColors[kind] = color;
  else delete nextColors[kind];
  saveCustomAssets({ ...currentPack, furnitureColors: nextColors });
}

export function getFurnitureCustomSprite(kind: FurnitureKind): HTMLImageElement | null {
  const img = decodedSprites.get(kind);
  if (img && img.complete && img.naturalWidth > 0) return img;
  return null;
}

export function setFurnitureCustomSpriteData(kind: FurnitureKind, dataUrl: string | null): void {
  const nextSprites = { ...(currentPack.furnitureSprites ?? {}) };
  if (dataUrl && isSafeDataImage(dataUrl)) nextSprites[kind] = dataUrl;
  else delete nextSprites[kind];
  saveCustomAssets({ ...currentPack, furnitureSprites: nextSprites });
}

export function resetCustomAssets(): AssetPackManifest {
  return saveCustomAssets({
    schemaVersion: 1,
    name: 'Pack Base StudyVillage',
    author: 'Local',
    license: 'CC-BY-4.0',
    avatar: { ...DEFAULT_AVATAR },
    furnitureColors: {},
    furnitureSprites: {},
  });
}

/**
 * Validates an imported declarative Asset Pack JSON per Master Spec §13.
 * Rejects executable code, path traversal, or oversized sprites.
 */
export function validateAssetPack(raw: unknown): AssetPackManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('El pack de assets debe ser un objeto JSON válido.');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== 1) {
    throw new Error('Versión de pack no compatible (se requiere schemaVersion: 1).');
  }
  // Reject any suspicious executable keys per §13 security rules
  for (const forbidden of ['script', 'scripts', 'code', 'exec', 'command', 'shell', 'plugin', 'wasm', 'dll']) {
    if (forbidden in obj) {
      throw new Error(`El pack contiene campos ejecutables no permitidos (${forbidden}).`);
    }
  }
  const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim().slice(0, 64) : 'Pack Personalizado';
  const author = typeof obj.author === 'string' && obj.author.trim() ? obj.author.trim().slice(0, 48) : 'Comunidad';
  const license = typeof obj.license === 'string' && obj.license.trim() ? obj.license.trim().slice(0, 32) : 'CC-BY-4.0';

  const validHair: HairStyle[] = ['short', 'long', 'curly', 'beanie', 'spiky'];
  const validAcc: AvatarAccessory[] = ['none', 'glasses', 'headphones', 'hat'];
  const rawAvatar = (obj.avatar && typeof obj.avatar === 'object' ? obj.avatar : {}) as Record<string, unknown>;
  const avatar: AvatarCustomization = {
    hairStyle: validHair.includes(rawAvatar.hairStyle as HairStyle) ? (rawAvatar.hairStyle as HairStyle) : DEFAULT_AVATAR.hairStyle,
    hairColor: isHexColor(rawAvatar.hairColor) ? rawAvatar.hairColor : DEFAULT_AVATAR.hairColor,
    skinTone: isHexColor(rawAvatar.skinTone) ? rawAvatar.skinTone : DEFAULT_AVATAR.skinTone,
    accessory: validAcc.includes(rawAvatar.accessory as AvatarAccessory) ? (rawAvatar.accessory as AvatarAccessory) : DEFAULT_AVATAR.accessory,
  };

  const validKinds: FurnitureKind[] = ['desk', 'bookshelf', 'board', 'plant', 'table', 'frame', 'cabinet'];
  const furnitureColors: Partial<Record<FurnitureKind, string>> = {};
  if (obj.furnitureColors && typeof obj.furnitureColors === 'object') {
    for (const kind of validKinds) {
      const c = (obj.furnitureColors as Record<string, unknown>)[kind];
      if (isHexColor(c)) furnitureColors[kind] = c;
    }
  }

  const furnitureSprites: Partial<Record<FurnitureKind, string>> = {};
  if (obj.furnitureSprites && typeof obj.furnitureSprites === 'object') {
    for (const kind of validKinds) {
      const s = (obj.furnitureSprites as Record<string, unknown>)[kind];
      if (s !== undefined) {
        if (!isSafeDataImage(s)) {
          throw new Error(`El sprite para "${kind}" debe ser una imagen PNG/JPEG/WebP válida de hasta 512 KiB.`);
        }
        furnitureSprites[kind] = s;
      }
    }
  }

  return { schemaVersion: 1, name, author, license, avatar, furnitureColors, furnitureSprites };
}

export function exportAssetPackJson(name?: string): string {
  const pack = name ? { ...currentPack, name } : currentPack;
  return JSON.stringify(pack, null, 2);
}

export function importAssetPackJson(rawJson: string): { ok: boolean; message: string } {
  try {
    const parsed = JSON.parse(rawJson);
    const pack = saveCustomAssets(parsed);
    return { ok: true, message: `Pack «${pack.name}» importado correctamente.` };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'No se pudo importar el pack de assets.',
    };
  }
}

export const setAvatarCustomization = updateAvatarCustomization;
export const setFurnitureCustomSprite = setFurnitureCustomSpriteData;

// Initialize on module load
loadCustomAssets();
```

### app/src/minigames/room.ts

Infraestructura genérica reutilizada para proyectos. En esta fase sus canales permitidos son solo proyectos; su ubicación bajo minigames no activa ningún juego.

SHA-256 del bloque: `666ec655526b9a93558503681e69c9fe254a4ee001e40424c5c22e43808b88fa`.

```ts
import type { AppActions, AppChannel, AppMessage } from '../protocol/types';

/**
 * A shared activity run by one authority. Online, the village host runs the
 * engine and every member sees only the view the engine projects for them,
 * so secrets (roles, other people's drawings) never leave the host. Offline,
 * the same engine runs locally, usually with bots.
 */
export interface RoomEngine<Action, View> {
  /** Applies one member's action; throws a user-facing Error when not allowed. */
  apply(actorId: string, action: Action, now: number): void;
  cancel?(now: number): void;
  /** Advances timers and bots; returns true when anything visible changed. */
  tick(now: number): boolean;
  viewFor(viewerId: string, now: number): View;
  /** Humans who should receive views even without having asked. */
  audience(): string[];
}

export interface RoomContext {
  selfId: string;
  /** Host fingerprint while joined to a village, otherwise null (offline). */
  hostId: string | null;
}

type Wire<Action, View> =
  | { t: 'hello' }
  | { t: 'act'; a: Action }
  | { t: 'view'; v: View }
  | { t: 'error'; m: string };

const TICK_MS = 400;

export class SharedRoom<Action, View, Engine extends RoomEngine<Action, View> = RoomEngine<Action, View>> {
  private engine: Engine | null = null;
  private modeKey = '';
  private watchers = new Set<string>();
  private view: View | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private offApp: () => void;
  private listeners = new Set<(view: View | null, error: string | null) => void>();

  constructor(
    private readonly channel: AppChannel,
    private readonly actions: Pick<AppActions, 'sendApp' | 'onApp'>,
    private readonly context: () => RoomContext,
    private readonly createEngine: () => Engine,
  ) {
    this.offApp = actions.onApp((message) => this.receive(message));
  }

  /** Called whenever the session may have changed: going online, offline or a new host. */
  sync(): void {
    const { selfId, hostId } = this.context();
    const key = hostId ? `online:${hostId}` : `local:${selfId}`;
    if (key === this.modeKey) return;
    this.modeKey = key;
    this.engine = this.isAuthority() ? this.createEngine() : null;
    this.watchers.clear();
    this.view = null;
    this.ensureTimer();
    if (this.engine) this.publish();
    else this.sendToHost({ t: 'hello' });
  }

  subscribe(listener: (view: View | null, error: string | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.view, null);
    return () => { this.listeners.delete(listener); };
  }

  /** Re-requests the current view, for example when the station is opened again. */
  refresh(): void {
    this.sync();
    if (this.engine) this.publish();
    else this.sendToHost({ t: 'hello' });
  }

  act(action: Action): void {
    this.sync();
    if (this.engine) {
      try {
        this.engine.apply(this.context().selfId, action, Date.now());
        this.publish();
      } catch (error) {
        this.emit(this.view, error instanceof Error ? error.message : 'Acción no permitida.');
      }
      return;
    }
    if (!this.sendToHost({ t: 'act', a: action })) this.emit(this.view, 'No se pudo contactar con el anfitrión de la aldea.');
  }

  canStop(): boolean { return this.isAuthority(); }
  stop(): void {
    this.sync();
    if (!this.isAuthority() || !this.engine?.cancel) return;
    this.engine.cancel(Date.now());
    this.publish();
  }

  current(): View | null { return this.view; }

  /** Lets the authority change its own state (housekeeping), publishing if anything changed. */
  mutate(change: (engine: Engine) => boolean): void {
    this.sync();
    if (this.engine && change(this.engine)) this.publish();
  }

  dispose(): void {
    this.offApp();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.listeners.clear();
  }

  private isAuthority(): boolean {
    const { selfId, hostId } = this.context();
    return hostId === null || hostId === selfId;
  }

  private ensureTimer(): void {
    if (this.engine && !this.timer) {
      this.timer = setInterval(() => {
        if (this.engine?.tick(Date.now())) this.publish();
      }, TICK_MS);
    } else if (!this.engine && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private publish(): void {
    const engine = this.engine;
    if (!engine) return;
    const now = Date.now();
    const { selfId, hostId } = this.context();
    this.view = engine.viewFor(selfId, now);
    this.emit(this.view, null);
    if (!hostId) return;
    const recipients = new Set([...engine.audience(), ...this.watchers]);
    recipients.delete(selfId);
    for (const id of recipients) this.sendTo(id, { t: 'view', v: engine.viewFor(id, now) });
  }

  private receive(message: AppMessage): void {
    if (message.channel !== this.channel) return;
    let wire: Wire<Action, View>;
    try { wire = JSON.parse(message.data) as Wire<Action, View>; } catch { return; }
    if (!wire || typeof wire !== 'object') return;
    this.sync();
    const { hostId } = this.context();
    if (this.engine) {
      // Only the authority accepts requests, and only from real members.
      if (wire.t === 'hello') { this.watchers.add(message.from); this.sendTo(message.from, { t: 'view', v: this.engine.viewFor(message.from, Date.now()) }); return; }
      if (wire.t === 'act') {
        this.watchers.add(message.from);
        try { this.engine.apply(message.from, wire.a, Date.now()); this.publish(); }
        catch (error) { this.sendTo(message.from, { t: 'error', m: error instanceof Error ? error.message.slice(0, 200) : 'Acción no permitida.' }); }
      }
      return;
    }
    if (message.from !== hostId) return;
    if (wire.t === 'view') { this.view = wire.v; this.emit(this.view, null); }
    else if (wire.t === 'error') this.emit(this.view, String(wire.m).slice(0, 200));
  }

  private sendToHost(wire: Wire<Action, View>): boolean {
    const { hostId } = this.context();
    return !!hostId && this.sendTo(hostId, wire);
  }

  private sendTo(id: string, wire: Wire<Action, View>): boolean {
    return this.actions.sendApp(this.channel, id, JSON.stringify(wire));
  }

  private emit(view: View | null, error: string | null): void {
    for (const listener of this.listeners) listener(view, error);
  }
}

/** Uniform integer in [0, max) from the platform CSPRNG. */
export function secureRandomInt(max: number): number {
  if (max <= 1) return 0;
  const buffer = new Uint32Array(1);
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % max;
}

export function shuffle<T>(items: readonly T[], random: (max: number) => number = secureRandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function pick<T>(items: readonly T[], random: (max: number) => number = secureRandomInt): T | undefined {
  return items.length ? items[random(items.length)] : undefined;
}
```

### app/src/ui/game.css — variante de shell/apuntes/proyectos, sin juegos

Sustituye la piel de distribución. Se retiraron reglas de Hombres Lobo/Gartic, conservando teléfono, HUD, notas, proyectos y responsive.

SHA-256 del bloque: `bb09599ed925df9b6a0495bcccfe46fb4dec180988c51ea2e7eca96665bbb8a6`.

```css
/*
 * The game shell: the village fills the window and everything else is either
 * a small HUD corner or an app opened from the phone, the way life-sim games
 * keep the world in focus. Activities (games, notes, projects) open full
 * screen with their own skin. Loaded after style.css.
 */

:root {
  --cream: #fff8e6;
  --cream-2: #f6ead0;
  --cream-line: #e3d3ad;
  --bark: #5b4631;
  --bark-dim: #8b7558;
  --leaf: #5fa36b;
  --sky: #8fd3e8;
  --bubble-shadow: 0 6px 0 #00000026, 0 14px 30px #0000002e;
  --round: 18px;
}

/* -------------------------------------------------------------- shell -- */

.sv-app { position: fixed; inset: 0; min-height: 0; overflow: hidden; }
.sv-main { position: absolute; inset: 0; display: block; }
.sv-stage-pane {
  position: absolute; inset: 0; display: grid; place-items: center;
  background: radial-gradient(1200px 700px at 50% 40%, #2a4a36 0, #12221b 100%);
  padding: 0; margin: 0; border: 0; box-shadow: none; clip-path: none; animation: none;
}
.sv-stage-pane .sv-canvas-wrap {
  width: min(100vw, calc(100vh * 16 / 9)); max-width: none; margin: 0; padding: 0;
  border: 0; border-radius: 0; box-shadow: none; clip-path: none; background: transparent;
  position: relative;
}
.sv-stage-pane .sv-canvas-wrap::after { display: none; }
.sv-stage-pane .sv-canvas { max-height: 100vh; width: 100%; height: auto; image-rendering: pixelated; cursor: pointer; }

/* The board keeps its own clean white skin, below the HUD. */
.sv-main > .sv-board-pane { position: absolute; inset: 0; overflow: auto; padding: 88px 16px 16px; border-radius: 0; }
.sv-main > .sv-panel:not(.sv-board-pane) { position: absolute; inset: 0; overflow: auto; padding: 80px 24px 24px; }
.sv-screen-theater {
  position: absolute; z-index: 30; top: 70px; right: 16px; width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 170px); overflow: auto; margin: 0;
}

/* ---------------------------------------------------------------- HUD -- */

.sv-hud { position: absolute; inset: 0; z-index: 40; pointer-events: none; }
.sv-hud > * { pointer-events: auto; }

.sv-hud-place { position: absolute; top: 14px; left: 14px; max-width: calc(100vw - 120px); }
.sv-hud-place .sv-page-heading {
  display: flex; align-items: center; gap: 10px; margin: 0;
  padding: 8px 16px 8px 8px; background: var(--cream); color: var(--bark);
  border-radius: 999px; box-shadow: var(--bubble-shadow); border: 2px solid var(--cream-line);
}
.sv-hud-place .sv-page-heading:has(.sv-hud-back[hidden]) { padding-left: 16px; }
.sv-hud-place h1 { margin: 0; font-size: 1.05rem; line-height: 1.2; font-weight: 800; color: var(--bark); letter-spacing: 0; text-shadow: none; }
.sv-hud-place .sv-subtle { margin: 0; font-size: .74rem; color: var(--bark-dim); }
.sv-hud-back {
  border: 0; border-radius: 999px; padding: 7px 12px; font-weight: 800; font-size: .85rem;
  background: var(--leaf); color: #fff; box-shadow: 0 3px 0 #3c7446; white-space: nowrap;
}
.sv-hud-back:hover { filter: brightness(1.06); }
.sv-hud-back:active { transform: translateY(2px); box-shadow: 0 1px 0 #3c7446; }

.sv-hud-top-right { position: fixed; z-index: 65; top: 14px; right: 14px; display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }

/* Notices read like a villager talking: a bubble near the bottom. */
.sv-notice.sv-hud-toast {
  position: absolute; left: 50%; bottom: 24px; transform: translateX(-50%);
  width: max-content; max-width: min(560px, calc(100vw - 200px)); margin: 0;
  display: flex; align-items: center; gap: 12px; padding: 12px 14px 12px 20px;
  background: var(--cream); color: var(--bark); font-weight: 650; line-height: 1.35;
  border: 2px solid var(--cream-line); border-radius: 22px; box-shadow: var(--bubble-shadow); clip-path: none;
  animation: sv-pop 220ms var(--ease-in);
}
.sv-notice.sv-hud-toast .sv-icon-button { color: var(--bark-dim); background: transparent; border: 0; font-size: 1.1rem; }
@keyframes sv-pop { from { opacity: 0; transform: translate(-50%, 8px) scale(.97); } to { opacity: 1; transform: translate(-50%, 0) scale(1); } }

.sv-approval-card.sv-hud-card {
  width: 300px; padding: 12px; background: var(--cream); color: var(--bark);
  border-radius: var(--round); border: 2px solid var(--cream-line); box-shadow: var(--bubble-shadow); clip-path: none;
}
.sv-approval-title { display: block; margin-bottom: 8px; font-size: .95rem; }
.sv-hud-card .sv-approval-row { display: grid; gap: 4px; padding: 8px 0; border-top: 1px dashed var(--cream-line); }
.sv-hud-card .sv-approval-row small { color: var(--bark-dim); }

.sv-hud-voice { position: absolute; left: 16px; bottom: 18px; display: flex; gap: 8px; }
.sv-hud-round {
  width: 46px; height: 46px; border-radius: 50%; border: 2px solid var(--cream-line);
  display: grid; place-items: center; background: var(--cream); color: var(--bark-dim);
  box-shadow: 0 4px 0 #00000030;
}
.sv-hud-round.is-on { background: var(--leaf); color: #fff; border-color: #3c7446; }
.sv-hud-round.is-off { background: #e7a08f; color: #fff; border-color: #b9614d; }
.sv-hud-round:active { transform: translateY(2px); box-shadow: 0 2px 0 #00000030; }

.sv-phone-button {
  position: absolute; right: 18px; bottom: 18px; display: flex; align-items: center; gap: 8px;
  padding: 10px 18px 10px 14px; border-radius: 999px; border: 3px solid #fff;
  background: linear-gradient(180deg, #ffcf5c, #f3a93b); color: #5b3a12; font-weight: 900; font-size: 1rem;
  box-shadow: 0 5px 0 #b77420, 0 12px 26px #00000040;
}
.sv-phone-button:hover { filter: brightness(1.04); }
.sv-phone-button:active { transform: translateY(3px); box-shadow: 0 2px 0 #b77420; }
.sv-phone-badge {
  position: absolute; top: -8px; right: -6px; min-width: 22px; height: 22px; padding: 0 6px;
  border-radius: 11px; background: #e5484d; color: #fff; font-size: .75rem; line-height: 22px; text-align: center;
  border: 2px solid #fff;
}


/* -------------------------------------------------------------- phone -- */

.sv-phone {
  position: fixed; inset: 0; z-index: 60; display: flex; align-items: flex-end; justify-content: flex-end;
  padding: 18px 18px 86px; background: #0b140f55; animation: sv-fade 160ms ease-out;
}
@keyframes sv-fade { from { opacity: 0; } }
.sv-phone-screen {
  width: min(400px, 100%); height: min(680px, calc(100vh - 110px)); display: flex; flex-direction: column;
  background: var(--cream); color: var(--bark); border-radius: 32px; border: 6px solid #fff;
  box-shadow: 0 8px 0 #00000030, 0 30px 60px #00000055; overflow: hidden;
  animation: sv-rise 240ms var(--ease-in);
}
@keyframes sv-rise { from { transform: translateY(24px) scale(.97); opacity: 0; } }
.sv-phone-head {
  display: grid; grid-template-columns: 36px 1fr 36px; align-items: center; gap: 6px;
  padding: 12px 12px 10px; background: linear-gradient(180deg, var(--sky), #bfe6ef); color: #22475a;
}
.sv-phone-title { margin: 0; text-align: center; font-size: 1.05rem; font-weight: 900; color: #22475a; }
.sv-phone-icon-btn {
  width: 34px; height: 34px; border-radius: 50%; border: 0; display: grid; place-items: center;
  background: #ffffffaa; color: #22475a;
}
.sv-phone-head > .sv-phone-icon-btn[hidden] { display: block !important; visibility: hidden; }
.sv-phone-page { flex: 1; min-height: 0; overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
.sv-phone-me { display: flex; align-items: center; gap: 12px; }
.sv-phone-me .sv-profile-avatar { width: 46px; height: 46px; border-radius: 50%; border: 3px solid #fff; box-shadow: 0 3px 0 #0000001f; }
.sv-phone-me strong { display: block; font-size: 1.05rem; }
.sv-phone-me .sv-status-pill {
  display: inline-block; margin-top: 3px; padding: 2px 10px; border-radius: 999px; font-size: .72rem;
  background: var(--cream-2); color: var(--bark-dim); border: 0; letter-spacing: 0; text-transform: none; clip-path: none; box-shadow: none;
}
.sv-phone-me .sv-status-pill.is-online { background: #d8f0dc; color: #2f6b3b; }
.sv-app-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px 10px; }
.sv-app-tile {
  display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 4px; border: 0; background: none; color: var(--bark);
  font-weight: 800; font-size: .82rem;
}
.sv-app-icon {
  width: 66px; height: 66px; border-radius: 20px; display: grid; place-items: center; color: #fff;
  background: var(--tile); box-shadow: inset 0 -5px 0 #00000026, 0 4px 0 #0000001f;
  transition: transform var(--t-fast) var(--ease-in);
}
.sv-app-tile:hover .sv-app-icon { transform: translateY(-3px) rotate(-2deg); }
.sv-app-tile:active .sv-app-icon { transform: translateY(1px); }

/* Pages inside the phone reuse old controls; give them the phone's light skin. */
.sv-phone-page .sv-subtle, .sv-phone-page .sv-tiny, .sv-phone-page small { color: var(--bark-dim); }
.sv-phone-page h3 { margin: 0; color: var(--bark); }
.sv-phone-page .sv-field-label, .sv-phone-page .sv-eyebrow { color: var(--bark-dim); }
.sv-phone-page .sv-input, .sv-phone-page .sv-select {
  background: #fff; color: var(--bark); border: 2px solid var(--cream-line); border-radius: 12px; clip-path: none; box-shadow: none;
}
.sv-phone-page .sv-button {
  border-radius: 12px; clip-path: none; background: #fff; color: var(--bark); border: 2px solid var(--cream-line); box-shadow: 0 3px 0 var(--cream-line);
  font-weight: 800;
}
.sv-phone-page .sv-button-primary { background: var(--leaf); color: #fff; border-color: #3c7446; box-shadow: 0 3px 0 #3c7446; }
.sv-phone-page .sv-button.is-active { background: #ffe9a8; }
.sv-phone-page .sv-link-button { color: #3f7fb0; }
.sv-phone-page .sv-danger-text { color: var(--danger); }
.sv-session-card { display: flex; flex-direction: column; gap: 10px; }
.sv-divider-text { margin: 0; text-align: center; font-size: .78rem; color: var(--bark-dim); }
.sv-phone-page .sv-join-form { display: flex; gap: 8px; }
.sv-phone-page .sv-join-form .sv-input { flex: 1; min-width: 0; }
.sv-phone-page .sv-invite-box { display: grid; gap: 6px; padding: 12px; border-radius: 14px; background: var(--cream-2); }
.sv-context-card { display: flex; flex-direction: column; gap: 8px; padding-top: 10px; border-top: 2px dashed var(--cream-line); }
.sv-context-card h3 { font-size: 1rem; }
.sv-phone-page .sv-house-row {
  display: flex; align-items: center; gap: 10px; width: 100%; padding: 10px; border-radius: 14px;
  background: #fff; color: var(--bark); border: 2px solid var(--cream-line); text-align: left; clip-path: none;
}
.sv-phone-page .sv-house-row strong { display: block; }
.sv-phone-page .sv-person-row { display: flex; align-items: center; gap: 8px; color: var(--bark); }
.sv-phone-page .sv-media-card { display: flex; flex-direction: column; gap: 10px; }
.sv-phone-page .sv-media-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.sv-phone-page .sv-mic-meter-bar { background: var(--cream-2); }
.sv-phone-page .sv-house-editor { display: flex; flex-direction: column; gap: 10px; }
.sv-phone-page .sv-furniture-item { background: #fff; color: var(--bark); border: 2px solid var(--cream-line); border-radius: 10px; clip-path: none; }
.sv-phone-page .sv-furniture-item.is-selected { border-color: var(--leaf); background: #e7f5e9; }
.sv-phone-page .sv-panel { padding: 0; background: none; border: 0; box-shadow: none; clip-path: none; color: var(--bark); animation: none; }
.sv-phone-page .sv-contact-code, .sv-phone-page .sv-contact-import { padding: 12px; border-radius: 14px; background: var(--cream-2); clip-path: none; border: 0; }
.sv-phone-page .sv-friend-code { color: var(--bark); }

/* Settings dialog follows the same soft look. */
.sv-settings-dialog { border-radius: 24px; border: 5px solid #fff; background: var(--cream); color: var(--bark); clip-path: none; }
.sv-settings-dialog h2, .sv-settings-dialog h3 { color: var(--bark); }
.sv-settings-dialog .sv-field-label, .sv-settings-dialog .sv-subtle, .sv-settings-dialog label { color: var(--bark-dim); }

/* ----------------------------------------------------------- activity -- */

.sv-activity { position: fixed; inset: 0; z-index: 70; display: flex; animation: sv-fade 160ms ease-out; }
.sv-activity > * { flex: 1; min-width: 0; }


/* ---------------------------------------------------------- notes ---- */

.nb {
  --nb-ink: #37352f; --nb-dim: #787774; --nb-line: #e9e9e7; --nb-hover: #efefed; --nb-side: #f7f7f5;
  display: grid; grid-template-columns: 250px minmax(0, 1fr); height: 100%; background: #fff; color: var(--nb-ink);
  font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, sans-serif; font-weight: 400;
}
.nb-sidebar { display: flex; flex-direction: column; gap: 4px; padding: 12px 8px; background: var(--nb-side); border-right: 1px solid var(--nb-line); overflow: auto; }
.nb-side-head { display: flex; align-items: baseline; justify-content: space-between; padding: 4px 8px 8px; }
.nb-side-head strong { font-size: .95rem; }
.nb-local { font-size: .72rem; color: var(--nb-dim); }
.nb-search { display: flex; align-items: center; gap: 6px; margin: 0 4px 8px; padding: 5px 8px; border-radius: 6px; background: #ececea; color: var(--nb-dim); }
.nb-search input { flex: 1; min-width: 0; border: 0; background: transparent; outline: none; color: var(--nb-ink); font-size: .85rem; }
.nb-tree { display: flex; flex-direction: column; gap: 10px; }
.nb-book-title {
  display: flex; align-items: center; justify-content: space-between; padding: 2px 8px;
  font-size: .72rem; font-weight: 600; color: var(--nb-dim); text-transform: uppercase; letter-spacing: .03em;
}
.nb-icon-btn { display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 5px; background: transparent; color: var(--nb-dim); }
.nb-icon-btn:hover { background: var(--nb-hover); color: var(--nb-ink); }
.nb-page-row {
  display: flex; align-items: center; gap: 8px; width: 100%; padding: 5px 10px; border: 0; border-radius: 6px;
  background: transparent; color: var(--nb-ink); text-align: left; font-size: .88rem;
}
.nb-page-row span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nb-page-row svg { flex: none; color: var(--nb-dim); }
.nb-page-row:hover { background: var(--nb-hover); }
.nb-page-row.is-active { background: #e8e7e4; font-weight: 600; }
.nb-empty-book { margin: 0; padding: 2px 12px; font-size: .8rem; color: #b4b4b0; }
.nb-side-action { display: flex; align-items: center; gap: 8px; margin-top: 8px; padding: 6px 10px; border: 0; border-radius: 6px; background: transparent; color: var(--nb-dim); font-size: .85rem; }
.nb-side-action:hover { background: var(--nb-hover); }
.nb-new-book input { width: 100%; padding: 6px 10px; border: 1px solid var(--nb-line); border-radius: 6px; font-size: .88rem; }
.nb-page { position: relative; display: flex; flex-direction: column; min-width: 0; overflow: auto; }
.nb-topbar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 12px; background: #fffffff2; }
.nb-crumbs { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: .85rem; color: var(--nb-dim); }
.nb-crumbs span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nb-crumbs span:last-child { color: var(--nb-ink); }
.nb-sep { color: #c7c7c5; }
.nb-top-actions { display: flex; align-items: center; gap: 4px; }
.nb-edited { margin-right: 6px; font-size: .78rem; color: var(--nb-dim); white-space: nowrap; }
.nb-dots { font-size: .7rem; letter-spacing: .1em; }
.nb-popover {
  position: absolute; top: 44px; right: 12px; min-width: 230px; padding: 6px; border-radius: 8px; background: #fff;
  box-shadow: 0 0 0 1px #0f0f0f0d, 0 3px 6px #0f0f0f1a, 0 9px 24px #0f0f0f33;
}
.nb-menu-item { display: block; width: 100%; padding: 7px 10px; border: 0; border-radius: 5px; background: transparent; text-align: left; color: var(--nb-ink); font-size: .88rem; }
.nb-menu-item:hover:not(:disabled) { background: var(--nb-hover); }
.nb-menu-item:last-child { color: #d44c47; }
.nb-body { width: min(720px, 100%); margin: 0 auto; padding: 48px 32px 30vh; }
.nb-title { margin: 0 0 16px; font-size: 2.5rem; font-weight: 700; line-height: 1.2; letter-spacing: -.01em; outline: none; color: var(--nb-ink); }
.nb-title:empty::before, .nb-text:empty::before { content: attr(data-placeholder); color: #c7c7c5; pointer-events: none; }
.nb-blocks { display: flex; flex-direction: column; min-height: 120px; cursor: text; }
.nb-block { position: relative; display: flex; align-items: flex-start; gap: 6px; padding: 3px 2px; border-radius: 4px; line-height: 1.6; }
.nb-text { flex: 1; min-width: 0; outline: none; white-space: pre-wrap; word-break: break-word; font-size: 1rem; }
.nb-block.is-h1 .nb-text { font-size: 1.85rem; font-weight: 700; margin-top: 1.2em; line-height: 1.3; }
.nb-block.is-h2 .nb-text { font-size: 1.45rem; font-weight: 650; margin-top: 1em; line-height: 1.3; }
.nb-block.is-h3 .nb-text { font-size: 1.2rem; font-weight: 600; margin-top: .8em; }
.nb-marker { flex: none; width: 22px; text-align: center; color: var(--nb-ink); }
.nb-check { flex: none; width: 16px; height: 16px; margin: 5px 4px 0 3px; accent-color: #2383e2; }
.nb-block.is-done .nb-text { text-decoration: line-through; color: var(--nb-dim); }
.nb-block.is-quote { border-left: 3px solid var(--nb-ink); padding-left: 14px; margin: 4px 0; }
.nb-block.is-code .nb-text { margin: 4px 0; padding: 16px; border-radius: 6px; background: #f7f6f3; font-family: var(--font-mono); font-size: .88rem; }
.nb-block.is-math .nb-text { padding: 10px 14px; border-radius: 6px; background: #fafaf9; text-align: center; }
.nb-block.is-math:not(.is-rendered) .nb-text { font-family: var(--font-mono); text-align: left; }
.nb-block.is-divider { padding: 10px 0; outline: none; }
.nb-block.is-divider hr { width: 100%; border: 0; border-top: 1px solid var(--nb-line); }
.nb-block.is-divider:focus hr { border-top-color: #2383e2; }
.nb-hint { margin-top: 30px; font-size: .78rem; color: #b4b4b0; }
.nb-slash {
  position: absolute; z-index: 5; top: 100%; left: 24px; width: 280px; max-height: 320px; overflow: auto; padding: 6px;
  border-radius: 8px; background: #fff; box-shadow: 0 0 0 1px #0f0f0f0d, 0 3px 6px #0f0f0f1a, 0 9px 24px #0f0f0f33;
}
.nb-slash-title { padding: 6px 8px 4px; font-size: .72rem; color: var(--nb-dim); }
.nb-slash-item { display: flex; flex-direction: column; width: 100%; padding: 6px 10px; border: 0; border-radius: 5px; background: transparent; text-align: left; color: var(--nb-ink); }
.nb-slash-item strong { font-weight: 500; font-size: .9rem; }
.nb-slash-item span { font-size: .75rem; color: var(--nb-dim); }
.nb-slash-item.is-active, .nb-slash-item:hover { background: var(--nb-hover); }
.nb-slash-none { margin: 4px 10px; color: var(--nb-dim); font-size: .85rem; }
.nb-blank { margin: 18vh auto 0; text-align: center; color: var(--nb-dim); }
.nb-blank h2 { color: var(--nb-ink); }
.nb-primary { padding: 8px 14px; border: 0; border-radius: 6px; background: #2383e2; color: #fff; font-weight: 600; }
.nb-page > .nb-icon-btn { position: absolute; top: 10px; right: 12px; }

/* ------------------------------------------------------- projects ---- */

.pj {
  --pj-ink: #1f2933; --pj-dim: #64748b; --pj-line: #e2e8f0; --pj-blue: #0078d4; --pj-bg: #f5f7fb;
  display: flex; flex-direction: column; height: 100%; background: var(--pj-bg); color: var(--pj-ink);
}
.pj-head { display: flex; align-items: center; gap: 14px; padding: 16px 22px; background: #fff; border-bottom: 1px solid var(--pj-line); }
.pj-head > div { flex: 1; min-width: 0; }
.pj-head h2 { margin: 0; font-size: 1.25rem; }
.pj-head p { margin: 2px 0 0; color: var(--pj-dim); font-size: .88rem; }
.pj-logo { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 12px; background: var(--pj-blue); color: #fff; }
.pj-logo.is-big { width: 76px; height: 76px; border-radius: 22px; margin: 0 auto 6px; }
.pj-icon-btn { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--pj-dim); }
.pj-icon-btn:hover { background: #eef2f7; color: var(--pj-ink); }
.pj-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 290px minmax(0, 1fr); }
.pj-list { display: flex; flex-direction: column; gap: 6px; padding: 14px; border-right: 1px solid var(--pj-line); overflow: auto; background: #fff; }
.pj-new { margin-bottom: 8px; }
.pj-row { display: flex; flex-direction: column; gap: 4px; padding: 10px 12px; border-radius: 10px; border: 1px solid transparent; background: transparent; text-align: left; color: var(--pj-ink); }
.pj-row:hover { background: var(--pj-bg); }
.pj-row.is-active { background: #e8f2fc; border-color: #b9d8f5; }
.pj-row-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.pj-row-sub { font-size: .78rem; color: var(--pj-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pj-live { padding: 2px 8px; border-radius: 999px; background: #dcfce7; color: #15803d; font-size: .7rem; font-weight: 800; }
.pj-live::before { content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: #22c55e; vertical-align: 1px; }
.pj-faces { display: flex; }
.pj-face {
  display: inline-grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; margin-right: -6px;
  border: 2px solid #fff; color: #fff; font-size: .7rem; font-weight: 800; background: #94a3b8;
}
.pj-detail { overflow: auto; padding: 24px 28px 40px; display: flex; flex-direction: column; gap: 14px; max-width: 860px; }
.pj-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.pj-title-row h3 { margin: 0; font-size: 1.6rem; }
.pj-desc { margin: 0; font-size: 1rem; line-height: 1.5; }
.pj-muted { margin: 0; color: var(--pj-dim); font-size: .85rem; }
.pj-error { margin: 0; padding: 10px 12px; border-radius: 8px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
.pj-section { display: flex; flex-direction: column; gap: 10px; padding: 18px; border-radius: 14px; background: #fff; border: 1px solid var(--pj-line); }
.pj-section h4 { margin: 0; font-size: 1rem; }
.pj-live-box.is-live { border-color: #86efac; background: linear-gradient(180deg, #f0fdf4, #fff); }
.pj-steps { margin: 0; padding-left: 20px; display: grid; gap: 4px; color: #334155; font-size: .9rem; }
.pj-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.pj-btn {
  display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 8px; border: 1px solid #cbd5e1;
  background: #fff; color: var(--pj-ink); font-weight: 600; font-size: .9rem;
}
.pj-btn:hover:not(:disabled) { background: #f8fafc; border-color: #94a3b8; }
.pj-btn-primary { background: var(--pj-blue); border-color: var(--pj-blue); color: #fff; }
.pj-btn-primary:hover:not(:disabled) { background: #106ebe; border-color: #106ebe; }
.pj-btn-quiet { border-color: transparent; background: transparent; color: var(--pj-dim); }
.pj-btn-danger { border-color: #fecaca; color: #b91c1c; margin-left: auto; }
.pj-repo { padding: 8px 10px; border-radius: 8px; background: #f1f5f9; font-family: var(--font-mono); font-size: .85rem; overflow-wrap: anywhere; }
.pj-inline-form { display: flex; gap: 8px; }
.pj-input { flex: 1; min-width: 0; width: 100%; padding: 9px 12px; border-radius: 8px; border: 1px solid #cbd5e1; background: #fff; color: var(--pj-ink); }
.pj-input:focus { border-color: var(--pj-blue); outline: 2px solid #0078d433; outline-offset: 0; }
.pj-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.pj-chip { display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px 4px 4px; border-radius: 999px; background: var(--pj-bg); font-size: .88rem; }
.pj-chip .pj-face { margin: 0; }
.pj-tasks { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
.pj-tasks li { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 6px; }
.pj-tasks li:hover { background: var(--pj-bg); }
.pj-tasks label { flex: 1; display: flex; align-items: center; gap: 8px; }
.pj-tasks li.is-done label span { text-decoration: line-through; color: var(--pj-dim); }
.pj-tasks .pj-icon-btn { width: 28px; height: 28px; opacity: 0; }
.pj-tasks li:hover .pj-icon-btn, .pj-tasks .pj-icon-btn:focus-visible { opacity: 1; }
.pj-form { display: flex; flex-direction: column; gap: 14px; max-width: 560px; }
.pj-form h3 { margin: 0; font-size: 1.4rem; }
.pj-field { display: flex; flex-direction: column; gap: 6px; font-weight: 600; font-size: .9rem; }
.pj-field small { font-weight: 400; }
.pj-onboarding { margin: 10vh auto 0; max-width: 440px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.pj-onboarding h3 { margin: 0; font-size: 1.4rem; }
.pj-onboarding p { margin: 0 0 8px; color: var(--pj-dim); line-height: 1.5; }

/* ------------------------------------------------------- small screens */

@media (max-width: 900px) {
  .nb { grid-template-columns: 1fr; }
  .nb-sidebar { max-height: 34vh; border-right: 0; border-bottom: 1px solid var(--nb-line); }
  .nb-body { padding: 24px 18px 30vh; }
  .nb-title { font-size: 2rem; }
  .pj-body { grid-template-columns: 1fr; }
  .pj-list { max-height: 30vh; border-right: 0; border-bottom: 1px solid var(--pj-line); }
  .pj-detail { padding: 18px 16px 32px; }
}

@media (max-width: 600px) {
  .sv-phone { padding: 0; align-items: stretch; }
  .sv-phone-screen { width: 100%; height: 100%; border-radius: 0; border: 0; }
  .sv-app-icon { width: 58px; height: 58px; }
  .sv-hud-place { left: 10px; top: 10px; }
  .sv-hud-place .sv-subtle { display: none; }
  .sv-notice.sv-hud-toast { max-width: calc(100vw - 32px); bottom: 150px; }
  .sv-phone-button-label { display: none; }
  .sv-phone-button { padding: 12px; }
  .sv-approval-card.sv-hud-card { width: min(300px, calc(100vw - 28px)); }
}

@media (prefers-reduced-motion: reduce) {
}

/* Formulas inside notes sit on the text baseline. */
.nb .sv-note-math { display: inline-block; vertical-align: middle; font-family: var(--font-mono); font-size: .85em; }
.nb .sv-note-math.is-display { display: block; margin: 4px 0; text-align: center; }
.nb .sv-note-math canvas { display: inline-block; vertical-align: middle; }

/* On a phone the stage is a thin strip; the pad and action button sit below it. */
.sv-stage-pane .sv-touch-controls {
  position: fixed; left: 16px; right: 16px; bottom: 96px; top: auto; z-index: 45;
  display: flex; justify-content: space-between; align-items: flex-end; pointer-events: none;
}
.sv-stage-pane .sv-touch-controls > * { pointer-events: auto; }
```

### app/src/ui/theme.css — materiales clásicos

Importar después de la piel de distribución. No contiene controles de juegos ni IA.

SHA-256 del bloque: `ad02c756d89acefb23e146a6cddc4e66fca74d03e9d7116abd07f24a8e16feac`.

```css
/* Shared village materials: quiet paper inside warm wooden furniture. */
:root {
  --paper: #fff8e9; --paper-soft: #f5e7cb; --paper-line: #d7bf95;
  --wood-dark: #443023; --wood-mid: #765338; --wood-light: #a77b50;
  --text-warm: #423223; --text-muted: #806a51; --accent-leaf: #416c46;
  --surface-shadow: 0 2px 0 #b39972, 0 7px 18px #35241412;
}
.pj { --pj-ink: var(--text-warm); --pj-dim: var(--text-muted); --pj-line: var(--paper-line); --pj-blue: var(--accent-leaf); --pj-bg: var(--paper-soft); }
.nb { --nb-ink: var(--text-warm); --nb-dim: var(--text-muted); --nb-line: var(--paper-line); --nb-bg: var(--paper); --nb-hover: var(--paper-soft); }
.pj-head, .nb-sidebar{ background: var(--paper-soft); border-color: var(--paper-line); }
.pj-section, .pj-input, .pj-head, .nb-page, .nb-slash{ background-color: var(--paper); color: var(--text-warm); }
.pj-btn, .nb-primary, .nb-btn, .gp-btn, .ww-btn, .sv-study-workspace button {
  border-radius: 8px; font-weight: 650; border: 1px solid var(--paper-line);
  background: var(--paper-soft); color: var(--text-warm); box-shadow: 0 2px 0 #b3997240;
}
.pj-btn-primary, .nb-primary, .sv-study-workspace .is-primary { background: var(--accent-leaf); color: var(--paper); border-color: #35593a; }
.pj-head, .nb-toolbar{ border-top: 5px solid var(--wood-mid); }
.pj-input:focus, .nb-block:focus { outline-color: var(--accent-leaf); border-color: var(--accent-leaf); }
.pj-logo { color: var(--accent-leaf); background: var(--paper-soft); }
.sv-board-pane { background: var(--paper-soft); border: 3px solid var(--wood-mid); box-shadow: 0 4px 0 var(--wood-dark); }
.sv-board-pane .sv-segment, .sv-board-pane .sv-input, .sv-board-pane .sv-select, .sv-board-pane .sv-layer, .sv-board-pane .sv-swatch-row { background: var(--paper-soft); color: var(--text-warm); border-color: var(--paper-line); }
.sv-board-pane .sv-button, .sv-board-pane .sv-segment-button, .sv-board-pane .sv-latex-chip, .sv-board-category > summary { color: var(--text-warm); }
.sv-board-pane .sv-segment-button.is-active { color: var(--accent-leaf); background: var(--paper); }
.sv-board-pane .sv-board-more, .sv-board-category[open] > summary { color: var(--accent-leaf); }
.sv-board-options-panel { background: var(--paper); border-color: var(--paper-line); }
.sv-board-option-group + .sv-board-option-group { border-color: var(--paper-line); }
.sv-board-pane :focus-visible, .sv-board-category > summary:focus-visible { outline-color: var(--accent-leaf); }
.sv-board-pane .sv-board-wrap { border-color: var(--paper-line); }



.sv-study-workspace { height: 100%; overflow: auto; padding: 20px; background: var(--paper); color: var(--text-warm); }
.sv-study-workspace header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; border-bottom: 2px solid var(--paper-line); padding-bottom: 16px; margin-bottom: 18px; }
.sv-study-workspace header h2 { flex: 1; margin: 0; }
.sv-study-workspace button { padding: 10px 15px; min-height: 44px; cursor: pointer; }
.sv-study-workspace input, .sv-study-workspace textarea, .sv-study-workspace select { padding: 10px; border: 1px solid var(--paper-line); background: #fffdf6; color: var(--text-warm); border-radius: 8px; max-width: 100%; }
.sv-study-library, .sv-furniture-catalog { display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: 12px; }
.sv-study-card{ padding: 18px; background: var(--paper-soft); border: 1px solid var(--paper-line); border-radius: 10px; }
.sv-study-card h3 { margin: 0 0 8px; }
.sv-study-form { display: flex; flex-direction: column; gap: 12px; max-width: 750px; margin: 0 auto; }
.sv-study-form label { display: flex; flex-direction: column; gap: 6px; }
.sv-study-review { margin: 8vh auto 24px; max-width: 720px; text-align: center; }
.sv-study-review .sv-study-card { padding: 40px 25px; font-size: 1.3rem; min-height: 180px; }
.sv-study-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.sv-study-workspace details { padding: 12px; border: 1px solid var(--paper-line); border-radius: 8px; }
.sv-study-workspace summary { cursor: pointer; }
.sv-study-workspace .sv-error { color: #943d2c; }


.sv-decoration-toolbar { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; z-index: 9; width: min(94vw,800px); border: 3px solid var(--wood-mid); border-radius: 12px; background: var(--paper); color: var(--text-warm); }
.sv-decoration-toolbar button { min-height: 42px; }
@media(max-width:740px) { .sv-activity-stop { position: relative; right: auto; top: auto; margin: 6px 12px; } .sv-study-workspace { padding: 12px; } }





.nb { --nb-side: var(--paper-soft); background: var(--paper); }
.nb-search { background: var(--paper-soft); }









.sv-furniture-catalog { margin-bottom: 16px; grid-template-columns: repeat(2,minmax(0,1fr)); }
.sv-furniture-catalog button { display: flex; flex-direction: column; align-items: center; }
.sv-furniture-catalog canvas { width: 100px; height: 90px; }
.sv-study-workspace > button { margin: 6px; }
.sv-study-workspace .sv-study-form { padding-bottom: 24px; }
.sv-study-workspace button { max-width: 100%; overflow-wrap: anywhere; }
.sv-study-form textarea { min-height: 90px; width: 100%; }
.sv-study-workspace .sv-study-card button { margin: 4px; }
.sv-study-workspace header { border-top: 5px solid var(--wood-mid); padding-top: 12px; }
.sv-study-workspace [role=alert] { white-space: pre-wrap; }

.pj-list { background: var(--paper); border-color: var(--paper-line); }
```

### app/src/ui/app.ts — métodos canónicos de integración

FRAGMENTOS DE CLASE, no archivo compilable independiente. Declarar campos/imports y conectar callbacks del documento principal. `expansion` aquí es el servicio de registro/actividad; en fase 1 no debe construir servicios de IA ni juegos. Métodos de ciclo de vida comunes pueden cerrar un panel clásico.

SHA-256 del bloque: `de20c9681e1e7437440f75f240e6550fab1f123d6fc5d7265a584ad24b0c9d9e`.

```ts
private navigate(pane: Pane): void {
    if (!this.view) return;
    if (pane === 'contacts') { this.openPhone('contacts'); return; }
    this.closePhone();
    if (pane === 'world') {
      if (this.houseOwnerId || this.waitingHouseId) this.leaveCurrentHouse();
      else { this.pane = 'world'; this.refresh(); }
      return;
    }
    else if (pane === 'house') {
      // Already inside your own house (for example, back from the board):
      // return to it as you left it instead of re-entering at the doormat.
      if (this.houseOwnerId === this.view.identity.fingerprint) { this.returnToRoom(); return; }
      this.enterOwnHouse(); return;
    }
    this.pane = pane;
    this.refresh();
  }

private returnToRoom(): void {
    if (!this.houseOwnerId) return;
    this.pane = 'house';
    this.refresh();
  }

private enterOwnHouse(): void { this.openHouse(this.view?.identity.fingerprint || ''); }

private beginDecoration(kind?: FurnitureKind): void {
    if (!this.view || this.pane !== 'house' || this.houseOwnerId !== this.view.identity.fingerprint) return;
    this.decorating = true; this.pendingFurniture = kind ?? null; this.keys.clear(); this.dpadKeys.clear(); this.moveTarget = null; this.movePath = []; this.pendingInteraction = null;
    this.closePhone(); this.decorationToolbar.hidden = false;
    if (kind) this.previewNewFurniture(280, 300);
    this.lastStageRenderSig = '';
  }

private endDecoration(): void { this.decorating = false; this.pendingFurniture = null; this.previewHouse = null; this.drag = null; this.decorationInvalid = null; if (this.decorationToolbar) this.decorationToolbar.hidden = true; this.lastStageRenderSig = ''; }

private previewNewFurniture(x: number, y: number): void {
    const house = this.view?.ownHouse; if (!house || !this.pendingFurniture) return;
    const snap = (n: number) => this.decorationGrid ? Math.round(n / 8) * 8 : Math.round(n);
    const item: Furniture = { id: 'placing-preview', kind: this.pendingFurniture, x: snap(x), y: snap(y), publicAlias: '' };
    this.previewHouse = { ...house, revision: house.revision + 1, furniture: [...house.furniture, item] };
    this.decorationInvalid = house.furniture.length >= 32 ? 'La casa ya tiene 32 muebles.' : placementError(this.previewHouse, item.id); this.lastStageRenderSig = '';
  }

private commitDecoration(next: PublicHouse, changedId: string): boolean {
    const house = this.view?.ownHouse; if (!house || next.ownerId !== house.ownerId) return false;
    const error = placementError(next, changedId); if (error) { this.notify(error); return false; }
    this.decorationHistory.remember(house);
    const furniture = next.furniture.map(f => f.id === 'placing-preview' ? { ...f, id: crypto.randomUUID() } : f);
    this.selectedFurnitureId = furniture.find(f => f.id === changedId)?.id || furniture.at(-1)?.id || null;
    this.actions.updateOwnHouse({ ...next, furniture, revision: house.revision + 1 }); this.lastStageRenderSig = ''; return true;
  }

private openHouse(ownerId: string): void {
    const view = this.view;
    if (!view || !ownerId) return;
    const isOwn = ownerId === view.identity.fingerprint;
    const house = isOwn ? view.ownHouse : view.network.houses.find((item) => item.ownerId === ownerId);
    if (!house) return;
    if (!isOwn && (view.network.phase !== 'JOINED' || house.access === 'locked')) return;
    if (view.network.phase === 'JOINED') this.run(() => this.actions.visitHouse(ownerId));
    this.expansion.closeModal();
    if (isOwn) {
      this.houseOwnerId = ownerId;
      this.waitingHouseId = null;
      this.pane = 'house';
      this.currentArea = 'residential';
      this.localPosition = { ...HOUSE_SPAWN };
    } else {
      this.waitingHouseId = ownerId;
      this.notify(house.access === 'ask' ? 'Solicitud enviada. Espera a que te abran la puerta.' : 'Entrando en la casa…');
    }
    this.refresh();
  }

private changeWorldArea(area: BuiltinAreaId, spawn: Position): void {
    if (this.pane !== 'world') this.leaveCurrentHouse();
    this.expansion.closeModal();
    this.pendingInteraction = null;
    this.currentArea = area;
    this.localPosition = { ...spawn, moving: false };
    this.moveTarget = null;
    this.lastStageRenderSig = '';
    this.actions.move({ ...this.localPosition, areaId: area });
    this.expansion.refreshStageControls();
    this.refreshPane();
  }

private leaveCurrentHouse(): void {
    this.endDecoration();
    const view = this.view;
    if (!view) return;
    if (view.network.phase === 'JOINED' && (this.houseOwnerId || this.waitingHouseId)) this.run(() => this.actions.leaveHouse());
    const leftHouse = this.houseOwnerId;
    this.houseOwnerId = null;
    this.waitingHouseId = null;
    this.selectedFurnitureId = null;
    this.expansion.closeModal();
    this.pane = 'world';
    // Step out onto the street in front of the house you were in.
    const parcel = leftHouse ? occupiedParcels(view).find((item) => item.ownerId === leftHouse)?.parcel : undefined;
    if (leftHouse) this.currentArea = 'residential';
    this.localPosition = parcel
      ? { x: parcel.doorX, y: parcel.doorY + (parcel.doorY < 200 ? 16 : -16), direction: parcel.doorY < 200 ? 'down' : 'up', moving: false }
      : { ...WORLD_AREAS[this.currentArea].defaultSpawn };
    this.stopMoving();
    this.lastStageRenderSig = '';
    this.actions.move({ ...this.localPosition, areaId: this.currentArea });
    this.refresh();
  }

private currentHouse(): PublicHouse | null {
    const view = this.view;
    if (!view) return null;
    if (!this.houseOwnerId || this.houseOwnerId === view.identity.fingerprint) return view.ownHouse;
    return view.network.houses.find((house) => house.ownerId === this.houseOwnerId) || null;
  }

private patchOwnHouse(patch: Partial<PublicHouse>): void {
    const view = this.view;
    if (!view) return;
    this.actions.updateOwnHouse({ ...view.ownHouse, ...patch, revision: view.ownHouse.revision + 1 });
  }

private boardId(): string {
    if (this.customBoardId) return this.customBoardId;
    const view = this.view;
    const isOwn = !this.houseOwnerId || this.houseOwnerId === view?.identity.fingerprint;
    const scope = isOwn ? 'own' : this.houseOwnerId!;
    return houseBoardId(scope, this.activeBoardFurnitureId || 'board');
  }

private allStrokes(boardId: string): BoardStroke[] {
    const persisted = this.expansion.boardRegistry.getStrokes(boardId);
    const byId = new Map<string, BoardStroke>();
    for (const s of persisted) {
      byId.set(s.id, { ...s, boardId });
    }
    const view = this.view;
    const isPrimaryHouseBoard = !this.customBoardId && (this.activeBoardFurnitureId || 'board') === 'board';
    if (view && isPrimaryHouseBoard) {
      const targetHouseOwner = this.houseOwnerId || view.identity.fingerprint;
      for (const netStroke of view.network.strokes) {
        if (netStroke.boardId === targetHouseOwner || netStroke.boardId === boardId) {
          byId.set(netStroke.id, { ...netStroke, boardId });
        }
      }
    }
    for (const pStroke of this.pendingStrokes) {
      if (pStroke.boardId === boardId && !byId.has(pStroke.id)) {
        byId.set(pStroke.id, pStroke);
      }
    }
    for (const oStroke of this.offlineStrokes) {
      if (oStroke.boardId === boardId) {
        byId.set(oStroke.id, oStroke);
      }
    }
    return Array.from(byId.values());
  }

private canDrawBoard(): boolean {
    const view = this.view;
    if (!view || view.lockedIdentity) return false;
    const boardId = this.boardId();
    if (!this.expansion.boardRegistry.canEdit(boardId, view.identity.fingerprint, view.network.isHost)) {
      return false;
    }
    if (this.customBoardId) {
      return true;
    }
    const targetOwner = this.houseOwnerId || view.identity.fingerprint;
    if (view.network.phase !== 'JOINED') return targetOwner === view.identity.fingerprint;
    const own = view.network.members.find((member) => member.identity.fingerprint === view.identity.fingerprint);
    return own?.houseId === targetOwner;
  }

private undoStroke(): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const ownShapes = this.expansion.boardRegistry
      .getRichElements(boardId)
      .filter((s) => s.authorId === view.identity.fingerprint);
    if (ownShapes.length > 0) {
      const lastShape = ownShapes[ownShapes.length - 1];
      this.expansion.boardRegistry.deleteRichElement(boardId, lastShape.id, view.identity.fingerprint, view.network.isHost);
      this.boardExtraFrames = 3;
      this.refreshBoardControls();
      return;
    }
    const stroke = newestOwnStroke(this.allStrokes(boardId), view.identity.fingerprint, boardId);
    if (!stroke) return;
    this.removeOwnStroke(stroke);
    this.refreshBoardControls();
  }

private redoStroke(): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const popped = this.expansion.boardRegistry.popRedoStroke(boardId, view.identity.fingerprint);
    if (!popped) return;
    this.saveStroke(
      { points: popped.points, tool: popped.tool, color: popped.color, width: popped.width },
      popped.text,
    );
    this.boardExtraFrames = 3;
    this.refreshBoardControls();
  }

private removeOwnStroke(stroke: BoardStroke): void {
    this.expansion.boardRegistry.pushRedoStroke(stroke.boardId, stroke.author, { ...stroke, deleted: false });
    this.expansion.boardRegistry.markStrokeDeleted(stroke.boardId, stroke.id);
    const offline = this.offlineStrokes.find((item) => item.id === stroke.id);
    if (offline) offline.deleted = true;
    const pending = this.pendingStrokes.find((item) => item.id === stroke.id);
    if (pending) pending.deleted = true;
    if (this.view?.network.phase === 'JOINED') {
      this.run(() => this.actions.deleteStroke(stroke.id));
    }
  }

private clearOwnStrokes(): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const own = this.allStrokes(boardId).filter((stroke) => stroke.author === view.identity.fingerprint && !stroke.deleted);
    for (const stroke of own) this.removeOwnStroke(stroke);
    for (const shape of this.expansion.boardRegistry.getRichElements(boardId)) {
      if (shape.authorId === view.identity.fingerprint) {
        this.expansion.boardRegistry.deleteRichElement(boardId, shape.id, view.identity.fingerprint, view.network.isHost);
      }
    }
    this.boardExtraFrames = 3;
    this.notify(own.length ? `Se borraron ${own.length} trazo(s) tuyos.` : 'Pizarra propia limpiada.');
    this.refreshBoardControls();
  }

private eraseAt(point: BoardPoint): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const radius = 8 / this.boardCamera().zoom;
    let erased = false;
    for (const stroke of this.allStrokes(boardId)) {
      if (stroke.author !== view.identity.fingerprint || stroke.deleted || this.hiddenAuthors.has(stroke.author)) continue;
      if (strokeHit(stroke, point, radius, textBox(stroke))) { this.removeOwnStroke(stroke); erased = true; }
    }
    if (erased) this.refreshBoardControls();
  }

private boardCamera(): BoardCamera {
    return this.boardCameras.get(this.boardId()) ?? DEFAULT_CAMERA;
  }

private setBoardCamera(camera: BoardCamera): void {
    this.boardCameras.set(this.boardId(), camera);
    setText(this.boardZoomLabel, `${Math.round(camera.zoom * 100)}%`);
    this.positionBoardTextInput();
  }

private zoomBoard(factor: number): void {
    this.setBoardCamera(zoomAt(this.boardCamera(), 384, 216, factor));
  }

private fitBoard(): void {
    const boardId = this.boardId();
    const strokes = visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
    this.setBoardCamera(fitCamera(strokesBounds(strokes, textBox), 768, 432));
  }

private boardWorldPoint(event: MouseEvent): BoardPoint {
    const local = this.canvasPoint(event, this.boardCanvas);
    return screenToWorld(this.boardCamera(), local.x, local.y);
  }

private openBoardText(at: BoardPoint): void {
    this.commitBoardText();
    const input = node('textarea', 'sv-board-text');
    input.rows = 1;
    input.maxLength = LIMITS.boardText;
    input.placeholder = 'Escribe… ($x^2$ para fórmulas)';
    input.setAttribute('aria-label', 'Texto para la pizarra');
    input.dataset.x = String(at.x);
    input.dataset.y = String(at.y);
    input.style.color = this.boardColor.value;
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); this.cancelBoardText(); }
      else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); this.commitBoardText(); }
    });
    input.addEventListener('input', () => {
      input.rows = Math.min(8, input.value.split('\n').length);
    });
    input.addEventListener('blur', () => { if (this.boardTextInput === input) this.commitBoardText(); });
    this.boardTextInput = input;
    this.boardWrap.append(input);
    this.positionBoardTextInput();
    input.focus();
  }

private positionBoardTextInput(): void {
    const input = this.boardTextInput;
    if (!input) return;
    const camera = this.boardCamera();
    const x = Number(input.dataset.x);
    const y = Number(input.dataset.y);
    // Logical 768x432 units to the canvas's displayed size.
    const scale = this.boardCanvas.clientWidth / 768 || 1;
    const size = textFontPx(Number(this.boardWidth.value)) * camera.zoom * scale;
    input.style.left = `${(x - camera.x) * camera.zoom * scale}px`;
    input.style.top = `${(y - camera.y) * camera.zoom * scale}px`;
    input.style.fontSize = `${Math.max(10, size)}px`;
  }

private cancelBoardText(): void {
    this.boardTextInput?.remove();
    this.boardTextInput = null;
  }

private commitBoardText(): void {
    const input = this.boardTextInput;
    if (!input) return;
    this.boardTextInput = null;
    const value = input.value.replace(/\s+$/, '');
    const at = { x: Number(input.dataset.x), y: Number(input.dataset.y) };
    input.remove();
    if (!value.trim()) return;
    this.saveStroke({ points: [at], tool: 'text', color: this.boardColor.value, width: Number(this.boardWidth.value) }, value);
  }

private exportBoard(): void {
    const boardId = this.boardId();
    const strokes = this.boardExportMode.value === 'all'
      ? this.allStrokes(boardId).filter((stroke) => !stroke.deleted)
      : visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
    // The board is infinite, so the export frames everything that was drawn
    // rather than whatever happens to be on screen.
    this.run(async () => this.actions.exportBoard(await renderBoardForExport(strokes)));
  }

private refreshBoardSwatches(): void {
    const active = this.boardColor.value.toLowerCase();
    for (const [hex, btn] of this.boardSwatchButtons) {
      btn.classList.toggle('is-active', hex === active);
    }
  }

private insertBoardFormula(formula: string): void {
    if (!this.canDrawBoard()) {
      this.notify('Entra en una casa para escribir en su pizarra.');
      return;
    }
    if (this.boardTextInput) {
      const input = this.boardTextInput;
      const { text, caret } = insertAtSelection(input.value, formula, input.selectionStart, input.selectionEnd);
      input.value = text;
      input.focus();
      input.setSelectionRange(caret, caret);
      return;
    }
    const cam = this.boardCamera();
    const center = clampBoardPoint({
      x: Math.round(cam.x + 384 / cam.zoom - 60),
      y: Math.round(cam.y + 216 / cam.zoom - 16),
    });
    this.boardTool = 'text';
    this.refreshBoardControls();
    this.openBoardText(center);
    const activeInput = this.boardTextInput as HTMLTextAreaElement | null;
    if (activeInput) {
      activeInput.value = formula;
      activeInput.select();
    }
  }

private insertCoordinateAxes(): void {
    if (!this.canDrawBoard()) {
      this.notify('Entra en una casa para dibujar en su pizarra.');
      return;
    }
    const cam = this.boardCamera();
    const cx = Math.round(cam.x + 384 / cam.zoom);
    const cy = Math.round(cam.y + 216 / cam.zoom);
    const span = Math.round(110 / cam.zoom);
    const color = this.boardColor.value;
    this.saveStroke({
      points: [clampBoardPoint({ x: cx - span, y: cy }), clampBoardPoint({ x: cx + span, y: cy })],
      tool: 'line',
      color,
      width: 2,
    });
    this.saveStroke({
      points: [clampBoardPoint({ x: cx, y: cy - span }), clampBoardPoint({ x: cx, y: cy + span })],
      tool: 'line',
      color,
      width: 2,
    });
  }

private canvasPoint(event: MouseEvent, canvas: HTMLCanvasElement): BoardPoint {
    const rect = canvas.getBoundingClientRect();
    // Map client coordinates to the logical 768x432 coordinate system even when physical bitmap is 2x HiDPI (1536x864)
    return {
      x: (event.clientX - rect.left) * 768 / (rect.width || 768),
      y: (event.clientY - rect.top) * 432 / (rect.height || 432),
    };
  }

private interactOrWalk(target: Interaction): void {
    if (target.near()) { this.pendingInteraction = null; this.moveTarget = null; target.run(); return; }
    if (this.walkTo(target.x, target.y)) this.pendingInteraction = target;
  }

private walkTo(x: number, y: number): boolean {
    const view = this.view;
    if (!view) return false;
    const house = this.pane === 'house' ? this.currentHouse() || view.ownHouse : null;
    const obstacles = house ? houseObstacles(house)
      : this.currentArea === 'residential' ? worldObstacles(occupiedParcels(view)) : this.expansion.objectRegistry.obstaclesForArea(this.currentArea);
    const path = findPath(this.localPosition, { x, y }, obstacles, house ? HOUSE_BOUNDS : WORLD_AREAS[this.currentArea].bounds);
    if (!path) { this.notify('No hay camino hasta ahí.'); return false; }
    this.moveTarget = path.shift() ?? { x, y };
    this.movePath = path;
    return true;
  }

private onStagePointerDown = (event: PointerEvent): void => {
    const view = this.view;
    if (!view || this.settingsDialog.open || this.activityOpen) return;
    if (!this.phone.hidden) { this.closePhone(); return; }
    const point = this.canvasPoint(event, this.stageCanvas);
    if (this.decorating && this.pendingFurniture && this.pane === 'house') {
      this.previewNewFurniture(point.x, point.y);
      if (this.previewHouse && !this.decorationInvalid) { const item = this.previewHouse.furniture.at(-1)!; if (this.commitDecoration(this.previewHouse, item.id)) { this.pendingFurniture = null; this.previewHouse = null; } }
      else this.notify(this.decorationInvalid || 'Elige una posición libre.');
      return;
    }
    const allowTapMove = event.pointerType === 'touch' || this.touchControlsForced === true;
    const target = this.interactionAt(point);
    if (this.pane === 'house') {
      const house = this.currentHouse();
      const item = house ? hitFurniture(house, point.x, point.y) : null;
      this.selectedFurnitureId = item?.id || null;
      this.refreshHouseEditor();
      // Furniture moves only while explicitly decorating.
      if (this.decorating && item && house && house.ownerId === view.identity.fingerprint) {
        this.drag = { id: item.id, offsetX: point.x - item.x, offsetY: point.y - item.y, baseHouse: house };
        this.dragMoved = false;
        this.stageCanvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }
    if (this.decorating) return;
    if (target) { this.interactOrWalk(target); return; }
    if (allowTapMove) { this.pendingInteraction = null; this.walkTo(point.x, point.y); }
  };

private onStagePointerMove = (event: PointerEvent): void => {
    if (this.decorating && this.pendingFurniture) { const p = this.canvasPoint(event, this.stageCanvas); this.previewNewFurniture(p.x, p.y); return; }
    if (!this.drag || !this.view) return;
    const point = this.canvasPoint(event, this.stageCanvas);
    const snap = (n: number) => this.decorationGrid ? Math.round(n / 8) * 8 : n;
    const x = snap(point.x - this.drag.offsetX);
    const y = snap(point.y - this.drag.offsetY);
    const item = this.drag.baseHouse.furniture.find((f) => f.id === this.drag!.id);
    if (!this.dragMoved && item && Math.hypot(item.x - x, item.y - y) < 4) return;
    this.dragMoved = true;
    this.previewHouse = moveFurniture(this.drag.baseHouse, this.drag.id, x, y, this.view.identity.fingerprint);
    this.decorationInvalid = placementError(this.previewHouse, this.drag.id);
  };

private onStagePointerUp = (event: PointerEvent): void => {
    if (!this.drag) return;
    if (this.stageCanvas.hasPointerCapture(event.pointerId)) this.stageCanvas.releasePointerCapture(event.pointerId);
    const clicked = !this.dragMoved && event.type === 'pointerup';
    if (event.type === 'pointerup' && this.previewHouse && this.previewHouse !== this.drag.baseHouse) this.commitDecoration(this.previewHouse, this.drag.id);
    this.previewHouse = null;
    this.drag = null;
    if (clicked && !this.decorating) {
      const target = this.interactionAt(this.canvasPoint(event, this.stageCanvas));
      if (target) this.interactOrWalk(target);
    }
  };

private onBoardPointerDown = (event: PointerEvent): void => {
    this.activeBoardPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    if (this.activeBoardPointers.size >= 2) {
      if (this.boardDraft && this.boardDraft.points.length <= 2) {
        this.boardDraft = null;
      }
      const pts = Array.from(this.activeBoardPointers.values());
      this.lastPinchDistance = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      return;
    }
    // Middle button, or the hand tool, pans. Panning never needs permission,
    // so you can look around a friend's board you are not allowed to edit.
    if (event.button === 1 || (this.boardTool === 'hand' && event.button === 0)) {
      this.boardPan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      this.boardCanvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (event.button !== 0) return;
    if (!this.canDrawBoard()) return;
    const point = clampBoardPoint(this.boardWorldPoint(event));
    if (this.boardTool === 'eraser') {
      this.boardErasing = event.pointerId;
      this.boardCanvas.setPointerCapture(event.pointerId);
      this.eraseAt(point);
      event.preventDefault();
      return;
    }
    if (boardAtCapacity(this.allStrokes(this.boardId()), this.boardId())) return;
    if (this.richBoardTool) {
      this.richBoardDraft = { kind: this.richBoardTool, start: point, current: point };
      this.boardCanvas.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (this.boardTool === 'text') {
      event.preventDefault();
      this.openBoardText(point);
      return;
    }
    const tool = this.boardTool;
    if (tool === 'hand') return;
    this.boardDraft = { points: [point], tool, color: this.boardColor.value, width: Number(this.boardWidth.value) };
    this.boardCanvas.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

private onBoardPointerMove = (event: PointerEvent): void => {
    if (this.activeBoardPointers.has(event.pointerId)) {
      this.activeBoardPointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
    }
    if (this.activeBoardPointers.size >= 2) {
      const pts = Array.from(this.activeBoardPointers.values());
      const dist = Math.hypot(pts[0].clientX - pts[1].clientX, pts[0].clientY - pts[1].clientY);
      const midX = (pts[0].clientX + pts[1].clientX) / 2;
      const midY = (pts[0].clientY + pts[1].clientY) / 2;
      const localMid = this.canvasPoint({ clientX: midX, clientY: midY } as MouseEvent, this.boardCanvas);

      if (this.lastPinchDistance > 8 && dist > 8) {
        const factor = dist / this.lastPinchDistance;
        this.setBoardCamera(zoomAt(this.boardCamera(), localMid.x, localMid.y, factor));
      }
      this.lastPinchDistance = dist;
      return;
    }

    this.boardCursor = this.canvasPoint(event, this.boardCanvas);
    if (this.boardPan && event.pointerId === this.boardPan.pointerId) {
      const scale = 768 / (this.boardCanvas.clientWidth || 768);
      this.setBoardCamera(panBy(this.boardCamera(), (event.clientX - this.boardPan.x) * scale, (event.clientY - this.boardPan.y) * scale));
      this.boardPan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      return;
    }
    if (this.boardErasing === event.pointerId) { this.eraseAt(clampBoardPoint(this.boardWorldPoint(event))); return; }
    if (this.richBoardDraft) {
      this.richBoardDraft.current = clampBoardPoint(this.boardWorldPoint(event));
      this.boardExtraFrames = 2;
      return;
    }
    if (!this.boardDraft) return;
    const point = clampBoardPoint(this.boardWorldPoint(event));
    const points = this.boardDraft.points;
    if (this.boardDraft.tool === 'pen') {
      const last = points[points.length - 1];
      const minStep = 2 / this.boardCamera().zoom;
      if (points.length < LIMITS.strokePoints && Math.hypot(point.x - last.x, point.y - last.y) >= minStep) points.push(point);
    } else points[1] = point;
  };

private onBoardPointerUp = (event: PointerEvent): void => {
    this.activeBoardPointers.delete(event.pointerId);
    if (this.activeBoardPointers.size < 2) {
      this.lastPinchDistance = 0;
    }
    if (this.boardCanvas.hasPointerCapture(event.pointerId)) this.boardCanvas.releasePointerCapture(event.pointerId);
    if (this.boardPan?.pointerId === event.pointerId) { this.boardPan = null; return; }
    if (this.boardErasing === event.pointerId) { this.boardErasing = null; return; }
    if (this.richBoardDraft && this.view) {
      const rDraft = this.richBoardDraft;
      this.richBoardDraft = null;
      this.expansion.boardRegistry.addRichElement(
        this.boardId(),
        this.view.identity.fingerprint,
        this.view.identity.displayName,
        rDraft.kind,
        this.boardColor.value,
        Number(this.boardWidth.value),
        [rDraft.start, rDraft.current],
        undefined,
        this.view.network.isHost,
      );
      this.boardExtraFrames = 3;
      this.refreshBoardControls();
      return;
    }
    const draft = this.boardDraft;
    if (!draft) return;
    this.boardDraft = null;
    this.saveStroke(draft);
  };

private onBoardWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const local = this.canvasPoint(event, this.boardCanvas);
    // Ctrl+wheel is also what a trackpad pinch sends, so it zooms; a plain
    // wheel or two-finger swipe pans, as in other infinite canvases.
    if (event.ctrlKey || event.metaKey) {
      this.setBoardCamera(zoomAt(this.boardCamera(), local.x, local.y, Math.exp(-event.deltaY * 0.0025)));
    } else {
      const scale = 768 / (this.boardCanvas.clientWidth || 768);
      this.setBoardCamera(panBy(this.boardCamera(), -event.deltaX * scale, -event.deltaY * scale));
    }
  };

private saveStroke(draft: { points: BoardPoint[]; tool: BoardStroke['tool']; color: string; width: number }, text?: string): void {
    const view = this.view;
    if (!view) return;
    const boardId = this.boardId();
    const existing = this.allStrokes(boardId);
    if (boardAtCapacity(existing, boardId)) return;
    const online = view.network.phase === 'JOINED';
    const stroke = makeStroke(
      boardId,
      view.identity.fingerprint,
      nextSequence(existing, view.identity.fingerprint, boardId),
      draft.tool,
      draft.color,
      draft.width,
      draft.points,
      undefined,
      text,
    );
    // Persist immediately per independent whiteboard ID
    this.expansion.boardRegistry.saveStroke(boardId, stroke);
    const isPrimaryHouseBoard = !this.customBoardId && (this.activeBoardFurnitureId || 'board') === 'board';
    if (online && isPrimaryHouseBoard) {
      this.pendingStrokes.push(stroke);
      const wireBoardId = this.houseOwnerId || view.identity.fingerprint;
      this.run(() => this.actions.sendStroke({ ...stroke, boardId: wireBoardId }));
    } else {
      this.offlineStrokes.push(stroke);
    }
    this.lastBoardRenderSig = '';
    this.boardExtraFrames = 3;
    this.refreshBoardControls();
  }

private onKeyDown = (event: KeyboardEvent): void => {
    if (!this.view || this.settingsDialog.open || this.view.lockedIdentity) return;
    const key = event.key.toLowerCase();
    if (this.decorating && key === 'escape') { if (this.pendingFurniture || this.drag || this.previewHouse) { this.pendingFurniture = null; this.drag = null; this.previewHouse = null; this.decorationInvalid = null; } else this.endDecoration(); event.preventDefault(); return; }
    if (this.decorating) return;
    if (key === 'escape' && this.activityOpen && !this.isTypingTarget(event.target)) { this.expansion.closeModal(); event.preventDefault(); return; }
    if (key === 'escape' && !this.phone.hidden) { this.closePhone(); event.preventDefault(); return; }
    if (this.isTypingTarget(event.target) || this.activityOpen) return;
    if (key === 'm' && !event.repeat && !event.ctrlKey && !event.metaKey) {
      if (this.phone.hidden) this.openPhone('home'); else this.closePhone();
      event.preventDefault();
      return;
    }
    if (!this.phone.hidden) return;
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'shift'].includes(key)) {
      this.keys.add(key);
      if (this.pane === 'world' || this.pane === 'house') event.preventDefault();
    }
    if (key === 'e' && !event.repeat) {
      this.triggerInteraction();
    }
    if (event.code === 'Space' && this.view.network.media.pushToTalk && this.view.network.media.micEnabled && !event.repeat) {
      this.actions.setTalking(true);
      event.preventDefault();
    }
    if (key === 'escape' && this.pane === 'board' && !this.boardAdvancedPanel.hidden) {
      this.boardAdvancedPanel.hidden = true;
      this.boardAdvancedToggle.setAttribute('aria-expanded', 'false');
      this.boardAdvancedToggle.focus();
      event.preventDefault();
      return;
    }
    // Escape steps back one level: board -> room, room -> village.
    if (key === 'escape' && this.pane === 'board' && this.houseOwnerId) this.returnToRoom();
    else if (key === 'escape' && (this.pane === 'house' || this.pane === 'board')) this.leaveCurrentHouse();
  };

private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
    if (event.code === 'Space' && this.view?.network.media.pushToTalk) this.actions.setTalking(false);
  };

private onBlur = (): void => {
    this.keys.clear();
    this.touchSprint = false;
    this.dpadKeys.clear();
    this.moveTarget = null;
    if (this.view?.network.media.pushToTalk) this.actions.setTalking(false);
  };

private isTypingTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable);
  }

private visiblePeople(view: AppView): DrawPerson[] {
    const sceneHouse = this.pane === 'house' ? this.houseOwnerId : null;
    const people: DrawPerson[] = [{ identity: view.identity, position: this.localPosition, isOwn: true }];
    for (const member of view.network.members) {
      if (!member.connected || member.identity.fingerprint === view.identity.fingerprint || !isInScene(member, this.currentArea, sceneHouse)) continue;
      people.push({ identity: member.identity, position: member.position, isOwn: false });
    }
    return people;
  }
```

### app/src/ui/app.ts — frame de movimiento, sprint y publicación

Fragmento del frame de referencia. Las llamadas a renderers/servicios del controlador antiguo se adaptan al alcance clásico; no copiar un segundo loop RAF.

SHA-256 del bloque: `dfae2c98a238cf5dfac5da03edbddc3c07aba4cd2f4a3290d71cc6ed6af4f2c3`.

```ts
private tick = (now: number): void => {
    if (document.hidden || (this.lastFrame && now - this.lastFrame < 1000 / 61)) {
      if (document.hidden) this.lastFrame = now;
      this.raf = requestAnimationFrame(this.tick); return;
    }
    const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, 0.05) : 0;
    this.lastFrame = now;
    advanceAnim(dt);
    const view = this.view;
    if (view && (this.pane === 'world' || this.pane === 'house')) {
      let vx = Number(this.keys.has('d') || this.keys.has('arrowright') || this.dpadKeys.has('arrowright'))
        - Number(this.keys.has('a') || this.keys.has('arrowleft') || this.dpadKeys.has('arrowleft'));
      let vy = Number(this.keys.has('s') || this.keys.has('arrowdown') || this.dpadKeys.has('arrowdown'))
        - Number(this.keys.has('w') || this.keys.has('arrowup') || this.dpadKeys.has('arrowup'));

      if (this.phone.hidden === false || this.activityOpen || this.decorating) {
        vx = 0; vy = 0;
      }
      if (!this.moveTarget) this.movePath = [];
      if (vx !== 0 || vy !== 0) {
        this.moveTarget = null;
        this.movePath = [];
        this.pendingInteraction = null;
      } else if (this.moveTarget) {
        let dx = this.moveTarget.x - this.localPosition.x;
        let dy = this.moveTarget.y - this.localPosition.y;
        // Reaching a corner turns straight to the next one.
        if (Math.hypot(dx, dy) < 6 && this.movePath.length) {
          this.moveTarget = this.movePath.shift()!;
          dx = this.moveTarget.x - this.localPosition.x;
          dy = this.moveTarget.y - this.localPosition.y;
        }
        const dist = Math.hypot(dx, dy);
        if (dist < 6) {
          this.moveTarget = null;
        } else {
          vx = dx / dist;
          vy = dy / dist;
        }
      }

      const running = (this.keys.has('shift') || this.touchSprint) && this.phone.hidden && !this.activityOpen;
      const vector = { x: vx, y: vy };
      const previous = this.localPosition;
      const areaMeta = WORLD_AREAS[this.currentArea];
      const worldObs = this.currentArea === 'residential'
        ? worldObstacles(occupiedParcels(view))
        : this.expansion.objectRegistry.obstaclesForArea(this.currentArea);
      const next = this.pane === 'world'
        ? stepPosition(previous, vector, dt, worldObs, areaMeta.bounds, running ? 275 : 110)
        : stepHousePosition(previous, vector, dt, this.currentHouse() || view.ownHouse, running ? 2.5 : 1);

      if (this.moveTarget && Math.hypot(next.x - previous.x, next.y - previous.y) < 0.01 && dt > 0) {
        this.moveTarget = null;
      }

      this.localPosition = next;
      if (!this.moveTarget && this.pendingInteraction) {
        const arrived = this.pendingInteraction;
        this.pendingInteraction = null;
        if (arrived.near()) arrived.run();
        else this.notify('No llego hasta ahí. Acércate caminando y vuelve a intentarlo.');
      }
      if (view.network.phase === 'JOINED' && (next.x !== previous.x || next.y !== previous.y || next.moving !== previous.moving)
        && (now - this.lastMoveSent > 80 || !next.moving)) {
        this.lastMoveSent = now;
        this.actions.move({ ...next, areaId: this.currentArea });
      }
      const people = this.visiblePeople(view);
      const sceneLabel = this.pane === 'house' ? 'Interior de la casa' : WORLD_AREAS[this.currentArea].displayName;
      this.stageCanvas.setAttribute('aria-label', `${sceneLabel} · Personas aquí: ${people.map(person => person.identity.displayName).join(', ')}`);
      const activeHouse = this.previewHouse || this.currentHouse() || view.ownHouse;
      const occupied = occupiedParcels(view);
      const calm = reducedMotion();
      this.expansion.environment.tick(dt);
      const envState = this.expansion.environment.getState();
      const anyMoving = people.some((p) => p.position.moving) || !!this.moveTarget
        || envState.cycleMode === 'auto' || envState.weather !== 'clear';
      const stageSig = calm && !anyMoving
        ? JSON.stringify([this.pane, this.currentArea, envState.timeOfDay, envState.weather, this.selectedFurnitureId, activeHouse, occupied.map((o) => [o.ownerId, o.house.revision]), people, getAvatarCustomization()])
        : '';
      if (!calm || anyMoving || stageSig !== this.lastStageRenderSig) {
        this.lastStageRenderSig = stageSig;
        const ctx = this.stageCanvas.getContext('2d');
        if (ctx) {
          const scaleX = this.stageCanvas.width / 768;
          const scaleY = this.stageCanvas.height / 432;
          ctx.save();
          ctx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
          const nearFurniture = this.pane === 'house' && !atHouseDoor(this.localPosition)
            ? closestFurniture(this.localPosition, activeHouse)
            : null;
          const nearWorldObj = this.pane === 'world'
            ? this.expansion.objectRegistry.closestInteractable(this.currentArea, this.localPosition.x, this.localPosition.y, view.identity.fingerprint)
            : null;
          const nearPortal = this.pane === 'world'
            ? closestPortal(this.currentArea, this.localPosition)
            : null;
          if (this.pane === 'world') {
            if (this.currentArea === 'residential') {
              drawWorld(ctx, occupied, people, dt);
            } else if (this.currentArea === 'community') {
              drawCommunityPlaza(
                ctx,
                people,
                this.expansion.objectRegistry,
                nearWorldObj?.id || null,
                null,
                nearPortal?.id || null,
                dt,
              );
            } else {
              drawStudyLibrary(
                ctx,
                people,
                this.expansion.objectRegistry,
                nearWorldObj?.id || null,
                null,
                nearPortal?.id || null,
                dt,
              );
            }
            this.expansion.environment.drawAtmosphere(
              ctx,
              768,
              432,
              areaMeta.lampPositions,
              areaMeta.isInterior,
            );
          } else {
            const isOwnHouse = !this.houseOwnerId || this.houseOwnerId === view.identity.fingerprint;
            const scope = isOwnHouse ? 'own' : activeHouse.ownerId;
            const perItemSprites = new Map<string, HTMLImageElement | null>();
            for (const f of activeHouse.furniture) {
              if (f.kind === 'board') {
                const bSprite = this.expansion.boardRegistry.getDecodedBoardSprite(houseBoardId(scope, f.id));
                if (bSprite) perItemSprites.set(f.id, bSprite);
              }
            }
            drawHouseInterior(ctx, activeHouse, people, this.selectedFurnitureId, dt, this.decorating ? null : nearFurniture?.id || null, perItemSprites);
            if (this.decorating) {
              if (this.decorationGrid) { ctx.save(); ctx.fillStyle = '#ffffff55'; for (let x = HOUSE_BOUNDS.x; x < 740; x += 8) for (let y = HOUSE_BOUNDS.y; y < 406; y += 8) ctx.fillRect(x, y, 1, 1); ctx.restore(); }
              const candidate = this.previewHouse?.furniture.find(f => f.id === (this.drag?.id || this.previewHouse?.furniture.at(-1)?.id));
              if (candidate) { const r = furnitureRect(candidate); ctx.save(); ctx.fillStyle = this.decorationInvalid ? '#d8444450' : '#59b87140'; ctx.fillRect(r.x, r.y, r.w, r.h); ctx.strokeStyle = this.decorationInvalid ? '#b52828' : '#387e45'; ctx.strokeRect(r.x, r.y, r.w, r.h); ctx.restore(); }
            }
          }
          if (this.moveTarget) {
            ctx.save();
            ctx.strokeStyle = '#e0724c';
            ctx.fillStyle = 'rgba(224, 114, 76, 0.2)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.moveTarget.x, this.moveTarget.y, 6 + Math.sin(now / 120) * 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
          }
          const prompt = this.pane === 'world'
            ? nearPortal
              ? nearPortal.prompt
              : this.currentArea === 'residential' && closestDoor(this.localPosition, occupied)
                ? 'E · Entrar'
                : nearWorldObj
                  ? `E · ${nearWorldObj.displayName}`
                  : null
            : atHouseDoor(this.localPosition)
              ? 'E · Salir'
              : nearFurniture
                ? FURNITURE_PROMPT_LABELS[nearFurniture.kind]
                : null;
          if (prompt) drawPrompt(ctx, this.localPosition.x, this.localPosition.y - 66, prompt);
          this.updateTouchActionPrompt(prompt);
          ctx.restore();
        }
      }
    }
    if (view && this.pane === 'board') {
      const boardId = this.boardId();
      const visible = visibleStrokes(this.allStrokes(boardId), boardId, this.hiddenAuthors);
      const richShapes = this.expansion.boardRegistry.getRichElements(boardId);
      const cam = this.boardCamera();
      const cursor = this.boardTool === 'eraser' ? this.boardCursor : null;
      const boardSig = JSON.stringify([boardId, visible.map((s) => s.id), richShapes.map((s) => s.id), this.boardDraft, this.richBoardDraft, cam, cursor, getMathGeneration()]);
      if (boardSig !== this.lastBoardRenderSig) {
        this.lastBoardRenderSig = boardSig;
        this.boardExtraFrames = 2;
      }
      if (this.boardExtraFrames > 0) {
        this.boardExtraFrames--;
        const ctx = this.boardCanvas.getContext('2d');
        if (ctx) {
          const scale = this.boardCanvas.width / 768;
          ctx.save();
          ctx.setTransform(scale, 0, 0, scale, 0, 0);
          drawBoard(ctx, visible, this.boardDraft, cam, 768, 432, false, scale);
          ctx.save();
          ctx.scale(cam.zoom, cam.zoom);
          ctx.translate(-cam.x, -cam.y);
          this.expansion.boardRegistry.drawRichLayer(ctx, boardId);
          if (this.richBoardDraft) {
            ctx.strokeStyle = this.boardColor.value;
            ctx.lineWidth = Number(this.boardWidth.value);
            if (this.richBoardDraft.kind === 'circle') {
              const cx = (this.richBoardDraft.start.x + this.richBoardDraft.current.x) / 2;
              const cy = (this.richBoardDraft.start.y + this.richBoardDraft.current.y) / 2;
              const rx = Math.max(4, Math.abs(this.richBoardDraft.current.x - this.richBoardDraft.start.x) / 2);
              const ry = Math.max(4, Math.abs(this.richBoardDraft.current.y - this.richBoardDraft.start.y) / 2);
              ctx.beginPath();
              ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
              ctx.stroke();
            } else {
              ctx.beginPath();
              ctx.moveTo(this.richBoardDraft.start.x, this.richBoardDraft.start.y);
              ctx.lineTo(this.richBoardDraft.current.x, this.richBoardDraft.current.y);
              ctx.stroke();
            }
          }
          ctx.restore();
          if (cursor) {
            ctx.strokeStyle = 'rgba(194, 84, 63, 0.85)';
            ctx.fillStyle = 'rgba(194, 84, 63, 0.14)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(cursor.x, cursor.y, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
        }
      }
    }
    this.raf = requestAnimationFrame(this.tick);
  };
```

### app/src/study/decks.ts — repositorio manual independiente

Variante compilable sin proveedor, red ni inferencia. La plantilla antigua se construye exclusivamente para reconocer y ocultar el legado intacto, se retira antes de cargar datos del usuario y nunca se muestra como mazo nuevo.

SHA-256 del bloque: `424c8cc924a7fa44c7a14d255ba955704a2f860bece5eb4b6f4d4b5f441a0958`.

```ts
import {z} from 'zod';
import {LIMITS} from '../protocol/types';
const FORBIDDEN_PATTERNS = /<\s*\/?\s*(script|iframe|object|embed|svg|onload|onerror)/gi;

export function sanitizeStudyText(raw: string, maxLen: number = LIMITS.boardText): string {
  const cleaned = raw
    .replace(FORBIDDEN_PATTERNS, '')
    .replace(/javascript:/gi, '')
    .replace(/\u0000/g, '')
    .trim();
  return cleaned.slice(0, maxLen);
}


export type FlashcardDifficulty = 'easy' | 'medium' | 'hard';
export type FlashcardStyle = 'concise' | 'detailed' | 'exam' | 'conceptual';
export type DeckVisibility = 'private' | 'shared_read' | 'shared_write';

export interface FlashcardItem {
  id: string;
  question: string;
  answer: string;
  hint?: string;
  explanation?: string;
  sourceRef?: string;
  choices?: string[];
  correctChoice?: number;
  topic: string;
  difficulty: FlashcardDifficulty;
  tags: string[];
}

export interface FlashcardDeck {
  id: string;
  title: string;
  topic: string;
  sourceType: 'note' | 'selection' | 'topic' | 'manual';
  sourceNoteId?: string;
  ownerId: string;
  visibility?: DeckVisibility;
  cards: FlashcardItem[];
  createdAt: number;
  updatedAt: number;
  provider: 'manual' | 'local';
}

export const flashcardItemSchema = z.object({
  id: z.string().min(1).max(64),
  question: z.string().min(1).max(260),
  answer: z.string().min(1).max(400),
  hint: z.string().max(220).optional(),
  explanation: z.string().max(320).optional(),
  sourceRef: z.string().max(120).optional(),
  choices: z.array(z.string().trim().min(1).max(120)).min(2).max(4).optional(),
  correctChoice: z.number().int().min(0).max(3).optional(),
  topic: z.string().min(1).max(100),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  tags: z.array(z.string().min(1).max(32)).max(8),
}).refine(c => c.choices ? c.correctChoice !== undefined && c.correctChoice < c.choices.length && new Set(c.choices).size === c.choices.length : c.correctChoice === undefined, 'Opciones de concurso inválidas.');

export const flashcardDeckSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(120),
  topic: z.string().min(1).max(100),
  sourceType: z.enum(['note', 'selection', 'topic', 'manual']),
  sourceNoteId: z.string().max(96).optional(),
  ownerId: z.string().min(1).max(128),
  visibility: z.enum(['private', 'shared_read', 'shared_write']).optional(),
  cards: z.array(flashcardItemSchema).min(0).max(100),
  createdAt: z.number().nonnegative(),
  updatedAt: z.number().nonnegative(),
  provider: z.enum(['manual', 'local']),
});


const DECKS_STORAGE_KEY='studyvillage-flashcard-decks-v1';
export class ManualDeckRepository {
  private decks=new Map<string,FlashcardDeck>();
constructor() {
    this.seedDefaultDeck();
    const template = this.decks.get('deck:starter-studyvillage');
    this.decks.clear();
    this.loadDecksFromStorage();
    const old = this.decks.get('deck:starter-studyvillage');
    if (old && template && old.title === template.title && JSON.stringify(old.cards) === JSON.stringify(template.cards)) this.decks.delete(old.id);
  }

private seedDefaultDeck(): void {
    const now = Date.now();
    const starter: FlashcardDeck = {
      id: 'deck:starter-studyvillage',
      title: 'Mazo Manual · Fundamentos de Estudio',
      topic: 'Algoritmos y Cálculo',
      sourceType: 'manual',
      ownerId: 'local-host',
      visibility: 'shared_write',
      cards: [
        {
          id: 'card:manual-1',
          question: '¿Cuál es la complejidad temporal de la búsqueda binaria en un arreglo ordenado?',
          answer: 'O(log n), ya que divide el espacio de búsqueda a la mitad en cada comparación.',
          hint: 'Piensa en cuántas veces puedes dividir n entre 2 hasta llegar a 1.',
          explanation: 'El invariante mantiene el elemento buscado dentro del subintervalo [low, high].',
          topic: 'Algoritmos y Cálculo',
          difficulty: 'easy',
          tags: ['algoritmos', 'busqueda'],
        },
        {
          id: 'card:manual-2',
          question: '¿Qué establece el Teorema Fundamental del Cálculo?',
          answer: 'Conecta la derivación y la integración definida: ∫_a^b f(x) dx = F(b) - F(a), donde F\'(x) = f(x).',
          hint: 'Relaciona el área bajo la curva con la antiderivada en los extremos.',
          explanation: 'Permite evaluar integrales definidas sin calcular sumas de Riemann al límite.',
          topic: 'Algoritmos y Cálculo',
          difficulty: 'medium',
          tags: ['calculo', 'integrales'],
        },
      ],
      createdAt: now,
      updatedAt: now,
      provider: 'manual',
    };
    this.decks.set(starter.id, starter);
  }

canViewDeck(deck: FlashcardDeck, userId: string, isHost = false): boolean {
    if (isHost || deck.ownerId === userId || deck.ownerId === 'local-host') return true;
    return (deck.visibility ?? 'shared_write') !== 'private';
  }

canEditDeck(deck: FlashcardDeck, userId: string, isHost = false): boolean {
    if (isHost || deck.ownerId === userId || deck.ownerId === 'local-host') return true;
    return (deck.visibility ?? 'shared_write') === 'shared_write';
  }

createManualDeck(
    titleOrParams:
      | string
      | {
          title: string;
          topic?: string;
          ownerId: string;
          visibility?: DeckVisibility;
        },
    ownerIdArg = 'local-host',
    visibilityArg: DeckVisibility = 'shared_write',
  ): FlashcardDeck {
    const params =
      typeof titleOrParams === 'string'
        ? { title: titleOrParams, ownerId: ownerIdArg, visibility: visibilityArg }
        : titleOrParams;
    const cleanTitle = sanitizeStudyText(params.title.trim() || 'Nuevo Mazo Manual', 110);
    const cleanTopic = sanitizeStudyText((params.topic || params.title).trim() || 'Estudio General', 90);
    const now = Date.now();
    const deck = flashcardDeckSchema.parse({
      id: `deck:manual:${crypto.randomUUID().slice(0, 8)}`,
      title: cleanTitle,
      topic: cleanTopic,
      sourceType: 'manual',
      ownerId: params.ownerId || 'local-host',
      visibility: params.visibility ?? 'shared_write',
      cards: [],
      createdAt: now,
      updatedAt: now,
      provider: 'manual',
    });
    this.decks.set(deck.id, deck);
    this.saveDecksToStorage();
    return deck;
  }

renameDeck(deckId: string, newTitle: string, actorId: string, isHost = false): FlashcardDeck {
    const deck = this.decks.get(deckId);
    if (!deck) throw new Error('Mazo no encontrado.');
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para renombrar este mazo.');
    }
    const cleanTitle = sanitizeStudyText(newTitle.trim() || deck.title, 110);
    const updated: FlashcardDeck = {
      ...deck,
      title: cleanTitle,
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updated);
    this.decks.set(deckId, updated);
    this.saveDecksToStorage();
    return updated;
  }

setDeckVisibility(deckId: string, visibility: DeckVisibility, actorId: string, isHost = false): FlashcardDeck {
    const deck = this.decks.get(deckId);
    if (!deck) throw new Error('Mazo no encontrado.');
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para cambiar los permisos de este mazo.');
    }
    const updated: FlashcardDeck = {
      ...deck,
      visibility,
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updated);
    this.decks.set(deckId, updated);
    this.saveDecksToStorage();
    return updated;
  }

addManualCard(
    deckId: string,
    input: {
      question: string;
      answer: string;
      hint?: string;
      explanation?: string;
      tags?: string[];
      difficulty?: FlashcardDifficulty;
    },
    actorId: string,
    isHost = false,
  ): FlashcardDeck {
    const deck = this.decks.get(deckId);
    if (!deck) throw new Error('Mazo no encontrado.');
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para añadir tarjetas a este mazo.');
    }
    const q = sanitizeStudyText(input.question.trim(), 240);
    const a = sanitizeStudyText(input.answer.trim(), 360);
    if (!q || !a) {
      throw new Error('La pregunta y la respuesta son obligatorias.');
    }
    const hint = input.hint?.trim() ? sanitizeStudyText(input.hint.trim(), 200) : undefined;
    const explanation = input.explanation?.trim() ? sanitizeStudyText(input.explanation.trim(), 280) : undefined;
    const tags = (input.tags ?? [])
      .map((t) => sanitizeStudyText(t.trim(), 28))
      .filter(Boolean)
      .slice(0, 8);
    const card: FlashcardItem = flashcardItemSchema.parse({
      id: `card:${crypto.randomUUID().slice(0, 8)}`,
      question: q,
      answer: a,
      ...(hint ? { hint } : {}),
      ...(explanation ? { explanation } : {}),
      topic: deck.topic,
      difficulty: input.difficulty ?? 'medium',
      tags: tags.length > 0 ? tags : [deck.topic.toLowerCase().split(/\s+/)[0] || 'estudio'],
    });
    const updated: FlashcardDeck = {
      ...deck,
      cards: [...deck.cards, card],
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updated);
    this.decks.set(deckId, updated);
    this.saveDecksToStorage();
    return updated;
  }

updateCard(
    deckId: string,
    cardId: string,
    patch: {
      question?: string;
      answer?: string;
      hint?: string;
      explanation?: string;
      tags?: string[];
      difficulty?: FlashcardDifficulty;
    },
    actorId: string,
    isHost = false,
  ): FlashcardDeck {
    const deck = this.decks.get(deckId);
    if (!deck) throw new Error('Mazo no encontrado.');
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para editar tarjetas de este mazo.');
    }
    const idx = deck.cards.findIndex((c) => c.id === cardId);
    if (idx < 0) throw new Error('Tarjeta no encontrada.');
    const current = deck.cards[idx];
    const nextQuestion = patch.question !== undefined ? sanitizeStudyText(patch.question.trim(), 240) : current.question;
    const nextAnswer = patch.answer !== undefined ? sanitizeStudyText(patch.answer.trim(), 360) : current.answer;
    if (!nextQuestion || !nextAnswer) {
      throw new Error('La pregunta y la respuesta no pueden quedar vacías.');
    }
    const nextHint =
      patch.hint !== undefined
        ? patch.hint.trim()
          ? sanitizeStudyText(patch.hint.trim(), 200)
          : undefined
        : current.hint;
    const nextExp =
      patch.explanation !== undefined
        ? patch.explanation.trim()
          ? sanitizeStudyText(patch.explanation.trim(), 280)
          : undefined
        : current.explanation;
    const nextTags =
      patch.tags !== undefined
        ? patch.tags.map((t) => sanitizeStudyText(t.trim(), 28)).filter(Boolean).slice(0, 8)
        : current.tags;

    const updatedCard: FlashcardItem = flashcardItemSchema.parse({
      ...current,
      question: nextQuestion,
      answer: nextAnswer,
      hint: nextHint,
      explanation: nextExp,
      difficulty: patch.difficulty ?? current.difficulty,
      tags: nextTags.length > 0 ? nextTags : current.tags,
    });
    const nextCards = [...deck.cards];
    nextCards[idx] = updatedCard;
    const updatedDeck: FlashcardDeck = {
      ...deck,
      cards: nextCards,
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updatedDeck);
    this.decks.set(deckId, updatedDeck);
    this.saveDecksToStorage();
    return updatedDeck;
  }

deleteCard(deckId: string, cardId: string, actorId: string, isHost = false): FlashcardDeck | null {
    const deck = this.decks.get(deckId);
    if (!deck) return null;
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para eliminar tarjetas de este mazo.');
    }
    const nextCards = deck.cards.filter((c) => c.id !== cardId);
    if (nextCards.length === deck.cards.length) return deck;
    const updatedDeck: FlashcardDeck = {
      ...deck,
      cards: nextCards,
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updatedDeck);
    this.decks.set(deckId, updatedDeck);
    this.saveDecksToStorage();
    return updatedDeck;
  }

reorderCard(
    deckId: string,
    cardId: string,
    direction: 'up' | 'down',
    actorId: string,
    isHost = false,
  ): FlashcardDeck {
    const deck = this.decks.get(deckId);
    if (!deck) throw new Error('Mazo no encontrado.');
    if (!this.canEditDeck(deck, actorId, isHost)) {
      throw new Error('No tienes permiso para reordenar tarjetas de este mazo.');
    }
    const idx = deck.cards.findIndex((c) => c.id === cardId);
    if (idx < 0) return deck;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= deck.cards.length) return deck;
    const nextCards = [...deck.cards];
    const [moved] = nextCards.splice(idx, 1);
    nextCards.splice(targetIdx, 0, moved);
    const updatedDeck: FlashcardDeck = {
      ...deck,
      cards: nextCards,
      updatedAt: Date.now(),
    };
    flashcardDeckSchema.parse(updatedDeck);
    this.decks.set(deckId, updatedDeck);
    this.saveDecksToStorage();
    return updatedDeck;
  }

saveDeck(deck: FlashcardDeck): FlashcardDeck {
    const validated = flashcardDeckSchema.parse(deck);
    this.decks.set(validated.id, validated);
    this.saveDecksToStorage();
    return validated;
  }

listDecks(viewerId?: string, isHost = true): FlashcardDeck[] {
    return Array.from(this.decks.values())
      .filter((d) => !viewerId || this.canViewDeck(d, viewerId, isHost))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

getDeck(deckId: string): FlashcardDeck | null {
    return this.decks.get(deckId) ?? null;
  }

deleteDeck(deckId: string, actorId = 'local-host', isHost = true): boolean {
    const deck = this.decks.get(deckId);
    if (!deck || !this.canEditDeck(deck, actorId, isHost)) return false;
    const deleted = this.decks.delete(deckId);
    if (deleted) this.saveDecksToStorage();
    return deleted;
  }

private saveDecksToStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(DECKS_STORAGE_KEY, JSON.stringify(Array.from(this.decks.values())));
    } catch {
      // Ignore quota errors
    }
  }

private loadDecksFromStorage(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(DECKS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as unknown[];
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const valid = flashcardDeckSchema.safeParse(item && typeof item === 'object' ? {...item, provider: (item as {provider?:string}).provider === 'local' ? 'local' : 'manual'} : item);
          if (valid.success) this.decks.set(valid.data.id, valid.data);
        }
      }
    } catch {
      // Keep default deck
    }
  }
}
```

### app/src/ui/study-ui.ts — biblioteca, edición y repaso manual

Variante compilable de la UI real sin juegos ni IA. El contexto usa `decks:ManualDeckRepository`. Opciones de concurso antiguas se conservan en los datos al editar, pero no se crean ni se muestran en esta fase.

SHA-256 del bloque: `7f46b8e1776fd7fd43c569d2d918dba921fb7d7ce6e2cbb0f576a29cb2cd184c`.

```ts
import type {FlashcardDeck,FlashcardItem,ManualDeckRepository} from '../study/decks';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] { const e = document.createElement(tag); e.textContent = text; return e; }
function button(text: string, action: () => void, primary = false): HTMLButtonElement { const b = el('button', text); b.type = 'button'; if (primary) b.className = 'is-primary'; b.onclick = action; return b; }
function field(label: string, input: HTMLElement): HTMLLabelElement { const l = el('label', label); l.append(input); return l; }
export interface StudyContext {
  actor(): { id: string; displayName: string; isHost: boolean };
  close(): void; notify(message: string): void;
  decks: ManualDeckRepository;
}
export class StudyPanel {
  readonly root = el('section');
  private mode: 'library' | 'edit' | 'review' = 'library';
  private deckId: string | null = null;
  private index = 0; private revealed = false; private error = '';
  private progress: Record<string, 'mastered' | 'review'> = {};
  constructor(private readonly ctx: StudyContext) { this.root.className = 'sv-study-workspace'; this.root.setAttribute('aria-label', 'Tarjetas de estudio'); }
  mount(container: HTMLElement): void {
    container.replaceChildren(this.root);
    try { this.progress = JSON.parse(localStorage.getItem('studyvillage-review-v2') || '{}'); } catch { this.progress = {}; }
    try {
      const old = JSON.parse(localStorage.getItem('studyvillage-flashcard-progress-v1') || '{}');
      const marks = old[this.ctx.actor().id] ?? old['local-host'] ?? {};
      for (const deck of this.ctx.decks.listDecks()) for (const card of deck.cards) if (!( `${deck.id}:${card.id}` in this.progress) && marks[card.id]) this.progress[`${deck.id}:${card.id}`] = marks[card.id] === 'mastered' ? 'mastered' : 'review';
    } catch { /* keep current progress */ }
    this.render();
  }
  unmount(): void { this.root.remove(); }
  openDeck(id: string): void { this.deckId = id; this.mode = 'edit'; }
  private run(fn: () => void): void {
    try { this.error = ''; fn(); this.render(); }
    catch (e) { this.error = e instanceof Error ? e.message : 'No se pudo completar.'; let message = this.root.querySelector<HTMLElement>('[role=alert]'); if (!message) { message = el('p'); message.className = 'sv-error'; message.setAttribute('role', 'alert'); this.root.querySelector('header')!.after(message); } message.textContent = this.error; }
  }
  private deck(): FlashcardDeck | null { return this.deckId ? this.ctx.decks.getDeck(this.deckId) : null; }
  private render(): void {
    this.root.replaceChildren();
    const header = el('header'); header.append(button('Biblioteca', () => { this.mode = 'library'; this.render(); }), el('h2', 'Tarjetas de estudio'), button('Cerrar', this.ctx.close));
    if(this.mode==='library')header.querySelector('button')?.remove();
    this.root.append(header);
    if (this.error) { const p = el('p', this.error); p.className = 'sv-error'; p.setAttribute('role','alert'); this.root.append(p); }
    if (this.mode === 'library') this.library();
    else if (this.mode === 'edit') this.editor();
    else if (this.mode === 'review') this.review();

  }
  private library(): void {
    const actor = this.ctx.actor();
    const actions = el('div'); actions.className = 'sv-study-actions';
    actions.append(button('Crear mazo', () => { this.deckId = null; this.mode = 'edit'; this.render(); }, true));
    this.root.append(actions);
    const decks = this.ctx.decks.listDecks(actor.id, actor.isHost);
    if (!decks.length) this.root.append(el('p', 'Todavía no tienes mazos. Crea uno con tus propias preguntas.'));
    const grid = el('div'); grid.className = 'sv-study-library';
    for (const deck of decks) {
      const card = el('article'); card.className = 'sv-study-card'; card.append(el('h3', deck.title), el('p', `${deck.cards.length} tarjetas · ${deck.cards.filter(c=>this.progress[`${deck.id}:${c.id}`]==='mastered').length} aprendidas`));
      card.append(button('Repasar', () => { this.deckId = deck.id; this.index = 0; this.revealed = false; this.mode = 'review'; this.render(); }, true));
      if (this.ctx.decks.canEditDeck(deck, actor.id, actor.isHost)) card.append(button('Editar', () => { this.deckId = deck.id; this.mode = 'edit'; this.render(); }));
      grid.append(card);
    }
    this.root.append(grid);
  }
  private editor(): void {
    const deck = this.deck(); const actor = this.ctx.actor(); const form = el('div'); form.className = 'sv-study-form';
    if (deck && !this.ctx.decks.canEditDeck(deck, actor.id, actor.isHost)) { this.root.append(el('p','Este mazo es de solo lectura.')); return; }
    const title = el('input'); title.maxLength = 110; title.value = deck?.title ?? ''; title.required = true;
    form.append(field('Nombre del mazo', title));
    if (!deck) {
      form.append(button('Crear', () => this.run(() => { if (!title.value.trim()) throw new Error('Escribe el nombre del mazo.'); this.deckId = this.ctx.decks.createManualDeck({ title: title.value, ownerId: 'local-host', visibility: 'private' }).id; }), true));
      this.root.append(form); return;
    }
    form.append(button('Guardar nombre', () => this.run(() => { this.ctx.decks.renameDeck(deck.id, title.value, actor.id, actor.isHost); })));
    const list = el('div');
    deck.cards.forEach((card, index) => {
      const row = el('article'); row.className = 'sv-study-card'; row.append(el('strong', `${index + 1}. ${card.question}`));
      row.append(button('Editar', () => this.cardEditor(form, deck, card)), button('↑', () => this.run(() => { this.ctx.decks.reorderCard(deck.id, card.id, 'up', actor.id, actor.isHost); })), button('↓', () => this.run(() => { this.ctx.decks.reorderCard(deck.id, card.id, 'down', actor.id, actor.isHost); })), button('Eliminar tarjeta', () => this.run(() => { this.ctx.decks.deleteCard(deck.id, card.id, actor.id, actor.isHost); })));
      list.append(row);
    });
    form.append(list); this.cardEditor(form, deck);
    const deckOptions = el('details'); deckOptions.append(el('summary', 'Opciones del mazo'));
    const visibility = el('select'); for (const [value,label] of [['private','Privado'],['shared_read','Solo lectura'],['shared_write','Editable']]) { const o=el('option',label);o.value=value;visibility.append(o); } visibility.value=deck.visibility??'private';
    visibility.onchange=()=>this.run(()=>{this.ctx.decks.setDeckVisibility(deck.id,visibility.value as 'private'|'shared_read'|'shared_write',actor.id,actor.isHost);});
    deckOptions.append(field('Permisos',visibility)); let deleteArmed=false;
    const remove=button('Eliminar mazo',()=>{if(!deleteArmed){deleteArmed=true;remove.textContent='¿Eliminar este mazo?';return;}this.run(()=>{this.ctx.decks.deleteDeck(deck.id,actor.id,actor.isHost);this.mode='library';this.deckId=null;});});deckOptions.append(remove);form.append(deckOptions);
    this.root.append(form);
  }
  private cardEditor(parent: HTMLElement, deck: FlashcardDeck, existing?: FlashcardItem): void {
    parent.querySelector('[data-card-editor]')?.remove();
    const editor = el('div'); editor.dataset.cardEditor = 'true'; editor.className = 'sv-study-form';
    const question = el('textarea'); question.maxLength = 260; question.value = existing?.question ?? '';
    const answer = el('textarea'); answer.maxLength = 400; answer.value = existing?.answer ?? '';
    editor.append(field('Pregunta', question), field('Respuesta', answer));
    const advanced = el('details'); advanced.open = !!existing?.choices; advanced.append(el('summary', 'Detalles de la tarjeta'));
    const hint = el('input'); hint.maxLength = 220; hint.value = existing?.hint ?? '';
    const explanation = el('textarea'); explanation.maxLength = 320; explanation.value = existing?.explanation ?? '';
    const tags = el('input'); tags.value = existing?.tags.join(', ') ?? '';
    const difficulty = el('select'); for (const [v,n] of [['easy','Fácil'],['medium','Media'],['hard','Difícil']]) { const o=el('option',n);o.value=v;difficulty.append(o); } difficulty.value = existing?.difficulty ?? 'medium';
    advanced.append(field('Pista', hint), field('Explicación', explanation), field('Etiquetas', tags), field('Dificultad', difficulty)); editor.append(advanced);
    editor.append(button(existing ? 'Guardar tarjeta' : 'Añadir tarjeta', () => this.run(() => {
      const actor = this.ctx.actor(); const fresh = this.ctx.decks.getDeck(deck.id)!;
      if (!this.ctx.decks.canEditDeck(fresh, actor.id, actor.isHost)) throw new Error('No puedes editar este mazo.');
      const card: FlashcardItem = { ...(existing?.sourceRef ? { sourceRef: existing.sourceRef } : {}), id: existing?.id ?? crypto.randomUUID(), question: question.value.trim(), answer: answer.value.trim(), topic: fresh.topic, difficulty: difficulty.value as FlashcardItem['difficulty'], tags: tags.value.split(',').map(t=>t.trim()).filter(Boolean).slice(0,8), ...(hint.value.trim() ? { hint: hint.value.trim() } : {}), ...(explanation.value.trim() ? { explanation: explanation.value.trim() } : {}), ...(existing?.choices ? {choices:[...existing.choices],correctChoice:existing.correctChoice} : {}) };
      if (!existing && fresh.cards.length >= 100) throw new Error('Máximo 100 tarjetas por mazo.');
      this.ctx.decks.saveDeck({ ...fresh, cards: existing ? fresh.cards.map(c=>c.id===card.id?card:c) : [...fresh.cards, card], updatedAt: Date.now() });
    }), true));
    parent.append(editor);
  }
  private review(): void {
    const deck = this.deck(); const card = deck?.cards[this.index];
    if (!deck || !card) { this.root.append(el('p','No hay más tarjetas por repasar.'), button('Volver a la biblioteca',()=>{ this.mode='library';this.render(); })); return; }
    const wrap = el('div'); wrap.className = 'sv-study-review';
    wrap.append(el('p', `${this.index+1} / ${deck.cards.length}`));
    const paper=el('article',this.revealed?card.answer:card.question);paper.className='sv-study-card';wrap.append(paper);
    if (!this.revealed) wrap.append(button('Revelar respuesta',()=>{this.revealed=true;this.render();},true));
    else for (const [mark,label] of [['mastered','Lo sabía'],['review','Repasar']] as const) wrap.append(button(label,()=>{this.progress[`${deck.id}:${card.id}`]=mark;localStorage.setItem('studyvillage-review-v2',JSON.stringify(this.progress));this.index++;this.revealed=false;this.render();}));
    this.root.append(wrap);
  }
  
  
  
}
```

### app/src/ui/art.ts

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `e107cbb868ba77f65914c2274b34cad9fae75f90f602b2735b9c24ac8ae35827`.

```ts
import { getAvatarSheet } from '../assets/avatar-sheet';
import type { Position, PublicIdentity } from '../protocol/types';

/**
 * Shared pixel-art toolkit. See docs/VISUAL_DESIGN.md for the rules this
 * encodes: one art pixel equals two logical units, and light always comes
 * from the top-left.
 */

export const PALETTE = {
  moss: ['#24402f', '#2f5a3e', '#3f7a4f', '#58a05f', '#7cc077', '#a6dc98'],
  earth: ['#5a4028', '#7a5739', '#9c7349', '#c09a64', '#e0c08a'],
  ember: ['#8c3f2c', '#c25f3c', '#e8884f', '#f6b265', '#ffd79a'],
  tide: ['#1f4a4e', '#2f6f73', '#47989b', '#74c0bd'],
  paper: ['#1e3730', '#3c5a4c', '#f2e7cd', '#fbf4e2', '#fffdf5'],
} as const;

/** Original key names kept so existing imports keep compiling. */
export const COLORS = {
  ink: '#1e3730', forest: '#2f5a3e', deep: '#24402f', mint: '#74c0bd',
  grass: '#58a05f', grassDark: '#2f5a3e', cream: '#f2e7cd', paper: '#fbf4e2',
  sand: '#e0c08a', coral: '#c25f3c', peach: '#f6b265', shadow: '#24402f',
};

import { getAvatarCustomization } from '../assets/custom-assets';

export const UNIT = 1;

/** Snap to the virtual pixel grid so every edge lands on a sharp boundary. */
export function ipx(value: number): number {
  return Math.round(value / UNIT) * UNIT;
}

export function fill(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(ipx(x), ipx(y), Math.max(UNIT, ipx(w)), Math.max(UNIT, ipx(h)));
}

/** Unsnapped fill, for sub-pixel work like soft gradients and glow pools. */
export function fillRaw(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

export function text(ctx: CanvasRenderingContext2D, label: string, x: number, y: number, color = COLORS.ink, size = 11, align: CanvasTextAlign = 'center'): void {
  ctx.fillStyle = color;
  ctx.font = `700 ${size}px Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = align;
  ctx.fillText(label, x, y, 200);
}

export function seed(x: number, y: number): number {
  let n = Math.imul(x + 33421, 1597334677) ^ Math.imul(y + 1699, 3812015801);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}

/** Stable 0..1 hash from a string, used to desynchronise per-character motion. */
export function hash01(value: string): number {
  let n = 2166136261;
  for (let i = 0; i < value.length; i += 1) n = Math.imul(n ^ value.charCodeAt(i), 16777619);
  return ((n >>> 0) % 10000) / 10000;
}

/**
 * Whether the viewer asked for reduced motion. Decorative canvas animation
 * (sway, drifting motes, flicker, smoke) is suppressed when this is true, to
 * match the CSS media query. Character walk cycles are kept: they convey
 * state rather than decoration.
 */
export function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Soft elliptical contact shadow. Cheap: stacked rects, no shadowBlur. */
export function contactShadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, strength = 0.26): void {
  for (let i = 3; i >= 1; i -= 1) {
    const r = radius * (i / 3);
    ctx.fillStyle = `rgba(26,48,38,${(strength * (4 - i)) / 6})`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, Math.max(1.4, r * 0.42), 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * Warm pool of light on the ground, for lamps and windows.
 * The gradient is rasterised once per tint into a small sprite and then blitted
 * scaled. Building a fresh radial gradient on every call cost a dropped frame
 * roughly every twenty, because a busy scene issues a dozen of these per frame.
 */
const GLOW_SIZE = 128;
const glowSprites = new Map<string, HTMLCanvasElement>();

function glowSprite(tint: string): HTMLCanvasElement | null {
  const cached = glowSprites.get(tint);
  if (cached) return cached;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = GLOW_SIZE;
  canvas.height = GLOW_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const r = GLOW_SIZE / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, `rgba(${tint},0.30)`);
  gradient.addColorStop(0.55, `rgba(${tint},0.12)`);
  gradient.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GLOW_SIZE, GLOW_SIZE);
  glowSprites.set(tint, canvas);
  return canvas;
}

export function glowPool(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, tint = '255,196,110'): void {
  const sprite = glowSprite(tint);
  if (sprite) {
    ctx.drawImage(sprite, x - radius, y - radius * 0.5, radius * 2, radius);
    return;
  }
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${tint},0.30)`);
  gradient.addColorStop(0.55, `rgba(${tint},0.12)`);
  gradient.addColorStop(1, `rgba(${tint},0)`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.ellipse(x, y, radius, radius * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
}

/** Chamfered pixel plate used for signs and name plates. */
export function plate(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, face: string, edge: string): void {
  fill(ctx, edge, x, y + 2, w, h - 4);
  fill(ctx, edge, x + 2, y, w - 4, h);
  fill(ctx, face, x + 2, y + 2, w - 4, h - 6);
  fill(ctx, face, x + 4, y + 2, w - 8, h - 4);
}

// ---------------------------------------------------------------------------
// Per-character animation state. Presentation only: it never feeds back into
// movement, collision or networking, it only decides what gets painted.
// ---------------------------------------------------------------------------

interface CharacterAnim {
  walk: number;
  idle: number;
  renderX: number;
  renderY: number;
  lastSeen: number;
  facing: Position['direction'];
  turn: number;
  sceneId?: string;
}

const anims = new Map<string, CharacterAnim>();
let frameClock = 0;

/** Advance all character animation by dt seconds. Called once per frame. */
export function advanceAnim(dt: number): void {
  frameClock += dt;
  for (const [key, state] of anims) {
    if (frameClock - state.lastSeen > 5) anims.delete(key);
  }
}

export function animClock(): number {
  return frameClock;
}

function animFor(id: string, position: Position): CharacterAnim {
  let state = anims.get(id);
  if (!state) {
    state = {
      walk: hash01(id) * 10,
      idle: hash01(id) * 6,
      renderX: position.x,
      renderY: position.y,
      lastSeen: frameClock,
      facing: position.direction,
      turn: 1,
    };
    anims.set(id, state);
  }
  return state;
}

/**
 * Update the drawn position for one character.
 * `smooth` interpolates toward the authoritative position, which is what
 * remote peers need because their updates arrive at roughly 12 Hz. The local
 * character passes smooth=false so input stays immediate.
 */
export function trackCharacter(id: string, position: Position, dt: number, smooth: boolean, sceneId = 'residential'): { x: number; y: number } {
  const state = animFor(id, position);
  state.lastSeen = frameClock;
  if (state.sceneId !== sceneId) { state.renderX = position.x; state.renderY = position.y; state.sceneId = sceneId; }

  if (smooth) {
    const blend = 1 - Math.pow(0.0015, dt);
    state.renderX += (position.x - state.renderX) * blend;
    state.renderY += (position.y - state.renderY) * blend;
    if (Math.hypot(position.x - state.renderX, position.y - state.renderY) > 96) {
      state.renderX = position.x;
      state.renderY = position.y;
    }
  } else {
    state.renderX = position.x;
    state.renderY = position.y;
  }

  if (position.direction !== state.facing) {
    state.facing = position.direction;
    state.turn = 0;
  }
  state.turn = Math.min(1, state.turn + dt * 9);

  if (position.moving) {
    state.walk += dt * 9.2;
    state.idle = 0;
  } else {
    // Ease the stride back to a neutral stance instead of freezing mid-step.
    const rest = Math.round(state.walk / Math.PI) * Math.PI;
    state.walk += (rest - state.walk) * Math.min(1, dt * 12);
    state.idle += dt;
  }
  return { x: state.renderX, y: state.renderY };
}

/**
 * Scene-change fade. The stage canvas is reused when moving between the
 * village and a house, so no CSS animation retriggers; this gives that switch
 * the same sense of travel without touching the view logic that owns the pane.
 * Returns progress from 0 to 1, where 1 means the transition has finished.
 */
const SCENE_MS = 300;
let sceneKey = '';
let sceneStart = -1;

export function sceneProgress(key: string): number {
  if (key !== sceneKey) {
    sceneKey = key;
    sceneStart = frameClock;
  }
  if (sceneStart < 0) return 1;
  if (reducedMotion()) return 1;
  return Math.min(1, (frameClock - sceneStart) / (SCENE_MS / 1000));
}

/** Paints the fade for a scene change. A no-op once the transition is done. */
export function paintSceneFade(ctx: CanvasRenderingContext2D, key: string, w: number, h: number, tint = '14,26,20'): void {
  const t = sceneProgress(key);
  if (t >= 1) return;
  // Ease-out so the scene is legible almost immediately and the tail is gentle.
  const alpha = Math.pow(1 - t, 2.2);
  ctx.fillStyle = `rgba(${tint},${alpha.toFixed(3)})`;
  ctx.fillRect(0, 0, w, h);
}

const SKIN = ['#8c5a3c', '#c98f63', '#f0c69a'];
const HAIR = ['#2a2018', '#3f3124', '#5a4530'];

/** Slightly shift a hex colour's brightness, for deriving shade/tint pairs. */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(((n >> 16) & 255) + amount);
  const g = clamp(((n >> 8) & 255) + amount);
  const b = clamp((n & 255) + amount);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function drawAvatar(ctx: CanvasRenderingContext2D, x: number, y: number, identity: PublicIdentity, position: Position, isOwn = false): void {
  const id = identity.fingerprint || identity.displayName;
  const state = anims.get(id);
  const custom = isOwn ? getAvatarCustomization() : null;
  const tone = hash01(id + 'skin');
  const skin = custom?.skinTone || SKIN[Math.floor(tone * SKIN.length) % SKIN.length];
  const hair = custom?.hairColor || HAIR[Math.floor(hash01(id + 'hair') * HAIR.length) % HAIR.length];
  const hairStyle = custom?.hairStyle || 'short';
  const accessory = custom?.accessory || 'none';
  const shirt = identity.color || COLORS.coral;
  const shirtLit = shade(shirt, 26);
  const shirtDark = shade(shirt, -42);

  const walk = state ? state.walk : 0;
  const idle = state ? state.idle : 0;
  const moving = position.moving;

  // Vertical bob: a short hop on each stride, or a slow breath when still.
  // The idle breath is decorative, so it stops under reduced motion; the
  // stride hop stays, because it communicates that the character is walking.
  const stride = Math.sin(walk);
  const breath = reducedMotion() ? 0 : Math.sin(idle * 1.9) * 0.7;
  const bob = moving ? -Math.abs(Math.sin(walk)) * 2 : breath;
  const squash = moving ? Math.abs(Math.cos(walk)) * 0.8 : 0;
  const facing = position.direction;

  const baseY = Math.round(y);
  contactShadow(ctx, Math.round(x), baseY + 5, 10 + squash, 0.32);

  ctx.save();
  ctx.translate(Math.round(x), baseY + Math.round(bob));
  // Slightly larger than the 9px collision radius so the character reads at
  // a glance. Presentation only: collision and movement are untouched.
  ctx.scale(1.16, 1.16);

  const avatarSheet = isOwn ? getAvatarSheet() : null;
  if (avatarSheet) {
    const row = { down: 0, left: 1, right: 2, up: 3 }[facing];
    const col = moving ? Math.floor(walk * 2) % 3 : 1;
    const sw = avatarSheet.naturalWidth / 3;
    const sh = avatarSheet.naturalHeight / 4;
    ctx.drawImage(avatarSheet, col * sw, row * sh, sw, sh, -14, -30, 28, 38);
  } else {
  // Legs swing in opposition; when idle they stand together.
  const swing = moving ? Math.round(stride * 2.4) : 0;
  if (facing === 'left' || facing === 'right') {
    const lead = facing === 'right' ? 1 : -1;
    fill(ctx, '#2c4238', -4 + swing * lead, 0, 4, 8 - Math.abs(swing) / 2);
    fill(ctx, '#38564d', 0 - swing * lead, 0, 4, 8 - Math.abs(swing) / 2);
  } else {
    fill(ctx, '#2c4238', -5, 0, 4, 8 - Math.abs(swing));
    fill(ctx, '#38564d', 1, 0, 4, 8 - Math.abs(swing));
  }

  // Torso with a lit top-left face and a shaded bottom-right edge.
  const torsoY = -15 - Math.round(squash);
  fill(ctx, shirtDark, -8, torsoY, 16, 16);
  fill(ctx, shirt, -8, torsoY, 14, 14);
  fill(ctx, shirtLit, -8, torsoY, 10, 4);

  // Arms track the opposite phase of the legs.
  if (facing === 'left' || facing === 'right') {
    const lead = facing === 'right' ? 1 : -1;
    fill(ctx, shirtDark, (facing === 'right' ? 5 : -9), torsoY + 3 - swing * lead, 4, 9);
  } else {
    fill(ctx, shirtDark, -11, torsoY + 3 + swing, 4, 9);
    fill(ctx, shirtDark, 7, torsoY + 3 - swing, 4, 9);
  }

  // Head, hair and a simple face.
  const headY = torsoY - 10;
  fill(ctx, shade(skin, -40), -7, headY, 14, 12);
  fill(ctx, skin, -7, headY, 12, 11);
  fill(ctx, shade(skin, 18), -7, headY + 2, 4, 5);
  if (facing === 'up') {
    // Facing away: the back of the head is all hair.
    fill(ctx, hair, -7, headY - 2, 14, hairStyle === 'long' ? 15 : 12);
    fill(ctx, shade(hair, 18), -7, headY - 2, 14, 3);
  } else {
    fill(ctx, hair, -8, headY - 3, 15, 6);
    fill(ctx, shade(hair, 16), -8, headY - 3, 15, 2);
    if (hairStyle === 'spiky') {
      fill(ctx, hair, -7, headY - 6, 3, 3);
      fill(ctx, hair, -2, headY - 7, 4, 4);
      fill(ctx, hair, 3, headY - 6, 3, 3);
    } else if (hairStyle === 'curly') {
      fill(ctx, hair, -9, headY - 4, 17, 6);
      fill(ctx, shade(hair, 20), -8, headY - 5, 5, 3);
      fill(ctx, shade(hair, 20), 1, headY - 5, 5, 3);
    } else if (hairStyle === 'beanie') {
      fill(ctx, '#c9604a', -8, headY - 5, 16, 6);
      fill(ctx, '#e2886f', -8, headY - 2, 16, 2);
      fill(ctx, '#f4efdd', -2, headY - 7, 4, 2);
    }
    if (facing === 'down') {
      const sideLen = hairStyle === 'long' ? 13 : 9;
      fill(ctx, hair, -8, headY - 3, 3, sideLen);
      fill(ctx, hair, 4, headY - 3, 3, sideLen);
      fill(ctx, '#2b2b26', -4, headY + 5, 2, 2);
      fill(ctx, '#2b2b26', 2, headY + 5, 2, 2);
      fill(ctx, shade(skin, -30), -1, headY + 8, 3, 1);
    } else if (facing === 'left') {
      fill(ctx, hair, -8, headY - 3, 4, hairStyle === 'long' ? 13 : 10);
      fill(ctx, '#2b2b26', -4, headY + 5, 2, 2);
    } else {
      fill(ctx, hair, 3, headY - 3, 4, hairStyle === 'long' ? 13 : 10);
      fill(ctx, '#2b2b26', 2, headY + 5, 2, 2);
    }
  }

  // Optional accessories
  if (accessory === 'glasses' && facing !== 'up') {
    fill(ctx, '#1e3028', -5, headY + 4, 4, 3);
    fill(ctx, '#1e3028', 1, headY + 4, 4, 3);
    fill(ctx, '#9cc8d2', -4, headY + 5, 2, 1);
    fill(ctx, '#9cc8d2', 2, headY + 5, 2, 1);
    fill(ctx, '#1e3028', -1, headY + 5, 2, 1);
  } else if (accessory === 'headphones') {
    fill(ctx, '#2d4b3e', -9, headY - 4, 18, 2);
    fill(ctx, '#cf6f3c', -10, headY + 1, 3, 6);
    fill(ctx, '#cf6f3c', 7, headY + 1, 3, 6);
  } else if (accessory === 'hat') {
    fill(ctx, '#5a3e28', -10, headY - 3, 20, 2);
    fill(ctx, '#7a563a', -7, headY - 7, 14, 4);
    fill(ctx, '#cf6f3c', -7, headY - 4, 14, 1);
  }

  }
  if (isOwn) {
    // A soft arc under the owner instead of a hard selection box.
    ctx.strokeStyle = 'rgba(255,240,200,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 7 - Math.round(bob), 11, 4.5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const name = identity.displayName.slice(0, 18);
  ctx.font = '700 9.5px Inter, ui-sans-serif, system-ui, sans-serif';
  const width = Math.min(145, Math.ceil(ctx.measureText(name).width) + 18);
  const plateY = baseY - 44;
  plate(ctx, x - width / 2, plateY, width, 15, 'rgba(251,244,226,0.96)', 'rgba(30,55,48,0.55)');
  fill(ctx, shirt, x - width / 2 + 5, plateY + 5, 5, 5);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.ink;
  ctx.fillText(name, Math.round(x - width / 2 + 13), plateY + 11);
  ctx.textAlign = 'center';
}

/**
 * Leafy tree. The trunk sits on the 22x25 collision footprint from
 * world/model.ts; the canopy is allowed to overhang it, as real foliage does.
 * `variant` picks one of three silhouettes so a row of trees is not a stamp.
 */
export function drawTree(ctx: CanvasRenderingContext2D, x: number, y: number, scale = 1, sway = 0, variant = 0): void {
  const [d0, d1, d2, d3, d4, d5] = PALETTE.moss;
  contactShadow(ctx, x, y + 10, 14 * scale, 0.36);
  ctx.save();
  ctx.translate(ipx(x), ipx(y));
  ctx.scale(scale, scale);

  fill(ctx, PALETTE.earth[0], -4, -4, 9, 16);
  fill(ctx, PALETTE.earth[1], -4, -4, 5, 16);
  fill(ctx, PALETTE.earth[2], -4, -4, 2, 13);
  fill(ctx, d0, -7, 8, 14, 4);

  ctx.translate(Math.round(sway), 0);
  if (variant === 1) {
    // Tall and narrow.
    fill(ctx, d0, -12, -30, 24, 30);
    fill(ctx, d1, -12, -33, 22, 29);
    fill(ctx, d2, -10, -38, 18, 27);
    fill(ctx, d3, -9, -41, 15, 19);
    fill(ctx, d4, -7, -42, 10, 10);
    fill(ctx, d5, -6, -41, 5, 4);
  } else if (variant === 2) {
    // Low and broad.
    fill(ctx, d0, -18, -20, 36, 22);
    fill(ctx, d1, -18, -23, 33, 21);
    fill(ctx, d2, -15, -27, 27, 20);
    fill(ctx, d3, -13, -29, 21, 15);
    fill(ctx, d4, -11, -30, 13, 9);
    fill(ctx, d5, -10, -29, 6, 4);
    fill(ctx, d1, 9, -15, 7, 9);
  } else {
    fill(ctx, d0, -15, -25, 31, 26);
    fill(ctx, d1, -15, -28, 28, 25);
    fill(ctx, d2, -13, -32, 23, 23);
    fill(ctx, d3, -12, -35, 19, 18);
    fill(ctx, d4, -10, -36, 13, 10);
    fill(ctx, d5, -9, -35, 6, 4);
    fill(ctx, d1, 7, -18, 7, 9);
  }
  fill(ctx, d0, -13, -7, 9, 7);
  ctx.restore();
}

/**
 * Small key prompt that floats above the character when an action is
 * available, such as "E · Entrar" at a door. It tells the player the key
 * works here, which matters now that E only acts at doorways.
 */
export function drawPrompt(ctx: CanvasRenderingContext2D, x: number, y: number, label: string): void {
  const bob = reducedMotion() ? 0 : Math.round(Math.sin(frameClock * 4) * 1.5);
  ctx.font = '700 9.5px Inter, ui-sans-serif, system-ui, sans-serif';
  const w = Math.ceil(ctx.measureText(label).width) + 16;
  const px = Math.round(x - w / 2);
  const py = Math.round(y) + bob;
  plate(ctx, px, py, w, 16, 'rgba(255,215,154,0.97)', 'rgba(90,64,40,0.85)');
  fill(ctx, 'rgba(90,64,40,0.85)', x - 2, py + 15, 4, 3);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.paper[0];
  ctx.fillText(label, Math.round(x), py + 12);
}
```

### app/src/world/draw.ts

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `e82fa9e6b9d7c3842b37ce3ccd87a0ff995dc6401d051b03636de82a82a2bf5d`.

```ts
import { type PublicIdentity, type Position } from '../protocol/types';
import {
  PALETTE, animClock, contactShadow, drawAvatar, drawTree, fill,
  glowPool, hash01, ipx, paintSceneFade, plate, reducedMotion, seed, shade, text, trackCharacter,
} from '../ui/art';
import { drawPortalSign, WORLD_AREAS } from './areas';
import { PARCELS, WORLD_TREES, type OccupiedParcel } from './model';

export interface DrawPerson { identity: PublicIdentity; position: Position; isOwn: boolean }

const W = 768;
const H = 432;
const ROAD_TOP = 190;
const ROAD_BOTTOM = 244;

const [, moss1, moss2, moss3, moss4, moss5] = PALETTE.moss;
const [earth0, earth1, earth2, earth3, earth4] = PALETTE.earth;
const [ember0, ember1, ember2, ember3, ember4] = PALETTE.ember;

/** A sprite that must be depth-sorted against the characters. */
interface Sprite { baseline: number; paint: () => void }

// ---------------------------------------------------------------------------
// Terrain. Static for a given occupancy, so it is painted once into an
// offscreen canvas and blitted each frame instead of re-tiling 1,000 cells.
// ---------------------------------------------------------------------------

let terrainCache: HTMLCanvasElement | null = null;
let terrainKey = '';

function paintGrass(ctx: CanvasRenderingContext2D): void {
  fill(ctx, moss3, 0, 0, W, H);
  // Soft meadow patches drawn as overlapping ellipses. Square cells on a grid
  // produced visible banding, so the variation is organic instead.
  // Kept faint and broad on purpose. At higher opacity these read as stains
  // rather than as ground variation.
  for (let i = 0; i < 30; i += 1) {
    const n = hash01(`patch${i}`);
    const m = hash01(`patchb${i}`);
    ctx.fillStyle = n > 0.5 ? 'rgba(124,192,119,0.075)' : 'rgba(47,90,62,0.065)';
    ctx.beginPath();
    ctx.ellipse(m * W, n * H, 70 + m * 110, 34 + n * 52, n * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sparse detail: roughly one feature per four cells, so the field stays calm
  // and the buildings and characters remain the subject.
  for (let y = 0; y < H; y += 16) {
    for (let x = 0; x < W; x += 16) {
      const n = seed(x / 16 + 7, y / 16 + 3);
      if (n > 0.93) {
        fill(ctx, moss2, x + 4, y + 9, 2, 4);
        fill(ctx, moss5, x + 6, y + 7, 2, 6);
        fill(ctx, moss2, x + 9, y + 10, 2, 3);
      } else if (n > 0.88) {
        fill(ctx, shade(moss2, 6), x + 6, y + 10, 6, 3);
      } else if (n < 0.022) {
        const petal = n < 0.011 ? ember3 : '#e9e2f2';
        fill(ctx, moss1, x + 8, y + 10, 2, 4);
        fill(ctx, petal, x + 6, y + 6, 5, 4);
        fill(ctx, ember4, x + 8, y + 8, 2, 2);
      } else if (n < 0.04) {
        fill(ctx, '#938d80', x + 6, y + 9, 5, 4);
        fill(ctx, '#aaa397', x + 6, y + 9, 5, 2);
      }
    }
  }
  // Dappled shade sits under each individual tree instead of running as a band
  // across the full width, which read as a stripe over the road and the plots.
  for (const tree of WORLD_TREES) {
    for (let i = 0; i < 7; i += 1) {
      const n = seed(tree.x + i, tree.y);
      if (n < 0.45) continue;
      ctx.fillStyle = 'rgba(36,64,47,0.13)';
      ctx.fillRect(ipx(tree.x - 18 + i * 6), ipx(tree.y + 2 + n * 8), 8, 5);
    }
  }
}

/** Horizontal high street plus the garden paths up to each door. */
function paintPaths(ctx: CanvasRenderingContext2D): void {
  const edge = (y: number, flip: number) => {
    // Scalloped dirt edge so the road does not read as a plain band.
    for (let x = 0; x < W; x += 8) {
      const n = seed(x / 8 + 31, y + flip);
      const lip = n > 0.6 ? 4 : n > 0.3 ? 2 : 0;
      fill(ctx, earth1, x, y - lip * flip, 8, lip + 2);
    }
  };

  fill(ctx, earth1, 0, ROAD_TOP, W, ROAD_BOTTOM - ROAD_TOP);
  fill(ctx, earth3, 0, ROAD_TOP + 4, W, ROAD_BOTTOM - ROAD_TOP - 8);
  fill(ctx, earth4, 0, ROAD_TOP + 8, W, 12);
  edge(ROAD_TOP, 1);
  edge(ROAD_BOTTOM, -1);

  // Cobbles, ruts and grass creeping in at the verges.
  for (let x = 0; x < W; x += 12) {
    const n = seed(x / 12 + 5, 91);
    if (n > 0.62) fill(ctx, earth2, x + 2, ROAD_TOP + 14 + Math.floor(n * 16), 8, 4);
    if (n < 0.3) fill(ctx, shade(earth4, 12), x + 4, ROAD_TOP + 10, 6, 3);
    if (n > 0.86) {
      fill(ctx, moss2, x, ROAD_TOP + 2, 6, 3);
      fill(ctx, moss2, x + 4, ROAD_BOTTOM - 4, 6, 3);
    }
  }
  fill(ctx, shade(earth2, -8), 0, ROAD_TOP + 26, W, 3);

  for (const parcel of PARCELS) {
    const top = parcel.slot < 3;
    const y0 = top ? 117 : ROAD_BOTTOM;
    const y1 = top ? ROAD_TOP : 300;
    fill(ctx, earth1, parcel.doorX - 11, y0, 22, y1 - y0);
    fill(ctx, earth3, parcel.doorX - 8, y0, 16, y1 - y0);
    for (let y = y0; y < y1; y += 10) {
      const n = seed(parcel.doorX / 10, y / 10 + 17);
      fill(ctx, n > 0.5 ? earth4 : shade(earth3, 10), parcel.doorX - 6 + (n > 0.5 ? 0 : 5), y + 2, 6, 4);
    }
  }
}

/**
 * An unclaimed plot. Kept deliberately quiet: it is mown lawn with a fence and
 * a small board, not a slab of earth. An empty plot must never out-weigh a
 * neighbour's actual house.
 */
function paintEmptyPlot(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, slot: number): void {
  // Mown lawn, a touch lighter and flatter than the surrounding meadow.
  ctx.fillStyle = 'rgba(166,220,152,0.34)';
  ctx.fillRect(ipx(x - 4), ipx(y), ipx(w + 8), ipx(h + 8));
  for (let gy = y; gy < y + h + 8; gy += 8) {
    ctx.fillStyle = 'rgba(47,90,62,0.07)';
    ctx.fillRect(ipx(x - 4), ipx(gy), ipx(w + 8), 3);
  }
  for (let gy = y; gy < y + h + 8; gy += 12) {
    for (let gx = x - 4; gx < x + w + 8; gx += 12) {
      if (seed(gx / 12 + 61, gy / 12 + 13) > 0.88) fill(ctx, moss5, gx, gy + 3, 4, 3);
    }
  }

  // Low picket fence: posts with two rails, lit from the top-left.
  const post = (fx: number, fy: number) => {
    fill(ctx, shade(earth1, -14), fx, fy, 3, 9);
    fill(ctx, shade(earth2, -6), fx, fy, 2, 9);
  };
  for (const fy of [y - 4, y + h + 6]) {
    fill(ctx, shade(earth1, -10), x - 6, fy + 3, w + 14, 2);
    for (let fx = x - 6; fx <= x + w + 6; fx += 18) post(fx, fy);
  }
  post(x - 6, y + h / 2);
  post(x + w + 6, y + h / 2);

  // Vacancy board on a post.
  const signX = x + w / 2;
  const signY = y + h / 2 - 10;
  fill(ctx, earth0, signX - 2, signY + 10, 5, 18);
  fill(ctx, earth3, signX - 2, signY + 10, 2, 18);
  plate(ctx, signX - 31, signY - 12, 62, 26, PALETTE.paper[3], earth0);
  text(ctx, `PARCELA ${slot + 1}`, signX, signY - 1, PALETTE.paper[1], 8);
  text(ctx, 'LIBRE', signX, signY + 9, shade(moss1, 40), 8);
  contactShadow(ctx, signX, signY + 28, 8, 0.26);
}

function terrain(occupied: readonly OccupiedParcel[]): HTMLCanvasElement | null {
  const key = occupied.map((item) => item.parcel.slot).sort().join(',');
  if (terrainCache && terrainKey === key) return terrainCache;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(2, 2);
  ctx.imageSmoothingEnabled = false;
  paintGrass(ctx);
  paintPaths(ctx);
  paintPlaza(ctx);
  for (const parcel of PARCELS) {
    if (!occupied.some((item) => item.parcel.slot === parcel.slot)) {
      paintEmptyPlot(ctx, parcel.x, parcel.y, parcel.w, parcel.h, parcel.slot);
    }
  }
  terrainCache = canvas;
  terrainKey = key;
  return canvas;
}

// ---------------------------------------------------------------------------
// Buildings
// ---------------------------------------------------------------------------

function paintHouse(ctx: CanvasRenderingContext2D, item: OccupiedParcel, time: number): void {
  const { x, y, w, h, slot } = item.parcel;
  const warm = item.house.theme === 'peach';
  const wall = warm ? '#e8c9a4' : '#d9dfbe';
  const wallLit = shade(wall, 18);
  const wallDark = shade(wall, -40);
  const roof = warm ? ember1 : '#35705c';
  const roofLit = shade(roof, 26);
  const roofDark = shade(roof, -34);
  const trim = warm ? '#9c5340' : '#27584a';

  contactShadow(ctx, x + w / 2, y + h + 8, w * 0.46, 0.34);

  // Plinth the building sits on, so it is planted rather than floating.
  fill(ctx, moss1, x + 2, y + h - 2, w - 4, 12);
  fill(ctx, earth2, x + 4, y + h + 2, w - 8, 6);
  fill(ctx, earth3, x + 4, y + h + 2, w - 8, 3);

  // Body.
  fill(ctx, wallDark, x + 6, y + 20, w - 12, h - 18);
  fill(ctx, wall, x + 6, y + 20, w - 16, h - 20);
  fill(ctx, wallLit, x + 6, y + 20, 6, h - 20);
  // Plank seams.
  for (let py = y + 26; py < y + h - 2; py += 10) {
    fill(ctx, shade(wall, -16), x + 8, py, w - 18, 2);
  }

  // Roof: overhanging eave, then shingle rows stepping up to the ridge.
  fill(ctx, roofDark, x - 2, y + 14, w + 4, 10);
  fill(ctx, roofLit, x - 2, y + 14, w + 4, 3);
  for (let row = 0; row < 4; row += 1) {
    const inset = 2 + row * 7;
    const ry = y + 12 - row * 4;
    fill(ctx, row % 2 ? roof : shade(roof, -12), x + inset, ry, w - inset * 2, 6);
    fill(ctx, roofLit, x + inset, ry, w - inset * 2, 2);
    for (let sx = x + inset + 3; sx < x + w - inset - 3; sx += 9) {
      fill(ctx, roofDark, sx, ry + 2, 2, 4);
    }
  }
  fill(ctx, shade(roof, 34), x + w / 2 - 14, y - 4, 28, 4);

  // Chimney with a slow smoke plume.
  const chimX = x + w - 30;
  fill(ctx, earth0, chimX, y - 12, 12, 18);
  fill(ctx, earth2, chimX, y - 12, 7, 18);
  fill(ctx, shade(earth0, -14), chimX - 2, y - 14, 16, 5);
  for (let p = 0; p < 3; p += 1) {
    const t = (time * 0.32 + p * 0.33) % 1;
    const alpha = (1 - t) * 0.3;
    if (alpha <= 0.01) continue;
    ctx.fillStyle = `rgba(246,240,226,${alpha})`;
    ctx.beginPath();
    ctx.arc(chimX + 6 + Math.sin(t * 5 + p) * 6, y - 16 - t * 30, 3 + t * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Windows with warm interior light and a gentle flicker.
  const flicker = 0.78 + Math.sin(time * 2.1 + hash01(item.ownerId) * 9) * 0.07;
  for (const wx of [x + 16, x + w - 38]) {
    const wy = y + 40;
    fill(ctx, trim, wx - 2, wy - 2, 26, 24);
    ctx.fillStyle = `rgba(255,208,130,${flicker})`;
    ctx.fillRect(ipx(wx), ipx(wy), 22, 20);
    fill(ctx, 'rgba(255,236,190,0.85)', wx, wy, 22, 6);
    fill(ctx, trim, wx + 10, wy, 2, 20);
    fill(ctx, trim, wx, wy + 9, 22, 2);
    fill(ctx, shade(trim, -18), wx - 4, wy + 20, 30, 4);
    glowPool(ctx, wx + 11, y + h + 4, 26);
  }

  // Door with step, handle and a lantern beside it.
  const doorW = 24;
  const doorX = x + w / 2 - doorW / 2;
  const doorY = y + 54;
  fill(ctx, shade(earth0, -16), doorX - 3, doorY - 3, doorW + 6, h - 50);
  fill(ctx, earth1, doorX, doorY, doorW, h - 52);
  fill(ctx, earth2, doorX + 2, doorY + 2, doorW - 6, h - 56);
  fill(ctx, shade(earth2, -18), doorX + 4, doorY + 6, doorW - 10, 2);
  fill(ctx, ember4, doorX + doorW - 8, doorY + 16, 3, 3);
  fill(ctx, earth3, doorX - 4, y + h - 2, doorW + 8, 5);

  const lampX = doorX - 12;
  fill(ctx, trim, lampX, doorY + 6, 4, 4);
  fill(ctx, ember4, lampX - 1, doorY + 10, 6, 7);
  fill(ctx, 'rgba(255,230,170,0.95)', lampX, doorY + 11, 4, 5);
  glowPool(ctx, lampX + 2, doorY + 16, 16);

  // Flower boxes under the windows.
  for (const bx of [x + 14, x + w - 40]) {
    fill(ctx, earth0, bx, y + 62, 26, 7);
    fill(ctx, earth2, bx, y + 62, 26, 3);
    for (let i = 0; i < 4; i += 1) {
      const n = seed(bx + i, y);
      fill(ctx, moss2, bx + 3 + i * 6, y + 58, 2, 5);
      fill(ctx, n > 0.5 ? ember3 : '#e9dcf2', bx + 2 + i * 6, y + 56, 4, 3);
    }
  }

  // Name board over the door. The type is shrunk, then ellipsised, so a long
  // house name degrades gracefully instead of being cut mid-word.
  const boardW = w - 16;
  let label = item.house.name.trim();
  let size = 9;
  ctx.font = `700 ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
  if (ctx.measureText(label).width > boardW - 8) {
    size = 8;
    ctx.font = `700 ${size}px Inter, ui-sans-serif, system-ui, sans-serif`;
    while (label.length > 4 && ctx.measureText(`${label}...`).width > boardW - 8) {
      label = label.slice(0, -1);
    }
    if (label.length < item.house.name.trim().length) label = `${label.trimEnd()}...`;
  }
  plate(ctx, x + 8, y + 26, boardW, 16, warm ? '#fbeedb' : '#f4f6e0', trim);
  text(ctx, label, x + w / 2, y + 37, PALETTE.paper[1], size);

  // Who lives here, on a stake by the path.
  const tagY = slot < 3 ? y + h + 16 : y - 22;
  const tag = item.isOwn ? 'TU CASA' : item.name.slice(0, 15);
  ctx.font = '700 9px Inter, ui-sans-serif, system-ui, sans-serif';
  const tw = Math.min(120, Math.ceil(ctx.measureText(tag).width) + 16);
  plate(ctx, item.parcel.doorX - tw / 2, tagY, tw, 15, item.isOwn ? ember4 : PALETTE.paper[3], trim);
  text(ctx, tag, item.parcel.doorX, tagY + 11, PALETTE.paper[0], 9);
}

// ---------------------------------------------------------------------------
// Plaza, lamps and ambience
// ---------------------------------------------------------------------------

/**
 * The plaza is painted flat into the terrain, not built as an object.
 * WORLD_SPAWN is 384,215 - dead centre - and decorative props are not
 * collision obstacles, so anything tall here would swallow the character.
 */
function paintPlaza(ctx: CanvasRenderingContext2D): void {
  const cx = 384;
  const cy = 217;
  fill(ctx, shade(earth2, -12), cx - 58, cy - 20, 116, 40);
  fill(ctx, earth3, cx - 56, cy - 18, 112, 36);
  // Radial cobble medallion.
  for (let ring = 0; ring < 3; ring += 1) {
    const rw = 96 - ring * 30;
    const rh = 30 - ring * 9;
    ctx.strokeStyle = ring % 2 ? shade(earth4, 10) : shade(earth2, -6);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    fill(ctx, shade(earth2, -4), cx + Math.cos(a) * 40 - 2, cy + Math.sin(a) * 13 - 2, 5, 4);
  }
  fill(ctx, shade(earth4, 14), cx - 8, cy - 4, 16, 8);
}

function paintLamp(ctx: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  contactShadow(ctx, x, y + 2, 7, 0.3);
  fill(ctx, earth0, x - 3, y - 30, 6, 32);
  fill(ctx, earth2, x - 3, y - 30, 2, 32);
  fill(ctx, earth0, x - 7, y - 36, 14, 7);
  const pulse = 0.82 + Math.sin(time * 2.4 + x) * 0.1;
  ctx.fillStyle = `rgba(255,214,140,${pulse})`;
  ctx.fillRect(ipx(x - 5), ipx(y - 34), 10, 8);
  fill(ctx, ember4, x - 5, y - 34, 10, 3);
  fill(ctx, ember0, x - 7, y - 38, 14, 4);
  glowPool(ctx, x, y + 2, 40);
}

function paintAmbience(ctx: CanvasRenderingContext2D, time: number): void {
  // Drifting motes, kept few and cheap.
  for (let i = 0; i < 16; i += 1) {
    const base = hash01(`mote${i}`);
    const speed = 0.14 + base * 0.2;
    const x = (base * W + time * speed * 60) % W;
    const y = 40 + ((base * 613) % 320) + Math.sin(time * 0.8 + i) * 12;
    if (y > ROAD_TOP - 14 && y < ROAD_BOTTOM + 14) continue;
    const alpha = 0.22 + Math.sin(time * 1.6 + i * 2) * 0.16;
    if (alpha <= 0.02) continue;
    ctx.fillStyle = `rgba(255,242,198,${alpha})`;
    ctx.fillRect(Math.round(x), Math.round(y), 2, 2);
  }
}

/**
 * Corner darkening, which focuses the eye on the middle of the village.
 * Cached, because a full-canvas radial gradient every frame is the single most
 * expensive thing in the scene and it never changes.
 */
let vignetteCache: HTMLCanvasElement | null = null;

function vignette(): HTMLCanvasElement | null {
  if (vignetteCache) return vignetteCache;
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = W * 2;
  canvas.height = H * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(2, 2);
  const gradient = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.92);
  gradient.addColorStop(0, 'rgba(20,40,32,0)');
  gradient.addColorStop(1, 'rgba(20,40,32,0.30)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
  vignetteCache = canvas;
  return canvas;
}

function paintVignette(ctx: CanvasRenderingContext2D): void {
  const cached = vignette();
  if (cached) { ctx.drawImage(cached, 0, 0, W, H); return; }
  const gradient = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.92);
  gradient.addColorStop(0, 'rgba(20,40,32,0)');
  gradient.addColorStop(1, 'rgba(20,40,32,0.30)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------------------

export function drawWorld(
  ctx: CanvasRenderingContext2D,
  occupied: readonly OccupiedParcel[],
  people: readonly DrawPerson[],
  dt = 0,
  nearbyPortalId: string | null = null,
): void {
  ctx.imageSmoothingEnabled = false;
  const calm = reducedMotion();
  // Freezing the clock holds every decorative animation on a single frame
  // while leaving character walk cycles, which read dt directly, intact.
  const time = calm ? 0 : animClock();

  const ground = terrain(occupied);
  if (ground) ctx.drawImage(ground, 0, 0, W, H);
  else { paintGrass(ctx); paintPaths(ctx); paintPlaza(ctx); }

  for (const portal of WORLD_AREAS.residential.portals) {
    drawPortalSign(ctx, portal, portal.id === nearbyPortalId);
  }

  const sprites: Sprite[] = [];

  for (const tree of WORLD_TREES) {
    const n = hash01(`${tree.x}:${tree.y}`);
    const sway = calm ? 0 : Math.sin(time * 0.9 + n * 6.3) * 1.6;
    const scale = 0.88 + n * 0.3;
    const variant = Math.floor(n * 2137) % 3;
    sprites.push({ baseline: tree.y + 12, paint: () => drawTree(ctx, tree.x, tree.y, scale, sway, variant) });
  }
  for (const item of occupied) {
    sprites.push({ baseline: item.parcel.y + item.parcel.h, paint: () => paintHouse(ctx, item, time) });
  }
  // Lamps stand on the verge, clear of the plaza and of every door path.
  for (const x of [238, 530]) {
    sprites.push({ baseline: ROAD_TOP - 2, paint: () => paintLamp(ctx, x, ROAD_TOP - 2, time) });
  }

  for (const person of people) {
    const id = person.identity.fingerprint || person.identity.displayName;
    const at = trackCharacter(id, person.position, dt, !person.isOwn);
    sprites.push({
      baseline: at.y,
      paint: () => drawAvatar(ctx, at.x, at.y, person.identity, person.position, person.isOwn),
    });
  }

  sprites.sort((a, b) => a.baseline - b.baseline);
  for (const sprite of sprites) sprite.paint();

  if (!calm) paintAmbience(ctx, time);
  paintVignette(ctx);
  paintSceneFade(ctx, 'world', W, H);
}
```

### app/src/ui/style.css

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `bf53dd54e7a50b4e5b184fc3bc5a35b9a91f1c02f0fcac605a72126b9f790990`.

```css
/*
 * StudyVillage interface skin. See docs/VISUAL_DESIGN.md.
 * A dark wood-and-parchment shell deliberately replaces the earlier stack of
 * white rounded cards: it frames the pixel scene instead of competing with it,
 * and makes the lit canvas the brightest thing on screen.
 * No webfonts: the page CSP is default-src 'self' with no font-src.
 */

:root {
  --ink: #16261f;
  --shell: #1b2f26;
  --shell-2: #223a2e;
  --shell-3: #2b4738;
  --wood: #43301f;
  --wood-lit: #6a4b31;
  --parchment: #f3e7cc;
  --parchment-2: #e6d5b1;
  --parchment-3: #d8c398;
  --ember: #cf6f3c;
  --ember-lit: #f0a05f;
  --ember-dark: #8f4526;
  --moss: #4e9a5c;
  --moss-dark: #2f5a3e;
  --on-dark: #d6e2cb;
  --on-dark-dim: #93a894;
  --on-parchment: #22382e;
  --on-parchment-dim: #6a7f66;
  --danger: #c2543f;

  --chamfer: polygon(5px 0, calc(100% - 5px) 0, 100% 5px, 100% calc(100% - 5px), calc(100% - 5px) 100%, 5px 100%, 0 calc(100% - 5px), 0 5px);
  --chamfer-lg: polygon(9px 0, calc(100% - 9px) 0, 100% 9px, 100% calc(100% - 9px), calc(100% - 9px) 100%, 9px 100%, 0 calc(100% - 9px), 0 9px);

  --ease-in: cubic-bezier(.2, .8, .3, 1);
  --ease-out: cubic-bezier(.4, 0, .2, 1);
  --t-fast: 130ms;
  --t-panel: 210ms;
  --t-scene: 300ms;

  --font-ui: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  font-family: var(--font-ui);
  color: var(--on-dark);
  background: var(--shell);
  font-synthesis: none;
  -webkit-font-smoothing: antialiased;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; background: var(--shell); }
button, input, select, textarea { font: inherit; }
button { cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .42; }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, canvas:focus-visible, label:focus-within {
  outline: 2px solid var(--ember-lit);
  outline-offset: 2px;
}
[hidden] { display: none !important; }

/* ---------------------------------------------------------------- shell -- */

.sv-app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(1200px 620px at 50% -10%, #2d4b3a 0, transparent 70%),
    linear-gradient(180deg, #1d3328 0, #16261f 100%);
}
.sv-inline, .sv-board-bottom,
.sv-toolbar, .sv-list-heading, .sv-page-heading, .sv-contact-row, .sv-diagnostic-row { display: flex; align-items: center; }

/* Pixel house mark, built from boxes so it matches the in-game art. */

.sv-status-pill {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 7px 12px;
  clip-path: var(--chamfer);
  background: #16281f;
  color: var(--on-dark-dim);
  font: 800 10px var(--font-mono);
  letter-spacing: .1em; text-transform: uppercase; white-space: nowrap;
  box-shadow: inset 0 0 0 1px #33503d;
}
.sv-status-pill::before { content: ''; width: 7px; height: 7px; background: #5c7362; }
.sv-status-pill.is-online { color: #bfe6c3; }
.sv-status-pill.is-online::before { background: #67d184; box-shadow: 0 0 0 3px #67d1842e; }
.sv-main { min-width: 0; display: flex; flex-direction: column; }
/* Cap the scene by viewport height too, so on short windows the frame shrinks
 * instead of pushing the footer off and leaving a tall empty column. */
.sv-canvas { max-height: calc(100vh - 252px); }
.sv-canvas-wrap { display: flex; justify-content: center; }

/* --------------------------------------------------------------- panels -- */

.sv-card, .sv-panel {
  position: relative;
  clip-path: var(--chamfer-lg);
  background: linear-gradient(180deg, var(--parchment) 0, var(--parchment-2) 100%);
  color: var(--on-parchment);
  box-shadow: 0 3px 0 #0d1a14b0, 0 10px 26px #0a140f66;
}
.sv-card { padding: 15px; }
.sv-panel { padding: 20px; }
/* Hairline inner edge, drawn rather than bordered so the chamfer stays sharp. */
.sv-card::before, .sv-panel::before {
  content: ''; position: absolute; inset: 3px;
  clip-path: var(--chamfer);
  box-shadow: inset 0 0 0 1px #00000016;
  pointer-events: none;
}
.sv-eyebrow { color: var(--ember-dark); font: 800 9px var(--font-mono); letter-spacing: .16em; text-transform: uppercase; }
.sv-card h3, .sv-panel h3 { margin: 7px 0 11px; font-size: 15px; font-weight: 800; letter-spacing: -.02em; color: var(--on-parchment); }
.sv-subtle { color: var(--on-parchment-dim); font-size: 12px; line-height: 1.5; margin: 6px 0 12px; }
.sv-tiny { display: block; font-size: 10px; line-height: 1.5; color: var(--on-parchment-dim); }
.sv-error { color: var(--danger); font-size: 11px; line-height: 1.5; font-weight: 700; }
.sv-stack { display: flex; flex-direction: column; gap: 8px; }
.sv-inline { gap: 7px; flex-wrap: wrap; }
.sv-wide { width: 100%; }

.sv-profile { background: linear-gradient(180deg, #e9dcbb 0, #dccca6 100%); }
.sv-profile-avatar {
  width: 36px; height: 36px; flex: none;
  display: grid; place-items: center;
  clip-path: var(--chamfer);
  color: #fffdf5; font-size: 20px;
  box-shadow: 0 2px 0 #00000038, inset 0 0 0 2px #ffffff55;
}
.sv-profile-form { border-top: 1px solid #00000018; padding-top: 11px; }

/* --------------------------------------------------------------- inputs -- */

.sv-field { display: flex; flex-direction: column; gap: 5px; min-width: 0; flex: 1; }
.sv-field-label { color: var(--on-parchment-dim); font: 800 9px var(--font-mono); letter-spacing: .1em; text-transform: uppercase; }
.sv-input, .sv-select {
  width: 100%; min-width: 0;
  border: 0;
  clip-path: var(--chamfer);
  background: #fffdf4;
  color: var(--on-parchment);
  outline: none;
  box-shadow: inset 0 0 0 2px #c3b08a, inset 0 2px 3px #00000014;
  transition: box-shadow var(--t-fast) var(--ease-in);
}
.sv-input, .sv-select { height: 32px; padding: 0 9px; font-size: 11px; font-weight: 600; }
.sv-select { -webkit-appearance: none; appearance: none; padding-right: 22px; background-image: linear-gradient(45deg, transparent 50%, #7b6a4c 50%), linear-gradient(135deg, #7b6a4c 50%, transparent 50%); background-position: calc(100% - 12px) 13px, calc(100% - 8px) 13px; background-size: 4px 4px; background-repeat: no-repeat; }
.sv-input::placeholder { color: #a6997c; }
.sv-input:focus, .sv-select:focus { box-shadow: inset 0 0 0 2px var(--moss), inset 0 2px 3px #00000014; }
.sv-color-input { width: 40px; min-width: 40px; height: 32px; padding: 2px; border: 0; clip-path: var(--chamfer); background: #fffdf4; box-shadow: inset 0 0 0 2px #c3b08a; cursor: pointer; }

/* -------------------------------------------------------------- buttons -- */
/* Chamfered face over a hard drop edge; the face sinks onto the edge on press
 * rather than fading, which gives a physical click. */

.sv-button {
  position: relative;
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 34px; padding: 0 13px;
  border: 0;
  clip-path: var(--chamfer);
  background: linear-gradient(180deg, #fffdf4 0, #ecdfc0 100%);
  color: #35553f;
  font: 800 11px var(--font-ui);
  letter-spacing: .01em;
  text-decoration: none; white-space: nowrap;
  box-shadow: 0 3px 0 #9d8a63, inset 0 1px 0 #fffef9;
  transition: transform var(--t-fast) var(--ease-in), box-shadow var(--t-fast) var(--ease-in), filter var(--t-fast) var(--ease-in);
}
.sv-button:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 4px 0 #9d8a63, inset 0 1px 0 #fffef9; filter: brightness(1.04); }
.sv-button:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 0 0 #9d8a63, inset 0 1px 0 #fffef9; }

.sv-button-primary {
  background: linear-gradient(180deg, #5aa86a 0, #3d7a4f 100%);
  color: #f3fbee;
  box-shadow: 0 3px 0 #255138, inset 0 1px 0 #8ed49a66;
}
.sv-button-primary:hover:not(:disabled) { box-shadow: 0 4px 0 #255138, inset 0 1px 0 #8ed49a66; }
.sv-button-primary:active:not(:disabled) { box-shadow: 0 0 0 #255138, inset 0 1px 0 #8ed49a66; }

.sv-button-outline { background: #00000010; color: #3f6450; box-shadow: 0 3px 0 #00000026, inset 0 0 0 2px #00000030; }
.sv-button-outline:hover:not(:disabled) { background: #0000001c; box-shadow: 0 4px 0 #00000026, inset 0 0 0 2px #00000030; }
.sv-button-outline:active:not(:disabled) { box-shadow: 0 0 0 #00000026, inset 0 0 0 2px #00000030; }
.sv-button-small { min-height: 28px; padding: 0 9px; font-size: 10px; }

.sv-link-button {
  border: 0; background: transparent; padding: 4px 0;
  color: #3d7a57; font: 800 11px var(--font-ui); text-align: left;
  transition: color var(--t-fast) var(--ease-in);
}
.sv-link-button:hover:not(:disabled) { color: var(--ember-dark); text-decoration: underline; text-underline-offset: 3px; }
.sv-danger-text { color: var(--danger); }
.sv-icon-button { border: 0; background: transparent; color: var(--on-parchment-dim); font-size: 20px; line-height: 1; padding: 2px 6px; transition: color var(--t-fast) var(--ease-in), transform var(--t-fast) var(--ease-in); }
.sv-icon-button:hover:not(:disabled) { color: var(--danger); transform: scale(1.12); }

/* ----------------------------------------------------------- navigation -- */
/* Drawn as a carved rail rather than a list of pills. */

/* Ember tab marker on the active entry. */

.sv-house-icon svg { width: 13px; height: 13px; }

.sv-session-card { padding: 15px; }
.sv-session-card h3 { margin-bottom: 2px; }
/* Stacked, because on a 194px rail an input beside a button clipped its
 * placeholder text. */
.sv-join-form { display: flex; flex-direction: column; gap: 5px; margin: 9px 0; }
.sv-join-form .sv-input { width: 100%; }
.sv-join-form .sv-button { width: 100%; }
.sv-invite-box { display: flex; flex-direction: column; gap: 5px; padding: 9px; margin: 10px 0; clip-path: var(--chamfer); background: #00000012; }
.sv-code-input { font-family: var(--font-mono); letter-spacing: .02em; }

/* ---------------------------------------------------------------- stage -- */

.sv-notice {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 10px 14px; margin-bottom: 13px;
  clip-path: var(--chamfer);
  background: linear-gradient(180deg, #f6dcb4 0, #ecc795 100%);
  color: #6d4526;
  font-size: 12px; font-weight: 600; line-height: 1.45;
  box-shadow: 0 3px 0 #00000030;
  animation: sv-drop var(--t-panel) var(--ease-in);
}
.sv-page-heading { justify-content: space-between; gap: 20px; margin-bottom: 14px; }
.sv-page-heading h1 {
  margin: 4px 0 2px;
  color: #f2e8cf;
  font-size: clamp(24px, 2.6vw, 34px);
  font-weight: 800; letter-spacing: -.055em; line-height: 1.08;
  text-shadow: 0 2px 0 #0e1b15;
}
.sv-page-heading .sv-subtle { margin: 3px 0 0; color: var(--on-dark-dim); }
.sv-page-heading .sv-eyebrow { color: var(--ember-lit); }

/* The scene is framed like a lit window set into the wooden shell. */
.sv-stage-pane {
  padding: 9px;
  clip-path: var(--chamfer-lg);
  background: linear-gradient(180deg, var(--wood-lit) 0, var(--wood) 100%);
  box-shadow: 0 4px 0 #1d1309, 0 14px 34px #0a140f70;
}
.sv-canvas-wrap {
  position: relative; overflow: hidden;
  background: #2f5a3e;
  box-shadow: inset 0 0 0 3px #1d1309, 0 0 0 2px #8a6a45;
}
.sv-canvas { display: block; width: 100%; height: auto; aspect-ratio: 16 / 9; touch-action: none; }
.sv-canvas.is-disabled { cursor: not-allowed; }
/* Soft inner shading so the scene sits inside the frame. */
.sv-canvas-wrap::after {
  content: ''; position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 0 26px #0d1c1455;
}

/* -------------------------------------------------------------- content -- */

.sv-board-pane { padding: 12px; }
.sv-toolbar { gap: 9px; flex-wrap: wrap; padding: 2px 2px 12px; }
.sv-segment { display: inline-flex; overflow: hidden; clip-path: var(--chamfer); box-shadow: 0 3px 0 #9d8a63; }
.sv-segment-button {
  border: 0; background: linear-gradient(180deg, #fffdf4 0, #ecdfc0 100%);
  color: #5a7a62; padding: 8px 11px; font: 800 11px var(--font-ui);
  transition: background var(--t-fast) var(--ease-in), color var(--t-fast) var(--ease-in);
}
.sv-segment-button + .sv-segment-button { box-shadow: inset 1px 0 0 #c3b08a; }
.sv-segment-button:hover:not(.is-active) { background: #f7efd9; }
.sv-segment-button.is-active { color: #f3fbee; background: linear-gradient(180deg, #5aa86a 0, #3d7a4f 100%); }
.sv-toolbar .sv-select { width: auto; }
.sv-board-bottom { justify-content: space-between; gap: 13px; flex-wrap: wrap; padding: 12px 2px 2px; }
.sv-board-bottom .sv-subtle { margin: 0; }
.sv-board-bottom .sv-select { width: auto; }
.sv-section-title { margin: 18px 0 9px !important; padding-top: 14px; border-top: 1px solid #00000018; }
.sv-layers { display: flex; flex-wrap: wrap; gap: 7px; }
.sv-layer {
  display: flex; align-items: center; gap: 6px;
  clip-path: var(--chamfer); padding: 7px 10px;
  background: #00000010; font-size: 11px; font-weight: 700; color: var(--on-parchment); cursor: pointer;
  transition: background var(--t-fast) var(--ease-in);
}
.sv-layer:hover { background: #0000001e; }
.sv-layer small { color: var(--on-parchment-dim); font: 600 9px var(--font-mono); }
.sv-layer input { accent-color: var(--moss-dark); }
.sv-panel-intro h2, .sv-panel > h2 { margin: 4px 0; font-size: 21px; font-weight: 800; letter-spacing: -.04em; }

.sv-panel-intro { margin-bottom: 18px; }
.sv-contact-code { padding: 17px; clip-path: var(--chamfer); background: #00000012; }
.sv-friend-code { display: block; margin: 7px 0 14px; color: #2f6551; font: 800 16px var(--font-mono); overflow-wrap: anywhere; }
.sv-contact-import { margin-top: 18px; padding: 16px; clip-path: var(--chamfer); background: #00000008; box-shadow: inset 0 0 0 2px #00000018; }
.sv-contact-import h3 { margin: 0 0 3px; }
.sv-file-input { width: 100%; font-size: 11px; color: var(--on-parchment-dim); }
.sv-file-input::file-selector-button { border: 0; clip-path: var(--chamfer); background: linear-gradient(180deg, #fffdf4 0, #ecdfc0 100%); color: #35553f; padding: 7px 11px; margin-right: 10px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 0 #9d8a63; }
.sv-contact-list { display: grid; gap: 8px; }
.sv-contact-row { gap: 10px; padding: 11px; clip-path: var(--chamfer); background: #00000010; }
.sv-contact-row strong, .sv-contact-row small { display: block; }
.sv-contact-row small { margin-top: 3px; font: 600 10px var(--font-mono); color: var(--on-parchment-dim); overflow-wrap: anywhere; }
.sv-diagnostic-controls { display: flex; flex-wrap: wrap; gap: 7px; margin: 19px 0; }
.sv-diagnostic-list { display: grid; gap: 7px; }
.sv-diagnostic-row { align-items: flex-start; gap: 12px; clip-path: var(--chamfer); background: #00000010; padding: 12px; }
.sv-diagnostic-row strong { font-size: 12px; }
.sv-diagnostic-row p { margin: 3px 0 0; }
.sv-diagnostic-badge { min-width: 86px; clip-path: var(--chamfer); padding: 5px 6px; background: #00000018; color: var(--on-parchment-dim); font: 800 9px var(--font-mono); letter-spacing: .06em; text-align: center; }
.sv-diagnostic-badge.is-pass { background: #cfe8cb; color: #2d6b45; }
.sv-diagnostic-badge.is-fail { background: #f3d4cb; color: #9d4433; }
.sv-diagnostic-badge.is-unverified { background: #efdfbe; color: #8a6428; }

/* ------------------------------------------------------------ inspector -- */

.sv-context-card h3 { margin-bottom: 3px; }
.sv-house-list, .sv-people-list, .sv-approval-list, .sv-furniture-list { display: flex; flex-direction: column; gap: 5px; }
.sv-house-list { margin-top: 11px; }
.sv-house-row {
  width: 100%; display: flex; align-items: center; gap: 8px;
  border: 0; clip-path: var(--chamfer); padding: 7px;
  background: #00000010; color: var(--on-parchment); text-align: left;
  transition: background var(--t-fast) var(--ease-in), transform var(--t-fast) var(--ease-in);
}
.sv-house-row:hover:not(:disabled) { background: #00000020; transform: translateX(2px); }
.sv-house-row-text { flex: 1; min-width: 0; }
.sv-house-row strong, .sv-house-row small { display: block; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.sv-house-row strong { font-size: 11px; font-weight: 800; }
.sv-house-row small { margin-top: 2px; color: var(--on-parchment-dim); font: 600 9px var(--font-mono); }
.sv-house-icon { display: grid; place-items: center; width: 24px; height: 24px; flex: none; clip-path: var(--chamfer); background: #cfe3c2; color: #35664f; font-size: 15px; }
.sv-list-divider { margin: 14px 0 4px; padding-top: 11px; border-top: 1px solid #00000018; }
.sv-person-row { display: flex; align-items: center; gap: 8px; min-height: 26px; font-size: 11px; font-weight: 600; }
.sv-person-row > span:nth-child(2) { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sv-person-dot { flex: none; display: inline-block; width: 12px; height: 12px; clip-path: var(--chamfer); box-shadow: 0 0 0 2px #ffffff80, 0 1px 0 #00000040; }
.sv-person-row .sv-link-button { font-size: 9px; }
.sv-approval-card { background: linear-gradient(180deg, #f6dcb4 0, #e9c492 100%); }
.sv-approval-row { display: flex; flex-direction: column; gap: 3px; padding: 8px 0; border-top: 1px solid #00000020; }
.sv-approval-row strong { font-size: 12px; }
.sv-approval-row small { color: #85663f; font: 600 10px var(--font-mono); }
.sv-approval-row .sv-inline { margin-top: 7px; }
.sv-house-editor { display: flex; flex-direction: column; gap: 8px; }
.sv-house-editor h3 { margin: 0 0 3px; }
.sv-list-heading { justify-content: space-between; border-top: 1px solid #00000018; padding-top: 10px; margin-top: 4px; font-size: 11px; font-weight: 800; }
.sv-furniture-list { max-height: 122px; overflow: auto; }
.sv-furniture-item {
  border: 0; clip-path: var(--chamfer); background: #00000010;
  color: var(--on-parchment); padding: 6px 8px; text-align: left; font-size: 10px; font-weight: 700;
  transition: background var(--t-fast) var(--ease-in);
}
.sv-furniture-item:hover { background: #0000001e; }
.sv-furniture-item.is-selected { background: linear-gradient(180deg, #5aa86a 0, #3d7a4f 100%); color: #f3fbee; }
.sv-house-editor .sv-inline .sv-select { flex: 1; }
.sv-furniture-detail { border-top: 1px solid #00000018; padding-top: 10px; }
.sv-media-card .sv-subtle { margin-bottom: 4px; }
.sv-media-controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 5px; margin: 11px 0; }
.sv-media-controls .sv-button { white-space: normal; min-height: 32px; padding: 4px 6px; font-size: 10px; }
.sv-media-controls .is-active { background: linear-gradient(180deg, #5aa86a 0, #3d7a4f 100%); color: #f3fbee; box-shadow: 0 3px 0 #255138; }
.sv-media-tiles { display: grid; gap: 7px; }
.sv-media-tile { overflow: hidden; clip-path: var(--chamfer); background: #00000018; }
.sv-media-tile strong { display: block; padding: 6px 8px; font-size: 10px; font-weight: 800; }
.sv-media-tile video { display: block; width: 100%; max-height: 160px; background: #16261f; }
.sv-media-tile audio { display: block; width: 100%; height: 22px; }

/* -------------------------------------------------------------- overlay -- */

.sv-lock-overlay {
  position: fixed; z-index: 100; inset: 0;
  display: grid; place-items: center; padding: 20px;
  background: #0d1a14d9;
  backdrop-filter: blur(5px);
  animation: sv-fade var(--t-panel) var(--ease-in);
}
.sv-lock-card {
  width: min(390px, 100%); padding: 28px;
  clip-path: var(--chamfer-lg);
  background: linear-gradient(180deg, var(--parchment) 0, var(--parchment-2) 100%);
  color: var(--on-parchment);
  box-shadow: 0 6px 0 #0a140fcc, 0 24px 60px #05100b99;
  animation: sv-rise var(--t-scene) var(--ease-in);
}
.sv-lock-icon { width: 44px; height: 44px; display: grid; place-items: center; clip-path: var(--chamfer); background: #cfe3c2; color: #35664f; font-size: 26px; box-shadow: 0 2px 0 #00000038; }
.sv-lock-card h2 { margin: 16px 0 6px; font-size: 21px; font-weight: 800; letter-spacing: -.045em; }
.sv-lock-card p { color: var(--on-parchment-dim); font-size: 12px; line-height: 1.55; }
.sv-lock-card .sv-button { width: 100%; margin-top: 15px; }

/* ------------------------------------------------------------- motion ---- */

@keyframes sv-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes sv-rise { from { opacity: 0; transform: translateY(10px) scale(.985) } to { opacity: 1; transform: none } }
@keyframes sv-drop { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }
@keyframes sv-scene { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }

/* Panes animate in when the view changes. */
.sv-stage-pane, .sv-board-pane, .sv-panel { animation: sv-scene var(--t-scene) var(--ease-in); }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
  }
  .sv-house-row:hover, .sv-button:hover { transform: none !important; }
}

/* ------------------------------------------------------------ responsive - */

@media (max-width: 740px) {
  .sv-status-pill { padding: 6px 9px; font-size: 9px; }
  /* min-width:0 is required: as a flex item the rail defaults to min-width
   * auto, so it grew to fit all six entries and pushed the page sideways
   * instead of scrolling within itself. */
  
  .sv-main { order: 1; }
  .sv-page-heading .sv-button { display: none; }
  .sv-page-heading h1 { font-size: 25px; }
  .sv-panel { padding: 14px; }
  .sv-toolbar { gap: 7px; }
  .sv-segment-button { min-height: 40px; padding: 8px 12px; font-size: 11px; }
}

/* ------------------------------------------------------- infinite board -- */

.sv-zoom { display: inline-flex; align-items: center; gap: 5px; margin-left: auto; }
.sv-zoom-label { min-width: 44px; text-align: center; color: var(--on-parchment-dim); font: 800 10px var(--font-mono); }
.sv-board-wrap { position: relative; }
.sv-board-hint { margin: 8px 2px 0; }

/* The cursor says what a click will do. */
.sv-board-wrap .sv-canvas[data-tool="pen"],
.sv-board-wrap .sv-canvas[data-tool="line"],
.sv-board-wrap .sv-canvas[data-tool="rectangle"] { cursor: crosshair; }
.sv-board-wrap .sv-canvas[data-tool="text"] { cursor: text; }
.sv-board-wrap .sv-canvas[data-tool="hand"] { cursor: grab; }
.sv-board-wrap .sv-canvas[data-tool="hand"]:active { cursor: grabbing; }
.sv-board-wrap .sv-canvas[data-tool="eraser"] { cursor: cell; }

/* Inline text editor that sits on the board where you clicked. */
.sv-board-text {
  position: absolute;
  z-index: 2;
  min-width: 160px;
  max-width: 70%;
  padding: 2px 4px;
  border: 0;
  outline: 2px dashed var(--ember-lit);
  outline-offset: 2px;
  background: rgba(255, 253, 245, 0.92);
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-weight: 600;
  line-height: 1.3;
  resize: none;
  overflow: hidden;
  animation: sv-fade var(--t-fast) var(--ease-in);
}

.sv-button.is-armed {
  background: linear-gradient(180deg, #e98a6c 0, #c25f3c 100%);
  color: #fff7ee;
  box-shadow: 0 3px 0 #8c3f2c;
}

/* --------------------------------------------------------- private voice -- */

.sv-private { display: flex; flex-direction: column; gap: 7px; margin: 4px 0 10px; padding-top: 10px; border-top: 1px solid #00000018; }
.sv-private-list { display: flex; flex-wrap: wrap; gap: 5px; }
.sv-private-pick { gap: 6px; }
.sv-private-request {
  display: flex; flex-direction: column; gap: 7px; padding: 9px;
  clip-path: var(--chamfer);
  background: linear-gradient(180deg, #f6dcb4 0, #ecc795 100%);
  animation: sv-drop var(--t-panel) var(--ease-in);
}
.sv-private-request strong { font-size: 11px; }
.sv-private-status {
  display: flex; align-items: center; gap: 8px; padding: 8px 9px;
  clip-path: var(--chamfer); background: #00000012; font-size: 11px; font-weight: 700;
}
.sv-private-status > span:nth-child(2) { flex: 1; }
.sv-private-dot { width: 8px; height: 8px; flex: none; background: #b0b5a5; }
.sv-private-status.is-live { background: #cfe8cb; color: #24553a; }
.sv-private-status.is-live .sv-private-dot { background: #3fae66; box-shadow: 0 0 0 3px #3fae6633; animation: sv-pulse 1.4s ease-in-out infinite; }
@keyframes sv-pulse { 50% { opacity: .35; } }

/* ------------------------------------------- whiteboard gemini bar & colors */

.sv-swatch-row {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 6px;
  clip-path: var(--chamfer);
  background: #00000010;
}
.sv-color-swatch {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 0;
  clip-path: var(--chamfer);
  box-shadow: inset 0 0 0 2px #ffffff88, 0 1px 0 #00000045;
  transition: transform var(--t-fast) var(--ease-in);
}
.sv-color-swatch:hover { transform: scale(1.12); }
.sv-color-swatch.is-active {
  box-shadow: 0 0 0 2px var(--ember-dark), inset 0 0 0 2px #fff;
  transform: scale(1.12);
}

.sv-latex-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 8px;
  margin-bottom: 10px;
  clip-path: var(--chamfer);
  background: #0000000d;
  box-shadow: inset 0 0 0 1px #00000018;
}
.sv-latex-chip {
  border: 0;
  clip-path: var(--chamfer);
  padding: 4px 9px;
  background: #fffdf4;
  color: #2c4c3b;
  font: 700 10px var(--font-mono);
  box-shadow: 0 2px 0 #b8a57e;
  transition: transform var(--t-fast) var(--ease-in), background var(--t-fast) var(--ease-in);
}
.sv-latex-chip:hover {
  background: #f5ebd2;
  transform: translateY(-1px);
}

/* ------------------------------------------------- local code runner console */

/* ------------------------------------------- structured screen share theater */

.sv-screen-theater {
  margin-bottom: 14px;
  padding: 12px;
  clip-path: var(--chamfer-lg);
  background: linear-gradient(180deg, #1f352a 0, #16261e 100%);
  color: var(--on-dark);
  box-shadow: 0 4px 0 #0e1914, 0 12px 28px #07100c88;
}
.sv-screen-theater-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}
.sv-screen-theater-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font: 800 12px var(--font-ui);
  color: #f0e6cd;
}
.sv-screen-theater-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 10px;
}
.sv-screen-theater-grid.is-spotlight .sv-media-tile.is-spotlight {
  grid-column: 1 / -1;
}
.sv-screen-theater .sv-media-tile {
  background: #0f1c16;
  box-shadow: inset 0 0 0 1px #2f4e3d;
}
.sv-screen-theater .sv-media-tile video {
  max-height: 460px;
  width: 100%;
  object-fit: contain;
  background: #0b1410;
}
.sv-media-tile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 10px;
  background: #00000028;
}
.sv-media-tile-head strong {
  padding: 0;
  font-size: 11px;
}

/* ---------------------------------------------------------- voice mic meter */

.sv-mic-meter-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 0 8px;
  padding: 5px 8px;
  clip-path: var(--chamfer);
  background: #00000012;
}
.sv-mic-meter-bar {
  flex: 1;
  height: 7px;
  clip-path: var(--chamfer);
  background: #00000022;
  overflow: hidden;
}
.sv-mic-meter-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #4e9a5c 0, #cf6f3c 100%);
  transition: width 90ms linear;
}

/* ------------------------------------------- avatar & furniture customizer */

.sv-customizer-details {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid #00000018;
}
.sv-customizer-summary {
  cursor: pointer;
  font: 800 10px var(--font-mono);
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--ember-dark);
  user-select: none;
}
.sv-asset-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
}
.sv-furniture-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

/* ------------------------------------------------ AI Whiteboard & Study UI */

.sv-ai-board-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 10px;
  clip-path: var(--chamfer);
  background: linear-gradient(180deg, #f3e9d2 0, #e8dcc0 100%);
  border: 1px solid #cbb996;
}
.sv-ai-board-input {
  flex: 1 1 200px;
  min-width: 160px;
  padding: 5px 8px;
  font-size: 12px;
}
.sv-ai-sprite-box {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #00000018;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sv-ai-sprite-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.sv-ai-sprite-row .sv-input {
  flex: 1;
  min-width: 0;
  padding: 5px 7px;
  font-size: 11px;
}
.sv-ai-sprite-preview {
  width: 32px;
  height: 32px;
  image-rendering: pixelated;
  border: 1px solid #00000030;
  background: #f6eedc;
  border-radius: 3px;
}
.sv-ai-modal-overlay {
  z-index: 45;
  padding: 20px;
}
.sv-ai-modal-card {
  width: min(760px, 94vw);
  max-height: 86vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px;
}
.sv-ai-modal-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.sv-ai-modal-head h2 {
  margin: 2px 0 0;
  font-size: 18px;
}
.sv-ai-modal-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.sv-ai-modal-controls .sv-input {
  flex: 1 1 240px;
}
.sv-flashcard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 10px;
}
.sv-flashcard {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-height: 112px;
  padding: 12px;
  text-align: left;
  cursor: pointer;
  clip-path: var(--chamfer);
  background: #fdf9ee;
  border: 1px solid #cdb994;
  box-shadow: 0 2px 0 #b8a37e;
}
.sv-flashcard.is-flipped {
  background: #eaf4ed;
  border-color: #6a9c78;
}
.sv-flashcard-front {
  font-size: 13px;
  line-height: 1.35;
  color: #231c18;
}
.sv-flashcard-back {
  margin: 4px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: #1f4734;
}
.sv-quiz-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.sv-quiz-card {
  padding: 12px;
  clip-path: var(--chamfer);
  background: #f9f2e1;
  border: 1px solid #d1bfa0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sv-quiz-question {
  font-size: 13px;
  color: #231c18;
}
.sv-quiz-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 6px;
}
.sv-quiz-option {
  justify-content: flex-start;
  text-align: left;
  white-space: normal;
  line-height: 1.3;
  padding: 7px 10px;
}
.sv-quiz-option.is-correct {
  background: #2f6f4e !important;
  color: #fffdf5 !important;
}
.sv-quiz-option.is-wrong {
  background: #9e3d34 !important;
  color: #fffdf5 !important;
}
.sv-quiz-feedback {
  margin: 2px 0 0;
  padding: 6px 8px;
  font-size: 12px;
  border-radius: 4px;
}
.sv-quiz-feedback.is-correct {
  background: #dfeee4;
  color: #1d4d35;
}
.sv-quiz-feedback.is-wrong {
  background: #f7e1de;
  color: #6e231c;
}
.sv-ai-modal-footer {
  padding-top: 8px;
  border-top: 1px solid #00000018;
}

/* -------------------------------------------------- mobile touch controller -- */

.sv-touch-controls {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  padding: 16px;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
}

/* D-Pad Container */
.sv-dpad {
  position: relative;
  width: 132px;
  height: 132px;
  pointer-events: auto;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
}

.sv-dpad-middle {
  position: absolute;
  top: 44px;
  left: 0;
  width: 132px;
  height: 44px;
  display: flex;
  pointer-events: none;
}

.sv-dpad-center {
  position: absolute;
  top: 44px;
  left: 44px;
  width: 44px;
  height: 44px;
  background: #23160c;
  border: 2px solid #140d06;
  border-radius: 4px;
  pointer-events: none;
}
.sv-dpad-center::after {
  content: '';
  position: absolute;
  inset: 12px;
  border-radius: 50%;
  background: #3d2a1b;
}

.sv-dpad-btn {
  position: absolute;
  width: 44px;
  height: 44px;
  border: 2px solid #140d06;
  background: linear-gradient(180deg, #573f2b 0, #382515 100%);
  color: #f7ecd5;
  font-size: 16px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  box-shadow: 0 3px 0 #120c06, inset 0 1px 0 #856142;
  transition: transform 0.05s ease, background 0.05s ease;
  touch-action: none;
  pointer-events: auto;
  user-select: none;
  -webkit-user-select: none;
  cursor: pointer;
}

.sv-dpad-up { top: 0; left: 44px; }
.sv-dpad-down { bottom: 0; left: 44px; }
.sv-dpad-left { top: 44px; left: 0; }
.sv-dpad-right { top: 44px; right: 0; }

.sv-dpad-btn.is-pressed, .sv-dpad-btn:active {
  background: linear-gradient(180deg, #855c37 0, #5c3b1d 100%);
  transform: translateY(2px);
  box-shadow: 0 1px 0 #120c06, inset 0 2px 4px rgba(0, 0, 0, 0.5);
  color: #ffffff;
}

/* Touch Action Buttons Cluster */
.sv-touch-actions {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: flex-end;
  pointer-events: auto;
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));
}

.sv-touch-action-btn {
  min-width: 96px;
  height: 52px;
  padding: 0 16px;
  border: 2px solid #122119;
  background: linear-gradient(180deg, #446e50 0, #2b4934 100%);
  color: #f3fbee;
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 800;
  border-radius: 10px;
  box-shadow: 0 4px 0 #101c15, inset 0 1px 0 #6da77d;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  touch-action: manipulation;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  transition: transform 0.08s ease, filter 0.1s ease, background 0.15s ease;
}

.sv-touch-action-btn:active {
  transform: translateY(2px);
  box-shadow: 0 2px 0 #101c15;
  background: linear-gradient(180deg, #2b4934 0, #1b3022 100%);
}

.sv-touch-action-btn.is-active-prompt {
  background: linear-gradient(180deg, #c75a33 0, #983d1c 100%);
  border-color: #2b0f07;
  box-shadow: 0 4px 0 #1b0a04, 0 0 16px rgba(224, 114, 76, 0.75), inset 0 1px 0 #eb8d6d;
  animation: sv-touch-pulse 1.2s infinite alternate ease-in-out;
}

@keyframes sv-touch-pulse {
  from { transform: scale(1); filter: drop-shadow(0 0 4px rgba(224, 114, 76, 0.4)); }
  to { transform: scale(1.05); filter: drop-shadow(0 0 12px rgba(224, 114, 76, 0.85)); }
}

.sv-touch-btn-icon {
  font-size: 18px;
  line-height: 1;
}

.sv-touch-btn-label {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.3px;
}

.sv-touch-btn-ptt {
  background: linear-gradient(180deg, #44596b 0, #273744 100%);
  border-color: #121e26;
  box-shadow: 0 4px 0 #0d161d, inset 0 1px 0 #68859e;
  min-width: 82px;
  height: 46px;
}

.sv-touch-btn-ptt.is-talking {
  background: linear-gradient(180deg, #35a35b 0, #1f733c 100%);
  box-shadow: 0 2px 0 #0d161d, 0 0 14px rgba(66, 199, 112, 0.75);
  transform: translateY(2px);
}

/* Mobile responsive adjustments */
@media (max-width: 600px) {
  .sv-dpad {
    width: 114px;
    height: 114px;
  }
  .sv-dpad-middle {
    top: 38px;
    width: 114px;
    height: 38px;
  }
  .sv-dpad-center {
    top: 38px;
    left: 38px;
    width: 38px;
    height: 38px;
  }
  .sv-dpad-btn {
    width: 38px;
    height: 38px;
    font-size: 14px;
  }
  .sv-dpad-up { top: 0; left: 38px; }
  .sv-dpad-down { bottom: 0; left: 38px; }
  .sv-dpad-left { top: 38px; left: 0; }
  .sv-dpad-right { top: 38px; right: 0; }
  .sv-touch-action-btn {
    min-width: 84px;
    height: 48px;
    padding: 0 12px;
  }
  .sv-touch-btn-label {
    font-size: 12px;
  }
}

/* -------------------------------------------------- world expansion & activities -- */

.sv-world-expansion-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: linear-gradient(180deg, #efdfbe 0, #e3cea6 100%);
  border: 2px solid #4a3520;
  clip-path: var(--chamfer);
  box-shadow: 0 3px 0 #3a291880;
}

.sv-expansion-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.sv-env-row {
  padding-top: 6px;
  border-top: 1px dashed #6b523555;
}

.sv-env-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #36281c;
  cursor: pointer;
}

.sv-expansion-modal-card {
  width: min(860px, 95vw);
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sv-note-code {
  background: #1f1914;
  color: #f3e8d2;
  padding: 8px 10px;
  border-radius: 4px;
  overflow-x: auto;
  font-family: var(--font-mono);
  font-size: 12px;
}

.sv-furniture-item.is-eliminated {
  opacity: 0.6;
  text-decoration: line-through;
}

.sv-board-pane {
  gap: 8px;
  padding: 12px 14px;
}

.sv-board-wrap .sv-canvas {
  max-height: 410px;
  width: auto;
  margin: 0 auto;
  display: block;
}

/* Settings stay outside the world; native dialog handles focus and Escape. */
.sv-settings-dialog {
  width: min(680px, calc(100vw - 24px));
  max-height: calc(100dvh - 32px);
  box-sizing: border-box;
  overflow: auto;
  background: var(--paper, #fffdf4);
  color: #243d36;
  border: 2px solid #39614c;
  border-radius: 12px;
  padding: 20px;
}
.sv-settings-dialog::backdrop { background: #142b23b0; }
.sv-settings-dialog > .sv-inline { justify-content: space-between; }
.sv-settings-dialog .sv-env-row { display: flex; flex-direction: column; align-items: stretch; gap: 12px; }
.sv-settings-dialog input, .sv-settings-dialog select { max-width: 100%; box-sizing: border-box; }
.sv-settings-dialog .sv-customizer-details { margin-top: 12px; }
@media (max-width: 740px) {
  .sv-screen-theater-grid { grid-template-columns: minmax(0, 1fr); }
  .sv-settings-dialog { padding: 14px; }
  .sv-settings-dialog .sv-button, .sv-settings-dialog select { min-height: 44px; }
}

/* The board is a quiet workspace; its controls reveal themselves on demand. */

.is-board-focused .sv-page-heading .sv-eyebrow { display: none; }
.sv-board-pane {
  padding: 12px;
  border: 1px solid #ffffff35;
  border-radius: 20px;
  clip-path: none;
  background: #f5f5f7;
  box-shadow: 0 12px 40px #00000018;
  color: #1d1d1f;
}
.sv-board-primary { gap: 8px; padding: 0 0 12px; }
.sv-board-pane .sv-segment { flex-wrap: wrap; clip-path: none; border-radius: 10px; box-shadow: none; gap: 3px; background: #e8e8ed; padding: 3px; }
.sv-board-pane .sv-button, .sv-board-pane .sv-segment-button, .sv-board-pane .sv-latex-chip {
  min-height: 38px;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  clip-path: none;
  background: transparent;
  color: #424245;
  box-shadow: none;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  text-shadow: none;
}
.sv-board-pane .sv-button:hover:not(:disabled), .sv-board-pane .sv-segment-button:hover:not(.is-active), .sv-board-pane .sv-latex-chip:hover { background: #e8e8ed; transform: none; }
.sv-board-pane .sv-segment-button.is-active { background: #fff; color: #0066cc; box-shadow: 0 1px 4px #00000012; }
.sv-board-pane .sv-button.is-armed { background: #ffebe9; color: #b42318; }
.sv-board-primary .sv-board-more { margin-left: auto; color: #0066cc; }
.sv-board-primary .sv-color-input { width: 32px; height: 32px; padding: 3px; border: 1px solid #d2d2d7; border-radius: 50%; clip-path: none; background: #fff; box-shadow: none; }
.sv-board-primary .sv-color-input::-webkit-color-swatch-wrapper { padding: 0; }
.sv-board-primary .sv-color-input::-webkit-color-swatch { border: 0; border-radius: 50%; }
.sv-board-pane .sv-board-wrap { border-radius: 12px; border: 1px solid #e5e5ea; background: #fff; box-shadow: none; }
.sv-board-pane .sv-board-wrap::after { display: none; }
.sv-board-pane .sv-board-wrap .sv-canvas { width: 100%; height: auto; max-height: none; }
.sv-board-options-panel { margin: 0 0 14px; padding: 0 12px; border: 1px solid #e5e5ea; border-radius: 12px; background: #fff; }
.sv-board-option-group { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 16px 0; }
.sv-board-option-group + .sv-board-option-group { border-top: 1px solid #eeeef0; }
.sv-board-option-group h3 { flex-basis: 100%; margin: 0; font-size: 12px; color: #6e6e73; font-weight: 600; }
.sv-board-pane .sv-input, .sv-board-pane .sv-select { background: #f5f5f7; border: 1px solid #d2d2d7; border-radius: 8px; clip-path: none; box-shadow: none; color: #1d1d1f; }
.sv-board-pane .sv-latex-bar, .sv-board-pane .sv-ai-board-bar { padding: 0; margin: 0; background: none; clip-path: none; box-shadow: none; }
.sv-board-pane .sv-subtle, .sv-board-pane .sv-tiny, .sv-board-pane .sv-field-label, .sv-board-pane .sv-zoom-label { color: #6e6e73; }
.sv-board-pane .sv-field-label { font: 500 11px var(--font-ui); letter-spacing: normal; }
.sv-board-pane .sv-layer, .sv-board-pane .sv-swatch-row { border-radius: 8px; clip-path: none; background: #f5f5f7; }
.sv-board-pane .sv-color-swatch { clip-path: none; border-radius: 50%; }
.sv-board-pane .sv-board-bottom { flex-basis: 100%; padding: 0; overflow-wrap: anywhere; }
.sv-board-pane :focus-visible { outline-color: #007aff; }
@media (max-width: 740px) {
  .sv-board-pane { padding: 8px; border-radius: 14px; }
  .sv-board-primary { gap: 4px; }
  .sv-board-primary .sv-button, .sv-board-primary .sv-segment-button { min-height: 44px; padding: 8px; font-size: 11px; }
  .sv-board-primary .sv-color-input { width: 28px; height: 28px; }
  .sv-board-options-panel { max-height: 50dvh; overflow: auto; }
  .sv-board-pane .sv-zoom { margin-left: 0; }
  .is-board-focused .sv-page-heading .sv-button { display: inline-flex; }
}

.is-board-focused .sv-profile, .is-board-focused .sv-session-card { display: none; }

.sv-board-readonly { margin: 0 4px 12px; color: #6e6e73; font-size: 12px; }

.sv-board-category.sv-board-option-group { display: block; padding: 0; }
.sv-board-category > summary {
  padding: 14px 2px;
  color: #424245;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.sv-board-category[open] > summary { color: #0066cc; }
.sv-board-category-content { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; padding: 0 2px 16px; }
.sv-board-category > summary:focus-visible { outline: 2px solid #007aff; outline-offset: -2px; border-radius: 6px; }
```

### app/src/storage/local-store.ts

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `0de959ef2012737401f6784f83777eb5c7d0bfdb63481c94338044ce384ef7c0`.

```ts
import { z } from 'zod';
import type { Contact, EncryptedIdentity, PublicHouse } from '../protocol/types';

const text = (max: number) => z.string().max(max);
const identity = z.object({ fingerprint: text(128).min(16), publicKey: text(2048).min(32), displayName: text(32).min(1), color: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict();
const furniture = z.object({ rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(), id: text(80).min(1), kind: z.enum(['desk', 'bookshelf', 'board', 'plant', 'table', 'frame', 'cabinet']), x: z.number().finite().min(0).max(736), y: z.number().finite().min(0).max(400), publicAlias: text(48) }).strict();
export const houseSchema = z.object({ ownerId: text(128).min(1), revision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), name: text(48).min(1), access: z.enum(['open', 'ask', 'locked']), theme: z.enum(['mint', 'peach']), furniture: z.array(furniture).max(32) }).strict().refine(h => new Set(h.furniture.map(f => f.id)).size === h.furniture.length, 'Duplicate furniture id');
const contact = z.object({ schemaVersion: z.literal(1), identity, friendCode: text(128).min(1) }).strict();
const encrypted = z.object({ v: z.literal(1), kdf: z.literal('PBKDF2-SHA256'), iterations: z.number().int().min(100_000).max(2_000_000), salt: text(128), iv: text(128), ciphertext: text(8192), publicIdentity: identity }).strict();
const localSchema = z.object({
  schemaVersion: z.literal(1),
  profile: z.object({ displayName: text(32).min(1), color: z.string().regex(/^#[0-9a-f]{6}$/i) }).strict(),
  house: houseSchema.nullable(), friendCode: text(128).min(1),
  contacts: z.array(contact).max(100), encryptedIdentity: encrypted.nullable(),
  editor: text(1_048_576),
  projectLinks: z.record(z.string().max(80), z.object({ name: text(256), kind: z.enum(['text', 'image', 'pdf']), privatePath: text(4096).optional() }).strict()).refine(v => Object.keys(v).length <= 32),
}).strict();

export interface LocalData {
  schemaVersion: 1;
  profile: { displayName: string; color: string };
  house: PublicHouse | null;
  friendCode: string;
  contacts: Contact[];
  encryptedIdentity: EncryptedIdentity | null;
  editor: string;
  projectLinks: Record<string, { name: string; kind: 'text' | 'image' | 'pdf'; privatePath?: string }>;
}

/** Local data is deliberately unrelated to NetworkView: no remote cache can be serialized. */
export function parseLocalData(value: unknown): LocalData { return localSchema.parse(value); }
export function serializeLocalData(value: LocalData): string {
  const result = JSON.stringify(parseLocalData(value));
  if (new TextEncoder().encode(result).length > 2_097_152) throw new Error('Almacenamiento local lleno (límite de 2 MiB).');
  return result;
}
export function newLocalData(): LocalData {
  return { schemaVersion: 1, profile: { displayName: 'Explorador', color: '#df8a72' }, house: null, friendCode: crypto.randomUUID(), contacts: [], encryptedIdentity: null, editor: '', projectLinks: {} };
}

export interface LocalStore { kind: 'sqlite' | 'indexeddb' | 'memory'; load(): Promise<LocalData | null>; save(data: LocalData): Promise<void>; close(): void }

/** Use an explicit projection even when callers pass extended local objects. */
export function publicHouse(house: PublicHouse, ownerId = house.ownerId): PublicHouse {
  return houseSchema.parse({ ownerId, revision: house.revision, name: house.name, access: house.access, theme: house.theme,
    furniture: house.furniture.map(f => ({ id: f.id, kind: f.kind, x: f.x, y: f.y, publicAlias: f.publicAlias, ...(f.rotation !== undefined ? { rotation: f.rotation } : {}) })) });
}

export function isNative(): boolean { return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window; }

export async function openLocalStore(): Promise<LocalStore> {
  if (isNative()) {
    const { invoke } = await import('@tauri-apps/api/core');
    return {
      kind: 'sqlite',
      async load() { const raw = await invoke<string | null>('load_local'); return raw === null ? null : parseLocalData(JSON.parse(raw)); },
      async save(data) { await invoke('save_local', { json: serializeLocalData(data) }); }, close() {},
    };
  }
  if (typeof indexedDB === 'undefined') throw new Error('Este entorno no ofrece almacenamiento local.');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('studyvillage-local', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('own-data')) request.result.createObjectStore('own-data'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se pudo abrir el almacenamiento local. No se ha borrado nada.'));
    request.onblocked = () => reject(new Error('Cierra otras ventanas de StudyVillage para actualizar el almacenamiento.'));
  });
  db.onversionchange = () => db.close();
  return {
    kind: 'indexeddb',
    async load() {
      try {
        if (typeof localStorage !== 'undefined') {
          const syncRaw = localStorage.getItem('studyvillage-local-sync');
          if (syncRaw) return parseLocalData(JSON.parse(syncRaw));
        }
      } catch { /* Fall back to IndexedDB */ }
      return new Promise((resolve, reject) => {
        const tx = db.transaction('own-data', 'readonly');
        const request = tx.objectStore('own-data').get('state');
        request.onsuccess = () => { try { resolve(request.result === undefined ? null : parseLocalData(JSON.parse(request.result as string))); } catch { reject(new Error('Datos locales incompatibles o dañados. Conservamos la copia original; no se sobrescribirá.')); } };
        request.onerror = () => reject(new Error('No se pudo leer el almacenamiento local.'));
      });
    },
    async save(data) {
      const json = serializeLocalData(data);
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('studyvillage-local-sync', json);
        }
      } catch { /* Ignore quota errors in sync mirror */ }
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('own-data', 'readwrite');
        tx.objectStore('own-data').put(json, 'state');
        tx.oncomplete = () => resolve();
        tx.onabort = tx.onerror = () => reject(new Error('No se pudo guardar. Comprueba el espacio disponible; tu copia anterior se conserva.'));
      });
    },
    close() { db.close(); },
  };
}

/** Latest-state write coalescing: at most one in flight and one pending snapshot. */
export class SaveQueue {
  private pending: LocalData | null = null;
  private active: Promise<void> | null = null;
  constructor(private store: LocalStore, private onError: (error: unknown) => void) {}
  save(data: LocalData): Promise<void> {
    this.pending = parseLocalData(data);
    if (this.store.kind === 'indexeddb' && typeof localStorage !== 'undefined') {
      try { localStorage.setItem('studyvillage-local-sync', serializeLocalData(this.pending)); } catch {}
    }
    if (!this.active) this.active = this.drain().finally(() => {
      this.active = null;
      if (this.pending) void this.save(this.pending);
    });
    return this.active;
  }
  private async drain() {
    while (this.pending) {
      const data = this.pending; this.pending = null;
      try { await this.store.save(data); } catch (error) { this.onError(error); }
    }
  }
  async flush() { while (this.active) await this.active; }
}
```

### app/src/media/manager.ts

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `025819239fde64e64440341aeada08362e7ba6f72ef54a32dfb94c0ebc9c4472`.

```ts
import type { MediaView, RemoteMedia, ScreenPhase } from '../protocol/types';
import { mediaMetadataSchema, type MediaMetadata } from '../protocol/schema';
import type { MediaCall, TransportEndpoint } from '../transport/types';

export interface MediaDevicesAdapter {
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  getDisplayMedia?: (constraints?: DisplayMediaStreamOptions) => Promise<MediaStream>;
}
export interface MediaPeer { identityId: string; endpoint: string; sendToken: string; receiveToken: string }
/** `room` is 'village', 'house:<id>' or 'pair:<a>:<b>'; peers are everyone you exchange media with there. */
export interface MediaContext { sessionId: string; epoch: number; identityId: string; room: string; roomName: string; peers: MediaPeer[] }
interface ActiveCall { call: MediaCall; identityId: string; kind: 'audio' | 'screen'; stream?: MediaStream; unsubscribe: (() => void)[] }

export class MediaManager {
  private endpoint?: TransportEndpoint;
  private context: MediaContext | null = null;
  private microphone: MediaStream | null = null;
  private screen: MediaStream | null = null;
  private outgoing = new Map<string, ActiveCall>();
  private incoming = new Map<string, ActiveCall>();
  private muted = false;
  private deafened = false;
  private pushToTalk = false;
  private talking = false;
  private phase: ScreenPhase = 'OFF';
  private error: string | null = null;
  private consentGeneration = 0;
  private screenGeneration = 0;
  private microphonePending = false;
  constructor(private changed: () => void, private devices?: MediaDevicesAdapter, private received?: (identityId: string, kind: 'audio' | 'screen') => void) {}
  get view(): MediaView {
    const remote: RemoteMedia[] = [];
    for (const item of this.incoming.values()) if (item.stream) remote.push({ identityId: item.identityId, kind: item.kind, stream: item.stream });
    return {
      micEnabled: !!this.microphone, muted: this.muted, deafened: this.deafened, pushToTalk: this.pushToTalk,
      talking: !!this.microphone && !this.muted && (!this.pushToTalk || this.talking), screenPhase: this.phase,
      localScreen: this.screen, remote, audience: this.context ? `${this.context.roomName} · ${this.context.peers.length} persona(s) pueden oírte` : 'Nadie: conéctate a una aldea para hablar', error: this.error,
    };
  }
  attach(endpoint: TransportEndpoint): void { this.endpoint = endpoint; }
  setContext(context: MediaContext | null): void {
    const previous = this.context;
    const changedRoom = previous?.sessionId !== context?.sessionId || previous?.epoch !== context?.epoch || previous?.room !== context?.room;
    // Moving rooms normally revokes capture, so your mic never follows you
    // into an audience you did not choose. A private call is the exception:
    // its audience is one person you picked who also accepted, so capture
    // carries over. Leaving the call widens the audience and revokes it again.
    const intoPrivate = changedRoom && !!previous && !!context && previous.sessionId === context.sessionId
      && previous.epoch === context.epoch && context.room.startsWith('pair:');
    if (intoPrivate) this.closeAllCalls();
    else if (changedRoom) this.stopAll();
    this.context = context;
    for (const [key, item] of this.incoming) {
      if (!context?.peers.some(peer => peer.identityId === item.identityId && peer.endpoint === item.call.endpoint)) this.closeCall(this.incoming, key);
    }
    for (const [key, item] of this.outgoing) {
      if (!context?.peers.some(peer => peer.identityId === item.identityId && peer.endpoint === item.call.endpoint)) this.closeCall(this.outgoing, key);
    }
    this.reconcile(); this.changed();
  }
  /** Synchronous revocation occurs before any room-change message is sent. */
  suspend(): void { this.stopAll(); this.context = null; this.changed(); }
  private currentDevices(): MediaDevicesAdapter | undefined {
    return this.devices ?? (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined);
  }
  async toggleMicrophone(): Promise<void> {
    if (this.microphone || this.microphonePending) {
      this.consentGeneration++; this.microphonePending = false; this.stopMicrophone(); this.changed(); return;
    }
    if (!this.context) { this.error = 'Conéctate a una aldea para activar el micrófono.'; this.changed(); return; }
    const devices = this.currentDevices();
    if (!devices?.getUserMedia) { this.error = 'El micrófono no está disponible en este entorno.'; this.changed(); return; }
    const generation = this.consentGeneration;
    this.microphonePending = true; this.error = null; this.changed();
    try {
      const stream = await devices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (generation !== this.consentGeneration || !this.context) { this.stopTracks(stream); return; }
      if (!stream.getAudioTracks().length) { this.stopTracks(stream); throw new Error('No audio track'); }
      this.microphone = stream;
      for (const track of stream.getTracks()) track.addEventListener('ended', () => { if (this.microphone === stream) { this.stopMicrophone(); this.changed(); } }, { once: true });
      this.applyMute(); this.reconcile();
    } catch { if (generation === this.consentGeneration) this.error = 'No se pudo activar el micrófono; revisa el permiso del sistema.'; }
    finally { if (generation === this.consentGeneration) this.microphonePending = false; this.changed(); }
  }
  async startScreen(): Promise<void> {
    if (this.screen || this.phase === 'REQUESTING_OS_PERMISSION') return;
    if (!this.context) { this.error = 'Conéctate a una aldea para compartir pantalla.'; this.changed(); return; }
    const devices = this.currentDevices();
    if (!devices?.getDisplayMedia) { this.phase = 'NOT_SUPPORTED'; this.error = 'La captura de pantalla no está disponible en este entorno.'; this.changed(); return; }
    const consent = this.consentGeneration;
    const generation = ++this.screenGeneration;
    this.phase = 'REQUESTING_OS_PERMISSION'; this.error = null; this.changed();
    try {
      const stream = await devices.getDisplayMedia({
        video: {
          width: { ideal: 3840 },
          height: { ideal: 2160 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      if (consent !== this.consentGeneration || generation !== this.screenGeneration || !this.context) { this.stopTracks(stream); return; }
      if (!stream.getVideoTracks().length) { this.stopTracks(stream); throw new Error('No video track'); }
      for (const track of stream.getVideoTracks()) {
        if ('contentHint' in track) {
          try { (track as MediaStreamTrack & { contentHint: string }).contentHint = 'detail'; } catch { /* Optional hint */ }
        }
      }
      this.screen = stream; this.phase = 'CAPTURING_LOCAL'; this.changed();
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => {
        if (this.screen === stream) { this.stopScreen(); this.phase = 'SOURCE_ENDED'; this.changed(); }
      }, { once: true });
      this.reconcile();
    } catch {
      if (consent === this.consentGeneration && generation === this.screenGeneration) { this.phase = 'DENIED'; this.error = 'La captura fue cancelada o el sistema no concedió el permiso.'; }
    } finally { this.changed(); }
  }
  stopScreen(): void {
    this.screenGeneration++;
    const stream = this.screen; this.screen = null;
    for (const [key, item] of this.outgoing) if (item.kind === 'screen') this.closeCall(this.outgoing, key);
    if (stream) this.stopTracks(stream);
    this.phase = 'OFF'; this.changed();
  }
  setMuted(value: boolean): void { this.muted = value; this.applyMute(); this.changed(); }
  setDeafened(value: boolean): void {
    this.deafened = value;
    for (const item of this.incoming.values()) for (const track of item.stream?.getAudioTracks() ?? []) track.enabled = !value;
    this.changed();
  }
  setPushToTalk(value: boolean): void { this.pushToTalk = value; this.talking = false; this.applyMute(); this.changed(); }
  setTalking(value: boolean): void { this.talking = value; this.applyMute(); this.changed(); }
  private applyMute(): void {
    for (const track of this.microphone?.getAudioTracks() ?? []) track.enabled = !this.muted && (!this.pushToTalk || this.talking);
  }
  receive(call: MediaCall): void {
    const parsed = mediaMetadataSchema.safeParse(call.metadata);
    const context = this.context;
    if (!parsed.success || !context) { call.close(); return; }
    const metadata = parsed.data;
    const peer = context.peers.find(peer => peer.endpoint === call.endpoint && peer.identityId === metadata.identityId);
    if (!peer || metadata.token !== peer.receiveToken || metadata.sessionId !== context.sessionId || metadata.epoch !== context.epoch || metadata.room !== context.room) { call.close(); return; }
    const key = `${metadata.identityId}/${metadata.kind}`;
    if (this.incoming.has(key) || this.incoming.size >= 10) { call.close(); return; }
    const item: ActiveCall = { call, identityId: metadata.identityId, kind: metadata.kind, unsubscribe: [] };
    this.incoming.set(key, item);
    item.unsubscribe.push(call.onClose(() => { this.closeCall(this.incoming, key); this.changed(); }));
    item.unsubscribe.push(call.onStream(stream => {
      const current = this.context;
      if (this.incoming.get(key) !== item || !current || current.room !== metadata.room || !current.peers.some(p => p.identityId === metadata.identityId && p.endpoint === call.endpoint && p.receiveToken === metadata.token)) { this.stopTracks(stream); this.closeCall(this.incoming, key); return; }
      item.stream = stream;
      for (const track of stream.getAudioTracks()) track.enabled = !this.deafened;
      for (const track of stream.getTracks()) track.addEventListener('ended', () => { if (this.incoming.get(key) === item) { this.closeCall(this.incoming, key); this.changed(); } }, { once: true });
      this.received?.(metadata.identityId, metadata.kind);
      this.changed();
    }));
    try { call.answer(); } catch { this.closeCall(this.incoming, key); }
  }
  confirmReceiving(identityId: string, kind: 'audio' | 'screen'): void {
    if (kind === 'screen' && this.screen && this.outgoing.has(`${identityId}/screen`)) { this.phase = 'SENDING'; this.changed(); }
  }
  private reconcile(): void {
    const context = this.context;
    if (!context || !this.endpoint) return;
    for (const peer of context.peers) {
      for (const [kind, stream] of [['audio', this.microphone], ['screen', this.screen]] as const) {
        const key = `${peer.identityId}/${kind}`;
        if (!stream || this.outgoing.has(key) || this.outgoing.size >= 10) continue;
        const metadata: MediaMetadata = { v: 2, kind, sessionId: context.sessionId, epoch: context.epoch, room: context.room, identityId: context.identityId, token: peer.sendToken };
        try {
          const call = this.endpoint.call(peer.endpoint, stream, metadata);
          const item: ActiveCall = { call, identityId: peer.identityId, kind, unsubscribe: [] };
          this.outgoing.set(key, item);
          item.unsubscribe.push(call.onClose(() => {
            this.closeCall(this.outgoing, key);
            if (kind === 'screen' && this.screen) { this.phase = 'NETWORK_FAILED'; this.error = 'Se interrumpió una conexión de pantalla.'; }
            this.changed();
          }));
          // Outgoing calls are send-only. A remote stream must never bypass incoming authorization.
          item.unsubscribe.push(call.onStream(remote => this.stopTracks(remote)));
          call.limitBitrate(kind);
          if (kind === 'screen') this.phase = 'NEGOTIATING';
        } catch { this.error = 'No se pudo iniciar una conexión de medios.'; if (kind === 'screen') this.phase = 'NETWORK_FAILED'; }
      }
    }
    // SENDING waits for an authenticated receiver to acknowledge its stream event.
  }
  private closeCall(map: Map<string, ActiveCall>, key: string): void {
    const item = map.get(key);
    if (!item) return;
    map.delete(key);
    for (const unsubscribe of item.unsubscribe) unsubscribe();
    if (item.stream) this.stopTracks(item.stream);
    try { item.call.close(); } catch { /* Already closed. */ }
  }
  private stopTracks(stream: MediaStream): void { for (const track of stream.getTracks()) track.stop(); }
  private stopMicrophone(): void {
    const stream = this.microphone; this.microphone = null; this.talking = false;
    for (const [key, item] of this.outgoing) if (item.kind === 'audio') this.closeCall(this.outgoing, key);
    if (stream) this.stopTracks(stream);
  }
  /** Drops every call but keeps local capture, so it can be re-offered to a new room. */
  private closeAllCalls(): void {
    for (const key of [...this.outgoing.keys()]) this.closeCall(this.outgoing, key);
    for (const key of [...this.incoming.keys()]) this.closeCall(this.incoming, key);
    if (this.screen) this.phase = 'CAPTURING_LOCAL';
  }
  private stopAll(): void {
    this.consentGeneration++; this.microphonePending = false;
    this.stopMicrophone(); this.stopScreen();
    for (const key of this.incoming.keys()) this.closeCall(this.incoming, key);
  }
  dispose(): void { this.suspend(); this.endpoint = undefined; }
}
```

### app/src/session/client.ts

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `a9cd366a91983b8187b4423d161fd9bf57a0c7834b343472be1ee390db969ac5`.

```ts
import { AREA_NAMES, areaOf, isInScene } from '../world/location';
import { canonical, randomId, sign, validatePublicIdentity, verify } from '../identity';
import { MediaManager, type MediaDevicesAdapter, type MediaPeer } from '../media/manager';
import { houseSchema, positionSchema, strokeSchema, type Hello, type Invite, type Payload, type SignedHouse, type SignedStroke, type Transcript, type WireMessage } from '../protocol/schema';
import { LIMITS, type AppChannel, type AppMessage, type BoardStroke, type LocalIdentity, type Member, type NetworkView, type Position, type PublicHouse, type PublicIdentity, type SessionPhase, type VillageActions, type VisitRequest } from '../protocol/types';
import { createInvite, encodeInvite, parseInvite } from '../signaling/invite';
import { createPeerEndpoint } from '../signaling/peerjs';
import { BoundedChannel } from '../transport/bounded-channel';
import { systemClock, type Clock, type DataChannel, type TransportEndpoint, type TransportFactory } from '../transport/types';
import { BoardStore } from './board';

/** The stages of opening or joining, in the order they run. */
type OpenStep = 'identity' | 'signaling' | 'session' | 'signing' | 'invite';

/** Error name only. Never the message, which can carry endpoints or paths. */
function errorName(error: unknown): string {
  if (error instanceof Error && error.name && error.name !== 'Error') return error.name;
  if (error instanceof Error && error.message) return error.message.slice(0, 80);
  return 'UnknownError';
}

function describeOpenFailure(step: OpenStep, error: unknown): string {
  const name = errorName(error);
  switch (step) {
    case 'identity':
      return `Tu identidad no se pudo verificar en este entorno (${name}). Falla la criptografía del navegador, no la red.`;
    case 'signaling':
      return `No se pudo abrir la señalización (${name}). Comprueba la red o vuelve a intentarlo; el servidor es gratuito y a veces rechaza conexiones.`;
    case 'signing':
      return `No se pudo firmar tu casa (${name}). Falla la criptografía del navegador, no la red.`;
    case 'invite':
      return `La señalización se abrió, pero no se pudo crear la invitación (${name}).`;
    default:
      return `La señalización se abrió, pero no se pudo preparar la sesión (${name}).`;
  }
}

function describeJoinFailure(step: OpenStep, error: unknown): string {
  const name = errorName(error);
  switch (step) {
    case 'identity':
      return `Tu identidad no se pudo verificar en este entorno (${name}). Falla la criptografía del navegador, no la red.`;
    case 'signaling':
      return `No se pudo abrir la señalización (${name}). Comprueba la red y vuelve a intentarlo.`;
    default:
      return `No se pudo conectar con quien te invitó (${name}). Comprueba la invitación; algunas redes impiden WebRTC directo.`;
  }
}

export interface VillageClientOptions { transportFactory?: TransportFactory; clock?: Clock; mediaDevices?: MediaDevicesAdapter }
type Intent = 'join' | 'resume' | 'mesh';
interface Link {
  raw: DataChannel; wire: BoundedChannel; initiator: boolean; intent?: Intent; expected?: PublicIdentity | string;
  hello?: Hello; transcript?: Transcript; identity?: PublicIdentity; step: 'hello' | 'challenge' | 'proof' | 'ok' | 'ready';
  authenticated: boolean; approved: boolean; closed: boolean; created: number; lastSeen: number; lastHeartbeat: number;
  sentSeq: number; receivedSeq: number; receiveToken: string; sendToken?: string; requestId?: string;
  syncRoom?: string; syncExpected?: number; syncExport?: { boardId: string; documents: SignedStroke[]; cursor: number };
  unsubscribe: (() => void)[];
}
interface PendingVisit extends VisitRequest { visitorId: string; created: number }
const initialPosition = (): Position => ({ areaId: 'residential', x: 384, y: 215, direction: 'down', moving: false });
const activePhases: SessionPhase[] = ['SIGNALING', 'CONNECTING', 'AUTHENTICATING', 'PENDING_APPROVAL', 'JOINED', 'RECONNECTING'];

export class VillageClient implements VillageActions {
  private ownHouse: PublicHouse;
  private phase: SessionPhase = 'IDLE';
  private isHost = false;
  private sessionId: string | null = null;
  private epoch = 0;
  private hostId: string | null = null;
  private invite: Invite | null = null;
  private endpoint?: TransportEndpoint;
  private links = new Set<Link>();
  private members = new Map<string, Member>();
  private houses = new Map<string, SignedHouse>();
  private visits = new Map<string, PendingVisit>();
  private memberDeadlines = new Map<string, number>();
  private rosterRevision = 0;
  private hostDeadline: number | null = null;
  private lastReconnect = -Infinity;
  private error: string | null = null;
  private listeners = new Set<(view: NetworkView) => void>();
  private appListeners = new Set<(message: AppMessage) => void>();
  private media: MediaManager;
  private board = new BoardStore();
  /** Who I want a private call with, and who every other member wants one with. */
  private privateWith: string | null = null;
  private privateOf = new Map<string, string | null>();
  private boardRetries = new Map<string, SignedStroke>();
  private clock: Clock;
  private factory: TransportFactory;
  private tickTimer?: ReturnType<typeof setTimeout>;
  private moveTimer?: ReturnType<typeof setTimeout>;
  private pendingPosition?: Position;
  private lastPositionSent = -Infinity;
  private endpointUnsubscribe: (() => void)[] = [];
  private generation = 0;
  private disposed = false;
  private leaving = false;
  private leaveResolve?: () => void;
  private leaveRequest?: string;
  private localJobs: (() => Promise<void>)[] = [];
  private runningJob = false;

  constructor(private identity: LocalIdentity, ownHouse: PublicHouse, options: VillageClientOptions = {}) {
    this.ownHouse = houseSchema.parse(ownHouse);
    if (ownHouse.ownerId !== identity.public.fingerprint) throw new Error('La casa debe pertenecer a la identidad local.');
    this.clock = options.clock ?? systemClock;
    this.factory = options.transportFactory ?? createPeerEndpoint;
    this.media = new MediaManager(() => this.notify(), options.mediaDevices, (id, kind) => { const link = this.linkFor(id); if (link) this.send(link, { type: 'media.received', kind }); });
  }
  get view(): NetworkView {
    const room = this.members.get(this.id)?.houseId ?? this.id;
    return {
      phase: this.phase, isHost: this.isHost, hostId: this.hostId, sessionId: this.sessionId,
      invite: this.isHost && this.invite ? encodeInvite(this.invite) : null,
      members: structuredClone([...this.members.values()].sort((a, b) => a.slot - b.slot)),
      houses: structuredClone([...this.houses.values()].map(item => item.house)),
      pendingJoins: [...this.links].filter(link => link.authenticated && !link.approved && !!link.requestId && !link.closed).map(link => ({ requestId: link.requestId!, identity: structuredClone(link.identity!) })),
      pendingVisits: [...this.visits.values()].filter(request => request.houseId === this.id).map(({ requestId, identity, houseId }) => ({ requestId, identity: structuredClone(identity), houseId })),
      strokes: structuredClone(this.board.documents(room).map(document => document.stroke)),
      hostGraceRemainingMs: this.hostDeadline === null ? null : Math.max(0, this.hostDeadline - this.clock.now()),
      error: this.error, media: this.media.view,
      privateCall: {
        with: this.privateWith,
        active: !!this.privateWith && this.partnerOf(this.id) === this.privateWith,
        incoming: [...this.privateOf].filter(([from, to]) => to === this.id && this.members.get(from)?.connected && this.privateWith !== from).map(([from]) => from),
      },
    };
  }
  private get id(): string { return this.identity.public.fingerprint; }
  subscribe(listener: (view: NetworkView) => void): () => void { this.listeners.add(listener); listener(this.view); return () => this.listeners.delete(listener); }
  onApp(listener: (message: AppMessage) => void): () => void { this.appListeners.add(listener); return () => this.appListeners.delete(listener); }
  private deliverApp(message: AppMessage): void {
    for (const listener of this.appListeners) { try { listener(message); } catch { /* An activity must not disrupt the protocol. */ } }
  }
  /** Shared activities. The host routes; everyone else only ever talks to the host. */
  sendApp(channel: AppChannel, to: string | null, data: string): boolean {
    if (this.phase !== 'JOINED' || data.length < 2 || data.length > LIMITS.appData) return false;
    if (to === this.id) return false;
    if (!this.isHost) return this.sendHost({ type: 'app.send', channel, to, data });
    if (to !== null) { const link = this.linkFor(to); return !!link && this.send(link, { type: 'app.relay', channel, from: this.id, data }); }
    this.broadcast({ type: 'app.relay', channel, from: this.id, data });
    return true;
  }
  private notify(): void {
    if (this.disposed) return;
    const view = this.view;
    for (const listener of this.listeners) { try { listener(view); } catch { /* A view must not disrupt the protocol. */ } }
  }
  private setError(message: string): void { this.error = message; this.notify(); }
  private setPhase(phase: SessionPhase): void { this.phase = phase; this.notify(); }
  private queue(job: () => Promise<void>): void {
    if (this.disposed) return;
    if (this.localJobs.length >= LIMITS.queueMessages) { this.setError('Hay demasiados cambios pendientes. Espera antes de continuar.'); return; }
    this.localJobs.push(job); void this.runJobs();
  }
  private async runJobs(): Promise<void> {
    if (this.runningJob) return;
    this.runningJob = true;
    try { while (this.localJobs.length && !this.disposed) { const job = this.localJobs.shift()!; try { await job(); } catch { this.setError('No se pudo aplicar el cambio local.'); } } }
    finally { this.runningJob = false; }
  }
  async openVillage(): Promise<void> {
    if (this.disposed || activePhases.includes(this.phase)) { this.setError('Sal del vecindario actual antes de abrir otro.'); return; }
    this.reset(); const generation = this.generation;
    this.isHost = true; this.hostId = this.id; this.sessionId = randomId(); this.epoch = 1;
    this.setPhase('SIGNALING');
    // Each step is tagged so a failure names the step that actually broke.
    // A single catch here used to blame "la señalización o WebRTC" for any of
    // four unrelated failures, including WebCrypto, which made a working
    // network look like a dead one.
    let step: OpenStep = 'identity';
    try {
      await validatePublicIdentity(this.identity.public);
      if (generation !== this.generation || this.disposed) return;
      step = 'signaling';
      const endpoint = await this.factory();
      if (generation !== this.generation || this.disposed) { endpoint.destroy(); return; }
      step = 'session';
      this.attachEndpoint(endpoint);
      this.members.set(this.id, { identity: structuredClone(this.identity.public), endpoint: endpoint.id, slot: 0, connected: true, houseId: null, position: initialPosition() });
      step = 'signing';
      const ownDocument = await this.signHouse(this.ownHouse);
      if (generation !== this.generation) return;
      step = 'invite';
      this.houses.set(this.id, ownDocument);
      this.invite = createInvite(this.id, endpoint.id, this.sessionId!, this.epoch, 1, this.clock.wallNow());
      this.rosterRevision = 1; this.setPhase('JOINED'); this.startTick();
    } catch (error) {
      if (generation === this.generation) this.finish('NETWORK_FAILED', describeOpenFailure(step, error));
    }
  }
  async joinVillage(encodedInvite: string): Promise<void> {
    if (this.disposed || activePhases.includes(this.phase)) { this.setError('Sal del vecindario actual antes de unirte a otro.'); return; }
    this.reset(); const generation = this.generation;
    try { this.invite = parseInvite(encodedInvite, this.clock.wallNow()); }
    catch (error) { this.setPhase(error instanceof Error && error.message === 'EXPIRED_INVITE' ? 'EXPIRED_INVITE' : 'NETWORK_FAILED'); this.setError('La invitación no es válida o ha caducado.'); return; }
    if (this.invite.hostFingerprint === this.id) { this.finish('NETWORK_FAILED', 'No puedes unirte a tu propia identidad.'); return; }
    this.hostId = this.invite.hostFingerprint; this.sessionId = this.invite.sessionId; this.epoch = this.invite.epoch;
    this.setPhase('SIGNALING');
    let step: OpenStep = 'identity';
    try {
      await validatePublicIdentity(this.identity.public);
      if (generation !== this.generation || this.disposed) return;
      step = 'signaling';
      const endpoint = await this.factory();
      if (generation !== this.generation || this.disposed) { endpoint.destroy(); return; }
      step = 'session';
      this.attachEndpoint(endpoint); this.setPhase('CONNECTING'); this.startTick();
      this.connect(this.invite.endpoint, 'join', this.hostId);
    } catch (error) {
      if (generation === this.generation) this.finish('NETWORK_FAILED', describeJoinFailure(step, error));
    }
  }
  private attachEndpoint(endpoint: TransportEndpoint): void {
    this.endpoint = endpoint; this.media.attach(endpoint);
    this.endpointUnsubscribe.push(endpoint.onConnection(raw => this.attach(raw, false)), endpoint.onCall(call => this.media.receive(call)), endpoint.onSignalingChange(connected => {
      if (!connected && this.phase === 'JOINED') this.setError('Se perdió la señalización; las conexiones P2P existentes siguen activas.');
    }));
  }
  private connect(endpoint: string, intent: Intent, expected: PublicIdentity | string): void {
    if (!this.endpoint || [...this.links].some(link => !link.closed && link.raw.endpoint === endpoint)) return;
    try { this.attach(this.endpoint.connect(endpoint), true, intent, expected); }
    catch { this.setError('No se pudo establecer una conexión directa.'); }
  }
  private attach(raw: DataChannel, initiator: boolean, intent?: Intent, expected?: PublicIdentity | string): void {
    if (!this.endpoint || !this.sessionId || this.links.size >= (this.isHost ? 17 : 7) || this.leaving) { raw.close(); return; }
    const now = this.clock.now();
    const link: Link = { raw, wire: undefined as unknown as BoundedChannel, initiator, intent, expected, step: initiator ? 'challenge' : 'hello', authenticated: false, approved: false, closed: false, created: now, lastSeen: now, lastHeartbeat: now, sentSeq: 0, receivedSeq: 0, receiveToken: randomId(32), unsubscribe: [] };
    link.wire = new BoundedChannel(raw, message => this.receive(link, message), reason => this.setError(reason), this.clock);
    this.links.add(link);
    link.unsubscribe.push(raw.onClose(() => this.linkClosed(link)));
    if (initiator) {
      const start = () => {
        if (link.closed || link.hello || !this.endpoint || !this.sessionId) return;
        link.hello = {
          v: 1, kind: 'auth.hello', sessionId: this.sessionId, epoch: this.epoch, intent: intent!,
          identity: structuredClone(this.identity.public), from: this.endpoint.id, to: raw.endpoint, nonce: randomId(32),
          generation: intent === 'join' ? this.invite!.generation : 0, secret: intent === 'join' ? this.invite!.secret : '',
        };
        link.wire.send(link.hello);
        if (intent === 'join') this.setPhase('AUTHENTICATING');
      };
      link.unsubscribe.push(raw.onOpen(start)); if (raw.open) start();
    }
  }
  private active(link: Link): boolean { return !link.closed && this.links.has(link) && !!this.endpoint && !this.disposed; }
  private async receive(link: Link, message: WireMessage): Promise<void> {
    if (!this.active(link)) return;
    link.lastSeen = this.clock.now();
    if (message.kind === 'auth.hello') {
      if (link.step !== 'hello' || !this.endpoint || message.sessionId !== this.sessionId || message.epoch !== this.epoch || message.from !== link.raw.endpoint || message.to !== this.endpoint.id || message.identity.fingerprint === this.id) throw new Error('Unexpected hello');
      if ([...this.links].some(other => other !== link && !other.closed && other.identity?.fingerprint === message.identity.fingerprint)) throw new Error('Duplicate identity');
      if (message.intent === 'join') {
        if (!this.isHost || this.phase !== 'JOINED' || !this.invite || this.invite.expiresAt <= this.clock.wallNow() || message.generation !== this.invite.generation || message.secret !== this.invite.secret || this.members.has(message.identity.fingerprint) || [...this.links].filter(item => !item.approved).length > 12) throw new Error('Invalid invitation');
      } else {
        const member = this.members.get(message.identity.fingerprint);
        if (!member || member.endpoint !== message.from || member.identity.publicKey !== message.identity.publicKey || message.secret !== '' || message.generation !== 0) throw new Error('Not in roster');
        if (message.intent === 'resume' && (!this.isHost || !this.memberDeadlines.has(member.identity.fingerprint))) throw new Error('Invalid resume');
        if (message.intent === 'mesh' && (!member.connected || this.phase !== 'JOINED')) throw new Error('Invalid mesh');
      }
      link.identity = await validatePublicIdentity(message.identity);
      if (!this.active(link)) return;
      link.intent = message.intent; link.hello = message;
      link.transcript = { v: 1, sessionId: message.sessionId, epoch: message.epoch, intent: message.intent, initiator: message.identity.fingerprint, responder: this.id, from: message.from, to: message.to, initiatorNonce: message.nonce, responderNonce: randomId(32), generation: message.generation, secret: message.secret };
      link.step = 'proof';
      const signature = await sign(this.identity, 'auth-responder', link.transcript);
      if (this.active(link)) link.wire.send({ v: 1, kind: 'auth.challenge', identity: structuredClone(this.identity.public), transcript: link.transcript, signature });
      return;
    }
    if (message.kind === 'auth.challenge') {
      if (link.step !== 'challenge' || !link.hello) throw new Error('Unexpected challenge');
      const identity = await validatePublicIdentity(message.identity);
      const expected = typeof link.expected === 'string' ? link.expected : link.expected?.fingerprint;
      if (identity.fingerprint !== expected || (typeof link.expected !== 'string' && identity.publicKey !== link.expected?.publicKey)) throw new Error('Wrong identity');
      const expectedTranscript: Transcript = { v: 1, sessionId: link.hello.sessionId, epoch: link.hello.epoch, intent: link.hello.intent, initiator: this.id, responder: identity.fingerprint, from: link.hello.from, to: link.hello.to, initiatorNonce: link.hello.nonce, responderNonce: message.transcript.responderNonce, generation: link.hello.generation, secret: link.hello.secret };
      if (canonical(message.transcript) !== canonical(expectedTranscript) || !await verify(identity, 'auth-responder', message.transcript, message.signature)) throw new Error('Invalid challenge signature');
      if (!this.active(link)) return;
      link.identity = identity; link.transcript = message.transcript; link.step = 'ok';
      const signature = await sign(this.identity, 'auth-initiator', link.transcript);
      if (this.active(link)) link.wire.send({ v: 1, kind: 'auth.proof', signature });
      return;
    }
    if (message.kind === 'auth.proof') {
      if (link.step !== 'proof' || !link.identity || !link.transcript || !await verify(link.identity, 'auth-initiator', link.transcript, message.signature)) throw new Error('Invalid proof');
      const signature = await sign(this.identity, 'auth-accepted', link.transcript);
      if (!this.active(link)) return;
      link.wire.send({ v: 1, kind: 'auth.ok', signature }); this.authenticated(link); return;
    }
    if (message.kind === 'auth.ok') {
      if (link.step !== 'ok' || !link.identity || !link.transcript || !await verify(link.identity, 'auth-accepted', link.transcript, message.signature)) throw new Error('Invalid acknowledgement');
      if (this.active(link)) this.authenticated(link); return;
    }
    if (!link.authenticated || !link.identity || message.sender !== link.identity.fingerprint || message.sessionId !== this.sessionId || message.epoch !== this.epoch || message.seq <= link.receivedSeq) throw new Error('Unauthenticated or replayed event');
    link.receivedSeq = message.seq;
    const payload = message.payload;
    if (payload.type === 'session.heartbeat') { if (!payload.reply) this.send(link, { type: 'session.heartbeat', reply: true }); return; }
    if (payload.type === 'join.decision') {
      if (this.isHost || link.identity.fingerprint !== this.hostId || link.intent !== 'join' || this.phase !== 'PENDING_APPROVAL') throw new Error('Wrong admission role');
      if (!payload.accepted) this.finish('DENIED', 'El anfitrión no aceptó la solicitud.');
      else link.approved = true;
      return;
    }
    if (!link.approved) throw new Error('Approval required');
    await this.handle(link, payload);
  }
  private authenticated(link: Link): void {
    link.authenticated = true; link.step = 'ready'; link.lastSeen = this.clock.now();
    if (link.intent === 'join') {
      if (this.isHost) {
        if (!this.validJoin(link)) { this.send(link, { type: 'join.decision', accepted: false }); this.clock.setTimeout(() => this.closeLink(link, false), 100); return; }
        link.requestId = randomId(); this.notify();
      }
      else this.setPhase('PENDING_APPROVAL');
      return;
    }
    link.approved = true;
    if (link.intent === 'resume' && this.isHost) {
      const member = this.members.get(link.identity!.fingerprint)!;
      member.connected = true; member.houseId = null; this.memberDeadlines.delete(member.identity.fingerprint); this.rosterChanged();
    }
    this.announceMedia(link); this.syncMedia();
  }
  private send(link: Link, payload: Payload, coalesce?: string): boolean {
    if (!this.active(link) || !link.authenticated || !this.sessionId) return false;
    return link.wire.send({ v: 1, kind: 'event', sessionId: this.sessionId, epoch: this.epoch, sender: this.id, seq: ++link.sentSeq, payload }, coalesce);
  }
  private validJoin(link: Link): boolean {
    return this.isHost && this.phase === 'JOINED' && !!this.invite && this.invite.expiresAt > this.clock.wallNow() && link.hello?.generation === this.invite.generation && link.hello.secret === this.invite.secret;
  }
  private linkFor(identityId: string): Link | undefined { return [...this.links].find(link => !link.closed && link.authenticated && link.approved && link.identity?.fingerprint === identityId); }
  private hostLink(): Link | undefined { return this.hostId ? this.linkFor(this.hostId) : undefined; }
  private sendHost(payload: Payload, coalesce?: string): boolean { const link = this.hostLink(); return !!link && this.send(link, payload, coalesce); }
  private broadcast(payload: Payload, coalesce?: string): void { for (const link of this.links) if (link.approved) this.send(link, payload, coalesce); }
  decideJoin(requestId: string, accept: boolean): void {
    if (!this.isHost || this.phase !== 'JOINED') return;
    const link = [...this.links].find(item => item.requestId === requestId && item.authenticated && !item.approved && !item.closed);
    if (!link?.identity) return;
    if (!accept || !this.validJoin(link) || this.members.size >= LIMITS.members) {
      this.send(link, { type: 'join.decision', accepted: false });
      link.requestId = undefined; this.clock.setTimeout(() => this.closeLink(link, false), 100); this.notify(); return;
    }
    const used = new Set([...this.members.values()].map(member => member.slot));
    let slot = 1; while (used.has(slot)) slot++;
    if (slot >= LIMITS.members) return;
    link.approved = true; link.requestId = undefined;
    this.members.set(link.identity.fingerprint, { identity: structuredClone(link.identity), endpoint: link.raw.endpoint, slot, connected: true, houseId: null, position: initialPosition() });
    this.send(link, { type: 'join.decision', accepted: true });
    this.announceMedia(link); this.rosterChanged();
  }
  rotateInvite(): void {
    if (!this.isHost || this.phase !== 'JOINED' || !this.endpoint || !this.sessionId || !this.invite) return;
    this.invite = createInvite(this.id, this.endpoint.id, this.sessionId, this.epoch, this.invite.generation + 1, this.clock.wallNow());
    for (const link of this.links) if (!link.approved && link.intent === 'join') { link.requestId = undefined; if (link.authenticated) this.send(link, { type: 'join.decision', accepted: false }); this.clock.setTimeout(() => this.closeLink(link, false), 100); }
    this.notify();
  }
  private snapshot(): Extract<Payload, { type: 'session.snapshot' }> { return { type: 'session.snapshot', revision: this.rosterRevision, members: structuredClone([...this.members.values()]), houses: structuredClone([...this.houses.values()]) }; }
  private rosterChanged(): void { this.rosterRevision++; this.broadcast(this.snapshot()); this.reconcileMesh(); this.syncMedia(); this.notify(); }
  private async signHouse(house: PublicHouse): Promise<SignedHouse> { return { house: structuredClone(house), signature: await sign(this.identity, 'house', { sessionId: this.sessionId, epoch: this.epoch, house }) }; }
  private async verifyHouse(document: SignedHouse, identity: PublicIdentity): Promise<boolean> { return document.house.ownerId === identity.fingerprint && await verify(identity, 'house', { sessionId: this.sessionId, epoch: this.epoch, house: document.house }, document.signature); }

  private async handle(link: Link, payload: Payload): Promise<void> {
    const sender = link.identity!.fingerprint;
    const fromHost = sender === this.hostId;
    if (payload.type === 'session.snapshot') {
      if (this.isHost || !fromHost) throw new Error('Only coordinator publishes roster');
      if (payload.revision <= this.rosterRevision) return;
      const ids = new Set(payload.members.map(member => member.identity.fingerprint));
      if (ids.size !== payload.members.length || new Set(payload.members.map(member => member.slot)).size !== ids.size || new Set(payload.members.map(member => member.endpoint)).size !== ids.size || !ids.has(this.id)) throw new Error('Invalid roster');
      const host = payload.members.find(member => member.slot === 0);
      if (!host || host.identity.fingerprint !== this.hostId || host.endpoint !== link.raw.endpoint || !host.connected) throw new Error('Wrong coordinator');
      const self = payload.members.find(member => member.identity.fingerprint === this.id)!;
      if (self.endpoint !== this.endpoint?.id || !self.connected) throw new Error('Wrong local endpoint');
      for (const member of payload.members) { await validatePublicIdentity(member.identity); if (member.houseId && !ids.has(member.houseId)) throw new Error('Unknown room'); }
      const houseOwners = new Set<string>();
      for (const document of payload.houses) {
        const owner = payload.members.find(member => member.identity.fingerprint === document.house.ownerId);
        if (!owner || houseOwners.has(document.house.ownerId) || !await this.verifyHouse(document, owner.identity)) throw new Error('Invalid house signature');
        const previous = this.houses.get(owner.identity.fingerprint);
        if (previous && (document.house.revision < previous.house.revision || (document.house.revision === previous.house.revision && canonical(document.house) !== canonical(previous.house)))) throw new Error('Layout rollback');
        houseOwners.add(document.house.ownerId);
      }
      if (!this.active(link)) return;
      const oldIds = [...this.members.keys()];
      this.members = new Map(payload.members.map(member => [member.identity.fingerprint, structuredClone(member)]));
      this.houses = new Map(payload.houses.map(document => [document.house.ownerId, structuredClone(document)]));
      for (const id of oldIds) if (!ids.has(id)) this.removeLocalMember(id);
      this.rosterRevision = payload.revision; this.hostDeadline = null; this.error = null;
      const firstJoin = this.phase !== 'JOINED'; this.phase = 'JOINED';
      if (firstJoin) this.publishHouseDocument();
      this.announceMedia(link);
      this.reconcileMesh(); this.syncMedia(); this.notify(); return;
    }
    if (payload.type === 'media.token') { link.sendToken = payload.token; this.syncMedia(); return; }
    if (payload.type === 'media.received') {
      // The manager only confirms when it really has an outgoing call to this
      // sender, so any authenticated member may report receipt, in any room.
      if (this.members.has(sender)) this.media.confirmReceiving(sender, payload.kind);
      return;
    }
    if (payload.type === 'media.private') {
      if (payload.with === sender) throw new Error('Self private call');
      this.privateOf.set(sender, payload.with);
      this.syncMedia(); this.notify(); return;
    }
    if (payload.type === 'session.closed') { if (!fromHost || this.isHost) throw new Error('Only coordinator closes'); this.finish('CLOSED', 'El anfitrión cerró el vecindario.'); return; }
    if (payload.type === 'session.kick') { if (!fromHost || this.isHost || payload.identityId !== this.id) throw new Error('Only coordinator kicks'); this.finish('KICKED', 'El anfitrión te retiró del vecindario.'); return; }
    if (payload.type === 'session.leaveAck') { if (!fromHost || payload.requestId !== this.leaveRequest) throw new Error('Unexpected leave ACK'); this.leaveResolve?.(); return; }
    if (payload.type === 'session.leave') {
      if (!this.isHost) throw new Error('Leave must go to coordinator');
      this.send(link, { type: 'session.leaveAck', requestId: payload.requestId }); link.approved = false; this.removeMember(sender);
      this.clock.setTimeout(() => this.closeLink(link, false), 100); return;
    }
    if (this.leaving) return;
    if (payload.type === 'house.publish') {
      if (!this.isHost || payload.document.house.ownerId !== sender || !await this.verifyHouse(payload.document, link.identity!)) throw new Error('Owner-only house publication');
      if (!this.active(link)) return;
      const previous = this.houses.get(sender);
      if (previous && payload.document.house.revision <= previous.house.revision) return;
      this.houses.set(sender, structuredClone(payload.document));
      if (payload.document.house.access === 'locked') for (const member of this.members.values()) if (member.houseId === sender && member.identity.fingerprint !== sender) member.houseId = null;
      this.rosterChanged(); return;
    }
    if (payload.type === 'house.visit') { if (!this.isHost) throw new Error('Only coordinator routes visits'); this.requestVisit(sender, payload.ownerId, payload.requestId); return; }
    if (payload.type === 'house.visit.request') {
      if (!fromHost || payload.ownerId !== this.id) throw new Error('Invalid visit route');
      const visitor = this.members.get(payload.visitorId);
      if (!visitor?.connected || this.visits.size >= 12) return;
      this.visits.set(payload.requestId, { requestId: payload.requestId, visitorId: payload.visitorId, identity: visitor.identity, houseId: this.id, created: this.clock.now() }); this.notify(); return;
    }
    if (payload.type === 'house.visit.decision') { if (!this.isHost) throw new Error('Wrong visit role'); this.resolveVisit(payload.requestId, sender, payload.accepted); return; }
    if (payload.type === 'house.visit.result') { if (!fromHost) throw new Error('Wrong visit result role'); if (!payload.accepted) this.setError('La casa está cerrada, desconectada o no aceptó la visita.'); return; }
    if (payload.type === 'house.leave') { if (!this.isHost) throw new Error('Wrong leave route'); this.cancelVisits(sender); const member = this.members.get(sender); if (member) { member.houseId = null; this.rosterChanged(); } return; }
    if (payload.type === 'house.kick') { if (!this.isHost) throw new Error('Wrong owner kick route'); this.removeVisitor(sender, payload.identityId); return; }
    if (payload.type === 'player.position') {
      if (!this.isHost) throw new Error('Wrong position route'); const member = this.members.get(sender);
      if (member) {
        const changedArea = areaOf(member.position) !== areaOf(payload.position);
        member.position = payload.position;
        this.broadcast({ type: 'player.relay', identityId: sender, position: payload.position }, `position/${sender}`);
        if (changedArea) this.rosterChanged(); else this.notify();
      } return;
    }
    if (payload.type === 'player.relay') { if (!fromHost || this.isHost) throw new Error('Wrong position relay'); const member = this.members.get(payload.identityId); if (member) { const changedArea = areaOf(member.position) !== areaOf(payload.position); member.position = payload.position; if (changedArea) this.syncMedia(); this.notify(); } return; }
    if (payload.type === 'board.stroke') { await this.receiveStroke(link, payload.document, false); return; }
    if (payload.type === 'board.sync.request') {
      if (!this.sameRoom(sender, payload.boardId)) throw new Error('Board outside authorized house');
      if (payload.cursor === 0) link.syncExport = { boardId: payload.boardId, documents: this.board.documents(payload.boardId), cursor: 0 };
      const sync = link.syncExport;
      if (!sync || sync.boardId !== payload.boardId || sync.cursor !== payload.cursor) throw new Error('Invalid board sync cursor');
      let document = sync.documents[payload.cursor] ?? null;
      // Offline own drafts are rebound to this session before sharing; old-session signatures never go on the wire.
      if (document?.stroke.author === this.id) document = { stroke: document.stroke, signature: await sign(this.identity, 'board', { sessionId: this.sessionId, epoch: this.epoch, stroke: document.stroke }) };
      if (!this.active(link) || !this.sameRoom(sender, payload.boardId)) return;
      const next = payload.cursor + 1 < sync.documents.length ? payload.cursor + 1 : null;
      this.send(link, { type: 'board.sync.response', boardId: payload.boardId, document, next });
      if (next === null) link.syncExport = undefined; else sync.cursor = next;
      return;
    }
    if (payload.type === 'board.sync.response') {
      if (!this.sameRoom(sender, payload.boardId) || link.syncRoom !== payload.boardId || link.syncExpected === undefined || (payload.next !== null && payload.next !== link.syncExpected + 1)) throw new Error('Unsolicited board sync');
      if (payload.document) { if (payload.document.stroke.boardId !== payload.boardId) throw new Error('Wrong board'); await this.receiveStroke(link, payload.document, true); }
      if (!this.active(link)) return;
      if (payload.next !== null) { link.syncExpected = payload.next; this.send(link, { type: 'board.sync.request', boardId: payload.boardId, cursor: payload.next }); } else link.syncExpected = undefined;
      return;
    }
    if (payload.type === 'app.send') {
      if (!this.isHost) throw new Error('Only the coordinator routes activities');
      const relay: Payload = { type: 'app.relay', channel: payload.channel, from: sender, data: payload.data };
      if (payload.to === null) {
        for (const other of this.links) if (other !== link && other.approved) this.send(other, relay);
        this.deliverApp({ channel: payload.channel, from: sender, data: payload.data });
      } else if (payload.to === this.id) this.deliverApp({ channel: payload.channel, from: sender, data: payload.data });
      else { const target = this.linkFor(payload.to); if (target) this.send(target, relay); }
      return;
    }
    if (payload.type === 'app.relay') {
      if (!fromHost || this.isHost || payload.from === this.id || (payload.from !== sender && !this.members.get(payload.from)?.connected)) throw new Error('Wrong activity relay');
      this.deliverApp({ channel: payload.channel, from: payload.from, data: payload.data }); return;
    }
    throw new Error('Unsupported event');
  }

  publishHouse(house: PublicHouse): void {
    const parsed = houseSchema.safeParse(house);
    if (!parsed.success || house.ownerId !== this.id || house.revision < this.ownHouse.revision || (house.revision === this.ownHouse.revision && canonical(house) !== canonical(this.ownHouse))) { this.setError('Solo puedes publicar tu casa con una revisión nueva y campos públicos válidos.'); return; }
    this.ownHouse = parsed.data;
    if (this.phase === 'JOINED') this.publishHouseDocument();
    this.notify();
  }
  private publishHouseDocument(): void {
    const generation = this.generation; const house = structuredClone(this.ownHouse);
    this.queue(async () => {
      const document = await this.signHouse(house);
      if (generation !== this.generation || this.phase !== 'JOINED') return;
      if (this.isHost) {
        this.houses.set(this.id, document);
        if (house.access === 'locked') for (const member of this.members.values()) if (member.houseId === this.id && member.identity.fingerprint !== this.id) member.houseId = null;
        this.rosterChanged();
      } else this.sendHost({ type: 'house.publish', document });
    });
  }
  visitHouse(ownerId: string): void {
    if (this.phase !== 'JOINED') { this.setError('Abre o únete a un vecindario para visitar una casa.'); return; }
    this.media.suspend();
    const requestId = randomId();
    if (this.isHost) this.requestVisit(this.id, ownerId, requestId); else this.sendHost({ type: 'house.visit', requestId, ownerId });
  }
  private requestVisit(visitorId: string, ownerId: string, requestId: string): void {
    const visitor = this.members.get(visitorId); const owner = this.members.get(ownerId); const house = this.houses.get(ownerId)?.house;
    const reject = () => { const link = this.linkFor(visitorId); if (link) this.send(link, { type: 'house.visit.result', requestId, accepted: false }); else if (visitorId === this.id) this.setError('La casa no está disponible.'); };
    if (!visitor?.connected || !owner?.connected || !house || (house.access === 'locked' && visitorId !== ownerId)) { reject(); return; }
    // A new request cancels this visitor's older pending permission.
    for (const [id, visit] of this.visits) if (visit.visitorId === visitorId) this.visits.delete(id);
    if (visitorId === ownerId || house.access === 'open') { visitor.houseId = ownerId; this.rosterChanged(); return; }
    if (this.visits.size >= 12) { reject(); return; }
    this.visits.set(requestId, { requestId, visitorId, identity: visitor.identity, houseId: ownerId, created: this.clock.now() });
    if (ownerId !== this.id) { const link = this.linkFor(ownerId); if (!link || !this.send(link, { type: 'house.visit.request', requestId, visitorId, ownerId })) { this.visits.delete(requestId); reject(); } }
    this.notify();
  }
  decideVisit(requestId: string, accept: boolean): void {
    const request = this.visits.get(requestId);
    if (!request || request.houseId !== this.id || this.phase !== 'JOINED') return;
    if (this.isHost) this.resolveVisit(requestId, this.id, accept);
    else { this.sendHost({ type: 'house.visit.decision', requestId, accepted: accept }); this.visits.delete(requestId); this.notify(); }
  }
  private resolveVisit(requestId: string, ownerId: string, accept: boolean): void {
    const request = this.visits.get(requestId);
    if (!request || request.houseId !== ownerId) return;
    this.visits.delete(requestId);
    const visitor = this.members.get(request.visitorId); const owner = this.members.get(ownerId); const house = this.houses.get(ownerId)?.house;
    const accepted = !!(accept && visitor?.connected && owner?.connected && house && house.access !== 'locked');
    if (accepted) { visitor!.houseId = ownerId; this.rosterChanged(); }
    const link = this.linkFor(request.visitorId);
    if (link) this.send(link, { type: 'house.visit.result', requestId, accepted }); else if (!accepted) this.setError('La visita no fue aceptada.');
    this.notify();
  }
  leaveHouse(): void {
    this.media.suspend();
    if (this.phase !== 'JOINED') return;
    if (this.isHost) { this.cancelVisits(this.id); const member = this.members.get(this.id); if (member) member.houseId = null; this.rosterChanged(); }
    else this.sendHost({ type: 'house.leave' });
  }
  private cancelVisits(visitorId: string): void { for (const [id, request] of this.visits) if (request.visitorId === visitorId) this.visits.delete(id); }
  kickVisitor(identityId: string): void { if (this.phase !== 'JOINED') return; if (this.isHost) this.removeVisitor(this.id, identityId); else this.sendHost({ type: 'house.kick', identityId }); }
  private removeVisitor(ownerId: string, visitorId: string): void {
    const visitor = this.members.get(visitorId);
    if (visitor && visitorId !== ownerId && visitor.houseId === ownerId) { visitor.houseId = null; this.rosterChanged(); }
  }
  kickMember(identityId: string): void {
    if (!this.isHost || identityId === this.id || this.phase !== 'JOINED') return;
    const link = this.linkFor(identityId);
    if (link) { this.send(link, { type: 'session.kick', identityId }); link.approved = false; }
    this.removeMember(identityId);
    if (link) this.clock.setTimeout(() => this.closeLink(link, false), 100);
  }
  move(position: Position): void {
    const previous = this.members.get(this.id)?.position;
    const parsed = positionSchema.safeParse({ ...position, areaId: position.areaId ?? (previous ? areaOf(previous) : 'residential') });
    if (!parsed.success || this.phase !== 'JOINED') return;
    const self = this.members.get(this.id);
    const changedArea = !!self && areaOf(self.position) !== areaOf(parsed.data);
    if (self) self.position = parsed.data;
    this.pendingPosition = parsed.data;
    const elapsed = this.clock.now() - this.lastPositionSent;
    if (changedArea || elapsed >= 100) this.flushPosition();
    else if (!this.moveTimer) this.moveTimer = this.clock.setTimeout(() => { this.moveTimer = undefined; this.flushPosition(); }, 100 - elapsed);
    if (changedArea) { if (this.isHost) this.rosterChanged(); else this.syncMedia(); }
    this.notify();
  }
  private flushPosition(): void {
    if (!this.pendingPosition || this.phase !== 'JOINED') return;
    const position = this.pendingPosition; this.pendingPosition = undefined; this.lastPositionSent = this.clock.now();
    if (this.isHost) this.broadcast({ type: 'player.relay', identityId: this.id, position }, `position/${this.id}`);
    else this.sendHost({ type: 'player.position', position }, `position/${this.id}`);
  }
  sendStroke(stroke: BoardStroke): void {
    const parsed = strokeSchema.safeParse(stroke);
    const self = this.members.get(this.id);
    const localOnly = !activePhases.includes(this.phase);
    if (!parsed.success || stroke.author !== this.id || (localOnly ? stroke.boardId !== this.id : self?.houseId !== stroke.boardId)) { this.setError('Solo puedes dibujar tu propia capa en la casa actual.'); return; }
    const generation = this.generation;
    this.queue(async () => {
      const document: SignedStroke = { stroke: parsed.data, signature: await sign(this.identity, 'board', { sessionId: this.sessionId, epoch: this.epoch, stroke: parsed.data }) };
      if (generation !== this.generation) return;
      const result = this.board.apply(document);
      if (result === 'full') { this.setError('La pizarra alcanzó 2000 operaciones; exporta tus notas antes de continuar.'); return; }
      if (result === 'forbidden') { this.setError('No puedes modificar un trazo ajeno.'); return; }
      if (result === 'applied' && !localOnly) this.shareStroke(document);
      this.notify();
    });
  }
  deleteStroke(strokeId: string): void {
    const room = this.members.get(this.id)?.houseId ?? this.id;
    const document = this.board.find(room, strokeId);
    if (!document || document.stroke.author !== this.id || document.stroke.deleted) return;
    this.sendStroke({ ...document.stroke, seq: document.stroke.seq + 1, deleted: true });
  }
  private sameRoom(identityId: string, boardId: string): boolean {
    const self = this.members.get(this.id); const peer = this.members.get(identityId);
    return this.phase === 'JOINED' && !!self?.connected && self.houseId === boardId && !!peer?.connected && peer.houseId === boardId;
  }
  private async receiveStroke(link: Link, document: SignedStroke, sync: boolean): Promise<void> {
    const stroke = document.stroke; const author = this.members.get(stroke.author);
    if (!this.sameRoom(link.identity!.fingerprint, stroke.boardId) || (!sync && stroke.author !== link.identity!.fingerprint)) throw new Error('Unauthorized board author or house');
    // Departed authors' already-rendered work remains local, but is not newly imported without roster authorization.
    if (!author) return;
    if (!await verify(author.identity, 'board', { sessionId: this.sessionId, epoch: this.epoch, stroke }, document.signature)) throw new Error('Invalid board signature');
    if (!this.active(link) || !this.sameRoom(link.identity!.fingerprint, stroke.boardId)) return;
    const result = this.board.apply(document);
    if (result === 'forbidden') throw new Error('Another author owns this stroke');
    if (result === 'full') this.setError('La pizarra alcanzó el límite de operaciones; hay cambios que no se importaron.');
    else if (result === 'applied') this.notify();
  }
  private shareStroke(document: SignedStroke): void {
    const recipients = [...this.members.values()].filter(member => member.identity.fingerprint !== this.id && member.connected && member.houseId === document.stroke.boardId);
    let pending = this.phase !== 'JOINED';
    for (const recipient of recipients) { const link = this.linkFor(recipient.identity.fingerprint); if (!link || !this.send(link, { type: 'board.stroke', document })) pending = true; }
    const key = `${document.stroke.boardId}/${document.stroke.id}`;
    if (pending) {
      const bytes = [...this.boardRetries.values()].reduce((total, item) => total + JSON.stringify(item).length, 0) + JSON.stringify(document).length;
      if ((!this.boardRetries.has(key) && this.boardRetries.size >= LIMITS.queueMessages) || bytes > LIMITS.queueBytes) this.setError('La cola de pizarra está llena. Conserva y exporta tus notas locales.');
      else { this.boardRetries.set(key, document); this.setError('Trabajas sin todos los enlaces; tus trazos pendientes todavía no se comparten con todos.'); }
    } else this.boardRetries.delete(key);
  }
  private reconcileMesh(): void {
    if (this.phase !== 'JOINED' || !this.endpoint) return;
    for (const link of [...this.links]) if (link.approved && link.identity && !this.members.has(link.identity.fingerprint)) this.closeLink(link, false);
    for (const member of this.members.values()) {
      const id = member.identity.fingerprint;
      if (id === this.id || id === this.hostId || !member.connected || this.isHost || this.id > id) continue;
      this.connect(member.endpoint, 'mesh', member.identity);
    }
  }
  /** Sends this link my media token and my current private-call intent. */
  private announceMedia(link: Link): void {
    this.send(link, { type: 'media.token', token: link.receiveToken });
    this.send(link, { type: 'media.private', with: this.privateWith });
  }

  /** The partner of `id` in a private call, only when both chose each other. */
  private partnerOf(id: string): string | null {
    const wants = (who: string) => who === this.id ? this.privateWith : this.privateOf.get(who) ?? null;
    const partner = wants(id);
    if (!partner || partner === id) return null;
    const partnerMember = this.members.get(partner);
    if (!partnerMember?.connected || !this.members.get(id)?.connected) return null;
    return wants(partner) === id ? partner : null;
  }

  requestPrivate(identityId: string | null): void {
    if (this.phase !== 'JOINED') return;
    if (identityId !== null && (identityId === this.id || !this.members.get(identityId)?.connected)) {
      this.setError('Esa persona ya no está en la aldea.'); return;
    }
    if (this.privateWith === identityId) return;
    this.privateWith = identityId;
    for (const link of this.links) if (link.approved && link.authenticated && !link.closed) this.send(link, { type: 'media.private', with: identityId });
    this.syncMedia(); this.notify();
  }

  private syncMedia(): void {
    const self = this.members.get(this.id);
    if (this.phase !== 'JOINED' || !self?.connected || this.leaving) { this.media.setContext(null); return; }

    // Board sync follows the house you are standing in, independent of voice.
    for (const link of this.links) {
      const peer = link.identity ? this.members.get(link.identity.fingerprint) : undefined;
      const together = !!self.houseId && !!peer?.connected && peer.houseId === self.houseId;
      if (together && self.houseId && link.syncRoom !== self.houseId) {
        link.syncRoom = self.houseId; link.syncExpected = 0;
        this.send(link, { type: 'board.sync.request', boardId: self.houseId, cursor: 0 });
      } else if (!together) { link.syncRoom = undefined; link.syncExpected = undefined; link.syncExport = undefined; }
    }

    // Voice: a mutual private call wins; otherwise you talk to everyone in the
    // same place (the open village, or the same house) who is not in a call.
    const partner = this.partnerOf(this.id);
    let room: string; let roomName: string; let audience: string[];
    if (partner) {
      room = `pair:${[this.id, partner].sort().join(':')}`;
      roomName = `Privado con ${this.members.get(partner)?.identity.displayName ?? 'alguien'}`;
      audience = [partner];
    } else {
      room = self.houseId ? `house:${self.houseId}` : areaOf(self.position) === 'residential' ? 'village' : `area:${areaOf(self.position)}`;
      roomName = self.houseId ? `Casa: ${this.houses.get(self.houseId)?.house.name ?? 'Casa'}` : AREA_NAMES[areaOf(self.position)];
      audience = [...this.members.values()]
        .filter(member => member.identity.fingerprint !== this.id && isInScene(member, areaOf(self.position), self.houseId) && !this.partnerOf(member.identity.fingerprint))
        .map(member => member.identity.fingerprint);
    }
    const peers: MediaPeer[] = [];
    for (const id of audience) {
      const member = this.members.get(id); const link = this.linkFor(id);
      if (!member || !link?.sendToken) continue;
      peers.push({ identityId: id, endpoint: member.endpoint, sendToken: link.sendToken, receiveToken: link.receiveToken });
    }
    this.media.setContext({ sessionId: this.sessionId!, epoch: this.epoch, identityId: this.id, room, roomName, peers });
  }
  toggleMicrophone(): Promise<void> { return this.media.toggleMicrophone(); }
  setMuted(value: boolean): void { this.media.setMuted(value); }
  setDeafened(value: boolean): void { this.media.setDeafened(value); }
  setPushToTalk(value: boolean): void { this.media.setPushToTalk(value); }
  setTalking(value: boolean): void { this.media.setTalking(value); }
  startScreen(): Promise<void> { return this.media.startScreen(); }
  stopScreen(): void { this.media.stopScreen(); }

  private linkClosed(link: Link): void {
    if (link.closed) return;
    link.closed = true; this.links.delete(link); link.wire.close(false);
    for (const unsubscribe of link.unsubscribe) unsubscribe();
    if (this.leaving || this.disposed) return;
    const id = link.identity?.fingerprint;
    if (link.approved && id && this.members.has(id)) {
      if (this.isHost) {
        const member = this.members.get(id)!; member.connected = false;
        this.memberDeadlines.set(id, this.clock.now() + LIMITS.hostGraceMs);
        this.rosterChanged();
      } else if (id === this.hostId) {
        this.hostDeadline ??= this.clock.now() + LIMITS.hostGraceMs;
        this.phase = 'RECONNECTING'; this.media.suspend();
        this.error = 'Se perdió el anfitrión. Se conserva la sesión durante 60 segundos y se exige autenticación al volver.';
      }
    } else if (!this.isHost && link.initiator && link.intent === 'join' && this.phase !== 'DENIED') this.finish('NETWORK_FAILED', 'La conexión no se autenticó o la invitación fue revocada.');
    this.syncMedia(); this.notify();
  }
  private closeLink(link: Link, unexpected: boolean): void {
    if (link.closed) return;
    if (unexpected) { link.wire.close(); this.linkClosed(link); return; }
    link.closed = true; this.links.delete(link); for (const unsubscribe of link.unsubscribe) unsubscribe(); link.wire.close();
  }
  private forgetPrivate(identityId: string): void {
    this.privateOf.delete(identityId);
    if (this.privateWith === identityId) this.privateWith = null;
  }
  private removeLocalMember(identityId: string): void {
    this.forgetPrivate(identityId);
    const link = this.linkFor(identityId); if (link) this.closeLink(link, false);
    this.houses.delete(identityId); this.memberDeadlines.delete(identityId);
    if (identityId !== this.id) this.board.removeBoard(identityId);
    for (const [id, visit] of this.visits) if (visit.houseId === identityId || visit.visitorId === identityId) this.visits.delete(id);
  }
  private removeMember(identityId: string): void {
    if (!this.members.has(identityId) || identityId === this.id) return;
    this.members.delete(identityId); this.houses.delete(identityId); this.memberDeadlines.delete(identityId);
    this.forgetPrivate(identityId);
    for (const member of this.members.values()) if (member.houseId === identityId) member.houseId = null;
    for (const [id, visit] of this.visits) if (visit.houseId === identityId || visit.visitorId === identityId) this.visits.delete(id);
    this.board.removeBoard(identityId); this.rosterChanged();
  }
  private startTick(): void {
    if (this.tickTimer) this.clock.clearTimeout(this.tickTimer);
    const generation = this.generation;
    const tick = () => {
      if (generation !== this.generation || this.disposed) return;
      const now = this.clock.now();
      if (this.hostDeadline !== null && now >= this.hostDeadline) { this.finish('CLOSED', 'El anfitrión no regresó en 60 segundos. La sesión terminó.'); return; }
      for (const link of [...this.links]) {
        if ((!link.authenticated && now - link.created >= 15_000) || (link.authenticated && now - link.lastSeen >= 10_000) || (!link.approved && now - link.created >= 120_000)) { this.closeLink(link, true); continue; }
        if (link.authenticated && now - link.lastHeartbeat >= 2_000) { link.lastHeartbeat = now; this.send(link, { type: 'session.heartbeat', reply: false }); }
      }
      if (this.isHost) for (const [id, deadline] of [...this.memberDeadlines]) if (now >= deadline) this.removeMember(id);
      for (const [id, visit] of this.visits) if (now - visit.created >= 60_000) this.visits.delete(id);
      if (!this.isHost && this.phase === 'RECONNECTING' && this.invite && now - this.lastReconnect >= 2_000) { this.lastReconnect = now; this.connect(this.invite.endpoint, 'resume', this.hostId!); }
      if (this.phase === 'JOINED') {
        this.reconcileMesh();
        const retry = this.boardRetries.values().next().value; if (retry) this.shareStroke(retry);
      }
      if (this.hostDeadline !== null) this.notify();
      this.tickTimer = this.clock.setTimeout(tick, this.hostDeadline === null ? 250 : Math.min(250, Math.max(0, this.hostDeadline - this.clock.now())));
    };
    this.tickTimer = this.clock.setTimeout(tick, 250);
  }
  async leave(): Promise<void> {
    if (this.leaving) return;
    this.leaving = true; this.media.suspend();
    if (this.isHost && this.phase === 'JOINED') {
      this.broadcast({ type: 'session.closed' });
      await new Promise<void>(resolve => this.clock.setTimeout(resolve, 100));
    } else if (this.hostLink() && this.phase === 'JOINED') {
      this.leaveRequest = randomId();
      await new Promise<void>(resolve => {
        let done = false;
        const complete = () => { if (done) return; done = true; this.clock.clearTimeout(timeout); this.leaveResolve = undefined; resolve(); };
        const timeout = this.clock.setTimeout(complete, LIMITS.leaveAckMs); this.leaveResolve = complete;
        this.sendHost({ type: 'session.leave', requestId: this.leaveRequest! });
      });
    }
    this.finish('CLOSED', null);
  }
  private finish(phase: SessionPhase, error: string | null): void { this.reset(); this.phase = phase; this.error = error; this.notify(); }
  private reset(): void {
    this.generation++; this.leaving = true; this.media.suspend(); this.leaveResolve?.();
    this.privateWith = null; this.privateOf.clear();
    if (this.tickTimer) this.clock.clearTimeout(this.tickTimer);
    if (this.moveTimer) this.clock.clearTimeout(this.moveTimer);
    this.tickTimer = undefined; this.moveTimer = undefined; this.pendingPosition = undefined;
    for (const link of [...this.links]) this.closeLink(link, false);
    for (const unsubscribe of this.endpointUnsubscribe) unsubscribe(); this.endpointUnsubscribe = [];
    this.endpoint?.destroy(); this.endpoint = undefined;
    this.members.clear(); this.houses.clear(); this.visits.clear(); this.memberDeadlines.clear(); this.boardRetries.clear();
    this.board.retainOwn(this.id); this.localJobs = [];
    this.isHost = false; this.hostId = null; this.sessionId = null; this.epoch = 0; this.invite = null;
    this.rosterRevision = 0; this.hostDeadline = null; this.error = null; this.leaveRequest = undefined; this.leaveResolve = undefined;
    this.leaving = false;
  }
  dispose(): void { if (this.disposed) return; this.reset(); this.media.dispose(); this.disposed = true; this.listeners.clear(); }
}
```

### app/src/session/board.ts

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `f98a672114fa3230b86b2d6dd7efbc5484b8f61213e06fc272962da8cc4445bc`.

```ts
import { LIMITS } from '../protocol/types';
import type { SignedStroke } from '../protocol/schema';

/** Tombstones are retained; an old add cannot resurrect a deleted stroke. */
export class BoardStore {
  private boards = new Map<string, Map<string, SignedStroke>>();
  private operations = new Map<string, number>();
  apply(document: SignedStroke): 'applied' | 'duplicate' | 'full' | 'forbidden' {
    const stroke = document.stroke;
    let board = this.boards.get(stroke.boardId);
    if (!board) { if (this.boards.size >= LIMITS.members) return 'full'; board = new Map(); this.boards.set(stroke.boardId, board); }
    const previous = board.get(stroke.id);
    if (previous && previous.stroke.author !== stroke.author) return 'forbidden';
    if (previous && (stroke.seq <= previous.stroke.seq || previous.stroke.deleted)) return 'duplicate';
    const count = this.operations.get(stroke.boardId) ?? 0;
    if (count >= LIMITS.boardOperations) return 'full';
    board.set(stroke.id, structuredClone(document)); this.operations.set(stroke.boardId, count + 1);
    return 'applied';
  }
  documents(boardId: string): SignedStroke[] { return [...(this.boards.get(boardId)?.values() ?? [])].sort((a, b) => a.stroke.id.localeCompare(b.stroke.id)); }
  find(boardId: string, id: string): SignedStroke | undefined { return this.boards.get(boardId)?.get(id); }
  removeBoard(boardId: string): void { this.boards.delete(boardId); this.operations.delete(boardId); }
  retainOwn(author: string): void {
    for (const [boardId, board] of this.boards) {
      for (const [id, document] of board) if (document.stroke.author !== author) board.delete(id);
      if (!board.size) { this.boards.delete(boardId); this.operations.delete(boardId); }
    }
  }
}
```

### app/src/identity/index.ts

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `60f1f55ab924233cf24624329d1bd8886ca9b59d1c7a6bd210aff20422aaf752`.

```ts
import { z } from 'zod';
import type { Contact, EncryptedIdentity, LocalIdentity, PublicIdentity } from '../protocol/types';
import { identitySchema } from '../protocol/schema';

const encoder = new TextEncoder();
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Codificación inválida.');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  if (toBase64(bytes) !== value) throw new Error('Codificación no canónica.');
  return bytes;
}
export function randomId(bytes = 24): string { return toBase64(crypto.getRandomValues(new Uint8Array(bytes))); }
export async function fingerprint(publicKey: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', fromBase64(publicKey));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
export async function validatePublicIdentity(input: unknown): Promise<PublicIdentity> {
  const identity = identitySchema.parse(input);
  if (await fingerprint(identity.publicKey) !== identity.fingerprint) throw new Error('La huella no coincide con la clave.');
  await importPublicKey(identity.publicKey);
  return identity;
}
async function importPublicKey(key: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('spki', fromBase64(key), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
}
export async function generateIdentity(name: string, color: string): Promise<LocalIdentity> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const publicKey = toBase64(new Uint8Array(await crypto.subtle.exportKey('spki', pair.publicKey)));
  return { public: identitySchema.parse({ publicKey, fingerprint: await fingerprint(publicKey), displayName: name, color }), privateKey: pair.privateKey };
}
/** Fixed ordering at every depth makes signatures independent of JSON key order. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
}
export async function sign(identity: LocalIdentity, domain: string, value: unknown): Promise<string> {
  return toBase64(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, identity.privateKey, encoder.encode(`StudyVillage/v1/${domain}\n${canonical(value)}`))));
}
export async function verify(identity: PublicIdentity, domain: string, value: unknown, signature: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await importPublicKey(identity.publicKey), fromBase64(signature), encoder.encode(`StudyVillage/v1/${domain}\n${canonical(value)}`));
  } catch { return false; }
}
const encryptedSchema = z.strictObject({
  v: z.literal(1), kdf: z.literal('PBKDF2-SHA256'), iterations: z.number().int().min(310_000).max(1_000_000),
  salt: z.string().length(22), iv: z.string().length(16), ciphertext: z.string().min(100).max(4096), publicIdentity: identitySchema,
});
async function encryptionKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  if (passphrase.length < 10 || passphrase.length > 1024) throw new Error('Usa una contraseña de entre 10 y 1024 caracteres.');
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function encryptIdentity(identity: LocalIdentity, passphrase: string): Promise<EncryptedIdentity> {
  const publicIdentity = await validatePublicIdentity(identity.public);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iterations = 600_000;
  const privateBytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', identity.privateKey));
  try {
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(canonical(publicIdentity)) }, await encryptionKey(passphrase, salt, iterations), privateBytes);
    return { v: 1, kdf: 'PBKDF2-SHA256', iterations, salt: toBase64(salt), iv: toBase64(iv), ciphertext: toBase64(new Uint8Array(ciphertext)), publicIdentity };
  } finally { privateBytes.fill(0); }
}
export async function decryptIdentity(input: EncryptedIdentity, passphrase: string): Promise<LocalIdentity> {
  const encrypted = encryptedSchema.parse(input);
  const publicIdentity = await validatePublicIdentity(encrypted.publicIdentity);
  let privateBytes: Uint8Array<ArrayBuffer> | undefined;
  try {
    privateBytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(encrypted.iv), additionalData: encoder.encode(canonical(publicIdentity)) }, await encryptionKey(passphrase, fromBase64(encrypted.salt), encrypted.iterations), fromBase64(encrypted.ciphertext)));
    const privateKey = await crypto.subtle.importKey('pkcs8', privateBytes, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
    const identity = { public: publicIdentity, privateKey };
    const challenge = randomId(32);
    if (!await verify(publicIdentity, 'key-check', challenge, await sign(identity, 'key-check', challenge))) throw new Error('Clave incorrecta.');
    return identity;
  } catch { throw new Error('No se pudo desbloquear la identidad. Comprueba la contraseña y el archivo.'); }
  finally { privateBytes?.fill(0); }
}
const contactSchema = z.strictObject({ schemaVersion: z.literal(1), identity: identitySchema, friendCode: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/) });
export function exportContact(identity: LocalIdentity | PublicIdentity, friendCode: string): string {
  return JSON.stringify(contactSchema.parse({ schemaVersion: 1, identity: 'public' in identity ? identity.public : identity, friendCode }), null, 2);
}
export async function parseContact(json: string): Promise<Contact> {
  if (new TextEncoder().encode(json).byteLength > 8192) throw new Error('Contacto demasiado grande.');
  const contact = contactSchema.parse(JSON.parse(json));
  return { ...contact, identity: await validatePublicIdentity(contact.identity) };
}
```

### app/src/signaling/invite.ts

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `c16851746ff382b93a121a9f1f8f313a17e0dbf3eba5bd85bac3c1a007393815`.

```ts
import { fromBase64, randomId, toBase64 } from '../identity';
import { inviteSchema, type Invite } from '../protocol/schema';

export function createInvite(hostFingerprint: string, endpoint: string, sessionId: string, epoch: number, generation: number, now = Date.now()): Invite {
  return inviteSchema.parse({ v: 1, hostFingerprint, endpoint, sessionId, epoch, generation, secret: randomId(32), expiresAt: now + 3_600_000 });
}
export function encodeInvite(invite: Invite): string { return toBase64(new TextEncoder().encode(JSON.stringify(inviteSchema.parse(invite)))); }
export function parseInvite(input: string, now = Date.now()): Invite {
  const value = input.trim();
  if (value.length > 4096) throw new Error('Invitación demasiado grande.');
  const json = value.startsWith('{') ? value : new TextDecoder('utf-8', { fatal: true }).decode(fromBase64(value));
  const invite = inviteSchema.parse(JSON.parse(json));
  if (invite.expiresAt <= now) throw new Error('EXPIRED_INVITE');
  return invite;
}
```

### app/src/signaling/peerjs.ts

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `4800e7782b0ac3ee904514d7055ad02c122d47a33281d0a4e9ffae7e11fb8bc9`.

```ts
import type { DataConnection, MediaConnection, Peer } from 'peerjs';
import type { DataChannel, MediaCall, TransportEndpoint } from '../transport/types';

/** Explicit override: PeerJS defaults must never silently introduce a TURN relay. */
export const STUN_ONLY_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
  iceTransportPolicy: 'all',
};
function dataAdapter(connection: DataConnection): DataChannel {
  return {
    endpoint: connection.peer,
    get open() { return connection.open; },
    get bufferedAmount() { return connection.dataChannel?.bufferedAmount ?? 0; },
    send: data => { void connection.send(data); }, close: () => connection.close(),
    onOpen: callback => { connection.on('open', callback); return () => connection.off('open', callback); },
    onData: callback => { connection.on('data', callback); return () => connection.off('data', callback); },
    onClose: callback => {
      const failed = () => { connection.close(); callback(); };
      connection.on('close', callback); connection.on('error', failed);
      return () => { connection.off('close', callback); connection.off('error', failed); };
    },
  };
}
function mediaAdapter(connection: MediaConnection): MediaCall {
  let retry: ReturnType<typeof setTimeout> | undefined;
  const limit = (kind: 'audio' | 'screen') => {
    const apply = () => {
      for (const sender of connection.peerConnection?.getSenders() ?? []) {
        if (!sender.track) continue;
        const parameters = sender.getParameters();
        if (!parameters.encodings?.length) continue;
        for (const encoding of parameters.encodings) {
          encoding.maxBitrate = kind === 'audio' ? 48_000 : 12_000_000;
          if (kind === 'screen') encoding.maxFramerate = 30;
        }
        void sender.setParameters(parameters).catch(() => { /* Browser may not expose bitrate controls. */ });
      }
    };
    apply();
    retry = setTimeout(apply, 1_000);
  };
  connection.on('close', () => { if (retry) clearTimeout(retry); });
  return {
    endpoint: connection.peer, metadata: connection.metadata,
    answer: () => connection.answer(), close: () => { if (retry) clearTimeout(retry); connection.close(); },
    onStream: callback => { connection.on('stream', callback); return () => connection.off('stream', callback); },
    onClose: callback => {
      const failed = () => { connection.close(); callback(); };
      connection.on('close', callback); connection.on('error', failed);
      return () => { connection.off('close', callback); connection.off('error', failed); };
    },
    limitBitrate: limit,
  };
}
/** Called exclusively after an explicit host/join action. No PeerJS object exists on import. */
export async function createPeerEndpoint(): Promise<TransportEndpoint> {
  const { Peer } = await import('peerjs');
  const peer: Peer = new Peer({ config: STUN_ONLY_CONFIG, debug: 0 });
  const connections = new Set<(channel: DataChannel) => void>();
  const calls = new Set<(call: MediaCall) => void>();
  const changes = new Set<(connected: boolean) => void>();
  let destroyed = false;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  peer.on('connection', connection => {
    // This application has no binary/file transfer channel.
    if (connection.serialization !== 'raw' || connections.size === 0) { connection.close(); return; }
    for (const callback of connections) callback(dataAdapter(connection));
  });
  peer.on('call', call => { if (!calls.size) call.close(); else for (const callback of calls) callback(mediaAdapter(call)); });
  peer.on('disconnected', () => {
    for (const callback of changes) callback(false);
    if (!destroyed) reconnect = setTimeout(() => { if (!destroyed && peer.disconnected) { try { peer.reconnect(); } catch { /* Existing P2P links remain valid. */ } } }, 2_000);
  });
  peer.on('open', () => { for (const callback of changes) callback(true); });
  peer.on('error', () => { for (const callback of changes) callback(false); });
  const id = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => { peer.destroy(); reject(new Error('No se pudo abrir la señalización.')); }, 15_000);
    const opened = (endpoint: string) => { clearTimeout(timeout); peer.off('error', failed); resolve(endpoint); };
    const failed = () => { clearTimeout(timeout); peer.off('open', opened); peer.destroy(); reject(new Error('Señalización no disponible; revisa la red.')); };
    peer.once('open', opened); peer.once('error', failed);
  });
  return {
    id,
    connect: endpoint => dataAdapter(peer.connect(endpoint, { reliable: true, serialization: 'raw', label: 'studyvillage-v1' })),
    call: (endpoint, stream, metadata) => mediaAdapter(peer.call(endpoint, stream, { metadata })),
    onConnection: callback => { connections.add(callback); return () => connections.delete(callback); },
    onCall: callback => { calls.add(callback); return () => calls.delete(callback); },
    onSignalingChange: callback => { changes.add(callback); return () => changes.delete(callback); },
    destroy: () => { destroyed = true; if (reconnect) clearTimeout(reconnect); connections.clear(); calls.clear(); changes.clear(); peer.destroy(); },
  };
}
```

### app/src/transport/types.ts

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `cf3649981f28c996ff9a5af98012032b4baf6e2755bd9330f08a828141ae8856`.

```ts
export interface Clock {
  now(): number;
  wallNow(): number;
  setTimeout(callback: () => void, milliseconds: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}
export const systemClock: Clock = {
  now: () => performance.now(), wallNow: () => Date.now(),
  setTimeout: (callback, milliseconds) => setTimeout(callback, milliseconds), clearTimeout: handle => clearTimeout(handle),
};
export interface DataChannel {
  readonly endpoint: string;
  readonly open: boolean;
  readonly bufferedAmount: number;
  send(data: string): void;
  close(): void;
  onOpen(callback: () => void): () => void;
  onData(callback: (data: unknown) => void): () => void;
  onClose(callback: () => void): () => void;
}
export interface MediaCall {
  readonly endpoint: string;
  readonly metadata: unknown;
  answer(): void;
  close(): void;
  onStream(callback: (stream: MediaStream) => void): () => void;
  onClose(callback: () => void): () => void;
  limitBitrate(kind: 'audio' | 'screen'): void;
}
export interface TransportEndpoint {
  readonly id: string;
  connect(endpoint: string): DataChannel;
  call(endpoint: string, stream: MediaStream, metadata: unknown): MediaCall;
  onConnection(callback: (channel: DataChannel) => void): () => void;
  onCall(callback: (call: MediaCall) => void): () => void;
  onSignalingChange(callback: (connected: boolean) => void): () => void;
  destroy(): void;
}
export type TransportFactory = () => Promise<TransportEndpoint>;
```

### app/src/transport/bounded-channel.ts

Archivo clásico completo de la referencia. Reglas CSS legadas de controles no montados no habilitan ninguna función; en esta fase no se crean controles de IA ni juegos.

SHA-256 del bloque: `7d745be3917a2e99e551c06bfbc943107a44277d94857182f11d25a4be885121`.

```ts
import { LIMITS } from '../protocol/types';
import { parseWire, type WireMessage } from '../protocol/schema';
import { systemClock, type Clock, type DataChannel } from './types';

type Queued = { data: string; bytes: number; coalesce?: string };
/** Bounds include work waiting for WebCrypto: a peer cannot create an unbounded promise chain. */
export class BoundedChannel {
  private inbound: Queued[] = [];
  private outbound: Queued[] = [];
  private inboundBytes = 0;
  private outboundBytes = 0;
  private processing = false;
  private timer?: ReturnType<typeof setTimeout>;
  private closed = false;
  private tokens = 160;
  private sendTokens = 120;
  private tokenTime: number;
  private sendTime: number;
  private unsubscribe: (() => void)[];
  constructor(readonly raw: DataChannel, private receive: (message: WireMessage) => Promise<void>, private failed: (reason: string) => void, private clock: Clock = systemClock) {
    this.tokenTime = this.sendTime = clock.now();
    this.unsubscribe = [raw.onData(data => this.enqueueInbound(data)), raw.onOpen(() => this.pump()), raw.onClose(() => this.close(false))];
  }
  get pendingMessages(): number { return this.outbound.length; }
  get pendingBytes(): number { return this.outboundBytes; }
  private fail(reason: string): void { if (!this.closed) { this.failed(reason); this.close(); } }
  private enqueueInbound(data: unknown): void {
    if (this.closed) return;
    const now = this.clock.now();
    this.tokens = Math.min(160, this.tokens + Math.max(0, now - this.tokenTime) * .12);
    this.tokenTime = now;
    if (this.tokens < 1) return this.fail('Se excedió el límite de mensajes.');
    this.tokens--;
    if (typeof data !== 'string') return this.fail('Formato de mensaje inválido.');
    const bytes = new TextEncoder().encode(data).byteLength;
    if (bytes > LIMITS.messageBytes || this.inbound.length >= LIMITS.queueMessages || this.inboundBytes + bytes > LIMITS.queueBytes) return this.fail('Cola de entrada fuera de límites.');
    this.inbound.push({ data, bytes }); this.inboundBytes += bytes;
    void this.drainInbound();
  }
  private async drainInbound(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      while (!this.closed && this.inbound.length) {
        const item = this.inbound[0];
        await this.receive(parseWire(item.data));
        if (this.closed) break;
        this.inbound.shift(); this.inboundBytes -= item.bytes;
      }
    } catch { this.fail('Mensaje inválido o no autorizado.'); }
    finally { this.processing = false; }
  }
  send(message: WireMessage, coalesce?: string): boolean {
    if (this.closed) return false;
    const data = JSON.stringify(message);
    const bytes = new TextEncoder().encode(data).byteLength;
    if (bytes > LIMITS.messageBytes) { this.failed('Mensaje demasiado grande.'); return false; }
    if (coalesce) {
      const old = this.outbound.findIndex(item => item.coalesce === coalesce);
      if (old >= 0) { this.outboundBytes -= this.outbound[old].bytes; this.outbound.splice(old, 1); }
    }
    if (this.outbound.length >= LIMITS.queueMessages || this.outboundBytes + bytes > LIMITS.queueBytes) {
      if (!coalesce) this.failed('Cola llena; el cambio todavía no se ha compartido.');
      return false;
    }
    this.outbound.push({ data, bytes, coalesce }); this.outboundBytes += bytes;
    this.pump(); return true;
  }
  private pump(): void {
    if (this.closed) return;
    if (this.timer) { this.clock.clearTimeout(this.timer); this.timer = undefined; }
    const now = this.clock.now();
    this.sendTokens = Math.min(120, this.sendTokens + Math.max(0, now - this.sendTime) * .12); this.sendTime = now;
    while (this.raw.open && this.outbound.length && this.raw.bufferedAmount < 262_144 && this.sendTokens >= 1) {
      const item = this.outbound.shift()!;
      this.outboundBytes -= item.bytes; this.sendTokens--;
      try { this.raw.send(item.data); } catch { this.fail('No se pudo enviar el mensaje.'); return; }
    }
    if (this.outbound.length) this.timer = this.clock.setTimeout(() => { this.timer = undefined; this.pump(); }, 20);
  }
  close(closeRaw = true): void {
    if (this.closed) return;
    this.closed = true;
    if (this.timer) this.clock.clearTimeout(this.timer);
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    this.inbound = []; this.outbound = []; this.inboundBytes = this.outboundBytes = 0;
    if (closeRaw) this.raw.close();
  }
}
```

### app/src/protocol/types.ts — canales de base

Contrato completo adaptado a esta fase: relay genérico de proyectos, sin canales de juegos.

SHA-256 del bloque: `3762a89da55d116cb66da6a8d32b2a04973b13b0d11587e9058ade7aaa56da80`.

```ts
/** Frozen cross-module API. Only the integrator changes this file. */
export const LIMITS = {
  members: 6, hostGraceMs: 60_000, leaveAckMs: 1_500,
  messageBytes: 65_536, queueMessages: 128, queueBytes: 1_048_576,
  strokePoints: 512, boardOperations: 2_000, furniture: 32,
  worldWidth: 768, worldHeight: 432,
  // Whiteboard: the board is unbounded in practice; coordinates are world
  // units within ±boardExtent, and a text note is at most boardText chars.
  boardExtent: 20_000, boardText: 280,
  // One shared-activity message (a game view, a drawing, the project list),
  // kept well under messageBytes once wrapped in its envelope.
  appData: 56_000,
} as const;

export type AppChannel = 'projects';
export interface AppMessage { channel: AppChannel; from: IdentityId; data: string }

export type IdentityId = string;
export interface PublicIdentity { fingerprint: IdentityId; publicKey: string; displayName: string; color: string }
export interface LocalIdentity { public: PublicIdentity; privateKey: CryptoKey }
export interface EncryptedIdentity {
  v: 1; kdf: 'PBKDF2-SHA256'; iterations: number; salt: string; iv: string;
  ciphertext: string; publicIdentity: PublicIdentity;
}
export interface Contact { schemaVersion: 1; identity: PublicIdentity; friendCode: string }
export type HouseAccess = 'open' | 'ask' | 'locked';
export type FurnitureKind = 'desk' | 'bookshelf' | 'board' | 'plant' | 'table' | 'frame' | 'cabinet';
export interface Furniture { rotation?: 0 | 90 | 180 | 270; id: string; kind: FurnitureKind; x: number; y: number; publicAlias: string }
export interface PublicHouse { ownerId: IdentityId; revision: number; name: string; access: HouseAccess; theme: 'mint' | 'peach'; furniture: Furniture[] }
export interface Position { areaId?: 'residential' | 'community' | 'study'; x: number; y: number; direction: 'up' | 'down' | 'left' | 'right'; moving: boolean }
export interface Member { identity: PublicIdentity; endpoint: string; slot: number; connected: boolean; houseId: IdentityId | null; position: Position }
export interface JoinRequest { requestId: string; identity: PublicIdentity }
export interface VisitRequest { requestId: string; identity: PublicIdentity; houseId: IdentityId }
export type SessionPhase = 'IDLE' | 'SIGNALING' | 'CONNECTING' | 'AUTHENTICATING' | 'PENDING_APPROVAL' | 'JOINED' | 'RECONNECTING' | 'DENIED' | 'EXPIRED_INVITE' | 'NETWORK_FAILED' | 'KICKED' | 'CLOSED';
export interface BoardPoint { x: number; y: number }
export interface BoardStroke { id: string; author: IdentityId; boardId: IdentityId; seq: number; color: string; width: number; tool: 'pen' | 'line' | 'rectangle' | 'text'; points: BoardPoint[]; deleted: boolean; text?: string }
export type ScreenPhase = 'OFF' | 'REQUESTING_OS_PERMISSION' | 'CAPTURING_LOCAL' | 'NEGOTIATING' | 'SENDING' | 'DENIED' | 'NOT_SUPPORTED' | 'SOURCE_ENDED' | 'NETWORK_FAILED';
export interface RemoteMedia { identityId: IdentityId; kind: 'audio' | 'screen'; stream: MediaStream }
export interface MediaView { micEnabled: boolean; muted: boolean; deafened: boolean; pushToTalk: boolean; talking: boolean; screenPhase: ScreenPhase; localScreen: MediaStream | null; remote: RemoteMedia[]; audience: string; error: string | null }
export interface NetworkView {
  phase: SessionPhase; isHost: boolean; hostId: IdentityId | null; sessionId: string | null; invite: string | null;
  members: Member[]; houses: PublicHouse[]; pendingJoins: JoinRequest[]; pendingVisits: VisitRequest[];
  strokes: BoardStroke[]; hostGraceRemainingMs: number | null; error: string | null; media: MediaView;
  /** Private voice: who you asked, whether they asked you back, and who is asking you. */
  privateCall: { with: IdentityId | null; active: boolean; incoming: IdentityId[] };
}
export interface VillageActions {
  openVillage(): Promise<void>; joinVillage(invite: string): Promise<void>;
  decideJoin(requestId: string, accept: boolean): void; rotateInvite(): void;
  leave(): Promise<void>; visitHouse(ownerId: IdentityId): void;
  decideVisit(requestId: string, accept: boolean): void; leaveHouse(): void;
  publishHouse(house: PublicHouse): void; move(position: Position): void;
  sendStroke(stroke: BoardStroke): void; deleteStroke(strokeId: string): void;
  kickMember(identityId: IdentityId): void; kickVisitor(identityId: IdentityId): void;
  toggleMicrophone(): Promise<void>; setMuted(muted: boolean): void;
  setDeafened(deafened: boolean): void; setPushToTalk(enabled: boolean): void; setTalking(talking: boolean): void;
  startScreen(): Promise<void>; stopScreen(): void;
  /** Ask for (or accept) a private call with one person; null returns to public voice. */
  requestPrivate(identityId: IdentityId | null): void;
  /** Send a shared-activity message to one member, or to everyone with `to: null`. */
  sendApp(channel: AppChannel, to: IdentityId | null, data: string): boolean;
  /** Receive shared-activity messages from other members; returns an unsubscribe. */
  onApp(listener: (message: AppMessage) => void): () => void;
}
export interface DiagnosticEntry { test: string; status: 'PASS' | 'FAIL' | 'UNVERIFIED' | 'UNSUPPORTED'; detail: string }
export interface AppView {
  identity: PublicIdentity; network: NetworkView; ownHouse: PublicHouse;
  contacts: Contact[]; friendCode: string; storage: 'sqlite' | 'indexeddb' | 'memory';
  identitySaved: boolean; lockedIdentity: boolean; notice: string | null;
  diagnostics: DiagnosticEntry[]; editorText: string;
}
export interface AppActions extends VillageActions {
  updateProfile(displayName: string, color: string): Promise<void>;
  updateOwnHouse(house: PublicHouse): void; copyInvite(): Promise<void>;
  saveIdentity(passphrase: string): Promise<void>; unlockIdentity(passphrase: string): Promise<void>;
  exportContact(): void; importContact(file: File): Promise<void>; rotateFriendCode(): void;
  openLocalFile(furnitureId: string): Promise<void>; saveEditor(text: string): Promise<void>;
  exportEditor(text: string): void; exportBoard(canvas: HTMLCanvasElement): void;
  runDiagnostic(kind: 'capabilities' | 'microphone' | 'screen' | 'stop' | 'loopback'): Promise<void>;
  dismissNotice(): void;
}
```

### app/src/protocol/schema.ts — contratos autenticados

Esquemas de referencia; extender el enum de canales en fase 2.

SHA-256 del bloque: `5b0f26c1a6cf1bc8d87a085924396a385f3af953a013bd08df50bae96855a7c3`.

```ts
import { z } from 'zod';
import { LIMITS } from './types';

export const fingerprintSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const endpointSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{1,80}$/);
const nonce = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const integer = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const color = z.string().regex(/^#[a-fA-F0-9]{6}$/);
export const identitySchema = z.strictObject({
  fingerprint: fingerprintSchema, publicKey: z.string().min(100).max(256),
  displayName: z.string().trim().min(1).max(40), color,
});
export const positionSchema = z.strictObject({
  areaId: z.enum(['residential', 'community', 'study']).optional(),
  x: z.number().min(0).max(LIMITS.worldWidth), y: z.number().min(0).max(LIMITS.worldHeight),
  direction: z.enum(['up', 'down', 'left', 'right']), moving: z.boolean(),
});
export const houseSchema = z.strictObject({
  ownerId: fingerprintSchema, revision: integer, name: z.string().trim().min(1).max(60),
  access: z.enum(['open', 'ask', 'locked']), theme: z.enum(['mint', 'peach']),
  furniture: z.array(z.strictObject({
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
    id: idSchema, kind: z.enum(['desk', 'bookshelf', 'board', 'plant', 'table', 'frame', 'cabinet']),
    x: z.number().min(0).max(736), y: z.number().min(0).max(400), publicAlias: z.string().max(60),
  })).max(LIMITS.furniture),
}).refine(house => new Set(house.furniture.map(item => item.id)).size === house.furniture.length);
export const memberSchema = z.strictObject({
  identity: identitySchema, endpoint: endpointSchema, slot: z.number().int().min(0).max(5),
  connected: z.boolean(), houseId: fingerprintSchema.nullable(), position: positionSchema,
});
const boardCoordinate = z.number().min(-LIMITS.boardExtent).max(LIMITS.boardExtent);
export const strokeSchema = z.strictObject({
  id: idSchema, author: fingerprintSchema, boardId: fingerprintSchema, seq: integer,
  color, width: z.number().min(1).max(32), tool: z.enum(['pen', 'line', 'rectangle', 'text']),
  points: z.array(z.strictObject({ x: boardCoordinate, y: boardCoordinate })).min(1).max(LIMITS.strokePoints),
  deleted: z.boolean(),
  // Only text notes carry text, and every text note must carry some.
  text: z.string().min(1).max(LIMITS.boardText).optional(),
}).refine((stroke) => (stroke.tool === 'text') === (stroke.text !== undefined), { message: 'text belongs to text notes only' });
const signature = z.string().regex(/^[A-Za-z0-9_-]{86}$/);
export const signedHouseSchema = z.strictObject({ house: houseSchema, signature });
export const signedStrokeSchema = z.strictObject({ stroke: strokeSchema, signature });
export const appChannelSchema = z.enum(['projects']);
const appDataSchema = z.string().min(2).max(LIMITS.appData);
export const inviteSchema = z.strictObject({
  v: z.literal(1), sessionId: idSchema, epoch: integer.min(1), hostFingerprint: fingerprintSchema,
  endpoint: endpointSchema, generation: integer.min(1), secret: nonce, expiresAt: integer,
});
export type Invite = z.infer<typeof inviteSchema>;
export type SignedHouse = z.infer<typeof signedHouseSchema>;
export type SignedStroke = z.infer<typeof signedStrokeSchema>;
const intent = z.enum(['join', 'resume', 'mesh']);
export const helloSchema = z.strictObject({
  v: z.literal(1), kind: z.literal('auth.hello'), sessionId: idSchema, epoch: integer.min(1),
  intent, identity: identitySchema, from: endpointSchema, to: endpointSchema, nonce,
  generation: integer, secret: z.union([nonce, z.literal('')]),
});
export const transcriptSchema = z.strictObject({
  v: z.literal(1), sessionId: idSchema, epoch: integer.min(1), intent,
  initiator: fingerprintSchema, responder: fingerprintSchema, from: endpointSchema, to: endpointSchema,
  initiatorNonce: nonce, responderNonce: nonce, generation: integer, secret: z.union([nonce, z.literal('')]),
});
export type Hello = z.infer<typeof helloSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export const payloadSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('join.decision'), accepted: z.boolean() }),
  z.strictObject({ type: z.literal('session.snapshot'), revision: integer, members: z.array(memberSchema).min(1).max(6), houses: z.array(signedHouseSchema).max(6) }),
  z.strictObject({ type: z.literal('session.heartbeat'), reply: z.boolean() }),
  z.strictObject({ type: z.literal('session.leave'), requestId: idSchema }),
  z.strictObject({ type: z.literal('session.leaveAck'), requestId: idSchema }),
  z.strictObject({ type: z.literal('session.closed') }),
  z.strictObject({ type: z.literal('session.kick'), identityId: fingerprintSchema }),
  z.strictObject({ type: z.literal('house.publish'), document: signedHouseSchema }),
  z.strictObject({ type: z.literal('house.visit'), requestId: idSchema, ownerId: fingerprintSchema }),
  z.strictObject({ type: z.literal('house.visit.request'), requestId: idSchema, visitorId: fingerprintSchema, ownerId: fingerprintSchema }),
  z.strictObject({ type: z.literal('house.visit.decision'), requestId: idSchema, accepted: z.boolean() }),
  z.strictObject({ type: z.literal('house.visit.result'), requestId: idSchema, accepted: z.boolean() }),
  z.strictObject({ type: z.literal('house.leave') }),
  z.strictObject({ type: z.literal('house.kick'), identityId: fingerprintSchema }),
  z.strictObject({ type: z.literal('player.position'), position: positionSchema }),
  z.strictObject({ type: z.literal('player.relay'), identityId: fingerprintSchema, position: positionSchema }),
  z.strictObject({ type: z.literal('board.stroke'), document: signedStrokeSchema }),
  z.strictObject({ type: z.literal('board.sync.request'), boardId: fingerprintSchema, cursor: integer.max(2000) }),
  z.strictObject({ type: z.literal('board.sync.response'), boardId: fingerprintSchema, document: signedStrokeSchema.nullable(), next: integer.max(2000).nullable() }),
  z.strictObject({ type: z.literal('media.token'), token: nonce }),
  z.strictObject({ type: z.literal('media.received'), kind: z.enum(['audio', 'screen']) }),
  // Who the sender wants a private call with, or null for public. A private
  // call only opens when two players name each other.
  z.strictObject({ type: z.literal('media.private'), with: fingerprintSchema.nullable() }),
  // Shared activities (games, group projects). Members address the host,
  // which delivers to one member (`to`) or everyone (`to: null`) and names
  // the real sender, so a member can never speak for someone else.
  z.strictObject({ type: z.literal('app.send'), channel: appChannelSchema, to: fingerprintSchema.nullable(), data: appDataSchema }),
  z.strictObject({ type: z.literal('app.relay'), channel: appChannelSchema, from: fingerprintSchema, data: appDataSchema }),
]);
export type Payload = z.infer<typeof payloadSchema>;
export const eventSchema = z.strictObject({
  v: z.literal(1), kind: z.literal('event'), sessionId: idSchema, epoch: integer.min(1),
  sender: fingerprintSchema, seq: integer.min(1), payload: payloadSchema,
});
export const wireSchema = z.discriminatedUnion('kind', [
  helloSchema,
  z.strictObject({ v: z.literal(1), kind: z.literal('auth.challenge'), identity: identitySchema, transcript: transcriptSchema, signature }),
  z.strictObject({ v: z.literal(1), kind: z.literal('auth.proof'), signature }),
  z.strictObject({ v: z.literal(1), kind: z.literal('auth.ok'), signature }),
  eventSchema,
]);
export type WireMessage = z.infer<typeof wireSchema>;
/**
 * Where a media call belongs: an outdoor area, one house, or a private pair.
 * Receivers only accept calls tagged with the room they are in, so audio can
 * never leak from a house into the village or out of a private conversation.
 */
export const roomSchema = z.string().regex(/^(village|area:(?:residential|community|study)|house:[a-f0-9]{64}|pair:[a-f0-9]{64}:[a-f0-9]{64})$/);
export const mediaMetadataSchema = z.strictObject({
  v: z.literal(2), kind: z.enum(['audio', 'screen']), sessionId: idSchema,
  epoch: integer.min(1), room: roomSchema, identityId: fingerprintSchema, token: nonce,
});
export type MediaMetadata = z.infer<typeof mediaMetadataSchema>;
export function parseWire(raw: unknown): WireMessage {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > LIMITS.messageBytes) throw new Error('Mensaje fuera de límites.');
  return wireSchema.parse(JSON.parse(raw));
}
```

### app/src/world/areas.ts — geometría y renderers clásicos

Variante completa con objetos/renderer de juegos y consola de IA retirados. Mantiene coordenadas, apariciones, portales, pizarra, proyectos, apuntes, tarjetas manuales y mesa de voz.

SHA-256 del bloque: `78516c396452af299d2b7aab6a3267f30b261d0a3840c0174334dd59af739805`.

```ts
import { LIMITS, type Position } from '../protocol/types';
import {
  PALETTE, animClock, contactShadow, drawAvatar, drawTree, fill,
  glowPool, hash01, ipx, paintSceneFade, plate, reducedMotion, seed, shade, text, trackCharacter,
} from '../ui/art';
import type { DrawPerson } from './draw';
import { InteractiveObjectRegistry, type InteractiveObjectConfig } from './interactive-objects';
import type { Rect } from './model';

/** Escenas y portales de esta distribución. */

export type BuiltinAreaId = 'residential' | 'community' | 'study';

export interface AreaPortal {
  id: string;
  fromArea: BuiltinAreaId;
  toArea: BuiltinAreaId;
  label: string;
  prompt: string;
  rect: Rect;
  spawnAtTarget: Position;
}

export interface WorldAreaDefinition {
  id: BuiltinAreaId;
  displayName: string;
  subtitle: string;
  bounds: Rect;
  defaultSpawn: Position;
  portals: readonly AreaPortal[];
  lampPositions: readonly { x: number; y: number }[];
  isInterior: boolean;
}

export const WORLD_AREAS: Record<BuiltinAreaId, WorldAreaDefinition> = {
  residential: {
    id: 'residential',
    displayName: 'La aldea',
    subtitle: 'Seis parcelas residenciales conectadas con la Plaza Comunitaria y la Biblioteca.',
    bounds: { x: 0, y: 0, w: LIMITS.worldWidth, h: LIMITS.worldHeight },
    defaultSpawn: { x: 384, y: 215, direction: 'down', moving: false },
    portals: [
      {
        id: 'portal:res-to-community',
        fromArea: 'residential',
        toArea: 'community',
        label: 'Plaza Comunitaria →',
        prompt: 'E · Ir a Plaza Comunitaria',
        rect: { x: 716, y: 192, w: 50, h: 52 },
        spawnAtTarget: { x: 72, y: 220, direction: 'right', moving: false },
      },
      {
        id: 'portal:res-to-study',
        fromArea: 'residential',
        toArea: 'study',
        label: '← Biblioteca y Estudio',
        prompt: 'E · Ir a Biblioteca de Estudio',
        rect: { x: 2, y: 192, w: 50, h: 52 },
        spawnAtTarget: { x: 696, y: 224, direction: 'left', moving: false },
      },
    ],
    lampPositions: [
      { x: 238, y: 188 },
      { x: 530, y: 188 },
    ],
    isInterior: false,
  },
  community: {
    id: 'community',
    displayName: 'Plaza Comunitaria',
    subtitle: 'Centro social del vecindario: Hombres Lobo, Gartic Phone, pizarra común y proyectos.',
    bounds: { x: 0, y: 0, w: LIMITS.worldWidth, h: LIMITS.worldHeight },
    defaultSpawn: { x: 384, y: 270, direction: 'down', moving: false },
    portals: [
      {
        id: 'portal:community-to-res',
        fromArea: 'community',
        toArea: 'residential',
        label: '← Barrio Residencial',
        prompt: 'E · Volver al Barrio Residencial',
        rect: { x: 4, y: 192, w: 54, h: 54 },
        spawnAtTarget: { x: 690, y: 215, direction: 'left', moving: false },
      },
      {
        id: 'portal:community-to-study',
        fromArea: 'community',
        toArea: 'study',
        label: 'Biblioteca de Estudio →',
        prompt: 'E · Entrar a la Biblioteca de Estudio',
        rect: { x: 710, y: 192, w: 54, h: 54 },
        spawnAtTarget: { x: 74, y: 224, direction: 'right', moving: false },
      },
    ],
    lampPositions: [
      { x: 190, y: 150 },
      { x: 578, y: 150 },
      { x: 190, y: 310 },
      { x: 578, y: 310 },
    ],
    isInterior: false,
  },
  study: {
    id: 'study',
    displayName: 'Biblioteca y Taller de Estudio',
    subtitle: 'Espacio tranquilo para apuntes seguros, tarjetas de memoria en grupo, pizarras e IA local.',
    bounds: { x: 28, y: 68, w: 712, h: 338 },
    defaultSpawn: { x: 384, y: 330, direction: 'up', moving: false },
    portals: [
      {
        id: 'portal:study-to-community',
        fromArea: 'study',
        toArea: 'community',
        label: '← Plaza Comunitaria',
        prompt: 'E · Salir a Plaza Comunitaria',
        rect: { x: 32, y: 196, w: 52, h: 54 },
        spawnAtTarget: { x: 680, y: 220, direction: 'left', moving: false },
      },
      {
        id: 'portal:study-to-res',
        fromArea: 'study',
        toArea: 'residential',
        label: 'Barrio Residencial →',
        prompt: 'E · Ir al Barrio Residencial',
        rect: { x: 684, y: 196, w: 52, h: 54 },
        spawnAtTarget: { x: 76, y: 215, direction: 'right', moving: false },
      },
    ],
    lampPositions: [
      { x: 160, y: 140 },
      { x: 384, y: 210 },
      { x: 608, y: 140 },
    ],
    isInterior: true,
  },
};

export const DEFAULT_AREA_OBJECTS: readonly InteractiveObjectConfig[] = [
  // ---------------------------------------------------------------------------
  // Central Community Area ("Plaza Comunitaria") interactive stations
  // ---------------------------------------------------------------------------


  {
    id: 'community:shared-board',
    areaId: 'community',
    kind: 'whiteboard',
    defaultLabel: 'Gran Pizarra Comunitaria',
    displayName: 'Pizarra de la Plaza',
    description: 'Pizarra colaborativa persistente e independiente de la Plaza Comunitaria.',
    promptKey: 'E · Pizarra de la Plaza',
    x: 332,
    y: 54,
    w: 104,
    h: 38,
    layer: 'wall',
    hasCollision: true,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedBoardId: 'board:community-plaza',
    state: {},
    revision: 1,
  },
  {
    id: 'community:project-station',
    areaId: 'community',
    kind: 'computer_project',
    defaultLabel: 'Terminal de Proyectos',
    displayName: 'Estación de Proyectos',
    description: 'Proyectos del grupo: abre el repositorio o únete a la sesión Live Share en VS Code.',
    promptKey: 'E · Proyectos en VS Code',
    x: 132,
    y: 304,
    w: 78,
    h: 48,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 44,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'host_only',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedProjectId: 'project:community-main',
    state: {},
    revision: 1,
  },
  {
    id: 'community:voice-gazebo',
    areaId: 'community',
    kind: 'voice_table',
    defaultLabel: 'Mesa de Charla y Pantalla',
    displayName: 'banco de Charla HD',
    description: 'Rincón para conversar por voz o ver pantallas compartidas en grupo.',
    promptKey: 'E · Voz y Pantalla',
    x: 548,
    y: 304,
    w: 80,
    h: 48,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 44,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'host_only',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    state: {},
    revision: 1,
  },

  // ---------------------------------------------------------------------------
  // Creative and Study Area ("Biblioteca y Taller de Estudio") stations
  // ---------------------------------------------------------------------------
  {
    id: 'study:board-main',
    areaId: 'study',
    kind: 'whiteboard',
    defaultLabel: 'Pizarra de la Biblioteca',
    displayName: 'Pizarra de Seminario',
    description: 'Pizarra matemática e interactiva independiente de la Biblioteca de Estudio.',
    promptKey: 'E · Pizarra de Biblioteca',
    x: 224,
    y: 74,
    w: 98,
    h: 34,
    layer: 'wall',
    hasCollision: false,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedBoardId: 'board:study-library',
    state: {},
    revision: 1,
  },
  {
    id: 'study:board-secondary',
    areaId: 'study',
    kind: 'whiteboard',
    defaultLabel: 'Pizarra de Fórmulas',
    displayName: 'Pizarra de Cálculo',
    description: 'Segunda pizarra independiente para comparar demostraciones sin sobrescribir la principal.',
    promptKey: 'E · Pizarra de Cálculo',
    x: 446,
    y: 74,
    w: 98,
    h: 34,
    layer: 'wall',
    hasCollision: false,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedBoardId: 'board:study-calculus',
    state: {},
    revision: 1,
  },
  {
    id: 'study:notes-archive',
    areaId: 'study',
    kind: 'bookshelf_notes',
    defaultLabel: 'Archivo de Apuntes Seguros',
    displayName: 'Cuadernos y Apuntes',
    description: 'Sistema de apuntes Markdown + LaTeX no ejecutable con cuadernos privados y compartidos.',
    promptKey: 'E · Abrir Apuntes Seguros',
    x: 96,
    y: 86,
    w: 76,
    h: 58,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedNotebookId: 'notebook:general',
    state: {},
    revision: 1,
  },
  {
    id: 'study:flashcard-podium',
    areaId: 'study',
    kind: 'flashcard_podium',
    defaultLabel: 'Mesa de Estudio con Tarjetas',
    displayName: 'Sesión de Flashcards',
    description: 'Mesa central para repasar mazos de flashcards en solitario o en sesión multijugador.',
    promptKey: 'E · Sesión de Flashcards',
    x: 334,
    y: 196,
    w: 100,
    h: 58,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 48,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    state: {},
    revision: 1,
  },

  {
    id: 'study:project-workbench',
    areaId: 'study',
    kind: 'computer_project',
    defaultLabel: 'Taller de proyectos',
    displayName: 'Taller de Proyectos',
    description: 'Proyectos del grupo: abre el repositorio o únete a la sesión Live Share en VS Code.',
    promptKey: 'E · Proyectos en VS Code',
    x: 136,
    y: 298,
    w: 84,
    h: 50,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    linkedProjectId: 'project:study-lab',
    state: {},
    revision: 1,
  },
  {
    id: 'study:quiet-desk',
    areaId: 'study',
    kind: 'study_desk',
    defaultLabel: 'Pupitre de Lectura',
    displayName: 'Pupitre Pomodoro',
    description: 'Pupitre tranquilo para planificar sesiones Pomodoro de 25 minutos y tomar notas.',
    promptKey: 'E · Pupitre de Estudio',
    x: 546,
    y: 298,
    w: 84,
    h: 50,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 46,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'public',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    state: {},
    revision: 1,
  },
];

export function closestPortal(areaId: BuiltinAreaId, pos: Position, maxDistance = 36): AreaPortal | null {
  const area = WORLD_AREAS[areaId];
  if (!area) return null;
  let best: AreaPortal | null = null;
  let bestDist = maxDistance;
  for (const portal of area.portals) {
    const nx = Math.max(portal.rect.x, Math.min(pos.x, portal.rect.x + portal.rect.w));
    const ny = Math.max(portal.rect.y, Math.min(pos.y, portal.rect.y + portal.rect.h));
    const d = Math.hypot(pos.x - nx, pos.y - ny);
    if (d <= bestDist) {
      bestDist = d;
      best = portal;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Pixel-Art Renderer for Central Community Area & Creative Study Area
// ---------------------------------------------------------------------------

const W = 768;
const H = 432;
const [, moss1, moss2, moss3, moss4, moss5] = PALETTE.moss;
const [earth0, earth1, earth2, earth3, earth4] = PALETTE.earth;
const [ember0, ember1, ember2, ember3, ember4] = PALETTE.ember;
const [tide0, tide1, tide2, tide3] = PALETTE.tide;

interface Sprite {
  baseline: number;
  paint: () => void;
}

export function drawPortalSign(ctx: CanvasRenderingContext2D, portal: AreaPortal, nearby: boolean): void {
  const { x, y, w, h } = portal.rect;
  const cx = x + w / 2;
  const cy = y + h / 2;

  // Cobblestone threshold pad
  fill(ctx, earth1, x + 2, y + 6, w - 4, h - 12);
  fill(ctx, earth3, x + 5, y + 9, w - 10, h - 18);
  fill(ctx, ember3, x + 8, cy - 2, w - 16, 4);

  // Wooden signpost
  fill(ctx, earth0, cx - 3, y - 10, 6, 20);
  const labelW = Math.max(88, Math.min(148, portal.label.length * 5.6 + 16));
  const lx = Math.max(6, Math.min(W - labelW - 6, cx - labelW / 2));
  plate(
    ctx,
    lx,
    y - 24,
    labelW,
    17,
    nearby ? ember4 : PALETTE.paper[3],
    nearby ? ember0 : earth0,
  );
  text(ctx, portal.label, lx + labelW / 2, y - 12, PALETTE.paper[0], 8.5);
}

function paintStationObject(
  ctx: CanvasRenderingContext2D,
  obj: InteractiveObjectConfig,
  registry: InteractiveObjectRegistry,
  nearby: boolean,
  selected: boolean,
  time: number,
): void {
  const { x, y, w, h } = obj;
  if (obj.layer !== 'wall') {
    contactShadow(ctx, x + w / 2, y + h - 2, w * 0.46, 0.32);
  }

  const customSprite = registry.getDecodedSprite(obj.id);
  const baseColor = obj.customColor || earth2;
  const baseDark = shade(baseColor, -28);
  const baseLit = shade(baseColor, 20);

  if (customSprite) {
    ctx.drawImage(customSprite, ipx(x), ipx(y), ipx(w), ipx(h));
  } else {
    switch (obj.kind) {


      case 'whiteboard': {
        fill(ctx, baseDark, x, y, w, h);
        fill(ctx, baseLit, x + 2, y + 2, w - 4, 4);
        fill(ctx, '#fbf8ee', x + 5, y + 6, w - 10, h - 12);
        fill(ctx, tide1, x + 12, y + 12, w * 0.42, 3);
        fill(ctx, ember1, x + 12, y + 18, w * 0.58, 3);
        fill(ctx, moss2, x + 12, y + 24, w * 0.3, 3);
        fill(ctx, baseColor, x + 3, y + h - 5, w - 6, 4);
        break;
      }
      case 'computer_project': {
        fill(ctx, baseDark, x + 6, y + 22, 7, h - 22);
        fill(ctx, baseDark, x + w - 13, y + 22, 7, h - 22);
        fill(ctx, baseColor, x, y + 12, w, 14);
        fill(ctx, baseLit, x, y + 12, w, 4);
        // Dual monitors
        for (const mx of [x + 10, x + w - 38]) {
          fill(ctx, '#223634', mx, y - 2, 28, 16);
          fill(ctx, '#162624', mx + 2, y, 24, 12);
          fill(ctx, '#6fd1b8', mx + 4, y + 2, 16, 3);
          fill(ctx, '#f0b86e', mx + 4, y + 7, 12, 2);
          fill(ctx, '#223634', mx + 11, y + 14, 6, 3);
        }
        break;
      }
      case 'bookshelf_notes': {
        fill(ctx, shade(earth0, -10), x, y, w, h);
        fill(ctx, earth1, x + 3, y + 3, w - 6, h - 6);
        const bookColors = [ember1, tide1, ember3, moss3, '#7a6ba8'];
        for (let row = 0; row < 3; row++) {
          const sy = y + 8 + row * 16;
          fill(ctx, earth0, x + 5, sy + 11, w - 10, 3);
          for (let col = 0; col < 7; col++) {
            fill(ctx, bookColors[(row + col) % bookColors.length], x + 7 + col * 9, sy + 2, 7, 9);
          }
        }
        break;
      }
      case 'flashcard_podium': {
        fill(ctx, baseDark, x + 8, y + 26, 8, h - 26);
        fill(ctx, baseDark, x + w - 16, y + 26, 8, h - 26);
        fill(ctx, baseColor, x, y + 8, w, 24);
        fill(ctx, baseLit, x + 2, y + 8, w - 4, 5);
        // Flashcard decks on the table
        for (const cx of [x + 16, x + 42, x + 68]) {
          fill(ctx, PALETTE.paper[3], cx, y + 13, 18, 12);
          fill(ctx, ember2, cx + 2, y + 15, 14, 3);
        }
        glowPool(ctx, x + w / 2, y + h / 2, 42, '255,220,150');
        break;
      }

      default: {
        fill(ctx, baseDark, x + 4, y + 16, w - 8, h - 16);
        fill(ctx, baseColor, x, y + 8, w, 14);
        fill(ctx, baseLit, x, y + 8, w, 4);
        break;
      }
    }
  }

  if (nearby || selected) {
    ctx.save();
    ctx.strokeStyle = selected ? ember3 : 'rgba(255, 228, 156, 0.92)';
    ctx.lineWidth = 2;
    if (selected) ctx.setLineDash([5, 3]);
    ctx.strokeRect(ipx(x - 3), ipx(y - 3), ipx(w + 6), ipx(h + 6));
    ctx.restore();
  }

  // Nameplate below or above station
  const label = obj.displayName.slice(0, 26);
  ctx.font = '700 8.5px Inter, ui-sans-serif, system-ui, sans-serif';
  const tw = Math.min(148, Math.ceil(ctx.measureText(label).width) + 14);
  const ly = obj.layer === 'wall' ? y + h + 3 : y - 17;
  plate(
    ctx,
    x + w / 2 - tw / 2,
    ly,
    tw,
    14,
    nearby ? ember4 : 'rgba(251,244,226,0.94)',
    'rgba(30,55,48,0.55)',
  );
  text(ctx, label, x + w / 2, ly + 10, PALETTE.paper[0], 8.5);
}

export function drawCommunityPlaza(
  ctx: CanvasRenderingContext2D,
  people: readonly DrawPerson[],
  registry: InteractiveObjectRegistry,
  nearbyObjectId: string | null,
  selectedObjectId: string | null,
  nearbyPortalId: string | null,
  dt = 0,
): void {
  ctx.imageSmoothingEnabled = false;
  const calm = reducedMotion();
  const time = calm ? 0 : animClock();

  // Lush meadow background
  fill(ctx, moss3, 0, 0, W, H);
  for (let i = 0; i < 20; i++) {
    const n = hash01(`c_patch_${i}`);
    const m = hash01(`c_patchb_${i}`);
    ctx.fillStyle = n > 0.5 ? 'rgba(124,192,119,0.08)' : 'rgba(47,90,62,0.07)';
    ctx.beginPath();
    ctx.ellipse(m * W, n * H, 80, 42, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // East-West grand cobblestone avenue + central circular plaza
  fill(ctx, earth1, 0, 190, W, 56);
  fill(ctx, earth3, 0, 194, W, 48);

  // Central stone courtyard
  fill(ctx, earth1, 108, 66, 552, 304);
  fill(ctx, earth3, 114, 72, 540, 292);
  fill(ctx, shade(earth4, 8), 124, 80, 520, 276);

  // Decorative mosaic compass in the courtyard
  ctx.strokeStyle = shade(earth2, -8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(384, 210, 118, 72, 0, 0, Math.PI * 2);
  ctx.stroke();

  // Decorative pond on the bottom center
  fill(ctx, tide0, 330, 304, 108, 48);
  fill(ctx, tide2, 334, 308, 100, 40);
  fill(ctx, tide3, 344, 314, 36, 10);

  // Banner header on the north wall of the plaza
  plate(ctx, 264, 12, 240, 24, PALETTE.paper[3], earth0);
  text(ctx, 'PLAZA COMUNITARIA · PROYECTOS', 384, 27, PALETTE.paper[0], 9.5);

  const area = WORLD_AREAS.community;
  for (const portal of area.portals) {
    drawPortalSign(ctx, portal, portal.id === nearbyPortalId);
  }

  const sprites: Sprite[] = [];
  const trees = [
    { x: 64, y: 92 },
    { x: 704, y: 92 },
    { x: 64, y: 344 },
    { x: 704, y: 344 },
  ];
  for (const t of trees) {
    const sway = calm ? 0 : Math.sin(time * 0.9 + t.x) * 1.4;
    sprites.push({
      baseline: t.y + 12,
      paint: () => drawTree(ctx, t.x, t.y, 1.0, sway, 0),
    });
  }

  for (const obj of registry.listByArea('community')) {
    sprites.push({
      baseline: obj.layer === 'wall' ? obj.y : obj.y + obj.h,
      paint: () =>
        paintStationObject(
          ctx,
          obj,
          registry,
          obj.id === nearbyObjectId,
          obj.id === selectedObjectId,
          time,
        ),
    });
  }

  for (const person of people) {
    const id = person.identity.fingerprint || person.identity.displayName;
    const at = trackCharacter(id, person.position, dt, !person.isOwn, 'community');
    sprites.push({
      baseline: at.y,
      paint: () => drawAvatar(ctx, at.x, at.y, person.identity, person.position, person.isOwn),
    });
  }

  sprites.sort((a, b) => a.baseline - b.baseline);
  for (const s of sprites) s.paint();

  paintSceneFade(ctx, 'area:community', W, H);
}

export function drawStudyLibrary(
  ctx: CanvasRenderingContext2D,
  people: readonly DrawPerson[],
  registry: InteractiveObjectRegistry,
  nearbyObjectId: string | null,
  selectedObjectId: string | null,
  nearbyPortalId: string | null,
  dt = 0,
): void {
  ctx.imageSmoothingEnabled = false;
  const calm = reducedMotion();
  const time = calm ? 0 : animClock();

  // Warm library wood & sage panelling
  fill(ctx, '#bfd0ba', 0, 0, W, 72);
  fill(ctx, '#39614c', 0, 66, W, 6);
  fill(ctx, '#a8814f', 0, 72, W, H - 72);

  // Horizontal floorboards
  for (let y = 72; y < H; y += 18) {
    const band = Math.round((y - 72) / 18);
    fill(ctx, band % 2 ? '#b18956' : '#9f7847', 0, y, W, 18);
  }

  // Grand green study carpet in the center
  fill(ctx, '#264a3a', 190, 148, 388, 154);
  fill(ctx, '#356650', 198, 156, 372, 138);
  fill(ctx, '#d9c398', 206, 164, 356, 4);
  fill(ctx, '#d9c398', 206, 282, 356, 4);

  // Library header sign
  plate(ctx, 248, 10, 272, 24, PALETTE.paper[3], '#39614c');
  text(ctx, 'BIBLIOTECA Y TALLER DE ESTUDIO', 384, 25, PALETTE.paper[0], 10);

  const area = WORLD_AREAS.study;
  for (const portal of area.portals) {
    drawPortalSign(ctx, portal, portal.id === nearbyPortalId);
  }

  const sprites: Sprite[] = [];
  for (const obj of registry.listByArea('study')) {
    sprites.push({
      baseline: obj.layer === 'wall' ? obj.y : obj.y + obj.h,
      paint: () =>
        paintStationObject(
          ctx,
          obj,
          registry,
          obj.id === nearbyObjectId,
          obj.id === selectedObjectId,
          time,
        ),
    });
  }

  for (const person of people) {
    const id = person.identity.fingerprint || person.identity.displayName;
    const at = trackCharacter(id, person.position, dt, !person.isOwn, 'study');
    sprites.push({
      baseline: at.y,
      paint: () => drawAvatar(ctx, at.x, at.y, person.identity, person.position, person.isOwn),
    });
  }

  sprites.sort((a, b) => a.baseline - b.baseline);
  for (const s of sprites) s.paint();

  paintSceneFade(ctx, 'area:study', W, H);
}
```

### app/src/world/interactive-objects.ts — tipos y registro clásicos

Variante del registro sin tipos/validadores de estaciones excluidas. Cargar solamente objetos de esta distribución.

SHA-256 del bloque: `79b719caaddc243804c322570ba91fc5b4501acc5b86a92c580eccddf8717c2b`.

```ts
import { z } from 'zod';
import type { Rect } from './model';

/**
 * Part 3 — Extensible Interactive Object System
 *
 * Every interactive element in the world (furniture, community stations,
 * whiteboards, game tables, study desks, portals, lamps, etc.) is
 * represented through a clean, extensible object abstraction with stable IDs,
 * editable display names, optional custom sprites, permissions, and persistent state.
 */

export type WorldAreaKind = 'residential' | 'community' | 'study' | 'house';

export type InteractiveObjectKind =
  | 'whiteboard'
  | 'computer_project'
  | 'bookshelf_notes'
  | 'flashcard_podium'
  | 'study_desk'
  | 'voice_table'
  | 'lamp'
  | 'plant'
  | 'frame'
  | 'cabinet'
  | 'portal';

export type ObjectPermissionScope =
  | 'public'
  | 'participants'
  | 'selected'
  | 'host_only'
  | 'owner_only';

export type ObjectVisibilityScope = 'everyone' | 'participants' | 'owner_only';

export interface InteractiveObjectConfig {
  id: string;
  areaId: string;
  kind: InteractiveObjectKind;
  defaultLabel: string;
  displayName: string;
  description: string;
  promptKey: string;
  x: number;
  y: number;
  w: number;
  h: number;
  layer: 'ground' | 'object' | 'wall' | 'overlay';
  hasCollision: boolean;
  interactionRadius: number;
  ownerId: string | null;
  visibility: ObjectVisibilityScope;
  usePermission: ObjectPermissionScope;
  editPermission: ObjectPermissionScope;
  allowedUsers: string[];
  customSpriteDataUrl: string | null;
  customColor: string | null;
  targetAreaId?: string;
  linkedBoardId?: string;
  linkedProjectId?: string;
  linkedNotebookId?: string;
  state: Record<string, string | number | boolean>;
  revision: number;
}

const SAFE_DATA_IMAGE_REGEX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const FORBIDDEN_SCRIPT_PATTERN = /(?:<\s*\/?\s*(?:script|iframe|object|embed|svg)|javascript:|vbscript:|onload\s*=|onerror\s*=)/i;

export function isValidCustomSpriteDataUrl(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 524_288 &&
    SAFE_DATA_IMAGE_REGEX.test(value) &&
    !FORBIDDEN_SCRIPT_PATTERN.test(value)
  );
}

export function sanitizeObjectDisplayName(raw: string, fallback = 'Objeto'): string {
  const cleaned = raw
    .replace(FORBIDDEN_SCRIPT_PATTERN, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 48);
  return cleaned || fallback;
}

export const interactiveObjectSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9:_-]{1,96}$/),
  areaId: z.string().min(1).max(96),
  kind: z.enum([
    'whiteboard',
    'computer_project',
    'bookshelf_notes',
    'flashcard_podium',
    'study_desk',
    'voice_table',
    'lamp',
    'plant',
    'frame',
    'cabinet',
    'portal',
  ]),
  defaultLabel: z.string().min(1).max(60),
  displayName: z.string().min(1).max(48),
  description: z.string().max(200),
  promptKey: z.string().min(1).max(48),
  x: z.number().min(0).max(768),
  y: z.number().min(0).max(432),
  w: z.number().min(8).max(240),
  h: z.number().min(8).max(200),
  layer: z.enum(['ground', 'object', 'wall', 'overlay']),
  hasCollision: z.boolean(),
  interactionRadius: z.number().min(12).max(120),
  ownerId: z.string().max(128).nullable(),
  visibility: z.enum(['everyone', 'participants', 'owner_only']),
  usePermission: z.enum(['public', 'participants', 'selected', 'host_only', 'owner_only']),
  editPermission: z.enum(['public', 'participants', 'selected', 'host_only', 'owner_only']),
  allowedUsers: z.array(z.string().max(128)).max(16),
  customSpriteDataUrl: z
    .string()
    .refine((val) => isValidCustomSpriteDataUrl(val), 'Invalid or unsafe sprite image Data URL')
    .nullable(),
  customColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  targetAreaId: z.string().max(96).optional(),
  linkedBoardId: z.string().max(96).optional(),
  linkedProjectId: z.string().max(96).optional(),
  linkedNotebookId: z.string().max(96).optional(),
  state: z.record(z.string().max(48), z.union([z.string().max(240), z.number(), z.boolean()])),
  revision: z.number().int().nonnegative(),
});

const STORAGE_KEY = 'studyvillage-interactive-objects-v1';
const decodedObjectSprites = new Map<string, HTMLImageElement>();

export class InteractiveObjectRegistry {
  private objects = new Map<string, InteractiveObjectConfig>();

  constructor(initialObjects: readonly InteractiveObjectConfig[] = []) {
    for (const obj of initialObjects) {
      this.objects.set(obj.id, { ...obj });
    }
    this.loadPersistedOverrides();
  }

  registerDefaults(defaults: readonly InteractiveObjectConfig[]): void {
    for (const def of defaults) {
      const existing = this.objects.get(def.id);
      if (!existing) {
        this.objects.set(def.id, { ...def, state: { ...def.state }, allowedUsers: [...def.allowedUsers] });
      }
    }
  }

  get(id: string): InteractiveObjectConfig | null {
    return this.objects.get(id) ?? null;
  }

  listByArea(areaId: string, viewerId?: string, isJoinedParticipant = true): InteractiveObjectConfig[] {
    const result: InteractiveObjectConfig[] = [];
    for (const obj of this.objects.values()) {
      if (obj.areaId !== areaId) continue;
      if (!this.canView(obj, viewerId ?? '', isJoinedParticipant)) continue;
      result.push(obj);
    }
    return result;
  }

  canView(obj: InteractiveObjectConfig, userId: string, isParticipant = true): boolean {
    if (obj.visibility === 'everyone') return true;
    if (obj.ownerId && obj.ownerId === userId) return true;
    if (obj.visibility === 'participants') return isParticipant;
    if (obj.visibility === 'owner_only') return obj.ownerId === userId;
    return true;
  }

  canUse(obj: InteractiveObjectConfig, userId: string, isHost: boolean, isParticipant = true): boolean {
    if (obj.ownerId && obj.ownerId === userId) return true;
    switch (obj.usePermission) {
      case 'public':
        return true;
      case 'participants':
        return isParticipant;
      case 'host_only':
        return isHost;
      case 'owner_only':
        return obj.ownerId === userId;
      case 'selected':
        return isHost || obj.allowedUsers.includes(userId);
      default:
        return false;
    }
  }

  canConfigure(obj: InteractiveObjectConfig, userId: string, isHost: boolean, isParticipant = true): boolean {
    if (obj.ownerId && obj.ownerId === userId) return true;
    switch (obj.editPermission) {
      case 'public':
        return true;
      case 'participants':
        return isParticipant;
      case 'host_only':
        return isHost;
      case 'owner_only':
        return obj.ownerId === userId || (obj.ownerId === null && isHost);
      case 'selected':
        return isHost || obj.allowedUsers.includes(userId);
      default:
        return false;
    }
  }

  renameObject(id: string, newDisplayName: string, actorId: string, isHost: boolean): InteractiveObjectConfig {
    const obj = this.objects.get(id);
    if (!obj) throw new Error('Objeto interactivo no encontrado.');
    if (!this.canConfigure(obj, actorId, isHost)) {
      throw new Error('No tienes permiso para renombrar este objeto.');
    }
    const cleanName = sanitizeObjectDisplayName(newDisplayName, obj.defaultLabel);
    const updated: InteractiveObjectConfig = {
      ...obj,
      displayName: cleanName,
      revision: obj.revision + 1,
    };
    interactiveObjectSchema.parse(updated);
    this.objects.set(id, updated);
    this.persistOverrides();
    return updated;
  }

  assignCustomSprite(
    id: string,
    spriteDataUrl: string | null,
    customColor: string | null,
    actorId: string,
    isHost: boolean,
  ): InteractiveObjectConfig {
    const obj = this.objects.get(id);
    if (!obj) throw new Error('Objeto interactivo no encontrado.');
    if (!this.canConfigure(obj, actorId, isHost)) {
      throw new Error('No tienes permiso para cambiar el sprite de este objeto.');
    }
    if (spriteDataUrl !== null && !isValidCustomSpriteDataUrl(spriteDataUrl)) {
      throw new Error('El sprite debe ser una imagen PNG, JPEG o WebP válida de hasta 512 KB.');
    }
    if (customColor !== null && !/^#[0-9a-fA-F]{6}$/.test(customColor)) {
      throw new Error('El color personalizado debe estar en formato hexadecimal (#RRGGBB).');
    }
    const updated: InteractiveObjectConfig = {
      ...obj,
      customSpriteDataUrl: spriteDataUrl,
      customColor,
      revision: obj.revision + 1,
    };
    interactiveObjectSchema.parse(updated);
    this.objects.set(id, updated);
    this.refreshDecodedSprite(id, spriteDataUrl);
    this.persistOverrides();
    return updated;
  }

  updatePermissions(
    id: string,
    patch: Partial<Pick<InteractiveObjectConfig, 'visibility' | 'usePermission' | 'editPermission' | 'allowedUsers'>>,
    actorId: string,
    isHost: boolean,
  ): InteractiveObjectConfig {
    const obj = this.objects.get(id);
    if (!obj) throw new Error('Objeto interactivo no encontrado.');
    if (!this.canConfigure(obj, actorId, isHost)) {
      throw new Error('No tienes permiso para cambiar los permisos de este objeto.');
    }
    const updated: InteractiveObjectConfig = {
      ...obj,
      ...patch,
      revision: obj.revision + 1,
    };
    interactiveObjectSchema.parse(updated);
    this.objects.set(id, updated);
    this.persistOverrides();
    return updated;
  }

  updateState(
    id: string,
    statePatch: Record<string, string | number | boolean>,
    actorId: string,
    isHost: boolean,
  ): InteractiveObjectConfig {
    const obj = this.objects.get(id);
    if (!obj) throw new Error('Objeto interactivo no encontrado.');
    if (!this.canUse(obj, actorId, isHost)) {
      throw new Error('No tienes permiso para usar este objeto.');
    }
    const updated: InteractiveObjectConfig = {
      ...obj,
      state: { ...obj.state, ...statePatch },
      revision: obj.revision + 1,
    };
    interactiveObjectSchema.parse(updated);
    this.objects.set(id, updated);
    this.persistOverrides();
    return updated;
  }

  applyRemoteUpdate(raw: unknown): InteractiveObjectConfig {
    const parsed = interactiveObjectSchema.parse(raw);
    const existing = this.objects.get(parsed.id);
    if (existing && existing.revision > parsed.revision) {
      return existing;
    }
    this.objects.set(parsed.id, parsed);
    this.refreshDecodedSprite(parsed.id, parsed.customSpriteDataUrl);
    return parsed;
  }

  getDecodedSprite(id: string): HTMLImageElement | null {
    const img = decodedObjectSprites.get(id);
    if (img && img.complete && img.naturalWidth > 0) return img;
    return null;
  }

  obstaclesForArea(areaId: string): Rect[] {
    return this.listByArea(areaId)
      .filter((o) => o.hasCollision)
      .map((o) => ({ x: o.x, y: o.y, w: o.w, h: o.h }));
  }

  closestInteractable(
    areaId: string,
    x: number,
    y: number,
    userId: string,
    isParticipant = true,
  ): InteractiveObjectConfig | null {
    let best: InteractiveObjectConfig | null = null;
    let bestDist = Infinity;
    for (const obj of this.listByArea(areaId, userId, isParticipant)) {
      const nx = Math.max(obj.x, Math.min(x, obj.x + obj.w));
      const ny = Math.max(obj.y, Math.min(y, obj.y + obj.h));
      const dist = Math.hypot(x - nx, y - ny);
      if (dist <= obj.interactionRadius && dist < bestDist) {
        bestDist = dist;
        best = obj;
      }
    }
    return best;
  }

  hitTest(areaId: string, x: number, y: number, userId = '', isParticipant = true): InteractiveObjectConfig | null {
    const list = this.listByArea(areaId, userId, isParticipant);
    for (let i = list.length - 1; i >= 0; i--) {
      const obj = list[i];
      if (x >= obj.x && x <= obj.x + obj.w && y >= obj.y && y <= obj.y + obj.h) {
        return obj;
      }
    }
    return null;
  }

  private refreshDecodedSprite(id: string, dataUrl: string | null): void {
    if (!dataUrl || typeof Image === 'undefined') {
      decodedObjectSprites.delete(id);
      return;
    }
    const img = new Image();
    img.src = dataUrl;
    decodedObjectSprites.set(id, img);
  }

  private persistOverrides(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const overrides: Record<
        string,
        Pick<
          InteractiveObjectConfig,
          | 'displayName'
          | 'customSpriteDataUrl'
          | 'customColor'
          | 'visibility'
          | 'usePermission'
          | 'editPermission'
          | 'allowedUsers'
          | 'state'
          | 'revision'
        >
      > = {};
      for (const [id, obj] of this.objects.entries()) {
        if (obj.revision > 1) {
          overrides[id] = {
            displayName: obj.displayName,
            customSpriteDataUrl: obj.customSpriteDataUrl,
            customColor: obj.customColor,
            visibility: obj.visibility,
            usePermission: obj.usePermission,
            editPermission: obj.editPermission,
            allowedUsers: obj.allowedUsers,
            state: obj.state,
            revision: obj.revision,
          };
        }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    } catch {
      // Ignore storage quota issues
    }
  }

  private loadPersistedOverrides(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, Partial<InteractiveObjectConfig>>;
      for (const [id, patch] of Object.entries(parsed)) {
        const base = this.objects.get(id);
        if (!base) continue;
        const candidate: InteractiveObjectConfig = {
          ...base,
          displayName: typeof patch.displayName === 'string' ? sanitizeObjectDisplayName(patch.displayName, base.defaultLabel) : base.displayName,
          customSpriteDataUrl: isValidCustomSpriteDataUrl(patch.customSpriteDataUrl) ? patch.customSpriteDataUrl : null,
          customColor: typeof patch.customColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(patch.customColor) ? patch.customColor : null,
          visibility: patch.visibility ?? base.visibility,
          usePermission: patch.usePermission ?? base.usePermission,
          editPermission: patch.editPermission ?? base.editPermission,
          allowedUsers: Array.isArray(patch.allowedUsers) ? patch.allowedUsers.slice(0, 16) : base.allowedUsers,
          state: patch.state && typeof patch.state === 'object' ? { ...base.state, ...patch.state } : base.state,
          revision: typeof patch.revision === 'number' ? patch.revision : base.revision,
        };
        const valid = interactiveObjectSchema.safeParse(candidate);
        if (valid.success) {
          this.objects.set(id, valid.data);
          this.refreshDecodedSprite(id, valid.data.customSpriteDataUrl);
        }
      }
    } catch {
      // Keep defaults on parse error
    }
  }
}
```

---

Fin del megaprompt 1/3. Implementar y verificar todo el alcance de esta fase antes de declarar terminado.
