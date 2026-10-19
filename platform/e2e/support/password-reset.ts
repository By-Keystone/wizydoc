import type { APIRequestContext } from "@playwright/test";
import {
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
  type OnboardedAdmin,
} from "./accounts";
import { getTestPrisma } from "./db";
import { extractLink, readEmailsTo, waitForEmailTo } from "./email";
import { PLATFORM_BASE_URL } from "./env";
import { invitePendingUser } from "./invitations";
import { authPost, uniqueName } from "./users";

export const RESET_EMAIL_SUBJECT = "Crea tu contraseña nueva de WizyDoc";
export const PENDING_INVITATION_EMAIL_SUBJECT =
  "Tu invitación a WizyDoc sigue pendiente";

const RESET_LINK_FRAGMENT = "/reset-password#token=";
const POLL_INTERVAL_MS = 100;
const WAIT_TIMEOUT_MS = 5_000;

export async function readResetLink(
  email: string,
  afterCount?: number,
): Promise<string> {
  const captured = await waitForEmailTo(email, {
    subject: RESET_EMAIL_SUBJECT,
    afterCount,
  });
  return extractLink(captured.html, RESET_LINK_FRAGMENT);
}

export async function waitForResetLinks(
  email: string,
  count: number,
): Promise<string[]> {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;

  while (true) {
    const emails = readEmailsTo(email).filter(
      (captured) => captured.subject === RESET_EMAIL_SUBJECT,
    );
    if (emails.length >= count) {
      return emails.map((captured) =>
        extractLink(captured.html, RESET_LINK_FRAGMENT),
      );
    }
    if (Date.now() >= deadline) {
      throw new Error(
        `Llegaron ${emails.length} de ${count} correos de recuperación a ${email}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

export function tokenFromLink(link: string): string {
  return new URLSearchParams(new URL(link).hash.slice(1)).get("token") ?? "";
}

export async function listResetTokens(userId: string) {
  const prisma = await getTestPrisma();
  return prisma.verification.findMany({ where: { value: userId } });
}

export async function countResetTokens(userId: string): Promise<number> {
  const prisma = await getTestPrisma();
  return prisma.verification.count({ where: { value: userId } });
}

export async function expireResetTokens(userId: string): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.verification.updateMany({
    where: { value: userId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
}

// El identificador está guardado con hash: la única forma de ver si un token
// quedó en claro es buscarlo en todas las filas.
export async function tokenAppearsInIdentifiers(
  token: string,
): Promise<boolean> {
  const prisma = await getTestPrisma();
  const rows = await prisma.verification.findMany({
    where: { identifier: { contains: token } },
  });
  return rows.length > 0;
}

export function requestResetViaPlatform(
  context: APIRequestContext,
  email: string,
) {
  return authPost(
    context,
    "/api/auth/request-password-reset",
    { email },
    PLATFORM_BASE_URL,
  );
}

export function resetPasswordViaPlatform(
  context: APIRequestContext,
  token: string,
  newPassword: string,
) {
  return authPost(
    context,
    "/api/auth/reset-password",
    { newPassword, token },
    PLATFORM_BASE_URL,
  );
}

export interface InviteHost {
  admin: OnboardedAdmin;
  clinicId: string;
  clinicName: string;
}

export async function createInviteHost(): Promise<InviteHost> {
  const admin = await createOnboardedAdmin({ emailPrefix: "anfitrion-reset" });
  const organizationId = await createOrganizationResource(admin);
  const clinicName = uniqueName("Sede Recupera");
  const clinicId = await createClinicResource(admin, organizationId, {
    name: clinicName,
  });
  return { admin, clinicId, clinicName };
}

export function invitePendingToHost(host: InviteHost) {
  return invitePendingUser(host.admin, {
    resourceId: host.clinicId,
    role: "USER",
  });
}
