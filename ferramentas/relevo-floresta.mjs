// O RELEVO DA FLORESTA (04/10/2026) — a floresta, a mata e o acampamento (da masmorra
// até a entrada das WindHills) deixam de ser planos. Escreve os PONTOS do relevo
// (`relevo.<variante>.pontos`, passo 2 m — o formato do editor de cenas, que continua
// podendo esculpir por cima) nas células `f` da coluna 14 até a `ATE_COLUNA`, sem tocar
// nos pontos das WindHills (dali para leste).
//
// O desenho, por ponto (x, z):
//   • ONDULAÇÃO: ruído suave em três escalas (~34 m, ~15 m, ~7 m), determinístico;
//   • ENCOSTAS: o chão sobe perto das paredes de rocha (a floresta vira um vale, e as
//     árvores e pedras da borda ficam no alto);
//   • A ESTRADA (linhas 15–17) ondula menos: é por onde se anda;
//   • O ACAMPAMENTO (colunas 40+) quase plano, e plano em volta da fogueira;
//   • A ESTRADA CALÇADA em frente à masmorra nivelada (as placas de pedra são retas);
//   • ZERO perto de toda célula aberta que não é `f` (a entrada da masmorra, a escada do
//     terraço): ali o chão tem de encontrar o piso de pedra na mesma altura.
//
// Uso (da raiz do jogo): node ferramentas/relevo-floresta.mjs [variante]
// Roda de novo sem acumular: recalcula a região inteira (e apaga o que havia nela).
import fs from 'node:fs';

const CELL = 6, PASSO = 2;
const DE_COLUNA = 14, ATE_COLUNA = 53;    // as WindHills começam na 55 (o relevo delas vai a zero ali)
const FOGUEIRA_ACAMPAMENTO = [16, 47.5];  // [linha, coluna] (a tag `acampamento` dos marcos)

const arq = 'assets/mapa.json';
const mapa = JSON.parse(fs.readFileSync(arq, 'utf8'));
const variante = process.argv[2] ?? mapa.ativo;
const linhas = mapa.mapas[variante];
const rel = mapa.relevo?.[variante];
if (!rel?.pontos) throw new Error(`relevo.${variante} sem pontos — rode o relevo-para-pontos.mjs antes`);
const ch = (r, c) => linhas[r]?.[c] ?? '#';

// --- ruído de valor, suave e determinístico
const hash = (i, k) => { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const suave = (t) => t * t * (3 - 2 * t);
function ruido(x, z) {
  const i = Math.floor(x), k = Math.floor(z), tx = suave(x - i), tz = suave(z - k);
  const a = hash(i, k), b = hash(i + 1, k), c = hash(i, k + 1), d = hash(i + 1, k + 1);
  return (a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz) * 2 - 1;   // −1..1
}
const ondulacao = (x, z) => 0.6 * ruido(x / 34 + 3.1, z / 34 + 7.7) + 0.3 * ruido(x / 15 - 2.3, z / 15 + 1.9) + 0.1 * ruido(x / 7 + 5.5, z / 7 - 4.2);
const passo01 = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };

// distância (m) do ponto até a célula mais perto que satisfaz `teste`, procurando até `viz` células
function distAte(x, z, teste, viz = 3) {
  const cr = Math.round(z / CELL), cc = Math.round(x / CELL);
  let melhor = Infinity;
  for (let dr = -viz; dr <= viz; dr++) for (let dc = -viz; dc <= viz; dc++) {
    const r = cr + dr, c = cc + dc;
    if (!teste(ch(r, c))) continue;
    const dx = Math.max(Math.abs(x - c * CELL) - CELL / 2, 0), dz = Math.max(Math.abs(z - r * CELL) - CELL / 2, 0);
    melhor = Math.min(melhor, Math.hypot(dx, dz));
  }
  return melhor;
}
const rocha = (t) => t === '#';
const abertaNaoF = (t) => t !== '#' && t !== 'f';

function altura(x, z) {
  const col = x / CELL, lin = z / CELL;
  // quanto ondula: a floresta e a mata bem, o acampamento quase nada
  const acamp = passo01(37, 41, col);
  const amp = 2.6 * (1 - acamp) + 0.35 * acamp;
  // a estrada (linha 16 ± 1,5) ondula menos
  const estrada = 1 - 0.6 * (1 - passo01(1.2, 2.6, Math.abs(lin - 16)));
  let h = amp * ondulacao(x, z) * estrada;
  // as encostas: o chão sobe perto da rocha
  const dRocha = distAte(x, z, rocha);
  h += (2.4 * (1 - acamp) + 0.6 * acamp) * (1 - passo01(0, 11, dRocha));
  h = Math.max(h, -0.5);
  // zero junto da masmorra e da escada do terraço (o chão encontra o piso de pedra)
  h *= passo01(0, 9, distAte(x, z, abertaNaoF));
  // a ESTRADA CALÇADA em frente à masmorra (as placas de pedra da linha 16, colunas
  // 15–22, no decor.json) é nivelada: placa reta não acompanha encosta
  const calcada = (1 - passo01(22.5, 25, col)) * (1 - passo01(3.5, 7, Math.abs(z - 16 * CELL)));
  h *= 1 - calcada;
  // plano em volta da fogueira do acampamento
  const [fr, fc] = FOGUEIRA_ACAMPAMENTO;
  h *= passo01(4, 10, Math.hypot(x - fc * CELL, z - fr * CELL));
  // vai a zero perto da borda leste (onde começa o relevo das WindHills)
  h *= 1 - passo01(ATE_COLUNA - 2, ATE_COLUNA + 0.5, col);
  return h;
}

const pontos = rel.pontos;
const xMin = (DE_COLUNA - 0.5) * CELL, xMax = (ATE_COLUNA + 0.5) * CELL;
let escritos = 0, apagados = 0, hMax = 0;
for (const k of Object.keys(pontos)) {
  const [i] = k.split(',').map(Number);
  if (i * PASSO >= xMin && i * PASSO <= xMax) { delete pontos[k]; apagados++; }
}
for (let k = 0; k * PASSO <= linhas.length * CELL; k++) {
  for (let i = Math.ceil(xMin / PASSO); i * PASSO <= xMax; i++) {
    const x = i * PASSO, z = k * PASSO;
    // só os nós que tocam alguma célula de ar livre
    const perto = [[0, 0], [1, 0], [0, 1], [1, 1]].some(([a, b]) => ch(Math.round((z + (b - 0.5) * PASSO) / CELL), Math.round((x + (a - 0.5) * PASSO) / CELL)) === 'f');
    if (!perto) continue;
    const h = Math.round(altura(x, z) * 100) / 100;
    if (Math.abs(h) < 0.01) continue;
    pontos[`${i},${k}`] = h; escritos++; hMax = Math.max(hMax, h);
  }
}

// gravado como o editor grava (os campos extras em JSON de 2 espaços)
const extras = Object.entries(mapa).filter(([k]) => !['_leiame', 'ativo', 'mapas'].includes(k))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')},\n`).join('');
const partes = Object.entries(mapa.mapas).map(([nome, ls]) => `    ${JSON.stringify(nome)}: [\n${ls.map((l) => `      ${JSON.stringify(l)}`).join(',\n')}\n    ]`);
fs.writeFileSync(arq, `{\n  "_leiame": ${JSON.stringify(mapa._leiame)},\n  "ativo": ${JSON.stringify(mapa.ativo)},\n${extras}  "mapas": {\n${partes.join(',\n')}\n  }\n}\n`);
console.log(`relevo.${variante}: ${escritos} pontos na floresta (apagados ${apagados} antigos da região), altura máx ${hMax.toFixed(2)} m`);
