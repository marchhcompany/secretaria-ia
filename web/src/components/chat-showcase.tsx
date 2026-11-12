"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { from: "cliente" | "assistente"; text: string; time: string };
type Scenario = { id: string; label: string; business: string; booked: string; msgs: Msg[] };

const SCENARIOS: Scenario[] = [
  {
    id: "estetica",
    label: "Estética",
    business: "Clínica Lumière",
    booked: "Avaliação · quarta, 15h30",
    msgs: [
      { from: "cliente", text: "Oi, boa noite! Quanto custa o botox?", time: "22:14" },
      { from: "assistente", text: "Oi, boa noite! 😊 O botox fica a partir de R$ 890 por região. O valor exato sai na avaliação, que é gratuita. Quer que eu reserve um horário?", time: "22:14" },
      { from: "cliente", text: "Quero! Tem na quarta?", time: "22:15" },
      { from: "assistente", text: "Tenho quarta às 10h ou às 15h30. Qual fica melhor?", time: "22:15" },
      { from: "cliente", text: "15h30. Sou a Juliana", time: "22:16" },
      { from: "assistente", text: "Prontinho, Juliana! Avaliação agendada para quarta às 15h30. Até lá! ✨", time: "22:16" },
    ],
  },
  {
    id: "pet",
    label: "Pet shop",
    business: "Patas & Cia",
    booked: "Banho e tosa · sexta, 9h",
    msgs: [
      { from: "cliente", text: "Quanto é banho e tosa pra um shih tzu?", time: "21:37" },
      { from: "assistente", text: "Para shih tzu fica R$ 85. Com hidratação, R$ 105. Também buscamos em casa por R$ 15. Quer agendar? 🐶", time: "21:37" },
      { from: "cliente", text: "Com hidratação e busca, amanhã de manhã", time: "21:38" },
      { from: "assistente", text: "Combinado! Busca sexta às 9h, total R$ 120. Qual o nome do pet e o endereço?", time: "21:38" },
      { from: "cliente", text: "Thor, Rua Alecrim 45", time: "21:39" },
      { from: "assistente", text: "Anotado: Thor, Rua Alecrim, 45. Até amanhã! 🐾", time: "21:39" },
    ],
  },
  {
    id: "odonto",
    label: "Odontologia",
    business: "Sorriso Prime",
    booked: "Urgência · segunda, 8h",
    msgs: [
      { from: "cliente", text: "To com muita dor de dente, vocês atendem amanhã?", time: "20:41" },
      { from: "assistente", text: "Sinto muito pela dor. Tenho um encaixe de urgência amanhã às 8h com o Dr. Felipe. Posso reservar?", time: "20:41" },
      { from: "cliente", text: "Pode. Aceita Amil?", time: "20:42" },
      { from: "assistente", text: "Aceitamos Amil Dental. Reservado para segunda às 8h. Já avisei a equipe sobre a urgência.", time: "20:42" },
    ],
  },
  {
    id: "barbearia",
    label: "Barbearia",
    business: "Barbearia Navalha",
    booked: "Corte + barba · sábado, 11h",
    msgs: [
      { from: "cliente", text: "Fala! Tem horário amanhã pra corte e barba?", time: "23:02" },
      { from: "assistente", text: "Tenho sim! Corte + barba sai R$ 70. Amanhã tem 9h com o Léo ou 11h com o Diego.", time: "23:02" },
      { from: "cliente", text: "11h com o Diego", time: "23:03" },
      { from: "assistente", text: "Fechado! Sábado às 11h com o Diego. ✂️", time: "23:03" },
    ],
  },
];

export function ChatShowcase() {
  const [index, setIndex] = useState(0);
  const [shown, setShown] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [booked, setBooked] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const scenario = SCENARIOS[index];

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, reduce ? 0 : ms));

    at(0, () => {
      setShown([]);
      setBooked(false);
    });
    let t = 400;
    scenario.msgs.forEach((m) => {
      if (m.from === "assistente") {
        at(t, () => setTyping(true));
        t += 700 + Math.min(m.text.length * 14, 1400);
        at(t, () => {
          setTyping(false);
          setShown((s) => [...s, m]);
        });
      } else {
        t += 900;
        at(t, () => setShown((s) => [...s, m]));
      }
    });
    at(t + 500, () => setBooked(true));
    if (!reduce) at(t + 4200, () => setIndex((i) => (i + 1) % SCENARIOS.length));
    return () => timers.forEach(clearTimeout);
  }, [scenario]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [shown, typing]);

  return (
    <div className="grid justify-items-center gap-4">
      <div className="relative w-full max-w-[340px]">
        <div aria-hidden className="absolute -inset-10 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative rounded-[40px] border border-white/10 bg-[#050505] p-2.5 shadow-[0_30px_80px_-20px_rgba(253,84,1,0.45)]">
          <div className="overflow-hidden rounded-[32px] bg-chat">
            <div className="flex items-center gap-3 border-b border-white/5 bg-surface-2 px-4 py-3">
              <span className="grid size-9 place-items-center rounded-full bg-accent text-sm font-bold text-on-accent">
                {scenario.business.slice(0, 1)}
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-sm">{scenario.business}</strong>
                <span className="text-xs text-accent">{typing ? "digitando…" : "online agora"}</span>
              </div>
            </div>
            <div ref={listRef} className="flex h-[380px] flex-col gap-2 overflow-hidden px-3 py-4" aria-live="polite">
              {shown.map((m, i) => (
                <div
                  key={`${scenario.id}-${i}`}
                  className={`rise max-w-[85%] rounded-2xl px-3 py-2 text-[13.5px] leading-snug ${
                    m.from === "assistente"
                      ? "self-end rounded-tr-sm border border-accent/25 bg-bubble-out"
                      : "self-start rounded-tl-sm bg-bubble-in"
                  }`}
                >
                  {m.text}
                  <span className="mt-0.5 block text-right font-mono text-[10px] text-muted">{m.time}</span>
                </div>
              ))}
              {typing && (
                <div className="rise flex gap-1 self-end rounded-2xl rounded-tr-sm border border-accent/25 bg-bubble-out px-3 py-3">
                  {[0, 1, 2].map((d) => (
                    <i key={d} className="size-1.5 rounded-full bg-accent" style={{ animation: `blink 1s ${d * 0.15}s infinite` }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div
          className={`absolute -right-3 bottom-16 rounded-xl border border-accent/40 bg-surface px-3 py-2 text-xs shadow-xl transition duration-500 sm:-right-10 ${
            booked ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
          }`}
        >
          <span className="block font-semibold text-accent">✓ Agendado pela assistente</span>
          <span className="text-muted">{scenario.booked}</span>
        </div>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5" role="tablist" aria-label="Exemplos de negócio">
        {SCENARIOS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            role="tab"
            aria-selected={i === index}
            onClick={() => setIndex(i)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              i === index ? "border-accent bg-accent text-on-accent" : "border-line text-muted hover:border-accent hover:text-ink"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
