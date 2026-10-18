# Plan — fix-auth-rate-limit-ip

## Objetivo

Que Better Auth identifique la IP real de cada cliente en producción, para que
`session.ip_address` deje de guardarse vacío y el límite de intentos se cuente
por cliente (5 por minuto para iniciar sesión y cambiar la contraseña), sin que
un cliente pueda inventar su IP.

## Causa raíz

Leyenda de certeza: **[código]** lo verifiqué leyendo el código en
`node_modules` o en el repo; **[repo]** lo afirma un artefacto previo del repo
que no pude comprobar; **[inferencia]** es deducción o memoria de documentación
pública que no pude consultar en esta sesión (no tengo acceso web).

### 1. Cómo obtiene Better Auth 1.6.22 la IP

Archivo: `@better-auth/core@1.6.22/dist/utils/ip.mjs` (`getIp`, `getIPFromHeader`).

- **[código]** Recorre `advanced.ipAddress.ipAddressHeaders` en orden (por
  defecto `["x-forwarded-for"]`) y usa la primera que dé una IP válida.
- **[código]** Sin `trustedProxies`, **sólo acepta una cabecera con un único
  valor**: si `x-forwarded-for` trae dos o más IPs separadas por coma devuelve
  `null` (`if (forwardedIps.length !== 1) return null`). También devuelve `null`
  si el único valor no es una IP válida.
- **[código]** Con `trustedProxies`, recorre la lista de derecha a izquierda,
  salta las IPs que caen en esos CIDR y devuelve la primera que no.
- **[código]** Si ninguna cabecera da IP: con `NODE_ENV` `development`, `dev` o
  `test` devuelve `"127.0.0.1"`; en cualquier otro caso (incluido `production`
  y `NODE_ENV` vacío) devuelve `null`. `NODE_ENV` se lee **una vez al cargar el
  módulo** (`env/env-impl.mjs`).
- **[código]** Al crear la sesión guarda `ipAddress: getIp(headers) || ""`
  (`better-auth/dist/db/internal-adapter.mjs:177`). Por eso el campo queda en
  cadena vacía, no en `NULL`.

### 2. Cómo arma la clave del límite de intentos

Archivo: `better-auth/dist/api/rate-limiter/index.mjs`.

- **[código]** El límite está **activo sólo si `NODE_ENV === "production"`**
  (`enabled: options.rateLimit?.enabled ?? isProduction` en
  `context/create-context.mjs`). Almacenamiento por defecto: memoria del
  proceso.
- **[código]** Clave: `` `${ip ?? "no-trusted-ip"}|${path}` ``. Con IP `null`
  **todas las peticiones a la misma ruta comparten un único cupo**, y Better Auth
  escribe una sola vez por proceso el aviso *"Rate limiting could not determine a
  client IP and is falling back to a single shared per-path bucket"*.
- **[código]** Reglas por defecto: `/sign-in*`, `/sign-up*`, `/change-password*`,
  `/change-email*` → 3 cada 10 s; `/request-password-reset`,
  `/send-verification-email`, `/forget-password*` → 3 cada 60 s; el resto
  (incluido `/get-session`) → 100 cada 10 s. `customRules` (por ruta exacta o con
  `*`) pisa a las anteriores.
- **[código]** Se cuenta toda petición, buena o mala. Las 5 primeras pasan y la
  sexta da 429 (`count >= max`). En memoria, la ventana se reinicia 60 s después
  de la última petición permitida. La respuesta trae `X-Retry-After`.
- **[código]** El límite corre en el `onRequest` del router de Better Auth
  (`better-auth/dist/api/index.mjs:168`), es decir, sólo para peticiones que
  entran por `auth.handler`. Las llamadas directas `auth.api.*` (el
  `getSession` de `api/src/plugins/auth.ts` y el `signInEmail` de
  `POST /invitations/set-password`) **no** pasan por el límite.

**Respuesta a "según cómo trate Better Auth una IP vacía":** el segundo caso.
**[código]** No se queda sin límite: todos los clientes caen en un cupo por ruta.
Hoy, en producción, todo el mundo comparte 3 inicios de sesión cada 10 s (un
atacante con 3 peticiones cada 10 s deja sin poder entrar a todos los usuarios) y
100 `get-session` cada 10 s (ver punto 5).

### 3. Por qué la IP queda vacía en producción

- **[código]** El api corre con `NODE_ENV=production`: lo fija `api/Dockerfile`
  (`ENV NODE_ENV=production`). **[inferencia alta]** Railway construye con ese
  Dockerfile porque está en el root directory del servicio (`api/`). Por eso no
  aplica el `127.0.0.1` de desarrollo y el límite está activo.
- **[código]** Un `ip_address = ''` en producción sólo es posible si
  `x-forwarded-for` llegó al api **ausente, con 2 o más IPs, o con un valor que no
  es IP**.
- **[repo]** El intento anterior de límite por IP (commit `4b00c26`, revertido en
  #71) dejó escrito en `platform/src/lib/api/visitor-headers.ts`: *"Railway
  descarta el x-forwarded-for del visitante y pone 'IP del visitante, IP del
  borde': la última entrada es del borde y cambia entre peticiones."* Encaja con
  lo anterior: **dos entradas → Better Auth 1.6 devuelve `null`**. Es la causa
  más probable; no sé cómo se obtuvo esa observación.
- **[código]** Next no lo arregla ni lo empeora (punto 4): `x-forwarded-for`
  llega al api tal como lo dejó el borde de Railway.

Conclusión: **la configuración `ipAddressHeaders: ["x-forwarded-for"]` sin
`trustedProxies` no puede funcionar detrás de Railway** si Railway arma esa
cabecera con dos IPs. Certeza alta (código + observación previa del repo).

### 4. Qué hace Next 15.5.19 con las cabeceras

- **[código]** Los `rewrites` a un destino externo (`/api/auth/:path*`,
  `/api/invitations/:path*`) los resuelve `router-server.js` con
  `proxyRequest` (`next/dist/server/lib/router-utils/proxy-request.js`), que usa
  `http-proxy` **sin `xfwd`**: copia todas las cabeceras entrantes
  (`Object.assign({}, req.headers)`), sólo pisa `x-forwarded-host` y **no agrega
  ni modifica `x-forwarded-for` ni `x-real-ip`**. Es el mismo camino con
  `next dev` y `next start`.
- **[código]** El `x-forwarded-for ??= socket.remoteAddress` de
  `base-server.js:568` sólo corre para páginas y route handlers de Next, no para
  los rewrites externos.
- **[código]** El middleware de platform excluye `api/auth` en su `matcher`, así
  que tampoco toca esas peticiones.
- **[código]** Las llamadas `fetch` del servidor de platform (`doFetch`,
  `getMe`, `getSession`) **sólo mandan `cookie`**: no llevan ninguna cabecera de
  IP.

### 5. Hallazgo adicional: `get-session` también comparte un cupo

- **[código]** `platform/src/lib/auth/session.ts` llama a
  `${API_URL}/api/auth/get-session` desde el servidor en cada render que necesita
  sesión. Entra por `auth.handler`, así que cuenta para el límite (100 cada
  10 s), y como no lleva cabecera de IP su clave es
  `no-trusted-ip|/get-session` **para todos los usuarios**. Con tráfico, un 429
  ahí hace que `getSession` devuelva `null` y el usuario parezca deslogueado.
- Esto **seguiría pasando** tras arreglar la cabecera en el api si platform no
  reenvía la IP en esa llamada. Por eso el arreglo incluye ese reenvío.

### 6. Por qué en local y e2e sí se guarda

- **[código]** e2e corre el api con `NODE_ENV=test` (lo exige
  `platform/e2e/support/env.ts`). Sin cabecera válida, `getIp` devuelve
  `"127.0.0.1"`, así que siempre hay IP. Además el límite de intentos está
  **desactivado** (`enabled` sólo en `production`), por eso nunca se vio.
- **[código]** CA-6 de `fix-invitation-set-password.spec.ts` comprueba
  `expect(session?.ipAddress).not.toBeNull()`: **también pasa con `""`**, así que
  no habría detectado el fallo aunque se diera.
- **[inferencia]** En desarrollo local depende del `NODE_ENV` de `api/.env`, que
  no leí: con `development` se guarda `127.0.0.1`; si está vacío, se guarda `""`
  como en producción.

### 7. Qué pone el borde de Railway

- **[inferencia]** Según recuerdo de la documentación pública de Railway (página
  de especificaciones de Public Networking), el borde agrega `X-Real-IP` con la
  IP de quien abrió la conexión, además de `X-Forwarded-Proto`,
  `X-Forwarded-Host`, `X-Railway-Edge`, `X-Request-Start` y
  `X-Railway-Request-Id`. No pude consultarla en esta sesión.
- **[inferencia]** Que `X-Real-IP` **reemplaza** el valor que mande el cliente no
  está comprobado. Es el comportamiento estándar de esa cabecera (no se
  concatena) y es coherente con que Railway descarte el `X-Forwarded-For` del
  cliente (punto 3), pero **es la suposición de la que depende la protección
  contra IPs inventadas**. Ver «Riesgos y decisiones abiertas», P1.
- **[humano]** El api no tiene dominio público: sólo platform puede llegar a él
  por la red privada. Nadie puede mandarle cabeceras directamente.

## El arreglo

### Cabecera y proxies

- **Leer la IP de `x-real-ip`**, y sólo de ella: un único valor, que Better Auth
  acepta sin `trustedProxies`.
- **Sin `trustedProxies`.** Sólo sirven para recorrer una cadena
  `x-forwarded-for`, y no conocemos los rangos de IP del borde de Railway (el
  repo dice que la IP del borde cambia entre peticiones). Confiar en un rango
  amplio, como `10.0.0.0/8` o `100.64.0.0/10`, podría tratar como proxy a un
  cliente o al revés.
- **Sin `x-forwarded-for` de respaldo.** Si `x-real-ip` faltara, aceptar un
  `x-forwarded-for` de una sola entrada sería aceptar una cabecera que, fuera de
  Railway, controla el cliente. Es preferible que la falta se note (sesión sin IP
  y aviso en el log, detectables) a que se pueda falsear sin que nadie lo vea.
- **En qué confiamos:** en el borde de Railway, el único punto que ve la conexión
  real del navegador. Platform no agrega información: reenvía tal cual la
  `x-real-ip` que le puso el borde (en el rewrite lo hace Next solo; en
  `getSession`, a mano).

### Límite de 5 por minuto

`rateLimit.customRules` con `{ window: 60, max: 5 }` para `/sign-in/email` y
`/change-password`. Son las únicas rutas de inicio de sesión y cambio de
contraseña: no hay login social ni otro método `sign-in/*`. Lo demás conserva los
valores por defecto: `/sign-up*` y `/change-email*` 3 cada 10 s, recuperación y
reenvío de verificación 3 cada 60 s, resto 100 cada 10 s. El límite sigue activo
sólo con `NODE_ENV=production`, como hoy.

### Funcionamiento por entorno

| Entorno | `x-real-ip` | IP que usa Better Auth | Límite |
| --- | --- | --- | --- |
| Producción (Railway) | La pone el borde | La del cliente | Activo, por IP |
| e2e (`NODE_ENV=test`) | No llega, salvo que la prueba la mande | `127.0.0.1`, o la que mande la prueba | Desactivado |
| Desarrollo (`development`) | No llega | `127.0.0.1` | Desactivado |

### ¿Platform debe reenviar la IP en sus llamadas del servidor?

- **Sí, sólo en `getSession`** (`platform/src/lib/auth/session.ts`), que es la
  única llamada del servidor que entra por `auth.handler`. Reenvía la
  `x-real-ip` de la petición entrante (`headers()` de Next): con eso cada usuario
  tiene su propio cupo de `get-session`.
- **No falsea nada:** es el mismo valor, y la misma confianza, que el rewrite ya
  pasa al api. El cliente no puede añadir cabeceras al `fetch` del servidor; lo
  único que controla es su petición a platform, y ahí `x-real-ip` la pone el
  borde (P1).
- **No hace falta en `doFetch` ni en `getMe`:** van a rutas de Fastify, que
  autentican con `auth.api.getSession` (sin límite de Better Auth y sin crear
  sesiones). Si en el futuro una server action llama a otra ruta `/api/auth/*`,
  debe reenviar `x-real-ip` igual. Lo dejo escrito en el comentario de
  `session.ts`.
- **Descartado:** volver al secreto compartido entre platform y api con una
  cabecera propia (`x-wizydoc-visitor-ip`, como en #64). Era necesario porque
  aquel límite vivía en Fastify, donde cualquier petición podía traer la
  cabecera. Aquí no agrega seguridad: el api es privado y el valor de origen
  sigue siendo una cabecera del borde.

## Requiere confirmación del humano

`api/src/infrastructure/vendors/auth/better-auth/auth.ts` es un archivo
protegido. Diff exacto propuesto (único cambio en ese archivo):

```diff
--- a/api/src/infrastructure/vendors/auth/better-auth/auth.ts
+++ b/api/src/infrastructure/vendors/auth/better-auth/auth.ts
@@ -13,7 +13,25 @@ const auth = betterAuth({
   disabledPaths: ["/update-user"],
   advanced: {
     database: { generateId: false },
-    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
+    // El borde de Railway pone en X-Real-IP la IP de quien abrió la conexión;
+    // platform la reenvía tal cual. No se usa x-forwarded-for: Railway lo arma
+    // como "visitante, borde" y con dos entradas Better Auth no resuelve la IP,
+    // así que todos los clientes compartían un único cupo y la sesión quedaba
+    // sin IP. Sin cabecera de respaldo: si X-Real-IP faltara, preferimos la
+    // sesión sin IP y el aviso de Better Auth en el log a aceptar una cabecera
+    // que el cliente pueda fijar. Sólo es seguro mientras el api no tenga
+    // dominio público.
+    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
+  },
+  rateLimit: {
+    // 5 intentos por minuto y por IP para iniciar sesión y cambiar la
+    // contraseña (Better Auth trae 3 cada 10 s). Como el resto del límite, sólo
+    // se aplica con NODE_ENV=production.
+    customRules: {
+      "/sign-in/email": { window: 60, max: 5 },
+      "/change-password": { window: 60, max: 5 },
+    },
   },
   session: {
     // Ventana de sesión: 7 días. Como es rodante, un usuario activo no se
```

**Por qué cada línea:**

- `ipAddressHeaders: ["x-real-ip"]`: es la única cabecera de un solo valor que
  pone el borde de Railway y que llega intacta al api a través de Next. Arregla
  a la vez `session.ip_address` y la clave del límite.
- Sin `trustedProxies` y sin `x-forwarded-for`: ver «El arreglo».
- `customRules`: aplica la decisión de 5 por minuto sólo a las dos rutas pedidas,
  sin tocar `enabled`, el almacenamiento ni las demás reglas.

No se tocan `api/src/plugins/auth.ts`, `policy.ts` ni `entitlements.ts`.

## Cambios por capa

### Prisma

Ninguno. `Session.ipAddress String?` ya existe. No requiere migración.

### api

| Archivo | Cambio |
| --- | --- |
| `api/src/infrastructure/vendors/auth/better-auth/auth.ts` | **Protegido.** El diff de arriba, sólo si el humano lo autoriza. |
| `api/verify-auth-rate-limit.ts` (nuevo) | Script de comprobación manual, como los `verify-*.ts` existentes. Ver «Verificación». |

Sin rutas nuevas ni cambios de `policy({...})`: `/api/auth/*` sigue con
`policy({ public: true })` en `server.ts`.

### platform

| Archivo | Cambio |
| --- | --- |
| `platform/src/lib/auth/session.ts` | Reenviar `x-real-ip` de la petición entrante en el `fetch` a `/api/auth/get-session`, sólo si viene. Comentario con el porqué y la regla para futuras llamadas del servidor a `/api/auth/*`. |
| `platform/src/app/(auth)/login/login-form.tsx` | Con `error.status === 429`, mostrar "Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo." Hoy se muestra el `message` en inglés de Better Auth ("Too many requests. Please try again later."). |
| `platform/src/components/profile/password-card.tsx` | Cambiar "Espera unos segundos" por "Espera un minuto" en el toast del 429: la ventana pasa de 10 a 60 s. |

No se toca `next.config.ts` ni `middleware.ts`.

### e2e

| Archivo | Cambio |
| --- | --- |
| `platform/e2e/api/security/fix-auth-rate-limit-ip.spec.ts` (nuevo) | Ver «Verificación». |
| `platform/e2e/api/invitations/fix-invitation-set-password.spec.ts` | Endurecer CA-6: `ipAddress` no vacío (`toBeTruthy()`), no sólo `not.toBeNull()`. |
| `platform/e2e/README.md` | Agregar la fila del spec nuevo a la tabla de flujos cubiertos. |

## Aislamiento entre cuentas

No se lee ni se escribe ningún dato de cuenta nuevo. `session.ip_address` lo
escribe Better Auth en la sesión del propio usuario. Las cubetas del límite son
por IP y ruta, en la memoria del proceso del api, y no exponen datos. No hay
endpoint público nuevo.

## Riesgos y decisiones abiertas

### Preguntas para el humano

- **P1. ¿Railway reemplaza el `X-Real-IP` que manda el cliente?** Toda la
  protección contra IPs inventadas depende de eso. Si Railway lo respeta en vez
  de reemplazarlo, un atacante cambia la cabecera en cada intento y no tiene
  límite. Pido que lo confirmes en la documentación de Railway (Public
  Networking, cabeceras que agrega el borde) o con su soporte. Si no se puede
  confirmar, la alternativa es: el middleware de platform, también para
  `/api/auth/*`, toma de `x-forwarded-for` la penúltima entrada (la IP que vio
  el borde, según "visitante, borde"), la escribe en `x-real-ip` pisando la del
  cliente, y `getSession` hace lo mismo. Así no importa si Railway concatena o
  reemplaza, pero depende de que el borde agregue exactamente una entrada al
  final, y suma lógica en platform. No la diseño en detalle sin tu decisión.
  **Estado (18 de octubre de 2026):** la documentación oficial de Railway solo
  dice que `X-Real-IP` sirve «para identificar la IP remota del cliente», sin
  aclarar si reemplaza la del cliente, y en su foro el personal se contradice.
  Queda sin confirmar: se comprueba en el entorno que no es producción después
  de desplegar (criterios [humano, post-despliegue]). Si ahí se guarda una IP
  inventada, se aplica la alternativa en un cambio aparte, antes de producción.
- **P2. Respondida:** sí hay un entorno de Railway que no es producción. La
  prueba con un `X-Real-IP` inventado se hace solo ahí, nunca en producción.
- **P3. Respondida:** el api corre con una sola réplica, así que el límite en
  memoria es real (5 por minuto). Si algún día hay varias réplicas, hará falta
  `storage: "database"` en otro ticket.

### Riesgos

- **Todos en un cupo por mala configuración.** Si `x-real-ip` no llegara (por
  ejemplo, si se quita el rewrite o se pone otro proxy delante) o trajera la IP
  de un proxy y no la del cliente, todos volverían a compartir cupo. Cómo
  detectarlo, todo en lectura:
  - `ip_address = ''` en sesiones nuevas;
  - todas las sesiones nuevas con la misma IP, o con una IP privada (`10.*`,
    `100.64.*`, `fd*`);
  - el aviso *"Rate limiting could not determine a client IP"* en los logs del
    api. Sale una vez por proceso.
- **IP inventada:** depende de P1.
- **Si alguien le da dominio público al api**, cualquiera podría mandarle
  `X-Real-IP` directamente. El comentario del diff lo advierte. Si se publica,
  hay que revisar este arreglo.
- **Varias personas detrás de la misma IP** (la red de una clínica): comparten
  5 inicios de sesión por minuto, contando también los que entran bien. Con los
  consultorios actuales es aceptable. Si molesta, se sube `max`, no se quita el
  límite.
- **IPv6:** Better Auth agrupa por /64 (`ipv6Subnet` por defecto). Un cliente
  IPv6 y sus vecinos de /64 comparten cupo. Es lo deseado: impide rotar
  direcciones dentro del mismo /64.
- **Actualizaciones de Better Auth.** La 1.6 ya cambió cómo interpreta
  `x-forwarded-for`, y `^1.6.22` admite versiones menores nuevas. El script
  `verify-auth-rate-limit.ts` sirve para comprobarlo tras cada actualización.
- **Fuera de alcance, lo anoto:** `POST /invitations/set-password` crea la sesión
  con `auth.api.signInEmail`, que no pasa por el límite de Better Auth (lo
  protege el token de un solo uso). El `request.ip` de los logs de Fastify sigue
  mostrando la IP privada de platform (no hay `trustProxy`).

## Verificación

### Local y e2e

`NODE_ENV=test` desactiva el límite en e2e, y activarlo rompería la suite: todos
los inicios de sesión de la UI llegan como `127.0.0.1` y compartirían 5 por
minuto. Por eso la prueba se divide en dos.

**1. Script `api/verify-auth-rate-limit.ts` (límite real, sin servidor HTTP).**
Importa la instancia real de `auth` y llama a `auth.handler(new Request(...))`
contra `http://localhost/api/auth/...`, con cuerpo JSON. Se corre con
`NODE_ENV=production` para que el límite esté activo y no haya `127.0.0.1` de
respaldo, contra la base de e2e:

```bash
cd api && docker compose -f docker-compose.e2e.yml up -d
NODE_ENV=production EMAIL_DRIVER=ses DOTENV_CONFIG_PATH=.env.e2e pnpm exec tsx verify-auth-rate-limit.ts
```

`dotenv` no pisa variables ya definidas, así que `NODE_ENV` y `EMAIL_DRIVER`
de la línea de comandos ganan a `.env.e2e`. `EMAIL_DRIVER=ses` evita que la
fábrica de correo rechace `memory` fuera de `test`. El script no registra
usuarios, así que no envía correos. Debe imprimir OK o fallo por caso y salir
con código distinto de 0 si algo falla. Casos:

- a. 6 `POST /sign-in/email` con `x-real-ip: 203.0.113.10` y credenciales
  falsas: los 5 primeros no son 429 y el sexto es 429, con `X-Retry-After`
  entre 1 y 60.
- b. Con la misma `x-real-ip` y un `x-forwarded-for` distinto en cada petición:
  el sexto sigue en 429. Una cabecera inventada no evita el límite.
- c. Justo después, otra `x-real-ip: 203.0.113.11`: no es 429. Los cupos son por
  cliente, no uno compartido.
- d. 6 `POST /change-password` sin sesión con `x-real-ip: 203.0.113.12`: el
  sexto es 429. El límite corre antes de comprobar la sesión.
- e. `POST /sign-in/email` con sólo `x-forwarded-for: 198.51.100.1, 10.0.0.1`,
  sin `x-real-ip`: documenta el modo de fallo (cae en `no-trusted-ip`). Debe
  verse el aviso de Better Auth.

Las IPs son de los rangos de documentación (RFC 5737). Que platform no deja
pasar una `x-real-ip` inventada **no se puede probar en local**: no hay borde de
Railway (P1, P2).

**2. e2e `platform/e2e/api/security/fix-auth-rate-limit-ip.spec.ts`** (con el
límite desactivado, prueba qué IP se guarda):

- Iniciar sesión **a través de platform** (`PLATFORM_BASE_URL/api/auth/sign-in/email`)
  con `X-Real-IP: 203.0.113.25`: la última sesión del usuario tiene
  `ipAddress === "203.0.113.25"`. Prueba que el rewrite de Next reenvía la
  cabecera y que Better Auth la lee.
- Iniciar sesión a través de platform con sólo
  `X-Forwarded-For: 198.51.100.7, 10.0.0.1`: `ipAddress === "127.0.0.1"` (el
  respaldo de `test`), no `198.51.100.7`. Prueba que `x-forwarded-for` ya no se
  usa.
- CA-6 de set-password, endurecido: `ipAddress` no vacío.

**3. Comandos obligatorios:** `pnpm typecheck` y `pnpm check` en `api/` y
`platform/`, y la suite e2e completa (`pnpm test:e2e`).

**4. Navegador (local):** con 6 contraseñas malas no se puede probar, porque el
límite está desactivado fuera de `production`. Basta revisar en el código que el
login muestra el texto en español para el 429. El texto del caso (a) es la
respuesta que recibe el formulario.

### Producción (la hace el humano después de desplegar)

Ningún agente ni script toca producción. El humano, con su propia cuenta y
solo después de que CA-18 a CA-22 salgan bien en el entorno de prueba, hace las
comprobaciones CA-23 a CA-26.

1. Iniciar sesión normalmente en la app y comparar con la IP pública propia
   (por ejemplo, la que muestre un sitio "cuál es mi IP"):
   ```sql
   SELECT ip_address, created_at FROM session
   WHERE user_id = '<tu user id>' ORDER BY created_at DESC LIMIT 1;
   ```
   Esperado: tu IP pública. Ni vacía ni privada (`10.*`, `100.64.*`, `fd*`).
2. Unas horas o días después:
   ```sql
   SELECT count(*) FILTER (WHERE ip_address IS NULL OR ip_address = '') AS sin_ip,
          count(DISTINCT ip_address) AS ips_distintas,
          count(*) AS total
   FROM session WHERE created_at > '<fecha y hora del despliegue>';
   ```
   Esperado: `sin_ip = 0` y, si entraron varias personas desde lugares
   distintos, `ips_distintas > 1`. Si todas comparten una IP, el arreglo leyó la
   de un proxy: volvemos a un cupo único.
3. En los logs del servicio api en Railway, buscar *"Rate limiting could not
   determine a client IP"* después del despliegue. No debe aparecer.

`ip_address` es un dato personal: no lo copies en tickets ni en el PR.

## Pasos para el engineer

0. **No empieces sin la autorización del humano** del diff de `auth.ts` y sin
   respuesta a P1. Si P1 lleva a la alternativa del middleware, este plan se
   rehace.
1. Aplica en `auth.ts` exactamente el diff de «Requiere confirmación del
   humano». No cambies nada más de ese archivo.
2. `platform/src/lib/auth/session.ts`: lee `x-real-ip` de `await headers()` y
   agrégala a las cabeceras del `fetch` sólo si viene. Comentario: por qué (cupo
   propio de `get-session`; es la misma cabecera que pone el borde) y la regla
   para futuras llamadas del servidor a `/api/auth/*`.
3. `login-form.tsx`: rama para `error.status === 429` con el texto en español,
   antes del `error.message ?? ...`. `password-card.tsx`: cambia
   "unos segundos" por "un minuto".
4. Crea `api/verify-auth-rate-limit.ts` con los casos a–e. Sigue el estilo de
   `verify-scope.ts`: comentarios en español y sin `any`. `import "dotenv/config"`
   debe ser lo primero.
5. Crea `platform/e2e/api/security/fix-auth-rate-limit-ip.spec.ts`. Reutiliza
   los helpers de `e2e/support` (`createConfirmedUser` o `createOnboardedAdmin`,
   `getLatestSessionTrace`). Endurece CA-6 y agrega la fila al
   `platform/e2e/README.md`.
6. Corre `pnpm typecheck` y `pnpm check` en `api/` y `platform/`, el script del
   paso 4 y `pnpm test:e2e`. En el resumen final, di qué verificaste y que P1 y
   la comprobación de producción quedan pendientes.

## Criterios de aceptación

Leyenda: **[e2e]** lo cubre Playwright; **[script]** lo comprueba
`api/verify-auth-rate-limit.ts` (el único lugar fuera de Railway donde el límite
está activo); **[manual]** lo comprueba el engineer o el reviewer leyendo el
código o corriendo un comando; **[humano, post-despliegue]** lo hace el humano
después de desplegar, **primero en el entorno de Railway que no es producción**
y, sólo si todo sale bien ahí, en producción.

En e2e el api corre con `NODE_ENV=test`: el límite de Better Auth está apagado y
no se puede probar con Playwright. Por eso los 429 de la interfaz se prueban
simulando la respuesta del api, y el límite real, con el script.

### Qué IP se guarda

- **CA-1 [e2e]** Al iniciar sesión **a través de platform**
  (`/api/auth/sign-in/email`) con la cabecera `X-Real-IP: 203.0.113.25`, la
  sesión nueva del usuario se guarda con `ipAddress` igual a `203.0.113.25`.
- **CA-2 [e2e]** Al iniciar sesión a través de platform sólo con
  `X-Forwarded-For: 198.51.100.7, 10.0.0.1` (sin `X-Real-IP`), la sesión se guarda
  con `127.0.0.1` y nunca con `198.51.100.7`: `X-Forwarded-For` ya no se usa.
- **CA-3 [e2e]** La sesión que crea `POST /invitations/set-password` tiene
  `ipAddress` no vacío (CA-6 de `fix-invitation-set-password.spec.ts`, ahora con
  `toBeTruthy()`).
- **CA-4 [manual]** `getSession` de `platform/src/lib/auth/session.ts` reenvía
  la `x-real-ip` de la petición entrante sólo cuando viene, y no inventa otra si
  falta. `doFetch` y `getMe` no cambian.

### Límite de 5 intentos por minuto

- **CA-5 [script]** 6 inicios de sesión seguidos con credenciales falsas desde la
  misma IP: los 5 primeros no son 429 y el sexto es 429, con `X-Retry-After`
  entre 1 y 60.
- **CA-6 [script]** Cambiar `X-Forwarded-For` en cada intento, con la misma
  `X-Real-IP`, no evita el límite: el sexto sigue en 429.
- **CA-7 [script]** **El límite no es compartido:** justo después de que una IP
  llega al 429, un inicio de sesión desde otra IP no da 429.
- **CA-8 [script]** 6 `POST /change-password` seguidos desde una misma IP, sin
  sesión: el sexto es 429.
- **CA-9 [script]** Sin `X-Real-IP`, la petición cae en el cupo compartido
  (`no-trusted-ip`) y se ve el aviso de Better Auth *"Rate limiting could not
  determine a client IP"*. Queda documentado el modo de fallo.
- **CA-10 [script]** **Las demás rutas conservan su límite:** 4
  `POST /change-email` seguidos desde una IP nueva, sin sesión, en menos de 10 s:
  el cuarto es 429 (la regla por defecto de 3 cada 10 s sigue igual). Requiere un
  caso más en el script.
- **CA-11 [script]** El script imprime OK o fallo por caso y termina con código
  distinto de 0 si algún caso falla.
- **CA-12 [manual]** El cambio en `auth.ts` es exactamente el diff autorizado:
  `customRules` sólo tiene `/sign-in/email` y `/change-password`, no se tocan
  `enabled` ni el almacenamiento, y no cambian `api/src/plugins/auth.ts`,
  `policy.ts` ni `entitlements.ts`.
- **CA-13 [e2e]** La suite e2e completa pasa: registro, inicio y cierre de
  sesión, invitaciones y el resto de flujos que usan Better Auth funcionan igual
  que antes.

### Mensajes en español

- **CA-14 [e2e]** **Login:** si el api responde 429 al iniciar sesión (respuesta
  simulada con `page.route`), el formulario muestra "Hiciste varios intentos
  seguidos. Espera un minuto y vuelve a intentarlo." y no el texto en inglés de
  Better Auth. El usuario sigue en `/login` y puede volver a enviar el formulario.
- **CA-15 [e2e]** **Cambio de contraseña:** si el api responde 429 al cambiar la
  contraseña (respuesta simulada), el aviso dice "Hiciste varios intentos
  seguidos. Espera un minuto y vuelve a intentarlo." y el diálogo sigue abierto.
- **CA-16 [manual]** Los demás errores del login y del cambio de contraseña se
  muestran igual que hoy.

### Calidad

- **CA-17 [manual]** `pnpm typecheck` y `pnpm check` limpios en `api/` y
  `platform/`. No hay migración nueva. `platform/e2e/README.md` tiene la fila del
  spec nuevo.

### Después de desplegar, en el entorno que no es producción

Antes de empezar: el entorno de prueba tiene desplegada esta rama, y su api
**no** tiene dominio público, igual que producción. Necesitas tu computadora y
tu celular. Para ver la base de datos: en Railway, abre el servicio Postgres de
ese entorno, pestaña *Data* (o la consola SQL que uses).

`ip_address` es un dato personal: no lo copies en tickets, en el PR ni en chats.

- **CA-18 [humano, post-despliegue]** **Las IPs se guardan bien.**
  1. En la computadora, entra a un sitio como "cuál es mi IP" y anota la IP que
     muestra.
  2. Inicia sesión en la app de prueba desde la computadora.
  3. En el celular, **apaga el WiFi** (usa datos móviles) e inicia sesión con la
     misma cuenta u otra.
  4. En la base de datos, ejecuta:
     ```sql
     SELECT ip_address FROM session ORDER BY created_at DESC LIMIT 10;
     ```
  5. Esperado: las dos primeras filas tienen una IP escrita (no vacía), son
     **distintas** entre sí, y la de la computadora coincide con la que
     anotaste. Ninguna empieza por `10.`, `100.64.`, `192.168.`, `172.`, `fd`
     ni es `127.0.0.1` (esas son IPs internas, no de una persona).
- **CA-19 [humano, post-despliegue]** **Una IP inventada no se guarda ni salta
  el límite.** Es la prueba de la que depende toda la protección (P1).
  1. En una carpeta cualquiera, crea con el Bloc de notas un archivo
     `buena.json` con tu correo y tu contraseña reales del entorno de prueba:
     `{"email":"tu@correo.com","password":"tu-contraseña"}`. Crea otro,
     `mala.json`, igual pero con una contraseña incorrecta.
  2. Abre PowerShell en esa carpeta y ejecuta (cambia `<dominio>` por el de
     platform en el entorno de prueba, sin `https://` ni `/` final):
     ```powershell
     curl.exe -s -o NUL -w "%{http_code}`n" -X POST "https://<dominio>/api/auth/sign-in/email" -H "Content-Type: application/json" -H "Origin: https://<dominio>" -H "X-Real-IP: 203.0.113.99" --data "@buena.json"
     ```
     Debe imprimir `200`.
  3. Ejecuta el `SELECT` de CA-18. Esperado: la primera fila **no** es
     `203.0.113.99`; es tu IP real, la misma que anotaste en CA-18.
  4. Espera 2 minutos. Ejecuta 6 veces seguidas, en menos de un minuto, el mismo
     comando con `mala.json` y cambiando la IP inventada en cada vez
     (`203.0.113.1`, `203.0.113.2`, … `203.0.113.6`). Esperado: las 5 primeras
     imprimen `401` y **la sexta imprime `429`**. Inventar una IP distinta en
     cada intento no evita el límite.
  5. Borra `buena.json` y `mala.json`.
  6. **Si el paso 3 muestra `203.0.113.99` o el paso 4 no llega a `429`: no
     despliegues a producción** y avisa a Claude. Railway no está reemplazando la
     cabecera y hay que aplicar la alternativa de P1.
- **CA-20 [humano, post-despliegue]** **El sexto intento se bloquea, con el
  mensaje en español, y sólo para esa IP.**
  1. Espera 2 minutos desde la última prueba.
  2. En la computadora, abre el login, escribe tu correo y una contraseña
     incorrecta y pulsa "Entrar" 6 veces, en menos de un minuto.
  3. Esperado: los 5 primeros intentos muestran el error de credenciales de
     siempre; el sexto muestra "Hiciste varios intentos seguidos. Espera un
     minuto y vuelve a intentarlo."
  4. Enseguida, en el celular **con datos móviles**, inicia sesión con la
     contraseña correcta. Esperado: entra sin problema (el bloqueo es de la IP
     de la computadora, no de todos).
  5. Espera un minuto e inicia sesión en la computadora con la contraseña
     correcta. Esperado: entra.
- **CA-21 [humano, post-despliegue]** **El cambio de contraseña también se
  limita, en español.** Con la sesión iniciada, en "Mi perfil" intenta cambiar
  la contraseña 6 veces seguidas, en menos de un minuto, con una contraseña
  actual incorrecta. Esperado: las 5 primeras dicen "La contraseña actual no es
  correcta." y la sexta muestra el aviso "Hiciste varios intentos seguidos.
  Espera un minuto y vuelve a intentarlo."
- **CA-22 [humano, post-despliegue]** En Railway, abre los logs del servicio api
  del entorno de prueba y busca el texto `could not determine a client IP`
  desde la hora del despliegue. Esperado: no aparece.

### Después de desplegar, en producción

Sólo cuando CA-18 a CA-22 salieron bien en el entorno de prueba.

- **CA-23 [humano, post-despliegue]** Repite CA-18 en producción. Mira sólo las
  filas creadas después del despliegue. Esperado: IPs escritas, públicas y, si
  entraron varias personas, distintas entre sí. Si todas las filas nuevas tienen
  la misma IP, o una interna, avisa a Claude: todos volverían a compartir cupo.
- **CA-24 [humano, post-despliegue]** Repite los pasos 1 a 3 y 5 de CA-19 en
  producción (inicio de sesión con `X-Real-IP: 203.0.113.99` y tu contraseña
  correcta). Esperado: la sesión nueva tiene tu IP real, no `203.0.113.99`.
- **CA-25 [humano, post-despliegue]** Repite los pasos 1 a 3 de CA-20 en
  producción con tu cuenta. Esperado: el sexto intento muestra el mensaje en
  español. Hazlo desde una red donde no haya otras personas usando WizyDoc (no
  desde la red de una clínica): durante un minuto bloquea los inicios de sesión
  desde esa IP.
- **CA-26 [humano, post-despliegue]** Repite CA-22 en los logs del api de
  producción. Esperado: el aviso no aparece.

