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
| Link de invitación inválido o vencido | `ui/invitations/invitation-invalid-link.spec.ts` | Una invitación `EXPIRED` con fecha aún futura muestra "Este link expiró..."; con la membership borrada, "Invitación inválida"; ninguna llega al formulario de contraseña; tras reinvitar a quien venció, el link viejo es inválido y el nuevo muestra el formulario |
| Onboarding sólo Gratis | `ui/auth/onboarding-free-plan.spec.ts` | Durante el congelamiento de Culqi: el select "Plan" sólo ofrece Gratis, no hay campos de facturación, el alta se completa con `*culqi.com` bloqueado (sin peticiones) y la validación del nombre sigue igual sin cuenta nueva |
| Formulario de invitar | `ui/clinic/invite-user-form.spec.ts` | Precarga los datos de alguien que ya está en el consultorio y los cambia con "Cambiar"; "Usuario nuevo" con un correo de otra cuenta (error al enviar) y con uno nuevo ("Invitación enviada"); el correo nunca aparece en una URL |
| Nombre de especialidad repetido | `ui/specialties/specialty-name-conflict.spec.ts` | Crear, desde el panel, un nombre que ya existe en la organización muestra el toast "Ya existe esa especialidad", no un error genérico |
| Invitar a la organización | `ui/organization/invite-organization-user.spec.ts` | El ADMIN llega a "Usuarios" desde el menú de la organización y, estando solo, ve su fila con "Tú" y la pista hacia Sedes; un USER que abre la URL ve el estado de error; el modal valida el correo, precarga a un usuario existente y ofrece sólo "Usuario" y "Administrador" (sin especialidades); el aviso de acceso cambia con el rol; errores de campo y del api dejan el modal abierto con lo escrito; al enviar se ve "Invitación enviada" y la fila con "Invitación pendiente", que desaparece al aceptar; una invitación vencida se marca "Invitación expirada" (y la vigente sigue "pendiente"); la tabla de la sede muestra el rol en español |
| Booking público en el celular | `ui/booking/public-booking-specialty-scope.spec.ts` | Con viewport móvil: el paciente ve sólo las especialidades y médicos de la sede (no los de otra organización) y completa una reserva de punta a punta |
| Booking público (caso feliz) | `ui/clinic/public-booking.spec.ts` | Especialidad → doctor → fecha/hora → datos del paciente → "¡Cita reservada!", con un médico invitado y disponibilidad sembrada por Prisma; confirma que quitar `userId` del listado de médicos no rompe la reserva |
| Botón "Crear organización" en `/select` | `ui/account/create-organization-button.spec.ts` | Un USER de una organización y un ADMIN sólo de una sede no ven el botón; en una cuenta sin organizaciones sólo el dueño lo ve; el dueño nuevo crea su organización y una sede desde ahí y queda ADMIN |

### Sólo API (`e2e/api/`)

| Grupo | Archivo | Qué comprueba |
| --- | --- | --- |
| Sesión | `api/smoke.spec.ts` | Un usuario confirmado lee su sesión en `GET /user/me` |
| Campos de usuario no editables | `api/security/fix-auth-user-fields-input.spec.ts` | El registro con `accountId`, `role` u `onboardingCompleted` se rechaza, también vía platform; `update-user` responde 404 en todas sus variantes; el atacante no ve las sedes de otra cuenta; no se puede saber si un correo existe |
| Búsqueda de usuarios por correo | `api/security/fix-user-by-email-scope.spec.ts` | La ruta vieja `GET /user/by-email` no devuelve datos; `POST /clinic/:resourceId/users/lookup` sólo para ADMIN (DOCTOR/USER 403, otra cuenta 404, sin sesión 401), acotada a la cuenta de la sede, misma respuesta para correo inexistente y de otra cuenta, y sólo `name`/`lastName`/`phone` |
| Envío del correo de invitación | `api/security/fix-invite-email-send.spec.ts` | `POST /clinic/:resourceId/invitations` con un correo inválido responde 400 sin crear usuario, membership, perfil de doctor ni invitación, y el api sigue vivo después; un correo con mayúsculas se guarda y se envía en minúsculas; las mayúsculas del correo de un usuario de otra cuenta se rechazan igual que en minúsculas y sin duplicarlo (422) |
| Especialidades acotadas por organización | `api/security/fix-specialty-account-scope.spec.ts` | Editar o conectar una especialidad de otra organización responde 404 igual que un id inexistente (también a través de una sede o de otra organización de la misma cuenta); DOCTOR/USER no pueden crear ni editar (403); invitar a un médico con un `specialtyId` ajeno (o mezclado con uno propio) no crea nada; el nombre es único por organización, no global (crear o renombrar a uno repetido en la misma organización da 422 "Ya existe esa especialidad", nunca 500; dos organizaciones pueden repetir nombre); sigue funcionando crear, listar, renombrar (se ve en el booking público) y invitar con especialidades repetidas o a un USER; un médico cuyas únicas especialidades sean ajenas a la organización de su sede desaparece del booking público en vez de filtrar el nombre |
| Contacto del paciente en el booking | `api/security/fix-booking-patient-contact.spec.ts` | La segunda reserva con el mismo documento y otro correo, teléfono, nombre o fecha de nacimiento responde 200 con el mismo cuerpo, deja la ficha intacta y manda la confirmación sólo al correo original; un correo inválido, un `scheduledAt` imposible y un `durationMinutes` de 1.5, 0 o 31 responden 400 sin crear ficha ni cita; un horario ocupado responde 409 sin dejar una ficha nueva |
| Token de invitación (toma de cuenta) | `api/invitations/fix-invitation-set-password.spec.ts` | `set-password` exige el token (un `userId` en el cuerpo no basta ni roba la credencial de otro); token inexistente, caducado, `EXPIRED`, de membership borrada o ya usado responden el mismo 400 genérico, también en `accept`; `accept` sin contraseña no consume el token; contraseña fuera de rango (8–128) rechazada; carreras con el mismo token y con dos invitaciones del mismo usuario dejan una sola credencial; `GET /clinic/:clinicId/doctors` no expone `userId`; las respuestas exitosas no incluyen `userId` ni `email`; la sesión creada guarda `ipAddress`/`userAgent` |
| Vencimiento y reinvitación | `api/invitations/invitation-expiry.spec.ts` | La invitación nueva (sede u organización) vence en ~24 h; `GET /invitations/:token` responde 410 con el mensaje de expirado sólo para un token vencido sin aceptar (fecha o `EXPIRED`) y sin datos de la invitación, mientras inexistente y membership borrada siguen con su respuesta genérica; reinvitar a alguien pendiente o vencido renueva el token, el plazo y manda un solo correo, sin otra membership ni perfil de doctor (en Gratis, sin plaza extra); el token viejo deja de servir; reinvitar a quien ya aceptó o a una membership borrada responde 409 |
| Rol al crear organizaciones y sedes | `api/security/fix-org-clinic-creation-role.spec.ts` | `POST /organization` sólo para el dueño sin organizaciones o un ADMIN vivo de una ya existente (USER/DOCTOR/ADMIN-de-sede/intruso/ADMIN-de-otra-cuenta y membership borrada, todos 403, sin escritura); `POST /organization/:resourceId/clinics` sólo para un ADMIN vivo de esa organización (403 sin tocar el cupo para USER/DOCTOR, 404 para no miembros, organización ajena o UUID inexistente, 404 en español para el id de una sede, 400 si no es UUID); los rechazos no consumen cupo y los de la política no traen ids, nombres ni correos |
| Invitar a la organización | `api/organization/org-invitations.spec.ts` | `POST /organization/:resourceId/invitations` (ADMIN directo de la organización) crea la membership directa y la invitación pendiente y manda el correo con el nombre de la organización; quien acepta hereda las sedes (ADMIN entra a la organización y a sus sedes, USER las ve heredadas y recibe 403 en la lista); usuario existente conserva sus memberships; DOCTOR da 400; `specialtyIds` con USER se ignora; ADMIN de sede, USER, DOCTOR, otra cuenta, membership borrada y sin sesión se rechazan sin escribir; el id de una sede da 404 "Organización no encontrada"; un `resourceId` en el cuerpo no redirige; correo de otra cuenta 422; con la plaza de médico ocupada en Gratis sigue dando 200; `GET .../users` lista sólo memberships directas y vivas con el estado de la invitación (`pending`/`expired`/`null`); `POST .../users/lookup` devuelve sólo `name`/`lastName`/`phone`; la ruta de sede sigue dando 404 "Sede no encontrada" |
| Rutas de sede e invitación con `policy()` | `api/security/clinic-invite-resource-policy.spec.ts` | `POST /clinic` y `POST /user/invite` responden 401 y no escriben; un `organizationId`/`resourceId` en el cuerpo no redirige la escritura; un id que no es UUID da 400; una membership borrada no autoriza (404); el id del tipo equivocado da 404 en español |
| Cuenta se crea una sola vez | `api/security/fix-account-setup-once.spec.ts` | Un dueño o un miembro (USER/DOCTOR) con cuenta recibe 409 de `POST /account` sin que cambien su `accountId`, la cuenta original ni su suscripción; dos `POST /account` simultáneos del mismo usuario dejan un 201 y un 409 y una sola cuenta/suscripción; un usuario sin cuenta sigue creando la suya en un solo intento; `/onboarding` redirige fuera del formulario a quien ya tiene cuenta; el cuerpo del 409 sólo trae `message` y `code` |
| Congelamiento de Culqi | `api/account/beta-free-plan-only.spec.ts` | `POST /account` sin `plan` o con `FREE` da 201 y una suscripción Gratis/ACTIVE sin datos de Culqi; con `CONSULTORIO`, `CLINICA` o `RED` (con o sin tarjeta) y con valores de plan desconocidos da 400 sin crear cuenta ni suscripción; un rechazo no bloquea el siguiente alta Gratis; una cuenta de pago sembrada por Prisma (simulando una suscripción real de Culqi) conserva su plan y sus capacidades tras una acción ajena en el panel |
| Booking público acotado a la sede | `api/security/fix-booking-scope.spec.ts` | `POST /appointment` sin sesión: una combinación válida de sede, médico y especialidad crea una cita; un médico de otra cuenta o de otra sede, una especialidad no conectada al médico (o de otra organización con el mismo nombre), la membership del médico borrada y una sede inexistente responden el mismo 404, con el mismo cuerpo y sin crear ficha ni cita; un id que no es UUID responde 400 |

Las pruebas que vienen de un plan llevan el ID del criterio de aceptación en el
título (`CA-3: …`); los criterios están al final de cada
`docs/features/<slug>/plan.md`.

### Aún sin pruebas

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
