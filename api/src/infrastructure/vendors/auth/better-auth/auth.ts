import { prisma } from "@/infrastructure/postgres/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { createEmailService } from "@/infrastructure/services/email-service/factory";
import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";
import { FinishPasswordResetUseCase } from "@/application/use-cases/auth/finish-password-reset.usecase";
import { SendPasswordResetEmailUseCase } from "@/application/use-cases/auth/send-password-reset-email.usecase";

const emailService = createEmailService();
const sendPasswordResetEmail = new SendPasswordResetEmailUseCase({
  emailService,
});
const finishPasswordReset = new FinishPasswordResetUseCase();

const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: [process.env.CLIENT_ORIGIN ?? "http://localhost:3000"],
  disabledPaths: ["/update-user"],
  advanced: {
    database: { generateId: false },
    // El borde de Railway pone en X-Real-IP la IP de quien abrió la conexión;
    // platform la reenvía tal cual. No se usa x-forwarded-for: Railway lo arma
    // como "visitante, borde" y con dos entradas Better Auth no resuelve la IP,
    // así que todos los clientes compartían un único cupo y la sesión quedaba
    // sin IP. Sin cabecera de respaldo: si X-Real-IP faltara, preferimos la
    // sesión sin IP y el aviso de Better Auth en el log a aceptar una cabecera
    // que el cliente pueda fijar. Sólo es seguro mientras el api no tenga
    // dominio público.
    ipAddress: { ipAddressHeaders: ["x-real-ip"] },
  },
  rateLimit: {
    // 5 intentos por minuto y por IP para iniciar sesión y cambiar la
    // contraseña (Better Auth trae 3 cada 10 s). Como el resto del límite, sólo
    // se aplica con NODE_ENV=production.
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/change-password": { window: 60, max: 5 },
      // Cada pedido manda un correo a alguien que quizá no lo pidió: 3 cada
      // 10 minutos por IP (Better Auth trae 3 por minuto) para que el
      // formulario no sirva para llenarle la bandeja a otra persona.
      "/request-password-reset": { window: 600, max: 3 },
      // El token no se puede adivinar (~143 bits); esto sólo saca la ruta de la
      // regla general de 100 cada 10 s, igual que cambiar la contraseña.
      "/reset-password": { window: 60, max: 5 },
    },
  },
  verification: {
    // El enlace de recuperación se guarda con hash: quien lea la tabla (un
    // respaldo, una consola) no puede usar uno pendiente.
    storeIdentifier: {
      default: "plain",
      overrides: { "reset-password:": "hashed" },
    },
  },
  session: {
    // Ventana de sesión: 7 días. Como es rodante, un usuario activo no se
    // desloguea; solo caduca tras 7 días de inactividad.
    expiresIn: 60 * 60 * 24 * 7, // 7 días
    // Cada cuánto se extiende la ventana: si la sesión tiene más de 1 día al
    // usarse, Better Auth reescribe la cookie con expiración "ahora + 7 días".
    updateAge: 60 * 60 * 24, // 1 día
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    requireEmailVerification: true,
    // Explícito aunque es el valor por defecto: el correo dice "1 hora".
    resetPasswordTokenExpiresIn: 60 * 60,
    // Quien pide el enlace suele sospechar que alguien más entró: al crear la
    // contraseña nueva se cierran todas las sesiones, también la del intruso.
    revokeSessionsOnPasswordReset: true,
    // Sin await: armar y enviar el correo sólo pasa si el correo existe, y esa
    // demora revelaría qué correos tienen cuenta. El caso de uso atrapa sus
    // errores y nunca registra el token ni el enlace. Se ignora `url`: el
    // enlace lleva el token en el fragmento (docs/features/forgot-password).
    sendResetPassword: async ({ user, token }) => {
      void sendPasswordResetEmail.execute({ userId: user.id, token });
    },
    // Better Auth lo llama después de guardar la contraseña y antes de cerrar
    // las sesiones; si lanzara, las sesiones quedarían abiertas. Por eso el
    // caso de uso no lanza.
    onPasswordReset: async ({ user }) => {
      await finishPasswordReset.execute({ userId: user.id });
    },
  },
  account: { modelName: "authAccount" },
  user: {
    fields: { emailVerified: "confirmed" },
    additionalFields: {
      lastName: { type: "string", required: true },
      phone: { type: "string", required: true },
      role: { type: "string", required: false, input: false },
      onboardingCompleted: {
        type: "boolean",
        required: false,
        input: false,
      },
      accountId: { type: "string", required: false, input: false },
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const html = await renderTemplate("confirm-email", {
        name: user.name,
        confirmUrl: url,
      });
      await emailService.send({
        to: user.email,
        subject: "Confirma tu correo en WizyDoc",
        html,
      });
      console.log(`[sign-up]: Sent email confirmation to user ${user.id}`);
    },
  },
});

export default auth;
