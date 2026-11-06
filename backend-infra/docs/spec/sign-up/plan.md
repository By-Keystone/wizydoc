# Plan: registro de usuarios

Spec: [spec.md](./spec.md) · Ticket: WIZ-72

## Flujo del registro

**Handler**
- `handlers/sign-up.handler.ts` es la entrada de la Lambda. Lee las variables
  de entorno, arma las piezas reales a nivel de módulo y delega en
  `handleSignUp`.
- `handlers/sign-up.http.ts` (`handleSignUp`) traduce HTTP y se prueba con
  dobles:
  1. Valida el cuerpo con el esquema que corresponde al flag
     (`signUpInputSchemaFor`). Un cuerpo que no es un objeto JSON responde 400
     con «La solicitud no es válida.»; una entrada inválida, con el primer
     mensaje.
  2. Lee la IP de `x-real-ip` con `readIpAddress`, que descarta lo que no sea
     una IP válida, y cuenta el pedido con `IEmailSendAttempts.tryRegister`. Si
     devuelve `false`, responde 429.
  3. Llama a `SignUpUseCase.execute` con la entrada, la IP y el `user-agent`, y
     responde 202. Ante cualquier error responde 500 y registra sólo el nombre
     del error, nunca su mensaje ni el cuerpo.

**Caso de uso (`application/sign-up.usecase.ts`)**
1. `findByEmail` consulta `GSI1` con `GSI1PK = USER_EMAIL#<correo>`.
   - Confirmado: `emails.sendAccountExists(user)` y termina.
   - Sin confirmar: crea un token, lo guarda con `saveConfirmationToken`,
     envía el aviso con el botón para confirmar
     (`emails.sendPendingConfirmation`) y termina.
2. `createUserIfAbsent` (`AdminCreateUser` con `SUPPRESS`, después
   `AdminSetUserPassword` con `Permanent: true`; si esto último falla, borra el
   usuario). Si devuelve `undefined`, deja un aviso en el log y termina sin
   enviar nada. Si Cognito no devuelve el `sub`, lanza un error.
3. `createUser` genera el ULID y `createConfirmationToken` genera el token. Con
   el flag encendido, `createTermsAcceptance` arma la constancia. El caso de
   uso recibe el flag en el constructor.
4. `users.create(user, token, termsAcceptance?)` escribe los ítems en un
   `TransactWriteCommand`, cada uno con `attribute_not_exists(PK)`. Si falla,
   borra el usuario de Cognito. Si ese borrado también falla, registra el `sub`
   y deja subir el error original.
5. `emails.sendConfirmation(user, token)`.

## Flujo del reenvío

`handlers/resend-confirmation.http.ts` valida el correo, cuenta el pedido con el
mismo `IEmailSendAttempts` y llama a `ResendConfirmationUseCase`
(`application/resend-confirmation.usecase.ts`). Si el usuario existe y no está
confirmado, el caso de uso crea y guarda un token nuevo y envía la confirmación;
si no, no hace nada. Siempre responde 202.

## Dominio (`lib/src/users/domain/`)

- **`value-objects/phone.vo.ts`:** valida y normaliza a `+51…` con las mismas
  reglas que `normalizePatientContact` de `api/`.
- **`confirmation-token.entity.ts`:** `createConfirmationToken(userId)` genera
  32 bytes con `crypto.randomBytes` (en base64url), su SHA-256 en hex y el
  vencimiento a 24 horas. El token en claro sólo existe en memoria, mientras se
  arma el enlace.
- **`terms-acceptance.entity.ts`:** `createTermsAcceptance` pone `acceptedAt`
  con el reloj del servidor, las versiones vigentes y `source = "sign-up"`, y
  recorta el `userAgent` a 512 caracteres.
- **`legal-documents.ts`:** las versiones vigentes. La de los términos es
  `2026-10-24`. La de la política es `sin-publicar` y tiene que pasar a la
  versión publicada antes de encender el flag.
- **La contraseña** se valida igual que Cognito: el mínimo se cuenta en
  caracteres reales (un emoji es uno), el máximo en unidades de UTF-16 y el
  patrón exige que no empiece ni termine con espacio y que no tenga saltos de
  línea. Así Cognito nunca rechaza una contraseña que el esquema aceptó, y un
  500 no revela que el correo era nuevo.

## Ítems de DynamoDB

| Ítem | `PK` | `SK` | `ItemType` | Otros atributos |
|---|---|---|---|---|
| Usuario | `USER#<ulid>` | `!` | `USER` | `GSI1PK = USER_EMAIL#<correo>`, `GSI2PK = COGNITO#<sub>` (sus `SK` en `!`) y los datos del usuario |
| Constancia de aceptación | `USER#<ulid>` | `TERMS_ACCEPTANCE#<acceptedAt ISO>` | `TERMS_ACCEPTANCE` | `Email`, `TermsVersion`, `PrivacyPolicyVersion`, `CheckboxTextVersion`, `AcceptedAt`, `IpAddress`, `UserAgent`, `Source` |
| Token de confirmación | `EMAIL_CONFIRMATION#<sha256>` | `!` | `EMAIL_CONFIRMATION` | `UserId`, `ExpiresAt`, `DeleteAfter` |
| Envíos de correo por IP | `EMAIL_SEND_ATTEMPTS#<ip o red /64>` | `<inicio de la ventana de 10 minutos, en segundos epoch>` | `EMAIL_SEND_ATTEMPTS` | `Attempts`, `DeleteAfter` |

- **`ItemType`** distingue los ítems en la tabla única. `findByEmail` sólo
  mapea los de tipo `USER`.

- **`USER_EMAIL#` y no `EMAIL#`:** `GSI1` es un índice genérico. Si otra
  entidad, como un paciente, usara `EMAIL#`, `findByEmail` podría leerla como
  usuario.
- **`DeleteAfter`** es el atributo de TTL de la tabla. DynamoDB borra con días
  de retraso, así que la confirmación igual revisa `ExpiresAt`. La constancia
  no lleva `DeleteAfter`, porque su plazo de conservación todavía no está
  decidido.
- **`tryRegister`** hace un `UpdateCommand` con `ADD Attempts :one` y la
  condición `attribute_not_exists(Attempts) OR Attempts < :maxAttempts`. Si la
  condición falla, devuelve `false`. Las IPv6 se agrupan por su red /64, las
  IPv4 mapeadas (`::ffff:1.2.3.4`) cuentan como su IPv4, y sin IP válida la
  clave es `EMAIL_SEND_ATTEMPTS#unknown`.

## Puertos y adaptadores

| Puerto | Implementación (`infrastructure/`) |
|---|---|
| `IIdentityProvider`: `createUserIfAbsent`, `deleteUser` | `identity-provider/cognito/cognito.ts` |
| `IUserRepository`: `findByEmail`, `create(user, token, termsAcceptance?)`, `saveConfirmationToken` | `persistence/dynamodb/user.repository.ts` |
| `ISignUpEmails`: `sendConfirmation(user, token)`, `sendPendingConfirmation(user, token)`, `sendAccountExists(user)` | `email/ses/sign-up-emails.ts`, con `SendEmailCommand` de `@aws-sdk/client-sesv2` |
| `IEmailSendAttempts`: `tryRegister(ip)` | `persistence/dynamodb/email-send-attempts.ts` |

**Plantillas de SES** (WIZ-73):
- **Los tres correos son plantillas de SES:** confirmación, intento con una
  cuenta sin confirmar e intento con una cuenta confirmada. Cada uno tiene su
  HTML y su texto plano en `lib/email-templates/`, con los colores y el texto
  de `confirm-email.mjml` de `api/`.
- **CDK las crea al sintetizar** (`lib/sign-up-email-templates.ts`, recursos
  `AWS::SES::Template`), con nombres que empiezan con el nombre del stack para
  que dos stacks no choquen.
- **El adaptador** envía con `Content.Template`: el nombre de la plantilla y los
  datos (`name`, `escapedName`, los enlaces y `linkLifetimeHours`).
- **SES no escapa el HTML de los datos** («SES doesn't escape HTML content when
  rendering the HTML template»). Por eso el adaptador manda `escapedName` para
  el HTML y `name` para el texto plano, y una prueba revisa que cada plantilla
  use el que le corresponde.

## Infraestructura

- `lib/dynamo.ts`: `timeToLiveAttribute: "DeleteAfter"`.
- `lib/authentication.ts` expone el `userPool`, y `lib/api-gateway.ts` expone
  el `api`.
- `lib/backend-stack.ts`:
  - instancia `DynamoTables`;
  - crea un `NodejsFunction` (Node 22, arm64, 15 segundos, 512 MB) por handler,
    con `TABLE_NAME`, `FRONTEND_URL`, `EMAIL_FROM`, los nombres de las
    plantillas (`CONFIRM_EMAIL_TEMPLATE`, `PENDING_CONFIRMATION_TEMPLATE` y
    `ACCOUNT_EXISTS_TEMPLATE`), `NODE_OPTIONS` para los source maps y, en el
    registro, `USER_POOL_ID` y `TERMS_ACCEPTANCE_REQUIRED`. Sus logs se
    conservan un mes;
  - **permisos del registro:**
    - `dynamodb:PutItem` y `UpdateItem` sólo sobre ítems cuya clave empiece con
      `USER#`, `EMAIL_CONFIRMATION#` o `EMAIL_SEND_ATTEMPTS#`, con la condición
      `dynamodb:LeadingKeys`;
    - `dynamodb:Query` sólo sobre `index/GSI1`;
    - `cognito-idp:AdminCreateUser`, `AdminSetUserPassword` y
      `AdminDeleteUser` sobre el user pool. Cognito no permite acotarlos a un
      usuario, así que la Lambda del registro puede cambiar la contraseña de
      cualquiera;
    - `ses:SendEmail` sobre la identidad de `DOMAIN` y sobre sus tres
      plantillas. El reenvío sólo puede usar la de confirmación;
  - **permisos del reenvío:** los mismos de DynamoDB, sin `USER#`, y los de SES,
    sin Cognito;
  - registra `POST /api/auth/sign-up/email` y
    `POST /api/auth/sign-up/resend-confirmation`.
- `bin/backend-infra.ts` exige `FRONTEND_URL` y `EMAIL_FROM`, y lee
  `TERMS_ACCEPTANCE_REQUIRED`, que sólo con `"true"` se enciende. En local
  llegan de `.env` (ver `.env.example`), y en GitHub Actions del entorno.

**Sin verificar contra AWS:** que `dynamodb:LeadingKeys` se aplique a cada
`Put` de la transacción, y los tiempos reales de cada camino.

**Dependencias nuevas,** aprobadas por el humano: `@aws-sdk/client-sesv2`, y
como devDependencies `esbuild` (empaqueta las Lambdas) y `dotenv-cli` (carga
`.env`).

## PR

La spec y la implementación van en un solo PR, decidido el 6 de noviembre de
2026. El primer despliegue espera a la confirmación del correo y a SES fuera
del sandbox, y encender `TERMS_ACCEPTANCE_REQUIRED` espera a la lista «Antes de
encender la aceptación de los términos» de la spec.

## Cobertura de los criterios

| Criterio | Prueba (`test/`) |
|---|---|
| Correo nuevo: usuario sin confirmar en Cognito y DynamoDB | `users/sign-up.usecase.test.ts` y `users/dynamodb.test.ts` |
| Correo y teléfono normalizados | `users/sign-up.usecase.test.ts` y `users/sign-up-input.test.ts` |
| Correo de confirmación con el token en el fragmento, guardado con hash y TTL | `users/sign-up.usecase.test.ts`, `users/dynamodb.test.ts` y `users/sign-up-emails.test.ts` |
| Constancia completa en la misma transacción | `users/sign-up.usecase.test.ts`, `users/sign-up.http.test.ts` y `users/dynamodb.test.ts` |
| Correo confirmado: aviso que recomienda cambiar la contraseña, y nada más | `users/sign-up.usecase.test.ts` y `users/sign-up-emails.test.ts` |
| Correo sin confirmar: aviso con el botón para confirmar, sin cambiar nada | `users/sign-up.usecase.test.ts` y `users/sign-up-emails.test.ts` |
| Correo sólo en Cognito: nada guardado ni enviado | `users/sign-up.usecase.test.ts` y `users/cognito.test.ts` |
| Respuesta idéntica en los cuatro casos | `users/sign-up.http.test.ts` |
| Fallo de DynamoDB o de la contraseña: se borra de Cognito | `users/sign-up.usecase.test.ts` y `users/cognito.test.ts` |
| Fallo del correo y reintento | `users/sign-up.usecase.test.ts` y `users/sign-up.http.test.ts` |
| Entrada inválida: 400 en español, sin llamadas ni límite | `users/sign-up-input.test.ts` y `users/sign-up.http.test.ts` |
| Versiones que no son las vigentes | `users/sign-up-input.test.ts` y `users/sign-up.http.test.ts` |
| Flag apagado | `users/sign-up-input.test.ts`, `users/sign-up.usecase.test.ts` y `backend-stack.test.ts` |
| Reenvío | `users/resend-confirmation.test.ts` |
| Límite por IP | `users/sign-up.http.test.ts`, `users/resend-confirmation.test.ts` y `users/dynamodb.test.ts` |
| Ni contraseña ni token en claro | `users/sign-up.usecase.test.ts`, `users/dynamodb.test.ts` y `users/sign-up.http.test.ts` |
| Clave de platform en las dos rutas | `backend-stack.test.ts` |

Contra AWS real quedan sin verificar la creación en Cognito y DynamoDB, el
envío con SES y el límite por IP, hasta el primer despliegue.
