import Image from "next/image";
import Link from "next/link";

/** Símbolo da March + nome do produto. */
export function Brand({ href = "/", size = "md" }: { href?: string; size?: "sm" | "md" }) {
  const icon = size === "sm" ? 28 : 36;
  return (
    <Link href={href} className="inline-flex items-center gap-2.5" aria-label="Assistente March, início">
      <Image src="/brand/march-symbol.png" alt="" width={icon} height={Math.round(icon * 0.84)} priority />
      <span className="grid leading-none">
        <span className={`font-display font-extrabold tracking-tight ${size === "sm" ? "text-[15px]" : "text-lg"}`}>
          ASSISTENTE <span className="text-accent">MARCH</span>
        </span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.28em] text-muted">by March Company</span>
      </span>
    </Link>
  );
}
