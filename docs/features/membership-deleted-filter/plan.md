# membership-deleted-filter — Las lecturas de memberships respetan `deletedAt`

Rama `fix/membership-deleted-filter`, desde `origin/main` (512eaa6).

## Objetivo

Que toda lectura que decide **acceso** (política, `/me/...`) o que **lista
personas** (usuarios de la sede, médicos del booking, huecos) ignore las
memberships con `deletedAt` no nulo, para que el futuro «quitar a un usuario de
una sede» funcione en cuanto exista, sin dejar puertas abiertas.

## Contexto

- `UserResourceMembership.deletedAt` existe (`api/prisma/schema.prisma:97`) con
  `@@unique([userId, resourceId])` (`:99`).
- **Nada en `api/src` escribe `deletedAt` hoy.** Sólo el helper de e2e
  `softDeleteMembership` (`platform/e2e/support/invitations.ts:102`). Por eso
  este ticket no cambia el comportamiento en producción: deja las lecturas
  listas para cuando exista el borrado.
- **Fuera de este ticket:** construir el flujo de quitar a un usuario de una
  sede u organización (endpoint, UI, qué pasa con su `DoctorProfile`, sus
  citas futuras y su reinvitación). Ver «Riesgos».
- `DoctorProfile` no tiene `deletedAt`: que un médico ya no atiende en una sede
  se registra en su membership de esa sede (decisión de #50,
  `create-appointment.usecase.ts:70`). Todo perfil de médico nace con su
  membership directa en la sede (`invite-user.usecase.ts:178-197`; es el único
  `doctorProfile.create` de `api/src`), así que «médico reservable» = perfil +
  membership viva **en esa misma sede**; la herencia desde la organización no
  cuenta para el booking.

## Inventario completo de lecturas de memberships

Búsqueda por `userResourceMembership`, `resourceMemberships`,
`userResourceMemberships`, `user_resource_membership`, `membership` (relación
desde `UserInvitation`), `GetUserMembership`/`UserMembershipsQuery`, todo
`$queryRaw`, y lecturas de `doctorProfile` que equivalen a «médico de la sede»
(porque `DoctorProfile` no tiene `deletedAt` y depende de la membership).
`api/src/generated` excluido.

### Lecturas de `UserResourceMembership`

| # | Lectura | Para qué | Estado | Evidencia |
| - | ------- | -------- | ------ | --------- |
| 1 | `GetUserMembership` — membership directa | Autoriza toda ruta con `member`/`roles` (vía `policy.ts:172`) y responde `GET /user/me/resource/:resourceId/membership` (`routes/user/index.ts:117-123`), que usan los layouts de sede y organización | **Ignora** | `infrastructure/postgres/queries/membership/get-user-membership.query.ts:30-33` (`findUnique` sólo por `userId_resourceId`) |
| 2 | `GetUserMembership` — membership heredada de la organización | Mismo uso; rol efectivo `max(directa, heredada)` | **Ignora** | `get-user-membership.query.ts:60-64` |
| 3 | `UserMembershipsQuery` | `GET /user/me/memberships` → página `/account/[accountId]/select` | **Ignora** | `infrastructure/postgres/queries/membership/get-user-memberships.query.ts:24-25` (`where: { userId, accountId }`) |
| 4 | `GetClinicUsersQuery` (SQL crudo) | `GET /clinic/:resourceId/users` (ADMIN), lista de usuarios de la sede | **Ignora** | `infrastructure/postgres/queries/clinic/get-clinic-users.query.ts:13-20` |
| 5 | `GetClinicMetricsQuery` — `memberships` | Conteo de miembros de la sede (ADMIN) | Respeta | `infrastructure/postgres/queries/clinic/get-clinic-metrics.query.ts:30-32` |
| 6 | `InviteUserUseCase.assertDoctorSeatAvailable` | Cupo de médicos del plan | Respeta | `application/use-cases/user/invite-user.usecase.ts:81-85` |
| 7 | `InviteUserUseCase.assertInviterIsAdmin` | Quien invita es ADMIN de la sede u organización | Respeta | `invite-user.usecase.ts:107-116` (comentario `:96` «No se reutiliza GetUserMembership: ignora deletedAt») |
| 8 | `UpdatePatientRecordUseCase.isClinicalStaff` | Editar datos de salud de la ficha | Respeta | `application/use-cases/patient/update-patient-record.usecase.ts:87-95` |
| 9 | `CreateOrganizationUseCase.assertCanCreateOrganization` | ADMIN de alguna organización | Respeta | `application/use-cases/organization/create-organization.use-case.ts:31-40` |
| 10 | `CreateClinicUseCase.assertCanCreateClinic` | ADMIN de la organización | Respeta | `application/use-cases/clinic/create-clinic.usecase.ts:41-50` |
| 11 | `CreateApointmentUseCase.findBookableDoctor` | Booking público: médico con membership viva en la sede | Respeta | `application/use-cases/appointment/create-appointment.usecase.ts:68-73` |
| 12 | `AcceptInvitationUseCase.pendingInvitationWhere` | Invitación con membership viva | Respeta | `application/use-cases/user-invitation/accept-invitation.usecase.ts:49` |
| 13 | `SetPasswordUseCase` (mismo filtro) | Igual que 12 | Respeta | `application/use-cases/user-invitation/set-password.usecase.ts:74` |
| 14 | `VerifyInvitationTokenUseCase` | Lee la membership **incluida la borrada** para responder «token inválido» | Respeta (a propósito la lee y la rechaza) | `application/use-cases/user-invitation/verify-invitation-token.usecase.ts:22-28`, `:44` |
| 15 | `organization.repository.ts` | Crea la membership ADMIN de la organización | No aplica (escritura) | `infrastructure/postgres/repositories/organization.repository.ts:43` |
| 16 | `invite-user` — `userResourceMembership.create` | Alta de la membership | No aplica (escritura; ver Riesgos: choca con `@@unique` al reinvitar) | `invite-user.usecase.ts:189-197` |

### Lecturas de «médico de la sede» que dependen de la membership

| # | Lectura | Para qué | Estado | Evidencia |
| - | ------- | -------- | ------ | --------- |
| 17 | `GetClinicDoctorsQuery` (SQL crudo) | Público `GET /clinic/:clinicId/doctors` (`routes/clinic/public.ts:11`), paso «médico» del wizard | **Ignora** | `infrastructure/postgres/queries/clinic/get-clinic-doctors.query.ts:11-22` (sólo `doctor_profile`, sin membership) |
| 18 | `GetDoctorSlotsQuery` | Público `GET /doctor-profile/:doctorProfileId/slots` (`routes/doctor-profile/index.ts:51`), paso «fecha y hora» | **Ignora** | `infrastructure/postgres/queries/doctor-profile/get-doctor-slots.query.ts:42-46` |
| 19 | `GetDoctorProfileAvailabilityQuery` (SQL crudo) | Público `GET /doctor-profile/:doctorProfileId/availability` (`routes/doctor-profile/index.ts:18`). **platform no lo usa**: `lib/actions/doctor-profile/get-availability.action.ts` no se importa en ningún sitio | Ignora | `infrastructure/postgres/queries/doctor-profile/get-doctor-profile-availability.query.ts:23-29` |
| 20 | `GetClinicMetricsQuery` — `doctors` | Conteo de médicos de la sede (ADMIN) | Ignora (conteo) | `get-clinic-metrics.query.ts:29` |
| 21 | `GetOrganizationsDoctorCountQuery` | Conteo de médicos de la organización (ADMIN) | Ignora (conteo) | `infrastructure/postgres/queries/organization/get-organizations-doctor-count.query.ts:14-16` |
| 22 | `GetDoctorAvailabilityUseCase` / `InsertAvailabilityUseCase` | El médico ve/edita su propia disponibilidad | No aplica: detrás de `member`/`roles` (`routes/clinic/index.ts:187-192`, `:230-235`); queda cubierta al corregir 1-2 | `application/use-cases/availability/get-doctor-availability.usecase.ts:17-21`, `insert-availability.usecase.ts:37-44` |
| 23 | `GetClinicAppointmentsQuery`, `get-patient-detail.query.ts` | Nombre del médico de citas ya existentes | No aplica: histórico; la cita de un médico ya removido sigue siendo suya | `get-clinic-appointments.query.ts:37-39`, `application/queries/patient/get-patient-detail.query.ts:42` |
| 24 | `LookupAccountUserQuery` | Busca un usuario de la cuenta por correo para reinvitar | No aplica: lee `user`, no memberships; que aparezca un usuario removido es lo deseado | `infrastructure/postgres/queries/user/lookup-account-user.query.ts:21-24` |

Otros `$queryRaw` revisados sin relación con memberships:
`set-password.usecase.ts:39` (bloqueo de `user`), `lock-account-quota.ts:13`.
`plugins/auth.ts`, `entitlements.ts` y Better Auth no leen memberships.

## Alcance recomendado

**Corregir las cinco lecturas que deciden acceso o exponen personas: 1, 2, 3,
4, 17 y 18** (seis condiciones en cinco archivos). Quedan fuera:

- **19** (`/doctor-profile/:id/availability`): nadie lo consume. Lo simple es
  borrarlo, pero eso es otro ticket (decisión abierta D2).
- **20 y 21** (conteos de médicos): no dan acceso ni exponen datos; sólo
  inflan un número del panel. El 21 además no se puede expresar bien en Prisma
  (habría que comparar la sede del perfil con la de la membership). Se anotan
  para el ticket del flujo de borrado (D1).
- **22**: queda cubierta por la política.

### Un único punto de entrada vs. repetir la condición

| Opción | Cubre | Contra |
| ------ | ----- | ------ |
| **A. Repetir `deletedAt: null` / `deleted_at IS NULL` en cada lectura** | Todo, incluido SQL crudo | Hay que acordarse en cada consulta nueva |
| B. Extensión de Prisma (`$extends`) que añade el filtro a toda lectura del modelo | Lecturas directas por Prisma | No cubre `$queryRaw` (2 de los 5 archivos) ni filtros/`include` anidados (`some`, `membership: {...}`); rompe `verify-invitation`, que necesita ver la borrada; regla invisible en `client.ts` |
| C. Constante `LIVE_MEMBERSHIP = { deletedAt: null }` | Sólo Prisma | Indirección para un filtro de una palabra |
| D. Que todo pase por `GetUserMembership` | Autorización | Los use cases preguntan otras cosas («ADMIN en algún recurso de la cuenta», «ADMIN de la organización»): sería refactorizar seis casos de uso de paso |

**Recomendación: A.** El punto de entrada para **autorización** ya existe y es
uno: `GetUserMembership`, que usan `policy` y `/me/resource/...`; corregirlo
cubre todas las rutas con `member`/`roles`. El resto son consultas con formas
distintas (dos de ellas SQL crudo) donde la condición es una palabra. Ya se
repite así en las 11 lecturas que la respetan. Para que no se olvide en las
consultas nuevas: una línea en `api/AGENTS.md` (D4) y los casos e2e de este
ticket.

## Cambios por capa

**Prisma:** ninguno. Sin migración. Los filtros nuevos van sobre
`(userId, resourceId)`, cubierto por el índice único, o sobre `userId` como
prefijo de ese mismo índice.

**api:** sólo queries de `infrastructure`. **Ninguna ruta nueva ni cambio de
política.** No se toca `policy.ts`, `auth.ts` ni `entitlements.ts`.

1. `api/src/infrastructure/postgres/queries/membership/get-user-membership.query.ts`
   - Directa (`:30`) e heredada (`:60`): añadir `deletedAt: null` al `where`
     junto a `userId_resourceId`. Prisma (≥ 5) acepta filtros no únicos en
     `findUnique` junto a la clave única; si el engineer prefiere `findFirst`,
     da igual. El resto de la lógica no cambia: si la directa está borrada,
     `direct` es `null` y el código ya cae a `resource.findUnique` (`:47-52`) y a
     la herencia.
2. `api/src/infrastructure/postgres/queries/membership/get-user-memberships.query.ts`
   - `where: { userId, accountId, deletedAt: null }` (`:25`).
3. `api/src/infrastructure/postgres/queries/clinic/get-clinic-users.query.ts`
   - Añadir `AND urm.deleted_at IS NULL` al `WHERE`. No se reescribe el resto de
     la consulta (ver «Fuera de alcance»).
4. `api/src/infrastructure/postgres/queries/clinic/get-clinic-doctors.query.ts`
   - Añadir al `WHERE`:
     `AND EXISTS (SELECT 1 FROM user_resource_membership urm WHERE urm.user_id = dp.user_id AND urm.resource_id = dp.resource_id AND urm.deleted_at IS NULL)`.
     `EXISTS` y no `JOIN` para que sea un filtro que no multiplica filas ni toca
     el `GROUP BY`. Misma regla que `findBookableDoctor` (membership en la
     **misma** sede del perfil, no heredada).
   - Un comentario de una línea con el porqué, como en `create-appointment`:
     `DoctorProfile` no tiene `deleted_at`; quitar al médico se registra en su
     membership.
5. `api/src/infrastructure/postgres/queries/doctor-profile/get-doctor-slots.query.ts`
   - Método privado `isBookable(doctorProfileId)`: lee el perfil
     (`userId`, `clinicId`) y busca su membership viva
     (`userId_resourceId: { userId, resourceId: clinicId }`, `deletedAt: null`).
     Dos consultas legibles: Prisma no puede comparar la sede del perfil con la
     de la membership en un solo filtro relacional.
   - Si no es reservable, se responde **igual que hoy con un id inexistente**:
     `200` con cada día del rango y su lista vacía (D3). Se consigue sin rama
     aparte: con `availabilities = []` el bucle ya produce días vacíos; se puede
     saltar la consulta de citas.
6. `api/src/application/use-cases/user/invite-user.usecase.ts:96`
   - Borrar el comentario «No se reutiliza GetUserMembership: ignora
     deletedAt.»: tras este ticket es falso. **No** se cambia la consulta de
     `assertInviterIsAdmin` (sería refactorizar de paso).
7. `api/AGENTS.md` (si se aprueba D4), sección «Autorización», una línea:
   «Toda lectura de `UserResourceMembership` filtra `deletedAt: null` (en SQL,
   `deleted_at IS NULL`), salvo que necesite ver las borradas para rechazarlas
   (invitaciones).»

**platform:** sin cambios de código. Sólo e2e:

8. `platform/e2e/support/accounts.ts` — `createMemberWithRole` devuelve también
   `membershipId` (lo devuelve el `create` que ya hace en `:206`). Campo nuevo
   en `SeededMember`; los llamadores actuales no cambian.
9. `platform/e2e/api/security/membership-deleted-filter.spec.ts` — nuevo (ver
   «e2e»).

## Comportamiento con una membership borrada

Ninguno cambia hoy en producción (nadie escribe `deletedAt`); describe lo que
pasará cuando exista el borrado.

| Lectura | Antes | Después |
| ------- | ----- | ------- |
| `policy` (`member`/`roles`) sobre una sede donde la única membership del usuario está borrada | Pasa con el rol borrado | **404** «Resource not found» (`policy.ts:180-182`), igual que un recurso de otra cuenta: no se distingue «te quitaron» de «no existe» |
| `policy` sobre una organización con la membership de la organización borrada | Pasa | **404** (directa nula; el recurso no es sede, `:58` devuelve `undefined`) |
| `GET /user/me/resource/:id/membership` | Devuelve la membership | Cuerpo vacío, como hoy para un no miembro → el layout de sede (`platform/src/app/account/[accountId]/clinic/[clinicId]/layout.tsx:34-44`) muestra «No se pudo cargar la sede» y el de organización «No se pudo cargar el workspace». Es el estado que ya ve un no miembro; no se toca |
| `/select` (`GET /user/me/memberships`) | Lista la sede | La sede **desaparece**. Si era lo único que tenía en esa organización, desaparece el grupo entero. Next 15 no cachea `fetch` por defecto y `lib/api/fetch.ts` no fija `cache`: lo ve en la siguiente carga |
| `GET /clinic/:id/users` (ADMIN) | Lista al removido | No aparece |
| Booking: `GET /clinic/:clinicId/doctors` | Ofrece al médico removido; al reservar, 404 (desde #50) | No aparece; listado y reserva coinciden |
| Booking: `GET /doctor-profile/:id/slots` | Muestra huecos del médico removido | `200` con días vacíos (como un id inexistente); el wizard muestra que no hay horarios (`datetime-step.tsx:75`, `:115`) |
| Métricas de la sede, invitaciones, ficha, crear organización/sede, reservar | Ya filtraban | Sin cambio |

### Membership directa borrada con herencia viva

Caso: el usuario es miembro de la organización (p. ej. `USER`) y tenía además
membership directa `DOCTOR` en la sede, que se borra.

- `policy` / `/me/resource/:sedeId/membership`: **sigue entrando a la sede por
  herencia**, con el rol de la organización: `role: "USER"`,
  `accessVia: "INHERITED_FROM_ORG"`, `membershipId: null`. Una ruta con
  `roles: ["ADMIN", "DOCTOR"]` (p. ej. `PUT /clinic/:id/availability`) le
  responde **403** («Insufficient role»), no 404, porque sí es miembro.
- `/select`: la sede sigue apareciendo dentro del grupo de la organización,
  ahora como `INHERITED_FROM_ORG` con el rol de la organización (el bucle de
  `:66-112` ya no la ve como directa).
- Booking: el médico **no** se ofrece en esa sede: la reserva, el listado y los
  huecos exigen membership viva **en la sede**, no heredada.
- Caso inverso (organización borrada, sede directa viva): conserva la sede; en
  `/select` el grupo aparece con `membership: null` (como hoy para quien sólo
  tiene sedes) y las rutas de organización le responden 404.

Esto es coherente con el modelo: quitar de una sede no quita de la
organización. Ver D5.

## Aislamiento entre cuentas

No se lee ni escribe ningún dato nuevo; los cambios sólo **restringen**
consultas existentes:

- `GetUserMembership` sigue buscando por `(userId de la sesión, resourceId)`.
- `UserMembershipsQuery` sigue acotada por `userId` y `accountId` de la sesión.
- `GetClinicUsersQuery` sigue detrás de `roles: ["ADMIN"]` sobre `:resourceId`.
- Públicos: `get-clinic-doctors` recibe sólo `clinicId` y la membership se
  correlaciona con **el mismo** `dp.user_id` y `dp.resource_id` de cada fila;
  `get-doctor-slots` recibe sólo `doctorProfileId` y la membership se busca con
  el `userId` y `clinicId` leídos de ese perfil, nunca de la petición. Ningún
  endpoint público recibe ids nuevos.

## Cambios que requieren confirmación

**Ninguno.** La corrección de la política vive entera en
`GetUserMembership`; `policy.ts`, `auth.ts` y `entitlements.ts` no se tocan.

## e2e

### Casos nuevos — `platform/e2e/api/security/membership-deleted-filter.spec.ts`

Con `createOnboardedAdmin`, `createOrganizationResource`, `createClinicResource`,
`createMemberWithRole` (con `membershipId`), `createSpecialty`,
`invitePendingUser`, `seedFullDayAvailability` y `softDeleteMembership`. Cada
caso comprueba primero el estado vivo (control) y después el borrado, para que
un 404 no pase por un fixture roto.

1. **Política, sin herencia:** `USER` con membership directa en la sede.
   `GET /clinic/:id/appointments/today` → 200; tras borrar → 404.
2. **Política, ADMIN removido:** `ADMIN` directo en la sede;
   `GET /clinic/:id/users` → 200; tras borrar → 404.
3. **`/me/resource`:** tras borrar, `GET /user/me/resource/:sedeId/membership`
   no devuelve membership.
4. **Herencia viva:** `USER` en la organización + `DOCTOR` directo en la sede
   (perfil vía `invitePendingUser` + `createMemberWithRole` en la organización,
   o ambas memberships por Prisma). Tras borrar la directa:
   `/me/resource/:sedeId/membership` → `role: "USER"`,
   `accessVia: "INHERITED_FROM_ORG"`, `membershipId: null`;
   `GET /clinic/:id/appointments/today` → 200;
   `PUT /clinic/:id/availability` → 403.
5. **Organización borrada, sede viva:** `GET /organization/:orgId/clinics` → 404;
   `GET /user/me/memberships` → grupo con `membership: null` y la sede como
   `DIRECT`.
6. **`/me/memberships`:** con una sede directa borrada y otra viva, sólo
   aparece la viva; con la única borrada, el grupo no aparece.
7. **Usuarios de la sede:** el ADMIN no ve en `GET /clinic/:id/users` al usuario
   cuya membership se borró; sí al que sigue vivo.
8. **Booking, listado:** dos médicos en la sede; tras borrar a uno,
   `GET /clinic/:clinicId/doctors` sólo devuelve al otro.
9. **Booking, huecos:** médico con `seedFullDayAvailability`; antes hay huecos;
   tras borrar, `GET /doctor-profile/:id/slots` → 200 con todos los días
   vacíos, igual que con un `doctorProfileId` inexistente.

Opcional en UI (decide el PM): el usuario removido entra a `/select` y no ve la
sede.

### Specs existentes que deben seguir pasando

Toda la suite, con atención a las que ya usan memberships borradas o la
política:

- `e2e/api/security/fix-booking-scope.spec.ts` (CA-7: reserva con membership
  borrada → 404; no cambia).
- `e2e/api/invitations/fix-invitation-set-password.spec.ts` (token de
  membership borrada) y `e2e/ui/invitations/invitation-invalid-link.spec.ts`.
- `e2e/api/user/fix-invite-role-check.spec.ts`,
  `e2e/api/security/fix-org-clinic-creation-role.spec.ts`,
  `e2e/api/security/fix-specialty-account-scope.spec.ts`,
  `e2e/api/security/fix-user-by-email-scope.spec.ts` (rutas con `roles`).
- `e2e/ui/clinic/public-booking.spec.ts`,
  `e2e/ui/booking/public-booking-specialty-scope.spec.ts` (listado y huecos del
  wizard).
- `e2e/ui/account/create-organization-button.spec.ts`,
  `e2e/ui/auth/onboarding*.spec.ts` (`/select`).
- `e2e/api/smoke.spec.ts`.

## Criterios que debe redactar el product-manager

Sugeridos como `[e2e]`, uno por caso 1-9 de arriba. Además, sin `[e2e]`:

- Ninguna ruta ni política nueva; `policy.ts`, `auth.ts`, `entitlements.ts` sin
  cambios (revisión del diff).
- Las 11 lecturas que ya respetaban `deletedAt` no cambian (revisión).
- El comentario de `invite-user.usecase.ts:96` ya no está (revisión).
- `pnpm typecheck` y `pnpm check` limpios en `api` y `platform`.

## Criterios de aceptación

«Borrada» significa membership con `deletedAt` no nulo, marcada con
`softDeleteMembership`. En cada criterio `[e2e]` se comprueba primero el estado
vivo (control) y después el borrado, en el mismo caso, para que un 404 o una
lista vacía no pasen por un fixture roto. Todos van en
`platform/e2e/api/security/membership-deleted-filter.spec.ts`. No se añade
caso de UI para `/select`: CA-6 lo cubre en el API y hoy el cambio no es
observable en producción.

**Acceso del personal**

- **CA-1 `[e2e]` Quitado de la sede sin herencia pierde el acceso.** Un usuario
  `USER` con membership directa en una sede y ninguna en su organización recibe
  `200` en `GET /clinic/:id/appointments/today`. Tras borrar esa membership, la
  misma petición responde `404` «Resource not found», igual que una sede de
  otra cuenta.
- **CA-2 `[e2e]` Un ADMIN quitado de la sede pierde la administración.** Un
  `ADMIN` directo de la sede recibe `200` en `GET /clinic/:id/users`. Tras
  borrar su membership responde `404`.
- **CA-3 `[e2e]` La app deja de reconocerlo como miembro de la sede.** Con la
  membership viva, `GET /user/me/resource/:sedeId/membership` devuelve la
  membership. Tras borrarla no devuelve ninguna membership: la misma respuesta
  que hoy recibe un no miembro.
- **CA-4 `[e2e]` Quitado de la sede, conserva lo que le da la organización
  (D5).** Usuario `USER` en la organización y `DOCTOR` directo en la sede. Tras
  borrar sólo la membership de la sede:
  - `GET /user/me/resource/:sedeId/membership` devuelve `role: "USER"`,
    `accessVia: "INHERITED_FROM_ORG"` y `membershipId: null`;
  - `GET /clinic/:id/appointments/today` responde `200`;
  - `PUT /clinic/:id/availability` responde `403` (es miembro, pero ya no
    médico de esa sede), no `404`.
- **CA-5 `[e2e]` Quitado de la organización, conserva la sede directa.**
  Usuario con membership en la organización y membership directa viva en una
  de sus sedes. Tras borrar la de la organización:
  - `GET /organization/:orgId/clinics` responde `404`;
  - `GET /user/me/memberships` devuelve el grupo de esa organización con
    `membership: null` y la sede como `DIRECT`.
- **CA-6 `[e2e]` El selector de cuenta sólo muestra lo vivo.** Usuario con
  membership directa en dos sedes de la misma organización y ninguna en la
  organización. Tras borrar una, `GET /user/me/memberships` sólo incluye la
  otra. Tras borrar también la segunda, el grupo de esa organización no
  aparece.

**Listados**

- **CA-7 `[e2e]` La lista de usuarios de la sede no muestra a los quitados.**
  Con dos usuarios en la sede, el ADMIN ve a ambos en `GET /clinic/:id/users`.
  Tras borrar la membership de uno, sólo ve al que sigue vivo.

**Booking público (paciente sin cuenta)**

- **CA-8 `[e2e]` Un médico quitado no se ofrece al paciente.** Con dos médicos
  en la sede, `GET /clinic/:clinicId/doctors` devuelve a ambos. Tras borrar la
  membership de uno en esa sede, sólo devuelve al otro.
- **CA-9 `[e2e]` Un médico quitado no muestra horarios (D3).** Médico con
  `seedFullDayAvailability`: `GET /doctor-profile/:id/slots` devuelve huecos.
  Tras borrar su membership en la sede, responde `200` con los mismos días del
  rango y todos vacíos, idéntico a la respuesta para un `doctorProfileId`
  inexistente.

**Regresión**

- **CA-10 `[e2e]` La suite existente sigue pasando.** La suite e2e completa
  pasa, y en particular los specs listados en «Specs existentes que deben
  seguir pasando»: `fix-booking-scope` (CA-7 de ese ticket: reservar con
  membership borrada → `404`), `fix-invitation-set-password`,
  `invitation-invalid-link`, `fix-invite-role-check`,
  `fix-org-clinic-creation-role`, `fix-specialty-account-scope`,
  `fix-user-by-email-scope`, `public-booking`,
  `public-booking-specialty-scope`, `create-organization-button`,
  `onboarding*` y `smoke`.

**Revisión del diff**

- **CA-11 `[revisión]` Alcance.** En `api/src` sólo cambian los cinco archivos
  de `infrastructure` del plan (`get-user-membership.query.ts`,
  `get-user-memberships.query.ts`, `get-clinic-users.query.ts`,
  `get-clinic-doctors.query.ts`, `get-doctor-slots.query.ts`) y se borra el
  comentario de `invite-user.usecase.ts:96`, sin tocar la consulta de
  `assertInviterIsAdmin`. En `platform` sólo cambian `e2e/support/accounts.ts`
  (`membershipId` en `SeededMember`) y el spec nuevo. Las lecturas 5-16 y 19-24
  del inventario no cambian (D1, D2).
- **CA-12 `[revisión]` Sin cambios de autorización.** `policy.ts`, `auth.ts` y
  `entitlements.ts` no aparecen en el diff. No hay rutas nuevas ni `policy({...})`
  nuevas o modificadas.
- **CA-13 `[revisión]` Sin cambios de modelo.** `schema.prisma` no cambia y no
  hay migración nueva.
- **CA-14 `[revisión]` La regla queda escrita (D4).** La sección «Autorización»
  de `api/AGENTS.md` incluye: «Toda lectura de `UserResourceMembership` filtra
  `deletedAt: null` (en SQL, `deleted_at IS NULL`), salvo que necesite ver las
  borradas para rechazarlas (invitaciones).»
- **CA-15 `[revisión]` Los endpoints públicos no aceptan ids nuevos.** En
  `get-clinic-doctors` la membership se correlaciona con `dp.user_id` y
  `dp.resource_id` de cada fila; en `get-doctor-slots` el `userId` y el
  `clinicId` salen del perfil leído, nunca de la petición.
- **CA-16 `[revisión]`** `pnpm typecheck` y `pnpm check` limpios en `api` y
  `platform`.

## Riesgos

- **Sin efecto observable hoy:** nadie escribe `deletedAt`, así que en
  producción no cambia nada. Sólo el e2e lo demuestra.
- **Reinvitar a un removido fallará** (fuera de alcance, anotado para el flujo
  de borrado): `invite-user` crea una membership nueva y choca con
  `@@unique([userId, resourceId])` (`schema.prisma:99`); si es médico, también
  con `@@unique([userId, clinicId])` de `DoctorProfile` (`:117`). El flujo de
  borrado tendrá que decidir entre reactivar (`deletedAt = null`) o crear.
- **Dueño sin memberships en `/select`:** `canCreateOrganization`
  (`select/page.tsx:13-15`) muestra el botón al dueño con 0 memberships, pero
  `create-organization` cuenta organizaciones, no memberships, y le daría 403.
  Sólo pasa si se borra la membership del dueño, cosa que ningún flujo hace
  (lo dice el propio comentario). Anotado para el flujo de borrado.
- **Conteos de médicos (20, 21)** seguirán contando a removidos hasta que se
  corrijan (D1).

## Fuera de alcance

- El flujo de quitar a un usuario de una sede u organización (endpoint, UI,
  perfil de médico, citas futuras, reinvitación).
- Reescribir `get-clinic-users.query.ts` (el `JOIN` con `clinic` sin relación
  explícita funciona porque ambas condiciones usan el mismo `resourceId`).
- El `console.log` de depuración en `routes/user/index.ts:125`.
- Los conteos 20 y 21 y el endpoint 19, según D1 y D2.
- Mensajes del layout de sede para quien no es miembro (estado ya existente).

## Decisiones

Las cinco se tomaron el 8 de octubre de 2026 tal como las recomienda el plan.

- **D1. Alcance. Tomada: sólo acceso y listados.** ¿Sólo acceso y listados (1-4, 17, 18) o también los conteos
  de médicos (20, 21)? **Recomiendo sólo acceso y listados:** los conteos no
  abren nada, y el 21 pide una consulta que no vale la pena antes de que exista
  el borrado.
- **D2. `GET /doctor-profile/:id/availability` (19). Tomada: fuera de este
  ticket; se abre otro para borrarlo.** Público, nadie lo usa y
  muestra el horario de un médico removido. **Recomiendo dejarlo fuera y abrir
  un ticket para borrarlo**: filtrarlo sería mantener código muerto.
- **D3. Huecos de un médico removido. Tomada: `200` con días vacíos.** ¿`200` con días vacíos o `404`?
  **Recomiendo `200` vacío:** es lo que hoy responde un id inexistente, no
  revela nada y el wizard ya lo muestra sin cambios en platform.
- **D4. Regla en `api/AGENTS.md`. Tomada: se añade.** ¿Añadir la línea «toda lectura de
  `UserResourceMembership` filtra `deletedAt: null`»? **Recomiendo sí:** es lo
  único que evita olvidarlo en la próxima consulta sin introducir una
  abstracción.
- **D5. Herencia viva tras quitar de la sede. Tomada: conserva el acceso que
  da la organización.** ¿Quitar de una sede deja el
  acceso que da la organización? **Recomiendo sí** (es lo que hace el modelo
  hoy y lo que implementa este plan); si el producto quiere «quitar de todo»,
  lo decide el flujo de borrado, que borrará también la de la organización.

## Verificación

- `cd api && pnpm typecheck && pnpm check`; `cd platform && pnpm typecheck && pnpm check`.
- e2e: `cd api && docker compose -f docker-compose.e2e.yml up -d`; `cd platform && pnpm test:e2e` — el spec nuevo y la suite completa.
- Manual en local (base de desarrollo, nunca producción): marcar
  `deleted_at = now()` en la membership de un usuario de prueba y comprobar
  `GET /user/me/memberships`, `GET /clinic/:id/appointments/today` (404) y
  `GET /clinic/:clinicId/doctors`; en el navegador, `/account/<id>/select` sin
  la sede y el wizard de `/clinic/<id>/create-appointment` sin el médico.

## Observaciones de producto (sin resolver)

Choques con `docs/PRODUCT.md` que este ticket no cambia y debería resolver el
futuro flujo de quitar a un usuario:

- **«El médico no coordina nada».** Las citas futuras de un médico removido
  siguen existiendo, pero el médico ya no aparece en el booking. Sin una regla
  para esas citas (reasignar, cancelar y avisar al paciente), alguien tendrá
  que coordinarlas a mano.
- **Paciente sin salida.** Con D3, quien llegue con un enlace o estado antiguo
  a los huecos de un médico removido ve «no hay horarios» sin otra opción. Es
  poco probable porque el listado ya no lo ofrece, pero termina en un callejón
  sin salida.
- **«Simple antes que completo».** Al usuario removido, el panel le muestra
  «No se pudo cargar la sede» o «No se pudo cargar el workspace», que parece un
  fallo y no una baja. Es un estado que ya existe para quien no es miembro.
- **Privacidad (D5).** Quitar a alguien de una sede no le quita el acceso a
  los datos de esa sede, fichas de pacientes incluidas, si su rol en la
  organización se lo da. Es coherente con el modelo, pero quien lo quite puede
  creer que le cortó el acceso. El flujo de borrado debería mostrarlo.
- **Datos públicos (D2).** Hasta que se borre, `GET /doctor-profile/:id/availability`
  sigue mostrando el horario de un médico removido. No son datos de pacientes.
- **Métricas (D1).** Los conteos de médicos de sede y organización incluirán a
  los removidos. La métrica por sede es una función de pago (plan Clínica), así
  que ese error lo vería un cliente que paga.
- **Foco.** El ticket protege el uso multiusuario (clínicas con sedes y roles),
  no el del médico independiente, que es el foco actual. Es barato y cierra una
  puerta de acceso, pero no avanza ninguna de las prioridades de PRODUCT.md.
