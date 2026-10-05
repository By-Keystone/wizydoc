# Envío del correo de invitación sin manejar

## Objetivo

Que un correo de invitación que falla (dirección malformada, rechazo de SES o
plantilla rota) no tumbe el api ni deje una invitación creada sin correo, y que
el destinatario no acabe en los logs.

## Modelo de amenaza

- **Quién:** cualquiera. Registrarse da una cuenta propia con rol ADMIN, así que
  `POST /user/invite` está al alcance de cualquier usuario confirmado.
- **Cómo:** `email: z.string()` acepta cualquier texto y, al final de
  `InviteUserUseCase.execute`, `emailService.send(...)` va sin `await` ni
  `.catch`. Si SES rechaza la dirección, la promesa rechazada no la maneja nadie
  y Node 22 termina el proceso: una petición tira el api para todas las clínicas.
- **Fuga:** la traza puede incluir el destinatario, y la ruta además hace
  `console.error({ error })` con el error completo.
- **Inconsistencia:** `renderTemplate` corre después del commit. Si falla, la
  ruta responde 500 con membership e invitación ya creadas, y reintentar choca
  con `@@unique([userId, resourceId])`: no se puede volver a invitar.

## Invariantes

1. Ningún envío de correo del api queda como promesa sin manejar.
2. `POST /user/invite` sólo acepta un correo válido y lo guarda en minúsculas.
3. Si el correo no sale, no queda nada creado (usuario nuevo, membership,
   perfil de doctor, invitación) y reintentar funciona.
4. Los logs de este flujo sólo llevan `errName` / `errCode`, nunca el correo ni
   el nombre del invitado.

## Cambios por capa

**Prisma:** ninguno. Sin migración. **platform:** ninguno
(`invite-user.action.ts` ya valida `z.string().email()` y muestra el `message`
del api en un toast).

**api**

- `api/src/application/use-cases/user/invite-user.usecase.ts`
  - Schema:
    ```ts
    // Better Auth busca al usuario en minúsculas al iniciar sesión.
    email: z.email({ error: "Correo inválido" }).toLowerCase(),
    ```
  - Mover `renderTemplate` y `send`, con `await`, al final del callback de
    `runInTransaction`, tras crear la invitación. El callback deja de devolver
    el objeto intermedio que sólo existía para enviar fuera.
    ```ts
    // Dentro de la transacción: si el correo falla, no queda una membership que impida reintentar.
    await this.services.emailService.send({ html, subject: "WizyDoc - Invitación", to: user.email });
    ```
- `api/src/routes/user/index.ts` (`POST /invite`): `console.error({ error })`
  → `request.log.error({ errName, errCode }, "[invite-user]")`, como en
  `POST /clinic/:resourceId/users/lookup`. La política no cambia.

### Qué ve el administrador si el correo falla

El toast de error actual ("Ha ocurrido un error al invitar al usuario") y la
persona no aparece en la lista, porque no se creó nada. Corrige o reintenta.
Descartado: `.catch` que sólo registra (ve "Invitación enviada", el correo no
llega y no existe "reenviar") y `await` fuera de la transacción (500 con la
invitación creada y reintento bloqueado por el `@@unique`).

## Otros envíos en `api/src`

| Sitio | Estado | Aquí |
| --- | --- | --- |
| `appointment/create-appointment.usecase.ts` | Con `await`, sin transacción y `patientEmail: z.string()`. Si SES rechaza, la cita ya existe, el paciente ve 500 y al reintentar 409 "Ese horario ya no está disponible" | No: la cita debe sobrevivir al fallo del correo, es otro arreglo |
| `vendors/auth/better-auth/auth.ts` | Better Auth lo espera (`runInBackgroundOrAwait`, sin `backgroundTasks`) y valida con `z.email()` | No hace falta |

## Aislamiento entre cuentas

Sin cambios: la sede sigue acotada a `data.accountId` y el usuario de otra
cuenta se sigue rechazando. Normalizar ayuda: `Ana@x.pe` ya no esquiva en
`findUnique` al `ana@x.pe` de otra cuenta creando un usuario duplicado.

## Conflicto con `fix/fix-invite-role-check` (sin mergear)

Esa rama reordena el inicio de la transacción (sede y rol ADMIN antes del
usuario; el `send` queda hacia la línea 201) y reemplaza el mismo
`console.error` de la ruta por `errName`/`errCode` más el mapeo de
`ApplicationError`.

- Caso de uso: hunks distintos; se espera merge limpio. Si choca, conservar el
  orden de role-check y el `send` dentro de la transacción.
- Ruta: conflicto seguro en el `catch`; quedarse con role-check, que ya cumple
  el invariante 4.

## Riesgos

- **SES dentro de la transacción:** Prisma corta la transacción interactiva a
  los 5 s. Si SES tarda más, se revierte y el administrador ve el error; el
  correo pudo salir con un token que no existe (el link dirá que la invitación
  no es válida). Para un DOCTOR, el bloqueo de cuota se mantiene durante el
  envío: sólo serializa invitaciones de la misma cuenta.
- Filas antiguas con mayúsculas: fuera de alcance.

## Verificación

- `cd api && ./node_modules/.bin/tsc --noEmit` (no `pnpm typecheck` en el worktree).
- Deben seguir pasando: `ui/invitations/invite-doctor.spec.ts` y
  `ui/clinic/invite-user-form.spec.ts`.
- e2e nuevo `platform/e2e/api/security/fix-invite-email-send.spec.ts`:
  - `email: "no-es-un-correo"` → 400; sin usuario ni membership nuevos
    (`getTestPrisma`); después `GET /user/me` → 200 (el api sigue vivo).
  - `Ana.Perez.<único>@E2E.wizydoc.test` → 200; usuario guardado y correo
    capturado en minúsculas.
- **Sin cubrir por e2e:** el rechazo de SES. El driver `memory` nunca falla y
  no se añade inyección de fallos a la app; ese camino se verifica por revisión.

## Decisiones abiertas

1. **Booking público.** Recomiendo ticket aparte (`fix-booking-email-send`):
   `z.email()` en `patientEmail` y registrar el fallo del correo sin tumbar la
   reserva. Es ruta pública y merece su propia revisión.
2. **Mensaje específico si falla el correo.** Recomiendo dejarlo para después de
   role-check: en `main` la ruta convierte todo error en 500.

Despliegue: sólo api, sin migración; idealmente después de role-check.

## Criterios de aceptación

Decisión: el booking público queda fuera; va en un ticket aparte (`fix-booking-email-send`).
Decisión: el mensaje propio cuando falla el correo queda para después; se mantiene el toast genérico actual.

- **CA-1** `[e2e]` Dado un ADMIN confirmado, cuando llama a `POST /user/invite`
  con `email: "no-es-un-correo"`, entonces recibe 400 y no se crea usuario,
  membership, perfil de doctor ni invitación.
- **CA-2** `[e2e]` Dado que acaba de ocurrir CA-1, cuando el mismo ADMIN llama a
  `GET /user/me`, entonces recibe 200: el api sigue vivo.
- **CA-3** `[e2e]` Dado un ADMIN confirmado, cuando invita a
  `Ana.Perez.<único>@E2E.wizydoc.test`, entonces recibe 200, el usuario queda
  guardado en minúsculas y el correo capturado va a la dirección en minúsculas.
- **CA-4** `[e2e]` Dado un usuario `ana.<único>@e2e.wizydoc.test` de otra
  cuenta, cuando un ADMIN lo invita como `ANA.<único>@E2E.wizydoc.test`,
  entonces se rechaza igual que con la dirección en minúsculas y no se crea un
  segundo usuario ni membership en la sede del ADMIN.
- **CA-5** `[e2e]` Dado un ADMIN en el panel, cuando invita a un doctor y a un
  usuario con correos válidos, entonces ve "Invitación enviada", ambos aparecen
  en la lista y cada correo capturado lleva su link de invitación
  (`invite-doctor.spec.ts` e `invite-user-form.spec.ts` siguen pasando).
- **CA-6** `[manual]` Dado el api local con SES de pruebas en sandbox, cuando un
  ADMIN invita a una dirección no verificada (SES la rechaza), entonces ve el
  toast de error, el api sigue respondiendo, no queda usuario nuevo, membership,
  perfil de doctor ni invitación, y al reintentar con una dirección verificada
  la invitación se crea sin chocar con el `@@unique`.
- **CA-7** `[manual]` Dado el fallo de CA-6, cuando se revisa la salida del api,
  entonces la línea de `[invite-user]` sólo lleva `errName` / `errCode`, sin el
  correo ni el nombre del invitado, y no aparece ninguna promesa rechazada sin
  manejar.
