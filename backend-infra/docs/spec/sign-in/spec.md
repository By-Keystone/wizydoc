# Iniciar sesión, renovar la sesión y cerrarla

- **Ticket:** [WIZ-78](https://linear.app/wizydoc/issue/WIZ-78/sign-in-and-session-with-cognito),
  subticket de [WIZ-71 · Migrate authentication endpoints](https://linear.app/wizydoc/issue/WIZ-71/migrate-authentication-endpoints).
- **Es la primera de dos specs de WIZ-78.** La segunda cubre el autorizador de
  Cognito en las rutas privadas, la `policy()` compartida y la cuenta del
  consultorio al confirmar el registro.
- **Reemplaza a:** en `api/`, `POST /api/auth/sign-in/email` y
  `POST /api/auth/sign-out` de Better Auth.
- **Mantiene de la [spec del registro con código](../sign-up-code/spec.md):** la
  regla del correo, que la contraseña sólo viva en Cognito y que la IP del
  usuario llegue en `x-real-ip`.
- **Decidido por el humano el 8 de noviembre de 2026:** la sesión dura 15 días
  fijos, el ID token y el access token duran 15 minutos, el refresh token no se
  rota, un solo mensaje para un correo sin cuenta o una contraseña incorrecta,
  y cerrar la sesión cierra sólo la de ese dispositivo.

## Qué cambia

La persona inicia sesión con su correo y su contraseña, y recibe los tokens de
Cognito. El ID token y el access token duran 15 minutos. Cuando vencen, platform
pide otros con el refresh token, sin volver a pedir la contraseña. El refresh
token dura 15 días desde que se inició la sesión, se use o no la app: cuando
vence, hay que volver a iniciar sesión. Cerrar la sesión revoca el refresh
token.

## Diferencias con hoy

| Hoy (Better Auth) | Con esta spec |
|---|---|
| La sesión dura 7 días y se extiende cada día que se usa, sin tope. | Dura 15 días desde que se inició, se use o no. |
| La sesión vive en Postgres, y cerrarla la borra al instante. | La sesión son tokens de Cognito. Cerrarla revoca el refresh token, pero un ID token ya emitido sirve hasta que vence: como mucho 15 minutos. |
| Un correo sin confirmar recibe su propio mensaje. | No hay cuentas sin confirmar: el registro las crea confirmadas. Si quedara una, responde como una contraseña incorrecta. |
| 5 intentos por minuto por IP. | Igual, más el bloqueo de Cognito a cada cuenta después de 5 fallos seguidos. |
| No hay renovación: la cookie de Better Auth es la sesión. | `POST /api/auth/token/refresh` entrega ID y access tokens nuevos con el refresh token. |

## Rutas

Las tres exigen la clave de platform, como todas las rutas del gateway. La IP
del usuario llega en `x-real-ip`. Si el cuerpo no es un objeto JSON, las tres
responden 400 con «La solicitud no es válida.».

### `POST /api/auth/sign-in`: iniciar sesión

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `email` | La misma regla del registro: la de `z.email()`, como máximo 64 caracteres antes del `@` y 254 en total. Se recorta y se pasa a minúsculas. | Correo inválido |
| `password` | Entre 1 y 256 caracteres. No se aplican las reglas del registro: una contraseña que no las cumple, simplemente, no coincide. | Escribe tu contraseña. |

| Código | Cuándo | Cuerpo |
|---|---|---|
| 200 | El correo y la contraseña coinciden, y la cuenta está confirmada. | `{ "idToken", "accessToken", "refreshToken", "expiresIn" }`, los de Cognito. `expiresIn` es 900. |
| 400 | La entrada es inválida. | `{ "message": "<primer error>" }` |
| 401 | El correo no tiene cuenta, la contraseña no coincide o la cuenta no está confirmada. | `{ "message": "Correo o contraseña incorrectos." }` |
| 429 | Es el sexto intento en un minuto desde la misma IP, o Cognito bloqueó la cuenta por intentos fallidos. | `{ "message": "Demasiados intentos. Intenta de nuevo en unos minutos." }` |
| 500 | Falla Cognito o DynamoDB. | `{ "message": "No pudimos iniciar tu sesión. Intenta de nuevo." }` |

### `POST /api/auth/token/refresh`: renovar la sesión

Lo llama el servidor de platform cuando vence el ID token.

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `refreshToken` | Texto no vacío. | La solicitud no es válida. |

| Código | Cuándo | Cuerpo |
|---|---|---|
| 200 | El refresh token está vigente. | `{ "idToken", "accessToken", "expiresIn" }`. No trae refresh token: el mismo sigue sirviendo. |
| 400 | La entrada es inválida. | `{ "message": "La solicitud no es válida." }` |
| 401 | El refresh token venció, se revocó o no es válido. | `{ "message": "Tu sesión venció. Inicia sesión de nuevo." }` |
| 500 | Falla Cognito. | `{ "message": "No pudimos renovar tu sesión. Intenta de nuevo." }` |

### `POST /api/auth/sign-out`: cerrar la sesión

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `refreshToken` | Texto no vacío. | La solicitud no es válida. |

| Código | Cuándo | Cuerpo |
|---|---|---|
| 204 | El refresh token quedó revocado, o ya no servía porque venció, se revocó o no es válido. | Vacío |
| 400 | La entrada es inválida. | `{ "message": "La solicitud no es válida." }` |
| 500 | Falla Cognito, y el refresh token puede seguir vigente. | `{ "message": "No pudimos cerrar tu sesión. Intenta de nuevo." }` |

## La sesión

- **El ID token y el access token duran 15 minutos.** Ninguna otra ruta
  devuelve tokens: sólo se renuevan cuando vencen, con
  `POST /api/auth/token/refresh`.
- **El refresh token dura 15 días desde que se inició la sesión y no se rota.**
  Renovar devuelve un ID token y un access token nuevos, y el mismo refresh
  token sigue sirviendo hasta que vence. Rotarlo no alargaría la sesión: en
  Cognito, el refresh token rotado vence cuando vencía el original.
- **Al vencer el refresh token,** renovar responde 401 y hay que volver a
  iniciar sesión.
- **Cada inicio de sesión abre una sesión nueva de 15 días.** Las anteriores
  siguen hasta que vencen o se cierran.
- **El registro también abre una sesión de 15 días,** porque usa el mismo app
  client. Por eso el app client `wizydoc-platform` cambia: los tokens de 15
  minutos, el refresh token de 15 días y sin rotación. Hoy son de una hora y de
  30 días.

## Comportamiento

### Iniciar sesión

- Un correo sin cuenta, una contraseña incorrecta y una cuenta con
  `confirmed = false` reciben la misma respuesta, y la respuesta tampoco tarda
  distinto según el caso.
- A una cuenta con `confirmed = false` no se le entrega ningún token, aunque la
  contraseña sea correcta.
- **Cada IP puede intentar iniciar sesión 5 veces por minuto.** El sexto intento
  responde 429 sin llegar a Cognito. Sin `x-real-ip`, los intentos cuentan en
  un mismo cupo compartido, como en el registro.
- **Cognito bloquea la cuenta** después de 5 fallos seguidos con su contraseña:
  primero un segundo, y el plazo se duplica con cada fallo nuevo hasta unos 15
  minutos
  ([Lockout behavior](https://docs.aws.amazon.com/cognito/latest/developerguide/authentication-flow-things-to-know.html#authentication-flow-lockout-behavior)).
  Mientras dura el bloqueo, iniciar sesión responde 429.

### Renovar y cerrar la sesión

- No tienen un límite por IP propio. Las limita el usage plan del gateway, y el
  límite por ruta que pide el prerrequisito 11 de
  `docs/features/registro-con-codigo/plan.md` cubre también estas rutas.
- Renovar no vuelve a leer DynamoDB. Que la cuenta siga activa y confirmada lo
  comprueba la `policy()` de la segunda spec en cada pedido.
- Cerrar la sesión revoca sólo ese refresh token, con `RevokeToken`. Los demás
  dispositivos siguen con su sesión.

## Fuera de alcance

- **El autorizador de Cognito, la `policy()` compartida** y reconocer la sesión
  en cada pedido: la segunda spec de WIZ-78.
- **La cuenta del consultorio al confirmar el registro:** la segunda spec, con
  su ítem de DynamoDB.
- **Platform:** el login detrás de `BACKEND`, guardar, renovar y borrar las
  cookies de la sesión, y leer la sesión en el middleware. Platform copia la
  vigencia del refresh token en `lib/auth/cognito-session.ts`, que hoy dice 30
  días; se cambia a 15 en su PR.
- **Recuperar y cambiar la contraseña,** y cerrar la sesión en todos los
  dispositivos (`AdminUserGlobalSignOut`).
- MFA, CAPTCHA y «recordarme».

## Riesgos aceptados

- **Un refresh token robado sirve hasta 15 días,** salvo que se cierre esa
  sesión. Se descartó rotarlo: rotar sólo achica el riesgo si la persona renueva
  antes que quien lo robó, y suma manejar renovaciones a la vez. Lo acotan la
  cookie HttpOnly y `secure` de platform y la vigencia de 15 días.
- **Después de cerrar la sesión, un ID token ya emitido sirve hasta 15
  minutos.** Un token revocado sigue siendo válido para quien sólo revisa su
  firma y su vencimiento, como el autorizador del gateway
  ([Revoking tokens](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html)).
- **El bloqueo de Cognito puede delatar que un correo tiene cuenta.** Sólo existe
  para cuentas reales: con varias IPs, quien provoque 5 fallos y vea un 429 sabe
  que ese correo tiene cuenta. Se acepta para que quien se equivocó varias veces
  sepa por qué no puede entrar.

## Criterios de aceptación

- Iniciar sesión con el correo y la contraseña de una cuenta confirmada responde
  200 con los tokens de Cognito y `expiresIn` de 900 segundos.
- El correo se recorta y se pasa a minúsculas antes de buscar la cuenta.
- Un correo sin cuenta, una contraseña incorrecta y una cuenta sin confirmar
  responden 401 con el mismo mensaje.
- A una cuenta sin confirmar no se le entrega ningún token, aunque la contraseña
  sea correcta.
- El sexto intento de iniciar sesión en un minuto desde la misma IP responde 429
  y no llega a Cognito.
- Mientras Cognito tiene bloqueada la cuenta por intentos fallidos, iniciar
  sesión responde 429.
- Renovar con un refresh token vigente responde 200 con un ID token y un access
  token nuevos y sin refresh token, y el mismo refresh token sigue sirviendo.
- Renovar con un refresh token vencido, revocado o inválido responde 401.
- Cerrar la sesión revoca el refresh token: renovar con él después responde 401.
- Cerrar la sesión con un refresh token que ya no servía responde 204.
- Si Cognito falla al revocar, cerrar la sesión responde 500.
- El app client emite ID tokens y access tokens de 15 minutos y refresh tokens de
  15 días, y no rota el refresh token.
- Ni la contraseña ni los tokens aparecen en los logs.
- Las tres rutas exigen la clave de platform, y cada Lambda sólo tiene los
  permisos que usa.
