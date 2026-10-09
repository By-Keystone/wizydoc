import { notFound } from "next/navigation";
import { ManageAppointment } from "@/components/appointment/manage-appointment";
import { appointmentsApi } from "@/lib/api/appointments";
import { isManageTokenFormat } from "@/lib/api/appointments/manage-token";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function ManageAppointmentPage({ params }: Props) {
  const { token } = await params;
  if (!isManageTokenFormat(token)) notFound();

  const appointment = await appointmentsApi.getManaged(token);
  if (!appointment) notFound();

  // Al refrescar con otra hora o estado se remonta y vuelve a la pantalla que corresponde.
  const stateKey = [
    appointment.status,
    appointment.date,
    appointment.time,
    appointment.rescheduleBlockedBy,
  ].join("|");

  return (
    <ManageAppointment key={stateKey} token={token} appointment={appointment} />
  );
}
