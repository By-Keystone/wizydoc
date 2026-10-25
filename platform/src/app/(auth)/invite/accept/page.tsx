import { XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, TEXT_LINK_CLASS } from "@/components/common/auth-card";
import { getInvitation } from "@/lib/api/invitations";
import { AcceptInviteForm } from "./accept-form";

// El token de la invitación es la credencial: ni se indexa ni viaja en el Referer.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function AcceptInvitePage({ searchParams }: Props) {
  const { token } = await searchParams;

  const lookup = token ? await getInvitation(token) : null;

  if (!token || lookup?.status !== "valid") {
    const isExpired = lookup?.status === "expired";

    return (
      <AuthCard
        icon={XCircle}
        tone="danger"
        title={isExpired ? "Invitación expirada" : "Invitación inválida"}
        description={
          isExpired
            ? "Este enlace expiró. Pide a quien te invitó que te envíe una invitación nueva."
            : "Este enlace ya se usó o no es válido. Si ya creaste tu contraseña, inicia sesión con ella."
        }
        footer={
          <Link href="/login" className={TEXT_LINK_CLASS}>
            Ir a iniciar sesión
          </Link>
        }
      />
    );
  }

  const { invitation } = lookup;

  return (
    <AcceptInviteForm
      token={token}
      name={invitation.name}
      resourceName={invitation.resourceName}
      step={invitation.step}
    />
  );
}
