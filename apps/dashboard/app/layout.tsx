// @ts-nocheck
/**
 * TitanCrew · Root Layout
 * Next.js 15 App Router root layout with font loading, global styles, providers.
 */

import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "TitanCrew — AI Crew for Trade Businesses",
    template: "%s | TitanCrew",
  },
  description:
    "The AI crew that runs your trade business while you're on the job site. Automated scheduling, invoicing, parts ordering, and customer comms for plumbers, electricians, and HVAC contractors.",
  keywords: ["trade contractor AI", "plumber software", "HVAC automation", "electrician scheduling"],
  authors: [{ name: "TitanCrew" }],
  creator: "TitanCrew",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://app.titancrew.ai",
    siteName: "TitanCrew",
    title: "TitanCrew — AI Crew for Trade Businesses",
    description: "Automate your trade business back-office with AI agents. Deploy in 5 minutes.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "TitanCrew",
    description: "AI crew for trade contractors. Schedule, invoice, reorder parts — automatically.",
    creator: "@TitanCrewAI",
  },
  robots: { index: false, follow: false }, // Dashboard is private
};

export const viewport: Viewport = {
  themeColor: "#1A2744",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
