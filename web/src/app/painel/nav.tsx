"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/painel", label: "Visão geral" },
  { href: "/painel/agenda", label: "Agenda" },
  { href: "/painel/conversas", label: "Conversas" },
  { href: "/painel/leads", label: "Leads" },
  { href: "/painel/simulador", label: "Testar assistente" },
  { href: "/painel/assistente", label: "Assistente" },
  { href: "/painel/servicos", label: "Serviços" },
  { href: "/painel/horarios", label: "Horários e profissionais" },
  { href: "/painel/automacoes", label: "Automações" },
  { href: "/painel/custos", label: "Custos" },
  { href: "/painel/equipe", label: "Empresas e equipe" },
];

export function Nav({ attention }: { attention: number }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {LINKS.map((l) => {
        const active = l.href === "/painel" ? path === l.href : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium ${
              active ? "bg-accent-soft text-ink" : "text-muted hover:text-ink"
            }`}
          >
            {l.label}
            {l.href === "/painel/conversas" && attention > 0 && (
              <span className="rounded-full bg-warm px-2 text-xs font-semibold text-on-accent">{attention}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
