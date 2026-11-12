import Image from "next/image";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ChatShowcase } from "@/components/chat-showcase";
import { NetworkBackground } from "@/components/network-bg";

const FEATURES = [
  {
    title: "Responde na hora, 24 horas",
    text: "À noite, no almoço e no fim de semana. O cliente pergunta e recebe resposta em segundos, não no dia seguinte.",
    icon: "M12 6v6l4 2M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
  },
  {
    title: "Agenda direto na sua agenda",
    text: "Consulta os horários livres, oferece opções, confirma com o cliente e marca. Sem conflito de horário.",
    icon: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm4 12 2 2 4-4",
  },
  {
    title: "Fala do jeito do seu negócio",
    text: "Preços, serviços, endereço, regras e o tom de voz que você escolher. Ela só responde o que você cadastrou.",
    icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z",
  },
  {
    title: "Chama sua equipe quando precisa",
    text: "Reclamação, desconto ou assunto delicado: ela avisa no painel e passa a conversa para uma pessoa.",
    icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  },
  {
    title: "Painel com tudo num lugar",
    text: "Agenda do dia, conversas, clientes e quantos agendamentos a assistente trouxe no mês.",
    icon: "M3 3v18h18M7 15l4-4 3 3 5-6",
  },
  {
    title: "Funciona no seu WhatsApp",
    text: "Pela API oficial do WhatsApp. Seu cliente conversa como sempre conversou, sem baixar nada.",
    icon: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z",
  },
];

const STEPS = [
  { title: "Conecte o WhatsApp", text: "Ligamos o número do seu negócio à API oficial do WhatsApp." },
  { title: "Cadastre o seu negócio", text: "Serviços, preços, horários e as perguntas que seus clientes mais fazem." },
  { title: "Deixe a assistente trabalhar", text: "Ela atende, tira dúvidas e agenda. Você acompanha tudo pelo painel." },
];

const NICHES = ["Clínicas de estética", "Pet shops", "Odontologia", "Barbearias", "Salões de beleza", "Estúdios de pilates", "Consultórios"];

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="size-6" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default function Home() {
  return (
    <div className="relative overflow-x-clip">
      {/* Topo */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-bg/75 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Brand />
          <nav className="flex items-center gap-2">
            <a href="#como-funciona" className="hidden px-3 py-2 text-sm text-muted hover:text-ink sm:block">
              Como funciona
            </a>
            <Link href="/entrar" className="btn">
              Entrar
            </Link>
          </nav>
        </div>
      </header>

      {/* Abertura */}
      <section className="relative">
        <NetworkBackground className="opacity-70" />
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(253,84,1,0.16),transparent_60%)]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-20">
          <div className="grid gap-6">
            <span className="eyebrow">March Company · Tecnologia que move negócios</span>
            <h1 className="font-display text-[clamp(2.3rem,6vw,4.1rem)] font-extrabold leading-[1.02] tracking-tight text-balance">
              Seu WhatsApp atendendo e agendando <span className="text-accent">24 horas por dia.</span>
            </h1>
            <p className="max-w-xl text-lg text-muted">
              A Assistente March responde seus clientes na hora, tira dúvidas sobre preços e serviços e marca o horário direto na sua agenda.
              Enquanto você atende quem está na sua frente.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/criar-conta" className="btn px-6 py-3 text-base">
                Começar agora
              </Link>
              <a href="#como-funciona" className="btn-ghost px-5 py-3 text-base">
                Ver como funciona
              </a>
            </div>
            <ul className="mt-2 grid gap-2 text-sm text-muted sm:grid-cols-2">
              {["Resposta em segundos", "Agenda sem conflito de horário", "Passa para sua equipe quando precisa", "API oficial do WhatsApp"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <ChatShowcase />
        </div>
        <div className="glow-line mx-auto max-w-5xl" />
      </section>

      {/* Dor */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-20 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] md:items-center">
        <h2 className="font-display text-3xl font-extrabold leading-tight tracking-tight text-balance sm:text-4xl">
          Cliente que espera resposta <span className="text-accent">procura outro lugar.</span>
        </h2>
        <p className="text-lg text-muted">
          A maioria das mensagens chega fora do horário ou quando a equipe está ocupada. Cada pergunta sem resposta é um horário que ficou
          vazio na agenda. A Assistente March garante que nenhuma conversa fique esperando.
        </p>
      </section>

      {/* Recursos */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="group grid content-start gap-3 bg-surface p-6 transition hover:bg-surface-2">
              <span className="grid size-11 place-items-center rounded-xl border border-accent/30 bg-accent-soft text-accent transition group-hover:shadow-[0_0_24px_rgba(253,84,1,0.35)]">
                <Icon d={f.icon} />
              </span>
              <h3 className="font-display text-lg font-bold">{f.title}</h3>
              <p className="text-sm leading-relaxed text-muted">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="relative scroll-mt-20 border-y border-line bg-surface/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20">
          <div className="grid gap-3">
            <span className="eyebrow">Como funciona</span>
            <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Pronto para atender em três passos</h2>
          </div>
          <ol className="grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative grid content-start gap-3 border-l-2 border-accent pl-5">
                <span className="font-display text-4xl font-extrabold text-accent/90">{i + 1}</span>
                <h3 className="font-display text-lg font-bold">{s.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Para quem é */}
      <section className="mx-auto grid max-w-6xl gap-6 px-4 py-20">
        <div className="grid gap-3">
          <span className="eyebrow">Para quem é</span>
          <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Para quem atende e agenda pelo WhatsApp</h2>
        </div>
        <ul className="flex flex-wrap gap-2.5">
          {NICHES.map((n) => (
            <li key={n} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent">
              {n}
            </li>
          ))}
        </ul>
      </section>

      {/* Chamada final */}
      <section className="relative overflow-hidden border-t border-line">
        <NetworkBackground className="opacity-50" />
        <div className="relative mx-auto grid max-w-3xl justify-items-center gap-6 px-4 py-24 text-center">
          <Image src="/brand/march-symbol.png" alt="" width={72} height={60} />
          <h2 className="font-display text-3xl font-extrabold tracking-tight text-balance sm:text-5xl">
            Coloque seu atendimento <span className="text-accent">em marcha.</span>
          </h2>
          <p className="max-w-xl text-lg text-muted">Teste a Assistente March no seu negócio e veja quantos clientes deixam de ficar sem resposta.</p>
          <Link href="/criar-conta" className="btn px-7 py-3 text-base">
            Começar agora
          </Link>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-muted">
          <span>
            Assistente March é um produto da <strong className="text-ink">March Company</strong>.
          </span>
          <span className="uppercase tracking-[0.2em]">
            Tecnologia que <span className="text-accent">move negócios</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
