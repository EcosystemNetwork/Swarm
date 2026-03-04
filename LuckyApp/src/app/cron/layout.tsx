import type { Metadata } from "next";

export const metadata: Metadata = { title: "Cron Scheduler — Swarm" };

export default function CronLayout({ children }: { children: React.ReactNode }) {
    return children;
}
