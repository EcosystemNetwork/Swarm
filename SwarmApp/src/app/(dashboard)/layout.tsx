/** Layout for Dashboard App — wraps pages with Header, Sidebar, and ProtectedRoute. */
import { HeaderWrapper as Header } from "@/components/header-wrapper";
import { Sidebar } from "@/components/sidebar";
import { ProtectedRoute } from "@/components/protected-route";
import { DashboardBackground } from "@/components/dashboard-bg";
import { DashboardErrorBoundary } from "@/components/dashboard-error-boundary";

export default function DashboardAppLayout({ children }: { children: React.ReactNode }) {
    return (
        <ProtectedRoute>
            <div className="min-h-screen relative bg-background">
                <DashboardBackground />
                <div className="relative z-10 flex flex-col h-screen">
                    <Header />
                    <div className="flex flex-1 overflow-hidden">
                        <Sidebar />
                        <main className="flex-1 min-w-0 overflow-y-auto px-2 py-1">
                            <DashboardErrorBoundary>{children}</DashboardErrorBoundary>
                        </main>
                    </div>
                </div>
            </div>
        </ProtectedRoute>
    );
}
