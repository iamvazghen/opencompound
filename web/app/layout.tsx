import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { Providers } from "./providers";
import { Footer } from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display face — roman serif for finance-luxe gravitas (Hallmark: no italic headers).
const instrument = Instrument_Serif({
  variable: "--font-instrument",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OpenCompound — Leveraged & Self-Repaying Vaults on Aave V3",
  description:
    "Same-asset leverage loops and self-repaying mechanics on Aave V3. Connect your wallet, auto-detect your Aave positions, and run the strategies.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookies = (await headers()).get("cookie");
  return (
    <html
      lang="en"
      // suppressHydrationWarning: wallet/browser extensions (Grammarly, etc.) mutate <html>/<body>
      // attributes before React hydrates; this stops those benign diffs from erroring.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        {/* Keyboard a11y: jump past the nav straight to page content. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[200] focus:rounded-lg focus:bg-[var(--color-accent)] focus:px-4 focus:py-2 focus:text-sm focus:text-[var(--color-paper)]"
        >
          Skip to content
        </a>
        <Providers cookies={cookies}>{children}</Providers>
        <Footer />
        <Analytics />
      </body>
    </html>
  );
}
