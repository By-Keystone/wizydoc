import type { DoctorTreatment } from "@/domain/enums/doctor-treatment";

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

export interface IGetMyProfileQuery {
  execute(userId: string, accountId: string): Promise<MyProfile | null>;
  hasDoctorProfile(userId: string, accountId: string): Promise<boolean>;
}
