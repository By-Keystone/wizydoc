import { createApiContext } from "../../support/accounts";
import { PLATFORM_BASE_URL } from "../../support/env";
import { getLatestSessionTrace } from "../../support/invitations";
import { expect, test } from "../../support/test";
import { createConfirmedUser, E2E_PASSWORD } from "../../support/users";

// docs/features/fix-auth-rate-limit-ip/plan.md — CA-1 y CA-2.

async function signInThroughPlatform(
  email: string,
  headers: Record<string, string>,
) {
  const context = await createApiContext();
  const response = await context.post(
    `${PLATFORM_BASE_URL}/api/auth/sign-in/email`,
    {
      headers: { Origin: PLATFORM_BASE_URL, ...headers },
      data: { email, password: E2E_PASSWORD },
    },
  );
  expect(response.status()).toBe(200);
}

test("CA-1: el inicio de sesión vía platform guarda la IP de x-real-ip", async () => {
  const { email, userId } = await createConfirmedUser(
    await createApiContext(),
    { emailPrefix: "ip-real" },
  );

  await signInThroughPlatform(email, { "X-Real-IP": "203.0.113.25" });

  const session = await getLatestSessionTrace(userId);
  expect(session?.ipAddress).toBe("203.0.113.25");
});

test("CA-2: x-forwarded-for ya no se usa para la IP de la sesión", async () => {
  const { email, userId } = await createConfirmedUser(
    await createApiContext(),
    { emailPrefix: "ip-xff" },
  );

  await signInThroughPlatform(email, {
    "X-Forwarded-For": "198.51.100.7, 10.0.0.1",
  });

  const session = await getLatestSessionTrace(userId);
  expect(session?.ipAddress).toBe("127.0.0.1");
});
