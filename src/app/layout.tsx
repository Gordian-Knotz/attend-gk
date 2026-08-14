import type { Metadata } from "next";
import "./globals.css";

// Self-hosted brand typefaces (see DS-01 §02 Typography in use).
// Imported as npm packages rather than next/font/google since builds
// in this environment can't reach fonts.googleapis.com.
import "@fontsource/ibm-plex-sans/300.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/500.css";
// Archivo, not a serif. A high-contrast serif display reads as a literary
// magazine; this product is about guard deployment — muster sheets, gate
// registers, shift handovers. Archivo is a grotesque built for signage and
// dense print, which is the world the buyer actually works in.
//
// Cream paper + high-contrast serif + warm accent is also the single most
// recognisable AI-generated design signature in circulation, and two of those
// three were DS-01. The palette stays; the serif goes.
//
// Italic is imported because the hero keeps exactly one italic accent phrase.
import "@fontsource-variable/archivo/wght.css";
import "@fontsource-variable/archivo/wght-italic.css";

import { ThemeProvider } from "@/components/theme-provider";
import { PowerSyncProvider } from "@/lib/powersync/provider";

export const metadata: Metadata = {
  title: "Activ-HR — Workforce Attendance & Time Management",
  description:
    "Cloud-native, mobile-first workforce attendance and time-tracking platform for the Kenyan market.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {/* No-ops until NEXT_PUBLIC_POWERSYNC_URL is set, so the
              online-only build is unaffected. */}
          <PowerSyncProvider>{children}</PowerSyncProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
