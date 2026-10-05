# Biome como linter y formateador

Estado: **aprobado** el 5 de octubre de 2026. Sin UI.

Decisiones: (1) se reformatea todo el código en este PR, con un commit de
configuración y otro sólo de formato; (2) ancho 80; (3) `useButtonType`,
`useExhaustiveDependencies` y cualquier regla cuya corrección cambie
comportamiento quedan en `"warn"` y se corrigen en otro ticket.

## Objetivo

Que `api/`, `platform/` y `web/` tengan un linter y un formateador que se puedan
usar como verificación (`pnpm check`), con Biome en lugar de ESLint, y que el
código existente quede limpio sin cambiar su comportamiento.

## Punto de partida (leído, sin ejecutar)

- Ningún proyecto tiene Biome. `@biomejs/wasm-nodejs@2.4.13` en
  `api/pnpm-lock.yaml` es transitiva de `mjml-core`, no el linter.
- `platform` y `web`: `"lint": "next lint"`, `eslint ^8` y
  `eslint-config-next ^15`, sin configuración de ESLint. Next instalado: 15.5
  (`next lint` está deprecado desde 15.5 y desaparece en 16).
- `api`: sin script de lint.
- `next.config.ts` de ambos no tiene sección `eslint`.
- Estilo actual (≈316 archivos TS/TSX, ≈19.500 líneas): comillas dobles,
  punto y coma, 2 espacios, sin tabs ni CRLF. Excepciones: `web/src` tiene 27
  imports sin punto y coma; `platform/e2e` está escrito a ≈120 columnas
  (537 líneas de código de más de 80), mientras que `api/src`,
  `platform/src` y `web/src` están casi todo a 80. 11 archivos sin salto de
  línea final y 6 líneas con espacios al final en `api/src`.
- No hay `biome-ignore`, `eslint-disable` ni `@ts-ignore` en el código.

## Alcance

Los tres proyectos. **Un `biome.json` por proyecto**, en `api/`, `platform/` y
`web/`: no hay `package.json` en la raíz y cada proyecto instala y corre sus
herramientas por separado; un `biome.json` raíz obligaría a resolver Biome
desde fuera de cualquier `node_modules`. Los tres archivos son casi iguales;
sólo cambia `files.includes`.

## Cambios

### Dependencias (cada proyecto)

- `@biomejs/biome` en `devDependencies`, **versión exacta** `2.4.13` (sin `^`),
  la misma en los tres.
- `platform` y `web`: quitar `eslint` y `eslint-config-next`.
- Tras quitarlos, comprobar con `pnpm why unrs-resolver` si alguien más lo
  usa; si no, quitar `unrs-resolver: true` de `allowBuilds` en
  `platform/pnpm-workspace.yaml` y `web/pnpm-workspace.yaml` (lo trajo
  `eslint-config-next`). Biome no necesita entrada en `allowBuilds`: usa
  binarios precompilados como dependencias opcionales.
- Los `pnpm-lock.yaml` cambian y se commitean.

### `next build`

Next 15 intenta correr ESLint durante `next build`. Añadir en
`platform/next.config.ts` y `web/next.config.ts`:

```ts
eslint: { ignoreDuringBuilds: true },
```

Así el build no depende de si ESLint está instalado o configurado (hoy no lo
está y sólo avisa). `build:open-next` usa el mismo `next build`.

### Scripts (cada `package.json`)

```json
"lint": "biome lint",
"format": "biome format --write",
"check": "biome check"
```

`check` es de sólo lectura (formato + lint) y es el que se usa como
verificación. `format` es el único que escribe.

### `biome.json` (cada proyecto)

```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "files": { "includes": ["<ver abajo>"] },
  "formatter": { "indentStyle": "space", "indentWidth": 2 },
  "assist": { "actions": { "source": { "organizeImports": "off" } } },
  "linter": { "rules": { "recommended": true } }
}
```

- `indentStyle: "space"` porque el valor por defecto de Biome es tab. Comillas
  dobles, punto y coma y ancho 80 ya son los valores por defecto (ancho: ver
  pregunta 2).
- `organizeImports` apagado: reordenaría los imports de casi todos los
  archivos sin aportar nada a la verificación.
- `files.includes` en lista blanca, en lugar de depender de `.gitignore`, así
  nunca entra nada generado (`.next`, `.next-e2e`, `dist`, `node_modules`,
  `playwright-report`, `test-results`, `.turbo`):
  - `api`: `["src/**", "prisma.config.ts", "verify-*.ts", "*.json"]`. Las
    migraciones son `.sql` y Biome no las procesa; el cliente de Prisma se
    genera en `node_modules`.
  - `platform`: `["src/**", "e2e/**", "*.ts", "*.mjs", "*.json", "!e2e/.artifacts", "!**/*.css"]`.
  - `web`: `["src/**", "*.ts", "*.mjs", "*.json", "!next-env.d.ts", "!**/*.css"]`.
  - CSS fuera: `globals.css` usa `@tailwind`/`@apply` y no aporta nada
    formatearlo.

### Reglas

Base: las recomendadas de Biome 2. Ajustes:

- **`suspicious/noExplicitAny`** (recomendada, error): se mantiene; ya está
  prohibido por convención. Hay 2 casos y se corrigen en este cambio **sólo con
  tipos**, sin cambiar comportamiento:
  `api/src/routes/organization/index.ts` (`request.params as any`) y
  `platform/src/components/clinic/base-form.tsx` (`clinic?: any`).
- **`style/noNonNullAssertion`**: en Biome 2.4.13 es recomendada con severidad
  de aviso; se deja así. Hay 20 usos en api y 11 en platform, casi todos
  después de comprobar que el dato existe.
- **`security/noDangerouslySetInnerHtml`**: 1 caso legítimo, el JSON-LD
  estático de `web/src/app/layout.tsx`. Se suprime en esa línea con
  `// biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD estático, sin datos del usuario`.
- **Reglas cuya corrección puede cambiar el comportamiento**: ver pregunta 3.
  Las conocidas: `a11y/useButtonType` (27 `<button>` sin `type` en
  `platform/src` y `web/src`; poner `type="button"` a uno que hoy envía un
  formulario lo rompe) y `correctness/useExhaustiveDependencies` (31 usos de
  hooks; añadir una dependencia cambia cuándo se ejecuta el efecto).
- Correcciones automáticas: sólo las seguras (`biome check --write`, nunca
  `--unsafe`).

### Código existente

Estimación (Biome no está instalado; no se ha ejecutado):

- **Formato**: con ancho 80, cambian casi todos los archivos de
  `platform/e2e` y `web/src`, y una minoría de `api/src` y `platform/src`
  (líneas largas, finales de archivo, espacios al final). Del orden de miles
  de líneas, todas de formato.
- **Lint**: unas pocas decenas de diagnósticos, sobre todo `useButtonType`,
  `useExhaustiveDependencies`, otras de `a11y` y variables o imports sin usar.
  El engineer corre primero `biome lint` y anota el recuento por regla en el
  resumen final antes de corregir nada.

Opción más simple (recomendada en la pregunta 1): mismo PR, dos commits; el
primero con dependencias, configuración, scripts y documentación, y el segundo
sólo con `pnpm format` y las correcciones seguras.

### Documentación

- `AGENTS.md` raíz:
  - Sustituir "Todavía no hay linter. Se adoptará Biome, no ESLint; hasta
    entonces `pnpm lint` en platform/web no sirve como verificación." por:
    "Linter y formateador: Biome, con un `biome.json` en cada proyecto.
    `pnpm check` verifica formato y lint; `pnpm format` reformatea."
  - Bloque de comandos: añadir `pnpm check` junto a `pnpm typecheck` en api y
    en platform/web, también marcado como obligatorio.
  - Definición de "terminado": "`pnpm typecheck` y `pnpm check` limpios en
    cada proyecto tocado."
- `.claude/agents/engineer.md`, lista final: `pnpm typecheck && pnpm check` en
  api y en platform/web.

## Archivos

- Crear: `api/biome.json`, `platform/biome.json`, `web/biome.json`.
- Modificar: `api/package.json`, `platform/package.json`, `web/package.json`,
  sus `pnpm-lock.yaml`, `platform/pnpm-workspace.yaml` y
  `web/pnpm-workspace.yaml` (si aplica), `platform/next.config.ts`,
  `web/next.config.ts`, `api/src/routes/organization/index.ts`,
  `platform/src/components/clinic/base-form.tsx`, `web/src/app/layout.tsx`,
  `AGENTS.md`, `.claude/agents/engineer.md`.
- Reformateo: el resto de archivos TS/TSX/JSON incluidos.

## Aislamiento entre cuentas

No aplica: no hay datos, rutas ni consultas nuevas.

## Nota operativa (dónde instalar)

- El shell arranca con Node 16, con el que pnpm ni siquiera arranca: `nvm use`
  (lee `.nvmrc`, Node 22) antes de cualquier comando.
- Instalar dependencias requiere confirmación del humano.
- **Recomendado:** implementar en una rama propia desde `origin/main` en el
  checkout principal, donde los `node_modules` son reales:
  `pnpm add -D -E @biomejs/biome@2.4.13` en cada proyecto y
  `pnpm remove eslint eslint-config-next` en platform y web.
- **Si se usa un worktree:** nunca correr `pnpm add/remove/install` con
  `node_modules` enlazados al checkout principal; pnpm reescribiría (o
  purgaría) los módulos del checkout principal. En ese caso, borrar el enlace
  de ese proyecto y hacer un `pnpm install` real dentro del worktree (el store
  de pnpm es compartido, así que es rápido). Para sólo verificar en un worktree
  con módulos enlazados, usar `./node_modules/.bin/biome check` y
  `./node_modules/.bin/tsc --noEmit` en vez de `pnpm …`.
- Tras el merge, el checkout principal necesita `pnpm install` en los tres
  proyectos para tener Biome.

## Riesgos

- Diff de formato grande: dificulta `git blame` y provoca conflictos con ramas
  abiertas (por ejemplo, los worktrees del usuario). Mitigación: commit de
  formato separado y mergear cuando haya pocas ramas abiertas.
- Biome no reproduce todas las reglas de `eslint-config-next`
  (`@next/next/*`, como `no-img-element`). Hoy no se aplica ninguna porque
  ESLint nunca estuvo configurado, así que no se pierde nada.

## Verificación

En cada proyecto, con Node 22:

1. `pnpm typecheck` limpio.
2. `pnpm check` sin errores (los avisos que decida la pregunta 3 se listan en
   el resumen).
3. `git diff --stat` del commit de formato: sólo archivos incluidos en
   `files.includes`, nada generado.
4. `web`: `./node_modules/.bin/next build` termina y no muestra el paso de
   ESLint. `platform`: lo mismo con `NEXT_DIST_DIR=.next-e2e` para no pisar el
   `.next` de desarrollo; si falta configuración local para el build, decirlo
   como no verificado.

Sin e2e: el cambio es de formato y de tipos. Si la pregunta 3 se resuelve
corrigiendo reglas que cambian comportamiento, entonces sí hace falta la suite
e2e de platform.

## Preguntas abiertas

1. **¿Se reformatea todo el código en este cambio?** Opciones: (a) mismo PR,
   un commit de configuración y otro sólo de formato; (b) PR aparte para el
   formato; (c) sólo configurar, sin reformatear. Recomiendo **(a)**: con (c)
   `pnpm check` falla desde el primer día y no sirve como verificación, y (b)
   deja un PR intermedio en el que tampoco sirve.
2. **Ancho de línea: 80 (por defecto de Biome) o 120.** `api/src`,
   `platform/src` y `web/src` ya están casi todo a 80; `platform/e2e` está a
   ≈120. Recomiendo **80**: no necesita configuración y sólo reformatea en
   serio los e2e; con 120, Biome volvería a unir líneas en casi todo el
   código de la app.
3. **Reglas cuya corrección cambia comportamiento** (`useButtonType`,
   `useExhaustiveDependencies` y las que salgan al ejecutar): ¿se corrigen
   aquí, con e2e, o se bajan a `"warn"` y se corrigen en otro ticket?
   Recomiendo **bajarlas a `"warn"`** en este cambio para que quede sólo de
   formato y tipos, y abrir un ticket para corregirlas una a una.
