# La cuenta se crea una sola vez por usuario

## Objetivo

Que `POST /account` sólo cree una cuenta para un usuario que todavía no tiene
ninguna, también ante dos llamadas simultáneas, y responda 409 en cualquier
otro caso.

## Modelo de amenaza

- **Quién:** cualquier usuario confirmado que ya pertenece a una cuenta: el
  dueño o un miembro del equipo que aceptó su invitación (`set-password` le deja
  `confirmed` y `onboardingCompleted` en `true` y `accountId` ya asignado).
- **Cómo:** la política de la ruta es sólo `policy({ confirmed: true })` y
  `CompleteAccountSetupUseCase.execute` no mira `user.accountId`. Llamar a la
  ruta directamente (la UI lo esconde con la redirección de
  `platform/src/app/(onboarding)/layout.tsx`, nada más) crea otra `Account`, le
  pone el usuario como dueño y mueve su `user.accountId` a la nueva.
- **Efecto:** la cuenta original pierde a ese usuario (si era el dueño, nadie
  más la administra) y su suscripción de Culqi puede seguir cobrando. Con un
  plan de pago en el cuerpo, además se abre un segundo cobro.
- **Sin atacante:** un doble envío del formulario de onboarding (dos pestañas,
  reintento de red) crea hoy dos cuentas y, con plan de pago, dos suscripciones.
  Ambas peticiones leen `accountId = null` antes de que la otra confirme.

## Invariantes

1. Un usuario con `accountId` no puede crear otra cuenta: 409 y nada cambia
   (ni `user`, ni `account`, ni `subscription`, ni Culqi).
2. Dos `POST /account` simultáneos del mismo usuario dejan una sola cuenta: uno
   responde 201 y el otro 409.
3. El cobro en Culqi sólo se inicia después de asegurar el invariante 1.

## Cambios por capa

**Prisma:** ninguno. Sin migración.

**api**

- `api/src/application/errors/conflict.error.ts` (nuevo), con la forma de
  `forbidden.error.ts`: `statusCode = 409`, `code = "CONFLICT"`.
- `api/src/domain/repositories/user.repository.ts`: añadir
  `assignAccountIfNone(userId: string, accountId: string): Promise<boolean>`.
- `api/src/infrastructure/postgres/repositories/user.repository.ts`:
  implementarlo con `updateMany({ where: { id: userId, accountId: null }, data:
  { accountId, onboardingCompleted: true } })` y devolver `count === 1`.
- `api/src/application/use-cases/account/complete-account-setup.usecase.ts`:
  sustituir `this.users.update(...)` dentro de la transacción por la asignación
  condicional, antes de `startBilling`:
  ```ts
  // Condicional y no leer-y-comprobar: dos envíos simultáneos verían los dos accountId en null.
  const isAccountAssigned = await this.users.assignAccountIfNone(userId, account.id);
  if (!isAccountAssigned) throw new Conflict("Tu usuario ya pertenece a una cuenta");
  ```
  El `throw` revierte la `Account` recién insertada. Con READ COMMITTED, el
  segundo `UPDATE` espera el bloqueo de fila del primero y, al confirmarse éste,
  reevalúa el `WHERE` y no actualiza nada. Si el primero se revierte (tarjeta
  rechazada), el segundo sigue y crea la cuenta.
- `api/src/routes/account/index.ts`: sin cambios. Ya traduce cualquier
  `ApplicationError` a `{ message, code }` con su `statusCode`. La política
  sigue siendo `policy({ confirmed: true })`: este endpoint es justo el que crea
  la cuenta, así que no puede exigir `account`.

**platform:** sin cambios. `create-account.action.ts` recibe un `ApiError` con
el `message` del api y `onboarding/page.tsx` lo muestra con `toast.error`: el
usuario ve "Tu usuario ya pertenece a una cuenta" y se queda en el formulario.
En la práctica sólo lo ve quien gana la carrera de un doble envío, porque el
layout de onboarding ya redirige a quien tiene la cuenta creada.

## Aislamiento entre cuentas

El `userId` sale de la sesión, no del cuerpo. La condición `accountId: null`
garantiza que la única cuenta que se puede asignar es la que se acaba de crear
en la misma transacción; nunca se reasigna una existente.

## Conflicto con `chore/beta-free-plan-only` (sin mergear)

Esa rama sólo cambia el campo `plan` de `completeAccountSetupSchema` (línea 18)
por un `z.literal(Plan.FREE)`. Este ticket toca `execute` (líneas 57-85) y los
imports. Hunks separados: se espera merge limpio. Si Git choca en los imports,
conservar ambos. Con la beta sólo en Gratis el riesgo de doble cobro baja, pero
el robo del usuario a su cuenta sigue igual: este arreglo no depende de esa rama.

## Verificación

- `cd api && ./node_modules/.bin/tsc --noEmit` (no `pnpm typecheck` en el
  worktree).
- Deben seguir pasando: `ui/auth/onboarding.spec.ts` (CA-12) y todo lo que use
  `createOnboardedAdmin`, que llama a `POST /account` una vez.
- e2e nuevo `platform/e2e/api/security/fix-account-setup-once.spec.ts`:
  - Dueño: `createOnboardedAdmin` y otro `POST /account` → 409; `GET /user/me`
    mantiene el `accountId`; en la base (`getTestPrisma`) sigue habiendo una
    sola `account` con ese `ownerId`.
  - Miembro: `createMemberWithRole` (USER o DOCTOR) y `POST /account` → 409;
    su `accountId` no cambia.
  - Carrera: `createConfirmedUser` y dos `POST /account` con `Promise.all` →
    estados `[201, 409]` en cualquier orden y una sola `account` con ese
    `ownerId`.
- Sin cubrir por e2e: el plan de pago (Culqi). El orden "asignar antes de
  cobrar" se verifica por revisión.

## Decisiones abiertas

1. **Código de respuesta.** 409 con una clase `Conflict` nueva (6 líneas) o
   reutilizar `UnprocessableEntity` (422) sin archivo nuevo. Recomiendo 409: es
   el significado exacto y el cliente puede distinguirlo de un cuerpo inválido.
2. **Método nuevo en el repositorio o `getClient()` en el caso de uso.**
   Recomiendo el método: el caso de uso hoy sólo usa repositorios y no conviene
   mezclar.

Despliegue: sólo api, sin migración, independiente de las otras ramas.

## Criterios de aceptación

Decisión: la respuesta es 409 con una clase `Conflict` nueva (`code = "CONFLICT"`).
Decisión: la condición "sin cuenta" vive en un método del repositorio (`assignAccountIfNone`), no en `getClient()` dentro del caso de uso.

- **CA-1** `[e2e]` Dado un dueño con la cuenta ya creada, cuando llama otra vez a
  `POST /account`, entonces recibe 409 con `code: "CONFLICT"` y el mensaje "Tu
  usuario ya pertenece a una cuenta"; `GET /user/me` mantiene su `accountId` y
  sigue habiendo una sola `account` y una sola `subscription` con ese `ownerId`.
- **CA-2** `[e2e]` Dado un miembro USER o DOCTOR que aceptó su invitación,
  cuando llama a `POST /account`, entonces recibe 409, su `accountId` no cambia,
  no existe ninguna `account` con él como dueño y la cuenta original conserva a
  su dueño.
- **CA-3** `[e2e]` Dado un usuario confirmado sin cuenta, cuando envía dos
  `POST /account` a la vez, entonces los estados son 201 y 409 en cualquier
  orden y queda una sola `account` y una sola `subscription` con ese `ownerId`.
- **CA-4** `[e2e]` Dado un usuario confirmado sin cuenta, cuando completa el
  onboarding en el navegador, entonces se crea su cuenta y llega al panel
  (`ui/auth/onboarding.spec.ts` y los specs que usan `createOnboardedAdmin`
  siguen pasando).
- **CA-5** `[e2e]` Dado un usuario con cuenta, cuando abre `/onboarding` en el
  navegador, entonces sigue siendo redirigido fuera del formulario.
- **CA-6** `[e2e]` Dado cualquiera de los 409 anteriores, cuando se inspecciona
  el cuerpo, entonces sólo trae `{ message, code }`: ni el id, ni el nombre, ni
  el plan de la cuenta existente.
- **CA-7** `[manual]` Dado el api local con claves de prueba de Culqi y un
  esquema que aún acepte planes de pago, cuando un dueño con cuenta llama a
  `POST /account` con un plan de pago y una tarjeta de prueba, entonces recibe
  409 y en el panel de pruebas de Culqi no aparece cliente, tarjeta ni
  suscripción nuevos.
