import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLATFORM_URL } from "@/lib/platform-url";

const basicPlanFeatures = [
  "1 sede",
  "Hasta 2 médicos",
  "8 citas al mes",
  "Horarios personalizados",
  "Reserva en línea para pacientes",
];

export function BetaCTA() {
  return (
    <section className="bg-gradient-to-br from-brand-teal-dark to-brand-teal py-24">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-medium text-white">
          <Sparkles className="h-4 w-4" />
          Acceso beta gratuito
        </div>

        <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
          Únete gratis durante la beta
        </h2>
        <p className="mt-4 text-lg text-white/80">
          Estamos en beta abierta: regístrate hoy y obtén acceso a WizyDoc sin
          costo. Sin tarjeta. Sin compromisos.
        </p>

        <ul className="mx-auto mt-8 inline-flex flex-col gap-3 text-left">
          {basicPlanFeatures.map((feature) => (
            <li
              key={feature}
              className="flex items-center gap-3 text-sm text-white"
            >
              <Check className="h-4 w-4 shrink-0 text-white" />
              {feature}
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Button size="lg" variant="coral" asChild>
            <a href={`${PLATFORM_URL}/register`}>
              Registrarme gratis
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="text-white hover:bg-white/10 hover:text-white"
            asChild
          >
            <Link href="#how-it-works">Ver cómo funciona</Link>
          </Button>
        </div>

        <p className="mt-5 text-sm text-white/70">
          Sin tarjeta de crédito · Cancela cuando quieras
        </p>
      </div>
    </section>
  );
}
