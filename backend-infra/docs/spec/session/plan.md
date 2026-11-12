# Plan: la cuenta al registrarse, el autorizador y la policy

Spec: [spec.md](./spec.md) · Ticket: WIZ-78 (segunda de sus dos specs) · Sigue
a [../sign-in/plan.md](../sign-in/plan.md), que dejó los tokens de 15 minutos e
`isConfirmed` por `GSI2`, y cambia lo que guarda la confirmación de
[../sign-up-code/plan.md](../sign-up-code/plan.md).

## Objetivo

Que registrarse cree también la cuenta del consultorio, y que el backend
reconozca la sesión: el gateway valida el ID token y una policy compartida
comprueba en cada pedido, contra DynamoDB, lo que declara cada ruta privada.
`GET /api/me` es la primera ruta privada.

## Partes

Cada parte se puede mergear sola sin romper `main` y se apila sobre la anterior
con `gh stack`. La parte 1 se apila sobre la spec (#159) y lleva este plan. Los
tamaños son de código de producción, sin pruebas ni docs.

| Parte | Qué entrega | Se verifica sola con | Tamaño estimado |
|---|---|---|---|
| 1 | Este plan y **la cuenta al registrarse**: el ítem `ACCOUNT#<id>`, el usuario con `AccountId` y `OnboardingStep = PERSONAL_DATA` y sin `OnboardingCompleted`, los dos en la transacción de la confirmación, y el permiso sobre `ACCOUNT#*`. | Las pruebas de la confirmación y de DynamoDB, y una cuenta creada en staging. | ~100 líneas |
| 2 | **Leer al usuario de la sesión**: del `sub` al id por `GSI2`, y el usuario y sus memberships en una sola lectura consistente de su partición. La entidad `Membership` y sus mappers de lectura. Ninguna Lambda lo usa todavía. | Las pruebas de DynamoDB. | ~140 líneas |
| 3 | **La policy**: lo que declara una ruta (`RoutePolicy`), el caso de uso que la evalúa en el orden de la spec el envoltorio de las rutas privadas, que lee el `sub` de los claims y traduce cada resultado a 401, 403, 404 o 500, y la herencia del rol de la organización en sus sedes, con la lectura de la sede. Ninguna ruta la usa todavía. | Las pruebas de la policy con rutas de prueba. | ~300 líneas |
| 4 | **El autorizador y `GET /api/me`**: el autorizador de Cognito, la respuesta 401 del gateway, `addPrivateRoute`, la lectura de la cuenta, el caso de uso y el handler de `/api/me`, su Lambda, su ruta y sus permisos. | Las pruebas de síntesis y de `/api/me`, y los pedidos a staging de «Verificación». | ~235 líneas |

- **El autorizador va con `/api/me`, no solo.** CDK no sintetiza un
  autorizador que ningún método usa («Authorizer … must be attached to a
  RestApi», `aws-cdk-lib` 2.275), y una ruta privada sin autorizador quedaría
  abierta. La primera ruta privada y su autorizador llegan juntos.
- **Las partes 2 y 3 no cambian el comportamiento desplegado.** Agregan código
  que ninguna Lambda usa todavía. `user.repository.ts` (parte 2) y
  `shared/http/api-gateway.ts` (parte 3) ya los importan las Lambdas de hoy,
  que cambian de paquete pero no de comportamiento.
- **Orden de despliegue:** el de las partes. Ninguna necesita a otra desplegada
  antes para no romper nada.

### Archivos de la parte 1

Producción (`backend-infra/`):
- `lib/src/users/domain/user.entity.ts`: `ONBOARDING_STEPS`
  (`PERSONAL_DATA`, `PLAN`, `CLINIC`, `SCHEDULE`, `COMPLETED`) y su tipo
  `OnboardingStep`; `User` gana `accountId` y `onboardingStep` y pierde
  `onboardingCompleted`; `createUserWithAccount` reemplaza a `createUser`, que
  sólo usaba la confirmación.
- `lib/src/users/domain/account.entity.ts` (nuevo): `Account`.
- `lib/src/users/domain/repository/user.repository.ts`: `createConfirmed`
  recibe el usuario con su cuenta.
- `lib/src/users/application/confirm-sign-up.usecase.ts`: crea el usuario con
  su cuenta.
- `lib/src/users/infrastructure/persistence/dynamodb/account.schema.ts` y
  `account.mappers.ts` (nuevos).
- `lib/src/users/infrastructure/persistence/dynamodb/user.schema.ts` y
  `user.mappers.ts`: `AccountId` y `OnboardingStep`, sin `OnboardingCompleted`.
- `lib/src/users/infrastructure/persistence/dynamodb/user.repository.ts`: la
  cuenta entra en la transacción.
- `lib/backend-stack.ts`: `CONFIRM_SIGN_UP_ACCESS` puede escribir `ACCOUNT#*`.

Pruebas: `test/users/fakes.ts`, `test/users/confirm-sign-up.test.ts`,
`test/users/dynamodb.test.ts` y `test/backend-stack.test.ts`.

Docs: `backend-infra/docs/spec/session/plan.md`.

### Archivos de la parte 2

Producción:
- `lib/src/users/domain/membership.entity.ts` (nuevo): `MEMBERSHIP_ROLES`
  (`ADMIN`, `DOCTOR`, `USER`), `MEMBERSHIP_RESOURCE_TYPES` (`ORGANIZATION`,
  `CLINIC`) y `Membership`.
- `lib/src/users/domain/repository/user.repository.ts`: `UserWithMemberships`
  y `findByCognitoSubWithMemberships`.
- `lib/src/users/infrastructure/persistence/dynamodb/user.schema.ts`: el
  esquema de lectura del usuario.
- `lib/src/users/infrastructure/persistence/dynamodb/membership.schema.ts` y
  `membership.mappers.ts` (nuevos): sólo la lectura.
- `lib/src/users/infrastructure/persistence/dynamodb/user.mappers.ts`:
  `fromDynamoToDomain`.
- `lib/src/users/infrastructure/persistence/dynamodb/user.repository.ts`:
  `findByCognitoSubWithMemberships`.

Pruebas: `test/users/dynamodb.test.ts` y `test/users/fakes.ts`.

### Archivos de la parte 3

Producción:
- `lib/src/shared/http/api-gateway.ts`: `FORBIDDEN`, `NOT_FOUND`,
  `jsonResponse` y `PrivateApiGatewayEvent`.
- `lib/src/users/application/authorize-request.usecase.ts` (nuevo).
- `lib/src/users/handlers/private-route.ts` (nuevo).
- `lib/src/users/handlers/http-messages.ts`: los mensajes de la policy.
- `lib/src/users/domain/repository/clinic.repository.ts` (nuevo):
  `IClinicRepository`.
- `lib/src/users/infrastructure/persistence/dynamodb/clinic.schema.ts` y
  `clinic.repository.ts` (nuevos): la lectura de la sede.

Pruebas: `test/users/private-route.test.ts` (nuevo), `test/users/fakes.ts` y
`test/users/dynamodb.test.ts`.

### Archivos de la parte 4

Producción:
- `lib/api-gateway.ts`: el autorizador, la respuesta `UNAUTHORIZED` y
  `addPrivateRoute`.
- `lib/backend-stack.ts`: `Authentication` se crea antes que `ApiGateway`, la
  Lambda `MeFunction`, sus permisos y su ruta.
- `lib/src/users/domain/repository/account.repository.ts` (nuevo).
- `lib/src/users/infrastructure/persistence/dynamodb/account.repository.ts`
  (nuevo), y la lectura en `account.schema.ts` y `account.mappers.ts`.
- `lib/src/users/application/get-me.usecase.ts` (nuevo).
- `lib/src/users/handlers/me.http.ts` y `me.handler.ts` (nuevos).

Pruebas: `test/users/me.test.ts` (nuevo), `test/users/fakes.ts`,
`test/users/dynamodb.test.ts`, `test/api-gateway.test.ts` y
`test/backend-stack.test.ts`.

## Decisiones

### La cuenta al registrarse (parte 1)

- **Una fábrica crea los dos.** `createUserWithAccount({ email, cognitoSub },
  now)` genera los dos ULID y devuelve `{ user, account }`: el usuario
  confirmado, con `accountId` y `onboardingStep = PERSONAL_DATA`, y la cuenta
  con `ownerUserId` = el id del usuario y `createdAt`. Así no hay un orden
  imposible entre «el usuario necesita la cuenta» y «la cuenta necesita a su
  dueño».
- **La misma transacción de hoy, con un `Put` más.** `createConfirmed({ user,
  account }, verification, termsAcceptance?)` escribe, en este orden: el
  usuario, la cuenta y la constancia (los tres con `attribute_not_exists(PK)`),
  y el `Delete` condicionado del token de verificación. Si la transacción falla
  no queda nada, y `createOrRemoveIdentity` borra al usuario de Cognito como
  hoy. Son hasta 4 acciones de las 100 que admite `TransactWriteItems`.
- **El permiso:** `CONFIRM_SIGN_UP_ACCESS` pasa a `"dynamodb:PutItem":
  ["USER#*", "ACCOUNT#*"]`. Las acciones de una transacción se autorizan con
  los permisos de `PutItem`, `DeleteItem`… que ya tiene la Lambda.
- **Lo que esta spec no escribe.** `OnboardingCompletedAt` lo escribe el último
  paso del onboarding (WIZ-77): el usuario nuevo empieza en `PERSONAL_DATA`, sin
  fecha, y el atributo entra al esquema con la spec que lo escribe. Tampoco hay
  ítem `SUBSCRIPTION`: lo crea «Tu plan».

### Del `sub` al usuario y sus memberships (parte 2)

`UserRepository.findByCognitoSubWithMemberships(cognitoSub)` hace dos pedidos a
DynamoDB, uno detrás del otro:

1. **`Query` sobre `GSI2`** con `GSI2PK = COGNITO#<sub>`, `Limit: 1` y la
   proyección `ItemType, Id`. Si no hay ítem o su `ItemType` no es `USER`,
   devuelve `undefined` (401).
2. **`Query` sobre la tabla** con `PK = USER#<id>`, `ConsistentRead: true`,
   `FilterExpression: ItemType IN (:user, :membership)` y la proyección `ItemType,
   Id, Email, Confirmed, AccountId, OnboardingStep, CognitoSub, ResourceId,
   ResourceType, Role`. Del resultado sale el usuario y sus memberships. Si no
   viene el ítem `USER`, o su `CognitoSub` no es el `sub` buscado, devuelve
   `undefined` (401).

- **Por qué no basta con `GSI2`.** El índice trae el ítem entero, pero no admite
  lectura consistente: un cambio de paso o de rol podría no verse en el pedido
  siguiente, y la spec pide que valga al instante. El paso 1 sólo lee el id, que
  no cambia nunca. La spec habla de una lectura por pedido: son dos pedidos
  porque el `sub` lleva al id por un índice.
- **Por qué no se guarda el id del `sub` entre pedidos.** La spec no permite
  caché entre pedidos, aunque el id no cambie.
- **Una sola lectura para el usuario y sus memberships.** Los dos viven en la
  partición `USER#<id>` y salen en el mismo `Query`. El filtro deja fuera la
  constancia de términos (`TERMS_ACCEPTANCE#…`), que trae correo, IP y
  navegador: no llega a la Lambda. Se descartó acotar por el orden de las `SK`:
  depende de que ningún tipo nuevo caiga en el rango y se lee peor que un
  filtro.
- **Costo:** la consulta del índice gasta media unidad de lectura y la de la
  partición, una (cabe en 4 KB salvo un usuario con decenas de memberships). El
  filtro no ahorra capacidad, pero los ítems filtrados son pocos.
- **Más de 1 MB en la partición** (`LastEvaluatedKey` presente) lanza un error
  sin valores (500) en lugar de devolver memberships incompletas. Con los ítems
  de hoy no puede pasar.
- **Cada ítem se valida con Zod antes de mapear,** y se revisa `ItemType`, como
  pide `AGENTS.md`. Un usuario sin `AccountId` u `OnboardingStep` válidos es un
  error, no un usuario: responde 500 (ver «Riesgos aceptados del plan»). Un
  `Email` se vuelve a pasar por `emailSchema`, que es idempotente.
- **`isConfirmed` no cambia.** Lo sigue usando el inicio de sesión.

### La policy (parte 3)

**Dónde vive.** En el módulo `users`, por capas:
- `application/authorize-request.usecase.ts`: el caso de uso y su esquema de
  entrada, que es la declaración de la ruta (`routePolicySchema` y el tipo
  `RoutePolicy`), como hace cada caso de uso con su esquema.
- `handlers/private-route.ts`: el envoltorio de las rutas privadas. Lee el
  `sub`, llama al caso de uso y traduce el resultado a HTTP, sin lógica de
  negocio.
- No va en `shared/`: lee usuarios y memberships, y `shared` dependería de
  `users`. Cuando otro módulo tenga rutas privadas, importa
  `users/handlers/private-route`; si eso molesta, moverlo a un módulo propio se
  decide entonces, con dos consumidores reales.

**Qué declara una ruta.** `RoutePolicy` es la entrada de `routePolicySchema`, un
`z.strictObject`:

| Campo | Valores | Si la ruta no lo declara |
|---|---|---|
| `confirmed` | `true` o `false` | `true`: exige el correo confirmado |
| `onboardingStep` | un paso de `ONBOARDING_STEPS`, una lista no vacía de pasos o `ANY_ONBOARDING_STEP` (`"ANY"`) | `COMPLETED` |
| `member` | `true` o `false` | `false` |
| `roles` | una lista no vacía de `MEMBERSHIP_ROLES` | sin restricción de rol |
| `resourceType` | `ORGANIZATION` o `CLINIC` | obligatorio si la ruta exige membership y prohibido si no |

- **Lo que no se declara es lo más estricto,** salvo `member`, que depende de la
  ruta: lo cubre la comprobación de `{resourceId}` de `addPrivateRoute` (ver
  «Toda ruta privada declara su policy»).
- **`roles` implica `member`**, porque el rol sale de esa membership
  (`requiresMembership(policy)`).
- **Un campo mal escrito no pasa:** el objeto es estricto y la Lambda no arranca
  (ver más abajo).
- **El recurso es el parámetro `{resourceId}` de la ruta** (`RESOURCE_ID_PARAMETER`),
  como `params.resourceId` en el plugin de hoy.

**El orden, el de la spec.** `AuthorizeRequestUseCase` recibe el repositorio y
la policy ya validada en su constructor (una por Lambda), y `execute({
cognitoSub, resourceId })` devuelve:

1. Si la policy exige membership y no hay `resourceId`, lanza un error antes de
   leer nada: es un error de configuración nuestro (500).
2. Sin usuario → `{ kind: "session-expired" }`.
3. `confirmed` y el usuario sin confirmar → `{ kind: "email-not-confirmed" }`.
4. Un paso distinto de `ANY` (o una lista que no lo incluye) y el usuario en otro paso → `{ kind:
   "wrong-onboarding-step", onboardingStep }`, con el paso en que va. La
   comparación es de igualdad: la ruta de «Tu plan» exigirá `PLAN`.
5. Sin membership exigida → `{ kind: "authorized", user }`.
6. Sin una membership del tipo de recurso de la ruta (`resourceType`) cuyo
   `resourceId` sea el de la ruta, propia o heredada (ver «El rol de la
   organización se hereda en sus sedes») → `{ kind: "resource-not-found" }`.
7. `roles` y el rol de la membership fuera de la lista → `{ kind:
   "role-forbidden" }`.
8. Si no → `{ kind: "authorized", user, membership }`.

- **Sin membership, 404 y no 403**, como el plugin de hoy: no revela qué
  recursos existen en otras cuentas. La membership se busca sólo entre las del
  propio usuario, así que un recurso de otra cuenta y uno que no existe se ven
  igual.
- **No se compara `membership.accountId` con `user.accountId`:** las
  invitaciones darán memberships sobre recursos de otra cuenta.
- **El tipo de recurso es parte de la comprobación.** Una membership sólo
  cuenta si su `resourceType` es el que declara la ruta: una de organización no
  autoriza una ruta de sede con el mismo id, salvo por la herencia de abajo.

**El rol de la organización se hereda en sus sedes** (decidido el 12 de
noviembre de 2026, como hoy en `GetUserMembership`). Sólo en rutas de tipo
`CLINIC`:
1. Se busca la membership directa sobre la sede.
2. Se lee la sede (`CLINIC#<id>` / `SK "!"`, su `OrganizationId`, con lectura
   consistente) y se busca entre las memberships del usuario la de esa
   organización. Es la única lectura extra, y se omite si el usuario no tiene
   ninguna membership de organización.
3. La membership efectiva es la de **rol más alto** entre la directa y la
   heredada (`ADMIN` 100, `DOCTOR` 50, `USER` 10, como el api; empata la
   directa). Si es la heredada, la ruta recibe una membership de la sede
   (`resourceType = CLINIC`, `resourceId` = la sede) con el `accountId` y el rol
   de la organización. Después se aplica `roles` a esa membership: 403 si su rol
   no está en la lista, 404 si no hay ninguna.
- **La sede inexistente o de otra cuenta responde 404**, como cualquier recurso
  sin membership: sólo se hereda de una organización de la que el usuario es
  miembro, y una sede de otra organización no coincide.
- **Las rutas de organización no heredan nada.**

**Lo que responde el envoltorio.** `handlePrivateRoute(event, authorizeRequest,
respond)`:

| Resultado | Responde |
|---|---|
| Los claims no traen un `sub` de texto no vacío | 401 `SESSION_EXPIRED`, sin leer DynamoDB |
| `session-expired` | 401 `SESSION_EXPIRED` («Tu sesión venció. Inicia sesión de nuevo.») |
| `email-not-confirmed` | 403 `EMAIL_NOT_CONFIRMED` («Confirma tu correo para continuar.») |
| `wrong-onboarding-step` | 403 `{ "message": ONBOARDING_INCOMPLETE, "onboardingStep": "<el paso>" }` («Termina de configurar tu cuenta.») |
| `resource-not-found` | 404 `RESOURCE_NOT_FOUND` («No encontramos lo que buscas.») |
| `role-forbidden` | 403 `ROLE_FORBIDDEN` («No tienes permiso para hacer esto.») |
| `authorized` | lo que devuelva `respond({ user, membership })` |
| Cualquier error, del caso de uso o de `respond` | 500 `REQUEST_FAILED` («No pudimos completar la solicitud. Intenta de nuevo.») y `console.error("[private-route] falló la solicitud:", errorName(error))` |

- **El `sub` sale sólo de `event.requestContext.authorizer.claims.sub`.**
  `respond` recibe el usuario y la membership, no el evento: la ruta no tiene de
  dónde sacar otra identidad. Detrás del autorizador los claims siempre llegan;
  si faltaran, se responde 401 en lugar de seguir.
- **Un 500 por ruta privada, con un mensaje genérico,** porque el envoltorio
  atiende también los errores de la ruta. El log de cada Lambda ya dice qué ruta
  falló.
- **La policy de cada Lambda llega por la variable `ROUTE_POLICY`**
  (`ROUTE_POLICY_VARIABLE`), que escribe `addPrivateRoute`. `readRoutePolicy()`
  la lee con `requireEnv` y `routePolicySchema.parse(JSON.parse(…))` al cargar
  el módulo del handler. Si falta o no es válida, la Lambda no arranca y ningún
  pedido pasa.

### El autorizador de Cognito (parte 4)

En `lib/api-gateway.ts`, un `CognitoUserPoolsAuthorizer` (`SessionAuthorizer`):
- **`cognitoUserPools: [userPool]`** y la cabecera por defecto,
  `method.request.header.Authorization`. El gateway valida la firma, el
  vencimiento y que el token sea de ese pool, y si no sirve responde 401 sin
  invocar la Lambda.
- **Sin `authorizationScopes`:** así el gateway trata el token como ID token.
  Con scopes, exigiría un access token.
- **`IdentityValidationExpression = ^<id del cliente de platform>$`.** Para este
  autorizador, el gateway compara la expresión con el `aud` del token y, si no
  coincide, responde 401. El access token no trae `aud`, así que también queda
  rechazado, y con él cualquier token de otro cliente del pool. CDK no expone la
  propiedad: se asigna en `node.defaultChild` (`CfnAuthorizer`), con una línea
  de comentario que diga por qué.
- **`resultsCacheTtl: Duration.seconds(0)`:** sin caché. Por defecto, CDK
  guarda el resultado 5 minutos por token, y la documentación no dice que el
  caché respete el `exp`: un token podría seguir pasando después de vencer. Sin
  caché, cada pedido valida firma y vencimiento.
- **Se crea con la primera ruta privada** (`sessionAuthorizer()` privado, que lo
  crea una vez): un `ApiGateway` sin rutas privadas, como el de
  `api-gateway.test.ts`, sigue sintetizando.
- **`ApiGatewayProps` gana `userPool` y `platformClientId`,** y
  `backend-stack.ts` crea `Authentication` antes que `ApiGateway`. Los ids de
  los constructs no cambian, así que los ids lógicos tampoco.
- **La cabecera lleva el ID token solo, sin `Bearer`.** Es lo único que
  documenta API Gateway para este autorizador. Si en staging `Bearer <token>`
  también pasa, el contrato no cambia.

**La respuesta 401 del gateway.** `api.addGatewayResponse("SessionExpired", {
type: ResponseType.UNAUTHORIZED, statusCode: "401", templates: {
"application/json": JSON.stringify({ message: SESSION_EXPIRED }) } })`, en el
constructor, junto a la de las rutas que no existen. `UNAUTHORIZED` es la
respuesta de un autorizador de Cognito que no autentica: sin token, vencido o de
otro pool. No toca los 401 que devuelven las Lambdas, como el de «Correo o
contraseña incorrectos.». `EXPIRED_TOKEN` es de las firmas de AWS y no aplica.
`MISSING_AUTHENTICATION_TOKEN` sigue respondiendo 404 a una ruta que no existe.

**La clave de platform y el token.** Las rutas privadas siguen con
`apiKeyRequired` por `defaultMethodOptions`.

| Clave | Token | Responde |
|---|---|---|
| válida | ID token válido | la Lambda, con su policy |
| válida | falta, vencido, de otro pool, de otro cliente o access token | 401 «Tu sesión venció. Inicia sesión de nuevo.», del gateway |
| falta o no es del plan | ID token válido | 403 `{"message":"Forbidden"}`, del gateway, como hoy |
| falta | falta | 401 o 403, según qué revise primero el gateway, que la documentación no dice. Ninguna de las dos llega a la Lambda. Se anota en staging. |

### Lo que `lib/*.ts` importa de `lib/src` (parte 4)

Nace una dependencia de la capa de CDK (`lib/*.ts`) hacia `lib/src`:
`SESSION_EXPIRED`, `RoutePolicy`, `requiresMembership`, `ROUTE_POLICY_VARIABLE`
y `ANY_ONBOARDING_STEP`. La síntesis carga esos módulos, así que
`authorize-request.usecase.ts` y `http-messages.ts` no importan el AWS SDK,
directa ni transitivamente.

### Toda ruta privada declara su policy (parte 4)

- **`ApiGateway.addPrivateRoute(path, httpMethod, handler, policy: RoutePolicy)`**
  es la única forma de usar el autorizador, que es privado del construct.
  Crea el método en `resourceForPath(path)` con el autorizador y escribe
  `ROUTE_POLICY = JSON.stringify(policy)` en el entorno de la Lambda. Sin
  `policy`, no compila.
- **Lanza un error al sintetizar** si la ruta tiene `{resourceId}` y la policy
  no exige membership, o si la exige y la ruta no tiene `{resourceId}`. Así una
  ruta sobre un recurso no puede olvidar `member`.
- **La prueba de síntesis** recorre todos los métodos del stack. Los públicos
  son una lista fija en la prueba (`GET /health` y las seis `POST
  /api/auth/…`), y los demás tienen que tener `COGNITO_USER_POOLS`, el único
  autorizador, `ApiKeyRequired` y una Lambda con un `ROUTE_POLICY` que pasa
  `routePolicySchema`. Una ruta nueva creada con `addMethod` queda sin
  autorizador y fuera de la lista: la prueba falla. Una ruta pública nueva obliga
  a agregarla a la lista a propósito, como el `public: true` del plugin.
- **Por qué la policy va en la ruta del stack y no en el handler.** Es donde se
  declara la ruta, como el `...policy({…})` de Fastify, y es lo único que ve la
  prueba de síntesis. La Lambda aplica lo que dice el stack, así que no pueden
  divergir. Se descartó declararla en el código del handler, que la síntesis no
  ve, y poner el autorizador por defecto en todos los métodos, que obliga a
  abrir a mano las siete rutas públicas y la prueba igual tendría que mirar cada
  una.

### `GET /api/me` (parte 4)

- **Policy:** `{ confirmed: false, onboardingStep: ANY_ONBOARDING_STEP }`. La
  spec sólo exige el token y que el usuario exista, y platform la usa para saber
  a qué paso llevar a la persona.
- **`GetMeUseCase.execute(user)`** lee la cuenta con `findById(user.accountId)`
  y devuelve `{ user, isAccountOwner: account.ownerUserId === user.id }`. Si la
  cuenta no existe, lanza un error sin valores (500): el usuario y su cuenta se
  crean en la misma transacción.
- **La cuenta se lee con lectura consistente:** platform llama a `/api/me` justo
  después de crear la cuenta.
- **Se lee la cuenta aunque hoy todo usuario sea su dueño:** la fuente es
  `OwnerUserId`, y copiar «es el dueño» en el usuario sería un dato calculable.
  Las invitaciones darán usuarios que no lo son.
- **El cuerpo:** `{ id, email, givenName: null, familyName: null, phone: null,
  treatment: null, accountId, isAccountOwner, onboardingStep }`, con
  `Cache-Control: no-store`. Los cuatro `null` los arma `me.http.ts`: la entidad
  no tiene esos campos hasta la spec del onboarding.

## Flujos

### `POST /api/auth/sign-up/confirm` (parte 1)

`ConfirmSignUpUseCase.execute`, igual que hoy salvo el paso 4:
1. Valida el token de verificación y que el correo no tenga cuenta.
2. Crea al usuario en Cognito.
3. Si no lo crea, 400 como hoy.
4. `const owner = createUserWithAccount({ email, cognitoSub })`; la constancia
   usa `owner.user.id`.
5. `users.createConfirmed(owner, { email, tokenHash }, termsAcceptance)` dentro
   de `createOrRemoveIdentity`.
6. Inicia la sesión como hoy.

### Cada ruta privada (partes 3 y 4)

1. El gateway revisa la clave y el ID token (parte 4).
2. `handlePrivateRoute` lee `requestContext.authorizer.claims.sub` y
   `pathParameters.resourceId`.
3. `AuthorizeRequestUseCase.execute` lee al usuario y sus memberships y aplica
   la policy en el orden de la spec. En una ruta de sede sin membership directa
   que alcance, lee además la sede para heredar el rol de su organización.
4. Si autoriza, `respond({ user, membership })`; si no, la respuesta de la
   tabla.

### `GET /api/me` (parte 4)

**`handlers/me.http.ts` (`handleMe`)**, con `{ authorizeRequest:
Pick<AuthorizeRequestUseCase, "execute">, getMe: Pick<GetMeUseCase, "execute">
}`: `handlePrivateRoute(event, authorizeRequest, async ({ user }) => …)`, que
llama a `getMe.execute(user)` y responde `noStoreJsonResponse` con el cuerpo de
arriba.

**`handlers/me.handler.ts`** lee `TABLE_NAME` y arma a nivel de módulo
`AuthorizeRequestUseCase` con `UserRepository` y `readRoutePolicy()`, y
`GetMeUseCase` con `AccountRepository`.

## Puertos y adaptadores

| Contrato | Cambio | Implementación |
|---|---|---|
| `IUserRepository` | Parte 1: `createConfirmed(owner: UserWithAccount, verification, termsAcceptance?)`, con `UserWithAccount = { user: User; account: Account }`. Parte 2: `findByCognitoSubWithMemberships(cognitoSub): Promise<UserWithMemberships \| undefined>`, con `UserWithMemberships = { user: User; memberships: Membership[] }`. | `infrastructure/persistence/dynamodb/user.repository.ts` |
| `IAccountRepository` (nuevo, parte 4) | `findById(accountId): Promise<Account \| undefined>` | `infrastructure/persistence/dynamodb/account.repository.ts` |

| `IClinicRepository` (nuevo, parte 3) | `findOrganizationId(clinicId): Promise<ULID \| undefined>` | `infrastructure/persistence/dynamodb/clinic.repository.ts` |

Cada caso de uso recibe sólo lo que usa: `AuthorizeRequestUseCase`,
`Pick<IUserRepository, "findByCognitoSubWithMemberships">` y
`Pick<IClinicRepository, "findOrganizationId">`; `GetMeUseCase`,
`Pick<IAccountRepository, "findById">`.

## Ítems de DynamoDB

| Ítem | `PK` | `SK` | `ItemType` | Otros atributos |
|---|---|---|---|---|
| Usuario (cambia, parte 1) | `USER#<ulid>` | `!` | `USER` | Los de hoy, más `AccountId` y `OnboardingStep`, y sin `OnboardingCompleted`. `GSI1` y `GSI2` no cambian. |
| Cuenta (nuevo, parte 1) | `ACCOUNT#<ulid>` | `!` | `ACCOUNT` | `Id`, `OwnerUserId`. Sin nombre, sin plan y sin `CreatedAt`: la fecha sale del `Id` con `decodeTime` (decidido por el humano el 12 de noviembre de 2026). |
| Sede (la crea WIZ-77; se lee desde la parte 3) | `CLINIC#<id>` | `!` | `CLINIC` | `OrganizationId`. La policy sólo lee ese atributo. |
| Membership (se lee desde la parte 2; la crea WIZ-77) | `USER#<userId>` | `MEMBERSHIP#<resourceId>` | `MEMBERSHIP` | `UserId`, `ResourceId`, `ResourceType` (`ORGANIZATION` o `CLINIC`), `AccountId`, `Role` (`ADMIN`, `DOCTOR` o `USER`), `Specialties?`, sin `CreatedAt`; `GSI1PK = ORG#<resourceId>` o `CLINIC#<resourceId>`, `GSI1SK = MEMBER#<userId>`. La policy lee `ResourceId`, `ResourceType`, `AccountId` y `Role`. |

- **Qué dato nuevo guarda cada uno.** La cuenta es el tenant: su id, al que
  apuntará todo lo demás, y su dueño no están en ninguna parte. La fecha de
  creación sale del `Id`, que es un ULID.
  `AccountId` en el usuario es su enlace a la cuenta, que para un invitado no
  saldrá de `OwnerUserId`. `OnboardingStep` es el avance del onboarding, que la
  spec decidió guardar en el usuario.
- **Se lee, sin cambios en el ítem:** el usuario por `GSI2`
  (`GSI2PK = COGNITO#<sub>`), que no admite lectura consistente.
- Esta spec no escribe memberships ni `OnboardingCompletedAt`.

## Infraestructura

`lib/backend-stack.ts`, con `usersFunction` (Node 22, arm64, 15 s, 512 MB, logs
un mes):

| Lambda | Handler | Descripción | Entorno |
|---|---|---|---|
| `MeFunction` (parte 4) | `me` | «Returns the signed-in user, their account and their onboarding step.» | `TABLE_NAME`, y `ROUTE_POLICY` de `addPrivateRoute` |

**Permisos exactos**
- `ConfirmSignUpFunction` (parte 1): `dynamodb:PutItem` con
  `dynamodb:LeadingKeys` en `USER#*` y `ACCOUNT#*`. El resto no cambia.
- `MeFunction` (parte 4):
  - `dynamodb:Query` sobre `index/GSI2` (`grantIndexQuery`), sin
    `dynamodb:LeadingKeys`, como las otras consultas de índices;
  - `dynamodb:Query` sobre la tabla con `LeadingKeys` en `USER#*`;
  - `dynamodb:GetItem` con `LeadingKeys` en `ACCOUNT#*`;
  - `dynamodb:GetItem` con `LeadingKeys` en `CLINIC#*`, para heredar el rol de
    la organización.
  - Nada de `PutItem`, `UpdateItem`, `DeleteItem`, `GSI1`, Cognito ni SES.
- `TableAccess` admite `"dynamodb:Query"`. `SESSION_USER_ACCESS = {
  "dynamodb:Query": ["USER#*"], "dynamodb:GetItem": ["CLINIC#*"] }` es lo que necesita toda Lambda de una ruta
  privada para su policy, junto con la consulta de `GSI2` y `TABLE_NAME`, y
  `ME_ACCESS` le suma `GetItem` sobre `ACCOUNT#*`. Toda Lambda privada
  necesita además `"dynamodb:GetItem": ["CLINIC#*"]` (`SESSION_USER_ACCESS`
  lo incluye).

**Ruta:** `apiGateway.addPrivateRoute("api/me", "GET", meFunction, {
confirmed: false, onboardingStep: ANY_ONBOARDING_STEP })`. La revisión de la
etapa de #149 no cambia: sólo actúa cuando se quitan rutas.

**El gateway:** `SessionAuthorizer` y la respuesta `SessionExpired` (ver
«El autorizador de Cognito»).

**Logs:** ni el envoltorio ni `/api/me` registran el evento, los claims ni el
cuerpo; los errores, sólo `errorName(error)`. La etapa sigue sin
`dataTraceEnabled` ni logs de ejecución, y el log de acceso no guarda la ruta ni
`$context.authorizer.*`.

`lib/dynamo.ts`: sin cambios.

## Aislamiento entre cuentas

- **La cuenta la crea el servidor.** El id y el dueño se generan en
  `createUserWithAccount`; ningún dato del pedido elige la cuenta.
- **La identidad sale sólo del `sub` que validó el gateway.** Del `sub` al id
  por `GSI2`, y del id a la partición `USER#<id>`: la policy no lee nada con un
  valor que mande el cliente.
- **Las memberships son sólo las del usuario.** Se leen de su propia partición,
  y el `resourceId` de la ruta sólo se compara en memoria contra ellas. Un
  recurso de otra cuenta responde 404, igual que uno que no existe.
- **La herencia no abre otra cuenta.** La única lectura fuera de la partición
  del usuario es la sede de la ruta, y sólo da su `OrganizationId`: se hereda
  únicamente si el usuario ya es miembro de esa organización. Una sede de otra
  organización o de otra cuenta, o que no existe, responde 404.
- **`/api/me` lee la cuenta por el `AccountId` del usuario,** que viene de
  DynamoDB, no del pedido.
- **Las rutas que vengan** acotan sus consultas por la `membership` que entrega
  la policy (`resourceId`, `accountId`), nunca por un id del cuerpo.
- **IAM acota los prefijos, no al usuario.** `MeFunction` puede consultar
  cualquier `USER#*` y leer cualquier `ACCOUNT#*`, pero ningún otro tipo de
  ítem. Atar la lectura al usuario de la sesión lo hace el código (ver «Riesgos
  aceptados del plan»).

## Pruebas

Con el estilo de `test/`: los handlers con el caso de uso real y dobles en
memoria, los adaptadores con clientes que registran los comandos, y la
infraestructura con síntesis de CDK.

**Dobles en `test/users/fakes.ts`**
- `buildUser` usa `accountId` y `onboardingStep` (parte 1).
- `InMemoryUsers` guarda `createdAccounts` y escribe usuario y cuenta juntos o
  ninguno (parte 1). Gana `memberships` y `findByCognitoSubWithMemberships`, que
  devuelve sólo las del usuario de ese `sub`, y `failOnRead` también la hace
  fallar (parte 2).
- `privateEvent({ sub, resourceId, … })`: un evento con los claims del
  autorizador (parte 3).
- `InMemoryAccounts` implementa `IAccountRepository` (parte 4).

**Otras pruebas, además de los criterios**
- Parte 1: `ConfirmSignUpFunction` sólo puede escribir `USER#*` y
  `ACCOUNT#*` (en «cada Lambda sólo tiene los permisos que usa»); la cuenta
  nueva y el usuario se apuntan entre sí.
- Parte 2: la consulta de `GSI2` proyecta sólo `ItemType` e `Id`; la de la
  partición es consistente y filtra `USER` y `MEMBERSHIP`; un ítem de otro tipo
  en `GSI2`, una partición sin usuario o un usuario con otro `CognitoSub` no
  devuelven usuario; un usuario sin `AccountId` u `OnboardingStep` lanza un
  error; una partición de más de una página lanza un error.
- Parte 3: con el correo sin confirmar, una ruta que exige `confirmed` responde
  403 «Confirma tu correo para continuar.»; con todo en contra responde el
  primer paso que falla; `ANY` deja pasar cualquier paso y un paso concreto sólo
  ese; `roles` sin membership responde 404; una policy que exige membership sin
  `resourceId` responde 500 sin leer DynamoDB; si falla la lectura responde 500;
  `readRoutePolicy` rechaza una variable ausente, un campo desconocido, un paso
  que no existe, `roles` vacío y un `resourceType` sin membership o al revés.
  Herencia: el rol de la organización autoriza su sede; gana el rol más alto
  entre el directo y el heredado, y `roles` se aplica a ése; una
  sede de otra organización o inexistente responde 404; una membership de
  organización no autoriza una ruta de sede con su id ni una de sede una ruta de
  organización; sin memberships de organización no se lee la sede. La lectura de
  la sede es consistente y sólo acepta un ítem `CLINIC`.
- Parte 4: un usuario que no es dueño de su cuenta recibe `isAccountOwner:
  false`; sin cuenta, `/api/me` responde 500; la cuenta se lee con lectura
  consistente y sólo si su `ItemType` es `ACCOUNT`; el `ROUTE_POLICY` de
  `MeFunction` es `{"confirmed":false,"onboardingStep":"ANY"}`; `addPrivateRoute`
  rechaza `{resourceId}` sin membership y membership sin `{resourceId}`; un
  `ApiGateway` sin rutas privadas no crea el autorizador; `GET /health` y `GET
  /api/me` son las únicas rutas `GET`; `MeFunction` tiene 15 segundos, 512 MB y
  su descripción.

## Cobertura de los criterios

Prueba en `test/`. Entre paréntesis, la parte.

| Criterio | Prueba |
|---|---|
| Crear la cuenta con un token de verificación vigente crea, en la misma transacción, el usuario con `AccountId` y `OnboardingStep = PERSONAL_DATA`, y la cuenta con el usuario como dueño, sin nombre y sin plan | `users/confirm-sign-up.test.ts`: «crear la cuenta con un token de verificación vigente crea, en la misma transacción, el usuario con AccountId y OnboardingStep = PERSONAL_DATA, y la cuenta con el usuario como dueño, sin nombre y sin plan». `users/dynamodb.test.ts`: «crear la cuenta confirmada guarda el usuario, su cuenta y su constancia y gasta el token en una sola transacción», con el ítem de la cuenta exacto (`PK`, `SK`, `ItemType`, `Id`, `OwnerUserId`) y sin ningún otro ítem. (1) |
| Si falla la transacción, no queda ni el usuario ni la cuenta, y el usuario se borra de Cognito | `users/confirm-sign-up.test.ts`: «si falla la transacción, no queda ni el usuario ni la cuenta, y el usuario se borra de Cognito». La de la spec anterior («si falla la escritura en DynamoDB…») sigue. (1) |
| El usuario nuevo ya no guarda `OnboardingCompleted` | `users/dynamodb.test.ts`: «el usuario nuevo ya no guarda OnboardingCompleted», con el `Item` completo del usuario en el `Put`. `users/confirm-sign-up.test.ts` fija la lista de campos de la entidad. (1) |
| `GET /api/me` con un ID token válido responde 200 con los datos del usuario, su cuenta, si es el dueño y su paso del onboarding, aunque no lo haya terminado | `users/me.test.ts`: «GET /api/me con un ID token válido responde 200 con los datos del usuario, su cuenta, si es el dueño y su paso del onboarding, aunque no lo haya terminado», con la policy que declara el stack. (4) |
| Una ruta privada sin ID token, con uno vencido o con uno de otro user pool responde 401 sin invocar ninguna Lambda | `api-gateway.test.ts`: «una ruta privada sin ID token, con uno vencido o con uno de otro user pool responde 401 sin invocar ninguna Lambda»: el autorizador es `COGNITO_USER_POOLS` sobre ese pool, con `Authorization`, el `aud` del cliente y sin caché, y la respuesta `UNAUTHORIZED` es 401 con el mensaje. El comportamiento real, en staging (ver «Verificación»). (4) |
| Un ID token válido cuyo `sub` no tiene usuario responde 401 | `users/private-route.test.ts` (3) y `users/me.test.ts` (4): «un ID token válido cuyo sub no tiene usuario responde 401». |
| La Lambda toma el `sub` sólo de los claims del autorizador | `users/private-route.test.ts`: «la Lambda toma el sub sólo de los claims del autorizador», con otro `sub` en el cuerpo, la cabecera y los parámetros, y un evento sin claims que responde 401. (3) |
| Una ruta que exige el onboarding terminado responde 403 con el paso en que va el usuario si no lo terminó | `users/private-route.test.ts`: «una ruta que exige el onboarding terminado responde 403 con el paso en que va el usuario si no lo terminó». (3) |
| Una ruta que exige ser miembro de un recurso responde 404 si el usuario no tiene membership sobre él, también si el recurso existe en otra cuenta | `users/private-route.test.ts`: «una ruta que exige ser miembro de un recurso responde 404 si el usuario no tiene membership sobre él, también si el recurso existe en otra cuenta», con la membership de otro usuario de otra cuenta sobre ese recurso (3). `users/dynamodb.test.ts`: «el usuario de la sesión y sus memberships se leen sólo de su propia partición» (2). |
| Una ruta que exige ciertos roles responde 403 si la membership tiene otro | `users/private-route.test.ts`: «una ruta que exige ciertos roles responde 403 si la membership tiene otro». (3) |
| Toda ruta privada declara su policy y exige la clave de platform y el ID token | `backend-stack.test.ts`: «toda ruta privada declara su policy y exige la clave de platform y el ID token», con la lista de rutas públicas, y «toda Lambda de una ruta privada puede leer al usuario de la sesión y sus memberships». `api-gateway.test.ts`: «addPrivateRoute crea el método con el autorizador y deja la policy en ROUTE_POLICY». (4) |
| Ni los tokens ni los datos personales aparecen en los logs | `users/private-route.test.ts` (3) y `users/me.test.ts` (4): «ni los tokens ni los datos personales aparecen en los logs», con errores cuyo mensaje lleva el correo, el `sub` y el token. `api-gateway.test.ts`: «el log de acceso no guarda la ruta ni los claims del autorizador» (4). |

## Verificación

**En cada parte**, dentro de `backend-infra/`: `pnpm typecheck`, `pnpm check` y
`pnpm test`.

**En staging, después de la parte 1:** crear una cuenta con el registro
(platform con `BACKEND=serverless` o las tres rutas con curl) y ver en la tabla
el `USER#<id>` con `AccountId` y `OnboardingStep = PERSONAL_DATA`, sin
`OnboardingCompleted`, y el `ACCOUNT#<AccountId>` con `OwnerUserId` = el id del
usuario.

**En staging, después de la parte 4**, contra el dominio del api de staging,
con su clave de platform y un ID token de esa cuenta:

| Pedido a `GET /api/me` | Se espera |
|---|---|
| Clave e ID token válidos | 200 con el cuerpo de la spec y `onboardingStep: "PERSONAL_DATA"` |
| Clave y sin `Authorization` | 401 «Tu sesión venció. Inicia sesión de nuevo.», con las tildes |
| Clave e ID token vencido (más de 15 minutos) | 401, igual |
| Clave y el access token | 401, igual |
| Clave e ID token de un pool temporal de la cuenta de desarrollo | 401, igual |
| Clave y `Bearer <ID token>` | Se anota lo que responde; no cambia el contrato |
| Sin clave e ID token válido | 403 `{"message":"Forbidden"}` |
| Sin clave y sin token | Se anota si es 401 o 403 |
| Clave y el ID token de una cuenta creada antes de la parte 1 | 500 (ver «Riesgos aceptados del plan») |

En los 401 del gateway, el log de acceso muestra `errorType: UNAUTHORIZED` sin
`integrationLatencyMs`, y el log de `MeFunction` no tiene invocaciones.

## Verificado contra la documentación de AWS

Consultada el 12 de noviembre de 2026.

- **ID token sin scopes:** «If you do not configure any Authorization scopes,
  API Gateway treats the supplied token as an identity token»; con scopes, lo
  trata como access token
  ([Integrate a REST API with an Amazon Cognito user pool](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-enable-cognito-user-pool.html)).
  La misma página muestra el token como valor de `Authorization`, sin prefijo.
  No hay documentación de `Bearer` para este autorizador; la de Cognito sólo
  dice «add them as bearer tokens to an Authorization header»
  ([Accessing resources with API Gateway after sign-in](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-accessing-resources-api-gateway-and-lambda.html)).
- **`aud`:** para `COGNITO_USER_POOLS`, `IdentityValidationExpression` se
  compara con el `aud` del token y, si no coincide, responde 401
  ([AWS::ApiGateway::Authorizer](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-apigateway-authorizer.html));
  «when using an access token this validation rejects the request due to the
  access token not containing the aud field» (la página de arriba).
- **Caché:** `AuthorizerResultTtlInSeconds` en 0 apaga el caché; sin valor es
  300, y el máximo, 3600 (AWS::ApiGateway::Authorizer). En `aws-cdk-lib`
  2.275, `resultsCacheTtl` vale 5 minutos por defecto y la cabecera por defecto
  es `Authorization`.
- **Los cambios del autorizador** hay que volver a desplegarlos para que la
  etapa los use (Integrate a REST API…). En `aws-cdk-lib` 2.275, con
  `@aws-cdk/aws-apigateway:authorizerChangeDeploymentLogicalId`, las
  propiedades del autorizador entran en el id lógico del deployment.
- **Claims con integración proxy:** con `COGNITO_USER_POOLS`, el
  `requestContext` trae `$context.authorizer.claims.*`
  ([Lambda proxy integrations](https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html)).
- **Respuestas del gateway:** `UNAUTHORIZED` (401) cuando el autorizador de
  Cognito no autentica; `ACCESS_DENIED` (403) cuando niega; `EXPIRED_TOKEN`, el
  vencimiento de un token de AWS; `MISSING_AUTHENTICATION_TOKEN` (403) incluye
  las rutas que no existen; `INVALID_API_KEY` (403)
  ([Gateway response types](https://docs.aws.amazon.com/apigateway/latest/developerguide/supported-gateway-response-types.html)).
- **La clave:** sin una clave del plan, «the caller receives a 403 Forbidden
  response»
  ([API key source](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-key-source.html)),
  y las claves no sirven para autenticar
  ([Usage plans and API keys](https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-api-usage-plans.html)).
  Que la clave pueda salir de un autorizador Lambda (`AUTHORIZER`) indica que el
  autorizador corre antes, pero el orden no está documentado.
- **CDK:** un autorizador sin método falla al sintetizar («must be attached to a
  RestApi»), y un método con autorizador toma su tipo (`COGNITO_USER_POOLS`)
  (`aws-cdk-lib` 2.275, `authorizers/cognito.js` y `method.js`).
- **`GSI2`:** los índices se actualizan «within a fraction of a second, under
  normal conditions», sin lectura consistente
  ([Global secondary indexes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/GSI.html)).
- **Filtro en `Query`:** se aplica después de leer, gasta la misma capacidad, y
  el límite de 1 MB vale antes del filtro
  ([Filter expressions for Query](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Query.FilterExpression.html)).
- **Transacciones:** los `Put`, `Update`, `Delete` y `Get` se autorizan con los
  permisos de `PutItem`, `UpdateItem`, `DeleteItem` y `GetItem`
  ([Using IAM with DynamoDB transactions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/transaction-apis-iam.html)).

## Sin verificar contra AWS

Lo comprueban los pedidos a staging de «Verificación».

**Parte 1**
- La transacción escribe `ACCOUNT#…` con el permiso de `LeadingKeys` en la tabla
  real.

**Parte 4**
- Sin `Authorization`, el gateway responde `UNAUTHORIZED` (401) y no
  `MISSING_AUTHENTICATION_TOKEN`, que hoy respondería 404.
- El access token queda rechazado por el `aud`, y un token de otro pool, por la
  firma.
- `IdentityValidationExpression` funciona con el id del cliente resuelto por
  CloudFormation.
- Si `Bearer <token>` pasa, y qué responde un pedido sin clave y sin token.
- El cuerpo de la respuesta 401 llega con las tildes.
- `MeFunction` puede hacer el `Query` con `LeadingKeys` en `USER#*`, el de
  `index/GSI2` y el `GetItem` en `ACCOUNT#*`.

## Riesgos aceptados del plan

- **Los usuarios de staging creados antes de la parte 1 reciben 500** en toda
  ruta privada: no tienen `AccountId` ni `OnboardingStep`. Son cuentas de
  prueba; quien pruebe crea una nueva. En producción no hay usuarios de este
  backend: todavía no hay ningún release `backend-infra-*`.
- **El primer `/api/me` después del registro puede responder 401** si `GSI2`
  todavía no tiene al usuario. Entre la transacción y ese pedido pasan el
  inicio de sesión con Cognito y una redirección de platform, más que la
  fracción de segundo que suele tardar el índice. Ver «Para otros tickets».
- **IAM no ata la lectura al usuario de la sesión.** `dynamodb:LeadingKeys` sólo
  acota prefijos: cualquier Lambda privada puede leer cualquier `USER#*`. El
  aislamiento lo da el código, que sólo lee la partición del `sub` validado.
- **Dos pedidos a DynamoDB por ruta privada, y uno más en `/api/me`:** unas 2,5
  unidades de lectura por pedido a `/api/me`. Es el costo que acepta la spec.
- **Si algún día se reemplaza el app client de platform,** el autorizador toma
  el `aud` nuevo pero la etapa no se vuelve a publicar sola: la expresión se
  asigna por fuera de las propiedades de CDK que entran en el id del
  deployment. Hoy sólo lo reemplazaría cambiar `generateSecret` o el pool, y eso
  ya invalida todas las sesiones.
- **`Bearer` y el orden entre la clave y el token no están documentados.** El
  contrato es el token solo, y el diseño no depende del orden.

## Para otros tickets

- **Platform (WIZ-78, fuera de alcance):** manda `Authorization: <ID token>`
  sin `Bearer`, además de `x-api-key`. En el middleware, `GET /api/me`: un 403
  con `onboardingStep` lleva a ese paso; un 401, a renovar y, si no, a iniciar
  sesión. Justo después de crear la cuenta, un 401 puede ser `GSI2` atrasado:
  conviene reintentar una vez antes de mandar al login.
- **El onboarding (WIZ-77):** escribe `OnboardingStep` y, al terminar,
  `OnboardingCompletedAt`; crea las memberships con el ítem de este plan (la
  policy ya lee `ResourceId`, `ResourceType`, `AccountId` y `Role`) y el ítem
  `SUBSCRIPTION`; suma `givenName`, `familyName`, `phone` y `treatment` al
  usuario y a `/api/me`. Cada ruta de un paso declara `onboardingStep: "<el
  paso>"` y, si va sobre un recurso, `member` o `roles` con `{resourceId}`.
- **Toda ruta privada nueva** se crea con `addPrivateRoute`, con
  `SESSION_USER_ACCESS`, la consulta de `GSI2` y `TABLE_NAME`, y usa
  `handlePrivateRoute`. La prueba de síntesis lo exige salvo lo último, que
  revisa el reviewer.
- **Las invitaciones:** un usuario sin cuenta propia cambia `GetMeUseCase`, que
  hoy falla si la cuenta no existe, y es el primer caso de `isAccountOwner:
  false`.

## Preguntas para el humano

- **¿El administrador de la organización hereda el acceso a sus sedes, como
  hoy?** Respondida el 12 de noviembre de 2026: sí, se hereda. Ver «El rol de
  la organización se hereda en sus sedes».
