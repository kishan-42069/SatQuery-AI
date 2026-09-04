import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SatQuery AI — Ask satellite imagery anything",
  description:
    "An agentic vision-language assistant for remote-sensing imagery. Natural-language queries planned, routed to specialist models, and answered with grounded visual evidence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
