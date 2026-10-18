"use client";

import { setResource } from "@/lib/actions/account/set-resource.action";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import type { MouseEvent } from "react";

interface Props {
  accountId: string;
  clinicId: string;
}

export function ClinicAvailabilityLink({ accountId, clinicId }: Props) {
  const router = useRouter();
  const href = `/account/${accountId}/clinic/${clinicId}/profile/availability`;

  // La cookie de sede activa debe coincidir con la sede a la que se entra.
  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    const opensElsewhere =
      event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey;
    if (opensElsewhere) return;

    event.preventDefault();
    try {
      await setResource(clinicId, "CLINIC");
      router.push(href);
    } catch {
      toast.error("No pudimos abrir la sede. Vuelve a intentarlo.");
    }
  };

  return (
    <a
      href={href}
      onClick={handleClick}
      className="text-[13px] font-semibold text-brand-teal hover:underline hover:underline-offset-[3px]"
    >
      Mi disponibilidad en esta sede →
    </a>
  );
}
