# Fix: escalada de privilegios en `POST /user/invite`

Estado: **revisado por seguridad** (4 de octubre de 2026). Veredicto: el plan
es seguro y sus recomendaciones no abren agujeros. Pendiente de que el humano
cierre las decisiones abiertas y del orden de despliegue con el arreglo de
`auth.ts` (ver "Orden de despliegue").

Severidad: alta. Cualquier miembro de una cuenta (recepción o médico) puede
darse a sí mismo o a un tercero cualquier rol (ADMIN, DOCTOR o USER) en
cualquier sede de la cuenta, **con efecto inmediato y sin aceptar la
invitación**. Con eso lee la gestión de usuarios, la agenda del día y las
métricas de la sede, y edita los datos de salud de todos los pacientes de la
cuenta. Encadenado con el fallo de `auth.ts` (ver Modelo de amenaza), da ADMIN
en sedes de **otra** cuenta.

---

## Objetivo

Que sólo quien es ADMIN de la sede destino (directamente o por ser ADMIN de su
organización padre) pueda crear memberships con `POST /user/invite`, sea cual
sea el rol que otorga.

## Hallazgo (verificado leyendo código, no explotado)

1. `POST /user/invite` (`api/src/routes/user/index.ts:130-161`) declara
   `policy({ account: true, confirmed: true, onboarded: true })`, sin `roles`
   ni `member`. El `resourceId` llega en el cuerpo, así que la política no puede
   resolver la membership.
2. `InviteUserUseCase.execute`
   (`api/src/application/use-cases/user/invite-user.usecase.ts:70-168`) sólo
   comprueba: que el correo no sea de otra cuenta (76), que la clínica sea de la
   cuenta (95-107) y el cupo de médicos (50-68). **Nunca mira a `createdBy`.**
   `role` sale del cuerpo y acepta `ADMIN | DOCTOR | USER` (línea 21).
3. **La membership vale desde que se crea, no desde que se acepta.**
   `GetUserMembership` (`infrastructure/postgres/queries/membership/get-user-membership.query.ts`),
   que es lo que usa `policy({ member | roles })`, busca por
   `(userId, resourceId)` sin mirar `user_invitation.status` ni `deletedAt`.
   `UserMembershipsQuery` (selector de sedes) tampoco. Y `isClinicalStaff` de
   `update-patient-record.usecase.ts:84-95` cuenta cualquier membership
   ADMIN/DOCTOR con `deletedAt: null` de la cuenta, aceptada o no.
4. **Autoinvitación.** Si el correo ya existe en la misma cuenta (línea 74), se
   reutiliza el usuario. El único freno es `@@unique([userId, resourceId])` en
   `UserResourceMembership`, que sólo impide repetir **la misma sede**:
   - Recepción (USER) con membership directa en la sede A se invita como ADMIN a
     la sede B → se crea la membership ADMIN en B. Desde la petición siguiente,
     `GET /clinic/B/users`, `GET /clinic/B/metrics` (con datos de ADMIN) le
     responden.
   - Si la persona es miembro de la organización (acceso heredado a todas las
     sedes), **no** tiene membership directa en ninguna sede: puede crearse una
     ADMIN directa en cualquiera, y `GetUserMembership` devuelve
     `maxRole(directo, heredado) = ADMIN`.
   - Repetir sobre la sede donde ya tiene membership directa falla con P2002,
     que la ruta devuelve como 500.
   - No puede hacerse ADMIN de una **organización** por esta vía: el caso de uso
     sólo acepta clínicas (`client.clinic.findFirst`).
5. **Sin ADMIN también hay escalada.**
   - Recepción que se autoinvita como DOCTOR (con cualquier `specialtyIds`) pasa
     a ser "personal sanitario" para `isClinicalStaff` y puede editar alergias,
     antecedentes y medicación de **todos** los pacientes de la cuenta. Además
     ocupa una plaza de médico del plan y aparece en el booking público.
   - Cualquier miembro que se autoinvita como **USER** a una sede donde no
     estaba gana acceso a ella: `GET /clinic/:resourceId/appointments/today`
     (agenda del día con nombres de pacientes) y `GET /clinic/:resourceId/metrics`
     (`roles: "*"`).

   Por eso la regla no puede ser "sólo un ADMIN puede otorgar ADMIN": tiene que
   cubrir cualquier rol.
6. **Oráculo de correos.** La comprobación "correo en otra cuenta" (línea 76)
   corre antes que cualquier otra: hoy cualquier miembro distingue "este correo
   tiene cuenta en otra clínica de WizyDoc" (422, hoy 500 por el `catch`) de
   "no existe". Además, para un correo que no existe crea una fila `user` y
   envía un correo de invitación con nombre y apellido escritos por quien
   invita. Este arreglo **no** cierra ninguna de las dos cosas para un ADMIN
   (ver Modelo de amenaza y Fuera de alcance).
7. La ruta convierte **todo** error en 500 (`catch` en `routes/user/index.ts:154-159`):
   el 404 del recurso, el 402 del cupo y el 422 del correo no llegan al cliente
   con su código.

### `User.role` frente a `UserResourceMembership.role`

- `User.role` (`UserRole`: `ADMIN | USER`, `@default(USER)`, comentado como
  "Account Role") llega a `request.user.role` vía Better Auth, pero **ningún
  código lo escribe nunca como ADMIN**: ni el registro, ni
  `complete-account-setup`, ni la creación de organizaciones. En la práctica
  todo usuario tiene `USER`. No sirve para autorizar nada y no se usa aquí.
  (Además es falsificable por el mismo fallo de `auth.ts` que `accountId`.)
- `UserResourceMembership.role` (`MembershipRole`: `ADMIN | DOCTOR | USER`) es
  el rol real, por recurso, y es el que usa `policy({ roles })`. Un usuario
  puede ser ADMIN en una sede y USER en otra; el rol de una organización se
  hereda en sus sedes. **Manda este**, igual que en `PATCH /patients`
  (`docs/ficha-paciente-historial.md`).
- El dueño de la cuenta (`Account.ownerId`) tampoco se usa: es ADMIN de la
  organización que crea, y eso ya lo cubre la regla.

---

## Regla

> Sólo puede invitar quien tiene una membership **viva** (`deletedAt: null`)
> con rol **ADMIN** en la sede destino o en su organización padre, dentro de
> la misma cuenta. Vale para cualquier `role` que se otorgue.

Por qué esta y no otra:

- **Cubre cualquier rol** (punto 5 del hallazgo): DOCTOR y USER también dan
  acceso a datos de pacientes.
- **Es la misma regla que ya protege `GET /clinic/:resourceId/users`**
  (`roles: ["ADMIN"]` con herencia de la organización): quien puede ver el
  equipo de una sede es quien puede ampliarlo.
- **Es lo que la UI ya hace**: el formulario de invitar sólo es alcanzable por
  un ADMIN (ver platform) y sólo ofrece DOCTOR y USER. No se le quita nada a
  ningún usuario legítimo.
- Un ADMIN de sede que invita a otro ADMIN a esa misma sede no gana nada que no
  tenga. Un ADMIN de la sede A no puede invitar a la sede B.
- Se descarta "DOCTOR puede invitar USER a su sede": no lo pide el producto ni
  lo ofrece la UI.
- **No depende de `request.user.accountId` para nada más que acotar**: aunque
  ese valor esté falsificado (fallo de `auth.ts`), quien lo falsifica no tiene
  una membership ADMIN en la cuenta ajena y recibe 403.

Respuestas:

| Caso | Código | Cuerpo |
| --- | --- | --- |
| `resourceId` no es una clínica de la cuenta (no existe, es de otra cuenta o es una organización) | 404 | `{ message: "Sede no encontrada" }` |
| Clínica de la cuenta, quien invita no es ADMIN de ella ni de su organización (incluido no ser miembro) | 403 | `{ message: "Sólo un administrador de la sede puede invitar usuarios" }` |

El 403 para un no-miembro de la misma cuenta difiere de lo que hace `policy()`
(404 sin membership). Es intencional y sigue la convención de `api/AGENTS.md`
("recurso de otra cuenta → 404"): la existencia de una sede de tu propia cuenta
no es secreta, `GET /clinic` ya lista todas a cualquier miembro.

**Orden de las comprobaciones** (todas dentro de la transacción, antes de
cualquier escritura): 1) la sede es de la cuenta → si no, 404; 2) quien invita
es ADMIN → si no, 403; 3) sólo entonces el resto (correo en otra cuenta, crear
usuario, cupo, `doctorProfile`, membership, invitación). Así un no-ADMIN de una
cuenta no obtiene ni el oráculo de correos ni el de cupo. **No cierra el
oráculo de correos en general**: cualquiera puede registrarse, crear su cuenta,
ser ADMIN de ella y sondear (ver Modelo de amenaza).

---

## Cambios por capa

### Prisma

Sin cambios ni migración. Ya existen `@@index([accountId, role])` y
`@@unique([userId, resourceId])` en `user_resource_membership`; la consulta
nueva filtra por `userId + accountId + role + resourceId IN (2 ids)` y usa el
único `(userId, resourceId)`.

### api

**`api/src/application/use-cases/user/invite-user.usecase.ts`** (modificar)

- Mover la búsqueda de la clínica al principio de `execute`, dentro de la
  transacción, y traer también el padre:
  `client.clinic.findFirst({ where: { resourceId, resource: { accountId } }, include: { resource: { select: { parentResourceId: true } } } })`.
  Si no aparece → `throw new NotFound("Sede no encontrada")`.
- Nuevo método privado `assertInviterIsAdmin(createdBy, accountId, clinicResourceId, organizationResourceId)`:
  ```ts
  getClient().userResourceMembership.findFirst({
    where: {
      userId: createdBy,
      accountId,
      deletedAt: null,
      role: "ADMIN",
      resourceId: { in: [clinicResourceId, organizationResourceId] },
    },
    select: { id: true },
  })
  ```
  Si es `null` → `throw new Forbidden("Sólo un administrador de la sede puede invitar usuarios")`
  (`api/src/application/errors/forbidden.error.ts`, ya existe). Si
  `parentResourceId` es `null` (no debería: toda clínica cuelga de una
  organización), el `in` lleva sólo la clínica.
- Llamarlo justo después de encontrar la clínica y antes de
  `client.user.findUnique({ where: { email } })`.
- La membership nueva sigue escribiendo `accountId: data.accountId`, que tras
  la comprobación anterior coincide siempre con el `accountId` del recurso
  (invariante 7).
- Se descarta reutilizar `GetUserMembership`: ignora `deletedAt` y hace hasta
  tres consultas para devolver un rol efectivo que aquí no hace falta. La
  consulta directa sigue el precedente de `isClinicalStaff`.
- **No se cambia la generación del token** (`randomBytes(32).toString("hex")`,
  línea 134): `fix-invitation-set-password` valida el token con
  `^[0-9a-f]{64}$`.
- Quitar el import `UserRole` sin uso. Quitar los dos `console.log` de este
  archivo (el error ya dice lo que pasó); no loguear el correo.

**`api/src/routes/user/index.ts`** (modificar, sólo `POST /invite`)

- Política **sin cambios**: `policy({ account: true, confirmed: true, onboarded: true })`.
  Actualizar el comentario: el recurso llega en el cuerpo, así que la
  pertenencia a la cuenta **y el rol ADMIN** los comprueba el caso de uso.
- `catch`: si `error instanceof ApplicationError` →
  `reply.status(error.statusCode).send({ message: error.message })`; si no,
  `request.log.error({ errName, errCode }, "[invite-user]")`, donde `errName`
  es el `name` del error y `errCode` su `code` si lo tiene (p. ej. `P2002` de
  Prisma), y 500 con el mensaje genérico actual. **No** loguear `{ err: error }`
  ni el `message`: los errores de Prisma incluyen los valores de la fila
  (correo, teléfono). Se elimina el `console.error({ error })` actual.
- No se toca ninguna otra ruta del archivo.

Sin cambios en `policy.ts`, `auth.ts` ni `entitlements.ts`.

### platform

**Sin cambios.** El backend es quien protege; hoy la UI ya no ofrece invitar a
un no-ADMIN:

- El botón "Invitar usuario" está en `UsersTopHeader`
  (`platform/src/components/clinic/users-top-header.tsx`), que sólo se pinta en
  `account/[accountId]/organization/[resourceId]/clinic/[clinicId]/users/page.tsx`.
- A esa página sólo se llega desde la tabla de Sedes
  (`components/clinic/clinics-table.tsx:50`), que carga
  `GET /organization/:resourceId/clinics` (`roles: ["ADMIN"]`). El enlace
  "Usuarios" del menú está comentado (`components/common/utils.tsx:41`).
- Si un no-ADMIN escribe la URL a mano, la página llama a
  `GET /clinic/:clinicId/users` (`roles: ["ADMIN"]`) → 403 → `ApiError` →
  `organization/[resourceId]/error.tsx`. El botón no llega a pintarse.
- `invite-user.action.ts` ya limita `role` a `DOCTOR | USER` y muestra el
  `message` del api en un toast con `toActionState`; con el cambio de la ruta,
  un 403/404/402 se verá con su texto en vez de "Ha ocurrido un error al
  invitar al usuario".
- El botón "Invitar nuevo doctor" de `components/app/dashboard/doctors/top-nav.tsx`
  ya exige ADMIN de organización y no abre ningún modal.

Al no haber cambios de UI, **no hay Fase 2 ni mockup**.

### Archivos

| Acción | Ruta |
| --- | --- |
| Modificar | `api/src/application/use-cases/user/invite-user.usecase.ts` |
| Modificar | `api/src/routes/user/index.ts` (sólo el handler de `POST /invite`) |

---

## Aislamiento entre cuentas

- `resourceId` (cuerpo) se resuelve sólo entre clínicas con
  `resource.accountId = request.user.accountId`. Un recurso de otra cuenta da
  404 **mientras `request.user.accountId` sea fiable**; hoy no lo es (fallo de
  `auth.ts`, ver Modelo de amenaza), y quien lo falsifica sí encuentra la sede
  ajena. Lo que lo frena tras este arreglo es el punto siguiente.
- La membership de quien invita se busca por `userId` de la sesión **y**
  `accountId` de la sesión: una membership ADMIN en otra cuenta no cuenta, y
  quien falsificó su `accountId` no tiene ninguna membership ADMIN en la cuenta
  ajena → 403.
- `organizationResourceId` no viene del cliente: sale de la clínica ya acotada.
- `specialtyIds` (cuerpo) sigue sin validarse contra la cuenta: un ADMIN podría
  conectar especialidades de otra organización al `doctorProfile`. Fuera de
  alcance (ver abajo); con este arreglo ya sólo puede hacerlo un ADMIN.

## Modelo de amenaza

| Atacante | Hoy | Tras el arreglo |
| --- | --- | --- |
| **Recepción (USER)** de la sede A, se autoinvita como ADMIN a la sede B | 200; ADMIN en B al instante, sin aceptar nada. | 403, sin escrituras. |
| **Recepción (USER)** se autoinvita como DOCTOR | 200; edita datos de salud de todos los pacientes de la cuenta, ocupa plaza de médico, sale en el booking. | 403. |
| **Cualquier miembro** se autoinvita como USER a una sede donde no estaba | 200; ve la agenda del día (nombres de pacientes) y las métricas de esa sede. | 403. |
| **Miembro heredado de la organización** con rol USER o DOCTOR se crea una membership ADMIN directa en una sede | 200; rol efectivo ADMIN por `maxRole`. | 403 (no es ADMIN ni de la sede ni de la organización). |
| **DOCTOR** invita a un correo propio como ADMIN y lo activa | 200; segunda identidad ADMIN. | 403. |
| **ADMIN de la sede A** invita a la sede B (sin ser ADMIN de B ni de la organización) | 200. | 403. |
| **Usuario de otra cuenta que falsifica su `accountId`** (fallo de `infrastructure/vendors/auth/better-auth/auth.ts:36-42`: `additionalFields` sin `input: false`, escribible con `update-user` o `sign-up`) y luego invita con un `resourceId` de la cuenta víctima | 200; se autoinvita como ADMIN de una sede ajena. | **403**: no tiene membership ADMIN en la cuenta víctima. Este plan corta esa cadena; **el fallo de `auth.ts` sigue abierto** y se arregla en su propio ticket. |
| **ADMIN de otra cuenta** con un `resourceId` de esta, sin falsificar nada | 404. | 404. |
| **No-ADMIN** de una cuenta sondea si un correo tiene cuenta en otra clínica | 500 vs 200 distinguibles. | 403 siempre, antes de mirar el correo. |
| **Cualquiera** se registra, crea su cuenta (es ADMIN) y sondea correos | 422 vs 200: distingue si un correo tiene cuenta en WizyDoc. Para correos inexistentes crea una fila `user` (ocupa ese correo, que ya no podrá registrarse en otra cuenta) y envía un correo de invitación con nombre y apellido elegidos por el atacante. | **Sin cambio.** Ya pasaba antes. Fuera de alcance, junto a `GET /user/by-email`. |
| **Membership ADMIN "borrada"** (`deletedAt` con fecha) | n/a | No cuenta. Hoy nadie escribe `deletedAt`, así que es defensa en profundidad. |
| **Carrera**: dos invitaciones simultáneas | Igual que hoy (P2002 en la segunda si es la misma persona y sede). | Sin cambio: la comprobación es de lectura sobre memberships que esta ruta ya no deja crear a un no-ADMIN. |
| **Escaladas ya ocurridas** | — | No se deshacen solas. Ver "Auditoría en producción". |
| **Vía paralela: `POST /organization`** (`routes/organization/index.ts:51-55`) | Cualquier miembro crea una organización y queda ADMIN de ella; con eso pasa `isClinicalStaff` y, con este arreglo, puede invitar en las sedes que cree. | **Sigue abierta.** Tras este PR cualquier miembro sigue escalando por aquí: **el incidente no se cierra sólo con este PR.** Ver decisión 1 y "Orden de despliegue". |

## Invariantes

Tras el arreglo debe ser verdad:

1. `POST /user/invite` no crea ningún `user`, `user_resource_membership`,
   `doctor_profile` ni `user_invitation` si quien invita no tiene una membership
   ADMIN viva en la sede destino o en su organización padre, en su misma cuenta.
2. La regla se aplica a los tres roles que se pueden otorgar.
3. La comprobación de rol ocurre antes de leer el correo invitado y antes de
   tomar el lock del cupo.
4. `resourceId` de otra cuenta → 404; de la propia cuenta sin ser ADMIN → 403.
5. Los errores de aplicación de esta ruta salen con su `statusCode`; ningún 500
   ni ningún log incluye el error original ni datos personales.
6. Ninguna otra ruta cambia de comportamiento.
7. Ninguna membership creada por esta ruta tiene un `account_id` distinto del
   `account_id` de su recurso.
8. El token de invitación se sigue generando como 64 caracteres hexadecimales.

## Solapamiento con `fix-invitation-set-password`

- **Sin conflicto de archivos.** Ese plan toca `user-invitation/*` (use cases y
  ruta), `get-clinic-doctors.query.ts` y `platform/.../invite/accept/*`. Este
  toca `user/invite-user.usecase.ts` y `routes/user/index.ts`.
- Ese plan valida el token con `^[0-9a-f]{64}$`; este no cambia cómo se genera.
- Ese plan ya lista este fallo en su "Fuera de alcance" y usa
  `POST /user/invite` con un ADMIN en su verificación: sigue funcionando.
- **Se complementan, no se sustituyen:** aquel impide tomar la cuenta de un
  invitado; este impide crear la invitación. Ninguno de los dos hace que la
  membership dependa de aceptar (ver Fuera de alcance), así que el orden de
  despliegue entre ambos es indiferente.
- Si se implementan a la vez, ir en PRs separados.

## Orden de despliegue

1. **Arreglo de `auth.ts`** (`additionalFields` de `accountId`, `role` y
   `onboardingCompleted` con `input: false`). Va antes o en el mismo
   despliegue que este: es el que hace fiable `request.user.accountId`. Tocar
   `auth.ts` requiere confirmación explícita del humano; tiene su propio ticket.
2. **Este arreglo** (`POST /user/invite`). Sólo api; platform no cambia.
3. **`POST /organization`** justo después (decisión 1). Hasta entonces la
   escalada sigue abierta por esa vía.

Desplegar este antes que el de `auth.ts` no rompe nada y ya corta la cadena de
falsificación en esta ruta; el orden de arriba es para no dar el incidente por
cerrado antes de tiempo.

## Auditoría en producción (sólo lectura, la corre el humano)

Todas las consultas van dentro de una transacción de sólo lectura que se
deshace al final:

```sql
BEGIN READ ONLY;

-- 1. Memberships de sede creadas por alguien que no tenía entonces una
--    membership ADMIN en esa sede o en su organización. Incluye
--    autoinvitaciones (self_granted) y los tres roles.
SELECT m.id            AS membership_id,
       m.account_id,
       m.resource_id,
       m.user_id,
       m.created_by,
       m.role,
       m.created_at,
       m.user_id = m.created_by AS self_granted,
       ui.status       AS invitation_status
FROM user_resource_membership m
JOIN resource r ON r.id = m.resource_id
LEFT JOIN user_invitation ui ON ui.membership_id = m.id
WHERE r.type = 'CLINIC'
  AND m.role IN ('ADMIN', 'DOCTOR', 'USER')
  AND NOT EXISTS (
    SELECT 1
    FROM user_resource_membership g
    WHERE g.user_id = m.created_by
      AND g.account_id = m.account_id
      AND g.role = 'ADMIN'
      AND g.resource_id IN (m.resource_id, r.parent_resource_id)
      AND g.created_at <= m.created_at
      AND g.id <> m.id
  )
ORDER BY m.role, m.created_at;

-- 2. Organizaciones creadas por alguien que no es el dueño de la cuenta
--    (vía paralela, POST /organization).
SELECT m.id AS membership_id, m.account_id, m.resource_id, m.user_id, m.created_at
FROM user_resource_membership m
JOIN resource r ON r.id = m.resource_id
JOIN account a ON a.id = m.account_id
WHERE r.type = 'ORGANIZATION'
  AND m.role = 'ADMIN'
  AND m.user_id = m.created_by
  AND m.user_id <> a.owner_id
ORDER BY m.created_at;

-- 3. Memberships cuya cuenta no es la de su recurso (rastro de un accountId
--    falsificado).
SELECT m.id
FROM user_resource_membership m
JOIN resource r ON r.id = m.resource_id
WHERE m.account_id <> r.account_id;

-- 4. Usuarios con memberships en una cuenta distinta de la suya (o sin cuenta).
SELECT DISTINCT m.user_id
FROM user_resource_membership m
JOIN "user" u ON u.id = m.user_id
WHERE u.account_id IS DISTINCT FROM m.account_id;

ROLLBACK;
```

Limitaciones: si la membership ADMIN del invitador también se obtuvo por la
escalada, la consulta 1 no marca las que creó después (hay que revisar en
cadena desde las filas que devuelva). La consulta 1 no detecta la cadena con
`accountId` falsificado si el atacante se creó antes una organización en la
cuenta víctima (consulta 2); por eso se corren las cuatro. Falso positivo
posible en la 2: una organización creada legítimamente por un co-administrador
que no es el dueño. Si alguna consulta devuelve filas, decidir con la clínica
afectada; no se corrige nada a mano en este ticket.

---

## Riesgos y decisiones abiertas

1. **`POST /organization` va en un ticket aparte, inmediatamente después**
   (recomendación aceptada por seguridad). Cualquier miembro puede crear una
   organización y quedar ADMIN de ella; ese ADMIN pasa `isClinicalStaff` y edita
   datos de salud de toda la cuenta. Regla para ese ticket:
   > Puede crear una organización quien sea `Account.ownerId` y la cuenta aún
   > no tenga organizaciones, o quien sea ADMIN (membership viva) de alguna
   > organización de la cuenta.

   Se descartó "sin ninguna membership en la cuenta": la cumple quien falsificó
   su `accountId`. Ese ticket va **después del arreglo de `auth.ts` o a la
   vez**, porque también confía en `request.user.accountId`.
2. **¿El API sigue aceptando `role: "ADMIN"` en la invitación?** La UI nunca lo
   ofrece. Quitarlo del enum reduce superficie, pero deja sin forma de nombrar a
   un segundo administrador. **Recomiendo mantenerlo** (seguridad no lo
   objeta): tras el arreglo sólo un ADMIN puede otorgarlo.
3. **Mecanismo: comprobación en el caso de uso (recomendado, seguridad no lo
   objeta) o ruta nueva `POST /clinic/:resourceId/invitations` con
   `policy({ roles: ["ADMIN"] })`.** La ruta nueva es declarativa y sigue la
   migración a `policy()`, pero responde 404 (no 403) al no-miembro de la misma
   cuenta, rompe el contrato con el platform desplegado entre el despliegue de
   api y el de platform (invitar falla unos minutos) y aun así exige el cambio
   del `catch`. Ninguna de las dos toca `policy.ts`; una opción
   `policy({ resourceFrom: "body" })` sí lo tocaría y no se propone.
4. **¿Se corre la auditoría antes de desplegar?** Recomiendo sí.

### Fuera de alcance (rutas de gestión de equipo revisadas)

| Ruta | Política actual | Situación |
| --- | --- | --- |
| `auth.ts:36-42` (`additionalFields`) | — | **Crítico.** `accountId`, `role` y `onboardingCompleted` sin `input: false`: el usuario los escribe con `update-user` o `sign-up`. Ticket propio; va antes o a la vez que este. |
| Listar, reenviar o revocar invitaciones; cambiar rol; quitar miembro | — | **No existen.** No hay forma de revocar una membership obtenida por la escalada salvo en la base de datos. |
| `GET /clinic/:resourceId/users` | `roles: ["ADMIN"]` | Correcta. La consulta no filtra `deletedAt`. |
| `POST /organization` | `account, confirmed, onboarded` | **Escalada** (decisión 1). Además lee `request.params.onboarding` (siempre `undefined`) y tiene un `console.log(request.user)`. |
| `POST /clinic` | `account, confirmed, onboarded` | Cualquier miembro crea una sede en cualquier organización de la cuenta y consume el cupo de sedes del plan. No le da membership a quien la crea. Media. |
| `GET /clinic` | `account, confirmed, onboarded` | Lista todas las sedes de la cuenta a cualquier miembro. Aparentemente intencional. |
| `POST /:resourceId/specialty`, `PUT /:resourceId/specialty/:specialtyId` | `roles: ["ADMIN"]` | Correctas. |
| `PUT /clinic/:resourceId/availability` | `roles: ["ADMIN", "DOCTOR"]` | Sólo escribe el `doctorProfile` de quien llama; no permite editar la disponibilidad de otro médico. Correcta. |
| `GET /user/by-email` | `account, confirmed, onboarded` | **Fuga entre cuentas**: devuelve la fila `user` completa (nombre, teléfono, `accountId`, `role`...) de cualquier correo de **cualquier cuenta** a cualquier miembro. Alta. La usa el formulario de invitar (`lookup-user-by-email.action.ts`). |
| Oráculo de correos y filas `user` huérfanas en `POST /user/invite` | — | Un ADMIN de cualquier cuenta (cualquiera que se registre) distingue 422/200 por correo, crea filas `user` para correos ajenos (los ocupa) y envía correos con texto suyo. Mismo ticket que `GET /user/by-email`: rate limit por cuenta e IP, respuesta indistinguible, y no crear el `user` hasta que acepte la invitación. |
| `GET /me/resource/:resourceId/membership` | `confirmed, onboarded` | Sólo responde por el propio usuario. Tiene un `console.log` de la membership. Baja. |
| `InviteUserUseCase`: `specialtyIds` | — | No se valida que las especialidades sean de la cuenta. Baja tras este arreglo. |
| Membership efectiva antes de aceptar | — | `GetUserMembership`, `UserMembershipsQuery` e `isClinicalStaff` no miran `user_invitation`. Un ADMIN puede dar acceso a un compañero sin su consentimiento y la "aceptación" es cosmética para usuarios que ya tienen contraseña. Decisión de producto; ticket aparte. |
| `deletedAt` ignorado | — | `GetUserMembership` (y por tanto `policy()`) y `UserMembershipsQuery` no filtran `deletedAt`. Hoy nadie lo escribe; el día que exista "quitar miembro" habrá que corregirlo. |
| Reinvitar a la misma persona y sede | — | P2002 → 500. Ya pasaba; con este arreglo sigue siendo 500 (ahora logueando sólo `errName`/`errCode`). |

---

## Verificación

Sin tests en el repo. El engineer ejecuta y pega la salida de cada paso. Todo
contra la base local, con SES de test o stub.

### Typecheck

```bash
cd api && pnpm typecheck
grep -n "console\." api/src/application/use-cases/user/invite-user.usecase.ts   # vacío
grep -n "randomBytes(32).toString(\"hex\")" api/src/application/use-cases/user/invite-user.usecase.ts   # sigue presente
```

### Preparación (una vez, en local)

Cuenta 1, desde el navegador:

1. Registrar `admin.qa@example.com`, completar onboarding, crear la
   organización "Consultorios Miraflores" y dos sedes: **A** "Sede Larco" y
   **B** "Sede Benavides".
2. Desde Sedes → A → Usuarios, invitar a `recepcion.qa@example.com` (USER) y a
   `doctor.qa@example.com` (DOCTOR) en A.
3. Invitar a `adminsede.qa@example.com` como ADMIN **sólo de A**. La UI no
   ofrece ADMIN, así que se hace con curl y la cookie del admin de
   organización, después de definir `login` e `invite` (abajo):
   `invite admin adminsede.qa@example.com ADMIN $A` → 200.
4. Activar las tres cuentas con el link del correo (o del log del stub).

Cuenta 2: registrar `otro.admin@example.com` y crear una organización y una
sede **Z**.

IDs (lectura en la base local):

```sql
SELECT c.name, c.resource_id, r.parent_resource_id
FROM clinic c JOIN resource r ON r.id = c.resource_id;
SELECT id FROM specialty LIMIT 1;
```

Sesiones:

```bash
API=http://localhost:4000
ORIGIN='Origin: http://localhost:3000'
JSON='Content-Type: application/json'
login() { curl -s -c "$1.txt" -H "$ORIGIN" -H "$JSON" -X POST $API/api/auth/sign-in/email \
  -d "{\"email\":\"$2\",\"password\":\"$3\"}" > /dev/null; }

login admin     admin.qa@example.com     '<clave>'
login adminsede adminsede.qa@example.com '<clave>'
login recepcion recepcion.qa@example.com '<clave>'
login doctor    doctor.qa@example.com    '<clave>'
login otro      otro.admin@example.com   '<clave>'

invite() {  # $1 cookie, $2 email, $3 role, $4 resourceId
  curl -s -o /dev/stderr -w "%{http_code}\n" -b "$1.txt" -H "$ORIGIN" -H "$JSON" \
    -X POST $API/user/invite -d "{\"email\":\"$2\",\"name\":\"Prueba\",\"lastName\":\"QA\",
    \"phone\":\"987654321\",\"role\":\"$3\",\"resourceId\":\"$4\",\"specialtyIds\":[\"$SPECIALTY\"]}"
}
A=<resourceId sede A>; B=<resourceId sede B>; ORG=<resourceId organización>
Z=<resourceId sede Z>; SPECIALTY=<specialtyId>
```

Antes de cada bloque de "no autorizado", anotar el total para comprobar que no
se escribe nada:

```sql
SELECT (SELECT count(*) FROM "user") AS users,
       (SELECT count(*) FROM user_resource_membership) AS memberships,
       (SELECT count(*) FROM doctor_profile) AS doctors,
       (SELECT count(*) FROM user_invitation) AS invitations;
```

### Confirmar el hallazgo (opcional, sólo local, sobre `main` antes del cambio)

```bash
invite recepcion recepcion.qa@example.com ADMIN $B          # hoy: 200
curl -s -o /dev/null -w "%{http_code}\n" -b recepcion.txt $API/clinic/$B/users   # hoy: 200
```

Limpieza **sólo en la base local**, en este orden (`user_invitation` referencia
la membership con `NoAction`):

```sql
DELETE FROM user_invitation
WHERE membership_id = (SELECT m.id FROM user_resource_membership m
                       JOIN "user" u ON u.id = m.user_id
                       WHERE u.email = 'recepcion.qa@example.com' AND m.resource_id = '<B>');
DELETE FROM user_resource_membership m USING "user" u
WHERE u.id = m.user_id AND u.email = 'recepcion.qa@example.com' AND m.resource_id = '<B>';
-- Sólo si la prueba se hizo con role DOCTOR (borrar antes sus relaciones con especialidades):
-- DELETE FROM doctor_profile dp USING "user" u
-- WHERE u.id = dp.user_id AND u.email = 'recepcion.qa@example.com' AND dp.resource_id = '<B>';
```

### No autorizado → 403, sin escrituras

```bash
invite recepcion recepcion.qa@example.com ADMIN  $B   # 403  (autoinvitación ADMIN)
invite recepcion recepcion.qa@example.com DOCTOR $B   # 403  (autoinvitación DOCTOR)
invite recepcion recepcion.qa@example.com USER   $B   # 403  (autoinvitación USER a otra sede)
invite recepcion nuevo1.qa@example.com    ADMIN  $A   # 403  (tercero, su propia sede)
invite doctor    doctor.qa@example.com    ADMIN  $B   # 403
invite doctor    nuevo2.qa@example.com    USER   $A   # 403  (DOCTOR tampoco invita USER)
invite adminsede nuevo3.qa@example.com    USER   $B   # 403  (ADMIN de A, no de B)
invite recepcion otro.admin@example.com   USER   $A   # 403, no 422 (sin oráculo para no-ADMIN)
```

Cuerpo esperado en todos: `{"message":"Sólo un administrador de la sede puede invitar usuarios"}`.
La consulta de totales debe dar exactamente lo mismo que antes del bloque.

```bash
curl -s -o /dev/null -w "%{http_code}\n" -b recepcion.txt $API/clinic/$B/users   # 404 (sigue sin acceso)
```

Membership ADMIN borrada (sólo base local):

```sql
UPDATE user_resource_membership m SET deleted_at = now() FROM "user" u
WHERE u.id = m.user_id AND u.email = 'adminsede.qa@example.com' AND m.resource_id = '<A>';
```

```bash
invite adminsede nuevo12.qa@example.com USER $A   # 403
```

```sql
UPDATE user_resource_membership m SET deleted_at = NULL FROM "user" u
WHERE u.id = m.user_id AND u.email = 'adminsede.qa@example.com' AND m.resource_id = '<A>';
```

### Recurso ajeno o inválido → 404

```bash
invite otro  nuevo4.qa@example.com USER $A                                     # 404 (sede de otra cuenta)
invite admin nuevo5.qa@example.com USER $Z                                     # 404
invite admin nuevo6.qa@example.com USER $ORG                                   # 404 (organización, no sede)
invite admin nuevo7.qa@example.com USER 00000000-0000-7000-8000-000000000000   # 404
```

Cuerpo: `{"message":"Sede no encontrada"}`.

### Camino feliz → 200

(`adminsede` ya se invitó en la preparación; repetirlo daría P2002 → 500.)

```bash
invite admin     nuevo8.qa@example.com    DOCTOR $B   # 200 (ADMIN heredado de la organización)
invite adminsede nuevo9.qa@example.com    USER   $A   # 200 (ADMIN directo de la sede)
invite adminsede nuevo10.qa@example.com   ADMIN  $A   # 200 (ADMIN de sede nombra a otro ADMIN de la misma sede)
```

```sql
SELECT u.email, m.role, m.resource_id, m.created_by
FROM user_resource_membership m JOIN "user" u ON u.id = m.user_id
WHERE u.email LIKE 'nuevo%.qa@example.com';
-- sólo nuevo8, nuevo9 y nuevo10

SELECT m.id FROM user_resource_membership m
JOIN resource r ON r.id = m.resource_id
WHERE m.account_id <> r.account_id;
-- vacío (invariante 7)
```

### Otros códigos que ahora llegan al cliente

```bash
invite admin otro.admin@example.com    USER $A   # 422 "Ya existe una cuenta con este correo en otra cuenta"
invite otro  recepcion.qa@example.com  USER $Z   # 422: documenta el oráculo que sigue abierto para un ADMIN (fuera de alcance)
```

Con el plan Gratis (1 médico), tras `nuevo8` el siguiente médico distinto:

```bash
invite admin nuevo11.qa@example.com DOCTOR $A  # 402 con el mensaje del plan
```

(Si `doctor.qa` ya ocupa la plaza, `nuevo8` ya dará 402; en ese caso es el
resultado esperado de ese paso y no un fallo.)

Log del api tras provocar un P2002 (repetir `invite admin nuevo9.qa@example.com USER $A`):
la línea `[invite-user]` muestra `errName` y `errCode: "P2002"`, y **no** el
correo ni el teléfono.

### Cadena con `accountId` falsificado (tras el arreglo de `auth.ts`)

Cuando esté desplegado el ticket de `auth.ts`, comprobar que ya no se puede
falsificar:

```bash
curl -si -b otro.txt -H "$ORIGIN" -H "$JSON" -X POST $API/api/auth/update-user \
  -d '{"accountId":"<accountId de la cuenta 1>"}'
# esperado: rechazado (4xx) y accountId de otro.admin sin cambios en la base
```

Si se prueba este plan **antes** del arreglo de `auth.ts` (sólo local), la misma
petición sí cambia el `accountId`; tras volver a iniciar sesión,
`invite otro otro.admin@example.com ADMIN $A` debe dar **403** con este arreglo
(hoy daría 200). Restaurar después el `accountId` de `otro.admin` en la base
local.

### Navegador (`pnpm dev` en api y platform)

1. Como `admin.qa`: Sedes → Sede Larco → Usuarios → "Invitar usuario" → invitar
   a un USER nuevo. Toast "Invitación enviada" y aparece en la tabla.
2. Como `recepcion.qa`, abrir a mano
   `/account/<accountId>/organization/<orgId>/clinic/<A>/users`: se muestra la
   página de error del segmento y no hay botón de invitar (comportamiento
   actual, no cambia).

### Qué no se puede verificar en local

- La auditoría sobre datos reales de producción.

---

## Criterios de aceptación

Decisiones que estos criterios dan por cerradas (5 de octubre de 2026): la
comprobación de rol va en el caso de uso (decisión 3); el API sigue aceptando
`role: "ADMIN"` y sólo un ADMIN puede otorgarlo (decisión 2); `POST
/organization` queda fuera de este ticket (decisión 1); la auditoría en
producción la corre el humano **tras** desplegar y no bloquea la aceptación del
ticket (decisión 4).

`[e2e]`: lo prueba el e2e-tester en el navegador contra la base local.
`[manual]`: petición HTTP, consulta a la base local o lectura de logs; el
engineer o el reviewer pegan la salida. "Sin escrituras" significa que los
totales de `user`, `user_resource_membership`, `doctor_profile` y
`user_invitation` no cambian y no se envía ningún correo de invitación.

### Lo que debe seguir funcionando

- **CA-1** `[e2e]` — Administrador de la organización.
  Dado que entra a Sedes → una sede → Usuarios,
  Cuando invita a un usuario nuevo como recepción (USER) o como médico
  (DOCTOR),
  Entonces ve el toast "Invitación enviada" y el invitado aparece en la tabla.
- **CA-2** `[e2e]` — Médico invitado por el administrador (en conjunto con
  `fix-invitation-set-password`).
  Dado el correo de invitación que generó CA-1,
  Cuando abre el link y fija su contraseña,
  Entonces entra con sesión a la cuenta (el token generado sigue siendo
  válido para el flujo de activación).
- **CA-3** `[manual]` — Administrador de la organización, sin membership
  directa en la sede.
  Dado que es ADMIN de la organización padre de la sede B,
  Cuando invita a un médico a B,
  Entonces recibe 200 y la membership queda creada en B.
- **CA-4** `[manual]` — Administrador de una sede.
  Dado que es ADMIN directo de la sede A,
  Cuando invita a alguien como USER a A, o a otra persona como ADMIN de A,
  Entonces recibe 200 en ambos casos.
- **CA-5** `[manual]` — Administrador con plan al tope de médicos.
  Dado que su plan ya no admite otro médico,
  Cuando invita a un médico nuevo,
  Entonces recibe 402 con el mensaje del plan (antes 500), y en el formulario
  de la UI ese mensaje aparece en el toast.
- **CA-6** `[manual]` — Administrador que invita un correo que ya tiene
  cuenta en otra clínica de WizyDoc.
  Dado ese correo,
  Cuando lo invita a su sede,
  Entonces recibe 422 "Ya existe una cuenta con este correo en otra cuenta"
  (antes 500).
- **CA-7** `[e2e]` — Recepción que abre a mano la URL de usuarios de su sede.
  Dada la URL `/account/<accountId>/organization/<orgId>/clinic/<A>/users`,
  Cuando la abre,
  Entonces ve la página de error del segmento y no hay botón "Invitar
  usuario" (como hoy).

### Lo que deja de ser posible

- **CA-8** `[manual]` — Recepción (USER) de la sede A.
  Dado que tiene sesión,
  Cuando se invita a sí misma a la sede B como ADMIN, como DOCTOR o como
  USER,
  Entonces recibe 403 "Sólo un administrador de la sede puede invitar
  usuarios" en los tres casos, sin escrituras, y `GET /clinic/B/users` le
  sigue respondiendo 404.
- **CA-9** `[manual]` — Recepción (USER) de la sede A.
  Cuando invita a un tercero como ADMIN de su propia sede A,
  Entonces recibe 403 y no hay escrituras.
- **CA-10** `[manual]` — Médico (DOCTOR) de la sede A.
  Cuando se invita a sí mismo como ADMIN de B, o invita a un tercero como
  USER de A,
  Entonces recibe 403 y no hay escrituras.
- **CA-11** `[manual]` — Administrador de la sede A que no es administrador de
  B ni de la organización.
  Cuando invita a alguien a la sede B,
  Entonces recibe 403 y no hay escrituras.
- **CA-12** `[manual]` — Miembro de la organización con rol USER o DOCTOR
  (acceso heredado, sin membership directa en la sede).
  Cuando se invita como ADMIN de una sede de esa organización,
  Entonces recibe 403 y no hay escrituras.
- **CA-13** `[manual]` — Administrador cuya membership ADMIN está borrada
  (`deletedAt` con fecha, simulado en la base local).
  Cuando invita a alguien a esa sede,
  Entonces recibe 403.
- **CA-14** `[manual]` — Miembro de otra cuenta (ADMIN de su propia cuenta).
  Dado el `resourceId` de una sede de esta cuenta,
  Cuando invita a alguien a esa sede,
  Entonces recibe 404 "Sede no encontrada" y no hay escrituras.
- **CA-15** `[manual]` — Miembro de otra cuenta que falsificó su `accountId`
  (sólo en local, antes del arreglo de `auth.ts`).
  Dado que su `accountId` apunta a la cuenta víctima y volvió a iniciar
  sesión,
  Cuando se invita como ADMIN de una sede de la cuenta víctima,
  Entonces recibe 403 y no hay escrituras.
- **CA-16** `[manual]` — Administrador que manda un recurso que no es una
  sede.
  Dado el id de una organización o un id inexistente,
  Cuando invita a alguien con ese `resourceId`,
  Entonces recibe 404 "Sede no encontrada".
- **CA-17** `[manual]` — Atacante sin sesión.
  Cuando llama a `POST /user/invite`,
  Entonces recibe el mismo rechazo que hoy (la política de la ruta no cambia)
  y no hay escrituras.

### Lo que no debe filtrarse

- **CA-18** `[manual]` — Recepción o médico que sondea correos.
  Dado un correo que tiene cuenta en otra clínica de WizyDoc y otro que no
  existe,
  Cuando intenta invitar a cada uno a una sede de su cuenta,
  Entonces recibe en ambos el mismo 403 con el mismo cuerpo, sin que se cree
  ningún `user` ni se envíe ningún correo.
- **CA-19** `[manual]` — Quien lee los logs del api.
  Dado un error no previsto en la invitación (p. ej. reinvitar a la misma
  persona en la misma sede, P2002),
  Cuando se lee la línea `[invite-user]`,
  Entonces muestra sólo `errName` y `errCode` (`"P2002"`), sin correo,
  teléfono ni el error original; y la respuesta es 500 con el mensaje
  genérico.
- **CA-20** `[manual]` — Integridad entre cuentas.
  Tras ejecutar todos los criterios anteriores,
  Cuando se buscan memberships cuyo `account_id` difiere del de su recurso,
  Entonces no hay ninguna.
