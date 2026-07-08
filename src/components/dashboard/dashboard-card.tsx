import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";

interface DashboardCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: "brand" | "red" | "yellow" | "green";
}

const accentMap = {
  brand: "bg-brand-50 text-brand-600",
  red: "bg-red-50 text-status-red",
  yellow: "bg-amber-50 text-status-yellow",
  green: "bg-emerald-50 text-status-green",
};

export function DashboardCard({ label, value, icon: Icon, accent = "brand" }: DashboardCardProps) {
  return (
    <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">{label}</p>
        <span className={clsx("flex h-8 w-8 items-center justify-center rounded-lg", accentMap[accent])}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="font-display text-2xl font-semibold text-ink-900">{value}</p>
    </div>
  );
}
