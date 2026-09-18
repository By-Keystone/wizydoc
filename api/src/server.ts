import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import sensible from "@fastify/sensible";
import {
  serializerCompiler,
  validatorCompiler,
} from "@fastify/type-provider-zod";
import authPlugin from "./plugins/auth";
import policyPlugin, { policy } from "./plugins/policy";
import entitlementsPlugin from "./plugins/entitlements";
import { PrismaUserRepository } from "./infrastructure/postgres/repositories/user.repository";
import { SESEmailService } from "./infrastructure/services/email-service/ses.service";
import { ClinicRepository } from "./infrastructure/postgres/repositories/clinic.repository";
import clinicRoutes from "./routes/clinic/index";
import clinicPublicRoutes from "./routes/clinic/public";
import { OrganizationRepository } from "./infrastructure/postgres/repositories/organization.repository";
import organizationRoutes from "./routes/organization/index";
import userRoutes from "./routes/user/index";
import accountRoutes from "./routes/account/index";
import { AccountRepository } from "./infrastructure/postgres/repositories/account.repository";
import { SubscriptionRepository } from "./infrastructure/postgres/repositories/subscription.repository";
import { PostgresTransactionManager } from "./infrastructure/postgres/transaction-manager";
import { fromNodeHeaders } from "better-auth/node";
import auth from "./infrastructure/vendors/auth/better-auth/auth";
import userInvitationRoutes from "./routes/user-invitation";
import doctorProfileRoutes from "./routes/doctor-profile/index";
import appointmentRoutes from "./routes/appointment/index";
import patientRoutes from "./routes/patient";
import { CulqiBillingService } from "./infrastructure/vendors/billing/culqi/culqi-billing.service";

const fastify = Fastify({
  logger:
    process.env.NODE_ENV === "production"
      ? true
      : {
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss.l",
              ignore: "pid,hostname",
            },
          },
        },
});

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

async function start() {
  const userRepository = new PrismaUserRepository();
  const emailService = new SESEmailService({
    region: process.env.AWS_REGION!,
    from: process.env.EMAIL_FROM!,
  });

  const clinicRepository = new ClinicRepository();
  const organizationRepository = new OrganizationRepository();
  const accountRepository = new AccountRepository();
  const subscriptionRepository = new SubscriptionRepository();
  const transactionManager = new PostgresTransactionManager();
  const billingService = new CulqiBillingService({
    baseUrl: process.env.CULQI_API_BASE_URL!,
    privateKey: process.env.CULQI_API_PRIVATE_KEY!,
    planIds: {
      CONSULTORIO: process.env.CULQI_PLAN_ID_CONSULTORIO,
      CLINICA: process.env.CULQI_PLAN_ID_CLINICA,
    },
  });

  await fastify.register(cors, {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  });

  await fastify.register(cookie);
  await fastify.register(sensible);
  await fastify.register(authPlugin);
  await fastify.register(policyPlugin, {
    userRepository,
  });
  await fastify.register(entitlementsPlugin);

  // Hook global: toda ruta registrada a partir de aquí pasa por la política.
  // Una ruta sin `policy({...})` responde 401, así que olvidarla la cierra en
  // lugar de dejarla abierta.
  fastify.addHook("preHandler", fastify.enforcePolicy);

  fastify.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    ...policy({ public: true }),
    async handler(request, reply) {
      try {
        // Construct request URL
        const url = new URL(request.url, `http://${request.headers.host}`);

        // Convert Fastify headers to standard Headers object
        const headers = fromNodeHeaders(request.headers);
        // Create Fetch API-compatible request
        const req = new Request(url.toString(), {
          method: request.method,
          headers,
          ...(request.body ? { body: JSON.stringify(request.body) } : {}),
        });
        // Process authentication request
        const response = await auth.handler(req);
        // Forward response to client
        reply.status(response.status);
        response.headers.forEach((value, key) => reply.header(key, value));
        return reply.send(response.body ? await response.text() : null);
      } catch (error) {
        fastify.log.error(`Authentication Error: ${error}`);
        return reply.status(500).send({
          error: "Internal authentication error",
          code: "AUTH_FAILURE",
        });
      }
    },
  });

  await fastify.register(clinicRoutes, {
    clinicRepository,
  });
  // Hermano de clinicRoutes, no anidado dentro: así no puede heredar el
  // requireAccount/authorize que clinicRoutes le agrega a su propio contexto.
  await fastify.register(clinicPublicRoutes);
  await fastify.register(organizationRoutes, {
    organizationRepository,
    userRepository,
  });

  await fastify.register(userRoutes, {
    prefix: "/user",
    userRepository,
    transactionManager,
    emailService,
  });

  await fastify.register(accountRoutes, {
    userRepository,
    accountRepository,
    subscriptionRepository,
    billingService,
    transactionManager,
  });

  await fastify.register(userInvitationRoutes, {
    prefix: "/invitations",
  });

  await fastify.register(doctorProfileRoutes, {
    prefix: "/doctor-profile",
  });

  await fastify.register(appointmentRoutes, {
    prefix: "/appointment",
    emailService,
  });

  await fastify.register(patientRoutes, {
    prefix: "/patients",
  });

  fastify.get("/health", { ...policy({ public: true }) }, async () => ({
    status: "ok",
  }));

  const port = Number(process.env.PORT) || 4000;
  const host = process.env.HOST || "0.0.0.0";

  await fastify.listen({ port, host });
  console.log(`Server running at http://${host}:${port}`);
}

start().catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
