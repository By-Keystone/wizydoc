import { NotFound } from "@/application/errors/not-found.error";
import type { IEmailService } from "@/application/ports/email-service.port";
import { SLOT_DURATION_MINUTES } from "@/domain/entities/availability/entity";
import { CLINIC_TIME_ZONE, toInstant } from "@/domain/services/clinic-time";
import {
  getClient,
  inTransaction,
} from "@/infrastructure/postgres/transaction-context";
import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";
import z from "zod";

const BOOKING_OPTION_UNAVAILABLE =
  "Ese médico o especialidad ya no está disponible en esta sede. Recarga la página y vuelve a elegirlos.";
const DURATION_ERROR = `durationMinutes debe ser un entero entre 1 y ${SLOT_DURATION_MINUTES}`;

export const createAppointmentSchema = z.object({
  patientName: z.string(),
  patientLastName: z.string(),
  patientPhone: z.string(),
  patientEmail: z.email({ error: "Correo inválido" }),
  patientDocumentNumber: z.string(),
  patientDocumentType: z.string(),
  // `z.iso.date()` y no una regex de forma: la columna es `text`, así que esta
  // validación es lo único que impide guardar un 2026-02-30.
  patientBirthDate: z.iso.date({
    error: "patientBirthDate debe ser una fecha válida con formato YYYY-MM-DD",
  }),
  specialty: z.string(),
  durationMinutes: z
    .int({ error: DURATION_ERROR })
    .min(1, { error: DURATION_ERROR })
    .max(SLOT_DURATION_MINUTES, { error: DURATION_ERROR }),
  /**
   * Hora de reloj de la clínica, sin zona: `"2026-08-06T09:00"`. Es el hueco
   * que el paciente eligió, y el api lo convierte al instante que le
   * corresponde según el huso de la clínica.
   */
  scheduledAt: z.iso
    .datetime({
      local: true,
      precision: -1,
      error: "scheduledAt debe ser una fecha y hora que existan",
    })
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, {
      error: "scheduledAt debe tener formato YYYY-MM-DDTHH:mm",
    }),
  doctorProfileId: z.uuid(),
  clinicId: z.uuid(),
});

export type CreateAppointmentDto = z.infer<typeof createAppointmentSchema>;

interface Props {
  readonly emailService: IEmailService;
}
export class CreateApointmentUseCase {
  constructor(private readonly props: Props) {}

  private async findBookableDoctor(
    dto: CreateAppointmentDto,
    organizationId: string,
  ) {
    return getClient().doctorProfile.findFirst({
      where: {
        id: dto.doctorProfileId,
        clinicId: dto.clinicId,
        specialties: { some: { name: dto.specialty, organizationId } },
        user: {
          resourceMemberships: {
            // DoctorProfile no tiene deletedAt: quitar al médico de la sede se registra en su membership.
            some: { resourceId: dto.clinicId, deletedAt: null },
          },
        },
      },
      select: { user: { select: { name: true, lastName: true } } },
    });
  }

  async execute(dto: CreateAppointmentDto) {
    const client = getClient();

    const clinic = await client.clinic.findUnique({
      where: { resourceId: dto.clinicId },
      include: {
        resource: { select: { accountId: true, parentResourceId: true } },
      },
    });

    if (!clinic?.resource.parentResourceId)
      throw new NotFound(BOOKING_OPTION_UNAVAILABLE);

    const profile = await this.findBookableDoctor(
      dto,
      clinic.resource.parentResourceId,
    );

    if (!profile) throw new NotFound(BOOKING_OPTION_UNAVAILABLE);

    const [date, time] = dto.scheduledAt.split("T");

    const { patient, appointment } = await inTransaction(async () => {
      // El booking es anónimo: reutiliza la ficha del documento pero nunca la modifica.
      const bookedPatient = await getClient().patient.upsert({
        where: {
          accountId_documentType_documentNumber: {
            accountId: clinic.resource.accountId,
            documentType: dto.patientDocumentType,
            documentNumber: dto.patientDocumentNumber,
          },
        },
        update: {},
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

      return {
        patient: bookedPatient,
        appointment: await getClient().appointment.create({
          data: {
            specialty: dto.specialty,
            durationMinutes: dto.durationMinutes,
            doctorProfileId: dto.doctorProfileId,
            scheduledAt: toInstant(date, time),
            patientId: bookedPatient.id,
            clinicId: clinic.resourceId,
          },
        }),
      };
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
      to: patient.email,
      html,
    });
  }
}
