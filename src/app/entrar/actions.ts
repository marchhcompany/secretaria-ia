"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export type AuthState = { error?: string; info?: string; email?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!EMAIL.test(email) || !password) return { error: "Informe seu e-mail e sua senha.", email };
  try {
    await auth.api.signInEmail({ body: { email, password, rememberMe: form.get("remember") === "on" }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) {
      if (err.status === "TOO_MANY_REQUESTS") return { error: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.", email };
      return { error: "E-mail ou senha incorretos.", email };
    }
    throw err;
  }
  redirect("/painel");
}

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  if (name.length < 2) return { error: "Informe seu nome.", email };
  if (!EMAIL.test(email)) return { error: "Informe um e-mail válido.", email };
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres.", email };
  if (form.get("terms") !== "on") return { error: "Para continuar, aceite os Termos de uso e a Política de privacidade.", email };
  try {
    await auth.api.signUpEmail({ body: { name, email, password }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) {
      const code = err.body?.code ?? "";
      if (code.startsWith("USER_ALREADY_EXISTS")) return { error: "Já existe uma conta com esse e-mail. Entre ou recupere sua senha.", email };
      if (code === "PASSWORD_TOO_SHORT") return { error: "A senha precisa ter pelo menos 8 caracteres.", email };
      if (code === "PASSWORD_TOO_LONG") return { error: "A senha é longa demais.", email };
      if (err.status === "TOO_MANY_REQUESTS") return { error: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.", email };
      return { error: "Não foi possível criar a conta agora. Tente de novo em instantes.", email };
    }
    throw err;
  }
  redirect("/comecar");
}

export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Informe um e-mail válido.", email };
  if (!process.env.RESEND_API_KEY && process.env.NODE_ENV === "production")
    return { error: "A recuperação por e-mail ainda não está ativa. Fale com o suporte da March Company para redefinir sua senha.", email };
  try {
    await auth.api.requestPasswordReset({ body: { email }, headers: await headers() });
  } catch (err) {
    if (!(err instanceof APIError)) throw err;
    if (err.status === "TOO_MANY_REQUESTS") return { error: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.", email };
  }
  // Mesma resposta exista ou não a conta, para não revelar quais e-mails estão cadastrados.
  return { info: "Se houver uma conta com esse e-mail, enviamos um link para criar uma nova senha. Confira também o spam.", email };
}

export async function resetPassword(_: AuthState, form: FormData): Promise<AuthState> {
  const token = String(form.get("token") ?? "");
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 8) return { error: "A senha precisa ter pelo menos 8 caracteres." };
  if (password !== confirm) return { error: "As duas senhas não são iguais." };
  try {
    await auth.api.resetPassword({ body: { token, newPassword: password }, headers: await headers() });
  } catch (err) {
    if (err instanceof APIError) return { error: "Este link expirou ou já foi usado. Peça um novo em “Esqueci minha senha”." };
    throw err;
  }
  redirect("/entrar?senha=redefinida");
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() });
  redirect("/entrar");
}
