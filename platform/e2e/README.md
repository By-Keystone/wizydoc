# Pruebas e2e de WizyDoc

Playwright levanta el api y platform con su propia configuración, su propia
base de datos y un correo falso, y recorre la app como lo haría un usuario. Ni
la base de desarrollo ni SES se tocan nunca.

Plan y decisiones: `docs/features/e2e-infra/plan.md`.

## Cómo correrlas

Requisitos (una sola vez):

1. Node 22 (`nvm use 22`).
2. `api/.env.e2e` y `platform/.env.e2e`. Están en `.gitignore` y no los crea
   ningún agente: los nombres de las variables y sus valores de prueba están en
   el plan. `api/.env.e2e` debe tener `NODE_ENV=test`, `EMAIL_DRIVER=memory` y
   una `DATABASE_URL` a `localhost:5433/wizydoc_test`; sin eso las pruebas no
   arrancan.
3. El navegador de Playwright: `./node_modules/.bin/playwright install chromium`.

Cada vez:

```bash
cd api && docker compose -f docker-compose.e2e.yml up -d   # base de pruebas en :5433
cd ../platform && pnpm test:e2e                          # toda la suite
```

| Script | Qué corre |
| --- | --- |
| `pnpm test:e2e` | Todo |
| `pnpm test:e2e:api` | Sólo las pruebas de API (sin navegador) |
| `pnpm test:e2e:ui` | Sólo las de navegador (Chromium) |
| `pnpm test:e2e:report` | Abre el informe HTML de la última corrida |

Playwright arranca el api en `:4100` y platform en `:3100` (nunca reutiliza el
`pnpm dev` de `:4000`/`:3000`, que puede seguir abierto). Antes de empezar, el
`global-setup` comprueba que la base responde, aplica las migraciones con
`prisma migrate deploy` y vacía el archivo de correos capturados.

## Flujos que se prueban

### En el navegador (`e2e/ui/`)

| Flujo | Archivo | Qué comprueba |
| --- | --- | --- |
| Registro | `ui/auth/register.spec.ts` | Un usuario nuevo se registra, confirma su correo con el link capturado y llega al onboarding |
| Registro completo | `ui/auth/onboarding.spec.ts` | Registro → confirmación → login → onboarding Gratis; el médico queda en su cuenta nueva |
| Invitación de un médico | `ui/invitations/invite-doctor.spec.ts` | El ADMIN invita a una médica; ella fija su contraseña desde el link del correo y las dos entran a su propio consultorio |
| Formulario de invitar | `ui/clinic/invite-user-form.spec.ts` | Precarga los datos de alguien que ya está en el consultorio y los cambia con "Cambiar"; "Usuario nuevo" con un correo de otra cuenta (error al enviar) y con uno nuevo ("Invitación enviada"); el correo nunca aparece en una URL |

### Sólo API (`e2e/api/`)

| Grupo | Archivo | Qué comprueba |
| --- | --- | --- |
| Sesión | `api/smoke.spec.ts` | Un usuario confirmado lee su sesión en `GET /user/me` |
| Campos de usuario no editables | `api/security/fix-auth-user-fields-input.spec.ts` | El registro con `accountId`, `role` u `onboardingCompleted` se rechaza, también vía platform; `update-user` responde 404 en todas sus variantes; el atacante no ve las sedes de otra cuenta; no se puede saber si un correo existe |
| Búsqueda de usuarios por correo | `api/security/fix-user-by-email-scope.spec.ts` | La ruta vieja `GET /user/by-email` no devuelve datos; `POST /clinic/:resourceId/users/lookup` sólo para ADMIN (DOCTOR/USER 403, otra cuenta 404, sin sesión 401), acotada a la cuenta de la sede, misma respuesta para correo inexistente y de otra cuenta, y sólo `name`/`lastName`/`phone` |
| Envío del correo de invitación | `api/security/fix-invite-email-send.spec.ts` | `POST /user/invite` con un correo inválido responde 400 sin crear usuario, membership, perfil de doctor ni invitación, y el api sigue vivo después; un correo con mayúsculas se guarda y se envía en minúsculas; las mayúsculas del correo de un usuario de otra cuenta se rechazan igual que en minúsculas y sin duplicarlo (422) |

Las pruebas de seguridad llevan el ID del criterio de aceptación en el título
(`CA-3: …`); los criterios están al final de cada `docs/features/<slug>/plan.md`.

### Aún sin pruebas

- Booking público del paciente (incluido el horario ya tomado, 409).
- Ficha del paciente según el rol.
- Editor de disponibilidad del médico.
- Login por separado (hoy sólo se ejercita dentro de registro e invitación).

## Escribir una prueba nueva

- Cada prueba crea sus propios datos con nombres y correos únicos
  (`uniqueEmail`, `uniqueName`) y no depende del orden ni de otras pruebas: la
  base no se vacía entre corridas.
- Helpers en `support/`:
  - `users.ts`: usuarios confirmados con sesión (`createConfirmedUser`).
  - `accounts.ts`: cuentas con onboarding, organizaciones, sedes y miembros con
    rol (`createOnboardedAdmin`, `createClinicResource`, `createMemberWithRole`,
    `inviteUserViaApi`).
  - `email.ts`: leer el último correo enviado a una dirección y extraer su link.
  - `ui.ts`: pasos de navegador (registro, confirmación, login, onboarding).
  - `db.ts`: Prisma contra la base de pruebas (`getTestPrisma`), para sembrar lo
    que no es objeto de la prueba.
  - `test.ts`: `test`/`expect` con un fixture `auto` que cierra, al terminar
    cada prueba, todo `APIRequestContext` creado con `createApiContext`
    (incluye los de `createOnboardedAdmin`, `createMemberWithRole` y
    `seedLookupFixture`). Cualquier spec que use esas funciones debe importar
    `test`/`expect` desde aquí, no desde `@playwright/test`.
- Un `APIRequestContext` por actor: el registro inicia sesión solo y deja su
  cookie en el contexto.
- Selectores accesibles en español (`getByRole`, `getByLabel`, `getByText`).
- Las páginas de `/account/<id>/organization|clinic/...` exigen las cookies
  `resource_id` y `resource_type` que pone "Entrar" en `/select`. Si entrar a
  la sede no es lo que se prueba, fíjalas con `context.addCookies`.
- El correo de cada envío queda en `e2e/.artifacts/emails.jsonl`; los enlaces
  vienen escapados en HTML y `email.ts` ya los decodifica.

## Particularidades conocidas

- Cualquier ruta inexistente del api responde `401 Route has no policy
  declared`, no 404, por el hook global de `policy`.
- En un worktree con `api/node_modules` enlazado al checkout principal no uses
  `pnpm` dentro de `api/` (pnpm 11 intenta reinstalar); la suite ya llama a
  `./node_modules/.bin/...` directamente.
- `pnpm test:e2e -- <archivo>` no filtra: esta versión de pnpm reenvía el `--`
  literal a Playwright y corre toda la suite. Para un subconjunto, llama al
  binario directo: `./node_modules/.bin/playwright test <archivo>`.
