import type { PatientScope } from "@/domain/entities/patient/scope";
import type {
  IPatientRepository,
  OrganizationAppointmentsCriteria,
  PatientAppointment,
  PatientHistoryEntry,
  PatientLookupCriteria,
  PatientPageCriteria,
  PatientRecord,
  PatientSummary,
} from "@/domain/repositories/patient.repository";
import { Prisma } from "@prisma/client";
import { getClient } from "../transaction-context";

// translate() y no unaccent(): esa extensión no está instalada en la base.
const ACCENTED_LETTERS = "ÁÉÍÓÚÜÑáéíóúüñ";
const UNACCENTED_LETTERS = "AEIOUUNaeiouun";
const ACCENTED_LETTER = new RegExp(`[${ACCENTED_LETTERS}]`, "g");
const NUMBER_SEPARATORS = /[\s.\-()+]/g;
const ONLY_DIGITS = /^\d+$/;
const LIKE_SPECIAL_CHARACTERS = /[\\%_]/g;

const SEARCHABLE_TEXT_COLUMNS = [
  Prisma.sql`p.name`,
  Prisma.sql`p.last_name`,
  Prisma.sql`p.document_number`,
];
const PHONE_DIGITS = Prisma.sql`regexp_replace(p.phone, '[^0-9]', '', 'g')`;

function foldAccents(text: string) {
  return text
    .normalize("NFC")
    .replace(
      ACCENTED_LETTER,
      (letter) => UNACCENTED_LETTERS[ACCENTED_LETTERS.indexOf(letter)],
    )
    .toLowerCase();
}

const escapeLikePattern = (text: string) =>
  text.replace(LIKE_SPECIAL_CHARACTERS, "\\$&");

const foldedColumn = (column: Prisma.Sql) =>
  Prisma.sql`lower(translate(normalize(${column}, NFC), ${ACCENTED_LETTERS}, ${UNACCENTED_LETTERS}))`;

function matchesWord(word: string) {
  const pattern = `%${escapeLikePattern(word)}%`;
  const comparisons = SEARCHABLE_TEXT_COLUMNS.map(
    (column) => Prisma.sql`${foldedColumn(column)} LIKE ${pattern}`,
  );

  const wordAsNumber = word.replace(NUMBER_SEPARATORS, "");
  if (ONLY_DIGITS.test(wordAsNumber)) {
    comparisons.push(Prisma.sql`${PHONE_DIGITS} LIKE ${`%${wordAsNumber}%`}`);
  }

  return Prisma.sql`(${Prisma.join(comparisons, " OR ")})`;
}

function matchesNumber(digits: string) {
  const pattern = `%${digits}%`;

  return Prisma.sql`(${PHONE_DIGITS} LIKE ${pattern} OR p.document_number LIKE ${pattern})`;
}

function matchesSearch(search: string) {
  const folded = foldAccents(search);
  const asNumber = folded.replace(NUMBER_SEPARATORS, "");

  if (ONLY_DIGITS.test(asNumber)) return [matchesNumber(asNumber)];

  return [...new Set(folded.split(/\s+/))].map(matchesWord);
}

const belongsToAccount = (accountId: string) =>
  Prisma.sql`p.account_id = ${accountId}::uuid`;

function hasAppointmentInScope({ resourceType, resourceId }: PatientScope) {
  if (resourceType === "CLINIC") {
    return Prisma.sql`EXISTS (
      SELECT 1 FROM appointment a
      WHERE a.patient_id = p.id AND a.clinic_id = ${resourceId}::uuid
    )`;
  }

  return Prisma.sql`EXISTS (
    SELECT 1 FROM appointment a
    INNER JOIN resource r ON r.id = a.clinic_id
    WHERE a.patient_id = p.id AND r.parent_resource_id = ${resourceId}::uuid
  )`;
}

const inOrganization = ({
  accountId,
  organizationId,
}: OrganizationAppointmentsCriteria): Prisma.AppointmentWhereInput => ({
  clinic: { resource: { accountId, parentResourceId: organizationId } },
});

export class PatientRepository implements IPatientRepository {
  async findPageInScope(criteria: PatientPageCriteria) {
    const conditions = [
      belongsToAccount(criteria.accountId),
      hasAppointmentInScope(criteria.scope),
      ...(criteria.from ? [Prisma.sql`p.id < ${criteria.from}::uuid`] : []),
      ...(criteria.search ? matchesSearch(criteria.search) : []),
    ];

    // El uuid(7) lleva el instante de creación en los bits altos: `id < from` es "más antiguo que".
    return getClient().$queryRaw<PatientSummary[]>`
      SELECT p.id, p.name, p.last_name AS "lastName", p.phone, p.email,
        p.document_type AS "documentType",
        p.document_number AS "documentNumber",
        p.birth_date AS "birthDate"
      FROM patient p
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY p.id DESC
      LIMIT ${criteria.take}
    `;
  }

  async findInScope(
    criteria: PatientLookupCriteria,
  ): Promise<PatientRecord | null> {
    const conditions = [
      belongsToAccount(criteria.accountId),
      Prisma.sql`p.id = ${criteria.patientId}::uuid`,
      hasAppointmentInScope(criteria.scope),
    ];

    const [match] = await getClient().$queryRaw<{ id: string }[]>`
      SELECT p.id FROM patient p
      WHERE ${Prisma.join(conditions, " AND ")}
    `;

    if (!match) return null;

    return getClient().patient.findFirst({
      where: { id: match.id, accountId: criteria.accountId },
    });
  }

  async findAppointmentsForMetrics({
    patientIds,
    ...organization
  }: OrganizationAppointmentsCriteria & {
    patientIds: string[];
  }): Promise<PatientAppointment[]> {
    return getClient().appointment.findMany({
      where: { patientId: { in: patientIds }, ...inOrganization(organization) },
      select: { patientId: true, scheduledAt: true, status: true },
    });
  }

  async findAppointmentHistory({
    patientId,
    ...organization
  }: OrganizationAppointmentsCriteria & {
    patientId: string;
  }): Promise<PatientHistoryEntry[]> {
    const appointments = await getClient().appointment.findMany({
      where: { patientId, ...inOrganization(organization) },
      orderBy: { scheduledAt: "desc" },
      select: {
        id: true,
        scheduledAt: true,
        status: true,
        specialty: true,
        durationMinutes: true,
        clinic: { select: { name: true } },
        doctorProfile: {
          select: {
            membership: {
              select: {
                user: {
                  select: { name: true, lastName: true, treatment: true },
                },
              },
            },
          },
        },
      },
    });

    return appointments.map(({ clinic, doctorProfile, ...appointment }) => ({
      ...appointment,
      clinicName: clinic.name,
      doctor: doctorProfile.membership.user,
    }));
  }
}
