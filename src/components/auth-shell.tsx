import Image from "next/image";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { NetworkBackground } from "@/components/network-bg";

const POINTS = [
  { title: "Responde em segundos", text: "Seus clientes recebem resposta na hora, inclusive à noite e no fim de semana." },
  { title: "Agenda sozinha", text: "Consulta os horários livres e marca direto na sua agenda, sem conflito." },
  { title: "Você no controle", text: "Acompanhe conversas e agendamentos no painel e assuma quando quiser." },
];

/** Tela de autenticação dividida: formulário à esquerda, marca e benefícios à direita. */
export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="grid min-h-dvh flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex flex-col px-5 py-8 sm:px-10">
        <Brand />
        <div className="mx-auto grid w-full max-w-[400px] flex-1 content-center gap-7 py-10">
          <header className="grid gap-2">
            <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
            {subtitle && <p className="text-[15px] text-muted">{subtitle}</p>}
          </header>
          {children}
          {footer && <div className="text-center text-sm text-muted">{footer}</div>}
        </div>
        <p className="text-center text-xs text-muted lg:text-left">
          © {new Date().getFullYear()} March Company ·{" "}
          <a href="/termos" className="hover:text-ink">
            Termos de uso
          </a>{" "}
          ·{" "}
          <a href="/privacidade" className="hover:text-ink">
            Privacidade
          </a>
        </p>
      </main>

      <aside className="relative hidden overflow-hidden border-l border-line bg-surface lg:block">
        <NetworkBackground className="opacity-80" />
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(253,84,1,0.18),transparent_55%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <span className="eyebrow">March Company · Tecnologia que move negócios</span>
          <div className="grid max-w-md gap-8">
            <Image src="/brand/march-symbol.png" alt="" width={84} height={70} />
            <h2 className="font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-balance">
              Nenhum cliente sem resposta. <span className="text-accent">Nenhum horário vazio.</span>
            </h2>
            <ul className="grid gap-5">
              {POINTS.map((p) => (
                <li key={p.title} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                  <span className="mt-1.5 size-2 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
                  <div>
                    <strong className="block font-display text-[15px]">{p.title}</strong>
                    <span className="text-sm leading-relaxed text-muted">{p.text}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="glow-line" />
        </div>
      </aside>
    </div>
  );
}
