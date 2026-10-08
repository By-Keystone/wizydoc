# fix-booking-email-send

Rama `fix/booking-email-send`, desde `origin/main`. Parte de
`fix-public-booking-scope` (decisión 4, aprobada con su recomendación).

## Objetivo

Que un fallo al enviar el correo de confirmación no convierta en 500 una cita
que ya se creó, y que los errores de `POST /appointment` no lleven datos del
paciente a los logs.

## Hallazgo (contra `main` en 9b9250e)

En `create-appointment.usecase.ts`, `renderTemplate` y `emailService.send` van
con `await` después de `appointment.create`, sin transacción ni `try/catch`. Si
SES rechaza la dirección o la plantilla falla:

- la cita y el paciente ya existen, pero el paciente ve 500 "Ocurrio un error al
  crear cita";
- al reintentar recibe 409 "Ese horario ya no está disponible": cree que no
  reservó y el hueco está ocupado por su propia cita;
- la ruta hace `console.error("...", error)` con el error completo; un error de
  Prisma puede incluir los argumentos de la consulta (nombre, documento,
  teléfono).

## Invariantes

1. Si la cita se creó, `POST /appointment` responde 200 con el mismo cuerpo que
   hoy (`{ message: "Cita creada con éxito" }`), salga o no el correo.
2. Un fallo del correo se registra sólo con `{ appointmentId, errName, errCode }`.
3. Los errores no controlados de la ruta se registran sólo con
   `{ errName, errCode }`.

## Cambios por capa

**Prisma:** ninguno. Sin migración. **platform:** ninguno (el paciente ya ve la
pantalla de éxito con un 200).

### api

`api/src/application/use-cases/appointment/create-appointment.usecase.ts`

- `try/catch` alrededor de `renderTemplate` + `send` (hoy líneas 113-128). El
  cálculo de `scheduledAt` (105-111) queda fuera: no lanza.
  ```ts
  } catch (error) {
    // La cita ya existe: un 500 haría que el paciente reintente y choque con su propia reserva.
    const errName = error instanceof Error ? error.name : "UnknownError";
    const errCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
    console.error({ appointmentId: appointment.id, errName, errCode }, "[create-appointment-email]");
  }
  ```
  `console.error` y no `request.log`: el caso de uso no recibe logger y ya hay
  precedente con el mismo formato en `organization.repository.ts`. Inyectar un
  logger por `Props` sería una indirección con un solo consumidor.

`api/src/routes/appointment/index.ts`

- La política no cambia: `policy({ public: true })`.
- `console.error("Ocurrio un error al crear appointment", error)` →
  ```ts
  const errName = error instanceof Error ? error.name : "UnknownError";
  const errCode = error && typeof error === "object" && "code" in error ? error.code : undefined;
  request.log.error({ errName, errCode }, "[create-appointment]");
  ```
  Igual que `[invite-user]` en `routes/user/index.ts` (resultado de
  `fix-invite-email-send`). El 409 por P2002 y el mapeo de `ApplicationError`
  no cambian.

### Archivos

| Acción | Ruta |
| --- | --- |
| Modificar | `api/src/application/use-cases/appointment/create-appointment.usecase.ts` |
| Modificar | `api/src/routes/appointment/index.ts` |

## Diferencia con `fix-invite-email-send`

Allí el envío va **dentro** de la transacción y, si falla, no queda nada: una
invitación sin correo no sirve. Aquí es al revés: la cita es lo que el paciente
pidió y el correo es un aviso. Por eso se registra y se responde 200.

## Aislamiento entre cuentas

Sin cambios: no hay datos nuevos leídos ni escritos. Los logs sólo llevan el id
de la cita y el nombre/código del error.

## Conflictos con los otros dos tickets del mismo plan

Los tres tocan `create-appointment.usecase.ts`. Líneas de `main` (9b9250e):

| Ticket | Líneas que toca |
| --- | --- |
| `booking-scope` | 33-34 (`z.uuid()`), 48-62 (sede, médico y especialidad), constante y método privado nuevos |
| `booking-patient-contact` | 13 (`z.email()`), 66-81 (comentario y `update: {}` del upsert), **126** (`to: patient.email`) |
| `booking-email-send` (este) | 113-128 (`try/catch`) y la ruta |

- `booking-scope` y `booking-patient-contact` tocan bloques separados: merge
  limpio esperado.
- Este ticket y `booking-patient-contact` chocan seguro en la línea 126, que
  queda dentro del `try`. **Propuesta:** mergear este ticket el último, tras
  rebase sobre `main`, y resolver quedándose con el `try/catch` de aquí y
  `to: patient.email` de `booking-patient-contact`. Este ticket no cambia el
  `to` ni nada fuera de 113-128 en el caso de uso, y no reindenta otras líneas.
- La ruta sólo la toca este ticket.

## Riesgos

- **El paciente no recibe confirmación y nadie se entera** salvo por el log.
  Hoy tampoco la recibe (ve un 500). Avisar al consultorio o reintentar el envío
  queda para cuando existan los recordatorios.
- **SES lento:** la respuesta sigue esperando al envío, como hoy. No cambia.

## Verificación

- `cd api && ./node_modules/.bin/tsc --noEmit && pnpm check` (no
  `pnpm typecheck` en el worktree).
- Deben seguir pasando `ui/clinic/public-booking.spec.ts` y
  `ui/booking/public-booking-specialty-scope.spec.ts` (el camino feliz sigue
  enviando el correo).
- **Sin e2e nuevo.** El driver `memory` nunca falla y el api de los e2e arranca
  con un `EMAIL_CAPTURE_FILE` fijo, así que una prueba no puede provocar el
  fallo sin añadir inyección de fallos a la app, cosa que `fix-invite-email-send`
  ya descartó. Para tres líneas de `try/catch` no compensa.
- **Comprobación manual local (recomendada, sin SES):** levantar el api con
  `NODE_ENV=test EMAIL_DRIVER=memory EMAIL_CAPTURE_FILE=/` pasado por la línea
  de comandos (sin editar `.env*`). El `mkdir` de `MemoryEmailService.send` sobre
  `/` falla con `EEXIST`, así que `send` rechaza de verdad. Reservar desde el booking y comprobar:
  - 200 y pantalla de éxito; la cita existe;
  - una línea `[create-appointment-email]` con sólo `appointmentId`, `errName` y `errCode: "EEXIST"`;
  - el api sigue respondiendo.
- Revisión: que `[create-appointment]` no imprime el error completo.

## Criterios de aceptación

Este ticket no tiene e2e nuevo (ver Verificación). Cada criterio indica cómo se
verifica: **[e2e existente]** (suite actual, sin cambios), **[manual]** (la
comprobación manual local con `EMAIL_CAPTURE_FILE=/` descrita arriba) o
**[revisión]** (lectura del diff).

**El paciente reserva aunque el correo falle**

- **CA-1 [manual]** Con el envío de correo fallando, un paciente que reserva
  desde el booking público recibe `200` con `{ "message": "Cita creada con
  éxito" }` y ve la pantalla de éxito, igual que cuando el correo sale.
- **CA-2 [manual]** En ese mismo caso la cita queda creada (aparece en la agenda
  del médico para ese día y hora) y el paciente queda registrado o reutilizado
  como hoy. No se crea ninguna cita ni paciente de más.
- **CA-3 [manual]** Tras el fallo del correo el api sigue respondiendo: una
  segunda reserva en otro horario funciona sin reiniciarlo.
- **CA-4 [manual]** Si el paciente vuelve a enviar la misma reserva (mismo
  médico y hora) recibe `409` "Ese horario ya no está disponible", como hoy; la
  diferencia es que la primera vez ya vio éxito.

**Los logs no llevan datos del paciente**

- **CA-5 [manual]** El fallo del correo deja una sola línea de log con la
  etiqueta `[create-appointment-email]` cuyo objeto contiene únicamente
  `appointmentId`, `errName` y `errCode` (en la prueba manual con
  `EMAIL_CAPTURE_FILE=/`, `errCode: "EEXIST"`). No aparece nombre, documento, teléfono, correo, motivo ni
  el mensaje o la traza del error.
- **CA-6 [revisión]** Un error no controlado de `POST /appointment` (ni `P2002`
  ni `ApplicationError`) se registra con `request.log.error` y la etiqueta
  `[create-appointment]`, con un objeto que contiene únicamente `errName` y
  `errCode`. No queda ningún `console.error` que imprima el error completo en la
  ruta. Sigue respondiendo `500` con "Ocurrio un error al crear cita".
- **CA-7 [revisión]** El `try/catch` del caso de uso envuelve sólo
  `renderTemplate` y `emailService.send`: un fallo en la validación, en el
  upsert del paciente o en `appointment.create` sigue propagándose a la ruta y
  no se responde `200` sin cita.

**Nada más cambia**

- **CA-8 [e2e existente]** `ui/clinic/public-booking.spec.ts` y
  `ui/booking/public-booking-specialty-scope.spec.ts` siguen pasando sin
  modificarlos: en el camino feliz el correo de confirmación se sigue enviando
  con el mismo contenido y destinatario.
- **CA-9 [revisión]** La ruta conserva `policy({ public: true })`, el `409` por
  `P2002` y el mapeo de `ApplicationError` a su `statusCode`. El cuerpo de las
  respuestas no cambia.
- **CA-10 [revisión]** El diff sólo toca los dos archivos de la tabla
  "Archivos": sin migración, sin cambios en `platform/`, sin cambiar el `to` del
  correo ni reindentar líneas fuera de 113-128 del caso de uso.
- **CA-11 [revisión]** `tsc --noEmit` y `pnpm check` limpios en `api/`.

## Observaciones del product manager

Sin resolver; para que el humano decida si alguna merece ticket aparte.

- **Confirmación silenciosa.** Si el correo falla, el paciente ve "Cita creada"
  pero no recibe el resumen (fecha, hora, dirección) y nadie en el consultorio
  se entera salvo leyendo logs. Es mejor que hoy (500 y reintento con 409), pero
  choca con "el médico no coordina nada": si el paciente olvida la hora, acabará
  escribiendo al médico. El plan lo deja para los recordatorios; conviene que el
  ticket de recordatorios recoja explícitamente reintentar las confirmaciones
  fallidas.
- **La pantalla de éxito no es autosuficiente.** Mientras el correo sea la única
  constancia de la cita, valdría la pena revisar que la pantalla de éxito del
  booking muestre médico, sede, fecha y hora para que el paciente pueda
  guardarla (captura) aunque el correo no llegue. No verificado en este ticket;
  es una sugerencia, no un criterio.
