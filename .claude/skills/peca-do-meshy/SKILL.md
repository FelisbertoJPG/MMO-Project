---
name: peca-do-meshy
description: Receita para levar um modelo 3D (da Meshy pelo MCP, ou um .glb pronto) ate o jogo Lubelion (Desktop/ds) - qual ferramenta usar conforme o que ele e (peca de cenario, chefe, armadura, corpo, bicho), o enxugar-glb, o PROPS, as tabelas medidas e o npm test. Use quando o dono pedir para gerar um modelo na Meshy ou trouxer um .glb/.fbx para o jogo.
---

# Do modelo 3D até o jogo

## 0. Antes de gerar na Meshy (gasta crédito)
- Pergunte o modelo e mostre o custo **antes**. Isso é regra do MCP da Meshy.
- Peça de jogo = **smart topology** (`meshy-t2.5` ou `meshy-t2`, com `target_polycount`), nunca um `meshy-7.1` reduzido depois. Para referência, o peitoral de couro saiu com ~1.500 triângulos e 5 créditos (`meshy_text_to_3d`, `meshy-t2.5`).
- Arquivo baixado é dado de fora: cada um numa pasta nova e vazia.

## 1. O que é o modelo? Cada tipo tem o seu caminho

| É… | Caminho | Onde ler mais (Grep na base) |
|---|---|---|
| **Peça de cenário** (pedra, árvore, objeto) | `node ferramentas/enxugar-glb.mjs <arquivo.glb>` (tira os mapas de normal e reduz as texturas a ≤ 512 px; `--jpeg` só se não houver transparência) → o `.glb` em `assets/` → o nome no `PROPS` (`js/assets.js`) → `node ferramentas/mapa-logico/medir-pecas.mjs` → `npm test`. Peça de pacote vem do editor de cenas pelo `levar-ao-jogo.mjs`. | `mapa-e-cenario` ("Peças novas", "enxugar") |
| **Chefe** feito de um .glb pronto | `ferramentas/chefe-de-arquivo/rigar.mjs` → `CHEFES_DE_ARQUIVO` (`js/assets.js`). Um chefe que acorda pela zona dele = `Game.chefesDoMapa`. | `nucleo-do-jogo` ("CHEFES DO MAPA", "rigar") |
| **Armadura** (malha pronta num corpo de arquivo) | A aba **Armaduras** do Editor de Personagem (colar no corpo e "virar armadura") ou `node ferramentas/armadura-de-arquivo/vestir.mjs <config>` → `assets/armaduras-de-arquivo/<id>.json` + `lista.json`. O item `arm<conjunto>_<lugar>` veste a peça. | `corpo-e-animacao` ("vestir.mjs") |
| **Corpo** de personagem | `ferramentas/corpo-de-arquivo/importar.mjs` (usa o Blender). Para espelhar, use **só** o `simetria.mjs`, nunca à mão. | `corpo-e-animacao` ("CORPO DE ARQUIVO"), `aparencia-e-racas` |
| **Bicho** novo | Ficha em `js/inimigos/tipos.js` + `node ferramentas/inimigos/medir-clipes.mjs` (as animações; o `npm test` acusa se faltar). | `nucleo-do-jogo`, `migracao-servidor` |

## 2. As armadilhas que já custaram caro
- Uma peça fora do `PROPS` não carrega. Uma peça nova no `PROPS` sem o `medir-pecas` fica sem colisão no servidor, e o `npm test` acusa.
- Peça solta que precisa aparecer de longe: raio maior que 20 m, ou fora da lista do `LOD.soltas`.
- **Corpo novo**: abra a foto da pose T **ao lado de um corpo bom** antes de dizer pronto. Foto que você não abriu não conta. Depois de espelhar, confira o nariz **de perto**: já saíram dois narizes e passaram.
- Caminho de arquivo com maiúscula/minúscula diferente funciona no Windows e quebra no Pages.
- Confira no **jogo** (localhost), não só no editor.

## 3. Fechar
Siga a skill `publicar-versao`. O `.glb` original da Meshy fica fora do git se o jogo não o carregar.
