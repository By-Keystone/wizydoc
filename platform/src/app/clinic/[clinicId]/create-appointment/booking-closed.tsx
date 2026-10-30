"use client";

import { CalendarOff, MessageCircle, Phone } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { ClinicLocation } from "@/lib/api/clinic/types";
import type { ClinicDoctor } from "@/lib/api/doctors/types";
import {
  buildCallUrl,
  buildWhatsAppChatUrl,
  formatPatientContact,
  isMobileContact,
} from "@/lib/patient-contact";
import { BookingHeader } from "./booking-header";
import type { Specialty } from "./booking-steps";
import { MissedBookingBeacon } from "./missed-booking-beacon";

interface Props {
  clinicId: string;
  clinic: ClinicLocation | null;
  doctor: ClinicDoctor | null;
  specialty: Specialty | null;
  patientContact: string | null;
}

const CONTACT_BUTTON_CLASS = "h-11 w-full gap-2";

function describeHowToContact(patientContact: string | null): string {
  if (!patientContact) return "Vuelve a intentarlo más adelante.";
  return isMobileContact(patientContact)
    ? "Para pedir una cita, escribe o llama al consultorio."
    : "Para pedir una cita, llama al consultorio.";
}

export function BookingClosed({
  clinicId,
  clinic,
  doctor,
  specialty,
  patientContact,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  const whatsAppMessage = clinic
    ? `Hola, quiero pedir una cita en ${clinic.name}.`
    : "Hola, quiero pedir una cita.";

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardContent className="p-5 sm:p-8">
          <BookingHeader
            clinic={clinic}
            doctor={doctor}
            specialty={specialty}
          />
          <span
            aria-hidden="true"
            className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-gray ring-1 ring-inset ring-gray-200"
          >
            <CalendarOff className="h-6 w-6" />
          </span>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="mt-4 text-lg font-semibold leading-snug text-brand-teal-dark outline-none"
          >
            Este consultorio no está recibiendo reservas en línea por ahora
          </h2>
          <p className="mt-1 text-sm text-brand-gray">
            {describeHowToContact(patientContact)}
          </p>
          {patientContact && (
            <div className="mt-6 flex flex-col gap-3">
              {isMobileContact(patientContact) && (
                <Button asChild className={CONTACT_BUTTON_CLASS}>
                  <a
                    href={buildWhatsAppChatUrl(patientContact, whatsAppMessage)}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-4 w-4" aria-hidden="true" />
                    Escribir por WhatsApp
                    <span className="sr-only"> (se abre en WhatsApp)</span>
                  </a>
                </Button>
              )}
              <Button
                asChild
                variant="outline"
                className={CONTACT_BUTTON_CLASS}
              >
                <a href={buildCallUrl(patientContact)}>
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  Llamar al {formatPatientContact(patientContact)}
                </a>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <MissedBookingBeacon clinicId={clinicId} />
    </div>
  );
}
