#!/usr/bin/env node
// O MOLDE DE UM CABELO SOLTO de um .glb do Meshy (06/11/2026; o dono, com um .glb de 3 cabelos "Golden Shaggy Hair" lado a lado:
// "extrai o 1 e o 3 desses modelos e põe como penteado já: 'desgrenhado' e 'Preguiçoso'"):
//
//   node ferramentas/penteados/molde-do-glb.mjs <arquivo.glb> <nº do pedaço, da esquerda: 1, 2…> <nome-do-molde>
//
// 1. o PEDAÇO: os pedaços ligados da malha (os pontos repetidos soldados), da esquerda para a direita;
// 2. DE FRENTE: o Meshy gera cada um virado para um lado (o 3º, de perfil). O giro em volta do eixo de pé é o que deixa o cabelo
//    mais SIMÉTRICO em x (a distância de cada ponto espelhado ao ponto mais perto do cabelo), entre os dois giros simétricos o que
//    deixa a ABERTURA DO ROSTO (os raios na altura dos olhos que saem sem bater no cabelo) para a frente (+z);
// 3. centrado em x e z, em cm (a altura do cabelo do Lobo preguiçoso);
// 4. o CRÂNIO em que ele assenta: o cabelo solto não tem cabeça — vale a proporção do Lobo preguiçoso (assets/penteados/lobo-
//    preguicoso.json, ajustado pelo dono no Masculino jovem): a meia largura do cabelo na faixa de 18% a 25% da altura abaixo do topo
//    sobre a do crânio, o topo do cabelo acima do do crânio e o meio do fundo, cada um em frações da altura do cabelo. Daí, no jogo,
//    a forma `molde` o leva ao crânio de quem veste, expele da pele o que entrar e as réguas da aba Cabelo acertam o resto.
// Grava assets/penteados/<nome>.json (o mesmo formato do molde-da-colagem.mjs). O número dele em MOLDES (js/penteado.js): no FIM.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const [GLB, PEDACO, NOME] = process.argv.slice(2);
if (!GLB || !(Number(PEDACO) >= 1) || !/^[a-z0-9-]{1,40}$/.test(NOME ?? '')) { console.error('uso: node molde-do-glb.mjs <arquivo.glb> <nº do pedaço> <nome-do-molde>'); process.exit(1); }

// ---- a malha do .glb
const b = fs.readFileSync(GLB), jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString()), bin = b.subarray(20 + jl + 8);
const acc = (i) => {
  const a = j.accessors[i], bv = j.bufferViews[a.bufferView], n = { VEC3: 3, SCALAR: 1 }[a.type], C = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
  const off = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return new C(bin.buffer.slice(off, off + a.count * n * C.BYTES_PER_ELEMENT));
};
const prim = j.meshes[0].primitives[0], P = acc(prim.attributes.POSITION), I = acc(prim.indices), n = P.length / 3;

// ---- 1. os pedaços (soldando os pontos no mesmo lugar)
const par = new Int32Array(n).map((_, i) => i), raiz = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
const lugar = new Map(), solda = new Int32Array(n);
for (let v = 0; v < n; v++) { const k = [0, 1, 2].map((e) => Math.round(P[v * 3 + e] * 1e5)).join(); if (!lugar.has(k)) lugar.set(k, v); solda[v] = lugar.get(k); par[raiz(v)] = raiz(solda[v]); }
for (let t = 0; t < I.length; t += 3) { const a = raiz(I[t]); par[raiz(I[t + 1])] = a; par[raiz(I[t + 2])] = a; }
const grupos = new Map();
for (let t = 0; t < I.length; t += 3) { const r = raiz(I[t]); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(t); }
const pedacos = [...grupos.values()].filter((l) => l.length > 30).map((l) => ({ l, x: Math.min(...l.map((t) => P[I[t] * 3])) })).sort((a, c) => a.x - c.x);
const escolhido = pedacos[Number(PEDACO) - 1];
if (!escolhido) { console.error(`[molde] o .glb tem ${pedacos.length} pedaço(s)`); process.exit(1); }
// os pontos do pedaço (os soldados: um por lugar) e os triângulos nele
const novoDe = new Map(), pts = [], idx = [];
for (const t of escolhido.l) {
  const tri = [0, 1, 2].map((k) => { const v = solda[I[t + k]]; if (!novoDe.has(v)) { novoDe.set(v, pts.length); pts.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]); } return novoDe.get(v); });
  if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) idx.push(...tri);
}

// ---- 2. de frente
const caixa = (l) => [0, 1, 2].map((e) => [Math.min(...l.map((p) => p[e])), Math.max(...l.map((p) => p[e]))]);
let cx = caixa(pts);
const meio = [(cx[0][0] + cx[0][1]) / 2, 0, (cx[2][0] + cx[2][1]) / 2];
const girado = (g) => pts.map(([x, y, z]) => { const dx = x - meio[0], dz = z - meio[2]; return [dx * Math.cos(g) + dz * Math.sin(g), y, -dx * Math.sin(g) + dz * Math.cos(g)]; });
// (a simetria: o ponto espelhado em x, a que distância do ponto mais perto do cabelo — a média; o meio em x, o da caixa)
const assimetria = (l) => {
  const c = caixa(l), m = (c[0][0] + c[0][1]) / 2;
  let s = 0;
  for (const p of l) { const q = [2 * m - p[0], p[1], p[2]]; let d = Infinity; for (const r of l) d = Math.min(d, (r[0] - q[0]) ** 2 + (r[1] - q[1]) ** 2 + (r[2] - q[2]) ** 2); s += Math.sqrt(d); }
  return s / l.length;
};
// (a abertura do rosto: dos raios na altura dos olhos — 35%, 45% e 55% da altura —, a direção média dos que saem sem bater)
const sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]], cross = (a, c) => [a[1] * c[2] - a[2] * c[1], a[2] * c[0] - a[0] * c[2], a[0] * c[1] - a[1] * c[0]], dot = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
const bate = (o, d, a, c, e) => { const e1 = sub(c, a), e2 = sub(e, a), h = cross(d, e2), det = dot(e1, h); if (Math.abs(det) < 1e-12) return false; const f = 1 / det, s = sub(o, a), u = f * dot(s, h); if (u < 0 || u > 1) return false; const q = cross(s, e1), v = f * dot(d, q); return v >= 0 && u + v <= 1 && f * dot(e2, q) > 0; };
const rosto = (l) => {
  const c = caixa(l);
  let sx = 0, sz = 0;
  for (const fy of [0.35, 0.45, 0.55]) {
    const o = [(c[0][0] + c[0][1]) / 2, c[1][0] + fy * (c[1][1] - c[1][0]), (c[2][0] + c[2][1]) / 2];
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * 2 * Math.PI, d = [Math.sin(a), 0, Math.cos(a)];
      let livre = true;
      for (let t = 0; t < idx.length && livre; t += 3) if (bate(o, d, l[idx[t]], l[idx[t + 1]], l[idx[t + 2]])) livre = false;
      if (livre) { sx += d[0]; sz += d[2]; }
    }
  }
  return Math.atan2(sx, sz);   // (0 = de frente, +z)
};
let melhor = { g: 0, a: Infinity };
for (let k = 0; k < 72; k++) { const g = (k / 72) * Math.PI; const a = assimetria(girado(g)); if (a < melhor.a) melhor = { g, a }; }
for (const dg of [-1.25, 1.25].map((x) => (x * Math.PI) / 180)) { const a = assimetria(girado(melhor.g + dg)); if (a < melhor.a) melhor = { g: melhor.g + dg, a }; }
// (os dois giros simétricos — g e g + 180° —: o que põe o rosto na frente)
const g0 = Math.abs(rosto(girado(melhor.g))) <= Math.abs(rosto(girado(melhor.g + Math.PI))) ? melhor.g : melhor.g + Math.PI;
let frente = girado(g0);
const sobra = rosto(frente);

// ---- 3. centrado e em cm, da altura do Lobo preguiçoso
const lobo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/penteados/lobo-preguicoso.json'), 'utf8'));
const loboPts = Array.from({ length: lobo.pos.length / 3 }, (_, i) => lobo.pos.slice(i * 3, i * 3 + 3));
const cl = caixa(loboPts), altoLobo = cl[1][1] - cl[1][0];
cx = caixa(frente);
const k = altoLobo / (cx[1][1] - cx[1][0]), mx = (cx[0][0] + cx[0][1]) / 2, mz = (cx[2][0] + cx[2][1]) / 2;
frente = frente.map(([x, y, z]) => [(x - mx) * k, cl[1][0] + (y - cx[1][0]) * k, (z - mz) * k]);

// ---- 4. o crânio, na proporção do Lobo
const faixa = (l) => {
  const c = caixa(l), y1 = c[1][1], alto = y1 - c[1][0], de = y1 - alto * 0.25, ate = y1 - alto * 0.18;
  let lg = 0, z0 = Infinity, z1 = -Infinity;
  for (const p of l) if (p[1] > de && p[1] < ate) { lg = Math.max(lg, Math.abs(p[0])); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
  return { y1, alto, l: lg, z: (z0 + z1) / 2 };
};
const fl = faixa(loboPts), fc = lobo.cranio, fn = faixa(frente);
const r3 = (v) => Math.round(v * 1000) / 1000;
const cranio = { topo: r3(fn.y1 - ((fl.y1 - fc.topo) / fl.alto) * fn.alto), l: r3(fn.l / (fl.l / fc.l)), z: r3(fn.z - ((fl.z - fc.z) / fl.alto) * fn.alto) };

const saida = path.join(RAIZ, 'assets/penteados', `${NOME}.json`);
fs.writeFileSync(saida, JSON.stringify({
  _leiame: `O MOLDE "${NOME}" (js/penteado.js, a forma \`molde\`): o pedaço ${PEDACO} (da esquerda) de ${path.basename(GLB)}, de frente (girado ${Math.round((g0 * 180) / Math.PI)}°), centrado, em cm — pos, idx (virada para fora) — e o crânio em que ele assenta (cranio: topo, l, z, cm; o cabelo solto não tem cabeça: a proporção do Lobo preguiçoso). Gerado por ferramentas/penteados/molde-do-glb.mjs: não edite à mão.`,
  pos: frente.flat().map(r3), idx, cranio,
}) + '\n');
console.log(`[molde] ${NOME}: o pedaço ${PEDACO} de ${pedacos.length}, ${idx.length / 3} triângulos, ${frente.length} pontos; girado ${((g0 * 180) / Math.PI).toFixed(1)}° (assimetria ${(melhor.a * k).toFixed(2)} cm; o rosto ficou a ${((sobra * 180) / Math.PI).toFixed(0)}° da frente); crânio ${JSON.stringify(cranio)} (o do Lobo: ${JSON.stringify(fc)})`);
