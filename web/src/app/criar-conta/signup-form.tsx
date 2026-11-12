"use client";

import { useActionState, useState } from "react";
import { Alert, PasswordInput, SubmitButton } from "@/components/form-bits";
import { signUp, type AuthState } from "@/app/entrar/actions";

function strength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length < 8) return { level: 0, label: "Use pelo menos 8 caracteres" };
  if (score <= 2) return { level: 1, label: "Senha fraca" };
  if (score <= 3) return { level: 2, label: "Senha boa" };
  return { level: 3, label: "Senha forte" };
}

export function SignupForm() {
  const [state, action] = useActionState<AuthState, FormData>(signUp, {});
  const [password, setPassword] = useState("");
  const s = strength(password);
  const colors = ["bg-line", "bg-danger", "bg-warm", "bg-success"];

  return (
    <form action={action} className="grid gap-4" noValidate>
      <label className="label">
        Seu nome
        <input id="name" name="name" required autoComplete="name" autoFocus placeholder="Como podemos te chamar?" className="input" />
      </label>
      <label className="label">
        E-mail
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={state.email}
          placeholder="voce@seunegocio.com.br"
          className="input"
        />
      </label>
      <div className="grid gap-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          Senha
        </label>
        <PasswordInput
          id="password"
          name="password"
          required
          minLength={8}
          autoComplete="new-password"
          placeholder="Mínimo de 8 caracteres"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="password-strength"
        />
        <div className="grid grid-cols-3 gap-1.5" aria-hidden>
          {[1, 2, 3].map((i) => (
            <span key={i} className={`h-1 rounded-full transition ${password && s.level >= i ? colors[s.level] : "bg-line"}`} />
          ))}
        </div>
        <span id="password-strength" className="text-xs text-muted">
          {password ? s.label : "Dica: misture letras, números e símbolos."}
        </span>
      </div>
      <label className="flex items-start gap-2.5 text-sm leading-snug text-muted">
        <input id="terms" name="terms" type="checkbox" required className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
        <span>
          Li e aceito os{" "}
          <a href="/termos" target="_blank" className="font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-accent">
            Termos de uso
          </a>{" "}
          e a{" "}
          <a href="/privacidade" target="_blank" className="font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-accent">
            Política de privacidade
          </a>
          .
        </span>
      </label>
      {state.error && <Alert kind="error">{state.error}</Alert>}
      <SubmitButton pendingText="Criando sua conta…">Criar conta</SubmitButton>
    </form>
  );
}
