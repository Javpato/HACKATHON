# Demo: probar StudyVillage en un rato

Guía para abrir la aplicación y recorrer lo que **sí** funciona hoy en el
navegador, sin segundo equipo, sin captura real y sin build nativo.

## Arrancar

Requiere Node 24 (probado en 24.16.0) y npm.

```bash
npm ci
npm run demo
```

`npm run demo` levanta Vite y abre el navegador en `http://127.0.0.1:1420`.
Si prefieres abrirlo a mano, usa `npm run dev` y entra a esa dirección.

Para ver el paquete de producción en lugar del servidor de desarrollo:

```bash
npm run build
npm run preview   # http://127.0.0.1:4173
```

Ambos modos se han observado cargando sin errores en la consola.

## Recorrido (unos 5 minutos)

Todo lo siguiente es local: no sale ni un solo request fuera de `127.0.0.1`
mientras no pulses «Abrir mi aldea».

1. **Tu rincón.** En la columna izquierda cambia «Nombre visible» y el color, y
   pulsa «Guardar perfil». Recarga la página: el nombre sigue ahí. Se guarda en
   IndexedDB en el navegador; la identidad criptográfica es aparte del nombre.
2. **La aldea.** Seis parcelas fijas y tu casa ya construida en la primera. Tu
   avatar está en la plaza central. Muévete con **WASD** y entra o sal con **E**.
3. **Mi casa.** Tu interior con muebles colocados. En «Decora tu espacio» puedes
   cambiar el nombre público, el ambiente, añadir muebles desde el desplegable y
   quitarlos. El contador de muebles llega hasta 32.
4. **Pizarra.** Elige Lápiz, Línea o Rectángulo, un color y un grosor, y dibuja
   arrastrando el ratón. «Deshacer» retira tu último trazo y deja el lienzo
   exactamente como estaba. Abajo tienes las capas por autor, con la casilla
   «Mis trazos» que solo oculta en tu vista, y «Exportar PNG».
5. **Editor local.** Un cuaderno de código con «Insertar plantilla», «Abrir
   archivo local» y «Exportar copia». Los archivos no se suben a ningún sitio.
6. **Contactos.** Exporta tu tarjeta e importa las de otras personas para
   reconocer huellas entre sesiones.
7. **Diagnóstico.** Equivale a `http://127.0.0.1:1420/?diagnostic=1`. «Bucle
   local» monta dos peers WebRTC reales dentro del mismo navegador con vídeo de
   Canvas y un oscilador de audio. Prueba que el transporte funciona; **no**
   prueba tu micrófono ni otro equipo.

## Guardar la identidad entre reinicios

En «Guardar protegida» puedes cifrar la identidad con una contraseña de 12+
caracteres y desbloquearla al volver. No hay recuperación de contraseña. Sin
cifrarla, la identidad vive solo en esa pestaña.

## Lo que esta demo NO demuestra

- **Micrófono y pantalla reales.** Los botones existen y piden permiso al
  sistema, pero no hay observación registrada de una captura real. Sigue
  UNVERIFIED.
- **Dos equipos / dos redes.** «Abrir mi aldea» usa la señalización gratuita de
  PeerJS y genera una invitación para compartir fuera de la app, pero nunca se
  ha probado con un segundo portátil. Sigue UNVERIFIED.
- **Build nativo de escritorio.** `npm run desktop:build` falla en este equipo
  en `glib-sys` por falta de `glib-2.0.pc`. No se ha producido ningún paquete
  deb/AppImage ni instalador de Windows.
- **Tauri/WebKitGTK.** Lo que se ve aquí es Chrome. El motor del escritorio
  puede comportarse distinto, sobre todo en captura.

## Comprobaciones que acompañan a la demo

```bash
npm run typecheck   # sin errores
npm test            # 44 tests en 9 ficheros
npm run build       # bundle de producción
npm run test:e2e    # 8 tests de navegador (Chrome del sistema)
```

Los tests de navegador usan `/usr/bin/google-chrome`; se puede apuntar a otro
binario con `CHROME_PATH`. Ver [TEST_RESULTS](../TEST_RESULTS.md) para el
detalle de lo observado y [STATUS](STATUS.md) para los bloqueos abiertos.
