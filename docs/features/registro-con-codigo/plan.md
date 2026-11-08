# Plan — registro-con-codigo

- **Ticket:** WIZ-76 «Platform sign-up with a verification code», subticket de
  WIZ-71 (migrar los endpoints de autenticación).
- **Contrato:** `backend-infra/docs/spec/sign-up-code/spec.md` (WIZ-75,
  aprobada) y su `plan.md`. Este plan no cambia nada de esa spec.
- **Citado, fuera de este plan:** WIZ-77, el onboarding que pide nombre,
  apellido y teléfono.
- Rama `wiz-76-platform-sign-up-with-a-verification-code`, desde `origin/main`.
- **Mockup:** `mockup.html`, en esta carpeta.
- **Revisado por el humano el 8 de noviembre de 2026:**
  - un killswitch para toda la autenticación, sin período con los dos
    registros;
  - el 8 de noviembre de 2026, el killswitch pasa a ser de todo el backend, no
    sólo de la autenticación (D-1);
  - no hay vuelta a Better Auth ni migración de cuentas hacia Postgres;
  - se rehace la página `/register`: los tres pasos van en ella, sin rutas
    nuevas ni redirect;
  - staging sigue con Better Auth por ahora;
  - la casilla de los términos queda fuera.

Leyenda de certeza: **[código]** lo leí en el repo; **[spec]** lo dice la spec
o el plan de WIZ-75; **[inferencia]** es deducción que el engineer comprueba.

## Objetivo

Que el médico cree su cuenta desde el celular en tres pasos (correo, código de
6 dígitos y contraseña), todos en `/register`, contra el registro de
`backend-infra`, y termine con la sesión de Cognito guardada en cookies
HttpOnly. El killswitch `BACKEND` decide en cada entorno qué backend usa
platform; en este plan, qué muestra `/register`, el formulario de hoy o el flujo
nuevo. Hace el cambio de una vez cuando la infraestructura esté lista.

## Recorrido

Todo pasa en `/register`. El servidor elige el paso según la cookie
`sign_up_progress`, así que recargar no pierde el paso, y la URL no cambia.

1. **El correo, «Crea tu cuenta».** Escribe su correo y pulsa «Continuar».
   Platform pide el código y la página pasa al paso siguiente. Tenga o no
   cuenta ese correo, se ve lo mismo.
2. **El código, «Revisa tu correo».** Escribe los 6 dígitos, y al completarlos
   el formulario se envía solo. Platform verifica el código, guarda el token de
   verificación en la cookie y la página pasa a la contraseña. «Reenviar en
   60 s» cuenta hacia atrás y después pasa a «Reenviar código». «Cambiar» vuelve
   al correo.
3. **La contraseña, «Crea tu contraseña».** Escribe la contraseña y pulsa «Crear
   cuenta». Platform crea la cuenta. Con 200 guarda los tokens en cookies y
   lleva a `/onboarding`. Con 204 lleva a `/login` con el aviso «Tu cuenta quedó
   creada…».

Con `BACKEND=api`, el valor por defecto, `/register` muestra el
formulario de hoy.

## Estado de hoy

- **[código]** `/register` (`register/page.tsx`) es un componente de cliente
  con nombre, apellido, celular, correo y contraseña. Llama a
  `authClient.signUp.email`, que el rewrite `/api/auth/:path*` lleva al api
  (Better Auth), y lleva a `/confirm-email`, un server component que pide abrir
  el enlace del correo.
- **[código]** `/register` y `/confirm-email` ya están en `PUBLIC_PATHS` del
  middleware.
- **[código]** La sesión es la cookie de Better Auth: `middleware.ts`
  (`getSessionCookie`), `lib/auth/session.ts` y `lib/auth/me.ts` leen sólo esa.
  Nada en platform lee todavía una sesión de Cognito.
- **[código]** `session.ts` ya reenvía `x-real-ip` en su llamada del servidor a
  `get-session`, y el rewrite la pasa tal cual. Ninguna llamada de platform va
  hoy a `backend-infra`, y no hay variables para su URL ni para su clave:
  `.env.example` sólo tiene `API_URL` y la clave pública de Culqi.
- **[código] WIZ-75 en `backend-infra`:**
  - en `main` están `POST /api/auth/sign-up/code` (#140), `/code/verify` (#141)
    y el app client de Cognito para platform, `wizydoc-platform` (#142), con
    `ADMIN_USER_PASSWORD_AUTH` y el refresh token a 30 días
    (`REFRESH_TOKEN_VALIDITY` en `backend-infra/lib/authentication.ts`);
  - `/confirm` llegó en #144, y #145 quitó `sign-up/email`.
- **[código]** El gateway exige la clave (`apiKeyRequired: true` sin
  `apiKeySource`, o sea en la cabecera `x-api-key`), y la Lambda lee la IP de
  `x-real-ip` (`readIpAddress`).
- **[código]** `TERMS_ACCEPTANCE_REQUIRED` está apagado en `backend-infra`: con
  él apagado, `/confirm` no pide la casilla de los términos [spec].

## Decisiones

**D-1. Un killswitch para todo el backend: `BACKEND`.** Lo decidió el humano,
primero para la autenticación y, el 8 de noviembre de 2026, para todo el
backend.
- **Para qué sirve:** para hacer el cambio de una vez, cuando la
  infraestructura esté lista. No es para volver atrás: no habrá vuelta al api
  de hoy ni migración de cuentas de Cognito hacia Postgres.
- **Cambia todo platform, no sólo la autenticación:** con `serverless`, platform
  usa `backend-infra` para el registro, el login, la sesión y los endpoints de
  dominio (citas, sedes, organizaciones, disponibilidad, pacientes, booking,
  invitaciones y suscripciones).
  No hay un switch por módulo: la sesión de Cognito sólo la acepta
  `backend-infra`, y el api de hoy sólo acepta la de Better Auth, así que en un
  mismo entorno no pueden convivir.
- **Los valores:** `api`, el de por defecto (el api de hoy, en `API_URL`), y
  `serverless`. Cualquier valor que no sea `serverless`, también vacío o mal
  escrito, cuenta como `api`. Así, una variable que falta deja el registro de
  hoy, y no un registro nuevo a medias.
- **El helper:** `isServerlessBackend()` en `lib/backend.ts`, con
  `server-only`. Sin `NEXT_PUBLIC_`: sólo lo lee el servidor. Lo reutilizarán el
  login, la sesión y los endpoints de dominio, que son otros tickets.
- **Con `api`:**
  - `/register` muestra el formulario de hoy, aunque el navegador tenga una
    cookie `sign_up_progress`;
  - las server actions del registro nuevo lo comprueban antes que nada, porque
    una action se puede llamar sin abrir la página, y no llaman al backend
    nuevo;
  - `/confirm-email` sigue como hoy.
- **Con `serverless`:**
  - `/register` muestra el flujo nuevo (D-2);
  - `/confirm-email` lleva a `/register` con `redirect()`. Esa pantalla no
    existe en el flujo nuevo, y quien la tenga abierta, o en el historial,
    vuelve a empezar el registro;
  - es un 307, el de `redirect()`. Mientras exista el killswitch, en local se
    cambia de un valor al otro para probarlo, y un 308 quedaría en la caché del
    navegador.
- **Nunca conviven.** En cada entorno, `/register` muestra un registro o el
  otro.
- **El cambio llega con un despliegue** [inferencia]: con `api`, Next
  puede construir `/register` y `/confirm-email` como páginas estáticas, y la
  variable se lee al construir. Cambiarla no basta sin un build nuevo. El
  engineer lo comprueba con `next build`.
- **Dónde está encendido:** sólo en local y en los e2e. Producción y staging
  siguen en `api`. Más adelante, staging podría pasar a `serverless`,
  para probar con el `backend-infra` de staging y correos reales. No es parte de
  este plan.
- **El formulario viejo se borra en la parte 5,** en cuanto producción y
  staging estén en `serverless`.

**D-2. Los tres pasos van en `/register`, y el servidor elige cuál mostrar.**
Lo decidió el humano: los pasos dependen del anterior, y una URL por paso no
agrega nada.
- **`register/page.tsx` pasa a ser un server component:**
  - con `api`, renderiza `RegisterForm`, el formulario de hoy, movido
    sin cambios a `register/register-form.tsx`;
  - con `serverless`, lee `sign_up_progress` (D-4) y renderiza un paso:

    | La cookie | El paso |
    | --- | --- |
    | No hay, o no se puede leer | El correo |
    | Con el correo y `codeRequestedAt` | El código |
    | Con el token de verificación | La contraseña |
- **Recargar no pierde el paso,** porque sale de la cookie y no del estado del
  componente.
- **Pasar de un paso al siguiente:** la action escribe la cookie y llama a
  `revalidatePath("/register")`. La página se vuelve a renderizar en el
  servidor con el paso nuevo, sin navegar, sin cambiar la URL y sin agregar una
  entrada al historial. Sólo navegan los finales: `/onboarding` con 200 y
  `/login?registered=ok` con 204.
- **Volver al correo («Cambiar» en el código, «Pedir un código nuevo» en la
  tarjeta vencida)** no toca la cookie.
  - El componente del paso muestra en su lugar el formulario del correo, con el
    correo escrito y el foco en el campo.
  - Al pedir el código, la página vuelve al código, con el correo nuevo o con
    el mismo. Con el mismo correo dentro del minuto no se pide otro (D-5).
  - Si recarga antes de pedirlo, vuelve el paso de la cookie.
  - Por qué no un paso «correo» guardado en la cookie: obligaría a borrar
    `codeRequestedAt`, y con él la espera de un minuto, o a agregar otro campo,
    sólo para que sobreviva a recargar.
- **El botón atrás del navegador sale de `/register`,** a la página anterior,
  porque los pasos no agregan entradas al historial. Al volver, la página
  muestra el paso de la cookie. Se descartó un `history.pushState` por paso:
  «atrás» mostraría un paso que la cookie ya dejó atrás, por ejemplo el código
  después de gastarlo.
- **En la parte 2 sólo existe el correo, y en la 3, el código:** mientras
  falte un paso, la página muestra el último que existe. Sólo se ve en local y
  en los e2e.

**D-3. Platform llama a `backend-infra` desde su servidor, con server
actions.**
- **Variables:** `BACKEND_API_URL` (el origen del gateway, por ejemplo
  `https://api.wizydoc.app`) y `BACKEND_API_KEY` (la clave de API Gateway), sin
  `NEXT_PUBLIC_`. El cliente `lib/api/sign-up/index.ts` empieza con
  `import "server-only"`: si un componente de cliente lo importara, el build
  falla.
- **Cada petición** lleva `x-api-key`, `content-type: application/json` y
  `cache: "no-store"`. Además reenvía `x-real-ip` y `user-agent` de la petición
  entrante (`headers()`), sólo si vienen.
  - Sin `x-real-ip`, todas las personas compartirían el cupo `unknown` de la
    Lambda: 3 envíos cada 10 minutos para todo el mundo [spec].
  - Con el `user-agent` del navegador, la Lambda ve el mismo navegador que hoy
    ve el api. Sin él llegaría el de Node.
- No reenvía cookies ni ninguna otra cabecera. Ninguna respuesta del backend
  llega al navegador: sólo lo que muestra cada paso.
- **Por qué server actions:** es el patrón de platform para las mutaciones
  (`platform/AGENTS.md`), y Next comprueba el `Origin` de cada action. **Por
  qué no `authClient` desde el navegador, como el login:** la clave no puede
  salir del servidor.

**D-4. El avance del registro vive en una cookie HttpOnly, no en el
servidor.**
- **La cookie:** `sign_up_progress`, con `{ email, codeRequestedAt,
  verificationToken? }` en JSON. `codeRequestedAt` son los milisegundos epoch
  del servidor (`Date.now()`). Lleva `httpOnly`, `secure`, `sameSite: "lax"`,
  `path: "/register"` y `maxAge` de una hora
  (`SIGN_UP_PROGRESS_MAX_AGE_SECONDS = 3600`). Cada paso la vuelve a escribir, y
  con eso la hora vuelve a empezar.
- **Por qué una hora y no los 15 minutos del token:** si la cookie venciera con
  el token, recargar `/register` después de 15 minutos mostraría el correo
  vacío, sin la tarjeta «Tu verificación venció» ni el correo escrito. Una hora
  cubre una interrupción de consulta; después, volver a escribir el correo no
  cuesta nada.
- **El plazo del token lo controla el backend, no la cookie.** Platform no
  guarda cuándo se verificó el código. Un token vencido puede seguir en la
  cookie hasta una hora: la página muestra la contraseña, y al pulsar «Crear
  cuenta» el backend responde «Tu verificación venció» y aparece la tarjeta.
- **Por qué no en el servidor:** platform no tiene base de datos ni caché
  compartida. Corre en Railway y ya tiene un build para varias instancias
  (`build:open-next`). Un `Map` en memoria se pierde en cada despliegue y no se
  comparte entre instancias, y un almacén nuevo (Redis, DynamoDB) para un dato
  de una hora sería más infraestructura que la feature.
- **Por qué no en la URL:** quedaría en el historial, en los logs de Railway y
  en el `Referer`. En platform, ni el correo va en una URL.
- **Por qué no hace falta firmarla ni cifrarla:**
  - La cookie no es una credencial ante platform: el backend valida todo. Quien
    edita su cookie sólo cambia lo que él mismo manda, y un token de otro
    correo responde 400 [spec]. Por eso la prueba del reenvío puede reescribir
    `codeRequestedAt` (ver «Verificación»).
  - `httpOnly` impide que un script de la página la lea, `secure` que viaje sin
    TLS y `path: "/register"` que viaje a otras rutas.
  - Como la cookie de sesión, su dueño legítimo es el navegador de la persona.
  - Una cookie inventada sólo cambia qué paso ve quien la inventó.
- **El token no sale por otra vía.** Viaja al navegador sólo en el `Set-Cookie`
  de `sign_up_progress`, que es donde se guarda. La página lee la cookie sólo
  para elegir el paso. A los componentes de cliente les pasa el correo y los
  segundos de espera, nunca el token. El token tampoco va en ningún log.
- **Cuándo se borra:** al crear la cuenta, con 200 o con 204.
- **Con «Tu verificación venció» no se toca.** El token vencido se reemplaza
  cuando se pide el código nuevo, que escribe un avance sin token. Escribir la
  cookie en ese momento podría volver a renderizar la página con otro paso
  antes de mostrar la tarjeta [inferencia].

**D-5. El minuto de espera para pedir otro código lo calcula el servidor.**
- `codeRequestedAt` es la hora del servidor en que platform pidió el último
  código. Con el paso del código, la página calcula `secondsUntilResend` (60
  menos los segundos que pasaron) y se lo pasa al componente, que cuenta hacia
  atrás. No depende del reloj del celular, y la cuenta sigue al recargar.
- **La action del reenvío responde siempre con los segundos que faltan:**
  `{ status: "success", data: { wasCodeSent, secondsUntilResend } }`
  (`DataActionState`).
  - Si pasó el minuto, llama al backend. Con 202 devuelve `wasCodeSent: true` y
    `secondsUntilResend: 60`, y el paso muestra «Te enviamos un código
    nuevo.».
  - **Si no pasó el minuto,** no llama al backend y devuelve
    `wasCodeSent: false` con los segundos que faltan. El paso sigue contando
    desde ahí, no muestra «Te enviamos un código nuevo.» y no cambia nada más.
    Pasa cuando el reloj del navegador va adelantado o cuando otra pestaña pidió
    un código.
- **Al pedir el código, el mismo correo dentro del minuto no llama al
  backend.** Pasa al volver con «Cambiar» sin cambiar el correo. La action
  devuelve los segundos que quedaban, y el paso del código sigue contando desde
  ahí. Si llamara:
  - la Lambda no enviaría nada, pero el pedido contaría para el cupo de 3 por IP
    cada 10 minutos [spec];
  - y la pantalla diría que enviamos un código sin haber enviado uno nuevo. El
    anterior sigue sirviendo.
- Un correo distinto siempre llama al backend y empieza un avance nuevo, sin
  token.

**D-6. La sesión de Cognito va en tres cookies HttpOnly, que nadie lee
todavía.**
- **Con 200,** `saveCognitoSession(tokens)` (`lib/auth/cognito-session.ts`)
  escribe `session_id_token`, `session_access_token` y `session_refresh_token`.
  - Las tres llevan `httpOnly`, `secure`, `sameSite: "lax"` y `path: "/"`.
  - `maxAge`: `expiresIn` para el id token y el access token. Para el refresh
    token, 30 días: la vigencia del app client `wizydoc-platform` (#142),
    copiada como constante.
  - La respuesta se valida con Zod. Si no trae los cuatro campos, se actúa
    como con 204.
- **Los nombres** van en `COOKIE_NAMES` (`lib/auth/cookies.ts`). El ticket de
  la sesión los lee de ahí cuando `BACKEND` es `serverless`. Este plan no
  los lee en ninguna parte.
- **Hasta ese ticket,** `/onboarding` no encuentra la sesión de Better Auth y
  lleva a `/login`. En local y en los e2e, el flujo termina ahí. Por eso
  producción no pasa a `serverless` antes (prerrequisito 2).
- La cookie de Better Auth no se toca.

**D-7. Los mensajes son los de la spec, según el código de respuesta.**

| Respuesta del backend | Qué muestra platform |
| --- | --- |
| 400 | El `message` del cuerpo, que la Lambda manda en español. En la contraseña, si es «Tu verificación venció. Vuelve a pedir el código.», la tarjeta «Tu verificación venció» (D-4). |
| 429 | «Demasiados intentos. Intenta de nuevo en unos minutos.», como constante. |
| Cualquier otra (403, 5xx, sin red, un cuerpo que no es JSON) | El mensaje de fallo de ese paso: «No pudimos enviarte el código. Intenta de nuevo.», «No pudimos comprobar el código. Intenta de nuevo.» o «No pudimos crear tu cuenta. Intenta de nuevo.» |

- **Por qué el 429 y las demás no usan el cuerpo:** API Gateway responde por su
  cuenta, en inglés, cuando la clave no sirve (403 `Forbidden`) o cuando se
  supera el límite del plan de uso (429 `Too Many Requests`). Esos textos nunca
  se muestran.
- **Platform valida antes de llamar,** con las mismas reglas y los mismos
  mensajes de la spec:
  - correo: `z.email()`, recortado y en minúsculas, con hasta 64 caracteres
    antes de la `@` y 254 en total;
  - código: 6 dígitos;
  - contraseña: como `backend-infra/lib/src/users/domain/value-objects/password.vo.ts`,
    el mínimo de 8 en caracteres reales (`[...password].length`), el máximo de
    256 en `length` y el patrón `/^\S(?:.*\S)?$/`.

  Así casi nunca llega un 400 del backend por la contraseña, y un correo mal
  escrito no gasta el cupo de la IP.
- **Mensajes propios de platform,** que la spec no cubre porque no llegan al
  backend:
  - «Escribe los 6 dígitos del código.», con menos de 6;
  - «Te enviamos un código nuevo.», al reenviar;
  - «Ya puedes pedir otro código.», sólo para lectores de pantalla;
  - con 204, en el login: «Tu cuenta quedó creada. Inicia sesión con tu correo y
    tu contraseña.».
- **Un código que no sirve** muestra siempre «El código no es correcto o ya
  venció. Pide uno nuevo si lo necesitas.». Es lo que responde la Lambda en
  todos los casos [spec].

**D-8. El código va en un solo campo, y se envía solo.**
- Un `Input` con `inputMode="numeric"`, `autoComplete="one-time-code"`,
  `maxLength={6}` y letra grande. Sin seis casillas: un solo campo funciona al
  pegar, con el autocompletado de iOS y Android y con lector de pantalla, y no
  hace falta un componente nuevo.
- Al escribir, se quita lo que no es un dígito: pegar «123 456» deja «123456».
- Con el sexto dígito, el formulario se envía solo. El botón «Verificar código»
  sigue para quien prefiera pulsarlo.

**D-9. Los formularios siguen el patrón del login y de la recuperación.**
- **Componente de cliente** con validación en el cliente, `pending` local, error
  en la tarjeta (`role="alert"`) y `useFocusFirstInvalid`. En vez de
  `authClient`, llama a la server action desde `onSubmit` (con
  `preventDefault`), dentro de `startTransition`.
- **La action manda.** Valida otra vez, llama al backend y escribe la cookie.
  Para pasar de paso, `revalidatePath("/register")` (D-2); al final, un
  `redirect()`. Si algo falla, devuelve un `ActionState` de error, con
  `fieldErrors` cuando es de un campo.
- **Por qué no `<form action={…}>`:** React vacía los campos al terminar la
  action (lo explica `onboarding-form.tsx`). Tras un error del backend, la
  persona tendría que volver a escribir la contraseña.
- **Por qué no `useFormAction`:** muestra los errores en un toast, y las
  pantallas de `(auth)` los muestran en la tarjeta.

## Fuera de alcance

- **La casilla de los términos y el enlace a la política de privacidad.**
  Vuelven cuando la política esté publicada. Ese cambio agrega al paso de la
  contraseña la casilla (texto de la spec de WIZ-72) y, a `/confirm`,
  `acceptedTerms`, `termsVersion` y `privacyPolicyVersion`. Se despliega a la
  vez que se enciende `TERMS_ACCEPTANCE_REQUIRED` en `backend-infra`.
- **El login y la sesión con Cognito,** que también respetarán `BACKEND`
  (otros subtickets de WIZ-71).
- **Los endpoints de dominio en `backend-infra`,** que también respetarán
  `BACKEND` (prerrequisito 12).
- **El onboarding** con nombre, apellido y teléfono (WIZ-77).
- **Pasar staging a `serverless`.**
- **Migrar cuentas entre Postgres y Cognito,** en cualquier sentido.

## Antes de pasar producción a `serverless`

Es el orden de despliegue: el killswitch cambia todo el backend de una vez y
no se vuelve atrás, así que todo esto tiene que estar listo antes.

1. **WIZ-75 completo y desplegado en producción, también su parte 4.** Mientras
   exista `POST /api/auth/sign-up/email` en `backend-infra`, se puede
   pre-secuestrar una cuenta [spec].
2. **La sesión de Cognito** (otro ticket): con `serverless`, el middleware,
   `getSession` y `getMe` leen las cookies de D-6. Sin eso, quien crea su
   cuenta termina en `/login`.
3. **El login contra Cognito,** también detrás de `BACKEND` (otro
   subticket de WIZ-71). Con 204, y cada vez que vuelva, la persona entra por
   `/login`.
4. **El onboarding funciona con esa sesión y pide nombre, apellido y teléfono**
   (WIZ-77). La cuenta nace sin esos datos [spec].
5. **Con `serverless`, el registro de Better Auth no se alcanza,** tampoco por
   el rewrite `/api/auth/:path*`. Si no, se pueden seguir creando cuentas por la
   ruta vieja. Lo resuelve el ticket que lleve el login y la sesión a
   `serverless`, o el corte del api.
6. **La IP llega bien.** Platform reenvía `x-real-ip` (lo hace este plan), y
   está comprobada la P1 de `docs/features/fix-auth-rate-limit-ip/plan.md`: que
   el borde de Railway pisa el `X-Real-IP` que manda el cliente [spec].
7. **SES fuera del sandbox en `us-east-2`,** para que el código llegue a
   cualquier correo (spec de WIZ-72, «Antes del primer despliegue»).
8. **`TERMS_ACCEPTANCE_REQUIRED` sigue apagado** en `backend-infra` mientras la
   casilla esté fuera (ver «Fuera de alcance»). Encendido, todo registro
   respondería 400 «Para crear tu cuenta, acepta los Términos y condiciones.».
9. **`BACKEND=serverless`, `BACKEND_API_URL` y `BACKEND_API_KEY` en el
   platform de producción.** Las pone el humano.
10. **Platform escribe `x-real-ip` él mismo,** a partir de la IP del borde, en el
    middleware y pisando la del cliente, si la P1 no confirma que Railway la
    pisa. Hoy se reenvía tal cual, así que el límite por IP del backend depende
    de eso.
11. **Un límite de pedidos por ruta en el usage plan de `backend-infra`** para
    `POST /api/auth/sign-up/code` (`apiStages[].throttle`, del orden de unidades
    por segundo). Hoy el formulario público comparte el límite de 100 rps de la
    clave de platform, y un ataque podría dejar sin servicio el resto, incluido
    el login futuro.
12. **Todos los endpoints que usa platform existen en `backend-infra`:** citas,
    sedes, organizaciones, disponibilidad, pacientes, booking, invitaciones y
    suscripciones, cada uno con su ticket. El killswitch los cambia todos a la
    vez (D-1).

## Cambios por capa

### Prisma

Ninguno, y sin migración. No hay un dato nuevo que guardar en Postgres: el
avance del registro dura como mucho una hora y vive en una cookie (D-4), y la
cuenta la guarda `backend-infra`.

### api

Ninguno. Sin rutas nuevas ni `policy({...})`: las tres rutas son de
`backend-infra` (WIZ-75) y, como todas las del gateway, exigen la clave de
platform. El registro de Better Auth no se toca en este plan (prerrequisito 5).

### backend-infra

Ninguno. El contrato ya está en la spec de WIZ-75, y el app client
`wizydoc-platform`, en #142.

### platform

| Archivo | Parte | Cambio |
| --- | --- | --- |
| `platform/.env.example` | 2 | `BACKEND=api`, `BACKEND_API_URL=` y `BACKEND_API_KEY=`, con una línea que diga para qué es cada una y los dos valores del killswitch. |
| `platform/src/lib/backend.ts` (nuevo) | 2 | `server-only`. `isServerlessBackend()` (D-1). |
| `platform/src/lib/api/sign-up/index.ts` (nuevo) | 2, 3 y 4 | `server-only`. `signUpApi.requestCode(email)` (parte 2), `verifyCode(email, code)` (parte 3) y `confirm(input)` (parte 4). Una función privada del módulo hace el `fetch` con las cabeceras de D-3 y lanza `ApiError(status, message)` si la respuesta no es 2xx. No registra nada del cuerpo. |
| `platform/src/lib/api/sign-up/types.ts` (nuevo) | 4 | `ConfirmSignUpInput` (`email`, `password`, `verificationToken`) y `CognitoTokens` (`idToken`, `accessToken`, `refreshToken`, `expiresIn`). |
| `platform/src/lib/auth/sign-up-validation.ts` (nuevo) | 2, 3 y 4 | Esquemas de Zod y mensajes de D-7, que usan a la vez los formularios y las actions: correo (parte 2), código (parte 3) y contraseña (parte 4). No toca `form-validation.ts`, que siguen usando el login y la recuperación con las reglas de Better Auth. |
| `platform/src/lib/auth/sign-up-progress.ts` (nuevo) | 2 y 3 | `server-only`. `readSignUpProgress()` (valida el JSON con Zod; si no sirve, no hay avance), `saveSignUpProgress(progress)`, `clearSignUpProgress()` y `secondsUntilResend(progress, now)`, con `path: "/register"`, `RESEND_COOLDOWN_SECONDS = 60` y `SIGN_UP_PROGRESS_MAX_AGE_SECONDS = 3600` (D-4). La parte 3 agrega el token. |
| `platform/src/lib/auth/cognito-session.ts` (nuevo) | 4 | `server-only`. `saveCognitoSession(tokens)` (D-6), con `REFRESH_TOKEN_LIFETIME_DAYS = 30`. |
| `platform/src/lib/auth/cookies.ts` | 2 y 4 | `signUpProgress` (parte 2) y los tres nombres de la sesión (parte 4). El comentario deja de decir que sólo Better Auth guarda la sesión. |
| `platform/src/lib/actions/sign-up/request-sign-up-code.action.ts` (nuevo) | 2 | Killswitch, validación del correo, D-5 y `requestCode`. Si pidió un código, escribe la cookie y llama a `revalidatePath("/register")`. Devuelve `{ status: "success", data: { secondsUntilResend } }` o un error. |
| `platform/src/lib/actions/sign-up/resend-sign-up-code.action.ts` (nuevo) | 3 | Killswitch, correo de la cookie, D-5 y `requestCode`. Devuelve `{ status: "success", data: { wasCodeSent, secondsUntilResend } }` o un error. Sin avance, `revalidatePath("/register")`: la página vuelve al correo. |
| `platform/src/lib/actions/sign-up/verify-sign-up-code.action.ts` (nuevo) | 3 | Killswitch, correo de la cookie, validación del código, `verifyCode`, el token en la cookie y `revalidatePath("/register")`. Sin avance, lo mismo: la página vuelve al correo. |
| `platform/src/lib/actions/sign-up/confirm-sign-up.action.ts` (nuevo) | 4 | Killswitch, correo y token de la cookie, validación, `confirm`, `saveCognitoSession` o el 204, y `redirect`. Con la verificación vencida devuelve un error con `code: "VERIFICATION_EXPIRED"`, sin tocar la cookie (ver «Contrato»). |
| `platform/src/app/(auth)/register/page.tsx` | 2, 3 y 4 | Pasa a ser un server component, con `metadata` («Crea tu cuenta»). Con `api`, `RegisterForm`. Con `serverless`, el paso de la tabla de D-2: el correo (parte 2), el código (parte 3) y la contraseña (parte 4). |
| `platform/src/app/(auth)/register/register-form.tsx` (nuevo) | 2 | El `page.tsx` de hoy, movido sin cambios y exportado como `RegisterForm`. Git lo ve como un renombre. |
| `platform/src/app/(auth)/register/sign-up-email-step.tsx` (nuevo) | 2 | Cliente. El paso del correo (ver «UI»). |
| `platform/src/app/(auth)/register/sign-up-code-step.tsx` (nuevo) | 3 | Cliente. El paso del código, con la cuenta atrás y «Cambiar». |
| `platform/src/app/(auth)/register/sign-up-password-step.tsx` (nuevo) | 4 | Cliente. El paso de la contraseña, la tarjeta «Tu verificación venció» y «Pedir un código nuevo». |
| `platform/src/app/(auth)/confirm-email/page.tsx` | 4 | Con `serverless`, `redirect("/register")` (D-1). Con `api`, como hoy. |
| `platform/src/app/(auth)/login/page.tsx` y `login-form.tsx` | 4 | Leer `registered=ok` y mostrar el aviso de D-7 con el mismo bloque que el de `reset=ok`. |

No cambian `middleware.ts` (`/register` y `/confirm-email` ya son públicas),
`next.config.ts`, `session.ts`, `me.ts` ni `onboarding/`. «Regístrate gratis»
del login sigue apuntando a `/register`.

### e2e

Son pruebas, y no cuentan para el tope de líneas de cada parte. Como el
killswitch vale para todo el proceso, cada valor necesita su propio platform.

- **`platform/e2e/support/fake-backend.mjs` (nuevo):** un servidor `node:http`
  sin dependencias que imita las tres rutas de la spec.
  - Exige `x-api-key` igual a la clave de prueba. Si no, 403 `{"message":"Forbidden"}`,
    como el gateway.
  - Guarda en memoria cada pedido (ruta, `x-real-ip`, `user-agent`, correo y
    código, nunca la contraseña), y `GET /__requests?email=` lo devuelve.
  - El código correcto es `482913`, el mismo del mockup. No es `123456` porque
    la prueba del log lo busca, y un código tan común podría aparecer por
    casualidad. El token de verificación es aleatorio, de 43 caracteres, y
    `confirm` lo exige para el mismo correo.
  - Algunos prefijos del correo fuerzan una respuesta: 429, 500, 403 del
    gateway y 204 en `confirm`. Los elige el engineer.
  - Cada parte agrega su ruta.
- **`platform/playwright.config.ts`:**
  - el platform de hoy (`:3100`) recibe en código `BACKEND=api`,
    encima de `platform/.env.e2e`, y sigue corriendo todas las pruebas de hoy;
  - un `webServer` nuevo, el falso backend;
  - otro `webServer` nuevo, un segundo platform (`:3101`, con su propio
    `NEXT_DIST_DIR`) con `BACKEND=serverless`, `BACKEND_API_URL` (el falso)
    y `BACKEND_API_KEY` (la de prueba), también en código. Así un e2e nunca
    llama al `backend-infra` real, aunque `.env.e2e` lo tuviera;
  - un proyecto `serverless` con `testDir: "./e2e/serverless"` y ese
    `baseURL`.
- **`platform/e2e/serverless/sign-up-email.spec.ts`, `sign-up-code.spec.ts` y
  `sign-up-password.spec.ts` (nuevos)**, uno por parte.
- **`platform/e2e/ui/auth/register-killswitch.spec.ts` (nuevo, parte 2),** en
  el platform de hoy: con `api` y una cookie `sign_up_progress` con
  token puesta por la prueba, `/register` muestra el formulario de hoy.
- **`platform/e2e/README.md`:** una línea que diga que las pruebas con
  `BACKEND=serverless` van en `e2e/serverless/` y corren contra el segundo
  platform y el falso backend. Cambia cómo se escribe una prueba, así que la
  regla de `AGENTS.md` lo permite. Los comandos para correrlas no cambian.
- Las pruebas del registro de hoy no cambian hasta la parte 5: con
  `api`, `/register` es el mismo formulario.

## Contrato con backend-infra

Lo que platform manda y lo que hace con cada respuesta. Todas las peticiones
salen del servidor de platform, con las cabeceras de D-3, y sólo con
`BACKEND=serverless`.

### 1. Pedir el código

`requestSignUpCodeAction` (paso del correo) y `resendSignUpCodeAction` (paso
del código) mandan `POST ${BACKEND_API_URL}/api/auth/sign-up/code`:

```json
{ "email": "lucia.paredes@gmail.com" }
```

| Respuesta | En el paso del correo | Al reenviar, en el paso del código |
| --- | --- | --- |
| 202 | Escribe el avance `{ email, codeRequestedAt: ahora }`, sin token, y `revalidatePath("/register")`: la página pasa al código. | Escribe el nuevo `codeRequestedAt` y devuelve `wasCodeSent: true` con `secondsUntilResend: 60`. El paso muestra «Te enviamos un código nuevo.». |
| 400 | El `message` bajo el campo del correo. | El `message`, en rojo debajo del enlace de reenvío: en este paso no hay campo del correo. |
| 429 | «Demasiados intentos. Intenta de nuevo en unos minutos.» sobre el botón. | El mismo texto, en rojo debajo del enlace. |
| Otra, o sin red | «No pudimos enviarte el código. Intenta de nuevo.» sobre el botón. | El mismo texto, en rojo debajo del enlace. |

Con el mismo correo dentro del minuto no hay petición, ni al pedir ni al
reenviar: ver D-5.

### 2. Verificar el código

`verifySignUpCodeAction` manda `POST /api/auth/sign-up/code/verify` con el
correo de la cookie:

```json
{ "email": "lucia.paredes@gmail.com", "code": "482913" }
```

| Respuesta | Qué hace platform |
| --- | --- |
| 200 `{ verificationToken }` | Guarda el token en el avance y `revalidatePath("/register")`: la página pasa a la contraseña. |
| 400 | El `message` bajo el campo del código. |
| 429 | «Demasiados intentos. Intenta de nuevo en unos minutos.» |
| Otra, o sin red | «No pudimos comprobar el código. Intenta de nuevo.» |

Sin avance, porque la cookie venció, no llama al backend y hace
`revalidatePath("/register")`: la página vuelve al correo.

### 3. Crear la cuenta

`confirmSignUpAction` manda `POST /api/auth/sign-up/confirm` con el correo y el
token de la cookie:

```json
{ "email": "lucia.paredes@gmail.com", "password": "…", "verificationToken": "…" }
```

No manda `acceptedTerms` ni las versiones: con `TERMS_ACCEPTANCE_REQUIRED`
apagado, la Lambda no las pide [spec] (ver «Fuera de alcance»).

| Respuesta | Qué hace platform |
| --- | --- |
| 200 con los tokens | `saveCognitoSession`, borra el avance y `redirect("/onboarding")`. |
| 204 | Borra el avance y `redirect("/login?registered=ok")`. |
| 400 «Tu verificación venció. Vuelve a pedir el código.» | No toca la cookie y devuelve un error con `code: "VERIFICATION_EXPIRED"`: el paso cambia a la tarjeta «Tu verificación venció» (D-4). |
| 400 con otro mensaje | El `message` arriba del botón, por ejemplo si una regla de la contraseña cambió en `backend-infra`. |
| 429 | «Demasiados intentos. Intenta de nuevo en unos minutos.» |
| Otra, o sin red | «No pudimos crear tu cuenta. Intenta de nuevo.» Conserva el token: si la cuenta no se creó, se puede reintentar dentro de los 15 minutos. |

- **Sin token o sin cookie,** porque venció mientras el paso estaba abierto, se
  responde lo mismo que a una verificación vencida, sin llamar al backend. El
  paso conoce el correo, que recibió al renderizarse, así que «Pedir un código
  nuevo» lo trae escrito igual.
- La comparación con el texto de la verificación vencida es exacta. Si
  `backend-infra` lo cambiara, el mensaje nuevo se vería arriba del botón, que
  también se entiende.

## Aislamiento entre cuentas

- **No se lee ni se escribe ningún dato de una cuenta.** El registro ocurre
  antes de que exista una cuenta (`Account`) o una membership: no hay
  `accountId` que acotar.
- **Lo que reciben las actions:** el correo, el código y la contraseña del
  formulario, más el correo y el token de la cookie. No reciben ids.
- **Quién relaciona los datos:** el backend. El código va con el correo
  (`SIGN_UP_CODE#<correo>`), y el token se gasta sólo si es de ese correo, en la
  misma transacción que crea la cuenta [spec]. Platform no decide nada: reenvía.
  Si alguien edita su cookie, sólo consigue un 400 para sí mismo.
- **Los tokens de Cognito** se escriben sólo con la respuesta a esa misma
  petición, en el navegador que la hizo. Nadie los lee en este plan.
- **La clave del gateway** identifica a platform, no a una persona, y nunca sale
  del servidor.
- **No hay endpoint público nuevo en `api/`.** Las server actions de `/register`
  son públicas, como la página, y sólo hablan con las tres rutas de la spec, y
  sólo con `serverless`.

## Riesgos de seguridad

| Riesgo | Mitigación | Lo que queda |
| --- | --- | --- |
| La clave del gateway llega al navegador | Sin `NEXT_PUBLIC_`, `server-only` en el cliente y en la cookie, y una prueba e2e que busca la clave en todo lo que recibe el navegador. | — |
| El token de verificación en una URL, un log o el HTML | Va en el cuerpo del `POST` y en una cookie HttpOnly con `path: "/register"`. La página no se lo pasa a los componentes de cliente, y nada lo registra. La prueba e2e busca el token en las URL y en todo lo que recibe el navegador, salvo el `Set-Cookie` de `sign_up_progress`, que es donde se guarda. | Puede quedar en la cookie hasta una hora, aunque a los 15 minutos el backend ya no lo acepta. |
| Los tokens de Cognito accesibles desde JavaScript | `httpOnly`, `secure`, `sameSite: "lax"`. Nunca van en la respuesta de una action: sólo en el `Set-Cookie` de sus tres cookies. | Hasta que la app los lea, nadie los usa ni los refresca. |
| Todas las personas en un mismo cupo por IP | Se reenvía `x-real-ip` (D-3), y la prueba e2e comprueba que llega. | Depende de que el borde de Railway pise la cabecera del cliente (P1 heredada, prerrequisito 6). |
| Saber si un correo tiene cuenta | Platform pasa al paso del código con cualquier 202 y no mira nada más. No agrega ninguna rama distinta. | — |
| Gastar el cupo de la IP sin querer | D-5: el mismo correo dentro del minuto no llama al backend, y validar antes de llamar evita los pedidos inválidos. | Más de 3 envíos en 10 minutos desde una misma IP (una clínica) responden 429, como dice la spec. |
| CSRF contra las actions | Next compara `Origin` y `Host` en cada server action. Las cookies son `lax`. | — |
| Contraseña, código o token en los logs de platform | Las actions no hacen `console.*` del cuerpo ni del error del backend: como mucho la ruta y el código de respuesta. Una prueba e2e busca la contraseña, el código y el token en el log de platform. | — |
| El registro nuevo abierto en producción antes de tiempo | El killswitch (D-1), en la página y en cada action, con `api` por defecto. Con `api`, la página ignora `sign_up_progress`. | — |

## Riesgos y casos límite

- **Pasar a `serverless` sin el login ni la sesión.** El killswitch cambia
  todo de una vez y no se vuelve atrás. Si el login y la sesión todavía no lo
  respetan, quien crea su cuenta termina en un login de Better Auth que no la
  conoce. Por eso los prerrequisitos 2 y 3.
- **Dos copias de las mismas reglas.** Las reglas de validación están en
  platform y en `backend-infra` (no hay un paquete compartido). Si se separan,
  se ve el 400 del backend, en español. Lo mismo con los 30 días del refresh
  token: si cambian en `wizydoc-platform`, se cambia también la constante de
  platform.
- **Un token vencido no se nota hasta «Crear cuenta».** Quien vuelve a
  `/register` después de 15 minutos ve la contraseña, la escribe y recién al
  pulsar ve la tarjeta. Saberlo antes obligaría a guardar en la cookie cuándo
  se verificó, y el backend ya lo dice (D-4).
- **El botón atrás del navegador sale del registro** (D-2). Quien lo pulsa en
  el código esperando corregir el correo vuelve a la página anterior. Al
  volver a `/register`, sigue en el código, con «Cambiar» a la vista.
- **`revalidatePath` vuelve a renderizar con la cookie recién escrita**
  [inferencia]: Next aplica las cookies que escribe una action al render que
  devuelve, así que la página ve el paso nuevo. La prueba de la parte 3 lo
  comprueba al pasar del correo al código.
- **Un e2e más lento.** El segundo platform compila su propio `next dev`, y la
  suite tarda más en arrancar.
- **`secure` en `http://localhost`** [inferencia]: Chromium acepta cookies
  `Secure` en `localhost`, así que los e2e (`next dev` en `:3100` y `:3101`)
  deberían guardarlas. El engineer lo comprueba en la primera prueba. Si no las
  guarda, `secure` depende de `NODE_ENV`.
- **Si platform deja Railway** (`build:open-next`), `x-real-ip` deja de
  llegar del borde. La cabecera de la IP se revisa en ese ticket.
- **Dos pestañas:** gana la última cookie escrita, y al recargar, cada pestaña
  muestra el paso de esa cookie. Si se verifica el código del otro correo, el
  backend responde 400.
- **Quien tiene sesión de Better Auth en local y crea otra cuenta:** quedan las
  dos cookies, y la app sigue mostrando la de Better Auth. Lo resuelve el ticket
  de la sesión. En producción no pasa, porque el killswitch cambia todo junto.
- **El refresh token** viaja en cada petición a platform (`path: "/"`), cerca
  de 2 KB. Si el ticket de la sesión decide acotarlo a una ruta de refresco, lo
  cambia ahí.
- **Empezar en un navegador y seguir en otro:** la cookie es de su navegador.
  Si abre el correo en el celular y escribe el código en la computadora,
  funciona. Si empieza el registro en un navegador y lo sigue en otro, vuelve al
  correo.

## Preguntas para el humano

Ninguna.

**Lo que sólo puede hacer el humano** (no son decisiones):
- Si quiere probar en local con correos reales: `BACKEND=serverless`,
  `BACKEND_API_URL` y `BACKEND_API_KEY` del gateway de staging de
  `backend-infra` en su `platform/.env`. La clave sale del output
  `PlatformApiKeyId` del stack. Si no, en local se usa el falso backend de los
  e2e.
- Al pasar producción a `serverless`: las variables del prerrequisito 9 y la P1
  de `fix-auth-rate-limit-ip`.

## Verificación

### Typecheck y check

`cd platform && pnpm typecheck && pnpm check` en cada parte.

### e2e (`cd platform && ./node_modules/.bin/playwright test`)

El proyecto `serverless` corre contra el falso backend. Para correr sólo esas
pruebas: `./node_modules/.bin/playwright test --project=serverless`.

«Lo que recibe el navegador» tiene el mismo sentido que en los criterios: las
URL, y el cuerpo y las cabeceras de todas las respuestas, salvo el `Set-Cookie`
de las cookies que escribe este plan. En todas las pruebas del registro nuevo,
la URL sigue siendo `/register` hasta el final.

**Parte 2, el killswitch y el correo:**
- En el platform de hoy (`api`), con una cookie `sign_up_progress` con
  token puesta por la prueba, `/register` muestra el formulario de hoy.
- Con `X-Real-IP: 203.0.113.40` en las cabeceras del navegador
  (`extraHTTPHeaders`), el falso backend recibe esa `x-real-ip`, el `user-agent`
  del navegador y la clave de prueba en `x-api-key`.
- El valor de la clave no aparece en nada que reciba el navegador, y el
  navegador no hace ninguna petición a `BACKEND_API_URL`.
- `sign_up_progress` queda `httpOnly`, con `path` `/register`, `sameSite` `Lax`,
  y vence a la hora.
- Un correo inválido muestra «Correo inválido» y el falso backend no recibe
  nada.
- Con 429, con 500 y con el 403 del gateway, cada uno muestra su mensaje en
  español, nunca «Forbidden».
- En la parte 2, después de «Continuar», la página sigue en el correo: el paso
  del código llega en la parte 3. La prueba mira el pedido y la cookie.

**Parte 3, el código:**
- Después de «Continuar», la página muestra «Revisa tu correo» en `/register`,
  con el foco en el campo. Recargar sigue en el código.
- El mismo correo dos veces dentro del minuto, con «Cambiar» en medio, llega
  una sola vez al falso backend.
- Con `482913`, el falso backend recibe la verificación y la cookie guarda el
  token. En la parte 3 la página sigue en el código, porque la contraseña llega
  en la parte 4. El token no aparece en ninguna URL ni en nada más de lo que
  recibe el navegador: sólo en el `Set-Cookie` de `sign_up_progress`.
- Un código incorrecto muestra el mensaje único. Con menos de 6 dígitos, «Escribe
  los 6 dígitos del código.», sin llamar al backend.
- Al escribir el sexto dígito, o al pegar «482 913», se envía solo.
- **El minuto del reenvío, sin esperarlo.** Lo cuenta el servidor desde
  `codeRequestedAt` (D-5), así que `page.clock` sólo movería la cuenta del
  navegador, y la action seguiría negándose. La prueba:
  1. llega al código y comprueba «Reenviar en 60 s» deshabilitado;
  2. lee `sign_up_progress` con `context.cookies()`, pone `codeRequestedAt` 61
     segundos antes y la vuelve a escribir con `context.addCookies()`, con el
     mismo formato, `path` y `httpOnly`. Se puede porque la cookie no está
     firmada (D-4);
  3. recarga `/register`: el servidor calcula 0 s y se ve «Reenviar código»;
  4. lo pulsa: el falso backend recibe un pedido más, aparece «Te enviamos un
     código nuevo.» y vuelve «Reenviar en 60 s» deshabilitado.
- «Cambiar» muestra el correo escrito, con el foco en el campo, y la cookie no
  cambia.

**Parte 4, la contraseña, la sesión y `/confirm-email`:**
- Con `serverless`, `/confirm-email` responde 307 hacia `/register`.
- Después de verificar, la página muestra «Crea tu contraseña» en `/register`.
  Recargar sigue en la contraseña.
- Con 200, las tres cookies de la sesión quedan `httpOnly`, `Lax`, con `path`
  `/`, y el refresh token vence a los 30 días. `sign_up_progress` se borra.
  Navega a `/onboarding`, que hoy lleva a `/login` (D-6).
- El cuerpo que recibe el falso backend lleva sólo `email`, `password` y
  `verificationToken`.
- Con 204, llega a `/login` con «Tu cuenta quedó creada. Inicia sesión con tu
  correo y tu contraseña.».
- Con la verificación vencida, se ve la tarjeta, y «Pedir un código nuevo»
  muestra el correo escrito, con el foco en el campo.
- Una contraseña de 7 caracteres o una que empieza con un espacio muestran su
  error sin llamar al backend.
- Ni la contraseña, ni el código, ni el token aparecen en el log del segundo
  platform. El código se busca con dígitos que no lo toquen a los lados
  (`/(?<!\d)482913(?!\d)/`), para no confundirlo con una hora o un puerto.
- A 375 px, con un correo largo, los tres pasos no tienen desplazamiento
  horizontal (`scrollWidth <= 375`).

### Manual, en local

- **Con `api`** (sin `BACKEND`): `pnpm dev`, y `/register` y
  `/confirm-email` se ven como hoy. Revisar en el diff que las cuatro actions
  consultan el killswitch antes de llamar al backend.
- **Con `serverless`:** `pnpm dev` con el falso backend
  (`node e2e/support/fake-backend.mjs`) o con el gateway de staging (ver «Lo
  que sólo puede hacer el humano»). Recorrer los tres pasos a 375 y a 1280 px y
  compararlos con el mockup. El botón atrás del navegador, desde cualquier
  paso, sale de `/register`.
- **El killswitch se lee al construir:** `next build` con `serverless` y
  después con `api`. `/register` muestra el flujo nuevo y
  `/confirm-email` redirige sólo con el primero.
- **Mockup:** `npx -y lavish-axi docs/features/registro-con-codigo/mockup.html`.

## UI

### Rutas y layout

Los tres pasos viven en `/register`, dentro del grupo `(auth)`, y usan su
`layout.tsx` actual: fondo
`bg-gradient-to-br from-brand-surface via-white to-brand-surface`, logo arriba
a la izquierda (enlace a `/login`), tarjeta `AuthCard` centrada (`max-w-md`,
`p-5 sm:p-8`) y el pie con el copyright. Son públicas y no dependen de rol ni
de plan.

| Ruta | Qué muestra |
| --- | --- |
| `/register` | Con `api`, el formulario de hoy. Con `serverless`, «Crea tu cuenta», «Revisa tu correo» o «Crea tu contraseña», según la cookie, o la tarjeta «Tu verificación venció» |
| `/confirm-email` | Con `api`, como hoy. Con `serverless`, 307 hacia `/register` |
| `/login?registered=ok` | Login actual con el aviso del 204 |

No lleva `loading.tsx` ni `error.tsx`: no lee datos del api, sólo la cookie, y
cada fallo del backend se muestra en la tarjeta.

### Árbol de componentes

```
(auth)/layout.tsx                                         existente
├─ register/page.tsx                                      server: killswitch y paso según la cookie
│  ├─ RegisterForm                                        register/register-form.tsx, el de hoy, movido
│  ├─ SignUpEmailStep { defaultEmail?, onCodeRequested? } nuevo
│  │  ├─ AuthCard                                         components/common/auth-card.tsx
│  │  ├─ Input name="email"                               components/common/form/input.tsx
│  │  └─ Button                                           components/ui/button.tsx
│  ├─ SignUpCodeStep { email, secondsUntilResend }        nuevo
│  │  ├─ AuthCard
│  │  ├─ Input name="code" (inputMode, className)         components/common/form/input.tsx
│  │  ├─ Button
│  │  ├─ «Reenviar» (<button> con TEXT_LINK_CLASS)        inline
│  │  └─ con «Cambiar»: SignUpEmailStep { defaultEmail: email, onCodeRequested }
│  └─ SignUpPasswordStep { email }                        nuevo
│     ├─ AuthCard
│     ├─ PasswordInput                                    components/common/form/password-input.tsx
│     ├─ Button
│     ├─ «Tu verificación venció» (AuthCard con XCircle, tone="danger")
│     └─ con «Pedir un código nuevo»: SignUpEmailStep { defaultEmail: email }
├─ confirm-email/page.tsx                                 existente, redirect con serverless
└─ login/page.tsx → LoginForm { …, accountCreated? }      existente, prop nueva
```

- **Componentes nuevos:** sólo los tres pasos, uno por archivo, como
  `LoginForm` y `ForgotPasswordForm`.
- **`onCodeRequested`** sólo lo usa el código: al volver del correo con el
  mismo correo dentro del minuto, la página no cambia de paso, así que el
  código tiene que dejar de mostrar el correo y seguir la cuenta con los
  segundos que devolvió la action. Con un correo distinto, la página se vuelve
  a renderizar con el código nuevo.
- La tarjeta «Tu verificación venció» copia el marcado de «Este enlace ya no
  sirve» de `reset-password-form.tsx`, con otro texto y otra acción.
- **El código usa `Input` sin cambiarlo:** `inputMode`, `autoComplete`,
  `maxLength` y `onChange` pasan por `...rest`. La letra grande va en
  `className`. `Input` concatena las clases sin `cn`, pero `text-2xl` le gana a
  `text-sm` porque Tailwind la genera después.
- **`PasswordInput` no cambia.** Sin `hint`: las reglas van en el `placeholder`
  («Mínimo 8 caracteres»), como en el registro de hoy, y el error explica la del
  espacio si pasa.
- En la contraseña hay un `<input type="email" autoComplete="username">` oculto
  con el correo. Así el gestor de contraseñas guarda la nueva con ese correo.
  La action no lo lee: el correo sale de la cookie.
- **Sin la casilla de los términos** (ver «Fuera de alcance»). Cuando vuelva,
  va entre la contraseña y el botón.

### Qué dato alimenta cada parte

| Parte de la pantalla | Dato |
| --- | --- |
| Qué paso se ve | `sign_up_progress`, leída por `register/page.tsx` (D-2) |
| Correo escrito al volver con «Cambiar» o «Pedir un código nuevo» | `email`, la prop del paso que vuelve |
| Correo en el código y en la contraseña | `email` de la cookie |
| «Reenviar en N s» | `secondsUntilResend`, calculado por `register/page.tsx` desde `codeRequestedAt`, y después por las actions (D-5) |
| «Te enviamos un código nuevo.» | `wasCodeSent: true` de `resendSignUpCodeAction` |
| Errores y avisos | El `ActionState` de cada action (D-7) |
| Tarjeta «Tu verificación venció» | `code: "VERIFICATION_EXPIRED"` de `confirmSignUpAction` |
| Aviso del login | `?registered=ok` |

### Textos

| Paso | Título | Descripción y textos |
| --- | --- | --- |
| Correo | «Crea tu cuenta» | «Empieza gratis, sin tarjeta de crédito». Campo «Correo electrónico» (`placeholder="ana@consultorio.com"`), con la ayuda «Te enviaremos un código para confirmarlo.». Botón «Continuar». Pie: «¿Ya tienes cuenta? Inicia sesión». |
| Código | «Revisa tu correo» | «Escribe el código de 6 dígitos que te enviamos. Vence en 10 minutos.». Debajo, el correo en un recuadro `bg-brand-surface` con «Cambiar» (para el lector de pantalla, «Cambiar correo»). Campo «Código de 6 dígitos», con la ayuda «Si no lo ves, revisa la carpeta de spam.». Botón «Verificar código». «¿No te llegó? Reenviar en 42 s», que pasa a «Reenviar código». Pie: «¿Ya tienes cuenta? Inicia sesión». |
| Contraseña | «Crea tu contraseña» | «Con ella entrarás a WizyDoc como {correo}.». `PasswordInput` «Contraseña» (`placeholder="Mínimo 8 caracteres"`). Botón «Crear cuenta». |
| Verificación vencida | «Tu verificación venció» | «Vuelve a pedir el código.». Botón «Pedir un código nuevo». |

El pie «¿Ya tienes cuenta? Inicia sesión» del código también sirve a quien ya
tenía cuenta y recibió «Intentaron crear una cuenta con tu correo», sin decir
nada que no se vea con cualquier correo.

### Estados

| Paso | Estado | Qué se ve |
| --- | --- | --- |
| Correo | Normal | Ver «Textos». Sin foco automático al abrir `/register`. |
| Correo | Al volver con «Cambiar» o «Pedir un código nuevo» | El correo escrito y el foco en el campo. |
| Correo | Carga | Botón deshabilitado con `Loader2` y «Enviando código…». El campo queda `readOnly`. |
| Correo | Error de campo | «Correo inválido» debajo del campo, con el borde rojo. |
| Correo | 429 | Aviso `bg-red-50 text-red-700` sobre el botón: «Demasiados intentos. Intenta de nuevo en unos minutos.». |
| Correo | Fallo o sin red | «No pudimos enviarte el código. Intenta de nuevo.» |
| Código | Normal | El campo con el foco. «Reenviar en 60 s» deshabilitado, contando hacia atrás. |
| Código | Carga | «Verificando…» en el botón, y el campo `readOnly`. |
| Código | Incompleto | «Escribe los 6 dígitos del código.» debajo del campo. |
| Código | Código que no sirve | «El código no es correcto o ya venció. Pide uno nuevo si lo necesitas.» debajo del campo. El texto del campo queda seleccionado para volver a escribir. |
| Código | 429 | «Demasiados intentos. Intenta de nuevo en unos minutos.» sobre el botón. |
| Código | Fallo o sin red | «No pudimos comprobar el código. Intenta de nuevo.» |
| Código | Puede reenviar | «Reenviar código», con el color de los enlaces. |
| Código | Reenviando | «Enviando…» con `Loader2` en el enlace, deshabilitado. |
| Código | Reenviado | «Te enviamos un código nuevo.» (`role="status"`, con `CheckCircle2`), y «Reenviar en 60 s» otra vez. |
| Código | Reenvío dentro del minuto | Se ve igual que la cuenta atrás: «Reenviar en N s» con los segundos que devolvió el servidor, sin «Te enviamos un código nuevo.» (D-5). |
| Código | Reenvío con 400, 429 o fallo | El mensaje del pedido, en rojo, debajo del enlace. El enlace vuelve a estar disponible. |
| Contraseña | Normal | El campo con el foco. |
| Contraseña | Carga | «Creando tu cuenta…» en el botón. |
| Contraseña | Error de campo | Debajo del campo, uno de los tres mensajes de la contraseña de la spec, con el foco en el campo. |
| Contraseña | Fallo o sin red | «No pudimos crear tu cuenta. Intenta de nuevo.» Lo escrito se conserva. |
| Contraseña | Verificación vencida | La tarjeta de «Textos», con el foco en el título. |
| Login | Tras el 204 | El aviso teal del login (`bg-brand-teal/10 text-brand-teal-dark`, con `CheckCircle2`), el mismo bloque que el de `?reset=ok`, con «Tu cuenta quedó creada. Inicia sesión con tu correo y tu contraseña.». |
| Todos | Vacío | No aplica: no hay listas. |
| Todos | 403 | No aplica: son públicos y no hay membership. El 403 del gateway (clave mala) se ve como el fallo de cada paso. |
| Todos | 402 | No aplica: registrarse es igual en todos los planes, y la cuenta todavía no tiene plan. |

### Interacciones

- **«Continuar»:** valida el correo en el cliente. Si sirve, llama a
  `requestSignUpCodeAction`. Con 202, la página pasa al código sin cambiar de
  URL. Sin toasts: todo pasa en la tarjeta.
- **«Cambiar»** muestra el correo en la misma tarjeta, con el correo escrito y
  el foco en el campo. No toca la cookie: recargar vuelve al código.
- **El campo del código:** deja sólo los dígitos, hasta 6. Al sexto, envía el
  formulario (`requestSubmit`).
- **«Verificar código»:** si faltan dígitos, muestra el error sin llamar al
  backend. Si no, llama a `verifySignUpCodeAction`. Con 200, la página pasa a la
  contraseña.
- **«Reenviar código»:** sólo se puede pulsar con la cuenta en 0. Llama a
  `resendSignUpCodeAction`.
  - Con `wasCodeSent: true`, muestra «Te enviamos un código nuevo.», vacía el
    campo, le devuelve el foco y reinicia la cuenta en 60.
  - Con `wasCodeSent: false`, sigue la cuenta desde los segundos que devolvió,
    sin ningún aviso.
  - Con un error, lo muestra en rojo debajo del enlace.
- **«Crear cuenta»:** valida la contraseña en el cliente y llama a
  `confirmSignUpAction`.
  - Con 200 va a `/onboarding`.
  - Con 204, a `/login?registered=ok`.
  - Con la verificación vencida, cambia a la tarjeta.
- **«Pedir un código nuevo»** muestra el correo en la misma tarjeta, con el
  correo escrito y el foco en el campo. Al pedir el código, la cookie se
  reescribe sin el token y la página pasa al código.
- **El botón atrás del navegador** sale de `/register`, a la página anterior.
  Al volver, la página muestra el paso de la cookie.
- **«Inicia sesión»** lleva a `/login`.
- **Los botones** quedan deshabilitados mientras su action no termina, también
  mientras la página se vuelve a renderizar con el paso siguiente o navega,
  como en el login.

### Diferencias por rol

Ninguna. ADMIN, DOCTOR y USER no existen todavía: el rol viene de una membership,
y quien se registra no tiene ninguna. El invitado no pasa por aquí: crea su
contraseña en `/invite/accept`.

### Accesibilidad

- **Campos:** todos con `<label>` asociado (`Input` y `PasswordInput`). Los
  errores llevan `aria-invalid`, `aria-describedby` y `role="alert"`, como ya
  hace `Field`. Las ayudas van en `aria-describedby`.
- **Avisos:** el error de la tarjeta lleva `role="alert"`. «Te enviamos un
  código nuevo.» y el aviso del login, `role="status"`.
- **La cuenta atrás** no se anuncia cada segundo: el texto del botón cambia sin
  región viva. Al llegar a 0, una región `role="status"` oculta
  (`sr-only`) dice «Ya puedes pedir otro código.».
- **«Reenviar» deshabilitado** sale del orden de tabulación, y su texto visible
  dice cuánto falta.
- **Foco al cambiar de paso.** Los pasos cambian sin navegar, así que Next no
  anuncia nada y el elemento que tenía el foco desaparece. Cada paso pone el
  foco donde se sigue:
  - al abrir `/register` en el correo, no se mueve, como en el login y la
    recuperación;
  - al volver al correo con «Cambiar» o «Pedir un código nuevo», al campo del
    correo;
  - el código y la contraseña llevan `autoFocus` en su campo, que se cumple al
    montar el paso, también al recargar;
  - en la tarjeta vencida, al título (`titleRef`, `<h1 tabIndex={-1}>`);
  - con un error de campo, al primer campo inválido (`useFocusFirstInvalid`).
- **Orden de tabulación:**
  - **Correo:** logo, correo, «Continuar», «Inicia sesión».
  - **Código:** logo, «Cambiar», código, «Verificar código», «Reenviar»,
    «Inicia sesión».
  - **Contraseña:** logo, contraseña, «Mostrar», «Crear cuenta».
  - Enter envía el formulario en los tres.
- **Teclado del celular:** `type="email"` con `autoComplete="email"` en el
  correo. `inputMode="numeric"` y `autoComplete="one-time-code"` en el código,
  y `autoComplete="new-password"` en la contraseña.
- **Objetivos táctiles:** botones `h-10` a ancho completo. «Reenviar»,
  «Cambiar» e «Inicia sesión» usan `TEXT_LINK_CLASS` (`min-h-10`).
- **A 375 px:** la tarjeta usa el ancho completo con el `px-4` del layout, y el
  correo largo se corta con `break-all`. Sin desplazamiento horizontal.

## Partes

Cada parte se puede mergear sola sin romper `main`: producción y staging siguen
en `api`, y con ese valor `/register` muestra el formulario de hoy. Los
tamaños son de código de producción, sin pruebas ni docs.

| Parte | Qué incluye | Depende de | Cómo se verifica sola | Tamaño |
| --- | --- | --- | --- | --- |
| 1. Docs | `docs/features/registro-con-codigo/plan.md` y `mockup.html`, y después los criterios del product-manager. | — | Revisión del humano. El mockup con Lavish. | 0 |
| 2. El killswitch y el correo | `.env.example`; `backend.ts`; `lib/api/sign-up/index.ts` con `requestCode`; `sign-up-validation.ts` (correo); `sign-up-progress.ts` (sin token); `COOKIE_NAMES.signUpProgress`; `request-sign-up-code.action.ts`; `register/page.tsx` (killswitch y el correo), `register-form.tsx` (movido) y `sign-up-email-step.tsx`. En pruebas: el falso backend con `/code`, el segundo platform, el proyecto `serverless`, `sign-up-email.spec.ts`, `register-killswitch.spec.ts` y la línea del README. | 1 | `typecheck`, `check` y la suite e2e. Las pruebas del registro de hoy siguen pasando sin cambios. Después de «Continuar», la página sigue en el correo: el e2e comprueba la petición, las cabeceras y la cookie. | ~300 líneas, sin contar el formulario movido |
| 3. El código | `sign-up-code-step.tsx` (con «Cambiar»); el código en `register/page.tsx`; `verify-sign-up-code.action.ts` y `resend-sign-up-code.action.ts`; `verifyCode` en el cliente; el token en `sign-up-progress.ts`; el código en `sign-up-validation.ts`; `onCodeRequested` en `sign-up-email-step.tsx`. En pruebas: `/code/verify` en el falso backend y `sign-up-code.spec.ts`. | 2 | `typecheck`, `check` y la suite e2e. Un código correcto guarda el token, y la página sigue en el código. | ~360 líneas |
| 4. La contraseña, la sesión y `/confirm-email` | `sign-up-password-step.tsx`; la contraseña en `register/page.tsx`; `confirm-sign-up.action.ts`; `confirm` y `types.ts` en el cliente; `cognito-session.ts`; las cookies de la sesión en `COOKIE_NAMES`; la contraseña en `sign-up-validation.ts`; el aviso del login; el `redirect` de `confirm-email/page.tsx`. En pruebas: `/confirm` en el falso backend y `sign-up-password.spec.ts`. | 3 | `typecheck`, `check` y la suite e2e. Con `serverless`, el registro completo en `/register` contra el falso backend. | ~330 líneas |
| 5. Borrar el formulario viejo | En cuanto producción y staging estén en `serverless`: como no hay vuelta atrás, el formulario viejo ya no lo usa nadie. Se borran `register/register-form.tsx` y `confirm-email/page.tsx`, que sólo abría el registro viejo. `register/page.tsx` muestra siempre el flujo nuevo. Se quitan la consulta al killswitch en las cuatro actions, y `backend.ts` si nadie más lo usa. En pruebas: se borran `register.spec.ts`, `register-form.spec.ts`, `register-killswitch.spec.ts`, `registerViaUi` y `confirmEmailViaLink`, y el segundo platform se junta con el primero. | 4, y producción y staging en `serverless` | `typecheck`, `check` y la suite e2e completa. | Sobre todo borra (neto negativo) |

- **Pasar producción a `serverless` no es una parte:** es cambiar la variable
  y desplegar, cuando se cumpla «Antes de pasar producción a `serverless`». No
  se vuelve atrás.
- La parte 5 se vuelve a revisar antes de empezarla: depende de cómo queden el
  login, la sesión y los e2e después del corte del api.
- Ninguna parte toca `docs/PRODUCT.md` ni `docs/capacidades.md`.
  `platform/e2e/README.md` sólo cambia en la parte 2, con la línea de las
  pruebas de `e2e/serverless/`.
- Las partes 2 a 4 se apilan con `gh stack` si la anterior no está mergeada.

## Criterios de aceptación

Escritos por el product-manager el 8 de noviembre de 2026, a partir de este plan
y del mockup aprobados y de la spec de WIZ-75. Ajustados el 8 de noviembre de
2026 a la página única `/register`.

- **[e2e]** lo cubre Playwright: el registro nuevo, en el segundo platform contra
  el falso backend; el killswitch, en el platform de hoy. Cada prueba se llama
  por lo que comprueba, sin citar ningún criterio.
- **[manual]** lo comprueba el engineer o el reviewer en el navegador, en el diff
  o con `next build`. Platform no tiene pruebas unitarias.
- Entre paréntesis, la parte que entrega lo que el criterio comprueba.
- Donde «Verificación» y estos criterios difieren en qué es **[e2e]**, mandan
  estos criterios.

Convenciones:
- «El platform de hoy» es el de `:3100`, con `BACKEND=api`. «El
  segundo platform» es el de `:3101`, con `serverless`.
- «El falso backend recibe» quiere decir que el pedido aparece en su
  `GET /__requests`.
- «Lo que recibe el navegador» son las URL, y el cuerpo y las cabeceras de todas
  las respuestas (HTML, RSC, JS y las de las server actions), salvo el
  `Set-Cookie` de las cookies que escribe este plan, que es por donde deben
  viajar.
- Salvo que se diga otra cosa, las pantallas se prueban a 375 px.

### El killswitch

- **[e2e]** (parte 2; las partes 3 y 4 no lo cambian) En el platform de hoy,
  `/register` muestra el formulario de hoy, con nombre, apellido, celular,
  correo y contraseña, también con una cookie `sign_up_progress` con token en
  el navegador.
- **[e2e]** (parte 4) En el segundo platform, `/register` muestra el paso del
  correo, `/confirm-email` responde 307 hacia `/register`, y en `/register` se
  completa el registro hasta `/onboarding` contra el falso backend, sin que la
  URL cambie antes del final.
- **[manual]** (partes 2, 3 y 4) Cada una de las cuatro server actions comprueba
  el killswitch antes que nada. Con `api` termina sin llamar al backend
  ni escribir cookies.
- **[manual]** (parte 2) Sólo el valor exacto `serverless` enciende el registro
  nuevo. Sin la variable, vacía o con otro texto (`Serverless`, `serverles`),
  `/register` muestra el formulario de hoy.
- **[manual]** (parte 4) El cambio necesita un build. Con `next build` y
  `serverless`, `/register` muestra el flujo nuevo y `/confirm-email` redirige
  a `/register`. Con `next build` y `api`, las dos se ven como hoy.
- **[manual]** (parte 2) `.env.example` trae `BACKEND=api`,
  `BACKEND_API_URL=` y `BACKEND_API_KEY=`, cada una con una línea que dice para
  qué sirve. La de `BACKEND` nombra los dos valores.

### Pantalla 1: el correo

- **[e2e]** (parte 2) En el segundo platform, con un correo válido en
  `/register`, «Continuar» hace que el falso backend reciba un solo
  `POST /api/auth/sign-up/code` con ese correo. En la parte 2 la página sigue
  en el correo, porque el paso del código llega en la parte 3: la prueba mira el
  pedido y la cookie.
- **[e2e]** (parte 2) Después de «Continuar», la cookie `sign_up_progress` es
  `httpOnly`, con `path` `/register` y `sameSite` `Lax`, y vence a la hora.
- **[manual]** (parte 2) Un correo mal escrito, con más de 64 caracteres antes de
  la `@` o con más de 254 en total muestra «Correo inválido» debajo del campo,
  con el borde rojo y el foco ahí, y no llega al backend. El correo se manda
  recortado y en minúsculas.
- **[manual]** (parte 2) Con un 400, el `message` del backend debajo del campo.
  Con un 429, «Demasiados intentos. Intenta de nuevo en unos minutos.» sobre el
  botón. Con el 403 del gateway, un 500, sin red o con un cuerpo que no es JSON,
  «No pudimos enviarte el código. Intenta de nuevo.». Nunca se ve un texto en
  inglés del gateway («Forbidden», «Too Many Requests»), y el campo conserva lo
  escrito.
- **[manual]** (parte 2) El mismo correo otra vez dentro del minuto no llega al
  backend: va directo al código con los segundos que faltaban. Un correo
  distinto sí llega y empieza un avance sin token.
- **[manual]** (partes 3 y 4) «Cambiar», en el código, y «Pedir un código
  nuevo», en la tarjeta vencida, muestran el paso del correo con su correo
  escrito y el foco en el campo.
- **[manual]** (parte 2) La pantalla coincide con «Textos», «Estados» y el
  mockup: «Enviando código…» con el spinner y el campo de sólo lectura mientras
  carga, sin foco automático al abrir `/register`, `type="email"` con
  `autoComplete="email"`, y «Inicia sesión» lleva a `/login`.

### Pantalla 2: el código

- **[e2e]** (parte 3) En el paso del código, al escribir el sexto dígito de
  `482913` el formulario se envía solo, sin pulsar «Verificar código». El falso
  backend recibe un solo `POST /api/auth/sign-up/code/verify` con el correo del
  paso 1 y ese código, y la cookie guarda el token. Desde la parte 4, la página
  pasa a la contraseña sin cambiar de URL.
- **[e2e]** (parte 3) Con un código que el falso backend rechaza, la persona se
  queda en el paso del código con «El código no es correcto o ya venció. Pide
  uno nuevo si lo necesitas.» debajo del campo, y puede escribir otro.
- **[e2e]** (parte 3) Al llegar, «Reenviar en 60 s» está deshabilitado. Pasado
  el minuto se lee «Reenviar código». Al pulsarlo, el falso backend recibe un
  `POST /api/auth/sign-up/code` más con el mismo correo, aparece «Te enviamos un
  código nuevo.» y vuelve «Reenviar en 60 s» deshabilitado. El minuto lo cuenta
  el servidor (D-5): la prueba no lo puede adelantar sólo con el reloj del
  navegador.
- **[manual]** (parte 3) La cuenta sigue al recargar: si se recarga a los 20 s,
  se ve «Reenviar en 40 s» o un segundo menos. Cambiar la hora del celular no la
  cambia.
- **[manual]** (parte 3) La action del reenvío, llamada dentro del minuto, no
  llama al backend y devuelve los segundos que faltan. La pantalla sigue
  contando desde ahí y no dice «Te enviamos un código nuevo.».
- **[manual]** (parte 3) Con menos de 6 dígitos, «Verificar código» muestra
  «Escribe los 6 dígitos del código.» sin llamar al backend. El campo descarta lo
  que no es un dígito, y pegar «123 456» deja «123456» y se envía solo.
- **[manual]** (parte 3) Al verificar: con 429, «Demasiados intentos. Intenta de
  nuevo en unos minutos.» sobre el botón. Con el 403 del gateway, un 500, sin red
  o un cuerpo que no es JSON, «No pudimos comprobar el código. Intenta de
  nuevo.». Tras un código que no sirve, el texto del campo queda seleccionado.
- **[manual]** (parte 3) Al reenviar, un 429 o cualquier otro fallo se ve en rojo
  debajo del enlace, y el enlace vuelve a estar disponible. Si sale bien, el
  campo se vacía y recibe el foco.
- **[manual]** (parte 3) Recargar `/register` en el código sigue en el código, y
  sin la cookie muestra el correo. «Cambiar» no toca la cookie: recargar después
  de pulsarlo vuelve al código. El botón atrás del navegador sale de
  `/register`.
- **[manual]** (parte 3) La pantalla coincide con «Textos», «Estados»,
  «Accesibilidad» y el mockup:
  - el foco en el campo al llegar, con `inputMode="numeric"`,
    `autoComplete="one-time-code"` y `maxLength={6}`;
  - «Cambiar» se anuncia «Cambiar correo»;
  - la cuenta atrás no se anuncia cada segundo y, al llegar a 0, una región
    oculta dice «Ya puedes pedir otro código.»;
  - «Reenviar» deshabilitado sale del orden de tabulación.

### Pantalla 3: la contraseña y la sesión

- **[e2e]** (parte 4) Con una contraseña válida, «Crear cuenta» hace que el
  falso backend reciba un solo `POST /api/auth/sign-up/confirm`, cuyo cuerpo
  tiene exactamente `email` (el del paso 1), `password` y `verificationToken`
  (el que el falso backend dio al verificar). Con 200, el navegador va a
  `/onboarding`, que hasta el ticket de la sesión lleva a `/login`.
- **[e2e]** (parte 4) Después del 200 existen `session_id_token`,
  `session_access_token` y `session_refresh_token`, con los valores que devolvió
  el falso backend, `httpOnly`, `sameSite` `Lax` y `path` `/`. Las dos primeras
  vencen a los `expiresIn` segundos y la del refresh token a los 30 días.
  `sign_up_progress` ya no existe. Ninguno de los tres tokens aparece en lo que
  recibe el navegador.
- **[e2e]** (parte 4) Con 204, el navegador llega a `/login?registered=ok` con
  «Tu cuenta quedó creada. Inicia sesión con tu correo y tu contraseña.» en el
  aviso del login. No queda ninguna cookie de sesión, y `sign_up_progress` ya no
  existe.
- **[manual]** (parte 4) Un 200 que no trae `idToken`, `accessToken`,
  `refreshToken` y `expiresIn` se trata como un 204.
- **[manual]** (parte 4) Con el 400 «Tu verificación venció. Vuelve a pedir el
  código.», o sin token en la cookie, la pantalla cambia a la tarjeta «Tu
  verificación venció», con el foco en el título. «Pedir un código nuevo»
  muestra el paso del correo con el correo escrito, y al pedir el código la
  cookie se reescribe sin el token.
- **[manual]** (parte 4) Con otro 400, su `message` sobre el botón. Con 429,
  «Demasiados intentos. Intenta de nuevo en unos minutos.». Con el 403 del
  gateway, un 500, sin red o un cuerpo que no es JSON, «No pudimos crear tu
  cuenta. Intenta de nuevo.»: la contraseña sigue escrita y, como el token se
  conserva, «Crear cuenta» se puede volver a intentar.
- **[manual]** (parte 4) Sin llamar al backend, debajo del campo y con el foco
  ahí:
  - menos de 8 caracteres reales: «La contraseña debe tener al menos 8
    caracteres». Siete caracteres con un emoji también se rechazan;
  - más de 256: «La contraseña puede tener hasta 256 caracteres»;
  - un espacio al principio o al final, o un salto de línea: «La contraseña no
    puede empezar ni terminar con un espacio, ni tener saltos de línea».
- **[manual]** (parte 4) `/register` muestra la contraseña sólo con el token en
  la cookie: recargar en la contraseña sigue en la contraseña. Sin token, se ve
  el código, y sin cookie, el correo.
- **[manual]** (parte 4) La pantalla coincide con «Textos», «Estados» y el
  mockup: «Con ella entrarás a WizyDoc como {correo}.», el foco en el campo,
  `autoComplete="new-password"`, «Creando tu cuenta…» mientras carga y un campo
  oculto con `autoComplete="username"` y el correo, para que el gestor de
  contraseñas la guarde con él.
- **[manual]** (parte 4) Sin `?registered=ok`, el login se ve como hoy. El aviso
  usa el mismo bloque que el de `?reset=ok`, en `role="status"`.

### Seguridad y privacidad

- **[e2e]** (parte 2, y las partes 3 y 4 en sus pantallas) La clave del gateway
  no aparece en nada de lo que recibe el navegador, y el navegador no hace
  ninguna petición a `BACKEND_API_URL`.
- **[e2e]** (parte 3, y la parte 4 en la pantalla de la contraseña) El token de
  verificación que dio el falso backend no aparece en nada de lo que recibe el
  navegador. Ni el token ni el correo aparecen en ninguna URL.
- **[e2e]** (parte 2) Con `X-Real-IP: 203.0.113.40` en las peticiones del
  navegador, el falso backend recibe esa `x-real-ip`, el `user-agent` del
  navegador y la clave de prueba en `x-api-key`.
- **[e2e]** (parte 4) Después de recorrer el registro completo, el log del
  segundo platform no contiene la contraseña, el código, el token de
  verificación, los tokens de Cognito ni la clave del gateway.
- **[manual]** (partes 3 y 4) Verificar el código y crear la cuenta salen por la
  misma función que pedir el código, con las mismas cabeceras. Si la petición
  entrante no trae `x-real-ip` o `user-agent`, esa cabecera no se manda vacía. No
  se reenvían cookies ni ninguna otra cabecera.
- **[manual]** (partes 2 y 4) `lib/api/sign-up/index.ts`, `sign-up-progress.ts`
  y `cognito-session.ts` empiezan con `import "server-only"`, y
  `BACKEND`, `BACKEND_API_URL` y `BACKEND_API_KEY` no llevan
  `NEXT_PUBLIC_`. Las llamadas al backend salen sólo de las cuatro server
  actions: no hay route handler ni rewrite nuevo hacia `backend-infra`.
- **[manual]** (partes 2 y 4) `sign_up_progress` y las tres cookies de la sesión
  llevan `secure` en producción.
- **[manual]** (partes 2, 3 y 4) Las actions no hacen `console.*` del cuerpo, del
  error del backend, del correo, del código, de la contraseña ni de los tokens:
  como mucho, la ruta y el código de respuesta.
- **[manual]** (partes 2, 3 y 4) Ninguna action tiene una rama según si el correo
  ya tiene cuenta: cualquier 202 lleva a la misma pantalla del código.
- **[manual]** (parte 4) La cookie de Better Auth no cambia al crear la cuenta.

### En el celular

- **[manual]** (partes 2, 3 y 4, cada una en su pantalla) A 375 px, con el correo
  largo del mockup, ninguna pantalla tiene desplazamiento horizontal
  (`scrollWidth <= 375`) y el correo se corta con `break-all`. A 375 y a 1280
  px, cada pantalla se ve como en el mockup.
