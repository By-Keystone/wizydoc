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
| Invitación de un médico | `ui/invitations/invite-doctor.spec.ts` | El ADMIN invita a una médica; ella ve directamente el formulario de contraseña (sin paso previo de "Aceptar invitación"), entra con sesión a `/select`, el link ya usado muestra "Invitación inválida" y puede volver a entrar por `/login` tras cerrar sesión |
| Invitación a alguien que ya tiene contraseña | `ui/invitations/accept-invitation-existing-password.spec.ts` | Un médico con contraseña, invitado a otra sede, ve el botón "Aceptar invitación" (no el formulario); al aceptar llega a `/login` y entra con su contraseña de siempre |
| Link de invitación inválido | `ui/invitations/invitation-invalid-link.spec.ts` | Una invitación `EXPIRED` con fecha aún futura, o con la membership borrada, muestra "Invitación inválida" sin llegar al formulario de contraseña |
| Formulario de invitar | `ui/clinic/invite-user-form.spec.ts` | Precarga los datos de alguien que ya está en el consultorio y los cambia con "Cambiar"; "Usuario nuevo" con un correo de otra cuenta (error al enviar) y con uno nuevo ("Invitación enviada"); el correo nunca aparece en una URL |
| Nombre de especialidad repetido | `ui/specialties/specialty-name-conflict.spec.ts` | Crear, desde el panel, un nombre que ya existe en la organización muestra el toast "Ya existe esa especialidad", no un error genérico |
| Booking público en el celular | `ui/booking/public-booking-specialty-scope.spec.ts` | Con viewport móvil: el paciente ve sólo las especialidades y médicos de la sede (no los de otra organización) y completa una reserva de punta a punta |
| Booking público (caso feliz) | `ui/clinic/public-booking.spec.ts` | Especialidad → doctor → fecha/hora → datos del paciente → "¡Cita reservada!", con un médico invitado y disponibilidad sembrada por Prisma; confirma que quitar `userId` del listado de médicos no rompe la reserva |
| Botón "Crear organización" en `/select` | `ui/account/create-organization-button.spec.ts` | Un USER de una organización y un ADMIN sólo de una sede no ven el botón; en una cuenta sin organizaciones sólo el dueño lo ve; el dueño nuevo crea su organización y una sede desde ahí y queda ADMIN |

### Sólo API (`e2e/api/`)

| Grupo | Archivo | Qué comprueba |
| --- | --- | --- |
| Sesión | `api/smoke.spec.ts` | Un usuario confirmado lee su sesión en `GET /user/me` |
| Campos de usuario no editables | `api/security/fix-auth-user-fields-input.spec.ts` | El registro con `accountId`, `role` u `onboardingCompleted` se rechaza, también vía platform; `update-user` responde 404 en todas sus variantes; el atacante no ve las sedes de otra cuenta; no se puede saber si un correo existe |
| Búsqueda de usuarios por correo | `api/security/fix-user-by-email-scope.spec.ts` | La ruta vieja `GET /user/by-email` no devuelve datos; `POST /clinic/:resourceId/users/lookup` sólo para ADMIN (DOCTOR/USER 403, otra cuenta 404, sin sesión 401), acotada a la cuenta de la sede, misma respuesta para correo inexistente y de otra cuenta, y sólo `name`/`lastName`/`phone` |
| Envío del correo de invitación | `api/security/fix-invite-email-send.spec.ts` | `POST /user/invite` con un correo inválido responde 400 sin crear usuario, membership, perfil de doctor ni invitación, y el api sigue vivo después; un correo con mayúsculas se guarda y se envía en minúsculas; las mayúsculas del correo de un usuario de otra cuenta se rechazan igual que en minúsculas y sin duplicarlo (422) |
| Especialidades acotadas por organización | `api/security/fix-specialty-account-scope.spec.ts` | Editar o conectar una especialidad de otra organización responde 404 igual que un id inexistente (también a través de una sede o de otra organización de la misma cuenta); DOCTOR/USER no pueden crear ni editar (403); invitar a un médico con un `specialtyId` ajeno (o mezclado con uno propio) no crea nada; el nombre es único por organización, no global (crear o renombrar a uno repetido en la misma organización da 422 "Ya existe esa especialidad", nunca 500; dos organizaciones pueden repetir nombre); sigue funcionando crear, listar, renombrar (se ve en el booking público) y invitar con especialidades repetidas o a un USER; un médico cuyas únicas especialidades sean ajenas a la organización de su sede desaparece del booking público en vez de filtrar el nombre |
| Token de invitación (toma de cuenta) | `api/invitations/fix-invitation-set-password.spec.ts` | `set-password` exige el token (un `userId` en el cuerpo no basta ni roba la credencial de otro); token inexistente, caducado, `EXPIRED`, de membership borrada o ya usado responden el mismo 400 genérico, también en `accept`; `accept` sin contraseña no consume el token; contraseña fuera de rango (8–128) rechazada; carreras con el mismo token y con dos invitaciones del mismo usuario dejan una sola credencial; `GET /clinic/:clinicId/doctors` no expone `userId`; las respuestas exitosas no incluyen `userId` ni `email`; la sesión creada guarda `ipAddress`/`userAgent` |
| Rol al crear organizaciones y sedes | `api/security/fix-org-clinic-creation-role.spec.ts` | `POST /organization` sólo para el dueño sin organizaciones o un ADMIN vivo de una ya existente (USER/DOCTOR/ADMIN-de-sede/intruso/ADMIN-de-otra-cuenta y membership borrada, todos 403, sin escritura); `POST /clinic` sólo para un ADMIN vivo de la organización del cuerpo (403 sin tocar el cupo, 404 con el mismo cuerpo para organización ajena/sede propia/UUID inexistente, 400 si no es UUID); los 403 no consumen cupo y los 403/404 sólo traen `message` |

Las pruebas de seguridad llevan el ID del criterio de aceptación en el título
(`CA-3: …`); los criterios están al final de cada `docs/features/<slug>/plan.md`.

### Aún sin pruebas

- Booking público: `ui/clinic/public-booking.spec.ts` y `ui/booking/public-booking-specialty-scope.spec.ts` cubren el camino feliz; faltan el horario ya tomado (409) y comprobar que `doctorProfileId`/`specialty` pertenezcan a la sede.
- Ficha del paciente según el rol.
- Editor de disponibilidad del médico.
- Login por separado (hoy sólo se ejercita dentro de registro e invitación).
- `fix-invitation-set-password/plan.md` CA-7 (fallo interno de `signInEmail` al iniciar sesión tras guardar la contraseña), CA-22 (caída de la base de datos) y CA-23 (redacción del token en los logs del api): el propio plan los marca como no reproducibles en local o dependientes de leer la salida del proceso, no de una respuesta HTTP.

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
  - `invitations.ts`: invitar y leer su token real desde la base
    (`invitePendingUser`, nunca del cuerpo de la respuesta, que no lo expone),
    simular estados (`markInvitationExpiredStatus`, `backdateInvitationExpiry`,
    `softDeleteMembership`, `markInvitationAcceptedWithoutCredential`) y leer
    credenciales/sesión (`countCredentialAccounts`, `getInvitationByToken`,
    `getLatestSessionTrace`).
  - `availability.ts`: disponibilidad de 00:00 a 23:30 los 7 días
    (`seedFullDayAvailability`), para que el booking público tenga huecos
    libres sin depender de la hora en que corre la prueba.
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
