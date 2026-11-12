# Plan: onboarding en cuatro pasos

Spec: [spec.md](./spec.md) · Ticket: WIZ-77 · Va **después** de las partes 3 y 4
de [../session/plan.md](../session/plan.md) (la `policy()`, `RoutePolicy`,
`handlePrivateRoute`, `addPrivateRoute` y el autorizador) y usa lo que dejaron
sus partes 1 y 2: la cuenta, `AccountId`, `OnboardingStep` y la lectura del
usuario con sus memberships.

## Objetivo

Las cuatro rutas privadas del onboarding, «Tus datos», «Tu plan», «Tu
consultorio» y «Tu horario», cada una con su Lambda y una policy que la deja
usar sólo en su paso. Cada escritura exige el paso esperado y pasa al siguiente
en la misma operación de DynamoDB.

## Decidido por el humano el 12 de noviembre de 2026

- **El modelo de datos** de la sección «Ítems de DynamoDB». No se rediseña.
- **Sin `CreatedAt` en los ítems cuyo id es un ULID:** la cuenta, la
  organización, la sede y la membership. `decodeTime(id)` da la fecha. Sólo el
  plan (`ACCOUNT#<id>` / `SUBSCRIPTION`), que no tiene ULID propio, guarda
  `CreatedAt`, y el horario conserva su `UpdatedAt`.
- **El rol de la organización se hereda en sus sedes,** como hoy: la `policy()`
  de la sesión usa el rol más alto entre la membership directa de la sede y la
  de su organización. Lo implementa la sesión. Ninguna de estas cuatro rutas va
  sobre un recurso, así que no les afecta (ver «Para otros tickets»).

## Partes

Cada parte se puede mergear sola sin romper `main` y se apila sobre la anterior
con `gh stack`. La parte 1 lleva este plan y sale después de la spec (#160) y de
la parte 4 de la sesión. Los tamaños son de código de producción, sin pruebas
ni docs.

| Parte | Qué entrega | Depende de | Se verifica sola con | Tamaño estimado |
|---|---|---|---|---|
| 1 | Este plan y **los datos personales en el usuario**: los value objects de nombre, celular y tratamiento; su lectura en la policy y en `GET /api/me`; el cliente de Cognito sin `given_name` ni `family_name`. Ninguna ruta los escribe todavía. | spec #160 y parte 4 de la sesión | Pruebas de los value objects, de DynamoDB, de `/api/me` y de Cognito; `/api/me` en staging. | ~140 líneas |
| 2 | **La ruta «Tus datos»**: el 500 con el mensaje de cada ruta, el repositorio del onboarding con `savePersonalData`, el caso de uso, el handler, su Lambda y su ruta. | 1 | Pruebas de la ruta y de DynamoDB; pedidos a staging. | ~210 líneas |
| 3 | **La ruta «Tu plan»**: el plan de la cuenta (`SUBSCRIPTION`), `savePlan`, el caso de uso, el handler, su Lambda y su ruta. | 2 | Pruebas de la ruta y de DynamoDB; pedidos a staging. | ~180 líneas |
| 4 | **Los ítems de «Tu consultorio»**: la organización, la sede, las memberships con su escritura, la fábrica que crea las cuatro y `createClinic`. Ninguna ruta los usa todavía. | 3 | Pruebas de la fábrica y de DynamoDB. | ~180 líneas |
| 5 | **La ruta «Tu consultorio»**: el caso de uso, el handler, el 201 y el 409, su Lambda y su ruta. | 4 | Pruebas de la ruta; pedidos a staging. | ~120 líneas |
| 6 | **El horario y su ítem**: el value object del horario semanal, el ítem `SCHEDULE` y `completeOnboarding`. Ninguna ruta los usa todavía. | 5 | Pruebas del value object y de DynamoDB. | ~160 líneas |
| 7 | **La ruta «Tu horario»**: las memberships en el resultado de la policy, el caso de uso con `skip`, el handler, su Lambda y su ruta. | 6 | Pruebas de la ruta; pedidos a staging. | ~140 líneas |

- **Siete partes y no cuatro.** Con sus ítems, «Tu consultorio» y «Tu horario»
  rondan las 300 líneas, así que cada una se parte en sus ítems (dominio y
  DynamoDB, sin ruta) y su ruta. «Tus datos» se parte en el dato, que ya lee
  `/api/me`, y la ruta.
- **Las partes 1, 4 y 6 no cambian lo que responde ninguna ruta.** En la parte 1,
  `/api/me` lee los datos personales, pero nadie los escribe hasta la parte 2:
  sigue respondiendo `null`. El cliente de Cognito pierde dos atributos que
  nadie escribe.
- **Se apilan en orden** porque comparten `onboarding.repository.ts`,
  `backend-stack.ts` y `test/users/fakes.ts`.
- **Orden de despliegue:** el de las partes. Ninguna necesita a otra desplegada
  antes para no romper nada.

### Archivos de la parte 1

Producción (`backend-infra/`):
- `lib/src/shared/trimmed-text.ts` (nuevo): `trimmedTextSchema({ maxLength,
  missing, tooLong })`.
- `lib/src/users/domain/value-objects/person-name.vo.ts` (nuevo):
  `givenNameSchema`, `familyNameSchema` y `PersonNameVO`.
- `lib/src/users/domain/value-objects/phone.vo.ts` (nuevo): el de `885c6ef`,
  con «Escribe tu celular.».
- `lib/src/users/domain/value-objects/treatment.vo.ts` (nuevo): el de `885c6ef`,
  con `TREATMENTS` y sin `.optional()`.
- `lib/src/users/domain/user.entity.ts`: `PersonalData`; `User` gana sus cuatro
  campos, opcionales.
- `lib/src/users/infrastructure/persistence/dynamodb/user.schema.ts`:
  `GivenName`, `FamilyName`, `Phone` y `Treatment` en el ítem y en
  `userItemSchema`.
- `lib/src/users/infrastructure/persistence/dynamodb/user.mappers.ts`:
  `fromDynamoToDomain` los mapea.
- `lib/src/users/infrastructure/persistence/dynamodb/user.repository.ts`: los
  cuatro en `PARTITION_READ_ATTRIBUTES`.
- `lib/src/users/handlers/me.http.ts`: responde los datos del usuario en lugar
  de los cuatro `null` fijos.
- `lib/authentication.ts`: `writableAttributes` sólo con `email`.

Pruebas: `test/users/person-name.vo.test.ts`, `test/users/phone.vo.test.ts` y
`test/users/treatment.vo.test.ts` (nuevas), `test/users/dynamodb.test.ts`,
`test/users/me.test.ts` y `test/authentication.test.ts`.

Docs: `backend-infra/docs/spec/onboarding/plan.md`.

### Archivos de la parte 2

Producción:
- `lib/src/users/handlers/private-route.ts`: `handlePrivateRoute` recibe el
  mensaje de su 500.
- `lib/src/users/domain/repository/onboarding.repository.ts` (nuevo):
  `OnboardingStepTransition` e `IOnboardingRepository` con `savePersonalData`.
- `lib/src/users/application/save-personal-data.usecase.ts` (nuevo): el esquema
  de entrada, `PERSONAL_DATA_STEPS` y el caso de uso.
- `lib/src/users/infrastructure/persistence/dynamodb/onboarding.repository.ts`
  (nuevo): `userStepUpdate` y `savePersonalData`.
- `lib/src/users/handlers/save-personal-data.http.ts` y
  `save-personal-data.handler.ts` (nuevos).
- `lib/src/users/handlers/http-messages.ts`: `PERSONAL_DATA_FAILED`.
- `lib/backend-stack.ts`: `SAVE_PERSONAL_DATA_ACCESS`, `SavePersonalDataFunction`
  y su ruta.

Pruebas: `test/users/save-personal-data.test.ts` (nueva),
`test/users/private-route.test.ts`, `test/users/dynamodb.test.ts`,
`test/users/fakes.ts` y `test/backend-stack.test.ts`.

### Archivos de la parte 3

Producción:
- `lib/src/users/domain/subscription.entity.ts` (nuevo): `PLANS`, `Plan`,
  `BETA_PLAN`, `Subscription` y `createSubscription`.
- `lib/src/users/application/save-plan.usecase.ts` (nuevo), con `PLAN_STEPS`.
- `lib/src/users/domain/repository/onboarding.repository.ts`: `savePlan`.
- `lib/src/users/infrastructure/persistence/dynamodb/user.repository.ts`:
  `ONLY_IF_NEW` pasa a exportarse, porque `savePlan` es el primero que lo usa.
- `lib/src/users/infrastructure/persistence/dynamodb/subscription.schema.ts` y
  `subscription.mappers.ts` (nuevos).
- `lib/src/users/infrastructure/persistence/dynamodb/onboarding.repository.ts`:
  `savePlan`.
- `lib/src/users/handlers/save-plan.http.ts` y `save-plan.handler.ts` (nuevos).
- `lib/src/users/handlers/http-messages.ts`: `PLAN_FAILED`.
- `lib/backend-stack.ts`: `SAVE_PLAN_ACCESS`, `SavePlanFunction` y su ruta.

Pruebas: `test/users/save-plan.test.ts` (nueva), `test/users/dynamodb.test.ts`,
`test/users/fakes.ts` y `test/backend-stack.test.ts`.

### Archivos de la parte 4

Producción:
- `lib/src/users/domain/organization.entity.ts` (nuevo): `Organization`.
- `lib/src/users/domain/clinic.entity.ts` (nuevo): `Clinic`, `OwnerClinic` y
  `createOwnerClinic`.
- `lib/src/users/domain/membership.entity.ts`: `NewMembership`.
- `lib/src/users/infrastructure/persistence/dynamodb/organization.schema.ts`,
  `organization.mappers.ts`, `clinic.mappers.ts` (nuevo). `clinic.schema.ts` gana el ítem completo, y la
  lectura de la policy sigue validando sólo `OrganizationId`.
- `lib/src/users/infrastructure/persistence/dynamodb/membership.schema.ts` y
  `membership.mappers.ts`: el ítem completo y `fromMembershipToDynamo`, junto a
  la lectura que ya existe.
- `lib/src/users/domain/repository/onboarding.repository.ts` y
  `infrastructure/persistence/dynamodb/onboarding.repository.ts`: `createClinic`.

Pruebas: `test/users/clinic.entity.test.ts` (nueva),
`test/users/dynamodb.test.ts` y `test/users/fakes.ts`.

### Archivos de la parte 5

Producción:
- `lib/src/users/application/create-clinic.usecase.ts` (nuevo), con
  `CREATE_CLINIC_STEPS`.
- `lib/src/users/handlers/create-clinic.http.ts` y `create-clinic.handler.ts`
  (nuevos).
- `lib/src/shared/http/api-gateway.ts`: `CREATED` (201) y `CONFLICT` (409) en
  `HTTP_STATUS`.
- `lib/src/users/handlers/http-messages.ts`: `CLINIC_FAILED` y
  `CLINIC_ALREADY_CREATED`.
- `lib/backend-stack.ts`: `CREATE_CLINIC_ACCESS`, `CreateClinicFunction` y su
  ruta.

Pruebas: `test/users/create-clinic.test.ts` (nueva), `test/users/fakes.ts` y
`test/backend-stack.test.ts`.

### Archivos de la parte 6

Producción:
- `lib/src/users/domain/value-objects/weekly-schedule.vo.ts` (nuevo).
- `lib/src/users/domain/schedule.entity.ts` (nuevo): `Schedule`.
- `lib/src/users/infrastructure/persistence/dynamodb/schedule.schema.ts` y
  `schedule.mappers.ts` (nuevos).
- `lib/src/users/infrastructure/persistence/dynamodb/user.schema.ts`:
  `OnboardingCompletedAt` en el tipo del ítem.
- `lib/src/users/domain/repository/onboarding.repository.ts` y
  `infrastructure/persistence/dynamodb/onboarding.repository.ts`:
  `completeOnboarding`.

Pruebas: `test/users/weekly-schedule.vo.test.ts` (nueva),
`test/users/dynamodb.test.ts` y `test/users/fakes.ts`.

### Archivos de la parte 7

Producción:
- `lib/src/users/application/authorize-request.usecase.ts` y
  `lib/src/users/handlers/private-route.ts`: `memberships` en el resultado
  `authorized` y en lo que recibe `respond`.
- `lib/src/users/application/save-schedule.usecase.ts` (nuevo), con
  `SAVE_SCHEDULE_STEPS`.
- `lib/src/users/handlers/save-schedule.http.ts` y `save-schedule.handler.ts`
  (nuevos).
- `lib/src/users/handlers/http-messages.ts`: `SCHEDULE_FAILED` y
  `ONBOARDING_ALREADY_COMPLETED`.
- `lib/backend-stack.ts`: `SAVE_SCHEDULE_ACCESS`, `SaveScheduleFunction` y su
  ruta.

Pruebas: `test/users/save-schedule.test.ts` (nueva),
`test/users/private-route.test.ts`, `test/users/fakes.ts` y
`test/backend-stack.test.ts`.

## Decisiones

### Todo en el módulo `users`

Las cuatro rutas escriben el ítem del usuario y las memberships, que ya son de
`users`, y leen la sesión con la policy de `users`. La organización, la sede, el
plan y el horario no tienen otro consumidor todavía. Se descartó un módulo
`onboarding`: importaría de `users` la entidad, las claves del usuario, el ítem
de la membership y la policy, y la membership necesitaría las claves `ORG#` y
`CLINIC#` del otro módulo, que es un ciclo. Separar la organización y la sede se
decide con WIZ-79, cuando haya un segundo consumidor real. Las Lambdas se crean
con `usersFunction`, sin cambios.

### La policy de cada ruta (parte 2)

`routePolicySchema.onboardingStep` ya admite, además de un paso o
`ANY_ONBOARDING_STEP`, una lista no vacía de pasos, y `AuthorizeRequestUseCase`
compara por pertenencia (sesión, parte 4). `/api/me` no cambia: su
`ROUTE_POLICY` sigue siendo `{"confirmed":false,"onboardingStep":"ANY"}`.

| Ruta | `RoutePolicy` |
|---|---|
| `PUT /api/onboarding/personal-data` | `{ onboardingStep: PERSONAL_DATA_STEPS }` = `["PERSONAL_DATA", "PLAN", "CLINIC"]` |
| `PUT /api/onboarding/plan` | `{ onboardingStep: PLAN_STEPS }` = `["PLAN", "CLINIC"]` |
| `POST /api/onboarding/clinic` | `{ onboardingStep: CREATE_CLINIC_STEPS }` = `["CLINIC"]` |
| `PUT /api/onboarding/schedule` | `{ onboardingStep: SAVE_SCHEDULE_STEPS }` = `["SCHEDULE"]` |

- **Cada lista vive en su caso de uso, y el stack la importa** al declarar la
  ruta. Así la policy y el caso de uso no pueden divergir. Esos archivos sólo
  importan Zod, el dominio y el tipo del repositorio (`import type`): la
  síntesis no carga el AWS SDK, como pide el plan de la sesión.
- **`confirmed` queda en su valor por defecto, `true`:** la confirmación crea al
  usuario confirmado.
- **Ninguna declara `member` ni `roles`:** ninguna va sobre un `{resourceId}`.
  Actúan sobre el usuario de la sesión y su `AccountId`, que vienen de DynamoDB.

### El cuerpo antes que la policy (partes 2, 3, 5 y 7)

- Cada handler valida el cuerpo y después llama a `handlePrivateRoute`, como las
  rutas públicas. Un pedido mal formado responde 400 sin leer DynamoDB. Con el
  cuerpo inválido y el paso equivocado, responde 400.
- Cada esquema es un `z.object(…, { error: INVALID_REQUEST })`, así que un cuerpo
  que no es un objeto JSON responde «La solicitud no es válida.». El 400 lleva
  el primer mensaje de Zod. Son textos fijos y nunca repiten lo que escribió el
  usuario.

### El 500 de cada ruta (parte 2)

`handlePrivateRoute(event, authorizeRequest, respond, failureMessage =
REQUEST_FAILED)`. La spec pide el mensaje de la ruta para toda falla de
DynamoDB, también en la lectura de la policy. Por eso el mensaje llega al
envoltorio en lugar de capturarse dentro de `respond`. `/api/me` sigue con el
genérico, y el log sigue siendo `errorName(error)`.

### El paso, en la misma escritura (partes 2 a 7)

`IOnboardingRepository` recibe en cada método una `OnboardingStepTransition = {
from: readonly OnboardingStep[]; to?: OnboardingStep }`, que arma el caso de uso:
la tabla de pasos de la spec se lee en los casos de uso, no en DynamoDB. El
repositorio la convierte, con un método privado `userStepUpdate(userId,
transition, attributesToSet)`, en el `Update` del usuario:

- `Key: { PK: "USER#<id>", SK: "!" }`;
- `ConditionExpression: #OnboardingStep IN (:from0, …)`. Si el ítem no existe la
  condición falla, así que un `Update` no crea usuarios;
- `UpdateExpression: SET #OnboardingStep = :to` (si hay `to`), más los atributos
  del paso.

Si la condición falla, perdió la carrera contra otro pedido: `isLostRace`
(`lost-race.ts`, el de la confirmación) devuelve `false` o `undefined`, y
cualquier otro error sube y responde 500.

| Ruta | Si otro pedido cambió el paso entre la policy y la escritura |
|---|---|
| «Tus datos» | Vuelve a intentar una vez como corrección (ver abajo). |
| «Tu plan» | 200 `{ "onboardingStep": "CLINIC" }`: el otro pedido ya guardó el plan, y con `CLINIC` la spec responde 200 sin cambiar nada. |
| «Tu consultorio» | 409 «Tu consultorio ya está creado.» |
| «Tu horario» | 409 «Ya terminaste de configurar tu cuenta.» |

### «Tus datos» (partes 1 y 2)

**Los value objects** (parte 1):
- **`givenNameSchema` y `familyNameSchema`:** `trimmedTextSchema` con 100
  caracteres, los mensajes de la spec y la marca `PersonNameVO`. `.max` cuenta
  unidades UTF-16, como el `nameField` de #133.
- **`phoneSchema`:** el de `git show
  885c6ef:backend-infra/lib/src/users/domain/value-objects/phone.vo.ts` sin
  cambiar sus reglas, con `.trim().min(1)` y «Escribe tu celular.» antes de la
  transformación, también para un valor que no es texto. Lo demás responde el
  mensaje de #133. Las normalizaciones que probaba `sign-up-input.test.ts` de
  #133 pasan a `phone.vo.test.ts`.
- **`treatmentSchema`:** `z.enum(TREATMENTS, { error: "Tratamiento inválido"
  }).brand<"TreatmentVO">()`, el de `885c6ef` sin `.optional()`. La entrada de
  la ruta le agrega `.nullable().default(null)`.
- **`trimmedTextSchema`** va en `shared/` porque lo usan cinco campos de dos
  rutas: nombre, apellido, nombre del consultorio, dirección y especialidad.

**El usuario** (parte 1):
- `PersonalData = { givenName: PersonNameVO; familyName: PersonNameVO; phone:
  PhoneVO; treatment: TreatmentVO | null }`. `User` gana sus cuatro campos como
  opcionales (`Partial<PersonalData>`): no existen hasta «Tus datos».
- **La lectura de la policy los trae:** `PARTITION_READ_ATTRIBUTES` suma
  `GivenName`, `FamilyName`, `Phone` y `Treatment`, y `userItemSchema` los lee
  opcionales con sus value objects, que son idempotentes, como ya hace `Email`:
  un celular con `+51` vuelve a dar el mismo. Así `/api/me` no necesita otra
  lectura. Cada ruta privada tiene esos datos en memoria, y ninguna los registra.
- **`/api/me`** responde `user.givenName ?? null` y lo mismo con los otros tres.

**El cliente de Cognito** (parte 1): `writableAttributes` queda sólo con
`email: true`.
- Con el access token, el usuario puede cambiar él mismo los atributos de esa
  lista. Hoy podría escribir un nombre en Cognito sin pasar por nuestras reglas,
  y nadie lo lee: el nombre vive en DynamoDB.
- No se deja vacía: sin `WriteAttributes`, el cliente puede escribir todos los
  atributos estándar. `email` es inmutable en el pool, así que tampoco cambia.
- CloudFormation lo actualiza sin interrupción: las sesiones siguen.

**El caso de uso** (parte 2): `SavePersonalDataUseCase.execute(user,
personalData): Promise<OnboardingStep>`.
1. Si `user.onboardingStep` es `PERSONAL_DATA`: `savePersonalData(user.id,
   personalData, { from: ["PERSONAL_DATA"], to: "PLAN" })`. Si devuelve un paso,
   responde ese.
2. Si no, o si el primer intento perdió la carrera: `savePersonalData(user.id,
   personalData, { from: ["PLAN", "CLINIC"] })`, sin cambiar el paso. Si
   devuelve `undefined`, lanza un error sin valores (500).

- **Por qué el segundo intento:** con dos «Continuar» a la vez desde
  `PERSONAL_DATA`, los dos pasan la policy, el primero pasa a `PLAN` y la
  condición del segundo falla. Al segundo se le responde como si hubiera llegado
  después, que con `PLAN` es corregir. Sin el reintento respondería 500 con los
  datos del otro pedido ya guardados.
- **Si falla también la corrección,** el usuario creó su consultorio en el
  medio: 500, y el pedido siguiente recibe el 403 de la policy con su paso.

**La escritura** (parte 2): un `UpdateCommand` con `userStepUpdate` y `SET
#GivenName, #FamilyName, #Phone, #Treatment`, más `ReturnValues: "ALL_NEW"`.
Devuelve el `OnboardingStep` de `Attributes`, validado con
`z.enum(ONBOARDING_STEPS)`.
- **`ALL_NEW`** hace que el paso de la respuesta sea el de después de guardar,
  aunque «Tu plan» lo haya movido al mismo tiempo. No gasta lectura.
- **Sin tratamiento se guarda `Treatment: null`,** que se lee como `null`. Así una
  corrección a «sin tratamiento» usa la misma expresión, sin `REMOVE`.

**La respuesta:** 200 `{ "onboardingStep" }` con `jsonResponse`. Si falla, 500
«No pudimos guardar tus datos. Intenta de nuevo.».

### «Tu plan» (parte 3)

- **La entrada:** `plan: z.enum(PLANS, { error: "Elige un plan." }).refine((plan)
  => plan === BETA_PLAN, { error: "Durante la beta, todas las cuentas empiezan en
  Gratis." })`, con `PLANS = ["FREE", "CONSULTORIO", "CLINICA", "RED"]` y
  `BETA_PLAN = "FREE"`.
- **`SavePlanUseCase.execute(user, plan): Promise<OnboardingStep>`:**
  1. Con `CLINIC`, responde `CLINIC` sin leer ni escribir. Durante la beta, el
     único plan que se guarda y el único que se acepta es `FREE`, así que «con
     `CLINIC` y el mismo plan» se cumple siempre. La spec que abra los planes de
     pago decide qué pasa con otro plan en `CLINIC`.
  2. Con `PLAN`: `savePlan(createSubscription({ accountId: user.accountId, plan },
     now), user.id, { from: ["PLAN"], to: "CLINIC" })`. Haya guardado o perdido
     la carrera, responde `CLINIC`. Perder la carrera significa que otro pedido
     guardó el plan y el paso en la misma transacción.
- **La transacción:** el `Put` del plan con `attribute_not_exists(PK)` y el
  `Update` del usuario. Son 2 acciones.
- **`Subscription = { accountId, plan, createdAt }`.** El plan guarda
  `CreatedAt` porque no tiene un ULID propio.
- **La respuesta:** 200 `{ "onboardingStep": "CLINIC" }`. Si falla, 500 «No
  pudimos guardar tu plan. Intenta de nuevo.».

### «Tu consultorio» (partes 4 y 5)

**La fábrica** (parte 4): `createOwnerClinic({ ownerUserId, accountId, name,
address, specialty }, now)` genera los ids de la organización y de la sede con
`ulid(now.getTime())`, así que `decodeTime` de los dos da `now`. Devuelve:
- `organization = { id, accountId, name }`;
- `clinic = { id, accountId, organizationId, name, address }`, con el mismo
  nombre. No tiene `patientContact`: la sede nace sin él y el atributo no se
  escribe;
- `memberships`: `{ userId: ownerUserId, resourceId: organization.id,
  resourceType: "ORGANIZATION", accountId, role: "ADMIN" }` y `{ userId:
  ownerUserId, resourceId: clinic.id, resourceType: "CLINIC", accountId, role:
  "DOCTOR", specialties: [specialty] }`.

`NewMembership extends Membership { userId: ULID; specialties?: string[] }`. La
policy sigue leyendo `Membership`. Que `specialties` vaya sólo con `DOCTOR` lo
asegura la fábrica, que hoy es la única que crea memberships.

**La organización y la cuenta de la sede salen del servidor, nunca del
cuerpo.** La herencia de roles de la `policy()` confía en
`CLINIC#<id>.OrganizationId` y en el `AccountId` de cada membership tal como
están escritos. Una sede que apuntara a la organización de otra cuenta
aparecería entre las sedes de esa organización, y sus administradores heredarían
su rol sobre ella. Por eso, en «Tu consultorio»:
- la organización y la sede nacen en la misma transacción, y
  `clinic.organizationId` es el id de la organización que crea la fábrica;
- la organización, la sede y las dos memberships llevan el `accountId` del
  usuario de la sesión (`user.accountId`), que viene de DynamoDB;
- el esquema de entrada sólo declara `name`, `address` y `specialty`. Un
  `organizationId` o un `accountId` en el cuerpo se descartan, porque `z.object`
  quita las claves que no declara, y una prueba lo fija (ver «Pruebas», parte 5).

**La entrada** (parte 5): `name` (100), `address` (200) y `specialty` (100) con
`trimmedTextSchema` y los mensajes de la spec.

**La transacción** (parte 4): son 5 acciones, sobre 5 ítems distintos:
1. el `Put` de `ORG#<id>`;
2. el `Put` de `CLINIC#<id>`;
3. el `Put` de `USER#<userId>` / `MEMBERSHIP#<organizationId>`;
4. el `Put` de `USER#<userId>` / `MEMBERSHIP#<clinicId>`;
5. el `Update` del usuario, de `CLINIC` a `SCHEDULE`.

Los cuatro `Put` llevan `attribute_not_exists(PK)`. En una membership, la
condición mira el ítem con esa `PK` y esa `SK`, no la partición: que el ítem del
usuario ya exista en `USER#<id>` no la hace fallar.

**El caso de uso** (parte 5): `CreateClinicUseCase.execute(user, input)` devuelve
`{ kind: "created", organizationId, clinicId }` o `{ kind: "already-created" }`.
- 201 `{ "organizationId", "clinicId", "onboardingStep": "SCHEDULE" }`.
- 409 «Tu consultorio ya está creado.».
- 500 «No pudimos crear tu consultorio. Intenta de nuevo.».

**Dos pedidos a la vez:** los dos leen `CLINIC` y sólo una transacción se
confirma. La otra se cancela por la condición del usuario
(`ConditionalCheckFailed`) o, si la primera todavía corre, por
`TransactionConflict`. `isLostRace` cuenta las dos, y el pedido responde 409. Si
el segundo llega cuando el primero ya terminó, la policy ve `SCHEDULE` y responde
403 con el paso, que también es correcto: el 409 es para los que pasaron la
policy a la vez.

### «Tu horario» (partes 6 y 7)

**`weeklyScheduleSchema`** (parte 6, marca `WeeklyScheduleVO`) copia las reglas y
los mensajes de `api/src/application/use-cases/availability/insert-availability.usecase.ts`:
- cada bloque es un objeto: «Cada rango debe ser un objeto con día, inicio y fin»;
- `dayOfWeek` es un entero de 0 a 6, con sus tres mensajes;
- las horas van en `HH:mm` de 00:00 a 23:59: «La hora debe ser un texto con
  formato HH:mm» y «La hora debe tener formato HH:mm entre 00:00 y 23:59»;
- el inicio va antes del fin: «La hora de inicio debe ser anterior a la hora de
  fin», en `endTime`;
- hay hasta 70 bloques: «No puedes registrar más de 70 rangos de
  disponibilidad»;
- no se solapan dos bloques del mismo día: «Los rangos del lunes no pueden
  solaparse», con los nombres de los días de hoy;
- si no es una lista: «La disponibilidad debe ser una lista de rangos»;
- además, `.min(1)` con «La solicitud no es válida.». Hoy una lista vacía borra
  la disponibilidad, pero en el onboarding omitir es `skip: true` y platform no
  manda una lista vacía.

El esquema devuelve los bloques ordenados por día y hora de inicio. Las horas
son de pared de la sede y se guardan tal cual.

**La entrada** (parte 7): `z.object({ skip: z.boolean({ error: INVALID_REQUEST
}).optional(), weeklySchedule: z.unknown() }, { error: INVALID_REQUEST })`, con
un `.transform`:
- con `skip: true`, devuelve `{ skip: true }` sin mirar `weeklySchedule`;
- si no, lo pasa por `weeklyScheduleSchema` y copia su primer error
  (`context.addIssue` y `z.NEVER`).

**La sede** (parte 7) es la membership `CLINIC` del usuario con rol `DOCTOR` y
`accountId === user.accountId`, entre las que ya leyó la policy. Por eso
`authorized` y `respond` ganan `memberships`.
- Si no hay exactamente una, lanza un error sin valores (500): el onboarding crea
  una sola.
- No viene del cuerpo: la spec no la manda, y así no puede ser la sede de otro.
- Sólo se busca al guardar; omitir no la necesita.

**La escritura** (parte 6): `completeOnboarding({ userId, completedAt, schedule?
}, { from: ["SCHEDULE"], to: "COMPLETED" })`, con `Schedule = { userId,
clinicId, accountId, weeklySchedule, updatedAt }`. Es un `TransactWriteCommand`
con:
- el `Put` del horario, sólo si se guarda. No lleva condición: hay uno por
  usuario y sede, y «Mi disponibilidad» lo va a reemplazar;
- el `Update` del usuario, con `userStepUpdate` y `OnboardingCompletedAt =
  :completedAt`.

Son 1 o 2 acciones, con un solo camino en el código. Omitir con una transacción
de una acción gasta 2 unidades de escritura en lugar de 1, una vez por cuenta.
`completedAt` y `updatedAt` son el mismo `now`.

**Las respuestas:** 200 `{ "onboardingStep": "COMPLETED" }`; 409 «Ya terminaste
de configurar tu cuenta.»; 500 «No pudimos guardar tu horario. Intenta de
nuevo.».

### Sin `CreatedAt` (parte 4)

- **La cuenta** ya no guarda `CreatedAt` desde la parte 1 de la sesión (#161).
- **La organización y la sede** (parte 4) nacen sin `CreatedAt`, con el mismo
  mecanismo.
- **La membership** (parte 4) no tiene un id propio: su `SK` lleva el ULID del
  recurso, así que `decodeTime(ResourceId)` da la fecha del recurso. En el
  onboarding coincide con la de la membership. Con las invitaciones dejará de
  coincidir. Si entonces hace falta la fecha de la membership, la spec de las
  invitaciones la agrega.

### Lo que IAM no puede separar (la nota del security-reviewer)

**La Lambda de la confirmación no gana permisos.** Sigue con `PutItem` sobre
`USER#*` y `ACCOUNT#*`, que hoy le alcanza para escribir una membership
(`USER#<id>` / `MEMBERSHIP#…`) o un plan (`ACCOUNT#<id>` / `SUBSCRIPTION`).

- **No se puede acotar por `SK`.** `dynamodb:LeadingKeys` es sólo la clave de
  partición, y en una transacción cada ítem se autoriza con su acción y su
  partición. Ninguna condición de IAM mira la clave de orden.
- **Se separan las Lambdas y los permisos.** Cada ruta del onboarding es una
  Lambda privada, detrás del autorizador, con su rol y sólo las acciones y los
  prefijos que usa (ver «Permisos exactos»). Ninguna Lambda pública gana un
  permiso.
- **El riesgo que queda se acepta porque no es nuevo.** El mismo `PutItem` sobre
  `USER#*` ya le permite a la confirmación reescribir el ítem de cualquier
  usuario, incluido el `CognitoSub` que lo enlaza a su sesión. Eso es peor que
  inventar una membership, y tampoco lo cierra IAM: lo cierra el código, que
  sólo crea ítems nuevos con `attribute_not_exists(PK)`, y la prueba de síntesis
  que fija sus permisos.
- **Lo mismo vale para las rutas del onboarding:** `UpdateItem` también crea
  ítems, así que toda Lambda que escribe en `USER#*` podría crear una membership.
- **Se descartaron dos alternativas:**
  - `dynamodb:Attributes`, que filtra por nombre de atributo. Le impediría a la
    confirmación escribir `Role` o `Plan`, pero no `CognitoSub` ni `GSI2PK`, que
    necesita. No cierra lo peor y obliga a mantener al día la lista de atributos
    de cada Lambda.
  - Sacar las memberships de la partición del usuario. El modelo es del humano,
    y que vivan en `USER#<id>` es lo que deja a la policy leer el usuario y sus
    memberships en una sola consulta.

## Flujos

Las cuatro rutas siguen el mismo camino:
1. El gateway revisa la clave de platform y el ID token (sesión, parte 4).
2. El handler valida el cuerpo. Si es inválido, responde 400 sin leer DynamoDB.
3. `handlePrivateRoute` lee el `sub`, y la policy lee al usuario y sus
   memberships y compara su paso con la lista de la ruta. Si no está, responde
   403 con el paso.
4. `respond(authorized)` llama al caso de uso con el usuario de
   DynamoDB y la entrada validada.
5. El caso de uso arma los ítems y la transición, y el repositorio los escribe
   en una sola operación.
6. El handler traduce el resultado: 200 o 201, 409, o el 500 de la ruta.

## Puertos y adaptadores

| Contrato | Método | Parte |
|---|---|---|
| `IOnboardingRepository` (nuevo) | `savePersonalData(userId, personalData, transition): Promise<OnboardingStep \| undefined>` (el paso después de guardar, o `undefined` si perdió la carrera) | 2 |
| | `savePlan(subscription, userId, transition): Promise<boolean>` | 3 |
| | `createClinic(ownerClinic, transition): Promise<boolean>` | 4 |
| | `completeOnboarding({ userId, completedAt, schedule? }, transition): Promise<boolean>` | 6 |

La implementación es `infrastructure/persistence/dynamodb/onboarding.repository.ts`.
Cada caso de uso recibe sólo su método (`Pick<IOnboardingRepository, "…">`) y un
`now: () => Date` para las fechas. Los handlers arman además
`AuthorizeRequestUseCase` con `UserRepository` y `readRoutePolicy()`, como
`me.handler.ts`.

## Ítems de DynamoDB

| Ítem | `PK` | `SK` | `ItemType` | Otros atributos | Índices |
|---|---|---|---|---|---|
| Usuario (cambia, partes 1, 2 y 6) | `USER#<ulid>` | `!` | `USER` | Los de hoy, más `GivenName`, `FamilyName`, `Phone` (`+51…`) y `Treatment` (`DR`, `DRA` o `null`) desde «Tus datos», y `OnboardingCompletedAt` (ISO) al terminar. | `GSI1` y `GSI2` no cambian. |
| Cuenta (cambió en la sesión) | `ACCOUNT#<ulid>` | `!` | `ACCOUNT` | `Id` y `OwnerUserId`, sin `CreatedAt`. | — |
| Plan (nuevo, parte 3) | `ACCOUNT#<accountId>` | `SUBSCRIPTION` | `SUBSCRIPTION` | `Plan` y `CreatedAt` (ISO). | `GSI1PK = PLAN#<plan>`, `GSI1SK = ACCOUNT#<accountId>` |
| Organización (nuevo, parte 4) | `ORG#<ulid>` | `!` | `ORGANIZATION` | `Id`, `AccountId` y `Name`. | `GSI1PK = ACCOUNT#<accountId>`, `GSI1SK = ORG#<id>` |
| Sede (nuevo, parte 4) | `CLINIC#<ulid>` | `!` | `CLINIC` | `Id`, `AccountId`, `OrganizationId`, `Name` y `Address`. `PatientContact` no se escribe. | `GSI1PK = ORG#<organizationId>`, `GSI1SK = CLINIC#<id>`; `GSI2PK = ACCOUNT#<accountId>`, `GSI2SK = CLINIC#<id>` |
| Membership (se escribe desde la parte 4) | `USER#<userId>` | `MEMBERSHIP#<resourceId>` | `MEMBERSHIP` | `UserId`, `ResourceId`, `ResourceType` (`ORGANIZATION` o `CLINIC`), `AccountId`, `Role` y `Specialties` (lista, sólo con `DOCTOR`). | `GSI1PK = ORG#<resourceId>` o `CLINIC#<resourceId>`, `GSI1SK = MEMBER#<userId>` |
| Horario (nuevo, parte 6) | `USER#<userId>` | `SCHEDULE#<clinicId>` | `SCHEDULE` | `UserId`, `ClinicId`, `AccountId`, `WeeklySchedule` (lista de `{ DayOfWeek, StartTime, EndTime }`) y `UpdatedAt` (ISO). | `GSI1PK = CLINIC#<clinicId>`, `GSI1SK = SCHEDULE#<userId>` |

- **Qué dato nuevo guarda cada uno.** Los datos personales, el plan elegido, el
  nombre del consultorio, su dirección, quién es administrador o médico de qué
  recurso, con qué especialidad, y el horario: nada de eso está hoy en ninguna
  parte. `OnboardingCompletedAt` es cuándo terminó, que la spec de la sesión
  decidió guardar.
- **Lo que no se guarda porque se calcula:** la fecha de creación de la cuenta,
  la organización, la sede y la membership (`decodeTime`), y si el usuario es el
  dueño (`OwnerUserId`).
- **Las claves `ORG#` y `CLINIC#`** las definen `organization.schema.ts` y
  `clinic.schema.ts`, y `membership.schema.ts` las importa para su `GSI1PK`.
- **Nadie consulta todavía los índices nuevos.** Los escribe el modelo para el
  booking, la agenda y WIZ-79. Quien los lea revisa `ItemType`, como pide
  `AGENTS.md`: en `GSI1`, `ORG#<id>` reúne la sede y las memberships de la
  organización, y `CLINIC#<id>`, las memberships y los horarios de la sede.
- **El horario vive en la partición del usuario,** así que la consulta de la
  policy lo lee y lo filtra (ver «Riesgos aceptados del plan»).

## Infraestructura

`lib/backend-stack.ts`, con `usersFunction` (Node 22, arm64, 15 s, 512 MB, logs
un mes):

| Lambda | Handler | Descripción | Parte |
|---|---|---|---|
| `SavePersonalDataFunction` | `save-personal-data` | «Saves the owner's name, phone and title in the first onboarding step.» | 2 |
| `SavePlanFunction` | `save-plan` | «Saves the account's plan in the second onboarding step.» | 3 |
| `CreateClinicFunction` | `create-clinic` | «Creates the owner's organization, clinic and memberships in the third onboarding step.» | 5 |
| `SaveScheduleFunction` | `save-schedule` | «Saves or skips the owner's weekly schedule and finishes the onboarding.» | 7 |

Las cuatro reciben `TABLE_NAME`, y `ROUTE_POLICY` de `ApiGateway.addPrivateRoute`.

**Permisos exactos.** Las cuatro tienen lo que necesita toda ruta privada:
`SESSION_USER_PREFIXES` (`dynamodb:Query` con `LeadingKeys` en `USER#*`) y la
consulta de `index/GSI2`. Además:

| Lambda | `dynamodb:PutItem` (`LeadingKeys`) | `dynamodb:UpdateItem` (`LeadingKeys`) |
|---|---|---|
| `SavePersonalDataFunction` | — | `USER#*` |
| `SavePlanFunction` | `ACCOUNT#*` | `USER#*` |
| `CreateClinicFunction` | `ORG#*`, `CLINIC#*`, `USER#*` | `USER#*` |
| `SaveScheduleFunction` | `USER#*` | `USER#*` |

- Ninguna tiene `GetItem`, `DeleteItem`, `GSI1`, Cognito ni SES.
- Las acciones de una transacción se autorizan con estos permisos.
- `ConfirmSignUpFunction` no cambia.

**Rutas:** el `addPrivateRoute` privado de `BackendStack` (que da a la Lambda
`SESSION_USER_PREFIXES`, la consulta de `GSI2` y su `TableAccess`, y llama a
`ApiGateway.addPrivateRoute`) con `"api/onboarding/personal-data"` y `PUT`,
`"api/onboarding/plan"` y `PUT`, `"api/onboarding/clinic"` y `POST`, y
`"api/onboarding/schedule"` y `PUT`, con las policies de «La policy de cada
ruta». La revisión de la etapa de #149 no cambia: sólo actúa cuando se quitan
rutas.

**Cognito** (parte 1): el cliente de platform escribe sólo `email`.

**Logs:** ni los handlers ni los casos de uso registran el evento, el cuerpo, los
claims ni los ítems. Los errores, sólo `errorName(error)`, en el envoltorio.

`lib/dynamo.ts` y `lib/api-gateway.ts`: sin cambios.

## Aislamiento entre cuentas

- **El usuario y la cuenta salen de la sesión.** Cada caso de uso recibe el
  `user` de la policy, leído por el `sub` que validó el gateway. `user.id` y
  `user.accountId` vienen de DynamoDB, nunca del cuerpo, de un parámetro ni de
  una cabecera.
- **Los cuerpos sólo traen datos,** nunca ids. Los ids de la organización y de
  la sede los genera el servidor.
- **Todo lo que se crea lleva el `AccountId` del usuario:** el plan
  (`ACCOUNT#<accountId>`), la organización, la sede, las dos memberships y el
  horario.
- **La sede apunta a la organización que nace con ella,** en la misma
  transacción. Ni la organización ni la cuenta de la sede salen del cuerpo,
  porque la herencia de roles confía en lo que guardan `OrganizationId` y
  `AccountId` (ver «Tu consultorio»).
- **La sede del horario es la del propio usuario:** una membership `DOCTOR` de su
  partición con `accountId === user.accountId`. No puede apuntar a la sede de
  otra cuenta.
- **No hay rutas públicas nuevas,** y ninguna recibe un `{resourceId}`.
- **IAM acota los prefijos, no al usuario** (ver «Lo que IAM no puede separar»).

## Pruebas

Con el estilo de `test/`: los handlers con el caso de uso real y dobles en
memoria, los adaptadores con clientes que registran los comandos, y la
infraestructura con síntesis de CDK.

**Dobles en `test/users/fakes.ts`**
- `buildUser` admite los datos personales (parte 1).
- `InMemoryOnboarding` implementa `IOnboardingRepository` sobre el mismo almacén
  de `InMemoryUsers`, así la policy del pedido siguiente ve el paso nuevo. Aplica
  la transición sólo si el paso guardado está en `from`, guarda lo que crea
  (`subscriptions`, `organizations`, `clinics`, `memberships`, `schedules`) y
  tiene `failOnWrite` (partes 2 a 7).
- Para la carrera, un modo que deja pasar las dos lecturas de la policy antes de
  la primera escritura (parte 5).

**Otras pruebas, además de los criterios**
- Parte 1:
  - el celular normaliza los casos de #133, responde «Escribe tu celular.» si
    falta, si está en blanco o si no es texto, y rechaza uno de otro país;
  - el tratamiento acepta `DR`, `DRA` y `null`, y rechaza `dr` y `Dr.`;
  - el nombre se recorta, y acepta 100 caracteres y no 101;
  - un usuario sin datos personales responde `null` en `/api/me`;
  - la consulta de la partición proyecta los cuatro atributos;
  - el cliente de Cognito escribe sólo `email`.
- Parte 2:
  - el 500 de la ruta lleva su mensaje también si falla la lectura de la policy;
  - un cuerpo inválido responde 400 sin leer DynamoDB;
  - el `Update` lleva la condición `IN`, el `SET` exacto, `Treatment: null`
    cuando no eligió y `ALL_NEW`;
  - si dos pedidos guardan a la vez desde `PERSONAL_DATA`, el segundo corrige y
    responde `PLAN`;
  - el `ROUTE_POLICY` y los permisos de `SavePersonalDataFunction`.
- Parte 3:
  - con `CLINIC` y `FREE` responde 200 sin escribir;
  - si pierde la carrera responde 200 con `CLINIC`;
  - la transacción exacta: el `Put` con `GSI1PK = PLAN#FREE` y su condición, y el
    `Update` desde `PLAN`;
  - `ROUTE_POLICY` y permisos.
- Parte 4:
  - la fábrica pone el mismo nombre en la organización y en la sede, `ADMIN` sin
    especialidades y `DOCTOR` con la especialidad, y ids que dan `now`;
  - la sede apunta a la organización que crea la misma fábrica, y la
    organización, la sede y las dos memberships llevan el `accountId` que
    recibe;
  - la transacción tiene las 5 acciones con los ítems exactos, sin `CreatedAt` ni
    `PatientContact`;
  - si pierde la carrera devuelve `false`, y otro error sube.
- Parte 5:
  - «crear Tu consultorio ignora la organización y la cuenta del cuerpo»: con un
    `organizationId` y un `accountId` de otra cuenta en el cuerpo, la sede apunta
    a la organización nueva, y la organización, la sede y las dos memberships
    llevan el `AccountId` del usuario de la sesión;
  - el cuerpo del 201;
  - los mensajes de nombre, dirección y especialidad;
  - `ROUTE_POLICY` y permisos.
- Parte 6:
  - cada mensaje del horario semanal;
  - acepta 70 bloques y no 71;
  - una lista vacía responde «La solicitud no es válida.»;
  - la salida va ordenada;
  - la transacción con horario y sin él, con `OnboardingCompletedAt`, y el ítem
    del horario exacto.
- Parte 7:
  - la sede sale de la membership propia y no de la de otra cuenta;
  - sin una membership `DOCTOR` en una sede propia, responde 500;
  - `skip: true` ignora un `weeklySchedule` inválido;
  - un `skip` que no es booleano responde 400;
  - `ROUTE_POLICY` y permisos.

## Cobertura de los criterios

Prueba en `test/users/`, salvo donde se indica. Entre paréntesis, la parte.

| Criterio | Prueba |
|---|---|
| Guardar «Tus datos» con `PERSONAL_DATA` guarda el nombre, el apellido, el celular con `+51` y el tratamiento, y pasa el paso a `PLAN` | `save-personal-data.test.ts` y `dynamodb.test.ts`: «guardar Tus datos con PERSONAL_DATA guarda el nombre, el apellido, el celular con +51 y el tratamiento, y pasa el paso a PLAN» (2). |
| Guardar «Tus datos» con `PLAN` o `CLINIC` corrige los datos sin cambiar el paso | `save-personal-data.test.ts`: «guardar Tus datos con PLAN o CLINIC corrige los datos sin cambiar el paso» (2). |
| Un celular que no es de Perú, o un nombre vacío, responde 400 y no guarda nada | `save-personal-data.test.ts`: «un celular que no es de Perú, o un nombre vacío, responde 400 y no guarda nada» (2). |
| Guardar «Tu plan» con `FREE` crea el plan de la cuenta, indexado por plan, y pasa el paso a `CLINIC` en la misma transacción | `save-plan.test.ts` y `dynamodb.test.ts`: «guardar Tu plan con FREE crea el plan de la cuenta, indexado por plan, y pasa el paso a CLINIC en la misma transacción» (3). |
| Durante la beta, un plan que no es `FREE` responde 400 y no guarda nada | `save-plan.test.ts`: «durante la beta, un plan que no es FREE responde 400 y no guarda nada» (3). |
| Crear «Tu consultorio» crea, en una transacción, la organización, la sede, la membership `ADMIN` sobre la organización, la membership `DOCTOR` sobre la sede con la especialidad, y pasa el paso a `SCHEDULE` | `dynamodb.test.ts` (4) y `create-clinic.test.ts` (5): «crear Tu consultorio crea, en una transacción, la organización, la sede, la membership ADMIN sobre la organización, la membership DOCTOR sobre la sede con la especialidad, y pasa el paso a SCHEDULE». |
| De dos pedidos a la vez para crear el consultorio, sólo uno lo crea; el otro responde 409 | `create-clinic.test.ts`: «de dos pedidos a la vez para crear el consultorio, sólo uno lo crea; el otro responde 409», con las dos lecturas antes de la primera escritura (5). `dynamodb.test.ts`: una cancelación por `ConditionalCheckFailed` o `TransactionConflict` devuelve `false` (4). |
| Guardar «Tu horario» crea el horario del usuario en su sede y pasa el paso a `COMPLETED`, con `OnboardingCompletedAt` | `dynamodb.test.ts` (6) y `save-schedule.test.ts` (7): «guardar Tu horario crea el horario del usuario en su sede y pasa el paso a COMPLETED, con OnboardingCompletedAt». |
| Omitir «Tu horario» pasa el paso a `COMPLETED`, con `OnboardingCompletedAt`, sin crear horario | `dynamodb.test.ts` (6) y `save-schedule.test.ts` (7): «omitir Tu horario pasa el paso a COMPLETED, con OnboardingCompletedAt, sin crear horario». |
| Un horario con bloques que se solapan o con el inicio después del fin responde 400 y no termina el onboarding | `save-schedule.test.ts` (7): «un horario con bloques que se solapan o con el inicio después del fin responde 400 y no termina el onboarding». |
| Cada ruta usada fuera de su paso responde 403 con el paso en que va el usuario | `save-personal-data.test.ts` (2), `save-plan.test.ts` (3), `create-clinic.test.ts` (5) y `save-schedule.test.ts` (7): «cada ruta usada fuera de su paso responde 403 con el paso en que va el usuario», con cada paso que no está en su lista y la policy que declara el stack. |
| Las cuatro rutas exigen la clave de platform y el ID token, y declaran su policy | `test/backend-stack.test.ts`: «las cuatro rutas del onboarding exigen la clave de platform y el ID token, y declaran su policy», con el `ROUTE_POLICY` exacto de cada una. La prueba de la sesión «toda ruta privada declara su policy…» las cubre también. Crece con cada parte de ruta (2, 3, 5 y 7). |
| Ni los datos personales ni los tokens aparecen en los logs | Las cuatro pruebas de ruta: «ni los datos personales ni los tokens aparecen en los logs», con errores cuyo mensaje lleva el nombre, el celular, el correo y el token (2, 3, 5 y 7). |

## Verificación

**En cada parte**, dentro de `backend-infra/`: `pnpm typecheck`, `pnpm check` y
`pnpm test`.

**En staging**, contra el dominio del api de staging, con su clave de platform y
el ID token de una cuenta creada después de la parte 1. Los ítems se miran en la
tabla de staging.

| Después de | Pedido | Se espera |
|---|---|---|
| 1 | `GET /api/me` de una cuenta nueva | 200 con los cuatro datos personales en `null`. El cliente de Cognito tiene `WriteAttributes: ["email"]`. |
| 2 | `PUT /api/onboarding/personal-data` con nombre, apellido, `987 654 321` y `DRA` | 200 `PLAN`. El usuario tiene `Phone = +51987654321`. |
| 2 | El mismo pedido, con otro nombre | 200 `PLAN`, con el nombre corregido. |
| 2 | Con `phone: "12345"` | 400 con el mensaje del celular. |
| 2 | `GET /api/me` | Los datos guardados. |
| 3 | `PUT /api/onboarding/plan` con `CONSULTORIO` | 400 «Durante la beta, todas las cuentas empiezan en Gratis.» |
| 3 | Con `FREE`, dos veces | 200 `CLINIC` las dos. Hay un solo `ACCOUNT#…` / `SUBSCRIPTION`, con `GSI1PK = PLAN#FREE`. |
| 3 | `PUT /api/onboarding/personal-data` | 200 `CLINIC`. |
| 5 | `POST /api/onboarding/clinic` | 201 con los dos ids. Están los cuatro ítems y el usuario en `SCHEDULE`. |
| 5 | El mismo pedido otra vez | 403 con `onboardingStep: "SCHEDULE"`. |
| 5 | Con otra cuenta, dos pedidos en paralelo (`curl … & curl …`) | Un 201 y un 409, o un 403 si el segundo pasó la policy después. Se anota cuál. |
| 7 | `PUT /api/onboarding/schedule` con dos bloques del lunes que se solapan | 400 «Los rangos del lunes no pueden solaparse». |
| 7 | Con un horario válido | 200 `COMPLETED`. Están `SCHEDULE#<clinicId>` y `OnboardingCompletedAt`. |
| 7 | Con otra cuenta, `{ "skip": true }` | 200 `COMPLETED`, sin horario. |
| 7 | `PUT /api/onboarding/personal-data` | 403 con `onboardingStep: "COMPLETED"`. |

## Verificado contra la documentación de AWS

Consultada el 12 de noviembre de 2026.

- **`TransactWriteItems`**
  ([Amazon DynamoDB Transactions: How it works](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis.html)):
  - agrupa hasta 100 acciones sobre hasta 100 ítems distintos, con 4 MB en total,
    y dos acciones no pueden ir sobre el mismo ítem. Este plan usa 2 y 5;
  - es todo o nada, y falla si no se cumple una de sus condiciones;
  - si choca con otra transacción en curso sobre un mismo ítem, se cancela con
    `TransactionCanceledException`, y los SDK no la reintentan;
  - un `PutItem` o `UpdateItem` que choca con una transacción en curso falla con
    `TransactionConflictException`;
  - `CancellationReasons` sigue el orden de `TransactItems`;
  - cada ítem gasta dos escrituras, también si la transacción se cancela.
- **El `Update` de una transacción** lleva su propia `ConditionExpression`, y
  `ReturnValuesOnConditionCheckFailure` sólo admite `ALL_OLD` o `NONE`
  ([Update](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_Update.html)).
  Ningún paso de este plan lo usa.
- **`IN`** compara con una lista de hasta 100 valores
  ([Condition and filter expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OperatorsAndFunctions.html)).
- **`ReturnValues: ALL_NEW`** devuelve el ítem como queda después del
  `UpdateItem`, con lectura consistente y sin gastar lectura
  ([UpdateItem](https://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateItem.html)).
- **IAM**
  ([Using IAM policy conditions for fine-grained access control](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/specifying-conditions.html)):
  - `dynamodb:LeadingKeys` es la clave de partición;
  - en `TransactWriteItems`, cada ítem se autoriza por separado, con su acción
    (`PutItem`, `UpdateItem`…) y su clave de partición;
  - `dynamodb:Attributes` es la lista de los atributos de primer nivel que nombra
    el pedido.
- **Cognito**
  ([AWS::Cognito::UserPoolClient](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolclient.html)):
  - cambiar `WriteAttributes` es «No interruption»;
  - con su access token, el usuario puede modificar sus propios atributos de esa
    lista;
  - sin `WriteAttributes`, el cliente escribe todos los atributos estándar.
- **En el paquete `ulid` 3.0.2:** `ulid(seedTime?)` y `decodeTime(id)`.

## Sin verificar contra AWS

Lo comprueban los pedidos a staging de «Verificación».

- Parte 1: el cambio de `WriteAttributes` no corta las sesiones abiertas.
- Parte 2: el `UpdateItem` con `IN` y `ALL_NEW` pasa con `LeadingKeys` en
  `USER#*`, y una condición sobre un ítem que no existe falla en lugar de crearlo.
- Parte 3: la transacción escribe `ACCOUNT#…` / `SUBSCRIPTION` y actualiza
  `USER#…` con sus permisos.
- Parte 5: la transacción de 5 acciones pasa con `ORG#*`, `CLINIC#*` y `USER#*`.
  Con dos pedidos en paralelo, qué código de cancelación llega: se anota.
- Parte 7: el `Put` del horario, con su lista de mapas, y la transacción de una
  acción al omitir.

## Riesgos aceptados del plan

- **Un 409 o un 200 sin escribir, con dos pestañas a la vez.** Si el usuario
  corrige «Tus datos» en una pestaña justo cuando otra guarda el plan o crea el
  consultorio, la transacción se cancela por `TransactionConflict`, que
  `isLostRace` cuenta como carrera perdida, igual que la confirmación. «Tu
  consultorio» responde 409 sin haberlo creado, y «Tu plan», 200 sin haberlo
  guardado. En los dos casos el pedido siguiente recibe el 403 de la policy con
  el paso real, y platform vuelve a él.
- **«Tu plan» con `CLINIC` no lee el plan guardado:** en la beta sólo existe
  `FREE`.
- **El horario encarece la lectura de la policy.** Vive en `USER#<id>`, y la
  consulta de la partición lo lee aunque lo filtre: con 70 bloques son unos
  5 KB, de una a dos unidades de lectura más en cada pedido privado de un médico
  con horario. La sesión descartó acotar la consulta por el orden de las `SK`;
  si el costo importa, se acota ahí (`SK < "SCHEDULE#"`) con una prueba de que
  ningún tipo leído cae después.
- **IAM no separa los ítems de una misma partición** (ver «Lo que IAM no puede
  separar»).
- **Endurecer un value object exige migrar antes los ítems guardados.** La
  lectura de la policy los valida con el mismo esquema: si un usuario tiene un
  dato que el esquema nuevo rechaza, recibe 500 en toda ruta privada.
- **`GSI1` y `GSI2` proyectan todos los atributos,** así que desde la parte 2 el
  nombre y el celular también quedan en los índices, y las Lambdas públicas los
  consultan sin límite de atributos. Hoy sólo piden `ItemType`, `Id` y
  `Confirmed`. Si hace falta, se proyectan sólo las claves en un índice nuevo.
- **Los datos personales están en memoria en cada ruta privada,** porque los
  trae la lectura de la policy. Ninguna los registra, y la prueba de logs de cada
  ruta lo fija.

## Para otros tickets

- **La policy de la sesión, con la herencia decidida el 12 de noviembre:**
  - el dueño queda con `ADMIN` efectivo en su sede, por la organización, y
    `DOCTOR` directo. Una ruta que pregunta si alguien atiende en una sede (la
    agenda, «Mi día», el booking) mira la membership directa y sus
    `Specialties`, no el rol más alto.
- **Toda ruta que cree una sede** (agregar sedes, o WIZ-79 si llega a
  crearlas) toma la organización y la cuenta del servidor: de una membership de
  organización que la policy ya validó, o de la organización que crea en la
  misma transacción. Nunca del cuerpo: la herencia de roles confía en
  `CLINIC#<id>.OrganizationId` y en el `AccountId` de cada membership, y una sede
  que apuntara a la organización de otra cuenta heredaría sus roles.
- **Si algún día las memberships se borran con una marca** en lugar de borrar el
  ítem, la `policy()` de la sesión las tiene que descartar al leerlas, también
  la de la organización que usa para la herencia. Este plan no borra memberships
  ni escribe ninguna marca.
- **La spec de la sesión (#159)** dice que la cuenta guarda `CreatedAt`. Desde la
  decisión del 12 de noviembre no lo guarda (#161).
- **Platform:**
  - una pantalla por paso, según el `onboardingStep` de `GET /api/me` o de un
    403;
  - después de un 409, vuelve a leer `/api/me`;
  - el nombre prellenado del consultorio sale de `givenName`, `familyName` y
    `treatment` de `/api/me`.
- **«Mi disponibilidad»:** reusa `weeklyScheduleSchema` y el ítem `SCHEDULE`, y
  lo reemplaza con un `Put`. Si permite una lista vacía, como hoy, saca el
  `.min(1)` del value object y lo deja en la entrada del onboarding.
- **El booking y la agenda** leen las memberships y los horarios de una sede por
  `GSI1` (`CLINIC#<id>`, `MEMBER#` y `SCHEDULE#`).
- **WIZ-79 (editar el consultorio):** el ítem `CLINIC#<id>`, con `PatientContact`
  todavía sin escribir.
- **Las invitaciones:** la fecha de la membership deja de coincidir con
  `decodeTime(ResourceId)` (ver «Sin `CreatedAt`»).
- **WIZ-80:** la finalidad del celular en la política de privacidad, antes de
  publicar el onboarding.

## Preguntas para el humano

Ninguna pendiente. Las dos de este plan, `CreatedAt` en los ítems con ULID y la
herencia del rol de la organización, las respondió el humano el 12 de noviembre
de 2026 (ver «Decidido por el humano»).
