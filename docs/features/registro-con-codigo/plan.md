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
  - no hay vuelta a `better-auth` ni migración de cuentas hacia Postgres;
  - staging sigue con Better Auth por ahora;
  - la casilla de los términos queda fuera.

Leyenda de certeza: **[código]** lo leí en el repo; **[spec]** lo dice la spec
o el plan de WIZ-75; **[inferencia]** es deducción que el engineer comprueba.

## Objetivo

Que el médico cree su cuenta desde el celular en tres pantallas (correo, código
de 6 dígitos y contraseña) contra el registro de `backend-infra`, y termine con
la sesión de Cognito guardada en cookies HttpOnly. El killswitch `AUTH_BACKEND`
decide en cada entorno cuál de los dos registros existe, nunca los dos a la
vez, y hace el cambio de una vez cuando la infraestructura esté lista.

## Recorrido

1. **`/sign-up`, «Crea tu cuenta».** Escribe su correo y pulsa «Continuar».
   Platform pide el código y pasa a la pantalla siguiente. Tenga o no cuenta ese
   correo, la pantalla es la misma.
2. **`/sign-up/code`, «Revisa tu correo».** Escribe los 6 dígitos, y al
   completarlos el formulario se envía solo. Platform verifica el código, guarda
   el token de verificación en una cookie HttpOnly y pasa a la contraseña.
   «Reenviar en 60 s» cuenta hacia atrás y después pasa a «Reenviar código».
3. **`/sign-up/password`, «Crea tu contraseña».** Escribe la contraseña y pulsa
   «Crear cuenta». Platform crea la cuenta. Con 200 guarda los tokens en cookies
   y lleva a `/onboarding`. Con 204 lleva a `/login` con el aviso «Tu cuenta
   quedó creada…».

Con `AUTH_BACKEND=serverless`, `/register` lleva a `/sign-up`. Con
`better-auth`, el valor por defecto, todo sigue como hoy y `/sign-up` no
existe.

## Estado de hoy

- **[código]** `/register` es un componente de cliente con nombre, apellido,
  celular, correo y contraseña. Llama a `authClient.signUp.email`, que el
  rewrite `/api/auth/:path*` lleva al api (Better Auth), y lleva a
  `/confirm-email`, que pide abrir el enlace del correo.
- **[código]** La sesión es la cookie de Better Auth: `middleware.ts`
  (`getSessionCookie`), `lib/auth/session.ts` y `lib/auth/me.ts` leen sólo esa.
  Nada en platform lee todavía una sesión de Cognito.
- **[código]** `session.ts` ya reenvía `x-real-ip` en su llamada del servidor a
  `get-session`, y el rewrite la pasa tal cual. Ninguna llamada de platform va
  hoy a `backend-infra`, y no hay variables para su URL ni para su clave:
  `.env.example` sólo tiene `API_URL` y la clave pública de Culqi.
- **[código] WIZ-75 en `backend-infra`:**
  - en `main` están `POST /api/auth/sign-up/code` (#140) y `/code/verify`
    (#141);
  - #142, abierto, agrega el app client de Cognito para platform,
    `wizydoc-platform`, con `ADMIN_USER_PASSWORD_AUTH` y el refresh token a 30
    días (`REFRESH_TOKEN_VALIDITY` en `backend-infra/lib/authentication.ts`);
  - faltan `/confirm` y quitar `sign-up/email` (parte 4).
- **[código]** El gateway exige la clave (`apiKeyRequired: true` sin
  `apiKeySource`, o sea en la cabecera `x-api-key`), y la Lambda lee la IP de
  `x-real-ip` (`readIpAddress`).
- **[código]** `TERMS_ACCEPTANCE_REQUIRED` está apagado en `backend-infra`: con
  él apagado, `/confirm` no pide la casilla de los términos [spec].

## Decisiones

**D-1. Un killswitch para toda la autenticación: `AUTH_BACKEND`.** Lo decidió el
humano.
- **Para qué sirve:** para hacer el cambio de una vez, cuando la
  infraestructura esté lista. No es para volver atrás: no habrá vuelta a
  `better-auth` ni migración de cuentas de Cognito hacia Postgres.
- **Los valores:** `better-auth`, el de por defecto, y `serverless`. Cualquier
  valor que no sea `serverless`, también vacío o mal escrito, cuenta como
  `better-auth`. Así, una variable que falta deja el registro de hoy, y no un
  registro nuevo a medias.
- **El helper:** `isServerlessAuth()` en `lib/auth/auth-backend.ts`. Sin
  `NEXT_PUBLIC_`: sólo lo lee el servidor. Lo reutilizarán el login y la
  sesión, que son otros tickets.
- **Con `better-auth`:**
  - `/sign-up/*` responde 404 (`notFound()` en `sign-up/layout.tsx`);
  - las server actions del registro nuevo lo comprueban antes que nada, porque
    una action se puede llamar sin abrir la página, y no llaman al backend
    nuevo;
  - `/register` y `/confirm-email` siguen como hoy.
- **Con `serverless`:** `/register` y `/confirm-email` redirigen a `/sign-up`,
  con `redirects()` de `next.config.ts`, que corre antes del middleware.
  - **Temporal (307) mientras exista el killswitch.** En local se cambia de un
    valor al otro para probarlo (ver «Verificación»), y el navegador guarda en
    caché un 308: con `better-auth`, `/register` seguiría llevando a `/sign-up`
    y la prueba mentiría.
  - **Permanente (308) en la parte 5,** cuando el redirect queda sin condición
    y el movimiento es definitivo.
  - Si `next.config.ts` no puede importar el helper, repite la misma
    comparación.
- **Nunca conviven.** En cada entorno, la persona ve un registro o el otro.
- **El cambio llega con un despliegue** [inferencia]: Next lee `redirects()` y
  las páginas estáticas al construir, así que cambiar la variable no basta sin
  un build nuevo. El engineer lo comprueba con `next build`.
- **Rutas distintas** (`/sign-up`, `/sign-up/code`, `/sign-up/password`),
  porque el flujo es distinto: el viejo no pedía código.
- **Dónde está encendido:** sólo en local y en los e2e. Producción y staging
  siguen en `better-auth`. Más adelante, staging podría pasar a `serverless`,
  para probar con el `backend-infra` de staging y correos reales. No es parte de
  este plan.
- **El código viejo se borra en la parte 5,** en cuanto producción y staging
  estén en `serverless`.

**D-2. Platform llama a `backend-infra` desde su servidor, con server
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
  llega al navegador: sólo lo que muestra cada pantalla.
- **Por qué server actions:** es el patrón de platform para las mutaciones
  (`platform/AGENTS.md`), y Next comprueba el `Origin` de cada action. **Por
  qué no `authClient` desde el navegador, como el login:** la clave no puede
  salir del servidor.

**D-3. El avance del registro vive en una cookie HttpOnly, no en el
servidor.**
- **La cookie:** `sign_up_progress`, con `{ email, codeRequestedAt,
  verificationToken? }` en JSON. `codeRequestedAt` son los milisegundos epoch
  del servidor (`Date.now()`). Lleva `httpOnly`, `secure`, `sameSite: "lax"`,
  `path: "/sign-up"` y `maxAge` de una hora
  (`SIGN_UP_PROGRESS_MAX_AGE_SECONDS = 3600`). Cada paso la vuelve a escribir, y
  con eso la hora vuelve a empezar.
- **Por qué una hora y no los 15 minutos del token:** si la cookie venciera con
  el token, al vencer se perdería también el correo, y «Tu verificación venció»
  no podría ofrecer «Pedir un código nuevo» con el correo escrito. Una hora
  cubre una interrupción de consulta; después, volver a escribir el correo no
  cuesta nada.
- **El plazo del token lo controla el backend, no la cookie.** Platform no
  guarda cuándo se verificó el código. Un token vencido puede seguir en la
  cookie hasta una hora: `/sign-up/password` muestra el formulario, y al pulsar
  «Crear cuenta» el backend responde «Tu verificación venció» y aparece la
  tarjeta.
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
    TLS y `path: "/sign-up"` que viaje a otras rutas.
  - Como la cookie de sesión, su dueño legítimo es el navegador de la persona.
- **El token no sale por otra vía.** Viaja al navegador sólo en el `Set-Cookie`
  de `sign_up_progress`, que es donde se guarda. Las páginas leen la cookie sólo
  para decidir adónde llevar. A los componentes de cliente les pasan el correo y
  los segundos de espera, nunca el token. El token tampoco va en ningún log.
- **Cuándo se borra:** al crear la cuenta, con 200 o con 204. Con «Tu
  verificación venció» se borra sólo el token: el correo se conserva para que
  «Pedir un código nuevo» lo traiga escrito.

**D-4. El minuto de espera para pedir otro código lo calcula el servidor.**
- `codeRequestedAt` es la hora del servidor en que platform pidió el último
  código. La página del código calcula `secondsUntilResend` (60 menos los
  segundos que pasaron) y se lo pasa al componente, que cuenta hacia atrás. No
  depende del reloj del celular, y la cuenta sigue al recargar.
- **La action del reenvío responde siempre con los segundos que faltan:**
  `{ status: "success", data: { wasCodeSent, secondsUntilResend } }`
  (`DataActionState`).
  - Si pasó el minuto, llama al backend. Con 202 devuelve `wasCodeSent: true` y
    `secondsUntilResend: 60`, y la pantalla muestra «Te enviamos un código
    nuevo.».
  - **Si no pasó el minuto,** no llama al backend y devuelve
    `wasCodeSent: false` con los segundos que faltan. La pantalla sigue
    contando desde ahí, no muestra «Te enviamos un código nuevo.» y no cambia
    nada más. Pasa cuando el reloj del navegador va adelantado o cuando otra
    pestaña pidió un código.
- **En el paso 1, el mismo correo dentro del minuto no llama al backend.** Va
  directo al código, con los segundos que quedaban. Si llamara:
  - la Lambda no enviaría nada, pero el pedido contaría para el cupo de 3 por IP
    cada 10 minutos [spec];
  - y la pantalla diría que enviamos un código sin haber enviado uno nuevo. El
    anterior sigue sirviendo.
- Un correo distinto siempre llama al backend y empieza un avance nuevo, sin
  token.

**D-5. La sesión de Cognito va en tres cookies HttpOnly, que nadie lee
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
  la sesión los lee de ahí cuando `AUTH_BACKEND` es `serverless`. Este plan no
  los lee en ninguna parte.
- **Hasta ese ticket,** `/onboarding` no encuentra la sesión de Better Auth y
  lleva a `/login`. En local y en los e2e, el flujo termina ahí. Por eso
  producción no pasa a `serverless` antes (prerrequisito 2).
- La cookie de Better Auth no se toca.

**D-6. Los mensajes son los de la spec, según el código de respuesta.**

| Respuesta del backend | Qué muestra platform |
| --- | --- |
| 400 | El `message` del cuerpo, que la Lambda manda en español. En la contraseña, si es «Tu verificación venció. Vuelve a pedir el código.», la tarjeta «Tu verificación venció» (D-3). |
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
  - contraseña: como `backend-infra/lib/src/users/application/sign-up.usecase.ts`,
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

**D-7. El código va en un solo campo, y se envía solo.**
- Un `Input` con `inputMode="numeric"`, `autoComplete="one-time-code"`,
  `maxLength={6}` y letra grande. Sin seis casillas: un solo campo funciona al
  pegar, con el autocompletado de iOS y Android y con lector de pantalla, y no
  hace falta un componente nuevo.
- Al escribir, se quita lo que no es un dígito: pegar «123 456» deja «123456».
- Con el sexto dígito, el formulario se envía solo. El botón «Verificar código»
  sigue para quien prefiera pulsarlo.

**D-8. Los formularios siguen el patrón del login y de la recuperación.**
- **Componente de cliente** con validación en el cliente, `pending` local, error
  en la tarjeta (`role="alert"`) y `useFocusFirstInvalid`. En vez de
  `authClient`, llama a la server action desde `onSubmit` (con
  `preventDefault`), dentro de `startTransition`.
- **La action manda.** Valida otra vez, llama al backend, escribe la cookie y
  hace `redirect()` al paso siguiente. Si algo falla, devuelve un `ActionState`
  de error, con `fieldErrors` cuando es de un campo.
- **Por qué no `<form action={…}>`:** React vacía los campos al terminar la
  action (lo explica `onboarding-form.tsx`). Tras un error del backend, la
  persona tendría que volver a escribir la contraseña.
- **Por qué no `useFormAction`:** muestra los errores en un toast, y las
  pantallas de `(auth)` los muestran en la tarjeta.

## Fuera de alcance

- **La casilla de los términos y el enlace a la política de privacidad.**
  Vuelven cuando la política esté publicada. Ese cambio agrega a la pantalla de
  la contraseña la casilla (texto de la spec de WIZ-72) y, a `/confirm`,
  `acceptedTerms`, `termsVersion` y `privacyPolicyVersion`. Se despliega a la
  vez que se enciende `TERMS_ACCEPTANCE_REQUIRED` en `backend-infra`.
- **El login y la sesión con Cognito,** que también respetarán `AUTH_BACKEND`
  (otros subtickets de WIZ-71).
- **El onboarding** con nombre, apellido y teléfono (WIZ-77).
- **Pasar staging a `serverless`.**
- **Migrar cuentas entre Postgres y Cognito,** en cualquier sentido.

## Antes de pasar producción a `serverless`

Es el orden de despliegue: el killswitch cambia toda la autenticación de una
vez y no se vuelve atrás, así que todo esto tiene que estar listo antes.

1. **WIZ-75 completo y desplegado en producción, también su parte 4.** Mientras
   exista `POST /api/auth/sign-up/email` en `backend-infra`, se puede
   pre-secuestrar una cuenta [spec].
2. **La sesión de Cognito** (otro ticket): con `serverless`, el middleware,
   `getSession` y `getMe` leen las cookies de D-5. Sin eso, quien crea su
   cuenta termina en `/login`.
3. **El login contra Cognito,** también detrás de `AUTH_BACKEND` (otro
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
9. **`AUTH_BACKEND=serverless`, `BACKEND_API_URL` y `BACKEND_API_KEY` en el
   platform de producción.** Las pone el humano.

## Cambios por capa

### Prisma

Ninguno, y sin migración. No hay un dato nuevo que guardar en Postgres: el
avance del registro dura como mucho una hora y vive en una cookie (D-3), y la
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
| `platform/.env.example` | 2 | `AUTH_BACKEND=better-auth`, `BACKEND_API_URL=` y `BACKEND_API_KEY=`, con una línea que diga para qué es cada una y los dos valores del killswitch. |
| `platform/src/lib/auth/auth-backend.ts` (nuevo) | 2 | `isServerlessAuth()` (D-1). Sin `server-only`, para que `next.config.ts` lo pueda importar. |
| `platform/src/lib/api/sign-up/index.ts` (nuevo) | 2, 3 y 4 | `server-only`. `signUpApi.requestCode(email)` (parte 2), `verifyCode(email, code)` (parte 3) y `confirm(input)` (parte 4). Una función privada del módulo hace el `fetch` con las cabeceras de D-2 y lanza `ApiError(status, message)` si la respuesta no es 2xx. No registra nada del cuerpo. |
| `platform/src/lib/api/sign-up/types.ts` (nuevo) | 4 | `ConfirmSignUpInput` (`email`, `password`, `verificationToken`) y `CognitoTokens` (`idToken`, `accessToken`, `refreshToken`, `expiresIn`). |
| `platform/src/lib/auth/sign-up-validation.ts` (nuevo) | 2, 3 y 4 | Esquemas de Zod y mensajes de D-6, que usan a la vez los formularios y las actions: correo (parte 2), código (parte 3) y contraseña (parte 4). No toca `form-validation.ts`, que siguen usando el login y la recuperación con las reglas de Better Auth. |
| `platform/src/lib/auth/sign-up-progress.ts` (nuevo) | 2 y 3 | `server-only`. `readSignUpProgress()` (valida el JSON con Zod; si no sirve, no hay avance), `saveSignUpProgress(progress)`, `clearSignUpProgress()` y `secondsUntilResend(progress, now)`, con `RESEND_COOLDOWN_SECONDS = 60` y `SIGN_UP_PROGRESS_MAX_AGE_SECONDS = 3600` (D-3). La parte 3 agrega el token. |
| `platform/src/lib/auth/cognito-session.ts` (nuevo) | 4 | `server-only`. `saveCognitoSession(tokens)` (D-5), con `REFRESH_TOKEN_LIFETIME_DAYS = 30`. |
| `platform/src/lib/auth/cookies.ts` | 2 y 4 | `signUpProgress` (parte 2) y los tres nombres de la sesión (parte 4). El comentario deja de decir que sólo Better Auth guarda la sesión. |
| `platform/src/lib/actions/sign-up/request-sign-up-code.action.ts` (nuevo) | 2 | Killswitch, validación del correo, D-4, `requestCode`, la cookie y `redirect("/sign-up/code")`. |
| `platform/src/lib/actions/sign-up/resend-sign-up-code.action.ts` (nuevo) | 3 | Killswitch, correo de la cookie (sin avance, `redirect("/sign-up")`), D-4 y `requestCode`. Devuelve `{ status: "success", data: { wasCodeSent, secondsUntilResend } }` o un error. |
| `platform/src/lib/actions/sign-up/verify-sign-up-code.action.ts` (nuevo) | 3 | Killswitch, correo de la cookie, validación del código, `verifyCode`, el token en la cookie y `redirect("/sign-up/password")`. |
| `platform/src/lib/actions/sign-up/confirm-sign-up.action.ts` (nuevo) | 4 | Killswitch, correo y token de la cookie, validación, `confirm`, `saveCognitoSession` o el 204, y `redirect`. Con la verificación vencida devuelve un error con `code: "VERIFICATION_EXPIRED"` (ver «Contrato»). |
| `platform/src/app/(auth)/sign-up/layout.tsx` (nuevo) | 2 | Server component: `notFound()` con `better-auth`. Usa el marco de `(auth)/layout.tsx`. |
| `platform/src/app/(auth)/sign-up/page.tsx` (nuevo) | 2 | `metadata` («Crea tu cuenta»). Lee el correo del avance para traerlo escrito y renderiza `SignUpEmailForm`. |
| `platform/src/app/(auth)/sign-up/sign-up-email-form.tsx` (nuevo) | 2 | Cliente. Pantalla 1 (ver «UI»). |
| `platform/src/app/(auth)/sign-up/code/page.tsx` (nuevo) | 3 | Sin avance, `redirect("/sign-up")`. Con token, `redirect("/sign-up/password")`, porque el código ya se gastó. Si no, pasa `email` y `secondsUntilResend` a `SignUpCodeForm`. |
| `platform/src/app/(auth)/sign-up/code/sign-up-code-form.tsx` (nuevo) | 3 | Cliente. Pantalla 2, con la cuenta atrás. |
| `platform/src/app/(auth)/sign-up/password/page.tsx` (nuevo) | 4 | Sin avance, a `/sign-up`. Sin token, a `/sign-up/code`. Si no, pasa `email` a `SignUpPasswordForm`. |
| `platform/src/app/(auth)/sign-up/password/sign-up-password-form.tsx` (nuevo) | 4 | Cliente. Pantalla 3 y la tarjeta «Tu verificación venció». |
| `platform/src/middleware.ts` | 2 | `/sign-up`, `/sign-up/code` y `/sign-up/password` en `PUBLIC_PATHS`. |
| `platform/next.config.ts` | 4 | `redirects()`: con `serverless`, `/register` y `/confirm-email` a `/sign-up`, con `permanent: false` (D-1). Con `better-auth`, ninguno. Va en la parte 4 para que `serverless` nunca lleve a un flujo a medias. |
| `platform/src/app/(auth)/login/page.tsx` y `login-form.tsx` | 4 | Leer `registered=ok` y mostrar el aviso de D-6 con el mismo bloque que el de `reset=ok`. |

No cambian `session.ts`, `me.ts`, `register/page.tsx`, `confirm-email/page.tsx`,
`onboarding/` ni el rewrite de `next.config.ts`. «Regístrate gratis» del login
sigue apuntando a `/register`, que con `serverless` redirige.

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
  - el platform de hoy (`:3100`) recibe en código `AUTH_BACKEND=better-auth`,
    encima de `platform/.env.e2e`, y sigue corriendo todas las pruebas de hoy;
  - un `webServer` nuevo, el falso backend;
  - otro `webServer` nuevo, un segundo platform (`:3101`, con su propio
    `NEXT_DIST_DIR`) con `AUTH_BACKEND=serverless`, `BACKEND_API_URL` (el falso)
    y `BACKEND_API_KEY` (la de prueba), también en código. Así un e2e nunca
    llama al `backend-infra` real, aunque `.env.e2e` lo tuviera;
  - un proyecto `serverless` con `testDir: "./e2e/serverless"` y ese
    `baseURL`.
- **`platform/e2e/serverless/sign-up-email.spec.ts`, `sign-up-code.spec.ts` y
  `sign-up-password.spec.ts` (nuevos)**, uno por parte.
- **`platform/e2e/ui/auth/sign-up-killswitch.spec.ts` (nuevo, parte 2),** en
  el platform de hoy: con `better-auth`, `/sign-up`, `/sign-up/code` y
  `/sign-up/password` responden 404, y `/register` muestra el formulario de hoy.
- **`platform/e2e/README.md`:** una línea que diga que las pruebas con
  `AUTH_BACKEND=serverless` van en `e2e/serverless/` y corren contra el segundo
  platform y el falso backend. Cambia cómo se escribe una prueba, así que la
  regla de `AGENTS.md` lo permite. Los comandos para correrlas no cambian.
- Las pruebas del registro de hoy no cambian hasta la parte 5.

## Contrato con backend-infra

Lo que platform manda y lo que hace con cada respuesta. Todas las peticiones
salen del servidor de platform, con las cabeceras de D-2, y sólo con
`AUTH_BACKEND=serverless`.

### 1. Pedir el código

`requestSignUpCodeAction` (pantalla 1) y `resendSignUpCodeAction` (pantalla 2)
mandan `POST ${BACKEND_API_URL}/api/auth/sign-up/code`:

```json
{ "email": "lucia.paredes@gmail.com" }
```

| Respuesta | En la pantalla 1 | Al reenviar, en la pantalla 2 |
| --- | --- | --- |
| 202 | Escribe el avance `{ email, codeRequestedAt: ahora }`, sin token, y `redirect("/sign-up/code")`. | Escribe el nuevo `codeRequestedAt` y devuelve `wasCodeSent: true` con `secondsUntilResend: 60`. La pantalla muestra «Te enviamos un código nuevo.». |
| 400 | El `message` bajo el campo del correo. | El `message`, en rojo debajo del enlace de reenvío: en esta pantalla no hay campo del correo. |
| 429 | «Demasiados intentos. Intenta de nuevo en unos minutos.» sobre el botón. | El mismo texto, en rojo debajo del enlace. |
| Otra, o sin red | «No pudimos enviarte el código. Intenta de nuevo.» sobre el botón. | El mismo texto, en rojo debajo del enlace. |

Al reenviar dentro del minuto no hay petición: ver D-4.

### 2. Verificar el código

`verifySignUpCodeAction` manda `POST /api/auth/sign-up/code/verify` con el
correo de la cookie:

```json
{ "email": "lucia.paredes@gmail.com", "code": "482913" }
```

| Respuesta | Qué hace platform |
| --- | --- |
| 200 `{ verificationToken }` | Guarda el token en el avance y `redirect("/sign-up/password")`. |
| 400 | El `message` bajo el campo del código. |
| 429 | «Demasiados intentos. Intenta de nuevo en unos minutos.» |
| Otra, o sin red | «No pudimos comprobar el código. Intenta de nuevo.» |

Sin avance, porque la cookie venció, `redirect("/sign-up")`.

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
| 400 «Tu verificación venció. Vuelve a pedir el código.» | Borra el token, conserva el correo y devuelve un error con `code: "VERIFICATION_EXPIRED"`: la pantalla cambia a la tarjeta «Tu verificación venció». |
| 400 con otro mensaje | El `message` arriba del botón, por ejemplo si una regla de la contraseña cambió en `backend-infra`. |
| 429 | «Demasiados intentos. Intenta de nuevo en unos minutos.» |
| Otra, o sin red | «No pudimos crear tu cuenta. Intenta de nuevo.» Conserva el token: si la cuenta no se creó, se puede reintentar dentro de los 15 minutos. |

- **Sin token en la cookie,** se responde lo mismo que a una verificación
  vencida, sin llamar al backend.
- **Sin la cookie,** porque pasó la hora, la misma tarjeta. Como ya no hay
  correo, «Pedir un código nuevo» abre `/sign-up` vacío.
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
- **No hay endpoint público nuevo en `api/`.** Las server actions de
  `/sign-up/*` son públicas, como la página, y sólo hablan con las tres rutas de
  la spec, y sólo con `serverless`.

## Riesgos de seguridad

| Riesgo | Mitigación | Lo que queda |
| --- | --- | --- |
| La clave del gateway llega al navegador | Sin `NEXT_PUBLIC_`, `server-only` en el cliente y en la cookie, y una prueba e2e que busca la clave en todo lo que recibe el navegador. | — |
| El token de verificación en una URL, un log o el HTML | Va en el cuerpo del `POST` y en una cookie HttpOnly con `path: "/sign-up"`. Las páginas no se lo pasan a los componentes de cliente, y nada lo registra. La prueba e2e busca el token en las URL y en todo lo que recibe el navegador, salvo el `Set-Cookie` de `sign_up_progress`, que es donde se guarda. | Puede quedar en la cookie hasta una hora, aunque a los 15 minutos el backend ya no lo acepta. |
| Los tokens de Cognito accesibles desde JavaScript | `httpOnly`, `secure`, `sameSite: "lax"`. Nunca van en la respuesta de una action: sólo en el `Set-Cookie` de sus tres cookies. | Hasta que la app los lea, nadie los usa ni los refresca. |
| Todas las personas en un mismo cupo por IP | Se reenvía `x-real-ip` (D-2), y la prueba e2e comprueba que llega. | Depende de que el borde de Railway pise la cabecera del cliente (P1 heredada, prerrequisito 6). |
| Saber si un correo tiene cuenta | Platform pasa a la pantalla del código con cualquier 202 y no mira nada más. No agrega ninguna rama distinta. | — |
| Gastar el cupo de la IP sin querer | D-4: el mismo correo dentro del minuto no llama al backend, y validar antes de llamar evita los pedidos inválidos. | Más de 3 envíos en 10 minutos desde una misma IP (una clínica) responden 429, como dice la spec. |
| CSRF contra las actions | Next compara `Origin` y `Host` en cada server action. Las cookies son `lax`. | — |
| Contraseña, código o token en los logs de platform | Las actions no hacen `console.*` del cuerpo ni del error del backend: como mucho la ruta y el código de respuesta. Una prueba e2e busca la contraseña, el código y el token en el log de platform. | — |
| El registro nuevo abierto en producción antes de tiempo | El killswitch (D-1), en la página y en cada action, con `better-auth` por defecto. | — |

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
  `/sign-up/password` después de 15 minutos ve el formulario, escribe la
  contraseña y recién al pulsar ve la tarjeta. Saberlo antes obligaría a
  guardar en la cookie cuándo se verificó, y el backend ya lo dice (D-3).
- **Un e2e más lento.** El segundo platform compila su propio `next dev`, y la
  suite tarda más en arrancar.
- **`secure` en `http://localhost`** [inferencia]: Chromium acepta cookies
  `Secure` en `localhost`, así que los e2e (`next dev` en `:3100` y `:3101`)
  deberían guardarlas. El engineer lo comprueba en la primera prueba. Si no las
  guarda, `secure` depende de `NODE_ENV`.
- **Las cookies escritas en una action y el `redirect`** [inferencia]: Next
  aplica las cookies que escribe una action al render del destino, así que
  `/sign-up/code` lee el avance recién escrito. La prueba de la parte 2 lo
  comprueba.
- **Si platform deja Railway** (`build:open-next`), `x-real-ip` deja de
  llegar del borde. La cabecera de la IP se revisa en ese ticket.
- **El botón «Atrás» del navegador desde la contraseña:** muestra la pantalla
  del código desde su caché. Al recargarla, lleva a la contraseña, porque el
  código ya se gastó.
- **Dos pestañas:** gana la última cookie escrita. Si después se verifica el
  código del otro correo, el backend responde 400.
- **Quien tiene sesión de Better Auth en local y crea otra cuenta:** quedan las
  dos cookies, y la app sigue mostrando la de Better Auth. Lo resuelve el ticket
  de la sesión. En producción no pasa, porque el killswitch cambia todo junto.
- **El refresh token** viaja en cada petición a platform (`path: "/"`), cerca
  de 2 KB. Si el ticket de la sesión decide acotarlo a una ruta de refresco, lo
  cambia ahí.
- **Empezar en un navegador y seguir en otro:** la cookie es de su navegador.
  Si abre el correo en el celular y escribe el código en la computadora,
  funciona. Si empieza el registro en un navegador y lo sigue en otro, vuelve al
  paso 1.

## Preguntas para el humano

Ninguna.

**Lo que sólo puede hacer el humano** (no son decisiones):
- Si quiere probar en local con correos reales: `AUTH_BACKEND=serverless`,
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
de las cookies que escribe este plan.

**Parte 2, el killswitch y el correo:**
- En el platform de hoy (`better-auth`): `/sign-up`, `/sign-up/code` y
  `/sign-up/password` responden 404, y `/register` muestra el formulario de hoy.
- Con `X-Real-IP: 203.0.113.40` en las cabeceras del navegador
  (`extraHTTPHeaders`), el falso backend recibe esa `x-real-ip`, el `user-agent`
  del navegador y la clave de prueba en `x-api-key`.
- El valor de la clave no aparece en nada que reciba el navegador, y el
  navegador no hace ninguna petición a `BACKEND_API_URL`.
- `sign_up_progress` queda `httpOnly`, con `path` `/sign-up`, `sameSite` `Lax`,
  y vence a la hora.
- Un correo inválido muestra «Correo inválido» y el falso backend no recibe
  nada.
- Con 429, con 500 y con el 403 del gateway, cada uno muestra su mensaje en
  español, nunca «Forbidden».
- El mismo correo dos veces dentro del minuto llega una sola vez al falso
  backend.

**Parte 3, el código:**
- Con `482913`, lleva a `/sign-up/password`. El token que dio el falso backend
  no aparece en ninguna URL ni en nada más de lo que recibe el navegador: sólo
  en el `Set-Cookie` de `sign_up_progress`.
- Un código incorrecto muestra el mensaje único. Con menos de 6 dígitos, «Escribe
  los 6 dígitos del código.», sin llamar al backend.
- Al escribir el sexto dígito, o al pegar «482 913», se envía solo.
- **El minuto del reenvío, sin esperarlo.** Lo cuenta el servidor desde
  `codeRequestedAt` (D-4), así que `page.clock` sólo movería la cuenta del
  navegador, y la action seguiría negándose. La prueba:
  1. llega a `/sign-up/code` y comprueba «Reenviar en 60 s» deshabilitado;
  2. lee `sign_up_progress` con `context.cookies()`, pone `codeRequestedAt` 61
     segundos antes y la vuelve a escribir con `context.addCookies()`, con el
     mismo formato, `path` y `httpOnly`. Se puede porque la cookie no está
     firmada (D-3);
  3. recarga la página: el servidor calcula 0 s y se ve «Reenviar código»;
  4. lo pulsa: el falso backend recibe un pedido más, aparece «Te enviamos un
     código nuevo.» y vuelve «Reenviar en 60 s» deshabilitado.
- `/sign-up/code` sin la cookie lleva a `/sign-up`.

**Parte 4, la contraseña y la redirección:**
- Con `serverless`, `/register` y `/confirm-email` llevan a `/sign-up` con un
  307 (D-1).
- Con 200, las tres cookies de la sesión quedan `httpOnly`, `Lax`, con `path`
  `/`, y el refresh token vence a los 30 días. `sign_up_progress` se borra.
  Navega a `/onboarding`, que hoy lleva a `/login` (D-5).
- El cuerpo que recibe el falso backend lleva sólo `email`, `password` y
  `verificationToken`.
- Con 204, llega a `/login` con «Tu cuenta quedó creada. Inicia sesión con tu
  correo y tu contraseña.».
- Con la verificación vencida, se ve la tarjeta, y «Pedir un código nuevo»
  lleva a `/sign-up` con el correo escrito.
- Una contraseña de 7 caracteres o una que empieza con un espacio muestran su
  error sin llamar al backend.
- Ni la contraseña, ni el código, ni el token aparecen en el log del segundo
  platform. El código se busca con dígitos que no lo toquen a los lados
  (`/(?<!\d)482913(?!\d)/`), para no confundirlo con una hora o un puerto.
- A 375 px, con un correo largo, las tres pantallas no tienen desplazamiento
  horizontal (`scrollWidth <= 375`).

### Manual, en local

- **Con `better-auth`** (sin `AUTH_BACKEND`): `pnpm dev`, y `/sign-up` responde
  404 y `/register` muestra el formulario de hoy. Revisar en el diff que las
  cuatro actions consultan el killswitch antes de llamar al backend.
- **Con `serverless`:** `pnpm dev` con el falso backend
  (`node e2e/support/fake-backend.mjs`) o con el gateway de staging (ver «Lo
  que sólo puede hacer el humano»). Recorrer las tres pantallas a 375 y a
  1280 px y compararlas con el mockup.
- **El killswitch se lee al construir:** `next build` con `serverless` y
  después con `better-auth`. `/register` redirige sólo con el primero.
- **Mockup:** `npx -y lavish-axi docs/features/registro-con-codigo/mockup.html`.

## UI

### Rutas y layout

Las tres pantallas viven en el grupo `(auth)` y usan su `layout.tsx` actual:
fondo `bg-gradient-to-br from-brand-surface via-white to-brand-surface`, logo
arriba a la izquierda (enlace a `/login`), tarjeta `AuthCard` centrada
(`max-w-md`, `p-5 sm:p-8`) y el pie con el copyright. `sign-up/layout.tsx` sólo
agrega el `notFound()` del killswitch. Son públicas y no dependen de rol ni de
plan.

| Ruta | Pantalla |
| --- | --- |
| `/sign-up` | «Crea tu cuenta»: el correo |
| `/sign-up/code` | «Revisa tu correo»: el código y el reenvío |
| `/sign-up/password` | «Crea tu contraseña», o «Tu verificación venció» |
| `/login?registered=ok` | Login actual con el aviso del 204 |
| `/register`, `/confirm-email` | Con `serverless`, redirigen a `/sign-up` |

No llevan `loading.tsx` ni `error.tsx`: no leen datos del api, sólo la cookie, y
cada fallo del backend se muestra en la tarjeta.

### Árbol de componentes

```
(auth)/layout.tsx                                       existente
├─ sign-up/layout.tsx                                   nuevo (killswitch)
│  ├─ page.tsx                                          nuevo (lee el correo del avance)
│  │  └─ SignUpEmailForm { defaultEmail? }              nuevo
│  │     ├─ AuthCard                                    components/common/auth-card.tsx
│  │     ├─ Input name="email"                          components/common/form/input.tsx
│  │     └─ Button                                      components/ui/button.tsx
│  ├─ code/page.tsx                                     nuevo (redirige o pasa los datos)
│  │  └─ SignUpCodeForm { email, secondsUntilResend }   nuevo
│  │     ├─ AuthCard
│  │     ├─ Input name="code" (inputMode, className)    components/common/form/input.tsx
│  │     ├─ Button
│  │     └─ «Reenviar» (<button> con TEXT_LINK_CLASS)   inline
│  └─ password/page.tsx                                 nuevo (redirige o pasa el correo)
│     └─ SignUpPasswordForm { email }                   nuevo
│        ├─ AuthCard
│        ├─ PasswordInput                               components/common/form/password-input.tsx
│        ├─ Button
│        └─ «Tu verificación venció» (AuthCard con XCircle, tone="danger")
└─ login/page.tsx → LoginForm { …, accountCreated? }    existente, prop nueva
```

- **Componentes nuevos:** sólo los tres formularios, uno por ruta, como
  `LoginForm` y `ForgotPasswordForm`.
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
| Correo escrito al volver a `/sign-up` | `email` de la cookie, leído por `page.tsx` |
| Correo en el código y en la contraseña | `email` de la cookie |
| «Reenviar en N s» | `secondsUntilResend`, calculado por `code/page.tsx` desde `codeRequestedAt`, y después por la action del reenvío (D-4) |
| «Te enviamos un código nuevo.» | `wasCodeSent: true` de `resendSignUpCodeAction` |
| Errores y avisos | El `ActionState` de cada action (D-6) |
| Tarjeta «Tu verificación venció» | `code: "VERIFICATION_EXPIRED"` de `confirmSignUpAction` |
| Aviso del login | `?registered=ok` |

### Textos

| Pantalla | Título | Descripción y textos |
| --- | --- | --- |
| Correo | «Crea tu cuenta» | «Empieza gratis, sin tarjeta de crédito». Campo «Correo electrónico» (`placeholder="ana@consultorio.com"`), con la ayuda «Te enviaremos un código para confirmarlo.». Botón «Continuar». Pie: «¿Ya tienes cuenta? Inicia sesión». |
| Código | «Revisa tu correo» | «Escribe el código de 6 dígitos que te enviamos. Vence en 10 minutos.». Debajo, el correo en un recuadro `bg-brand-surface` con «Cambiar» (para el lector de pantalla, «Cambiar correo»). Campo «Código de 6 dígitos», con la ayuda «Si no lo ves, revisa la carpeta de spam.». Botón «Verificar código». «¿No te llegó? Reenviar en 42 s», que pasa a «Reenviar código». Pie: «¿Ya tienes cuenta? Inicia sesión». |
| Contraseña | «Crea tu contraseña» | «Con ella entrarás a WizyDoc como {correo}.». `PasswordInput` «Contraseña» (`placeholder="Mínimo 8 caracteres"`). Botón «Crear cuenta». |
| Verificación vencida | «Tu verificación venció» | «Vuelve a pedir el código.». Botón «Pedir un código nuevo». |

El pie «¿Ya tienes cuenta? Inicia sesión» del código también sirve a quien ya
tenía cuenta y recibió «Intentaron crear una cuenta con tu correo», sin decir
nada que no se vea con cualquier correo.

### Estados

| Pantalla | Estado | Qué se ve |
| --- | --- | --- |
| Correo | Normal | Ver «Textos». Sin foco automático: es la página de entrada. |
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
| Código | Reenvío dentro del minuto | Se ve igual que la cuenta atrás: «Reenviar en N s» con los segundos que devolvió el servidor, sin «Te enviamos un código nuevo.» (D-4). |
| Código | Reenvío con 400, 429 o fallo | El mensaje del pedido, en rojo, debajo del enlace. El enlace vuelve a estar disponible. |
| Contraseña | Normal | El campo con el foco. |
| Contraseña | Carga | «Creando tu cuenta…» en el botón. |
| Contraseña | Error de campo | Debajo del campo, uno de los tres mensajes de la contraseña de la spec, con el foco en el campo. |
| Contraseña | Fallo o sin red | «No pudimos crear tu cuenta. Intenta de nuevo.» Lo escrito se conserva. |
| Contraseña | Verificación vencida | La tarjeta de «Textos», con el foco en el título. |
| Login | Tras el 204 | El aviso teal del login (`bg-brand-teal/10 text-brand-teal-dark`, con `CheckCircle2`), el mismo bloque que el de `?reset=ok`, con «Tu cuenta quedó creada. Inicia sesión con tu correo y tu contraseña.». |
| Todas | Vacío | No aplica: no hay listas. |
| Todas | 403 | No aplica: son públicas y no hay membership. El 403 del gateway (clave mala) se ve como el fallo de cada paso. |
| Todas | 402 | No aplica: registrarse es igual en todos los planes, y la cuenta todavía no tiene plan. |

### Interacciones

- **«Continuar»:** valida el correo en el cliente. Si sirve, llama a
  `requestSignUpCodeAction`, que con 202 lleva a `/sign-up/code`. Sin toasts:
  todo pasa en la tarjeta.
- **«Cambiar»** lleva a `/sign-up` con el correo escrito.
- **El campo del código:** deja sólo los dígitos, hasta 6. Al sexto, envía el
  formulario (`requestSubmit`).
- **«Verificar código»:** si faltan dígitos, muestra el error sin llamar al
  backend. Si no, llama a `verifySignUpCodeAction`, que con 200 lleva a
  `/sign-up/password`.
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
- **«Pedir un código nuevo»** lleva a `/sign-up` con el correo escrito.
- **«Inicia sesión»** lleva a `/login`.
- **Los botones** quedan deshabilitados mientras su action no termina, también
  después de un `redirect`, hasta que la navegación desmonte el formulario,
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
- **Foco:**
  - la pantalla del correo no mueve el foco, como el login y la recuperación:
    ni al abrirla ni al volver con «Cambiar» o «Pedir un código nuevo»;
  - el campo del código y el de la contraseña llevan `autoFocus`, porque se
    llega a ellos desde el paso anterior;
  - con un error de campo, el foco va al primer campo inválido
    (`useFocusFirstInvalid`);
  - en la tarjeta vencida, al título (`titleRef`, `<h1 tabIndex={-1}>`).
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
en `better-auth`, y con ese valor nadie ve `/sign-up`. Los tamaños son de código
de producción, sin pruebas ni docs.

| Parte | Qué incluye | Depende de | Cómo se verifica sola | Tamaño |
| --- | --- | --- | --- | --- |
| 1. Docs | `docs/features/registro-con-codigo/plan.md` y `mockup.html`, y después los criterios del product-manager. | — | Revisión del humano. El mockup con Lavish. | 0 |
| 2. El killswitch y el correo | `.env.example`; `auth-backend.ts`; `lib/api/sign-up/index.ts` con `requestCode`; `sign-up-validation.ts` (correo); `sign-up-progress.ts` (sin token); `COOKIE_NAMES.signUpProgress`; `request-sign-up-code.action.ts`; `sign-up/layout.tsx`, `page.tsx` y `sign-up-email-form.tsx`; `middleware.ts`. En pruebas: el falso backend con `/code`, el segundo platform, el proyecto `serverless`, `sign-up-email.spec.ts`, `sign-up-killswitch.spec.ts` y la línea del README. | 1 | `typecheck`, `check` y la suite e2e. «Continuar» lleva a `/sign-up/code`, que todavía responde 404: el e2e comprueba la petición, las cabeceras y la cookie. | ~320 líneas |
| 3. El código | `code/page.tsx` y `sign-up-code-form.tsx`; `verify-sign-up-code.action.ts` y `resend-sign-up-code.action.ts`; `verifyCode` en el cliente; el token en `sign-up-progress.ts`; el código en `sign-up-validation.ts`. En pruebas: `/code/verify` en el falso backend y `sign-up-code.spec.ts`. | 2 | `typecheck`, `check` y la suite e2e. Un código correcto lleva a `/sign-up/password`, que todavía responde 404. | ~350 líneas |
| 4. La contraseña, la sesión y la redirección | `password/page.tsx` y `sign-up-password-form.tsx`; `confirm-sign-up.action.ts`; `confirm` y `types.ts` en el cliente; `cognito-session.ts`; las cookies de la sesión en `COOKIE_NAMES`; la contraseña en `sign-up-validation.ts`; el aviso del login; los `redirects()` de `/register` y `/confirm-email` en `next.config.ts`. En pruebas: `/confirm` en el falso backend y `sign-up-password.spec.ts`. | 3, y #142 mergeado: los 30 días del refresh token de `wizydoc-platform` tienen que ser los definitivos | `typecheck`, `check` y la suite e2e. Con `serverless`, el flujo completo desde `/register` contra el falso backend. | ~340 líneas |
| 5. Borrar el registro viejo | En cuanto producción y staging estén en `serverless`: como no hay vuelta a `better-auth`, el registro viejo ya no lo usa nadie. Se borran `register/page.tsx` y `confirm-email/page.tsx`. Los `redirects()` de `/register` y `/confirm-email` quedan sin condición y pasan a permanentes (308), porque `web` y los correos viejos siguen enlazando a `/register`. Se quitan la consulta al killswitch en `sign-up/layout.tsx` y en las cuatro actions, y `auth-backend.ts` si el login y la sesión ya no lo usan. En pruebas: se borran `register.spec.ts`, `register-form.spec.ts`, `sign-up-killswitch.spec.ts`, `registerViaUi` y `confirmEmailViaLink`, y el segundo platform se junta con el primero. | 4, y producción y staging en `serverless` | `typecheck`, `check` y la suite e2e completa. | Sobre todo borra (neto negativo) |

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
y del mockup aprobados y de la spec de WIZ-75.

- **[e2e]** lo cubre Playwright: el registro nuevo, en el segundo platform contra
  el falso backend; el killswitch, en el platform de hoy. Cada prueba se llama
  por lo que comprueba, sin citar ningún criterio.
- **[manual]** lo comprueba el engineer o el reviewer en el navegador, en el diff
  o con `next build`. Platform no tiene pruebas unitarias.
- Entre paréntesis, la parte que entrega lo que el criterio comprueba.
- Donde «Verificación» y estos criterios difieren en qué es **[e2e]**, mandan
  estos criterios.

Convenciones:
- «El platform de hoy» es el de `:3100`, con `AUTH_BACKEND=better-auth`. «El
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
  `/sign-up`, `/sign-up/code` y `/sign-up/password` responden 404, y `/register`
  muestra el formulario de hoy, con nombre, apellido, celular, correo y
  contraseña.
- **[e2e]** (parte 4) En el segundo platform, `/register` y `/confirm-email`
  responden 307 hacia `/sign-up`, y desde `/register` se completa el registro
  hasta `/onboarding` contra el falso backend.
- **[manual]** (partes 2, 3 y 4) Cada una de las cuatro server actions comprueba
  el killswitch antes que nada. Con `better-auth` termina sin llamar al backend
  ni escribir cookies.
- **[manual]** (parte 2) Sólo el valor exacto `serverless` enciende el registro
  nuevo. Sin la variable, vacía o con otro texto (`Serverless`, `serverles`),
  `/sign-up` responde 404.
- **[manual]** (parte 4) El cambio necesita un build. Con `next build` y
  `serverless`, `/register` y `/confirm-email` redirigen a `/sign-up`. Con
  `next build` y `better-auth`, las dos se ven como hoy y `/sign-up` responde
  404.
- **[manual]** (parte 2) `.env.example` trae `AUTH_BACKEND=better-auth`,
  `BACKEND_API_URL=` y `BACKEND_API_KEY=`, cada una con una línea que dice para
  qué sirve. La de `AUTH_BACKEND` nombra los dos valores.

### Pantalla 1: el correo

- **[e2e]** (parte 2) En el segundo platform, con un correo válido en
  `/sign-up`, «Continuar» hace que el falso backend reciba un solo
  `POST /api/auth/sign-up/code` con ese correo, y el navegador va a
  `/sign-up/code`. En la parte 2 esa ruta todavía responde 404: la prueba mira el
  pedido y la cookie.
- **[e2e]** (parte 2) Después de «Continuar», la cookie `sign_up_progress` es
  `httpOnly`, con `path` `/sign-up` y `sameSite` `Lax`, y vence a la hora.
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
- **[manual]** (parte 2) Con un avance en la cookie, `/sign-up` trae su correo
  escrito.
- **[manual]** (parte 2) La pantalla coincide con «Textos», «Estados» y el
  mockup: «Enviando código…» con el spinner y el campo de sólo lectura mientras
  carga, sin foco automático, `type="email"` con `autoComplete="email"`, y
  «Inicia sesión» lleva a `/login`.

### Pantalla 2: el código

- **[e2e]** (parte 3) En `/sign-up/code`, al escribir el sexto dígito de
  `482913` el formulario se envía solo, sin pulsar «Verificar código». El falso
  backend recibe un solo `POST /api/auth/sign-up/code/verify` con el correo del
  paso 1 y ese código, y el navegador va a `/sign-up/password` (404 hasta la
  parte 4).
- **[e2e]** (parte 3) Con un código que el falso backend rechaza, la persona se
  queda en `/sign-up/code` con «El código no es correcto o ya venció. Pide uno
  nuevo si lo necesitas.» debajo del campo, y puede escribir otro.
- **[e2e]** (parte 3) Al llegar, «Reenviar en 60 s» está deshabilitado. Pasado
  el minuto se lee «Reenviar código». Al pulsarlo, el falso backend recibe un
  `POST /api/auth/sign-up/code` más con el mismo correo, aparece «Te enviamos un
  código nuevo.» y vuelve «Reenviar en 60 s» deshabilitado. El minuto lo cuenta
  el servidor (D-4): la prueba no lo puede adelantar sólo con el reloj del
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
- **[manual]** (parte 3) `/sign-up/code` sin la cookie lleva a `/sign-up`, y con
  el código ya verificado, a `/sign-up/password`. «Cambiar» lleva a `/sign-up`
  con el correo escrito.
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
  verificación venció», con el foco en el título. La cookie pierde el token y
  conserva el correo, y «Pedir un código nuevo» lleva a `/sign-up` con el correo
  escrito.
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
- **[manual]** (parte 4) `/sign-up/password` sin la cookie lleva a `/sign-up`, y
  sin token, a `/sign-up/code`.
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
  `AUTH_BACKEND`, `BACKEND_API_URL` y `BACKEND_API_KEY` no llevan
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
