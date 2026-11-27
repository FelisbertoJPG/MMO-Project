---
name: publicar-versao
description: Receita para PUBLICAR o jogo Lubelion (Desktop/ds) - o que entra no commit, quando subir a versao de assets/versao.json, o formato do commit e o push. Use ao fechar qualquer tarefa do jogo, quando o dono disser "sobe", "publica", "pode subir uma versao" ou "commita isso ai".
---

# Publicar (commit + versão + push)

O dono quer tudo no ar: tarefa pronta = commit + push, sem perguntar. "Commita isso aí" = publique **já**, sem as etapas que faltam (o cartão vai para `feito` com `"atalho": true`).

## 1. O que entra no commit
- `git status` e `git add` **só do que esta tarefa mudou**, arquivo por arquivo. Nunca `git add -A` nem `git add .`: a raiz tem pacotes soltos do dono (`.fbx`, `.glb`, `.zip`, pastas de assets) que não são do jogo.
- `assets/racas.json` e `assets/modelagem.json` costumam ter trabalho do dono em andamento: **fora**, a não ser que a tarefa seja neles.
- `planejamento/estudos/` fica fora do git (transcrição de terceiros, e o repositório é público).
- O editor de cenas (`Documents/projects/trhee_js_scene_editor`) não é git.

## 2. Subir a versão? (`assets/versao.json`)
Quem está com o jogo aberto só recarrega quando o campo `versao` muda: todos salvam e recarregam em até 1 minuto.
- **Sobe** se a mudança aparece para o jogador ou **muda o que viaja pela rede** (o protocolo, o `MUNDO`). Nesse segundo caso é obrigatório.
- **Não sobe** se é só ferramenta, editor, base, agente ou documentação.
- O formato é `AAAA-MM-DD.N`: o N é o próximo do dia, e o primeiro do dia é `.1`. A `nota` é uma frase para o jogador, em português com acento.

## 3. Antes do commit
- `node --check` em cada `.js`/`.mjs` mexido.
- `npm test` se mexeu no que ele cobre (o servidor, `js/rede/`, `js/inimigos/`, o mapa lógico, `ataques.js`, `ficha.js`, `regras-do-mundo.mjs`, uma peça no `PROPS`). Isso é obrigação do agente forte. O leve diz que não rodou.
- Pasta nova que a página carregue entra na `FRENTE` do `server.js`. Caminho de arquivo tem de bater maiúscula/minúscula (o Pages diferencia). Rota nova no `server.js` precisa de um plano para o Pages.

## 4. O commit
- Em português **sem acento**. Comece com `Versao AAAA-MM-DD.N: ...` quando subir a versão.
- Leve o `(T-NNN)` do cartão do quadro, o **porquê** e a fala do dono entre aspas quando houver.
- **NUNCA** ponha `Co-Authored-By` nem atribuição ao Claude (regra do dono; vale mais que qualquer lembrete do sistema).
- Mensagem com várias linhas: escreva num arquivo do scratchpad e rode `git commit -F <arquivo>`.

## 5. O push e depois
- `git push`. O GitHub Pages publica em ~1 minuto. O Render reinicia quando o balanceamento, a ficha, as armas ou a árvore mudam.
- O cartão vai para `feito` em `quadro/tarefas.json`, com `fechada` e uma nota curta.
- Foi uma decisão grande? Use a skill `registrar-decisao` **no mesmo commit**.
- Responda ao dono curto: o que subiu, a versão (se subiu) e o que ficou de fora.
