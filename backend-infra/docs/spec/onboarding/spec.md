# Onboarding: tus datos, tu plan, tu consultorio y tu horario

- **Ticket:** [WIZ-77](https://linear.app/wizydoc/issue/WIZ-77/onboarding-asks-for-the-personal-data),
  subticket de [WIZ-71 · Migrate authentication endpoints](https://linear.app/wizydoc/issue/WIZ-71/migrate-authentication-endpoints).
- **Producto:** `docs/features/onboarding-por-pasos/prd.md` (v2), con las
  decisiones del humano del 9 al 12 de noviembre de 2026. Esta spec es el
  contrato de `backend-infra`; las pantallas las define el plan de platform.
- **Se apoya en la [spec de la sesión](../session/spec.md):** el autorizador,
  la `policy()`, `OnboardingStep` y `AccountId` del usuario. Las cuatro rutas
  son privadas.
- **Reemplaza a:** en `api/`, `POST /account` y el onboarding de primer-uso
  (`create-first-clinic.usecase.ts`), para los usuarios del registro nuevo.

## Qué cambia

Después de registrarse, la persona pasa por cuatro pasos:

1. **Tus datos** (obligatorio): nombre, apellido, celular y tratamiento.
2. **Tu plan** (obligatorio): en la beta, sólo Gratis.
3. **Tu consultorio** (obligatorio): nombre, dirección y especialidad. Crea la
   organización y la sede, con el dueño como administrador y como médico.
4. **Tu horario** (opcional): lo guarda o lo omite. Cualquiera de las dos cosas
   termina el onboarding.

El paso en que va cada persona vive en `OnboardingStep`. Cada ruta sólo se
puede usar en su paso, y cada escritura exige, de forma atómica, que el paso
siga siendo el esperado: no se puede saltar un paso ni crear dos consultorios.

| `OnboardingStep` | Lo pasa al siguiente |
|---|---|
| `PERSONAL_DATA` | guardar «Tus datos» → `PLAN` |
| `PLAN` | guardar «Tu plan» → `CLINIC` |
| `CLINIC` | crear «Tu consultorio» → `SCHEDULE` |
| `SCHEDULE` | guardar u omitir «Tu horario» → `COMPLETED`, con `OnboardingCompletedAt` |

## Diferencias con hoy

| Hoy (el api, primer-uso) | Con esta spec |
|---|---|
| Un formulario «Tu consultorio» que crea la cuenta, la organización y la sede. | Cuatro pasos. La cuenta ya existe desde el registro. |
| El nombre, el apellido y el celular los pide el registro. | Los pide «Tus datos». |
| El plan va oculto (`FREE`) en el formulario. | «Tu plan» lo guarda en su propio ítem. En la beta, el backend sólo acepta Gratis. |
| La cuenta lleva el nombre del consultorio. | La cuenta no tiene nombre; el nombre vive en la organización y en la sede. |
| El onboarding termina al crear la cuenta. | Termina al guardar u omitir el horario. |
| La especialidad va a un catálogo por organización. | Va en la membership del médico, como lista. |

## Rutas

Las cuatro exigen la clave de platform y el ID token. Si el cuerpo no es un
objeto JSON, responden 400 con «La solicitud no es válida.». Si el usuario no
está en el paso de la ruta, la `policy()` responde 403 con el paso en que va
(ver la spec de la sesión).

### `PUT /api/onboarding/personal-data`: tus datos

Se puede usar con `OnboardingStep` en `PERSONAL_DATA`, `PLAN` o `CLINIC`: así
«Atrás» puede corregir los datos sin perder el plan. Sólo con `PERSONAL_DATA`
pasa el paso a `PLAN`; en los otros dos, el paso no cambia.

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `givenName` | Texto, se recorta, entre 1 y 100 caracteres. | Escribe tu nombre. / El nombre no puede tener más de 100 caracteres. |
| `familyName` | Igual que el nombre. | Escribe tu apellido. / El apellido no puede tener más de 100 caracteres. |
| `phone` | Un celular de 9 dígitos que empieza con 9, o un fijo con su código de ciudad, de Perú. Se guarda con `+51`. Las reglas son las de `phone.vo.ts` de #133. | Escribe tu celular. / Escribe un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad. |
| `treatment` | Opcional: `DR`, `DRA` o `null`. | Tratamiento inválido |

| Código | Cuándo | Cuerpo |
|---|---|---|
| 200 | Se guardaron los datos. | `{ "onboardingStep" }`, el paso después de guardar. |
| 400 | La entrada es inválida. | `{ "message": "<primer error>" }` |
| 500 | Falla DynamoDB. | `{ "message": "No pudimos guardar tus datos. Intenta de nuevo." }` |

### `PUT /api/onboarding/plan`: tu plan

Se puede usar con `OnboardingStep` en `PLAN` o `CLINIC` («Atrás» desde «Tu
consultorio»). La primera vez crea el plan de la cuenta (`ACCOUNT#<id>`,
`SK "SUBSCRIPTION"`, con `Plan`, `CreatedAt` y el índice `PLAN#<plan>`) y pasa
el paso a `CLINIC`, en la misma transacción. Con `CLINIC` y el mismo plan,
responde 200 sin cambiar nada.

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `plan` | `FREE`, `CONSULTORIO`, `CLINICA` o `RED`. Durante la beta sólo se acepta `FREE`. | Elige un plan. / Durante la beta, todas las cuentas empiezan en Gratis. |

| Código | Cuándo | Cuerpo |
|---|---|---|
| 200 | El plan quedó guardado. | `{ "onboardingStep" }` |
| 400 | La entrada es inválida, o el plan no es `FREE` durante la beta. | `{ "message": "<primer error>" }` |
| 500 | Falla DynamoDB. | `{ "message": "No pudimos guardar tu plan. Intenta de nuevo." }` |

### `POST /api/onboarding/clinic`: tu consultorio

Sólo con `OnboardingStep = CLINIC`. En una transacción crea:

- la organización (`ORG#<id>`) y la sede (`CLINIC#<id>`) de la cuenta del
  usuario, con el mismo nombre y la dirección en la sede;
- la membership `ADMIN` del usuario sobre la organización;
- la membership `DOCTOR` del usuario sobre la sede, con `Specialties` igual a
  la especialidad que escribió;
- el paso en `SCHEDULE`.

La sede nace sin teléfono y sin «WhatsApp o teléfono para pacientes».

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `name` | Texto, se recorta, entre 1 y 100 caracteres. | Escribe el nombre de tu consultorio. / El nombre del consultorio no puede tener más de 100 caracteres. |
| `address` | Texto, se recorta, entre 1 y 200 caracteres. | Escribe la dirección de tu consultorio. / La dirección no puede tener más de 200 caracteres. |
| `specialty` | Texto, se recorta, entre 1 y 100 caracteres. | Escribe tu especialidad. / La especialidad no puede tener más de 100 caracteres. |

| Código | Cuándo | Cuerpo |
|---|---|---|
| 201 | Se creó el consultorio. | `{ "organizationId", "clinicId", "onboardingStep": "SCHEDULE" }` |
| 400 | La entrada es inválida. | `{ "message": "<primer error>" }` |
| 409 | Otro pedido ya creó el consultorio: el paso dejó de ser `CLINIC` entre la `policy()` y la escritura. | `{ "message": "Tu consultorio ya está creado." }` |
| 500 | Falla DynamoDB. | `{ "message": "No pudimos crear tu consultorio. Intenta de nuevo." }` |

### `PUT /api/onboarding/schedule`: tu horario

Sólo con `OnboardingStep = SCHEDULE`. Guarda el horario del usuario en la sede
que creó (`USER#<id>`, `SK SCHEDULE#<clinicId>`) y pasa el paso a `COMPLETED`,
con `OnboardingCompletedAt`, en la misma transacción. Omitirlo es la misma ruta
con `skip: true`: no guarda horario y termina igual.

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `skip` | Opcional, booleano. Con `true`, `weeklySchedule` se ignora. | La solicitud no es válida. |
| `weeklySchedule` | Sin `skip`: una lista de 1 a 70 bloques `{ dayOfWeek, startTime, endTime }`, con `dayOfWeek` de 0 (domingo) a 6 y las horas en `HH:mm` (00:00 a 23:59), en hora de pared de la sede. El inicio va antes del fin, y los bloques de un mismo día no se solapan. Las reglas son las de `insert-availability.usecase.ts` de hoy. | Los mensajes de hoy, por ejemplo «La hora de inicio debe ser anterior a la hora de fin» o «Los rangos del lunes no pueden solaparse». |

| Código | Cuándo | Cuerpo |
|---|---|---|
| 200 | El horario quedó guardado, o se omitió. | `{ "onboardingStep": "COMPLETED" }` |
| 400 | La entrada es inválida. | `{ "message": "<primer error>" }` |
| 409 | Otro pedido ya terminó el onboarding. | `{ "message": "Ya terminaste de configurar tu cuenta." }` |
| 500 | Falla DynamoDB. | `{ "message": "No pudimos guardar tu horario. Intenta de nuevo." }` |

## Fuera de alcance

- **Platform:** las cuatro pantallas, el avance «Paso 1 de 4» y llevar a cada
  persona a su paso según `GET /api/me`. Van en el plan y el mockup de platform.
- **Editar después del onboarding:** «Mi perfil» (los datos personales), «Mi
  disponibilidad» (el horario) y editar el consultorio (WIZ-79).
- **Cobrar con Culqi** y cambiar de plan.
- **Invitar a alguien** desde el onboarding.
- **La finalidad del celular en la política de privacidad** (WIZ-80), que va
  antes de publicar el onboarding.

## Riesgos aceptados

- **El nombre del consultorio no es único en la cuenta.** El onboarding crea una
  sola organización, y crear otras todavía no existe en el backend nuevo.
- **El paso del onboarding es un dato guardado, no calculado.** Se escribe en la
  misma transacción que los datos de cada paso, con la condición del paso
  esperado, así que no se desfasa. El humano lo prefirió a deducirlo de los
  datos.

## Criterios de aceptación

- Guardar «Tus datos» con `PERSONAL_DATA` guarda el nombre, el apellido, el
  celular con `+51` y el tratamiento, y pasa el paso a `PLAN`.
- Guardar «Tus datos» con `PLAN` o `CLINIC` corrige los datos sin cambiar el
  paso.
- Un celular que no es de Perú, o un nombre vacío, responde 400 y no guarda
  nada.
- Guardar «Tu plan» con `FREE` crea el plan de la cuenta, indexado por plan, y
  pasa el paso a `CLINIC` en la misma transacción.
- Durante la beta, un plan que no es `FREE` responde 400 y no guarda nada.
- Crear «Tu consultorio» crea, en una transacción, la organización, la sede, la
  membership `ADMIN` sobre la organización, la membership `DOCTOR` sobre la
  sede con la especialidad, y pasa el paso a `SCHEDULE`.
- De dos pedidos a la vez para crear el consultorio, sólo uno lo crea; el otro
  responde 409.
- Guardar «Tu horario» crea el horario del usuario en su sede y pasa el paso a
  `COMPLETED`, con `OnboardingCompletedAt`.
- Omitir «Tu horario» pasa el paso a `COMPLETED`, con `OnboardingCompletedAt`,
  sin crear horario.
- Un horario con bloques que se solapan o con el inicio después del fin
  responde 400 y no termina el onboarding.
- Cada ruta usada fuera de su paso responde 403 con el paso en que va el
  usuario.
- Las cuatro rutas exigen la clave de platform y el ID token, y declaran su
  policy.
- Ni los datos personales ni los tokens aparecen en los logs.
