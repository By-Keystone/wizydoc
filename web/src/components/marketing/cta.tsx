import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import doctorWithTablet from "@/images/doctor-with-tablet.png";
import { PLATFORM_URL } from "@/lib/platform-url";

export function CTA() {
  return (
    <section className="bg-gradient-to-b from-brand-surface/60 to-white px-4 pt-28 pb-20 sm:px-6 lg:px-8">
      <div className="relative mx-auto max-w-6xl rounded-[2rem] bg-gradient-to-br from-brand-teal-dark to-brand-teal shadow-xl shadow-brand-teal/20">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[2rem]">
          <div className="dot-grid-light absolute inset-0" />
          <div className="absolute -top-24 -right-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="relative grid items-end gap-6 px-6 sm:px-12 lg:grid-cols-[1.1fr_.9fr] lg:gap-10 lg:px-16">
          <div className="pt-14 text-center sm:pt-16 lg:py-20 lg:text-left">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Deja de coordinar citas
            </h2>
            <p className="mt-4 text-lg text-white/80">
              Tus pacientes reservan desde un link y tú solo te ocupas de
              atenderlos.
            </p>

            <div className="mt-10 flex flex-wrap justify-center gap-4 lg:justify-start">
              <Button
                size="lg"
                variant="coral"
                className="group rounded-xl"
                asChild
              >
                <a href={`${PLATFORM_URL}/register`}>
                  Comenzar gratis
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" />
                </a>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="rounded-xl text-white hover:bg-white/10 hover:text-white"
                asChild
              >
                <Link href="#how-it-works">Ver cómo funciona</Link>
              </Button>
            </div>

            <p className="mt-5 text-sm text-white/70">
              Sin tarjeta de crédito · Listo en 5 minutos
            </p>
          </div>

          <div className="relative flex justify-center lg:justify-end lg:pr-6">
            <div className="pointer-events-none absolute bottom-0 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-white/15 blur-2xl lg:h-72 lg:w-72" />
            <Image
              src={doctorWithTablet}
              alt="Médico revisando su agenda en una tablet"
              sizes="(min-width: 1024px) 380px, 256px"
              className="relative w-56 max-w-full sm:w-64 lg:-mt-24 lg:w-[380px]"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
