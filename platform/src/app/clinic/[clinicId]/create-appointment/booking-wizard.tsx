"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { ClinicLocation } from "@/lib/api/clinic/types";
import type { ClinicDoctor } from "@/lib/api/doctors/types";
import { createAppointmentAction } from "@/lib/actions/appointment/create-appointment.action";
import { BookingHeader } from "./booking-header";
import {
  type BookingStep,
  type Specialty,
  findSoleDoctor,
  listDoctorsOf,
  listSpecialties,
  listSteps,
  pickInitialSelection,
} from "./booking-steps";
import { StepperProgress } from "./steps/stepper-progress";
import { SpecialtyStep } from "./steps/specialty-step";
import { DoctorStep } from "./steps/doctor-step";
import { DateTimeStep } from "@/components/booking/datetime-step";
import { getDoctorSlotsAction } from "@/lib/actions/doctor-profile/get-slots.action";
import { PatientStep, type BookingPatient } from "./steps/patient-step";
import { SuccessStep } from "./steps/success-step";

interface Props {
  doctors: ClinicDoctor[];
  clinic: ClinicLocation | null;
  clinicId: string;
}

export function BookingWizard({ doctors, clinic, clinicId }: Props) {
  const initialSelection = pickInitialSelection(doctors);
  const firstStep = listSteps(doctors, initialSelection.specialty)[0];

  const [specialty, setSpecialty] = useState(initialSelection.specialty);
  const [doctor, setDoctor] = useState(initialSelection.doctor);
  const [step, setStep] = useState<BookingStep | "success">(firstStep);
  const [dateTime, setDateTime] = useState<{
    date: string;
    time: string;
    durationMinutes: number;
  } | null>(null);
  const [patient, setPatient] = useState<BookingPatient | null>(null);

  const cardContentRef = useRef<HTMLDivElement>(null);
  const previousStep = useRef(step);

  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    cardContentRef.current?.querySelector("h2")?.focus();
  }, [step]);

  const steps = listSteps(doctors, specialty);
  const stepIndex = step === "success" ? -1 : steps.indexOf(step);
  const goBack = () => setStep(steps[stepIndex - 1]);
  const goBackUnlessFirst = stepIndex > 0 ? goBack : undefined;

  const chooseSpecialty = (chosen: Specialty) => {
    if (chosen.id !== specialty?.id) {
      setDoctor(findSoleDoctor(listDoctorsOf(doctors, chosen.id)));
    }
    setSpecialty(chosen);
    const stepsOfChosen = listSteps(doctors, chosen);
    setStep(stepsOfChosen[stepsOfChosen.indexOf("specialty") + 1]);
  };

  const reset = () => {
    setSpecialty(initialSelection.specialty);
    setDoctor(initialSelection.doctor);
    setStep(firstStep);
    setDateTime(null);
    setPatient(null);
  };

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardContent ref={cardContentRef} className="p-5 sm:p-8">
          {step !== "success" && (
            <>
              <BookingHeader
                clinic={clinic}
                doctor={doctor ?? findSoleDoctor(doctors)}
                specialty={specialty}
              />
              <StepperProgress
                currentStep={stepIndex + 1}
                totalSteps={steps.length}
              />
            </>
          )}

          {step === "specialty" && (
            <SpecialtyStep
              specialties={listSpecialties(doctors)}
              initialSelectedId={specialty?.id}
              onNext={chooseSpecialty}
            />
          )}

          {step === "doctor" && specialty && (
            <DoctorStep
              doctors={listDoctorsOf(doctors, specialty.id)}
              specialtyName={specialty.name}
              initialSelectedId={doctor?.doctorProfileId}
              onNext={(chosen) => {
                setDoctor(chosen);
                setStep("datetime");
              }}
              onBack={goBackUnlessFirst}
            />
          )}

          {step === "datetime" && doctor && (
            <DateTimeStep
              slotsSourceId={doctor.doctorProfileId}
              loadSlots={getDoctorSlotsAction}
              onNext={(selection) => {
                setDateTime(selection);
                setStep("patient");
              }}
              onBack={goBackUnlessFirst}
            />
          )}

          {step === "patient" && specialty && doctor && dateTime && (
            <PatientStep
              specialtyName={specialty.name}
              doctorName={doctor.displayName}
              date={dateTime.date}
              time={dateTime.time}
              onNext={async (p) => {
                const result = await createAppointmentAction({
                  doctorProfileId: doctor.doctorProfileId,
                  specialty: specialty.name,
                  scheduledAt: `${dateTime.date}T${dateTime.time}`,
                  durationMinutes: dateTime.durationMinutes,
                  patientName: p.name,
                  patientLastName: p.lastName,
                  patientPhone: p.phone,
                  patientEmail: p.email,
                  patientDocumentType: p.documentType,
                  patientDocumentNumber: p.documentNumber,
                  patientBirthDate: p.birthDate,
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
                setStep("success");
              }}
              onBack={goBack}
            />
          )}

          {step === "success" && specialty && doctor && dateTime && patient && (
            <SuccessStep
              appointment={{
                specialty: specialty.name,
                doctorName: doctor.displayName,
                date: dateTime.date,
                time: dateTime.time,
                durationMinutes: dateTime.durationMinutes,
                clinicName: clinic?.name,
                clinicAddress: clinic?.address,
              }}
              patientName={patient.name}
              onClick={reset}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
