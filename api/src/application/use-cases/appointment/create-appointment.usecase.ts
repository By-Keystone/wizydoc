import type { IGetAccountEntitlements } from "@/application/queries/subscription/get-account-entitlements.query";
import type { IGetAccountOwner } from "@/application/queries/account/get-account-owner.query";
import type { IGetDoctorSlotsQuery } from "@/application/queries/doctor-profile/get-doctor-slots.query";
import { BookingClosed } from "@/application/errors/booking-closed.error";
import { Conflict } from "@/application/errors/conflict.error";
import { NotFound } from "@/application/errors/not-found.error";
import type { IEmailService } from "@/application/ports/email-service.port";
import {
  MAX_DAYS_AHEAD,
  SLOT_DURATION_MINUTES,
} from "@/domain/entities/availability/entity";
import {
  type Entitlements,
  includesFeature,
  isWithinLimit,
  monthlyCapWarningThreshold,
} from "@/domain/entities/subscription/entitlements";
import { PLAN_CAPABILITIES } from "@/domain/entities/subscription/plan";
import type { IAppointmentRepository } from "@/domain/repositories/appointment.repository";
import type { IMonthlyBookingsRepository } from "@/domain/repositories/monthly-bookings.repository";
import { formatDoctorName } from "@/domain/services/doctor-name";
import {
  addDays,
  currentMonth,
  firstDayOfNextMonth,
  formatClinicDateTime,
  formatDayAndMonth,
  formatMonthName,
  parseWallTime,
  today,
  wallTimeToInstant,
} from "@/domain/services/clinic-time";
import { AppointmentRepository } from "@/infrastructure/postgres/repositories/appointment.repository";
import { MonthlyBookingsRepository } from "@/infrastructure/postgres/repositories/monthly-bookings.repository";
import { GetAccountOwner } from "@/infrastructure/postgres/queries/account/get-account-owner.query";
import { GetAccountEntitlements } from "@/infrastructure/postgres/queries/subscription/get-account-entitlements.query";
import { GetDoctorSlotsQuery } from "@/infrastructure/postgres/queries/doctor-profile/get-doctor-slots.query";
import { liveDoctorProfileWhere } from "@/infrastructure/postgres/queries/doctor-profile/live-doctor-profile";
import {
  getClient,
  inTransaction,
} from "@/infrastructure/postgres/transaction-context";
import { renderTemplate } from "@/infrastructure/services/email-service/template-renderer";
import type { Plan } from "@prisma/client";
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
const WIZYDOC_WHATSAPP_NUMBER = "51993953674";

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

interface BookableClinic {
  resourceId: string;
  name: string;
  address: string;
  patientContact: string | null;
  resource: { accountId: string };
}

interface BookingTarget {
  clinic: BookableClinic;
  entitlements: Entitlements;
  month: string;
}

interface MonthlyCapNoticeInput extends BookingTarget {
  bookedThisMonth: number;
}

type MonthlyCapNotice = "warning" | "reached";

type Booking = Awaited<ReturnType<CreateApointmentUseCase["book"]>>;

export class CreateApointmentUseCase {
  constructor(
    private readonly props: Props,
    private readonly doctorSlots: IGetDoctorSlotsQuery = new GetDoctorSlotsQuery(),
    private readonly entitlementsQuery: IGetAccountEntitlements = new GetAccountEntitlements(),
    private readonly appointments: IAppointmentRepository = new AppointmentRepository(),
    private readonly monthlyBookings: IMonthlyBookingsRepository = new MonthlyBookingsRepository(),
    private readonly accountOwner: IGetAccountOwner = new GetAccountOwner(),
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

  private async countBookedOrCloseBooking({
    clinic,
    entitlements,
    month,
  }: BookingTarget) {
    const booked = await this.monthlyBookings.countBooked(
      clinic.resource.accountId,
      month,
    );
    if (!isWithinLimit(entitlements.monthlyAppointmentCap, booked))
      throw new BookingClosed();
    return booked;
  }

  // Se bloquea account y no subscription: una cuenta sin suscripción (Gratis) no tiene esa fila.
  private async lockAccount(accountId: string) {
    await getClient().$queryRaw`
      SELECT 1 FROM account WHERE id = ${accountId}::uuid FOR NO KEY UPDATE
    `;
  }

  private async findBookableDoctor(
    dto: CreateAppointmentDto,
    organizationId: string,
  ) {
    return getClient().doctorProfile.findFirst({
      where: {
        id: dto.doctorProfileId,
        specialties: { some: { name: dto.specialty, organizationId } },
        ...liveDoctorProfileWhere({ clinicId: dto.clinicId }),
      },
      select: {
        membership: {
          select: {
            user: { select: { name: true, lastName: true, treatment: true } },
          },
        },
      },
    });
  }

  private async book(dto: CreateAppointmentDto, target: BookingTarget) {
    const { clinic, entitlements } = target;
    const { accountId } = clinic.resource;

    await this.countBookedOrCloseBooking(target);

    const { date, time } = parseWallTime(dto.scheduledAt);
    await this.assertSlotIsOffered(dto, date, time);

    const includesPatientAppointmentManagement = includesFeature(
      entitlements,
      "PATIENT_APPOINTMENT_MANAGEMENT",
    );

    return inTransaction(async () => {
      await this.lockAccount(accountId);
      const bookedBefore = await this.countBookedOrCloseBooking(target);

      // El booking es anónimo: reutiliza la ficha del documento pero nunca la modifica.
      const bookedPatient = await getClient().patient.upsert({
        where: {
          accountId_documentType_documentNumber: {
            accountId,
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
          accountId,
        },
      });

      const bookedAppointment = await getClient().appointment.create({
        data: {
          specialty: dto.specialty,
          durationMinutes: dto.durationMinutes,
          doctorProfileId: dto.doctorProfileId,
          scheduledAt: wallTimeToInstant(dto.scheduledAt),
          patientId: bookedPatient.id,
          clinicId: clinic.resourceId,
        },
      });

      return {
        patient: bookedPatient,
        appointment: bookedAppointment,
        bookedThisMonth: bookedBefore + 1,
        accessToken: includesPatientAppointmentManagement
          ? await this.appointments.issueAccessToken(bookedAppointment.id)
          : null,
      };
    });
  }

  // Se registra fuera de la transacción de la reserva: al revertirse se llevaría el registro.
  private async bookOrRecordMissed(
    dto: CreateAppointmentDto,
    target: BookingTarget,
  ) {
    try {
      return await this.book(dto, target);
    } catch (error) {
      if (error instanceof BookingClosed)
        await this.monthlyBookings.recordMissed({
          accountId: target.clinic.resource.accountId,
          clinicId: target.clinic.resourceId,
        });
      throw error;
    }
  }

  private logEmailFailure(
    label: string,
    ids: Record<string, string>,
    error: unknown,
  ) {
    const errName = error instanceof Error ? error.name : "UnknownError";
    const errCode =
      error && typeof error === "object" && "code" in error
        ? error.code
        : undefined;
    console.error({ ...ids, errName, errCode }, label);
  }

  private async sendConfirmationEmail(
    clinic: BookableClinic,
    { patient, appointment, accessToken }: Booking,
    doctorName: string,
  ) {
    // Sin la zona de la clínica el correo mostraría la hora del servidor (UTC en producción).
    const scheduledAt = formatClinicDateTime(appointment.scheduledAt);

    try {
      const html = await renderTemplate("confirm-appointment", {
        patientName: patient.name,
        patientLastName: patient.lastName,
        scheduledAt,
        durationMinutes: appointment.durationMinutes,
        specialty: appointment.specialty,
        doctorName,
        clinicName: clinic.name,
        clinicAddress: clinic.address,
        manageUrl: accessToken
          ? `${process.env.FRONTEND_URL}/appointment/manage/${accessToken}`
          : null,
      });

      await this.props.emailService.send({
        subject: `Tu cita en ${clinic.name} está reservada`,
        to: patient.email,
        html,
      });
    } catch (error) {
      // La cita ya existe: un 500 haría que el paciente reintente y choque con su propia reserva.
      this.logEmailFailure(
        "[create-appointment-email]",
        { appointmentId: appointment.id },
        error,
      );
    }
  }

  private monthlyCapNoticeFor(
    cap: number,
    bookedThisMonth: number,
  ): MonthlyCapNotice | null {
    if (bookedThisMonth === cap) return "reached";
    if (bookedThisMonth === monthlyCapWarningThreshold(cap)) return "warning";
    return null;
  }

  private requestPlanUrl(
    owner: { name: string; lastName: string; email: string },
    clinicName: string,
    planName: string,
  ) {
    const message = `Hola, soy ${owner.name} ${owner.lastName} (${owner.email}), de ${clinicName}. Quiero activar el plan ${planName} en WizyDoc.`;
    return `https://wa.me/${WIZYDOC_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  private async sendMonthlyCapNotice(
    notice: MonthlyCapNotice,
    { clinic, entitlements, month, bookedThisMonth }: MonthlyCapNoticeInput,
    cap: number,
    nextPlanKey: Plan,
  ) {
    const { accountId } = clinic.resource;
    const nextPlan = PLAN_CAPABILITIES[nextPlanKey];
    const owner = await this.accountOwner.execute(accountId);
    if (!owner) return;

    const variables = {
      ownerName: owner.name,
      monthlyCap: cap,
      planName: PLAN_CAPABILITIES[entitlements.plan].displayName,
      monthName: formatMonthName(month),
      renewsOn: formatDayAndMonth(firstDayOfNextMonth(month)),
      nextPlanName: nextPlan.displayName,
      nextPlanMonthlyCap: nextPlan.monthlyAppointmentCap,
      requestPlanUrl: this.requestPlanUrl(
        owner,
        clinic.name,
        nextPlan.displayName,
      ),
      hasPatientContact: clinic.patientContact !== null,
      panelUrl: `${process.env.FRONTEND_URL}/account/${accountId}/clinic/${clinic.resourceId}/dashboard`,
    };

    const email =
      notice === "reached"
        ? {
            subject: "Tu link de reservas ya no recibe citas este mes",
            html: await renderTemplate("monthly-cap-reached", variables),
          }
        : {
            subject: `Llevas ${bookedThisMonth} de las ${cap} citas de tu plan este mes`,
            html: await renderTemplate("monthly-cap-warning", {
              ...variables,
              bookedCount: bookedThisMonth,
            }),
          };

    await this.props.emailService.send({ ...email, to: owner.email });
  }

  private async notifyOwnerOfMonthlyCap(input: MonthlyCapNoticeInput) {
    const { clinic, entitlements, bookedThisMonth } = input;
    const cap = entitlements.monthlyAppointmentCap;
    const nextPlanKey = PLAN_CAPABILITIES[entitlements.plan].nextPlan;
    if (cap === null || nextPlanKey === null) return;

    const notice = this.monthlyCapNoticeFor(cap, bookedThisMonth);
    if (!notice) return;

    try {
      await this.sendMonthlyCapNotice(notice, input, cap, nextPlanKey);
    } catch (error) {
      // La cita ya existe: un aviso que falla no revierte la reserva ni se reintenta.
      this.logEmailFailure(
        "[monthly-cap-email]",
        { accountId: clinic.resource.accountId, clinicId: clinic.resourceId },
        error,
      );
    }
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

    const target: BookingTarget = {
      clinic,
      entitlements: await this.entitlementsQuery.execute(
        clinic.resource.accountId,
      ),
      month: currentMonth(),
    };

    const booked = await this.bookOrRecordMissed(dto, target);

    await this.sendConfirmationEmail(
      clinic,
      booked,
      formatDoctorName(profile.membership.user),
    );
    await this.notifyOwnerOfMonthlyCap({
      ...target,
      bookedThisMonth: booked.bookedThisMonth,
    });
  }
}
