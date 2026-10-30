# Gate multimedia: evidencia manual

No rellenar PASS por leer una API ni por usar dispositivos falsos. La página `?diagnostic=1` se sirve tanto en navegador como en Tauri; el botón Diagnóstico de la app también permite comprobar las APIs. Ninguna captura empieza al cargar.

1. Registrar localmente commit, fecha, distro, X11/Wayland, compositor, WebKitGTK/WebView2, PipeWire/portal y red (LAN o redes distintas). No publicar nombres personales, IP, claves, invitaciones o rutas.
2. Abrir la **build empaquetada** sin Vite/Node. Anotar el runtime. En Linux probar X11 y Wayland por separado, cuando estén disponibles.
3. Diagnóstico: comprobar APIs; micrófono permitir/denegar; pantalla cancelar/permitir y seleccionar ventana y monitor. Confirmar contenido visible y actualizar la ventana fuente. «API disponible» no equivale a captura.
4. Detener en UI y desde el selector del sistema; verificar indicador del sistema y pistas terminadas. Cerrar la ventana y comprobar que termina la captura.
5. En A abrir vecindario; copiar invitación temporal mediante un medio externo; B solicitar acceso. Antes de aprobar no debe haber roster, casa ni medios. Comparar huellas; A acepta.
6. Ambos entran en la misma casa. Activar micrófonos con auriculares; A oye B y B oye A. Probar mute, pulsar para hablar, ensordecer, salir de casa y cambiar casa. No se debe escuchar la casa anterior.
7. A comparte ventana/monitor, B ve cambios. Stop debe retirar pista/vista remota. Repetir B→A. El audio del sistema queda fuera de esta entrega.
8. Desconectar red del host. Medir 60 s desde detección local. Verificar banner y cierre; repetir con regreso antes del plazo y reautenticación. Probar caída de señalización sin caída P2P, que no debe cerrar enlaces sanos.
9. Salida voluntaria: B sale; se borra su casa, A continúa. Si A sale se cierra todo. Simular ACK perdido: B puede salir sin quedarse atrapado.
10. Repetir en redes distintas si es posible. Si ICE falla, registrar error y reintentar; no TURN, no garantía universal de NAT.

## Matriz por persona y runtime

| Prueba | A Linux X11 | B Linux X11/Wayland | Windows |
|---|---|---|---|
| Build empaquetada abre | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Micrófono local y denegación | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Selector ventana / monitor | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| A↔B voz audible real | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| A→B y B→A pantalla real | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Stop libera captura | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Cambios de casa sin fuga | UNVERIFIED | UNVERIFIED | UNVERIFIED |
| Host vuelve <60 s / expira | UNVERIFIED | UNVERIFIED | UNVERIFIED |

El loopback del diagnóstico genera un Canvas y tono sintéticos, establece dos RTCPeerConnection dentro del mismo proceso, y exige paquetes de audio, fotogramas de video decodificados y un mensaje DataChannel. No usa signaling/STUN ni demuestra captura o NAT.

Si Tauri falla con evidencia reproducible y Chromium funciona, ejecutar un spike Electron con la misma lógica y registrar la decisión. El código no cambia de plataforma solo por carecer de herramientas de compilación.
