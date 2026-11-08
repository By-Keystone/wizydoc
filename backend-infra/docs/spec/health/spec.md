# Chequeo de salud y rutas que no existen

- **Pedido:** el humano, el 8 de noviembre de 2026, al ver que
  `/sign-up/code` y `/api/auth/sign-up/resend-confirmation` respondían
  «ok» sin existir.
- **Reemplaza a:** la ruta comodín (`{proxy+}`) y la integración por defecto
  que dejó el PR #132, que mandaban cualquier ruta a una Lambda temporal.

## Qué cambia

El gateway sólo responde las rutas declaradas. Una ruta que no existe responde
404, y el chequeo de salud tiene su propia ruta.

## Diferencias con hoy

| Hoy | Con esta spec |
|---|---|
| Cualquier ruta, también una que no existe o una que se quitó, responde `200 {"status":"ok"}`. | Una ruta que no existe responde `404 {"message":"Not found"}`. |
| El chequeo de salud es cualquier ruta. | `GET /health` responde `200 {"status":"ok"}`. |

## Ruta

### `GET /health`

Exige la clave de platform, como todas las rutas del gateway. Responde
`200 {"status":"ok"}`.

## Criterios de aceptación

- `GET /health` responde 200 con `{"status":"ok"}` y exige la clave de
  platform.
- No hay ruta comodín ni método `ANY`: sólo responden las rutas declaradas.
- Una ruta que no existe responde 404 con `{"message":"Not found"}`, no el
  403 «Missing Authentication Token» que da API Gateway por defecto.
