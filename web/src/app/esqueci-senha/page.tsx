"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthShell } from "@/components/auth-shell";
import { Alert, SubmitButton } from "@/components/form-bits";
import { requestPasswordReset, type AuthState } from "@/app/entrar/actions";

export default function EsqueciSenhaPage() {
  const [state, action] = useActionState<AuthState, FormData>(requestPasswordReset, {});

  return (
    <AuthShell
      title="Esqueceu a senha?"
      subtitle="Informe o e-mail da sua conta. Vamos enviar um link para você criar uma nova senha."
      footer={
        <Link href="/entrar" className="font-semibold text-accent hover:underline">
          ← Voltar para o login
        </Link>
      }
    >
      <form action={action} className="grid gap-4" noValidate>
        <label className="label">
          E-mail
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            defaultValue={state.email}
            placeholder="voce@seunegocio.com.br"
            className="input"
          />
        </label>
        {state.error && <Alert kind="error">{state.error}</Alert>}
        {state.info && <Alert kind="info">{state.info}</Alert>}
        <SubmitButton pendingText="Enviando…">Enviar link</SubmitButton>
      </form>
    </AuthShell>
  );
}
