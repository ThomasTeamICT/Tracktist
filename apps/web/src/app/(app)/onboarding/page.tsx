import { requireUser } from "@/lib/session";
import { OnboardingWizard } from "./onboarding-wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();
  const firstName = user.name ? user.name.split(" ")[0] : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="card p-6 sm:p-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">
            Welkom{firstName ? `, ${firstName}` : ""} 🎶
          </h1>
          <p className="mt-1 text-white/55">
            In drie korte stappen zet je je live-muziekradar op.
          </p>
        </header>
        <OnboardingWizard />
      </div>
    </div>
  );
}
