export type DoctorTreatment = "DR" | "DRA";

export interface MyProfileClinic {
  clinicId: string;
  clinicName: string;
  organizationName: string;
  specialties: { id: string; name: string }[];
}

export interface MyProfileEditableClinic extends MyProfileClinic {
  organizationId: string;
  isClinicDoctor: boolean;
  hasSchedule: boolean;
}

export interface MyProfileOrganization {
  organizationId: string;
  organizationName: string;
  specialties: { id: string; name: string }[];
  canCreateSpecialties: boolean;
}

export interface MyProfile {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  treatment: DoctorTreatment | null;
  doctorDisplayName: string | null;
  clinics: MyProfileClinic[];
  editableClinics: MyProfileEditableClinic[];
  organizations: MyProfileOrganization[];
}
