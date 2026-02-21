"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sidebarLinks = [
  { href: "/dashboard", label: "Overview", icon: "🏠" },
  { href: "/missions", label: "Tasks", icon: "🎯" },
  { href: "/swarms", label: "Projects", icon: "🐝" },
  { href: "/agents", label: "Agents", icon: "🤖" },
  { href: "/analytics", label: "Analytics", icon: "📊" },
  { href: "/chat", label: "Channels", icon: "💬" },
  { href: "/logs", label: "Logs", icon: "📋" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 border-r bg-muted/50 min-h-[calc(100vh-4rem)]">
      <nav className="flex flex-col gap-1 p-4">
        {sidebarLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === link.href
                ? "bg-amber-50 text-amber-700"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span>{link.icon}</span>
            {link.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
