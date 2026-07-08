"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  LayoutDashboard,
  FileText,
  Wallet,
  ShieldCheck,
  Users,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import type { Role } from "@/types";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: Role[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["DSA", "PARTNER", "OPERATIONS", "ADMIN"] },
  { href: "/leads", label: "Leads", icon: FileText, roles: ["DSA", "PARTNER", "OPERATIONS", "ADMIN"] },
  { href: "/payouts", label: "Payouts", icon: Wallet, roles: ["DSA", "PARTNER", "ADMIN"] },
  { href: "/admin", label: "Admin Panel", icon: ShieldCheck, roles: ["ADMIN"] },
  { href: "/admin/users", label: "User Management", icon: Users, roles: ["ADMIN"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  if (!user) return null;
  const items = NAV_ITEMS.filter((item) => item.roles.includes(user.role));

  return (
    <aside className="flex h-screen w-64 shrink-0 flex-col border-r border-ink-100 bg-white">
      <div className="flex items-center gap-2 px-6 py-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          LB
        </div>
        <span className="font-display text-lg font-semibold text-ink-900">Loan Bandhu</span>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-50"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-ink-100 p-4">
        <div className="mb-3 flex items-center gap-3 rounded-lg bg-ink-50 px-3 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
            {user.name?.[0]?.toUpperCase() ?? "U"}
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink-900">{user.name}</p>
            <p className="truncate text-xs text-ink-400">{user.role}</p>
          </div>
        </div>
        <button
          onClick={() => logout()}
          className="focus-ring flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-ink-500 hover:bg-ink-50 hover:text-status-red"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
