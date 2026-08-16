"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/common/form";
import { toast } from "@/lib/toast";

export interface BookingPatient {
  name: string;
  lastName: string;
  phone: string;
  email: string;
}

interface Props {
  specialtyName: string;
  doctorName: string;
  date: string;
  time: string;
  onNext: (patient: BookingPatient) => Promise<void>;
  onBack: () => void;
}

export function PatientStep({
  specialtyName,
  doctorName,
  date,
  time,
  onNext,
  onBack,
}: Props) {
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const formData = new FormData(event.currentTarget);

    try {
      await onNext({
        name: formData.get("name") as string,
        lastName: formData.get("lastName") as string,
        phone: formData.get("phone") as string,
        email: formData.get("email") as string,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo confirmar la cita",
      );
      setPending(false);
    }
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-brand-teal-dark">Tus datos</h2>
      <p className="mt-1 text-sm text-brand-gray">
        Completa tus datos para confirmar la cita.
      </p>

      <div className="mt-4 rounded-xl border border-gray-200 bg-brand-surface px-4 py-3 text-sm text-brand-gray">
        <p>
          <span className="font-medium text-brand-ink">{specialtyName}</span>{" "}
          con <span className="font-medium text-brand-ink">{doctorName}</span>
        </p>
        <p className="mt-0.5">
          {date} a las {time}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Nombre" name="name" required />
          <Input label="Apellido" name="lastName" required />
        </div>

        <Input label="Teléfono" name="phone" type="tel" required />

        <Input label="Email" name="email" type="email" required />

        <div className="mt-2 flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={onBack}
          >
            Atrás
          </Button>
          <Button type="submit" className="flex-1" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Confirmando...
              </>
            ) : (
              "Confirmar reserva"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
