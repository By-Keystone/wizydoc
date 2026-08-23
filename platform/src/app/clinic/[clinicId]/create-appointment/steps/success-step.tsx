import { CheckCircle } from "lucide-react";
import { BookingPatient } from "./patient-step";
import { Button } from "@/components/ui/button";

interface Props {
  specialtyName: string;
  doctorName: string;
  date: string;
  time: string;
  patient: BookingPatient;
  onClick: () => void;
}

export function SuccessStep({
  specialtyName,
  doctorName,
  date,
  time,
  patient,
  onClick
}: Props) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green-100">
        <CheckCircle className="h-7 w-7 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold text-brand-teal-dark">¡Cita reservada!</h2>
      <p className="mt-2 text-sm text-brand-gray">
        Te esperamos, {patient.name}. Guarda los detalles de tu cita.
      </p>

      <div className="mt-6 rounded-xl border border-gray-200 bg-brand-surface px-4 py-3 text-left text-sm text-brand-gray">
        <p>
          <span className="font-medium text-brand-ink">{specialtyName}</span>{" "}
          con <span className="font-medium text-brand-ink">{doctorName}</span>
        </p>
        <p className="mt-0.5">
          {date} a las {time}
        </p>
        <p className="mt-0.5">Teléfono: {patient.phone}</p>
      </div>

      <Button onClick={onClick} variant={'coral'}>Reserva de nuevo</Button>
    </div>
  );
}
