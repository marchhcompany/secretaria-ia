import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ResetForm } from "./reset-form";

export const metadata = { title: "Nova senha · Assistente March" };

export default async function RedefinirSenhaPage({ searchParams }: PageProps<"/redefinir-senha">) {
  const { token } = await searchParams;
  const valid = typeof token === "string" && token.length > 10;

  return (
    <AuthShell
      title={valid ? "Crie uma nova senha" : "Link inválido"}
      subtitle={valid ? "Escolha uma senha com pelo menos 8 caracteres." : "Este link está incompleto ou já expirou. Peça um novo."}
      footer={
        <Link href={valid ? "/entrar" : "/esqueci-senha"} className="font-semibold text-accent hover:underline">
          {valid ? "← Voltar para o login" : "Pedir um novo link"}
        </Link>
      }
    >
      {valid && <ResetForm token={token} />}
    </AuthShell>
  );
}
