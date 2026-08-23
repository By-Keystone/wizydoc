"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ClinicDoctor } from "@/lib/api/doctors/types";
import { createAppointmentAction } from "@/lib/actions/appointment/create-appointment.action";
import { StepperProgress } from "./steps/stepper-progress";
import { SpecialtyStep } from "./steps/specialty-step";
import { DoctorStep } from "./steps/doctor-step";
import { DateTimeStep } from "./steps/datetime-step";
import { PatientStep, BookingPatient } from "./steps/patient-step";
import { SuccessStep } from "./steps/success-step";

interface Specialty {
  id: string;
  name: string;
}

interface Props {
  doctors: ClinicDoctor[];
  clinicId: string;
}

export function BookingWizard({ doctors, clinicId }: Props) {
  const [step, setStep] = useState(1);
  const [specialty, setSpecialty] = useState<Specialty | null>(null);
  const [doctor, setDoctor] = useState<ClinicDoctor | null>(null);
  const [dateTime, setDateTime] = useState<{
    date: string;
    time: string;
    durationMinutes: number;
  } | null>(null);
  const [patient, setPatient] = useState<BookingPatient | null>(null);

  const specialties = useMemo(() => {
    const byId = new Map<string, Specialty>();
    for (const d of doctors) {
      for (const s of d.specialties) {
        byId.set(s.id, s);
      }
    }
    return Array.from(byId.values());
  }, [doctors]);

  const doctorsForSpecialty = useMemo(() => {
    if (!specialty) return [];
    return doctors.filter((d) =>
      d.specialties.some((s) => s.id === specialty.id),
    );
  }, [doctors, specialty]);

  const reset = () => {
    setStep(1);
    setSpecialty(null);
    setDoctor(null);
    setDateTime(null);
    setPatient(null);
  }

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardContent className="p-8">
          {step <= 4 && <StepperProgress currentStep={step} totalSteps={4} />}

          {step === 1 && (
            <SpecialtyStep
              specialties={specialties}
              onNext={(s) => {
                setSpecialty(s);
                setStep(2);
              }}
            />
          )}

          {step === 2 && specialty && (
            <DoctorStep
              doctors={doctorsForSpecialty}
              onNext={(d) => {
                setDoctor(d);
                setStep(3);
              }}
              onBack={() => setStep(1)}
            />
          )}

          {step === 3 && doctor && (
            <DateTimeStep
              doctorProfileId={doctor.doctorProfileId}
              onNext={(selection) => {
                setDateTime(selection);
                setStep(4);
              }}
              onBack={() => setStep(2)}
            />
          )}

          {step === 4 && specialty && doctor && dateTime && (
            <PatientStep
              specialtyName={specialty.name}
              doctorName={`Dr. ${doctor.name} ${doctor.lastName}`}
              date={dateTime.date}
              time={dateTime.time}
              onNext={async (p) => {
                const result = await createAppointmentAction({
                  doctorProfileId: doctor.doctorProfileId,
                  specialty: specialty.name,
                  // Se envía la hora del hueco tal cual se eligió, sin zona: es
                  // el api quien sabe en qué huso opera la clínica y la
                  // convierte al instante que le toca.
                  scheduledAt: `${dateTime.date}T${dateTime.time}`,
                  durationMinutes: dateTime.durationMinutes,
                  patientName: p.name,
                  patientLastName: p.lastName,
                  patientPhone: p.phone,
                  patientEmail: p.email,
                  clinicId,
                });

                if (result.status !== "success") {
                  throw new Error(
                    result.status === "error"
                      ? result.message
                      : "No se pudo crear la cita",
                  );
                }

                setPatient(p);
                setStep(5);
              }}
              onBack={() => setStep(3)}
            />
          )}

          {step === 5 && specialty && doctor && dateTime && patient && (
            <SuccessStep
              specialtyName={specialty.name}
              doctorName={`Dr. ${doctor.name} ${doctor.lastName}`}
              date={dateTime.date}
              time={dateTime.time}
              patient={patient}
              onClick={reset}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
