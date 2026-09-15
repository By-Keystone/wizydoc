import sensible from "@fastify/sensible";
import Fastify, { type FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import type { Plan } from "@prisma/client";
import { entitlementsFor } from "./src/domain/entities/subscription/entitlements";
import entitlementsPlugin from "./src/plugins/entitlements";

// El accountId del test es el nombre del plan, para no montar una base de datos
// sólo para comprobar cómo se propagan los hooks.
const stubQuery = {
  async execute(accountId: string) {
    return entitlementsFor({
      plan: accountId as Plan,
      status: "ACTIVE",
      extraDoctors: 0,
      extraClinics: 0,
    });
  },
};

async function patientRoutes(fastify: FastifyInstance) {
  fastify.addHook("preHandler", fastify.requireFeature("PATIENT_RECORD"));

  fastify.get("/", async () => ({ ok: "lista de pacientes" }));
  fastify.get("/:patientId", async () => ({ ok: "detalle" }));
}

async function clinicRoutes(fastify: FastifyInstance) {
  fastify.get("/clinic", async () => ({ ok: "sedes" }));

  fastify.get(
    "/clinic/:resourceId/metrics",
    { preHandler: fastify.requireFeature("CLINIC_METRICS") },
    async () => ({ ok: "métricas" }),
  );
}

async function build() {
  const fastify = Fastify();
  await fastify.register(sensible);

  let globalHookRan = 0;

  fastify.decorateRequest("user", null);
  fastify.addHook("preHandler", async (request) => {
    globalHookRan += 1;
    request.user = {
      userId: "u1",
      email: "a@b.c",
      accountId: (request.headers["x-account"] as string) ?? "FREE",
      role: "USER",
    };
  });

  await fastify.register(fp(async () => {}, { name: "auth" }));

  await fastify.register(entitlementsPlugin, {
    getAccountEntitlements: stubQuery,
  });

  await fastify.register(patientRoutes, { prefix: "/patients" });
  await fastify.register(clinicRoutes);

  return { fastify, ranGlobal: () => globalHookRan };
}

async function main() {
  const { fastify, ranGlobal } = await build();

  const cases = [
    { url: "/patients", plan: "FREE", expected: 402 },
    { url: "/patients", plan: "CONSULTORIO", expected: 200 },
    { url: "/patients/123", plan: "FREE", expected: 402 },
    { url: "/patients/123", plan: "CLINICA", expected: 200 },
    { url: "/clinic", plan: "FREE", expected: 200 },
    { url: "/clinic/abc/metrics", plan: "CONSULTORIO", expected: 402 },
    { url: "/clinic/abc/metrics", plan: "CLINICA", expected: 200 },
    { url: "/clinic/abc/metrics", plan: "RED", expected: 200 },
  ];

  let failures = 0;

  for (const testCase of cases) {
    const response = await fastify.inject({
      method: "GET",
      url: testCase.url,
      headers: { "x-account": testCase.plan },
    });

    const passed = response.statusCode === testCase.expected;
    if (!passed) failures += 1;

    console.log(
      `${passed ? "OK  " : "FAIL"} ${testCase.plan.padEnd(11)} GET ${testCase.url.padEnd(22)} → ${response.statusCode} (esperado ${testCase.expected})`,
    );
  }

  console.log(`\nHook global ejecutado en ${ranGlobal()} peticiones.`);
  console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLOS`);

  await fastify.close();
  process.exit(failures === 0 ? 0 : 1);
}

main();
