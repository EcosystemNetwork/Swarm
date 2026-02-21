import { HeaderWrapper as Header } from "@/components/header-wrapper";
import { Sidebar } from "@/components/sidebar";
import { ProtectedRoute } from "@/components/protected-route";
import { DashboardBackground } from "@/components/dashboard-bg";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen relative">
        <DashboardBackground />
        <div className="relative z-10">
          <Header />
          <div className="flex">
            <Sidebar />
            <main className="flex-1 min-w-0 overflow-x-hidden p-6">{children}</main>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
