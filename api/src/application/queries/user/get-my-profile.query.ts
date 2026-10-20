import type { DoctorTreatment } from "@/domain/enums/doctor-treatment";

export interface MyProfileClinic {
  clinicId: string;
  clinicName: string;
  organizationName: string;
  specialties: { id: string; name: string }[];
}

export interface MyProfileEditableClinic {
  clinicId: string;
  clinicName: string;
  organizationId: string;
  organizationName: string;
  specialties: { id: string; name: string }[];
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

export interface IGetMyProfileQuery {
  execute(userId: string, accountId: string): Promise<MyProfile | null>;
  hasDoctorProfile(userId: string, accountId: string): Promise<boolean>;
  canSetTreatment(userId: string, accountId: string): Promise<boolean>;
}
