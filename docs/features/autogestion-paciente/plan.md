# autogestion-paciente

Plan escrito el 8 de octubre de 2026 contra `main` = `7f6078a` y revisado el
mismo día con las respuestas del humano. Maqueta: `mockup.html`, prototipo
clicable (JS inline, sin dependencias externas: CSS propio con los mismos
tokens y medidas que `tailwind.config.ts`, `components/ui/` y el booking).
Cubre todas las pantallas del paciente a 375 px y en escritorio, el correo de
confirmación y el aviso al médico.

**Estado: plan y diseño listos para que el product-manager escriba los
criterios.** No quedan decisiones de producto pendientes (sección 5).

Las rutas, nombres de archivos, el mecanismo del token y el modelo de datos de
este plan son un **punto de partida**: el engineer puede cambiarlos sin
consultar. Lo que no puede cambiar es el comportamiento descrito en las
secciones 2, 7, 8 y 9.

## 1. Objetivo

Que el paciente, sin cuenta, cancele o reprograme su cita desde el enlace que
recibe por correo, para que el médico no tenga que coordinar nada.

## 2. Alcance

**Entra**

- Enlace de autogestión en el correo de confirmación de `POST /appointment`.
- Página pública del enlace: resumen mínimo de la cita, cancelar, reprogramar.
- Cancelar siempre, hasta que empiece la cita, sin avisos ni distinciones por
  la antelación: la cita queda **cancelada**.
- Reprogramar hasta 12 h antes, con el mismo médico y sede, eligiendo entre
  los mismos huecos que ofrece el booking; como máximo 3 veces por cita.
- El hueco cancelado vuelve a estar libre para cualquier paciente.
- Correo al paciente y al médico de la cita tras cancelar o reprogramar.
- Ajustar `docs/PRODUCT.md` y `docs/capacidades.md` a la decisión de quitar la
  cancelación tardía (sección 4).

**Fuera**

- Confirmar la cita y recordatorios (feature posterior; el enlace y el modelo
  del token están pensados para reutilizarse, ver 6.2).
- Estados atendida / no asistió y la transición automática a atendida. El
  único cambio de estado nuevo es a `CANCELLED`, que ya existe en el enum.
- Cancelar o mover desde el panel. No es trivial (permisos por rol, UI de
  agenda) y va con la agenda semanal. El panel ya muestra "Cancelada" y no
  cambia.
- Cambiar de médico, especialidad o sede al reprogramar: para eso el paciente
  cancela y reserva de nuevo.
- Motivo de consulta: no existe en el modelo (`PRODUCT.md` lo pone en
  "Después"). El resumen muestra la especialidad; cuando exista el motivo, es
  una fila más del resumen y un campo más de la respuesta.
- Límite de peticiones por IP (ver 7, "Abuso").

## 3. Lo que hay hoy y lo que cambia

| Hoy | Problema para esta feature | Cambio |
| --- | --- | --- |
| `Appointment` tiene `@@unique([doctorProfileId, scheduledAt])` | Una cita cancelada sigue ocupando el hueco: `GetDoctorSlotsQuery` lo muestra libre (no está en `BLOCKING_STATUSES`) pero `POST /appointment` choca con P2002 y responde 409 | Índice único **parcial**, sólo para estados que bloquean (6.1) |
| `confirm-appointment.mjml` usa `{{clinicPhone}}` y `{{appointmentId}}`, que `renderTemplate` no recibe: el correo sale con "al  indicando la referencia ." | El paciente no tiene cómo autogestionar | Ese párrafo se sustituye por el botón al enlace (6.5) |
| `GetDoctorSlotsQuery` ya excluye `CANCELLED` y `NO_SHOW` | — | Se reutiliza tal cual |
| `assertSlotIsOffered` (privado en `CreateApointmentUseCase`, #57/#58) valida la hora contra los huecos reales | La reprogramación necesita la misma validación | Se reutiliza (6.3) |
| Panel: `today-appointments.tsx` y la ficha ya pintan "Cancelada" | — | Sin cambios |

## 4. Documentos de producto que cambian

El humano quitó la cancelación tardía: una cita cancelada es sólo
"cancelada", sin importar cuánto faltaba. Los documentos todavía la mencionan
y se ajustan **en esta feature** (el engineer, en el mismo PR):

- `docs/PRODUCT.md`, "Política de cancelación" (línea 57-58): "Si faltan menos
  de 12 horas queda registrada como **cancelación tardía**. Bloquearla no hace
  que el paciente asista…" pasa a "Cancelar: siempre, desde el link, hasta que
  empiece la cita, sin importar cuánto falte. Bloquearla no hace que el
  paciente asista…" (se conserva el porqué).
- `docs/PRODUCT.md`, "Estados de cita" (línea 71): "cancelada (por el paciente
  o el consultorio; tardía si faltaban menos de 12 h)" pasa a "cancelada (por
  el paciente o el consultorio)".
- `docs/PRODUCT.md`, "Estado": "autogestión por link" y "política de
  cancelación" salen de "No existe todavía".
- `docs/capacidades.md` (línea 35): se quita "cancelación tardía" de la fila de
  estados de cita.

## 5. Coordinación con `aviso-privacidad-booking`

Ese plan (sin mergear) toca las mismas piezas. Quien llegue segundo rebasa:

- **`confirm-appointment.mjml` y `template-renderer.ts`**: los dos quitan la
  referencia `{{appointmentId}}`; aquél añade `clinicPhone` y el bloque de
  autorización, éste el botón `manageUrl`. Son compatibles.
- **`BookingConsent.appointmentId @unique`**: por eso la reprogramación
  **mueve la misma fila** de `Appointment` en lugar de cancelar y crear otra;
  la autorización sigue ligada a la cita.
- **Bloqueo del link (P6 de aquél)**: no afecta a cancelar ni a reprogramar,
  que operan sobre una cita ya autorizada. El botón "Reservar otro horario"
  tras cancelar lleva al booking, que mostrará el bloqueo si corresponde.
- **Layout del booking**: aquél mueve `create-appointment/layout.tsx` a
  `clinic/[clinicId]/layout.tsx`. Este plan extrae la cabecera y el pie a un
  componente común (6.4); si aquél llega antes, se extrae desde su nueva
  ubicación.

## 6. Decisiones tomadas (8 de octubre)

- **D1. Tope de 3 reprogramaciones por cita.** Acota correos y movimientos de
  quien tenga el enlace. Al llegar, el botón queda deshabilitado con "Ya
  reprogramaste esta cita 3 veces. Si necesitas otro horario, cancélala y
  reserva de nuevo."
- **D2. Se avisa sólo al médico de la cita** (su `User.email`), no a los ADMIN
  de la sede.
- **Sin cancelación tardía.** Cancelar no distingue la antelación: ni columna,
  ni aviso al paciente, ni etiqueta en el panel, ni mención en el correo al
  médico.

## 7. Cambios por capa

### 7.1 Prisma (requiere migración nueva)

```prisma
model Appointment {
  // ...campos actuales
  cancelledAt     DateTime? @map("cancelled_at")
  rescheduleCount Int       @default(0) @map("reschedule_count")

  accessTokens AppointmentAccessToken[]

  // se quita @@unique([doctorProfileId, scheduledAt]); ver abajo
  @@index([scheduledAt])
  @@index([patientId, scheduledAt])
}

model AppointmentAccessToken {
  id            String   @id @default(uuid(7)) @db.Uuid
  appointmentId String   @map("appointment_id") @db.Uuid
  tokenHash     String   @unique @map("token_hash")
  createdAt     DateTime @default(now()) @map("created_at")

  appointment Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)

  @@index([appointmentId])
  @@map("appointment_access_token")
}
```

- **`cancelledAt`** es el único registro de cuándo se canceló: `updatedAt`
  cambia con cualquier escritura posterior. No se usa para clasificar la
  cancelación.
- **`rescheduleCount`** sostiene el tope de D1.
- **Sin `cancelledBy`** todavía: hoy sólo cancela el paciente. Cuando el panel
  cancele, se añade y las filas previas con `cancelledAt` se entienden como del
  paciente.
- **Índice único parcial.** Sustituye a `@@unique([doctorProfileId,
  scheduledAt])`:
  ```sql
  CREATE UNIQUE INDEX appointment_doctor_slot_active_key
    ON appointment (doctor_profile_id, scheduled_at)
    WHERE status IN ('PENDING', 'CONFIRMED', 'COMPLETED');
  ```
  El predicado es exactamente `BLOCKING_STATUSES` de `get-doctor-slots.query.ts`;
  si uno cambia, cambia el otro (el engineer los acerca: constante en
  `domain/` que usen ambos y comentario en la migración). Prisma 7.8 no lo
  expresa en el schema salvo que exista un preview de índices parciales (el
  engineer lo comprueba); si no, se quita el `@@unique` del schema, se crea la
  migración con `pnpm prisma:migrate` y se añade este SQL a mano a **esa
  migración nueva** antes de aplicarla. Hay que comprobar que un segundo
  `prisma:migrate` no propone borrar el índice; si lo propone, se documenta en
  `api/AGENTS.md` (Gotchas).
- La migración no toca datos: las citas existentes quedan con `cancelledAt`
  nulo, `rescheduleCount` 0 y sin token.

### 7.2 Token de acceso

Punto de partida:

- 32 bytes de `randomBytes`, en base64url (43 caracteres: cabe bien en un
  mensaje de WhatsApp). En la base sólo se guarda `sha256(token)` en hex: una
  copia de la base no permite operar las citas.
- **Tabla aparte y no columna** para que confirmar y recordatorios emitan su
  propio token por mensaje sin invalidar el del correo de confirmación (con un
  hash no se puede reconstruir el enlace anterior).
- **Expiración derivada de la cita**: el token sirve mientras `now <
  scheduledAt`. No hay `expiresAt` propio; si la cita se reprograma, el enlace
  sigue valiendo hasta la nueva hora. Pasada la hora de inicio, el api
  responde igual que con un token desconocido.
- La reprogramación **no rota** el token: el correo original sigue sirviendo.
- Se emite dentro de la transacción que crea la cita.
- Acceso a datos reutilizable (lo usan la query y los dos casos de uso):
  `domain/repositories/appointment-access-token.repository.ts` (interfaz) +
  `infrastructure/postgres/repositories/appointment-access-token.repository.ts`
  con `issue(appointmentId): Promise<string>` (devuelve el token en claro) y
  `findAppointmentId(token): Promise<string | null>` (hashea y busca).

### 7.3 api

**Dominio** — `src/domain/entities/appointment/self-service.ts` (funciones
puras que reciben `now`):

- `RESCHEDULE_DEADLINE_HOURS = 12`, `MAX_RESCHEDULES = 3`.
- `ACTIVE_STATUSES = ["PENDING", "CONFIRMED"]` (los que se pueden cancelar o
  mover; `CONFIRMED` ya contemplado para la feature de confirmar).
- `hasStarted(scheduledAt, now)` y `rescheduleBlockedBy(appointment, now):
  "DEADLINE" | "LIMIT" | null`.
- 12 horas es una duración absoluta entre instantes: no necesita
  `clinic-time.ts`. Las horas que se muestran y la hora nueva sí (abajo).

**Query** — `src/application/queries/appointment/get-managed-appointment.query.ts`
+ `src/infrastructure/postgres/queries/appointment/get-managed-appointment.query.ts`.
Recibe el token; devuelve `null` si no existe o la cita ya empezó. Respuesta
(todo lo que la página necesita y nada más):

```ts
interface ManagedAppointment {
  status: "PENDING" | "CONFIRMED" | "CANCELLED";
  patientFirstName: string;          // sólo el nombre de pila
  specialty: string;
  doctorName: string;                // nombre y apellido; el tratamiento lo pone platform
  clinicName: string;
  clinicAddress: string;
  clinicId: string;                  // para "Reservar otro horario"
  doctorProfileId: string;           // para pedir los huecos
  date: string;                      // "YYYY-MM-DD", hora de pared (toWallTime)
  time: string;                      // "HH:mm"
  durationMinutes: number;
  canCancel: boolean;
  rescheduleBlockedBy: "DEADLINE" | "LIMIT" | null;
}
```

`canCancel` es `status ∈ ACTIVE_STATUSES` (la cita no ha empezado, o no
habría respuesta). Se puede reprogramar si `canCancel` y
`rescheduleBlockedBy === null`.

**Casos de uso** — `src/application/use-cases/appointment/`:

- `cancel-appointment-by-token.usecase.ts`:
  `cancelAppointmentByTokenSchema` + `CancelAppointmentByTokenUseCase`.
  1. Resuelve el token → cita (404 si no hay o ya empezó).
  2. Si ya está `CANCELLED`, devuelve sin escribir ni enviar correos
     (idempotente: un doble toque no es un error).
  3. `updateMany({ where: { id, status: { in: ACTIVE_STATUSES }, scheduledAt:
     { gt: now } }, data: { status: "CANCELLED", cancelledAt: now } })`. Si
     `count === 0`, relee y responde según el estado nuevo (cancelada por otra
     petición → éxito sin correo; empezó → 404).
  4. Correos (7.5). Un fallo de envío se loguea con ids y no revierte nada,
     igual que en `create-appointment`.
- `reschedule-appointment-by-token.usecase.ts`:
  `rescheduleAppointmentByTokenSchema` (`{ scheduledAt }` con el mismo schema
  de hora de pared que `createAppointmentSchema`: el engineer lo exporta y lo
  reutiliza) + `RescheduleAppointmentByTokenUseCase`.
  1. Resuelve el token → cita (404).
  2. `CANCELLED` → 409 "Esta cita está cancelada. Puedes reservar una nueva."
  3. `rescheduleBlockedBy === "DEADLINE"` → 409 "Ya no se puede reprogramar
     porque faltan menos de 12 horas para tu cita. Si no puedes asistir,
     cancélala y reserva otro horario." `"LIMIT"` → 409 con el texto de D1.
  4. Valida la hora como `assertSlotIsOffered`, con el `doctorProfileId`
     **de la cita**, no del cliente. El engineer decide si la duplica como
     método privado (son 6 líneas) o la mueve a un sitio compartido.
  5. En transacción: `updateMany({ where: { id, status: { in:
     ACTIVE_STATUSES }, scheduledAt: <hora leída en 1>, rescheduleCount: { lt:
     MAX_RESCHEDULES } }, data: { scheduledAt: toInstant(date, time),
     rescheduleCount: { increment: 1 } } })`. `count === 0` → 409 "Tu cita
     cambió mientras elegías el horario. Recarga la página."
  6. Hueco no ofrecido (paso 4) o P2002 (paso 5) → 409 con un texto propio
     de la reprogramación, `RESCHEDULE_SLOT_TAKEN`: "Otro paciente acaba de
     tomar ese horario. Elige otro." No se reutiliza `SLOT_UNAVAILABLE` ("Vuelve
     atrás y elige otro"), que está escrito para el wizard.
  7. Correos (7.5), con el token recibido para el enlace.

**Rutas** — `src/routes/appointment/index.ts` (prefijo `/appointment` ya
registrado en `server.ts`):

| Método y ruta | Policy | Entrada | Respuesta |
| --- | --- | --- | --- |
| `GET /appointment/manage/:token` | `policy({ public: true })` | params `{ token }` (regex base64url de 43) | 200 `ManagedAppointment`; 404 "Este enlace ya no está disponible." |
| `POST /appointment/manage/:token/cancel` | `policy({ public: true })` | params | 200 `ManagedAppointment` actualizado; 404 |
| `POST /appointment/manage/:token/reschedule` | `policy({ public: true })` | params + body `{ scheduledAt }` | 200 `ManagedAppointment`; 404, 409, 422 |

- Sin `requireFeature`: `PRODUCT.md` incluye la autogestión en todos los
  planes, también Gratis.
- `schemaErrorFormatter` como en `POST /appointment`: el paciente ve el texto.
- Mapeo de errores como en `POST /appointment` (`ApplicationError` → su
  código, resto → 500 genérico logueando sólo `errName`/`errCode`), con P2002
  → 409 `RESCHEDULE_SLOT_TAKEN` en la reprogramación.

**`server.ts`** — `requestSerializer` también tapa el token:
`/(\/appointment\/manage\/)[A-Za-z0-9_-]{43}/` → `$1[token]`, junto al de
invitaciones.

**`create-appointment.usecase.ts`** — dentro de la transacción, emite el token
(`issue`) y pasa `manageUrl = ${FRONTEND_URL}/appointment/${token}` al correo.
No devuelve el token en la respuesta HTTP (ver 8, "Quién recibe el enlace").

### 7.4 platform

| Archivo | Cambio |
| --- | --- |
| `src/middleware.ts` | Patrón público `^/appointment/[^/]+$` |
| `src/lib/api/appointments/index.ts` (nuevo; la carpeta ya tiene `types.ts`) | `appointmentsApi.getManaged(token)` con `cache: "no-store"`; 404 → `null` |
| `src/lib/api/appointments/types.ts` | `ManagedAppointment` |
| `src/lib/actions/appointment/cancel-appointment.action.ts` | `"use server"`, sin `getSession` (público, como `create-appointment.action.ts`); devuelve `ActionState` con la cita actualizada |
| `src/lib/actions/appointment/reschedule-appointment.action.ts` | Igual; valida `scheduledAt` con Zod antes de llamar |
| `src/app/(patient-facing)/appointment/[token]/page.tsx` | Server component: pide la cita; `null` → `notFound()` |
| `.../[token]/loading.tsx`, `error.tsx`, `not-found.tsx` | `LoadingState`, `ErrorState`, tarjeta "Este enlace ya no está disponible" |
| `src/app/(patient-facing)/layout.tsx` (el grupo existe vacío) | Cabecera y pie del booking, `robots: noindex`, `referrer: no-referrer` |
| `src/components/common/patient-facing-shell.tsx` (nuevo) | Cabecera con logo y pie que hoy están en `create-appointment/layout.tsx`; lo usan los dos layouts |
| `src/components/appointment/manage-appointment.tsx` (nuevo, cliente) | Pantallas de la sección 10 |
| `src/components/appointment/appointment-summary.tsx` (nuevo) | Recuadro del resumen, usado en 5 de los estados |
| `src/components/booking/datetime-step.tsx` y `src/components/booking/week.ts` | **Movidos** desde `create-appointment/steps/` y `create-appointment/lib/`, sin cambios; el wizard importa desde aquí |

La fecha que se muestra se formatea en platform a partir de `date`/`time` de
pared (con `timeZone: "UTC"` sobre `${date}T00:00:00Z`, como hace `week.ts`):
nunca a partir de un instante con la zona del navegador ni del servidor.

### 7.5 Correos

| Correo | Plantilla | Destinatario | Cuándo |
| --- | --- | --- | --- |
| Confirmación | `confirm-appointment.mjml` (editada) | `patient.email` de la ficha (#51) | Al reservar |
| Cita cancelada | `appointment-cancelled.mjml` (nueva) | `patient.email` | Al cancelar |
| Cita reprogramada | `appointment-rescheduled.mjml` (nueva) | `patient.email` | Al reprogramar |
| Aviso al médico | `doctor-appointment-changed.mjml` (nueva, un solo archivo con `{{#if}}` cancelada/reprogramada) | `User.email` del médico de la cita (D2) | Al cancelar o reprogramar |

- `confirm-appointment.mjml`: el párrafo "Si necesitas cancelar o
  reprogramar, comunícate con la clínica al {{clinicPhone}}…" pasa a: botón
  "Cancelar o reprogramar" → `{{manageUrl}}` y la línea "Puedes cancelar hasta
  la hora de tu cita y reprogramar hasta 12 horas antes. No compartas este
  enlace: da acceso a tu cita."
- Fechas formateadas con `CLINIC_TIME_ZONE`, como hoy.
- El aviso al médico lleva nombre y apellido del paciente, fecha (anterior y
  nueva si se reprogramó), especialidad y sede. Ni documento ni teléfono ni el
  enlace del paciente.
- `template-renderer.ts`: los tres nombres nuevos en `EmailTemplate` y sus
  variables tipadas; `confirm-appointment` gana `manageUrl`. Handlebars
  escapa: no usar `{{{ }}}`.
- Asuntos: "Tu cita en {sede} fue cancelada", "Tu cita en {sede} cambió de
  horario", "{Paciente} canceló su cita del {fecha}" / "{Paciente}
  reprogramó su cita".

### 7.6 Por qué cada componente nuevo

- `ManageAppointment`: la pantalla en sí; no hay otra parecida.
- `AppointmentSummary`: el recuadro de resumen se repite en 5 estados de esta
  pantalla (y ya está copiado a mano en `patient-step` y `success-step`, que
  no se tocan).
- `PatientFacingShell`: dos layouts públicos con la misma cabecera y pie.
- `DateTimeStep` no es nuevo: se mueve para tener dos consumidores sin
  importar entre carpetas de rutas.

## 8. Aislamiento, privacidad y seguridad

**Ids que recibe cada endpoint público y cómo se relacionan.** Sólo el token.
El token resuelve una cita; `clinicId`, `doctorProfileId`, cuenta y paciente
salen de esa fila. El cuerpo de la reprogramación sólo trae `scheduledAt`, y la
hora se valida contra los huecos del médico **de la cita**. No hay ningún id
del cliente que se pueda mezclar, así que no puede tocarse una cita de otra
cuenta ni de otro paciente.

**Qué no revela.** La respuesta no incluye apellido, documento, teléfono,
correo, fecha de nacimiento ni nada de la ficha clínica; tampoco el id de la
cita ni el de la ficha. Token desconocido, cita ya empezada y token mal formado
dan el mismo 404 con el mismo texto.

**Quién recibe el enlace.** Sólo el correo de la ficha (#51). No se devuelve
en la respuesta de `POST /appointment` ni se muestra en la pantalla de éxito:
quien reserva con el documento de otra persona que ya tiene ficha obtendría un
enlace que muestra el nombre de esa ficha. Consecuencia aceptada: si la ficha
ya existía con otro correo, quien reservó no recibe el enlace (igual que hoy
no recibe la confirmación).

**Fugas del enlace.**

- Logs del api: el `requestSerializer` tapa el token. No se loguea el token ni
  datos del paciente en ningún caso de uso; sólo `appointmentId`.
- `Referrer-Policy: no-referrer` y `robots: noindex, nofollow` en el layout de
  `(patient-facing)`. La página no carga recursos de terceros.
- `Cache-Control: private, no-store` en las tres respuestas del api y en la
  página (`dynamic = "force-dynamic"`).
- Logs de acceso del hosting de platform: la URL de la página lleva el token.
  Riesgo aceptado (igual que las invitaciones); expira con la cita.

**Abuso.**

- Adivinar tokens: 256 bits; inviable sin límite de peticiones.
- Cancelar es terminal e idempotente: un segundo intento no envía correos.
- Reprogramar: tope de 3 por cita (D1), comprobado también en el `where` del
  `updateMany` para que dos peticiones simultáneas no lo superen.
- No se añade límite por IP: exige instalar `@fastify/rate-limit` (requiere
  confirmación del humano) y que platform reenvíe la IP real (hoy el api ve la
  IP del servidor de Next; lo resuelve el P5 de `aviso-privacidad-booking`).
  Queda como mejora si aparece abuso.

**Carreras.**

| Caso | Resolución |
| --- | --- |
| Dos reprogramaciones de la misma cita a la vez | `updateMany` condicionado a la `scheduledAt` leída: gana una; la otra 409 "Tu cita cambió…" |
| Reprogramación contra una reserva nueva al mismo hueco | Índice único parcial: gana una; la otra 409 (`RESCHEDULE_SLOT_TAKEN` o `SLOT_UNAVAILABLE` según quién pierda) |
| Cancelar y reprogramar a la vez | Las dos condicionan `status IN ACTIVE_STATUSES`; la que llega segunda no escribe |
| Cancelar justo en la hora de inicio | El `where` exige `scheduledAt > now`: si ya empezó, 404 |
| Reservar un hueco recién cancelado | Libre en `GetDoctorSlotsQuery` (ya) y en el índice (nuevo) |

**Datos de salud en el correo al médico.** Nombre del paciente y
especialidad, a la dirección del propio médico: los mismos que ya ve en el
panel.

## 9. Reglas que valida el servidor

- Cancelar: `status ∈ ACTIVE_STATUSES` y `now < scheduledAt`. Nada más.
- Reprogramar: `status ∈ ACTIVE_STATUSES`, `scheduledAt − now ≥ 12 h`
  (sobre la hora **actual** de la cita), `rescheduleCount < 3` y la hora
  nueva está entre los huecos que `GetDoctorSlotsQuery` ofrece hoy para ese
  médico y a no más de `MAX_DAYS_AHEAD`. La hora nueva puede estar a menos de
  12 h: el plazo es para mover la cita existente, no para elegir la nueva.
- `canCancel` y `rescheduleBlockedBy` los calcula el api; platform no repite
  la regla.

## 10. UI

La maqueta (`mockup.html`) es la referencia visual y de textos. Se abre en un
navegador; la barra izquierda elige escenario (cita en 7 días, hoy en menos de
12 h, tope de reprogramaciones, ya cancelada, enlace no disponible, error de
carga), simula el resultado de confirmar el cambio (bien, horario tomado,
carrera) y salta a cualquier pantalla. El flujo empieza en el correo: su botón
abre el enlace.

### Ruta y layout

- `/appointment/[token]` en `src/app/(patient-facing)/appointment/[token]/`.
- Layout `(patient-facing)/layout.tsx` con `PatientFacingShell`: mismo fondo
  degradado, logo arriba a la izquierda y pie que el booking. Tarjeta
  centrada `max-w-md`, `Card` con `p-6` en móvil y `p-8` desde `sm`.
- Mobile-first: casi todos los pacientes llegan desde el correo en el
  celular.

### Árbol

```
(patient-facing)/layout.tsx
└─ PatientFacingShell                       components/common/patient-facing-shell.tsx (nuevo)
   └─ appointment/[token]/page.tsx          getManaged(token) → ManagedAppointment | notFound()
      └─ Card (components/ui/card.tsx)
         └─ ManageAppointment                components/appointment/manage-appointment.tsx (nuevo)
            props: { token: string; appointment: ManagedAppointment }
            ├─ AppointmentSummary            components/appointment/appointment-summary.tsx (nuevo)
            │   props: { specialty; doctorName; date; time; durationMinutes; clinicName; clinicAddress; muted?: boolean }
            ├─ Button (components/ui/button.tsx)  variants default / outline / coral
            ├─ Badge (components/ui/badge.tsx)    "Pendiente" / "Cancelada"
            └─ DateTimeStep                  components/booking/datetime-step.tsx (movido)
                props existentes: { doctorProfileId; onNext; onBack }
```

`ManageAppointment` es una máquina de pantallas con `useState`:
`summary → confirm-cancel → cancelled` y
`summary → pick-slot → confirm-reschedule → rescheduled`.

### Qué dato alimenta cada parte

| Parte | Dato |
| --- | --- |
| Saludo "Hola, Rosa" | `patientFirstName` |
| Badge de estado | `status` |
| Resumen | `specialty`, `doctorName`, `date`, `time`, `durationMinutes`, `clinicName`, `clinicAddress` (con "Hora de Lima") |
| Botón Reprogramar habilitado / nota | `rescheduleBlockedBy` |
| "Tu cita actual" en el selector | `date`, `time` |
| Huecos | `getDoctorSlotsAction(doctorProfileId, from, to)` (existente) |
| "Reservar otro horario" | `/clinic/${clinicId}/create-appointment` |

### Estados

| Estado | Qué se ve |
| --- | --- |
| Normal (>12 h) | Badge "Pendiente", resumen, "Reprogramar" (default) y "Cancelar cita" (outline) |
| Menos de 12 h | "Reprogramar" deshabilitado y debajo: "Ya no se puede reprogramar porque faltan menos de 12 horas para tu cita. Si no puedes asistir, cancélala y reserva otro horario." "Cancelar cita" activo |
| Tope alcanzado (D1) | Igual que el anterior con el texto de D1 |
| Confirmar cancelación | "¿Cancelar tu cita?" + resumen atenuado + "Volver" (outline) / "Sí, cancelar" (coral). Igual a cualquier antelación |
| Cancelada (recién o al volver al enlace) | Ícono, "Tu cita está cancelada", resumen atenuado, "El horario quedó libre para otro paciente." y "Reservar otro horario" |
| Elegir horario | Recuadro "Tu cita actual: Jueves 15 de octubre, 10:00", `DateTimeStep` tal cual y debajo "¿No encuentras un horario? Puedes cancelar tu cita y reservar más adelante." |
| Confirmar cambio | "Antes" tachado / "Ahora" destacado, "Elegir otro" / "Confirmar cambio" |
| Reprogramada | Ícono verde, "Listo, tu cita cambió", resumen nuevo, "Te enviamos los detalles por correo. Este mismo enlace sigue sirviendo para tu nueva cita." |
| Horario tomado (409) | Vuelve a "Elegir horario" con el día elegido, el error en rojo arriba ("Otro paciente acaba de tomar ese horario. Elige otro.") y los huecos recargados sin el tomado |
| La cita cambió (409 de carrera) | "Tu cita cambió mientras elegías" y "Recargar" (`router.refresh()`) |
| Carga | `loading.tsx` con `LoadingState label="Cargando tu cita..."`; botones con spinner y deshabilitados mientras la action corre |
| Enlace no disponible (404: inválido, expirado o cita ya pasada) | `not-found.tsx`: "Este enlace ya no está disponible" + "Puede que tu cita ya haya pasado o que el enlace esté incompleto. Revisa que lo hayas abierto desde el último correo que te enviamos." Sin botón (no sabemos la sede) |
| Error de carga (500 / api caído) | `error.tsx` con `ErrorState` ("No pudimos cargar tu cita. Vuelve a intentarlo.") y "Reintentar" |
| Vacío | No aplica a la cita; en "Elegir horario" lo cubre `DateTimeStep` ("El doctor no tiene horarios disponibles ese día") |
| 403 | No aplica: no hay sesión ni roles; cualquier token inválido es 404 |
| 402 | No aplica: la autogestión está en todos los planes |

### Interacciones

- **Cancelar cita** → pantalla de confirmación (no modal: en 375 px un paso
  dentro de la tarjeta es más claro y no atrapa el foco).
- **Sí, cancelar** → `cancelAppointmentAction(token)`. Éxito: pantalla
  "Cancelada" con los datos devueltos y `toast.success("Tu cita fue
  cancelada")`. Error: `toast.error(message)`; si es 404, `router.refresh()`
  (cae en `not-found`).
- **Reprogramar** → "Elegir horario". "Atrás" del `DateTimeStep` vuelve al
  resumen; "Siguiente" pasa a "Confirmar cambio".
- **Confirmar cambio** → `rescheduleAppointmentAction(token, "YYYY-MM-DDTHH:mm")`.
  Éxito: pantalla "Reprogramada" y `toast.success("Tu cita cambió de
  horario")`. 409 hueco: vuelve a elegir con el mensaje. 409 plazo/tope:
  `router.refresh()` (el resumen ya muestra el motivo). 409 carrera: pantalla
  "La cita cambió".
- **Reservar otro horario** → enlace a `/clinic/${clinicId}/create-appointment`.
- Validación en cliente: ninguna más allá de que haya hueco elegido (el
  botón "Siguiente" ya se deshabilita sin él).

### Roles

El paciente no tiene rol. El panel no cambia: ADMIN, DOCTOR y USER siguen
viendo "Cancelada" donde ya ven las citas. Ninguno tiene acciones nuevas.

### Accesibilidad

- Cada pantalla tiene un `h1` único; al cambiar de pantalla, el foco va a ese
  `h1` (`tabIndex={-1}` + `focus()`), para que un lector de pantalla anuncie el
  cambio.
- Mensajes de error con `role="alert"`; la nota de reprogramación bloqueada
  con `aria-describedby` en el botón.
- Botón deshabilitado con `disabled` real y su motivo visible como texto, no
  sólo en un tooltip.
- Orden de tabulación: acción principal primero en el resumen (Reprogramar,
  Cancelar); en confirmaciones, "Volver" antes que la acción destructiva para
  que un Enter accidental no cancele.
- Días del selector con `aria-label` de fecha completa ("viernes 16 de
  octubre") y `aria-pressed` en día y hora elegidos.
- Tamaño táctil: botones de 44 px de alto a ancho completo en móvil.
- Fechas en texto completo ("Jueves 15 de octubre, 10:00"), no sólo números.

## 11. Verificación

- `pnpm typecheck` y `pnpm check` en `api/` y `platform/`.
- Migración: `pnpm prisma:migrate` → revisar el SQL (índice parcial, sin
  `DROP` de datos) → aplicar en local → un segundo `pnpm prisma:migrate` no
  genera nada.
- Peticiones manuales (api local, correo `memory` o logs):
  1. `POST /appointment` → el correo capturado trae `manageUrl`; la fila de
     `appointment_access_token` guarda un hash de 64 hex, no el token.
  2. `GET /appointment/manage/<token>` → 200 sin apellido, documento, teléfono
     ni correo. Con un token alterado → 404 con el mismo cuerpo que uno
     inexistente.
  3. `POST …/reschedule` a un hueco ofrecido → 200; `GET …/slots` ya no
     ofrece el nuevo y vuelve a ofrecer el anterior.
  4. Dos `POST …/reschedule` en paralelo (`curl … & curl …`) → uno 200, otro
     409.
  5. Tres reprogramaciones → la cuarta 409 con el texto de D1.
  6. `POST …/cancel` → 200 y `cancelled_at` lleno; repetir → 200 sin correo
     nuevo; `POST /appointment` al mismo hueco con otro paciente → 200 (hoy
     daría 409).
  7. Cita a menos de 12 h (un hueco de hoy por la tarde): reprogramar → 409;
     cancelar → 200, igual que con más antelación.
  8. Log del api: la URL aparece como `/appointment/manage/[token]`.
- `docs/PRODUCT.md` y `docs/capacidades.md` sin menciones a la cancelación
  tardía (`grep -i tardía`).
- Navegador a 375 px: los estados de la sección 10 contra la maqueta.
- e2e (lo detalla el product-manager): reservar → abrir el enlace del correo
  capturado → reprogramar → cancelar → reservar el hueco liberado.

## 12. Riesgos

- **Índice parcial fuera del schema de Prisma**: si Prisma no lo modela, una
  migración futura podría proponer borrarlo y nadie lo notaría hasta que
  aparezcan citas dobles. Mitigación en 7.1.
- **Correo de la ficha distinto al escrito** (#51): ese paciente no recibe el
  enlace y sigue llamando al consultorio.
- **Sin límite por IP**: aceptable con tokens de 256 bits y tope de
  reprogramaciones; se revisa cuando exista el reenvío de IP.
- **Conflicto de archivos con `aviso-privacidad-booking`** (sección 5).
- **Citas anteriores al release** no tienen enlace: su autogestión no existe.
  No se generan tokens retroactivos (no hay a qué correo enviarlos sin
  reenviar confirmaciones).

## 13. Criterios de aceptación

Escritos por el product-manager el 8 de octubre de 2026 sobre el plan y la
maqueta aprobados. Los marcados **[e2e]** los cubre el e2e-tester con
Playwright y el correo en memoria; el resto se verifica con petición manual,
revisión o navegador.

Notas para el e2e-tester:

- "El enlace" es el que trae el botón "Cancelar o reprogramar" del correo de
  confirmación capturado; nunca se lee de la base ni de una respuesta HTTP.
- Las situaciones que dependen del reloj (cita a menos de 12 h, cita ya
  empezada o pasada) se preparan moviendo con Prisma la hora de una cita ya
  reservada; los huecos, con `seedFullDayAvailability`.
- Las cuentas de prueba son Gratis: todo lo de esta sección debe funcionar en
  ese plan.
- "Mismo 404" significa mismo código y mismo cuerpo, byte a byte.

### Llegar al enlace

- **CA-1 [e2e]** Al reservar desde el booking público, el correo de
  confirmación que recibe el paciente trae el botón "Cancelar o reprogramar" y
  el texto "Puedes cancelar hasta la hora de tu cita y reprogramar hasta 12
  horas antes. No compartas este enlace: da acceso a tu cita." Ya no aparece el
  párrafo "comunícate con la clínica" ni una referencia vacía.
- **CA-2 [e2e]** Abrir el enlace del correo en un celular (viewport de 375 px),
  sin sesión, muestra la cita: saludo "Hola, {nombre de pila}", badge
  "Pendiente", especialidad, médico, fecha en texto completo ("Jueves 15 de
  octubre, 10:00"), duración, sede y dirección, y los botones "Reprogramar" y
  "Cancelar cita". No pide iniciar sesión ni redirige al login.
- **CA-3 [e2e]** La fecha y la hora que muestran la página y los correos son
  las de la reserva en hora de Lima, aunque el navegador esté en otra zona
  horaria (p. ej. `timezoneId: "Asia/Tokyo"`).
- **CA-4 [e2e]** El enlace sólo llega al correo de la ficha del paciente. La
  respuesta de `POST /appointment` no contiene el token ni una URL de
  `/appointment/…`, y la pantalla "¡Cita reservada!" no muestra ni enlaza a
  la página de autogestión.
- **CA-5 [e2e]** Si el paciente ya tenía ficha con otro correo y reserva
  escribiendo uno distinto, el enlace llega sólo al correo de la ficha; el
  correo escrito no recibe nada.

### Privacidad

- **CA-6 [e2e]** `GET /appointment/manage/:token` responde sólo con: estado,
  nombre de pila, especialidad, nombre del médico, sede, dirección, id de la
  sede, id del perfil del médico, fecha, hora, duración y los indicadores de
  cancelar y reprogramar. No incluye apellidos, documento, teléfono, correo,
  fecha de nacimiento, id de la cita ni id de la ficha. Lo mismo vale para las
  respuestas de cancelar y reprogramar.
- **CA-7 [e2e]** El HTML de la página del enlace (incluido lo que Next envía
  para hidratar) no contiene el apellido, el documento, el teléfono ni el
  correo del paciente.
- **CA-8 [e2e]** Las tres respuestas del api llevan `Cache-Control` con
  `no-store`; la página declara `robots` `noindex, nofollow` y
  `referrer` `no-referrer`.
- **CA-9** La base no guarda el token en claro: con una copia de la base no se
  puede reconstruir el enlace. Los logs del api muestran la ruta como
  `/appointment/manage/[token]` y ningún caso de uso registra el token ni datos
  del paciente.

### Enlace no disponible

- **CA-10 [e2e]** Un token inexistente, un token con un carácter cambiado, un
  token mal formado (corto, largo o con caracteres no válidos), el token de una
  cita que ya empezó y el de una cita cancelada que ya pasó responden el mismo
  404 en `GET`, `cancel` y `reschedule`, con el mensaje "Este enlace ya no está
  disponible." y sin ningún dato de la cita.
- **CA-11 [e2e]** En el navegador, esos mismos casos muestran "Este enlace ya
  no está disponible" y "Puede que tu cita ya haya pasado o que el enlace esté
  incompleto…", sin botones de acción ni datos de la cita.

### Cancelar

- **CA-12 [e2e]** "Cancelar cita" lleva a "¿Cancelar tu cita?" con el resumen
  atenuado. "Volver" regresa al resumen sin cancelar (la cita sigue
  "Pendiente" al recargar). "Sí, cancelar" muestra "Tu cita está cancelada",
  "El horario quedó libre para otro paciente." y "Reservar otro horario".
- **CA-13 [e2e]** Cancelar funciona igual con días de antelación que a menos
  de 12 h de la cita (incluso minutos antes): misma pantalla, mismo estado
  "Cancelada", sin aviso ni etiqueta de cancelación tardía en la página, en los
  correos ni en el panel.
- **CA-14 [e2e]** Volver a abrir el enlace de una cita cancelada (antes de su
  hora) muestra "Tu cita está cancelada" y "Reservar otro horario", sin
  "Reprogramar" ni "Cancelar cita". "Reservar otro horario" lleva al booking
  público de la misma sede.
- **CA-15 [e2e]** Cancelar dos veces (doble toque o `POST …/cancel` repetido)
  responde 200 las dos veces con la cita cancelada, y sólo la primera envía
  correos.
- **CA-16 [e2e]** Tras cancelar, el horario vuelve a aparecer en el booking
  público y otro paciente lo reserva con éxito (200 en `POST /appointment`, sin
  409), tanto por la API como completando el wizard en el navegador.
- **CA-17 [e2e]** Reprogramar una cita cancelada por API responde 409 "Esta
  cita está cancelada. Puedes reservar una nueva." y no la cambia.

### Reprogramar

- **CA-18 [e2e]** Con más de 12 h de antelación, "Reprogramar" muestra "Tu cita
  actual: {fecha}, {hora}" y el mismo selector de día y hora del booking, con
  los huecos reales del mismo médico: no aparecen la hora actual de la cita ni
  horarios ocupados por otras citas. Al elegir uno, "¿Cambiar tu cita a este
  horario?" muestra el antes tachado y el ahora; "Elegir otro" vuelve al
  selector; "Confirmar cambio" muestra "Listo, tu cita cambió" con el resumen
  nuevo.
- **CA-19 [e2e]** Después de reprogramar, el horario anterior vuelve a estar
  disponible en el booking y el nuevo deja de estarlo. El mismo enlace sigue
  abriendo la cita, ya con la hora nueva.
- **CA-20 [e2e]** El horario nuevo puede estar a menos de 12 h: el plazo se
  mide sobre la hora actual de la cita, no sobre la elegida.
- **CA-21 [e2e]** A menos de 12 h de la cita, "Reprogramar" aparece
  deshabilitado y debajo, como texto visible: "Ya no se puede reprogramar
  porque faltan menos de 12 horas para tu cita. Si no puedes asistir,
  cancélala y reserva otro horario." "Cancelar cita" sigue activo.
  `POST …/reschedule` responde 409 con ese mismo mensaje y no mueve la cita.
- **CA-22 [e2e]** Una cita se puede reprogramar 3 veces. Después,
  "Reprogramar" aparece deshabilitado con "Ya reprogramaste esta cita 3 veces.
  Si necesitas otro horario, cancélala y reserva de nuevo.", y un cuarto
  `POST …/reschedule` responde 409 con ese mensaje sin mover la cita. Cancelar
  sigue disponible.
- **CA-23 [e2e]** `POST …/reschedule` sólo mueve la cita a un hueco que el
  booking ofrece hoy para el médico de la cita. Una hora fuera de su
  disponibilidad, más allá del rango que ofrece el booking, en el pasado o de
  otro médico responde 409 sin cambios; un cuerpo con otro `doctorProfileId`,
  `clinicId` o `specialtyId` no cambia ni el médico, ni la sede, ni la
  especialidad. Un `scheduledAt` mal formado responde 4xx sin cambios.
- **CA-24 [e2e]** Si mientras el paciente elige otro paciente reserva ese
  horario, al confirmar vuelve al selector con el día elegido, el mensaje en
  rojo "Otro paciente acaba de tomar ese horario…" y los huecos recargados sin
  el tomado; la cita conserva su hora anterior.
- **CA-25 [e2e]** Si la cita cambia mientras el paciente elige (p. ej. la
  reprogramó desde otra pestaña), al confirmar se ve "Tu cita cambió mientras
  elegías" con "Recargar", y al recargar la página muestra la cita como quedó.

### Carreras

- **CA-26 [e2e]** Dos `POST …/reschedule` simultáneos de la misma cita (a
  horarios distintos) dejan una respuesta 200 y otra 409; la cita queda en uno
  solo de los dos horarios y el contador sube una sola vez. Con la cita en su
  segunda reprogramación, dos simultáneas no dejan pasar una cuarta.
- **CA-27 [e2e]** Una reprogramación y una reserva nueva simultáneas al mismo
  horario del mismo médico dejan exactamente una cita activa en ese horario;
  la que pierde responde 409 y no crea ni mueve nada.
- **CA-28 [e2e]** Un cancelar y un reprogramar simultáneos de la misma cita
  la dejan cancelada, y ni su horario anterior ni el pedido quedan ocupados.

### Correos

- **CA-29 [e2e]** Al cancelar, el paciente recibe en el correo de su ficha
  "Tu cita en {sede} fue cancelada" con los datos de la cita.
- **CA-30 [e2e]** Al reprogramar, el paciente recibe "Tu cita en {sede}
  cambió de horario" con la fecha nueva y el botón al mismo enlace, que sigue
  funcionando.
- **CA-31 [e2e]** Al cancelar o reprogramar, el médico de la cita recibe un
  aviso en su correo de usuario ("{Paciente} canceló su cita del {fecha}" /
  "{Paciente} reprogramó su cita") con nombre y apellido del paciente, fecha
  (anterior y nueva si se reprogramó), especialidad y sede. No incluye
  documento, teléfono, correo del paciente ni el enlace de autogestión.
- **CA-32 [e2e]** Ni los ADMIN de la sede ni otros médicos reciben ese aviso.
  Una petición rechazada (404, 409, 4xx) no envía ningún correo.
- **CA-33** Si el envío de un correo falla, la cancelación o reprogramación
  igual queda hecha y el paciente ve la pantalla de éxito.

### Panel del médico

- **CA-34 [e2e]** Tras cancelar, la agenda del día y la ficha del paciente
  muestran la cita como "Cancelada"; ADMIN, DOCTOR y USER entran al panel sin
  errores y no tienen acciones nuevas.
- **CA-35 [e2e]** Tras reprogramar, la agenda y la ficha muestran una sola
  cita, en la hora nueva: no aparece una cita duplicada ni una cancelada por la
  hora anterior.

### Documentos

- **CA-36** `docs/PRODUCT.md` y `docs/capacidades.md` ya no mencionan la
  cancelación tardía, y "Estado" ya no lista la autogestión por link ni la
  política de cancelación como inexistentes.
