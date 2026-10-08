import { HasLiveMembership } from "@/infrastructure/postgres/queries/membership/has-live-membership.query";
import type { FastifyInstance, preHandlerHookHandler } from "fastify";

// La cuenta sale de la sesión y sobrevive a quitar memberships: sin esta
// comprobación, quien fue removido de todo seguiría viendo datos de la cuenta.
export function requireLiveMembership(
  fastify: FastifyInstance,
): preHandlerHookHandler {
  const query = new HasLiveMembership();

  return async (request) => {
    const { userId, accountId } = request.user;

    if (!accountId || !(await query.execute(userId, accountId))) {
      throw fastify.httpErrors.notFound("Resource not found");
    }
  };
}
