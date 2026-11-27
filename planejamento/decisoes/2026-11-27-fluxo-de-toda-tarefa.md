# O fluxo de toda tarefa: o padrão do vídeo do devleor, adaptado ao Lubelion

- **Data:** 2026-11-27 · **Commit:** 02d2cef (T-001) · **Área:** o processo (`CLAUDE.md`, `.claude/`)
- **Decidido:**
  - **Quadro de tarefas próprio** (`quadro/tarefas.json`), que se vê em `localhost:5173/quadro/index.html` ou em `/quadro/` no Pages. Cada pedido que muda arquivo ganha um cartão `T-NNN` e passa por a fazer → fazendo → revisar → testar → feito. O commit leva o `(T-NNN)`.
  - **"Commita isso aí"** (ou "sobe isso"), dito pelo dono: commit e push na hora, pulando as etapas que faltam. O cartão fica marcado como **atalho**.
  - **Os testes ficam com os agentes fortes.** O `npm test` deles vale para o servidor, a rede, `js/inimigos/`, o mapa lógico, `ataques.js`, `ficha.js`, `regras-do-mundo.mjs` e as peças novas do `PROPS`. Os agentes leves só conferem a sintaxe.
  - **Revisor separado só quando o dono pede** (`/revisar`). É o agente `revisor`, que não escreveu o código: lê só o diff e a base da área, aponta e nunca edita.
  - **Decisão grande** vira um arquivo nesta pasta, no mesmo commit (a skill `registrar-decisao`).
  - **Skills por tipo de tarefa**, em `.claude/skills/`: `publicar-versao`, `peca-do-meshy`, `estudar-video` e `registrar-decisao`.
- **Por quê:** o vídeo do devleor diz que "a ferramenta é só metade; a outra metade é o processo". Sem processo, a IA esquece o que decidiu ontem, mexe em arquivo que não devia e diz que terminou sem ter testado. O dono: "minha ideia é nos padronizarmos pra seguir esses ensinamentos"; "eu quero o quadrinho dos agentes, as task, mas com a regra de que eu posso falar 'commita isso aí'"; "testes podem ficar com os agents fortes".
- **Descartado:**
  - **O AgEnFK, o framework do vídeo:** pede Node 22.13+ (a máquina tem o 18.14). Ele bloqueia qualquer edição sem tarefa aberta ou com o servidor dele desligado, não tem um atalho documentado para "commita isso aí" e instala hooks no `~/.claude` (valeriam para todos os projetos).
  - **O portão "sem tarefa, a IA é bloqueada":** vai contra a regra de pedido direto.
  - **Um hook que barrasse o `git push` quando o `npm test` falhasse:** no lugar dele, o dono pediu o quadro com o atalho.
  - **`npm test` também nos agentes leves:** o dono preferiu deixar com os fortes.
  - **Revisor automático** (só nas mudanças arriscadas, ou em toda tarefa): o dono escolheu "só quando eu pedir".
- **O que muda:** a regra está no `CLAUDE.md`, na seção "O fluxo de toda tarefa". Cada um dos 22 agentes de área ganhou o parágrafo do quadro, e o revisor está em `.claude/agents/revisor.md` + `.claude/commands/revisar.md`. O estudo que deu origem a isso está em `planejamento/estudos/devleor-godot-ia-notas.md` (fora do git).
