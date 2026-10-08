import type { IGetDoctorSlotsQuery } from "@/application/queries/doctor-profile/get-doctor-slots.query";
import { Conflict } from "@/application/errors/conflict.error";
import { NotFound } from "@/application/errors/not-found.error";
import type { IEmailService } from "@/application/ports/email-service.port";
import {
  MAX_DAYS_AHEAD,
  SLOT_DURATION_MINUTES,
} from "@/domain/entities/availability/entity";
import {
  addDays,
  CLINIC_TIME_ZONE,
  toInstant,
  today,
} from "@/domain/services/clinic-time";
import { GetDoctorSlotsQuery } from "@/infrastructure/postgres/queries/doctor-profile/get-doctor-slots.query";
import {
  getClient,
  inTransaction,
} from "@/infrastructure/postgres/transaction-context";
import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";
import z from "zod";

const BOOKING_OPTION_UNAVAILABLE =
  "Ese médico o especialidad ya no está disponible en esta sede. Recarga la página y vuelve a elegirlos.";
export const SLOT_UNAVAILABLE =
  "Ese horario ya no está disponible. Vuelve atrás y elige otro.";
const DOCUMENT_TYPES = ["DNI", "CE", "PASSPORT"] as const;
const MAX_NAME_LENGTH = 80;
const MAX_DOCUMENT_NUMBER_LENGTH = 20;
const MAX_EMAIL_LENGTH = 254;
const DURATION_ERROR = `durationMinutes debe ser un entero entre 1 y ${SLOT_DURATION_MINUTES}`;

const personName = (messages: { empty: string; tooLong: string }) =>
  z
    .string()
    .overwrite((text) => text.trim().replace(/\s+/g, " "))
    .min(1, { error: messages.empty })
    .max(MAX_NAME_LENGTH, { error: messages.tooLong });

export const createAppointmentSchema = z.object({
  patientName: personName({
    empty: "Escribe tu nombre",
    tooLong: "Tu nombre es demasiado largo",
  }),
  patientLastName: personName({
    empty: "Escribe tu apellido",
    tooLong: "Tu apellido es demasiado largo",
  }),
  patientPhone: z
    .string()
    .overwrite((text) => text.replace(/[\s\-()]/g, ""))
    .regex(/^\+\d{7,15}$/, { error: "Revisa tu número de teléfono" }),
  patientEmail: z
    .email({ error: "Correo inválido" })
    .max(MAX_EMAIL_LENGTH, { error: "Correo inválido" }),
  patientDocumentNumber: z
    .string()
    .overwrite((text) => text.replace(/[\s.-]/g, "").toUpperCase())
    .min(1, { error: "El número de documento no es válido" })
    .max(MAX_DOCUMENT_NUMBER_LENGTH, {
      error: "El número de documento no es válido",
    }),
  patientDocumentType: z.enum(DOCUMENT_TYPES, {
    error: "El tipo de documento no es válido",
  }),
  // `z.iso.date()` y no una regex de forma: la columna es `text`, así que esta
  // validación es lo único que impide guardar un 2026-02-30.
  patientBirthDate: z.iso.date({
    error: "Revisa tu fecha de nacimiento",
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
  constructor(
    private readonly props: Props,
    private readonly doctorSlots: IGetDoctorSlotsQuery = new GetDoctorSlotsQuery(),
  ) {}

  private async assertSlotIsOffered(
    dto: CreateAppointmentDto,
    date: string,
    time: string,
  ) {
    if (date > addDays(today(), MAX_DAYS_AHEAD))
      throw new Conflict(SLOT_UNAVAILABLE);

    const { days } = await this.doctorSlots.execute({
      doctorProfileId: dto.doctorProfileId,
      from: date,
      to: date,
    });

    if (!days[date]?.includes(time)) throw new Conflict(SLOT_UNAVAILABLE);
  }

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

    await this.assertSlotIsOffered(dto, date, time);

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

    try {
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
    } catch (error) {
      // La cita ya existe: un 500 haría que el paciente reintente y choque con su propia reserva.
      const errName = error instanceof Error ? error.name : "UnknownError";
      const errCode =
        error && typeof error === "object" && "code" in error
          ? error.code
          : undefined;
      console.error(
        { appointmentId: appointment.id, errName, errCode },
        "[create-appointment-email]",
      );
    }
  }
}
