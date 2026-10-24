"use client";

import { Lock, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/context/app/app.context";
import { PLAN_FEATURE_MESSAGE } from "@/lib/api/errors";
import type { Plan } from "@/lib/plans";
import { cn } from "@/lib/utils";

const WHATSAPP_NUMBER = "51993953674";

type RequestablePlan = Extract<Plan, "CONSULTORIO" | "CLINICA">;

const REQUESTABLE_PLAN_NAMES: Record<RequestablePlan, string> = {
  CONSULTORIO: "Consultorio",
  CLINICA: "Clínica",
};

interface Props {
  plan: RequestablePlan;
  className?: string;
}

function whatsAppUrl(message: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

// Se renderiza desde la página y no desde error.tsx: en producción Next oculta
// al error boundary el mensaje y el status de los errores de servidor.
export function PlanFeatureNotice({ plan, className }: Props) {
  const { user, membership } = useApp();
  const planName = REQUESTABLE_PLAN_NAMES[plan];
  const requestMessage = `Hola, soy ${user.name} ${user.lastName} (${user.email}), de ${membership.resourceName}. Quiero activar el plan ${planName} en WizyDoc.`;

  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white p-8 text-center",
        className,
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-100">
        <Lock className="h-6 w-6 text-brand-gray" />
      </div>
      <div>
        <h2 className="text-lg font-semibold text-brand-teal-dark">
          {PLAN_FEATURE_MESSAGE}
        </h2>
        <p className="mt-1 max-w-sm text-sm text-brand-gray">
          Está incluida desde el plan {planName}. Durante la beta, los planes de
          pago se activan a pedido por WhatsApp.
        </p>
      </div>
      <Button asChild>
        <a
          href={whatsAppUrl(requestMessage)}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle className="mr-2 h-4 w-4" />
          Pedir el plan {planName}
        </a>
      </Button>
    </div>
  );
}
