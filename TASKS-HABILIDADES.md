# Árvore de habilidades, elementos e reações — o plano

O objetivo (pedido de 18/11/2026): uma árvore que dá atributos conforme a RAÇA, árvores
próprias de 7 ELEMENTOS, REAÇÕES entre qualquer par de elementos e uma TERCEIRA ÁRVORE
para cada reação, aberta ao upar os dois elementos dela (fogo + água abre a árvore do
Vapor, que termina no Vórtice).

Os dados do rascunho estão em `planejamento/arvore-de-habilidades.json`. Nada disso roda
no jogo ainda e todos os números são provisórios.

O **Livro de Habilidades** (`planejamento/livro-de-habilidades.html`) é o guia para consultar
tudo isso, gerado a partir do JSON. Mudou os dados? Rode
`node ferramentas/habilidades/gerar-livro.mjs`.

**Como construir:** UMA HABILIDADE DE CADA VEZ: desenhar, fazer, testar no jogo e só então
passar para a próxima. A primeira leva é só fogo, água e a árvore do Vapor. Os outros 5
elementos e as outras 20 reações vêm depois, seguindo a mesma regra.

## Etapa 0 — Fechar o desenho

- [x] **Decididos:** criação de personagem e trava de raça (D2), barra de Éter (D3),
  7 elementos (D4), reações e terceira árvore (D5), raça não limita elementos (D7),
  barra de 4 espaços (D10), luz, trevas e elétrico sem afinidade (D11) e personagens (D12).
- [x] **Dennis removido do jogo (D8).** O Goblin passou a ser o dígito 3 das raças.
- [x] **Sistema de níveis no jogo (D1):** cada nível libera 1 ponto de habilidade e dá +2 de vida,
  +1 de vigor, +0,2 de carga e +0,5% de força. Pronto no código, falta publicar.
- [x] **Modelo da árvore aprovado (D14, D15, D17):** Maestria de 5 pontos (dá dano e resistência ao elemento),
  2 linhas comuns de 3 pontos e 1 linha de suprema. O Fogo já está em `modelo_de_arvore`.
- [ ] **Rodar a migration dos elementos (D18):** `supabase/migrations/0005_habilidades.sql` está
  escrita, mas ainda não foi executada. Cria os 7 elementos com a Maestria, as 21 reações como
  registro e todas as habilidades do Fogo.
- [x] **A habilidade nova não substitui a original (D16):** a Rajada e a Bola de Fogo ficam
  disponíveis juntas.
- [x] **Reação do Caos (D13):** por enquanto existe só como registro na tabela.
- [x] **PvP (D6) e refazer a árvore (D9):** adiados, junto com o editor do dono.

## Etapa 1 — Tipos de dano (`/agent_combate`, com `/agent_rede` na parte da rede)

É a última task do `TASKS-COMBATE.md`, e tudo aqui depende dela.

- [ ] **`takeDamage` recebe o elemento** (`opts.elemento`), mantendo `opts.fire` funcionando
  durante a troca. Vale para `Enemy`, `Boss`, `Dragao` e `Player`.
- [ ] **Tabela de resistências por inimigo** com os 7 elementos, no lugar de `fireWeak` e da
  conta fixa do dragão, sem mudar os valores de fogo de hoje.
- [ ] **O elemento viaja na rede:** `GOLPE` e `GOLPE_PVP` levam o elemento, e `receberGolpe`
  passa a aceitar o alcance da magia (hoje recusa golpe sem fogo a mais de 8 m).
  Subir a `versao` de `assets/versao.json`.

## Etapa 2 — Dados, pontos e save (`/agent_nucleo`)

- [ ] **`js/habilidades.js` e `assets/habilidades.json`:** carregar o catálogo e calcular os
  bônus do personagem.
- [ ] **Bônus somados na conta:** `maxHp`, `maxStamina`, `cargaMax` e `damageMul` usam atributo
  + bônus. Nunca gravar o bônus em `vigor`, `endurance` ou `strength`.
- [x] **Save:** `jogador.habilidades` em `coletar` e `aplicarProgresso`. Save sem o campo abre
  com a árvore vazia.
- [x] **Validação no servidor:** forma e total de pontos em `saveTorto()` e, igual, em
  `personagem_valido()` (migration 0005).

## Etapa 3 — Criação de personagem (`/agent_rede_forte`, `/agent_interface`)

Mexe no banco e no login, então pode andar em paralelo com as etapas de combate.

- [ ] **Recomeço:** a migration apaga `masmorra.personagens` e `masmorra.saves`, porque os
  personagens atuais não precisam ser preservados. Os logins ficam: são os mesmos do Duel Academy.
- [ ] **Até 4 personagens por conta:** `masmorra.personagens` tem hoje o `dono` como chave
  primária (1 por conta). Recriar a tabela com `id`, `nome` e `id_publico`.
- [ ] **Nome único:** a tela avisa se o nome já existe e o banco garante com um índice único,
  sem diferenciar maiúsculas nem acentos.
- [ ] **Identificador para denúncia:** código público e permanente de cada personagem
  (ex.: `Kael #7K3F9Q`), que vai junto na denúncia.
- [ ] **Servidor de mundo:** a sessão passa a ser do personagem escolhido, com o nome dele
  no mundo e no chat. Hoje o nome e o arquivo em disco saem da conta.
- [ ] **Jornada:** decidir se o save offline (`masmorra.saves`) também terá vários personagens.
- [ ] **Telas antes do mundo:** escolher personagem, criar (nome, raça, aparência) e apagar.
- [ ] **Trava de raça:** tirar a troca do botão Aparência do menu de pausa. **Só ativar quando
  os modelos das raças estiverem prontos.**
- [ ] **Inato, afinidade e árvore da raça** ligados ao personagem por `racaDe`.

## Etapa 4 — Tela da árvore (`/agent_interface`)

- [ ] **Tela de habilidades** com abas Raça, Elementos e Reações. A árvore de cada reação
  aparece trancada até ter Maestria 5 nos dois elementos.
- [ ] **Montar a barra:** arrastar habilidades para os espaços, só fora de combate.
- [ ] **Funcionar no celular**, com pré-visualização do que cada ponto rende.
- [ ] **Refazer a árvore** (D9).

## Etapa 5 — Éter, barra e conjuração (`/agent_nucleo`, `/agent_interface`)

- [ ] **Barra de Éter no HUD:** começa vazia, enche lutando e esvazia fora de combate.
- [ ] **Barra de habilidades:** 4 espaços (teclas 1 a 4), com no máximo 1 suprema entre eles
  e botões de toque.
- [ ] **Tempo de recarga:** individual e global, mostrado em cada espaço. Trocar a habilidade
  reinicia a recarga dela.
- [ ] **Estado de conjuração no `Player`** com os clipes `cast` e `summon`, comprometendo o
  jogador como um golpe. Boneco remoto mostra a animação.

## Etapa 6 — Marcas e reações (`/agent_combate`, `/agent_rede`)

- [ ] **Marca no inimigo**, decidida por quem simula, com o visual indo no `MUNDO`.
- [ ] **Vaporização primeiro**, valendo para qualquer jogador e entre dois jogadores.
- [ ] **Tocha, bomba e resina** passam a deixar marca de fogo.
- [ ] **Chefes:** controle vira dano de postura.

## Etapa 7 — Magias da fatia (`/agent_combate`, `/agent_desempenho`)

- [ ] **Fogo e água, uma habilidade de cada vez**, reaproveitando `orb`, `bomb` e `shock`.
- [ ] **Formas novas:** `zona` e `vortice`.
- [ ] **Efeitos dentro das regras de desempenho:** partículas do `Effects`, sem luz nova e com
  material novo aquecido no `Game.preaquecer`.

## Etapa 8 — Árvore do Vapor (`/agent_combate`)

- [ ] **Os 4 nós:** Vaporização Dominada, Névoa Escaldante, Vórtice de Vapor e Olho do Vórtice.
- [ ] **Teste completo da fatia** sozinho, em co-op e no Mundo online.

## Etapa 9 — Expansão e equilíbrio

- [ ] **Terra, vento, luz, trevas e elétrico**, uma habilidade de cada vez, com as formas
  `cadeia` e `linha`.
- [ ] **As outras 20 reações e as árvores delas**, uma de cada vez.
- [ ] **Equilíbrio:** dano contra Carrasco e Wyrm, ganho e custo de Éter e os orçamentos de pontos.
- [ ] **Documentação:** registrar o sistema na base de conhecimento da área.

## Ideias para depois

Fora da primeira versão. Os detalhes estão em `ideias_para_depois`, no JSON.

- [ ] **Build Avatar (I1):** Maestria e dominação no máximo em fogo, água, vento e terra liberam
  uma árvore nova, em que a habilidade vira um combo: onda de fogo, rajada de água, vento que
  espalha e cria o vórtice, e golpe pesado de terra.
- [ ] **Editor de árvores e combos (I2):** criar árvores, combos e modificações pelo editor que
  fica no PC pessoal do dono.
- [ ] **Modificar habilidades pela build (I3):** uma combinação de build altera uma habilidade
  existente, como a Bola de Fogo.
