import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar · Assistente March" };

export default async function EntrarPage({ searchParams }: PageProps<"/entrar">) {
  const params = await searchParams;
  return (
    <AuthShell
      title="Bem-vindo de volta"
      subtitle="Entre para acompanhar a agenda e as conversas da sua assistente."
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link href="/criar-conta" className="font-semibold text-accent hover:underline">
            Criar conta grátis
          </Link>
        </>
      }
    >
      <LoginForm passwordReset={params.senha === "redefinida"} />
    </AuthShell>
  );
}
