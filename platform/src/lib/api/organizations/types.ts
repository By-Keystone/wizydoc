export type GetClinicCountResult = {
  clinicCount: number;
};

export type GetDoctorCountResult = {
  doctorCount: number;
};

export type OrganizationUserAccess = {
  clinicId: string | null;
  clinicName: string | null;
  role: "ADMIN" | "DOCTOR" | "USER";
};

export type OrganizationUser = {
  name: string;
  lastName: string;
  email: string;
  phone: string;
  invitationStatus: "pending" | null;
  accesses: OrganizationUserAccess[];
};
