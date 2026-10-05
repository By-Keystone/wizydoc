# Fix: cualquier miembro crea organizaciones y sedes

Severidad: alta. Estado: pendiente de security-reviewer y de las decisiones
abiertas. Rama `fix/org-clinic-creation-role`.

## Objetivo

Que sólo el dueño de una cuenta sin organizaciones, o un ADMIN vivo de una
organización de la cuenta, cree organizaciones; y que sólo un ADMIN vivo de la
organización padre cree sedes bajo ella.

## Hallazgo (verificado leyendo código, no explotado)

1. `POST /organization` (`api/src/routes/organization/index.ts:51-55`) sólo
   exige `account, confirmed, onboarded`. `OrganizationRepository.save`
   (`organization.repository.ts:24-53`) crea la organización y una membership
   ADMIN para quien llama: cualquier USER/DOCTOR queda ADMIN.
2. `POST /clinic` (`api/src/routes/clinic/index.ts:50-55`): misma política;
   `ClinicRepository.save` sólo comprueba que la organización sea de la cuenta.
   Cualquier miembro crea sedes bajo cualquier organización de la cuenta y
   gasta `includedClinics`; bajo la organización del punto 1 hereda ADMIN
   (`maxRole` en `get-user-membership.query.ts`).
3. Cadena: con esa sede pasa `roles: ["ADMIN"]` en
   `POST /clinic/:resourceId/users/lookup` (enumera usuarios de toda la cuenta)
   y, con `fix-invite-role-check`, `POST /user/invite`. Además cualquier
   membership ADMIN cuenta para `isClinicalStaff`
   (`update-patient-record.usecase.ts`): edita fichas de **toda** la cuenta.
4. La ruta `/clinic` convierte todo salvo `PaymentRequired` en 500 (organización
   ajena: 422 del repositorio → 500; id inexistente: P2025 → 500).

### Primera organización y primera sede hoy

- `POST /account` crea la `Account` con `ownerId = userId`; **no** crea
  organización.
- El dueño llega a `/account/[accountId]/select` sin memberships y pulsa
  **"Crear organización"** (`components/account/select-membership/top-header.tsx`,
  visible para todos) → `createOrganizationAction` → `POST /organization?onboarding=false`.
- **"Crear sede"** (`components/clinic/top-header.tsx`) sólo se pinta en
  `organization/[resourceId]/clinics/page.tsx`, que carga
  `GET /organization/:resourceId/clinics` (`roles: ["ADMIN"]` sobre la
  organización); un no-ADMIN ve `error.tsx`.
- Los helpers e2e `createOrganizationResource`/`createClinicResource` se usan
  siempre con el dueño recién creado.

La regla no le quita nada al dueño ni a la UI actual.

---

## Regla

**`POST /organization`** — permitido si:

- a) quien llama es `Account.ownerId` de la cuenta de la sesión **y** la cuenta
  tiene 0 organizaciones; o
- b) tiene una membership ADMIN con `deletedAt: null` y `accountId` de la
  sesión sobre un recurso `ORGANIZATION` de esa cuenta.

Descartado "no tiene ninguna membership": lo cumple cualquier usuario de la
cuenta aún sin invitar. Una membership ADMIN **de sede** no basta.

**`POST /clinic`** — `organizationId` es una organización de la cuenta de la
sesión **y** quien llama es ADMIN vivo de **esa** organización.

| Caso | Código | Cuerpo |
| --- | --- | --- |
| `/organization` sin a) ni b) | 403 | `Sólo un administrador puede crear organizaciones` |
| `/clinic`, organización inexistente, de otra cuenta o que no es organización | 404 | `Organización no encontrada` |
| `/clinic`, organización propia sin ser su ADMIN | 403 | `Sólo un administrador de la organización puede crear sedes` |
| `/clinic`, `organizationId` no es UUID | 400 | Zod |

Orden en `/clinic`: 404 → 403 → `lockAccountQuota` → cupo (402) → escritura.

Mismo enfoque que `fix-invite-role-check`. **No hay función compartida** en esa
rama: es el método privado `assertInviterIsAdmin` de `InviteUserUseCase`, sin
mergear (decisión 3).

---

## Cambios por capa

### Prisma

Sin cambios ni migración (`@@index([accountId, role])` y
`@@unique([userId, resourceId])` ya existen).

### api

**`application/use-cases/organization/create-organization.use-case.ts`**:
método privado `assertCanCreateOrganization(userId, accountId)` al inicio de
`execute`, antes de `save`:

```ts
const account = await getClient().account.findUnique({
  where: { id: accountId },
  select: { ownerId: true, _count: { select: { organizations: true } } },
});
const isOwnerCreatingFirstOrganization =
  account?.ownerId === userId && account._count.organizations === 0;
if (isOwnerCreatingFirstOrganization) return;

const adminMembership = await getClient().userResourceMembership.findFirst({
  where: { userId, accountId, deletedAt: null, role: "ADMIN", resource: { type: "ORGANIZATION", accountId } },
  select: { id: true },
});
if (!adminMembership) throw new Forbidden("Sólo un administrador puede crear organizaciones");
```

**`application/use-cases/clinic/create-clinic.usecase.ts`**:
`organizationId: z.uuid()` (decisión 4) y, dentro de `inTransaction` y antes de
`lockAccountQuota`:

```ts
const organization = await getClient().organization.findFirst({
  where: { resourceId: dto.organizationId, accountId: dto.accountId },
  select: { resourceId: true },
});
if (!organization) throw new NotFound("Organización no encontrada");

const adminMembership = await getClient().userResourceMembership.findFirst({
  where: { userId: dto.createdBy, accountId: dto.accountId, resourceId: dto.organizationId, role: "ADMIN", deletedAt: null },
  select: { id: true },
});
if (!adminMembership) throw new Forbidden("Sólo un administrador de la organización puede crear sedes");
```

No se reutiliza `GetUserMembership` (ignora `deletedAt` y da rol heredado).
`ClinicRepository.save` no cambia: su comprobación queda como defensa.

**`routes/organization/index.ts`** (sólo `POST /organization`): política igual;
comentario `// Sin recurso en la URL: el rol lo comprueba el caso de uso.`;
quitar `console.log(request.user)`; log de error →
`request.log.error({ errName, errCode }, "[create-organization]")`.
**`organization.repository.ts`**: quitar `console.log({ data })`.

**`routes/clinic/index.ts`** (sólo `POST /clinic`): política igual; comentario
`// organizationId llega en el cuerpo: cuenta y rol los comprueba el caso de uso.`;
`catch`: `ApplicationError` → `reply.status(error.statusCode).send({ message })`;
resto → `request.log.error({ errName, errCode }, "[create-clinic]")` y 500.

Sin cambios en `policy.ts`, `auth.ts` ni `entitlements.ts`.

### platform (decisión 1)

- `app/account/[accountId]/select/page.tsx`: `canCreateOrganization` refleja
  exactamente la regla del api (decisión del humano, opción a): es el dueño y la
  cuenta no tiene organizaciones, o tiene una membership ADMIN viva sobre un
  recurso de tipo organización. Un ADMIN sólo de sede no ve el botón. Si
  platform no tiene hoy el dato de dueño, añade lo mínimo para obtenerlo (p. ej.
  un campo en una respuesta que ya se pide) o detente y repórtalo. Se pasa a
  `TopHeader`.
- `components/account/select-membership/top-header.tsx`: prop
  `canCreateOrganization: boolean`; si es `false` no pinta botón ni modal.
- Sólo visibilidad; protege el api. "Crear sede" no cambia. Sin pantalla nueva:
  sin Fase 2 ni mockup.

### Archivos

| Acción | Ruta |
| --- | --- |
| Modificar | `api/src/application/use-cases/organization/create-organization.use-case.ts` |
| Modificar | `api/src/application/use-cases/clinic/create-clinic.usecase.ts` |
| Modificar | `api/src/infrastructure/postgres/repositories/organization.repository.ts` |
| Modificar | `api/src/routes/organization/index.ts`, `api/src/routes/clinic/index.ts` |
| Modificar | `platform/src/app/account/[accountId]/select/page.tsx` |
| Modificar | `platform/src/components/account/select-membership/top-header.tsx` |
| Crear | `platform/e2e/api/security/fix-org-clinic-creation-role.spec.ts` |
| Crear | `platform/e2e/ui/account/create-organization-button.spec.ts` |
| Modificar | `platform/e2e/README.md` (tabla de flujos) |

---

## Aislamiento entre cuentas

- `accountId` sale de la sesión (fiable desde #37, `input: false`).
- `/organization`: la membership exige `accountId` de sesión **y**
  `resource.accountId` igual; una ADMIN en otra cuenta no cuenta.
- `/clinic`: `organizationId` del cliente sólo se resuelve con
  `organization.accountId = sesión`; si no, 404 sin distinguir inexistente de
  ajena. La membership se busca sobre ese mismo id.

## Modelo de amenaza

| Atacante | Hoy | Tras el arreglo |
| --- | --- | --- |
| USER/DOCTOR crea organización | 201, ADMIN; edita fichas de toda la cuenta | 403, sin escrituras |
| USER/DOCTOR crea sede en organización existente | 201, gasta cupo | 403, sin lock |
| ADMIN de una sede crea sede hermana | 201 | 403 |
| ADMIN de organización A crea sede bajo B (misma cuenta) | 201 | 403 |
| Otra cuenta con `organizationId` ajeno | 500 | 404 |
| Dueño crea su primera organización | 201 | 201 |
| Dueño que ya no es ADMIN de ninguna organización | 201 | 403 (aceptado) |
| Membership ADMIN con `deletedAt` | n/a | no cuenta (nadie lo escribe hoy) |
| Dueño, dos `POST /organization` simultáneos con 0 organizaciones | — | pueden crearse dos, ambas suyas; sin escalada |
| Organizaciones y sedes ya creadas por la escalada | — | no se deshacen; fuera de este ticket |

## Invariantes

1. `POST /organization` no escribe `resource`, `organization` ni membership sin a) o b).
2. `POST /clinic` no escribe ni toma `lockAccountQuota` si quien llama no es
   ADMIN vivo de la organización destino.
3. Organización de otra cuenta → 404; propia sin rol → 403.
4. Los logs de estas rutas sólo llevan `errName`/`errCode`.
5. Ninguna otra ruta cambia de comportamiento.
6. Todo recurso creado tiene el `account_id` de su padre.

## Otras rutas de escritura de estructura (fuera de alcance)

No hay rutas para editar o borrar organizaciones o sedes, cambiar roles ni
quitar miembros.

| Ruta | Política | Situación |
| --- | --- | --- |
| `PUT /:resourceId/specialty/:specialtyId` | `roles: ["ADMIN"]` | **Escritura entre cuentas.** `UpdateSpecialtyUseCase` actualiza por `specialtyId` sin comprobar que sea de `:resourceId`: cualquiera que se registre renombra especialidades de otra cuenta (visibles en el booking). **Alta, ticket propio inmediato.** |
| `POST /:resourceId/specialty` | `roles: ["ADMIN"]` | Con el id de una sede donde es ADMIN → FK → 500. `Specialty.name` es `@unique` global: una cuenta bloquea el nombre a todas y el 422 lo revela. Media. |
| `PUT /clinic/:resourceId/availability` | `roles: ["ADMIN", "DOCTOR"]` | Sólo escribe el `doctorProfile` propio. Correcta. |
| `POST /user/invite` | `account, confirmed, onboarded` | Lo cierra `fix-invite-role-check`. |
| `policy({ roles })` vía `GetUserMembership` | — | Ignora `deletedAt`. Sin impacto hoy. |
| `POST /organization`, `request.params.onboarding` | — | Siempre `undefined` (platform lo manda en la query); rama muerta con `as any`. Baja. |

---

## Decisiones abiertas

1. **¿Ocultar "Crear organización" a quien no es ADMIN?** Hoy lo ve todo el
   mundo y tras el arreglo a USER/DOCTOR le fallaría siempre. **Recomiendo sí**,
   en este PR (dos archivos, sin UI nueva).
2. **Segunda organización: ¿cualquier ADMIN de organización (b) o sólo el
   dueño?** Sólo el dueño bloquea a clínicas cuyo operador no es el dueño.
   **Recomiendo b**, la regla del security-reviewer.
3. **¿Función compartida "es ADMIN vivo de X"?** Serían tres consumidores,
   pero las consultas difieren y `fix-invite-role-check` no está mergeado.
   **Recomiendo consultas en cada caso de uso** y valorar extraerla con ambos en `main`.
4. **`organizationId: z.uuid()`**: id malformado → 400 en vez de un posible
   500 de Prisma. **Recomiendo sí.**

Despliegue independiente de `fix-invite-role-check`; la cadena sólo queda
cerrada con ambos.

---

## Criterios de verificación

```bash
cd api && ./node_modules/.bin/tsc --noEmit
cd platform && ./node_modules/.bin/tsc --noEmit && pnpm lint
grep -n "console\." api/src/application/use-cases/organization/create-organization.use-case.ts \
  api/src/application/use-cases/clinic/create-clinic.usecase.ts \
  api/src/infrastructure/postgres/repositories/organization.repository.ts   # vacío
```

### curl contra el api de e2e

`cd api && DOTENV_CONFIG_PATH=.env.e2e ./node_modules/.bin/tsx src/server.ts`
(base `:5433`, puerto 4100). Sembrar por SQL en `wizydoc_test`, como
`createMemberWithRole` (`confirmed`, `onboarding_completed`, `account_id`):
dueño `owner@…` tras `POST /account`; `recepcion@…` (USER) y `doctora@…`
(DOCTOR) en `$ORG`; `adminsede@…` ADMIN sólo de la sede `$A`; `intruso@…` con
`account_id` de una cuenta sin organizaciones de la que no es dueño; otra
cuenta con organización `$ORG2`.

```bash
API=http://localhost:4100; ORIGIN='Origin: http://localhost:3100'; JSON='Content-Type: application/json'
login()  { curl -s -c "$1.txt" -H "$ORIGIN" -H "$JSON" -X POST $API/api/auth/sign-in/email \
  -d "{\"email\":\"$2\",\"password\":\"Clave-Segura-2026\"}" >/dev/null; }
org()    { curl -s -w " %{http_code}\n" -b "$1.txt" -H "$ORIGIN" -H "$JSON" -X POST $API/organization -d "{\"name\":\"$2\"}"; }
clinic() { curl -s -w " %{http_code}\n" -b "$1.txt" -H "$ORIGIN" -H "$JSON" -X POST $API/clinic \
  -d "{\"name\":\"Sede Surco\",\"phone\":\"+51987654321\",\"address\":\"Av. Primavera 1250\",\"organizationId\":\"$2\"}"; }
```

| ID | Petición | Esperado |
| --- | --- | --- |
| V-1 | `org owner "Consultorio Larco"` (0 organizaciones) | 201 |
| V-2 | `org recepcion …`, `org doctora …` | 403; sin filas nuevas en `resource` |
| V-3 | `org adminsede …` | 403 |
| V-4 | `org owner "Consultorio Benavides"` (ya ADMIN de `$ORG`) | 201 |
| V-5 | `org intruso …` | 403 |
| V-6 | `clinic recepcion $ORG`, `clinic doctora $ORG`, `clinic adminsede $ORG` (cuenta sin sedes, para no confundir con 402) | 403; conteo de `CLINIC` sin cambios |
| V-7 | `clinic owner $ORG2`, `clinic owner $A`, `clinic owner 00000000-0000-7000-8000-000000000000` | 404 `Organización no encontrada` |
| V-8 | `clinic owner no-es-uuid` | 400 |
| V-9 | `clinic owner $ORG` con cupo libre; repetir con Gratis agotado | 201; 402 |
| V-10 | Membership ADMIN del dueño en `$ORG` con `deleted_at = now()` (sólo base e2e): `clinic owner $ORG`, `org owner "X"`; restaurar | 403, 403 |
| V-11 | Log del api tras V-6/V-7 | sólo `errName`/`errCode`; sin correo, nombre ni cuerpo |

### Pruebas e2e

- `e2e/api/security/fix-org-clinic-creation-role.spec.ts`: V-1 a V-10, una
  prueba por criterio con el ID en el título. Helpers de `support/accounts.ts`
  (`createOnboardedAdmin`, `createOrganizationResource`, `createClinicResource`,
  `createClinicResourceViaPrisma`, `createMemberWithRole`); `getTestPrisma`
  para comprobar que los 403/404 no escriben.
- `e2e/ui/account/create-organization-button.spec.ts` (si se aprueba la
  decisión 1): el dueño nuevo ve "Crear organización" en `/select`; un USER
  sembrado no.
- Deben seguir pasando sin cambios: `invite-doctor.spec.ts`,
  `invite-user-form.spec.ts`, `fix-user-by-email-scope.spec.ts`,
  `fix-auth-user-fields-input.spec.ts`.

### Navegador

Dueño nuevo: `/select` → "Crear organización" → entrar → Sedes → "Crear sede"
→ toast "Sede creada". USER invitado: `/select` sin el botón.

## Criterios de aceptación

Decisiones tomadas:

- D1: Se oculta "Crear organización" a quien no es ADMIN, en este PR.
- D2: Cualquier ADMIN vivo de una organización de la cuenta puede crear otra organización; el dueño puede crear la primera cuando la cuenta no tiene ninguna.
- D3: Sin función compartida: cada caso de uso hace su propia consulta.
- D4: `organizationId` se valida con `z.uuid()` en `POST /clinic`.

### Lo que deja de ser posible

- **CA-1** `[e2e]` Dado un USER y un DOCTOR de una organización de la cuenta, cuando cada uno llama a `POST /organization`, entonces recibe 403 `Sólo un administrador puede crear organizaciones` y no aparecen filas nuevas en `resource`, `organization` ni `user_resource_membership`.
- **CA-2** `[e2e]` Dado un usuario que es ADMIN sólo de una sede (no de su organización), cuando llama a `POST /organization`, entonces recibe 403 y no se escribe nada.
- **CA-3** `[e2e]` Dado un usuario de una cuenta sin organizaciones que no es su dueño, cuando llama a `POST /organization`, entonces recibe 403 y no se escribe nada.
- **CA-4** `[e2e]` Dado un usuario ADMIN de una organización en **otra** cuenta y sin rol ADMIN de organización en la suya, cuando llama a `POST /organization`, entonces recibe 403.
- **CA-5** `[e2e]` Dada una cuenta con cupo de sedes libre, cuando un USER, un DOCTOR o un ADMIN sólo de una sede llaman a `POST /clinic` con una organización de su cuenta, entonces reciben 403 `Sólo un administrador de la organización puede crear sedes` (no 402) y el número de sedes no cambia.
- **CA-6** `[e2e]` Dado un ADMIN de la organización A, cuando llama a `POST /clinic` con la organización B de la misma cuenta, entonces recibe 403 y no se crea la sede.
- **CA-7** `[e2e]` Dada una membership ADMIN de organización con `deleted_at` (sembrada en la base e2e), cuando su usuario llama a `POST /clinic` sobre esa organización o a `POST /organization` en una cuenta que ya tiene organizaciones, entonces recibe 403 en ambos.
- **CA-8** `[e2e]` Dado `organizationId` igual a `no-es-uuid`, cuando se llama a `POST /clinic`, entonces la respuesta es 400 y no 500.
- **CA-9** `[e2e]` Dado un USER que llega a `/account/[accountId]/select`, cuando la página carga, entonces no ve el botón "Crear organización" ni puede abrir su modal.
- **CA-20** `[e2e]` Dado un ADMIN sólo de una sede (sin ADMIN de organización), cuando carga `/select`, entonces no ve "Crear organización".
- **CA-21** `[e2e]` Dado un usuario que no es el dueño, en una cuenta sin organizaciones, cuando carga `/select`, entonces no ve "Crear organización"; el dueño en esa misma cuenta sí lo ve.

### Lo que sigue funcionando

- **CA-10** `[e2e]` Dado un dueño recién registrado sin organizaciones, cuando en el navegador pulsa "Crear organización" en `/select`, entra en ella y en Sedes pulsa "Crear sede", entonces ve el toast "Sede creada", la sede aparece en la lista y él queda ADMIN de la organización.
- **CA-11** `[e2e]` Dado un dueño que ya es ADMIN de su organización, cuando llama a `POST /organization`, entonces recibe 201 y queda ADMIN de la nueva.
- **CA-12** `[e2e]` Dado un ADMIN de organización que no es el dueño de la cuenta, cuando llama a `POST /organization`, entonces recibe 201 y queda ADMIN de la nueva.
- **CA-13** `[e2e]` Dado un ADMIN de una organización con cupo de sedes libre, cuando llama a `POST /clinic` con esa organización, entonces recibe 201 y la sede queda con el `account_id` de la organización.
- **CA-14** `[e2e]` Dado un ADMIN de organización con el cupo de sedes del plan agotado, cuando llama a `POST /clinic`, entonces recibe 402 con la mejora de plan, igual que hoy.
- **CA-15** `[e2e]` Dados los 403 de CA-5 y CA-6, cuando a continuación el ADMIN legítimo crea una sede con el último cupo libre, entonces recibe 201: los intentos rechazados no consumieron cupo.
- **CA-16** `[e2e]` Cuando se ejecutan `invite-doctor.spec.ts`, `invite-user-form.spec.ts`, `fix-user-by-email-scope.spec.ts` y `fix-auth-user-fields-input.spec.ts` sin cambios, entonces pasan.

### Lo que no debe filtrarse

- **CA-17** `[e2e]` Dado un `organizationId` de otra cuenta, el id de una sede propia o un UUID inexistente, cuando el dueño o un USER de la cuenta llaman a `POST /clinic`, entonces los tres casos responden 404 con el mismo cuerpo `Organización no encontrada` (nunca 403 ni 500) y no se escribe nada.
- **CA-18** `[e2e]` Dada cualquier respuesta 403 o 404 de `POST /organization` o `POST /clinic`, entonces el cuerpo sólo contiene `message`, sin ids, nombres, correos ni datos de la organización.
- **CA-19** `[manual]` Dados los rechazos de CA-1, CA-5 y CA-17 y un error forzado, cuando se revisa la salida del api local, entonces las líneas `[create-organization]` y `[create-clinic]` sólo llevan `errName`/`errCode`, sin correo, nombre, cuerpo de la petición ni sesión.
