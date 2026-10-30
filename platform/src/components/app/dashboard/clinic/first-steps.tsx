import { Check, Lock } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

type StepStatus = "done" | "pending" | "locked";

const STATUS_TEXT: Record<StepStatus, string> = {
  done: "Listo",
  pending: "Pendiente",
  locked: "Disponible al completar los pasos anteriores",
};

interface Props {
  accountId: string;
  clinicId: string;
  clinicName: string;
  specialties: string[];
  hasSchedule: boolean;
  canEditSpecialties: boolean;
  isClinicBookable: boolean;
  isAcceptingBookings: boolean;
}

interface StepProps {
  status: StepStatus;
  number: number;
  title: string;
  detail: string;
  action?: ReactNode;
}

function StepMarker({ status, number }: Pick<StepProps, "status" | "number">) {
  if (status === "done") {
    return (
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-teal text-white">
        <Check className="h-4 w-4" aria-hidden="true" />
      </span>
    );
  }

  if (status === "locked") {
    return (
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-gray-300 text-xs font-semibold text-brand-gray"
    >
      {number}
    </span>
  );
}

function Step({ status, number, title, detail, action }: StepProps) {
  return (
    <li className="flex gap-3 px-4 py-4 sm:px-5">
      <StepMarker status={status} number={number} />
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p
            className={`text-sm font-medium ${status === "locked" ? "text-brand-gray" : "text-brand-ink"}`}
          >
            {title}
            <span className="sr-only">. {STATUS_TEXT[status]}.</span>
          </p>
          <p className="mt-0.5 break-words text-sm text-brand-gray">{detail}</p>
        </div>
        {action}
      </div>
    </li>
  );
}

function StepLink({
  href,
  variant,
  children,
}: {
  href: string;
  variant: "coral" | "default" | "outline";
  children: ReactNode;
}) {
  return (
    <Button
      asChild
      size="sm"
      variant={variant}
      className="min-h-10 w-full shrink-0 sm:min-h-0 sm:w-auto"
    >
      <Link href={href}>{children}</Link>
    </Button>
  );
}

export function FirstSteps({
  accountId,
  clinicId,
  clinicName,
  specialties,
  hasSchedule,
  canEditSpecialties,
  isClinicBookable,
  isAcceptingBookings,
}: Props) {
  const hasSpecialty = specialties.length > 0;
  const hasSpecialtyAction = !hasSpecialty && canEditSpecialties;
  const pendingCount = (hasSpecialty ? 0 : 1) + (hasSchedule ? 0 : 1);
  if (pendingCount === 0) return null;

  const clinicPath = `/account/${accountId}/clinic/${clinicId}`;
  // Un solo coral por pantalla: si el link ya funciona, el coral es «Copiar link de reservas» o, con el link cerrado, pedir el plan.
  const firstActionVariant = isClinicBookable ? "default" : "coral";
  const scheduleActionVariant = hasSpecialtyAction
    ? "outline"
    : firstActionVariant;

  const missing =
    pendingCount === 1 ? "Te falta 1 paso" : `Te faltan ${pendingCount} pasos`;
  const title = isClinicBookable
    ? `${missing} para aparecer en el link de reservas`
    : `${missing} para recibir citas`;
  const otherDoctorsStatus = isAcceptingBookings
    ? "ya recibe citas con otros médicos"
    : "ya tiene otros médicos";
  const description = isClinicBookable
    ? `El link de ${clinicName} ${otherDoctorsStatus}.`
    : "Mientras tanto, tu link de reservas no funciona: quien lo abra no podrá reservar.";

  return (
    <section
      aria-labelledby="first-steps-title"
      className="rounded-xl border border-gray-200 bg-white"
    >
      <header className="border-b border-gray-200 px-4 py-4 sm:px-5">
        <h2
          id="first-steps-title"
          className="font-semibold text-brand-teal-dark"
        >
          {title}
        </h2>
        <p className="mt-1 break-words text-sm text-brand-gray">
          {description}
        </p>
      </header>

      <ol className="divide-y divide-gray-100">
        {hasSpecialty ? (
          <Step
            status="done"
            number={1}
            title="Elige tu especialidad"
            detail={specialties.join(", ")}
          />
        ) : (
          <Step
            status="pending"
            number={1}
            title="Elige tu especialidad"
            detail={
              canEditSpecialties
                ? "Tus pacientes la ven al reservar."
                : `Te la asigna un administrador de ${clinicName}.`
            }
            action={
              hasSpecialtyAction && (
                <StepLink
                  href={`${clinicPath}/me`}
                  variant={firstActionVariant}
                >
                  Elegir especialidad
                </StepLink>
              )
            }
          />
        )}

        {hasSchedule ? (
          <Step
            status="done"
            number={2}
            title="Define tu horario de atención"
            detail="Horario guardado."
          />
        ) : (
          <Step
            status="pending"
            number={2}
            title="Define tu horario de atención"
            detail="Elige los días y las horas en que atiendes. Tus pacientes solo podrán reservar en esos horarios."
            action={
              <StepLink
                href={`${clinicPath}/profile/availability`}
                variant={scheduleActionVariant}
              >
                Definir horario
              </StepLink>
            }
          />
        )}

        {!isClinicBookable && (
          <Step
            status="locked"
            number={3}
            title="Comparte tu link de reservas"
            detail="Cuando completes los pasos, aquí copias tu link para enviarlo por WhatsApp o ponerlo en tus redes."
          />
        )}
      </ol>
    </section>
  );
}
