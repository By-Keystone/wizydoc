# Registro con código de verificación

- **Ticket:** [WIZ-75](https://linear.app/wizydoc/issue/WIZ-75/email-confirmation-endpoint),
  subticket de [WIZ-71 · Migrate authentication endpoints](https://linear.app/wizydoc/issue/WIZ-71/migrate-authentication-endpoints).
- **Reemplaza a:** el registro de la [spec del registro](../sign-up/spec.md)
  (WIZ-72): la cuenta sin confirmar, el enlace de confirmación, su reenvío, el
  aviso «Confirma tu cuenta» y los datos personales en el registro. Sus rutas
  `POST /api/auth/sign-up/email` y `POST /api/auth/sign-up/resend-confirmation`
  se quitan de `backend-infra`. En `api/`, reemplaza a
  `POST /api/auth/sign-up/email` y `GET /api/auth/verify-email` de Better Auth.
- **Mantiene de esa spec:** la misma respuesta exista o no el correo, el límite
  de envíos por IP, la constancia de los términos detrás de
  `TERMS_ACCEPTANCE_REQUIRED`, las reglas del correo y de la contraseña, y que
  la contraseña sólo viva en Cognito.

## Qué cambia

Registrarse pide sólo el correo y la contraseña, en tres pasos: la persona
escribe su correo, le llega un código de 6 dígitos, lo escribe y recién ahí
elige su contraseña. La cuenta se crea en ese momento, ya confirmada, y queda
con la sesión iniciada. Antes del código no existe ninguna cuenta.

El nombre, el apellido y el teléfono pasan al onboarding.

Así nadie puede crear la cuenta de otra persona antes que ella: para crearla
hace falta el código, y el código sólo llega a su buzón. Es el pre-secuestro
que la spec del registro dejó como riesgo aceptado.

## Diferencias con el registro de hoy

| Hoy (Better Auth, y la spec de WIZ-72) | Con esta spec |
|---|---|
| Un formulario con nombre, apellido, teléfono, correo y contraseña. | El correo, después el código y después la contraseña. Los demás datos los pide el onboarding. |
| La cuenta se crea sin confirmar, y un enlace la confirma después. | La cuenta se crea confirmada cuando la persona escribe el código y elige la contraseña. Antes no existe. |
| Alguien puede registrar el correo de otra persona con su propia contraseña. Si ella confirma, la cuenta queda con la contraseña de él. | Sin el código, que llega al buzón, no se crea nada. |
| Better Auth inicia sesión al confirmar con el enlace. | Crear la cuenta inicia la sesión: la respuesta trae los tokens de Cognito. |
| El enlace vence a la hora (Better Auth) o a las 24 horas (WIZ-72). | El código vence a los 10 minutos y acepta 5 intentos. |
| Un endpoint para reenviar el enlace. | Pedir el código otra vez es el mismo endpoint, como mucho una vez por minuto, y sólo sirve el último. |

## Rutas

Las tres exigen la clave de platform, como todas las rutas del gateway. La IP
del usuario llega en `x-real-ip` y su navegador en `user-agent`.

### `POST /api/auth/sign-up/code`: pedir el código

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `email` | La misma regla del registro: la de `z.email()`, como máximo 64 caracteres antes del `@` y 254 en total. Se recorta y se pasa a minúsculas. | Correo inválido |

| Código | Cuándo | Cuerpo |
|---|---|---|
| 202 | La entrada es válida y no se superó el límite, exista o no la cuenta. | Vacío |
| 400 | La entrada es inválida, o el cuerpo no es un objeto JSON. | `{ "message": "<primer error>" }`, o «La solicitud no es válida.» |
| 429 | Se superó el límite de envíos de esa IP. | `{ "message": "Demasiados intentos. Intenta de nuevo en unos minutos." }` |
| 500 | Falla DynamoDB o el envío del correo. | `{ "message": "No pudimos enviarte el código. Intenta de nuevo." }` |

### `POST /api/auth/sign-up/code/verify`: verificar el código

Lo usa la pantalla del código. Si el código sirve, lo gasta y devuelve el token
de verificación, que prueba que quien llama recibió el código. Platform lo
guarda y lo manda al crear la cuenta: la persona nunca lo ve.

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `email` | La misma regla que al pedir el código. | Correo inválido |
| `code` | 6 dígitos. | El código no es correcto o ya venció. Pide uno nuevo si lo necesitas. |

| Código | Cuándo | Cuerpo |
|---|---|---|
| 200 | El código es el último que se pidió para ese correo, no venció y le quedan intentos. | `{ "verificationToken": "<token>" }` |
| 400 | La entrada es inválida, o el código no es correcto, venció, se agotaron sus intentos, ya se usó o nunca se pidió. | `{ "message": "El código no es correcto o ya venció. Pide uno nuevo si lo necesitas." }`, o el error del correo |
| 429 | Se superó el límite de verificaciones de esa IP: 10 cada 10 minutos, aparte del límite de envíos. | `{ "message": "Demasiados intentos. Intenta de nuevo en unos minutos." }` |
| 500 | Falla DynamoDB. | `{ "message": "No pudimos comprobar el código. Intenta de nuevo." }` |

### `POST /api/auth/sign-up/confirm`: crear la cuenta

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `email` | La misma regla que al pedir el código. | Correo inválido |
| `password` | Las mismas reglas del registro: entre 8 y 256 caracteres, sin espacios al principio ni al final y sin saltos de línea. | Los mismos mensajes del registro |
| `verificationToken` | El token que devolvió la verificación del código para este mismo correo: 43 caracteres base64url. | Tu verificación venció. Vuelve a pedir el código. |
| `acceptedTerms`, `termsVersion`, `privacyPolicyVersion` | Las mismas reglas del registro, con el flag encendido. Con el flag apagado, se ignoran. | Los mismos mensajes del registro |

| Código | Cuándo | Cuerpo |
|---|---|---|
| 200 | La cuenta se creó y se inició la sesión. | `{ "idToken", "accessToken", "refreshToken", "expiresIn" }`, los de Cognito |
| 204 | La cuenta se creó, pero no se pudo iniciar la sesión. | Vacío. Platform lleva a `/login`. |
| 400 | La entrada es inválida, o el token de verificación no existe, venció, ya se usó o es de otro correo. | `{ "message": "<primer error>" }` |
| 500 | Falla Cognito o DynamoDB antes de crear la cuenta. | `{ "message": "No pudimos crear tu cuenta. Intenta de nuevo." }` |

## El código

- 6 dígitos al azar, con `crypto.randomInt`. Se guarda sólo su SHA-256, junto
  con el correo, el vencimiento a los 10 minutos y los intentos fallidos.
- Hay uno por correo. Pedir otro reemplaza al anterior, que deja de servir, y
  vuelve a dar 5 intentos.
- Como mucho uno por minuto por correo. Si se pide otro antes de que pase un
  minuto desde el último, no se guarda ni se envía nada, el anterior sigue
  sirviendo y la respuesta es la misma. Así cada dirección recibe como mucho un
  correo por minuto, aunque se usen muchas IPs.
- Cada intento fallido suma uno. Al quinto, el código deja de servir aunque no
  haya vencido.
- Lo gasta la verificación: sirve una sola vez. Si llegan dos pedidos a la vez
  con el mismo código, sólo uno recibe el token de verificación.
- El vencimiento lo revisa el endpoint con la hora guardada. El TTL de DynamoDB
  sólo limpia la tabla, días después.
- Ni el código ni su hash aparecen en los logs ni en las respuestas.

Todas las razones por las que un código no sirve responden lo mismo. Si
dijéramos «venció» o «te quedan 2 intentos», se sabría que se envió un código,
y por lo tanto que el correo no tiene cuenta.

## El token de verificación

- 256 bits al azar en base64url, como el token de confirmación de la spec del
  registro. Se guarda sólo su SHA-256, junto con el correo para el que se
  verificó y el vencimiento a los 15 minutos.
- Sólo sirve para crear la cuenta de ese correo, y una sola vez: lo gasta la
  misma transacción que crea el usuario.
- Existe para que crear la cuenta no dependa sólo del correo, que no es
  secreto. Si bastara con que el correo estuviera verificado, alguien podría
  llamar a `/sign-up/confirm` con el correo de otra persona y su propia
  contraseña, una y otra vez, y ganarle la carrera en cuanto ella verifique su
  código.
- Ni el token ni su hash aparecen en los logs.

## Comportamiento

### Pedir el código

1. **Validación.** Una entrada inválida responde 400 y no cuenta para el
   límite.
2. **Límite por IP.** El mismo de la spec del registro: 3 envíos de correo cada
   10 minutos por IP. Por encima, 429.
3. **Correo sin cuenta.** Guarda el código nuevo, que reemplaza al anterior, y
   envía «Tu código para crear tu cuenta en WizyDoc». Responde 202. Si el
   anterior se pidió hace menos de un minuto, no guarda ni envía nada, y
   responde 202 igual.
4. **Correo con cuenta.** No guarda ningún código. Envía «Intentaron crear una
   cuenta con tu correo», con los enlaces para iniciar sesión y recuperar la
   contraseña. Responde 202, igual que en el caso anterior. Este aviso tiene el
   mismo minuto de espera que el código: si el anterior salió hace menos de un
   minuto, no envía nada y responde 202 igual. Así las dos ramas hacen lo mismo
   y no se distinguen por lo que tarda la respuesta.

### Verificar el código

1. **Validación.** Una entrada inválida responde 400 y no cuenta como intento.
2. **Límite por IP.** 10 verificaciones cada 10 minutos por IP, aparte del
   límite de envíos. Por encima, 429, que no cuenta como intento del código.
   Acota cuántos códigos puede probar y anular cada IP: como mucho dos cada 10
   minutos.
3. **El código.** Si no existe, venció, se agotaron sus intentos o no coincide,
   suma el intento cuando existe y responde 400.
4. **Si coincide,** en una sola transacción borra el código, con la condición
   de que siga siendo el mismo, y guarda el token de verificación. Responde 200
   con el token.

### Crear la cuenta

1. **Validación** de los campos.
2. **El token de verificación.** Si no existe, venció o es de otro correo,
   responde 400.
3. **Correo con cuenta.** No puede pasar, porque a esos correos no se les manda
   código. Si pasara, responde 400 como un token que no sirve.
4. **Cognito.** Crea el usuario con `AdminCreateUser` (sin que Cognito mande
   correos) y le pone la contraseña con `AdminSetUserPassword`. Si lo segundo
   falla, borra el usuario.
5. **DynamoDB, en una sola transacción:** el usuario, ya confirmado y con el
   onboarding sin completar, sin nombre, apellido ni teléfono; la constancia de
   los términos si el flag está encendido; y el borrado del token de
   verificación, con la condición de que siga existiendo. Si la transacción
   falla, borra el usuario de Cognito. De dos pedidos a la vez con el mismo
   token, sólo uno crea la cuenta.
6. **La sesión.** Pide los tokens a Cognito con la contraseña recién elegida
   (`ADMIN_USER_PASSWORD_AUTH`) y responde 200 con ellos. Si Cognito falla en
   este paso, la cuenta ya existe: responde 204 y la persona inicia sesión.
7. **Logs.** Ni el código, ni el token de verificación, ni la contraseña, ni
   los tokens de Cognito. Ante un error, sólo su nombre.

## Correos

El remitente es `EMAIL_FROM`. Los correos ya no saludan por el nombre, porque
la cuenta no lo tiene hasta el onboarding.

**Código:** asunto «Tu código para crear tu cuenta en WizyDoc».

> Hola,
> Tu código para crear tu cuenta en WizyDoc es:
> **123456**
> Vence en 10 minutos. Si no pediste crear una cuenta, ignora este correo.

**Intento con una cuenta que ya existe:** asunto «Intentaron crear una cuenta
con tu correo».

> Hola,
> Alguien intentó crear una cuenta en WizyDoc con este correo. Ya tienes una
> cuenta con él.
> Si fuiste tú, inicia sesión: **[Iniciar sesión]** → `<FRONTEND_URL>/login`
> Si no fuiste tú, te recomendamos cambiar tu contraseña:
> **[Cambiar contraseña]** → `<FRONTEND_URL>/forgot-password`

Se dejan de enviar «Confirma tu correo en WizyDoc» y «Confirma tu cuenta en
WizyDoc».

## Fuera de alcance

- **Platform:** las tres pantallas del registro y guardar los tokens en cookies
  HttpOnly desde su servidor.
- **El onboarding:** pedir nombre, apellido, teléfono y tratamiento, además de
  lo que pide hoy del consultorio.
- **Iniciar sesión con la contraseña, renovar los tokens y recuperar la
  contraseña,** que son otros subtickets de WIZ-71.
- **Cuentas sin confirmar creadas con la spec de WIZ-72:** no hay en producción,
  porque nunca se desplegó en producción. En las cuentas de prueba se borran a mano.

## Riesgos aceptados

- **Adivinar el código.** Cada correo recibe como mucho un código por minuto,
  con 5 intentos cada uno, y cada IP verifica 10 veces cada 10 minutos. Adivinar
  uno lleva meses aunque se usen muchas IPs. Quien lo lograra crearía la cuenta
  con su contraseña, como en el pre-secuestro, pero la víctima la recupera con
  «Cambiar contraseña».
- **Correos a una misma dirección.** Con varias IPs se le pueden mandar hasta 60
  correos por hora, y reemplazarle el código una vez por minuto si no lo
  escribe a tiempo. Un tope más largo por dirección empeoraría el bloqueo del
  punto siguiente, porque bastaría con agotarlo.
- **Anular el código de otra persona.** Cinco verificaciones fallidas anulan el
  código vigente, y cada IP puede hacer 10 cada 10 minutos. Con algunas IPs se
  puede impedir que alguien termine de registrarse con su correo, aunque no
  quedarse con la cuenta.
- **El hash del código no tiene sal.** Con 6 dígitos, quien lea la tabla puede
  calcular el código. Vence en 10 minutos y crear la cuenta exige además la
  clave de platform.

## Criterios de aceptación

- Pedir el código con un correo sin cuenta guarda sólo su hash, con
  vencimiento a los 10 minutos, y envía el correo con el código. Responde 202.
- Pedir el código con un correo que ya tiene cuenta no guarda nada y envía
  «Intentaron crear una cuenta con tu correo». Responde 202, igual que con un
  correo sin cuenta.
- Pedir otro código pasado un minuto hace que el anterior deje de servir.
- Pedir otro código antes de que pase un minuto no guarda ni envía nada, el
  anterior sigue sirviendo y responde 202.
- Con un correo que ya tiene cuenta, pedir el código antes de que pase un
  minuto desde el último aviso no envía nada y responde 202.
- El cuarto envío de correo en 10 minutos desde la misma IP responde 429.
- La undécima verificación en 10 minutos desde la misma IP responde 429 y no
  cuenta como intento del código.
- Verificar el código correcto responde 200 con un token de verificación y
  gasta el código: verificarlo otra vez responde 400.
- Un código incorrecto, vencido, con los intentos agotados, ya usado o que
  nunca se pidió responde 400 con el mismo mensaje.
- Al quinto intento fallido, el código deja de servir aunque sea el correcto.
- De dos verificaciones a la vez con el mismo código, sólo una recibe el token.
- Crear la cuenta con un token de verificación vigente crea el usuario en
  Cognito y en DynamoDB, ya confirmado y sin nombre, apellido ni teléfono,
  gasta el token y responde 200 con los tokens de Cognito.
- Crear la cuenta sin token, con un token vencido, ya usado o de otro correo
  responde 400 y no crea nada.
- Con el flag encendido, la constancia de los términos se guarda en la misma
  transacción que el usuario. Sin aceptar los términos, responde 400.
- De dos pedidos a la vez con el mismo token de verificación, sólo uno crea la
  cuenta.
- Si falla la escritura en DynamoDB, el usuario se borra de Cognito y responde
  500.
- Si Cognito no entrega los tokens, la cuenta queda creada y responde 204.
- Ni el código, ni el token de verificación, ni sus hashes, ni la contraseña, ni
  los tokens de Cognito aparecen en los logs.
- Las tres rutas exigen la clave de platform, y cada Lambda sólo tiene los
  permisos que usa.
