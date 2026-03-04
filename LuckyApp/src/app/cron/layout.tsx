/** Layout for /cron — wraps page with Header, Sidebar, and ProtectedRoute. */
import { HeaderWrapper as Header } from "@/components/header-wrapper";
import { Sidebar } from "@/components/sidebar";
import { ProtectedRoute } from "@/components/protected-route";

export const metadata = { title: "Cron Scheduler — Swarm" };

export default function CronLayout({ children }: { children: React.ReactNode }) {
    return (
        <ProtectedRoute>
            <div className="min-h-screen">
                <Header />
                <div className="flex">
                    <Sidebar />
                    <main className="flex-1 min-w-0 overflow-x-hidden p-6">{children}</main>
                </div>
            </div>
        </ProtectedRoute>
    );
}
