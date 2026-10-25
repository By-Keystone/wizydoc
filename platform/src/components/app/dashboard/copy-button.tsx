"use client";

import { Button } from "@/components/ui/button";
import { buildPublicBookingUrl } from "@/lib/helpers";
import { toast } from "@/lib/toast";

interface Props {
  clinicId: string;
}

export const CopyButton = ({ clinicId }: Props) => {
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(
        buildPublicBookingUrl(location.origin, clinicId),
      );
      toast.success("¡Link copiado!");
    } catch {
      toast.error("No pudimos copiar el link desde este navegador.");
    }
  };

  return (
    <Button onClick={handleCopy} size={"sm"} variant={"coral"} className="mb-8">
      Copiar link de reservas
    </Button>
  );
};
