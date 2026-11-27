---
description: Chama o REVISOR — um agente que não escreveu o código lê o que mudou e aponta os problemas (nunca edita)
argument-hint: [commit, faixa a..b, T-NNN do quadro, ou vazio = o que não subiu / o último commit]
---

Chame o subagente `revisor` (ferramenta Agent, subagent_type "revisor") para revisar: $ARGUMENTS
(vazio = o que ainda não subiu para o GitHub; se já subiu tudo, o último commit). Passe junto o que já se sabe da conversa
que ajude a entender a INTENÇÃO da mudança (o pedido do dono, o `T-NNN`), mas não a sua opinião sobre o código: ele tem de ler
com olhos de fora.

Quando ele terminar:
1. Repasse ao dono os achados dele, curto, do mais grave para o menos.
2. Bug confirmado (ele mostrou o caminho no código): conserte, rode o que a área pede (`node --check`; `npm test` se o
   conserto toca o que o teste cobre), commit com o `(T-NNN)` e push. Opinião ou "a conferir": só relate, não mexa.
3. No quadro (`quadro/tarefas.json`), o cartão da tarefa ganha `"revisado": true` e uma nota com o resultado.
4. Diga o custo (tokens e tempo do revisor).
