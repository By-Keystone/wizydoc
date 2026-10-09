import { timingSafeEqual } from "node:crypto";
import rateLimit, { normalizeIP } from "@fastify/rate-limit";
import type { FastifyInstance, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { TooManyRequests } from "@/application/errors/too-many-requests.error";

const PROXY_SECRET_HEADER = "x-wizydoc-proxy-secret";
const VISITOR_IP_HEADER = "x-wizydoc-visitor-ip";

const ONE_MINUTE_MS = 60 * 1000;
const TEN_MINUTES_MS = 10 * ONE_MINUTE_MS;

export const RATE_LIMITS = {
  bookAppointment: { max: 100, timeWindow: TEN_MINUTES_MS },
  readSlots: { max: 60, timeWindow: ONE_MINUTE_MS },
  readClinicDoctors: { max: 60, timeWindow: ONE_MINUTE_MS },
  readInvitation: { max: 20, timeWindow: ONE_MINUTE_MS },
  answerInvitation: { max: 10, timeWindow: ONE_MINUTE_MS },
  readManagedAppointment: { max: 30, timeWindow: ONE_MINUTE_MS },
  cancelManagedAppointment: { max: 10, timeWindow: ONE_MINUTE_MS },
  rescheduleManagedAppointment: { max: 10, timeWindow: ONE_MINUTE_MS },
};

export function limitedBy(limit: { max: number; timeWindow: number }) {
  return { rateLimit: limit };
}

const TOO_MANY_REQUESTS_MESSAGE =
  "Demasiadas solicitudes. Espera un momento e inténtalo de nuevo.";

function secretsMatch(received: string, expected: string): boolean {
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

async function rateLimitPlugin(fastify: FastifyInstance) {
  const proxySecret = process.env.RATE_LIMIT_PROXY_SECRET || undefined;
  const exemptIps = (process.env.RATE_LIMIT_EXEMPT_IPS ?? "")
    .split(",")
    .map((ip) => ip.trim())
    .filter(Boolean)
    .map((ip) => normalizeIP(ip));

  if (process.env.NODE_ENV === "production" && !proxySecret) {
    throw new Error(
      "Falta RATE_LIMIT_PROXY_SECRET: sin él todo el tráfico de platform compartiría un solo contador.",
    );
  }

  const clientIps = new WeakMap<FastifyRequest, string>();

  function resolveClientIp(request: FastifyRequest): string {
    const receivedSecret = request.headers[PROXY_SECRET_HEADER];
    const visitorIp = request.headers[VISITOR_IP_HEADER];
    if (typeof receivedSecret !== "string") return request.ip;

    const isTrusted = proxySecret && secretsMatch(receivedSecret, proxySecret);
    if (!isTrusted) {
      request.log.error(
        { remoteAddress: request.ip },
        "[rate-limit] x-wizydoc-proxy-secret no coincide con RATE_LIMIT_PROXY_SECRET",
      );
      return request.ip;
    }

    return typeof visitorIp === "string" ? visitorIp : request.ip;
  }

  fastify.addHook("onRequest", async (request) => {
    clientIps.set(request, resolveClientIp(request));
  });

  function clientIp(request: FastifyRequest): string {
    return normalizeIP(clientIps.get(request) ?? request.ip);
  }

  await fastify.register(rateLimit, {
    global: false,
    keyGenerator: (request) =>
      `${clientIp(request)}|${request.routeOptions.url}`,
    allowList: (request) => exemptIps.includes(clientIp(request)),
    errorResponseBuilder: () => new TooManyRequests(TOO_MANY_REQUESTS_MESSAGE),
  });
}

export default fp(rateLimitPlugin, { name: "rate-limit" });
