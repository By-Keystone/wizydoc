/**
 * ⚠️ CONTENIDO DE MARCADOR — NO PUBLICAR TAL CUAL.
 *
 * Los nombres y las clínicas son deliberadamente falsos («Nombre Apellido»,
 * «Clínica Ejemplo») para que nadie los confunda con testimonios reales. Antes
 * de lanzar hay que sustituirlos por clientes de la beta que hayan dado permiso
 * expreso para ser citados, o retirar la sección entera.
 */

const testimonials = [
  {
    quote:
      "Dejamos de llamar una por una para confirmar. El día empieza con la agenda ya cerrada.",
    name: "Nombre Apellido",
    role: "Directora médica",
    clinic: "Clínica Ejemplo",
  },
  {
    quote:
      "Configurar los horarios de los cinco médicos nos tomó una tarde. No volvimos a tocarlo.",
    name: "Nombre Apellido",
    role: "Coordinador de sede",
    clinic: "Centro Médico Ejemplo",
  },
  {
    quote:
      "Los pacientes reservan de noche, que es justo cuando nadie podía atender el teléfono.",
    name: "Nombre Apellido",
    role: "Médico general",
    clinic: "Consultorio Ejemplo",
  },
];

const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

export function SocialProof() {
  return (
    <section className="border-y border-gray-100 bg-white py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-semibold uppercase tracking-widest text-brand-gray">
          Sedes que ya usan WizyDoc
        </p>

        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
          {testimonials.map((testimonial) => (
            <figure key={testimonial.clinic} className="flex flex-col gap-4">
              <blockquote className="text-sm leading-relaxed text-brand-ink">
                «{testimonial.quote}»
              </blockquote>

              <figcaption className="flex items-center gap-3">
                <div
                  aria-hidden
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-surface text-xs font-bold text-brand-teal-dark"
                >
                  {initials(testimonial.name)}
                </div>
                <div className="text-xs leading-tight">
                  <p className="font-semibold text-brand-ink">
                    {testimonial.name}
                  </p>
                  <p className="text-brand-gray">
                    {testimonial.role} · {testimonial.clinic}
                  </p>
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
