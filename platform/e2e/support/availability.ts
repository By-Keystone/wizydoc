import type { APIRequestContext } from "@playwright/test";
import {
  createClinicResource,
  createMemberWithRole,
  createOnboardedAdmin,
  createOrganizationResource,
} from "./accounts";
import { getTestPrisma } from "./db";
import { uniqueName } from "./users";

export const MAX_AVAILABILITY_BLOCKS = 70;

export interface AvailabilityBlock {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface ClinicDoctor {
  context: APIRequestContext;
  email: string;
  accountId: string;
  clinicId: string;
  doctorProfileId: string;
}

export function nonOverlappingBlocks(count: number): AvailabilityBlock[] {
  return Array.from({ length: count }, (_, index) => {
    const slot = Math.floor(index / 7);
    const startHour = String(slot * 2).padStart(2, "0");
    const endHour = String(slot * 2 + 1).padStart(2, "0");
    return {
      dayOfWeek: index % 7,
      startTime: `${startHour}:00`,
      endTime: `${endHour}:00`,
    };
  });
}

export async function createClinicDoctor(label: string): Promise<ClinicDoctor> {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${label}` });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName(`ORG-${label}`),
  );
  const clinicId = await createClinicResource(admin, organizationId, {
    name: uniqueName(`Sede-${label}`),
  });
  const member = await createMemberWithRole({
    accountId: admin.accountId,
    resourceId: clinicId,
    role: "DOCTOR",
    createdBy: admin.userId,
    emailPrefix: `doctor-${label}`,
  });
  const prisma = await getTestPrisma();
  const profile = await prisma.doctorProfile.create({
    data: { userId: member.userId, clinicId },
  });
  return {
    context: member.context,
    email: member.email,
    accountId: admin.accountId,
    clinicId,
    doctorProfileId: profile.id,
  };
}

/**
 * Disponibilidad de 00:00 a 23:30 los 7 días de la semana: cualquier semana
 * futura tiene huecos libres, sin depender de la hora o el día en que corre
 * la prueba (ver `get-doctor-slots.query.ts`, que descarta huecos ya pasados).
 */
export async function seedFullDayAvailability(
  userId: string,
  clinicId: string,
): Promise<string> {
  const prisma = await getTestPrisma();
  const doctorProfile = await prisma.doctorProfile.findUniqueOrThrow({
    where: { userId_clinicId: { userId, clinicId } },
  });

  await prisma.availability.createMany({
    data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
      doctorProfileId: doctorProfile.id,
      dayOfWeek,
      startTime: "00:00",
      endTime: "23:30",
    })),
  });

  return doctorProfile.id;
}
