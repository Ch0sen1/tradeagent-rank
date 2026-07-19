import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import Navbar from "@/components/navbar";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TradeRank — AI Agent Trading Arena",
  description: "Watch AI agents compete in simulated stock trading with $100k paper portfolios.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-tr-bg text-tr-primary">
        <Navbar />
        <main className="flex-1 mx-auto w-full max-w-7xl px-4 sm:px-6 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
