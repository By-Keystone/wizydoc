export const buildPublicBookingUrl = (origin: string, clinicId: string) => {
  return `${origin}/clinic/${clinicId}/create-appointment`;
};
