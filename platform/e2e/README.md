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
| Aviso de plan sin la función | `ui/clinic/plan-feature-notice.spec.ts` | En Gratis, pacientes y las métricas de la sede muestran "Tu plan no permite hacer uso de esta función" (en el dashboard sólo en las métricas; "Citas de hoy" sigue) y no "Algo salió mal"; en Clínica ambas páginas funcionan |
| Booking público (caso feliz) | `ui/clinic/public-booking.spec.ts` | Especialidad → doctor → fecha/hora → datos del paciente → "¡Cita reservada!", con un médico invitado y disponibilidad sembrada por Prisma; confirma que quitar `userId` del listado de médicos no rompe la reserva |
| Autogestión de la cita (página) | `ui/appointment/appointment-portal.spec.ts` | A 375 px y sin sesión, con el enlace sembrado por Prisma: la cita se ve sin apellidos, documento, teléfono, correo ni contacto de la sede, sin «hora de Lima» ni «Dr./Dra.», con `noindex` y `referrer: no-referrer`; cancelar pide confirmación («Volver» no cancela) y un motivo obligatorio (cinco opciones sin marcar, «Sí, cancelar» deshabilitado hasta elegir; la petición de la acción lleva el código elegido), deja la cita cancelada y ofrece «Reservar otro horario» a la reserva de la sede; reprogramar con el mismo médico de punta a punta (selector, «Antes»/«Ahora», éxito, y luego «Reprogramar» deshabilitado con su motivo); a menos de 12 h sin botones; tope de una reprogramación; cita ya cancelada; token alterado o inexistente muestra «Este enlace ya no está disponible» (con estado HTTP 200 porque la página responde en streaming); horario tomado mientras se confirma vuelve al selector con el mensaje y la cita intacta; cita cambiada en otra pestaña muestra «Tu cita cambió mientras elegías» y «Recargar» enseña cómo quedó; médico sin horarios ofrece sólo «Cancelar y reservar de nuevo» y «Mantener mi cita» |
| Tratamiento en la autogestión (página) | `ui/appointment/appointment-portal-treatment.spec.ts` | A 375 px, con la médica sembrada con `DRA` por Prisma: la página muestra «Dra. {nombre} {apellido}» en el resumen y en «con {médico}» al reprogramar |
| Tratamiento en el booking público | `ui/booking/public-booking-treatment.spec.ts` | A 375 px, con una médica con `DRA` y un médico sin tratamiento en la misma sede (CA-17 a CA-19): el paso del médico muestra «Dra. {nombre} {apellido}» y «{nombre} {apellido}» (nombre exacto); el resumen y «¡Cita reservada!» dicen «con Dra. …»; con el médico sin tratamiento ningún paso muestra «Dr.» ni «Dra.» |
| Tratamiento en «Citas de hoy» y saludo | `ui/clinic/today-appointments-treatment.spec.ts` | El médico con `DRA` ve «· Dra. {nombre} {apellido}» en sus citas de hoy y el saludo «Hola {nombre} {apellido}» sin tratamiento (CA-21, CA-22); sin tratamiento, el nombre completo sin «Dr.» ni «Dra.» |
| Botón "Crear organización" en `/select` | `ui/account/create-organization-button.spec.ts` | Un USER de una organización y un ADMIN sólo de una sede no ven el botón; en una cuenta sin organizaciones sólo el dueño lo ve; el dueño nuevo crea su organización y una sede desde ahí y queda ADMIN |
| Mi perfil: lectura | `ui/profile/profile-view.spec.ts` | `…/me` bajo los workspaces (barra superior, regreso, avatar, h1 único, correo), dentro de la sede y de la organización (menú lateral, sin regreso) y para el dueño sin organización; solo lectura con campos deshabilitados y correo como texto; «Tratamiento» y vista previa solo para el médico; «Dónde atiendes» (chips, sede sin especialidad, dos sedes y su enlace a la disponibilidad, sin acciones de edición); regiones por `h2`; cuenta Gratis sin aviso de plan (CA-43 a CA-45, CA-47 a CA-49, CA-59 a CA-62, CA-75, CA-76) |
| Mi perfil: edición | `ui/profile/profile-edit.spec.ts` | «Editar» y foco, guardar y persistir, tratamiento visible en el booking, «Cancelar» (descarta valores y errores), errores por campo, celulares (+51, sin código, código fuera de la lista), el tratamiento no se envía a quien no tiene sedes, sesión expirada (CA-50 a CA-57, CA-71) |
| Mi perfil: contraseña | `ui/profile/profile-password.spec.ts` | Desplegar, mostrar/ocultar, actual incorrecta, validaciones sin petición, 129 caracteres, éxito con la sesión vigente, cierre de las demás sesiones (segundo contexto), cancelar (CA-63 a CA-70) |
| Mi perfil en el celular | `ui/profile/profile-mobile.spec.ts` | A 375 px, médico con dos sedes y un nombre de 60 caracteres: sin desplazamiento horizontal en lectura, edición y contraseña abierta, bajo los workspaces y dentro de la sede (CA-73) |
| Mi perfil: navegación | `ui/profile/profile-navigation.spec.ts` | Menú del avatar en `/select`, la sede y la organización (computadora y 375 px): nombre, correo, «Mi perfil», «Cambiar de sede» (cookies borradas, a `/select`) y «Cerrar sesión» (a `/login`, sin cookies ni panel); teclado (flechas, Escape con foco al avatar, Escape a 375 px sólo cierra el menú, clic fuera); avatar activo en el perfil; nombre sin tratamiento; el avatar se actualiza tras guardar; «Configuración» sólo para el médico; `profile` redirige a `me`; sin desplazamiento horizontal (CA-78 a CA-91, CA-93) |
| Límite de intentos del login (mensaje) | `ui/auth/login-rate-limit.spec.ts` | Con el 429 simulado por `page.route` (el límite real está apagado con `NODE_ENV=test`; lo cubre `api/verify-auth-rate-limit.ts`): el login muestra «Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.» (CA-14), sin el texto en inglés, sigue en `/login` y deja reenviar; el cambio de contraseña de «Mi perfil» muestra el mismo aviso y el formulario sigue abierto (CA-15, en `ui/profile/profile-password.spec.ts`) |

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
| Autogestión: abrir el enlace | `api/appointments/portal-read.spec.ts` | `GET /appointment/manage/:token` devuelve exactamente las claves de la página (nombre de pila, médico sin Dr./Dra., sede, dirección, fecha y hora de Lima) y ni apellidos, documento, teléfono, correo, fecha de nacimiento, teléfono de la sede, id de la cita ni de la ficha; token inexistente, alterado, incompleto, de más, en mayúsculas, muy largo, de cita empezada o de cancelada ya pasada dan el mismo 404, también al cancelar y reprogramar (sin cambios ni correos) y con un cuerpo mal formado; `Cache-Control: private, no-store` en éxitos y errores; `POST /appointment` no devuelve enlace |
| Autogestión: enlace en la confirmación | `api/appointments/portal-link-email.spec.ts` | Con plan de pago el correo de confirmación trae el botón «Gestionar mi cita», el texto de las 12 horas, sin mencionar la zona horaria; el enlace lleva un token de 64 hexadecimales que abre `GET /appointment/manage/:token`; `POST /appointment` no devuelve el token. En Gratis el correo sale sin botón ni texto y no se crea ningún token. Ningún correo contiene `{{` ni «comunícate con la clínica» |
| Autogestión: cancelar | `api/appointments/portal-cancel.spec.ts` | Cancela con días u horas (13 h) de antelación; a menos de 12 h `CANCEL_NOT_ALLOWED` y `RESCHEDULE_NOT_ALLOWED` sin cambios ni «tardía»; el plazo vencido con la página abierta no se aplica; cancelar dos veces (también a la vez) responde 200; reprogramar una cancelada o cancelar desde una pantalla vieja da `APPOINTMENT_CHANGED`; el horario queda libre para otro paciente; el motivo es obligatorio (sin él o fuera de la lista, 400 sin cambios; token inválido sin motivo, el mismo 404), se guarda con la cita y una segunda cancelación no lo cambia |
| Autogestión: correos al cancelar | `api/appointments/portal-cancel-emails.spec.ts` | Al cancelar, el paciente recibe «Tu cita ha sido cancelada» sin resumen de la cita y con «Gestionar mi cita» hacia el mismo enlace (mismo token); el médico de la cita recibe «Tu paciente ha cancelado su cita en {sede}» con la especialidad, la etiqueta en español del motivo elegido (las cinco), «El horario quedó libre para otra reserva.» y «Ver mi agenda» hacia el panel de la sede, sin nombre, apellido, documento, teléfono ni correo del paciente ni el enlace; ningún correo contiene «hora de Lima», «Dr.», «Dra.» ni `{{`; sin motivo, token inválido o a menos de 12 h no sale ningún correo, y cancelar otra vez no reenvía |
| Autogestión: reprogramar | `api/appointments/portal-reschedule.spec.ts` | Mueve la misma cita y sube el contador (el mismo enlace muestra la hora nueva; el horario viejo se libera y el nuevo se ocupa); la segunda reprogramación y la de menos de 12 h dan `RESCHEDULE_NOT_ALLOWED`; `SLOT_TAKEN` para horarios a menos de 12 h, fuera de disponibilidad, pasados, fuera de rango, que no son hueco, la hora actual o tomados por otro paciente; 400 con cuerpo mal formado; cambio de médico válido (el actual sin horarios) e inválido (con horarios, otra sede, otra especialidad, membership borrada, otra cuenta, inexistente); carreras (dos reprogramaciones, reprogramar contra reservar, cancelar contra reprogramar) dejan un solo resultado coherente |
| Autogestión: correos al reprogramar | `api/appointments/portal-reschedule-emails.spec.ts` | Al reprogramar, el paciente recibe «Tu cita se ha reprogramado para el {dd/mm} a las {HH:mm}» (fecha y hora nuevas) con el resumen de la nueva cita, «Gestionar mi cita» hacia el mismo enlace (mismo token) y el aviso de que ya sólo puede cancelar; el médico recibe «Tu paciente ha reprogramado la cita en {sede}» con «Antes», «Ahora», el resumen y «Ver mi agenda», sin datos del paciente ni el enlace; con cambio de médico, el anterior y el nuevo reciben cada uno su aviso con «Médico anterior» y «Médico nuevo» y el paciente ve al médico nuevo; ningún correo contiene «hora de Lima», «Dr.», «Dra.» ni `{{`; cuerpo mal formado, pantalla vieja, menos de 12 h o token inválido no envían correo, y un segundo intento no reenvía |
| Autogestión: horarios para reprogramar | `api/appointments/portal-slots.spec.ts` | `GET /appointment/manage/:token/slots` devuelve los horarios del médico de la cita con la forma del booking (`durationMinutes` y `days`), sin los de menos de 12 h; token inexistente, inválido o de cita empezada dan el mismo 404 (también con una consulta inválida) con `Cache-Control: private, no-store`; cita ya reprogramada o a menos de 12 h da 409 `RESCHEDULE_NOT_ALLOWED`, cancelada 409 `APPOINTMENT_CHANGED`; rango inválido 400 tras resolver el token; `GET …/has-slots` responde `{ hasSlots }` (true con horarios a 12 h o más en el rango del booking, false sin ellos) con los mismos 404 y 409 |
| Nombre del médico (tratamiento) | `api/doctor-treatment/doctor-display-name.spec.ts` | Con el tratamiento sembrado por Prisma (el perfil llega en otro PR): `GET /clinic/:clinicId/doctors` arma «Dra.», «Dr.» o el nombre solo, nunca lo deduce del nombre y no expone `treatment`; el registro con `treatment` no lo guarda; la agenda de hoy trae `doctor.displayName`; el historial de la ficha (cuenta de pago) nombra a la médica con «Dra.» |
| Tratamiento en reserva, autogestión y correos | `api/doctor-treatment/treatment-in-appointment-flows.spec.ts` | El portal devuelve `doctorName` con «Dra.» y las mismas claves; los correos de reserva y de reprogramación al paciente la nombran con «Dra.»; el correo al médico muestra «Profesional», «Médico anterior» y «Médico nuevo» con el tratamiento de cada uno; los saludos al médico (cancelar y reprogramar) son «Hola {nombre de pila},»; si el tratamiento cambia después, el correo ya enviado no cambia y el portal muestra el nombre nuevo |
| Mi perfil (api) | `api/user/my-profile.spec.ts` | `GET /user/me/profile` devuelve sólo `name`, `lastName`, `email`, `phone`, `treatment`, `doctorDisplayName` y `clinics` (sin ids de usuario, cuenta ni rol; vacío para USER, ADMIN sin perfil y dueño sin organización; una sede por membership viva; sin especialidades de otra organización); `PATCH` guarda y recorta espacios, `treatment` ausente no cambia y `null` borra, campos vacíos o de más y tratamientos inválidos dan 400 sin cambios, sin largo máximo, `DRA` sin ser médico 403 (`null` siempre 200), no toca a otros usuarios; sin sesión 401, sin confirmar, sin onboarding o sin cuenta 403 (la confirmación se quita en la base a una sesión ya abierta); el listado público de médicos de sus sedes muestra el nombre nuevo; `GET /user/me` conserva su forma y `update-user` sigue en 404 |
| IP de la sesión | `api/security/fix-auth-rate-limit-ip.spec.ts` | Iniciando sesión vía platform, la sesión guarda la IP de `X-Real-IP` (CA-1); con sólo `X-Forwarded-For` de dos entradas guarda `127.0.0.1` y no la del visitante (CA-2); CA-3 es el CA-6 de `fix-invitation-set-password.spec.ts`, con `ipAddress` no vacío |

Las pruebas que vienen de un plan llevan el ID del criterio de aceptación en el
título (`CA-3: …`); los criterios están al final de cada
`docs/features/<slug>/plan.md`.

### Aún sin pruebas

- Autogestión de la cita: los criterios que dependen de lo que aún no existe
  (correos con el enlace y avisos al médico CA-1, CA-3, CA-9, CA-36 a CA-41,
  etiquetas del panel CA-44 a CA-46) y el cambio de médico en la página (lista de otros médicos).

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
  - `appointment-portal.ts`: escenario de autogestión (`createPortalScenario`,
    `addPortalDoctor`), cita reservada con un enlace sembrado por Prisma
    (`createManagedAppointment`, que siembra el enlace aparte), horas de
    Lima (`limaWallTimeInDays`, `limaWallTimeInHours`) y el cliente anónimo del
    portal (`createPortalClient`).
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
