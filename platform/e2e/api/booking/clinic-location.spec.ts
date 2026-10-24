import { randomUUID } from "node:crypto";
import {
  createApiContext,
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
} from "../../support/accounts";
import { API_BASE_URL } from "../../support/env";
import { expect, test } from "../../support/test";
import { uniqueName } from "../../support/users";

async function getLocation(resourceId: string) {
  const anonymous = await createApiContext();
  return anonymous.get(`${API_BASE_URL}/clinic/${resourceId}/location`);
}

test("GET /clinic/:clinicId/location sin sesión devuelve exactamente el nombre y la dirección de la sede", async () => {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-location" });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName("ORG-location"),
  );
  const name = uniqueName("Sede Surco");
  const address = "Av. Primavera 1020, Santiago de Surco";
  const clinicId = await createClinicResource(admin, organizationId, {
    name,
    address,
    phone: "+51999111222",
  });

  const response = await getLocation(clinicId);

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ name, address });
});

test("GET /clinic/:clinicId/location con un UUID inexistente responde 404", async () => {
  const response = await getLocation(randomUUID());

  expect(response.status()).toBe(404);
  expect(await response.json()).toEqual({
    message: "Sede no encontrada",
  });
});

test("GET /clinic/:clinicId/location con el id de una organización responde 404 y no revela su nombre", async () => {
  const admin = await createOnboardedAdmin({ emailPrefix: "admin-loc-org" });
  const organizationName = uniqueName("ORG-loc-org");
  const organizationId = await createOrganizationResource(
    admin,
    organizationName,
  );

  const response = await getLocation(organizationId);

  expect(response.status()).toBe(404);
  expect(await response.text()).not.toContain(organizationName);
});

test("GET /clinic/:clinicId/location con un id que no es UUID responde 400", async () => {
  const response = await getLocation("no-es-un-uuid");

  expect(response.status()).toBe(400);
});
