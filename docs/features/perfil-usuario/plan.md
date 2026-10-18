# Plan: «Mi perfil»

**Rama:** `feat/user-profile` (desde `origin/main`)
**Fecha:** 18 de octubre de 2026
**Especificación:** `docs/features/perfil-usuario/mockup.html` (aprobado; manda en textos y
pantallas) y las decisiones del humano del 18 de octubre de 2026, resumidas abajo. No hay
PRD.
**Antecedentes que siguen vigentes:**
- `docs/features/fix-auth-user-fields-input/plan.md`, decisión 1: `update-user` sigue
  desactivado y el perfil se edita con una ruta propia con Zod.
- `docs/features/autogestion-paciente/prd.html`, r-14 y d-18: «Dr.» o «Dra.» solo si el
  médico registró su tratamiento.

## Objetivo

Una sola página «Mi perfil» por persona, a nivel de cuenta, a la que se llega con el
avatar. Ahí cada persona:
- corrige sus datos personales (nombre, apellido, celular y, si atiende, su tratamiento
  Dr./Dra.);
- ve en qué sedes atiende y con qué especialidades;
- cambia su contraseña.

El tratamiento se usa en todos los lugares donde aparece el nombre completo del médico.

## Decisiones del humano (18 de octubre de 2026)

1. Un solo perfil por persona, a nivel de cuenta, no por sede.
2. **Se llega con un avatar.** Muestra las iniciales y el nombre.
   - En la selección de workspace, va en la barra superior en lugar de «Cerrar sesión»,
     con un menú: nombre, correo, «Mi perfil» y «Cerrar sesión».
   - Dentro de una sede o de la organización, va al pie del menú lateral (y en el menú
     desplegable del celular), con «Mi perfil», «Cambiar de sede» y «Cerrar sesión».
3. **Dónde se ve el perfil.** Desde la selección de workspace se abre con la barra superior
   y «Volver a tus workspaces». Desde una sede o la organización se abre dentro del panel,
   con el menú lateral visible y el avatar activo. El contenido es el mismo componente.
4. «Mi Perfil» sale de «Configuración», donde queda solo «Mi Disponibilidad». «Mi
   Disponibilidad» para el ADMIN no entra en este ticket.
5. **Datos personales.**
   - Nombre, apellido y celular se editan con «Editar», «Guardar cambios» y «Cancelar».
   - El correo se ve, pero no se cambia.
   - Los datos son de la persona (`User`): cambiarlos los cambia en todas las sedes.
   - Se validan igual que en el registro, **sin largo máximo**.
6. **Tratamiento Dr./Dra.**
   - Campo nuevo y opcional: «Dr.», «Dra.» o «Sin tratamiento».
   - Se edita en «Datos personales», solo si la persona tiene perfil de médico en alguna
     sede.
   - Se usa en todos los lugares donde aparece el nombre del médico.
   - Sin tratamiento se muestra solo el nombre completo, nunca uno deducido.
   - **Se acepta** que, al desplegar, los médicos de la beta pierdan el «Dr.» fijo del
     booking hasta que elijan su tratamiento, sin aviso especial.
7. **«Dónde atiendes»**, en solo lectura.
   - Lista las sedes donde la persona tiene perfil de médico, con sus especialidades y el
     enlace «Mi disponibilidad en esta sede».
   - Quien no tiene perfil de médico no ve la sección.
   - La edición de especialidades por el ADMIN no entra: llega con el ticket «el
     administrador también atiende».
8. **Contraseña.**
   - Se pide la actual y la nueva, con un mínimo de 8 caracteres y «Mostrar» u «Ocultar».
   - No hay campo para repetir la nueva.
   - Al cambiarla se cierran las demás sesiones.
9. «Mi perfil» va en todos los planes.

## Reglas del nombre del médico (propias de este plan)

- **N-1.** Con tratamiento: «Dra. Lucía Paredes Quispe». Sin tratamiento: «Lucía Paredes
  Quispe». Nunca se deduce del nombre (r-14 de la autogestión).
- **N-2.** El tratamiento va en todo nombre completo del médico que vea un paciente o un
  compañero del consultorio: booking, página de autogestión, correos, agenda de la sede e
  historial de la ficha.
- **N-3.** Los saludos al médico usan su nombre de pila, sin tratamiento («Hola Lucía,»).
  Es la persona a la que se le habla, no el profesional ante el paciente.
- **N-4.** No llevan tratamiento:
  - el saludo del inicio de la sede (`welcome.tsx`);
  - el avatar, su menú y la cabecera de «Mi perfil» (el mockup usa el nombre completo);
  - las listas de usuarios del equipo;
  - «creado por» en la lista de sedes;
  - el formulario y el correo de invitación.

## Decisiones técnicas

| # | Decisión | Por qué |
| --- | --- | --- |
| t-1 | **El tratamiento vive en `User`** (`treatment DoctorTreatment?`), no en `DoctorProfile`. | Es uno por persona y el mismo en todas sus sedes (decisiones 1 y 6). `DoctorProfile` es uno por sede (`@@unique([userId, clinicId])`): guardarlo ahí obligaría a sincronizar varias filas y permitiría «Dra.» en una sede y nada en otra. Se edita en «Datos personales», que ya es `User`. La columna es nullable y no entra en `additionalFields` de Better Auth, así que nadie la puede fijar al registrarse y no hay que tocar la configuración de Better Auth. |
| t-2 | **Un solo formateador del nombre del médico, en el api** (`api/src/domain/services/doctor-name.ts`). El api devuelve el nombre ya armado (`displayName` o `doctorName`) en cada respuesta que lo muestra; platform no arma nombres de médico. | Hoy cada sitio concatena a mano y el booking le pone «Dr.» fijo a todos. Con un único punto, N-1 se cumple igual en correos, página de autogestión, booking y panel. |
| t-3 | **Contraseña con `POST /api/auth/change-password` de Better Auth, llamado desde el navegador** con `authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true })`, por el rewrite `/api/auth/*` de `next.config.ts`. Es como funcionan hoy `signIn`, `signUp` y `signOut`. | Better Auth ya hace lo necesario: pide la actual, valida de 8 a 128 caracteres, borra todas las sesiones y crea una nueva con su `Set-Cookie`. Por el rewrite, esa cookie llega al navegador sin manipularla, y el límite de intentos ve la IP real del cliente (el proxy de Next agrega `x-forwarded-for`). Hacerlo desde una server action obligaría a copiar el `Set-Cookie` a mano, y todos compartirían el cupo de intentos de la IP del servidor de Next. |
| t-4 | **Datos personales con una ruta propia, `PATCH /user/me/profile`,** con `z.strictObject` (una clave de más responde 400). Siempre actúa sobre el usuario de la sesión. | Decisión 1 de `fix-auth-user-fields-input`. Sin ids en la URL ni en el cuerpo, nadie puede editar a otra persona. |
| t-5 | **«Dónde atiendes» son las sedes de la cuenta donde la persona tiene `DoctorProfile` y una membership viva sobre esa sede,** con las especialidades acotadas a la organización de la sede. | Es el mismo criterio con el que el booking decide quién es médico de una sede (`get-clinic-doctors.query.ts`), menos exigir especialidad. Así el perfil no muestra sedes de las que a la persona ya la quitaron. |
| t-6 | **Rutas de la página:** `/account/[accountId]/me` (desde la selección, con la barra superior), `/account/[accountId]/clinic/[clinicId]/me` y `/account/[accountId]/organization/[resourceId]/me` (dentro del panel). Las tres renderizan `MyProfile`. | Decisión 3. `profile/` ya es el segmento de «Configuración» y contiene `profile/availability`, que tiene e2e por URL; un segmento nuevo `me` no lo rompe. |
| t-7 | **La selección de workspace y «Mi perfil» comparten layout** en el grupo de rutas `account/[accountId]/(workspaces)/`, que contiene `select/` y `me/`. Las URL no cambian. | Evita duplicar el guard de `select/layout.tsx` (sesión y onboarding) y la `TopNav`. |
| t-8 | **Sin `requireLiveMembership` en las rutas del perfil.** | El dueño recién registrado no tiene memberships hasta que crea su organización (`complete-account-setup` no crea ninguna; ver el comentario de `select/page.tsx`). Con ese hook no podría abrir su perfil. Los datos de la cuenta que muestra el perfil ya exigen membership viva por sede (t-5); lo demás es solo suyo. |
| t-9 | **`PhoneInput` se arregla sin cambiar su comportamiento en el registro ni en el booking.** El campo oculto pasa a ser controlado: hoy un `defaultValue` no llega al formulario si no se toca el número. Un número que empieza con «+» se guarda tal cual. Se exporta `splitPhone(phone, fallbackCode)` para precargar código y número. | El perfil es el primer formulario que precarga un teléfono, y los teléfonos de las invitaciones son texto libre, sin código. |

## Requiere confirmación del humano

**Nada.** El plan no toca `api/src/plugins/policy.ts`, `api/src/plugins/auth.ts`,
`api/src/plugins/entitlements.ts` ni
`api/src/infrastructure/vendors/auth/better-auth/auth.ts`:
- Las rutas nuevas caben en la política actual (`account`, `confirmed` y `onboarded`, sin
  `:resourceId`).
- La feature va en todos los planes, así que no hay `requireFeature`.
- `/change-password` está habilitado por defecto en Better Auth 1.6.22
  (`dist/api/routes/update-user.mjs:75`), y `revokeOtherSessions` va en el cuerpo de cada
  petición.
- El límite de intentos ya existe sin configurarlo (`dist/api/rate-limiter/index.mjs:370`):
  en producción (`NODE_ENV=production`), 3 peticiones cada 10 segundos por IP para
  `/change-password`, la misma regla que para `/sign-in`. Se guarda en memoria y es por
  instancia del api.
- El tratamiento no se agrega a `additionalFields` (t-1).

## Cambios por capa

### Prisma (requiere migración)

`api/prisma/schema.prisma`:

```prisma
enum DoctorTreatment {
  DR
  DRA
}

model User {
  // …
  treatment DoctorTreatment? // Dr./Dra. Sin valor se muestra solo el nombre completo (N-1).
}
```

Se crea una migración nueva con `pnpm prisma:migrate` (usa `--create-only`), por ejemplo
`api/prisma/migrations/<timestamp>_user_treatment/migration.sql`. El SQL esperado:

```sql
CREATE TYPE "DoctorTreatment" AS ENUM ('DR', 'DRA');
ALTER TABLE "user" ADD COLUMN "treatment" "DoctorTreatment";
```

- **Efecto en los datos existentes:** todas las filas quedan con `treatment = NULL`, sin
  relleno, porque deducir el tratamiento lo prohíbe N-1. En Postgres, una columna nullable
  sin default no reescribe la tabla.
- **Al desplegar,** los médicos dejan de verse como «Dr. {nombre}» en el booking y se ven
  con su nombre completo hasta que elijan su tratamiento. El humano lo aceptó (decisión 6).
- Sin índice: ninguna consulta filtra por `treatment`.
- Revisar que el SQL generado no proponga borrar `appointment_doctor_slot_active_key`
  (`api/AGENTS.md`).
- Después: `pnpm prisma:generate`, y en local se aplica con `pnpm prisma:deploy`.
- Ninguna migración existente se edita.

### api

#### Dominio

| Archivo | Cambio |
| --- | --- |
| `api/src/domain/enums/doctor-treatment.ts` (nuevo) | `export const DoctorTreatment = { DR: "DR", DRA: "DRA" } as const;` y su tipo, con el patrón de `membership-role.ts`. |
| `api/src/domain/services/doctor-name.ts` (nuevo) | `TREATMENT_LABELS = { DR: "Dr.", DRA: "Dra." }` y `formatDoctorName({ treatment, name, lastName }): string`. Sin Prisma. El comentario explica el porqué (N-1: un tratamiento equivocado se ve ante el paciente). |
| `api/src/domain/entities/user/entity.ts` | Agrega `treatment: DoctorTreatment \| null`. |
| `api/src/infrastructure/mappers/user/mapper.ts` | Mapea `treatment`. |
| `api/src/domain/repositories/user.repository.ts` | Agrega `updateProfile(userId, accountId, data: UpdateProfileData): Promise<boolean>`, con `UpdateProfileData = { name; lastName; phone; treatment?: DoctorTreatment \| null }`. |
| `api/src/infrastructure/postgres/repositories/user.repository.ts` | Usa `user.updateMany({ where: { id: userId, accountId }, data })` y devuelve `count === 1`. `treatment` solo entra en `data` si no es `undefined`. |

#### Lectura del perfil

- `api/src/application/queries/user/get-my-profile.query.ts` (nuevo): tipos `MyProfile` y
  `MyProfileClinic`, e interfaz `IGetMyProfileQuery` con
  `execute(userId, accountId): Promise<MyProfile | null>` y
  `hasDoctorProfile(userId, accountId): Promise<boolean>`.
- `api/src/infrastructure/postgres/queries/user/get-my-profile.query.ts` (nuevo):
  1. Lee el usuario con
     `user.findFirst({ where: { id: userId, accountId }, select: { name, lastName, email, phone, treatment } })`.
  2. Busca sus perfiles de médico con `doctorProfile.findMany`, filtrando por
     `{ userId, clinic: { resource: { accountId, resourceMemberships: { some: { userId, deletedAt: null } } } } }`.
     Es la membership directa y viva sobre la sede, el mismo `EXISTS` de
     `get-clinic-doctors.query.ts`. De cada perfil selecciona `clinicId`, el nombre de la
     sede, `resource.parentResourceId`, el nombre de la organización padre y
     `specialties { id, name, organizationId }`.
  3. Descarta las especialidades con `organizationId !== parentResourceId`, igual que el
     booking. Ordena las especialidades por nombre y las sedes por organización y nombre
     (`localeCompare` con `"es"`).
  4. `doctorDisplayName = clinics.length ? formatDoctorName(user) : null`.
  5. `hasDoctorProfile` usa el mismo `where` con `count` y no trae los datos.

#### Escritura del perfil

`api/src/application/use-cases/user/update-my-profile.usecase.ts` (nuevo). Exporta
`updateMyProfileSchema` y `UpdateMyProfileUseCase`, que recibe `IUserRepository` e
`IGetMyProfileQuery`:

```ts
export const updateMyProfileSchema = z.strictObject({
  name: z.string().trim().min(1, { error: "Ingresa tu nombre" }),
  lastName: z.string().trim().min(1, { error: "Ingresa tu apellido" }),
  phone: z.string().trim().min(1, { error: "Ingresa tu celular" }),
  // Ausente = no cambia; null = sin tratamiento.
  treatment: z.enum(DoctorTreatment).nullable().optional(),
});
```

`execute({ userId, accountId, ...body })`:
1. Si `treatment` tiene valor (ni `null` ni `undefined`) y `hasDoctorProfile` es `false`,
   lanza `Forbidden("Solo quien atiende como médico puede tener tratamiento.")`. Quitarlo
   (`null`) se permite siempre, para que pueda limpiarlo quien dejó de atender.
2. Llama a `users.updateProfile(userId, accountId, …)`. Si devuelve `false`, lanza
   `NotFound("User not found")`.
3. Devuelve `getMyProfile.execute(userId, accountId)`.

La validación es la del registro: los tres campos son obligatorios y no pueden quedar
vacíos después de quitar espacios. Se valida en el servidor y no hay largo máximo
(decisión 5).

#### Rutas (`api/src/routes/user/index.ts`)

| Ruta | Policy | Entrada | Salida | Errores |
| --- | --- | --- | --- | --- |
| `GET /user/me/profile` | `policy({ account: true, confirmed: true, onboarded: true })` | Ninguna: usuario y cuenta salen de `request.user`. | 200 `MyProfile` | 401 sin sesión. 403 sin cuenta, sin confirmar o sin onboarding (policy). 404 `{ message: "User not found" }`. 500 `{ message: "No se pudo obtener tu perfil" }`. |
| `PATCH /user/me/profile` | `policy({ account: true, confirmed: true, onboarded: true })` | `body: updateMyProfileSchema` | 200 `MyProfile` actualizado | 400 de validación (clave de más, campo vacío o tratamiento inválido). 401 y 403 de la policy. 403 `{ message, code: "FORBIDDEN" }` si pone tratamiento sin perfil de médico. 404 como arriba. 500 `{ message: "No se pudieron guardar tus datos" }`. |

`MyProfile`:

```jsonc
{
  "name": "Andrés",
  "lastName": "Rivas Soto",
  "email": "andres.rivas@correo.pe",
  "phone": "+51954330118",
  "treatment": "DR",                            // "DR" | "DRA" | null
  "doctorDisplayName": "Dr. Andrés Rivas Soto", // null si no atiende en ninguna sede
  "clinics": [
    {
      "clinicId": "…",
      "clinicName": "Sede Miraflores",
      "organizationName": "Consultorio Paredes",
      "specialties": [{ "id": "…", "name": "Cardiología" }]
    }
  ]
}
```

- Los errores de aplicación se mapean como en `routes/patient/index.ts`: `ApplicationError`
  → `statusCode` con `{ message, code }`.
- Los logs llevan `userId` y el nombre del error, nunca nombre, teléfono ni correo.
- `GET /user/me` no cambia.

#### Nombre del médico en el api (ver el inventario)

| Archivo | Cambio |
| --- | --- |
| `api/src/application/queries/clinic/get-clinic-doctors.query.ts` y `api/src/infrastructure/postgres/queries/clinic/get-clinic-doctors.query.ts` | Agrega `u.treatment` al `SELECT` y al `GROUP BY`. El resultado suma `displayName` y no expone `treatment`: es una respuesta pública y lleva lo mínimo. |
| `api/src/application/queries/clinic/get-clinic-appointments.query.ts` y `api/src/infrastructure/postgres/queries/clinic/get-clinic-appointments.query.ts` | Selecciona `treatment`. `doctor` pasa a `{ name, lastName, displayName }`. |
| `api/src/infrastructure/postgres/queries/appointment/get-appointment-portal.query.ts` | Selecciona `treatment`. `doctorName = formatDoctorName(user)`. |
| `api/src/application/queries/appointment/get-appointment-notice.query.ts` y `api/src/infrastructure/postgres/queries/appointment/get-appointment-notice.query.ts` | `doctorUserSelect` agrega `treatment`. `DoctorContact.fullName` se renombra a `displayName` y se arma con `formatDoctorName`. `firstName` no cambia (N-3). |
| `api/src/application/use-cases/appointment/reschedule-appointment.usecase.ts` | `notice.doctor.fullName` y `previousDoctor?.fullName` pasan a `.displayName`. Se usan en `doctorName` del correo al paciente, y en `newDoctorFullName` y `previousDoctorName` del correo al médico. El saludo (`recipient.firstName`) no cambia. |
| `api/src/application/use-cases/appointment/cancel-appointment.usecase.ts` | Sin cambio funcional: solo usa `firstName` en el saludo. |
| `api/src/application/use-cases/appointment/create-appointment.usecase.ts` | El `select` del perfil (línea 146) agrega `treatment`, y `doctorName: formatDoctorName(profile.user)` (línea 237). |
| `api/src/application/queries/patient/get-patient-detail.query.ts` | Selecciona `treatment`, y `doctorName: formatDoctorName(…)` (línea 76). |

Las plantillas `.mjml` y `template-renderer.ts` no cambian: las variables se llaman igual.

### platform

#### Clientes y acciones

| Archivo | Cambio |
| --- | --- |
| `platform/src/lib/api/user/types.ts` (nuevo) | `DoctorTreatment = "DR" \| "DRA"`, `MyProfileClinic` y `MyProfile`, según el contrato de arriba. |
| `platform/src/lib/api/user/index.ts` | `tags = { myProfile: () => "user/me/profile" }` y `getMyProfile()`, que llama a `doFetchJson("/user/me/profile", { next: { tags: [tags.myProfile()] } })`. **Sin `cache: "force-cache"`:** es un dato de cada usuario y no puede entrar en la caché de datos compartida. |
| `platform/src/lib/actions/user/update-my-profile.action.ts` (nuevo) | Sigue el patrón de `platform/AGENTS.md`. Con `getSession()`: si no hay sesión, devuelve `auth-expired`. Valida con Zod y los mismos mensajes del api. Envía `treatment` solo si `data.has("treatment")` (`""` se convierte en `null`). Llama a `doFetchJson("/user/me/profile", { method: "PATCH" })` y a `revalidateTag(tags.myProfile())`. Devuelve `{ status: "success", message: "Guardamos tus datos." }`. Los errores pasan por `toActionState`. Con errores por campo, el mensaje general es «Revisa los datos marcados.». |
| `platform/src/lib/api/doctors/types.ts` | `ClinicDoctor` agrega `displayName: string` y deja de tener `name` y `lastName` (PR 2): así nadie vuelve a armar el nombre a mano (CA-23). El api los sigue devolviendo. |
| `platform/src/lib/api/clinic/types.ts` | `ClinicAppointment.doctor` queda solo con `displayName: string` (PR 2), por la misma razón. |
| `platform/src/lib/auth/sign-out.ts` (nuevo, `"use client"`) | `signOutAndClearResource(router)`: llama a `authClient.signOut()`, borra las cookies `resource_id` y `resource_type` y va a `/login`. Reemplaza las dos copias de `top-nav.tsx` y `sidebar.tsx`. |

#### Nombre del médico en platform

| Archivo | Cambio |
| --- | --- |
| `platform/src/app/clinic/[clinicId]/create-appointment/steps/doctor-step.tsx:47` | `Dr. {doctor.name} {doctor.lastName}` → `{doctor.displayName}`. |
| `platform/src/app/clinic/[clinicId]/create-appointment/booking-wizard.tsx:103, 140` | `` `Dr. ${doctor.name} ${doctor.lastName}` `` → `doctor.displayName`. |
| `platform/src/components/app/dashboard/clinic/today-appointments.tsx:60` | `{appointment.doctor.name} {appointment.doctor.lastName}` → `{appointment.doctor.displayName}`. |

La página de autogestión y el historial de la ficha no cambian en platform: ya pintan el
`doctorName` que arma el api.

#### Navegación y avatar

| Archivo | Cambio |
| --- | --- |
| `platform/src/components/common/user-avatar.tsx` (nuevo) | `UserAvatar({ name, lastName, size?: "sm" \| "lg" })`: círculo `bg-teal-50 text-brand-teal-dark font-bold` con las iniciales (primera letra del nombre y del apellido, en mayúscula), `aria-hidden`. Mide 32 px en el botón del menú y 56 px en la cabecera del perfil. Es nuevo porque las iniciales de `patient-header.tsx` son locales de la ficha y aquí hacen falta en tres lugares. |
| `platform/src/components/common/user-menu.tsx` (nuevo, cliente) | El botón (avatar, nombre y chevron) y su menú. Props: `user: { name; lastName; email }`, `profileHref`, `placement: "top" \| "sidebar"`, `subtitle?` (nombre de la sede u organización, solo en `sidebar`), `active?`, `onChangeResource?` (si viene, aparece «Cambiar de sede») y `onNavigate?` (cierra el menú desplegable del celular). El menú tiene una cabecera con el nombre completo y el correo, más los ítems «Mi perfil» (`UserRound`), «Cambiar de sede» (`ArrowLeftRight`, opcional) y «Cerrar sesión» (`LogOut`, en rojo). Hace falta porque no hay componente de menú ni `@radix-ui/react-dropdown-menu`, y no se instalan dependencias. Sigue el patrón de clic fuera de `notification-bell.tsx`. |
| `platform/src/components/common/top-nav.tsx` | Recibe `user` por props (el layout ya llama a `getMe`) y cambia «Cerrar sesión» por `<UserMenu placement="top" profileHref={`/account/${accountId}/me`} />`. En el celular muestra solo el nombre de pila; desde `sm`, el nombre completo. |
| `platform/src/components/common/sidebar.tsx` | Quita `selectResourcesButton` y `signOutButton`. Al pie del `aside` de escritorio y del menú desplegable del celular pone `<UserMenu placement="sidebar" subtitle={membership.resourceName} active={pathname === `${basePath}/me`} onChangeResource={handleChangeResource} />`, con el menú abriéndose hacia arriba. Los enlaces se marcan activos con `usePathname` (`pathname.startsWith(`${basePath}/${href}`)`), como en el mockup: `bg-brand-surface font-semibold text-brand-teal-dark`. |
| `platform/src/components/common/utils.tsx` | «Configuración» pasa de `href: "profile"` con `roles: [DOCTOR, USER]` a `href: "profile/availability"` con `roles: [DOCTOR]`. |
| `platform/src/components/clinic/settings/settings-sidebar.tsx` | Quita «Mi Perfil» y deja solo «Mi Disponibilidad». |
| `platform/src/app/account/[accountId]/clinic/[clinicId]/profile/page.tsx` | Pasa a `redirect(`/account/${accountId}/clinic/${clinicId}/me`)`, para los enlaces viejos. |
| `platform/src/components/ui/phone-input.tsx` | Aplica t-9. El campo oculto se vuelve controlado (`value={compose(countryCode, number)}`). `compose` devuelve el número sin espacios si empieza con «+», `código + número` si no, y `""` si está vacío. Suma las props `disabled`, `invalid` (borde rojo y `aria-invalid`) y `aria-describedby`. Exporta `splitPhone(phone, fallbackCode)`, que elige el código conocido más largo que sea prefijo del valor; si ninguno coincide, devuelve `fallbackCode` y el valor tal cual. Los valores por defecto no cambian, así que el registro y el booking siguen igual. |

#### Páginas

| Archivo | Cambio |
| --- | --- |
| `platform/src/app/account/[accountId]/select/layout.tsx` → `platform/src/app/account/[accountId]/(workspaces)/layout.tsx` | Se mueve (t-7) con los mismos guards y pasa `me` a `<TopNav user={me} />`. Por los PRs apilados: en el PR 4 el layout se mueve con `<TopNav />` como hoy; la prop `user` se agrega en el PR 5, junto con el cambio de `TopNav`. |
| `platform/src/app/account/[accountId]/select/page.tsx` → `platform/src/app/account/[accountId]/(workspaces)/select/page.tsx` | Se mueve sin cambios. |
| `platform/src/app/account/[accountId]/(workspaces)/me/page.tsx` (nuevo) | Obtiene `usersApi.getMyProfile()` y renderiza `<MyProfile profile accountId backHref={`/account/${accountId}/select`} />`, centrado en `max-w-3xl` con `p-4 sm:p-6`. |
| `platform/src/app/account/[accountId]/(workspaces)/me/loading.tsx` y `error.tsx` (nuevos) | Reexportan `LoadingState` y `ErrorState` (con `reset`), para que la carga y el error se vean debajo de la `TopNav` y no la reemplacen. |
| `platform/src/app/account/[accountId]/clinic/[clinicId]/me/page.tsx` (nuevo) | Igual, sin `backHref`, dentro del layout de la sede. La carga y el error los cubren `clinic/[clinicId]/loading.tsx` y `error.tsx`. |
| `platform/src/app/account/[accountId]/organization/[resourceId]/me/page.tsx` (nuevo) | Igual, dentro del layout de la organización. |

#### Componentes del perfil (`platform/src/components/profile/`, nuevos)

| Componente | Props | Qué hace |
| --- | --- | --- |
| `my-profile.tsx` | `profile`, `accountId`, `backHref?` | Muestra «Volver a tus workspaces» (solo si hay `backHref`), la cabecera (avatar lg, nombre completo en `h1` y correo) y las tres tarjetas, en orden. |
| `personal-data-card.tsx` (cliente) | `profile` | La lectura y la edición de los datos personales, con `useFormAction(updateMyProfileAction)`. |
| `where-you-work-card.tsx` | `clinics`, `accountId` | No se renderiza si `clinics` está vacío. Muestra un bloque por sede. |
| `clinic-availability-link.tsx` (cliente) | `accountId`, `clinicId` | Un `<a href>` a `/account/{accountId}/clinic/{clinicId}/profile/availability`. Al hacer clic: `preventDefault`, `await setResource(clinicId, "CLINIC")` y `router.push`, para que la cookie de sede activa coincida con la sede. Es lo mismo que hace `EnterLink`, pero accesible: `EnterLink` es un `div` con `onClick`. |
| `password-card.tsx` (cliente) | — | El formulario plegado, que llama a `authClient.changePassword` (t-3). |
| `password-input.tsx` (cliente) | `id`, `name`, `label`, `autoComplete`, `placeholder?`, `error?` | Un input de contraseña con «Mostrar» u «Ocultar» dentro del campo. Es nuevo porque no existe ninguno y se usa dos veces. |

Las tarjetas son `section` con `rounded-xl border border-gray-200 bg-white p-4 sm:p-5`, como
`patient-header.tsx`. No se usa `ui/card.tsx`: su fondo (`bg-brand-surface`) y su borde
(`rounded-2xl`) no son los del mockup. Los campos usan `Input` y `Select` de
`components/common/form`, y los botones, `Button` de `components/ui/button.tsx`.

## Inventario del nombre del médico

Revisado en el código el 18 de octubre de 2026.

| # | Superficie | Dónde se arma hoy | Hoy muestra | Pasa a |
| --- | --- | --- | --- | --- |
| n-1 | Booking, paso del médico | `doctor-step.tsx:47`, con datos de `GET /clinic/:clinicId/doctors` | «Dr. {nombre} {apellido}» fijo | `doctor.displayName` |
| n-2 | Booking, resumen antes de confirmar | `booking-wizard.tsx:103` → `patient-step.tsx:87` | «con Dr. …» fijo | `doctor.displayName` |
| n-3 | Booking, pantalla de éxito | `booking-wizard.tsx:140` → `success-step.tsx:37` | «con Dr. …» fijo | `doctor.displayName` |
| n-4 | Correo de reserva al paciente | `create-appointment.usecase.ts:237` → `confirm-appointment.mjml` | Nombre completo | `formatDoctorName` |
| n-5 | Página de autogestión: el resumen, «con {médico}», «Solo ves los horarios libres de {médico}.», «Ni {médico} ni otros médicos…» y la confirmación | `get-appointment-portal.query.ts:54` → `appointment-summary.tsx:31` y `appointment-portal-view.tsx:147, 449, 487, 522` | Nombre completo | `formatDoctorName` (solo cambia el api) |
| n-6 | Correo al paciente al reprogramar | `reschedule-appointment.usecase.ts:246` → `patient-rescheduled-appointment.mjml` | Nombre completo | `displayName` |
| n-7 | Correo al médico al reprogramar: «Médico anterior», «Médico nuevo» y «Profesional» | `reschedule-appointment.usecase.ts` → `doctor-rescheduled-appointment.mjml` | Nombre completo | `displayName` |
| n-8 | Saludo de los correos al médico (al reprogramar y al cancelar) | `reschedule-appointment.usecase.ts:266`, `cancel-appointment.usecase.ts:128` | «Hola {nombre de pila},» | **Sin cambio** (N-3) |
| n-9 | Correo al paciente al cancelar | `patient-cancelled-appointment.mjml` | No nombra al médico | Sin cambio |
| n-10 | Agenda de hoy en el inicio de la sede | `today-appointments.tsx:60`, con datos de `get-clinic-appointments.query.ts` | «· {nombre} {apellido}» | `doctor.displayName` |
| n-11 | Ficha del paciente, historial de citas | `get-patient-detail.query.ts:76` → `appointment-history.tsx:59` | Nombre completo | `formatDoctorName` (solo cambia el api) |
| n-12 | «Mi perfil», vista previa «Así te ven tus pacientes al reservar» | Es nueva | — | `doctorDisplayName` |

Las superficies que no llevan tratamiento están en N-4. Cualquier pantalla futura que
muestre el nombre del médico usa `formatDoctorName`.

**Fuera de alcance:** los textos genéricos del booking que dicen «doctor» («Elige un
doctor», «Doctores disponibles…» y «No hay doctores…» en `doctor-step.tsx`). No le dan
un tratamiento a nadie.

### e2e que esperan «Dr.» y cambian

| Prueba | Hoy | Pasa a |
| --- | --- | --- |
| `platform/e2e/ui/clinic/public-booking.spec.ts:54` | Botón `Dr. ${DOCTOR_NAME} ${DOCTOR_LAST_NAME}` | `${DOCTOR_NAME} ${DOCTOR_LAST_NAME}` (el médico sembrado no tiene tratamiento) |
| `platform/e2e/ui/booking/public-booking-specialty-scope.spec.ts:95` | `"Dr. Daniela Flores"` | `"Daniela Flores"` |

Estas pruebas siguen pasando sin cambios porque siembran médicos sin tratamiento:
- `platform/e2e/api/appointments/portal-read.spec.ts:81`
- `platform/e2e/api/appointments/portal-cancel-emails.spec.ts:153`
- `platform/e2e/api/appointments/portal-reschedule-emails.spec.ts:240`
- `platform/e2e/ui/appointment/appointment-portal.spec.ts:86`

Conviene retitularlas «sin tratamiento registrado». Su par con tratamiento va en las
pruebas nuevas.

Otras pruebas no se ven afectadas:
- `platform/e2e/ui/clinic/availability-editor.spec.ts` entra por `/profile/availability`,
  que no cambia.
- Ninguna prueba hace clic en «Cerrar sesión», «Selección de recursos» ni
  «Configuración».

`platform/e2e/README.md` se actualiza en sus filas de autogestión y booking, y en la
línea «tratamiento "Dr./Dra."» de «Aún sin pruebas».

## Aislamiento entre cuentas

| Dato | Lectura y escritura | Cómo queda acotado |
| --- | --- | --- |
| Nombre, apellido, celular, correo y tratamiento | `GET` y `PATCH /user/me/profile` | `where: { id: request.user.userId, accountId: request.user.accountId }`. No hay ids en la URL ni en el cuerpo: `z.strictObject` rechaza `id`, `userId`, `email`, `role`, `accountId`, `onboardingCompleted`, `confirmed` y cualquier otra clave. |
| Sedes y especialidades | `GET /user/me/profile` y la comprobación del tratamiento en `PATCH` | El perfil de médico es del usuario de la sesión, la sede es de su cuenta (`clinic.resource.accountId`) y hay una membership viva suya sobre la sede (`deletedAt: null`). Las especialidades se filtran a la organización padre de la sede. |
| Contraseña | `POST /api/auth/change-password` (Better Auth) | Actúa sobre el usuario de la cookie de sesión (`sensitiveSessionMiddleware`) y exige la contraseña actual. No recibe ids. |
| Nombre del médico en booking, autogestión, correos, panel y ficha | Las consultas que ya existen | Solo leen una columna más del mismo `User`; ningún filtro cambia. La lista pública de médicos sigue sin correo, teléfono ni rol, y no expone `treatment`, solo `displayName`. |
| Cookie de sede activa («Mi disponibilidad en esta sede») | `setResource` | Solo fija la cookie de navegación. La autorización la hacen el layout de la sede (`GET /user/me/resource/:resourceId/membership`) y el api (`member: true` en `/clinic/:resourceId/availability`). |

No hay endpoints públicos nuevos.

## UI

El mockup aprobado es la referencia de diseño y de textos.

**No se implementa del mockup:**
- los botones «Probar error», que son del prototipo;
- la edición de especialidades del ADMIN: «Editar» y «Asignar especialidad» en la sede,
  el selector, «+ Crear especialidad», «Administrar especialidades de…», «Guardar
  especialidades» y el aviso «Sin especialidad no apareces…»;
- «Configuración» para el ADMIN en el menú lateral (decisión 4).

### Rutas y layout

| Ruta | Layout | Desde |
| --- | --- | --- |
| `/account/[accountId]/me` | `(workspaces)/layout.tsx`, con la `TopNav` arriba y el contenido en `max-w-3xl`. Lleva «Volver a tus workspaces». | El avatar de la barra superior de la selección. |
| `/account/[accountId]/clinic/[clinicId]/me` | El layout de la sede, con el `Sidebar` (barra superior y menú desplegable en el celular). Sin enlace de volver: «Inicio» vuelve a la sede. El avatar del pie queda activo (`bg-brand-surface`). | El avatar al pie del menú lateral. |
| `/account/[accountId]/organization/[resourceId]/me` | El layout de la organización, igual que el de la sede. | Igual que la anterior. |

### Árbol de componentes

```
TopNav (modificado)                      Sidebar (modificado)
└─ UserMenu placement="top"              ├─ enlaces con estado activo
                                         └─ UserMenu placement="sidebar" subtitle={resourceName}
MyProfile
├─ «Volver a tus workspaces» (solo desde la selección)
├─ cabecera: UserAvatar lg + h1 nombre completo + correo
├─ PersonalDataCard ← name, lastName, phone, email, treatment, doctorDisplayName
│   ├─ Select «Tratamiento» (common/form/select) — solo si clinics.length > 0
│   ├─ Input «Nombre», Input «Apellido» (common/form/input)
│   ├─ PhoneInput «Celular» (ui/phone-input, con splitPhone)
│   ├─ «Correo electrónico» en solo lectura
│   └─ vista previa ← doctorDisplayName — solo si clinics.length > 0
├─ WhereYouWorkCard ← clinics — solo si clinics.length > 0
│   └─ por sede: nombre, organización, chips, nota, ClinicAvailabilityLink
└─ PasswordCard
    └─ PasswordInput × 2
```

### Textos (del mockup, salvo los marcados como propuesta)

**Menú del avatar**
- Cabecera con el nombre completo y el correo.
- Ítems: «Mi perfil», «Cambiar de sede» (solo dentro de una sede o de la organización) y
  «Cerrar sesión».
- Al pie del menú lateral: el avatar, el nombre completo y, debajo, el nombre de la sede
  o de la organización.

**Datos personales**
- Título «Datos personales» y debajo «Tus datos son los mismos en todas tus sedes.». Si la
  persona atiende, se agrega «Tu nombre es el que ven tus pacientes al reservar.».
- Botón «Editar».
- «Tratamiento» (solo si atiende): opciones «Sin tratamiento», «Dr.» y «Dra.», con la ayuda
  «Opcional. Sin tratamiento, tus pacientes ven solo tu nombre.».
- Campos «Nombre», «Apellido» y «Celular».
- «Correo electrónico» en solo lectura, con «Tu correo es tu usuario para iniciar sesión y
  por ahora no se puede cambiar.».
- Si atiende: «Así te ven tus pacientes al reservar: **{doctorDisplayName}**».
- En edición, los botones «Cancelar» y «Guardar cambios».
- Errores por campo: «Ingresa tu nombre», «Ingresa tu apellido» e «Ingresa tu celular».
- Toast al guardar: «Guardamos tus datos.».

**Dónde atiendes**
- Título «Dónde atiendes» y debajo «Tus especialidades en cada sede. Tus horarios se
  configuran dentro de cada sede.».
- Por cada sede: el nombre de la sede, el de la organización y las especialidades en
  chips, con «Te las asigna un administrador.».
- Sede sin especialidad: «Aún no tienes una especialidad asignada. Un administrador de
  {sede} tiene que asignártela.».
- El enlace «Mi disponibilidad en esta sede →».

**Contraseña**
- Título «Contraseña» y debajo «Al cambiarla cerramos tu sesión en tus otros
  dispositivos.».
- El botón «Cambiar contraseña» despliega el formulario:
  - «Contraseña actual» y «Contraseña nueva» (placeholder «Mínimo 8 caracteres»), cada una
    con «Mostrar» u «Ocultar»;
  - los botones «Cancelar» y «Cambiar contraseña».
- Error de la actual: «La contraseña actual no es correcta.».
- Toast al cambiarla: «Cambiaste tu contraseña. Cerramos tu sesión en tus otros
  dispositivos.».

**Propuestas (no están en el mockup)**

| Situación | Texto |
| --- | --- |
| Toast de error de validación | «Revisa los datos marcados.» |
| Botones mientras se envía | «Guardando…» y «Cambiando…» |
| Contraseña nueva corta | «Tu contraseña nueva debe tener al menos 8 caracteres.» |
| Contraseña nueva larga | «Tu contraseña nueva puede tener hasta 128 caracteres.» |
| Contraseña actual vacía | «Ingresa tu contraseña actual.» |
| Límite de intentos (429) | «Hiciste varios intentos seguidos. Espera unos segundos y vuelve a intentarlo.» |
| Error genérico | «No pudimos cambiar tu contraseña. Vuelve a intentarlo.» |

### Estados

| Estado | Qué se ve |
| --- | --- |
| Normal | Tarjetas en solo lectura, con los campos deshabilitados, como en el mockup. |
| Carga | `LoadingState` («Cargando...»), bajo la barra superior o dentro del panel. |
| Error al cargar | `ErrorState` con «Reintentar». |
| Sesión vencida | Al cargar, el flujo actual de `AuthExpiredError`. Al guardar los datos, `auth-expired`: toast «Tu sesión ha expirado. Vuelve a iniciar sesión.» y `/login` (`useFormAction`). Si Better Auth responde 401 al cambiar la contraseña, también va a `/login`. |
| Vacío | Sin perfil de médico: no se ven «Dónde atiendes», «Tratamiento» ni la vista previa. Sede sin especialidad: el texto de arriba, sin chips. |
| 403 | No hay pantalla de 403: todo miembro de la cuenta tiene perfil. El único 403 del api (tratamiento sin perfil de médico) no pasa desde la UI, porque el campo no se pinta; si llegara, se muestra un toast con su mensaje. |
| 402 | No aplica: va en todos los planes (decisión 9). |

### Interacciones

**Avatar**
- Abre y cierra el menú (`aria-expanded`).
- El menú se cierra con Escape (el foco vuelve al botón), con un clic fuera y al elegir un
  ítem.
- «Mi perfil» navega a su ruta y, en el celular, cierra el menú desplegable.
- «Cambiar de sede» borra las cookies de sede y va a `/account/{accountId}/select`, lo
  mismo que hace hoy «Selección de recursos».
- «Cerrar sesión» llama a `signOutAndClearResource`.

**Datos personales**
- «Editar» habilita los campos y lleva el foco al primero («Tratamiento» o «Nombre»).
- «Cancelar» descarta lo escrito y el foco vuelve a «Editar». El formulario se vuelve a
  montar con una `key`, porque `form.reset()` no limpia el estado propio de `PhoneInput`.
- «Guardar cambios» envía con `useFormAction`.
  - Si sale bien: toast, vuelta a solo lectura, foco en «Editar» y `revalidateTag`. Si el
    nombre del avatar no se actualiza, se suma `router.refresh()` en `onSuccess`; hay que
    comprobarlo en el navegador. Los layouts leen `getMe` sin caché.
  - Si hay errores: se marcan por campo (`aria-invalid` y `aria-describedby`) y el foco va
    al primer campo con error.

**Contraseña**
- «Cambiar contraseña» despliega el formulario y lleva el foco a «Contraseña actual».
- Antes de llamar a Better Auth se valida en el cliente que la actual no esté vacía y que
  la nueva tenga de 8 a 128 caracteres.
- Errores de Better Auth (`error.code`):
  - `INVALID_PASSWORD`: el error va bajo «Contraseña actual».
  - `PASSWORD_TOO_SHORT` y `PASSWORD_TOO_LONG`: el error va bajo «Contraseña nueva».
  - 429: toast de límite de intentos.
  - 401: va a `/login`.
  - Cualquier otro: toast genérico.
- Si sale bien: toast, el formulario se pliega y se vacía, y el foco vuelve a «Cambiar
  contraseña». El `token` que devuelve Better Auth en el cuerpo no se guarda ni se usa.
- «Mostrar» y «Ocultar» cambian el `type` del input. Sus etiquetas accesibles son
  «Mostrar contraseña actual», «Ocultar contraseña nueva», etc.

**Enlaces**
- «Mi disponibilidad en esta sede →» fija la sede activa y navega a su «Mi
  Disponibilidad».
- «Volver a tus workspaces» lleva a `/account/{accountId}/select`.

### Diferencias por rol

Lo que se ve depende de si la persona tiene perfil de médico en alguna sede (t-5), no de
su rol en la sede actual.

| Rol | Menú lateral | «Mi perfil» |
| --- | --- | --- |
| ADMIN (hoy sin perfil de médico) | Sin «Configuración», como hoy. Avatar al pie. | «Datos personales» sin «Tratamiento» ni vista previa, y «Contraseña». |
| DOCTOR | «Configuración» → «Mi Disponibilidad». Avatar al pie. | «Datos personales» con «Tratamiento» y vista previa, «Dónde atiendes» y «Contraseña». |
| USER (recepción) | **Pierde «Configuración»**, que ya no tiene nada dentro. Avatar al pie. | Lo mismo que el ADMIN. |

### Accesibilidad

**Menú del avatar**
- El botón lleva `aria-haspopup="menu"` y `aria-expanded`, y su nombre accesible es «Tu
  cuenta: {nombre completo}».
- El menú usa `role="menu"` y `role="menuitem"`. Las flechas arriba y abajo mueven el
  foco entre los ítems, y al abrirlo el foco va al primero.

**Tarjetas y campos**
- Cada tarjeta es una `section aria-labelledby` de su `h2`, y la página tiene un solo `h1`.
- Cada campo tiene su `label`. El correo es texto con rótulo, no un input deshabilitado.
- La ayuda y los errores se asocian con `aria-describedby`, y los errores usan
  `role="alert"` (`Field`).

**Orden de tabulación**
1. «Volver a tus workspaces».
2. «Editar», o en edición los campos, «Cancelar» y «Guardar cambios».
3. Los enlaces «Mi disponibilidad en esta sede».
4. «Cambiar contraseña», o con el formulario abierto los campos, sus «Mostrar»,
   «Cancelar» y «Cambiar contraseña».

**Avisos y celular**
- Los toasts los muestra `sonner` con `role="status"`.
- A 375 px:
  - todo va en una columna;
  - los botones de acción van a todo el ancho (`flex-1`);
  - los nombres y correos largos usan `break-words` o `truncate`;
  - no hay desplazamiento horizontal.

## Riesgos y casos límite

| Id | Caso | Qué pasa |
| --- | --- | --- |
| rg-1 | **Límite de intentos de `/change-password`** | 3 cada 10 s por IP, solo en producción. Vive en memoria y es por instancia: se reinicia con el api y no se comparte entre instancias. Frena, pero no impide del todo, que alguien con una sesión ajena pruebe contraseñas actuales. Lo revisa el security-reviewer. |
| rg-2 | **`/change-password` devuelve en el cuerpo el token de la sesión nueva** | Llega a JavaScript, igual que hoy con `signIn`. Platform no lo guarda. Lo revisa el security-reviewer. |
| rg-3 | **Sin aviso por correo al cambiar la contraseña** | Queda fuera de alcance porque necesitaría tocar la configuración de Better Auth. |
| rg-4 | **Suplantación interna por nombre** | Un usuario puede ponerse el nombre de otro médico. No se valida; es un riesgo del consultorio. |
| rg-5 | **Sin recuperación de contraseña** | Quien la olvida no puede entrar. Va en un ticket aparte. |
| rg-6 | **Reabrir `update-user` por error** | `disabledPaths` no se toca, y `fix-auth-user-fields-input.spec.ts` sigue cubriéndolo. |
| cl-1 | Nombre, apellido o celular vacíos o solo con espacios | Se ve el error del campo y no se guarda (en platform y en el api). |
| cl-2 | Celular de una invitación, sin código («987654321») | Se precarga con «+51» y el número tal cual; al guardar queda «+51987654321». Se ve en el selector antes de guardar. |
| cl-3 | Celular con un código que no está en la lista («+44…») | `splitPhone` deja «+51» elegido y el valor completo en el número. Como empieza con «+», se guarda tal cual (t-9). |
| cl-4 | Médico en varias sedes, o en sedes de dos organizaciones | Un bloque por sede, con las especialidades de la organización de esa sede. |
| cl-5 | Médico al que quitaron de una sede (membership con `deletedAt`) | Esa sede no aparece. Si era la única, no ve «Dónde atiendes» ni «Tratamiento». El tratamiento queda guardado, pero no se muestra en ninguna parte. |
| cl-6 | Especialidad de otra organización ligada al perfil por datos viejos | No se muestra: es el mismo filtro que el booking. |
| cl-7 | Dos pestañas editando a la vez | Gana el último que guarda. |
| cl-8 | Cambia la contraseña con otra sesión abierta | La otra sesión cae en su siguiente petición y va a `/login`. La actual sigue dentro con la cookie nueva. |
| cl-9 | La contraseña nueva es igual a la actual | Se acepta y se cierran las demás sesiones igual. |
| cl-10 | Dueño que todavía no tiene organización | Abre «Mi perfil» desde la selección (t-8) y no ve «Dónde atiendes». |
| cl-11 | Nombre o apellido muy largos | No hay máximo (decisión 5). En el avatar y en el menú se truncan; en la cabecera se parten en varias líneas. |
| cl-12 | «Cambiar de sede» dentro de la organización | El texto dice «sede» aunque se esté en la organización, porque así lo decidió el humano (decisión 2). |
| cl-13 | Cambia el tratamiento después de una reserva | Los correos ya enviados no cambian. La página de autogestión y el panel muestran el nombre nuevo. |

## Preguntas abiertas

Ninguna.

**Documentación:** al cerrar el ticket, `docs/PRODUCT.md` («Estado») y
`docs/capacidades.md` deben decir que «Mi perfil» existe, con los datos personales, el
tratamiento, «Dónde atiendes» y el cambio de contraseña.

## Verificación

**Typecheck y check**
- En `api`: `pnpm typecheck` y `pnpm check` limpios. Además, el SQL de
  `pnpm prisma:migrate` revisado y `pnpm prisma:generate` corrido.
- En `platform`: `pnpm typecheck` y `pnpm check` limpios.

**Peticiones manuales** (api local, con la cookie de un DOCTOR en `$C`)
- `curl -s -b "$C" localhost:4000/user/me/profile` devuelve `MyProfile` con sus sedes.
- Este PATCH devuelve 200 con `doctorDisplayName: "Dr. Andrés Rivas Soto"`:
  `curl -s -b "$C" -X PATCH -H 'content-type: application/json' -d '{"name":"Andrés","lastName":"Rivas Soto","phone":"+51954330118","treatment":"DR"}' localhost:4000/user/me/profile`
- El mismo PATCH con `"accountId"` o `"email"` responde 400 y la fila no cambia.
- Con `"name":"  "` responde 400.
- Con la cookie de un USER y `"treatment":"DRA"` responde 403.
- Sin cookie responde 401.
- `curl -s localhost:4000/clinic/<clinicId>/doctors` devuelve `displayName` con «Dr.» para
  ese médico y sin tratamiento para los demás.

**Navegador**

A 1280 px y a 375 px, con ADMIN, DOCTOR (con una y dos sedes, con y sin especialidad) y
USER, revisar:
- el avatar y su menú en la selección y en el panel;
- «Mi perfil» desde los dos lugares, «Cambiar de sede» y «Cerrar sesión»;
- editar, cancelar y guardar, y que el avatar muestre el nombre nuevo;
- el tratamiento en el booking, la página de autogestión, la agenda de hoy y el historial
  de la ficha;
- el cambio de contraseña con error y con éxito, y que la sesión abierta en otro
  navegador se cierre;
- que no haya desplazamiento horizontal a 375 px.

**e2e** (`cd platform && pnpm test:e2e`)

Se corre la suite completa, porque cambian `PhoneInput` (registro y booking), la
navegación y el nombre del médico en el booking. Se cambian las dos pruebas de «e2e que
esperan "Dr."».

Pruebas nuevas propuestas (los IDs los pone el product-manager):
- `platform/e2e/api/user/my-profile.spec.ts`:
  - la forma de `GET`;
  - `PATCH` sobre uno mismo;
  - claves de más → 400 sin cambios;
  - campos vacíos → 400;
  - tratamiento sin perfil de médico → 403;
  - una persona de la misma cuenta y otra cuenta quedan sin cambios;
  - «Dónde atiendes» con dos sedes, una membership borrada y una especialidad de otra
    organización.
- `platform/e2e/api/appointments/doctor-treatment.spec.ts`, con «DRA» sembrado por Prisma:
  - `displayName` en `/clinic/:id/doctors` y en la agenda de hoy;
  - `doctorName` del portal y del historial de la ficha;
  - los correos de reserva, de reprogramación al paciente y de reprogramación al médico
    con «Dra. …»;
  - el saludo «Hola {nombre},» sin tratamiento.
- `platform/e2e/ui/profile/my-profile.spec.ts`:
  - entrar desde la selección (con «Volver a tus workspaces») y desde la sede (con el menú
    lateral visible y el avatar activo);
  - editar, guardar y recargar; «Cancelar» descarta; error por campo;
  - USER sin «Dónde atiendes» ni «Tratamiento»;
  - DOCTOR con chips, «Te las asigna un administrador.» y el enlace a su disponibilidad;
  - DOCTOR sin especialidad;
  - contraseña actual incorrecta;
  - cambio con éxito: entra con la nueva, falla con la anterior, y otro contexto del
    navegador pierde la sesión;
  - sin desplazamiento horizontal a 375 px.
- `platform/e2e/ui/clinic/settings-menu.spec.ts`:
  - USER sin «Configuración»;
  - DOCTOR con «Configuración» → solo «Mi Disponibilidad»;
  - `/profile` redirige a `/me`.
- `platform/e2e/ui/booking/doctor-treatment.spec.ts`: un médico con «Dra.» y otro sin
  tratamiento en el paso del médico, el resumen y la pantalla de éxito.

Si el api de e2e corre con `NODE_ENV=production`, el límite de 3 intentos cada 10 s puede
cortar varias pruebas de contraseña seguidas. Para evitarlo: usar usuarios o IP distintos,
o espaciar las pruebas.

**Sin verificar en local:** el límite de intentos detrás del balanceador de producción,
que depende de qué IP llega en `x-forwarded-for`.

## Pasos para el engineer (en orden)

1. **Prisma.**
   - Agrega el enum y la columna.
   - Corre `pnpm prisma:migrate` con un nombre como `user_treatment` y revisa el SQL.
   - Aplica en local con `pnpm prisma:deploy` y corre `pnpm prisma:generate`.
2. **Dominio.**
   - Crea `doctor-treatment.ts` y `doctor-name.ts`.
   - Agrega `treatment` a la entidad `User` y a su mapper.
   - Agrega `updateProfile` al repositorio.
3. **Nombre del médico en el api.** Las consultas y los casos de uso de la tabla, con el
   renombre `fullName` → `displayName` en `get-appointment-notice`.
4. **Perfil en el api.**
   - Crea el query `get-my-profile` y el use case `update-my-profile`.
   - Agrega las dos rutas en `routes/user/index.ts`.
   - Corre `pnpm typecheck` y `pnpm check` y haz las peticiones manuales.
5. **Nombre del médico en platform.** Los tipos con `displayName`, `doctor-step.tsx`,
   `booking-wizard.tsx` y `today-appointments.tsx`.
6. **`PhoneInput`** (t-9). Después, prueba a mano el registro y el booking.
7. **Navegación.**
   - Crea `sign-out.ts`, `UserAvatar` y `UserMenu`.
   - Modifica `TopNav` y `Sidebar`.
   - Ajusta `utils.tsx` y `settings-sidebar.tsx`, y convierte `profile/page.tsx` en una
     redirección.
8. **Rutas.**
   - Mueve `select/` al grupo `(workspaces)` con su layout.
   - Crea las tres páginas `me`, más el `loading.tsx` y el `error.tsx` del grupo.
9. **Perfil en platform.**
   - Agrega el cliente `getMyProfile`, sus tipos y la acción `update-my-profile`.
   - Crea los componentes de `components/profile/`.
   - Compara con el mockup a 375 px y en la computadora.
10. **e2e.**
    - Cambia las dos pruebas que esperan «Dr.».
    - Escribe las pruebas nuevas cuando estén los criterios del product-manager.
    - Actualiza `platform/e2e/README.md`.
11. **Cierre.**
    - `pnpm typecheck` y `pnpm check` en `api` y en `platform`.
    - Corre la suite e2e completa.
    - Escribe el resumen de lo verificado y de lo que quedó sin verificar.

## Criterios de aceptación

Los marcados **[e2e]** los cubre el e2e-tester con Playwright; los demás se verifican con
una petición manual o a ojo. Salvo que se diga otra cosa, el tratamiento se siembra con
Prisma (`getTestPrisma`). «Médica con Dra.» es una médica sembrada con `treatment = "DRA"`;
«médico sin tratamiento», uno con `treatment = NULL`. Los roles son los del mockup: ADMIN
(hoy sin perfil de médico), médico invitado (DOCTOR) y recepción (USER).

### PR 1: tratamiento en el api (pasos 1 a 3)

- **CA-1.** La migración nueva solo crea el enum `DoctorTreatment` (`DR`, `DRA`) y la columna nullable `user.treatment`, sin default ni relleno; ninguna migración existente cambia y el SQL no borra `appointment_doctor_slot_active_key`.
- **CA-2.** Tras aplicar la migración en local, todos los usuarios existentes tienen `treatment = NULL`.
- **CA-3. [e2e]** `GET /clinic/:clinicId/doctors` devuelve `displayName`: «Dra. {nombre} {apellido}» para la médica con Dra., «Dr. …» para uno con `DR` y «{nombre} {apellido}» para el médico sin tratamiento.
- **CA-4. [e2e]** Nunca se deduce: una médica sin tratamiento con nombre femenino (p. ej. «Lucía Paredes Quispe») tiene `displayName` exactamente igual a su nombre completo, sin «Dr.» ni «Dra.».
- **CA-5. [e2e]** La respuesta pública de `GET /clinic/:clinicId/doctors` no incluye `treatment`, y sigue sin `userId`, correo, teléfono ni rol.
- **CA-6. [e2e]** El registro con `treatment: "DR"` en el cuerpo no deja tratamiento guardado: el usuario queda con `treatment = NULL`, se rechace o se ignore la clave.
- **CA-7. [e2e]** `GET /appointment/manage/:token` de una cita con la médica con Dra. devuelve `doctorName` «Dra. …» y conserva exactamente las mismas claves que hoy.
- **CA-8. [e2e]** La página de autogestión (375 px, sin sesión) muestra «Dra. …» en el resumen y en «con {médico}» para esa cita.
- **CA-9. [e2e]** El correo de reserva al paciente con la médica con Dra. nombra a «Dra. {nombre} {apellido}».
- **CA-10. [e2e]** Al reprogramar con la médica con Dra., el correo al paciente la nombra «Dra. …».
- **CA-11. [e2e]** Al reprogramar, el correo al médico muestra «Profesional», y con cambio de médico «Médico anterior» y «Médico nuevo», cada uno con el tratamiento que tenga (o sin él).
- **CA-12. [e2e]** Los saludos de los correos al médico, al cancelar y al reprogramar, son «Hola {nombre de pila},», sin tratamiento, aunque tenga Dra.
- **CA-13. [e2e]** La respuesta de citas de la sede que usa «Citas de hoy» trae `doctor.displayName` con el tratamiento («Dra. …») y sin él para el médico sin tratamiento.
- **CA-14. [e2e]** En una cuenta de pago, el historial de citas de la ficha del paciente (api y pantalla) nombra a la médica con Dra. como «Dra. …».
- **CA-15. [e2e]** Si el tratamiento cambia después de reservar, el correo ya enviado no cambia y la página de autogestión muestra el nombre nuevo.
- **CA-16. [e2e]** Las pruebas de autogestión con médicos sin tratamiento (`portal-read`, `portal-cancel-emails`, `portal-reschedule-emails`, `appointment-portal`) siguen pasando: ningún correo ni pantalla muestra «Dr.» ni «Dra.».

### PR 2: tratamiento en platform (paso 5)

- **CA-17. [e2e]** En el booking a 375 px, el paso del médico muestra el botón «Dra. {nombre} {apellido}» para la médica con Dra. y «{nombre} {apellido}» para el médico sin tratamiento.
- **CA-18. [e2e]** El resumen antes de confirmar y la pantalla «¡Cita reservada!» dicen «con Dra. …» para la médica con Dra. y «con {nombre} {apellido}» para el médico sin tratamiento.
- **CA-19. [e2e]** Con un médico sin tratamiento, ningún paso del booking muestra «Dr.» ni «Dra.».
- **CA-20. [e2e]** `public-booking.spec.ts` y `public-booking-specialty-scope.spec.ts` esperan el nombre sin «Dr.» y pasan.
- **CA-21. [e2e]** «Citas de hoy» en el inicio de la sede muestra «· Dra. …» para las citas de la médica con Dra. y el nombre completo para las del médico sin tratamiento.
- **CA-22. [e2e]** El saludo del inicio de la sede de la médica con Dra. usa su nombre sin tratamiento (N-4).
- **CA-23.** En `platform/src` no queda ningún «Dr.» fijo ni nombre de médico armado a mano en booking ni en el panel: todos usan `displayName` o `doctorName` del api.

### PR 3: api del perfil (paso 4)

- **CA-24. [e2e]** `GET /user/me/profile` de un DOCTOR devuelve exactamente `name`, `lastName`, `email`, `phone`, `treatment`, `doctorDisplayName` y `clinics` (cada una con `clinicId`, `clinicName`, `organizationName` y `specialties` con `id` y `name`), sin ids de usuario, cuenta ni rol.
- **CA-25. [e2e]** Para un USER y para un ADMIN sin perfil de médico, `clinics` es `[]` y `doctorDisplayName` es `null`.
- **CA-26. [e2e]** El dueño que todavía no tiene organización recibe 200 con `clinics: []`.
- **CA-27. [e2e]** Un médico en dos sedes recibe un bloque por sede; una sede donde su membership está borrada no aparece.
- **CA-28. [e2e]** Una especialidad de otra organización ligada al perfil no aparece; una sede sin especialidades aparece con `specialties: []`.
- **CA-29. [e2e]** `PATCH /user/me/profile` con nombre, apellido, celular y `treatment: "DR"` responde 200 con el perfil actualizado y `doctorDisplayName` «Dr. {nombre} {apellido}»; un `GET` posterior lo confirma.
- **CA-30. [e2e]** Sin la clave `treatment` el tratamiento no cambia; con `treatment: null` se borra y `doctorDisplayName` queda sin prefijo.
- **CA-31. [e2e]** Los espacios al inicio y al final se quitan: «  Andrés  » se guarda como «Andrés».
- **CA-32. [e2e]** Nombre, apellido o celular vacíos, solo con espacios o ausentes responden 400 («Ingresa tu nombre», «Ingresa tu apellido», «Ingresa tu celular») y la fila no cambia.
- **CA-33. [e2e]** Un `treatment` fuera de `DR`, `DRA` o `null` (p. ej. `"dr"`, `"DOCTOR"`) responde 400 sin cambios.
- **CA-34. [e2e]** Cada clave de más (`id`, `userId`, `email`, `role`, `accountId`, `onboardingCompleted`, `confirmed` y una inventada) responde 400 y no cambia ningún dato del usuario, tampoco su correo ni su cuenta.
- **CA-35. [e2e]** Sin largo máximo: un nombre y un apellido de 300 caracteres y un celular de 40 se guardan completos (200).
- **CA-36. [e2e]** Un USER, o un ADMIN sin perfil de médico, que envía `treatment: "DRA"` recibe 403 «Solo quien atiende como médico puede tener tratamiento.» sin cambios; con `treatment: null` recibe 200.
- **CA-37. [e2e]** Un médico al que quitaron de su única sede recibe 403 al poner `DRA` y 200 al poner `null`.
- **CA-38. [e2e]** El `PATCH` de un usuario no cambia a otra persona de su cuenta ni a una de otra cuenta.
- **CA-39. [e2e]** Sin sesión, `GET` y `PATCH` responden 401; sin confirmar o sin onboarding, 403.
- **CA-40. [e2e]** Los datos son de la persona: tras cambiar nombre y tratamiento, `GET /clinic/:clinicId/doctors` de sus dos sedes muestra el `displayName` nuevo.
- **CA-41. [e2e]** `GET /user/me` responde igual que antes y `fix-auth-user-fields-input.spec.ts` sigue pasando (`update-user` responde 404).
- **CA-42.** Los logs del api al leer o guardar el perfil llevan `userId` y el nombre del error, nunca nombre, celular ni correo.

### PR 4: página del perfil (pasos 6, 8 y 9)

En este PR se entra por URL; el avatar llega en el PR 5.

- **CA-43. [e2e]** `/account/:accountId/me` muestra la barra superior, «Volver a tus workspaces» (que lleva a `/select`), el avatar con iniciales, un único `h1` con el nombre completo sin tratamiento y el correo.
- **CA-44. [e2e]** `/account/:accountId/clinic/:clinicId/me` y `/account/:accountId/organization/:resourceId/me` muestran el mismo contenido dentro del panel, con el menú lateral visible y sin «Volver a tus workspaces».
- **CA-45. [e2e]** El dueño sin organización abre `/account/:accountId/me` y ve «Datos personales» y «Contraseña», sin «Dónde atiendes».
- **CA-46. [e2e]** `/account/:accountId/select` funciona igual tras moverlo al grupo `(workspaces)` (la prueba `create-organization-button.spec.ts` pasa).
- **CA-47. [e2e]** En solo lectura, «Datos personales» tiene los campos deshabilitados, el botón «Editar» y el correo como texto con «Tu correo es tu usuario para iniciar sesión y por ahora no se puede cambiar.».
- **CA-48. [e2e]** El DOCTOR ve «Tratamiento» con «Sin tratamiento», «Dr.» y «Dra.» y su ayuda, la frase «Tu nombre es el que ven tus pacientes al reservar.» y «Así te ven tus pacientes al reservar: {doctorDisplayName}».
- **CA-49. [e2e]** USER y ADMIN sin perfil de médico ven «Datos personales» y «Contraseña», sin «Tratamiento», sin la vista previa, sin esa frase y sin «Dónde atiendes».
- **CA-50. [e2e]** «Editar» habilita los campos y lleva el foco al primero («Tratamiento» para el DOCTOR, «Nombre» para el USER).
- **CA-51. [e2e]** Cambiar nombre, apellido y celular y «Guardar cambios» muestra «Guardamos tus datos.», vuelve a solo lectura con el foco en «Editar», y al recargar los datos siguen.
- **CA-52. [e2e]** El DOCTOR que elige «Dra.» y guarda ve la vista previa «Dra. …» y aparece así en el booking; al elegir «Sin tratamiento», solo su nombre completo.
- **CA-53. [e2e]** «Cancelar» descarta lo escrito, también el celular, y el foco vuelve a «Editar».
- **CA-54. [e2e]** Guardar con el nombre vacío muestra «Ingresa tu nombre» bajo el campo (`aria-invalid`), el toast «Revisa los datos marcados.», el foco en el campo y no guarda nada; igual con apellido («Ingresa tu apellido») y celular («Ingresa tu celular»).
- **CA-55. [e2e]** Un celular «+51954330118» se precarga con «+51» y el número; guardar sin tocarlo lo deja igual.
- **CA-56. [e2e]** Un celular de invitación sin código («987654321») se precarga con «+51» y, al guardar sin tocarlo, queda «+51987654321».
- **CA-57. [e2e]** Un celular con un código fuera de la lista («+44…») se guarda tal cual.
- **CA-58. [e2e]** El registro y el booking guardan el teléfono como hoy (código + número): sus pruebas e2e pasan.
- **CA-59. [e2e]** «Dónde atiendes» del DOCTOR muestra, por sede, su nombre, la organización, las especialidades en chips y «Te las asigna un administrador.».
- **CA-60. [e2e]** Una sede sin especialidad muestra «Aún no tienes una especialidad asignada. Un administrador de {sede} tiene que asignártela.» y ningún chip.
- **CA-61. [e2e]** Con dos sedes, «Mi disponibilidad en esta sede →» de la segunda abre `/clinic/{segunda}/profile/availability` y el editor de esa sede carga.
- **CA-62. [e2e]** No aparece nada que el plan dejó fuera: ni «Editar», «Asignar especialidad» o «+ Crear especialidad» en «Dónde atiendes», ni «Probar error».
- **CA-63. [e2e]** «Cambiar contraseña» despliega «Contraseña actual» y «Contraseña nueva» (placeholder «Mínimo 8 caracteres»), sin campo para repetirla, con el foco en la actual.
- **CA-64. [e2e]** «Mostrar» y «Ocultar» cambian el tipo de cada campo, con etiquetas accesibles como «Mostrar contraseña actual».
- **CA-65. [e2e]** Con la contraseña actual incorrecta se ve «La contraseña actual no es correcta.» bajo «Contraseña actual» y la contraseña anterior sigue sirviendo para entrar.
- **CA-66. [e2e]** Una nueva de 7 caracteres muestra «Tu contraseña nueva debe tener al menos 8 caracteres.» y la actual vacía «Ingresa tu contraseña actual.», sin petición a `/api/auth/change-password`.
- **CA-67. [e2e]** Una nueva de 129 caracteres muestra «Tu contraseña nueva puede tener hasta 128 caracteres.».
- **CA-68. [e2e]** Al cambiarla bien se ve «Cambiaste tu contraseña. Cerramos tu sesión en tus otros dispositivos.», el formulario se pliega vacío y la sesión actual sigue (al recargar no va a `/login`).
- **CA-69. [e2e]** Tras el cambio, otro contexto del navegador con sesión del mismo usuario cae en `/login`, se entra con la nueva y la anterior falla.
- **CA-70. [e2e]** «Cancelar» en la contraseña pliega el formulario y lo vacía.
- **CA-71. [e2e]** Con la sesión borrada en la base, «Guardar cambios» muestra «Tu sesión ha expirado. Vuelve a iniciar sesión.» y lleva a `/login`.
- **CA-72.** Con el api en `NODE_ENV=production`, el cuarto intento en 10 s muestra «Hiciste varios intentos seguidos. Espera unos segundos y vuelve a intentarlo.» (en e2e el api corre con `NODE_ENV=test` y no hay límite).
- **CA-73. [e2e]** A 375 px, con un DOCTOR en dos sedes y un nombre de 60 caracteres, en solo lectura, en edición y con la contraseña abierta, no hay desplazamiento horizontal.
- **CA-74.** A 375 px todo va en una columna y los botones de acción ocupan el ancho; a 1280 px coincide con el mockup.
- **CA-75. [e2e]** Cada tarjeta es una región con el nombre de su `h2` («Datos personales», «Dónde atiendes», «Contraseña») y cada campo se encuentra por su etiqueta.
- **CA-76. [e2e]** En una cuenta Gratis la página funciona entera, sin aviso de mejora de plan.
- **CA-77.** La carga muestra «Cargando...» bajo la barra superior o dentro del panel, y un error al cargar muestra el estado de error con «Reintentar».

### PR 5: navegación (paso 7)

- **CA-78. [e2e]** En `/select` no está el botón «Cerrar sesión» suelto: está el avatar con las iniciales y el nombre, cuyo nombre accesible es «Tu cuenta: {nombre completo}».
- **CA-79. [e2e]** A 375 px, el botón del avatar en `/select` muestra solo el nombre de pila; a 1280 px, el nombre completo.
- **CA-80. [e2e]** El menú de `/select` (`aria-expanded="true"`) tiene el nombre completo, el correo, «Mi perfil» y «Cerrar sesión», sin «Cambiar de sede»; «Mi perfil» lleva a `/account/:accountId/me`.
- **CA-81. [e2e]** El menú se cierra con Escape (el foco vuelve al avatar), con un clic fuera y al elegir un ítem; las flechas mueven el foco entre los ítems.
- **CA-82. [e2e]** «Cerrar sesión» lleva a `/login`, borra las cookies `resource_id` y `resource_type`, y una URL del panel abierta después pide iniciar sesión.
- **CA-83. [e2e]** A 1280 px en una sede, el pie del menú lateral muestra el avatar con el nombre completo y el nombre de la sede; ya no están «Selección de recursos» ni «Cerrar sesión» sueltos.
- **CA-84. [e2e]** Su menú tiene «Mi perfil», «Cambiar de sede» y «Cerrar sesión»; «Mi perfil» abre `/clinic/:clinicId/me` con el avatar del pie activo.
- **CA-85. [e2e]** En la organización, el pie muestra el nombre de la organización y «Cambiar de sede» borra las cookies de sede y lleva a `/select`.
- **CA-86. [e2e]** A 375 px en una sede, el menú desplegable tiene el avatar al pie y «Mi perfil» navega y cierra el desplegable.
- **CA-87. [e2e]** El avatar y el menú de la médica con Dra. muestran su nombre sin tratamiento.
- **CA-88. [e2e]** Tras guardar un nombre nuevo en «Mi perfil», el avatar lo muestra sin recargar a mano.
- **CA-89. [e2e]** El DOCTOR ve «Configuración», que lleva a «Mi Disponibilidad», y su menú interno ya no tiene «Mi Perfil».
- **CA-90. [e2e]** El USER (recepción) y el ADMIN no ven «Configuración».
- **CA-91. [e2e]** `/account/:accountId/clinic/:clinicId/profile` redirige a `/account/:accountId/clinic/:clinicId/me`.
- **CA-92. [e2e]** `availability-editor.spec.ts` sigue pasando por `/profile/availability`.
- **CA-93. [e2e]** A 375 px no hay desplazamiento horizontal en `/select` ni en la sede con el menú desplegable abierto.
- **CA-94.** El enlace de la sección actual del menú lateral se ve activo como en el mockup, y un nombre muy largo se trunca en el avatar y en el menú.
