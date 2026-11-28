// AS ARMADURAS DE ARQUIVO (26/11/2026; o dono: "começar a implementar as armaduras low poly que combinem com o estilo dos nossos
// dois personagens … cada peça do corpo separada", e da 1ª, o peitoral da Meshy: "pinta sem ser pelo meshy, e já implementa no
// localhost o personagem masculino usando ela"). Uma malha pronta (.glb, sem pintura) VESTIDA SOZINHA num corpo de arquivo:
//   node ferramentas/armadura-de-arquivo/vestir.mjs <config> [--foto <png>] [--tamanho <largura,altura,profundidade>] [--previa <saida.json>]
// (`--tamanho` vale no lugar do `tamanho` do config; `--previa` grava a armadura nesse arquivo, sem tocar no jogo nem na lista: a
// prévia do TAMANHO na aba Modelo/Armaduras do editor, seção CORPO, "player")
// (Para pôr a peça À MÃO — mover, girar, redimensionar, cortar —, a aba Armaduras do Editor de Personagem e o "virar armadura":
// da-colagem.mjs.) O config (ferramentas/armadura-de-arquivo/<id>.json) diz o .glb, o corpo, o lugar + conjunto (o item que a veste)
// e as tintas. Passos: (1) ENCAIXA — a altura vai de `baixo` a `alto` (cm no corpo); a largura e o fundo saem de medir o tronco do
// corpo e o da peça abaixo dos braços (raios), com `vao` de folga; (2) as MANGAS: a Meshy as faz caídas, presas ao tronco — a peça é
// vestida no corpo com os braços `bracos` graus abaixo da horizontal e, no fim, volta à pose T pela conta inversa dos mesmos pesos;
// (3) a PELE: o ponto a menos de `folga` da pele sai até `folga`, o que está a mais de `longe` é puxado para perto (o deslocamento é
// alisado pelos vizinhos: as costuras e as alças não amassam) e, no fim, nada fica dentro da pele; as peças soltas (as fivelas) vão
// juntas com o ponto mais perto; (4) os PESOS (pele.mjs `pesosPelaPele`); (5) a PINTURA: uma cor por triângulo (couro, ombreiras,
// cinto, barra, fivelas). Grava assets/armaduras-de-arquivo/<id>.json e o põe na lista (pele.mjs `gravarArmadura`).
import fs from 'fs';
import path from 'path';
import { prancha } from '../corpo-de-arquivo/foto.mjs';
import { lerCorpo, pele, soldar, pesosPelaPele, peleCoberta, raio, gravarArmadura, pt, sub, cross, dot, media } from './pele.mjs';

const args = process.argv.slice(2), opcao = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null), fotoEm = opcao('--foto'), previaEm = opcao('--previa');
const arqConfig = args.find((a) => a.endsWith('.json'));
if (!arqConfig) { console.log('uso: node ferramentas/armadura-de-arquivo/vestir.mjs <config.json> [--foto <png>]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.resolve(arqConfig), 'utf8'));
const dirCfg = path.dirname(path.resolve(arqConfig));
// O TAMANHO (28/11/2026; o dono: "redimensionar apenas o peitoral no modelo"): { largura, altura, profundidade } — quanto a peça cresce
// (1 = como o encaixe a deixa), em volta do meio dela, com os braços baixados (a pose em que ela é vestida); depois disso nada fica
// dentro da pele (o último passo da pele) e a pele escondida é medida de novo
if (opcao('--tamanho')) { const [largura, altura, profundidade] = opcao('--tamanho').split(',').map(Number); cfg.tamanho = { largura, altura, profundidade }; }
const tamanho = ['largura', 'altura', 'profundidade'].map((k) => cfg.tamanho?.[k] ?? 1);
if (tamanho.some((x) => !Number.isFinite(x) || x < 0.5 || x > 1.5)) { console.log('o tamanho vai de 0,5 a 1,5 (largura, altura, profundidade)'); process.exit(1); }

// ------------------------------------------------------------------ ler
function lerGlb(arq) {
  const buf = fs.readFileSync(arq), jl = buf.readUInt32LE(12), J = JSON.parse(buf.slice(20, 20 + jl).toString()), BIN = buf.slice(20 + jl + 8);
  const acc = (i) => {
    const a = J.accessors[i], v = J.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType], off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new T(BIN.buffer.slice(BIN.byteOffset + off, BIN.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT));
  };
  const pos = [], idx = [];
  for (const no of J.nodes) {
    if (no.mesh === undefined) continue;
    if (no.matrix || no.rotation || no.scale || no.translation) throw new Error('o nó da malha tem transformação: esta ferramenta não a aplica');
    for (const p of J.meshes[no.mesh].primitives) {
      const P = acc(p.attributes.POSITION), base = pos.length / 3;
      for (const v of P) pos.push(v * 100);   // (m → cm)
      const I = p.indices !== undefined ? acc(p.indices) : Array.from({ length: P.length / 3 }, (_, k) => k);
      for (const i of I) idx.push(base + i);
    }
  }
  return { pos: new Float32Array(pos), idx: Uint32Array.from(idx) };
}
const corpo = lerCorpo(cfg.corpo);
const peca = lerGlb(path.join(dirCfg, cfg.glb));
// (APAGAR — 28/11/2026, o dono marcou na peça solta "remover malha": "essas malhas podem literalmente ser deletadas": `apagar` = o meio de
// cada triângulo que sai da peça ANTES de tudo — cm, no espaço da peça como ela abre no editor: o .glb × 100, o pé em y = 0 —; os pontos
// que ficam sem triângulo saem junto)
if (Array.isArray(cfg.apagar) && cfg.apagar.length) {
  const P0 = peca.pos, I0 = peca.idx, pe0 = Math.min(...P0.filter((_, i) => i % 3 === 1)), fora = new Set();
  const marcas = cfg.apagar.filter((m) => Array.isArray(m) && m.length === 3 && m.every(Number.isFinite));
  for (let t = 0; t < I0.length / 3; t++) {
    const c = [0, 1, 2].map((k) => (P0[I0[t * 3] * 3 + k] + P0[I0[t * 3 + 1] * 3 + k] + P0[I0[t * 3 + 2] * 3 + k]) / 3);
    c[1] -= pe0;
    if (marcas.some((m) => Math.abs(m[0] - c[0]) < 0.02 && Math.abs(m[1] - c[1]) < 0.02 && Math.abs(m[2] - c[2]) < 0.02)) fora.add(t);
  }
  const novo = new Map(), pos = [], idx = [];
  for (let t = 0; t < I0.length / 3; t++) {
    if (fora.has(t)) continue;
    for (let q = 0; q < 3; q++) { const v = I0[t * 3 + q]; if (!novo.has(v)) { novo.set(v, pos.length / 3); pos.push(P0[v * 3], P0[v * 3 + 1], P0[v * 3 + 2]); } idx.push(novo.get(v)); }
  }
  peca.pos = Float32Array.from(pos); peca.idx = Uint32Array.from(idx);
  console.log(`apagar: ${fora.size} de ${marcas.length} triângulos marcados saíram da peça (ficam ${idx.length / 3})`);
}

// (o raio — Möller–Trumbore — mora no pele.mjs, com a pele que a peça cobre)
// o tronco numa altura: meia largura (no fundo do meio), frente e costas (no x = 0)
function tronco(P, I, y) {
  const fr = raio([0, y, 80], [0, 0, -1], P, I), co = raio([0, y, -80], [0, 0, 1], P, I);
  if (!isFinite(fr) || !isFinite(co)) return null;
  const zf = 80 - fr, zb = -80 + co, zc = (zf + zb) / 2;
  const di = raio([80, y, zc], [-1, 0, 0], P, I), es = raio([-80, y, zc], [1, 0, 0], P, I);
  if (!isFinite(di) || !isFinite(es)) return null;
  return { meia: ((80 - di) - (-80 + es)) / 2, zf, zb };
}

// OS BRAÇOS ABAIXADOS (a manga da Meshy cai junto do tronco, presa a ele: girá-la até a pose T esticava uma "asa" debaixo do
// braço). Cada osso do braço — ArmL/ArmR e os de fora dele — gira em volta do ombro; os pesos da pele fazem o resto
const lado = (n) => { const o = corpo.ossos[n], sL = corpo.ossos.ArmL[0]; return !o || /^Collar/.test(n) ? 0 : o[0] >= sL - 0.1 ? 1 : o[0] <= -sL + 0.1 ? -1 : 0; };
// (O ÂNGULO DAS MANGAS pelo ESQUELETO NA PEÇA — 28/11/2026, o dono: "o peitoral é A pose… vou passar o esqueleto em A pose dentro da
// armadura": `--esqueleto <referencias/esqueletos-das-pecas.json do editor> --peca <nome do solto>` — o ombro → cotovelo que ele marcou na
// peça, levado pelo encaixe (abaixo), dá quantos graus os braços descem; sem a marca, o `bracos` do config)
let bracosDoEsqueleto = null;
const daPecaNoEditor = (() => { const arq = opcao('--esqueleto'), nome = opcao('--peca'); if (!arq || !nome) return null; try { return JSON.parse(fs.readFileSync(arq, 'utf8')).pecas?.[nome] ?? null; } catch { return null; } })();
const ladoDo = corpo.nomes.map(lado);
let queda = (cfg.bracos ?? 70) * Math.PI / 180;
// a conta de um ponto com `w` do peso no braço do lado `s`: w·(R(p − ombro) + ombro) + (1 − w)·p (R: o giro em z que baixa o braço)
function posar(p, s, w, volta = false) {
  if (!s || !w) return p;
  const [cx, cy] = corpo.ossos[s > 0 ? 'ArmL' : 'ArmR'], g = -queda * s, c = Math.cos(g), si = Math.sin(g);
  const a = w * c + 1 - w, b = -w * si, d = w * si, e = w * c + 1 - w, x = p[0] - cx, y = p[1] - cy;
  if (!volta) return [cx + a * x + b * y, cy + d * x + e * y, p[2]];
  const det = a * e - b * d;
  return [cx + (e * x - b * y) / det, cy + (-d * x + a * y) / det, p[2]];
}
// o quanto um ponto pesa no braço (e de que lado)
const noBraco = (ossoDe, peso, v) => { let s = 0, w = 0; for (let j = 0; j < 4; j++) { const l = ladoDo[ossoDe[v * 4 + j]]; if (l) { s = l; w += peso[v * 4 + j] / 255; } } return [s, w]; };

// ------------------------------------------------------------------ (1) encaixar
const A = peca.pos, AI = peca.idx, nA = A.length / 3;
let topo = -Infinity, pe = Infinity; for (let v = 0; v < nA; v++) { topo = Math.max(topo, A[v * 3 + 1]); pe = Math.min(pe, A[v * 3 + 1]); }
const sy = (cfg.alto - cfg.baixo) / (topo - pe), Y = (h) => cfg.baixo + (h - pe) * sy;
const amostras = [];
for (let h = pe + 0.06 * (topo - pe); h <= pe + 0.5 * (topo - pe); h += 0.04 * (topo - pe)) {
  const a = tronco(A, AI, h), b = tronco(corpo.P, corpo.I, Y(h));
  if (a && b) amostras.push({ a, b });
}
if (amostras.length < 3) throw new Error('não medi o tronco (a peça ou o corpo não fecham nas alturas do tronco)');
const vao = cfg.apertada ? cfg.apertada.vao ?? 0.5 : cfg.vao ?? 2;   // (apertada: o encaixe já perto da pele — o passo (3) a aperta)
const sx = media(amostras.map(({ a, b }) => (b.meia + vao) / a.meia));
const sz = media(amostras.map(({ a, b }) => ((b.zf + vao) - (b.zb - vao)) / (a.zf - a.zb)));
const z0 = media(amostras.flatMap(({ a, b }) => [(b.zf + vao) - a.zf * sz, (b.zb - vao) - a.zb * sz]));
const X = new Float32Array(nA * 3);
for (let v = 0; v < nA; v++) { X[v * 3] = A[v * 3] * sx; X[v * 3 + 1] = Y(A[v * 3 + 1]); X[v * 3 + 2] = A[v * 3 + 2] * sz + z0; }
console.log(`encaixe: ${amostras.length} alturas; escala x ${sx.toFixed(3)}, y ${sy.toFixed(3)}, z ${sz.toFixed(3)}; z + ${z0.toFixed(1)} cm`);
// (o ângulo pelo esqueleto marcado na peça: o ombro → cotovelo de cada lado, no espaço do encaixe; a média dos dois)
{
  const J = daPecaNoEditor?.juntas, marcadas = new Set(daPecaNoEditor?.marcadas ?? []), naPeca = (p) => [p[0] * sx, Y(p[1]), p[2] * sz + z0];
  const angulos = [['ArmL', 'ElbowL'], ['ArmR', 'ElbowR']].filter(([a, b]) => J?.[a] && J?.[b] && (marcadas.has(a) || marcadas.has(b))).map(([a, b]) => {
    const o = naPeca(J[a]), c = naPeca(J[b]);
    return Math.atan2(o[1] - c[1], Math.abs(c[0] - o[0])) * 180 / Math.PI;
  });
  if (angulos.length) { bracosDoEsqueleto = Math.round(media(angulos) * 10) / 10; queda = bracosDoEsqueleto * Math.PI / 180; }
}
console.log(`braços: ${bracosDoEsqueleto ?? cfg.bracos ?? 70}° abaixo da horizontal para vestir${bracosDoEsqueleto != null ? ' (do esqueleto marcado na peça)' : ''} (a peça volta à pose T no fim)`);
const posado = new Float32Array(corpo.P.length);
for (let v = 0; v < corpo.P.length / 3; v++) { const [s, w] = noBraco(corpo.ossoDe, corpo.peso, v); posado.set(posar(pt(corpo.P, v), s, w), v * 3); }
const aPele = pele(posado, corpo.I);

// os PEDAÇOS (soldando pela posição): o maior é a peça; os outros (fivelas) vão juntos com o ponto mais perto dela
const solda = soldar(A, AI), { id, vizinhos } = solda;
const pai = Int32Array.from({ length: nA }, (_, i) => i), raiz = (x) => { while (pai[x] !== x) x = pai[x] = pai[pai[x]]; return x; };
for (let t = 0; t < AI.length; t += 3) { const a = raiz(id[AI[t]]); pai[raiz(id[AI[t + 1]])] = a; pai[raiz(id[AI[t + 2]])] = a; }
const tam = new Map(); for (let v = 0; v < nA; v++) { const r = raiz(id[v]); tam.set(r, (tam.get(r) ?? 0) + 1); }
// (os pedaços GRANDES são a peça — a partir de 5% do maior: sem a faixa das mangas, o punho de cada uma virou uma braçadeira solta, que se aperta no braço;
// os pequenos, as fivelas, vão com o ponto mais perto)
const maior = Math.max(...tam.values()), grandes = new Set([...tam].filter(([, n]) => n >= 0.05 * maior).map(([r]) => r)), daPeca = (v) => grandes.has(raiz(id[v]));

// ------------------------------------------------------------------ (3) a pele: nem dentro, nem longe
const folga = cfg.apertada ? (cfg.apertada.folga ?? 0.5) * 0.6 : cfg.folga ?? 1.2, longe = cfg.longe ?? 4.5;   // (apertada: no fim, nada a menos de 60% da folga dela)
const unicos = [...new Set(id)].filter(daPeca);
const mover = (u) => { for (let v = 0; v < nA; v++) { const r = id[v]; X[v * 3] += u[r * 3]; X[v * 3 + 1] += u[r * 3 + 1]; X[v * 3 + 2] += u[r * 3 + 2]; } };
const soltos = [...new Set(id)].filter((v) => !daPeca(v));
// (onde cada ponto solto se apoia: o ponto da peça mais perto, antes de mexer)
const apoio = new Map(soltos.map((v) => { let b = -1, bd = Infinity; for (const w of unicos) { const d = (X[v * 3] - X[w * 3]) ** 2 + (X[v * 3 + 1] - X[w * 3 + 1]) ** 2 + (X[v * 3 + 2] - X[w * 3 + 2]) ** 2; if (d < bd) { bd = d; b = w; } } return [v, b]; }));
// (APERTADA — 28/11/2026, o dono: "a tua versão só amplia a armadura pra cima do corpo (fica feio), eu tô tentando deixar ela reduzida e
// conectada à malha do personagem": `apertada` { folga, alisar, vao }): a CASCA — a distância à pele alisada pela malha (`alisar` passos:
// o vão de fundo, sem os relevos) — vai até `folga` cm da pele; os relevos (ombreiras, cinto, fivelas) ficam por cima dela, do tamanho
// que vieram. As tampas da Meshy (a malha vem fechada: a boca da manga, a gola, a barra) caem sobre a pele: a peça encosta ali)
if (cfg.apertada) {
  const f = cfg.apertada.folga ?? 0.5, passos = cfg.apertada.alisar ?? 25;
  for (let volta = 0; volta < 3; volta++) {
    const D = new Float32Array(nA), F = new Float32Array(nA * 3);
    for (const v of unicos) { const p = aPele.perto(pt(X, v)); D[v] = p.d; F.set(p.fora, v * 3); }
    let S = D;
    for (let it = 0; it < passos; it++) { const n = S.slice(); for (const v of unicos) { const vz = [...vizinhos[v]].filter(daPeca); if (vz.length) n[v] = 0.5 * S[v] + 0.5 * media(vz.map((w) => S[w])); } S = n; }
    const u = new Float32Array(nA * 3);
    for (const v of unicos) { const k = f - S[v]; for (let q = 0; q < 3; q++) u[v * 3 + q] = F[v * 3 + q] * k; }
    for (let it = 0; it < 6; it++) {
      const n = u.slice();
      for (const v of unicos) { const vz = [...vizinhos[v]].filter(daPeca); if (!vz.length) continue; for (let k = 0; k < 3; k++) n[v * 3 + k] = 0.5 * u[v * 3 + k] + 0.5 * media(vz.map((w) => u[w * 3 + k])); }
      u.set(n);
    }
    for (const v of soltos) { const b = apoio.get(v); for (let k = 0; k < 3; k++) u[v * 3 + k] = u[b * 3 + k]; }
    mover(u);
  }
} else {
  for (let volta = 0; volta < 4; volta++) {
    const u = new Float32Array(nA * 3);
    for (const v of unicos) {
      const p = aPele.perto(pt(X, v)); let k = 0;
      if (p.d < folga) k = folga - p.d; else if (p.d > longe) k = -(p.d - longe) * 0.7;
      u[v * 3] = p.fora[0] * k; u[v * 3 + 1] = p.fora[1] * k; u[v * 3 + 2] = p.fora[2] * k;
    }
    // (alisado pelos vizinhos: a peça anda inteira, não ponto a ponto)
    for (let it = 0; it < 6; it++) {
      const n = u.slice();
      for (const v of unicos) { const vz = [...vizinhos[v]].filter(daPeca); if (!vz.length) continue; for (let k = 0; k < 3; k++) n[v * 3 + k] = 0.5 * u[v * 3 + k] + 0.5 * media(vz.map((w) => u[w * 3 + k])); }
      u.set(n);
    }
    for (const v of soltos) { const b = apoio.get(v); for (let k = 0; k < 3; k++) u[v * 3 + k] = u[b * 3 + k]; }
    mover(u);
  }
}
// (o TAMANHO do config — acima: a peça cresce ou encolhe em volta do meio dela, as fivelas juntas)
if (tamanho.some((x) => x !== 1)) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (const v of unicos) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], X[v * 3 + k]); mx[k] = Math.max(mx[k], X[v * 3 + k]); }
  const meio = [0, 1, 2].map((k) => (mn[k] + mx[k]) / 2);
  for (let v = 0; v < nA; v++) for (let k = 0; k < 3; k++) X[v * 3 + k] = meio[k] + (X[v * 3 + k] - meio[k]) * tamanho[k];
  console.log(`tamanho: largura ${tamanho[0]}, altura ${tamanho[1]}, profundidade ${tamanho[2]} (em volta de ${meio.map((x) => x.toFixed(1)).join(', ')} cm)`);
}
// (no fim, ponto a ponto: nada dentro da pele — a fivela vai com o ponto dela)
{
  const u = new Float32Array(nA * 3); let saiu = 0, minimo = Infinity;
  for (const v of unicos) { const p = aPele.perto(pt(X, v)); if (p.d < folga) { saiu++; for (let k = 0; k < 3; k++) u[v * 3 + k] = p.fora[k] * (folga - p.d); } }
  for (const v of soltos) { const b = apoio.get(v); for (let k = 0; k < 3; k++) u[v * 3 + k] = u[b * 3 + k]; }
  mover(u);
  let longeMax = 0; for (const v of unicos) { const d = aPele.perto(pt(X, v)).d; minimo = Math.min(minimo, d); longeMax = Math.max(longeMax, d); }
  console.log(`pele: ${saiu} pontos empurrados no fim; o mais perto a ${minimo.toFixed(2)} cm, o mais longe a ${longeMax.toFixed(1)} cm`);
}

// ------------------------------------------------------------------ (4) os pesos (na pose dos braços baixados) e a volta à pose T
// (apertada: cada ponto pela pele virada para o mesmo lado — a normal dele na peça, a soma das dos triângulos em volta)
let normais = null;
if (cfg.apertada) {
  normais = new Float32Array(nA * 3);
  for (let t = 0; t < AI.length; t += 3) {
    const a = pt(X, AI[t]), b = pt(X, AI[t + 1]), c = pt(X, AI[t + 2]), f = cross(sub(b, a), sub(c, a));
    for (let q = 0; q < 3; q++) { const u = id[AI[t + q]]; normais[u * 3] += f[0]; normais[u * 3 + 1] += f[1]; normais[u * 3 + 2] += f[2]; }
  }
  for (let v = 0; v < nA; v++) { const u = id[v], l = Math.hypot(normais[u * 3], normais[u * 3 + 1], normais[u * 3 + 2]) || 1; normais[v * 3] = normais[u * 3] / l; normais[v * 3 + 1] = normais[u * 3 + 1] / l; normais[v * 3 + 2] = normais[u * 3 + 2] / l; }
}
// (apertada, a peça do PEITO: os pesos só da pele do tronco, do ombro e do braço de cima — a barra, perto da mão nos braços baixados, seguia o
// antebraço e virava ponta na pose T; o osso de cada triângulo = o que mais pesa nos três cantos)
const ossoDoTri = (t) => { const s = new Map(); for (let q = 0; q < 3; q++) { const v = corpo.I[t * 3 + q]; for (let j = 0; j < 4; j++) s.set(corpo.ossoDe[v * 4 + j], (s.get(corpo.ossoDe[v * 4 + j]) ?? 0) + corpo.peso[v * 4 + j]); } return corpo.nomes[[...s].sort((a, b) => b[1] - a[1])[0][0]]; };
const doPeito = cfg.apertada && cfg.lugar === 'peito' ? (t) => !/^(Elbow|Hand|Thigh|Shin|Foot|Toe|Head)/i.test(ossoDoTri(t)) : null;
let { nomes, ossoDe, peso } = pesosPelaPele(X, solda, corpo, doPeito ? pele(posado, corpo.I, doPeito) : aPele, new Map(soltos.map((v) => [v, apoio.get(v)])), normais);
const T = new Float32Array(nA * 3);
let Xvestida = X, fica = null;   // (`fica`: os triângulos que ficam na peça — apertada: o sovaco colado sai)   // (a peça de braços baixados como o jogo a mostra: a foto e a pele que ela esconde)
if (!cfg.apertada) for (let v = 0; v < nA; v++) { const [s, w] = noBraco(ossoDe, peso, v); T.set(posar(pt(X, v), s, w, true), v * 3); }
else {
  // (APERTADA: a volta à pose T pela conta DIRETA — cada ponto, o giro que SOBE o braço misturado pelo peso: (1 − w)·p + w·R⁻¹p. A conta
  // inversa da mistura, a de cima, explodia no sovaco a 81°: o ponto meio braço, meio tronco virava uma "asa". Depois, já na pose T, a
  // peça sai de dentro da pele da pose T e os pesos vêm da pele da pose T — como o corpo: o jogo a leva aos braços baixados pela mesma conta)
  const subir = (p, s, w) => { if (!s || !w) return p; const [cx, cy] = corpo.ossos[s > 0 ? 'ArmL' : 'ArmR'], g = queda * s, c = Math.cos(g), si = Math.sin(g), x = p[0] - cx, y = p[1] - cy; return [p[0] + w * (cx + c * x - si * y - p[0]), p[1] + w * (cy + si * x + c * y - p[1]), p[2]]; };
  // (o peso do braço AFIADO: abaixo de 0,3 fica no tronco, acima de 0,7 sobe inteiro — a costura entre a manga e a lateral, estreita)
  const afiar = (w) => { const x = Math.min(1, Math.max(0, (w - 0.3) / 0.4)); return x * x * (3 - 2 * x); };
  for (let v = 0; v < nA; v++) { const [s, w] = noBraco(ossoDe, peso, v); T.set(subir(pt(X, v), s, afiar(w)), v * 3); }
  const peleT = pele(corpo.P, corpo.I), u = new Float32Array(nA * 3);
  let saiu = 0;
  for (const v of unicos) { const p = peleT.perto(pt(T, v)); if (p.d < folga) { saiu++; for (let k = 0; k < 3; k++) u[v * 3 + k] = p.fora[k] * (folga - p.d); } }
  for (const v of soltos) { const b = apoio.get(v); for (let k = 0; k < 3; k++) u[v * 3 + k] = u[b * 3 + k]; }
  for (let v = 0; v < nA; v++) { const r = id[v]; for (let k = 0; k < 3; k++) T[v * 3 + k] += u[r * 3 + k]; }
  const nT0 = new Float32Array(nA * 3);
  for (let t = 0; t < AI.length; t += 3) { const a = pt(T, AI[t]), b = pt(T, AI[t + 1]), c = pt(T, AI[t + 2]), f = cross(sub(b, a), sub(c, a)); for (let q = 0; q < 3; q++) { const r = id[AI[t + q]]; nT0[r * 3] += f[0]; nT0[r * 3 + 1] += f[1]; nT0[r * 3 + 2] += f[2]; } }
  for (let v = 0; v < nA; v++) { const r = id[v], l = Math.hypot(nT0[r * 3], nT0[r * 3 + 1], nT0[r * 3 + 2]) || 1; for (let k = 0; k < 3; k++) nT0[v * 3 + k] = nT0[r * 3 + k] / l; }
  ({ nomes, ossoDe, peso } = pesosPelaPele(T, solda, corpo, doPeito ? pele(corpo.P, corpo.I, doPeito) : peleT, new Map(soltos.map((v) => [v, apoio.get(v)])), nT0));
  Xvestida = new Float32Array(nA * 3);
  for (let v = 0; v < nA; v++) { const [s, w] = noBraco(ossoDe, peso, v); Xvestida.set(posar(pt(T, v), s, w), v * 3); }
  console.log(`pose T: ${saiu} pontos saíram de dentro da pele da pose T; os pesos vêm dela`);
  // (O SOVACO COLADO da Meshy — a manga presa à lateral do tronco: subindo a manga, os triângulos dessa parede esticavam numa membrana
  // debaixo do braço. Os que ficam mais de `cortarEsticados` vezes maiores na pose T que nos braços baixados saem da peça: na pose T o
  // sovaco abre e mostra a pele dele; de braços baixados, o vão fica entre o braço e o tronco)
  const k = cfg.apertada.cortarEsticados ?? 2.5, area = (P, t) => Math.hypot(...cross(sub(pt(P, AI[t + 1]), pt(P, AI[t])), sub(pt(P, AI[t + 2]), pt(P, AI[t])))) / 2;
  if (k > 0) { fica = new Uint8Array(AI.length / 3).fill(1); for (let t = 0; t < AI.length; t += 3) if (area(T, t) > k * area(X, t) + 0.5) fica[t / 3] = 0; }
  if (fica) console.log(`sovaco: ${fica.length - fica.reduce((s, x) => s + x, 0)} triângulos esticados saíram da peça (mais de ${k}× na pose T)`);
}

// ------------------------------------------------------------------ (5) a pintura (no espaço da peça como veio)
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const tintas = Object.fromEntries(Object.entries(cfg.cores).map(([k, h]) => [k, hex(h)]));
const nT = AI.length / 3, cor = new Uint8Array(nT * 3), alt = topo - pe, conta = {};
const largo = media(amostras.map(({ a }) => a.meia));
for (let t = 0; t < nT; t++) {
  const vs = [0, 1, 2].map((k) => AI[t * 3 + k]), c = [0, 1, 2].map((k) => media(vs.map((v) => A[v * 3 + k]))), h = (c[1] - pe) / alt;
  const tinta = !daPeca(vs[0]) ? 'fivela' : h < 0.04 ? 'barra' : h > 0.1 && h < 0.2 ? 'cinto' : h > 0.93 ? 'barra' : Math.abs(c[0]) > largo + 2 && h > 0.4 ? 'ombreira' : 'couro';
  conta[tinta] = (conta[tinta] ?? 0) + 1;
  // (um nadinha de variação de um triângulo para o outro, sempre a mesma: o low poly pintado à mão)
  const j = 1 + (((t * 2654435761) >>> 0) % 1000 / 1000 - 0.5) * 0.07;
  for (let k = 0; k < 3; k++) cor[t * 3 + k] = Math.max(0, Math.min(255, Math.round(tintas[tinta][k] * j)));
}
console.log('pintura:', Object.entries(conta).map(([k, n]) => `${k} ${n}`).join(', '));
// (o que vai para o jogo: sem os triângulos que saíram — o sovaco colado, acima)
const AIg = fica ? AI.filter((_, i) => fica[Math.floor(i / 3)]) : AI, corG = fica ? cor.filter((_, i) => fica[Math.floor(i / 3)]) : cor, nTg = AIg.length / 3;

// ------------------------------------------------------------------ (6) a PELE que ela esconde (cfg.esconder: { alcance, margem })
// (27/11/2026; o dono: "apagar a malha correspondente ao torso no corpo do personagem: ombro, peito e um pedaço de manga curta"):
// os triângulos do corpo que a peça cobre nos braços baixados E na pose T (pele.mjs `peleCoberta`) somem com ela vestida
// (… e os que o DONO marcou a mais — 28/11/2026, "peitoral residual": "esses pedaços de malha podem sair quando consideramos essa região
// como peitoral" — `mais`: o lugar no arquivo do corpo; `criados`: o meio, no modelo, dos triângulos criados na aba Modelo, que o jogo
// acha pelo meio — guerreiro.js `criadosQueSomem`)
// (a CAMADA — 28/11/2026, o dono: "malha de layer 1: corpo vai sempre ficar atrás dela… se ele encostar numa malha do corpo, a malha do
// corpo vai sumir e ela vai prevalecer (a parte que tá sendo encostada apenas)": é do DESENHO — `camada` vai na armadura e o jogo a desenha
// à frente da pele onde as duas se encostam, ponto a ponto (guerreiro.js `comCamada`); sumir triângulos da pele inteiros abria buraco no
// braço, low poly. Aqui só some a pele INTEIRA debaixo da peça, com a margem da borda — nada à mostra)
const coberta = cfg.esconder ? peleCoberta(corpo, [[posado, Xvestida], [corpo.P, T]], AIg, cfg.esconder) : [];
const maisDoDono = (cfg.esconder?.mais ?? []).filter((t) => Number.isInteger(t) && t >= 0 && t < corpo.I.length / 3);
const esconde = [...new Set([...coberta, ...maisDoDono])].sort((a, b) => a - b);
const escondeCriados = (cfg.esconder?.criados ?? []).filter((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite));
if (cfg.esconder) console.log(`pele escondida: ${esconde.length} de ${corpo.I.length / 3} triângulos do corpo (alcance ${cfg.esconder.alcance ?? 8} cm, margem ${cfg.esconder.margem ?? 1} cm${cfg.camada ? `; camada ${cfg.camada}: no encosto a peça vale` : ''}; ${coberta.length} cobertos + ${esconde.length - coberta.length} marcados pelo dono)${escondeCriados.length ? `, e ${escondeCriados.length} criados` : ''}`);

// ------------------------------------------------------------------ gravar
const g = gravarArmadura({ id: cfg.id, rotulo: cfg.rotulo, corpo: cfg.corpo, lugar: cfg.lugar, conjunto: cfg.conjunto, de: `ferramentas/armadura-de-arquivo/vestir.mjs com ${path.basename(arqConfig)}`, nomes, pos: T, idx: AIg, cor: corG, ossoDe, peso, camada: Number.isInteger(cfg.camada) ? cfg.camada : 0, esconde, escondeCriados, previa: previaEm });
console.log(`gravado ${g.arquivo}: ${nA} pontos, ${nTg} triângulos${g.substituidas.length ? ` (saíram da lista: ${g.substituidas.join(', ')})` : ''}`);

// ------------------------------------------------------------------ a foto (o corpo cinza + a armadura pintada)
if (fotoEm) {
  // (em cima, VESTIDA — os braços abaixados, como no jogo andando; embaixo, a pose T, como o jogo a guarda)
  // (a pele escondida sai do corpo da foto: onde ela fura ou deixa buraco, aparece)
  const sumiu = new Set(esconde), CI = Uint32Array.from(corpo.I.filter((_, i) => !sumiu.has(Math.floor(i / 3))));
  const foto = (arq, corpoP, pecaP) => {
    const nb = corpoP.length / 3, pos = new Float32Array((nb + nA) * 3); pos.set(corpoP); pos.set(pecaP, nb * 3);
    const idx = new Uint32Array(CI.length + AIg.length); idx.set(CI); for (let i = 0; i < AIg.length; i++) idx[CI.length + i] = AIg[i] + nb;
    const cores = [...Array.from({ length: CI.length / 3 }, () => [205, 170, 140]), ...Array.from({ length: nTg }, (_, t) => [corG[t * 3], corG[t * 3 + 1], corG[t * 3 + 2]])];
    prancha(arq, pos, idx, { cores, W: 420, H: 520, vistas: [0, 40, 90, 180].map((giro) => ({ giro, centro: [0, (cfg.baixo + cfg.alto) / 2 + 5], escala: 3.6 })) });
  };
  foto(fotoEm, posado, Xvestida);
  const emT = fotoEm.replace(/\.png$/, '-pose-t.png');
  foto(emT, corpo.P, T);
  // (e o corpo sozinho, de braços baixados, com a pele que ela esconde em vermelho)
  const emEsc = fotoEm.replace(/.png$/, '-esconde.png');
  prancha(emEsc, posado, corpo.I, { cores: Array.from({ length: corpo.I.length / 3 }, (_, t) => (sumiu.has(t) ? [210, 60, 50] : [205, 170, 140])), W: 420, H: 520, vistas: [0, 40, 90, 180].map((giro) => ({ giro, centro: [0, (cfg.baixo + cfg.alto) / 2 + 5], escala: 3.6 })) });
  console.log(`fotos: ${fotoEm}, ${emT} e ${emEsc}`);
}
