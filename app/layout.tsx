import type { Metadata } from "next";
import "./globals.css";
import "@/components/priscilla/priscilla.css";
import "@/components/fact-check.css";
import { PriscillaProvider } from "@/components/priscilla/provider";
import { PriscillaSurfaces } from "@/components/priscilla/surfaces";

export const metadata: Metadata = {
  title: "Groundwork · RM Intelligence",
  applicationName: "Groundwork",
  description: "Proactive portfolio risk, event opportunities, and scenario analysis for relationship managers.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased"><PriscillaProvider>{children}<PriscillaSurfaces /></PriscillaProvider></body>
    </html>
  );
}
