import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { Features } from "@/components/marketing/features";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { BetaCTA } from "@/components/marketing/beta-cta";

export const metadata: Metadata = {
  title: "Únete a la beta",
  description:
    "Sé de los primeros en usar WizyDoc: gestiona citas, horarios y confirmaciones por WhatsApp para tu sede médica.",
  alternates: {
    canonical: "/beta",
  },
};

export default function BetaPage() {
  return (
    <>
      <Hero />
      <Features />
      <HowItWorks />
      <BetaCTA />
    </>
  );
}
