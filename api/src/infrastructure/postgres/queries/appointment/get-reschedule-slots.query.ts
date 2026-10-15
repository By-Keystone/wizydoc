import {
  ALREADY_RESCHEDULED_MESSAGE,
  APPOINTMENT_CHANGED_MESSAGE,
  AppointmentConflict,
  LESS_THAN_NOTICE_MESSAGE,
} from "@/application/errors/appointment-conflict.error";
import { AppointmentLinkUnavailable } from "@/application/errors/appointment-link-unavailable.error";
import { BadRequest } from "@/application/errors/bad-request.errors";
import type { IGetRescheduleSlotsQuery } from "@/application/queries/appointment/get-reschedule-slots.query";
import {
  type DoctorSlots,
  type GetDoctorSlotsDto,
  getDoctorSlotsQuerySchema,
  type IGetDoctorSlotsQuery,
} from "@/application/queries/doctor-profile/get-doctor-slots.query";
import {
  type Appointment,
  hasStarted,
  isActive,
  isNewSlotFarEnough,
  rescheduleBlockedBy,
} from "@/domain/entities/appointment/entity";
import type { IAppointmentRepository } from "@/domain/repositories/appointment.repository";
import { toInstant } from "@/domain/services/clinic-time";
import { AppointmentRepository } from "../../repositories/appointment.repository";
import { GetDoctorSlotsQuery } from "../doctor-profile/get-doctor-slots.query";

export class GetRescheduleSlotsQuery implements IGetRescheduleSlotsQuery {
  constructor(
    private readonly appointments: IAppointmentRepository = new AppointmentRepository(),
    private readonly doctorSlots: IGetDoctorSlotsQuery = new GetDoctorSlotsQuery(),
  ) {}

  private async findOpenAppointment(token: string): Promise<Appointment> {
    const appointment = await this.appointments.findByAccessToken(token);
    if (!appointment || hasStarted(appointment, new Date()))
      throw new AppointmentLinkUnavailable();
    return appointment;
  }

  private parseRange(range: unknown): Pick<GetDoctorSlotsDto, "from" | "to"> {
    const parsed = getDoctorSlotsQuerySchema.safeParse(range);
    if (!parsed.success) throw new BadRequest(parsed.error.issues[0].message);
    return parsed.data;
  }

  private assertCanReschedule(appointment: Appointment, now: Date) {
    if (!isActive(appointment))
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

  async execute(token: string, range: unknown): Promise<DoctorSlots> {
    const appointment = await this.findOpenAppointment(token);
    const { from, to } = this.parseRange(range);
    const now = new Date();

    this.assertCanReschedule(appointment, now);

    const { durationMinutes, days } = await this.doctorSlots.execute({
      doctorProfileId: appointment.doctorProfileId,
      from,
      to,
    });

    const farEnoughDays = Object.fromEntries(
      Object.entries(days).map(([date, times]) => [
        date,
        times.filter((time) => isNewSlotFarEnough(toInstant(date, time), now)),
      ]),
    );
    return { durationMinutes, days: farEnoughDays };
  }
}
