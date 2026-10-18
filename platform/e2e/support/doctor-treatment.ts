import { randomUUID } from "node:crypto";
import { getTestPrisma } from "./db";

export type Treatment = "DR" | "DRA" | null;

export async function setDoctorTreatment(
  userId: string,
  treatment: Treatment,
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.user.update({ where: { id: userId }, data: { treatment } });
}

export async function readUserEmail(userId: string): Promise<string> {
  const prisma = await getTestPrisma();
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error("El usuario del escenario no existe");
  return user.email;
}

export async function seedPatient(accountId: string): Promise<string> {
  const prisma = await getTestPrisma();
  const patient = await prisma.patient.create({
    data: {
      name: "Camila",
      lastName: "Rivas",
      email: `camila-${randomUUID()}@example.com`,
      phone: "+51911111111",
      documentNumber: randomUUID().slice(0, 8),
      documentType: "DNI",
      accountId,
    },
  });
  return patient.id;
}

export async function seedAppointmentNow(params: {
  accountId: string;
  clinicId: string;
  doctorProfileId: string;
}): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.appointment.create({
    data: {
      doctorProfileId: params.doctorProfileId,
      clinicId: params.clinicId,
      patientId: await seedPatient(params.accountId),
      scheduledAt: new Date(),
      durationMinutes: 30,
      specialty: "Medicina general",
    },
  });
}
