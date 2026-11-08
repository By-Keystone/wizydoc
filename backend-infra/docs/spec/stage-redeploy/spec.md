# La etapa deja de publicar las rutas quitadas

- **Pedido:** el humano, el 8 de noviembre de 2026, al ver que una ruta que
  no existe respondía 500 en su cuenta y en staging después de #147.
- **Completa a:** `docs/spec/health/spec.md`, cuyo criterio «una ruta que no
  existe responde 404» no se cumplía después de quitar el comodín.

## Qué cambia

Después de un despliegue que quita una ruta, la etapa del gateway deja de
publicarla: la ruta quitada responde 404, como cualquier ruta que no existe.

CloudFormation crea el deployment nuevo de la etapa antes de borrar las rutas
quitadas, que se borran en la limpieza del stack. El deployment es una foto de
las rutas al crearse, así que la etapa sigue publicando las rutas quitadas,
contra Lambdas que ya no existen, y responden 500.

## Diferencias con hoy

| Hoy | Con esta spec |
|---|---|
| Una ruta quitada responde 500 hasta el próximo despliegue que cambie las rutas. | Al terminar el despliegue, la ruta quitada responde 404. |
| Agregar una ruta ya funciona: CDK crea el deployment después de la ruta nueva. | Igual. |

## Cómo funciona

Al terminar cada actualización del stack (`UPDATE_COMPLETE`), una Lambda
compara las rutas que publica la etapa con las que tiene el API. Si son
distintas, publica un deployment nuevo de la etapa. Si son iguales, no hace
nada: un despliegue que no quita rutas no crea un deployment de más.

## Fuera de alcance

- La creación del stack: no hay rutas quitadas que limpiar.
- La ventana entre la limpieza y la revisión, de segundos, en la que la ruta
  quitada todavía responde 500.

## Criterios de aceptación

- Si la etapa publica una ruta que el API ya no tiene, se publica un
  deployment nuevo de la etapa.
- Si la etapa publica las mismas rutas que el API, no se crea un deployment.
- La comparación usa todas las páginas de recursos del API.
- Sólo la actualización completa de su propio stack dispara la revisión de la
  etapa.
- La revisión de la etapa sólo lee ese API y sólo crea deployments en él.
