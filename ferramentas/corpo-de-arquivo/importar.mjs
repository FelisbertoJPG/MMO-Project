// O CORPO DE ARQUIVO (26/10/2026) — um personagem PRONTO, de um .glb sem esqueleto nem cor (o
// primeiro: a "feminino2", feita no Meshy), vira um CORPO DO GUERREIRO: a malha dele no lugar das
// peças do corpo (as armaduras continuam), presa aos 54 ossos do guerreiro — todas as animações
// servem (o retarget só copia giros). O jogo lê `assets/corpos/<nome>.json` (js/corpo-arquivo.js).
//
//   1. REDUZIR (Blender): o que é plano se junta e as arestas colapsam até `triangulos` — as
//      facetas grandes ficam (o Meshy manda ~180 mil triângulos);
//   2. JUNTAS (aqui, pelos CORTES da malha — laços fechados por altura): virilha, alto do ombro,
//      pescoço, a linha do braço (axila → ombro), o pulso (o corte mais fino), joelho e tornozelo
//      nas frações do guerreiro; a coluna nas frações dele entre a bacia e o pescoço;
//   3. PESOS (Blender): a armação nessas juntas, na pose A do arquivo, e o "calor" dos ossos (o
//      automático do Blender). Os dedos ficam de fora: a mão do modelo é um bloco, presa ao osso
//      da mão (os dedos não fecham na arma);
//   4. POSE T: os braços (ombro, cotovelo, mão) giram até a DIREÇÃO dos do guerreiro na pose T
//      (dual quaternion: o ombro não murcha) — o retarget conta com o corpo na pose do guerreiro;
//   5. ESCALA: os olhos na altura dos do guerreiro (`alturaDosOlhos`, cm); os pés no chão;
//   6. REGIÕES (cor): pele, cabelo, roupa (top e calcinha) — por regras de lugar (`regioes`);
//   7. OLHOS e BOCA desenhados (o rosto do modelo é liso): folhas no rosto, presas à cabeça.
// O arquivo leva a malha (com índice: o jogo a abre em faces planas), a região de cada triângulo,
// os pesos e onde fica cada osso NESTE corpo (o jogo move os ossos do guerreiro para lá).
//
// Uso (da raiz do jogo):
//   node ferramentas/corpo-de-arquivo/importar.mjs ferramentas/corpo-de-arquivo/feminino2.json [--conferir=<pasta>] [--blender=<blender.exe>]
// Com --conferir, grava na pasta: juntas-<nome>.png (as juntas na pose A), regioes-<nome>.png (o
// resultado na pose T, nas cores) e poses-<nome>.png (braços e pernas dobrados: os pesos).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { prancha } from './foto.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const THREE = await import(pathToFileURL(path.join(RAIZ, 'vendor/three.module.js')).href);
const args = process.argv.slice(2), arqCfg = args.find((a) => !a.startsWith('--'));
const opc = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const [k, ...v] = a.slice(2).split('='); return [k, v.join('=') || '1']; }));
if (!arqCfg) { console.error('uso: node ferramentas/corpo-de-arquivo/importar.mjs <recorte.json> [--conferir=<pasta>]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(arqCfg, 'utf8'));
const TRABALHO = path.join(os.tmpdir(), `corpo-de-arquivo-${cfg.nome}`);
fs.mkdirSync(TRABALHO, { recursive: true });

function acharBlender() {
  const base = 'C:/Program Files/Blender Foundation';
  const versoes = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'blender.exe'))).sort() : [];
  if (!versoes.length) throw new Error('Blender não encontrado: passe --blender=<caminho do blender.exe>');
  return path.join(base, versoes.at(-1), 'blender.exe');
}
const BLENDER = opc.blender ?? acharBlender();
const blender = (...a) => {
  const saida = execFileSync(BLENDER, ['--background', '--factory-startup', '--python', path.join(AQUI, 'blender.py'), '--', ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
  for (const l of saida.split('\n')) if (l.startsWith('[corpo]')) console.log(l);
};

// ------------------------------------------------------------ o guerreiro: onde ficam os ossos na pose T (cm)
function ossosDoGuerreiro() {
  const b = fs.readFileSync(path.join(RAIZ, 'assets/guerreiro/guerreiro.glb')), len = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + len).toString('utf8')), bin = b.subarray(20 + len + 8);
  const a = j.accessors[j.skins[0].inverseBindMatrices], bv = j.bufferViews[a.bufferView], off = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const ib = new Float32Array(bin.buffer.slice(off, off + a.count * 64));
  const G = {}, pai = {};
  j.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => { pai[j.nodes[c].name] = j.nodes[i].name; }));
  j.skins[0].joints.forEach((n, k) => { G[j.nodes[n].name] = new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(ib, k * 16).invert()); });
  return { G, pai };
}
const { G, pai: PAI } = ossosDoGuerreiro();
const LADOS = [['L', 'l', 1], ['R', 'r', -1]];   // (os nomes do pacote misturam maiúsculas; +x é a esquerda dele)
const nomesDoLado = (L, l) => ({ collar: `Collar${L}`, arm: `Arm${L}`, elbow: `Elbow${L}`, hand: `Hand${L}`, thigh: `Thigh${l}`, shin: `Shin${l}`, foot: `Foot${l}`, toe: `Toe${L}` });

// ------------------------------------------------------------ 1. reduzir
const baixo = path.join(TRABALHO, 'baixo.json');
console.log(`[corpo] reduzindo ${cfg.entrada} para ${cfg.triangulos} triângulos…`);
blender('reduzir', path.resolve(RAIZ, cfg.entrada), baixo, String(cfg.triangulos));
const malha = JSON.parse(fs.readFileSync(baixo, 'utf8'));
// 1b. O ROSTO SUBDIVIDIDO (26/10/2026, para os buracos da boca e dos olhos da modelo 1 — `rosto` do recorte): os triângulos
// do rosto dela são grandes (um ia do olho à boca, e os buracos se juntavam); os de frente na faixa `rosto.fino` (cm: de y,
// até y, meia largura) se partem em 4, `rosto.niveis` vezes — e o vizinho que divide uma aresta partida se parte junto
// (em 2 ou 3: sem rachadura). `paiDe[t]` = o triângulo da redução de onde t saiu (as marcas e os cortes do dono são
// achados pelo meio dele)
const I0 = malha.idx.slice(), P0 = malha.pos.slice();
let paiDe = Array.from({ length: malha.idx.length / 3 }, (_, t) => t);
if (cfg.rosto?.fino) {
  let ymin = Infinity;
  for (let i = 1; i < malha.pos.length; i += 3) ymin = Math.min(ymin, malha.pos[i]);
  const kk = cfg.alturaDosOlhos / (cfg.olhos.y - ymin), f = cfg.rosto.fino;
  for (let nivel = 0; nivel < (cfg.rosto.niveis ?? 2); nivel++) {
    const pos = malha.pos, idx = malha.idx, nt = idx.length / 3, corta = new Map();
    const chave = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
    const meio = (a, b) => { const k2 = chave(a, b); if (!corta.has(k2)) { corta.set(k2, pos.length / 3); pos.push(...[0, 1, 2].map((e) => (pos[3 * a + e] + pos[3 * b + e]) / 2)); } return corta.get(k2); };
    for (let t = 0; t < nt; t++) {
      const c = [0, 1, 2].map((e) => (pos[3 * idx[3 * t] + e] + pos[3 * idx[3 * t + 1] + e] + pos[3 * idx[3 * t + 2] + e]) / 3);
      const ycm = (c[1] - ymin) * kk, xcm = Math.abs(c[0]) * kk, zcm = c[2] * kk;
      if (ycm > f.de && ycm < f.ate && xcm < f.largura && zcm > (f.frente ?? 0)) for (let e = 0; e < 3; e++) meio(idx[3 * t + e], idx[3 * t + (e + 1) % 3]);
    }
    const novoIdx = [], novoPai = [];
    for (let t = 0; t < nt; t++) {
      const a = idx[3 * t], b = idx[3 * t + 1], c = idx[3 * t + 2], ab = corta.get(chave(a, b)), bc = corta.get(chave(b, c)), ca = corta.get(chave(c, a));
      const n = [ab, bc, ca].filter((x) => x !== undefined).length, out = [];
      if (n === 0) out.push([a, b, c]);
      else if (n === 3) out.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      else if (n === 1) { if (ab !== undefined) out.push([a, ab, c], [ab, b, c]); else if (bc !== undefined) out.push([a, b, bc], [a, bc, c]); else out.push([a, b, ca], [ca, b, c]); }
      else if (ca === undefined) out.push([a, ab, bc], [ab, b, bc], [a, bc, c]);
      else if (ab === undefined) out.push([b, bc, ca], [bc, c, ca], [b, ca, a]);
      else out.push([c, ca, ab], [ca, a, ab], [c, ab, b]);
      for (const tri of out) { novoIdx.push(...tri); novoPai.push(paiDe[t]); }
    }
    malha.idx = novoIdx; paiDe = novoPai;
  }
  fs.writeFileSync(path.join(TRABALHO, 'baixo-fino.json'), JSON.stringify(malha));
  console.log(`[corpo] o rosto subdividido: ${malha.idx.length / 3} triângulos no corpo`);
}
const malhaPesada = cfg.rosto?.fino ? path.join(TRABALHO, 'baixo-fino.json') : baixo;
const P = malha.pos, I = malha.idx, NV = P.length / 3;

// ------------------------------------------------------------ 2. as juntas (pose A, unidades do arquivo)
// os laços fechados do corte da malha pelo plano n·p = h (cada aresta cortada é um ponto; os dois
// pontos de um triângulo se ligam)
function contornos(n, h) {
  const pt = new Map(), pai = new Map(), f = (x) => { while (pai.get(x) !== x) { pai.set(x, pai.get(pai.get(x))); x = pai.get(x); } return x; };
  const d = (i) => P[3 * i] * n[0] + P[3 * i + 1] * n[1] + P[3 * i + 2] * n[2] - h;
  for (let t = 0; t < I.length; t += 3) {
    const v = [I[t], I[t + 1], I[t + 2]], s = v.map(d), ks = [];
    for (let k = 0; k < 3; k++) {
      const a = v[k], b = v[(k + 1) % 3], sa = s[k], sb = s[(k + 1) % 3];
      if ((sa < 0) === (sb < 0)) continue;
      const key = a < b ? a * 1e6 + b : b * 1e6 + a;
      if (!pt.has(key)) { const q = sa / (sa - sb); pt.set(key, [0, 1, 2].map((e) => P[3 * a + e] + (P[3 * b + e] - P[3 * a + e]) * q)); pai.set(key, key); }
      ks.push(key);
    }
    if (ks.length === 2) pai.set(f(ks[0]), f(ks[1]));
  }
  const m = new Map();
  for (const k of pt.keys()) { const r = f(k); if (!m.has(r)) m.set(r, []); m.get(r).push(pt.get(k)); }
  return [...m.values()].filter((g) => g.length > 3).map((g) => {
    const min = [0, 1, 2].map((e) => Math.min(...g.map((p) => p[e]))), max = [0, 1, 2].map((e) => Math.max(...g.map((p) => p[e])));
    return { c: [0, 1, 2].map((e) => g.reduce((s, p) => s + p[e], 0) / g.length), meio: [0, 1, 2].map((e) => (min[e] + max[e]) / 2), min, max, n: g.length };
  });
}
const cortes = (y) => contornos([0, 1, 0], y);
const doMeio = (y) => cortes(y).filter((g) => g.min[0] < 0 && g.max[0] > 0).sort((a, b) => b.n - a.n)[0] ?? null;
const meiaLargura = (g) => Math.max(-g.min[0], g.max[0]);
const cj = cfg.juntas;
let y0 = Infinity, yt = -Infinity;
for (let i = 0; i < NV; i++) { y0 = Math.min(y0, P[3 * i + 1]); yt = Math.max(yt, P[3 * i + 1]); }
let virilha = Infinity, coroa = -Infinity;
for (let i = 0; i < NV; i++) {
  if (Math.abs(P[3 * i]) < 0.012 && P[3 * i + 1] > y0 + 0.3) virilha = Math.min(virilha, P[3 * i + 1]);
  if (Math.abs(P[3 * i]) < 0.05) coroa = Math.max(coroa, P[3 * i + 1]);
}
// (o alto do ombro: acima da AXILA — onde o corte do meio já pega os braços — o corte afina de repente para o pescoço)
let ombroTopo = null, axila = null;
for (let y = virilha + 0.2; y < yt && ombroTopo === null; y += 0.004) {
  const g = doMeio(y);
  if (!g) continue;
  if (axila === null) { if (meiaLargura(g) > cj.limiteDoOmbro + 0.04) axila = y; } else if (meiaLargura(g) < cj.limiteDoOmbro) ombroTopo = y;
}
let pesc = ombroTopo, largPesc = Infinity;
for (let y = ombroTopo; y < ombroTopo + 0.12; y += 0.004) { const g = doMeio(y); if (g && meiaLargura(g) < largPesc) { largPesc = meiaLargura(g); pesc = y; } }
const k = cfg.alturaDosOlhos / (cfg.olhos.y - y0);   // cm por unidade do arquivo
console.log(`[corpo] pés ${y0.toFixed(3)}, virilha ${virilha.toFixed(3)}, alto do ombro ${ombroTopo.toFixed(3)}, pescoço ${pesc.toFixed(3)}, topo ${coroa.toFixed(3)}; ${k.toFixed(1)} cm por unidade`);

const J = {};   // a junta de cada osso (pose A, unidades do arquivo)
const fy = (nome) => (G[nome].y - G.Hips.y) / (G.Neck.y - G.Hips.y);
const yNeck = ombroTopo - 0.02, yHips = virilha + 0.003;
const cintura = doMeio(yHips + 0.4 * (yNeck - yHips)), fundo = cintura.max[2] - cintura.min[2];
const zColuna = (y) => (doMeio(y)?.min[2] ?? cintura.min[2]) + 0.45 * fundo;
J.Hips = [0, yHips, zColuna(yHips)];
for (const nome of ['Spine003', 'Spine002', 'Spine001', 'Spine']) { const y = yHips + fy(nome) * (yNeck - yHips); J[nome] = [0, y, zColuna(y)]; }
J.Neck = [0, yNeck, zColuna(yNeck)];
J.Head = [0, pesc + 0.03, doMeio(pesc).c[2]];
const pontaDaCabeca = [0, coroa, J.Head[2]];
const pontas = {};   // a ponta dos ossos das pontas (mão, dedo do pé)
for (const [L, l, s] of LADOS) {
  const n = nomesDoLado(L, l);
  J[n.collar] = [0, 1, 2].map((e) => J.Neck[e] + (G[n.collar].getComponent(e) - G.Neck.getComponent(e)) / k);
  // o BRAÇO: os cortes do lado (o mais de fora), da axila para baixo
  const fora = (y) => cortes(y).filter((g) => g.min[0] * s > 0).sort((a, b) => b.c[0] * s - a.c[0] * s)[0] ?? null;
  let ponta = Infinity;
  for (let i = 0; i < NV; i++) if (P[3 * i] * s > cj.maoX) ponta = Math.min(ponta, P[3 * i + 1]);
  // a reta do braço (alto dele): x e z em função de y, pelos mínimos quadrados
  const amostras = [];
  for (let y = ombroTopo - 0.37; y <= ombroTopo - 0.16; y += 0.01) { const g = fora(y); if (g) amostras.push([y, g.meio[0], g.c[2]]); }
  const reta = (e) => { const m = amostras.length, sy = amostras.reduce((a, p) => a + p[0], 0), sv = amostras.reduce((a, p) => a + p[e], 0), syy = amostras.reduce((a, p) => a + p[0] * p[0], 0), syv = amostras.reduce((a, p) => a + p[0] * p[e], 0); const b = (m * syv - sy * sv) / (m * syy - sy * sy); return [b, (sv - b * sy) / m]; };
  const [bx, ax] = reta(1), [bz, az] = reta(2), yOmbro = ombroTopo - cj.ombroAbaixo;
  J[n.arm] = [ax + bx * yOmbro, yOmbro, az + bz * yOmbro];
  // o PULSO: o corte mais fino entre a mão e o meio do braço
  let yPulso = null, fino = Infinity;
  for (let y = ponta + 0.12; y < ombroTopo - 0.3; y += 0.005) { const g = fora(y); if (g && g.max[0] - g.min[0] < fino) { fino = g.max[0] - g.min[0]; yPulso = y; } }
  J[n.hand] = fora(yPulso).meio;
  const lu = G[n.elbow].distanceTo(G[n.arm]), lf = G[n.hand].distanceTo(G[n.elbow]);
  const yCot = J[n.arm][1] + (lu / (lu + lf)) * (J[n.hand][1] - J[n.arm][1]);
  J[n.elbow] = fora(yCot).meio;
  const dedos = []; for (let i = 0; i < NV; i++) if (P[3 * i] * s > cj.maoX && P[3 * i + 1] < ponta + 0.02) dedos.push([P[3 * i], P[3 * i + 1], P[3 * i + 2]]);
  pontas[n.hand] = [0, 1, 2].map((e) => dedos.reduce((a, p) => a + p[e], 0) / dedos.length);
  // a PERNA: o corte do lado que não é a mão
  const perna = (y) => cortes(y).filter((g) => g.min[0] * s > 0 && Math.abs(g.c[0]) < cj.maoX - 0.02).sort((a, b) => b.n - a.n)[0];
  const coxa = perna(virilha - 0.05);
  J[n.thigh] = [coxa.meio[0], virilha + 0.03, coxa.c[2]];
  const yTorn = y0 + cj.tornozelo;
  J[n.foot] = perna(yTorn).meio;
  const fk = (G[n.shin].y - G[n.foot].y) / (G[n.thigh].y - G[n.foot].y), yJoelho = J[n.foot][1] + fk * (J[n.thigh][1] - J[n.foot][1]);
  J[n.shin] = perna(yJoelho).meio;
  const pe = perna(y0 + 0.012);
  J[n.toe] = [pe.meio[0], y0 + 0.045, pe.min[2] + 0.7 * (pe.max[2] - pe.min[2])];
  pontas[n.toe] = [pe.meio[0], y0 + 0.02, pe.max[2]];
}

// ------------------------------------------------------------ 3. os pesos (Blender, pose A)
const PONTA = { Hips: 'Spine003', Spine003: 'Spine002', Spine002: 'Spine001', Spine001: 'Spine', Spine: 'Neck', Neck: 'Head' };
for (const [L, l] of LADOS) { const n = nomesDoLado(L, l); Object.assign(PONTA, { [n.collar]: n.arm, [n.arm]: n.elbow, [n.elbow]: n.hand, [n.thigh]: n.shin, [n.shin]: n.foot, [n.foot]: n.toe }); }
const ossos = Object.keys(J).map((nome) => ({
  nome, cabeca: J[nome], ponta: PONTA[nome] ? J[PONTA[nome]] : nome === 'Head' ? pontaDaCabeca : pontas[nome],
  pai: PAI[nome] in J ? PAI[nome] : null,
}));
fs.writeFileSync(path.join(TRABALHO, 'ossos.json'), JSON.stringify(ossos));
blender('pesar', malhaPesada, path.join(TRABALHO, 'ossos.json'), path.join(TRABALHO, 'pesos.json'));
const pesosB = JSON.parse(fs.readFileSync(path.join(TRABALHO, 'pesos.json'), 'utf8')).pesos;
const NOMES = Object.keys(J);
const pesos = pesosB.map((w, i) => {
  let lista = w.map(([n, p]) => [NOMES.indexOf(n), p]).filter(([o]) => o >= 0);
  if (!lista.length) {   // (sem osso: o mais perto)
    const v = new THREE.Vector3(P[3 * i], P[3 * i + 1], P[3 * i + 2]), seg = new THREE.Line3(), q = new THREE.Vector3();
    let melhor = 0, d = Infinity;
    ossos.forEach((o, j) => { seg.set(new THREE.Vector3(...o.cabeca), new THREE.Vector3(...o.ponta)); const dd = seg.closestPointToPoint(v, true, q).distanceTo(v); if (dd < d) { d = dd; melhor = j; } });
    lista = [[melhor, 1]];
  }
  const soma = lista.reduce((a, [, p]) => a + p, 0);
  return lista.map(([o, p]) => [o, p / soma]);
});

// ------------------------------------------------------------ 4. os braços para a pose T do guerreiro
const giros = NOMES.map(() => ({ q: new THREE.Quaternion(), t: new THREE.Vector3() }));   // x' = q·x + t
const V = (a) => new THREE.Vector3(...a);
const Jt = Object.fromEntries(NOMES.map((n) => [n, V(J[n])]));   // as juntas depois da pose T
const pontasT = Object.fromEntries(Object.entries(pontas).map(([n, p]) => [n, V(p)]));
for (const [L, l] of LADOS) {
  const n = nomesDoLado(L, l), dedo = `Middle${l}`;
  const cadeia = [[n.arm, n.elbow], [n.elbow, n.hand], [n.hand, null]];
  let antes = new THREE.Quaternion();
  for (const [osso, filho] of cadeia) {
    const de = (filho ? V(J[filho]) : V(pontas[osso])).sub(V(J[osso])).normalize().applyQuaternion(antes);
    const para = (filho ? G[filho].clone() : G[dedo].clone()).sub(G[osso]).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(de, para).multiply(antes);
    const g = giros[NOMES.indexOf(osso)];
    g.q.copy(q);
    g.t.copy(Jt[osso]).sub(V(J[osso]).applyQuaternion(q));
    if (filho) Jt[filho] = V(J[filho]).applyQuaternion(q).add(g.t);
    else pontasT[osso] = V(pontas[osso]).applyQuaternion(q).add(g.t);
    antes = q;
  }
}
// a malha: dual quaternion (o ombro e o cotovelo não murcham como na mistura linear)
const posT = new Float64Array(NV * 3);
{
  const dq = giros.map(({ q, t }) => { const d = new THREE.Quaternion(t.x, t.y, t.z, 0).multiply(q); return [q, [d.x * 0.5, d.y * 0.5, d.z * 0.5, d.w * 0.5]]; });
  for (let i = 0; i < NV; i++) {
    const r = [0, 0, 0, 0], du = [0, 0, 0, 0];
    let ref = null;
    for (const [o, p] of pesos[i]) {
      const [q, d] = dq[o];
      if (!ref) ref = q;
      const s = q.x * ref.x + q.y * ref.y + q.z * ref.z + q.w * ref.w < 0 ? -p : p;
      r[0] += q.x * s; r[1] += q.y * s; r[2] += q.z * s; r[3] += q.w * s;
      for (let e = 0; e < 4; e++) du[e] += d[e] * s;
    }
    const m = Math.hypot(...r);
    const qr = new THREE.Quaternion(r[0] / m, r[1] / m, r[2] / m, r[3] / m), qd = new THREE.Quaternion(du[0] / m, du[1] / m, du[2] / m, du[3] / m);
    const t = qd.multiply(qr.clone().conjugate());
    const v = new THREE.Vector3(P[3 * i], P[3 * i + 1], P[3 * i + 2]).applyQuaternion(qr).add(new THREE.Vector3(t.x * 2, t.y * 2, t.z * 2));
    posT[3 * i] = v.x; posT[3 * i + 1] = v.y; posT[3 * i + 2] = v.z;
  }
}

// ------------------------------------------------------------ 5. a escala: cm do guerreiro, os pés no chão
const cm = (v) => [v[0] * k, (v[1] - y0) * k, v[2] * k];
const ossosCm = {};
for (const n of NOMES) ossosCm[n] = cm(Jt[n].toArray()).map((x) => +x.toFixed(2));
// os DEDOS (fora dos pesos): o desenho dos do guerreiro, na escala desta mão, a partir do pulso
for (const [L, l] of LADOS) {
  const n = nomesDoLado(L, l), mao = V(ossosCm[n.hand]), ponta = V(cm(pontasT[n.hand].toArray()));
  const escala = ponta.distanceTo(mao) / G[`Middle${l}002`].distanceTo(G[n.hand]);
  for (const nome of Object.keys(G)) {
    const d = /^(Thumb|Index|Middle|Ring|Pinky)([lLrR])(00[12])?$/.exec(nome);
    if (d && d[2].toUpperCase() === L) ossosCm[nome] = G[nome].clone().sub(G[n.hand]).multiplyScalar(escala).add(mao).toArray().map((x) => +x.toFixed(2));
  }
}

// ------------------------------------------------------------ 6. as regiões (a cor de cada triângulo), na pose A
const REG = { pele: 0, cabelo: 1, roupa: 2, branco: 3, iris: 4, escuro: 5, brilho: 6, boca: 7 };
const cr = cfg.regioes, NT = I.length / 3, regiao = new Uint8Array(NT);
// (o que é do braço — preso ao ombro, ao cotovelo e à mão — não é roupa: na pose A ele encosta no tronco)
const doBraco = NOMES.map((n) => /^(Arm|Elbow|Hand)[LR]$/.test(n));
const pesoDoBraco = (i) => pesos[i].reduce((a, [o, p]) => a + (doBraco[o] ? p : 0), 0);
const entre = (v, [a, b]) => v > a && v < b, rampa = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
for (let t = 0; t < NT; t++) {
  const c = [0, 1, 2].map((e) => (P[3 * I[3 * t] + e] + P[3 * I[3 * t + 1] + e] + P[3 * I[3 * t + 2] + e]) / 3);
  const [x, y, z] = c, ax = Math.abs(x);
  const braco = (pesoDoBraco(I[3 * t]) + pesoDoBraco(I[3 * t + 1]) + pesoDoBraco(I[3 * t + 2])) / 3 > 0.5;
  let r = REG.pele;
  // (o CABELO é separado abaixo: `separarOCabelo`)
  // o TOP: o bojo na frente (a borda de cima sobe para os lados), a faixa das costas e as alças por cima do ombro
  const tp = cr.top;
  if (!braco && y < ombroTopo + 0.02) {
    if (z > 0 && ax < tp.largura && y > tp.de && y < tp.ate + tp.sobe * rampa(ax, 0, tp.alca[0])) r = REG.roupa;
    if (z <= 0 && ax < tp.largura + 0.02 && y > tp.costasDe && y < tp.costasAte) r = REG.roupa;
    if (entre(ax, tp.alca) && y > tp.ate - 0.02) r = REG.roupa;
  }
  // a CALCINHA (em V): abaixo da cintura (mais alta dos lados) e acima da cava das pernas (da virilha ao quadril)
  const cc = cr.calcinha;
  if (!braco && ax < cc.quadril[0] + 0.02) {
    const frente = z > cc.meioZ;
    const cintura = frente ? cc.cintura[0] + (cc.cintura[1] - cc.cintura[0]) * rampa(ax, 0, cc.quadril[0]) : cc.cintura[2];
    const cava = frente ? virilha + 0.015 + (cc.quadril[1] - virilha) * rampa(ax, 0.02, cc.quadril[0]) : virilha + (cc.costasCava - virilha) * rampa(ax, 0.02, cc.quadril[0] + 0.01);
    if (y < cintura && y > cava) r = REG.roupa;
  }
  regiao[t] = r;
}

// ------------------------------------------------------------ 6b. o CABELO sai do corpo (vira um penteado) e a cabeça fica CARECA
// (26/10/2026, o dono traçou na aba Modelo onde a testa acaba: a testa sobe até ~183 cm no meio, entre as mechas da franja)
// É cabelo, na cabeça (acima de `cabeca` cm):
//  - o que está acima da LINHA DO CABELO (`linha`: [graus a partir da frente, altura em cm], igual dos dois lados, em
//    volta do meio da cabeça) — a casca do cabelo, os coques;
//  - as MECHAS soltas (a franja, as do lado do rosto): lâminas FINAS — um raio para dentro da face acha o outro lado
//    dela a menos de `fina` cm (a testa e o rosto atrás delas são grossos: o raio atravessa a cabeça);
//  - e as ilhas que sobram soltas do corpo (as pontas das mechas abaixo da linha).
// O buraco que o cabelo deixa no alto da cabeça é fechado por um COURO novo (anéis da beira até o alto, por dentro da
// casca do cabelo: `folgaDoCouro`), preso à cabeça; buraquinhos (a raiz de uma mecha na testa), por um leque.
const ccab = cfg.cabelo, cmY = (y) => (y - y0) * k, porCm = 1 / k;
const triMeio = (t) => [0, 1, 2].map((e) => (P[3 * I[3 * t] + e] + P[3 * I[3 * t + 1] + e] + P[3 * I[3 * t + 2] + e]) / 3);
const triNormal = (t) => {
  const a = V(P.slice(3 * I[3 * t], 3 * I[3 * t] + 3)), b = V(P.slice(3 * I[3 * t + 1], 3 * I[3 * t + 1] + 3)), c = V(P.slice(3 * I[3 * t + 2], 3 * I[3 * t + 2] + 3));
  return b.sub(a).cross(c.sub(a)).normalize();
};
const linhaDoCabelo = (graus) => {   // a altura (cm) da linha do cabelo nesse ângulo (0 = a testa, 180 = a nuca)
  const L = ccab.linha, g = Math.min(180, Math.abs(graus));
  for (let i = 0; i < L.length - 1; i++) if (g >= L[i][0] && g <= L[i + 1][0]) { const f = (g - L[i][0]) / (L[i + 1][0] - L[i][0]); return L[i][1] + f * (L[i + 1][1] - L[i][1]); }
  return L.at(-1)[1];
};
const naCabeca = new Uint8Array(NT);
for (let t = 0; t < NT; t++) naCabeca[t] = cmY(triMeio(t)[1]) > ccab.cabeca ? 1 : 0;
// o raio de `o` na direção `d`: a que distância está a face mais perto (Möller–Trumbore, só entre as da `lista`)
const daCabeca = [...naCabeca.keys()].filter((t) => naCabeca[t]);
function raioAte(o, d, fora, lista = daCabeca) {
  let melhor = Infinity;
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), h = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Vector3(), a = new THREE.Vector3();
  for (const t of lista) {
    if (t === fora) continue;
    a.fromArray(P, 3 * I[3 * t]); e1.fromArray(P, 3 * I[3 * t + 1]).sub(a); e2.fromArray(P, 3 * I[3 * t + 2]).sub(a);
    h.crossVectors(d, e2); const det = e1.dot(h);
    if (Math.abs(det) < 1e-12) continue;
    s.subVectors(o, a); const u = s.dot(h) / det; if (u < 0 || u > 1) continue;
    q.crossVectors(s, e1); const v = d.dot(q) / det; if (v < 0 || u + v > 1) continue;
    const dist = e2.dot(q) / det;
    if (dist > 1e-6 && dist < melhor) melhor = dist;
  }
  return melhor;
}
const meioDaCabeca = V([0, J.Head[1] + (coroa - J.Head[1]) * 0.35, J.Head[2]]);
for (const t of daCabeca) {
  const m = V(triMeio(t)), n = triNormal(t);
  const graus = (Math.atan2(m.x - meioDaCabeca.x, m.z - meioDaCabeca.z) * 180) / Math.PI;
  const acima = cmY(m.y) > linhaDoCabelo(graus);
  const fina = !acima && raioAte(m.clone().addScaledVector(n, -1e-5), n.clone().negate(), t) < ccab.fina * porCm;
  // (… e a MECHA NA FRENTE de algo: a face virada para fora com outra superfície logo atrás dela, no rumo do eixo da
  // cabeça — a franja diante da testa, a mecha diante da bochecha; a testa e a bochecha têm a cabeça inteira atrás)
  const rumo = new THREE.Vector3(meioDaCabeca.x - m.x, 0, meioDaCabeca.z - m.z).normalize();
  const naFrente = !acima && !fina && rumo.dot(n) < -0.3 && raioAte(m.clone().addScaledVector(n, -1e-5), rumo, t) < ccab.naFrente * porCm;
  // (… e, na testa — acima das sobrancelhas, de frente —, a camada DA FRENTE: outra superfície logo atrás, olhando de frente)
  const testa = !acima && !fina && !naFrente && cmY(m.y) > (ccab.camadaDe ?? ccab.testaDe) && Math.abs(graus) < 45 && n.z > 0.1 && raioAte(m.clone().addScaledVector(n, -1e-5), new THREE.Vector3(0, 0, -1), t) < ccab.naTesta * porCm;
  // (… e, na testa, o que está virado para BAIXO ou para TRÁS: a testa acima das sobrancelhas nunca olha para o chão nem
  // para dentro da cabeça — é a raiz de uma mecha, ou o lado de dentro da franja)
  const paraBaixo = !acima && cmY(m.y) > ccab.testaDe && Math.abs(graus) < 45 && (n.y < -0.3 || n.z < -0.2);
  if (acima || fina || naFrente || testa || paraBaixo) regiao[t] = REG.cabelo;
}
// as ILHAS: do que sobrou do corpo, só o pedaço maior fica (o resto — pontas de mecha — vai para o cabelo); do cabelo,
// as ilhas pequenas DENTRO da pele voltam para ela (um triângulo marcado errado deixaria um furo)
const vizinhos = (() => {
  const arestas = new Map(), viz = Array.from({ length: NT }, () => []);
  for (let t = 0; t < NT; t++) for (let e = 0; e < 3; e++) {
    const a = I[3 * t + e], b = I[3 * t + (e + 1) % 3], ch = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (arestas.has(ch)) { const u = arestas.get(ch); viz[t].push(u); viz[u].push(t); } else arestas.set(ch, t);
  }
  return viz;
})();
const pedacos = (dentro) => {   // os pedaços ligados dos triângulos em que `dentro(t)`
  const de = new Int32Array(NT).fill(-1), lista = [];
  for (let t0 = 0; t0 < NT; t0++) {
    if (de[t0] >= 0 || !dentro(t0)) continue;
    const p = [t0]; de[t0] = lista.length;
    for (let i = 0; i < p.length; i++) for (const u of vizinhos[p[i]]) if (de[u] < 0 && dentro(u)) { de[u] = lista.length; p.push(u); }
    lista.push(p);
  }
  return lista;
};
for (const p of pedacos((t) => regiao[t] === REG.cabelo)) if (p.length <= ccab.ilha) for (const t of p) regiao[t] = REG.pele;
// os triângulos de uma MARCA do dono (o meio de um triângulo, cm, pose T): o triângulo de agora com esse meio (até 0,05 cm);
// senão, o da REDUÇÃO com esse meio (até `ate` cm) — e então todos os que saíram dele ao subdividir o rosto (a marca feita
// antes da subdivisão vale para os pedaços)
const meioCm = (ids, t) => { const s = [0, 0, 0]; for (let q = 0; q < 3; q++) { const c = cm([posT[3 * ids[3 * t + q]], posT[3 * ids[3 * t + q] + 1], posT[3 * ids[3 * t + q] + 2]]); for (let e = 0; e < 3; e++) s[e] += c[e] / 3; } return s; };
const meiosAgora = Array.from({ length: NT }, (_, t) => meioCm(I, t)), meiosDosPais = Array.from({ length: I0.length / 3 }, (_, t) => meioCm(I0, t));
const perto2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
function trisDaMarca(m, ate) {
  let b = -1, d = 0.05 ** 2;
  for (let t = 0; t < NT; t++) { const q = perto2(meiosAgora[t], m); if (q < d) { d = q; b = t; } }
  if (b >= 0) return [b];
  let p = -1; d = ate ** 2;
  for (let t = 0; t < meiosDosPais.length; t++) { const q = perto2(meiosDosPais[t], m); if (q < d) { d = q; p = t; } }
  if (p < 0) return [];
  const ts = [];
  for (let t = 0; t < NT; t++) if (paiDe[t] === p) ts.push(t);
  return ts;
}
// O QUE O DONO MARCOU: os triângulos CORTADOS (ferramenta Cortar, K) na aba Modelo deste corpo (`assets/modelagem.json`,
// a chave dele — 'humano:arquivo') são CABELO: saem do corpo para o cabelo, e a careca fecha por baixo deles. (Cada corte
// é achado pelo meio do triângulo no modelo, cm; depois de gerar de novo, o corte não acha mais nada: fica sem efeito)
{
  let cortes = [];
  try { cortes = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/modelagem.json'), 'utf8')).corpos?.[ccab.chave ?? 'humano:arquivo']?.cortes ?? []; } catch { /* sem o arquivo */ }
  let marcados = 0;
  for (const c of cortes) {
    if (c.de && c.de !== 'corpo' || !Array.isArray(c.em)) continue;
    for (const t of trisDaMarca(c.em, 0.05)) if (regiao[t] !== REG.cabelo) { regiao[t] = REG.cabelo; marcados++; }
  }
  if (cortes.length) console.log(`[corpo] os cortes da aba Modelo: ${marcados} de ${cortes.length} viraram cabelo`);
}
const doCorpo = pedacos((t) => regiao[t] !== REG.cabelo).sort((a, b) => b.length - a.length);
for (const p of doCorpo.slice(1)) for (const t of p) regiao[t] = REG.cabelo;
// AS MARCAS DO DONO (por último: mandam em tudo): a ferramenta "cabelo ⇄ pele" da aba Modelo grava em
// ferramentas/corpo-de-arquivo/<nome>-marcas.json o meio (cm, pose T) dos triângulos errados — `cabelo`: os da pele que
// são cabelo; `pele`: os do cabelo que são pele. Cada marca acha o triângulo do modelo mais perto (até 0,5 cm)
{
  let marcas = null;
  try { marcas = JSON.parse(fs.readFileSync(path.join(AQUI, `${cfg.nome}-marcas.json`), 'utf8')); } catch { /* sem marcas */ }
  if (marcas) {
    let n = 0;
    for (const [lista, r] of [[marcas.cabelo, REG.cabelo], [marcas.pele, REG.pele]]) for (const m of Array.isArray(lista) ? lista : []) {
      const ts = Array.isArray(m) && m.length === 3 ? trisDaMarca(m, 0.5) : [];
      for (const t of ts) regiao[t] = r;
      if (ts.length) n++;
    }
    console.log(`[corpo] as marcas cabelo ⇄ pele: ${n} de ${(marcas.cabelo?.length ?? 0) + (marcas.pele?.length ?? 0)} aplicadas`);
  }
}
console.log(`[corpo] cabelo: ${regiao.filter((r) => r === REG.cabelo).length} triângulos tirados do corpo`);

// a BEIRA do corpo (as arestas com um triângulo só): os laços, cada um na ordem das arestas como os triângulos as têm.
// (Um vértice pode ter DUAS beiras saindo dele — o laço encosta em si mesmo: cada aresta da beira é usada uma vez, e o
// que sobra vira outro laço; antes um mapa de uma saída por vértice perdia um pedaço e ficava um buraco na testa)
const fica = (t) => regiao[t] !== REG.cabelo;
const saidas = new Map();   // vértice → as arestas da beira que saem dele [a, b]
for (let t = 0; t < NT; t++) {
  if (!fica(t)) continue;
  for (let e = 0; e < 3; e++) {
    const a = I[3 * t + e], b = I[3 * t + (e + 1) % 3];
    if (vizinhos[t].some((u) => fica(u) && [0, 1, 2].some((f) => I[3 * u + f] === b && I[3 * u + (f + 1) % 3] === a))) continue;
    if (!saidas.has(a)) saidas.set(a, []);
    saidas.get(a).push(b);
  }
}
const lacos = [];
for (const a0 of saidas.keys()) {
  while (saidas.get(a0)?.length) {
    const laco = [a0];
    let a = a0;
    for (let passos = 0; passos < 100000; passos++) {
      const b = saidas.get(a)?.shift();
      if (b === undefined || b === a0) break;
      laco.push(b);
      a = b;
    }
    // (um laço que passa duas vezes pelo mesmo vértice é partido ali: cada pedaço é um laço simples)
    const pilha = [], onde = new Map();
    for (const v of laco) {
      if (onde.has(v)) { const de = onde.get(v), sub = pilha.splice(de); for (const x of sub) onde.delete(x); if (sub.length >= 3) lacos.push(sub); }
      onde.set(v, pilha.length); pilha.push(v);
    }
    if (pilha.length >= 3) lacos.push(pilha);
  }
}
lacos.sort((a, b) => b.length - a.length);
// o COURO: anéis do laço maior (a beira da testa, das têmporas e da nuca) até o alto, por dentro da casca do cabelo
const novos = [];   // os vértices novos (pose A, unidades do arquivo); índices a partir de NV
const fechos = [];  // os triângulos novos (índices de vértice)
const doCabelo = [...daCabeca].filter((t) => regiao[t] === REG.cabelo);
const casca = (o, d) => raioAte(o, d, -1, doCabelo);   // (até a casca do cabelo, por dentro)
const novo = (v) => { novos.push(v); return NV + novos.length - 1; };
if (lacos.length) {
  const laco = lacos[0], pts = laco.map((i) => V(P.slice(3 * i, 3 * i + 3)));
  // (os anéis saem do MEIO DA CABEÇA e vão para um CRÂNIO liso — um ovo com as medidas de `cranio`, cm: meia largura,
  // frente, trás, alto (a altura do topo) e baixo (abaixo do meio) —, não para a casca do cabelo: no primeiro anel, quase a
  // beira; do terceiro em diante, o crânio)
  const meio = meioDaCabeca.clone(), cr2 = ccab.cranio;
  const cima = new THREE.Vector3(0, 1, 0);
  const rx = cr2.largura * porCm, rf = cr2.frente * porCm, rt = cr2.tras * porCm, ra = (cr2.alto - (meio.y - y0) * k) * porCm, rb = cr2.baixo * porCm;
  const noCranio = (d) => meio.clone().addScaledVector(d, 1 / Math.sqrt((d.x / rx) ** 2 + (d.y / (d.y > 0 ? ra : rb)) ** 2 + (d.z / (d.z > 0 ? rf : rt)) ** 2));
  // A CÚPULA não é costurada na beira (a beira desce em dentes na raiz das mechas, e os anéis costurados nela dobravam —
  // a mancha escura na testa): é uma peça à parte, em gomos (`gomos` em volta, `aneis` de baixo até o alto), que começa
  // `desce` graus ABAIXO da beira, um pouco POR DENTRO da pele dali (`dentro` cm), e sobe para o crânio liso. Pele e
  // cúpula da mesma cor: a beira dentada da pele some contra ela.
  const angulo = (p) => { const d = p.clone().sub(meio); return [Math.atan2(d.x, d.z), Math.asin(Math.max(-1, Math.min(1, d.y / d.length()))), d.length()]; };
  const beira = pts.map(angulo), G = ccab.gomos, N = ccab.aneis, abre = (ccab.desce * Math.PI) / 180, dentro = ccab.dentro * porCm;
  const pelaVolta = Array.from({ length: G }, (_, g) => {
    // (em cada gomo, a beira MAIS BAIXA perto dele — dentro de ±1,5 gomo —, e a que distância do meio ela está)
    const th = (g / G) * Math.PI * 2 - Math.PI, largo = (1.5 * Math.PI * 2) / G;
    let el = Infinity, r = 0;
    for (const [t, e, d] of beira) { let dt = Math.abs(t - th); if (dt > Math.PI) dt = 2 * Math.PI - dt; if (dt < largo && e < el) { el = e; r = d; } }
    if (el === Infinity) { el = 0; r = noCranio(new THREE.Vector3(Math.sin(th), 0, Math.cos(th))).distanceTo(meio); }
    return { th, el: el - abre, r: r - dentro };
  });
  // o raio de cada ponto: o do CRÂNIO liso — mas, onde há pele (um raio do meio da cabeça a acha), `dentro` cm por dentro
  // dela; acima da última pele do gomo, do raio dela até o do crânio em dois anéis (sem degrau na linha do cabelo)
  const pele = daCabeca.filter((t) => regiao[t] !== REG.cabelo);
  const linhas = Array.from({ length: N }, () => []);
  for (const [g, { th, el }] of pelaVolta.entries()) {
    let ultimo = null, desde = 0;
    for (let j = 0; j < N; j++) {
      const e = el + (Math.PI / 2 - el) * (j / N), d = new THREE.Vector3(Math.sin(th) * Math.cos(e), Math.sin(e), Math.cos(th) * Math.cos(e));
      const rc = noCranio(d).distanceTo(meio), naPele = raioAte(meio, d, -1, pele);
      let r;
      if (naPele < rc + 3 * porCm) { r = naPele - dentro; ultimo = r; desde = 0; } else { desde++; r = ultimo === null ? rc : ultimo + (rc - ultimo) * Math.min(1, desde / 2); }
      linhas[j][g] = novo(meio.clone().addScaledVector(d, r));
    }
  }
  const polo = novo(meio.clone().addScaledVector(cima, ra));
  // (a ordem dos cantos: virados para FORA, conferido no primeiro)
  const fora = (a, b, c) => { const pa = novos[a - NV], pb = novos[b - NV], pc = novos[c - NV]; return pb.clone().sub(pa).cross(pc.clone().sub(pa)).dot(pa.clone().add(pb).add(pc).multiplyScalar(1 / 3).sub(meio)) > 0; };
  const tri = (a, b, c) => fechos.push(fora(a, b, c) ? [a, b, c] : [a, c, b]);
  for (let j = 0; j < N - 1; j++) for (let g = 0; g < G; g++) {
    const g2 = (g + 1) % G, a = linhas[j][g], b = linhas[j][g2], c = linhas[j + 1][g2], d = linhas[j + 1][g];
    tri(a, b, c); tri(a, c, d);
  }
  for (let g = 0; g < G; g++) tri(linhas[N - 1][g], linhas[N - 1][(g + 1) % G], polo);
  // A COSTURA DA BEIRA (26/10/2026, o dono traçou duas linhas na nuca: "conecte os vértices da linha de baixo com os da
  // linha de cima (as bases)"): a beira da pele (o laço) e o pé da cúpula (o primeiro anel) ligados por uma faixa — em volta
  // da cabeça, pela ordem do ângulo (um zíper: avança quem tem o próximo ângulo menor), cada triângulo virado para fora
  {
    const posDe = (i) => (i < NV ? V(P.slice(3 * i, 3 * i + 3)) : novos[i - NV].clone());
    const angulo2 = (i) => { const p = posDe(i); return Math.atan2(p.x - meio.x, p.z - meio.z); };
    const emOrdem = (l) => l.map((i) => [i, angulo2(i)]).sort((a, b) => a[1] - b[1]);
    const A = emOrdem(laco), B = emOrdem(linhas[0]), na = A.length, nb = B.length;
    const un = (L, k) => L[k % L.length][1] + (k >= L.length ? 2 * Math.PI : 0);
    const triFora = (a, b, c) => { const pa = posDe(a), pb = posDe(b), pc = posDe(c), n = pb.clone().sub(pa).cross(pc.clone().sub(pa)); fechos.push(n.dot(pa.clone().add(pb).add(pc).multiplyScalar(1 / 3).sub(meio)) > 0 ? [a, b, c] : [a, c, b]); };
    let i = 0, j = 0;
    while (i < na || j < nb) {
      const a0 = A[i % na][0], b0 = B[j % nb][0];
      if (j >= nb || (i < na && un(A, i + 1) <= un(B, j + 1))) { triFora(a0, A[(i + 1) % na][0], b0); i++; } else { triFora(a0, B[(j + 1) % nb][0], b0); j++; }
    }
  }
  // os laços pequenos (a raiz de uma mecha que pousava na testa): um leque do meio deles
  for (const l of lacos.slice(1)) {
    const c = l.map((i) => V(P.slice(3 * i, 3 * i + 3))).reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / l.length);
    const m = novo(c);
    for (let i = 0; i < l.length; i++) fechos.push([l[(i + 1) % l.length], l[i], m]);
  }
  console.log(`[corpo] careca: o couro com ${novos.length} vértices novos (a beira tinha ${laco.length}); ${lacos.length - 1} buraquinho(s) fechado(s)`);
}

// ------------------------------------------------------------ 6c. os BURACOS DO ROSTO (26/10/2026): a boca e os olhos da MODELO 1
// O dono: "carregue a boca/lábios da modelo 1 pro modelo 2, conecte com as malhas" — e o mesmo com os olhos. O jogo põe
// ali as peças do rosto do guerreiro (a boca e os olhos, com as edições da modelo 1: js/corpo-arquivo.js `transplantarRosto`)
// e as COSTURA na beira destes buracos. Aqui: tirar do rosto os triângulos de frente dentro de cada elipse (`rosto`, cm:
// o meio x/y, os raios rx/ry; `frente` = só os de z acima disso) e gravar a BEIRA de cada buraco (os pontos, cm, pose T)
REG.buraco = 8;
const buracos = {};
if (cfg.rosto) {
  const ro = cfg.rosto;
  const regioes = [['boca', ro.boca.x, ro.boca], ['olho1', ro.olhos.x, ro.olhos], ['olho2', -ro.olhos.x, ro.olhos]];
  // (o rosto foi SUBDIVIDIDO na faixa `fino` — 1b: os triângulos de dentro da elipse são pequenos, e o buraco sai do
  // tamanho dela; a beira, um laço perto da elipse, é costurada direto na peça da modelo 1, no jogo. Cuidado: `k` é a
  // escala, cm por unidade — o número da região aqui é `q`)
  const qual = new Int8Array(NT).fill(-1);
  regioes.forEach(([, cx, r], q) => {
    for (let t = 0; t < NT; t++) {
      if (regiao[t] !== REG.pele) continue;
      const [x, y, z] = cm(triMeio(t));
      if (z >= ro.frente && ((x - cx) / r.rx) ** 2 + ((y - r.y) / r.ry) ** 2 < 1) { qual[t] = q; regiao[t] = REG.buraco; }
    }
  });
  // a beira de cada buraco: as arestas entre um triângulo do buraco e um que fica (o laço mais longo)
  regioes.forEach(([nome, , r], q) => {
    const saida = new Map();
    for (let t = 0; t < NT; t++) {
      if (qual[t] !== q) continue;
      for (const u of vizinhos[t]) {
        if (regiao[u] === REG.buraco || regiao[u] === REG.cabelo) continue;
        // (a aresta comum, na ordem do triângulo que fica)
        for (let e = 0; e < 3; e++) { const a = I[3 * u + e], b = I[3 * u + (e + 1) % 3]; if ([0, 1, 2].some((f) => I[3 * t + f] === a) && [0, 1, 2].some((f) => I[3 * t + f] === b)) saida.set(a, b); }
      }
    }
    let melhor = [];
    const visto = new Set();
    for (const a0 of saida.keys()) {
      if (visto.has(a0)) continue;
      const l = [];
      for (let a = a0; a !== undefined && !visto.has(a); a = saida.get(a)) { visto.add(a); l.push(a); }
      if (l.length > melhor.length) melhor = l;
    }
    buracos[nome] = { borda: melhor.map((i) => cm([posT[3 * i], posT[3 * i + 1], posT[3 * i + 2]]).map((v) => +v.toFixed(3))), escala: r.escala ?? 1 };
  });
  console.log(`[corpo] rosto: buracos da boca (${buracos.boca.borda.length} pontos na beira) e dos olhos (${buracos.olho1.borda.length}, ${buracos.olho2.borda.length})`);
}

// ------------------------------------------------------------ 7. os olhos e a boca (folhas no rosto, na pose A)
// a altura do rosto num (x, y): o ponto mais à frente da pele ali (um raio de frente). Sem pele ali (a ponta do
// traço dos cílios caía no cabelo do lado): a pele mais perto, indo para o meio do rosto
function frenteDaPele(x, y) {
  for (let k = 0; k < 30; k++) { const z = raioNaPele(x * (1 - k / 30), y); if (z > -Infinity) return z; }
  return 0;
}
function raioNaPele(x, y) {
  let melhor = -Infinity;
  for (let t = 0; t < NT; t++) {
    if (regiao[t] !== REG.pele) continue;
    const a = I[3 * t], b = I[3 * t + 1], c = I[3 * t + 2];
    const ax = P[3 * a], ay = P[3 * a + 1], bx = P[3 * b], by = P[3 * b + 1], cx = P[3 * c], cy = P[3 * c + 1];
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const w0 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, w1 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, w2 = 1 - w0 - w1;
    if (w0 < 0 || w1 < 0 || w2 < 0) continue;
    const z = w0 * P[3 * a + 2] + w1 * P[3 * b + 2] + w2 * P[3 * c + 2];
    if (z > melhor) melhor = z;
  }
  return melhor;
}
const extra = { pos: [], idx: [], reg: [] };   // os triângulos desenhados (pose A, unidades do arquivo)
// uma folha: o contorno (pontos 2D em x, y) em leque, cada ponto pousado na pele + `folga`
function folha(contorno, folga, reg) {
  const meio = contorno.reduce((a, p) => [a[0] + p[0] / contorno.length, a[1] + p[1] / contorno.length], [0, 0]);
  const pts = [meio, ...contorno], base = extra.pos.length / 3;
  for (const [x, y] of pts) extra.pos.push(x, y, frenteDaPele(x, y) + folga);
  for (let i = 1; i <= contorno.length; i++) { extra.idx.push(base, base + i, base + 1 + (i % contorno.length)); extra.reg.push(reg); }
}
const elipse = (cx, cy, rx, ry, giro = 0, n = 12, de = 0, ate = Math.PI * 2) => Array.from({ length: n }, (_, i) => {
  const a = de + (ate - de) * (i / n), x = Math.cos(a) * rx, y = Math.sin(a) * ry, c = Math.cos(giro), s = Math.sin(giro);
  return [cx + x * c - y * s, cy + x * s + y * c];
});
// (com o ROSTO DA MODELO 1 — `rosto` no recorte —, os olhos e a boca desenhados saem: o jogo põe os dela)
const ol = cfg.olhos;
for (const s of cfg.rosto ? [] : [1, -1]) {
  const cx = ol.x * s, cy = ol.y, w = ol.largura / 2, h = ol.altura / 2, g = (ol.giro * Math.PI / 180) * s;
  // o branco: amêndoa (mais reta embaixo)
  const amendoa = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2, x = Math.cos(a) * w, y = Math.sin(a) * h * (Math.sin(a) > 0 ? 1 : 0.7); return [cx + x * Math.cos(g) - y * Math.sin(g), cy + x * Math.sin(g) + y * Math.cos(g)]; });
  folha(amendoa, 0.0015, REG.branco);
  folha(elipse(cx - s * w * 0.08, cy, w * 0.52, h * 0.95, 0, 12), 0.0025, REG.iris);
  folha(elipse(cx - s * w * 0.08, cy - h * 0.05, w * 0.24, h * 0.5, 0, 10), 0.0033, REG.escuro);
  folha(elipse(cx - s * w * 0.08 - w * 0.2, cy + h * 0.38, w * 0.13, h * 0.2, 0, 8), 0.004, REG.brilho);
  // o traço de cima (cílios): uma faixa grossa pela borda de cima da amêndoa, com a ponta para fora
  // (no desenho do olho, +x é o canto de FORA; `aoOlho` gira pelo `giro` e espelha o olho direito)
  const th = ol.giro * Math.PI / 180, aoOlho = ([x, y]) => [cx + s * (x * Math.cos(th) - y * Math.sin(th)), cy + x * Math.sin(th) + y * Math.cos(th)];
  const arco = Array.from({ length: 9 }, (_, i) => { const a = Math.PI * (0.02 + 0.96 * i / 8); return [Math.cos(a) * w * 1.08, Math.sin(a) * h * 1.12]; });
  const fora = [[w * 1.32, h * 0.55], ...arco].map(aoOlho), dentro = [[w * 1.15, h * 0.35], ...arco.map(([x, y]) => [x * 0.93, y * 0.72 - h * 0.08])].map(aoOlho);
  // (a faixa não é convexa: vai em tiras)
  const base = extra.pos.length / 3, m = fora.length;
  for (const [x, y] of [...fora, ...dentro]) extra.pos.push(x, y, frenteDaPele(x, y) + 0.0042);
  for (let i = 0; i < m - 1; i++) {
    const a = base + i, b = base + i + 1, c = base + m + i, d = base + m + i + 1;
    if (s > 0) extra.idx.push(a, b, c, b, d, c); else extra.idx.push(a, c, b, b, c, d);
    extra.reg.push(REG.escuro, REG.escuro);
  }
}
const bo = cfg.boca;
if (!cfg.rosto) folha(elipse(0, bo.y, bo.largura / 2, bo.altura / 2, 0, 10), 0.0015, REG.boca);
// os desenhados: presos à cabeça; e pela pose A dos braços não passam (a cabeça não gira)
const iHead = NOMES.indexOf('Head');

// ------------------------------------------------------------ o arquivo do jogo
// os vértices: os do modelo (na pose T), os do couro (na cabeça: a pose T não a mexe) e os desenhados; só os que o
// CORPO usa (os do cabelo vão no `cabelo`, à parte), renumerados
const NN = novos.length, NE = extra.pos.length / 3, todos = NV + NN + NE;
const posDe = (i) => (i < NV ? cm([posT[3 * i], posT[3 * i + 1], posT[3 * i + 2]]) : i < NV + NN ? cm(novos[i - NV].toArray()) : cm(extra.pos.slice((i - NV - NN) * 3, (i - NV - NN) * 3 + 3)));
const trisDoCorpo = [], regDoCorpo = [];
for (let t = 0; t < NT; t++) if (regiao[t] !== REG.cabelo && regiao[t] !== REG.buraco) { trisDoCorpo.push(I[3 * t], I[3 * t + 1], I[3 * t + 2]); regDoCorpo.push(regiao[t]); }
for (const f of fechos) { trisDoCorpo.push(...f); regDoCorpo.push(REG.pele); }
for (let i = 0; i < extra.idx.length; i++) trisDoCorpo.push(extra.idx[i] + NV + NN);
regDoCorpo.push(...extra.reg);
const novoNumero = new Int32Array(todos).fill(-1), usados = [];
for (const i of trisDoCorpo) if (novoNumero[i] < 0) { novoNumero[i] = usados.length; usados.push(i); }
const todosPos = new Float32Array(usados.length * 3);
usados.forEach((i, j) => todosPos.set(posDe(i), j * 3));
const idx = new Uint16Array(trisDoCorpo.map((i) => novoNumero[i]));
const reg = new Uint8Array(regDoCorpo);
const ossoDe = new Uint8Array(usados.length * 4), peso = new Uint8Array(usados.length * 4);
for (const [j, i] of usados.entries()) {
  const w = i < NV ? pesos[i] : [[iHead, 1]];
  // (pesos em 0–255, a soma exata em 255: o resto vai para o maior)
  const q = w.map(([, p]) => Math.round(p * 255)), falta = 255 - q.reduce((a, b) => a + b, 0);
  q[0] += falta;
  w.forEach(([o], n) => { ossoDe[j * 4 + n] = o; peso[j * 4 + n] = q[n]; });
}
// O CABELO tirado do corpo (o penteado "malha" do penteado.js o desenha): os triângulos dele, na pose T (cm), e o
// meio da cabeça (`pivo`: é em volta dele que as réguas do penteado o aumentam e giram)
const trisDoCabelo = [];
for (let t = 0; t < NT; t++) if (regiao[t] === REG.cabelo) trisDoCabelo.push(I[3 * t], I[3 * t + 1], I[3 * t + 2]);
const numCabelo = new Map();
for (const i of trisDoCabelo) if (!numCabelo.has(i)) numCabelo.set(i, numCabelo.size);
const posCabelo = new Float32Array(numCabelo.size * 3);
for (const [i, j] of numCabelo) posCabelo.set(cm([posT[3 * i], posT[3 * i + 1], posT[3 * i + 2]]), j * 3);
const b64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
const saida = {
  _leiame: `Corpo de arquivo "${cfg.nome}" (js/corpo-arquivo.js), gerado por ferramentas/corpo-de-arquivo/importar.mjs a partir de ${cfg.entrada} — não edite à mão: mude o recorte e rode de novo. ossos: onde fica cada osso do guerreiro NESTE corpo (cm, pose T; os que faltam ficam onde estão). pos (Float32, cm, pose T), idx (Uint16), regiao (Uint8 por triângulo: ${Object.keys(REG).join(', ')}), nomes (os ossos dos pesos), ossoDe/peso (Uint8, 4 por vértice; peso em 255 avos): o corpo CARECA. cabelo: o cabelo do modelo, à parte (pos, idx; pivo = o meio da cabeça, cm) — o penteado "malha" (js/penteado.js). Tudo em base64.`,
  nome: cfg.nome, jogo: Object.fromEntries(Object.entries(cfg.jogo ?? {}).filter(([k2]) => k2 !== '_leiame')), ossos: ossosCm, nomes: NOMES,
  vertices: usados.length, triangulos: idx.length / 3,
  pos: b64(todosPos), idx: b64(idx), regiao: b64(reg), ossoDe: b64(ossoDe), peso: b64(peso),
  ...(cfg.rosto ? { rosto: buracos } : {}),
  cabelo: { pivo: cm(meioDaCabeca.toArray()).map((v) => +v.toFixed(2)), vertices: numCabelo.size, triangulos: trisDoCabelo.length / 3, pos: b64(posCabelo), idx: b64(new Uint16Array(trisDoCabelo.map((i) => numCabelo.get(i)))) },
};
const arqSaida = path.join(RAIZ, 'assets/corpos', `${cfg.nome}.json`);
fs.mkdirSync(path.dirname(arqSaida), { recursive: true });
fs.writeFileSync(arqSaida, JSON.stringify(saida, null, 1) + '\n');
console.log(`[corpo] gravado ${path.relative(RAIZ, arqSaida)}: o corpo com ${usados.length} vértices e ${idx.length / 3} triângulos, o cabelo com ${trisDoCabelo.length / 3} (${(fs.statSync(arqSaida).size / 1024).toFixed(0)} KB)`);

// ------------------------------------------------------------ as fotos de conferência
if (opc.conferir) {
  const pasta = path.resolve(opc.conferir);
  fs.mkdirSync(pasta, { recursive: true });
  const CORES = [[232, 190, 160], [70, 50, 45], [60, 70, 110], [245, 245, 240], [40, 120, 140], [25, 20, 20], [255, 255, 255], [180, 90, 100]];
  const vermelho = [255, 50, 50], azul = [60, 160, 255];
  // as juntas na pose A
  const pts = [...NOMES.map((n) => [J[n], vermelho]), ...Object.values(pontas).map((p) => [p, azul]), [pontaDaCabeca, azul]];
  prancha(path.join(pasta, `juntas-${cfg.nome}.png`), P, I, { vistas: [0, 90].map((g) => ({ giro: g, centro: [0, 0], escala: 270 })), W: 420, H: 560, pontos: pts });
  // o resultado na pose T, nas cores das regiões (de frente, de lado, de costas e o rosto)
  const corT = Array.from(reg, (r) => CORES[r]);
  const ossosPts = Object.values(ossosCm).map((p) => [p, vermelho]);
  prancha(path.join(pasta, `regioes-${cfg.nome}.png`), todosPos, idx, { vistas: [0, 90, 180].map((g) => ({ giro: g, centro: [0, 95], escala: 2.7 })), W: 520, H: 560, cores: corT, pontos: ossosPts });
  const olho = [0, cfg.alturaDosOlhos - 4];
  prancha(path.join(pasta, `rosto-${cfg.nome}.png`), todosPos, idx, { vistas: [0, 35, 90].map((g) => ({ giro: g, centro: olho, escala: 14 })), W: 380, H: 420, cores: corT });
  // OS PESOS: braços abaixados, cotovelo e joelho dobrados, a coluna e a cabeça giradas (cinemática direta simples)
  const pose = {
    ArmL: new THREE.Euler(0, 0, -1.1), ArmR: new THREE.Euler(0, 0, 1.1), ElbowL: new THREE.Euler(0, -1.0, 0), ElbowR: new THREE.Euler(0, 1.0, 0),
    Thighl: new THREE.Euler(-0.9, 0, 0), Shinl: new THREE.Euler(1.3, 0, 0), Spine001: new THREE.Euler(0.25, 0, 0), Head: new THREE.Euler(0, 0.6, 0),
  };
  const mundo = {}, ordem = NOMES.slice().sort((a, b) => profundidade(a) - profundidade(b));
  function profundidade(n) { let d = 0; for (let p = PAI[n]; p; p = PAI[p]) d++; return d; }
  for (const n of ordem) {
    const pai = PAI[n] in mundo ? mundo[PAI[n]] : new THREE.Matrix4();
    const j = V(ossosCm[n]), local = new THREE.Matrix4().makeTranslation(j.x, j.y, j.z).multiply(new THREE.Matrix4().makeRotationFromEuler(pose[n] ?? new THREE.Euler())).multiply(new THREE.Matrix4().makeTranslation(-j.x, -j.y, -j.z));
    mundo[n] = pai.clone().multiply(local);
  }
  const posP = new Float32Array(todosPos.length), v = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < usados.length; i++) {
    s.set(0, 0, 0);
    for (let j = 0; j < 4; j++) { const w = peso[i * 4 + j] / 255; if (!w) continue; s.addScaledVector(v.fromArray(todosPos, i * 3).applyMatrix4(mundo[NOMES[ossoDe[i * 4 + j]]]), w); }
    posP.set([s.x, s.y, s.z], i * 3);
  }
  prancha(path.join(pasta, `poses-${cfg.nome}.png`), posP, idx, { vistas: [0, 90, 180].map((g) => ({ giro: g, centro: [0, 95], escala: 2.7 })), W: 520, H: 560, cores: corT });
  console.log(`[corpo] fotos em ${pasta}`);
}
