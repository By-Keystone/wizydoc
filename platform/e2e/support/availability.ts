import { getTestPrisma } from "./db";

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
