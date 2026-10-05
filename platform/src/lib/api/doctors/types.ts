import { MembershipRole } from "@/lib/utils";

export type Doctor = {
  doctorId: string;
  specialty?: string;
  name: string;
  lastName: string;
  membershipRole: MembershipRole;
  phone: string;
  confirmed: boolean;
};

// Shape real de GET /clinic/:clinicId/doctors (endpoint público, usado por
// el wizard de reserva). Distinto de `Doctor` (listado interno de la
// clínica), que trae otros campos (phone, confirmed, membershipRole).
export type ClinicDoctor = {
  doctorProfileId: string;
  name: string;
  lastName: string;
  specialties: { id: string; name: string }[];
};
