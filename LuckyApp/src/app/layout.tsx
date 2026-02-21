import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/lib/dynamic";
import { OrgProvider } from "@/contexts/OrgContext";
import SparkleTrail from "@/components/SparkleTrail";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Swarm | Enterprise AI Fleet Orchestration",
  description: "Deploy, orchestrate, and scale enterprise-grade AI agent fleets. The ultimate command center for autonomous business operations.",
  icons: {
    icon: "/lobsterlogo.png",
  },
  openGraph: {
    title: "Swarm | Enterprise AI Fleet Orchestration",
    description: "The ultimate command center for autonomous business operations.",
    images: ["/lobsterlogo.png"],
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <Web3Provider>
            <OrgProvider>
              <SparkleTrail>
                {children}
              </SparkleTrail>
            </OrgProvider>
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
