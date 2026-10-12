// A VEGETAÇÃO `gi-` NO MAPA (11/10/2026) — leva as peças escolhidas de `vegetacao-gi/`
// (as que o `lowpoly.py` gerou) para `assets/dungeon/` e as espalha pelo ar livre:
// flores em TOUCEIRAS nas WindHills, cogumelos/ervas/gravetos na floresta e na mata,
// algumas flores no acampamento e um TRIGAL em volta do moinho.
//
// Determinístico e pode rodar de novo: tira o que plantou antes (as peças `gi-`, que
// ficam sempre no FIM do decor.json — os índices de antes, os quebráveis da rede, não
// mudam) e planta outra vez. Não põe nada na estrada, nas trilhas, junto das fogueiras,
// colado na rocha nem em cima de construção, objeto, pedra ou tronco de árvore.
//
// Uso (da raiz do jogo): node ferramentas/vegetacao-gi/plantar.mjs
import fs from 'node:fs';

const CELL = 6, S = 1.5;
const NOS_CAMPOS = 1.35;   // nas WindHills tudo é maior: as flores têm de passar do capim de lá (capim.js)
const mapa = JSON.parse(fs.readFileSync('assets/mapa.json', 'utf8'));
const decor = JSON.parse(fs.readFileSync('assets/decor.json', 'utf8'));
const linhas = mapa.mapas.floresta;
const ch = (r, c) => linhas[r]?.[c] ?? '#';

// ---- o que já estava (sem as `gi-` de uma rodada anterior, que têm de estar no fim)
//      (as TROCADAS — `troca: 1`, ver abaixo — ficam onde estão: são peças de antes com outro modelo)
//      (as pedrinhas SOLTAS — `solta: 1`, de `ferramentas/lowpoly/trocar.mjs` — vêm depois das `gi-` e voltam para o fim)
const plantada = (d) => d.prop.startsWith('gi-') && !d.troca;
// (e as peças dos CENÁRIOS — `de: "lagoa"`…, de `ferramentas/cenarios/` — depois delas: também voltam para o fim)
const semSoltas = decor.itens.filter((d) => !d.solta && !d.de);
const primeira = semSoltas.findIndex(plantada);
if (primeira >= 0 && semSoltas.slice(primeira).some((d) => !plantada(d))) {
  throw new Error('há peças depois das gi- no decor.json: tirá-las mudaria os índices — resolva à mão');
}
const antes = primeira >= 0 ? semSoltas.slice(0, primeira) : semSoltas;

let semente = 20261011;
const rnd = () => ((semente = (semente * 1664525 + 1013904223) >>> 0) / 4294967296);
const entre = (a, b) => a + rnd() * (b - a);
const sorteia = (l) => { let t = rnd() * l.reduce((s, e) => s + e.peso, 0); for (const e of l) if ((t -= e.peso) < 0) return e; return l[l.length - 1]; };

// ---- o relevo (os pontos do mapa.json, como o world.js os lê)
function relevoDe(x, z) { return relevo(x, z); }
const rel = mapa.relevo?.floresta, pp = rel?.passo > 0 ? rel.passo : 2;
const no = (i, k) => { const v = rel?.pontos?.[`${i},${k}`]; return Number.isFinite(v) ? v : 0; };
const relevo = (x, z) => {
  const fx = x / pp, fz = z / pp, a = Math.floor(fx), b = Math.floor(fz), tx = fx - a, tz = fz - b;
  return no(a, b) * (1 - tx) * (1 - tz) + no(a + 1, b) * tx * (1 - tz) + no(a, b + 1) * (1 - tx) * tz + no(a + 1, b + 1) * tx * tz;
};

// ---- as WINDHILLS INTEIRAS nas peças novas: o mato, as flores e os arbustos que já decoravam
// a região (colunas 55 em diante) viram peças `gi-` NO MESMO LUGAR e no mesmo índice (`troca: 1`;
// só mudam o modelo e a escala). Árvores, pedras, ruínas e trilha ficam: o pacote não tem isso.
// Sorteio próprio, para rodar de novo (quando já não há o que trocar) não mudar o plantio.
const T = (prop, peso, escala) => ({ prop: 'gi-' + prop, peso, escala });
const TROCAS = [
  [/^Grass_/, [T('Grass_Reed', 3, [0.6, 0.85]), T('GlazedGrass', 2, [0.9, 1.2]), T('RootlessSeed01', 2, [0.8, 1.1]), T('Flower_White_01', 3, [0.8, 1.05]),
    T('Flower07', 2, [0.8, 1.05]), T('Mint01', 2, [0.6, 0.8]), T('Flower_Yellow_01', 2, [0.65, 0.9])]],
  [/^megakit-Grass_Wispy_Tall/, [T('Grass_Reed', 4, [0.75, 1.0]), T('Flower_Common_C_01', 2, [0.5, 0.7]), T('Wheat01', 2, [0.6, 0.8]), T('HorseTail', 1, [0.4, 0.55])]],
  [/Flower_\d_(Clump|Group)/, [T('Flower_Blue_01', 3, [0.9, 1.25]), T('Flower_Blue_02', 3, [0.9, 1.25]), T('Cecilia', 2, [0.65, 0.85]), T('WindmillDaisy02', 2, [0.6, 0.8]),
    T('Flower_Kikka_01', 2, [0.85, 1.1]), T('Callas01', 1, [0.65, 0.85]), T('Snapdragon01', 1, [0.65, 0.85])]],
  [/^(estilizada-Bush_|Bush_)/, [T('Raspberry02', 3, [0.9, 1.25]), T('Flower_Common_D_02', 2, [0.4, 0.55]), T('Flower_Red_01', 2, [0.6, 0.8]), T('GlazedLily_Day', 1, [0.7, 0.9])]],
];
let sementeT = 4117;
const rndT = () => ((sementeT = (sementeT * 1664525 + 1013904223) >>> 0) / 4294967296);
const trocadas = new Set();
antes.forEach((d, i) => {
  if (d.cel[1] < 55 || d.prop.startsWith('gi-') || linhas[d.cel[0]]?.[d.cel[1]] !== 'f') return;
  const lista = TROCAS.find(([re]) => re.test(d.prop))?.[1];
  if (!lista) return;
  let t = rndT() * lista.reduce((s, e) => s + e.peso, 0), e = lista[lista.length - 1];
  for (const x of lista) if ((t -= x.peso) < 0) { e = x; break; }
  const x = d.cel[1] * CELL + (d.off?.[0] ?? 0) * S, z = d.cel[0] * CELL + (d.off?.[1] ?? 0) * S;
  const n = { prop: e.prop, cel: d.cel, off: d.off ?? [0, 0] };
  n.giro = d.giro ?? 0;
  n.escala = +((e.escala[0] + rndT() * (e.escala[1] - e.escala[0])) * NOS_CAMPOS).toFixed(2);
  n.colisao = 0; n.troca = 1;
  antes[i] = n; trocadas.add(i);
});

// ---- onde NÃO plantar
const lugar = (d) => [d.cel[1] * CELL + (d.off?.[0] ?? 0) * S, d.cel[0] * CELL + (d.off?.[1] ?? 0) * S];
const NATUREZA = /Tree|Bush|(^|-)Grass|Flower|WoodLog|TreeStump|Plant|Mushroom|Fern/;   // categorias.js
const afasta = (d) => {
  const p = d.prop, e = d.escala ?? 1;
  if (/^building_/.test(p)) return 7;
  if (/^tent$/.test(p)) return 4;
  if (/RockPath|^floor_/.test(p)) return 3.2;
  if (/^wall|^stairs|^barrier|^pillar|^column/.test(p)) return 3.4;
  if (/Tree(?!Stump)/.test(p)) return 1.2;
  if (/TreeStump|WoodLog/.test(p)) return 1.2 * e;
  if (/^lp-Rock_/.test(p)) return d.solta ? 0 : 1.9 * e;        // as `lp-` têm ~3 m na escala 1 (as do KayKit, ~1,5 m)
  if (/(^|-)Rock_|^rubble_/.test(p)) return 1.6 * e;
  if (NATUREZA.test(p) || p.startsWith('gi-')) return 0;               // mato, arbusto e flor que já estavam: pode ao lado
  return 1.8;                                    // objeto (barril, caixote, mesa…)
};
const barreiras = new Map();                     // por célula
for (const d of [...antes, ...decor.itens.filter((x) => x.de)]) {
  if (ch(d.cel[0], d.cel[1]) !== 'f') continue;
  const r = afasta(d);
  if (!r) continue;
  const [x, z] = lugar(d), k = `${Math.round(z / CELL)},${Math.round(x / CELL)}`;
  if (!barreiras.has(k)) barreiras.set(k, []);
  barreiras.get(k).push([x, z, r]);
}
const fogueiras = Object.values(mapa.marcos.floresta).filter(Array.isArray).map(([r, c]) => [c * CELL, r * CELL]);
const ESTRADA = { linha: 16, deColuna: 14.6, ateColuna: 64 };   // campo.js
const naEstrada = (x, z) => {
  if (x < ESTRADA.deColuna * CELL - 3 || x > ESTRADA.ateColuna * CELL + 3) return false;
  return Math.abs(z - (ESTRADA.linha * CELL + Math.sin(x / 23) * 2.1 + Math.sin(x / 8.7 + 1.3) * 0.7)) < 3.2;
};
// dentro d'água e na areia da praia (`agua` do mapa.json, js/agua.js): nada de flor
const naAgua = (x, z) => (mapa.agua?.floresta ?? []).some((a) => x > a.caixa[0] && x < a.caixa[2] && z > a.caixa[1] && z < a.caixa[3] && relevo(x, z) < a.nivel + 0.45);
const livre = (x, z, folga) => {
  const r0 = Math.round(z / CELL), c0 = Math.round(x / CELL);
  for (const [dx, dz] of [[0, 0], [folga, 0], [-folga, 0], [0, folga], [0, -folga]]) {
    if (ch(Math.round((z + dz) / CELL), Math.round((x + dx) / CELL)) !== 'f') return false;
  }
  if (naAgua(x, z)) return false;
  if (naEstrada(x, z)) return false;
  if (fogueiras.some(([fx, fz]) => Math.hypot(x - fx, z - fz) < 5.5)) return false;
  for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
    for (const [bx, bz, br] of barreiras.get(`${r0 + dr},${c0 + dc}`) ?? []) if (Math.hypot(x - bx, z - bz) < br) return false;
  }
  return true;
};

// ---- as espécies: quantas por touceira, o tamanho (a escala) e o raio da touceira (m)
const E = (prop, peso, n, escala, raio = 1.1) => ({ prop: 'gi-' + prop, peso, n, escala, raio });
const CAMPOS = [
  E('Cecilia', 5, [3, 6], [0.6, 0.8]), E('WindmillDaisy02', 5, [3, 5], [0.55, 0.75]),
  E('Flower_White_01', 5, [4, 7], [0.8, 1.05]), E('Flower_Yellow_01', 5, [3, 6], [0.65, 0.9]),
  E('Flower_Blue_03', 4, [3, 6], [0.6, 0.8]), E('Flower_Kikka_01', 4, [3, 6], [0.8, 1.05]),
  E('Flower07', 4, [4, 7], [0.8, 1.05]), E('Flower_Red_01', 3, [2, 4], [0.4, 0.55]),
  E('Callas01', 3, [3, 5], [0.6, 0.8]), E('Snapdragon01', 3, [3, 5], [0.6, 0.85]),
  E('Whiteballet01', 3, [3, 5], [0.6, 0.85]), E('QingxinBase_02', 2, [2, 4], [0.6, 0.8]),
  E('RootlessSeed01', 3, [3, 6], [0.8, 1.1]), E('Flower_Blue_01', 3, [1, 2], [0.8, 1.1], 1.6),
  E('GlazedGrass', 2, [2, 4], [0.9, 1.2]), E('GlazedLily_Day', 1, [1, 3], [0.5, 0.65]),
  E('Grass_Reed', 2, [1, 3], [0.7, 0.95], 1.4), E('Raspberry02', 1, [1, 1], [0.8, 1.0]),
];
const BOSQUE = [
  E('Mushroom01', 6, [2, 5], [0.5, 0.95], 0.9), E('Mint01', 4, [3, 5], [0.6, 0.8]),
  E('HorseTail', 3, [2, 4], [0.4, 0.55]), E('Fuchsia01', 3, [2, 4], [0.55, 0.75]),
  E('DropingBerry', 3, [1, 3], [0.6, 0.8]), E('Flower_Twigs_01', 3, [1, 2], [0.8, 1.2], 1.5),
  E('Flower_Twigs_02', 3, [1, 2], [0.6, 0.9], 1.5), E('Raspberry02', 2, [1, 1], [0.8, 1.05]),
  E('Callas01', 2, [2, 4], [0.6, 0.8]), E('Flower_White_01', 2, [3, 5], [0.8, 1.0]),
];
const ACAMPAMENTO = [
  E('Flower_White_01', 3, [3, 5], [0.8, 1.0]), E('Flower_Yellow_01', 3, [3, 5], [0.65, 0.85]),
  E('Flower07', 2, [3, 5], [0.8, 1.0]), E('Mint01', 2, [2, 4], [0.6, 0.8]), E('Cecilia', 1, [2, 4], [0.6, 0.75]),
];
const zona = (c) => c >= 55 ? { lista: CAMPOS, chance: 0.5 } : c >= 40 ? { lista: ACAMPAMENTO, chance: 0.14 }
  : { lista: BOSQUE, chance: 0.3 };

// ---- plantar
const novas = [];
const planta = (prop, x, z, escala) => {
  // (a célula sai do lugar já arredondado ao milímetro do arquivo: senão um deslocamento de
  // +2,000 cai na célula vizinha quando o decorador do editor relê — o mesmo lugar, outra conta)
  x = Math.round(x / S * 1000) * S / 1000; z = Math.round(z / S * 1000) * S / 1000;
  const r = Math.round(z / CELL), c = Math.round(x / CELL), h = relevo(x, z);
  // o jogo ENTERRA a peça que está no relevo (|h| > 5 cm; a planta pequena, só um décimo da
  // altura dela — `placeDecor`). Na dúvida (perto dos 5 cm), não planta.
  if (Math.abs(h) > 0.03 && Math.abs(h) < 0.08) return false;
  const d = { prop, cel: [r, c], off: [+((x - c * CELL) / S).toFixed(3), +((z - r * CELL) / S).toFixed(3)] };
  d.giro = +entre(0, Math.PI * 2).toFixed(3);
  d.escala = +(escala * (c >= 55 ? NOS_CAMPOS : 1)).toFixed(2);
  d.colisao = 0;
  novas.push(d);
  return true;
};
const touceira = (e, x, z) => {
  const n = Math.round(entre(e.n[0], e.n[1]));
  for (let i = 0, t = 0; i < n && t < n * 4; t++) {
    const a = entre(0, Math.PI * 2), d = Math.sqrt(rnd()) * e.raio;
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (livre(px, pz, 0.9) && planta(e.prop, px, pz, entre(e.escala[0], e.escala[1]))) i++;
  }
};
for (let r = 0; r < linhas.length; r++) for (let c = 0; c < linhas[r].length; c++) {
  if (ch(r, c) !== 'f') continue;
  const z0 = zona(c);
  if (rnd() > z0.chance) continue;
  const x = c * CELL + entre(-2.4, 2.4), z = r * CELL + entre(-2.4, 2.4);
  if (livre(x, z, 1.4)) touceira(sorteia(z0.lista), x, z);
}

// o TRIGAL: em volta do moinho, do lado mais chato
const moinho = antes.find((d) => d.prop === 'building_windmill_red');
if (moinho) {
  const [mx, mz] = lugar(moinho);
  let canteiros = 0;
  for (let i = 0; i < 60 && canteiros < 7; i++) {
    const a = entre(0, Math.PI * 2), d = entre(9, 17), x = mx + Math.cos(a) * d, z = mz + Math.sin(a) * d;
    if (!livre(x, z, 2.6)) continue;
    const dh = Math.max(...[[2, 0], [-2, 0], [0, 2], [0, -2]].map(([dx, dz]) => Math.abs(relevo(x + dx, z + dz) - relevo(x, z))));
    if (dh > 0.45) continue;                       // o canteiro é chato: em ladeira ele flutua
    if (novas.some((n) => n.prop === 'gi-Wheat02' && Math.hypot(lugar(n)[0] - x, lugar(n)[1] - z) < 4.2)) continue;
    if (planta('gi-Wheat02', x, z, entre(0.75, 0.9))) canteiros++;
    touceira(E('Wheat01', 1, [2, 4], [0.7, 0.9], 3.4), x, z);
  }
}

// ---- gravar: os .glb das peças usadas e o decor.json (um item por linha, como o editor grava)
const usadas = [...new Set([...novas, ...antes.filter((d) => d.troca)].map((d) => d.prop))].sort();
for (const p of usadas) fs.copyFileSync(`vegetacao-gi/${p}.glb`, `assets/dungeon/${p}.glb`);
// as linhas de antes ficam COMO ESTAVAM (o diff mostra só o que foi plantado)
const texto = fs.readFileSync('assets/decor.json', 'utf8');
const fimDeLinha = texto.includes('\r\n') ? '\r\n' : '\n';
const todas = texto.split(/\r?\n/);
const eItem = (l) => /^\s*\{"prop"/.test(l);
const a = todas.findIndex(eItem), b = todas.findLastIndex(eItem);
const deAntes = todas.slice(a, b + 1).filter(eItem).map((l) => l.replace(/,\s*$/, ''));
if (deAntes.length !== decor.itens.length) throw new Error('o decor.json não está com um item por linha — não sei regravar sem bagunçar');
const soltas = [...deAntes.filter((l, i) => decor.itens[i].solta), ...deAntes.filter((l, i) => decor.itens[i].de)];
const itens = [...deAntes.slice(0, antes.length).map((l, i) => trocadas.has(i) ? '    ' + JSON.stringify(antes[i]) : l), ...novas.map((d) => '    ' + JSON.stringify(d)), ...soltas];
fs.writeFileSync('assets/decor.json', [...todas.slice(0, a), ...itens.map((l, i) => l + (i < itens.length - 1 ? ',' : '')), ...todas.slice(b + 1)].join(fimDeLinha));

const conta = {};
for (const d of novas) conta[d.prop] = (conta[d.prop] || 0) + 1;
console.log(`${novas.length} peças plantadas (${antes.length} já estavam; ${trocadas.size} trocadas agora, ${antes.filter((d) => d.troca).length} trocadas ao todo), ${usadas.length} tipos:`);
console.log(Object.entries(conta).sort((a, b) => b[1] - a[1]).map(([p, n]) => `  ${p} ${n}`).join('\n'));
console.log('PROPS:', usadas.map((p) => `'${p}'`).join(', '));
