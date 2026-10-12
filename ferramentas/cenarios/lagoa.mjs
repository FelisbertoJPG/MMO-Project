// OS CENÁRIOS DA PLANÍCIE NORTE DAS WINDHILLS (11/10/2026) — a LAGOA de água rasa (com a ilhota
// de pedra no meio) e o POSTO dos mercadores na margem sul. No jeito das referências que o dono
// do projeto trouxe: enseada de água turquesa, areia, juncos, pedras, e um acampamento de tendas.
//
// O que faz (tudo determinístico; pode rodar de novo):
//   - ESCULPE a bacia no relevo (`mapa.json` → `relevo.floresta.pontos`): só ABAIXA o chão (rodar
//     de novo não cava mais), o fundo a ~70 cm da superfície e uma praia suave em volta;
//   - grava a ÁGUA (`mapa.json` → `agua.floresta`: o nível e a caixa de cada espelho d'água). Quem
//     desenha a água, a areia e as vitórias-régias é o jogo (`js/agua.js`, `corDoChao`);
//   - TIRA DE DENTRO d'água, no mesmo índice, as árvores, as moitas e as flores que estavam ali
//     (vão para a margem; as flores da beirada viram junco) e abre espaço para as tendas;
//   - PÕE as peças dos cenários no FIM do `decor.json`, marcadas com `"de": "lagoa"` / `"posto"`
//     (as de uma rodada anterior saem antes). O `plantar.mjs` e o `trocar.mjs` as mantêm no fim.
// Depois dele, rode o `ferramentas/lowpoly/trocar.mjs`: ele tira as pedrinhas de dentro das tendas.
//
// Uso (da raiz do jogo): node ferramentas/cenarios/lagoa.mjs
import fs from 'node:fs';

const CELL = 6, S = 1.5;
const LAGOA = { nome: 'lagoa', cx: 446, cz: 27, rx: 30, rz: 15, nivel: -0.3, fundo: 0.7 };   // metros
const POSTO = { cx: 458, cz: 51, raio: 10 };

const arqMapa = 'assets/mapa.json', arqDecor = 'assets/decor.json';
const mapa = JSON.parse(fs.readFileSync(arqMapa, 'utf8'));
const linhasDoMapa = mapa.mapas.floresta, rel = mapa.relevo.floresta, pp = rel.passo;
const ch = (r, c) => linhasDoMapa[r]?.[c] ?? '#';
const chEm = (x, z) => ch(Math.round(z / CELL), Math.round(x / CELL));

let semente = 20261013;
const rnd = () => ((semente = (semente * 1664525 + 1013904223) >>> 0) / 4294967296);
const entre = (a, b) => a + rnd() * (b - a);
const um = (l) => l[Math.floor(rnd() * l.length)];

// ---- a forma da lagoa: 0 no meio, 1 na beira d'água (uma elipse de borda ondulada)
const dist = (x, z) => {
  const dx = (x - LAGOA.cx) / LAGOA.rx, dz = (z - LAGOA.cz) / LAGOA.rz, g = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) / (1 + 0.14 * Math.sin(3 * g + 1.3) + 0.07 * Math.sin(5 * g + 0.4));
};
const paraFora = (x, z, d) => {       // o ponto na mesma direção, na distância `d` da forma
  const k = d / Math.max(dist(x, z), 1e-3);
  return [LAGOA.cx + (x - LAGOA.cx) * k, LAGOA.cz + (z - LAGOA.cz) * k];
};

// ---- esculpir (só abaixa)
const PRAIA = 1.28;      // até onde vai a praia (na distância da forma)
const teto = (d) => d < 1 ? LAGOA.nivel - LAGOA.fundo * (1 - d * d) ** 0.7 : LAGOA.nivel + ((d - 1) / (PRAIA - 1)) * 0.42;
let cavados = 0;
for (let i = Math.floor((LAGOA.cx - LAGOA.rx * 1.6) / pp); i <= Math.ceil((LAGOA.cx + LAGOA.rx * 1.6) / pp); i++) {
  for (let k = Math.floor((LAGOA.cz - LAGOA.rz * 1.6) / pp); k <= Math.ceil((LAGOA.cz + LAGOA.rz * 1.6) / pp); k++) {
    const x = i * pp, z = k * pp, d = dist(x, z);
    if (d >= PRAIA) continue;
    const antes = rel.pontos[`${i},${k}`] ?? 0, novo = Math.min(antes, +teto(d).toFixed(2));
    if (novo !== antes) { rel.pontos[`${i},${k}`] = novo; cavados++; }
  }
}
const no = (i, k) => { const v = rel.pontos[`${i},${k}`]; return Number.isFinite(v) ? v : 0; };
const relevo = (x, z) => {
  const fx = x / pp, fz = z / pp, i = Math.floor(fx), k = Math.floor(fz), tx = fx - i, tz = fz - k;
  return no(i, k) * (1 - tx) * (1 - tz) + no(i + 1, k) * tx * (1 - tz) + no(i, k + 1) * (1 - tx) * tz + no(i + 1, k + 1) * tx * tz;
};
mapa.agua = { ...(mapa.agua ?? {}), _leiame: 'Os espelhos d\'agua de cada variante (js/agua.js): o nivel (m) e a caixa [x0, z0, x1, z1] em metros. A agua aparece onde o chao da caixa esta abaixo do nivel. Gravado por ferramentas/cenarios/lagoa.mjs.' };
mapa.agua.floresta = [{ nome: LAGOA.nome, nivel: LAGOA.nivel,
  caixa: [LAGOA.cx - LAGOA.rx * 1.25, LAGOA.cz - LAGOA.rz * 1.3, LAGOA.cx + LAGOA.rx * 1.25, LAGOA.cz + LAGOA.rz * 1.3].map((v) => Math.round(v)) }];

// ---- o decor.json, linha a linha
const texto = fs.readFileSync(arqDecor, 'utf8'), fimDeLinha = texto.includes('\r\n') ? '\r\n' : '\n';
const todas = texto.split(/\r?\n/);
const eItem = (l) => /^\s*\{"prop"/.test(l);
const a = todas.findIndex(eItem), b = todas.findLastIndex(eItem);
let itens = todas.slice(a, b + 1).filter(eItem).map((l) => ({ linha: l.replace(/,\s*$/, ''), d: JSON.parse(l.replace(/,\s*$/, '')) }));
itens = itens.filter((x) => x.d.de !== 'lagoa' && x.d.de !== 'posto');       // as de uma rodada anterior

const lugar = (d) => [d.cel[1] * CELL + (d.off?.[0] ?? 0) * S, d.cel[0] * CELL + (d.off?.[1] ?? 0) * S];
const arr = (v) => { const n = Math.round(v * 1000) / 1000; return Object.is(n, -0) ? 0 : n; };
/** Põe `d` em (x, z): a célula e o deslocamento pela conta do jogo (e do decorador). */
const mudar = (d, x, z) => {
  x = Math.round(x / S * 1000) * S / 1000; z = Math.round(z / S * 1000) * S / 1000;
  const r = Math.round(z / CELL), c = Math.round(x / CELL);
  d.cel = [r, c]; d.off = [arr((x - c * CELL) / S), arr((z - r * CELL) / S)];
};
const ordem = ['prop', 'cel', 'off', 'giro', 'y', 'escala', 'colisao', 'flip', 'ger', 'troca', 'solta', 'de'];
const linhaDe = (d) => '    ' + JSON.stringify(Object.fromEntries(ordem.filter((k) => d[k] !== undefined).map((k) => [k, d[k]])));

// ---- tirar de dentro d'água (e de onde vão as tendas) o que já estava
const TENDAS = [[449, 53.5, 0.35], [458.5, 55.5, 0], [468, 53, -0.4]];     // x, z, giro
const noPosto = (x, z, folga) => TENDAS.some(([tx, tz]) => Math.hypot(x - tx, z - tz) < folga);
let movidas = 0, juncos = 0;
for (const it of itens) {
  const d = it.d, [x, z] = lugar(d), dd = dist(x, z);
  const arvore = /Tree(?!Stump)/.test(d.prop), moita = /Bush/.test(d.prop), flor = d.prop.startsWith('gi-'), pedra = /(^|-)Rock_/.test(d.prop);
  if (!arvore && !moita && !flor && !pedra) continue;
  let nx = null, nz = null;
  if (dd < 1.04 && !pedra && !d.solta) {
    if (flor && dd > 0.84) {                       // a flor da beirada vira junco (fica na água rasa)
      if (!/Grass_Reed|HorseTail/.test(d.prop)) { d.prop = rnd() < 0.65 ? 'gi-Grass_Reed' : 'gi-HorseTail'; d.escala = +(d.prop.endsWith('Reed') ? entre(0.95, 1.3) : entre(0.6, 0.8)).toFixed(2); it.linha = linhaDe(d); juncos++; }
      continue;
    }
    for (let t = 0; t < 12 && nx === null; t++) {  // para a margem, na mesma direção (com um desvio se não couber)
      const [px, pz] = paraFora(x + entre(-1, 1) * t, z + entre(-1, 1) * t, entre(arvore ? 1.42 : 1.3, arvore ? 1.75 : 1.55));
      if (chEm(px, pz) === 'f' && chEm(px + 1.5, pz) === 'f' && chEm(px - 1.5, pz) === 'f' && chEm(px, pz + 1.5) === 'f' && chEm(px, pz - 1.5) === 'f' && !noPosto(px, pz, 6.5)) { nx = px; nz = pz; }
    }
    if (nx === null) [nx, nz] = paraFora(x, z, 1.35);
  } else if (noPosto(x, z, arvore ? 5.5 : pedra ? 4.2 : 3.2) && !d.solta) {
    // para fora do posto (longe das tendas e da praia: rodar de novo não a move outra vez)
    for (let t = 0; t < 40 && nx === null; t++) {
      const g = Math.atan2(z - POSTO.cz, x - POSTO.cx) + entre(-0.3, 0.3) * (1 + t / 4), r = POSTO.raio + entre(3, 7) + t / 4;
      const px = POSTO.cx + Math.cos(g) * r, pz = POSTO.cz + Math.sin(g) * r;
      if (chEm(px, pz) === 'f' && dist(px, pz) > 1.32 && !noPosto(px, pz, 6.5)) { nx = px; nz = pz; }
    }
  }
  if (nx === null) continue;
  mudar(d, nx, nz); it.linha = linhaDe(d); movidas++;
}

// ---- as peças novas (o sorteio recomeça: o que foi movido acima não muda o que se põe aqui)
semente = 4099;
const novas = [];
const por = (de, prop, x, z, { giro = entre(0, Math.PI * 2), escala = 1, colisao = 0, y } = {}) => {
  const d = { prop }; mudar(d, x, z);
  d.giro = +giro.toFixed(3);
  if (y) d.y = +y.toFixed(3);
  if (escala !== 1) d.escala = +escala.toFixed(3);
  d.colisao = +colisao.toFixed(2); d.de = de;
  novas.push(d);
};
// a LAGOA: juncos em touceiras na água rasa, pedras na beira e dentro, seixos na areia
for (let n = 0; n < 34; n++) {
  const g = entre(0, Math.PI * 2), [x, z] = paraFora(LAGOA.cx + Math.cos(g) * 10, LAGOA.cz + Math.sin(g) * 10, entre(0.86, 1.0));
  if (chEm(x, z) !== 'f' || noPosto(x, z, 9)) continue;
  for (let k = Math.floor(entre(2, 5.5)); k > 0; k--) {
    const px = x + entre(-1.3, 1.3), pz = z + entre(-1.3, 1.3);
    if (chEm(px, pz) !== 'f' || dist(px, pz) > 1.03) continue;
    rnd() < 0.7 ? por('lagoa', 'gi-Grass_Reed', px, pz, { escala: entre(0.95, 1.4) }) : por('lagoa', 'gi-HorseTail', px, pz, { escala: entre(0.6, 0.85) });
  }
}
const PEDRAS = ['lp-Rock_2', 'lp-Rock_4', 'lp-Rock_5', 'lp-Rock_N1', 'lp-Rock_N2', 'lp-Rock_N5', 'lp-Rock_N6', 'lp-Rock_N8', 'lp-Rock_N9', 'lp-Rock_N10'];
for (let n = 0; n < 26; n++) {
  const g = entre(0, Math.PI * 2), [x, z] = paraFora(LAGOA.cx + Math.cos(g) * 10, LAGOA.cz + Math.sin(g) * 10, rnd() < 0.35 ? entre(0.3, 0.8) : entre(0.92, 1.12));
  if (chEm(x, z) !== 'f' || noPosto(x, z, 8)) continue;
  const grande = rnd() < 0.3;
  por('lagoa', um(PEDRAS), x, z, { escala: grande ? entre(0.5, 0.85) : entre(0.16, 0.36), colisao: grande ? 1 : 0 });
  if (grande) for (let k = Math.floor(entre(1, 3.5)); k > 0; k--) por('lagoa', um(PEDRAS), x + entre(-2.2, 2.2), z + entre(-2.2, 2.2), { escala: entre(0.1, 0.22) });
}
for (let n = 0; n < 16; n++) {
  const g = entre(0, Math.PI * 2), [x, z] = paraFora(LAGOA.cx + Math.cos(g) * 10, LAGOA.cz + Math.sin(g) * 10, entre(1.05, 1.22));
  if (chEm(x, z) === 'f' && !noPosto(x, z, 6)) por('lagoa', `lp-Rock_Seixos_${1 + Math.floor(rnd() * 4)}`, x, z, { escala: entre(0.6, 0.95) });
}
// a ILHOTA: as células de rocha no meio da lagoa viram um rochedo (pedras altas, a base dentro d'água)
const ALTAS = ['lp-Rock_N3', 'lp-Rock_N4', 'lp-Rock_6', 'lp-Rock_N2'];
for (let r = 0; r < linhasDoMapa.length; r++) for (let c = 55; c < linhasDoMapa[r].length; c++) {
  if (ch(r, c) === 'f' || dist(c * CELL, r * CELL) > 1.1) continue;
  for (let k = 0; k < 3; k++) {
    const prop = k === 0 ? um(ALTAS.slice(0, 3)) : um(ALTAS);
    por('lagoa', prop, c * CELL + entre(-2.4, 2.4), r * CELL + entre(-2.4, 2.4), { escala: k === 0 ? entre(1.2, 1.7) : entre(0.7, 1.15), y: -0.5 / S });
  }
  por('lagoa', um(PEDRAS), c * CELL + entre(-3.4, 3.4), r * CELL + entre(-3.4, 3.4), { escala: entre(0.5, 0.9), y: -0.4 / S });
}

// o POSTO dos mercadores: três tendas em arco viradas para a lagoa, a carga no meio, o caminho de pedras até a água
for (const [x, z, giro] of TENDAS) {
  por('posto', 'tent', x, z, { giro, escala: 6, colisao: 1.7 });
  por('posto', 'bed_floor', x + Math.sin(giro) * 0.4, z + 0.2, { giro: giro + Math.PI / 2 });
}
const P = (prop, dx, dz, o = {}) => por('posto', prop, POSTO.cx + dx, POSTO.cz + dz, o);
P('crates_stacked', -3.2, -1.6, { giro: 0.4, colisao: 1.2 });
P('crate_open', -1.5, -2.4, { giro: 2, escala: 5, colisao: 0.8 });
P('box_stacked', -4.6, -0.2, { giro: 1.1, colisao: 1 });
P('barrel_large', 2.6, -2.2, { colisao: 0.7 });
P('barrel_small', 3.7, -1.5, { colisao: 0.55 });
P('barrel_small', 3.1, -3.2, { colisao: 0.55 });
P('keg', 1.5, -3.0, { giro: 0.6, colisao: 0.6 });
P('sack', -2.4, -3.4, { giro: 2.0, escala: 6 });
P('sack', -3.3, -3.1, { giro: 0.7, escala: 6 });
P('sack', 4.4, -2.6, { giro: 1.4, escala: 6 });
P('weaponrack', 6.3, 0.4, { giro: -1.2, escala: 6, colisao: 0.7 });
P('wheelbarrow', -6.4, -2.6, { giro: 0.9, escala: 4, colisao: 0.7 });
P('bucket_water', 0.4, -4.8, { giro: 1.9, escala: 4, colisao: 0.3 });
P('resource_lumber', -7.6, 1.6, { giro: 0.5, escala: 4.5, colisao: 1.1 });
P('stool', -0.9, -0.4, { giro: 0.3, colisao: 0.3 });
P('stool', 0.9, -0.2, { giro: 2.1, colisao: 0.3 });
P('natureza-WoodLog', 0, 1.2, { giro: 1.57, colisao: 0.5 });
P('target', 11.5, -1.5, { giro: -1.57, escala: 6, colisao: 0.6 });
P('fence_wood_straight', -9.6, -4.4, { giro: 0.5, escala: 2.4, colisao: 1.1 });
P('fence_wood_straight', -6.8, -6.0, { giro: 0.25, escala: 2.4, colisao: 1.1 });
P('fence_wood_straight', 7.4, -5.8, { giro: -0.3, escala: 2.4, colisao: 1.1 });
P('fence_wood_straight', 10.2, -4.2, { giro: -0.6, escala: 2.4, colisao: 1.1 });
// (a pedra de caminho deixa terra batida em volta — `NA_TERRA` no campo.js)
for (let k = 0; k < 6; k++) P('megakit-RockPath_Round_Wide', Math.sin(k * 1.3) * 0.9 - 0.4, -1.2 - k * 1.55, { escala: entre(1.7, 2.1) });
for (const [dx, dz] of [[-2.2, 0.8], [2.2, 0.9], [0, 2.9], [-4.4, 2.2], [4.6, 2.0]]) P('megakit-RockPath_Round_Wide', dx, dz, { escala: entre(1.7, 2.1) });

// ---- gravar
const linhas = [...itens.map((x) => x.linha), ...novas.map(linhaDe)];
const novo = [...todas.slice(0, a), ...linhas.map((l, i) => l + (i < linhas.length - 1 ? ',' : '')), ...todas.slice(b + 1)].join(fimDeLinha);
JSON.parse(novo);
fs.writeFileSync(arqDecor, novo);

// o mapa.json na forma em que o editor de cenas o grava (`mapaParaTexto` do js/mapa.js de lá)
const partes = Object.entries(mapa.mapas).map(([nome, ls]) => `    ${JSON.stringify(nome)}: [\n${ls.map((l) => `      ${JSON.stringify(l)}`).join(',\n')}\n    ]`);
const extras = Object.entries(mapa).filter(([k, v]) => !['_leiame', 'ativo', 'mapas'].includes(k) && v && typeof v === 'object')
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')},\n`).join('');
const textoMapa = fs.readFileSync(arqMapa, 'utf8');
const saida = '{\n' + `  "_leiame": ${JSON.stringify(mapa._leiame)},\n` + `  "ativo": ${JSON.stringify(mapa.ativo)},\n` + extras + '  "mapas": {\n' + partes.join(',\n') + '\n  }\n}\n';
JSON.parse(saida);
fs.writeFileSync(arqMapa, textoMapa.includes('\r\n') ? saida.replace(/\n/g, '\r\n') : saida);

const conta = {};
for (const d of novas) conta[d.de] = (conta[d.de] ?? 0) + 1;
console.log(`bacia: ${cavados} pontos abaixados · ${movidas} peças tiradas da água e do posto · ${juncos} flores viraram junco`);
console.log(`peças novas: ${Object.entries(conta).map(([k, v]) => `${k} ${v}`).join(', ')} · ${itens.length + novas.length} itens ao todo`);
console.log(`fundo mais baixo: ${Math.min(...Object.values(rel.pontos)).toFixed(2)} m · água em ${LAGOA.nivel} m`);
