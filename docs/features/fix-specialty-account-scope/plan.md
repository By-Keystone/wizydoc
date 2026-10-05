# fix-specialty-account-scope

## Objetivo

Que ninguna escritura ni conexión de especialidades salga de la organización
cuya membership validó la política, y que el nombre de una especialidad sea
único por organización y no en todo WizyDoc.

## Inventario: quién lee o escribe `Specialty`

| Sitio | Política | ¿Acotado? |
| --- | --- | --- |
| `POST /:resourceId/specialty` (`create-specialty.usecase.ts`) | `account, confirmed, onboarded, roles: ["ADMIN"]` | Sí: `organizationId = :resourceId`. Pero el 422 por `@unique` global revela nombres de otras cuentas |
| `GET /:resourceId/specialties` (`get-specialties.usecase.ts`) | `account, confirmed, onboarded, member: true` | Sí: `where: { organizationId: :resourceId }` |
| `PUT /:resourceId/specialty/:specialtyId` (`update-specialty.usecase.ts`) | `account, confirmed, onboarded, roles: ["ADMIN"]` | **No**: `update({ where: { id } })` ignora `:resourceId`. Además un P2002 acaba en 500 |
| Borrar especialidad | No existe ruta | — |
| `POST /user/invite` (`invite-user.usecase.ts`, `specialtyIds`) | `account, confirmed, onboarded` (sede en el cuerpo; cuenta comprobada en el caso de uso) | **No**: `connect` por id sin mirar la organización de la sede |
| `GET /clinic/:clinicId/doctors` público (`get-clinic-doctors.query.ts`) | `public: true` | Sí para lo que muestra: especialidades unidas a perfiles de esa sede. Hoy muestra lo que un atacante haya conectado o renombrado; deja de ocurrir al arreglar los dos huecos de arriba |
| `POST` de reserva (`create-appointment.usecase.ts`) | público | `Appointment.specialty` es texto libre, no un id: no lee `Specialty`. Ver "Fuera de alcance" |
| `get-clinic-appointments`, `get-patient-detail` | — | Leen `Appointment.specialty` (texto), no `Specialty` |

Los roles ya son `ADMIN` en crear y editar; no hay nada que alinear. El listado
queda abierto a cualquier miembro (lo necesita el modal de invitar y no expone
datos sensibles).

## Cambios por capa

### Prisma (requiere migración)

`api/prisma/schema.prisma`, modelo `Specialty`:

```prisma
name           String
...
@@unique([organizationId, name])
```

Migración nueva, sin tocar las existentes. En el worktree, desde `api/`:
`./node_modules/.bin/prisma migrate dev --create-only --name scope_specialty_name_to_organization`
(equivale a `pnpm prisma:migrate`; pnpm 11 intenta reinstalar en un worktree
con `node_modules` enlazado). SQL esperado, a revisar antes de aplicar:

```sql
DROP INDEX "specialty_name_key";
CREATE UNIQUE INDEX "specialty_organization_id_name_key" ON "specialty"("organization_id", "name");
```

Datos existentes: si `name` ya es único en toda la tabla, cualquier par
`(organization_id, name)` también lo es; el `CREATE UNIQUE INDEX` no puede
fallar. El índice compuesto, con `organization_id` delante, además sirve al
`findMany({ where: { organizationId } })` del listado. Luego
`./node_modules/.bin/prisma generate`.

### api

- `api/src/application/use-cases/specialty/update-specialty.usecase.ts`
  - `UpdateSpecialtyDto` añade `organizationId: string`.
  - `update({ where: { id } })` → `updateMany` acotado; 0 filas → 404:
    ```ts
    const { count } = await client.specialty.updateMany({
      where: { id: dto.specialtyId, organizationId: dto.organizationId },
      data: { name: dto.name },
    });
    // Inexistente y de otra organización responden igual: no se revela qué ids existen.
    if (count === 0) throw new NotFound("Especialidad no encontrada");
    ```
  - Captura `P2002` → `UnprocessableEntity("Ya existe esa especialidad")`, igual
    que crear. Con el índice compuesto sólo salta dentro de la misma
    organización. Se elimina la rama `P2025` (`updateMany` no la lanza).
- `api/src/application/use-cases/specialty/create-specialty.usecase.ts`: sin
  cambios de código; el 422 pasa a ser por organización sólo por el índice.
- `api/src/routes/organization/index.ts`, `PUT /:resourceId/specialty/:specialtyId`:
  pasa `organizationId: request.params.resourceId` al DTO. La política no cambia
  (`roles: ["ADMIN"]`). El handler ya mapea `ApplicationError` a su `statusCode`.
- `api/src/application/use-cases/user/invite-user.usecase.ts`: método privado
  nuevo, llamado dentro de `if (data.role === "DOCTOR")` justo antes de
  `doctorProfile.create`:
  ```ts
  private async assertSpecialtiesBelongToClinicOrganization(clinicResourceId: string, specialtyIds: string[]) {
    const uniqueSpecialtyIds = [...new Set(specialtyIds)];
    const ownSpecialtiesCount = await getClient().specialty.count({
      where: {
        id: { in: uniqueSpecialtyIds },
        organization: { resource: { children: { some: { id: clinicResourceId } } } },
      },
    });
    // Mismo 404 para id inexistente y de otra cuenta.
    if (ownSpecialtiesCount !== uniqueSpecialtyIds.length) throw new NotFound("Especialidad no encontrada");
  }
  ```
  Se resuelve la organización con un filtro de relación (sede → padre) en vez
  de leer `parentResourceId` del `clinic.findFirst`, para no tocar las líneas
  que reescribe `fix/fix-invite-role-check`.

### platform

Ninguno. `update-specialty.action.ts` y `create-specialty.action.ts` ya
muestran el `message` del api vía `toActionState`.

## Conflicto esperado en `invite-user.usecase.ts`

- `fix/fix-invite-role-check` (sin mergear) mueve el `clinic.findFirst` arriba,
  le añade `include: { resource: { select: { parentResourceId: true } } }`,
  agrega `assertInviterIsAdmin` y mapea `ApplicationError` en la ruta.
- `fix/fix-invite-email-send` (en curso) cambia el schema de `email` y mueve el
  envío de correo dentro de la transacción.
- Este ticket sólo añade un método privado y una línea dentro del bloque
  `DOCTOR`. Conflicto previsible: contexto adyacente al método privado nuevo de
  role-check (ambos se insertan tras `assertDoctorSeatAvailable`). Se resuelve
  conservando los dos métodos.
- Hasta que role-check se mergee, la ruta `/user/invite` convierte cualquier
  error en 500: el `NotFound` nuevo sale como 500 genérico. No revela nada (id
  inexistente y ajeno dan lo mismo); tras role-check pasa a 404.

## Aislamiento entre cuentas

- Editar: `updateMany` filtra por `organizationId = :resourceId`, y la política
  ya exigió membership ADMIN directa sobre ese `resourceId`. Si `:resourceId`
  es una sede, `organizationId` nunca coincide → 404.
- Crear: `organizationId = :resourceId` con membership ADMIN validada; la FK a
  `organization` impide usar una sede (falla con 500, como hoy).
- Invitar: `specialtyIds` del cuerpo se cuentan contra la organización padre de
  la sede, y la sede ya está acotada a `accountId` en el caso de uso.
- Listar: sin cambios, ya filtra por el `resourceId` validado.

## Modelo de amenaza

- **Atacante:** cualquiera que se registre; al crear su cuenta es ADMIN de su
  propia organización y pasa la política en sus propias rutas.
- **Lo que conoce:** ids de especialidad de otra cuenta (se ven en la respuesta
  pública de `GET /clinic/:clinicId/doctors` de la víctima).
- **Lo que hoy logra:** renombrar especialidades ajenas (las ve el paciente en
  el booking de la víctima); conectar especialidades ajenas a sus médicos;
  averiguar si un nombre existe en otra cuenta por el 422; impedir a otras
  cuentas usar un nombre (crear "Cardiología" primero).
- **Tras el arreglo:** las tres escrituras responden 404 igual que un id
  inexistente, y el nombre sólo choca dentro de su organización.

## Invariantes

1. Una especialidad sólo se modifica a través del `resourceId` de su propia
   organización.
2. Un `DoctorProfile` sólo queda conectado a especialidades de la organización
   padre de su sede.
3. Un id de especialidad de otra cuenta y uno inexistente producen la misma
   respuesta.
4. Dos organizaciones (de la misma o de distinta cuenta) pueden tener una
   especialidad con el mismo nombre; dentro de una organización, no.

## Fuera de alcance (hallazgos para otros tickets)

- `create-appointment.usecase.ts` (público) no comprueba que `doctorProfileId`
  pertenezca a `clinicId` ni que `specialty` (texto libre) sea del médico: se
  puede reservar con un médico de otra cuenta y meter texto arbitrario en la
  agenda y en el correo de confirmación. Merece su propio ticket de seguridad.
- `specialtyIds: z.array(z.string())` acepta no-UUID: Prisma falla con 500. Sin
  fuga; se deja para no chocar con el schema que toca email-send.
- `PUT` de especialidad responde 201 y acepta `name` vacío (`optional()` sin
  `min`). No es de este ticket.

## Verificación

- `cd api && ./node_modules/.bin/tsc --noEmit` limpio.
- Revisar el SQL generado: sólo `DROP INDEX "specialty_name_key"` y el
  `CREATE UNIQUE INDEX` compuesto.
- Migración en la base de e2e: `cd api && docker compose -f docker-compose.e2e.yml up -d`;
  el `global-setup` de Playwright aplica `prisma migrate deploy` al arrancar.
- E2E existente que debe seguir pasando: `ui/invitations/invite-doctor.spec.ts`
  (invitar médica con especialidad propia).
- E2E nuevo `platform/e2e/api/security/fix-specialty-account-scope.spec.ts`,
  con `createOnboardedAdmin`, `createOrganizationResource`, `createClinicResource`,
  `createSpecialty` y `createMemberWithRole` de `support/accounts.ts`. Escenarios:
  - Atacante hace `PUT /<suOrg>/specialty/<idVíctima>` → 404, y el nombre de la
    víctima no cambia (leído con `getTestPrisma`).
  - Atacante hace `PUT /<orgVíctima>/specialty/<idVíctima>` → 404 (política).
  - `PUT` con id inexistente → misma respuesta que con id ajeno.
  - DOCTOR/USER de la organización → 403 en `POST` y `PUT`.
  - ADMIN edita su propia especialidad → 2xx y nombre cambiado.
  - Dos cuentas crean la misma especialidad "Cardiología" → ambas 201; la misma
    dos veces en una organización → 422; renombrar a un nombre ya usado en la
    misma organización → 422.
  - Invitar DOCTOR con `specialtyIds` de otra cuenta → no 2xx (500 hasta que
    entre role-check, 404 después) y no se crea `doctorProfile` ni membership.
- Correr sólo esos archivos: `cd platform && ./node_modules/.bin/playwright test e2e/api/security/fix-specialty-account-scope.spec.ts e2e/ui/invitations/invite-doctor.spec.ts`.

Despliegue: api con la migración en el mismo release; platform no cambia.

## Decisiones tomadas

1. **Unicidad por organización**, no por cuenta. `Specialty` cuelga de
   `Organization`, se lista y se conecta por organización. Alternativa: por
   cuenta, que exige desnormalizar `accountId` en `specialty` y no aporta nada
   mientras cada consulta ya va por organización.
2. **Comparación de nombre sensible a mayúsculas**, como hoy. Alternativa:
   índice sobre `lower(name)` (evita "cardiología" y "Cardiología" juntos), que
   Prisma no expresa sin SQL a mano. Mejora de producto aparte.
3. **`updateMany` acotado + `count === 0` → 404** en vez de `findFirst` previo
   y `update`. Una sola consulta y sin carrera. Alternativa: `findFirst` +
   `update`, más legible pero dos viajes.
4. **Especialidades del invitado acotadas a la organización padre de la sede**,
   no a la cuenta. Es lo que muestra el modal de invitar. Alternativa: por
   cuenta (`organization: { accountId }`), más laxa.
5. **No se toca la ruta `/user/invite`** para mapear el 404: lo trae role-check.
   Alternativa: mapear `ApplicationError` aquí y asumir un conflicto más.
6. **No se exige `resourceType === "ORGANIZATION"`** en las rutas de
   especialidad: el filtro por `organizationId` y la FK ya lo garantizan.
   Alternativa: 404 explícito vía `requireMembership(request).resourceType`.
7. **El booking (`doctorProfileId` ∈ sede, especialidad ∈ médico) queda fuera**
   pese a ser grave: no toca `Specialty` y ampliaría este ticket. Alternativa:
   incluirlo aquí.

## Criterios de aceptación

Decisiones ya tomadas (no se reabren en la revisión):

1. Unicidad del nombre por organización, no por cuenta.
2. Comparación de nombre sensible a mayúsculas, como hoy.
3. Editar con `updateMany` acotado; 0 filas → 404.
4. Especialidades del médico invitado acotadas a la organización padre de la sede.
5. No se toca la ruta `/user/invite`: su 404 llega con role-check (500 hasta entonces).
6. No se exige `resourceType === "ORGANIZATION"` en las rutas de especialidad.
7. La validación del booking (médico ∈ sede, especialidad ∈ médico) queda fuera de este ticket.

Todos se comprueban contra la base de e2e; ninguno toca producción.

### No se puede editar una especialidad ajena

- **CA-1** [e2e] Dado un ADMIN de la cuenta A y una especialidad "Pediatría" de la cuenta B, cuando A hace `PUT /<orgA>/specialty/<idB>` con otro nombre, entonces responde 404 y el nombre en la base sigue siendo "Pediatría".
- **CA-2** [e2e] Dado el mismo ADMIN de A, cuando hace `PUT /<orgB>/specialty/<idB>`, entonces la política responde 404 y el nombre no cambia.
- **CA-3** [e2e] Dado un ADMIN de una cuenta con dos organizaciones X e Y, cuando edita una especialidad de Y por `PUT /<orgX>/specialty/<idY>`, entonces responde 404 y el nombre no cambia.
- **CA-4** [e2e] Dado un ADMIN de A con una sede S, cuando hace `PUT /<S>/specialty/<idDeSuOrg>`, entonces no responde 2xx y el nombre no cambia.
- **CA-5** [e2e] Dado un DOCTOR o un USER de la organización, cuando hace `POST` o `PUT` de especialidad en ella, entonces responde 403 y no se crea ni cambia nada.

### No se puede vincular una especialidad ajena al invitar a un médico

- **CA-6** [e2e] Dado un ADMIN de A que invita a un DOCTOR en su sede con un `specialtyId` de la cuenta B, cuando envía `POST /user/invite`, entonces no responde 2xx y no se crean `doctorProfile`, membership ni invitación para ese correo.
- **CA-7** [e2e] Dada una cuenta con organizaciones X e Y, cuando su ADMIN invita a un DOCTOR en una sede de X con una especialidad de Y, entonces no responde 2xx y no se crea nada.
- **CA-8** [e2e] Dada una invitación con una especialidad propia y una ajena en `specialtyIds`, cuando se envía, entonces se rechaza entera: no queda ningún médico creado con sólo la especialidad propia.
- **CA-9** [e2e] Dado que el ataque de CA-6 fue rechazado, cuando se consulta `GET /clinic/<sedeB>/doctors` (público), entonces los médicos y las especialidades de B son los mismos que antes.

### Un id inexistente y uno ajeno responden igual

- **CA-10** [e2e] Dado un ADMIN de A, cuando hace `PUT /<orgA>/specialty/<idB>` y `PUT /<orgA>/specialty/<uuidInexistente>`, entonces ambas respuestas tienen el mismo código (404) y el mismo cuerpo.
- **CA-11** [e2e] Dado un ADMIN de A que invita a un DOCTOR, cuando usa un `specialtyId` de B y luego un UUID inexistente, entonces ambas respuestas tienen el mismo código y el mismo cuerpo (500 genérico hoy, 404 tras role-check).
- **CA-12** [e2e] Dado un ADMIN de A que crea "Cardiología" cuando B ya tiene "Cardiología", entonces responde 201: el resultado no revela qué nombres existen en otras cuentas.

### Nombres por organización

- **CA-13** [e2e] Dadas las cuentas A y B, cuando ambas crean "Cardiología", entonces las dos reciben 201 y cada una la ve en su `GET /<org>/specialties`.
- **CA-14** [e2e] Dada una cuenta con dos organizaciones X e Y, cuando ambas crean "Dermatología", entonces las dos reciben 201.
- **CA-15** [e2e] Dada una organización con "Cardiología", cuando su ADMIN vuelve a crear "Cardiología", entonces responde 422 con "Ya existe esa especialidad" y no 500.
- **CA-16** [e2e] Dada una organización con "Cardiología" y "Neurología", cuando su ADMIN renombra "Neurología" a "Cardiología", entonces responde 422 (no 500) y ambos nombres siguen igual.
- **CA-17** [e2e] Dada una organización con "Cardiología", cuando su ADMIN crea "cardiología", entonces responde 201 (decisión 2).
- **CA-18** [e2e] Dado que el ADMIN intenta crear un nombre repetido desde el panel, cuando envía el formulario, entonces ve el mensaje "Ya existe esa especialidad" y no un error genérico.
- **CA-19** [e2e] Dada la migración nueva aplicada sobre la base de e2e con especialidades existentes, cuando arranca el `global-setup`, entonces `prisma migrate deploy` termina sin error.

### Lo que sigue funcionando

- **CA-20** [e2e] Dado un ADMIN, cuando crea una especialidad nueva en su organización, entonces responde 201 y aparece en `GET /<org>/specialties`.
- **CA-21** [e2e] Dado un ADMIN, cuando renombra su propia especialidad, entonces responde 2xx y el nombre nuevo se ve en el listado y en el booking público de la sede.
- **CA-22** [e2e] Dado cualquier miembro de la organización (ADMIN, DOCTOR o USER), cuando pide `GET /<org>/specialties`, entonces recibe sólo las especialidades de esa organización.
- **CA-23** [e2e] Dado un ADMIN que invita a un DOCTOR con especialidades de la organización de la sede, cuando envía la invitación desde el modal, entonces se crea y el médico queda con esas especialidades (`invite-doctor.spec.ts` sigue pasando).
- **CA-24** [e2e] Dada una invitación con el mismo `specialtyId` propio repetido, cuando se envía, entonces se acepta y el médico queda con esa especialidad una vez.
- **CA-25** [e2e] Dado un ADMIN que invita a un USER (no médico), cuando envía la invitación, entonces se crea igual que antes.
- **CA-26** [e2e] Dado un paciente sin cuenta en el celular, cuando abre el booking público de una sede, entonces ve los médicos con sus especialidades y completa una reserva como antes.

## Pregunta para el humano

- **Mayúsculas (decisión 2):** hoy "Cardiología" y "cardiología" pueden coexistir en una organización y el paciente las vería como dos especialidades en el booking. Opciones: aceptarlo por ahora (más simple) o normalizar en otro ticket (índice sobre `lower(name)`, SQL a mano). Recomiendo un ticket aparte pequeño, no bloquea este.
- **Booking sin validar (decisión 7):** se puede reservar con un médico de otra cuenta y meter texto libre en la agenda y en el correo de confirmación. Toca datos de pacientes. Recomiendo priorizar ese ticket inmediatamente después de este.
- **500 en `/user/invite` hasta role-check (decisión 5):** el médico que invite con una especialidad borrada o ajena verá un error genérico en vez de "Especialidad no encontrada". Recomiendo mergear role-check antes o junto a este para que CA-11 sea 404.
- **Nombre vacío en `PUT`:** hoy se puede dejar una especialidad sin nombre, que el paciente vería vacía en el booking. Recomiendo un ticket aparte.
