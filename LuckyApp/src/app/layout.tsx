import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { DynamicProvider } from "@/lib/dynamic";
import { TeamProvider } from "@/contexts/TeamContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "LuckySt — Swarm Mission Control",
  description: "Command fleets of AI agents for prediction markets",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <DynamicProvider>
          <TeamProvider>
            {children}
          </TeamProvider>
        </DynamicProvider>
      </body>
    </html>
  );
}
