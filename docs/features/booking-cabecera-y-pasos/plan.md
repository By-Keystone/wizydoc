# Plan: cabecera y pasos del booking público

**Rama:** `feat/booking-header-and-steps`, desde `origin/main` (ya incluye el PR #119).
**Fecha:** 24 de octubre de 2026
**Mockup:** `docs/features/booking-cabecera-y-pasos/mockup.html`, aprobado el 24 de octubre de
2026. Aplica las decisiones del humano (la opción a de d-1, d-2 y d-3) y tiene interruptores
para ver las alternativas.
**Antecedentes que siguen vigentes:**
- PR #119: `GET /clinic/:clinicId/location` → `{ name, address }`, que la página ya carga como
  `clinic: ClinicLocation | null`, y `AppointmentSummary` y `formatWhen` en
  `platform/src/components/booking/`.
- `docs/features/perfil-usuario/plan.md`, N-1 y t-2: el nombre del médico es el `displayName`
  que arma el api. Platform no arma nombres ni deduce el tratamiento.
- `docs/features/autogestion-paciente/mockup.html` (aprobado): en el celular el contenido de la
  página pública empieza arriba, no centrado.

## Objetivo

Desde la primera pantalla, el paciente ve con quién y dónde reserva. Solo elige lo que tiene
más de una opción, así que con el médico independiente (una especialidad y un médico) llega
directo a los horarios. Además, lo elegido se distingue con sol y el calendario tiene espacio
a 375 px.

## Decisiones del humano

El humano aprobó el plan y el mockup el 24 de octubre de 2026, con las tres recomendaciones.

| # | Pregunta | Opciones | Recomendación | Decisión |
| --- | --- | --- | --- | --- |
| d-1 | ¿Qué nombre encabeza la reserva? | **a)** Si el médico ya está definido (es el único o el paciente lo eligió), su `displayName` y su especialidad. Si no, el nombre de la sede. Debajo van la sede y su dirección. Usa lo que el api ya devuelve. **b)** Siempre la sede como título y el médico debajo. **c)** Agregar el nombre de la organización («Clínica San Gabriel») a la sede: obliga a ampliar `GET /clinic/:clinicId/location`, que es público, y pasa por el security-reviewer. | **a.** El paciente reserva con una persona, y en el caso que más importa (el médico independiente) esa persona es la cuenta. Además, no toca el api. | **a**, el 24 de octubre de 2026. |
| d-2 | ¿Dónde va el logo de WizyDoc en las páginas del paciente (booking y autogestión, que comparten `PublicPageShell`)? | **a)** Al pie, pequeño y sin enlace, encima del «© WizyDoc», para que arriba quede solo el consultorio. **b)** Arriba como hoy, pero sin enlace. **c)** Al pie, con enlace a wizydoc.app. | **a.** Arriba manda el consultorio: así el paciente no duda de con quién reserva. Además, en el celular se ganan unos 70 px. El enlace no le sirve al paciente y lo saca de la reserva. | **a**, el 24 de octubre de 2026. |
| d-3 | ¿De qué color es lo elegido (especialidad, médico, día y hora)? | **a)** `brand-teal-dark` sólido con texto blanco: contraste de 9,4:1. **b)** `brand-teal` sólido con texto blanco, como el horario elegido en la landing: 4,1:1, por debajo de AA para texto de 14 px. | **a.** Se lee con sol, está dentro de la paleta y no se confunde con el botón «Siguiente», que es teal. | **a**, el 24 de octubre de 2026. |

## Reglas de este plan

### Pasos

- **P-1. Se salta el paso que tiene una sola opción.**
  - La especialidad se pide solo si la sede ofrece más de una.
  - El médico se pide solo si la especialidad elegida, o la única, tiene más de un médico.
  - El horario y los datos se piden siempre.
  - Lo que se salta queda elegido y se envía al api igual que si el paciente lo hubiera
    tocado.
- **P-2. Recorridos posibles.**

  | Sede | Pasos | Empieza en |
  | --- | --- | --- |
  | 1 especialidad, 1 médico (médico independiente) | Horario → Tus datos (2) | Horario |
  | 1 especialidad, varios médicos | Médico → Horario → Tus datos (3) | Médico |
  | 1 médico con varias especialidades | Especialidad → Horario → Tus datos (3) | Especialidad |
  | Varias especialidades; la elegida tiene 1 médico | Especialidad → Horario → Tus datos (3) | Especialidad |
  | Varias especialidades; la elegida tiene varios médicos | Especialidad → Médico → Horario → Tus datos (4) | Especialidad |

- **P-3. Barra de progreso.**
  - Tiene un tramo por cada paso visible del recorrido.
  - Mientras no se elige la especialidad, el paso del médico cuenta si alguna especialidad tiene
    más de un médico. Por eso, al elegir una especialidad con un solo médico, la barra pasa de 4
    a 3 tramos. Se acepta.
  - Los lectores de pantalla oyen «Paso X de Y».
- **P-4. «Atrás».**
  - Vuelve al paso visible anterior.
  - En el primer paso visible no hay «Atrás», y «Siguiente» ocupa todo el ancho.
  - Al volver, la especialidad y el médico elegidos siguen marcados. El día y la hora se eligen
    de nuevo, como hoy.
- **P-5. Cambiar de especialidad** borra el médico elegido. Si la especialidad nueva tiene un
  solo médico, ese queda elegido.
- **P-6. «Reserva de nuevo»** vuelve al primer paso visible, con lo que se salta ya elegido
  (P-1).

### Cabecera

- **C-1. Qué muestra.** Muestra lo que ya está definido, no lo que el paciente acaba de tocar:
  la cabecera cambia al pulsar «Siguiente».

  | Situación | Antetítulo | Título (`h1`) | Línea teal oscuro | Línea con ícono de ubicación |
  | --- | --- | --- | --- | --- |
  | Médico definido y sede cargada | «Reserva tu cita con» | `doctor.displayName` | especialidad, si está definida | «{sede} · {dirección}» |
  | Médico definido y sede sin cargar | «Reserva tu cita con» | `doctor.displayName` | especialidad, si está definida | — |
  | Médico sin definir y sede cargada | «Reserva tu cita en» | nombre de la sede | especialidad, si está definida | dirección |
  | Médico sin definir y sede sin cargar | — | «Reserva tu cita» | especialidad, si está definida | — |

  - «Médico definido» significa que el paciente ya lo eligió o que es el único de la sede. En
    ese segundo caso aparece desde el primer paso, también cuando el médico tiene varias
    especialidades.
  - «Especialidad definida» significa que el paciente ya la eligió o que es la única.
  - Si una parte de la línea de ubicación viene vacía, se omite.
- **C-2. No depende de la sede.** Si `GET /clinic/:clinicId/location` falla, la reserva sigue
  completa con las filas «sede sin cargar» de C-1.
- **C-3. Dónde se ve.** Va arriba de la tarjeta en todos los pasos menos en «¡Cita
  reservada!», cuyo resumen ya trae médico, sede y dirección. También aparece en el estado «sin
  médicos».
- **C-4. Título de la pestaña.** Hoy dice «WizyDoc — Panel», el del panel de las clínicas.
  Pasa a usar el texto inicial del `h1`, más «· WizyDoc»:
  - «Reserva tu cita con Dra. Lucía Paredes Quispe · WizyDoc», si la sede tiene un solo médico;
  - «Reserva tu cita en {sede} · WizyDoc», si tiene varios;
  - «Reserva tu cita · WizyDoc», si la sede no cargó y hay varios médicos.

  Es lo que muestra la vista previa de un enlace en WhatsApp. La página sigue con `noindex`.

### Lo elegido y el calendario

- **E-1. Tres estados para cada opción** (especialidad, médico, día y hora).

  | Estado | Clases (con la recomendación de d-3) |
  | --- | --- |
  | Disponible | `border-gray-200 bg-white text-brand-ink hover:bg-gray-50` |
  | Elegido | `border-brand-teal-dark bg-brand-teal-dark text-white`. En especialidad y médico se suma un ícono `Check` a la derecha, para que la selección no dependa solo del color. |
  | No disponible (solo días) | `border-transparent text-gray-400`, sin fondo y `disabled` |

  - Todas las opciones llevan `aria-pressed` y foco visible
    (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`).
  - Hoy, lo disponible y lo no disponible son casi iguales (texto gris sobre la tarjeta gris).
    La baldosa blanca es la que marca lo que se puede tocar.
- **E-2. Calendario a 375 px.**
  - La tarjeta usa 20 px de relleno en el celular (`p-5`) y 32 px desde `sm` (`sm:p-8`). Quedan
    unos 300 px útiles, frente a los 279 de hoy.
  - Cada día mide al menos 37 px de ancho y 52 px de alto, con el número en `text-base
    font-semibold`.
  - Las flechas de semana pasan de 28 a 40 × 40 px.
  - Los horarios siguen en 4 columnas, de unos 69 px cada una.
- **E-3. Página pública.** En el celular el contenido empieza arriba (`items-start pt-4`); desde
  `sm` vuelve a centrarse (`sm:items-center sm:py-12`). Así la tarjeta no salta de altura entre
  pasos, como en el mockup aprobado de la autogestión.

## Cambios por capa

### Prisma

Ninguno. No hace falta migración.

### api

Ninguno: no se crea ni se cambia ningún endpoint.

Rutas que se usan sin cambios:

| Ruta | Policy | Para qué |
| --- | --- | --- |
| `GET /clinic/:clinicId/doctors` | `policy({ public: true })` | Médicos con `doctorProfileId`, `displayName` y `specialties`. Decide los pasos (P-1) y la cabecera. |
| `GET /clinic/:clinicId/location` | `policy({ public: true })` | `{ name, address }` de la sede para la cabecera. Puede faltar (C-2). |
| Horarios por `getDoctorSlotsAction` | La de hoy | Sin cambios. |
| `POST /appointment` por `createAppointmentAction` | La de hoy | Mismo cuerpo: `doctorProfileId`, el nombre de la especialidad y `clinicId`. |

### platform

Las rutas y la forma de implementarlo son un punto de partida: las decide el engineer.

| Archivo | Cambio |
| --- | --- |
| `platform/src/components/common/public-page-shell.tsx` | Según d-2: el logo deja de enlazar a `/login` (no le sirve al paciente) y, con la recomendación, pasa al pie. `main` aplica E-3. **Lo comparte la autogestión** (`app/appointment/manage/[token]/layout.tsx`), que cambia igual. |
| `platform/src/app/clinic/[clinicId]/create-appointment/booking-wizard.tsx` | Recorrido por pasos visibles (P-1 a P-6), valores iniciales de lo que se salta, `BookingHeader` arriba (C-3), barra con el total del recorrido (P-3), relleno de E-2 y foco en el título del paso nuevo al cambiar de paso. |
| `platform/src/app/clinic/[clinicId]/create-appointment/booking-header.tsx` (nuevo) | `BookingHeader({ clinic: ClinicLocation \| null, doctor: ClinicDoctor \| null, specialty: { name: string } \| null })`. Aplica C-1. Se justifica porque lo usan el wizard (cliente) y el estado «sin médicos» (servidor). |
| `platform/src/app/clinic/[clinicId]/create-appointment/steps/specialty-step.tsx` | E-1, `aria-pressed` y selección inicial (P-4). El texto de ayuda cambia (ver Textos). |
| `platform/src/app/clinic/[clinicId]/create-appointment/steps/doctor-step.tsx` | E-1, `aria-pressed`, selección inicial y `onBack` opcional, porque puede ser el primer paso. Recibe el nombre de la especialidad para su texto de ayuda. |
| `platform/src/app/clinic/[clinicId]/create-appointment/steps/stepper-progress.tsx` | Agrega el texto «Paso X de Y» para lectores de pantalla (P-3). Las barras quedan iguales. |
| `platform/src/components/booking/datetime-step.tsx` | E-1, E-2, `aria-pressed` y `onBack` opcional. **También lo usa la reprogramación de la autogestión**, que gana los mismos estados; allí `onBack` se sigue pasando. |
| `platform/src/app/clinic/[clinicId]/create-appointment/page.tsx` | El estado «sin médicos» usa `BookingHeader` (sede o «Reserva tu cita») en lugar del `h1` «Reservar cita». Título de la pestaña (C-4). |
| Clases de E-1 | Las comparten cuatro botones (especialidad, médico, día y hora). Si conviene, van en una constante de `platform/src/components/booking/`. |

No cambian `AppointmentSummary`, los clientes de `lib/api` ni las server actions. De
`PatientStep` y `SuccessStep` solo cambia el `tabIndex={-1}` de su `h2`, para poder llevarle el
foco al cambiar de paso (CA-15).

## Aislamiento entre cuentas

No se lee ni se escribe ningún dato nuevo, y no hay endpoints nuevos.

| Dato | De dónde sale | Cómo queda acotado |
| --- | --- | --- |
| Nombre y dirección de la sede | `GET /clinic/:clinicId/location`, público desde #119 | `clinic.findUnique({ where: { resourceId: clinicId } })`: solo responde por sedes (una organización da 404) y expone `name` y `address`, sin teléfono. La dirección ya se veía en «¡Cita reservada!», en la autogestión y en el correo; ahora también se ve antes de reservar. |
| Médicos y especialidades | `GET /clinic/:clinicId/doctors`, público | Memberships DOCTOR vivas de esa sede, con horarios. Solo trae especialidades de la organización padre. |
| Cita | `POST /appointment`, sin cambios | El api valida que el médico sea de la sede y la especialidad del médico (`fix-booking-scope`). Saltar pasos no cambia los ids enviados: son los mismos que el paciente habría tocado. |

La cabecera solo combina las dos lecturas de un mismo `clinicId`, el de la URL, así que nunca
mezcla datos de dos sedes.

## UI

### Rutas y layout

| Ruta | Layout | Qué cambia |
| --- | --- | --- |
| `/clinic/[clinicId]/create-appointment` | `create-appointment/layout.tsx` → `PublicPageShell` | Todo este plan. |
| `/appointment/manage/[token]` | `appointment/manage/[token]/layout.tsx` → `PublicPageShell` | El logo (d-2), la alineación en el celular (E-3) y los estados del calendario al reprogramar (E-1 y E-2). Su contenido no cambia. |

### Árbol de componentes

```
PublicPageShell (modificado: logo según d-2, main según E-3)
└─ main
   ├─ page.tsx, sin médicos → Card > div p-5 sm:p-8 > BookingHeader + texto
   └─ BookingWizard (modificado)
      └─ Card (ui/card) > div p-5 sm:p-8
         ├─ BookingHeader (nuevo) ← clinic, médico definido, especialidad definida   [pasos 1 a 4]
         ├─ StepperProgress (modificado) ← paso actual y total del recorrido          [pasos 1 a 4]
         ├─ SpecialtyStep (modificado) ← especialidades, elegida inicial
         ├─ DoctorStep (modificado) ← médicos de la especialidad, nombre de la especialidad, elegido inicial, onBack?
         ├─ DateTimeStep (components/booking, modificado) ← doctorProfileId, onBack?
         ├─ PatientStep (sin cambios)
         └─ SuccessStep (sin cambios; sin cabecera ni barra)
```

### Qué dato alimenta cada parte

| Parte | Dato |
| --- | --- |
| Título y especialidad de la cabecera | `GET /clinic/:clinicId/doctors` (`displayName`, `specialties[].name`), más lo elegido en el wizard |
| Ubicación de la cabecera | `GET /clinic/:clinicId/location` (`name`, `address`) |
| Pasos visibles y barra | Cantidad de especialidades y de médicos por especialidad (P-1) |
| Días y horarios | `getDoctorSlotsAction` (`days`, `durationMinutes`), como hoy |
| Título de la pestaña | Los mismos dos `GET` (C-4) |

### Textos

| Dónde | Hoy | Pasa a |
| --- | --- | --- |
| Antetítulo de la cabecera | — | «Reserva tu cita con» (médico) o «Reserva tu cita en» (sede) |
| `h1` sin médico ni sede | — («Reservar cita» solo en el estado sin médicos) | «Reserva tu cita» |
| Ayuda del paso de especialidad | «Elige la especialidad para ver los doctores disponibles.» | «Elige la especialidad de tu consulta.» Con un solo médico, tras elegir no hay lista de doctores. |
| Ayuda del paso del médico | «Doctores disponibles para la especialidad seleccionada.» | «Doctores disponibles para {especialidad}.» Con una sola especialidad, el paciente no eligió ninguna. |
| Lectores de pantalla | — | «Paso X de Y» |
| Pestaña | «WizyDoc — Panel» | C-4 |

El resto de los textos no cambia. «Doctor» y «médico» se dejan como están: el vocabulario está
fuera de alcance.

### Estados

| Estado | Qué se ve |
| --- | --- |
| Normal | Los cinco recorridos de P-2, con la cabecera de C-1. |
| Carga de la página | `loading.tsx`: «Cargando reserva...», sin cabecera porque todavía no hay datos. Solo cambia el shell. |
| Carga de horarios | Cabecera, barra, semana con los días deshabilitados y «Cargando horarios...». |
| Horarios que no cargan | Cabecera, barra y «No se pudieron cargar los horarios.» en rojo, como hoy. |
| Sede que no cargó | La reserva funciona completa, con la cabecera sin ubicación (C-1 y C-2). |
| Vacío (sin médicos con horarios) | Cabecera con la sede (o «Reserva tu cita» si no cargó) y «Esta clínica todavía no tiene doctores disponibles para reservar citas.», sin barra. |
| Error de la página | `error.tsx` con `ErrorState`: «Algo salió mal», «No pudimos cargar la reserva. Vuelve a intentarlo.» y «Reintentar». Solo cambia el shell. Ver r-6. |
| 403 | No aplica: la página es pública y no tiene sesión. |
| 402 | No aplica: la reserva va en todos los planes. Cuando exista el tope de citas, su mensaje («Este consultorio no está recibiendo reservas en línea por ahora») irá debajo de esta misma cabecera. No es de este ticket. |

### Interacciones

- **Tocar una opción** la marca como elegida (E-1) y habilita «Siguiente». En especialidad y
  médico solo puede haber una elegida.
- **«Siguiente»** confirma la elección, actualiza la cabecera (C-1) y pasa al siguiente paso
  visible (P-1 y P-5). El foco va al `h2` del paso nuevo, que se desplaza a la vista.
- **«Atrás»**: ver P-4.
- **Flechas de semana:** como hoy. La semana anterior se deshabilita en la semana actual.
- **«Confirmar reserva»** y **«Reserva de nuevo»:** igual que hoy, más P-6.
- No hay toasts nuevos. El error al confirmar sigue saliendo como toast, como hoy.
- No hay redirecciones.

### Diferencias por rol

No hay roles: el paciente no tiene sesión. La página es igual en todas las cuentas y planes.

### Accesibilidad

- **Encabezados.**
  - Del primer paso a «Tus datos» y en el estado sin médicos, el único `h1` es el de la
    cabecera. Su nombre accesible incluye el antetítulo («Reserva tu cita con Dra. Lucía
    Paredes Quispe»).
  - Los títulos de cada paso siguen siendo `h2`.
  - «¡Cita reservada!» no lleva cabecera y conserva su `h2` de hoy: ese paso está fuera de
    alcance.
  - El ícono de la cabecera y el `Check` llevan `aria-hidden`.
- **Opciones.** Las opciones son botones con `aria-pressed`. Los días sin horarios usan
  `disabled` y el tabulador se los salta.
- **Foco.** Al cambiar de paso, el foco va al `h2` del paso nuevo (`tabIndex={-1}`). Hoy se
  pierde cuando el botón pulsado desaparece.
- **Orden de tabulación.** La cabecera no tiene nada que tabular. Después vienen las opciones
  del paso en orden de lectura (en el horario: semana anterior, semana siguiente, días y
  horarios), luego «Atrás», si lo hay, y por último «Siguiente».
- **Contraste.**

  | Elemento | Contraste |
  | --- | --- |
  | Elegido, con d-3 en a | 9,4:1 |
  | Disponible (`brand-ink` sobre blanco) | 14,6:1 |
  | Especialidad de la cabecera (`brand-teal-dark` sobre `brand-surface`) | 8,6:1 |
  | Ubicación (`brand-gray` sobre `brand-surface`) | 5,1:1 |
  | Días no disponibles | Exentos, porque están deshabilitados |

- **Tamaño táctil.** Todas las zonas táctiles miden al menos 37 × 40 px.
- **Textos largos.** Los nombres y direcciones largos se parten en varias líneas y nunca
  provocan desplazamiento horizontal a 375 px.

## Riesgos y casos límite

| Id | Caso | Qué pasa |
| --- | --- | --- |
| r-1 | La sede tiene un nombre pensado para el panel («Sede 1») | Sale arriba tal cual. Ya se veía en «¡Cita reservada!» y en la autogestión. Hoy no hay forma de renombrar una sede. |
| r-2 | La barra pasa de 4 a 3 tramos | Ocurre al elegir una especialidad con un solo médico en una sede con varias. Aceptado en P-3. |
| r-3 | El shell es compartido | La autogestión pierde el logo de arriba (con d-2 en a) y en el celular arranca arriba. Sus e2e no miran el logo. |
| r-4 | `DateTimeStep` es compartido | La reprogramación ve los nuevos estados. Sus e2e buscan días y horas por nombre, no por clase. |
| r-5 | Hay e2e que recorren especialidad y médico | Se rompen porque esos pasos ya no salen. Se cambian en el mismo PR (ver Verificación). |
| r-6 | Si `GET /clinic/:clinicId/doctors` falla, hoy la página muestra «Esta clínica todavía no tiene doctores…» en lugar del error (`page.tsx` captura el fallo) | Se observó al revisar. Queda fuera de alcance: va en un fix aparte. |
| cl-1 | El médico tiene dos especialidades en una sede con varios médicos | Aparece en las dos listas, como hoy. |
| cl-2 | Al volver de «Tus datos» al horario | Se pierden el día y la hora elegidos, como hoy (P-4). |
| cl-3 | La sede no cargó y hay varios médicos | La cabecera dice «Reserva tu cita» hasta que hay médico; después muestra su nombre y su especialidad. |
| cl-4 | El médico no tiene tratamiento registrado | La cabecera muestra solo su nombre completo (N-1 de `perfil-usuario`). |

## Fuera de alcance

- El uso del coral, el vocabulario del resto del panel, los colores fuera de la paleta, «Mi
  día» y los estados de cita.
- Los pasos «Tus datos» y «¡Cita reservada!», salvo que el éxito no lleva cabecera (C-3).
- Elegir «cualquier médico» o el primer horario libre entre varios médicos.
- Avanzar solo al tocar una opción.
- Recordar el día y la hora al volver de «Tus datos».
- El aviso de privacidad del booking: `docs/features/aviso-privacidad-booking/` está vacío, así
  que no choca con nada. Si agrega un enlace al pie, va junto al logo.
- El fallo de r-6.

## Verificación

### Typecheck y check

`cd platform && pnpm typecheck && pnpm check`, limpios. El api no cambia.

### Navegador

A 375 px y a 1280 px, sin sesión:
1. **Médico independiente** (1 especialidad y 1 médico). Empieza en «Elige fecha y horario», con
   2 tramos y sin «Atrás». La cabecera dice «Reserva tu cita con {médico}», la especialidad y
   «{sede} · {dirección}». Se reserva de punta a punta, y «Reserva de nuevo» vuelve al horario.
2. **1 especialidad y 3 médicos.** Empieza en el médico, con 3 tramos. Antes de elegir, la
   cabecera muestra la sede. Al pulsar «Siguiente», muestra al médico. «Atrás» vuelve con el
   médico marcado.
3. **Varias especialidades,** una con un solo médico y otra con dos. Con la primera, 3 tramos y
   sin paso de médico. Con la segunda, 4 tramos.
4. **1 médico con dos especialidades.** Empieza en la especialidad y la cabecera ya muestra al
   médico. Después de elegir, salta al horario.
5. **Sede que no cargó.** En local, sin commitear, se fuerza `clinic = null` en `page.tsx`. La
   reserva sigue completa y la cabecera no muestra ubicación. Borrar la fila `clinic` no sirve:
   `POST /appointment` la necesita y responde 404 sin ella.
6. **Estados de E-1.** Lo elegido es sólido y se distingue de lo disponible (baldosa blanca) y de
   lo no disponible (sin baldosa). A 375 px no hay desplazamiento horizontal.
7. **Autogestión** (`/appointment/manage/{token}`). El logo y la alineación cambian según d-2 y
   E-3, y el calendario de «Reprogramar» muestra los estados nuevos.
8. **Pestaña.** El título sigue C-4.

### e2e (`cd platform && pnpm test:e2e`)

Se corre la suite completa, porque cambian el shell compartido y `DateTimeStep`.

Estas pruebas recorren pasos que ya no salen y se cambian en el mismo PR:

| Prueba | Por qué cambia |
| --- | --- |
| `e2e/ui/clinic/public-booking.spec.ts` (las 2) | Con 1 especialidad y 1 médico, la reserva empieza en el horario. |
| `e2e/ui/booking/public-booking-specialty-scope.spec.ts` | Queda una especialidad propia y un médico, así que no hay paso 1. La especialidad ajena no debe aparecer en ninguna parte, tampoco en la cabecera. |
| `e2e/ui/booking/public-booking-requires-schedule.spec.ts` | Solo queda 1 médico con horarios y espera el `h2` «¿Qué especialidad necesitas?», que ya no sale. La intención (no ofrecer la especialidad del médico sin horarios) se comprueba en la cabecera y en que ese nombre no aparezca. |
| `e2e/ui/booking/public-booking-treatment.spec.ts` | Con 1 especialidad y 2 médicos, ya no se elige especialidad: la reserva empieza en el médico. |
| `e2e/ui/profile/profile-edit.spec.ts` (`bookingDoctorNames`, CA-52) | Con un solo médico, su nombre ya no es un botón: es el `h1` de la cabecera. |
| `e2e/ui/organization/assign-from-organization.spec.ts` (`openDoctorStep`) | Hace clic en la especialidad, y la sede del escenario tiene una sola. |
| `e2e/ui/appointment/appointment-portal.spec.ts` | No debería cambiar, porque busca días y horas por nombre. Se corre igual. |

`platform/e2e/README.md` se actualiza en sus filas de booking. Las pruebas nuevas salen de los
criterios del product-manager.

**Sin verificar en este plan:** cómo se ve la vista previa del enlace en WhatsApp con el título
nuevo (C-4).

## Criterios de aceptación

Los marcados **[e2e]** los cubre el e2e-tester con Playwright. Los **[a mano]** se comprueban en
el navegador o en el diff, y el **[typecheck]**, con `pnpm typecheck` y `pnpm check`. Salvo que
se diga otra cosa, todo se prueba sin sesión y a 375 px. Los médicos tienen horarios todos los
días, y la sede tiene nombre, dirección y teléfono. «Paso X de Y» es el texto para lectores de
pantalla de P-3.

Escenarios (los de P-2):
- **Independiente:** 1 especialidad y 1 médico.
- **Equipo:** 1 especialidad y 3 médicos.
- **Multiespecialidad:** 1 médico con 2 especialidades.
- **Clínica:** la especialidad A tiene 2 médicos y la B tiene 1.
- **Clínica simple:** 2 especialidades, con un médico distinto cada una.
- **Sede sin cargar:** el e2e la provoca borrando con Prisma la fila `clinic` de una sede sin
  citas, así `GET /clinic/:clinicId/location` no devuelve la sede. Los médicos y los horarios no
  leen esa fila, pero `POST /appointment` sí (`create-appointment.usecase.ts`). Con este método
  se llega hasta «Tus datos», pero no se puede confirmar: la reserva completa sin sede se
  comprueba a mano (CA-24).

### Recorridos (P-1 a P-3)

- **CA-1. [e2e]** Independiente: al abrir el link, el primer paso es «Elige fecha y horario», con «Paso 1 de 2». No aparecen «¿Qué especialidad necesitas?» ni «Elige un doctor», ni botones con el nombre de la especialidad o del médico. Tras elegir día y hora, «Siguiente» lleva a «Tus datos» («Paso 2 de 2»), y la reserva termina en «¡Cita reservada!».
- **CA-2. [e2e]** Equipo: el primer paso es «Elige un doctor» («Paso 1 de 3»), con la ayuda «Doctores disponibles para {especialidad}.» y un botón por médico. Después vienen «Elige fecha y horario» («Paso 2 de 3») y «Tus datos» («Paso 3 de 3»). No aparece «¿Qué especialidad necesitas?».
- **CA-3. [e2e]** Multiespecialidad: el primer paso es «¿Qué especialidad necesitas?» («Paso 1 de 3»), con la ayuda «Elige la especialidad de tu consulta.». Al elegir una y pulsar «Siguiente», va a «Elige fecha y horario» («Paso 2 de 3»), sin pasar por «Elige un doctor».
- **CA-4. [e2e]** Clínica: el paso de la especialidad dice «Paso 1 de 4». Con B, «Siguiente» lleva a «Elige fecha y horario» («Paso 2 de 3») y después a «Tus datos» («Paso 3 de 3»), sin «Elige un doctor». Con A, vienen «Elige un doctor» («Paso 2 de 4»), «Elige fecha y horario» («Paso 3 de 4») y «Tus datos» («Paso 4 de 4»).
- **CA-5. [e2e]** Clínica simple: el paso de la especialidad dice «Paso 1 de 3», porque ninguna especialidad tiene más de un médico. Al elegir una, sigue «Elige fecha y horario» («Paso 2 de 3»).
- **CA-6. [e2e]** Un médico sin horarios no cuenta para los pasos. Una sede tiene un médico con horarios y otro sin horarios, que además tiene una especialidad que nadie más atiende. Esa sede sigue el recorrido de CA-1. El nombre del médico sin horarios y esa especialidad no aparecen en ninguna parte de la página, tampoco en la cabecera.
- **CA-7. [a mano]** La barra tiene tantos tramos como el total de «Paso X de Y» y llena los X primeros. En Clínica, al confirmar B, pasa de 4 a 3 tramos (P-3, aceptado).

### «Atrás», cambio de especialidad y «Reserva de nuevo» (P-4 a P-6)

- **CA-8. [e2e]** En el primer paso de cada recorrido (CA-1 a CA-5) no hay botón «Atrás».
- **CA-9. [e2e]** «Atrás» vuelve al paso visible anterior, nunca a uno saltado:
  - en Independiente, de «Tus datos» a «Elige fecha y horario», que sigue sin «Atrás»;
  - en Multiespecialidad y en Clínica con B, de «Elige fecha y horario» a «¿Qué especialidad necesitas?»;
  - en Equipo, de «Elige fecha y horario» a «Elige un doctor».
- **CA-10. [e2e]** Al volver, la especialidad y el médico elegidos siguen con `aria-pressed="true"`, y «Siguiente» está habilitado. Al volver de «Tus datos», en cambio, no queda ningún día ni hora elegidos, y «Siguiente» está deshabilitado.
- **CA-11. [a mano]** En el primer paso, «Siguiente» ocupa todo el ancho de la tarjeta. Cuando hay «Atrás», los dos botones se reparten la fila.
- **CA-12. [e2e]** Cambiar de especialidad borra el médico elegido. En Clínica, se elige A y un médico de A, se llega al horario y se vuelve hasta la especialidad. Al elegir B y pulsar «Siguiente», se llega a «Elige fecha y horario» con «Paso 2 de 3», y la cabecera muestra al médico de B. La cita confirmada queda con B y con el médico de B, nunca con el de A.
- **CA-13. [e2e]** En Clínica, si se elige B, se vuelve y se cambia a A, «Elige un doctor» aparece sin ningún médico elegido y con «Siguiente» deshabilitado.
- **CA-14. [e2e]** «Reserva de nuevo» vuelve al primer paso, como al abrir el link:
  - en Independiente, a «Elige fecha y horario» («Paso 1 de 2»), sin «Atrás», sin día ni hora elegidos y con la cabecera del médico;
  - en Clínica, a «¿Qué especialidad necesitas?», sin ninguna elegida.
- **CA-15. [e2e]** Al pulsar «Siguiente», «Atrás» o «Reserva de nuevo», el foco queda en el `h2` del paso nuevo.

### Cabecera (C-1 a C-3, d-1)

- **CA-16. [e2e]** Independiente: desde el primer paso hasta «Tus datos», arriba de la barra hay un `h1` con el nombre accesible «Reserva tu cita con {displayName}». Debajo van la especialidad y la línea «{sede} · {dirección}». Es el único `h1` de la página, y los títulos de los pasos son `h2`.
- **CA-17. [e2e]** El nombre de la cabecera es el `displayName` del api. En Independiente, con una médica con «Dra.», dice «Reserva tu cita con Dra. {nombre} {apellido}». Sin tratamiento dice «Reserva tu cita con {nombre} {apellido}», y ningún paso muestra «Dr.» ni «Dra.» (cl-4).
- **CA-18. [e2e]** Equipo: en «Elige un doctor», la cabecera dice «Reserva tu cita en {sede}», con la especialidad y una línea con solo la dirección. Tocar un médico no la cambia. Al pulsar «Siguiente», pasa a «Reserva tu cita con {médico}», con la especialidad y «{sede} · {dirección}». Si el paciente vuelve con «Atrás», la cabecera sigue con ese médico hasta que pulse «Siguiente» con otro.
- **CA-19. [e2e]** Clínica: en «¿Qué especialidad necesitas?», la cabecera dice «Reserva tu cita en {sede}», sin línea de especialidad. Tocar una especialidad no la muestra; aparece al pulsar «Siguiente». Con B aparece además su único médico: «Reserva tu cita con {médico de B}».
- **CA-20. [e2e]** Multiespecialidad: desde el primer paso, la cabecera dice «Reserva tu cita con {médico}», sin línea de especialidad. La especialidad aparece al elegirla y pulsar «Siguiente».
- **CA-21. [e2e]** Con la dirección de la sede vacía, la ubicación no deja separadores sueltos. Con el médico definido dice solo «{sede}», sin « · ». Sin el médico definido, no hay línea de ubicación.
- **CA-22. [e2e]** Sede sin cargar, en Independiente: la página carga sin mensajes de error. La cabecera dice «Reserva tu cita con {médico}», con la especialidad y sin línea de ubicación, y se llega a «Tus datos» con la misma cabecera.
- **CA-23. [e2e]** Sede sin cargar, en Clínica: el `h1` dice solo «Reserva tu cita», sin antetítulo ni ubicación. Al elegir B y pulsar «Siguiente», pasa a «Reserva tu cita con {médico de B}» con B, todavía sin ubicación.
- **CA-24. [a mano]** Con `clinic = null` forzado en `page.tsx` en local, sin commitear, se reserva de punta a punta en Independiente y en Clínica: la reserva no depende de la sede (C-2).
- **CA-25. [e2e]** «¡Cita reservada!» no lleva cabecera ni barra: no hay `h1`, «Reserva tu cita» ni «Paso X de Y». Su resumen sigue mostrando la sede y la dirección.
- **CA-26. [e2e]** Sede sin médicos con horarios: hay un único `h1`, «Reserva tu cita en {sede}», con la dirección y el texto «Esta clínica todavía no tiene doctores disponibles para reservar citas.». No hay barra ni «Paso X de Y», y ya no aparece «Reservar cita». Si además la sede no carga, el `h1` dice «Reserva tu cita».
- **CA-27. [a mano]** Mientras cargan los horarios, y cuando no cargan («No se pudieron cargar los horarios.»), la cabecera y la barra siguen arriba. «Cargando reserva...» y el error de la página no llevan cabecera: solo cambian el logo y la alineación del shell.

### Título de la pestaña (C-4)

- **CA-28. [e2e]** El título de la pestaña es el texto con que abre el `h1`, seguido de « · WizyDoc». Nunca es «WizyDoc — Panel». La página sigue con `noindex`.
  - Con un solo médico en la sede (Independiente o Multiespecialidad, cargue o no la sede): «Reserva tu cita con {displayName} · WizyDoc».
  - Con varios médicos: «Reserva tu cita en {sede} · WizyDoc».
  - Con varios médicos y la sede sin cargar: «Reserva tu cita · WizyDoc».
  - Sin médicos: «Reserva tu cita en {sede} · WizyDoc».

### Logo de WizyDoc (d-2)

- **CA-29. [e2e]** En el booking (en todos los pasos, en «¡Cita reservada!» y sin médicos), la imagen «WizyDoc» está solo en el pie, encima de «© {año} WizyDoc. Todos los derechos reservados.». Arriba de la tarjeta no hay logo, la imagen no está dentro de un enlace y la página no tiene ningún enlace a `/login`.
- **CA-30. [e2e]** Lo mismo en la autogestión (`/appointment/manage/{token}`): en la vista de la cita, en «Reprogramar» y en «Este enlace ya no está disponible».

### Lo elegido (E-1, d-3)

- **CA-31. [e2e]** Especialidades, médicos, días y horas son botones con `aria-pressed`: `"true"` en el elegido y `"false"` en los demás. Solo puede haber una especialidad y un médico elegidos: tocar otro desmarca el anterior.
- **CA-32. [e2e]** En las cuatro clases de opción, lo elegido tiene fondo `brand-teal-dark` (`rgb(11, 79, 73)`) y texto blanco, y lo disponible tiene fondo blanco. Los días sin horarios están deshabilitados y sin fondo. Vale también para el día y la hora de «Reprogramar».
- **CA-33. [a mano]** La especialidad y el médico elegidos llevan un ícono de check a la derecha. Todas las opciones muestran el anillo de foco al llegar con el teclado, y lo elegido no se confunde con «Siguiente». A 375 px y a 1280 px se ve como en el mockup.

### Calendario y celular (E-2, E-3)

- **CA-34. [e2e]** En «Elige fecha y horario», a 375 px, cada día mide al menos 37 px de ancho y 52 px de alto, las flechas de semana miden al menos 40 × 40 px y los horarios van en 4 columnas. Ninguna opción mide menos de 37 × 40 px.
- **CA-35. [e2e]** A 375 px no hay desplazamiento horizontal en ningún paso del booking ni en el estado sin médicos. Tampoco lo hay con un nombre de médico, un nombre de sede y una dirección de 80 caracteres cada uno, que se parten en varias líneas.
- **CA-36. [a mano]** La tarjeta del booking tiene 20 px de relleno a 375 px y 32 px desde `sm`. En el celular, el booking y la autogestión empiezan arriba, y la tarjeta no cambia de posición entre pasos. Desde `sm` se centran.

### Lo que llega al api (P-1)

- **CA-37. [e2e]** Lo que se salta se guarda igual que si el paciente lo hubiera tocado. La cita reservada en Independiente tiene el `doctorProfileId` del único médico, el nombre de la única especialidad y el `clinicId` del link.
- **CA-38. [e2e]** Lo mismo en los demás recorridos:
  - en Equipo, la única especialidad y el médico elegido;
  - en Multiespecialidad, la especialidad elegida y el único médico;
  - en Clínica con B, B y su único médico.
- **CA-39. [a mano]** El diff no toca `api/`, las server actions ni los clientes de `lib/api`. `POST /appointment` recibe los mismos campos que hoy, y no hay endpoints nuevos ni cambiados.

### Privacidad

- **CA-40. [e2e]** El booking de una sede no muestra nada de esto en ningún paso, tampoco en la cabecera ni en el título de la pestaña:
  - el teléfono de la sede;
  - el nombre, la dirección o los médicos de otra sede de la misma organización;
  - especialidades de otra organización.

### Autogestión, sin regresiones

- **CA-41. [e2e]** `e2e/ui/appointment/appointment-portal.spec.ts` pasa sin cambiar sus expectativas.
- **CA-42. [e2e]** En «Reprogramar»:
  - sigue el botón «Atrás», que vuelve a «Hola, {nombre}»;
  - «Siguiente» se habilita al elegir día y hora, y lleva a «¿Cambiar tu cita a este horario?»;
  - no aparecen la cabecera del booking («Reserva tu cita…») ni «Paso X de Y»;
  - a 375 px, los días miden al menos 52 px de alto, las flechas miden 40 × 40 px y no hay desplazamiento horizontal;
  - el título de la pestaña sigue siendo «Tu cita · WizyDoc».

### Calidad

- **CA-43. [typecheck]** `pnpm typecheck` y `pnpm check` limpios en `platform`.
- **CA-44. [e2e]** Pasa la suite completa. Las pruebas de la tabla siguiente se adaptan al comportamiento nuevo, no se borran, y cada una sigue comprobando lo que comprobaba.

### e2e que cambian

| Prueba | Hoy | Pasa a | Criterios |
| --- | --- | --- | --- |
| `e2e/ui/clinic/public-booking.spec.ts`, «CA-5: el paciente reserva…» | Elige la especialidad y el médico antes del horario. | Abre el link en «Elige fecha y horario» y reserva de punta a punta. | CA-1, CA-37 |
| `e2e/ui/clinic/public-booking.spec.ts`, «el paso de éxito muestra la sede…» | Igual. | Empieza en el horario. El éxito, sin cabecera, sigue con la sede, la dirección y la fecha legible. | CA-1, CA-25 |
| `e2e/ui/booking/public-booking-specialty-scope.spec.ts` | Espera «¿Qué especialidad necesitas?» y el botón de la especialidad. | Empieza en el horario. La especialidad propia sale en la cabecera, y la ajena no sale en ninguna parte. | CA-1, CA-16, CA-40 |
| `e2e/ui/booking/public-booking-requires-schedule.spec.ts` | Espera «¿Qué especialidad necesitas?» sin la especialidad del médico sin horarios. | Sigue el recorrido de Independiente. Ni ese médico ni su especialidad aparecen, tampoco en la cabecera. | CA-6 |
| `e2e/ui/booking/public-booking-treatment.spec.ts` | Elige la especialidad antes del médico. | Empieza en «Elige un doctor». La cabecera muestra el tratamiento después de «Siguiente». | CA-2, CA-17, CA-18 |
| `e2e/ui/profile/profile-edit.spec.ts` (`bookingDoctorNames`, CA-52) | Elige la especialidad y busca al médico como botón. | Lee el `h1` de la cabecera: «Reserva tu cita con Dra. Valeria Montes» o, sin tratamiento, «Reserva tu cita con Valeria Montes». | CA-17 |
| `e2e/ui/organization/assign-from-organization.spec.ts` (`openDoctorStep`) | Elige la especialidad. | Abre el link en «Elige un doctor», con el ADMIN como botón. | CA-2 |
| `e2e/ui/clinic/clinic-users-specialties.spec.ts`, «el booking refleja el cambio» | Espera «¿Qué especialidad necesitas?» con una sola especialidad. | La especialidad sale en la cabecera. Al sumar una segunda aparece el paso de especialidad, y al quitarlas todas, «todavía no tiene doctores». | CA-1, CA-3, CA-16, CA-26 |
| `e2e/ui/appointment/appointment-portal.spec.ts` | — | Sin cambios. | CA-41 |
