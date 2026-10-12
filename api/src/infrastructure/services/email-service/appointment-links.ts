export const manageAppointmentUrl = (token: string) =>
  `${process.env.FRONTEND_URL}/appointment/manage/${token}`;

export const bookAgainUrl = (clinicId: string) =>
  `${process.env.FRONTEND_URL}/clinic/${clinicId}/create-appointment`;
