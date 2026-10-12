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
import {
  type Appointment,
  hasMovedFrom,
  isCancelled,
  isManageable,
} from "@/domain/entities/appointment/entity";
import type { IAppointmentRepository } from "@/domain/repositories/appointment.repository";
import { GetAppointmentNoticeQuery } from "@/infrastructure/postgres/queries/appointment/get-appointment-notice.query";
import { GetManagedAppointmentQuery } from "@/infrastructure/postgres/queries/appointment/get-managed-appointment.query";
import { AppointmentRepository } from "@/infrastructure/postgres/repositories/appointment.repository";
import { AppointmentChangeNotifier } from "@/infrastructure/services/email-service/appointment-change-notifier";
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
    private readonly appointments: IAppointmentRepository = new AppointmentRepository(),
    private readonly managedAppointment: IGetManagedAppointmentQuery = new GetManagedAppointmentQuery(),
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

  private async notifyCancelled(appointment: Appointment) {
    const notice = await this.readNotice(appointment.id);
    if (notice) await this.notifier.notifyCancelled(notice);
  }

  private async cancel(
    appointment: Appointment,
    expectedScheduledAt: string | undefined,
  ) {
    if (expectedScheduledAt && hasMovedFrom(appointment, expectedScheduledAt))
      throw new AppointmentConflict(APPOINTMENT_CHANGED, "APPOINTMENT_CHANGED");

    const wasCancelled = await this.appointments.cancel(
      appointment,
      new Date(),
      Boolean(expectedScheduledAt),
    );

    if (wasCancelled) await this.notifyCancelled(appointment);

    return wasCancelled;
  }

  async execute(dto: CancelAppointmentByTokenDto): Promise<ManagedAppointment> {
    const appointment = this.assertManageable(
      await this.appointments.findByAccessToken(dto.token),
    );

    const parsed = cancelAppointmentByTokenSchema.safeParse(dto.body);
    if (!parsed.success) throw new BadRequest(parsed.error.issues[0].message);

    const alreadyCancelled = isCancelled(appointment);
    const wasCancelledNow =
      !alreadyCancelled &&
      (await this.cancel(appointment, parsed.data?.expectedScheduledAt));

    const current = this.assertManageable(
      await this.appointments.findById(appointment.id),
    );

    // Cancelar la cita equivocada es peor que no cancelar: si ya no es la que el paciente vio, se avisa.
    if (!alreadyCancelled && !wasCancelledNow && !isCancelled(current))
      throw new AppointmentConflict(APPOINTMENT_CHANGED, "APPOINTMENT_CHANGED");

    const view = await this.managedAppointment.execute(dto.token);
    if (!view) throw new NotFound(MANAGE_LINK_UNAVAILABLE);
    return view;
  }
}
