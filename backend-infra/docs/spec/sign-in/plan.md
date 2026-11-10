# Plan: iniciar sesión, renovar la sesión y cerrarla

Spec: [spec.md](./spec.md) · Ticket: WIZ-78 (primera de sus dos specs) · Sigue
a [../sign-up-code/plan.md](../sign-up-code/plan.md), que dejó listos el app
client `wizydoc-platform` y `CognitoSessionProvider`.

## Partes

Cada parte se puede mergear sola sin romper `main`: sólo agregan rutas y
Lambdas, y el cambio del app client lo actualiza en el lugar, sin cambiar su id
ni su secreto. Los tamaños son de código de producción, sin pruebas ni docs.

| Parte | Qué entrega | Tamaño estimado |
|---|---|---|
| 1 | Este plan, que va en el PR de la parte 2: `backend-infra/docs/spec/sign-in/plan.md`. | 0 líneas de código |
| 2 | `POST /api/auth/sign-in`: el app client con tokens de 15 minutos y refresh token de 15 días, la ventana configurable del límite por IP, `isConfirmed` por `GSI2`, `signIn` y `revoke` en el adaptador, el caso de uso con su piso de tiempo, el handler, la Lambda y sus permisos. | ~360 líneas |
| 3 | `POST /api/auth/token/refresh` y `POST /api/auth/sign-out`: `refresh` en el adaptador, `revoke` que acepta tokens que ya no sirven, dos casos de uso, cuatro handlers, dos Lambdas, las rutas y sus permisos. | ~290 líneas |

- **La parte 2 sale de `origin/main`** y lleva este plan. **La 3
  se apila sobre la 2 con `gh stack`**: toca los mismos archivos (el puerto, el
  adaptador, `backend-stack.ts`, `http-messages.ts` y sus pruebas).
- **Orden de despliegue:** ninguna parte necesita a otra desplegada antes. El
  login de platform detrás de `BACKEND` (fuera de alcance) va después de la
  parte 3, porque sin renovar la sesión duraría 15 minutos.

### Archivos de la parte 2

Producción (`backend-infra/`):
- `lib/authentication.ts`: `idTokenValidity` y `accessTokenValidity` de 15
  minutos, `refreshTokenValidity` de 15 días.
- `lib/backend-stack.ts`: `SignInFunction`, sus permisos, la ruta y
  `grantIndexQuery` en lugar de `grantUserEmailLookup`.
- `lib/src/shared/http/api-gateway.ts`: `HTTP_STATUS.UNAUTHORIZED`.
- `lib/src/users/application/ports/session-provider.port.ts`: `signIn` y
  `revoke`.
- `lib/src/users/application/sign-in.usecase.ts` (nuevo).
- `lib/src/users/application/confirm-sign-up.usecase.ts`: recibe
  `Pick<ISessionProvider, "start">`. Es la única línea que cambia.
- `lib/src/users/domain/repository/user.repository.ts`: `isConfirmed`.
- `lib/src/users/domain/value-objects/password.vo.ts`: exporta
  `MAXIMUM_PASSWORD_LENGTH`.
- `lib/src/users/infrastructure/identity-provider/cognito/cognito-session.ts`:
  `signIn` y `revoke`.
- `lib/src/users/infrastructure/persistence/dynamodb/ip-rate-limit.ts`:
  `windowSeconds` y `SIGN_IN_RATE_LIMIT`.
- `lib/src/users/infrastructure/persistence/dynamodb/user.repository.ts`:
  `isConfirmed`.
- `lib/src/users/handlers/http-messages.ts`: `INVALID_CREDENTIALS` y
  `SIGN_IN_FAILED`.
- `lib/src/users/handlers/sign-in.http.ts` y `sign-in.handler.ts` (nuevos).

Pruebas: `test/users/sign-in.test.ts` (nuevo), `test/users/fakes.ts`,
`test/users/cognito-session.test.ts`, `test/users/dynamodb.test.ts`,
`test/authentication.test.ts`, `test/backend-stack.test.ts` y
`test/api-gateway.test.ts`.

### Archivos de la parte 3

Producción (`backend-infra/`):
- `lib/backend-stack.ts`: `RefreshSessionFunction`, `SignOutFunction`, sus
  permisos y sus rutas.
- `lib/src/users/application/ports/session-provider.port.ts`: `refresh`.
- `lib/src/users/domain/value-objects/refresh-token.vo.ts` (nuevo).
- `lib/src/users/application/refresh-session.usecase.ts` y
  `sign-out.usecase.ts` (nuevos).
- `lib/src/users/infrastructure/identity-provider/cognito/cognito-session.ts`:
  `refresh`, y `revoke` acepta los tokens que ya no sirven.
- `lib/src/users/handlers/http-messages.ts`: `SESSION_EXPIRED`,
  `SESSION_REFRESH_FAILED` y `SIGN_OUT_FAILED`.
- `lib/src/users/handlers/refresh-session.http.ts`,
  `refresh-session.handler.ts`, `sign-out.http.ts` y `sign-out.handler.ts`
  (nuevos).

Pruebas: `test/users/refresh-session.test.ts` y `test/users/sign-out.test.ts`
(nuevos), `test/users/fakes.ts`, `test/users/cognito-session.test.ts` y
`test/backend-stack.test.ts`.

## Decisiones

### Iniciar sesión sin que el tiempo delate si el correo tiene cuenta

- **Se llama siempre a Cognito con el correo, y antes no se lee nada.**
  `AdminInitiateAuth` con `ADMIN_USER_PASSWORD_AUTH` y `USERNAME` = el correo
  ya normalizado. El pool tiene el correo como *username attribute*
  (`signInAliases: { email: true }` emite `UsernameAttributes: ["email"]`, y
  `authentication.test.ts` lo fija), así que Cognito acepta el correo como
  usuario. Un correo sin cuenta y uno con cuenta hacen exactamente el mismo
  trabajo de nuestro lado: un `UpdateItem` del límite y una llamada a Cognito.
- **El `SECRET_HASH` se calcula con el correo,** el mismo valor que va en
  `USERNAME`. La documentación lo permite: para iniciar sesión, el usuario del
  hash puede ser cualquier atributo de inicio de sesión del pool. Sólo
  `REFRESH_TOKEN_AUTH` exige el `sub` (ver «Renovar»).
- **Descartados:** usar el `sub` como `USERNAME` obliga a leer DynamoDB por
  correo antes, y un correo sin cuenta no tiene `sub` con qué llamar a Cognito;
  `AdminGetUser` suma una llamada que responde distinto si el usuario existe, y
  un permiso más.
- **Después de Cognito, el usuario se identifica por su `sub`, no por el
  correo.** El adaptador lo lee del payload del ID token que Cognito acaba de
  entregar, sin verificar la firma: llega en la respuesta a nuestra llamada
  firmada con SigV4, no de platform. Se valida como texto no vacío, sin exigir
  formato de UUID (la documentación pide no validar el formato del `sub`). Si
  falta, el adaptador lanza un error sin valores y la ruta responde 500.
- **`confirmed` se lee por el `sub`:** `isConfirmed(cognitoSub)` es un `Query`
  sobre `GSI2` con `GSI2PK = COGNITO#<sub>`, `Limit: 1` y una proyección de
  `ItemType` y `Confirmed`, igual que `existsByEmail` sobre `GSI1`. Es `true`
  sólo si `ItemType = USER` y `Confirmed = true`. Un usuario de Cognito sin su
  ítem en DynamoDB cuenta como no confirmado.
- **Sin confirmar, se revoca el refresh token recién emitido** con
  `RevokeToken` y se responde 401. Ningún token sale de la Lambda. Si la
  revocación falla, se registra sólo `errorName(error)` y se responde 401
  igual: el token no se entregó a nadie. Se deja un `console.warn` sin datos
  personales.
- **Los tres rechazos tardan lo mismo: un piso de 1 segundo.** Cognito no
  documenta que un correo sin cuenta y una contraseña incorrecta tarden lo
  mismo, y una cuenta sin confirmar con la contraseña correcta hace más trabajo
  (Cognito, el `Query` y `RevokeToken`). Por eso todo inicio de sesión
  rechazado (401) responde no antes de `MINIMUM_REJECTED_SIGN_IN_MILLISECONDS`
  (1 000 ms) desde que empieza el caso de uso. El 200, el 429 y el 500 no
  esperan: el 200 y el bloqueo ya se distinguen por el código, y el 500 no
  depende de que exista la cuenta. El reloj (`nowInMilliseconds`) y la espera
  (`wait`, por defecto `setTimeout` de `node:timers/promises`) se inyectan, como
  el reloj del límite por IP. El valor se confirmó en la cuenta de desarrollo
  (ver «Verificado contra AWS»).

### Los errores de Cognito al iniciar sesión

| Respuesta de `AdminInitiateAuth` | El adaptador devuelve | La ruta responde |
|---|---|---|
| `AuthenticationResult` con los cuatro valores | `{ kind: "accepted", cognitoSub, session }` | 200 si la cuenta está confirmada; si no, 401 |
| `NotAuthorizedException` con el mensaje `Password attempts exceeded` | `{ kind: "locked-out" }` | 429 |
| `NotAuthorizedException` con `Incorrect username or password.` o `User is disabled.` | `{ kind: "rejected" }` | 401 |
| `NotAuthorizedException` con otro mensaje | `{ kind: "rejected" }`, con un `console.warn` fijo sin el mensaje | 401 |
| Un error al leer el secreto con `DescribeUserPoolClient`, que corre antes y fuera del mapeo | lo deja subir | 500 |
| Un `ChallengeName` o tokens incompletos | lanza un error sin valores | 500 |
| Cualquier otro error (`TooManyRequestsException`, `InternalErrorException`…) | lo deja subir | 500 |

- **Correo sin cuenta:** con `preventUserExistenceErrors` encendido,
  `ADMIN_USER_PASSWORD_AUTH` responde `NotAuthorizedException` «Incorrect
  username or password» en lugar de `UserNotFoundException`, y suprime por
  completo la existencia de usuarios con *username attributes*. Por eso
  `UserNotFoundException` no se mapea: `authentication.test.ts` ya fija
  `PreventUserExistenceErrors: ENABLED`.
- **Bloqueo:** Cognito bloquea a la cuenta después de 5 fallos con su
  contraseña, también por las operaciones autorizadas con IAM, y mientras dura
  responde «Password attempts exceeded» aunque la contraseña sea correcta. Se
  reconoce por ese mensaje, el único que lo distingue. La documentación avisa
  que el comportamiento puede cambiar. Si el mensaje cambia, el bloqueo
  responde 401 en lugar de 429, y tampoco entrega tokens.
- **Un correo con cuenta y bloqueado da 429, y uno sin cuenta nunca.** Es el
  riesgo aceptado en la spec.

### El límite de 5 intentos por minuto por IP

- **Se reutiliza `DynamoDBIpRateLimit`.** Su ventana deja de ser una constante
  del módulo: `IpRateLimitSettings` gana `windowSeconds`, que vale `600` en
  `EMAIL_SEND_RATE_LIMIT` y `SIGN_UP_VERIFY_RATE_LIMIT` (sin cambio de
  comportamiento) y `60` en el nuevo `SIGN_IN_RATE_LIMIT` (`itemType:
  "SIGN_IN_ATTEMPTS"`, `maxAttempts: 5`).
- **El ítem** es el de «Ítems de DynamoDB»: el mismo `UpdateItem` con
  `ADD Attempts :one`, condicionado a `Attempts < :maxAttempts`, con
  `DeleteAfter` = fin del minuto como TTL. Cada minuto tiene su `SK`, así que
  no importa que el TTL borre días después.
- **Ventana fija, como los otros dos límites:** en el cambio de minuto pueden
  pasar hasta 10 intentos seguidos. Lo acota el bloqueo de Cognito, que es por
  cuenta.
- **Orden en el handler, como en el registro:** primero se valida la entrada
  (un 400 no cuenta), después se cuenta el intento y recién después se llama al
  caso de uso. Así el sexto intento responde 429 sin llegar a Cognito. Sin
  `x-real-ip`, el intento cuenta en el cupo `unknown`.

### Renovar sin rotación: `GetTokensFromRefreshToken`

| | `GetTokensFromRefreshToken` | `AdminInitiateAuth` con `REFRESH_TOKEN_AUTH` |
|---|---|---|
| Qué pide | `ClientId`, `RefreshToken` y `ClientSecret` | `REFRESH_TOKEN` y `SECRET_HASH`, calculado con el `sub` porque el pool no tiene `username` como atributo de inicio de sesión |
| Permiso de IAM | Ninguno: lo autoriza el propio refresh token | `cognito-idp:AdminInitiateAuth` |
| Sin rotación | Devuelve ID token y access token nuevos; el refresh token sigue sirviendo | Igual |
| Token vencido, revocado o inválido | `NotAuthorizedException` | `NotAuthorizedException` |

- **Se usa `GetTokensFromRefreshToken`.** `REFRESH_TOKEN_AUTH` necesita el
  `sub`, y la spec sólo recibe el refresh token, que Cognito entrega cifrado y
  no se puede leer. Además, la Lambda de renovar no necesita ningún permiso de
  Cognito salvo leer el secreto.
- **Mapeo:** con `IdToken`, `AccessToken` y `ExpiresIn` devuelve
  `{ idToken, accessToken, expiresIn }`, y si Cognito mandara un `RefreshToken`
  se ignora (la rotación está apagada y una prueba de síntesis lo fija);
  `NotAuthorizedException` devuelve `undefined` (401); tokens incompletos
  lanzan un error sin valores; cualquier otro error sube (500).
- **Renovar no lee DynamoDB,** como pide la spec: la Lambda no tiene
  `TABLE_NAME` ni permisos sobre la tabla.
- **El pool no recuerda dispositivos** (CDK no configura `DeviceConfiguration`).
  Si lo hiciera, `GetTokensFromRefreshToken` exigiría la clave del
  dispositivo. `authentication.test.ts` lo fija.

### Cerrar la sesión: `RevokeToken`

- **`RevokeToken` con `ClientId`, `ClientSecret` y `Token`.** No se autoriza
  con IAM: lo autoriza el refresh token, más el secreto porque el cliente lo
  tiene. Revoca ese refresh token y los access tokens que emitió, y no toca los
  de otros dispositivos.
- **Mapeo:** éxito → 204; `UnsupportedTokenTypeException` (el token no es un
  refresh token, por ejemplo un access token) → 204, porque no había sesión que
  cerrar; cualquier otro error → 500, porque el token puede seguir vigente.
- **Un token ya revocado o que no es válido:** el endpoint `/oauth2/revoke`
  responde 200 en esos casos. La referencia de `RevokeToken` no lo dice, y
  tampoco qué pasa con uno vencido. Se espera lo mismo que en el endpoint y se
  comprueba en la cuenta de desarrollo. Si Cognito respondiera con un error
  propio de esos casos, se agrega al mapeo de 204 en la misma parte, sin cambiar
  la spec.
- **En la parte 2, `revoke` sólo lo usa el inicio de sesión** con un token
  recién emitido, así que deja subir todo error. La parte 3 le agrega la
  tolerancia del cierre de sesión.

### Un refresh token con caracteres que Cognito no acepta (parte 3)

`GetTokensFromRefreshToken` y `RevokeToken` exigen el patrón
`[A-Za-z0-9-_=.]+`, y fuera de él responden `InvalidParameterException`, que
también puede venir de una mala configuración. Para no confundirlos, el
adaptador revisa el patrón antes de llamar: si no lo cumple, `refresh` devuelve
`undefined` (401) y `revoke` termina sin hacer nada (204), sin llegar a
Cognito. `InvalidParameterException` sigue respondiendo 500. No se pone un
largo máximo: la referencia no lo define, y un token enorme sólo puede venir de
quien lo fabrica.

La entrada de las dos rutas valida sólo que `refreshToken` sea texto no vacío
(`refreshTokenSchema` en `domain/value-objects/refresh-token.vo.ts`, con marca
`RefreshTokenVO`), como pide la spec.

### El app client

- **`idTokenValidity` y `accessTokenValidity` = `Duration.minutes(15)`,
  `refreshTokenValidity` = `Duration.days(15)`.** CDK los emite en minutos
  (`IdTokenValidity: 15`, `AccessTokenValidity: 15`,
  `RefreshTokenValidity: 21600` y `TokenValidityUnits` en `minutes`) y valida
  que estén entre 5 minutos y un día (ID y access) y entre 60 minutos y 10 años
  (refresh). `ExpiresIn` de Cognito pasa a ser 900, que es el `expiresIn` de la
  spec. La constante sigue llamándose `REFRESH_TOKEN_VALIDITY`, porque platform
  la cita en `lib/auth/cognito-session.ts`.
- **Sin rotación:** CDK sólo emite `RefreshTokenRotation` si se le da
  `refreshTokenRotationGracePeriod`, que no se usa. Sin la propiedad, Cognito
  deja la rotación apagada.
- **Las sesiones ya emitidas siguen funcionando.** CloudFormation actualiza
  `IdTokenValidity`, `AccessTokenValidity`, `RefreshTokenValidity` y
  `TokenValidityUnits` sin reemplazar el cliente (*No interruption*); sólo
  `GenerateSecret` y `UserPoolId` lo reemplazan. El id y el secreto no cambian.
  Los ID y access tokens ya emitidos llevan su `exp` firmado y duran hasta una
  hora más. La documentación no dice si un refresh token ya emitido conserva
  sus 30 días o pasa a 15; no hace falta comprobarlo, porque platform de
  producción sigue con Better Auth y este cliente todavía no emitió sesiones de
  usuarios reales.
- **El registro también abre sesiones de 15 días** desde que se despliega la
  parte 2, porque usa el mismo cliente.

### El secreto del cliente

- Se mantiene la decisión del plan del registro: `CognitoSessionProvider` lo
  lee con `DescribeUserPoolClient` la primera vez y lo guarda sólo en memoria.
  Ahora lo necesitan cuatro Lambdas: la confirmación y el inicio de sesión
  (`SECRET_HASH`), y la renovación y el cierre (`ClientSecret`, porque el
  cliente tiene secreto). La condición del plan del registro pasa a ser «sólo
  las Lambdas que inician, renuevan o cierran sesiones».
- **Cuota:** `DescribeUserPoolClient` tiene 15 pedidos por segundo por cuenta y
  5 por pool, y no se puede ampliar. Se llama una vez por instancia de Lambda,
  y el SDK reintenta `TooManyRequestsException` (3 intentos). Con el tráfico de
  la beta no se acerca. Ver «Riesgos aceptados del plan».

## Flujos

### `POST /api/auth/sign-in` (parte 2)

**`handlers/sign-in.http.ts` (`handleSignIn`)**, con
`{ signInRateLimit: IIpRateLimit, signIn: Pick<SignInUseCase, "execute"> }`:
1. `signInInputSchema.safeParse(parseJsonBody(event.body))`. Si falla, 400 con
   el primer error, o «La solicitud no es válida.» si el cuerpo no es un objeto
   JSON. No cuenta para el límite.
2. `signInRateLimit.tryRegister(readIpAddress(event))`. Si devuelve `false`,
   429 con `TOO_MANY_ATTEMPTS`, sin llamar al caso de uso.
3. `signIn.execute(parsed.data)`: `signed-in` → `noStoreJsonResponse(session)`
   (`{ idToken, accessToken, refreshToken, expiresIn }`, sin el `sub`);
   `rejected` → 401 con `INVALID_CREDENTIALS` («Correo o contraseña
   incorrectos.»); `locked-out` → 429 con `TOO_MANY_ATTEMPTS`.
4. Ante cualquier error, 500 con `SIGN_IN_FAILED` («No pudimos iniciar tu
   sesión. Intenta de nuevo.») y `console.error("[sign-in] falló el inicio de
   sesión:", errorName(error))`. Nunca el correo, la contraseña, los tokens ni
   el mensaje del error.

**`handlers/sign-in.handler.ts`** lee `TABLE_NAME`, `USER_POOL_ID` y
`PLATFORM_CLIENT_ID`, y arma a nivel de módulo `DynamoDBIpRateLimit` con
`SIGN_IN_RATE_LIMIT` y `SignInUseCase` con `CognitoSessionProvider` y
`UserRepository`.

**`application/sign-in.usecase.ts`**
- `signInInputSchema = z.object({ email: emailSchema, password }, { error:
  INVALID_REQUEST })`, donde `password` es `z.string()` con `.min(1)` y
  `.max(MAXIMUM_PASSWORD_LENGTH)`, todos con `PASSWORD_REQUIRED` («Escribe tu
  contraseña.»). No usa `passwordSchema`: una contraseña que no cumple las
  reglas del registro simplemente no coincide.
- `SignInUseCase` recibe `Pick<ISessionProvider, "signIn" | "revoke">`,
  `Pick<IUserRepository, "isConfirmed">`, `nowInMilliseconds` y `wait`.
  `execute({ email, password })`:
  1. Toma la hora de inicio y llama a `sessions.signIn({ email, password })`.
  2. `locked-out` → devuelve `{ kind: "locked-out" }`.
  3. `accepted` y `users.isConfirmed(cognitoSub)` → devuelve
     `{ kind: "signed-in", session }`.
  4. `accepted` sin confirmar → revoca `session.refreshToken` (si falla, sólo
     registra el nombre del error) y sigue como un rechazo.
  5. Rechazo → espera hasta la hora de inicio más
     `MINIMUM_REJECTED_SIGN_IN_MILLISECONDS` (nada si ya pasó) y devuelve
     `{ kind: "rejected" }`.
  Si `isConfirmed` falla, el error sube (500) y el token no se entrega.

### `POST /api/auth/token/refresh` (parte 3)

**`handlers/refresh-session.http.ts` (`handleRefreshSession`)**, con
`{ refreshSession: Pick<RefreshSessionUseCase, "execute"> }`:
1. `refreshSessionInputSchema.safeParse(...)`; si falla, 400 con «La solicitud
   no es válida.».
2. `refreshSession.execute(parsed.data)`: con tokens →
   `noStoreJsonResponse({ idToken, accessToken, expiresIn })`; `undefined` →
   401 con `SESSION_EXPIRED` («Tu sesión venció. Inicia sesión de nuevo.»).
3. Ante cualquier error, 500 con `SESSION_REFRESH_FAILED` («No pudimos renovar
   tu sesión. Intenta de nuevo.») y sólo `errorName(error)` en el log.

**`refresh-session.handler.ts`** lee `USER_POOL_ID` y `PLATFORM_CLIENT_ID`. Sin
DynamoDB.

**`application/refresh-session.usecase.ts`**: `refreshSessionInputSchema =
z.object({ refreshToken: refreshTokenSchema }, { error: INVALID_REQUEST })` y
`RefreshSessionUseCase`, que delega en `sessions.refresh`. El caso de uso no
decide nada: existe para que el esquema viva con su caso de uso, como en el
resto del módulo, y el handler no dependa del adaptador.

### `POST /api/auth/sign-out` (parte 3)

**`handlers/sign-out.http.ts` (`handleSignOut`)**, con
`{ signOut: Pick<SignOutUseCase, "execute"> }`:
1. `signOutInputSchema.safeParse(...)`; si falla, 400 con «La solicitud no es
   válida.».
2. `signOut.execute(parsed.data)` → `noContentResponse()` (204).
3. Ante cualquier error, 500 con `SIGN_OUT_FAILED` («No pudimos cerrar tu
   sesión. Intenta de nuevo.») y sólo `errorName(error)` en el log.

**`sign-out.handler.ts`** lee `USER_POOL_ID` y `PLATFORM_CLIENT_ID`. Sin
DynamoDB. **`application/sign-out.usecase.ts`**: `signOutInputSchema` y
`SignOutUseCase`, que delega en `sessions.revoke`.

## Puertos y adaptadores

| Puerto | Cambio | Implementación |
|---|---|---|
| `ISessionProvider` | Parte 2: `signIn({ email, password })` → `SignInAttempt` (`accepted` con `cognitoSub` y `session`, `rejected` o `locked-out`) y `revoke(refreshToken)`. Parte 3: `refresh(refreshToken)` → `RefreshedSession \| undefined`, con `RefreshedSession = Omit<Session, "refreshToken">`. `start` no cambia. | `infrastructure/identity-provider/cognito/cognito-session.ts`. `start` y `signIn` comparten un `authenticate(username, password)` privado; los cuatro métodos usan `readClientSecret`. |
| `IUserRepository` | Parte 2: `isConfirmed(cognitoSub)`. | `infrastructure/persistence/dynamodb/user.repository.ts`, con `gsi2pk` de `user.schema.ts`. |
| `IIpRateLimit` | Sin cambio. `IpRateLimitSettings` gana `windowSeconds`, y se agrega `SIGN_IN_RATE_LIMIT`. | `infrastructure/persistence/dynamodb/ip-rate-limit.ts` |

Cada caso de uso recibe sólo los métodos que usa (`Pick<…>`), así
`RecordingSessions`, el doble de la confirmación, pasa a implementar
`Pick<ISessionProvider, "start">` y no cambia nada más.

## Ítems de DynamoDB

| Ítem | `PK` | `SK` | `ItemType` | Otros atributos |
|---|---|---|---|---|
| Intentos de inicio de sesión por IP (parte 2) | `SIGN_IN_ATTEMPTS#<ip o red /64>` | `<inicio del minuto, segundos epoch>` | `SIGN_IN_ATTEMPTS` | `Attempts`, `DeleteAfter` (TTL: fin del minuto) |

- **Guarda un dato que no está en ninguna parte:** cuántos intentos hizo una IP
  en un minuto. La agrupación por IP, la red /64 de IPv6 y el cupo `unknown`
  son los de los otros límites.
- **Se lee, sin cambios en el ítem:** el usuario por `GSI2`
  (`GSI2PK = COGNITO#<sub>`, `GSI2SK = "!"`). `GSI2` no admite lectura
  consistente; ver «Riesgos aceptados del plan».
- Renovar y cerrar la sesión no leen ni escriben la tabla.

## Infraestructura

`lib/backend-stack.ts`, las tres con `usersFunction` (Node 22, arm64, 15 s,
512 MB, logs un mes) y descripción en inglés:

| Lambda | Handler | Descripción | Entorno |
|---|---|---|---|
| `SignInFunction` (parte 2) | `sign-in` | «Signs a confirmed user in with email and password, and returns the Cognito tokens.» | `TABLE_NAME`, `USER_POOL_ID`, `PLATFORM_CLIENT_ID` |
| `RefreshSessionFunction` (parte 3) | `refresh-session` | «Returns new ID and access tokens for a valid refresh token.» | `USER_POOL_ID`, `PLATFORM_CLIENT_ID` |
| `SignOutFunction` (parte 3) | `sign-out` | «Signs the user out of one device by revoking its refresh token.» | `USER_POOL_ID`, `PLATFORM_CLIENT_ID` |

**Permisos exactos**
- `SignInFunction`: `cognito-idp:AdminInitiateAuth` y
  `cognito-idp:DescribeUserPoolClient` sobre el pool;
  `dynamodb:UpdateItem` con `dynamodb:LeadingKeys` en `SIGN_IN_ATTEMPTS#*`
  (`SIGN_IN_ACCESS`); `dynamodb:Query` sólo sobre `index/GSI2`. Nada de SES,
  `GSI1`, `GetItem`, `PutItem` ni `DeleteItem`. `RevokeToken` no lleva permiso
  porque Cognito no evalúa IAM en esa operación.
- `RefreshSessionFunction` y `SignOutFunction`: sólo
  `cognito-idp:DescribeUserPoolClient` sobre el pool. `GetTokensFromRefreshToken`
  y `RevokeToken` no se autorizan con IAM. Nada de DynamoDB ni SES.
- `grantUserEmailLookup` pasa a ser `grantIndexQuery(usersFunction, table,
  indexName)`, con `USER_EMAIL_INDEX = "GSI1"` y
  `USER_COGNITO_SUB_INDEX = "GSI2"`: ya son tres Lambdas que consultan un
  índice. Como la de `GSI1`, la de `GSI2` no lleva `dynamodb:LeadingKeys`.
- `AdminInitiateAuth` y `DescribeUserPoolClient` no pasan a las Lambdas del
  código de registro, y `AdminInitiateAuth` no pasa a renovar ni a cerrar.

**Rutas:** `resourceForPath("api/auth")` gana `sign-in` (parte 2),
`token/refresh` y `sign-out` (parte 3), todas `POST` con `LambdaIntegration`.
Como toda ruta del gateway, exigen la clave de platform
(`defaultMethodOptions.apiKeyRequired`). La revisión de la etapa de #149 no
cambia: sólo actúa cuando se quitan rutas.

**Logs:** ningún handler registra el evento ni el cuerpo, y la etapa del
gateway sigue sin `dataTraceEnabled`, así que ni la contraseña ni los tokens
llegan a CloudWatch. El log de acceso no guarda la ruta (`api-gateway.ts`).

`lib/dynamo.ts`: sin cambios; `DeleteAfter` ya es el TTL.

## Pruebas

Con el estilo de `test/`: los handlers se prueban con el caso de uso real y
dobles en memoria; los adaptadores, con clientes que registran los comandos;
la infraestructura, con síntesis de CDK.

**Dobles nuevos en `test/users/fakes.ts`**
- `InMemoryCognitoSessions` implementa `signIn` y `revoke` (parte 2) y
  `refresh` (parte 3): cuentas por correo con su `sub` y su contraseña, cuentas
  bloqueadas, refresh tokens emitidos, revocados y vencidos, y `failOnRevoke`.
  Registra el `USERNAME` que recibe y los tokens que revoca, y entrega
  `expiresIn: 900`. Las pruebas de renovar y cerrar comparten una instancia,
  así cerrar y después renovar se prueba de punta a punta.
- `InMemoryUsers` gana `isConfirmed`.
- `FakeClock`: un reloj que los dobles adelantan con latencias distintas por
  camino y que `wait` adelanta lo pedido, para probar el piso de tiempo sin
  esperar.
- `idTokenFor(sub)`: un JWT de prueba con el `sub` en el payload, para el
  adaptador.

**Otras pruebas, además de los criterios**
- Una entrada inválida en el inicio de sesión responde 400 en español sin
  contar para el límite ni llegar a Cognito; un cuerpo que no es un objeto JSON
  responde 400 con «La solicitud no es válida.» en las tres rutas.
- Si falla Cognito o DynamoDB, iniciar sesión responde 500; si falla Cognito,
  renovar responde 500.
- Un rechazo que ya tardó más que el piso no espera más; el 200 no espera.
- Sin `x-real-ip`, los intentos de iniciar sesión cuentan en el cupo
  compartido.
- Los límites de envíos y de verificación conservan su ventana de 10 minutos.
- Cognito no recibe ningún comando si el refresh token tiene caracteres fuera
  de su patrón.

## Cobertura de los criterios

Prueba en `test/`. Entre paréntesis, la parte.

| Criterio | Prueba |
|---|---|
| Iniciar sesión con el correo y la contraseña de una cuenta confirmada responde 200 con los tokens de Cognito y `expiresIn` de 900 segundos | `users/sign-in.test.ts`: «iniciar sesión con el correo y la contraseña de una cuenta confirmada responde 200 con los tokens de Cognito y expiresIn de 900 segundos». `users/cognito-session.test.ts`: «inicia la sesión con el correo como USERNAME y el SECRET_HASH calculado con el correo, y devuelve el sub del ID token con los tokens». `authentication.test.ts` (los 15 minutos). (2) |
| El correo se recorta y se pasa a minúsculas antes de buscar la cuenta | `users/sign-in.test.ts`: «el correo se recorta y se pasa a minúsculas antes de buscar la cuenta». (2) |
| Un correo sin cuenta, una contraseña incorrecta y una cuenta sin confirmar responden 401 con el mismo mensaje | `users/sign-in.test.ts`: «un correo sin cuenta, una contraseña incorrecta y una cuenta sin confirmar responden 401 con el mismo mensaje» y «un correo sin cuenta, una contraseña incorrecta y una cuenta sin confirmar tardan lo mismo en responder». `users/cognito-session.test.ts`: «NotAuthorizedException es una contraseña rechazada, salvo Password attempts exceeded». (2) |
| A una cuenta sin confirmar no se le entrega ningún token, aunque la contraseña sea correcta | `users/sign-in.test.ts`: «a una cuenta sin confirmar no se le entrega ningún token aunque la contraseña sea correcta, y su refresh token se revoca», que cubre también al usuario de Cognito sin ítem. `users/dynamodb.test.ts`: «isConfirmed consulta GSI2 por el sub con una proyección mínima y exige el tipo USER y Confirmed». (2) |
| El sexto intento de iniciar sesión en un minuto desde la misma IP responde 429 y no llega a Cognito | `users/sign-in.test.ts`: «el sexto intento de iniciar sesión en un minuto desde la misma IP responde 429 y no llega a Cognito». `users/dynamodb.test.ts`: «el límite de inicios de sesión usa su propio prefijo, un máximo de 5 y ventanas de un minuto». (2) |
| Mientras Cognito tiene bloqueada la cuenta por intentos fallidos, iniciar sesión responde 429 | `users/sign-in.test.ts`: «mientras Cognito tiene bloqueada la cuenta por intentos fallidos, iniciar sesión responde 429». `users/cognito-session.test.ts`: «Password attempts exceeded es una cuenta bloqueada». (2) |
| Renovar con un refresh token vigente responde 200 con un ID token y un access token nuevos y sin refresh token, y el mismo refresh token sigue sirviendo | `users/refresh-session.test.ts`: «renovar con un refresh token vigente responde 200 con un ID token y un access token nuevos y sin refresh token, y el mismo refresh token sigue sirviendo». `users/cognito-session.test.ts`: «renueva con GetTokensFromRefreshToken y el secreto del cliente, sin SECRET_HASH ni usuario». (3) |
| Renovar con un refresh token vencido, revocado o inválido responde 401 | `users/refresh-session.test.ts`: «renovar con un refresh token vencido, revocado o inválido responde 401». `users/cognito-session.test.ts`: «al renovar, NotAuthorizedException es un token que no sirve, y un token fuera del patrón de Cognito no llega a Cognito». (3) |
| Cerrar la sesión revoca el refresh token: renovar con él después responde 401 | `users/sign-out.test.ts`: «cerrar la sesión revoca el refresh token: renovar con él después responde 401». `users/cognito-session.test.ts`: «revoca con RevokeToken y el secreto del cliente». (3) |
| Cerrar la sesión con un refresh token que ya no servía responde 204 | `users/sign-out.test.ts`: «cerrar la sesión con un refresh token que ya no servía responde 204». `users/cognito-session.test.ts`: «al revocar, UnsupportedTokenTypeException y un token fuera del patrón de Cognito no son errores». (3) |
| Si Cognito falla al revocar, cerrar la sesión responde 500 | `users/sign-out.test.ts`: «si Cognito falla al revocar, cerrar la sesión responde 500». `users/cognito-session.test.ts`: «cualquier otro error de RevokeToken sube». (3) |
| El app client emite ID tokens y access tokens de 15 minutos y refresh tokens de 15 días, y no rota el refresh token | `authentication.test.ts`: «el app client emite ID tokens y access tokens de 15 minutos y refresh tokens de 15 días, y no rota el refresh token». Reemplaza a la prueba de los 30 días, y fija también que el pool no recuerda dispositivos. (2) |
| Ni la contraseña ni los tokens aparecen en los logs | `users/sign-in.test.ts` (2), `users/refresh-session.test.ts` y `users/sign-out.test.ts` (3): «ni la contraseña ni los tokens aparecen en los logs», con errores cuyo mensaje lleva la contraseña y los tokens. `api-gateway.test.ts`: «la etapa no registra los cuerpos de los pedidos ni de las respuestas». (2) |
| Las tres rutas exigen la clave de platform, y cada Lambda sólo tiene los permisos que usa | `backend-stack.test.ts`: «las tres rutas de la sesión son POST y exigen la clave de platform» y «cada Lambda sólo tiene los permisos que usa», con el mapa exacto de DynamoDB, Cognito, índices y entorno de cada Lambda. La parte 2 agrega el inicio de sesión y la 3 las otras dos. «Sólo la confirmación puede iniciar sesiones y leer el secreto del cliente» pasa a «sólo la confirmación y el inicio de sesión inician sesiones, y sólo las cuatro Lambdas de la sesión leen el secreto del cliente», y la cuenta fija de rutas POST pasa a la lista de sus rutas. (2 y 3) |

## Verificado contra la documentación de AWS

Consultada el 9 de noviembre de 2026.

- **`SECRET_HASH` con el correo:** «When your app signs in users to a client that
  has a secret hash, you can use the value of any user pool sign-in attribute as
  the username element of the secret hash». Con `REFRESH_TOKEN_AUTH`, si el pool
  no tiene `username` como atributo de inicio de sesión, el hash usa el `sub`
  ([Computing secret hash values](https://docs.aws.amazon.com/cognito/latest/developerguide/signing-up-users-in-your-app.html#cognito-user-pools-computing-secret-hash)).
- **El correo como username attribute** y el `sub` como identificador fijo, sin
  validar su formato
  ([User pool attributes](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html)).
- **Sin `UserNotFoundException`:** con `PreventUserExistenceErrors`,
  `ADMIN_USER_PASSWORD_AUTH` responde `NotAuthorizedException` «Incorrect
  username or password» y suprime por completo los usuarios con alias. No dice
  nada del tiempo de respuesta
  ([Managing user existence error responses](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-managing-errors.html)).
- **El bloqueo:** 5 fallos, un segundo que se duplica hasta unos 15 minutos,
  también por operaciones con IAM; durante el bloqueo, «Password attempts
  exceeded»; «This behavior is subject to change»
  ([Lockout behavior](https://docs.aws.amazon.com/cognito/latest/developerguide/authentication-flow-things-to-know.html#authentication-flow-lockout-behavior)).
- **`AdminInitiateAuth`:** `ADMIN_USER_PASSWORD_AUTH` pide `USERNAME`,
  `PASSWORD` y `SECRET_HASH`; `REFRESH_TOKEN_AUTH`, `REFRESH_TOKEN` y
  `SECRET_HASH`
  ([AdminInitiateAuth](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminInitiateAuth.html)).
- **`GetTokensFromRefreshToken`:** pide `ClientId`, `RefreshToken` y
  `ClientSecret`; sin rotación devuelve sólo ID y access tokens; el token debe
  cumplir `[A-Za-z0-9-_=.]+`; errores, entre ellos `NotAuthorizedException`
  ([GetTokensFromRefreshToken](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_GetTokensFromRefreshToken.html)).
  Sin rotación sirven tanto él como `REFRESH_TOKEN_AUTH`, y la rotación no
  alarga la sesión
  ([Refresh tokens](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-the-refresh-token.html)).
- **`RevokeToken`:** pide `ClientId`, `ClientSecret` y `Token` con el mismo
  patrón; Cognito no evalúa IAM; errores, entre ellos
  `UnsupportedTokenTypeException`
  ([RevokeToken](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_RevokeToken.html)).
  Revoca sólo ese refresh token y sus access tokens, y un JWT revocado sigue
  siendo válido para quien sólo revisa firma y vencimiento
  ([Ending user sessions with token revocation](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html)).
  En `/oauth2/revoke`, un token ya revocado o que no es válido responde 200, y
  uno que no es refresh token, `unsupported_token_type`
  ([The token revocation endpoint](https://docs.aws.amazon.com/cognito/latest/developerguide/revocation-endpoint.html)).
- **Sin IAM en las dos operaciones del refresh token:** «`RevokeToken` and
  `GetTokensFromRefreshToken` take refresh tokens as the authorization
  parameter»
  ([Authorization models](https://docs.aws.amazon.com/cognito/latest/developerguide/authentication-flows-public-server-side.html)).
- **Vigencias:** ID y access de 1 hora por defecto, refresh de 30 días por
  defecto; sin un valor, Cognito pone el de defecto
  ([UpdateUserPoolClient](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_UpdateUserPoolClient.html)).
  En CloudFormation, las tres vigencias, `TokenValidityUnits` y
  `RefreshTokenRotation` se actualizan *No interruption*, y `GenerateSecret`
  reemplaza el cliente
  ([AWS::Cognito::UserPoolClient](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-cognito-userpoolclient.html)).
  En `aws-cdk-lib` 2.275, `refreshTokenRotationGracePeriod` es la única forma
  de encender la rotación.
- **Cuotas:** `AdminInitiateAuth` y `GetTokensFromRefreshToken` comparten
  `UserAuthentication` (120 por segundo, ampliable); `RevokeToken` es
  `UserToken` (120); `DescribeUserPoolClient` es `UserPoolClientRead` (15 por
  cuenta, 5 por pool, no ampliable)
  ([Quotas](https://docs.aws.amazon.com/cognito/latest/developerguide/quotas.html)).
  El SDK reintenta `TooManyRequestsException` hasta 3 veces (`@smithy/core`).
- **DynamoDB:** el TTL borra «within a few days»
  ([TTL](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/TTL.html));
  `dynamodb:LeadingKeys` es la clave de partición de la tabla
  ([Condiciones](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/specifying-conditions.html)).

## Verificado contra AWS

El 9 de noviembre de 2026, en la cuenta de desarrollo, con un pool temporal
configurado como el real, ya borrado.

**Parte 2**
- `AdminInitiateAuth` con el correo como `USERNAME`, también en mayúsculas, y
  el `SECRET_HASH` calculado con ese mismo valor devuelve los tokens. El `sub`
  del ID token coincide con el del usuario. `ExpiresIn` es 900 y `exp - iat`
  es 900 segundos.
- Un correo sin cuenta y una contraseña incorrecta dan el mismo
  `NotAuthorizedException` «Incorrect username or password.».
- El sexto intento seguido, con la contraseña correcta, da
  `NotAuthorizedException` «Password attempts exceeded», el texto exacto.
- Tiempos de Cognito sin el piso, 20 de cada camino, en p99: 368 ms sin cuenta,
  315 ms con la contraseña incorrecta y 550 ms en inicio de sesión más
  `RevokeToken` (el camino de la cuenta sin confirmar, sin DynamoDB). Los tres
  están bajo 800 ms, así que el piso de 1 000 ms alcanza.
- `RevokeToken` funciona con credenciales de IAM falsas: no se autoriza con
  IAM.

**Parte 3, ya comprobado**
- `GetTokensFromRefreshToken` con `ClientSecret` funciona con credenciales
  falsas, no trae refresh token nuevo y `ExpiresIn` es 900.
- Renovar después de revocar da `NotAuthorizedException` «Refresh Token has
  been revoked»; con un token inventado, «Invalid Refresh Token».
- `RevokeToken` con un token ya revocado o inventado no da error.

## Sin verificar contra AWS

Lo comprueba el despliegue a staging.

**Parte 2**
- `dynamodb:LeadingKeys` con `SIGN_IN_ATTEMPTS#*` permite el `UpdateItem` real,
  y el `Query` sobre `index/GSI2` funciona con el permiso de la Lambda, en la
  tabla real.
- CloudFormation actualiza el app client sin reemplazarlo.

**Parte 3**
- `GetTokensFromRefreshToken` con un refresh token vencido responde
  `NotAuthorizedException`. Se prueba con un cliente temporal de refresh token
  de 60 minutos, el mínimo.
- `RevokeToken` con un refresh token vencido, y con un access token
  (`UnsupportedTokenTypeException`). Si alguno responde un error, se agrega al
  mapeo de 204.
- Las dos Lambdas funcionan con sólo `DescribeUserPoolClient`.

## Riesgos aceptados del plan

- **Iniciar sesión justo después de crear la cuenta puede responder 401.**
  `GSI2` es eventualmente consistente: si el pedido llega antes de que el
  índice tenga al usuario (normalmente menos de un segundo), la cuenta cuenta
  como sin confirmar y se revoca su refresh token. La confirmación del registro
  ya entrega la sesión, así que platform no inicia sesión después.
- **Todo rechazo tarda al menos un segundo.** Quien se equivoca de contraseña
  espera un segundo para ver el error. Es el costo de que el tiempo no delate
  la cuenta.
- **El bloqueo se reconoce por su mensaje.** Si Cognito lo cambia, el bloqueo
  responde 401 en lugar de 429. Nunca entrega tokens.
- **El bloqueo dirigido.** Quien conozca el correo de un médico puede
  mantenerle la cuenta bloqueada en Cognito: 5 contraseñas falsas y una más
  cada vez que vence el bloqueo, unas 4 por hora. El médico recibe 429 aunque
  escriba bien su contraseña, y hoy no hay recuperación
  (`AccountRecovery.NONE`). Cognito no deja apagar el bloqueo, y un límite
  propio por correo tendría el mismo efecto. La mitigación va en el ticket de
  recuperar la contraseña: que soporte pueda desbloquear, o la protección
  contra amenazas de Cognito. Con Better Auth no pasaba, porque el límite era
  sólo por IP.
- **`DescribeUserPoolClient`, 5 pedidos por segundo por pool.** Muchas
  instancias nuevas a la vez (un despliegue con tráfico o un pico de
  renovaciones) podrían pasar la cuota; el SDK reintenta y, si no alcanza, ese
  pedido responde 500. Con el tráfico de la beta no se acerca. Si aparece
  `TooManyRequestsException` en los logs de las Lambdas de la sesión, hay que
  revisar de dónde sale el secreto, que es una decisión del humano.

## Para otros tickets

- **El límite por ruta del prerrequisito 11** de
  `docs/features/registro-con-codigo/plan.md` incluye `sign-in`,
  `token/refresh` y `sign-out`, como dice la spec. No es de este plan.
- **La `policy()` de la segunda spec** comprueba en cada pedido que la cuenta
  siga confirmada; renovar no lo hace. Puede usar el mismo `isConfirmed`.
- **Platform** guarda el refresh token 15 días (`REFRESH_TOKEN_LIFETIME_DAYS`
  en `lib/auth/cognito-session.ts`), renueva cuando vence el ID token y llama a
  `sign-out` al cerrar la sesión. Mientras su cookie dure 30 días, renovar
  responde 401 desde el día 15, que es lo que pide la spec.
- **Platform reenvía `x-real-ip`** (prerrequisito 10 de ese plan): sin ella,
  todos los inicios de sesión comparten un cupo de 5 por minuto.

## Preguntas para el humano

Ninguna. Las decisiones de producto ya están en la spec.
