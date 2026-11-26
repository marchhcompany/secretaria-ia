# Provedores de IA · comparação e arquitetura (26/11/2026)

## O que é confirmado e o que não é

- **Anthropic: confirmado na página oficial** (platform.claude.com/docs, lida em 26/11/2026). Nomes e preços do relatório anterior conferem:
  `claude-haiku-5-5` US$ 0,10/0,50, `claude-sonnet-5-5` US$ 2/10, `claude-opus-5-5` US$ 4/20 por milhão de tokens (entrada/saída);
  leitura de cache US$ 0,01 / 0,10 / 0,20. O Haiku 5.5 cobra mais caro (US$ 0,50/2,50) em pedidos acima de 100 mil tokens, o que não
  acontece no nosso uso (~6 mil tokens por chamada). Não há camada gratuita permanente: só créditos iniciais para teste.
- **OpenRouter: confirmado na página oficial** (openrouter.ai/pricing): cobra o preço de tabela de cada provedor, mais **5,5%** na
  compra de créditos (plano Standard; 8% no Business). Modelos grátis: 50 pedidos/dia, ou 1.000/dia depois de comprar US$ 10 em créditos.
- **OpenAI, Google Gemini e Groq: NÃO confirmados.** Os sites oficiais (platform.openai.com, ai.google.dev, groq.com,
  openrouter.ai) estão bloqueados na rede deste ambiente. Os valores abaixo vêm de buscas em fontes secundárias de nov/2026 e
  **precisam ser conferidos** antes de qualquer decisão. As fontes divergiam sobre modelos mais novos (Gemini 3.x, GPT-5.4/6); usei só
  os modelos em que as fontes concordavam. A página da OpenAI cita um modelo "gpt-5-6", sinal de que `gpt-5-mini` pode não ser
  mais o modelo pequeno atual; os sites oficiais de preço da OpenAI e do Gemini redirecionam para `developers.openai.com` e
  `aistudio.google.com`, que ainda não estão liberados neste ambiente.

## Comparação

Custo por atendimento = uma conversa com 6 mensagens do cliente (~8 chamadas, ~5.500 tokens de entrada por chamada com metade em cache,
300 de saída). Câmbio R$ 5,40.

| Provedor · modelo | Entrada/saída (US$/1M) | Fonte do preço | Custo por atendimento | 500 atendimentos/mês | Ferramentas (tool calling) | Saída estruturada | Camada gratuita |
|---|---|---|---|---|---|---|---|
| Anthropic · Claude Haiku 5.5 | 0,10 / 0,50 | **Oficial** | R$ 0,02 | R$ 10 | Sim (strict) | Sim | Não (créditos iniciais) |
| Anthropic · Claude Sonnet 5.5 | 2 / 10 | **Oficial** | R$ 0,38 | R$ 190 | Sim (strict) | Sim | Não |
| Anthropic · Claude Opus 5.5 | 4 / 20 | **Oficial** | R$ 0,76 | R$ 379 | Sim (strict) | Sim | Não |
| OpenAI · GPT-5 mini | 0,25 / 2,00 | Secundária | R$ 0,06 | R$ 29 | Sim (strict) | Sim | Não |
| OpenAI · GPT-5 nano | 0,05 / 0,40 | Secundária | R$ 0,01 | R$ 6 | Sim | Sim | Não |
| Google · Gemini 2.5 Flash | 0,30 / 2,50 | Secundária | R$ 0,10 | R$ 52 | Sim | Sim | Sim, mas os dados podem ser usados pelo Google |
| Google · Gemini 2.5 Flash-Lite | 0,10 / 0,40 | Secundária | R$ 0,03 | R$ 14 | Sim | Sim | Sim, idem |
| Groq · GPT-OSS 120B | 0,15 / 0,60 | Secundária | R$ 0,04 | R$ 17 | Sim | Parcial | Sim, com limites baixos (~1.000 pedidos/dia) |
| OpenRouter · qualquer um acima | preço do provedor + 5,5% na compra de créditos | **Oficial** | idem + 5,5% | idem | Depende do modelo | Depende do modelo | Modelos grátis: 50 pedidos/dia (1.000 com US$ 10 de créditos) |

Critérios que **não medi** e por isso não aparecem como fatos:

- **Qualidade em português e latência:** só dá para afirmar depois de rodar `npm run eval` com cada modelo (o Groq costuma ser o mais
  rápido, mas não medi).
- **Privacidade:**
  - Em todos, use só a API paga. Na camada gratuita do Gemini, o conteúdo pode ser usado para melhorar produtos do Google: **não usar com
    conversas reais de clientes**.
  - O OpenRouter informa que não registra prompts por padrão, mas repassa para o provedor do modelo, que tem a própria política.
- **Confiabilidade comercial:** Anthropic, OpenAI e Google vendem direto, com termos empresariais. O Groq hospeda modelos abertos. O
  OpenRouter é um intermediário: útil para testar muitos modelos, mas é mais uma empresa no caminho dos dados.

## Recomendação

1. **Modelo padrão: `anthropic:claude-haiku-5-5`.** É o único dos baratos com preço confirmado oficialmente, usa o mesmo caminho que
   já está testado (ferramentas estritas e cache de prompt) e custa cerca de R$ 0,02 por atendimento. Saí do Opus 5.5 porque ele custa 40
   vezes mais e ainda não há medição mostrando que precisamos dessa qualidade. **A escolha final deve sair da avaliação abaixo.**
2. **Alternativas para não depender de um só provedor:** `openai:gpt-5-mini` e `gemini:gemini-2.5-flash-lite`, ambos pela API paga.
   Basta colocar a chave e escolher o modelo no painel.
3. **Escalonamento por qualidade:** se o Haiku falhar em algum cenário da avaliação, testar o `claude-sonnet-5-5` só para a empresa que
   precisar (o modelo é configurável por empresa).

## Custo da avaliação (aguardando sua autorização)

`npm run eval -- "March Company" <modelo> --confirmar` roda 9 cenários (10 mensagens) com textos **fictícios**, sem enviar nenhum dado
real. Sem `--confirmar`, o comando só mostra a estimativa. Estimativa conservadora (sem desconto de cache):

| Modelo | Custo estimado da avaliação |
|---|---|
| anthropic:claude-haiku-5-5 | até US$ 0,012 (≈ R$ 0,06) |
| anthropic:claude-sonnet-5-5 | até US$ 0,24 (≈ R$ 1,30) |
| anthropic:claude-opus-5-5 | até US$ 0,48 (≈ R$ 2,59) |
| openai:gpt-5-mini | até US$ 0,035 (≈ R$ 0,19) |
| openai:gpt-5-nano | até US$ 0,007 (≈ R$ 0,04) |
| gemini:gemini-2.5-flash | até US$ 0,042 (≈ R$ 0,23) |
| gemini:gemini-2.5-flash-lite | até US$ 0,011 (≈ R$ 0,06) |
| groq:openai/gpt-oss-120b | até US$ 0,017 (≈ R$ 0,09) |
| **Todos os 8** | **até US$ 0,86 (≈ R$ 4,70)** |

Cada provedor exige uma conta com chave de API paga (com cartão). As chamadas não saem deste ambiente: os hosts dos provedores estão
bloqueados aqui. A avaliação roda na sua máquina (com o `.env.local`) ou depois de liberarmos a rede.

## Arquitetura (implementada)

- `web/src/lib/ai/`: `catalog.ts` (modelos, preços e fonte de cada preço), `types.ts` (interface neutra), `anthropic.ts` (SDK oficial
  da Anthropic) e `compat.ts` (SDK oficial da OpenAI apontando para OpenAI, Gemini, Groq ou OpenRouter pelos endpoints compatíveis
  documentados por cada um).
- O modelo é `provedor:modelo`, escolhido por empresa no painel (*Assistente → Modelo de IA*) ou pelo padrão `AI_MODEL` do servidor.
- O histórico de cada conversa fica no formato do provedor que a atendeu. Se a empresa trocar de provedor, o histórico é reconstruído
  a partir das mensagens (testado).
- O custo de cada chamada é gravado por empresa e conversa com o preço do catálogo. Em fallback, vale o modelo que respondeu de fato.
- A mesma pasta `lib/ai` pode ser copiada para o JARVIS: ela não depende de nada específico da March Assistente além do tipo das ferramentas.

### Fontes

- Anthropic (oficial): https://platform.claude.com/docs/en/about-claude/pricing · https://platform.claude.com/docs/en/about-claude/models/overview
- Gemini (secundárias): https://modelpricing.ai/models/google · https://aibusinessweekly.net/p/gemini-api-pricing · https://www.cloudzero.com/blog/gemini-pricing/ · https://ourcodeworld.com/articles/read/4598/google-gemini-api-pricing-2026-flash-pro-and-the-costs
- OpenAI (secundárias): https://www.silicondata.com/use-cases/openai-api-pricing-per-1m-tokens · https://apievangelist.com/2026/11/06/openai-api-pricing-what-every-model-costs-per-million-tokens/ · https://benchlm.ai/openai/api-pricing
- Groq (secundárias): https://www.cloudzero.com/blog/groq-pricing/ · https://plugsky.com/articles/groq-pricing · https://www.maximem.ai/blog/groq-api-pricing-2026
- OpenRouter: https://openrouter.ai/pricing · https://openrouter.ai/docs/faq · https://dupple.com/learn/openrouter-pricing
