// Converte o RELEVO de colinas (`relevo.<variante>.colinas`, o que o gerar-colinas.mjs
// escreveu) para PONTOS no formato do editor de cenas (`passo` 2 m, `pontos` {"i,k": m}),
// que é o que o decorador do editor esculpe. A conta é a mesma do world.js
// (montarRelevo, ramo das colinas): a soma das colinas, indo a zero perto da rocha e da
// borda da área. Os pontos ficam no mapa.json junto das colinas (que passam a ser só
// histórico: com `pontos`, o jogo os usa e ignora as colinas).
//
// Uso (da raiz do jogo): node ferramentas/relevo-para-pontos.mjs [variante]
import fs from 'node:fs';

const CELL = 6, PASSO = 2;
const arq = 'assets/mapa.json';
const mapa = JSON.parse(fs.readFileSync(arq, 'utf8'));
const variante = process.argv[2] ?? mapa.ativo;
const rel = mapa.relevo?.[variante], linhas = mapa.mapas[variante];
if (!rel?.colinas?.length) throw new Error(`sem colinas em relevo.${variante}`);
if (rel.pontos) throw new Error(`relevo.${variante} já tem pontos — apague-os antes, se quer refazer`);
const ch = (r, c) => linhas[r]?.[c] ?? '#';
const [[r0, c0], [r1, c1]] = rel.area, borda = (rel.borda ?? 2) * CELL, viz = Math.ceil(rel.borda ?? 2) + 1;
const dentro = (r, c) => r >= r0 && r <= r1 && c >= c0 && c <= c1 && ch(r, c) === 'f';
const altura = (x, z) => {
  const cr = Math.round(z / CELL), cc = Math.round(x / CELL);
  if (!dentro(cr, cc) && ![[0, 1], [1, 0], [0, -1], [-1, 0]].some(([a, b]) => dentro(cr + a, cc + b))) return 0;
  let dist = borda;
  for (let dr = -viz; dr <= viz; dr++) for (let dc = -viz; dc <= viz; dc++) {
    const rr = cr + dr, c2 = cc + dc;
    if (dentro(rr, c2)) continue;
    const dx = Math.max(Math.abs(x - c2 * CELL) - CELL / 2, 0), dz = Math.max(Math.abs(z - rr * CELL) - CELL / 2, 0);
    dist = Math.min(dist, Math.hypot(dx, dz));
  }
  if (dist <= 0) return 0;
  let alt = 0;
  for (const col of rel.colinas) {
    const d = Math.hypot(z / CELL - col.centro[0], x / CELL - col.centro[1]) / col.raio;
    if (d >= 1) continue;
    const p = col.plano ?? 0, t = d <= p ? 0 : (d - p) / (1 - p);
    alt += col.altura * 0.5 * (1 + Math.cos(Math.PI * t));
  }
  const s = Math.min(1, dist / borda);
  return alt * s * s * (3 - 2 * s);
};
const pontos = {};
const iMin = Math.floor((c0 - 1) * CELL / PASSO), iMax = Math.ceil((c1 + 1) * CELL / PASSO);
const kMin = Math.floor((r0 - 1) * CELL / PASSO), kMax = Math.ceil((r1 + 1) * CELL / PASSO);
for (let k = kMin; k <= kMax; k++) for (let i = iMin; i <= iMax; i++) {
  const h = Math.round(altura(i * PASSO, k * PASSO) * 100) / 100;
  if (Math.abs(h) >= 0.01) pontos[`${i},${k}`] = h;
}
rel.passo = PASSO;
rel.pontos = pontos;
rel._leiame = 'O RELEVO desta variante. `pontos` (passo em m; "i,k" = o nó em x = i*passo, z = k*passo; altura em m) é o chão de verdade — o decorador do editor de cenas o esculpe, e o jogo o usa em todas as células f. `colinas`/`area`/`borda` são de onde os pontos saíram (relevo-para-pontos.mjs); `area` ainda diz onde é o clima dos campos.';

// gravado no formato do editor (os campos extras com JSON de 2 espaços; os pontos numa linha só)
const extras = Object.entries(mapa).filter(([k]) => !['_leiame', 'ativo', 'mapas'].includes(k))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')},\n`).join('');
const partes = Object.entries(mapa.mapas).map(([nome, ls]) => `    ${JSON.stringify(nome)}: [\n${ls.map((l) => `      ${JSON.stringify(l)}`).join(',\n')}\n    ]`);
fs.writeFileSync(arq, `{\n  "_leiame": ${JSON.stringify(mapa._leiame)},\n  "ativo": ${JSON.stringify(mapa.ativo)},\n${extras}  "mapas": {\n${partes.join(',\n')}\n  }\n}\n`);
console.log(`relevo.${variante}: ${Object.keys(pontos).length} pontos (passo ${PASSO} m), altura máx ${Math.max(...Object.values(pontos)).toFixed(2)} m`);
