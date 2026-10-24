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

---

# Iteración 2: equipo de la organización, varias sedes y perfil automático del ADMIN

**Fecha:** 23 de octubre de 2026. **Base:** fc4fdfa (`feat/doctor-specialties-6-users`, PR #110,
sin mergear). Misma rama, sin commits del planner.
**Sin mockup:** reutiliza `Table`, `Badge`, `Dialog`, `Input`, `Select` y `Label`; los textos
nuevos están aquí.
**Sin cambios de schema ni migración.** No estamos en producción: sin backfill ni compatibilidad
de datos. No se tocan `policy.ts`, `auth.ts`, `entitlements.ts` ni `.env*`.

## Objetivo

Todo ADMIN de la organización queda como médico (perfil vacío) de cada sede, y el médico
independiente sólo tiene que elegir especialidad y horarios para recibir citas. La lista de
usuarios de la organización muestra a todo el equipo con sus accesos, y el formulario único
asigna varias sedes a la vez.

## Decisiones del humano (firmes)

1. **Usuarios de la SEDE:** sólo memberships directas en esa sede. No cambia.
2. **Usuarios de la ORGANIZACIÓN:** todas las personas con acceso a la organización o a alguna
   de sus sedes, una fila por persona con sus accesos («Todas las sedes · Rol», «Sede X · Rol»).
   Sólo memberships vivas, acotadas a esa organización y su cuenta.
3. **Perfil automático del ADMIN:** al crear una sede, cada ADMIN vivo de la organización padre
   recibe en ella una membership DOCTOR directa y un perfil vacío, en la misma transacción. La
   misma regla vale al pasar a ADMIN de la organización por el formulario. Dejar de ser ADMIN no
   borra esas memberships. El perfil vacío no sale en el booking.
4. **«Médicos» en las métricas** de sede y de organización cuenta sólo perfiles vivos con al
   menos un horario.
5. **Varias sedes a la vez** en el formulario único: «Todas las sedes» (Administrador o Usuario) o
   de 1 a N sedes concretas (Médico o Usuario, y las especialidades si es Médico, aplicados a
   todas). Un solo correo por persona. Desde la página de una sede, la sede sigue fija.
6. Sin botón «Atender en esta sede» en «Mi perfil»; se ajusta el aviso «Todavía no atiendes…».

## Decisiones técnicas

| # | Decisión | Por qué |
| --- | --- | --- |
| it2-1 | **Hay un solo camino que crea sedes, y ahí va la regla.** El onboarding (`CompleteAccountSetupUseCase`) sólo crea la cuenta y la suscripción. `POST /organization` crea la organización y la membership ADMIN de quien la crea (`OrganizationRepository.save`). La sede sólo nace en `POST /organization/:resourceId/clinics` → `CreateClinicUseCase` → `ClinicRepository.save`, que en el platform usa «Crear sede» (`components/clinic/modal.tsx`, también en el primer uso). La regla va en `CreateClinicUseCase`, dentro de su `inTransaction`. | Verificado en el código: no hay otro `resource.create({ type: "CLINIC" })` en `api/src` ni un seed. Con un solo punto de entrada no hay que duplicar la regla. `createClinicResourceViaPrisma` de e2e no pasa por aquí (ver «e2e»). |
| it2-2 | **Repositorio nuevo `MembershipRepository` con `grantAttending({ userId, clinicId, accountId, createdBy })`.** Sobre `(userId, clinicId)`: sin membership, crea una DOCTOR y un perfil vacío (`"created"`); con una borrada, la revive como DOCTOR y asegura su perfil sin tocar especialidades (`"revived"`); con una viva, de cualquier rol, no hace nada (`"kept"`). El perfil se asegura con `doctorProfile.upsert({ where: { membershipId }, create: { membershipId }, update: {} })`. | Los dos caminos (crear sede y pasar a ADMIN) aplican la misma regla, y `api/AGENTS.md` pide que el acceso a datos reutilizable vaya en un repositorio. No se usa `upsertForMembership` porque hace `set` de especialidades y vaciaría las de un perfil revivido. |
| it2-3 | **Al crear una sede**, `grantAttending` para cada ADMIN de la organización padre: `userResourceMembership` con `resourceId = organizationId`, `accountId`, `role: "ADMIN"`, `deletedAt: null`. A los USER y DOCTOR de la organización no les pasa nada. No se crean invitaciones ni se envían correos. `createdBy` = quien crea la sede. | Decisión 3. Sin correo, porque el ADMIN ya tiene acceso a la sede por herencia y la membership nueva sólo dice que atiende. |
| it2-4 | **Al pasar a ADMIN por el formulario** (`POST /organization/:resourceId/invitations` con `role: "ADMIN"` sobre alguien que **no** tenía una membership ADMIN viva en la organización: `created`, `revived` o `updated` desde USER): `grantAttending` en cada sede de la organización. Volver a guardar a quien ya era ADMIN no hace nada. | Coherencia con it2-3. Disparar sólo en la transición es predecible: guardar un ADMIN sin cambios no crea filas. Con la regla de it2-2: **una membership USER viva no se toca**, porque es una decisión explícita de un ADMIN (por ejemplo, Médico → Usuario, cl-7). Convertirla en DOCTOR reactivaría horarios viejos en el booking sin que nadie lo pida, y como ADMIN ya puede asignarse Médico ahí con el formulario. **Una borrada se revive como DOCTOR con su perfil**, igual que en t-5 (revivir es la misma fila), porque «el ADMIN atiende en todas las sedes». Si ese perfil tenía especialidad y horarios, vuelve al booking. Se acepta: hoy sólo hay borradas sembradas, porque no existe UI para quitar a alguien. |
| it2-5 | **La promoción toma `lockAccountQuota(accountId)` antes de guardar la membership.** `CreateClinicUseCase` ya lo toma antes de crear la sede. | Sin el bloqueo, si alguien es promovido mientras se crea una sede, ninguna de las dos transacciones ve lo que hace la otra y el nuevo ADMIN queda sin membership en esa sede. Con READ COMMITTED, quien espera el bloqueo ve después lo que confirmó la otra. Un comentario explica que se reutiliza el bloqueo de cuota para serializar altas de sede y promociones. |
| it2-6 | **Dejar de ser ADMIN no borra nada.** En las sedes donde tiene una DOCTOR directa, su rol efectivo pasa a DOCTOR (`maxRole(USER heredado, DOCTOR)`): sólo sus citas y «Configuración». Deja de ser editor de especialidades (su «Mi perfil» queda en sólo lectura). Si no debe atender, se le pasa a Usuario sede por sede con el formulario. | Decisión 3 del humano. |
| it2-7 | **El booking ya exige especialidad y horarios. No se cambia.** `get-clinic-doctors.query.ts` hace `INNER JOIN "_DoctorProfileToSpecialty"` y `specialty` de la organización, y un `EXISTS` sobre `doctor_schedule`. `create-appointment` (`findBookableDoctor`) exige `specialties.some`. `reschedule-appointment` (`isAlternativeDoctor`) también. | Verificado: el perfil vacío no aparece, no se puede reservar con él ni sale como alternativa al reprogramar. |
| it2-8 | **«Médicos» = perfiles vivos con al menos un horario.** Nuevo `countedDoctorProfileWhere(filter)` = `liveDoctorProfileWhere(filter)` + `availabilities: { some: {} }`. `liveDoctorProfileWhere` suma un filtro `organizationId` (`membership.resource.parentResourceId`). Se usa en la métrica de sede y en la de organización. **Revierte la t-13 de este plan.** El humano la citó como t-12: aquí la t-12 es «Mi perfil», y la regla de contar con horarios venía de la t-12 de `doctor-profile-specialties/plan.md`. | Decisión 4: los ADMIN que no atienden no cuentan. La organización sigue contando perfiles, no personas, como hoy: alguien que atiende en dos sedes cuenta dos veces. |
| it2-9 | **Varias sedes = N llamadas secuenciales a `POST /clinic/:resourceId/invitations` desde la server action.** No hay ruta nueva ni cambia ninguna política. La action primero comprueba que todas las sedes sean de la organización, con `clinicApi.getOrganizationClinics(organizationId)`. Si no, error sin ninguna llamada. Las llamadas van una a una y se para en el primer error. Si falla a mitad, la action responde `error` con lo que se guardó y lo que falló. Reintentar es seguro: asignar es idempotente (lo ya guardado vuelve como `updated` con los mismos datos). | Cumple la regla de `api/AGENTS.md`: el id de la sede siempre en `:resourceId`, y cada llamada pasa por la política y por `findInvitationResource`. Las llamadas son secuenciales por dos razones: la primera crea al usuario y las siguientes lo encuentran (en paralelo chocarían en el único del correo → 409), y así funciona la regla del correo de it2-10. Se descarta `POST /organization/:resourceId/clinic-assignments` con `clinicIds` en el cuerpo: sería atómica, pero rompe esa regla y obliga a validar cada id del cuerpo. No compensa, porque asignar es idempotente y un error a mitad se arregla reintentando. |
| it2-10 | **Un correo por persona: el enfriamiento de 5 minutos pasa a ser por persona.** En `sendInvitationIfNeeded`, si la persona no tiene contraseña y **cualquiera** de sus invitaciones (de cualquier membership) está `INVITED`, sin aceptar y emitida hace menos de 5 minutos, no se crea ni se renueva la invitación de esta membership, no se envía correo y `invitationSent` es `false`. Esto reemplaza `wasIssuedRecently` (por membership), que queda incluido. El `WHERE` de `renewInvitation` no cambia (protege la concurrencia). | Al asignar 3 sedes, la primera llamada envía el correo y las otras dos caen dentro del enfriamiento. La membership sin invitación vale igual, porque el acceso depende sólo de la membership (t-8): la persona crea su contraseña con el primer enlace. Cambia cl-8 (ver «Casos límite»). El usuario es de una sola cuenta, así que filtrar por `membership.userId` ya queda acotado a la cuenta. |
| it2-11 | **`GET /organization/:resourceId/users` devuelve una fila por persona con `accesses[]`**, en Prisma (no en SQL crudo), acotada por la organización de la URL **y** por el `accountId` de la sesión. `invitationStatus` pasa a `"pending" \| null`: `"pending"` si la persona no tiene contraseña (sin `authAccount` con `providerId = "credential"`). `"expired"` desaparece de esta lista. | El token es por membership y una persona puede tener varias invitaciones o ninguna (it2-10). Un «expirada» por persona exigiría reglas de agregación arbitrarias, y la acción del ADMIN es la misma en los dos casos: editarla y guardar, que reenvía si pasaron 5 minutos (t-8). Es lo que propuso el humano. |
| it2-12 | **Dónde se edita cada acceso, siempre con el formulario único.** «Todas las sedes · Rol»: Usuarios de la organización › «Invitar usuario», con su correo y el alcance «Todas las sedes». «Sede X · Rol»: en ese mismo formulario, con «Sedes específicas» y sólo X marcada (precarga rol y especialidades), o en Usuarios de la sede X (sede fija). Las especialidades se editan además desde la columna de Usuarios de la sede y desde «Mi perfil». La acción «Editar» por fila sigue fuera de alcance, como en la iteración 1. | Con una sola sede marcada, la precarga y los avisos de la iteración 1 quedan iguales. Con varias, rol y especialidades se aplican a todas (decisión 5), y después se edita sede por sede. |
| it2-13 | **Alcance en el formulario: radios «Todas las sedes de {Organización}» / «Sedes específicas»**, y con «Sedes específicas», una casilla por sede (`name="clinicIds"`). Con `fixedClinicId` no hay radios: queda el campo de sólo lectura «Sede» de hoy, más un `hidden` `clinicIds`. | Ya hay casillas nativas en el proyecto (`patient/record-form.tsx`). No hace falta un componente nuevo de selección múltiple: son pocas sedes (Clínica: 3). |
| it2-14 | **«Mi perfil»:** no hace falta un botón. El aviso «Todavía no atiendes…» ahora sólo sale si el editor no tiene ningún perfil vivo, es decir, si su organización aún no tiene sedes (o si en todas tiene una USER directa). Texto nuevo y enlace a «Sedes». Una consecuencia aceptada: en cuanto hay una sede, todo ADMIN de la organización ve «Tratamiento» y una fila editable por sede, porque atiende por defecto. | Decisión 6. Para el médico independiente, que es el caso foco, el aviso aparece justo antes de crear su primera sede. |
| it2-15 | **El aviso de «Administrador» del formulario dice que quedará como médico de cada sede.** | Sin el aviso, quien promueve a alguien se sorprende al verlo como «Médico» en cada sede. |

## api: archivos

| Archivo | Cambio |
| --- | --- |
| `api/src/infrastructure/postgres/queries/doctor-profile/live-doctor-profile.ts` | `liveDoctorProfileWhere` suma `organizationId?: string` → `membership.resource = { parentResourceId: organizationId }`. **Nuevo** `countedDoctorProfileWhere(filter)` = `{ ...liveDoctorProfileWhere(filter), availabilities: { some: {} } }`, con el comentario «un ADMIN atiende por defecto con perfil vacío; sólo cuenta quien tiene horarios». |
| `api/src/infrastructure/postgres/queries/clinic/get-clinic-metrics.query.ts` | `doctors`: `countedDoctorProfileWhere({ clinicId: dto.resourceId })`. |
| `api/src/infrastructure/postgres/queries/organization/get-organizations-doctor-count.query.ts` | `doctorProfile.count({ where: countedDoctorProfileWhere({ organizationId: dto.resourceId }) })`. |
| `api/src/domain/repositories/membership.repository.ts` (nuevo) | `export type AttendingOutcome = "created" \| "revived" \| "kept";` y la interfaz `IMembershipRepository`: `findOrganizationAdminIds(organizationId, accountId): Promise<string[]>`, `findOrganizationClinicIds(organizationId, accountId): Promise<string[]>` y `grantAttending(input: { userId; clinicId; accountId; createdBy }): Promise<AttendingOutcome>`, cada una con su comentario de una línea. |
| `api/src/infrastructure/postgres/repositories/membership.repository.ts` (nuevo) | `findOrganizationAdminIds`: `userResourceMembership.findMany({ where: { resourceId: organizationId, accountId, role: "ADMIN", deletedAt: null }, select: { userId: true } })`. `findOrganizationClinicIds`: `resource.findMany({ where: { parentResourceId: organizationId, accountId, type: "CLINIC" }, select: { id: true } })`. `grantAttending`: `findUnique` por `userId_resourceId` **sin** filtrar `deletedAt` (comentario: la excepción de `api/AGENTS.md`, porque se revive), y luego `create({ data: { userId, resourceId: clinicId, accountId, createdBy, role: "DOCTOR" } })` o `update({ where: { id }, data: { deletedAt: null, role: "DOCTOR" } })`, y por último el `upsert` del perfil de it2-2. Usa `getClient()`: corre dentro de la transacción de quien lo llama. |
| `api/src/application/use-cases/clinic/create-clinic.usecase.ts` | El constructor suma `memberships: IMembershipRepository = new MembershipRepository()` (el último parámetro, para no tocar la ruta). En `execute`, `const clinic = await this.clinicRepository.save(dto);` y luego el método privado `grantAttendingToOrganizationAdmins(dto, clinic.resourceId)`: `findOrganizationAdminIds(dto.organizationId, dto.accountId)` y `grantAttending` para cada uno, **en serie** (`for…of`: el cliente de una transacción interactiva no admite consultas en paralelo). Todo queda dentro del `inTransaction` y después de `lockAccountQuota`. La respuesta de la ruta no cambia (201). |
| `api/src/application/use-cases/user/invite-user.usecase.ts` | El constructor suma `memberships: IMembershipRepository = new MembershipRepository()` (al final). Método privado `becomesOrganizationAdmin(data, existing)`: `data.resourceType === "ORGANIZATION" && data.role === "ADMIN" && !(existing && !existing.deletedAt && existing.role === "ADMIN")`. En `assign`, después de `assertRoleCanChange`: si se convierte en ADMIN, `lockAccountQuota(data.accountId)` (it2-5). Después de `saveMembership`: si se convierte en ADMIN, el método privado `grantAttendingInOrganizationClinics(user.id, data)` (`findOrganizationClinicIds` y `grantAttending` en serie). En `issueInvitation`, antes de todo, `if (await this.wasPersonInvitedRecently(user.id)) return null;` (it2-10), y se borra `wasIssuedRecently`. `issueInvitation` pasa a recibir `userId`. `wasPersonInvitedRecently(userId)`: `userInvitation.count({ where: { membership: { userId }, status: "INVITED", acceptedAt: null, expiresAt: { gt: new Date(now + INVITATION_TTL_MS - INVITATION_RESEND_COOLDOWN_MS), lte: new Date(now + INVITATION_TTL_MS) } } }) > 0`. El límite `lte` conserva la excepción de hoy: las invitaciones viejas de 7 días se pueden renovar siempre. Los mensajes no cambian. |
| `api/src/application/queries/organization/get-organization-users.query.ts` | Tipos nuevos: `OrganizationUserAccess = { clinicId: string \| null; clinicName: string \| null; role: "ADMIN" \| "DOCTOR" \| "USER" }` (`clinicId: null` = «Todas las sedes») y `OrganizationUserRow = { name; lastName; email; phone; invitationStatus: "pending" \| null; accesses: OrganizationUserAccess[] }`. `IGetOrganizationUsersQuery.execute(resourceId: string, accountId: string): Promise<OrganizationUserRow[] \| null>`. |
| `api/src/infrastructure/postgres/queries/organization/get-organization-users.query.ts` | Se reescribe en Prisma. 1) `organization.findFirst({ where: { resourceId, accountId }, select: { resourceId: true } })`; si no existe, `null`. Así una sede en `:resourceId` (la política acepta al ADMIN heredado) no se lee como organización. 2) `userResourceMembership.findMany({ where: { accountId, deletedAt: null, resource: { accountId, OR: [{ id: resourceId }, { parentResourceId: resourceId, type: "CLINIC" }] } }, select: { role, createdAt, resourceId, resource: { select: { type: true, clinic: { select: { name: true } } } }, user: { select: { id, name, lastName, email, phone } } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })`. 3) `authAccount.findMany({ where: { userId: { in: ids }, providerId: "credential" }, select: { userId: true } })`. 4) Agrupa por `user.id` en el orden de la primera membership. Los accesos van con la organización primero y después las sedes por nombre (`localeCompare(…, "es")`). El `id` del usuario no sale en la respuesta. |
| `api/src/routes/organization/index.ts` | `GET /organization/:resourceId/users`: `query.execute(request.params.resourceId, request.user.accountId!)`. Con `null` → `404 { message: "Organización no encontrada" }`. La política no cambia. |

Sin cambios: `get-clinic-users.query.ts` (decisión 1), `get-clinic-doctors.query.ts`,
`create-appointment`, `reschedule-appointment` (it2-7), `ClinicRepository`, `OrganizationRepository`,
`lookup-account-user` y las rutas de sede.

## Endpoints modificados

No hay endpoints nuevos ni políticas nuevas.

| Ruta | Policy (sin cambios) | Qué cambia | Respuestas y errores |
| --- | --- | --- | --- |
| `POST /organization/:resourceId/clinics` | `{ account, confirmed, onboarded, roles: ["ADMIN"] }` | En la misma transacción: membership DOCTOR + perfil vacío para cada ADMIN vivo de la organización. | 201 como hoy. 402 por el plan y 404 «Organización no encontrada», como hoy. Si falla `grantAttending`, la transacción revierte y no queda sede (500, log con `errName` y `errCode`). |
| `POST /organization/:resourceId/invitations` | `roles: ["ADMIN"]` | Si se convierte en ADMIN: bloqueo de cuota y `grantAttending` en cada sede. Correo con enfriamiento por persona. | 200 `{ outcome, invitationSent, message }` como hoy. Mismos 400/403/404/409/422. Un `P2002` en `grantAttending` → 409 «Alguien acaba de cambiar el acceso…» (t-15, ya existe). |
| `POST /clinic/:resourceId/invitations` | `roles: ["ADMIN"]` | Correo con enfriamiento por persona (it2-10). | Igual que hoy. |
| `GET /organization/:resourceId/users` | `roles: ["ADMIN"]` | Forma nueva: una fila por persona con `accesses`. | 200 `OrganizationUserRow[]`. 404 por la política (otra cuenta, sin membership) o «Organización no encontrada» (`:resourceId` es una sede). 403 para DOCTOR o USER. |
| `GET /clinic/:resourceId/metrics` y `GET /organization/:resourceId/metrics/doctor-count` | Sin cambios | «Médicos» sólo con horarios (it2-8). | Misma forma. |

## Autorización y multi-tenant

| Dato | Cómo queda acotado |
| --- | --- |
| Memberships y perfiles automáticos al crear una sede | La organización la valida la política (ADMIN en `:resourceId`) y `assertOrganizationInAccount` (de la cuenta de la sesión y de tipo organización). Los ADMIN se leen con `resourceId = organizationId` **y** `accountId` de la sesión. La sede es la recién creada. |
| Memberships y perfiles automáticos al promover | Las sedes se leen con `parentResourceId = organizationId` de la URL ya validada (`findInvitationResource`) **y** `accountId` de la sesión. El usuario ya pasó por `findOrCreateUser` (422 si es de otra cuenta). |
| Lista de la organización | `organization.findFirst({ resourceId, accountId })` con el `accountId` de la sesión. Las memberships, por `accountId` y por la organización o sus sedes. Las contraseñas, sólo por ids de esos usuarios y sólo si existen (no sale nada de `authAccount`). Sin `id` de usuario ni `accountId` en la respuesta. |
| Varias sedes | Cada llamada la autoriza la política sobre su `:resourceId` (otra cuenta → 404; sin rol → 403/404) y la valida el caso de uso (sede de la cuenta; especialidades de la organización padre). La comprobación de la action (sedes ∈ organización) es UX y evita escrituras parciales; no es la barrera de seguridad. |
| Correo por persona | `membership.userId` del usuario ya validado en la cuenta. |

## platform: archivos

| Archivo | Cambio |
| --- | --- |
| `platform/src/lib/api/organizations/types.ts` | `OrganizationUserAccess` y `OrganizationUser = { name; lastName; email; phone; invitationStatus: "pending" \| null; accesses: OrganizationUserAccess[] }` (deja de extender `ClinicUser`). |
| `platform/src/components/clinic/users-table.tsx` | Sólo exporta `roleDisplay`, `statusTagClass` e `invitationTag` para reutilizarlos. Nada más cambia (la sede sigue con una fila por membership). |
| `platform/src/components/organization/organization-users-table.tsx` (nuevo) | `OrganizationUsersTable({ users, currentUserEmail, emptyMessage })` con `Table` de `components/common/table`. Columnas: **Nombre** (nombre y apellido, las etiquetas «Tú» e «Invitación pendiente» con `statusTagClass` e `invitationTag.pending`, y el correo debajo en < sm, como hoy), **Correo electrónico** (`hidden sm:table-cell`), **Teléfono** (`hidden md:table-cell`) y **Accesos**: `<ul aria-label="Accesos de {Nombre} {Apellido}" className="flex flex-col items-center gap-1">` con un `<li>` por acceso y un `Badge` de `roleDisplay[role].variant` con el texto «Todas las sedes · Administrador» o «{Sede} · Médico» (`whitespace-normal break-words`). `getRowKey` = `email`. Se justifica porque la fila tiene otra forma (varios accesos en vez de un rol) y `UsersTable` es de sede. |
| `platform/src/app/account/[accountId]/organization/[resourceId]/users/page.tsx` | Usa `OrganizationUsersTable`. `isOnlyCurrentUser` igual. Texto del vacío: «Invita a quien trabaje en todas las sedes, o asigna a cada médico las sedes donde atiende.» (sin el enlace a Sedes). |
| `platform/src/components/organization/users-top-header.tsx` | Subtítulo: «Personas con acceso a {Organización} o a alguna de sus sedes.». |
| `platform/src/lib/utils.ts` | **Nuevo** `formatList(items: string[]): string` con `new Intl.ListFormat("es", { type: "conjunction" })` («A, B y C»). Lo usan la action y el aviso. |
| `platform/src/lib/actions/user/invite-user.action.ts` | Firma nueva: `inviteUserAction(organizationId: string, _prev: ActionState, data: FormData)`. El esquema de hoy suma `clinicIds: z.array(z.uuid()).min(1, { error: "Elige al menos una sede" }).max(50)` (deduplicado con `new Set` antes de validar). Pasos: 1) `getSession()`. 2) Validar; un error devuelve `fieldErrors`. 3) `clinicApi.getOrganizationClinics(organizationId)` (un error pasa por `toActionState`). Si algún id no está, `{ status: "error", message: "Alguna de las sedes elegidas no es de esta organización." }` sin más llamadas. 4) Ordena las elegidas por nombre (`"es"`). Por cada una, en serie, `doFetchJson<{ outcome; invitationSent: boolean; message: string }>(\`/clinic/${encodeURIComponent(id)}/invitations\`, { method: "POST", body: JSON.stringify(cuerpo sin clinicIds) })`. Al primer error, se para y guarda `toActionState(error)` y el nombre de la sede. 5) Si se guardó alguna, revalida `clinicTags.clinicUsers(id)` y `membershipTags.membershipsForResource(id)` de cada sede guardada, más `organizationTags.organizationUsers(organizationId)`, `userTags.myProfile()` y `membershipTags.memberships()`. 6) Respuesta: con `auth-expired`, lo devuelve. Si falló sin guardar nada, el error tal cual. Si falló a mitad: `error` con «Guardamos {lista guardada}. No se pudo en {Sede} ({mensaje sin punto final}). Vuelve a intentarlo: lo ya guardado no se duplica.». Si todo salió bien con una sede, el `message` del api. Con varias: si es uno mismo (`session.user.email` = correo, sin mayúsculas) y Médico, «Listo. Ya atiendes en {lista}. Configura tus horarios en cada sede para aparecer en el link de reserva.»; si alguna `invitationSent`, «Invitación enviada. {Nombre} aparece en los usuarios de {lista}.»; si no, «Listo. Guardamos el acceso de {Nombre} a {lista}.». |
| `platform/src/lib/actions/organization/invite-organization-user.action.ts` | Si `role === "ADMIN"` y el api respondió 200, lee `clinicApi.getOrganizationClinics(organizationId)` y revalida `clinicTags.clinicUsers(id)` de cada sede: las memberships DOCTOR nuevas salen en sus tablas. Lo demás igual. |
| `platform/src/lib/actions/clinic/create-clinic.action.ts` | Además de `organizationClinics`, revalida `organizationTags.organizationUsers(organizationId)`, `membershipTags.memberships()` y `userTags.myProfile()`: quien crea la sede ahora atiende ahí. |
| `platform/src/components/clinic/invite-user/assignment-notice.tsx` | `AssignmentScope = { clinicIds: string[] \| null }` (`null` = todas). `Assignment` suma `existingClinics: { clinicId: string; role: Role }[]` (las elegidas donde ya tiene una membership viva). `existingRole` es el del alcance con «Todas» o con una sola sede, y `null` con varias. `existingSpecialties` sólo con una sede DOCTOR. `mode`: `"new"` sin persona; con sedes, `"edit"` si todas las elegidas tienen membership viva, y si no `"assign"`. `blocked: "clinic-admin"` si alguna elegida es ADMIN directa. `AssignmentNotice` recibe `clinicNames: string[]` en vez de `clinicName`. **Con una sola sede, los avisos son los de hoy, letra por letra.** Con varias (`{L}` = `formatList(nombres)`): Médico y uno mismo → gris «Te asignas como médico de {L}. Sigues siendo administrador; configura tus horarios en cada sede para aparecer en el link de reserva.»; Médico, otra persona → gris «Atenderá en {L} con las mismas especialidades; después puedes cambiarlas sede por sede. Aparece en el link de reserva de cada sede cuando tenga horarios ahí.»; Usuario → gris «Verá la agenda del día de {L} y las fichas de sus pacientes. Podrá actualizar el contacto de un paciente, pero no su información de salud.». Además, debajo y en ámbar, si `existingClinics` no está vacío (`{L'}` = sus nombres): con Usuario y alguna que era DOCTOR, «{Nombre} dejará de atender en {L'} y saldrá del link de reserva. Sus citas ya reservadas no cambian.»; si no, «{Nombre} ya tiene acceso a {L'}: ahí se reemplazan su rol y sus especialidades.». |
| `platform/src/components/clinic/invite-user/form.tsx` | Estado: `scopeMode: "all" \| "clinics"` y `selectedClinicIds: string[]`. Por defecto: con `fixedClinicId`, `clinics` y `[fixedClinicId]`; con una sola sede, `clinics` y esa; si no, `all`. **Sin `fixedClinicId`:** un `<fieldset aria-describedby={noticeId}>` con `<legend>` «Acceso» (clases de `Label`), dos `<input type="radio" name="scopeMode">` con su `<label>`: «Todas las sedes de {Organización}» y «Sedes específicas» (este último sólo si `clinics.length > 0`). Con «Sedes específicas», un grupo `role="group" aria-label="Sedes"` en una caja `rounded-lg border border-gray-200 p-3` (`max-h-48 overflow-y-auto`) con un `<label>` por sede: `<input type="checkbox" name="clinicIds" value={id} className="h-4 w-4 rounded border-gray-300 accent-brand-teal">`, el nombre y, si la persona ya tiene membership viva ahí, «· {Médico\|Usuario\|Administrador}» en `text-xs text-brand-gray`. Error del grupo («Elige al menos una sede»), local o de `fieldErrors.clinicIds`, en un `<p role="alert">` enlazado por `aria-describedby`. **Con `fixedClinicId`:** el `Input` de sólo lectura «Sede» de hoy y `<input type="hidden" name="clinicIds" value={fixedClinicId}>`. **Rol:** opciones según `scopeMode`, como hoy. `initialRole(person, scope)` con varias sedes: el rol común si todas tienen membership viva con el mismo rol DOCTOR o USER; si no, «Médico». El rol se reinicia al cambiar de modo o cuando la «clave de precarga» cambia (`selectedClinicIds.length === 1 ? id : "multi"`). **Especialidades:** `SpecialtyMultiSelect` con `key = \`${role}-${clave de precarga}\`` (pasar de 2 a 3 sedes no borra lo elegido). **Enviar:** con `clinics` y ninguna marcada, error local, foco en la primera casilla y sin petición. `onSubmit(scope: { clinicIds: string[] \| null }, formData)`. Se quitan `ALL_CLINICS`, el `Select` de sede y `scopeValue`. |
| `platform/src/components/clinic/invite-user/modal.tsx` | `submit(scope, formData)`: con `null`, la action de organización como hoy. Si no, la validación de especialidades de hoy, y luego `clinicForm.submit(formData)` con `inviteUserAction(organizationId, …)`. Se borra `scopeClinicId` y `setSubmittedToClinic` usa `scope.clinicIds !== null`. `InviteUserFields` suma `clinicIds: string[]`. Descripción sin sede fija: «Dale acceso a todas las sedes de {Organización} o a las sedes que elijas.». |
| `platform/src/components/organization/inherited-access-notice.tsx` | El texto de ADMIN suma al final: «También quedará como médico de cada sede, sin especialidades ni horarios: no aparece en el link de reserva hasta que los tenga.». |
| `platform/src/components/profile/where-you-work-card.tsx` | Aviso sin perfiles: «Todavía no atiendes en ninguna sede. Al crear una sede quedas como médico de ella; después eliges aquí tus especialidades.». El enlace pasa a «Ir a Sedes» → `/account/{accountId}/organization/{organizationId}/clinics`. Misma condición de hoy. |

**Estados de la lista de la organización** (sin pantallas nuevas): la carga y el error usan los
`loading.tsx` y `error.tsx` de la organización. El 403 de un DOCTOR o USER que entra por URL va
a `error.tsx`, como hoy. No hay 402: todo va en todos los planes.

**Accesibilidad del formulario.** Orden de tabulación: correo › Nombre › Apellido › Teléfono ›
radios de Acceso › casillas (sólo con «Sedes específicas») › Rol › Especialidades › Atrás ›
botón principal. El aviso sigue en `aria-live="polite"`. Las casillas son nativas, con su
`<label>` envolvente.

## Casos límite

| Id | Caso | Qué pasa |
| --- | --- | --- |
| it2-cl-1 | **Crear una sede con dos ADMIN y un USER de la organización** | En la transacción de la sede: dos memberships DOCTOR directas con perfil vacío (sin especialidades ni horarios), ninguna para el USER. Sin invitaciones ni correos. Usuarios de la sede: los dos ADMIN como «Médico» con «Sin especialidades». Booking vacío. Métricas: Médicos 0; con especialidad y un horario, el ADMIN aparece en el booking y cuenta 1. Si falla algo, no queda sede. |
| it2-cl-2 | **Un ADMIN de la organización con una USER directa viva en una sede**, y se le promueve (o se crea otra sede) | Al crear una sede no puede pasar (la sede es nueva). Al promoverlo, esa USER no se toca (it2-4): ahí su rol efectivo es ADMIN, sin perfil vivo y sin «Configuración». Puede asignarse Médico con el formulario. |
| it2-cl-3 | **Un ADMIN de la organización con una membership borrada en una sede**, al promoverlo | Se revive como DOCTOR, la misma fila y el mismo perfil, con sus especialidades y horarios. Si tenía las dos cosas, vuelve al booking (it2-4). |
| it2-cl-4 | **Asignar 3 sedes donde una ya existe y otra está borrada** (Médico, especialidad E) | Tres llamadas en serie por orden de nombre. La existente queda `updated`: rol DOCTOR, especialidades = [E] (si era USER, se crea o reactiva su perfil). La borrada queda `revived`: el mismo perfil con [E], y conserva horarios e historial. La tercera queda `created`. Como mucho un correo (it2-10), en la primera llamada que emite. El formulario avisó en ámbar «{Nombre} ya tiene acceso a {Sede}: ahí se reemplazan su rol y sus especialidades.». La borrada no sale en la búsqueda, así que el formulario la trata como nueva (t-10). |
| it2-cl-5 | **Una sede de otra organización entre las elegidas** | El formulario sólo ofrece las de su organización. Si el `FormData` se manipula: la action responde «Alguna de las sedes elegidas no es de esta organización.» sin llamar al api. Por el api directo, cada llamada es independiente: ADMIN sólo de A en una sede de B → 404 de la política; ADMIN de las dos → Usuario vale, Médico con especialidades de A → 404 «Especialidad no encontrada». Otra cuenta → 404. |
| it2-cl-6 | **Error a mitad** (p. ej., alguien siembra un ADMIN directo en la segunda sede mientras el formulario está abierto → 409 «El rol de un administrador de la sede no se puede cambiar.») | Se guardó la primera y no se intenta la tercera. Toast de error «Guardamos {Sede 1}. No se pudo en {Sede 2} (…). Vuelve a intentarlo: lo ya guardado no se duplica.» El modal sigue abierto y las tablas ya muestran lo guardado. |
| it2-cl-7 | **Dueño** | Es ADMIN de la organización que crea (`OrganizationRepository.save`), así que al crear cualquier sede de ella recibe DOCTOR + perfil (verificado: la membership ADMIN nace con la organización, antes de que exista una sede). En una organización creada por otro ADMIN no tiene membership (rg-4 del plan anterior) y no recibe nada, salvo que lo promuevan a ADMIN. Ahí no tiene membership previa, así que no le aplica el 409 del dueño. Nadie lo degrada (t-6). |
| it2-cl-8 | **ADMIN degradado a USER** | Sus DOCTOR de sede siguen vivas (it2-6): en esas sedes es DOCTOR efectivo (sólo sus citas, «Configuración»), en el resto USER. Ya no edita especialidades. Su perfil sigue vivo: sale en el booking sólo si tiene especialidad y horarios, y cuenta en Médicos sólo con horarios. En la lista de la organización: «Todas las sedes · Usuario» y «{Sede} · Médico». Si lo vuelven a promover, sus DOCTOR quedan `kept`. |
| it2-cl-9 | **Segunda sede a quien tiene la invitación pendiente** (reemplaza cl-8) | Dentro de 5 minutos desde la última invitación de esa persona: membership (y perfil), pero ni invitación nueva ni correo (`invitationSent: false`). Pasados los 5 minutos: invitación para esa membership y correo. Accede a las dos sedes desde que crea su contraseña con cualquier enlace. |
| it2-cl-10 | **Volver a guardar a un ADMIN sin cambios** | `updated`, sin `grantAttending` (no hay transición) ni bloqueo. |
| it2-cl-11 | **Un ADMIN de la organización borrado** (`deletedAt`) al crear una sede | No recibe nada (sólo memberships vivas). |
| it2-cl-12 | **ADMIN de otra organización de la misma cuenta** al crear una sede en A | No recibe nada: los ADMIN se leen por la organización padre. |
| it2-cl-13 | **Promoción y alta de sede a la vez** | Las serializa `lockAccountQuota`: el nuevo ADMIN termina con membership DOCTOR en la sede nueva, la cree quien la cree primero. Un `P2002` en `(userId, resourceId)` (asignación manual simultánea) → 409 de t-15. |
| it2-cl-14 | **Persona con acceso sólo a otra organización de la cuenta** | No sale en la lista de esta organización. |

## e2e

### Cambios en `support/`

- `support/profile.ts` › `addDoctorProfile`: `doctorProfile.upsert({ where: { membershipId }, create: { membershipId, specialties: { connect } }, update: { specialties: { set } } })`. Una sede creada por api ya le da al ADMIN membership DOCTOR y perfil, y `create` chocaría en `membership_id`.
- **Regla para cualquier seed por Prisma:** en una sede creada con `createClinicResource` (api), el ADMIN de la organización ya tiene membership DOCTOR y perfil vacío. Un `userResourceMembership.create` para él en esa sede choca en `(user_id, resource_id)`: hay que reutilizar la existente (`findUniqueOrThrow` por `userId_resourceId`) o pasar por `addDoctorProfile`. Revisa `support/lookup-fixture.ts`, `support/availability.ts` y los specs que siembran perfiles del ADMIN.
- `support/accounts.ts` › `createClinicResourceViaPrisma`: no cambia, y su comentario suma «no aplica la regla del ADMIN que atiende (it2-3): úsala cuando el ADMIN no deba tener perfil en esa sede».
- **Nuevo** `support/profile.ts` › `findDoctorProfileId(userId, clinicId): Promise<string \| null>` (`doctorProfile.findFirst({ where: { membership: { userId, resourceId: clinicId } } })`).

### Specs que se rompen

| Spec | Qué se rompe | Cómo queda |
| --- | --- | --- |
| `api/doctor-profile/doctor-metrics.spec.ts` | CA-11 (el ADMIN cuenta sin horarios) | El ADMIN (y cualquier médico) cuenta sólo con un horario; sin horarios, 0. CA-12 sigue. Sede y organización coinciden. |
| `api/doctor-profile/admin-attends.spec.ts` | «asignarse crea la membership…» (`created`), «sin asignarse no hay perfil», CA-32 (403 antes de asignarse), `editableClinics` vacío al inicio | En la sede creada por api, el ADMIN ya tiene membership DOCTOR y perfil vacío: asignarse con especialidades → `updated`, mismo `doctorProfileId`. Sin especialidad ni horarios no sale en el booking. CA-32: 403 sólo para un ADMIN de una organización sin sedes, y 200 en cuanto existe una. `editableClinics` trae la sede desde el principio, con `specialties: []`. |
| `api/booking/booking-requires-schedule.spec.ts` | CA-8 (el ADMIN «asignado») | El ADMIN con perfil automático, especialidad y horarios aparece. Sin especialidad (sólo horarios), no aparece. |
| `api/user/my-profile.spec.ts` | CA-25 y CA-36 («ADMIN sin perfil»), si el ADMIN es el de una sede creada por api | Para «ADMIN sin perfil», usar un ADMIN de una organización sin sedes, o una sede de `createClinicResourceViaPrisma`. |
| `api/invitations/assign-member.spec.ts` | «segunda sede a quien tiene la invitación pendiente: otra invitación y otro correo»; los casos que siembran al ADMIN en la sede | it2-cl-9: dentro de 5 minutos no hay invitación ni correo; tras retrasar `expiresAt` de la primera invitación más de 5 minutos, sí. |
| `ui/invitations/accept-invitation-existing-password.spec.ts` (CA-4) | La segunda invitación pendiente ya no se crea dentro de 5 minutos | Antes de asignar la segunda sede, retrasar con Prisma el `expiresAt` de la primera invitación más de 5 minutos. Lo demás igual. |
| `ui/organization/invite-organization-user.spec.ts` | Columna «Rol» → «Accesos»; «Invitación expirada» ya no existe en la organización; la pista hacia Sedes; el subtítulo | «ve su fila con Tú»: con el acceso «Todas las sedes · Administrador» (más «{Sede} · Médico» si la sede se creó por api) y el texto nuevo del vacío, sin enlace. La prueba de «Invitación expirada» se reescribe: «Invitación pendiente» mientras no tenga contraseña, también con el token vencido, y desaparece al crearla. «la tabla de la sede… nunca Invitación pendiente» sigue igual. |
| `ui/organization/assign-from-organization.spec.ts` | El `Select` «Sede» pasa a radios y casillas; «el ADMIN se asigna como Médico: ve Configuración» | El alcance se elige con «Todas las sedes» / «Sedes específicas» y las casillas. El ADMIN que creó la sede por api ya ve «Configuración». La prueba pasa a «elige especialidad y horario y aparece en el booking». |
| `ui/clinic/clinic-space-users.spec.ts` | «el ADMIN se asigna como Médico, ve Configuración» | Lo ve desde que se crea la sede. La tabla trae su fila «Médico» con «Tú». |
| `ui/profile/profile-admin-specialties.spec.ts` (CA-64 «no atiende») | El aviso y el enlace | Con un ADMIN de una organización sin sedes: «Todavía no atiendes en ninguna sede. Al crear una sede quedas como médico de ella; después eliges aquí tus especialidades.» y «Ir a Sedes». CA-55 a CA-63: el ADMIN ya tiene la fila de la sede creada por api; los que sembraban su perfil pasan por `addDoctorProfile` (upsert). |
| `ui/profile/profile-view.spec.ts` (CA-49) y `profile-edit.spec.ts` | «El ADMIN no ve Tratamiento» | Lo ve si su organización tiene sede; para el caso negativo, una organización sin sedes. |
| `ui/clinic/invite-user-form.spec.ts`, `ui/clinic/clinic-users-specialties.spec.ts`, `ui/invitations/invite-doctor.spec.ts` | Cuentan filas de la tabla de la sede o esperan sólo al invitado | Contar con la fila del ADMIN («Médico», «Sin especialidades»), o buscar por correo. |
| `ui/organization/invite-organization-user.spec.ts` («el aviso de acceso cambia con el rol») | Texto de ADMIN | Suma la frase de it2-15. |

Después, **la suite completa**: la regla de it2-3 toca toda sede creada por api. Cualquier otro
fallo por el ADMIN de más en una sede se arregla con las reglas de `support/` de arriba, sin
cambiar lo que prueba el spec.

### Specs nuevas (los ids los pone el product-manager)

- `api/doctor-profile/admin-attends-by-default.spec.ts`:
  - it2-cl-1: sede creada por api con dos ADMIN y un USER de la organización (sembrados por
    Prisma antes de crearla). Dos DOCTOR + perfiles vacíos, nada para el USER, sin
    `user_invitation` nuevas ni correos. `GET /clinic/:id/doctors` vacío. `doctors: 0` en las dos
    métricas. Con especialidad + horario aparece y cuenta 1.
  - it2-cl-7: el dueño, tras organización y sede por api: `GET /user/me/resource/:clinicId/membership` → `role: "ADMIN"` y `doctorProfileId` no nulo.
  - it2-cl-2 e it2-cl-3: organización con tres sedes (una por api y dos por Prisma). La persona
    tiene una USER viva en la segunda y una borrada con perfil, especialidad y horario en la
    tercera. Promoverla a ADMIN → primera `created` (DOCTOR + perfil), segunda sigue USER sin
    perfil, tercera revivida DOCTOR con el mismo `doctorProfileId`, especialidad y horario.
  - it2-cl-10: volver a guardar al ADMIN no cambia el número de memberships.
  - it2-cl-8: degradar a USER deja vivas sus DOCTOR de sede; la membership de esa sede → `role: "DOCTOR"`.
  - it2-cl-11 e it2-cl-12: un ADMIN borrado de la organización y un ADMIN de otra organización
    de la cuenta no reciben nada.
- `api/organization/organization-team.spec.ts`:
  - una fila por persona: el ADMIN («Todas las sedes · ADMIN» + sus sedes DOCTOR), un médico de
    una sede, un USER de la organización que además es Médico en otra. Orden de los accesos.
  - las memberships borradas, las personas de otra organización de la cuenta y las sedes de otra
    organización no salen.
  - `invitationStatus`: `"pending"` sin contraseña (también con el token vencido) y `null` con
    contraseña.
  - claves exactas `name`, `lastName`, `email`, `phone`, `invitationStatus`, `accesses`; las de
    cada acceso, `clinicId`, `clinicName` y `role`; nunca `id`, `userId` ni `accountId`.
  - con el id de una sede en `:resourceId` (ADMIN heredado) → 404; organización de otra cuenta →
    404; DOCTOR o USER → 403.
- `api/invitations/assign-member.spec.ts` (suma): tres sedes seguidas para un correo nuevo → un
  solo correo capturado, y sólo la primera membership tiene `user_invitation`.
- `ui/organization/assign-many-clinics.spec.ts` (1280 y 375 px):
  - «Sedes específicas» muestra las casillas. Sin marcar ninguna, «Elige al menos una sede»,
    sin petición y con el foco en la primera casilla.
  - it2-cl-4: tres sedes (USER viva, borrada, nueva) como Médico con una especialidad. Aviso
    ámbar, el toast compuesto, un solo correo, tres memberships DOCTOR con esa especialidad, la
    borrada con su mismo perfil. La tabla de la organización muestra los tres accesos.
  - it2-cl-6: con el modal en el paso 2, sembrar por Prisma una ADMIN directa de la persona en la
    segunda sede y enviar. Toast de error parcial, la primera guardada, la tercera sin tocar, y
    el modal abierto. Reenviar después de quitar el seed → éxito.
  - desde Usuarios de la sede no hay radios: sede fija.
  - a 375 px, sin desplazamiento horizontal en el modal ni en la tabla.
- `ui/organization/organization-team-table.spec.ts` (1280 y 375 px): chips de accesos con sus
  `aria-label`, «Tú», «Invitación pendiente» que desaparece al crear la contraseña, y el texto
  del vacío.

`platform/e2e/README.md`: filas de los specs tocados y de los nuevos.

## Verificación

- `pnpm typecheck` y `pnpm check` limpios en `api` y `platform`. `git diff --stat` sin cambios
  en `policy.ts`, `auth.ts`, `entitlements.ts`, `schema.prisma`, migraciones ni `.env*`.
- **Peticiones manuales** (api local, base de desarrollo; cookies `$A` dueño y ADMIN de `$ORG`,
  `$B` otro ADMIN de `$ORG` sembrado antes de la sede, `$U` USER de `$ORG`):
  1. `POST /organization/$ORG/clinics` con `$A` → 201. En la base, memberships DOCTOR de `$A` y
     `$B` en la sede, con perfil y `_count.specialties = 0`; ninguna de `$U`.
  2. `GET /clinic/$S1/doctors` → `[]`. `GET /clinic/$S1/metrics` con `$A` → `doctors: 0`.
     `PUT /clinic/$S1/availability` con `$A` y su especialidad (por `…/doctors/:id/specialties`)
     → aparece en el booking y `doctors: 1`.
  3. `GET /organization/$ORG/users` con `$A` → filas con `accesses`. Con `$S1` como `:resourceId` → 404.
  4. `POST /organization/$ORG/invitations` con `$A` promoviendo a `$U` a ADMIN → 200, y `$U`
     tiene DOCTOR + perfil en `$S1`.
  5. Correo nuevo asignado como DOCTOR a dos sedes seguidas (`$S1` y una sede por Prisma) → la
     primera con `invitationSent: true`, la segunda con `false`, y un solo correo.
- **Navegador** (1280 y 375 px): crear organización y sede como dueño → «Configuración» en la
  sede, «Mi perfil» con la fila editable y «Tratamiento»; antes de crear la sede, el aviso nuevo
  con «Ir a Sedes». Asignar tres sedes desde Usuarios de la organización. Ver la tabla de
  accesos. Desde Usuarios de la sede, la sede fija.
- **e2e:** `cd platform && pnpm test:e2e` con la suite completa.

## Orden de implementación

Cada paso termina con `pnpm typecheck` en su proyecto.

1. **api: métricas.** `live-doctor-profile.ts` (`organizationId`, `countedDoctorProfileWhere`) y
   las dos consultas de métricas.
2. **api: repositorio.** `membership.repository.ts` (dominio e infraestructura).
3. **api: crear sede.** `create-clinic.usecase.ts`.
4. **api: asignar.** Promoción, bloqueo y correo por persona en `invite-user.usecase.ts`.
5. **api: lista de la organización.** La interfaz, la consulta y la ruta. `pnpm check` y las
   peticiones manuales 1 a 5.
6. **platform: datos.** `organizations/types.ts`, `lib/utils.ts` (`formatList`) y las acciones
   (`invite-user`, `invite-organization-user` y `create-clinic`).
7. **platform: tabla de la organización.** Los exports de `users-table.tsx`,
   `organization-users-table.tsx`, la página y `users-top-header.tsx`.
8. **platform: formulario.** `assignment-notice.tsx`, `form.tsx`, `modal.tsx` e
   `inherited-access-notice.tsx`.
9. **platform: «Mi perfil».** `where-you-work-card.tsx`. `pnpm check`.
10. **e2e.** `support/`, los specs que se rompen, los nuevos y `README.md`. Suite completa.
11. Resumen final: qué cambió, qué se verificó y qué no.

## Requiere confirmación

Nada bloquea. El contrato de varias sedes cumple la regla de `:resourceId` (it2-9).

## Iteración 2b: degradar a un ADMIN

Decidido por el humano el 23 de octubre de 2026. Sin schema ni migración. Reemplaza la regla
it2-6 («dejar de ser ADMIN no borra nada») y el caso it2-cl-8.

**Reglas**

1. Cuando la membership de organización de una persona pasa de ADMIN a USER
   (`POST /organization/:resourceId/invitations`), en cada sede de esa organización donde tenga una
   membership directa viva con rol DOCTOR:
   - Sin citas pendientes en esa sede (estado de `BLOCKING_APPOINTMENT_STATUSES` y inicio desde
     ahora): se borra lógicamente la membership (`deletedAt`). No se tocan el `DoctorProfile`, sus
     horarios ni sus especialidades. Sale del booking, deja de ver «Configuración» y sigue entrando
     a la sede como USER heredado.
   - Con citas pendientes: no se toca; sigue como Médico.
   - Aplica también a las DOCTOR que se le asignaron a mano antes de ser ADMIN: el sistema no las
     distingue. El aviso se lo muestra al ADMIN antes de guardar.
2. Las memberships USER directas de sede no se tocan.
3. Al volver a ser ADMIN (`grantAttending`) o al asignarle Médico en una sede se revive la misma
   fila con el mismo perfil, horarios y especialidades: vuelve al booking sin configurar nada.
4. Todo en la transacción del cambio de rol, con el mismo `lockAccountQuota` que la promoción, y
   acotado por `accountId` y por la organización de la URL.
5. La respuesta suma `stoppedAttending` (`clinicId`, `clinicName`) y `stillAttending`
   (`clinicId`, `clinicName`, `pendingAppointments`) sólo cuando hay una degradación. El mensaje de
   éxito lo resume.
6. La búsqueda por correo de la organización suma, por sede, `pendingAppointments` (sólo el
   número). El formulario avisa antes de guardar, al bajar de Administrador a Usuario:
   «{Nombre} dejará de atender en {sedes}. Sus horarios se guardan por si vuelve a atender.» y, por
   cada sede con citas, «En {sede} tiene {N} citas pendientes: seguirá atendiendo ahí. Pásalo a
   Usuario en esa sede cuando ya no tenga citas.».

**Por qué:** el ADMIN que atiende por defecto no debe quedar como médico fantasma al perder el
rol, pero tampoco se pueden dejar citas ya reservadas sin médico en la agenda. Borrar sólo la
membership conserva horarios y especialidades para el regreso, y revivir la misma fila (t-5) ya
devuelve todo sin configurar nada.
