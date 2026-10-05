# Fix: fuga de datos entre cuentas en `GET /user/by-email`

Estado: **revisado por seguridad** (4 de octubre de 2026). Sin bloqueantes;
implementable con las opciones recomendadas: búsqueda acotada, POST, y el
oráculo del invite en un ticket aparte. Las observaciones R1 a R8 de la revisión
están incorporadas. **Requisito de despliegue obligatorio:**
`fix-auth-user-fields-input` sale antes que este ticket o en la misma ventana
(ver "Orden de despliegue").

Severidad: **alta.** Cualquiera que se registre y complete el onboarding de una
cuenta Gratis propia obtiene nombre, apellido, teléfono, `accountId`, `role` y
estado de cualquier usuario de WizyDoc (médicos, recepción, administradores) de
**cualquier cuenta**, con sólo conocer su correo. Encadenado con el fallo de
`auth.ts`, le daba el `accountId` necesario para entrar en la cuenta víctima.

---

## Objetivo

Que la búsqueda por correo del formulario de invitar sólo pueda hacerla un
ADMIN de la sede a la que invita, que sólo encuentre usuarios de la cuenta de
esa sede y que devuelva sólo nombre, apellido y teléfono.

## Hallazgo (verificado leyendo código, no explotado)

1. `GET /user/by-email` (`api/src/routes/user/index.ts:162-190`) declara
   `policy({ account: true, confirmed: true, onboarded: true })`, sin `roles` ni
   `member`. Cualquier usuario con cuenta y onboarding completo puede usarla.
2. `GetUserByEmailQuery` (`api/src/application/queries/user/get-user-by-email.query.ts:16`)
   hace `client.user.findUnique({ where: { email } })`: sin filtro de cuenta y
   sin `select`. La ruta devuelve `{ user }` con la fila entera: `id`, `email`,
   `name`, `lastName`, `phone`, `role`, `confirmed`, `onboardingCompleted`,
   `createdAt`, `updatedAt`, `accountId`, `image`.
3. **Si el correo no existe responde `200 { "user": null }`, no 404.**
   `findUnique` devuelve `null` y no lanza `P2025` (eso lo hacen
   `findUniqueOrThrow` y `update`), así que la rama `P2025 → 404` de la ruta
   nunca se ejecuta. La ruta distingue para cualquier correo entre "existe en
   WizyDoc" (devuelve la fila) y "no existe" (`null`).
4. **El correo viaja en la URL** (`?email=`). El logger de Fastify
   (`server.ts:33-35`, `logger: true` en producción) registra la URL de cada
   petición: cada búsqueda deja el correo en el log del api y del balanceador.
5. El `catch` hace `console.error(..., error)` con el error entero.
6. La query vive con su implementación Prisma en `application/`, cuando debería
   estar en `infrastructure/postgres/queries/` (ver `api/AGENTS.md`).

### Qué usa el consumidor

Hay un único consumidor: el paso 1 del formulario de invitar
(`platform/src/components/clinic/invite-user/form.tsx`), a través de
`platform/src/lib/actions/user/lookup-user-by-email.action.ts`. Comprobado con
`grep`: nada más en `platform/src`, `web/src` ni `api/` llama a `/user/by-email`.

- El admin escribe un correo y pulsa "Continuar". Si el usuario existe, el
  paso 2 muestra "Ya tiene una cuenta — precargamos sus datos." y rellena
  **nombre, apellido y teléfono**; si no, muestra "Usuario nuevo — completa sus
  datos.".
- `id` sólo se usa como `key` de React para remontar los inputs al cambiar de
  usuario. `email` no se lee (el formulario ya tiene el correo).
- La acción es "suave": cualquier fallo (400, 403, 404, 500, sesión caducada)
  devuelve `null` y el formulario sigue como "Usuario nuevo".
- `POST /user/invite` **ignora** nombre, apellido y teléfono si el usuario ya
  existe en la cuenta (`invite-user.usecase.ts:74-85` reutiliza la fila). La
  precarga sólo sirve para que el admin confirme que es la misma persona.
- `POST /user/invite` rechaza con 422 un correo de otra cuenta
  (`invite-user.usecase.ts:76`). Precargar datos de un usuario de otra cuenta
  no sirve de nada: la invitación fallará igual.

**El formulario sólo necesita tres campos: `name`, `lastName` y `phone`.**

---

## Decisión de diseño

`GET /user/by-email` se sustituye por **`POST /clinic/:resourceId/users/lookup`**,
con `policy({ roles: ["ADMIN"] })`. La ruta nueva busca sólo en la cuenta de esa
sede y devuelve `{ user: { name, lastName, phone } | null }`.

- **Sólo un ADMIN de la sede (o de su organización)**, igual que en
  `GET /clinic/:resourceId/users` y en la regla de invitar de
  `fix-invite-role-check`: quien no puede invitar no tiene por qué buscar.
  `policy()` lo resuelve de forma declarativa porque el `resourceId` va en la
  URL, y el formulario ya lo conoce (es el `clinicId` de la ruta del modal).
  `policy()` también acepta el `resourceId` de una **organización** si se tiene
  membership ADMIN directa en ella. Es inocuo: la búsqueda se acota igual a la
  cuenta de ese recurso.
- **Sólo usuarios de la cuenta del recurso.** Un usuario de otra cuenta no puede
  invitarse (422), así que no hay nada que precargar. La respuesta es idéntica
  a la de un correo inexistente.
- **El `accountId` se toma del recurso, no de la sesión.** La consulta lee
  `resource.accountId` del recurso cuya membership ADMIN ya validó la política.
  Es defensa en profundidad, **no** una protección frente a un `accountId`
  falsificado: mientras siga abierto el fallo de `auth.ts`, quien falsifica su
  `accountId` puede conseguir una membership ADMIN real en la cuenta víctima
  (ver R1 en "Modelo de amenaza"), y entonces esta ruta buscaría allí. **La
  protección real es el orden de despliegue:** `fix-auth-user-fields-input`
  sale antes o en la misma ventana.
- **POST con el correo en el cuerpo**, para que el correo no quede en los logs
  de acceso de Fastify ni del balanceador (punto 4 del hallazgo). El
  serializador de `fix-invitation-set-password` sólo tapa tokens de
  invitación, no la query string.
- **`200 { "user": null }` tanto para "no existe" como para "es de otra
  cuenta"**, con el cuerpo idéntico byte a byte. Es una búsqueda, no un
  recurso: no hay ningún 404 que dar.
- **La ruta vieja se elimina**, no se deja en paralelo: ella es la fuga.

Se descarta:

- **Mantener `GET /user/by-email` y sólo acotarlo a `request.user.accountId`.**
  Haría falta menos cambio en platform, pero no se puede exigir ADMIN (no hay
  `:resourceId`) y el correo seguiría en los logs.
- **Eliminar la búsqueda y resolverlo en el propio invite** (formulario de un
  solo paso). Es la opción con menos código en api, pero el admin tendría que
  teclear nombre, apellido y teléfono de alguien que ya está en la cuenta, y el
  api los descartaría sin avisar (ver "Qué usa el consumidor"). Arreglar eso
  obliga a cambiar el formulario y el caso de uso, con Fase 2 y mockup.

### Oráculo de correos de `POST /user/invite`: sigue fuera de alcance

`fix-invite-role-check` lo dejó "fuera de alcance junto a `GET /user/by-email`".
Este ticket **no** lo cubre, por tres razones:

- **Es otro problema y pide otro arreglo.** Aquí se filtran datos personales
  (nombre, teléfono, `accountId`), y se corrige con un filtro y un `select`. El
  invite filtra un solo dato, si el correo tiene cuenta en otra clínica (422
  frente a 200), y además crea filas `user` para correos ajenos. Cerrarlo exige:
  - Decidir qué ve el admin cuando el invitado ya tiene cuenta en otro
    consultorio. Hoy un usuario sólo puede pertenecer a una cuenta
    (`User.accountId`). Responder 200 sin invitar rompe "el médico no coordina
    nada"; avisar al invitado por correo requiere una plantilla y un flujo
    nuevos.
  - No crear el `user` hasta que acepte la invitación. Eso cambia
    `UserResourceMembership.userId` y requiere migración.
  - Un rate limit, que hoy no existe en el api (no hay `@fastify/rate-limit`).

  Son decisiones de producto y de esquema; no caben en un hotfix.
- **Este ticket no lo empeora.** La búsqueda nueva no añade ningún oráculo:
  para un correo de otra cuenta responde igual que para uno inexistente. Lo
  que queda es el 422 del invite, y para provocarlo basta ser ADMIN de una
  sede propia, algo que consigue cualquiera que se registre.
- **No hay otro oráculo público que lo haga irrelevante.** `sign-up/email` de
  Better Auth 1.6.22 devuelve una respuesta genérica ante un correo duplicado,
  porque `requireEmailVerification` está en `true`
  (`dist/api/routes/sign-up.mjs:161-168`). Por eso el oráculo del invite
  merece su propio ticket y no conviene olvidarlo.

**Riesgo que ese ticket debe priorizar:** la fila `user` que crea el invite
para un correo ajeno deja ese correo "ocupado". Como `sign-up` responde de
forma genérica ante un duplicado, la persona real nunca podrá registrarse y no
sabrá por qué. Cualquier ADMIN puede hacérselo a cualquier correo.

Ticket propuesto: `fix-invite-email-oracle`.

---

## Cambios por capa

### Prisma

Sin cambios ni migración. `user.email` es `@unique`, así que la consulta
`{ email, accountId }` usa ese índice y sólo filtra `accountId` sobre una fila.
`resource` se lee por `id` (clave primaria).

### api

**`api/src/application/queries/user/get-user-by-email.query.ts`** → **borrar**.

**`api/src/application/queries/user/lookup-account-user.query.ts`** (crear)

Sólo los schemas y los tipos, como en `get-clinic-users.query.ts`:

```ts
export const lookupAccountUserParamsSchema = z.object({ resourceId: z.string() });
export const lookupAccountUserBodySchema = z.object({
  email: z.email({ error: "Correo inválido" }),
});
export type LookupAccountUserDto = { resourceId: string; email: string };
export type LookedUpAccountUser = { name: string; lastName: string; phone: string };
```

**`api/src/infrastructure/postgres/queries/user/lookup-account-user.query.ts`** (crear)

La carpeta `api/src/infrastructure/postgres/queries/user/` **no existe**: hay
que crearla.

`LookupAccountUserQuery.execute({ resourceId, email }): Promise<LookedUpAccountUser | null>`:

1. `getClient().resource.findUnique({ where: { id: resourceId }, select: { accountId: true } })`.
   Si no aparece → `null`. No debería pasar, porque la política ya encontró
   la membership.
2. `getClient().user.findFirst({ where: { email, accountId: resource.accountId }, select: { name: true, lastName: true, phone: true } })`.

El correo se compara tal cual, igual que en `invite-user.usecase.ts:74`, para
que la precarga refleje lo que hará el invite. Sin logs.

**`api/src/routes/clinic/index.ts`** (modificar: añadir una ruta junto a
`GET /clinic/:resourceId/users`)

```ts
app.post(
  "/clinic/:resourceId/users/lookup",
  {
    schema: {
      params: lookupAccountUserParamsSchema,
      body: lookupAccountUserBodySchema,
    },
    ...policy({
      account: true,
      confirmed: true,
      onboarded: true,
      roles: ["ADMIN"],
    }),
  },
  handler,
);
```

- Handler: `new LookupAccountUserQuery().execute({ resourceId, email })` →
  `reply.status(200).send({ user })`, donde `user` es el objeto de tres campos
  o `null`.
- `catch`: `request.log.error({ errName, errCode }, "[lookup-account-user]")` y
  `reply.internalServerError("Ocurrió un error al buscar el usuario")`. **No**
  loguear el error entero ni su `message`: los errores de Prisma llevan valores
  de la fila.
- Un comentario de una línea en la ruta que explique el porqué, no el qué:
  busca en toda la cuenta, no sólo entre los miembros de la sede, porque sirve
  para invitar a otra sede a alguien que ya está en la cuenta; y es POST para
  que el correo no quede en los logs de acceso.

**`api/src/routes/user/index.ts`** (modificar)

- Borrar el handler `GET /by-email` completo (líneas 162-190).
- Borrar los imports `GetUserByEmailQuery` y `getUserByEmailQueryParamsSchema`.
- **`PrismaClientKnownRequestError`: borrarlo sólo si nada más lo usa.** El
  `catch` nuevo de `POST /invite` que introduce `fix-invite-role-check` saca
  `errCode` del error y podría usar `instanceof PrismaClientKnownRequestError`.
  Antes de borrar el import, comprobar con
  `grep -n "PrismaClientKnownRequestError" api/src/routes/user/index.ts`
  (sobre la rama ya rebasada) que sólo aparece en el import.
- No tocar `POST /invite` ni ninguna otra ruta (las toca `fix-invite-role-check`).

Sin cambios en `policy.ts`, `plugins/auth.ts`, `entitlements.ts` ni
`vendors/auth/better-auth/auth.ts`.

### platform

**`platform/src/lib/actions/user/lookup-user-by-email.action.ts`** (modificar)

- Firma nueva: `lookupUserByEmailAction(clinicId: string, email: string)`.
- Llamada: `doFetchJson<{ user: LookedUpUser | null }>(`/clinic/${encodeURIComponent(clinicId)}/users/lookup`, { method: "POST", body: JSON.stringify({ email }) })`.
- Tipo: `LookedUpUser = { name: string; lastName: string; phone: string }`, sin
  `id` ni `email`.
- Se mantiene la búsqueda "suave": cualquier fallo devuelve `null`.

**`platform/src/components/clinic/invite-user/form.tsx`** (modificar)

- Nueva prop `clinicId: string`, que se pasa a `lookupUserByEmailAction(clinicId, value)`.
- Los `key` de nombre, apellido y teléfono dejan de usar `existingUser?.id`:
  `` key={`name-${existingUser ? email : "new"}`} `` (lo mismo para `lastName`
  y `phone`). Así se remontan al pasar de un usuario existente a otro.
- No cambia ningún texto ni elemento visible.

**`platform/src/components/clinic/invite-user/modal.tsx`** (modificar)

- Pasar `clinicId={clinicId}` a `<InviteUserForm>` (el modal ya lo lee de
  `useParams`).

### Archivos

| Acción | Ruta |
| --- | --- |
| Borrar | `api/src/application/queries/user/get-user-by-email.query.ts` |
| Crear | `api/src/application/queries/user/lookup-account-user.query.ts` |
| Crear (carpeta nueva) | `api/src/infrastructure/postgres/queries/user/lookup-account-user.query.ts` |
| Modificar | `api/src/routes/clinic/index.ts` (sólo añadir la ruta) |
| Modificar | `api/src/routes/user/index.ts` (sólo borrar `GET /by-email` y sus imports) |
| Modificar | `platform/src/lib/actions/user/lookup-user-by-email.action.ts` |
| Modificar | `platform/src/components/clinic/invite-user/form.tsx` |
| Modificar | `platform/src/components/clinic/invite-user/modal.tsx` |

---

## Aislamiento entre cuentas

- `:resourceId` (en la URL): `policy({ roles: ["ADMIN"] })` exige una
  membership ADMIN directa en ese recurso o heredada de su organización. Con
  una sede de otra cuenta o sin membership → 404; con membership pero sin rol
  ADMIN → 403. Es el mismo comportamiento que `GET /clinic/:resourceId/users`.
- `email` (en el cuerpo): sólo se busca entre los usuarios con
  `user.accountId = resource.accountId` de ese recurso. El `accountId` no viene
  del cliente ni de la sesión.
- Un ADMIN de la sede A ve nombre, apellido y teléfono de un usuario de la
  misma cuenta que sólo está en la sede B. Es intencional: invitarle a A es el
  caso de uso, y `POST /user/invite` ya reutiliza su fila dentro de la cuenta.
- Respuesta: sólo `name`, `lastName` y `phone`. Nunca `id`, `accountId`,
  `role`, `confirmed` ni `onboardingCompleted`.
- **Límite conocido del invariante 2:** `GetUserMembership`, que es lo que usa
  `policy()`, no filtra `deletedAt`. Una membership ADMIN "borrada" seguiría
  dando acceso a esta ruta. Hoy nadie escribe `deletedAt`, así que no es
  explotable; ya está recogido en `fix-invite-role-check/plan.md` ("Fuera de
  alcance", fila `deletedAt` ignorado). Cuando exista "quitar miembro", hay que
  corregirlo en `GetUserMembership` y no en esta ruta.
- **Dependencia de `request.user.accountId`:** esta ruta no lo usa para
  acotar, pero `policy()` sí resuelve las memberships, y esas memberships
  pueden haberse creado con un `accountId` falsificado mientras `auth.ts` siga
  abierto (ver R1). El aislamiento de esta ruta presupone que
  `fix-auth-user-fields-input` está desplegado.

## Modelo de amenaza

| Atacante | Hoy | Tras el arreglo |
| --- | --- | --- |
| **Cualquiera** se registra, hace el onboarding de una cuenta Gratis y busca el correo de un médico de otra cuenta | 200 con la fila entera: nombre, teléfono, `accountId`, `role`... | `GET /user/by-email` → 404 (la ruta ya no existe). En su propia sede, `POST .../users/lookup` → `200 { "user": null }`, igual que un correo inexistente. |
| Lo mismo, pero para saber si un correo existe en WizyDoc | `{ user: {...} }` frente a `{ user: null }` | Esta ruta ya no lo revela. **Lo sigue revelando el 422 de `POST /user/invite`** (fuera de alcance, ticket aparte). |
| **R1. Usuario con `accountId` falsificado** (fallo de `auth.ts`, **si aún no está desplegado** su arreglo) | Fila entera de cualquier cuenta | **No está protegido por este ticket.** `invite-user.usecase.ts:91-96` acota la sede con el `accountId` de la sesión y `:122-130` crea la membership con el `role` del cuerpo. Así, el atacante se autoinvita como ADMIN a una sede de la víctima (o crea una organización allí con `POST /organization`) y, desde ese momento, `lookup` sobre ese recurso busca en la cuenta víctima. La protección es el **orden de despliegue**: `fix-auth-user-fields-input` sale antes o en la misma ventana. Con él desplegado, `request.user.accountId` es fiable y este caso desaparece. |
| **Recepción (USER) o DOCTOR** de la cuenta busca a un compañero | 200 con la fila entera (teléfono incluido) | 403 en sus sedes, 404 en las demás. |
| **ADMIN de la sede A** busca con el `resourceId` de una sede B de su cuenta donde no es ADMIN | n/a | 403 o 404, según tenga o no membership en B. |
| **ADMIN de una organización** busca con el `resourceId` de la organización | n/a | 200, acotado a la cuenta de la organización. Inocuo. |
| **ADMIN de otra cuenta** con un `resourceId` de esta | n/a | 404. |
| **`resourceId` inexistente** | n/a | 404. |
| **Logs**: los correos buscados quedan en los logs de acceso | `?email=` en la URL de cada búsqueda | El correo va en el cuerpo; el log de error sólo lleva `errName`/`errCode`. |
| **Platform viejo contra api nuevo** (ventana de despliegue) | n/a | `GET /user/by-email` → 404; la acción devuelve `null` y el formulario sigue como "Usuario nuevo". La fuga ya está cerrada. Invitar sigue funcionando, porque el invite reutiliza al usuario existente. |
| **Platform nuevo contra api viejo** (si platform sale primero) | n/a | `POST /clinic/:resourceId/users/lookup` → 404; la acción devuelve `null`, así que la precarga no funciona. **No hay fuga nueva**, pero la vieja (`GET /user/by-email`) sigue abierta en el api hasta que se despliegue. |
| **Fuga ya ocurrida** | — | No se deshace. Ver "Logs de producción". |

## Invariantes

1. **`POST /clinic/:resourceId/users/lookup`** no devuelve datos de ningún
   `user` de una cuenta distinta de la del recurso cuya membership se validó.
   Excepción conocida fuera de esta ruta: el 422 de `POST /user/invite` sigue
   revelando que un correo existe en otra cuenta (sin datos personales; ticket
   aparte).
2. Esa misma ruta sólo responde 200 a quien tiene una membership ADMIN
   (directa o heredada) en `:resourceId`. Límite: no se mira `deletedAt` (ver
   "Aislamiento entre cuentas").
3. Su respuesta sólo contiene `user: null` o un `user` con exactamente `name`,
   `lastName` y `phone`.
4. Para un correo inexistente y para uno de otra cuenta, el código y el cuerpo
   son idénticos.
5. El correo buscado no aparece en la URL ni en ningún log de esa ruta.
6. `GET /user/by-email` no existe (404 de Fastify).
7. `POST /user/invite` y el resto de rutas no cambian de comportamiento.

## Relación con otros tickets

- **`fix-auth-user-fields-input`. Requisito obligatorio:** sale antes que este
  ticket o en la misma ventana de despliegue. Sin él, el aislamiento de esta
  ruta no se sostiene (R1).
- **`fix-invite-role-check`.** Comparte el archivo `api/src/routes/user/index.ts`:
  aquel cambia el `catch` de `POST /invite`; este borra `GET /by-email` y sus
  imports. El conflicto de texto en el bloque de imports es trivial; aun así,
  antes de borrar `PrismaClientKnownRequestError`, comprobar que el `catch`
  nuevo no lo usa (ver api). Van en PRs separados y quien llegue segundo
  rebasa. Ambos aplican la misma regla: sólo un ADMIN de la sede (o de su
  organización) invita y busca. Mientras `fix-invite-role-check` no esté
  desplegado, el caso R1 es más fácil de explotar (la autoinvitación no exige
  ser ADMIN), y por eso el orden con `auth.ts` es obligatorio.
- **`fix-invitation-set-password`.** No comparten archivos. Su serializador de
  `req` en `server.ts` sólo tapa tokens; este ticket no depende de él porque
  saca el correo de la URL.
- **Ticket nuevo `fix-invite-email-oracle`:** oráculo 422/200 del invite y
  filas `user` que ocupan correos ajenos.

## Orden de despliegue

1. **`fix-auth-user-fields-input`**: obligatorio antes que este o en la misma
   ventana.
2. **Este arreglo, api** (release `api-*`). Cierra la fuga en cuanto sale.
   Hasta el paso 3, la precarga del formulario no funciona (siempre muestra
   "Usuario nuevo"), pero invitar sí.
3. **Este arreglo, platform** (release `platform-*`), justo después.

Si platform saliera primero, la precarga quedaría rota igual (el api viejo no
tiene la ruta nueva) y la fuga seguiría abierta más tiempo. Por eso va
primero el api.

## Logs de producción (lo decide y lo hace el humano)

Los logs de acceso de Fastify y del balanceador contienen cada
`GET /user/by-email?email=...`. Son a la vez **evidencia** de la fuga y **datos
personales** que hay que custodiar. Para el análisis del incidente (Ley 29733),
buscar esas URLs y cruzar la cuenta del correo buscado con la de quien buscó
(por sesión o IP, si el log lo permite). El plan de `fix-auth-user-fields-input`
ya incluye esta búsqueda en su remediación; no se duplica aquí.

---

## Decisiones (cerradas en la revisión de seguridad)

1. Búsqueda acotada, sin eliminar el paso 1 del formulario.
2. POST con el correo en el cuerpo.
3. El oráculo de `POST /user/invite` va en un ticket aparte
   (`fix-invite-email-oracle`), con prioridad para la ocupación de correos
   ajenos.

Siguen fuera de alcance, ya existentes y sin impacto de seguridad:

- En el paso 2 del formulario, los campos precargados son editables, pero el
  api ignora los cambios para un usuario que ya existe.
- El correo no se normaliza a minúsculas en el invite (Better Auth sí lo hace
  al registrarse).
- El invite valida el correo con `z.string()` y el lookup con `z.email()` (ver
  "Navegador", paso 7).

---

## Verificación

No hay tests en el repo. El engineer ejecuta cada paso y pega la salida. Todo
se hace contra la base local.

### Typecheck, lint y búsquedas

```bash
cd api && pnpm typecheck
cd platform && pnpm typecheck && pnpm lint
grep -rn "by-email\|GetUserByEmailQuery\|P2025" api/src platform/src   # vacío
# La carpeta es nueva: si no existe, grep falla y parecería "vacío". Comprobar primero.
ls api/src/infrastructure/postgres/queries/user/lookup-account-user.query.ts   # existe
grep -rn "console\." api/src/infrastructure/postgres/queries/user              # vacío
grep -n "PrismaClientKnownRequestError" api/src/routes/user/index.ts           # sólo si lo usa el catch de POST /invite
```

### Preparación

Se reutiliza la de `fix-invite-role-check`: cuenta 1 con `admin.qa@example.com`
(ADMIN de la organización `ORG`), sedes **A** y **B**, `recepcion.qa` (USER en
A), `doctor.qa` (DOCTOR en A) y `adminsede.qa` (ADMIN sólo de A); cuenta 2 con
`otro.admin@example.com` y la sede **Z**. Se usan las mismas funciones `login`
y las variables `API`, `ORIGIN`, `JSON`, `A`, `B`, `Z` y `ORG`.

Arrancar el api guardando el log para revisarlo al final:

```bash
cd api && pnpm dev 2>&1 | tee api-local.log
```

```bash
lookup() {  # $1 cookie, $2 resourceId, $3 email
  curl -s -w "\n%{http_code}\n" -b "$1.txt" -H "$ORIGIN" -H "$JSON" \
    -X POST $API/clinic/$2/users/lookup -d "{\"email\":\"$3\"}"
}
```

### Confirmar el hallazgo (opcional, sobre `main` antes del cambio)

```bash
curl -s -b otro.txt "$API/user/by-email?email=recepcion.qa@example.com" | jq
# hoy: 200 con la fila entera de un usuario de la cuenta 1, accountId incluido
curl -s -w "\n%{http_code}\n" -b otro.txt "$API/user/by-email?email=no-existe.qa@example.com"
# hoy: 200 {"user":null} (no 404)
```

### Ruta vieja eliminada

```bash
curl -s -o /dev/null -w "%{http_code}\n" -b otro.txt "$API/user/by-email?email=recepcion.qa@example.com"
# esperado: 404
```

### Camino feliz

```bash
lookup admin $A recepcion.qa@example.com
# esperado: 200 {"user":{"name":"...","lastName":"...","phone":"..."}}
lookup admin $A recepcion.qa@example.com | head -1 | jq '.user | keys'
# esperado: ["lastName","name","phone"]
lookup adminsede $A doctor.qa@example.com      # 200 con usuario (ADMIN directo de la sede)
lookup admin $B recepcion.qa@example.com       # 200 con usuario (misma cuenta, otra sede)
lookup admin $ORG recepcion.qa@example.com     # 200 con usuario (resourceId de organización, ADMIN directo)
lookup admin $ORG otro.admin@example.com       # 200 {"user":null} (acotado a la cuenta 1)
```

### Otra cuenta = inexistente

```bash
lookup admin $A no-existe.qa@example.com  > inexistente.txt
lookup admin $A otro.admin@example.com    > otra-cuenta.txt
diff inexistente.txt otra-cuenta.txt        # sin diferencias: 200 {"user":null}

lookup otro $Z recepcion.qa@example.com     # 200 {"user":null}
lookup otro $A recepcion.qa@example.com     # 404 (sede de otra cuenta)
lookup admin 00000000-0000-7000-8000-000000000000 recepcion.qa@example.com   # 404 (resourceId inexistente)
```

### Roles

```bash
lookup recepcion $A admin.qa@example.com    # 403
lookup doctor    $A admin.qa@example.com    # 403
lookup adminsede $B admin.qa@example.com    # 404 (sin membership en B)
curl -s -o /dev/null -w "%{http_code}\n" -H "$ORIGIN" -H "$JSON" \
  -X POST $API/clinic/$A/users/lookup -d '{"email":"recepcion.qa@example.com"}'   # 401
lookup admin $A no-es-un-correo             # 400
```

### Defensa en profundidad del `accountId` (sólo base local)

Esto **no** reproduce R1. Sólo comprueba que la consulta acota por la cuenta
del recurso y no por la de la sesión:

```sql
UPDATE "user" SET account_id = '<accountId de la cuenta 1>' WHERE email = 'otro.admin@example.com';
```

```bash
lookup otro $Z recepcion.qa@example.com     # esperado: 200 {"user":null}
lookup otro $A recepcion.qa@example.com     # esperado: 404
```

```sql
UPDATE "user" SET account_id = '<accountId de la cuenta 2>' WHERE email = 'otro.admin@example.com';
```

### Logs

```bash
grep -n "recepcion.qa\|doctor.qa\|no-existe.qa\|otro.admin\|admin.qa" api-local.log
```

No se excluye ninguna línea, tampoco las de login. Lo esperado es que el
correo **no** aparezca en ninguna línea de `/clinic/.../users/lookup`. Si
aparece en alguna línea, aunque sea de `/api/auth`, revisarla una a una y
anotar de dónde viene. Las de `/api/auth` no son de este ticket, pero deben
quedar registradas.

### Navegador

Con api y platform en local, como `admin.qa@example.com`:

1. Sedes → Sede Larco → Usuarios → "Invitar usuario".
2. Correo `recepcion.qa@example.com` → "Continuar": aparece "Ya tiene una
   cuenta — precargamos sus datos." con nombre, apellido y teléfono rellenos.
3. "Cambiar" → `doctor.qa@example.com` → "Continuar": los tres campos cambian a
   los datos del doctor (comprueba los `key`).
4. "Cambiar" → `otro.admin@example.com` → "Continuar": "Usuario nuevo —
   completa sus datos." con los campos vacíos. Rellenar y enviar: toast de
   error del 422 ("Ya existe una cuenta con este correo en otra cuenta" si
   `fix-invite-role-check` ya está desplegado; si no, el mensaje genérico).
5. "Cambiar" → `nuevo.qa@example.com`: "Usuario nuevo"; enviar → toast
   "Invitación enviada".
6. En el log del api sólo aparece `POST /clinic/<A>/users/lookup`, sin correos.
7. **Diferencia de validación conocida:** el formulario sólo comprueba que haya
   un `@`, la acción de invitar usa `z.string().email()` y el api del invite
   usa `z.string()`. En cambio, el lookup usa `z.email()`, que es más estricto.
   Con un correo que pase el formulario pero no `z.email()` (por ejemplo
   `ana@clinica`), el lookup responde 400 y el formulario muestra "Usuario
   nuevo" aunque esa fila exista en la cuenta. Anotar lo que pase y
   comprobar en el log del api que fue un 400. No se corrige en este ticket.

Sin cambio visible en la UI: **no hay Fase 2 ni mockup.**

## Criterios de aceptación

Actores: **administrador** de la cuenta 1 (ADMIN de la organización, con sedes
A y B), **administrador de sede** (ADMIN sólo de A), **recepción** (USER en A),
**médico** (DOCTOR en A), **miembro de otra cuenta** (ADMIN de la cuenta 2 con
la sede Z) y **atacante sin sesión**.

### Lo que deja de ser posible

1. **CA-1** `[e2e]` Dado un miembro de otra cuenta con sesión, cuando pide
   `GET /user/by-email?email=<correo de recepción de la cuenta 1>`, entonces
   la petición es rechazada y no recibe ningún dato del usuario. (El API
   responde 401 a toda ruta inexistente por el hook global de `policy`.)
2. **CA-2** `[e2e]` Dado un miembro de otra cuenta, cuando busca desde su sede
   Z (`POST /clinic/<Z>/users/lookup`) el correo de recepción de la cuenta 1,
   entonces recibe `200 {"user":null}`.
3. **CA-3** `[e2e]` Dado un miembro de otra cuenta, cuando busca con el
   `resourceId` de la sede A de la cuenta 1, entonces recibe 404.
4. **CA-4** `[e2e]` Dada recepción o el médico de la sede A, cuando buscan el
   correo del administrador con el `resourceId` de A, entonces reciben 403.
5. **CA-5** `[e2e]` Dado el administrador de sede (sólo de A), cuando busca
   con el `resourceId` de la sede B, donde no tiene membership, entonces
   recibe 404.
6. **CA-6** `[e2e]` Dado un atacante sin sesión, cuando llama a
   `POST /clinic/<A>/users/lookup`, entonces recibe 401.
7. **CA-7** `[e2e]` Dado el administrador, cuando busca con un `resourceId`
   que no existe, entonces recibe 404.
8. **CA-8** `[e2e]` Dado el administrador, cuando busca con el `resourceId` de
   su organización el correo del miembro de otra cuenta, entonces recibe
   `200 {"user":null}`.
9. **CA-9** `[e2e]` Dado un miembro de otra cuenta cuyo `account_id` se cambia
   en la base local al de la cuenta 1, cuando busca desde su sede Z el correo
   de recepción de la cuenta 1, entonces recibe `200 {"user":null}`, y con el
   `resourceId` de A recibe 404 (la búsqueda se acota por la cuenta de la sede,
   no por la de la sesión).
10. **CA-10** `[e2e]` Dado el administrador, cuando busca un texto que no es
    un correo, entonces recibe 400.

### Lo que no debe filtrarse

11. **CA-11** `[e2e]` Dado el administrador, cuando busca desde la sede A un
    correo que no existe en WizyDoc y luego el correo del miembro de otra
    cuenta, entonces ambas respuestas tienen el mismo código y el mismo cuerpo
    byte a byte (`200 {"user":null}`).
12. **CA-12** `[e2e]` Dado el administrador, cuando busca un usuario de su
    cuenta, entonces el `user` de la respuesta tiene exactamente `name`,
    `lastName` y `phone`, y nunca `id`, `email`, `accountId`, `role`,
    `confirmed` ni `onboardingCompleted`.
13. **CA-13** `[e2e]` Dado el administrador en el navegador, cuando busca un
    correo en el formulario de invitar, entonces la única petición de búsqueda
    es un `POST` a `/clinic/<A>/users/lookup` y el correo no aparece en la URL
    de ninguna petición.
14. **CA-14** `[manual]` Dado el api local con su log guardado, cuando se
    ejecutan todas las búsquedas de la verificación, entonces ningún correo
    buscado aparece en una línea de `/clinic/.../users/lookup`, y las líneas de
    `/api/auth` donde aparezca un correo quedan anotadas.

### Lo que debe seguir funcionando

15. **CA-15** `[e2e]` Dado el administrador en el navegador, en Sedes → sede A
    → Usuarios → "Invitar usuario", cuando escribe el correo de recepción y
    pulsa "Continuar", entonces ve "Ya tiene una cuenta — precargamos sus
    datos." con nombre, apellido y teléfono rellenos.
16. **CA-16** `[e2e]` Dado ese mismo formulario, cuando pulsa "Cambiar", escribe
    el correo del médico y pulsa "Continuar", entonces los tres campos muestran
    los datos del médico y no los de recepción.
17. **CA-17** `[e2e]` Dado el administrador, cuando busca con el `resourceId`
    de la sede B a recepción (que sólo está en A), y con el de su organización,
    entonces recibe en ambos casos 200 con sus datos; y el administrador de
    sede, buscando al médico desde A, también.
18. **CA-18** `[e2e]` Dado el administrador en el navegador, cuando escribe el
    correo del miembro de otra cuenta, entonces ve "Usuario nuevo — completa
    sus datos." con los campos vacíos, y al enviar la invitación ve un toast de
    error (el 422 del invite no cambia).
19. **CA-19** `[e2e]` Dado el administrador en el navegador, cuando escribe un
    correo que no existe, ve "Usuario nuevo", completa los datos y envía,
    entonces ve el toast "Invitación enviada".

### Tras desplegar en producción (lo hace el humano)

20. **CA-20** `[manual]` Dado que el api de este arreglo se despliega después
    de `fix-auth-user-fields-input` o en la misma ventana, y antes que
    platform, cuando el humano revisa el orden de los releases, entonces se
    cumple ese orden.
21. **CA-21** `[manual]` Dado el api nuevo desplegado y platform todavía
    viejo, cuando un administrador invita a alguien que ya está en su cuenta,
    entonces el formulario muestra "Usuario nuevo" pero la invitación se envía
    y reutiliza al usuario existente.
22. **CA-22** `[manual]` Dado el api desplegado en producción, cuando una
    persona con sesión de cualquier cuenta pide `GET /user/by-email`, entonces
    la petición es rechazada (401) y no recibe ningún dato.

### Preguntas para el humano

- **Correos en los logs de producción.** Los logs ya contienen cada correo
  buscado por `GET /user/by-email`. El plan los trata como evidencia, pero no
  dice cuánto se guardan ni si se purgan tras el análisis. Recomiendo fijar un
  plazo de retención y purgar después; validarlo con el abogado (Ley 29733).
- **Precarga editable que se ignora.** El administrador puede corregir el
  teléfono precargado de un usuario existente y el api lo descarta sin avisar.
  No es de seguridad, pero hace creer que se guardó. ¿Lo mostramos como sólo
  lectura en un ticket aparte?
- **Correo válido para el formulario pero no para la búsqueda** (`ana@clinica`).
  El administrador ve "Usuario nuevo" para alguien que ya está en su cuenta.
  ¿Se alinea la validación del formulario con la del api en un ticket aparte?
- **Prioridad de `fix-invite-email-oracle`.** Cualquier ADMIN puede "ocupar"
  el correo de un médico que aún no usa WizyDoc y ese médico no podrá
  registrarse ni sabrá por qué. Choca con el foco en el médico independiente
  que llega solo: recomiendo programarlo justo después de estos arreglos.
