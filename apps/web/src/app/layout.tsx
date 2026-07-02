import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "Tracktist — jouw persoonlijke live-muziekradar",
  description:
    "Volg je favoriete artiesten en krijg een melding zodra ze binnen jouw straal spelen — over de landsgrenzen heen.",
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
      <head>
        {/* Fonts are self-hosted (see globals.css) — no third-party font CDN (GDPR). */}
        <link
          rel="preload"
          href="/fonts/inter-var-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/space-grotesk-var-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="app-bg min-h-screen bg-bg font-sans text-white antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
