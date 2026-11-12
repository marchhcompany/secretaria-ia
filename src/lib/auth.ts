import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { resetPasswordEmail, sendEmail } from "@/lib/email";

// Na Vercel, usa o domínio de produção do projeto quando BETTER_AUTH_URL não está definido.
export const appURL =
  process.env.BETTER_AUTH_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const auth = betterAuth({
  baseURL: appURL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    // O link aponta direto para a nossa página de nova senha.
    sendResetPassword: async ({ user, token }) => {
      const mail = resetPasswordEmail(user.name, `${appURL}/redefinir-senha?token=${encodeURIComponent(token)}`);
      await sendEmail(user.email, mail.subject, mail.html, mail.text);
    },
  },
  plugins: [nextCookies()],
});
