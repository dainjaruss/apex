import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import ConsentModal from "@/components/ConsentModal";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

// Google Fonts Inter, self-hosted by next/font so the page does not call
// fonts.googleapis.com at runtime (that host is blocked on NMCI).
const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "APEX - Navy Performance Evaluation eXchange",
  description: "Next-gen web system for BUPERSINST 1610.10H EVAL validation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body className="antialiased min-h-screen bg-background text-foreground">
        <ThemeProvider>
          <ConsentModal />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
