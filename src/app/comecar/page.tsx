"use client";

import { useActionState } from "react";
import { Brand } from "@/components/brand";
import { NetworkBackground } from "@/components/network-bg";
import { SEGMENTS } from "@/lib/templates";
import { createBusiness, type CreateState } from "./actions";

export default function ComecarPage() {
  const [state, action, pending] = useActionState<CreateState, FormData>(createBusiness, {});

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-12">
      <NetworkBackground className="opacity-50" />
      <div className="relative grid w-full max-w-md gap-6">
        <Brand />
        <div className="grid gap-2">
          <span className="eyebrow">Primeiro passo</span>
          <h1 className="h1">Cadastre o seu negócio</h1>
          <p className="text-muted">
            Já deixamos alguns serviços e horários de exemplo para o tipo de negócio escolhido. Depois você ajusta tudo no painel.
          </p>
        </div>
        <form action={action} className="card grid gap-4">
          <label className="label">
            Nome do negócio
            <input id="name" name="name" required className="input" placeholder="Ex.: Clínica Lumière" />
          </label>
          <label className="label">
            Tipo de negócio
            <select id="segment" name="segment" className="input" defaultValue="estetica">
              {SEGMENTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {state.error && <p className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>}
          <button className="btn" disabled={pending}>
            {pending ? "Criando…" : "Criar e ir para o painel"}
          </button>
        </form>
      </div>
    </main>
  );
}
