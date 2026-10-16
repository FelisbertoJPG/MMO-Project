# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Este arquivo é o ÍNDICE.** O detalhe de cada parte do jogo mora em `memory_claude/<tópico>.md` (o texto inteiro do CLAUDE.md antigo, dividido por assunto). **Antes de mexer numa área, LEIA o tópico dela** (tabela no fim). **Ao documentar algo novo, escreva no tópico** (ou crie um e ponha na tabela); aqui só entram regra curta que vale para o projeto todo e a linha do índice — este arquivo tem de ficar bem abaixo de 40 mil caracteres.

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

**Servidor, hospedagem e publicação** (→ `projeto-e-execucao`)
- O estático é LISTA BRANCA (`FRENTE` no `server.js`): pasta nova que a página carregue entra nela; `saves/` e `mundo/` ficam fora.
- O jogo roda no GitHub Pages (só arquivos): **rota nova do `server.js` precisa de um plano para o Pages**, e **caminho de arquivo tem de bater maiúscula/minúscula**. Publicar = `git push`.
- **Mudou o que VIAJA pela rede (protocolo, `MUNDO`)? Suba a `versao` de `assets/versao.json`** — ela recarrega todos em até 1 min.
- Rota nova que confie em `soDaqui` precisa da trava do `HOSPEDAR=1`.
- Servidor no Render: disco apagado a cada reinício; personagem na nuvem. **Falhar em LER o personagem nunca vira "personagem novo".** `personagem_valido()` (SQL) = `saveTorto()`: mudou um, mude o outro.
- **Testar sem estragar o save**: `game.salvar = () => {}` e `game.progresso = null; game.start()` antes de mexer; desligue o cache do Chrome de teste; mundo online com `MUNDO_DIR` temporário.

**Código do jogo** (→ `arquitetura-base`)
- Atraso em jogo é `game.after(sec, fn)`, nunca `setTimeout`.
- `.glb` novo só carrega se estiver em `PROPS` (`assets.js`); peça nova de pacote passa antes pelo `ferramentas/enxugar-glb.mjs`.
- Retimou um golpe (`ATTACKS`)? Ajuste a janela `hit`.
- **As armaduras vêm de ARQUIVO** (`assets/modelos/traje-*.json`): mudar o `gear.js` não muda nada; edite no Editor de modelo.
- `js/blocos.js` é CÓPIA gerada do editor — não edite aqui.
- Altura no mundo é RELATIVA ao chão: `X.clone().setY(X.y + h)`, nunca `setY(h)` (terraço, relevo).
- Medida de tela em JS: `tela.w`/`tela.h` (nunca `innerWidth`); em CSS, `var(--vw)` (→ `celular-e-tela`).
- Teclas em `input`/`textarea` são ignoradas pelo `Input`.

**Rede, modos e save** (→ `online-sala-e-coop`, `mmo-mundo-online`, `save-e-marcos`)
- **A IA nunca lê `game.player`** (usa `alvo` / `game.alvoPara`); golpe do jogador passa SEMPRE por `game.golpear`.
- Diferença entre Jornada e Mundo online é `game.regras.<nome>` (`js/modo.js`), não `if (game.modo === 'mmo')`.
- Ganchos de `game.sessao` são chamados com `?.`: método novo num modo não pode quebrar o outro.
- Inimigo novo com estado próprio precisa do seu `retomar` (troca de simulador).
- Tudo que chega da rede passa por `limparInstantaneo`/`protocolo.js`; dado torto é descartado.
- Estado novo que deva sobreviver ao fechar: `coletar`/`aplicarProgresso`. Regras mudaram a ponto de o progresso antigo não servir: suba `FICHA`. Mapa mudou movendo coisas: suba `MAPA_REV`. Reordenar `doors`/`chests`/`torches` embaralha saves.
- **A ORDEM das listas é o número no save**: cores de cabelo, raças, penteados, barbas, sobrancelhas — item novo entra no FIM.

**Mapa e decoração** (→ `decoracao`, `vegetacao-e-decorador`, `windhills-e-relevo`)
- Decoração é DADO (`assets/decor.json`, gravado pelo editor de cenas). Ferramenta que escreva nele: nada de campo que o editor não conheça e nada de `y` para "pousar".
- Spawns de bichos ficam no FIM de `spawnEnemies` (não mexer nos `netId`).
- Tag de lugar nova = entrada em `aplicarMarcos`.
- Peça solta que tenha de aparecer de longe: raio > 20 m ou fora da lista do `LOD.soltas`.

**Personagem** (→ `aparencia-e-racas`, `ima-modelagem-pintura-piscada`)
- Raça é sempre `racaDe(a.raca, a.sexo)`, nunca `Assets.racas[n]`.
- Coisa que encoste no corpo (brinco, chifre, cicatriz) prende-se pelo ÍMÃ (`js/ima.js`), não por conta paralela às réguas. Régua nova que mexa no rosto entra em `rostoDaRaca`.
- Antes de acrescentar uma parte do corpo, confira se o modelo já não a tem.

**Desempenho** (→ `desempenho-graficos`, `desempenho-ferramentas`)
- Nunca ler pixels da placa no meio do jogo (`readPixels`) nem criar/descartar material a cada vez.
- Luz: nunca ligar/desligar `visible` fora de `World.distribuirLuzes` (recompila tudo).
- Material ou luz que só aparece no meio do jogo: desenhe-a uma vez no `Game.preaquecer`.
- `InstancedMesh` novo: geometria só dele. Malha animada: uma por personagem e um `Skeleton` por personagem. Objeto parado: `matrixAutoUpdate = false`. `frustumCulled = false` só com motivo.
- A IMAGEM das texturas é dividida entre peças: nada de desenhar por cima de `map.image`.
- Fase nova no laço = um `M?.fase('nome')`; mudou a configuração de algo que pesa → ponha o teste dele no diagnóstico do monitor. O monitor não pode gerar lixo por quadro.
- "Como esse aparelho roda?" → rode `node ferramentas/desempenho/ler.mjs` antes de pedir relatório a alguém.

## Índice dos tópicos (`memory_claude/`)

| Arquivo | O que tem |
|---|---|
| `projeto-e-execucao.md` | launcher, `server.js`, lista branca, Pages × Render × Supabase (`hospedagem.js`), `versao.json`, `HOSPEDAR`, testar pela automação |
| `arquitetura-base.md` | `Game` e o laço, pipeline de assets, `CharacterModel`/trajes, `ATTACKS`, `World` (MAP, células, `SPECIAL_EDGES`), entidades, itens/inventário, `combat.js`/`audio.js`/`ui.js` |
| `guerreiro-e-provador.md` | o corpo do jogador (`guerreiro.glb`), retarget ao vivo, código da armadura, malha fundida, os dedos |
| `tela-de-entrada.md` | a tela de login do MMO, a Jornada escondida (`?jornada`), `?teste=Nome` |
| `save-e-marcos.md` | `js/save.js`, tags de lugar (`marcos`), `MAPA_REV` |
| `animacoes-de-fora.md` | clipes do Mixamo (`retarget-mixamo.mjs`), `--endireitar`/`--ombros` |
| `floresta.md` | o mapa `floresta`, células `f`, clima por célula, árvores padronizadas, peças Quaternius, cor da grama, ANIMAIS |
| `decoracao.md` | `decor.json`, `placeDecor`, `PROPS`, cadáveres |
| `windhills-e-relevo.md` | as WindHills, o relevo (colinas → pontos), pedra que barra, a passagem, o relevo da floresta, fogueira `colinas` |
| `ceu-e-ciclo-do-dia.md` | `cicloDoDia`, `CEU`, `js/ceu.js` (céu, reflexo, clarão), `__hora` |
| `capim-chao-e-categorias.md` | o tapete de capim, a cor do chão, os caminhos de terra, `categorias.js` |
| `agua-e-cenarios.md` | `js/agua.js`, lagoa e laguinho, respingos, `ferramentas/cenarios/` |
| `vegetacao-e-decorador.md` | o decorador do editor de cenas, a vegetação `gi-`, árvores/pedras `lp-`, a moita de capim |
| `terraco-e-dragao.md` | células `a`/`e`, níveis de chão, modelos de blocos, o Wyrm das Cinzas |
| `online-sala-e-coop.md` | `js/rede/`, nível 1 (fantasmas, mensagens, mortes), protocolo, sala, duelo, co-op |
| `chat-e-voz.md` | chat global (`public.mensagens`), chat de voz WebRTC, TURN |
| `interface-menus-e-camera.md` | cruz dos itens, coordenadas, sair, menu de pausa em telas, modos de câmera (ombro, primeira pessoa, isométrica, véu) |
| `celular-e-tela.md` | `js/toque.js`, abrir no celular (memória, carregamento, vigia), tela deitada por CSS (`tela.js`) |
| `desempenho-graficos.md` | qualidades (`graficos.js`), luzes, LOD, sombras, resolução automática, cortes para máquina fraca e celular, o monitor (F3) |
| `desempenho-ferramentas.md` | o agente de desempenho e o kit, telemetria (`telemetria.js`, `ler.mjs`) |
| `combate-objetos-e-loot.md` | fratura, escudo dos inimigos, esqueleto desmontado, item caído e raridade, expositores, quebráveis, esqueletos reforçados |
| `comida.md` | comida no lugar do Estus, panela e receitas, comer/beber (`refeicao.js`) |
| `mmo-mundo-online.md` | `game.modo`, acampamento, `servidor-mundo.mjs`, simulador, mundo que não reinicia, de todos × de cada um, contrato de `game.sessao` |
| `guarda-e-empunhadura.md` | guarda, escudo nas costas, as duas mãos (IK), `empunhadura.json`, camadas de pose |
| `ficha-e-armaduras.md` | `ficha.js`, atributos por faixas, armaduras, armaduras pintadas (`casca.js`), peso e carga, `FICHA` |
| `aparencia-e-racas.md` | painel de Aparência (código da aparência), raças (`racas.json`), masculino/feminino, busto, proporções, arcada, queixo, presas, orelhas |
| `penteados-barbas-sobrancelhas.md` | `js/penteado.js`: penteados, barbas, sobrancelhas, tranças de guerra |
| `ima-modelagem-pintura-piscada.md` | o ímã (`ima.js`), a modelagem (`modelagem.json`), a pintura (`pintura.js`, olhos), a piscada |
