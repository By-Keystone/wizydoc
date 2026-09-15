import type { IGetAccountEntitlements } from "@/application/queries/subscription/get-account-entitlements.query";
import type { Entitlements } from "@/domain/entities/subscription/entitlements";
import { includesFeature } from "@/domain/entities/subscription/entitlements";
import type { Feature } from "@/domain/entities/subscription/plan";
import { GetAccountEntitlements } from "@/infrastructure/postgres/queries/subscription/get-account-entitlements.query";
import type {
  FastifyInstance,
  FastifyRequest,
  preHandlerHookHandler,
} from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    requireFeature: (feature: Feature) => preHandlerHookHandler;
    /** Entitlements de la cuenta de la petición, resueltos una sola vez. */
    accountEntitlements: (request: FastifyRequest) => Promise<Entitlements>;
  }

  interface FastifyRequest {
    entitlements?: Entitlements;
  }
}

export interface EntitlementsPluginOptions {
  getAccountEntitlements?: IGetAccountEntitlements;
}

async function entitlementsPlugin(
  fastify: FastifyInstance,
  opts: EntitlementsPluginOptions,
) {
  const query = opts.getAccountEntitlements ?? new GetAccountEntitlements();

  fastify.decorateRequest("entitlements", undefined);

  fastify.decorate("accountEntitlements", async (request: FastifyRequest) => {
    if (request.entitlements) return request.entitlements;

    if (!request.user?.accountId) {
      throw fastify.httpErrors.forbidden("No account associated with user");
    }

    request.entitlements = await query.execute(request.user.accountId);

    return request.entitlements;
  });

  fastify.decorate(
    "requireFeature",
    (feature: Feature): preHandlerHookHandler =>
      async (request) => {
        const entitlements = await fastify.accountEntitlements(request);

        if (!includesFeature(entitlements, feature)) {
          // 402 y no 403: el frontend necesita distinguir "no tienes permiso"
          // de "tu plan no lo incluye" para ofrecer la mejora de plan en vez
          // de un error seco.
          throw fastify.httpErrors.paymentRequired(
            "Plan does not include this feature",
          );
        }
      },
  );
}

export default fp(entitlementsPlugin, {
  name: "entitlements",
  dependencies: ["auth"],
});
