import {
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
import {
  type Appointment,
  canCancel,
  hasStarted,
} from "@/domain/entities/appointment/entity";
import type { IAppointmentRepository } from "@/domain/repositories/appointment.repository";
import { wallTimeToInstant } from "@/domain/services/clinic-time";
import { GetAppointmentPortalQuery } from "@/infrastructure/postgres/queries/appointment/get-appointment-portal.query";
import { AppointmentRepository } from "@/infrastructure/postgres/repositories/appointment.repository";
import z from "zod";
import { clinicWallTimeSchema } from "./clinic-wall-time.schema";

export const cancelAppointmentSchema = z
  .object({ expectedScheduledAt: clinicWallTimeSchema.optional() })
  .optional();

export class CancelAppointmentUseCase {
  constructor(
    private readonly appointments: IAppointmentRepository = new AppointmentRepository(),
    private readonly portal: IGetAppointmentPortalQuery = new GetAppointmentPortalQuery(),
  ) {}

  private async findOpenAppointment(token: string): Promise<Appointment> {
    const appointment = await this.appointments.findByAccessToken(token);
    if (!appointment || hasStarted(appointment, new Date()))
      throw new AppointmentLinkUnavailable();
    return appointment;
  }

  private parseBody(body: unknown) {
    const parsed = cancelAppointmentSchema.safeParse(body);
    if (!parsed.success) throw new BadRequest(parsed.error.issues[0].message);
    return parsed.data;
  }

  private assertSeenTime(
    appointment: Appointment,
    expectedScheduledAt: Date | undefined,
  ) {
    if (
      expectedScheduledAt &&
      expectedScheduledAt.getTime() !== appointment.scheduledAt.getTime()
    )
      throw new AppointmentConflict(
        APPOINTMENT_CHANGED_MESSAGE,
        "APPOINTMENT_CHANGED",
      );
  }

  private async assertCancelledByAnotherRequest(token: string) {
    const current = await this.findOpenAppointment(token);
    if (current.status !== "CANCELLED")
      throw new AppointmentConflict(
        APPOINTMENT_CHANGED_MESSAGE,
        "APPOINTMENT_CHANGED",
      );
  }

  private async readPortal(token: string): Promise<AppointmentPortal> {
    const portal = await this.portal.execute(token);
    if (!portal) throw new AppointmentLinkUnavailable();
    return portal;
  }

  async execute(token: string, body: unknown): Promise<AppointmentPortal> {
    const appointment = await this.findOpenAppointment(token);
    const { expectedScheduledAt } = this.parseBody(body) ?? {};

    if (appointment.status === "CANCELLED") return this.readPortal(token);

    const expectedInstant = expectedScheduledAt
      ? wallTimeToInstant(expectedScheduledAt)
      : undefined;
    this.assertSeenTime(appointment, expectedInstant);

    const now = new Date();
    if (!canCancel(appointment, now))
      throw new AppointmentConflict(
        LESS_THAN_NOTICE_MESSAGE,
        "CANCEL_NOT_ALLOWED",
      );

    const wasCancelled = await this.appointments.cancel({
      appointmentId: appointment.id,
      cancelledAt: now,
      expectedScheduledAt: expectedInstant,
    });
    if (!wasCancelled) await this.assertCancelledByAnotherRequest(token);

    return this.readPortal(token);
  }
}
