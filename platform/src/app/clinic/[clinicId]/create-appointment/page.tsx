import type { Metadata } from "next";
import { cache } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { clinicApi } from "@/lib/api/clinic";
import type { ClinicLocation } from "@/lib/api/clinic/types";
import { doctorsApi } from "@/lib/api/doctors";
import type { ClinicDoctor } from "@/lib/api/doctors/types";
import { BookingClosed } from "./booking-closed";
import { BookingHeader, getHeadingText } from "./booking-header";
import { BookingWizard } from "./booking-wizard";
import { findSoleDoctor, pickInitialSelection } from "./booking-steps";

interface Props {
  params: Promise<{ clinicId: string }>;
}

const loadBookingData = cache(async (clinicId: string) => {
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
  return { doctors, clinic };
});

// Si la lectura falla se ve el wizard: el servidor frena la reserva al confirmar, y un fallo de lectura no debe cerrar el link de quien tiene cupo.
async function loadBookingStatus(clinicId: string) {
  try {
    return await clinicApi.getBookingStatus(clinicId);
  } catch (error) {
    console.error("[create-appointment] error fetching booking status:", error);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { clinicId } = await params;
  const { doctors, clinic } = await loadBookingData(clinicId);

  return {
    title: getHeadingText(clinic, findSoleDoctor(doctors)),
  };
}

export default async function CreateAppointmentPage({ params }: Props) {
  const { clinicId } = await params;
  const [{ doctors, clinic }, bookingStatus] = await Promise.all([
    loadBookingData(clinicId),
    loadBookingStatus(clinicId),
  ]);

  if (doctors.length === 0) {
    return (
      <div className="w-full max-w-md">
        <Card>
          <CardContent className="p-5 sm:p-8">
            <BookingHeader clinic={clinic} doctor={null} specialty={null} />
            <p className="text-sm text-brand-gray">
              Esta sede todavía no tiene médicos disponibles para reservar
              citas.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (bookingStatus && !bookingStatus.isAcceptingBookings) {
    const { specialty, doctor } = pickInitialSelection(doctors);
    return (
      <BookingClosed
        clinicId={clinicId}
        clinic={clinic}
        doctor={doctor ?? findSoleDoctor(doctors)}
        specialty={specialty}
        patientContact={bookingStatus.patientContact}
      />
    );
  }

  return (
    <BookingWizard doctors={doctors} clinic={clinic} clinicId={clinicId} />
  );
}
