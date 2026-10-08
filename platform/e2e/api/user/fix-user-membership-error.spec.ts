import { test, expect } from "../../support/test";
import { API_BASE_URL } from "../../support/env";
import {
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";

const FIXED_MESSAGE = "No se pudo obtener tu acceso a esta sede";

test.describe("GET /user/me/resource/:resourceId/membership", () => {
  test("un resourceId que no es uuid responde 500 con mensaje fijo y sin rastro de Prisma", async () => {
    const admin = await createOnboardedAdmin();

    const response = await admin.context.get(
      `${API_BASE_URL}/user/me/resource/no-es-uuid/membership`,
    );

    expect(response.status()).toBe(500);
    expect(await response.json()).toEqual({
      statusCode: 500,
      error: "Internal Server Error",
      message: FIXED_MESSAGE,
    });
  });

  test("un resourceId válido con membership viva responde 200 con resourceId y role", async () => {
    const admin = await createOnboardedAdmin();
    const organizationId = await createOrganizationResource(admin);

    const response = await admin.context.get(
      `${API_BASE_URL}/user/me/resource/${organizationId}/membership`,
    );

    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.resourceId).toBe(organizationId);
    expect(body.role).toBe("ADMIN");
    expect(body.resourceType).toBe("ORGANIZATION");
  });
});
