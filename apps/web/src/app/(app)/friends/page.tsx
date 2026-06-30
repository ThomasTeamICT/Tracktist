import { SectionTitle } from "@/components/ui";
import { FriendsClient } from "./friends-client";

export const dynamic = "force-dynamic";

export default function FriendsPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Vrienden</h1>
        <p className="text-white/55">
          Volg met wie je samen naar concerten wil — zie wie van je vrienden naar dezelfde shows gaat.
        </p>
      </header>
      <SectionTitle hint="nodig uit per e-mail">Mijn netwerk</SectionTitle>
      <FriendsClient />
    </div>
  );
}
