# Base de conhecimento — migracao-servidor

> A documentação da área (a MIGRAÇÃO PARA O SERVIDOR, o "caminho 2" contra trapaça: levar para REGRA do servidor tudo o que o jogador pode manipular — o passo, a parede, o golpe, o vigor e o ritmo, os inimigos que hoje um jogador simula, a vida dele e o save —, separando a regra do desenho em camadas). É a ÚNICA cópia: lição nova da área entra aqui, no tópico certo. O desenho das criaturas por dentro (a base, os comportamentos, os traços, as fichas) mora na base `nucleo-do-jogo`; o Mundo online (o roteador, o simulador, o protocolo), na `rede-e-mmo`; a publicação (Render, `buildFilter`), na `servidor-e-publicacao`.

## O critério e as regras do dono

- **O que vai para o servidor é o que o JOGADOR PODE MANIPULAR** (o dono, 24/11/2026: "migrar pra regras apenas oq o jogador pode manipular, evitando hacker e possiveis espertinhos que burlem o sistema"). O navegador de cada um é dele: qualquer número que sai de lá pode ser mentira. O desenho (boneco, animação, partícula, som, câmera, interface) fica no navegador.
- **Sem gambiarra: o jeito padrão e modular** ("lembra que eu n quero gambiarra, quero modular o projeto da maneira mais correta e adequada"). Ex.: o three no Node veio do npm (`three@0.170.0`, o mesmo arquivo do `vendor/`), não de um import por caminho relativo. Recomende o convencional e diga o custo.
- **Diferente = DADO, não classe** ("deixa mais genérico… o Carrasco seria algo como uma classe de inimigos?"): ficha + traços + comportamento (ver "A receita"). Estender o mesmo jeito para os itens foi combinado (ver "O que falta").
- **Mudança de arquitetura se DEBATE antes** (em texto, com opções, prós/contras e a recomendação; o dono recusa a janela de perguntas e prefere conversar). Detalhe dentro de um caminho já escolhido se decide sozinho.
- **Publicar mesmo sem o navegador** quando o servidor local caiu (a máquina tem pouca memória): os testes do Node passando bastam — "é só uma beta" e o dono troca de máquina pelo GitHub —, mas diga o que ficou sem conferir.
- A ordem combinada: **1 → 3 → 2** (o vigor e o ritmo; os inimigos no servidor; o save no Supabase).

## O mapa: o que o jogador manipula × onde está

| O que ele mexe | Como trapaceia | Situação |
|---|---|---|
| andar | correr rápido demais, teleporte | ✔ o balde de velocidade (regras-do-mundo.mjs `passo`) |
| atravessar parede | andar dentro da rocha, cortar caminho | ✔ `foraDoMapa` pelo mapa lógico |
| dano, vigor e ritmo do golpe | bater forte, rápido, sem cansar | ✔ o teto da arma, o vigor generoso, as fichas de ritmo |
| os INIMIGOS (quando ele é o simulador) | matar tudo, mandar dano em outros, dar almas a si mesmo, abrir portas, deixar o chefe parado | em andamento: a etapa 3 (as criaturas já têm o cérebro sem desenho; falta o servidor rodá-lo) |
| a própria vida | ignorar dano (modo deus), curar à vontade | ✗ depois da etapa 3: o servidor calcula o dano dos inimigos e passa a contar a vida |
| o save | almas, nível, itens, inventário inventados | ✗ a etapa 2 (o Supabase como autoridade) + os itens como ficha + efeitos |

## As regras que já estão no servidor

- **AS REGRAS DO MUNDO (24/11/2026, `regras-do-mundo.mjs`)**: o balanceamento como REGRA, no que dá para conferir sem rodar o combate — pelos MESMOS números do jogo (importa `js/ficha.js`, `js/items.js`, `js/caminhos.js`, sem three, e relê `assets/balanco.json` a cada 5 s). **O passo**: um balde de metros que enche na velocidade máxima possível (a maior entre a corrida × o maior bônus da árvore — `passo` × `passoAposEsquiva` com a árvore inteira —, o rolamento e o dash: `ALCANCE_DO_ROLAMENTO` × distância / duração) × 1,25, com 4 s de folga; o `pos` que pede mais é CORTADO no caminho (`carga.x`/`z` reescritos): os outros, e o simulador que confere o alcance do golpe pelo boneco, veem só até onde dava. Cair a menos de 12 m de uma fogueira (as tags `[linha, coluna]` do mapa: renascer, voltar para casa) vale sempre. **O golpe** (`golpe` ao simulador): dano, poise e a força contra escudo (`qn`/`qd`) até o máximo da arma nas mãos (`d`/`e` do último `pos`; a de antes vale 3 s; antes do 1º `pos`, a mais forte) no nível + 20 (o nível: do save no disco; na nuvem, `lerNivel` no Supabase depois de entrar — falhar não impede entrar, fica o teto do nível 999), com todos os bônus juntos (`GOLPE_FORTE`, `BUFF_DANO`, Emboscada, fraqueza ao fogo; fogo vale a bomba e a Seta), × 1,05 + 1; acima, não chega. Arma que o servidor não conhece = o teto antigo (500). Quem passa vai para o log (`[regra] Nome #código: …`, uma linha a cada 10 s). **NÃO confere**: o que o SIMULADOR faz (os golpes dele não passam pelo servidor). **Conta nova de golpe ou de velocidade no player.js = a mesma aqui**: os números divididos moram na `ficha.js` (`GOLPE_FORTE`, `BUFF_DANO`, `FORCA_NA_BOMBA`, `ALCANCE_DO_ROLAMENTO`); bônus de velocidade novo da árvore entra no `passo`/`passoAposEsquiva` do caminhos.js (o servidor lê o máximo de lá). O Render reinicia quando esses arquivos mudam (`buildFilter`).
- **O VIGOR E O RITMO (24/11/2026, a etapa 1)**: o instantâneo leva `n` (golpes começados: `player.golpesIniciados`) e `r` (rolamentos: `player.rolamentos`), e cada `golpe` ao simulador leva `n` (o número do seu ataque) e, na bomba e na Seta, `pj` (`bomba`/`seta`, o `opts.proj` do `game.golpear` no combat.js). O servidor leva o vigor de cada um pelo lado GENEROSO — o máximo do nível + 20 e da árvore inteira, a recuperação com 2 anéis de fôlego + a comida (`FOLEGO_DA_COMIDA`) + a árvore, só depois da espera (`vigor_espera_golpe`/`rolamento_espera`), o golpe e o rolamento mais baratos —; ataque começado com menos que `golpe_vigor_minimo` NÃO VALE (os golpes dele são recusados), e o ritmo (fichas a 2× o golpe mais rápido da arma da mão DIREITA ou da tocha, até 4 juntas: `menorIntervalo`, pela `ATTACKS` + `solta` do player.js) idem. Golpe de perto sem `n`, de ataque que não valeu, que já acabou (mais de 2 números atrás) ou que já acertou aquele inimigo é recusado. Bomba e Seta: teto e ritmo próprios (`tetoDoProjetil`). O rolamento só gasta (o Guarda Firme devolve 1 de vigor que o servidor não vê). Simulado: o honesto no ritmo máximo das 3 armas, 0 recusas em 60 s; vigor infinito com adaga e espada longa, ~95% recusado; com o ESPADÃO quase não pega (+22% de golpes; o jogo deixa golpear com 5 de vigor e a arma lenta já é o limite) — apertar isso acusaria quem apanha no meio do golpe. A tabela `ATTACKS` mora em `js/ataques.js` (só dados) e `GOLPE_DA_TOCHA` em items.js para o servidor ler.
- **A PAREDE NO PASSO (24/11/2026, `foraDoMapa` em regras-do-mundo.mjs; o servidor monta o mapa lógico em `mapa-do-servidor.mjs`)**: o `pos` que para na ROCHA ou no miolo de uma parede/grade (`dentroDaParede`, a caixa encolhida 0,2 m) não anda, e a célula nova tem de ser alcançável ANDANDO (`alcancaEmPassos`: célula a célula, sem rocha, grade nem desnível; porta e névoa contam como abertas — quem abre e atravessa é o jogo) no que ele podia ter andado desde o último passo que valeu (o balde, ou o tempo × a velocidade máxima: o atraso nunca prende o honesto). Não é a linha reta (dois pontos honestos de uma esquina cortam a quina). A primeira versão (2 células de folga além da linha reta) deixava cortar caminho por parede fina: a regra boa é a FÍSICA da velocidade — o trapaceiro só "chega" quando daria para ter dado a volta. Simulado: o honesto andando pelo mapa com atraso de até 6 s, 0 cortes em ~24 mil recados; o trapaceiro em linha reta pela rocha nunca chega antes de quem contornaria na velocidade máxima, e atrás de grade nunca chega.

## A receita: migrar um sistema em CAMADAS

1. **Separe a REGRA do DESENHO.** A regra vai para um módulo puro: sem `Assets`, `scene`, `effects`, `sfx`, `document`, `model` (o three pode, pelo `import * as THREE from 'three'`: no navegador é o import map; no Node, o pacote do npm). O desenho fica no CORPO, que herda da regra e não decide nada. Eles conversam por:
   - **ESTADO**, que o corpo lê a cada quadro (`pos`, `facing`, `visivel`, `flashT`, a pose…);
   - **EVENTOS SÍNCRONOS** (`ouvir`/`emitir`) para o que acontece uma vez (golpe, morte, som). A animação pedida também é evento (`tocar`/`posar`) e é aplicada NA HORA: o Carrasco intercalava `model.play` próprios, e uma fila trocaria a ordem.
2. **Números e listas viram DADO**: a FICHA (`js/inimigos/tipos.js`), os nascimentos (`nascimentos.js`), o mapa (`mapa-logico.js`: as tochas, os baús, as fogueiras). O número que estava no código (o dano da mordida do dragão, a fraqueza ao fogo) sai para a ficha.
3. **O que é diferente** vira:
   - um TRAÇO (`tracos.js`), quando outra criatura pode usar (chefe, arena, fases, invocar, território…);
   - um COMPORTAMENTO (uma classe por tipo de corpo/movimento: `humanoide`, `quadrupede`, `dragao`), quando o jeito inteiro de decidir é outro.

   Nunca uma classe nova por criatura. A base comum (`cerebro.js`) tem os ganchos (`renascer`, `posturaInicial`, `receberGolpe`, `preparar`, `decidir`, `pisar`, `aoRetomar`, `estadoDeMorto`…) — ver a base `nucleo-do-jogo`.
4. **O que dependia do MODELO** (o tamanho de uma peça, a duração de um clipe, a mão do boneco) vira:
   - uma TABELA medida nos `.glb` por ferramenta, a mesma no jogo e no servidor: `ferramentas/mapa-logico/medir-pecas.mjs` → `assets/caixas-das-pecas.json`; `ferramentas/inimigos/medir-clipes.mjs` → `assets/clipes-dos-bichos.json`. O `npm test` acusa a tabela velha;
   - ou uma CONTA medida uma vez: `FEITICO` (a mão do Necromante: 0,44 m atrás, 0,2 m à direita, 1,8 m de altura, medida na luta gravada) e `BOCA` (o dragão).

   O que é só visual continua do modelo (o fogo que se vê sai da boca de verdade).
5. **O servidor monta das MESMAS fontes**: `mapa-do-servidor.mjs` (`lerMapaLogico`, `lerProps`); `regras-do-mundo.mjs` importa `js/ficha.js`, `js/items.js`, `js/caminhos.js`, `js/ataques.js` e `js/mapa-logico.js`; as criaturas, por `criarCerebro` (`js/inimigos/criar.js`). Arquivo novo que o servidor lê = linha no `buildFilter` do `render.yaml` (senão o Render não reinicia e roda a regra velha). O mundo que o cérebro enxerga é pequeno e injetado (`time`, `world`, `alvoPara`, `player`, `jogadores`, `projectiles`, `onEnemyKilled`, `marionetes`, `invocar`/`dispensar`, `clipesDe`): no navegador é o `Game`; no servidor será o simulador dele.
6. **A API de fora fica**: o resto do jogo e a rede continuam chamando o que chamavam (`boss.sleep/wake/defeated/minions/eyeGlow`, `dragao.brasa/podeAcordar`, `e.model`, o retrato `retratoDoInimigo`, o estado `morto` dos bichos no retrato). Mudar nome de protocolo derruba quem está com a versão de antes aberta.
7. **Um commit por parte**, com teste do Node novo para a parte (o cérebro sozinho: "o CÉREBRO das criaturas roda sem o navegador"), e a documentação junto (a base da área que a parte toca).

## As peças prontas (onde está o quê)

- `regras-do-mundo.mjs` — `criarRegras(raiz, { mapa, avisar })`: `passo`, `golpe`, `foraDoMapa`, `vigorDe`, `teto`, `tetoDoProjetil`, `menorIntervalo`. O servidor (`servidor-mundo.mjs`) monta o mapa lógico uma vez (`lerMapaLogico`) e passa.
- `js/mapa-logico.js` — o mundo sem desenho (grade, chão, colisões em `montarColisoes`, caminho, `alcancaEmPassos`, `dentroDaParede`); o `World` é um `MapaLogico` que desenha. Base `nucleo-do-jogo`.
- `js/inimigos/` — `cerebro.js` (a base), `humanoide.js`, `quadrupede.js`, `dragao.js`, `hidra.js` (os comportamentos; a hidra, 25/11/2026: enraizada, pisão + cuspe, bocas/pés como tabela da ficha, o traço `zona` — base `nucleo-do-jogo`), `tracos.js`, `tipos.js` (todas as fichas), `nascimentos.js` (onde nasce cada um; a ordem é o `netId`), `criar.js` (`criarCerebro`). No navegador, os corpos: `Enemy` (enemies.js), `Animal` (animais.js), `Dragao` (js/dragao.js); `criarCriatura`/`criarChefe` (enemies.js). Base `nucleo-do-jogo`.
- `js/geometria.js` — as contas de ângulo e distância sem three (o combat.js reexporta).
- `testes/mundo.test.mjs` — os testes da área: REGRAS (passo, parede, golpe), O VIGOR E O RITMO, o MAPA LÓGICO (as tabelas cobrem o PROPS e os bichos), o THREE do npm = o do vendor, e o CÉREBRO das criaturas (esqueletos, Carrasco, bichos, dragão).

## Como validar (por tamanho da mudança)

- **Pontual** (uma regra, um traço, uma ficha): `node --check` + `npm test`, e um caso no teste do Node que prove a regra (o honesto passa, o trapaceiro não).
- **Uma regra nova no servidor**: SIMULE os dois lados antes de dizer pronto — o HONESTO (andando de verdade pelo mapa, com colisão e atraso de rede de vários segundos) tem de dar ZERO cortes; o TRAPACEIRO tem de ser barrado (ou não ganhar nada). Script no scratchpad, nada no repositório.
- **Um sistema migrado** (o mapa, uma criatura): ANTES de mexer, tire a FOTO do comportamento de hoje no jogo e compare depois. As fotos já usadas:
  - o despejo das colisões (as caixas, os círculos, as portas, os expositores, as alturas, os caminhos);
  - a LUTA ROTEIRIZADA (4 esqueletos, `Math.random` com semente, efeitos e sons desligados para não gastarem o sorteio, passo fixo de 1/30 s, o alvo num ponto com linha de visão, os golpes no jogador e os projéteis anotados).

  O jeito: `node ferramentas/agente-desempenho/kit/perfil-cpu.mjs <url> --headless --segundos 1 --preparar @espera.js --avaliar @despejo.js`, com o JSON depois da linha de `=`. E compare o mesmo despejo montado sozinho em Node (o que o servidor vai ver).
- **Uma falha estranha num teste**: rode a versão publicada num `git worktree` separado antes de achar que foi a mudança (o teste do estado do mundo falhava por TEMPO e já falhava antes).

## As armadilhas desta área

- **Fim de linha**: vários arquivos têm CRLF (o `testes/mundo.test.mjs`, às vezes o `render.yaml`). Substituição por script falha calada se o texto não casa: normalize (`replace(/\r\n/g, '\n')`) ou use a ferramenta de edição. Em heredoc de bash, crase e `$` dentro de `node -e` quebram: escreva o script num arquivo do scratchpad.
- **O Node da máquina é o 18** (o Render roda o 20+): `node -e` com `import()` aninhado já deu falha de segmentação (use arquivo); `module.register` não existe aqui.
- **`'three'` no Node só pelo npm** (`npm install` uma vez; o Render faz `npm ci`). O `npm test` confere que é o mesmo arquivo do `vendor/`: subiu o vendor, `npm install --save-exact three@<versão>`.
- **Testes por tempo**: o simulador calado 2,5 s é trocado. Teste que espera precisa de quem simula falando (`ana.falar('mundo', …)`), ou que os dois mandem. E o `chegou()` vê mensagens ANTIGAS: espere pela CONTAGEM de mensagens, não pelo conteúdo.
- **O sorteio muda de ordem** quando um efeito visual sai da regra (o corpo sorteia as partículas depois): compare com os efeitos desligados.
- **Quem aparece é `visivel`** (o cérebro); o corpo copia para `model.root.visible` a cada quadro — escrever direto no `root.visible` é desfeito no quadro seguinte.
- **Lista que vira NÚMERO** (o cabelo `malha` achava o corpo pelo lugar na lista do jogo): tirar um item do meio muda o número dos outros. Separe "o que carrega" de "a numeração fixa".
- **A máquina do dono tem pouca memória**: o Claude Code derruba o servidor local quando falta. Não religue sozinho; para a conferência no navegador, peça.

## O que falta (o plano)

- **3.2, a última parte: os PROJÉTEIS dos inimigos** (a bola de fogo do Necromante, a onda de choque): separar a regra do desenho no `combat.js` (`Projectiles`), para o servidor ter os projéteis que são regra.
- **3.3: o laço do simulador no servidor** — um `mundo` do servidor (o relógio, o mapa lógico, os jogadores como alvos que recebem `DANO` pela rede, `invocar`/`dispensar`, `clipesDe` pela tabela), criando as criaturas por `criarCerebro` + `nascimentos.js`, e o retrato `MUNDO` saindo do estado do cérebro (hoje o `retratoDoInimigo` lê o `model` do corpo; no servidor não há).
- **3.4: o servidor vira o simulador** — com volta ao jogador-simulador se ele falhar, e o teste de CPU no nível do Render (o plano grátis).
- **A vida do jogador no servidor** (o modo deus), depois da 3.
- **A etapa 2: o save no Supabase como autoridade**, e com ela os ITENS no mesmo jeito (combinado com o dono, 24/11/2026: as quatro mudanças):
  1. FICHA + EFEITOS combináveis no lugar do `switch (def.use)`;
  2. os BÔNUS de equipamento numa lista única;
  3. a REGRA do item num módulo puro (`js/itens/`), o desenho em evento;
  4. o `stats` gerado dos efeitos.
- **A furtividade** (a área furtiva que o cliente manda): conversar com o dono — ficou para depois.
