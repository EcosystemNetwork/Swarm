/** Root Layout — App-level providers (ThirdwebProvider, ThemeProvider, OrgProvider, SessionProvider), global fonts, and metadata. */
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Web3Provider } from "@/lib/dynamic";
import { OrgProvider } from "@/contexts/OrgContext";
import { SessionProvider } from "@/contexts/SessionContext";
import SparkleTrail from "@/components/SparkleTrail";
import { ThemeProvider } from "@/components/theme-provider";
import { SkinProvider } from "@/contexts/SkinContext";
import { CommandBar } from "@/components/command-bar";
import { PostHogProvider } from "@/components/posthog-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://swarmprotocol.fun'),
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
          <SkinProvider>
          <Web3Provider>
            <SessionProvider>
            <OrgProvider>
              <PostHogProvider>
              <SparkleTrail>
                <CommandBar />
                {children}
              </SparkleTrail>
              </PostHogProvider>
            </OrgProvider>
            </SessionProvider>
          </Web3Provider>
          </SkinProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
