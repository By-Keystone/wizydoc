import type { DoctorTreatment } from "@/domain/enums/doctor-treatment";

export interface User {
  id: string;
  email: string;
  name: string;
  lastName: string;
  phone: string;
  treatment: DoctorTreatment | null;
  confirmed: boolean;
  onboardingCompleted: boolean;
  accountId: string | null;
  createdAt: Date;
  updatedAt: Date;
}
