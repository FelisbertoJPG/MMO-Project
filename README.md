# Masmorra do Carrasco

Action RPG no estilo souls-like, feito com Three.js. Você acorda numa cela, como em Dark Souls 1, sem arma e sem escudo. Os equipamentos aparecem conforme você atravessa a masmorra, e no fim o Carrasco espera atrás da névoa.

## Jogar agora

https://felisbertojpg.github.io/MMO-Project/ — abre no navegador, sem instalar nada. Lá o progresso da Jornada fica no navegador (e na sua conta, se entrar com uma); o Mundo online liga quando o servidor de mundo estiver no ar.

## Como rodar

```bash
npm start
```

Depois abra http://localhost:5173. O projeto não tem dependências: o three.js e o GLTFLoader já estão em `vendor/`.

## Dois modos de jogo

Na tela inicial:

- **Jornada**: o jogo de sempre. O mundo é só seu e o progresso fica neste computador (e na sua conta, se tiver uma). Um amigo entra pela tecla **O**: andar juntos, lutar lado a lado no mundo de um de vocês, ou duelar.
- **Mundo online**: um mapa só para todos os jogadores. Precisa de conta. O personagem nasce no acampamento do lado de fora da masmorra, com uma adaga, e fica guardado no servidor. Inimigos, portas e chefes são de todos (os inimigos renascem com o tempo); baús e itens são de cada personagem.

Para hospedar um mundo, rode `node server.js` numa máquina que os outros alcancem e passe o endereço: eles abrem `http://<endereço>:5173`, ou trocam o servidor na tela inicial do jogo deles. Os dados ficam em `mundo/`. Detalhes e o que ainda falta em `TASKS-MMO.md`.

## Controles

| Tecla | Ação |
|---|---|
| WASD / Mouse | Mover / câmera |
| Clique esquerdo | Ataque leve (combo) |
| F | Ataque pesado |
| Clique direito | Defender com escudo, ou golpe de fogo quando estiver com a tocha |
| Espaço (toque / segurar) | Rolar (cambalhota com i-frames; sem direção rola para trás) / correr |
| Q / botão do meio | Travar mira |
| T | Acender / guardar a tocha |
| R / C | Usar / trocar item rápido |
| E | Interagir (portas, baús, tochas, itens, fogueira, mensagens, névoa) |
| I / Tab | Inventário |
| O | Multijogador: sala, co-op e duelo (Jornada) ou quem está no mundo (Mundo online) |
| M | Deixar uma mensagem no chão (com conta) |

## Progressão

1. **Cela**: você acorda sem nada. Uma chave cai pela grade do teto e abre a porta.
2. **Corredor das celas**: tochas nas paredes, a Adaga Enferrujada num cadáver e o primeiro esqueleto.
3. **Sala da fogueira**: a fogueira e um baú com o Frasco de Estus.
4. **Sala da guarda**: esqueletos que levantam do chão, um escudo no baú e uma espada num cadáver. Uma porta leva à alcova do tesouro, com um baú dourado que guarda o Espadão.
5. **Ossário**: guerreiro com escudo, ladino, necromantes e mais baús.
6. **Névoa → O Carrasco.**

## Tocha

- Pegue qualquer tocha de parede com **E**. O lugar de onde ela saiu fica escuro, porque a tocha não está mais lá.
- Você só pode carregar **uma tocha por vez**.
- Ela fica na mão esquerda, no lugar do escudo. Ilumina o caminho, projeta sombras dinâmicas e serve de arma: o **clique direito** dá um golpe de fogo, e esqueletos são fracos a fogo.
- Queima por **1 hora** enquanto está acesa na mão (o contador fica no HUD). Com **T** você guarda a tocha, e ela para de queimar. Quando o tempo acaba, ela se apaga e some.

## Sistemas

- Vida, vigor, equilíbrio (poise), atordoamento e quebra de guarda. Cada arma tem as próprias animações de golpe, e as janelas de acerto foram medidas pelo pico de velocidade da mão em cada animação.
- **6 baús** espalhados. A tampa abre com animação e os itens vão direto para o inventário.
- **Portas** que abrem com E; a da cela precisa da chave.
- **Fogueira**: descansa, recarrega o Estus, faz os inimigos renascerem e permite subir de nível.
- **Morte**: as almas ficam numa mancha de sangue para você recuperar.
- **Inimigos** (esqueletos), com pathfinding no grid da masmorra:
  - Esqueleto Desperto: levanta do chão quando você chega perto.
  - Guerreiro: ergue o escudo; golpes pesados quebram a guarda.
  - Ladino: rápido e esquiva para trás.
  - Necromante: lança orbes teleguiados.
- **O Carrasco** tem 2 fases:
  - Fase 1: cortes, golpe vertical com onda de choque, estocada com investida e giro.
  - Fase 2: salto com onda de choque grande e invocação de esqueletos que saem do chão.

## Personagens

Os personagens usam o manequim humano da **Quaternius Universal Animation Library**, com proporções realistas e mais de 100 animações (rolamento, combos de espada, escudo, beber Estus, abrir baú, levantar do chão...). Armaduras, ossos e armas são **modelados por código** em `js/gear.js`, montados na pose T e presos aos ossos do esqueleto, então acompanham qualquer animação:

- **Cavaleiro (jogador):** armadura de placas escura com elmo fechado, ombreiras, tabardo e capa.
- **Esqueletos:** ossos de verdade (crânio com olhos em brasa, costelas, vértebras, rádio e ulna), com trapos, elmo, capuz ou manto conforme o tipo.
- **Carrasco:** corpo gigante com capuz pontudo, avental de couro e machado de duas lâminas.
- **Armas:** espada longa, adaga, machado, espadão, machado do carrasco, cajado, escudos (redondo e de cavaleiro) e tocha, todos em PBR com textura de sujeira/ferrugem.

As janelas de dano de cada golpe foram medidas pela velocidade da ponta da lâmina em cada animação (tabela `ATTACKS` em `js/character.js`).

## Estrutura

```
js/assets.js     carregamento dos glTF (animações Quaternius, cenário KayKit)
js/character.js  personagem animado, encaixe de armas nas mãos, tabela de golpes
js/gear.js       armaduras, ossos, trajes e armas procedurais + materiais
js/world.js      masmorra gerada de um mapa ASCII (grid de 6 m), colisão, portas, baús, tochas, fogueira, névoa
js/player.js     jogador, tocha, câmera com colisão
js/enemies.js    IA e tipos de esqueletos
js/boss.js       o Carrasco
js/combat.js     partículas, projéteis, ondas de choque
js/inventory.js  inventário (mão direita, mão esquerda, anéis, cinto)
js/items.js      itens e ícones
js/ui.js         HUD, menus
js/audio.js      sons sintetizados (WebAudio)
```
## Créditos

- **Personagens e animações:** Quaternius, Universal Animation Library 1 e 2 (licença CC0). Veja `assets/LICENSE-Quaternius.txt`.
- **Cenário da masmorra:** KayKit Dungeon Remastered, de Kay Lousberg (licença CC0). Veja `assets/LICENSE-KayKit.txt`.
- **Floresta e acampamento:** KayKit Forest Nature Pack e KayKit Medieval Hexagon Pack (barraca, cerca, alvos, carrinho de mão), de Kay Lousberg, e pacotes de natureza da Quaternius (todos CC0). Veja os `assets/LICENSE-*.txt`; o arquivo de licença do pacote de hexágonos não veio junto com a biblioteca do editor.