import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { TonConnectProvider } from "@/components/ton-connect-provider";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
    title: "Swarm | TON Treasury",
    description: "Telegram-native payments and bounties on TON",
};

/** Minimal layout for TMA — no dashboard chrome, no thirdweb, no session. */
export default function TmaLayout({ children }: { children: React.ReactNode }) {
    return (
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
            <TonConnectProvider>
                <div className={`${inter.className} min-h-screen bg-background text-foreground`}>
                    {children}
                </div>
            </TonConnectProvider>
        </ThemeProvider>
    );
}
