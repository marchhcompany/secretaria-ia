const STATUS: Record<string, string> = {
  pending: "enviando…",
  sent: "enviada",
  delivered: "entregue",
  read: "lida",
  failed: "não enviada",
  discarded: "descartada (equipe assumiu)",
};

export function Bubble({
  role,
  content,
  time,
  status,
  source,
}: {
  role: string;
  content: string;
  time?: string;
  status?: string | null;
  source?: string | null;
}) {
  if (role === "system") {
    return <p className="my-1 self-center rounded-lg bg-warm-soft px-3 py-1.5 text-center text-xs text-ink">{content}</p>;
  }
  const fromBusiness = role === "assistant" || role === "staff";
  const label =
    role === "staff" ? "Equipe" : role === "assistant" ? (source?.startsWith("automation") ? "Automação" : "Assistente (IA)") : null;
  const bad = status === "failed" || status === "discarded";
  return (
    <div
      className={`max-w-[84%] whitespace-pre-line rounded-xl px-3 py-2 text-[15px] leading-snug shadow-sm [overflow-wrap:anywhere] ${
        fromBusiness ? "self-end rounded-tr-sm bg-bubble-out" : "self-start rounded-tl-sm bg-bubble-in"
      } ${bad ? "opacity-60" : ""}`}
    >
      {label && <span className={`mb-0.5 block text-xs font-semibold ${role === "staff" ? "text-accent" : "text-muted"}`}>{label}</span>}
      {content}
      {(time || status) && (
        <span className={`mt-0.5 block text-right font-mono text-[10.5px] ${bad ? "text-danger" : "text-muted"}`}>
          {time}
          {status ? ` · ${STATUS[status] ?? status}` : ""}
        </span>
      )}
    </div>
  );
}
