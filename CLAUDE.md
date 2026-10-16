# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Este arquivo é o ÍNDICE.** O detalhe de cada parte do jogo mora nos **AGENTES do projeto** (`.claude/agents/<nome>.md`, tabela no fim): cada um é um especialista com a documentação inteira da área dele (não há outra cópia). Aqui só entram regra curta que vale para o projeto todo e a linha do índice — este arquivo tem de ficar bem abaixo de 40 mil caracteres.

**Caso o pedido se enquadre num dos agentes, solicite ao usuário usar o `/agent_…` específico da chamada para conseguir resultados melhores** (ex.: "isso é da área de rede: use `/agent_rede <pedido>`"), antes de começar o trabalho. Se o pedido já veio por um `/agent_…`, ou o usuário mandar seguir assim mesmo, siga — e leia antes o arquivo do agente da área. Documentação nova vai no arquivo do agente da área (área nova = agente novo + comando `.claude/commands/agent_<curto>.md` + linha na tabela).

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

**Servidor, hospedagem e publicação** (→ agente `servidor-e-publicacao`)
- O estático é LISTA BRANCA (`FRENTE` no `server.js`): pasta nova que a página carregue entra nela; `saves/` e `mundo/` ficam fora.
- O jogo roda no GitHub Pages (só arquivos): **rota nova do `server.js` precisa de um plano para o Pages**, e **caminho de arquivo tem de bater maiúscula/minúscula**. Publicar = `git push`.
- **Mudou o que VIAJA pela rede (protocolo, `MUNDO`)? Suba a `versao` de `assets/versao.json`** — ela recarrega todos em até 1 min.
- Rota nova que confie em `soDaqui` precisa da trava do `HOSPEDAR=1`.
- Servidor no Render: disco apagado a cada reinício; personagem na nuvem. **Falhar em LER o personagem nunca vira "personagem novo".** `personagem_valido()` (SQL) = `saveTorto()`: mudou um, mude o outro.
- **Testar sem estragar o save**: `game.salvar = () => {}` e `game.progresso = null; game.start()` antes de mexer; desligue o cache do Chrome de teste; mundo online com `MUNDO_DIR` temporário.

**Código do jogo** (→ agente `nucleo-do-jogo`)
- Atraso em jogo é `game.after(sec, fn)`, nunca `setTimeout`.
- `.glb` novo só carrega se estiver em `PROPS` (`assets.js`); peça nova de pacote passa antes pelo `ferramentas/enxugar-glb.mjs`.
- Retimou um golpe (`ATTACKS`)? Ajuste a janela `hit`.
- **As armaduras vêm de ARQUIVO** (`assets/modelos/traje-*.json`): mudar o `gear.js` não muda nada; edite no Editor de modelo.
- `js/blocos.js` é CÓPIA gerada do editor — não edite aqui.
- Altura no mundo é RELATIVA ao chão: `X.clone().setY(X.y + h)`, nunca `setY(h)` (terraço, relevo).
- Medida de tela em JS: `tela.w`/`tela.h` (nunca `innerWidth`); em CSS, `var(--vw)` (→ agente `interface-e-celular`).
- Teclas em `input`/`textarea` são ignoradas pelo `Input`.

**Rede, modos e save** (→ agente `rede-e-mmo`, `nucleo-do-jogo`)
- **A IA nunca lê `game.player`** (usa `alvo` / `game.alvoPara`); golpe do jogador passa SEMPRE por `game.golpear`.
- Diferença entre Jornada e Mundo online é `game.regras.<nome>` (`js/modo.js`), não `if (game.modo === 'mmo')`.
- Ganchos de `game.sessao` são chamados com `?.`: método novo num modo não pode quebrar o outro.
- Inimigo novo com estado próprio precisa do seu `retomar` (troca de simulador).
- Tudo que chega da rede passa por `limparInstantaneo`/`protocolo.js`; dado torto é descartado.
- Estado novo que deva sobreviver ao fechar: `coletar`/`aplicarProgresso`. Regras mudaram a ponto de o progresso antigo não servir: suba `FICHA`. Mapa mudou movendo coisas: suba `MAPA_REV`. Reordenar `doors`/`chests`/`torches` embaralha saves.
- **A ORDEM das listas é o número no save**: cores de cabelo, raças, penteados, barbas, sobrancelhas — item novo entra no FIM.

**Mapa e decoração** (→ agente `mapa-e-cenario`)
- Decoração é DADO (`assets/decor.json`, gravado pelo editor de cenas). Ferramenta que escreva nele: nada de campo que o editor não conheça e nada de `y` para "pousar".
- Spawns de bichos ficam no FIM de `spawnEnemies` (não mexer nos `netId`).
- Tag de lugar nova = entrada em `aplicarMarcos`.
- Peça solta que tenha de aparecer de longe: raio > 20 m ou fora da lista do `LOD.soltas`.

**Personagem** (→ agente `aparencia-e-racas`)
- Raça é sempre `racaDe(a.raca, a.sexo)`, nunca `Assets.racas[n]`.
- Coisa que encoste no corpo (brinco, chifre, cicatriz) prende-se pelo ÍMÃ (`js/ima.js`), não por conta paralela às réguas. Régua nova que mexa no rosto entra em `rostoDaRaca`.
- Antes de acrescentar uma parte do corpo, confira se o modelo já não a tem.

**Desempenho** (→ agente `desempenho-do-jogo`)
- Nunca ler pixels da placa no meio do jogo (`readPixels`) nem criar/descartar material a cada vez.
- Luz: nunca ligar/desligar `visible` fora de `World.distribuirLuzes` (recompila tudo).
- Material ou luz que só aparece no meio do jogo: desenhe-a uma vez no `Game.preaquecer`.
- `InstancedMesh` novo: geometria só dele. Malha animada: uma por personagem e um `Skeleton` por personagem. Objeto parado: `matrixAutoUpdate = false`. `frustumCulled = false` só com motivo.
- A IMAGEM das texturas é dividida entre peças: nada de desenhar por cima de `map.image`.
- Fase nova no laço = um `M?.fase('nome')`; mudou a configuração de algo que pesa → ponha o teste dele no diagnóstico do monitor. O monitor não pode gerar lixo por quadro.
- "Como esse aparelho roda?" → rode `node ferramentas/desempenho/ler.mjs` antes de pedir relatório a alguém.

## Os agentes (`.claude/agents/`) e como chamar

| Chamada | Agente | Área |
|---|---|---|
| `/agent_servidor` | `servidor-e-publicacao` | `server.js`, launcher, lista branca, Pages × Render × Supabase (`hospedagem.js`), `versao.json`, `HOSPEDAR`, publicar, testar pela automação |
| `/agent_nucleo` | `nucleo-do-jogo` | `Game` e o laço, assets e `PROPS`, `CharacterModel`/trajes, `ATTACKS`, `World` (MAP, células, `SPECIAL_EDGES`), entidades, itens/inventário, o save (`save.js`, marcos, `MAPA_REV`) |
| `/agent_mapa` | `mapa-e-cenario` | floresta, mata, acampamento, WindHills, relevo, `decor.json` e o decorador, vegetação `gi-`/`lp-`, água e lagoas, animais, o terraço e o dragão |
| `/agent_ceu` | `ceu-capim-e-chao` | ciclo do dia, céu (`ceu.js`: sol, lua, nuvens, reflexo, clarão), luz, o tapete de capim, a cor do chão, caminhos, categorias das peças |
| `/agent_corpo` | `corpo-e-animacao` | o guerreiro (`guerreiro.glb`), retarget, malha fundida, dedos, clipes do Mixamo, guarda, duas mãos (IK), empunhadura, personagens esculpidos de fotos (`ferramentas/contorno`, `esculpido.js`) |
| `/agent_aparencia` | `aparencia-e-racas` | painel de Aparência, raças e corpo feminino, raça esculpida (Dennis), proporções, busto, rosto, presas, orelhas, penteados, barbas, sobrancelhas, ímã, modelagem, pintura, piscada |
| `/agent_combate` | `combate-e-itens` | escudo e postura, fratura, esqueleto desmontado, item caído e raridade, expositores, quebráveis, comida e receitas, a ficha (atributos, armaduras, peso, `FICHA`) |
| `/agent_rede` | `rede-e-mmo` | `js/rede/`, protocolo, sala, duelo, co-op, o Mundo online (`servidor-mundo.mjs`, simulador, `game.sessao`), chat global, chat de voz |
| `/agent_interface` | `interface-e-celular` | tela de entrada, HUD, menu de pausa em telas, coordenadas, câmeras (primeira pessoa, isométrica, véu), toque, tela deitada, carregamento no celular |
| `/agent_desempenho` | `desempenho-do-jogo` | qualidades gráficas, luzes, LOD, sombras, resolução automática, máquina fraca e celular, o monitor (F3), perfil de CPU, telemetria |
| `/agent_otimizador` | `otimizador-de-desempenho` (do usuário) | lentidão NOVA a investigar medindo: o método (medir, achar o gargalo, uma mudança por vez, provar) com o kit — monitor portátil e perfil de CPU (`--freio`). Ajuste ou dúvida sobre o que já foi feito aqui = `/agent_desempenho` |
| `/agent_rapido` | `executor-rapido` (do usuário) | qualquer área, com pressa: faz direto, sem a fase longa de testes |

Os dois últimos ficam em `~/.claude/` (valem em todos os projetos); a fonte do otimizador e do comando dele é `ferramentas/agente-desempenho/` (mudou lá → `node ferramentas/agente-desempenho/instalar.mjs --usuario`).
