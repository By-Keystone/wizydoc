import type { ReactNode } from "react";
import { MobileCarousel } from "./mobile-carousel";

const EXAMPLE_CHIP =
  "rounded-lg bg-white px-2.5 py-1.5 text-[11px] ring-1 ring-gray-200";

const steps: { title: string; description: string; example: ReactNode }[] = [
  {
    title: "Crea tu cuenta",
    description:
      "Regístrate gratis y crea tu consultorio. Tú mismo atiendes en él; si trabajas con otros médicos, invítalos cuando quieras.",
    example: (
      <div className="flex items-center gap-2">
        <span
          className={`${EXAMPLE_CHIP} min-w-0 flex-1 truncate text-brand-gray`}
        >
          lucia.paredes@gmail.com
        </span>
        <span className="shrink-0 rounded-lg bg-brand-teal px-2.5 py-1.5 text-[11px] font-semibold text-white">
          Crear cuenta
        </span>
      </div>
    ),
  },
  {
    title: "Define tus horarios",
    description:
      "Configuras tus bloques de atención por día. Lunes 09:00–13:00, miércoles 15:00–19:00 — como tú quieras.",
    example: (
      <div className="flex flex-wrap gap-1.5 font-semibold text-brand-ink tabular-nums">
        <span className={EXAMPLE_CHIP}>Lun 09:00–13:00</span>
        <span className={EXAMPLE_CHIP}>Mié 15:00–19:00</span>
      </div>
    ),
  },
  {
    title: "Comparte tu link y recibe reservas",
    description:
      "Ponlo en tu WhatsApp o en tus redes. Tus pacientes eligen fecha y horario, y WizyDoc les envía la confirmación por correo.",
    example: (
      <p className="ml-auto w-fit max-w-full rounded-2xl rounded-br-md bg-white px-3 py-2 text-[11px] text-brand-ink ring-1 ring-gray-200">
        Reserva tu cita conmigo aquí:{" "}
        <span className="font-semibold text-brand-teal underline decoration-brand-teal/40 underline-offset-2">
          Reservar cita
        </span>
      </p>
    ),
  },
];

export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="relative overflow-hidden bg-brand-surface py-24"
    >
      <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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

        <div className="relative mt-16">
          <div className="pointer-events-none absolute top-[42px] right-[10%] left-[10%] hidden h-px bg-gradient-to-r from-transparent via-brand-teal/50 to-transparent md:block" />
          <MobileCarousel
            label="Pasos para empezar"
            className="md:mx-0 md:grid md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 md:py-0"
            dotsClassName="md:hidden"
          >
            {steps.map((step, index) => (
              <article
                key={step.title}
                className="lift relative flex w-[86%] shrink-0 snap-center flex-col rounded-3xl border border-gray-200/80 bg-white p-6 shadow-sm md:w-auto"
              >
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-teal text-sm font-bold text-white shadow-md shadow-brand-teal/30">
                  {index + 1}
                </span>
                <h3 className="mt-5 text-lg font-semibold text-brand-teal-dark">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-brand-gray">
                  {step.description}
                </p>
                <div aria-hidden="true" className="mt-auto pt-5">
                  <div className="rounded-2xl bg-brand-surface p-3">
                    {step.example}
                  </div>
                </div>
              </article>
            ))}
          </MobileCarousel>
        </div>
      </div>
    </section>
  );
}
