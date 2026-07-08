export function Topbar({ title, actions }: { title: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="font-display text-2xl font-semibold text-ink-900">{title}</h1>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
