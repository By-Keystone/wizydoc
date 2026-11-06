# Registro de usuarios

- **Ticket:** [WIZ-72 · User sign up endpoint](https://linear.app/wizydoc/issue/WIZ-72/user-sign-up-endpoint),
  subticket de [WIZ-71 · Migrate authentication endpoints](https://linear.app/wizydoc/issue/WIZ-71/migrate-authentication-endpoints).
  Cubre la parte del registro de [WIZ-53](https://linear.app/wizydoc/issue/WIZ-53/aceptacion-de-terminos-en-el-registro-y-politica-de-reembolso):
  la casilla de términos y la constancia de su aceptación.
- **Reemplaza a:** `POST /api/auth/sign-up/email` de Better Auth en `api/`,
  con su correo de confirmación.

## Qué cambia

El backend serverless permite crear una cuenta con correo y contraseña,
aceptando los términos, y le manda a la persona el correo para confirmarla. No
es sólo una migración: el registro también mejora. Nadie puede averiguar qué
correos tienen cuenta, la aceptación de los términos queda probada, el teléfono
se valida y el enlace de confirmación se puede pedir de nuevo.

## Diferencias con el registro de hoy

| Hoy (Better Auth y Postgres) | Con esta spec |
|---|---|
| Un correo que ya existe devuelve un error, así que se puede averiguar qué correos tienen cuenta. | La respuesta es la misma exista o no el correo. El dueño del correo recibe un aviso. |
| No se aceptan los términos ni queda constancia de nada. | Una casilla obligatoria, y una constancia con las versiones aceptadas, la fecha, la IP y el navegador. Se enciende con el flag `TERMS_ACCEPTANCE_REQUIRED`. |
| El teléfono es texto libre. | Se valida como celular o fijo de Perú y se guarda como `+51…`. |
| Si el correo de confirmación no llega, no hay cómo pedirlo de nuevo. | Hay un endpoint para reenviarlo. |
| Quien se registró y no confirmó recibe un error si vuelve a registrarse. | Recibe un aviso del intento, con un botón para confirmar su cuenta. |
| El enlace lleva el token en la URL, y abrirlo (un `GET`) confirma la cuenta. | El token va en el fragmento (`#token=`): no queda en ningún log, y abrir el enlace no confirma nada por sí solo, ni siquiera si lo abre un escáner de correo. |
| El correo de confirmación no dice cuánto dura el enlace. | El enlace vence a las 24 horas, y el correo lo dice. |
| El límite general de Better Auth: 100 peticiones cada 10 segundos por IP. | 3 envíos de correo cada 10 minutos por IP, entre el registro y el reenvío. |
| El hash de la contraseña se guarda en Postgres. | La contraseña sólo vive en Cognito. |
| Si una escritura falla a mitad, no hay nada que la deshaga. | Si no se puede guardar en DynamoDB, se borra el usuario de Cognito. |
| El correo se valida con `z.email()`, sin límite de largo, y los demás campos tampoco tienen límite. | El correo sigue la misma regla, con los límites de SMTP, y nombre, apellido y contraseña tienen un máximo. |
| Los errores de validación vienen de Better Auth. | Los mensajes están en español. |

## Rutas

Las dos exigen la clave de platform, como todas las rutas del gateway. La IP del
usuario llega en la cabecera `x-real-ip` y su navegador en `user-agent`; platform
ya reenvía la IP hoy.

### `POST /api/auth/sign-up/email`: registrarse

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `email` | La misma regla de `z.email()` que el formulario de platform; como máximo 64 caracteres antes del `@` y 254 en total. Se recorta y se pasa a minúsculas. | Correo inválido |
| `name` | Entre 1 y 100 caracteres; se recorta. | Ingresa tu nombre · Escribe tu nombre en 100 caracteres o menos |
| `lastName` | Entre 1 y 100 caracteres; se recorta. | Ingresa tu apellido · Escribe tu apellido en 100 caracteres o menos |
| `phone` | Un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad, con o sin `+51`. Se guarda como `+51…`. | Escribe un celular de 9 dígitos que empiece con 9, o un fijo con su código de ciudad. |
| `password` | Entre 8 y 256 caracteres, los límites del user pool, sin espacios al principio ni al final y sin saltos de línea, porque Cognito rechaza esas contraseñas. | La contraseña debe tener al menos 8 caracteres · La contraseña puede tener hasta 256 caracteres · La contraseña no puede empezar ni terminar con un espacio, ni tener saltos de línea |
| `acceptedTerms` | Con el flag encendido, tiene que ser `true`. Con el flag apagado, se ignora. | Para crear tu cuenta, acepta los Términos y condiciones. |
| `termsVersion`, `privacyPolicyVersion` | Con el flag encendido, las versiones que platform le mostró a la persona, que tienen que coincidir con las vigentes. Con el flag apagado, se ignoran. | Actualizamos los términos. Recarga la página para verlos. |

### `POST /api/auth/sign-up/resend-confirmation`: reenviar la confirmación

| Campo | Regla | Mensaje si falla |
|---|---|---|
| `email` | La misma regla que en el registro. | Correo inválido |

### Respuestas de las dos rutas

| Código | Cuándo | Cuerpo |
|---|---|---|
| 202 | La entrada es válida y no se superó el límite, exista o no el correo. | Vacío |
| 400 | La entrada es inválida, o el cuerpo no es un objeto JSON. | `{ "message": "<primer error>" }`, o «La solicitud no es válida.» si el cuerpo no es un objeto |
| 429 | Se superó el límite de envíos de esa IP. | `{ "message": "Demasiados intentos. Intenta de nuevo en unos minutos." }` |
| 500 | Falla Cognito, DynamoDB o el envío del correo. | `{ "message": "No pudimos completar tu registro. Intenta de nuevo." }` |

## Comportamiento del registro

1. **Validación.** Una entrada inválida responde 400 y no cuenta para el
   límite: equivocarse al escribir no bloquea a nadie.
2. **Límite por IP.**
   - Cada pedido válido, de registro o de reenvío, cuenta para la IP de
     `x-real-ip`, en ventanas fijas de 10 minutos. Desde el cuarto pedido de la
     misma ventana, responde 429 sin crear ni enviar nada.
   - Como las ventanas son fijas, alrededor del cambio de ventana pueden pasar
     hasta 6 pedidos en poco tiempo.
   - Las IPv6 cuentan por su red /64, porque cada conexión suele tener una red
     entera.
   - Si falta la cabecera, o no trae una IP válida, esos pedidos comparten un
     único cupo.
3. **Correo nuevo.**
   - Se crea el usuario en Cognito, con su contraseña definitiva y sin que
     Cognito mande correos.
   - Se guardan juntos, en una sola transacción, el usuario (con
     `confirmed = false` y `onboardingCompleted = false`), el token de
     confirmación y, con el flag encendido, la constancia de aceptación de los
     términos. Con el flag encendido, no puede existir un usuario sin su
     constancia.
   - Se envía el correo de confirmación.
4. **Correo existente y confirmado.** No se crea ni se modifica nada, y se
   envía el aviso «Intentaron crear una cuenta con tu correo», que recomienda
   cambiar la contraseña si no fue la persona.
5. **Correo existente sin confirmar.**
   - No se modifican sus datos, su contraseña ni su constancia. Vale la
     aceptación original: si no, cualquiera que conozca el correo podría dejar
     su propia IP en la constancia de otra persona.
   - Se crea un token nuevo y se envía «Confirma tu cuenta en WizyDoc», que
     avisa del intento y trae el botón para confirmar. Los tokens anteriores
     siguen sirviendo hasta que vencen.
6. **Correo que sólo existe en Cognito.** No se guarda ni se envía nada, y
   queda un aviso en el log, sin datos personales.
7. **La respuesta es la misma en los casos 3 a 6:** 202 sin cuerpo.
8. **Errores.**
   - Si falla el guardado en DynamoDB, o Cognito rechaza la contraseña, se
     borra el usuario recién creado en Cognito, no se envía nada y se responde
     500. Si además falla ese borrado, el error original sigue su curso y el
     log guarda el `sub` del usuario que quedó en Cognito, para borrarlo a
     mano.
   - Si falla el envío del correo, se responde 500 y el usuario queda creado.
     Al reintentar, cae en el caso 5 y recibe su enlace.
9. **Ni la contraseña ni el token se guardan en claro.** La contraseña sólo
   llega a Cognito. Del token sólo se guarda su SHA-256, y ninguno de los dos
   aparece en los logs.
10. **El registro no inicia sesión,** como hoy.

## Comportamiento del reenvío

1. Valida el correo y cuenta para el mismo límite por IP que el registro.
2. Si el usuario existe y no está confirmado, crea un token nuevo y envía el
   correo de confirmación.
3. Si el usuario está confirmado o no existe, no envía nada.
4. La respuesta es la misma en los casos 2 y 3: 202 sin cuerpo.

## Constancia de aceptación de los términos

La exige el flag `TERMS_ACCEPTANCE_REQUIRED`, una variable de entorno de la
Lambda, apagada por defecto. Con el flag apagado, el registro no pide la
casilla ni guarda constancia, como hoy. Se enciende, con un despliegue, cuando
esté lista la lista «Antes de encender la aceptación de los términos».

Hay un registro por cada aceptación, y nunca se sobrescribe. Guarda:

- el id del usuario y su correo en ese momento;
- `termsVersion` y `privacyPolicyVersion`, las versiones aceptadas;
- la versión del texto de la casilla;
- `acceptedAt`, con la hora del servidor en UTC, nunca la del navegador;
- la IP de `x-real-ip` si es una IP válida, o vacío si no;
- el `user-agent`, recortado a 512 caracteres;
- `source = "sign-up"`.

El texto de la casilla, obligatoria y sin marcar, es:

> Acepto los [Términos y condiciones](https://wizydoc.app/terminos-y-condiciones)
> y he leído la [Política de privacidad](<URL de la política>).

No se pide consentimiento para los datos del médico, porque son necesarios para
el contrato. La política de privacidad se informa, no se acepta, y los datos de
los pacientes se rigen por el encargo de tratamiento de los términos.

## Token de confirmación

- 256 bits aleatorios. Se guarda sólo su SHA-256, y vence a las 24 horas.
- Sirve una sola vez: lo consume la confirmación del correo, que es otra spec.
- El enlace es `<FRONTEND_URL>/verify-email#token=<token>`.

## Correos

El remitente es `EMAIL_FROM`, como hoy.

**Confirmación**: asunto «Confirma tu correo en WizyDoc».

> Hola {nombre},
> Gracias por registrarte en WizyDoc. Para activar tu cuenta, confirma tu
> correo haciendo clic en el botón:
> **[Confirmar correo]**
> El enlace vence en 24 horas. Si no creaste esta cuenta, puedes ignorar este
> correo.

**Intento con una cuenta confirmada**: asunto «Intentaron crear una cuenta con
tu correo».

> Hola {nombre},
> Alguien intentó crear una cuenta en WizyDoc con este correo. Ya tienes una
> cuenta con él.
> Si fuiste tú, inicia sesión: **[Iniciar sesión]** → `<FRONTEND_URL>/login`
> Si no fuiste tú, te recomendamos cambiar tu contraseña:
> **[Cambiar contraseña]** → `<FRONTEND_URL>/forgot-password`

**Intento con una cuenta sin confirmar**: asunto «Confirma tu cuenta en
WizyDoc».

> Hola {nombre},
> Alguien intentó crear una cuenta en WizyDoc con este correo. Tu cuenta
> todavía no está confirmada.
> Si fuiste tú, confírmala con este botón:
> **[Confirmar cuenta]** → `<FRONTEND_URL>/verify-email#token=<token>`
> El enlace vence en 24 horas. Si no fuiste tú, ignora este correo: la cuenta
> no se activa sin tu confirmación.

El reenvío pedido desde `/confirm-email` manda el correo de confirmación
normal, porque lo pide la propia persona.

## Antes de encender la aceptación de los términos

Sale de la revisión legal del 6 de noviembre de 2026, que debe confirmar un
abogado.

1. **La política de privacidad publicada**, con su URL en la casilla.
2. **La política actualizada:** que nombre como subencargados a AWS (Cognito,
   DynamoDB, Lambda y SES, en `us-east-2`) en vez de Railway, y que diga que se
   guardan la IP y el navegador como prueba de la aceptación, y por cuánto
   tiempo.
3. **Los términos sin marcadores.** Falta definir quién es la parte del
   contrato: la razón social, el RUC y el domicilio todavía no existen. El
   correo de contacto y para los derechos sobre los datos es
   `contacto@wizydoc.app`.
4. **Los documentos que los términos citan**, la política de cambios y
   devoluciones y el Libro de Reclamaciones, publicados, o las referencias
   quitadas. Es parte de WIZ-53.
5. **Platform muestra la casilla** y envía las versiones.

**Mientras el flag esté apagado,** el registro recoge datos sin informar antes
la política de privacidad, igual que hoy. El flag permite migrar sin esperar
los documentos, pero no cierra ese riesgo legal.

## Antes del primer despliegue

- **La confirmación del correo funcionando** (otro subticket de WIZ-71), para
  que nadie reciba un enlace que no funciona.
- **SES fuera del sandbox en `us-east-2`.** La identidad del dominio ya está
  verificada a mano ahí, pero en el sandbox SES sólo envía a direcciones
  verificadas, y todo registro terminaría en 500.

## Fuera de alcance

- **Confirmar el correo:** el endpoint y la página `/verify-email` de platform
  son otro subticket de WIZ-71.
- **Iniciar sesión y recuperar la contraseña,** que son otros subtickets de
  WIZ-71.
- **Pedir otra vez la aceptación cuando cambien los términos,** y a los
  usuarios de antes de esta spec y a los invitados. Va con el inicio de sesión.
- **Unir la constancia con la cuenta** cuando el onboarding la cree.
- **Casillas opcionales,** como la de recibir correos comerciales.
- **Los cambios en platform:** la casilla en el formulario, el envío de las
  versiones, el botón «¿No te llegó? Reenviar» en `/confirm-email` y un texto
  neutro en esa página.
- **Un límite por correo destinatario,** además del límite por IP.
- **Un usuario de Cognito sin su ítem en DynamoDB** si la Lambda se cae entre
  las dos escrituras. Se acepta por ahora: ese correo no puede volver a
  registrarse hasta borrarlo a mano.

## Riesgos aceptados por ahora

Salen de la revisión de seguridad del 6 de noviembre de 2026. Se decidió no
resolverlos en esta spec por su complejidad.

- **Pre-secuestro de una cuenta sin confirmar.** Alguien puede registrar el
  correo de una médica con su propia contraseña. Si ella confirma con el botón
  del aviso, la cuenta queda con la contraseña del atacante. La solución
  propuesta es que gane el último registro y que la confirmación pida la
  contraseña.
- **Saber si un correo existe por el tiempo de respuesta.** Un correo nuevo
  hace cinco llamadas a AWS y uno existente, dos, así que la respuesta tarda
  distinto. La solución propuesta es responder de inmediato y hacer el trabajo
  en una Lambda en segundo plano.
- **Sin límite por destinatario.** Con muchas IPs se pueden mandar muchos
  avisos a un mismo correo, y los rebotes pueden hacer que AWS pause los envíos
  de SES.
- **El nombre es texto libre en correos de WizyDoc,** así que sirve para
  phishing desde una dirección legítima.
- **Los usuarios sin confirmar no vencen,** y sus datos se guardan
  indefinidamente.

## Criterios de aceptación

**Registro**
- Con una entrada válida y un correo nuevo, responde 202, y el usuario existe
  en Cognito y en DynamoDB con `confirmed = false` y
  `onboardingCompleted = false`.
- El correo se guarda recortado y en minúsculas, y el teléfono como `+51…`.
- Con un correo nuevo, se envía «Confirma tu correo en WizyDoc» con el enlace
  `<FRONTEND_URL>/verify-email#token=<token>`. En DynamoDB queda sólo el
  SHA-256 del token, con vencimiento a las 24 horas.
- Con el flag encendido y un correo nuevo, la constancia se guarda en la misma
  transacción que el usuario, con las versiones, la hora del servidor en UTC,
  la IP, el `user-agent`, el correo y `source = "sign-up"`.
- Con un correo existente y confirmado, responde 202 y envía «Intentaron crear
  una cuenta con tu correo», con los enlaces para iniciar sesión (`/login`) y
  para cambiar la contraseña (`/forgot-password`), sin crear ni modificar
  nada.
- Con un correo existente sin confirmar, responde 202, crea un token nuevo y
  envía «Confirma tu cuenta en WizyDoc», que avisa del intento y trae el botón
  para confirmar, sin cambiar sus datos, su contraseña ni su constancia.
- Con un correo que sólo existe en Cognito, responde 202, no guarda nada y no
  envía ningún correo.
- La respuesta (código y cuerpo) es idéntica con un correo nuevo, uno
  confirmado, uno sin confirmar y uno que sólo existe en Cognito.
- Si falla el guardado en DynamoDB, el usuario recién creado se borra de
  Cognito, no se envía ningún correo y la respuesta es 500.
- Si falla el envío del correo, responde 500, y un segundo registro con el
  mismo correo envía el aviso con un enlace nuevo para confirmar.
- Una entrada inválida responde 400 con el mensaje en español del primer
  error, sin llamar a Cognito, DynamoDB ni SES y sin contar para el límite.
  Incluye no aceptar los términos con el flag encendido, un teléfono que no es
  de Perú, un campo demasiado largo, una contraseña que Cognito rechazaría y un
  cuerpo que no es un objeto JSON.
- Con el flag encendido, si las versiones enviadas no son las vigentes,
  responde 400 con «Actualizamos los términos. Recarga la página para verlos.»
  y no crea nada.
- Con el flag apagado, el registro funciona sin `acceptedTerms` ni versiones,
  y no guarda constancia.

**Reenvío**
- Con un correo existente sin confirmar, responde 202, crea un token nuevo y
  envía el correo de confirmación.
- Con un correo confirmado o inexistente, responde 202 sin enviar nada, con la
  misma respuesta que con un correo sin confirmar.

**Las dos rutas**
- El cuarto pedido válido de la misma IP dentro de una ventana de 10 minutos,
  sumando registros y reenvíos, responde 429, y no crea ni envía nada.
- Ni la contraseña ni el token en claro aparecen en DynamoDB ni en los logs.
- Las dos rutas rechazan una petición sin la clave de platform.
