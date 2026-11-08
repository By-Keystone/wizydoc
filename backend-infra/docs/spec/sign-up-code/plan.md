# Plan: registro con código de verificación

Spec: [spec.md](./spec.md) · Ticket: WIZ-75 · Reemplaza en parte a
[../sign-up/plan.md](../sign-up/plan.md)

## Partes

Cada parte se puede mergear sola sin romper `main`: las rutas viejas siguen
funcionando hasta la parte 4. Los tamaños son de código de producción (sin
pruebas ni docs).

| Parte | Qué entrega | Tamaño estimado |
|---|---|---|
| 1 | `POST /api/auth/sign-up/code`: dominio e ítem del código (con el enfriamiento de un minuto por correo), caso de uso, handler, plantilla de SES, Lambda y permisos. «Intentaron crear una cuenta con tu correo» pasa a «Hola,» y tiene el mismo minuto de espera. | ~385 líneas |
| 2 | `POST /api/auth/sign-up/code/verify`: límite por IP, intentos, gasto del código y token de verificación. | ~380 líneas netas (unas 435 brutas, con el renombre del límite por IP y los permisos por acción) |
| 3a | Los cimientos de la sesión, sin ruta nueva: el app client `session` (`adminUserPassword`, con secreto, `preventUserExistenceErrors`, `writeAttributes` `email`, `given_name` y `family_name`, el pool recreado con `email` inmutable, `enableTokenRevocation`, refresh token de 30 días), lo mismo en el `ApiClient`, `name`, `lastName` y `phone` opcionales, y el adaptador que inicia la sesión con `AdminInitiateAuth`. | ~110 líneas |
| 3b | `POST /api/auth/sign-up/confirm`: lee y gasta el token de verificación, crea la cuenta sin nombre, apellido ni teléfono e inicia la sesión con el adaptador de 3a. | ~300 líneas |
| 4 | Quita `POST /api/auth/sign-up/email`, `POST /api/auth/sign-up/resend-confirmation`, los correos «Confirma tu correo» y «Confirma tu cuenta» y lo que sólo usaban ellos. | Sólo borra (neto negativo) |

- La parte 3 se dividió en 3a y 3b porque, con las decisiones de más abajo, no
  cabía en ~400 líneas. 3a no agrega rutas ni Lambdas: se puede mergear sola.
- La parte 4 va al final porque `SignUpUseCase` y la Lambda `sign-up` siguen
  atendiendo a quien use la ruta vieja hasta entonces. Mover el esquema de la
  contraseña de `sign-up.usecase.ts` a `domain/value-objects/` es de la parte 3,
  que es quien lo reutiliza.
- Orden de despliegue: ninguna parte necesita a otra desplegada antes, porque
  cada una agrega rutas y Lambdas nuevas.

## Decisiones para las partes 2 y 3

**Parte 2: verificar el código**
- **Intentos atómicos.** Primero un `UpdateItem` con `ADD Attempts :one`,
  la condición `attribute_exists(PK) AND Attempts < :max AND
  DeleteAfter > :now` y `ReturnValues: ALL_NEW`. Si la condición falla, 400.
  Después se compara el hash. Si coincide, una transacción con el `Delete` del
  código condicionado a `CodeHash = :hash` y el `Put` del token de
  verificación. Así N verificaciones incorrectas en paralelo evalúan como
  mucho 5.
- **Pruebas:** N verificaciones incorrectas en paralelo evalúan como mucho 5, y
  después de pedir otro código el anterior responde 400.
- **Permisos por acción y prefijo.** `grantUsersTableAccess` recibe las
  acciones por prefijo, con `DeleteItem` donde haga falta, para que cada Lambda
  tenga sólo lo que usa.
- **La respuesta del token** lleva `Cache-Control: no-store`.
- **Límite por IP de la verificación:** 10 verificaciones cada 10 minutos por
  IP, aparte del límite de envíos. Se cuenta antes de tocar el código, así que
  un 429 no suma ningún intento fallido. Responde 429 con
  `TOO_MANY_ATTEMPTS`.
  - Ítem: `PK = SIGN_UP_VERIFY_ATTEMPTS#<ip o red /64>`, `SK = <inicio de la
    ventana de 10 minutos>`, `ItemType = SIGN_UP_VERIFY_ATTEMPTS`, `Attempts` y
    `DeleteAfter` (TTL), igual que los envíos.
  - **Se reutiliza el adaptador de envíos,** renombrado por lo que es,
    `DynamoDBIpRateLimit` (puerto `IIpRateLimit`). El tipo de ítem y el máximo
    pasan al constructor como `{ itemType, maxAttempts }`
    (`EMAIL_SEND_RATE_LIMIT` = `EMAIL_SEND_ATTEMPTS`, 3;
    `SIGN_UP_VERIFY_RATE_LIMIT` = `SIGN_UP_VERIFY_ATTEMPTS`, 10). El tipo de
    ítem es también el prefijo de la clave: no hay motivo para que difieran,
    así que no hay un `keyPrefix` aparte. La agrupación por IP y la ventana no
    cambian.
  - La Lambda de verificación tiene `UpdateItem` sobre
    `SIGN_UP_VERIFY_ATTEMPTS#*`, además de lo suyo.
- **Un código que no sirve** incluye perder la carrera de la transacción:
  `ConditionalCheckFailedException`, `TransactionConflictException` o
  `TransactionCanceledException` cuyas razones sean todas `ConditionalCheckFailed`,
  `TransactionConflict` o `None`. Cualquier otra razón sube y responde 500.
- **Puerto:** `ISignUpCodeRepository` gana `registerAttemptAndReadCodeHash(email)`
  (el `UpdateItem` de arriba; devuelve el hash guardado o `undefined`) y
  `spendForVerificationToken(email, codeHash, verificationToken)` (la
  transacción; devuelve si gastó). El caso de uso compara el hash entre las dos.
  El token de verificación y su ítem (`SIGN_UP_VERIFICATION#<sha256>`, con
  `Email` y `DeleteAfter` a los 15 minutos) los guarda la misma transacción.

**Riesgo aceptado de la parte 2: oráculo de tiempo de la verificación.** Para
un correo sin cuenta, los primeros intentos escriben en DynamoDB; para uno con
cuenta no hay código y el `UpdateItem` falla sin escribir, así que tarda unos
milisegundos menos. Distinguir una sola dirección lleva horas: como mucho 5
muestras útiles por minuto y por correo, y un correo por minuto a la víctima.
Igualarlo exigiría escrituras de relleno.

**Parte 3a: el cliente de la sesión (hecho)**
- **Pool nuevo con `email` inmutable.** Comprobado contra AWS: Cognito rechaza
  un app client sin `email` en `writeAttributes` mientras `email` sea
  obligatorio (`InvalidParameterException: Invalid write attributes specified
  while creating a client`). Por eso `email` sigue siendo obligatorio pero
  `mutable: false`, y los dos clientes lo incluyen en `writeAttributes`: como
  es inmutable, nadie puede cambiarlo con su access token. Cognito no deja
  cambiar las propiedades de un atributo existente, así que CloudFormation no
  puede actualizar el pool actual: el construct pasa a llamarse
  `UserPoolWithImmutableEmail`, lo que crea un pool nuevo (y sus clientes)
  y las Lambdas reciben su id. El pool viejo **se conserva** (CDK retiene los
  user pools por defecto, y la `removalPolicy` del nuevo sigue reteniendo); se
  borra a mano después de desplegar, en la cuenta de desarrollo y en staging.
  Con el correo inmutable nadie puede cambiar su correo en Cognito: si un día
  se quiere permitir, hará falta un flujo de administrador.
- **`writeAttributes` de los dos clientes:** exactamente `email`, `given_name`
  y `family_name`. `phone_number` no, por el riesgo de fraude con SMS si algún
  día se activan. `authentication.test.ts` lo comprueba en cada
  `AWS::Cognito::UserPoolClient`, junto con `enableTokenRevocation: true`
  explícito y que `email` sea inmutable en el pool.
- **`ApiClient`:** nada en `backend-infra` usa su `USER_PASSWORD_AUTH` hoy; lo
  usaría el inicio de sesión, que es otro subticket de WIZ-71. Se deja con sus
  flujos y sólo gana `writeAttributes`. Propuesta: si el inicio de sesión usa el
  cliente de la sesión o uno propio, quitarlo.
- **Cliente `session`:** `authFlows: { adminUserPassword: true }` (CDK emite
  `ALLOW_ADMIN_USER_PASSWORD_AUTH` y `ALLOW_REFRESH_TOKEN_AUTH`, sin SRP,
  CUSTOM_AUTH ni `USER_PASSWORD_AUTH`), `generateSecret`,
  `preventUserExistenceErrors` y refresh token de 30 días (el valor por
  defecto de Cognito, explícito). `Authentication.sessionClient` lo expone.
- **El secreto no va a la plantilla ni al entorno,** y no usa Secrets Manager:
  el adaptador (`CognitoSessionProvider`) lo lee con `DescribeUserPoolClient`
  la primera vez y lo guarda sólo en memoria. Decisión del humano. Motivos:
  `@aws-sdk/client-secrets-manager` no está instalado y agregarlo es una
  dependencia nueva; un `AWS::SecretsManager::Secret` agrega un recurso, un costo
  mensual y una copia más del secreto. Costo del permiso:
  `cognito-idp:DescribeUserPoolClient` no se puede acotar a un cliente (es sobre
  el pool), así que la Lambda que lo tenga podría leer el secreto de cualquier
  cliente del pool; ya puede cambiar la contraseña de cualquier usuario, así que
  no amplía lo que puede hacer.
  **Condiciones:** `DescribeUserPoolClient` sólo en las Lambdas que inician o
  renuevan sesiones; nunca se registra su respuesta; el secreto vive sólo en
  memoria.
- **El adaptador** inicia la sesión con el `sub` como usuario
  (`AdminInitiateAuth`, `ADMIN_USER_PASSWORD_AUTH`) y `SECRET_HASH` =
  base64(HMAC-SHA256(secreto, sub + clientId)), y devuelve
  `{ idToken, accessToken, refreshToken, expiresIn }`. Si Cognito no los
  entrega completos, lanza un error sin ningún valor. La Lambda de confirm (3b)
  necesita `cognito-idp:AdminInitiateAuth` y `DescribeUserPoolClient`, y el id
  del cliente en el entorno.
- **Usuarios sin nombre:** `name`, `lastName` y `phone` son opcionales en
  `User`, `CreateUserInput`, el ítem y los mappers. Los correos viejos con
  saludo por nombre mandan el nombre vacío si falta (se van en la parte 4).
- **Pregunta para el humano:** hoy la sesión de Better Auth dura 7 días y se
  renueva con el uso; el refresh token de Cognito dura 30 días fijos desde el
  inicio de sesión y no se renueva con el uso. ¿Se deja en 30 o se acorta?

**Parte 3b: crear la cuenta**
- **El token se lee antes de crear nada.** Antes de `AdminCreateUser`, un
  `GetItem` con `ConsistentRead: true` sobre
  `SIGN_UP_VERIFICATION#<sha256(token)>` comprueba `ItemType`, que `Email` sea
  el correo pedido y que `DeleteAfter > ahora`. Si sólo se comprobara que
  existe, un token del correo del atacante, mandado con el correo de otra
  persona, crearía en Cognito el usuario de ella con la contraseña de él.
- **Un token nunca actúa sobre un usuario que ya existe.** Con
  `UsernameExistsException` responde 400 sin tocar nada, y no adopta ni repara
  usuarios huérfanos de Cognito. Puede haber varios tokens vigentes para el
  mismo correo.
- **IAM de confirm:** `grantTableWrites` gana `GetItem` con
  `dynamodb:LeadingKeys`, sólo sobre `SIGN_UP_VERIFICATION#*` y sólo para la
  Lambda de confirm. Esa Lambda tiene además `DeleteItem` sobre
  `SIGN_UP_VERIFICATION#*` y `PutItem` sobre `USER#*`. La de verificación sigue
  sin `GetItem`.
- **Permisos exactos de la Lambda de confirm:**
  - Cognito: `AdminCreateUser`, `AdminSetUserPassword`, `AdminDeleteUser`,
    `AdminInitiateAuth` y `DescribeUserPoolClient`.
  - DynamoDB: `GetItem` y `DeleteItem` sobre `SIGN_UP_VERIFICATION#*`,
    `PutItem` sobre `USER#*` y `Query` sobre `GSI1` para `existsByEmail`.
  - Nada de SES ni de los demás prefijos.
  - `DescribeUserPoolClient` y `AdminInitiateAuth` no pasan a las otras
    Lambdas.
- **El cliente de la sesión** (hecho en 3a) existe para que el id del cliente
  del `AdminInitiateAuth` tenga `preventUserExistenceErrors` y secreto: el id
  viaja en los tokens, y un cliente sin secreto dejaría llamar a
  `ForgotPassword` y `ResendConfirmationCode` sin autenticarse, con lo que se
  podrían enumerar cuentas fuera del gateway.
- **(3a, hecho) Datos opcionales:** `name`, `lastName` y `phone` pasan a ser opcionales en
  `User`, `CreateUserInput`, el esquema y los mappers, sin romper las rutas
  viejas.
- **Correo duplicado:** si Cognito responde `UsernameExistsException`, se
  responde 400 como un token que no sirve, sin borrar nada. Cualquier
  deshacer va por el `sub` recién creado, nunca por correo.
- **Condición del `Delete` del token** dentro de la transacción:
  `attribute_exists(PK) AND Email = :email AND DeleteAfter > :now`.
- **Tamaño:** dividida en 3a y 3b (ver «Partes»).

**Orden de despliegue:** antes de que platform apunte al registro de
`backend-infra` se exigen tres cosas:
- la parte 4 desplegada, porque `sign-up/email` todavía permite el
  pre-secuestro;
- que platform reenvíe en `x-real-ip` la IP que pone el borde: sin ella todas
  las IP comparten el cupo `unknown` y los límites por IP limitan a todos a la
  vez;
- que esté comprobada la pregunta P1 de
  `docs/features/fix-auth-rate-limit-ip/plan.md`.

**Para otros tickets:** la recuperación y el cambio de contraseña tienen que
llamar a `AdminUserGlobalSignOut`, porque Cognito no revoca los refresh tokens
al restablecer la contraseña. Y el stage del gateway sigue sin
`dataTraceEnabled`. Todo app client que emita tokens a usuarios lleva la misma
restricción de `writeAttributes`, y `authentication.test.ts` la comprueba para
cada `AWS::Cognito::UserPoolClient`. El cierre de sesión llama a `RevokeToken`
desde el backend.

## Flujo de la parte 1: pedir el código

**Handler**
- `handlers/request-sign-up-code.handler.ts` lee `TABLE_NAME` y las variables
  del correo, arma las piezas reales a nivel de módulo y delega en
  `handleRequestSignUpCode`.
- `handlers/request-sign-up-code.http.ts` (`handleRequestSignUpCode`) traduce
  HTTP y se prueba con dobles, con el mismo orden que el reenvío actual:
  1. Valida el cuerpo con `requestSignUpCodeInputSchema`. Un cuerpo que no es
     un objeto JSON responde 400 con «La solicitud no es válida.»; un correo
     inválido, con «Correo inválido». No cuenta para el límite.
  2. Cuenta el pedido con `IIpRateLimit.tryRegister(readIpAddress(event))`
     (3 envíos cada 10 minutos). Si devuelve `false`, 429 con
     `TOO_MANY_ATTEMPTS`.
  3. Llama a `RequestSignUpCodeUseCase.execute` y responde 202 vacío. Ante
     cualquier error responde 500 con «No pudimos enviarte el código. Intenta
     de nuevo.» y registra sólo `errorName(error)`: nunca el código, su hash,
     el correo ni el mensaje del error.

**Caso de uso (`application/request-sign-up-code.usecase.ts`)**
1. `users.existsByEmail(email)`, un `Query` sobre `GSI1` que proyecta sólo
   `ItemType` y revisa que sea `USER`, sin leer ni validar el resto del
   registro: un registro mal formado no puede responder distinto sólo para los
   correos con cuenta. Si hay un usuario, cualquiera, registra el aviso
   con `accountExistsNotices.tryRegister(email)` y, sólo si lo registró (el
   anterior salió hace un minuto o más), llama a
   `emails.sendAccountExists(email)`. Termina sin guardar ningún código.
2. Si no, `createSignUpCode(email)` y
   `signUpCodes.saveUnlessRequestedRecently(signUpCode)`. Si devuelve `false`
   (el anterior se pidió hace menos de un minuto), termina sin enviar nada: el
   anterior sigue sirviendo y la respuesta es 202.
3. Si lo guardó, `emails.sendSignUpCode(signUpCode)`. Se guarda antes de
   enviar: si el envío falla, el código queda guardado pero la persona no lo
   recibe y puede pedir otro pasado el minuto, que lo reemplaza.

El límite por IP se cuenta antes, como hoy, también cuando un enfriamiento
descarta el pedido. Las dos ramas responden 202 igual y hacen lo mismo: un
`Query`, un `PutItem` condicionado y después SES o nada. Así no se distinguen
por lo que tarda la respuesta.

## Dominio (`lib/src/users/domain/`)

- **`sign-up-code.entity.ts`:** `createSignUpCode(email, now)` genera 6 dígitos
  con `crypto.randomInt(10 ** 6)` rellenados con ceros a la izquierda, su
  SHA-256 en hex (`hashSignUpCode`), el vencimiento a
  `SIGN_UP_CODE_LIFETIME_MINUTES = 10` y `attempts = 0`. El código en
  claro sólo existe en memoria, mientras se arma el correo.
- **`repository/sign-up-code.repository.ts`:** `ISignUpCodeRepository.saveUnlessRequestedRecently`,
  que devuelve si guardó. La parte 2 le agrega la verificación.
- **Los 5 intentos** (`SIGN_UP_CODE_MAX_FAILED_ATTEMPTS`) los define la parte 2,
  que es la primera que los usa. La parte 1 sólo guarda el contador en cero,
  que es lo que «vuelve a dar 5 intentos» al reemplazar un código.

## Ítems de DynamoDB

| Ítem | `PK` | `SK` | `ItemType` | Otros atributos |
|---|---|---|---|---|
| Código de registro (parte 1) | `SIGN_UP_CODE#<correo>` | `!` | `SIGN_UP_CODE` | `CodeHash`, `Attempts`, `DeleteAfter` |
| Aviso a una cuenta que ya existe (parte 1) | `SIGN_UP_NOTICE#<correo>` | `!` | `SIGN_UP_NOTICE` | `DeleteAfter` |
| Token de verificación (parte 2) | `SIGN_UP_VERIFICATION#<sha256>` | `!` | `SIGN_UP_VERIFICATION` | `Email`, `DeleteAfter` |

- **`Attempts` cuenta todas las verificaciones** que llegan a comparar el hash,
  también la correcta, porque la parte 2 suma antes de comparar. La parte 1 lo
  guarda en cero.
- **El aviso guarda cuándo salió el último,** un dato que no está en ninguna
  otra parte. `DeleteAfter` es ahora más 60 segundos (`SIGN_UP_EMAIL_COOLDOWN_SECONDS`)
  y es a la vez el fin del enfriamiento y el TTL. `DynamoDBAccountExistsNotices.tryRegister`
  hace un `PutItem` con `attribute_not_exists(PK) OR DeleteAfter <= :now`
  (`:now` en segundos epoch) y devuelve `false` ante
  `ConditionalCheckFailedException`; cualquier otro error sube. El reloj es
  inyectable, como en los envíos por IP.
- **Uno por correo:** la clave lleva el correo, así que el código nuevo pisa
  al anterior y devuelve los intentos a cero.
- **Enfriamiento de un minuto por correo, sin dato nuevo.** El `PutItem` lleva
  `attribute_not_exists(PK) OR DeleteAfter <= :latestReplaceableExpiry`, donde
  `:latestReplaceableExpiry` es la hora actual más 10 minutos menos
  `SIGN_UP_CODE_COOLDOWN_SECONDS` (60), en segundos epoch. Como el código
  guardado vence 10 minutos después de pedirse, esa condición dice «el anterior
  se pidió hace un minuto o más». Si falla con `ConditionalCheckFailedException`,
  el repositorio devuelve `false`; cualquier otro error sube.
- **El correo en la clave** no mezcla con los usuarios: `SIGN_UP_CODE#` no es
  `USER_EMAIL#`, y el ítem no tiene `GSI1PK`, así que `findByEmail` nunca lo ve.
- **`DeleteAfter` es el único instante** (segundos epoch), y es convención de
  los ítems nuevos: nada de copias de lo que ya está en la clave o en otro
  atributo. El endpoint lo compara con la hora actual para decidir si el
  código venció, y el TTL de DynamoDB lo usa para limpiar la tabla, días
  después. En el dominio se sigue llamando `expiresAt`; el mapper lo traduce
  desde y hacia `DeleteAfter`.
- **Sin `Email` en el código:** ya está en la clave. El token de verificación
  sí lo lleva, porque su clave es el hash y no el correo.
  `EMAIL_CONFIRMATION` no se toca: se va en la parte 4.
- **Sólo se guarda el hash.** Sin sal, como acepta la spec.
- **Nada nuevo calculable:** los intentos fallidos son un dato que no existe en
  ninguna otra parte.

## Puertos y adaptadores

| Puerto | Implementación (`infrastructure/`) |
|---|---|
| `ISignUpCodeRepository`: `saveUnlessRequestedRecently(signUpCode)`, que devuelve si guardó | `persistence/dynamodb/sign-up-code.repository.ts`, con `sign-up-code.schema.ts` y `sign-up-code.mappers.ts` |
| `ISignUpEmails`: se agrega `sendSignUpCode(signUpCode)`, y `sendAccountExists` recibe el `EmailVO` en vez del `User` | `email/ses/sign-up-emails.ts` |
| `ISignUpCodeRepository` (parte 2): `registerAttemptAndReadCodeHash(email)` y `spendForVerificationToken(email, codeHash, verificationToken)` | `persistence/dynamodb/sign-up-code.repository.ts`, con `sign-up-verification-token.schema.ts` y `.mappers.ts` |
| `IIpRateLimit` (antes `IEmailSendAttempts`): `tryRegister(ip)` | `persistence/dynamodb/ip-rate-limit.ts` (`DynamoDBIpRateLimit`) |
| `IUserRepository`: se agrega `existsByEmail(email)`; `findByEmail` queda como hoy | `persistence/dynamodb/user.repository.ts` |

**Plantillas de SES**
- **Nueva: `sign-up-code`** (`lib/email-templates/sign-up-code.{html,txt}`),
  asunto «Tu código para crear tu cuenta en WizyDoc», con el diseño de las
  actuales. Datos: `code` y `codeLifetimeMinutes` (`"10"`). Se crea en
  `lib/sign-up-email-templates.ts` como `signUpCode`, con el nombre
  `<stack>-sign-up-code`.
- **`account-exists` sin nombre:** el HTML y el texto saludan «Hola,» y ya no
  usan `name` ni `escapedName`. El adaptador manda sólo `loginUrl` y
  `forgotPasswordUrl`.
- **`confirm-email` y `pending-confirmation` conservan el saludo con nombre**
  hasta la parte 4. Por eso el adaptador ya no manda `name` y `escapedName` en
  todo envío: `namePlaceholders(user)` las agrega sólo a esas dos.
- **SES no escapa el HTML.** El código son 6 dígitos que genera el servidor, así
  que no hay nada que escapar. El riesgo de que SES falle en silencio si falta
  un dato es el mismo del plan del registro, y lo cubre la misma prueba de
  marcadores: ahora, para las plantillas sin nombre, exige que el HTML y el
  texto usen exactamente los datos que manda el adaptador.

## Infraestructura

- `lib/backend-stack.ts`:
  - `RequestSignUpCodeFunction`: un `NodejsFunction` más (Node 22, arm64, 15 s,
    512 MB, logs un mes) con el entorno compartido, que gana
    `SIGN_UP_CODE_TEMPLATE`. Sin `USER_POOL_ID` ni Cognito.
  - **Permisos:**
    - `dynamodb:PutItem` y `UpdateItem` con `dynamodb:LeadingKeys` en
      `SIGN_UP_CODE#*`, `SIGN_UP_NOTICE#*` y `EMAIL_SEND_ATTEMPTS#*`
      (`UpdateItem` es del límite por IP; el código y el aviso sólo usan
      `PutItem`);
    - `dynamodb:Query` sólo sobre `index/GSI1`, para `findByEmail`;
    - `ses:SendTemplatedEmail` sobre `identity/*` y sobre las plantillas
      `sign-up-code` y `account-exists`, con la condición `ses:FromAddress` de
      `lib/sender-address.ts`, igual que las otras dos Lambdas. Nada de
      Cognito, ni `USER#*`, ni `EMAIL_CONFIRMATION#*`.
  - `node.addDependency(emailTemplates)`, como las otras.
  - **`VerifySignUpCodeFunction` (parte 2):** `TABLE_NAME` como único dato de
    entorno, sin SES, Cognito, `Query` ni índices. `PutItem` sobre
    `SIGN_UP_VERIFICATION#*`; `UpdateItem` sobre `SIGN_UP_CODE#*` y
    `SIGN_UP_VERIFY_ATTEMPTS#*`; `DeleteItem` sobre `SIGN_UP_CODE#*`.
  - **Permisos por acción y prefijo:** `grantTableWrites` recibe, por Lambda,
    qué acciones y con qué prefijos de `dynamodb:LeadingKeys`. Las tres Lambdas
    anteriores quedan con menos que antes (ya no tienen `UpdateItem` sobre
    sus propios ítems ni `PutItem` sobre `EMAIL_SEND_ATTEMPTS#*`, que el límite
    por IP nunca usó), y `backend-stack.test.ts` fija el mapa exacto de las
    cuatro. El `Query` sobre `GSI1` va aparte (`grantUserEmailLookup`).
  - Ruta `POST /api/auth/sign-up/code`; la parte 2 le cuelga `verify` (y la
    respuesta de éxito lleva `Cache-Control: no-store`) y la parte 3 agrega
    `confirm` junto a `code`. Como toda ruta del gateway, exige la
    clave de platform.
- `lib/dynamo.ts`: sin cambios; `DeleteAfter` ya es el TTL.

## Cobertura de los criterios

Prueba en `test/`. Entre paréntesis, la parte que cubre cada criterio.

| Criterio | Parte | Prueba |
|---|---|---|
| Pedir el código con un correo sin cuenta guarda sólo su hash, con vencimiento a los 10 minutos, y envía el correo con el código. Responde 202 | 1 | `users/request-sign-up-code.test.ts`, `users/dynamodb.test.ts`, `users/sign-up-emails.test.ts` y `sign-up-email-templates.test.ts` |
| Pedir el código con un correo que ya tiene cuenta no guarda nada y envía «Intentaron crear una cuenta con tu correo»; responde 202, igual | 1 | `users/request-sign-up-code.test.ts` y `sign-up-email-templates.test.ts` |
| Pedir el código con un correo con cuenta antes de que pase un minuto desde el último aviso no envía nada y responde 202 | 1 | `users/request-sign-up-code.test.ts` y `users/dynamodb.test.ts` (la condición y el `false`) |
| Pedir otro código pasado un minuto hace que el anterior deje de servir | 1 (el reemplazo) y 2 (que no sirva) | `users/request-sign-up-code.test.ts` y `users/dynamodb.test.ts` en la parte 1; la prueba de verificación en la parte 2 |
| Pedir otro código antes de que pase un minuto no guarda ni envía nada, el anterior sigue sirviendo y responde 202 | 1 (no guarda ni envía) y 2 (que sigue sirviendo) | `users/request-sign-up-code.test.ts` y `users/dynamodb.test.ts` (la condición y el `false`) en la parte 1; `users/verify-sign-up-code.test.ts` en la parte 2 |
| El cuarto envío en 10 minutos desde la misma IP responde 429 | 1 | `users/request-sign-up-code.test.ts` y `users/dynamodb.test.ts` |
| La undécima verificación en 10 minutos desde la misma IP responde 429 y no cuenta como intento del código | 2 | `users/verify-sign-up-code.test.ts` y `users/dynamodb.test.ts` (prefijo y máximo del límite) |
| Verificar el código correcto responde 200 con un token y gasta el código | 2 | `users/verify-sign-up-code.test.ts` |
| Un código incorrecto, vencido, agotado, usado o que nunca se pidió responde 400 con el mismo mensaje | 2 | `users/verify-sign-up-code.test.ts` |
| Al quinto intento fallido, el código deja de servir | 2 | `users/verify-sign-up-code.test.ts` y `users/dynamodb.test.ts` (la condición del `UpdateItem`) |
| N verificaciones incorrectas en paralelo evalúan 5 como mucho | 2 | `users/verify-sign-up-code.test.ts` y `users/dynamodb.test.ts` |
| De dos verificaciones a la vez, sólo una recibe el token | 2 | `users/verify-sign-up-code.test.ts` y `users/dynamodb.test.ts` (la condición de la transacción y la carrera perdida) |
| Crear la cuenta con un token vigente crea el usuario, lo confirma, gasta el token y responde 200 con los tokens | 3a (el adaptador y el cliente) y 3b | `users/confirm-sign-up.test.ts`, `users/cognito-session.test.ts` y `authentication.test.ts` |
| Crear la cuenta sin token, vencido, usado o de otro correo responde 400 y no crea nada | 3 | `users/confirm-sign-up.test.ts` |
| Con el flag encendido, la constancia va en la misma transacción; sin aceptar, 400 | 3 | `users/confirm-sign-up.test.ts` y `users/dynamodb.test.ts` |
| De dos pedidos con el mismo token, sólo uno crea la cuenta | 3 | `users/dynamodb.test.ts` |
| Si falla DynamoDB, el usuario se borra de Cognito y responde 500 | 3 | `users/confirm-sign-up.test.ts` |
| Si Cognito no entrega los tokens, la cuenta queda y responde 204 | 3a (el adaptador falla sin filtrar valores) y 3b (el 204) | `users/cognito-session.test.ts` y `users/confirm-sign-up.test.ts` |
| Ni el código, ni el token, ni sus hashes, ni la contraseña, ni los tokens aparecen en los logs | 1 (código y hash), 2 (también el token de verificación y su hash) y 3 (el resto) | `users/request-sign-up-code.test.ts`, `users/verify-sign-up-code.test.ts` y sus equivalentes |
| Las tres rutas exigen la clave de platform y cada Lambda sólo tiene los permisos que usa | 1 (la ruta y la Lambda del código), 2 (la verificación, y el mapa exacto de permisos de las cuatro Lambdas) y 3 | `backend-stack.test.ts` |

## Verificado contra AWS

El 8 de noviembre de 2026, en la cuenta de desarrollo, con un pool temporal
configurado como el de la parte 3a y borrado después:

- Un app client sin `email` en `writeAttributes` se rechaza mientras `email`
  sea obligatorio («Invalid write attributes specified while creating a
  client»). Por eso el pool nuevo tiene `email` inmutable.
- Cognito acepta el pool con `email` obligatorio e inmutable y el cliente con
  `writeAttributes` `email`, `given_name` y `family_name`, sólo
  `ALLOW_ADMIN_USER_PASSWORD_AUTH` y `ALLOW_REFRESH_TOKEN_AUTH`, secreto,
  revocación de tokens y refresh token de 30 días.
- `DescribeUserPoolClient` devuelve `ClientSecret`.
- `AdminInitiateAuth` con `ADMIN_USER_PASSWORD_AUTH`, el `sub` como `USERNAME`
  y el `SECRET_HASH` calculado con el `sub` devuelve el id token, el access
  token y el refresh token.
- Con su access token, el usuario no puede cambiar su correo («Attribute cannot
  be updated») ni escribir `phone_number` («A client attempted to write
  unauthorized attribute»).

## Sin verificar contra AWS

- Que `dynamodb:LeadingKeys` con `SIGN_UP_CODE#*`, `SIGN_UP_NOTICE#*` y
  `EMAIL_SEND_ATTEMPTS#*` permita el `PutItem` y el `UpdateItem` reales.
- Que la plantilla `sign-up-code` se rinda bien en SES (y respete tildes y
  la ñ del asunto y del texto). Después del primer despliegue:

```bash
aws sesv2 test-render-email-template \
  --template-name WizydocBackend-sign-up-code \
  --template-data '{"code":"012345","codeLifetimeMinutes":"10"}'
```

  El HTML y el texto tienen que mostrar `012345` con el cero.
- Que `ses:SendTemplatedEmail` autorice el envío de la plantilla nueva: es el
  mismo patrón ya verificado el 7 de noviembre de 2026 para las otras tres, pero
  la plantilla nueva no se probó.
- Que la condición del enfriamiento (`DeleteAfter <= :latestReplaceableExpiry`)
  se evalúe como esperamos en DynamoDB real, con dos pedidos del mismo correo
  separados por menos y por más de un minuto.
- Que `dynamodb:LeadingKeys` con `SIGN_UP_VERIFICATION#*`, `SIGN_UP_CODE#*` y
  `SIGN_UP_VERIFY_ATTEMPTS#*` permita el `PutItem`, el `UpdateItem` y el
  `DeleteItem` reales, en particular dentro de `TransactWriteItems`.
- Que, con 6 verificaciones incorrectas en paralelo contra DynamoDB real, el
  `UpdateItem` condicionado deje pasar sólo 5, y que un `UpdateItem` que choque
  con la transacción responda `TransactionConflictException` y no otro error.
- Los tiempos reales del camino con y sin cuenta.
- Las partes 2 y 3 agregan lo suyo: la condición de la transacción del token y
  `ADMIN_USER_PASSWORD_AUTH` con `adminUserPassword` en el app client.
