import { createServer } from "node:http";

const apiKey = process.env.FAKE_BACKEND_API_KEY;
const port = Number(process.env.FAKE_BACKEND_PORT);

const requests = [];

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

  return sendJson(response, 404, { message: "Not found" });
});

server.listen(port, "127.0.0.1");
