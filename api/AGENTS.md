# api/AGENTS.md

Fastify 5 + Prisma 7 con arquitectura por capas. Respeta la dirección de las
dependencias: `routes → application → domain`, e `infrastructure` implementa
los puertos de `domain`/`application`.

## Capas

- `src/domain/` — entidades, enums, interfaces de repositorio, servicios puros
  (`clinic-time`, `patient-metrics`). Sin Prisma ni Fastify.
- `src/application/use-cases/<dominio>/<accion>.usecase.ts` — escrituras. Cada
  archivo exporta su schema Zod (`xxxSchema`) y la clase `XxxUseCase` con
  `execute(dto)`.
- `src/application/queries/` — interfaz de la lectura; la implementación SQL/
  Prisma vive en `src/infrastructure/postgres/queries/` con la misma ruta.
- `src/application/errors/` — errores con `statusCode` que extienden
  `ApplicationError`. Lanza estos, nunca strings ni `Error` genérico.
- `src/application/ports/` — puertos de servicios externos (email, billing).
- `src/infrastructure/` — Prisma (`getClient()` de `transaction-context.ts`),
  SES, Culqi, Better Auth, mappers.
- `src/routes/<dominio>/index.ts` — sólo HTTP: schema, política, llamar al use
  case, mapear errores. Sin lógica de negocio.

## Autorización (crítico)

- Toda ruta declara `...policy({...})`. Sin política la ruta responde 401
  (hook global en `server.ts`). `public: true` sólo si es realmente público.
- Para operar sobre un recurso, el parámetro se llama `:resourceId` y se usa
  `member: true` o `roles: [...]`. Lee la membership con
  `requireMembership(request)`.
- Funciones de pago: `fastify.requireFeature("FEATURE")` (responde 402).
- **Multi-tenant:** toda consulta a datos de una cuenta filtra por
  `accountId` (de `request.user`) o por un recurso cuya membership ya se
  validó. Un id que llega del cliente (`doctorProfileId`, `patientId`,
  `clinicId`...) nunca se usa sin comprobar que pertenece a esa cuenta.
- En endpoints públicos (booking) valida que todos los ids recibidos estén
  relacionados entre sí (doctor ∈ clínica, especialidad ∈ doctor, etc.).
- Recurso de otra cuenta → 404, no 403 (no revelar su existencia).

## Prisma y migraciones

- Cambio de modelo: edita `prisma/schema.prisma` y corre `pnpm prisma:migrate`
  (crea la migración con `--create-only`); revisa el SQL generado antes de
  aplicarlo. Luego `pnpm prisma:generate`.
- Nunca edites una migración ya existente.
- Varias escrituras que deben ser atómicas → `transactionManager`.
- Agrega índices para filtros nuevos por `accountId` / `clinicId`.

## Datos de pacientes

- No loguees datos personales ni clínicos (nombre, documento, teléfono,
  alergias...). Loguea ids.
- El formulario público no puede sobrescribir la ficha clínica (ver el upsert
  de `create-appointment.usecase.ts`).
- Permisos de ficha: ver `docs/ficha-paciente-historial.md`.