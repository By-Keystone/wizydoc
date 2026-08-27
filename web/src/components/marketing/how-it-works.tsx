import { UserPlus, CalendarDays, CheckCircle2 } from "lucide-react"

const steps = [
  {
    number: "01",
    icon: UserPlus,
    title: "Registra tu sede y médicos",
    description:
      "Crea tu perfil, agrega tus sedes y da de alta a tus médicos con su especialidad y duración de cita preferida.",
  },
  {
    number: "02",
    icon: CalendarDays,
    title: "Define la disponibilidad",
    description:
      "Cada médico configura sus bloques de horario por día. Lunes 09:00–13:00, miércoles 15:00–19:00 — como tú quieras.",
  },
  {
    number: "03",
    icon: CheckCircle2,
    title: "Tus pacientes reservan y confirman",
    description:
      "Los pacientes eligen médico, fecha y horario desde el enlace de reserva. WizyDoc les envía una confirmación por WhatsApp automáticamente.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-brand-surface py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-teal">
            Cómo funciona
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-teal-dark sm:text-4xl">
            En 3 pasos, listo para recibir pacientes
          </h2>
          <p className="mt-4 text-lg text-brand-gray">
            Sin instalaciones. Sin configuraciones complejas. Empieza hoy.
          </p>
        </div>

        {/* Steps */}
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-3">
          {steps.map((step, index) => {
            const Icon = step.icon
            return (
              <div key={step.number} className="relative flex flex-col items-center text-center">
                {/* Connector line */}
                {index < steps.length - 1 && (
                  <div className="absolute top-10 left-[calc(50%+2.5rem)] hidden h-px w-[calc(100%-5rem)] border-t-2 border-dashed border-gray-300 md:block" />
                )}

                {/* Icon circle */}
                <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-md ring-1 ring-gray-200">
                  <Icon className="h-8 w-8 text-brand-teal" />
                  <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-teal text-xs font-bold text-white">
                    {index + 1}
                  </span>
                </div>

                <h3 className="mt-6 text-lg font-semibold text-brand-teal-dark">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-gray max-w-xs">
                  {step.description}
                </p>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
