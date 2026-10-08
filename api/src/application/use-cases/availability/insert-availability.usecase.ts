import { NotFound } from "@/application/errors/not-found.error";
import {
  getClient,
  inTransaction,
} from "@/infrastructure/postgres/transaction-context";
import z from "zod";

// El parámetro se llama `resourceId` por convención: es el nombre que busca
// `checkResource` en la política. La URL no cambia.
export const insertAvailabilityParamsSchema = z.object({
  resourceId: z.string({ error: "Clinic ID must be defined" }),
});

const MAX_AVAILABILITY_BLOCKS = 70;
const CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_NAMES = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

const clockTime = z
  .string({ error: "La hora debe ser un texto con formato HH:mm" })
  .regex(CLOCK_TIME_PATTERN, {
    error: "La hora debe tener formato HH:mm entre 00:00 y 23:59",
  });

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function hasValidTimes(block: { startTime: string; endTime: string }) {
  return (
    CLOCK_TIME_PATTERN.test(block.startTime) &&
    CLOCK_TIME_PATTERN.test(block.endTime)
  );
}

const availabilityBlockSchema = z
  .object(
    {
      dayOfWeek: z
        .number({ error: "El día de la semana debe ser un número" })
        .int({ error: "El día de la semana debe ser un entero" })
        .min(0, { error: "El día de la semana debe estar entre 0 y 6" })
        .max(6, { error: "El día de la semana debe estar entre 0 y 6" }),
      startTime: clockTime,
      endTime: clockTime,
    },
    { error: "Cada rango debe ser un objeto con día, inicio y fin" },
  )
  .refine(
    (block) =>
      !hasValidTimes(block) ||
      toMinutes(block.startTime) < toMinutes(block.endTime),
    {
      error: "La hora de inicio debe ser anterior a la hora de fin",
      path: ["endTime"],
    },
  );

type AvailabilityBlock = z.infer<typeof availabilityBlockSchema>;

function findOverlappingDay(blocks: AvailabilityBlock[]): number | undefined {
  const ordered = blocks
    .filter(
      (block) =>
        hasValidTimes(block) && block.dayOfWeek >= 0 && block.dayOfWeek <= 6,
    )
    .sort(
      (a, b) =>
        a.dayOfWeek - b.dayOfWeek ||
        toMinutes(a.startTime) - toMinutes(b.startTime),
    );
  return ordered.find((block, index) => {
    const previous = ordered[index - 1];
    return (
      previous !== undefined &&
      previous.dayOfWeek === block.dayOfWeek &&
      toMinutes(block.startTime) < toMinutes(previous.endTime)
    );
  })?.dayOfWeek;
}

export const insertAvailabilityBodySchema = z.object({
  availabilities: z
    .array(availabilityBlockSchema, {
      error: "La disponibilidad debe ser una lista de rangos",
    })
    .max(MAX_AVAILABILITY_BLOCKS, {
      error: `No puedes registrar más de ${MAX_AVAILABILITY_BLOCKS} rangos de disponibilidad`,
    })
    .superRefine((blocks, context) => {
      if (blocks.length > MAX_AVAILABILITY_BLOCKS) return;
      const overlappingDay = findOverlappingDay(blocks);
      if (overlappingDay === undefined) return;
      context.addIssue({
        code: "custom",
        message: `Los rangos del ${DAY_NAMES[overlappingDay]} no pueden solaparse`,
      });
    }),
});

export type InsertAvailabilityDto = {
  clinicId: string;
  userId: string;
} & z.infer<typeof insertAvailabilityBodySchema>;

export class InsertAvailabilityUseCase {
  async execute(dto: InsertAvailabilityDto) {
    await inTransaction(async () => {
      const client = getClient();

      const doctorProfile = await client.doctorProfile.findUnique({
        where: {
          userId_clinicId: {
            userId: dto.userId,
            clinicId: dto.clinicId,
          },
        },
      });

      if (!doctorProfile)
        throw new NotFound("User is not a doctor on the clinic");

      await client.availability.deleteMany({
        where: {
          doctorProfileId: doctorProfile.id,
        },
      });

      await client.availability.createMany({
        data: dto.availabilities.map((availability) => ({
          doctorProfileId: doctorProfile.id,
          ...availability,
        })),
      });
    });
  }
}
