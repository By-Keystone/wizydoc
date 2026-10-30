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

## Escribir una prueba nueva

- Cada prueba crea sus propios datos con nombres y correos únicos
  (`uniqueEmail`, `uniqueName`) y no depende del orden ni de otras pruebas: la
  base no se vacía entre corridas.
- Las pruebas que vienen de un plan llevan el ID del criterio de aceptación en
  el título (`CA-3: …`); los criterios están al final de cada
  `docs/features/<slug>/plan.md`. Lo que cubre la suite lo dicen los nombres
  de los specs y sus títulos: este README no lleva la lista.
- Revisa los helpers de `support/` antes de escribir uno nuevo.
- Importa `test`/`expect` de `support/test.ts`, no de `@playwright/test`: su
  fixture cierra al terminar cada prueba los `APIRequestContext` de
  `createApiContext` (y de `createOnboardedAdmin`, `createMemberWithRole`…).
- Un `APIRequestContext` por actor: el registro inicia sesión solo y deja su
  cookie en el contexto.
- Selectores accesibles en español (`getByRole`, `getByLabel`, `getByText`).
- Las páginas de organización y de sede cargan el recurso del id de la URL, no
  de las cookies `resource_id` y `resource_type` que pone "Entrar" en
  `/select`. Las cookies sólo deciden adónde llevan `/`, `/login` y
  `/onboarding`. Con una sola sede el login entra directo a su dashboard y no
  las escribe: no las des por puestas.
- Una prueba que necesite la lista de `/select` con una sola sede abre
  `/select?switch=1`; sin `switch`, esa URL redirige al dashboard.
- El correo de cada envío queda en `e2e/.artifacts/emails.jsonl`; los enlaces
  vienen escapados en HTML y `email.ts` ya los decodifica.

## Particularidades conocidas

- Cualquier ruta inexistente del api responde `401 Route has no policy
  declared`, no 404, por el hook global de `policy`.
- En un worktree con `api/node_modules` enlazado al checkout principal no uses
  `pnpm` dentro de `api/` (pnpm 11 intenta reinstalar); la suite ya llama a
  `./node_modules/.bin/...` directamente. Lo mismo en `platform/`: `pnpm
  test:e2e` aborta con `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`; corre
  `./node_modules/.bin/playwright test`.
- `pnpm test:e2e -- <archivo>` no filtra: esta versión de pnpm reenvía el `--`
  literal a Playwright y corre toda la suite. Para un subconjunto, llama al
  binario directo: `./node_modules/.bin/playwright test <archivo>`.
