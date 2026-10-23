# Plan: el perfil de médico cuelga de la membership

**Rama:** la de trabajo actual (`feat/doctor-specialties-6-users`, con sus cambios sin commit como
base). No se cambia de rama.
**Fecha:** 23 de octubre de 2026
**Sin mockup:** la UI reutiliza componentes existentes; los textos nuevos están en este plan.
**Antecedentes:**
- `docs/features/doctor-profile-specialties/plan.md`: quién edita especialidades
  (`CanEditOrganizationSpecialtiesQuery`, t-2), rutas sin `roles` (t-3), la columna
  «Especialidades» de Sedes › Ver usuarios (t-4, t-5).
- `docs/features/doctor-invite-clinic-users/plan.md`: **queda obsoleto**. De él se reutilizan dos
  hallazgos: el 500 al invitar como médico a un ADMIN que guardó especialidades en «Mi perfil»
  (`doctorProfile.create` choca con `@@unique([userId, clinicId])`; aquí desaparece porque el
  perfil se crea por membership) y que el acceso vale desde que existe la membership, sin mirar
  `user_invitation.status`.

## Objetivo

Un perfil de médico existe sólo como parte de una membership de sede: asignar a alguien como
Médico en una sede crea (o revive) su membership y su perfil en una transacción, desde un único
formulario que sirve para invitar, asignar y editar. Así el administrador se asigna como médico,
aparece en el booking y ve sus horarios, y ningún plan limita médicos.

## Decisiones del humano (firmes, 23 de octubre de 2026)

1. `DoctorProfile.membershipId` (único, FK a `UserResourceMembership`) reemplaza `userId` y
   `clinicId`. Sólo una membership de sede tiene perfil. Las citas siguen en `doctorProfileId`.
2. La membership conserva su `MembershipRole` (qué puede hacer en esa sede). El perfil dice que
   atiende ahí.
3. Asignar una sede con rol Médico crea membership + perfil (con especialidades) en una
   transacción.
4. Un solo formulario (`components/clinic/invite-user/form.tsx`) para invitar, asignar y editar.
   Membership viva → edita; borrada → la revive con su mismo perfil; otra sede con la invitación
   pendiente o aceptada → funciona.
5. El ADMIN de la organización (o el dueño) se asigna como Médico con ese formulario. «Atiende
   aquí» se decide por tener perfil vivo en la sede, no por `role === "DOCTOR"`.
6. Todo perfil existe sólo por una membership; se adapta «Mi perfil» y los dos endpoints de
   especialidades.
7. Sin límite de médicos: se quita `assertDoctorSeatAvailable`. No se tocan `entitlements.ts`,
   `policy.ts` ni `auth.ts`.
8. «Usuarios» en el menú de la sede para el ADMIN, con `account/[accountId]/clinic/[clinicId]/users`.

## Decisiones técnicas

| # | Decisión | Por qué |
| --- | --- | --- |
| t-1 | **«Perfil vivo» = su membership está viva (`deleted_at IS NULL`) y tiene rol `DOCTOR`.** Un solo predicado Prisma, `liveDoctorProfileWhere(...)`, y su equivalente SQL en las dos consultas crudas. Lo usan booking, slots, reservar, reprogramar, horarios, agenda, métricas, «Mi perfil», lista de usuarios y la membership del platform. | El perfil no se puede borrar (lo referencian citas y horarios). Mirar el rol permite que pasar a alguien de Médico a Usuario lo saque del booking sin perder nada, y que volver a Médico (o revivir la membership) reutilice el mismo perfil, horarios e historial. |
| t-2 | **Sólo la ruta de sede crea perfiles.** La de organización nunca toca `doctor_profile`. | Es la regla «sólo una membership de SEDE tiene perfil» (decisión 1), garantizada por construcción. |
| t-3 | **Se mantienen las dos rutas existentes y pasan a «asignar»:** `POST /organization/:resourceId/invitations` («Todas las sedes») y `POST /clinic/:resourceId/invitations` (una sede). Mismas políticas. El caso de uso conserva el nombre `InviteUserUseCase` y un comentario dice que asigna (crea, revive o edita). | `api/AGENTS.md`: el id de la sede va en `:resourceId`, nunca en el cuerpo; una ruta única con `clinicId` en el cuerpo lo violaría. No hay política nueva y los helpers de e2e (`inviteUserViaApi`) siguen apuntando a la misma URL. |
| t-4 | **Roles por alcance.** «Todas las sedes» → Administrador o Usuario. Una sede → Médico o Usuario. `ADMIN` en la ruta de sede responde 400. | Sin ADMIN directo de sede desaparecen sus casos raros del plan anterior (no lee el catálogo, no edita especialidades). Así, todo ADMIN efectivo de una sede es ADMIN de la organización. |
| t-5 | **Semántica de asignar** sobre `(usuario, recurso)`: sin membership → se crea; borrada → se revive (`deletedAt: null` y el rol del formulario, misma fila); viva → se actualiza el rol. Con Médico, el perfil se crea o actualiza por `membershipId` y sus especialidades se reemplazan (`set`). Con Usuario, el perfil (si lo había) queda intacto y deja de estar vivo (t-1). | Una sola ruta de escritura para los tres casos que pide la decisión 4. Revivir conserva perfil, horarios y citas porque son la misma fila. |
| t-6 | **Límites al cambiar el rol de la organización:** nadie cambia su propio rol (409 «No puedes cambiar tu propio rol.») ni el del dueño de la cuenta (409 «El rol del dueño de la cuenta no se puede cambiar.»). En una sede el rol se cambia libre. | Sin esto, un ADMIN podría dejar la organización sin administradores o bajar al dueño. En una sede, cambiar de rol sólo decide si atiende; el acceso de organización no cambia. |
| t-7 | **Asignar Médico exige ser «editor de especialidades»** (dueño o ADMIN de la organización padre): `DoctorSpecialtiesGuards.assertCanEdit` antes de escribir; si no, 403 «Solo un administrador puede cambiar especialidades.». Asignar Usuario sólo exige la política. | Mantiene la regla de quién edita especialidades. Con t-4 coincide con la política, pero un ADMIN directo de sede sembrado a mano no puede saltársela. |
| t-8 | **Regla del correo: sólo se invita a quien todavía no tiene contraseña** (sin `authAccount` con `providerId = "credential"`). Si no tiene contraseña: se crea la invitación de esa membership si no existe, o se renueva y se reenvía si no está aceptada y se emitió hace 5 minutos o más; si se emitió hace menos, no se envía nada y no hay error. Si tiene contraseña: ninguna invitación ni correo, y el acceso vale desde ya. La respuesta dice `invitationSent`. | Es lo más simple: el acceso ya no depende de la invitación (sólo de la membership), así que el correo sólo hace falta para crear la contraseña. Asignarse a uno mismo nunca envía correo. Se va el 429 del reenvío: volver a guardar es la forma de reenviar. |
| t-9 | **Sin plaza de médico:** se borran `assertDoctorSeatAvailable`, `lockAccountQuota`, `GetAccountEntitlements` e `isWithinLimit` de `invite-user.usecase.ts`. `maxDoctors` sigue en `domain/entities/subscription/entitlements.ts` (fuera de alcance). | Decisión 7. Quitar el campo del plan toca la lógica de entitlements, que es otro ticket («Límites por citas»). |
| t-10 | **La búsqueda por correo es sólo la de la organización** (`POST /organization/:resourceId/users/lookup`). Suma `isAccountOwner`, `organizationRole` y `clinics[]`, sólo con memberships vivas. Se borra `POST /clinic/:resourceId/users/lookup`. | El formulario siempre conoce su organización (también en el espacio de la sede, por `parentOrganization`). Una búsqueda de correos menos que proteger. Las memberships borradas no se muestran: asignar las revive (t-5), no hay nada que advertir. |
| t-11 | **«Atiende aquí» en el platform:** `GET /user/me/resource/:resourceId/membership` suma `doctorProfileId: string \| null` en las memberships de sede. Lo calcula `GetUserMembership` con un `include` en la lectura de la membership directa (no hace una consulta más). `policy.ts` no cambia: sólo crece el tipo que ya importa. | La sidebar y el menú de configuración leen esa membership (`AppProvider`). El ADMIN que atiende tiene rol efectivo ADMIN (`maxRole`), así que el rol no basta. |
| t-12 | **«Mi perfil» sólo edita especialidades donde la persona ya atiende.** `editableClinics` pasa a ser el subconjunto de `clinics` donde es editor y suma `doctorProfileId`. Se guarda con `PUT …/doctors/:doctorProfileId/specialties`. Se borran la ruta `PUT …/me/specialties`, `UpdateMySpecialtiesUseCase` y `upsertSpecialties`. El editor que no atiende en ninguna sede ve un aviso con el enlace a Usuarios. El tratamiento (Dr./Dra.) es sólo para quien atiende. | Decisión 6: el perfil no se crea fuera de una membership. Asignarse pasa por el formulario único (decisión 5). La ruta del médico ya acepta el perfil propio (t-14 revertida del plan anterior), así que una sola ruta basta. |
| t-13 | **«Médicos» en las métricas cuenta perfiles vivos**, sin mirar horarios. | La regla «el ADMIN cuenta cuando tiene horarios» existía porque el perfil del ADMIN se creaba sin que nadie lo asignara. Ahora asignarse es explícito. Además, el médico quitado deja de contar. |
| t-14 | **Un solo modal (`InviteUserModal`) y una sola vista de usuarios de sede (`ClinicUsersView`).** En las dos páginas de usuarios de sede la sede queda fija; en Usuarios de la organización se elige entre «Todas las sedes» y cada sede. Se borra `components/organization/invite-user-modal.tsx`. | Es la decisión 4 y la 8, sin duplicar páginas. |
| t-15 | **Choque de dos asignaciones simultáneas** (P2002 en la membership o el perfil): 409 «Alguien acaba de cambiar el acceso de esta persona. Vuelve a intentarlo.», sin escribir nada. | El `P2002` aborta la transacción. Mejor un 409 claro que un 500. |
| t-16 | **Índice nuevo `@@index([resourceId])` en `UserResourceMembership`.** | El booking, la lista de usuarios y las métricas filtran ahora por la sede a través de la membership. El único índice que empieza por `resource_id` no existe (el único es `(user_id, resource_id)`). No cambia columnas ni roles; si el humano prefiere no tocar ese modelo, se quita esta línea y lo demás no cambia. |
| t-17 | **Sin `requireFeature`**: todo va en todos los planes. | Asignar y atender son la base del booking. |

## Schema y migración

`api/prisma/schema.prisma`:

```prisma
model User {
  // se quita: doctorProfile DoctorProfile[]
}

model Clinic {
  // se quita: doctors DoctorProfile[]
}

model UserResourceMembership {
  // … igual
  doctorProfile DoctorProfile?

  @@unique([userId, resourceId])
  @@index([accountId, role])
  @@index([resourceId])          // t-16
  @@map("user_resource_membership")
}

model DoctorProfile {
  id           String                 @id @default(uuid(7)) @db.Uuid
  membershipId String                 @unique @map("membership_id") @db.Uuid
  membership   UserResourceMembership @relation(fields: [membershipId], references: [id], onDelete: NoAction)
  createdAt    DateTime               @default(now()) @map("created_at")
  updatedAt    DateTime               @updatedAt @map("updated_at")

  availabilities Availability[]
  specialties    Specialty[]
  appointments   Appointment[]

  @@map("doctor_profile")
}
```

`onDelete: NoAction`: las memberships se borran en lógico (`deletedAt`), nunca en físico.

**Migración:** `cd api && pnpm prisma:migrate --name doctor_profile_membership`, con la base de
desarrollo ya vacía (ver «Requiere confirmación», paso del humano). Antes de aplicarla, revisa que
el SQL sólo:
- borre las FK `doctor_profile_user_id_fkey` y `doctor_profile_resource_id_fkey`, los índices
  `doctor_profile_user_id_resource_id_key` y `doctor_profile_resource_id_idx`, y las columnas
  `user_id` y `resource_id`;
- agregue `membership_id UUID NOT NULL`, el índice único `doctor_profile_membership_id_key`, su FK y
  `user_resource_membership_resource_id_idx`;
- **no** toque `appointment_doctor_slot_active_key` (índice parcial sólo en SQL, `api/AGENTS.md`).

No hay backfill ni pasos de datos. Después, `pnpm prisma:generate`.

## api: archivos

### Predicado compartido (t-1)

- **Nuevo:** `api/src/infrastructure/postgres/queries/doctor-profile/live-doctor-profile.ts`

  ```ts
  // Perfil que atiende: su membership de sede está viva y es DOCTOR. Un ADMIN de
  // la organización atiende con una membership DOCTOR directa en la sede.
  export function liveDoctorProfileWhere(filter: {
    clinicId?: string;
    userId?: string;
    accountId?: string;
  } = {}): Prisma.DoctorProfileWhereInput {
    return {
      membership: {
        role: "DOCTOR",
        deletedAt: null,
        ...(filter.clinicId && { resourceId: filter.clinicId }),
        ...(filter.userId && { userId: filter.userId }),
        ...(filter.accountId && { accountId: filter.accountId }),
      },
    };
  }
  ```

- **Se borra:** `.../doctor-profile/counted-doctor-profile.ts`. Sus dos usos pasan al predicado
  (t-13).

### Lecturas y escrituras que cambian de forma

Regla mecánica para todas: `doctorProfile.user` → `doctorProfile.membership.user`;
`doctorProfile.clinicId` → `doctorProfile.membership.resourceId`; filtrar por usuario o sede
→ `liveDoctorProfileWhere({...})`. `pnpm typecheck` señala cualquier uso que falte.

| Archivo | Cambio |
| --- | --- |
| `api/src/infrastructure/postgres/queries/clinic/get-clinic-doctors.query.ts` | El SQL arranca en `doctor_profile dp` con `INNER JOIN user_resource_membership urm ON urm.id = dp.membership_id`, `INNER JOIN public.user u ON u.id = urm.user_id` e `INNER JOIN resource r ON r.id = urm.resource_id`. El `WHERE` queda `urm.resource_id = ${resourceId} AND urm.deleted_at IS NULL AND urm.role = 'DOCTOR'`, más el `EXISTS` de horarios de hoy. Se borra el `EXISTS` de membership y el comentario «DoctorProfile no tiene deleted_at…» pasa a decir que es el SQL de `liveDoctorProfileWhere`. `GROUP BY` igual. |
| `api/src/infrastructure/postgres/queries/clinic/get-clinic-users.query.ts` | `LEFT JOIN doctor_profile dp ON dp.membership_id = urm.id AND urm.role = 'DOCTOR'` (en vez de usuario + sede). Lo demás igual. |
| `api/src/infrastructure/postgres/queries/doctor-profile/get-doctor-slots.query.ts` | `isBookable(id)`: `doctorProfile.count({ where: { id, ...liveDoctorProfileWhere() } }) > 0`. |
| `api/src/application/use-cases/appointment/create-appointment.usecase.ts` | `findBookableDoctor`: `where: { id, specialties: {…igual}, ...liveDoctorProfileWhere({ clinicId: dto.clinicId }) }`, `select: { membership: { select: { user: { select: { name, lastName, treatment } } } } }`. Más abajo, `formatDoctorName(profile.membership.user)`. |
| `api/src/application/use-cases/appointment/reschedule-appointment.usecase.ts` | `isAlternativeDoctor`: el mismo cambio, con `clinicId: appointment.clinicId`. |
| `api/src/application/use-cases/availability/get-doctor-availability.usecase.ts` y `insert-availability.usecase.ts` | `doctorProfile.findFirst({ where: liveDoctorProfileWhere({ userId: dto.userId, clinicId: dto.clinicId }), select: { id: true } })` en vez de `findUnique` por `userId_clinicId`. Así el ADMIN que se asignó como médico configura sus horarios: `PUT` ya acepta `roles: ["ADMIN", "DOCTOR"]` y el `GET` `member: true`. |
| `api/src/infrastructure/postgres/queries/clinic/get-clinic-appointments.query.ts` | Con `role === "DOCTOR"`: `doctorProfile: { membership: { userId: dto.userId } }`. El nombre se lee de `doctorProfile.membership.user`. |
| `api/src/infrastructure/postgres/queries/clinic/get-clinic-metrics.query.ts` | Citas: `where: { clinicId: dto.resourceId, ...(DOCTOR && { doctorProfile: { membership: { userId: dto.userId } } }), scheduledAt }`. Médicos: `doctorProfile.count({ where: liveDoctorProfileWhere({ clinicId: dto.resourceId }) })` (t-13). |
| `api/src/infrastructure/postgres/queries/organization/get-organizations-doctor-count.query.ts` | Una sola cuenta: `doctorProfile.count({ where: { membership: { role: "DOCTOR", deletedAt: null, resource: { parentResourceId: dto.resourceId } } } })`. Ya no lee las sedes primero. |
| `api/src/infrastructure/postgres/queries/appointment/get-appointment-notice.query.ts`, `get-appointment-portal.query.ts` y `api/src/application/queries/patient/get-patient-detail.query.ts` | El `select` del médico pasa por `membership: { select: { user: … } }`. Los cuerpos de respuesta no cambian. |

### Repositorio de perfiles

`api/src/domain/repositories/doctor-profile.repository.ts` y su implementación en
`api/src/infrastructure/postgres/repositories/doctor-profile.repository.ts`:

- Se quedan `clinicBelongsToOrganization`, `countSpecialtiesOfClinicOrganization` y
  `setSpecialties`.
- **Se borra** `upsertSpecialties(userId, clinicId, ids)`, junto con su reintento por `P2002`.
- **Nuevo** `upsertForMembership(membershipId: string, specialtyIds: string[]): Promise<SpecialtySummary[]>`:
  `doctorProfile.upsert({ where: { membershipId }, create: { membershipId, specialties: { connect } }, update: { specialties: { set } }, select: { specialties: … } })`.
  Va sin reintento: se usa dentro de la transacción de asignar, y un `P2002` lo traduce el caso
  de uso (t-15).
- `findClinicDoctor(doctorProfileId, clinicId)` pasa a
  `findFirst({ where: { id: doctorProfileId, ...liveDoctorProfileWhere({ clinicId }) }, select: { id: true } })`
  y su tipo de retorno a `{ id: string } | null`. No hay más cambios en
  `update-doctor-specialties.usecase.ts`.

### Especialidades

- **Se borran** `api/src/application/use-cases/doctor-profile/update-my-specialties.usecase.ts` y
  la ruta `PUT /organization/:resourceId/clinics/:clinicId/me/specialties` en
  `routes/organization/index.ts` (t-12).
- `PUT …/doctors/:doctorProfileId/specialties` no cambia de contrato. Su comentario «Sin
  `roles`…» se queda.

### Asignar (decisiones 3, 4, 5 y 7)

`api/src/application/use-cases/user/invite-user.usecase.ts`, que se reescribe manteniendo la
clase y el archivo:

**Esquemas**

```ts
export const inviteUserBodySchema = inviteeFieldsSchema
  .extend({
    role: z.enum(["DOCTOR", "USER"], { error: "Elige un rol" }),
    specialtyIds: z
      .array(z.uuid({ error: "Especialidad inválida" }))
      .max(MAX_SPECIALTIES_PER_DOCTOR, { error: "Puedes elegir hasta 50 especialidades" })
      .optional(),
  })
  .refine((d) => d.role !== "DOCTOR" || !!d.specialtyIds?.length, {
    error: "Elige al menos una especialidad",
    path: ["specialtyIds"],
  });
// inviteOrganizationUserBodySchema: igual que hoy (ADMIN | USER).
```

`InviteUserDto` en `CLINIC` pasa a `role: "DOCTOR" | "USER"`.

**Resultado**

```ts
export interface AssignResult {
  outcome: "created" | "revived" | "updated";
  invitationSent: boolean;
  message: string; // ver «Mensajes»
}
```

**Constructor:** `(tx, services, tokens = new TokenService(), doctorProfiles = new DoctorProfileRepository(), guards = new DoctorSpecialtiesGuards(doctorProfiles, new CanEditOrganizationSpecialtiesQuery()))`.
Se quitan `entitlementsQuery`, `assertDoctorSeatAvailable`, `lockAccountQuota` y el método
privado `assertSpecialtiesBelongToClinicOrganization`: lo reemplaza el guard (t-9).

**`execute(data): Promise<AssignResult>`.** Todo dentro de `this.tx.runInTransaction`, en este
orden; cada paso es un método privado:

1. **`findInvitationResource`.** Como hoy, y además devuelve `organizationId`: el propio
   `resourceId` si es organización, o `resource.parentResourceId` si es sede. Sin padre →
   404 «Sede no encontrada».
2. **Si es una sede y el rol es `DOCTOR`:**
   `guards.assertCanEdit({ userId: data.createdBy, accountId, organizationId, clinicId: data.resourceId })`
   (403, t-7) y luego `specialtyIds = guards.uniqueSpecialtiesOfClinicOrganization(...)` (404
   «Especialidad no encontrada»).
3. **`findOrCreateUser`.** Como hoy: correo de otra cuenta → 422 «Ya existe una cuenta con este
   correo en otra cuenta». A un usuario existente nunca se le cambian nombre, apellido ni
   teléfono.
4. **`findMembership(userId, resourceId)`.** `findUnique` por `userId_resourceId`, **sin**
   filtrar `deletedAt`, porque hay que poder revivirla. Lo dice un comentario: es la excepción
   que prevé `api/AGENTS.md`. Incluye `invitation { status, expiresAt }`.
5. **`assertRoleCanChange`.** Sólo en la organización, con la membership viva y un rol distinto
   (t-6): si es la propia persona (`user.id === data.createdBy`) → 409 «No puedes cambiar tu
   propio rol.»; si es el dueño de la cuenta (`account.ownerId === user.id`) → 409 «El rol del
   dueño de la cuenta no se puede cambiar.».
6. **`saveMembership`.**
   - Sin membership: `create` y `outcome: "created"`.
   - Borrada: `update({ deletedAt: null, role })` y `outcome: "revived"`.
   - Viva: `update({ role })` si cambió, y `outcome: "updated"`.
7. **Si es una sede y el rol es `DOCTOR`:** `doctorProfiles.upsertForMembership(membership.id, specialtyIds)`.
8. **`sendInvitationIfNeeded(user, membership, invitedBy, resourceName)`** (t-8):
   - `hasPassword`: `authAccount.count({ where: { userId, providerId: "credential" } }) > 0`.
     Si tiene contraseña, devuelve `false`.
   - Sin invitación: la crea (`freshInvitationFields`) y envía el correo.
   - Con la invitación aceptada (dato viejo sin contraseña): `false`. La recuperación de
     contraseña cubre ese caso.
   - Con `wasIssuedRecently`: `false`.
   - En otro caso, `renewInvitation` (como hoy; si `count !== 1`, `false`) y envía el correo.
   - El correo es el de hoy (`invite-user`, asunto «WizyDoc - Invitación»), y se envía dentro de
     la transacción, como hoy.
9. Arma `message` (ver «Mensajes») y devuelve el resultado.

Fuera de la transacción, un `PrismaClientKnownRequestError` con `code === "P2002"` se convierte en
`Conflict("Alguien acaba de cambiar el acceso de esta persona. Vuelve a intentarlo.")` (t-15).

Se borran `assertInvitationCanBeRenewed`, `renewExistingInvitation`, los 409 «Esta persona ya es
miembro.» y «…fue eliminada…», y el 429.

**Mensajes** (`{Nombre}` = `name lastName` del usuario guardado):

| Caso | `message` |
| --- | --- |
| Organización, `created` o `revived`, con invitación | «Invitación enviada.» |
| Organización, `created` o `revived`, sin invitación | «Listo. {Nombre} ya tiene acceso a todas las sedes de {Organización}.» |
| Sede, uno mismo, Médico, `created` o `revived` | «Listo. Ya atiendes en {Sede}. Configura tus horarios para aparecer en el link de reserva.» |
| Sede, `created` o `revived`, con invitación | «Invitación enviada. {Nombre} aparece en los usuarios de {Sede}.» |
| Sede, `created` o `revived`, sin invitación | «Listo. {Nombre} ya tiene acceso a {Sede}.» |
| `updated`, uno mismo | «Guardamos tus cambios.» |
| `updated`, otra persona | «Guardamos los cambios de {Nombre}.», más « Le reenviamos la invitación.» si `invitationSent` |

### Búsqueda por correo (t-10)

`api/src/application/queries/user/lookup-account-user.query.ts`:

```ts
export type LookedUpClinicMembership = {
  clinicId: string;
  role: "ADMIN" | "DOCTOR" | "USER";
  /** Del perfil vivo en esa sede, sólo de la organización, por nombre; [] si no es DOCTOR. */
  specialties: { id: string; name: string }[];
};

export type LookedUpAccountUser = {
  name: string;
  lastName: string;
  phone: string;
  isAccountOwner: boolean;
  organizationRole: "ADMIN" | "DOCTOR" | "USER" | null; // membership viva sobre la organización
  clinics: LookedUpClinicMembership[];                  // memberships vivas en sus sedes
};
```

`api/src/infrastructure/postgres/queries/user/lookup-account-user.query.ts`:
1. `resource.findUnique({ where: { id }, select: { accountId, type } })`. Si no existe o no es
   `ORGANIZATION`, devuelve `null`.
2. `user.findFirst({ where: { email, accountId } })`, con `id`, `name`, `lastName` y `phone`. El
   `id` no sale en la respuesta.
3. `userResourceMembership.findMany({ where: { userId, accountId, deletedAt: null, OR: [{ resourceId: orgId }, { resource: { parentResourceId: orgId } }] }, select: { resourceId, role, doctorProfile: { select: { specialties: { where: { organizationId: orgId }, select: { id, name } } } } } })`.
4. `account.findFirst({ where: { id: accountId, ownerId: user.id } })` para `isAccountOwner`.
5. Las especialidades salen sólo si `role === "DOCTOR"`, ordenadas con `sortedByName`.

### Membership del usuario (t-11)

- `api/src/application/queries/membership/get-user-membership.query.ts`: `ClinicMembership` suma
  `doctorProfileId: string | null`.
- `api/src/infrastructure/postgres/queries/membership/get-user-membership.query.ts`: la lectura
  `direct` suma `doctorProfile: { select: { id: true } }` al `include`. En la rama de sede,
  `doctorProfileId: direct?.role === "DOCTOR" ? (direct.doctorProfile?.id ?? null) : null`
  (`direct` ya filtra `deletedAt: null`).

### «Mi perfil» (t-12)

`api/src/application/queries/user/get-my-profile.query.ts`:
- `MyProfileEditableClinic`: se quita `isClinicDoctor` y se suma `doctorProfileId: string`.
- `MyProfileClinic` y `MyProfileOrganization` no cambian.

`api/src/infrastructure/postgres/queries/user/get-my-profile.query.ts`:
- Se quitan `attendingProfilesWhere` y `findEditableClinics`. Una sola lectura:
  `doctorProfile.findMany({ where: liveDoctorProfileWhere({ userId, accountId }), select: { id, membership: { select: { resourceId, resource: { select: { parentResourceId, clinic: { select: { name } }, parent: { select: { organization: { select: { name } } } } } } } }, specialties: {…}, _count: { select: { availabilities: true } } } })`.
- `clinics`: como hoy, desde esas filas.
- `editableClinics`: las mismas filas cuya organización está en `editableOrganizationIds`, con
  `doctorProfileId`, `organizationId`, `hasSchedule` y el mismo orden.
- `organizations`: sin cambios (todas las organizaciones que edita). El platform las usa para el
  aviso de «Mi perfil».
- `hasDoctorProfile`: `count` con `liveDoctorProfileWhere({ userId, accountId })`.
- `canSetTreatment`: devuelve `hasDoctorProfile(...)`. Se borra la rama del editor sin perfil, y
  el comentario explica que el tratamiento es de quien atiende.

### Rutas

`api/src/routes/clinic/index.ts`:
- `POST /clinic/:resourceId/invitations` responde `reply.status(200).send(result)` con el
  `AssignResult`. La política no cambia.
- **Se borra** `POST /clinic/:resourceId/users/lookup` y sus imports.

`api/src/routes/organization/index.ts`:
- `POST /organization/:resourceId/invitations`: igual que la ruta de sede.
- **Se borra** `PUT …/me/specialties` y sus imports.
- El mapeo de errores sigue como hoy: un `ApplicationError` responde con su `statusCode` y
  `{ message }`. Para el resto, el log lleva `errName` y `errCode`, nunca correos ni nombres.

## Endpoints

| Ruta | Policy | Entrada | Salida | Errores |
| --- | --- | --- | --- | --- |
| `POST /clinic/:resourceId/invitations` (asignar a una sede) | Sin cambios: `{ account, confirmed, onboarded, roles: ["ADMIN"] }` | `params: inviteUserParamsSchema`. `body: { email, name, lastName, phone, role: "DOCTOR" \| "USER", specialtyIds?: uuid[] (≤ 50; ≥ 1 con DOCTOR) }` | 200 `{ outcome, invitationSent, message }` | 400 validación (también `role: "ADMIN"`). 401. 403 por la política o «Solo un administrador puede cambiar especialidades.» (Médico sin ser editor). 404 por la política (sede de otra cuenta o sin rol ahí), «Sede no encontrada», «Especialidad no encontrada». 409 por un choque (t-15). 422 correo de otra cuenta. **Ya no hay 402, 429 ni 409 «ya es miembro» o «eliminada».** |
| `POST /organization/:resourceId/invitations` (todas las sedes) | Sin cambios: `roles: ["ADMIN"]` | `body: { email, name, lastName, phone, role: "ADMIN" \| "USER" }` | 200 igual | 400, 401, 403 y 404 por la política, 404 «Organización no encontrada», 409 «No puedes cambiar tu propio rol.», «El rol del dueño de la cuenta no se puede cambiar.» y el de un choque, 422. |
| `POST /organization/:resourceId/users/lookup` | Sin cambios: `roles: ["ADMIN"]` | `{ email }` | 200 `{ user: LookedUpAccountUser \| null }` | Como hoy. `null` para un correo inexistente, de otra cuenta, o si `:resourceId` no es una organización. |
| `POST /clinic/:resourceId/users/lookup` | — | — | **Se borra** | Responde 401 (la ruta deja de existir y el hook la cierra). |
| `PUT /organization/:resourceId/clinics/:clinicId/me/specialties` | — | — | **Se borra** | 401. |
| `PUT /organization/:resourceId/clinics/:clinicId/doctors/:doctorProfileId/specialties` | Sin cambios | Sin cambios | Sin cambios | Sin cambios. «Médico no encontrado» si el perfil no está vivo en esa sede (t-1). |
| `GET /user/me/resource/:resourceId/membership` | Sin cambios | — | La de sede suma `doctorProfileId` | — |
| `GET /user/me/profile` | Sin cambios | — | `editableClinics[]` sin `isClinicDoctor`, con `doctorProfileId`, y sólo sedes donde atiende | — |
| `GET /clinic/:clinicId/doctors` (público) | Sin cambios (`public: true`) | — | Misma forma; ahora incluye al ADMIN asignado como médico, con horarios y especialidad | — |

## Autorización

| Acción | Quién puede | Quién no |
| --- | --- | --- |
| Asignar Administrador o Usuario a «Todas las sedes» | ADMIN con membership directa en la organización (política) | Dueño sin membership en esa organización (404, ya no puede abrir su panel), USER y médicos (403), otra cuenta (404) |
| Cambiar el rol de alguien en la organización | El mismo ADMIN | Sobre sí mismo o sobre el dueño (409) |
| Asignar Usuario a una sede | ADMIN efectivo de la sede (política). Con t-4, sólo el ADMIN de la organización | DOCTOR o USER de la sede (403); ADMIN de otra organización u otra cuenta (404) |
| Asignar Médico a una sede, también a sí mismo | ADMIN efectivo **y** editor de especialidades (dueño o ADMIN de la organización padre) | ADMIN directo de sede sembrado a mano (403) |
| Editar especialidades (tabla y «Mi perfil») | Editor (sin cambios) | Sin cambios |
| Buscar por correo | ADMIN de la organización | Como hoy |
| Ver Usuarios de una sede | ADMIN efectivo (`GET /clinic/:resourceId/users`) | DOCTOR y USER (403 → `error.tsx`) |
| Configurar horarios propios | Quien tiene perfil vivo en la sede: DOCTOR o ADMIN asignado | Sin perfil vivo: 404 en `GET` y 500 en `PUT`, como hoy |

## Aislamiento entre cuentas

| Dato | Cómo queda acotado |
| --- | --- |
| Membership y perfil que se crean o editan | `:resourceId` lo valida la política (membership con rol ADMIN; otra cuenta → 404). `findInvitationResource` exige que el recurso sea de `request.user.accountId` y del tipo de la ruta. El usuario se busca por correo y su `accountId` se compara con el de la sesión (422 si es otro). La membership se busca por `(userId, resourceId)` de esa cuenta. |
| Especialidades del perfil | `countSpecialtiesOfClinicOrganization`: sólo de la organización padre de la sede de la URL (404 si alguna no lo es). |
| Búsqueda por correo | Recurso de la URL validado por la política. El usuario se busca con el `accountId` del recurso. Las memberships, por ese usuario, esa cuenta y esa organización o sus sedes. Las especialidades, por esa organización. No salen `id`, `email` ni `accountId`. |
| `doctorProfileId` de la membership propia | Se lee con el `userId` de la sesión. |
| `PUT …/doctors/:doctorProfileId/specialties` | Igual que hoy: la sede es de `:resourceId` y de la cuenta, el editor se comprueba, y el perfil tiene que estar vivo en esa sede (`liveDoctorProfileWhere({ clinicId })`). |
| Booking público | Sin ids nuevos. `GET /clinic/:clinicId/doctors`, los slots, reservar y reprogramar validan perfil ∈ sede con el predicado vivo (perfil → membership → sede de la URL). |

## Casos límite

| Id | Caso | Qué pasa |
| --- | --- | --- |
| cl-1 | **El ADMIN de la organización se asigna como Médico.** En el formulario, su propio correo, la sede, «Médico» y sus especialidades. | Membership `DOCTOR` directa y perfil, sin invitación ni correo (tiene contraseña). Toast «Listo. Ya atiendes en {Sede}…». Su rol efectivo sigue siendo ADMIN, pero `doctorProfileId` hace que vea «Configuración» y «Mi Disponibilidad». Con horarios y especialidad aparece en el booking. Aparece en la tabla de la sede como «Médico» con «Tú». Puede editar sus especialidades en «Mi perfil» o en la tabla. |
| cl-2 | **Un USER de la organización asignado como Médico a una sede** | Membership `DOCTOR` en esa sede y perfil. Ahí su rol efectivo es `DOCTOR` (`maxRole`): sólo sus citas, más «Configuración». En las demás sedes sigue como USER. Correo sólo si aún no tiene contraseña. |
| cl-3 | **Reasignar una sede de la que se quitó a alguien** (membership con `deletedAt`) | Se revive la misma fila con el rol del formulario. Con Médico, el mismo perfil recibe las especialidades nuevas y recupera sus horarios y su historial. Toast según `revived`. Si no tenía contraseña, se renueva su invitación y se envía. |
| cl-4 | **Correo de otra cuenta** | La búsqueda devuelve `null` («Usuario nuevo»). Al guardar, 422 en un toast. No se revela nada de la otra cuenta. |
| cl-5 | **Sede de otra organización** (misma cuenta) | El formulario sólo ofrece sedes de su organización. Por api, un ADMIN que sólo lo es de A y usa `/clinic/<sede de B>/invitations` recibe 404 de la política. Si es ADMIN de las dos, es válido, pero las especialidades de A en una sede de B dan 404. Una sede de otra cuenta, 404. |
| cl-6 | **Uno mismo en «Todas las sedes»** | Ya tiene membership viva: el rol queda fijo y el formulario dice «No puedes cambiar tu propio rol.». Por api, 409 si cambia el rol; con el mismo rol, 200 sin cambios. |
| cl-7 | **Médico → Usuario en una sede** | El perfil deja de estar vivo: sale del booking y de las métricas, no ve «Configuración», y sus citas siguen. El paciente puede cancelar, pero reprogramar con él ya no ofrece huecos (como con un médico quitado). El formulario lo avisa antes de guardar. Volver a Médico lo reactiva con todo. |
| cl-8 | **Segunda sede a quien tiene la invitación pendiente** | Otra membership, otro perfil, y otra invitación con su correo (no tiene contraseña). Cualquiera de los enlaces le sirve para crear la contraseña; los demás lo llevan a iniciar sesión. Tiene acceso a las dos sedes desde ya. |
| cl-9 | **Segunda sede a quien ya aceptó** | Membership y perfil, sin correo. La ve en «Cambiar de sede» al volver a cargar. |
| cl-10 | **Editar a alguien con la invitación pendiente** | Se guarda y, si pasaron 5 minutos desde la última, se reenvía su invitación («Le reenviamos la invitación.»). Antes de eso no se reenvía y no hay error. |
| cl-11 | **El dueño de la cuenta en «Todas las sedes»** (editado por otro ADMIN) | El rol queda fijo («El rol del dueño de la cuenta no se puede cambiar.»). Sí se le puede asignar como Médico a una sede. |
| cl-12 | **Gratis con varios médicos** | Se asignan todos sin 402 (decisión 7). |
| cl-13 | **Dos ADMIN guardan a la misma persona a la vez** | Uno gana. El otro recibe 409 (t-15) sin escribir nada ni enviar correo. |
| cl-14 | **Un USER de la organización asignado como Usuario a una sede** | Se crea la membership directa. No cambia nada visible (ya la veía por herencia). Se permite: es inofensivo y bloquearlo dejaría sin salida el paso Médico → Usuario. |
| cl-15 | **El editor que no atiende abre «Mi perfil»** | Ve «Dónde atiendes» con el aviso y el enlace a Usuarios (ver «platform»). No tiene «Tratamiento». |

## platform: archivos

### Tipos, clientes y acciones

| Archivo | Cambio |
| --- | --- |
| `platform/src/lib/api/memberships/types.ts` | `ClinicMembership` suma `doctorProfileId: string \| null`. |
| `platform/src/lib/api/user/types.ts` | `MyProfileEditableClinic`: se quita `isClinicDoctor` y se suma `doctorProfileId: string`. |
| `platform/src/lib/actions/user/lookup-user-by-email.action.ts` | Se borra `lookupUserByEmailAction` (la de sede). `LookedUpUser` suma `isAccountOwner`, `organizationRole` y `clinics: LookedUpClinicMembership[]` (tipo exportado, igual al del api). |
| `platform/src/lib/actions/user/invite-user.action.ts` | Devuelve `ActionState` (se borra `InviteUserState`). Valida `role: z.enum(["DOCTOR", "USER"])` y `specialtyIds: z.array(z.uuid()).max(50)` con el refine de hoy. Lee `{ message }` de `doFetchJson` y devuelve `{ status: "success", message }`. Revalida `clinicTags.clinicUsers(clinicId)`, `userTags.myProfile()`, `membershipTags.memberships()` y `membershipTags.membershipsForResource(clinicId)`: al asignarse uno mismo cambian la sidebar y «Mi perfil». |
| `platform/src/lib/actions/organization/invite-organization-user.action.ts` | Lo mismo, con `ActionState`. Revalida `organizationUsers(organizationId)`, `memberships()` y `membershipsForResource(organizationId)`. |
| `platform/src/lib/actions/doctor-profile/update-my-specialties.action.ts` | Firma nueva: `(organizationId, clinicId, doctorProfileId, _prev, formData)`. Hace `PUT …/doctors/{doctorProfileId}/specialties` y revalida `userTags.myProfile()` y `clinicTags.clinicUsers(clinicId)`. El mensaje sigue siendo «Guardamos tus especialidades.». |

### Menú y configuración (t-11)

| Archivo | Cambio |
| --- | --- |
| `platform/src/components/common/utils.tsx` | `NavLink` suma `requiresDoctorProfile?: boolean`. «Configuración» pasa de `roles: [DOCTOR]` a `requiresDoctorProfile: true`. `clinicNavLinks` suma `{ href: "users", label: "Usuarios", icon: UserRound, roles: [MembershipRole.ADMIN] }` después de «Pacientes». `getNavLinks({ role, resourceType, attends })` filtra por `roles` y, si `requiresDoctorProfile`, por `attends`. |
| `platform/src/components/common/sidebar.tsx` | Pasa `attends: membership.resourceType === "CLINIC" && membership.doctorProfileId !== null`, y suma `membership` a las dependencias del `useMemo` (ya está). |
| `platform/src/components/clinic/settings/settings-sidebar.tsx` | `roleScope` pasa a `requiresDoctorProfile: true` en «Mi Disponibilidad», con el mismo cálculo de `attends`. |

### Formulario único (decisión 4, t-14)

**`platform/src/components/clinic/invite-user/modal.tsx`** (`InviteUserModal`). Deja `useParams` y
recibe por props:

```ts
interface Props {
  isOpen: boolean;
  setIsOpen: (value: boolean) => void;
  organizationId: string;
  organizationName: string;
  clinics: { id: string; name: string }[]; // sedes de la organización
  fixedClinicId?: string;                  // en las páginas de usuarios de sede
  specialties: Specialty[];
  currentUserEmail?: string;
}
```

- Hay dos `useFormAction`, sin `successMessage`: el toast es el `message` del api.
- `submit(scope, formData)` despacha según el alcance: «Todas las sedes» →
  `inviteOrganizationUserAction(organizationId, …)`; una sede → `inviteUserAction(clinicId, …)`.
  La validación «Selecciona al menos una especialidad» (toast) se queda como hoy.
- Título «Invitar usuario» (sin cambio). Descripción con sede fija: «Dale acceso a {Sede}.»; sin
  sede fija: «Dale acceso a todas las sedes de {Organización} o a una sede.».

**`platform/src/components/clinic/invite-user/form.tsx`** (`InviteUserForm`). Props nuevas:
`organizationId`, `organizationName`, `clinics`, `fixedClinicId?`, `specialties`,
`currentUserEmail?`, `isPending`, `fieldErrors?`,
`onSubmit(scope: { clinicId: string | null }, formData)` y `onCancel`. Se quitan `roleOptions`,
`roleNotice` y `lookupUser`: busca con `lookupOrganizationUserByEmailAction(organizationId, email)`.

**Paso 1 (correo).** Sin cambios.

**Paso 2**, en orden:
1. El correo con «Cambiar» y el aviso «Ya tiene una cuenta — precargamos sus datos.» / «Usuario
   nuevo — completa sus datos.», como hoy.
2. Nombre, Apellido y Teléfono. Si la persona existe van en `readOnly` (no `disabled`, para que
   viajen en el `FormData`), con «Sus datos los actualiza esa persona en Mi perfil.» en el
   `aria-describedby`. El api nunca los cambia.
3. **Sede.**
   - Con `fixedClinicId`, un campo de sólo lectura con la etiqueta «Sede» y el nombre.
   - Si no, `Select` (`components/common/form`) con «Todas las sedes de {Organización}» (valor
     `all`) y cada sede por nombre.
   - Por defecto: `fixedClinicId`; si la organización tiene una sola sede, esa; si no, `all`.
4. **Rol.** `Select` con «Administrador» / «Usuario» para `all`, y «Médico» / «Usuario» para una
   sede. Al cambiar de sede, el rol vuelve a su valor inicial: el de la membership viva de la
   persona en ese alcance (de la búsqueda) o, si no tiene, «Usuario» en `all` y «Médico» en una
   sede.
5. **Aviso** (`AssignmentNotice`) en una región `aria-live="polite"`, cuyo `id` va en el
   `aria-describedby` de «Sede» y de «Rol».
6. **Especialidades.** Sólo con «Médico». Es `SpecialtyMultiSelect`, con `initialSelected` = las
   de la persona en esa sede (si ya atiende ahí) y `key` = `${sede}-${rol}` para que se reinicie al
   cambiar.
7. **Botones.**
   - «Atrás».
   - El principal dice «Enviar invitación» si la persona es nueva, «Asignar» si existe sin
     membership viva en ese alcance, y «Guardar cambios» si la tiene. Al enviar dice
     «Guardando...».
   - Queda deshabilitado si el aviso bloquea (cl-6, cl-11).

**`platform/src/components/clinic/invite-user/assignment-notice.tsx`** (nuevo). Exporta:
- la función pura `resolveAssignment({ person, scope, role, currentUserEmail })`, que devuelve
  `{ existingRole, existingSpecialties, mode: "new" | "assign" | "edit", blocked: null | "self-role" | "owner-role" }`;
- el componente `AssignmentNotice` (props: el resultado anterior, `role`, `scope`, `personName`,
  `organizationName` y `clinicName`).

Se justifica porque la matriz de avisos es la misma en las tres páginas y el formulario ya es
largo. Avisos:

| Alcance y situación | Aviso |
| --- | --- |
| `all`, Administrador o Usuario, sin bloqueo | `InheritedAccessNotice` de hoy (sin cambios) |
| `all`, la propia persona con membership viva y otro rol | Ámbar: «No puedes cambiar tu propio rol.» (bloquea) |
| `all`, el dueño de la cuenta con membership viva y otro rol | Ámbar: «El rol del dueño de la cuenta no se puede cambiar.» (bloquea) |
| Sede, Médico, la propia persona | Gris: «Te asignas como médico de {Sede}. Sigues siendo administrador; configura tus horarios para aparecer en el link de reserva.» |
| Sede, Médico, `edit` y ya era Médico | Teal: «{Nombre} ya atiende en {Sede}. Puedes cambiar sus especialidades.» |
| Sede, Médico, el resto | Gris: «Atenderá en {Sede}: verá sus citas y configurará sus horarios. Aparece en el link de reserva cuando tenga horarios.» |
| Sede, Usuario, `edit` y antes era Médico | Ámbar: «{Nombre} dejará de atender en {Sede} y saldrá del link de reserva. Sus citas ya reservadas no cambian.» |
| Sede, Usuario, el resto | Gris: «Verá la agenda del día de {Sede} y las fichas de sus pacientes. Podrá actualizar el contacto de un paciente, pero no su información de salud.» |

**Se borra** `platform/src/components/organization/invite-user-modal.tsx`.
`inherited-access-notice.tsx` no cambia.

### Páginas de usuarios (decisión 8)

| Archivo | Cambio |
| --- | --- |
| `platform/src/components/clinic/clinic-users-view.tsx` (nuevo, servidor) | Props: `clinicId`. Hace `getMembershipForResource(clinicId)` y saca la organización de `parentOrganization` (no de la URL). Luego, en paralelo: `getClinicUsers(clinicId)`, `specialtyApi.getOrganizationSpecialties(orgId)`, `getMe()` y `getMembershipForResource(orgId)`. Pinta `UsersTopHeader` y `UsersTable` como hoy la página de la organización: `canEditSpecialties = orgMembership.role === "ADMIN" \|\| me.isAccountOwner`, subtítulo «Personas con acceso a {Sede}.» y vacío «Esta sede aún no tiene usuarios.». Al encabezado le pasa `organizationId`, `organizationName`, `clinics = [{ id: clinicId, name }]`, `fixedClinicId = clinicId`, `specialties` y `currentUserEmail`. Se justifica porque las dos páginas de abajo muestran lo mismo. |
| `platform/src/app/account/[accountId]/organization/[resourceId]/clinic/[clinicId]/users/page.tsx` | `return <ClinicUsersView clinicId={clinicId} />`. |
| `platform/src/app/account/[accountId]/clinic/[clinicId]/users/page.tsx` (nuevo) | Lo mismo. Usa `loading.tsx` y `error.tsx` de `clinic/[clinicId]`. Un DOCTOR o USER que llega por URL recibe 403 del api y ve `error.tsx`, como pasa hoy en la página de la organización. |
| `platform/src/components/clinic/users-top-header.tsx` | Recibe las props del modal (arriba) y se las pasa. |
| `platform/src/components/organization/users-top-header.tsx` | Usa `InviteUserModal` con `clinics`, `specialties` y `currentUserEmail` (props nuevas) y sin `fixedClinicId`. |
| `platform/src/app/account/[accountId]/organization/[resourceId]/users/page.tsx` | Suma `clinicApi.getOrganizationClinics(resourceId)` (mapeado a `{ id, name }`) y `specialtyApi.getOrganizationSpecialties(resourceId)` al `Promise.all`. El texto del vacío pasa a: «Invita aquí a quien trabaje en todas las sedes, o asigna a cada médico la sede donde atiende. Los médicos aparecen en los usuarios de su sede, en [Sedes].» (con el enlace de hoy). |
| `platform/src/components/clinic/users-table.tsx` y `doctor-specialties-dialog.tsx` | Sin cambios. |

**Seguridad de las rutas.** `src/lib/auth/guards.ts` y `src/middleware.ts` no cambian: el middleware
sólo exige la cookie, el layout de la sede resuelve la membership (sin membership, «No se pudo
cargar la sede») y la autorización real es la política de `GET /clinic/:resourceId/users`.

### «Mi perfil» (t-12)

| Archivo | Cambio |
| --- | --- |
| `platform/src/components/profile/editable-clinic-specialties.tsx` | Se quitan las condiciones `clinic.isClinicDoctor`: el enlace a «Mi disponibilidad» sale siempre. `updateMySpecialtiesAction` recibe `clinic.doctorProfileId`. |
| `platform/src/components/profile/editable-clinics.tsx` | El subtítulo de las filas sin especialidades pasa de «Otras sedes que administras» a «Otras sedes donde atiendes». |
| `platform/src/components/profile/where-you-work-card.tsx` | Descripción con sedes editables: «Elige las especialidades que atiendes en cada sede.». Si `clinics` está vacío y hay alguna organización con `canCreateSpecialties`, en vez de `null` pinta la tarjeta con «Todavía no atiendes en ninguna sede. Para recibir citas, asígnate como médico desde Usuarios.» y el enlace «Ir a Usuarios» a `/account/{accountId}/organization/{organizationId}/users` (la primera de esas organizaciones). |
| `platform/src/components/profile/personal-data-card.tsx` | `isDoctor = profile.clinics.length > 0`, con el comentario actualizado (el tratamiento es de quien atiende). |

## e2e

### Paso previo: el seed de perfiles por Prisma

Todo `doctorProfile` sembrado necesita antes una membership **de sede**. Cambios mecánicos:
- `create({ data: { userId, clinicId, … } })` → `create({ data: { membershipId, … } })`, con el
  `membershipId` que ya devuelven `createMemberWithRole` o `addMember`. Si sólo se tienen
  `userId` y `clinicId`, se usa
  `membership: { connect: { userId_resourceId: { userId, resourceId: clinicId } } }`.
- `findUnique({ where: { userId_clinicId } })` → `findFirst` u `OrThrow` con
  `where: { membership: { userId, resourceId: clinicId } }`.
- En `select`, `userId` y `clinicId` → `membership: { select: { userId: true, resourceId: true } }`.
- Si el spec siembra un perfil para un ADMIN de la organización sin membership en la sede, crea
  antes con Prisma una membership `DOCTOR` directa (`accountId` y `createdBy` del admin).
- `platform/e2e/support/db.ts`: `TestPrismaProfileRow` pasa a
  `{ id; membershipId; specialties; membership?: { userId; resourceId } }`, y `doctorProfile` suma
  `findFirstOrThrow` con `select`.

Helpers a cambiar: `support/availability.ts` (`createClinicDoctor`, `seedFullDayAvailability`),
`support/appointment-portal.ts` (`addPortalDoctor`), `support/profile.ts` (`addDoctorProfile`,
`addDoctorToSecondClinic`) y `support/doctor-treatment.ts` si siembra perfiles. Después, todos
los specs que listó `grep -rln "doctorProfile" platform/e2e`. Con `pnpm typecheck` en `platform`
no se ven (el cliente de prueba no está tipado contra Prisma): **hay que correr la suite**.

### Specs que cambian de comportamiento

| Spec | Qué se rompe | Cómo queda |
| --- | --- | --- |
| `api/invitations/invitation-expiry.spec.ts` | Renovar ya no conserva el rol ni ignora las especialidades; ya no hay 429 ni 409 «ya aceptó» o «borrada»; ya no hay 402 en Gratis | Renovar con invitación pendiente o vencida: 200 `updated`, token nuevo y un correo si pasaron 5 minutos. Dos veces seguidas: 200 con `invitationSent: false` y sin correo, y pasado el enfriamiento reenvía. Con el cuerpo pidiendo otro rol, el rol cambia (y con DOCTOR se crea el perfil). Ya aceptó: 200 sin correo ni cambio de invitación. Borrada: 200 `revived`, la misma membership viva. Se borra el caso «Gratis… 402». |
| `api/user/fix-invite-role-check.spec.ts` | CA-4 nombra ADMIN de sede; CA-5 espera 402; «reinvitar a un miembro que ya aceptó responde 409»; CA-9/CA-10 con `role: "ADMIN"` darán 400 antes que la política (`preHandler`) | CA-4: `role: "ADMIN"` en una sede da 400 sin escribir. CA-5: invitar a otro médico en Gratis da 200. «Ya aceptó»: 200 `updated` y la respuesta sólo trae `outcome`, `invitationSent` y `message`. CA-8, CA-9, CA-10 y CA-12: usar `role: "USER"` o `"DOCTOR"` para seguir probando el 403/404 de la política. |
| `api/security/fix-user-by-email-scope.spec.ts` | Se borra `POST /clinic/:resourceId/users/lookup` | CA-1: sin cambios. CA-2 a CA-17 contra `POST /organization/:resourceId/users/lookup` (CA-5: ADMIN de la organización A con el id de la organización B → 404). CA-12: las claves exactas pasan a `name`, `lastName`, `phone`, `isAccountOwner`, `organizationRole` y `clinics`; nunca `id`, `email`, `accountId`, `role`, `confirmed` ni `onboardingCompleted`. Caso nuevo: la ruta de sede responde 401. |
| `api/organization/org-invitations.spec.ts` | La búsqueda trae más claves; respuesta 200 con otra forma | «Búsqueda por correo…»: claves nuevas, `clinics` sólo de esa organización y sólo vivas. «…invitar a la organización»: el cuerpo de respuesta. Se suman: cambiar el rol propio → 409; el del dueño → 409; otro ADMIN → USER → 200. |
| `api/doctor-profile/admin-own-specialties.spec.ts` | Se borra la ruta `me/specialties` y el perfil implícito | Se reescribe como **`api/doctor-profile/admin-attends.spec.ts`**: el ADMIN se asigna (`POST /clinic/:id/invitations` con su correo, DOCTOR) → membership DOCTOR + perfil, sin invitación ni correo; edita las suyas por `…/doctors/:id/specialties`; IDOR (otra cuenta, sede de otra organización, especialidad ajena → 404); DOCTOR que se asigna a sí mismo o a otro como Médico → 403; `GET /user/me/profile`: `editableClinics` sólo con sedes donde atiende, `doctorProfileId`, sin `isClinicDoctor`; CA-32: el tratamiento da 403 al ADMIN que no atiende y 200 después de asignarse; `PUT …/me/specialties` → 401. |
| `api/doctor-profile/doctor-metrics.spec.ts` | «Médicos» ya no mira horarios | El ADMIN asignado cuenta aunque no tenga horarios; el médico pasado a Usuario o quitado deja de contar; las cifras de la sede y de la organización coinciden. |
| `api/booking/booking-requires-schedule.spec.ts` | «El ADMIN de la organización con especialidades no sale» | Ahora, el ADMIN asignado como Médico con horarios y especialidad **sí** sale. Sin asignar, no hay perfil. |
| `api/user/my-profile.spec.ts` | Claves exactas (CA-24), ADMIN de sede (CA-25, CA-36) | Claves nuevas de `editableClinics`. Los casos del ADMIN directo de sede sembrado siguen valiendo para «Mi perfil» (sólo lectura si tiene perfil vivo). |
| `ui/profile/profile-admin-specialties.spec.ts`, `profile-view.spec.ts` (CA-49) y `profile-edit.spec.ts` | El ADMIN sin asignación ya no ve filas editables ni «Tratamiento» | Sembrar al ADMIN como médico de la sede (membership DOCTOR + perfil) para editar. El ADMIN sin asignación ve el aviso «Todavía no atiendes…» con «Ir a Usuarios» y no ve «Tratamiento». |
| `ui/clinic/invite-user-form.spec.ts` | La opción «Doctor» pasa a «Médico»; el campo «Sede» fijo; datos en `readOnly` | CA-15/16: los datos precargados no se escriben. CA-1: «Médico». CA-13: la búsqueda sigue siendo una sola petición, ahora a la ruta de organización. |
| `ui/organization/invite-organization-user.spec.ts` | «…ofrece sólo Usuario y Administrador sin especialidades» y la pista hacia Sedes | Con «Todas las sedes»: Usuario y Administrador, sin especialidades. Al elegir una sede: Médico y Usuario, con especialidades. El texto del vacío nuevo. «Invitar a un USER…» sigue igual. |
| `ui/clinic/clinic-users-specialties.spec.ts` | «el ADMIN solo de la sede…» | Se borra: el ADMIN directo de sede ya no se puede crear (t-4). Lo demás, sólo el seed. |
| `ui/invitations/accept-invitation-existing-password.spec.ts` (CA-4) | Invitar a otra sede a quien ya tiene contraseña ya no crea invitación | El escenario pasa a ser: dos invitaciones pendientes; crea la contraseña con la primera y la segunda muestra «Aceptar invitación». Y se agrega: asignar a otra sede a quien ya tiene contraseña no envía correo y la sede aparece en «Cambiar de sede». |
| `api/security/clinic-invite-resource-policy.spec.ts`, `fix-invite-email-send.spec.ts` y `api/invitations/fix-invitation-set-password.spec.ts` | Sólo el seed o la forma de la respuesta | Ajustarlos si comparan el cuerpo exacto de `POST …/invitations`. |

### Pruebas nuevas propuestas (los ids los pone el product-manager)

- `api/invitations/assign-member.spec.ts`:
  - crear, editar (Médico → Usuario → Médico, mismo perfil) y revivir (mismo perfil, horarios y
    cita);
  - USER de la organización asignado como Médico (rol efectivo DOCTOR en esa sede, USER en otra);
  - segunda sede con la invitación pendiente (otra invitación y correo) y aceptada (sin correo);
  - ADMIN en una sede → 400;
  - sede de otra organización u otra cuenta → 404; especialidad de otra organización → 404, sin
    escrituras;
  - Gratis con tres médicos → 200;
  - `GET /user/me/resource/:clinicId/membership` → `doctorProfileId` (null para un USER y para un
    médico pasado a Usuario).
- `ui/clinic/clinic-space-users.spec.ts` (1280 y 375 px):
  - «Usuarios» en el menú de la sede para el ADMIN; no para DOCTOR ni USER, que por URL ven
    `error.tsx`;
  - la tabla y el formulario con la sede fija;
  - el ADMIN se asigna como Médico, ve «Configuración» y guarda un horario.
- `ui/organization/assign-from-organization.spec.ts`:
  - el selector de sede y los roles por alcance;
  - modo edición con la precarga (rol y especialidades) y «Guardar cambios»;
  - los avisos bloqueantes (rol propio, dueño) y el aviso Médico → Usuario;
  - el toast con el mensaje del api.

`platform/e2e/README.md`: se actualizan las filas de los specs tocados y se suman las nuevas.

## Verificación

**Typecheck y check:** `pnpm typecheck` y `pnpm check` limpios en `api` y en `platform`.
`git diff --stat` sin cambios en `api/src/plugins/policy.ts`, `auth.ts`, `entitlements.ts` ni en
migraciones existentes.

**Peticiones manuales** (api local, base recién migrada). Cookies: `$A`, ADMIN y dueño de `$ORG`
con las sedes `$S1` y `$S2`; `$B`, otro ADMIN de `$ORG`; `$X`, ADMIN de otra cuenta.
1. `curl -s -b "$A" -X POST -H 'content-type: application/json' -d '{"email":"<correo de A>","name":"…","lastName":"…","phone":"…","role":"DOCTOR","specialtyIds":["<esp de ORG>"]}' localhost:4000/clinic/$S1/invitations`
   → 200, `outcome: "created"`, `invitationSent: false`. Luego
   `GET /user/me/resource/$S1/membership` trae `doctorProfileId`.
2. `PUT /clinic/$S1/availability` con `$A` → 201. `GET /clinic/$S1/doctors` (sin cookie) lo
   lista.
3. Un correo nuevo como DOCTOR en `$S1` → 200, `invitationSent: true`, con un correo capturado.
   Repetirlo enseguida → 200, `invitationSent: false`.
4. El mismo correo con `role: "USER"` → `updated`. `GET /clinic/$S1/doctors` ya no lo lista.
   Volver a DOCTOR → reaparece con el mismo `doctorProfileId`.
5. `POST /organization/$ORG/invitations` con `$B` cambiando el rol de `$A` → 409 «El rol del dueño…».
   `$B` cambiando el suyo → 409.
6. `/clinic/$S1/invitations` con `role: "ADMIN"` → 400. Con `$X` → 404. Con una especialidad de
   otra organización → 404.
7. `POST /clinic/$S1/users/lookup` y `PUT /organization/$ORG/clinics/$S1/me/specialties` → 401.

**Navegador** (1280 y 375 px): asignarse como médico desde Usuarios de la organización; ver
«Configuración» y guardar horarios; reservar en `/clinic/$S1/create-appointment`; Usuarios dentro
de la sede (menú, tabla y formulario con la sede fija); «Mi perfil» con y sin asignación; como
DOCTOR, sin «Usuarios».

**e2e:** con la base e2e recreada (ver «Requiere confirmación»),
`cd platform && pnpm test:e2e` con la suite completa.

## Orden de implementación

Cada paso termina con `pnpm typecheck` en el proyecto que toca.

1. **Prisma.** Edita `schema.prisma`, crea la migración (`pnpm prisma:migrate --name doctor_profile_membership`),
   revisa el SQL según «Schema y migración», aplica y genera. Requiere la base de desarrollo
   vacía (paso del humano).
2. **api: lecturas.** Crea `live-doctor-profile.ts` y borra `counted-doctor-profile.ts`. Cambia
   el booking (SQL), slots, reservar, reprogramar, horarios, agenda, métricas, avisos, portal y
   ficha, siguiendo la tabla «Lecturas y escrituras».
3. **api: repositorio y especialidades.** `upsertForMembership` y `findClinicDoctor`. Borra
   `UpdateMySpecialtiesUseCase`, `upsertSpecialties` y la ruta `me/specialties`.
4. **api: asignar.** Reescribe `invite-user.usecase.ts`, cambia las dos rutas `…/invitations` y
   borra la búsqueda de sede.
5. **api: búsqueda, membership y «Mi perfil».** `lookup-account-user`, `get-user-membership`
   (`doctorProfileId`) y `get-my-profile`. Corre `pnpm check` y las peticiones manuales 1 a 7.
6. **platform: datos.** Tipos y acciones (tabla «Tipos, clientes y acciones»).
7. **platform: menú.** `utils.tsx`, `sidebar.tsx` y `settings-sidebar.tsx`.
8. **platform: formulario.** `assignment-notice.tsx`, `form.tsx` y `modal.tsx`. Borra
   `organization/invite-user-modal.tsx`. Los dos `users-top-header.tsx`.
9. **platform: páginas.** `clinic-users-view.tsx`, las dos páginas de usuarios de sede (una
   nueva) y la de usuarios de la organización.
10. **platform: «Mi perfil».** Los cuatro componentes de `components/profile/`. Corre
    `pnpm check`.
11. **e2e.** Helpers de `support/`, specs de «Specs que cambian de comportamiento», specs nuevas y
    `e2e/README.md`. Suite completa (con la base e2e recreada).
12. Resumen final: qué cambió, qué se verificó (typecheck, check, peticiones, navegador, e2e) y
    qué no.

## Fuera de alcance

- Quitar `maxDoctors` de los planes (`domain/entities/subscription/entitlements.ts`,
  `plugins/entitlements.ts`) y el tope de citas al mes: ticket «Límites por citas».
- Quitar a alguien de una sede desde el panel (hoy sólo pasa con datos sembrados).
- Asignar automáticamente al dueño como médico en el onboarding.
- Un correo distinto de «te sumaron a otra sede» para quien ya tiene contraseña.
- Una acción «Editar» por fila en la tabla de usuarios (hoy se edita escribiendo el correo en el
  formulario; las especialidades, también desde la columna).

## Requiere confirmación

1. **Paso del humano antes de implementar (no es una decisión):** vaciar la base de desarrollo y
   recrear la base e2e (`cd api && docker compose -f docker-compose.e2e.yml down -v && docker compose -f docker-compose.e2e.yml up -d`).
   La migración agrega `membership_id NOT NULL` sin backfill: falla si `doctor_profile` tiene
   filas, y `pnpm test:e2e` la aplica con `migrate deploy`. El engineer no corre comandos que
   borren datos.
2. **t-16, índice en `UserResourceMembership(resourceId)`.** Es la única línea que toca ese
   modelo (sin columnas ni roles). Recomendado: dejarlo. Si no se quiere, se quita y todo lo
   demás sigue igual.
