import type {
  IAppointmentNotifier,
  RescheduleNotice,
} from "@/application/ports/appointment-notifier.port";
import type { IEmailService } from "@/application/ports/email-service.port";
import type { ManagedAppointmentRecord } from "@/domain/entities/appointment/self-service";
import { formatClinicDateTime } from "@/domain/services/clinic-time";
import { doctorNoticeLimiter } from "./doctor-notice-limiter";
import { bookAgainUrl, manageAppointmentUrl } from "./appointment-links";
import { renderTemplate } from "./template-renderer";

export class AppointmentChangeNotifier implements IAppointmentNotifier {
  constructor(private readonly emailService: IEmailService) {}

  async notifyCancelled(appointment: ManagedAppointmentRecord) {
    const scheduledAt = formatClinicDateTime(appointment.scheduledAt);

    await this.send(appointment.id, async () => {
      await this.emailService.send({
        subject: `Tu cita en ${appointment.clinic.name} fue cancelada`,
        to: appointment.patient.email,
        html: await renderTemplate("appointment-cancelled", {
          patientName: appointment.patient.name,
          scheduledAt,
          specialty: appointment.specialty,
          doctorName: this.doctorName(appointment),
          clinicName: appointment.clinic.name,
          clinicAddress: appointment.clinic.address,
          bookAgainUrl: bookAgainUrl(appointment.clinicId),
        }),
      });
    });

    await this.notifyDoctor(appointment, { scheduledAt });
  }

  async notifyRescheduled({
    appointment,
    previousScheduledAt,
    token,
  }: RescheduleNotice) {
    const scheduledAt = formatClinicDateTime(appointment.scheduledAt);
    const previous = formatClinicDateTime(previousScheduledAt);

    await this.send(appointment.id, async () => {
      await this.emailService.send({
        subject: `Tu cita en ${appointment.clinic.name} cambió de horario`,
        to: appointment.patient.email,
        html: await renderTemplate("appointment-rescheduled", {
          patientName: appointment.patient.name,
          previousScheduledAt: previous,
          scheduledAt,
          specialty: appointment.specialty,
          doctorName: this.doctorName(appointment),
          clinicName: appointment.clinic.name,
          clinicAddress: appointment.clinic.address,
          manageUrl: manageAppointmentUrl(token),
        }),
      });
    });

    await this.notifyDoctor(appointment, {
      scheduledAt: previous,
      newScheduledAt: scheduledAt,
    });
  }

  // Sin nombre ni texto del paciente: lo escribe un anónimo y el correo sale del dominio de WizyDoc.
  private async notifyDoctor(
    appointment: ManagedAppointmentRecord,
    when: { scheduledAt: string; newScheduledAt?: string },
  ) {
    // El exceso se descarta: la agenda del médico ya muestra el cambio.
    if (!doctorNoticeLimiter.tryAcquire(appointment.doctorProfileId)) return;

    await this.send(appointment.id, async () => {
      await this.emailService.send({
        subject: when.newScheduledAt
          ? "Un paciente reprogramó una cita de tu agenda"
          : "Un paciente canceló una cita de tu agenda",
        to: appointment.doctor.email,
        html: await renderTemplate("doctor-appointment-changed", {
          doctorName: this.doctorName(appointment),
          ...when,
          specialty: appointment.specialty,
          clinicName: appointment.clinic.name,
        }),
      });
    });
  }

  private doctorName(appointment: ManagedAppointmentRecord) {
    return `${appointment.doctor.name} ${appointment.doctor.lastName}`;
  }

  // El cambio ya quedó hecho: un fallo de correo no puede devolver un error al paciente.
  private async send(appointmentId: string, deliver: () => Promise<void>) {
    try {
      await deliver();
    } catch (error) {
      const errName = error instanceof Error ? error.name : "UnknownError";
      const errCode =
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined;
      console.error(
        { appointmentId, errName, errCode },
        "[appointment-change-email]",
      );
    }
  }
}
