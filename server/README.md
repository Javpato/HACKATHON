# Servidor propio de StudyVillage

Un mundo persistente que instala y gestiona su dueño, en su propio equipo o en un VPS.
Nosotros entregamos el software; no alojamos ni operamos ningún servidor.

- **Node 24**, **WebSocket** y **SQLite** integrado (`node:sqlite`). Sin dependencias en ejecución: un único archivo `server.mjs`.
- Sin servidor, la aldea entre pares sigue igual: seis personas.
- Con servidor, el dueño elige de **1 a 24 conexiones simultáneas** (residentes y visitantes cuentan igual).
- Cada barrio tiene seis parcelas. Se crean los barrios necesarios, hasta **cuatro**: 10 personas → 2 barrios.
  Bajar la capacidad no borra casas ni barrios ni expulsa a nadie: solo limita las entradas siguientes.
- Los barrios forman una cadena izquierda/derecha dentro del mismo servidor. Cada uno tiene su Comunidad (norte) y su Biblioteca (sur).
  Conectar servidores de dueños distintos no forma parte de esta entrega.

## Qué guarda y qué no

| Se guarda en SQLite | Se queda en cada dispositivo | Es transitorio |
|---|---|---|
| Residentes y parcelas, casas, acceso, muebles, pizarras de casas y de barrio, proyectos de grupo, invitaciones (solo su huella SHA-256) | Claves privadas, notas privadas, archivos y rutas locales, configuración de Ollama | Presencia, posiciones, llamadas, partidas en curso |

Cada cambio se confirma después de escribirse en una transacción. Las peticiones llevan un identificador:
repetir una petición tras perder la respuesta no aplica el cambio dos veces. Si el disco falla, la app
recibe un error y conserva el borrador. Tras un reinicio, casas, pizarras y residentes siguen ahí; las
partidas vuelven a la sala de espera.

## Instalación rápida (Node 24)

```bash
git clone <este repositorio> && cd hackathon
npm ci
npm run server:build            # crea server/dist/server.mjs
DATA_DIR=/var/lib/studyvillage WORLD_NAME="Mi aldea" node server/dist/server.mjs
```

En el primer arranque aparece un **secreto de instalación de un solo uso** (también en `DATA_DIR/claim-secret.txt`, permisos 600):

```
[studyvillage] No administrator yet. One-time claim secret: …
```

Variables de entorno:

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` / `HOST` | `8787` / `0.0.0.0` | Dónde escucha |
| `DATA_DIR` | `./data` | Carpeta de `world.sqlite` (usa un volumen persistente) |
| `WORLD_NAME` | `StudyVillage` | Nombre que ven los clientes |
| `ALLOWED_ORIGINS` | `*` | Orígenes web permitidos, separados por comas |
| `CLAIM_SECRET` | aleatorio | Fija tu propio secreto de instalación |
| `TLS_CERT` / `TLS_KEY` | — | TLS directo, si no usas proxy |

## Docker

```bash
docker compose -f server/docker-compose.yml up -d --build
docker compose -f server/docker-compose.yml logs studyvillage | grep "claim secret"
```

Los datos viven en el volumen `studyvillage-data`. El puerto solo se publica en `127.0.0.1`:
pon delante un proxy con HTTPS.

## HTTPS obligatorio (wss://)

Los navegadores exigen `wss://` fuera de este mismo equipo. Lo más sencillo es Caddy, que obtiene el certificado solo:

```
aldea.example.org {
	reverse_proxy 127.0.0.1:8787
}
```

(ver `server/Caddyfile.example`). Abre los puertos 80 y 443 del VPS. Con nginx, recuerda
`proxy_http_version 1.1; proxy_set_header Upgrade $http_upgrade; proxy_set_header Connection "upgrade";`.

## Primera administración y entrada de personas

1. En la app: **Ajustes → Identidad**, guarda tu identidad cifrada.
2. **Ajustes → Servidores**: escribe `https://aldea.example.org`, pulsa **Comprobar**, pega el secreto de instalación y **Conectar**.
   Tu identidad pasa a ser la administradora; el secreto deja de valer. Conocer la URL no da ningún permiso.
3. En **Administrar servidor** eliges la capacidad y creas **invitaciones privadas** (nombre, usos, horas).
   El código solo se muestra una vez; puedes revocarlo cuando quieras.
4. Quien recibe la invitación entra con ella:
   - con **identidad guardada** se convierte en residente y recibe parcela; después vuelve sin invitación ni administrador;
   - con **identidad temporal** entra como visitante, sin parcela.
5. Cada residente puede pulsar **Importar mi casa y pizarras**: se copia al servidor y los originales siguen en su equipo.

El administrador puede desconectarse: el mundo sigue abierto, se pueden empezar actividades y las casas siguen disponibles.

## Actividades, voz y Ollama

- Hombres lobo, Gartic Phone, concursos y proyectos se ejecutan **en el servidor**: cada persona recibe solo su vista.
  Organiza la primera persona presente en la actividad; si sale, organiza la siguiente.
- La voz, la pantalla y las cámaras siguen siendo WebRTC entre las personas de la **misma escena** (zona, casa o llamada privada).
  El servidor solo reenvía la señalización autenticada; no hay una malla global. Hasta 12 personas a la vez por barrio.
- Ollama sigue siendo personal. Los bots de Gartic solo funcionan con el Ollama de quien organiza y mientras siga conectado;
  si se va, los bots se desactivan en lugar de inventar respuestas.

## Copias de seguridad y restauración

```bash
# Copia consistente con el servidor en marcha
DATA_DIR=/var/lib/studyvillage node server/dist/server.mjs backup /backups/aldea-$(date +%F).sqlite

# Restaurar (con el servidor PARADO). La base anterior queda como world.sqlite.before-restore
DATA_DIR=/var/lib/studyvillage node server/dist/server.mjs restore /backups/aldea-2026-11-01.sqlite
```

En Docker: `docker compose -f server/docker-compose.yml exec studyvillage node server.mjs backup /data/backup.sqlite`.

## Comprobaciones

```bash
npm run server:test     # 13 pruebas de integración con sockets e identidades reales
npm run typecheck       # incluye server/
```

Estado comprobado y pendientes: ver `docs/SERVER.md`.


## Acceso automático de amigos / Automatic friend access

En **Menú → Habitaciones → Amigos autorizados**, el propietario puede elegir contactos para la casa y para cada habitación. La lista de la casa abre el vestíbulo, incluso con la casa cerrada. La de una habitación permite entrar a esa habitación y pasar por el vestíbulo y su planta; las demás habitaciones siguen siendo privadas. Cada lista admite hasta 24 identidades.

Conecta al servidor con una identidad guardada y espera **«Guardado en el servidor»** al modificar una lista. Ese guardado publica la estructura y los permisos sin importar tus pizarras o archivos personales. Los permisos quedan en SQLite y funcionan aunque el propietario esté desconectado, también después de reiniciar el servidor. El servidor debe permanecer encendido y los amigos deben poder conectarse a él con su identidad habitual e invitación/residencia. Quitar a un amigo de la lista revoca ese acceso automático.

In **Menu → Rooms → Allowed friends**, owners can choose saved contacts separately for the house lobby and each room. A room invitation includes passage through its lobby and floor, while other rooms remain private. A house invitation opens only the lobby, including when the house is closed. Connect with a saved identity and wait for **“Saved on the server”**. Policies persist in SQLite across restarts and work while the owner is offline, provided the server is running and friends can connect with their usual identities and server invitation/residency. Removing a friend revokes that automatic access.

Esta actualización usa el protocolo **3**. Actualiza los clientes y recompila/reinicia el servidor juntos; los datos existentes se conservan. / This update uses protocol **3**. Update the clients and rebuild/restart the server together; existing data is preserved.


### Actualización móvil / Mobile update

Las posiciones de las puertas de plantas y habitaciones se guardan ahora en la casa firmada. Esta versión usa el protocolo **4**: recompila y reinicia el servidor junto con la app. La cuadrícula y los diseños vertical/horizontal de los controles, así como los apodos de los contactos, se guardan solo en cada dispositivo.

Floor and room door positions now persist in the signed house document. This version uses protocol **4**: rebuild/restart the server together with the app. HUD grids/orientation layouts and contact nicknames are local device preferences.
