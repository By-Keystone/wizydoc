import { createOnboardedAdmin, type OnboardedAdmin } from "./accounts";
import { API_BASE_URL } from "./env";
import {
  type PatientSpec,
  type SeededPatient,
  enablePatientRecords,
  numberedPatientSpecs,
  seedPatientsInOrder,
} from "./patients";
import {
  createForeignClinicWithPatient,
  createOrganizationWithClinics,
  type ForeignClinic,
  type ScopeResource,
} from "./patient-scope";
import { findDoctorProfileId } from "./profile";

const PHONE_WITH_SPACES = "+51 966 111 222";

export const SEARCH_SPECS = {
  anaMaria: {
    name: "Ana María",
    lastName: "Quispe Rojas",
    documentNumber: "45123456",
    phone: "+51987654321",
  },
  luis: {
    name: "Luis",
    lastName: "Quispe Huamán",
    documentNumber: "46000002",
    phone: "+51911222333",
  },
  jose: {
    name: "José",
    lastName: "Núñez Ccori",
    documentNumber: "70123456",
    phone: "+51955443322",
  },
  martin: {
    name: "Martin",
    lastName: "Garcia",
    documentNumber: "47000004",
    phone: "+51944000444",
  },
  passport: {
    name: "Rosa",
    lastName: "Paredes",
    documentType: "PASSPORT",
    documentNumber: "AB123456",
    phone: "+51933000555",
  },
  spacedPhone: {
    name: "Elena",
    lastName: "Salas",
    documentNumber: "48000006",
    phone: "+51900000006",
  },
  zafiroEmail: {
    name: "Teo",
    lastName: "Mena",
    documentNumber: "49000007",
    phone: "+51922000777",
    email: "zafiro.teo@example.com",
  },
} satisfies Record<string, PatientSpec>;

const FILLER_SPECS: PatientSpec[] = [
  { name: "Carlos", lastName: "Ríos Vega", documentNumber: "50000008" },
  { name: "Sofía", lastName: "Torres Soto", documentNumber: "50000009" },
];

export interface SearchWorld {
  admin: OnboardedAdmin;
  organization: ScopeResource;
  clinic: ScopeResource;
  anaMaria: SeededPatient;
  luis: SeededPatient;
  jose: SeededPatient;
  martin: SeededPatient;
  passport: SeededPatient;
  spacedPhone: SeededPatient;
  zafiroEmail: SeededPatient;
  foreign: ForeignClinic;
  doctorProfileId: string;
}

export async function createClinicWithPatients(
  label: string,
  specs: PatientSpec[],
) {
  const admin = await createOnboardedAdmin({ emailPrefix: `admin-${label}` });
  await enablePatientRecords(admin.accountId);
  const {
    organization,
    clinics: [clinic],
  } = await createOrganizationWithClinics(admin, label, [label]);
  const doctorProfileId = (await findDoctorProfileId(
    admin.userId,
    clinic.id,
  )) as string;
  const patients = await seedPatientsInOrder({
    accountId: admin.accountId,
    clinicId: clinic.id,
    doctorProfileId,
    specs,
  });

  return { admin, organization, clinic, doctorProfileId, patients };
}

// El teléfono con espacios se guarda desde la ficha, que es como llega a la base.
async function editPhoneFromRecord(
  admin: OnboardedAdmin,
  clinicId: string,
  patient: SeededPatient,
  phone: string,
) {
  const response = await admin.context.patch(
    `${API_BASE_URL}/patients/in/${clinicId}/${patient.id}`,
    { data: { phone } },
  );
  if (!response.ok()) {
    throw new Error(`PATCH de la ficha falló (${response.status()})`);
  }
}

export async function createSearchWorld(label: string): Promise<SearchWorld> {
  const base = await createClinicWithPatients(label, [
    ...FILLER_SPECS,
    SEARCH_SPECS.anaMaria,
    SEARCH_SPECS.luis,
    SEARCH_SPECS.jose,
    SEARCH_SPECS.martin,
    SEARCH_SPECS.passport,
    SEARCH_SPECS.spacedPhone,
    SEARCH_SPECS.zafiroEmail,
  ]);
  const [, , anaMaria, luis, jose, martin, passport, spacedPhone, zafiroEmail] =
    base.patients;
  await editPhoneFromRecord(
    base.admin,
    base.clinic.id,
    spacedPhone,
    PHONE_WITH_SPACES,
  );
  const foreign = await createForeignClinicWithPatient(SEARCH_SPECS.jose);

  return {
    admin: base.admin,
    organization: base.organization,
    clinic: base.clinic,
    doctorProfileId: base.doctorProfileId,
    anaMaria,
    luis,
    jose,
    martin,
    passport,
    spacedPhone,
    zafiroEmail,
    foreign,
  };
}

export interface RamosWorld {
  admin: OnboardedAdmin;
  clinic: ScopeResource;
  organization: ScopeResource;
  doctorProfileId: string;
  ramos: SeededPatient[];
  others: SeededPatient[];
}

const RAMOS_COUNT = 25;
const OTHERS_COUNT = 5;

// Un paciente de cada seis no es Ramos, repartidos entre los Ramos para que el orden se note.
export async function createRamosWorld(label: string): Promise<RamosWorld> {
  const ramosSpecs = numberedPatientSpecs(RAMOS_COUNT, "Ramos", 61000000);
  const otherSpecs = numberedPatientSpecs(OTHERS_COUNT, "Soto", 62000000);
  const specs: PatientSpec[] = [];
  let nextRamos = 0;
  let nextOther = 0;
  for (let index = 0; index < RAMOS_COUNT + OTHERS_COUNT; index += 1) {
    const isOther = index % 6 === 5;
    specs.push(isOther ? otherSpecs[nextOther++] : ramosSpecs[nextRamos++]);
  }
  const base = await createClinicWithPatients(label, specs);
  const byFullName = new Map(
    base.patients.map((patient) => [patient.fullName, patient]),
  );
  const seededFor = (spec: PatientSpec) =>
    byFullName.get(`${spec.name} ${spec.lastName}`) as SeededPatient;

  return {
    admin: base.admin,
    clinic: base.clinic,
    organization: base.organization,
    doctorProfileId: base.doctorProfileId,
    ramos: ramosSpecs.map(seededFor),
    others: otherSpecs.map(seededFor),
  };
}
