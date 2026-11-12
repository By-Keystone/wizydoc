# La cuenta al registrarse, el autorizador y la policy

- **Ticket:** [WIZ-78](https://linear.app/wizydoc/issue/WIZ-78/sign-in-and-session-with-cognito),
  subticket de [WIZ-71 · Migrate authentication endpoints](https://linear.app/wizydoc/issue/WIZ-71/migrate-authentication-endpoints).
- **Es la segunda spec de WIZ-78.** La primera, la del [inicio de sesión](../sign-in/spec.md),
  entrega los tokens de Cognito. Esta hace que el backend reconozca la sesión.
- **Cambia a la [spec del registro con código](../sign-up-code/spec.md):** crear
  la cuenta en `POST /api/auth/sign-up/confirm` también crea la cuenta del
  consultorio. Esa spec no se edita.
- **Reemplaza a:** en `api/`, el plugin `policy` y `GET /user/me`, que leen la
  sesión de Better Auth.
- **Decidido por el humano entre el 8 y el 12 de noviembre de 2026:**
  - la sesión la valida un autorizador de Cognito del gateway, con el ID token,
    y el `sub` sale sólo de sus claims;
  - los roles siguen en las memberships por recurso, sin grupos de Cognito;
  - la cuenta se crea al confirmar el registro, sin nombre y sin plan, con el
    usuario como dueño y enlazado a ella;
  - el paso del onboarding se guarda en el usuario (`OnboardingStep`), junto con
    la fecha en que lo terminó.

## Qué cambia

1. **Registrarse crea también la cuenta del consultorio.** Sin nombre y sin
   plan, con el usuario como dueño. El usuario queda enlazado a ella y en el
   primer paso del onboarding.
2. **Las rutas privadas exigen el ID token de Cognito,** además de la clave de
   platform. Sin token, o con uno vencido o ajeno, responden 401.
3. **Una `policy()` compartida** comprueba en cada ruta privada, contra
   DynamoDB, lo que la ruta declara: que el usuario exista y esté confirmado, en
   qué paso del onboarding está y qué rol tiene sobre el recurso.
4. **`GET /api/me`** devuelve el usuario de la sesión, su cuenta y su paso del
   onboarding. Es la primera ruta privada.

## Diferencias con hoy

| Hoy (Better Auth y el api) | Con esta spec |
|---|---|
| La cuenta la crea el onboarding, con el nombre del consultorio. | La crea el registro, sin nombre: el nombre vive en la organización. |
| `onboardingCompleted` es un booleano que pasa a `true` al crear la cuenta. | `OnboardingStep` dice en qué paso va (`PERSONAL_DATA`, `PLAN`, `CLINIC`, `SCHEDULE` o `COMPLETED`) y `OnboardingCompletedAt`, cuándo terminó. |
| La sesión es la cookie de Better Auth, que el api busca en Postgres. | La sesión es el ID token de Cognito, que valida el gateway. El backend no guarda sesiones. |
| La policy lee la sesión, el usuario y la membership en Postgres. | Lee el usuario y sus memberships en DynamoDB, por el `sub` del token. |

## Rutas

### `POST /api/auth/sign-up/confirm`: crear la cuenta

La entrada y las respuestas no cambian. Cambia lo que guarda, en la misma
transacción que ya crea al usuario:

| Ítem | Qué guarda |
|---|---|
| El usuario (`USER#<id>`) | Lo de hoy, más `AccountId` (la cuenta nueva) y `OnboardingStep = PERSONAL_DATA`. Ya no guarda `OnboardingCompleted`. |
| La cuenta (`ACCOUNT#<id>`, `SK "!"`) | `Id` y `OwnerUserId` (el usuario nuevo). Sin nombre, sin plan y sin `CreatedAt`: la fecha de creación sale del `Id`, que es un ULID. |

Si la transacción falla, no queda ni el usuario ni la cuenta, y el usuario se
borra de Cognito, como hoy.

### `GET /api/me`: el usuario de la sesión

Exige la clave de platform y el ID token. No exige haber terminado el
onboarding: platform la usa para saber a qué paso llevar a la persona.

| Código | Cuándo | Cuerpo |
|---|---|---|
| 200 | El token es válido y el usuario existe. | `{ "id", "email", "givenName", "familyName", "phone", "treatment", "accountId", "isAccountOwner", "onboardingStep" }`. Los datos personales son `null` hasta que se guardan en el onboarding. |
| 401 | No hay token, venció, no es de este user pool, o su `sub` no tiene usuario. | `{ "message": "Tu sesión venció. Inicia sesión de nuevo." }` |

## La sesión en cada ruta privada

**El autorizador.** El gateway valida el ID token que llega en `Authorization`:
la firma, el vencimiento y que sea del user pool de WizyDoc. Si no sirve,
responde 401 sin invocar ninguna Lambda. La Lambda toma el `sub` de los claims
que deja el autorizador, nunca del cuerpo, de un parámetro ni de otra cabecera.

**La `policy()`.** Cada ruta privada declara lo que exige, y la policy lo
comprueba en este orden:

| Si la ruta exige | Y | Responde |
|---|---|---|
| (siempre) | el `sub` no tiene usuario en DynamoDB | 401 «Tu sesión venció. Inicia sesión de nuevo.» |
| `confirmed` | el usuario no está confirmado | 403 «Confirma tu correo para continuar.» |
| un paso del onboarding (por defecto, `COMPLETED`) | el usuario está en otro paso | 403 `{ "message": "Termina de configurar tu cuenta.", "onboardingStep": "<el paso en que va>" }` |
| ser miembro del recurso de la ruta | no tiene membership sobre ese recurso | 404 «No encontramos lo que buscas.» |
| uno de ciertos roles sobre el recurso | su membership tiene otro rol | 403 «No tienes permiso para hacer esto.» |

- Sin membership responde 404 y no 403, como hoy: así no revela qué recursos
  existen en otras cuentas.
- Una ruta que no declara su policy no se puede crear: la prueba de síntesis
  falla.
- La policy lee el usuario y sus memberships en cada pedido. No guarda nada en
  caché entre pedidos: un cambio de rol vale en el pedido siguiente.

## Fuera de alcance

- **Los endpoints del onboarding** («Tus datos», «Tu plan», «Tu consultorio» y
  «Tu horario»): la spec siguiente de WIZ-77.
- **Platform:** mandar el ID token, el login detrás de `BACKEND` y leer
  `GET /api/me` en el middleware.
- **Migrar las demás rutas del api** a la policy nueva.
- **Las invitaciones,** que crean usuarios con memberships y sin cuenta propia.

## Riesgos aceptados

- **Un ID token revocado sirve hasta que vence,** como mucho 15 minutos: el
  autorizador sólo revisa la firma y el vencimiento (ver la spec del inicio de
  sesión).
- **Leer el usuario y sus memberships en cada pedido** cuesta una lectura de
  DynamoDB por pedido, a cambio de que un cambio de rol o de paso valga al
  instante.

## Criterios de aceptación

- Crear la cuenta con un token de verificación vigente crea, en la misma
  transacción, el usuario con `AccountId` y `OnboardingStep = PERSONAL_DATA`, y
  la cuenta con el usuario como dueño, sin nombre y sin plan.
- Si falla la transacción, no queda ni el usuario ni la cuenta, y el usuario se
  borra de Cognito.
- El usuario nuevo ya no guarda `OnboardingCompleted`.
- `GET /api/me` con un ID token válido responde 200 con los datos del usuario,
  su cuenta, si es el dueño y su paso del onboarding, aunque no lo haya
  terminado.
- Una ruta privada sin ID token, con uno vencido o con uno de otro user pool
  responde 401 sin invocar ninguna Lambda.
- Un ID token válido cuyo `sub` no tiene usuario responde 401.
- La Lambda toma el `sub` sólo de los claims del autorizador.
- Una ruta que exige el onboarding terminado responde 403 con el paso en que va
  el usuario si no lo terminó.
- Una ruta que exige ser miembro de un recurso responde 404 si el usuario no
  tiene membership sobre él, también si el recurso existe en otra cuenta.
- Una ruta que exige ciertos roles responde 403 si la membership tiene otro.
- Toda ruta privada declara su policy y exige la clave de platform y el ID
  token.
- Ni los tokens ni los datos personales aparecen en los logs.
