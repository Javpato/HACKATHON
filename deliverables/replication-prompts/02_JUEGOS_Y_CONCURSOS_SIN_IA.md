# MEGAPROMPT 2/3 — Juegos compartidos, cartas y concursos, sin IA

## Instrucción de implementación

Actualiza una versión antigua de StudyVillage para reproducir las actividades descritas aquí. Esta fase añade Hombres Lobo, Gartic Phone y concursos con tarjetas creadas manualmente. Conserva el mundo, la estética madera/papel, los proyectos, los apuntes, las pizarras independientes y el repaso manual de la fase base. **No instales ni integres Ollama, modelos, servicios de inferencia, formularios de IA, generación automática ni bots de dibujo**. Gartic en esta distribución es exclusivamente humano. Los bots de Hombres Lobo sí existen: son jugadores de reglas/azar, no modelos de lenguaje.

La referencia funcional es StudyVillage 0.2.0, commit `871e85e51ae204d10eaf301bbac85ad437438471`. Este documento contiene reglas, contratos, estados, integración y código canónico. No basta con construir pantallas que aparenten jugar. Tiene que haber una sola partida real compartida, con secretos filtrados por destinatario y autoridad verificable. Los anexos incluyen una variante de Gartic de la que se han retirado completamente los ganchos de IA de la versión final.

Trabaja por bloques completos. Antes de modificar, inspecciona qué versión hay y ejecuta sus comprobaciones. Integra transporte/autoridad, después un motor y su UI, verifica ese juego, continúa con el siguiente. No dejes una estación visible cuyo motor sea una simulación local distinta para cada cliente.

## 1. Acceso desde el mundo y aspecto

Los juegos se descubren caminando en la plaza. La hoguera/mesa del consejo abre Hombres Lobo; la mesa de dibujo abre Gartic. Clic hace caminar mediante A* y abre al llegar; E abre solo al estar cerca. No añadas una barra fija con botones para entrar a todos los juegos. Las tarjetas siguen accesibles desde su estación y desde la app de Tarjetas; allí se añade **Jugar en grupo**.

Abre cada actividad en un overlay de pantalla completa, con cierre propio y vuelta a la escena exacta de origen. Cerrar la vista no termina la partida ni equivale a abandonar una silla. Bloquea el movimiento de fondo mientras el panel esté abierto, limpia teclas/acciones pendientes al cerrarlo y devuelve foco de teclado al mundo.

Familias CSS:

- `.ww-*`: mesa, asientos, cartas, turnos de Hombres Lobo.
- `.gp-*`: Gartic, herramientas de dibujo, participantes y álbum.
- `.sv-study-*`: biblioteca, editor, repaso y concurso.
- `.sv-activity-stop`: control global del anfitrión.

Materiales: `paper #fff8e9`, `paper-soft #f5e7cb`, borde `#d7bf95`, madera `#443023/#765338`, texto `#423223`, verde `#416c46`. Mantén el papel de dibujo blanco. Hombres Lobo nocturno usa marrón/carbón cálido (`#29251f`, `#393329`) y texto crema; no importa un tema azul ajeno a la aldea. Iconos de roles mediante `pixel-icons.ts`, con SVG de rectángulos y `shape-rendering:crispEdges`, no emojis dependientes del SO.

Para el botón de terminar reserva 60 px debajo del contenido de la actividad. El botón va absoluto abajo a la derecha, con alto mínimo 42 px y ancho limitado a la pantalla. En móvil no lo añadas como otro hijo flex que comprima o divida el área del juego. Listas/tablas interiores pueden hacer scroll; el documento no debe tener scroll horizontal.

## 2. Transporte genérico y autoridad real

Mantén el anfitrión de la aldea como autoridad. No lo confundas con el primer jugador sentado: el anfitrión puede observar y cerrar una partida sin ocupar asiento. Sin sesión, el mismo motor corre localmente. No hay servidor 24/7 ni migración de autoridad en esta fase.

Contrato mínimo:

```ts
type AppChannel = 'projects'|'werewolves'|'gartic'|'study';
interface AppMessage { channel:AppChannel; from:string; data:string }
interface RoomContext { selfId:string; hostId:string|null }
interface RoomEngine<A,V> {
  apply(actorId:string, action:A, now:number):void;
  cancel?(now:number):void;
  tick(now:number):boolean;
  viewFor(viewerId:string, now:number):V;
  audience():string[];
}
type RoomWire<A,V> =
  | {t:'hello'} | {t:'act';a:A}
  | {t:'view';v:V} | {t:'error';m:string};
```

Añade `sendApp(channel,to,data):boolean` y `onApp(listener):unsubscribe` a las acciones de sesión. El protocolo de red usa:

```ts
{ type:'app.send', channel, to:string|null, data:string }
{ type:'app.relay', channel, from:string, data:string }
```

Un miembro envía `app.send` al anfitrión. El anfitrión comprueba remitente autenticado, destinatario perteneciente a la sesión, canal permitido y tamaño; reenvía como `app.relay` con el `from` real. Un invitado no puede inventar `app.relay` ni usar `from` del anfitrión. El anfitrión puede enviar directo a uno o a todos. En entrega local del propio anfitrión se conserva el mismo formato autenticado.

Límites de referencia: `LIMITS.messageBytes=65536`, `appData=56000`, cola de 128 mensajes/1 MiB. Ampliar el enum de canales tanto en tipos como en Zod. Rechazar JSON inválido/canales ajenos sin cerrar todos los servicios por una excepción del juego.

### `SharedRoom<Action,View,Engine>`

El anexo contiene el archivo completo. Sus invariantes:

1. `isAuthority = hostId===null || hostId===selfId`.
2. `sync()` calcula `local:<self>` u `online:<host>`. Solo recrea el motor si cambia esa clave; no en cada render ni cada movimiento.
3. Solo la autoridad crea el motor y arranca un timer de 400 ms. Invitados envían `hello` para pedir una vista.
4. `act()` local ejecuta `engine.apply(selfId,action,Date.now())`, captura errores y publica. Invitados envían `act` a la autoridad.
5. La autoridad añade a quienes piden vista a `watchers`. Publica para `audience ∪ watchers`; cada envío usa `engine.viewFor(recipient,now)` individual.
6. Un invitado solo acepta `view/error` si `message.from===hostId`. Nunca ejecuta un motor propio en paralelo a la partida remota.
7. `mutate(fn)` es housekeeping local de autoridad y publica únicamente si fn devuelve true.
8. `refresh()` vuelve a pedir estado al abrir panel; no reinicia la partida.
9. `dispose()` quita el listener y el intervalo.

La vista no es una serialización del motor completo. No envíes todas las cartas o todos los álbumes y los ocultes con CSS: un cliente podría leerlos.

### Terminar en cualquier momento

`canStop()` comprueba autoridad, no `me.seated` ni `leaderId`. `stop()` ejecuta solo en la autoridad: `engine.cancel(now); publish()`. No hay mensaje remoto público de «cancel» que cualquier invitado pueda usar.

Botón **Terminar partida** → segunda pulsación **¿Terminar para todos?**. Tras confirmar: estado lobby publicado a todos, timers/secrets/borradores de ronda invalidados, roster y configuración útiles preservados. Sigue habiendo **Cerrar** para cerrar solamente la vista. El anfitrión ve terminar durante reparto, noche, día, disparo, dibujo, álbum, resultados y final; puede reiniciar después.

## 3. Hombres Lobo: modelo y reparto

Motor `minigames/werewolves.ts`; UI `ui/werewolves-ui.ts`. Entre 4 y 8 sillas, mezcla de humanos y bots de reglas. El límite global de aldea sigue siendo seis conexiones; ocho sillas no significa que se haya ampliado el transporte a ocho equipos.

Roles:

| ID | Carta | Regla |
|---|---|---|
| `werewolf` | Hombre lobo | La manada vota una víctima nocturna; reconoce a los otros lobos |
| `seer` | Vidente | Descubre una carta por noche; mantiene sus descubrimientos privados |
| `guard` | Guardián | Protege a alguien del ataque; no a la misma persona dos noches seguidas |
| `witch` | Bruja | Una poción de curación y una de veneno por partida |
| `cupid` | Cupido | Primera noche une exactamente a dos personas distintas; pueden incluirse él mismo |
| `hunter` | Cazador | Al morir puede disparar una última vez a otra persona viva, o pasar |
| `girl` | Niña | Durante lobos puede espiar y conocer un lobo, con 1/3 de riesgo de quedar expuesta a la manada |
| `villager` | Ciudadano | Sin poder nocturno; participa en debate y voto |

`RoleCounts=Partial<Record<Role,number>>`. Configuración válida: al menos un lobo, menos de la mitad inicial de jugadores; lobos máximo 3, cada especial máximo 1, enteros no negativos; no más cartas especiales que sillas. Rellena el resto con ciudadanos. Ignora el contador de ciudadano recibido al validar especiales: es derivado, no una carta especial con máximo uno.

Presets exactos:

```text
w = players>=6 ? 2 : 1
Básico:  w lobos + vidente
Clásico: w lobos + vidente + bruja si >=5 + cazador si >=6
Vínculos: w lobos + cupido + vidente + niña si >=6
resto: ciudadanos
```

La baraja predeterminada si no se configura set explícito es distinta de los presets: lobo+vidente+guardián; añadir bruja desde cinco, segundo lobo desde seis, completar ciudadanos.

La previsualización del set usa al menos cuatro sillas para poder configurarlo antes de sentarse. Si queda inválido al cambiar el roster, muestra `deckError` y desactiva repartir; no hagas que `viewFor` lance y rompa el panel. Reparte solo al empezar usando Fisher–Yates y `crypto.getRandomValues` con rejection sampling (`secureRandomInt` del anexo), no `Math.random` para secretos. El azar inyectable sirve para tests deterministas.

### Catálogo y sets guardados

En lobby, desplegable **Elegir cartas y sets**, cerrado por defecto. Ocho tarjetas con icono, nombre, descripción y cantidad. Ciudadano muestra el relleno derivado y no se edita. Solo anfitrión de aldea o líder autorizado configura. Mantén abierto/cerrado al actualizar el estado de la sala.

Selector Básico/Clásico/Vínculos y sets personales. Guardar nombre máximo 40, hasta doce entradas en `studyvillage-role-sets`. Cargar JSON de forma defensiva; cualquier set almacenado vuelve a pasar por validación de motor. Guardar un set no equivale a empezar ni cambia secretos de una partida en curso.

### Estado y acciones

```ts
type Phase = 'lobby'|'reveal'|'night'|'dawn'|'day'|'verdict'|'hunter'|'end';
type NightStep = 'cupid'|'wolves'|'seer'|'guard'|'witch';
```

Acciones del anexo: join/leave, add_bot/remove_bot, configure, start, ready, wolf_vote, seer_look, guard, witch, cupid, peek, hunter, vote, continue, play_again. Cada una valida actor, fase, rol, vida, objetivo permitido y uso único antes de mutar. Que la UI desactive un botón no sustituye esta validación.

Tiempos en milisegundos:

```text
reveal 15000; cupid 30000; wolves 40000; seer 25000;
guard 25000; witch 30000; dawn 8000; day 120000;
verdict 8000; hunter 25000.
```

Flujo:

```text
lobby --start--> reveal --todos ready o timeout--> noche
primera noche: cupido -> lobos -> vidente -> guardián -> bruja
noches siguientes: lobos -> vidente -> guardián -> bruja
fin de noche: resolver ataque/protección/pociones -> muertes/vínculos/cazador
si no hay ganador: dawn -> day/votación -> verdict -> siguiente noche
cualquier muerte puede interrumpir para hunter antes de comprobar victoria
cualquier fase --stop del anfitrión--> lobby
```

Salta roles inexistentes o muertos. Cupido solo actúa la primera noche. Lobos con empate eligen entre objetivos empatados usando azar seguro; votación diurna con empate no mata a nadie. Abstención explícita `skip`. La Bruja no tiene pociones infinitas ni puede curar sin víctima válida. El Guardián conserva `lastGuarded`. La Niña debe actuar o agotar tiempo en el paso de lobos aunque todos los lobos ya hayan votado.

### Vínculo, Cazador y salidas de la mesa

Cupido guarda dos IDs distintos. Si muere uno, propaga al otro antes de comprobar victoria; informa la muerte y revela la carta como cualquier muerto. La pareja conoce a su enamorado; el resto no recibe ese ID como un secreto extra.

Muertes de Cazador se encolan una sola vez mediante `spentHunters`. Entrar en `hunter` guarda la continuación, da 25 segundos y solo el cazador de la cabeza de cola puede actuar. El objetivo debe estar vivo y no ser él mismo; null significa pasar. Al agotar tiempo pasa automáticamente. Después de su tiro, vuelve a propagar vínculos y encolar cazadores antes de decidir victoria/reanudar.

Si alguien abandona estando vivo, es una muerte real: el vínculo y disparos se resuelven también. Si interrumpe noche/día/reparto, guarda `{phase, step, remaining}` y pausa los segundos restantes durante el disparo. Luego restaura la fase y paso originales, limpia votos de/a muertos y comprueba si el paso ya está completado. **No saltes toda la noche al amanecer porque alguien abandonó.** El anexo incluye esta regresión corregida en el commit final. Si ya había una secuencia de cazador, conserva su continuación en vez de reemplazarla.

Victoria: aldea si no quedan lobos; lobos si son tantos como los demás o más. Antes de esas reglas, si solo quedan los dos enamorados y son de bandos distintos, ganan los enamorados. El último disparo se resuelve antes de declarar ganador. El texto final debe contemplar los tres vencedores.

### Privacidad de vistas

`viewFor(viewerId)` incluye propia carta, estado público, baraja/configuración, objetivo(s) permitidos, remainingMs y logs públicos. Roles ajenos: null hasta muerte/final, excepto lobos entre sí, descubrimientos de Vidente, lobo visto por Niña y Niña expuesta únicamente a lobos. Los demás no reciben esos secretos. El actor muerto no puede votar/actuar salvo su último disparo explícito.

Los campos privados de motor —votos nocturnos completos, cartas no reveladas, pareja, pociones, resultados de espionaje— no salen en un snapshot global. Comprueba serializaciones, no solo el aspecto de pantalla.

### Bots de reglas

Bots eligen entre acciones legales y objetivos válidos con azar, tras pausa breve (aprox. 1,5–4 s; cazador 1,8 s). Respetan límites/pociones/turnos; no conocen secretos fuera de lo que sus reglas autorizan. No afirman razonar por voz. Si actúa solamente una Niña bot y cambia el paso, `tick()` tiene que devolver true: si devuelve false, la autoridad cambia estado pero los clientes quedan viendo el paso antiguo.

## 4. Gartic Phone humano: circuito real de álbumes

Motor `minigames/gartic-phone.ts`, UI `ui/gartic-ui.ts`. Entre 3 y 8 sillas humanas. No hay botón para rellenar bots, personajes prefabricados, frases sugeridas por la app ni dibujos automáticos. Si faltan personas, Empezar está desactivado y explica el mínimo. No reduzcas el juego a una secuencia de pantallas locales.

Fases: `lobby | write | draw | guess | album | end`. Duraciones: escribir 45 s, dibujar 100 s, adivinar 45 s; gracia de recepción tardía 2,5 s. El reloj viene de la autoridad; el cliente interpola el contador visual, no decide avanzar toda la partida.

Al empezar: barajar asientos, crear un libro por silla y `gameId=crypto.randomUUID()`. Rondas `max(n,4)`: siempre hay al menos escribir→dibujar→adivinar→dibujar. Sea `b` el índice de libro y `r` la ronda: su actor es `seat[(b+r)%n]`. Para una silla de índice `s`, `book=(s-r+n)%n`. Primera ronda escribe; rondas impares dibujan; rondas pares posteriores adivinan. Este circuito determina de quién recibe cada uno, sin elección arbitraria del cliente.

Cada página conserva `{kind, authorId, text? , drawing?}`. La tarea enviada al actor contiene **solo la página inmediatamente anterior**, no la frase original junto a un dibujo que debe adivinar. `mine` permite recuperar su entrega actual. `submit` valida asiento/ronda, guarda y avanza si todos han entregado. `unsubmit` permite volver a editar mientras siga la ronda. Los borradores del panel sobreviven renders de roster/contador; usa clave de borrador por ronda y reutiliza input/canvas.

Al agotar tiempo+gracia, completa ausencias con página vacía (`…` para texto, dibujo vacío), nunca con contenido inventado que parezca de un jugador. Es una ausencia, no un bot. Avanza una vez, incluso si la última entrega y timeout llegan casi juntos.

### Dibujo vectorial acotado

```ts
const CANVAS_W=640, CANVAS_H=400;
interface DrawStroke { c:string; w:number; p:number[] } // x,y,x,y...
interface Drawing { strokes:DrawStroke[] }
```

Máximo 4.000 puntos y 40.000 caracteres de dibujo serializado. Color hexadecimal válido, grosor acotado, pares completos, números finitos y coordenadas dentro de 640×400. Limpia en el motor; no confíes en un canvas del cliente. Para exportación/visión futura dibuja siempre sobre fondo blanco.

El panel tiene paleta, grosores, goma blanca, deshacer, rehacer, borrar y botón **¡Listo!**. Punteros capturados correctamente. Al arrastrar no reconstruyas el canvas por una actualización remota. Deshacer/rehacer pertenece al borrador de esa ronda, no a páginas anteriores. Puedes renderizar a doble resolución, manteniendo puntos en unidades 640×400.

Texto: máximo 120 caracteres. Placeholder **Escribe tu frase**. Si está vacío, pulsar Listo produce validación conservando el input. No envíes el placeholder como si fuese la frase. Las instrucciones explican escribir/dibujar/adivinar y abrir álbumes; no hay un catálogo de frases ridículas de ejemplo.

### Álbum final

Solo la autoridad avanza `album_next`: una página cada vez y luego siguiente libro. Identifica cada dibujo por `${gameId}:${book}:${page}`. Para no exceder límites de red, la vista envía el dibujo únicamente de la página recién revelada; clientes lo guardan en `albumCache` para seguir mostrando páginas anteriores. El cache se separa por gameId; no mezcla dos partidas. En final, **Volver a jugar** vuelve al lobby sin reactivar entregas viejas.

No mandes el conjunto completo de libros durante escritura/dibujo. Es una fuga de información y un payload enorme. `cancel()` descarta libros/asientos de ronda/deadline y cambia gameId; mantiene roster útil. Cambiar gameId evita que una respuesta/acción vieja se aplique a una partida nueva.

## 5. Concurso de tarjetas manuales, funcionamiento tipo Kahoot

Conservar crear/editar/repasar de la base y añadir **Jugar en grupo**. El anfitrión presenta, invitados contestan. No se crean preguntas de ejemplo, ni se necesita proveedor de IA. El anfitrión selecciona un mazo existente en su equipo.

Ampliar `FlashcardItem` con:

```ts
choices?: string[]; // 2..4, distintas, sin vacíos, máximo 120 por opción
correctChoice?: number; // entero 0..choices.length-1
```

Ambos aparecen juntos o ninguno. UI: **Opciones de concurso y detalles** → **Usar en concursos**, opciones 1/2 obligatorias, 3/4 opcionales sin huecos y selector de correcta. Mantener pregunta/respuesta de repaso. Validar el índice al guardar y en el esquema, no solo en formulario.

Motor `StudyQuiz(hostId)` implementa `RoomEngine`. `setDeck` es local de autoridad y copia/valida el mazo; filtra solo tarjetas con choices+correctChoice. La copia evita que editar el mazo desde otra pantalla altere la respuesta de una pregunta ya abierta. El mazo completo y correctChoice nunca se envían al invitado.

Fases `lobby | question | results | end`. Acciones:

```ts
{kind:'join',name:string}
{kind:'start',seconds:0|20|30|60}
{kind:'answer',questionId:string,choice:number}
{kind:'next'}
```

El host no necesita sentarse ni responder; entrar como host no añade un participante falso. Requerir al menos un invitado, al menos una tarjeta de concurso y tiempo válido para comenzar. Tiempo predeterminado 20 s; 30/60/sin tiempo en **Opciones de partida**, cerrado por defecto.

Cada pregunta tiene ID `${gameUUID}:${index}`. `begin(now)` fija started y limpia answered. Una respuesta solo puntúa si el actor participa, la fase es question, el ID coincide, la opción es válida, no respondió ya y no llegó después del plazo. Repetidas/viejas/tardías se ignoran. El tiempo se calcula con el reloj del host, no un `elapsed` enviado por el invitado.

```text
correcta con tiempo:
  score += round(500 + 500 * max(0, 1 - max(0,now-started)/(seconds*1000)))
correcta sin tiempo: score += 1000
incorrecta o ausencia: += 0
```

Todos respondieron o timeout → results. Allí se revela índice correcto y ranking. Solo host usa Siguiente; tras última tarjeta, end. Durante question `solution=null`; no serializar `correctChoice` bajo otro nombre. El invitado recién llegado durante una pregunta queda marcado como ya respondido para esa pregunta y empieza normalmente en la siguiente. `prune(presentIds)` elimina desconectados y permite cerrar una pregunta si ya respondieron todos los que siguen.

`cancel()` vuelve al lobby, conserva participantes/mazo, pone puntuaciones a cero, invalida el gameUUID y marca `stopped=true`. Se publica a todos. En UI muestra que el anfitrión terminó, con posibilidad de jugar otra vez. Durante preguntas desactiva opciones al responder; host ve su función de presentador. Contador visual se refresca cada 250 ms sin re-renderizar innecesariamente todo el formulario.

## 6. Integración de ciclo de vida

En el controlador de actividades:

```text
context():
  joined = network.phase === JOINED
  selfId = identity.fingerprint || local-host
  hostId = joined ? network.hostId : null

crear una vez:
  wolvesRoom = SharedRoom(werewolves, actions, context,
                         () => new WerewolvesGame(undefined, context().selfId))
  garticRoom = SharedRoom(gartic, actions, context,
                         () => new GarticGame(undefined, context().selfId))
  studyRoom  = SharedRoom(study, actions, context,
                         () => new StudyQuiz(context().selfId))

al cambiar sesión: room.sync() en todas; study.prune(miembros presentes)
al abrir: montar panel; subscribe(update); refresh()
al cerrar: unsubscribe de vista y unmount del panel; no reiniciar motor
al destruir app: dispose de paneles/rooms/intervalos/listeners/ambiente
```

No crees un setInterval nuevo cada vez que alguien cambia el nombre o se mueve. El motor debe seguir temporizando aunque el host cierre el panel para caminar, mientras siga en esa sesión. Al pasar de offline a otra autoridad, la clave de modo cambia y no se conserva por accidente una partida local como si fuera remota.

## 7. Archivos y cambios concretos

| Archivo | Acción |
|---|---|
| `protocol/types.ts`, `schema.ts` | Canales y envelopes app; mantener areaId/rotation |
| `session/client.ts` | Relay autenticado, límites, listener sendApp/onApp |
| `minigames/room.ts` | Motor genérico y autoridad; reutilizable por proyectos |
| `minigames/werewolves.ts` | Reglas completas con cancel y roles nuevos |
| `ui/werewolves-ui.ts` | Mesa, turnos, acciones, catálogo y sets |
| `minigames/gartic-phone.ts` | Libros/rondas/álbum, variante solo humana |
| `ui/gartic-ui.ts` | Borradores, canvas, texto, álbum; sin botones de bots |
| `minigames/study-quiz.ts` | Concurso autoritativo |
| `study/decks.ts` | Esquema choices/correctChoice, sin dependencia de IA |
| panel manual de tarjetas | Añadir modo quiz y edición de opciones |
| `ui/pixel-icons.ts`, `ui/game.css`, `ui/theme.css` | Iconos y piel coherente de actividades |
| controlador de actividades/mundo | Montaje estaciones, stop y dispose |

No restaures el viejo `minigames/framework.ts` como segunda arquitectura. No vuelvas al arcade eliminado ni a un botón de juego que únicamente cambia un estado local.

## 8. Pruebas de aceptación y evidencia requerida

### Motores

- Configurar seis sillas con lobo+cupido da cuatro ciudadanos; no se permiten dos lobos en cuatro ni más especiales que sillas.
- Repartir no asigna dos cartas a la misma persona y cada persona solo ve lo permitido por su rol.
- Ejecutar partidas completas con bots de reglas, incluidos Cupido, Niña y Cazador; ninguna se queda esperando un rol muerto.
- Espiar con roll conocido: Niña ve un lobo, otro ciudadano no lo ve; si se expone solo manada ve su carta.
- Muerte de un enamorado propaga a pareja; Cazador puede alterar el ganador antes del final. Caso de abandonar a mitad de noche reanuda la noche, no la salta.
- Cancelar desde reveal/night/day/hunter/end conserva roster/config y limpia secretos. Invitado no puede invocar stop de autoridad.
- Gartic con tres humanos: escribir, dibujar, adivinar, dibujar, abrir cada álbum; cada tarea solo muestra la página previa. Sin tres personas, no empieza.
- Timeout completa ausencias vacías; no inventa frases/dibujos. Límite de dibujo y JSON se cumple; errores no destruyen el borrador.
- Concurso: solución ausente durante pregunta; duplicada/tardía/ID anterior no puntúa; puntuación calculada en host; un desconectado no bloquea; stop vuelve a ambos al lobby.

### Navegador y red real

- Teléfono 390×844, iPad 820×1180 y escritorio 1440×1000: controles accesibles, sin overflow horizontal, stop no tapa la tarea.
- Dos navegadores en una aldea real: ambos ven mismo reparto/turno; comprobar también payload/estado para asegurar secretos distintos.
- Host observador sin silla puede detener la partida que empezó el invitado; ambos vuelven al mismo lobby.
- Crear manualmente un mazo y concurso; invitado responde; host ve resultado; terminar sincroniza.
- Cerrar una actividad deja caminar inmediatamente y no corta una llamada privada por accidente.
- Inspección de red y bundle: no llamadas a proveedores/modelos, ni dependencias de una capa de IA para abrir estos juegos.

Ejecuta typecheck, tests relevantes y build. Distingue claramente prueba de dos navegadores en un ordenador de dos equipos/redes físicos. No marques instalación Windows como comprobada por tener un archivo compilado.

## Anexos canónicos

Los archivos completos siguientes son la implementación de referencia o su variante exclusivamente humana para esta distribución. El motor de concurso importa el modelo de mazos independiente de la fase 1; no lo hagas depender de un módulo de IA. Los fragmentos de integración se añaden a tu controlador existente y deben conservar la estética y ciclo de vida especificados.

<!-- GENERATED CANONICAL SOURCES -->

### app/src/minigames/room.ts

Archivo completo de referencia.

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

### app/src/minigames/werewolves.ts

Archivo completo de referencia.

SHA-256 del bloque: `37a14531aaffeaf1b3dc50ba75d0b5cf81090ccafed4e56265ba7f4e1f81deeb`.

```ts
import { pick, secureRandomInt, shuffle, type RoomEngine } from './room';

/**
 * Werewolves (Loup-Garou) as a classic turn-ordered game.
 *
 * Night is called role by role, always in the same order: the wolves choose
 * a victim, the seer looks at one card, the guard protects someone and the
 * witch may heal the victim or poison anyone. Dawn announces the dead, the
 * village votes in daylight, and the verdict reveals the card of whoever was
 * eliminated. The village wins when no wolf is left; wolves win once they are
 * at least as many as everyone else.
 *
 * The engine is authoritative and only ever hands out per-player views:
 * nobody sees a card they have not earned.
 */

export type WerewolfRole = 'werewolf' | 'seer' | 'guard' | 'witch' | 'villager' | 'cupid' | 'hunter' | 'girl';
export type WerewolvesPhase = 'lobby' | 'reveal' | 'night' | 'dawn' | 'day' | 'verdict' | 'hunter' | 'end';
export type NightStep = 'cupid' | 'wolves' | 'seer' | 'guard' | 'witch';

export const NIGHT_ORDER: readonly NightStep[] = ['cupid', 'wolves', 'seer', 'guard', 'witch'];
export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 8;

export const ROLE_INFO: Record<WerewolfRole, { name: string; plural: string; team: 'aldea' | 'lobos'; goal: string }> = {
  werewolf: { name: 'Hombre lobo', plural: 'Hombres lobo', team: 'lobos', goal: 'Cada noche elige con tu manada a quién atacar. De día, disimula.' },
  seer: { name: 'Vidente', plural: 'Videntes', team: 'aldea', goal: 'Cada noche descubre la carta de una persona.' },
  guard: { name: 'Guardián', plural: 'Guardianes', team: 'aldea', goal: 'Cada noche protege a alguien del ataque. No a la misma persona dos noches seguidas.' },
  witch: { name: 'Bruja', plural: 'Brujas', team: 'aldea', goal: 'Una poción para salvar a la víctima y otra para eliminar a alguien. Una vez cada una.' },
  cupid: { name: 'Cupido', plural: 'Cupidos', team: 'aldea', goal: 'La primera noche une a dos enamorados: si muere uno, muere el otro. Si son de bandos distintos, ganan quedándose solos.' },
  hunter: { name: 'Cazador', plural: 'Cazadores', team: 'aldea', goal: 'Al morir puedes disparar una última vez a otra persona viva.' },
  girl: { name: 'Niña', plural: 'Niñas', team: 'aldea', goal: 'Puedes descubrir un lobo durante su turno. Hay un 33 % de riesgo de que la manada te identifique.' },
  villager: { name: 'Ciudadano', plural: 'Ciudadanos', team: 'aldea', goal: 'Sin poderes: escucha, sospecha y vota bien de día.' },
};

const STEP_ROLE: Record<NightStep, WerewolfRole> = { cupid: 'cupid', wolves: 'werewolf', seer: 'seer', guard: 'guard', witch: 'witch' };
export const STEP_CALL: Record<NightStep, string> = {
  cupid: 'Cupido elige a dos enamorados',
  wolves: 'Los hombres lobo despiertan y eligen a su víctima',
  seer: 'La vidente despierta y mira una carta',
  guard: 'El guardián despierta y protege a alguien',
  witch: 'La bruja despierta y decide sus pociones',
};

/** Milliseconds each phase or night turn may last before the game moves on. */
export const DURATIONS = {
  hunter: 25_000, cupid: 30_000, reveal: 15_000, wolves: 40_000, seer: 25_000, guard: 25_000, witch: 30_000,
  dawn: 8_000, day: 120_000, verdict: 8_000,
} as const;

/** Bots answer after a short, random pause so they read like players. */
const BOT_DELAY: readonly [number, number] = [1_500, 4_000];
const BOT_NAMES = ['Lupe', 'Bruno', 'Iris', 'Tomás', 'Nora', 'Gael', 'Vera', 'Olmo', 'Rita', 'Dante'];
const BOT_COLORS = ['#c96f53', '#5f8f6b', '#6a7fc1', '#b58a3e', '#9a6bb5', '#4d9aa3', '#c25b7a', '#7d8f3f'];

export function roleDeck(playerCount: number): WerewolfRole[] {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`Se juega con ${MIN_PLAYERS} a ${MAX_PLAYERS} personas (puedes completar con bots).`);
  }
  const deck: WerewolfRole[] = ['werewolf', 'seer', 'guard'];
  if (playerCount >= 5) deck.push('witch');
  if (playerCount >= 6) deck.push('werewolf');
  while (deck.length < playerCount) deck.push('villager');
  return deck;
}

export type RoleCounts = Partial<Record<WerewolfRole, number>>;
export function configuredDeck(playerCount: number, counts: RoleCounts): WerewolfRole[] {
  if (playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) throw new Error('Se necesitan entre 4 y 8 jugadores.');
  const deck: WerewolfRole[] = [];
  for (const role of Object.keys(ROLE_INFO) as WerewolfRole[]) {
    if (role === 'villager') continue;
    const count = counts[role] ?? 0;
    if (!Number.isInteger(count) || count < 0 || count > (role === 'werewolf' ? 3 : 1)) throw new Error('Cantidad de cartas no válida.');
    for (let i = 0; i < count; i++) deck.push(role);
  }
  if (deck.length > playerCount) throw new Error('Hay más cartas elegidas que jugadores.');
  const wolves = deck.filter(r => r === 'werewolf').length;
  if (!wolves || wolves * 2 >= playerCount) throw new Error('Elige al menos un lobo, sin mayoría inicial.');
  while (deck.length < playerCount) deck.push('villager');
  return deck;
}
export function presetRoles(name: string, players: number): RoleCounts {
  const wolves = players >= 6 ? 2 : 1;
  if (name === 'bonds') return { werewolf: wolves, cupid: 1, seer: 1, ...(players >= 6 ? { girl: 1 } : {}) };
  if (name === 'classic') return { werewolf: wolves, seer: 1, ...(players >= 5 ? { witch: 1 } : {}), ...(players >= 6 ? { hunter: 1 } : {}) };
  return { werewolf: wolves, seer: 1 };
}

export interface WerewolfPlayer {
  id: string; name: string; color: string; bot: boolean;
  alive: boolean; role: WerewolfRole | null; ready: boolean;
}

export interface LogEntry { icon: 'moon' | 'sun' | 'skull' | 'vote' | 'trophy' | 'info'; text: string }

export type WerewolvesAction =
  | { kind: 'join'; name: string; color: string }
  | { kind: 'leave' }
  | { kind: 'add_bot' }
  | { kind: 'remove_bot'; id: string }
  | { kind: 'configure'; counts: RoleCounts }
  | { kind: 'cupid'; targets: [string, string] }
  | { kind: 'peek'; spy: boolean }
  | { kind: 'hunter'; target: string | null }
  | { kind: 'start' }
  | { kind: 'ready' }
  | { kind: 'wolf_vote'; target: string }
  | { kind: 'seer_look'; target: string }
  | { kind: 'guard'; target: string }
  | { kind: 'witch'; heal: boolean; poison: string | null }
  | { kind: 'vote'; target: string | 'skip' }
  | { kind: 'continue' }
  | { kind: 'play_again' };

export interface WerewolvesTurn {
  step: NightStep;
  /** Who can be chosen this turn. */
  targets: string[];
  victim: string | null;
  canHeal: boolean;
  canPoison: boolean;
  lastGuarded: string | null;
}

export interface WerewolvesView {
  phase: WerewolvesPhase;
  step: NightStep | null;
  round: number;
  remainingMs: number;
  leaderId: string | null;
  me: { id: string; seated: boolean; alive: boolean; role: WerewolfRole | null; acted: boolean; isLeader: boolean };
  players: {
    id: string; name: string; color: string; bot: boolean; alive: boolean;
    /** Only what the viewer is entitled to know. */
    role: WerewolfRole | null;
    ready: boolean;
    /** Public during the day: who this player is voting for. */
    votesFor: string | null;
    /** Wolves see each other's choices during their turn. */
    wolfTarget: string | null;
  }[];
  deck: WerewolfRole[];
  /** The viewer's own night turn, or null while someone else is awake. */
  turn: WerewolvesTurn | null;
  seerSeen: { id: string; role: WerewolfRole }[];
  nightDeaths: string[];
  verdict: { id: string | null; tie: boolean } | null;
  winner: 'aldea' | 'lobos' | 'lovers' | null;
  counts: RoleCounts; deckError: string | null; loverId: string | null; peeked: string[]; hunterTargets: string[];
  log: LogEntry[];
}

interface Night {
  wolfVotes: Map<string, string>;
  victim: string | null;
  guarded: string | null;
  healed: boolean;
  poisoned: string | null;
  acted: Set<string>;
}

const emptyNight = (): Night => ({ wolfVotes: new Map(), victim: null, guarded: null, healed: false, poisoned: null, acted: new Set() });

export class WerewolvesGame implements RoomEngine<WerewolvesAction, WerewolvesView> {
  phase: WerewolvesPhase = 'lobby';
  step: NightStep | null = null;
  round = 0;
  players: WerewolfPlayer[] = [];
  private leaderId: string | null = null;
  private deadline = 0;
  private botAt = 0;
  private night: Night = emptyNight();
  private lastGuarded: string | null = null;
  private healLeft = true;
  private poisonLeft = true;
  private seerSeen = new Map<string, WerewolfRole>();
  private nightDeaths: string[] = [];
  private votes = new Map<string, string>();
  private verdict: { id: string | null; tie: boolean } | null = null;
  private winner: 'aldea' | 'lobos' | 'lovers' | null = null;
  private deck: WerewolfRole[] = [];
  private log: LogEntry[] = [];
  private counts: RoleCounts | null = null;
  private lovers: [string, string] | null = null;
  private peeks = new Map<string, Set<string>>();
  private exposedGirls = new Set<string>();
  private hunters: string[] = [];
  private spentHunters = new Set<string>();
  private resumeAfterDeath: 'dawn' | 'verdict' | 'interrupted' = 'dawn';
  private interrupted: { phase: 'reveal' | 'night' | 'dawn' | 'day' | 'verdict'; step: NightStep | null; remaining: number } | null = null;

  constructor(private readonly random: (max: number) => number = secureRandomInt, private readonly authorityId: string | null = null) {}

  cancel(): void {
    this.phase = 'lobby';
    this.step = null; this.round = 0; this.deadline = 0; this.deck = []; this.log = [{ icon: 'info', text: 'El anfitrión terminó la partida.' }];
    this.night = emptyNight(); this.votes.clear(); this.seerSeen.clear(); this.winner = null;
    this.lovers = null; this.peeks.clear(); this.exposedGirls.clear(); this.hunters = []; this.spentHunters.clear(); this.interrupted = null;
    for (const p of this.players) { p.role = null; p.alive = true; p.ready = false; }
  }

  audience(): string[] { return this.players.filter((p) => !p.bot).map((p) => p.id); }

  apply(actorId: string, action: WerewolvesAction, now: number): void {
    const actor = this.players.find((p) => p.id === actorId);
    switch (action.kind) {
      case 'join': {
        if (actor) return;
        if (this.phase !== 'lobby') throw new Error('La partida ya empezó. Espera a la siguiente.');
        if (this.players.length >= MAX_PLAYERS) throw new Error('La mesa está completa.');
        this.players.push({
          id: actorId, name: cleanName(action.name), color: cleanColor(action.color),
          bot: false, alive: true, role: null, ready: false,
        });
        this.leaderId ??= actorId;
        return;
      }
      case 'leave': {
        if (!actor) return;
        if (this.phase === 'lobby' || this.phase === 'end') {
          this.players = this.players.filter((p) => p.id !== actorId);
        } else if (actor.alive) {
          actor.alive = false;
          this.say('info', `${actor.name} abandona la partida.`);
          if (this.phase !== 'hunter') {
            this.interrupted = { phase: this.phase, step: this.step, remaining: Math.max(0, this.deadline - now) };
            this.finishDeaths(now, 'interrupted');
          } else this.finishDeaths(now, this.resumeAfterDeath);
        }
        if (this.leaderId === actorId) this.leaderId = this.players.find((p) => !p.bot && p.id !== actorId)?.id ?? null;
        if (!this.players.some((p) => !p.bot && (this.phase === 'lobby' || p.id !== actorId))) this.reset();
        return;
      }
      case 'add_bot': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') throw new Error('Solo se añaden bots antes de empezar.');
        if (this.players.length >= MAX_PLAYERS) throw new Error('La mesa está completa.');
        const used = new Set(this.players.map((p) => p.name));
        const name = pick(BOT_NAMES.filter((n) => !used.has(n)), this.random) ?? `Bot ${this.players.length + 1}`;
        this.players.push({
          id: `bot:${this.random(1_000_000_000)}`, name, color: pick(BOT_COLORS, this.random)!,
          bot: true, alive: true, role: null, ready: true,
        });
        return;
      }
      case 'remove_bot': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') return;
        this.players = this.players.filter((p) => !(p.bot && p.id === action.id));
        return;
      }
      case 'configure': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') throw new Error('Las cartas se eligen antes de repartir.');
        if (!action.counts || typeof action.counts !== 'object') throw new Error('Set inválido.');
        const next: RoleCounts = {};
        for (const [role, count] of Object.entries(action.counts)) {
          if (role === 'villager') continue;
          if (!Object.hasOwn(ROLE_INFO, role) || !Number.isInteger(count) || count < 0 || count > (role === 'werewolf' ? 3 : 1)) throw new Error('Set inválido.');
          if (role !== 'villager') next[role as WerewolfRole] = count;
        }
        this.counts = next; return;
      }
      case 'peek': {
        if (!actor?.alive || actor.role !== 'girl' || this.phase !== 'night' || this.step !== 'wolves' || this.night.acted.has(actorId)) throw new Error('No puedes espiar ahora.');
        if (action.spy) {
          const wolf = pick(this.alive().filter(p => p.role === 'werewolf'), this.random);
          if (wolf) { const seen = this.peeks.get(actorId) ?? new Set<string>(); seen.add(wolf.id); this.peeks.set(actorId, seen); }
          if (this.random(3) === 0) this.exposedGirls.add(actorId);
        }
        this.night.acted.add(actorId); if (this.stepDone()) this.endStep(now); return;
      }
      case 'hunter': {
        if (this.phase !== 'hunter' || this.hunters[0] !== actorId) throw new Error('No es tu último disparo.');
        if (action.target !== null) this.requireTarget(action.target, p => p.id !== actorId);
        this.hunters.shift();
        if (action.target) { this.players.find(p => p.id === action.target)!.alive = false; this.say('skull', `${actor!.name} dispara a ${this.players.find(p => p.id === action.target)!.name}.`); }
        this.finishDeaths(now, this.resumeAfterDeath); return;
      }
      case 'cupid':
        this.nightAction(this.requireAlive(actor), action, now); return;
      case 'start': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') return;
        this.deck = this.counts ? configuredDeck(this.players.length, this.counts) : roleDeck(this.players.length);
        const cards = shuffle(this.deck, this.random);
        this.players.forEach((p, i) => { p.role = cards[i]; p.alive = true; p.ready = p.bot; });
        this.round = 0;
        this.lovers = null; this.peeks.clear(); this.exposedGirls.clear(); this.hunters = []; this.spentHunters.clear(); this.interrupted = null;
        this.healLeft = true;
        this.poisonLeft = true;
        this.lastGuarded = null;
        this.seerSeen.clear();
        this.winner = null;
        this.verdict = null;
        this.log = [{ icon: 'info', text: `Se reparten ${this.players.length} cartas. Mira la tuya sin que nadie te vea.` }];
        this.enter('reveal', now);
        return;
      }
      case 'ready': {
        if (this.phase !== 'reveal' || !actor) return;
        actor.ready = true;
        if (this.players.every((p) => p.ready)) this.beginNight(now);
        return;
      }
      case 'wolf_vote':
      case 'seer_look':
      case 'guard':
      case 'witch':
        this.nightAction(this.requireAlive(actor), action, now);
        return;
      case 'vote': {
        const voter = this.requireAlive(actor);
        if (this.phase !== 'day') throw new Error('Solo se vota de día.');
        if (action.target !== 'skip') this.requireTarget(action.target, (p) => p.id !== voter.id);
        this.votes.set(voter.id, action.target);
        if (this.alive().every((p) => this.votes.has(p.id))) this.closeVote(now);
        return;
      }
      case 'continue': {
        this.requireLeader(actorId);
        if (this.phase === 'dawn' || this.phase === 'verdict') this.deadline = now;
        this.tick(now);
        return;
      }
      case 'play_again': {
        this.requireLeader(actorId);
        if (this.phase !== 'end') return;
        for (const p of this.players) { p.role = null; p.alive = true; p.ready = false; }
        this.phase = 'lobby';
        this.step = null;
        this.deck = [];
        this.log = [];
        return;
      }
    }
  }

  tick(now: number): boolean {
    if (this.phase === 'lobby' || this.phase === 'end') return false;
    let changed = false;
    if (this.phase === 'hunter') {
      const hunter = this.players.find(p => p.id === this.hunters[0]);
      if (now >= this.deadline || (hunter?.bot && now >= this.botAt)) {
        this.apply(hunter!.id, { kind: 'hunter', target: hunter?.bot ? pick(this.alive(), this.random)?.id ?? null : null }, now); return true;
      }
      return false;
    }
    if (this.phase === 'night' && this.step && now >= this.botAt) changed = this.botsAct(now) || changed;
    if (this.phase === 'day' && now >= this.botAt) changed = this.botsVote(now) || changed;
    // Bots may have just ended the game.
    if ((this.phase as WerewolvesPhase) !== 'end' && now >= this.deadline) {
      changed = true;
      switch (this.phase) {
        case 'reveal': this.beginNight(now); break;
        case 'night': this.endStep(now); break;
        case 'dawn': this.enter('day', now); break;
        case 'day': this.closeVote(now); break;
        case 'verdict': this.beginNight(now); break;
      }
    }
    return changed;
  }

  viewFor(viewerId: string, now: number): WerewolvesView {
    const me = this.players.find((p) => p.id === viewerId) ?? null;
    const over = this.phase === 'end';
    const myRole = me?.role ?? null;
    const knows = (p: WerewolfPlayer): WerewolfRole | null => {
      if (!p.role) return null;
      if (over || p.id === viewerId || !p.alive) return p.role;
      if (myRole === 'werewolf' && p.role === 'werewolf') return 'werewolf';
      if (myRole === 'girl' && this.peeks.get(viewerId)?.has(p.id)) return p.role;
      if (myRole === 'werewolf' && this.exposedGirls.has(p.id)) return p.role;
      if (myRole === 'seer') return this.seerSeen.get(p.id) ?? null;
      return null;
    };
    const preview = this.previewDeck();
    const wolfTurn = myRole === 'werewolf' && this.phase === 'night' && this.step === 'wolves';
    const myTurn = !!me && me.alive && this.phase === 'night' && !!this.step && STEP_ROLE[this.step] === myRole;
    const showVotes = this.phase === 'day' || this.phase === 'verdict';
    return {
      phase: this.phase,
      step: this.phase === 'night' ? this.step : null,
      round: this.round,
      remainingMs: this.phase === 'lobby' || over ? 0 : Math.max(0, this.deadline - now),
      leaderId: this.leaderId,
      me: {
        id: viewerId, seated: !!me, alive: !!me?.alive, role: myRole,
        acted: !!me && ((this.phase === 'night' && this.night.acted.has(me.id)) || (this.phase === 'day' && this.votes.has(me.id)) || (this.phase === 'reveal' && me.ready)),
        isLeader: this.leaderId === viewerId || this.authorityId === viewerId,
      },
      players: this.players.map((p) => ({
        id: p.id, name: p.name, color: p.color, bot: p.bot, alive: p.alive, role: knows(p), ready: p.ready,
        votesFor: showVotes ? this.votes.get(p.id) ?? null : null,
        wolfTarget: wolfTurn ? this.night.wolfVotes.get(p.id) ?? null : null,
      })),
      deck: this.deck.length ? [...this.deck] : preview.deck,
      counts: this.counts ?? Object.fromEntries(Object.keys(ROLE_INFO).map(role => [role, preview.deck.filter(r => r === role).length])), deckError: preview.error,
      loverId: this.lovers?.includes(viewerId) ? this.lovers.find(id => id !== viewerId)! : null,
      peeked: myRole === 'girl' ? [...(this.peeks.get(viewerId) ?? [])] : [],
      hunterTargets: this.phase === 'hunter' && this.hunters[0] === viewerId ? this.alive().map(p => p.id) : [],
      turn: myTurn && this.step ? this.turnFor(me!, this.step) : null,
      seerSeen: myRole === 'seer' || over ? [...this.seerSeen].map(([id, role]) => ({ id, role })) : [],
      nightDeaths: this.phase === 'dawn' || this.phase === 'day' ? [...this.nightDeaths] : [],
      verdict: this.phase === 'verdict' || over ? this.verdict : null,
      winner: this.winner,
      log: this.log.slice(-30),
    };
  }

  private turnFor(me: WerewolfPlayer, step: NightStep): WerewolvesTurn {
    const alive = this.alive();
    const base = { step, victim: null, canHeal: false, canPoison: false, lastGuarded: null };
    switch (step) {
      case 'cupid': return { ...base, targets: alive.map(p => p.id) };
      case 'wolves': return { ...base, targets: alive.filter((p) => p.role !== 'werewolf').map((p) => p.id) };
      case 'seer': return { ...base, targets: alive.filter((p) => p.id !== me.id && !this.seerSeen.has(p.id)).map((p) => p.id) };
      case 'guard': return { ...base, targets: alive.filter((p) => p.id !== this.lastGuarded).map((p) => p.id), lastGuarded: this.lastGuarded };
      case 'witch': return {
        ...base,
        targets: alive.filter((p) => p.id !== me.id).map((p) => p.id),
        victim: this.night.victim,
        canHeal: this.healLeft && !!this.night.victim,
        canPoison: this.poisonLeft,
      };
    }
  }

  private nightAction(actor: WerewolfPlayer, action: WerewolvesAction, now: number): void {
    const step = this.step;
    if (this.phase !== 'night' || !step || STEP_ROLE[step] !== actor.role) throw new Error('No es tu turno. Mantén los ojos cerrados.');
    if (this.night.acted.has(actor.id) && step !== 'wolves') throw new Error('Ya has actuado esta noche.');
    const turn = this.turnFor(actor, step);
    if (action.kind === 'cupid' && step === 'cupid') {
      if (!Array.isArray(action.targets) || action.targets.length !== 2 || action.targets[0] === action.targets[1] || action.targets.some(id => !turn.targets.includes(id))) throw new Error('Elige dos personas distintas.');
      this.lovers = [...action.targets];
    } else if (action.kind === 'wolf_vote' && step === 'wolves') {
      if (!turn.targets.includes(action.target)) throw new Error('Esa persona no puede ser atacada.');
      this.night.wolfVotes.set(actor.id, action.target);
    } else if (action.kind === 'seer_look' && step === 'seer') {
      if (!turn.targets.includes(action.target)) throw new Error('Elige a otra persona viva que no hayas mirado.');
      const target = this.players.find((p) => p.id === action.target)!;
      this.seerSeen.set(target.id, target.role!);
    } else if (action.kind === 'guard' && step === 'guard') {
      if (!turn.targets.includes(action.target)) throw new Error('No puedes proteger a la misma persona dos noches seguidas.');
      this.night.guarded = action.target;
    } else if (action.kind === 'witch' && step === 'witch') {
      if (action.heal && !turn.canHeal) throw new Error('No hay víctima que salvar o ya usaste la poción de vida.');
      if (action.poison !== null && (!turn.canPoison || !turn.targets.includes(action.poison))) throw new Error('No puedes envenenar a esa persona.');
      if (action.heal) { this.night.healed = true; this.healLeft = false; }
      if (action.poison) { this.night.poisoned = action.poison; this.poisonLeft = false; }
    } else {
      throw new Error('Esa acción no corresponde a este turno.');
    }
    this.night.acted.add(actor.id);
    if (this.stepDone()) this.endStep(now);
  }

  private stepDone(): boolean {
    const step = this.step;
    if (!step) return true;
    if (step === 'wolves' && this.alive().some(p => p.role === 'girl' && !this.night.acted.has(p.id))) return false;
    return this.alive().filter((p) => p.role === STEP_ROLE[step]).every((p) => this.night.acted.has(p.id));
  }

  private beginNight(now: number): void {
    this.round += 1;
    this.night = emptyNight();
    this.nightDeaths = [];
    this.votes.clear();
    this.verdict = null;
    this.phase = 'night';
    this.step = null;
    this.say('moon', `Noche ${this.round}. La aldea cierra los ojos.`);
    this.nextStep(now);
  }

  /** Moves to the next night turn that someone alive can play, or to dawn. */
  private nextStep(now: number): void {
    const from = this.step ? NIGHT_ORDER.indexOf(this.step) + 1 : 0;
    for (const step of NIGHT_ORDER.slice(from)) {
      if (step === 'cupid' && this.round > 1) continue;
      if (this.alive().some((p) => p.role === STEP_ROLE[step])) {
        this.step = step;
        this.deadline = now + DURATIONS[step];
        this.botAt = now + this.botDelay();
        return;
      }
    }
    this.step = null;
    this.resolveNight(now);
  }

  private endStep(now: number): void {
    if (this.step === 'wolves') this.night.victim = this.wolfChoice();
    this.nextStep(now);
  }

  private wolfChoice(): string | null {
    const counts = new Map<string, number>();
    for (const target of this.night.wolfVotes.values()) counts.set(target, (counts.get(target) ?? 0) + 1);
    const best = Math.max(0, ...counts.values());
    // A split pack settles it by chance, never by seat order.
    return pick([...counts].filter(([, n]) => n === best && best > 0).map(([id]) => id), this.random) ?? null;
  }

  private resolveNight(now: number): void {
    const deaths = new Set<string>();
    const victim = this.night.victim;
    if (victim && victim !== this.night.guarded && !this.night.healed) deaths.add(victim);
    if (this.night.poisoned) deaths.add(this.night.poisoned);
    this.lastGuarded = this.night.guarded;
    this.nightDeaths = [...deaths].filter((id) => this.players.some((p) => p.id === id && p.alive));
    for (const id of this.nightDeaths) this.players.find((p) => p.id === id)!.alive = false;
    if (!this.nightDeaths.length) this.say('sun', 'Amanece y nadie ha muerto esta noche.');
    for (const id of this.nightDeaths) {
      const p = this.players.find((x) => x.id === id)!;
      this.say('skull', `${p.name} aparece sin vida. Su carta: ${ROLE_INFO[p.role!].name}.`);
    }
    this.finishDeaths(now, 'dawn');
  }

  private closeVote(now: number): void {
    const tally = new Map<string, number>();
    for (const target of this.votes.values()) tally.set(target, (tally.get(target) ?? 0) + 1);
    const best = Math.max(0, ...tally.values());
    const top = [...tally].filter(([, n]) => n === best && best > 0).map(([id]) => id);
    const chosen = top.length === 1 && top[0] !== 'skip' ? top[0] : null;
    this.verdict = { id: chosen, tie: top.length > 1 };
    if (chosen) {
      const p = this.players.find((x) => x.id === chosen)!;
      p.alive = false;
      this.say('vote', `La aldea elimina a ${p.name} con ${best} voto${best === 1 ? '' : 's'}. Su carta: ${ROLE_INFO[p.role!].name}.`);
    } else {
      this.say('vote', top.length > 1 ? 'Empate en la votación: nadie es eliminado hoy.' : 'La aldea decide no eliminar a nadie hoy.');
    }
    this.finishDeaths(now, 'verdict');
  }

  private afterDeaths(now: number): void {
    for (const [voter, target] of this.votes) if (!this.players.some(p => p.id === voter && p.alive) || (target !== 'skip' && !this.players.some(p => p.id === target && p.alive))) this.votes.delete(voter);
    if (this.checkWin()) return;
    if (this.phase === 'night' && this.stepDone()) this.endStep(now);
    else if (this.phase === 'day' && this.alive().every((p) => this.votes.has(p.id))) this.closeVote(now);
  }

  private previewDeck(): { deck: WerewolfRole[]; error: string | null } {
    try { return { deck: this.counts ? configuredDeck(Math.max(MIN_PLAYERS, this.players.length), this.counts) : roleDeck(Math.max(MIN_PLAYERS, this.players.length)), error: null }; }
    catch (e) { return { deck: [], error: e instanceof Error ? e.message : 'Set inválido.' }; }
  }

  private finishDeaths(now: number, resume: 'dawn' | 'verdict' | 'interrupted'): void {
    this.resumeAfterDeath = resume;
    if (this.lovers) {
      const pair = this.lovers.map(id => this.players.find(p => p.id === id)!);
      if (pair.some(p => !p.alive)) for (const p of pair) if (p.alive) { p.alive = false; this.nightDeaths.push(p.id); this.say('skull', `${p.name} muere por su vínculo.`); }
    }
    for (const p of this.players) if (!p.alive && p.role === 'hunter' && !this.spentHunters.has(p.id)) { this.spentHunters.add(p.id); this.hunters.push(p.id); }
    if (this.hunters.length) { this.phase = 'hunter'; this.step = null; this.deadline = now + DURATIONS.hunter; this.botAt = now + 1800; return; }
    if (this.checkWin()) return;
    if (resume !== 'interrupted') this.enter(resume, now);
    else if (this.interrupted) {
      this.phase = this.interrupted.phase; this.step = this.interrupted.step;
      this.deadline = now + this.interrupted.remaining; this.botAt = now + 1000; this.interrupted = null;
      this.afterDeaths(now);
    }
  }

  private checkWin(): boolean {
    const alive = this.alive();
    const wolves = alive.filter((p) => p.role === 'werewolf').length;
    if (this.lovers && alive.length === 2 && this.lovers.every(id => alive.some(p => p.id === id)) && (alive[0].role === 'werewolf') !== (alive[1].role === 'werewolf')) this.winner = 'lovers';
    else if (wolves === 0) this.winner = 'aldea';
    else if (wolves >= alive.length - wolves) this.winner = 'lobos';
    else return false;
    this.phase = 'end';
    this.step = null;
    this.say('trophy', this.winner === 'lovers' ? '¡Ganan los enamorados!' : this.winner === 'aldea' ? '¡Gana la aldea! No queda ningún hombre lobo.' : '¡Ganan los hombres lobo! Ya son tantos como los aldeanos.');
    return true;
  }

  private enter(phase: 'reveal' | 'dawn' | 'day' | 'verdict', now: number): void {
    this.phase = phase;
    this.step = null;
    this.deadline = now + DURATIONS[phase];
    if (phase === 'day') {
      this.votes.clear();
      this.botAt = now + 4_000 + this.random(6_000);
      this.say('sun', `Día ${this.round}. Debatid y votad a quién eliminar.`);
    }
  }

  private botsAct(now: number): boolean {
    const step = this.step!;
    let changed = false;
    if (step === 'wolves') for (const girl of this.alive().filter(p => p.bot && p.role === 'girl' && !this.night.acted.has(p.id))) { this.apply(girl.id, { kind: 'peek', spy: this.random(2) === 0 }, now); changed = true; }
    const bots = this.alive().filter((p) => p.bot && p.role === STEP_ROLE[step] && !this.night.acted.has(p.id));
    if (!bots.length) return changed;
    for (const bot of bots) {
      if (this.phase !== 'night' || this.step !== step) break;
      const turn = this.turnFor(bot, step);
      if (step === 'cupid') { const targets = shuffle(turn.targets, this.random).slice(0, 2) as [string, string]; this.nightAction(bot, { kind: 'cupid', targets }, now); continue; }
      if (step === 'witch') {
        const heal = turn.canHeal && this.random(2) === 0;
        const poison = turn.canPoison && this.random(5) === 0 ? pick(turn.targets, this.random) ?? null : null;
        this.nightAction(bot, { kind: 'witch', heal, poison }, now);
        continue;
      }
      // A bot wolf follows a packmate's choice half the time, like a real pack.
      const packChoice = step === 'wolves' ? pick([...this.night.wolfVotes.values()], this.random) : undefined;
      const target = packChoice && this.random(2) === 0 ? packChoice : pick(turn.targets, this.random);
      if (!target) { this.night.acted.add(bot.id); continue; }
      const kind = step === 'wolves' ? 'wolf_vote' : step === 'seer' ? 'seer_look' : 'guard';
      this.nightAction(bot, { kind, target }, now);
    }
    if (this.phase === 'night' && this.step === step && this.stepDone()) this.endStep(now);
    return true;
  }

  private botsVote(now: number): boolean {
    const bots = this.alive().filter((p) => p.bot && !this.votes.has(p.id));
    if (!bots.length) return false;
    // One bot at a time, so votes trickle in instead of landing together.
    const bot = pick(bots, this.random)!;
    const others = this.alive().filter((p) => p.id !== bot.id && !(bot.role === 'werewolf' && p.role === 'werewolf'));
    const leaning = [...this.votes.values()].filter((t) => others.some((p) => p.id === t));
    const target = leaning.length && this.random(3) === 0 ? pick(leaning, this.random)! : pick(others, this.random)?.id ?? 'skip';
    this.votes.set(bot.id, target);
    this.botAt = now + 1_500 + this.random(4_000);
    if (this.alive().every((p) => this.votes.has(p.id))) this.closeVote(now);
    return true;
  }

  private botDelay(): number { return BOT_DELAY[0] + this.random(BOT_DELAY[1] - BOT_DELAY[0]); }
  private alive(): WerewolfPlayer[] { return this.players.filter((p) => p.alive); }
  private say(icon: LogEntry['icon'], text: string): void { this.log.push({ icon, text }); if (this.log.length > 60) this.log.shift(); }

  private reset(): void {
    this.players = [];
    this.phase = 'lobby';
    this.step = null;
    this.leaderId = null;
    this.deck = [];
    this.log = [];
  }

  private requireLeader(actorId: string): void {
    if (actorId !== this.leaderId && actorId !== this.authorityId) throw new Error('Solo quien abrió la mesa puede hacer eso.');
  }

  private requireAlive(actor: WerewolfPlayer | undefined): WerewolfPlayer {
    if (!actor || !actor.alive) throw new Error('Solo las personas vivas de la partida pueden actuar.');
    return actor;
  }

  private requireTarget(id: string, allowed: (p: WerewolfPlayer) => boolean): void {
    const target = this.players.find((p) => p.id === id);
    if (!target || !target.alive || !allowed(target)) throw new Error('Elige a otra persona viva.');
  }
}

function cleanName(name: string): string { return String(name ?? '').trim().slice(0, 24) || 'Vecino'; }
function cleanColor(color: string): string { return /^#[0-9a-fA-F]{6}$/.test(String(color)) ? color : '#c96f53'; }
```

### app/src/ui/werewolves-ui.ts

Archivo completo de referencia.

SHA-256 del bloque: `902c6057acf674bee5c7c4d3b53b4956dc41edc46eec3b0bc78167ef9ee355f7`.

```ts
import {
  MAX_PLAYERS, MIN_PLAYERS, ROLE_INFO, STEP_CALL, presetRoles, type RoleCounts,
  type WerewolfRole, type WerewolvesAction, type WerewolvesView,
} from '../minigames/werewolves';
import { colorIcon, monoIcon } from './pixel-icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function btn(label: string, className = 'ww-btn'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

const PHASE_TITLE: Record<WerewolvesView['phase'], string> = {
  hunter: 'El último disparo', lobby: 'La mesa de la hoguera', reveal: 'Mira tu carta', night: 'Noche', dawn: 'Amanece',
  day: 'Día: la aldea vota', verdict: 'Veredicto', end: 'Fin de la partida',
};

export interface WerewolvesPanelContext {
  send(action: WerewolvesAction): void;
  close(): void;
  me(): { name: string; color: string };
}

/**
 * The game table. Seats sit around the fire; each card shows only what you
 * know about that person. Night is dark and quiet unless it is your turn.
 */
export class WerewolvesPanel {
  readonly root = el('section', 'ww');
  private view: WerewolvesView | null = null;
  private receivedAt = 0;
  private selected: string | null = null;
  private heal = false;
  private timerEl: HTMLElement | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private errorText = '';
  private turnKey = '';
  private cardsOpen = false;

  constructor(private readonly ctx: WerewolvesPanelContext) {
    this.root.setAttribute('aria-label', 'Hombres lobo');
  }

  mount(container: HTMLElement): void {
    container.replaceChildren(this.root);
    this.clock ??= setInterval(() => this.paintTimer(), 250);
    this.render();
  }

  unmount(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    this.root.remove();
  }

  update(view: WerewolvesView | null, error: string | null): void {
    if (view) {
      const key = `${view.phase}:${view.round}:${view.step}`;
      if (key !== this.turnKey) { this.turnKey = key; this.selected = null; this.heal = false; }
      this.view = view;
      this.receivedAt = Date.now();
    }
    this.errorText = error ?? '';
    this.render();
  }

  private remaining(): number {
    return this.view ? Math.max(0, this.view.remainingMs - (Date.now() - this.receivedAt)) : 0;
  }

  private paintTimer(): void {
    if (!this.timerEl || !this.view) return;
    const s = Math.ceil(this.remaining() / 1000);
    this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('is-low', s <= 10);
  }

  private render(): void {
    const v = this.view;
    this.root.replaceChildren();
    this.root.dataset.phase = v?.phase ?? 'lobby';
    this.root.dataset.dark = String(!!v && (v.phase === 'night' || v.phase === 'reveal'));
    this.root.append(this.header(v));
    if (!v) {
      this.root.append(el('p', 'ww-empty', 'Conectando con la mesa…'));
      return;
    }
    const body = el('div', 'ww-body');
    const side = el('div', 'ww-side');
    side.append(this.myCard(v), this.actionBox(v));
    if (this.errorText) side.append(el('p', 'ww-error', this.errorText));
    side.append(this.logBox(v));
    body.append(this.table(v), side);
    this.root.append(body);
    if (v.phase === 'lobby') { const setup = this.cardSetup(v); body.prepend(setup); }
    this.paintTimer();
  }

  private header(v: WerewolvesView | null): HTMLElement {
    const head = el('header', 'ww-head');
    const phaseIcon = el('span', 'ww-phase-icon');
    phaseIcon.append(colorIcon(!v || v.phase === 'lobby' || v.phase === 'end' ? 'werewolf' : v.phase === 'night' || v.phase === 'reveal' ? 'moon' : 'sun', 28));
    const titles = el('div', 'ww-titles');
    const title = v?.phase === 'night' ? `Noche ${v.round}` : v?.phase === 'day' ? `Día ${v.round}: la aldea vota` : PHASE_TITLE[v?.phase ?? 'lobby'];
    titles.append(el('h2', '', title), el('p', '', this.subtitle(v)));
    head.append(phaseIcon, titles);
    if (v && v.phase !== 'lobby' && v.phase !== 'end') {
      this.timerEl = el('span', 'ww-timer');
      this.timerEl.setAttribute('aria-label', 'Tiempo restante');
      head.append(this.timerEl);
    } else this.timerEl = null;
    const close = btn('', 'ww-icon-btn');
    close.append(monoIcon('close', 14));
    close.setAttribute('aria-label', 'Cerrar');
    close.dataset.testid = 'expansion-modal-close';
    close.addEventListener('click', () => this.ctx.close());
    head.append(close);
    return head;
  }

  private subtitle(v: WerewolvesView | null): string {
    if (!v) return '';
    switch (v.phase) {
      case 'lobby': return `De ${MIN_PLAYERS} a ${MAX_PLAYERS} jugadores. Si faltan personas, añade bots.`;
      case 'reveal': return 'Solo tú ves tu carta. Pulsa «Entendido» cuando la recuerdes.';
      case 'night': return v.step ? `${STEP_CALL[v.step]}.` : 'La aldea duerme.';
      case 'dawn': return v.nightDeaths.length ? 'La noche ha dejado víctimas.' : 'Nadie ha muerto esta noche.';
      case 'day': return 'Hablad por voz, sospechad y elegid. Gana la mayoría; con empate no muere nadie.';
      case 'verdict': return 'La aldea ha decidido.';
      case 'hunter': return 'El cazador puede elegir una última víctima antes de continuar.';
      case 'end': return v.winner === 'lovers' ? '¡Ganan los enamorados!' : v.winner === 'aldea' ? '¡La aldea gana!' : '¡Los hombres lobo ganan!';
    }
  }

  private cardSetup(v: WerewolvesView): HTMLElement {
    const setup = el('details', 'ww-card sv-role-setup'); setup.open = this.cardsOpen;
    const summary = el('summary', '', 'Elegir cartas y sets');
    summary.addEventListener('click', e => { e.preventDefault(); this.cardsOpen = !this.cardsOpen; setup.open = this.cardsOpen; });
    setup.append(summary);
    const presets = el('select', 'sv-select'); presets.setAttribute('aria-label', 'Set de cartas');
    for (const [value, name] of [['', 'Elegir set'], ['basic', 'Básico'], ['classic', 'Clásico'], ['bonds', 'Vínculos']]) { const o = el('option', '', name); o.value = value; presets.append(o); }
    let saved: Record<string, RoleCounts> = {};
    try { const raw = JSON.parse(localStorage.getItem('studyvillage-role-sets') || '{}'); saved = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}; } catch { /* no saved sets */ }
    for (const key of Object.keys(saved)) { const o = el('option', '', key); o.value = `saved:${key}`; presets.append(o); }
    presets.disabled = !v.me.isLeader;
    presets.addEventListener('change', () => { if (presets.value) this.ctx.send({ kind: 'configure', counts: presets.value.startsWith('saved:') ? saved[presets.value.slice(6)] : presetRoles(presets.value, v.players.length) }); });
    setup.append(presets);
    const grid = el('div', 'sv-role-catalog');
    for (const role of Object.keys(ROLE_INFO) as WerewolfRole[]) {
      const card = el('article', 'sv-role-card'); card.append(colorIcon(role, 38), el('h4', '', ROLE_INFO[role].name), el('p', '', ROLE_INFO[role].goal));
      const amount = el('input'); amount.type = 'number'; amount.min = '0'; amount.max = role === 'werewolf' ? '3' : '1';
      amount.value = String(role === 'villager' ? v.deck.filter(r => r === role).length : v.counts[role] ?? 0);
      amount.disabled = !v.me.isLeader || role === 'villager'; amount.setAttribute('aria-label', `Cantidad: ${ROLE_INFO[role].name}`);
      amount.addEventListener('change', () => this.ctx.send({ kind: 'configure', counts: { ...v.counts, [role]: Number(amount.value) } }));
      card.append(amount); grid.append(card);
    }
    setup.append(grid, el('p', 'ww-muted', 'Las plazas sin carta especial se completan con ciudadanos.'));
    if (v.deckError) setup.append(el('p', 'ww-error', v.deckError));
    if (v.me.isLeader) {
      const input = el('input', 'sv-input'); input.placeholder = 'Nombre del set'; input.maxLength = 40;
      const save = btn('Guardar set'); save.addEventListener('click', () => { const name = input.value.trim(); if (!name) return; saved[name] = v.counts; localStorage.setItem('studyvillage-role-sets', JSON.stringify(Object.fromEntries(Object.entries(saved).slice(-12)))); this.render(); });
      setup.append(input, save);
    }
    return setup;
  }

  private table(v: WerewolvesView): HTMLElement {
    const table = el('div', 'ww-table');
    const selectable = this.selectableTargets(v);
    const tally = new Map<string, number>();
    for (const p of v.players) if (p.votesFor && p.votesFor !== 'skip') tally.set(p.votesFor, (tally.get(p.votesFor) ?? 0) + 1);
    const packMarks = new Map<string, number>();
    for (const p of v.players) if (p.wolfTarget) packMarks.set(p.wolfTarget, (packMarks.get(p.wolfTarget) ?? 0) + 1);

    for (const p of v.players) {
      const seat = btn('', 'ww-seat');
      seat.classList.toggle('is-me', p.id === v.me.id);
      seat.classList.toggle('is-dead', !p.alive);
      seat.classList.toggle('is-selected', this.selected === p.id);
      const canPick = selectable.includes(p.id);
      seat.classList.toggle('is-pickable', canPick);
      seat.disabled = !canPick && !(v.phase === 'lobby' && p.bot && v.me.isLeader);
      seat.setAttribute('aria-label', `${p.name}${p.alive ? '' : ' (eliminado)'}${p.role ? `, ${ROLE_INFO[p.role].name}` : ''}`);

      const avatar = el('span', 'ww-avatar', p.name.slice(0, 1).toUpperCase());
      avatar.style.backgroundColor = p.color;
      const badge = el('span', 'ww-role-badge');
      badge.append(colorIcon(!p.alive ? 'dead' : p.role ?? 'unknown', 22, p.role ? ROLE_INFO[p.role].name : 'Carta oculta'));
      avatar.append(badge);
      const name = el('span', 'ww-seat-name', p.id === v.me.id ? `${p.name} (tú)` : p.name);
      const status = el('span', 'ww-seat-status', this.seatStatus(v, p, tally.get(p.id) ?? 0));
      seat.append(avatar, name, status);
      if (packMarks.get(p.id)) {
        const mark = el('span', 'ww-pack-mark');
        mark.append(colorIcon('werewolf', 16), el('span', '', `×${packMarks.get(p.id)}`));
        seat.append(mark);
      }
      if (v.phase === 'lobby' && p.bot && v.me.isLeader) {
        seat.title = 'Quitar bot';
        seat.classList.add('is-removable');
        seat.addEventListener('click', () => this.ctx.send({ kind: 'remove_bot', id: p.id }));
      } else if (canPick) {
        seat.addEventListener('click', () => { this.selected = this.selected === p.id ? null : p.id; this.render(); });
      }
      table.append(seat);
    }
    if (v.phase === 'lobby') {
      for (let i = v.players.length; i < Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, v.players.length + 1)); i++) {
        const empty = el('div', 'ww-seat is-empty');
        empty.append(el('span', 'ww-avatar'), el('span', 'ww-seat-name', 'Sitio libre'));
        table.append(empty);
      }
    }
    return table;
  }

  private seatStatus(v: WerewolvesView, p: WerewolvesView['players'][number], votes: number): string {
    if (!p.alive) return p.role ? ROLE_INFO[p.role].name : 'Eliminado';
    if (v.phase === 'lobby') return p.bot ? 'Bot' : p.id === v.leaderId ? 'Anfitrión' : 'Listo';
    if (v.phase === 'reveal') return p.ready ? 'Listo' : 'Mirando su carta…';
    if (v.phase === 'day' || v.phase === 'verdict') {
      const target = p.votesFor === 'skip' ? 'nadie' : v.players.find((x) => x.id === p.votesFor)?.name;
      const got = votes ? `${votes} voto${votes === 1 ? '' : 's'}` : '';
      return [got, target ? `vota a ${target}` : ''].filter(Boolean).join(' · ') || 'Pensando…';
    }
    if (v.phase === 'end' && p.role) return ROLE_INFO[p.role].name;
    return p.role && p.id !== v.me.id ? ROLE_INFO[p.role].name : '';
  }

  private selectableTargets(v: WerewolvesView): string[] {
    if (v.turn && !v.me.acted) return v.turn.step === 'witch' ? (v.turn.canPoison ? v.turn.targets : []) : v.turn.targets;
    if (v.turn?.step === 'wolves') return v.turn.targets;
    if (v.phase === 'day' && v.me.alive) return v.players.filter((p) => p.alive && p.id !== v.me.id).map((p) => p.id);
    return [];
  }

  private myCard(v: WerewolvesView): HTMLElement {
    const card = el('div', 'ww-card');
    if (v.phase === 'lobby' || !v.me.role) {
      card.append(el('h3', '', v.phase === 'lobby' ? 'Cartas en juego' : 'Partida en curso'));
      if (!v.deck.length) card.append(el('p', 'ww-muted', `Hacen falta al menos ${MIN_PLAYERS} jugadores para repartir cartas.`));
      const counts = new Map<WerewolfRole, number>();
      for (const r of v.deck) counts.set(r, (counts.get(r) ?? 0) + 1);
      const list = el('ul', 'ww-deck');
      for (const [role, n] of counts) {
        const item = el('li');
        item.append(colorIcon(role, 22), el('strong', '', `${n} × ${n === 1 ? ROLE_INFO[role].name : ROLE_INFO[role].plural}`), el('span', '', ROLE_INFO[role].goal));
        list.append(item);
      }
      card.append(list);
      if (v.phase !== 'lobby') card.append(el('p', 'ww-muted', 'Estás mirando. Podrás sentarte en la siguiente partida.'));
      return card;
    }
    const role = v.me.role;
    card.classList.add('is-role', `is-${ROLE_INFO[role].team}`);
    const art = el('div', 'ww-card-art');
    art.append(colorIcon(role, 56, ROLE_INFO[role].name));
    card.append(art, el('div', 'ww-card-team', ROLE_INFO[role].team === 'lobos' ? 'Equipo lobos' : 'Equipo aldea'),
      el('h3', '', ROLE_INFO[role].name), el('p', '', ROLE_INFO[role].goal));
    if (v.loverId) card.append(el('p', 'ww-muted', `Tu vínculo: ${v.players.find(p => p.id === v.loverId)?.name ?? ''}`));
    if (v.peeked.length) card.append(el('p', 'ww-muted', `Has visto a: ${v.peeked.map(id => v.players.find(p => p.id === id)?.name).join(', ')}`));
    if (!v.me.alive && v.phase !== 'end') card.append(el('p', 'ww-muted', 'Has sido eliminado. Puedes seguir mirando en silencio.'));
    const allies = v.players.filter((p) => p.id !== v.me.id && p.role === 'werewolf' && role === 'werewolf');
    if (allies.length) card.append(el('p', 'ww-muted', `Tu manada: ${allies.map((p) => p.name).join(', ')}.`));
    if (v.seerSeen.length && role === 'seer') {
      const seen = el('ul', 'ww-seen');
      for (const s of v.seerSeen) {
        const who = v.players.find((p) => p.id === s.id)?.name ?? '¿?';
        const li = el('li');
        li.append(colorIcon(s.role, 18), el('span', '', `${who}: ${ROLE_INFO[s.role].name}`));
        seen.append(li);
      }
      card.append(el('h4', '', 'Lo que has visto'), seen);
    }
    return card;
  }

  private actionBox(v: WerewolvesView): HTMLElement {
    const box = el('div', 'ww-action');
    const name = (id: string | null) => v.players.find((p) => p.id === id)?.name ?? '';
    const primary = (label: string, action: () => void, enabled = true) => {
      const b = btn(label, 'ww-btn ww-btn-primary');
      b.disabled = !enabled;
      b.addEventListener('click', action);
      box.append(b);
      return b;
    };
    const secondary = (label: string, action: () => void) => {
      const b = btn(label, 'ww-btn');
      b.addEventListener('click', action);
      box.append(b);
      return b;
    };

    if (v.phase === 'hunter' && v.hunterTargets.length) {
      for (const id of v.hunterTargets) primary(`Disparar a ${name(id)}`, () => this.ctx.send({ kind: 'hunter', target: id }));
      secondary('No disparar', () => this.ctx.send({ kind: 'hunter', target: null })); return box;
    }
    if (v.phase === 'night' && v.me.alive && v.me.role === 'girl' && v.step === 'wolves' && !v.me.acted) {
      box.append(el('p', '', 'Espiar revela un lobo. Riesgo de ser descubierta: 33 %.'));
      primary('Espiar', () => this.ctx.send({ kind: 'peek', spy: true }));
      secondary('No espiar', () => this.ctx.send({ kind: 'peek', spy: false })); return box;
    }
    if (v.turn?.step === 'cupid' && !v.me.acted) {
      const selects = [el('select', 'sv-select'), el('select', 'sv-select')];
      selects.forEach((input, i) => { input.setAttribute('aria-label', `Enamorado ${i + 1}`); for (const id of v.turn!.targets) { const o = el('option', '', name(id)); o.value = id; input.append(o); } box.append(input); });
      if (selects[1].options.length > 1) selects[1].selectedIndex = 1;
      primary('Unir enamorados', () => this.ctx.send({ kind: 'cupid', targets: [selects[0].value, selects[1].value] })); return box;
    }
    switch (v.phase) {
      case 'hunter': box.append(el('p', '', 'El cazador decide su último disparo…')); break;
      case 'lobby': {
        if (!v.me.seated) {
          box.append(el('p', '', 'Siéntate junto al fuego para jugar.'));
          primary('Sentarme a la mesa', () => this.ctx.send({ kind: 'join', ...this.ctx.me() }));
          break;
        }
        if (v.me.isLeader) {
          const need = MIN_PLAYERS - v.players.length;
          box.append(el('p', '', need > 0 ? `Faltan ${need} jugador${need === 1 ? '' : 'es'}. Espera a tus vecinos o añade bots.` : 'Todo listo. Cuando empieces, cada uno recibirá una carta al azar.'));
          const add = secondary('Añadir bot', () => this.ctx.send({ kind: 'add_bot' }));
          add.disabled = v.players.length >= MAX_PLAYERS;
          primary('Repartir cartas', () => this.ctx.send({ kind: 'start' }), v.players.length >= MIN_PLAYERS && !v.deckError);
          if (v.players.some((p) => p.bot)) box.append(el('p', 'ww-muted', 'Pulsa un bot para quitarlo.'));
        } else {
          box.append(el('p', '', `Esperando a que ${name(v.leaderId) || 'el anfitrión'} reparta las cartas…`));
        }
        secondary('Levantarme', () => this.ctx.send({ kind: 'leave' }));
        break;
      }
      case 'reveal':
        if (v.me.seated) {
          if (v.me.acted) box.append(el('p', '', 'Esperando a los demás…'));
          else primary('Entendido', () => this.ctx.send({ kind: 'ready' }));
        }
        break;
      case 'night': {
        const t = v.turn;
        if (!t) {
          box.classList.add('is-sleeping');
          box.append(el('p', 'ww-sleep', v.me.alive ? 'Cierra los ojos… no es tu turno.' : 'Observas la noche en silencio.'));
          break;
        }
        if (t.step === 'wolves') {
          box.append(el('p', '', v.me.acted ? 'Has elegido. Puedes cambiar mientras tu manada decide.' : 'Elige a quién atacar esta noche.'));
          primary(this.selected ? `Atacar a ${name(this.selected)}` : 'Elige una víctima', () => this.selected && this.ctx.send({ kind: 'wolf_vote', target: this.selected }), !!this.selected);
        } else if (v.me.acted) {
          box.append(el('p', '', 'Hecho. Vuelve a cerrar los ojos.'));
        } else if (t.step === 'seer') {
          box.append(el('p', '', 'Elige la carta de quién quieres mirar.'));
          primary(this.selected ? `Mirar la carta de ${name(this.selected)}` : 'Elige a alguien', () => this.selected && this.ctx.send({ kind: 'seer_look', target: this.selected }), !!this.selected);
        } else if (t.step === 'guard') {
          box.append(el('p', '', t.lastGuarded ? `Elige a quién proteger (anoche: ${name(t.lastGuarded)}).` : 'Elige a quién proteger esta noche. Puedes ser tú.'));
          primary(this.selected ? `Proteger a ${name(this.selected)}` : 'Elige a alguien', () => this.selected && this.ctx.send({ kind: 'guard', target: this.selected }), !!this.selected);
        } else {
          box.append(el('p', '', t.victim ? `Los lobos han atacado a ${name(t.victim)}.` : 'Esta noche los lobos no han atacado a nadie.'));
          if (t.canHeal) {
            const toggle = el('label', 'ww-check');
            const input = el('input');
            input.type = 'checkbox';
            input.checked = this.heal;
            input.addEventListener('change', () => { this.heal = input.checked; this.render(); });
            toggle.append(input, el('span', '', `Salvar a ${name(t.victim)} (poción de vida)`));
            box.append(toggle);
          }
          box.append(el('p', 'ww-muted', t.canPoison ? 'Pulsa a alguien si quieres envenenarlo (opcional).' : 'Ya usaste tu poción de veneno.'));
          const label = [this.heal ? 'salvar' : '', this.selected ? `envenenar a ${name(this.selected)}` : ''].filter(Boolean).join(' y ');
          primary(label ? `Usar: ${label}` : 'No usar pociones', () => this.ctx.send({ kind: 'witch', heal: this.heal, poison: this.selected }));
        }
        break;
      }
      case 'dawn':
        if (v.nightDeaths.length) {
          for (const id of v.nightDeaths) {
            const p = v.players.find((x) => x.id === id);
            const row = el('p', 'ww-death');
            row.append(colorIcon('dead', 20), el('span', '', `${p?.name ?? '¿?'} · ${p?.role ? ROLE_INFO[p.role].name : ''}`));
            box.append(row);
          }
        } else box.append(el('p', '', 'Todos despiertan sanos y salvos.'));
        if (v.me.isLeader) secondary('Empezar el día', () => this.ctx.send({ kind: 'continue' }));
        break;
      case 'day': {
        if (!v.me.alive) { box.append(el('p', 'ww-muted', 'Los eliminados no votan.')); break; }
        const mine = v.players.find((p) => p.id === v.me.id)?.votesFor;
        if (mine) box.append(el('p', '', `Tu voto: ${mine === 'skip' ? 'no eliminar a nadie' : name(mine)}. Puedes cambiarlo.`));
        else box.append(el('p', '', 'Pulsa a alguien y vota.'));
        primary(this.selected ? `Votar a ${name(this.selected)}` : 'Elige a alguien', () => this.selected && this.ctx.send({ kind: 'vote', target: this.selected }), !!this.selected);
        secondary('No eliminar a nadie', () => this.ctx.send({ kind: 'vote', target: 'skip' }));
        break;
      }
      case 'verdict': {
        const p = v.verdict?.id ? v.players.find((x) => x.id === v.verdict!.id) : null;
        if (p) {
          const row = el('p', 'ww-death');
          row.append(colorIcon(p.role ?? 'dead', 22), el('span', '', `${p.name} era ${p.role ? ROLE_INFO[p.role].name.toLowerCase() : '¿?'}.`));
          box.append(row);
        } else box.append(el('p', '', v.verdict?.tie ? 'Empate: nadie es eliminado.' : 'Nadie es eliminado hoy.'));
        if (v.me.isLeader) secondary('Caer la noche', () => this.ctx.send({ kind: 'continue' }));
        break;
      }
      case 'end': {
        const banner = el('div', `ww-winner is-${v.winner}`);
        banner.append(colorIcon(v.winner === 'lobos' ? 'werewolf' : 'trophy', 36), el('strong', '', v.winner === 'lovers' ? 'Ganan los enamorados' : v.winner === 'lobos' ? 'Ganan los hombres lobo' : 'Gana la aldea'));
        box.append(banner);
        if (v.me.isLeader) primary('Jugar otra vez', () => this.ctx.send({ kind: 'play_again' }));
        if (v.me.seated) secondary('Levantarme', () => this.ctx.send({ kind: 'leave' }));
        break;
      }
    }
    return box;
  }

  private logBox(v: WerewolvesView): HTMLElement {
    const box = el('ol', 'ww-log');
    box.setAttribute('aria-label', 'Narrador');
    for (const entry of [...v.log].reverse().slice(0, 12)) {
      const li = el('li');
      li.append(colorIcon(entry.icon, 16), el('span', '', entry.text));
      box.append(li);
    }
    return box;
  }
}
```

### app/src/ui/pixel-icons.ts

Archivo completo de referencia.

SHA-256 del bloque: `50c8ff07c52caa061a0dcc76e64bb1f1254eae8f5584986c1189f258766ce0c4`.

```ts
/**
 * Pixel icons drawn as rects on a 12×12 grid, matching the village art.
 * Mono icons inherit currentColor; role icons carry their own palette so a
 * card reads at a glance even at 20px.
 */
type Rect = readonly [number, number, number, number];
type ColorRect = readonly [number, number, number, number, string];

const NS = 'http://www.w3.org/2000/svg';

function svg(size: number, label?: string): SVGSVGElement {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 12 12');
  el.setAttribute('width', String(size));
  el.setAttribute('height', String(size));
  el.setAttribute('shape-rendering', 'crispEdges');
  el.setAttribute('focusable', 'false');
  if (label) { el.setAttribute('role', 'img'); el.setAttribute('aria-label', label); }
  else el.setAttribute('aria-hidden', 'true');
  return el;
}

function rect(parent: SVGSVGElement, [x, y, w, h]: Rect, fill?: string): void {
  const r = document.createElementNS(NS, 'rect');
  r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
  r.setAttribute('width', String(w)); r.setAttribute('height', String(h));
  if (fill) r.setAttribute('fill', fill);
  parent.append(r);
}

export const MONO_ICONS: Record<string, readonly Rect[]> = {
  world: [[2, 3, 2, 1], [1, 4, 4, 1], [1, 5, 1, 6], [4, 5, 1, 6], [2, 8, 2, 3],
    [8, 5, 2, 1], [7, 6, 4, 1], [7, 7, 1, 4], [10, 7, 1, 4], [0, 11, 12, 1]],
  house: [[5, 1, 2, 1], [4, 2, 4, 1], [3, 3, 6, 1], [2, 4, 8, 1],
    [2, 5, 2, 6], [8, 5, 2, 6], [4, 10, 4, 1], [5, 7, 2, 3]],
  contacts: [[7, 1, 3, 3], [6, 5, 5, 3], [2, 3, 3, 3], [1, 7, 5, 4]],
  mic: [[5, 1, 2, 1], [4, 2, 4, 5], [5, 7, 2, 1], [2, 5, 1, 2], [9, 5, 1, 2], [3, 7, 1, 1], [8, 7, 1, 1],
    [4, 8, 4, 1], [5, 9, 2, 1], [3, 10, 6, 1]],
  micOff: [[5, 1, 2, 1], [4, 2, 4, 5], [5, 7, 2, 1], [4, 8, 4, 1], [5, 9, 2, 1], [3, 10, 6, 1],
    [0, 0, 1, 1], [1, 1, 1, 1], [2, 2, 1, 1], [3, 3, 1, 1], [8, 8, 1, 1], [9, 9, 1, 1], [10, 10, 1, 1], [11, 11, 1, 1]],
  headphones: [[3, 2, 6, 1], [2, 3, 1, 1], [9, 3, 1, 1], [1, 4, 1, 4], [10, 4, 1, 4], [1, 7, 3, 4], [8, 7, 3, 4]],
  screen: [[0, 1, 12, 1], [0, 2, 1, 7], [11, 2, 1, 7], [0, 8, 12, 1], [5, 9, 2, 1], [3, 10, 6, 1], [5, 4, 2, 3], [4, 5, 4, 1]],
  code: [[3, 2, 1, 1], [2, 3, 1, 1], [1, 4, 1, 4], [2, 8, 1, 1], [3, 9, 1, 1],
    [8, 2, 1, 1], [9, 3, 1, 1], [10, 4, 1, 4], [9, 8, 1, 1], [8, 9, 1, 1], [6, 2, 1, 2], [5, 5, 1, 2], [5, 8, 1, 2]],
  notes: [[2, 0, 7, 1], [2, 11, 8, 1], [1, 1, 1, 10], [10, 3, 1, 8], [9, 1, 1, 1], [9, 2, 2, 1],
    [3, 3, 5, 1], [3, 5, 6, 1], [3, 7, 6, 1], [3, 9, 4, 1]],
  cards: [[1, 3, 7, 1], [1, 4, 1, 7], [7, 4, 1, 7], [1, 10, 7, 1], [4, 1, 7, 1], [10, 2, 1, 7], [8, 8, 2, 1], [3, 6, 3, 1]],
  gear: [[5, 0, 2, 2], [5, 10, 2, 2], [0, 5, 2, 2], [10, 5, 2, 2], [2, 2, 2, 1], [8, 2, 2, 1], [2, 9, 2, 1], [8, 9, 2, 1],
    [3, 3, 6, 1], [3, 8, 6, 1], [2, 4, 1, 4], [9, 4, 1, 4], [3, 4, 2, 1], [7, 4, 2, 1], [3, 7, 2, 1], [7, 7, 2, 1], [3, 5, 1, 2], [8, 5, 1, 2]],
  door: [[2, 0, 8, 1], [2, 1, 1, 11], [9, 1, 1, 11], [3, 1, 6, 1], [7, 6, 1, 1], [0, 11, 12, 1]],
  brush: [[9, 0, 2, 1], [8, 1, 3, 1], [7, 2, 3, 1], [6, 3, 3, 1], [5, 4, 3, 1], [4, 5, 2, 1], [2, 6, 3, 2], [1, 8, 3, 2], [0, 10, 2, 2]],
  board: [[1, 1, 10, 1], [1, 7, 10, 1], [1, 2, 1, 5], [10, 2, 1, 5], [3, 3, 5, 1], [3, 5, 3, 1], [5, 8, 2, 2], [3, 10, 6, 1]],
  chat: [[1, 1, 10, 1], [0, 2, 1, 6], [11, 2, 1, 6], [1, 8, 5, 1], [7, 8, 4, 1], [3, 9, 2, 1], [2, 10, 2, 1], [3, 4, 6, 1]],
  phone: [[3, 0, 6, 1], [2, 1, 1, 10], [9, 1, 1, 10], [3, 11, 6, 1], [3, 2, 6, 7], [5, 10, 2, 1]],
  close: [[1, 1, 2, 2], [3, 3, 2, 2], [5, 5, 2, 2], [7, 7, 2, 2], [9, 9, 2, 2], [9, 1, 2, 2], [7, 3, 2, 2], [3, 7, 2, 2], [1, 9, 2, 2]],
  back: [[3, 5, 8, 2], [4, 3, 2, 2], [2, 4, 2, 4], [4, 7, 2, 2], [6, 2, 1, 1], [6, 9, 1, 1]],
  link: [[1, 4, 4, 1], [0, 5, 1, 2], [1, 7, 4, 1], [7, 4, 4, 1], [11, 5, 1, 2], [7, 7, 4, 1], [4, 5, 4, 2]],
  plus: [[5, 1, 2, 10], [1, 5, 10, 2]],
  check: [[1, 6, 2, 2], [3, 8, 2, 2], [5, 6, 2, 2], [7, 4, 2, 2], [9, 2, 2, 2]],
  trash: [[4, 0, 4, 1], [1, 1, 10, 1], [2, 3, 8, 1], [2, 4, 1, 7], [9, 4, 1, 7], [3, 11, 6, 1], [4, 5, 1, 5], [7, 5, 1, 5]],
  search: [[3, 0, 4, 1], [1, 1, 2, 1], [7, 1, 2, 1], [0, 2, 1, 5], [9, 2, 1, 5], [1, 7, 2, 1], [7, 7, 2, 1], [3, 8, 4, 1], [8, 8, 1, 1], [9, 9, 1, 1], [10, 10, 1, 1], [11, 11, 1, 1]],
};

export function monoIcon(name: keyof typeof MONO_ICONS | string, size = 16, label?: string): SVGSVGElement {
  const el = svg(size, label);
  el.setAttribute('fill', 'currentColor');
  for (const r of MONO_ICONS[name] ?? MONO_ICONS.house) rect(el, r);
  return el;
}

const ROLE_ART: Record<string, readonly ColorRect[]> = {
  cupid: [[2,2,3,3,'#c36a65'],[7,2,3,3,'#c36a65'],[2,5,8,2,'#c36a65'],[3,7,6,1,'#c36a65'],[4,8,4,1,'#c36a65'],[5,9,2,1,'#c36a65']],
  hunter: [[1,8,3,2,'#765338'],[3,7,2,2,'#765338'],[4,5,2,3,'#765338'],[5,4,6,2,'#5e655d'],[9,2,2,2,'#5e655d']],
  girl: [[3,1,6,3,'#a4683d'],[2,3,8,4,'#a4683d'],[4,3,4,4,'#e6b68a'],[4,7,4,4,'#729a78'],[4,4,1,1,'#33291e'],[7,4,1,1,'#33291e']],
  werewolf: [
    [2, 1, 2, 2, '#495057'], [8, 1, 2, 2, '#495057'], [2, 3, 8, 5, '#6c757d'], [1, 4, 1, 3, '#495057'], [10, 4, 1, 3, '#495057'],
    [3, 5, 2, 1, '#ffd43b'], [7, 5, 2, 1, '#ffd43b'], [4, 8, 4, 2, '#adb5bd'], [5, 8, 2, 1, '#212529'], [4, 10, 1, 1, '#f8f9fa'], [7, 10, 1, 1, '#f8f9fa'],
  ],
  seer: [
    [4, 1, 4, 1, '#7048e8'], [2, 2, 8, 1, '#7048e8'], [1, 3, 10, 4, '#845ef7'], [2, 7, 8, 1, '#7048e8'], [3, 3, 2, 2, '#d0bfff'], [6, 5, 3, 1, '#b197fc'],
    [3, 8, 6, 1, '#5f3dc4'], [2, 9, 8, 2, '#a0522d'], [3, 9, 6, 1, '#c0703f'],
  ],
  guard: [
    [2, 1, 8, 1, '#1864ab'], [1, 2, 10, 5, '#1c7ed6'], [2, 7, 8, 2, '#1c7ed6'], [3, 9, 6, 1, '#1864ab'], [5, 10, 2, 1, '#1864ab'],
    [5, 3, 2, 6, '#e7f5ff'], [3, 4, 6, 2, '#e7f5ff'],
  ],
  witch: [
    [5, 0, 2, 2, '#a0522d'], [5, 2, 2, 2, '#dee2e6'], [3, 4, 6, 1, '#dee2e6'], [2, 5, 8, 5, '#dee2e6'], [3, 10, 6, 1, '#ced4da'],
    [3, 6, 6, 4, '#37b24d'], [4, 7, 1, 1, '#b2f2bb'], [7, 8, 1, 1, '#b2f2bb'],
  ],
  villager: [
    [5, 1, 2, 1, '#e8590c'], [4, 2, 4, 1, '#e8590c'], [3, 3, 6, 1, '#fd7e14'], [2, 4, 8, 1, '#e8590c'],
    [3, 5, 6, 6, '#f4d6a0'], [5, 7, 2, 4, '#8d5a3b'], [3, 6, 1, 1, '#74c0fc'], [8, 6, 1, 1, '#74c0fc'],
  ],
  unknown: [[2, 1, 8, 10, '#495057'], [3, 2, 6, 8, '#868e96'], [5, 3, 2, 1, '#f8f9fa'], [7, 4, 1, 1, '#f8f9fa'], [6, 5, 1, 1, '#f8f9fa'], [5, 6, 1, 1, '#f8f9fa'], [5, 8, 1, 1, '#f8f9fa']],
  dead: [
    [3, 1, 6, 1, '#dee2e6'], [2, 2, 8, 5, '#f1f3f5'], [3, 7, 6, 2, '#dee2e6'], [3, 3, 2, 2, '#343a40'], [7, 3, 2, 2, '#343a40'],
    [5, 5, 2, 1, '#868e96'], [4, 9, 1, 2, '#dee2e6'], [6, 9, 1, 2, '#dee2e6'], [8, 9, 1, 1, '#dee2e6'],
  ],
  moon: [[4, 1, 4, 1, '#ffe066'], [2, 2, 3, 1, '#ffe066'], [1, 3, 3, 6, '#ffe066'], [2, 9, 3, 1, '#ffe066'], [4, 10, 5, 1, '#ffe066'], [8, 9, 2, 1, '#ffe066'], [4, 3, 1, 6, '#fcc419']],
  sun: [[4, 3, 4, 6, '#fcc419'], [3, 4, 6, 4, '#fcc419'], [5, 0, 2, 2, '#ffa94d'], [5, 10, 2, 2, '#ffa94d'], [0, 5, 2, 2, '#ffa94d'], [10, 5, 2, 2, '#ffa94d'],
    [1, 1, 2, 2, '#ffa94d'], [9, 1, 2, 2, '#ffa94d'], [1, 9, 2, 2, '#ffa94d'], [9, 9, 2, 2, '#ffa94d'], [5, 4, 2, 1, '#fff3bf']],
  vote: [[2, 5, 8, 6, '#c0703f'], [1, 4, 10, 1, '#8d5a3b'], [4, 1, 4, 5, '#f8f9fa'], [5, 2, 2, 1, '#e03131'], [4, 7, 4, 1, '#5c3a21']],
  trophy: [[2, 1, 8, 1, '#fab005'], [3, 2, 6, 4, '#fcc419'], [1, 2, 1, 2, '#fab005'], [10, 2, 1, 2, '#fab005'], [4, 6, 4, 1, '#fab005'], [5, 7, 2, 2, '#f08c00'], [3, 9, 6, 2, '#8d5a3b'], [4, 3, 1, 2, '#fff3bf']],
  info: [[5, 1, 2, 2, '#4dabf7'], [5, 4, 2, 6, '#4dabf7'], [4, 10, 4, 1, '#4dabf7']],
};
export type RoleIconName = keyof typeof ROLE_ART;

export function colorIcon(name: string, size = 20, label?: string): SVGSVGElement {
  const el = svg(size, label);
  for (const [x, y, w, h, fill] of ROLE_ART[name] ?? ROLE_ART.unknown) rect(el, [x, y, w, h], fill);
  return el;
}
```

### app/src/minigames/gartic-phone.ts — distribución humana

Archivo completo derivado del motor real, eliminando configuración, trabajos, acciones y nombres de bots. Conserva el circuito de libros, privacidad, temporización y cancelación.

SHA-256 del bloque: `80ea3b2fec1e0ada8930eb73a0e8402c0efbeebaf93f0b139dc1116c3695f6b1`.

```ts
import { secureRandomInt, shuffle, type RoomEngine } from './room';

/**
 * Telephone with drawings, the way Gartic Phone plays it.
 *
 * Everyone writes a sentence. Each book then travels around the table: the
 * next person draws the sentence, the next one describes the drawing, and so
 * on, every person seeing only the step right before theirs. At the end the
 * books are opened one page at a time for everybody.
 *
 * Seats are shuffled at the start, so who receives whose book changes every
 * game. Book `b` is in the hands of seat `(b + round) % n` during `round`.
 */

export type GarticPhase = 'lobby' | 'write' | 'draw' | 'guess' | 'album' | 'end';
export type GarticStepKind = 'write' | 'draw' | 'guess';

/** A stroke as color, width and a flat list of x,y pairs on a 640×400 page. */
export interface DrawStroke { c: string; w: number; p: number[] }
export interface Drawing { strokes: DrawStroke[] }

export const CANVAS_W = 640;
export const CANVAS_H = 400;
export const MAX_DRAWING_POINTS = 4_000;
export const MAX_DRAWING_CHARS = 40_000;
export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 8;
export const DURATIONS = { write: 45_000, draw: 100_000, guess: 45_000 } as const;
/** Late drawings keep arriving for a moment after the clock hits zero. */
const GRACE_MS = 2_500;


export interface GarticPlayer { id: string; name: string; color: string; bot: boolean }

export interface GarticPage {
  kind: GarticStepKind;
  authorId: string;
  text?: string;
  drawing?: Drawing;
}

export type GarticAction =
  | { kind: 'join'; name: string; color: string }
  | { kind: 'leave' }
  | { kind: 'start' }
  | { kind: 'submit'; text?: string; drawing?: Drawing }
  | { kind: 'unsubmit' }
  | { kind: 'album_next' }
  | { kind: 'play_again' };

export interface GarticView {
  phase: GarticPhase;
  round: number;
  totalRounds: number;
  remainingMs: number;
  leaderId: string | null;
  me: { id: string; seated: boolean; isLeader: boolean; done: boolean };
  players: (GarticPlayer & { done: boolean })[];
  /** What the viewer must work from this round: the sentence to draw or the drawing to describe. */
  task: { kind: GarticStepKind; previous: { kind: GarticStepKind; text?: string; drawing?: Drawing } | null } | null;
  /** The viewer's own submission this round, so editing resumes where they left it. */
  mine: { text?: string; drawing?: Drawing } | null;
  /**
   * The open book. Earlier drawings are sent once, when their page is turned,
   * so `pages` carries a drawing only for the newest page and clients keep the rest.
   */
  album: {
    gameId: string;
    book: number;
    books: number;
    page: number;
    owner: GarticPlayer;
    pages: { kind: GarticStepKind; author: GarticPlayer; text?: string; drawing?: Drawing; key: string }[];
  } | null;
}

export class GarticGame implements RoomEngine<GarticAction, GarticView> {
  phase: GarticPhase = 'lobby';
  players: GarticPlayer[] = [];
  private seats: GarticPlayer[] = [];
  private leaderId: string | null = null;
  private round = 0;
  private totalRounds = 0;
  private deadline = 0;
  private books: (GarticPage | undefined)[][] = [];
  private albumBook = 0;
  private albumPage = 0;
  private gameId = '';

  constructor(private readonly random: (max: number) => number = secureRandomInt, private readonly authorityId: string | null = null) {}

  cancel(): void {
    this.phase = 'lobby'; this.round = 0; this.deadline = 0; this.books = []; this.seats = []; this.gameId = crypto.randomUUID();
  }

  
  
  

  audience(): string[] { return this.players.filter((p) => !p.bot).map((p) => p.id); }

  apply(actorId: string, action: GarticAction, now: number): void {
    const actor = this.players.find((p) => p.id === actorId);
    switch (action.kind) {
      case 'join':
        if (actor) return;
        if (this.phase !== 'lobby') throw new Error('La partida ya empezó. Espera a la siguiente.');
        if (this.players.length >= MAX_PLAYERS) throw new Error('La sala está llena.');
        this.players.push({ id: actorId, name: cleanName(action.name), color: cleanColor(action.color), bot: false });
        this.leaderId ??= actorId;
        return;
      case 'leave':
        if (!actor) return;
        if (this.phase === 'lobby') this.players = this.players.filter((p) => p.id !== actorId);
        if (this.leaderId === actorId) this.leaderId = this.players.find((p) => !p.bot && p.id !== actorId)?.id ?? null;
        if (!this.leaderId) this.resetAll();
        return;
      case 'start': {
        this.requireLeader(actorId);
        if (this.phase !== 'lobby') return;
        if (this.players.length < MIN_PLAYERS) throw new Error(`Hacen falta al menos ${MIN_PLAYERS} jugadores.`);
        this.seats = shuffle(this.players, this.random);
        const n = this.seats.length;
        // Every book visits every seat once, and a game is never shorter than write, draw, guess, draw.
        this.totalRounds = Math.max(n, 4);
        this.books = this.seats.map(() => []);
        this.round = 0;
        this.gameId = crypto.randomUUID();
        this.startRound(now);
        return;
      }
      case 'submit': {
        if (!actor || !this.isPlaying()) throw new Error('No hay ninguna ronda en curso.');
        this.submit(actor, action, now);
        return;
      }
      case 'unsubmit': {
        if (!actor || !this.isPlaying()) return;
        const book = this.bookOf(actor.id);
        if (book >= 0) this.books[book][this.round] = undefined;
        return;
      }
      case 'album_next':
        this.requireLeader(actorId);
        if (this.phase !== 'album') return;
        if (this.albumPage + 1 < this.totalRounds) this.albumPage += 1;
        else if (this.albumBook + 1 < this.books.length) { this.albumBook += 1; this.albumPage = 0; }
        else this.phase = 'end';
        return;
      case 'play_again':
        this.requireLeader(actorId);
        if (this.phase !== 'end' && this.phase !== 'album') return;
        this.phase = 'lobby';
        this.books = [];
        return;
    }
  }

  tick(now: number): boolean {
    if (!this.isPlaying()) return false;
    let changed = false;
    if (now >= this.deadline + GRACE_MS) {
      for (const seat of this.seats) if (!this.pageOf(seat.id)) this.submit(seat, this.fallbackEntry(), now, true);
      this.advance(now);
      changed = true;
    }
    return changed;
  }

  viewFor(viewerId: string, now: number): GarticView {
    const me = this.players.find((p) => p.id === viewerId);
    const playing = this.isPlaying();
    const book = playing ? this.bookOf(viewerId) : -1;
    const previous = book >= 0 && this.round > 0 ? this.books[book][this.round - 1] : undefined;
    const mine = book >= 0 ? this.books[book][this.round] : undefined;
    const roster = playing || this.phase === 'album' || this.phase === 'end' ? this.seats : this.players;
    return {
      phase: this.phase,
      round: this.round,
      totalRounds: this.totalRounds,
      remainingMs: playing ? Math.max(0, this.deadline - now) : 0,
      leaderId: this.leaderId,
      me: { id: viewerId, seated: !!me, isLeader: this.leaderId === viewerId || this.authorityId === viewerId, done: !!mine },
      players: roster.map((p) => ({ ...p, done: playing && !!this.pageOf(p.id) })),
      task: book >= 0 ? {
        kind: this.kindOf(this.round),
        previous: previous ? { kind: previous.kind, text: previous.text, drawing: previous.drawing } : null,
      } : null,
      mine: mine ? { text: mine.text, drawing: mine.drawing } : null,
      album: this.phase === 'album' || this.phase === 'end' ? this.albumView() : null,
    };
  }

  private albumView(): GarticView['album'] {
    const book = Math.min(this.albumBook, this.books.length - 1);
    if (book < 0) return null;
    const page = this.phase === 'end' ? this.totalRounds - 1 : this.albumPage;
    const pages = this.books[book].slice(0, page + 1).map((entry, i) => ({
      kind: entry!.kind,
      author: this.player(entry!.authorId),
      text: entry!.text,
      // Only the newest page carries its drawing; earlier ones were sent already.
      drawing: i === page ? entry!.drawing : undefined,
      key: `${this.gameId}:${book}:${i}`,
    }));
    return { gameId: this.gameId, book, books: this.books.length, page, owner: this.seats[book], pages };
  }

  private submit(actor: GarticPlayer, entry: { text?: string; drawing?: Drawing }, now: number, forced = false): void {
    const book = this.bookOf(actor.id);
    if (book < 0) throw new Error('No participas en esta partida.');
    const kind = this.kindOf(this.round);
    const page: GarticPage = { kind, authorId: actor.id };
    if (kind === 'draw') page.drawing = cleanDrawing(entry.drawing);
    else {
      const text = String(entry.text ?? '').trim().slice(0, 120);
      if (!text && !forced) throw new Error(kind === 'write' ? 'Escribe una frase antes de terminar.' : 'Escribe qué crees que es el dibujo.');
      page.text = text || '…';
    }
    this.books[book][this.round] = page;
    if (!forced && this.seats.every((s) => this.pageOf(s.id))) this.advance(now);
  }

  private advance(now: number): void {
    if (this.round + 1 >= this.totalRounds) {
      this.phase = 'album';
      this.albumBook = 0;
      this.albumPage = 0;
      return;
    }
    this.round += 1;
    this.startRound(now);
  }

  private startRound(now: number): void {
    this.phase = this.kindOf(this.round);
    this.deadline = now + DURATIONS[this.phase as GarticStepKind];
  }

  private kindOf(round: number): GarticStepKind { return round === 0 ? 'write' : round % 2 === 1 ? 'draw' : 'guess'; }
  private isPlaying(): boolean { return this.phase === 'write' || this.phase === 'draw' || this.phase === 'guess'; }
  private seatIndex(id: string): number { return this.seats.findIndex((s) => s.id === id); }

  /** The book a seat holds this round. */
  private bookOf(id: string): number {
    const seat = this.seatIndex(id);
    if (seat < 0) return -1;
    const n = this.seats.length;
    return ((seat - this.round) % n + n) % n;
  }

  private pageOf(id: string): GarticPage | undefined {
    const book = this.bookOf(id);
    return book >= 0 ? this.books[book][this.round] : undefined;
  }

  private player(id: string): GarticPlayer {
    return this.seats.find((s) => s.id === id) ?? { id, name: 'Alguien', color: '#868e96', bot: false };
  }

  private fallbackEntry(): { text?: string; drawing?: Drawing } {
    return this.kindOf(this.round) === 'draw' ? { drawing: { strokes: [] } } : { text: '' };
  }

  private resetAll(): void {
    this.players = [];
    this.seats = [];
    this.books = [];
    this.phase = 'lobby';
    this.leaderId = null;
  }

  private requireLeader(actorId: string): void {
    if (actorId !== this.leaderId && actorId !== this.authorityId) throw new Error('Solo quien creó la sala puede hacer eso.');
  }
}

/** Keeps a drawing within the page, the color format and the size limits. */
export function cleanDrawing(raw: Drawing | undefined): Drawing {
  const strokes: DrawStroke[] = [];
  let points = 0;
  for (const s of Array.isArray(raw?.strokes) ? raw!.strokes.slice(0, 600) : []) {
    if (!s || !Array.isArray(s.p)) continue;
    const c = /^#[0-9a-fA-F]{6}$/.test(String(s.c)) ? s.c : '#000000';
    const w = Math.max(1, Math.min(48, Math.round(Number(s.w) || 4)));
    const room = (MAX_DRAWING_POINTS - points) * 2;
    if (room <= 0) break;
    const p: number[] = [];
    for (let i = 0; i + 1 < s.p.length && p.length < room; i += 2) {
      const x = Math.round(Number(s.p[i])); const y = Math.round(Number(s.p[i + 1]));
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      p.push(Math.max(0, Math.min(CANVAS_W, x)), Math.max(0, Math.min(CANVAS_H, y)));
    }
    if (p.length < 2) continue;
    points += p.length / 2;
    strokes.push({ c, w, p });
  }
  const drawing = { strokes };
  while (JSON.stringify(drawing).length > MAX_DRAWING_CHARS && drawing.strokes.length) drawing.strokes.pop();
  return drawing;
}

function cleanName(name: string): string { return String(name ?? '').trim().slice(0, 24) || 'Vecino'; }
function cleanColor(color: string): string { return /^#[0-9a-fA-F]{6}$/.test(String(color)) ? color : '#4dabf7'; }
```

### app/src/ui/gartic-ui.ts — distribución humana

Archivo completo derivado del panel real. No hay desplegable de modelos, verificación ni botones de bots.

SHA-256 del bloque: `1c683e2535e125c76a217c28b60b0ed757dd1a1dbfcbf58ce7733ba056bc57ea`.

```ts
import {
  CANVAS_H, CANVAS_W, MAX_DRAWING_POINTS, MIN_PLAYERS,
  type DrawStroke, type Drawing, type GarticAction, type GarticView,
} from '../minigames/gartic-phone';
import { monoIcon } from './pixel-icons';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function btn(label: string, className = 'gp-btn'): HTMLButtonElement {
  const b = el('button', className, label);
  b.type = 'button';
  return b;
}

const PALETTE = [
  '#000000', '#666666', '#0050cd', '#ffffff', '#aaaaaa', '#26c9ff',
  '#017420', '#990000', '#964112', '#11b03c', '#ff0013', '#ff7829',
  '#b0701c', '#99004e', '#cb5a57', '#ffc126', '#ff008f', '#feafa8',
];
const SIZES = [3, 7, 14, 26];

export function paintDrawing(ctx: CanvasRenderingContext2D, drawing: Drawing | undefined, scale = 1): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of drawing?.strokes ?? []) paintStroke(ctx, s);
  ctx.restore();
}

function paintStroke(ctx: CanvasRenderingContext2D, s: DrawStroke): void {
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineWidth = s.w;
  if (s.p.length === 2) {
    ctx.beginPath();
    ctx.arc(s.p[0], s.p[1], s.w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.beginPath();
  ctx.moveTo(s.p[0], s.p[1]);
  for (let i = 2; i + 1 < s.p.length; i += 2) ctx.lineTo(s.p[i], s.p[i + 1]);
  ctx.stroke();
}

function drawingCanvas(drawing: Drawing | undefined, className = 'gp-paper'): HTMLCanvasElement {
  const canvas = el('canvas', className);
  canvas.width = CANVAS_W * 2;
  canvas.height = CANVAS_H * 2;
  const ctx = canvas.getContext('2d');
  if (ctx) paintDrawing(ctx, drawing, 2);
  return canvas;
}

export interface GarticPanelContext {
  send(action: GarticAction): void;
  close(): void;
  me(): { name: string; color: string };
}

/** Per-round working state that must survive re-renders. */
interface Draft {
  key: string;
  text: HTMLInputElement;
  canvas: HTMLCanvasElement;
  strokes: DrawStroke[];
  undone: DrawStroke[];
  color: string;
  size: number;
  autoSent: boolean;
}

export class GarticPanel {
  readonly root = el('section', 'gp');
  private view: GarticView | null = null;
  private receivedAt = 0;
  private errorText = '';
  private draft: Draft | null = null;
  private timerEl: HTMLElement | null = null;
  private clock: ReturnType<typeof setInterval> | null = null;
  private editing = false;
  /** Album drawings arrive once, when their page is turned; keep them. */
  private albumCache = new Map<string, Drawing>();
  private activePointer: number | null = null;

  constructor(private readonly ctx: GarticPanelContext) {
    this.root.setAttribute('aria-label', 'Gartic Phone');
  }

  mount(container: HTMLElement): void {
    container.replaceChildren(this.root);
    this.clock ??= setInterval(() => this.onClock(), 250);
    this.render();
  }

  unmount(): void {
    if (this.clock) clearInterval(this.clock);
    this.clock = null;
    this.root.remove();
  }

  update(view: GarticView | null, error: string | null): void {
    if (view) {
      this.view = view;
      this.receivedAt = Date.now();
      if (view.album) for (const page of view.album.pages) if (page.drawing) this.albumCache.set(page.key, page.drawing);
      // "Editar" unlocks right away; once the host confirms, the flag is no longer needed.
      if (!view.me.done) this.editing = false;
    }
    this.errorText = error ?? '';
    // Never rebuild the page under a pen that is still drawing.
    if (this.activePointer === null) this.render();
  }

  private remaining(): number {
    return this.view ? Math.max(0, this.view.remainingMs - (Date.now() - this.receivedAt)) : 0;
  }

  private onClock(): void {
    const v = this.view;
    if (!v || !this.timerEl) return;
    const ms = this.remaining();
    const s = Math.ceil(ms / 1000);
    this.timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timerEl.classList.toggle('is-low', s <= 10);
    // Like the real game: when time runs out, whatever is on the page is sent.
    if (ms < 1_200 && this.draft && !this.draft.autoSent && v.task && !v.me.done) {
      this.draft.autoSent = true;
      this.submit(true);
    }
  }

  private ensureDraft(v: GarticView): Draft {
    const key = `${v.round}:${v.task?.kind}`;
    if (this.draft?.key === key) return this.draft;
    const text = el('input', 'gp-input');
    text.maxLength = 120;
    text.autocomplete = 'off';
    text.placeholder = v.task?.kind === 'write' ? 'Escribe tu frase' : 'Describe el dibujo';
    text.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.submit(false); } });
    if (v.mine?.text) text.value = v.mine.text;
    const canvas = el('canvas', 'gp-paper gp-paper-live');
    canvas.width = CANVAS_W * 2;
    canvas.height = CANVAS_H * 2;
    canvas.setAttribute('aria-label', 'Hoja de dibujo');
    this.draft = { key, text, canvas, strokes: v.mine?.drawing?.strokes.map((s) => ({ ...s, p: [...s.p] })) ?? [], undone: [], color: '#000000', size: 7, autoSent: false };
    this.bindCanvas(this.draft);
    this.repaint();
    return this.draft;
  }

  private points(): number { return this.draft?.strokes.reduce((n, s) => n + s.p.length / 2, 0) ?? 0; }

  private bindCanvas(draft: Draft): void {
    const canvas = draft.canvas;
    const at = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return [Math.round((e.clientX - r.left) * CANVAS_W / r.width), Math.round((e.clientY - r.top) * CANVAS_H / r.height)] as const;
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (this.view?.me.done && !this.editing) return;
      if (this.points() >= MAX_DRAWING_POINTS) { this.errorText = 'La hoja está llena: deshaz algún trazo.'; this.render(); return; }
      this.activePointer = e.pointerId;
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = at(e);
      draft.strokes.push({ c: draft.color, w: draft.size, p: [x, y] });
      draft.undone = [];
      this.repaint();
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.activePointer !== e.pointerId) return;
      const stroke = draft.strokes[draft.strokes.length - 1];
      const [x, y] = at(e);
      const lx = stroke.p[stroke.p.length - 2]; const ly = stroke.p[stroke.p.length - 1];
      if (Math.hypot(x - lx, y - ly) < 2.5 || this.points() >= MAX_DRAWING_POINTS) return;
      stroke.p.push(x, y);
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.save();
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        ctx.strokeStyle = stroke.c; ctx.lineWidth = stroke.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(x, y); ctx.stroke();
        ctx.restore();
      }
    });
    const end = (e: PointerEvent) => {
      if (this.activePointer !== e.pointerId) return;
      this.activePointer = null;
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      this.render();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  private repaint(): void {
    const ctx = this.draft?.canvas.getContext('2d');
    if (ctx && this.draft) paintDrawing(ctx, { strokes: this.draft.strokes }, 2);
  }

  private submit(auto: boolean): void {
    const v = this.view;
    const d = this.draft;
    if (!v?.task || !d) return;
    this.editing = false;
    if (v.task.kind === 'draw') this.ctx.send({ kind: 'submit', drawing: { strokes: d.strokes } });
    else {
      const text = d.text.value.trim();
      if (auto && !text) return;
      if (!text) { this.errorText = 'Escribe algo antes de pulsar ¡Listo!'; this.render(); return; }
      d.text.value = text;
      this.ctx.send({ kind: 'submit', text });
    }
  }

  private render(): void {
    const v = this.view;
    this.root.replaceChildren();
    this.root.dataset.phase = v?.phase ?? 'lobby';
    this.root.append(this.header(v));
    const stage = el('div', 'gp-stage');
    if (!v) stage.append(this.card('Conectando…', el('p', 'gp-muted', 'Buscando la sala de dibujo de la aldea.')));
    else if (v.phase === 'lobby') stage.append(this.lobby(v));
    else if (v.phase === 'album' || v.phase === 'end') stage.append(this.album(v));
    else if (!v.task) stage.append(this.card('Partida en curso', el('p', 'gp-muted', 'Podrás unirte a la siguiente. Mientras, mira cómo dibujan los demás.')), this.roster(v));
    else stage.append(this.task(v));
    if (this.errorText) stage.append(el('p', 'gp-error', this.errorText));
    this.root.append(stage);
    this.onClock();
  }

  private header(v: GarticView | null): HTMLElement {
    const head = el('header', 'gp-head');
    const logo = el('div', 'gp-logo');
    logo.append(el('span', 'gp-logo-top', 'GARTIC'), el('span', 'gp-logo-bottom', 'PHONE'));
    head.append(logo);
    if (v && v.task && v.phase !== 'lobby') {
      head.append(el('span', 'gp-step', `${v.round + 1}/${v.totalRounds}`));
      const timer = el('span', 'gp-timer');
      this.timerEl = el('span', '');
      timer.append(el('span', 'gp-clock-face'), this.timerEl);
      head.append(timer);
    } else this.timerEl = null;
    const close = btn('', 'gp-close');
    close.append(monoIcon('close', 14));
    close.setAttribute('aria-label', 'Cerrar');
    close.dataset.testid = 'expansion-modal-close';
    close.addEventListener('click', () => this.ctx.close());
    head.append(close);
    return head;
  }

  private card(title: string, ...children: HTMLElement[]): HTMLElement {
    const card = el('div', 'gp-card');
    card.append(el('h2', 'gp-title', title), ...children);
    return card;
  }

  private avatar(p: { name: string; color: string }, size = 'md'): HTMLElement {
    const a = el('span', `gp-avatar is-${size}`, p.name.slice(0, 1).toUpperCase());
    a.style.backgroundColor = p.color;
    return a;
  }

  private roster(v: GarticView): HTMLElement {
    const list = el('ul', 'gp-roster');
    for (const p of v.players) {
      const li = el('li', p.done ? 'is-done' : '');
      li.append(this.avatar(p, 'sm'), el('span', '', p.name));
      if (p.done) { const ok = el('span', 'gp-done'); ok.append(monoIcon('check', 12)); li.append(ok); }
      list.append(li);
    }
    return list;
  }

  private lobby(v: GarticView): HTMLElement {
    const wrap = el('div', 'gp-lobby');
    const left = el('div', 'gp-card gp-players');
    left.append(el('h2', 'gp-title', `Jugadores ${v.players.length}/8`));
    const list = el('ul', 'gp-player-list');
    for (const p of v.players) {
      const li = el('li');
      li.append(this.avatar(p), el('strong', '', p.name), el('span', 'gp-muted', p.id === v.leaderId ? 'anfitrión' : ''));

      list.append(li);
    }
    for (let i = v.players.length; i < Math.max(MIN_PLAYERS, v.players.length + 1) && i < 8; i++) {
      const li = el('li', 'is-empty');
      li.append(el('span', 'gp-avatar is-md is-empty'), el('span', 'gp-muted', 'Vacío'));
      list.append(li);
    }
    left.append(list);

    const right = el('div', 'gp-card gp-howto');
    right.append(el('h2', 'gp-title', 'Cómo se juega'));
    const steps = el('ol', 'gp-steps');
    for (const [icon, title, text] of [
      ['notes', 'Escribe', 'Una frase absurda para que alguien la dibuje.'],
      ['brush', 'Dibuja', 'Recibes la frase de otra persona y la dibujas.'],
      ['chat', 'Adivina', 'Describes el dibujo que te llega… sin ver la frase.'],
    ] as const) {
      const li = el('li');
      const badge = el('span', 'gp-step-icon');
      badge.append(monoIcon(icon, 22));
      li.append(badge, el('strong', '', title), el('span', '', text));
      steps.append(li);
    }
    right.append(steps, el('p', 'gp-muted', 'Al final se abren los álbumes y se ve cómo cambió cada frase.'));
    const actions = el('div', 'gp-actions');
    if (!v.me.seated) {
      const join = btn('Entrar', 'gp-btn gp-btn-go');
      join.addEventListener('click', () => this.ctx.send({ kind: 'join', ...this.ctx.me() }));
      actions.append(join);
    } else {
      const leave = btn('Salir', 'gp-btn');
      leave.addEventListener('click', () => this.ctx.send({ kind: 'leave' }));
      actions.append(leave);
      if (v.me.isLeader) {
        const start = btn('Empezar', 'gp-btn gp-btn-go');
        start.disabled = v.players.length < MIN_PLAYERS;
        start.title = v.players.length < MIN_PLAYERS ? `Mínimo ${MIN_PLAYERS} jugadores` : '';
        start.addEventListener('click', () => this.ctx.send({ kind: 'start' }));
        actions.append(start);
      } else actions.append(el('p', 'gp-muted', 'Esperando a que el anfitrión empiece…'));
    }
    right.append(actions);
    wrap.append(left, right);
    return wrap;
  }

  private task(v: GarticView): HTMLElement {
    const t = v.task!;
    const d = this.ensureDraft(v);
    const locked = v.me.done && !this.editing;
    const wrap = el('div', 'gp-task');
    const done = () => {
      const row = el('div', 'gp-actions');
      const b = btn(locked ? 'Editar' : '¡Listo!', locked ? 'gp-btn' : 'gp-btn gp-btn-go');
      if (!locked) b.prepend(monoIcon('check', 14));
      b.addEventListener('click', () => {
        if (locked) { this.editing = true; this.ctx.send({ kind: 'unsubmit' }); this.render(); }
        else this.submit(false);
      });
      row.append(b);
      if (locked) row.append(el('span', 'gp-muted', `Esperando: ${v.players.filter((p) => !p.done).map((p) => p.name).join(', ') || '…'}`));
      return row;
    };

    if (t.kind === 'write') {
      const card = this.card('¡Escribe una frase!');
      card.append(el('p', 'gp-muted', 'Algo raro, divertido o difícil de dibujar.'));
      d.text.disabled = locked;
      card.append(d.text, done());
      wrap.append(card);
      queueMicrotask(() => { if (!locked && document.activeElement !== d.text) d.text.focus(); });
    } else if (t.kind === 'guess') {
      const card = this.card('¿Qué es este dibujo?');
      card.append(drawingCanvas(t.previous?.drawing, 'gp-paper gp-paper-view'));
      d.text.disabled = locked;
      card.append(d.text, done());
      wrap.append(card);
    } else {
      const banner = el('div', 'gp-prompt');
      banner.append(el('span', 'gp-prompt-label', 'Dibuja:'), el('strong', '', t.previous?.text ?? '¡Lo que quieras!'));
      const board = el('div', 'gp-board');
      board.classList.toggle('is-locked', locked);
      const palette = el('div', 'gp-palette');
      palette.setAttribute('aria-label', 'Colores');
      for (const color of PALETTE) {
        const sw = btn('', 'gp-swatch');
        sw.style.backgroundColor = color;
        sw.setAttribute('aria-label', `Color ${color}`);
        sw.classList.toggle('is-active', d.color === color);
        sw.addEventListener('click', () => { d.color = color; this.render(); });
        palette.append(sw);
      }
      const tools = el('div', 'gp-tools');
      for (const size of SIZES) {
        const b = btn('', 'gp-size');
        const dot = el('span', 'gp-size-dot');
        dot.style.width = dot.style.height = `${Math.max(4, size * 0.9)}px`;
        b.append(dot);
        b.setAttribute('aria-label', `Grosor ${size}`);
        b.classList.toggle('is-active', d.size === size);
        b.addEventListener('click', () => { d.size = size; this.render(); });
        tools.append(b);
      }
      const eraser = btn('Goma', 'gp-tool');
      eraser.classList.toggle('is-active', d.color === '#ffffff');
      eraser.addEventListener('click', () => { d.color = '#ffffff'; this.render(); });
      const undo = btn('Deshacer', 'gp-tool');
      undo.disabled = !d.strokes.length;
      undo.addEventListener('click', () => { const s = d.strokes.pop(); if (s) d.undone.push(s); this.repaint(); this.render(); });
      const redo = btn('Rehacer', 'gp-tool');
      redo.disabled = !d.undone.length;
      redo.addEventListener('click', () => { const s = d.undone.pop(); if (s) d.strokes.push(s); this.repaint(); this.render(); });
      const clear = btn('Borrar', 'gp-tool');
      clear.addEventListener('click', () => { d.undone = [...d.strokes].reverse(); d.strokes = []; this.repaint(); this.render(); });
      tools.append(eraser, undo, redo, clear);
      const paperWrap = el('div', 'gp-paper-wrap');
      paperWrap.append(d.canvas);
      board.append(palette, paperWrap, tools);
      wrap.append(banner, board, done());
    }
    wrap.append(this.roster(v));
    return wrap;
  }

  private album(v: GarticView): HTMLElement {
    const a = v.album!;
    const card = el('div', 'gp-card gp-album');
    const head = el('div', 'gp-album-head');
    head.append(this.avatar(a.owner), el('h2', 'gp-title', `Álbum de ${a.owner.name}`), el('span', 'gp-step', `${a.book + 1}/${a.books}`));
    card.append(head);
    const feed = el('ol', 'gp-feed');
    for (const page of a.pages) {
      const li = el('li', `gp-bubble is-${page.kind}`);
      li.append(this.avatar(page.author, 'sm'));
      const body = el('div', 'gp-bubble-body');
      body.append(el('span', 'gp-bubble-name', page.author.name));
      if (page.kind === 'draw') body.append(drawingCanvas(page.drawing ?? this.albumCache.get(page.key), 'gp-paper gp-paper-album'));
      else body.append(el('p', 'gp-bubble-text', page.text ?? '…'));
      li.append(body);
      feed.append(li);
    }
    card.append(feed);
    const actions = el('div', 'gp-actions');
    if (v.me.isLeader) {
      if (v.phase === 'album') {
        const last = a.page + 1 >= v.totalRounds;
        const next = btn(last ? (a.book + 1 < a.books ? 'Siguiente álbum' : 'Terminar') : 'Siguiente', 'gp-btn gp-btn-go');
        next.addEventListener('click', () => this.ctx.send({ kind: 'album_next' }));
        actions.append(next);
      }
      const again = btn('Volver a la sala', 'gp-btn');
      again.addEventListener('click', () => { this.albumCache.clear(); this.ctx.send({ kind: 'play_again' }); });
      actions.append(again);
    } else actions.append(el('p', 'gp-muted', 'El anfitrión pasa las páginas.'));
    card.append(actions);
    queueMicrotask(() => { feed.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
    return card;
  }
}
```

### app/src/minigames/study-quiz.ts — modelo independiente de proveedor

Mismo motor de concurso; el único cambio es importar tipos/validador del repositorio manual de fase 1.

SHA-256 del bloque: `2622c54efaffadbaab5ec8c54075ac970ff832accf66d64eabe162aca32cac73`.

```ts
import { flashcardDeckSchema, type FlashcardDeck } from '../study/decks';
import type { RoomEngine } from './room';
export type QuizAction = { kind: 'join'; name: string } | { kind: 'start'; seconds: number } | { kind: 'answer'; questionId: string; choice: number } | { kind: 'next' };
export interface QuizView {
  phase: 'lobby' | 'question' | 'results' | 'end'; title: string; count: number; index: number;
  question: { id: string; text: string; choices: string[] } | null; remainingMs: number; timed: boolean;
  solution: number | null; players: { id: string; name: string; score: number; answered: boolean }[];
  meAnswered: boolean; stopped: boolean;
}
export class StudyQuiz implements RoomEngine<QuizAction, QuizView> {
  private deck: FlashcardDeck | null = null;
  private cards: FlashcardDeck['cards'] = [];
  private players = new Map<string, { id: string; name: string; score: number; answered: boolean }>();
  private phase: QuizView['phase'] = 'lobby';
  private index = 0; private started = 0; private seconds = 20; private game = ''; private stopped = false;
  constructor(private readonly hostId: string) {}
  audience(): string[] { return [...this.players.keys()]; }
  setDeck(raw: FlashcardDeck): void {
    if (this.phase === 'question') throw new Error('Termina primero la partida.');
    this.deck = flashcardDeckSchema.parse(raw);
    this.cards = this.deck.cards.filter(c => c.choices && c.correctChoice !== undefined);
    this.phase = 'lobby'; this.index = 0;
  }
  prune(present: ReadonlySet<string>): boolean {
    let changed = false;
    for (const id of this.players.keys()) if (!present.has(id)) { this.players.delete(id); changed = true; }
    if (changed && this.phase === 'question' && [...this.players.values()].every(p=>p.answered)) this.phase = 'results';
    return changed;
  }
  cancel(): void { this.phase = 'lobby'; this.index = 0; this.game = crypto.randomUUID(); this.stopped = true; for (const p of this.players.values()) { p.score = 0; p.answered = false; } }
  apply(actor: string, action: QuizAction, now: number): void {
    if (action.kind === 'join') {
      if (actor === this.hostId) return;
      if (!this.players.has(actor)) this.players.set(actor, { id: actor, name: String(action.name).trim().slice(0, 32) || 'Vecino', score: 0, answered: this.phase === 'question' });
      return;
    }
    if (action.kind === 'start') {
      if (actor !== this.hostId || this.phase === 'question') throw new Error('Solo el anfitrión puede comenzar.');
      if (!this.cards.length) throw new Error('Añade opciones de concurso a las tarjetas de este mazo.');
      if (!this.players.size) throw new Error('Espera a que entre al menos un participante.');
      if (![0, 20, 30, 60].includes(action.seconds)) throw new Error('Tiempo inválido.');
      this.seconds = action.seconds; this.index = 0; this.game = crypto.randomUUID(); this.stopped = false;
      for (const p of this.players.values()) p.score = 0;
      this.begin(now); return;
    }
    if (action.kind === 'answer') {
      const p = this.players.get(actor); const card = this.cards[this.index];
      if (!p || p.answered || this.phase !== 'question' || action.questionId !== this.questionId() || (this.seconds && now >= this.started + this.seconds * 1000)) return;
      if (!Number.isInteger(action.choice) || action.choice < 0 || action.choice >= card.choices!.length) throw new Error('Respuesta inválida.');
      p.answered = true;
      if (action.choice === card.correctChoice) p.score += this.seconds ? Math.round(500 + 500 * Math.max(0, 1 - Math.max(0, now - this.started) / (this.seconds * 1000))) : 1000;
      if ([...this.players.values()].every(p => p.answered)) this.phase = 'results';
      return;
    }
    if (action.kind === 'next') {
      if (actor !== this.hostId || this.phase !== 'results') throw new Error('Espera al anfitrión.');
      if (++this.index >= this.cards.length) this.phase = 'end'; else this.begin(now);
    }
  }
  tick(now: number): boolean {
    if (this.phase === 'question' && this.seconds > 0 && now >= this.started + this.seconds * 1000) { this.phase = 'results'; return true; }
    return false;
  }
  viewFor(actor: string, now: number): QuizView {
    const card = this.cards[this.index]; const visible = !!card && (this.phase === 'question' || this.phase === 'results');
    return { phase: this.phase, title: this.deck?.title ?? '', count: this.cards.length, index: this.index,
      question: visible ? { id: this.questionId(), text: card.question, choices: [...card.choices!] } : null,
      solution: this.phase === 'results' ? card.correctChoice! : null,
      remainingMs: this.phase === 'question' && this.seconds ? Math.max(0, this.started + this.seconds * 1000 - now) : 0,
      timed: this.seconds > 0, meAnswered: this.players.get(actor)?.answered ?? false, stopped: this.stopped,
      players: [...this.players.values()].map(p => ({ ...p })).sort((a,b) => b.score-a.score),
    };
  }
  private questionId(): string { return `${this.game}:${this.index}`; }
  private begin(now: number): void { this.phase = 'question'; this.started = now; for (const p of this.players.values()) p.answered = false; }
}
```

### panel de tarjetas — método quiz()

FRAGMENTO DE CLASE. `ctx.decks` es el repositorio manual de fase 1; `ctx.room` la sala StudyQuiz, `ctx.actor()` devuelve id/displayName/isHost. Añadir modo quiz y suscripción/contador como se especificó.

SHA-256 del bloque: `84194e75f9f2e292b112b9b55c2a1b638cef04aba55a0df32fe213e97b36fd2b`.

```ts
private quiz(): void {
    const actor=this.ctx.actor(); const v=this.ctx.room.current();
    if (!v) { this.root.append(el('p','Conectando con el anfitrión…')); return; }
    if (v.phase==='lobby') {
      if (v.stopped) this.root.append(el('p','El anfitrión terminó la partida.'));
      if (actor.isHost) {
        const select=el('select'); const decks=this.ctx.decks.listDecks(actor.id,true);
        for(const d of decks){const o=el('option',`${d.title} · ${d.cards.filter(c=>c.choices).length} preguntas de concurso`);o.value=d.id;select.append(o);}
        this.root.append(field('Mazo para jugar',select));
        const advanced=el('details');advanced.append(el('summary','Opciones de partida'));const seconds=el('select');for(const [value,label] of [['20','20 segundos'],['30','30 segundos'],['60','60 segundos'],['0','Sin tiempo']]){const o=el('option',label);o.value=value;seconds.append(o);}advanced.append(field('Tiempo por pregunta',seconds));this.root.append(advanced);
        this.root.append(button('Comenzar partida',()=>this.run(()=>{const deck=this.ctx.decks.getDeck(select.value);if(!deck)throw new Error('Crea primero un mazo con opciones de concurso.');this.ctx.room.mutate(engine=>{engine.setDeck(deck);return true;});this.ctx.room.act({kind:'start',seconds:Number(seconds.value)});}),true));
      } else this.root.append(button('Entrar en la partida',()=>this.ctx.room.act({kind:'join',name:actor.displayName}),true),el('p','Espera a que el anfitrión comience.'));
      this.root.append(el('p',`${v.players.length} participantes`));
    } else if (v.question) {
      this.root.append(el('h3',v.question.text));
      if (v.phase==='question') { const timer = el('p', v.timed ? `${Math.ceil(v.remainingMs/1000)} s` : 'Sin límite de tiempo.'); if (v.timed) timer.dataset.quizDeadline = String(Date.now()+v.remainingMs); this.root.append(timer); v.question.choices.forEach((choice,index)=>{const b=button(choice,()=>this.ctx.room.act({kind:'answer',questionId:v.question!.id,choice:index}));b.disabled=actor.isHost||v.meAnswered;this.root.append(b);}); }
      else {this.root.append(el('p',`Respuesta: ${v.question.choices[v.solution!]}`));if(actor.isHost)this.root.append(button('Siguiente',()=>this.ctx.room.act({kind:'next'}),true));}
    } else this.root.append(el('h3','Partida terminada'));
    if(v.phase!=='question'){const list=el('ol');for(const p of v.players)list.append(el('li',`${p.name} · ${p.score} puntos`));this.root.append(list);}
    if(actor.isHost&&v.phase!=='lobby'){let armed=false;const stop=button('Terminar partida',()=>{if(!armed){armed=true;stop.textContent='¿Terminar para todos?';return;}this.ctx.room.stop();});this.root.append(stop);}
  }
```

### app/src/ui/study-ui.ts — repaso y concursos sin IA

Panel completo para fase 2, sin importación, configuración o llamadas de IA. Sustituye la variante manual de fase 1; conserva el mismo repositorio independiente.

SHA-256 del bloque: `d002c3a6171f6a597a88d267d5bc1635bc03cf8e653de874cf8fb12395796a0a`.

```ts
import type {FlashcardDeck,FlashcardItem,ManualDeckRepository} from '../study/decks';
import { SharedRoom } from '../minigames/room';
import { StudyQuiz, type QuizAction, type QuizView } from '../minigames/study-quiz';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text = ''): HTMLElementTagNameMap[K] { const e = document.createElement(tag); e.textContent = text; return e; }
function button(text: string, action: () => void, primary = false): HTMLButtonElement { const b = el('button', text); b.type = 'button'; if (primary) b.className = 'is-primary'; b.onclick = action; return b; }
function field(label: string, input: HTMLElement): HTMLLabelElement { const l = el('label', label); l.append(input); return l; }
export interface StudyContext {
  actor(): { id: string; displayName: string; isHost: boolean };
  close(): void; notify(message: string): void;
  decks: ManualDeckRepository;
  room: SharedRoom<QuizAction, QuizView, StudyQuiz>;
}
export class StudyPanel {
  readonly root = el('section');
  private mode: 'library' | 'edit' | 'review' | 'quiz' = 'library';
  private deckId: string | null = null;
  private index = 0; private revealed = false; private error = '';
  private off: (() => void) | null = null;
  private progress: Record<string, 'mastered' | 'review'> = {};
  private busy = false; private generation = 0; private clock: ReturnType<typeof setInterval> | null = null;
  constructor(private readonly ctx: StudyContext) { this.root.className = 'sv-study-workspace'; this.root.setAttribute('aria-label', 'Tarjetas de estudio'); }
  mount(container: HTMLElement): void {
    container.replaceChildren(this.root);
    try { this.progress = JSON.parse(localStorage.getItem('studyvillage-review-v2') || '{}'); } catch { this.progress = {}; }
    try {
      const old = JSON.parse(localStorage.getItem('studyvillage-flashcard-progress-v1') || '{}');
      const marks = old[this.ctx.actor().id] ?? old['local-host'] ?? {};
      for (const deck of this.ctx.decks.listDecks()) for (const card of deck.cards) if (!( `${deck.id}:${card.id}` in this.progress) && marks[card.id]) this.progress[`${deck.id}:${card.id}`] = marks[card.id] === 'mastered' ? 'mastered' : 'review';
    } catch { /* keep current progress */ }
    this.off = this.ctx.room.subscribe((_view, error) => { if (error) this.error = error; if (this.mode === 'quiz') this.render(); });
    this.clock = setInterval(() => { const clock = this.root.querySelector<HTMLElement>('[data-quiz-deadline]'); if (clock) clock.textContent = `${Math.max(0, Math.ceil((Number(clock.dataset.quizDeadline) - Date.now()) / 1000))} s`; }, 250);
    this.ctx.room.refresh(); this.render();
  }
  unmount(): void { if (this.clock) clearInterval(this.clock); this.clock = null; this.generation++; this.off?.(); this.off = null; this.root.remove(); }
  openDeck(id: string): void { this.deckId = id; this.mode = 'edit'; }
  private run(fn: () => void): void {
    try { this.error = ''; fn(); this.render(); }
    catch (e) { this.error = e instanceof Error ? e.message : 'No se pudo completar.'; let message = this.root.querySelector<HTMLElement>('[role=alert]'); if (!message) { message = el('p'); message.className = 'sv-error'; message.setAttribute('role', 'alert'); this.root.querySelector('header')!.after(message); } message.textContent = this.error; }
  }
  private deck(): FlashcardDeck | null { return this.deckId ? this.ctx.decks.getDeck(this.deckId) : null; }
  private render(): void {
    this.root.replaceChildren();
    const header = el('header'); header.append(button('Biblioteca', () => { this.mode = 'library'; this.render(); }), el('h2', this.mode === 'quiz' ? 'Jugar en grupo' : 'Tarjetas de estudio'), button('Cerrar', this.ctx.close));
    if(this.mode==='library')header.querySelector('button')?.remove();
    this.root.append(header);
    if (this.error) { const p = el('p', this.error); p.className = 'sv-error'; p.setAttribute('role','alert'); this.root.append(p); }
    if (this.mode === 'library') this.library();
    else if (this.mode === 'edit') this.editor();
    else if (this.mode === 'review') this.review();
    else this.quiz();
  }
  private library(): void {
    const actor = this.ctx.actor();
    const actions = el('div'); actions.className = 'sv-study-actions';
    actions.append(button('Crear mazo', () => { this.deckId = null; this.mode = 'edit'; this.render(); }, true), button('Jugar en grupo', () => { this.mode = 'quiz'; this.ctx.room.refresh(); this.render(); }));
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
    const advanced = el('details'); advanced.open = !!existing?.choices; advanced.append(el('summary', 'Opciones de concurso y detalles'));
    const enabled = el('input'); enabled.type = 'checkbox'; enabled.checked = !!existing?.choices;
    advanced.append(field('Usar en concursos', enabled));
    const options = Array.from({ length: 4 }, (_, i) => { const input = el('input'); input.maxLength = 120; input.value = existing?.choices?.[i] ?? ''; advanced.append(field(`Opción ${i+1}${i > 1 ? ' (opcional)' : ''}`, input)); return input; });
    const correct = el('select'); for (let i=0;i<4;i++) { const option = el('option', `Opción ${i+1}`); option.value = String(i); correct.append(option); } correct.value = String(existing?.correctChoice ?? 0);
    const hint = el('input'); hint.maxLength = 220; hint.value = existing?.hint ?? '';
    const explanation = el('textarea'); explanation.maxLength = 320; explanation.value = existing?.explanation ?? '';
    const tags = el('input'); tags.value = existing?.tags.join(', ') ?? '';
    const difficulty = el('select'); for (const [v,n] of [['easy','Fácil'],['medium','Media'],['hard','Difícil']]) { const o=el('option',n);o.value=v;difficulty.append(o); } difficulty.value = existing?.difficulty ?? 'medium';
    advanced.append(field('Respuesta correcta', correct), field('Pista', hint), field('Explicación', explanation), field('Etiquetas', tags), field('Dificultad', difficulty)); editor.append(advanced);
    editor.append(button(existing ? 'Guardar tarjeta' : 'Añadir tarjeta', () => this.run(() => {
      const actor = this.ctx.actor(); const fresh = this.ctx.decks.getDeck(deck.id)!;
      if (!this.ctx.decks.canEditDeck(fresh, actor.id, actor.isHost)) throw new Error('No puedes editar este mazo.');
      const choices = options.map(i => i.value.trim());
      if (enabled.checked && (choices.slice(0,2).some(v => !v) || choices.slice(2).some((v,i) => !v && choices.slice(i+3).some(Boolean)))) throw new Error('Completa al menos las dos primeras opciones, sin huecos.');
      const card: FlashcardItem = { ...(existing?.sourceRef ? { sourceRef: existing.sourceRef } : {}), id: existing?.id ?? crypto.randomUUID(), question: question.value.trim(), answer: answer.value.trim(), topic: fresh.topic, difficulty: difficulty.value as FlashcardItem['difficulty'], tags: tags.value.split(',').map(t=>t.trim()).filter(Boolean).slice(0,8), ...(hint.value.trim() ? { hint: hint.value.trim() } : {}), ...(explanation.value.trim() ? { explanation: explanation.value.trim() } : {}), ...(enabled.checked ? { choices: choices.filter(Boolean), correctChoice: Number(correct.value) } : {}) };
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
  private quiz(): void {
    const actor=this.ctx.actor(); const v=this.ctx.room.current();
    if (!v) { this.root.append(el('p','Conectando con el anfitrión…')); return; }
    if (v.phase==='lobby') {
      if (v.stopped) this.root.append(el('p','El anfitrión terminó la partida.'));
      if (actor.isHost) {
        const select=el('select'); const decks=this.ctx.decks.listDecks(actor.id,true);
        for(const d of decks){const o=el('option',`${d.title} · ${d.cards.filter(c=>c.choices).length} preguntas de concurso`);o.value=d.id;select.append(o);}
        this.root.append(field('Mazo para jugar',select));
        const advanced=el('details');advanced.append(el('summary','Opciones de partida'));const seconds=el('select');for(const [value,label] of [['20','20 segundos'],['30','30 segundos'],['60','60 segundos'],['0','Sin tiempo']]){const o=el('option',label);o.value=value;seconds.append(o);}advanced.append(field('Tiempo por pregunta',seconds));this.root.append(advanced);
        this.root.append(button('Comenzar partida',()=>this.run(()=>{const deck=this.ctx.decks.getDeck(select.value);if(!deck)throw new Error('Crea primero un mazo con opciones de concurso.');this.ctx.room.mutate(engine=>{engine.setDeck(deck);return true;});this.ctx.room.act({kind:'start',seconds:Number(seconds.value)});}),true));
      } else this.root.append(button('Entrar en la partida',()=>this.ctx.room.act({kind:'join',name:actor.displayName}),true),el('p','Espera a que el anfitrión comience.'));
      this.root.append(el('p',`${v.players.length} participantes`));
    } else if (v.question) {
      this.root.append(el('h3',v.question.text));
      if (v.phase==='question') { const timer = el('p', v.timed ? `${Math.ceil(v.remainingMs/1000)} s` : 'Sin límite de tiempo.'); if (v.timed) timer.dataset.quizDeadline = String(Date.now()+v.remainingMs); this.root.append(timer); v.question.choices.forEach((choice,index)=>{const b=button(choice,()=>this.ctx.room.act({kind:'answer',questionId:v.question!.id,choice:index}));b.disabled=actor.isHost||v.meAnswered;this.root.append(b);}); }
      else {this.root.append(el('p',`Respuesta: ${v.question.choices[v.solution!]}`));if(actor.isHost)this.root.append(button('Siguiente',()=>this.ctx.room.act({kind:'next'}),true));}
    } else this.root.append(el('h3','Partida terminada'));
    if(v.phase!=='question'){const list=el('ol');for(const p of v.players)list.append(el('li',`${p.name} · ${p.score} puntos`));this.root.append(list);}
    if(actor.isHost&&v.phase!=='lobby'){let armed=false;const stop=button('Terminar partida',()=>{if(!armed){armed=true;stop.textContent='¿Terminar para todos?';return;}this.ctx.room.stop();});this.root.append(stop);}
  }
  
  
}
```

### app/src/ui/game.css

Archivo completo de referencia.

SHA-256 del bloque: `c9e5de5fc4bcb57876846dba33a6e864625ecc1b0a69dd55be844f42bb4422ed`.

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

/* ------------------------------------------------------- werewolves --- */

.ww {
  --ww-bg: #f4e6c8; --ww-ink: #3d2b1d; --ww-dim: #85705a; --ww-card: #fffaf0; --ww-line: #dcc7a0; --ww-accent: #c4572e;
  display: flex; flex-direction: column; height: 100%; overflow: hidden; color: var(--ww-ink);
  background:
    radial-gradient(800px 420px at 50% 115%, #f6b65f55 0, transparent 70%),
    linear-gradient(180deg, #f8edd6, var(--ww-bg));
  transition: background var(--t-scene) ease;
}
.ww[data-dark="true"] {
  --ww-bg: #141a2e; --ww-ink: #e8e6f5; --ww-dim: #9aa0c2; --ww-card: #1f2742; --ww-line: #34406a; --ww-accent: #f08c4b;
  background:
    radial-gradient(700px 380px at 50% 112%, #f08c4b40 0, transparent 70%),
    radial-gradient(2px 2px at 20% 18%, #ffffffaa 50%, transparent 51%),
    radial-gradient(2px 2px at 72% 9%, #ffffff88 50%, transparent 51%),
    radial-gradient(2px 2px at 86% 30%, #ffffff66 50%, transparent 51%),
    radial-gradient(2px 2px at 38% 6%, #ffffff77 50%, transparent 51%),
    linear-gradient(180deg, #0e1325, var(--ww-bg));
}
.ww-head { display: flex; align-items: center; gap: 14px; padding: 16px 22px; border-bottom: 2px solid var(--ww-line); }
.ww-phase-icon { display: grid; place-items: center; width: 46px; height: 46px; border-radius: 14px; background: var(--ww-card); border: 2px solid var(--ww-line); }
.ww-titles { flex: 1; min-width: 0; }
.ww-titles h2 { margin: 0; font-size: 1.35rem; font-weight: 900; color: var(--ww-ink); }
.ww-titles p { margin: 2px 0 0; color: var(--ww-dim); font-size: .9rem; }
.ww-timer {
  min-width: 64px; padding: 6px 12px; border-radius: 999px; text-align: center; font-weight: 900; font-variant-numeric: tabular-nums;
  background: var(--ww-card); border: 2px solid var(--ww-line);
}
.ww-timer.is-low { color: #fff; background: #d9480f; border-color: #d9480f; }
.ww-icon-btn { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; border: 2px solid var(--ww-line); background: var(--ww-card); color: var(--ww-ink); }
.ww-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 18px; padding: 18px 22px; overflow: auto; }
.ww-table {
  align-self: start; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px;
  padding: 20px; border-radius: 28px; background: #00000010; border: 2px dashed var(--ww-line);
}
.ww-seat {
  position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 16px 10px 12px;
  border-radius: 20px; border: 2px solid var(--ww-line); background: var(--ww-card); color: var(--ww-ink);
  box-shadow: 0 4px 0 #0000001a; text-align: center; transition: transform var(--t-fast) var(--ease-in), border-color var(--t-fast);
}
.ww-seat:disabled { opacity: 1; cursor: default; }
.ww-seat.is-pickable { cursor: pointer; }
.ww-seat.is-pickable:hover { transform: translateY(-3px); border-color: var(--ww-accent); }
.ww-seat.is-selected { border-color: var(--ww-accent); box-shadow: 0 0 0 4px #c4572e44, 0 4px 0 #0000001a; transform: translateY(-3px); }
.ww-seat.is-me { border-style: double; border-width: 4px; }
.ww-seat.is-dead { filter: grayscale(1); opacity: .55; }
.ww-seat.is-empty { border-style: dashed; background: transparent; box-shadow: none; color: var(--ww-dim); }
.ww-seat.is-removable:hover { border-color: #c92a2a; }
.ww-avatar {
  position: relative; width: 64px; height: 64px; border-radius: 50%; display: grid; place-items: center;
  font-size: 1.6rem; font-weight: 900; color: #fff; text-shadow: 0 2px 0 #00000033; border: 3px solid #ffffffcc;
  background: #0000001a;
}
.ww-role-badge {
  position: absolute; right: -8px; bottom: -6px; width: 32px; height: 32px; display: grid; place-items: center;
  border-radius: 10px; background: var(--ww-card); border: 2px solid var(--ww-line); image-rendering: pixelated;
}
.ww-seat-name { font-weight: 800; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ww-seat-status { min-height: 1.2em; font-size: .78rem; color: var(--ww-dim); }
.ww-pack-mark { position: absolute; top: 6px; left: 6px; display: flex; align-items: center; gap: 2px; font-weight: 900; font-size: .75rem; color: var(--ww-accent); }
.ww-side { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.ww-card, .ww-action, .ww-log { padding: 16px; border-radius: 20px; background: var(--ww-card); border: 2px solid var(--ww-line); box-shadow: 0 4px 0 #0000001a; }
.ww-card h3, .ww-card h4 { margin: 0 0 6px; }
.ww-card p { margin: 4px 0; line-height: 1.4; }
.ww-card.is-role { text-align: center; }
.ww-card.is-lobos { border-color: #c92a2a88; }
.ww-card-art { display: grid; place-items: center; width: 92px; height: 92px; margin: 0 auto 8px; border-radius: 24px; background: #00000012; image-rendering: pixelated; }
.ww-card-team { font-size: .72rem; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; color: var(--ww-accent); }
.ww-deck, .ww-seen { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 8px; }
.ww-deck li { display: grid; grid-template-columns: 26px 1fr; column-gap: 8px; align-items: center; }
.ww-deck li span { grid-column: 2; font-size: .8rem; color: var(--ww-dim); }
.ww-seen li { display: flex; align-items: center; gap: 8px; text-align: left; }
.ww-muted { color: var(--ww-dim); font-size: .85rem; }
.ww-action { display: flex; flex-direction: column; gap: 10px; }
.ww-action p { margin: 0; line-height: 1.4; }
.ww-action.is-sleeping { text-align: center; }
.ww-sleep { font-style: italic; color: var(--ww-dim); }
.ww-btn {
  padding: 11px 16px; border-radius: 14px; border: 2px solid var(--ww-line); background: var(--ww-card); color: var(--ww-ink);
  font-weight: 800; box-shadow: 0 3px 0 var(--ww-line);
}
.ww-btn:active:not(:disabled) { transform: translateY(2px); box-shadow: 0 1px 0 var(--ww-line); }
.ww-btn-primary { background: var(--ww-accent); border-color: var(--ww-accent); color: #fff; box-shadow: 0 3px 0 #8f3a1c; }
.ww-check { display: flex; align-items: center; gap: 8px; font-weight: 700; }
.ww-death { display: flex; align-items: center; gap: 10px; font-weight: 800; }
.ww-winner { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 16px; font-size: 1.15rem; background: #ffe066; color: #5c3d00; }
.ww-winner.is-lobos { background: #c92a2a; color: #fff; }
.ww-error { margin: 0; padding: 10px 12px; border-radius: 12px; background: #ffe3e3; color: #a51d1d; font-weight: 700; }
.ww-log { list-style: none; margin: 0; display: grid; gap: 8px; max-height: 260px; overflow: auto; font-size: .86rem; }
.ww-log li { display: flex; gap: 8px; align-items: flex-start; line-height: 1.35; }
.ww-log li svg { flex: none; margin-top: 1px; }
.ww-empty { padding: 40px; text-align: center; color: var(--ww-dim); }

/* ---------------------------------------------------- gartic phone --- */

.gp {
  --gp-ink: #2b1b5a; --gp-violet: #6a3fd8; --gp-yellow: #ffd23f; --gp-teal: #2fd3a0;
  display: flex; flex-direction: column; height: 100%; overflow: auto; color: var(--gp-ink);
  font-weight: 700;
  background:
    radial-gradient(circle at 12% 20%, #ffffff14 0 10px, transparent 11px),
    radial-gradient(circle at 80% 70%, #ffffff12 0 14px, transparent 15px),
    radial-gradient(circle at 60% 15%, #ffffff10 0 6px, transparent 7px),
    linear-gradient(160deg, #7e4bf0 0%, #5b2fd1 45%, #3c1fa3 100%);
  background-size: 260px 260px, 320px 320px, 180px 180px, 100% 100%;
}
.gp-head { display: flex; align-items: center; gap: 14px; padding: 14px 22px; }
.gp-logo { display: flex; flex-direction: column; line-height: .9; color: #fff; text-shadow: 0 3px 0 #2b1b5a; transform: rotate(-3deg); }
.gp-logo-top { font-size: 1.5rem; font-weight: 900; letter-spacing: .02em; }
.gp-logo-bottom { font-size: 1.05rem; font-weight: 900; color: var(--gp-yellow); letter-spacing: .3em; }
.gp-step, .gp-timer {
  padding: 6px 14px; border-radius: 999px; background: #fff; color: var(--gp-ink); font-weight: 900;
  border: 3px solid var(--gp-ink); box-shadow: 0 4px 0 var(--gp-ink); font-variant-numeric: tabular-nums;
}
.gp-head .gp-step { margin-left: auto; }
.gp-timer { display: flex; align-items: center; gap: 8px; }
.gp-timer .is-low { color: #e03131; }
.gp-clock-face { width: 14px; height: 14px; border-radius: 50%; border: 3px solid var(--gp-ink); position: relative; }
.gp-clock-face::after { content: ''; position: absolute; left: 3px; top: 0; width: 2px; height: 5px; background: var(--gp-ink); }
.gp-close {
  margin-left: auto; width: 42px; height: 42px; border-radius: 50%; display: grid; place-items: center;
  background: #fff; color: var(--gp-ink); border: 3px solid var(--gp-ink); box-shadow: 0 4px 0 var(--gp-ink);
}
.gp-head .gp-step ~ .gp-close { margin-left: 0; }
.gp-stage { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 8px 22px 28px; }
.gp-card {
  width: min(760px, 100%); padding: 24px; border-radius: 26px; background: #fff; color: var(--gp-ink);
  border: 4px solid var(--gp-ink); box-shadow: 0 8px 0 var(--gp-ink);
}
.gp-title { margin: 0 0 12px; font-size: 1.6rem; font-weight: 900; text-transform: uppercase; letter-spacing: .02em; text-align: center; }
.gp-muted { color: #6b5f97; font-weight: 600; }
.gp-error { margin: 0; padding: 10px 16px; border-radius: 14px; background: #fff; color: #c92a2a; border: 3px solid #c92a2a; }
.gp-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 12px 22px; border-radius: 14px; font-size: 1.05rem; font-weight: 900; text-transform: uppercase;
  background: #fff; color: var(--gp-ink); border: 3px solid var(--gp-ink); box-shadow: 0 5px 0 var(--gp-ink);
}
.gp-btn:hover:not(:disabled) { filter: brightness(1.04); }
.gp-btn:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 2px 0 var(--gp-ink); }
.gp-btn-go { background: var(--gp-yellow); }
.gp-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 12px; margin-top: 16px; }
.gp-input {
  width: 100%; padding: 16px 18px; font-size: 1.2rem; font-weight: 800; border-radius: 16px;
  border: 3px solid var(--gp-ink); color: var(--gp-ink); background: #f6f2ff;
}
.gp-input::placeholder { color: #a99ad6; }
.gp-input:disabled { background: #eee; }
.gp-lobby { width: min(980px, 100%); display: grid; grid-template-columns: 340px 1fr; gap: 20px; }
.gp-lobby .gp-card { width: auto; }
.gp-player-list, .gp-roster { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.gp-player-list li { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 14px; background: #f3efff; }
.gp-player-list li.is-empty { background: transparent; border: 2px dashed #c8bdf0; }
.gp-player-list .gp-muted { margin-left: auto; font-size: .8rem; }
.gp-mini { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; border: 2px solid var(--gp-ink); background: #fff; color: var(--gp-ink); }
.gp-avatar {
  flex: none; display: grid; place-items: center; border-radius: 50%; color: #fff; font-weight: 900;
  border: 3px solid var(--gp-ink); text-shadow: 0 2px 0 #00000040;
}
.gp-avatar.is-md { width: 46px; height: 46px; font-size: 1.2rem; }
.gp-avatar.is-sm { width: 32px; height: 32px; font-size: .9rem; border-width: 2px; }
.gp-avatar.is-empty { background: transparent; border-style: dashed; border-color: #c8bdf0; }
.gp-steps { list-style: none; margin: 0 0 12px; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.gp-steps li { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; font-size: .9rem; }
.gp-steps strong { font-size: 1.1rem; text-transform: uppercase; }
.gp-steps span:last-child { font-weight: 600; color: #6b5f97; }
.gp-step-icon { width: 58px; height: 58px; border-radius: 18px; display: grid; place-items: center; background: var(--gp-violet); color: #fff; border: 3px solid var(--gp-ink); }
.gp-task { width: min(1000px, 100%); display: flex; flex-direction: column; align-items: center; gap: 14px; }
.gp-task .gp-card { display: flex; flex-direction: column; gap: 14px; }
.gp-prompt {
  display: flex; align-items: center; gap: 12px; padding: 10px 22px; border-radius: 16px; background: #fff;
  border: 4px solid var(--gp-ink); box-shadow: 0 6px 0 var(--gp-ink); font-size: 1.25rem;
}
.gp-prompt-label { padding: 4px 10px; border-radius: 10px; background: var(--gp-yellow); font-weight: 900; text-transform: uppercase; font-size: .9rem; }
.gp-board { display: grid; grid-template-columns: 110px minmax(0, 1fr) 110px; gap: 12px; width: 100%; align-items: start; }
.gp-board.is-locked .gp-paper-live { pointer-events: none; opacity: .75; }
.gp-palette, .gp-tools {
  display: grid; gap: 6px; padding: 10px; border-radius: 18px; background: #fff; border: 3px solid var(--gp-ink); box-shadow: 0 5px 0 var(--gp-ink);
}
.gp-palette { grid-template-columns: repeat(3, 1fr); }
.gp-swatch { aspect-ratio: 1; border-radius: 8px; border: 2px solid #00000030; }
.gp-swatch.is-active { outline: 3px solid var(--gp-ink); outline-offset: 1px; }
.gp-size { height: 40px; border-radius: 10px; border: 2px solid #ddd; background: #fff; display: grid; place-items: center; }
.gp-size.is-active { border-color: var(--gp-ink); background: #f3efff; }
.gp-size-dot { display: block; border-radius: 50%; background: var(--gp-ink); }
.gp-tool { padding: 8px 4px; border-radius: 10px; border: 2px solid #ddd; background: #fff; color: var(--gp-ink); font-weight: 800; font-size: .8rem; }
.gp-tool.is-active { border-color: var(--gp-ink); background: #f3efff; }
.gp-paper-wrap { border-radius: 18px; border: 4px solid var(--gp-ink); box-shadow: 0 6px 0 var(--gp-ink); overflow: hidden; background: #fff; line-height: 0; }
.gp-paper { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; background: #fff; }
.gp-paper-live { cursor: crosshair; touch-action: none; }
.gp-paper-view { border-radius: 14px; border: 3px solid var(--gp-ink); }
.gp-roster { grid-auto-flow: column; grid-auto-columns: max-content; padding: 10px 14px; border-radius: 999px; background: #ffffff22; }
.gp-roster li { display: flex; align-items: center; gap: 6px; color: #fff; opacity: .65; font-size: .85rem; }
.gp-roster li.is-done { opacity: 1; }
.gp-done { display: grid; place-items: center; width: 18px; height: 18px; border-radius: 50%; background: var(--gp-teal); color: var(--gp-ink); }
.gp-album { display: flex; flex-direction: column; max-height: calc(100vh - 140px); }
.gp-album-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.gp-album-head .gp-title { margin: 0; flex: 1; text-align: left; }
.gp-feed { list-style: none; margin: 0; padding: 4px; display: flex; flex-direction: column; gap: 14px; overflow: auto; }
.gp-bubble { display: flex; gap: 10px; align-items: flex-start; animation: sv-rise 260ms var(--ease-in); }
.gp-bubble:nth-child(even) { flex-direction: row-reverse; }
.gp-bubble-body { max-width: 78%; padding: 10px 14px; border-radius: 18px; background: #f3efff; border: 3px solid var(--gp-ink); }
.gp-bubble.is-draw .gp-bubble-body { width: 78%; background: #fff; }
.gp-bubble-name { display: block; font-size: .78rem; color: #6b5f97; margin-bottom: 4px; }
.gp-bubble-text { margin: 0; font-size: 1.15rem; font-weight: 800; }
.gp-paper-album { border-radius: 10px; }

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
  .ww-body { grid-template-columns: 1fr; }
  .gp-lobby { grid-template-columns: 1fr; }
  .gp-board { grid-template-columns: 1fr; }
  .gp-palette { grid-template-columns: repeat(9, 1fr); order: 2; }
  .gp-tools { grid-template-columns: repeat(4, 1fr); order: 3; }
  .gp-paper-wrap { order: 1; }
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
  .ww-head, .gp-head { padding: 12px 14px; }
  .ww-body { padding: 12px 14px; }
  .ww-table { grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); padding: 12px; }
  .gp-stage { padding: 6px 12px 24px; }
  .gp-card { padding: 16px; }
  .gp-steps { grid-template-columns: 1fr; }
  .gp-title { font-size: 1.25rem; }
}

@media (prefers-reduced-motion: reduce) {
  .sv-phone, .sv-phone-screen, .sv-activity, .sv-notice.sv-hud-toast, .gp-bubble { animation: none; }
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

### app/src/ui/theme.css

Archivo completo de referencia.

SHA-256 del bloque: `604ce06974dd225f53846bbdd410cca5ecab4a4d87426ae0032d914857b693ae`.

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
.pj-head, .nb-sidebar, .ww-head, .gp-head { background: var(--paper-soft); border-color: var(--paper-line); }
.pj-section, .pj-input, .pj-head, .nb-page, .nb-slash, .gp-card { background-color: var(--paper); color: var(--text-warm); }
.pj-btn, .nb-primary, .nb-btn, .gp-btn, .ww-btn, .sv-study-workspace button {
  border-radius: 8px; font-weight: 650; border: 1px solid var(--paper-line);
  background: var(--paper-soft); color: var(--text-warm); box-shadow: 0 2px 0 #b3997240;
}
.pj-btn-primary, .nb-primary, .gp-btn-primary, .ww-btn-primary, .sv-study-workspace .is-primary { background: var(--accent-leaf); color: var(--paper); border-color: #35593a; }
.pj-head, .nb-toolbar, .gp-head, .ww-head { border-top: 5px solid var(--wood-mid); }
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
.ww[data-dark=true] { --ww-bg: #29251f; --ww-card: #393329; --ww-line: #67533e; --ww-ink: #f3e7cc; --ww-dim: #c5b399; }
.ww[data-dark=true] .ww-head { background: #30291f; border-color: #67533e; }
.sv-activity-stop { position: absolute; right: 70px; top: 16px; z-index: 10; border: 1px solid #b07453; border-radius: 8px; padding: 9px 12px; background: var(--paper); color: #8a3b26; }
.sv-study-workspace { height: 100%; overflow: auto; padding: 20px; background: var(--paper); color: var(--text-warm); }
.sv-study-workspace header { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; border-bottom: 2px solid var(--paper-line); padding-bottom: 16px; margin-bottom: 18px; }
.sv-study-workspace header h2 { flex: 1; margin: 0; }
.sv-study-workspace button { padding: 10px 15px; min-height: 44px; cursor: pointer; }
.sv-study-workspace input, .sv-study-workspace textarea, .sv-study-workspace select { padding: 10px; border: 1px solid var(--paper-line); background: #fffdf6; color: var(--text-warm); border-radius: 8px; max-width: 100%; }
.sv-study-library, .sv-role-catalog, .sv-furniture-catalog { display: grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap: 12px; }
.sv-study-card, .sv-role-card { padding: 18px; background: var(--paper-soft); border: 1px solid var(--paper-line); border-radius: 10px; }
.sv-study-card h3 { margin: 0 0 8px; }
.sv-study-form { display: flex; flex-direction: column; gap: 12px; max-width: 750px; margin: 0 auto; }
.sv-study-form label { display: flex; flex-direction: column; gap: 6px; }
.sv-study-review { margin: 8vh auto 24px; max-width: 720px; text-align: center; }
.sv-study-review .sv-study-card { padding: 40px 25px; font-size: 1.3rem; min-height: 180px; }
.sv-study-actions { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
.sv-study-workspace details { padding: 12px; border: 1px solid var(--paper-line); border-radius: 8px; }
.sv-study-workspace summary { cursor: pointer; }
.sv-study-workspace .sv-error { color: #943d2c; }
.sv-role-card h4 { margin: 8px 0; }
.sv-role-card p { font-size: .85rem; }
.sv-decoration-toolbar { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; flex-wrap: wrap; gap: 8px; padding: 12px; z-index: 9; width: min(94vw,800px); border: 3px solid var(--wood-mid); border-radius: 12px; background: var(--paper); color: var(--text-warm); }
.sv-decoration-toolbar button { min-height: 42px; }
@media(max-width:740px) { .sv-activity-stop { position: relative; right: auto; top: auto; margin: 6px 12px; } .sv-study-workspace { padding: 12px; } }
.ww-body:has(.sv-role-setup) { display: flex; flex-wrap: wrap; overflow: auto; }
.sv-role-setup { flex-basis: 100%; }
.sv-role-setup summary { cursor: pointer; padding: 8px; }
.sv-role-catalog { margin: 12px 0; }
.sv-role-card input { width: 70px; padding: 8px; }
.nb { --nb-side: var(--paper-soft); background: var(--paper); }
.nb-search { background: var(--paper-soft); }
.gp { --gp-ink: var(--text-warm); --gp-violet: var(--accent-leaf); --gp-yellow: #e5b956; --gp-teal: var(--accent-leaf); background: linear-gradient(145deg, var(--wood-mid), var(--wood-dark)); }
.gp-logo { color: var(--text-warm); text-shadow: none; transform: none; }
.gp-logo-bottom { color: var(--accent-leaf); }
.gp-btn-go { background: var(--accent-leaf); color: var(--paper); border-color: var(--accent-leaf); }
.gp-head { color: var(--text-warm); }
.sv-activity:has(> .sv-activity-stop) { padding-bottom: 60px; background: var(--wood-dark); }
.sv-activity > .sv-activity-stop { position: absolute; top: auto; bottom: 9px; right: 16px; flex: none; min-height: 42px; max-width: calc(100vw - 32px); margin: 0; }
.sv-role-setup .sv-role-card { color: var(--text-warm); }
.sv-role-setup { max-height: 60dvh; overflow: auto; }
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
.sv-role-card input, .sv-role-setup select, .sv-role-setup input[type=text] { border: 1px solid var(--paper-line); border-radius: 6px; background: var(--paper); color: var(--text-warm); }
```

### app/src/world/areas.ts — estaciones de juegos, sin consola de IA

Sustituye la variante clásica para volver a añadir la hoguera y mesa de Gartic.

SHA-256 del bloque: `7060243e49a53eb262b32ca2543dca67936890d0ea1f3b34b4069ec319370f94`.

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
    id: 'community:campfire-werewolves',
    areaId: 'community',
    kind: 'campfire_werewolves',
    defaultLabel: 'Hoguera de los Lobos',
    displayName: 'Hoguera · Hombres Lobo',
    description: 'Mesa junto al fuego para jugar Hombres Lobo (4 a 8 jugadores, con bots si faltan).',
    promptKey: 'E · Jugar Hombres Lobo',
    x: 342,
    y: 176,
    w: 84,
    h: 68,
    layer: 'object',
    hasCollision: true,
    interactionRadius: 48,
    ownerId: null,
    visibility: 'everyone',
    usePermission: 'public',
    editPermission: 'host_only',
    allowedUsers: [],
    customSpriteDataUrl: null,
    customColor: null,
    state: { activeGame: 'werewolves' },
    revision: 1,
  },
  {
    id: 'community:drawing-table-gartic',
    areaId: 'community',
    kind: 'drawing_table_gartic',
    defaultLabel: 'Mesa de dibujo',
    displayName: 'Mesa · Gartic Phone',
    description: 'Mesa creativa de dibujo y teléfono descompuesto para toda la aldea.',
    promptKey: 'E · Jugar Gartic Phone',
    x: 128,
    y: 86,
    w: 82,
    h: 54,
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
    state: { activeGame: 'gartic' },
    revision: 1,
  },
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
      case 'campfire_werewolves': {
        // Log seats around a glowing medieval campfire table
        fill(ctx, earth1, x + 6, y + h / 2 - 8, 16, 16);
        fill(ctx, earth1, x + w - 22, y + h / 2 - 8, 16, 16);
        fill(ctx, earth1, x + w / 2 - 12, y + 2, 24, 12);
        fill(ctx, earth1, x + w / 2 - 12, y + h - 14, 24, 12);

        // Stone fire ring & round wooden council table
        fill(ctx, '#5c6166', x + 18, y + 14, w - 36, h - 28);
        fill(ctx, '#7c8288', x + 22, y + 18, w - 44, h - 36);
        fill(ctx, earth0, x + 26, y + 22, w - 52, h - 44);

        // Animated pixel fire
        const flicker = Math.sin(time * 6) * 2;
        fill(ctx, ember1, x + w / 2 - 10, y + h / 2 - 6, 20, 12);
        fill(ctx, ember3, x + w / 2 - 7, y + h / 2 - 11 + flicker * 0.5, 14, 12);
        fill(ctx, ember4, x + w / 2 - 4, y + h / 2 - 14 + flicker, 8, 9);
        glowPool(ctx, x + w / 2, y + h / 2 + 4, 48, '255,180,95');
        break;
      }
      case 'drawing_table_gartic': {
        // Large studio drawing table with easel, color pots & paper sheets
        fill(ctx, baseDark, x + 6, y + 24, 8, h - 24);
        fill(ctx, baseDark, x + w - 14, y + 24, 8, h - 24);
        fill(ctx, baseColor, x, y + 10, w, 20);
        fill(ctx, baseLit, x, y + 10, w, 5);
        // Paper pad
        fill(ctx, PALETTE.paper[4], x + 12, y + 13, 34, 14);
        fill(ctx, ember2, x + 16, y + 16, 14, 3);
        fill(ctx, tide2, x + 16, y + 21, 20, 3);
        // Color pots
        fill(ctx, ember1, x + 54, y + 12, 7, 7);
        fill(ctx, tide1, x + 63, y + 12, 7, 7);
        fill(ctx, moss4, x + 58, y + 20, 7, 6);
        break;
      }
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
  text(ctx, 'PLAZA COMUNITARIA · JUEGOS Y PROYECTOS', 384, 27, PALETTE.paper[0], 9.5);

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

### app/src/world/interactive-objects.ts — registro de fase 2

Tipos de juegos añadidos, sin estación de IA todavía.

SHA-256 del bloque: `7a524d5163e7f7833d6f4fbc9112979f15ff60cf78177ebd373217c5311ac378`.

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
  | 'drawing_table_gartic'
  | 'campfire_werewolves'
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
    'drawing_table_gartic',
    'campfire_werewolves',
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

### Prueba funcional de las variantes independientes

Prueba adicional ejecutada con Vitest en un proyecto aislado. Ambos casos pasaron. Los textos usados aquí son fixtures de test, nunca contenido inicial de la aplicación.

SHA-256 del bloque: `9fec7209ab577543bb7ed54ca20a49f3e7000ae52c7510229b421c3dd17d54fa`.

```ts
import { expect,it } from 'vitest';
import { GarticGame } from './app/src/minigames/gartic-phone';
import { ManualDeckRepository } from './app/src/study/decks';
import { StudyQuiz } from './app/src/minigames/study-quiz';
it('the human-only reference runs a full drawing telephone and cancels cleanly',()=>{
  const game=new GarticGame(()=>0,'host');
  const people=['a','b','c'];let now=0;
  for(const id of people)game.apply(id,{kind:'join',name:id,color:'#123456'},now);
  game.apply('host',{kind:'start'},now);
  for(let round=0;round<4;round++){
    for(const id of people){const v=game.viewFor(id,now);expect(v.round).toBe(round);expect(v.task).not.toBeNull();
      game.apply(id,v.task!.kind==='draw'?{kind:'submit',drawing:{strokes:[{c:'#000000',w:4,p:[10,10,30,30]}]}}:{kind:'submit',text:`Entrega de ${id}`},++now);
    }
  }
  expect(game.phase).toBe('album');let steps=0;
  while(game.phase==='album'&&steps++<20)game.apply('host',{kind:'album_next'},++now);
  expect(game.phase).toBe('end');expect(steps).toBe(12);
  game.cancel();expect(game.phase).toBe('lobby');expect(game.players).toHaveLength(3);
  expect('setAiBotsEnabled' in game).toBe(false);expect('aiBotsReady' in game.viewFor('a',now)).toBe(false);
});
it('the independent manual library stays empty until the user creates content and supports quizzes',()=>{
  const decks=new ManualDeckRepository();expect(decks.listDecks()).toEqual([]);
  const deck=decks.createManualDeck({title:'Mi contenido',ownerId:'local-host',visibility:'private'});
  decks.saveDeck({...deck,cards:[{id:'card',question:'Pregunta del usuario',answer:'Respuesta del usuario',topic:'Mi contenido',difficulty:'easy',tags:[],choices:['A','B'],correctChoice:1}]});
  const quiz=new StudyQuiz('host');quiz.setDeck(decks.getDeck(deck.id)!);quiz.apply('guest',{kind:'join',name:'Invitado'},0);quiz.apply('host',{kind:'start',seconds:20},0);
  const v=quiz.viewFor('guest',0);expect(v.solution).toBeNull();quiz.apply('guest',{kind:'answer',questionId:v.question!.id,choice:1},10000);
  expect(quiz.viewFor('host',10000).players[0].score).toBe(750);expect(quiz.viewFor('host',10000).solution).toBe(1);
  quiz.cancel();expect(quiz.viewFor('guest',10000).phase).toBe('lobby');
  expect(decks.deleteDeck(deck.id,'local-host')).toBe(true);expect(decks.listDecks()).toEqual([]);
});
```

## Adenda 0.2.1 — Cámara opcional en Hombres Lobo y Gartic, sin IA

Esta adenda amplía la fase 2 y debe conservarse al aplicar la fase 3. Su código proviene del commit `6f4dc6470ef0c665e768b5f9576f4c47e070801c`. No cambia las reglas de los juegos ni depende de inferencia. No retroceder la versión del paquete al copiar un archivo de configuración de un anexo anterior.

### Aspecto y comportamiento exactos

Añadir **Cámara** a ambos juegos, disponible también para un observador que no ocupa silla. Está apagada por defecto; abrir un panel no pide permisos. Al pulsar, capturar solo vídeo, frontal preferente, ideal 1920×1080 y 30 fps máximo. El navegador negocia la resolución real. No activar micrófono junto con la cámara.

Cada vídeo ocupa una tarjeta cuadrada, bordes redondeados de 22 px, borde claro fino y sombra suave, inspirada en el acabado de Apple y sobre el papel/madera del pueblo. Vídeo con object-fit:cover, etiqueta de nombre inferior sobre degradado suave y punto verde. Solo la vista propia se refleja en espejo. Mostrar HD/Full HD únicamente a partir de las dimensiones reales del vídeo; actualizar al cambiar su resolución.

Sin vídeos, botón compacto en el borde inferior; no reservar una columna vacía. Con vídeos, dock lateral de 192 px en escritorio/iPad y tira horizontal inferior de 132 px en pantallas ≤740 px; tarjetas móviles de 108×108. Mantener al juego en el espacio restante sin superponer la cámara a herramientas o tapar «Terminar partida». El control cambia a **Apagar**. Durante permiso pendiente permite cancelar; si se deniega, explicar y permitir reintentar sin romper el juego.

### Audiencia y protocolo

Cámara independiente de los canales de micrófono/pantalla y de una llamada privada de voz. Añadir canal autenticado `camera` a `AppChannel` y su Zod. Sus mensajes de presencia son `{game:'werewolves'|'gartic'|null,request:boolean}`. La autoridad del relay conserva el remitente real como en los demás canales.

Al abrir un juego, anunciar su actividad. Quien recibe una presencia request actualiza la actividad conocida y responde con la suya, request:false; no crear un ping-pong infinito. Solo ofrecer vídeo a peers autenticados que estén en la misma escena y tengan abierto el mismo juego. Se puede recibir sin activar cámara propia. Un participante en otro juego no recibe el vídeo. No incluir bots entre los peers de webcam.

Una llamada de cámara usa metadatos distintos, kind:camera, versión 2, sesión, epoch, identidad, endpoint/token y room `<escena>:game:<juego>`. Validarlos en el receptor antes de answer y de aceptar stream. Exigir vídeo y rechazar cualquier pista de audio. El límite global de seis miembros permite hasta cinco cámaras remotas. No enviar vídeos como base64 por el canal JSON ni emitirlos a todos los habitantes por defecto.

Cerrar/cambiar de juego, cambiar de escena o salir/desconectarse de sesión detiene pistas y llamadas. Cancelar invalida también la promesa de permiso: si el SO concede tarde, detener ese stream y descartarlo. No reactivar una webcam automáticamente al reconectar. Apagar tu cámara conserva la posibilidad de ver a los otros. WebRTC solicita hasta 6 Mbps por cámara, máximo 30 fps y maintain-resolution cuando esté soportado; calidad efectiva depende de hardware/red.

### Wiring preciso en la aplicación

1. `VillageClient` posee un `GameCameraManager` y un mapa de actividades remotas. `NetworkView.gameCamera` expone local/pending/error/remote, sin mezclar estos vídeos con `media.remote` de audio/pantalla.
2. En `attachEndpoint`, adjuntar el endpoint al gestor; enrutar solo llamadas que pasen cameraMetadataSchema al gestor de cámara y las demás al gestor anterior de medios.
3. En `deliverApp`, consumir el canal camera de forma validada, actualizar presencia, responder cuando se pida y sincronizar contexto.
4. `syncCamera` calcula escena mediante el mismo predicado de presencia que el mundo. Incluye peers autenticados de esa escena; watching indica quién anunció el mismo juego. Capture offline es una previsualización propia sin peers.
5. Exponer acciones `setCameraActivity(activity|null)` y `toggleGameCamera()`. En bootstrap: `setCameraActivity:a=>client.setCameraActivity(a)` y `toggleGameCamera:()=>run(()=>client.toggleGameCamera())`.
6. El controlador de actividades construye una vez `GameCameraDock`, extendiendo el Pick de acciones con esas dos funciones. Después de montar WerewolvesPanel/GarticPanel, montar el dock en el mismo activityOverlay, anunciar kind y actualizarlo con AppView.
7. En cada `syncSession`, actualizar dock con la vista actual. El dock conserva elementos video por identidad/stream; no recrear el vídeo en cada tick de la sala.
8. Antes de desmontar/cambiar modal, `cameraDock.unmount(); actions.setCameraActivity(null)`. Desmontar libera srcObject; el servicio es quien detiene pistas/conexiones. Dispose de cliente detiene gestor y endpoint.
9. Reservar los 60 px del pie ya usados por terminar partida. Solo añadir la segunda columna/tira cuando el dock tenga vídeos.

### Pruebas mínimas

- Nunca solicitar dispositivo al abrir un juego; hacerlo al pulsar Cámara y con audio:false.
- Activar/apagar, permiso denegado y concesión tardía después de cerrar: ninguna pista residual.
- Dos navegadores, juegos diferentes: cada uno solo ve su propia vista. Cambiar al mismo juego: vídeo remoto visible y con frames reales; funciona como visor sin cámara propia. Activar segunda cámara: ambos ven dos tarjetas. Cerrar: se elimina la remota del otro navegador.
- Probar ambos juegos en 390×844, 820×1180 y 1440×1000; aspecto cuadrado, sin overflow horizontal y sin tapar el juego.
- Rechazar token/epoch/sesión/escena/juego equivocados y streams con audio.
- Referencia: 104 tests de código y 47 de navegador pasaron. Las webcams de prueba fueron sintéticas; esto no demuestra calidad de una webcam física ni runtime Windows.

### Código completo de la adenda

Los archivos de contratos/cliente siguientes sustituyen los anexos equivalentes de la base; conservar las variantes humanas de Gartic y el repositorio manual de esta fase. El código de cámara y transporte no añade IA.

### app/src/media/game-camera.ts — adenda 0.2.1

Archivo completo. SHA-256 del bloque: `470d6ce4e56a509b53ebe3d41e038e61b3be107f0ffc1f0bca676bd318e21388`.

```ts
import type { GameCameraView } from '../protocol/types';
import { cameraMetadataSchema } from '../protocol/schema';
import type { MediaCall, TransportEndpoint } from '../transport/types';
import type { MediaContext, MediaDevicesAdapter, MediaPeer } from './manager';

export interface CameraPeer extends MediaPeer { watching: boolean }
export interface CameraContext extends Omit<MediaContext, 'peers'> { peers: CameraPeer[] }
interface CallState { call: MediaCall; identityId: string; stream?: MediaStream; off: (() => void)[] }

/** Video only, with its own game audience; voice/screen consent stays independent. */
export class GameCameraManager {
  private endpoint?: TransportEndpoint;
  private context: CameraContext | null = null;
  private local: MediaStream | null = null;
  private pending = false;
  private error: string | null = null;
  private generation = 0;
  private incoming = new Map<string, CallState>();
  private outgoing = new Map<string, CallState>();
  constructor(private readonly changed: () => void, private readonly devices?: MediaDevicesAdapter) {}
  get view(): GameCameraView {
    return { local: this.local, pending: this.pending, error: this.error,
      remote: [...this.incoming.values()].filter(c => c.stream).map(c => ({ identityId: c.identityId, stream: c.stream! })) };
  }
  attach(endpoint: TransportEndpoint): void { this.endpoint = endpoint; }
  setContext(context: CameraContext | null): void {
    const previous = this.context;
    if (previous?.sessionId !== context?.sessionId || previous?.epoch !== context?.epoch || previous?.room !== context?.room) this.stop();
    this.context = context;
    for (const [id, c] of this.incoming) if (!context?.peers.some(p => p.identityId === id && p.endpoint === c.call.endpoint && p.receiveToken === previous?.peers.find(p => p.identityId === id)?.receiveToken)) this.close(this.incoming, id);
    for (const [id, c] of this.outgoing) if (!context?.peers.some(p => p.identityId === id && p.endpoint === c.call.endpoint && p.watching && p.sendToken === previous?.peers.find(p => p.identityId === id)?.sendToken)) this.close(this.outgoing, id);
    this.reconcile();
  }
  async toggle(): Promise<void> {
    if (this.local || this.pending) { this.stopCapture(); this.changed(); return; }
    if (!this.context) { this.error = 'Abre Hombres Lobo o Gartic para activar la cámara.'; this.changed(); return; }
    const devices = this.devices ?? (typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined);
    if (!devices?.getUserMedia) { this.error = 'La cámara no está disponible en este entorno.'; this.changed(); return; }
    const generation = ++this.generation;
    this.pending = true; this.error = null; this.changed();
    try {
      const stream = await devices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30, max: 30 } } });
      if (generation !== this.generation || !this.context) { this.stopTracks(stream); return; }
      if (!stream.getVideoTracks().length || stream.getAudioTracks().length) { this.stopTracks(stream); throw new Error('Invalid camera stream'); }
      this.local = stream;
      for (const track of stream.getVideoTracks()) {
        try { track.contentHint = 'motion'; } catch { /* Optional hint. */ }
        track.addEventListener('ended', () => { if (this.local === stream) { this.stopCapture(); this.changed(); } }, { once: true });
      }
      this.reconcile();
    } catch (e) {
      if (generation === this.generation) this.error = e instanceof DOMException && e.name === 'NotFoundError'
        ? 'No se encontró una cámara conectada.' : 'No se pudo activar la cámara. Revisa el permiso e inténtalo de nuevo.';
    } finally { if (generation === this.generation) this.pending = false; this.changed(); }
  }
  receive(call: MediaCall): void {
    const parsed = cameraMetadataSchema.safeParse(call.metadata); const context = this.context;
    if (!parsed.success || !context) { call.close(); return; }
    const metadata = parsed.data;
    const peer = context.peers.find(p => p.identityId === metadata.identityId && p.endpoint === call.endpoint && p.receiveToken === metadata.token);
    if (!peer || metadata.sessionId !== context.sessionId || metadata.epoch !== context.epoch || metadata.room !== context.room || this.incoming.has(peer.identityId) || this.incoming.size >= 5) { call.close(); return; }
    const item: CallState = { call, identityId: peer.identityId, off: [] };
    this.incoming.set(peer.identityId, item);
    item.off.push(call.onClose(() => { this.close(this.incoming, peer.identityId); this.changed(); }));
    item.off.push(call.onStream(stream => {
      const now = this.context;
      if (this.incoming.get(peer.identityId) !== item || !now || now.room !== metadata.room || now.sessionId !== metadata.sessionId || now.epoch !== metadata.epoch
        || !now.peers.some(p => p.identityId === peer.identityId && p.endpoint === call.endpoint && p.receiveToken === metadata.token)
        || !stream.getVideoTracks().length || stream.getAudioTracks().length) {
        this.stopTracks(stream); this.close(this.incoming, peer.identityId); this.changed(); return;
      }
      item.stream = stream;
      for (const track of stream.getTracks()) track.addEventListener('ended', () => { if (this.incoming.get(peer.identityId) === item) { this.close(this.incoming, peer.identityId); this.changed(); } }, { once: true });
      this.changed();
    }));
    try { call.answer(); } catch { this.close(this.incoming, peer.identityId); }
  }
  private reconcile(): void {
    const context = this.context;
    if (!context || !this.local || !this.endpoint) return;
    for (const peer of context.peers) {
      if (!peer.watching || this.outgoing.has(peer.identityId)) continue;
      try {
        const call = this.endpoint.call(peer.endpoint, this.local, { v: 2, kind: 'camera', sessionId: context.sessionId, epoch: context.epoch, room: context.room, identityId: context.identityId, token: peer.sendToken });
        const item: CallState = { call, identityId: peer.identityId, off: [] }; this.outgoing.set(peer.identityId, item);
        item.off.push(call.onClose(() => { this.close(this.outgoing, peer.identityId); this.changed(); }));
        item.off.push(call.onStream(remote => this.stopTracks(remote)));
        call.limitBitrate('camera');
      } catch { this.error = 'No se pudo conectar la cámara con otra persona.'; }
    }
  }
  private close(map: Map<string, CallState>, id: string): void {
    const item = map.get(id); if (!item) return;
    map.delete(id); for (const off of item.off) off(); if (item.stream) this.stopTracks(item.stream);
    try { item.call.close(); } catch { /* Already closed. */ }
  }
  private stopTracks(stream: MediaStream): void { for (const track of stream.getTracks()) track.stop(); }
  private stopCapture(): void {
    this.generation++; this.pending = false; this.error = null;
    const stream = this.local; this.local = null;
    for (const id of [...this.outgoing.keys()]) this.close(this.outgoing, id);
    if (stream) this.stopTracks(stream);
  }
  stop(): void { this.stopCapture(); for (const id of [...this.incoming.keys()]) this.close(this.incoming, id); }
  suspend(): void { this.stop(); this.context = null; this.changed(); }
  dispose(): void { this.suspend(); this.endpoint = undefined; }
}
```

### app/src/ui/game-camera-ui.ts — adenda 0.2.1

Archivo completo. SHA-256 del bloque: `c1caaa550bba41a36f6ccd8ba8f0b106d46fdf3e913afc9c9dc1f342522e758d`.

```ts
import type { AppView } from '../protocol/types';

interface Tile { root: HTMLElement; video: HTMLVideoElement; name: HTMLElement; quality: HTMLElement; stream: MediaStream }
export class GameCameraDock {
  readonly root = document.createElement('section');
  private button = document.createElement('button');
  private label = document.createElement('span');
  private gallery = document.createElement('div');
  private error = document.createElement('p');
  private tiles = new Map<string, Tile>();
  private container: HTMLElement | null = null;
  constructor(private readonly toggle: () => Promise<void>) {
    this.root.className = 'sv-game-camera'; this.root.setAttribute('aria-label', 'Cámaras del juego');
    const controls = document.createElement('div'); controls.className = 'sv-game-camera-controls';
    this.button.type = 'button'; this.button.className = 'sv-game-camera-toggle';
    // Camera glyph follows the existing 12 px icon grid; the card itself has a quiet rounded frame.
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); icon.setAttribute('viewBox','0 0 24 24'); icon.setAttribute('width','18'); icon.setAttribute('height','18'); icon.setAttribute('aria-hidden','true');
    const path = document.createElementNS(icon.namespaceURI,'path'); path.setAttribute('d','M8 5.5 9.5 3h5L16 5.5h3A2.5 2.5 0 0 1 21.5 8v10a2.5 2.5 0 0 1-2.5 2.5H5A2.5 2.5 0 0 1 2.5 18V8A2.5 2.5 0 0 1 5 5.5Z M16 12.5a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z'); path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');path.setAttribute('stroke-width','1.7');icon.append(path);
    this.button.append(icon,this.label);this.button.onclick=()=>{void this.toggle();};
    this.error.className='sv-game-camera-error';this.error.setAttribute('role','status');this.error.hidden=true;
    this.gallery.className='sv-game-camera-gallery';controls.append(this.button);this.root.append(controls,this.error,this.gallery);
  }
  mount(container: HTMLElement): void { this.container=container;container.classList.add('has-game-camera');container.append(this.root); }
  update(view: AppView): void {
    const camera=view.network.gameCamera;
    const on=!!camera.local;
    this.label.textContent=camera.pending?'Abriendo…':on?'Apagar':'Cámara';
    this.button.setAttribute('aria-label',camera.pending?'Cancelar activación de cámara':on?'Apagar cámara':'Activar cámara');
    this.button.setAttribute('aria-pressed',String(on||camera.pending));this.button.classList.toggle('is-on',on);
    this.error.textContent=camera.error;this.error.hidden=!camera.error;
    const streams=new Map<string,{stream:MediaStream;name:string;self:boolean}>();
    if(camera.local)streams.set(view.identity.fingerprint,{stream:camera.local,name:'Tú',self:true});
    for(const remote of camera.remote){const member=view.network.members.find(m=>m.identity.fingerprint===remote.identityId);streams.set(remote.identityId,{stream:remote.stream,name:member?.identity.displayName||'Vecino',self:false});}
    for(const [id,tile] of this.tiles)if(!streams.has(id)){tile.video.srcObject=null;tile.root.remove();this.tiles.delete(id);}
    for(const [id,item] of streams){
      let tile=this.tiles.get(id);
      if(tile&&tile.stream!==item.stream){tile.video.srcObject=null;tile.root.remove();this.tiles.delete(id);tile=undefined;}
      if(!tile){
        const card=document.createElement('div');card.className='sv-game-camera-tile';card.dataset.cameraPeer=id;
        const video=document.createElement('video');video.autoplay=true;video.playsInline=true;video.muted=true;video.className=item.self?'is-self':'';video.srcObject=item.stream;video.setAttribute('aria-label',item.self?'Tu cámara':`Cámara de ${item.name}`);
        const caption=document.createElement('div');caption.className='sv-game-camera-caption';
        const dot=document.createElement('span');dot.className='sv-game-camera-live';dot.setAttribute('aria-hidden','true');
        const name=document.createElement('span');const quality=document.createElement('span');quality.className='sv-game-camera-quality';
        caption.append(dot,name,quality);card.append(video,caption);this.gallery.append(card);
        const current:Tile={root:card,video,name,quality,stream:item.stream};this.tiles.set(id,current);tile=current;
        const updateQuality=()=>{quality.textContent=video.videoWidth>=1920&&video.videoHeight>=1080?'Full HD':Math.min(video.videoWidth,video.videoHeight)>=720?'HD':'';};
        video.onloadedmetadata=updateQuality;video.addEventListener('resize',updateQuality);
        void video.play().catch(()=>{/* Muted inline video can resume after a browser gesture. */});
      }
      tile.name.textContent=item.name;
    }
    const live=streams.size>0;this.root.classList.toggle('is-live',live);this.container?.classList.toggle('is-camera-live',live);
  }
  unmount(): void {
    for(const tile of this.tiles.values())tile.video.srcObject=null;
    this.tiles.clear();this.gallery.replaceChildren();this.root.remove();this.container?.classList.remove('has-game-camera','is-camera-live');this.container=null;
  }
}
```

### app/src/protocol/types.ts — adenda 0.2.1

Archivo completo. SHA-256 del bloque: `cba871fb3c369a855f6bca5e6ff5b89b4cfc2886ba06b4051387c6f05f4131f9`.

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

export type AppChannel = 'werewolves' | 'gartic' | 'projects' | 'study' | 'camera';
export type CameraActivity = 'werewolves' | 'gartic';
export interface GameCameraView {
  local: MediaStream | null; pending: boolean; error: string | null;
  remote: { identityId: IdentityId; stream: MediaStream }[];
}
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
  strokes: BoardStroke[]; hostGraceRemainingMs: number | null; error: string | null; media: MediaView; gameCamera: GameCameraView;
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
  setCameraActivity(activity: CameraActivity | null): void;
  toggleGameCamera(): Promise<void>;
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

### app/src/protocol/schema.ts — adenda 0.2.1

Archivo completo. SHA-256 del bloque: `1c0987acfcc93605866df7e7ff42f056b5d549ecf428213586662522d5b4476b`.

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
export const appChannelSchema = z.enum(['werewolves', 'gartic', 'projects', 'study', 'camera']);
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
export const cameraPresenceSchema = z.strictObject({ game: z.enum(['werewolves', 'gartic']).nullable(), request: z.boolean() });
export const cameraMetadataSchema = z.strictObject({
  v: z.literal(2), kind: z.literal('camera'), sessionId: idSchema, epoch: integer.min(1),
  room: z.string().regex(/^(village|area:(?:residential|community|study)|house:[a-f0-9]{64}):game:(werewolves|gartic)$/),
  identityId: fingerprintSchema, token: nonce,
});
export function parseWire(raw: unknown): WireMessage {
  if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > LIMITS.messageBytes) throw new Error('Mensaje fuera de límites.');
  return wireSchema.parse(JSON.parse(raw));
}
```

### app/src/session/client.ts — adenda 0.2.1

Archivo completo. SHA-256 del bloque: `865aa116d5b610949b49640d121efc2d2d7932ef58d19ecd11d4961675f457a5`.

```ts
import { GameCameraManager, type CameraPeer } from '../media/game-camera';
import { cameraMetadataSchema, cameraPresenceSchema } from '../protocol/schema';
import type { CameraActivity } from '../protocol/types';
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
  private camera: GameCameraManager;
  private cameraActivity: CameraActivity | null = null;
  private cameraActivities = new Map<string, CameraActivity | null>();
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
    this.camera = new GameCameraManager(() => this.notify(), options.mediaDevices);
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
      error: this.error, media: this.media.view, gameCamera: this.camera.view,
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
    if (message.channel === 'camera') {
      try {
        const presence = cameraPresenceSchema.parse(JSON.parse(message.data));
        if (!this.members.get(message.from)?.connected) return;
        this.cameraActivities.set(message.from, presence.game);
        this.syncCamera();
        if (presence.request) this.sendApp('camera', message.from, JSON.stringify({ game: this.cameraActivity, request: false }));
        this.notify();
      } catch { /* Invalid camera presence cannot affect other activities. */ }
      return;
    }
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
    this.endpoint = endpoint; this.media.attach(endpoint); this.camera.attach(endpoint);
    this.endpointUnsubscribe.push(endpoint.onConnection(raw => this.attach(raw, false)), endpoint.onCall(call => { if (cameraMetadataSchema.safeParse(call.metadata).success) this.camera.receive(call); else this.media.receive(call); }), endpoint.onSignalingChange(connected => {
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
    this.media.suspend(); this.camera.suspend();
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
    this.media.suspend(); this.camera.suspend();
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
    this.syncCamera();
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
  setCameraActivity(activity: CameraActivity | null): void {
    if (activity === this.cameraActivity) return;
    this.cameraActivity = activity;
    this.syncCamera();
    this.sendApp('camera', null, JSON.stringify({ game: activity, request: true }));
    this.notify();
  }
  toggleGameCamera(): Promise<void> { return this.camera.toggle(); }
  private syncCamera(): void {
    const game = this.cameraActivity;
    if (!game || this.leaving || this.disposed) { this.camera.setContext(null); return; }
    const self = this.members.get(this.id);
    const online = this.phase === 'JOINED' && !!self?.connected;
    const scene = self?.houseId ? `house:${self.houseId}` : self && areaOf(self.position) !== 'residential' ? `area:${areaOf(self.position)}` : 'village';
    const peers: CameraPeer[] = [];
    if (online) for (const member of this.members.values()) {
      const id = member.identity.fingerprint; const link = this.linkFor(id);
      if (id === this.id || !link?.sendToken || !isInScene(member, areaOf(self!.position), self!.houseId)) continue;
      peers.push({ identityId: id, endpoint: member.endpoint, receiveToken: link.receiveToken, sendToken: link.sendToken, watching: this.cameraActivities.get(id) === game });
    }
    for (const id of this.cameraActivities.keys()) if (!this.members.get(id)?.connected) this.cameraActivities.delete(id);
    this.camera.setContext({ sessionId: online ? this.sessionId! : 'local', epoch: online ? this.epoch : 1,
      identityId: this.id, room: `${scene}:game:${game}`, roomName: game, peers });
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
        this.phase = 'RECONNECTING'; this.media.suspend(); this.camera.suspend();
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
    this.leaving = true; this.media.suspend(); this.camera.suspend();
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
    this.generation++; this.leaving = true; this.media.suspend(); this.camera.suspend(); this.leaveResolve?.();
    this.privateWith = null; this.privateOf.clear(); this.cameraActivity = null; this.cameraActivities.clear();
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
  dispose(): void { if (this.disposed) return; this.reset(); this.media.dispose(); this.camera.dispose(); this.disposed = true; this.listeners.clear(); }
}
```

### app/src/signaling/peerjs.ts — adenda 0.2.1

Archivo completo. SHA-256 del bloque: `ff2c44ea64d683d9da910cb4ba3fef09c14c637c2419384104d30c0ecd6a9251`.

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
  const limit = (kind: 'audio' | 'screen' | 'camera') => {
    const apply = () => {
      for (const sender of connection.peerConnection?.getSenders() ?? []) {
        if (!sender.track) continue;
        const parameters = sender.getParameters();
        if (!parameters.encodings?.length) continue;
        for (const encoding of parameters.encodings) {
          encoding.maxBitrate = kind === 'audio' ? 48_000 : kind === 'camera' ? 6_000_000 : 12_000_000;
          if (kind !== 'audio') encoding.maxFramerate = 30;
        }
        if (kind === 'camera') parameters.degradationPreference = 'maintain-resolution';
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

### app/src/transport/types.ts — adenda 0.2.1

Archivo completo. SHA-256 del bloque: `e94f1579a5b309f6cc5f57ff002e1ee8e4e3a8879acc9bffeddb63fbd4c42292`.

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
  limitBitrate(kind: 'audio' | 'screen' | 'camera'): void;
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

### app/tests/game-camera.test.ts — adenda 0.2.1

Archivo completo. SHA-256 del bloque: `3a33d181761d0dd7e48a891c42170cdb83ef4c2979071ab45070bdb90073a1e0`.

```ts
import { describe, expect, it } from 'vitest';
import { GameCameraManager, type CameraContext } from '../src/media/game-camera';
import type { MediaCall, TransportEndpoint } from '../src/transport/types';
// Fake tracks and calls: these tests never activate a physical camera.
class Track extends EventTarget { stopped=false; enabled=true; contentHint=''; stop(){this.stopped=true;} }
function stream(audio=false) { const track=new Track(); return {track,stream:{getTracks:()=>[track],getVideoTracks:()=>[track],getAudioTracks:()=>audio?[track]:[]} as unknown as MediaStream}; }
class Call implements MediaCall {
  closed=false; answered=false; limited='';streams=new Set<(s:MediaStream)=>void>();closes=new Set<()=>void>();
  constructor(readonly endpoint:string,readonly metadata:unknown){}
  answer(){this.answered=true;} close(){this.closed=true;}
  onStream(fn:(s:MediaStream)=>void){this.streams.add(fn);return()=>this.streams.delete(fn);}
  onClose(fn:()=>void){this.closes.add(fn);return()=>this.closes.delete(fn);}
  limitBitrate(kind:'audio'|'screen'|'camera'){this.limited=kind;}
}
const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64);
const context=():CameraContext=>({sessionId:'session',epoch:1,identityId:a,room:'area:community:game:werewolves',roomName:'werewolves',peers:[{identityId:b,endpoint:'b',sendToken:'y'.repeat(43),receiveToken:'x'.repeat(43),watching:true},{identityId:c,endpoint:'c',sendToken:'y'.repeat(43),receiveToken:'z'.repeat(43),watching:false}]});
const metadata=()=>({v:2,kind:'camera',sessionId:'session',epoch:1,identityId:b,room:'area:community:game:werewolves',token:'x'.repeat(43)});
describe('optional game camera consent and audience',()=>{
  it('requests video-only Full HD after a gesture and sends only to viewers of the same game',async()=>{
    let requested:MediaStreamConstraints|undefined;const video=stream();const calls:Call[]=[];
    const camera=new GameCameraManager(()=>{},{getUserMedia:async constraints=>{requested=constraints;return video.stream;}});
    camera.attach({call:(endpoint:string,_stream:MediaStream,metadata:unknown)=>{const call=new Call(endpoint,metadata);calls.push(call);return call;}} as unknown as TransportEndpoint);
    expect(requested).toBeUndefined();await camera.toggle();expect(requested).toBeUndefined();camera.setContext(context());expect(requested).toBeUndefined();
    await camera.toggle();expect(requested).toEqual({audio:false,video:{facingMode:'user',width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}}});
    expect(calls).toHaveLength(1);expect(calls[0].endpoint).toBe('b');expect(calls[0].limited).toBe('camera');expect(camera.view.local).toBe(video.stream);
    camera.setContext({...context(),peers:context().peers.map(p=>({...p,watching:false}))});expect(calls[0].closed).toBe(true);expect(video.track.stopped).toBe(false);
    await camera.toggle();expect(video.track.stopped).toBe(true);expect(camera.view.local).toBeNull();camera.dispose();
  });
  it('authenticates sender, token, scene, session and game before receiving, and closes on removal',()=>{
    const camera=new GameCameraManager(()=>{});camera.setContext(context());
    for(const data of [{...metadata(),room:'area:community:game:gartic'},{...metadata(),epoch:2},{...metadata(),sessionId:'other'},{...metadata(),token:'z'.repeat(43)},{...metadata(),identityId:c}]){const call=new Call('b',data);camera.receive(call);expect(call.closed).toBe(true);expect(call.answered).toBe(false);}
    const call=new Call('b',metadata());camera.receive(call);expect(call.answered).toBe(true);const remote=stream();for(const fn of call.streams)fn(remote.stream);expect(camera.view.remote).toHaveLength(1);
    camera.setContext({...context(),peers:[]});expect(call.closed).toBe(true);expect(remote.track.stopped).toBe(true);expect(camera.view.remote).toHaveLength(0);camera.dispose();
  });
  it('revokes late permission results on close, cancel, scene change and game change',async()=>{
    for(const mode of ['close','cancel','scene','game']){
      let release!:(s:MediaStream)=>void;const video=stream();const camera=new GameCameraManager(()=>{},{getUserMedia:()=>new Promise(resolve=>{release=resolve;})});camera.setContext(context());
      const opening=camera.toggle();expect(camera.view.pending).toBe(true);
      if(mode==='close')camera.setContext(null);else if(mode==='cancel')await camera.toggle();else camera.setContext({...context(),room:mode==='scene'?'area:study:game:werewolves':'area:community:game:gartic'});
      release(video.stream);await opening;expect(video.track.stopped).toBe(true);expect(camera.view.local).toBeNull();expect(camera.view.pending).toBe(false);camera.dispose();
    }
  });
  it('rejects audio in a camera call and handles denied or ended capture without retaining tracks',async()=>{
    const camera=new GameCameraManager(()=>{},{getUserMedia:async()=>{throw new DOMException('denied','NotAllowedError');}});camera.setContext(context());await camera.toggle();expect(camera.view.pending).toBe(false);expect(camera.view.error).toContain('permiso');
    const call=new Call('b',metadata());camera.receive(call);const invalid=stream(true);for(const fn of call.streams)fn(invalid.stream);expect(call.closed).toBe(true);expect(invalid.track.stopped).toBe(true);camera.dispose();
    const video=stream();const live=new GameCameraManager(()=>{},{getUserMedia:async()=>video.stream});live.setContext(context());await live.toggle();video.track.dispatchEvent(new Event('ended'));expect(live.view.local).toBeNull();expect(video.track.stopped).toBe(true);live.dispose();
  });
});
```

### CSS de las cámaras

Añadir al final del tema. SHA-256 del bloque: `7bcea12dcb2a340ecd30ca73b8050fc8086c0a6e727772f81b59d688be48262a`.

```css
/* Game cameras: clear video, rounded glass-like cards, with space reserved for the game. */
.sv-activity.has-game-camera { padding-bottom: 60px; background: var(--wood-dark); }
.sv-activity.is-camera-live { display: grid; grid-template-columns: minmax(0,1fr) 192px; grid-template-rows: minmax(0,1fr); }
.sv-activity.is-camera-live > .ww, .sv-activity.is-camera-live > .gp { grid-column: 1; grid-row: 1; min-width: 0; height: 100%; }
.sv-game-camera { position: absolute; left: 16px; bottom: 9px; z-index: 11; color: var(--text-warm); }
.sv-game-camera-toggle { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 42px; padding: 9px 14px; border: 1px solid #e1d2b6; border-radius: 13px; background: #fffaf0; color: #4a4034; font: inherit; font-weight: 650; cursor: pointer; box-shadow: 0 2px 5px #00000012; }
.sv-game-camera-toggle.is-on { background: #416c46; color: #fffaf0; border-color: #416c46; }
.sv-game-camera-toggle:focus-visible { outline: 3px solid #b89d65; outline-offset: 3px; }
.sv-game-camera-gallery { display: flex; flex-direction: column; gap: 12px; }
.sv-game-camera.is-live { position: relative; inset: auto; grid-column: 2; grid-row: 1; display: flex; flex-direction: column; gap: 14px; min-height: 0; padding: 14px; overflow: auto; background: #efe6d6; border-left: 1px solid #c8b598; }
.sv-game-camera-tile { position: relative; flex: 0 0 auto; width: 100%; aspect-ratio: 1; border-radius: 22px; overflow: hidden; isolation: isolate; background: #262723; border: 1px solid #ffffffb3; box-shadow: 0 3px 7px #30251b1c, 0 12px 26px #30251b12; }
.sv-game-camera-tile video { display: block; width: 100%; height: 100%; object-fit: cover; }
.sv-game-camera-tile video.is-self { transform: scaleX(-1); }
.sv-game-camera-caption { position: absolute; inset: auto 0 0; display: flex; align-items: center; gap: 6px; padding: 24px 10px 11px; color: #fff; background: linear-gradient(transparent,#0009); font-size: 12px; font-weight: 600; text-shadow: 0 1px 3px #0005; }
.sv-game-camera-caption > span:nth-child(2) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0; }
.sv-game-camera-live { width: 6px; height: 6px; flex: 0 0 auto; border-radius: 50%; background: #a6e5a6; box-shadow: 0 0 0 3px #85d99526; }
.sv-game-camera-quality { font-size: 9px; white-space: nowrap; opacity: .85; }
.sv-game-camera-error { max-width: 260px; padding: 10px; background: #fff8e9; border: 1px solid #d7bf95; border-radius: 10px; font-size: 12px; color: #8a3b26; }
.sv-game-camera:not(.is-live) .sv-game-camera-error { position: absolute; bottom: 42px; left: 0; width: min(260px,80vw); }
@media(max-width:740px) {
  .sv-activity.is-camera-live { grid-template-columns: minmax(0,1fr); grid-template-rows: minmax(0,1fr) 132px; }
  .sv-game-camera.is-live { grid-column: 1; grid-row: 2; flex-direction: row; align-items: center; padding: 10px 12px; border-left: 0; border-top: 1px solid #c8b598; overflow: auto; }
  .sv-game-camera-controls { flex: 0 0 auto; }
  .sv-game-camera-gallery { flex-direction: row; flex: 0 0 auto; gap: 10px; }
  .sv-game-camera-tile { width: 108px; border-radius: 19px; }
  .sv-game-camera-caption { padding: 22px 8px 9px; font-size: 11px; }
  .sv-game-camera-quality { display: none; }
  .sv-game-camera.is-live .sv-game-camera-error { flex: 0 0 180px; }
}
```

---

Fin del megaprompt 2/3. Implementar y verificar todo el alcance de esta fase antes de declarar terminado.
