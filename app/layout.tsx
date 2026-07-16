import "./globals.css";
import type { Metadata } from "next";
import ConsentModal from "@/components/ConsentModal";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export const metadata: Metadata = {
  title: "APEX - Navy Performance Evaluation eXchange",
  description: "Next-gen web system for BUPERSINST 1610.10H EVAL validation.",
};

// Global layout wrapper for our app. Includes the Outfit font from Google CDN.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Outfit:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <ConsentModal />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
