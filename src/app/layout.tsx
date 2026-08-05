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
import "@fontsource-variable/source-serif-4/wght.css";
import "@fontsource-variable/source-serif-4/wght-italic.css";

import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "AttendPAC — Workforce Attendance & Time Management",
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
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
