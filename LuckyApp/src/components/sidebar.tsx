"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sidebarLinks = [
  { href: "/dashboard", label: "Overview", icon: "🏠" },
  { href: "/missions", label: "Missions", icon: "🎯" },
  { href: "/swarms", label: "Swarms", icon: "🐝" },
  { href: "/agents", label: "Agents", icon: "🤖" },
  { href: "/analytics", label: "Analytics", icon: "📊" },
  { href: "/chat", label: "Command", icon: "💬" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 border-r bg-gray-50/50 min-h-[calc(100vh-4rem)]">
      <nav className="flex flex-col gap-1 p-4">
        {sidebarLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === link.href
                ? "bg-green-50 text-green-700"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
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
