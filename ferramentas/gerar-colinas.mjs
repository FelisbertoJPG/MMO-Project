// AS COLINAS DO VENTO (04/10/2026) — a região nova a LESTE do acampamento, no jeito
// dos campos de Mondstadt: colinas suaves, vegetação, flores, ruínas de pedra num
// platô e um moinho no alto de um morro.
//
// O que faz (uma vez; recusa rodar de novo):
//  - mapa.json (variante floresta): acrescenta colunas à DIREITA (nada do que já
//    existe muda de lugar), abre a passagem do acampamento e desenha a região (f);
//    grava o RELEVO dela (`relevo.floresta`: a área e as colinas) e a tag da fogueira
//    nova (`marcos.floresta.colinas`);
//  - decor.json: acrescenta a decoração NO FIM (os índices de antes — os quebráveis
//    da rede — não mudam). A altura de cada peça o jogo põe sozinho (o relevo).
//
// Uso (da raiz do jogo): node ferramentas/gerar-colinas.mjs
import fs from 'node:fs';

const LARG_ANTES = 55, NOVAS = 54;            // colunas 55..108
const mapaArq = 'assets/mapa.json', decorArq = 'assets/decor.json';
const mapa = JSON.parse(fs.readFileSync(mapaArq, 'utf8'));
const linhas = mapa.mapas.floresta;
if (linhas[0].length !== LARG_ANTES) throw new Error(`esperava ${LARG_ANTES} colunas, achei ${linhas[0].length} — já foi gerada?`);
const ROWS = linhas.length, COLS = LARG_ANTES + NOVAS;

let semente = 20261004;
const rnd = () => ((semente = (semente * 1664525 + 1013904223) >>> 0) / 4294967296);
const entre = (a, b) => a + rnd() * (b - a);
const pega = (l) => l[Math.floor(rnd() * l.length)];
// ruído de valor suave (para a borda irregular e os bosques)
const grade = Array.from({ length: 64 }, () => Array.from({ length: 64 }, () => rnd()));
const ruido = (x, y) => {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const s = (t) => t * t * (3 - 2 * t);
  const g = (a, b) => grade[(a % 64 + 64) % 64][(b % 64 + 64) % 64];
  const a = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * s(fx), b = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * s(fx);
  return a + (b - a) * s(fy);
};

// ---- o mapa: rocha à direita, depois a região
const m = linhas.map((l) => (l + '#'.repeat(NOVAS)).split(''));
const C0 = 58, C1 = 106, R0 = 1, R1 = 24;     // a região
const cr = (R0 + R1) / 2, cc = (C0 + C1) / 2, rr = (R1 - R0) / 2, rc = (C1 - C0) / 2;
for (let r = R0; r <= R1; r++) for (let c = C0; c <= C1; c++) {
  const dy = (r - cr) / rr, dx = (c - cc) / rc;
  const borda = 0.78 + 0.32 * ruido(c * 0.18, r * 0.18);
  if (dx * dx + dy * dy < borda) m[r][c] = 'f';
}
// afloramentos de rocha no meio (quebram o campo aberto)
for (const [r, c, raio] of [[6, 75, 1.4], [18, 88, 1.6], [11, 101, 1.2]]) {
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) if (dr * dr + dc * dc <= raio * raio) m[r + dr][c + dc] = '#';
}
// a passagem do acampamento (linhas 15–17, da coluna 53 até a região)
for (let r = 15; r <= 17; r++) for (let c = 53; c <= C0 + 3; c++) m[r][c] = 'f';
// só fica o que se alcança a pé do acampamento
const visto = new Set(['16,53']); const fila = [[16, 53]];
while (fila.length) { const [r, c] = fila.pop(); for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = `${r + dr},${c + dc}`; if (!visto.has(k) && m[r + dr]?.[c + dc] === 'f') { visto.add(k); fila.push([r + dr, c + dc]); } } }
for (let r = 0; r < ROWS; r++) for (let c = LARG_ANTES; c < COLS; c++) if (m[r][c] === 'f' && !visto.has(`${r},${c}`)) m[r][c] = '#';
mapa.mapas.floresta = m.map((l) => l.join(''));
const eF = (r, c) => m[r]?.[c] === 'f';
const daRegiao = (r, c) => eF(r, c) && c >= LARG_ANTES - 1;

// ---- o relevo: as colinas (centro [linha, coluna], raio em células, altura em m)
const PLATO = { centro: [8, 93], raio: 6.5, altura: 8, plano: 0.5 };     // as ruínas
const MOINHO = { centro: [17, 71], raio: 5.5, altura: 7, plano: 0.35 };   // o moinho
const colinas = [PLATO, MOINHO];
for (let i = 0; i < 40 && colinas.length < 16; i++) {
  const c = Math.round(entre(C0 + 4, C1 - 3)), r = Math.round(entre(R0 + 3, R1 - 3));
  if (!eF(r, c)) continue;
  if (colinas.some((h) => Math.hypot(h.centro[0] - r, h.centro[1] - c) < h.raio * 0.8)) continue;
  colinas.push({ centro: [r, c], raio: Math.round(entre(3.5, 6.5) * 10) / 10, altura: Math.round(entre(2.5, 6.5) * 10) / 10 });
}
mapa.relevo ??= { _leiame: 'O RELEVO de cada variante (world.js, montarRelevo): a altura do chão de ar livre (f) dentro de `area` [[linha, coluna] de cima à esquerda, [linha, coluna] de baixo à direita] é a soma das `colinas` (centro [linha, coluna], raio em células, altura em m; `plano` = a fração do raio que é o topo chato), indo a zero perto da rocha e da borda da área (`borda`, em células). Fora da área, o chão é plano como sempre.' };
mapa.relevo.floresta = { area: [[R0, LARG_ANTES], [R1, C1 + 1]], borda: 2.2, colinas };
mapa.marcos.floresta.colinas = [16, 61];   // a fogueira nova, na entrada (vale, plano)

// a altura que o jogo vai dar (a mesma conta do world.js, sem a borda) — para pôr as
// ruínas e o moinho só onde é chato
const altura = (r, c) => {
  let h = 0;
  for (const k of colinas) {
    const d = Math.hypot(r - k.centro[0], c - k.centro[1]) / k.raio;
    if (d >= 1) continue;
    const p = k.plano ?? 0, t = d <= p ? 0 : (d - p) / (1 - p);
    h += k.altura * 0.5 * (1 + Math.cos(Math.PI * t));
  }
  return h;
};

// ---- a decoração
const r3 = (v) => Math.round(v * 1000) / 1000;
const novos = [];
const por = (prop, r, c, off, escala, extra = {}) => novos.push({ prop, cel: [r, c], off: off.map(r3), giro: r3(entre(0, Math.PI * 2)), escala: r3(escala), ...extra });
// árvores VERDES (os campos de Mondstadt); o bordo vermelho só de vez em quando, de enfeite.
// Poucos tipos de propósito: cada tipo × região é uma chamada de desenho (os lotes)
const VERDES = ['estilizada-NormalTree_1', 'estilizada-NormalTree_2', 'estilizada-NormalTree_4', 'estilizada-NormalTree_5', 'megakit-CommonTree_1', 'estilizada-BirchTree_2'];
const ARVORES = [...VERDES, ...VERDES, 'estilizada-MapleTree_2'];
const PEDRAS_BORDA = ['Rock_1_A', 'Rock_1_C', 'Rock_2_A', 'Rock_3_A', 'megakit-Rock_Medium_3'];
const MUSGO = ['natureza-Rock_Moss_4', 'natureza-Rock_Moss_6'];
const FLORES = ['megakit-Flower_3_Group', 'estilizada-Flower_1_Clump', 'estilizada-Flower_4_Clump'];
const MOITAS = ['estilizada-Bush_Flowers', 'Bush_1_A'];
const CAPIM = ['megakit-Grass_Wispy_Tall', 'Grass_2_A'];
const ruinas = (r, c) => Math.hypot(r - PLATO.centro[0], c - PLATO.centro[1]) < PLATO.raio * 0.55;
const moinho = (r, c) => Math.hypot(r - MOINHO.centro[0], c - MOINHO.centro[1]) < 1.6;
const trilha = new Set();
// a TRILHA de pedras: da fogueira nova até o platô das ruínas, passando pelo moinho
const passos = [[16, 63], [17, 66], MOINHO.centro, [14, 78], [11, 86], PLATO.centro];
for (let i = 0; i < passos.length - 1; i++) {
  const [a, b] = [passos[i], passos[i + 1]], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 1.2);
  for (let k = 0; k <= n; k++) {
    const r = a[0] + (b[0] - a[0]) * (k / n), c = a[1] + (b[1] - a[1]) * (k / n);
    const ri = Math.round(r), ci = Math.round(c);
    if (!eF(ri, ci) || ruinas(ri, ci) || moinho(ri, ci)) continue;
    trilha.add(`${ri},${ci}`);
    por('megakit-RockPath_Round_Wide', ri, ci, [(c - ci) * 4, (r - ri) * 4], entre(1.6, 2.0));
  }
}
for (let r = 0; r < ROWS; r++) {
  for (let c = LARG_ANTES - 1; c < COLS; c++) {
    if (!daRegiao(r, c)) continue;
    // a borda com a rocha: árvores e pedras EM CIMA dela (são elas que mostram o paredão)
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      if (eF(r + dr, c + dc)) continue;
      for (let k = 0; k < 2; k++) {
        const ao = entre(-1.2, 1.2), off = dc ? [dc * 1.7, ao] : [ao, dr * 1.7];
        if (rnd() < 0.62) por(pega(ARVORES), r, c, off, entre(1.1, 1.6));
        else por(pega(PEDRAS_BORDA), r, c, off, entre(2.2, 2.8));
      }
    }
    if (ruinas(r, c) || moinho(r, c)) continue;
    const naTrilha = trilha.has(`${r},${c}`);
    const bosque = ruido(c * 0.22 + 7, r * 0.22 + 3) > 0.62;   // manchas de bosque
    const o = () => [entre(-1.6, 1.6), entre(-1.6, 1.6)];
    if (!naTrilha && rnd() < (bosque ? 0.5 : 0.05)) por(pega(ARVORES), r, c, o(), entre(0.9, 1.4), { colisao: 0.7 });
    if (!naTrilha && rnd() < 0.12) por(pega(MOITAS), r, c, o(), entre(0.9, 1.3));
    for (let k = 0; k < 2; k++) if (rnd() < 0.5) por(pega(CAPIM), r, c, o(), entre(0.8, 1.2));
    if (!naTrilha && rnd() < (bosque ? 0.15 : 0.32)) por(pega(FLORES), r, c, o(), entre(0.7, 1.1));
    if (!naTrilha && rnd() < 0.07) por(pega(MUSGO), r, c, o(), entre(2.5, 4.5), { colisao: undefined });   // o raio, o jogo mede
  }
}
// ---- as RUÍNAS no platô: um anel de colunas (umas quebradas), arcos e muros
// partidos, piso de pedra rachado e entulho — o "templo" no alto da colina
const [pr, pc] = PLATO.centro;
const noAnel = (ang, raioCel) => { const r = pr + Math.sin(ang) * raioCel, c = pc + Math.cos(ang) * raioCel; const ri = Math.round(r), ci = Math.round(c); return [ri, ci, [(c - ci) * 4, (r - ri) * 4]]; };
for (let i = 0; i < 10; i++) {
  const [ri, ci, off] = noAnel((i / 10) * Math.PI * 2, 2.2);
  if (i === 3 || i === 7) por('rubble_half', ri, ci, off, 1.2, { colisao: undefined });   // as que caíram
  else por(i % 2 ? 'column' : 'pillar_decorated', ri, ci, off, i % 2 ? 2.4 : 1.3, { colisao: 0.8 });
}
for (const [ang, prop] of [[0.35, 'wall_arched'], [2.2, 'wall_archedwindow_open'], [4.1, 'wall_arched'], [5.4, 'wall_broken']]) {
  const [ri, ci, off] = noAnel(ang, 3.4);
  novos.push({ prop, cel: [ri, ci], off: off.map(r3), giro: r3(-ang + Math.PI / 2), escala: 1.5 });
}
for (let i = 0; i < 9; i++) { const [ri, ci, off] = noAnel(entre(0, Math.PI * 2), entre(0, 1.6)); por(pega(['floor_tile_small_broken_A', 'floor_tile_small_broken_B', 'floor_dirt_small_weeds']), ri, ci, off, 1.5); }
for (let i = 0; i < 6; i++) { const [ri, ci, off] = noAnel(entre(0, Math.PI * 2), entre(2.6, 4.2)); por(pega(['rubble_large', 'rubble_half', 'barrier_column']), ri, ci, off, entre(0.9, 1.3), { colisao: undefined }); }   // o desabamento: raio do tamanho dele (o jogo mede)
for (let i = 0; i < 8; i++) { const [ri, ci, off] = noAnel(entre(0, Math.PI * 2), entre(1, 3.5)); por(pega(FLORES), ri, ci, off, entre(0.7, 1)); }
// um arco sozinho numa colina (o "portal" que se vê de longe)
{ const k = colinas[3] ?? colinas[2]; novos.push({ prop: 'wall_arched', cel: k.centro, off: [0, 0], giro: 0.6, escala: 1.5 }); por('pillar_decorated', k.centro[0], k.centro[1], [1.9, 0.9], 1.2, { colisao: 0.8 }); }
// ---- o MOINHO no alto do morro
novos.push({ prop: 'building_windmill_red', cel: MOINHO.centro, off: [0, 0], giro: 2.4, escala: 7, colisao: 3.2 });
for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; por(pega(FLORES), MOINHO.centro[0], MOINHO.centro[1], [Math.cos(a) * 3.2, Math.sin(a) * 3.2], 0.9); }

// cada peça na célula em que ela CAI (o editor de cenas relê assim: |off| ≤ 2) e com o
// raio de colisão DECLARADO — sem ele, o editor faz da peça uma caixa do tamanho dela (o
// capim viraria parede na conta de alcance dele); no jogo, 0 = não barra, como sempre
for (const d of novos) {
  const pr = d.cel[0] * 4 + d.off[1], pc = d.cel[1] * 4 + d.off[0];
  d.cel = [Math.round(pr / 4), Math.round(pc / 4)];
  d.off = [r3(pc - d.cel[1] * 4), r3(pr - d.cel[0] * 4)];
  if ('colisao' in d && d.colisao === undefined) delete d.colisao;   // pedra e entulho: o jogo mede (RAIO_AUTOMATICO)
  else d.colisao ??= 0;
}
const decor = JSON.parse(fs.readFileSync(decorArq, 'utf8'));
decor.itens.push(...novos);
const cab = Object.entries(decor).filter(([k]) => k !== 'itens').map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
fs.writeFileSync(decorArq, `{\n${cab.join(',\n')},\n  "itens": [\n${decor.itens.map((d) => '    ' + JSON.stringify(d)).join(',\n')}\n  ]\n}\n`);

// o mapa.json no formato do editor (uma linha de mapa por linha do arquivo)
const extras = Object.entries(mapa).filter(([k]) => !['_leiame', 'ativo', 'mapas'].includes(k)).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')},\n`).join('');
const partes = Object.entries(mapa.mapas).map(([nome, ls]) => `    ${JSON.stringify(nome)}: [\n${ls.map((l) => `      ${JSON.stringify(l)}`).join(',\n')}\n    ]`);
fs.writeFileSync(mapaArq, `{\n  "_leiame": ${JSON.stringify(mapa._leiame)},\n  "ativo": ${JSON.stringify(mapa.ativo)},\n${extras}  "mapas": {\n${partes.join(',\n')}\n  }\n}\n`);

console.log(`mapa: ${LARG_ANTES} → ${COLS} colunas | ${colinas.length} colinas | decor: +${novos.length} peças (total ${decor.itens.length})`);
console.log('    ' + [...Array(COLS).keys()].map((c) => String(c % 10)).join(''));
mapa.mapas.floresta.forEach((l, r) => console.log(String(r).padStart(3) + ' ' + l));
