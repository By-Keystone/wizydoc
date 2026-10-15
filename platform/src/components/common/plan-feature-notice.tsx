import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLAN_FEATURE_MESSAGE } from "@/lib/api/errors";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

// Se renderiza desde la página y no desde error.tsx: en producción Next oculta
// al error boundary el mensaje y el status de los errores de servidor.
export function PlanFeatureNotice({ className }: Props) {
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
          Mejora tu plan para acceder a ella.
        </p>
      </div>
      <Button type="button">Mejorar mi plan</Button>
    </div>
  );
}
