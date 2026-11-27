# O caminho 2 (o juiz do Mundo online) amadurece no PC do dono antes de ir para um Render

- **Data:** 2026-11-24 · **Commit:** 5401a48 (a área nova da migração) · **Área:** `migracao-servidor`
- **Decidido:** o servidor do mundo e o juiz com autoridade (o "caminho 2" contra trapaça) são desenvolvidos e testados no PC do dono, no localhost. Só quando estiverem prontos vão para um Render. O "caminho 1" (`regras-do-mundo.mjs`) já está no Render.
- **Por quê:** o dono disse: "fazer o servidor rodar nessa máquina, quando tiver tudo pronto e bem redondinho, aí sim botamos em um Render". Na época, o juiz seria o próprio jogo num Chrome sem janela, e o plano grátis do Render não aguenta isso. O dono prefere amadurecer em casa antes de pagar ou hospedar.
- **Descartado:** subir o juiz para a hospedagem já durante o desenvolvimento.
- **O que muda:** não propor hospedagem paga nem mexer no deploy do Render para o juiz até o dono dizer que está pronto. A regra está na memória `servidor-local-antes-da-hospedagem` e em `memory_claude/migracao-servidor.md`.
