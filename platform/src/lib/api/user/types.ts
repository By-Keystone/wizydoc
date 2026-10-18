export type DoctorTreatment = "DR" | "DRA";

export interface MyProfileClinic {
  clinicId: string;
  clinicName: string;
  organizationName: string;
  specialties: { id: string; name: string }[];
}

export interface MyProfile {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  treatment: DoctorTreatment | null;
  doctorDisplayName: string | null;
  clinics: MyProfileClinic[];
}
