# Plan: tope de citas al mes

**Rama:** `feat/monthly-appointment-cap`, desde `origin/main` (4a41f6f).
**Fecha:** 25 de octubre de 2026
**PRD:** `docs/features/tope-citas-mes/prd.md` (v2, con las decisiones d-12 a d-18). Manda el PRD: este
plan solo baja a cómo se construye. Los ids en minúscula (c-2, t-3, k-4…) son del PRD.
**Mockup:** `docs/features/tope-citas-mes/mockup.html`, aprobado el 26 de octubre de 2026. Arranca con las
decisiones del humano (las recomendaciones de DP-1 a DP-3), y sus interruptores muestran las alternativas
descartadas. Las vistas de la galería están numeradas; este plan las cita como «vista N».
**Depende del PR #126 (primer uso, abierto).** La tarjeta de uso y el link cerrado se diseñaron sobre el
dashboard de ese PR: `BookingLinkStatus`, `FirstSteps`, la regla «un solo coral por pantalla» (G-4 de
`docs/features/primer-uso/plan.md`) y «Copiar link de reservas» solo cuando el link funciona (L-1). La
implementación parte de `main` cuando entre el #126, o se apila sobre su rama. No se implementa sobre el
dashboard de `main` de hoy.

Criterios de aceptación: al final del plan (product-manager, 26 de octubre de 2026).

## Objetivo

Que cada cuenta reciba por el booking como mucho las citas al mes de su plan (Gratis 10, Consultorio 150,
Clínica 600, Red sin tope). Al llegar al tope, el paciente ve un mensaje con el contacto de la sede, y el
ADMIN ve en Inicio cuánto usó y cuántas reservas perdió, con la mejora de plan.

## Decisiones del humano

El humano aprobó el plan y el mockup el 26 de octubre de 2026, con las tres recomendaciones. El PRD cerró
las reglas; estas tres decisiones de producto tocaban reglas ya aprobadas del dashboard o algo que el PRD
dejaba ambiguo.

| # | Pregunta | Opciones | Recomendación | Decisión |
| --- | --- | --- | --- | --- |
| DP-1 | Con el link cerrado por el tope, ¿qué botón es coral? La regla G-4 del #126 dice que el coral es la acción que hace crecer el uso. Hoy ese botón es «Copiar link de reservas». | **a)** Para el ADMIN, «Pedir el plan {siguiente}» de la tarjeta de uso. «Copiar link de reservas» pasa a `outline` para todos los roles, y DOCTOR y USER no tienen coral. **b)** «Copiar link de reservas» sigue coral y «Pedir el plan» va en teal. | **a.** Con el link cerrado, copiarlo no trae ninguna cita este mes. La acción que hace crecer el uso es subir de plan, y d-5 dice que lo que empuja a pagar es ver lo que se pierde. Al 80 % el link todavía funciona, así que sigue la regla de hoy: el coral es «Copiar link de reservas» y «Pedir el plan» va en teal. | **a**, el 26 de octubre de 2026. Con el link cerrado, el coral del ADMIN es «Pedir el plan {siguiente}» y «Copiar link de reservas» va en `outline`. Al 80 % sigue G-4. |
| DP-2 | En Gratis y Consultorio, las métricas de Inicio ya muestran «Pedir el plan Clínica» (`PlanFeatureNotice`). Al 80 % y en el tope, la tarjeta de uso suma otra mejora de plan: en Gratis, de otro plan (Consultorio), y en Consultorio, un segundo botón igual (Clínica). | **a)** Se dejan las dos. **b)** Mientras la tarjeta ofrece una mejora de plan (80 % y tope), las métricas no muestran la suya. Debajo del 80 %, todo queda como hoy. | **b.** Una sola mejora de plan por pantalla, la que importa en ese momento. Con **a**, el médico ve «Pedir el plan Consultorio» y «Pedir el plan Clínica» juntos y tiene que adivinar cuál resuelve su problema. | **b**, el 26 de octubre de 2026. Al 80 % y en el tope, las métricas no muestran su «Pedir el plan Clínica»: queda una sola mejora de plan en la pantalla. |
| DP-3 | n-1 y A-12 dicen que DOCTOR y USER no ven «Pedir el plan». Hoy, en Gratis y Consultorio, sí ven el de las métricas («Pedir el plan Clínica»), para todos los roles. | **a)** n-1 habla solo de la mejora de plan del tope. Las métricas siguen como hoy, y el product-manager lo aclara en el criterio de A-12. **b)** Además, DOCTOR y USER dejan de ver la mejora de plan de las métricas. | **a.** Las métricas están fuera del alcance de este PRD, y «Mi día» rehará Inicio. Con **b**, este ticket cambia una pantalla que no es suya. | **a**, el 26 de octubre de 2026. El aviso de plan de las métricas no cambia para ningún rol. El product-manager lo aclaró en n-1 y A-12 del PRD. |

Supuestos de este plan (no los decide el PRD y no piden una decisión aparte). Aceptados el 26 de octubre
de 2026: el humano no los objetó al aprobar el plan.
- **S-a.** Cuando una cuenta tiene varias sedes, los correos del 80 % y del 100 % hablan de la sede de la
  reserva que los provocó: su contacto (e-5) y el enlace «Ir a mi panel» a su Inicio.
- **S-b.** Las reservas perdidas se muestran solo en el estado «tope alcanzado» de la tarjeta, como dice
  la tabla de 7.1. Si la cuenta sube de plan a mitad de mes y vuelve a tener cupo, la tarjeta deja de
  mostrarlas.
- **S-c.** Una reserva rechazada al confirmar cuenta como perdida aunque la haga alguien con sesión del
  consultorio. Para eso tendría que haber abierto el link con cupo y que el tope se alcanzara mientras
  llenaba el formulario, algo muy raro. Excluirla obligaría a leer la sesión en `POST /appointment`.

## Reglas de implementación

### Servidor

- **SV-1. Qué cuenta.** No hay contador: las citas del mes son las filas de `appointment` de las sedes de
  la cuenta con `created_at` dentro del mes de Lima, sea cual sea su estado (decidido por el humano el 29 de
  octubre de 2026). Reprogramar actualiza la misma fila y no suma (c-5). Cancelar sólo cambia el estado, así
  que la cita sigue contando (c-4).
- **SV-2. El mes** es el mes calendario de Lima del instante en que el api acepta la reserva (c-3). Se
  calcula con `api/src/domain/services/clinic-time.ts` (`today()` ya da la fecha de Lima). Nunca con el huso
  del servidor.
- **SV-3. El tope** sale de `entitlementsFor(subscription).monthlyAppointmentCap`, leído en cada
  comprobación, sin caché. Así subir o bajar de plan se aplica en la petición siguiente (pc-1, pc-2), y una
  cuenta sin suscripción o cancelada es Gratis (pc-3). `null` (Red) no limita.
- **SV-4. Abierto o cerrado:** el link de una cuenta está cerrado si las citas contadas en el mes son
  iguales o mayores que el tope. No depende de la sede (c-7).
- **SV-5. Orden de las comprobaciones en `POST /appointment`:**
  1. Cuerpo inválido: 400, como hoy.
  2. Sede inexistente, o médico o especialidad que no son de la sede: 404, como hoy (`fix-booking-scope`).
  3. **Tope alcanzado: 409 `BOOKING_CLOSED`.** Va antes de comprobar el horario, para que con el horario
     tomado y el tope alcanzado gane el tope (t-3, cl-12). Esta primera lectura no bloquea nada: solo
     evita trabajo.
  4. Horario no ofrecido o tomado: 409 `SLOT_UNAVAILABLE`, como hoy.
  5. Dentro de la transacción, primero se bloquea la cuenta y se cuenta (SV-6) y después se crean la ficha
     y la cita. Si el cupo ya no está, no se crea nada, tampoco la ficha (pv-2).
- **SV-6. Dos reservas simultáneas por la última cita (c-8, A-7).** Dentro de la transacción de la
  reserva, `SELECT 1 FROM account WHERE id = … FOR NO KEY UPDATE` (el mismo bloqueo que
  `create-first-clinic.usecase.ts`) y después se cuentan las citas del mes. Bloquea sólo la fila de esa
  cuenta: dos reservas de la misma cuenta van una detrás de otra y la segunda cuenta con la primera ya
  creada; las de otras cuentas no esperan. Índice `appointment(clinic_id, created_at)` para el conteo.
- **SV-7. Rechazo al confirmar.** Si el tope frena la reserva (en el paso 3 o en el 5 de SV-5), el caso de
  uso registra una reserva perdida (cuenta, sede, instante) **fuera** de la transacción que se revierte, y
  lanza `BookingClosed`. No sale ningún correo y no se registra nada del cuerpo de la petición (pv-2).
- **SV-8. Respuesta del rechazo:** `409 { message: "Este consultorio no está recibiendo reservas en línea
  por ahora", code: "BOOKING_CLOSED" }`. **No puede ser 402:** `toActionState` de platform convierte todo
  402 en «Tu plan no permite hacer uso de esta función», y el paciente nunca ve mensajes de plan (d-11).
  Hoy la ruta responde `{ message }` sin `code` para los `ApplicationError`. Agregar `code` solo a este
  error evita romper las pruebas que comparan el cuerpo exacto (ver e2e).
- **SV-9. Reserva perdida desde el link cerrado** (`POST /clinic/:clinicId/missed-bookings`). Se registra
  solo si se cumple todo esto:
  1. la sede existe;
  2. su cuenta está en el tope en ese momento (SV-4);
  3. la sede tiene al menos un médico que se puede reservar (t-5, la misma condición que
     `GET /clinic/:clinicId/doctors`);
  4. la petición no trae la sesión de un usuario de esa cuenta (r-3, «Ver como paciente»). La ruta es
     pública: puede leer la sesión en el handler, como hace `authenticate`, sin cambiar `policy.ts` ni
     `auth.ts`. Platform ya reenvía la cookie (`doFetch`).

  Responde 204 aunque no registre nada, para no revelar si contó. El «una vez por día y navegador» (r-2)
  lo pone el navegador (VP-6), no el servidor (pv-3).
- **SV-10. Correos al dueño (e-1 a e-3).** Salen después de confirmar la transacción, como el correo de
  confirmación de hoy. El del 80 % sale si el contador nuevo es igual a `ceil(tope × 0,8)`, y el del 100 %
  si es igual al tope. Las citas del mes suben de a una y nunca bajan mientras se cumplan dos cosas: ningún
  camino borra citas y toda cita se crea con el bloqueo de SV-6 (hoy, sólo la reserva pública). Así cada
  valor se alcanza una sola vez por mes.
  Por eso cada aviso sale una vez por mes y por tope, y al volver a un tope ya avisado no se repite (pc-4),
  sin guardar qué se avisó. Los umbrales de los tres planes con tope son todos distintos (8, 10, 120, 150,
  480 y 600). Destinatario: `account.ownerId` → correo y nombre del usuario. Si falla el envío, se
  registra el error con ids y sin datos personales, y no se revierte ni se reintenta (e-5).
- **SV-11. El contacto de la sede** se guarda normalizado en E.164 (`+51987654321`, `+5112345678`). Valida
  un número peruano (k-4): celular de 9 dígitos que empieza con 9, o fijo de Lima (01 + 7 dígitos) o de
  provincias (código de 2 dígitos + 6). Acepta espacios, guiones, paréntesis, el 0 del código y el +51.
  Cadena vacía o `null` borra. Se publica solo con el link cerrado (k-6, pv-5): `GET booking-status` lo
  devuelve en `null` mientras el link está abierto.

### Página del paciente

- **VP-1. Qué se muestra** en `/clinic/[clinicId]/create-appointment`, en este orden de prioridad:
  1. Sede sin médicos: el mensaje de hoy (t-5), aunque haya tope (vista 20).
  2. Tope alcanzado: la página del link cerrado (VP-2), sin pasos ni barra.
  3. Si no, el wizard de hoy.

  Si `GET booking-status` falla, se muestra el wizard: el servidor frena la reserva al confirmar (t-4), y
  un fallo de lectura no debe cerrar el link de quien tiene cupo.
- **VP-2. Página del link cerrado** (vistas 15 a 18). `BookingHeader` de hoy, con el médico y la
  especialidad definidos como en el primer paso del wizard (`pickInitialSelection` y `findSoleDoctor`).
  Debajo, el ícono `CalendarOff` sobre una baldosa blanca, el `h2` «Este consultorio no está recibiendo
  reservas en línea por ahora» y la variante de contacto de 5.2:

  | Contacto de la sede | Texto | Botones (a lo ancho, 44 px de alto) |
  | --- | --- | --- |
  | Celular | «Para pedir una cita, escribe o llama al consultorio.» | «Escribir por WhatsApp» (`default`, `MessageCircle`) y «Llamar al 987 654 321» (`outline`, `Phone`) |
  | Fijo | «Para pedir una cita, llama al consultorio.» | «Llamar al (01) 234 5678» (`outline`, `Phone`) |
  | Ninguno | «Vuelve a intentarlo más adelante.» | — |

  - WhatsApp: `https://wa.me/51987654321?text=` con «Hola, quiero pedir una cita en {sede}.». Si la sede
    no cargó (C-2 del booking), el texto queda en «Hola, quiero pedir una cita.». Es solo un enlace
    (pv-6).
  - Llamar: `tel:+51987654321`.
  - El título de la pestaña no cambia (C-4 del booking).
- **VP-3. Formato del número:** celular `987 654 321`, Lima `(01) 234 5678`, provincias `(044) 123 456`.
  Una sola función en platform, compartida por esta página y la tarjeta de uso.
- **VP-4. Rechazo al confirmar (t-3, vista 19).** Si `createAppointmentAction` devuelve
  `code: "BOOKING_CLOSED"`, el wizard no muestra el toast de error. Pone la marca de VP-6 (el servidor ya
  contó esta reserva perdida) y vuelve a pedir la página (`router.refresh()`), que ahora pinta VP-2 con el
  contacto. Lo escrito se descarta. Otra opción válida es que el 409 traiga el contacto. Lo decide el
  engineer.
- **VP-5. Foco.** Al montar la página del link cerrado, el foco va a su `h2` (`tabIndex={-1}`), como al
  cambiar de paso. Así los lectores de pantalla lo anuncian también después de VP-4 (p-2).
- **VP-6. Reserva perdida desde el navegador** (r-1, r-2, r-3, pv-3). Un componente cliente, montado solo
  en VP-2, llama una vez a la server action que hace `POST /clinic/:clinicId/missed-bookings`, salvo que el
  navegador ya tenga la marca del día. La marca va en `localStorage` con la sede en la clave y la fecha de
  Lima como valor (`2026-11-14`), sin ningún identificador. Las vistas previas de WhatsApp y Facebook no
  ejecutan JavaScript, así que nunca cuentan. La server action puede ignorar además los agentes de usuario
  de buscadores. Lo decide el engineer.

### Inicio de la sede

- **IN-1. Estado del link con el tope alcanzado** (m-3), para todos los roles, si la sede tiene médicos en
  el link. Reemplaza a la fila L-2 del #126:
  - ícono `CirclePause` ámbar y «Tu link no está recibiendo reservas este mes.» en `text-amber-800`;
  - para DOCTOR y USER, debajo: «Un administrador de tu cuenta puede cambiar de plan.» (n-1);
  - «Copiar link de reservas» sigue, porque el link vuelve a abrir el día 1. Con DP-1 en a, pasa a
    `outline`;
  - «Ver como paciente» sigue igual. Con sesión del consultorio, esa visita no cuenta (SV-9).

  Si la sede no tiene médicos en el link, se ve lo de hoy (L-3 o la guía): ese link no funcionaría ni con
  cupo.
- **IN-2. Guía de primeros pasos con el link cerrado.** El texto «El link de {sede} ya recibe citas con
  otros médicos.» (G-3 del #126) dejaría de ser cierto. Con el tope alcanzado pasa a «El link de {sede} ya
  tiene otros médicos.». El resto de la guía no cambia.
- **IN-3. Orden en Inicio:** estado del link, guía (si la hay) y tarjeta de uso, dentro del bloque
  `actions` de `StatisticsWrapper`. La guía va antes porque su coral es lo primero que tiene que hacer quien
  todavía no aparece en el link.

### Tarjeta de uso (ADMIN)

- **TU-1. Quién la ve:** el ADMIN de la sede, directo o heredado de la organización (`membership.role`),
  en los planes con tope (m-1). En Red no aparece. DOCTOR y USER nunca la ven ni piden sus datos (n-1).
- **TU-2. Estados** (con Gratis en noviembre como ejemplo):

  | Estado | Cuándo | Contenido |
  | --- | --- | --- |
  | Normal (vistas 1 y 2) | `booked < ceil(tope × 0,8)`, también con 0 | `h2` «Citas reservadas en noviembre», «5 de 10», barra teal y «Plan Gratis · Se renuevan el 1 de diciembre.». Sin botones. |
  | Cerca del tope (vistas 3 y 4) | Desde el 80 % hasta `tope − 1` | `h2` «Llevas 8 de las 10 citas de tu plan en noviembre», barra ámbar, «Cuando llegues a 10, tu link dejará de recibir reservas hasta el 1 de diciembre. Las citas ya reservadas no cambian.», «El plan Consultorio incluye 150 citas al mes.» y «Pedir el plan Consultorio» (teal). Si la sede no tiene contacto, debajo de una línea: «Agrega un número para que tus pacientes puedan contactarte cuando no recibas reservas.» y «Agregar número» (`outline`). |
  | Tope alcanzado (vistas 5 a 8) | `booked ≥ tope` | `h2` «Llegaste al tope de 10 citas de tu plan Gratis», barra ámbar llena, «Tu link vuelve a recibir reservas el 1 de diciembre, o desde que pases al plan Consultorio, que incluye 150 citas al mes.». Si hay reservas perdidas, el aviso ámbar «Este mes, 3 pacientes intentaron reservar y no pudieron.» (con 1: «Este mes, 1 paciente intentó reservar y no pudo.»; con 0 no se muestra). Después, «Tus pacientes ven el aviso «Este consultorio no está recibiendo reservas en línea por ahora» y el número 987 654 321.» con «Cambiar», o «… y ningún número para contactarte.» con «Agregar número». Al final, «Pedir el plan Consultorio» (coral con DP-1 en a). |

  - El título del tope no repite «Tu link no está recibiendo reservas» (el texto del PRD) porque la fila
    de IN-1 lo dice justo arriba.
  - La tarjeta nunca muestra más citas que el tope: desde el tope dice «Llegaste al tope…» (m-2, cl-11).
- **TU-3. Mejora de plan** (u-1, u-2): de Gratis, Consultorio («El plan Consultorio incluye 150 citas al
  mes.»); de Consultorio, Clínica («El plan Clínica incluye 600 citas al mes.», vista 8); de Clínica, Red
  («El plan Red se arma a la medida de tu red.»). «Pedir el plan {plan}» abre WhatsApp con WizyDoc y el
  mensaje que ya usa `PlanFeatureNotice`: «Hola, soy {nombre} {apellido} ({correo}), de {sede}. Quiero
  activar el plan {plan} en WizyDoc.».
- **TU-4. Contacto** (k-1 a k-7): «Agregar número» y «Cambiar» abren el diálogo «Número para tus
  pacientes» (vistas 12 a 14). Es el único lugar donde se edita en esta entrega. En el estado normal, y al
  80 % con un número ya guardado, la tarjeta no muestra el contacto (tabla de 7.1).

## Cambios por capa

Las rutas, los nombres y los archivos son un punto de partida: los decide el engineer.

### Prisma

Requiere una migración nueva, creada con `pnpm prisma:migrate` (`--create-only`), y revisar el SQL antes
de aplicarlo. No borra ni rellena datos: el contacto empieza vacío (k-7).

| Cambio | Para qué |
| --- | --- |
| `Clinic.patientContact String? @map("patient_contact")` | El contacto de la sede (d-15). Nulo en todas las sedes, también en las que tienen `phone`. |
| `Appointment @@index([clinicId, createdAt])` | El conteo del mes de SV-1 y SV-6. Sin tabla de contador. |
| Modelo nuevo `MissedBooking { id, accountId, clinicId, createdAt }`, con `@@index([accountId, createdAt])` y relaciones con `Account` y `Clinic` | Una fila por reserva perdida, con nada más que la cuenta, la sede y el momento (pv-1). La tarjeta cuenta las del mes desde el día 1 a las 00:00 de Lima. |

**Sin cambios:** la columna `subscription.extra_doctors` y `AddOnType.DOCTOR_SEAT` se quedan. El dominio
deja de leerlas (ver Entitlements), y borrarlas sería una migración que borra datos, algo que este plan no
necesita.

### Entitlements (autorizado en d-18)

| Archivo | Cambio |
| --- | --- |
| `api/src/domain/entities/subscription/plan.ts` | `PlanCapabilities` pierde `includedDoctors` y suma `monthlyAppointmentCap: number \| null`: FREE 10, CONSULTORIO 150, CLINICA 600, RED `null`. Si conviene, también el plan siguiente de cada uno (TU-3) y el nombre visible para los correos. |
| `api/src/domain/entities/subscription/entitlements.ts` | `Entitlements` pierde `maxDoctors` y suma `monthlyAppointmentCap`. `SubscriptionState` pierde `extraDoctors`. `withExtras` queda solo para las sedes. |
| `api/src/infrastructure/postgres/queries/subscription/get-account-entitlements.query.ts` | Deja de seleccionar `extraDoctors`. |
| `api/verify-scope.ts` | Deja de pasar `extraDoctors` (es un script manual: `tsc` no lo revisa). |
| `api/src/plugins/entitlements.ts` | **Sin cambios.** El booking es público y no usa `requireFeature` ni `accountEntitlements`: el caso de uso llama a `GetAccountEntitlements` directamente, como ya hace hoy para la autogestión. No hace falta volver a preguntar al humano. |

`GET /user/me` devuelve `entitlements` con la forma nueva (sin `maxDoctors`, con
`monthlyAppointmentCap`). Platform no lee ese campo, y la prueba CA-41 solo compara las claves de primer
nivel.

### api

| Archivo | Cambio |
| --- | --- |
| `src/application/errors/booking-closed.error.ts` (nuevo) | `BookingClosed`: `statusCode = 409`, `code = "BOOKING_CLOSED"`, con el mensaje de SV-8. |
| `src/application/use-cases/appointment/create-appointment.usecase.ts` | SV-5 a SV-8 y SV-10. Los pasos van en métodos privados de la clase (`api/AGENTS.md`). El acceso al contador y a las reservas perdidas va en un repositorio de `infrastructure`, porque lo comparten varios casos de uso. |
| `src/infrastructure/postgres/repositories/monthly-bookings.repository.ts` (nuevo) | Reservar cupo (SV-6), leer las citas del mes, registrar una reserva perdida y contar las del mes. |
| `src/application/queries/clinic/get-booking-status.query.ts` + `src/infrastructure/postgres/queries/clinic/get-booking-status.query.ts` (nuevos) | `{ isAcceptingBookings, patientContact }` de una sede (SV-4, SV-11). `null` si la sede no existe. |
| `src/application/use-cases/clinic/record-missed-booking.usecase.ts` (nuevo) | SV-9. |
| `src/application/queries/clinic/get-booking-usage.query.ts` + implementación (nuevos) | Datos de la tarjeta (ver la ruta). |
| `src/application/use-cases/clinic/update-patient-contact.usecase.ts` (nuevo) | Schema Zod de SV-11 con mensajes en español. Actualiza la sede de la cuenta de la sesión. |
| `src/routes/clinic/public.ts` | `GET /clinic/:clinicId/booking-status` y `POST /clinic/:clinicId/missed-bookings`. `Cache-Control: private, no-store` en las dos. |
| `src/routes/clinic/index.ts` | `GET /clinic/:resourceId/booking-usage` y `PUT /clinic/:resourceId/patient-contact`. |
| `src/routes/appointment/index.ts` | Mapea `BookingClosed` a SV-8 (con `code`). El resto de las respuestas no cambia. |
| `src/infrastructure/services/email-service/templates/monthly-cap-warning.mjml` y `monthly-cap-reached.mjml` (nuevos) | e-2 y e-3 (vistas 21 a 23), con el estilo de `doctor-cancelled-appointment.mjml`. «Pedir el plan {plan}» (WhatsApp, TU-3) y «Ir a mi panel» (`{FRONTEND_URL}/account/{accountId}/clinic/{clinicId}/dashboard`, S-a). Si la sede no tiene contacto, suman «Tus pacientes no verán ningún número para contactarte. Puedes agregarlo desde tu panel.». |
| `src/infrastructure/services/email-service/template-renderer.ts` | Tipos de las dos plantillas. |

El número de WhatsApp de WizyDoc (`51993953674`) ya está en platform (`plan-feature-notice.tsx`). Los
correos lo necesitan en el api: va como constante en el api, porque son dos proyectos sin código
compartido.

**Políticas de las rutas nuevas o cambiadas.** Ninguna lleva `requireFeature`: el tope, la tarjeta y el
contacto van en todos los planes con tope, y un 402 en el booking violaría d-11.

```ts
// api/src/routes/clinic/public.ts
app.get("/clinic/:clinicId/booking-status", {
  schema: { params: getBookingStatusParamsSchema }, // clinicId: z.uuid()
  // Pública: la lee el booking del paciente, sin sesión, y el Inicio de la sede para todos los roles.
  ...policy({ public: true }),
}, handler);

app.post("/clinic/:clinicId/missed-bookings", {
  schema: { params: recordMissedBookingParamsSchema }, // clinicId: z.uuid(), sin cuerpo
  // Pública: la llama el booking cerrado del paciente, sin sesión. Las condiciones de SV-9 las aplica el caso de uso.
  ...policy({ public: true }),
}, handler);

// api/src/routes/clinic/index.ts
app.get("/clinic/:resourceId/booking-usage", {
  schema: { params: getBookingUsageParamsSchema },
  ...policy({ account: true, confirmed: true, onboarded: true, roles: ["ADMIN"] }),
}, handler);

app.put("/clinic/:resourceId/patient-contact", {
  schema: { params: updatePatientContactParamsSchema, body: updatePatientContactSchema },
  ...policy({ account: true, confirmed: true, onboarded: true, roles: ["ADMIN"] }),
}, handler);

// api/src/routes/appointment/index.ts — sin cambios de política
app.post("", { schema: { body: createAppointmentSchema }, ...policy({ public: true }) }, handler);
```

`roles: ["ADMIN"]` resuelve la membership sobre `:resourceId`, así que acepta al ADMIN de la sede y al de
su organización (k-3), y responde 404 si la sede es de otra cuenta. La política también deja pasar el id
de una organización donde el usuario es ADMIN: los dos handlers responden 404 si
`membership.resourceType !== "CLINIC"`.

| Ruta | Respuestas |
| --- | --- |
| `GET /clinic/:clinicId/booking-status` | 200 `{ isAcceptingBookings: true, patientContact: null }` o `{ isAcceptingBookings: false, patientContact: "+51987654321" \| null }`. 404 `{ message: "Sede no encontrada" }` si el id no es de una sede, como `location`. Nunca devuelve el plan, el tope ni cantidades. |
| `POST /clinic/:clinicId/missed-bookings` | 204, registre o no (SV-9). 404 si el id no es de una sede. |
| `GET /clinic/:resourceId/booking-usage` | 200 `{ plan, monthlyCap: number \| null, month: "2026-11", renewsOn: "2026-12-01", bookedThisMonth, missedThisMonth, nextPlan: { plan, monthlyCap: number \| null } \| null, patientContact: string \| null }`. `monthlyCap: null` en Red (platform no pinta la tarjeta). 403 sin rol ADMIN, 404 sin membership o con el id de una organización. |
| `PUT /clinic/:resourceId/patient-contact` | Cuerpo `{ patientContact: string \| null }`. 200 `{ patientContact }` normalizado. 400 con «Escribe un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad.». 403 y 404 como la anterior. |
| `POST /appointment` | Lo de hoy más 409 `BOOKING_CLOSED` (SV-8). |

### platform

| Archivo | Cambio |
| --- | --- |
| `src/lib/api/clinic/index.ts` y `types.ts` | `getBookingStatus(clinicId)` (pública, sin caché) y `getBookingUsage(clinicId)` (con el tag `clinic-{id}/booking-usage`). Tipos `BookingStatus` y `BookingUsage`. |
| `src/lib/actions/clinic/update-patient-contact.action.ts` (nuevo) | Patrón de `platform/AGENTS.md`: sesión, Zod con `treeifyError`, `PUT`, `revalidateTag` de la tarjeta y `toActionState`. Un 403 muestra «Solo un administrador puede cambiar este número.», en lugar del mensaje en inglés de la política. |
| `src/lib/actions/clinic/record-missed-booking.action.ts` (nuevo) | Sin sesión: `POST /clinic/:clinicId/missed-bookings` con `doFetch`, que reenvía la cookie si existe (SV-9.4). No devuelve nada al paciente. |
| `src/lib/patient-contact.ts` (nuevo) | Formato (VP-3), si es celular, y los enlaces `wa.me` y `tel:`. Lo usan la página del paciente y la tarjeta. |
| `src/lib/plan-request.ts` (nuevo) | Número de WhatsApp de WizyDoc, nombres visibles de los planes y armado del mensaje «Quiero activar el plan…», que hoy viven dentro de `plan-feature-notice.tsx`. Se extrae porque ahora lo usan dos componentes. |
| `src/components/common/plan-feature-notice.tsx` | Usa `lib/plan-request.ts`. Sin cambio visible. |
| `src/app/clinic/[clinicId]/create-appointment/page.tsx` | Lee también `getBookingStatus` (si falla, abierto: VP-1). Elige entre sin médicos, link cerrado y wizard. |
| `src/app/clinic/[clinicId]/create-appointment/booking-closed.tsx` (nuevo) | VP-2, VP-3 y VP-5. |
| `src/app/clinic/[clinicId]/create-appointment/missed-booking-beacon.tsx` (nuevo, cliente) | VP-6. No pinta nada. |
| `src/app/clinic/[clinicId]/create-appointment/booking-wizard.tsx` | VP-4: con `BOOKING_CLOSED`, marca el día y refresca en lugar del toast. |
| `src/app/clinic/[clinicId]/create-appointment/steps/patient-step.tsx` | Mientras se refresca después de `BOOKING_CLOSED`, el botón sigue en «Confirmando...» y no sale el toast. |
| `src/app/account/[accountId]/clinic/[clinicId]/dashboard/page.tsx` (la del #126) | Lee `getBookingStatus` para todos los roles y `getBookingUsage` solo para el ADMIN. Si alguna falla, se registra sin datos personales y se ve como hoy: link abierto y sin tarjeta (como L-5 del #126). Pasa el estado a `BookingLinkStatus`, `FirstSteps` y, con DP-2 en b, a `ClinicStats`. |
| `src/components/app/dashboard/clinic/booking-link-status.tsx` (del #126) | Props `isAcceptingBookings` y `canChangePlan`. Variante IN-1. |
| `src/components/app/dashboard/clinic/first-steps.tsx` (del #126) | Prop `isAcceptingBookings`. Texto de IN-2. |
| `src/components/app/dashboard/copy-button.tsx` | Prop `variant` (`coral` por defecto). Con DP-1 en a, `outline` con el link cerrado. |
| `src/components/app/dashboard/clinic/booking-usage-card.tsx` (nuevo, cliente) | TU-1 a TU-4. |
| `src/components/app/dashboard/clinic/patient-contact-dialog.tsx` (nuevo, cliente) | El diálogo del contacto. |
| `src/components/app/dashboard/clinic/stats.tsx` | Con DP-2 en b: no pinta `PlanFeatureNotice` cuando la tarjeta ofrece una mejora de plan. Con DP-3 en b: tampoco para DOCTOR y USER. |

### web y documentos (sección 12 del PRD)

| Archivo | Cambio |
| --- | --- |
| `web/src/components/marketing/pricing.tsx` | Tarjetas: «150 citas al mes» en Consultorio, «600 citas al mes» en Clínica y «Citas sin tope» en Red. Comparativa: fila «Citas al mes» con 10, 150, 600 y «Sin tope». El comentario de arriba deja de decir que los topes de pago no se anuncian. |
| `docs/PRODUCT.md` | «Planes», «Preguntas abiertas» y «Estado», según la sección 12 del PRD. El #126 también cambia este archivo: quien entre segundo resuelve el conflicto. |
| `docs/capacidades.md` | Filas del tope, de «Límite por sedes» y de «Sede adicional» (`extraDoctors` ya no suma nada), y la nota de la landing. |
| `platform/e2e/README.md` | Las pruebas nuevas y los helpers. |

## Aislamiento entre cuentas

| Dato | Se lee o escribe en | Cómo queda acotado |
| --- | --- | --- |
| Contador del mes | `POST /appointment` (escribe), `booking-status` y `booking-usage` (leen) | En las rutas públicas, la cuenta sale de `clinic.resource.accountId` de la sede de la URL o del cuerpo, que el caso de uso ya cargó y validó (sede existente; médico y especialidad de esa sede, por `fix-booking-scope`). Nunca llega un `accountId` del cliente. En `booking-usage`, la cuenta sale de la sesión, y la membership ADMIN sobre la sede garantiza que es la misma. |
| Reserva perdida | `POST /appointment` y `POST missed-bookings` (escriben), `booking-usage` (cuenta) | Se guarda con la cuenta de la sede (de la base, no del cliente) y el `clinicId` ya validado. Solo se cuenta por el `accountId` de la sesión. |
| Contacto de la sede | `PUT patient-contact` (escribe), `booking-status` y `booking-usage` (leen) | Escritura: membership ADMIN sobre `:resourceId`, sede de tipo CLINIC, y el update filtra además por `resource.accountId` de la sesión. Lectura pública: solo el contacto de la sede de la URL, y solo con el link cerrado (SV-11). |
| Dueño de la cuenta (correos) | `POST /appointment` | `account.ownerId` de la cuenta de la sede. El destinatario nunca sale de la petición. |

**Endpoints públicos y sus ids:**
- `GET booking-status` y `POST missed-bookings` reciben solo `clinicId` (UUID). Todo lo demás (cuenta,
  plan, tope, médicos) lo deriva el servidor de esa sede. Un id que no es de una sede da 404, como
  `location`.
- `POST /appointment` recibe `clinicId`, `doctorProfileId` y `specialty`. Se siguen validando juntos como
  hoy, antes de mirar el tope (SV-5). El tope se mide por la cuenta de esa sede.
- Lo que se expone de más: `booking-status` dice si la cuenta llegó al tope, que es lo que el paciente ve
  igual en la página, y el contacto que el consultorio decidió publicar. No expone plan, tope ni
  cantidades.
- `POST missed-bookings` se puede llamar en bucle e inflar el número (rg-5; no hay límite de peticiones,
  WIZ-44). No guarda datos personales ni dispara correos (d-16).

Pasan por el security-reviewer: las dos rutas públicas nuevas, el cambio de `POST /appointment` y el
contacto, que el paciente ve.

## UI

### Rutas y layout

| Ruta | Layout | Qué cambia |
| --- | --- | --- |
| `/clinic/[clinicId]/create-appointment` | `create-appointment/layout.tsx` → `PublicPageShell` (sin cambios) | La página del link cerrado (VP-1 a VP-6). |
| `/account/[accountId]/clinic/[clinicId]/dashboard` | `clinic/[clinicId]/layout.tsx`: `Sidebar` + `main` (sin cambios) | El estado del link (IN-1), la guía (IN-2) y la tarjeta de uso con su diálogo (TU-1 a TU-4). |
| Correo al dueño | MJML, como los de hoy | e-2 y e-3. |

### Árbol de componentes

```
PublicPageShell (sin cambios)
└─ CreateAppointmentPage (modificada)
   ├─ sin médicos: Card > BookingHeader + texto (sin cambios)
   ├─ BookingClosed (nueva) ← clinic, médico y especialidad iniciales, patientContact
   │  ├─ Card (ui/card) > CardContent p-5 sm:p-8
   │  │  ├─ BookingHeader (create-appointment/booking-header.tsx, sin cambios)
   │  │  ├─ baldosa CalendarOff + h2 tabIndex=-1 + texto de la variante
   │  │  └─ a «Escribir por WhatsApp» / a «Llamar al …» (Button asChild, ui/button)
   │  └─ MissedBookingBeacon (nuevo, cliente) ← clinicId
   └─ BookingWizard (modificado: VP-4)

clinic/[clinicId]/layout.tsx (sin cambios)
└─ ClinicDashboardPage (la del #126, modificada)
   ├─ StatisticsWrapper (sin cambios)
   │  ├─ Welcome (sin cambios)
   │  ├─ actions (mb-8 flex flex-col gap-4):
   │  │  ├─ BookingLinkStatus (modificada) ← isBookable, isAcceptingBookings, canChangePlan
   │  │  │  ├─ abierto: fila L-2 del #126, CopyButton coral
   │  │  │  ├─ cerrado (IN-1): CirclePause + texto + CopyButton (outline con DP-1 en a) + «Ver como paciente»
   │  │  │  └─ sin médicos: aviso L-3 (sin cambios)
   │  │  ├─ FirstSteps (modificada: IN-2) ← isAcceptingBookings
   │  │  └─ BookingUsageCard (nueva, solo ADMIN, plan con tope) ← usage, clinicId
   │  │     ├─ barra (div aria-hidden)
   │  │     ├─ a «Pedir el plan {siguiente}» (Button asChild, lib/plan-request.ts)
   │  │     └─ PatientContactDialog (nuevo) ← clinicId, patientContact
   │  │        └─ Dialog (ui/dialog) > form > Input (common/form) + Button
   │  └─ ClinicStats (sin cambios, salvo DP-2 en b y DP-3 en b)
   └─ TodayAppointments (sin cambios)
```

**Componentes nuevos:**
- `BookingClosed({ clinic: ClinicLocation | null, doctor: ClinicDoctor | null, specialty: Specialty | null,
  patientContact: string | null, clinicId: string })`. Hoy no hay ninguna página del booking que diga «no
  se puede reservar» con un contacto.
- `MissedBookingBeacon({ clinicId: string })`, cliente. Separa el efecto (VP-6) de la vista, que puede
  pintarse en el servidor.
- `BookingUsageCard({ usage: BookingUsage, clinicId: string })`, cliente porque usa `useApp()` para el
  mensaje de WhatsApp y abre el diálogo. Ningún componente de hoy muestra el plan ni el uso.
  - Tarjeta `rounded-xl border border-gray-200 bg-white p-4 sm:p-5`, como la guía y «Citas de hoy».
  - Baldosa del ícono como `StatCard`: `bg-brand-teal/10 text-brand-teal` en el estado normal, y
    `bg-amber-50 text-amber-700` al 80 % y en el tope. Íconos `CalendarCheck`, `CalendarClock` y
    `CirclePause`.
  - Barra `h-2 rounded-full bg-gray-100`. El relleno es `bg-brand-teal` en el estado normal y
    `bg-amber-700` al 80 % y en el tope (el ámbar es el color de advertencia desde #123).
  - Botones `size="sm"` con `min-h-10 w-full sm:min-h-0 sm:w-auto`, como la guía.
- `PatientContactDialog({ clinicId: string, patientContact: string | null })`. Sigue el patrón de
  `specialty/edit-modal.tsx` (`Dialog` + `useFormAction`). El disparador es el botón «Agregar número» o
  «Cambiar» de la tarjeta.

### Qué dato alimenta cada parte

| Parte | Dato |
| --- | --- |
| Página del paciente: abierta o cerrada, y el contacto | `GET /clinic/:clinicId/booking-status` |
| Cabecera de la página cerrada | `GET /clinic/:clinicId/doctors` y `GET /clinic/:clinicId/location`, como hoy |
| Reserva perdida | `POST /clinic/:clinicId/missed-bookings` desde `MissedBookingBeacon` |
| Rechazo al confirmar | `POST /appointment` → 409 `BOOKING_CLOSED` |
| Estado del link en Inicio (todos los roles) | `GET /clinic/:clinicId/doctors` (como en el #126) y `GET /clinic/:clinicId/booking-status` |
| Tarjeta de uso | `GET /clinic/:resourceId/booking-usage`: `month` y `renewsOn` (textos de fecha), `bookedThisMonth` y `monthlyCap` (estado, número y barra), `missedThisMonth`, `plan` y `nextPlan` (TU-3), `patientContact` (TU-4) |
| Guardar o quitar el contacto | `PUT /clinic/:resourceId/patient-contact` |
| Nombre y correo del mensaje de WhatsApp | `useApp()` (`user`, `membership.resourceName`), como `PlanFeatureNotice` |

Los nombres de los meses salen de `month` y `renewsOn`, que ya vienen en hora de Lima. Platform los
formatea como fechas de calendario, sin pasarlos por el huso del servidor ni del navegador.

### Textos nuevos

| Dónde | Texto |
| --- | --- |
| Página del paciente | VP-2 |
| Estado del link cerrado | «Tu link no está recibiendo reservas este mes.» y, para DOCTOR y USER, «Un administrador de tu cuenta puede cambiar de plan.» |
| Guía con el link cerrado | «El link de {sede} ya tiene otros médicos.» |
| Tarjeta | TU-2 y TU-3 |
| Diálogo, título | «Número para tus pacientes» |
| Diálogo, descripción (k-5) | «Lo verán tus pacientes cuando tu link no esté recibiendo reservas.» |
| Diálogo, campo | Etiqueta «WhatsApp o teléfono para pacientes», ejemplo «987 654 321» y ayuda «Un celular de 9 dígitos o un fijo con su código, como (01) 234 5678. Si es un celular, tus pacientes también podrán escribirte por WhatsApp.» |
| Diálogo, error | «Escribe un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad.» |
| Diálogo, botones | «Guardar» («Guardando...») y, si ya hay un número, «Quitar número» |
| Toasts | «Guardamos el número para tus pacientes.» y «Quitamos el número.» |
| Correos | e-2 y e-3 del PRD, con la línea sin contacto de e-5 y «Ir a mi panel» |

### Estados

| Estado | Qué se ve |
| --- | --- |
| Tarjeta normal | TU-2. Con 0 citas es el estado vacío: «0 de 10» y la barra vacía (vista 2). |
| Tarjeta al 80 % | TU-2, con o sin «Agregar número». |
| Tarjeta en el tope | TU-2, con o sin reservas perdidas y con o sin contacto. Arriba, la fila de IN-1. |
| Link cerrado, DOCTOR o USER | Solo la fila de IN-1 con la línea del administrador. Sin tarjeta ni números (vistas 9 y 10). |
| Página del paciente | VP-2 en sus tres variantes. Después de un rechazo (VP-4), la misma página. |
| Carga | `loading.tsx` de la sede («Cargando...», vista 24) y del booking («Cargando reserva...»), sin cambios. Al guardar el contacto, el botón dice «Guardando...» y queda deshabilitado. |
| Error | Si falla `booking-usage`, no hay tarjeta (vista 25); si falla `booking-status`, el link se ve abierto. El resto de Inicio no se rompe. `error.tsx` de la sede y del booking, sin cambios. Al guardar el contacto: el error del campo y el toast de `useFormAction` (vista 13). |
| 403 | DOCTOR y USER no piden `booking-usage`, y si lo pidieran el api responde 403. Un `PUT` del contacto sin rol ADMIN muestra el toast «Solo un administrador puede cambiar este número.». La página del paciente es pública: no tiene 403. |
| 402 | No aplica. El tope frena con un mensaje y no con un 402 (SV-8, d-11), y la tarjeta va en todos los planes con tope. La mejora de plan de las métricas sigue como hoy, salvo DP-2 y DP-3. |

### Interacciones

- **«Pedir el plan {plan}»** (tarjeta y correos): abre WhatsApp con WizyDoc en una pestaña nueva, con el
  mensaje de TU-3. Sin toast.
- **«Agregar número» y «Cambiar»:** abren el diálogo con el foco en el campo. «Cambiar» lo trae con el
  número guardado, con el formato de VP-3.
- **«Guardar»:** valida en el servidor (SV-11). Si es válido: toast, se cierra el diálogo y la tarjeta se
  actualiza (`revalidateTag`). Si no, el error debajo del campo, con `aria-invalid`, y el foco en el
  campo.
- **«Quitar número»:** guarda `null`, muestra el toast «Quitamos el número.» y cierra. No pide
  confirmación: se vuelve a agregar en un paso.
- **«Copiar link de reservas»** y **«Ver como paciente»:** como en el #126. Con el link cerrado, «Ver como
  paciente» abre la página cerrada y esa visita no cuenta (SV-9).
- **Página del paciente:** «Escribir por WhatsApp» abre el chat (`target="_blank"`) y «Llamar al…», el
  marcador. No hay toasts ni redirecciones.
- **«Confirmar reserva» con el tope alcanzado:** VP-4.

### Diferencias por rol

| Rol en la sede | Estado del link | Tarjeta | Diálogo del contacto | Correos |
| --- | --- | --- | --- | --- |
| ADMIN (directo o de la organización) | IN-1, sin la línea del administrador | Sí, en los planes con tope | Sí | Solo si es el dueño de la cuenta (e-1) |
| DOCTOR | IN-1, con «Un administrador de tu cuenta puede cambiar de plan.» | No | No | No |
| USER | Igual que DOCTOR | No | No | No |

### Accesibilidad

- **Tarjeta:**
  - `section` con `aria-labelledby` a su `h2`. El número va en texto («5 de 10»), y la barra es decorativa
    (`aria-hidden`).
  - El aviso de reservas perdidas es texto, sin `role` de alerta: no aparece mientras el ADMIN mira la
    pantalla.
  - «Cambiar» suma un `sr-only` («Cambiar el número para tus pacientes»), porque solo no dice qué cambia.
- **Diálogo:**
  - Radix atrapa el foco, empieza en el campo y lo devuelve al botón que lo abrió.
  - `label` visible, ayuda y error enlazados con `aria-describedby`. `type="tel"`, `inputMode="tel"` y
    `autoComplete="off"`, para que el número publicado sea uno que el ADMIN escribe a propósito (pv-5).
  - Orden de tabulación: campo › «Quitar número» (si lo hay) › «Guardar» › cerrar.
- **Página del paciente:**
  - Un solo `h1` (el de la cabecera), y el mensaje en un `h2`, que recibe el foco al montar (VP-5).
  - Los íconos llevan `aria-hidden`. «Escribir por WhatsApp» suma «(se abre en WhatsApp)» en `sr-only`.
  - Botones de al menos 44 px de alto y a lo ancho, sin desplazamiento horizontal a 375 px con nombres de
    sede de 80 caracteres (p-2).
  - Orden de tabulación: «Escribir por WhatsApp» › «Llamar al…» › pie.
- **Orden de tabulación de Inicio:** menú › «Copiar link de reservas» y «Ver como paciente» › botones de la
  guía › botones de la tarjeta («Pedir el plan…», «Agregar número» o «Cambiar») › métricas › «Citas de
  hoy».
- **Contraste:**

  | Elemento | Contraste |
  | --- | --- |
  | `amber-800` sobre blanco (texto del link cerrado) | 7,1:1 |
  | `amber-800` sobre `amber-50` (reservas perdidas) | 6,8:1 |
  | `amber-700` sobre blanco (ícono y barra) | 5,0:1 (basta 3:1) |
  | Botón coral (`brand-ink` sobre coral) | 5,4:1 (#122) |
  | Botón teal (blanco sobre `brand-teal`) | 4,9:1 (#123) |

## Riesgos y casos límite

| Id | Caso | Qué pasa |
| --- | --- | --- |
| r-1 | El orden de los PR | Este plan cambia `BookingLinkStatus`, `FirstSteps` y `copy-button.tsx` del #126, y el #126 también toca `docs/PRODUCT.md`. Se implementa cuando el #126 entre o apilado sobre él (ver Depende). |
| r-2 | Un 402 en el booking | `toActionState` mostraría «Tu plan no permite hacer uso de esta función» al paciente. SV-8 lo evita con un 409 y su `code`. |
| r-3 | Cuentas sin fila de `subscription` | Son Gratis (pc-3). El bloqueo de SV-6 es sobre la fila de `account`, que toda cuenta tiene. |
| r-4 | Orden de despliegue | Primero el api con su migración, después platform. Con el api nuevo y el platform viejo, el paciente que choca con el tope al confirmar ve el mensaje del 409 en el toast, que ya está en español y sin datos del plan. Con el platform nuevo y el api viejo, las lecturas nuevas dan 404, el link se ve abierto y no hay tarjeta. |
| r-5 | Dos mejoras de plan en Inicio | DP-2. |
| r-6 | El contador y la agenda no coinciden (rg-7) | Lo mitiga «reservadas en {mes}» en la tarjeta. |
| r-7 | Reservas perdidas infladas a mano (rg-5) | SV-9 exige que el link esté cerrado de verdad y que la sede tenga médicos. Sin límite de peticiones, alguien podría inflarlas igual: solo cambia un número informativo, sin correos. |
| r-8 | «Citas de hoy» a 375 px | Con el teléfono y el estado en la misma fila, el nombre del paciente se trunca a una letra (se ve en la vista 9 del mockup, que copia el componente de hoy). Ya pasa hoy y no es de este ticket: va en un fix aparte. |
| cl-1 | Dos reservas simultáneas por la cita 10 | SV-6: entra una, y la otra recibe `BOOKING_CLOSED` y suma una reserva perdida. |
| cl-2 | Horario tomado y tope alcanzado | Gana el tope (SV-5, paso 3). |
| cl-3 | Bajada de plan con más citas que el tope nuevo | Link cerrado y tarjeta «Llegaste al tope de 10 citas…» (m-2). Ningún correo: el contador no se movió (pc-4). |
| cl-4 | Médico que no aparece en el link, con el link cerrado y otros médicos | Fila IN-1 y la guía con el texto de IN-2. |
| cl-5 | Sede sin médicos y tope alcanzado | El paciente ve el mensaje de «sin médicos» (t-5), y en Inicio, el aviso L-3 o la guía. El ADMIN ve igual la tarjeta en el tope. |
| cl-6 | Cancelación desde el link con el tope alcanzado | Se cancela como siempre y el link sigue cerrado (c-4, a-2). |
| cl-7 | El ADMIN con varias sedes | El número es de la cuenta. El contacto y su diálogo son los de la sede donde está. |
| cl-8 | El día 1 | Es otro mes: la ventana del conteo empieza de nuevo y las reservas perdidas se cuentan desde las 00:00 de Lima (pc-5). Nada que programar. |

## Fuera de alcance

Todo lo de «Fuera» en la sección 3 del PRD. Además:
- Editar el contacto desde Sedes o desde una pantalla de la sede («Editar sede», k-6).
- Mostrar el teléfono antiguo de la sede (`clinic.phone`) en cualquier lugar nuevo.
- Borrar `subscription.extra_doctors` o `AddOnType.DOCTOR_SEAT`.
- Los textos de `lib/plans.ts` (`PLAN_OPTIONS`), que nadie muestra.
- El truncado de «Citas de hoy» (r-8).

## Verificación

### Typecheck y check

- `cd api && pnpm prisma:migrate` (crea la migración, se revisa el SQL), `pnpm prisma:generate`,
  `pnpm typecheck && pnpm check`.
- `cd platform && pnpm typecheck && pnpm check`.
- `cd web && pnpm typecheck && pnpm check`.

### Peticiones (base local de desarrollo)

Con una sede Gratis con médico y horario, y su `clinicId`:
1. `GET /clinic/{clinicId}/booking-status` → `{ isAcceptingBookings: true, patientContact: null }`.
2. Se lleva el contador del mes a 10 en la base local (SQL o 10 reservas) y se guarda un contacto con
   `PUT /clinic/{clinicId}/patient-contact` como ADMIN. `booking-status` → `false` y `"+51987654321"`.
3. `POST /appointment` válido → 409 `BOOKING_CLOSED`. No hay cita ni ficha nuevas, hay una fila nueva en
   reservas perdidas y no salió ningún correo.
4. `POST /clinic/{clinicId}/missed-bookings` sin cookie → 204 y una fila más. Con la cookie del ADMIN →
   204 y ninguna fila.
5. `GET /clinic/{clinicId}/booking-usage` como ADMIN → 200 con `bookedThisMonth: 10`; como DOCTOR → 403;
   con el id de la organización → 404.
6. `PUT patient-contact` con `"12345"` → 400 con el mensaje en español. Con `"(01) 234-5678"` → 200 y
   `"+5112345678"`.
7. Se cambia el plan a CONSULTORIO en la base local → `booking-status` vuelve a `true` (pc-1).

### Navegador

A 375 px y a 1280 px:
1. ADMIN en Gratis con 0, 5, 8 y 10 citas: los estados de TU-2, con y sin contacto, y el coral según DP-1.
2. «Agregar número», un número inválido, uno válido, «Cambiar» y «Quitar número».
3. DOCTOR y USER con el tope alcanzado: solo la fila de IN-1, con la línea del administrador.
4. Sin sesión, el link cerrado en sus tres variantes. «Escribir por WhatsApp» abre `wa.me` con el texto, y
   recargar no suma más de una reserva perdida en el día.
5. Rechazo al confirmar: se abre el link con 9 citas, se llevan a 10 desde otra pestaña y se confirma. Se
   ve la página cerrada con el foco en su `h2`, sin toast.

### e2e (`cd platform && pnpm test:e2e`)

Se corre la suite completa: cambian `POST /appointment`, el booking y el dashboard del #126.

**Ninguna prueba de hoy llega al tope.** Revisé con grep cada `test(...)` que reserva (por
`createManagedAppointment`, `postBooking`, `POST /appointment`, `bookFromDateStep` y `confirmBooking`). La
que más reserva en una cuenta lo hace 3 veces (`portal-cancel.spec.ts`, CA-22), y cada prueba crea su
propia cuenta (no hay `beforeAll` ni `describe.serial` que la comparta). No lo ejecuté.

Pueden romperse según cómo se implemente:

| Prueba | Se rompe si… | Qué hacer |
| --- | --- | --- |
| `api/security/booking-schedule-validation.spec.ts` (líneas 153 y 265) y `api/security/fix-booking-scope.spec.ts` (línea 161) | la ruta agrega `code` a todos los `ApplicationError` (comparan con `toEqual` el cuerpo de un 409 y de un 404) | SV-8: `code` solo en `BookingClosed`, o actualizar las tres. |
| `api/booking/clinic-location.spec.ts` | el estado se mete dentro de `GET /clinic/:clinicId/location` | Mantener la ruta aparte, o actualizarla. |
| `api/account/beta-free-plan-only.spec.ts` y `support/db.ts` (`extraDoctors`) | se borra la columna | No borrarla (Prisma). |
| `ui/clinic/dashboard-coral-and-mobile.spec.ts` (#126, CA-38) | la tarjeta normal tiene un botón coral o un enlace «Pedir el plan…» | TU-2: el estado normal no tiene botones. Con 0 citas, CA-38 sigue igual. |
| `ui/clinic/dashboard-link-status.spec.ts` (#126) | el estado del link cambia sin tope alcanzado | Con 0 o 1 cita sigue L-2. |

**Helpers que hacen falta para las pruebas nuevas:** llevar el contador de una cuenta a un número sin
reservar N veces (citas sembradas por Prisma en el mes), leer las
reservas perdidas y el `patient_contact`, y lanzar dos `POST /appointment` a la vez (A-7). Se agregan a
`support/db.ts` (`TestPrisma`) y se documentan en `platform/e2e/README.md`.

**Sin verificar en este plan:** el envío real por SES (las pruebas usan el correo en memoria) y cómo se ve
la vista previa del link cerrado al compartirlo por WhatsApp.

## Criterios de aceptación

Escritos por el product-manager el 26 de octubre de 2026, a partir de la sección 15 del PRD y del plan y el
mockup aprobados: DP-1 en a, DP-2 en b, DP-3 en a, y los supuestos S-a a S-c.

Los marcados **[e2e]** los cubre el e2e-tester con Playwright. Los **[manual]** se comprueban en el
navegador, con peticiones al api local o en el diff, y el **[typecheck]**, con `pnpm typecheck` y
`pnpm check`. Los que llevan además **[security]** los revisa el security-reviewer. Salvo que se diga otra
cosa, las pantallas se prueban a 375 px y a 1280 px, en una cuenta Gratis. Los criterios suponen que el
#126 (primer uso) está en `main` o debajo de esta rama.

Escenarios:
- **Sede lista:** una sede con al menos un médico con especialidad y horario, es decir, que aparece en
  `GET /clinic/{clinicId}/doctors`.
- **En el tope:** la cuenta tiene tantas citas contadas este mes como su tope (10 en Gratis). Salvo que el
  criterio diga «reservando de verdad», la prueba lleva el contador a ese número sin reservar N veces, con
  el helper del plan.
- **Cuenta de pago:** Consultorio, sembrado con Prisma, como se asignan los planes durante la beta. La
  autogestión solo existe en los planes de pago.
- **Cambio de plan:** la prueba cambia el plan o el estado de la suscripción con Prisma, como lo hace
  WizyDoc a mano durante la beta.

Convenciones:
- «El contador» son las citas contadas de la cuenta en el mes en curso de Lima: el `bookedThisMonth` de
  `GET /clinic/{clinicId}/booking-usage`.
- «El mensaje del tope» es el `h2` «Este consultorio no está recibiendo reservas en línea por ahora».
- {mes} es el nombre del mes en curso de Lima, y {mes siguiente}, el del siguiente, en minúscula
  («noviembre», «diciembre»). La prueba los calcula al empezar.
- «Coral» es el fondo `brand-coral` (`rgb(255, 111, 89)`); «teal», la variante `default` (`brand-teal`,
  `rgb(12, 126, 117)`), y `outline`, la variante con borde.
- En las pruebas de lo que ve el paciente, el nombre de la sede no contiene «plan», «tope» ni el nombre de
  un plan, para que CA-23 se pueda comprobar.

### El conteo (c-1 a c-9, SV-1, SV-2)

- **CA-1. [e2e]** Cada cita que un paciente reserva en el booking sube el contador en 1 en el momento en que se crea. En una sede lista con el contador en 0, un paciente sin sesión reserva desde la página y llega a «¡Cita reservada!»; después, el ADMIN ve en Inicio «1 de 10».
- **CA-2. [e2e]** Reservando de verdad, sin sembrar el contador: en una cuenta Gratis nueva con dos médicos en la sede, las reservas 1 a 10 del mes se aceptan, repartidas entre los dos. Después, el link muestra el mensaje del tope y una reserva más por el api recibe 409 `BOOKING_CLOSED`. En la base quedan exactamente 10 citas de esa cuenta (A-1).
- **CA-3. [e2e]** La fecha de la cita no importa (d-12, c-2): una cita reservada hoy para un día del mes siguiente, y otra para dentro de 300 días, suben el contador de este mes.
- **CA-4. [e2e]** Lo que no crea una cita no cuenta. El contador no cambia con una reserva que responde 400 (cuerpo inválido), 404 (sede inexistente, o médico o especialidad de otra sede) o 409 `SLOT_UNAVAILABLE` (horario no ofrecido o ya tomado). Con cupo de sobra, dos reservas simultáneas al mismo horario dejan una cita, y el contador sube en 1, no en 2.
- **CA-5. [e2e]** Las canceladas cuentan (d-13, c-4). En una cuenta de pago con el contador en 5, el paciente cancela su cita desde el link de autogestión: la cita queda cancelada y el contador sigue en 5.
- **CA-6. [e2e]** Reprogramar no cuenta (c-5). En una cuenta de pago, el paciente reprograma su cita desde el link a un horario del mes siguiente: es la misma cita (mismo id, ninguna cita nueva) y el contador no cambia.
- **CA-7. [e2e]** El tope es de toda la cuenta (c-7, cl-7). En una cuenta con dos sedes listas, cada una con un médico distinto, 5 reservas en una y 5 en la otra cierran el link de las dos: cada página muestra el mensaje del tope con el contacto de su sede, y la tarjeta dice que se llegó al tope desde el Inicio de cualquiera de las dos. Pasa lo mismo si las dos sedes son de organizaciones distintas de la misma cuenta.
- **CA-8. [e2e] [security]** Las cuentas no se mezclan: una cuenta con 9 contadas sigue con 9 y con el link abierto después de que otra cuenta reserva hasta llegar a su tope.
- **CA-9. [manual]** El mes es el calendario de Lima del instante en que el api acepta la reserva, con el servidor y el navegador en otro huso (c-3, SV-2). En el diff, el mes sale de `clinic-time.ts` y nunca del huso del servidor. Ejemplo para revisar el cálculo: una reserva aceptada el 30 de noviembre a las 23:30 de Lima (1 de diciembre, 04:30 UTC) cuenta en noviembre; una del 1 de diciembre a las 00:05 de Lima, en diciembre. `booking-usage` devuelve `month` y `renewsOn` de Lima, y la tarjeta los muestra sin pasarlos por el huso del navegador.
- **CA-10. [e2e]** El mes anterior no cuenta (pc-5, A-18). Con la cuenta en el tope el mes anterior y reservas perdidas de ese mes (la prueba siembra las dos cosas), este mes el link está abierto, la tarjeta dice «0 de 10» y no muestra reservas perdidas. Una reserva perdida del último día del mes anterior a las 23:59 de Lima no suma este mes; una del día 1 a las 00:00 de Lima, sí.
- **CA-11. [e2e]** Cuentan todas las citas creadas en el mes, también las anteriores al despliegue (d-17, cambiada el 29 de octubre de 2026). Una cuenta Gratis con 10 citas creadas este mes, sembradas directo en la base, tiene el link cerrado y la tarjeta dice que llegó al tope.
- **CA-12. [manual]** En el diff, el conteo no filtra por estado: canceladas, atendidas y, cuando exista, «no asistió» siguen contando (d-7).

### Concurrencia (c-8, SV-6)

- **CA-13. [e2e] [security]** Con 9 citas en el mes, dos reservas simultáneas a horarios distintos, de dos médicos de la sede, dejan exactamente un 200 y un 409 `BOOKING_CLOSED`. En la base hay una cita y una ficha nuevas, no dos. El contador queda en 10 y nunca en 11: la tarjeta dice «Llegaste al tope de 10 citas de tu plan Gratis», no «11 de 10». Hay una reserva perdida más. Sale la confirmación al paciente que entró, un solo aviso del 100 % al dueño y ningún correo a la dirección del paciente que no entró.
- **CA-14. [e2e]** Con 7 citas en el mes, dos reservas simultáneas entran las dos, quedan 9 y sale un solo aviso del 80 %.

### Topes por plan y cambios de plan (d-14, pc-1 a pc-6, SV-3)

- **CA-15. [e2e]** Cada plan frena en su tope. En Consultorio, con 149 contadas, la reserva siguiente entra y la que sigue recibe 409 `BOOKING_CLOSED`; en Clínica, lo mismo con 599. En Red, con 5,000 contadas, la reserva entra, el link sigue abierto y no hay tarjeta de uso.
- **CA-16. [e2e]** Sin suscripción o con la suscripción cancelada es Gratis (pc-3, cl-14): una cuenta sin suscripción y una de Consultorio con la suscripción cancelada, las dos con 10 contadas, tienen el link cerrado.
- **CA-17. [e2e]** Subir de plan vale al instante (pc-1). Una cuenta Gratis en el tope pasa a Consultorio: sin esperar, la siguiente visita al link muestra el wizard, la reserva entra y la tarjeta dice «Citas reservadas en {mes}» con «11 de 150». Una cuenta Consultorio en el tope que pasa a Clínica queda abierta, con «150 de 600». Las citas ya contadas se mantienen.
- **CA-18. [e2e]** Bajar de plan vale al instante (pc-2, cl-11). Una cuenta Consultorio con 120 contadas pasa a Gratis: el link se cierra en la siguiente visita y la tarjeta dice «Llegaste al tope de 10 citas de tu plan Gratis». Las citas ya reservadas siguen en la agenda y en la ficha, sin cambiar de estado.
- **CA-19. [e2e]** Un cambio de plan no envía correos por sí mismo, tampoco si cierra o abre el link (pc-4).

### El booking cerrado (t-1 a t-5, 5.2, VP-1 a VP-6)

- **CA-20. [e2e]** El paciente ve el mensaje al abrir el link (t-2). Con la cuenta en el tope y sin sesión, `/clinic/{clinicId}/create-appointment` muestra la cabecera de hoy (el médico y su especialidad, como en el primer paso del wizard, y «{sede} · {dirección}»), el mensaje del tope y el texto de su variante. No hay barra de progreso, «Paso…», opciones de especialidad, médico u horario, ni ningún campo. El título de la pestaña es el de hoy.
- **CA-21. [e2e]** Las variantes de contacto (5.2, VP-2, VP-3):

  | Contacto de la sede | Texto | Enlaces |
  | --- | --- | --- |
  | Celular `+51987654321` | «Para pedir una cita, escribe o llama al consultorio.» | «Escribir por WhatsApp», a `https://wa.me/51987654321` con el texto «Hola, quiero pedir una cita en {sede}.», en una pestaña nueva; y «Llamar al 987 654 321», a `tel:+51987654321` |
  | Fijo de Lima `+5112345678` | «Para pedir una cita, llama al consultorio.» | Solo «Llamar al (01) 234 5678», a `tel:+5112345678` |
  | Fijo de provincia `+5144123456` | «Para pedir una cita, llama al consultorio.» | Solo «Llamar al (044) 123 456», a `tel:+5144123456` |
  | Ninguno | «Vuelve a intentarlo más adelante.» | Ninguno |

- **CA-22. [e2e]** El tope se nota al confirmar (t-3, VP-4, VP-5). El paciente abre el link con 9 contadas y llega a «Tus datos»; mientras llena el formulario, el contador llega a 10. Al pulsar «Confirmar reserva» no ve «¡Cita reservada!» ni un toast: ve la página de CA-20 con el contacto de la sede, y el foco queda en el `h2` del mensaje. No se crean la cita ni la ficha (no existe ningún paciente con ese documento, correo o teléfono), la reserva rechazada no envía ningún correo y hay exactamente una reserva perdida más, no dos.
- **CA-23. [e2e] [security]** Al paciente nunca se le habla del plan (p-1, d-11). En las cuatro variantes de CA-21 y después del rechazo de CA-22, ni el texto visible ni los nombres accesibles contienen «plan», el nombre de un plan, «tope», «límite», «citas al mes», «Pedir», la fecha de reapertura («1 de {mes siguiente}»), cantidades de citas, «error», «Algo salió mal» ni «Tu plan no permite hacer uso de esta función».
- **CA-24. [e2e] [security]** El tope responde 409, nunca 402 (SV-8, A-8). Con la cuenta en el tope, un `POST /appointment` válido enviado sin pasar por la página responde 409 con el cuerpo exacto `{ "message": "Este consultorio no está recibiendo reservas en línea por ahora", "code": "BOOKING_CLOSED" }`, y no crea cita, ficha ni correo. Ninguna petición del booking (página, médicos, ubicación, estado del link, reserva perdida, reserva) responde 402.
- **CA-25. [e2e]** El tope gana al horario tomado (t-3, cl-12, SV-5). Con la cuenta en el tope, una reserva a un horario ya tomado responde 409 `BOOKING_CLOSED`, no `SLOT_UNAVAILABLE`. Una sede inexistente, o un médico o una especialidad de otra sede, siguen respondiendo 404 como hoy, también con el tope alcanzado, y no suman reservas perdidas.
- **CA-26. [e2e]** Sede sin médicos (t-5, VP-1): con la cuenta en el tope, una sede sin médicos con horario muestra «Esta sede todavía no tiene médicos disponibles para reservar citas.» y no el mensaje del tope, y la visita no suma reservas perdidas.
- **CA-27. [e2e] [security]** La página del link cerrado no pide ni carga nada de más (p-3, pv-6): no tiene campos ni formularios, no hace peticiones a otros orígenes que platform y el api (WhatsApp es solo un enlace) y no deja cookies en el navegador del paciente.
- **CA-28. [manual]** Si `GET booking-status` falla (forzado en local, sin commitear), el paciente ve el wizard, y si confirma con la cuenta en el tope ve el mensaje del tope. Si la ubicación de la sede no carga (C-2 del booking), la cabecera queda sin dirección y el texto de WhatsApp es «Hola, quiero pedir una cita.».

### La autogestión con el tope alcanzado (a-1 a a-3)

- **CA-29. [e2e]** Con una cuenta de pago en el tope, el paciente con link cancela su cita con un motivo, como siempre: la cita queda cancelada, salen los correos de cancelación de hoy al paciente y al médico, el contador no baja y el link sigue cerrado (c-4).
- **CA-30. [e2e]** En la misma cuenta, el paciente con link reprograma su cita a un horario del mes siguiente (a-2): la cita se reprograma, salen los correos de hoy, el contador no cambia y el link sigue cerrado. Las reglas de la autogestión (12 horas, una sola vez, mismo médico) no cambian.
- **CA-31. [e2e]** «Reservar otro horario», en la página de una cita cancelada, lleva al booking, que muestra el mensaje del tope (a-3).
- **CA-32. [e2e]** Las citas ya reservadas siguen igual (a-1, d-3): con la cuenta en el tope, «Citas de hoy» muestra las citas de hoy, y la ficha del paciente, su historial, como antes de llegar al tope.

### Inicio: el estado del link (m-3, IN-1 a IN-3)

- **CA-33. [e2e]** Con la cuenta en el tope y la sede lista, ADMIN, DOCTOR y USER ven en Inicio «Tu link no está recibiendo reservas este mes.» en lugar de «Tus pacientes ya pueden reservar desde el link.». Siguen «Copiar link de reservas», en `outline`, que copia el mismo link y muestra «¡Link copiado!», y «Ver como paciente», que abre la página de CA-20. DOCTOR y USER ven debajo «Un administrador de tu cuenta puede cambiar de plan.»; el ADMIN, no. Ningún rol ve «Tus pacientes ya pueden reservar desde el link.» mientras el link está cerrado (A-11).
- **CA-34. [e2e]** Por debajo del tope (0, 8 y 9 contadas), la fila es la de hoy (L-2 del #126) para todos los roles, con «Copiar link de reservas» en coral.
- **CA-35. [e2e]** Con la cuenta en el tope y una sede sin médicos en el link, quien no atiende en ella (USER o ADMIN sin perfil en la sede) ve el aviso L-3 de hoy, sin la fila de CA-33 (cl-5). El ADMIN ve además la tarjeta con «Llegaste al tope de 10 citas de tu plan Gratis».
- **CA-36. [e2e]** La guía con el link cerrado (IN-2, IN-3). Un DOCTOR sin especialidad, en una sede lista de una cuenta en el tope, ve la fila de CA-33 y, debajo, la guía «Te faltan 2 pasos para aparecer en el link de reservas» con «El link de {sede} ya tiene otros médicos.», no «ya recibe citas con otros médicos». El resto de la guía es el de hoy. Para un ADMIN que atiende y no aparece en el link, en el mismo caso, el orden es: fila del link, guía y tarjeta de uso.

### Inicio: la tarjeta de uso del ADMIN (7.1, TU-1 a TU-4)

- **CA-37. [e2e]** El ADMIN de la sede y el ADMIN de su organización ven la tarjeta en el Inicio de la sede, en Gratis, Consultorio y Clínica y en todos los estados, también con 0. En Red no hay tarjeta. El Inicio de la organización no la muestra.
- **CA-38. [e2e]** Estado normal (vistas 1 y 2). Con 0 y con 7 contadas, una `section` con el `h2` «Citas reservadas en {mes}», «0 de 10» o «7 de 10» y «Plan Gratis · Se renuevan el 1 de {mes siguiente}.». La tarjeta no tiene botones ni enlaces. En Consultorio con 119: «119 de 150» y «Plan Consultorio · Se renuevan el 1 de {mes siguiente}.».
- **CA-39. [e2e]** Cerca del tope (vistas 3 y 4). Con 8 y con 9 contadas, el `h2` «Llevas 8 de las 10 citas de tu plan en {mes}», «Cuando llegues a 10, tu link dejará de recibir reservas hasta el 1 de {mes siguiente}. Las citas ya reservadas no cambian.», «El plan Consultorio incluye 150 citas al mes.» y «Pedir el plan Consultorio» en teal. Si la sede no tiene contacto, además «Agrega un número para que tus pacientes puedan contactarte cuando no recibas reservas.» y «Agregar número» en `outline`; si lo tiene, la tarjeta no menciona el número. En Consultorio, este estado va de 120 a 149.
- **CA-40. [e2e]** Tope alcanzado (vistas 5 a 7). Con 10 contadas, el `h2` «Llegaste al tope de 10 citas de tu plan Gratis», «Tu link vuelve a recibir reservas el 1 de {mes siguiente}, o desde que pases al plan Consultorio, que incluye 150 citas al mes.» y, al final, «Pedir el plan Consultorio» en coral. Con contacto: «Tus pacientes ven el aviso «Este consultorio no está recibiendo reservas en línea por ahora» y el número 987 654 321.» y «Cambiar», cuyo nombre accesible es «Cambiar el número para tus pacientes». Sin contacto: «… y ningún número para contactarte.» y «Agregar número». Un fijo se muestra como «(01) 234 5678».
- **CA-41. [e2e]** La tarjeta nunca muestra más citas que el tope (m-2, cl-11): con 12 contadas en Gratis, tras una bajada de plan, dice «Llegaste al tope de 10 citas de tu plan Gratis», con la barra llena, y «12» no aparece.
- **CA-42. [e2e]** La mejora de plan nombra el plan siguiente y su tope (TU-3, u-2). Desde Consultorio: «El plan Clínica incluye 600 citas al mes.» al 80 %, «… o desde que pases al plan Clínica, que incluye 600 citas al mes.» en el tope y «Pedir el plan Clínica» (vista 8). Desde Clínica: «El plan Red se arma a la medida de tu red.», «… o desde que pases al plan Red, que se arma a la medida de tu red.» y «Pedir el plan Red». «Pedir el plan {plan}» es un enlace a `https://wa.me/51993953674` con el mensaje «Hola, soy {nombre} {apellido} ({correo}), de {sede}. Quiero activar el plan {plan} en WizyDoc.», en una pestaña nueva y sin toast.
- **CA-43. [e2e]** Reservas perdidas en la tarjeta (r-4, r-6). En el tope, con 0 no hay aviso; con 1, «Este mes, 1 paciente intentó reservar y no pudo.»; con 3, «Este mes, 3 pacientes intentaron reservar y no pudieron.». Suman las de todas las sedes de la cuenta.
- **CA-44. [e2e]** Las reservas perdidas solo se ven en el estado del tope de la tarjeta (S-b, r-6). Si la cuenta sube de plan y vuelve a tener cupo, la tarjeta deja de mostrarlas. No aparecen en el Inicio de DOCTOR y USER, en otras pantallas ni en los correos.

### Inicio: DOCTOR y USER (n-1, DP-3)

- **CA-45. [e2e]** DOCTOR y USER, con 0, 8 y 10 contadas, no ven la tarjeta, números de uso («de 10», «citas de tu plan»), reservas perdidas, el «Pedir el plan» del tope, «Agregar número» ni «Cambiar». En el tope ven solo la fila de CA-33.
- **CA-46. [e2e]** DP-3: en Gratis y Consultorio, DOCTOR y USER siguen viendo, con 0, 8 y 10 contadas, el aviso de plan de las métricas («Tu plan no permite hacer uso de esta función» y «Pedir el plan Clínica» en teal), como hoy.

### Inicio: una sola mejora de plan y un solo coral (DP-1, DP-2, G-4)

- **CA-47. [e2e]** DP-2: el ADMIN de una cuenta Gratis o Consultorio, al 80 % y en el tope, no ve el aviso de plan de las métricas: el único «Pedir el plan…» de la pantalla es el de la tarjeta. Por debajo del 80 % ve el aviso de las métricas como hoy, en teal.
- **CA-48. [e2e]** En el Inicio de una sede lista hay a lo sumo un elemento coral visible:

  | Contadas | ADMIN | DOCTOR y USER |
  | --- | --- | --- |
  | Menos del 80 % | «Copiar link de reservas» | «Copiar link de reservas» |
  | Del 80 % al tope menos 1 | «Copiar link de reservas». «Pedir el plan…» va en teal | «Copiar link de reservas» |
  | En el tope | «Pedir el plan {siguiente}». «Copiar link de reservas» va en `outline` | Ninguno. «Copiar link de reservas» va en `outline` |

  Con la guía de CA-36 y el link cerrado, el primer botón de la guía es teal. El aviso de plan de las métricas, cuando se ve, sigue en teal.

### El contacto para pacientes (sección 6 del PRD, k-1 a k-7, TU-4, SV-11)

- **CA-49. [e2e]** «Agregar número» (al 80 % o en el tope, sin contacto) y «Cambiar» (en el tope, con contacto) abren el diálogo «Número para tus pacientes», con «Lo verán tus pacientes cuando tu link no esté recibiendo reservas.», el campo «WhatsApp o teléfono para pacientes» (ejemplo «987 654 321», `type="tel"`, `inputmode="tel"`, `autocomplete="off"`) y la ayuda «Un celular de 9 dígitos o un fijo con su código, como (01) 234 5678. Si es un celular, tus pacientes también podrán escribirte por WhatsApp.». Con «Agregar número», el campo está vacío y no hay «Quitar número»; con «Cambiar», trae el número con formato («987 654 321») y «Quitar número». El foco empieza en el campo y vuelve al botón que abrió el diálogo al cerrarlo.
- **CA-50. [e2e]** Se aceptan y se guardan normalizados (k-4, SV-11): «987654321», «987 654 321» y «+51 987-654-321», como `+51987654321`; «(01) 234-5678» y «012345678», como `+5112345678`; «(044) 123456», como `+5144123456`. Al guardar: «Guardando...» con el botón deshabilitado, el toast «Guardamos el número para tus pacientes.», el diálogo se cierra y la tarjeta muestra el número sin recargar.
- **CA-51. [e2e]** «12345», «887654321», «98765432» y un texto con letras no se guardan: debajo del campo sale «Escribe un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad.», con `aria-invalid="true"` y el foco en el campo. El api responde 400 con el mismo mensaje.
- **CA-52. [e2e]** «Quitar número» borra el contacto sin pedir confirmación, muestra el toast «Quitamos el número.» y cierra el diálogo. La tarjeta vuelve a «… y ningún número para contactarte.», y la página del paciente, a «Vuelve a intentarlo más adelante.». Un `PUT` con `""` o con `null` también lo borra.
- **CA-53. [e2e]** El contacto empieza vacío en todas las sedes (k-7, d-15), también en una sede creada desde Sedes con teléfono y en la del primer uso. No se precarga con el teléfono de la sede ni con el celular del registro, y la página del paciente muestra la variante sin contacto hasta que un ADMIN lo agrega.
- **CA-54. [e2e]** De cara al paciente, el contacto solo aparece en la página del link cerrado (k-6, pv-5). Con un contacto guardado y el link abierto, no lo muestran el wizard, «¡Cita reservada!», las páginas de autogestión ni los correos al paciente y al médico, y `booking-status` lo devuelve en `null`. Cada sede muestra el suyo (k-1).
- **CA-55. [e2e] [security]** Quién lo edita (k-3), en `PUT /clinic/{resourceId}/patient-contact`: el ADMIN de la sede y el de su organización reciben 200 con `{ patientContact }` normalizado; DOCTOR y USER de la sede, 403, sin cambios; el ADMIN de otra cuenta, 404, sin cambios; con el id de una organización, 404; sin sesión, 401. Los ids del cuerpo (`accountId`, `clinicId` o `resourceId` de otra sede o de otra cuenta) no deciden nada: solo cambia la sede de la URL. DOCTOR y USER nunca ven el diálogo ni sus botones.
- **CA-56. [manual]** Si el `PUT` del contacto responde 403 (por ejemplo, porque al ADMIN le quitaron el rol con la página abierta), se ve el toast «Solo un administrador puede cambiar este número.», no el mensaje en inglés de la política.

### Los correos al dueño (7.3, SV-10, S-a)

- **CA-57. [e2e]** Aviso del 80 % (e-2, vista 21). La reserva que lleva el contador de 7 a 8 envía un correo al dueño de la cuenta, a su correo de usuario, con el asunto «Llevas 8 de las 10 citas de tu plan este mes», «Hola {nombre de pila},», el cuerpo de e-2 con {mes} y «1 de {mes siguiente}», «El plan Consultorio incluye 150 citas al mes.», «Pedir el plan Consultorio», que abre WhatsApp con WizyDoc, e «Ir a mi panel», que lleva a `/account/{accountId}/clinic/{clinicId}/dashboard` de la sede de la reserva. La reserva 9 no envía nada. En Consultorio, la reserva 120 envía «Llevas 120 de las 150 citas de tu plan este mes» y ofrece Clínica.
- **CA-58. [e2e]** Aviso del 100 % (e-3, vistas 22 y 23). La reserva que lleva el contador a 10 envía un correo con el asunto «Tu link de reservas ya no recibe citas este mes», el cuerpo de e-3, «En tu panel verás cuántos pacientes intentan reservar y no pueden.», «Pedir el plan Consultorio» e «Ir a mi panel». El paciente de esa reserva recibe su confirmación como siempre.
- **CA-59. [e2e]** Si la sede de la reserva no tiene contacto, los dos avisos suman «Tus pacientes no verán ningún número para contactarte. Puedes agregarlo desde tu panel.»; si lo tiene, no. En una cuenta con dos sedes, esa línea e «Ir a mi panel» son los de la sede de la reserva que provocó el aviso (S-a).
- **CA-60. [e2e]** Una vez por mes y por tope (e-2, e-3, pc-4). No envían avisos una reserva rechazada, una reserva perdida ni un cambio de plan. Una cuenta Gratis en el tope que sube a Consultorio no recibe nada hasta la reserva 120, que envía el 80 % de Consultorio. Si después vuelve a Gratis y otra vez a Consultorio, no se repite ningún aviso ya enviado en el mes.
- **CA-61. [e2e] [security]** Solo el dueño recibe los avisos (e-1): los demás ADMIN (de la organización o de la sede), DOCTOR y USER no reciben ninguno. Ningún aviso lleva el nombre, el documento, el teléfono o el correo de un paciente, ni la fecha u hora de una cita.
- **CA-62. [manual]** Si falla el envío de un aviso (forzado en local, sin commitear), la reserva que lo provocó responde 200, la cita queda creada, el contador no se revierte y no hay reintento. El error se registra con ids y sin datos personales. Las fechas de los avisos van en hora de Lima, sin rotular la zona horaria.

### Las reservas perdidas (7.2, pv-1 a pv-3, SV-7, SV-9, VP-6)

- **CA-63. [e2e]** Qué suma (r-1, r-2). Con la cuenta en el tope, un navegador sin sesión que abre el link suma 1. Recargar o volver a abrir el link ese mismo día en el mismo navegador no suma más; otro navegador (otro contexto) suma 1. El rechazo al confirmar de CA-22 suma 1, también si quien confirma tiene sesión del consultorio (S-c).
- **CA-64. [e2e] [security]** Qué no suma (r-3, t-5): la visita con sesión de un usuario de la cuenta (el ADMIN con «Ver como paciente», un DOCTOR o un USER), la visita a una sede sin médicos, la visita con el link abierto y la página pedida con el agente de usuario de una vista previa o de un buscador (`WhatsApp/2.23.20.0`, `facebookexternalhit/1.1`, `Googlebot/2.1`). Un `POST /clinic/{clinicId}/missed-bookings` directo con la cookie de la cuenta, a una sede sin médicos o con el link abierto responde 204 y no registra nada.
- **CA-65. [e2e] [security]** Qué se guarda (pv-1, pv-2). Después del rechazo de CA-22, con todos los datos del paciente llenos, la reserva perdida nueva tiene solo la cuenta, la sede y el momento: ni el médico, ni la especialidad, ni el horario, ni la IP, ni el navegador, ni un identificador del dispositivo.
- **CA-66. [e2e] [security]** La marca contra el doble conteo vive en el navegador (pv-3): después de la visita, `localStorage` tiene una clave con el `clinicId` y, como valor, la fecha de Lima (`AAAA-MM-DD`), sin ningún otro identificador. El servidor no guarda esa marca.
- **CA-67. [manual] [security]** Durante el rechazo de CA-22 y las llamadas a `missed-bookings`, los registros del api y de platform no tienen el nombre, el documento, el teléfono, el correo ni la fecha de nacimiento del paciente, ni siquiera en parte (iniciales, últimos dígitos).

### Endpoints nuevos y `POST /appointment` (pasan por el security-reviewer)

- **CA-68. [e2e] [security]** `GET /clinic/{clinicId}/booking-status`, sin sesión. Con el link abierto, `{ "isAcceptingBookings": true, "patientContact": null }`, aunque la sede tenga contacto; con el link cerrado, `{ "isAcceptingBookings": false, "patientContact": "+51…" }` o con `null`. Exactamente esas dos claves: ni plan, ni tope, ni cantidades, ni ids. El id de una organización o un UUID que no existe da 404 «Sede no encontrada», y un id que no es UUID, 400. Responde con `Cache-Control: private, no-store`.
- **CA-69. [e2e] [security]** `POST /clinic/{clinicId}/missed-bookings`: 204, registre o no. La reserva perdida queda en la cuenta de la sede de la URL. Un `accountId` o un `clinicId` de otra cuenta en el cuerpo no registran nada en esa cuenta (la petición responde 204 o 400, y la otra cuenta no cambia). El id de una organización o un UUID que no existe da 404, y un id que no es UUID, 400. Responde con `Cache-Control: private, no-store`.
- **CA-70. [e2e] [security]** `GET /clinic/{resourceId}/booking-usage`. El ADMIN de la sede o de su organización recibe 200 con las claves del plan (`plan`, `monthlyCap`, `month`, `renewsOn`, `bookedThisMonth`, `missedThisMonth`, `nextPlan`, `patientContact`), con los números de su cuenta y nada de pacientes; en Red, `monthlyCap` y `nextPlan` son `null`. DOCTOR y USER reciben 403; con una sede de otra cuenta o el id de una organización, 404; sin sesión, 401; sin cuenta, sin el correo confirmado o sin onboarding, 403. Los cuerpos de error no traen ids, nombres ni correos.
- **CA-71. [e2e] [security]** `POST /appointment` no cambia salvo por el 409 nuevo: sus 400, 404 y 409 `SLOT_UNAVAILABLE` conservan su cuerpo, sin `code`. El tope se mide en la cuenta de la sede validada: una reserva con la sede de una cuenta y el médico de otra responde 404 como hoy y no mueve el contador ni suma reservas perdidas en ninguna de las dos.
- **CA-72. [manual] [security]** En el diff: las cuatro rutas nuevas declaran la política del plan (`public: true` las dos públicas; `account`, `confirmed`, `onboarded` y `roles: ["ADMIN"]` las dos privadas), ninguna usa `requireFeature`, y las privadas responden 404 si `:resourceId` no es una sede. Toda lectura y escritura se acota por un `accountId` que deriva el servidor (de la sede validada en las públicas, de la sesión en las privadas); ninguna lo recibe del cliente. `missed-bookings` lee la sesión sin cambiar `policy.ts` ni `auth.ts`.

### Entitlements (d-18)

- **CA-73. [manual]** `api/src/domain/entities/subscription/plan.ts` define `monthlyAppointmentCap`: Gratis 10, Consultorio 150, Clínica 600 y Red `null`, y ya no tiene `includedDoctors`. `entitlements.ts` del dominio ya no tiene `maxDoctors` ni `extraDoctors`. El tope se lee de ahí en cada comprobación, sin caché ni otra copia de 10, 150 o 600 en el api, y la tarjeta toma los números de `booking-usage`.
- **CA-74. [manual] [security]** `api/src/plugins/entitlements.ts`, `api/src/plugins/policy.ts` y `api/src/plugins/auth.ts` no cambian. Si el engineer necesita tocar el plugin de entitlements, se detiene y pregunta al humano (d-18).
- **CA-75. [e2e]** Ningún plan limita médicos (d-2): una cuenta Gratis invita a 3 médicos a su sede sin 402 ni mensaje de plan. `GET /user/me` devuelve `entitlements` con `monthlyAppointmentCap: 10` y sin `maxDoctors`.
- **CA-76. [manual]** La migración es nueva (creada con `pnpm prisma:migrate` y reescrita a mano el 29 de octubre de 2026, con permiso del humano, al quitar el contador) y ninguna existente cambia. No borra `subscription.extra_doctors` ni `AddOnType.DOCTOR_SEAT`, y no rellena datos: el contacto queda nulo en todas las sedes y las reservas perdidas, vacías.

### Celular, accesibilidad y fallos

- **CA-77. [e2e]** A 375 px no hay desplazamiento horizontal en ninguna de estas pantallas: la página del link cerrado en sus variantes, con un nombre de sede y una dirección de 80 caracteres; el Inicio del ADMIN en los tres estados (con «Agregar número», con reservas perdidas y con contacto); el Inicio de un DOCTOR en el tope, y el diálogo del contacto. Los botones de la página cerrada van a lo ancho y miden al menos 44 px de alto; los de la tarjeta, al menos 40 px.
- **CA-78. [e2e]** La página cerrada tiene un solo `h1` (el de la cabecera), los íconos llevan `aria-hidden` y el nombre accesible de «Escribir por WhatsApp» incluye «(se abre en WhatsApp)». La tarjeta es una `section` con `aria-labelledby` hacia su `h2`, el número va en texto y la barra lleva `aria-hidden`. En el diálogo, la ayuda y el error se enlazan al campo con `aria-describedby`.
- **CA-79. [manual]** Las pantallas se ven como en el mockup aprobado, a 375 px y a 1280 px: colores e íconos de cada estado de la tarjeta, la página cerrada centrada desde `sm` y los avisos de 600 px de ancho. El orden de tabulación es: en Inicio, menú › «Copiar link de reservas» y «Ver como paciente» › guía › botones de la tarjeta › métricas › «Citas de hoy»; en la página cerrada, «Escribir por WhatsApp» › «Llamar al…» › pie; en el diálogo, campo › «Quitar número» › «Guardar» › cerrar.
- **CA-80. [manual]** Si falla `booking-usage` (forzado en local, sin commitear), no hay tarjeta, el aviso de plan de las métricas se ve como hoy y el resto de Inicio carga. Si falla `booking-status`, la fila del link se ve abierta. Los errores se registran sin datos personales.

### Sin regresiones

- **CA-81. [e2e]** El booking por debajo del tope no cambia: las pruebas de `e2e/ui/booking/`, `e2e/ui/clinic/public-booking.spec.ts`, `e2e/api/booking/` y las del booking en `e2e/api/security/` (`booking-schedule-validation`, `fix-booking-scope` y `fix-booking-patient-contact`) pasan sin cambiar sus expectativas.
- **CA-82. [e2e]** La autogestión no cambia: las pruebas de `e2e/api/appointments/` y `e2e/ui/appointment/` pasan sin cambiar sus expectativas.
- **CA-83. [e2e]** El Inicio del #126 por debajo del 80 % no cambia: `dashboard-link-status`, `dashboard-coral-and-mobile`, `first-steps`, `dashboard-booking-link`, `plan-feature-notice`, `today-appointments` y `today-appointments-treatment` pasan sin cambiar sus expectativas.
- **CA-84. [e2e]** Pasa la suite completa. Las pruebas de la tabla siguiente, si cambian, se adaptan al comportamiento nuevo y no se borran: cada una sigue comprobando lo que comprobaba.
- **CA-85. [manual]** Los documentos reflejan las decisiones (A-22): `docs/PRODUCT.md` («Planes», «Preguntas abiertas» y «Estado»), `docs/capacidades.md`, la landing (`web/src/components/marketing/pricing.tsx`: 150, 600 y «Citas sin tope», en las tarjetas y en la comparativa) y `platform/e2e/README.md` (pruebas nuevas, helpers y los CA de este plan). Los términos de `web/` no cambian.
- **CA-86. [typecheck]** `pnpm typecheck` y `pnpm check` limpios en `api`, `platform` y `web`.

### e2e que pueden cambiar

| Prueba | Cambia si… | Sigue comprobando | Criterios |
| --- | --- | --- | --- |
| `api/security/booking-schedule-validation.spec.ts` y `api/security/fix-booking-scope.spec.ts` | `code` se suma a todos los errores de la ruta (comparan con `toEqual` el cuerpo de un 409 y de un 404). Con SV-8 no cambian. | El status y el mensaje de cada rechazo. | CA-71 |
| `api/booking/clinic-location.spec.ts` | El estado del link se mete en `GET location`. | La ubicación de la sede y sus 404. | CA-68 |
| `api/account/beta-free-plan-only.spec.ts` y `support/db.ts` (`extraDoctors`) | Se borra la columna. CA-76 lo impide. | Que el onboarding solo crea Gratis. | CA-76 |
| `api/user/my-profile.spec.ts` | Compara algo más que las claves de primer nivel de `GET /user/me`. | Las claves de la respuesta. `entitlements` cambia por dentro (CA-75). | CA-75 |
| `ui/clinic/dashboard-coral-and-mobile.spec.ts` (#126) | La tarjeta normal tiene un coral o un «Pedir el plan…». CA-38 lo impide. | Un solo coral y nada de desplazamiento horizontal a 375 px. | CA-48 |
| `ui/clinic/dashboard-link-status.spec.ts` (#126) | La fila del link cambia sin tope alcanzado. CA-34 lo impide. | L-2 a L-4 del #126. | CA-33, CA-34 |
| `ui/clinic/plan-feature-notice.spec.ts` | La prueba llega al 80 %. Con 0 citas no cambia. | El aviso de plan de las métricas. | CA-46, CA-47 |

**Pasan por el security-reviewer:** CA-8, CA-13, CA-23, CA-24, CA-27, CA-55, CA-61, CA-64 a CA-72 y
CA-74.

## Preguntas abiertas (product-manager, 26 de octubre de 2026)

No entran en los criterios: los criterios cubren solo lo decidido.

| # | Pregunta | Opciones | Recomendación |
| --- | --- | --- | --- |
| P-1 | **Sede sin médicos en el link con la cuenta en el tope.** Desde #110, cada ADMIN de la organización queda como médico, sin especialidad ni horario, de cada sede nueva. En una cuenta Clínica en el tope, el ADMIN que abre una sede nueva vería dos corales: el primer paso de la guía (G-4, porque ese link no funciona) y «Pedir el plan» de la tarjeta (DP-1). Además, la tarjeta le diría «Tus pacientes ven el aviso «Este consultorio no está recibiendo reservas…»», cuando en esa sede ven «Esta sede todavía no tiene médicos disponibles…» (t-5). CA-35 y CA-48 no cubren este caso. | **a)** En una sede sin médicos en el link, «Pedir el plan» va en teal (la guía conserva el coral) y la tarjeta no muestra la línea de lo que ven los pacientes, con su «Agregar número» o «Cambiar». **b)** Dejarlo como está y aceptar los dos corales y la línea inexacta. | **a.** G-4 dice un solo coral por pantalla, y lo primero en esa sede es tener un médico en el link: subir de plan no le trae citas. El panel no debe describir una pantalla que el paciente no ve. |
| P-2 | **El aviso del 80 % después de una bajada de plan.** El aviso sale cuando una reserva lleva el contador justo al 80 % (SV-10). Si una bajada deja el contador entre el 80 % y el tope del plan nuevo (por ejemplo, Consultorio con 8 que pasa a Gratis), ese mes el dueño no recibe el aviso del 80 %: solo el del 100 %. | **a)** Aceptarlo. **b)** Enviar el 80 % con la siguiente reserva si ese mes no salió para ese tope (obliga a guardar qué avisos salieron). | **a.** La tarjeta muestra el estado «cerca del tope» desde el primer momento, y durante la beta los cambios de plan los hace WizyDoc a mano, así que sabe cuándo pasa. |
