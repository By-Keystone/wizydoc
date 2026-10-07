# fix-booking-scope

Rama `fix/booking-scope`, desde `origin/main` (9b9250e). Recorte del plan
`fix-public-booking-scope` (hallazgo 1 y parte del 3; decisiones 2 y 3,
aprobadas con su recomendación).

## Objetivo

Que `POST /appointment` (booking público) sólo cree citas con una combinación
sede → médico → especialidad que el propio booking ofrece, con un médico cuya
membership en la sede no esté borrada.

## Hallazgo (contra `main` en 9b9250e)

`create-appointment.usecase.ts` busca el médico con
`doctorProfile.findUnique({ where: { id } })`, sin `clinicId`, y guarda
`specialty` (texto libre, `z.string()`) en `Appointment.specialty` sin consultar
`Specialty`. `clinicId` y `doctorProfileId` son `z.string()`: un id que no es
UUID llega a Prisma y acaba en 500 (P2023).

## Modelo de amenaza

- **Quién:** cualquiera, sin sesión. La ruta es `policy({ public: true })`.
- Con el `doctorProfileId` de un médico de la cuenta B y el `clinicId` de una
  sede de la cuenta A:
  - la cita aparece en la agenda de hoy de la sede A con el nombre del médico
    de B (`get-clinic-appointments.query.ts` filtra sólo por `clinicId`);
  - ocupa el hueco del médico de B en su booking (`get-doctor-slots.query.ts`
    filtra sólo por `doctorProfileId`) y el `@@unique([doctorProfileId,
    scheduledAt])` le bloquea ese horario;
  - `specialty` admite cualquier texto, que se muestra en la agenda y se
    incrusta en el correo de confirmación con el nombre de la sede.

## Invariantes

1. `POST /appointment` sólo crea la cita si `doctorProfileId` pertenece a
   `clinicId`, `specialty` es una especialidad de ese médico dentro de la
   organización padre de la sede (la misma condición que usa
   `GET /clinic/:clinicId/doctors`) y el usuario del médico tiene una membership
   no borrada (`deletedAt: null`) en esa sede.
2. Si la combinación no es válida, no se crea ni cita ni paciente, y la
   respuesta no dice cuál de los ids falló.
3. `clinicId` y `doctorProfileId` son UUID.

## Alcance

Dentro: invariantes 1 a 3. Fuera (otros tickets, ver "Tickets hermanos"): no
pisar la ficha del paciente, `z.email()` en `patientEmail`, el destinatario del
correo, el `try/catch` del envío y `request.log.error` en la ruta.

## Cambios por capa

**Prisma:** ninguno. Sin migración (ver "Membership del médico").

**platform:** ninguno. El wizard ya envía combinaciones válidas
(`specialty.name` de una especialidad listada para ese médico) y
`patient-step.tsx` ya muestra en un toast el `message` del api.

**api — ruta:** `api/src/routes/appointment/index.ts` no cambia. La política
sigue siendo `policy({ public: true })`; `NotFound` ya es `ApplicationError` y
el `catch` existente lo responde con su `statusCode` y `message`. El 400 de Zod
lo da el type provider, antes de entrar al handler.

### api — `api/src/application/use-cases/appointment/create-appointment.usecase.ts`

- Constante con nombre, justo después de los imports:
  ```ts
  const BOOKING_OPTION_UNAVAILABLE =
    "Ese médico o especialidad ya no está disponible en esta sede. Recarga la página y vuelve a elegirlos.";
  ```
- Schema: sólo estas dos líneas.
  ```ts
  doctorProfileId: z.uuid(),
  clinicId: z.uuid(),
  ```
  Los ids son `uuid(7)`; `z.uuid()` de Zod 4 acepta las versiones 1 a 8.
- Sede: `client.clinic.findUnique({ where: { resourceId: dto.clinicId },
  include: { resource: { select: { accountId: true, parentResourceId: true } }
  } })`. Si no existe o `clinic.resource.parentResourceId` es `null` →
  `throw new NotFound(BOOKING_OPTION_UNAVAILABLE)`.
- Desaparecen el `UnprocessableEntity("La clínica no pertenece a ningún
  recurso")` (y su import), el `if (!clinic)` inalcanzable y el
  `NotFound("User is not a doctor")`.
- Médico, especialidad y membership en una sola consulta, en un método privado
  de la clase:
  ```ts
  private async findBookableDoctor(
    dto: CreateAppointmentDto,
    organizationId: string,
  ) {
    return getClient().doctorProfile.findFirst({
      where: {
        id: dto.doctorProfileId,
        clinicId: dto.clinicId,
        specialties: { some: { name: dto.specialty, organizationId } },
        user: {
          resourceMemberships: {
            some: { resourceId: dto.clinicId, deletedAt: null },
          },
        },
      },
      select: { user: { select: { name: true, lastName: true } } },
    });
  }
  ```
  En `execute`: `const profile = await this.findBookableDoctor(dto,
  clinic.resource.parentResourceId)`; `null` →
  `throw new NotFound(BOOKING_OPTION_UNAVAILABLE)`. Se mantienen los nombres
  `clinic` y `profile` y la forma `profile.user.{name,lastName}` para no tocar
  el bloque del correo (ver "Tickets hermanos").
- Las dos validaciones quedan **antes** del `upsert` del paciente
  (invariante 2). El `upsert`, la creación de la cita y el correo no cambian en
  este ticket.
- Un comentario de una línea sobre la condición de membership, con el porqué:
  `DoctorProfile` no tiene `deletedAt`; quitar a un médico de la sede se
  registra en su membership.

### Membership del médico (`deletedAt: null`)

Verificado en `api/prisma/schema.prisma`:

- `DoctorProfile` no tiene relación directa con `UserResourceMembership`. Tiene
  `userId` y `clinicId` (columna `resource_id`, = `Clinic.resourceId` =
  `Resource.id`).
- `UserResourceMembership` tiene `userId`, `resourceId`, `deletedAt` y
  `@@unique([userId, resourceId])`; `User.resourceMemberships` es la relación
  inversa (`"user_membership"`).
- El único sitio que crea un `DoctorProfile` es `invite-user.usecase.ts`, y en
  la misma transacción crea la membership del mismo usuario con
  `resourceId` = la sede del perfil.

Por tanto la condición se expresa con
`user.resourceMemberships.some({ resourceId: clinicId, deletedAt: null })`:
**viable sin migración** y con índice ya existente (`@@unique([userId,
resourceId])`).

Notas:

- Hoy ningún código de la app escribe `deletedAt` (sólo lo leen las
  invitaciones y los límites del plan). La condición es defensiva: no cambia el
  comportamiento con los datos que produce la app.
- Un médico invitado que aún no aceptó tiene membership con `deletedAt: null`:
  sigue siendo reservable, como hoy y como lo muestra el listado público.
- No se exige `role: "DOCTOR"` en la membership: no se pidió y no cambia nada
  con los datos que crea la app hoy.

## Aislamiento entre cuentas

Endpoint público; recibe `clinicId`, `doctorProfileId` y `specialty` (nombre).

- `clinicId` → la sede da `accountId` y `organizationId` (su padre). Nada del
  cuerpo fija la cuenta.
- `doctorProfileId` se acepta sólo si `doctorProfile.clinicId = clinicId`.
- `specialty` se acepta sólo si está conectada a ese perfil y su
  `organizationId` es el padre de la sede (`@@unique([organizationId, name])`
  hace la búsqueda por nombre determinista).
- El usuario del perfil debe tener membership no borrada en esa misma sede.
  Como perfil y membership están atados a la sede, y la especialidad a su
  organización, todo queda en la cuenta de la sede sin comparar `accountId`
  aparte.
- El paciente se busca y se crea con el `accountId` de la sede, como hoy.
- Cualquier fallo (sede inexistente o sin organización, médico de otra sede o
  cuenta, especialidad no conectada o de otra organización, membership borrada)
  → el mismo 404 con el mismo mensaje (AGENTS.md: recurso de otra cuenta → 404).

## Tickets hermanos y conflictos al mergear

Tres tickets tocan `create-appointment.usecase.ts`. Los conflictos serán
pequeños si cada uno se limita a sus líneas (numeración de `main` en 9b9250e):

| Ticket | Líneas que toca |
| --- | --- |
| `fix/booking-scope` (este) | import de `UnprocessableEntity` (2, se borra); constante nueva tras los imports; `doctorProfileId` y `clinicId` del schema (33-34); bloque de sede y médico (48-62); método privado nuevo entre el `constructor` y `execute` |
| `booking-patient-contact` | `patientEmail` del schema (13); comentario y `update` del `upsert` (66-81); `to:` del envío (126) |
| `booking-email-send` | bloque `renderTemplate` + `send` (113-128) dentro del `try/catch`; `console.error` de la ruta |

Para que funcione:

- Este ticket no renombra `clinic`, `profile` ni cambia la forma de
  `profile.user`, que usa la plantilla del correo.
- No reordenar ni reformatear las líneas que no se tocan (Biome ya formateó el
  archivo en #49).
- El único solape real es `to:` (126) entre `booking-patient-contact` y
  `booking-email-send`; no afecta a este ticket. Orden de merge sugerido: este
  primero (es la validación), después los otros dos en cualquier orden,
  resolviendo `to:` a mano.

## Riesgos

- **Wizard abierto durante un cambio de configuración:** si el ADMIN quita la
  especialidad al médico, el paciente ve el toast con el mensaje fijo y vuelve
  a elegir.
- **Listado y booking divergen en `deletedAt`:** `GET /clinic/:clinicId/doctors`
  (`get-clinic-doctors.query.ts`) no filtra memberships borradas. Si algún día
  existe una, el médico aparecería en el wizard y la reserva respondería el 404
  con el mensaje fijo. Hoy no ocurre (nadie escribe `deletedAt`); queda anotado
  abajo.
- **Datos ya creados con combinaciones inválidas:** siguen ahí. Sin pasos de
  producción en este plan.

## Fuera de alcance (anotado para otros tickets)

- Filtrar `deletedAt` en `get-clinic-doctors.query.ts` y
  `get-doctor-slots.query.ts`, cuando exista el flujo que borra memberships.
- `scheduledAt` no se valida contra la disponibilidad ni contra el pasado, y
  `durationMinutes` lo fija el cliente.
- El `upsert` del paciente y la creación de la cita no son atómicos: un 409
  deja un paciente nuevo sin cita.
- `patientPhone`, `patientDocumentType` y los nombres no tienen formato ni
  longitud máxima.

## Archivos

| Acción | Ruta |
| --- | --- |
| Modificar | `api/src/application/use-cases/appointment/create-appointment.usecase.ts` |
| Crear | `platform/e2e/api/security/fix-booking-scope.spec.ts` |

`platform/e2e/support/db.ts` no se modifica: los conteos de cita y paciente se
hacen con `$queryRaw`, que ya está en `TestPrisma`, para no chocar con el e2e de
`booking-patient-contact`.

## Orden de despliegue

Sólo api, sin migración. Compatible con el platform actual, que ya envía
combinaciones válidas y UUID: no hay orden respecto a platform.

## Verificación

- `cd api && pnpm typecheck && pnpm check`.
- Deben seguir pasando `ui/clinic/public-booking.spec.ts`,
  `ui/booking/public-booking-specialty-scope.spec.ts` y
  `api/security/fix-specialty-account-scope.spec.ts`.
- e2e nuevo `platform/e2e/api/security/fix-booking-scope.spec.ts`:
  `POST /appointment` sin sesión; datos con `createOnboardedAdmin`,
  `createOrganizationResource`, `createClinicResource`, `createSpecialty`,
  `inviteUserViaApi` y `createMemberWithRole` (`support/accounts.ts`),
  `softDeleteMembership` (`support/invitations.ts`) y `getTestPrisma`. En cada
  caso de rechazo se comprueba, con `$queryRaw`, que no hay cita para ese
  `doctorProfileId` ni paciente con ese documento en la cuenta de la sede.
  - control: combinación válida → 200 y una cita creada (prueba que los
    rechazos no son por otra causa);
  - médico de una sede de otra cuenta → 404 con `BOOKING_OPTION_UNAVAILABLE`;
  - médico de otra sede de la misma cuenta → 404, mismo mensaje;
  - especialidad de la organización no conectada al médico → 404;
  - especialidad de otra organización con nombre idéntico a una de la propia:
    médico con membership en la sede (`createMemberWithRole`) y perfil creado
    con Prisma conectado sólo a la especialidad ajena (dato que la app ya no
    deja crear, como en `fix-specialty-account-scope.spec.ts`) → 404;
  - membership del médico borrada (`softDeleteMembership`) → 404;
  - `clinicId` UUID inexistente → 404 con el mismo mensaje;
  - `clinicId: "abc"` → 400; `doctorProfileId: "abc"` → 400;
  - los cuerpos de los 404 son idénticos entre sí.
- Sede sin `parentResourceId`: no se cubre por e2e (la app no crea sedes sin
  organización); se verifica por revisión.

## Criterios de aceptación

Todos se refieren a `POST /appointment` sin sesión. "Mensaje fijo" es el texto
de `BOOKING_OPTION_UNAVAILABLE`: "Ese médico o especialidad ya no está
disponible en esta sede. Recarga la página y vuelve a elegirlos." "No se crea nada" significa que,
tras la petición, no hay ninguna cita nueva para ese `doctorProfileId` ni ningún
paciente con ese número de documento en la cuenta de la sede.

**La reserva válida sigue funcionando**

- **CA-1** `[e2e]` Con una sede, un médico de esa sede con membership activa y
  una especialidad de la organización de la sede conectada a ese médico, la
  reserva responde 200 y queda exactamente una cita para ese médico en ese
  horario.
- **CA-2** `[e2e]` Siguen pasando `ui/clinic/public-booking.spec.ts`,
  `ui/booking/public-booking-specialty-scope.spec.ts` y
  `api/security/fix-specialty-account-scope.spec.ts`: el paciente que reserva
  desde el celular con lo que el wizard le ofrece no nota ningún cambio.

**Las combinaciones ajenas se rechazan igual y sin dejar rastro**

- **CA-3** `[e2e]` Médico de una sede de **otra cuenta** con el `clinicId` de
  la sede propia → 404 con el mensaje fijo; no se crea nada.
- **CA-4** `[e2e]` Médico de **otra sede de la misma cuenta** → 404 con el
  mensaje fijo; no se crea nada.
- **CA-5** `[e2e]` Especialidad de la organización de la sede **no conectada**
  al médico → 404 con el mensaje fijo; no se crea nada.
- **CA-6** `[e2e]` Especialidad de **otra organización con el mismo nombre**
  que una de la propia, siendo esa la única conectada al médico → 404 con el
  mensaje fijo; no se crea nada.
- **CA-7** `[e2e]` Médico cuya **membership en la sede está borrada** → 404 con
  el mensaje fijo; no se crea nada.
- **CA-8** `[e2e]` `clinicId` con formato UUID pero **sin sede** → 404 con el
  mensaje fijo; no se crea nada.
- **CA-9** `[e2e]` Los cuerpos de respuesta de CA-3 a CA-8 son idénticos entre
  sí: quien llama no puede saber si falló la sede, el médico, la especialidad o
  la membership, ni si un id existe en otra cuenta.
- **CA-10** `[e2e]` `clinicId: "abc"` → 400 y `doctorProfileId: "abc"` → 400,
  nunca 500; no se crea nada.
- **CA-11** Sede sin organización padre → 404 con el mensaje fijo y sin crear
  nada. Se verifica por revisión del código (la app no crea ese dato).

**El paciente real no queda atascado**

- **CA-12** Si el paciente tiene el wizard abierto y, entre que eligió y que
  pulsa "Confirmar reserva", el consultorio le quita la especialidad al médico
  (o lo quita de la sede), al confirmar ve un aviso con el mensaje fijo, en
  español y sin códigos ni ids, sigue en el paso de datos con el botón
  "Confirmar reserva" habilitado y puede volver atrás con "Atrás". No ve un error
  genérico ("Ha ocurrido un error", "No se pudo crear la cita") ni una pantalla
  de error. Se verifica a mano en el navegador, en ancho de celular.
- **CA-13** En ese mismo caso no se crea cita ni paciente: si el paciente
  recarga el link y reserva una combinación válida, queda una sola ficha y una
  sola cita.

**Sin cambios fuera del alcance**

- **CA-14** El diff toca sólo
  `api/src/application/use-cases/appointment/create-appointment.usecase.ts` y
  el spec nuevo; sin migración, sin cambios en platform ni en la ruta, que
  sigue con `policy({ public: true })`. No se renombran `clinic` ni `profile`
  ni cambia la forma de `profile.user`.
- **CA-15** `cd api && pnpm typecheck && pnpm check` limpios.

### Observaciones del PM (sin resolver)

- **Resuelta: "Vuelve a elegirlos" no era accionable sin recargar.** Las
  especialidades y médicos del wizard se cargan al abrir la página, así que
  "Atrás" vuelve a ofrecer la combinación inválida. El mensaje fijo pasó a
  decir "Recarga la página y vuelve a elegirlos". Sigue sin resolverse, y queda
  fuera de alcance (tocaría platform), que al volver al paso de datos el
  formulario está vacío.
- **Listado y reserva divergen en `deletedAt`** (ya anotado en Riesgos): si
  algún día existe una membership borrada, el wizard ofrecería un médico que
  siempre responde 404, y CA-12 se repetiría para todos los pacientes de ese
  médico, no sólo con el wizard abierto. Conviene que el ticket que introduzca
  el borrado de memberships incluya el filtro en `get-clinic-doctors.query.ts`
  y `get-doctor-slots.query.ts`.
