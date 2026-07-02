import { SectionTitle } from "@/components/ui";
import { NotificationsClient } from "./notifications-client";

export const dynamic = "force-dynamic";

export default function NotificationsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Meldingen</h1>
        <p className="text-white/55">
          Nieuwe optredens, ticketverkoop, verplaatsingen en annuleringen — alles op één plek.
        </p>
      </header>
      <SectionTitle hint="automatisch bijgewerkt">Meldingencentrum</SectionTitle>
      <NotificationsClient />
    </div>
  );
}
