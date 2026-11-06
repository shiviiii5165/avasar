import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";

import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", style: ["normal", "italic"], display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.AVSAR_PUBLIC_URL ?? "http://localhost:3000"),
  title: { default: "Avsar — Every Dream Deserves a Chance", template: "%s · Avsar" },
  description: "One place. Equal opportunity. Discover jobs, internships and gigs, understand your fit, apply and track your progress.",
  openGraph: { title: "Avsar — Every Dream Deserves a Chance", description: "One place. Equal opportunity.", type: "website" },
};

export const viewport: Viewport = { themeColor: "#fdf8f1", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-IN" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="min-h-dvh">
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
