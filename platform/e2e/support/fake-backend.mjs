import { randomBytes } from "node:crypto";
import { createServer } from "node:http";

const apiKey = process.env.FAKE_BACKEND_API_KEY;
const port = Number(process.env.FAKE_BACKEND_PORT);

const CORRECT_CODE = "482913";
const VERIFICATION_TOKEN_BYTES = 32;

const requests = [];
const tokensIssuedByEmail = new Map();

const NO_SESSION_EMAIL_PREFIX = "sinsesion";
const EXPIRED_VERIFICATION_MESSAGE =
  "Tu verificación venció. Vuelve a pedir el código.";
const SESSION_LIFETIME_SECONDS = 3600;

const forcedStatusByEmailPrefix = {
  limite: 429,
  caido: 500,
  gateway: 403,
  rechazado: 400,
};

function readBody(request) {
  return new Promise((resolve) => {
    let raw = "";
    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve({});
      }
    });
  });
}

function sendJson(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function forcedStatusFor(email) {
  const prefix = Object.keys(forcedStatusByEmailPrefix).find((candidate) =>
    email.startsWith(candidate),
  );
  return prefix ? forcedStatusByEmailPrefix[prefix] : undefined;
}

function rejectForced(response, status) {
  if (status === 403) return sendJson(response, 403, { message: "Forbidden" });
  if (status === 429) {
    return sendJson(response, 429, { message: "Too Many Requests" });
  }
  if (status === 400) {
    return sendJson(response, 400, {
      message: "No pudimos enviar el código a ese correo.",
    });
  }
  return sendJson(response, status, { message: "Internal server error" });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");

  if (request.method === "GET" && url.pathname === "/health") {
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "GET" && url.pathname === "/__requests") {
    const email = url.searchParams.get("email");
    return sendJson(
      response,
      200,
      requests.filter((recorded) => recorded.email === email),
    );
  }

  if (request.headers["x-api-key"] !== apiKey) {
    return sendJson(response, 403, { message: "Forbidden" });
  }

  if (request.method === "POST" && url.pathname === "/api/auth/sign-up/code") {
    const { email = "" } = await readBody(request);
    requests.push({
      path: url.pathname,
      email,
      realIp: request.headers["x-real-ip"],
      userAgent: request.headers["user-agent"],
    });

    const forcedStatus = forcedStatusFor(email);
    if (forcedStatus) return rejectForced(response, forcedStatus);

    response.writeHead(202);
    return response.end();
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/auth/sign-up/code/verify"
  ) {
    const { email = "", code = "" } = await readBody(request);
    const forcedStatus = forcedStatusFor(email);
    const isCorrectCode = code === CORRECT_CODE;
    const verificationToken = randomBytes(VERIFICATION_TOKEN_BYTES).toString(
      "base64url",
    );
    requests.push({
      path: url.pathname,
      email,
      code,
      realIp: request.headers["x-real-ip"],
      userAgent: request.headers["user-agent"],
      verificationToken:
        isCorrectCode && !forcedStatus ? verificationToken : undefined,
    });

    if (forcedStatus && forcedStatus !== 400) {
      return rejectForced(response, forcedStatus);
    }
    if (!isCorrectCode) {
      return sendJson(response, 400, {
        message:
          "El código no es correcto o ya venció. Pide uno nuevo si lo necesitas.",
      });
    }
    tokensIssuedByEmail.set(email, verificationToken);
    return sendJson(response, 200, { verificationToken });
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/auth/sign-up/confirm"
  ) {
    const body = await readBody(request);
    const { email = "", verificationToken = "" } = body;
    const forcedStatus = forcedStatusFor(email);
    const isTokenOfThisEmail =
      verificationToken !== "" &&
      verificationToken === tokensIssuedByEmail.get(email);
    const session = {
      idToken: randomBytes(VERIFICATION_TOKEN_BYTES).toString("base64url"),
      accessToken: randomBytes(VERIFICATION_TOKEN_BYTES).toString("base64url"),
      refreshToken: randomBytes(VERIFICATION_TOKEN_BYTES).toString("base64url"),
      expiresIn: SESSION_LIFETIME_SECONDS,
    };
    requests.push({
      path: url.pathname,
      email,
      verificationToken,
      bodyKeys: Object.keys(body).sort(),
      realIp: request.headers["x-real-ip"],
      userAgent: request.headers["user-agent"],
      session: isTokenOfThisEmail && !forcedStatus ? session : undefined,
    });

    if (forcedStatus) return rejectForced(response, forcedStatus);
    if (!isTokenOfThisEmail) {
      return sendJson(response, 400, { message: EXPIRED_VERIFICATION_MESSAGE });
    }
    tokensIssuedByEmail.delete(email);
    if (email.startsWith(NO_SESSION_EMAIL_PREFIX)) {
      response.writeHead(204);
      return response.end();
    }
    return sendJson(response, 200, session);
  }

  return sendJson(response, 404, { message: "Not found" });
});

server.listen(port, "127.0.0.1");
