import type { Metadata } from "next";
import { Instrument_Sans, Manrope } from "next/font/google";
import "./globals.css";

import SpaceBackdrop from "@/components/app/SpaceBackdrop";
import ThemeSync from "@/components/app/ThemeSync";

/**
 * The primary reading face for the product.
 *
 * Manrope provides the calm, highly readable editorial base for the entire
 * interface without leaning too technical or futuristic.
 */
const primary = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-primary",
});

/**
 * The display face for headings and emphasis.
 *
 * Instrument Sans keeps the hierarchy clean while staying modern and
 * premium, without the sharper tech aesthetic of more rigid sans faces.
 */
const display = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-display",
});

// Preserve the project’s existing CSS-variable naming so existing component
// classes remain compatible while the global typography system is upgraded.
const headingDisplay = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-display",
});

export const metadata: Metadata = {
  title: "SatQuery — Ask satellite imagery anything",
  description:
    "An agentic vision-language assistant for remote-sensing imagery. Natural-language queries planned, routed to specialist models, and answered with grounded visual evidence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`h-full antialiased ${primary.variable} ${display.variable} ${headingDisplay.variable}`}
    >
      <body className="h-full">
        <ThemeSync />
        <SpaceBackdrop />
        {children}
      </body>
    </html>
  );
}
