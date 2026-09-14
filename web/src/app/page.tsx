import type { Metadata } from "next";
import { Hero } from "@/components/marketing/hero";
import { SocialProof } from "@/components/marketing/social-proof";
import { Features } from "@/components/marketing/features";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Pricing } from "@/components/marketing/pricing";
import { CTA } from "@/components/marketing/cta";

export const metadata: Metadata = {
  alternates: {
    canonical: "/",
  },
};

export default function LandingPage() {
  return (
    <>
      <Hero />
      <SocialProof />
      <Features />
      <HowItWorks />
      <Pricing />
      <CTA />
    </>
  );
}
