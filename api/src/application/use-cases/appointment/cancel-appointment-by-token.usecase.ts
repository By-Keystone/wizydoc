import { AppointmentConflict } from "@/application/errors/appointment-conflict.error";
import { BadRequest } from "@/application/errors/bad-request.errors";
import { NotFound } from "@/application/errors/not-found.error";
import type { IEmailService } from "@/application/ports/email-service.port";
import type { IAppointmentNotifier } from "@/application/ports/appointment-notifier.port";
import { MANAGE_LINK_UNAVAILABLE } from "@/application/queries/appointment/get-managed-appointment.query";
import {
  ACTIVE_APPOINTMENT_STATUSES,
  type ManagedAppointment,
  type ManagedAppointmentRecord,
  toManagedAppointment,
  wallTimeOfInstant,
} from "@/domain/entities/appointment/self-service";
import type { IManagedAppointmentRepository } from "@/domain/repositories/managed-appointment.repository";
import { AppointmentChangeNotifier } from "@/infrastructure/services/email-service/appointment-change-notifier";
import { ManagedAppointmentRepository } from "@/infrastructure/postgres/repositories/managed-appointment.repository";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import z from "zod";
import { clinicWallTimeSchema } from "./create-appointment.usecase";

export const APPOINTMENT_CHANGED =
  "Tu cita cambió mientras elegías el horario. Recarga la página.";

export const cancelAppointmentByTokenSchema = z
  .object({ expectedScheduledAt: clinicWallTimeSchema.optional() })
  .optional();

interface CancelAppointmentByTokenDto {
  token: string;
  body: unknown;
}

interface Props {
  readonly emailService: IEmailService;
}

export class CancelAppointmentByTokenUseCase {
  constructor(
    props: Props,
    private readonly appointments: IManagedAppointmentRepository = new ManagedAppointmentRepository(),
    private readonly notifier: IAppointmentNotifier = new AppointmentChangeNotifier(
      props.emailService,
    ),
  ) {}

  private async cancel(
    appointment: ManagedAppointmentRecord,
    expectedScheduledAt: string | undefined,
  ) {
    const wasMoved =
      expectedScheduledAt &&
      expectedScheduledAt !== wallTimeOfInstant(appointment.scheduledAt);
    if (wasMoved)
      throw new AppointmentConflict(APPOINTMENT_CHANGED, "APPOINTMENT_CHANGED");

    const now = new Date();
    const { count } = await getClient().appointment.updateMany({
      where: {
        id: appointment.id,
        status: { in: [...ACTIVE_APPOINTMENT_STATUSES] },
        scheduledAt: {
          gt: now,
          ...(expectedScheduledAt && { equals: appointment.scheduledAt }),
        },
      },
      data: { status: "CANCELLED", cancelledAt: now },
    });

    if (count === 1) await this.notifier.notifyCancelled(appointment);

    return count === 1;
  }

  async execute(dto: CancelAppointmentByTokenDto): Promise<ManagedAppointment> {
    const appointment = await this.appointments.findByToken(dto.token);
    if (!appointment) throw new NotFound(MANAGE_LINK_UNAVAILABLE);

    const parsed = cancelAppointmentByTokenSchema.safeParse(dto.body);
    if (!parsed.success) throw new BadRequest(parsed.error.issues[0].message);

    const expectedScheduledAt = parsed.data?.expectedScheduledAt;

    const alreadyCancelled = appointment.status === "CANCELLED";
    const wasCancelledNow =
      !alreadyCancelled &&
      (await this.cancel(appointment, expectedScheduledAt));

    const current = await this.appointments.findById(appointment.id);
    if (!current) throw new NotFound(MANAGE_LINK_UNAVAILABLE);

    // Cancelar la cita equivocada es peor que no cancelar: si ya no es la que el paciente vio, se avisa.
    if (!alreadyCancelled && !wasCancelledNow && current.status !== "CANCELLED")
      throw new AppointmentConflict(APPOINTMENT_CHANGED, "APPOINTMENT_CHANGED");

    return toManagedAppointment(current, new Date());
  }
}
