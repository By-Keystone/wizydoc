import { Loader2 } from "lucide-react";

/** UI estándar de carga para los `loading.tsx` de cada segmento (Suspense). */
export function LoadingState({ label = "Cargando..." }: { label?: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-brand-gray">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
