import type { Metadata } from "next";
import { Suspense } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import Nav from "@/components/Nav";
import DemoBanner from "@/components/DemoBanner";

// Plus Jakarta Sans, self-hosted by next/font/google at build time —
// no browser request to Google, and no dependence on VM system fonts.
// Weights 400–800, latin subset, swap display, wired as --font-sans.
const plusJakartaSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-plus-jakarta-sans",
});

export const metadata: Metadata = {
  title: "Curi",
  description: "Learn from creators: video lessons, notes, and quizzes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="curi" className={plusJakartaSans.variable}>
      <body className="min-h-screen bg-base-100 font-sans text-base-content antialiased">
        <DemoBanner />
        <Suspense fallback={<header className="h-14 border-b border-base-300 bg-white" />}>
          <Nav />
        </Suspense>
        <main className="mx-auto w-full max-w-6xl px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pt-12">{children}</main>
      </body>
    </html>
  );
}
