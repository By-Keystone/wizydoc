import { Building2, CalendarDays, MapPin, Stethoscope } from "lucide-react";
import type { ClinicLocation } from "@/lib/api/clinic/types";
import type { ClinicDoctor } from "@/lib/api/doctors/types";

interface Heading {
  eyebrow: string | null;
  title: string;
}

function getHeading(
  clinic: ClinicLocation | null,
  doctor: ClinicDoctor | null,
): Heading {
  if (doctor) {
    return { eyebrow: "Reserva tu cita con", title: doctor.displayName };
  }
  if (clinic) {
    return { eyebrow: "Reserva tu cita en", title: clinic.name };
  }
  return { eyebrow: null, title: "Reserva tu cita" };
}

export function getHeadingText(
  clinic: ClinicLocation | null,
  doctor: ClinicDoctor | null,
): string {
  const { eyebrow, title } = getHeading(clinic, doctor);
  return [eyebrow, title].filter(Boolean).join(" ");
}

function getLocation(
  clinic: ClinicLocation | null,
  doctor: ClinicDoctor | null,
): string | null {
  if (!clinic) return null;
  const parts = doctor ? [clinic.name, clinic.address] : [clinic.address];
  return parts.filter(Boolean).join(" · ") || null;
}

function getIcon(clinic: ClinicLocation | null, doctor: ClinicDoctor | null) {
  if (doctor) return Stethoscope;
  return clinic ? Building2 : CalendarDays;
}

interface Props {
  clinic: ClinicLocation | null;
  doctor: ClinicDoctor | null;
  specialty: { name: string } | null;
}

export function BookingHeader({ clinic, doctor, specialty }: Props) {
  const { eyebrow, title } = getHeading(clinic, doctor);
  const location = getLocation(clinic, doctor);
  const Icon = getIcon(clinic, doctor);

  return (
    <header className="mb-5 flex gap-3 border-b border-gray-200 pb-4">
      <span
        aria-hidden="true"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal"
      >
        <Icon className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="text-brand-ink">
          {eyebrow && (
            <>
              <span className="block text-xs font-medium text-brand-gray">
                {eyebrow}
              </span>{" "}
            </>
          )}
          <span className="block break-words text-base font-semibold leading-snug">
            {title}
          </span>
        </h1>
        {specialty && (
          <p className="break-words text-sm font-medium text-brand-teal-dark">
            {specialty.name}
          </p>
        )}
        {location && (
          <p className="mt-1.5 flex items-start gap-1 text-[13px] leading-snug text-brand-gray">
            <MapPin
              aria-hidden="true"
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
            />
            <span className="min-w-0 break-words">{location}</span>
          </p>
        )}
      </div>
    </header>
  );
}
