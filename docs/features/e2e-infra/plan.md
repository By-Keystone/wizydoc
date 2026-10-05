# Infraestructura e2e (Playwright + correo capturado + DB de test)

Estado: **aprobado, listo para implementar.** Queda una sola confirmación,
que no bloquea al engineer: el procedimiento para instalar Playwright en el
worktree (ver "Riesgos y decisiones abiertas", punto 1). La necesita el
e2e-tester antes de su paso de instalación.

Autorizaciones explícitas del humano para este ticket:

- Instalar `@playwright/test` como devDependency en `platform/` (y, como parte
  de ello, descargar Chromium con `playwright install chromium`, que va a la
  caché del usuario, fuera del repo).
- Modificar `api/src/server.ts` y
  `api/src/infrastructure/vendors/auth/better-auth/auth.ts` (archivo protegido)
  **sólo** para usar la factory de correo.
- `platform/next.config.ts`: `distDir` configurable por `NEXT_DIST_DIR`
  (decisión 1, ya aplicada en el worktree).

No se tocan `plugins/auth.ts`, `policy.ts`, `entitlements.ts` ni migraciones.

## Dónde se trabaja

- Worktree `.claude/worktrees/e2e-infra`, rama `chore/e2e-infra` (desde
  `main`, sin commits). Todas las rutas de este plan son relativas a la raíz
  de ese worktree.
- En el worktree, `api/node_modules` y `platform/node_modules` son **enlaces
  simbólicos** al checkout principal. Consecuencias:
  - Verificar con `./node_modules/.bin/tsc --noEmit`, **no** con
    `pnpm typecheck`/`pnpm lint`: pnpm 11 detecta los módulos ajenos e
    intenta reinstalar y purgar.
  - Por lo mismo, los comandos que lanza la suite (`webServer`,
    `global-setup`) invocan los binarios por `./node_modules/.bin/...` y no
    por `pnpm exec`/`pnpm run`. Funciona igual en el checkout principal.
  - Instalar Playwright con el enlace puesto escribiría en el `node_modules`
    del checkout principal: ver el procedimiento en "Instalación de
    Playwright".
- Ya aplicado en el worktree (sin commit): `platform/next.config.ts` con
  `distDir: process.env.NEXT_DIST_DIR || ".next"` y su comentario de una línea.

---

## Objetivo

Poder correr `pnpm test:e2e` en `platform/` contra un api y un platform propios
(puertos 4100/3100, carpeta de Next `.next-e2e`) y una base `wizydoc_test`
aislada en su propio contenedor, con los correos capturados en un archivo en
lugar de enviarse por SES, y sin que ese modo de correo pueda activarse fuera
de los tests.

## Cambios por capa

### Prisma

Sin cambios ni migración. La base de test la define
`api/docker-compose.e2e.yml` y se migra con `prisma migrate deploy` (el mismo
comando que el script `prisma:deploy`), que no borra datos.

### Base de pruebas (engineer)

**`api/docker-compose.e2e.yml`** (crear). Sustituye al `docker run` de la
propuesta.

```yaml
name: wizydoc-e2e
services:
  db:
    image: postgres:17-alpine
    container_name: wizydoc-db-test
    environment:
      POSTGRES_USER: wizydoc
      POSTGRES_PASSWORD: wizydoc
      POSTGRES_DB: wizydoc_test
    ports:
      - "5433:5432"
```

- Nombre de proyecto (`wizydoc-e2e`) y de contenedor (`wizydoc-db-test`)
  distintos de los de desarrollo (`wizydoc-db`), así un `down` de uno no toca
  el otro.
- Sin volumen con nombre: los tests generan datos únicos y no dependen de
  conservarlos. Para empezar de cero: `docker compose -f docker-compose.e2e.yml down -v`
  (sólo afecta a la base de test).
- Se levanta a mano: `cd api && docker compose -f docker-compose.e2e.yml up -d`.
  La suite **no** lo levanta sola.

### api (engineer)

**`api/src/infrastructure/services/email-service/memory.service.ts`** (crear)

- `MemoryEmailService implements IEmailService` (puerto
  `application/ports/email-service.port.ts`, sin cambios).
- Constructor `{ captureFile: string }`. `send()` hace
  `mkdir(dirname(captureFile), { recursive: true })` y `appendFile` de una
  línea JSON + `\n`:
  `{ "to", "subject", "html", "text"?, "sentAt" }` (`sentAt` en ISO).
- La ruta se resuelve contra `process.cwd()`, que en e2e es `api/` (ver
  `webServer.cwd`). No loguea el contenido del correo.

**`api/src/infrastructure/services/email-service/factory.ts`** (crear)

```ts
export function createEmailService(): IEmailService
```

- `EMAIL_DRIVER === "memory"`:
  - si `NODE_ENV !== "test"` → `throw new Error(...)` (ver Invariantes);
  - si falta `EMAIL_CAPTURE_FILE` → `throw new Error(...)`;
  - devuelve `new MemoryEmailService({ captureFile })`.
- En cualquier otro caso → `new SESEmailService({ region: AWS_REGION, from: EMAIL_FROM })`,
  igual que hoy.
- Es la **única** línea del api que construye `SESEmailService`.

**`api/src/server.ts`** (modificar, línea ~54)

- Sustituir `new SESEmailService({...})` por `createEmailService()` y el import
  de `SESEmailService` por el de la factory. Nada más.
- `import "dotenv/config"` se queda: en e2e se le redirige con
  `DOTENV_CONFIG_PATH` (ver "Variables de entorno").

**`api/src/infrastructure/vendors/auth/better-auth/auth.ts`** (modificar, líneas 4 y 7-10)

- Cambiar el import de `SESEmailService` por el de `createEmailService` y
  `const emailService = createEmailService();`. Ningún otro cambio.
- **Se hace sobre la versión de `main`**: el worktree `e2e-infra` no contiene
  `fix-auth-user-fields-input` (vive en otro worktree/rama). Al mergear la
  segunda de las dos ramas habrá un **conflicto trivial** en este archivo:
  conservar ambos cambios (los `input: false`, `disabledPaths` y, si se
  aprobó, el `console.log` con `user.id` de aquel ticket; el import y la
  llamada a `createEmailService()` de éste). No se tocan las mismas líneas,
  pero están a pocas de distancia.
- Al ser una llamada en tiempo de import, un `EMAIL_DRIVER=memory` indebido
  tumba el proceso al arrancar: es lo que se busca.

**`api/.env.example`** (modificar)

Añadir, junto al bloque de SES:

```
# Correo: vacío o "ses" envía por SES. "memory" escribe cada correo como una
# línea JSON en EMAIL_CAPTURE_FILE (relativa a api/); sólo se acepta con
# NODE_ENV=test y existe para los e2e.
EMAIL_DRIVER=
EMAIL_CAPTURE_FILE=
```

**`api/.gitignore`** (modificar, **antes** de que el humano cree
`api/.env.e2e`): añadir `.env.e2e`. Hoy sólo ignora `.env`.

### platform

**`platform/.gitignore`** (modificar; lo hace el **engineer**, en el mismo
paso que el de api y **antes** de que el humano cree `platform/.env.e2e`):

```
.env.e2e
.next-e2e/
e2e/.artifacts/
test-results/
playwright-report/
```

**`platform/next.config.ts`**: ya modificado en el worktree (decisión 1). El
e2e-tester no lo toca.

#### Instalación de Playwright (e2e-tester)

Procedimiento propuesto (requiere la confirmación del punto 1 de "Riesgos y
decisiones abiertas"):

1. En el worktree, `rm platform/node_modules` (borra **sólo el enlace
   simbólico**; comprobar antes con `ls -la platform/node_modules` que es un
   enlace y no una carpeta).
2. `cd platform && pnpm install --frozen-lockfile`: materializa en el
   worktree las dependencias del lockfile actual (enlaces desde el store de
   pnpm). No cambia el conjunto de dependencias ni toca el checkout
   principal.
3. `pnpm add -D @playwright/test`: modifica `platform/package.json` y
   `platform/pnpm-lock.yaml` del worktree.
4. `./node_modules/.bin/playwright install chromium`.
5. `api/node_modules` **sigue enlazado** al checkout principal: la suite sólo
   lo usa para leer (`tsx`, `prisma`, el cliente Prisma generado).

Tras el merge a `main`, el checkout principal necesita `pnpm install` en
`platform/` para tener Playwright (lo hace el humano).

#### Archivos de la suite (e2e-tester)

**`platform/package.json`** (modificar)

- Scripts:
  ```json
  "test:e2e": "playwright test",
  "test:e2e:ui": "playwright test --project=chromium",
  "test:e2e:api": "playwright test --project=api",
  "test:e2e:report": "playwright show-report"
  ```
  `test:e2e:ui` es el proyecto de navegador, no el modo `--ui` de Playwright.

**`platform/playwright.config.ts`** (crear)

```ts
import { defineConfig, devices } from "@playwright/test";
import {
  API_BASE_URL, API_DIR, PLATFORM_BASE_URL, PLATFORM_DIR,
  apiEnv, platformEnv, assertE2eEnvironment,
} from "./e2e/support/env";

assertE2eEnvironment();

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: true,
  forbidOnly: true,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "api",
      testDir: "./e2e/api",
      use: { baseURL: API_BASE_URL, extraHTTPHeaders: { Origin: PLATFORM_BASE_URL } },
    },
    {
      name: "chromium",
      testDir: "./e2e/ui",
      use: { ...devices["Desktop Chrome"], baseURL: PLATFORM_BASE_URL },
    },
  ],
  webServer: [
    {
      name: "api",
      command: "./node_modules/.bin/tsx src/server.ts",
      cwd: API_DIR,
      url: `${API_BASE_URL}/health`,
      env: { ...apiEnv, DOTENV_CONFIG_PATH: ".env.e2e" },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      name: "platform",
      command: "./node_modules/.bin/next dev --port 3100",
      cwd: PLATFORM_DIR,
      url: PLATFORM_BASE_URL,
      env: platformEnv,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});
```

- `assertE2eEnvironment` se evalúa al cargar la config, **antes** de levantar
  ningún servidor y en cada worker.
- `reuseExistingServer: false`: si 4100 o 3100 están ocupados, Playwright
  falla en vez de probar contra un servidor desconocido.
- `tsx` sin `watch` (la propuesta decía `pnpm dev`): editar código del api
  durante una corrida no debe reiniciar el servidor a mitad de un test.
- `platformEnv` incluye `NEXT_DIST_DIR=.next-e2e`: el `next dev` de e2e
  compila en `.next-e2e` y puede convivir con el `pnpm dev` de desarrollo
  (que sigue en `.next`).
- `next dev` compila cada ruta la primera vez: si los primeros tests dan
  timeout, subir `expect.timeout`/`navigationTimeout` antes que añadir
  esperas.

**`platform/e2e/support/env.ts`** (crear; nuevo respecto a la lista aprobada)

Justificación: config, `global-setup`, `db` y `email` necesitan los mismos
valores; leerlos en un solo sitio evita cuatro lecturas distintas de los
archivos y mutar `process.env`.

- `PLATFORM_DIR = resolve(__dirname, "../..")`, `API_DIR = resolve(PLATFORM_DIR, "../api")`.
- `apiEnv = readEnvFile(join(API_DIR, ".env.e2e"))`,
  `platformEnv = readEnvFile(join(PLATFORM_DIR, ".env.e2e"))`, con
  `dotenv.parse(readFileSync(...))` (dotenv 17 ya es devDependency de
  platform). `parse` no toca `process.env`. Si falta el archivo:
  `throw new Error("Falta api/.env.e2e: ver docs/features/e2e-infra/plan.md")`.
- `API_BASE_URL = "http://localhost:" + apiEnv.PORT`,
  `PLATFORM_BASE_URL = apiEnv.CLIENT_ORIGIN`.
- `EMAIL_CAPTURE_PATH = resolve(API_DIR, apiEnv.EMAIL_CAPTURE_FILE)`: la misma
  ruta que escribe el api, calculada desde la misma variable.
- `assertTestDatabase(url)`: `new URL(url)`; exige `hostname` en
  `localhost`/`127.0.0.1`, `port === "5433"` y `pathname === "/wizydoc_test"`.
  Si no, `throw` con un mensaje que diga qué esperaba (sin imprimir la URL,
  lleva contraseña).
- `assertE2eEnvironment()`: `assertTestDatabase(apiEnv.DATABASE_URL)` y
  además `apiEnv.EMAIL_DRIVER === "memory"`, `apiEnv.NODE_ENV === "test"` y
  `platformEnv.NEXT_DIST_DIR` definido y distinto de `.next`. Sin lo
  primero se enviarían correos reales; sin lo segundo se pisaría la carpeta
  del `pnpm dev` de desarrollo.

**`platform/e2e/support/global-setup.ts`** (crear)

1. `assertE2eEnvironment()` otra vez.
2. **Comprobar que la base responde**: `await testPrisma.$queryRaw\`SELECT 1\``
   (de `db.ts`). Si falla, abortar con:
   `"La base de pruebas no responde en localhost:5433. Levántala con: cd api && docker compose -f docker-compose.e2e.yml up -d"`.
   No la levanta sola. `$disconnect()` al terminar.
3. `execFileSync("./node_modules/.bin/prisma", ["migrate", "deploy"], { cwd: API_DIR, stdio: "inherit", env: { ...process.env, DATABASE_URL: apiEnv.DATABASE_URL, DOTENV_CONFIG_PATH: ".env.e2e" } })`.
   `prisma.config.ts` también hace `import "dotenv/config"`; con
   `DOTENV_CONFIG_PATH` lee `.env.e2e` y no `api/.env`, y el `DATABASE_URL`
   explícito gana de todos modos.
4. `rmSync(EMAIL_CAPTURE_PATH, { force: true })`. Sin truncar la base.

Nota: Playwright arranca los `webServer` antes del `globalSetup`. El api no
toca la base al arrancar (`/health` no consulta), así que comprobar y migrar
después es seguro; la guarda de entorno ya corrió en la config.

**`platform/e2e/support/db.ts`** (crear)

- Cliente Prisma de test reutilizando el cliente generado del api, **sin
  añadir dependencias a platform** (decisión 3):
  ```ts
  import { PrismaClient } from "../../../api/node_modules/@prisma/client";
  import { PrismaPg } from "../../../api/node_modules/@prisma/adapter-pg";
  export const testPrisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: apiEnv.DATABASE_URL }),
  });
  ```
  con `assertTestDatabase(apiEnv.DATABASE_URL)` antes de construirlo.
- **Si `tsc` de platform no resuelve esos tipos**: usar en su lugar
  `await import("../../../api/src/infrastructure/postgres/client")` dentro de
  una función, tras fijar `process.env.DATABASE_URL = apiEnv.DATABASE_URL`
  (ese módulo lee la variable al importarse; por eso import dinámico y no
  estático). Documentar en el resumen cuál quedó.
- En el worktree `api/node_modules` apunta al checkout principal: el cliente
  generado es el de ese checkout. Este ticket no cambia `schema.prisma`, así
  que basta con haber corrido `pnpm prisma:generate` allí.

**`platform/e2e/support/email.ts`** (crear)

```ts
export interface CapturedEmail { to: string; subject: string; html: string; text?: string; sentAt: string }
export function readLatestEmailTo(email: string): CapturedEmail | undefined
export function extractLink(html: string, pathFragment: string): string
```

- `readLatestEmailTo` lee `EMAIL_CAPTURE_PATH` (si no existe → `undefined`),
  parsea las líneas y devuelve la última cuyo `to` coincide.
- El envío de Better Auth es en segundo plano (`runInBackgroundOrAwait`): los
  tests esperan con `expect.poll(() => readLatestEmailTo(email)?.subject)`.
- `extractLink` devuelve el primer `href` que contiene `pathFragment`
  (p. ej. `/api/auth/verify-email`), o lanza.

**`platform/e2e/support/users.ts`** (crear)

- `uniqueEmail(prefix)` → `${prefix}.${Date.now()}.${randomUUID().slice(0, 8)}@e2e.wizydoc.test`
  (dominio reservado `.test`). Lo mismo para cualquier `Specialty.name`.
- `E2E_PASSWORD = "Clave-Segura-2026"`.
- `signUp(request, { email, ... })`: `POST /api/auth/sign-up/email` con
  `name`, `lastName`, `phone`, `email`, `password` y cabecera `Origin`
  (`PLATFORM_BASE_URL`, que es el `CLIENT_ORIGIN` de confianza).
- `confirmEmail(email)`: `testPrisma.user.update({ where: { email }, data: { confirmed: true } })`.
- `signIn(request, email)`: `POST /api/auth/sign-in/email`. El
  `APIRequestContext` guarda la cookie de sesión.
- `createConfirmedUser(request)`: `signUp` + `confirmEmail` + `signIn`;
  devuelve `{ email, userId }`.
- Para UI se pasa `page.context().request` contra `PLATFORM_BASE_URL` (el
  rewrite `/api/auth/*` de `next.config.ts` lo reenvía al api): ese
  `request` **comparte el jar de cookies con el navegador**, así que la cookie
  `better-auth.session_token` queda en el contexto sin copiarla a mano ni
  escribir `storageState` a disco. El helper comprueba con
  `context.cookies()` que la cookie existe y falla con un mensaje claro si no.
- Para el proyecto `api`, cada usuario usa su propio
  `playwright.request.newContext({ baseURL: API_BASE_URL, extraHTTPHeaders: { Origin } })`.

`seed.ts` y `fixtures.ts` **no se crean en este ticket**: el primer test que
necesite datos sembrados (sede, doctor, horario) los crea. No dejar archivos
vacíos.

**Tests de humo** (crear)

- `platform/e2e/ui/auth/register.spec.ts` — registro con correo capturado:
  1. `goto("/register")`, llenar Nombre, Apellido, Correo, Celular,
     Contraseña con datos de `users.ts`; "Crear cuenta".
  2. `expect(page).toHaveURL(/\/confirm-email$/)`.
  3. `expect.poll` hasta que `readLatestEmailTo(email)?.subject` sea
     `"Confirma tu correo en WizyDoc"`.
  4. `page.goto(extractLink(html, "/api/auth/verify-email"))` →
     `toHaveURL(/\/onboarding/)`.
  5. `testPrisma.user.findUnique({ where: { email } })` → `confirmed === true`.
  - Ojo: en `register/page.tsx` la etiqueta "Apellido" tiene
    `htmlFor="lastname"` y el input `id="lastName"`, así que
    `getByLabel("Apellido")` **no** lo encuentra. Usar
    `locator('input[name="lastName"]')` y reportarlo como bug de
    accesibilidad aparte (no se arregla en este ticket). El celular es
    `PhoneInput` (select de país + input visible + input oculto `name="phone"`):
    llenar el input visible.
- `platform/e2e/api/smoke.spec.ts` — sesión por API: `createConfirmedUser` →
  `GET /user/me` → 200, `confirmed: true`, `accountId: null`; y
  `readLatestEmailTo(email)` contiene el correo de verificación. Valida
  `users.ts` y `db.ts`, que el test de UI no ejercita, y evita que
  `test:e2e:api` falle por "No tests found".

### Archivos

| Quién | Acción | Ruta |
| --- | --- | --- |
| humano | Hecho | `platform/next.config.ts` (`distDir`) |
| engineer | Modificar (**primero**) | `api/.gitignore`, `platform/.gitignore` |
| engineer | Crear | `api/docker-compose.e2e.yml` |
| engineer | Crear | `api/src/infrastructure/services/email-service/memory.service.ts` |
| engineer | Crear | `api/src/infrastructure/services/email-service/factory.ts` |
| engineer | Modificar | `api/src/server.ts` |
| engineer | Modificar (protegido, autorizado; sobre `main`) | `api/src/infrastructure/vendors/auth/better-auth/auth.ts` |
| engineer | Modificar | `api/.env.example` |
| humano | Crear (a mano) | `api/.env.e2e`, `platform/.env.e2e` |
| humano | Levantar | `cd api && docker compose -f docker-compose.e2e.yml up -d` |
| e2e-tester | Instalar | `@playwright/test` (devDependency) y Chromium, según "Instalación de Playwright" |
| e2e-tester | Modificar | `platform/package.json` (scripts) |
| e2e-tester | Crear | `platform/playwright.config.ts` |
| e2e-tester | Crear | `platform/e2e/support/{env,global-setup,db,email,users}.ts` |
| e2e-tester | Crear | `platform/e2e/ui/auth/register.spec.ts`, `platform/e2e/api/smoke.spec.ts` |

Orden: engineer (los dos `.gitignore` antes que nada) → humano crea los
`.env.e2e` y levanta la base → e2e-tester. `fix-auth-user-fields-input` ya no
es requisito previo: va en su propia rama y el conflicto en `auth.ts` se
resuelve al mergear.

Estructura que queda para los siguientes tickets (no se crea vacía):
`e2e/api/{security,booking}/`, `e2e/ui/{booking,auth,invitations,patient-file,availability}/`,
`e2e/support/{seed,fixtures}.ts`.

## Variables de entorno

Ningún agente lee ni crea `.env*` (salvo `.env.example`). El código de los
tests los lee en ejecución con `dotenv.parse`; ningún agente debe abrirlos con
`cat`/`Read` para depurar.

Dos archivos, ambos los crea el humano **después** de que el engineer
actualice los `.gitignore`:

- `api/.env.e2e`: `DATABASE_URL` (5433/`wizydoc_test`), `PORT=4100`,
  `NODE_ENV=test`, `FRONTEND_URL`, `BETTER_AUTH_URL` y `CLIENT_ORIGIN` =
  `http://localhost:3100`, `BETTER_AUTH_SECRET`, `JWT_SECRET`,
  `CLINIC_TIME_ZONE=America/Lima`, `EMAIL_DRIVER=memory`,
  `EMAIL_CAPTURE_FILE=../platform/e2e/.artifacts/emails.jsonl`, `EMAIL_FROM`,
  `AWS_REGION`, `CULQI_API_BASE_URL=http://localhost:9`,
  `CULQI_API_PRIVATE_KEY`, `CULQI_PLAN_ID_CONSULTORIO`, `CULQI_PLAN_ID_CLINICA`.
  Sin `AWS_PROFILE`.
- `platform/.env.e2e`: `API_URL=http://localhost:4100`,
  `NEXT_PUBLIC_CULQI_PUBLIC_KEY`, `NEXT_DIST_DIR=.next-e2e`.

Comprobaciones (no hay que cambiar ningún nombre ni ruta):

- `EMAIL_CAPTURE_FILE` relativa a `api/` es correcta porque el `webServer`
  del api corre con `cwd: api/`.
- `BETTER_AUTH_URL=http://localhost:3100`: los enlaces de confirmación pasan
  por el rewrite de platform, igual que en desarrollo.
- `CULQI_API_BASE_URL=http://localhost:9`: cualquier llamada a Culqi falla
  por conexión rechazada.
- `DOTENV_CONFIG_PATH` **no** va en el archivo: lo inyecta la config.
- `NEXT_DIST_DIR` sólo tiene efecto porque llega al proceso de `next dev`
  por el `env` del `webServer`; Next no lee `platform/.env.e2e` por sí mismo.

**Cómo llega cada valor y en qué orden gana**

api (`webServer[0]`):

1. Playwright lanza el proceso con `{ ...process.env (shell), ...webServer.env }`:
   lo de `api/.env.e2e` **pisa** lo exportado en la shell.
2. `import "dotenv/config"` en `server.ts` lee `DOTENV_CONFIG_PATH=.env.e2e`
   (relativo al `cwd` `api/`) en vez de `api/.env`, y por defecto **no
   sobrescribe** variables ya definidas. Resultado: **`api/.env` no se lee
   nunca en e2e**, así que no se mezcla `AWS_PROFILE`, `DATABASE_URL` ni nada
   del entorno de desarrollo.
3. Riesgo residual: una variable exportada en la shell que no esté en
   `.env.e2e` (p. ej. `AWS_PROFILE`) sí llega al proceso. Con
   `EMAIL_DRIVER=memory` no se construye ningún cliente SES, así que no tiene
   efecto.

`prisma migrate deploy` (global-setup): mismo esquema, `DATABASE_URL` y
`DOTENV_CONFIG_PATH` explícitos.

platform (`webServer[1]`): Next carga sus `.env`, `.env.development` y
`.env.local` de `platform/` pero **no sobrescribe** `process.env`; como
`API_URL`, `NEXT_PUBLIC_CULQI_PUBLIC_KEY` y `NEXT_DIST_DIR` llegan
explícitos, ganan. Otras claves de esos archivos que no estén en `.env.e2e`
sí se cargarían (hoy `platform/.env.example` sólo tiene las dos primeras).

Helpers de Prisma del test: `db.ts` usa `apiEnv.DATABASE_URL` leído por
`env.ts` y pasado explícitamente al adapter; no depende de `process.env`
(salvo en la alternativa del import dinámico).

## Aislamiento entre cuentas

- No hay endpoints, consultas ni datos nuevos en la app.
- Aislamiento de **entorno**: los tests sólo escriben en `wizydoc_test`
  (5433, contenedor `wizydoc-db-test`). Tres guardas: la config, el
  `global-setup` y `db.ts` rechazan cualquier otra base, puerto o host.
- Los datos de cada test son únicos (`uniqueEmail`, sufijo en
  `Specialty.name`), sin truncar, de modo que los workers en paralelo no
  colisionan en los únicos globales (`User.email`, `Specialty.name`).
- Los correos capturados incluyen enlaces con tokens de verificación: viven
  en `platform/e2e/.artifacts/` (ignorado por git) y son datos ficticios.

## Invariantes

1. **`EMAIL_DRIVER=memory` sólo se acepta con `NODE_ENV=test`** (decisión 2);
   con cualquier otro valor (incluido `production` y `NODE_ENV` sin definir)
   el api no arranca: la factory lanza al importarse `auth.ts`. Es una lista
   de permitidos a propósito: el `Dockerfile` fija `NODE_ENV=production`,
   pero si un despliegue no lo hiciera, rechazar sólo `production` lo dejaría
   pasar.
2. `EMAIL_DRIVER=memory` sin `EMAIL_CAPTURE_FILE` → el api no arranca.
3. Con `EMAIL_DRIVER` vacío o ausente el comportamiento es idéntico al actual
   (SES). Producción no necesita ninguna variable nueva.
4. `new SESEmailService(` aparece en un único lugar: `factory.ts`.
5. La suite e2e se niega a correr (config y `global-setup`) si `DATABASE_URL`
   no es `localhost|127.0.0.1:5433/wizydoc_test`, si `EMAIL_DRIVER` no es
   `memory`, si `NODE_ENV` no es `test` o si `NEXT_DIST_DIR` falta o es
   `.next`.
6. Si la base de test no responde, la suite aborta con el comando para
   levantarla; nunca levanta contenedores ni toca la base de desarrollo.
7. Los servidores de e2e nunca reutilizan los de desarrollo
   (`reuseExistingServer: false`, puertos 4100/3100, carpeta `.next-e2e`) y
   el api de e2e nunca lee `api/.env`.
8. Sin `NEXT_DIST_DIR` el comportamiento de Next es el actual (`.next`).
9. Culqi nunca se llama de verdad: `CULQI_API_BASE_URL` apunta a un puerto
   cerrado y el onboarding de los tests sólo usa el plan Gratis.

## Riesgos y decisiones abiertas

Decididas (4 de octubre de 2026):

- `distDir` por `NEXT_DIST_DIR` (opción b), ya aplicado en el worktree.
- Salvaguarda estricta: `memory` sólo con `NODE_ENV=test`.
- Cliente Prisma de los tests importado desde el api, con el import dinámico
  como alternativa. Sin dependencias nuevas en platform.
- Base de test en `api/docker-compose.e2e.yml`; la suite sólo comprueba que
  responde.

Pendiente de confirmar:

1. **Procedimiento de instalación de Playwright en el worktree** (ver
   "Instalación de Playwright"): borrar el enlace `platform/node_modules` del
   worktree y correr allí `pnpm install --frozen-lockfile` antes de
   `pnpm add -D @playwright/test`. El `pnpm install` no cambia dependencias,
   pero `AGENTS.md` pide confirmación para instalar, y la aprobación dada
   menciona sólo `@playwright/test`. **Recomiendo confirmarlo así**: es la
   única forma de que la instalación no escriba en el `node_modules` del
   checkout principal. No bloquea al engineer.

Riesgos:

- Conflicto trivial en `auth.ts` al mergear con `fix-auth-user-fields-input`
  (ver api).
- Que `tsc` de platform no resuelva los tipos del cliente Prisma importado
  desde `api/node_modules`: hay alternativa definida.
- Bug de accesibilidad en `register/page.tsx` (`htmlFor="lastname"` vs
  `id="lastName"`): fuera de alcance, ticket aparte.

## Verificación

Nada de esto está ejecutado todavía. Todo desde el worktree
`.claude/worktrees/e2e-infra`.

1. **Typecheck y lint** (binarios locales, no `pnpm`):
   ```bash
   cd api && ./node_modules/.bin/tsc --noEmit
   cd platform && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/next lint
   ```
   `tsc` de platform incluye `**/*.ts`, así que revisa también `e2e/` y
   `playwright.config.ts` (no `.next-e2e/` ni `e2e/.artifacts/`: TypeScript
   no recorre carpetas que empiezan por punto salvo que se incluyan
   explícitamente). `next lint` no recorre `e2e/`.
2. **Salvaguarda del driver** (desde `api/`, sin `.env.e2e`, base local de
   desarrollo; el proceso debe morir al arrancar sin escuchar el puerto):
   ```bash
   EMAIL_DRIVER=memory NODE_ENV=production ./node_modules/.bin/tsx src/server.ts   # error y salida ≠ 0
   EMAIL_DRIVER=memory NODE_ENV=development ./node_modules/.bin/tsx src/server.ts  # error y salida ≠ 0
   EMAIL_DRIVER=memory NODE_ENV=test ./node_modules/.bin/tsx src/server.ts         # error: falta EMAIL_CAPTURE_FILE
   ```
3. **SES no se construye**: `grep -rn "new SESEmailService" api/src` → sólo
   `factory.ts`.
4. **Base caída**: con el contenedor parado
   (`docker compose -f docker-compose.e2e.yml stop`), `pnpm test:e2e` aborta
   en el `global-setup` con el mensaje que indica
   `cd api && docker compose -f docker-compose.e2e.yml up -d`, y no se crea
   ningún contenedor.
5. **Guarda de entorno**: con `api/.env.e2e` apuntando por error a 5432 o a
   `wizydoc`, o con `NEXT_DIST_DIR` ausente en `platform/.env.e2e`,
   `pnpm test:e2e` falla antes de levantar servidores. (Lo comprueba el
   humano editando sus archivos; los agentes no los abren.)
6. **Suite de humo** (base de test levantada, `pnpm prisma:generate` hecho en
   el `api/` del checkout principal):
   ```bash
   cd platform && pnpm test:e2e
   ```
   `pnpm test:e2e` es seguro aquí porque `platform/node_modules` del worktree
   ya es propio tras la instalación; si pnpm intentara reinstalar, usar
   `./node_modules/.bin/playwright test`.
   - El `global-setup` aplica las migraciones en `wizydoc_test`.
   - `ui/auth/register.spec.ts` y `api/smoke.spec.ts` en verde.
   - `platform/e2e/.artifacts/emails.jsonl` existe y tiene una línea por
     usuario registrado, con `subject` `"Confirma tu correo en WizyDoc"`.
   - Con el `pnpm dev` de platform corriendo en 3000 a la vez, la suite pasa
     y `platform/.next-e2e/` existe junto a `.next/`.
7. **No se llamó a SES**: el test de registro sólo pasa si el correo está en
   el archivo, y sólo `MemoryEmailService` escribe ahí; además el `.env.e2e`
   del api no lleva `AWS_PROFILE`. Si hay acceso a la consola de AWS, la
   métrica de envíos de SES no cambia durante la corrida.
8. **La base de desarrollo no se tocó**: en `wizydoc` (5432),
   `SELECT count(*) FROM "user" WHERE email LIKE '%@e2e.wizydoc.test';` → 0.
9. **Checkout principal intacto**: `ls -la` de
   `/Users/sergio.ramirez/Projects/clinica-citas/platform/node_modules/@playwright`
   no existe (la instalación quedó en el worktree).
10. `git status` en el worktree no muestra `.env.e2e`, `.next-e2e/`,
    `e2e/.artifacts/`, `test-results/` ni `playwright-report/`.

Fuera de alcance: CI, traducir a specs las pruebas curl de
`docs/features/fix-*/plan.md` (tickets siguientes), seeds de sedes/doctores.

## Criterios de aceptación

Objetivo de producto: cualquier cambio de WizyDoc se puede verificar de punta
a punta (api + platform + correo) sin enviar correos reales, sin tocar la base
de desarrollo ni producción, y un desarrollador lo corre en local con un solo
comando tras levantar la base de pruebas.

`[e2e]`: lo demuestra la propia suite al pasar. `[manual]`: lo comprueba una
persona. Ningún criterio pide a un agente abrir un `.env*`.

### Arranque con un comando

**CA-1** `[e2e]` Arranque con un solo comando.
- **Dado** la base de pruebas levantada con
  `cd api && docker compose -f docker-compose.e2e.yml up -d`, `api/.env.e2e` y
  `platform/.env.e2e` creados, dependencias de `platform/` instaladas
  (incluidos `@playwright/test` y Chromium) y el cliente Prisma del api
  generado,
- **Cuando** el desarrollador corre `cd platform && pnpm test:e2e` sin ningún
  otro paso,
- **Entonces** la suite levanta por sí sola el api en 4100 y el platform en
  3100, aplica las migraciones en `wizydoc_test`, corre los proyectos `api` y
  `chromium` y termina con código 0.

**CA-2** `[manual]` Base de pruebas caída: mensaje accionable, nada se levanta solo.
- **Dado** el contenedor `wizydoc-db-test` parado
  (`docker compose -f docker-compose.e2e.yml stop`),
- **Cuando** se corre `pnpm test:e2e`,
- **Entonces** la corrida termina con código distinto de 0 en el
  `global-setup`, el mensaje incluye
  `cd api && docker compose -f docker-compose.e2e.yml up -d`, y `docker ps -a`
  no muestra ningún contenedor nuevo ni cambios en `wizydoc-db`.

### Aislamiento de la base de desarrollo

**CA-3** `[manual]` La suite rechaza cualquier base que no sea la de pruebas.
- **Dado** `api/.env.e2e` con `DATABASE_URL` apuntando al puerto 5432, a la
  base `wizydoc` o a un host que no sea `localhost`/`127.0.0.1`,
- **Cuando** se corre `pnpm test:e2e`,
- **Entonces** falla antes de levantar servidores (nada escucha en 4100 ni
  3100), el mensaje dice qué base esperaba y no imprime la URL recibida.

**CA-4** `[manual]` La base de desarrollo queda intacta tras una corrida.
- **Dado** una corrida completa y en verde de `pnpm test:e2e`,
- **Cuando** se consulta la base `wizydoc` en 5432 con
  `SELECT count(*) FROM "user" WHERE email LIKE '%@e2e.wizydoc.test';`,
- **Entonces** el resultado es 0.

**CA-5** `[manual]` La suite rechaza un entorno que no es de pruebas.
- **Dado** `api/.env.e2e` con `EMAIL_DRIVER` distinto de `memory` o
  `NODE_ENV` distinto de `test`, o `platform/.env.e2e` sin `NEXT_DIST_DIR` o
  con `NEXT_DIST_DIR=.next`,
- **Cuando** se corre `pnpm test:e2e`,
- **Entonces** falla antes de levantar servidores, con un mensaje que nombra
  la condición incumplida.

### Ningún envío real por SES

**CA-6** `[manual]` Sólo existe un punto que construye el cliente de SES.
- **Dado** el código del api tras el cambio,
- **Cuando** se corre `grep -rn "new SESEmailService" api/src`,
- **Entonces** la única coincidencia está en
  `api/src/infrastructure/services/email-service/factory.ts`.

**CA-7** `[e2e]` El correo de una corrida e2e se captura y no sale por SES.
- **Dado** el api de e2e arrancado con `EMAIL_DRIVER=memory`,
- **Cuando** un test registra un usuario,
- **Entonces** el correo de confirmación aparece en
  `platform/e2e/.artifacts/emails.jsonl`; como sólo `MemoryEmailService`
  escribe ahí, el test pasa únicamente si el correo no tomó el camino de SES.
  (Si hay acceso a la consola de AWS, la métrica de envíos de SES no cambia
  durante la corrida: comprobación `[manual]` opcional.)

**CA-8** `[manual]` Culqi no se llama de verdad.
- **Dado** `api/.env.e2e` con `CULQI_API_BASE_URL=http://localhost:9`,
- **Cuando** corre la suite,
- **Entonces** ninguna petición sale hacia Culqi (cualquier intento falla por
  conexión rechazada) y los tests sólo usan el plan Gratis.

### Correo capturado y legible por las pruebas

**CA-9** `[e2e]` Registro de punta a punta con el correo capturado.
- **Dado** un correo único `@e2e.wizydoc.test`,
- **Cuando** el test llena `/register` y pulsa "Crear cuenta",
- **Entonces** llega a `/confirm-email`; en el archivo de capturas aparece un
  correo para esa dirección con asunto `"Confirma tu correo en WizyDoc"`; al
  abrir el enlace `/api/auth/verify-email` que contiene, el navegador llega a
  `/onboarding`; y en `wizydoc_test` el usuario queda con `confirmed = true`.

**CA-10** `[e2e]` Sesión por API y correo legible desde el proyecto `api`.
- **Dado** un usuario creado y confirmado con `createConfirmedUser`,
- **Cuando** el test pide `GET /user/me` con su sesión,
- **Entonces** responde 200 con `confirmed: true` y `accountId: null`, y
  `readLatestEmailTo(email)` devuelve su correo de verificación.

**CA-11** `[manual]` El archivo de capturas es de la corrida actual y su contenido no va al log.
- **Dado** un `emails.jsonl` que quedó de una corrida anterior,
- **Cuando** termina una corrida nueva,
- **Entonces** el archivo sólo contiene líneas de esa corrida, una por correo
  enviado, cada una con `to`, `subject`, `html` y `sentAt` en ISO; y la salida
  del api durante la corrida no contiene el `html` del correo ni el enlace con
  el token.

### Driver de correo falso imposible fuera de test

**CA-12** `[manual]` El api no arranca con `EMAIL_DRIVER=memory` fuera de test.
- **Dado** el api sin `.env.e2e`,
- **Cuando** se arranca con `EMAIL_DRIVER=memory` y `NODE_ENV=production`,
  con `NODE_ENV=development` o sin `NODE_ENV`,
- **Entonces** el proceso termina al arrancar con un error y código distinto
  de 0, sin llegar a escuchar en su puerto.

**CA-13** `[manual]` El driver falso exige archivo de captura.
- **Dado** `EMAIL_DRIVER=memory` y `NODE_ENV=test` sin `EMAIL_CAPTURE_FILE`,
- **Cuando** se arranca el api,
- **Entonces** termina al arrancar con un error que nombra
  `EMAIL_CAPTURE_FILE`.

**CA-14** `[manual]` Producción no cambia.
- **Dado** `EMAIL_DRIVER` vacío o ausente,
- **Cuando** se arranca el api con su configuración de siempre,
- **Entonces** arranca, `/health` responde y la factory devuelve el servicio
  de SES (revisión de código; no se envía un correo real para comprobarlo); y
  `api/.env.example` documenta `EMAIL_DRIVER` y `EMAIL_CAPTURE_FILE` sin que
  producción necesite ninguna variable nueva.

### Coexistencia con `pnpm dev`

**CA-15** `[manual]` La suite corre con el entorno de desarrollo abierto.
- **Dado** `pnpm dev` de platform corriendo en 3000 (y el api de desarrollo
  en 4000, si se usa),
- **Cuando** se corre `pnpm test:e2e`,
- **Entonces** la suite pasa, `platform/.next-e2e/` existe junto a
  `platform/.next/`, y al terminar el `pnpm dev` sigue abierto y una página en
  `http://localhost:3000` carga sin errores de compilación.

**CA-16** `[manual]` La suite nunca prueba contra un servidor ajeno.
- **Dado** un proceso cualquiera escuchando en 4100 o en 3100,
- **Cuando** se corre `pnpm test:e2e`,
- **Entonces** la corrida falla en vez de reutilizar ese servidor.

### Fuera de git

**CA-17** `[manual]` Secretos y artefactos no se pueden commitear por accidente.
- **Dado** una corrida completa con `api/.env.e2e` y `platform/.env.e2e`
  presentes,
- **Cuando** se mira `git status`,
- **Entonces** no aparecen `api/.env.e2e`, `platform/.env.e2e`,
  `platform/.next-e2e/`, `platform/e2e/.artifacts/`,
  `platform/test-results/` ni `platform/playwright-report/`.

### Estabilidad

**CA-18** `[e2e]` La suite pasa de forma estable.
- **Dado** la base de pruebas levantada y sin vaciar entre corridas,
- **Cuando** se corre `pnpm test:e2e` tres veces seguidas (con workers en
  paralelo, sin reintentos),
- **Entonces** las tres corridas terminan en verde con todos los tests de la
  suite, sin ninguno marcado como inestable, sin colisiones de datos entre
  workers ni entre corridas, y sin `test.only` (la config lo rechaza).

### Preguntas para el humano

1. **¿34 tests o 2?** El encargo habla de "la suite actual (34 tests)", pero
   este plan sólo crea dos tests de humo (`register.spec.ts` y
   `smoke.spec.ts`) y en el checkout principal no hay ningún `*.spec.ts`.
   CA-18 dice "todos los tests de la suite" para no fijar un número que el
   plan no respalda. Si los 34 existen en otra rama o worktree, hay que
   decidir si entran en este ticket o en el siguiente. **Recomiendo** cerrar
   este ticket con los dos tests de humo y exigir los 34 en el ticket que los
   añada.
2. **¿Qué es "estable"?** El plan no fija reintentos ni número de corridas.
   CA-18 propone tres corridas seguidas sin reintentos. La alternativa es
   permitir un reintento, que esconde tests inestables. **Recomiendo** tres
   corridas sin reintentos.
3. **¿"Un solo comando" incluye a un desarrollador nuevo?** Hoy no lo cumple:
   tiene que escribir los dos `.env.e2e` sin plantilla (sólo
   `api/.env.example` menciona las variables de correo) y el plan no dice
   cuándo se corre `playwright install chromium` fuera del worktree.
   Opciones: (a) aceptarlo para la beta, con un solo desarrollador; (b)
   añadir plantillas `.env.e2e.example` y un párrafo en el README, lo que
   requiere permitir ese nombre, porque `AGENTS.md` sólo exceptúa
   `.env.example`. **Recomiendo** (b) en un ticket pequeño aparte, antes de
   que el equipo crezca.
