import type { Plan } from "@/lib/plans";

const WIZYDOC_WHATSAPP_NUMBER = "51993953674";

export const PLAN_NAMES: Record<Plan, string> = {
  FREE: "Gratis",
  CONSULTORIO: "Consultorio",
  CLINICA: "Clínica",
  RED: "Red",
};

interface PlanRequester {
  name: string;
  lastName: string;
  email: string;
  clinicName: string;
}

export function buildPlanRequestUrl(
  plan: Plan,
  { name, lastName, email, clinicName }: PlanRequester,
): string {
  const message = `Hola, soy ${name} ${lastName} (${email}), de ${clinicName}. Quiero activar el plan ${PLAN_NAMES[plan]} en WizyDoc.`;
  return `https://wa.me/${WIZYDOC_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}
