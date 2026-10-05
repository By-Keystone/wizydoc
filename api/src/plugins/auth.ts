import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { fromNodeHeaders } from "better-auth/node";
import auth from "@/infrastructure/vendors/auth/better-auth/auth";
import type { UserRole } from "@prisma/client";

/**
 * Identidad resuelta desde la sesión de Better Auth e inyectada en la request.
 * `accountId` puede ser `null` hasta que el usuario completa el onboarding;
 * declara `policy({ account: true })` en las rutas que necesiten una cuenta.
 */
export interface UserClaims {
  userId: string;
  email: string;
  accountId: string | null;
  /** Rol global del usuario en su cuenta. Cambia casi nunca. */
  role: UserRole | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user: UserClaims;
  }

  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>;
  }
}

async function authPlugin(fastify: FastifyInstance) {
  fastify.decorate("authenticate", async (request: FastifyRequest) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session) {
      throw fastify.httpErrors.unauthorized("Missing or invalid session");
    }

    const sessionUser = session.user;

    request.user = {
      userId: sessionUser.id,
      email: sessionUser.email,
      accountId: sessionUser.accountId ?? null,
      role: (sessionUser.role as UserRole) ?? null,
    };
  });
}

export default fp(authPlugin, { name: "auth" });
