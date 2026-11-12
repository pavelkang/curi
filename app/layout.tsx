import type { Metadata } from "next";
import { Suspense } from "react";
import { Figtree } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import Nav from "@/components/Nav";
import DemoBanner from "@/components/DemoBanner";

// Figtree — Astryx's prescribed typeface (its --font-family-body and
// --font-family-heading tokens name it). Self-hosted by next/font/google
// at build time: no browser request to Google, no dependence on VM
// system fonts. Weights 400–800, latin subset, swap display.
const figtree = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-figtree",
});

export const metadata: Metadata = {
  title: "Curi",
  description: "Learn from creators: video lessons, notes, and quizzes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={figtree.variable}>
      <body className="min-h-screen bg-body font-sans text-primary antialiased">
        <Providers>
          <DemoBanner />
          <Suspense fallback={<header className="h-14 border-b border-border bg-surface" />}>
            <Nav />
          </Suspense>
          <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pt-12">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
