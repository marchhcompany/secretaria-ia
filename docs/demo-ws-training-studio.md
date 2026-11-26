# Demonstração para a WS Training Studio

Objetivo da reunião: mostrar a assistente **funcionando de verdade** no WhatsApp, com informações da própria academia, e não telas ou slides.

## O que já está pronto

- Empresa de demonstração: `npm run seed:demo-academia -- seu@email` cria "WS Training Studio (demonstração)" com o que sabemos com certeza:
  academia em Itaipu, Niterói; objetivo (levar a uma visita ou aula experimental); perguntas de qualificação para academia; preços ocultos;
  agenda em modo "pedido" (a equipe confirma o horário).
- Tudo o que não foi informado (preços, horários, modalidades, endereço completo) **não foi inventado**. Sem esses dados, a assistente diz que
  a equipe confirma e chama a equipe. Isso é intencional e é um bom ponto da demonstração ("ela não inventa").

## Coletar com o proprietário antes da reunião (ou por mensagem)

1. Endereço completo e referência; estacionamento.
2. Horário de funcionamento por dia da semana (vai em *Horários e profissionais*).
3. Modalidades/serviços (musculação, funcional, personal, turmas…), com descrição curta (vai em *Serviços*).
4. Se a assistente pode informar preços dos planos ou não; formas de pagamento.
5. Se existe aula experimental/visita e como agendar (quem confirma, quais horários).
6. Perguntas que mais recebem no WhatsApp e as respostas (vão na *Base de conhecimento*).
7. Quem recebe os alertas de atendimento humano (e-mail) e quem atende no WhatsApp hoje.
8. Para a parte de reativação: se eles têm lista de ex-alunos **com consentimento** para receber mensagens.

## Roteiro sugerido (15 minutos)

1. **Ele mesmo testa no celular dele** (número de teste da Meta ou número dedicado da March, com o celular dele cadastrado):
   - "Oi, quero começar a treinar" → assistente se apresenta, pergunta objetivo e período.
   - "Quanto é a mensalidade?" → mostra a regra de preço configurada.
   - Mandar 3 mensagens seguidas → uma resposta só.
   - "Quero falar com alguém" → passa para a equipe, aparece no painel.
2. **Painel**: a conversa aparece com resumo e classificação (quente/morno/frio); assumir a conversa e responder; devolver para a IA.
3. **Configuração ao vivo**: mudar uma informação na base de conhecimento e perguntar de novo pelo WhatsApp (mudança vale na hora).
4. **Recuperação e reativação**: mostrar a regra de follow-up e a fila em modo simulação ("mostra o que seria enviado, sem enviar").
5. **Custos e transparência**: tela de custos.

## Antes da reunião (checklist técnico)

- [ ] Opção A ou B do `whatsapp-meta.md` funcionando, com o celular do proprietário autorizado (opção A: até 5 números).
- [ ] Empresa de demonstração preenchida com os dados coletados e testada no simulador.
- [ ] `npm run eval -- "WS Training Studio (demonstração)"` rodado (opcional; o eval foi escrito para a March, mas os cenários de preço,
      humano e descadastro valem).
- [ ] Automações em modo simulação.
- [ ] Phone Number ID da demonstração ligado à empresa da WS (um número só pode estar em uma empresa por vez: para a demonstração,
      troque o número de teste da empresa March para a WS e volte depois).

## O que não prometer na reunião

- Transcrição de áudio (não implementada).
- Conexão no número atual da academia sem migração: depende da coexistência via Embedded Signup (ver `whatsapp-meta.md`, opção C), que
  exige a March como Tech Provider ou um parceiro BSP.
- Gestão de Instagram e tráfego pago fazem parte do pacote de R$ 1.500, fora deste sistema.
