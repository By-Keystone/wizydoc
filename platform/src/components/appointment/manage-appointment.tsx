"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DateTimeStep } from "@/components/booking/datetime-step";
import { formatWhen } from "@/components/booking/week";
import { cancelAppointmentAction } from "@/lib/actions/appointment/cancel-appointment.action";
import { rescheduleAppointmentAction } from "@/lib/actions/appointment/reschedule-appointment.action";
import type {
  ManagedAppointment,
  RescheduleBlock,
} from "@/lib/api/appointments/types";
import { toast } from "@/lib/toast";
import { AppointmentSummary } from "./appointment-summary";

type Screen =
  | "summary"
  | "confirm-cancel"
  | "cancelled"
  | "pick-slot"
  | "confirm-reschedule"
  | "rescheduled"
  | "changed";

interface SlotChoice {
  date: string;
  time: string;
  durationMinutes: number;
}

interface Props {
  token: string;
  appointment: ManagedAppointment;
}

const NOT_FOUND_STATUS = 404;

const RESCHEDULE_BLOCKED_REASON: Record<RescheduleBlock, string> = {
  DEADLINE:
    "Ya no se puede reprogramar porque faltan menos de 12 horas para tu cita. Si no puedes asistir, cancélala y reserva otro horario.",
  LIMIT:
    "Ya reprogramaste esta cita 3 veces. Si necesitas otro horario, cancélala y reserva de nuevo.",
};

const RESCHEDULE_BLOCKED_REASON_ID = "reschedule-blocked-reason";

function initialScreen(appointment: ManagedAppointment): Screen {
  return appointment.status === "CANCELLED" ? "cancelled" : "summary";
}

export function ManageAppointment({ token, appointment: initial }: Props) {
  const router = useRouter();
  const [appointment, setAppointment] = useState(initial);
  const [screen, setScreen] = useState<Screen>(() => initialScreen(initial));
  const [choice, setChoice] = useState<SlotChoice | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [retryDate, setRetryDate] = useState<string | undefined>();
  const [pickAttempt, setPickAttempt] = useState(0);
  const [isPending, setIsPending] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const shownScreen = useRef(screen);

  useEffect(() => {
    if (shownScreen.current === screen) return;
    shownScreen.current = screen;
    const heading = containerRef.current?.querySelector<HTMLElement>("h1, h2");
    heading?.setAttribute("tabindex", "-1");
    heading?.focus();
  }, [screen]);

  const shownScheduledAt = `${appointment.date}T${appointment.time}`;
  const doctorName = `Dr. ${appointment.doctorName}`;
  const summaryProps = {
    specialty: appointment.specialty,
    doctorName,
    date: appointment.date,
    time: appointment.time,
    durationMinutes: appointment.durationMinutes,
    clinicName: appointment.clinicName,
    clinicAddress: appointment.clinicAddress,
  };

  async function cancel() {
    setIsPending(true);
    const result = await cancelAppointmentAction(token, shownScheduledAt);
    setIsPending(false);

    if (result.status === "success") {
      setAppointment(result.appointment);
      setScreen("cancelled");
      toast.success("Tu cita fue cancelada");
      return;
    }

    if (result.conflict === "APPOINTMENT_CHANGED") {
      setScreen("changed");
      return;
    }

    toast.error(result.message);
    if (result.httpStatus === NOT_FOUND_STATUS) router.refresh();
  }

  async function reschedule() {
    if (!choice) return;

    setIsPending(true);
    const result = await rescheduleAppointmentAction(
      token,
      `${choice.date}T${choice.time}`,
      shownScheduledAt,
    );
    setIsPending(false);

    if (result.status === "success") {
      setAppointment(result.appointment);
      setScreen("rescheduled");
      toast.success("Tu cita cambió de horario");
      return;
    }

    if (result.conflict === "SLOT_TAKEN") {
      setPickError(result.message);
      setRetryDate(choice.date);
      setPickAttempt((attempt) => attempt + 1);
      setChoice(null);
      setScreen("pick-slot");
      return;
    }

    if (result.conflict === "APPOINTMENT_CHANGED") {
      setScreen("changed");
      return;
    }

    toast.error(result.message);
    if (
      result.conflict === "RESCHEDULE_NOT_ALLOWED" ||
      result.httpStatus === NOT_FOUND_STATUS
    )
      router.refresh();
  }

  function startPicking() {
    setChoice(null);
    setPickError(null);
    setRetryDate(undefined);
    setScreen("pick-slot");
  }

  function reload() {
    setScreen(initialScreen(appointment));
    router.refresh();
  }

  const blockedBy = appointment.rescheduleBlockedBy;

  return (
    <div ref={containerRef} className="w-full max-w-md">
      <Card className="p-6 sm:p-8">
        {screen === "summary" && (
          <div>
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-bold text-brand-teal-dark">
                Hola, {appointment.patientFirstName}
              </h1>
              <Badge variant="gray">Pendiente</Badge>
            </div>
            <p className="mt-1 text-sm text-brand-gray">
              Esta es tu cita. Puedes cancelarla hasta la hora de inicio y
              reprogramarla hasta 12 horas antes.
            </p>
            <AppointmentSummary {...summaryProps} />
            <div className="mt-6 flex flex-col gap-3">
              <Button
                type="button"
                className="h-11 w-full"
                disabled={blockedBy !== null}
                aria-describedby={
                  blockedBy ? RESCHEDULE_BLOCKED_REASON_ID : undefined
                }
                onClick={startPicking}
              >
                Reprogramar
              </Button>
              {blockedBy && (
                <p
                  id={RESCHEDULE_BLOCKED_REASON_ID}
                  className="-mt-1 text-[13px] leading-snug text-brand-gray"
                >
                  {RESCHEDULE_BLOCKED_REASON[blockedBy]}
                </p>
              )}
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={() => setScreen("confirm-cancel")}
              >
                Cancelar cita
              </Button>
            </div>
          </div>
        )}

        {screen === "confirm-cancel" && (
          <div>
            <h1 className="text-xl font-bold text-brand-teal-dark">
              ¿Cancelar tu cita?
            </h1>
            <p className="mt-1 text-sm text-brand-gray">
              El horario quedará libre para otro paciente. Esta acción no se
              puede deshacer.
            </p>
            <AppointmentSummary {...summaryProps} muted />
            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                disabled={isPending}
                onClick={() => setScreen("summary")}
              >
                Volver
              </Button>
              <Button
                type="button"
                variant="coral"
                className="h-11 flex-1"
                disabled={isPending}
                onClick={cancel}
              >
                {isPending ? "Procesando..." : "Sí, cancelar"}
              </Button>
            </div>
          </div>
        )}

        {screen === "cancelled" && (
          <div>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
              <XCircle className="h-7 w-7 text-brand-gray" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-brand-teal-dark">
                Tu cita está cancelada
              </h1>
              <p className="mt-1 text-sm text-brand-gray">
                El horario quedó libre para otro paciente.
              </p>
            </div>
            <AppointmentSummary {...summaryProps} muted />
            <p className="mt-4 text-center text-[13px] text-brand-gray">
              Te enviamos la confirmación por correo.
            </p>
            <div className="mt-6">
              <Button asChild className="h-11 w-full">
                <Link
                  href={`/clinic/${appointment.clinicId}/create-appointment`}
                >
                  Reservar otro horario
                </Link>
              </Button>
            </div>
          </div>
        )}

        {screen === "pick-slot" && (
          <DateTimeStep
            key={pickAttempt}
            doctorProfileId={appointment.doctorProfileId}
            initialDate={retryDate ?? choice?.date}
            headingLevel="h1"
            notice={
              <>
                <p className="mt-4 rounded-[10px] border border-dashed border-slate-300 bg-white px-3 py-2.5 text-[13px] text-brand-gray">
                  Tu cita actual:{" "}
                  <strong className="text-brand-ink">
                    {formatWhen(appointment.date, appointment.time)}
                  </strong>
                </p>
                {pickError && (
                  <div
                    role="alert"
                    className="mt-4 flex gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-[13.5px] leading-snug text-red-700"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-none" />
                    <span>{pickError}</span>
                  </div>
                )}
              </>
            }
            hint={
              <p className="mt-4 text-[13px] leading-snug text-brand-gray">
                ¿No encuentras un horario? Puedes{" "}
                <button
                  type="button"
                  className="font-semibold text-brand-teal underline underline-offset-4"
                  onClick={() => setScreen("confirm-cancel")}
                >
                  cancelar tu cita
                </button>{" "}
                y reservar más adelante.
              </p>
            }
            onNext={(selection) => {
              setChoice(selection);
              setRetryDate(undefined);
              setPickError(null);
              setScreen("confirm-reschedule");
            }}
            onBack={() => setScreen("summary")}
          />
        )}

        {screen === "confirm-reschedule" && choice && (
          <div>
            <h1 className="text-xl font-bold text-brand-teal-dark">
              ¿Cambiar tu cita a este horario?
            </h1>
            <p className="mt-1 text-sm text-brand-gray">
              {appointment.specialty} con {doctorName}, en{" "}
              {appointment.clinicName}.
            </p>
            <div className="mt-5 grid gap-2.5">
              <div className="rounded-xl border border-gray-200 bg-white px-3.5 py-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-brand-gray">
                  Antes
                </div>
                <div className="mt-0.5 text-[15px] text-brand-gray line-through">
                  {formatWhen(appointment.date, appointment.time)}
                </div>
              </div>
              <div className="rounded-xl border border-brand-teal bg-brand-teal/5 px-3.5 py-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-brand-gray">
                  Ahora
                </div>
                <div className="mt-0.5 text-[15px] font-bold text-brand-teal-dark">
                  {formatWhen(choice.date, choice.time)}
                </div>
              </div>
            </div>
            <p className="mt-2 text-[13px] text-brand-gray">
              El horario anterior quedará libre para otro paciente.
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="h-11 flex-1"
                disabled={isPending}
                onClick={() => setScreen("pick-slot")}
              >
                Elegir otro
              </Button>
              <Button
                type="button"
                className="h-11 flex-1"
                disabled={isPending}
                onClick={reschedule}
              >
                {isPending ? "Procesando..." : "Confirmar cambio"}
              </Button>
            </div>
          </div>
        )}

        {screen === "rescheduled" && (
          <div>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
              <CheckCircle className="h-7 w-7 text-green-600" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-brand-teal-dark">
                Listo, tu cita cambió
              </h1>
              <p className="mt-1 text-sm text-brand-gray">
                Te enviamos los detalles por correo. Este mismo enlace sigue
                sirviendo para tu nueva cita.
              </p>
            </div>
            <AppointmentSummary {...summaryProps} />
            <div className="mt-6">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full"
                onClick={() => setScreen("summary")}
              >
                Ver mi cita
              </Button>
            </div>
          </div>
        )}

        {screen === "changed" && (
          <div>
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
              <AlertTriangle className="h-7 w-7 text-red-500" />
            </div>
            <div className="text-center">
              <h1 className="text-xl font-bold text-brand-teal-dark">
                Tu cita cambió mientras elegías
              </h1>
              <p role="alert" className="mt-1 text-sm text-brand-gray">
                Alguien canceló o reprogramó esta cita desde otra pestaña o
                dispositivo. Recarga para ver cómo quedó.
              </p>
            </div>
            <div className="mt-6">
              <Button type="button" className="h-11 w-full" onClick={reload}>
                Recargar
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
