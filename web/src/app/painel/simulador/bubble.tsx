export function Bubble({ role, content, time }: { role: string; content: string; time?: string }) {
  if (role === "system") {
    return (
      <p className="my-1 self-center rounded-lg bg-warm-soft px-3 py-1.5 text-center text-xs text-ink">{content}</p>
    );
  }
  const fromBusiness = role === "assistant" || role === "staff";
  return (
    <div
      className={`max-w-[84%] whitespace-pre-line rounded-xl px-3 py-2 text-[15px] leading-snug shadow-sm [overflow-wrap:anywhere] ${
        fromBusiness ? "self-end rounded-tr-sm bg-bubble-out" : "self-start rounded-tl-sm bg-bubble-in"
      }`}
    >
      {role === "staff" && <span className="mb-0.5 block text-xs font-semibold text-accent">Equipe</span>}
      {content}
      {time && <span className="mt-0.5 block text-right font-mono text-[10.5px] text-muted">{time}</span>}
    </div>
  );
}
