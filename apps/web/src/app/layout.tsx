import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Tracktist — your personal live-music radar",
  description:
    "Follow your favourite artists and get notified when they play within your radius — across borders.",
  manifest: "/manifest.webmanifest",
  applicationName: "Tracktist",
  appleWebApp: { capable: true, title: "Tracktist", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className="dark">
      <body className="min-h-screen bg-bg font-sans text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
