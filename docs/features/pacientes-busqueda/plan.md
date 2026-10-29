# Plan: pacientes, ver más y búsqueda

**Rama:** `feat/patients-search`, desde `origin/main` (4a41f6f).
**Fecha:** 25 de octubre de 2026
**Mockup:** `docs/features/pacientes-busqueda/mockup.html`. El humano lo aprobó el 25 de octubre de 2026
con las recomendaciones de D-1 a D-6. Tiene interruptores para ver las alternativas descartadas de D-1,
D-3, D-4, D-5 y D-6. El acotamiento por sede y por organización (A-1 a A-10) no cambia ninguna
pantalla del mockup.
**Depende de:** nada. Parte de `main` con #125 (la tabla se desplaza en el celular y el teléfono es un
enlace `tel:`). No toca nada de `feat/first-use` (#126).

Criterios de aceptación: los escribe el product-manager. No quedan preguntas abiertas.

## Objetivo

Que el médico, desde el celular entre consultas, encuentre en segundos a cualquier paciente de su
consultorio, escribiendo parte del nombre, el DNI o el teléfono, y que pueda recorrer la lista
completa y no solo los últimos 20. Ningún endpoint de pacientes lee o edita pacientes por cuenta: el
listado, la búsqueda y la ficha se acotan a las sedes a las que el usuario tiene acceso, y las citas
que se ven de un paciente son solo las de la organización desde la que se mira.

## Problema (verificado en el código)

| | Hoy |
| --- | --- |
| Listado | El api pagina: 20 por página (máximo 100), cursor `from` y orden por `id` (uuid7) descendente, es decir, por fecha de alta (`get-patients.usecase.ts`). Responde `{ data, hasMore, nextFrom }`. `patientsApi.getAccountPatients` descarta `hasMore` y `nextFrom`, así que la página muestra 20 sin aviso y un paciente antiguo no aparece nunca. |
| Búsqueda | No existe ni en el api ni en las dos páginas (`clinic/[clinicId]/patients` y `organization/[resourceId]/patients`). |
| Alcance | Las tres rutas de pacientes (`GET /patients`, `GET` y `PATCH /patients/:patientId`) solo exigen una membership viva en la cuenta (`requireLiveMembership`). El listado no comprueba el acceso al `clinicId` de la query (solo que la sede sea de la cuenta) y sin él devuelve toda la cuenta. La ficha se lee y se edita por id dentro de la cuenta. Un médico de la sede A, llamando al api con su cookie, lista, lee y edita pacientes de la sede B o de toda la cuenta. |
| Historial y métricas | La ficha (`get-patient-detail.query.ts`) y las métricas de cada fila del listado (`loadAppointments` en `get-patients.usecase.ts`) leen las citas del paciente en **toda la cuenta**, también las de otras organizaciones. |
| Organización | El nombre no enlaza a la ficha (`PatientsTable` sin `buildHref`), aunque la invitación promete que el miembro de la organización «verá las fichas de los pacientes». |
| Plan | El módulo es de pago: en Gratis el api responde 402 y la página muestra `PlanFeatureNotice` con «Pedir el plan Consultorio». **No cambia.** |

## Decisiones del humano

El humano aprobó el plan y el mockup el 25 de octubre de 2026, con las seis recomendaciones. Ese mismo
día decidió corregir en este PR el alcance de los endpoints de pacientes (D-7) y respondió las
preguntas que salieron al acotarlos (D-8 a D-11, antes Q-1 a Q-4).

| # | Pregunta | Opciones | Recomendación | Decisión |
| --- | --- | --- | --- | --- |
| D-1 | ¿Por qué campos se busca? | **a)** Nombre, apellido, número de documento y teléfono, sin distinguir mayúsculas ni tildes. **b)** Solo nombre y apellido. **c)** Los de a y además el correo. | **a.** Entre consultas, el médico tiene a mano lo que le dicen por teléfono o en recepción: un apellido, un DNI o el número desde el que le escriben. El correo casi nunca se dicta y suma coincidencias sin sentido (dominios como `gmail`). Sin tildes porque en el celular nadie las escribe: «jose nunez» encuentra a «José Núñez». | **a**, el 25 de octubre de 2026. |
| D-2 | ¿«Ver más» o páginas? | **a)** Botón «Ver más pacientes» al final, que agrega los 20 siguientes debajo. **b)** Páginas numeradas. **c)** Desplazamiento infinito. | **a.** Es lo que ya sabe hacer el api (cursor), funciona igual en el celular y en el escritorio, y no pierde lo que ya se cargó. **b** exige contar el total y saltar de página, que el cursor no permite. **c** esconde el final de la página y es peor con lector de pantalla. | **a**, el 25 de octubre de 2026. |
| D-3 | ¿En qué orden sale la lista? | **a)** Los nuevos primero (fecha de alta, es decir, de la primera reserva), como hoy. **b)** Por apellido, de la A a la Z. **c)** Por última visita. | **a.** Con la búsqueda, el orden deja de ser la forma de encontrar a alguien. Arriba quedan los pacientes nuevos, que son los que el médico todavía no recuerda. **b** necesita un cursor por apellido, nombre e id. **c** se calcula sobre las citas y no se puede paginar con un cursor simple. El subtítulo lo dice: «Los nuevos aparecen primero». | **a**, el 25 de octubre de 2026. |
| D-4 | ¿Cuándo empieza a buscar? | **a)** Mientras escribe, desde 2 caracteres. **b)** Mientras escribe, desde 3. **c)** Solo al pulsar «Buscar» (o Enter). | **a.** Hay apellidos de dos letras con sentido de búsqueda («Li», «Gil» empieza a acotar en «Gi») y un DNI se acota rápido. Con 1 carácter no busca y lo dice. **c** obliga a un paso más en el celular. | **a**, el 25 de octubre de 2026. |
| D-5 | ¿Qué pasa en la vista de organización? | **a)** Igual que la sede (búsqueda y «Ver más») y el nombre abre la ficha, en una ruta nueva dentro de la organización que reutiliza la ficha de hoy. **b)** Búsqueda y «Ver más», sin enlace a la ficha. **c)** Quitar «Pacientes» de la organización. | **a.** Es lo que ya promete la invitación a la organización. Es una página que reutiliza los componentes de la ficha. | **a**, el 25 de octubre de 2026. |
| D-6 | Al volver de la ficha, ¿se conserva la búsqueda? | **a)** No: la lista vuelve sin búsqueda. **b)** Sí, mientras la pestaña siga abierta (se guarda en el navegador, nunca en la URL). | **a.** El término no puede ir en la URL (ver P-1), y casi siempre el médico ya encontró a quien buscaba. Volver a escribir «quis» cuesta 4 teclas. **b** es posible sin tocar el api, si molesta en la práctica. | **a**, el 25 de octubre de 2026. |
| D-7 | ¿Se corrige en este PR el alcance de los endpoints de pacientes? | **a)** Sí: solo pacientes de las sedes a las que el usuario tiene acceso. **b)** No, en un fix aparte. | El planner recomendaba b, para no mezclarlo con la búsqueda. | **a**, el 25 de octubre de 2026: nunca pacientes de toda la cuenta. Ver «Alcance». |
| D-8 (antes Q-1) | En la sede, ¿un DOCTOR ve a todos los pacientes de la sede o solo a los suyos? | **a)** Todos los pacientes con alguna cita en la sede, a cualquier rol. **b)** El DOCTOR, solo los pacientes con alguna cita con él (como la agenda del día, que ya le muestra solo sus citas). | — | **a**, el 25 de octubre de 2026: como hoy. |
| D-9 (antes Q-2) | ¿La ficha (`GET` y `PATCH /patients/:patientId`) también se acota? | **a)** No, sigue por cuenta. **b)** Sí, con las reglas del listado. | — | **b**, el 25 de octubre de 2026, en este PR: solo un paciente de una sede a la que el usuario tiene acceso; sin acceso, 404, igual que si no existiera. Cambian la ruta y los e2e. Ver A-8 y A-9. |
| D-10 (antes Q-3) | ¿Quién hereda el acceso a las sedes desde la organización? | **a)** Cualquier rol de la organización, como hoy en todo el api y como promete la invitación. **b)** Solo ADMIN. | — | **a**, el 25 de octubre de 2026. |
| D-11 (antes Q-4) | En la ficha de un paciente al que el usuario accede, ¿de qué sedes se ven sus citas en el historial y las métricas? | **a)** De todas las sedes de la cuenta, como hoy. **b)** Solo de las sedes a las que el usuario accede. **c)** De todas las sedes de la organización desde la que se abre la ficha. | — | **c**, el 25 de octubre de 2026: «sedes de la misma organización», aunque el usuario no pertenezca a todas. **Nunca** las de otras organizaciones de la cuenta. Ver A-10. |

## Reglas de este plan

### Búsqueda

- **S-1. Qué encuentra** (D-1). Cada palabra que se escribe tiene que aparecer en el nombre, el
  apellido, el número de documento o el teléfono del paciente, en cualquier orden y en cualquier
  parte de esos campos. Sin distinguir mayúsculas ni tildes, y la «ñ» vale como «n».
  - «ana quis» encuentra a «Ana María Quispe Rojas».
  - «jose nunez» encuentra a «José Núñez Ccori».
  - «quispe 9876» encuentra a una Quispe cuyo teléfono contiene 9876.
  - «ab12» encuentra el pasaporte «AB123456».
- **S-2. Números con separadores.** Si el término, sin espacios, puntos, guiones, paréntesis ni «+»,
  queda solo en dígitos, se busca como un único número. «987 654 321», «987-654-321» y
  «+51 987654321» encuentran «+51987654321», y «45.123.456» encuentra el DNI 45123456. Del teléfono
  guardado se comparan solo los dígitos: el `PATCH` de la ficha acepta teléfonos con espacios.
- **S-3. Mínimo** (D-4). 2 caracteres sin contar espacios. Con 1, la lista no cambia y debajo del
  campo se lee «Escribe al menos 2 letras o números.». Máximo 80 caracteres (`maxLength` en el campo;
  el api responde 400 si se pasa).
- **S-4. Alcance.** El de la lista: ver «Alcance».
- **S-5. Orden y páginas.** Los de la lista (D-3): 20 por página y «Ver más resultados» con el
  mismo término.
- **S-6. Cuándo busca** (D-4). Mientras escribe, 300 ms después de la última tecla. Enter (la tecla
  «Buscar» del teclado del celular) busca al instante. Solo se pinta la respuesta del último
  término: una respuesta que llega tarde se descarta.
- **S-7. Limpiar.** La «x» del campo, o borrar el texto, vuelve a la lista sin búsqueda: la primera
  página que trajo el servidor, sin pedirla otra vez. El foco vuelve al campo.
- **S-8. Al volver de la ficha** (D-6), la búsqueda empieza vacía.

### Alcance (D-7 a D-11)

- **A-1. La sede o la organización va en la ruta, como `:resourceId`,** en el listado, la búsqueda y
  la ficha. Es la regla de `api/AGENTS.md` («el id de la organización o sede va siempre en
  `:resourceId`, nunca en el cuerpo»), y permite usar la política `member` tal como existe.
- **A-2. Acceso a una sede.** Membership viva en ella, directa o heredada de una membership viva en
  su organización, con cualquier rol (D-10).
- **A-3. Acceso a una organización.** Membership viva y directa en ella, con cualquier rol: es la
  misma condición del layout de la organización, que muestra «Pacientes» a todos sus miembros. Quien
  solo es miembro de una sede no accede a la organización.
- **A-4. Pacientes en el alcance.** En una sede, los que tienen al menos una cita en ella, para
  ADMIN, DOCTOR y USER (D-8). En una organización, los que tienen al menos una cita en alguna de
  **sus** sedes: una cuenta con dos organizaciones ya no mezcla sus pacientes. Siempre filtrando
  también por el `accountId` de la sesión.
- **A-5. Sin acceso, 404 y no 403.** Una sede o una organización de otra cuenta, una que no existe o
  una de la misma cuenta sin acceso responden igual: 404 «Resource not found». Así no se revela qué
  sedes existen.
- **A-6. Listado y búsqueda:** devuelven solo pacientes en el alcance (A-4).
- **A-7. Ninguna ruta lee pacientes por cuenta.** `GET /patients`, `GET /patients/:patientId` y
  `PATCH /patients/:patientId` desaparecen. Las rutas que quedan están en «Endpoints de pacientes».
- **A-8. Ficha** (D-9). `GET` y `PATCH` reciben la sede o la organización desde la que se abre. Si el
  paciente no está en su alcance (A-4), responden 404 «Patient not found», igual que si no existiera
  o fuera de otra cuenta.
- **A-9. Quién edita los datos de salud.** Con la ruta acotada, el rol sale de la membership que
  resolvió la política para ese `:resourceId`: ADMIN o DOCTOR editan todo, USER solo el contacto. Hoy
  el api acepta cualquier membership ADMIN o DOCTOR de la cuenta (`isClinicalStaff`), aunque el
  usuario abra la ficha desde una sede donde es USER. El formulario ya decide con el rol de la sede
  (`RecordForm` lee `useApp().membership.role`). Con este cambio, api y pantalla usan la misma regla.
- **A-10. Citas que se ven de un paciente** (D-11). Son las de las sedes de **la organización del
  alcance**:
  - abierto desde una sede, la organización a la que pertenece esa sede;
  - abierto desde una organización, esa misma.

  Entran todas las sedes de esa organización, aunque el usuario no sea miembro de ellas. Nunca entran
  las de otra organización de la cuenta. La regla vale para:
  - el historial de la ficha (fecha, sede, profesional, especialidad y estado);
  - las métricas de la ficha (citas totales, atendidas, inasistencias, primera y última visita y
    próxima cita);
  - las métricas de cada fila del listado y de la búsqueda («Última visita», «Citas» y el estado «Con
    cita próxima» / «N inasistencias»). No las nombra la decisión, pero son las mismas citas: si
    contaran toda la cuenta, la lista mostraría la última visita o la próxima cita de un paciente en
    otra organización.

### Ver más

- **V-1.** Debajo de la tabla, si el api responde `hasMore: true`, el botón «Ver más pacientes»
  (en una búsqueda, «Ver más resultados»). Pide la página siguiente con `nextFrom` y la agrega
  debajo, sin mover la vista. Cuando `hasMore` es `false`, el botón desaparece.
- **V-2.** Mientras carga: deshabilitado, con spinner y «Cargando…». Un doble clic no duplica
  filas.
- **V-3.** Si falla: toast «No pudimos cargar más pacientes. Vuelve a intentarlo.» y el botón sigue
  disponible. Las filas cargadas se quedan.
- **V-4.** Los pacientes que reservan mientras la página está abierta no aparecen al pulsar «Ver
  más» (son más nuevos que la primera página). Aparecen al recargar.

### Organización (D-5)

- **O-1.** La página de la organización tiene la misma búsqueda y el mismo «Ver más», con el alcance
  de la organización (A-4).
- **O-2.** El nombre del paciente abre
  `/account/{accountId}/organization/{resourceId}/patients/{patientId}`: la ficha de hoy (cabecera,
  «Historial de citas» y «Ficha»), con «Pacientes» de vuelta a la lista de la organización y el
  título de pestaña «Ficha del paciente». Pide la ficha con el id de la organización (A-8), y muestra
  las citas de sus sedes (A-10).
- **O-3.** En esa ficha, el rol para editar es el de la membership de la organización (A-9).

### Privacidad del término

- **P-1. El término no va en ninguna URL.** Ni en la de la página (no hay `?q=`), ni en la del api.
  Así no queda en el historial del navegador, ni en los logs de acceso de Railway, de Next o del api
  (el log de acceso de Fastify registra `request.url` con su query, `server.ts`).
- **P-2.** Viaja solo en cuerpos de peticiones `POST`: del navegador a Next en una server action, y
  de Next al api en la ruta de búsqueda.
- **P-3.** Ningún log nuevo. Los errores se registran como hoy en `handleError` (nombre y código,
  sin mensaje ni datos).
- **P-4.** El campo lleva `autoComplete="off"`, para que el navegador no guarde las búsquedas en su
  historial de formularios.

## Endpoints de pacientes

### Los que quedan

Todos viven en `patientRoutes` (prefijo `/patients`), con
`policy({ account: true, confirmed: true, onboarded: true, member: true })` y
`requireFeature("PATIENT_RECORD")`.

| Endpoint | Qué hace | Qué pacientes | Qué citas de cada paciente |
| --- | --- | --- | --- |
| `GET /patients/in/:resourceId` | Listado, 20 por página | Los del alcance de la sede u organización (A-2 a A-4) | Las de la organización del alcance, en las métricas de cada fila (A-10) |
| `POST /patients/in/:resourceId/search` | Búsqueda, 20 por página | Igual, más el término (S-1, S-2) | Igual |
| `GET /patients/in/:resourceId/:patientId` | Ficha, historial y métricas | Solo si el paciente está en el alcance; si no, 404 (A-8) | Las de la organización del alcance (A-10) |
| `PATCH /patients/in/:resourceId/:patientId` | Editar la ficha | Igual que la ficha; datos de salud según el rol en ese `:resourceId` (A-9) | — |

### Los que desaparecen

`GET /patients`, `GET /patients/:patientId` y `PATCH /patients/:patientId` (A-7).

### Otras rutas del api que leen datos de pacientes (no cambian)

Revisadas para comprobar que ninguna lee pacientes por cuenta:

| Ruta | Qué lee | Por qué ya está acotada |
| --- | --- | --- |
| `GET /clinic/:resourceId/appointments/today` | Nombre, apellido y teléfono de los pacientes de las citas de hoy | `member` en la sede, y el DOCTOR solo ve sus citas (`get-clinic-appointments.query.ts`) |
| `GET /appointment/manage/:token` (pública) | El nombre del paciente de esa cita | Por el token de una cita, no por cuenta |
| Cancelar y reprogramar desde el link (públicas) | Nombre, apellido y correo, para el correo de esa cita (`get-appointment-notice.query.ts`) | Por el token de una cita |
| `POST /appointment` (booking, pública) | Busca o crea el paciente por cuenta y documento (`create-appointment.usecase.ts`) | No devuelve datos del paciente: responde «Cita creada con éxito». Solo los usa para el correo de confirmación |

## Cambios por capa

### Prisma

**Ninguno, sin migración.**

- Toda consulta filtra por `account_id`, y los dos índices de `patient`
  (`@@unique([accountId, documentType, documentNumber])` y `@@index([accountId, documentNumber])`)
  empiezan por esa columna. Postgres reduce el recorrido a las filas de la cuenta y aplica la
  búsqueda sobre ellas. Con los volúmenes de un consultorio (cientos o pocos miles de pacientes) es
  cuestión de milisegundos. Hay que medirlo (ver Verificación).
- El alcance (A-4) es un `EXISTS` sobre `appointment` por `patient_id`, que usa el índice
  `[patientId, scheduledAt]`. En la organización suma la unión con `clinic` y `resource` (por
  `parent_resource_id`), sobre claves primarias. En la ficha es la misma condición sobre un solo
  paciente.
- Las citas del historial y de las métricas (A-10) se leen por `patient_id` (el mismo índice, que
  además ya da el orden del historial) y se filtran por la organización con la misma unión.
- Un `LIKE '%…%'` no aprovecha un índice btree, y un índice de trigramas (GIN con `pg_trgm`) sí,
  pero **necesita la extensión `pg_trgm`** (`CREATE EXTENSION`, en una migración y con permisos sobre
  la base). No hace falta: el filtro por cuenta ya acota.
- **Alternativa sin extensión, si una cuenta crece a decenas de miles de pacientes:**
  `@@index([accountId, id])`, que deja el orden y el cursor (`account_id = ? AND id < ? ORDER BY id
  DESC`) como un recorrido de índice que para al juntar 21 coincidencias. Sería una migración nueva
  con `pnpm prisma:migrate`.
- La comparación sin tildes no usa la extensión `unaccent` (otra extensión). La alternativa sin
  extensión es `translate()` de Postgres con la lista fija de vocales con tilde, «ü» y «ñ» (ver
  Notas para el engineer).

### api

Rutas, nombres y archivos son un punto de partida: los decide el engineer. **No hace falta tocar
`policy.ts`, `auth.ts` ni `entitlements.ts`:** la política `member` ya resuelve la membership de
`:resourceId`, directa o heredada de la organización (`GetUserMembership`), responde 404 sin ella, y
para una sede ya devuelve su organización (`parentOrganization.resourceId`).

**El alcance que reciben los casos de uso.** El handler lo arma con `requireMembership(request)`,
nunca con datos del cliente:

| Membership resuelta | `scope.resourceType` | `scope.resourceId` | `scope.organizationId` |
| --- | --- | --- | --- |
| Sede | `CLINIC` | la sede | `membership.parentOrganization.resourceId` |
| Organización | `ORGANIZATION` | la organización | la misma organización |

`resourceId` decide qué pacientes entran (A-4). `organizationId` decide qué citas se ven de ellos
(A-10).

| Archivo | Cambio |
| --- | --- |
| `api/src/application/use-cases/patient/get-patients.usecase.ts` | El DTO pasa a ser `{ accountId, scope, limit, from, search? }`. Filtra los pacientes por el alcance de A-4 y por `accountId`. `loadAppointments` suma el filtro por `scope.organizationId` (citas en sedes cuyo `resource.parentResourceId` es esa organización): **hoy lee las citas del paciente en toda la cuenta** y su comentario lo justifica; el comentario pasa a explicar D-11. `getPatientsQuerySchema` pierde `clinicId` y queda en `limit` y `from`. Exporta `patientsScopeParamsSchema` (`resourceId: z.uuid()`) y `searchPatientsBodySchema` (`limit`, `from` y `search`: recorte, espacios colapsados, mínimo 2 sin espacios y máximo 80, con mensajes en español). Con `search`, suma el filtro de S-1 y S-2. Desaparece `assertClinicInAccount`: la política ya probó el acceso. El cursor y el orden no cambian. |
| `api/src/application/queries/patient/get-patient-detail.query.ts` | Recibe el mismo `scope`. Busca el paciente por `id`, `accountId` y el alcance de A-4; si no está, `NotFound("Patient not found")`. Las citas del historial suman el filtro por `scope.organizationId`, y `buildPatientMetrics` recibe esas mismas citas, así que historial y métricas cuadran. **Hoy lee todas las citas de la cuenta**, y el comentario «Todas las citas de la cuenta, no solo las de una sede…» pasa a explicar D-11. `getPatientDetailParamsSchema` suma `resourceId: z.uuid()`. |
| `api/src/application/use-cases/patient/update-patient-record.usecase.ts` | Recibe `scope` y el rol de la membership resuelta. Busca el paciente igual que la ficha (404 si no está en el alcance). `isClinicalStaff` desaparece: los datos de salud se permiten si ese rol es ADMIN o DOCTOR (A-9). El `Forbidden` de hoy se mantiene. |
| `api/src/routes/patient/index.ts` | Salen `GET /patients`, `GET /patients/:patientId` y `PATCH /patients/:patientId`. Entran las cuatro rutas de «Endpoints de pacientes». Solo HTTP: schemas, política, `requireMembership(request)` para armar `scope` y el rol, y las respuestas de hoy (`{ data, hasMore, nextFrom }`, `{ data }` y 204). Con `member` en todas las rutas, el hook `requireLiveMembership` del scope queda redundante y se puede quitar de aquí (sigue en uso en `routes/clinic`). |

Dos condiciones se repiten:
- «el paciente tiene una cita en el alcance»: en el listado, la búsqueda, la ficha y la edición;
- «la cita es de una sede de esta organización»: en el historial y en las dos métricas.

Conviene escribir cada una una sola vez, en un repositorio o una query de `infrastructure`, según
`api/AGENTS.md`.

**Política de las rutas:**

```ts
const patientScopePolicy = policy({
  account: true,
  confirmed: true,
  onboarded: true,
  // Resuelve la membership de :resourceId, directa o heredada de la organización, y responde 404 sin ella.
  member: true,
});

app.get("/in/:resourceId", {
  ...patientScopePolicy,
  schema: { params: patientsScopeParamsSchema, querystring: getPatientsQuerySchema },
}, listHandler);

app.post("/in/:resourceId/search", {
  // POST y no GET: el término va en el cuerpo para que no quede en ningún log de acceso (P-1).
  ...patientScopePolicy,
  schema: { params: patientsScopeParamsSchema, body: searchPatientsBodySchema },
}, searchHandler);

app.get("/in/:resourceId/:patientId", {
  ...patientScopePolicy,
  schema: { params: getPatientDetailParamsSchema },
}, detailHandler);

app.patch("/in/:resourceId/:patientId", {
  ...patientScopePolicy,
  schema: { params: getPatientDetailParamsSchema, body: updatePatientRecordSchema },
}, updateHandler);
```

El hook global de la política corre antes que `requireFeature` del scope, así que **sin acceso la
respuesta es 404 antes que 402**, como hoy. Un `GET /patients/in/:resourceId/search` cae en la ruta
de la ficha y responde 400 (`search` no es un uuid).

**Respuestas del listado y de la búsqueda:**

| Respuesta | Cuándo |
| --- | --- |
| 200 `{ data, hasMore, nextFrom }` | Con acceso y con un plan que incluye `PATIENT_RECORD`. La búsqueda puede traer `data: []`. Las métricas de cada fila cuentan solo las citas de la organización del alcance (A-10). |
| 400 | `resourceId` o `from` que no son uuid, `limit` fuera de rango, o `search` con menos de 2 caracteres o más de 80. La validación del schema corre antes que la política, así que un `resourceId` mal formado ya no llega a la base. |
| 401 | Sin sesión. |
| 403 | Política: sin cuenta, sin correo confirmado o sin onboarding. |
| 404 «Resource not found» | Sin acceso a la sede o a la organización, o un recurso de otra cuenta o que no existe (A-5). |
| 402 | Con acceso, pero el plan no incluye `PATIENT_RECORD` (Gratis). |

**Respuestas de la ficha (`GET`) y de la edición (`PATCH`):**

| Respuesta | Cuándo |
| --- | --- |
| 200 `{ data: { patient, history, metrics } }` / 204 | Con acceso y con el paciente en el alcance. `history` y `metrics` solo con citas de la organización del alcance (A-10). |
| 400 | `resourceId` o `patientId` que no son uuid, o un cuerpo inválido en el `PATCH`. |
| 401 / 403 | Como en el listado. |
| 404 «Resource not found» | Sin acceso a la sede o a la organización (A-5). |
| 404 «Patient not found» | El paciente no existe, es de otra cuenta o no tiene citas en el alcance (A-8). Las tres causas responden igual. |
| 402 | Con acceso, en Gratis. |
| 403 «Solo el personal sanitario puede editar los datos de salud» | `PATCH` con datos de salud y rol USER en ese `:resourceId` (A-9). |

**Sin cambios:** `server.ts`, `policy.ts`, `auth.ts` y `entitlements.ts`.

**Alternativas descartadas:**

- Mantener `GET /patients?clinicId=` y comprobar la membership dentro del caso de uso. Va contra la
  regla de `api/AGENTS.md` sobre `:resourceId`, y duplica la herencia de `GetUserMembership`.
- Colgar las rutas de `/clinic/:resourceId/patients` y `/organization/:resourceId/patients`. Son el
  doble de rutas en dos archivos, y fuera del scope de `patientRoutes` habría que repetir
  `requireFeature`. `docs/ficha-paciente-historial.md` ya lo descartó por eso.
- `GET` con el término en la query, tapándolo en el `requestSerializer` de `server.ts`. Cubre el log
  de Fastify, pero no el de un proxy delante del api (Railway registra las rutas de las peticiones
  que pasan por su borde).
- Leer la organización de la sede con una consulta aparte en el caso de uso. `GetUserMembership` ya
  la trae en `parentOrganization`.

**Notas para el engineer:**

- Prisma no compara sin tildes. Hace falta SQL con `Prisma.sql` / `$queryRaw` en plantilla (con
  parámetros), nunca `$queryRawUnsafe`. Por ejemplo, para la página de ids:
  `translate(campo, 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')` y después `lower()`. Ese orden no depende
  del locale de la base (con locale `C`, `lower('Á')` no da `á`). El término se normaliza igual en
  TypeScript (`normalize("NFD")` sin diacríticos, en minúsculas).
- El teléfono se compara con `regexp_replace(phone, '\D', '', 'g')`.
- Hay que escapar `%`, `_` y `\` del término antes del `LIKE`: si no, «%» encuentra a todos.
- Cada palabra es una condición `AND`. Las palabras repetidas se pueden quitar.
- El rol de A-9 es `membership.role` de `requireMembership(request)`: en una sede, el mayor entre la
  membership directa y la heredada (`GetUserMembership`).
- `docs/ficha-paciente-historial.md` dice que el historial junta «las citas del paciente en toda la
  cuenta». Ese documento describe el diseño original; D-11 lo reemplaza para el historial y las
  métricas.

### platform

| Archivo | Cambio |
| --- | --- |
| `platform/src/lib/api/patients/types.ts` | `PatientsPage = { patients: PatientListEntry[]; hasMore: boolean; nextFrom: string \| null }`. |
| `platform/src/lib/api/patients/index.ts` | `getAccountPatients` pasa a `getPatients({ resourceId, from? })`: `GET /patients/in/{resourceId}` y devuelve `PatientsPage` (deja de descartar `hasMore` y `nextFrom`). Nuevo `searchPatients({ resourceId, search, from? })`: `POST /patients/in/{resourceId}/search` con el término en el cuerpo. `getPatientDetail(resourceId, patientId)`: `GET /patients/in/{resourceId}/{patientId}`, con el mismo tag `patient-{id}`. Todos con los ids en `encodeURIComponent`; el listado y la búsqueda, con `cache: "no-store"`. |
| `platform/src/lib/actions/patient/list-patients.action.ts` (nuevo) | `listPatientsAction({ resourceId, search?, from? }): Promise<DataActionState<PatientsPage>>`. Sesión → `auth-expired`. Valida con Zod (uuid y largo del término). Con `search` llama a `searchPatients`; sin él, a `getPatients`. Errores con `toActionState`. El cliente necesita distinguir el 402 (ver Estados); cómo lo devuelve lo decide el engineer. Sin `revalidateTag`: no escribe nada. |
| `platform/src/lib/actions/patient/update-patient-record.action.ts` | Recibe además `resourceId` y llama a `PATCH /patients/in/{resourceId}/{patientId}`. El resto, igual. |
| `platform/src/components/patient/record-form.tsx` | Pasa `membership.resourceId` (ya lee `useApp()`) a `updatePatientRecordAction`. |
| `platform/src/components/patient/patients-browser.tsx` (nuevo) | `PatientsBrowser`. Ver UI. |
| `platform/src/components/patient/patients-table.tsx` | `buildHref` (una función) pasa a `patientsPath: string`: la tabla ahora se pinta dentro de un componente de cliente, y una función no puede pasar de un componente de servidor a uno de cliente. Con D-5 el nombre enlaza siempre, así que la prop es obligatoria y desaparece la rama sin enlace. Suma `empty: ReactNode`, que pasa a `Table`. |
| `platform/src/app/account/[accountId]/clinic/[clinicId]/patients/page.tsx` | Carga la primera página con `getPatients({ resourceId: clinicId })`. Con datos: `h1` «Pacientes», el subtítulo y `PatientsBrowser`. Con 402: `h1` y `PlanFeatureNotice`, como hoy. |
| `platform/src/app/account/[accountId]/clinic/[clinicId]/patients/[patientId]/page.tsx` | Pide la ficha con `getPatientDetail(clinicId, patientId)`. Lo demás, igual. |
| `platform/src/app/account/[accountId]/organization/[resourceId]/patients/page.tsx` | Igual que la de la sede, con el `resourceId` de la organización y su subtítulo. Hoy la página no lee `params`; pasa a leerlo. |
| `platform/src/app/account/[accountId]/organization/[resourceId]/patients/[patientId]/page.tsx` (nuevo, D-5) | La ficha con `getPatientDetail(resourceId, patientId)`, con `PatientHeader`, `PatientTabs`, `AppointmentHistory`, `RecordForm` y `PlanFeatureNotice`, como la de la sede, y el enlace «Pacientes» a la lista de la organización. Usa el `loading.tsx` y el `error.tsx` de la organización. Si conviene compartir el cuerpo con la página de la sede, lo decide el engineer. |

No cambian: `Table`, `PlanFeatureNotice`, `ErrorState`, `LoadingState`, `Sidebar`, `PatientHeader`,
`PatientTabs` ni `AppointmentHistory`. Esta última ya muestra la columna «Sede» en cada cita, así que
se ve de qué sede de la organización es cada una.

## Aislamiento entre cuentas, organizaciones y sedes

| Dato | Cómo queda acotado |
| --- | --- |
| Sede u organización | Va en `:resourceId`. La política `member` busca la membership por `(userId de la sesión, resourceId)`, directa o, en una sede, heredada de su organización, siempre con `deletedAt: null`. Sin ella, 404. Una sede de otra cuenta nunca tiene membership del usuario, así que también da 404. |
| Tipo de alcance, organización y rol | Salen de la membership resuelta (`resourceType`, `parentOrganization`, `role`), nunca del cliente. |
| Pacientes del listado y de la búsqueda | Filtro por el `accountId` de la sesión y por citas en el alcance (A-4). |
| Paciente de la ficha y de la edición | `patientId` de la ruta, buscado con `accountId` y el alcance (A-4). Fuera de él, 404 «Patient not found» (A-8). |
| Historial y métricas (ficha y filas) | Citas de un paciente que ya está en el alcance, solo en sedes de la organización del alcance (A-10). Nunca de otra organización de la cuenta. |
| Datos de salud en la edición | Según el rol de esa membership (A-9). |
| `from` de la query o del cuerpo | Solo se usa como cota (`id < from`) dentro de esos filtros: un uuid de fuera no trae nada que no estuviera ya en el alcance. |
| Las server actions | Reciben `resourceId`, `patientId`, `search` y `from` del navegador y los reenvían al api con la cookie del usuario. No amplían nada: el api valida todo como si la petición fuera directa. |

No hay endpoints públicos nuevos. Las cuatro rutas pasan por el security-reviewer (datos de
pacientes y cambio de alcance).

## UI

### Rutas y layout

| Ruta | Layout | Qué cambia |
| --- | --- | --- |
| `/account/[accountId]/clinic/[clinicId]/patients` | `clinic/[clinicId]/layout.tsx`: `Sidebar` (barra superior y menú en el celular) + `main` con `p-4 sm:p-6 md:p-8` | Subtítulo, buscador, estados de búsqueda y «Ver más». |
| `/account/[accountId]/organization/[resourceId]/patients` | `organization/[resourceId]/layout.tsx`, el mismo armado | Lo mismo, y el nombre enlaza a la ficha. |
| `/account/[accountId]/organization/[resourceId]/patients/[patientId]` (nueva, D-5) | El de la organización | La ficha de hoy, con «Pacientes» de vuelta a la organización. |
| `/account/[accountId]/clinic/[clinicId]/patients/[patientId]` | El de la sede | Se ve igual. Pide la ficha con el id de la sede, y el historial deja fuera las citas de otras organizaciones. |

### Árbol de componentes

```
clinic/[clinicId]/layout.tsx  u  organization/[resourceId]/layout.tsx  (sin cambios)
└─ PatientsPage (servidor, modificada)
   ├─ h1 «Pacientes»
   ├─ p subtítulo                                      [solo con datos]
   ├─ PlanFeatureNotice plan="CONSULTORIO" (common/plan-feature-notice.tsx)   [402, sin cambios]
   └─ PatientsBrowser (cliente, nuevo)                  [con datos]
      ├─ form role="search"                             [solo si la sede u organización tiene pacientes]
      │  ├─ Label sr-only «Buscar paciente» (common/form/label.tsx)
      │  ├─ input type="search" con ícono Search o Loader2, y botón «x» (Limpiar búsqueda)
      │  └─ p role="status" (mínimo, «Buscando…», «3 pacientes encontrados»)
      ├─ ErrorState «No pudimos buscar» + Reintentar (common/error-state.tsx)   [búsqueda fallida]
      ├─ div aria-busy (opacidad 60 % mientras busca)
      │  └─ PatientsTable (patient/patients-table.tsx, modificada)
      │     └─ Table (common/table.tsx, sin cambios) con `empty`: sin pacientes o sin resultados
      │        └─ Button outline sm «Limpiar búsqueda» (ui/button.tsx)          [sin resultados]
      └─ Button outline «Ver más pacientes» / «Ver más resultados» (ui/button.tsx)  [hasMore]

clinic/…/patients/[patientId]/page.tsx  y  organization/…/patients/[patientId]/page.tsx (nueva, D-5)
└─ Link «Pacientes» › PatientHeader › PatientTabs(AppointmentHistory, RecordForm)
```

**Componente nuevo:**

- `PatientsBrowser({ resourceId: string; patientsPath: string; initialPage: PatientsPage })`.
  - Componente de cliente. Guarda el término, las filas, `nextFrom` y el estado (`idle`,
    `searching`, `loading-more`, `search-error`). Llama a `listPatientsAction` con su `resourceId`.
  - Lee `membership.resourceType` y `membership.resourceName` de `useApp()` para los textos de los
    estados vacíos (sede u organización).
  - Se justifica porque la lista ahora tiene estado en el navegador (término, páginas, carga), y
    ningún componente actual lo tiene. `PatientsTable` y `Table` siguen siendo presentacionales.
  - El campo no usa `Input` de `common/form`: ese componente no admite íconos ni botón dentro y es no
    controlado. Usa las mismas clases (`rounded-lg border border-gray-300 … focus:ring-2
    focus:ring-brand-teal/20`), con `pl-9 pr-10`, y `Label` con `sr-only`, como hace el buscador de
    `specialty-multi-select.tsx`.
  - El campo mide 40 px de alto (`h-10`), ocupa todo el ancho en el celular y `max-w-md` desde `sm`.
    El texto va en `text-base sm:text-sm`, porque con menos de 16 px iOS amplía la página al enfocar.
    Se oculta la «x» nativa de WebKit para que haya un solo botón de limpiar.

### Qué dato alimenta cada parte

| Parte | Dato |
| --- | --- |
| Primera página | `GET /patients/in/{clinicId}` (sede) o `GET /patients/in/{organizationId}` (organización), en el servidor |
| «Ver más pacientes» | `listPatientsAction({ resourceId, from: nextFrom })` → `GET /patients/in/{resourceId}` |
| Búsqueda y «Ver más resultados» | `listPatientsAction({ resourceId, search, from? })` → `POST /patients/in/{resourceId}/search` |
| Filas | `PatientListEntry`, sin cambios de forma: nombre y documento, teléfono, última visita, citas y estado, con las métricas de A-10 |
| «3 pacientes encontrados» / «Más de 20» | Largo de las filas cargadas y `hasMore` |
| Nombre de la sede en los vacíos | `useApp().membership.resourceName` |
| Ficha (sede u organización) | `GET /patients/in/{resourceId}/{patientId}`, con historial y métricas de A-10 |
| Guardar la ficha | `updatePatientRecordAction(resourceId, patientId, …)` → `PATCH /patients/in/{resourceId}/{patientId}` |

### Textos

| Dónde | Hoy | Pasa a |
| --- | --- | --- |
| Subtítulo, sede | — | «Pacientes con alguna cita en esta sede. Los nuevos aparecen primero.» |
| Subtítulo, organización | — | «Pacientes de todas las sedes. Los nuevos aparecen primero.» |
| Etiqueta del campo (oculta) | — | «Buscar paciente» |
| Placeholder | — | «Busca por nombre, DNI o teléfono» |
| Con 1 carácter | — | «Escribe al menos 2 letras o números.» |
| Buscando | — | «Buscando…» |
| Resultados | — | «1 paciente encontrado», «3 pacientes encontrados» o, con `hasMore`, «Más de 20 pacientes encontrados» |
| Sin resultados | — | «No encontramos pacientes que coincidan.», «Revisa cómo está escrito o busca por DNI o teléfono.», en la sede «Aquí solo aparecen quienes tienen alguna cita en {sede}.» y el botón «Limpiar búsqueda» |
| Búsqueda fallida | — | `ErrorState`: «No pudimos buscar», «Revisa tu conexión y vuelve a intentarlo.» y «Reintentar» |
| Botón de la lista | — | «Ver más pacientes»; en una búsqueda, «Ver más resultados»; cargando, «Cargando…» |
| «Ver más» fallido (toast) | — | «No pudimos cargar más pacientes. Vuelve a intentarlo.» |
| Sin pacientes, sede | «Todavía no hay pacientes registrados» | «Todavía no hay pacientes.» y «Aparecen aquí cuando reservan su primera cita en {sede}.» |
| Sin pacientes, organización | «Todavía no hay pacientes registrados» | «Todavía no hay pacientes.» y «Aparecen aquí cuando reservan su primera cita en cualquiera de tus sedes.» |
| Botón «x» del campo | — | `aria-label` «Limpiar búsqueda» |

El mensaje de un error del api nunca se muestra en la búsqueda: siempre el texto fijo de arriba. La
ficha no cambia de textos: su nota «Primera y última visita cuentan solo las citas atendidas…» sigue
siendo cierta.

### Estados

| Estado | Qué se ve |
| --- | --- |
| Normal, hasta 20 pacientes | Título, subtítulo, buscador vacío y la tabla. Sin botón debajo. |
| Normal, más de 20 | Lo mismo y «Ver más pacientes» debajo de la tabla, a lo ancho en el celular y a la izquierda desde `sm`. |
| Cargando más | El botón deshabilitado, con spinner y «Cargando…». La tabla sigue igual. |
| Búsqueda con 1 carácter | La lista sin cambios y «Escribe al menos 2 letras o números.» debajo del campo. |
| Buscando | El ícono de lupa pasa a spinner, debajo del campo «Buscando…», y la tabla anterior se queda al 60 % de opacidad con `aria-busy="true"` (no salta el contenido). |
| Búsqueda con resultados | «3 pacientes encontrados» y la tabla con las coincidencias. Con `hasMore`, «Más de 20 pacientes encontrados» y «Ver más resultados». |
| Búsqueda sin resultados | La caja vacía de `Table` con el texto de «Sin resultados» y «Limpiar búsqueda». La línea de estado queda solo para el lector de pantalla («Ningún paciente encontrado»). |
| Vacío (sin pacientes) | La caja vacía con «Todavía no hay pacientes.» y de dónde salen. Sin buscador: no hay nada que buscar. |
| Carga de la página | `loading.tsx` del segmento (sede u organización): `LoadingState` («Cargando...») con la barra lateral. Sin cambios. |
| Error de la página | `error.tsx` del segmento: `ErrorState` con «Reintentar». Sin cambios. |
| Ficha fuera del alcance | Un enlace a la ficha de un paciente sin citas en esa sede u organización (por ejemplo, copiado desde otra sede) recibe 404 y muestra el `error.tsx` del segmento, como hoy con un paciente que no existe. |
| Búsqueda fallida | `ErrorState` «No pudimos buscar» en lugar de la tabla, con «Reintentar» (repite la última búsqueda). El campo conserva el texto. |
| «Ver más» fallido | Toast de error (V-3). |
| 403 | Sin membership en la sede o la organización, el layout (`loadWorkspace`) lleva a «Elige dónde entrar» con `?switch=1`, como hoy. El api responde 404 a la misma situación (A-5), con la misma regla de acceso que el layout. Si quitan la membership con la página abierta, la siguiente búsqueda recibe 404 y se ve «No pudimos buscar». |
| 402 | En Gratis: `h1` «Pacientes» y `PlanFeatureNotice` «Pedir el plan Consultorio», sin subtítulo ni buscador. Igual que hoy. Si el plan baja con la página abierta, la siguiente petición recibe 402 y la página se refresca (`router.refresh()`), así que se ve el aviso. |
| Sesión vencida | Toast «Tu sesión ha expirado. Vuelve a iniciar sesión.» y `/login`, como `useFormAction`. |

### Interacciones

- **Escribir en el campo:** busca según S-3 y S-6. No hay toasts en la búsqueda.
- **Enter o «Buscar» del teclado:** busca al instante (el `form` evita el envío y no navega).
- **«x» del campo o «Limpiar búsqueda»:** S-7.
- **«Ver más pacientes» / «Ver más resultados»:** V-1 a V-3. Al terminar, el foco va al nombre del
  primer paciente nuevo.
- **Nombre del paciente:** abre la ficha (en la sede, la de hoy; en la organización, la nueva, D-5).
- **Teléfono:** enlace `tel:`, como hoy.
- **«Reintentar» de la búsqueda fallida:** repite la última búsqueda.
- **«Pacientes» en la ficha:** vuelve a la lista de su vista, sin búsqueda (D-6).

### Diferencias por rol

- **Lista y búsqueda:** ninguna. ADMIN, DOCTOR y USER ven todos los pacientes de su sede (D-8), y
  cualquier miembro de la organización ve los de todas sus sedes (D-10).
- **Historial y métricas:** ninguna. Todos ven las citas de todas las sedes de la organización,
  aunque no sean miembros de todas (D-11).
- **Ficha:** la abren todos. Los datos de salud los editan ADMIN y DOCTOR del recurso desde el que se
  abre; USER solo edita el contacto (A-9).

### Accesibilidad

- `form role="search"` con `Label` «Buscar paciente» (`sr-only`) asociado al `input type="search"`,
  con `enterKeyHint="search"`, `autoComplete="off"` y `maxLength={80}`.
- La línea debajo del campo es `role="status"` (anuncia el mínimo, «Buscando…», el número de
  resultados o «Ningún paciente encontrado»). Tras «Ver más» anuncia «Se muestran 40 pacientes».
- El ícono de lupa y el spinner llevan `aria-hidden`. El botón «x» tiene `aria-label` «Limpiar
  búsqueda» y solo aparece con texto. Al pulsarlo, el foco vuelve al campo.
- La tabla sigue siendo una `table` con `th scope="col"`. Mientras busca, su contenedor lleva
  `aria-busy="true"`.
- **Orden de tabulación:** menú lateral › campo de búsqueda › «Limpiar búsqueda» (si hay texto) ›
  en cada fila, el nombre y el teléfono › «Ver más pacientes».
- **Celular:** a 375 px no hay desplazamiento horizontal de la página: solo la tabla se desplaza
  (#125). El campo y «Ver más» miden 40 px de alto. El botón «x» tiene un área de 32 px.
- **Contraste:** los textos nuevos usan `text-brand-gray` sobre blanco (5,6:1) o sobre `gray-50`
  (5,3:1), y `text-brand-ink` en el título de la caja vacía.

## Riesgos y casos límite

| Id | Caso | Qué pasa |
| --- | --- | --- |
| r-1 | **Alcance por cuenta.** | Se corrige en este PR: qué pacientes se listan, se buscan, se abren y se editan (A-1 a A-9), y qué citas se ven de ellos (A-10). |
| r-2 | Rendimiento sin índice nuevo | Ver Prisma. Se mide con `EXPLAIN ANALYZE` en local antes de dar el PR por terminado. |
| r-3 | La búsqueda no se conserva al volver de la ficha (D-6) | Se acepta por P-1. |
| r-4 | Pacientes nuevos con la página abierta | V-4. |
| r-5 | Pacientes sin citas (la importación desde Excel, futura) | No aparecen en ninguna lista y su ficha da 404, porque el alcance se define por citas (A-4). Lo resuelve esa feature. |
| r-6 | Datos básicos en Gratis (`docs/PRODUCT.md`, futuro) | Cuando el listado llegue a Gratis, la búsqueda llega con él: nada de este plan lo impide. |
| r-7 | Orden de despliegue | El api quita las tres rutas de hoy y platform pasa a las nuevas. Entre un despliegue y el otro, la lista y la ficha de pacientes fallan, sea cual sea el orden. Se despliega el api y justo después platform. |
| r-8 | Usuario con roles distintos en dos sedes (ADMIN en A, USER en B) | Hoy puede editar datos de salud de cualquier paciente de la cuenta. Con A-9 solo los edita desde la sede A, como ya le muestra la pantalla. |
| r-9 | Paciente con citas en dos organizaciones de la misma cuenta | Aparece en la lista de las dos. Desde cada una se ven solo las citas de esa organización: su historial, sus métricas, su «Última visita» y su «Con cita próxima» cambian según desde dónde se mire (A-10). Es lo que pidió D-11. |
| r-10 | **La ficha en sí es una por cuenta.** El paciente se guarda una vez por cuenta y documento (`@@unique([accountId, documentType, documentNumber])`), con sus datos de salud (alergias, antecedentes, medicación, grupo sanguíneo) y de contacto. | D-11 separa las citas por organización, pero no la ficha: lo que se anota desde una organización se ve y se edita desde la otra, y la cabecera muestra las alergias igual en las dos. Este plan no lo cambia. Separar la ficha por organización sería otro modelo de datos (y otra migración). Se anota por si contradice la intención de D-11. **Vía concreta (security-reviewer, 26 de octubre de 2026):** un miembro de otra organización puede reservar desde el booking de su sede con el DNI del paciente; la cita lo mete en su alcance y ve y edita la ficha. Requiere conocer el DNI y deja rastro (el paciente recibe el correo de confirmación). Riesgo aceptado: sólo afecta a cuentas con varias organizaciones (plan Red); el arreglo es separar la ficha, en un ticket aparte. |
| cl-1 | Término con `%` o `_` | Se escapan y se buscan tal cual. |
| cl-2 | Término de más de 80 caracteres | El campo no deja escribir más; el api responde 400 si llega. |
| cl-3 | Respuestas fuera de orden («qui» llega después de «quis») | Se pinta solo la del último término (S-6). |
| cl-4 | Doble clic en «Ver más» | Deshabilitado mientras carga, sin filas repetidas (V-2). |
| cl-5 | El plan baja a Gratis con la página abierta | 402 y refresco: se ve el aviso del plan. |
| cl-6 | Teléfono guardado con espacios desde la ficha | Se comparan solo dígitos (S-2). |
| cl-7 | Nombre guardado sin tilde y buscado con tilde, o al revés | Se encuentra igual (S-1). |
| cl-8 | Dos pacientes con el mismo nombre | Salen los dos. El documento debajo del nombre los distingue. |
| cl-9 | A un médico le quitan la sede con la página abierta | La siguiente búsqueda o «Ver más» recibe 404: «No pudimos buscar» o el toast. Guardar la ficha recibe 404 y muestra el toast de error. Al recargar, el layout lo saca de la sede. |
| cl-10 | Un enlace a una ficha copiado desde otra sede | 404 y el `error.tsx` del segmento, aunque el paciente exista en la cuenta (A-8). |
| cl-11 | Un médico solo de la sede A abre un paciente que también tiene citas en la sede B de la misma organización | Ve también las citas de B, con la columna «Sede», aunque no sea miembro de B (D-11). |
| cl-12 | Un paciente en el alcance con todas sus citas en la organización ya canceladas | Sigue en el alcance (tiene citas) y su historial las muestra; «Primera visita» y «Última visita» quedan en «—», como hoy. |

## Fuera de alcance

- Separar la ficha del paciente (datos de salud y contacto) por organización (r-10).
- Resaltar el texto que coincide en los resultados.
- Filtros (con cita próxima, inasistencias, por sede en la organización) y ordenar por columna.
- Contar el total de pacientes.
- Cambiar la tabla a tarjetas en el celular: #125 ya la hace desplazable.
- Búsqueda global desde la barra superior o desde «Mi día».
- Exportar o importar pacientes.
- Un mensaje propio para la ficha fuera del alcance: usa el `error.tsx` de hoy.

## Verificación

### Typecheck y check

`pnpm typecheck && pnpm check` en `api` y en `platform`, limpios.

### Peticiones (api local, base de desarrollo)

Escenario: una cuenta en el plan **Clínica** (incluye 3 sedes; Consultorio solo 1) con la
organización O1 (sedes A y B) y la organización O2 (sede C). Usuarios: el ADMIN de O1, un DOCTOR solo
de la sede A, un USER solo de la sede A y un USER de la organización O1. Además, otra cuenta con su
propia sede y un paciente que también se llama «José Núñez». Pacientes:
- PA, con citas solo en A; PB, solo en B; PC, solo en C;
- PX, con una cita atendida en A, una atendida en B, una inasistencia en C y una próxima cita en C.

**Búsqueda:**
1. `POST /patients/in/{A}/search` con `{ "search": "jose nunez" }` → 200 con «José Núñez» de la
   cuenta, y nunca el de la otra cuenta.
2. `{ "search": "987 654 321" }` y `{ "search": "+51 987654321" }` → el paciente con
   `+51987654321`. `{ "search": "45.123.456" }` → el DNI 45123456.
3. `{ "search": "%" }` → 400 (menos de 2 caracteres); `{ "search": "%%" }` → `data: []`, no todos.
4. `{ "search": "q" }` → 400. Con 81 caracteres → 400.
5. Con 25 coincidencias: `limit` por defecto → 20, `hasMore: true`; con `from: nextFrom` → 5,
   `hasMore: false`.

**Alcance del listado y de la búsqueda:**
6. DOCTOR de A: `/in/{A}` → 200, con PA y PX y sin PB ni PC. `/in/{B}` → 404. `/in/{O1}` → 404
   (A-3). `/in/{sede de la otra cuenta}` → 404.
7. USER de O1: `/in/{A}` y `/in/{B}` → 200 (heredado). `/in/{O1}` → 200, con PA, PB y PX y sin PC.
   `/in/{C}` y `/in/{O2}` → 404.
8. `/in/no-es-uuid` → 400. `GET /patients` → ya no existe.

**Alcance de la ficha y de la edición:**
9. DOCTOR de A: `GET /patients/in/{A}/{PA}` → 200. `GET /patients/in/{A}/{PB}` → 404 «Patient not
   found». `GET /patients/in/{B}/{PB}` → 404 «Resource not found». Lo mismo con `PATCH`.
10. USER de O1: `GET /patients/in/{O1}/{PB}` → 200; `GET /patients/in/{O1}/{PC}` → 404.
11. `GET /patients/in/{A}/{paciente de la otra cuenta}` y `…/{uuid inexistente}` → 404 «Patient not
    found», igual que PB. `GET /patients/{PA}` y `PATCH /patients/{PA}` → ya no existen.
12. `PATCH /patients/in/{A}/{PA}` con alergias: el DOCTOR de A → 204; el USER de A → 403; el USER de
    A cambiando solo el teléfono → 204. Un usuario ADMIN en B y USER en A, desde A con alergias → 403
    (A-9).

**Historial y métricas (A-10):**
13. DOCTOR de A, `GET /patients/in/{A}/{PX}`: el historial trae las citas de A y de B (aunque no es
    miembro de B) y ninguna de C. Métricas: 2 citas totales, 2 atendidas, 0 inasistencias, sin
    próxima cita.
14. Un miembro de C, `GET /patients/in/{C}/{PX}`: solo las dos citas de C. Métricas: 2 citas, 0
    atendidas, 1 inasistencia, próxima cita la de C.
15. ADMIN de O1, `GET /patients/in/{O1}/{PX}`: igual que el caso 13.
16. En el listado, la fila de PX en `/in/{A}` y en `/in/{O1}` dice 2 citas y sin cita próxima. En
    `/in/{C}` dice 2 citas y «Con cita próxima».

**Plan, membership, logs y rendimiento:**
17. La cuenta en Gratis, con acceso → 402 en las cuatro rutas. Sin acceso → 404, no 402. Después de
    quitar la membership (borrado lógico) → 404.
18. Con un término inconfundible («Zzyzx»), revisar la salida del api: la línea de acceso dice
    `POST /patients/in/{id}/search` y el término no aparece en ninguna línea.
19. Con 5 000 pacientes sembrados en una cuenta local, `EXPLAIN ANALYZE` de la búsqueda en una sede
    y en una organización, y de la ficha: anotar los tiempos en el PR.

### Navegador, a 375 px y a 1280 px

1. Sede con 45 pacientes: 20 filas y «Ver más pacientes». Pulsarlo dos veces carga 40 y luego 45, y
   el botón desaparece. El foco queda en el primer paciente nuevo.
2. Escribir «q»: aviso del mínimo. «quis»: spinner, «Buscando…», y los resultados. Borrar: vuelve la
   primera página sin petición nueva (verlo en la pestaña de red).
3. «jose nunez» encuentra a «José Núñez». «987 654 321» encuentra por teléfono.
4. Un término sin resultados: la caja vacía con la frase de la sede y «Limpiar búsqueda».
5. Con el api apagado, buscar: «No pudimos buscar» y «Reintentar». Con el api apagado, «Ver más»:
   el toast.
6. Organización: búsqueda y «Ver más» solo con pacientes de sus sedes; el nombre abre la ficha,
   guardar la ficha funciona, y «Pacientes» vuelve a la lista de la organización.
7. Con el DOCTOR de la sede A: la lista y la búsqueda no muestran a PB, y la URL de la ficha de PB
   escrita a mano dentro de la sede A muestra el error.
8. La ficha de PX desde la sede A muestra en «Historial de citas» las citas de A y B, con su sede, y
   no la de C. Desde la sede C, solo las de C.
9. Desde la sede, editar la ficha de PA y guardar: «Ficha actualizada».
10. Una cuenta en Gratis ve el aviso del plan, sin buscador, en la lista y en la ficha. Una sede sin
    pacientes ve la caja vacía sin buscador.
11. La URL de la página nunca cambia al buscar, y el historial del navegador no guarda el término.
12. A 375 px, sin desplazamiento horizontal de la página. En iOS, enfocar el campo no amplía la
    página.

### e2e (`cd platform && pnpm test:e2e`)

Se corre la suite completa.

**Cambian en este PR:**

| Prueba | Qué cambia |
| --- | --- |
| `e2e/api/security/patients-require-membership.spec.ts` | `list`, `detail` y `update` pasan a `/patients/in/{clinicId}`, `/patients/in/{clinicId}/{patientId}` (`GET` y `PATCH`). El paciente del `workspace` se crea hoy **sin citas**: necesita una cita en la sede, o la ficha y la edición darían 404. Las memberships ADMIN, DOCTOR y USER de la prueba son de la sede, así que siguen dando 200 y 204, y 404 «Resource not found» después del borrado lógico (ahora lo responde la política). La prueba «en plan Gratis, sin membership viva responde 404 y no 402» necesita un `resourceId`: el de una sede a la que el usuario no pertenece. Se suma la ruta de búsqueda a `callRoutes`. |
| `e2e/api/doctor-treatment/doctor-display-name.spec.ts` (CA-14) | Pide la ficha a `/patients/in/{scenario.clinicId}/{managed.patientId}` en lugar de `/patients/{managed.patientId}`. El paciente tiene su única cita en esa sede, que es de la organización del alcance, así que el historial sigue con una entrada «Dra. …». |
| `e2e/ui/clinic/patients-table.spec.ts` («Reintentar» de una ficha que falló) | Después del primer error, crea el paciente con `createPatient(accountId, patientId)`, **sin citas**, y espera ver la ficha tras «Reintentar». Con A-8 seguiría en 404. Hay que crearlo con una cita en la sede (por ejemplo, con un `seedPatientWithAppointment` que acepte el id). Las otras dos pruebas del archivo no cambian. |

**No deberían cambiar** (se vuelven a correr porque tocan la lista o la ficha):

| Prueba | Por qué no cambia |
| --- | --- |
| `e2e/ui/clinic/page-titles.spec.ts` | El paciente sembrado tiene una cita en la sede, y el enlace con su nombre y los títulos de pestaña no cambian. El ADMIN accede a la sede por la organización. |
| `e2e/ui/clinic/plan-feature-notice.spec.ts` | El médico es miembro de la sede, así que pasa la política y recibe 402: título y aviso, sin buscador. En Clínica, la lista vacía cambia de texto, pero la prueba no lo comprueba. |
| `e2e/ui/clinic/clinic-space-users.spec.ts`, `e2e/ui/profile/profile-navigation.spec.ts` | Solo usan el enlace «Pacientes» del menú. |

**Pruebas nuevas,** según los criterios del product-manager:
- **Alcance:** los casos 6 a 12 y 17 de las peticiones (sede ajena de la misma cuenta, herencia desde
  la organización, miembro de sede contra la organización, otra organización de la misma cuenta,
  ficha fuera del alcance, rol de A-9, 404 antes que 402).
- **Historial y métricas con dos organizaciones:** los casos 13 a 16, con PX en A, B y C: desde A
  (sin ser miembro de B) el historial trae A y B y no C, con sus métricas; desde C, solo C; y la fila
  del listado cuenta lo mismo que la ficha.
- **UI:** la búsqueda y «Ver más».

`e2e/support/patients.ts` necesitará helpers para:
- sembrar más de 20 pacientes, y uno con tildes;
- sembrar pacientes con citas en otra sede y en otra organización, con estados distintos (atendida,
  no asistió, pendiente futura).

El escenario de dos organizaciones necesita tres sedes: la cuenta va en Clínica, o las sedes se
siembran por base, como ya hace `enablePatientRecords` con la suscripción.
`platform/e2e/README.md` se actualiza con los flujos nuevos.

### Lo verificado en este plan

Solo el mockup, en la sesión de Lavish (Node 22), con la Playwright de
`platform/node_modules/@playwright/test` contra la URL de la sesión, escuchando `pageerror` y los
errores de consola:

- cero errores en la página, el artifact y las 22 vistas;
- un solo cierre de `body`, al final del archivo;
- en la vista navegable: el aviso con 1 carácter, «Buscando…» con `aria-busy`, «quis» → 4,
  «jose nunez» → José Núñez Ccori, «987 654 321» → el teléfono +51987654321, «ar» → «Más de 20» y
  luego 22 con «Ver más resultados», «paola rios» sin resultados y «Limpiar búsqueda»;
- «Ver más pacientes» dos veces (20, 40 y 48), con el foco en el primer paciente nuevo, y el botón
  que desaparece al final;
- la ficha desde la sede y la vuelta a la lista; la falla simulada («No pudimos buscar» y
  «Reintentar»); en la organización, «quispe» → 5; Gratis sin buscador; D-5 en b sin enlaces;
- sin desplazamiento horizontal de la página a 375 px ni a 1024 px, en la vista navegable y en las
  22 vistas de la galería.

Para el inventario de «Endpoints de pacientes» revisé todos los archivos del api que leen pacientes:
`routes/patient`, `get-patients`, `get-patient-detail`, `update-patient-record`,
`get-clinic-appointments`, `get-appointment-portal`, `get-appointment-notice` y
`create-appointment`. También comprobé que `GetUserMembership` devuelve `parentOrganization` para una
sede y que el plan Clínica incluye 3 sedes.

El acotamiento no está en el mockup: no cambia ninguna pantalla. En el mockup, la ficha de un paciente
de la organización muestra citas de una sola sede, así que es compatible con D-11. Ninguno de los
flujos de las secciones anteriores se ejecutó contra la app ni contra el api.

## Criterios de aceptación

Los marcados **[e2e]** los cubre el e2e-tester con Playwright. Los **[manual]** se comprueban en el
navegador, en la salida del api o en el diff, y el **[typecheck]**, con `pnpm typecheck` y
`pnpm check`. Los marcados **[security]** los revisa además el security-reviewer: CA-24 a CA-28,
CA-34 y CA-36 a CA-52 (acceso, búsqueda y logs). Salvo que se diga otra cosa, todo se prueba con
sesión, en un plan que incluye la ficha y a 1280 px. «A 375 px» es el celular. Las peticiones al api
van con la cookie del usuario que nombra cada criterio.

Escenarios:
- **Dos organizaciones.** Una cuenta en Clínica con la organización O1 (sedes A y B) y la
  organización O2 (sede C).
  - Usuarios, con membership directa:
    - ADMIN de O1, DOCTOR de O1 y USER de O1, sin membership en ninguna sede;
    - DOCTOR de A y USER de A, solo en la sede A;
    - DOCTOR de C, solo en la sede C, y un miembro de O2;
    - Mixto: ADMIN en la sede B y USER en la sede A.
  - Pacientes:
    - PA, con una cita solo en A, con un médico de A que no es el DOCTOR de A;
    - PB, con citas solo en B; PC, con citas solo en C;
    - PX, con una cita atendida en A, una atendida en B, una «no asistió» en C y una pendiente
      futura en C.
- **Otra cuenta**, con su sede y un paciente «José Núñez Ccori» con el mismo DNI y el mismo teléfono
  que P3 de Búsqueda.
- **Búsqueda.** Una sede con, entre otros:
  - P1 «Ana María Quispe Rojas», DNI 45123456, teléfono +51987654321;
  - P2 «Luis Quispe Huamán», con un teléfono que no contiene 9876;
  - P3 «José Núñez Ccori», guardado con tildes y «ñ»;
  - P4 «Martin Garcia», guardado sin tildes;
  - P5, con pasaporte AB123456;
  - P6, con el teléfono editado desde la ficha como «+51 966 111 222»;
  - P7, con un correo que contiene «zafiro», palabra que no está en ningún otro campo de nadie.

  Ningún paciente tiene `%`, `_` ni `\` en sus datos.
- **Lista larga.** Una sede con 45 pacientes, cada uno con una cita en ella, dados de alta en un
  orden conocido.
- **Coincidencias.** Una sede con 25 pacientes cuyo apellido contiene «Ramos» y otros que no.

### Lista y «Ver más» (V-1 a V-4, D-2, D-3)

- **CA-1. [e2e]** Lista larga: la página muestra el `h1` «Pacientes», el subtítulo «Pacientes con alguna cita en esta sede. Los nuevos aparecen primero.», el buscador vacío y 20 filas: los 20 pacientes dados de alta más recientemente, del más nuevo al más antiguo. Debajo de la tabla, «Ver más pacientes».
- **CA-2. [e2e]** «Ver más pacientes» agrega 20 filas debajo, sin cambiar ni reordenar las 20 primeras. Al pulsarlo otra vez quedan 45 y el botón desaparece. Al final están los 45, cada uno una sola vez, del más nuevo al más antiguo. Con exactamente 20 pacientes, o menos, no hay botón.
- **CA-3. [e2e]** Un doble clic en «Ver más pacientes» carga una sola página: quedan 40 filas, sin repetidas (cl-4).
- **CA-4. [manual]** Con la red lenta, mientras carga, el botón está deshabilitado, con spinner y «Cargando…», y la tabla no se mueve.
- **CA-5. [e2e]** Al terminar de cargar, el foco queda en el enlace con el nombre del primer paciente nuevo (la fila 21), y la línea de estado (`role="status"`) dice «Se muestran 40 pacientes».
- **CA-6. [e2e]** Si «Ver más» falla, sale el toast «No pudimos cargar más pacientes. Vuelve a intentarlo.», las filas cargadas se quedan y el botón sigue habilitado. El e2e lo provoca con un borrado lógico de la membership del usuario con la página abierta (cl-9).
- **CA-7. [e2e]** Un paciente que reserva su primera cita con la página abierta no aparece al pulsar «Ver más» y no repite a nadie. Al recargar, es la primera fila (V-4).

### Búsqueda: qué encuentra (S-1 a S-3, D-1, D-4)

- **CA-8. [e2e]** Se busca por nombre, apellido, número de documento y teléfono, en cualquier parte del campo. En Búsqueda:
  - «quispe» e «ispe» → P1 y P2;
  - «ana maría» → P1;
  - «45123456» → P1, por el DNI;
  - «987654321» → P1, por el teléfono;
  - «ab12» → P5, por parte del pasaporte.
- **CA-9. [e2e]** Sin distinguir mayúsculas ni tildes, y la «ñ» vale como «n»: «jose nunez», «JOSE NUNEZ» y «José Núñez» → P3. «martín garcía» → P4, guardado sin tildes (cl-7).
- **CA-10. [e2e]** Con varias palabras, cada una tiene que aparecer, en cualquier orden y en cualquiera de los cuatro campos:
  - «ana quis» y «quis ana» → P1;
  - «quispe 9876» → P1 y no P2;
  - «ana zzz» → sin resultados.
- **CA-11. [e2e]** Números con separadores (S-2):
  - «987 654 321», «987-654-321», «(987) 654-321» y «+51 987654321» → P1;
  - «45.123.456» → P1, por el DNI;
  - «966111222» → P6, cuyo teléfono se guardó con espacios (cl-6).
- **CA-12. [e2e]** El correo no se busca (D-1): «zafiro» → sin resultados, aunque está en el correo de P7.
- **CA-13. [e2e]** Mínimo de 2 caracteres sin contar espacios (S-3). Con «q», o con «q» entre espacios, la tabla no cambia, no sale ninguna búsqueda y debajo del campo se lee «Escribe al menos 2 letras o números.». Con «qu» busca. El api responde 400 a `{ "search": "q" }` y a `{ "search": "  q  " }`.
- **CA-14. [e2e]** Máximo de 80 caracteres: el campo no deja escribir el 81 y el api responde 400 a un término de 81 (cl-2).
- **CA-15. [e2e]** `%`, `_` y `\` se buscan tal cual: `%%`, `__` y `\\` → sin resultados, nunca todos los pacientes (cl-1).
- **CA-16. [e2e]** Sin resultados: la caja vacía con «No encontramos pacientes que coincidan.», «Revisa cómo está escrito o busca por DNI o teléfono.» y el botón «Limpiar búsqueda», sin «Ver más». En la sede se suma «Aquí solo aparecen quienes tienen alguna cita en {sede}.»; en la organización, esa frase no aparece. La línea de estado dice «Ningún paciente encontrado», solo para el lector de pantalla.

### Búsqueda: resultados, carga y error (S-5 a S-8, D-6)

- **CA-17. [e2e]** Debajo del campo, el número de resultados: «José Núñez» → «1 paciente encontrado»; «quispe» → «2 pacientes encontrados». En Coincidencias, «ramos» → «Más de 20 pacientes encontrados», 20 filas del más nuevo al más antiguo y «Ver más resultados». Al pulsarlo se agregan las 5 restantes, todas con «Ramos», el botón desaparece y la línea dice «25 pacientes encontrados».
- **CA-18. [e2e]** Busca mientras se escribe, sin pulsar nada. Enter busca al instante. Ninguno de los dos recarga la página ni navega.
- **CA-19. [manual]** Con la red lenta, mientras busca, la lupa pasa a spinner, debajo del campo se lee «Buscando…» y la tabla anterior queda atenuada, con `aria-busy="true"` y sin saltos. Al escribir «quis» de corrido, solo se pintan los resultados de «quis», aunque la respuesta de «qu» llegue después (S-6, cl-3).
- **CA-20. [e2e]** La «x» del campo (`aria-label` «Limpiar búsqueda», visible solo con texto), borrar todo el texto y el botón «Limpiar búsqueda» de la caja sin resultados hacen lo mismo (S-7):
  - vuelven las 20 filas de la lista sin búsqueda;
  - no sale ninguna petición nueva;
  - el foco queda en el campo.
- **CA-21. [e2e]** Búsqueda fallida: en lugar de la tabla, «No pudimos buscar», «Revisa tu conexión y vuelve a intentarlo.» y «Reintentar», sin toast y sin el mensaje del api. El campo conserva el término. El e2e lo provoca con un borrado lógico de la membership con la página abierta. Tras restaurarla, «Reintentar» repite la misma búsqueda y muestra sus resultados.
- **CA-22. [manual]** Con el api apagado, buscar muestra «No pudimos buscar» y «Ver más» muestra el toast de CA-6. Al encenderlo, «Reintentar» y «Ver más» funcionan.
- **CA-23. [e2e]** Al volver de la ficha, la búsqueda empieza vacía (S-8, D-6). Se busca, se abre un resultado y se vuelve, una vez con el enlace «Pacientes» y otra con el botón atrás del navegador. En los dos casos el campo está vacío y se ve la lista sin búsqueda.

### Privacidad del término (P-1 a P-4)

- **CA-24. [e2e] [security]** Al buscar, al pulsar «Ver más resultados» y al limpiar, la URL de la página no cambia (sin `?q=` ni el término), `history.length` no crece y el título de la pestaña sigue en «Pacientes · WizyDoc».
- **CA-25. [e2e] [security]** Ninguna petición que sale del navegador durante una búsqueda lleva el término en su URL: solo va en el cuerpo de un `POST`. El api no busca por query: `GET /patients/in/{A}?search=quispe` no filtra.
- **CA-26. [e2e] [security]** El campo es `type="search"`, con `autocomplete="off"`, `enterkeyhint="search"` y `maxlength="80"` (P-4).
- **CA-27. [manual] [security]** Con un término inconfundible («Zzyzx»), en la salida local del api y de Next, la línea de acceso dice `POST /patients/in/{id}/search` y el término no aparece en ninguna línea. Tampoco cuando la búsqueda responde 400 (81 caracteres) o 404 (sin membership) (P-1, P-3).
- **CA-28. [manual] [security]** En el diff no hay logs nuevos con el término, el nombre, el documento, el teléfono ni la respuesta de la búsqueda. El SQL de la búsqueda va con parámetros (`Prisma.sql` o `$queryRaw` en plantilla), nunca con `$queryRawUnsafe`.

### Vista de organización (D-5, O-1 a O-3)

- **CA-29. [e2e]** El ADMIN de O1 abre «Pacientes» de O1: subtítulo «Pacientes de todas las sedes. Los nuevos aparecen primero.», buscador y la lista con PA, PB y PX, sin PC. Buscar PB lo encuentra; buscar PC, no. Con más de 20 pacientes en sus sedes aparece «Ver más pacientes», como en la sede.
- **CA-30. [e2e]** En la organización, el nombre de cada paciente enlaza a `/account/{accountId}/organization/{O1}/patients/{patientId}`. Esa ficha muestra la cabecera del paciente, «Historial de citas» y «Ficha», con el título de pestaña «Ficha del paciente · WizyDoc». «Pacientes» vuelve a la lista de O1, no a una sede.
- **CA-31. [e2e]** Desde la ficha de la organización, el ADMIN de O1 edita las alergias y el teléfono de PA y guarda: «Ficha actualizada», y el cambio se ve al abrir la ficha de PA desde la sede A.
- **CA-32. [e2e]** Sin pacientes no hay buscador:
  - en una sede: «Todavía no hay pacientes.» y «Aparecen aquí cuando reservan su primera cita en {sede}.»;
  - en una organización: «Todavía no hay pacientes.» y «Aparecen aquí cuando reservan su primera cita en cualquiera de tus sedes.».

### Plan Gratis (402)

- **CA-33. [e2e]** Una cuenta en Gratis ve, en la lista de la sede y en la de la organización, el `h1` «Pacientes» y «Pedir el plan Consultorio», sin subtítulo, buscador, tabla ni «Ver más». Las dos fichas (sede y organización) muestran el aviso del plan, como hoy.
- **CA-34. [e2e] [security]** En Gratis, con acceso, las cuatro rutas responden 402. Sin acceso responden 404 «Resource not found», nunca 402.
- **CA-35. [e2e]** Si la cuenta baja a Gratis con la lista abierta, la siguiente búsqueda o «Ver más» lleva al aviso del plan, no a «No pudimos buscar» ni al toast (cl-5).

### Acceso (D-7 a D-10, A-1 a A-8)

- **CA-36. [e2e] [security]** En la sede, cualquier rol ve lo mismo (D-8). ADMIN, DOCTOR y USER de A ven en la lista de A, y en `GET /patients/in/{A}`, a PA y a PX, y nunca a PB ni a PC. El DOCTOR de A ve a PA aunque su cita sea con otro médico. Buscar PB o PC desde A no los encuentra.
- **CA-37. [e2e] [security]** Cualquier rol de la organización hereda el acceso a sus sedes (D-10). ADMIN, DOCTOR y USER de O1, sin membership en ninguna sede, reciben 200 en `/in/{A}` (PA y PX), `/in/{B}` (PB y PX) y `/in/{O1}` (PA, PB y PX), y 404 en `/in/{C}` y `/in/{O2}`. En el panel, el USER de O1 abre la lista de B y la de O1.
- **CA-38. [e2e] [security]** Ser miembro de una sede no da acceso a sus hermanas ni a su organización (A-3). DOCTOR y USER de A reciben 404 en `/in/{B}` y en `/in/{O1}`. En el panel, la URL de pacientes de B escrita a mano lleva a «Elige dónde entrar»; la de O1, con la cookie en A, muestra la pantalla de error del segmento, sin datos de pacientes, porque el layout de organización todavía valida el recurso de la cookie y no el de la URL (se corrige en un fix aparte; ajustado el 26 de octubre de 2026 por el review).
- **CA-39. [e2e] [security]** Nada de otra organización de la misma cuenta. El DOCTOR de C ve solo a PC y a PX, y recibe 404 en `/in/{A}`, `/in/{B}` y `/in/{O1}`. La lista de O1 nunca muestra a PC, y la de O2 nunca muestra a PA ni a PB. Buscar PA desde C o desde O2 no lo encuentra.
- **CA-40. [e2e] [security]** Nada de otra cuenta. Su sede responde 404 «Resource not found» a cualquier usuario de la cuenta principal. Buscar el DNI o el teléfono que comparten los dos «José Núñez Ccori» devuelve solo P3, en la sede y en la organización.
- **CA-41. [e2e] [security]** Lo que no se ve responde igual (A-5). Una sede o una organización de otra cuenta, un uuid que no existe y una sede de la misma cuenta sin acceso dan el mismo 404 con el mismo cuerpo «Resource not found», en las cuatro rutas. Un `resourceId` que no es uuid da 400.
- **CA-42. [e2e] [security]** Ficha y edición (D-9, A-8), con `GET` y con `PATCH`:
  - DOCTOR de A: `/in/{A}/{PA}` → 200 o 204; `/in/{A}/{PB}` → 404 «Patient not found»; `/in/{B}/{PB}` → 404 «Resource not found»;
  - `/in/{A}/{paciente de la otra cuenta}` y `/in/{A}/{uuid que no existe}` → el mismo 404 «Patient not found» que PB;
  - USER de O1: `/in/{O1}/{PB}` → 200; `/in/{O1}/{PC}` → 404 «Patient not found»;
  - un `PATCH` que responde 404 no cambia nada en la base.
- **CA-43. [e2e] [security]** En el panel, el DOCTOR de A abre a mano `/clinic/{A}/patients/{PB}` y ve la pantalla de error del segmento («Algo salió mal» y «Reintentar»). El HTML no contiene el nombre, el documento ni el teléfono de PB. Lo mismo para el ADMIN de O1 con `/organization/{O1}/patients/{PC}` (cl-10).
- **CA-44. [e2e] [security]** Tras el borrado lógico de la membership, las cuatro rutas responden 404 «Resource not found». En el panel, con la ficha abierta, guardar muestra un toast de error y la base no cambia (cl-9).
- **CA-45. [e2e] [security]** `GET /patients`, `GET /patients/{PA}` y `PATCH /patients/{PA}` ya no existen: no responden 2xx ni devuelven datos de pacientes (A-7).
- **CA-46. [manual] [security]** En el diff:
  - las cuatro rutas llevan `policy({ account, confirmed, onboarded, member })` y `requireFeature("PATIENT_RECORD")`;
  - toda consulta filtra por el `accountId` de la sesión y por el alcance;
  - el alcance, la organización y el rol salen de `requireMembership(request)`, nunca del cuerpo ni de la query;
  - las server actions reenvían `resourceId`, `patientId`, `search` y `from` al api sin ampliar nada;
  - `policy.ts`, `auth.ts` y `entitlements.ts` no cambian.

### Historial y métricas por organización (D-11, A-10)

- **CA-47. [e2e] [security]** El DOCTOR de A abre la ficha de PX desde A. «Historial de citas» trae las citas de A y de B, cada una con su sede, aunque no es miembro de B, y ninguna de C. Métricas: «Citas totales» 2, «Atendidas» 2, «Inasistencias» 0 y «Próxima cita» sin fecha.
- **CA-48. [e2e] [security]** El DOCTOR de C abre la misma ficha desde C. Ve solo las dos citas de C, sin el nombre de A, de B ni de sus médicos. Métricas: «Citas totales» 2, «Atendidas» 0, «Inasistencia» 1 y «Próxima cita» con la fecha de la cita pendiente de C.
- **CA-49. [e2e] [security]** El ADMIN de O1 abre la ficha de PX desde O1 y ve lo mismo que en CA-47.
- **CA-50. [e2e] [security]** La fila de PX, en la lista y en los resultados de búsqueda, cuenta las mismas citas que la ficha abierta desde el mismo lugar:
  - en A y en O1: «Citas» 2, «Última visita» con la fecha de la cita atendida más reciente entre A y B, y «Sin cita próxima»;
  - en C: «Citas» 2, «Última visita» «—» y «Con cita próxima».

### Quién edita los datos de salud (A-9, O-3)

- **CA-51. [e2e] [security]** `PATCH /patients/in/{A}/{PA}` con alergias:
  - DOCTOR de A, ADMIN de O1 y DOCTOR de O1 → 204;
  - USER de A y USER de O1 → 403 «Solo el personal sanitario puede editar los datos de salud», y las alergias no cambian en la base;
  - USER de A cambiando solo el teléfono → 204.
- **CA-52. [e2e] [security]** El rol es el de la membership del recurso desde el que se abre la ficha (r-8). Mixto, con alergias: `PATCH /patients/in/{A}/{PX}` → 403 y la base sin cambios; `PATCH /patients/in/{B}/{PX}` → 204.
- **CA-53. [e2e]** La pantalla usa la misma regla:
  - Mixto, en la ficha de PX desde A, ve «Datos de salud» en solo lectura, edita el teléfono y guarda;
  - Mixto, desde B, edita los datos de salud y guarda;
  - en la ficha de la organización, el USER de O1 ve los datos de salud en solo lectura y el DOCTOR de O1 los edita.

### Celular (375 px)

- **CA-54. [e2e]** A 375 px la página no se desplaza en horizontal, ni en la lista de la sede ni en la de la organización, en ninguno de estos estados: normal, aviso del mínimo, con resultados, sin resultados, búsqueda fallida, con 40 filas tras «Ver más» y sin pacientes. Tampoco en la ficha nueva de la organización.
- **CA-55. [e2e]** A 375 px el buscador está arriba de la tabla y se ve sin desplazarse. Ocupa el ancho del contenido, mide 40 px de alto y su texto mide 16 px o más, para que iOS no amplíe la página al enfocarlo. La «x» mide al menos 32 × 32 px. «Ver más pacientes» ocupa todo el ancho y mide 40 px de alto.
- **CA-56. [manual]** En un iPhone o en el simulador de iOS, al enfocar el campo la página no se amplía, el teclado muestra «Buscar» y hay una sola «x». Desde `sm`, el campo mide hasta 448 px y «Ver más» va a la izquierda, con su ancho, como en el mockup.

### Accesibilidad

- **CA-57. [e2e]** El campo es un `searchbox` con el nombre accesible «Buscar paciente», dentro de un `role="search"`, con el placeholder «Busca por nombre, DNI o teléfono». La línea de estado (`role="status"`) anuncia el mínimo, el número de resultados y «Ningún paciente encontrado».
- **CA-58. [manual]** El orden de tabulación es el del plan (menú, campo, «Limpiar búsqueda», nombre y teléfono de cada fila, «Ver más»). La lupa y el spinner llevan `aria-hidden`. A 375 px y a 1280 px se ve como el mockup aprobado.

### Regresiones

- **CA-59. [e2e]** #125: a 375 px la tabla se desplaza en horizontal y la columna «Estado» es alcanzable sin que la página se desplace. La prueba de hoy pasa sin cambiar sus expectativas, y lo mismo vale con resultados de búsqueda y con 40 filas.
- **CA-60. [e2e]** El teléfono es un enlace `tel:` en la lista, en los resultados de búsqueda y en las filas que trae «Ver más».
- **CA-61. [e2e]** Títulos de pestaña: «Pacientes · WizyDoc» en las dos listas y «Ficha del paciente · WizyDoc» en las dos fichas, sin el nombre del paciente ni el término buscado. `e2e/ui/clinic/page-titles.spec.ts` pasa sin cambiar sus expectativas.
- **CA-62. [e2e]** Desde la sede, el DOCTOR de A edita la ficha de PA y guarda: «Ficha actualizada», y el cambio sigue al recargar.
- **CA-63. [e2e]** Pasa la suite completa. Las pruebas de la tabla siguiente se adaptan al comportamiento nuevo, no se borran, y cada una sigue comprobando lo que comprobaba.
- **CA-64. [manual]** `platform/e2e/README.md` describe los flujos nuevos: búsqueda, «Ver más», alcance e historial por organización.

### Calidad

- **CA-65. [typecheck]** `pnpm typecheck` y `pnpm check` limpios en `api` y en `platform`.
- **CA-66. [manual]** El PR anota los tiempos de `EXPLAIN ANALYZE` de la búsqueda en una sede y en una organización, y de la ficha, con 5 000 pacientes sembrados en local (r-2). No hay migración nueva.

### e2e que cambian

| Prueba | Hoy | Pasa a | Criterios |
| --- | --- | --- | --- |
| `e2e/api/security/patients-require-membership.spec.ts` | Llama a `GET /patients` y a `GET` y `PATCH /patients/{id}`, con un paciente sin citas. «En plan Gratis, sin membership viva…» llama a `GET /patients`. | Usa las rutas nuevas con el `clinicId` del workspace, y el paciente tiene una cita en esa sede. Suma la búsqueda a `callRoutes`. ADMIN, DOCTOR y USER siguen con 200 y 204, y con 404 «Resource not found» tras el borrado lógico. La prueba de Gratis usa una sede a la que el usuario no pertenece y sigue esperando 404, no 402. | CA-34, CA-44 |
| `e2e/api/doctor-treatment/doctor-display-name.spec.ts` (CA-14 de su plan) | Pide `/patients/{patientId}`. | Pide `/patients/in/{clinicId}/{patientId}`. El historial sigue con una entrada «Dra. …». | CA-42, CA-47 |
| `e2e/ui/clinic/patients-table.spec.ts`, «Reintentar de una ficha que falló» | Tras el error, crea el paciente sin citas. | Lo crea con una cita en la sede. Tras «Reintentar» se ve la ficha. | CA-42 |
| `e2e/ui/clinic/patients-table.spec.ts`, las otras dos | — | Sin cambios. | CA-59, CA-60 |
| `e2e/ui/clinic/page-titles.spec.ts` | — | Sin cambios. | CA-61 |
| `e2e/ui/clinic/plan-feature-notice.spec.ts` | — | Sin cambios. | CA-33 |
| `e2e/ui/clinic/clinic-space-users.spec.ts`, `e2e/ui/profile/profile-navigation.spec.ts` | — | Sin cambios. | CA-63 |
