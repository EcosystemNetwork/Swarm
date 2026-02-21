import { HeaderWrapper as Header } from "@/components/header-wrapper";
import { Sidebar } from "@/components/sidebar";
import { ProtectedRoute } from "@/components/protected-route";

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute>
      <div className="min-h-screen">
        <Header />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
