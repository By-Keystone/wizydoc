import { notFound } from "next/navigation";
import { appointmentsApi } from "@/lib/api/appointments";
import { AppointmentPortalView } from "./appointment-portal-view";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function AppointmentManagePage({ params }: Props) {
  const { token } = await params;

  const appointment = await appointmentsApi.getPortal(token);
  if (!appointment) notFound();

  return (
    <AppointmentPortalView token={token} initialAppointment={appointment} />
  );
}
