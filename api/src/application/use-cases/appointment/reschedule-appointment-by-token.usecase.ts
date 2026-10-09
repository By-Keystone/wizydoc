import { AppointmentConflict } from "@/application/errors/appointment-conflict.error";
import { BadRequest } from "@/application/errors/bad-request.errors";
import { NotFound } from "@/application/errors/not-found.error";
import type { IAppointmentNotifier } from "@/application/ports/appointment-notifier.port";
import type { IEmailService } from "@/application/ports/email-service.port";
import { MANAGE_LINK_UNAVAILABLE } from "@/application/queries/appointment/get-managed-appointment.query";
import type { IGetDoctorSlotsQuery } from "@/application/queries/doctor-profile/get-doctor-slots.query";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  instantOfWallTime,
  MAX_RESCHEDULES,
  type ManagedAppointment,
  type ManagedAppointmentRecord,
  RESCHEDULE_DEADLINE_HOURS,
  rescheduleBlockedBy,
  toManagedAppointment,
  wallTimeOfInstant,
} from "@/domain/entities/appointment/self-service";
import { MAX_DAYS_AHEAD } from "@/domain/entities/availability/entity";
import type { IManagedAppointmentRepository } from "@/domain/repositories/managed-appointment.repository";
import { addDays, today } from "@/domain/services/clinic-time";
import { ManagedAppointmentRepository } from "@/infrastructure/postgres/repositories/managed-appointment.repository";
import { GetDoctorSlotsQuery } from "@/infrastructure/postgres/queries/doctor-profile/get-doctor-slots.query";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import { AppointmentChangeNotifier } from "@/infrastructure/services/email-service/appointment-change-notifier";
import z from "zod";
import { APPOINTMENT_CHANGED } from "./cancel-appointment-by-token.usecase";
import { clinicWallTimeSchema } from "./create-appointment.usecase";

export const RESCHEDULE_SLOT_TAKEN =
  "Otro paciente acaba de tomar ese horario. Elige otro.";
const APPOINTMENT_CANCELLED =
  "Esta cita está cancelada. Puedes reservar una nueva.";
const DEADLINE_PASSED = `Ya no se puede reprogramar porque faltan menos de ${RESCHEDULE_DEADLINE_HOURS} horas para tu cita. Si no puedes asistir, cancélala y reserva otro horario.`;
const LIMIT_REACHED = `Ya reprogramaste esta cita ${MAX_RESCHEDULES} veces. Si necesitas otro horario, cancélala y reserva de nuevo.`;

export const rescheduleAppointmentByTokenSchema = z.object({
  scheduledAt: clinicWallTimeSchema,
  expectedScheduledAt: clinicWallTimeSchema.optional(),
});

interface RescheduleAppointmentByTokenDto {
  token: string;
  body: unknown;
}

interface Props {
  readonly emailService: IEmailService;
}

export class RescheduleAppointmentByTokenUseCase {
  constructor(
    props: Props,
    private readonly appointments: IManagedAppointmentRepository = new ManagedAppointmentRepository(),
    private readonly doctorSlots: IGetDoctorSlotsQuery = new GetDoctorSlotsQuery(),
    private readonly notifier: IAppointmentNotifier = new AppointmentChangeNotifier(
      props.emailService,
    ),
  ) {}

  private parseBody(body: unknown) {
    const parsed = rescheduleAppointmentByTokenSchema.safeParse(body);
    if (!parsed.success) throw new BadRequest(parsed.error.issues[0].message);
    return parsed.data;
  }

  private assertCanReschedule(
    appointment: ManagedAppointmentRecord,
    expectedScheduledAt: string | undefined,
  ) {
    if (appointment.status === "CANCELLED")
      throw new AppointmentConflict(
        APPOINTMENT_CANCELLED,
        "RESCHEDULE_NOT_ALLOWED",
      );

    const wasMoved =
      expectedScheduledAt &&
      expectedScheduledAt !== wallTimeOfInstant(appointment.scheduledAt);
    if (wasMoved)
      throw new AppointmentConflict(APPOINTMENT_CHANGED, "APPOINTMENT_CHANGED");

    const blockedBy = rescheduleBlockedBy(appointment, new Date());
    if (blockedBy === "DEADLINE")
      throw new AppointmentConflict(DEADLINE_PASSED, "RESCHEDULE_NOT_ALLOWED");
    if (blockedBy === "LIMIT")
      throw new AppointmentConflict(LIMIT_REACHED, "RESCHEDULE_NOT_ALLOWED");
  }

  private async assertSlotIsOffered(
    doctorProfileId: string,
    date: string,
    time: string,
  ) {
    const isTooFarAhead = date > addDays(today(), MAX_DAYS_AHEAD);
    if (isTooFarAhead)
      throw new AppointmentConflict(RESCHEDULE_SLOT_TAKEN, "SLOT_TAKEN");

    const { days } = await this.doctorSlots.execute({
      doctorProfileId,
      from: date,
      to: date,
    });

    if (!days[date]?.includes(time))
      throw new AppointmentConflict(RESCHEDULE_SLOT_TAKEN, "SLOT_TAKEN");
  }

  private async moveAppointment(
    appointment: ManagedAppointmentRecord,
    scheduledAt: Date,
  ) {
    const { count } = await getClient().appointment.updateMany({
      where: {
        id: appointment.id,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        scheduledAt: appointment.scheduledAt,
        rescheduleCount: { lt: MAX_RESCHEDULES },
      },
      data: { scheduledAt, rescheduleCount: { increment: 1 } },
    });

    if (count === 0)
      throw new AppointmentConflict(APPOINTMENT_CHANGED, "APPOINTMENT_CHANGED");
  }

  async execute(
    dto: RescheduleAppointmentByTokenDto,
  ): Promise<ManagedAppointment> {
    const appointment = await this.appointments.findByToken(dto.token);
    if (!appointment) throw new NotFound(MANAGE_LINK_UNAVAILABLE);

    const { scheduledAt, expectedScheduledAt } = this.parseBody(dto.body);
    this.assertCanReschedule(appointment, expectedScheduledAt);

    const [date, time] = scheduledAt.split("T");

    // La hora se valida contra el médico de la cita, nunca contra uno que mande el cliente.
    await this.assertSlotIsOffered(appointment.doctorProfileId, date, time);
    await this.moveAppointment(appointment, instantOfWallTime(scheduledAt));

    const moved = await this.appointments.findById(appointment.id);
    if (!moved) throw new NotFound(MANAGE_LINK_UNAVAILABLE);

    await this.notifier.notifyRescheduled({
      appointment: moved,
      previousScheduledAt: appointment.scheduledAt,
      token: dto.token,
    });

    return toManagedAppointment(moved, new Date());
  }
}
