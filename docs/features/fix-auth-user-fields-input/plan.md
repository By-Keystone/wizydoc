# Fix: `accountId`, `role` y `onboardingCompleted` escribibles desde el cliente en Better Auth

Estado: **revisado por seguridad.** El cambio de código está aprobado por la
revisión; quedan abiertas decisiones sobre la remediación de datos (ver
"Riesgos y decisiones abiertas"), que no bloquean el despliegue.

Severidad: **crítica.** Cualquiera que se registre con un correo propio y
conozca el correo de un médico puede entrar en la cuenta (tenant) de ese
médico. Datos de salud en juego.

Autorización: el humano autorizó de forma explícita modificar
`api/src/infrastructure/vendors/auth/better-auth/auth.ts` (archivo protegido en
`AGENTS.md`) para este arreglo. No se tocan `plugins/auth.ts`, `policy.ts` ni
`entitlements.ts`.

---

## Objetivo

Que ningún endpoint de Better Auth expuesto acepte del cliente `accountId`,
`role` ni `onboardingCompleted`, y que quien ya los manipuló quede fuera de la
cuenta ajena. Esos campos sólo los escribe el servidor por Prisma
(onboarding, invitaciones).

## Hallazgo (verificado leyendo código, no explotado)

Better Auth 1.6.22 (versión resuelta en `api/node_modules` y en
`platform/node_modules`).

1. `auth.ts:34-43` declara en `user.additionalFields` `lastName`, `phone`,
   `role`, `onboardingCompleted` y `accountId`, ninguno con `input: false`.
2. `dist/db/schema.mjs` → `parseInputData`: recorre los campos de entrada y
   sólo rechaza los que tienen `input === false`. En modo entrada,
   `getFields(options, "user", "input")` devuelve **sólo** los
   `additionalFields` (el esquema base `coreSchema` es `{}` fuera del modo
   `output`).
3. `dist/api/routes/update-user.mjs` (`POST /api/auth/update-user`, requiere
   sesión): separa `name` e `image`, rechaza `email`, y pasa el resto por
   `parseUserInput(..., "update")` → `internalAdapter.updateUser`. Hoy acepta
   `accountId`, `role` y `onboardingCompleted`.
4. `dist/api/routes/sign-up.mjs` (`POST /api/auth/sign-up/email`, público):
   separa `name, email, password, image, callbackURL, rememberMe`, pasa el
   resto por `parseUserInput(..., "create")` y crea el usuario con
   `...additionalUserFields, emailVerified: false`. Hoy acepta los mismos tres
   campos al registrarse.
5. `api/src/plugins/auth.ts:42-47` construye `request.user.accountId` y
   `request.user.role` desde `session.user`. `policy({ account: true })` y
   todas las consultas multi-tenant (`GET /patients`, `GET /clinic`,
   `POST /organization`, `POST /user/invite`, ...) usan ese `accountId`.
   `policy({ onboarded: true })` lee `user.onboardingCompleted` de la base,
   que el atacante también controla.
6. **El `accountId` de la víctima no es secreto.** `GET /user/by-email`
   (`api/src/routes/user/index.ts:162-190`, `policy({ account, confirmed, onboarded })`,
   sin roles) llama a `client.user.findUnique({ where: { email } })`
   (`application/queries/user/get-user-by-email.query.ts:16`) sin acotar a la
   cuenta y devuelve la fila `user` completa, con `accountId`.

### Cadena de ataque

1. Registrarse con un correo propio (`POST /api/auth/sign-up/email`) y
   confirmarlo.
2. Onboarding de una cuenta Gratis propia (`POST /account`), para pasar
   `account + onboarded`.
3. `GET /user/by-email?email=<correo del médico víctima>` → `accountId`.
4. `POST /api/auth/update-user { "accountId": "<víctima>", "onboardingCompleted": true }`.
   Variante sin pasos 2-3 si ya conoce el id: `sign-up/email` con
   `accountId` y `onboardingCompleted` en el cuerpo.
5. Desde ese momento opera dentro de la cuenta de la víctima. No hay caché de
   sesión (ver más abajo): el cambio surte efecto en la siguiente petición.

### Qué alcanza dentro de la cuenta víctima (hoy)

- `GET /clinic`: todas las sedes de la cuenta (sólo pide `account`).
- `POST /organization`: crea una organización y queda ADMIN de ella dentro de
  la cuenta víctima.
- `POST /user/invite` (sin comprobación de rol, ver
  `fix-invite-role-check`): invita a una segunda identidad suya como ADMIN o
  DOCTOR a una sede de la víctima (el `resourceId` sale de `GET /clinic`).
  Con esa membership: `GET /clinic/:resourceId/appointments/today` (pacientes
  del día), `/users` (datos del equipo), `/metrics`; como DOCTOR aparece en
  el booking público.
- Si la víctima tiene un plan con `PATIENT_RECORD` (Consultorio en adelante):
  `GET /patients`, `GET /patients/:patientId` (ficha clínica) y su edición,
  acotados sólo por `accountId`. En la beta el onboarding sólo permite Gratis,
  pero puede haber suscripciones de pago creadas antes o a mano: comprobarlo.
- `GET /user/by-email` sigue funcionando para saltar a otras cuentas.

### Persistencia: por qué corregir `user.account_id` no basta

- La política `member`/`roles` busca la membership por `(userId, resourceId)`
  (`GetUserMembership`) **sin mirar `request.user.accountId`**. Una membership
  en un recurso de la víctima da acceso aunque el `accountId` del usuario ya
  esté corregido.
- `GetUserMembership` y `UserMembershipsQuery` **no filtran `deleted_at`**
  (señalado en `fix-invite-role-check`). Hoy un soft-delete de la membership
  no corta el acceso por `policy()`.
- Las identidades que el atacante invitó nacen por Prisma con el `accountId`
  de la víctima y parecen usuarios legítimos.
- Sus invitaciones pendientes siguen siendo canjeables por el link.
- Un `doctor_profile` creado por invitación sigue en el booking público
  (`get-clinic-doctors.query.ts` sólo une `doctor_profile` con especialidades).
- Tras `fix-invite-role-check`, quien sea ADMIN de la organización que creó
  dentro de la cuenta víctima **sigue pudiendo invitar** en sus sedes hasta
  que se remedie.

`role` (`UserRole`) no autoriza nada hoy: `fix-invite-role-check` documenta que
ningún código lo escribe como ADMIN y que la autorización usa
`UserResourceMembership.role`. Sólo se devuelve en `GET /user/me`. Se cierra
igual: un `role = 'ADMIN'` en la base sólo puede venir de este fallo, y
mañana alguien podría usarlo.

---

## Cambios por capa

### Prisma

Sin cambios ni migración. `input: false` y `disabledPaths` son configuración
de Better Auth, no del esquema.

### api

**`api/src/infrastructure/vendors/auth/better-auth/auth.ts`** (modificar,
autorizado)

- `role`, `onboardingCompleted` y `accountId` con `input: false`:
  ```ts
  role: { type: "string", required: false, input: false },
  onboardingCompleted: { type: "boolean", required: false, input: false },
  accountId: { type: "string", required: false, input: false },
  ```
- **No** añadir `defaultValue` a esos campos: con `input: false` y
  `defaultValue`, `parseInputData` escribe el default en el alta en vez de
  rechazar, y los defaults ya los pone Prisma (`USER`, `false`, `null`).
- `lastName` y `phone` **sin cambios**: `platform/src/app/(auth)/register/page.tsx:21-28`
  los envía en el registro y son `required: true`. Con `input: false`,
  `parseInputData` respondería 400 si vienen y "is required" si no vienen:
  el registro dejaría de funcionar.
- **`disabledPaths: ["/update-user"]`** en la raíz de las opciones de
  `betterAuth({...})` (decisión 1, tomada). La ruta es relativa a `basePath`
  (`/api/auth`). `dist/api/index.mjs:164-166` responde 404 antes del rate
  limit y de cualquier handler. La revisión de seguridad comprobó que no hay
  bypass con variantes de ruta (`/update-user/`, `//update-user`).
- Pendiente de decisión 3 (recomendada por seguridad): en
  `sendVerificationEmail`, cambiar el `console.log` de la línea 57 para que
  registre `user.id` en vez de `user.email`.

**Comportamiento resultante en `sign-up/email`** (`parseInputData`,
`input: false`, sin `defaultValue`):

- Valor truthy (`"uuid"`, `"ADMIN"`, `true`, también el string `"false"`) →
  `400`, código `FIELD_NOT_ALLOWED`, mensaje `"<campo> is not allowed to be set"`.
  La petición entera se rechaza y no se crea el usuario.
- Valor falsy (`null`, `""`, `false`) → se ignora en silencio.
- El rechazo ocurre antes de buscar el correo: la respuesta es la misma con un
  correo existente o nuevo, sin vía de enumeración.

`update-user` responde 404 a todo.

### platform

**`platform/src/lib/auth/client.ts`** (modificar, sólo tipos)

- Añadir `input: false` a `role`, `onboardingCompleted` y `accountId` en
  `inferAdditionalFields`. `InferFieldsInputClient`
  (`better-auth/dist/db/field.d.mts:8`) los quita de los tipos de entrada de
  `signUp`; los de salida (`getSession`, `signIn`) no cambian porque dependen
  de `returned`, no de `input`. `login-form.tsx:48-53` sigue leyendo
  `data.user.accountId`.
- No cambia nada en ejecución: la protección real es la del servidor.

### Archivos

| Acción | Ruta |
| --- | --- |
| Modificar | `api/src/infrastructure/vendors/auth/better-auth/auth.ts` |
| Modificar | `platform/src/lib/auth/client.ts` |

## Usos legítimos que deben seguir funcionando (verificado leyendo código y por la revisión)

- **Registro:** `register/page.tsx` envía `name, lastName, email, phone,
  password, callbackURL`. Ninguno de los tres campos cerrados.
- **Login:** `login-form.tsx` sólo lee `accountId` de la respuesta.
- **`updateUser` / `update-user`:** ningún uso en `platform/src` ni en
  `api/src`. Tampoco `changeEmail`, `deleteUser` ni `updateSession`.
  Desactivarla no rompe nada.
- **Onboarding:** `complete-account-setup.usecase.ts` escribe
  `onboardingCompleted` y `accountId` con `this.users.update` (Prisma). No
  pasa por Better Auth. (El archivo tiene cambios sin commitear en el árbol de
  trabajo; no afectan a este arreglo.)
- **Invitación:** `invite-user.usecase.ts` crea el `user` con `accountId` por
  Prisma; `set-password.usecase.ts` pone `confirmed` y `onboardingCompleted`
  por Prisma y luego llama a `auth.api.signInEmail`, que no parsea campos de
  usuario. `organization.repository.ts` crea la membership ADMIN por Prisma.
- **Lectura:** `plugins/auth.ts` y `platform/src/lib/auth/session.ts` siguen
  recibiendo los campos: `input: false` no afecta a la salida.
- **Ningún código del servidor llama a `auth.api.signUpEmail` ni
  `auth.api.updateUser`** (sólo `signInEmail` y `getSession`).

## Sesiones existentes

- `session.cookieCache` no está configurado (desactivado por defecto):
  `setCookieCache` sale sin hacer nada (`dist/cookies/index.mjs:71`) y la
  cookie sólo lleva el token de sesión. No hay `secondaryStorage`.
- `getSession` resuelve el usuario en la base en cada petición
  (`internalAdapter.findSession`). **No hay valores manipulados vivos en
  cookies:** lo que vale es la fila `user`. Revocar todas las sesiones de la
  plataforma no hace falta.
- El parche impide nuevas manipulaciones, **pero no deshace las ya hechas**
  ni la persistencia descrita arriba. Ver "Auditoría y remediación".
- Si en el futuro se activa `cookieCache`, un cambio de `accountId` por Prisma
  tardaría hasta `maxAge` en reflejarse: anotarlo en ese ticket.

## Aislamiento entre cuentas

- No se añade ninguna lectura ni escritura. El arreglo restaura la premisa del
  modelo multi-tenant: `request.user.accountId` sólo lo escribe el servidor.
- No hay endpoint público nuevo. `sign-up/email` sigue público y ya no acepta
  los tres campos; `update-user` deja de existir.

## Modelo de amenaza

| Atacante | Hoy | Tras el arreglo |
| --- | --- | --- |
| Registrado y confirmado, conoce un correo de la víctima: `by-email` + `update-user { accountId }` | Entra en la cuenta víctima. | `update-user` → 404. `by-email` sigue filtrando el `accountId` hasta su propio ticket, pero ya no sirve para entrar. |
| Anónimo: `sign-up/email { accountId, onboardingCompleted: true }` y confirma su correo | Nace dentro de la cuenta víctima. | 400, no se crea el usuario. |
| `sign-up/email` con correo ya registrado y `accountId` | Respuesta genérica de duplicado. | 400 igual que con un correo nuevo: sin enumeración. |
| Usuario con sesión: `update-user { onboardingCompleted: true }` o `{ role: "ADMIN" }` | Se guarda. | 404. |
| `update-user { confirmed: true }`, `{ emailVerified: true }`, `{ email }` | Ignorado / 400. | 404. |
| `update-user { name, lastName, phone, image }` sobre sí mismo | Permitido, sin validación. | 404. |
| Usuario que **ya** manipuló su `accountId` antes del despliegue | Dentro de la cuenta víctima. | **Sigue dentro** hasta la remediación. |
| **Persistencia por memberships propias**: ADMIN de la organización que creó, memberships en sedes de la víctima | — | Siguen dando acceso por `policy()` aunque se corrija `account_id`, y un soft-delete no lo corta (no se filtra `deleted_at`). Remediación paso 3. |
| **Persistencia por identidades invitadas**: segundas cuentas que el atacante invitó a la cuenta víctima | — | Nacen por Prisma y parecen legítimas; siguen dentro. Cierre transitivo en la auditoría y remediación paso 2. |
| **Invitaciones pendientes** emitidas por el atacante | — | Canjeables por el link. Remediación paso 1. |
| **Médico falso en el booking**: `doctor_profile` de una identidad invitada como DOCTOR | — | Sigue recibiendo reservas de pacientes reales. Remediación paso 4. |
| **Evasión de la auditoría por invitación mutua**: A entra, invita a B; B invita a A | — | A obtiene una membership `created_by = B` con `user_invitation`. La auditoría no se apoya en memberships para decidir si A es legítimo (ver consulta 1). |
| **Ocultación**: el atacante devuelve su `account_id` a `NULL` antes del despliegue | — | Sus memberships en la cuenta víctima siguen activas. La consulta 1 lo marca por cierre transitivo si invitó a alguien, y la consulta 2 lista sus memberships aunque su `account_id` sea `NULL`. Señal débil adicional: `updated_at` muy posterior a `created_at`. |
| Actualización de Better Auth que cambie `parseInputData` o `disabledPaths` | — | `api/package.json` usa `^1.6.22`. Repetir la verificación al subir de versión. |

## Invariantes

1. Ninguna ruta de Better Auth expuesta permite escribir `accountId`, `role`,
   `onboardingCompleted` ni `confirmed` (`emailVerified`), salvo
   `verify-email` para `confirmed` con un token firmado.
2. `POST /api/auth/update-user` responde 404 en cualquier variante de ruta.
3. Un registro que intente escribir uno de esos campos con valor truthy se
   rechaza entero con 400, sin crear usuario y con la misma respuesta exista o
   no el correo.
4. `user.accountId` sólo lo escriben `complete-account-setup` (con una cuenta
   nueva cuyo `ownerId` es el propio usuario) e `invite-user` (alta de un
   usuario que no existía), ambos por Prisma. Matiz: `POST /account` sólo
   exige `confirmed` (`routes/account/index.ts:42`), así que un usuario que ya
   tiene cuenta puede volver a llamarlo, crear cuentas sin límite y quedar
   reasignado a la última. No permite saltar a una cuenta ajena; ticket aparte
   (ver "Fuera de alcance").
5. `request.user` se resuelve de la base en cada petición (sin `cookieCache`).
6. El registro (`name`, `lastName`, `phone`), el onboarding, la invitación y
   el login siguen igual.

## Rutas de Better Auth que escriben en `user` (1.6.22, esta configuración)

| Ruta | Estado | Qué escribe |
| --- | --- | --- |
| `POST /sign-up/email` | Habilitada (`emailAndPassword.enabled`) | `name`, `email`, `image`, `lastName`, `phone`; `emailVerified: false` forzado al final. **Se corrige** con `input: false`. |
| `POST /update-user` | **Se deshabilita** (`disabledPaths`) | — |
| `GET /verify-email` | Habilitada | `emailVerified: true` (y `email` si es un cambio de correo) a partir de un token firmado. Correcto. |
| `POST /change-email` | Deshabilitada (`user.changeEmail.enabled` no está) | Responde error sin escribir (`update-user.mjs:409`). |
| `POST /delete-user` | Deshabilitada (`user.deleteUser.enabled` no está) | `update-user.mjs:263,350`. |
| `POST /update-session` | Habilitada | Sólo `session.additionalFields`; no hay ninguno → 400 "No fields to update". No toca `user`. |
| `POST /sign-in/social`, `/callback/:id`, `/link-social` | Sin `socialProviders` configurados | `parseAdditionalUserInputFromProviderProfile` ya descarta `input: false`. |
| `POST /reset-password`, `/change-password`, `/set-password` (de BA) | Habilitadas | Escriben en `authAccount`, no en `user`. |

## Auditoría y remediación en producción (la corre el humano)

**Orden: desplegar → auditar → remediar.** Una auditoría antes del despliegue
sólo sirve para dimensionar: si se remedia antes, el atacante puede volver a
manipular su fila en la ventana. Las consultas de lectura van en una réplica o
en `BEGIN READ ONLY; … ROLLBACK;` y devuelven sólo ids.

### Consulta 1: conjunto sospechoso (con cierre transitivo)

Criterio independiente de memberships, porque éstas se pueden fabricar por
invitación mutua:

- **Auto-registrado**: su credencial nació con el usuario (registro propio) y
  no existe una invitación creada junto con su fila (`invite-user` crea
  `user` e invitación en la misma transacción). Como `invite-user.usecase.ts:74-77`
  rechaza invitar a un usuario existente cuyo `accountId` no sea el de quien
  invita (incluido `NULL`), un auto-registrado sólo puede estar legítimamente
  en una cuenta suya (`account.owner_id`).
- Semillas: auto-registrado con `account_id` de una cuenta que no es suya;
  `account_id` de una cuenta inexistente (sin FK); `role = 'ADMIN'`;
  onboarding completado sin cuenta.
- Cierre transitivo: todo usuario con una membership creada por alguien del
  conjunto (`m.created_by`) o con una invitación emitida por alguien del
  conjunto (`ui.invited_by`).

```sql
BEGIN READ ONLY;

WITH RECURSIVE self_registered AS (
  SELECT u.id
  FROM "user" u
  JOIN "authAccount" a ON a."userId" = u.id AND a."providerId" = 'credential'
  WHERE abs(extract(epoch FROM a."createdAt" - u.created_at)) < 60
    AND NOT EXISTS (
      SELECT 1
      FROM user_resource_membership m
      JOIN user_invitation ui ON ui.membership_id = m.id
      WHERE m.user_id = u.id
        AND ui.created_at < u.created_at + interval '60 seconds')
),
seed AS (
  SELECT u.id AS user_id, 'self_registered_in_foreign_account' AS reason
  FROM "user" u
  WHERE u.id IN (SELECT id FROM self_registered)
    AND u.account_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM account a WHERE a.id = u.account_id AND a.owner_id = u.id)
  UNION
  SELECT u.id, 'account_does_not_exist'
  FROM "user" u
  WHERE u.account_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM account a WHERE a.id = u.account_id)
  UNION
  SELECT u.id, 'user_role_admin'
  FROM "user" u WHERE u.role = 'ADMIN'
  UNION
  SELECT u.id, 'onboarded_without_account'
  FROM "user" u WHERE u.account_id IS NULL AND u.onboarding_completed
),
tainted (user_id, via) AS (
  SELECT user_id, NULL::uuid FROM seed
  UNION
  SELECT m.user_id, t.user_id
  FROM user_resource_membership m
  LEFT JOIN user_invitation ui ON ui.membership_id = m.id
  JOIN tainted t ON t.user_id = m.created_by OR t.user_id = ui.invited_by
)
SELECT t.user_id,
       t.via,
       array_agg(DISTINCT s.reason) FILTER (WHERE s.reason IS NOT NULL) AS seed_reasons,
       u.account_id
FROM tainted t
JOIN "user" u ON u.id = t.user_id
LEFT JOIN seed s ON s.user_id = t.user_id
GROUP BY t.user_id, t.via, u.account_id;

ROLLBACK;
```

Notas:

- `via` es quién lo arrastró al conjunto. El cierre también recoge a quien un
  atacante hubiera invitado **a su propia cuenta** antes del ataque: falso
  positivo que se descarta mirando si `account_id` es la cuenta del atacante.
- El umbral de 60 s sólo separa "credencial creada con el usuario" de
  "credencial creada al fijar contraseña tras una invitación". Un invitado que
  fija su contraseña en menos de 60 s no cae aquí porque su invitación sí nació
  con su fila.
- Señal débil, para revisar a mano y no como semilla: auto-registrados sin
  cuenta propia con `updated_at` muy posterior a `created_at` (posible
  `account_id` devuelto a `NULL` para ocultarse). Confirmar el correo también
  cambia `updated_at`, de ahí que no sea semilla.
  ```sql
  SELECT u.id FROM "user" u
  WHERE u.id IN (/* self_registered */)
    AND NOT EXISTS (SELECT 1 FROM account a WHERE a.owner_id = u.id)
    AND u.updated_at > u.created_at + interval '1 hour';
  ```
- Falsos positivos posibles: datos cargados a mano en la base. Cada fila se
  revisa.

### Consulta 2: qué tocó el conjunto

Con los ids confirmados de la consulta 1 (`'{<ids>}'::uuid[]`), sólo lectura:

```sql
BEGIN READ ONLY;

SELECT 'resource_created' AS kind, r.id, r.account_id
FROM resource r WHERE r.created_by = ANY('{<ids>}'::uuid[])
UNION ALL
SELECT 'membership_of', m.id, m.account_id
FROM user_resource_membership m WHERE m.user_id = ANY('{<ids>}'::uuid[])
UNION ALL
SELECT 'membership_created', m.id, m.account_id
FROM user_resource_membership m WHERE m.created_by = ANY('{<ids>}'::uuid[])
UNION ALL
SELECT 'invitation_pending', ui.id, m.account_id
FROM user_invitation ui JOIN user_resource_membership m ON m.id = ui.membership_id
WHERE ui.invited_by = ANY('{<ids>}'::uuid[]) AND ui.accepted_at IS NULL
UNION ALL
SELECT 'doctor_profile', dp.id, r.account_id
FROM doctor_profile dp JOIN resource r ON r.id = dp.resource_id
WHERE dp.user_id = ANY('{<ids>}'::uuid[])
UNION ALL
SELECT 'doctor_schedule', ds.id, r.account_id
FROM doctor_schedule ds
JOIN doctor_profile dp ON dp.id = ds.doctor_profile_id
JOIN resource r ON r.id = dp.resource_id
WHERE dp.user_id = ANY('{<ids>}'::uuid[])
UNION ALL
SELECT 'appointment', ap.id, r.account_id
FROM appointment ap
JOIN doctor_profile dp ON dp.id = ap.doctor_profile_id
JOIN resource r ON r.id = dp.resource_id
WHERE dp.user_id = ANY('{<ids>}'::uuid[])
UNION ALL
SELECT 'patient_updated', p.id, p.account_id
FROM patient p WHERE p.updated_by = ANY('{<ids>}'::uuid[])
UNION ALL
SELECT 'session', s.id, NULL
FROM session s WHERE s."userId" = ANY('{<ids>}'::uuid[]);

ROLLBACK;
```

### Remediación (escrituras, tras el despliegue, en una transacción)

Antes de escribir, exportar el resultado de la consulta 2 como evidencia. Es
un incidente con datos de salud (Ley 29733): evidencia adicional en los logs
de acceso de Fastify y del balanceador (`POST /api/auth/update-user`,
`POST /api/auth/sign-up/email`, `GET /user/by-email`).

1. **Revocar invitaciones pendientes** emitidas por el conjunto:
   `UPDATE user_invitation SET expires_at = now(), status = 'EXPIRED' WHERE invited_by = ANY(ids) AND accepted_at IS NULL;`
2. **Corregir cada usuario del conjunto** (atacantes e identidades que
   invitaron): `account_id` = la cuenta de la que es dueño o `NULL`;
   `onboarding_completed` acorde (`true` sólo si es dueño de una cuenta);
   `role = 'USER'`. Borrar sus sesiones:
   `DELETE FROM session WHERE "userId" = ANY(ids);`
3. **Cortar sus memberships en cuentas ajenas.** Hoy el soft-delete
   (`deleted_at = now()`) **no corta el acceso**, porque `GetUserMembership`
   y `UserMembershipsQuery` no filtran `deleted_at`. Opciones en la decisión
   abierta 2.
4. **Retirarlos del booking**: borrar sus filas de `doctor_schedule` y sus
   vínculos de especialidad (`DELETE FROM "_DoctorProfileToSpecialty" WHERE "A" = ANY(doctor_profile_ids)`);
   sin especialidades no salen en `get-clinic-doctors.query.ts` y sin horario no
   tienen huecos. Borrar el `doctor_profile` sólo si no tiene citas (FK
   `NoAction` desde `appointment` y `doctor_schedule`). Las citas listadas son
   de pacientes reales: avisar a la clínica víctima.
5. **Fichas editadas** (`patient_updated`): no hay historial para revertir;
   entregar la lista a la clínica víctima para que revise.
6. **Organizaciones y sedes creadas** (`resource_created`): `resource`,
   `organization` y `clinic` no tienen `deleted_at`, así que no existe
   soft-delete. Opciones en la decisión abierta 2.

## Relación con otros tickets y orden de despliegue

- **`fix-user-by-email-scope`** (`docs/features/fix-user-by-email-scope/plan.md`,
  en curso). Acota `GET /user/by-email` a la cuenta de la sesión. **Se
  despliega en la misma ventana que éste.** Sin él, el `accountId` de
  cualquier médico sigue al alcance de cualquier registrado, y con él cualquier
  regresión futura en estos campos vuelve a ser explotable de inmediato.
- **`fix-invite-role-check`.** Sin conflicto de archivos con éste. Toca
  `api/src/routes/user/index.ts`, igual que `fix-user-by-email-scope`:
  **serializar esos dos merges.** Complementario: aquel impide escalar dentro
  de una cuenta; éste, saltar a otra. Un atacante que entró antes sigue siendo
  ADMIN de la organización que creó en la cuenta víctima, y para
  `fix-invite-role-check` eso es un invitador válido, hasta que se remedie.
- **`fix-invitation-set-password`.** Sin conflicto de archivos (toca
  `user-invitation/*`, `get-clinic-doctors.query.ts` y platform
  `invite/accept`). Su `set-password` escribe `confirmed`/`onboardingCompleted`
  por Prisma: no le afecta `input: false`. Deja para este PR el `console.log`
  del correo (decisión 3).
- **Orden:** éste y `fix-user-by-email-scope` en el mismo release `api-*` (o
  dos seguidos sin tráfico entre ellos); luego auditoría y remediación. El
  cambio de platform es sólo de tipos y puede ir en cualquier release
  posterior. Cada ticket en su PR.

## Fuera de alcance (tickets aparte)

- **`POST /account` repetible**: un usuario con cuenta puede volver a llamarlo
  (`policy({ confirmed: true })`, `routes/account/index.ts:42`), crear cuentas
  sin límite y quedar reasignado a la última. No hay salto entre cuentas.
  Media.
- **`deleted_at` ignorado en `GetUserMembership` y `UserMembershipsQuery`**:
  bloquea cualquier remediación por soft-delete. Cambiarlo afecta a
  `policy.ts` (necesita confirmación). Alta tras este incidente.

## Riesgos y decisiones abiertas

1. **Decidido (4 de octubre de 2026): se desactiva `POST /api/auth/update-user`
   con `disabledPaths` en este mismo arreglo.** El día que haya "editar
   perfil" se hace con una ruta propia con Zod.
2. **Remediación de memberships y recursos del atacante.** El soft-delete no
   corta el acceso hoy y `resource`/`organization`/`clinic` no tienen
   `deleted_at`. Opciones: (a) borrar en firme memberships (primero su
   `user_invitation`) y los recursos sin dependencias, tras exportar la
   evidencia; (b) soft-delete y desplegar antes el arreglo de `deleted_at`.
   Recomiendo **(a)**: corta el acceso en la misma ventana y no depende de
   tocar `policy.ts`.
3. **Decidido (4 de octubre de 2026): el `console.log` de `auth.ts:57`
   registra `user.id` en vez del correo, en este mismo PR.** Ya implementado.
4. **¿Hay suscripciones con `PATIENT_RECORD` en producción?** Determina si
   hubo exposición posible de fichas clínicas además de agenda y equipo.
   Consulta (sólo lectura): `SELECT account_id, plan FROM subscription WHERE plan <> 'FREE';`.

## Verificación

Todo contra la base local, nunca producción. No hay tests en el repo.
SES no tiene stub: si no hay credenciales de test, el correo de verificación
falla en silencio (`runInBackgroundOrAwait` captura el error) y el registro
igual responde 200; el correo se confirma en la base **local** con un
`UPDATE`.

### Typecheck y lint

```bash
cd api && pnpm typecheck
cd platform && pnpm typecheck && pnpm lint
```

### Preparación

```bash
API=http://localhost:4000
PLAT=http://localhost:3000
ORIGIN='Origin: http://localhost:3000'
JSON='Content-Type: application/json'

signup() {  # $1 base, $2 email, $3 cuerpo extra (empieza con coma o vacío)
  curl -s -w "\n%{http_code}\n" -H "$ORIGIN" -H "$JSON" -X POST "$1/api/auth/sign-up/email" \
    -d "{\"name\":\"Lucía\",\"lastName\":\"Paredes\",\"phone\":\"+51987654321\",\"email\":\"$2\",\"password\":\"Clave-Segura-2026\"$3}"
}
login() {  # $1 jar, $2 email
  curl -s -c "$1.txt" -H "$ORIGIN" -H "$JSON" -X POST $API/api/auth/sign-in/email \
    -d "{\"email\":\"$2\",\"password\":\"Clave-Segura-2026\"}" > /dev/null
}
update() {  # $1 url completa, $2 jar, $3 cuerpo
  curl -s -w "\n%{http_code}\n" -b "$2.txt" -H "$ORIGIN" -H "$JSON" -X POST "$1" -d "$3"
}
```

Víctima: `signup $API victima.qa@example.com ""`, confirmar en local
(`UPDATE "user" SET confirmed = true WHERE email = 'victima.qa@example.com';`),
`login victima victima.qa@example.com`, onboarding con
`curl -s -b victima.txt -H "$ORIGIN" -H "$JSON" -X POST $API/account -d '{"accountName":"Consultorio Dra. Rojas"}'`
→ 201 con `accountId` (guardarlo en `VICTIM`). Crear desde la UI su
organización y una sede, y guardar en `VICTIM_CLINIC` el
`SELECT resource_id FROM clinic WHERE name = '<sede>';`.

Atacante: `signup $API atacante.qa@example.com ""`, confirmar en local,
`login atacante atacante.qa@example.com`, onboarding propio con
`POST /account`. Anotar su fila:
`SELECT account_id, role, onboarding_completed, name FROM "user" WHERE email = 'atacante.qa@example.com';`

### Opcional: confirmar el hallazgo (sólo local, antes del cambio)

`update $API/api/auth/update-user atacante "{\"accountId\":\"$VICTIM\",\"onboardingCompleted\":true}"`
→ 200 y `account_id = $VICTIM` en la base. Revertir la fila local antes de
seguir.

### Sign-up con campos cerrados

```bash
signup $API  intruso1.qa@example.com ",\"accountId\":\"$VICTIM\""            # 400 accountId is not allowed to be set
signup $API  intruso2.qa@example.com ",\"role\":\"ADMIN\""                   # 400
signup $API  intruso3.qa@example.com ",\"onboardingCompleted\":true"         # 400
signup $API  intruso4.qa@example.com ",\"onboardingCompleted\":\"false\""    # 400 (string truthy)
signup $PLAT intruso5.qa@example.com ",\"accountId\":\"$VICTIM\""            # 400 a través del rewrite de platform
signup $API  intruso6.qa@example.com ",\"accountId\":null"                   # 200; account_id NULL
signup $API  intruso7.qa@example.com ",\"confirmed\":true,\"emailVerified\":true"  # 200; confirmed = false
signup $API  victima.qa@example.com  ",\"accountId\":\"$VICTIM\""            # 400, mismo cuerpo que intruso1 (sin enumeración)
```
```sql
SELECT email, account_id, confirmed, onboarding_completed FROM "user" WHERE email LIKE 'intruso%@example.com';
-- sólo intruso6 e intruso7, ambos con account_id NULL, confirmed false, onboarding_completed false
```

### `update-user` desactivado → 404 en todas las variantes

```bash
update $API/api/auth/update-user   atacante "{\"accountId\":\"$VICTIM\"}"   # 404
update $API/api/auth/update-user   atacante '{"accountId":""}'              # 404
update $API/api/auth/update-user   atacante '{"accountId":null}'            # 404
update $API/api/auth/update-user   atacante '{"role":"ADMIN"}'              # 404
update $API/api/auth/update-user   atacante '{"onboardingCompleted":true}'  # 404
update $API/api/auth/update-user   atacante '{"name":"Ana"}'                # 404
update $API/api/auth/update-user/  atacante "{\"accountId\":\"$VICTIM\"}"   # 404
update $API/api/auth//update-user  atacante "{\"accountId\":\"$VICTIM\"}"   # 404
update $PLAT/api/auth/update-user  atacante "{\"accountId\":\"$VICTIM\"}"   # 404 vía platform
```

Después:

- Repetir el `SELECT` del atacante: idéntico al anotado.
- `curl -s -b atacante.txt -H "$ORIGIN" $API/user/me` → `accountId` es el suyo.
- `curl -s -o /dev/null -w "%{http_code}\n" -b atacante.txt -H "$ORIGIN" $API/clinic/$VICTIM_CLINIC/users` → 404.
- `GET $API/clinic` con `atacante.txt` no lista la sede de la víctima.

### Caminos legítimos

- **Registro y onboarding en el navegador:** `/register` → `/confirm-email` →
  (confirmar en local) → `/login` → `/onboarding` → crear cuenta Gratis →
  `/account/<id>/select`. `SELECT role, onboarding_completed, account_id`
  → `USER`, `true`, id de la cuenta nueva.
- **Invitación:** como víctima (ADMIN de su organización), invitar a
  `doctora.qa@example.com` como DOCTOR desde Sedes → Usuarios; abrir el link
  de la invitación (token en `user_invitation`), fijar contraseña y entrar.
  `GET /user/me` → `accountId = $VICTIM`, `onboardingCompleted = true`. Si
  `fix-invitation-set-password` ya está desplegado, seguir su flujo.
- **Login** de la víctima y de la invitada redirige a `/account/<id>/select`.

### Auditoría en local

Con la base local preparada para el hallazgo (antes del cambio): atacante con
`account_id = $VICTIM` que invita a una segunda identidad, y ésta lo invita a
él (invitación mutua). La consulta 1 debe devolver a ambos; la consulta 2,
sus memberships, la invitación y el `doctor_profile` si alguno es DOCTOR.

### Qué no se puede verificar en local

- Que no haya usuarios ya manipulados en producción (auditoría, la corre el
  humano).
- El comportamiento tras el balanceador de producción (cabeceras, rate limit).

## Criterios de aceptación

Actores: **médico víctima** (dueño de una cuenta con organización y sede),
**atacante** (registrado, confirmado y con su propia cuenta Gratis),
**atacante sin sesión**, **administrador** del consultorio, **médico invitado**
y **paciente** que reserva por el link público.

### Lo que deja de ser posible

1. **CA-1** `[e2e]` Dado un atacante sin sesión que conoce el `accountId` del
   médico víctima, cuando se registra en `POST /api/auth/sign-up/email`
   enviando `accountId` con ese valor, entonces recibe 400 con código
   `FIELD_NOT_ALLOWED` y no existe ningún usuario con su correo.
2. **CA-2** `[e2e]` Dado un atacante sin sesión, cuando se registra enviando
   `role: "ADMIN"`, entonces recibe 400 `FIELD_NOT_ALLOWED` y no se crea el
   usuario.
3. **CA-3** `[e2e]` Dado un atacante sin sesión, cuando se registra enviando
   `onboardingCompleted` con `true` o con el texto `"false"`, entonces recibe
   400 `FIELD_NOT_ALLOWED` en ambos casos y no se crea el usuario.
4. **CA-4** `[e2e]` Dado un atacante sin sesión, cuando envía el registro con
   `accountId` a través de platform (`/api/auth/sign-up/email` en el dominio de
   platform), entonces recibe el mismo 400 que contra el api.
5. **CA-5** `[e2e]` Dado un atacante sin sesión, cuando se registra enviando
   `accountId: null`, o `confirmed: true` y `emailVerified: true`, entonces el
   registro responde 200 y el usuario creado queda sin cuenta, sin confirmar y
   con el onboarding sin completar.
6. **CA-6** `[e2e]` Dado un atacante con sesión, cuando llama a
   `POST /api/auth/update-user` con `accountId` de la víctima,
   `onboardingCompleted: true`, `role: "ADMIN"`, `accountId: ""`,
   `accountId: null` o sólo `name`, entonces recibe 404 en todos los casos.
7. **CA-7** `[e2e]` Dado un atacante con sesión, cuando llama a
   `/api/auth/update-user/`, `/api/auth//update-user` o a `update-user` a
   través de platform, entonces recibe 404 en todas las variantes.
8. **CA-8** `[e2e]` Dado un atacante sin sesión, cuando llama a
   `POST /api/auth/update-user`, entonces recibe 404 (no 401).
9. **CA-9** `[e2e]` Dado un atacante que acaba de intentar CA-6 y CA-7, cuando
   consulta `GET /user/me`, entonces su `accountId`, `role` y
   `onboardingCompleted` son los mismos que antes de los intentos.
10. **CA-10** `[e2e]` Dado ese mismo atacante, cuando pide
    `GET /clinic/<sede de la víctima>/users`, entonces recibe 404, y
    `GET /clinic` no le lista ninguna sede de la víctima.

### Lo que no debe filtrarse

11. **CA-11** `[e2e]` Dado un atacante sin sesión, cuando se registra con
    `accountId` usando el correo ya registrado del médico víctima y luego con
    un correo nuevo, entonces ambas respuestas tienen el mismo código y el
    mismo cuerpo, y no revelan si el correo existe en WizyDoc.

### Lo que debe seguir funcionando

12. **CA-12** `[e2e]` Dado un médico nuevo en el navegador, cuando se
    registra en `/register` con nombre, apellido, teléfono, correo y
    contraseña, confirma su correo, inicia sesión y crea su cuenta Gratis en
    `/onboarding`, entonces llega a `/account/<id>/select` y `GET /user/me`
    devuelve `role` `USER`, `onboardingCompleted` `true` y el `accountId` de su
    cuenta nueva.
13. **CA-13** `[e2e]` Dado un administrador de su organización, cuando invita
    a una médica como DOCTOR desde Sedes → Usuarios y ella abre el link de
    la invitación, fija su contraseña y entra, entonces `GET /user/me` de la
    médica devuelve el `accountId` del consultorio y `onboardingCompleted`
    `true`.
14. **CA-14** `[e2e]` Dado el médico víctima y la médica invitada en CA-13,
    cuando cada uno inicia sesión en `/login`, entonces es redirigido a
    `/account/<id de su cuenta>/select`.

### Tras desplegar en producción (lo hace el humano)

15. **CA-15** `[manual]` Dado el api desplegado en producción detrás del
    balanceador, cuando una persona sin sesión llama a
    `POST /api/auth/update-user` y se registra con `accountId` en el cuerpo,
    entonces recibe 404 y 400 respectivamente, igual que en local.
16. **CA-16** `[manual]` Dada la base local preparada con un atacante dentro
    de la cuenta víctima y una invitación mutua con una segunda identidad,
    cuando el humano ejecuta las consultas 1 y 2 de la auditoría, entonces la
    consulta 1 devuelve a ambas identidades y la consulta 2 lista sus
    memberships, la invitación y el `doctor_profile` si alguna es DOCTOR.
17. **CA-17** `[manual]` Dado el despliegue de este arreglo y de
    `fix-user-by-email-scope`, cuando el humano corre en producción las
    consultas 1 y 2 en modo sólo lectura, entonces queda exportada la
    evidencia (sólo ids) antes de cualquier escritura de remediación.
18. **CA-18** `[manual]` Dado un usuario confirmado como atacante por la
    auditoría, cuando el humano termina la remediación, entonces ese usuario
    ya no tiene sesiones, sus invitaciones pendientes ya no se pueden canjear
    por el link, su `account_id` es el de una cuenta suya o vacío y su `role`
    es `USER`.
19. **CA-19** `[manual]` Dado un paciente que abre el booking público de la
    sede víctima tras la remediación, cuando elige médico, entonces no aparece
    ningún médico creado por el atacante ni hay horarios disponibles con él.

20. **CA-20** `[manual]` Dado un médico que se registra en local, cuando el api
    envía el correo de verificación, entonces la línea `[sign-up]` del log
    muestra el id del usuario y no su correo (decisión 3).

### Preguntas para el humano

- **Memberships y sedes del atacante (decisión 2).** Mientras no se elija
  entre borrar en firme o soft-delete con el arreglo de `deleted_at`, no hay
  criterio verificable de que el atacante pierda el acceso por sus
  memberships. Recomiendo la opción (a) del plan.
- **Aviso a los afectados.** El plan dice "avisar a la clínica víctima" de
  las citas y fichas tocadas, pero no dice quién avisa, en qué plazo ni si se
  avisa a los pacientes cuyas citas recibió un médico falso (Ley 29733).
  Conviene decidirlo con el abogado antes de remediar.
- **Editar el propio perfil.** Al desactivar `update-user` nadie puede
  cambiar su nombre o teléfono. Hoy no hay pantalla que lo use; ¿se acepta
  hasta que exista "editar perfil" con ruta propia?
