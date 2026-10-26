import type { AppointmentStatus } from "../entities/appointment/entity";
import type { PatientScope } from "../entities/patient/scope";
import type { DoctorTreatment } from "../enums/doctor-treatment";
import type { AppointmentForMetrics } from "../services/patient-metrics";

export interface PatientSummary {
  id: string;
  name: string;
  lastName: string;
  phone: string;
  email: string;
  documentType: string;
  documentNumber: string;
  birthDate: string | null;
}

export interface PatientRecord extends PatientSummary {
  sex: string | null;
  emergencyContact: string | null;
  insurer: string | null;
  bloodType: string | null;
  allergies: string[];
  background: string | null;
  medications: string | null;
  allergiesReviewedAt: Date | null;
  updatedAt: Date;
  updatedBy: string | null;
}

export interface PatientAppointment extends AppointmentForMetrics {
  patientId: string;
}

export interface PatientHistoryEntry {
  id: string;
  scheduledAt: Date;
  status: AppointmentStatus;
  specialty: string;
  durationMinutes: number;
  clinicName: string;
  doctor: {
    name: string;
    lastName: string;
    treatment: DoctorTreatment | null;
  };
}

export interface PatientPageCriteria {
  accountId: string;
  scope: PatientScope;
  take: number;
  from?: string;
  search?: string;
}

export interface PatientLookupCriteria {
  accountId: string;
  scope: PatientScope;
  patientId: string;
}

export interface OrganizationAppointmentsCriteria {
  accountId: string;
  organizationId: string;
}

export interface IPatientRepository {
  findPageInScope(criteria: PatientPageCriteria): Promise<PatientSummary[]>;
  findInScope(criteria: PatientLookupCriteria): Promise<PatientRecord | null>;
  findAppointmentsForMetrics(
    criteria: OrganizationAppointmentsCriteria & { patientIds: string[] },
  ): Promise<PatientAppointment[]>;
  findAppointmentHistory(
    criteria: OrganizationAppointmentsCriteria & { patientId: string },
  ): Promise<PatientHistoryEntry[]>;
}
