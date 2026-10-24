"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CalendarOff,
  CheckCircle,
  Clock,
  Loader2,
  XCircle,
} from "lucide-react";
import {
  AppointmentSummary,
  ChangeComparison,
  type Moment,
} from "@/components/booking/appointment-summary";
import { DateTimeStep } from "@/components/booking/datetime-step";
import { formatWhen } from "@/components/booking/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ActionFailure } from "@/lib/actions/types";
import { cancelAppointmentAction } from "@/lib/actions/appointment/cancel-appointment.action";
import { getRescheduleSlotsAction } from "@/lib/actions/appointment/get-reschedule-slots.action";
import { getRescheduleAvailabilityAction } from "@/lib/actions/appointment/get-reschedule-availability.action";
import { rescheduleAppointmentAction } from "@/lib/actions/appointment/reschedule-appointment.action";
import type {
  AppointmentPortal,
  CancellationReason,
} from "@/lib/api/appointments/types";
import { CANCELLATION_REASONS } from "./cancellation-reasons";
import { LinkUnavailable } from "./link-unavailable";

type View =
  | "summary"
  | "confirm-cancel"
  | "cancelled"
  | "no-slots"
  | "pick"
  | "confirm-reschedule"
  | "rescheduled"
  | "race"
  | "link-unavailable";

const DEADLINE_MESSAGE =
  "Ya no puedes cambiar esta cita desde este enlace porque faltan menos de 12 horas.";
const LIMIT_MESSAGE =
  "Esta cita ya se reprogramó una vez y no se puede volver a reprogramar. Si necesitas otro horario, cancélala y reserva de nuevo.";
const GENERIC_ERROR_MESSAGE = "Ha ocurrido un error. Vuelve a intentarlo.";

function isAlreadyCancelled(appointment: AppointmentPortal): boolean {
  return appointment.status === "CANCELLED";
}

function isWithinDeadline(appointment: AppointmentPortal): boolean {
  return (
    appointment.rescheduleBlockedBy === "DEADLINE" || !appointment.canCancel
  );
}

function ProcessingLabel({
  label,
  pending,
}: {
  label: string;
  pending: boolean;
}) {
  if (!pending) return label;
  return (
    <>
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      Procesando...
    </>
  );
}

function StatusBadge({ status }: { status: AppointmentPortal["status"] }) {
  if (status === "CANCELLED") return <Badge variant="gray">Cancelada</Badge>;
  if (status === "CONFIRMED") return <Badge variant="green">Confirmada</Badge>;
  return (
    <Badge variant="gray" className="bg-amber-50 text-amber-700">
      Pendiente
    </Badge>
  );
}

function IconTile({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${className}`}
    >
      {children}
    </div>
  );
}

function ErrorNotice({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="mt-4 flex gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-[13.5px] leading-snug text-red-700"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
      <span>{message}</span>
    </div>
  );
}

function LinkButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="font-semibold text-brand-teal underline underline-offset-[3px]"
    >
      {children}
    </button>
  );
}

function CurrentAppointmentNote({
  appointment,
}: {
  appointment: AppointmentPortal;
}) {
  return (
    <div className="mt-4 rounded-[10px] border border-dashed border-slate-300 bg-white px-3 py-2.5 text-[13px] leading-relaxed text-brand-gray">
      Tu cita actual:{" "}
      <strong className="text-brand-ink">
        {formatWhen(appointment.date, appointment.time)}
      </strong>
      <br />
      con {appointment.doctorName}
    </div>
  );
}

function CancellationReasonField({
  selected,
  disabled,
  onSelect,
}: {
  selected: CancellationReason | null;
  disabled: boolean;
  onSelect: (reason: CancellationReason) => void;
}) {
  return (
    <fieldset disabled={disabled} className="mt-5 min-w-0 border-0 p-0">
      <legend className="p-0 text-sm font-semibold text-brand-ink">
        ¿Por qué cancelas?
      </legend>
      <div className="mt-2 grid gap-2">
        {CANCELLATION_REASONS.map(({ code, label }) => (
          <label
            key={code}
            className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-[14.5px] text-brand-ink hover:bg-gray-50 has-[:checked]:border-brand-teal has-[:checked]:bg-brand-teal/10 has-[:checked]:font-semibold has-[:checked]:text-brand-teal-dark has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2"
          >
            <input
              type="radio"
              name="cancellation-reason"
              value={code}
              checked={selected === code}
              onChange={() => onSelect(code)}
              className="h-[18px] w-[18px] flex-none accent-brand-teal"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

interface Props {
  token: string;
  initialAppointment: AppointmentPortal;
}

export function AppointmentPortalView({ token, initialAppointment }: Props) {
  const [appointment, setAppointment] = useState(initialAppointment);
  const [view, setView] = useState<View>(
    isAlreadyCancelled(initialAppointment) ? "cancelled" : "summary",
  );
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [slotTakenMessage, setSlotTakenMessage] = useState<string | null>(null);
  const [selection, setSelection] = useState<Moment | null>(null);
  const [change, setChange] = useState<{
    before: Moment;
    after: Moment;
  } | null>(null);
  const [pickAttempt, setPickAttempt] = useState(0);
  const [cancellationReason, setCancellationReason] =
    useState<CancellationReason | null>(null);

  const seenScheduledAt = `${appointment.date}T${appointment.time}`;

  const goTo = (next: View) => {
    setErrorMessage(null);
    if (next === "confirm-cancel") setCancellationReason(null);
    setView(next);
  };

  const handleFailure = (failure: ActionFailure) => {
    const message =
      failure.status === "error" ? failure.message : GENERIC_ERROR_MESSAGE;
    const code = failure.status === "error" ? failure.code : undefined;

    switch (code) {
      case "NOT_FOUND":
        return goTo("link-unavailable");
      case "APPOINTMENT_CHANGED":
        return goTo("race");
      case "CANCEL_NOT_ALLOWED":
      case "RESCHEDULE_NOT_ALLOWED":
        return window.location.reload();
      case "SLOT_TAKEN":
        setSlotTakenMessage(message);
        setSelection(null);
        setPickAttempt((attempt) => attempt + 1);
        return goTo("pick");
      default:
        setErrorMessage(message);
    }
  };

  const startReschedule = async () => {
    setIsPending(true);
    setErrorMessage(null);
    const result = await getRescheduleAvailabilityAction(token);
    setIsPending(false);

    if (result.status !== "success") return handleFailure(result);
    setSlotTakenMessage(null);
    setSelection(null);
    goTo(result.data ? "pick" : "no-slots");
  };

  const confirmCancel = async () => {
    if (!cancellationReason) return;
    setIsPending(true);
    setErrorMessage(null);
    const result = await cancelAppointmentAction(
      token,
      seenScheduledAt,
      cancellationReason,
    );
    setIsPending(false);

    if (result.status !== "success") return handleFailure(result);
    setAppointment(result.data);
    goTo("cancelled");
  };

  const confirmReschedule = async () => {
    if (!selection) return;
    setIsPending(true);
    setErrorMessage(null);
    const result = await rescheduleAppointmentAction(
      token,
      `${selection.date}T${selection.time}`,
      seenScheduledAt,
    );
    setIsPending(false);

    if (result.status !== "success") return handleFailure(result);
    setChange({
      before: { date: appointment.date, time: appointment.time },
      after: selection,
    });
    setAppointment(result.data);
    goTo("rescheduled");
  };

  if (view === "link-unavailable") return <LinkUnavailable />;

  if (view === "summary") {
    const isLimitReached = appointment.rescheduleBlockedBy === "LIMIT";

    return (
      <Card className="w-full max-w-md p-6">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-brand-teal-dark">
            Hola, {appointment.patientName}
          </h1>
          <StatusBadge status={appointment.status} />
        </div>

        {isWithinDeadline(appointment) ? (
          <>
            <p className="mt-1 text-sm text-brand-gray">Esta es tu cita.</p>
            <div
              role="status"
              className="mt-4 flex gap-2 rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13.5px] leading-snug text-amber-800"
            >
              <Clock className="mt-0.5 h-4 w-4 flex-none" />
              <span>{DEADLINE_MESSAGE}</span>
            </div>
            <AppointmentSummary appointment={appointment} />
          </>
        ) : (
          <>
            <p className="mt-1 text-sm leading-relaxed text-brand-gray">
              Esta es tu cita. Puedes cancelarla o reprogramarla hasta 12 horas
              antes. Solo se puede reprogramar una vez.
            </p>
            <AppointmentSummary appointment={appointment} />
            {errorMessage && <ErrorNotice message={errorMessage} />}
            <div className="mt-6 flex flex-col gap-3">
              <Button
                type="button"
                className="h-11 w-full"
                disabled={isLimitReached || isPending}
                aria-describedby={isLimitReached ? "limit-reason" : undefined}
                onClick={startReschedule}
              >
                <ProcessingLabel label="Reprogramar" pending={isPending} />
              </Button>
              {isLimitReached && (
                <p
                  id="limit-reason"
                  className="-mt-1 text-[13px] leading-snug text-brand-gray"
                >
                  {LIMIT_MESSAGE}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                disabled={isPending}
                onClick={() => goTo("confirm-cancel")}
              >
                Cancelar cita
              </Button>
            </div>
          </>
        )}
      </Card>
    );
  }

  if (view === "confirm-cancel") {
    return (
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-bold text-brand-teal-dark">
          ¿Cancelar tu cita?
        </h1>
        <p className="mt-1 text-sm leading-relaxed text-brand-gray">
          El horario quedará libre para otro paciente. Esta acción no se puede
          deshacer.
        </p>
        <AppointmentSummary appointment={appointment} muted />
        <CancellationReasonField
          selected={cancellationReason}
          disabled={isPending}
          onSelect={setCancellationReason}
        />
        {!cancellationReason && (
          <p
            id="cancellation-reason-hint"
            className="mt-2 text-[13px] leading-snug text-brand-gray"
          >
            Elige un motivo para continuar.
          </p>
        )}
        {errorMessage && <ErrorNotice message={errorMessage} />}
        <div className="mt-6 flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1"
            disabled={isPending}
            onClick={() => goTo("summary")}
          >
            Volver
          </Button>
          <Button
            type="button"
            variant="coral"
            className="h-11 flex-1"
            disabled={isPending || !cancellationReason}
            aria-describedby={
              cancellationReason ? undefined : "cancellation-reason-hint"
            }
            onClick={confirmCancel}
          >
            <ProcessingLabel label="Sí, cancelar" pending={isPending} />
          </Button>
        </div>
      </Card>
    );
  }

  if (view === "cancelled") {
    return (
      <Card className="w-full max-w-md p-6">
        <IconTile className="bg-gray-100">
          <XCircle className="h-7 w-7 text-brand-gray" />
        </IconTile>
        <div className="text-center">
          <h1 className="text-xl font-bold text-brand-teal-dark">
            Tu cita está cancelada
          </h1>
          <p className="mt-1 text-sm text-brand-gray">
            El horario quedó libre para otro paciente.
          </p>
        </div>
        <AppointmentSummary appointment={appointment} muted />
        <p className="mt-4 text-center text-[13px] text-brand-gray">
          Te enviamos la confirmación por correo.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button asChild className="h-11 w-full">
            <Link href={`/clinic/${appointment.clinicId}/create-appointment`}>
              Reservar otro horario
            </Link>
          </Button>
        </div>
      </Card>
    );
  }

  if (view === "no-slots") {
    return (
      <Card className="w-full max-w-md p-6">
        <IconTile className="bg-gray-100">
          <CalendarOff className="h-7 w-7 text-brand-gray" />
        </IconTile>
        <div className="text-center">
          <h1 className="text-xl font-bold text-brand-teal-dark">
            No hay horarios disponibles
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-brand-gray">
            Ni {appointment.doctorName} ni otros médicos de{" "}
            {appointment.specialty} en esta sede tienen horarios libres en las
            próximas semanas.
          </p>
          <p className="mt-2 text-[13px] leading-snug text-brand-gray">
            Si no puedes asistir a tu cita, cancélala y reserva de nuevo cuando
            haya horarios.
          </p>
        </div>
        <CurrentAppointmentNote appointment={appointment} />
        <div className="mt-6 flex flex-col gap-3">
          <Button
            type="button"
            className="h-11 w-full"
            onClick={() => goTo("confirm-cancel")}
          >
            Cancelar y reservar de nuevo
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => goTo("summary")}
          >
            Mantener mi cita
          </Button>
        </div>
      </Card>
    );
  }

  if (view === "pick") {
    return (
      <Card className="w-full max-w-md p-6">
        <DateTimeStep
          key={pickAttempt}
          slotsSourceId={token}
          loadSlots={getRescheduleSlotsAction}
          description={`Solo ves los horarios libres de ${appointment.doctorName}.`}
          emptyDayMessage="No hay horarios disponibles ese día."
          intro={
            <>
              <CurrentAppointmentNote appointment={appointment} />
              {slotTakenMessage && <ErrorNotice message={slotTakenMessage} />}
            </>
          }
          hint={
            <p className="mt-4 text-[13px] leading-snug text-brand-gray">
              ¿No encuentras un horario? Puedes{" "}
              <LinkButton onClick={() => goTo("confirm-cancel")}>
                cancelar tu cita
              </LinkButton>{" "}
              y reservar más adelante.
            </p>
          }
          onBack={() => goTo("summary")}
          onNext={({ date, time }) => {
            setSlotTakenMessage(null);
            setSelection({ date, time });
            goTo("confirm-reschedule");
          }}
        />
      </Card>
    );
  }

  if (view === "confirm-reschedule" && selection) {
    return (
      <Card className="w-full max-w-md p-6">
        <h1 className="text-xl font-bold text-brand-teal-dark">
          ¿Cambiar tu cita a este horario?
        </h1>
        <p className="mt-1 text-sm text-brand-gray">
          {appointment.specialty} con {appointment.doctorName}, en{" "}
          {appointment.clinicName}.
        </p>
        <ChangeComparison
          before={{ date: appointment.date, time: appointment.time }}
          after={selection}
        />
        <p className="mt-2 text-[13px] leading-snug text-brand-gray">
          El horario anterior quedará libre para otro paciente. Solo puedes
          reprogramar una vez: después de este cambio, solo podrás cancelar.
        </p>
        {errorMessage && <ErrorNotice message={errorMessage} />}
        <div className="mt-6 flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1"
            disabled={isPending}
            onClick={() => goTo("pick")}
          >
            Elegir otro
          </Button>
          <Button
            type="button"
            className="h-11 flex-1"
            disabled={isPending}
            onClick={confirmReschedule}
          >
            <ProcessingLabel label="Confirmar cambio" pending={isPending} />
          </Button>
        </div>
      </Card>
    );
  }

  if (view === "rescheduled" && change) {
    return (
      <Card className="w-full max-w-md p-6">
        <IconTile className="bg-green-100">
          <CheckCircle className="h-7 w-7 text-green-600" />
        </IconTile>
        <div className="text-center">
          <h1 className="text-xl font-bold text-brand-teal-dark">
            Listo, tu cita cambió
          </h1>
          <p className="mt-1 text-sm leading-relaxed text-brand-gray">
            Te enviamos los detalles por correo. Este mismo enlace sigue
            sirviendo para tu nueva cita.
          </p>
        </div>
        <ChangeComparison before={change.before} after={change.after} />
        <AppointmentSummary appointment={appointment} />
        <div className="mt-6 flex flex-col gap-3">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full"
            onClick={() => goTo("summary")}
          >
            Ver mi cita
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md p-6">
      <IconTile className="bg-red-50">
        <AlertTriangle className="h-7 w-7 text-red-500" />
      </IconTile>
      <div className="text-center">
        <h1 className="text-xl font-bold text-brand-teal-dark">
          Tu cita cambió mientras elegías
        </h1>
        <p
          role="alert"
          className="mt-1 text-sm leading-relaxed text-brand-gray"
        >
          Alguien canceló o reprogramó esta cita desde otra pestaña o
          dispositivo. Recarga para ver cómo quedó.
        </p>
      </div>
      <div className="mt-6 flex flex-col gap-3">
        <Button
          type="button"
          className="h-11 w-full"
          onClick={() => window.location.reload()}
        >
          Recargar
        </Button>
      </div>
    </Card>
  );
}
