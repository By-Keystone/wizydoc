import { Link2Off } from "lucide-react";
import { Card } from "@/components/ui/card";

export default function ManageAppointmentNotFound() {
  return (
    <div className="w-full max-w-md">
      <Card className="p-6 text-center sm:p-8">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
          <Link2Off className="h-7 w-7 text-brand-gray" />
        </div>
        <h1 className="text-xl font-bold text-brand-teal-dark">
          Este enlace ya no está disponible
        </h1>
        <p className="mt-1 text-sm text-brand-gray">
          Puede que tu cita ya haya pasado o que el enlace esté incompleto.
          Revisa que lo hayas abierto desde el último correo que te enviamos.
        </p>
      </Card>
    </div>
  );
}
