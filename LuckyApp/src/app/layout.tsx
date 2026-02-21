import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/lib/dynamic";
import { OrgProvider } from "@/contexts/OrgContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Swarm — Enterprise AI Fleet Orchestration",
  description: "Enterprise AI fleet orchestration for solo founders",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <Web3Provider>
          <OrgProvider>
            {children}
          </OrgProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
