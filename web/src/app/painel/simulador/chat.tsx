"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { resetSimulator, sendSimulatorMessage, type SimMessage } from "../actions";
import { Bubble } from "./bubble";

export function Chat({
  businessName,
  timeZone,
  initialConversationId,
  initialMessages,
}: {
  businessName: string;
  timeZone: string;
  initialConversationId: string;
  initialMessages: SimMessage[];
}) {
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, pending]);

  const time = (iso: string) =>
    new Intl.DateTimeFormat("pt-BR", { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

  function push(role: string, content: string) {
    setMessages((m) => [...m, { id: crypto.randomUUID(), role, content, createdAt: new Date().toISOString() }]);
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    setDraft("");
    setNotice(null);
    push("customer", text);
    startTransition(async () => {
      const outcome = await sendSimulatorMessage(conversationId, text);
      if (outcome.status === "replied") {
        if (outcome.handoff) push("system", "A assistente passou a conversa para a equipe.");
        for (const part of outcome.parts) push("assistant", part.text);
      } else if (outcome.status === "human") {
        setNotice("Esta conversa está com a equipe, então a assistente não responde. Comece uma nova conversa para testar de novo.");
      } else if (outcome.status === "disabled") {
        setNotice("A IA está desligada para este negócio (Assistente → IA ligada).");
      } else if (outcome.status === "not_configured") {
        setNotice("A assistente ainda não está ativada (falta a chave da API).");
      } else if (outcome.status === "error" || outcome.status === "blocked") {
        setNotice(`A assistente não respondeu: ${outcome.message} No WhatsApp, o cliente receberia um aviso de que a equipe vai responder.`);
      }
    });
  }

  function reset() {
    startTransition(async () => {
      const fresh = await resetSimulator();
      setConversationId(fresh.conversationId);
      setMessages(fresh.messages);
      setNotice(null);
    });
  }

  return (
    <div className="mx-auto grid w-full max-w-md gap-3">
      <div className="overflow-hidden rounded-[32px] border-[10px] border-[#050505] shadow-[0_30px_80px_-24px_rgba(253,84,1,0.45)] ring-1 ring-white/10">
        <div className="flex items-center justify-between gap-3 bg-accent px-4 py-3 text-on-accent">
          <div className="min-w-0">
            <strong className="block truncate text-sm">{businessName}</strong>
            <span className="text-xs opacity-80">{pending ? "digitando…" : "online"}</span>
          </div>
          <button type="button" onClick={reset} disabled={pending} className="rounded-md bg-on-accent/15 px-2 py-1 text-xs font-semibold">
            Nova conversa
          </button>
        </div>
        <div ref={listRef} className="flex h-[480px] flex-col gap-1.5 overflow-y-auto bg-chat p-3">
          {messages.length === 0 && (
            <p className="m-auto max-w-[80%] text-center text-sm text-muted">
              Mande a primeira mensagem como um cliente faria. Ex.: “Oi, quanto custa uma avaliação?”
            </p>
          )}
          {messages.map((m) => (
            <Bubble key={m.id} role={m.role} content={m.content} time={time(m.createdAt)} />
          ))}
          {pending && messages.at(-1)?.role === "customer" && (
            <div className="self-end rounded-xl bg-bubble-out px-3 py-2 text-sm text-muted">digitando…</div>
          )}
        </div>
        <form onSubmit={send} className="flex gap-2 bg-surface p-2">
          <input
            id="sim-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Mensagem"
            className="input rounded-full"
            aria-label="Mensagem do cliente"
            autoComplete="off"
          />
          <button className="btn rounded-full" disabled={pending || !draft.trim()}>
            Enviar
          </button>
        </form>
      </div>
      {notice && <p className="rounded-lg bg-warm-soft px-3 py-2 text-sm">{notice}</p>}
    </div>
  );
}
