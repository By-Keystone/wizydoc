# AGENTS.md — WizyDoc


@docs/PRODUCT.md

SaaS de agenda médica multi-tenant para clínicas y consultorios. Una
`Account` (tenant) tiene organizaciones y clínicas (`Resource`), usuarios con
roles por recurso (`UserResourceMembership`), doctores con disponibilidad,
citas reservadas desde un booking público y fichas de paciente. Se cobra por
plan (Culqi). **Maneja datos de salud: la privacidad no es opcional.**

## Estructura

Tres proyectos pnpm independientes (no hay workspace ni package.json en la raíz).
Cada comando se corre **dentro** de su carpeta.

| Carpeta           | Qué es                                  | Stack                                              |
| ----------------- | --------------------------------------- | -------------------------------------------------- |
| `api/`            | Backend REST (puerto 4000)              | Fastify 5, Prisma 7 + Postgres, Zod 4, Better Auth |
| `platform/`       | App de las clínicas y booking público   | Next.js 15 (App Router), React 18, Tailwind 3      |
| `web/`            | Landing de marketing (puerto 3001)      | Next.js 15, Tailwind 3                             |
| `docs/features/`  | Plan y mockup de cada feature           | Markdown + HTML                                    |

`api/` y `platform/` tienen su propio `AGENTS.md` con reglas específicas.
Léelo antes de tocar código ahí.

## Comandos

Node 22 (`.nvmrc`), pnpm.

```bash
# api
cd api && pnpm install && pnpm prisma:generate
pnpm dev            # tsx watch
pnpm typecheck      # ← obligatorio antes de dar algo por terminado

# platform / web
cd platform && pnpm install
pnpm dev
pnpm typecheck && pnpm lint   # ← obligatorio antes de dar algo por terminado
```

Base de datos local: `docker run -d --name wizydoc-db -e POSTGRES_USER=wizydoc -e POSTGRES_PASSWORD=wizydoc -e POSTGRES_DB=wizydoc -p 5432:5432 postgres:17-alpine`

**Todavía no hay tests ni CI de PRs.** No digas "los tests pasan": di qué
verificaste (typecheck, lint, petición manual, navegador).

## Flujo de trabajo con agentes

1. **planner** → `docs/features/<slug>/plan.md` (+ `mockup.html` con Lavish si hay UI).
2. El humano aprueba el plan y el mockup.
3. **engineer** implementa según `docs/features/<slug>/`.
4. **reviewer** revisa el diff; **security-reviewer** si toca rutas públicas,
   auth, billing o datos de pacientes.
5. **e2e-tester** prueba los flujos afectados.
6. El humano hace commit y merge.

## Definición de "terminado"

- `pnpm typecheck` limpio en cada proyecto tocado (y `pnpm lint` en platform/web).
- Si cambió `schema.prisma`: hay migración nueva creada con `pnpm prisma:migrate`.
- Ningún endpoint nuevo sin `policy({...})` ni consulta sin acotar por `accountId`.
- Sin `console.log` de depuración, sin código comentado, sin `any` nuevos.
- Resumen final: qué cambió, cómo lo verificaste y qué queda sin verificar.

## Convenciones generales

- TypeScript estricto. Alias `@/*` → `src/*` en api y platform.
- Validación de entrada con Zod 4 (`z.iso.date()`, `treeifyError`, `{ error: ... }`).
- Idioma: comentarios, mensajes de error al usuario y docs en **español**.
  Identificadores en inglés.
- Los comentarios explican el **porqué** (decisión, riesgo, alternativa
  descartada), no el qué. Sigue el estilo que ya existe en el código.
- Fechas: las horas de agenda son "hora de pared" de la clínica; los instantes
  se convierten con `api/src/domain/services/clinic-time.ts`. Nunca uses la
  zona horaria del servidor.

## Prohibido sin confirmación explícita

- Editar o borrar migraciones existentes en `api/prisma/migrations/`.
- `prisma migrate reset`, `prisma db push` o cualquier comando que borre datos.
- Leer o modificar archivos `.env*` (salvo `.env.example`).
- Instalar o actualizar dependencias.
- `git commit`, `git push`, crear tags o releases. **Un release `api-*` o
  `platform-*` despliega a producción** (ver `.github/workflows/`).
- Cambiar `api/src/plugins/policy.ts`, `auth.ts` o `entitlements.ts`.
- Llamar a Culqi o SES reales (usa claves de test o stubs).

## Gotchas

- `platform/README.md` y la sección de endpoints de `api/README.md` están
  desactualizados: confía en el código.
- `platform/docker-compose.yml` usa otra base (`clinica_citas`) que la del
  `api/.env.example`.
- `api/verify-*.ts` son scripts de comprobación manual, no tests.

