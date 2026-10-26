# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Este arquivo é o ÍNDICE.** O detalhe de cada parte do jogo mora na **BASE DE CONHECIMENTO** da área, `memory_claude/<agente>.md` (a única cópia; tabela no fim). Cada área tem dois agentes que a usam: o **LEVE** (`/agent_<x>`: lê só o trecho da base que o pedido toca, faz direto, confere só a sintaxe — barato) e o **FORTE** (`/agent_<x>_forte`: lê a base inteira, investiga e valida de verdade, com o jogo rodando, fotos e medidas — caro). Aqui só entram regra curta que vale para o projeto todo e a linha do índice — este arquivo tem de ficar bem abaixo de 40 mil caracteres.

**Quando o pedido se enquadrar numa área, sugira o agente dela e PERGUNTE (AskUserQuestion), antes de começar, como o usuário prefere seguir:**
1. **Ler a base de conhecimento** — você lê em `memory_claude/<agente>.md` só os trechos ligados ao pedido e faz aqui mesmo;
2. **Chamar o agente leve** direto (você mesmo, ferramenta Agent, subagent_type `<agente>`) — rápido e econômico, sem testes pesados;
3. **Chamar o agente forte** (subagent_type `<agente>-forte`) — para mudança grande ou delicada, ou bug difícil.

Marque como recomendada a que cabe (dúvida ou ajuste pequeno → ler a base; tarefa pontual → leve; grande/delicada → forte). Não pergunte se é AJUSTE PEQUENO OU PONTUAL (aí faça direto lendo a base — regra do dono, 18/10/2026; só pergunte em tarefa grande ou delicada), se o pedido já veio por um `/agent_…`, se o usuário já disse nesta conversa como prefere, ou se é pergunta que se responde sem mexer em código. Documentação nova vai na base da área (área nova = a base + os dois agentes + os dois comandos em `.claude/commands/` + linha na tabela).

**GASTO PROPORCIONAL AO PEDIDO** (regra do dono, 20/10/2026 — um batom custou ~300 mil tokens e 20 min de agente forte, e o rosto, que era a queixa principal, ficou para depois):
- **Pedido com várias partes: entregue TODAS.** Não adie a parte principal (a queixa que abriu o pedido) para "depois" nem recomende fatiar; só divida se o dono pedir.
- **O forte é exceção**, não a recomendação padrão: só para o que mexe em save/rede/malha de muita gente ou bug que o leve não achou. Coisa visual pontual (uma cor, uma peça, um desenho, uma régua) = ler a base e fazer, ou o leve.
- **Todo agente vai com TETO no prompt**: o que entregar, e a validação MÍNIMA — uma prancha de fotos do caso pedido (não todas as raças × cores × elmos × distâncias), sem medir o que não mudou. Teste a mais só se o dono pedir.
- **No fim, diga o custo** (tokens e tempo do agente). Se passou de ~100 mil tokens numa tarefa pequena, diga por quê.

## Projeto

"Lubelion Online - MMO Project" (antes "Masmorra do Carrasco"; o código, o servidor e o Supabase seguem com "masmorra" nos nomes — não renomear, é protocolo e banco) — um RPG de ação souls-like em Three.js puro (navegador, módulos ES). Sem build, sem dependências npm, sem linter; os únicos testes são os do servidor de mundo (`npm test`). Three.js e os addons estão em `vendor/` (import map no `index.html`). **Todo texto do jogo, da interface e dos comentários é em português do Brasil.**

```bash
npm start            # node server.js → http://localhost:5173 (PORT muda)
npm test             # node testes/mundo.test.mjs — o servidor de mundo, por HTTP
masmorra.exe         # sobe o servidor e abre o jogo em janela de app (launcher/)
dotnet publish launcher -c Release -o .    # recompila o masmorra.exe (.NET 8)
```

Nada a compilar: editou, recarregue a página. `window.game` é o `Game` no console (`game.player.pos`, `game.inventory.add('greatsword', 1)`).

## Regras que valem sempre

**Servidor, hospedagem e publicação** (→ base `servidor-e-publicacao`)
- O estático é LISTA BRANCA (`FRENTE` no `server.js`): pasta nova que a página carregue entra nela; `saves/` e `mundo/` ficam fora.
- O jogo roda no GitHub Pages (só arquivos): **rota nova do `server.js` precisa de um plano para o Pages**, e **caminho de arquivo tem de bater maiúscula/minúscula**. Publicar = `git push`.
- **Mudou o que VIAJA pela rede (protocolo, `MUNDO`)? Suba a `versao` de `assets/versao.json`** — ela recarrega todos em até 1 min.
- Rota nova que confie em `soDaqui` precisa da trava do `HOSPEDAR=1`.
- Servidor no Render: disco apagado a cada reinício; personagem na nuvem. **Falhar em LER o personagem nunca vira "personagem novo".** `personagem_valido()` (SQL) = `saveTorto()`: mudou um, mude o outro.
- **Testar sem estragar o save**: `game.salvar = () => {}` e `game.progresso = null; game.start()` antes de mexer; desligue o cache do Chrome de teste; mundo online com `MUNDO_DIR` temporário.

**Código do jogo** (→ base `nucleo-do-jogo`)
- Atraso em jogo é `game.after(sec, fn)`, nunca `setTimeout`.
- `.glb` novo só carrega se estiver em `PROPS` (`assets.js`); peça nova de pacote passa antes pelo `ferramentas/enxugar-glb.mjs`.
- Retimou um golpe (`ATTACKS`)? Ajuste a janela `hit`.
- **As armaduras vêm de ARQUIVO** (`assets/modelos/traje-*.json`): mudar o `gear.js` não muda nada; edite no Editor de modelo.
- `js/blocos.js` é CÓPIA gerada do editor — não edite aqui.
- Altura no mundo é RELATIVA ao chão: `X.clone().setY(X.y + h)`, nunca `setY(h)` (terraço, relevo).
- Medida de tela em JS: `tela.w`/`tela.h` (nunca `innerWidth`); em CSS, `var(--vw)` (→ base `interface-e-celular`).
- Teclas em `input`/`textarea` são ignoradas pelo `Input`.

**Rede, modos e save** (→ base `rede-e-mmo`, `nucleo-do-jogo`)
- **A IA nunca lê `game.player`** (usa `alvo` / `game.alvoPara`); golpe do jogador passa SEMPRE por `game.golpear`.
- Diferença entre Jornada e Mundo online é `game.regras.<nome>` (`js/modo.js`), não `if (game.modo === 'mmo')`.
- Ganchos de `game.sessao` são chamados com `?.`: método novo num modo não pode quebrar o outro.
- Inimigo novo com estado próprio precisa do seu `retomar` (troca de simulador).
- Tudo que chega da rede passa por `limparInstantaneo`/`protocolo.js`; dado torto é descartado.
- Estado novo que deva sobreviver ao fechar: `coletar`/`aplicarProgresso`. Regras mudaram a ponto de o progresso antigo não servir: suba `FICHA`. Mapa mudou movendo coisas: suba `MAPA_REV`. Reordenar `doors`/`chests`/`torches` embaralha saves.
- **A ORDEM das listas é o número no save**: cores de cabelo, raças, penteados, barbas, sobrancelhas, batons — item novo entra no FIM.

**Mapa e decoração** (→ base `mapa-e-cenario`)
- Decoração é DADO (`assets/decor.json`, gravado pelo editor de cenas). Ferramenta que escreva nele: nada de campo que o editor não conheça e nada de `y` para "pousar".
- Spawns de bichos ficam no FIM de `spawnEnemies` (não mexer nos `netId`).
- Tag de lugar nova = entrada em `aplicarMarcos`.
- Peça solta que tenha de aparecer de longe: raio > 20 m ou fora da lista do `LOD.soltas`.

**Personagem** (→ base `aparencia-e-racas`)
- Raça é sempre `racaDe(a.raca, a.sexo)`, nunca `Assets.racas[n]`.
- Coisa que encoste no corpo (brinco, chifre, cicatriz) prende-se pelo ÍMÃ (`js/ima.js`), não por conta paralela às réguas. Régua nova que mexa no rosto entra em `rostoDaRaca`.
- Antes de acrescentar uma parte do corpo, confira se o modelo já não a tem.
- O 3º corpo (sexo 2, a "Feminino 2") é um CORPO DE ARQUIVO (`js/corpo-arquivo.js`, `assets/corpos/`): gerado pelo `ferramentas/corpo-de-arquivo/importar.mjs` (usa o Blender) — mude o recorte e rode de novo, não edite o `.json`. Os dados dele (rótulo, cores, proporções) ficam no arquivo do corpo, não no `racas.json`. Ele é CARECA: o cabelo do modelo é o penteado "Coques (do modelo)" (forma `malha`, réguas na aba Cabelo); na aba Modelo, o que ela CORTAR (K) vira cabelo na próxima importação. A aba Modelo do editor o edita (sexo "Feminino 2", chave `humano:arquivo`): a malha dele vai na forma verdadeira e o esqueleto troca os inversos de ligação (`inversosDoArquivo`) — nada de gravar a malha "compensada".
- Corpo FEMININO (com busto): a pele do tronco/braços/pernas é refeita em anéis por cima das peças (`js/retopologia.js`, no fim do `geometriaFundida`), menos com a aba Modelo aberta editando as PEÇAS; editando a pele nova, as edições vão na camada `nova` do corpo (só campos de forma). `CorpoGuerreiro.pele` força a versão de um boneco (a comparação do editor). Peça de pele nova do guerreiro = entra em `TROCADAS`. A malha nova tem de fechar: `userData.peleNova.abertos` = só as bocas (44), `dobrados` 0 (base `corpo-e-animacao`).
- Penteado que está em `assets/penteados.json` (a aba Cabelo do editor grava lá) vale NO LUGAR do do código: mexa no arquivo, não no `PENTEADOS`. Forma nova do cabelo = função em `FORMAS` + lista em `MEDIDAS`. "Deixei recados no cabelo" = ler `referencias/recados-cabelo.json` do editor (base `aparencia-e-racas`).

**Desempenho** (→ base `desempenho-do-jogo`)
- Nunca ler pixels da placa no meio do jogo (`readPixels`) nem criar/descartar material a cada vez.
- Luz: nunca ligar/desligar `visible` fora de `World.distribuirLuzes` (recompila tudo).
- Material ou luz que só aparece no meio do jogo: desenhe-a uma vez no `Game.preaquecer` — e NÃO descarte (`dispose`) o material do aquecimento logo depois: o three.js apaga o programa junto e ele compila de novo no jogo (ver `aquecerEsculpidos`).
- `InstancedMesh` novo: geometria só dele. Malha animada: uma por personagem e um `Skeleton` por personagem. Objeto parado: `matrixAutoUpdate = false`. `frustumCulled = false` só com motivo.
- A IMAGEM das texturas é dividida entre peças: nada de desenhar por cima de `map.image`.
- Fase nova no laço = um `M?.fase('nome')`; mudou a configuração de algo que pesa → ponha o teste dele no diagnóstico do monitor. O monitor não pode gerar lixo por quadro.
- "Como esse aparelho roda?" → rode `node ferramentas/desempenho/ler.mjs` antes de pedir relatório a alguém.

## As áreas: os agentes (`.claude/agents/`) e a base (`memory_claude/`)

| Leve | Forte | Agente = base `memory_claude/<agente>.md` | Área |
|---|---|---|---|
| `/agent_servidor` | `/agent_servidor_forte` | `servidor-e-publicacao` | `server.js`, launcher, lista branca, Pages × Render × Supabase (`hospedagem.js`), `versao.json`, `HOSPEDAR`, publicar, testar pela automação |
| `/agent_nucleo` | `/agent_nucleo_forte` | `nucleo-do-jogo` | `Game` e o laço, assets e `PROPS`, `CharacterModel`/trajes, `ATTACKS`, `World` (MAP, células, `SPECIAL_EDGES`), entidades, itens/inventário, o save (`save.js`, marcos, `MAPA_REV`) |
| `/agent_mapa` | `/agent_mapa_forte` | `mapa-e-cenario` | floresta, mata, acampamento, WindHills, relevo, `decor.json` e o decorador, vegetação `gi-`/`lp-`, água e lagoas, animais, o terraço e o dragão |
| `/agent_ceu` | `/agent_ceu_forte` | `ceu-capim-e-chao` | ciclo do dia, céu (`ceu.js`: sol, lua, nuvens, reflexo, clarão), luz, o tapete de capim, a cor do chão, caminhos, categorias das peças |
| `/agent_corpo` | `/agent_corpo_forte` | `corpo-e-animacao` | o guerreiro (`guerreiro.glb`), retarget, malha fundida, dedos, clipes do Mixamo, guarda, duas mãos (IK), empunhadura, personagens esculpidos de fotos (`ferramentas/contorno`, `esculpido.js`), corpo de arquivo (modelo pronto → `ferramentas/corpo-de-arquivo`) |
| `/agent_aparencia` | `/agent_aparencia_forte` | `aparencia-e-racas` | painel de Aparência, raças e corpo feminino, o 3º corpo (corpo de arquivo), raça esculpida (Dennis), proporções, busto, rosto, presas, orelhas, penteados, barbas, sobrancelhas, boca e batom, ímã, modelagem, pintura, piscada |
| `/agent_combate` | `/agent_combate_forte` | `combate-e-itens` | escudo e postura, fratura, esqueleto desmontado, item caído e raridade, expositores, quebráveis, comida e receitas, a ficha (atributos, armaduras, peso, `FICHA`) |
| `/agent_rede` | `/agent_rede_forte` | `rede-e-mmo` | `js/rede/`, protocolo, sala, duelo, co-op, o Mundo online (`servidor-mundo.mjs`, simulador, `game.sessao`), chat global, chat de voz |
| `/agent_interface` | `/agent_interface_forte` | `interface-e-celular` | tela de entrada, HUD, menu de pausa em telas, coordenadas, câmeras (primeira pessoa, isométrica, véu), toque, tela deitada, carregamento no celular |
| `/agent_desempenho` | `/agent_desempenho_forte` | `desempenho-do-jogo` | qualidades gráficas, luzes, LOD, sombras, resolução automática, máquina fraca e celular, o monitor (F3), perfil de CPU, telemetria |
| — | `/agent_otimizador` | `otimizador-de-desempenho` (do usuário) | lentidão NOVA a investigar medindo: o método (medir, achar o gargalo, uma mudança por vez, provar) com o kit — monitor portátil e perfil de CPU (`--freio`). Ajuste ou dúvida sobre o que já foi feito aqui = `/agent_desempenho` |
| `/agent_rapido` | — | `executor-rapido` (do usuário) | qualquer área, com pressa: faz direto, sem a fase longa de testes |

Os dois últimos ficam em `~/.claude/` (valem em todos os projetos); a fonte do otimizador e do comando dele é `ferramentas/agente-desempenho/` (mudou lá → `node ferramentas/agente-desempenho/instalar.mjs --usuario`).
