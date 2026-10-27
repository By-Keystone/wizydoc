import { getOnboardingMode } from "@/lib/auth/onboarding-mode";
import { OnboardingForm } from "./onboarding-form";

export default async function OnboardingPage() {
  const mode = await getOnboardingMode();

  return <OnboardingForm isFinishingClinic={mode === "finish-clinic"} />;
}
