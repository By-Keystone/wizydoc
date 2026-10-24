import { Calendar, ClipboardList, RefreshCw, Smartphone } from "lucide-react";
import { Card, CardHeader, CardContent } from "@/components/ui/card";

/**
 * Una sola tarjeta lleva el coral. Es la que responde a por qué alguien cambia
 * de herramienta —dejar de coordinar citas—; las demás son la razón por la que
 * se queda. Si el acento lo llevasen las cuatro, no acentuaría ninguna.
 */
const features = [
  {
    icon: Smartphone,
    featured: true,
    title: "Tus pacientes reservan solos",
    description:
      "Eligen fecha y horario desde tu link, en el celular y en menos de un minuto. La confirmación les llega por correo al instante, sin que tengas que llamar a nadie.",
  },
  {
    icon: Calendar,
    featured: false,
    title: "Tus horarios, tus reglas",
    description:
      "Defines tus bloques de atención por día. Tus pacientes solo ven los turnos realmente libres, sin cruces ni errores.",
  },
  {
    icon: ClipboardList,
    featured: false,
    title: "La información de tus pacientes es tuya",
    description:
      "Cada reserva alimenta la ficha del paciente, con sus datos y su historial de citas. Es de tu consultorio, no de un directorio. Incluida desde el plan Consultorio.",
  },
  {
    icon: RefreshCw,
    featured: false,
    title: "El paciente cancela y reprograma solo",
    description:
      "Desde el link de su correo, hasta 12 horas antes de la cita y sin llamarte. Incluido desde el plan Consultorio.",
  },
];

export function Features() {
  return (
    <section id="features" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-teal">
            Funcionalidades
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-teal-dark sm:text-4xl">
            Tú atiendes, las citas se gestionan solas
          </h2>
          <p className="mt-4 text-lg text-brand-gray">
            Pensado para el médico independiente: solo lo necesario para dejar
            de coordinar citas por teléfono y WhatsApp.
          </p>
        </div>

        {/* Grid */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon;
            return (
              <Card
                key={feature.title}
                className={`group transition-shadow hover:shadow-md ${
                  feature.featured ? "border-brand-coral/30 shadow-sm" : ""
                }`}
              >
                <CardHeader>
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${
                      feature.featured
                        ? "bg-brand-coral text-white"
                        : "bg-brand-surface text-brand-teal"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-semibold text-brand-teal-dark">
                    {feature.title}
                  </h3>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-brand-gray">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
