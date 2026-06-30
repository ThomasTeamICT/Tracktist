"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Calendar, Globe2, Users, Settings, Music2, Bell, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/dashboard", label: "Home", icon: Calendar },
  { href: "/globe", label: "Globe", icon: Globe2 },
  { href: "/artists", label: "Artiesten", icon: Music2 },
  { href: "/friends", label: "Vrienden", icon: Users },
  { href: "/notifications", label: "Meldingen", icon: Bell },
  { href: "/settings", label: "Instellingen", icon: Settings },
];

export function AppNav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-40 border-b border-white/5 bg-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-3">
        <Link href="/dashboard" className="mr-3 flex items-center gap-2 font-semibold text-white">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white shadow-glow">
            <Globe2 className="h-4 w-4" />
          </span>
          Tracktist
        </Link>
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition",
                  active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{l.label}</span>
              </Link>
            );
          })}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          className="ml-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
          title="Uitloggen"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
