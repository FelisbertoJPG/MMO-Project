# Base de conhecimento — servidor-e-publicacao

> A documentação da área (servidor local (server.js), launcher masmorra.exe, hospedagem (GitHub Pages + Render + Supabase), lista branca do estático, rotas /__save /__lan /__mundo do lado do servidor, versao.json (recarregar para todos), HOSPEDAR e publicar). É a ÚNICA cópia: lição nova da área entra aqui, no tópico certo. Quem lê: o agente `servidor-e-publicacao` (leve: só os trechos do pedido), o `servidor-e-publicacao-forte` (inteira) e a sessão principal quando o dono escolhe "ler a base".

## Projeto, execução e hospedagem

### Project

"Lubelion Online - MMO Project" (antes "Masmorra do Carrasco"; o código, o servidor e o Supabase ainda usam "masmorra" nos nomes) — a souls-like action RPG in plain Three.js (browser, ES modules). No build step, no npm dependencies, no linter; the only tests are the online-world server's (`npm test`). Three.js and its addons (GLTFLoader, SkeletonUtils, BufferGeometryUtils, RoomEnvironment) are vendored in `vendor/`; `three` is resolved through the import map in `index.html`. All in-game text, UI, and code comments are in Brazilian Portuguese — keep new ones in Portuguese.

### Running

```bash
npm start            # node server.js → http://localhost:5173 (PORT env var overrides)
npm test             # node testes/mundo.test.mjs — o servidor de mundo (MMO), por HTTP, sem navegador
masmorra.exe         # (ou o atalho na área de trabalho) sobe o servidor e abre o jogo em janela de app
dotnet publish launcher -c Release -o .    # recompila o masmorra.exe (SDK .NET 8)
```

**O launcher (`launcher/`, gera `masmorra.exe`)** prende o servidor ao terminal: o log aparece nele, e fechar a janela ou Ctrl+C desliga o jogo — um Job Object (`KILL_ON_JOB_CLOSE`) garante isso até se o launcher for morto à força. Ele reconhece o jogo já no ar pela rota `/__saude` do `server.js` (`quem: 'masmorra-do-carrasco'`) e, com a 5173 ocupada por outro programa (é a porta do Vite), sobe na próxima livre via `PORT` — o `server.js` sozinho cairia com `EADDRINUSE`. O ícone é desenhado por `launcher/gerar-icone.ps1`. É uma cópia enxuta do launcher do editor de cenas.

`server.js` is a minimal static file server (plus the save, LAN-room and online-world routes). It exists because ES modules won't load over `file://`. There is nothing to compile, so edits show up after a browser reload. To check a change, load the page and play or inspect it. `window.game` exposes the `Game` instance in the console for debugging (e.g. `game.player.pos`, `game.inventory.add('greatsword', 1)`).

**O estático é uma lista BRANCA** (`FRENTE` em `server.js`: `index.html`, `css`, `js`, `vendor`, `assets`). Pasta nova que a página precise carregar tem de entrar nela; `saves/` e `mundo/` ficam de fora de propósito (o servidor escuta em todas as interfaces).

**ONDE O JOGO RODA (`js/hospedagem.js`, 02/10/2026)** — são três peças: as CONTAS no Supabase, o JOGO no GitHub Pages (`https://felisbertojpg.github.io/MMO-Project/`, repositório `FelisbertoJPG/MMO-Project`, a raiz da branch `main`) e o SERVIDOR DE MUNDO em outro lugar (ainda não há: ver `TASKS-MMO.md`). O Pages só entrega arquivos, então lá não existe `/__save`, `/__lan/*` nem `/__mundo/*`. Uma sonda em `/__saude` no carregamento decide: com o `server.js` por trás, tudo como sempre; sem ele (`temSaveEmArquivo()` falso), o save da Jornada vai para o `localStorage` (mais a nuvem, com conta), a sala só existe pela internet, e o Mundo online procura o servidor em `MUNDO_PADRAO` (vazio = "ainda não está no ar"). **Rota nova do `server.js` precisa de um plano para o Pages**, e **caminho novo de arquivo tem de bater maiúscula/minúscula** (o Pages diferencia; o Windows não). O `.gitignore` deixa de fora `saves/`, `mundo/`, os pacotes brutos e o `.exe`; publicar é `git push` (o Pages reconstrói sozinho).

**RECARREGAR PARA TODOS (`js/versao.js`, `assets/versao.json`)** — quem está com o jogo aberto segue no código antigo depois de um `git push`. Cada página lê `assets/versao.json` ao abrir e a cada minuto; quando o campo `versao` muda, ela avisa, grava o progresso, busca de novo os arquivos que carregou (`cache: 'reload'` — o Pages manda guardar tudo por 10 min, e sem isso a página recarregaria no código velho) e recarrega. **Quem decide é o push**: mudar `versao` recarrega todos em até um minuto; não mexer nela não incomoda ninguém. Mudança que altera o que VIAJA pela rede (o protocolo, o `MUNDO`) deve sempre subir com a `versao` nova — jogadores em versões diferentes no mesmo mundo é o que isto existe para evitar.

**O servidor de mundo no RENDER (`render.yaml`)** — plano grátis, que dorme sem visita e APAGA o disco a cada reinício. Por isso: `MUNDO_SAVES=nuvem` (o servidor não lê nem grava arquivo; o personagem mora em `masmorra.personagens`, migration 0002, lido e gravado pelo JOGO em `Mundo.lerDaNuvem`/`salvarNaNuvem`; o estado do mundo fica só na memória) e `FRENTE_EM` (o servidor não entrega o jogo: manda quem abrir o endereço para o Pages, para não gastar a franquia de tráfego). **Falhar em LER o personagem nunca vira "personagem novo"** — entraria zerado e gravaria por cima do de verdade. O `buildFilter` do `render.yaml` só reimplanta quando mudam os arquivos do servidor; `personagem_valido()` na migration é o `saveTorto()` em SQL — mudou um, mude o outro.

**PERSONAGEM EM DISCO** — `lerPersonagem` só devolve `null` se o arquivo não existe (`ENOENT`). JSON interrompido e erro de leitura voltam como HTTP 500, tanto ao entrar quanto no GET do personagem. A entrada lê o personagem antes de substituir a sessão atual, para uma falha não desconectar quem já joga.

**`HOSPEDAR=1`** (servidor exposto para fora, atrás de túnel ou proxy): desliga `/__save` e `/__lan/*`. A defesa dessas rotas é "o pedido vem deste computador?" (`soDaqui`), e atrás de um túnel TODO pedido vem de `127.0.0.1`. Rota nova que confie em `soDaqui` precisa da mesma trava.

**Testar pela automação SEM estragar o save**: o jogo grava sozinho a cada 15 s e "Novo Jogo" APAGA `saves/progresso.json`. Antes de mexer: `game.salvar = () => {}` e `game.progresso = null; game.start()`. O `server.js` não manda cabeçalho de cache, e um Chrome de teste com perfil fixo pode rodar o `.js` VELHO depois de uma edição: desligue o cache (`Network.setCacheDisabled`). No mundo online, suba o servidor com `MUNDO_DIR` numa pasta temporária.
