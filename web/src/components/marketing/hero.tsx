import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PLATFORM_URL } from "@/lib/platform-url";
import { AvailabilityDemo } from "./availability-demo";

const highlights = [
  "Tus pacientes reservan en línea 24/7",
  "Cada reserva queda confirmada al instante",
  "Sin llamadas ni agendas en papel",
];

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-brand-surface via-white to-white py-20 sm:py-28">
      <div className="dot-grid pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-teal/10 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 lg:items-center">
          <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
            <Badge
              variant="teal"
              className="mb-5 gap-2 border border-brand-teal/20 bg-white/80 px-3 py-1 shadow-sm backdrop-blur"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-teal opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-brand-teal" />
              </span>
              Deja de coordinar citas por teléfono y WhatsApp
            </Badge>

            <h1 className="text-4xl font-extrabold tracking-tight text-brand-teal-dark sm:text-5xl lg:text-6xl">
              La agenda de tu{" "}
              <span className="bg-gradient-to-r from-brand-teal to-brand-teal-dark bg-clip-text text-transparent">
                consultorio
              </span>
              , en piloto automático.
            </h1>

            <p className="mt-6 text-lg leading-relaxed text-brand-gray">
              Defines tus horarios y las citas se crean solas: tus pacientes
              reservan desde un link y reciben su confirmación al instante, sin
              que coordines nada.
            </p>

            <ul className="mx-auto mt-6 flex w-fit flex-col gap-2 text-left lg:mx-0">
              {highlights.map((highlight) => (
                <li
                  key={highlight}
                  className="flex items-center gap-2.5 text-sm text-brand-gray"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-brand-teal/10 text-brand-teal">
                    <Check className="h-3 w-3" />
                  </span>
                  {highlight}
                </li>
              ))}
            </ul>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 lg:justify-start">
              <Button
                size="lg"
                className="group rounded-xl shadow-lg shadow-brand-teal/25"
                asChild
              >
                <a href={`${PLATFORM_URL}/register`}>
                  Comenzar gratis
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </a>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="rounded-xl"
                asChild
              >
                <Link href="#how-it-works">Ver cómo funciona</Link>
              </Button>
            </div>

            <p className="mt-4 text-xs text-brand-gray">
              Sin tarjeta de crédito. Empieza en menos de 5 minutos.
            </p>
          </div>

          <div className="relative flex justify-center">
            <div className="pointer-events-none absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-brand-teal/20 blur-3xl" />
            <AvailabilityDemo />
          </div>
        </div>
      </div>
    </section>
  );
}
