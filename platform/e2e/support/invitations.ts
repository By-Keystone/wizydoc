import { getTestPrisma } from "./db";
import {
  inviteUserViaApi,
  type OnboardedAdmin,
  type SeedMembershipRole,
} from "./accounts";
import { uniqueEmail } from "./users";

export interface PendingInvitation {
  email: string;
  userId: string;
  token: string;
  membershipId: string;
}

export interface InvitePendingUserParams {
  resourceId: string;
  role: SeedMembershipRole;
  emailPrefix?: string;
  name?: string;
  lastName?: string;
  phone?: string;
  specialtyIds?: string[];
}

/** Invita por `POST /clinic/:resourceId/invitations` y lee el token real de la base (nunca del cuerpo de la respuesta: no lo expone). */
export async function invitePendingUser(
  admin: OnboardedAdmin,
  params: InvitePendingUserParams,
): Promise<PendingInvitation> {
  const email = uniqueEmail(params.emailPrefix ?? "invitado");

  await inviteUserViaApi(admin, {
    email,
    name: params.name ?? "Lucía",
    lastName: params.lastName ?? "Paredes",
    phone: params.phone ?? "+51987654321",
    role: params.role,
    resourceId: params.resourceId,
    specialtyIds: params.specialtyIds,
  });

  const prisma = await getTestPrisma();
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new Error(`No se encontró el usuario invitado ${email}`);

  const invitation = await prisma.userInvitation.findFirst({
    where: { membership: { userId: user.id, resourceId: params.resourceId } },
  });
  if (!invitation) {
    throw new Error(
      `No se encontró la invitación de ${email} en ${params.resourceId}`,
    );
  }

  return {
    email,
    userId: user.id,
    token: invitation.token,
    membershipId: invitation.membershipId,
  };
}

export async function countCredentialAccounts(userId: string): Promise<number> {
  const prisma = await getTestPrisma();
  const accounts = await prisma.authAccount.findMany({
    where: { userId, providerId: "credential" },
  });
  return accounts.length;
}

export async function getInvitationByToken(token: string) {
  const prisma = await getTestPrisma();
  const invitation = await prisma.userInvitation.findUnique({
    where: { token },
  });
  if (!invitation)
    throw new Error(`No se encontró la invitación con token ${token}`);
  return invitation;
}

/** Simula el estado `EXPIRED` con fecha futura (distinto de caducada por fecha). */
export async function markInvitationExpiredStatus(
  token: string,
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.userInvitation.update({
    where: { token },
    data: { status: "EXPIRED" },
  });
}

/** Simula una invitación caducada por fecha, con `status` aún `INVITED`. */
export async function backdateInvitationExpiry(token: string): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.userInvitation.update({
    where: { token },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
}

export async function softDeleteMembership(
  membershipId: string,
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.userResourceMembership.update({
    where: { id: membershipId },
    data: { deletedAt: new Date() },
  });
}

/** Reproduce el dato heredado del flujo anterior: aceptada sin credencial. */
export async function markInvitationAcceptedWithoutCredential(
  token: string,
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.userInvitation.update({
    where: { token },
    data: { status: "ACCEPTED", acceptedAt: new Date() },
  });
}

export async function getLatestSessionTrace(userId: string) {
  const prisma = await getTestPrisma();
  return prisma.session.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}
