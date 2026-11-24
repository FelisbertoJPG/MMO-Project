/**
 * O MAPA LÓGICO (24/11/2026): o mundo SEM o desenho. Tem a grade de células, o chão (andar de
 * cima, escada, relevo das colinas, água), as COLISÕES (paredes, portas, grades, névoa e os
 * círculos de peças, baús, fogueiras e expositores), a linha de visão e o caminho (`nextWaypoint`).
 *
 * É a FONTE ÚNICA. O jogo e o servidor do Mundo online montam as mesmas colisões, a partir dos
 * mesmos arquivos (`assets/mapa.json`, `assets/decor.json` e `assets/caixas-das-pecas.json`).
 * - No jogo, o `World` (world.js) é um MapaLogico que também desenha.
 * - No servidor, o MapaLogico é usado sozinho, para rodar os inimigos (etapa 3 do caminho 2).
 * - `assets/caixas-das-pecas.json` tem o tamanho de cada peça, medido nos .glb por
 *   `ferramentas/mapa-logico/medir-pecas.mjs`.
 *
 * Colisão nova (uma peça, um baú, uma fogueira…) entra AQUI, em `montarColisoes`, nunca no
 * desenho, senão o servidor não a vê.
 *
 * Este arquivo não importa o three.js, porque o servidor não tem import map. Posição é
 * `{ x, y, z }`, e quem quer `Vector3` passa `vetor` (o World passa o do three).
 *
 * O editor de cenas LÊ este arquivo (`alvos/ds.json` → `world`). Ele procura `S`, `CELL`,
 * `WALL_H` e as listas `TORCHES`, `CHESTS`, `PICKUPS`, `MESSAGES` e `SPECIAL_EDGES` por
 * expressão regular, então mantenha a forma delas (`export const NOME = [` … `\n];`).
 */
import { categoriaDaPeca } from './categorias.js';

export const S = 1.5; // escala da masmorra (salas e corredores 50% maiores)
export const CELL = 4 * S;
export const WALL_H = 4 * S;
export const WT = 0.5 * S; // meia espessura das paredes

export const SPECIAL_EDGES = [
  { a: [24, 5], b: [23, 5], type: 'celldoor' },
  ...[1, 3, 7, 9, 11].map((c) => ({ a: [24, c], b: [23, c], type: 'bars' })),
  { a: [18, 7], b: [17, 7], type: 'door' },
  { a: [16, 11], b: [16, 12], type: 'door' },
  { a: [7, 7], b: [6, 7], type: 'fog' },
  // a saída para a FLORESTA: um vão aberto na parede de terra da alcova do
  // tesouro. Só existe no mapa `floresta` (assets/mapa.json); no `original` a
  // célula (16,14) é rocha e esta aresta nunca é visitada.
  { a: [16, 13], b: [16, 14], type: 'arco' },
];

// Tochas de parede: [linha, coluna, lado da parede]
export const TORCHES = [
  [23, 3, 'n'], [23, 9, 'n'], [23, 13, 'e'],
  [19, 4, 'w'], [21, 10, 'e'],
  [15, 3, 'n'], [17, 11, 's'], [15, 9, 'n'],
  [9, 2, 'w'], [13, 12, 'e'], [9, 10, 'n'], [13, 4, 's'],
  [8, 7, 'e'],
];

// Tochas de ESTACA (02/10/2026): fincadas no chão, para onde não há parede em
// que pendurar — o acampamento e a entrada da masmorra. Quem nasce do lado de
// fora (o mundo online) não passa pelo corredor das celas, que é onde estavam
// as primeiras tochas. `off` em metros a partir do centro da célula.
// Entram em `world.torches` DEPOIS das de parede: o save guarda as tochas pela
// ordem, e uma no meio embaralharia os saves antigos.
export const TOCHAS_DE_ESTACA = [
  { cell: [16, 14], off: [-1.3, -2.3] },   // a entrada da masmorra (o arco), uma de cada lado
  { cell: [16, 14], off: [-1.3, 2.3] },
  { cell: [15, 42], off: [1.2, 0.8] },     // o portão do acampamento, junto à cerca
  { cell: [17, 42], off: [1.2, -0.8] },
  { cell: [13, 48], off: [0.5, 2.2] },     // ao lado do cabide de armas
];

// Baús: célula, parede de apoio e conteúdo
export const CHESTS = [
  { cell: [19, 10], wall: 'n', items: [['paoDuro', 3], ['ensopado', 2]] },
  // AS ARMADURAS (items.js, ficha.js): o couro no começo (acampamento e masmorra), o elmo
  // da malha mais adiante; o resto da malha cai do Guerreiro Esqueleto, as placas dos chefes
  { cell: [23, 1], wall: 'w', items: [['bone', 2], ['arm1_bracos', 1]] },
  { cell: [15, 11], wall: 'n', items: [['shieldRound', 1]] },
  { cell: [9, 12], wall: 'n', items: [['firebomb', 3], ['arm2_cabeca', 1]] },
  { cell: [13, 2], wall: 's', items: [['ringLife', 1], ['lostSoul', 1]] },
  // na parede SUL da alcova: a leste agora é a saída para a floresta (`arco`),
  // e encostado nela o baú ficava no meio da passagem
  { cell: [16, 13], wall: 's', items: [['greatsword', 1], ['ringWolf', 1]], gold: true },
  // o do ACAMPAMENTO, atrás da barraca do norte. No FIM da lista: o save
  // guarda os baús pela ordem, e um no meio embaralharia os saves antigos
  // (`buildChests` pula o que cai na rocha: o mapa `original` não tem acampamento).
  { cell: [12, 47], wall: 'n', items: [['firebomb', 2], ['lostSoul', 1], ['arm1_peito', 1], ['arm1_pernas', 1]] },
];

// Itens no chão (alguns junto a cadáveres)
export const PICKUPS = [
  { cell: [23, 2], wall: 'n', item: 'dagger', corpse: true },
  { cell: [17, 4], wall: 's', item: 'longsword', corpse: true },
  { cell: [11, 2], wall: 'w', item: 'axe', corpse: true },
  { cell: [9, 6], wall: 'n', item: 'shieldKnight', corpse: true },
  { cell: [13, 8], wall: 's', item: 'resin', qty: 2 },
  { cell: [15, 6], wall: 'n', item: 'blossom', qty: 2 },
  { cell: [21, 4], wall: 's', item: 'lostSoul', qty: 1 },
  { cell: [23, 11], wall: 'n', item: 'firebomb', qty: 2 },
  { cell: [8, 7], wall: 'w', item: 'ringGreen', qty: 1 },
];

export const MESSAGES = [
  { cell: [23, 5], text: 'Tochas iluminam o caminho — pegue uma na parede (E)', off: [0, -0.8] },
  { cell: [21, 7], text: 'Descanse. Mas os mortos se levantarão de novo.', off: [0, 1.2] },
  { cell: [16, 7], text: 'Ossos dormem no chão... até você chegar perto', off: [0, 0] },
  { cell: [13, 7], text: 'Fogo é a fraqueza dos ossos', off: [0, 1] },
  { cell: [7, 7], text: 'O Carrasco aguarda. Role através do machado.', off: [0, 1] },
  // o acampamento e a estrada (só existem no mapa `floresta` estendido — `buildMessages` pula as que caem na rocha)
  { cell: [16, 52], text: 'A leste, depois das árvores, o vento sopra nas WindHills.', off: [-1.5, 1.4] },
  { cell: [16, 43], text: 'A masmorra fica a oeste, depois da floresta. Não vá de mãos vazias.', off: [0, 1.6] },
  { cell: [16, 41], text: 'Há ossos sob a relva. Pise leve.', off: [1.5, -1.2] },
];

export const DIRS = { n: [-1, 0], s: [1, 0], w: [0, -1], e: [0, 1] };
export const YAW_INTO = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }; // rotação para +Z apontar para dentro da célula

/** O centro da arena do Carrasco (world.js: `ARENA_CENTER`). */
export const ARENA = { x: 7 * CELL, z: 3.5 * CELL };

/**
 * As FOGUEIRAS, com o lugar PADRÃO em metros; a tag do mesmo nome no mapa.json (`marcos`) vence
 * (`lugaresDasFogueiras`). `acordar` = onde se renasce, em metros a partir do fogo, e `rumo` =
 * para onde se acorda olhando. A da masmorra é a primeira: é a de quem tem um save de antes de
 * haver duas. Uma fogueira cuja célula é rocha no mapa ativo não existe.
 */
export const FOGUEIRAS_DO_MAPA = [
  { id: 'masmorra', nome: 'Sala da Fogueira', x: 7 * CELL, z: 20 * CELL, acordar: [0, 2.6], rumo: Math.PI },
  // o ACAMPAMENTO: a clareira a leste da floresta, onde nasce quem entra no Mundo online
  { id: 'acampamento', nome: 'Acampamento', x: 47.5 * CELL, z: 16 * CELL, acordar: [3.2, 0], rumo: -Math.PI / 2 },
  // a das COLINAS DO VENTO: o lugar vem da tag `colinas` do mapa; sem ela, fica na rocha
  { id: 'colinas', nome: 'WindHills', x: -99, z: -99, acordar: [3.2, 0], rumo: Math.PI / 2 },
];

/** O lugar (m) de cada fogueira: o padrão, ou a tag de lugar do mapa (`marcos[id]` = [linha, coluna]). */
export function lugaresDasFogueiras(marcos = {}) {
  const cel = (v) => (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? v : null);
  return FOGUEIRAS_DO_MAPA.map((f) => {
    const c = cel(marcos?.[f.id]);
    return { id: f.id, x: c ? c[1] * CELL : f.x, z: c ? c[0] * CELL : f.z };
  });
}

/**
 * Os EXPOSITORES (expositor.js desenha): o suporte de armas e o cavalete de armadura, perto da
 * fogueira `perto`, procurados a partir do `rumo` (`lugarLivre`). Expositor novo = uma linha aqui.
 */
export const EXPOSITORES = [
  // o acampamento: a espada longa e o machado; o couro do Batedor
  { tipo: 'armas', perto: 'acampamento', rumo: 0.6, itens: ['longsword', 'axe', 'shieldRound'] },
  { tipo: 'armadura', perto: 'acampamento', rumo: -0.7, conjunto: 1, itens: ['arm1_peito', 'arm1_bracos', 'arm1_pernas'] },
  // a masmorra: o espadão e o escudo de cavaleiro; a malha do Sentinela
  { tipo: 'armas', perto: 'masmorra', rumo: 2.2, itens: ['greatsword', 'shieldKnight'] },
  { tipo: 'armadura', perto: 'masmorra', rumo: -2.2, conjunto: 2, itens: ['arm2_cabeca', 'arm2_peito', 'arm2_bracos', 'arm2_pernas'] },
];
/** O raio do círculo de colisão de cada expositor. */
export const RAIO_DO_EXPOSITOR = { armas: 0.75, armadura: 0.45 };

// PEDRA e ENTULHO sem raio declarado no decor.json ganham o raio do próprio tamanho
const RAIO_AUTOMATICO = /(^|-)Rock_|^rubble_|^barrier_column/;

/**
 * O `assets/mapa.json` lido: a variante ativa (`linhas`) e o que é dela (`relevo`, `agua`,
 * `marcos`). Lança erro com o motivo se o arquivo não serve.
 */
export function lerArquivoDoMapa(d) {
  const mapas = d?.mapas;
  if (!mapas || typeof mapas !== 'object') throw new Error('sem o objeto `mapas`');
  const nomes = Object.keys(mapas);
  if (!nomes.length) throw new Error('nenhuma variante');
  const nome = typeof d.ativo === 'string' && mapas[d.ativo] ? d.ativo : nomes[0];
  const linhas = mapas[nome];
  const m = d.marcos?.[nome];
  const lido = {
    nome, linhas, trocouAtivo: nome !== d.ativo,
    relevo: d.relevo?.[nome] ?? null,
    agua: Array.isArray(d.agua?.[nome]) ? d.agua[nome] : [],
    marcos: m && typeof m === 'object' && !Array.isArray(m) ? m : {},
  };
  if (!Array.isArray(linhas) || !linhas.length) throw new Error(`a variante "${nome}" está vazia`);
  // Linha de tamanho diferente é o erro mais fácil de cometer editando à mão,
  // e o jogo o absorveria em silêncio (`ch()` devolve rocha fora da faixa):
  // apareceria como uma parede que ninguém desenhou.
  if (linhas.some((l) => typeof l !== 'string' || l.length !== linhas[0].length)) {
    throw new Error(`a variante "${nome}" tem linhas de tamanhos diferentes`);
  }
  return lido;
}

/**
 * As PEÇAS que o mapa lógico conhece: `existe(nome)` (está no `PROPS` do assets.js: peça fora
 * dele não é posta) e `caixa(nome)` (a caixa dela em escala 1, sem giro: [minX, minY, minZ,
 * maxX, maxY, maxZ], de `assets/caixas-das-pecas.json`; null se não foi medida).
 */
export function pecasDe(nomes, caixas) {
  const lista = new Set(nomes), tabela = caixas?.pecas ?? {}, faltou = new Set();
  return {
    existe: (n) => lista.has(n),
    caixa(n) {
      const c = tabela[n];
      if (Array.isArray(c) && c.length === 6) return c;
      if (!faltou.has(n)) { faltou.add(n); console.warn(`[mapa] a peça "${n}" não está em assets/caixas-das-pecas.json — rode node ferramentas/mapa-logico/medir-pecas.mjs`); }
      return null;
    },
  };
}

export class MapaLogico {
  /**
   * `mapa` = as linhas da variante ativa; `relevo`, `agua` e `marcos` = os dela (`lerArquivoDoMapa`);
   * `decor` = os itens do decor.json; `pecas` = `pecasDe(PROPS, caixas)`.
   */
  constructor({ mapa, relevo = null, agua = [], decor = [], marcos = {}, pecas }, { vetor = (x, y, z) => ({ x, y, z }) } = {}) {
    this.vetor = vetor;
    this.mapa = mapa;
    this.rows = mapa.length;
    this.cols = mapa[0].length;
    this.boxes = [];
    this.circles = [];
    this.edgeMap = new Map();
    this.gateOpen = false;
    this.montarRelevo(relevo);   // a altura do chão das colinas, antes da decoração
    // os ESPELHOS D'ÁGUA (mapa.json → `agua`; quem os desenha é o js/agua.js)
    this.agua = (agua ?? []).filter((a) => Number.isFinite(a?.nivel) && Array.isArray(a.caixa) && a.caixa.length === 4 && a.caixa.every(Number.isFinite));
    this.montarColisoes(decor, marcos, pecas);
  }

  // ---------- Grid ----------
  ch(r, c) { return r < 0 || r >= this.rows || c < 0 || c >= this.cols ? '#' : this.mapa[r][c]; }
  isFloor(r, c) { return this.ch(r, c) !== '#'; }
  center(r, c) { return this.vetor(c * CELL, 0, r * CELL); }
  cellOf(pos) { return [Math.round(pos.z / CELL), Math.round(pos.x / CELL)]; }
  isArenaCell(r, c) { return this.ch(r, c) === 'X'; }
  // ar livre: a floresta ('f'), o andar de cima ('a') e a escada ('e') que o liga
  isOpenAir(r, c) { return 'fae'.includes(this.ch(r, c)); }
  /**
   * A célula é DE DENTRO da masmorra (para o LOD esconder o outro lado, lod.js)? O chão de
   * lá, ou a rocha encostada nele (onde ficam as paredes) — e, nos dois casos, sem ar livre
   * a até 2 células: a soleira e a borda continuam visíveis de fora. Rocha funda e a borda
   * do mapa (árvores e pedras plantadas no `#` em volta dos campos) são de FORA.
   */
  ehDeDentro(r, c) {
    const perto = (raio, teste) => { for (let i = -raio; i <= raio; i++) for (let j = -raio; j <= raio; j++) if (teste(r + i, c + j)) return true; return false; };
    if (perto(2, (a, b) => this.isOpenAir(a, b))) return false;
    const chao = (a, b) => this.ch(a, b) !== '#' && !this.isOpenAir(a, b);
    return chao(r, c) || perto(1, chao);
  }
  edgeKey(a, b) { return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? `${a}|${b}` : `${b}|${a}`; }

  /** O ponto encostado na parede `side` da célula, `inset` m para dentro (tochas, baús, itens). */
  wallAnchor(cell, side, inset) {
    const [dr, dc] = DIRS[side];
    const p = this.center(cell[0], cell[1]);
    p.x += dc * (CELL / 2 - WT - inset); p.z += dr * (CELL / 2 - WT - inset);
    return p;
  }

  /** O retângulo do mapa, em metros: fora dele não existe lugar (`protocolo.limparInstantaneo`). */
  limites() {
    return { minX: -CELL, maxX: this.cols * CELL, minZ: -CELL, maxZ: this.rows * CELL };
  }

  // ---------- Altura: o ANDAR DE CIMA ----------
  //
  // A colisão do jogo é uma PLANTA (caixas e círculos em x,z) — por isso o andar
  // de cima ('a') fica sobre ROCHA, nunca sobre um cômodo: duas salas na mesma
  // planta, uma em cima da outra, teriam as paredes de uma barrando a outra. Ele
  // é chão a `WALL_H`, e a ESCADA ('e') é uma rampa da borda baixa até a alta.
  //
  // Borda entre níveis diferentes BARRA (`conectaNivel`): sem isso, andar da
  // floresta para uma célula do andar de cima seria "subir" 6 m num passo. A
  // escada só liga pelas duas pontas — o lado dela que dá para o andar ('a') e
  // o oposto, que dá para o chão.

  /** 0 (chão), 1 (andar de cima) ou 'e' (escada). Rocha fica 0 — ninguém pisa. */
  nivel(r, c) { const t = this.ch(r, c); return t === 'a' ? 1 : t === 'e' ? 'e' : 0; }

  /** Para onde a escada SOBE: `[dl, dc]` do vizinho do andar de cima, ou `null`. */
  subidaDaEscada(r, c) {
    for (const d of Object.values(DIRS)) if (this.nivel(r + d[0], c + d[1]) === 1) return d;
    return null;
  }

  /** Dá para passar de uma célula para a vizinha sem pular um andar? */
  conectaNivel(a, b) {
    const na = this.nivel(...a), nb = this.nivel(...b);
    if (na !== 'e' && nb !== 'e') return na === nb;
    if (na === 'e' && nb === 'e') return true;
    const [esc, fora] = na === 'e' ? [a, b] : [b, a];
    const d = this.subidaDaEscada(...esc);
    if (!d) return this.nivel(...fora) === 0;
    if (fora[0] === esc[0] + d[0] && fora[1] === esc[1] + d[1]) return this.nivel(...fora) === 1;
    if (fora[0] === esc[0] - d[0] && fora[1] === esc[1] - d[1]) return this.nivel(...fora) === 0;
    return false;                                           // o lado da escada é parede
  }

  /** A altura do CHÃO onde está `pos`: 0, `WALL_H` no andar de cima, rampa na escada. */
  alturaChao(pos) {
    const [r, c] = this.cellOf(pos);
    const t = this.ch(r, c);
    if (t === 'f') return this.relevoEm(pos.x, pos.z);
    if (t === 'a') return WALL_H;
    if (t !== 'e') return 0;
    const d = this.subidaDaEscada(r, c);
    if (!d) return 0;
    // o quanto se avançou na direção da subida, de 0 (borda baixa) a 1 (alta)
    const k = ((pos.x - c * CELL) * d[1] + (pos.z - r * CELL) * d[0]) / CELL + 0.5;
    return WALL_H * Math.min(1, Math.max(0, k));
  }

  // ---------- O RELEVO: as COLINAS (04/10/2026) ----------
  //
  // A altura do chão de ar livre ('f') numa ÁREA do mapa vem de `relevo` no mapa.json
  // (`Assets.relevo`): a soma de colinas suaves (cosseno; `plano` = topo chato), indo a
  // zero perto da rocha e da borda da área (`borda`, em células) — então a colina nunca
  // encosta num paredão nem num chão plano de fora com degrau. A altura é calculada UMA
  // vez numa grade de CELL/4 (a mesma da grama: o chão que se vê é o chão que se pisa)
  // e lida com interpolação bilinear. A colisão é uma planta (x, z): o relevo não barra,
  // só ergue. Fora da área (e sem `relevo`), tudo plano como sempre.
  montarRelevo(rel) {
    this.relevo = null;
    // OS PONTOS (o formato do editor de cenas: `passo` m e `pontos` {"i,k": altura}, em
    // coordenadas do mundo; o que o decorador esculpe) vencem as colinas: valem no MAPA
    // INTEIRO (em células `f`), sem rampa automática — o chão é o que foi esculpido.
    const pontos = rel?.pontos && typeof rel.pontos === 'object' ? rel.pontos : null;
    if (pontos) {
      const pp = rel.passo > 0 ? rel.passo : 2, N = 4, passo = CELL / N;
      const x0 = -CELL / 2, z0 = -CELL / 2, nx = this.cols * N + 1, nz = this.rows * N + 1, h = new Float32Array(nx * nz);
      const no = (i, k) => { const v = pontos[`${i},${k}`]; return Number.isFinite(v) ? v : 0; };
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const fx = (x0 + i * passo) / pp, fz = (z0 + k * passo) / pp, a = Math.floor(fx), b = Math.floor(fz), tx = fx - a, tz = fz - b;
        h[k * nx + i] = no(a, b) * (1 - tx) * (1 - tz) + no(a + 1, b) * tx * (1 - tz) + no(a, b + 1) * (1 - tx) * tz + no(a + 1, b + 1) * tx * tz;
      }
      this.relevo = { x0, z0, nx, nz, passo, h };
      this.areaRelevo = Array.isArray(rel.area) && rel.area.length === 2 ? rel.area : null;   // os campos (o clima)
      return;
    }
    const area = rel?.area, colinas = Array.isArray(rel?.colinas) ? rel.colinas : [];
    if (!Array.isArray(area) || area.length !== 2 || !colinas.length) return;
    const [[r0, c0], [r1, c1]] = area, N = 4, passo = CELL / N, borda = (rel.borda ?? 2) * CELL;
    const x0 = c0 * CELL - CELL / 2, z0 = r0 * CELL - CELL / 2;
    const nx = (c1 - c0 + 1) * N + 1, nz = (r1 - r0 + 1) * N + 1;
    const h = new Float32Array(nx * nz);
    const dentro = (r, c) => r >= r0 && r <= r1 && c >= c0 && c <= c1 && this.ch(r, c) === 'f';
    const viz = Math.ceil(rel.borda ?? 2) + 1;
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * passo, z = z0 + k * passo;
        // a distância (m) até a célula mais perto que NÃO é relevo (rocha, fora da área)
        const cr = Math.round(z / CELL), cc = Math.round(x / CELL);
        let dist = borda;
        for (let dr = -viz; dr <= viz; dr++) for (let dc = -viz; dc <= viz; dc++) {
          const rr = cr + dr, ccc = cc + dc;
          if (dentro(rr, ccc)) continue;
          const dx = Math.max(Math.abs(x - ccc * CELL) - CELL / 2, 0), dz = Math.max(Math.abs(z - rr * CELL) - CELL / 2, 0);
          dist = Math.min(dist, Math.hypot(dx, dz));
        }
        if (dist <= 0) continue;
        let alt = 0;
        for (const col of colinas) {
          const d = Math.hypot(z / CELL - col.centro[0], x / CELL - col.centro[1]) / col.raio;
          if (d >= 1) continue;
          const p = col.plano ?? 0, t = d <= p ? 0 : (d - p) / (1 - p);
          alt += col.altura * 0.5 * (1 + Math.cos(Math.PI * t));
        }
        const s = Math.min(1, dist / borda);
        h[k * nx + i] = alt * s * s * (3 - 2 * s);
      }
    }
    this.relevo = { x0, z0, nx, nz, passo, h };
    this.areaRelevo = area;
  }

  /**
   * Quanta ÁGUA há sobre o chão em (x, z), em metros: positivo = dentro d'água (a profundidade),
   * negativo = seco (quanto o chão está acima do nível). Fora de todo espelho d'água, -Infinity.
   */
  fundoDaAgua(x, z) {
    for (const a of this.agua) if (x >= a.caixa[0] && x <= a.caixa[2] && z >= a.caixa[1] && z <= a.caixa[3]) return a.nivel - this.relevoEm(x, z);
    return -Infinity;
  }

  /** A altura do RELEVO em (x, z): 0 fora da área das colinas. */
  relevoEm(x, z) {
    const R = this.relevo;
    if (!R) return 0;
    const fi = (x - R.x0) / R.passo, fk = (z - R.z0) / R.passo;
    if (fi < 0 || fk < 0 || fi >= R.nx - 1 || fk >= R.nz - 1) return 0;
    const i = Math.floor(fi), k = Math.floor(fk), u = fi - i, v = fk - k, n = R.nx, h = R.h;
    const a = h[k * n + i], b = h[k * n + i + 1], c = h[(k + 1) * n + i], d = h[(k + 1) * n + i + 1];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }

  /** Quanto `pos` está ACIMA do chão dele (o que "no ar" quer dizer). */
  acimaDoChao(pos) { return pos.y - this.alturaChao(pos); }

  // ---------- As COLISÕES ----------
  //
  // A colisão vem do MAPA e dos DADOS, nunca do desenho: tirar uma parede desenhada não abre
  // passagem, e uma peça posta à mão só barra com `colisao` no decor.json (ou o raio automático
  // das pedras). A ORDEM das caixas e dos círculos é a de sempre (a estrutura, as tochas de
  // estaca, os baús, a decoração, as fogueiras, a arena e os expositores): quem resolve a
  // colisão anda por elas nessa ordem.
  montarColisoes(decor, marcos, pecas) {
    // 1. A ESTRUTURA: as paredes do mapa e as passagens especiais, célula a célula
    this.passagens = [];        // { e, ex, ez, side, porta }, na ordem em que aparecem (o desenho as segue)
    this.portas = new Map();    // aresta → a caixa do vão da porta (aberta = `disabled`)
    for (const e of SPECIAL_EDGES) this.edgeMap.set(this.edgeKey(e.a, e.b), e);
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const t = this.ch(row, col);
        if (t === '#') continue;
        const x = col * CELL, z = row * CELL, livre = t === 'f' || t === 'a' || t === 'e';
        for (const [side, [dr, dc]] of Object.entries(DIRS)) {
          const nr = row + dr, nc = col + dc;
          const ex = x + dc * CELL / 2, ez = z + dr * CELL / 2;
          // a borda com a rocha BARRA (no ar livre também: quem a mostra é a decoração)
          if (!this.isFloor(nr, nc)) this.addEdgeBox(ex, ez, side, 'wall');
          // DESNÍVEL barra (ver `conectaNivel`). Sem conferir a ordem das células: o
          // vizinho de chão comum não sabe de andar nenhum e não poria a caixa
          else if (livre && !this.conectaNivel([row, col], [nr, nc])) this.addEdgeBox(ex, ez, side, 'wall');
          else if (nr > row || nc > col) {
            const special = this.edgeMap.get(this.edgeKey([row, col], [nr, nc]));
            if (special) this.colisaoDaPassagem(special, ex, ez, side);
          }
        }
      }
    }

    // 2. as tochas de ESTACA (as de parede ficam na parede, que já barra)
    for (const def of TOCHAS_DE_ESTACA) {
      if (!this.isFloor(...def.cell)) continue;   // mapa sem aquela área
      const p = this.center(...def.cell);
      this.circles.push({ x: p.x + def.off[0], z: p.z + def.off[1], r: 0.2 });
    }

    // 3. os BAÚS (baú em célula de rocha não existe)
    for (const def of CHESTS) {
      if (!this.isFloor(...def.cell)) continue;
      const p = this.wallAnchor(def.cell, def.wall, 0.8);
      this.circles.push({ x: p.x, z: p.z, r: 0.85 });
    }

    // 4. a DECORAÇÃO (decor.json): o raio é o do dado. PEDRA e ENTULHO sem raio declarado
    // ganham o raio do próprio tamanho (o desabamento tem de barrar) — menos os que estão em
    // cima da borda com a rocha (a menos de 1,2 m de uma parede), que já barra, e onde um
    // círculo só comeria o chão de passagem. `colisao: 0` = não barra.
    this.circulosDoDecor = [];   // a posição no decor.json → o círculo (o quebrável zera o raio ao quebrar)
    this.decorPosto = [];        // as peças que existem: { i, d, x, z } (o `lugarLivre` olha as caixas delas)
    decor.forEach((d, i) => {
      if (!pecas.existe(d.prop)) return;   // (o World avisa no console)
      const p = this.center(d.cel[0], d.cel[1]);
      const off = d.off ?? [0, 0];
      const px = p.x + off[0] * S, pz = p.z + off[1] * S;
      this.decorPosto.push({ i, d, x: px, z: pz });
      let raio = d.colisao;
      if (raio === undefined && RAIO_AUTOMATICO.test(d.prop) && !this.pertoDaRocha(px, pz, 1.2)) raio = this.raioDaPeca(pecas, d.prop) * (d.escala ?? 1);
      if (raio) { const c = { x: px, z: pz, r: raio }; this.circles.push(c); this.circulosDoDecor[i] = c; }
    });

    // 5. as FOGUEIRAS (a de célula de rocha não existe)
    this.fogueirasDoMapa = lugaresDasFogueiras(marcos).filter((f) => this.isFloor(...this.cellOf(f)));
    for (const f of this.fogueirasDoMapa) this.circles.push({ x: f.x, z: f.z, r: 0.85 });

    // 6. a ARENA do Carrasco: os quatro braseiros, os quatro pilares e o cepo
    const a = ARENA;
    for (const [x, z] of [[a.x - 12 * S, a.z - 6 * S], [a.x + 12 * S, a.z - 6 * S], [a.x - 12 * S, a.z + 6 * S], [a.x + 12 * S, a.z + 6 * S]]) this.circles.push({ x, z, r: 0.75 });
    for (const [r, c] of [[2, 4], [2, 10], [5, 4], [5, 10]]) { const p = this.center(r, c); this.circles.push({ x: p.x, z: p.z, r: 0.85 * S }); }
    const cepo = this.center(2, 7);
    this.circles.push({ x: cepo.x + 0 * S, z: cepo.z + -0.8 * S, r: 1.1 });

    // 7. os EXPOSITORES, no primeiro lugar livre perto da fogueira deles
    this.expositoresDoMapa = [];
    const pontos = this.pontosDeInteresse();
    EXPOSITORES.forEach((def, n) => {
      const f = this.fogueirasDoMapa.find((x) => x.id === def.perto);
      if (!f) return;
      const lugar = this.lugarLivre(f, def.rumo, pecas, pontos);
      if (!lugar) { console.warn(`[expositor] sem lugar livre perto da fogueira ${def.perto}`); return; }
      const circulo = { x: lugar.x, z: lugar.z, r: RAIO_DO_EXPOSITOR[def.tipo] };
      this.circles.push(circulo);
      // (os itens dele ficam a até ~0,8 m do centro: o próximo expositor não os cobre)
      pontos.push({ x: lugar.x, z: lugar.z, folga: 0.8 });
      this.expositoresDoMapa.push({ n, def, x: lugar.x, z: lugar.z, circulo });
    });
  }

  // Caixa de colisão de uma parede (1 m de espessura centrada na borda da célula)
  addEdgeBox(ex, ez, side, kind, extra = {}) {
    const alongX = side === 'n' || side === 's';
    const b = alongX
      ? { minX: ex - CELL / 2, maxX: ex + CELL / 2, minZ: ez - WT, maxZ: ez + WT }
      : { minX: ex - WT, maxX: ex + WT, minZ: ez - CELL / 2, maxZ: ez + CELL / 2 };
    Object.assign(b, { kind, ...extra });
    this.boxes.push(b);
    return b;
  }

  /** As caixas de uma passagem especial: a grade, a porta (batentes e vão), o arco, a névoa. */
  colisaoDaPassagem(e, ex, ez, side) {
    const p = { e, ex, ez, side, porta: null };
    this.passagens.push(p);
    if (e.type === 'bars') {
      this.addEdgeBox(ex, ez, side, 'bars');
    } else if (e.type === 'door' || e.type === 'celldoor' || e.type === 'arco') {
      // Batentes laterais sempre bloqueiam; o vão central bloqueia enquanto fechada
      const alongX = side === 'n' || side === 's';
      const half = CELL / 2, gh = S; // vão da porta: 2 m no modelo original
      const jamb = (sg) => {
        const a = sg < 0 ? -half - 1 : gh, b = sg < 0 ? -gh : half + 1;
        this.boxes.push(alongX
          ? { minX: ex + a, maxX: ex + b, minZ: ez - WT, maxZ: ez + WT, kind: 'wall' }
          : { minX: ex - WT, maxX: ex + WT, minZ: ez + a, maxZ: ez + b, kind: 'wall' });
      };
      jamb(-1); jamb(1);
      if (e.type === 'arco') return;   // ARCO: o mesmo vão, sempre aberto
      p.porta = alongX
        ? { minX: ex - gh, maxX: ex + gh, minZ: ez - 0.35 * S, maxZ: ez + 0.35 * S, kind: 'door' }
        : { minX: ex - 0.35 * S, maxX: ex + 0.35 * S, minZ: ez - gh, maxZ: ez + gh, kind: 'door' };
      this.boxes.push(p.porta);
      this.portas.set(this.edgeKey(e.a, e.b), p.porta);
    } else if (e.type === 'fog') {
      this.fogEdge = { ex, ez, side };
      this.fogBox = this.addEdgeBox(ex, ez, side, 'fog');
      this.fogBox.minX = ex - CELL / 2; this.fogBox.maxX = ex + CELL / 2;
    }
  }

  /** `(x, z)` está a menos de `dist` m de uma célula de rocha (uma parede do mapa)? */
  pertoDaRocha(x, z, dist) {
    const r0 = Math.round(z / CELL), c0 = Math.round(x / CELL);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (this.isFloor(r0 + dr, c0 + dc)) continue;
      const dx = Math.max(Math.abs(x - (c0 + dc) * CELL) - CELL / 2, 0), dz = Math.max(Math.abs(z - (r0 + dr) * CELL) - CELL / 2, 0);
      if (Math.hypot(dx, dz) < dist) return true;
    }
    return false;
  }

  /** Meia largura (m) da planta de uma peça em escala 1 — 80% do maior lado (a pedra é redonda). */
  raioDaPeca(pecas, nome) {
    const c = pecas.caixa(nome);
    return c ? Math.max(c[3] - c[0], c[5] - c[2]) * 0.4 : 0;
  }

  /**
   * A caixa (em x/z) de uma peça do decor.json no mundo: a caixa medida, girada (`giro`),
   * virada (`flip`, o teto) e na escala da peça.
   */
  caixaNoMundo(pecas, d, x, z) {
    const c = pecas.caixa(d.prop);
    if (!c) return null;
    const s = d.escala ?? 1, g = d.giro ?? 0, cos = Math.cos(g), sin = Math.sin(g);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const cx of [c[0], c[3]]) for (const cz of [c[2], c[5]]) {
      const lz = d.flip ? -cz : cz;
      const wx = (cos * cx + sin * lz) * s, wz = (-sin * cx + cos * lz) * s;
      minX = Math.min(minX, wx); maxX = Math.max(maxX, wx); minZ = Math.min(minZ, wz); maxZ = Math.max(maxZ, wz);
    }
    return { minX: x + minX, maxX: x + maxX, minZ: z + minZ, maxZ: z + maxZ };
  }

  /**
   * Onde há algo para PEGAR ou USAR (portas, tochas, baús, itens, mensagens, fogueiras, a névoa):
   * o expositor não fica em cima de nenhum. `folga` = o quanto o lugar ocupa em volta do ponto.
   */
  pontosDeInteresse() {
    const pts = [];
    const ponto = (p, folga = 0) => pts.push({ x: p.x, z: p.z, folga });
    for (const p of this.passagens) if (p.porta) ponto({ x: p.ex, z: p.ez });
    for (const [row, col, side] of TORCHES) ponto(this.wallAnchor([row, col], side, 0));
    for (const def of TOCHAS_DE_ESTACA) if (this.isFloor(...def.cell)) { const p = this.center(...def.cell); ponto({ x: p.x + def.off[0], z: p.z + def.off[1] }); }
    for (const def of CHESTS) if (this.isFloor(...def.cell)) ponto(this.wallAnchor(def.cell, def.wall, 0.8));
    for (const def of PICKUPS) {
      const p = this.wallAnchor(def.cell, def.wall, def.corpse ? 0.6 : 0.9), y = YAW_INTO[def.wall];
      ponto(def.corpse ? { x: p.x + Math.sin(y) * 0.9, z: p.z + Math.cos(y) * 0.9 } : p);
    }
    for (const d of MESSAGES) if (this.isFloor(...d.cell)) { const p = this.center(d.cell[0], d.cell[1]); ponto({ x: p.x + d.off[0], z: p.z + d.off[1] }); }
    for (const f of this.fogueirasDoMapa) ponto(f);
    if (this.fogEdge) ponto({ x: this.fogEdge.ex, z: this.fogEdge.ez + 1.2 });
    return pts;
  }

  /**
   * O LUGAR do expositor perto da fogueira `centro`: o primeiro ponto do anel, a partir do
   * `rumo`, sem parede, água, colisão, coisa de usar nem peça da decoração (objeto, construção
   * ou pedra) por perto. Mexer na decoração não o enterra num barril.
   */
  lugarLivre(centro, rumo, pecas, pontos) {
    const caixas = [];
    for (const { d, x, z } of this.decorPosto) {
      if (!['objeto', 'construcao', 'pedra'].includes(categoriaDaPeca(d.prop))) continue;
      if (Math.hypot(x - centro.x, z - centro.z) > 12) continue;
      const c = this.caixaNoMundo(pecas, d, x, z);
      if (c) caixas.push(c);
    }
    for (const raio of [4.6, 5.4, 3.9, 6.2]) {
      for (let k = 0; k < 24; k++) {
        const a = rumo + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12);
        const x = centro.x + Math.sin(a) * raio, z = centro.z + Math.cos(a) * raio;
        if (this.solidAt(x, z, 1.1)) continue;
        if (this.fundoDaAgua(x, z) > -0.5) continue;
        if (this.circles.some((c) => c.r > 0 && Math.hypot(c.x - x, c.z - z) < c.r + 1.2)) continue;
        if (pontos.some((p) => Math.hypot(p.x - x, p.z - z) < 1.6 + p.folga)) continue;
        // nem em cima de uma peça da decoração (um colchonete não tem colisão, mas está lá)
        if (caixas.some((c) => x > c.minX - 0.7 && x < c.maxX + 0.7 && z > c.minZ - 0.7 && z < c.maxZ + 0.7)) continue;
        return { x, z };
      }
    }
    return null;
  }

  /**
   * As caixas e os círculos de colisão POR CÉLULA (11/10/2026): `resolve` percorria todas as
   * paredes e todos os círculos do mapa, duas vezes, para CADA personagem, todo quadro (5% da CPU
   * no perfil). A grade guarda, por célula, o que pode tocar quem está nela (com 3 m de folga);
   * é refeita se alguém acrescentar caixa ou círculo. Os objetos são os MESMOS (porta que se
   * abre — `disabled` —, quebrável que some — `r = 0` — continuam valendo), na mesma ordem.
   */
  colisoresPerto(pos) {
    let G = this._gradeDeColisao;
    if (!G || G.nb !== this.boxes.length || G.nc !== this.circles.length) {
      G = this._gradeDeColisao = { nb: this.boxes.length, nc: this.circles.length, celulas: new Map(), vazio: { boxes: [], circles: [] } };
      const F = 3, em = (x0, z0, x1, z1, lista, o) => {
        for (let r = Math.round((z0 - F) / CELL); r <= Math.round((z1 + F) / CELL); r++) for (let c = Math.round((x0 - F) / CELL); c <= Math.round((x1 + F) / CELL); c++) {
          const k = r * 4096 + c; let cel = G.celulas.get(k);
          if (!cel) G.celulas.set(k, (cel = { boxes: [], circles: [] }));
          cel[lista].push(o);
        }
      };
      for (const b of this.boxes) em(b.minX, b.minZ, b.maxX, b.maxZ, 'boxes', b);
      for (const c of this.circles) { const r = Math.max(c.r, 3); em(c.x - r, c.z - r, c.x + r, c.z + r, 'circles', c); }
    }
    return G.celulas.get(Math.round(pos.z / CELL) * 4096 + Math.round(pos.x / CELL)) ?? G.vazio;
  }

  resolve(pos, radius) {
    // (quem é maior que a folga da grade — o dragão — olha o mapa inteiro, como antes)
    const perto = radius <= 2.5 ? this.colisoresPerto(pos) : this;
    for (let iter = 0; iter < 2; iter++) {
      for (const b of perto.boxes) {
        if (b.disabled) continue;
        if (pos.x + radius < b.minX || pos.x - radius > b.maxX || pos.z + radius < b.minZ || pos.z - radius > b.maxZ) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1e-8) {
          if (d2 >= radius * radius) continue;
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius; pos.z = cz + (dz / d) * radius;
        } else {
          // Centro dentro da caixa: sai pelo lado mais próximo
          const pen = [[pos.x - b.minX, -1, 0], [b.maxX - pos.x, 1, 0], [pos.z - b.minZ, 0, -1], [b.maxZ - pos.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
          if (pen[1]) pos.x = pen[1] < 0 ? b.minX - radius : b.maxX + radius;
          else pos.z = pen[2] < 0 ? b.minZ - radius : b.maxZ + radius;
        }
      }
      for (const c of perto.circles) {
        if (!c.r) continue;   // (o quebrável quebrado fica com raio 0)
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const min = c.r + radius, d2 = dx * dx + dz * dz;
        if (d2 < min * min) { const d = Math.sqrt(d2) || 1e-4; pos.x = c.x + (dx / d) * min; pos.z = c.z + (dz / d) * min; }
      }
    }
  }

  // Desvia de pilares/barris no caminho (steering simples)
  avoid(pos, dir, radius) {
    for (const c of this.circles) {
      const dx = c.x - pos.x, dz = c.z - pos.z;
      const ahead = dx * dir.x + dz * dir.z;
      if (ahead < 0 || ahead > 2.5) continue;
      const side = dx * dir.z - dz * dir.x; // >0: obstáculo à esquerda
      const clear = c.r + radius + 0.2;
      if (Math.abs(side) > clear) continue;
      const k = 1 - Math.abs(side) / clear;
      // Obstáculo à esquerda → desvia para a direita (e vice-versa)
      const s = side >= 0 ? 1 : -1;
      const nx = dir.x - dir.z * s * k * 1.5, nz = dir.z + dir.x * s * k * 1.5;
      dir.set(nx, 0, nz).normalize();
    }
    return dir;
  }

  solidAt(x, z, pad = 0) {
    for (const b of this.boxes) {
      if (b.disabled) continue;
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
    }
    return false;
  }

  // Fração [0..1] do segmento até bater numa parede
  rayFraction(from, to, pad = 0.2) {
    const ex = to.x - from.x, ey = to.y - from.y, ez = to.z - from.z;
    const d = Math.sqrt(ex * ex + ey * ey + ez * ez);
    const steps = Math.max(2, Math.ceil(d / 0.15));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.solidAt(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t, pad)) return (i - 1) / steps;
    }
    return 1;
  }

  lineOfSight(a, b) { return this.rayFraction(a, b, 0) >= 1; }

  pointInside(pos) {
    const [r, c] = this.cellOf(pos);
    if (!this.isFloor(r, c)) return false;
    // no ar livre não há teto; dentro, o teto conta A PARTIR do chão dali
    if (!this.isOpenAir(r, c) && this.acimaDoChao(pos) > (this.isArenaCell(r, c) ? WALL_H * 2 : WALL_H)) return false;
    return !this.solidAt(pos.x, pos.z);
  }

  // ar livre não tem teto: a câmera sobe à vontade (o limite só existe para ela
  // não atravessar a laje da masmorra)
  ceilingAt(pos) {
    const [r, c] = this.cellOf(pos);
    return this.isOpenAir(r, c) ? 40 : this.isArenaCell(r, c) ? WALL_H * 2 - 0.4 : WALL_H - 0.3;
  }

  // Busca em largura no grid: próximo ponto rumo ao alvo
  nextWaypoint(from, to) {
    const start = this.cellOf(from), goal = this.cellOf(to);
    if (start[0] === goal[0] && start[1] === goal[1]) return to;
    const key = (r, c) => r * 100 + c;
    const prev = new Map([[key(...start), null]]);
    const queue = [start];
    while (queue.length) {
      const [r, c] = queue.shift();
      if (r === goal[0] && c === goal[1]) break;
      for (const [dr, dc] of Object.values(DIRS)) {
        const nr = r + dr, nc = c + dc, k = key(nr, nc);
        if (!this.isFloor(nr, nc) || prev.has(k) || this.edgeBlocked([r, c], [nr, nc])) continue;
        if (!this.conectaNivel([r, c], [nr, nc])) continue;   // não "atravessa" o desnível
        prev.set(k, [r, c]);
        queue.push([nr, nc]);
      }
    }
    if (!prev.has(key(...goal))) return null;
    let cur = goal, step = goal;
    while (cur && !(cur[0] === start[0] && cur[1] === start[1])) { step = cur; cur = prev.get(key(...cur)); }
    return this.center(step[0], step[1]);
  }

  /** A aresta entre as células `a` e `b` barra o caminho? (grade sempre; névoa e porta enquanto fechadas) */
  edgeBlocked(a, b) {
    const k = this.edgeKey(a, b), e = this.edgeMap.get(k);
    if (!e) return false;
    if (e.type === 'bars') return true;
    if (e.type === 'fog') return !this.gateOpen;
    const porta = this.portas.get(k);
    return porta ? !porta.disabled : false;
  }
}
