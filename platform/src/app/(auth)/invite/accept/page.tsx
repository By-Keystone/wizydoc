import { XCircle } from "lucide-react";
import Link from "next/link";
import { getInvitation } from "@/lib/api/invitations";
import { AcceptInviteForm } from "./accept-form";

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function AcceptInvitePage({ searchParams }: Props) {
  const { token } = await searchParams;

  const invitation = token ? await getInvitation(token) : null;

  if (!token || !invitation) {
    return (
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-xl">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-100">
            <XCircle className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-brand-teal-dark">
            Invitación inválida
          </h1>
          <p className="mt-2 text-sm text-brand-gray">
            Este enlace de invitación no es válido o ya expiró.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block text-sm font-medium text-brand-teal hover:text-brand-teal-dark"
          >
            Ir a iniciar sesión
          </Link>
        </div>
      </div>
    );
  }

  return (
    <AcceptInviteForm
      token={token}
      name={invitation.name}
      resourceName={invitation.resourceName}
    />
  );
}
