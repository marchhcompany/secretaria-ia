import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";

// Dados da empresa usados nos textos legais. Preencher antes de receber clientes.
export const COMPANY = {
  name: "March Company",
  cnpj: "[CNPJ da March Company]",
  email: "[e-mail de contato]",
  updated: "8 de outubro de 2026",
};

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex-1">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Brand />
          <Link href="/entrar" className="text-sm font-semibold text-accent">
            Entrar
          </Link>
        </div>
      </header>
      <main className="mx-auto grid max-w-3xl gap-8 px-4 py-12">
        <header className="grid gap-2">
          <span className="eyebrow">Assistente March</span>
          <h1 className="font-display text-4xl font-extrabold tracking-tight">{title}</h1>
          <p className="text-sm text-muted">Última atualização: {COMPANY.updated}</p>
        </header>
        <article className="grid gap-6 text-[15px] leading-relaxed text-ink/90 [&_h2]:mt-2 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:grid [&_ul]:gap-1.5">
          {children}
        </article>
      </main>
    </div>
  );
}
