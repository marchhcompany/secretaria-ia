// Envio de e-mails transacionais pela API do Resend (resend.com).
// Sem RESEND_API_KEY, o e-mail não sai: o conteúdo vai para o log do servidor.

export async function sendEmail(to: string, subject: string, html: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email não enviado: falta RESEND_API_KEY] para=${to} assunto="${subject}"\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "Assistente March <onboarding@resend.dev>",
      to,
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) console.error(`[email] falha ao enviar para ${to}: ${res.status} ${await res.text()}`);
}

export function resetPasswordEmail(name: string, url: string) {
  const first = name.split(" ")[0] || "Olá";
  const text = `${first}, recebemos um pedido para criar uma nova senha na Assistente March.\n\nAbra este link para continuar (vale por 1 hora):\n${url}\n\nSe não foi você, ignore este e-mail. Sua senha atual continua valendo.`;
  const html = `<!doctype html><html><body style="margin:0;background:#0a0a0a;font-family:Arial,Helvetica,sans-serif;color:#f6f3ef">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:32px 16px"><tr><td align="center">
<table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;background:#131211;border:1px solid #2a2522;border-radius:14px;padding:32px">
<tr><td style="font-weight:800;font-size:18px;letter-spacing:.5px">ASSISTENTE <span style="color:#fd5401">MARCH</span></td></tr>
<tr><td style="padding-top:24px;font-size:16px;line-height:1.5">${first}, recebemos um pedido para criar uma nova senha.</td></tr>
<tr><td style="padding:24px 0"><a href="${url}" style="display:inline-block;background:#fd5401;color:#140803;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:8px">Criar nova senha</a></td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#a39b93">O link vale por 1 hora. Se não foi você, ignore este e-mail: sua senha atual continua valendo.</td></tr>
<tr><td style="padding-top:24px;font-size:11px;letter-spacing:2px;color:#a39b93">MARCH COMPANY · TECNOLOGIA QUE MOVE NEGÓCIOS</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: "Crie sua nova senha · Assistente March", html, text };
}
