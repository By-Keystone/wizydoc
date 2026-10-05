# Limpieza posterior a la adopción de Biome

Estado: **aprobado** el 5 de octubre de 2026; decisión: se borra `onboarding`. Sin UI. Continúa `docs/features/biome-linter/plan.md`
(Biome 2.4.13 ya adoptado y código reformateado en el PR #49).

## Objetivo

Corregir los avisos de Biome cuya corrección no cambia el comportamiento,
quitar los overrides de `biome.json` que existían sólo por un caso y eliminar
el parámetro `onboarding` de `POST /organization`, que nunca se lee bien. Al
terminar sólo quedan en aviso las reglas cuya corrección cambia el
comportamiento.

## Punto de partida (ejecutado `biome lint` el 5 de octubre de 2026)

| Proyecto | Regla | Avisos |
| --- | --- | --- |
| api | `complexity/noUselessConstructor` (info) | 14 |
| api | `style/noNonNullAssertion` | 20 |
| api | `complexity/noBannedTypes`, `correctness/noUnusedFunctionParameters`, `correctness/noUnusedImports`, `suspicious/useIterableCallbackReturn` | 1 cada una |
| platform | `style/noNonNullAssertion` | 11 |
| platform | `suspicious/noDocumentCookie` | 6 |
| platform | `correctness/noUnusedImports` | 5 |
| platform | `correctness/noUnusedVariables` | 4 |
| platform | `complexity/useLiteralKeys` (info) | 4 |
| platform | `complexity/useOptionalChain` | 2 |
| platform | `correctness/noEmptyPattern`, `suspicious/noConfusingVoidType`, `suspicious/noAssignInExpressions` | 1 cada una |
| platform | a11y, `useExhaustiveDependencies`, `noArrayIndexKey` | fuera de alcance |
| web | a11y | fuera de alcance |

## Cambios

### 1. Hallazgos del reviewer

**a. `api/src/routes/user-invitation/index.ts`** — borrar
`type UserInvitationRoutesOptions = {}` y el parámetro `opts` de
`userInvitationRoutes` (también lo marca `noUnusedFunctionParameters`, línea
42). La firma queda `userInvitationRoutes(fastify: FastifyInstance)`; el
`register` de `server.ts` no cambia.

**b. `api/src/server.ts:121`** — cuerpo con llaves para que el callback no
devuelva nada:

```ts
response.headers.forEach((value, key) => {
  reply.header(key, value);
});
```

Quitar el bloque `suspicious` de `api/biome.json`.

**c. `platform/biome.json`**

- `platform/e2e/support/test.ts`: `async ({}, use)` y
  `{ closeTrackedApiContexts: void }` son el patrón documentado de Playwright
  para fixtures automáticos sin dependencias; cambiar a `undefined` obligaría
  a `use(undefined)`. Suprimir ambas en su línea:
  - línea 12: `// biome-ignore lint/suspicious/noConfusingVoidType: fixture automático de Playwright sin valor`
  - línea 14: `// biome-ignore lint/correctness/noEmptyPattern: Playwright exige desestructurar el primer argumento del fixture`
- `platform/src/components/clinic/availability/availability-editor.tsx:26`:
  sacar la asignación de la expresión, mismo resultado:

  ```ts
  const slots = acc[b.dayOfWeek] ?? [];
  slots.push({ startTime: b.startTime, endTime: b.endTime });
  acc[b.dayOfWeek] = slots;
  ```

- Quitar `"noEmptyPattern": "warn"` y `"noAssignInExpressions": "warn"` del
  `biome.json`; los demás overrides se quedan (otro ticket).

### 2. `onboarding` en `POST /organization`

**Qué hace hoy.** `CreateOrganizationUseCase.execute(data, isOnboarding)`
marca `onboardingCompleted: true` al usuario si `isOnboarding` es `true`. La
ruta lo lee de `request.params.onboarding`, pero `/organization` no tiene
parámetros de ruta: siempre es `undefined`, y el caso de uso usa `false`.

**Quién lo llama.** Sólo `create-organization.action.ts` (modal "Crear
organización" en la selección de recurso), con `?onboarding=false`. También
`platform/e2e/support/accounts.ts` y `fix-org-clinic-creation-role.spec.ts`,
sin query. El onboarding real marca `onboardingCompleted` en
`assignAccountIfNone` del repositorio de usuarios, no aquí.

**Qué cambiaría al leerlo bien.** Nada: el único llamador manda `false`, y
aunque alguien mandara `true`, la ruta exige `policy({ onboarded: true })`,
así que el usuario ya tiene `onboardingCompleted: true`. El parámetro es
código muerto.

**Arreglo (recomendado): borrarlo**, en lugar de añadir un schema de
`querystring` con `z.stringbool()` para un valor que no puede tener efecto:

- `api/src/application/use-cases/organization/create-organization.use-case.ts`:
  quitar el parámetro `isOnboarding`, el `userRepository` del constructor y
  el bloque que llama a `userRepository.update`.
- `api/src/routes/organization/index.ts`: quitar
  `const params = request.params as Record<string, unknown>`, el segundo
  argumento de `execute`, `userRepository` de `OrganizationRoutesOptions` y
  del `new CreateOrganizationUseCase(...)`.
- `api/src/server.ts`: quitar `userRepository` del `register` de
  `organizationRoutes`.
- `IUserRepository.update` y su implementación en
  `api/src/infrastructure/postgres/repositories/user.repository.ts` se quedan
  sin consumidores: borrarlos.
- `platform/src/lib/actions/organization/create-organization.action.ts`:
  `doFetchJson("/organization", ...)`.

Comportamiento observable: ninguno (misma respuesta 201, mismos permisos, el
usuario no cambia). Ver pregunta 1.

### 3. Avisos sin cambio de comportamiento

Se corrigen:

| Proyecto | Regla | Cómo |
| --- | --- | --- |
| api | `noUselessConstructor` (14) | automático: los `constructor() {}` vacíos |
| api | `noUnusedImports` (1) | automático: `UserRole` en `domain/entities/user/entity.ts` |
| platform | `noUnusedImports` (5) | automático: `z` en `dashboard/actions.ts`; `useApp` y `useParams` en `dashboard/page.tsx`; el sobrante en `common/sidebar.tsx`; `useContext`/`useMemo` sobrantes en `context/app/app.context.tsx` |
| platform | `useLiteralKeys` (4) | automático: claves `["production"]` etc. de `src/config.ts` y `headers()["location"]` en `fix-account-setup-once.spec.ts` |
| platform | `useOptionalChain` (2) | automático: `login/page.tsx:13` y `invite-user/form.tsx:59`; dan el mismo valor de verdad también con cadena vacía |
| platform | `noUnusedVariables` (4) | a mano (el arreglo automático pone `_` delante, no borra): |

`noUnusedVariables`, uno a uno:

- `src/components/app/dashboard/doctors/top-nav.tsx`: nadie importa el
  archivo (el `TopNav` en uso es el de `components/common`). Borrar el
  archivo.
- `src/components/ui/phone-input.tsx:50`: borrar `selectedCountry`.
- `src/hooks/useFormAction.ts:8`: quitar el genérico de `Options` (no lo usa
  ningún campo) y usar `Options` sin argumento en la firma; sólo tipos.
- `src/lib/api/memberships/types.ts:26`: borrar `const tags` (privada, sin
  uso; la buena está en `memberships/index.ts`).

Comandos (dentro de cada proyecto, revisando `git diff` después):

```bash
# api
biome lint --write --unsafe --only=complexity/noUselessConstructor --only=correctness/noUnusedImports
# platform
biome lint --write --unsafe --only=correctness/noUnusedImports --only=complexity/useLiteralKeys --only=complexity/useOptionalChain
# ambos, al final, para el formato de lo tocado a mano
biome format --write
```

Se quedan en aviso (su corrección cambia el comportamiento):

- **`style/noNonNullAssertion`** (20 api, 11 platform). Quitar el `!` exige
  una comprobación en tiempo de ejecución: variables de entorno
  (`DATABASE_URL`, `AWS_REGION`, Culqi), `request.user.accountId` tras
  `policy({ account: true })` (el tipo no se estrecha y `policy.ts` no se
  toca), relaciones de Prisma que dependen del `type` del recurso, refs de
  React y resultados de correo en e2e. Lanzar en lugar de propagar
  `undefined` es otro comportamiento. Otro ticket.
- **`suspicious/noDocumentCookie`** (6, `common/sidebar.tsx` y
  `common/top-nav.tsx`). La alternativa es Cookie Store API: asíncrona y sin
  soporte en todos los navegadores. Otro ticket.

Fuera de alcance (otro ticket): `useButtonType`, `useExhaustiveDependencies`,
`noStaticElementInteractions`, `useKeyWithClickEvents`, `noSvgWithoutTitle`,
`noLabelWithoutControl`, `noArrayIndexKey`.

## Archivos

- api: `biome.json`, `src/server.ts`, `src/routes/user-invitation/index.ts`,
  `src/routes/organization/index.ts`,
  `src/application/use-cases/organization/create-organization.use-case.ts`,
  `src/domain/repositories/user.repository.ts`,
  `src/infrastructure/postgres/repositories/user.repository.ts`,
  `src/domain/entities/user/entity.ts`, y los 14 archivos con constructor
  vacío (use cases de availability, patient, specialty, user-invitation y
  queries de doctor-profile, membership, organization).
- platform: `biome.json`, `e2e/support/test.ts`,
  `e2e/api/security/fix-account-setup-once.spec.ts`, `src/config.ts`,
  `src/app/(auth)/login/page.tsx`,
  `src/app/account/[accountId]/organization/[resourceId]/dashboard/{actions.ts,page.tsx}`,
  `src/components/app/dashboard/doctors/top-nav.tsx` (borrar),
  `src/components/clinic/availability/availability-editor.tsx`,
  `src/components/clinic/invite-user/form.tsx`,
  `src/components/common/sidebar.tsx`, `src/components/ui/phone-input.tsx`,
  `src/context/app/app.context.tsx`, `src/hooks/useFormAction.ts`,
  `src/lib/api/memberships/types.ts`,
  `src/lib/actions/organization/create-organization.action.ts`.
- web: nada.

Sin Prisma ni migraciones. Sin rutas nuevas ni cambios de `policy`.

## Aislamiento entre cuentas

No hay datos nuevos. `POST /organization` mantiene su `policy` y la
comprobación de rol del caso de uso; sólo pierde una escritura que no podía
ejecutarse.

## Verificación

- `pnpm typecheck` y `pnpm check` sin errores en api, platform y web.
- `biome lint` en api y platform: sólo quedan avisos de
  `noNonNullAssertion`, `noDocumentCookie` y las reglas fuera de alcance; web
  sólo a11y.
- `api/biome.json` sin bloque `suspicious`; `platform/biome.json` sin
  `noEmptyPattern` ni `noAssignInExpressions`.
- e2e: no hace falta, ningún cambio altera el comportamiento. Si se elige la
  alternativa de la pregunta 1, tampoco (el valor sigue sin efecto por la
  `policy`).

## Preguntas abiertas

1. **`onboarding` en `POST /organization`: ¿borrarlo o leerlo bien?** Leerlo
   con un `querystring` de `z.stringbool()` no cambia nada, porque la ruta ya
   exige un usuario con onboarding completo. Recomiendo **borrarlo** (parámetro,
   query en la action, `userRepository` de la ruta y `IUserRepository.update`).
