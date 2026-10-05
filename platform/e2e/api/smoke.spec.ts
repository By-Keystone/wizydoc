import { test, expect } from "@playwright/test";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../support/env";
import { readLatestEmailTo } from "../support/email";
import { createConfirmedUser } from "../support/users";

test("un usuario confirmado puede leer su sesión en GET /user/me", async ({
  request,
}) => {
  const { email, userId } = await createConfirmedUser(request);

  const response = await request.get(`${API_BASE_URL}/user/me`, {
    headers: { Origin: PLATFORM_BASE_URL },
  });

  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.id).toBe(userId);
  expect(body.confirmed).toBe(true);
  expect(body.accountId).toBeNull();

  await expect
    .poll(() => readLatestEmailTo(email)?.subject)
    .toBe("Confirma tu correo en WizyDoc");
});
