import type { ReactNode } from "react";

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="mb-6 grid gap-1">
      <h1 className="h1">{title}</h1>
      {children && <p className="max-w-2xl text-muted">{children}</p>}
    </header>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "Agendado", cls: "bg-bg text-muted" },
  confirmed: { label: "Confirmado", cls: "bg-success-soft text-success" },
  canceled: { label: "Cancelado", cls: "bg-danger-soft text-danger" },
  done: { label: "Atendido", cls: "bg-bg text-ink" },
  no_show: { label: "Faltou", cls: "bg-warm-soft text-warm" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.scheduled;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-sm text-muted">{children}</p>;
}
