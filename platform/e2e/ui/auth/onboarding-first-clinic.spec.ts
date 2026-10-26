import type { Page } from "@playwright/test";
import { createApiContext } from "../../support/accounts";
import { getTestPrisma } from "../../support/db";
import { expectNoEmailTo, readEmailsTo } from "../../support/email";
import {
  alertWith,
  expectBelow,
  expectDescribedBy,
} from "../../support/entry-forms";
import { API_BASE_URL, PLATFORM_BASE_URL } from "../../support/env";
import {
  expectNoSidewaysScroll,
  firstSteps,
  postFirstClinic,
  readAccountFootprint,
  readFirstClinicRecords,
  stepNamed,
  visibleCoralElements,
  newFirstClinicBody,
  LONG_WORD,
  NO_PLAN_MESSAGE,
  CORAL,
  copyLinkButton,
  viewAsPatientLink,
} from "../../support/first-use";
import { expect, test } from "../../support/test";
import {
  clinicDashboardUrl,
  fillOnboardingForm,
  loginViaUi,
  ONBOARDING_ADDRESS,
  ONBOARDING_SPECIALTY,
} from "../../support/ui";
import { createConfirmedUser, uniqueName } from "../../support/users";

// docs/features/primer-uso/plan.md CA-1 a CA-6, CA-7 a CA-10, CA-12 a CA-16 y CA-38 (onboarding sin coral).

const CREATE_CLINIC = "Crear mi consultorio";
const BETA_PHRASE =
  "Durante la beta, todas las cuentas empiezan en Gratis y los planes de pago se activan a pedido.";
const ACCOUNT_ONLY_CREATED_ERROR =
  "Tu cuenta quedó creada, pero no pudimos crear tu consultorio. Vuelve a intentarlo.";
const REGISTRATION_PHONE = "+51987123456";
const ONBOARDING_ERROR = /Vuelve a intentarlo|ya está creado|ya pertenece/;

const FIELDS = [
  {
    key: "name",
    label: "Nombre del consultorio",
    placeholder: "Consultorio Dra. Quispe",
    autocomplete: "organization",
    requiredError: "Escribe el nombre de tu consultorio.",
    tooLongError:
      "El nombre del consultorio no puede tener más de 100 caracteres.",
    tooLongLength: 101,
  },
  {
    key: "address",
    label: "Dirección",
    placeholder: "Av. José Larco 812, of. 304, Miraflores",
    autocomplete: "street-address",
    requiredError: "Escribe la dirección de tu consultorio.",
    tooLongError: "La dirección no puede tener más de 200 caracteres.",
    tooLongLength: 201,
  },
  {
    key: "specialty",
    label: "Tu especialidad",
    placeholder: "Dermatología",
    autocomplete: "off",
    requiredError: "Escribe tu especialidad.",
    tooLongError: "La especialidad no puede tener más de 100 caracteres.",
    tooLongLength: 101,
  },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];

const fieldInput = (page: Page, key: FieldKey) =>
  page.getByLabel(FIELDS.find((field) => field.key === key)?.label ?? "", {
    exact: true,
  });

const createButton = (page: Page) =>
  page.getByRole("button", { name: CREATE_CLINIC, exact: true });

const ownerAccount = async (userId: string) => {
  const prisma = await getTestPrisma();
  return prisma.account.findFirst({ where: { ownerId: userId } });
};

async function openOnboardingAsNewUser(page: Page, emailPrefix: string) {
  const context = await createApiContext();
  const user = await createConfirmedUser(context, {
    emailPrefix,
    phone: REGISTRATION_PHONE,
  });
  await loginViaUi(page, user.email, /\/onboarding$/);
  return { context, ...user };
}

async function submitOnboarding(
  page: Page,
  values: Partial<Record<FieldKey, string>> = {},
) {
  await fillOnboardingForm(page, {
    name: values.name ?? uniqueName("Consultorio Paredes"),
    address: values.address,
    specialty: values.specialty,
  });
  await createButton(page).click();
}

test.describe("El formulario (CA-1 a CA-5)", () => {
  test("CA-1: «Tu consultorio» con su descripción, la frase de la beta, los tres campos en orden con placeholder y autocomplete, el botón y plan=FREE, sin coral", async ({
    page,
  }) => {
    await openOnboardingAsNewUser(page, "ca1-primer-uso");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Tu consultorio",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Es el último paso. Tus pacientes verán estos datos al reservar.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText(BETA_PHRASE, { exact: true })).toBeVisible();

    const labelsInOrder = await page
      .locator("form")
      .getByRole("textbox")
      .evaluateAll((inputs) =>
        inputs.map(
          (input) => (input as HTMLInputElement).labels?.[0]?.textContent,
        ),
      );
    expect(labelsInOrder).toEqual(FIELDS.map((field) => field.label));

    for (const field of FIELDS) {
      const input = fieldInput(page, field.key);
      await expect(input).toHaveAttribute("placeholder", field.placeholder);
      await expect(input).toHaveAttribute("autocomplete", field.autocomplete);
    }
    await expect(createButton(page)).toBeVisible();

    for (const absent of [
      "Teléfono",
      "Celular",
      "Plan",
      "Dirección de facturación",
      "Ciudad",
    ]) {
      await expect(page.getByLabel(absent, { exact: true })).toHaveCount(0);
    }
    await expect(page.locator('input[type="hidden"][name="plan"]')).toHaveValue(
      "FREE",
    );
    expect(await visibleCoralElements(page)).toEqual([]);
  });

  test("CA-2: al enviar vacío cada campo muestra su error debajo, en alert y enlazado, el foco va al nombre y no se crea nada", async ({
    page,
  }) => {
    const { userId } = await openOnboardingAsNewUser(page, "ca2-vacio");

    await createButton(page).click();

    for (const field of FIELDS) {
      const error = alertWith(page, field.requiredError);
      await expect(error).toBeVisible();
      await expectBelow(error, fieldInput(page, field.key));
      await expectDescribedBy(fieldInput(page, field.key), error);
    }
    await expect(fieldInput(page, "name")).toBeFocused();
    await expect(page).toHaveURL(/\/onboarding$/);
    expect(await ownerAccount(userId)).toBeNull();
  });

  test("CA-2: tres campos de sólo espacios dan los mismos errores, el foco va al nombre y no se crea nada", async ({
    page,
  }) => {
    const { userId } = await openOnboardingAsNewUser(page, "ca2-espacios");

    await fillOnboardingForm(page, {
      name: "   ",
      address: "   ",
      specialty: "   ",
    });
    await createButton(page).click();

    for (const field of FIELDS) {
      await expect(alertWith(page, field.requiredError)).toBeVisible();
    }
    await expect(fieldInput(page, "name")).toBeFocused();
    expect(await ownerAccount(userId)).toBeNull();
  });

  for (const empty of FIELDS) {
    test(`CA-3: con sólo «${empty.label}» vacío, sólo ese campo muestra error y recibe el foco, y los otros dos conservan lo escrito`, async ({
      page,
    }) => {
      const { userId } = await openOnboardingAsNewUser(
        page,
        `ca3-${empty.key}`,
      );
      const values = {
        name: uniqueName("Consultorio Paredes"),
        address: "Jr. Cusco 450, Lima",
        specialty: "Pediatría",
      };

      await fillOnboardingForm(page, { ...values, [empty.key]: "" });
      await createButton(page).click();

      await expect(alertWith(page, empty.requiredError)).toBeVisible();
      await expect(fieldInput(page, empty.key)).toBeFocused();
      for (const other of FIELDS.filter((field) => field.key !== empty.key)) {
        await expect(alertWith(page, other.requiredError)).toHaveCount(0);
        await expect(fieldInput(page, other.key)).toHaveValue(
          values[other.key],
        );
        await expect(fieldInput(page, other.key)).not.toHaveAttribute(
          "aria-invalid",
          "true",
        );
      }
      expect(await ownerAccount(userId)).toBeNull();
    });
  }

  for (const tooLong of FIELDS) {
    test(`CA-4: «${tooLong.label}» más largo que el máximo muestra su mensaje, conserva lo escrito y no crea nada`, async ({
      page,
    }) => {
      const { userId } = await openOnboardingAsNewUser(
        page,
        `ca4-${tooLong.key}`,
      );
      const longValue = "L".repeat(tooLong.tooLongLength);

      await submitOnboarding(page, { [tooLong.key]: longValue });

      const error = alertWith(page, tooLong.tooLongError);
      await expect(error).toBeVisible();
      await expectBelow(error, fieldInput(page, tooLong.key));
      await expect(fieldInput(page, tooLong.key)).toBeFocused();
      await expect(fieldInput(page, tooLong.key)).toHaveValue(longValue);
      expect(await ownerAccount(userId)).toBeNull();
    });
  }

  test("CA-6: el orden de tabulación es nombre, dirección, especialidad y botón, y al enviar el botón queda deshabilitado con «Creando tu consultorio…»", async ({
    page,
  }) => {
    await openOnboardingAsNewUser(page, "ca6");

    await expect(fieldInput(page, "name")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(fieldInput(page, "address")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(fieldInput(page, "specialty")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(createButton(page)).toBeFocused();

    await page.route("**/*", async (route) => {
      const request = route.request();
      if (request.method() === "POST" && request.headers()["next-action"]) {
        await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
      await route.continue();
    });
    await fillOnboardingForm(page, { name: uniqueName("Consultorio lento") });
    await createButton(page).click();

    const sending = page.getByRole("button", {
      name: "Creando tu consultorio…",
      exact: true,
    });
    await expect(sending).toBeVisible();
    await expect(sending).toBeDisabled();
    await expect(page).toHaveURL(/\/clinic\/[^/]+\/dashboard$/, {
      timeout: 20_000,
    });
  });

  test.describe("a 375 px", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("CA-5: con un nombre y una dirección de 80 caracteres, el formulario no se desplaza hacia los lados, tampoco con un error a la vista", async ({
      page,
    }) => {
      await openOnboardingAsNewUser(page, "ca5-movil");

      await fillOnboardingForm(page, {
        name: LONG_WORD,
        address: LONG_WORD,
        specialty: "",
      });
      await expectNoSidewaysScroll(page);

      await createButton(page).click();
      await expect(alertWith(page, "Escribe tu especialidad.")).toBeVisible();
      await expectNoSidewaysScroll(page);
    });
  });
});

test.describe("Lo que crea (CA-7 a CA-10, CA-12, CA-13)", () => {
  test("CA-7: la cuenta, la organización y la sede llevan el nombre escrito; el dueño es ADMIN y médico de la sede con su especialidad", async ({
    page,
  }) => {
    const { context, userId } = await openOnboardingAsNewUser(page, "ca7");
    const name = uniqueName("Consultorio Paredes");

    await submitOnboarding(page, { name });
    await expect(page).toHaveURL(/\/clinic\/[^/]+\/dashboard$/, {
      timeout: 20_000,
    });

    const account = await ownerAccount(userId);
    expect(account?.name).toBe(name);
    const prisma = await getTestPrisma();
    const subscription = await prisma.subscription.findUniqueOrThrow({
      where: { accountId: account?.id },
    });
    expect(subscription.plan).toBe("FREE");
    expect(subscription.status).toBe("ACTIVE");

    const records = await readFirstClinicRecords(account?.id ?? "", userId);
    expect(records.organization?.name).toBe(name);
    expect(records.clinic).toMatchObject({ name, address: ONBOARDING_ADDRESS });
    expect(records.organizationMembership?.role).toBe("ADMIN");
    expect(records.clinicMembership?.role).toBe("DOCTOR");
    expect(records.clinicMembership?.doctorProfile?.specialties).toEqual([
      {
        name: ONBOARDING_SPECIALTY,
        organizationId: records.organization?.resourceId,
      },
    ]);

    const membership = await context.get(
      `${API_BASE_URL}/user/me/resource/${records.clinic?.resourceId}/membership`,
    );
    expect((await membership.json()).doctorProfileId).toBe(
      records.clinicMembership?.doctorProfile?.id,
    );
  });

  test("CA-8: el nombre, la dirección y la especialidad se guardan recortados", async ({
    page,
  }) => {
    const { userId } = await openOnboardingAsNewUser(page, "ca8");
    const name = uniqueName("Consultorio Paredes");

    await submitOnboarding(page, {
      name: `  ${name}  `,
      address: "  Av. José Larco 812  ",
      specialty: "  Dermatología  ",
    });
    await expect(page).toHaveURL(/\/clinic\/[^/]+\/dashboard$/, {
      timeout: 20_000,
    });

    const account = await ownerAccount(userId);
    expect(account?.name).toBe(name);
    const records = await readFirstClinicRecords(account?.id ?? "", userId);
    expect(records.organization?.name).toBe(name);
    expect(records.clinic?.name).toBe(name);
    expect(records.clinic?.address).toBe("Av. José Larco 812");
    expect(
      records.clinicMembership?.doctorProfile?.specialties.map(
        (specialty) => specialty.name,
      ),
    ).toEqual(["Dermatología"]);
  });

  test("CA-9: la sede queda sin teléfono y el celular del registro no aparece en la tabla de Sedes", async ({
    page,
  }) => {
    const { userId } = await openOnboardingAsNewUser(page, "ca9");
    const name = uniqueName("Consultorio Paredes");

    await submitOnboarding(page, { name });
    await expect(page).toHaveURL(/\/clinic\/[^/]+\/dashboard$/, {
      timeout: 20_000,
    });

    const account = await ownerAccount(userId);
    const records = await readFirstClinicRecords(account?.id ?? "", userId);
    expect(records.clinic?.phone).toBe("");

    const organizationId = records.organization?.resourceId ?? "";
    await page.context().addCookies([
      { name: "resource_id", value: organizationId, url: PLATFORM_BASE_URL },
      { name: "resource_type", value: "ORGANIZATION", url: PLATFORM_BASE_URL },
    ]);
    await page.goto(
      `/account/${account?.id}/organization/${organizationId}/clinics`,
    );

    const row = page.getByRole("row").filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row.getByText(ONBOARDING_ADDRESS)).toBeVisible();
    await expect(row.getByRole("cell").nth(2)).toHaveText("");
    await expect(page.getByText("987123456")).toHaveCount(0);
  });

  test("CA-10: crear el consultorio no envía ningún correo ni crea ninguna invitación", async ({
    page,
  }) => {
    const { email, userId } = await openOnboardingAsNewUser(page, "ca10");
    const emailsBefore = readEmailsTo(email).length;

    await submitOnboarding(page);
    await expect(page).toHaveURL(/\/clinic\/[^/]+\/dashboard$/, {
      timeout: 20_000,
    });

    await expectNoEmailTo(email, { afterCount: emailsBefore });
    const account = await ownerAccount(userId);
    expect((await readAccountFootprint(account?.id ?? "")).invitations).toBe(0);
  });

  test("CA-12: «Crear mi consultorio» termina en el dashboard de la sede nueva, sin lista de «Elige dónde entrar», sin modales y sin toast", async ({
    page,
  }) => {
    const { userId } = await openOnboardingAsNewUser(page, "ca12");

    await submitOnboarding(page);

    await expect(page).toHaveURL(/\/clinic\/[^/]+\/dashboard$/, {
      timeout: 20_000,
    });
    const account = await ownerAccount(userId);
    await expect(page).toHaveURL(clinicDashboardUrl(account?.id ?? ""));
    await expect(page.getByText(/Este es el panel de /)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Elige dónde entrar" }),
    ).toHaveCount(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
  });

  test("CA-13: la primera llegada muestra la guía con 1 paso pendiente, sin el link, y debajo el aviso de plan y «Citas de hoy» vacío", async ({
    page,
  }) => {
    await openOnboardingAsNewUser(page, "ca13");

    await submitOnboarding(page);
    await expect(page).toHaveURL(/\/clinic\/[^/]+\/dashboard$/, {
      timeout: 20_000,
    });

    await expect(
      page.getByRole("heading", {
        level: 2,
        name: "Te falta 1 paso para recibir citas",
      }),
    ).toBeVisible();
    await expect(firstSteps(page)).toBeVisible();
    await expect(stepNamed(page, "Elige tu especialidad")).toContainText(
      ONBOARDING_SPECIALTY,
    );
    const scheduleStep = stepNamed(page, "Define tu horario de atención");
    await expect(
      scheduleStep.getByRole("link", { name: "Definir horario" }),
    ).toHaveCSS("background-color", CORAL);
    await expect(stepNamed(page, "Comparte tu link de reservas")).toContainText(
      "Cuando completes los pasos, aquí copias tu link para enviarlo por WhatsApp o ponerlo en tus redes.",
    );
    await expect(copyLinkButton(page)).toHaveCount(0);
    await expect(viewAsPatientLink(page)).toHaveCount(0);
    await expect(page.getByText(NO_PLAN_MESSAGE)).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Citas de hoy" }),
    ).toBeVisible();
    await expect(
      page.getByText("No hay citas programadas para hoy."),
    ).toBeVisible();
  });
});

test.describe("Cuenta ya creada y reintentos (CA-14 a CA-16)", () => {
  test("CA-14: tras un fallo a medias la caja avisa que la cuenta quedó creada y el reintento crea sólo el consultorio", async ({
    page,
  }) => {
    const { userId } = await openOnboardingAsNewUser(page, "ca14");
    const name = uniqueName("Consultorio Paredes");

    await fillOnboardingForm(page, { name });
    // Postgres rechaza el carácter NUL: provoca el fallo del consultorio con la cuenta ya creada.
    await page
      .getByLabel("Tu especialidad")
      .evaluate((input: HTMLInputElement) => {
        input.value = "Dermato\u0000logía";
      });
    await createButton(page).click();

    await expect(alertWith(page, ACCOUNT_ONLY_CREATED_ERROR)).toBeVisible();
    await expect(page.locator("[data-sonner-toast]")).toHaveCount(0);
    await expect(fieldInput(page, "name")).toHaveValue(name);
    await expect(fieldInput(page, "address")).toHaveValue(ONBOARDING_ADDRESS);
    const account = await ownerAccount(userId);
    expect(account).not.toBeNull();

    await fieldInput(page, "specialty").fill(ONBOARDING_SPECIALTY);
    await createButton(page).click();

    await expect(page).toHaveURL(clinicDashboardUrl(account?.id ?? ""), {
      timeout: 20_000,
    });
    expect(await readAccountFootprint(account?.id ?? "")).toMatchObject({
      organizations: 1,
      clinics: 1,
      subscriptions: 1,
    });
    const prisma = await getTestPrisma();
    expect(await prisma.account.count({ where: { ownerId: userId } })).toBe(1);
  });

  test("CA-15: si la cuenta ya existe al enviar, se crea sólo el consultorio: ni una segunda cuenta ni error, y llega al dashboard", async ({
    page,
  }) => {
    const { context, userId } = await openOnboardingAsNewUser(page, "ca15");
    const previousAccount = await context.post(`${API_BASE_URL}/account`, {
      data: { accountName: uniqueName("Cuenta previa") },
    });
    expect(previousAccount.status()).toBe(201);
    const { accountId } = (await previousAccount.json()) as {
      accountId: string;
    };

    await submitOnboarding(page);

    await expect(page).toHaveURL(clinicDashboardUrl(accountId), {
      timeout: 20_000,
    });
    await expect(
      page.getByRole("alert").filter({ hasText: ONBOARDING_ERROR }),
    ).toHaveCount(0);
    const prisma = await getTestPrisma();
    expect(await prisma.account.count({ where: { ownerId: userId } })).toBe(1);
    expect(await readAccountFootprint(accountId)).toMatchObject({
      subscriptions: 1,
      organizations: 1,
      clinics: 1,
    });
  });

  test("CA-16: si el consultorio ya existe al enviar, no hay error y llega al dashboard de la sede que ya existe", async ({
    page,
  }) => {
    const { context } = await openOnboardingAsNewUser(page, "ca16");
    const existingBody = newFirstClinicBody();
    const previousAccount = await context.post(`${API_BASE_URL}/account`, {
      data: { accountName: existingBody.name },
    });
    const { accountId } = (await previousAccount.json()) as {
      accountId: string;
    };
    const existing = await postFirstClinic(context, existingBody);
    expect(existing.status()).toBe(201);
    const { clinicId } = (await existing.json()) as { clinicId: string };

    await submitOnboarding(page, { name: uniqueName("Otro consultorio") });

    await expect(page).toHaveURL(
      `/account/${accountId}/clinic/${clinicId}/dashboard`,
      { timeout: 20_000 },
    );
    await expect(
      page.getByRole("alert").filter({ hasText: ONBOARDING_ERROR }),
    ).toHaveCount(0);
    expect(await readAccountFootprint(accountId)).toMatchObject({
      organizations: 1,
      clinics: 1,
      subscriptions: 1,
    });
    const prisma = await getTestPrisma();
    const clinic = await prisma.clinic.findFirst({
      where: { resource: { accountId } },
    });
    expect(clinic?.name).toBe(existingBody.name);
  });
});
