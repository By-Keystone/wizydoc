import type { ReactNode } from "react";
import { MobileCarousel } from "./mobile-carousel";

/**
 * Una sola tarjeta lleva el coral. Es la que responde a por qué alguien cambia
 * de herramienta —dejar de coordinar citas—; las demás son la razón por la que
 * se queda. Si el acento lo llevasen las cuatro, no acentuaría ninguna.
 */
const features: {
  featured: boolean;
  title: string;
  description: string;
  requiredPlan: string | null;
  preview: ReactNode;
}[] = [
  {
    featured: true,
    title: "Tus pacientes reservan solos",
    description:
      "Eligen fecha y horario desde tu link, en el celular y en menos de un minuto. La confirmación les llega por correo al instante.",
    requiredPlan: null,
    preview: <FreeSlotsPreview />,
  },
  {
    featured: false,
    title: "Tus horarios, tus reglas",
    description:
      "Defines tus bloques de atención por día. Tus pacientes solo ven los turnos realmente libres, sin cruces ni errores.",
    requiredPlan: null,
    preview: <OpeningHoursPreview />,
  },
  {
    featured: false,
    title: "La información de tus pacientes es tuya",
    description:
      "Cada reserva alimenta la ficha del paciente, con sus datos y su historial de citas. Es de tu consultorio, no de un directorio.",
    requiredPlan: "Desde Consultorio",
    preview: <PatientRecordPreview />,
  },
  {
    featured: false,
    title: "El paciente cancela y reprograma solo",
    description:
      "Desde el link de su correo, hasta 12 horas antes de la cita y sin llamarte.",
    requiredPlan: "Desde Consultorio",
    preview: <SelfServicePreview />,
  },
];

export function Features() {
  return (
    <section id="features" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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

        <div className="mt-16">
          <MobileCarousel
            label="Funcionalidades"
            className="sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 sm:py-0 lg:grid-cols-4"
            dotsClassName="sm:hidden"
          >
            {features.map((feature) => (
              <article
                key={feature.title}
                className={`lift flex w-[86%] shrink-0 snap-center flex-col rounded-3xl border bg-white p-5 sm:w-auto ${
                  feature.featured
                    ? "border-brand-coral/30 shadow-[0_14px_34px_-18px_rgba(255,111,89,.55)]"
                    : "border-gray-200/80 shadow-sm"
                }`}
              >
                {feature.preview}
                <h3 className="mt-5 font-semibold text-brand-teal-dark">
                  {feature.title}
                </h3>
                {feature.requiredPlan && (
                  <span className="mt-2 inline-flex w-fit rounded-full bg-brand-teal/10 px-2 py-0.5 text-[11px] font-semibold text-brand-teal">
                    {feature.requiredPlan}
                  </span>
                )}
                <p className="mt-2 text-sm leading-relaxed text-brand-gray">
                  {feature.description}
                </p>
              </article>
            ))}
          </MobileCarousel>
        </div>
      </div>
    </section>
  );
}

const PREVIEW_BOX = "h-[132px] rounded-2xl p-4";
const PREVIEW_CHIP =
  "rounded-lg bg-white ring-1 ring-gray-200 text-[11px] font-semibold";

function FreeSlotsPreview() {
  const freeSlots = ["09:00", "09:30", "10:30", "11:00", "11:30", "12:00"];
  const chosenSlot = "09:30";
  return (
    <div aria-hidden="true" className={`${PREVIEW_BOX} bg-[#FFF3F0]`}>
      <p className="text-[11px] font-medium text-brand-gray">
        Mar 13 · Horarios libres
      </p>
      <div className="mt-2 grid grid-cols-3 gap-1.5 tabular-nums">
        {freeSlots.map((slot) => (
          <span
            key={slot}
            className={
              slot === chosenSlot
                ? "rounded-lg bg-brand-coral py-1.5 text-center text-[11px] font-semibold text-white shadow-sm"
                : `${PREVIEW_CHIP} py-1.5 text-center text-brand-ink`
            }
          >
            {slot}
          </span>
        ))}
      </div>
    </div>
  );
}

function OpeningHoursPreview() {
  const ranges = [
    { day: "Lunes", hours: "09:00 – 13:00" },
    { day: "Lunes", hours: "15:00 – 19:00" },
    { day: "Miércoles", hours: "09:00 – 13:00" },
  ];
  return (
    <div
      aria-hidden="true"
      className={`${PREVIEW_BOX} flex flex-col gap-1.5 bg-brand-surface tabular-nums`}
    >
      {ranges.map(({ day, hours }) => (
        <div
          key={`${day}-${hours}`}
          className={`${PREVIEW_CHIP} flex items-center justify-between px-2.5 py-1.5`}
        >
          <span className="font-medium text-brand-gray">{day}</span>
          <span className="text-brand-ink">{hours}</span>
        </div>
      ))}
    </div>
  );
}

function PatientRecordPreview() {
  const recordFields = [
    "Medicina general",
    "Aseguradora",
    "Contacto de emergencia",
  ];
  return (
    <div aria-hidden="true" className={`${PREVIEW_BOX} bg-brand-surface`}>
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-teal/15 text-[11px] font-bold text-brand-teal-dark">
          MR
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-brand-ink">
            María Rodríguez
          </p>
          <p className="text-[11px] text-brand-gray">
            3 citas · última el 13 de octubre
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {recordFields.map((field) => (
          <span
            key={field}
            className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-brand-gray ring-1 ring-gray-200"
          >
            {field}
          </span>
        ))}
      </div>
    </div>
  );
}

function SelfServicePreview() {
  return (
    <div aria-hidden="true" className={`${PREVIEW_BOX} bg-brand-surface`}>
      <p className="text-[11px] text-brand-gray">
        Tu cita del martes 13 · 09:30
      </p>
      <div className="mt-2 flex gap-1.5">
        <span className="flex-1 rounded-lg bg-brand-teal py-1.5 text-center text-[11px] font-semibold text-white">
          Reprogramar
        </span>
        <span
          className={`${PREVIEW_CHIP} flex-1 py-1.5 text-center text-brand-gray`}
        >
          Cancelar
        </span>
      </div>
      <p className="mt-2 text-[10px] text-brand-gray">
        Disponible hasta 12 horas antes
      </p>
    </div>
  );
}
