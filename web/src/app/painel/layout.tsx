import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { conversations } from "@/db/schema";
import { requireBusiness } from "@/lib/business";
import { signOut } from "@/app/entrar/actions";
import { Brand } from "@/components/brand";
import { Nav } from "./nav";

export default async function PainelLayout({ children }: LayoutProps<"/painel">) {
  const { business, user } = await requireBusiness();
  const [{ attention }] = await db
    .select({ attention: count() })
    .from(conversations)
    .where(and(eq(conversations.businessId, business.id), eq(conversations.needsAttention, true)));

  return (
    <div className="mx-auto grid w-full max-w-6xl flex-1 gap-6 px-4 py-6 md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="grid content-start gap-4">
        <div className="grid gap-4 px-3">
          <Brand href="/painel" size="sm" />
          <div className="grid gap-0.5 border-l-2 border-accent pl-3">
            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">Seu negócio</span>
            <strong className="font-display leading-tight">{business.name}</strong>
          </div>
        </div>
        <Nav attention={attention} />
        <form action={signOut} className="hidden px-3 md:block">
          <p className="truncate text-xs text-muted">{user.email}</p>
          <button className="text-xs font-semibold text-accent">Sair</button>
        </form>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
