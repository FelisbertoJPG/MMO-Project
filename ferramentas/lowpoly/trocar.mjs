// AS ÁRVORES E AS PEDRAS `lp-` NAS WINDHILLS (11/10/2026) — as peças que o `converter.py` desta
// pasta tirou de `lowpoly/` tomam o lugar das árvores e das pedras da região (colunas 55 em
// diante), e pedras PEQUENAS e seixos novos são espalhados por ela.
//
//   - TROCA (no mesmo lugar e no mesmo índice do decor.json; só mudam o modelo e a escala):
//     toda árvore vira uma `lp-Tree_*` da MESMA ALTURA; toda pedra (`Rock_*` do KayKit e da
//     Quaternius) vira uma `lp-Rock_*` da MESMA LARGURA. O giro e a colisão ficam. Não há volta
//     sem o git: as originais só existem no histórico.
//   - SOLTAS (`"solta": 1`, sempre no FIM do arquivo): pedrinhas ao pé das pedras grandes e em
//     grupos pelo campo, e manchas de seixos. Não barram (`colisao: 0`).
//
// Determinístico e pode rodar de novo: o sorteio de cada troca é pela POSIÇÃO no arquivo, e as
// soltas de uma rodada anterior saem antes de espalhar outra vez. O `plantar.mjs` da vegetação
// `gi-` conhece as soltas e as mantém no fim.
//
// Uso (da raiz do jogo): node ferramentas/lowpoly/trocar.mjs <pasta com os .glb do converter.py>
import fs from 'node:fs';
import { caixaDoGlb } from './glb.mjs';

const GLB = process.argv[2];
if (!GLB || !fs.existsSync(`${GLB}/medidas.json`)) throw new Error('uso: node ferramentas/lowpoly/trocar.mjs <pasta com os .glb e o medidas.json do converter.py>');
const CELL = 6, S = 1.5, COLUNA = 55;
const medidas = JSON.parse(fs.readFileSync(`${GLB}/medidas.json`, 'utf8'));     // [largura, ALTURA, fundo]
const mapa = JSON.parse(fs.readFileSync('assets/mapa.json', 'utf8'));
const linhasDoMapa = mapa.mapas.floresta;
const ch = (r, c) => linhasDoMapa[r]?.[c] ?? '#';

const caixas = new Map();
const medida = (prop) => medidas[prop] ?? (caixas.has(prop) ? caixas : caixas.set(prop, caixaDoGlb(`assets/dungeon/${prop}.glb`))).get(prop);
const largura = (prop) => Math.max(medida(prop)[0], medida(prop)[2]);

// ---- as peças novas: [peça, peso]
const ARVORES = [['lp-Tree_1', 3], ['lp-Tree_2', 3], ['lp-Tree_3', 3]];
// as de pé (N3, N4, Rock_6) são marcos: poucas
const PEDRAS = [['lp-Rock_2', 2], ['lp-Rock_3', 2], ['lp-Rock_4', 2], ['lp-Rock_5', 2], ['lp-Rock_6', 1], ['lp-Rock_N1', 2], ['lp-Rock_N2', 2],
  ['lp-Rock_N3', 0.6], ['lp-Rock_N4', 0.8], ['lp-Rock_N5', 2], ['lp-Rock_N6', 2], ['lp-Rock_N7', 2], ['lp-Rock_N8', 2], ['lp-Rock_N9', 2], ['lp-Rock_N10', 2], ['lp-Rock_1', 1]];
const PEDRINHAS = PEDRAS.filter(([p]) => !/N3|N4|Rock_6|Rock_1$/.test(p));
const SEIXOS = [1, 2, 3, 4].map((n) => [`lp-Rock_Seixos_${n}`, 1]);
const ARVORE = /Tree(?!Stump)/, PEDRA = /(^|-)Rock_/;

const acaso = (i, sal = 0) => {
  let h = Math.imul(i + 1 + sal * 7919, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};
const escolhe = (lista, t) => { t *= lista.reduce((s, [, p]) => s + p, 0); for (const [nome, p] of lista) if ((t -= p) < 0) return nome; return lista[0][0]; };

// ---- o decor.json, linha a linha (as linhas que não mudam ficam COMO ESTAVAM)
const texto = fs.readFileSync('assets/decor.json', 'utf8');
const fimDeLinha = texto.includes('\r\n') ? '\r\n' : '\n';
const todas = texto.split(/\r?\n/);
const eItem = (l) => /^\s*\{"prop"/.test(l);
const a = todas.findIndex(eItem), b = todas.findLastIndex(eItem);
let itens = todas.slice(a, b + 1).filter(eItem).map((l) => ({ linha: l.replace(/,\s*$/, ''), d: JSON.parse(l.replace(/,\s*$/, '')) }));
// as peças dos CENÁRIOS (`de`, de `ferramentas/cenarios/`) ficam depois das soltas: saem daqui e voltam no fim
const cauda = itens.filter((x) => x.d.de);
itens = itens.filter((x) => !x.d.de);
const primeiraSolta = itens.findIndex((x) => x.d.solta);
if (primeiraSolta >= 0 && itens.slice(primeiraSolta).some((x) => !x.d.solta)) throw new Error('há peças depois das soltas no decor.json — resolva à mão');
if (primeiraSolta >= 0) itens = itens.slice(0, primeiraSolta);

// ---- a troca
const conta = {}, grandes = [];
const lugar = (d) => [d.cel[1] * CELL + (d.off?.[0] ?? 0) * S, d.cel[0] * CELL + (d.off?.[1] ?? 0) * S];
itens.forEach((x, i) => {
  const d = x.d;
  if (d.cel[1] < COLUNA) return;
  if (!d.prop.startsWith('lp-')) {
    let novo;
    if (ARVORE.test(d.prop)) {
      novo = escolhe(ARVORES, acaso(i));
      d.escala = +((medida(d.prop)[1] * (d.escala ?? 1)) / medidas[novo][1]).toFixed(3);
    } else if (PEDRA.test(d.prop)) {
      novo = escolhe(PEDRAS, acaso(i));
      d.escala = +((largura(d.prop) * (d.escala ?? 1)) / largura(novo)).toFixed(3);
    } else return;
    d.prop = novo;
    x.linha = '    ' + JSON.stringify(d);
    conta[novo] = (conta[novo] ?? 0) + 1;
  }
  if (PEDRA.test(d.prop) && !/Seixos/.test(d.prop)) grandes.push([...lugar(d), largura(d.prop) * (d.escala ?? 1) / 2]);
});

// ---- as SOLTAS: onde pode (como o plantar.mjs da vegetação: fora da estrada, das trilhas, das
//      fogueiras, das construções e dos objetos, e sem encostar na rocha)
const rel = mapa.relevo?.floresta, pp = rel?.passo > 0 ? rel.passo : 2;
const no = (i, k) => { const v = rel?.pontos?.[`${i},${k}`]; return Number.isFinite(v) ? v : 0; };
const relevo = (x, z) => {
  const fx = x / pp, fz = z / pp, i = Math.floor(fx), k = Math.floor(fz), tx = fx - i, tz = fz - k;
  return no(i, k) * (1 - tx) * (1 - tz) + no(i + 1, k) * tx * (1 - tz) + no(i, k + 1) * (1 - tx) * tz + no(i + 1, k + 1) * tx * tz;
};
const afasta = (d) => {
  const p = d.prop;
  if (/^building_/.test(p)) return 7;
  if (/^tent$/.test(p)) return 4;
  if (/RockPath|^floor_/.test(p)) return 3.2;
  if (/^wall|^stairs|^barrier|^pillar|^column/.test(p)) return 3.4;
  if (ARVORE.test(p)) return 0.9;
  if (PEDRA.test(p) || /^rubble_|^gi-|Bush|Grass|Flower|WoodLog|TreeStump|Plant|Mushroom|Fern/.test(p)) return 0;
  return 1.8;
};
const barreiras = new Map();
for (const { d } of [...itens, ...cauda]) {
  const r = afasta(d);
  if (!r || d.cel[1] < COLUNA - 2) continue;
  const [x, z] = lugar(d), k = `${Math.round(z / CELL)},${Math.round(x / CELL)}`;
  if (!barreiras.has(k)) barreiras.set(k, []);
  barreiras.get(k).push([x, z, r]);
}
const fogueiras = Object.values(mapa.marcos.floresta).filter(Array.isArray).map(([r, c]) => [c * CELL, r * CELL]);
const ESTRADA = { linha: 16, deColuna: 14.6, ateColuna: 64 };   // campo.js
const naEstrada = (x, z) => x <= ESTRADA.ateColuna * CELL + 3 && Math.abs(z - (ESTRADA.linha * CELL + Math.sin(x / 23) * 2.1 + Math.sin(x / 8.7 + 1.3) * 0.7)) < 3.2;
const livre = (x, z, folga) => {
  const r0 = Math.round(z / CELL), c0 = Math.round(x / CELL);
  if (c0 < COLUNA) return false;
  for (const [dx, dz] of [[0, 0], [folga, 0], [-folga, 0], [0, folga], [0, -folga]]) if (ch(Math.round((z + dz) / CELL), Math.round((x + dx) / CELL)) !== 'f') return false;
  if (naEstrada(x, z) || fogueiras.some(([fx, fz]) => Math.hypot(x - fx, z - fz) < 5.5)) return false;
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    for (const [bx, bz, br] of barreiras.get(`${r0 + dr},${c0 + dc}`) ?? []) if (Math.hypot(x - bx, z - bz) < br) return false;
  }
  return true;
};

let semente = 20261012;
const rnd = () => ((semente = (semente * 1664525 + 1013904223) >>> 0) / 4294967296);
const entre = (p, q) => p + rnd() * (q - p);
const soltas = [];
/** Uma peça solta com `tamanho` m de largura. Devolve se coube. */
const solta = (prop, x, z, tamanho) => {
  const h = relevo(x, z);
  // o jogo ENTERRA a peça que está no relevo (|h| > 5 cm; a pedra pequena, só um décimo da
  // altura dela — `placeDecor`). Na dúvida (perto dos 5 cm), não põe.
  if (Math.abs(h) > 0.03 && Math.abs(h) < 0.08) return false;
  if (!livre(x, z, Math.min(1.2, tamanho / 2 + 0.3))) return false;
  // (a célula sai do lugar já arredondado ao milímetro do arquivo, como no plantar.mjs)
  x = Math.round(x / S * 1000) * S / 1000; z = Math.round(z / S * 1000) * S / 1000;
  const r = Math.round(z / CELL), c = Math.round(x / CELL);
  const d = { prop, cel: [r, c], off: [+((x - c * CELL) / S).toFixed(3), +((z - r * CELL) / S).toFixed(3)] };
  d.giro = +entre(0, Math.PI * 2).toFixed(3);
  d.escala = +(tamanho / largura(prop)).toFixed(3);
  d.colisao = 0; d.solta = 1;
  soltas.push(d);
  return true;
};
// ao pé de cada pedra grande: pedrinhas caídas dela e, às vezes, seixos
for (const [x, z, raio] of grandes) {
  if (raio < 0.7) continue;
  for (let n = Math.floor(entre(0, 3.4)); n > 0; n--) {
    const g = entre(0, Math.PI * 2), dist = raio + entre(0.1, 1.3);
    solta(escolhe(PEDRINHAS, rnd()), x + Math.cos(g) * dist, z + Math.sin(g) * dist, entre(0.3, 0.75));
  }
  if (rnd() < 0.3) { const g = entre(0, Math.PI * 2), dist = raio + entre(0.4, 1.4); solta(escolhe(SEIXOS, rnd()), x + Math.cos(g) * dist, z + Math.sin(g) * dist, entre(1.1, 1.7)); }
}
// pelo campo: grupos de pedras pequenas (uma maior e as menores em volta) e manchas de seixos
for (let r = 0; r < linhasDoMapa.length; r++) for (let c = COLUNA; c < linhasDoMapa[r].length; c++) {
  if (ch(r, c) !== 'f') continue;
  const t = rnd();
  const x = c * CELL + entre(-2.5, 2.5), z = r * CELL + entre(-2.5, 2.5);
  if (t < 0.16) {
    solta(escolhe(PEDRINHAS, rnd()), x, z, entre(0.55, 1.1));
    for (let n = Math.floor(entre(1, 3.6)); n > 0; n--) { const g = entre(0, Math.PI * 2), dist = entre(0.6, 1.6); solta(escolhe(PEDRINHAS, rnd()), x + Math.cos(g) * dist, z + Math.sin(g) * dist, entre(0.22, 0.5)); }
  } else if (t < 0.24) solta(escolhe(SEIXOS, rnd()), x, z, entre(1.1, 1.8));
}

// ---- gravar: os .glb das peças usadas e o decor.json
const usadas = [...new Set([...itens.map((x) => x.d), ...soltas].map((d) => d.prop).filter((p) => p.startsWith('lp-')))].sort((p, q) => p.localeCompare(q, 'en', { numeric: true }));
for (const p of usadas) if (medidas[p]) fs.copyFileSync(`${GLB}/${p}.glb`, `assets/dungeon/${p}.glb`);   // (as moitas `lp-Bush_` são do arbusto.mjs)
const linhas = [...itens.map((x) => x.linha), ...soltas.map((d) => '    ' + JSON.stringify(d)), ...cauda.map((x) => x.linha)];
const novo = [...todas.slice(0, a), ...linhas.map((l, i) => l + (i < linhas.length - 1 ? ',' : '')), ...todas.slice(b + 1)].join(fimDeLinha);
JSON.parse(novo);
fs.writeFileSync('assets/decor.json', novo);

const trocadas = Object.values(conta).reduce((s, n) => s + n, 0);
console.log(`${trocadas} trocadas agora:`, Object.entries(conta).map(([k, v]) => `${k} ${v}`).join(', ') || 'nenhuma');
console.log(`${soltas.length} soltas (${soltas.filter((d) => /Seixos/.test(d.prop)).length} manchas de seixos), ${itens.length + soltas.length + cauda.length} itens ao todo`);
console.log('PROPS:', usadas.map((p) => `'${p}'`).join(', '));
