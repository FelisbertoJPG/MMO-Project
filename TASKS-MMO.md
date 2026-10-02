# MMO — o plano em tasks (02/10/2026)

Transformar a Masmorra num mundo compartilhado **sem perder o jogo de hoje**.

**Estado em 02/10/2026:** F0 a F6 feitas e conferidas (duas janelas no mesmo mundo:
combate, troca de simulador no meio da luta, portas, chefe, morte, save no servidor).
Faltam a F7 (acabamento) e os itens marcados `[ ]` abaixo.

## Os dois modos

| | **Jornada (offline)** | **Mundo online (MMO)** |
|---|---|---|
| Conta | opcional | obrigatória (a mesma do Supabase) |
| Onde nasce | na cela, sem nada (como sempre) | no acampamento do lado de fora, com a **adaga** equipada |
| Save | `saves/progresso.json` / `saves/conta-<id>.json` (+ nuvem) | **só no servidor de mundo**, um por conta |
| Multijogador | sala pela tecla **O** (andar junto, co-op, duelo) | todo mundo no mesmo mapa, o tempo todo |
| Mundo | só seu: descansar/morrer faz os inimigos renascerem | de todos: inimigos renascem por TEMPO, portas são de todos |
| Baús e itens | seus | **por personagem** (cada um abre o seu, uma vez) |
| Menu aberto | pausa (sozinho) | nunca pausa |

As diferenças moram em `js/modo.js` (`REGRAS`), e o código pergunta `game.regras.<nome>`.

## Decisões fechadas

1. **Servidor Node próprio**, sem dependências: `servidor-mundo.mjs`, rotas `/__mundo/*` do
   `server.js`. Retransmite os recados, guarda o estado do mundo e os saves em disco
   (`mundo/`), e confere a conta pelo token do Supabase (`/auth/v1/user`).
2. **Loot por personagem.** Inimigos e portas são de todos; chefe ressurge por tempo, e a
   alma dele é item único (não acumula).
3. **Spawn fora + adaga só no MMO.** O offline não muda.

## Decisões de desenho (dá para mudar)

- **Quem simula os inimigos é um dos CLIENTES** (o "simulador"), como o dono no co-op; os
  outros veem marionetes. O servidor escolhe e troca (saiu, travou, escondeu a janela).
  *Consequência*: não é à prova de trapaça; o servidor confere formato e limites.
- **`rede/mundo.js` é uma classe própria**, e não o `coop.js` generalizado: a sala e o
  co-op offline ficaram intocados (só ganharam `outros` e `aoProjetil`). Unificar os dois
  é possível depois, e não rende nada ao jogador.
- **Cano**: SSE para ouvir + POST em fila para falar. WebSocket fica como troca futura.
- **Sem PvP no mundo aberto.** Duelo no MMO fica para depois (F7.4).
- **O mapa é um só para os dois modos** (a variante `floresta`, estendida só para leste).
- **Números** (`rede/mundo.js`): inimigo comum renasce em 3 min sem ninguém a 22 m; chefe
  ressurge em 15 min; chefe sem ninguém vivo na luta por 4 s volta a dormir; almas para
  quem bateu ou estava a 25 m.

## Armadilhas (já vistas — valem para quem continuar)

- **Esta pasta não é um repositório git.** Há uma cópia de antes em
  `../ds-backup-2026-10-02-antes-mmo/` (inclui `saves/`).
- **O alvo `ds` do editor aponta para `Desktop\ds`**, que neste PC é uma versão ANTIGA do
  jogo. As ferramentas daqui usam `ds-aqui` (`node ferramentas/decorar-acampamento.mjs ds-aqui`).
  Os testes do editor (`ds.test.mjs`) leem o alvo `ds`, e por isso falham NESTE PC — para
  conferi-los contra este jogo, troque a `raiz` de `alvos/ds.json` para `../ds` e destroque.
- **`decorar-floresta.mjs` refaz a floresta INTEIRA** e apagaria o que foi arrumado à mão
  no decorador. A área nova tem ferramenta própria (`decorar-acampamento.mjs`).
- **Testar pela automação pode estragar o save de verdade**: o jogo grava sozinho a cada
  15 s e "Novo Jogo" APAGA `saves/progresso.json`. Nos testes: `game.salvar = () => {}` e
  `game.progresso = null` antes de `game.start()`. No MMO, `MUNDO_DIR` numa pasta temporária.
- **Aba em segundo plano não desenha quadro** (nem no headless): para duas janelas de
  verdade, dois navegadores (ou duas janelas lado a lado), não duas abas.
- **As peças da vila medieval (Quaternius) pesam 7,4 MB cada** (três texturas PBR). O
  acampamento usa as do pacote de hexágonos do KayKit (20–36 KB).

---

## F0 — Preparação ✅

- [x] **F0.1 Cópia de segurança** → `../ds-backup-2026-10-02-antes-mmo/`.
- [x] **F0.2 Alvo do editor para esta cópia**: `alvos/ds-aqui.json` (`"raiz": "../ds"`).

## F1 — O exterior e o ponto de nascimento ✅

- [x] **F1.1 Mapa**: `floresta` estendida para leste (27 → 41 colunas): a estrada (colunas
  26–27) e a clareira do acampamento (28–39). 441 células, todas alcançáveis.
- [x] **F1.2 Decoração**: `ferramentas/decorar-acampamento.mjs` (editor) — só toca da coluna
  26 em diante, rodar de novo não duplica. Barracas, sacos de dormir, troncos, lenha, alvos
  de treino, cerca na entrada, o desabamento na ponta leste. 10 peças novas em `PROPS`.
  *Desvio do plano*: ferramenta separada em vez de `--so` no `decorar-floresta`.
- [x] **F1.3 Fogueiras no plural**: `FOGUEIRAS` / `world.fogueiras` / `world.retorno(id)`;
  `player.fogueira` é a última em que descansou (save antigo sem o campo = a da masmorra).
- [x] **F1.4 Nascer no acampamento**: `CAMP_POS`, `Player.startOutside()`, `Game.comecarFora()`.
- [x] **F1.5 Vida no exterior**: 2 esqueletos dormindo na estrada, 3 mensagens, 1 baú.
- [x] *(de brinde)* tocha apagada não redesenha o mapa de sombras dela: de 27 para 38
  quadros/s junto à fogueira da masmorra (medido no headless, GPU integrada).

## F2 — Os dois modos na tela de título ✅

- [x] **F2.1** `game.modo` e a tela em dois blocos (Jornada / Mundo online), com o endereço
  do servidor trocável (guardado no `localStorage`).
- [x] **F2.2** O save com dois destinos: `salvarProgresso` manda o personagem ao servidor no
  MMO; `aplicarProgresso` não aplica portas/chefes no MMO (são do mundo).
  *Desvio*: o formato é o mesmo `coletar()` — separar em dois formatos não rendia nada.
- [x] **F2.3** `js/modo.js` (`REGRAS`): pausa, reinício do mundo, visita, luta, fantasmas, espalhar.

## F3 — O servidor de mundo ✅ (falta a F3.6)

- [x] **F3.1** `servidor-mundo.mjs`: `entrar` (token → bilhete), `ouvir` (SSE), `falar`
  (com lote), `info`, `sair`. Sessão única por conta, limite de jogadores e de ritmo.
- [x] **F3.2** O personagem: `GET/POST /__mundo/personagem`, gravação atômica, `saveTorto()`.
- [x] **F3.3** O estado do mundo (`mundo/estado.json`): portas, névoa, relógios. Quem o
  escreve é o simulador (`est` dentro do `mundo`); o servidor guarda e entrega.
- [x] **F3.4** Simulador: eleição, cão de guarda (calado → troca), roteamento por tipo.
- [x] **F3.5** `MUNDO_AUTH=teste` + `testes/mundo.test.mjs` (16 testes; `npm test`).
- [x] *(de brinde)* o servidor estático virou lista BRANCA: `saves/` e `mundo/` não saem mais
  por HTTP (antes qualquer um da rede baixava `/saves/conta-<id>.json`).
- [x] **F3.6a O JOGO no GitHub Pages**: `https://felisbertojpg.github.io/MMO-Project/`
  (repositório `FelisbertoJPG/MMO-Project`, raiz da `main`). `js/hospedagem.js` detecta o
  host só de arquivos: save da Jornada no navegador, sala só pela internet, Mundo online
  esperando o servidor. Publicar = `git push`.
- [x] **F3.6b O servidor PRONTO para o Render** (decisão: Render, plano grátis):
  `MUNDO_SAVES=nuvem` (nada em disco: o personagem em `masmorra.personagens`, migration
  0002, lido e gravado pelo jogo; o estado do mundo só na memória), `FRENTE_EM` (o servidor
  não entrega o jogo), `render.yaml`, e a tela inicial insiste enquanto o servidor acorda.
  Conferido: servidor (18 testes), a migration num PostgreSQL 18 de verdade, e o jogo com
  o servidor em outro endereço e o Supabase simulado.
- [x] **F3.6c O Render está no ar**: `https://masmorra-do-carrasco-mundo.onrender.com`
  (em `MUNDO_PADRAO`). Conferido de fora: `/__saude` e `/__mundo/info` respondem, a raiz
  manda para o Pages, CORS aberto, token inventado é recusado pelo Supabase (401), modo de
  teste desligado, `/__save` 403 e arquivo do jogo 404. O jogo publicado o encontra.
- [x] **F3.6d O SUPABASE** (feito pelo dono do projeto em 02/10/2026: as duas migrations e
  `masmorra` em Exposed schemas; a API passou a responder 200) — o que tinha sido descoberto: o schema `masmorra` NÃO EXISTE no
  projeto (a migration 0001 nunca foi aplicada lá) nem está em "Exposed schemas". Sem
  isso nenhuma conta "entra na Masmorra" (`online.ativo` fica falso) e o botão do Mundo
  online não liga. Falta, NESTA ordem: rodar a 0001, rodar a 0002, e acrescentar
  `masmorra` em Settings → Data API → Exposed schemas.
- [x] **F3.6e No ar com contas de verdade**: em 02/10/2026 o servidor do Render mostrou 2
  jogadores ligados ao mesmo tempo, por vários minutos (login do Supabase e SSE pelo proxy
  do Render funcionando). Falta só a impressão de quem jogou sobre a latência.
- [x] **F3.6f Uma atualização do JOGO com gente dentro** (as tochas de estaca, commit
  `3f8cacb`): o Pages serviu a versão nova em menos de um minuto depois do `git push`, e o
  Render NÃO reiniciou — os 2 jogadores seguiram ligados (o `buildFilter` do `render.yaml`).
  Quem já está com o jogo aberto só recebe a versão nova ao recarregar a página (o Pages
  manda o navegador guardar os arquivos por 10 min: Ctrl+F5 se não aparecer).
- [ ] **F3.6g Uma atualização do SERVIDOR com gente dentro**: ainda não provada. Reiniciar
  derruba todos (o jogo reentra sozinho) e zera o estado do mundo. Falta também o jogo
  AVISAR que há versão nova, e o servidor dizer qual versão está rodando.

## F4 — Cliente: estar no mesmo mapa ✅

- [x] **F4.1** `rede/mundo.js` + `transporteMundo` (fila, lote, `troca`, reentrada sozinha).
- [x] **F4.2** `sessao.outros` no lugar de `sessao.outro` (`separate`, `congela`).
- [x] **F4.3** Painel "Mundo" (tecla O) e o aviso no canto; "Sair do mundo" no menu de pausa.
  Fantasmas desligados no MMO; mensagens e mortes do Supabase continuam.

## F5 — Mundo compartilhado ✅

- [x] **F5.1** Simulação para N: `assumir` / `entregar`, `DANO` com destinatário.
- [x] **F5.2** Troca de simulador ao vivo: `Enemy.retomar`, `Boss.retomar`, `Dragao.retomar`.
- [x] **F5.3** Renascer por tempo (`Mundo.tique`); `rest` e a morte não reiniciam o mundo.
- [x] **F5.4** Almas e espólio para quem lutou (`Mundo.repartir`); projéteis em cópia visual.
- [x] **F5.5** Portas de todos (`aoAbrirPorta` → `acao`), baús de cada um.
- [x] **F5.6** Chefes: luta por jogador (`atualizarLuta`), prêmio a quem lutou
  (`premiarChefe`), ressurgir por tempo com a névoa fechando.
- [x] **F5.7** Janela escondida passa o bastão (`visivel`). *Conferido pelo recado e pelo
  teste do servidor; falta ver com uma janela minimizada de verdade.*
- [ ] **F5.8 O dragão no MMO**: usa o mesmo código do Carrasco, mas só o Carrasco foi
  jogado nas duas janelas. Conferir o terraço com dois jogadores.
- [ ] **F5.9 Lacaios do Carrasco na troca de simulador**: somem (quem assume não os tem).
  Aceito como aproximação; anotar se incomodar.
- [ ] **F5.10 Portas que fecham sozinhas** depois de N minutos sem ninguém perto (hoje
  ficam abertas para sempre no mundo de todos).

## F6 — As regras do jogador no MMO ✅

- [x] **F6.1** Morte: mancha do personagem, renasce na última fogueira, o mundo segue.
- [x] **F6.2** Fogueira: cura, Estus, nível, ponto de retorno. Vários acordam espalhados.
- [x] **F6.3** Grava: descanso, nível, chefe, 15 s, ao fechar (`sendBeacon`). Falha avisa uma vez.
- [x] **F6.4** Sair e voltar: "Sair do mundo" grava e recarrega a página (decidido: refazer o
  mundo local à mão seria refazer o carregamento inteiro).
- [x] *(de brinde)* com a névoa aberta, "estar na arena" passou a ser onde se pisa: quem
  vencia o Carrasco saía de lá marcado e os inimigos de fora o ignoravam (valia offline também).

## F7 — Acabamento

- [x] **F7.1 Medido**: `mundo` = 1,3 KB × 10/s; `pos` = 150 B × 8/s por jogador. Com 8
  jogadores, ~22 KB/s de descida por jogador. Folga grande; otimizar (só inimigos perto de
  alguém, deltas) quando passar de ~20 jogadores ou de ~60 inimigos.
- [ ] **F7.2 Endurecer o servidor**: validade do bilhete, ritmo por IP na entrada, log de
  quem entra/sai em arquivo.
- [ ] **F7.3 Desempenho do cenário**: com a masmorra inteira no enquadramento são ~3.400
  desenhos por quadro (as 540 peças da estrutura são malhas soltas). Instanciar as peças
  `ger` do `decor.json` é o ganho grande — vale para os dois modos.
- [ ] **F7.4 Opcionais**: duelo por convite no acampamento; gestos/chat curto; WebSocket;
  mundo aberto na LAN sem conta (`MUNDO_AUTH=lan`).
- [x] **F7.5 Documentação**: `CLAUDE.md` (seção "O MUNDO ONLINE"), `README.md`, `LEIA-ME.txt`.

---

## Como testar o MMO numa máquina só

```bash
MUNDO_AUTH=teste MUNDO_DIR=/tmp/mundo-teste node server.js
```

Duas JANELAS (não abas) em `http://localhost:5173/?teste=Ana` e `…/?teste=Beto`, botão
"Entrar no mundo". Para a troca de simulador, minimizar a primeira. `node testes/mundo.test.mjs`
cobre o servidor sem navegador.

## Como hospedar (ver F3.6)

**O que está montado:** contas no Supabase · o jogo no GitHub Pages · o servidor de mundo
no Render (`render.yaml`: `HOSPEDAR=1`, `MUNDO_SAVES=nuvem`, `FRENTE_EM=<o Pages>`). O que
segue vale para QUALQUER outro lugar (VM, o próprio PC com túnel), onde há disco.

```bash
HOSPEDAR=1 PORT=5173 node server.js     # contas do Supabase; dados em ./mundo
```

**`HOSPEDAR=1` é obrigatório atrás de túnel ou proxy**: eles rodam na própria máquina, todo
visitante chega como `127.0.0.1`, e sem a trava qualquer um leria e APAGARIA o save da Jornada
de quem hospeda (`/__save`) e abriria salas em nome dele (`/__lan/*`). Com ela essas rotas
não existem. Falta: avisar na tela de título do endereço hospedado que a Jornada, ali, não grava.

O que o host precisa (opção B, ~25 MB): `server.js`, `servidor-mundo.mjs`, `rede-local.mjs`,
`package.json`, `index.html`, `css/`, `js/`, `vendor/` e `assets/` SEM `assets/packs/`.

Onde (pesquisado em 02/10/2026; nada disto foi testado ainda):

| Onde | Custo | Serve? |
|---|---|---|
| **Tailscale Funnel**, no próprio PC | grátis | Endereço fixo `https://<pc>.<rede>.ts.net`, sem domínio. PC ligado; limite de banda não publicado. **O primeiro a tentar.** |
| **Cloudflare Tunnel NOMEADO**, no próprio PC | grátis + domínio (registro.br) | Endereço próprio, sem VM. Precisa do domínio na Cloudflare. |
| Cloudflare *Quick* Tunnel (`trycloudflare.com`) | grátis | **NÃO**: não suporta SSE, que é o nosso cano de ouvir. |
| Render (plano grátis) | grátis | **NÃO como está**: dorme com 15 min sem visita e o disco é apagado a cada reinício — os personagens sumiriam. Só com o save indo para o Supabase. |
| Oracle Cloud Always Free (São Paulo) | grátis | Serve e fica 24 h no ar, mas É uma VM para administrar; pede cartão no cadastro e a Oracle pode recolher máquina ociosa. |
| VPS barata | ~US$ 4–5/mês | Serve; mesma administração da Oracle, sem o risco de recolherem. |

Os jogadores abrem o endereço no navegador (o jogo é servido pelo próprio servidor) ou,
no jogo local, trocam o servidor na tela inicial. Variáveis: `MUNDO_MAX` (16), `MUNDO_DIR`,
`SUPABASE_URL`/`SUPABASE_KEY` (por padrão lidas de `js/rede/supabase.js`). Zerar o mundo =
apagar `mundo/estado.json`; apagar um personagem = apagar `mundo/personagens/<id>.json`.
