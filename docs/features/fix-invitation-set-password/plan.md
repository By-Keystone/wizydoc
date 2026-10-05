# Fix: toma de cuenta en `POST /invitations/set-password`

Estado: **revisado por seguridad; listo para implementar tras confirmar
decisiones abiertas.** Opción B elegida. "Recuperar contraseña" es una feature
aparte, no parte de este arreglo.

Severidad: crítica. Permite que alguien sin sesión obtenga la sesión de un
médico invitado y lea agenda y fichas de pacientes (datos de salud).

---

## Objetivo

Que la única forma de fijar la primera contraseña de un usuario invitado sea
presentar el token secreto que se le envió por correo, de un solo uso, ligado a
ese usuario y con caducidad. Ninguna ruta pública acepta un `userId` para fijar
credenciales.

## Hallazgo (verificado leyendo código, no explotado)

1. `invite-user.usecase.ts:112` crea el `doctorProfile` en la misma transacción
   de la invitación, antes de que el médico tenga contraseña.
2. `GET /clinic/:clinicId/doctors` (`routes/clinic/public.ts`,
   `policy({ public: true })`) devuelve `u.id AS "userId"`
   (`infrastructure/postgres/queries/clinic/get-clinic-doctors.query.ts:9`). No
   filtra por membership activa ni por invitación aceptada: el médico invitado
   aparece desde el primer momento.
3. `POST /invitations/set-password` (`routes/user-invitation/index.ts:83-111`,
   `policy({ public: true })`) recibe `{ userId, password }`. Si el usuario no
   tiene `authAccount` con `providerId = "credential"`, crea uno con la
   contraseña del atacante, pone `confirmed = true` y `onboardingCompleted = true`
   y la ruta llama a `auth.api.signInEmail` y devuelve la cookie de sesión. No
   mira la invitación en absoluto: ni token, ni estado, ni caducidad.
4. La ruta está expuesta también en el dominio de platform por el rewrite
   `/api/invitations/:path*` de `platform/next.config.ts` y el patrón público
   `/^\/api\/invitations(\/|$)/` de `platform/src/middleware.ts`.

Además, `POST /:token/accept` devuelve el `userId`, y el frontend
(`accept-form.tsx:80`) lo reenvía a `set-password`: el diseño actual confía en
que el `userId` es secreto, y no lo es.

Defectos secundarios encontrados en los mismos archivos:

- `set-password` no valida longitud de contraseña en el servidor (sólo
  `minLength={8}` en el input).
- Comprobar-y-crear el `authAccount` no es atómico y `AuthAccount` no tiene
  `@@unique([userId, providerId])`: dos peticiones simultáneas pueden crear dos
  cuentas `credential`.
- Los tres `catch` de `routes/user-invitation/index.ts` hacen
  `reply.status(500).send(error)`: Fastify serializa el `message` del error
  (p. ej. de Prisma) al cliente.
- `accept-invitation` marca la invitación como aceptada **antes** de que el
  usuario fije la contraseña. Si abandona en ese paso, el token ya no sirve y
  no hay "recuperar contraseña": queda bloqueado (y hoy sólo puede entrar
  usando el agujero).
- Dos definiciones de "tiene contraseña": `accept` exige
  `providerId === "credential" && password`, `set-password` sólo `providerId`.
- `GET /:token` no mira `status`: una invitación `EXPIRED` con `expires_at`
  futuro (o con membership borrada) se da por válida.
- `signInEmail` se llama sin cabeceras (`index.ts:92-95`), así que la sesión
  queda con `ipAddress` y `userAgent` en `NULL`: no hay rastro de quién la abrió.
- El logger de Fastify (`server.ts:33-35`) registra la URL de cada petición, y
  `GET /invitations/<token>` y `POST /invitations/<token>/accept` llevan el
  token completo en la URL.

## Better Auth 1.6.22 (comprobado en `node_modules`)

Contexto para "recuperar contraseña" (feature siguiente) y para el modelo de
amenaza. Fuente: `dist/api/routes/password.mjs`, `dist/db/internal-adapter.mjs`,
`dist/api/rate-limiter/index.mjs`, `dist/api/middlewares/origin-check.mjs`,
`dist/db/schema.mjs`.

- `POST /api/auth/reset-password { token, newPassword }` consume el token en
  una transacción (un solo uso, descarta caducados) y, **si el usuario no tiene
  cuenta `credential`, la crea**. Sirve para desbloquear a los `ACCEPTED` sin
  contraseña cuando exista "recuperar contraseña". No marca `confirmed` ni
  inicia sesión.
- La definición de "tiene contraseña" de Better Auth es
  `providerId === "credential"` (sin mirar `password`). Este plan la adopta.
- Rate limit: activo sólo con `NODE_ENV=production`, en memoria por proceso.
  `/sign-in*` y `/sign-up*`: 3 cada 10 s; `/request-password-reset` y
  `/send-verification-email`: 3 cada 60 s. IP desde `x-forwarded-for`; si la
  cabecera trae más de una IP y no hay `trustedProxies`, todas las peticiones
  comparten un único cubo por ruta. Las llamadas en servidor
  (`auth.api.signInEmail`) no pasan por el rate limiter.
- `originCheck` se salta cuando no hay `ctx.request`, que es el caso de
  `auth.api.signInEmail` llamado desde la ruta aunque se le pasen `headers`.
- `parseUserInput` (usado por `sign-up/email` y `update-user`) sólo excluye
  campos con `input: false`. Ver "Hotfix aparte" más abajo.

---

## Opción elegida: B

Una sola operación pública que, con el token de invitación, acepta la
invitación y fija la contraseña de forma atómica. El token se sigue generando
como hoy (`randomBytes(32).toString("hex")`, 64 caracteres hex, 7 días).

Flujo nuevo:

1. `GET /invitations/:token` devuelve además `step: "set_password" | "login"`
   (calculado sin consumir nada).
2. `step = "set_password"`: la página muestra directamente el formulario de
   contraseña. `POST /invitations/set-password { token, password }` acepta,
   crea la credencial y devuelve la cookie de sesión.
3. `step = "login"` (usuario que ya tenía contraseña, invitado a otra sede):
   botón "Aceptar invitación" → `POST /invitations/:token/accept` → `/login`.

La opción A (delegar en `reset-password`) se descartó: obliga a crear tokens
con `internalAdapter.createVerificationValue` y el formato interno
`reset-password:<token>`, y la caducidad del token de Better Auth es global.

---

## Cambios por capa

### Prisma

Sin cambios de esquema ni migración. El token se vuelve de un solo uso con una
actualización condicional sobre `user_invitation`; la credencial única por
usuario, con un bloqueo de la fila del usuario (`SELECT ... FOR UPDATE`). La
restricción `@@unique([userId, providerId])` en `AuthAccount` queda como
decisión abierta 4.

### api

**`src/application/use-cases/user-invitation/pending-invitation.ts`** (crear)

Lo comparten los tres casos de uso de invitación (tres consumidores reales).
Exporta:

- `invitationTokenSchema = z.string().regex(/^[0-9a-f]{64}$/)`: el formato que
  genera `invite-user`. Un token mal formado se rechaza en validación, antes de
  tocar la base o calcular un hash.
- `INVALID_INVITATION_MESSAGE = "El enlace de invitación no es válido o ya expiró"`.
- `hasPasswordCredential(authAccounts: { providerId: string }[]): boolean` →
  `providerId === "credential"`. Única definición, igual a la de Better Auth.
- `claimPendingInvitation(token: string)`: debe llamarse dentro de una
  transacción.
  1. `userInvitation.updateMany` con
     `where: { token, status: "INVITED", acceptedAt: null, expiresAt: { gt: now }, membership: { deletedAt: null } }`
     y `data: { status: "ACCEPTED", acceptedAt: now }`.
  2. Si `count !== 1` → `BadRequest(INVALID_INVITATION_MESSAGE)`. En Postgres
     (READ COMMITTED) una segunda petición concurrente con el mismo token
     reevalúa el `WHERE` tras el commit de la primera y obtiene `count = 0`.
  3. Leer la invitación por `token` y devolver `invitation.membership.userId`.

**`src/application/use-cases/user-invitation/set-password.usecase.ts`** (modificar)

- Schema: `z.object({ token: invitationTokenSchema, password: z.string().min(8).max(128) })`.
  Desaparece `userId`. Zod descarta claves desconocidas: un `userId` en el
  cuerpo se ignora; sin `token` la petición da 400 de validación.
- `execute`:
  1. Hash con `(await auth.$context).password.hash(password)` **antes** de abrir
     la transacción, para no retener bloqueos durante el hash. El regex del
     token ya filtró la basura, así que el coste del hash sólo lo paga una
     petición con un token bien formado.
  2. `inTransaction`:
     1. `userId = await claimPendingInvitation(token)`.
     2. Bloquear al usuario: ``getClient().$queryRaw`SELECT id FROM "user" WHERE id = ${userId}::uuid FOR UPDATE` ``.
        Así dos invitaciones pendientes del mismo usuario (dos sedes, dos
        tokens) no pueden crear dos credenciales a la vez: la segunda espera
        al commit de la primera y ve su credencial.
     3. Leer `authAccount` del usuario **después** del bloqueo. Si
        `hasPasswordCredential` → `UnprocessableEntity("Ya tienes una contraseña. Inicia sesión para aceptar la invitación.")`.
        La transacción se revierte y el token no se consume.
     4. Crear `authAccount` `{ providerId: "credential", userId, accountId: userId, password: hash }`.
     5. `user.update({ where: { id: userId }, data: { confirmed: true, onboardingCompleted: true } })`.
     6. Devolver `{ accountId, email }`. El `email` sólo lo usa la ruta para el
        sign-in; no se envía al cliente.
- Se eliminan los `console.log`; el caso de uso no loguea nada.

**`src/application/use-cases/user-invitation/accept-invitation.usecase.ts`** (modificar)

- Params: `{ token: invitationTokenSchema }`.
- `inTransaction`: `claimPendingInvitation(token)`, leer `authAccount` del
  usuario; si **no** `hasPasswordCredential` →
  `UnprocessableEntity(SET_PASSWORD_FIRST_MESSAGE)` con
  `SET_PASSWORD_FIRST_MESSAGE = "Primero define tu contraseña desde el enlace de invitación"`
  y rollback: el token no se consume.
- Respuesta `{ step: "login" }`. **Se elimina `userId` de la respuesta.**
- Token inexistente, caducado, ya usado o con membership borrada: el 400
  genérico de `claimPendingInvitation` (antes 404/422/400 según el caso).

**`src/application/use-cases/user-invitation/verify-invitation-token.usecase.ts`** (modificar)

- Params: `{ token: invitationTokenSchema }`.
- Añadir a la respuesta `step: hasPasswordCredential(user.authaccounts) ? "login" : "set_password"`.
- Tratar como inválida una invitación con `status !== "INVITED"` o
  `membership.deletedAt` no nulo: `UnprocessableEntity` si está aceptada (como
  hoy), `BadRequest` en el resto. Se conservan los códigos 404/422/400 actuales:
  la página sólo distingue válida/ inválida y nadie puede enumerar tokens de
  256 bits.
- Se eliminan los `console.log`.

**`src/routes/user-invitation/index.ts`** (modificar)

- Las tres rutas siguen `policy({ public: true })`: el token es la credencial.
- `POST /set-password`:
  - `BadRequest` → 400 `{ message: INVALID_INVITATION_MESSAGE }`.
  - `UnprocessableEntity` → 422 `{ message: error.message }`.
  - Otro error → `request.log.error({ errName: error.name, errCode: error.code }, "[set-password]")`
    y 500 `{ message: "No se pudo configurar la contraseña" }`. Nunca el error
    entero: el de Prisma puede incluir los argumentos de la consulta (el
    token).
  - Tras el commit, `auth.api.signInEmail({ body, headers: fromNodeHeaders(request.headers), returnHeaders: true })`
    para que la sesión guarde `ipAddress` y `userAgent`. Si falla, la
    contraseña ya quedó guardada: se loguea `errName`/`errCode` y se responde
    200 `{ data: { accountId, isSignedIn: false } }` sin cookie. Si va bien,
    `{ data: { accountId, isSignedIn: true } }` con `set-cookie`.
- `POST /:token/accept`: `UnprocessableEntity` → 422 `{ message: error.message }`
  (hoy se traduce siempre a "User already accepted invitation");
  `BadRequest` → 400 `{ message: INVALID_INVITATION_MESSAGE }`; otro → 500
  genérico, mismo log.
- `GET /:token`: mantiene sus códigos; 500 genérico, mismo log.
- Quitar el `import { request } from "http"` sin uso.

**`src/server.ts`** (modificar)

- Añadir `serializers.req` al logger de Fastify, en producción y en desarrollo,
  que registre `method`, `url` con el token tapado y `remoteAddress`:
  `url.replace(/(\/invitations\/)[0-9a-f]{64}/, "$1[token]")`. No es
  `plugins/auth.ts`, `policy.ts` ni `entitlements.ts`: no requiere confirmación.

**`src/infrastructure/postgres/queries/clinic/get-clinic-doctors.query.ts`** y
**`src/application/queries/clinic/get-clinic-doctors.query.ts`** (modificar)

- Quitar `u.id AS "userId"` del `SELECT` y `userId` del tipo
  `IGetClinicDoctorsQueryResult`. Comprobado: nada en `platform/src` lee
  `ClinicDoctor.userId` y `web/` no consume este endpoint. Defensa en
  profundidad: B ya cierra el agujero sin esto.

Sin cambios en `api/src/plugins/auth.ts`, `policy.ts`, `entitlements.ts` ni en
`infrastructure/vendors/auth/better-auth/auth.ts`.

### platform

**`src/lib/api/invitations/index.ts`** (modificar): `InvitationDetails` añade
`step: InvitationStep` (el tipo ya existe en ese archivo).

**`src/app/(auth)/invite/accept/page.tsx`** (modificar): pasa `step` a
`AcceptInviteForm`.

**`src/app/(auth)/invite/accept/accept-form.tsx`** (modificar):

- Recibe `step` por props; desaparece `SetPasswordStage` y el estado con
  `userId`.
- `step === "set_password"`: formulario de contraseña desde el inicio; envía
  `{ token, password }` a `/api/invitations/set-password`. Si `isSignedIn` →
  `/account/${accountId}/select`; si no → `/login`.
- `step === "login"`: botón "Aceptar invitación" →
  `POST /api/invitations/:token/accept` → `/login`.

**`src/lib/api/doctors/types.ts`** (modificar): quitar `userId` de
`ClinicDoctor`.

Sin cambios en `next.config.ts` ni en `middleware.ts`.

El cambio de UI es mínimo (desaparece un paso; textos y estilos actuales). Si
el humano quiere mockup antes de implementar, se hace la Fase 2 sobre esta
pantalla.

### Archivos

| Acción | Ruta |
| --- | --- |
| Crear | `api/src/application/use-cases/user-invitation/pending-invitation.ts` |
| Modificar | `api/src/application/use-cases/user-invitation/set-password.usecase.ts` |
| Modificar | `api/src/application/use-cases/user-invitation/accept-invitation.usecase.ts` |
| Modificar | `api/src/application/use-cases/user-invitation/verify-invitation-token.usecase.ts` |
| Modificar | `api/src/routes/user-invitation/index.ts` |
| Modificar | `api/src/server.ts` |
| Modificar | `api/src/infrastructure/postgres/queries/clinic/get-clinic-doctors.query.ts` |
| Modificar | `api/src/application/queries/clinic/get-clinic-doctors.query.ts` |
| Modificar | `platform/src/lib/api/invitations/index.ts` |
| Modificar | `platform/src/app/(auth)/invite/accept/page.tsx` |
| Modificar | `platform/src/app/(auth)/invite/accept/accept-form.tsx` |
| Modificar | `platform/src/lib/api/doctors/types.ts` |

---

## Aislamiento entre cuentas

- `set-password` y `accept` no reciben ningún id de cuenta, recurso ni usuario.
  Reciben sólo el token; el usuario sale de `invitation → membership → user`
  (membership no borrada), y `accountId` de ese usuario.
- El token es de 256 bits aleatorios con índice único: no es adivinable ni
  enumerable.
- `GET /clinic/:clinicId/doctors` sigue público y sigue recibiendo sólo
  `clinicId`; deja de exponer `userId`.

---

## Modelo de amenaza

| Atacante | Hoy | Tras el arreglo |
| --- | --- | --- |
| **Sin sesión**, con el link público de reserva | Lee `userId` del listado y fija la contraseña de cualquier invitado sin credencial → sesión completa. | `set-password` exige token; el `userId` del cuerpo se ignora. El listado ya no da `userId`. |
| **Miembro de la misma cuenta** (ve `userId` de compañeros en listados internos) | Igual que arriba, contra compañeros invitados. | El `userId` no sirve en ninguna ruta pública. |
| **Token caducado, ya usado, inexistente, `EXPIRED` o con membership borrada** | El token ni se pedía. | `updateMany` condicional → `count = 0` → 400 con el mismo cuerpo. |
| **Reutilización / carrera** con el mismo token | Dos peticiones pueden crear dos credenciales. | Una sola gana la actualización condicional; las demás reciben 400. |
| **Carrera con dos invitaciones pendientes del mismo usuario** | Dos credenciales. | El `FOR UPDATE` sobre el usuario serializa: una crea la credencial, la otra ve que existe y recibe 422 con rollback (su invitación queda `INVITED` y se acepta por el paso "login"). |
| **Fuerza bruta del token** | n/a | 2^256 combinaciones. Las rutas de Fastify no tienen rate limit (no hay `@fastify/rate-limit`; instalarlo requiere confirmación) y no hace falta para este parche. |
| **Fuerza bruta de la contraseña** | — | Por `sign-in/email`: 3 intentos/10 s por IP en producción (ver Fuera de alcance sobre la IP). |
| **Enumeración por mensajes distintos** | `GET`/`accept` distinguen inexistente (404), aceptado (422) y caducado (400). | `set-password` y `accept` responden idéntico para todos los casos inválidos. `GET` conserva sus códigos: sólo informa a quien ya tiene un token, que no se puede enumerar. Los 422 ("ya tienes contraseña" / "primero define tu contraseña") sólo se alcanzan con un token válido. Un token mal formado da el 400 de validación de Zod, distinto del 400 genérico: sólo revela el formato, que es público. |
| **Token en logs** | `GET /invitations/<token>` y `POST /<token>/accept` quedan completos en el log de Fastify. | El serializador lo tapa en el log del api. Siguen fuera de control los logs del balanceador y del hosting de platform (`/invite/accept?token=...`): ver Fuera de alcance. |
| **Token en errores** | `send(error)` puede devolver el error de Prisma con los argumentos. | 500 genérico; el log sólo guarda `name` y `code`. |
| **Quien controla el buzón del invitado** | `POST /api/auth/send-verification-email { email }` envía un link de verificación a un usuario sin confirmar, y con `autoSignInAfterVerification: true` ese link abre sesión **sin contraseña y sin aceptar la invitación**. | Sin cambios. No es toma de cuenta: la sesión sólo la obtiene quien lee ese correo, el mismo que recibe el token de invitación. Se documenta como camino alternativo de entrada. |
| **Invitaciones pendientes en producción** | — | Ver "Datos existentes". |

## Invariantes

Tras el arreglo debe ser verdad:

1. Ninguna ruta pública acepta un `userId` (ni email) para crear o cambiar
   credenciales.
2. Fijar la primera contraseña exige un token de invitación con formato
   válido, existente, en estado `INVITED`, sin `acceptedAt`, con
   `expiresAt > now()` y con membership no borrada.
3. El token es de un solo uso: la misma transacción que crea la credencial lo
   pasa a `ACCEPTED`; si algo falla se revierte todo (ni credencial sin
   aceptar, ni aceptado sin credencial).
4. El usuario cuya credencial se fija es siempre `invitation.membership.userId`.
5. `set-password` y `accept` responden exactamente lo mismo (código y cuerpo)
   para token inexistente, caducado, ya usado, `EXPIRED` o con membership
   borrada.
6. Ningún endpoint público devuelve `userId` de otros usuarios
   (`GET /clinic/:clinicId/doctors`, `POST /invitations/:token/accept`).
7. Ninguna respuesta 500 de `routes/user-invitation` incluye el error original.
8. `accept` nunca consume la invitación de un usuario sin contraseña.
9. Un usuario tiene como máximo una cuenta `credential`, también con varias
   invitaciones pendientes en paralelo.
10. "Tiene contraseña" se decide en un solo sitio (`hasPasswordCredential`).
11. El token de invitación no aparece en los logs del api ni en ninguna
    respuesta de error.

## Datos existentes en producción

Tras desplegar el api:

- **`INVITED`, no caducadas:** el link del correo sigue funcionando con el flujo
  nuevo. Sin acción.
- **`INVITED`, caducadas o `EXPIRED`:** inválidas, como hoy. Reinvitar al mismo
  usuario a la misma sede choca con `@@unique([userId, resourceId])` en
  membership y `@@unique([userId, clinicId])` en `doctorProfile`. Ya pasa hoy.
- **`ACCEPTED` sin cuenta `credential`:** quedan bloqueados hasta que exista
  "recuperar contraseña" (decisión tomada 2). `set-password` y `accept` les
  responden 400; `GET` 422.
- **Cuentas ya tomadas:** antes de desplegar, el humano corre esta consulta en
  una transacción de solo lectura (o en una réplica). Devuelve sólo ids.

  ```sql
  BEGIN READ ONLY;

  SELECT a."userId" AS user_id,
         array_agg(DISTINCT ui.id) AS invitation_ids
  FROM "authAccount" a
  JOIN user_resource_membership m ON m.user_id = a."userId"
  JOIN user_invitation ui ON ui.membership_id = m.id
  WHERE a."providerId" = 'credential'
    AND a."createdAt" > ui.created_at
    AND (
      ui.accepted_at IS NULL
      OR a."createdAt" < ui.accepted_at
      OR a."createdAt" - ui.accepted_at > interval '15 minutes'
    )
  GROUP BY a."userId";

  ROLLBACK;
  ```

  Qué detecta: en el flujo legítimo la credencial se crea segundos después de
  aceptar. Credencial sin aceptar, antes de aceptar, o mucho después de
  aceptar (ataque contra un `ACCEPTED` sin contraseña) es sospechosa. El
  umbral de 15 minutos da falsos positivos (alguien que aceptó y volvió más
  tarde a la pestaña): cada fila se revisa a mano.

  Evidencia: las sesiones creadas por `set-password` tienen `ipAddress` y
  `userAgent` en `NULL` (se llamaba a `signInEmail` sin cabeceras), así que
  `session` no dice quién entró. La evidencia real está en los logs de acceso
  de Fastify (`server.ts:33-35`, `logger: true` en producción) y del
  balanceador: buscar `POST /invitations/set-password` y
  `POST /api/invitations/set-password` y cruzar con la fecha de creación de la
  credencial. Las sesiones duran 7 días desde la última actividad y Better
  Auth borra las caducadas, así que `session` puede no conservar nada de un
  ataque antiguo. Si hay filas: revocar las sesiones de esos usuarios y
  tratarlo como incidente con datos de salud (Ley 29733). No es parte del
  código del parche.

**Orden de despliegue:** primero `api-*` (cierra el agujero), después
`platform-*`. En la ventana entre ambos, el formulario viejo llama primero a
`accept`; para un invitado sin contraseña el api nuevo responde 422 "Primero
define tu contraseña desde el enlace de invitación" **sin consumir el token**,
y el formulario viejo muestra ese mensaje sin pasar a `set-password`. Tras el
despliegue de platform, el mismo link funciona. Los invitados con contraseña
no notan la ventana. Desplegar al revés dejaría el agujero abierto en la
ventana.

---

## Riesgos y decisiones

### Decisiones tomadas (4 de octubre de 2026)

1. **Opción B.** La invitación sigue siendo "clic en el correo y definir
   contraseña", pero el servidor exige el token del link. "Recuperar
   contraseña" es una feature aparte, con su propio ticket.
2. **Usuarios `ACCEPTED` sin contraseña esperan a "recuperar contraseña".**
   No se editan datos de producción a mano.

### Decisiones abiertas

3. **¿Se ejecuta la consulta de auditoría y la búsqueda en logs antes del
   despliegue?** Recomiendo sí; la debe correr el humano.
4. **`@@unique([userId, providerId])` en `AuthAccount`.** Con el bloqueo
   `FOR UPDATE` la aplicación ya impide duplicados; la restricción lo
   garantizaría también frente a otro código que escriba en la tabla, pero
   requiere migración sobre una tabla de Better Auth y comprobar duplicados
   antes. Recomiendo dejarla para después del hotfix.

### Hotfix aparte, inmediato (requiere confirmación del humano)

- **Campos de usuario modificables por el cliente.** En
  `api/src/infrastructure/vendors/auth/better-auth/auth.ts:36-42`, `accountId`,
  `role` y `onboardingCompleted` de `additionalFields` no tienen
  `input: false`. Verificado en `dist/db/schema.mjs` y
  `dist/api/routes/update-user.mjs`: `parseUserInput` sólo excluye campos con
  `input === false`, así que `POST /api/auth/update-user` y `POST /api/auth/sign-up/email`
  aceptan esos campos del cliente. Un usuario con sesión podría cambiar su
  propio `accountId` (el tenant que lee la política) o su `role`. Gravedad
  comparable a este hallazgo. Arreglo: `input: false` en los tres campos.
  Toca `auth.ts`: necesita confirmación explícita y va en su propio PR, no en
  este.

### Fuera de alcance (tickets aparte)

- **`POST /user/invite` no restringe por rol** (`policy({ account: true, confirmed: true, onboarded: true })`
  sin `roles`): cualquier miembro, incluido `USER` o `DOCTOR`, puede invitar a
  alguien como `ADMIN`. Prioridad alta.
- **Médicos invitados visibles en el booking antes de activar su cuenta**
  (punto 2 del hallazgo). Decisión de producto.
- **Tokens fuera del api:** la URL `/invite/accept?token=...` queda en los
  logs del hosting de platform y del balanceador, y el token se guarda en
  claro en `user_invitation.token`. Guardar un hash del token requiere
  migración e invalidaría las invitaciones pendientes.
- **Rate limit de Better Auth en producción:** en memoria y dependiente de que
  `x-forwarded-for` llegue con una sola IP; si no, un único cubo por ruta para
  toda la plataforma. Comprobar qué cabecera recibe el api en producción.
- **`console.log` con el correo en `infrastructure/vendors/auth/better-auth/auth.ts:57`**:
  loguear `user.id`. Puede ir en el mismo PR que el hotfix de `input: false`,
  que ya toca ese archivo.

### Recomendaciones de la revisión de seguridad

Incorporadas todas (4 a 10): serializador de logs y logs de error sin el
objeto entero, bloqueo `FOR UPDATE`, una sola definición de credencial,
mensaje propio para el 422 de `accept`, 200 sin cookie si falla el sign-in,
`membership.deletedAt` en el filtro, regex del token y hash fuera de la
transacción. Ninguna requiere migración, dependencias ni tocar archivos
protegidos.

---

## Verificación

Sin tests en el repo. El engineer debe ejecutar y pegar la salida de cada paso.
Todo contra la base local (nunca producción) y con SES de test o stub.

### Typecheck, lint y búsquedas

```bash
cd api && pnpm typecheck
cd platform && pnpm typecheck && pnpm lint
grep -rn "send(error)" api/src/routes/user-invitation      # vacío
grep -rn "console\." api/src/application/use-cases/user-invitation  # vacío
grep -rn "userId" platform/src/lib/api/doctors              # vacío
```

### Preparación

```bash
API=http://localhost:4000
WEB=http://localhost:3000
ORIGIN='Origin: http://localhost:3000'
JSON='Content-Type: application/json'
FAKE_TOKEN=$(openssl rand -hex 32)

curl -s -c admin.txt -H "$ORIGIN" -H "$JSON" -X POST $API/api/auth/sign-in/email \
  -d '{"email":"<admin local>","password":"<su contraseña>"}'

invite() {
  curl -s -b admin.txt -H "$ORIGIN" -H "$JSON" -X POST $API/user/invite \
    -d "{\"email\":\"$1\",\"name\":\"Lucía\",\"lastName\":\"Paredes\",\"phone\":\"987654321\",
         \"role\":\"DOCTOR\",\"resourceId\":\"$2\",\"specialtyIds\":[\"<specialtyId>\"]}"
}
invite lucia.paredes+a@example.com <clinicA>
```

Token e id de cada invitado (base local):

```sql
SELECT ui.token, ui.status, u.id, u.email FROM user_invitation ui
JOIN user_resource_membership m ON m.id = ui.membership_id
JOIN "user" u ON u.id = m.user_id
WHERE u.email LIKE 'lucia.paredes+%';
```

### El ataque ya no funciona

```bash
curl -s $API/clinic/<clinicA>/doctors | jq '.[0] | keys'
# esperado: sin "userId"

curl -si -H "$JSON" -X POST $API/invitations/set-password \
  -d '{"userId":"<id de A>","password":"Atacante2026"}'
# esperado: 400 de validación, sin set-cookie

curl -si -H "$JSON" -X POST $WEB/api/invitations/set-password \
  -d '{"userId":"<id de A>","password":"Atacante2026"}'
# esperado: 400 a través del rewrite de platform, sin set-cookie
```

Opcional, para confirmar el hallazgo: las mismas peticiones contra `main`
antes del cambio (hoy: `userId` presente, 200 y `set-cookie`). Sólo en local.

### Respuesta idéntica para token inválido

```bash
post_set_password() {
  curl -s -w "\n%{http_code}" -H "$JSON" -X POST $API/invitations/set-password \
    -d "{\"token\":\"$1\",\"password\":\"ClaveSegura2026\"}"
}
post_set_password $FAKE_TOKEN > inexistente.txt
```

Con invitaciones de prueba nuevas, en la base local:

- Caducada: `UPDATE user_invitation SET expires_at = now() - interval '1 day' WHERE token = '<token B>';`
  → `post_set_password <token B> > caducado.txt`.
- `EXPIRED` con fecha futura: `UPDATE user_invitation SET status = 'EXPIRED' WHERE token = '<token F>';`
  → `post_set_password <token F> > expired.txt`.
- Membership borrada: `UPDATE user_resource_membership SET deleted_at = now() WHERE id = (SELECT membership_id FROM user_invitation WHERE token = '<token G>');`
  → `post_set_password <token G> > borrada.txt`.
- Ya usado: ver "Camino feliz" → `usado.txt`.

```bash
for f in caducado expired borrada usado; do diff inexistente.txt $f.txt; done
# esperado: sin diferencias; 400 y el mismo cuerpo en todos

curl -s -w "\n%{http_code}" -X POST $API/invitations/$FAKE_TOKEN/accept
# esperado: el mismo cuerpo y código que inexistente.txt

curl -si -H "$JSON" -X POST $API/invitations/set-password \
  -d '{"token":"no-es-hex","password":"ClaveSegura2026"}'
# esperado: 400 de validación
```

### Camino feliz y un solo uso

```bash
curl -s $API/invitations/<token A> | jq .data.step       # "set_password"

curl -si -c lucia.txt -H "$JSON" -H "User-Agent: verificacion-qa" -X POST \
  $API/invitations/set-password -d '{"token":"<token A>","password":"ClaveSegura2026"}'
# esperado: 200, set-cookie, data = { accountId, isSignedIn: true }, sin email ni userId

post_set_password <token A> > usado.txt                   # 400 genérico

curl -s -b lucia.txt $API/user/me                         # responde con Lucía
```

```sql
SELECT status, accepted_at FROM user_invitation WHERE token = '<token A>';   -- ACCEPTED
SELECT count(*) FROM "authAccount" WHERE "userId" = '<id A>' AND "providerId" = 'credential';  -- 1
SELECT confirmed, onboarding_completed FROM "user" WHERE id = '<id A>';      -- true, true
SELECT "ipAddress", "userAgent" FROM session WHERE "userId" = '<id A>';      -- no nulos; userAgent = verificacion-qa
```

### `userId` ajeno en el cuerpo (invariante 4)

Con dos invitados sin contraseña, H y J:

```bash
curl -s -H "$JSON" -X POST $API/invitations/set-password \
  -d '{"token":"<token H>","userId":"<id J>","password":"ClaveSegura2026"}'
# esperado: 200
```

```sql
SELECT "userId" FROM "authAccount" WHERE "userId" IN ('<id H>', '<id J>') AND "providerId" = 'credential';
-- esperado: sólo <id H>
```

### Invitación `ACCEPTED` sin contraseña (dato heredado)

Simular el estado que deja el flujo actual con una invitación nueva K:

```sql
UPDATE user_invitation SET status = 'ACCEPTED', accepted_at = now() WHERE token = '<token K>';
```

```bash
curl -si -H "$JSON" -X POST $API/invitations/set-password \
  -d '{"userId":"<id K>","password":"Atacante2026"}'        # 400 de validación
post_set_password <token K>                                 # 400 genérico
curl -si $API/invitations/<token K>                         # 422
```

```sql
SELECT count(*) FROM "authAccount" WHERE "userId" = '<id K>';  -- 0
```

### `accept` no consume la invitación de quien no tiene contraseña (invariante 8)

```bash
curl -si -X POST $API/invitations/<token L>/accept
# esperado: 422 "Primero define tu contraseña desde el enlace de invitación"
```

```sql
SELECT status, accepted_at FROM user_invitation WHERE token = '<token L>';  -- INVITED, NULL
```

```bash
post_set_password <token L>     # esperado: 200
```

### Carrera con el mismo token

```bash
for i in 1 2 3 4 5; do
  curl -s -o /dev/null -w "%{http_code}\n" -H "$JSON" -X POST $API/invitations/set-password \
    -d '{"token":"<token C>","password":"ClaveSegura2026"}' &
done; wait
# esperado: un 200 y cuatro 400; count de credential = 1
```

### Carrera con dos invitaciones del mismo usuario (invariante 9)

Invitar al mismo correo nuevo a dos sedes de la cuenta (tokens M1 y M2):

```bash
invite lucia.paredes+m@example.com <clinicA>
invite lucia.paredes+m@example.com <clinicB>
post_set_password <token M1> & post_set_password <token M2> & wait
# esperado: un 200 y un 422 "Ya tienes una contraseña..."
```

```sql
SELECT count(*) FROM "authAccount" WHERE "userId" = '<id M>' AND "providerId" = 'credential';  -- 1
SELECT token, status FROM user_invitation WHERE token IN ('<token M1>', '<token M2>');
-- una ACCEPTED y otra INVITED
```

```bash
curl -s $API/invitations/<token de la INVITED> | jq .data.step   # "login"
curl -si -X POST $API/invitations/<token de la INVITED>/accept   # 200 {step:"login"}, sin userId
```

### Contraseña fuera de rango

```bash
curl -si -H "$JSON" -X POST $API/invitations/set-password \
  -d '{"token":"<token D>","password":"corta"}'
# esperado: 400 y el token D sigue INVITED
```

### Errores 500 sin fuga (Postgres parado)

```bash
docker stop wizydoc-db
curl -s -w "\n%{http_code}\n" $API/invitations/$FAKE_TOKEN
curl -s -w "\n%{http_code}\n" -X POST $API/invitations/$FAKE_TOKEN/accept
post_set_password $FAKE_TOKEN
docker start wizydoc-db
# esperado: 500 con el mensaje genérico en los tres; ninguna respuesta contiene
# "prisma", "Prisma", "PrismaClient", "connect" ni el token
```

### Logs

En la salida de `pnpm dev` del api, tras `curl -s $API/invitations/<token>`:
la línea de la petición muestra `/invitations/[token]`, no el token. Repetir
con `NODE_ENV=production pnpm dev` (logger sin `pino-pretty`) para comprobar
el serializador en ese modo.

### Navegador (`pnpm dev` en api y platform)

1. `http://localhost:3000/invite/accept?token=<token nuevo>`: aparece
   directamente "Configura una contraseña", sin paso intermedio.
2. Contraseña de 8+ caracteres → `/account/<id>/select` con sesión.
3. Recargar el mismo link → "Invitación inválida".
4. Link de un usuario con contraseña → "Aceptar invitación" → `/login`.
5. Booking público `http://localhost:3000/clinic/<clinicId>/create-appointment`:
   los médicos se listan y se puede reservar igual que antes.

### Qué no se puede verificar en local

- El rate limit de Better Auth (sólo con `NODE_ENV=production` y la IP real
  del balanceador).
- El camino `isSignedIn: false` (exige forzar un fallo de `signInEmail` tras el
  commit); se revisa leyendo el código.
- La consulta de auditoría y los logs sobre datos reales.
