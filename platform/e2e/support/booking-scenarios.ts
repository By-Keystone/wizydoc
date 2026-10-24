import {
  createClinicResource,
  createOnboardedAdmin,
  createOrganizationResource,
  createSpecialty,
  type OnboardedAdmin,
} from "./accounts";
import { addPortalDoctor, type PortalDoctor } from "./appointment-portal";
import { getTestPrisma, type TestPrismaAppointmentRow } from "./db";
import { setDoctorTreatment, type Treatment } from "./doctor-treatment";
import { uniqueName } from "./users";

const DEFAULT_CLINIC_ADDRESS = "Av. Larco 345, Miraflores";
const DEFAULT_CLINIC_PHONE = "+51987654321";

export interface ScenarioSpecialty {
  id: string;
  name: string;
}

export interface ScenarioDoctor extends PortalDoctor {
  fullName: string;
  displayName: string;
}

export interface ScenarioClinic {
  admin: OnboardedAdmin;
  organizationId: string;
  clinicId: string;
  clinicName: string;
  clinicAddress: string;
  clinicPhone: string;
}

export interface ClinicOptions {
  clinicName?: string;
  clinicAddress?: string;
}

export async function createScenarioClinic(
  label: string,
  options: ClinicOptions = {},
): Promise<ScenarioClinic> {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${label}` });
  const organizationId = await createOrganizationResource(
    admin,
    uniqueName(`ORG-${label}`),
  );
  const clinicName = options.clinicName ?? uniqueName(`Sede ${label}`);
  const clinicAddress = options.clinicAddress ?? DEFAULT_CLINIC_ADDRESS;
  const clinicId = await createClinicResource(admin, organizationId, {
    name: clinicName,
    address: clinicAddress,
    phone: DEFAULT_CLINIC_PHONE,
  });

  return {
    admin,
    organizationId,
    clinicId,
    clinicName,
    clinicAddress,
    clinicPhone: DEFAULT_CLINIC_PHONE,
  };
}

export async function createScenarioSpecialty(
  clinic: ScenarioClinic,
  label: string,
): Promise<ScenarioSpecialty> {
  const name = uniqueName(label);
  const id = await createSpecialty(clinic.admin, clinic.organizationId, name);
  return { id, name };
}

interface DoctorOptions {
  name: string;
  lastName: string;
  specialties: ScenarioSpecialty[];
  treatment?: Treatment;
  hasSchedule?: boolean;
  weekdays?: number[];
}

export async function addScenarioDoctor(
  clinic: ScenarioClinic,
  label: string,
  options: DoctorOptions,
): Promise<ScenarioDoctor> {
  const [firstSpecialty, ...otherSpecialties] = options.specialties;
  const doctor = await addPortalDoctor({
    label,
    clinicId: clinic.clinicId,
    admin: clinic.admin,
    specialtyId: firstSpecialty.id,
    availability: options.hasSchedule === false ? "none" : "full-day",
    weekdays: options.weekdays,
    name: options.name,
    lastName: options.lastName,
  });

  if (otherSpecialties.length > 0) {
    const prisma = await getTestPrisma();
    await prisma.doctorProfile.update({
      where: { id: doctor.doctorProfileId },
      data: {
        specialties: {
          connect: otherSpecialties.map(({ id }) => ({ id })),
        },
      },
    });
  }

  const treatment = options.treatment ?? null;
  if (treatment) await setDoctorTreatment(doctor.userId, treatment);

  const fullName = `${options.name} ${options.lastName}`;
  const title =
    treatment === "DRA" ? "Dra. " : treatment === "DR" ? "Dr. " : "";
  return { ...doctor, fullName, displayName: `${title}${fullName}` };
}

export interface SoloScenario extends ScenarioClinic {
  specialty: ScenarioSpecialty;
  doctor: ScenarioDoctor;
}

export interface SoloScenarioOptions extends ClinicOptions {
  treatment?: Treatment;
  doctorName?: string;
  doctorLastName?: string;
  weekdays?: number[];
}

export async function createSoloScenario(
  label: string,
  options: SoloScenarioOptions = {},
): Promise<SoloScenario> {
  const clinic = await createScenarioClinic(label, options);
  const specialty = await createScenarioSpecialty(clinic, "Oftalmología");
  const doctor = await addScenarioDoctor(clinic, label, {
    name: options.doctorName ?? "Lucía",
    lastName: options.doctorLastName ?? "Paredes Quispe",
    specialties: [specialty],
    treatment: options.treatment,
    weekdays: options.weekdays,
  });
  return { ...clinic, specialty, doctor };
}

export interface TeamScenario extends ScenarioClinic {
  specialty: ScenarioSpecialty;
  doctors: [ScenarioDoctor, ScenarioDoctor, ScenarioDoctor];
}

export async function createTeamScenario(
  label: string,
  options: ClinicOptions = {},
): Promise<TeamScenario> {
  const clinic = await createScenarioClinic(label, options);
  const specialty = await createScenarioSpecialty(clinic, "Pediatría");
  const specialties = [specialty];
  const doctors: TeamScenario["doctors"] = [
    await addScenarioDoctor(clinic, `${label}-1`, {
      name: "Andrea",
      lastName: "Lozano",
      specialties,
      treatment: "DRA",
    }),
    await addScenarioDoctor(clinic, `${label}-2`, {
      name: "Bruno",
      lastName: "Medina",
      specialties,
    }),
    await addScenarioDoctor(clinic, `${label}-3`, {
      name: "Carla",
      lastName: "Núñez",
      specialties,
    }),
  ];
  return { ...clinic, specialty, doctors };
}

export interface MultiSpecialtyScenario extends ScenarioClinic {
  specialtyA: ScenarioSpecialty;
  specialtyB: ScenarioSpecialty;
  doctor: ScenarioDoctor;
}

export async function createMultiSpecialtyScenario(
  label: string,
  options: ClinicOptions = {},
): Promise<MultiSpecialtyScenario> {
  const clinic = await createScenarioClinic(label, options);
  const specialtyA = await createScenarioSpecialty(clinic, "Cardiología");
  const specialtyB = await createScenarioSpecialty(clinic, "Nutrición");
  const doctor = await addScenarioDoctor(clinic, label, {
    name: "Mateo",
    lastName: "Ibáñez",
    specialties: [specialtyA, specialtyB],
  });
  return { ...clinic, specialtyA, specialtyB, doctor };
}

export interface ClinicScenario extends ScenarioClinic {
  specialtyA: ScenarioSpecialty;
  specialtyB: ScenarioSpecialty;
  doctorsOfA: [ScenarioDoctor, ScenarioDoctor];
  doctorOfB: ScenarioDoctor;
}

export async function createClinicScenario(
  label: string,
  options: ClinicOptions = {},
): Promise<ClinicScenario> {
  const clinic = await createScenarioClinic(label, options);
  const specialtyA = await createScenarioSpecialty(clinic, "Dermatología");
  const specialtyB = await createScenarioSpecialty(clinic, "Neurología");
  const doctorsOfA: ClinicScenario["doctorsOfA"] = [
    await addScenarioDoctor(clinic, `${label}-a1`, {
      name: "Elena",
      lastName: "Vargas",
      specialties: [specialtyA],
    }),
    await addScenarioDoctor(clinic, `${label}-a2`, {
      name: "Felipe",
      lastName: "Ríos",
      specialties: [specialtyA],
    }),
  ];
  const doctorOfB = await addScenarioDoctor(clinic, `${label}-b`, {
    name: "Gabriela",
    lastName: "Salas",
    specialties: [specialtyB],
    treatment: "DRA",
  });
  return { ...clinic, specialtyA, specialtyB, doctorsOfA, doctorOfB };
}

export interface SimpleClinicScenario extends ScenarioClinic {
  specialtyA: ScenarioSpecialty;
  specialtyB: ScenarioSpecialty;
  doctorOfA: ScenarioDoctor;
  doctorOfB: ScenarioDoctor;
}

export async function createSimpleClinicScenario(
  label: string,
  options: ClinicOptions = {},
): Promise<SimpleClinicScenario> {
  const clinic = await createScenarioClinic(label, options);
  const specialtyA = await createScenarioSpecialty(clinic, "Urología");
  const specialtyB = await createScenarioSpecialty(clinic, "Ginecología");
  const doctorOfA = await addScenarioDoctor(clinic, `${label}-a`, {
    name: "Héctor",
    lastName: "Aguilar",
    specialties: [specialtyA],
  });
  const doctorOfB = await addScenarioDoctor(clinic, `${label}-b`, {
    name: "Irene",
    lastName: "Campos",
    specialties: [specialtyB],
  });
  return { ...clinic, specialtyA, specialtyB, doctorOfA, doctorOfB };
}

// Sin esta fila `POST /appointment` responde 404: la reserva sólo llega hasta «Tus datos».
export async function removeClinicRow(clinicId: string): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.clinic.delete({ where: { resourceId: clinicId } });
}

export async function setClinicAddress(
  clinicId: string,
  address: string,
): Promise<void> {
  const prisma = await getTestPrisma();
  await prisma.clinic.update({
    where: { resourceId: clinicId },
    data: { address },
  });
}

export async function readBookedAppointments(
  clinicId: string,
): Promise<TestPrismaAppointmentRow[]> {
  const prisma = await getTestPrisma();
  return prisma.appointment.findMany({ where: { clinicId } });
}
