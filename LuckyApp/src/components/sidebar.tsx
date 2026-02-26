"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sidebarLinks = [
  { href: "/dashboard", label: "Overview", icon: "🏠" },
  { href: "/missions", label: "Tasks", icon: "🎯" },
  { href: "/swarms", label: "Projects", icon: "🐝" },
  { href: "/agents", label: "Agents", icon: "🤖" },
  { href: "/jobs", label: "Job Board", icon: "💼" },
  { href: "/analytics", label: "Analytics", icon: "📊" },
  { href: "/chat", label: "Channels", icon: "💬" },
  { href: "/agent-comms", label: "Agent Comms", icon: "📡" },
  { href: "/logs", label: "Logs", icon: "📋" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 border-r bg-muted/50 min-h-[calc(100vh-4rem)] border-glow-gold">
      <nav className="flex flex-col gap-1 p-4">
        {sidebarLinks.map((link) => {
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-300 btn-glow",
                isActive
                  ? "text-amber-700 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 neon-glow-gold"
                  : "text-muted-foreground hover:text-amber-600 dark:hover:text-amber-300 hover:bg-amber-500/5"
              )}
            >
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gradient-to-b from-yellow-400 to-amber-500 rounded-full animate-pulse-glow" />
              )}
              <span className={isActive ? "animate-icon-pulse" : ""}>{link.icon}</span>
              {link.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
