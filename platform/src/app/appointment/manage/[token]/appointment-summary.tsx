import { cn } from "@/lib/utils";
import type { AppointmentPortal } from "@/lib/api/appointments/types";
import { formatWhen } from "./format";

export type Moment = { date: string; time: string };

export function AppointmentSummary({
  appointment,
  muted = false,
}: {
  appointment: AppointmentPortal;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-5 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm text-brand-gray",
        muted && "opacity-65",
      )}
    >
      <p className="border-b border-slate-100 pb-3 text-base font-bold text-brand-teal-dark">
        {formatWhen(appointment.date, appointment.time)}
        <span className="mt-0.5 block text-xs font-medium text-brand-gray">
          {appointment.durationMinutes} minutos
        </span>
      </p>
      <dl className="mt-3 grid grid-cols-[92px_1fr] gap-x-3 gap-y-2">
        <dt className="text-[13px]">Especialidad</dt>
        <dd className="font-medium text-brand-ink">{appointment.specialty}</dd>
        <dt className="text-[13px]">Profesional</dt>
        <dd className="font-medium text-brand-ink">{appointment.doctorName}</dd>
        <dt className="text-[13px]">Sede</dt>
        <dd className="font-medium text-brand-ink">{appointment.clinicName}</dd>
        <dt className="text-[13px]">Dirección</dt>
        <dd className="font-medium text-brand-ink">
          {appointment.clinicAddress}
        </dd>
      </dl>
    </div>
  );
}

export function ChangeComparison({
  before,
  after,
}: {
  before: Moment;
  after: Moment;
}) {
  return (
    <div className="mt-5 grid gap-2.5">
      <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-gray">
          Antes
        </p>
        <p className="mt-0.5 text-[15px] text-brand-gray line-through">
          {formatWhen(before.date, before.time)}
        </p>
      </div>
      <div className="rounded-xl border border-brand-teal bg-brand-teal/5 px-3.5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-gray">
          Ahora
        </p>
        <p className="mt-0.5 text-[15px] font-bold text-brand-teal-dark">
          {formatWhen(after.date, after.time)}
        </p>
      </div>
    </div>
  );
}
