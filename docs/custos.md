# Viabilidade financeira · custo por cliente (estimativa, nov/2026)

Nada foi contratado e nenhum crédito foi gasto para estes números. Eles são **estimativas**; o painel *Custos* passa a medir o custo real
de IA de cada empresa e conversa a partir da primeira mensagem.

## Confirmado x estimado

| Item | Valor | Status |
|---|---|---|
| Preço Claude Opus 5.5 | US$ 4 / 20 por milhão de tokens (entrada/saída); cache lido US$ 0,20 | Confirmado (tabela oficial da Anthropic) |
| Preço Claude Sonnet 5.5 | US$ 2 / 10; cache lido US$ 0,10 | Confirmado |
| Preço Claude Haiku 5.5 | US$ 0,10 / 0,50 (até 100 mil tokens por pedido) | Confirmado |
| WhatsApp Brasil · marketing | R$ 0,3217 por mensagem | Estimado a partir de fontes secundárias, **confirmar na Meta** |
| WhatsApp Brasil · utilidade, autenticação e atendimento | R$ 0,035 por mensagem; 1.000 de atendimento grátis por número/mês | **Confirmar na Meta** (mudança de 01/10/2026) |
| Vercel Pro (uso comercial) | US$ 20/mês por membro | Preço público; o plano Hobby não permite uso comercial |
| Banco Postgres gerenciado | US$ 0–25/mês (Neon/Supabase, plano gratuito ou Pro) | Depende do plano atual (não tive acesso) |
| E-mail (Resend) | Grátis até 3.000 e-mails/mês | Preço público |
| Câmbio | R$ 5,40 por US$ | **Premissa** |
| Tributos (Simples Nacional etc.) | Não incluídos | — |

## Premissas por conversa

Uma "conversa" = um contato que escreve e troca mensagens com a assistente até parar.

- 6 mensagens do cliente → 6 respostas da IA, com ~2 chamadas extras de ferramenta (registrar lead, chamar equipe): **8 chamadas à API**.
- Prompt de sistema + ferramentas: ~4.000 tokens (cacheados). Histórico médio: ~1.500 tokens por chamada. Saída: ~300 tokens (raciocínio
  em esforço baixo + resposta curta).
- Metade das chamadas com cache "quente" (mensagens em sequência dentro de 5 minutos). Histórico também cacheado (ajuste feito nesta sessão).
- Mensagens enviadas pelo negócio: **9 por conversa** com a divisão em até 3 balões ligada; **6** com a divisão desligada.

Resultado: **IA por conversa ≈ US$ 0,162 (Opus 5.5) · US$ 0,081 (Sonnet 5.5) · US$ 0,004 (Haiku 5.5)**.

## Cenários mensais (por cliente, em R$)

Meta = só respostas de atendimento (9 por conversa, 1.000 grátis). Infra = US$ 45/mês (Vercel Pro + banco) rateado entre 5 clientes (≈ R$ 49).
Margem sobre a mensalidade de R$ 500, antes de impostos e de mão de obra.

| Conversas/mês | Meta | IA Opus 5.5 | Total Opus | Margem | IA Sonnet 5.5 | Total Sonnet | Margem | IA Haiku 5.5 | Total Haiku | Margem |
|---|---|---|---|---|---|---|---|---|---|---|
| 100 | 0 | 88 | 136 | 73% | 44 | 92 | 82% | 2 | 51 | 90% |
| 500 | 123 | 438 | 609 | −22% | 219 | 390 | 22% | 11 | 182 | 64% |
| 1.000 | 280 | 876 | 1.204 | −141% | 438 | 766 | −53% | 22 | 351 | 30% |
| 3.000 | 910 | 2.627 | 3.586 | −617% | 1.313 | 2.272 | −354% | 67 | 1.026 | −105% |

Automações somam por mensagem: follow-up dentro da janela = R$ 0,035; lembrete por template de utilidade = R$ 0,035; reativação por
template de marketing = R$ 0,32 (100 reativações ≈ R$ 32). Áudio: sem custo hoje (não há transcrição); se for implementada, um serviço de
transcrição custa na faixa de centavos por minuto e exige outro fornecedor.

Com só **um** cliente, a infraestrutura inteira (≈ R$ 243/mês) fica com ele.

> **Atualização (26/11/2026):** o padrão do sistema passou a ser `anthropic:claude-haiku-5-5` e há suporte a OpenAI, Gemini, Groq e
> OpenRouter. Comparação e custo por atendimento de cada um em `provedores-ia.md`.

## Conclusões

1. **R$ 500/mês é saudável até ~300 conversas/mês com Sonnet 5.5 ou ~800 com Haiku 5.5.** Com Opus 5.5 (o padrão atual do sistema),
   só até ~200 conversas.
2. O modelo é a maior alavanca. Ele é configurável **por empresa** no painel. Antes de escolher, rode `npm run eval` com cada modelo na
   empresa March (custa centavos) e compare a qualidade das respostas. A decisão de trocar o modelo é de vocês.
3. Se a cobrança de mensagens de atendimento da Meta for confirmada, ela passa a ser relevante acima de ~150 conversas/mês. Desligar a
   divisão de respostas em balões reduz ~1/3 desse custo.
4. Sugestão comercial: incluir uma **franquia** no plano (ex.: até 300 conversas e uso justo de IA), com excedente cobrado ou repasse dos
   custos da Meta ao cliente (a WABA pode ter o cartão do próprio cliente quando ele entrar por Embedded Signup).
5. Para uma academia do porte da WS, o volume esperado de 100–500 conversas/mês cabe em R$ 500 com Sonnet ou Haiku.

O teto mensal de IA por empresa (painel *Assistente*) evita surpresas: ao atingir, a IA pausa e a equipe assume.
