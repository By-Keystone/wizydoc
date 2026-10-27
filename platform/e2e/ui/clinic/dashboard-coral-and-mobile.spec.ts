import type { Locator } from "@playwright/test";
import {
  buildLinkCase,
  CORAL,
  copyLinkButton,
  expectNoSidewaysScroll,
  firstSteps,
  LONG_WORD,
  type LinkCaseName,
  openClinicDashboard,
  stepLink,
  stepNamed,
  TEAL,
  viewAsPatientLink,
  visibleCoralElements,
  WHITE,
} from "../../support/first-use";
import { expect, test } from "../../support/test";

// docs/features/primer-uso/plan.md CA-38 y CA-39: las cinco filas de L-4 más el dueño de antes sin especialidad.

const MIN_TOUCH_TARGET_HEIGHT = 40;
const COPY = "Copiar link de reservas";
const SPECIALTY_STEP = "Elige tu especialidad";
const SCHEDULE_STEP = "Define tu horario de atención";

interface LinkCaseExpectation {
  name: LinkCaseName;
  label: string;
  coral: string[];
  specialtyButton?: string;
  scheduleButton?: string;
}

const CASES: LinkCaseExpectation[] = [
  {
    name: "guide-only",
    label: "atiende, no aparece y el link no funciona (con especialidad)",
    coral: ["Definir horario"],
    scheduleButton: CORAL,
  },
  {
    name: "guide-only-no-specialty",
    label: "atiende, no aparece y el link no funciona (sin especialidad)",
    coral: ["Elegir especialidad"],
    specialtyButton: CORAL,
    scheduleButton: WHITE,
  },
  {
    name: "link-and-guide",
    label: "atiende, no aparece y el link funciona con otros médicos",
    coral: [COPY],
    specialtyButton: TEAL,
    scheduleButton: WHITE,
  },
  {
    name: "link-only-listed",
    label: "aparece en el link",
    coral: [COPY],
  },
  {
    name: "link-only-bystander",
    label: "no atiende y el link funciona",
    coral: [COPY],
  },
  {
    name: "notice-only",
    label: "no atiende y el link no funciona",
    coral: [],
  },
];

const VIEWPORTS = [
  { label: "1280 px", size: { width: 1280, height: 800 }, isMobile: false },
  { label: "375 px", size: { width: 375, height: 812 }, isMobile: true },
];

async function expectTouchTarget(target: Locator) {
  const box = await target.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_HEIGHT);
}

for (const viewport of VIEWPORTS) {
  test.describe(`dashboard de la sede a ${viewport.label}`, () => {
    test.use({ viewport: viewport.size });

    for (const expectation of CASES) {
      test(`CA-38 y CA-39: ${expectation.label}: coral ${expectation.coral.length ? `sólo «${expectation.coral[0]}»` : "ninguno"}, «Pedir el plan» en teal${viewport.isMobile ? ", sin desplazamiento y botones de 40 px" : ""}`, async ({
        page,
      }) => {
        const linkCase = await buildLinkCase(expectation.name, {
          clinicName: LONG_WORD,
          specialty: LONG_WORD,
        });
        await openClinicDashboard(page, linkCase);
        await expect(
          page.getByRole("heading", { name: "Citas de hoy" }),
        ).toBeVisible();

        await expect
          .poll(() => visibleCoralElements(page))
          .toEqual(expectation.coral);
        await expect(
          page.getByRole("link", { name: /^Pedir el plan/ }),
        ).toHaveCSS("background-color", TEAL);

        if (expectation.specialtyButton) {
          await expect(
            stepLink(stepNamed(page, SPECIALTY_STEP), "Elegir especialidad"),
          ).toHaveCSS("background-color", expectation.specialtyButton);
        }
        if (expectation.scheduleButton) {
          await expect(
            stepLink(stepNamed(page, SCHEDULE_STEP), "Definir horario"),
          ).toHaveCSS("background-color", expectation.scheduleButton);
        }

        if (!viewport.isMobile) return;

        await expectNoSidewaysScroll(page);
        const targets: Locator[] = [];
        if ((await firstSteps(page).count()) > 0) {
          const links = firstSteps(page).getByRole("link");
          for (let index = 0; index < (await links.count()); index += 1) {
            targets.push(links.nth(index));
          }
        }
        if ((await copyLinkButton(page).count()) > 0) {
          targets.push(copyLinkButton(page), viewAsPatientLink(page));
        }
        for (const target of targets) await expectTouchTarget(target);
      });
    }
  });
}
