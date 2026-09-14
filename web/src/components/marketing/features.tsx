import { Calendar, CheckCircle2, Building2, Clock } from "lucide-react"
import { Card, CardHeader, CardContent } from "@/components/ui/card"

/**
 * Una sola tarjeta lleva el coral. Es la que responde a por qué alguien cambia
 * de herramienta —dejar de llamar para confirmar—; las demás son la razón por la
 * que se queda. Si el acento lo llevasen las cuatro, no acentuaría ninguna.
 */
const features = [
  {
    icon: CheckCircle2,
    featured: true,
    title: "Confirmación automática",
    description:
      "Cada reserva se confirma sola y le llega al paciente al instante, con el médico, la fecha y la sede. Sin que tengas que llamar a nadie.",
  },
  {
    icon: Calendar,
    featured: false,
    title: "Agenda personalizada",
    description:
      "Cada médico define sus bloques de disponibilidad. Tus pacientes solo ven los turnos realmente libres, sin conflictos ni errores.",
  },
  {
    icon: Building2,
    featured: false,
    title: "Múltiples sedes",
    description:
      "Gestiona todas tus sedes desde un solo panel. Cada sede tiene sus propios médicos, horarios y configuración.",
  },
  {
    icon: Clock,
    featured: false,
    title: "Disponible 24/7",
    description:
      "Tus pacientes reservan cuando quieren, desde cualquier dispositivo. Tu agenda se actualiza en tiempo real.",
  },
]

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
            Todo lo que tu sede necesita
          </h2>
          <p className="mt-4 text-lg text-brand-gray">
            Diseñado para simplificar la operación diaria de médicos independientes
            y sedes pequeñas y medianas.
          </p>
        </div>

        {/* Grid */}
        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => {
            const Icon = feature.icon
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
                  <h3 className="mt-4 font-semibold text-brand-teal-dark">{feature.title}</h3>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-brand-gray">{feature.description}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
