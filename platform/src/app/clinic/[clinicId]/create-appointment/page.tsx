import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { clinicApi } from "@/lib/api/clinic";
import type { ClinicLocation } from "@/lib/api/clinic/types";
import { doctorsApi } from "@/lib/api/doctors";
import type { ClinicDoctor } from "@/lib/api/doctors/types";
import { BookingWizard } from "./booking-wizard";

interface Props {
  params: Promise<{ clinicId: string }>;
}

export default async function CreateAppointmentPage({ params }: Props) {
  const { clinicId } = await params;

  let doctors: ClinicDoctor[] = [];
  let clinic: ClinicLocation | null = null;
  try {
    [doctors, clinic] = await Promise.all([
      doctorsApi.getDoctorsByResourceId(clinicId),
      clinicApi.getLocation(clinicId).catch(() => null),
    ]);
  } catch (error) {
    console.error("[create-appointment] error fetching doctors:", error);
  }

  if (doctors.length === 0) {
    return (
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <h1 className="text-2xl font-bold text-brand-teal-dark">
              Reservar cita
            </h1>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-brand-gray">
              Esta clínica todavía no tiene doctores disponibles para reservar
              citas.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <BookingWizard doctors={doctors} clinic={clinic} clinicId={clinicId} />
  );
}
