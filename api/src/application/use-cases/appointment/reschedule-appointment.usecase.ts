import {
  ALREADY_RESCHEDULED_MESSAGE,
  APPOINTMENT_CHANGED_MESSAGE,
  AppointmentConflict,
  LESS_THAN_NOTICE_MESSAGE,
} from "@/application/errors/appointment-conflict.error";
import { AppointmentLinkUnavailable } from "@/application/errors/appointment-link-unavailable.error";
import { BadRequest } from "@/application/errors/bad-request.errors";
import type {
  AppointmentPortal,
  IGetAppointmentPortalQuery,
} from "@/application/queries/appointment/get-appointment-portal.query";
import type { IGetRescheduleSlotsQuery } from "@/application/queries/appointment/get-reschedule-slots.query";
import type { IGetDoctorSlotsQuery } from "@/application/queries/doctor-profile/get-doctor-slots.query";
import {
  type Appointment,
  hasStarted,
  isActive,
  isNewSlotFarEnough,
  rescheduleBlockedBy,
} from "@/domain/entities/appointment/entity";
import { MAX_DAYS_AHEAD } from "@/domain/entities/availability/entity";
import type { IAppointmentRepository } from "@/domain/repositories/appointment.repository";
import {
  addDays,
  CLINIC_TIME_ZONE,
  parseWallTime,
  today,
  wallTimeToInstant,
} from "@/domain/services/clinic-time";
import { GetAppointmentPortalQuery } from "@/infrastructure/postgres/queries/appointment/get-appointment-portal.query";
import { GetRescheduleSlotsQuery } from "@/infrastructure/postgres/queries/appointment/get-reschedule-slots.query";
import { GetDoctorSlotsQuery } from "@/infrastructure/postgres/queries/doctor-profile/get-doctor-slots.query";
import { AppointmentRepository } from "@/infrastructure/postgres/repositories/appointment.repository";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";
import { clinicWallTimeSchema } from "./clinic-wall-time.schema";

const DOCTOR_CHANGE_NOT_ALLOWED_MESSAGE =
  "No puedes pasar tu cita a ese médico. Elige otro o mantén tu cita.";

export const rescheduleAppointmentSchema = z.object({
  scheduledAt: clinicWallTimeSchema,
  expectedScheduledAt: clinicWallTimeSchema.optional(),
  newDoctorProfileId: z.uuid().optional(),
});

type RescheduleAppointmentDto = z.infer<typeof rescheduleAppointmentSchema>;

function slotTakenMessage(slotStart: Date): string {
  const day = new Intl.DateTimeFormat("es", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: CLINIC_TIME_ZONE,
  })
    .format(slotStart)
    .replace(",", "");
  const time = new Intl.DateTimeFormat("es", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: CLINIC_TIME_ZONE,
  }).format(slotStart);
  return `Otro paciente acaba de tomar el horario del ${day}, ${time}. Elige otro.`;
}

export class RescheduleAppointmentUseCase {
  constructor(
    private readonly appointments: IAppointmentRepository = new AppointmentRepository(),
    private readonly portal: IGetAppointmentPortalQuery = new GetAppointmentPortalQuery(),
    private readonly doctorSlots: IGetDoctorSlotsQuery = new GetDoctorSlotsQuery(),
    private readonly rescheduleSlots: IGetRescheduleSlotsQuery = new GetRescheduleSlotsQuery(),
  ) {}

  private async findOpenAppointment(token: string): Promise<Appointment> {
    const appointment = await this.appointments.findByAccessToken(token);
    if (!appointment || hasStarted(appointment, new Date()))
      throw new AppointmentLinkUnavailable();
    return appointment;
  }

  private parseBody(body: unknown): RescheduleAppointmentDto {
    const parsed = rescheduleAppointmentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequest(parsed.error.issues[0].message);
    return parsed.data;
  }

  private assertCanReschedule(
    appointment: Appointment,
    expectedScheduledAt: string | undefined,
    now: Date,
  ) {
    const hasChanged =
      !isActive(appointment) ||
      (expectedScheduledAt !== undefined &&
        wallTimeToInstant(expectedScheduledAt).getTime() !==
          appointment.scheduledAt.getTime());
    if (hasChanged)
      throw new AppointmentConflict(
        APPOINTMENT_CHANGED_MESSAGE,
        "APPOINTMENT_CHANGED",
      );

    const blockedBy = rescheduleBlockedBy(appointment, now);
    if (blockedBy === "DEADLINE")
      throw new AppointmentConflict(
        LESS_THAN_NOTICE_MESSAGE,
        "RESCHEDULE_NOT_ALLOWED",
      );
    if (blockedBy === "LIMIT")
      throw new AppointmentConflict(
        ALREADY_RESCHEDULED_MESSAGE,
        "RESCHEDULE_NOT_ALLOWED",
      );
  }

  private async isAlternativeDoctor(
    appointment: Appointment,
    doctorProfileId: string,
  ): Promise<boolean> {
    const client = getClient();

    const clinic = await client.resource.findUnique({
      where: { id: appointment.clinicId },
      select: { parentResourceId: true },
    });
    if (!clinic?.parentResourceId) return false;

    const doctor = await client.doctorProfile.findFirst({
      where: {
        id: doctorProfileId,
        clinicId: appointment.clinicId,
        specialties: {
          some: {
            name: appointment.specialty,
            organizationId: clinic.parentResourceId,
          },
        },
        user: {
          resourceMemberships: {
            some: { resourceId: appointment.clinicId, deletedAt: null },
          },
        },
      },
      select: { id: true },
    });
    return doctor !== null;
  }

  private async resolveTargetDoctor(
    appointment: Appointment,
    newDoctorProfileId: string | undefined,
    now: Date,
  ): Promise<string> {
    if (
      !newDoctorProfileId ||
      newDoctorProfileId === appointment.doctorProfileId
    )
      return appointment.doctorProfileId;

    const canChangeDoctor =
      (await this.isAlternativeDoctor(appointment, newDoctorProfileId)) &&
      !(await this.rescheduleSlots.doctorHasSlotFarEnough(
        appointment.doctorProfileId,
        now,
      ));
    if (!canChangeDoctor)
      throw new AppointmentConflict(
        DOCTOR_CHANGE_NOT_ALLOWED_MESSAGE,
        "DOCTOR_CHANGE_NOT_ALLOWED",
      );

    return newDoctorProfileId;
  }

  private async assertSlotIsOffered(
    doctorProfileId: string,
    scheduledAt: string,
    now: Date,
  ) {
    const { date, time } = parseWallTime(scheduledAt);
    const slotStart = wallTimeToInstant(scheduledAt);
    const slotTaken = new AppointmentConflict(
      slotTakenMessage(slotStart),
      "SLOT_TAKEN",
    );

    if (date > addDays(today(), MAX_DAYS_AHEAD)) throw slotTaken;
    if (!isNewSlotFarEnough(slotStart, now)) throw slotTaken;

    const { days } = await this.doctorSlots.execute({
      doctorProfileId,
      from: date,
      to: date,
    });
    if (!days[date]?.includes(time)) throw slotTaken;
  }

  private async readPortal(token: string): Promise<AppointmentPortal> {
    const portal = await this.portal.execute(token);
    if (!portal) throw new AppointmentLinkUnavailable();
    return portal;
  }

  async execute(token: string, body: unknown): Promise<AppointmentPortal> {
    const appointment = await this.findOpenAppointment(token);
    const dto = this.parseBody(body);
    const now = new Date();

    this.assertCanReschedule(appointment, dto.expectedScheduledAt, now);

    const targetDoctorProfileId = await this.resolveTargetDoctor(
      appointment,
      dto.newDoctorProfileId,
      now,
    );
    await this.assertSlotIsOffered(targetDoctorProfileId, dto.scheduledAt, now);

    const newScheduledAt = wallTimeToInstant(dto.scheduledAt);
    const outcome = await this.appointments.reschedule({
      appointmentId: appointment.id,
      expectedScheduledAt: appointment.scheduledAt,
      newScheduledAt,
      newDoctorProfileId:
        targetDoctorProfileId === appointment.doctorProfileId
          ? undefined
          : targetDoctorProfileId,
    });

    if (outcome === "SLOT_TAKEN")
      throw new AppointmentConflict(
        slotTakenMessage(newScheduledAt),
        "SLOT_TAKEN",
      );
    if (outcome === "NOT_UPDATED")
      throw new AppointmentConflict(
        APPOINTMENT_CHANGED_MESSAGE,
        "APPOINTMENT_CHANGED",
      );

    return this.readPortal(token);
  }
}
