import { AppointmentConflict } from "@/application/errors/appointment-conflict.error";
import { BadRequest } from "@/application/errors/bad-request.errors";
import { NotFound } from "@/application/errors/not-found.error";
import type { IAppointmentNotifier } from "@/application/ports/appointment-notifier.port";
import type { IEmailService } from "@/application/ports/email-service.port";
import type {
  AppointmentNotice,
  IGetAppointmentNoticeQuery,
} from "@/application/queries/appointment/get-appointment-notice.query";
import {
  type IGetManagedAppointmentQuery,
  MANAGE_LINK_UNAVAILABLE,
  type ManagedAppointment,
} from "@/application/queries/appointment/get-managed-appointment.query";
import type { IGetDoctorSlotsQuery } from "@/application/queries/doctor-profile/get-doctor-slots.query";
import {
  type Appointment,
  hasMovedFrom,
  isCancelled,
  isManageable,
  MAX_RESCHEDULES,
  RESCHEDULE_DEADLINE_HOURS,
  rescheduleBlockedBy,
} from "@/domain/entities/appointment/entity";
import { MAX_DAYS_AHEAD } from "@/domain/entities/availability/entity";
import type { IAppointmentRepository } from "@/domain/repositories/appointment.repository";
import {
  addDays,
  instantOfWallTime,
  today,
} from "@/domain/services/clinic-time";
import { GetAppointmentNoticeQuery } from "@/infrastructure/postgres/queries/appointment/get-appointment-notice.query";
import { GetManagedAppointmentQuery } from "@/infrastructure/postgres/queries/appointment/get-managed-appointment.query";
import { GetDoctorSlotsQuery } from "@/infrastructure/postgres/queries/doctor-profile/get-doctor-slots.query";
import { AppointmentRepository } from "@/infrastructure/postgres/repositories/appointment.repository";
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
    private readonly appointments: IAppointmentRepository = new AppointmentRepository(),
    private readonly managedAppointment: IGetManagedAppointmentQuery = new GetManagedAppointmentQuery(),
    private readonly doctorSlots: IGetDoctorSlotsQuery = new GetDoctorSlotsQuery(),
    private readonly appointmentNotice: IGetAppointmentNoticeQuery = new GetAppointmentNoticeQuery(),
    private readonly notifier: IAppointmentNotifier = new AppointmentChangeNotifier(
      props.emailService,
    ),
  ) {}

  private assertManageable(appointment: Appointment | null): Appointment {
    if (!appointment || !isManageable(appointment, new Date()))
      throw new NotFound(MANAGE_LINK_UNAVAILABLE);
    return appointment;
  }

  // El cambio ya quedó hecho: un fallo al leer el aviso no puede devolver un error al paciente.
  private async readNotice(
    appointmentId: string,
  ): Promise<AppointmentNotice | null> {
    try {
      return await this.appointmentNotice.execute(appointmentId);
    } catch (error) {
      const errName = error instanceof Error ? error.name : "UnknownError";
      const errCode =
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined;
      console.error(
        { appointmentId, errName, errCode },
        "[appointment-notice-read]",
      );
      return null;
    }
  }

  private async notifyRescheduled(
    appointment: Appointment,
    previousScheduledAt: Date,
    token: string,
  ) {
    const notice = await this.readNotice(appointment.id);
    if (notice)
      await this.notifier.notifyRescheduled({
        notice,
        previousScheduledAt,
        token,
      });
  }

  private parseBody(body: unknown) {
    const parsed = rescheduleAppointmentByTokenSchema.safeParse(body);
    if (!parsed.success) throw new BadRequest(parsed.error.issues[0].message);
    return parsed.data;
  }

  private assertCanReschedule(
    appointment: Appointment,
    expectedScheduledAt: string | undefined,
  ) {
    if (isCancelled(appointment))
      throw new AppointmentConflict(
        APPOINTMENT_CANCELLED,
        "RESCHEDULE_NOT_ALLOWED",
      );

    if (expectedScheduledAt && hasMovedFrom(appointment, expectedScheduledAt))
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

  private async moveAppointment(appointment: Appointment, scheduledAt: Date) {
    const wasMoved = await this.appointments.reschedule(
      appointment,
      scheduledAt,
    );

    if (!wasMoved)
      throw new AppointmentConflict(APPOINTMENT_CHANGED, "APPOINTMENT_CHANGED");
  }

  async execute(
    dto: RescheduleAppointmentByTokenDto,
  ): Promise<ManagedAppointment> {
    const appointment = this.assertManageable(
      await this.appointments.findByAccessToken(dto.token),
    );

    const { scheduledAt, expectedScheduledAt } = this.parseBody(dto.body);
    this.assertCanReschedule(appointment, expectedScheduledAt);

    const [date, time] = scheduledAt.split("T");

    // La hora se valida contra el médico de la cita, nunca contra uno que mande el cliente.
    await this.assertSlotIsOffered(appointment.doctorProfileId, date, time);
    await this.moveAppointment(appointment, instantOfWallTime(scheduledAt));

    const moved = this.assertManageable(
      await this.appointments.findById(appointment.id),
    );

    await this.notifyRescheduled(moved, appointment.scheduledAt, dto.token);

    const view = await this.managedAppointment.execute(dto.token);
    if (!view) throw new NotFound(MANAGE_LINK_UNAVAILABLE);
    return view;
  }
}
