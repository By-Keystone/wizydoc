import { NotFound } from "@/application/errors/not-found.error";
import { UnprocessableEntity } from "@/application/errors/unprocessable-entity.errors";
import { IEmailService } from "@/application/ports/email-service.port";
import { CLINIC_TIME_ZONE, toInstant } from "@/domain/services/clinic-time";
import { getClient } from "@/infrastructure/postgres/transaction-context";
import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";
import z from "zod";

export const createAppointmentSchema = z.object({
  patientName: z.string(),
  patientLastName: z.string(),
  patientPhone: z.string(),
  patientEmail: z.string(),
  patientDocumentNumber: z.string(),
  patientDocumentType: z.string(),
  // `z.iso.date()` y no una regex de forma: la columna es `text`, así que esta
  // validación es lo único que impide guardar un 2026-02-30.
  patientBirthDate: z.iso.date({
    error: "patientBirthDate debe ser una fecha válida con formato YYYY-MM-DD",
  }),
  specialty: z.string(),
  durationMinutes: z
    .number()
    .gt(0, { error: "durationMinutes needs to be greater than 0" }),
  /**
   * Hora de reloj de la clínica, sin zona: `"2026-08-06T09:00"`. Es el hueco
   * que el paciente eligió, y el api lo convierte al instante que le
   * corresponde según el huso de la clínica.
   */
  scheduledAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
    error: "scheduledAt debe tener formato YYYY-MM-DDTHH:mm",
  }),
  doctorProfileId: z.string(),
  clinicId: z.string(),
});

export type CreateAppointmentDto = z.infer<typeof createAppointmentSchema>;

interface Props {
  readonly emailService: IEmailService;
}
export class CreateApointmentUseCase {
  constructor(private readonly props: Props) {}

  async execute(dto: CreateAppointmentDto) {
    const client = getClient();

    const clinic = await client.clinic.findFirst({
      where: { resourceId: dto.clinicId },
      include: { resource: { select: { accountId: true } } },
    });

    if (!clinic?.resource)
      throw new UnprocessableEntity("La clínica no pertenece a ningún recurso");

    const profile = await client.doctorProfile.findUnique({
      where: { id: dto.doctorProfileId },
      select: { user: { select: { name: true, lastName: true } } },
    });

    if (!clinic) throw new NotFound("Resource does not exist");
    if (!profile) throw new NotFound("User is not a doctor");

    const [date, time] = dto.scheduledAt.split("T");

    // El documento identifica al paciente dentro de la cuenta, así que una
    // segunda reserva reutiliza su ficha en vez de duplicarla. Solo se refrescan
    // teléfono y correo: el resto lo mantiene el personal sanitario y no puede
    // pisarlo lo que alguien escriba en un formulario público.
    const patient = await client.patient.upsert({
      where: {
        accountId_documentType_documentNumber: {
          accountId: clinic.resource.accountId,
          documentType: dto.patientDocumentType,
          documentNumber: dto.patientDocumentNumber,
        },
      },
      update: {
        phone: dto.patientPhone,
        email: dto.patientEmail,
      },
      create: {
        documentNumber: dto.patientDocumentNumber,
        documentType: dto.patientDocumentType,
        email: dto.patientEmail,
        lastName: dto.patientLastName,
        name: dto.patientName,
        phone: dto.patientPhone,
        birthDate: dto.patientBirthDate,
        accountId: clinic.resource.accountId,
      },
    });

    const appointment = await client.appointment.create({
      data: {
        specialty: dto.specialty,
        durationMinutes: dto.durationMinutes,
        doctorProfileId: dto.doctorProfileId,
        scheduledAt: toInstant(date, time),
        patientId: patient.id,
        clinicId: clinic.resourceId,
      },
    });

    const scheduledAt = new Intl.DateTimeFormat("es", {
      dateStyle: "full",
      timeStyle: "short",
      // Sin esto el correo mostraría la hora del servidor, que en producción es
      // UTC y no coincide con la que el paciente eligió.
      timeZone: CLINIC_TIME_ZONE,
    }).format(appointment.scheduledAt);

    const html = await renderTemplate("confirm-appointment", {
      patientName: patient.name,
      patientLastName: patient.lastName,
      scheduledAt,
      durationMinutes: appointment.durationMinutes,
      specialty: appointment.specialty,
      doctorName: `${profile.user.name} ${profile.user.lastName}`,
      clinicName: clinic.name,
      clinicAddress: clinic.address,
    });

    await this.props.emailService.send({
      subject: `Tu cita en ${clinic.name} está reservada`,
      to: dto.patientEmail,
      html,
    });
  }
}
