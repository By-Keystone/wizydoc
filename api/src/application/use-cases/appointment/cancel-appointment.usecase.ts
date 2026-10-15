import {
  APPOINTMENT_CHANGED_MESSAGE,
  AppointmentConflict,
  LESS_THAN_NOTICE_MESSAGE,
} from "@/application/errors/appointment-conflict.error";
import { AppointmentLinkUnavailable } from "@/application/errors/appointment-link-unavailable.error";
import { BadRequest } from "@/application/errors/bad-request.errors";
import type { IEmailService } from "@/application/ports/email-service.port";
import type {
  AppointmentPortal,
  IGetAppointmentPortalQuery,
} from "@/application/queries/appointment/get-appointment-portal.query";
import type {
  AppointmentNotice,
  IGetAppointmentNoticeQuery,
} from "@/application/queries/appointment/get-appointment-notice.query";
import {
  type Appointment,
  CANCELLATION_REASON_LABELS,
  CANCELLATION_REASONS,
  type CancellationReason,
  canCancel,
  hasStarted,
} from "@/domain/entities/appointment/entity";
import type { IAppointmentRepository } from "@/domain/repositories/appointment.repository";
import {
  formatClinicDateTime,
  wallTimeToInstant,
} from "@/domain/services/clinic-time";
import { GetAppointmentNoticeQuery } from "@/infrastructure/postgres/queries/appointment/get-appointment-notice.query";
import { GetAppointmentPortalQuery } from "@/infrastructure/postgres/queries/appointment/get-appointment-portal.query";
import { AppointmentRepository } from "@/infrastructure/postgres/repositories/appointment.repository";
import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";
import z from "zod";
import { clinicWallTimeSchema } from "./clinic-wall-time.schema";

export const cancelAppointmentSchema = z.object({
  reason: z.enum(CANCELLATION_REASONS, {
    error: "Indica el motivo de la cancelación.",
  }),
  expectedScheduledAt: clinicWallTimeSchema.optional(),
});

export class CancelAppointmentUseCase {
  constructor(
    private readonly emailService: IEmailService,
    private readonly appointments: IAppointmentRepository = new AppointmentRepository(),
    private readonly portal: IGetAppointmentPortalQuery = new GetAppointmentPortalQuery(),
    private readonly appointmentNotice: IGetAppointmentNoticeQuery = new GetAppointmentNoticeQuery(),
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

  private logEmailFailure(appointmentId: string, error: unknown) {
    // La cita ya quedó cancelada: un error aquí haría creer al paciente que no se canceló.
    const errName = error instanceof Error ? error.name : "UnknownError";
    const errCode =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    console.error(
      { appointmentId, errName, errCode },
      "[cancel-appointment-email]",
    );
  }

  private async sendPatientNotice(
    notice: AppointmentNotice,
    manageUrl: string,
  ) {
    const html = await renderTemplate("patient-cancelled-appointment", {
      patientName: notice.patientName,
      manageUrl,
    });
    await this.emailService.send({
      subject: "Tu cita ha sido cancelada",
      to: notice.patientEmail,
      html,
    });
  }

  private async sendDoctorNotice(
    notice: AppointmentNotice,
    reason: CancellationReason,
    agendaUrl: string,
  ) {
    const html = await renderTemplate("doctor-cancelled-appointment", {
      doctorName: notice.doctor.firstName,
      scheduledAt: formatClinicDateTime(notice.scheduledAt),
      specialty: notice.specialty,
      reason: CANCELLATION_REASON_LABELS[reason],
      agendaUrl,
    });
    await this.emailService.send({
      subject: `Tu paciente ha cancelado su cita en ${notice.clinicName}`,
      to: notice.doctor.email,
      html,
    });
  }

  private async sendCancellationEmails(
    appointmentId: string,
    token: string,
    reason: CancellationReason,
  ) {
    const notice = await this.appointmentNotice
      .execute(appointmentId)
      .catch((error: unknown) => {
        this.logEmailFailure(appointmentId, error);
        return null;
      });
    if (!notice) return;

    const frontendUrl = process.env.FRONTEND_URL;
    // Cada correo por separado: si falla el del paciente, el médico igual se entera.
    const deliveries = await Promise.allSettled([
      this.sendPatientNotice(
        notice,
        `${frontendUrl}/appointment/manage/${token}`,
      ),
      this.sendDoctorNotice(
        notice,
        reason,
        `${frontendUrl}/account/${notice.accountId}/clinic/${notice.clinicId}/dashboard`,
      ),
    ]);
    for (const delivery of deliveries)
      if (delivery.status === "rejected")
        this.logEmailFailure(appointmentId, delivery.reason);
  }

  async execute(token: string, body: unknown): Promise<AppointmentPortal> {
    const appointment = await this.findOpenAppointment(token);
    const { reason, expectedScheduledAt } = this.parseBody(body);

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
      reason,
      expectedScheduledAt: expectedInstant,
    });
    if (!wasCancelled) await this.assertCancelledByAnotherRequest(token);
    else await this.sendCancellationEmails(appointment.id, token, reason);

    return this.readPortal(token);
  }
}
