# fix-booking-patient-contact

Rama `fix/booking-patient-contact`, desde `origin/main` (9b9250e). Sale de
`docs/features/fix-public-booking-scope/plan.md` (hallazgos 2 y 3, decisión 1
aprobada con su recomendación). Los hallazgos 1 y la decisión 4 de ese plan
van en otros dos tickets (ver "Tickets hermanos").

**Alcance ampliado (aprobado por el usuario)** tras la revisión de seguridad:
la ficha "ocupada de antemano" (hallazgo 4, abajo) y las correcciones del
reviewer al spec y al plan.

## Objetivo

Que reservar desde el booking público con un documento ya registrado no cambie
la ficha ni mande sus datos a otro correo, que una reserva fallida no deje una
ficha nueva creada, y que el api rechace antes de escribir nada un
`patientEmail`, un `scheduledAt` o un `durationMinutes` inválidos.

## Verificación de los hallazgos (contra `main` en 9b9250e)

| # | Hallazgo | ¿Sigue vigente? | Evidencia |
| --- | --- | --- | --- |
| 2 | El upsert pisa el contacto de la ficha | **Sí, y es peor** | `create-appointment.usecase.ts`: `upsert(... update: { phone, email })`. Además el correo de confirmación lleva `patient.name` y `patient.lastName` **de la ficha** a `dto.patientEmail`: quien conozca un DNI recibe el nombre real del paciente en su correo |
| 3 | Formato del correo | **Sí** | `patientEmail: z.string()`. El navegador valida (`type="email"` en `patient-step.tsx`), pero el api acepta cualquier texto |
| 4 | Ficha ocupada de antemano, sin rastro | **Sí** (security-reviewer) | Con `update: {}` la ficha la fija quien reserva primero con ese documento. El `upsert` (L66-92) se ejecuta antes que `appointment.create` (L94-103) y sin transacción, así que una reserva que falla después deja la ficha creada y ninguna cita: 409 por horario ocupado (`@@unique([doctorProfileId, scheduledAt])`); 500 por `scheduledAt: "2026-99-99T00:00"` (pasa la regex, `toInstant` da `Invalid Date`); 500 por `durationMinutes: 1.5` (la columna es `Int`). Las confirmaciones del paciente real irían después al correo del atacante |
| 4b | Fechas imposibles aceptadas en silencio | **Sí** (encontrado al revisar el 4) | La regex sólo mira la forma. `Date.parse("2026-02-30T09:00:00Z")` es válido y cae en el 2 de marzo; `"T24:00"` cae en el día siguiente. No falla: crea una cita en otra fecha que la pedida |

Comprobado aquí: el comportamiento de `Date.parse` y de los schemas Zod
propuestos (zod 4.3.6 del `api/node_modules`, ejecutado con Node). No
ejecutado aquí: el 500 de Prisma con `durationMinutes: 1.5` (lo reporta el
reviewer) ni el e2e.

## Modelo de amenaza

- **Quién:** cualquiera, sin sesión. La ruta es `policy({ public: true })`.
- **Hallazgo 2:** con un documento conocido, cualquiera cambia el correo y el
  teléfono de la ficha (los recordatorios futuros irían a él) y recibe el nombre
  y apellido que la ficha tiene registrados.
- **Hallazgo 3:** cualquier texto se guarda como correo de una ficha nueva y
  luego se usa como destino de envíos.
- **Hallazgo 4:** un anónimo crea la ficha de otra persona con su propio correo
  mediante una reserva que falla a propósito (horario ocupado, fecha imposible,
  duración no entera). No queda cita en la agenda, así que el consultorio no ve
  nada raro. Cuando el paciente real reserve, sus confirmaciones irán al
  atacante, junto con su nombre y los datos de la cita.

## Invariantes

1. El booking nunca modifica una ficha existente: ni contacto ni ningún otro
   campo.
2. La respuesta de una reserva válida es idéntica exista o no la ficha (no
   permite enumerar documentos).
3. Los datos de una ficha existente sólo se envían a su propio correo.
4. `patientEmail` es un correo con formato válido; si no lo es, no se crea ni
   paciente ni cita.
5. **(nuevo)** Una reserva crea la ficha y la cita juntas o ninguna de las dos:
   un 400, 404, 409 o 500 anterior al correo no deja ficha nueva.
6. **(nuevo)** `scheduledAt` es una fecha y hora de reloj que existe, con el
   formato actual `YYYY-MM-DDTHH:mm`, y `durationMinutes` es un entero entre 1 y
   `SLOT_DURATION_MINUTES`. Se valida en el schema de la ruta, antes de
   cualquier escritura.

## Alcance

Dentro: hallazgos 2, 3, 4 y 4b; correcciones del reviewer al spec y al plan.

Fuera, en otros tickets: validación sede → médico → especialidad, el 404
único y `z.uuid()` de los ids (`booking-scope`); el `try/catch` del envío y el
log del error (`booking-email-send`).

### Fuera de alcance (sin ticket todavía)

- **Límite de peticiones** en `POST /appointment`: sin él, un anónimo puede
  reservar en bucle (ocupar horarios, crear fichas válidas con documentos
  ajenos).
- **Normalización** de documento, teléfono y nombres (`"12345678"` frente a
  `" 12345678"`, mayúsculas, longitud máxima). Hoy dos formas del mismo
  documento son dos fichas.
- **Validar `scheduledAt` contra la disponibilidad del médico y contra el
  pasado.** Este ticket sólo exige que la fecha exista; una hora fuera del
  horario del médico o ya pasada se sigue aceptando.
- **Verificar el correo del paciente** (código por correo o WhatsApp): es el
  cierre de fondo del hallazgo 4 y de la suplantación residual (ver Riesgos).

## Cambios por capa

**Prisma:** ninguno. Sin migración.

**platform (app):** ninguno. El wizard ya valida el correo en el navegador, y
lo que envía cumple el schema nuevo (ver "Efecto en el wizard").

### api

`api/src/application/use-cases/appointment/create-appointment.usecase.ts`

**Schema** (ya hecho en el worktree: `patientEmail`; pendiente: el resto):

- `patientEmail`:
  ```ts
  patientEmail: z.email({ error: "Correo inválido" }),
  ```
- `scheduledAt`: `z.iso.datetime` en hora local con precisión de minutos
  comprueba que la fecha y la hora existen (rechaza `2026-02-30`, `2026-99-99`,
  `24:00`), pero también acepta un sufijo `Z` (`"2026-03-04T09:00Z"`) que
  `toInstant` no sabe leer. Por eso se conserva la regex actual encadenada:
  ```ts
  scheduledAt: z.iso
    .datetime({
      local: true,
      precision: -1,
      error: "scheduledAt debe ser una fecha y hora que existan",
    })
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
      error: "scheduledAt debe tener formato YYYY-MM-DDTHH:mm",
    }),
  ```
  El JSDoc de encima se queda igual. Probado con zod 4.3.6:
  `2026-08-06T09:00` y `2028-02-29T09:00` pasan; `2026-02-30T09:00`,
  `2026-03-04T24:00` y `2026-03-04T09:00Z` no. El formato que acepta la ruta
  no cambia.
- `durationMinutes`:
  ```ts
  durationMinutes: z
    .int({ error: DURATION_ERROR })
    .min(1, { error: DURATION_ERROR })
    .max(SLOT_DURATION_MINUTES, { error: DURATION_ERROR }),
  ```
  con `DURATION_ERROR` = ``durationMinutes debe ser un entero entre 1 y
  ${SLOT_DURATION_MINUTES}`` y `import { SLOT_DURATION_MINUTES } from
  "@/domain/entities/availability/entity";` (la constante vive en el dominio y
  la importan también `get-doctor-slots.query.ts`). Biome decidirá si la deja en una
  línea; no reformatear lo demás.

  **Decisión (tomada):** `z.int()` acotado por
  `SLOT_DURATION_MINUTES`, y no fijarlo en el servidor. No cambia el contrato
  ni el platform y da un 400 explícito; fijarlo en el servidor dejaría
  `durationMinutes` como campo muerto en el cliente y conviene cuando la
  duración dependa del médico o del servicio.

  La duración no interviene en qué horarios quedan ocupados
  (`get-doctor-slots.query.ts` sólo compara la hora de inicio); se muestra en
  el correo y en la agenda del día.

Al fallar cualquiera de los tres, el schema de la ruta responde 400 antes de
ejecutar el caso de uso: no se crea paciente ni cita.

**Transacción.** El api tiene dos formas, ambas sobre `transaction-context.ts`:
`inTransaction(work)` llamada desde el caso de uso (`create-clinic`,
`insert-availability`, `accept-invitation`, `set-password`) y un
`ITransactionManager` inyectado desde la ruta (`InviteUserUseCase`, rutas de
`account`). Se usa `inTransaction`: el caso de uso ya importa `getClient` de
ese módulo y la ruta de citas sólo recibe `emailService`, así que inyectar el
manager obligaría a tocar la ruta y `server.ts`.

- Import (L5): `import { getClient, inTransaction } from
  "@/infrastructure/postgres/transaction-context";`.
- L46-65 (lecturas de sede y médico, `const [date, time]`) no cambian.
- L66-103 se sustituyen por:
  ```ts
  const { patient, appointment } = await inTransaction(async () => {
    // El booking es anónimo: reutiliza la ficha del documento pero nunca la modifica.
    const bookedPatient = await getClient().patient.upsert({
      where: { accountId_documentType_documentNumber: { ... como hoy ... } },
      update: {},
      create: { ... como hoy ... },
    });

    return {
      patient: bookedPatient,
      appointment: await getClient().appointment.create({
        data: { ... como hoy, con patientId: bookedPatient.id ... },
      }),
    };
  });
  ```
  `getClient()` se llama **dentro** del callback: el `client` de L46 se obtuvo
  fuera de la transacción y escribir con él la saltaría.
- El correo (L105-128) queda **fuera** de la transacción, como ahora, y sigue
  usando `patient` y `appointment` con esos nombres. Un fallo del proveedor no
  debe deshacer una cita ya reservada; eso lo trata `booking-email-send`.
- Correo: `to: patient.email` en lugar de `to: dto.patientEmail` (ya hecho en
  el worktree).
- Respuesta: no cambia. La ruta responde siempre
  `200 { message: "Cita creada con éxito" }`, exista o no la ficha
  (invariante 2). El ticket no añade al cuerpo ningún dato del paciente.

Con la transacción, un P2002 de `appointment.create` deshace el `upsert` y
Prisma relanza el mismo error fuera de `$transaction`: la ruta lo sigue
mapeando a 409 sin cambios. (Razonado sobre el código; lo comprueba el e2e del
caso 3.)

`api/src/routes/appointment/index.ts`: sin cambios. La política sigue siendo
`policy({ public: true })`.

`api/AGENTS.md`: sin cambios. "El formulario público no puede sobrescribir la
ficha clínica (ver el upsert...)" pasa a ser cierto del todo.

### Efecto en el wizard

`booking-wizard.tsx` envía `durationMinutes: dateTime.durationMinutes`, que
viene de `slots.durationMinutes` (`datetime-step.tsx`), que el api rellena con
`SLOT_DURATION_MINUTES` (30, `domain/entities/availability/entity.ts`): siempre 30, dentro
del rango. `scheduledAt` es `${date}T${time}`, con `date` tomado de las claves
de `days` (`addDays`, `YYYY-MM-DD`) y `time` de `toTime` (`HH:mm`, 00-23):
cumple el schema nuevo. Las reservas legítimas no cambian; lo confirman
`ui/clinic/public-booking.spec.ts` y
`ui/booking/public-booking-specialty-scope.spec.ts`.

### e2e

`platform/e2e/support/db.ts` (ya hecho en el worktree): el tipo `TestPrisma`
expone `patient` y `appointment`, justo después de `specialty`, con el formato
que dejó Biome:

```ts
  patient: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
    findFirst(args: { where: Record<string, unknown> }): Promise<{
      id: string;
      name: string;
      lastName: string;
      email: string;
      phone: string;
      birthDate: string | null;
    } | null>;
  };
  appointment: {
    count(args: { where: Record<string, unknown> }): Promise<number>;
  };
```

`platform/e2e/api/security/fix-booking-patient-contact.spec.ts` (ya existe en
el worktree; se corrige y amplía). `POST ${API_BASE_URL}/appointment` sin
sesión (`createApiContext()`).

**Correcciones del reviewer al spec actual:**

- **(a) Especialidad real.** `seedBookableDoctor` crea la especialidad con
  `uniqueName(SPECIALTY_NAME)`, pero `bookingBody` envía `SPECIALTY_NAME` a
  secas. Cuando `booking-scope` valide el nombre, todas las reservas del spec
  darían 404. `seedBookableDoctor` devuelve `specialtyName` (el nombre que pasó
  a `createSpecialty`) y `bookingBody` envía `specialty: seed.specialtyName`.
- **(c) `patient` no nulo antes de contar.** Hoy el caso 1 cuenta con
  `where: { patientId: patient?.id }`: si `patient` fuese `null`, Prisma
  ignora `patientId: undefined` y cuenta todas las citas. Antes de contar:
  `if (!patient) throw new Error("No se encontró la ficha del paciente");`
  y `where: { patientId: patient.id }`.

Datos sembrados con una combinación **válida** sede → médico → especialidad,
para que el spec siga pasando cuando `booking-scope` la valide:
`createOnboardedAdmin`, `createOrganizationResource`, `createClinicResource`,
`createSpecialty` e `invitePendingUser(admin, { resourceId: clinicId, role:
"DOCTOR", specialtyIds: [specialtyId] })`, como en
`ui/clinic/public-booking.spec.ts`. El `doctorProfileId` se lee con
`prisma.doctorProfile.findFirst({ where: { userId, clinicId } })`. Documento con
un número único por test y un médico nuevo por test (los horarios no chocan
entre tests).

Casos 1 y 2 (ya escritos), casos 3 a 5 (nuevos):

1. **Mismo documento, otro contacto.**
   - Primera reserva con `correo-original@…` (vía `uniqueEmail`) y teléfono A
     → 200.
   - Segunda reserva con el mismo `patientDocumentType` y
     `patientDocumentNumber`, otro `patientEmail` (`uniqueEmail`), teléfono B y
     otro `scheduledAt` (el `@@unique([doctorProfileId, scheduledAt])` daría
     409 con el mismo) → 200 y `await response.json()` igual al de la primera.
   - La segunda reserva trae además otro nombre, apellido y fecha de
     nacimiento.
   - `prisma.patient.findFirst({ where: { accountId, documentType,
     documentNumber } })` conserva correo, teléfono, nombre, apellido y fecha
     de nacimiento de la primera;
     `prisma.patient.count` con ese documento = 1;
     `prisma.appointment.count({ where: { patientId: patient.id } })` = 2,
     tras comprobar que `patient` no es `null`.
   - `readLatestEmailTo(correoOriginal)` existe y su `sentAt` es posterior a un
     instante tomado justo antes de la segunda petición;
     `readLatestEmailTo(correoNuevo)` es `undefined`.
2. **Correo inválido.** `patientEmail: "no-es-un-correo"` con un documento
   nuevo → 400; `prisma.patient.count` con ese documento = 0 y
   `prisma.appointment.count({ where: { doctorProfileId } })` no cambia.
3. **Horario ocupado, sin ficha huérfana.**
   - Reserva con el documento A en `2030-03-04T09:00` → 200.
   - Reserva con un documento B nuevo, otro correo, en el mismo
     `scheduledAt` y para el mismo médico → 409 con
     `{ message: "Ese horario ya no está disponible" }`.
   - `prisma.patient.count` con el documento B = 0;
     `prisma.appointment.count({ where: { doctorProfileId } })` = 1;
     `readLatestEmailTo(correoB)` es `undefined`.
4. **`scheduledAt` imposible → 400 sin ficha.** Un test por valor, con
   documento nuevo cada uno: `"2026-99-99T00:00"` (hoy 500 con la ficha
   creada) y `"2030-02-30T09:00"` (hoy 200 con la cita en el 2 de marzo).
   Cada uno → 400; `prisma.patient.count` con ese documento = 0 y
   `prisma.appointment.count({ where: { doctorProfileId } })` no cambia.
5. **`durationMinutes` inválido → 400 sin ficha.** Un test por valor, con
   documento nuevo cada uno: `1.5`, `0` y `SLOT_DURATION_MINUTES + 1` (`31`).
   Cada uno → 400; mismas comprobaciones de 0 fichas y citas sin cambio.

Los casos 2 a 5 dejan **0 pacientes nuevos** con el documento enviado. Para
comprobar que los casos 3 y 4 detectan el fallo, el engineer puede correrlos
antes de añadir la transacción y la validación: el 3 y el `2026-99-99` deben
fallar por la ficha huérfana, y el `2030-02-30` por el 200.

### Archivos

| Acción | Ruta |
| --- | --- |
| Modificar | `api/src/application/use-cases/appointment/create-appointment.usecase.ts` |
| Modificar | `platform/e2e/support/db.ts` (hecho) |
| Crear | `platform/e2e/api/security/fix-booking-patient-contact.spec.ts` (existe; corregir y ampliar) |

## Aislamiento entre cuentas

Endpoint público. Este ticket no añade ids ni consultas nuevas:

- El paciente se busca y se crea con el `accountId` que da la sede
  (`clinic.resource.accountId`), como hoy; nada del cuerpo fija la cuenta. La
  transacción no cambia los filtros, sólo agrupa las dos escrituras.
- La ficha existente ya no se escribe, así que un documento conocido no permite
  alterar datos de otra persona dentro de esa cuenta.
- Una reserva que falla no deja ficha, así que tampoco permite crear la de otra
  persona sin que quede la cita a la vista del consultorio.
- El correo con datos de la ficha sale sólo a `patient.email`, el de la propia
  ficha.
- Que `clinicId`, `doctorProfileId` y `specialty` estén relacionados lo valida
  `booking-scope`, no este ticket.

## Tickets hermanos: cómo no pisarse en `create-appointment.usecase.ts`

Los tres tickets tocan el mismo archivo. Líneas según `main` en 9b9250e
(contrastado con los diffs actuales de los worktrees `booking-scope` y
`booking-email-send`):

| Ticket | Toca |
| --- | --- |
| `fix/booking-patient-contact` (este) | L5 (`inTransaction`) y una línea nueva de import tras L5; schema L13 (`patientEmail`), L22-24 (`durationMinutes`), L30-32 (`scheduledAt`); L66-103 (`inTransaction` con `upsert` y `create`); L126 (`to:`) |
| `booking-scope` | Import L2 (se borra), constante tras los imports, L33-34 (`z.uuid()`), L48-62 (sede y médico), método privado entre el `constructor` y `execute` |
| `booking-email-send` | L113-128 dentro de un `try/catch` |

- **Schema, con `booking-scope`:** L30-32 de este ticket y L33-34 de
  `booking-scope` son contiguas, así que git dará conflicto. Se resuelve
  quedándose con ambos cambios.
- **Imports:** este ticket cambia L5 y añade una línea tras ella;
  `booking-scope` borra L2 y añade la constante tras L7. Quedan L3-4 y L6-7
  sin cambios entre medias: sin conflicto.
- **Cuerpo, con `booking-scope`:** L63-65 (línea en blanco,
  `const [date, time]`, línea en blanco) siguen sin cambios y separan ambos
  bloques. Este ticket no toca L46 ni los nombres `clinic`, `profile`,
  `clinic.resource.accountId` y `clinic.resourceId`.
- **Con `booking-email-send`:** su `try/catch` re-indenta L113-128, que
  incluye `to:`: conflicto seguro, en esa línea. **Nota para su rebase:** debe
  conservar `to: patient.email` dentro del `try` (no `dto.patientEmail`). Su
  `catch` registra `appointment.id`, que sigue en ámbito porque este ticket
  devuelve `appointment` de la transacción con ese nombre. L104-112 no cambian
  aquí, así que la transacción no choca con su bloque.
- **Orden de merge sugerido:** `booking-scope`, después este, después
  `booking-email-send` con rebase.
- **`platform/e2e/support/db.ts`:** `booking-scope` no lo toca (cuenta con
  `$queryRaw`). Sin conflicto.
- El plan de `booking-scope` lista en "Fuera de alcance" la falta de
  atomicidad y que `durationMinutes` lo fija el cliente; con este ticket la
  primera queda resuelta y la segunda acotada.

## Riesgos

- **Ficha ocupada de antemano: mitigada, no cerrada.** La transacción y la
  validación cierran la vía sin rastro (reserva fallida que deja la ficha).
  Sigue abierta la vía con rastro: un anónimo hace una reserva **válida** con
  un DNI ajeno y su propio correo antes que el paciente real. Queda una cita
  que el consultorio ve en la agenda y un horario ocupado, pero la ficha
  conserva para siempre el correo del atacante y las confirmaciones del
  paciente real irían a él. El cierre de fondo es verificar el correo del
  paciente; sin límite de peticiones, además, puede hacerse en bucle.
- **Paciente real que cambió de correo o teléfono:** la confirmación llega a la
  dirección antigua y su número nuevo no se guarda. El personal lo corrige en la
  ficha (`update-patient-record`). La pantalla de éxito sigue mostrando el
  teléfono que escribió (no muestra datos de la ficha, así que no filtra nada).
- **Suplantación residual:** quien conozca un DNI aún puede reservar una cita a
  nombre de esa ficha. Ya no cambia su contacto ni recibe su nombre; el paciente
  real recibe la confirmación y se entera. Se cierra con la misma verificación.
- **Enumeración por el correo, no por la respuesta:** la respuesta HTTP es
  idéntica, pero quien reserva con un DNI ajeno no recibe confirmación en su
  correo, y con un DNI nuevo sí. Misma limitación, misma solución.
- **Correos de fichas guardados sin validar antes de este ticket:** con
  `to: patient.email`, la confirmación puede ir a un texto que no es correo.
  Si el proveedor lo rechaza, hoy la cita queda creada (la transacción ya se
  confirmó) y el paciente ve 500 (y 409 al reintentar). Lo resuelve
  `booking-email-send`; conviene que ambos salgan en el mismo despliegue del
  api.
- **Dos primeras reservas simultáneas con el mismo documento nuevo:** la
  segunda puede chocar con el único `accountId + documentType +
  documentNumber` del paciente (P2002) y la ruta la reporta como "Ese horario
  ya no está disponible". Ya ocurría antes; ahora al menos se deshace entera.
  Improbable y fuera de alcance.
- **Clientes que enviaban otra duración o fechas "desbordadas":** ahora
  reciben 400. El único cliente es el wizard, que envía 30 y fechas reales.
- **Rama `example/plan-entitlements`:** toca el mismo caso de uso. Si el tope
  de pacientes se implementa sobre este archivo, partir de este ticket ya
  mergeado; el conteo del tope tendría que ir dentro de la misma transacción.

## Orden de despliegue

Sólo api, sin migración. Compatible con el platform actual (ver "Efecto en el
wizard"). Preferible desplegar junto con `booking-email-send` (ver Riesgos).

## Verificación

- `cd api && pnpm typecheck && pnpm check`.
- `cd platform && pnpm typecheck && pnpm check` (por `db.ts` y el spec).
- e2e `platform/e2e/api/security/fix-booking-patient-contact.spec.ts`, casos 1
  a 5. Los casos 3 y 4 se corren primero sin el cambio del api para ver que
  fallan por lo que deben.
- Deben seguir pasando `ui/clinic/public-booking.spec.ts` y
  `ui/booking/public-booking-specialty-scope.spec.ts` (reservas legítimas con
  `durationMinutes` 30 y `scheduledAt` del wizard).
- Petición manual opcional con el api local: `POST /appointment` con
  `scheduledAt: "2026-99-99T00:00"` → 400 y ninguna fila nueva en `patient`
  con ese documento.

## Criterios de aceptación

Los marcados `[e2e]` los cubre el e2e-tester con
`platform/e2e/api/security/fix-booking-patient-contact.spec.ts` o con los specs
de booking que ya existen. Todos se refieren a `POST /appointment` sin sesión.

**Paciente nuevo: sigue igual que hoy**

- **CA-1** `[e2e]` Una reserva válida con un documento que no tiene ficha en la
  cuenta de la sede responde `200 { message: "Cita creada con éxito" }`, crea
  una ficha con el nombre, apellido, documento, fecha de nacimiento, teléfono y
  correo del formulario, y crea la cita asociada a esa ficha.
- **CA-2** `[e2e]` Ese paciente nuevo recibe el correo de confirmación en la
  dirección que escribió en el formulario.
- **CA-3** `[e2e]` El flujo del booking público desde el navegador (wizard
  hasta la pantalla de éxito) funciona como hoy: siguen pasando
  `ui/clinic/public-booking.spec.ts` y
  `ui/booking/public-booking-specialty-scope.spec.ts`.

**Documento que ya tiene ficha**

- **CA-4** `[e2e]` Una segunda reserva válida con el mismo tipo y número de
  documento, pero otro correo y otro teléfono, responde 200 con un cuerpo
  idéntico al de la primera reserva.
- **CA-5** `[e2e]` Tras esa segunda reserva, la ficha conserva el correo y el
  teléfono de la primera.
- **CA-6** `[e2e]` Sigue existiendo una sola ficha con ese documento en la
  cuenta, y tiene las dos citas asociadas.
- **CA-7** `[e2e]` El correo de confirmación de la segunda reserva llega a la
  dirección guardada en la ficha y no se envía ningún correo a la dirección
  escrita en la segunda reserva.
- **CA-8** `[e2e]` Si la segunda reserva trae otro nombre, apellido o fecha de
  nacimiento, la ficha conserva los de la primera: el booking no modifica
  ningún campo de una ficha existente.
- **CA-9** El cuerpo de la respuesta no incluye ningún dato del paciente ni
  indica si la ficha ya existía.

**Formato del correo**

- **CA-10** `[e2e]` Una reserva con `patientEmail: "no-es-un-correo"` y un
  documento nuevo responde 400, no crea ficha con ese documento ni crea cita
  para el médico.
- **CA-11** Una reserva con un correo válido no se rechaza por el formato
  (cubierto en la práctica por CA-1 y CA-4).

CA-10 no se generaliza a "cualquier 400 de validación": un criterio genérico
no se puede probar como tal, y cada campo tiene su propio caso e2e
(CA-10, CA-15, CA-17).

**Reserva que falla: no deja ficha**

- **CA-12** `[e2e]` Con una cita ya reservada para un médico en un
  `scheduledAt`, una segunda reserva para el mismo médico y el mismo
  `scheduledAt`, con un documento sin ficha y otro correo, responde 409 con
  `{ message: "Ese horario ya no está disponible" }`.
- **CA-13** `[e2e]` Tras ese 409 no existe ninguna ficha con el documento de la
  segunda reserva, el médico sigue teniendo una sola cita y no se envía ningún
  correo a la dirección de la segunda reserva.
- **CA-14** `[revisión]` La creación de la ficha y la de la cita se ejecutan
  dentro de una misma transacción (`inTransaction`, escribiendo con
  `getClient()` obtenido dentro del callback); el correo de confirmación se
  envía después de confirmada la transacción, fuera de ella.

**Fecha y hora de la cita**

- **CA-15** `[e2e]` Una reserva con un documento sin ficha y `scheduledAt` con
  una fecha u hora que no existen responde 400, no crea ficha con ese documento
  ni cita para el médico. Se prueba al menos con `"2026-99-99T00:00"` y
  `"2030-02-30T09:00"`, cada uno con un documento distinto.
- **CA-16** `[e2e]` El formato aceptado de `scheduledAt` sigue siendo
  `YYYY-MM-DDTHH:mm` en hora de la clínica: las reservas válidas de CA-1, CA-4
  y CA-12 se aceptan, y el wizard sigue reservando (CA-3).

**Duración de la cita**

- **CA-17** `[e2e]` Una reserva con un documento sin ficha y `durationMinutes`
  igual a `1.5`, a `0` o a un valor mayor que `SLOT_DURATION_MINUTES` (hoy 30,
  p. ej. `31`) responde 400, no crea ficha con ese documento ni cita para el
  médico. Un test por valor, con documento distinto.
- **CA-18** Una reserva con `durationMinutes` entero entre 1 y
  `SLOT_DURATION_MINUTES` se acepta; el wizard envía 30 (cubierto en la
  práctica por CA-1 y CA-3). El servidor no fija la duración: guarda la que
  llega, ya validada.

## Observaciones de producto

Anotadas sin resolver; ninguna cambia el alcance de este ticket.

1. **"El médico no coordina nada" frente al paciente que cambió de contacto.**
   Si el paciente reserva con un correo o teléfono nuevos, se ignoran en
   silencio: la confirmación va al correo antiguo y, cuando existan, los
   recordatorios de 24 horas y los de WhatsApp también irían al contacto
   antiguo. Para corregirlo, el personal tiene que editar la ficha a mano o el
   paciente tiene que escribirle al consultorio, que es justo lo que la tesis
   quiere eliminar. El ticket cambia una ficha que cualquiera puede alterar por
   una ficha que nadie actualiza desde el booking; es lo correcto por
   privacidad, pero la salida definitiva (verificar al paciente por código y
   dejarle actualizar su contacto) pertenece a la autogestión por link y
   conviene tenerla en cuenta al diseñarla.
2. **El paciente no sabe a dónde fue su confirmación.** La pantalla de éxito
   no dice a qué dirección se envió el correo (y no debe mostrar la de la
   ficha). Un paciente que escribió un correo nuevo esperará la confirmación
   ahí y no la recibirá; lo previsible es que escriba al consultorio para
   preguntar si su cita quedó. Un texto neutro ("te enviamos la confirmación
   al correo registrado en el consultorio") podría reducirlo sin revelar
   datos, pero cambiaría la pantalla y el mockup, así que queda fuera de este
   ticket.
3. **Recordatorios futuros.** Las prioridades del producto ponen los
   recordatorios por correo y WhatsApp primero. Con este cambio, la calidad del
   contacto guardado en la ficha pasa a depender sólo del primer booking y del
   personal; cuanto antes lleguen los recordatorios, más pesa la observación 1.
   La ficha ocupada de antemano (Riesgos) agrava esto: el primer booking puede
   no ser del paciente.
4. **Fechas que existen pero no deberían reservarse.** El ticket sólo exige
   que `scheduledAt` exista; una hora pasada o fuera del horario del médico se
   sigue aceptando desde el api (Fuera de alcance). Una cita así aparece en la
   agenda y obliga al consultorio a contactar al paciente para moverla, lo que
   choca con "el médico no coordina nada" y, cuando exista, con la política de
   cancelación que valida plazos en el servidor.
5. **Mensajes de 400 en lenguaje técnico.** Los errores nuevos nombran campos
   internos (`scheduledAt`, `durationMinutes`). El wizard no debería
   provocarlos, así que el paciente no los ve en el flujo normal; si alguna vez
   llegan a la pantalla, chocan con "simple antes que completo" y con el
   español de Perú del booking.
