# Ficha de paciente e historial de citas — vertical de clínica

> Estado: **implementado** (fases 1 a 4). Pendiente de probar en navegador con
> sesión iniciada; el resto está verificado contra la base y el API en marcha.

## Contexto

Hoy el paciente solo existe como subproducto de una reserva: el booking público
lo crea con nombre, documento, teléfono y correo, y nadie vuelve a tocarlo nunca.
No hay pantalla donde verlo, ni forma de saber cuántas veces ha venido, ni dónde
anotar que es alérgico a la penicilina.

La propuesta resuelve eso sin inventar tablas nuevas: el historial sale entero de
`Appointment` y la ficha son columnas en `Patient`. La narrativa clínica —notas
de consulta, diagnósticos, evolución— queda fuera a propósito, porque exige
append-only, auditoría de accesos y retención.

Esta tanda entrega el **vertical de clínica completo**: migración, backend y la
pantalla de detalle con historial, ficha y edición. El listado enriquecido de
organización y la búsqueda global quedan para después.

## Decisiones tomadas


| Decisión                       | Elegido                                                |
| ------------------------------ | ------------------------------------------------------ |
| Alcance                        | Vertical de clínica de punta a punta                   |
| Reserva con documento repetido | Reutiliza el paciente y refresca solo teléfono y email |
| Permisos de ficha              | ADMIN y DOCTOR editan todo; USER solo contacto         |


---

## Fase 1 — Modelo y migración

`**api/prisma/schema.prisma`** — columnas nuevas en `Patient`:

- Identificación y contacto: `sex`, `emergencyContact`, `insurer`
- Salud: `bloodType`, `allergies String[]`, `background`, `medications`
- `allergiesReviewedAt DateTime?` — distingue «nadie preguntó» de «no tiene
alergias». Sin esto una lista vacía significa dos cosas a la vez.
- Autoría: `updatedBy String? @db.Uuid`, y `updatedAt` pasa de
`@default(now())` a `@updatedAt` para que registre las ediciones de verdad.
- `@@unique([accountId, documentType, documentNumber])`
- `birthDate`: **se queda en `String?`**. Se descartó migrarlo a `DateTime? @db.Date`
por lo que se explica abajo; en su lugar la validación de entrada pasó a
`z.iso.date()`, que era el agujero real.

`**Appointment`**: añadir `@@index([patientId, scheduledAt])`. Comprobado contra
`pg_indexes`, hoy la tabla solo tiene tres índices —`btree(id)`,
`btree(scheduled_at)` y `btree(doctor_profile_id, scheduled_at)`— y **ninguno
incluye `patient_id`**: Postgres no indexa las claves ajenas por su cuenta. La
consulta del historial (`WHERE patient_id = $1 ORDER BY scheduled_at DESC`) sale
hoy como `Seq Scan` + `Sort`, así que cada ficha abierta recorrería la tabla de
citas entera y ordenaría después. Con el índice compuesto es un recorrido de
rango sobre las filas de ese paciente, ya en orden, y desaparece también el
`Sort`. Es preventivo: con las 1 cita del dev local no se nota nada.

El cambio de tipo de `birthDate` toca 6 sitios ya localizados: la validación
regex en `api/src/application/use-cases/appointment/create-appointment.usecase.ts`,
el mapeo en `api/src/application/use-cases/patient/get-patients.usecase.ts`,
`platform/src/app/clinic/[clinicId]/create-appointment/booking-wizard.tsx`,
`platform/src/app/clinic/[clinicId]/create-appointment/steps/patient-step.tsx`,
`platform/src/components/patient/patients-table.tsx` y
`platform/src/lib/api/patients/types.ts`.

**Ojo: `@db.Date` no elimina la trampa de huso, la muda.** Prisma devuelve un
`Date` de JS a medianoche UTC, así que `1992-06-12` formateado en Lima (UTC-5)
se pinta como `11/6/1992`. El tipo protege la columna, no el renderizado: habría
que formatear en UTC explícitamente en todos los consumidores. El `String?`
actual esquiva eso por completo, que es lo que hace hoy `formatBirthDate`
partiendo la cadena.

Lo que sí gana el tipo `date` es integridad: hoy la columna es `text` y la única
validación es la regex de `create-appointment.usecase.ts`, que acepta
`9999-99-99` y `0000-00-00`. Ese agujero se tapa más barato con `z.iso.date()`,
que valida fechas reales y no solo la forma.

**Por qué la migración se toca a mano.** Postgres no convierte `text` a `date`
solo: un `ALTER COLUMN … TYPE date` a secas falla con *column cannot be cast
automatically*. Prisma, al generar la migración, resuelve ese caso de la peor
forma posible —`DROP COLUMN` + `ADD COLUMN`—, que aplica sin error y borra todas
las fechas de nacimiento por el camino.

El flujo es generar sin aplicar y editar el SQL antes:

```bash
npx prisma migrate dev --create-only   # escribe el .sql, no lo ejecuta
# sustituir el DROP/ADD de birth_date por:
#   ALTER TABLE "patient"
#     ALTER COLUMN "birth_date" TYPE DATE USING "birth_date"::date;
npx prisma migrate dev                 # ahora sí lo aplica
```

El `USING` es la expresión con la que Postgres rellena la columna nueva a partir
de la vieja, fila a fila. Funciona porque los valores guardados son `YYYY-MM-DD`,
que es ISO y no admite ambigüedad; si alguno fuese `12/06/1992`, el cast
dependería del `DateStyle` de la sesión y podría leer el día como mes sin avisar.
De ahí que en Riesgos se compruebe el formato antes de migrar producción.

## Fase 2 — El flujo de reserva deja de duplicar pacientes

`create-appointment.usecase.ts` hace `patient.create` en **cada** reserva. Con el
`@@unique` de la fase 1, la segunda cita del mismo documento reventaría con
violación de constraint, tirando el booking público.

Pasa a buscar por `(accountId, documentType, documentNumber)`:

- Si no existe → se crea como hoy.
- Si existe → se reutiliza y se actualizan **solo** `phone` y `email`. Nombre,
documento, fecha de nacimiento y todos los datos de salud se dejan intactos:
la ficha la mantiene el personal sanitario y no la pisa lo que un paciente
escriba en un formulario público.

Hacerlo dentro de la transacción que ya envuelve el caso de uso.

## Fase 3 — Backend

`patients` es su propio dominio y se queda en `api/src/routes/patient/index.ts`,
con el prefijo `/patients` que ya tiene. Nada cuelga de `/clinic/:resourceId/…`:
colgar el padrón de cada tipo de recurso obligaría a mantener el mismo listado
duplicado. El alcance sale del token, como ya hace `GET /patients` inyectando el
`accountId` de la sesión.

Política en las tres rutas:
`policy({ account: true, confirmed: true, onboarded: true })`.

Esto tiene una consecuencia que conviene tener delante: sin `:resourceId` en la
ruta, `member`/`roles` no se pueden usar —es la limitación que ya nos costó un
500—, así que **el aislamiento entre cuentas deja de ser cosa de la política y
pasa a serlo de cada consulta**. La regla que no se puede saltar: nunca
`findUnique({ where: { id } })` sobre un paciente, siempre
`findFirst({ where: { id, accountId } })`, y 404 si no aparece, para no revelar
qué pacientes existen en otras cuentas.

### `GET /patients`

Ya existe con paginación por cursor. Se le añaden por fila: última visita, total
de citas y estado (`Con cita próxima`, `Sin citas`, `N inasistencias`).

Para la vista de sede, un `clinicId` **opcional en el querystring** que filtra a
los pacientes con al menos una cita en esa clínica. Query param y no segmento de
ruta: mismo endpoint y mismo handler, distinto alcance. El use case comprueba que
la clínica pertenezca a la cuenta del token antes de filtrar por ella.

### `GET /patients/:patientId`

Ficha + historial + métricas en una respuesta:

- Historial: citas del paciente **en toda la cuenta**, no solo en esa sede, con
fecha, `clinic.name`, nombre del profesional (`doctorProfile.user`),
`appointment.specialty` (ya está denormalizado como string) y estado.
- Métricas: total, completadas, inasistencias (`NO_SHOW`), primera y última
visita —contando solo `COMPLETED`, porque una cita cancelada no es una visita—
y próxima cita futura en `PENDING`/`CONFIRMED`.

Nuevos ficheros en `api/src/application/queries/patient/`, siguiendo el patrón de
`api/src/application/queries/doctor-profile/get-doctor-slots.query.ts`.

### `PATCH /patients/:patientId`

El reparto por rol no puede salir de `policy()`, y no solo por la ruta: un mismo
usuario puede ser ADMIN en una sede y USER en otra, así que a nivel de cuenta no
existe «el rol» a secas.

Se resuelve dentro del use case con una consulta a `user_resource_membership`,
que ya lleva su propio `accountId`: si el usuario tiene alguna membership viva
(`deletedAt: null`) con rol ADMIN o DOCTOR en la cuenta, puede editar datos de
salud; si no, solo contacto. Al guardar escribe `updatedBy` con el `userId` de la
sesión.

Marcar la casilla «sin alergias conocidas» sella `allergiesReviewedAt`; añadir
una alergia también, porque preguntar es lo que se está registrando.

## Fase 4 — Frontend

`**platform/src/lib/api/patients/`** — extender `types.ts` con `PatientRecord`,
`AppointmentHistoryEntry` y `PatientMetrics`; `getAccountPatients` pasa a aceptar
un `clinicId` opcional y se añade `getPatientDetail(patientId)`.

`**platform/src/lib/actions/patient/update-patient-record.action.ts`** — server
action con el patrón ya establecido en
`platform/src/lib/actions/specialty/update-specialty.action.ts`: valida con Zod,
devuelve `ActionState`, `revalidateTag` al terminar.

`**platform/src/app/account/[accountId]/clinic/[clinicId]/patients/page.tsx**` —
sustituye el listado account-scoped actual por el de sede, con las columnas de la
propuesta.

`**platform/src/app/account/[accountId]/clinic/[clinicId]/patients/[patientId]/page.tsx**`
— nueva. Server component que trae el detalle y lo reparte en componentes de
`platform/src/components/patient/`:

- `patient-header.tsx` — avatar, nombre, documento, contacto y los chips. **La
alergia va aquí, no dentro de una pestaña**: un dato de seguridad que hay que
abrir para encontrar no cumple su función.
- `appointment-history.tsx` — franja de métricas + tabla, sobre el `Table` común
de `platform/src/components/common/table.tsx`.
- `record-form.tsx` — la ficha en modo lectura/edición con `useFormAction`
(`platform/src/hooks/useFormAction.ts`), que ya estandariza toasts y
`fieldErrors`.
- `allergies-input.tsx` — etiquetas que se añaden y quitan, no un campo libre. Un
texto suelto acaba en «penicilina y creo que algún antiinflamatorio», que no se
puede consultar ni mostrar como alerta.

El botón de editar solo se pinta para ADMIN/DOCTOR, leyendo `useApp()` como ya
hace `platform/src/components/specialty/top-header.tsx`. El backend vuelve a
comprobarlo: el ocultar es cosmético.

---

## Fuera de alcance

- Listado de organización enriquecido (sedes, búsqueda global, filtro por sede)
- Notas de consulta, diagnósticos y evolución
- Auditoría de accesos y retención

## Riesgos

**El `@@unique` puede fallar en producción.** En el dev local no hay duplicados
(1 paciente, 1 cita), pero producción lleva meses creando un paciente por
reserva. Antes de migrar allí hay que contar duplicados por
`(account_id, document_type, document_number)` y decidir fusión; si los hay, la
migración no aplica.

**El cast de `birth_date` asume ISO.** En local las filas son nulas o
`YYYY-MM-DD`, así que `::date` pasa limpio. En producción conviene comprobarlo
antes con el mismo regex.

**Borrado en cascada.** `Patient.account` es `onDelete: NoAction` y conviene que
siga así: una historia se conserva años y eso choca con eliminar una cuenta.

**Ley 29733.** Guardar grupo sanguíneo y alergias ya es tratar datos de salud,
estén en la tabla que estén. Lo que aplazar las notas evita es el volumen de
obligaciones, no la categoría del dato.

## Verificación

1. `npx prisma migrate dev` contra el Postgres local
  (`localhost:5432/wizydoc`, comprobado accesible) y `npx prisma generate`.
2. `npx tsc --noEmit` en `api/` y `npm run typecheck` + `npm run build` en
  `platform/`. Ojo: el shell trae Node 16 y Next exige ≥18; usar Node 22 vía
   nvm.
3. Sembrar dos o tres pacientes con citas en varios estados y sedes, para que la
  franja de métricas tenga algo que contar.
4. Reservar dos veces con el mismo documento desde el booking público y comprobar
  que se enlaza al mismo paciente, que el teléfono se actualiza y que los datos
   de salud no se tocan.
5. Abrir el detalle con un usuario ADMIN y con uno USER: el segundo no debe poder
  guardar alergias ni antecedentes, ni siquiera forzando el `PATCH`.

