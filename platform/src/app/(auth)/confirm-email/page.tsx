import { MailCheck } from "lucide-react";
import Link from "next/link";
import { AuthCard, TEXT_LINK_CLASS } from "@/components/common/auth-card";

export default function ConfirmEmailPage() {
  return (
    <AuthCard
      icon={MailCheck}
      title="Revisa tu correo"
      description="Te enviamos un enlace para confirmar tu correo. Ábrelo para activar tu cuenta y seguir con la configuración. Si no lo ves, revisa la carpeta de spam."
      footer={
        <>
          ¿Ya lo confirmaste?{" "}
          <Link href="/login" className={TEXT_LINK_CLASS}>
            Inicia sesión
          </Link>
        </>
      }
    />
  );
}
