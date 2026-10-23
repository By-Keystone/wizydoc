# Plan: perfil de médico y especialidades

**Rama:** `feat/doctor-profile-specialties` (desde `origin/main`)
**Fecha:** 19 de octubre de 2026
**Mockup:** `docs/features/doctor-profile-specialties/mockup.html` (se revisa con
`npx -y lavish-axi docs/features/doctor-profile-specialties/mockup.html`).
**Antecedentes:**
- `docs/features/perfil-usuario/plan.md`: «Mi perfil», `GET`/`PATCH /user/me/profile`, «Dónde
  atiendes» en solo lectura (t-5) y la regla del tratamiento.
- `docs/PRODUCT.md`, «Planes»: ningún plan limita médicos. «Prioridades»: «el administrador
  también atiende» va antes que «Mi día».

## Objetivo

El ADMIN elige sus propias especialidades por sede desde «Mi perfil», y un ADMIN de la
organización o el dueño de la cuenta cambian las de los demás desde la lista de usuarios de cada
sede. De paso, el booking deja de mostrar a los médicos que no tienen horarios.

## Decisiones del humano (18 y 19 de octubre de 2026)

1. «Mi perfil» tiene una sección de perfil de médico, separada de los datos personales. Por
   ahora **solo especialidades, por sede**. No se agrega ningún dato nuevo (ni colegiatura, ni
   descripción, ni duración).
2. Son datos internos. El booking no muestra nada nuevo; las especialidades se usan en el booking
   igual que hoy.
3. Quién edita:
   - el ADMIN edita las suyas desde «Mi perfil»;
   - el médico invitado (DOCTOR) solo las ve;
   - las de los demás se editan en Sedes › Ver usuarios (t-4). Ahí el ADMIN edita las de todos
     menos las suyas: su propia fila no ofrece «Editar especialidades», y el api rechaza que
     alguien edite las suyas por ese endpoint.
4. **Pueden editar el ADMIN de la organización y el ADMIN de la cuenta (el dueño)**, este en
   cualquier organización y sede de su cuenta. El ADMIN directo de una sede no edita.
5. **Todo ADMIN tiene perfil de médico.** «Atiende» quiere decir «tiene horarios en esa sede».
   Quedan para el ticket «el administrador también atiende»: quién lo ve en el booking, «Mi
   Disponibilidad» para el ADMIN y el aviso «Configura tus horarios» con su acción.
6. Ningún plan limita médicos: el ADMIN con perfil no ocupa plaza.
7. Sin horarios no se aparece en el booking, para ningún médico.
8. En «Mi perfil», bajo sus especialidades, se avisa al ADMIN que sin horarios no aparece en el
   booking (texto en «UI»).
9. El ADMIN no cuenta como «Médico» en las métricas hasta tener horarios.
10. Se aprueban t-1 (el perfil se crea al guardar), t-4 (Sedes › Ver usuarios) y t-6 (las sedes
    del ADMIN en «Mi perfil»).

## Decisiones técnicas

| # | Decisión | Por qué |
| --- | --- | --- |
| t-1 | **El perfil del ADMIN se crea al guardar sus especialidades** en una sede (upsert por `userId` + `clinicId`). Se descartan dos opciones: crearlo al registrarse o al crear la sede, y rellenarlo con una migración de datos. Mientras no exista la fila, el api trata al ADMIN como si tuviera un perfil vacío. **Aprobada.** | Es lo más simple y no necesita pasos en producción. **Sin transacción en el caso de uso:** un `P2002` aborta la transacción y el reintento del upsert ya no podría correr; el upsert anidado es atómico por sí solo, y un `P2025` (especialidad borrada entre el conteo y la escritura) se responde como 404 «Especialidad no encontrada». Crearlo antes obligaría a tocar cuatro flujos: crear la organización, crear la sede, aceptar la invitación de un ADMIN de organización y la de un ADMIN de sede. Además dejaría una fila vacía por cada ADMIN y cada sede. Un perfil sin especialidades ni horarios no se ve en ningún sitio, así que crearlo antes no aporta nada. El otro ticket reutiliza el mismo upsert para «Mi Disponibilidad». |
| t-2 | **Edita quien es «editor de especialidades» de la organización:** el dueño de la cuenta (`account.ownerId = userId`) o quien tiene una membership viva con rol `ADMIN` sobre la organización. El ADMIN directo de una sede no edita. La regla vive en una sola consulta, `CanEditOrganizationSpecialtiesQuery`, que usan los dos casos de uso y «Mi perfil». | Es la decisión 4. **El dueño se identifica por `Account.ownerId`, no por `User.role`.** `User.role` (`UserRole`) tiene `@default(USER)` y `input: false` en Better Auth, y ningún código lo pone en `ADMIN`: hoy vale `USER` para todos, también para el dueño. `isAccountOwner` de `GET /user/me` ya se calcula con `account.ownerId === request.user.userId` (`routes/user/index.ts:100`), así que es el mismo criterio. |
| t-3 | **Las rutas nuevas van bajo `/organization/:resourceId/clinics/:clinicId/…`, con `policy({ account: true, confirmed: true, onboarded: true })`, sin `roles`. La autorización la hace el caso de uso con t-2.** | La política actual no puede expresar «ADMIN de la organización **o** dueño de la cuenta». `roles: ["ADMIN"]` exige una membership sobre `:resourceId`, y el dueño puede no tenerla: si otro ADMIN creó la organización (`create-organization.use-case.ts`), o si se borró la suya. Hacerlo en el caso de uso no toca `policy.ts`, y ya hay un precedente: `POST /organization` («el rol lo comprueba el caso de uso»). Se aparta de la convención de `api/AGENTS.md` («`:resourceId` con `member` o `roles`»), así que va en «Requiere confirmación», con la alternativa. |
| t-4 | **Pantalla de edición de los demás: la lista de usuarios de la sede dentro del panel de la organización** (`/organization/[resourceId]/clinic/[clinicId]/users`, «Sedes» → «Ver Usuarios»). **Aprobada.** | Los médicos solo existen en esa lista: se invitan a una sede y su perfil es por sede. «Usuarios» de la organización lista solo ADMIN y USER de la organización. |
| t-5 | **En esa lista se editan las filas con rol DOCTOR, también la propia.** La fila propia (la que se marca «Tú») lleva «Editar especialidades» como las demás. El USER (recepción) no tiene perfil de médico y no se le asignan especialidades. | Cambiado el 22 de octubre de 2026 junto con t-14: el ADMIN edita sus especialidades aquí o en «Mi perfil». |
| t-6 | **«Dónde atiendes» del editor lista todas las sedes que puede editar.** Las sedes con especialidades salen como un bloque con chips y «Editar». Las demás salen como filas compactas de una línea («Sin especialidades» y «Asignar especialidades»), debajo de las primeras. Para el dueño son todas las sedes de la cuenta. **Aprobada.** | El médico independiente, que es el foco, tiene una sola sede y ve su fila con la acción. Una clínica con varias sedes no se llena de bloques vacíos. **Cambio en el PR 3:** `GET /user/me/profile` no cambia `clinics` (solo sedes con perfil, como hoy) y suma `editableClinics` con las sedes editables; así el PR 3 se despliega solo sin alterar lo que ve el platform actual. `hasDoctorProfile` no cambia. |
| t-7 | **El booking solo lista médicos con al menos un horario** (`EXISTS` sobre `doctor_schedule` en `get-clinic-doctors.query.ts`). Es el único cambio necesario. | Hoy no se cumple: la consulta exige perfil, membership directa viva y especialidad de la organización, pero no horarios. Las especialidades del paso 1 salen de los médicos (`booking-wizard.tsx`), así que también desaparece la especialidad que nadie atiende. Reservar (`assertSlotIsOffered`) y reprogramar ya exigen un hueco. |
| t-8 | **El ADMIN de la organización sigue sin poder reservarse**, aunque tenga perfil, especialidades y horarios. | Las cuatro comprobaciones de «reservable» exigen membership **directa** sobre la sede: `get-clinic-doctors.query.ts`, `GetDoctorSlotsQuery.isBookable`, `CreateAppointment.findBookableDoctor` y `Reschedule.isAlternativeDoctor`. El ADMIN de organización solo la hereda. Cambiar esas cuatro a la vez es tarea del otro ticket (ver «Dependencias»). |
| t-9 | **Las especialidades se reemplazan por completo** (`set`), y la lista puede ir vacía. | Vacía quiere decir que el médico deja de aparecer en el booking de esa sede; sus citas no cambian (rg-3). Al reemplazar también se borran las especialidades de otra organización que hubieran quedado ligadas por datos viejos (cl-6 de «Mi perfil»). |
| t-10 | **Sin migración.** `DoctorProfile` (`@@unique([userId, clinicId])`) y la relación implícita con `Specialty` ya alcanzan. | No hay datos nuevos (decisión 1). |
| t-11 | **Sin `requireFeature`:** va en todos los planes. | Las especialidades son la base del booking, que es de todos los planes. |
| t-12 | **«Médicos» en las métricas cuenta un perfil si tiene al menos un horario o si su usuario fue invitado como DOCTOR a esa sede** (hay una membership `DOCTOR` sobre la sede, viva o borrada). Aplica a la métrica de la sede (`get-clinic-metrics.query.ts`) y a la de la organización (`get-organizations-doctor-count.query.ts`). | Es la decisión 9. **Hoy las dos cuentan todas las filas de `doctor_profile`** (`doctorProfile.count({ where: { clinicId } })` y el equivalente por organización), sin mirar horarios ni memberships. Hasta este ticket solo se creaban perfiles al invitar a un DOCTOR, así que la segunda condición deja a los médicos invitados exactamente como hoy (también a los quitados de la sede, que ya se contaban; no se corrige aquí). Lo único que cambia es que el perfil del ADMIN cuenta recién cuando tiene horarios. Se aplica también a la organización para que las dos cifras no se contradigan. |
| t-13 | **Las opciones del selector de «Mi perfil» vienen en `GET /user/me/profile`** (`organizations[].specialties`), y «Crear "…"» sale solo si `canCreateSpecialties`. | El dueño sin membership en una organización no puede llamar a `GET /:resourceId/specialties` (`member: true`) ni a `POST /:resourceId/specialty` (`roles: ["ADMIN"]`). Con las opciones en el perfil, el dueño elige en cualquier organización. Además, la edición abre sin una segunda carga. Crear especialidades sigue exigiendo membership `ADMIN` (no se cambia esa ruta). |
| t-14 | **Revertida el 22 de octubre de 2026.** El endpoint de un médico **acepta el perfil propio**: un ADMIN que es DOCTOR de la sede puede editar sus especialidades tanto en «Mi perfil» como en Sedes › Ver usuarios. Ya no existe `OWN_SPECIALTIES`. | Decisión del humano: «un admin puede editar sus especialidades tanto en su perfil como en el panel de usuarios, no hay problema». |

## Requiere confirmación del humano

**Archivos protegidos: nada.** El plan no toca `api/src/plugins/policy.ts`, `auth.ts`,
`entitlements.ts` ni `api/src/infrastructure/vendors/auth/better-auth/auth.ts`.

**Una excepción a la convención de `api/AGENTS.md` (t-3).** Las dos rutas nuevas llevan
`:resourceId` y no declaran `member` ni `roles`: la autorización (dueño o ADMIN de la
organización) la hace el caso de uso con `CanEditOrganizationSpecialtiesQuery`. Sin
`:resourceId` validado por la política, el riesgo es olvidar la comprobación. Se mitiga así:
- la comprobación va en el primer paso de los dos casos de uso;
- tiene e2e de IDOR y de rol (ver «Verificación»);
- un comentario en la ruta dice por qué no lleva `roles`.

**Alternativa que sí toca `policy.ts` (no recomendada):** agregar a `Policy` un
`orAccountOwner?: boolean` que deje pasar al dueño cuando el recurso es de su cuenta:

```diff
 export interface Policy {
   ...
   roles?: MembershipRole[] | "*";
+  /** Con `roles`: el dueño de la cuenta pasa aunque no tenga membership sobre el recurso. */
+  orAccountOwner?: boolean;
 }
 ...
       if (!membership) {
+        if (declared.orAccountOwner && (await isOwnerOfResourceAccount(request.user, resourceId))) return;
         throw fastify.httpErrors.notFound("Resource not found");
       }
```

No se recomienda por tres razones: cambia el plugin del que dependen todas las rutas,
`requireMembership` quedaría sin membership para el dueño, y no hace falta para nada más hoy.

## Cupo de médicos (`assertDoctorSeatAvailable`)

- Cuenta memberships con rol `DOCTOR` (`invite-user.usecase.ts:112`), no perfiles. El perfil del
  ADMIN no crea ninguna membership, así que no ocupa plaza (decisión 6).
- Las rutas nuevas no llaman al cupo: editar especialidades nunca crea memberships.
- No se rompe ni bloquea nada. En Gratis (`includedDoctors: 1`), un ADMIN con especialidades
  propias puede seguir invitando a su único DOCTOR. Lo prueba un e2e.
- Quitar el límite de médicos es otro ticket («Límites por citas» en `PRODUCT.md`).

## Cambios por capa

### Prisma

**Sin cambios ni migración** (t-10).

### api

#### Quién edita (t-2)

- `api/src/application/queries/organization/can-edit-organization-specialties.query.ts`
  (nuevo): la interfaz `ICanEditOrganizationSpecialtiesQuery`, con dos métodos:
  - `execute({ userId, accountId, organizationId }): Promise<boolean>`;
  - `editableOrganizationIds(userId, accountId): Promise<string[]>`.
- `api/src/infrastructure/postgres/queries/organization/can-edit-organization-specialties.query.ts`
  (nuevo):
  - `isAccountOwner`: `account.findFirst({ where: { id: accountId, ownerId: userId } })`.
  - `execute`: `true` si es dueño y la organización es de la cuenta
    (`organization.findFirst({ where: { resourceId, accountId } })`), o si existe
    `userResourceMembership` con `{ userId, resourceId: organizationId, accountId, role: "ADMIN", deletedAt: null }`.
  - `editableOrganizationIds`: si es dueño, todas las organizaciones de la cuenta; si no, las
    que tienen esa membership `ADMIN` viva.
  - Un comentario explica por qué el dueño se toma de `Account.ownerId` y no de `User.role`
    (t-2).

#### Repositorio nuevo

`api/src/domain/repositories/doctor-profile.repository.ts` (nuevo), la interfaz
`IDoctorProfileRepository`:

```ts
export interface SpecialtySummary { id: string; name: string }

export interface IDoctorProfileRepository {
  /** Cuántos de esos ids son especialidades de la organización padre de la sede. */
  countSpecialtiesOfClinicOrganization(clinicId: string, specialtyIds: string[]): Promise<number>;
  /** Crea el perfil si no existe (t-1) y reemplaza sus especialidades. */
  upsertSpecialties(userId: string, clinicId: string, specialtyIds: string[]): Promise<SpecialtySummary[]>;
  /** Perfil de un DOCTOR con membership directa y viva sobre la sede; null si no. */
  findClinicDoctor(doctorProfileId: string, clinicId: string): Promise<{ id: string; userId: string } | null>;
  /** Reemplaza las especialidades de un perfil que ya existe. */
  setSpecialties(doctorProfileId: string, specialtyIds: string[]): Promise<SpecialtySummary[]>;
}
```

`api/src/infrastructure/postgres/repositories/doctor-profile.repository.ts` (nuevo):

- **`countSpecialtiesOfClinicOrganization`.** Es el `count` que hoy está en
  `InviteUserUseCase.assertSpecialtiesBelongToClinicOrganization`:
  `specialty.count({ where: { id: { in }, organization: { resource: { children: { some: { id: clinicId } } } } } })`.
- **`upsertSpecialties`.** Llama a `doctorProfile.upsert` con `where: { userId_clinicId }`,
  `create: { userId, clinicId, specialties: { connect } }` y `update: { specialties: { set } }`.
  - Prisma no hace un `ON CONFLICT` nativo cuando hay escrituras anidadas. Si dos guardados del
    mismo ADMIN llegan a la vez la primera vez, uno puede fallar con `P2002`. En ese caso se
    reintenta una sola vez, por la rama `update`.
  - El comentario del código explica ese porqué.
- **`findClinicDoctor`.** Usa `doctorProfile.findFirst` con
  `{ id, clinicId, user: { resourceMemberships: { some: { resourceId: clinicId, role: "DOCTOR", deletedAt: null } } } }`
  y selecciona `id` y `userId`.
- **`setSpecialties`.** Llama a `doctorProfile.update({ where: { id }, data: { specialties: { set } } })`.
- Las dos escrituras devuelven las especialidades ordenadas por nombre (`localeCompare` con `"es"`).

`api/src/application/use-cases/user/invite-user.usecase.ts`: el método privado
`assertSpecialtiesBelongToClinicOrganization` se queda, pero su `count` pasa a llamar a
`IDoctorProfileRepository.countSpecialtiesOfClinicOrganization`. No cambia de comportamiento.

#### Esquema compartido

`api/src/application/use-cases/doctor-profile/doctor-specialties.schema.ts` (nuevo, como
`clinic-wall-time.schema.ts`):

```ts
export const MAX_SPECIALTIES_PER_DOCTOR = 50;

export const doctorSpecialtiesBodySchema = z.strictObject({
  specialtyIds: z
    .array(z.uuid({ error: "Especialidad inválida" }))
    .max(MAX_SPECIALTIES_PER_DOCTOR, { error: "Puedes elegir hasta 50 especialidades" }),
});

export const organizationClinicParamsSchema = z.object({
  resourceId: z.uuid(),
  clinicId: z.uuid(),
});

export const organizationClinicDoctorParamsSchema = organizationClinicParamsSchema.extend({
  doctorProfileId: z.uuid(),
});
```

- El máximo acota el `IN` de la consulta.
- Los ids repetidos se quitan en el caso de uso (`new Set`), como en la invitación.

#### Casos de uso

Los dos reciben `IDoctorProfileRepository` e `ICanEditOrganizationSpecialtiesQuery`, y corren
en `inTransaction`. Los dos empiezan igual:

1. **`assertClinicInOrganization`.** Busca
   `clinic.findFirst({ where: { resourceId: clinicId, resource: { accountId, parentResourceId: organizationId } } })`.
   Si no está, lanza `NotFound("Sede no encontrada")`. Cubre una sede u organización de otra
   cuenta, una sede de otra organización de la misma cuenta y un `:resourceId` que en realidad
   es una sede.
2. **`assertCanEditSpecialties`.** Si `canEdit.execute(...)` es `false`, lanza
   `Forbidden("Solo un administrador puede cambiar especialidades.")`. Es 403 porque, después
   del paso 1, la sede ya se sabe que es de la cuenta del usuario.

**`api/src/application/use-cases/doctor-profile/update-my-specialties.usecase.ts` (nuevo).**
`UpdateMySpecialtiesUseCase`.
`execute({ userId, accountId, organizationId, clinicId, specialtyIds })`:
1. y 2. como arriba.
3. `assertSpecialtiesBelongToClinicOrganization`: compara el `count` con los ids únicos. Si no
   coinciden, lanza `NotFound("Especialidad no encontrada")`.
4. `repo.upsertSpecialties(userId, clinicId, uniqueIds)` y devuelve `{ specialties }`.

El `userId` sale siempre de la sesión.

**`api/src/application/use-cases/doctor-profile/update-doctor-specialties.usecase.ts` (nuevo).**
`UpdateDoctorSpecialtiesUseCase`.
`execute({ userId, accountId, organizationId, clinicId, doctorProfileId, specialtyIds })`:
1. y 2. como arriba.
3. `repo.findClinicDoctor(doctorProfileId, clinicId)`. Si devuelve `null`, lanza
   `NotFound("Médico no encontrado")`. Cubre el perfil de otra sede o de otra cuenta, el médico
   quitado de la sede, la persona que en la sede es USER o ADMIN y el id inexistente.
4. (Revertido, t-14: el perfil propio ya no se rechaza.)
5. `assertSpecialtiesBelongToClinicOrganization`.
6. `repo.setSpecialties(...)` y devuelve `{ specialties }`.

Ninguno de los dos llama al cupo de médicos.

#### Lectura de «Mi perfil»

`api/src/application/queries/user/get-my-profile.query.ts`:

```ts
export interface MyProfileClinic {
  clinicId: string;
  clinicName: string;
  organizationId: string;          // nuevo
  organizationName: string;
  specialties: { id: string; name: string }[];
  canEditSpecialties: boolean;     // nuevo: t-2 sobre la organización de la sede
  isClinicDoctor: boolean;         // nuevo: perfil + membership directa viva (el criterio de hoy)
  hasSchedule: boolean;            // nuevo: su perfil en esta sede tiene al menos un horario
}

export interface MyProfileOrganization {  // nuevo (t-13); solo las que puede editar
  organizationId: string;
  organizationName: string;
  specialties: { id: string; name: string }[]; // todas las de la organización, por nombre
  canCreateSpecialties: boolean;               // membership ADMIN viva (la de POST /:resourceId/specialty)
}

export interface MyProfile {
  // … lo de hoy
  clinics: MyProfileClinic[];
  organizations: MyProfileOrganization[];       // nuevo; [] si no edita ninguna
}
```

`api/src/infrastructure/postgres/queries/user/get-my-profile.query.ts`. Las sedes salen de la
unión de dos conjuntos, sin repetidos y acotados a la cuenta:
- **A, el de hoy:** las sedes donde la persona tiene `DoctorProfile` y una membership directa y
  viva sobre la sede (`attendingProfilesWhere`). En estas, `isClinicDoctor` es `true`.
- **B, nuevo:** las sedes de `canEdit.editableOrganizationIds(userId, accountId)`:
  `clinic.findMany({ where: { resource: { accountId, parentResourceId: { in: ids } } } })`,
  con el perfil propio (`doctors: { where: { userId }, select: { specialties, _count: { select: { availabilities: true } } } }`),
  que puede no existir. Sin perfil, `specialties` es `[]` y `hasSchedule` es `false`. En estas,
  `canEditSpecialties` es `true`.
- `organizations` lista las organizaciones de B con sus especialidades.
- Las especialidades de cada sede se siguen filtrando a la organización de la sede, con el
  orden de hoy (organización y sede).
- `doctorDisplayName` no es `null` si `clinics.length > 0`.
- `hasDoctorProfile(userId, accountId)` pasa a devolver `true` si A ∪ B no está vacío.

Efectos:
- El editor con al menos una sede ve «Tratamiento» y puede guardarlo (decisión 5).
- El dueño sin organización o sin sedes sigue recibiendo 403 al poner tratamiento.
- El USER no cambia.
- El ADMIN directo de una sede no entra en B. Si además tiene perfil, entra en A, en solo
  lectura.

#### Lista de usuarios de la sede

`api/src/application/queries/clinic/get-clinic-users.query.ts` y su implementación. Cada fila
suma dos campos:

```ts
doctorProfileId: string | null;              // solo si la fila es DOCTOR y tiene perfil en esta sede
specialties: { id: string; name: string }[]; // de la organización de la sede, por nombre; [] si no hay
```

- La consulta agrega un `LEFT JOIN doctor_profile dp ON dp.user_id = u.id AND dp.resource_id = c.resource_id`.
- Las especialidades salen de una subconsulta `json_agg` filtrada por
  `s.organization_id = r.parent_resource_id`, con `'[]'` por defecto.
- Se agrega `ORDER BY urm.created_at, u.id` para que la lista no cambie de orden al guardar.
- La política de `GET /clinic/:resourceId/users` no cambia (`roles: ["ADMIN"]`).

#### Booking

`api/src/infrastructure/postgres/queries/clinic/get-clinic-doctors.query.ts`. Se agrega al
`WHERE` (t-7):

```sql
AND EXISTS (SELECT 1 FROM doctor_schedule ds WHERE ds.doctor_profile_id = dp.id)
```

El comentario explica el porqué: un médico sin horarios no tiene ningún hueco que ofrecer. El
índice `doctor_schedule(doctor_profile_id)` ya existe. La respuesta pública no cambia de forma.

#### Métricas (t-12)

`api/src/infrastructure/postgres/queries/clinic/get-clinic-metrics.query.ts` y
`api/src/infrastructure/postgres/queries/organization/get-organizations-doctor-count.query.ts`.
El `where` del `doctorProfile.count` suma la misma condición:

```ts
OR: [
  { availabilities: { some: {} } },
  { user: { resourceMemberships: { some: { resourceId: <la sede del perfil>, role: "DOCTOR" } } } },
],
```

- En la sede, `<la sede del perfil>` es `dto.resourceId`.
- En la organización se escribe como `$queryRaw` con `urm.resource_id = dp.resource_id`, o como
  un `count` por sede; queda a elección del engineer.
- La condición vive en una sola función (`countedDoctorProfileWhere`), con un comentario que
  explica la decisión 9.
- La forma de las respuestas no cambia.

#### Rutas (`api/src/routes/organization/index.ts`)

| Ruta | Policy | Entrada | Salida | Errores |
| --- | --- | --- | --- | --- |
| `PUT /organization/:resourceId/clinics/:clinicId/me/specialties` | `policy({ account: true, confirmed: true, onboarded: true })`. Sin `roles` (t-3); lo dice un comentario. | `params: organizationClinicParamsSchema`, `body: doctorSpecialtiesBodySchema`. El usuario y la cuenta salen de `request.user`. | 200 `{ specialties: [{ id, name }] }` | 400 de validación (clave de más, id que no es uuid, más de 50). 401 sin sesión. 403 sin confirmar o sin onboarding (policy). 404 `{ message: "Sede no encontrada" }` si la sede no es de esa organización y de la cuenta. 403 `{ message: "Solo un administrador puede cambiar especialidades.", code: "FORBIDDEN" }`. 404 `{ message: "Especialidad no encontrada" }`. 500 `{ message: "No se pudieron guardar tus especialidades" }`. |
| `PUT /organization/:resourceId/clinics/:clinicId/doctors/:doctorProfileId/specialties` | Igual. | `params: organizationClinicDoctorParamsSchema`, `body: doctorSpecialtiesBodySchema` | 200 `{ specialties: [{ id, name }] }` | Los mismos, más 404 `{ message: "Médico no encontrado" }`. 500 `{ message: "No se pudieron guardar las especialidades" }`. |

- Los errores se mapean como en `routes/user/index.ts`: un `ApplicationError` responde con su
  `statusCode` y `{ message, code }`.
- El log lleva `userId`, `clinicId`, `doctorProfileId` y el nombre del error, nunca nombres ni
  correos.
- Se usa `PUT` porque reemplaza la lista completa y es idempotente (t-9).

`GET /user/me/profile` cambia en la forma de `clinics` y suma `organizations`.
`PATCH /user/me/profile` no cambia de contrato; solo cambia `hasDoctorProfile`.

### platform

#### Clientes y acciones

| Archivo | Cambio |
| --- | --- |
| `platform/src/lib/api/user/types.ts` | `MyProfileClinic` suma `organizationId`, `canEditSpecialties`, `isClinicDoctor` y `hasSchedule`. Tipo nuevo `MyProfileOrganization`, y `MyProfile` suma `organizations`. |
| `platform/src/lib/api/clinic/types.ts` | Tipo nuevo `ClinicMember = ClinicUser & { doctorProfileId: string \| null; specialties: { id: string; name: string }[] }`. `ClinicUser` no cambia, porque `OrganizationUser` lo extiende. |
| `platform/src/lib/api/clinic/index.ts` | `getClinicUsers` pasa a devolver `Promise<ClinicMember[]>`. |
| `platform/src/lib/actions/doctor-profile/update-my-specialties.action.ts` (nuevo) | Recibe `(organizationId, clinicId, _prev, formData)` y sigue el patrón de `platform/AGENTS.md`. Valida `specialtyIds` con `z.array(z.uuid()).max(50)` sobre `formData.getAll("specialtyIds")`. Hace `PUT /organization/{organizationId}/clinics/{clinicId}/me/specialties` y `revalidateTag(userTags.myProfile())`. Devuelve `{ status: "success", message: "Guardamos tus especialidades." }`. |
| `platform/src/lib/actions/doctor-profile/update-doctor-specialties.action.ts` (nuevo) | Recibe `(organizationId, clinicId, doctorProfileId, _prev, formData)`. Hace lo mismo contra `…/doctors/{doctorProfileId}/specialties` y `revalidateTag(clinicTags.clinicUsers(clinicId))`. El mensaje de éxito lo pone el cliente. |

#### Componentes

| Archivo | Cambio |
| --- | --- |
| `platform/src/components/clinic/invite-user/specialty-multi-select.tsx` | Se reutiliza con cuatro props opcionales nuevas: `initialSelected?: Specialty[]` (por defecto `[]`), `onChange?: (selected: Specialty[]) => void`, `label?: string` (por defecto «Especialidades») y `allowCreate?: boolean` (por defecto `true`, como hoy). El `id` del buscador sale de `useId()`. La invitación no cambia. |
| `platform/src/components/profile/where-you-work-card.tsx` | Recibe además `organizations`. Parte `clinics` en dos grupos (t-6): las sedes con `canEditSpecialties` se pintan con `EditableClinicSpecialties`, y las demás, como hoy. La descripción de la tarjeta depende de si hay alguna sede editable. «Mi disponibilidad en esta sede →» solo sale si `isClinicDoctor`. |
| `platform/src/components/profile/editable-clinic-specialties.tsx` (nuevo, cliente) | Props: `clinic: MyProfileClinic`, `organization: MyProfileOrganization` y `variant: "block" \| "row"`. En lectura muestra un bloque con chips, «Editar» y, si `!hasSchedule`, el aviso de la decisión 8; o una fila compacta con «Asignar especialidades». En edición pinta `SpecialtyMultiSelect` con `initialSelected = clinic.specialties`, `initialSpecialties = organization.specialties` y `allowCreate = organization.canCreateSpecialties`, y envía con `useFormAction(updateMySpecialtiesAction)`. Es nuevo porque la tarjeta es de servidor y la edición necesita estado. |
| `platform/src/components/clinic/doctor-specialties-dialog.tsx` (nuevo, cliente) | Props: `organizationId`, `clinicId`, `clinicName`, `doctor: { doctorProfileId; name; lastName; specialties }` y `organizationSpecialties: Specialty[]`. Es el botón «Editar especialidades» y su `Dialog` (`components/ui/dialog.tsx`, tamaño `S`) con `SpecialtyMultiSelect`. Sigue el patrón de `invite-user/modal.tsx`. |
| `platform/src/components/clinic/users-table.tsx` | Prop opcional nueva: `specialtyEditing?: { organizationId; clinicId; clinicName; organizationSpecialties }`. Si viene, agrega la columna «Especialidades» (`hidden sm:table-cell`): chips o la etiqueta «Sin especialidades»; en las filas DOCTOR con `doctorProfileId`, también la propia, `DoctorSpecialtiesDialog`; «—» en las demás. Debajo de `sm`, lo mismo va dentro de la celda «Nombre», bajo el correo (`sm:hidden`). Sin la prop, la tabla de la organización no cambia. |
| `platform/src/components/clinic/users-top-header.tsx` | Prop opcional nueva, `subtitle?: string`, bajo el `h1`, con el estilo de `organization/users-top-header.tsx`. |
| `platform/src/components/common/user-menu.tsx` | El botón del avatar y el ítem «Mi perfil» suman `aria-current={active ? "page" : undefined}`. `sidebar.tsx` ya calcula `active`. |

#### Páginas

| Archivo | Cambio |
| --- | --- |
| `platform/src/app/account/[accountId]/organization/[resourceId]/clinic/[clinicId]/users/page.tsx` | Suma `getMe()` y `userMembershipsApi.getMembershipForResource(clinicId)` al `Promise.all`, para tener el correo propio y el nombre de la sede. Pasa `currentUserEmail` y `specialtyEditing` a `UsersTable`, y `subtitle="Personas con acceso a {sede}."` a `UsersTopHeader`. |
| Las tres páginas `…/me/page.tsx` | Sin cambios. `MyProfile` pasa `profile.organizations` a `WhereYouWorkCard`. |

## Aislamiento entre cuentas

No hay endpoints públicos nuevos. El booking (`GET /clinic/:clinicId/doctors`) solo se vuelve
más estricto.

| Dato | Lectura o escritura | Cómo queda acotado |
| --- | --- | --- |
| Especialidades propias | `PUT …/clinics/:clinicId/me/specialties` | La política exige sesión con cuenta. El caso de uso exige que la sede sea de `:resourceId` y de `request.user.accountId` (si no, 404), y después que el usuario sea dueño de esa cuenta o ADMIN vivo de esa organización (si no, 403). El `userId` es el de la sesión. Las especialidades se cuentan dentro de la organización padre de la sede. |
| Especialidades de un médico | `PUT …/clinics/:clinicId/doctors/:doctorProfileId/specialties` | Lo mismo. Además, el perfil tiene que ser de esa sede y de un DOCTOR con membership directa y viva sobre ella (si no, 404), y no puede ser el propio (403). |
| `GET /user/me/profile` | Lectura | A es como hoy. B sale de `editableOrganizationIds`, acotado a `accountId` de la sesión. `organizations` solo trae las especialidades de esas organizaciones. El perfil incluido es siempre `where: { userId }` de la sesión. |
| `GET /clinic/:resourceId/users` | Lectura | Igual que hoy (`roles: ["ADMIN"]` sobre la sede). El perfil se une por la misma sede de la URL, y las especialidades se filtran a la organización padre. |
| Métricas | Lectura | Sin cambios de acotación: solo cambia qué perfiles cuentan. |
| «Crear "…"» | `POST /:resourceId/specialty`, que ya existe | Sin cambios: `roles: ["ADMIN"]` sobre la organización. |

## Riesgos y casos límite

| Id | Caso | Qué pasa |
| --- | --- | --- |
| rg-1 | **El ADMIN se pone especialidades y espera aparecer en el booking** | No aparece: no tiene horarios (t-7), y el booking exige membership directa (t-8). Lo avisa la línea de la decisión 8 bajo sus especialidades. Todavía no puede configurar horarios: eso llega con el otro ticket. |
| rg-2 | **Un médico de la beta sin horarios desaparece del booking al desplegar** | Es la decisión 7. Si su única especialidad era la de él, la especialidad también desaparece del paso 1. Hoy ese médico no tenía huecos: el paciente llegaba a una semana vacía. |
| rg-3 | **Quitar todas las especialidades a un médico con citas futuras** | **Las citas ya reservadas no cambian.** `appointment.specialty` es texto copiado al reservar y no depende del perfil. El médico las sigue viendo en su agenda. El paciente puede cancelar y reprogramar con el mismo médico, porque reprogramar con él no exige la especialidad, solo membership y huecos. Lo único que cambia es que el médico ya no se puede reservar de nuevo en esa sede, ni se le ofrece como alternativa al reprogramar otra cita. El diálogo lo avisa antes de guardar. |
| rg-4 | **El dueño sin membership en una organización** (la creó otro ADMIN) | Por el api puede editar sus especialidades y las de los médicos de esa organización, y «Mi perfil» le muestra esas sedes con las opciones (t-13). Pero no puede abrir el panel de esa organización ni su lista de usuarios (el layout y `GET /clinic/:id/users` exigen membership), ni crear especialidades ahí (sin «Crear "…"»). Abrirle el panel es otro ticket. |
| rg-5 | **El ADMIN de la organización puede guardar horarios por api** | `PUT /clinic/:resourceId/availability` acepta `roles: ["ADMIN", "DOCTOR"]` y desde ahora encuentra su perfil. Con eso cuenta en las métricas (t-12) y desaparece el aviso, pero sigue sin poder reservarse (t-8). No hay UI para eso hasta el otro ticket. |
| rg-6 | **Organización con muchas sedes** | Cada sede sin especialidades ocupa una línea (t-6). Con más de 10 sedes la tarjeta se alarga. |
| rg-7 | **Las rutas nuevas no validan el rol en la política** (t-3) | Si alguien quita la comprobación del caso de uso, cualquier usuario de la cuenta podría editar. Lo cubren los e2e de rol y el comentario en la ruta. |
| cl-1 | ADMIN que además es DOCTOR directo en una sede | La sede sale una sola vez, editable y con «Mi disponibilidad» (`isClinicDoctor`). En la lista de la sede su fila dice «Tú» y lleva «Editar especialidades». |
| cl-2 | ADMIN de dos organizaciones | Las sedes de las dos, cada una con las especialidades de su organización. |
| cl-3 | ADMIN directo de una sede, sin rol en la organización (solo se crea desde el api) | No edita: 403. Si tiene perfil, ve la sede en solo lectura, como el DOCTOR. Por URL ve `ErrorState`, limitación previa de `member: true` en `GET /:resourceId/specialties`. |
| cl-4 | El médico tiene la invitación pendiente | Su fila es DOCTOR y tiene perfil (se crea al invitarlo), así que se edita. |
| cl-5 | Médico quitado de la sede | No sale en la lista y el `PUT` responde 404. |
| cl-6 | Dos editores cambian al mismo médico a la vez | Gana el último que guarda. |
| cl-7 | Un paciente tiene el booking abierto mientras se quita la especialidad | Al confirmar recibe el 404 de hoy (`BOOKING_OPTION_UNAVAILABLE`). |
| cl-8 | Se crea una especialidad desde el selector y no se guarda | La especialidad queda creada en la organización, como pasa hoy en la invitación. |
| cl-9 | El ADMIN pierde su rol en la organización | Si no es el dueño, sus sedes de B desaparecen de «Mi perfil». Su perfil queda guardado, sin verse. |
| cl-10 | Bajar a Gratis | No cambia nada: va en todos los planes. |

## Dependencias con «el administrador también atiende»

Ese ticket debe:
1. Cambiar a la vez las cuatro comprobaciones de «reservable» de t-8 (y A de «Mi perfil»).
   Se recomienda un solo predicado compartido.
2. Mostrar «Mi Disponibilidad» al ADMIN y al dueño, reutilizando el upsert del repositorio (t-1).
3. Convertir el aviso de la decisión 8 en «Configura tus horarios», con su enlace.
4. Abrir el panel al dueño sin membership (rg-4), si se decide.

## Preguntas abiertas

Ninguna.

## Verificación

**Typecheck y check**
- En `api` y en `platform`: `pnpm typecheck` y `pnpm check` limpios.
- No hay migración (`git diff --stat api/prisma` vacío).

**Peticiones manuales** (api local)

Cookies: `$A`, ADMIN de la organización `$ORG` (no dueño), con la sede `$SEDE`; `$O`, el dueño
de esa cuenta; `$D`, un DOCTOR de esa sede con perfil `$DP`; `$X`, un ADMIN de otra cuenta.
- `curl -s -b "$A" -X PUT -H 'content-type: application/json' -d '{"specialtyIds":["<esp de $ORG>"]}' localhost:4000/organization/$ORG/clinics/$SEDE/me/specialties`
  responde 200. Luego `GET /user/me/profile` muestra la sede con `canEditSpecialties: true`,
  esa especialidad y `hasSchedule: false`.
- Lo mismo con `$O` en una organización creada por `$A`, donde `$O` no tiene membership:
  responde 200.
- Con `$D` responde 403 y no crea ningún perfil.
- Con `$X` responde 404.
- Con `$ORG` reemplazado por `$SEDE` responde 404.
- `PUT …/doctors/$DP/specialties` con `$A` y `{"specialtyIds":[]}` responde 200, y
  `GET /clinic/$SEDE/doctors` deja de listar al médico.
- `PUT …/doctors/<perfil propio de $A>/specialties` responde 200 si $A es DOCTOR de la sede (t-14, revertida).
- Con una especialidad de otra organización responde 404, y las especialidades no cambian.
- Con `{"specialtyIds":[],"userId":"…"}` responde 400.
- `GET /clinic/$SEDE/doctors` no lista a un médico sin horarios; después de guardarle uno, sí.
- `GET /clinic/$SEDE/metrics` con `$A`: `doctors` no cambia al guardar las especialidades de
  `$A`, y sube en uno si `$A` guarda un horario por api.

**Navegador** (1280 px y 375 px)
- «Mi perfil» como ADMIN con una sede y sin especialidades: asignar, «Crear "…"», guardar, ver
  el aviso de horarios, editar y quitar todas.
- Como ADMIN con tres sedes: el bloque y las filas compactas.
- Como DOCTOR: solo lectura, sin botones. Como recepción: sin «Dónde atiendes».
- «Sedes» → «Ver Usuarios»: editar a un médico, el aviso al vaciar, la organización sin
  especialidades, y la fila propia con «Editar especialidades».
- El avatar con `aria-current="page"` en «Mi perfil».
- Sin desplazamiento horizontal a 375 px.

**e2e** (`cd platform && pnpm test:e2e`, la suite completa)

| Prueba | Por qué | Cambio |
| --- | --- | --- |
| `e2e/api/doctor-treatment/doctor-display-name.spec.ts`, `e2e/api/invitations/fix-invitation-set-password.spec.ts` (CA-8), `e2e/api/security/fix-specialty-account-scope.spec.ts`, `e2e/api/security/membership-deleted-filter.spec.ts`, `e2e/api/user/my-profile.spec.ts` (CA-40) | Esperan médicos en `GET /clinic/:clinicId/doctors`. | Sembrar horarios (`seedFullDayAvailability` de `e2e/support/availability.ts`) a los médicos que deben aparecer. |
| `e2e/api/user/my-profile.spec.ts` CA-24 | Compara las claves exactas. | Suma `organizationId`, `canEditSpecialties`, `isClinicDoctor`, `hasSchedule` y `organizations`. |
| `e2e/api/user/my-profile.spec.ts` CA-25 y CA-36 | Usan un ADMIN **directo de la sede**. | Siguen igual para ese ADMIN (cl-3) y se retitulan «ADMIN de sede». |
| `e2e/ui/profile/profile-view.spec.ts` CA-49 | `adminAsProfileUser(world)` es el dueño y ADMIN de la organización. | Ahora ve «Tratamiento», la vista previa y «Dónde atiendes». Queda solo para la recepción, y el ADMIN pasa a las pruebas nuevas. |
| `e2e/ui/profile/profile-edit.spec.ts` («el tratamiento no se envía si el usuario no tiene sedes…») | Puede usar al ADMIN. | Revisarla: el «sin sedes» tiene que ser el dueño sin organización o la recepción. |
| Las que leen las métricas de la sede u organización, si alguna espera `doctors` | El ADMIN sin horarios no cuenta. | Revisarlas; con médicos invitados no cambian. |

Pruebas nuevas propuestas (los IDs los pone el product-manager):
- `e2e/api/booking/booking-requires-schedule.spec.ts`:
  - un médico sin horarios no sale, y su especialidad tampoco;
  - con horarios sale;
  - al borrarle los horarios desaparece y sus citas siguen;
  - el ADMIN de la organización con especialidades no sale.
- `e2e/api/doctor-profile/doctor-metrics.spec.ts`:
  - el ADMIN con especialidades y sin horarios no suma en `doctors` de la sede ni de la
    organización, y con un horario sí;
  - un DOCTOR invitado sin horarios sigue contando, como hoy.
- `e2e/api/doctor-profile/admin-own-specialties.spec.ts`:
  - el primer `PUT` crea el perfil, el segundo lo reemplaza, lista vacía e ids repetidos;
  - el dueño puede en una organización donde no tiene membership;
  - IDOR: otra cuenta, una sede de otra organización y una sede como `:resourceId`, 404;
    especialidad ajena, 404; todos sin cambios;
  - DOCTOR, USER de sede, USER de la organización y ADMIN directo de sede, 403;
  - claves de más y más de 50 ids, 400;
  - `GET /user/me/profile`: dos sedes (una con especialidades y otra sin perfil),
    `organizations` con `canCreateSpecialties` y el dueño sin membership con `false`;
  - `PATCH` del tratamiento: 200 para el ADMIN de la organización y 403 para el dueño sin sedes;
  - en Gratis, después de guardar sus especialidades, el ADMIN sigue pudiendo invitar a su
    DOCTOR.
- `e2e/api/doctor-profile/doctor-specialties-by-admin.spec.ts`:
  - el ADMIN de la organización y el dueño cambian las de un DOCTOR;
  - el perfil propio se edita igual que los demás (t-14, revertida);
  - `GET /clinic/:resourceId/users` trae `doctorProfileId` y `specialties` (`null` y `[]` para
    USER);
  - `doctorProfileId` de otra sede, de otra cuenta o de un médico quitado, 404;
  - un DOCTOR que intenta cambiar las de otro, 403, sin cambios;
  - vaciarlas deja la cita futura intacta y saca al médico del booking.
- `e2e/ui/profile/profile-admin-specialties.spec.ts` (375 px y 1280 px):
  - ADMIN con una sede sin especialidades: fila, «Asignar especialidades», elegir, guardar, toast
    y el aviso de horarios;
  - «Crear "…"» con la organización sin especialidades;
  - «Cancelar» descarta;
  - tres sedes: bloque y filas;
  - DOCTOR sin botones;
  - sin desplazamiento horizontal.
- `e2e/ui/organization/clinic-users-specialties.spec.ts`:
  - la columna y los chips, y «Sin especialidades»;
  - el diálogo con el foco y Escape, el aviso al vaciar, guardar y toast;
  - USER sin botón;
  - la fila propia con «Editar especialidades» y guardar;
  - a 375 px, la acción bajo el nombre.
- `e2e/ui/profile/profile-navigation.spec.ts`: `aria-current="page"` en el avatar del pie en
  `/me`, y su ausencia en las demás páginas.

`platform/e2e/README.md` se actualiza.

**Documentación al cerrar:** `docs/PRODUCT.md` («Estado») y `docs/capacidades.md` deben decir
que el ADMIN tiene perfil de médico con especialidades editables, quién edita las de los médicos
y desde dónde, que el booking oculta a los médicos sin horarios y cómo cuenta «Médicos».

## Pasos para el engineer (PRs chicos y apilados)

Cada PR sale del anterior. Cada uno deja `typecheck`, `check` y la suite e2e verdes.

**PR 1. `fix: mark the avatar as the current page in "My profile"`** (solo platform)
1. Agrega `aria-current` en `user-menu.tsx` (botón e ítem «Mi perfil»).
2. Suma el caso en `profile-navigation.spec.ts`.

**PR 2. `feat(api): doctors without schedules leave the booking`** (api y e2e)
1. Agrega el `EXISTS` en `get-clinic-doctors.query.ts`, con su comentario.
2. Agrega `countedDoctorProfileWhere` en las dos métricas (t-12).
3. Siembra horarios en las cinco pruebas de la tabla.
4. Crea `booking-requires-schedule.spec.ts` y `doctor-metrics.spec.ts` (el caso del ADMIN usa un
   perfil sembrado por Prisma hasta el PR 3).

**PR 3. `feat(api): let an ADMIN set their own specialties`** (api y e2e)
1. Crea `CanEditOrganizationSpecialtiesQuery` y el repositorio `doctor-profile`, y pasa el
   `count` de `invite-user.usecase.ts` al repositorio.
2. Crea `doctor-specialties.schema.ts` y `update-my-specialties.usecase.ts`.
3. Agrega la ruta `PUT …/me/specialties`, con el comentario de t-3.
4. Cambia `get-my-profile` (A ∪ B, `organizations`, los campos nuevos y `hasDoctorProfile`).
5. Ajusta CA-24, CA-25 y CA-36 de `my-profile.spec.ts`, y crea
   `admin-own-specialties.spec.ts`.
6. Haz las peticiones manuales.

**PR 4. `feat(api): let an ADMIN set a doctor's specialties`** (api y e2e)
1. Crea `update-doctor-specialties.usecase.ts` (con t-14) y su ruta.
2. Agrega `doctorProfileId`, `specialties` y el orden en `get-clinic-users`.
3. Crea `doctor-specialties-by-admin.spec.ts`.

**PR 5. `feat: edit your own specialties in "My profile"`** (platform)
1. Actualiza los tipos y crea `update-my-specialties.action.ts`.
2. Agrega las props nuevas de `SpecialtyMultiSelect`.
3. Crea `EditableClinicSpecialties` y cambia `WhereYouWorkCard` y `MyProfile`.
4. Ajusta CA-49 y crea `profile-admin-specialties.spec.ts`.
5. Compara con el mockup a 375 px y a 1280 px.

**PR 6. `feat: edit a doctor's specialties from the clinic's users`** (platform)
1. Crea `ClinicMember`, `update-doctor-specialties.action.ts` y `DoctorSpecialtiesDialog`.
2. Cambia `UsersTable`, `UsersTopHeader` y la página de usuarios de la sede.
3. Crea `clinic-users-specialties.spec.ts` y actualiza `e2e/README.md`.
4. Corre la suite completa y escribe el resumen de lo verificado.

## UI

El mockup es la referencia de diseño y de textos. No se implementa del mockup el panel de
controles ni el botón «Probar error», que son del prototipo.

### Rutas y layout

| Pantalla | Ruta | Layout |
| --- | --- | --- |
| «Mi perfil» | `/account/[accountId]/me`, `/account/[accountId]/clinic/[clinicId]/me` y `/account/[accountId]/organization/[resourceId]/me` | Los de hoy: la `TopNav` bajo los workspaces y el `Sidebar` dentro del panel. |
| Usuarios de la sede | `/account/[accountId]/organization/[resourceId]/clinic/[clinicId]/users` | El layout de la organización, con el `Sidebar` (activo en «Sedes»). |

### Árbol de componentes

```
MyProfile (pasa organizations)
├─ PersonalDataCard (sin cambios; «Tratamiento» sale si clinics.length > 0)
├─ WhereYouWorkCard (modificado) ← profile.clinics, profile.organizations
│   ├─ sedes con canEditSpecialties y especialidades
│   │   └─ EditableClinicSpecialties variant="block" (nuevo)
│   │       ├─ aviso de horarios si !hasSchedule
│   │       └─ en edición: SpecialtyMultiSelect (reutilizado, props nuevas)
│   ├─ sedes con canEditSpecialties y sin especialidades
│   │   └─ EditableClinicSpecialties variant="row" (nuevo)
│   └─ sedes sin canEditSpecialties: el bloque de solo lectura de hoy
│       └─ ClinicAvailabilityLink si isClinicDoctor (reutilizado)
└─ PasswordCard (sin cambios)

ClinicUsersPage (modificada)
├─ UsersTopHeader (subtitle nuevo) ← resourceName de getMembershipForResource(clinicId)
│   └─ InviteUserModal (sin cambios)
└─ UsersTable currentUserEmail specialtyEditing={…} ← getClinicUsers(clinicId), getOrganizationSpecialties(resourceId), getMe()
    ├─ fila DOCTOR ajena: chips o «Sin especialidades» y DoctorSpecialtiesDialog (nuevo)
    │   └─ SpecialtyMultiSelect (reutilizado)
    └─ fila propia: chips y DoctorSpecialtiesDialog, como las demás
```

### Qué dato alimenta cada parte

| Parte | Dato |
| --- | --- |
| Sedes de «Dónde atiendes» | `GET /user/me/profile` → `clinics[]` |
| Opciones del selector y «Crear "…"» en «Mi perfil» | `GET /user/me/profile` → `organizations[]` (`specialties`, `canCreateSpecialties`) |
| Crear una especialidad | `createSpecialtyAction(organizationId)` → `POST /:organizationId/specialty`, que ya existe |
| Guardar en «Mi perfil» | `PUT /organization/:organizationId/clinics/:clinicId/me/specialties` |
| Filas, chips y `doctorProfileId` en «Usuarios» | `GET /clinic/:clinicId/users` |
| Fila propia | `getMe()` → `email` |
| Opciones del diálogo | `GET /:resourceId/specialties`, que la página ya carga para la invitación |
| Subtítulo y texto del diálogo | `GET /user/me/resource/:clinicId/membership` → `resourceName` |
| Guardar en el diálogo | `PUT /organization/:resourceId/clinics/:clinicId/doctors/:doctorProfileId/specialties` |

### Textos

**«Dónde atiendes» del editor**
- Descripción de la tarjeta, si hay alguna sede editable: «Elige las especialidades que atiendes
  en cada sede que administras.». Si no, la de hoy.
- Bloque con especialidades: el nombre de la sede, la organización, los chips y el botón
  «Editar».
- **Aviso de horarios (decisión 8)**, bajo los chips, si `!hasSchedule`: «Sin horarios en esta
  sede, todavía no apareces en el link de reserva.»
- Fila sin especialidades: «{Sede}», debajo «{Organización} · Sin especialidades», y el botón
  «Asignar especialidades».
- Si hay bloques y filas, las filas van bajo el subtítulo «Otras sedes que administras».
- En edición:
  - la etiqueta «Especialidades en {Sede}»;
  - el buscador, con placeholder «Buscar especialidad...», y «Crear "{texto}"» si
    `canCreateSpecialties`;
  - con la organización sin especialidades: «{Organización} todavía no tiene especialidades.
    Escribe la que atiendes y elige «Crear».». Sin `canCreateSpecialties`: «{Organización}
    todavía no tiene especialidades. Las crea un administrador de la organización.»;
  - los botones «Cancelar» y «Guardar especialidades» («Guardando…» mientras envía).
- Toasts: al guardar, «Guardamos tus especialidades.»; si falla, el `message` del api.

**«Dónde atiendes» del DOCTOR:** igual que hoy.

**Usuarios de la sede**
- Subtítulo: «Personas con acceso a {Sede}.».
- Columna «Especialidades»: chips; la etiqueta ámbar «Sin especialidades» en un DOCTOR sin
  ninguna; «—» para los demás roles.
- Botón de cada DOCTOR, también el propio: «Editar especialidades», con el nombre accesible «Editar
  especialidades de {Nombre Apellido}».
- Diálogo:
  - título «Especialidades de {Nombre Apellido}»;
  - descripción «En {Sede}. Son las que el paciente elige al reservar con este médico.»;
  - el selector, con la etiqueta «Especialidades»;
  - con la organización sin especialidades, el mismo texto que en «Mi perfil»;
  - con la selección vacía, el aviso ámbar «Sin especialidades, {Nombre} deja de aparecer en el
    link de reserva de {Sede}. Sus citas ya reservadas no cambian.»;
  - los botones «Cancelar» y «Guardar especialidades».
- Toast al guardar: «Guardamos las especialidades de {Nombre}.».

### Estados

| Estado | «Mi perfil» | Usuarios de la sede |
| --- | --- | --- |
| Normal | Bloques con chips, «Editar» y, sin horarios, el aviso. Filas compactas para las sedes sin especialidades. | La tabla con la columna «Especialidades». |
| Carga | La página, como hoy (`LoadingState`). La edición abre sin otra carga (t-13). | `loading.tsx` de la organización («Cargando...»). |
| Vacío | Editor sin especialidades en ninguna sede: solo filas. Organización sin especialidades: el texto de arriba. Sin sedes, o la recepción: sin «Dónde atiendes», como hoy. | La sede sin usuarios: «Esta sede aún no tiene usuarios.», como hoy. El médico sin especialidades: la etiqueta. |
| Error | Toast con el mensaje. El bloque sigue en edición, con lo elegido. | Toast con el mensaje. El diálogo sigue abierto. Si falla la carga de la página, `ErrorState` con «Reintentar». |
| Sesión vencida | `auth-expired`: toast «Tu sesión ha expirado. Vuelve a iniciar sesión.» y `/login` (`useFormAction`). | Lo mismo. |
| 403 / 404 | El DOCTOR y la recepción no ven botones. Si el api rechaza (por ejemplo, porque el ADMIN perdió el rol con la página abierta), toast con el mensaje y el bloque vuelve a lectura. | El DOCTOR y el USER no llegan desde el menú; por URL, `GET /clinic/:id/users` responde 403 y se ve `ErrorState`, como hoy. El ADMIN directo de sede ya veía `ErrorState` antes de este PR, porque `GET /:resourceId/specialties` (`member: true`) le responde 404; no ve tabla ni botones (cl-3). Limitación previa. |
| 402 | No aplica (t-11). | No aplica. |

### Interacciones

**«Mi perfil»**
- «Editar» o «Asignar especialidades» abre la edición de esa sede, cierra cualquier otra abierta
  y lleva el foco al buscador.
- Elegir una opción agrega el chip y limpia el buscador. La «x» de un chip lo quita.
- «Crear "…"» crea la especialidad y la elige.
- «Cancelar» vuelve a la lectura sin guardar. El foco vuelve al botón que abrió la edición.
- «Guardar especialidades» envía la lista completa (`specialtyIds` repetido; vacía si no hay
  chips). Si sale bien: toast, `revalidateTag`, vuelta a lectura y foco en «Editar». Si quedó sin
  especialidades, la sede pasa a la lista de filas.

**Usuarios de la sede**
- «Editar especialidades» abre el diálogo con la selección actual y el foco en el buscador.
- Escape o «Cancelar» lo cierran sin guardar. El foco vuelve al botón (Radix).
- Con la selección vacía aparece el aviso (`aria-live="polite"`). Se puede guardar igual.
- Si sale bien: toast, el diálogo se cierra y `revalidateTag(clinicUsers)` refresca la fila.

### Diferencias por rol

| Rol | «Mi perfil» → «Dónde atiendes» | Usuarios de la sede |
| --- | --- | --- |
| Dueño de la cuenta | Todas las sedes de la cuenta, editables. También ve «Tratamiento» y la vista previa. | En las organizaciones donde tiene membership: edita a todos los DOCTOR menos a sí mismo. |
| ADMIN de la organización | Las sedes de sus organizaciones, editables. También ve «Tratamiento» y la vista previa. | Edita a todos los DOCTOR menos a sí mismo. |
| DOCTOR | Sus sedes en solo lectura, como hoy. | No lo ve. |
| USER (recepción) | No ve la sección, como hoy. | No lo ve. |
| ADMIN directo de sede (solo por api) | Solo lectura, si tiene perfil (cl-3). | No le aparece en el menú. Por URL ve `ErrorState` (limitación previa: `GET /:resourceId/specialties` le responde 404). |

### Accesibilidad

- «Dónde atiendes» sigue siendo una `section aria-labelledby`.
  - Cada bloque y cada fila es un `div` con el nombre de la sede en texto.
  - Los botones nombran la sede con `aria-label`: «Editar especialidades de Sede Miraflores» y
    «Asignar especialidades en Sede San Isidro».
  - El aviso de horarios es texto normal, debajo de los chips, sin `role="alert"`: no aparece
    por una acción del usuario.
- El selector tiene un `label` visible unido al buscador con `htmlFor` e `id` de `useId()`.
  - Los chips tienen «Quitar {especialidad}», como hoy.
  - El desplegable sigue sin ser un `combobox` ARIA; se llega con Tab a las opciones, porque son
    botones.
- El diálogo usa Radix, con el título y la descripción unidos, el foco atrapado y Escape.
- El aviso de selección vacía usa `aria-live="polite"`. Los toasts son de `sonner`
  (`role="status"`).
- El avatar del menú lateral y el ítem «Mi perfil» llevan `aria-current="page"` en «Mi perfil».
- **Orden de tabulación en «Mi perfil»:**
  1. «Editar» de cada bloque.
  2. «Asignar especialidades» de cada fila.
  3. Los enlaces «Mi disponibilidad».
  4. En edición: el buscador, la «x» de cada chip, las opciones o «Crear», «Cancelar» y
     «Guardar especialidades».
- **Orden de tabulación en el diálogo:** el buscador, los chips, «Cancelar», «Guardar
  especialidades» y «Cerrar».
- **A 375 px:**
  - una columna;
  - los botones de guardar ocupan el ancho;
  - las filas compactas pasan el botón debajo del nombre si no cabe;
  - en la tabla, especialidades y acción van bajo el nombre;
  - sin desplazamiento horizontal.

## Criterios de aceptación

Los marcados **[e2e]** los cubre el e2e-tester con Playwright; los demás se verifican con una
petición manual, a ojo o en la revisión del diff. Cada prueba lleva el ID en el título
(`CA-N: …`). Salvo que se diga otra cosa, horarios, perfiles y planes se siembran con Prisma
(`getTestPrisma`, `seedFullDayAvailability`).

Actores (todos de la misma cuenta salvo que se diga):
- **ADMIN de la organización:** membership `ADMIN` viva sobre la organización; no es el dueño.
- **Dueño:** `Account.ownerId`. «Dueño sin membership»: el de una organización creada por otro
  ADMIN, sobre la que no tiene ninguna membership.
- **ADMIN de sede:** membership `ADMIN` directa solo sobre la sede, sin rol en la organización.
- **DOCTOR:** médico invitado a la sede, con perfil.
- **USER de sede** y **USER de organización** (recepción).
- **Intruso:** ADMIN de otra cuenta. **Otra organización:** una segunda organización de la misma
  cuenta, con su sede y sus especialidades.
- «Sin cambios» quiere decir: ni `doctor_profile` creado, ni especialidades distintas, ni
  membership nueva.

### PR 1: `aria-current` en el avatar

- **CA-1. [e2e]** En `…/organization/{resourceId}/me` y en `…/clinic/{clinicId}/me`, el botón del
  avatar del menú lateral tiene `aria-current="page"`, a 1280 px y a 375 px (dentro del menú
  desplegable).
- **CA-2. [e2e]** Con el menú del avatar abierto en «Mi perfil», el ítem «Mi perfil» tiene
  `aria-current="page"`.
- **CA-3. [e2e]** En el inicio de la sede, en «Sedes» y en «Usuarios», ni el avatar ni el ítem
  «Mi perfil» tienen `aria-current`.
- **CA-4. [e2e]** El resto de `profile-navigation.spec.ts` (teclado, Escape, «Cambiar de sede»,
  «Cerrar sesión», sin desplazamiento horizontal) sigue pasando sin cambios.

### PR 2: el booking sin médicos sin horarios (y las métricas)

- **CA-5. [e2e]** `GET /clinic/:clinicId/doctors` no lista a un DOCTOR con perfil, membership viva
  y especialidad de la organización, pero sin ningún horario. Tras sembrarle un horario, sí lo
  lista.
- **CA-6. [e2e]** Una especialidad que solo atiende ese médico sin horarios no la trae ningún
  médico de la respuesta, y el paso 1 del booking a 375 px no la ofrece. Una especialidad que
  comparte con un médico con horarios sigue apareciendo.
- **CA-7. [e2e]** Al borrarle todos los horarios a un médico con una cita futura, desaparece del
  booking y la cita no cambia: misma fecha y hora, mismo médico, misma especialidad y mismo
  estado.
- **CA-8. [e2e]** El ADMIN de la organización con perfil, especialidades y horarios en la sede
  (sembrados por Prisma) no aparece en `GET /clinic/:clinicId/doctors` (t-8).
- **CA-9. [e2e]** La respuesta pública conserva exactamente las mismas claves que hoy y sigue sin
  `userId`.
- **CA-10. [e2e]** Las cinco pruebas de la tabla de «Verificación» pasan sembrando horarios a los
  médicos que deben aparecer, sin relajar ninguna otra aserción.
- **CA-11. [e2e]** En una cuenta Clínica, `doctors` de la métrica de la sede y de la organización
  no cambia al sembrarle al ADMIN de la organización un perfil con especialidades y sin
  horarios, y sube en uno en las dos al sembrarle un horario.
- **CA-12. [e2e]** Un DOCTOR invitado sin horarios sigue contando en las dos métricas, como hoy,
  y uno quitado de la sede cuenta igual que hoy.
- **CA-13.** Las respuestas de las dos métricas no cambian de forma, y la condición vive en una
  sola función (`countedDoctorProfileWhere`) con el comentario de la decisión 9.

### PR 3: api de las especialidades propias

`PUT /organization/:resourceId/clinics/:clinicId/me/specialties` y `GET /user/me/profile`.

- **CA-14. [e2e]** El ADMIN de la organización sin perfil en la sede envía dos especialidades de
  la organización: 200 con `{ specialties }` ordenadas por nombre, y queda exactamente un
  `doctor_profile` con su `userId` y esa sede.
- **CA-15. [e2e]** Un segundo `PUT` reemplaza la lista completa (no suma); con ids repetidos
  guarda cada uno una vez; con `[]` responde 200 con `specialties: []` y el perfil sigue
  existiendo.
- **CA-16. [e2e]** Dos primeros `PUT` simultáneos del mismo ADMIN en la misma sede responden 200
  y dejan un solo perfil, con la lista de uno de los dos.
- **CA-17. [e2e]** El dueño sin membership edita las suyas en una sede de esa organización (200).
  El dueño también puede en una sede de otra organización de su cuenta.
- **CA-18. [e2e]** DOCTOR, USER de sede, USER de organización y ADMIN de sede reciben 403
  `{ message: "Solo un administrador puede cambiar especialidades.", code: "FORBIDDEN" }`,
  sin cambios.
- **CA-19. [e2e]** El ADMIN de la organización contra la sede de otra organización de la misma
  cuenta (con el `:resourceId` de esa organización) recibe 403, sin cambios.
- **CA-20. [e2e]** IDOR: responden 404 «Sede no encontrada», sin cambios: el intruso con los ids
  reales de la víctima; la sede de otra organización bajo el `:resourceId` propio; y una sede
  puesta como `:resourceId`.
- **CA-21. [e2e]** Una especialidad de otra organización de la misma cuenta, una de otra cuenta
  o un uuid inexistente, solos o junto a una propia, responden 404 «Especialidad no
  encontrada», sin cambios.
- **CA-22. [e2e]** Si el perfil ya tenía ligada una especialidad de otra organización (sembrada
  por Prisma), un `PUT` válido la quita.
- **CA-23. [e2e]** Responden 400, sin cambios: una clave de más (`userId`, `doctorProfileId`),
  un id que no es uuid, 51 ids y `:resourceId` o `:clinicId` que no son uuid. 50 ids válidos se
  aceptan.
- **CA-24. [e2e]** Sin sesión, 401; sin confirmar o sin onboarding, 403.
- **CA-25. [e2e]** `GET /user/me/profile` devuelve en cada sede exactamente `clinicId`,
  `clinicName`, `organizationId`, `organizationName`, `specialties`, `canEditSpecialties`,
  `isClinicDoctor` y `hasSchedule`, y en la raíz suma `organizations`, sin ids de usuario,
  cuenta ni rol.
- **CA-26. [e2e]** El ADMIN de la organización con dos sedes, una con especialidades y otra sin
  perfil, recibe las dos con `canEditSpecialties: true`, `isClinicDoctor: false` y
  `hasSchedule: false`; la segunda con `specialties: []`.
- **CA-27. [e2e]** `organizations` trae solo las organizaciones que edita, con todas sus
  especialidades por nombre: `canCreateSpecialties: true` para el ADMIN de la organización y
  `false` para el dueño sin membership. Para DOCTOR, USER y ADMIN de sede es `[]`, y nunca trae
  especialidades de otra cuenta.
- **CA-28. [e2e]** El DOCTOR ve sus sedes como hoy, con `canEditSpecialties: false` e
  `isClinicDoctor: true`. El ADMIN de sede con perfil ve esa sede en solo lectura
  (`canEditSpecialties: false`); sin perfil, `clinics: []` (CA-25 y CA-36 de «Mi perfil»,
  retitulados).
- **CA-29. [e2e]** `hasSchedule` pasa a `true` en la sede donde el perfil tiene al menos un
  horario, y solo en esa.
- **CA-30. [e2e]** Un ADMIN de la organización que además es DOCTOR directo de una sede la recibe
  una sola vez, con `canEditSpecialties: true` e `isClinicDoctor: true` (cl-1).
- **CA-31. [e2e]** Si el ADMIN pierde su rol en la organización (membership borrada), sus sedes
  dejan de aparecer y el `PUT` responde 403; su perfil sigue en la base (cl-9).
- **CA-32. [e2e]** `PATCH /user/me/profile` con `treatment: "DRA"` responde 200 para el ADMIN de
  la organización con al menos una sede y 403 para el dueño sin organización y para el USER.
- **CA-33. [e2e]** En Gratis, después de guardar sus especialidades, el ADMIN sigue pudiendo
  invitar a su DOCTOR (la plaza no se ocupa).
- **CA-34. [e2e]** `fix-specialty-account-scope.spec.ts` y las pruebas de invitación con
  especialidades siguen pasando (el `count` movido al repositorio no cambia nada).
- **CA-35.** La ruta lleva `policy({ account: true, confirmed: true, onboarded: true })` sin
  `roles`, con un comentario que dice por qué; la comprobación de editor es el primer paso del
  caso de uso, después de la sede; `policy.ts` no cambia; no hay migración nueva; los logs
  llevan ids y el nombre del error, nunca nombres ni correos.

### PR 4: api de las especialidades de los médicos

`PUT /organization/:resourceId/clinics/:clinicId/doctors/:doctorProfileId/specialties` y
`GET /clinic/:resourceId/users`.

- **CA-36. [e2e]** El ADMIN de la organización reemplaza las especialidades de un DOCTOR de la
  sede: 200 con la lista por nombre, y con horarios el médico aparece en el booking con ellas.
- **CA-37. [e2e]** El dueño, con y sin membership en la organización, también puede (200).
- **CA-38. [e2e]** Un DOCTOR que cambia las de otro DOCTOR, USER de sede, USER de organización y
  ADMIN de sede reciben 403 `FORBIDDEN`, sin cambios.
- **CA-39. [e2e]** Un ADMIN de la organización que además es DOCTOR de la sede edita su propio
  perfil por esta vía y responde 200 (cambiado el 22 de octubre de 2026, t-14).
- **CA-40. [e2e]** Un ADMIN que no es DOCTOR de la sede, con su propio perfil (creado en «Mi
  perfil»), recibe 404 «Médico no encontrado», sin cambios: por esta vía nunca edita las suyas.
- **CA-41. [e2e]** Responden 404 «Médico no encontrado», sin cambios: el perfil de un médico de
  otra sede de la misma organización; el de otra organización de la cuenta; el de un médico
  quitado de la sede; un uuid inexistente.
- **CA-42. [e2e]** El intruso con los ids reales de la víctima, y la sede de otra organización
  bajo el `:resourceId` propio, reciben 404 «Sede no encontrada», sin cambios.
- **CA-43. [e2e]** Una especialidad de otra organización o de otra cuenta responde 404
  «Especialidad no encontrada», sin cambios; claves de más, ids no uuid o 51 ids, 400; sin
  sesión, 401.
- **CA-44. [e2e]** Un DOCTOR con la invitación pendiente se puede editar (cl-4).
- **CA-45. [e2e]** Con `[]`, responde 200: el médico (con horarios) deja de aparecer en el booking
  de esa sede y su especialidad también, si nadie más la atiende.
- **CA-46. [e2e]** Esa cita futura del médico vaciado no cambia (fecha, hora, médico,
  especialidad y estado), y en una cuenta de pago el paciente todavía puede cancelarla y
  reprogramarla con el mismo médico desde su enlace (rg-3).
- **CA-47. [e2e]** En Gratis, con la plaza de médico ocupada, editar responde 200 y no crea
  ninguna membership.
- **CA-48. [e2e]** `GET /clinic/:resourceId/users` trae en cada fila `doctorProfileId` y
  `specialties`: en un DOCTOR con perfil, su id y sus especialidades por nombre, sin las de
  otra organización; en las filas que no son DOCTOR, `null` y `[]`.
- **CA-49. [e2e]** Después de guardar, la lista mantiene el mismo orden de filas.
- **CA-50. [e2e]** La política de esa lista no cambia: DOCTOR y USER de la sede, 403; el
  intruso, 404.

### PR 5: «Mi perfil»

- **CA-51. [e2e]** El ADMIN de la organización con una sede sin especialidades ve «Dónde
  atiendes» con «Elige las especialidades que atiendes en cada sede que administras.» y una fila
  «{Sede}» / «{Organización} · Sin especialidades» con el botón «Asignar especialidades», de
  nombre accesible «Asignar especialidades en {Sede}». Sin el subtítulo «Otras sedes que
  administras».
- **CA-52. [e2e]** El botón abre la edición con la etiqueta «Especialidades en {Sede}», el
  placeholder «Buscar especialidad...» y el foco en el buscador (`getByLabel` lo encuentra).
- **CA-53. [e2e]** Elegir una opción agrega el chip y limpia el buscador; «Quitar
  {especialidad}» lo quita.
- **CA-54. [e2e]** «Guardar especialidades» muestra «Guardando…», luego el toast «Guardamos tus
  especialidades.» y la sede pasa a bloque: chips, «Editar» (nombre accesible «Editar
  especialidades de {Sede}») con el foco, y debajo «Sin horarios en esta sede, todavía no
  apareces en el link de reserva.». Al recargar sigue igual.
- **CA-55. [e2e]** Con un horario sembrado en esa sede, el aviso no aparece.
- **CA-56. [e2e]** Con la organización sin especialidades se ve «{Organización} todavía no tiene
  especialidades. Escribe la que atiendes y elige «Crear».»; «Crear "{texto}"» la crea, la
  elige y se guarda.
- **CA-57. [e2e]** El dueño sin membership no ve «Crear "…"», y con la organización sin
  especialidades ve «… Las crea un administrador de la organización.».
- **CA-58. [e2e]** «Cancelar» vuelve a la lectura sin enviar nada, con lo guardado antes, y el
  foco vuelve al botón que abrió la edición. Abrir otra sede cierra la que estaba abierta.
- **CA-59. [e2e]** Quitar todos los chips y guardar responde 200, y la sede vuelve a ser una
  fila.
- **CA-60. [e2e]** Con tres sedes, una con especialidades: primero el bloque y, bajo «Otras
  sedes que administras», dos filas, en ese orden de tabulación.
- **CA-61. [e2e]** Si el api falla (`page.route`), el toast muestra su mensaje y el bloque sigue
  en edición con lo elegido. Con la sesión vencida, «Tu sesión ha expirado. Vuelve a iniciar
  sesión.» y `/login`.
- **CA-62. [e2e]** Si el ADMIN pierde el rol con la página abierta, guardar muestra el toast
  «Solo un administrador puede cambiar especialidades.» y el bloque vuelve a la lectura.
- **CA-63. [e2e]** El DOCTOR ve sus sedes en solo lectura, como hoy, con «Mi disponibilidad en
  esta sede →» y sin «Editar» ni «Asignar especialidades». La recepción no ve «Dónde
  atiendes».
- **CA-64. [e2e]** El ADMIN de la organización ve «Tratamiento» y la vista previa (CA-49 de «Mi
  perfil», ajustado); «Mi disponibilidad en esta sede →» solo aparece en la sede donde también
  es DOCTOR (cl-1), que sale una sola vez.
- **CA-65. [e2e]** Funciona igual en las tres rutas de «Mi perfil» (bajo los workspaces, en la
  sede y en la organización), y una cuenta Gratis no ve ningún aviso de plan.
- **CA-66. [e2e]** A 375 px, en lectura, en edición con seis chips y con tres sedes: sin
  desplazamiento horizontal y con los botones de guardar a todo el ancho.
- **CA-67.** «Dónde atiendes» sigue siendo una `section` con `aria-labelledby`; el aviso de
  horarios no tiene `role="alert"`; el toast tiene `role="status"`; el modal de invitar (mismo
  selector) se ve y funciona igual que antes.

### PR 6: la pantalla de «Usuarios» de la sede

- **CA-68. [e2e]** Sedes › Ver Usuarios muestra el subtítulo «Personas con acceso a {Sede}.» y,
  a 1280 px, la columna «Especialidades»: chips en el DOCTOR con especialidades, «Sin
  especialidades» en el que no tiene, «—» en USER y ADMIN.
- **CA-69. [e2e]** Cada DOCTOR ajeno, también con la invitación pendiente, tiene «Editar
  especialidades» con nombre accesible «Editar especialidades de {Nombre Apellido}». Ninguna
  fila USER ni ADMIN lo tiene.
- **CA-70. [e2e]** El diálogo se titula «Especialidades de {Nombre Apellido}», describe «En
  {Sede}. Son las que el paciente elige al reservar con este médico.», trae la selección actual
  y pone el foco en el buscador.
- **CA-71. [e2e]** Escape y «Cancelar» lo cierran sin enviar nada y el foco vuelve al botón.
- **CA-72. [e2e]** Con la selección vacía aparece «Sin especialidades, {Nombre} deja de aparecer
  en el link de reserva de {Sede}. Sus citas ya reservadas no cambian.» en una región
  `aria-live="polite"`, y se puede guardar igual.
- **CA-73. [e2e]** Al guardar: toast «Guardamos las especialidades de {Nombre}.», el diálogo se
  cierra y la fila muestra la lista nueva sin recargar.
- **CA-74. [e2e]** Si el api falla, toast con su mensaje y el diálogo sigue abierto con lo
  elegido.
- **CA-75. [e2e]** Con la organización sin especialidades, el diálogo muestra el mismo texto que
  «Mi perfil» y «Crear "…"» funciona.
- **CA-76. [e2e]** La fila propia (ADMIN que también es DOCTOR de la sede) dice «Tú», muestra sus
  chips y «Editar especialidades», y guardar desde ahí cambia sus especialidades (22 de octubre
  de 2026; antes llevaba el enlace «Edítalas en Mi perfil»).
- **CA-77. [e2e]** A 375 px las especialidades y la acción van bajo el nombre, el diálogo cabe y
  no hay desplazamiento horizontal.
- **CA-78. [e2e]** Un DOCTOR o un USER que abre la URL ve el estado de error de hoy, sin tabla ni
  botones.
- **CA-79. [e2e]** La tabla de «Usuarios» de la organización no cambia (sin columna
  «Especialidades»), y «Esta sede aún no tiene usuarios.» sigue saliendo en una sede vacía.
- **CA-80.** La suite completa pasa; `platform/e2e/README.md` lista las pruebas nuevas con sus
  CA; `docs/PRODUCT.md` («Estado») y `docs/capacidades.md` dicen quién edita las
  especialidades y desde dónde, que el booking oculta a los médicos sin horarios y cómo cuenta
  «Médicos».
