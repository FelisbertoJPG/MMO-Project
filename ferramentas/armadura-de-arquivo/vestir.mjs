// AS ARMADURAS DE ARQUIVO (26/11/2026; o dono: "começar a implementar as armaduras low poly que combinem com o estilo dos nossos
// dois personagens … cada peça do corpo separada", e da 1ª, o peitoral da Meshy: "pinta sem ser pelo meshy, e já implementa no
// localhost o personagem masculino usando ela"). Uma malha pronta (.glb, sem pintura) VESTIDA SOZINHA num corpo de arquivo:
//   node ferramentas/armadura-de-arquivo/vestir.mjs <config> [--foto <png>]
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

const args = process.argv.slice(2), fotoEm = args.includes('--foto') ? args[args.indexOf('--foto') + 1] : null;
const arqConfig = args.find((a) => a.endsWith('.json'));
if (!arqConfig) { console.log('uso: node ferramentas/armadura-de-arquivo/vestir.mjs <config.json> [--foto <png>]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.resolve(arqConfig), 'utf8'));
const dirCfg = path.dirname(path.resolve(arqConfig));

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
const ladoDo = corpo.nomes.map(lado), queda = (cfg.bracos ?? 70) * Math.PI / 180;
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
const posado = new Float32Array(corpo.P.length);
for (let v = 0; v < corpo.P.length / 3; v++) { const [s, w] = noBraco(corpo.ossoDe, corpo.peso, v); posado.set(posar(pt(corpo.P, v), s, w), v * 3); }
const aPele = pele(posado, corpo.I);

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
const vao = cfg.vao ?? 2;
const sx = media(amostras.map(({ a, b }) => (b.meia + vao) / a.meia));
const sz = media(amostras.map(({ a, b }) => ((b.zf + vao) - (b.zb - vao)) / (a.zf - a.zb)));
const z0 = media(amostras.flatMap(({ a, b }) => [(b.zf + vao) - a.zf * sz, (b.zb - vao) - a.zb * sz]));
const X = new Float32Array(nA * 3);
for (let v = 0; v < nA; v++) { X[v * 3] = A[v * 3] * sx; X[v * 3 + 1] = Y(A[v * 3 + 1]); X[v * 3 + 2] = A[v * 3 + 2] * sz + z0; }
console.log(`encaixe: ${amostras.length} alturas; escala x ${sx.toFixed(3)}, y ${sy.toFixed(3)}, z ${sz.toFixed(3)}; z + ${z0.toFixed(1)} cm`);
console.log(`braços: ${cfg.bracos ?? 70}° abaixo da horizontal para vestir (a peça volta à pose T no fim)`);

// os PEDAÇOS (soldando pela posição): o maior é a peça; os outros (fivelas) vão juntos com o ponto mais perto dela
const solda = soldar(A, AI), { id, vizinhos } = solda;
const pai = Int32Array.from({ length: nA }, (_, i) => i), raiz = (x) => { while (pai[x] !== x) x = pai[x] = pai[pai[x]]; return x; };
for (let t = 0; t < AI.length; t += 3) { const a = raiz(id[AI[t]]); pai[raiz(id[AI[t + 1]])] = a; pai[raiz(id[AI[t + 2]])] = a; }
const tam = new Map(); for (let v = 0; v < nA; v++) { const r = raiz(id[v]); tam.set(r, (tam.get(r) ?? 0) + 1); }
const principal = [...tam.entries()].sort((a, b) => b[1] - a[1])[0][0], daPeca = (v) => raiz(id[v]) === principal;

// ------------------------------------------------------------------ (3) a pele: nem dentro, nem longe
const folga = cfg.folga ?? 1.2, longe = cfg.longe ?? 4.5;
const unicos = [...new Set(id)].filter(daPeca);
const mover = (u) => { for (let v = 0; v < nA; v++) { const r = id[v]; X[v * 3] += u[r * 3]; X[v * 3 + 1] += u[r * 3 + 1]; X[v * 3 + 2] += u[r * 3 + 2]; } };
const soltos = [...new Set(id)].filter((v) => !daPeca(v));
// (onde cada ponto solto se apoia: o ponto da peça mais perto, antes de mexer)
const apoio = new Map(soltos.map((v) => { let b = -1, bd = Infinity; for (const w of unicos) { const d = (X[v * 3] - X[w * 3]) ** 2 + (X[v * 3 + 1] - X[w * 3 + 1]) ** 2 + (X[v * 3 + 2] - X[w * 3 + 2]) ** 2; if (d < bd) { bd = d; b = w; } } return [v, b]; }));
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
const { nomes, ossoDe, peso } = pesosPelaPele(X, solda, corpo, aPele, new Map(soltos.map((v) => [v, apoio.get(v)])));
const T = new Float32Array(nA * 3);
for (let v = 0; v < nA; v++) { const [s, w] = noBraco(ossoDe, peso, v); T.set(posar(pt(X, v), s, w, true), v * 3); }

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

// ------------------------------------------------------------------ (6) a PELE que ela esconde (cfg.esconder: { alcance, margem })
// (27/11/2026; o dono: "apagar a malha correspondente ao torso no corpo do personagem: ombro, peito e um pedaço de manga curta"):
// os triângulos do corpo que a peça cobre nos braços baixados E na pose T (pele.mjs `peleCoberta`) somem com ela vestida
const esconde = cfg.esconder ? peleCoberta(corpo, [[posado, X], [corpo.P, T]], AI, cfg.esconder) : [];
if (cfg.esconder) console.log(`pele escondida: ${esconde.length} de ${corpo.I.length / 3} triângulos do corpo (alcance ${cfg.esconder.alcance ?? 8} cm, margem ${cfg.esconder.margem ?? 1} cm)`);

// ------------------------------------------------------------------ gravar
const g = gravarArmadura({ id: cfg.id, rotulo: cfg.rotulo, corpo: cfg.corpo, lugar: cfg.lugar, conjunto: cfg.conjunto, de: `ferramentas/armadura-de-arquivo/vestir.mjs com ${path.basename(arqConfig)}`, nomes, pos: T, idx: AI, cor, ossoDe, peso, esconde });
console.log(`gravado ${g.arquivo}: ${nA} pontos, ${nT} triângulos${g.substituidas.length ? ` (saíram da lista: ${g.substituidas.join(', ')})` : ''}`);

// ------------------------------------------------------------------ a foto (o corpo cinza + a armadura pintada)
if (fotoEm) {
  // (em cima, VESTIDA — os braços abaixados, como no jogo andando; embaixo, a pose T, como o jogo a guarda)
  // (a pele escondida sai do corpo da foto: onde ela fura ou deixa buraco, aparece)
  const sumiu = new Set(esconde), CI = Uint32Array.from(corpo.I.filter((_, i) => !sumiu.has(Math.floor(i / 3))));
  const foto = (arq, corpoP, pecaP) => {
    const nb = corpoP.length / 3, pos = new Float32Array((nb + nA) * 3); pos.set(corpoP); pos.set(pecaP, nb * 3);
    const idx = new Uint32Array(CI.length + AI.length); idx.set(CI); for (let i = 0; i < AI.length; i++) idx[CI.length + i] = AI[i] + nb;
    const cores = [...Array.from({ length: CI.length / 3 }, () => [205, 170, 140]), ...Array.from({ length: nT }, (_, t) => [cor[t * 3], cor[t * 3 + 1], cor[t * 3 + 2]])];
    prancha(arq, pos, idx, { cores, W: 420, H: 520, vistas: [0, 40, 90, 180].map((giro) => ({ giro, centro: [0, (cfg.baixo + cfg.alto) / 2 + 5], escala: 3.6 })) });
  };
  foto(fotoEm, posado, X);
  const emT = fotoEm.replace(/\.png$/, '-pose-t.png');
  foto(emT, corpo.P, T);
  // (e o corpo sozinho, de braços baixados, com a pele que ela esconde em vermelho)
  const emEsc = fotoEm.replace(/.png$/, '-esconde.png');
  prancha(emEsc, posado, corpo.I, { cores: Array.from({ length: corpo.I.length / 3 }, (_, t) => (sumiu.has(t) ? [210, 60, 50] : [205, 170, 140])), W: 420, H: 520, vistas: [0, 40, 90, 180].map((giro) => ({ giro, centro: [0, (cfg.baixo + cfg.alto) / 2 + 5], escala: 3.6 })) });
  console.log(`fotos: ${fotoEm}, ${emT} e ${emEsc}`);
}
