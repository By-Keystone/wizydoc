"use client";

import {
  CalendarCheck,
  CalendarClock,
  CirclePause,
  MessageCircle,
  Users,
} from "lucide-react";
import { TEXT_LINK_CLASS } from "@/components/common/auth-card";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/app/app.context";
import type { BookingUsage } from "@/lib/api/clinic/types";
import {
  formatDayAndMonth,
  formatMonthName,
  type UsageLevel,
  usageLevel,
} from "@/lib/booking-usage";
import { formatPatientContact } from "@/lib/patient-contact";
import { buildPlanRequestUrl, PLAN_NAMES } from "@/lib/plan-request";
import { cn } from "@/lib/utils";
import { PatientContactDialog } from "./patient-contact-dialog";

interface Props {
  usage: BookingUsage;
  clinicId: string;
  isClinicBookable: boolean;
}

const CARD_BUTTON_CLASS = "min-h-10 w-full gap-1.5 sm:min-h-0 sm:w-auto";
const PATIENT_NOTICE =
  "Este consultorio no está recibiendo reservas en línea por ahora";

const LEVEL_ICONS = {
  normal: CalendarCheck,
  near: CalendarClock,
  reached: CirclePause,
} as const;

function describeNextPlan({ nextPlan }: BookingUsage): string {
  if (!nextPlan) return "";
  const name = PLAN_NAMES[nextPlan.plan];
  return nextPlan.monthlyCap === null
    ? `El plan ${name} se arma a la medida de tu red.`
    : `El plan ${name} incluye ${nextPlan.monthlyCap} citas al mes.`;
}

function describeReopening(usage: BookingUsage): string {
  const renewsOn = formatDayAndMonth(usage.renewsOn);
  if (!usage.nextPlan)
    return `Tu link vuelve a recibir reservas el ${renewsOn}.`;
  const name = PLAN_NAMES[usage.nextPlan.plan];
  const allowance =
    usage.nextPlan.monthlyCap === null
      ? "que se arma a la medida de tu red"
      : `que incluye ${usage.nextPlan.monthlyCap} citas al mes`;
  return `Tu link vuelve a recibir reservas el ${renewsOn}, o desde que pases al plan ${name}, ${allowance}.`;
}

function UsageBar({ level, percent }: { level: UsageLevel; percent: number }) {
  return (
    <div
      aria-hidden="true"
      className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-100"
    >
      <div
        className={cn(
          "h-2 rounded-full",
          level === "normal" ? "bg-brand-teal" : "bg-amber-700",
        )}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function RequestPlanButton({
  usage,
  variant,
}: {
  usage: BookingUsage;
  variant: "coral" | "default";
}) {
  const { user, membership } = useApp();
  if (!usage.nextPlan) return null;

  const name = PLAN_NAMES[usage.nextPlan.plan];
  const href = buildPlanRequestUrl(usage.nextPlan.plan, {
    name: user.name,
    lastName: user.lastName,
    email: user.email,
    clinicName: membership.resourceName,
  });

  return (
    <Button asChild size="sm" variant={variant} className={CARD_BUTTON_CLASS}>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <MessageCircle className="h-4 w-4" aria-hidden="true" />
        Pedir el plan {name}
        <span className="sr-only"> (se abre WhatsApp)</span>
      </a>
    </Button>
  );
}

function AddNumberButton({
  clinicId,
  className,
}: {
  clinicId: string;
  className?: string;
}) {
  return (
    <PatientContactDialog
      clinicId={clinicId}
      patientContact={null}
      trigger={
        <Button
          type="button"
          size="sm"
          variant="outline"
          className={cn(CARD_BUTTON_CLASS, "shrink-0", className)}
        >
          Agregar número
        </Button>
      }
    />
  );
}

function PatientsSeeNotice({
  usage,
  clinicId,
}: {
  usage: BookingUsage;
  clinicId: string;
}) {
  const notice = (
    <span className="font-medium text-brand-ink">«{PATIENT_NOTICE}»</span>
  );

  return (
    <div className="mt-3 rounded-lg bg-brand-surface px-3 py-2 text-sm text-brand-gray sm:flex sm:items-center sm:justify-between sm:gap-4 sm:py-2.5">
      {usage.patientContact ? (
        <>
          <p className="min-w-0">
            Tus pacientes ven el aviso {notice} y el número{" "}
            <span className="whitespace-nowrap font-medium text-brand-ink">
              {formatPatientContact(usage.patientContact)}
            </span>
            .
          </p>
          <PatientContactDialog
            clinicId={clinicId}
            patientContact={usage.patientContact}
            trigger={
              <button type="button" className={cn(TEXT_LINK_CLASS, "shrink-0")}>
                Cambiar
                <span className="sr-only"> el número para tus pacientes</span>
              </button>
            }
          />
        </>
      ) : (
        <>
          <p className="min-w-0">
            Tus pacientes ven el aviso {notice} y ningún número para
            contactarte.
          </p>
          <AddNumberButton clinicId={clinicId} className="mt-3 sm:mt-0" />
        </>
      )}
    </div>
  );
}

function MissedBookingsNotice({ count }: { count: number }) {
  return (
    <p className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
      <Users
        className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"
        aria-hidden="true"
      />
      <span>
        {count === 1 ? (
          <>
            Este mes, <strong className="font-semibold">1 paciente</strong>{" "}
            intentó reservar y no pudo.
          </>
        ) : (
          <>
            Este mes,{" "}
            <strong className="font-semibold">{count} pacientes</strong>{" "}
            intentaron reservar y no pudieron.
          </>
        )}
      </span>
    </p>
  );
}

export function BookingUsageCard({ usage, clinicId, isClinicBookable }: Props) {
  const level = usageLevel(usage);
  if (level === null || usage.monthlyCap === null) return null;

  const { monthlyCap, bookedThisMonth } = usage;
  const monthName = formatMonthName(usage.month);
  const renewsOn = formatDayAndMonth(usage.renewsOn);
  const planName = PLAN_NAMES[usage.plan];
  const percent = Math.round(
    (Math.min(bookedThisMonth, monthlyCap) / monthlyCap) * 100,
  );
  const Icon = LEVEL_ICONS[level];

  const tile = (
    <span
      className={cn(
        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
        level === "normal"
          ? "bg-brand-teal/10 text-brand-teal"
          : "bg-amber-50 text-amber-700",
      )}
    >
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
  );

  if (level === "normal") {
    return (
      <section
        aria-labelledby="usage-title"
        className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5"
      >
        <div className="flex gap-3">
          {tile}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <h2
                id="usage-title"
                className="font-semibold text-brand-teal-dark"
              >
                Citas reservadas en {monthName}
              </h2>
              <p className="text-sm text-brand-gray">
                <span className="text-lg font-bold text-brand-ink">
                  {bookedThisMonth}
                </span>{" "}
                de {monthlyCap}
              </p>
            </div>
            <UsageBar level={level} percent={percent} />
            <p className="mt-2 text-sm text-brand-gray">
              Plan {planName} · Se renuevan el {renewsOn}.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (level === "near") {
    return (
      <section
        aria-labelledby="usage-title"
        className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5"
      >
        <div className="flex gap-3">
          {tile}
          <div className="min-w-0 flex-1">
            <h2 id="usage-title" className="font-semibold text-brand-teal-dark">
              Llevas {bookedThisMonth} de las {monthlyCap} citas de tu plan en{" "}
              {monthName}
            </h2>
            <UsageBar level={level} percent={percent} />
            <p className="mt-3 text-sm text-brand-gray">
              Cuando llegues a {monthlyCap}, tu link dejará de recibir reservas
              hasta el {renewsOn}. Las citas ya reservadas no cambian.
            </p>
            <p className="mt-1 text-sm font-medium text-brand-ink">
              {describeNextPlan(usage)}
            </p>
            <div className="mt-3">
              <RequestPlanButton usage={usage} variant="default" />
            </div>
          </div>
        </div>
        {!usage.patientContact && (
          <div className="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <p className="text-sm text-brand-gray">
              Agrega un número para que tus pacientes puedan contactarte cuando
              no recibas reservas.
            </p>
            <AddNumberButton clinicId={clinicId} />
          </div>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="usage-title"
      className="rounded-xl border border-gray-200 bg-white p-4 sm:p-5"
    >
      <div className="flex gap-3">
        {tile}
        <div className="min-w-0 flex-1">
          <h2 id="usage-title" className="font-semibold text-brand-teal-dark">
            Llegaste al tope de {monthlyCap} citas de tu plan {planName}
          </h2>
          <UsageBar level={level} percent={100} />
          <p className="mt-3 text-sm text-brand-gray">
            {describeReopening(usage)}
          </p>
        </div>
      </div>
      {usage.missedThisMonth > 0 && (
        <MissedBookingsNotice count={usage.missedThisMonth} />
      )}
      {isClinicBookable && (
        <PatientsSeeNotice usage={usage} clinicId={clinicId} />
      )}
      <div className="mt-4">
        <RequestPlanButton
          usage={usage}
          variant={isClinicBookable ? "coral" : "default"}
        />
      </div>
    </section>
  );
}
