import { CalendarDays } from "lucide-react";
import { AppointmentStatusBadge } from "@/components/common/appointment-status-badge";
import { clinicApi } from "@/lib/api/clinic";

interface Props {
  resourceId: string;
}

export async function TodayAppointments({ resourceId }: Props) {
  const appointments = await clinicApi.getTodayAppointments(resourceId);

  return (
    <section className="mt-8 rounded-xl border border-gray-200 bg-white">
      <header className="flex items-center gap-2 border-b border-gray-200 px-5 py-4">
        <CalendarDays className="h-5 w-5 text-brand-teal" />
        <h2 className="font-semibold text-brand-teal-dark">Citas de hoy</h2>
        <span className="ml-auto text-sm text-brand-gray">
          {appointments.length}
        </span>
      </header>

      {appointments.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-brand-gray">
          No hay citas programadas para hoy.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {appointments.map((appointment) => (
            <li
              key={appointment.id}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4"
            >
              <time
                dateTime={appointment.scheduledAt}
                className="w-14 shrink-0 font-semibold tabular-nums text-brand-ink"
              >
                {appointment.time}
              </time>

              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-brand-ink">
                  {appointment.patient.name} {appointment.patient.lastName}
                </p>
                <p className="truncate text-sm text-brand-gray">
                  {appointment.specialty} · {appointment.durationMinutes} min ·{" "}
                  {appointment.doctor.displayName}
                </p>
              </div>

              <a
                href={`tel:${appointment.patient.phone}`}
                className="text-sm text-brand-gray hover:text-brand-ink"
              >
                {appointment.patient.phone}
              </a>

              <AppointmentStatusBadge status={appointment.status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
