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
| 2 | `POST /api/auth/sign-up/code/verify`: límite por IP, intentos, gasto del código y token de verificación. | ~280 líneas |
| 3 | `POST /api/auth/sign-up/confirm`: crea la cuenta sin nombre, apellido ni teléfono, e inicia la sesión con `ADMIN_USER_PASSWORD_AUTH` (`adminUserPassword` en el app client). | ~380 líneas |
| 4 | Quita `POST /api/auth/sign-up/email`, `POST /api/auth/sign-up/resend-confirmation`, los correos «Confirma tu correo» y «Confirma tu cuenta» y lo que sólo usaban ellos. | Sólo borra (neto negativo) |

- La parte 3 es la más cercana al tope y, con las decisiones de más abajo, puede
  pasar de ~400 líneas: en ese caso se divide en 3a (sesión de Cognito, app
  client y `adminUserPassword`) y 3b (la ruta).
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
  - **Se reutiliza `DynamoDBEmailSendAttempts`:** hoy el prefijo
    (`EMAIL_SEND_ATTEMPTS`), el tipo de ítem y el máximo (3) son constantes del
    módulo. La parte 2 los pasa al constructor (`{ keyPrefix, itemType,
    maxAttempts }`), con los valores de hoy para los envíos y 10 para las
    verificaciones; la agrupación por IP y la ventana no cambian. Como
    ya no sirve sólo a los envíos, la clase y el puerto se renombran por lo que
    son, un límite por IP (`DynamoDBIpRateLimit` e `IIpRateLimit`), en esa
    misma parte.
  - La Lambda de verificación tiene `PutItem`/`UpdateItem` sobre
    `SIGN_UP_VERIFY_ATTEMPTS#*`, además de lo suyo.

**Parte 3: crear la cuenta**
- **App client propio para la sesión:** sólo `ADMIN_USER_PASSWORD_AUTH`
  (`authFlows: { adminUserPassword: true }`, explícito, con una prueba de
  síntesis: sin `authFlows`, Cognito habilita SRP y CUSTOM_AUTH). **Conserva su
  secreto,** que la Lambda de confirm lee de Secrets Manager para calcular
  `SECRET_HASH`; no se pone en una variable de entorno en claro. Lleva
  `preventUserExistenceErrors: true`. Motivo: el id del cliente viaja en los
  tokens, y un cliente sin secreto deja llamar a `ForgotPassword` y
  `ResendConfirmationCode` sin autenticarse, con lo que se podrían enumerar
  cuentas fuera del gateway. Si nada usa `userPassword`, el cliente actual lo
  pierde. `AdminInitiateAuth` va sólo a la Lambda de confirm.
- **Configuración del cliente:** `writeAttributes` sin `email`, para que el
  usuario no cambie su correo en Cognito con su access token, y la vigencia del
  refresh token fijada de forma explícita. **Antes de escribir la parte 3** hay
  que comprobar en una cuenta de prueba que Cognito acepta un `writeAttributes`
  sin `email`, porque `email` es obligatorio en el pool. Si no lo acepta, la
  salida (`email` con `mutable: false`, recreando el pool) es decisión del
  humano.
- **Datos opcionales:** `name`, `lastName` y `phone` pasan a ser opcionales en
  `User`, `CreateUserInput`, el esquema y los mappers, sin romper las rutas
  viejas.
- **Correo duplicado:** si Cognito responde `UsernameExistsException`, se
  responde 400 como un token que no sirve, sin borrar nada. Cualquier
  deshacer va por el `sub` recién creado, nunca por correo.
- **Condición del `Delete` del token** dentro de la transacción:
  `attribute_exists(PK) AND Email = :email AND DeleteAfter > :now`.
- **Tamaño:** con esto la parte 3 puede pasar de 400 líneas; si pasa, se
  divide en 3a (sesión de Cognito, app client y `adminUserPassword`) y 3b (la
  ruta).

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
restricción de `writeAttributes`, y `backend-stack.test.ts` la comprueba para
cada `AWS::Cognito::UserPoolClient`.

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
  2. Cuenta el pedido con `IEmailSendAttempts.tryRegister(readIpAddress(event))`
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
| `IUserRepository`: se agrega `existsByEmail(email)`; `findByEmail` y `IEmailSendAttempts.tryRegister` quedan como hoy | `persistence/dynamodb/user.repository.ts` |

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
  - Ruta `POST /api/auth/sign-up/code`; la parte 2 le cuelga `verify` y la
    parte 3 agrega `confirm` junto a ella. Como toda ruta del gateway, exige la
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
| Pedir otro código antes de que pase un minuto no guarda ni envía nada, el anterior sigue sirviendo y responde 202 | 1 (no guarda ni envía) y 2 (que sigue sirviendo) | `users/request-sign-up-code.test.ts` y `users/dynamodb.test.ts` (la condición y el `false`) en la parte 1; la prueba de verificación en la parte 2 |
| El cuarto envío en 10 minutos desde la misma IP responde 429 | 1 | `users/request-sign-up-code.test.ts` y `users/dynamodb.test.ts` |
| La undécima verificación en 10 minutos desde la misma IP responde 429 y no cuenta como intento del código | 2 | `users/verify-sign-up-code.test.ts` y `users/dynamodb.test.ts` |
| Verificar el código correcto responde 200 con un token y gasta el código | 2 | `users/verify-sign-up-code.test.ts` |
| Un código incorrecto, vencido, agotado, usado o que nunca se pidió responde 400 con el mismo mensaje | 2 | `users/verify-sign-up-code.test.ts` |
| Al quinto intento fallido, el código deja de servir | 2 | `users/verify-sign-up-code.test.ts` |
| De dos verificaciones a la vez, sólo una recibe el token | 2 | `users/dynamodb.test.ts` (la condición de la transacción) |
| Crear la cuenta con un token vigente crea el usuario, lo confirma, gasta el token y responde 200 con los tokens | 3 | `users/confirm-sign-up.test.ts` y `users/cognito.test.ts` |
| Crear la cuenta sin token, vencido, usado o de otro correo responde 400 y no crea nada | 3 | `users/confirm-sign-up.test.ts` |
| Con el flag encendido, la constancia va en la misma transacción; sin aceptar, 400 | 3 | `users/confirm-sign-up.test.ts` y `users/dynamodb.test.ts` |
| De dos pedidos con el mismo token, sólo uno crea la cuenta | 3 | `users/dynamodb.test.ts` |
| Si falla DynamoDB, el usuario se borra de Cognito y responde 500 | 3 | `users/confirm-sign-up.test.ts` |
| Si Cognito no entrega los tokens, la cuenta queda y responde 204 | 3 | `users/confirm-sign-up.test.ts` |
| Ni el código, ni el token, ni sus hashes, ni la contraseña, ni los tokens aparecen en los logs | 1 (código y hash), 2 y 3 (el resto) | `users/request-sign-up-code.test.ts` y sus equivalentes |
| Las tres rutas exigen la clave de platform y cada Lambda sólo tiene los permisos que usa | 1 (la ruta y la Lambda del código), 2 y 3 | `backend-stack.test.ts` |

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
- Los tiempos reales del camino con y sin cuenta.
- Las partes 2 y 3 agregan lo suyo: la condición de la transacción del token y
  `ADMIN_USER_PASSWORD_AUTH` con `adminUserPassword` en el app client.
