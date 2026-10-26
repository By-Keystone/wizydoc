# Plan: primer uso del médico independiente

**Rama:** `feat/first-use`, desde `origin/main` (a6e7c16).
**Fecha:** 25 de octubre de 2026
**Mockup:** `docs/features/primer-uso/mockup.html`, aprobado el 25 de octubre de 2026. Aplica las
decisiones del humano (la opción a de D-1, D-2 y D-3) y tiene interruptores para ver las
alternativas (D-2 b se ve igual que D-2 a).
**Depende de** (la implementación parte de `main` cuando entren):
- `fix/auth-forms` (`docs/features/formularios-entrada/plan.md`, en su worktree). El onboarding
  vive en `app/(auth)/onboarding/`, con `AuthCard`, la frase de la beta, el campo oculto
  `plan=FREE`, `noValidate` y la caja de error encima del botón. Este plan parte de esa versión,
  no de la de `main`.
- `fix/platform-small-fixes`. Este plan no duplica nada de esa rama, y cuenta con esto:
  - `/select` entra directo al dashboard cuando el usuario tiene exactamente una sede, y
    «Cambiar de sede» usa `?switch=1` para ver la lista (`lib/auth/workspace-paths.ts`);
  - `loadWorkspace` manda a `/select?switch=1` a quien entra a una sede sin membership;
  - `CopyButton` muestra «No pudimos copiar el link desde este navegador.» si el portapapeles falla;
  - el helper de e2e `clinicDashboardUrl` y los specs que esa rama ya cambia (ver «e2e»).
- #110 (`docs/features/doctor-profile-membership/plan.md`, iteración 2). `MembershipRepository.grantAttending`
  deja a una persona como médico (membership DOCTOR con perfil) de una sede.

Criterios de aceptación: al final del plan.

## Objetivo

Que el médico independiente pase del registro a un link que recibe reservas con un solo
formulario y un paso en el panel (su horario), y que el panel le diga siempre qué le falta.
«Copiar link de reservas» solo aparece cuando el link funciona.

## Recorrido

| | Pantallas después de confirmar el correo | Formularios |
| --- | --- | --- |
| **Hoy** | «Crea tu cuenta» → «Elige dónde entrar» vacío → modal «Nueva organización» → «Entrar» → Sedes → modal «Crear sede» → entrar a la sede → «Mi perfil» (especialidad) → «Configuración» (horario). Nadie le dice qué le falta, y el dashboard ofrece «Copiar link de reservas» desde el principio. | 5 |
| **Con este plan** (D-1 en a) | «Tu consultorio» (nombre, dirección y especialidad) → `/select`, que entra directo porque hay una sola sede → dashboard con «Te falta 1 paso para recibir citas» → «Definir horario» → guardar → Inicio: «Tus pacientes ya pueden reservar desde el link» y «Copiar link de reservas». | 2 |

## Decisiones del humano

El humano aprobó el plan y el mockup el 25 de octubre de 2026, con las tres recomendaciones.

| # | Pregunta | Opciones | Recomendación | Decisión |
| --- | --- | --- | --- | --- |
| D-1 | ¿Qué pide el onboarding? | **a)** Nombre del consultorio, dirección y especialidad. **b)** Nombre y dirección; la especialidad se elige en la guía del panel (2 pasos pendientes). **c)** Solo el nombre, como hoy; la dirección y la especialidad van en la guía (la dirección necesitaría una pantalla nueva, porque hoy no se puede editar una sede). | **a.** El médico sabe su especialidad sin pensarlo, y con ella el panel le pide un solo paso. La dirección es obligatoria porque el booking, «¡Cita reservada!», la autogestión y los correos la muestran. **Consecuencia:** el título que aprobó `formularios-entrada` («Ponle nombre a tu consultorio») ya no describe un formulario de tres campos. Pasa a «Tu consultorio» (ver Textos). | **a**, el 25 de octubre de 2026. |
| D-2 | ¿Se pide el teléfono de la sede? Hoy es obligatorio al crear una sede, pero el paciente no lo ve: solo sale en la tabla de Sedes del panel. | **a)** No: la sede queda sin teléfono. **b)** No, y se copia el celular del registro. **c)** Sí, precargado con el celular del registro. | **a.** Resuelve el caso de hoy sin un campo más. Con **b**, el celular personal del médico quedaría como contacto de la sede, y lo verían los pacientes en cuanto una función lo muestre (el aviso del tope de citas o el aviso de privacidad de WIZ-52), sin que el médico lo haya decidido. Si esas funciones lo necesitan, lo piden ellas. | **a**, el 25 de octubre de 2026. |
| D-3 | ¿Qué ve el dueño de una cuenta de la beta que no tiene organización? | **a)** En lugar de «Elige dónde entrar», el mismo formulario con el título «Termina de crear tu consultorio». Después llega a la guía, igual que una cuenta nueva. **b)** El recorrido de hoy (Crear organización → Sedes → Crear sede), con un texto que lo explica. | **a.** El recorrido de hoy es justo el problema que resuelve este plan. Con **a**, la cuenta nueva y la de la beta usan el mismo formulario y el mismo endpoint. | **a**, el 25 de octubre de 2026. |

## Reglas de este plan

### Onboarding

- **O-1. Un formulario crea todo.** En la cuenta del usuario, si todavía no existe, crea una
  organización y una sede. El dueño queda como ADMIN de la organización y como médico de la sede
  (membership DOCTOR con `doctor_profile`), con la especialidad que escribió.
- **O-2. Campos** (con D-1 en a y D-2 en a). No hay textos de ayuda: el ejemplo va en el
  placeholder, y el porqué, en la descripción.

  | Etiqueta | `name` | Placeholder | `autoComplete` | Error si está vacío |
  | --- | --- | --- | --- | --- |
  | Nombre del consultorio | `name` | Consultorio Dra. Quispe | `organization` | «Escribe el nombre de tu consultorio.» |
  | Dirección | `address` | Av. José Larco 812, of. 304, Miraflores | `street-address` | «Escribe la dirección de tu consultorio.» |
  | Tu especialidad | `specialty` | Dermatología | `off` | «Escribe tu especialidad.» |

  - Los tres se recortan (`trim`) y son obligatorios. Los largos máximos los fija el engineer, con
    un mensaje en español si se pasan.
  - Tras un error, los tres conservan lo escrito (hoy la página ya lo hace con el nombre).
  - Con D-2 en c, se suma «Teléfono del consultorio» (`Field` + `PhoneInput` en +51, precargado
    con el celular del registro y la ayuda «Lo tomamos del celular con que te registraste.»).
- **O-3. Un solo nombre.** La cuenta, la organización y la sede se llaman igual: lo que escribió
  en «Nombre del consultorio».
- **O-4. Dos modos en la misma página** (`/onboarding`).

  | Modo | Quién lo ve | Título | Descripción | Frase de la beta |
  | --- | --- | --- | --- | --- |
  | Cuenta nueva | Usuario sin cuenta (`onboardingCompleted: false`) | «Tu consultorio» | «Es el último paso. Tus pacientes verán estos datos al reservar.» | Sí |
  | Termina (D-3 en a) | Dueño de una cuenta sin organizaciones (`isAccountOwner` y sin memberships) | «Termina de crear tu consultorio» | «Te falta este paso para tener tu link de reservas.» | No: la cuenta ya tiene su plan |

  En los dos modos el botón dice «Crear mi consultorio» y, al enviar, «Creando tu consultorio…».
  Cualquier otro usuario que entra a `/onboarding` sigue redirigido como hoy.
- **O-5. Después de crear.** Redirige a `/account/{accountId}/select`, sin `?switch=1`. Como la
  cuenta tiene exactamente una sede, `/select` entra directo a su dashboard
  (`fix/platform-small-fixes`). No hace falta fijar la cookie de la sede: `/select` ya redirige con
  el id en la URL.
- **O-6. Si falla a medias.** En la cuenta nueva se crea primero la cuenta y luego el consultorio
  (ver «api»). Si la cuenta se crea y el consultorio no:
  - la caja de error dice «Tu cuenta quedó creada, pero no pudimos crear tu consultorio. Vuelve a
    intentarlo.»;
  - el reintento solo crea el consultorio;
  - si cierra la página, la próxima vez que entre ve el modo «Termina».
- **O-7. Otros errores.** Van en la caja de error general:
  - de red o desconocidos: «No pudimos crear tu consultorio. Vuelve a intentarlo.»;
  - un 409 («ya está creado», por ejemplo por un doble envío) no es un error para el usuario: lleva
    a `/account/{accountId}/select`, porque el consultorio ya existe.

### Guía de primeros pasos

- **G-1. Quién la ve.** Quien atiende en la sede (`membership.doctorProfileId` no es nulo) y todavía
  no aparece en el link de reservas, es decir, su `doctorProfileId` no está en
  `GET /clinic/:clinicId/doctors`. Va en el dashboard de la sede, debajo del saludo.
- **G-2. Pasos.**

  | # | Paso | Listo | Pendiente |
  | --- | --- | --- | --- |
  | 1 | «Elige tu especialidad» | Sus especialidades en esta sede («Dermatología») | Si edita especialidades (la sede está en `editableClinics` de «Mi perfil»): «Tus pacientes la ven al reservar.» y el botón «Elegir especialidad». Si no: «Te la asigna un administrador de {sede}.», sin botón. |
  | 2 | «Define tu horario de atención» | «Horario guardado.» | «Elige los días y las horas en que atiendes. Tus pacientes solo podrán reservar en esos horarios.» y el botón «Definir horario». |
  | 3 | «Comparte tu link de reservas» | — (al completar 1 y 2 la guía desaparece) | Bloqueado: «Cuando completes los pasos, aquí copias tu link para enviarlo por WhatsApp o ponerlo en tus redes.» Solo aparece si el link de la sede todavía no funciona. |

- **G-3. Título.** Cuenta los pasos 1 y 2 pendientes.

  | El link de la sede… | Título (`h2`) | Texto |
  | --- | --- | --- |
  | no funciona | «Te falta 1 paso para recibir citas» o «Te faltan 2 pasos para recibir citas» | «Mientras tanto, tu link de reservas no funciona: quien lo abra no podrá reservar.» |
  | ya funciona con otros médicos | «Te falta 1 paso para aparecer en el link de reservas» o «Te faltan 2 pasos…» | «El link de {sede} ya recibe citas con otros médicos.» |

- **G-4. Un solo coral por pantalla** (la acción que hace crecer el uso, desde #122).
  - Si el link no funciona, el botón del primer paso pendiente con acción es coral.
  - Si el link ya funciona, el coral es «Copiar link de reservas» (L-2), y el primer botón de la
    guía es `default` (teal).
  - Cualquier otro paso pendiente con acción lleva un botón `outline`.
  - La mejora de plan de las métricas, debajo, sigue en teal.
- **G-5. No se cierra a mano.** Desaparece sola cuando el médico aparece en el link, y vuelve si
  deja de aparecer (por ejemplo, si borra su horario).
- **G-6. Los pasos se resuelven en las pantallas de hoy**, que no cambian. «Elegir especialidad»
  lleva a «Mi perfil» de la sede, a la tarjeta «Dónde atiendes». «Definir horario» lleva a «Mi
  Disponibilidad».

### Link de reservas en el dashboard

- **L-1. «Copiar link de reservas» solo si funciona**, es decir, si
  `GET /clinic/:clinicId/doctors` devuelve al menos un médico.
- **L-2. Listo.** Una fila con:
  - el ícono de check y «Tus pacientes ya pueden reservar desde el link.»;
  - «Copiar link de reservas»: coral, como hoy, con el toast «¡Link copiado!» o, si el portapapeles
    falla, «No pudimos copiar el link desde este navegador.» (`fix/platform-small-fixes`);
  - «Ver como paciente»: `outline`, abre el booking en una pestaña nueva.
- **L-3. Pendiente, para quien no atiende** (ADMIN sin perfil en la sede, USER). Un aviso:
  «El link de reservas todavía no funciona» y «Funciona cuando un médico de {sede} tenga
  especialidad y horario.». Si es ADMIN, además, el enlace «Asignar médicos en Usuarios» (lleva a
  los Usuarios de la sede, donde también puede asignarse a sí mismo como médico).
- **L-4. Qué se ve en cada caso.**

  | Atiende en la sede | Aparece en el link | El link funciona | Arriba del todo |
  | --- | --- | --- | --- |
  | Sí | No | No | Guía con 3 pasos (G-2), sin botón de copiar |
  | Sí | No | Sí (otros médicos) | Fila «Listo» (L-2) y debajo la guía con 2 pasos |
  | Sí | Sí | Sí | Fila «Listo» |
  | No | — | Sí | Fila «Listo» |
  | No | — | No | Aviso pendiente (L-3) |

- **L-5. Si una lectura falla** (médicos de la sede, «Mi perfil» o el horario), el dashboard se ve
  como hoy: «Copiar link de reservas», sin fila de estado ni guía. El resto del dashboard no se
  rompe por esa lectura. Se registra el error sin datos personales.

### Cuentas de la beta

- **B-1. Dueño sin organización.** Con D-3 en a, «Elige dónde entrar» lo redirige a `/onboarding`
  en modo «Termina»:
  - la redirección va antes de la entrada directa de `fix/platform-small-fixes`;
  - vale también con `?switch=1`, porque sin organización la lista estaría vacía;
  - el botón «Crear organización» ya no le aparece.

  Con D-3 en b, ve «Elige dónde entrar» con el aviso del mockup y el recorrido de hoy.
- **B-2. Usuario que no es el dueño y no tiene memberships.** Como hoy: «No perteneces a ninguna
  organización todavía.»
- **B-3. Cuenta con organización y sin sede.** Como hoy: la organización sale en «Elige dónde
  entrar», crea la sede desde Sedes, y «Mi perfil» ya le dice «Ir a Sedes».
- **B-4. Sede creada antes de #110** (el dueño no atiende en ella). Ve el aviso de L-3, con
  «Asignar médicos en Usuarios», donde puede asignarse como médico.
- **B-5. Dueño que atiende, sin especialidad o sin horario.** Ve la guía.

## Cambios por capa

### Prisma

Ninguno, sin migración. Con D-2 en a, la sede se guarda con `phone` vacío: la columna sigue
`NOT NULL` y la tabla de Sedes ya muestra la celda vacía. Si el engineer prefiere la columna
nullable, es una migración nueva.

### api

Un endpoint nuevo. Rutas, nombres y archivos son un punto de partida: los decide el engineer.

| Archivo | Cambio |
| --- | --- |
| `api/src/application/use-cases/account/create-first-clinic.usecase.ts` (nuevo) | `createFirstClinicSchema` (`name`, `address` y, con D-1 en a, `specialty`, con `trim`, `min(1)` y máximos, mensajes en español). `CreateFirstClinicUseCase.execute({ userId, accountId, ...dto })`, dentro de una transacción:<br>1. `lockAccountQuota(accountId)`, para que dos envíos simultáneos no creen dos organizaciones.<br>2. Comprobar que `account.ownerId === userId` (si no, `Forbidden`) y que la cuenta no tiene organizaciones (si no, `Conflict`).<br>3. Organización y membership ADMIN (`OrganizationRepository.save`).<br>4. Sede (`ClinicRepository.save`, con `phone` según D-2).<br>5. `MembershipRepository.grantAttending` del dueño en la sede.<br>6. Especialidad en la organización nueva, conectada al perfil (`DoctorProfileRepository.upsertForMembership` u otra vía).<br>Devuelve `{ organizationId, clinicId }`. Los pasos van en métodos privados o en repositorios, según `api/AGENTS.md`. |
| `api/src/routes/account/index.ts` | `POST /account/first-clinic`. Solo HTTP: schema, política, caso de uso y errores. |

**Política de la ruta nueva:**

```ts
app.post("/account/first-clinic", {
  schema: { body: createFirstClinicSchema },
  // Sin :resourceId: la organización todavía no existe. Que sea el dueño y que la cuenta
  // no tenga organizaciones lo comprueba el caso de uso.
  ...policy({ account: true, confirmed: true, onboarded: true }),
}, handler)
```

Sin `requireFeature`: va en todos los planes. Gratis incluye 1 sede, y una cuenta sin
organizaciones no tiene ninguna.

| Respuesta | Cuándo |
| --- | --- |
| 201 `{ organizationId, clinicId }` | Creado. |
| 400 | Cuerpo inválido (schema), como el resto de rutas. |
| 403 «Sólo el dueño de la cuenta puede crear su consultorio» | Quien llama no es `ownerId` de su cuenta. También 403 de la política sin cuenta, sin correo confirmado o sin onboarding. |
| 409 «Tu consultorio ya está creado» | La cuenta ya tiene al menos una organización. |

**Sin cambios:** `POST /account` y `CompleteAccountSetupUseCase` siguen creando solo la cuenta y la
suscripción Gratis. Así, el mismo endpoint sirve a la cuenta nueva y a la de la beta (D-3), y el
helper `createOnboardedAdmin` de e2e, que usan casi todas las pruebas, no cambia. También quedan
sin cambios `POST /organization`, `POST /organization/:resourceId/clinics`, `policy.ts`, `auth.ts`
y `entitlements.ts`.

**Lecturas que usa la guía, sin cambios:**

| Ruta | Policy | Para qué |
| --- | --- | --- |
| `GET /clinic/:clinicId/doctors` | `{ public: true }` | Médicos que aparecen en el link (con especialidad y horario). Decide L-1 a L-4 y si el médico ya aparece. |
| `GET /user/me/profile` | `{ account, confirmed, onboarded }` | Especialidades del médico en la sede (`clinics`) y si las edita (`editableClinics`). |
| `GET /clinic/:resourceId/availability` | `{ account, confirmed, onboarded, member }` | Si el médico tiene horario en la sede. |
| `GET /user/me/resource/:resourceId/membership` | `{ confirmed, onboarded }` | `role` y `doctorProfileId` en la sede (ya la carga el layout). |

**Alternativa descartada:** ampliar `POST /account` para que cree todo en una sola transacción. Es
atómico, pero exige un segundo camino para las cuentas de la beta, y cambia `createOnboardedAdmin`:
con la sede ya creada, las pruebas que crean la suya chocan con el límite de 1 sede de Gratis.

### platform

| Archivo | Cambio |
| --- | --- |
| `platform/src/app/(auth)/onboarding/page.tsx` (de `fix/auth-forms`) | Los campos de O-2, los dos modos de O-4, el botón y los textos. Conserva `BETA_PLAN`, el campo oculto, la rama de Culqi inalcanzable y `useFocusFirstInvalid`. |
| `platform/src/app/(auth)/onboarding/layout.tsx` (de `fix/auth-forms`) | Además del usuario sin cuenta, deja pasar al dueño sin memberships (modo «Termina»). La página necesita saber el modo; cómo se lo pasa lo decide el engineer. |
| `platform/src/lib/actions/account/create-account.action.ts` | El schema suma `address` y `specialty`. Si el usuario no tiene cuenta, `POST /account` y después `POST /account/first-clinic`; si ya la tiene, solo el segundo. Errores y redirección según O-5 a O-7. |
| `platform/src/app/account/[accountId]/(workspaces)/select/page.tsx` (con los cambios de `fix/platform-small-fixes`) | Con D-3 en a: el dueño sin memberships va a `/onboarding` antes de la entrada directa y también con `?switch=1` (B-1). `canCreateOrganization` pierde la rama del dueño sin organización y queda solo para ADMIN. |
| `platform/src/app/account/[accountId]/clinic/[clinicId]/dashboard/page.tsx` | Carga los médicos de la sede y la membership. Si el usuario atiende y no aparece, carga además «Mi perfil» y su horario. Arma L-4 con `BookingLinkStatus` y `FirstSteps` en `actions` de `StatisticsWrapper`. |
| `platform/src/components/app/dashboard/clinic/first-steps.tsx` (nuevo) | `FirstSteps`. Ver UI. |
| `platform/src/components/app/dashboard/clinic/booking-link-status.tsx` (nuevo) | `BookingLinkStatus`. Ver UI. |
| `platform/src/components/app/dashboard/copy-button.tsx` | Pierde `mb-8`: el margen pasa a la fila que lo contiene. Sigue coral y con sus dos toasts. |
| `platform/e2e/support/ui.ts` | `completeOnboardingViaUi` llena los campos nuevos, pulsa «Crear mi consultorio» y espera `clinicDashboardUrl(accountId)`. |

No cambian: `StatisticsWrapper`, `Welcome`, `ClinicStats`, `PlanFeatureNotice`,
`TodayAppointments`, `Sidebar`, `AvailabilityEditor`, «Mi perfil» ni el booking.

## Aislamiento entre cuentas

| Dato | Cómo queda acotado |
| --- | --- |
| Organización, sede, memberships ADMIN y DOCTOR, perfil y especialidad nuevos | El cuerpo no lleva ningún id: `userId` y `accountId` salen de la sesión. El caso de uso lee la cuenta de la sesión y exige `ownerId === userId`. Todo se crea con ese `accountId`. La sede cuelga de la organización recién creada, `grantAttending` recibe el id de esa sede, y la especialidad se crea en esa organización y se conecta a ese perfil, todo en la misma transacción. |
| «La cuenta no tiene organizaciones» | Se cuenta por el `accountId` de la sesión, después de `lockAccountQuota`. Un segundo envío espera al primero y recibe 409. |
| Médicos de la sede (guía y link) | `GET /clinic/:clinicId/doctors`, público y sin cambios, con el `clinicId` de la URL del dashboard. El dashboard ya exige membership en esa sede (el layout, con `loadWorkspace`). Solo se compara `doctorProfileId` con el de la membership. |
| Especialidades del médico | `GET /user/me/profile`, acotado por `userId` y `accountId` de la sesión. Solo trae especialidades de la organización de la sede. |
| Horario del médico | `GET /clinic/:resourceId/availability`, con `member: true`. El api resuelve el perfil por la sesión y la sede. |

No hay endpoints públicos nuevos. El endpoint nuevo pasa por el security-reviewer.

## UI

### Rutas y layout

| Ruta | Layout | Qué cambia |
| --- | --- | --- |
| `/onboarding` | `(auth)/layout.tsx` (logo arriba, fondo degradado, pie «© WizyDoc») + `AuthCard` | Formulario de O-2, en sus dos modos. |
| `/account/[accountId]/select` | `(workspaces)/layout.tsx` | El dueño sin organización se redirige (D-3 en a). Con una sede, entra directo (`fix/platform-small-fixes`). |
| `/account/[accountId]/clinic/[clinicId]/dashboard` | `clinic/[clinicId]/layout.tsx`: `Sidebar` (barra superior y menú en el celular) + `main` | Fila del link o aviso, y la guía. |
| `/account/[accountId]/clinic/[clinicId]/me` y `.../profile/availability` | Sin cambios | Son el destino de los botones de la guía. |

### Árbol de componentes

```
(auth)/layout.tsx (sin cambios)
└─ OnboardingPage (modificada)
   └─ AuthCard (common/auth-card.tsx, de fix/auth-forms)
      └─ form noValidate
         ├─ Input «Nombre del consultorio» (common/form)
         ├─ Input «Dirección» (common/form)
         ├─ Input «Tu especialidad» (common/form)               [D-1 en a]
         ├─ frase de la beta                                    [solo cuenta nueva]
         ├─ caja de error general, role="alert"
         └─ Button «Crear mi consultorio» (ui/button) con Loader2 al enviar

clinic/[clinicId]/layout.tsx (sin cambios: Sidebar + main)
└─ ClinicDashboardPage (modificada)
   ├─ StatisticsWrapper (sin cambios)
   │  ├─ Welcome (sin cambios)
   │  ├─ actions:
   │  │  ├─ BookingLinkStatus (nueva)
   │  │  │  ├─ listo: ícono + texto + CopyButton (modificado) + «Ver como paciente» (Button outline asChild)
   │  │  │  └─ pendiente: aviso + enlace a Usuarios (solo ADMIN)
   │  │  └─ FirstSteps (nueva)
   │  │     └─ ol › li por paso, con Button coral, default u outline asChild > Link (G-4)
   │  └─ ClinicStats (sin cambios: métricas o PlanFeatureNotice)
   └─ TodayAppointments (sin cambios)
```

**Componentes nuevos:**

- `FirstSteps({ accountId, clinicId, clinicName, specialties: string[], hasSchedule: boolean, canEditSpecialties: boolean, isClinicBookable: boolean })`.
  Componente de servidor, sin estado: los botones son enlaces.
  - Tarjeta `rounded-xl border border-gray-200 bg-white`, como «Citas de hoy».
  - Cabecera con `border-b`, con `h2` (`font-semibold text-brand-teal-dark`) y texto
    (`text-sm text-brand-gray`).
  - `ol` con `divide-y divide-gray-100`. Cada paso lleva un círculo de estado de 28 px:
    - listo: `bg-brand-teal` con `Check` blanco;
    - pendiente: borde `border-2 border-gray-300` con el número;
    - bloqueado: `bg-gray-100` con `Lock` gris.
  - Título del paso en `text-sm font-medium text-brand-ink` y detalle en `text-sm text-brand-gray`.
  - Botón `size="sm"`: a lo ancho y debajo del texto en el celular, y a la derecha desde `sm`.
  - Se justifica porque no hay ninguna lista de pasos en la app, y la guía combina tres lecturas.
- `BookingLinkStatus({ accountId, clinicId, clinicName, isBookable: boolean, canManageUsers: boolean })`.
  Componente de servidor que envuelve al `CopyButton` (cliente).
  - Listo: `flex flex-wrap items-center gap-3`, con `CircleCheck` teal y el texto en
    `text-sm font-medium text-brand-teal-dark`.
  - Pendiente: tarjeta blanca con ícono `Link` en una baldosa `bg-gray-100`, `h2` y texto.
  - Reemplaza al `CopyButton` suelto, que hoy se muestra siempre. Se justifica porque el link ahora
    tiene dos estados, y uno no lleva botón.

### Qué dato alimenta cada parte

| Parte | Dato |
| --- | --- |
| Modo del onboarding | `GET /user/me` (`onboardingCompleted`, `isAccountOwner`) y `GET /user/me/memberships` (vacío = sin organización) |
| Crear el consultorio | `POST /account` (si falta la cuenta) y `POST /account/first-clinic` |
| ¿Atiende? | `membership.doctorProfileId` (`GET /user/me/resource/:resourceId/membership`) |
| ¿Funciona el link? ¿Aparece el médico? | `GET /clinic/:clinicId/doctors`: lista no vacía, y si incluye su `doctorProfileId` |
| Paso 1 | `GET /user/me/profile`: `clinics[clinicId].specialties`, y si la sede está en `editableClinics` |
| Paso 2 | `GET /clinic/:resourceId/availability`: al menos un bloque |
| Enlace a Usuarios | `membership.role === "ADMIN"` |
| «Ver como paciente» y el link copiado | `buildPublicBookingUrl` de hoy: `/clinic/{clinicId}/create-appointment` |

### Textos

| Dónde | Hoy | Pasa a |
| --- | --- | --- |
| Onboarding, título | «Ponle nombre a tu consultorio» (aprobado en `formularios-entrada`) | «Tu consultorio»; en modo «Termina», «Termina de crear tu consultorio» |
| Onboarding, descripción | «Es el último paso para crear tu cuenta.» | «Es el último paso. Tus pacientes verán estos datos al reservar.»; en modo «Termina», «Te falta este paso para tener tu link de reservas.» |
| Onboarding, campos | «Nombre del consultorio» | O-2 |
| Onboarding, botón | «Continuar» / «Creando tu cuenta…» | «Crear mi consultorio» / «Creando tu consultorio…» |
| Onboarding, error general | «No pudimos crear tu cuenta. Vuelve a intentarlo.» | O-6 y O-7 |
| Dashboard, link | «Copiar link de reservas», siempre | L-2 y L-3 |
| Dashboard, guía | — | G-2 y G-3 |

La frase de la beta no cambia.

### Estados

| Estado | Qué se ve |
| --- | --- |
| Onboarding normal | Tarjeta con los campos de O-2, la frase de la beta y «Crear mi consultorio». Foco en el primer campo. |
| Onboarding con errores | Cada error debajo de su campo, con `aria-invalid`, y el foco en el primer campo con error. Lo escrito se conserva. |
| Onboarding enviando | Botón deshabilitado con `Loader2` y «Creando tu consultorio…». |
| Onboarding, error general | Caja roja encima del botón (O-6 y O-7). |
| Onboarding, modo «Termina» | Igual, con su título y descripción, y sin la frase de la beta. |
| Primera llegada al panel (D-1 en a) | Llega directo desde `/select` (una sola sede). Saludo, guía «Te falta 1 paso para recibir citas» (1 listo, 2 pendiente con botón coral, 3 bloqueado), y debajo, como hoy, las métricas (en Gratis, la mejora de plan en teal) y «Citas de hoy» vacío. |
| Primera llegada (D-1 en b) | Igual, con «Te faltan 2 pasos»: «Elegir especialidad» en coral y «Definir horario» en `outline`. |
| Link funcionando | Fila L-2 en lugar de la guía. Lo demás, igual. |
| Médico invitado, sin especialidad, en una sede que ya recibe citas | Fila L-2 (con el coral) y, debajo, la guía «Te faltan 2 pasos para aparecer en el link de reservas», con el paso 1 sin botón («Te la asigna un administrador de {sede}.») y el paso 2 en teal (G-4). |
| ADMIN que no atiende o USER, sede sin médicos | Aviso L-3, con el enlace a Usuarios solo para el ADMIN. |
| Vacío | La guía es el estado vacío del panel. «Citas de hoy» sigue con «No hay citas programadas para hoy.» |
| Carga | `loading.tsx` de la sede: `LoadingState` («Cargando...») con la barra lateral. Sin cambios. |
| Error | `error.tsx` de la sede: `ErrorState` con «Reintentar». Sin cambios. Si solo falla una lectura de la guía, aplica L-5. |
| 403 | En el panel: sin membership en la sede, `loadWorkspace` lleva a «Elige dónde entrar» con `?switch=1` (`fix/platform-small-fixes`). En el onboarding no hay 403 visible: solo llegan el usuario sin cuenta y el dueño sin organización (O-4); el api responde 403 a cualquier otro. |
| 402 | No aplica: el onboarding, la guía y el link van en todos los planes. Las métricas de debajo siguen mostrando la mejora de plan en Gratis y Consultorio, sin cambios. |

### Interacciones

- **«Crear mi consultorio»:** valida en el servidor y pinta los errores en cada campo. Si todo sale
  bien, redirige (O-5). No hay toast: el paso siguiente es la pantalla.
- **«Elegir especialidad»:** va a `/account/{accountId}/clinic/{clinicId}/me`. Ahí, en «Dónde
  atiendes», la fila de la sede tiene «Asignar especialidades», con el selector que permite crear
  la especialidad.
- **«Definir horario»:** va a `/account/{accountId}/clinic/{clinicId}/profile/availability`. Al
  guardar, el toast de hoy («Disponibilidad guardada correctamente»). Al volver a Inicio, la guía
  ya no está (ver r-6).
- **«Copiar link de reservas»:** como hoy (L-2).
- **«Ver como paciente»:** abre `/clinic/{clinicId}/create-appointment` en una pestaña nueva.
- **«Asignar médicos en Usuarios»:** va a `/account/{accountId}/clinic/{clinicId}/users`.
- No hay toasts nuevos.

### Diferencias por rol

| Rol en la sede | Guía | Link listo | Link pendiente |
| --- | --- | --- | --- |
| ADMIN que atiende (el dueño) | Sí, con «Elegir especialidad» | Fila L-2 | — (ve la guía) |
| DOCTOR | Sí. El paso 1 no tiene botón si un administrador no le asignó especialidad. | Fila L-2 | — (ve la guía) |
| ADMIN que no atiende | No | Fila L-2 | Aviso con «Asignar médicos en Usuarios» |
| USER | No | Fila L-2 | Aviso sin enlace |

El onboarding no depende del rol: lo ven el usuario sin cuenta y el dueño sin organización.

### Accesibilidad

- **Onboarding:**
  - Los tres campos tienen `label` visible y `autoComplete` (O-2).
  - Los errores van en `role="alert"`, enlazados con `aria-describedby`.
  - El foco va al primer campo inválido.
  - Orden de tabulación: Nombre del consultorio › Dirección › Tu especialidad › Crear mi consultorio.
- **Guía:**
  - `section` con `aria-labelledby` apuntando a su `h2`, y los pasos en un `ol`.
  - El estado de cada paso está en el texto: «Listo», «Pendiente» o «Disponible al completar los
    pasos anteriores» en un `sr-only`. Así no depende del círculo de color. Los íconos llevan
    `aria-hidden`.
  - El título del `h2` dice cuántos pasos faltan.
  - Los botones son enlaces con nombre propio («Definir horario», «Elegir especialidad»).
- **Fila del link:** «Ver como paciente» suma un `sr-only` «(se abre en una pestaña nueva)». El
  aviso L-3 lleva `role="status"`.
- **Orden de tabulación del dashboard:** menú lateral › saludo (sin foco) › «Copiar link de
  reservas» y «Ver como paciente», si están › botones de la guía en orden › la mejora de plan ›
  «Citas de hoy».
- **Contraste:**

  | Elemento | Contraste |
  | --- | --- |
  | Botón coral (texto `brand-ink` sobre coral) | 5,4:1 (#122) |
  | Título de la guía (`brand-teal-dark` sobre blanco) | 9,4:1 |
  | Detalle de los pasos (`brand-gray` sobre blanco) | 5,6:1 |
  | Check blanco sobre `brand-teal` | 4,9:1 (ícono: basta 3:1) |

- **Celular:**
  - A 375 px no hay desplazamiento horizontal, y los nombres y direcciones largos se parten en
    varias líneas.
  - Los botones de la guía y de la fila del link miden al menos 40 px de alto en el celular:
    `size="sm"` (32 px) más `min-h-10 sm:min-h-0`, como en el mockup.

## Riesgos y casos límite

| Id | Caso | Qué pasa |
| --- | --- | --- |
| r-1 | La cuenta nueva se crea con dos peticiones | Si falla la segunda, queda una cuenta sin organización. Es el mismo estado que el de las cuentas de la beta, y el modo «Termina» lo resuelve (O-6). |
| r-2 | El nombre y la dirección no se pueden editar después | Hoy tampoco se puede editar una sede. Ahora salen del onboarding y los ven los pacientes desde el primer día. Refuerza «Renombrar sede» (backlog, prioridad alta), que debería incluir la dirección y entrar antes de que los médicos compartan su link. |
| r-3 | El dueño que no atiende (gerente de una clínica) | Queda como médico con especialidad, no aparece en el booking hasta tener horario, y ve la guía mientras tanto. No la puede cerrar (G-5). Se acepta: el foco es el médico independiente, y #110 ya lo deja como médico al crear una sede. |
| r-4 | Debajo de la guía, en Gratis, las métricas muestran «Tu plan no permite hacer uso de esta función» | No cambia. La primera llegada tiene dos tarjetas: la guía (con el coral) y la mejora de plan (teal). «Mi día» rehará el dashboard. |
| r-5 | El orden de los PR | La entrada directa de O-5 y el 403 de «Estados» dependen de `fix/platform-small-fixes`. Si este PR entrara antes, después de crear el consultorio se vería «Elige dónde entrar» con una sola sede, como hoy. No se rompe nada. |
| r-6 | Después de guardar el horario, el médico sigue en «Mi Disponibilidad» | Ve el link listo al volver a Inicio. Se acepta para no tocar el editor. |
| r-7 | El dashboard hace una lectura más (`GET /clinic/:clinicId/doctors`, sin caché), y tres cuando hay guía | Son lecturas de una sede, ya indexadas. |
| cl-1 | Doble clic en «Crear mi consultorio» | `lockAccountQuota` las serializa. La segunda recibe 409 y lleva a `/select` (O-7). Queda un solo consultorio. |
| cl-2 | Dueño sin memberships pero con organizaciones (solo con datos sembrados: ninguna ruta borra la membership del dueño) | `/select` lo manda al formulario y el api responde 409, que lo devuelve a `/select`: un bucle. No ocurre por ninguna ruta de la app. |
| cl-3 | El médico borra todo su horario | La guía vuelve, y si era el único médico, la fila L-2 desaparece. Sus citas ya reservadas siguen en «Citas de hoy». |
| cl-4 | Médico invitado en una sede donde ya atiende otro | L-4, fila 2: puede copiar el link de la sede y la guía le dice que él todavía no aparece. |
| cl-5 | Especialidad con espacios de más | Se recorta. La organización es nueva, así que no choca con el único `(organizationId, name)`. |
| cl-6 | Nombre del consultorio repetido en la misma cuenta | No puede pasar: la cuenta no tenía organizaciones. |

## Para el product-manager

Atendido el 25 de octubre de 2026: el product-manager actualizó «Estado» y «Prioridades» de
`docs/PRODUCT.md` en esta rama. El punto de «Riesgos conocidos» queda como pregunta para el humano.
Lo que señaló el planner:
- «Estado › No existe todavía» dice que el administrador no atiende. Desde #110, todo ADMIN de la
  organización queda como médico (sin especialidad ni horario) de cada sede que se crea. Con este
  plan, además, el dueño queda como médico con especialidad desde el onboarding.
- «Prioridades › El administrador también atiende» queda casi cubierta: le falta solo su horario,
  y la guía se lo pide.
- «Riesgos conocidos › Foco en médico independiente vs. código pensado para clínicas»: con este
  plan, el onboarding esconde organización, sede y roles.
- «Estado › Existe» podría sumar la guía de primeros pasos y que «Copiar link de reservas» solo
  aparece cuando el link funciona.

## Fuera de alcance

- Editar el nombre, la dirección o el teléfono de una sede (r-2).
- El tratamiento (Dr./Dra.) en el onboarding: sigue en «Mi perfil», y sin él el booking muestra el
  nombre completo.
- El horario en el onboarding.
- El mensaje del booking sin médicos («Esta sede todavía no tiene médicos disponibles para reservar
  citas.»). Con L-1, el médico ya no recibe el link para compartirlo antes de tiempo.
- Cambios en «Mi Disponibilidad», «Mi perfil» y el dashboard de la organización.
- La entrada directa con una sola sede y `?switch=1` (`fix/platform-small-fixes`).
- Pedir domicilio y teléfono por sede para el aviso de privacidad (WIZ-52).

## Verificación

### Typecheck y check

`pnpm typecheck && pnpm check` en `api` y en `platform`, limpios.

### Peticiones (api local, base de desarrollo)

Con la cookie de un usuario recién registrado y confirmado:
1. `POST /account` con `{ "accountName": "Consultorio Paredes" }` → 201.
2. `POST /account/first-clinic` con `{ "name": "Consultorio Paredes", "address": "Av. José Larco 812, of. 304, Miraflores", "specialty": "Dermatología" }` → 201 con `organizationId` y `clinicId`.
3. La misma petición otra vez → 409. Con la cookie de otro usuario de esa cuenta → 403. Sin
   cuenta → 403 de la política.
4. `GET /user/me/memberships` → una organización con rol ADMIN y una sede.
   `GET /user/me/resource/{clinicId}/membership` → `role: "ADMIN"` y `doctorProfileId` no nulo.
5. `GET /clinic/{clinicId}/doctors` → `[]`. Después de `PUT /clinic/{clinicId}/availability` con
   un bloque → un médico con «Dermatología».
6. Dos `POST /account/first-clinic` simultáneos de una cuenta sin organización → un 201 y un 409, y
   una sola organización en la base.

### Navegador, a 375 px y a 1280 px

1. **Cuenta nueva:** registro → confirmar el correo → «Tu consultorio». Enviar vacío muestra los
   tres errores con el foco en el primero. Con los datos, pasa por `/select` y entra directo al
   dashboard de la sede. Ve «Te falta 1 paso para recibir citas», sin «Copiar link de reservas».
2. «Definir horario» → guardar → Inicio: la fila «Tus pacientes ya pueden reservar desde el link.»
   «Copiar link de reservas» copia el link, y «Ver como paciente» abre el booking con la cabecera
   «Reserva tu cita con {nombre}», «Dermatología» y la dirección.
3. **Cuenta de la beta:** `POST /account` sin `first-clinic` y después iniciar sesión. «Elige dónde
   entrar» lleva a «Termina de crear tu consultorio», también con `?switch=1`, y después a la guía.
4. **Fallo a medias:** en local, sin commitear, se fuerza un error en `POST /account/first-clinic`.
   La caja dice O-6, el reintento crea solo el consultorio, y al recargar se ve el modo «Termina».
5. **Roles:** un USER y un ADMIN sin perfil en una sede sin médicos ven el aviso L-3 (el ADMIN, con
   el enlace). Un DOCTOR invitado sin especialidad, en una sede que ya recibe citas, ve la fila L-2
   y la guía de 2 pasos sin botón en el paso 1 y con «Definir horario» en teal.
6. Borrar el horario del único médico: vuelve la guía y desaparece la fila L-2.

### e2e (`cd platform && pnpm test:e2e`)

Se corre la suite completa. Varias de estas pruebas ya las cambia `fix/platform-small-fixes`
(`clinicDashboardUrl`, `loginAndGoTo`, `?switch=1`): este PR parte de esa versión. Cambian en el
mismo PR:

| Prueba | Por qué |
| --- | --- |
| `e2e/support/ui.ts` (`completeOnboardingViaUi`) | Campos, botón y la URL final (`clinicDashboardUrl`). |
| `e2e/ui/auth/onboarding.spec.ts` (CA-12) | Termina en el dashboard de la sede, no en `/select`. |
| `e2e/ui/auth/onboarding-free-plan.spec.ts` (CA-12 a CA-14) y `onboarding-form.spec.ts` (de `fix/auth-forms`) | El botón ya no dice «Continuar», cambian el campo y el título, y hay dos campos obligatorios más. |
| `e2e/ui/account/create-organization-button.spec.ts` (CA-10 y CA-21) | El dueño sin organización ya no ve «Crear organización»: llega al formulario. CA-9 y CA-20 no cambian. |
| `e2e/ui/auth/forgot-password.spec.ts` (CA-23 y CA-33) | El dueño sin organización ahora inicia sesión en `/onboarding`, no en `/select`. |
| `e2e/ui/profile/profile-view.spec.ts` (CA-45) | Igual, si su helper espera `/select` al iniciar sesión. |
| `e2e/ui/clinic/dashboard-booking-link.spec.ts` | No debería cambiar: su sede tiene un médico con horario. Se corre igual. |

Pruebas nuevas, según los criterios del product-manager. Por ejemplo: el endpoint nuevo (dueño,
una sola vez, 403, 409, concurrencia y que no acepte ids en el cuerpo) y L-4 en sus cinco filas.
`platform/e2e/README.md` se actualiza con el onboarding nuevo.

### Lo verificado en este plan

Solo el mockup, en la sesión de Lavish (Node 22), con la Playwright de
`platform/node_modules/@playwright/test` escuchando `pageerror` y los errores de consola:
- cero errores en la página, el artifact y las 19 vistas;
- un solo cierre de `body`, al final del archivo;
- el recorrido completo en la vista navegable: errores al enviar vacío con el foco en el primer
  campo, creación, guía con 1 paso, «Definir horario», «Agregar rango», «Guardar disponibilidad»,
  vuelta a Inicio por el menú del celular, fila «Listo» y «¡Link copiado!»;
- los interruptores D-1 b, D-2 c y D-3 b, que recargan todas las vistas;
- sin desplazamiento horizontal a 375 px ni a 1024 px.

Ninguno de los flujos anteriores se ejecutó contra la app.

## Criterios de aceptación

Los marcados **[e2e]** los cubre el e2e-tester con Playwright. Los **[manual]** se comprueban en el
navegador, con peticiones al api local o en el diff, y el **[typecheck]**, con `pnpm typecheck` y
`pnpm check`. Salvo que se diga otra cosa, las pantallas se prueban a 375 px y a 1280 px, en una
cuenta Gratis. Los criterios suponen que `fix/auth-forms` y `fix/platform-small-fixes` ya están en
`main` (r-5).

Escenarios:
- **Cuenta nueva:** usuario registrado y con el correo confirmado, sin cuenta.
- **Beta sin organización:** dueño de una cuenta creada solo con `POST /account`. Es el mismo estado
  que deja un fallo a medias (O-6, r-1).
- **Dueño de antes:** cuenta con organización y sede creadas por api (`createOnboardedAdmin` y
  `createClinicResource`). Desde #110, el dueño atiende en la sede sin especialidad ni horario.
- **Sede con médicos:** al menos un médico con especialidad y horario.
- **Sede sin médicos:** ningún médico con especialidad y horario.

«Aparece en el link» significa que su `doctorProfileId` está en `GET /clinic/{clinicId}/doctors`.
«Coral» es el fondo `brand-coral` (`rgb(255, 111, 89)`), y «teal», la variante `default`
(`brand-teal`, `rgb(12, 126, 117)`).

### Onboarding: el formulario (O-2, O-4, D-1, D-2)

- **CA-1. [e2e]** Cuenta nueva: `/onboarding` muestra el `h1` «Tu consultorio», la descripción «Es el último paso. Tus pacientes verán estos datos al reservar.», la frase de la beta y, en este orden, «Nombre del consultorio», «Dirección» y «Tu especialidad», con los placeholders y el `autocomplete` de O-2. El botón dice «Crear mi consultorio». No hay campo de teléfono, de plan ni de facturación, y el formulario envía `plan=FREE`.
- **CA-2. [e2e]** Al enviar vacío, cada campo muestra su error de O-2 debajo de él, en `role="alert"`, con `aria-invalid="true"` y `aria-describedby` hacia el error, y el foco queda en «Nombre del consultorio». Un campo con solo espacios da el mismo error. No se crea cuenta, organización ni sede.
- **CA-3. [e2e]** Con un solo campo vacío (cualquiera de los tres), solo ese campo muestra error y recibe el foco, y los otros dos conservan lo escrito.
- **CA-4. [e2e]** Un campo más largo que el máximo que fije el engineer muestra un mensaje en español debajo de él, conserva lo escrito y no crea nada.
- **CA-5. [e2e]** A 375 px, con un nombre y una dirección de 80 caracteres, el formulario no tiene desplazamiento horizontal.
- **CA-6. [manual]** Al enviar, el botón queda deshabilitado, con el spinner y «Creando tu consultorio…». El orden de tabulación es «Nombre del consultorio» › «Dirección» › «Tu especialidad» › «Crear mi consultorio». Los dos modos se ven como en el mockup.

### Onboarding: qué crea (O-1, O-3, D-2)

- **CA-7. [e2e]** Cuenta nueva, con «Consultorio Paredes», «Av. José Larco 812, of. 304, Miraflores» y «Dermatología» (la prueba los hace únicos):
  - quedan una cuenta con una suscripción Gratis, una organización y una sede, las tres con el nombre escrito, y la sede con la dirección escrita;
  - el dueño es ADMIN de la organización y DOCTOR de la sede, con `doctor_profile`, y `GET /user/me/resource/{clinicId}/membership` devuelve `doctorProfileId` no nulo;
  - su perfil tiene una sola especialidad, «Dermatología», creada en esa organización.
- **CA-8. [e2e]** Lo escrito se guarda recortado: «  Dermatología  » queda «Dermatología», y lo mismo pasa con el nombre y la dirección.
- **CA-9. [e2e]** La sede queda sin teléfono (D-2 a). El celular con que se registró el dueño no se guarda en la sede ni aparece en la tabla de Sedes.
- **CA-10. [e2e]** Crear el consultorio no envía ningún correo ni crea ninguna invitación.
- **CA-11. [e2e]** Mientras no tenga horario, el dueño no aparece en `GET /clinic/{clinicId}/doctors`, que devuelve una lista vacía. Con un horario, aparece con «Dermatología» como única especialidad.

### Onboarding: después de crear (O-5)

- **CA-12. [e2e]** Cuenta nueva: «Crear mi consultorio» termina en el dashboard de la sede nueva (`clinicDashboardUrl`), sin mostrar la lista de «Elige dónde entrar», sin modales y sin toast.
- **CA-13. [e2e]** En esa primera llegada se ve la guía «Te falta 1 paso para recibir citas»: el paso 1 listo con «Dermatología», el paso 2 pendiente con «Definir horario» en coral y el paso 3 bloqueado. No están «Copiar link de reservas» ni «Ver como paciente». Debajo siguen, como hoy, el aviso de plan de las métricas y «Citas de hoy» con «No hay citas programadas para hoy.».

### Onboarding: errores (O-6, O-7)

- **CA-14. [manual]** Con un error forzado en local, sin commitear, en `POST /account/first-clinic`: la caja encima del botón dice «Tu cuenta quedó creada, pero no pudimos crear tu consultorio. Vuelve a intentarlo.» y los campos conservan lo escrito. Al quitar el error y reintentar, llega al dashboard, y en la base hay una sola cuenta y una sola suscripción.
- **CA-15. [e2e]** Si el usuario ya tiene cuenta cuando envía el modo cuenta nueva (la prueba la crea por api con la página abierta), el envío crea solo el consultorio: no hay una segunda cuenta ni una segunda suscripción, no se muestra error y llega al dashboard. Es el reintento de O-6 sin forzar el fallo.
- **CA-16. [e2e]** Si el consultorio ya existe cuando se envía (la prueba lo crea por api con la página abierta, como un doble envío), no se muestra error: llega al dashboard de la sede que ya existe, y la cuenta sigue con una organización y una sede.
- **CA-17. [manual]** Con el api detenido, la caja dice «No pudimos crear tu consultorio. Vuelve a intentarlo.». Ningún error del onboarding sale en inglés ni como toast.

### Quién ve el formulario (O-4, D-3, B-1 a B-3)

- **CA-18. [e2e]** Beta sin organización: al iniciar sesión, y al abrir `/account/{accountId}/select` con o sin `?switch=1`, llega a `/onboarding` con el `h1` «Termina de crear tu consultorio» y la descripción «Te falta este paso para tener tu link de reservas.». Tiene los mismos tres campos y el mismo botón, sin la frase de la beta. Nunca ve «Elige dónde entrar» ni «Crear organización».
- **CA-19. [e2e]** Beta sin organización: al crear, la cuenta es la misma (mismo `accountId`, misma suscripción y mismo plan, también si es un plan de pago sembrado con Prisma). En esa cuenta queda lo de CA-7, y el dueño llega al dashboard con la guía de CA-13.
- **CA-20. [e2e]** Al abrir `/onboarding`, siguen redirigidos como hoy el dueño con organización, cualquier miembro invitado (ADMIN, DOCTOR o USER) y el usuario de una cuenta que no es el dueño y no tiene memberships. Este último sigue viendo «No perteneces a ninguna organización todavía.», sin «Crear organización» (B-2).
- **CA-21. [e2e]** Cuenta con organización y sin sede (B-3): «Elige dónde entrar» muestra la organización, como hoy, sin redirigir al formulario. Un ADMIN con organización sigue viendo «Crear organización».

### Guía de primeros pasos (G-1 a G-6)

- **CA-22. [e2e]** La guía sale en el dashboard de la sede, debajo del saludo, solo para quien atiende en esa sede y no aparece en el link. No tiene botón para cerrarla. Quien no atiende en la sede (ADMIN sin perfil en ella o USER) nunca la ve.
- **CA-23. [e2e]** Dueño de antes, en una sede sin médicos: el `h2` dice «Te faltan 2 pasos para recibir citas» y el texto, «Mientras tanto, tu link de reservas no funciona: quien lo abra no podrá reservar.». Los pasos son:
  - 1, «Elige tu especialidad», pendiente, con «Tus pacientes la ven al reservar.» y «Elegir especialidad» en coral;
  - 2, «Define tu horario de atención», pendiente, con «Elige los días y las horas en que atiendes. Tus pacientes solo podrán reservar en esos horarios.» y «Definir horario» en `outline`;
  - 3, «Comparte tu link de reservas», bloqueado, con «Cuando completes los pasos, aquí copias tu link para enviarlo por WhatsApp o ponerlo en tus redes.» y sin botón.
- **CA-24. [e2e]** «Elegir especialidad» lleva a `/account/{accountId}/clinic/{clinicId}/me`, donde la fila de la sede en «Dónde atiendes» ofrece «Asignar especialidades». Al elegir una y volver a Inicio, el título pasa a «Te falta 1 paso para recibir citas», el paso 1 queda listo con el nombre de la especialidad y «Definir horario» pasa a coral.
- **CA-25. [e2e]** «Definir horario» lleva a `/account/{accountId}/clinic/{clinicId}/profile/availability` («Mi Disponibilidad»). Con la especialidad y un horario guardado, al volver a Inicio la guía ya no está y se ve la fila de CA-32.
- **CA-26. [e2e]** Si el médico borra todo su horario, la guía vuelve con el paso 2 pendiente. Si era el único médico de la sede, la fila de CA-32 desaparece. Sus citas ya reservadas para hoy siguen en «Citas de hoy» (cl-3).
- **CA-27. [e2e]** Médico invitado (DOCTOR) sin especialidad, en una sede con médicos:
  - arriba, la fila de CA-32, con «Copiar link de reservas» en coral;
  - debajo, la guía «Te faltan 2 pasos para aparecer en el link de reservas», con «El link de {sede} ya recibe citas con otros médicos.»;
  - el paso 1 dice «Te la asigna un administrador de {sede}.» y no tiene botón, el paso 2 tiene «Definir horario» en teal y no hay paso 3.
- **CA-28. [e2e]** La guía y la fila del link no nombran a otros médicos ni muestran sus especialidades. El paso 1 solo muestra las especialidades del propio médico en esa sede, aunque tenga otras en otra sede.
- **CA-29. [e2e]** La guía es una `section` con `aria-labelledby` hacia su `h2`, y los pasos van en un `ol`. Cada paso dice su estado en texto («Listo», «Pendiente» o «Disponible al completar los pasos anteriores»), y los íconos llevan `aria-hidden`. Los botones son enlaces con su nombre («Elegir especialidad», «Definir horario»).

### Link de reservas en el dashboard (L-1 a L-5)

- **CA-30. [e2e]** Sin médicos en el link, nadie ve «Copiar link de reservas» ni «Ver como paciente» en el dashboard de la sede (L-1).
- **CA-31. [e2e]** Sede sin médicos, para quien no atiende: un aviso con `role="status"`, el `h2` «El link de reservas todavía no funciona» y «Funciona cuando un médico de {sede} tenga especialidad y horario.». El ADMIN ve además «Asignar médicos en Usuarios», que lleva a `/account/{accountId}/clinic/{clinicId}/users`. El USER no ve el enlace.
- **CA-32. [e2e]** Con al menos un médico en el link, todos los roles de la sede ven la fila «Tus pacientes ya pueden reservar desde el link.», con «Copiar link de reservas» en coral y «Ver como paciente» en `outline`.
- **CA-33. [e2e]** «Copiar link de reservas» copia el link que termina en `/clinic/{clinicId}/create-appointment` y muestra «¡Link copiado!». «Ver como paciente» abre ese link en una pestaña nueva, y su nombre accesible incluye «(se abre en una pestaña nueva)».
- **CA-34. [e2e]** El link funciona de verdad. Tras CA-12 y CA-25, un paciente sin sesión abre el link copiado y llega a «¡Cita reservada!». La cabecera dice «Reserva tu cita con {nombre} {apellido}», con «Dermatología» y «{sede} · {dirección}» tal como se escribieron en el onboarding.
- **CA-35. [e2e]** Sede creada antes de #110, donde el dueño no atiende (la prueba lo simula con Prisma): ve el aviso de CA-31 con «Asignar médicos en Usuarios». Si desde Usuarios se asigna como Médico de la sede, al volver a Inicio ve la guía (B-4).
- **CA-36. [manual]** Si falla la lectura de los médicos de la sede, de «Mi perfil» o del horario (forzada en local, sin commitear), el dashboard muestra «Copiar link de reservas» como hoy, sin fila de estado ni guía, y el resto del dashboard carga. El error se registra sin nombres, correos ni teléfonos.
- **CA-37. [e2e]** El dashboard de la organización no muestra la guía, la fila, el aviso ni «Copiar link de reservas», como hoy.

### Un solo coral por pantalla (G-4)

- **CA-38. [e2e]** En el dashboard de la sede hay a lo sumo un elemento coral visible:

  | Caso (L-4) | Coral |
  | --- | --- |
  | Atiende, no aparece y el link no funciona | El primer paso pendiente con botón: «Elegir especialidad» o, si ya tiene especialidad o no la puede editar, «Definir horario». Los demás botones de la guía, `outline`. |
  | Atiende y no aparece, con el link funcionando | «Copiar link de reservas». El primer botón de la guía es teal y los demás, `outline`. |
  | Aparece en el link, o no atiende y el link funciona | «Copiar link de reservas». |
  | No atiende y el link no funciona | Ninguno. |

  En todos los casos, «Pedir el plan …» de las métricas sigue en teal. El onboarding no tiene ningún elemento coral, en ninguno de sus dos modos.

### Celular y accesibilidad del dashboard

- **CA-39. [e2e]** A 375 px no hay desplazamiento horizontal en el dashboard de la sede en ninguno de los casos de L-4, tampoco con un nombre de sede y una especialidad de 80 caracteres. Los botones de la guía y de la fila del link miden al menos 40 px de alto.
- **CA-40. [manual]** El dashboard se ve como en el mockup a 375 px y a 1280 px: en el celular, los botones de la guía van a lo ancho debajo del texto, y desde `sm`, a la derecha. El orden de tabulación es menú › «Copiar link de reservas» y «Ver como paciente», si están › botones de la guía, en orden › la mejora de plan › «Citas de hoy».

### `POST /account/first-clinic` (pasa por el security-reviewer)

- **CA-41. [e2e]** Dueño de una cuenta Gratis sin organizaciones: 201 con exactamente `{ organizationId, clinicId }`, sin 402, y lo creado es lo de CA-7, todo en la cuenta de la sesión.
- **CA-42. [e2e]** Si la cuenta ya tiene una organización, con sede o sin ella: 409 «Tu consultorio ya está creado», sin crear ni cambiar nada.
- **CA-43. [e2e]** Quien no es el dueño de su cuenta (ADMIN, DOCTOR o USER invitado, o un usuario de la cuenta sin memberships) recibe 403 «Sólo el dueño de la cuenta puede crear su consultorio», tenga o no organizaciones la cuenta, y no se escribe nada.
- **CA-44. [e2e]** Sin sesión: 401. Con sesión pero sin cuenta, sin el correo confirmado o sin onboarding: 403 de la política. Ninguno escribe nada.
- **CA-45. [e2e]** Ningún id del cuerpo decide dónde se escribe. Si el cuerpo trae `accountId`, `organizationId`, `resourceId`, `clinicId`, `userId` u `ownerId` de otra cuenta (también de otra cuenta de la beta sin organización), la otra cuenta queda sin cambios: la petición responde 400 o crea el consultorio en la cuenta de la sesión.
- **CA-46. [e2e]** Un cuerpo inválido (campo ausente, vacío, con solo espacios, de otro tipo o más largo que el máximo) responde 400 con mensajes en español y no escribe nada.
- **CA-47. [e2e]** Dos peticiones simultáneas del mismo dueño dejan un 201 y un 409. En la base quedan una organización, una sede, una membership ADMIN y una DOCTOR del dueño, y un perfil con una especialidad.
- **CA-48. [e2e]** Los cuerpos de los 403 y del 409 no traen ids, nombres ni correos.
- **CA-49. [manual]** En el diff, la ruta declara `policy({ account: true, confirmed: true, onboarded: true })` y no usa `requireFeature`. Todas las lecturas y escrituras del caso de uso se acotan por el `accountId` de la sesión y van en una transacción. `policy.ts`, `auth.ts` y `entitlements.ts` no cambian.

### Sin regresiones

- **CA-50. [manual]** No se tocan datos de cuentas existentes: no hay script ni migración de datos. Si el engineer hace nullable `clinic.phone`, es una migración nueva creada con `pnpm prisma:migrate`, y ninguna migración existente cambia. El diff no toca el booking público (`app/clinic/[clinicId]/create-appointment/` ni `components/booking/`), «Mi perfil» ni «Mi Disponibilidad».
- **CA-51. [e2e]** `POST /account`, `POST /organization` y `POST /organization/:resourceId/clinics` se comportan como hoy: `fix-account-setup-once.spec.ts`, `beta-free-plan-only.spec.ts`, `fix-org-clinic-creation-role.spec.ts` y `admin-attends-by-default.spec.ts` pasan sin cambiar sus expectativas.
- **CA-52. [e2e]** El booking público, la autogestión, «Mi perfil» y «Mi Disponibilidad» no cambian: las pruebas de `e2e/ui/booking/`, `e2e/ui/clinic/public-booking.spec.ts`, `e2e/ui/appointment/` y `e2e/ui/profile/` pasan sin cambiar sus expectativas, salvo cómo llega el dueño sin organización en `profile-view.spec.ts` (tabla siguiente).
- **CA-53. [e2e]** Pasa la suite completa. Las pruebas de la tabla siguiente se adaptan al comportamiento nuevo, no se borran, y cada una sigue comprobando lo que comprobaba.
- **CA-54. [manual]** `platform/e2e/README.md` describe el onboarding nuevo, la guía, el link del dashboard y el endpoint, con los CA de este plan en sus filas.
- **CA-55. [typecheck]** `pnpm typecheck` y `pnpm check` limpios en `api` y en `platform`.

### e2e que cambian

| Prueba | Por qué cambia | Sigue comprobando | Criterios |
| --- | --- | --- | --- |
| `e2e/support/ui.ts` (`completeOnboardingViaUi`) | Llena solo «Nombre del consultorio», pulsa «Continuar» y espera `/select`. | Que el onboarding deja al usuario dentro de su cuenta: llena los tres campos, pulsa «Crear mi consultorio» y espera `clinicDashboardUrl(accountId)`. | CA-1, CA-12 |
| `e2e/ui/auth/onboarding.spec.ts` | Termina en `/select`. | Registro → confirmación → login → onboarding Gratis, con el médico en su cuenta nueva, que ahora es el dashboard de su sede con la guía. | CA-12, CA-13 |
| `e2e/ui/auth/onboarding-free-plan.spec.ts` (CA-12 a CA-14 de su plan) | Cambian el título y el botón, y hay dos campos obligatorios más. | Solo Gratis, `plan=FREE`, ninguna petición a `*culqi.com`, y el nombre vacío no crea cuenta. | CA-1, CA-2 |
| `e2e/ui/auth/onboarding-form.spec.ts` (de `fix/auth-forms`) | Título, campos y botón. | El estándar de `formularios-entrada`: `AuthCard`, error debajo de cada campo, foco en el primero inválido y caja de error encima del botón. | CA-1 a CA-3 |
| `e2e/ui/account/create-organization-button.spec.ts`, CA-10 | El dueño sin organización ya no pasa por «Elige dónde entrar». | Que el dueño nuevo crea su organización y su sede y queda Administrador, ahora desde «Termina de crear tu consultorio», y además como médico de la sede. | CA-18, CA-19 |
| `e2e/ui/account/create-organization-button.spec.ts`, CA-21 | El dueño sin organización llega al formulario y no ve el botón. | Que el usuario de la cuenta que no es el dueño no ve «Crear organización». Para el dueño, que llega a «Termina de crear tu consultorio». CA-9 y CA-20 no cambian. | CA-18, CA-20 |
| `e2e/ui/auth/forgot-password.spec.ts` (CA-23 y CA-33 de su plan) | El dueño sin organización inicia sesión en `/onboarding`, no en `/select`. | Que la contraseña nueva entra y las demás sesiones se cierran. Solo cambia la URL de llegada. | CA-18 |
| `e2e/ui/profile/profile-view.spec.ts` (CA-45 de su plan) | Si su helper espera `/select` al iniciar sesión con el dueño sin organización. | Lo que comprueba de «Mi perfil» de ese dueño. Solo cambia cómo llega. | CA-18 |
| `e2e/ui/clinic/dashboard-booking-link.spec.ts` | No debería cambiar: su sede tiene un médico con horario. | «Copiar link de reservas» y «¡Link copiado!» en la sede, y nada en la organización. | CA-32, CA-33, CA-37 |

Las demás pruebas del dashboard de la sede (`plan-feature-notice.spec.ts` y
`today-appointments-treatment.spec.ts`) no deberían cambiar. Si alguna choca con el aviso nuevo,
que también lleva `role="status"`, se ajusta el localizador, no la expectativa.
