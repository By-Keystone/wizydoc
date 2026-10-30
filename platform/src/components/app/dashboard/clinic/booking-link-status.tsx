import {
  CircleCheck,
  CirclePause,
  ExternalLink,
  Link as LinkIcon,
} from "lucide-react";
import Link from "next/link";
import { TEXT_LINK_CLASS } from "@/components/common/auth-card";
import { Button } from "@/components/ui/button";
import { buildPublicBookingUrl } from "@/lib/helpers";
import { CopyButton } from "../copy-button";

interface Props {
  accountId: string;
  clinicId: string;
  clinicName: string;
  isBookable: boolean;
  isAcceptingBookings: boolean;
  canManageUsers: boolean;
  canChangePlan: boolean;
}

function ViewAsPatientButton({ clinicId }: { clinicId: string }) {
  return (
    <Button
      asChild
      size="sm"
      variant="outline"
      className="min-h-10 gap-1.5 sm:min-h-0"
    >
      <a
        href={buildPublicBookingUrl("", clinicId)}
        target="_blank"
        rel="noopener noreferrer"
      >
        Ver como paciente
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="sr-only"> (se abre en una pestaña nueva)</span>
      </a>
    </Button>
  );
}

export function BookingLinkStatus({
  accountId,
  clinicId,
  clinicName,
  isBookable,
  isAcceptingBookings,
  canManageUsers,
  canChangePlan,
}: Props) {
  if (isBookable && !isAcceptingBookings) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
            <CirclePause
              className="h-5 w-5 shrink-0 text-amber-700"
              aria-hidden="true"
            />
            Tu link no está recibiendo reservas este mes.
          </p>
          {!canChangePlan && (
            <p className="mt-1 pl-7 text-sm text-brand-gray">
              Un administrador de tu cuenta puede cambiar de plan.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <CopyButton clinicId={clinicId} variant="outline" />
          <ViewAsPatientButton clinicId={clinicId} />
        </div>
      </div>
    );
  }

  if (isBookable) {
    return (
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <p className="flex items-center gap-2 text-sm font-medium text-brand-teal-dark">
          <CircleCheck
            className="h-5 w-5 shrink-0 text-brand-teal"
            aria-hidden="true"
          />
          Tus pacientes ya pueden reservar desde el link.
        </p>
        <div className="flex flex-wrap gap-2">
          <CopyButton clinicId={clinicId} />
          <ViewAsPatientButton clinicId={clinicId} />
        </div>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:p-5"
    >
      <span className="inline-flex shrink-0 rounded-lg bg-gray-100 p-2 text-brand-gray">
        <LinkIcon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="font-semibold text-brand-teal-dark">
          El link de reservas todavía no funciona
        </h2>
        <p className="mt-1 break-words text-sm text-brand-gray">
          Funciona cuando un médico de {clinicName} tenga especialidad y
          horario.
        </p>
        {canManageUsers && (
          <Link
            href={`/account/${accountId}/clinic/${clinicId}/users`}
            className={`${TEXT_LINK_CLASS} mt-1`}
          >
            Asignar médicos en Usuarios
          </Link>
        )}
      </div>
    </div>
  );
}
