import { redirect } from "next/navigation";
import { onboardingStepPath } from "@/lib/onboarding";

export default function OnboardingIndex() {
  redirect(onboardingStepPath(1));
}
