"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert, PasswordInput, SubmitButton } from "@/components/form-bits";
import { signIn, type AuthState } from "./actions";

export function LoginForm({ passwordReset }: { passwordReset: boolean }) {
  const [state, action] = useActionState<AuthState, FormData>(signIn, {});

  return (
    <form action={action} className="grid gap-4" noValidate>
      {passwordReset && !state.error && <Alert kind="info">Senha alterada. Entre com a nova senha.</Alert>}
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
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-sm font-medium">
            Senha
          </label>
          <Link href="/esqueci-senha" className="text-sm font-medium text-accent hover:underline">
            Esqueci minha senha
          </Link>
        </div>
        <PasswordInput id="password" name="password" required autoComplete="current-password" placeholder="Sua senha" />
      </div>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input id="remember" name="remember" type="checkbox" defaultChecked className="size-4 accent-[var(--accent)]" />
        Manter conectado neste aparelho
      </label>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <SubmitButton pendingText="Entrando…">Entrar</SubmitButton>
    </form>
  );
}
