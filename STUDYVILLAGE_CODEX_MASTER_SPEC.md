# STUDYVILLAGE — ESPECIFICACIÓN MAESTRA V2.0 / HANDOFF PARA CODEX Y CLAUDE

> **Estado:** planificación y revisión; **NO EMPEZAR A PROGRAMAR**. El humano indicó expresamente que quiere un plan, no código. Tras recibir autorización explícita `START CODING`, el agente podrá crear repositorio, scaffolding, código, pruebas y artefactos.
>
> **Fecha de consolidación:** 2026-10-30. **Fuente de verdad:** este archivo para el proyecto y `DECISIONS.md` una vez comience el desarrollo; el usuario puede actualizar decisiones. **Idioma:** español para UX/producto; nombres de módulos, eventos y pruebas en inglés.
>
> **Restricciones:** 2 desarrolladores humanos trabajando en paralelo, cada uno con menos de 25 h efectivas de disponibilidad durante un hackathon de 48 h; los agentes pueden trabajar más, pero una ejecución de agentes no sustituye las pruebas reales en ambos equipos. **AMBOS DESARROLLAN EN LINUX**; Windows es objetivo de distribución `.exe`, no la plataforma primaria de desarrollo. **No se paga ni mantiene un backend central**. Servicio *gratuito externo de señalización* y STUN permitidos; NAT fallido => error + reintentar, sin prometer conectividad universal.

## 0. Instrucciones absolutas para el agente coordinador

1. Leer este documento completo **una vez**. Resumir en `DECISIONS.md`, `CONTRACTS.md`, `STATUS.md` únicamente tras autorización; no pegar 60 páginas a cada agente.
2. **No escribir código, crear repositorios ni instalar dependencias hasta recibir orden expresa de empezar.** Este documento describe lo que Codex debe hacer **cuando** se autorice. No interpretar el pedido de crear una especificación como permiso de implementación.
3. No afirmar que funciona algo que no se ha probado. Diferenciar: `DESIGNED`, `CODED`, `UNIT_TESTED`, `INTEGRATION_TESTED`, `TWO_LINUX_HOSTS_TESTED`, `WINDOWS_BUILD_ONLY`, `WINDOWS_RUNTIME_TESTED`.
4. **La primera prueba crítica es captura + envío P2P de voz y pantalla en Linux X11/Wayland y entorno desktop elegido**, no el pixel art. Priorizar voz > pantalla > casa si una decisión pone en peligro el tiempo. Pero la demo final requiere una casa funcional.
5. Congelar contratos de módulos antes de paralelizar. Ningún par de agentes debe editar el mismo fichero. El integrador es el único que modifica bootstrap, package/lockfiles, contratos y configuración compartida salvo acuerdo explícito.
6. Tomar las últimas decisiones explícitas como normativas. Separar lo **cerrado** de lo **inferido/propuesto** y lo **pendiente**. No exagerar la viabilidad de seis emisiones simultáneas de pantalla ni la compatibilidad de Linux.
7. Minimizar costo de tokens: tareas acotadas, entradas mínimas, límites de respuesta, una sola revisión especializada por gate importante, pruebas automatizadas primero.
8. No ejecutar código recibido por P2P, no dar acceso remoto al filesystem, no aceptar plugins ejecutables de terceros por defecto, no inventar criptografía; la privacidad se garantiza por diseño de mensajes y autorización.
9. El proyecto debe compilarse y ejecutarse **sin servidor de la app**; el soporte de signaling ajeno no equivale a almacenamiento o cómputo centralizado. No ocultar al usuario que intervienen infraestructura de señalización y servidores STUN.
10. Si un requisito no es compatible con 25 horas humanas, no fingir compatibilidad: implementar el corte vertical probado y registrar lo demás en backlog.

## 1. Producto, historia de decisiones, alcance

**Nombre de trabajo:** StudyVillage. **Pitch de una frase:** «Un vecindario virtual pixel art, local-first y open source donde los amigos visitan sus casas, hablan por P2P y colaboran sobre sus proyectos personales sin subir archivos a una nube».

**Orígenes de la idea en el chat:** primero IA multijugador/cooperativa y escape rooms, después clases/estudio social, casas personales, acceso a carpetas mediante muebles, pizarra y ejecución local de código; luego mapa compartido, decoración y avatares estilo Animal Crossing/Deltarune/Pokémon antiguo; finalmente arquitectura P2P sin servidor central, reputación/karma como visión futura. **La IA no es necesaria para el hackathon**.

**Diferenciación que hay que demostrar a los jueces:** no «Discord con sprites», sino el ritual social: alguien abre su espacio decorado, invita a un amigo, el amigo aparece como avatar, ambos pueden hablar, compartir pantalla y estudiar dibujando o mirando proyectos contextualizados en muebles. Los jueces valoran especialmente el hecho de **unir personas**. Público: cualquier grupo de amigos (no solo estudiantes).

**Inspiraciones no son licencias de uso:** Animal Crossing (casas sociales), Deltarune y Pokémon 2D antiguo (vista desde arriba y pixel art), Minecraft (packs de mods), Paint (whiteboard), AURA (referencia visual/UX mencionada para editor integrado, **significado/producto exacto no identificado**), Discord (comunicación), Reddit/mercado libre (futura reputación/marketplace). No copiar assets propietarios.

### 1.1 Prioridades que no se contradicen

- **P0 — mínimo demostrable:** dos máquinas Linux en redes distintas cuando sea posible; invitación a sesión + aceptación; mapa fijo para hasta seis slots; una casa pixel art visitable; movimientos visibles; audio bidireccional; **una pantalla transmitida y recibida**; acción de salir y tolerancia de reconexión; persistencia local básica; empaquetado Linux funcional.
- **P1 — experiencia diferenciadora:** múltiples casas abiertas en el mismo vecindario; distintas personas pueden entrar a distintas casas; puerta/solicitud para entrar; pizarra en capas estilo Paint + exportación; mover muebles solo por dueño; mueble con vínculo local de proyecto (sin compartir archivos); nickname de mueble visible; editor integrado local; importación de contacto/identidad; voz por casa y privada; selección de pantalla completa o ventana; links de sesión y códigos de amigo.
- **P2 — extensiones sin compromiso de entrega:** 3–6 participantes probados con métricas; varias pantallas simultáneas y cuadrícula/favorita; sonido de sistema remoto; editor **colaborativo** de código y compilación local; personalización avanzada (cabello/ropa/accesorios); packs de muebles/avatares; transferencia P2P validada; soporte Windows ejecutado en equipo real; webcams en esquina superior derecha; IA local; marketplace y karma.
- **P3 — futuro a largo plazo:** plugins ejecutables en sandbox, comunidad y rankings reputacionales, navegación/presencia opcional, exportación avanzada, dispositivos adicionales y posible TURN opcional pagado **solo con nueva decisión humana**.

**Nota de alcance:** el usuario pidió «todo menos chat» en herramientas de estudio. Eso significa interfaz local de código, pizarra, PDF/foto local, acceso a proyectos y multimedia; **no significa que todo deba ser edición colaborativa simultánea ya en P0**. Sin chat escrito; funciones de voz sí.

## 2. Registro preciso de decisiones (última voz del usuario prevalece)

| ID | Estado | Requisito / decisión | Regla de implementación |
|---|---|---|---|
| D01 | CERRADO | Dos desarrolladores; cada uno <25 h reales, en paralelo; agentes pueden trabajar más | Plan por horas de reloj, gates y responsables |
| D02 | CERRADO | **Ambos en Linux**; Windows `.exe` requerido para distribución | Probar Linux primero; compilar Windows en GitHub Actions/runner Windows; no prometer Windows funcional sin probarlo en Windows |
| D03 | CERRADO | Experiencia humana: A domina C/C++/Python/NumPy/PyTorch; B domina C#/Python/Java/SQL y más | No asumir que saben TS/Rust; especificaciones y código documentados; preferir librerías ya existentes |
| D04 | CERRADO | Agentes disponibles: Codex y Claude en terminal | Herramientas y subagentes se usan solo si los CLI instalados los admiten; no asumir orquestación automática entre proveedores |
| D05 | CERRADO | Aplicación de escritorio; usuario eligió Tauri pero acepta Electron **si falla la captura en Linux** | Elección basada en prueba de micrófono, pantalla, PipeWire y permisos, no dogma |
| D06 | CERRADO | 2D pixel art vista superior Pokémon clásico/Deltarune, WASD | No 3D. Resolución lógica pixelada, nearest-neighbor |
| D07 | PROVISIONAL | «64bits cada sprite tiene que ser una cuadrícula» | Interpretar provisionalmente **64×64 píxeles por sprite**, no «64 bits de color». Confirmar en revisión visual; permitir tiles 32×32 y objetos multi-tile. No asumir 64 bits por canal |
| D08 | CERRADO | Mapa de vecindario predeterminado con 6 posiciones de casas relativas al host según orden de llegada | Host ocupa slot fijo 0; siguientes ocupan primeros slots disponibles. Mantener posición mientras esté conectado; no reordenar sin razón |
| D09 | CERRADO | **Varias casas abiertas en el mismo vecindario** | Un host coordina la sesión de vecindario; cada usuario es dueño de su casa. La sesión no equivale a una sola casa |
| D10 | CERRADO | Casas de usuarios desconectados desaparecen del mapa y de la caché | Eliminar la representación remota al abandonar definitivamente; para reconexión retener RAM temporal ≤60 s sin persistir |
| D11 | CERRADO | Casa propia = una habitación inicialmente, muebles movidos libremente; dueño únicamente modifica layout | El anfitrión de vecindario no tiene derecho a editar casas ajenas |
| D12 | CERRADO | Hasta 6 personas **por casa**, mínimo una. Demo obligatoria con dos personas | Un vecindario de seis miembros implica máximo seis ocupantes en una casa; diseñar canales para hasta seis, probar dos |
| D13 | CERRADO | Casas local-first; ventanas internas o launchers locales tras hacer clic en muebles | Para visitante, mostrar alias/preview autorizada; jamás ruta local privada |
| D14 | CERRADO | Avatares: cabello, ropa, colores, accesorios; assets predeterminados + pixel-art creado/obtenido con permisos | Comenzar presets básicos, evolucionar a capas/cosméticos |
| D15 | CERRADO | Amistades por archivo de contacto descargable, clave pública, código amigo **permanente pero rotable** | Código amigo ≠ clave privada; si se rota alias no romper contactos criptográficos |
| D16 | CERRADO | Enlace permanente de **contacto** distinto de **enlace de invitación a sesión temporal** | Enlace de sesión contiene endpoint efímero y secreto aleatorio; puede revocarse o regenerarse |
| D17 | CERRADO | Sin presencia global; usuarios coordinan activación por medios externos | No lista online ni servicio de resolución persistente; sí lista de amigos locales |
| D18 | CERRADO | Aceptar solicitud para entrar; owner puede bloquear, expulsar y silenciar | Admisión al vecindario controlada por host; admisión a casa controlada por propietario, con defaults explícitos |
| D19 | CERRADO | Si anfitrión pierde conexión inesperadamente, **60 s de gracia**, luego termina sesión | Host anunciado como temporalmente desconectado; no migración de host. Reconexión dentro de 60 s si autentica identidad/recupera sesión |
| D20 | CERRADO | Si alguien pulsa «Salir» voluntariamente, envía aviso/solicitud al host para confirmar intención | Se interpreta como salida con handshake de ACK, **no** poder del host para retener a alguien; límite temporal y salida forzable localmente |
| D21 | CERRADO | En ausencia confirmada de host se cierran casas/sesión; otros jugadores no editan su layout | Si sale un invitado se elimina su casa; si sale host termina vecindario. Durante gracia solo estado temporal |
| D22 | CERRADO | Pizarra de estilo Paint, varias capas/autor, hide de terceros, no delete ajeno; trabajo local offline | IDs de trazos, replay por autor, sincronizar faltantes, aviso offline, exportación completa disponible para el host |
| D23 | CERRADO | Host puede exportar la pizarra final | Exportar PNG (P1); SVG/PDF futuro. Especificar visible/all layers y permitir compartir copia explícita |
| D24 | CERRADO | Archivos PDF/fotos/código no se transmiten por defecto: se abren localmente; la pantalla transmite lo visible | Los objetos públicos contienen solo alias explícitos, sin contenidos ni filesystem |
| D25 | CERRADO | Editor «tipo AURA» dentro de aplicación | Editor de código local simple, fuente y UX aún pendiente por nombre AURA; no inventar una dependencia llamada AURA |
| D26 | CERRADO | Voz pública configurable por casa, sin que salga de ella; grupos privados opcionales | Separar membresía de casa y membresía de grupo de voz; mute, push-to-talk y estados claros |
| D27 | CERRADO | Pantalla: monitores o ventanas, múltiples emisores potenciales, grid por defecto, favorita | Para 2 usuarios una pantalla P0; para 6 streams P2; adaptación sender-side, prioridad voz |
| D28 | CERRADO | Audio del sistema al compartir pantalla deseado («TODO»); webcam miniatura arriba derecha si sobra tiempo | Soporte captura de audio de sistema dependiente de SO; exigir prueba, no prometer en Linux |
| D29 | CERRADO | Sin chat escrito | No confundir con comunicación cifrada innecesaria: voz/pantalla también son sensibles |
| D30 | CERRADO | SQLite para casa propia y perfil; casas remotas solo RAM y limpieza al finalizar | Datos privados no viajan por red |
| D31 | CERRADO | Mods tipo Minecraft, packs de muebles y avatares, plugins funcionales a futuro | Primer MVP: declarativos PNG/JSON; importar ZIP segura y manualmente; no scripts ejecutables |
| D32 | CERRADO | Si faltan assets, mostrar placeholder y luego transferir asset P2P autorizado | Prioridad baja, tamaño limitado, MIME detectado por contenido, hash y consentimiento |
| D33 | CERRADO | Si NAT impide P2P, avisar y permitir reintentar; sin pagar TURN | No prometer conectividad universal; signaling y STUN externos se aceptan |
| D34 | CERRADO | Voz tiene prioridad sobre pantalla/gráficos en red lenta | Control de calidad y presupuestos adaptativos |
| D35 | CERRADO | Si faltan 4 horas priorizar voice + screen + casa funcional | Congelar funcionalidades accesorias |
| D36 | CERRADO | Se solicita a Codex crear repositorio compartido en GitHub cuando se autorice programación | GitHub repo, rama main protegida en la práctica vía disciplina humana; CI Linux + Windows |
| D37 | CERRADO | Programa open source; deseo de assets comunitarios gratuitos | Separar licencia de software y política de assets; ver §16: ninguna licencia OSI puede prohibir venta de código; CC BY-SA no impide cobrar |
| D38 | FUTURO | IA opcional de estudio: explicar apuntes, ejercicios y crear desafíos del material que usuario seleccione | Local o API opt-in, preferentemente <24 GB RAM; no hacer requests silenciosos |
| D39 | FUTURO | Ranking / mercado de premios, karma semanal limitado, presupuesto de dar puntos se reinicia semanalmente, reputación ganada persistente | No incluir sin mecanismo de confianza/sybil/estado distribuido; cosméticos no pay-to-win |

## 3. Decisiones de arquitectura y justificación de lenguaje

**Elección propuesta, condicionada a prueba:** **TypeScript + renderer Canvas 2D/Phaser + WebRTC + Tauri 2 (Rust únicamente para capacidades nativas)**. Esto reduce el código que hay que escribir para P2P y UI aunque ninguno domine TS; C/C++ y Python no hacen automáticamente más ligera una app con pantalla, voz, GUI multiplataforma y plugins. Python/PyTorch es apropiado para una IA futura, **no** para reemplazar las APIs multimedia del cliente del MVP. Los módulos críticos deben medirse, no asumir eficiencia por lenguaje.

**Motivo para considerar Electron seriamente:** en Linux, Tauri usa WebKitGTK, mientras Electron usa Chromium; la compatibilidad de `getDisplayMedia()` y de PipeWire/portales puede diferir. No afirmar sin prueba que Tauri captura pantalla en Linux. Electron usa más recursos normalmente, pero una transmisión que funciona importa más que el tamaño del binario. En Linux Wayland, **xdg-desktop-portal** y **PipeWire** suelen intervenir en selección/captura; X11 es otra ruta. Probar el compositor real de ambos.

**Gate comparativo (hasta 90 minutos de reloj, ejecutado en paralelo con un spike de voz):**

1. En ambos Linux registrar distro/version, `XDG_SESSION_TYPE`, entorno de escritorio/compositor, PipeWire/portal, micrófono y salida de audio, arquitectura CPU y GPU (solo en el archivo local de entorno, no incluir datos personales en telemetría).
2. Probar en Tauri mínimamente: captura de micrófono; `getDisplayMedia` pantalla completa; ventana individual; envío a segundo equipo; recibir y reproducir A/V; stop de tracks; intento de audio de sistema. Registrar PASS/FAIL/UNKNOWN, error exacto, captura/política de permisos.
3. Si compartir pantalla falla, probar Electron con la misma lógica de negocio durante una ventana corta; verificar funcionamiento real con el selector del portal y la transferencia.
4. **Si Electron funciona y Tauri no**, elegir Electron sin culpa y actualizar `DECISIONS.md`. Si ninguno funciona en el entorno disponible, bloquear toda implementación visual hasta emitir un spike nativo factible o recortar requisitos con autorización humana.
5. Si se selecciona Electron, habilitar contextIsolation, sandbox cuando corresponda, limitar IPC, no Node en renderer ni cargas remotas privilegiadas; capturar solo tras consentimiento.

**Packaging:** Linux AppImage/deb o equivalente confirmado en distro de los desarrolladores; Windows `.exe` construido mediante runner Windows en GitHub Actions, pero etiquetado `BUILD_ONLY` hasta que alguien lo ejecute y pruebe en Windows. Dos Linux no verifican por sí solos las APIs de captura de Windows. Ejecutables sin firma pueden recibir advertencias de SmartScreen, registrarlo sin ocultarlo.

## 4. Topología: vecindario, seis slots, varias casas y autoridad

**Modelo central:** sesión temporal de vecindario `VillageSession`. Tiene un `coordinatorId` (el creador de la sesión), `sessionId`, epoch, lista de miembros máximo 6 para MVP escalable, mapa de slots predeterminados y una casa por miembro que decida publicarla/abrirla. No hay un mapa global persistente ni mundo central online. No hay un servidor que hospede datos de casas. Cada casa propia reside localmente en el dispositivo dueño.

**Slots fijos** en mapa relativos al host:

- Slot `0`: casa del creador, posición predeterminada.
- Slots `1` a `5`: primero que se una recibe primer slot libre, orden monotónico por llegada validada por coordinator; si alguien sale, queda libre para siguiente invitado. Durante reconexión 60 s reservar slot anterior.
- Cada evento de asignación tiene `sessionEpoch` y `revision` para evitar reordenamientos por paquetes retrasados.
- La casa desaparece cuando dueño sale definitivamente o expira reconexión; su icono puede pasar a «reconectando» durante la gracia. Casas de personas que nunca se unieron no se representan.
- El mapa visual puede tener calles, árboles, casas por posiciones predefinidas; **hasta seis integrantes** en la sesión del MVP. Un integrante puede visitar cualquier casa abierta con permiso, mientras su propia casa continúa abierta si elige publicarla.

**Roles**:
- `village_coordinator`: acepta o deniega entrada al vecindario, administra miembros y slots, cierra sesión, maneja solicitud de salida voluntaria. No adquiere por ello permisos de mover muebles de otros.
- `house_owner`: acepta o deniega entrada a su casa, abre/cierra/lock, mueve muebles propios, configura audio público en su casa, expulsa de su casa sin expulsar del vecindario. Posee SQLite de su casa.
- `visitor`: puede caminar e interactuar con objetos públicos autorizados, dibujar su propia capa de la pizarra y participar en medios permitidos. No edita layout del dueño.
- `voice_group_owner` o iniciador de llamada privada: invitación/aceptación explícitas; nadie se une silenciosamente.

**Ejemplo de flujo simultáneo:** A crea vecindario; B y C se unen; mapa contiene casas A/B/C; A y C están dentro de B mientras B y otros visitantes ven esa casa; llamada pública de casa B solo a miembros que **efectivamente estén dentro de B**. Ninguna persona oye la conversación desde otra casa ni se mezcla automáticamente un grupo privado con el audio público. Intercambio de posición/mapa a miembros autorizados; contenido de whiteboard solo participantes autorizados de la casa/sesión de board.

**Modelo P2P recomendado:** full mesh pequeño para señalización de estado y medios entre integrantes en la misma casa/voz; coordinador maneja **membership/orden/epochs**, pero **no retransmite medios** salvo que explícitamente se diseñe una función distinta (fuera de MVP). No asumir un «host servidor» de audio o la necesidad de que los invitados se conecten todos al ordenador de A para cada mensaje. A mayor N, medir bitrate y conexiones.

**Casos límite obligatorios**:
1. Dueño de casa distinta al coordinador sale: su casa desaparece y sus visitantes retornan al mapa, sin cierre del vecindario.
2. Coordinador sale voluntariamente: muestra confirmación local, envía `session.closing` y la sesión completa termina; no migración automática.
3. Coordinador cae accidentalmente: `reconnecting` con 60 s; si vuelve con misma identidad + sesión válida, restaurar; de lo contrario `session.closed` local tras timeout.
4. Un visitante pulsa «Salir»: envía solicitud/aviso `member.leaveIntent` al coordinator; coordinator ACK y propaga salida. El visitante **siempre puede forzar salida local** sin esperar ACK: no bloquear por red ni exigir autorización para salir.
5. Si quiere «salir de la casa» pero permanecer en el vecindario: mover su avatar al mapa, no abandonar sesión ni borrar casa propia.
6. Cambio simultáneo de ocupación entre casas: transición local con request/respuesta, no permitir dos casas públicas activas de voz para el mismo avatar a la vez.
7. Dos contactos con el mismo `displayName`: mostrarlos con huella abreviada diferenciada.

## 5. Identidad, amistades, enlaces, permisos

**Identidad** no es solamente username. En primera ejecución generar una identidad criptográfica local (Ed25519 sugerido con implementación estable y compatibilidad verificada); mantener `displayName` editable separado de `identityFingerprint`. No usar el PeerJS ID efímero como identidad permanente: el proveedor lo usa para brokering. No inventar key exchange propio ni derivar llaves de una contraseña frágil.

**Código de amigo permanente rotable**: alias público asociado a la identidad, exportable mediante archivo de contacto con `{schemaVersion, displayName, publicKey, fingerprint, friendCodeAlias, avatarPreset}`. **Si no existe registro central, un simple alias humano no puede resolverse mágicamente a un endpoint activo**: el archivo/código permite reconocer contactos, y la invitación de sesión temporal transporta los datos para conectar. Rotar alias de amigo no necesita rotar clave de identidad: contactos anteriores siguen reconociendo la identidad si el usuario no los bloqueó. Para rotación real de credenciales, se requiere un flujo explícito más elaborado (futuro).

**Invitación activa**: `studyvillage://join/<opaque-data>` en desktop (debe registrarse protocolo y analizar seguridad de deeplinks; alternativa copiar/pegar invitación JSON/base64 en UI); contiene `sessionId`, `coordinatorSignalingId`, fecha de expiración, `inviteGeneration`, token aleatorio criptográficamente seguro y versión; **no** contener ruta local, clave privada ni configuración de casa. Los usuarios se invitan fuera de la aplicación (mensaje/otro medio). Enlace temporal distinto de archivo/código amigo permanente. Cambiar invitación incrementa generación y anula nuevos accesos con enlaces anteriores; no expulsa automáticamente sesiones ya aceptadas.

**Admisión 2 niveles**:
- Entrada al vecindario: request al coordinator; validación + UI del host `Accept / Reject / Block`, límites de peticiones y límite 6 miembros.
- Entrada en una casa: request al dueño; reglas públicas por casa `open_to_session`, `ask_every_time`, `locked`. Cuando dueño no está conectado, casa desaparece (salvo gracia visual temporal sin nuevo acceso).
- Verificar identidad por challenge-response ligado a nonce/sesión/endpoint y evitar replay. Proteger contra enlaces filtrados con aprobación del dueño y revocación. Capturas/voz solo tras activación visible del usuario.
- Host puede kick/block de vecindario; dueño puede kick de su casa. Bloquear reduce acceso, **no** borra lo ya copiado o visto por invitados.

**Sin presencia**: no lista online global ni resolver `friendCode -> activePeer` a través de una base central. Mostrar contactos guardados, botón «Invitar», botón «Unirse mediante enlace» y «Abrir vecindario». Caso amigo offline: informar que invitación solo funciona cuando su sesión está activa.

## 6. Capas funcionales: arquitectura modular

| Módulo/paquete (propuesto) | Única responsabilidad | Importa | No puede hacer |
|---|---|---|---|
| `protocol` | Schemas versionados, tipos, serialización, límites | Ninguno salvo librería de esquema | Ningún IO ni lógica UI |
| `identity` | Keypair, contacto, firmas, verificación | `protocol`, OS key store bridge | Usar username para autorizar |
| `signaling` | Endpoint PeerJS/free signaling, recibir/emitir invitaciones | `protocol` | Guardar casas en backend |
| `transport` | DataChannels fiable/efímero, peer lifecycle, backpressure | `protocol`, `signaling` | Conocer Phaser/UI |
| `session` | Vecindario, slots, membresía, reconciliación, 60 s, epochs | `protocol`, `transport`, `identity` | Editar muebles ajenos |
| `media` | Micrófono, salida, voz por casa/privada, pantalla, bitrate | WebRTC + adapters | Enviar media sin consentimiento |
| `world` | Render pixel art, cámaras, WASD, slots, animaciones | `protocol` tipos puros | Importar WebRTC o SQLite |
| `house` | Layout, objetos, permisos propios, acciones de click | `protocol`, `storage` | Acceder archivos privados por visitantes |
| `whiteboard` | Canvas Paint, capas, trazos, snapshot, export PNG | `protocol` y adaptador event bus | Borrar capas de otros usuarios |
| `editor` | Editor local «tipo AURA», proyecto local, vista previa código | editor embebido + bridge limitado | Ejecutar código de terceros automáticamente |
| `local-bridge` | Acciones SO: carpeta, archivo, apps autorizadas, selector pantalla si es nativo | Tauri Rust/Electron IPC | Abrir rutas arbitrarias recibidas por red |
| `storage` | SQLite, migrations, preferencias, identidad referenciada | bridge nativo/SQLite | Guardar casas remotas por defecto |
| `assets` | Sprites, packs JSON/PNG, placeholder, validadores | recursos locales | Importar JS/DLL ejecutables |
| `diagnostics` | Métricas locales, errors, logs redactados | adapters | Registrar audio, claves privadas o rutas |
| `ui` | Entradas, avisos, toggles, layouts, estados | interfaces de todos | Lógica criptográfica propia |

**Invariantes**:
- `world` opera con estado inmutable o diffs del dominio; jamás importa `PeerJS`.
- `media` administra tracks y participantes; UI no manipula `RTCPeerConnection` directamente.
- `local-bridge` solo acepta órdenes originadas por gestos locales y una lista explícita de tipos permitidos. Los mensajes remotos jamás son instrucciones del sistema operativo.
- `session` es fuente de verdad del vecindario y `house` local del layout de la casa. La verdad de la pizarra está en los trazos con autor + IDs, no en un bitmap.
- Diferenciar **coordinator** de **house owner** en todos los permisos y tests.

## 7. Protocolos y estados: contrato antes del código

**Envelope mínimo** de mensaje de control versionado, ejemplo de estructura (especificación, no código ejecutable):

```json
{
  "v": 1,
  "kind": "house.furniture.update",
  "messageId": "uuidv4",
  "sessionId": "opaque-session-id",
  "sessionEpoch": 1,
  "senderIdentity": "public-key-fingerprint",
  "senderSeq": 7,
  "sentAtMs": 0,
  "payload": {"houseId":"...", "furnitureId":"...", "x":120, "y":80, "revision":5}
}
```

**Contrato de eventos mínimo**, nombres semánticos sin comprometer implementación exacta:

| Evento | Emisor permitido | Canal | Efecto | Idempotencia |
|---|---|---|---|---|
| `session.join.request` | candidato | reliable | pide entrar; debe ser aceptado | request id |
| `session.join.decision` | coordinator | reliable | acepta/deniega, registra identity | invite + request id |
| `session.member.snapshot` | coordinator | reliable | roster, slots, epoch/revision | revisión |
| `session.member.left` | coordinator | reliable | libera slot y borra casa remota tras gracia | member+revision |
| `session.leaveIntent` | cualquier miembro | reliable | salir voluntariamente con ACK | id de solicitud |
| `session.leaveAck` | coordinator | reliable | confirmar salida, sin retener al peer | id de solicitud |
| `session.heartbeat` | miembros | ephemeral/reliable según diseño | detectar corte inesperado | timestamp monotónico local |
| `session.closing` | coordinator | reliable | cierre de vecindario | epoch |
| `house.visit.request` | visitor | reliable | solicitar entrada | id |
| `house.visit.decision` | house owner | reliable | permitir/denegar entrada | id |
| `house.snapshot` | house owner | reliable | solo muebles/asset IDs/alias públicos | house revision |
| `house.furniture.update` | house owner | reliable | mover mueble propio | house+revision |
| `player.position` | propio usuario | unreliable/unordered | pose normalizada/posición/timestamp | ignorar datos viejos |
| `board.stroke.add` | propietario del trazo | reliable | añadir trazo completo | strokeId único |
| `board.sync.digest/request/response` | miembros autorizados | reliable | reponer trazos faltantes | por ID/authorSeq |
| `board.layer.visibility` | **solo estado local** | ninguno | ocultar capa en esta vista | no se transmite por defecto |
| `media.status` | usuario de media / propietario sala | reliable | estado mic/captura, grupo, pistas | revision |
| `house.kick` | house owner | reliable | retornar visitante al mapa | event id |
| `session.kick` | coordinator | reliable | desconectar de vecindario | event id |

**Seguridad de mensajes:** todos los eventos son validados por esquema, versión, rol/propiedad, `sessionId/epoch`, límites numéricos, tamaños y tasas. En cada canal P2P el `senderIdentity` es el **peer autenticado de esa conexión**, no un campo que se puede falsificar. Ningún visitante puede forjar `house.furniture.update` con identity del dueño simplemente cambiando JSON. Restricciones de payload: posición finita dentro de mapa, nº puntos de trazo acotado, tamaño total por mensaje acotado (límites concretos ajustados por pruebas), límites de conexiones simultáneas.

**Datos sensibles y serialización:** no transmitir paths, comandos de shell, nombres reales de archivos, contenido de PDFs, tokens internos, claves privadas ni bases SQLite; labels públicos se generan explícitamente. La captura de pantalla sí puede revelar contenido privado por decisión del usuario: mostrar indicador y botón detener.

### 7.1 Máquina de estados de conexión

`IDLE -> SIGNALING -> CONNECTING -> AUTHENTICATING -> PENDING_APPROVAL -> JOINED -> RECONNECTING -> {JOINED|CLOSED}`. Estados terminales `DENIED`, `EXPIRED_INVITE`, `NETWORK_FAILED`, `KICKED`, `CLOSED`. Timeout y reset UI definidos; rechazo no es un error técnico; pérdida de señalización posterior al enlace no implica cortar una conexión P2P todavía sana.

### 7.2 Máquina de estados de sesión/host

`CREATED -> OPEN -> HOST_DISCONNECTED_GRACE(60 s) -> {OPEN|CLOSED}` y `OPEN -> INTENTIONAL_CLOSING -> CLOSED`. En gracia mantener casa remota en RAM **solo para usuarios ya admitidos**, rechazar nuevos ingresos, congelar modificación remota de layout de host. Cada participante puede seguir dibujando en su capa local y exportar sus notas aun si se pierde sesión.

**Límite de relojes:** cada cliente inicia su reloj monotónico local cuando detecta pérdida; no depender de reloj de pared sincronizado, y siempre cerrar localmente después de 60 s sin restauración válida. Al recuperar el host, challenge firmado + mismo sessionId/epoch y reconciliar roster; no confiar en un peer que reaparece solo con mismo displayName.

### 7.3 Máquina de estados de screen share

`OFF -> REQUESTING_OS_PERMISSION -> CAPTURING_LOCAL -> NEGOTIATING -> SENDING -> STOPPING -> OFF`, con errores `DENIED`, `NOT_SUPPORTED`, `SOURCE_ENDED`, `NETWORK_FAILED`. Si Linux cancela selector del portal, no inventar `PERMISSION_GRANTED`. Al finalizar compartir detener tracks y señalizar a todos los receptores. Para compartir monitor/ventana, dejar elegir al portal/sistema; no elegir monitor silenciosamente.

### 7.4 Audio privado versus público

- Participar en sala A habilita o invita audio público de A según preferencias visibles; mudarse a sala B desuscribe A y ofrece B, sin fugas transitorias. Fuera de casa no se oye audio de una casa.
- Una llamada privada necesita invitación y aceptación y puede coexistir con el mundo visual; por defecto no mezclar micrófono a dos grupos sin selector/intención explícita. Cada UI indica `YOU ARE HEARD BY: Room A` o `Private: B,C` y permite silencio.
- Mute de usuario local => deja de enviar audio propio. «Silenciar otro» local => no escucharlo. «Host mute» remoto solo es cumplido por clientes cooperativos; para seguridad expulsar/dejar de recibir de ese peer. P2P no permite imponer silencio criptográficamente a software modificado por otro.

## 8. Pizarra colaborativa: modelo de capas y sincronización

**Requisitos**: lápiz, borrador, texto, imágenes pegadas (solo contenido explícitamente insertado y autorizado; tamaño acotado), formas geométricas, selección/mover objetos (aspiración P1, cortar herramientas si tiempo). Transparencia por capas. Cada trazo/objeto pertenece a usuario autor; otro usuario puede **ocultar localmente su capa** pero no eliminar su contenido compartido. El propietario de un objeto sí puede borrarlo/editarlo, con operaciones versionadas/tombstones.

**No usar superposición de bitmaps como protocolo de verdad.** Cada `strokeId` y `authorSeq` evitan duplicados; los puntos normalizados almacenan coordenadas y color/ancho; las operaciones definitivas se transmiten confiables y en chunks. Cursor flotante en canal efímero, nunca confundir con dibujo definitivo. Redibujar tras recibir un lote.

**Offline/reconexión:** al caer enlace, aviso «Trabajas solo; tus nuevos trazos no se comparten todavía y podrían superponerse visualmente». Guardar trazos nuevos en una cola local temporal, no sobrescribir capa ajena. Tras reconexión, enviar digest de IDs/rangos por autor, pedir faltantes, aplicar idempotentemente; conflicto de solapamiento gráfico es aceptable porque ambas capas existen. Si expira sesión, ofrecer exportación **de sus propios trazos** si puede; host permite exportar compuesto de toda la pizarra si tiene capas en memoria. No prometer que el host tendrá los trazos que nunca llegaron.

**Export**: host puede exportar PNG de toda la composición o solo capas visibles mediante selector; opción inicial por defecto incluir todo con previsualización; no exportar rutas ni metadata privada sin autorización. Guardar mediante diálogo local. Si imágenes fueron insertadas por otros, conservar solo temporalmente lo necesario para exportar y pedir permiso al compartir.

## 9. Código, carpetas, PDF, fotos y acciones sobre objetos

**Editor embebido «como AURA»**: la referencia exacta aún es ambigua. Implementación mínima propuesta: editor tipo Monaco o CodeMirror embebido para snippets locales con resaltado, archivos explícitamente elegidos y guardado local; no plugin AURA supuesto. **Programar/compilar** se hace en máquina del dueño, mediante herramientas locales autorizadas. Ningún visitante puede activar compilaciones, shell, instalación de paquetes o comandos en otra máquina. Editor con edición colaborativa multiusuario queda en P2; para hackathon se puede enseñar código por pantalla y colaborar verbalmente/whiteboard.

**Muebles**: escritorio abre editor/snippet o proyecto local; librero abre PDF local; marco abre foto local; gabinete abre carpeta; pizarra abre Paint compartido; mesa activa estudio/voice; trofeo es placeholder futuro. `assetId`, `publicAlias`, `publicDescription`, `actionType` son metadatos públicos opcionales; `privatePath` queda únicamente en `project_links` local. Al visitar una casa, un clic a un objeto muestra alias/contexto público, pero **no** abre archivos del anfitrión. Al clicar el mueble propio se abre selector/archivo según acción configurada.

**Privacidad de screen share**: antes de compartir pantalla completa avisar riesgo de notificaciones privadas y contraseñas. Compartir ventana cuando el sistema lo permita. Respetar control del SO para audio del sistema; si no está disponible, botón deshabilitado con explicación. Sin grabación/retransmisión por la aplicación salvo acción explícita futura.

## 10. Rendimiento y red con seis personas

**Nunca dimensionar solo por media nacional de Internet de EE. UU.** Las velocidades nacionales son observaciones agregadas, no garantía de conexión, Wi-Fi, jitter, codec ni CPU de cada participante. Modelar bajo 5 Mbps de subida por persona como caso límite inicial de pruebas, incluso menos para evaluar modos degradados.

**Presupuestos iniciales revisables**:
- Avatar: emitir 10 Hz como máximo nominal, interpolar recepción; pausarlo en reposo, no enviar 60 FPS de posiciones.
- Mundo: 30 FPS objetivo cuando visible, 15 FPS o pausa cuando está oculto; pixel art nearest neighbor; efectos visuales modestos.
- Audio: Opus adaptable; apuntar a 24–32 kbps mono por conexión, más overhead, sin garantías de throughput exacto; prioritario.
- Pantalla tipo código/documentos: arrancar 720p, 5–10 FPS, bitrate aproximado 0.5–1.5 Mbps **por destinatario** como presupuesto de investigación; habilitar aumento/disminución y medir real.
- Board: trazos permanentes reliable, updates de cursor descartables; multiplexar mensajes/control y evitar bloquear canales.
- Monitorizar `RTCPeerConnection.getStats` (RTT, paquetes perdidos, jitter, bitrate, FPS), uso CPU, memoria y frame pacing cuando herramientas del sistema lo permitan.

**Mesh de seis**: si cada uno transmite una pantalla a los otros cinco, un emisor a 0.8 Mbps necesita alrededor de 4 Mbps solo en copias de video, más audio, datos y overhead. Si todos emiten, 30 transmisiones dirigidas. **Una cuadrícula de seis miniaturas NO ahorra red si se siguen enviando seis emisiones a alta calidad.** Para ahorrar de verdad: el emisor adapta resolución y FPS por receptor, pauses de pistas no seleccionadas o políticas explícitas de `active speakers`/favorite. No prometer seis streams a la vez de alta calidad en P0. Garantizar que voz no queda sin recursos.

**Audio múltiple**: en full mesh una fuente de micro puede enviarse a N-1 receptores; reducir conexiones a los coocupantes de casa/grupo privado. Escuchar varias fuentes en vez de enviar mezcla central, cuidar eco y autoplay policies. Probar auriculares para prevenir feedback en demo.

**Protección antiabuso ligera**: límites por peer de mensajes/s, tamaños de payload, rate limit de invitaciones y acciones, rechazo de números inválidos, límites de textura/decompresión/mod, `bufferedAmount` con drop de posiciones antiguas; no dropear trazos definitivos, ofrecer cola acotada y avisar al saturarse. Evitar memoria infinita en desconexiones.

## 11. Persistencia local SQLite y cache

**Esquema propuesto** (nombres lógicos):

| Tabla | Campos esenciales | Cuándo persiste |
|---|---|---|
| `profile` | publicId, displayName, avatarConfig, createdAt | Permanente |
| `contacts` | fingerprint, publicKey, alias, contactFileVersion | Permanente |
| `contact_aliases` | ownRotatableCode, revision, revokedAt | Permanente |
| `invite_preferences` | currentGeneration, defaults | Permanente; secret activo no en logs |
| `house` | ownHouseId, theme, bounds, layoutRevision | Permanente |
| `furniture` | furnitureId, assetId, x, y, z, publicAlias, publicDesc | Permanente |
| `project_links` | furnitureId, privateLocalPath, permittedLocalAction | Permanente y solo local |
| `avatar_presets` | body, hair, colors, clothing, accessories | Permanente |
| `preferences` | audioRoutes, mute, videoQuality, graphics, privacy | Permanente |
| `mods_installed` | name, version, hash, provenance, license | Permanente |
| `own_board_drafts` | strokes pending (expiran o se exportan) | Temporal, con expiración |

**La clave privada**: Linux Secret Service / store seguro del SO si disponible; documentar fallo cuando no existe keyring. No almacenar secretos en logs ni guardar identidad en claro sin consentimiento informado. No exponer en archivo de contacto. No afirmar que SQLite resuelve cifrado de claves por sí sola.

**RAM solamente:** roster de sesión, casas remotas, sprites remotos, audio tracks, board remota, invitación activa, caches de assets invitados. Al cerrar sesión limpiar RAM, liberar medias y recursos temporales. WebView/OS pueden dejar copias en caches/discos si se usan rutas persistentes: emplear memoria/transient stores y no prometer borrado forense. Los objetos/assets propios instalados son persistentes; assets recibidos solo temporalmente salvo «instalar pack» con consentimiento.

**Versionado**: esquema/migrations con versión; tests de actualización. Escrituras debounced para muebles, flush en cierre, transacciones al guardar layout, rollback si SQLite falla. Si DB corrupta, informar y ofrecer copia de backup/export antes de crear DB nueva.

## 12. Pixel art, materiales y optimización

**Dirección:** vista superior con colisiones básicas, personajes de 4 direcciones y una habitación por casa, mapa fijo pequeño de seis parcelas. **Interpretación de «64bits»:** por defecto sprites **64×64 px**, fondo transparente PNG; puede utilizar tile base 32×32 px y 2×2 tiles para avatar/muebles. Confirmar más adelante mediante mockup. No representar «64 bits de color» como requisito.

**Escala:** una resolución lógica inicial como 640×360 u 768×432, integer scale y nearest-neighbor, sin texturas gigantes. Mantener mundo desacoplado del frame rate con delta tiempo y techo de frame interval. Los muebles se mueven libremente dentro de coordenadas de casa, no obligarlos a cuadrícula, aunque sprites usen dimensiones uniformes. Determinar hitboxes para interacción y z-index por coordenada Y; guardar en espacio lógico, no pixeles de ventana.

**Assets default**: avatares de cuatro direcciones con 2–4 frames si hay tiempo; casa/puerta, calle, árbol, escritorio, mesa, librero, marco, pizarra, gabinete; dos skins de habitación; placeholder para packs desconocidos. Cargar spritesheets con atlas/manifiesto y atribuciones individuales. Evitar dependencia de assets externos durante demo; empaquetar originales y material con licencia compatible. No copiar Pokémon/Animal Crossing/Deltarune.

## 13. Mods: formato seguro, importación y límites

**MVP**: asset pack ZIP que incluya `manifest.json`, sprites PNG, metadata de autor/licencia, tamaño sprite, nombre de asset, versión del esquema y hash opcional. Nada de código ejecutable o scripts (Rust, Python, JS, DLL) en un pack recibido. La petición del usuario de plugins funcionales queda en futuro con capacidades/sandbox.

**Import seguro**: inspeccionar ZIP antes de extraer; denegar `..`, rutas absolutas, symlinks, enlaces externos, streams comprimidos gigantes, miles de archivos, relaciones de compresión sospechosas, PNG malformados o dimensiones excesivas. Confirmación humana de instalación. Assets faltantes se muestran como placeholder; P2P voluntario + hash + límite de bytes + control de congestión. Rechazar automáticamente archivo que intente ejecutar un comando o modificar filesystem fuera del directorio de mods. **No descargar archivos directamente desde un click remoto**.

**Versión del pack**: `schemaVersion`, `id`, `version`, `author`, `license`, `assets`, `sha256`, `maxCompatibility`. La aplicación no declara que puede garantizar la licencia del material recibido: responsabilizar a publicadores y limitar el catálogo oficial a contribuciones verificadas.

## 14. QA de riesgos: amenazas y fallos de diseño

### 14.1 Fallas críticas a detectar y qué hacer

| Riesgo | Test que lo detecta | Acción antes de seguir |
|---|---|---|
| WebKitGTK/Tauri no captura pantalla Linux | `getDisplayMedia` real en distro/Wayland/X11 + transmisión | Electron spike y decisión cuantificada |
| Electron en Wayland carece de fuente esperada | verificar selector portal + PipeWire | reportar limitación, probar X11 permitido por usuario |
| PeerJS Free signaling inaccesible | abrir peers desde redes distintas | informar y reintentar, nunca afirmar sin red |
| NAT impide conexión directa | ICE state failure en dos redes | mostrar error, no inventar TURN gratuito confiable |
| Usuario impostor con username | challenge-response con clave equivocada | bloquear y mostrar fingerprint |
| Link viejo tras rotación | intentar reusar `inviteGeneration` anterior | rechazo y registro local |
| Host cae, no retorna | desconectar interfaz 60+ s | sesión limpia y visitante vuelve a lobby |
| Host vuelve antes de 60 s | reautenticar host y sincronizar estado | preservar sesión sin duplicar miembros |
| Visitante sale voluntariamente, host no responde | timeout de ACK | abandonar local y liberar tracks de todos modos |
| Owner casa B sale, host A sigue | salida de B | la casa B desaparece y vecindario A continúa |
| A entra y sale entre casas | dos habitaciones, audio | no se escucha audio de casa anterior |
| Persona ve rutas privadas | inspección de snapshots/mensajes | test de cero paths, no solo redacción UI |
| Pizarra se superpone tras offline | dividir conexión, dibujar ambos, reconectar | reconcile por ID/autor sin borrar capas |
| Flood de 10000 posiciones/s | fuzz / throttled input | limitar/tirar eventos, sin freeze |
| ZIP malicioso | traversals, zip bomb, PNG inválido | rechazar antes de extracción |
| Compartir pantalla accidental | stop UI y permiso explícito | detener tracks y mostrar indicador |
| Seis shares saturan PC | 6 bots o 6 máquinas reales (stretch) | adaptar bitrate/pausar y nunca garantizar sin prueba |
| empaquetado Windows no ejecutable | CI compila; runtime Windows pendiente | etiquetar «sin prueba Windows» |

### 14.2 Orden de testeo

1. Unit: event schemas, roles, slot allocation, 60s grace, invite versions, storage migration, whiteboard idempotency.
2. Integration: loopback mocked network, reorder/drop packet simulation, stop/unsubscribe audio, rendering UI disabled sources.
3. Dos Linux: red local primero y redes diferentes (hotspot en otro dispositivo si disponible), mic A↔B, screen A→B y B→A, paseo avatares, permisos, export board.
4. Tres clientes o más si P0 pasa: coherencia slots, casas múltiples, una persona en sala privada.
5. CI: Linux build + Windows build; en Windows no confundir CI compile con E2E.
6. Registrar commit, fecha, OS/distro, X11/Wayland, driver (si relevante), versión deps, evidencia y `PASS/FAIL/SKIPPED/UNVERIFIED`.

## 15. Roadmap realista y reparto entre humanos + agentes

**Tiempo interpretado**: dos personas dedicando juntas hasta **24 horas de reloj de trabajo efectivo** (hasta ~48 persona-horas), dentro de las 48 horas del evento. No confundir con 24 h totales combinadas. Agentes pueden ejecutar más pruebas en segundo plano **solo mientras herramientas/CLI las permitan**, sin prometer entrega futura fuera de su ejecución.

| Bloque de horas efectivas | Desarrollador A (Networking/Native) | Desarrollador B (World/UX) | Gate verificable |
|---|---|---|---|
| 0–2 h | Entorno Linux + spike mic, captura Tauri vs Electron | wireframe pixel art y renderer aislado | elegir runtime **por evidencia** |
| 2–5 h | señalización, conexión 2 peers, audio bidireccional | mapa seis slots, WASD, casa simple | dos Linux se escuchan realmente |
| 5–8 h | transmitir y recibir pantalla 1→1, stop/mute | snapshot de casa, avatar remoto, muebles básicos | video remoto y casa visibles |
| 8–11 h | membresía, invitaciones, aprobación, error NAT | Persistencia SQLite de casa propia, acciones click | visita y permisos funcionando |
| 11–14 h | protocolo house enter/leave, rooms voz, grace 60s | segunda casa y mapa multi-home, pizarra local | casa B visitable, host A dirige sesión |
| 14–17 h | enviar trazos fiables, reconexión, calidad audio | whiteboard capas/PNG, sprites/pulido | dibujo remoto sincronizado |
| 17–20 h | CI Windows/Linux, empaquetado Linux, diagnóstico | editor local mínimo, ayudas UX, assets | AppImage/deb instalado + pipeline `.exe` |
| 20–24 h | pruebas en 2 PC/redes, correcciones críticas | pruebas, README y demo | regresión P0 real; 90s pitch |

**Kill switches**:
- Si la captura pantalla Linux Tauri falla al minuto 45 del spike, iniciar prueba Electron; decisión final como máximo al finalizar hora 2. No reescribir todo el renderer: abstraer desktop shell.
- Si audio A↔B no funciona al final de hora 5, suspender desarrollo cosmético hasta resolverlo.
- Si pantalla 1→1 no funciona al final de hora 8, no afirmar P0; documentar y probar otra plataforma/apertura de red.
- Si P0 no está estable a hora 14, recortar editor, todas las opciones de voice privado y mods, NO tocar voice/screen/casa.
- Cuando queden cuatro horas, **código congelado salvo fixes P0**: voz + screen + casa. Evitar IA y marketplace siempre.
- Una mejora estética no justifica cambiar stack después del gate, salvo falla de funcionamiento reproducible.

### 15.1 Responsabilidad humana

- **Dev A (C/C++/Python)**: integración networking/media y shell nativo, definición de tests manuales Linux. Puede delegar TypeScript y Rust a Codex; se responsabiliza de verificación de mic/pantalla en hardware real.
- **Dev B (C#/Python/Java/SQL)**: mundo y persistencia/UI, arte y pruebas interacción. Puede delegar TS/Canvas/SQLite a Codex; se responsabiliza de comprobar que UX de visita funciona sin IDE.
- **Ambos humanos**: toman decisiones de producto y riesgos, ejecutan pruebas reales; pueden revisar PR en lugar de escribir cada línea. No bloquear horas por aprender Rust desde cero.

### 15.2 Estrategia multiagente que minimiza tokens

**Codex LEAD (1 instancia, dueño de integration)**: lee el documento completo al principio, extrae contratos e interfaces, crea repo en GitHub **solo con permiso START CODING**, congela versiones, mantiene `STATUS.md`, integra PR, lanza CI y reporta fallos en resúmenes. No implementa módulos grandes asignados salvo integración mínima. Coordina a Codex N, W y Q y solicita revisión de Claude de manera muy selectiva.

**Codex N (network/media)**: lee secciones 4–7, 10, 14 y `CONTRACTS.md`; módulos `identity`, `signaling`, `transport`, `session`, `media`; NO modifica world/whiteboard/SQLite/manifest. Entrega dos-peer A/V y pruebas de mensajes/roles. Tiene derecho a cambiar una interfaz solo mediante RFC al lead.

**Codex W (world/UX)**: lee 1–2, 4, 6, 8–9, 11–13 y contratos; módulos `world`, `house`, `whiteboard`, `assets`, UI de casa; NO importa PeerJS ni altera tipos protocolo. Usa un `FakeTransport` proporcionado por lead.

**Codex S (storage/editor)**: tarea independiente posterior a contratos: `storage`, `local-bridge`, `editor`; no toca UI app bootstrap, no introduce ejecución remota; pruebas migrations y privacidad. Puede ejecutarse paralelo a N/W si hay worktree separado.

**Codex Q (QA)**: tests/contracts, CI, performance harness, QA checklists; NO reescribe lógica de producción asignada. Pruebas deterministas por virtual clock para 60 s, falsificaciones de mensajes, packet drop/reorder y ZIP validation.

**Claude reviewer**: dos revisiones cortas como máximo: (1) al congelar contratos y plataforma tras spike, (2) cuando P0 integrado, buscar ≤5 fallos críticos de permisos, WebRTC, leakage, cross-runtime y race conditions. Revisar diffs/resúmenes y sólo archivos relevantes, no todo el historial. Su trabajo **es asesorar**, no editar mismo worktree a la vez que Codex.

**Políticas de context/usage**:
- Lead lee spec completa una vez; subagentes leen secciones asignadas + interfaces. Limitar brief a ~600–1000 palabras y respuesta del subagente a ~300–500 palabras + paths/logs mínimos.
- Un único `CONTRACTS.md` versionado; un único lead lo cambia. Bloquear cambios breaking sin revisión.
- Un agent = un conjunto exclusivo de rutas, rama/worktree propia; usar PR o cherry-pick tras tests; no *parallel edit* de package.json, lockfile, GitHub workflows o entrypoint.
- Resumen por gate: `DONE / CHANGED FILES / TESTS+RESULTS / BLOCKERS / NEXT`. No repetir la especificación entera.
- Claude no recorre cada PR cosmético. Llamarlo cuando un bug crítico no se resuelve o en gates de seguridad. **No inventar un presupuesto en dólares/tokens** si no se conoce plan/precios; medir el uso disponible y optimizar heurísticamente.
- Si falla test, enviar failing test + stack trace corto, no logs gigantes. Evitar dos agentes tratando mismo error por duplicado.
- Agent debe registrar dependencias nuevas y licencias antes de usarlas. No asumir plugins de CLI o multi-agent que no existan; si Codex/Claude no ofrecen subagents, ejecutar sesiones separadas manualmente en worktrees.

### 15.3 Prompts listos para agentes (USAR DESPUÉS DE `START CODING`)

**Lead**:
> Lee esta master spec v2 y genera `DECISIONS.md`, `CONTRACTS.md`, `STATUS.md`, `RISK_REGISTER.md` y roadmap; crea repositorio GitHub cuando esté autorizado. Primero ejecuta un spike multimedia comparativo en Linux con evidencia, no completes features por intuición. Congela protocolos y asigna directorios exclusivos. En cada gate reporta archivos cambiados, tests medidos y riesgos. No delegues el mismo fichero a dos agentes ni llames a Claude para trabajo que ya está bien probado.

**N**:
> Implementa únicamente identity/signaling/transport/session/media según contratos congelados; prioriza 2 peers en Linux con micrófono bidireccional y screen share 1→1; demuestra consentimiento, stop de tracks, error NAT y 60 s grace. No toques world/house/storage/manifest. Devuelve diff mínimo, resultados de tests y bloqueadores.

**W**:
> Implementa únicamente world/house/whiteboard/assets y componentes UI asignados, usando transport fake. Vista superior pixel art, slots fijos 0–5, una casa por miembro y múltiples casas abiertas, movimiento WASD, drag libre por propietario, placeholder y Paint por capas. No importes WebRTC ni leas filesystem real. Devuelve tests y resumen corto.

**S**:
> Implementa únicamente SQLite+migrations, permisos seguros para abrir archivos locales por acción humana, editor local simple con highlighting y sin ejecución remota. Nunca transmitas paths. Consume interfaces de `CONTRACTS.md`. No cambies bootstrap ni manifests sin aprobación.

**Q**:
> Añade exclusivamente pruebas, CI Linux+Windows y protocolos de verificación manual. Cubre identity impersonation, stale invite, host 60 s grace, leave ACK timeout, house owner permissions, stroke dedup, malformed payload/rate limiting, SQLite migration, privacy snapshots y packaging. No edites módulos de producción a menos que lead reasigne.

**Claude**:
> Actúa exclusivamente como revisor independiente. Se adjuntan contratos, arquitectura muy breve y diffs relevantes. Devuelve los cinco errores más importantes, cada uno con evidencia reproducible, severidad, solución mínima y test propuesto. Prioriza privacidad, identidad, capturas Linux, separación de casas/voz, ownership y reconexión. No reescribas la arquitectura ni generes código de módulos ya asignados.

## 16. Licencias del programa y assets: problema jurídico real

**Solicitud del usuario:** quiere un proyecto open source y que los usuarios que creen assets contribuyan gratuitamente, no un marketplace que obligue a pagar para tener sprites.

**Distinción que no se debe tergiversar:** ninguna licencia estándar OSI de software permite prohibir reventa comercial si mantiene el calificativo open source. CC BY-SA 4.0 exige share-alike de derivados distribuidos, **pero permite uso y venta comercial**. CC BY-NC-SA restringe comercio pero no garantiza que cualquier usuario publique gratis ni es recomendación para licenciar el software open source. **Ninguna licencia aplicada a nuestros sprites obliga automáticamente a todos los creadores independientes de mods externos**.

**Propuesta práctica (sujeta a decisión legal final):**
1. **Código**: GPL-3.0-or-later si desean reciprocidad open source, o MIT si prima facilidad de adopción. Para esta visión comunitaria se recomienda considerar GPL-3.0-or-later; verificar licencias de dependencias, estrategia de distribución y si plugins enlazan. No añadir licencia sin aprobar las implicaciones.
2. **Assets default creados por ustedes**: CC BY-SA 4.0 (atribución + derivados bajo misma licencia), o CC0 para máxima reutilización. Recomendación provisional CC BY-SA 4.0 para preservar contribución cultural; el uso comercial sigue permitido.
3. **Catálogo oficial del proyecto**: **política editorial**, no licencia: solo aceptar contribuciones que el autor autorice a **descarga gratuita** desde el catálogo y con licencia compatible claramente publicada. Revisar derechos y fuentes. En cualquier momento otro distribuidor puede cobrar por copias que la licencia permite; el catálogo oficial puede seguir siendo gratis.
4. **Mods externos privados**: autores conservan derechos; StudyVillage no puede obligarlos jurídicamente a regalar creaciones solo por ser compatibles con su formato. No afirmar lo contrario.
5. **Créditos**: `ASSETS_LICENSES.md` con autor, URL, licencia exacta y transformaciones; rechazo de assets sin licencia clara, rippeados de juegos o que contengan malware.

**Decisión pendiente no bloqueante:** escoger explícitamente GPL vs MIT y CC BY-SA vs CC0 al publicar. Codex debe proponer una recomendación basada en dependencias, no inventar aceptación humana. La política de gratuidad oficial sí está cerrada.

## 17. Futuros productos expresados en el chat (no borrarlos del roadmap)

1. **IA local opcional** con uso aproximado <24 GB RAM, preferentemente modelos ligeros u Ollama u otro backend probado, analizando solo notas/proyectos compartidos **deliberadamente** por el usuario; priorizar explicar teoría y ejercicios. Puede generar retos, juegos y escape rooms cooperativos del tema estudiado; no sustraer archivos privados ni enviar todo a API sin consentimiento. La IA no es el producto central: amigos sí.
2. **Estudio colaborativo** con pizarra, temas, proyectos, PDF/foto local, editor de código, compilación local, herramientas matemáticas y demostraciones de código compartidas por pantalla. Eventual edición simultánea via CRDT con verificación determinista de código sin ejecución remota.
3. **Economía reputacional/karma**: cada usuario tiene número limitado de puntos para DAR cada semana; puntos por dar **se reinician** semanalmente y no se acumulan. Reputación recibida persiste; trofeos cosméticos, ranking y catálogo de contribuciones. Sin servicio central el sistema es vulnerable a sybil/doble gasto/falsificación; investigar firmas y consenso o moderación cuando escale. El objetivo son aportes positivos entre amigos, no pay-to-win.
4. **Modding**: sprites y avatares, muebles y comportamientos futuros de plugins con permisos; descarga P2P autorizada o catálogo oficial gratuito con controles.
5. **Customización**: cabello, ropa, color, accesorios, ambientaciones, temas y decoración libre; sesiones grupales, voice privado, webcam opcional.

## 18. Criterios verificables de aceptación y evidencia

### P0 demo obligatoria: no marcar `PASS` sin observar

- P0-01: Dos portátiles Linux reales, preferiblemente redes distintas, lanzan build empaquetada sin Node/dev server.
- P0-02: A abre vecindario y obtiene invitación temporal; B solicita acceso, A aprueba; ambas identidades se muestran correctamente.
- P0-03: Mapa con seis parcelas fijas; casa A en slot 0 y casa B en slot 1; pueden visitar al menos casa A; no desaparece al cambiar ventanas.
- P0-04: Casa pixel art desde arriba con WASD; A ve a B y B ve a A con movimiento legible.
- P0-05: Audio en ambas direcciones, mute local efectivo, cerrar sesión libera micrófono.
- P0-06: Compartir una ventana o monitor (según lo que Linux realmente soporte), B ve actualización de pantalla A, y la captura se detiene al pulsar Stop.
- P0-07: Invitar a una tercera persona cuando máximo alcanzado (simulación de capacity 6) se rechaza; solicitudes no autorizadas no muestran datos de casa.
- P0-08: Host se desconecta inesperadamente: banner de gracia; tras 60 s sin vuelta se cierra vecindario y se liberan recursos. Si pulsa Salir, confirmación y cierre intencional; visitante sale siempre por sí mismo.
- P0-09: Diseño propio se conserva tras cerrar/reabrir; en snapshots remotos no existe path local privado.
- P0-10: Build Linux verificable; Windows `.exe` construido por CI marcado explícitamente `NOT RUNTIME TESTED` hasta que se valide en Windows.

### P1 (hacer si hay tiempo y solo entonces declarar funcionamiento)

- P1-01: A, B, C poseen casas diferentes simultáneamente en un vecindario; B y C se visitan, coordinador A mantiene mapa; audio de casa A no sale a casa B.
- P1-02: Pizarra de dos personas con capas independientes, ocultación local, reconciliación tras caída de red, export PNG compuesto por host.
- P1-03: propietario mueve furniture libremente, cambio recibido por visitantes; visitante malicioso no puede moverlo por mensajes alterados.
- P1-04: un objeto abre carpeta local en máquina propia, visitante solo ve nickname sin ruta ni archivos.
- P1-05: código de amigo y contacto importable; invitación rotada invalida ingreso con enlace antiguo.
- P1-06: grupo de voz privado invitado, ninguna fuga por sala al cambiar de casa.
- P1-07: editor embebido abre y guarda un snippet local; compilación local con confirmación explícita (si autorizada).
- P1-08: usuario Linux Wayland/X11 comprueba permisos y errores; selección de ventana/monitor si disponible.

### P2 / futuro pruebas

- P2-01: seis clientes reales/bots autorizados (mediciones sin falsear) y múltiples pantallas con grid/favorite y bitrate reducido en miniaturas; voz prioritaria.
- P2-02: P2P asset pack con placeholder/hash, rechaza zip bomb/traversal.
- P2-03: `.exe` probado con WebView2, captura, mic y permisos Windows reales.
- P2-04: audio del sistema compartido y webcam miniatura, si el OS lo admite y supera permisos.
- P2-05: IA explicativa eficiente sobre proyecto opt-in, sin necesidad de servicio central.

**Evidencia obligatoria**: `TEST_RESULTS.md` con commit SHA, timestamp, dos distros/sesiones gráficas, red, pasos, PASS/FAIL/SKIP/UNKNOWN, métricas relevantes, screenshots y error sin datos privados. Ningún agente puede inferir que algo funciona por documentación de una API o por tests simulados.

## 19. Preparación de repositorio, CI y entregables (tras permiso)

**Repos**: uno nuevo `studyvillage` bajo cuenta/organización autorizada por usuarios. Codex **debe crear repositorio GitHub** usando CLI `gh` **solo después de START CODING y autenticación explícita disponible**, sin inventar permisos. Si no hay token/gh login, generar repo Git local y devolver instrucción exacta para conexión, sin decir que GitHub fue creado.

**Estructura propuesta de repo**:

```text
studyvillage/
  README.md
  LICENSE                      # decisión humana final
  ASSETS_LICENSES.md
  docs/
    MASTER_SPEC.md
    DECISIONS.md
    CONTRACTS.md
    RISK_REGISTER.md
    STATUS.md
    TEST_RESULTS.md
  app/
    src/
      protocol/
      identity/
      signaling/
      transport/
      session/
      media/
      world/
      house/
      whiteboard/
      editor/
      storage/
      assets/
      ui/
      diagnostics/
    native/                     # Tauri Rust o Electron main/IPC según gate
    tests/
  .github/workflows/
  assets/default/
  assets/mods-example/
```

**CI:** lint/types, unit tests, build Linux y build Windows nativo en runners por plataforma usando actions oficiales cuando estén disponibles. No usar `cross` mágico que no haya sido probado para targets Windows. Cache dependencies sin guardar secretos, pin versiones y revisar acciones de terceros. Generar `.exe` y artifact Linux publicables; no hacer release pública si faltan permisos/licencias.

**README del producto**: incluir screenshot real, video corto de dos laptops, instalación Linux, disclaimer de signaling/STUN, firewall/NAT, cómo se importan contactos y se habilita captura, licencia por separado para código/assets, estado de Windows, y privacidad (IP P2P, sin cloud storage de proyectos).

## 20. Referencias externas verificadas al 30/10/2026

- Requisitos Tauri Linux / WebKitGTK: https://v2.tauri.app/start/prerequisites/
- Depuración gráfica de Tauri Linux: https://v2.tauri.app/develop/debug/linux-graphics/
- Electron desktopCapturer Linux y limitación PipeWire: https://www.electronjs.org/docs/latest/api/desktop-capturer
- Captura `getDisplayMedia`, permisos y restricciones: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia
- PeerJS `Peer.id` de brokering, no identidad: https://peerjs.com/client/api/peer
- Tauri GitHub CI Windows/Linux: https://v2.tauri.app/distribute/pipelines/github/
- Tauri action: https://github.com/tauri-apps/tauri-action
- Creative Commons BY-SA 4.0 permite venta comercial: https://creativecommons.org/licenses/by-sa/4.0/deed.en
- Open Source Initiative: comercio permitido y no discriminación: https://opensource.org/osd
- Creative Commons FAQ (venta y NC): https://creativecommons.org/faq/
- WebRTC WebRTC ICE (documentación general): https://webrtc.org/getting-started/peer-connections

Las referencias documentan APIs y licencias, **no validan experimentalmente vuestro hardware ni los permisos Linux**.

## 21. Lista final de puntos abiertos — NO bloquear planificación innecesariamente

- **`64bits` del sprite**: se ha interpretado como **64×64 px** provisionalmente, por ser la interpretación gráfica plausible. No como 64 bits de profundidad.
- **`AURA` editor**: no identificar producto sin URL/referencia del usuario. Primero editor local genérico tipo Monaco/CodeMirror, pero UI final depende del referente concreto.
- **Licencia legal exacta**: código GPL-3.0-or-later vs MIT; assets CC BY-SA vs CC0; **catálogo oficial siempre gratis** como política. Revisión final antes de publicar.
- **Microfono/monitor/sistema**: soporte debe medirse en distros reales; audio de sistema puede no estar implementable en hackathon; no prometer por el texto «TODO».
- **Experiencia de salir**: el host debe recibir leave intent/ACK, pero nunca impedir la salida de un cliente. Mensaje al coordinador no implica que coord. tenga derecho a obligarlo a quedarse.
- **Host offline 60s**: grace por reloj monotónico local; no mantener casas remotas en caché después de cierre. La casa propia permanece guardada.
- **Permisos exactos entre dueño de casa y coordinador**: documentados arriba; UX puede ajustar defaults sin violar separación de autoridad.
- **Gratuidad de assets**: no se puede imponer legalmente a *todos* los modders solo por adoptar un formato de plugins; sí exigirlo a contribuciones del catálogo oficial.

## 22. Historia de demostración de 90 segundos

1. A inicia app Linux y abre un pequeño pueblo pixel art con su casa decorada (2–3 s).
2. A copia enlace temporal desde su perfil; B lo abre y solicita acceso (10 s).
3. A acepta; aparece casa B en segundo slot predefinido y el avatar B camina con WASD (15 s).
4. B entra en casa A; A está junto a su escritorio. Ambos hablan P2P sin almacenar audio en servidor (15 s).
5. A clic en su escritorio: abre su proyecto local; comparte una ventana; B ve un archivo/código en su propia pantalla (20 s).
6. Si P1 listo: abren pizarra, dibujan juntos, ocultan/muestran capas, exportan imagen (15 s).
7. A cambia un mueble de posición, B lo ve; al cerrar, A conserva su layout local; casas ajenas no quedan guardadas (10 s).
8. Mensaje final: el valor es **la amistad y la colaboración**, no una IA ni la nube. Honestidad: el enlace necesita signaling gratuito, en algunas redes NAT puede fallar y Windows aún debe probarse en equipo real.

---

**FIN DEL DOCUMENTO V2.0 — SOLO PLANIFICACIÓN. NO HAY AUTORIZACIÓN PARA PROGRAMAR.**
