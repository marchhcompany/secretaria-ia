"use client";

import { useActionState } from "react";
import { Alert, PasswordInput, SubmitButton } from "@/components/form-bits";
import { resetPassword, type AuthState } from "@/app/entrar/actions";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState<AuthState, FormData>(resetPassword, {});
  return (
    <form action={action} className="grid gap-4" noValidate>
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Nova senha
        </label>
        <PasswordInput id="password" name="password" required minLength={8} autoComplete="new-password" autoFocus />
      </div>
      <div className="grid gap-1.5">
        <label htmlFor="confirm" className="text-sm font-medium">
          Repita a nova senha
        </label>
        <PasswordInput id="confirm" name="confirm" required minLength={8} autoComplete="new-password" />
      </div>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <SubmitButton pendingText="Salvando…">Salvar nova senha</SubmitButton>
    </form>
  );
}
