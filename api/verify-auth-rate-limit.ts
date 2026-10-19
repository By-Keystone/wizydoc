import "dotenv/config";
import { randomUUID } from "node:crypto";

// Se corre con NODE_ENV=production: el límite de Better Auth sólo está activo
// ahí y sin él no hay 127.0.0.1 de respaldo. Ver docs/features/fix-auth-rate-limit-ip/plan.md.
if (process.env.NODE_ENV !== "production") {
  console.error("Corre este script con NODE_ENV=production.");
  process.exit(1);
}

// Sin esto, dotenv carga api/.env y el script hablaría con la base de
// desarrollo: sólo debe correr contra la base de e2e.
if (process.env.DOTENV_CONFIG_PATH !== ".env.e2e") {
  console.error("Corre este script con DOTENV_CONFIG_PATH=.env.e2e.");
  process.exit(1);
}

const ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000";
const RATE_LIMIT_WARNING = "could not determine a client IP";

let failures = 0;
let warningSeen = false;

function watchConsole() {
  for (const method of ["log", "info", "warn", "error"] as const) {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      if (args.some((arg) => String(arg).includes(RATE_LIMIT_WARNING))) {
        warningSeen = true;
      }
      original(...args);
    };
  }
}

function report(name: string, passed: boolean, detail: string) {
  if (!passed) failures += 1;
  console.log(`${passed ? "OK  " : "FAIL"} ${name} → ${detail}`);
}

async function main() {
  watchConsole();
  const { default: auth } = await import(
    "./src/infrastructure/vendors/auth/better-auth/auth"
  );

  const post = (path: string, body: unknown, headers: Record<string, string>) =>
    auth.handler(
      new Request(`http://localhost/api/auth/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: ORIGIN,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
    );

  const signIn = (headers: Record<string, string>) =>
    post(
      "sign-in/email",
      { email: "nadie@verify-rate-limit.test", password: "contraseña-falsa" },
      headers,
    );

  async function statuses(
    send: (index: number) => Promise<Response>,
    attempts: number,
  ) {
    const results: Response[] = [];
    for (let index = 0; index < attempts; index += 1) {
      results.push(await send(index));
    }
    return results;
  }

  const firstFiveFree = (responses: Response[]) =>
    responses.slice(0, 5).every((response) => response.status !== 429);

  // a. Sexta petición de la misma IP: 429 con X-Retry-After.
  const a = await statuses(() => signIn({ "x-real-ip": "203.0.113.10" }), 6);
  const retryAfter = Number(a[5].headers.get("x-retry-after"));
  report(
    "CA-5  sign-in x6 misma IP",
    firstFiveFree(a) &&
      a[5].status === 429 &&
      retryAfter >= 1 &&
      retryAfter <= 60,
    `${a.map((r) => r.status).join(",")} X-Retry-After=${retryAfter}`,
  );

  // c. Otra IP justo después: el cupo no es compartido.
  const c = await signIn({ "x-real-ip": "203.0.113.11" });
  report("CA-7  otra IP tras el 429", c.status !== 429, `${c.status}`);

  // b. Cambiar x-forwarded-for no evita el límite.
  const b = await statuses(
    (index) =>
      signIn({
        "x-real-ip": "203.0.113.13",
        "x-forwarded-for": `198.51.100.${index + 1}`,
      }),
    6,
  );
  report(
    "CA-6  x-forwarded-for variable",
    firstFiveFree(b) && b[5].status === 429,
    b.map((r) => r.status).join(","),
  );

  // d. El límite corre antes de comprobar la sesión.
  const d = await statuses(
    () =>
      post(
        "change-password",
        { currentPassword: "falsa-1234", newPassword: "otra-falsa-1234" },
        { "x-real-ip": "203.0.113.12" },
      ),
    6,
  );
  report(
    "CA-8  change-password x6 misma IP",
    firstFiveFree(d) && d[5].status === 429,
    d.map((r) => r.status).join(","),
  );

  // CA-10: las demás rutas conservan su regla por defecto (3 cada 10 s).
  const changeEmail = await statuses(
    () =>
      post(
        "change-email",
        { newEmail: "nuevo@verify-rate-limit.test" },
        { "x-real-ip": "203.0.113.14" },
      ),
    4,
  );
  report(
    "CA-10 change-email x4 (regla por defecto)",
    changeEmail.slice(0, 3).every((response) => response.status !== 429) &&
      changeEmail[3].status === 429,
    changeEmail.map((r) => r.status).join(","),
  );

  // f. Pedir el enlace: 3 cada 10 minutos por IP. Correos que no existen:
  // Better Auth responde antes de llamar a sendResetPassword, así que no sale
  // ningún correo aunque el script corra con EMAIL_DRIVER=ses.
  const requestReset = (headers: Record<string, string>) =>
    post(
      "request-password-reset",
      { email: `${randomUUID()}@verify-rate-limit.test` },
      headers,
    );
  const f = await statuses(
    () => requestReset({ "x-real-ip": "203.0.113.30" }),
    4,
  );
  const fRetryAfter = Number(f[3].headers.get("x-retry-after"));
  const fOtherIp = await requestReset({ "x-real-ip": "203.0.113.31" });
  report(
    "CA-36 request-password-reset x4 misma IP",
    f.slice(0, 3).every((response) => response.status === 200) &&
      f[3].status === 429 &&
      fRetryAfter >= 1 &&
      fRetryAfter <= 600 &&
      fOtherIp.status === 200,
    `${f.map((r) => r.status).join(",")} X-Retry-After=${fRetryAfter} otra IP=${fOtherIp.status}`,
  );

  // g. Crear la contraseña: 5 cada minuto por IP. Con un token inventado
  // Better Auth responde INVALID_TOKEN sin tocar a ningún usuario.
  const g = await statuses(
    () =>
      post(
        "reset-password",
        { newPassword: "Contraseña-falsa-2026", token: "A".repeat(24) },
        { "x-real-ip": "203.0.113.32" },
      ),
    6,
  );
  report(
    "CA-37 reset-password x6 misma IP",
    g.slice(0, 5).every((response) => response.status === 400) &&
      g[5].status === 429,
    g.map((r) => r.status).join(","),
  );

  // e. Modo de fallo: sin x-real-ip, todos caen en un cupo compartido.
  await signIn({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" });
  report(
    "CA-9  sin x-real-ip: aviso de Better Auth",
    warningSeen,
    warningSeen ? "aviso visto" : "aviso no visto",
  );

  console.log(failures === 0 ? "\nTODO OK" : `\n${failures} FALLOS`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
