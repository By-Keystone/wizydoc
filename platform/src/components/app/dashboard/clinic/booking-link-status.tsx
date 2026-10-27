import { CircleCheck, ExternalLink, Link as LinkIcon } from "lucide-react";
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
  canManageUsers: boolean;
}

export function BookingLinkStatus({
  accountId,
  clinicId,
  clinicName,
  isBookable,
  canManageUsers,
}: Props) {
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
