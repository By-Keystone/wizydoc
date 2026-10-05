import { prisma } from "@/infrastructure/postgres/client";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { SESEmailService } from "@/infrastructure/services/email-service/ses.service";
import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";

const emailService = new SESEmailService({
  region: process.env.AWS_REGION!,
  from: process.env.EMAIL_FROM!,
});

const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: [process.env.CLIENT_ORIGIN ?? "http://localhost:3000"],
  disabledPaths: ["/update-user"],
  advanced: {
    database: { generateId: false },
    ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
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
