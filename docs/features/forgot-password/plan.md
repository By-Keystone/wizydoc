# Plan — forgot-password

## Objetivo

Que quien olvidó su contraseña pueda crear una nueva desde el login, con un
enlace de un solo uso que llega a su correo y dura 1 hora, sin revelar nunca qué
correos tienen cuenta en WizyDoc. Al crear la contraseña nueva se cierran todas
las sesiones abiertas.

Rama `feat/forgot-password`, apilada sobre `fix/auth-rate-limit-ip` (todavía no
está en `main`). El diff de `auth.ts` de este plan parte del archivo **con ese
arreglo ya aplicado**.

Leyenda de certeza: **[código]** lo verifiqué leyendo el código del repo o de
`api/node_modules/better-auth@1.6.22`; **[inferencia]** es deducción.

## Cómo funciona hoy Better Auth 1.6.22 (lo que el plan usa)

Archivo: `better-auth/dist/api/routes/password.mjs`.

- **[código]** `POST /request-password-reset` `{ email, redirectTo? }`. Si no
  hay `emailAndPassword.sendResetPassword`, responde 400
  `RESET_PASSWORD_DISABLED`. Hoy no está configurado: la ruta existe pero no
  sirve.
- **[código]** Exista o no el correo, responde **200 con el mismo cuerpo**:
  `{ status: true, message: "If this email exists in our system, check your email for the reset link" }`.
  Si no existe, simula el trabajo (`generateId(24)` y una lectura de
  `verification`) para emparejar tiempos. Correo inválido: 400 de Zod, igual
  para todos.
- **[código]** Si existe: crea una fila `verification` con
  `identifier = "reset-password:<token>"`, `value = userId` y
  `expiresAt = ahora + resetPasswordTokenExpiresIn` (por defecto 3600 s). El
  token es `generateId(24)`: 24 caracteres `[A-Za-z0-9]`, unos 143 bits.
  Luego llama a `sendResetPassword({ user, url, token })` con
  `runInBackgroundOrAwait`: **sin `advanced.backgroundTasks` lo espera**, así que
  el tiempo del envío de correo se suma a la respuesta sólo cuando el correo
  existe (ver «Riesgos», enumeración por tiempo).
- **[código]** No mira si el usuario tiene contraseña (`credential`) ni si
  confirmó su correo: manda el correo a cualquier fila de `user`.
- **[código]** `POST /reset-password` `{ newPassword, token }`. Valida largo
  (8–128 por defecto, igual que el registro y el perfil), **consume** el token
  dentro de una transacción (lo borra; una segunda petición con el mismo token
  recibe `INVALID_TOKEN`) y comprueba la expiración. **Si el usuario no tiene
  cuenta `credential`, se la crea** con la contraseña nueva. Después llama a
  `onPasswordReset({ user })` y, **después de eso**, si
  `revokeSessionsOnPasswordReset` es `true`, borra todas las sesiones del
  usuario. No marca el correo como confirmado.
- **[código]** Errores de `POST /reset-password`: 400 `INVALID_TOKEN` (falta,
  vencido, usado o inventado: no los distingue), 400 `PASSWORD_TOO_SHORT`,
  400 `PASSWORD_TOO_LONG`.
- **[código]** `GET /reset-password/:token?callbackURL=...` comprueba el token
  sin consumirlo y redirige a `callbackURL?token=...` o
  `callbackURL?error=INVALID_TOKEN`. **Este plan no lo usa** (ver «Decisiones»,
  D-1).
- **[código]** Un token pedido antes sigue valiendo hasta que vence, aunque se
  pida otro o se use otro: `consume` sólo borra las filas con el mismo
  `identifier`.
- **[código]** `verification.storeIdentifier` permite guardar el identificador
  con hash (`"hashed"`), también sólo para un prefijo
  (`{ default: "plain", overrides: { "reset-password:": "hashed" } }`). Al
  consumir, Better Auth prueba el valor con hash y el plano.
- **[código]** Límite de intentos por defecto (sólo con `NODE_ENV=production`):
  `/request-password-reset` 3 cada 60 s; `/reset-password` cae en la regla
  general, 100 cada 10 s. `customRules` las pisa. No hay alias activo: la ruta
  vieja `/forget-password` ya no existe en 1.6.22 (sólo la usa el plugin
  `email-otp`, que no está instalado).
- **[código]** Hoy la tabla `verification` sólo la usaría esta función: la
  confirmación de correo de Better Auth usa un JWT, sin fila, y la otra ruta que
  escribe ahí (`delete-user`) no está habilitada.

## Decisiones

**D-1. El enlace lleva el token en el fragmento (`#token=...`), no en la ruta
ni en la query.** El correo apunta a
`${FRONTEND_URL}/reset-password#token=<token>`. El navegador nunca manda el
fragmento al servidor ni en el `Referer`: el token no queda en los logs de
Railway de platform, ni en el log de Fastify, ni en analíticas. La página lo lee
en el cliente y lo manda en el **cuerpo** de `POST /api/auth/reset-password`
(los cuerpos no se registran).
- Descartado: el `url` que arma Better Auth
  (`/api/auth/reset-password/<token>?callbackURL=...` → redirige a
  `/reset-password?token=...`). Pondría el token en la ruta del api (el
  serializador de Fastify lo registraría) y en la query de platform (logs HTTP de
  Railway, historial sincronizado).
- Costo: la página no sabe si el enlace sirve hasta que se envía el formulario.
  Si el fragmento falta o no tiene la forma de un token, muestra «Este enlace ya
  no sirve» enseguida; si está vencido o usado, lo muestra al guardar. Ver P-4.
- Un escáner de correo que abre el enlace (Outlook Safe Links y similares) no
  gasta el token: abrir la página no consume nada.

**D-2. El correo se envía sin `await` dentro de `sendResetPassword`.** Así la
respuesta tarda lo mismo exista o no el correo. El caso de uso atrapa sus
propios errores y sólo registra el id del usuario. No se usa
`advanced.backgroundTasks` porque es global: también cambiaría el correo de
confirmación del registro, que hoy se espera.

**D-3. El enlace usa `FRONTEND_URL`,** la misma variable con la que
`invite-user.usecase.ts` arma el enlace de invitación. En e2e ya apunta a
platform (`:3100`), y el correo de invitación pendiente (D-5) reutiliza ese
mismo enlace. En producción `FRONTEND_URL`, `CLIENT_ORIGIN` y `BETTER_AUTH_URL`
deben ser el origen público de platform (P-5). Si `FRONTEND_URL` falta, no se
envía nada y se registra el error con el id del usuario: nunca un enlace a
`localhost`.

**D-4. Mismas reglas de contraseña que el registro y el perfil:** 8 a 128
caracteres, un solo campo con «Mostrar»/«Ocultar». No se pide repetirla: el
botón «Mostrar» cumple esa función y es lo que ya hace «Mi perfil».

**D-5. Invitado que todavía no creó su contraseña → correo de invitación
pendiente, nunca el de recuperación.** (Caso 7a de la propuesta.)
- Por qué no el de recuperación: `POST /reset-password` le **crearía** una
  cuenta `credential` (ver arriba). Con eso:
  - no podría entrar, porque su correo sigue sin confirmar
    (`requireEmailVerification`) y el login responde `EMAIL_NOT_VERIFIED`;
  - el enlace de su invitación dejaría de servir, porque `set-password`
    rechaza a quien ya tiene contraseña («Ya tienes una contraseña…»);
  - y saltaría la invitación: si se marcara su correo como confirmado, entraría
    aunque la invitación hubiera vencido o el administrador no la quisiera
    renovar.
- Qué recibe, según su invitación más reciente con membership viva
  (`deletedAt: null`):
  - **Vigente** (`INVITED`, sin `acceptedAt`, `expiresAt` futuro): correo
    «Tu invitación a WizyDoc sigue pendiente» con el botón «Aceptar invitación»,
    que es el mismo enlace de su invitación (`/invite/accept?token=...`). Ahí
    crea su contraseña.
  - **Vencida:** el mismo correo, sin botón, con «Pide a quien te invitó que te
    envíe una nueva». Renovar la invitación sigue siendo decisión del
    administrador.
- Por qué no «no enviar nada»: la persona quedaría sin saber qué pasa y
  escribiría al consultorio. El correo le dice qué hacer.
- **No revela nada:** la pantalla y la respuesta del api son idénticas; el
  correo distinto sólo lo ve el dueño de la bandeja.
- El token de recuperación que Better Auth crea igual para esta persona nunca
  sale del servidor (no se envía) y vence en 1 hora.

Invitación ya aceptada pero sin `credential` (dato inconsistente: `accept-invitation` exige
contraseña): recibe el correo de recuperación normal, porque no queda nada que aceptar y
crear la contraseña es la forma de entrar.

**D-6. Correo sin confirmar → recibe el de recuperación y, al crear la
contraseña, su correo queda confirmado.** (Caso 7b.)
- Es quien se registró y no abrió el correo de confirmación (tiene `credential`
  y `confirmed = false`).
- Abrir el enlace de recuperación prueba lo mismo que abrir el de confirmación:
  que controla esa bandeja. Si no se confirmara, «Listo, ya puedes iniciar
  sesión» terminaría en un login que lo rechaza, un callejón sin salida.
- Lo hace `onPasswordReset` (ver «Cambios por capa»). Como `onboardingCompleted`
  sigue en `false`, al entrar va al onboarding, igual que tras confirmar.
- Caso «alguien registró mi correo antes que yo»: quien lo registró no recibe
  el enlace y su contraseña deja de servir. La persona dueña del correo queda con
  la cuenta (sin cuenta de consultorio todavía) y puede corregir nombre y celular
  en «Mi perfil».

**D-7. Usuario «borrado».** (Caso 7c.) En el código no existe borrar un usuario:
`User` no tiene `deletedAt` ni hay caso de uso que lo borre. Lo que existe es
**quitar a alguien de una sede u organización** (`membership.deletedAt`).
- **Quitado de todos lados, con contraseña:** recibe el correo de
  recuperación como cualquiera. Hoy ya puede iniciar sesión con su contraseña de
  siempre; lo que lo deja sin datos es que la política exige una membership viva,
  no la contraseña. Bloquear la recuperación no le quitaría ningún acceso y sí
  sumaría una rama que revela un estado distinto si algún día se nota.
- **Quitado antes de aceptar su invitación (sin contraseña):** no recibe nada.
  No tiene invitación viva que recordar, y no se le puede volver a invitar
  («fue eliminada de este recurso»).
- **Fila de `user` borrada a mano en la base:** Better Auth no la encuentra;
  respuesta idéntica y ningún correo.
- **Para el futuro:** si se agrega desactivar o borrar usuarios, ese ticket
  debe cortar también el login y la recuperación. Lo dejo escrito en el
  comentario del caso de uso.

**D-8. Al crear la contraseña nueva se borran los demás enlaces pendientes de
esa persona.** Si pidió dos enlaces, o un tercero tiene uno viejo, ninguno sirve
después de usar uno. Lo hace `onPasswordReset` con
`verification.deleteMany({ where: { value: userId } })`: en esta configuración
sólo la recuperación escribe filas con `value = userId` (ver arriba). El
comentario lo advierte para cuando se agregue otro plugin que use la tabla.

**D-9. El token se guarda con hash** (`storeIdentifier` sólo para el prefijo
`reset-password:`). Quien lea la tabla `verification` (un respaldo, la consola
de Railway) no puede usar un enlace pendiente.

**D-10. Sin sesión automática.** Al guardar se va a `/login?reset=ok` con el
aviso «Listo, ya puedes iniciar sesión con tu contraseña nueva.» Better Auth no
inicia sesión en `reset-password`, y así la persona prueba la contraseña que
acaba de crear.

**D-11. Las llamadas salen del navegador con `authClient`, no con server
actions.** Es el patrón del login, el registro y el cambio de contraseña. Pasan
por el rewrite `/api/auth/*`, que lleva la `x-real-ip` del borde de Railway:
el límite de Better Auth cuenta por la IP de la persona. Una server action
llegaría con la IP de platform y todos compartirían un cupo.

**D-12. Disponible en todos los planes, también Gratis.** Es acceso a la cuenta,
no una función de pago: no hay 402.

## Requiere confirmación del humano

`api/src/infrastructure/vendors/auth/better-auth/auth.ts` es un archivo
protegido. Diff exacto propuesto, sobre el archivo con el arreglo de
`fix/auth-rate-limit-ip` ya aplicado (único cambio en ese archivo):

```diff
--- a/api/src/infrastructure/vendors/auth/better-auth/auth.ts
+++ b/api/src/infrastructure/vendors/auth/better-auth/auth.ts
@@ -1,10 +1,16 @@
 import { prisma } from "@/infrastructure/postgres/client";
 import { betterAuth } from "better-auth";
 import { prismaAdapter } from "better-auth/adapters/prisma";
 import { createEmailService } from "@/infrastructure/services/email-service/factory";
 import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";
+import { FinishPasswordResetUseCase } from "@/application/use-cases/auth/finish-password-reset.usecase";
+import { SendPasswordResetEmailUseCase } from "@/application/use-cases/auth/send-password-reset-email.usecase";
 
 const emailService = createEmailService();
+const sendPasswordResetEmail = new SendPasswordResetEmailUseCase({
+  emailService,
+});
+const finishPasswordReset = new FinishPasswordResetUseCase();
 
 const auth = betterAuth({
   baseURL: process.env.BETTER_AUTH_URL,
@@ -30,8 +36,23 @@ const auth = betterAuth({
     customRules: {
       "/sign-in/email": { window: 60, max: 5 },
       "/change-password": { window: 60, max: 5 },
+      // Cada pedido manda un correo a alguien que quizá no lo pidió: 3 cada
+      // 10 minutos por IP (Better Auth trae 3 por minuto) para que el
+      // formulario no sirva para llenarle la bandeja a otra persona.
+      "/request-password-reset": { window: 600, max: 3 },
+      // El token no se puede adivinar (~143 bits); esto sólo saca la ruta de la
+      // regla general de 100 cada 10 s, igual que cambiar la contraseña.
+      "/reset-password": { window: 60, max: 5 },
     },
   },
+  verification: {
+    // El enlace de recuperación se guarda con hash: quien lea la tabla (un
+    // respaldo, una consola) no puede usar uno pendiente.
+    storeIdentifier: {
+      default: "plain",
+      overrides: { "reset-password:": "hashed" },
+    },
+  },
   session: {
     // Ventana de sesión: 7 días. Como es rodante, un usuario activo no se
     // desloguea; solo caduca tras 7 días de inactividad.
@@ -44,6 +65,24 @@ const auth = betterAuth({
     enabled: true,
     autoSignIn: true,
     requireEmailVerification: true,
+    // Explícito aunque es el valor por defecto: el correo dice "1 hora".
+    resetPasswordTokenExpiresIn: 60 * 60,
+    // Quien pide el enlace suele sospechar que alguien más entró: al crear la
+    // contraseña nueva se cierran todas las sesiones, también la del intruso.
+    revokeSessionsOnPasswordReset: true,
+    // Sin await: armar y enviar el correo sólo pasa si el correo existe, y esa
+    // demora revelaría qué correos tienen cuenta. El caso de uso atrapa sus
+    // errores y nunca registra el token ni el enlace. Se ignora `url`: el
+    // enlace lleva el token en el fragmento (docs/features/forgot-password).
+    sendResetPassword: async ({ user, token }) => {
+      void sendPasswordResetEmail.execute({ userId: user.id, token });
+    },
+    // Better Auth lo llama después de guardar la contraseña y antes de cerrar
+    // las sesiones; si lanzara, las sesiones quedarían abiertas. Por eso el
+    // caso de uso no lanza.
+    onPasswordReset: async ({ user }) => {
+      await finishPasswordReset.execute({ userId: user.id });
+    },
   },
   account: { modelName: "authAccount" },
   user: {
```

**Por qué cada parte:**

- `customRules` de `/request-password-reset`: la regla de 3 cada 10 minutos de
  la propuesta (punto 6). Reemplaza a la de Better Auth (3 por minuto), que es
  más floja, así que la cubre. Como todo el límite, sólo se aplica con
  `NODE_ENV=production` y depende de que Railway reemplace `X-Real-IP` (P1 de
  `fix-auth-rate-limit-ip`, aún pendiente).
- `customRules` de `/reset-password`: fuerza bruta (ver «Riesgos»).
- `verification.storeIdentifier`: D-9.
- `resetPasswordTokenExpiresIn`: 1 hora, la que dice el correo.
- `revokeSessionsOnPasswordReset`: punto 4 de la propuesta.
- `sendResetPassword`: D-2 y D-5 (el caso de uso decide qué correo mandar).
- `onPasswordReset`: D-6 y D-8.
- Los casos de uso no importan `auth.ts`, así que no hay import circular.

No se tocan `api/src/plugins/auth.ts`, `policy.ts` ni `entitlements.ts`.

## Cambios por capa

### Prisma

Ninguno. `Verification`, `Session`, `AuthAccount`, `User.confirmed` y
`UserInvitation` ya existen. No requiere migración.

### api

| Archivo | Cambio |
| --- | --- |
| `api/src/infrastructure/vendors/auth/better-auth/auth.ts` | **Protegido.** El diff de arriba, sólo si el humano lo autoriza. |
| `api/src/application/use-cases/auth/send-password-reset-email.usecase.ts` (nuevo) | `sendPasswordResetEmailSchema` y `SendPasswordResetEmailUseCase`. Ver abajo. |
| `api/src/application/use-cases/auth/finish-password-reset.usecase.ts` (nuevo) | `finishPasswordResetSchema` y `FinishPasswordResetUseCase`. Ver abajo. |
| `api/src/infrastructure/services/email-service/templates/reset-password.mjml` (nuevo) | Correo de recuperación. |
| `api/src/infrastructure/services/email-service/templates/pending-invitation.mjml` (nuevo) | Correo de invitación pendiente, con y sin botón. |
| `api/src/infrastructure/services/email-service/template-renderer.ts` | Agregar `"reset-password"` y `"pending-invitation"` a `EmailTemplate` y sus variables a `TemplateVariables`. |
| `api/src/server.ts` | En `requestSerializer`, tapar también `/reset-password/<token>` (la ruta `GET` de Better Auth, que no usamos pero sigue respondiendo). Defensa por si alguien la llama. |
| `api/verify-auth-rate-limit.ts` | Casos nuevos f y g (ver «Verificación»). |

**Sin rutas propias nuevas.** Todo pasa por `/api/auth/*`, que ya tiene
`policy({ public: true })` en `server.ts`. No hay `requireFeature` (D-12).

#### `SendPasswordResetEmailUseCase`

```ts
export const sendPasswordResetEmailSchema = z.object({
  userId: z.uuid(),
  token: z.string().regex(/^[A-Za-z0-9]{24}$/),
});
```

`execute(dto)` **nunca lanza** (lo llaman sin `await`): todo va en un
`try/catch` que registra `[password-reset]: no se pudo enviar el correo al usuario <id>`
y el `error.name`, nunca el token, el enlace ni el correo.

Métodos privados, en este orden:

1. `findRecipient(userId)`: `user.findUnique` con `id`, `email`, `name` y la
   cuenta `credential` (`authaccounts: { where: { providerId: "credential" } }`).
   Si no existe, no hace nada.
2. Con `credential` → `sendResetEmail`: enlace
   `new URL("/reset-password", FRONTEND_URL)` con
   `hash = "token=" + token`; plantilla `reset-password`; asunto
   **«Crea tu contraseña nueva de WizyDoc»**. Vale igual para quien no confirmó
   su correo (D-6) y para quien fue quitado de sus sedes (D-7).
3. Sin `credential` → `findLatestLiveInvitation(userId)`:
   `userInvitation.findFirst({ where: { membership: { userId, deletedAt: null } }, orderBy: { expiresAt: "desc" }, include: resource con clinic y organization })`.
   - Ninguna → no envía nada (D-7).
   - `status === "INVITED"`, `acceptedAt` nulo y `expiresAt > ahora` →
     `inviteUrl = ${FRONTEND_URL}/invite/accept?token=${invitation.token}`
     (mismo formato que `invite-user.usecase.ts`).
   - Si no → `inviteUrl = null`.
   - Plantilla `pending-invitation`, asunto **«Tu invitación a WizyDoc sigue pendiente»**,
     `resourceName` = nombre de la sede o de la organización (igual que
     `verify-invitation-token.usecase.ts`).
4. Registra `[password-reset]: correo <reset|pending-invitation> enviado al usuario <id>`
   (como `[sign-up]` en `auth.ts`).

Constructor: `{ emailService: IEmailService }`, como `InviteUserUseCase`.
`FRONTEND_URL` ausente → registra el error y no envía (D-3).

#### `FinishPasswordResetUseCase`

```ts
export const finishPasswordResetSchema = z.object({ userId: z.uuid() });
```

`execute(dto)` **nunca lanza** (ver el comentario de `onPasswordReset`). En una
transacción (`inTransaction`):

1. `user.updateMany({ where: { id, confirmed: false }, data: { confirmed: true } })` (D-6).
2. `verification.deleteMany({ where: { value: userId } })` (D-8), con el
   comentario de por qué `value = userId` sólo atrapa enlaces de recuperación en
   esta configuración.

Error → registra `[password-reset]: no se pudo cerrar la recuperación del usuario <id>`
y sigue. La contraseña ya está guardada y las sesiones se cierran igual.

#### Plantillas (mismo estilo que `confirm-email.mjml`)

`reset-password.mjml` — variables `{ name: string; resetUrl: string }`:

> **Hola {{name}},**
>
> Recibimos un pedido para crear una contraseña nueva para tu cuenta de
> WizyDoc. Para hacerlo, haz clic en el botón:
>
> **[Crear contraseña nueva]** (`#0E8C82`)
>
> El enlace vence en 1 hora y sirve una sola vez. Al crear tu contraseña nueva
> cerraremos tu sesión en todos tus dispositivos. *(14px, `#5C6B6A`)*
>
> Si no lo pediste, ignora este correo; tu contraseña no cambia. *(14px, `#5C6B6A`)*

`pending-invitation.mjml` — variables
`{ name: string; resourceName: string; inviteUrl: string | null }`:

- Con `inviteUrl`:
  > **Hola {{name}},**
  >
  > Pediste recuperar tu contraseña, pero todavía no tienes una: te invitaron a
  > **{{resourceName}}** y aún no aceptaste la invitación. Acéptala y crea tu
  > contraseña desde este botón:
  >
  > **[Aceptar invitación]**
  >
  > Es el mismo enlace de tu invitación y vence 1 día después de que te la
  > enviaron. Si venció, pide a quien te invitó que te envíe una nueva.
  >
  > Si no lo pediste, puedes ignorar este correo.
- Sin `inviteUrl` (`{{#if inviteUrl}}…{{else}}…{{/if}}`):
  > **Hola {{name}},**
  >
  > Pediste recuperar tu contraseña, pero todavía no tienes una: te invitaron a
  > **{{resourceName}}** y la invitación venció antes de que la aceptaras.
  >
  > Pide a quien te invitó que te envíe una nueva desde WizyDoc. Con ella
  > podrás crear tu contraseña.
  >
  > Si no lo pediste, puedes ignorar este correo.

### platform

| Archivo | Cambio |
| --- | --- |
| `platform/src/app/(auth)/login/page.tsx` | Leer `reset` de `searchParams` y pasar `passwordReset={reset === "ok"}` a `LoginForm`. |
| `platform/src/app/(auth)/login/login-form.tsx` | Enlace «¿Olvidaste tu contraseña?» debajo del campo de contraseña, a `/forgot-password`. Aviso verde (`role="status"`) cuando `passwordReset`. |
| `platform/src/app/(auth)/forgot-password/page.tsx` (nuevo) | Server component; `metadata` con `title` y `robots: noindex`. Renderiza `ForgotPasswordForm`. |
| `platform/src/app/(auth)/forgot-password/forgot-password-form.tsx` (nuevo) | Cliente. Formulario y pantalla «Revisa tu correo». `authClient.requestPasswordReset({ email })`. |
| `platform/src/app/(auth)/reset-password/page.tsx` (nuevo) | Server component; `metadata` con `robots: { index: false, follow: false }` y `referrer: "no-referrer"` (como `appointment/manage/[token]/layout.tsx`). Renderiza `ResetPasswordForm`. |
| `platform/src/app/(auth)/reset-password/reset-password-form.tsx` (nuevo) | Cliente. Lee el token de `window.location.hash`; formulario, «Este enlace ya no sirve». `authClient.resetPassword({ newPassword, token })`. |
| `platform/src/components/common/form/password-input.tsx` | **Movido** desde `src/components/profile/password-input.tsx`, sin cambios de comportamiento: ahora lo usan el perfil y la recuperación. Exportarlo en `common/form/index.ts`. |
| `platform/src/components/profile/password-card.tsx` | Importar `PasswordInput` desde `@/components/common/form`. |
| `platform/src/middleware.ts` | Agregar `/forgot-password` y `/reset-password` a `PUBLIC_PATHS`. |

No se tocan `next.config.ts` (el rewrite `/api/auth/:path*` ya cubre las dos
rutas) ni `src/lib/auth/session.ts`.

### e2e

| Archivo | Cambio |
| --- | --- |
| `platform/e2e/ui/auth/forgot-password.spec.ts` (nuevo) | Flujo en el navegador, ver «Verificación». |
| `platform/e2e/api/security/forgot-password.spec.ts` (nuevo) | Contratos del api, ver «Verificación». |
| `platform/e2e/support/password-reset.ts` (nuevo) | `readResetLink(email)` (último correo con asunto «Crea tu contraseña nueva de WizyDoc», `extractLink(html, "/reset-password#token=")`), `expireResetTokens(userId)` y `countResetTokens(userId)` (por `value = userId`; el identificador está con hash). |
| `platform/e2e/support/db.ts` | Tipar `verification` (`count`, `updateMany`, `findMany`) en `TestPrisma`. |
| `platform/e2e/README.md` | Filas de los dos specs nuevos. |

## Contrato de cada paso

Todas las peticiones salen del navegador hacia platform y el rewrite las lleva
al api. No hay rutas propias de Fastify.

### 1. Pedir el enlace

`POST /api/auth/request-password-reset`

```json
{ "email": "ana.lopez@consultorio.pe" }
```

| Caso | Respuesta | Correo |
| --- | --- | --- |
| Usuario con contraseña (confirmado o no, con o sin sedes) | 200 `{ status: true, message: "If this email exists…" }` | «Crea tu contraseña nueva de WizyDoc» |
| Invitado sin contraseña, invitación vigente | 200, mismo cuerpo | «Tu invitación a WizyDoc sigue pendiente», con botón |
| Invitado sin contraseña, invitación vencida | 200, mismo cuerpo | El mismo, sin botón |
| Invitado sin contraseña, quitado de todos lados | 200, mismo cuerpo | Ninguno |
| Correo sin cuenta | 200, mismo cuerpo | Ninguno |
| Correo con forma inválida | 400 (Zod de Better Auth) | Ninguno; platform no lo envía |
| 4.º pedido de la misma IP en 10 minutos (producción) | 429, `X-Retry-After` ≤ 600 | Ninguno |

Platform no muestra el `message` en inglés: ante cualquier 200 enseña la
pantalla «Revisa tu correo».

### 2. El enlace

`${FRONTEND_URL}/reset-password#token=<24 caracteres [A-Za-z0-9]>`. Vale 1 hora
y una vez. Abrirlo no consume nada.

### 3. Crear la contraseña nueva

`POST /api/auth/reset-password`

```json
{ "newPassword": "…", "token": "…" }
```

| Caso | Respuesta | Qué hace platform |
| --- | --- | --- |
| Token válido, 8–128 caracteres | 200 `{ status: true }`; contraseña guardada, correo confirmado, otros enlaces y **todas las sesiones** borrados | `router.replace("/login?reset=ok")` |
| Token vencido, usado, inventado o ausente | 400 `INVALID_TOKEN` | Pantalla «Este enlace ya no sirve» |
| Menos de 8 / más de 128 | 400 `PASSWORD_TOO_SHORT` / `PASSWORD_TOO_LONG` (platform lo valida antes) | Error en el campo |
| 6.º intento de la misma IP en un minuto (producción) | 429 | Aviso arriba del botón |
| Otro error o sin red | — | Aviso genérico arriba del botón |

## Aislamiento entre cuentas

- **Sin endpoint propio nuevo.** Los dos endpoints públicos son de Better Auth y
  reciben sólo `email` o `token`. No reciben ids de cuenta, sede ni usuario.
- **El correo de recuperación** se arma con el `userId` que Better Auth encontró
  por correo exacto, y va a ese mismo correo. No lee datos de ninguna cuenta.
- **El correo de invitación pendiente** lee las invitaciones de **ese mismo
  `userId`** (con membership viva). Un usuario pertenece a una sola cuenta
  (`invite-user` rechaza correos de otra cuenta), así que el nombre de la sede u
  organización es de su propia cuenta y va a su propia bandeja.
- **`FinishPasswordResetUseCase`** escribe sólo sobre el `userId` que salió del
  token consumido por Better Auth.
- **No se revela si un correo existe:** misma respuesta HTTP y misma pantalla en
  todos los casos; tiempos parecidos (D-2); el correo distinto sólo lo ve quien
  controla la bandeja.

## Riesgos de seguridad

| Riesgo | Mitigación | Lo que queda |
| --- | --- | --- |
| **Enumeración por respuesta** | Better Auth responde igual; platform muestra siempre el mismo texto; el 429 es por IP, no por correo. | — |
| **Enumeración por tiempo** | Envío sin `await` (D-2). Si el correo no existe, Better Auth simula la lectura. | Con correo existente hace un `INSERT` y sin él un `SELECT`: diferencia de pocos ms, enmascarada por la red. Aceptable. |
| **Enumeración por el registro** | Fuera de alcance. Según el README de e2e, `fix-auth-user-fields-input.spec.ts` ya comprueba que el registro no revela si un correo existe. | — |
| **Robo del token en logs** | Fragmento, no ruta ni query (D-1); cuerpo de `POST` no se registra; ningún log con token, enlace ni correo; serializador de Fastify tapa `/reset-password/<token>`. | El archivo del driver `memory` guarda el HTML (sólo e2e). |
| **Robo del token en `Referer` o historial** | El fragmento no viaja en el `Referer`; `referrer: no-referrer`; `noindex`; al terminar, `router.replace` saca la URL con token del historial. | Mientras la página está abierta, el token se ve en la barra de direcciones. |
| **Robo del token en la base** | Guardado con hash (D-9). | — |
| **Robo del token en la bandeja** | Dura 1 hora, sirve una vez, al usarse borra los demás (D-8) y cierra todas las sesiones. | Quien controla la bandeja controla la cuenta: es el modelo de todo login con correo. |
| **Reutilización** | Better Auth lo consume en transacción; la segunda petición recibe `INVALID_TOKEN`. Los demás enlaces de la persona se borran (D-8). | — |
| **Fuerza bruta del token** | 24 caracteres `[A-Za-z0-9]` (~143 bits) + 5 intentos por minuto por IP. | Sólo en producción y por IP (P1 heredada). |
| **Bombardeo de correos a otra persona** | 3 pedidos cada 10 minutos por IP. | Con muchas IPs se puede insistir; ver P-3. |
| **Sesión del intruso** | `revokeSessionsOnPasswordReset`: se borran todas, sin excepción. | — |
| **Invitado que salta su invitación** | Nunca recibe un token de recuperación (D-5). | El token que Better Auth crea no sale del servidor y vence en 1 hora. |
| **Cuenta registrada por otro con mi correo** | La recuperación deja la cuenta en manos de quien controla el correo y cierra todo (D-6). | Quedan el nombre y el celular que puso el otro; se editan en «Mi perfil». |
| **`onPasswordReset` que falla** | El caso de uso no lanza: las sesiones se cierran igual. | Si falla, el correo no queda confirmado (queda en el log con el id). |

## Riesgos y decisiones abiertas

- **P-1. ¿Correo de invitación pendiente para el invitado sin contraseña (D-5)?**
  Recomiendo que sí. La alternativa es no enviar nada: más simple (sin plantilla
  ni consulta de invitaciones), pero la persona no sabe por qué no le llega nada.
- **P-2. ¿La recuperación confirma el correo de quien no lo confirmó (D-6)?**
  Recomiendo que sí. Sin eso, quien se registró y no confirmó termina en un login
  que lo rechaza.
- **P-3. ¿Hace falta un tope por correo, además del de IP?** Por ejemplo, 3
  correos de recuperación por persona cada hora, cuenten de la IP que cuenten.
  Recomiendo dejarlo para después: el de IP cubre el caso común, y uno por correo
  necesita guardar contadores en la base (la tabla `verification` no sirve, el
  identificador está con hash).
- **P-4. ¿Se acepta que «enlace vencido o usado» se vea al guardar y no al
  abrir (D-1)?** Es el costo de no exponer el token en logs. La alternativa
  (token en la query y validación al abrir) lo deja en los logs HTTP de
  platform.
- **P-5. ¿En Railway, `FRONTEND_URL` del api es el origen público de platform?**
  Ya lo usa el enlace de invitación, así que debería. Sólo hace falta
  confirmarlo.
- **Heredada: P1 de `fix-auth-rate-limit-ip`.** Si Railway no reemplaza el
  `X-Real-IP` del cliente, el límite por IP no sirve en ninguna ruta, tampoco en
  estas.

Fuera de alcance, lo anoto:
- El login muestra en inglés el `message` de Better Auth para el correo sin
  confirmar («Email not verified»). Merece su propio ticket.
- El serializador de Fastify registra la query de `/api/auth/verify-email`, que
  lleva el JWT de confirmación. Es anterior a este ticket; lo dejo para el
  ticket que lo arregle.

## Verificación

### e2e (`NODE_ENV=test`, correo `memory`)

El límite de intentos está apagado en e2e (ver `fix-auth-rate-limit-ip`): los
429 de la interfaz se prueban simulando la respuesta con `page.route`; el límite
real, con el script.

**`ui/auth/forgot-password.spec.ts`** (Chromium):

1. **Punta a punta.** Usuario confirmado con `createConfirmedUser`. Otro
   contexto de API inicia sesión con él («otro dispositivo») y
   `get-session` devuelve la sesión. En el navegador: `/login` →
   «¿Olvidaste tu contraseña?» → escribe el correo → «Enviar enlace» → ve
   «Revisa tu correo» con el texto exacto. Lee el enlace con `readResetLink`,
   comprueba que tiene `#token=` y no `?token=`, lo abre, escribe una contraseña
   nueva, «Guardar contraseña» → llega a `/login?reset=ok` con el aviso
   «Listo, ya puedes iniciar sesión con tu contraseña nueva.». Luego:
   - `signIn` con la contraseña vieja → 401;
   - `loginViaUi` con la nueva → entra;
   - el contexto del «otro dispositivo» → `get-session` nulo.
2. **Enlace reutilizado.** Abrir otra vez el mismo enlace y guardar → «Este
   enlace ya no sirve»; «Pedir otro enlace» lleva a `/forgot-password`.
3. **Enlace vencido.** Pedir uno, `expireResetTokens(userId)`, abrirlo y
   guardar → «Este enlace ya no sirve». La contraseña no cambió.
4. **Enlace alterado.** `/reset-password#token=abc` y `/reset-password` sin
   fragmento → «Este enlace ya no sirve» sin enviar nada.
5. **Correo inexistente.** Mismo texto de «Revisa tu correo»; después de 2 s,
   ningún correo capturado para esa dirección.
6. **Invitado sin contraseña.** Con `invitePendingUser`: pide el enlace → mismo
   texto en pantalla; llega «Tu invitación a WizyDoc sigue pendiente» con un
   enlace que contiene `/invite/accept?token=`; no llega el de recuperación;
   `countCredentialAccounts` sigue en 0. Con `backdateInvitationExpiry`: llega el
   mismo asunto sin ese enlace.
7. **Correo sin confirmar.** `signUp` sin confirmar → recuperar → crear la
   contraseña → `loginViaUi` entra y va a `/onboarding`.
8. **Validación.** Correo vacío o inválido muestra el error del campo y no hace
   la petición; contraseña de 7 caracteres muestra «Tu contraseña nueva debe
   tener al menos 8 caracteres.» y no hace la petición; «Mostrar» cambia el
   `type` a `text` y su `aria-label` a «Ocultar contraseña nueva».
9. **429 simulados.** En `/forgot-password`: «Hiciste varios pedidos seguidos.
   Espera 10 minutos y vuelve a intentarlo.». En `/reset-password`: «Hiciste
   varios intentos seguidos. Espera un minuto y vuelve a intentarlo.». Ninguno
   con el texto en inglés, y el formulario sigue disponible.
10. **375 px.** Con `viewport: { width: 375, height: 780 }`, en las tres
    pantallas (login con aviso, «Recupera tu contraseña» con un correo largo en
    «Revisa tu correo», «Crea tu contraseña nueva» y «Este enlace ya no sirve»):
    `document.documentElement.scrollWidth <= 375`.

**`api/security/forgot-password.spec.ts`** (sin navegador, a través de
platform):

- **Respuesta idéntica.** `POST /api/auth/request-password-reset` con: usuario
  confirmado, sin confirmar, invitado vigente, invitado vencido, invitado quitado
  y correo inexistente. Todos: mismo estado (200), mismo cuerpo JSON, sin
  `set-cookie`.
- **Token con hash.** Tras pedir uno, ninguna fila de `verification` contiene el
  token del enlace en `identifier`.
- **Un solo uso y borrado de los demás.** Pedir dos enlaces, usar el segundo →
  200; usar el primero → 400 `INVALID_TOKEN`; usar otra vez el segundo → 400
  `INVALID_TOKEN`; `countResetTokens(userId) === 0`.
- **Correo confirmado.** Usuario sin confirmar → tras `reset-password`,
  `confirmed === true`.
- **Invitado:** tras pedir el enlace, `countCredentialAccounts === 0` y su
  invitación sigue `INVITED`.

### Script `api/verify-auth-rate-limit.ts` (límite real)

Casos nuevos, con correos aleatorios que no existen (no se envía ningún correo):

- **f.** 4 `POST /request-password-reset` con `x-real-ip: 203.0.113.30`: los 3
  primeros 200, el 4.º 429 con `X-Retry-After` entre 1 y 600. Justo después,
  `x-real-ip: 203.0.113.31` → 200.
- **g.** 6 `POST /reset-password` con un token inventado y
  `x-real-ip: 203.0.113.32`: los 5 primeros 400, el 6.º 429.

Mismo comando que en `fix-auth-rate-limit-ip`.

### Manual

- Logs: correr el flujo completo en local con el api en una terminal y buscar
  el token del enlace en su salida → no aparece. Buscar también `reset-password/`
  seguido de 24 caracteres → no aparece.
- Revisar en el diff que ningún `console.*` nuevo incluye `token`, `url`,
  `resetUrl`, `inviteUrl` ni `email`.
- `pnpm typecheck` y `pnpm check` en `api/` y `platform/`; `pnpm test:e2e`
  completo.
- Mockup: `npx -y lavish-axi docs/features/forgot-password/mockup.html`.

## Pasos para el engineer

0. **No empieces sin la autorización del humano** del diff de `auth.ts` y sin
   respuesta a P-1 a P-5.
1. Plantillas `reset-password.mjml` y `pending-invitation.mjml` con los textos
   de este plan; tipos en `template-renderer.ts`.
2. `SendPasswordResetEmailUseCase` y `FinishPasswordResetUseCase` en
   `api/src/application/use-cases/auth/`. Ninguno lanza; ninguno registra
   token, enlace ni correo. Comentario en el primero sobre D-5 y D-7 (incluido
   «si se agrega borrar usuarios, cortar también la recuperación»), y en el
   segundo sobre por qué `value = userId` es seguro hoy.
3. Aplica en `auth.ts` exactamente el diff autorizado.
4. `server.ts`: regex `RESET_PASSWORD_TOKEN_IN_URL = /(\/reset-password\/)[^/?\s]*/`
   en `requestSerializer`.
5. Mueve `PasswordInput` a `components/common/form/` y actualiza
   `password-card.tsx`.
6. `middleware.ts`, login (enlace y aviso), `/forgot-password` y
   `/reset-password` según «UI» y el mockup.
7. Casos f y g del script; specs e2e y helpers; filas del README.
8. `pnpm typecheck` y `pnpm check` en `api/` y `platform/`, el script y
   `pnpm test:e2e`. En el resumen final, di qué verificaste y que el límite real
   en Railway depende de P1 heredada.

## UI

### Rutas y layout

Las tres pantallas viven en el grupo `(auth)` y usan su `layout.tsx` actual:
fondo `bg-gradient-to-br from-brand-surface via-white to-brand-surface`, logo
arriba a la izquierda (enlace a `/login`), tarjeta centrada `max-w-md`, pie con
el copyright. Son públicas (middleware) y no dependen de rol ni de plan.

| Ruta | Pantalla |
| --- | --- |
| `/login` | Login actual + enlace + aviso de éxito |
| `/forgot-password` | «Recupera tu contraseña» → «Revisa tu correo» |
| `/reset-password#token=…` | «Crea tu contraseña nueva» / «Este enlace ya no sirve» |

### Árbol de componentes

```
(auth)/layout.tsx                                  existente
├─ login/page.tsx                                  existente (lee ?reset=ok)
│  └─ LoginForm { callbackUrl?, passwordReset? }   existente, prop nueva
│     ├─ aviso verde (role="status")               nuevo, inline
│     ├─ <input type="password">                   existente
│     ├─ <Link href="/forgot-password">            nuevo, inline
│     └─ Button                                    components/ui/button.tsx
├─ forgot-password/page.tsx                        nuevo
│  └─ ForgotPasswordForm (sin props)               nuevo
│     ├─ Input name="email"                        components/common/form/input.tsx
│     ├─ Button                                    components/ui/button.tsx
│     └─ «Revisa tu correo» (MailCheck)            mismo bloque que confirm-email/page.tsx
└─ reset-password/page.tsx                         nuevo
   └─ ResetPasswordForm (sin props)                nuevo
      ├─ PasswordInput                             components/common/form/password-input.tsx (movido)
      ├─ Button                                    components/ui/button.tsx
      └─ «Este enlace ya no sirve» (XCircle)       mismo bloque que invite/accept/page.tsx
```

Componentes nuevos: sólo `ForgotPasswordForm` y `ResetPasswordForm`, uno por
ruta, como `LoginForm` y `AcceptInviteForm`. Las tarjetas de estado («Revisa tu
correo», «Este enlace ya no sirve») copian el marcado de `confirm-email` e
`invite/accept`; no se extraen a un componente porque cada una tiene un texto y
una acción distintos.

### Qué alimenta cada parte

- `ForgotPasswordForm`: sólo lo que escribe la persona. La respuesta del api no
  cambia nada en pantalla (siempre la misma).
- `ResetPasswordForm`: el token del fragmento y el `error.code` de Better Auth
  (`INVALID_TOKEN`, `PASSWORD_TOO_SHORT`, `PASSWORD_TOO_LONG`) o
  `error.status === 429`.
- `LoginForm`: `?reset=ok`.

### Estados

| Pantalla | Estado | Qué se ve |
| --- | --- | --- |
| Login | Normal | Como hoy + «¿Olvidaste tu contraseña?» alineado a la derecha bajo el campo de contraseña (`text-sm font-medium text-brand-teal`). |
| Login | Tras crear la contraseña | Aviso `bg-emerald-50 text-emerald-700` arriba del formulario: «Listo, ya puedes iniciar sesión con tu contraseña nueva.» |
| Recupera | Normal | Título «Recupera tu contraseña»; texto «Escribe el correo con el que entras a WizyDoc y te enviaremos un enlace para crear una contraseña nueva.»; campo «Correo electrónico» (`placeholder="ana@consultorio.com"`); botón «Enviar enlace»; enlace «Volver a iniciar sesión». |
| Recupera | Carga | Botón deshabilitado con `Loader2` y «Enviando…». El campo queda `readOnly`. |
| Recupera | Error de campo | Vacío: «Escribe tu correo.» Inválido: «Escribe un correo válido, por ejemplo ana@consultorio.com.» Debajo del campo, borde rojo. |
| Recupera | 429 | Aviso `bg-red-50 text-red-600` sobre el botón: «Hiciste varios pedidos seguidos. Espera 10 minutos y vuelve a intentarlo.» |
| Recupera | Error genérico / sin red | «No pudimos enviar el enlace. Revisa tu conexión y vuelve a intentarlo.» |
| Recupera | Enviado | Ícono `MailCheck` en `bg-brand-teal/10`; título «Revisa tu correo»; «Si hay una cuenta con ese correo, te enviamos un enlace para crear una contraseña nueva. Revisa tu bandeja y la carpeta de spam.»; «Correo que escribiste: **{correo}**» (`break-all`); «El enlace dura 1 hora.»; botón «Volver a iniciar sesión»; «¿Lo escribiste mal o no llegó? Pide otro enlace» (vuelve al formulario con el correo escrito). |
| Crea | Carga (leyendo el enlace) | Tarjeta con `Loader2` y «Cargando…». Dura lo que tarda en hidratarse. |
| Crea | Normal | Título «Crea tu contraseña nueva»; texto «Usa entre 8 y 128 caracteres. Al guardarla cerramos tu sesión en todos tus dispositivos.»; `PasswordInput` «Contraseña nueva» (`placeholder="Mínimo 8 caracteres"`, `autoComplete="new-password"`); botón «Guardar contraseña». |
| Crea | Carga | Botón deshabilitado con `Loader2` y «Guardando…». |
| Crea | Error de campo | «Tu contraseña nueva debe tener al menos 8 caracteres.» / «Tu contraseña nueva puede tener hasta 128 caracteres.» (mismos textos que «Mi perfil»). |
| Crea | 429 | «Hiciste varios intentos seguidos. Espera un minuto y vuelve a intentarlo.» |
| Crea | Error genérico | «No pudimos guardar tu contraseña. Vuelve a intentarlo.» |
| Crea | Enlace inválido | Ícono `XCircle` en `bg-red-100`; título «Este enlace ya no sirve»; «Los enlaces duran 1 hora y sirven una sola vez. Pide otro y ábrelo desde el correo más reciente.»; botón «Pedir otro enlace»; enlace «Volver a iniciar sesión». |
| Todas | Vacío | No aplica: no hay listas. |
| Todas | 403 | No aplica: son públicas y no dependen de membership. |
| Todas | 402 | No aplica: disponible en todos los planes (D-12). |

### Interacciones

- **«¿Olvidaste tu contraseña?»** → `/forgot-password`. No arrastra el correo
  escrito en el login: el correo nunca va en una URL (regla del formulario de
  invitar).
- **«Enviar enlace»**: valida en el cliente (`noValidate`, Zod `z.email()`);
  si pasa, `authClient.requestPasswordReset({ email })`. 200 → pantalla
  «Revisa tu correo» en la misma ruta (estado del componente, sin cambiar la
  URL). Sin toasts: el resultado ocupa la tarjeta.
- **«Pide otro enlace»**: vuelve al formulario con el correo ya escrito.
- **Al abrir `/reset-password`**: lee `window.location.hash`. Si no hay
  `token` o no cumple `^[A-Za-z0-9]{16,128}$`, muestra «Este enlace ya no sirve»
  sin llamar al api (el patrón no se acopla al largo exacto de Better Auth).
- **«Guardar contraseña»**: valida largo; `authClient.resetPassword({ newPassword, token })`.
  - 200 → `router.replace("/login?reset=ok")` (reemplaza la entrada del
    historial que tenía el token).
  - `INVALID_TOKEN` → estado «Este enlace ya no sirve» y
    `history.replaceState(null, "", "/reset-password")` para sacar el token de
    la barra.
- **«Pedir otro enlace»** → `/forgot-password`.
- Si la persona tiene sesión abierta en ese navegador, puede usar las dos
  pantallas igual; al guardar, su sesión también se cierra.

### Diferencias por rol

Ninguna. ADMIN, DOCTOR y USER ven lo mismo; el rol es de una membership y aquí
todavía no hay sesión. Lo único que cambia es el correo (D-5 a D-7), nunca la
pantalla.

### Accesibilidad

- Campos con `<label>` asociado (`Input` y `PasswordInput` ya lo hacen); error
  con `aria-invalid`, `aria-describedby` y `role="alert"` (lo pone `Field`).
- Error de envío (429, genérico): `role="alert"`. Aviso del login:
  `role="status"`.
- Al validar con error, el foco va al campo inválido (como `password-card`).
- Al pasar a «Revisa tu correo» o a «Este enlace ya no sirve», el foco va al
  título (`<h1 tabIndex={-1}>`), para que el lector de pantalla anuncie el
  cambio.
- «Mostrar»/«Ocultar»: botón con `aria-label` «Mostrar contraseña nueva» /
  «Ocultar contraseña nueva» (ya lo hace `PasswordInput`).
- Orden de tabulación del login: correo → contraseña → «¿Olvidaste tu
  contraseña?» → «Iniciar sesión» → «Regístrate gratis». Enter en el campo de
  contraseña sigue enviando el formulario.
- Orden en «Recupera»: logo → correo → «Enviar enlace» → «Volver a iniciar
  sesión». En «Crea»: logo → contraseña → «Mostrar» → «Guardar contraseña».
- Objetivos táctiles: botones `h-10` a ancho completo; los enlaces de texto con
  `py-1` para llegar a 40 px de alto en el celular.
- A 375 px: tarjeta a ancho completo con `px-4` del layout; el correo largo se
  corta con `break-all`. Sin desplazamiento horizontal.

## Criterios de aceptación

Leyenda: **[e2e]** lo cubre Playwright, con el correo capturado del driver
`memory`; **[script]** lo comprueba `api/verify-auth-rate-limit.ts` (el único
lugar fuera de Railway donde el límite está activo); **[manual]** lo comprueba
el engineer o el reviewer leyendo el código o corriendo un comando;
**[humano, post-despliegue]** lo hace el humano en el entorno de prueba de
Railway, después de desplegar esta rama.

En e2e el api corre con `NODE_ENV=test` y el límite de Better Auth está apagado:
los 429 de la interfaz se prueban simulando la respuesta con `page.route`, y el
límite real, con el script.

Como el correo sale sin `await` (D-2), puede quedar escrito en el archivo de
correos un instante después de la respuesta: las pruebas que lo leen esperan a
que aparezca (con un tope de unos segundos) en lugar de leerlo una sola vez.

### Pedir el enlace: la misma respuesta para todos

- **CA-1 [e2e]** `POST /api/auth/request-password-reset` a través de platform
  con el correo de: un usuario confirmado, uno sin confirmar, un invitado con
  invitación vigente, uno con invitación vencida, uno quitado de todos lados y un
  correo que no existe. Todas las respuestas tienen el mismo estado (200), el
  mismo cuerpo JSON y ninguna trae `set-cookie`.
- **CA-2 [e2e]** En `/forgot-password`, con esos mismos correos (al menos
  existente, inexistente e invitado vigente), la pantalla que sigue a «Enviar
  enlace» es idéntica salvo el correo escrito: título «Revisa tu correo», el
  texto «Si hay una cuenta con ese correo, te enviamos un enlace para crear una
  contraseña nueva. Revisa tu bandeja y la carpeta de spam.», «Correo que
  escribiste: {correo}» y «El enlace dura 1 hora.». La URL no cambia y no
  contiene el correo. Ningún texto en inglés de Better Auth aparece en pantalla.
- **CA-3 [e2e]** **Sin diferencia de tiempo apreciable.** 10 pedidos con el
  correo de un usuario con contraseña y 10 con correos que no existen,
  intercalados: la mediana del tiempo de respuesta de los primeros no supera en
  más de 100 ms a la de los segundos.
- **CA-4 [manual]** En `auth.ts`, `sendResetPassword` no espera el envío
  (`void`), y `SendPasswordResetEmailUseCase.execute` atrapa todos sus errores:
  si el envío falla, la respuesta sigue siendo la de CA-1.
- **CA-5 [e2e]** Correo vacío: «Escribe tu correo.»; correo sin dominio
  completo (`ana.lopez@consultorio`): «Escribe un correo válido, por ejemplo
  ana@consultorio.com.». En los dos casos el campo queda con borde rojo y no sale
  ninguna petición a `request-password-reset`.
- **CA-6 [e2e]** «¿Lo escribiste mal o no llegó? Pide otro enlace» vuelve al
  formulario con el correo ya escrito. «Volver a iniciar sesión» lleva a
  `/login`.

### El correo de recuperación

- **CA-7 [e2e]** El usuario con contraseña recibe un solo correo con asunto
  «Crea tu contraseña nueva de WizyDoc», que dice «Hola {nombre},», tiene el
  botón «Crear contraseña nueva» y los textos «El enlace vence en 1 hora y sirve
  una sola vez.», «Al crear tu contraseña nueva cerraremos tu sesión en todos tus
  dispositivos.» y «Si no lo pediste, ignora este correo; tu contraseña no
  cambia.». No contiene `{{`.
- **CA-8 [e2e]** El enlace del botón empieza por el origen de platform
  (`FRONTEND_URL`, en e2e `:3100`) seguido de `/reset-password#token=` y 24
  caracteres `[A-Za-z0-9]`. No contiene `?token=`, `/api/auth/` ni
  `callbackURL`.
- **CA-9 [e2e]** Tras pedir el enlace, ninguna fila de `verification` tiene el
  token del enlace en `identifier` (está guardado con hash).
- **CA-10 [manual]** Con el api y platform corriendo en local, recorrer el flujo
  completo y buscar en la salida de las dos terminales el token del enlace y el
  texto `reset-password/` seguido de caracteres: no aparecen. Las líneas
  `[password-reset]` sólo traen el id del usuario, nunca el correo, el token ni el
  enlace. Ningún `console.*` nuevo del diff registra `token`, `url`, `resetUrl`,
  `inviteUrl` ni `email`.
- **CA-11 [manual]** El `requestSerializer` de `server.ts` tapa el token de
  `GET /api/auth/reset-password/<token>`: al llamar esa ruta con un token
  inventado, el log del api no lo muestra.
- **CA-12 [manual]** Con `FRONTEND_URL` vacío en el api local, pedir el enlace
  responde igual que en CA-1, no se envía ningún correo y el log registra el
  error con el id del usuario, sin el correo.

### El enlace: un solo uso y vence a la hora

- **CA-13 [e2e]** La fila de `verification` del enlace vence entre 59 y 61
  minutos después de pedirlo.
- **CA-14 [e2e]** **Abrir el enlace no lo gasta.** Abrir la página del enlace
  dos veces (como haría un escáner de correo) y luego guardar una contraseña
  nueva funciona.
- **CA-15 [e2e]** **Un solo uso.** Tras crear la contraseña, abrir otra vez el
  mismo enlace y guardar muestra «Este enlace ya no sirve» con «Los enlaces
  duran 1 hora y sirven una sola vez. Pide otro y ábrelo desde el correo más
  reciente.»; la barra de direcciones queda en `/reset-password`, sin el token.
  «Pedir otro enlace» lleva a `/forgot-password`.
- **CA-16 [e2e]** **Vencido.** Con el enlace vencido por Prisma, abrirlo y
  guardar muestra «Este enlace ya no sirve», y la contraseña anterior sigue
  sirviendo para iniciar sesión.
- **CA-17 [e2e]** **Los demás enlaces dejan de servir.** Pedir dos enlaces y
  usar el segundo: el primero responde 400 `INVALID_TOKEN`, el segundo otra vez
  también, y la persona no queda con ninguna fila de `verification`.
- **CA-18 [e2e]** **Enlace incompleto.** `/reset-password#token=abc`,
  `/reset-password` sin fragmento y `/reset-password?token=<token válido>` (en la
  query, no en el fragmento) muestran «Este enlace ya no sirve» sin hacer ninguna
  petición a `reset-password`.

### La contraseña nueva

- **CA-19 [e2e]** En «Crea tu contraseña nueva», 7 caracteres muestran «Tu
  contraseña nueva debe tener al menos 8 caracteres.» y 129 muestran «Tu
  contraseña nueva puede tener hasta 128 caracteres.», sin petición en ninguno
  de los dos casos. Con exactamente 8 caracteres se guarda.
- **CA-20 [e2e]** Directo contra el api: 7 caracteres → 400
  `PASSWORD_TOO_SHORT`, 129 → 400 `PASSWORD_TOO_LONG`, y en ninguno de los dos se
  gasta el token (después, el mismo token con 128 caracteres → 200).
- **CA-21 [e2e]** «Mostrar» cambia el campo a texto visible y su nombre
  accesible a «Ocultar contraseña nueva»; «Ocultar» lo vuelve a ocultar sin
  borrar lo escrito.
- **CA-22 [e2e]** **La contraseña anterior deja de servir.** Tras guardar,
  iniciar sesión con la anterior responde 401 y con la nueva entra.
- **CA-23 [e2e]** **Se cierran las sesiones de otro dispositivo.** Un segundo
  contexto con sesión abierta antes del cambio («otro dispositivo») tiene
  `get-session` nulo después de guardar. Si el mismo navegador tenía sesión, al
  guardar también se cierra.

### La llegada al login

- **CA-24 [e2e]** Al guardar, la persona llega a `/login?reset=ok` sin sesión
  iniciada y ve arriba del formulario «Listo, ya puedes iniciar sesión con tu
  contraseña nueva.» dentro de un elemento `role="status"`.
- **CA-25 [e2e]** `/login` y `/login?reset=otra-cosa` no muestran ese aviso.
- **CA-26 [e2e]** El login tiene «¿Olvidaste tu contraseña?» debajo del campo de
  contraseña y lleva a `/forgot-password` sin arrastrar el correo escrito en el
  login (ni en la URL ni en el campo).

### El invitado sin contraseña

- **CA-27 [e2e]** **Invitación vigente.** Ve la misma pantalla de CA-2 y recibe
  un solo correo con asunto «Tu invitación a WizyDoc sigue pendiente», con el
  nombre de la sede u organización que lo invitó y el botón «Aceptar invitación»,
  cuyo enlace es `/invite/accept?token=` con el token de su invitación. No recibe
  el de recuperación. Sigue con 0 cuentas `credential` y su invitación sigue
  `INVITED`.
- **CA-28 [e2e]** Desde el botón de ese correo ve el formulario de contraseña de
  la invitación, la crea y entra, como con el correo de invitación original.
- **CA-29 [e2e]** **Invitación vencida.** Recibe el mismo asunto, sin enlace a
  `/invite/accept` y con «Pide a quien te invitó que te envíe una nueva desde
  WizyDoc.». Sigue con 0 cuentas `credential`.
- **CA-30 [e2e]** **Quitado antes de aceptar** (membership borrada): ve la misma
  pantalla y no recibe ningún correo, igual que un correo que no existe.

### El correo sin confirmar y otros casos

- **CA-31 [e2e]** Quien se registró sin confirmar su correo recibe el correo de
  recuperación; al crear la contraseña queda con `confirmed = true`, inicia
  sesión con la nueva y llega a `/onboarding`. La contraseña del registro ya no
  sirve.
- **CA-32 [e2e]** Un usuario con contraseña quitado de todas sus sedes recibe el
  correo de recuperación como cualquiera.
- **CA-33 [e2e]** El administrador de una cuenta Gratis recupera su contraseña
  de punta a punta: en ningún paso aparece la mejora de plan ni un 402.

### Límites de intentos

- **CA-34 [e2e]** Con el 429 simulado en `/forgot-password`: «Hiciste varios
  pedidos seguidos. Espera 10 minutos y vuelve a intentarlo.»; en
  `/reset-password`: «Hiciste varios intentos seguidos. Espera un minuto y vuelve
  a intentarlo.». Ninguno muestra texto en inglés y el formulario sigue
  disponible con lo escrito.
- **CA-35 [e2e]** Sin red (petición abortada) en `/forgot-password`: «No pudimos
  enviar el enlace. Revisa tu conexión y vuelve a intentarlo.»; en
  `/reset-password`, con un 500 simulado: «No pudimos guardar tu contraseña.
  Vuelve a intentarlo.».
- **CA-36 [script]** Caso f: 4 `POST /request-password-reset` desde la misma IP,
  con correos que no existen: los 3 primeros 200 y el 4.º 429 con
  `X-Retry-After` entre 1 y 600. Justo después, desde otra IP, 200.
- **CA-37 [script]** Caso g: 6 `POST /reset-password` con un token inventado
  desde la misma IP: los 5 primeros 400 y el 6.º 429.
- **CA-38 [manual]** El cambio en `auth.ts` es exactamente el diff autorizado el
  18 de octubre de 2026. No cambian `api/src/plugins/auth.ts`, `policy.ts` ni
  `entitlements.ts`.

### En el celular (375 px)

- **CA-39 [e2e]** Con un viewport de 375 × 780, no hay desplazamiento horizontal
  (`scrollWidth <= 375`) en: el login con el aviso, «Recupera tu contraseña» con
  el error de campo, «Revisa tu correo» con el correo
  `recepcion.consultorio.pediatrico.san.borja@clinicasanmartindeporres.com.pe`,
  «Crea tu contraseña nueva» con el error de campo y «Este enlace ya no sirve».
- **CA-40 [e2e]** A 375 px, los botones ocupan el ancho de la tarjeta y
  «¿Olvidaste tu contraseña?», «Volver a iniciar sesión» y «Pide otro enlace»
  miden al menos 40 px de alto.

### Accesibilidad

- **CA-41 [e2e]** Al enviar con un error de campo, el foco va al campo inválido,
  que tiene `aria-invalid="true"` y `aria-describedby` apuntando al mensaje, y el
  mensaje tiene `role="alert"`.
- **CA-42 [e2e]** Al pasar a «Revisa tu correo», el foco queda en ese título.
  Al pasar a «Este enlace ya no sirve», tanto al abrir un enlace incompleto como
  al guardar con uno usado, el foco queda en ese título.
- **CA-43 [e2e]** Los avisos de 429 y de error genérico tienen `role="alert"`.
- **CA-44 [e2e]** En el login, con el teclado: correo → contraseña →
  «¿Olvidaste tu contraseña?» → «Iniciar sesión» → «Regístrate gratis». Enter en
  el campo de contraseña sigue iniciando sesión. En «Crea tu contraseña nueva»:
  contraseña → «Mostrar» → «Guardar contraseña».
- **CA-45 [manual]** Con un lector de pantalla (NVDA en Windows o VoiceOver en
  el celular): al llegar a `/login?reset=ok` se lee el aviso «Listo, ya puedes
  iniciar sesión…»; al pasar a «Revisa tu correo» o a «Este enlace ya no sirve»
  se lee el título; los errores se leen al aparecer.
- **CA-46 [e2e]** `/forgot-password` y `/reset-password` abren sin sesión, tienen
  `noindex`, y `/reset-password` tiene `referrer` `no-referrer`.

### Calidad

- **CA-47 [manual]** `pnpm typecheck` y `pnpm check` limpios en `api/` y
  `platform/`. No hay migración nueva. `platform/e2e/README.md` tiene las filas
  de los dos specs nuevos.
- **CA-48 [e2e]** La suite e2e completa pasa, en particular
  `ui/profile/profile-password.spec.ts` (usa el `PasswordInput` movido) y los
  flujos de registro, login e invitación.

### Después de desplegar, en el entorno de prueba de Railway

Antes de empezar: el entorno de prueba tiene desplegada esta rama. Necesitas un
correo tuyo con cuenta en ese entorno, tu computadora y tu celular. Si usas
Gmail, puedes crear correos de prueba agregando `+prueba1`, `+prueba2`… antes de
la `@`: llegan a tu misma bandeja. No copies en el PR ni en chats los enlaces que
recibas.

- **CA-49 [humano, post-despliegue]** **El flujo completo.**
  1. En el celular, inicia sesión con tu cuenta de prueba y déjala abierta.
  2. En la computadora, abre el login y pulsa «¿Olvidaste tu contraseña?».
     Escribe tu correo y pulsa «Enviar enlace». Esperado: «Revisa tu correo».
  3. Abre tu bandeja (y spam). Esperado: llega «Crea tu contraseña nueva de
     WizyDoc» en menos de 2 minutos.
  4. Antes de pulsar el botón, pasa el mouse encima (o mantén presionado en el
     celular) para ver el enlace. Esperado: empieza por la dirección de platform
     del entorno de prueba (la misma que usas para entrar), seguida de
     `/reset-password#token=`. No es `localhost` ni la dirección del api.
  5. Pulsa el botón, escribe una contraseña nueva y pulsa «Guardar contraseña».
     Esperado: vuelves al login con el aviso verde «Listo, ya puedes iniciar
     sesión con tu contraseña nueva.».
  6. Intenta entrar con la contraseña anterior. Esperado: no entra. Entra con la
     nueva. Esperado: entra.
  7. En el celular, recarga la página. Esperado: te pide iniciar sesión otra vez.
  8. Vuelve a abrir el mismo correo y pulsa el botón otra vez; escribe una
     contraseña y guarda. Esperado: «Este enlace ya no sirve».
- **CA-50 [humano, post-despliegue]** **En el celular.** En el celular, recorre
  «¿Olvidaste tu contraseña?» con tu correo hasta crear la contraseña nueva
  desde el correo abierto en el celular. Esperado: ninguna pantalla se puede
  mover hacia los lados y todo se lee sin hacer zoom. (Cuenta para el límite de
  CA-52: espera 10 minutos después.)
- **CA-51 [humano, post-despliegue]** **Un correo que no existe.** Pide el enlace
  con un correo que no tenga cuenta (por ejemplo, tu correo con `+noexiste`).
  Esperado: la misma pantalla «Revisa tu correo»; no llega ningún correo en 5
  minutos.
- **CA-52 [humano, post-despliegue]** **Mismo tiempo de respuesta y límite de 3
  pedidos.** Espera 10 minutos desde el último pedido.
  1. En una carpeta cualquiera, crea con el Bloc de notas `existe.json` con
     `{"email":"tu@correo.com"}` (tu correo con cuenta) y `noexiste.json` con
     `{"email":"tu+noexiste@correo.com"}`.
  2. Abre PowerShell en esa carpeta. Ejecuta este comando cuatro veces, en este
     orden de archivos: `noexiste.json`, `existe.json`, `noexiste.json`,
     `existe.json` (cambia `<dominio>` por el de platform en el entorno de
     prueba, sin `https://` ni `/` final):
     ```powershell
     curl.exe -s -o NUL -w "%{http_code} %{time_total}`n" -X POST "https://<dominio>/api/auth/request-password-reset" -H "Content-Type: application/json" -H "Origin: https://<dominio>" --data "@noexiste.json"
     ```
  3. Esperado: los tres primeros imprimen `200` y un tiempo en segundos; el de
     `existe.json` no es más de 0.2 más lento que los dos de `noexiste.json`. El
     cuarto imprime `429`.
  4. Enseguida, en el celular **con datos móviles** (sin WiFi), pide el enlace
     desde la página. Esperado: «Revisa tu correo» (el bloqueo es sólo de la IP
     de la computadora).
  5. Si en el paso 3 `existe.json` tardó más de 0.2 segundos que los otros,
     espera 10 minutos y repite. Si vuelve a pasar, avisa a Claude.
  6. Borra los dos archivos.
- **CA-53 [humano, post-despliegue]** **Límite de 5 intentos al guardar.** En
  PowerShell, crea `token.json` con
  `{"newPassword":"PruebaLimite2026","token":"AAAAAAAAAAAAAAAAAAAAAAAA"}` y
  ejecuta 6 veces seguidas, en menos de un minuto:
  ```powershell
  curl.exe -s -o NUL -w "%{http_code}`n" -X POST "https://<dominio>/api/auth/reset-password" -H "Content-Type: application/json" -H "Origin: https://<dominio>" --data "@token.json"
  ```
  Esperado: las 5 primeras imprimen `400` y la sexta `429`. Borra el archivo.
- **CA-54 [humano, post-despliegue]** **El enlace vence a la hora.** Pide un
  enlace, espera más de una hora sin abrirlo, ábrelo, escribe una contraseña y
  guarda. Esperado: «Este enlace ya no sirve», y tu contraseña de siempre sigue
  sirviendo.
- **CA-55 [humano, post-despliegue]** **El invitado.** Como administrador,
  invita como médico a un correo tuyo de prueba (`+prueba1`) y **no** aceptes la
  invitación. Desde el login, pide el enlace de recuperación con ese correo.
  Esperado: la misma pantalla «Revisa tu correo»; llega «Tu invitación a WizyDoc
  sigue pendiente» con el nombre de la sede y el botón «Aceptar invitación»; no
  llega «Crea tu contraseña nueva de WizyDoc». El botón abre el formulario de la
  invitación, donde puedes crear la contraseña y entrar.
- **CA-56 [humano, post-despliegue]** **El token no queda en los logs.** Copia
  el texto del enlace de CA-49 que va después de `#token=`. En Railway, abre los
  logs del servicio api y luego los del servicio platform del entorno de prueba
  y busca ese texto desde la hora del despliegue. Esperado: no aparece en
  ninguno. Busca también `[password-reset]`. Esperado: esas líneas no muestran tu
  correo.

