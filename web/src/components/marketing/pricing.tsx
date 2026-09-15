import Link from "next/link";
import { Check, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";

const plans = [
  {
    name: "Gratis",
    price: "S/ 0",
    period: "para siempre",
    description: "Para el médico independiente que quiere empezar hoy.",
    badge: null,
    highlight: false,
    features: [
      "1 médico",
      "1 sede",
      "Reserva de citas en línea",
      "Agenda de citas del doctor",
    ],
    cta: "Empezar gratis",
    href: "/register",
  },
  {
    name: "Consultorio",
    price: "S/ 79",
    period: "/ mes",
    description: "Para consultorios que ya llevan historia de sus pacientes.",
    badge: "Más popular",
    highlight: true,
    features: [
      "3 médicos incluidos",
      "1 sede",
      "Ficha del paciente",
      "Historial de citas",
      "Médico adicional por S/ 25",
    ],
    cta: "Suscribirse",
    href: "/register?plan=CONSULTORIO",
  },
  {
    name: "Clínica",
    price: "S/ 199",
    period: "/ mes",
    description: "Para clínicas con varias sedes y equipo médico.",
    badge: null,
    highlight: false,
    features: [
      "8 médicos incluidos",
      "3 sedes incluidas",
      "Métricas por sede",
      "Médico adicional por S/ 20",
      "Todo lo del plan Consultorio",
    ],
    cta: "Suscribirse",
    href: "/register?plan=CLINICA",
  },
  {
    name: "Red",
    price: "A medida",
    period: "",
    description: "Para redes de clínicas que necesitan escala y soporte.",
    badge: null,
    highlight: false,
    features: [
      "Médicos y sedes a medida",
      "Exportación de datos",
      "Soporte prioritario",
      "Todo lo del plan Clínica",
    ],
    cta: "Hablar con ventas",
    href: "/contact",
  },
];

type Cell = string | boolean;

const comparison: { label: string; values: [Cell, Cell, Cell, Cell] }[] = [
  {
    label: "Precio",
    values: ["S/ 0", "S/ 79 al mes", "S/ 199 al mes", "A medida"],
  },
  { label: "Médicos incluidos", values: ["1", "3", "8", "A medida"] },
  { label: "Médico adicional", values: ["—", "S/ 25", "S/ 20", "A medida"] },
  { label: "Sedes incluidas", values: ["1", "1", "3", "A medida"] },
  { label: "Sede adicional", values: ["—", "S/ 40", "S/ 40", "A medida"] },
  { label: "Reserva de citas", values: [true, true, true, true] },
  { label: "Agenda de citas de doctores", values: [true, true, true, true] },
  { label: "Ficha del paciente", values: [false, true, true, true] },
  { label: "Historial de citas", values: [false, true, true, true] },
  { label: "Métricas por sede", values: [false, false, true, true] },
  { label: "Exportación de datos", values: [false, false, false, true] },
  { label: "Soporte prioritario", values: [false, false, false, true] },
];

function ComparisonCell({ value }: { value: Cell }) {
  if (value === true) {
    return (
      <>
        <Check className="mx-auto h-5 w-5 text-brand-teal" aria-hidden />
        <span className="sr-only">Incluido</span>
      </>
    );
  }

  if (value === false) {
    return (
      <>
        <X className="mx-auto h-5 w-5 text-gray-300" aria-hidden />
        <span className="sr-only">No incluido</span>
      </>
    );
  }

  if (value === "—") {
    return (
      <>
        <Minus className="mx-auto h-5 w-5 text-gray-300" aria-hidden />
        <span className="sr-only">No disponible</span>
      </>
    );
  }

  return <span className="text-sm text-brand-ink">{value}</span>;
}

export function Pricing() {
  return (
    <section id="pricing" className="bg-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-teal">
            Precios
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-brand-teal-dark sm:text-4xl">
            Un plan para cada necesidad
          </h2>
          <p className="mt-4 text-lg text-brand-gray">
            Comienza gratis y crece a tu ritmo. Sin permanencia. Cancela cuando
            quieras.
          </p>
        </div>

        {/* Cards */}
        <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4 items-start">
          {plans.map((plan) => (
            <Card
              key={plan.name}
              className={
                plan.highlight
                  ? "relative border-brand-teal shadow-xl ring-2 ring-brand-teal"
                  : ""
              }
            >
              {plan.badge && (
                <div className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2">
                  <Badge
                    variant="blue"
                    className="bg-brand-teal px-3 py-1 text-xs text-white shadow-sm"
                  >
                    {plan.badge}
                  </Badge>
                </div>
              )}

              <CardHeader className={plan.highlight ? "pt-8" : ""}>
                <p className="text-sm font-semibold text-brand-gray">
                  {plan.name}
                </p>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-brand-ink">
                    {plan.price}
                  </span>
                  <span className="text-sm text-brand-gray">{plan.period}</span>
                </div>
                <p className="mt-2 text-sm text-brand-gray">
                  {plan.description}
                </p>
              </CardHeader>

              <CardContent>
                <ul className="flex flex-col gap-3">
                  {plan.features.map((feature) => (
                    <li
                      key={feature}
                      className="flex items-start gap-2.5 text-sm text-brand-gray"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-teal" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>

              <CardFooter>
                <Button
                  asChild
                  variant={plan.highlight ? "default" : "outline"}
                  className="w-full"
                  size="lg"
                >
                  <Link href={plan.href}>{plan.cta}</Link>
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        {/* Comparativa */}
        <div className="mt-20">
          <h3 className="text-center text-2xl font-bold tracking-tight text-brand-teal-dark">
            Compara los planes
          </h3>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left">
              <caption className="sr-only">
                Comparación de características entre los planes Gratis,
                Consultorio, Clínica y Red
              </caption>
              <thead>
                <tr className="border-b border-gray-200">
                  <th
                    scope="col"
                    className="py-4 pr-4 text-sm font-semibold text-brand-gray"
                  >
                    Características
                  </th>
                  {plans.map((plan) => (
                    <th
                      key={plan.name}
                      scope="col"
                      className={`px-4 py-4 text-center text-sm font-semibold ${
                        plan.highlight ? "text-brand-teal" : "text-brand-ink"
                      }`}
                    >
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.label} className="border-b border-gray-100">
                    <th
                      scope="row"
                      className="py-4 pr-4 text-sm font-normal text-brand-gray"
                    >
                      {row.label}
                    </th>
                    {row.values.map((value, index) => (
                      <td
                        key={plans[index].name}
                        className={`px-4 py-4 text-center ${
                          plans[index].highlight ? "bg-brand-teal/5" : ""
                        }`}
                      >
                        <ComparisonCell value={value} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
