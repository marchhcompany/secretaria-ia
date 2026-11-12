import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "./signup-form";

export const metadata = { title: "Criar conta · Assistente March" };

export default function CriarContaPage() {
  return (
    <AuthShell
      title="Crie sua conta"
      subtitle="Em poucos minutos sua assistente está pronta para atender no WhatsApp do seu negócio."
      footer={
        <>
          Já tem conta?{" "}
          <Link href="/entrar" className="font-semibold text-accent hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
