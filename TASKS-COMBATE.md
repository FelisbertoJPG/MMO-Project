# Combate, níveis e equipamento — o plano

O objetivo (pedido de 04/10/2026): **os níveis ajudam, o equipamento decide**. Com 20
em cada atributo o jogador ficava imortal; agora 20 em cada é o MÍNIMO para encarar o
Carrasco, e ele ainda pesa sem armadura. As regras moram em `js/ficha.js`.

## Feito (ficha 2, 04/10/2026)

- [x] **Reset de todos os jogadores** — o save grava `jogador.ficha`; save de outra
  ficha não é aberto (`fichaAtual` em `save.js`, também no personagem do Mundo online)
  e o personagem recomeça do zero. Sem migration: `versao` continua 1 (o servidor e o
  `personagem_valido()` do Supabase a exigem).
- [x] **Curva de progressão maior** — cada atributo rende por FAIXAS (`curva`): até 20
  bem, de 21 a 40 metade, depois quase nada. Vida 200 → 300 (20) → 400 (40); vigor
  90 → 130 → 170; carga 30 → 45 → 61.
- [x] **Custo de nível maior** — `custoDoNivel(n) = 600 × 1,12^(n−1)` (antes 160 ×
  1,13^(n−1)): 600 no 1, ~1,8 mil no 10, ~16 mil no 30. Chegar a 20/20/20 (nível 31)
  custa ~145 mil almas (antes ~47 mil).
- [x] **A força vale o quanto a arma aproveita** — bônus de força (+30% no 20, +60%
  no 40) × a `escala` da arma (E 0,25 · D 0,5 · C 0,75 · B 1 · A 1,2). Abaixo do
  `requisito` de força, golpes a 60%. Adaga D/6, espada longa C/10, machado B/14,
  espadão A/18.
- [x] **Armaduras** — 3 conjuntos × 4 lugares (cabeça, peito, braços, pernas): couro do
  Batedor (16%, peso 6, sem elmo), malha do Sentinela (29%, peso 14), placas do
  Cavaleiro Caído (40%, peso 24). Cada peça mostra a sua parte no corpo do guerreiro
  (A1/A2/A3 do modelo, misturáveis: o código `cabeça-peito-braços-pernas` viaja na rede).
  Onde achar: couro nos baús do acampamento e da masmorra; elmo da malha num baú; o resto
  da malha cai (raro) do Guerreiro Esqueleto; as placas são o prêmio do Carrasco
  (peito, elmo) e do Wyrm (braços, pernas).
- [x] **Sentir a falta da armadura** — os golpes inimigos valem 25% a mais
  (`DANO_RECEBIDO`) e a defesa (armadura + anel + comida) tira daí, com teto de 75%.
  A armadura também dá EQUILÍBRIO (cambaleia menos).
- [x] **Peso e carga** — armas, escudo e armadura pesam; a resistência dá a carga.
  Até 70%: normal. Até 100%: rolar custa +25% e anda −15%, fôlego −15%. Acima:
  sobrecarregado — sem corrida, passo a 60%, rolagem curta e cara, fôlego pela metade.

## A fazer

- [ ] **Ajuste fino pelo jogo** — jogar a curva inteira (do acampamento ao Carrasco) e
  mexer nos números do `ficha.js`: almas dos inimigos × custo do nível, a chance das
  peças da malha, o peso das armas.
- [ ] **Mais armaduras e armas** — hoje são 11 peças e 4 armas; um quarto conjunto (só
  com o que o modelo do guerreiro tem) ou peças avulsas.
- [ ] **TIPOS DE DANO (a última, dedicada)** — dano físico, mágico e elementais (fogo,
  gelo, raio…), cada um com FRAQUEZAS e RESISTÊNCIAS: armas e magias causam um ou mais
  tipos; inimigos e armaduras resistem diferente a cada um (o esqueleto já é "fraco a
  fogo" no texto do jogo; a tocha e a bomba já são fogo; o Wyrm quase não sente fogo).
  A `absorcao` das armaduras vira uma tabela por tipo, e o `takeDamage` de todos recebe
  o tipo do golpe. É o que torna a escolha de equipamento estratégica de verdade.
