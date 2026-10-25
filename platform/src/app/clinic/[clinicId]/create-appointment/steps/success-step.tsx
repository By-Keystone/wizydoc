import { CheckCircle } from "lucide-react";
import {
  AppointmentSummary,
  type SummarizedAppointment,
} from "@/components/booking/appointment-summary";
import { Button } from "@/components/ui/button";

interface Props {
  appointment: SummarizedAppointment;
  patientName: string;
  onClick: () => void;
}

export function SuccessStep({ appointment, patientName, onClick }: Props) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-teal/10">
        <CheckCircle className="h-7 w-7 text-brand-teal" />
      </div>
      <h2
        tabIndex={-1}
        className="text-2xl font-bold text-brand-teal-dark outline-none"
      >
        ¡Cita reservada!
      </h2>
      <p className="mt-2 break-words text-sm text-brand-gray">
        Te esperamos, {patientName}. Guarda los detalles de tu cita.
      </p>

      <div className="text-left">
        <AppointmentSummary appointment={appointment} />
      </div>
      <p className="mt-4 text-[13px] text-brand-gray">
        Te enviamos la confirmación a tu correo.
      </p>

      <Button onClick={onClick} variant="outline" className="mt-6">
        Reserva de nuevo
      </Button>
    </div>
  );
}
