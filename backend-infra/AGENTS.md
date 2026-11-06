# backend-infra/AGENTS.md

Backend serverless de WizyDoc en AWS: la infraestructura con CDK y el código de
las Lambdas, los dos en TypeScript. Reemplaza al api de Railway endpoint por
endpoint (proyecto de Linear «Serverless migration - AWS»); `api/` sigue
intacto hasta el corte. Las reglas del `AGENTS.md` de la raíz siguen valiendo.

## Spec-driven

- Todo endpoint nuevo o cambio de comportamiento empieza por su spec en
  `docs/spec/<slug>/spec.md`, que se aprueba antes de escribir el código. La
  spec y su implementación pueden ir en el mismo PR.
- `spec.md` dice **qué** cambia: el ticket de Linear, el comportamiento, la
  ruta con su entrada y sus respuestas, lo que queda fuera de alcance y los
  criterios de aceptación.
- `plan.md` dice **cómo**: capas, archivos, claves de DynamoDB, permisos e
  infraestructura. Se escribe después de aprobar la spec.
- Una spec describe un cambio y no se edita después del merge. Si el
  comportamiento vuelve a cambiar, va en una spec nueva que cita a la anterior.
- Los criterios de aceptación son una lista, sin códigos. Cada uno tiene al
  menos una prueba que lo verifica, con un nombre que describe lo mismo que el
  criterio.
- El reviewer revisa el diff contra la spec de su ticket.

## Estructura

- `bin/` y `lib/*.ts`: la app y los constructs de CDK.
- `lib/src/<módulo>/`: el código de las Lambdas, por capas. Las dependencias
  apuntan hacia el dominio.
  - `domain/`: entidades con su fábrica, value objects (esquemas de Zod con
    marca) y contratos de repositorio. Sin AWS.
  - `application/`: casos de uso (`<acción>.usecase.ts`, con su esquema de
    entrada) y `ports/` para los servicios externos.
  - `infrastructure/`: las implementaciones con DynamoDB, Cognito y SES.
  - `handlers/`: las Lambdas. Arman las piezas y traducen HTTP, sin lógica de
    negocio.
- `test/`: pruebas de síntesis de CDK y de los casos de uso con dobles en
  memoria.

## DynamoDB

- Una sola tabla on-demand, con `PK` y `SK` de texto y dos índices globales
  genéricos, `GSI1` y `GSI2`. Sin índices locales.
- Las claves llevan el prefijo de su entidad (`USER#<ulid>`,
  `USER_EMAIL#<correo>`, `COGNITO#<sub>`). Un ítem sin otra clave de orden usa
  `SK = "!"`.
- Todo ítem lleva `ItemType` con su tipo (`USER`, `EMAIL_CONFIRMATION`…), y
  quien lee de un índice genérico revisa `ItemType` antes de mapear.
- Los ids son ULID.

## Cognito

- Sólo autentica. El backend crea a los usuarios con `AdminCreateUser`
  (`MessageAction: SUPPRESS`) y `AdminSetUserPassword`, y Cognito no manda
  correos. La confirmación del correo es un dato nuestro (`confirmed`).
- A un usuario se le identifica por el `sub` del token, nunca por el correo:
  el correo de Cognito lo puede cambiar el propio usuario.

## Comandos

```bash
pnpm typecheck   # ← obligatorio antes de dar algo por terminado
pnpm check       # ← obligatorio antes de dar algo por terminado
pnpm test        # pruebas de síntesis, de casos de uso y de criterios
```

`pnpm cdk …` carga `.env` con `dotenv-cli`. Para crearlo, copia `.env.example`.
En GitHub Actions las variables llegan del entorno; dotenv no pisa las que ya
existen, y si `.env` no está, el comando corre igual.

## Despliegue

- Publicar un release `backend-infra-*` corre
  `.github/workflows/backend-infra-production-deployment.yml`:
  - instala con el lockfile;
  - corre `typecheck`, `check` y `test`, y si alguno falla no despliega;
  - hace `cdk deploy` en `us-east-2`.
- El workflow usa el entorno `wizydoc/production` de GitHub y entra a AWS por
  OIDC con el rol de `AWS_DEPLOY_ROLE_ARN`. No hay claves de AWS guardadas en
  GitHub.
- La preparación se hace una sola vez, y la hace el humano:
  1. `pnpm cdk bootstrap aws://<cuenta>/us-east-2`.
  2. En IAM, el proveedor OIDC `token.actions.githubusercontent.com`
     (audiencia `sts.amazonaws.com`) y un rol que confíe sólo en
     `repo:By-Keystone/wizydoc:environment:wizydoc/production`. El rol sólo
     necesita asumir los roles que crea el bootstrap de CDK
     (`arn:aws:iam::<cuenta>:role/cdk-hnb659fds-*-<cuenta>-us-east-2`).
  3. En el entorno `wizydoc/production` de GitHub, las variables
     `AWS_DEPLOY_ROLE_ARN`, `HOSTED_ZONE_ID`, `DOMAIN`, `API_SUBDOMAIN`,
     `FRONTEND_URL`, `EMAIL_FROM` y `TERMS_ACCEPTANCE_REQUIRED`.

## Prohibido sin confirmación explícita

- `cdk deploy`, `cdk bootstrap` o `cdk destroy` contra una cuenta real.
- Lo que ya prohíbe el `AGENTS.md` de la raíz.
