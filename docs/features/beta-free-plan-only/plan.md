# Beta: sólo plan Gratis, cobro con Culqi congelado

Estado: **pendiente de decisiones** (ver "Riesgos y decisiones abiertas"). La
parte de api y platform está lista para implementar; la de la landing depende
de D1 y D2.

Contexto: `docs/PRODUCT.md` (sección "Estado") y `docs/capacidades.md` ya dicen
que el cobro está congelado y que el onboarding sólo ofrece Gratis. El código
de `main` no lo aplica. El código de Culqi **no se borra**: se reactivará
cuando el humano cumpla los requisitos que pidió Culqi.

---

## Objetivo

Que durante la beta sólo se pueda crear una cuenta con el plan Gratis, y que el
api lo imponga aunque alguien envíe otro plan a mano, sin borrar la integración
con Culqi y con una reactivación de pocas líneas.

## Hallazgos (leyendo código, sin ejecutar)

1. **Hoy cualquiera obtiene el plan Red gratis.** `PLAN_OPTIONS`
   (`platform/src/lib/plans.ts`) incluye `RED` con `amountCents: null`, así que
   el onboarding no abre el checkout. En el api, `requiresPayment("RED")` es
   `false` (`monthlyPriceCents: null` en `PLAN_CAPABILITIES`), así que
   `CompleteAccountSetupUseCase` no llama a Culqi y guarda una suscripción
   `RED` + `ACTIVE`: médicos y sedes ilimitados y todas las features, sin
   pagar ni firmar contrato. Basta con elegir "Red · a medida" en el select o
   enviar `{"plan":"RED"}` a `POST /account`. Este ticket lo cierra; la
   reactivación **no** debe volver a abrirlo (ver "Reactivación").
2. Elegir Consultorio o Clínica cobra de verdad: `startBilling` crea cliente,
   tarjeta (con validación de S/ 3) y suscripción en Culqi. La suscripción de
   Culqi es recurrente **en Culqi**; WizyDoc no recibe webhooks, así que no se
   entera de renovaciones ni de cobros fallidos.
3. **Los botones de la landing están rotos hoy, todos.** En
   `web/src/components/marketing/pricing.tsx` los `href` son relativos
   (`/register`, `/register?plan=…`, `/contact`) y `web` no tiene esas rutas
   (`web/src/app` sólo tiene `/`, `/beta` y `/terminos-y-condiciones`): en
   wizydoc.app dan 404. El resto de la landing usa
   `` `${PLATFORM_URL}/register` `` (`web/src/lib/platform-url.ts`). Además,
   `platform/src/app/(auth)/register/page.tsx` no lee `?plan=`: aunque el link
   llegara a platform, el parámetro se ignora.
4. `/contact` no existe en ningún proyecto, y el correo de contacto de
   `terminos-y-condiciones/page.tsx` sigue siendo el marcador
   `[CORREO ELECTRÓNICO]`.
5. `useCulqiCheckout` carga `https://js.culqi.com/checkout-js` al montar la
   página de onboarding, se elija el plan que se elija. No es una regresión de
   este ticket.

## Evaluación de la implementación previa (parche descartado)

El parche hacía dos cosas. Las dos se mantienen, con un ajuste en el
comentario y una advertencia para la reactivación.

**api: `z.literal(Plan.FREE, { error }).default(Plan.FREE)`.** Es la forma más
simple y correcta:

- Rechaza `CONSULTORIO`, `CLINICA` **y `RED`** en la validación del body, antes
  de que el caso de uso abra la transacción: no se crea cuenta ni se llama a
  Culqi.
- Sin `plan` sigue dando `FREE`, como hoy.
- El `refine` de `requiresPayment` y `startBilling` quedan inalcanzables. **Se
  dejan como están**: borrarlos agranda la reactivación y arriesga olvidar la
  guarda de tarjeta/dirección/ciudad al volver. `pnpm typecheck` los sigue
  compilando, así que no se pudren en silencio. `dto.plan` pasa a tener tipo
  `"FREE"`, que sigue siendo asignable a `Plan` en `requiresPayment` y en
  `startSubscription`.
- Alternativas descartadas:
  - Variable de entorno (`BILLING_ENABLED`): activar el cobro en producción
    debe ser un cambio de código revisado y un release, no una variable que
    alguien cambia en el despliegue. Además, es configuración para un único
    caso.
  - Lista `PLANS_OPEN_FOR_SIGNUP` en `domain/entities/subscription/plan.ts`:
    un solo consumidor en el api y platform no puede importarla; sería una
    indirección.

**platform: `PLANS_OPEN_DURING_BETA` filtrando `PLAN_OPTIONS`.** Se mantiene.

- El select con una sola opción sigue mostrándose (recomendación, ver D3):
  dice qué plan se lleva el médico ("Gratis · 1 médico, 1 sede"), no añade UI
  nueva y se revierte con una línea.
- No se usa `disabled` en el select: un control deshabilitado no viaja en el
  `FormData` y la action rechazaría el envío con "Elige un plan".
- Sustituirlo por texto fijo + `<input type="hidden">` obligaría a quitar el
  `useState` de `plan` (lint por `setPlan` sin uso) y con él la rama de pago:
  es un diff más grande y una reactivación más grande.
- Con `FREE`, `requiresPayment` es `false`: no se muestran los campos de
  facturación, el botón dice "Continuar" y no depende de que cargue el script
  de Culqi.

## Cambios por capa

### Prisma

Sin cambios ni migración.

### api

**`api/src/application/use-cases/account/complete-account-setup.usecase.ts`**
(modificar, sólo el campo `plan` del schema):

```ts
// El cobro con Culqi está congelado en la beta (docs/PRODUCT.md, "Estado"):
// sin renovación ni cancelación, un plan de pago no se puede gestionar después.
plan: z
  .literal(Plan.FREE, {
    error: "Durante la beta sólo está disponible el plan Gratis",
  })
  .default(Plan.FREE),
```

El `refine`, `requiresPayment`, `startBilling`, `BillingService`,
`CulqiBillingService` y su cableado en `server.ts` y `routes/account/index.ts`
**no se tocan**.

Ruta afectada (sin cambios en su definición): `POST /account`, con
`policy({ confirmed: true })`. No hay rutas nuevas.

### platform

**`platform/src/app/(onboarding)/onboarding/page.tsx`** (modificar): constante
`PLANS_OPEN_DURING_BETA = PLAN_OPTIONS.filter((option) => option.value === "FREE")`
con el mismo comentario de una línea que el api, y `options={PLANS_OPEN_DURING_BETA}`
en el `<Select>`. Nada más.

Sin cambios: `platform/src/lib/plans.ts`,
`platform/src/lib/actions/account/create-account.action.ts` (sigue aceptando
cualquier `PLAN_VALUES`; quien decide es el api), `useCulqiCheckout`.

### web

**`web/src/components/marketing/pricing.tsx`** (modificar). Dos partes:

1. **Arreglo de enlaces (no cambia el mensaje, se hace sí o sí):** usar
   `` `${PLATFORM_URL}/register` `` como en `hero.tsx`, `cta.tsx` y
   `navbar.tsx`, y quitar `?plan=…` (platform no lo lee). Cambiar `<Link>` por
   `<a>` en el `CardFooter`, igual que esos componentes, porque es otro dominio.
2. **Mensaje durante la beta (depende de D1 y D2).** Propuesta recomendada:
   - Gratis: sin cambios ("Empezar gratis").
   - Consultorio y Clínica: se mantienen tarjeta, precio y comparativa (son el
     modelo de negocio); CTA "Empezar gratis" a `` `${PLATFORM_URL}/register` ``.
   - Bajo el título de la sección, sustituir "Sin permanencia. Cancela cuando
     quieras." (hoy no existe cancelación) por: "Durante la beta todas las
     cuentas empiezan en el plan Gratis. Te avisaremos antes de activar los
     planes de pago."
   - Red: "Hablar con ventas" a un canal real (D2). Mientras no exista, se
     quita el botón.

### Archivos

| Acción | Ruta |
| --- | --- |
| Modificar | `api/src/application/use-cases/account/complete-account-setup.usecase.ts` |
| Modificar | `platform/src/app/(onboarding)/onboarding/page.tsx` |
| Modificar | `web/src/components/marketing/pricing.tsx` |
| Crear (cuando `chore/e2e-infra` esté en `main`) | `platform/e2e/api/account/beta-free-plan-only.spec.ts` |
| Crear (ídem) | `platform/e2e/ui/auth/onboarding-free-plan.spec.ts` |

## Cuentas existentes con plan de pago

- **No se tocan.** El cambio sólo afecta a `POST /account` (crear cuenta).
  `entitlementsFor` sigue leyendo `plan` + `status` de `subscription`, así que
  una cuenta `CONSULTORIO`/`CLINICA`/`RED` con `ACTIVE` conserva sus
  capacidades.
- **Antes de desplegar, el humano revisa producción** (sólo lectura):

  ```sql
  SELECT account_id, plan, status,
         payment_provider_subscription_id IS NOT NULL AS has_culqi_subscription
  FROM subscription
  WHERE plan <> 'FREE';
  ```

  - Filas `RED` sin acuerdo comercial: salieron del agujero del hallazgo 1.
    Qué hacer con ellas es la decisión D4.
  - Filas con `has_culqi_subscription`: comprobar en el panel de Culqi si la
    suscripción sigue cobrando cada mes (D5).

### Asignar un plan de pago a mano durante el congelamiento

No se construye back-office ni endpoint: el humano ejecuta SQL contra
producción, en transacción y revisando el `RETURNING` antes del `COMMIT`.

```sql
BEGIN;
UPDATE subscription
SET plan = 'CONSULTORIO', status = 'ACTIVE'
WHERE account_id = '<accountId>'
  AND payment_provider_subscription_id IS NULL
RETURNING account_id, plan, status, extra_doctors, extra_clinics;
-- Si devuelve exactamente una fila y es la esperada:
COMMIT;
```

- `payment_provider_subscription_id IS NULL` impide pisar una cuenta que tiene
  suscripción real en Culqi.
- Los campos `payment_provider_*` quedan en `NULL`: son la marca de "asignado
  a mano".
- Médicos o sedes adicionales: `extra_doctors` / `extra_clinics` en el mismo
  `UPDATE`.
- Efecto inmediato: los entitlements se leen en cada petición.
- Volver a Gratis: el mismo `UPDATE` con `plan = 'FREE'`.

## Aislamiento entre cuentas

- No hay datos, consultas ni endpoints nuevos.
- `POST /account` sigue con `policy({ confirmed: true })` y crea la cuenta del
  `userId` de la sesión; el body no recibe ningún id. Este ticket sólo
  restringe el valor de `plan`.
- El SQL manual se acota por `account_id` explícito y por
  `payment_provider_subscription_id IS NULL`.

## Reactivación (cuando Culqi lo permita)

Cambios mínimos, en un ticket propio:

1. api: `plan: z.enum([Plan.FREE, Plan.CONSULTORIO, Plan.CLINICA]).default(Plan.FREE)`.
   **No** volver a `z.enum(Plan)`: reabriría el plan Red gratis (hallazgo 1).
   El `refine` vuelve a exigir tarjeta, dirección y ciudad.
2. platform: borrar `PLANS_OPEN_DURING_BETA` y usar las opciones de
   `PLAN_OPTIONS` sin `RED`.
3. Antes de eso, lo que motivó el congelamiento: renovación, pagos fallidos y
   cancelación (rama `subscription-lifecycle`).

## Riesgos y decisiones abiertas

**D1. Mensaje comercial de la landing durante la beta.** Cambia lo que se
promete en wizydoc.app.
Recomendación: mantener precios y tarjetas de pago, CTA "Empezar gratis" en
Consultorio y Clínica, y sustituir "Sin permanencia. Cancela cuando quieras."
por la frase sobre la beta propuesta arriba. Alternativa: ocultar Consultorio,
Clínica y la comparativa hasta reactivar el cobro.

**D2. Canal de "Hablar con ventas" (Red).** `/contact` no existe y no hay
correo de contacto real en el repo.
Recomendación: `mailto:` a una dirección que el humano indique. Sin ella, se
quita el botón y la tarjeta de Red queda sólo informativa.

**D3. Select de una sola opción en el onboarding.**
Recomendación: dejarlo (ver la evaluación). Alternativa: texto fijo + input
oculto, con un diff más grande. No bloquea.

**D4. Cuentas `RED` creadas por el agujero.** Si la consulta devuelve cuentas
`RED` sin acuerdo comercial: ¿se dejan, se pasan a `FREE` o se les escribe
antes? Pasarlas a `FREE` quita capacidades a alguien que ya las usa (los datos
no se pierden: `entitlementsFor` sólo limita funciones).
Recomendación: revisar la lista antes de decidir; no tocar ninguna cuenta en
este ticket.

**D5. Suscripciones vivas en Culqi.** Si hay cuentas con suscripción real,
Culqi puede seguir cobrándolas cada mes sin que WizyDoc se entere de un cobro
fallido.
Recomendación: el humano revisa el panel de Culqi y decide caso por caso
(cancelar en Culqi y mantener el plan como "asignado a mano", o dejarla). No
se automatiza aquí.

Riesgos menores, sin decisión necesaria:

- **Orden de despliegue:** primero `api-*` y después `platform-*`. Si sale
  primero el api, el platform viejo todavía ofrece planes de pago: el usuario
  podría abrir el checkout y generar un token (generar un token no cobra),
  pero el api lo rechaza con 400 antes de llamar a Culqi, y el toast muestra
  el mensaje de error de validación. Al revés, durante la ventana se podría
  seguir cobrando.
- El script de Culqi se sigue cargando en `/onboarding` (hallazgo 5). Se deja
  así para no tocar el flujo de pago que se reactivará.

## Verificación

Nunca se llama a Culqi real. El caso rechazado no debería llegar a Culqi
porque falla en la validación del body. Aun así, el api local se arranca con
`CULQI_API_BASE_URL=http://localhost:9` exportado en la shell (`dotenv` no
sobrescribe variables ya definidas), así que cualquier llamada se
encontraría con la conexión rechazada. Nadie abre el checkout de Culqi en el
navegador. No hace falta leer ningún `.env`.

1. **Tipos y lint**
   - `cd api && pnpm typecheck`
   - `cd platform && pnpm typecheck && pnpm lint`
   - `cd web && pnpm typecheck && pnpm lint` (si se tocó `pricing.tsx`)
2. **Schema con tsx** (desde `api/`; script temporal en el scratchpad, no en el
   repo). Si `tsx` no resuelve el alias `@/` fuera de `api/`, usar
   `pnpm exec tsx -e '…'` desde `api/`. Casos y resultado esperado de
   `completeAccountSetupSchema.safeParse(...)`:
   - `{ accountName: "Consultorio Dra. Quispe" }` → `success`, `data.plan === "FREE"`.
   - `{ accountName: "…", plan: "FREE" }` → `success`.
   - `{ accountName: "…", plan: "CONSULTORIO", cardToken: "tkn_test_fake", billingAddress: "Av. Larco 123", billingCity: "Lima" }`
     → `!success`, issue en `["plan"]` con "Durante la beta sólo está
     disponible el plan Gratis".
   - Ídem con `plan: "CLINICA"` y con `plan: "RED"` (sin tarjeta) → `!success`
     en `["plan"]`.
3. **Petición al api local** (`CULQI_API_BASE_URL=http://localhost:9 pnpm dev`
   en `api/`, base local de desarrollo):
   - Registrar un usuario (`POST /api/auth/sign-up/email`), confirmarlo en la
     base local (`confirmed = true`) e iniciar sesión
     (`POST /api/auth/sign-in/email`) guardando la cookie con `curl -c`.
   - `POST /account` con `plan: "CONSULTORIO"` + tarjeta/dirección/ciudad →
     **400**. En la base: el usuario sigue con `account_id` nulo y no hay
     `subscription` nueva. En el log del api no aparece
     `[billing] subscription started`.
   - `POST /account` con `plan: "RED"` → **400**.
   - `POST /account` con `{ "accountName": "Consultorio Dra. Quispe" }` →
     **201** `{ accountId }`; `subscription.plan = 'FREE'`,
     `payment_provider_subscription_id` nulo.
4. **Navegador** (platform local contra ese api): registrar, confirmar e ir a
   `/onboarding`. El select "Plan" tiene una sola opción ("Gratis · 1 médico,
   1 sede"), no aparecen "Dirección de facturación" ni "Ciudad" y el botón
   dice "Continuar". Enviar redirige a `/account/<id>/select`. En la pestaña
   Red no hay peticiones a `api.culqi.com`; la carga de `js.culqi.com` es
   esperable.
5. **Landing** (`web` en :3001, `#pricing`): cada botón lleva a
   `<PLATFORM_URL>/register` (o al canal de D2) y ninguno da 404.
6. **e2e** (cuando `chore/e2e-infra` esté en `main`; su entorno ya fija
   `CULQI_API_BASE_URL=http://localhost:9`):
   - `platform/e2e/api/account/beta-free-plan-only.spec.ts` (proyecto `api`):
     `createConfirmedUser` → `POST /account` con `CONSULTORIO` + tarjeta falsa
     → 400; con `RED` → 400; `testPrisma` confirma que el usuario sigue sin
     `accountId` y sin suscripción. Luego `POST /account` sin `plan` → 201, y
     `subscription.plan === "FREE"` con `paymentProviderSubscriptionId` nulo.
   - `platform/e2e/ui/auth/onboarding-free-plan.spec.ts` (proyecto
     `chromium`): usuario confirmado con sesión en el contexto, `goto("/onboarding")`,
     `getByLabel("Plan")` tiene exactamente una opción con valor `FREE`, no
     existe `getByLabel("Dirección de facturación")`, el botón "Continuar"
     envía y la URL pasa a `/account/[^/]+/select`. Además,
     `page.route("**/*culqi.com/**", route => route.abort())`: el onboarding
     Gratis debe completarse aunque Culqi no cargue.

No verificado por quien escribió este plan: nada se ejecutó; los hallazgos
salen de leer el código de `main`.

## Criterios de aceptación

Alcance de esta entrega (decisión del humano): **api y onboarding de
platform**. La landing (`web/src/components/marketing/pricing.tsx`, arreglo de
enlaces, mensaje de la beta y canal de ventas; decisiones D1 y D2, y el paso 5
de "Verificación") queda **fuera de esta entrega** y se hará en una segunda,
cuando el humano decida el mensaje y tenga el correo de contacto. Ningún
criterio de esta sección cubre `web/`.

Marcas: `[e2e]` se automatiza en los specs de "Archivos" (o, mientras
`chore/e2e-infra` no esté en `main`, se comprueba a mano con los pasos 3 y 4 de
"Verificación" y se dice así en el resumen); `[manual]` lo revisa una persona
leyendo el código, el diff o producción. En todos los `[e2e]` el api corre con
`CULQI_API_BASE_URL=http://localhost:9`, así que cualquier llamada a Culqi
fallaría con conexión rechazada.

### Ninguna cuenta nueva nace con un plan distinto de Gratis (api)

**CA-1 `[e2e]` Alta sin plan da Gratis.**
Dado un usuario confirmado, con sesión y sin cuenta,
cuando envía `POST /account` con `{ "accountName": "Consultorio Dra. Quispe" }`,
entonces responde 201 con `{ accountId }`, el usuario queda vinculado a esa
cuenta y su `subscription` tiene `plan = FREE`, `status = ACTIVE` y todos los
campos `payment_provider_*` nulos.

**CA-2 `[e2e]` Alta con plan Gratis explícito.**
Dado un usuario confirmado, con sesión y sin cuenta,
cuando envía `POST /account` con `plan: "FREE"`,
entonces el resultado es el mismo que en CA-1.

**CA-3 `[e2e]` Consultorio rechazado aunque traiga tarjeta.**
Dado un usuario confirmado, con sesión y sin cuenta,
cuando envía `POST /account` con `plan: "CONSULTORIO"`, `cardToken`,
`billingAddress` y `billingCity` válidos en forma,
entonces responde 400 con el error en el campo `plan` y el texto "Durante la
beta sólo está disponible el plan Gratis"; el usuario sigue sin cuenta
(`accountId` nulo) y no se crea ninguna `account` ni `subscription`.

**CA-4 `[e2e]` Clínica rechazada aunque traiga tarjeta.**
Dado lo mismo que en CA-3,
cuando el plan enviado es `"CLINICA"`,
entonces el resultado es el mismo que en CA-3.

**CA-5 `[e2e]` Red rechazado (cierra el hallazgo 1).**
Dado un usuario confirmado, con sesión y sin cuenta,
cuando envía `POST /account` con `plan: "RED"`, con y sin datos de tarjeta,
entonces responde 400 con el mismo error de CA-3, y no se crea cuenta ni
suscripción `RED`.

**CA-6 `[e2e]` Valores de plan desconocidos rechazados.**
Dado un usuario confirmado, con sesión y sin cuenta,
cuando envía `POST /account` con un `plan` que no es exactamente `"FREE"`
(por ejemplo `"free"`, `"PREMIUM"`, `null` o un número),
entonces responde 400 y no se crea cuenta ni suscripción.

**CA-7 `[e2e]` Un rechazo no deja al usuario bloqueado.**
Dado un usuario cuyo `POST /account` con `plan: "CONSULTORIO"` fue rechazado
(CA-3),
cuando a continuación envía `POST /account` sin `plan`,
entonces responde 201 y la cuenta queda en Gratis como en CA-1.

### Nunca se llama a Culqi

**CA-8 `[e2e]` Los rechazos no tocan Culqi.**
Dado el api con `CULQI_API_BASE_URL=http://localhost:9`,
cuando se ejecutan los casos de CA-3, CA-4 y CA-5,
entonces cada respuesta es 400 (nunca 5xx ni un error de conexión, que
delataría un intento de llamar a Culqi) y en el log del api no aparece
`[billing] subscription started`.

**CA-9 `[e2e]` El alta Gratis no toca Culqi.**
Dado el mismo api,
cuando se ejecuta CA-1,
entonces responde 201 (si intentara llamar a Culqi fallaría) y la
suscripción no tiene `payment_provider_*`.

**CA-10 `[manual]` Sin camino alternativo de alta con plan.**
Dado el código del api tras el cambio,
cuando se busca dónde se crea una `subscription`
(`subscription.repository.ts` → `create`) y dónde se llama a
`startSubscription`,
entonces el único llamador es `CompleteAccountSetupUseCase`, que sólo se
alcanza desde `POST /account`; no existe otra ruta que cree o cambie el plan
de una cuenta.

### Onboarding de platform: sólo Gratis, sin tarjeta

**CA-11 `[e2e]` El select sólo ofrece Gratis.**
Dado un usuario confirmado, con sesión y sin cuenta,
cuando abre `/onboarding`,
entonces el campo "Plan" tiene exactamente una opción, con valor `FREE` y
texto "Gratis · 1 médico, 1 sede"; no aparecen Consultorio, Clínica ni Red.

**CA-12 `[e2e]` No se pide nada de facturación.**
Dado el mismo usuario en `/onboarding`,
cuando la página termina de cargar,
entonces no existen los campos "Dirección de facturación" ni "Ciudad" y el
botón de envío dice "Continuar" (no "Continuar al pago").

**CA-13 `[e2e]` El alta se completa sin Culqi.**
Dado el mismo usuario en `/onboarding`, con todas las peticiones a
`*culqi.com` bloqueadas por el test,
cuando escribe el nombre de la cuenta y pulsa "Continuar",
entonces el botón no queda deshabilitado esperando a Culqi, no se abre el
checkout de Culqi, no hay peticiones a `api.culqi.com`, la URL pasa a
`/account/<id>/select` y la cuenta creada cumple CA-1.

**CA-14 `[e2e]` La validación del nombre sigue igual.**
Dado el mismo usuario en `/onboarding`,
cuando pulsa "Continuar" sin nombre de cuenta,
entonces ve el mismo error de validación que antes del cambio y no se crea
cuenta.

### Las cuentas existentes no cambian

**CA-15 `[e2e]` Una cuenta de pago existente conserva su plan y sus
capacidades.**
Dada una cuenta sembrada con `subscription` `CONSULTORIO` (y otra `CLINICA`,
y otra `RED`), `status = ACTIVE` y, en una de ellas,
`payment_provider_subscription_id` no nulo,
cuando se despliega este cambio y un usuario de esa cuenta usa el panel,
entonces su fila de `subscription` no cambia (mismos `plan`, `status`,
`extra_doctors`, `extra_clinics` y `payment_provider_*`) y una acción que
Gratis no permite pero su plan sí (por ejemplo, crear un segundo médico)
sigue funcionando.

**CA-16 `[manual]` El diff no toca cuentas ni cobro.**
Dado el diff de esta entrega,
cuando se revisa,
entonces sólo modifica `complete-account-setup.usecase.ts` (el campo `plan`
del schema) y `platform/src/app/(onboarding)/onboarding/page.tsx` (más los
specs e2e); no hay cambios en `schema.prisma` ni migraciones, ni en
`entitlements`, `BillingService`, `CulqiBillingService`, `server.ts`,
`routes/account/index.ts`, `platform/src/lib/plans.ts`,
`create-account.action.ts`, `useCulqiCheckout` ni en `web/`; y no incluye
scripts ni SQL que modifiquen datos.

### Reactivación pequeña

**CA-17 `[manual]` Reactivar el cobro es un cambio de pocas líneas.**
Dado el código tras el cambio,
cuando se lee para planificar la reactivación,
entonces el congelamiento está en exactamente dos sitios —el campo `plan` del
schema del api y la constante `PLANS_OPEN_DURING_BETA` del onboarding—, cada
uno con un comentario de una línea que remite a `docs/PRODUCT.md`; el
`refine` de tarjeta/dirección/ciudad, `startBilling`, `CulqiBillingService`,
su cableado y la rama de pago del onboarding (campos de facturación,
`useCulqiCheckout`, "Continuar al pago") siguen en el código y compilan; y no
hay variable de entorno ni bandera que active el cobro.

**CA-18 `[manual]` Tipos y lint limpios.**
Dado el diff,
cuando se ejecuta `cd api && pnpm typecheck` y
`cd platform && pnpm typecheck && pnpm lint`,
entonces terminan sin errores (esto también prueba que el código de cobro
inalcanzable sigue compilando).

### Revisiones del humano en producción (sin acciones sobre datos)

**CA-19 `[manual]` D4: cuentas Red revisadas antes de desplegar.**
Dado acceso de sólo lectura a producción,
cuando el humano ejecuta la consulta de "Cuentas existentes con plan de pago",
entonces tiene la lista de cuentas `RED` y, para cada una, si tiene acuerdo
comercial; la decisión sobre ellas queda anotada en este documento (D4) y en
esta entrega no se ejecuta ningún `UPDATE` ni `DELETE`.

**CA-20 `[manual]` D5: suscripciones vivas en Culqi revisadas.**
Dadas las filas de esa consulta con `has_culqi_subscription = true`,
cuando el humano las contrasta con el panel de Culqi,
entonces sabe cuáles siguen cobrando cada mes y la decisión caso por caso
queda anotada (D5); en esta entrega no se cancela nada en Culqi ni se cambia
ninguna fila.

**CA-21 `[manual]` Orden de despliegue.**
Dado que el cambio sale en dos releases,
cuando se despliega,
entonces primero sale `api-*` y después `platform-*`, y tras ambos el
onboarding de producción muestra sólo Gratis (CA-11) sin que nadie complete
el alta ni abra el checkout para comprobarlo.

### Preguntas para el humano

- **P1. Médico que llega al límite de Gratis durante la beta.** Con una sola
  cuenta Gratis (1 médico, 1 sede), el api responde 402 al intentar algo fuera
  del plan, pero platform no tiene pantalla de mejora de plan ni el cobro está
  disponible, y no hay canal de contacto hasta la segunda entrega (D2). Hoy
  ese médico ve un error y no tiene a quién pedir la asignación manual.
  ¿Se acepta durante la beta, o el mensaje de 402 debe decir cómo pedir un
  plan mayor? Recomendación: aceptarlo en esta entrega y resolverlo junto con
  D2.
- **P2. Consultorios con varios médicos que quieran entrar en la beta.** El
  foco es el médico independiente, pero un consultorio de 3 médicos hoy sólo
  puede entrar en Gratis y pedir la asignación manual por SQL. ¿Se les deja
  entrar así (asignación a mano a demanda) o la beta se limita a médicos
  independientes? Recomendación: asignación a mano a demanda, sin construir
  nada.
