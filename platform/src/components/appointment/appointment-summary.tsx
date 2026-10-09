import { cn } from "@/lib/utils";
import { formatWhen } from "@/components/booking/week";

interface Props {
  specialty: string;
  doctorName: string;
  date: string;
  time: string;
  durationMinutes: number;
  clinicName: string;
  clinicAddress: string;
  muted?: boolean;
}

export function AppointmentSummary({
  specialty,
  doctorName,
  date,
  time,
  durationMinutes,
  clinicName,
  clinicAddress,
  muted,
}: Props) {
  return (
    <div
      className={cn(
        "mt-5 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm text-brand-gray",
        muted && "opacity-65",
      )}
    >
      <p className="border-b border-slate-100 pb-3 text-base font-bold text-brand-teal-dark">
        {formatWhen(date, time)}
        <span className="mt-0.5 block text-xs font-medium text-brand-gray">
          Hora de Lima · {durationMinutes} minutos
        </span>
      </p>
      <dl className="mt-3 grid grid-cols-[92px_1fr] gap-x-3 gap-y-2">
        <dt className="text-[13px]">Especialidad</dt>
        <dd className="font-medium text-brand-ink">{specialty}</dd>
        <dt className="text-[13px]">Profesional</dt>
        <dd className="font-medium text-brand-ink">{doctorName}</dd>
        <dt className="text-[13px]">Sede</dt>
        <dd className="font-medium text-brand-ink">{clinicName}</dd>
        <dt className="text-[13px]">Dirección</dt>
        <dd className="font-medium text-brand-ink">{clinicAddress}</dd>
      </dl>
    </div>
  );
}
