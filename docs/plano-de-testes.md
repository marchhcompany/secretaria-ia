# Plano de testes

Três camadas. Só a terceira envolve mensagens reais, e só com celulares autorizados.

| Camada | Comando | Custo | O que valida |
|---|---|---|---|
| 1. Integração automatizada | `cd web && npm test` | Zero (modelo roteirizado, WhatsApp falso, Postgres local) | Fluxo, concorrência, pausa, falhas, automações, isolamento |
| 2. Avaliação com o modelo real | `cd web && npm run eval -- "March Company"` | Centavos de dólar por cenário (precisa de `ANTHROPIC_API_KEY`) | Comportamento da IA: tom, regras comerciais, qualificação |
| 3. Ponta a ponta no WhatsApp | Manual, roteiro abaixo | Mensagens de teste da Meta | Entrega real e status vindos da Meta |

O que "validado" significa: a resposta chegou ao celular **e** o painel mostra o status *entregue/lida* recebido do webhook da Meta.
Um HTTP 200 sozinho não conta.

## Cenários

| # | Cenário | Camada 1 (automatizado) | Camada 2 (eval) | Camada 3 (manual) |
|---|---|---|---|---|
| 1 | Pergunta quais serviços a March oferece | Prompt contém serviços, identidade e regras | Cenário 1 | Sim |
| 2 | Dono de loja quer loja online | Registro do lead (tipo de negócio, interesse, resumo) | Cenário 2 | Sim |
| 3 | Pergunta o preço diretamente | Preço nunca entra no prompt com "ocultar preços" | Cenário 3 (insiste duas vezes) | Sim |
| 4 | Empresário interessado em IA | — | Cenário 4 | Sim |
| 5 | Lead para de responder | Follow-up agendado, simulado (dry-run), enviado dentro da janela, bloqueado fora dela sem template, cancelado se o cliente responde | — | Ligar a regra com atraso de 1 h e conferir na fila (modo simulação) |
| 6 | Pede atendimento humano | IA pausa, aviso sai, próximas mensagens ficam para a equipe | Cenário 6 | Sim + conferir e-mail de alerta |
| 7 | Várias mensagens seguidas | 3 mensagens → 1 chamada à IA e 1 resposta | — | Mandar 3 mensagens rápidas |
| 8 | Pergunta sem resposta na base | — | Cenário 8 (endereço não cadastrado) | Sim |
| 9 | Envia áudio | Resposta pedindo texto, sem chamar a IA | — | Sim |
| 10 | Pede para não receber mais mensagens | Descadastro sem IA, automações canceladas, confirmação única | Cenário 10 | Sim |
| 11 | Falha temporária da IA | Erro 500 → aviso único ao cliente, alerta, mensagem preservada para a próxima resposta | — | Opcional: chave inválida em ambiente de teste |
| 12 | Webhook duplicado | Mesmo `wamid` duas vezes → processado uma vez (também testado via HTTP local) | — | — |
| 13 | Atendente assume | Resposta gerada durante a troca é descartada; ao retomar, a IA recebe o que a equipe escreveu; resposta pelo celular (coexistência) pausa a IA | — | Assumir pelo painel e responder |
| 14 | Acesso a dados de outra empresa | Número de outra empresa não entrega; ferramenta não cancela agendamento de outra empresa; prompt não contém dados de outra empresa | Cenário 14 | — |

Extras automatizados: teto de custo, IA desligada, status "failed" da Meta, assinatura HMAC, cifra de tokens, detecção de descadastro.

## Roteiro ponta a ponta (camada 3)

Pré-requisitos: opção A ou B de `whatsapp-meta.md` concluída; empresa March configurada; automações em **modo simulação**.

1. Do celular autorizado, envie "Oi". Confira: resposta em até ~15 s, se apresenta como assistente virtual, painel mostra *entregue* → *lida*.
2. Rode os cenários 1, 2, 3, 4, 8 em conversas separadas (use celulares diferentes ou espere 24 h; ou apague o contato no painel).
3. Cenário 7: mande "oi", "tudo bem?", "queria um site" em 3 segundos. Deve vir uma resposta só.
4. Cenário 9: mande um áudio.
5. Cenário 13: no painel, clique em *Assumir e pausar a IA*, responda pelo painel, mande mensagem do celular (a IA não responde), clique
   em *Retomar a IA* e mande outra (a IA responde sabendo o que a equipe disse).
6. Cenário 6: peça "quero falar com uma pessoa". Confira o aviso no painel e o e-mail.
7. Cenário 10: mande "não quero mais receber mensagens". Confira em *Leads* que ficou descadastrado.
8. Em *Custos*, confira o custo das conversas de teste.
