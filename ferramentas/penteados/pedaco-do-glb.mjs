#!/usr/bin/env node
// UM PEDAÇO DE UM .glb, num .glb só dele (08/11/2026; o dono, com o Midnight Raven Hair — o mesmo cabelo em 3 vistas lado a lado —:
// "carrega ele como os busto, permita eu copiar ele e mover como item"): para virar MODELO SOLTO da aba Modelo do editor
// (`pecas/modelos/`, `SOLTOS` no modelagempagina.js), de onde a "copiar malha ⧉" o cola na cabeça de um corpo. Depois de o dono o
// pôr no lugar e salvar, o molde sai da colagem: `molde-da-colagem.mjs` (o caminho do Lobo preguiçoso).
//
//   node ferramentas/penteados/pedaco-do-glb.mjs <arquivo.glb> <nº do pedaço, da esquerda: 1, 2…> <saida.glb> [--vista]
//
// Os pedaços são os do molde-do-glb.mjs (os pontos repetidos soldados; da esquerda para a direita). O pedaço sai como veio (sem
// girar nem mudar de tamanho), só centrado em x e z; só a posição e os triângulos (a aba calcula as normais).
// `--vista` (08/11/2026, o "Platinum Winds Ponytail": as mechas soltas, 10 e 54 pedaços, e a cabeça junto): o nº é o da VISTA — os
// pedaços juntados pela faixa de x (o Meshy põe frente, costas e perfil lado a lado), todos, até as mechas pequenas.
import fs from 'node:fs';

const VISTA = process.argv.includes('--vista');
const [GLB, PEDACO, SAIDA] = process.argv.slice(2).filter((a) => a !== '--vista');
if (!GLB || !(Number(PEDACO) >= 1) || !SAIDA?.endsWith('.glb')) { console.error('uso: node pedaco-do-glb.mjs <arquivo.glb> <nº do pedaço> <saida.glb> [--vista]'); process.exit(1); }

const b = fs.readFileSync(GLB), jl = b.readUInt32LE(12), j = JSON.parse(b.subarray(20, 20 + jl).toString()), bin = b.subarray(20 + jl + 8);
const acc = (i) => {
  const a = j.accessors[i], bv = j.bufferViews[a.bufferView], n = { VEC3: 3, SCALAR: 1 }[a.type], C = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType];
  const off = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return new C(bin.buffer.slice(off, off + a.count * n * C.BYTES_PER_ELEMENT));
};
const prim = j.meshes[0].primitives[0], P = acc(prim.attributes.POSITION), I = acc(prim.indices), n = P.length / 3;

// os pedaços (soldando os pontos no mesmo lugar), como no molde-do-glb.mjs
const par = new Int32Array(n).map((_, i) => i), raiz = (x) => { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
const lugar = new Map(), solda = new Int32Array(n);
for (let v = 0; v < n; v++) { const k = [0, 1, 2].map((e) => Math.round(P[v * 3 + e] * 1e5)).join(); if (!lugar.has(k)) lugar.set(k, v); solda[v] = lugar.get(k); par[raiz(v)] = raiz(solda[v]); }
for (let t = 0; t < I.length; t += 3) { const a = raiz(I[t]); par[raiz(I[t + 1])] = a; par[raiz(I[t + 2])] = a; }
const grupos = new Map();
for (let t = 0; t < I.length; t += 3) { const r = raiz(I[t]); if (!grupos.has(r)) grupos.set(r, []); grupos.get(r).push(t); }
let pedacos = [...grupos.values()].filter((l) => VISTA || l.length > 30).map((l) => ({ l, x: Math.min(...l.flatMap((t) => [0, 1, 2].map((k) => P[I[t + k] * 3]))), x1: Math.max(...l.flatMap((t) => [0, 1, 2].map((k) => P[I[t + k] * 3]))) })).sort((a, c) => a.x - c.x);
// (as VISTAS: os pedaços cuja faixa de x encosta na da vista que está crescendo — um vão de 1% da largura toda separa)
if (VISTA) {
  const folga = (Math.max(...pedacos.map((p) => p.x1)) - pedacos[0].x) * 0.01, vistas = [];
  for (const p of pedacos) { const v = vistas.at(-1); if (v && p.x <= v.x1 + folga) { v.l.push(...p.l); v.x1 = Math.max(v.x1, p.x1); v.n++; } else vistas.push({ l: [...p.l], x: p.x, x1: p.x1, n: 1 }); }
  console.log(`[pedaço] ${vistas.length} vista(s): ${vistas.map((v) => `${v.n} pedaço(s), x ${v.x.toFixed(3)} a ${v.x1.toFixed(3)}`).join(' · ')}`);
  pedacos = vistas;
}
const escolhido = pedacos[Number(PEDACO) - 1];
if (!escolhido) { console.error(`[pedaço] o .glb tem ${pedacos.length} ${VISTA ? 'vista' : 'pedaço'}(s)`); process.exit(1); }

const novoDe = new Map(), pts = [], idx = [];
for (const t of escolhido.l) {
  const tri = [0, 1, 2].map((k) => { const v = solda[I[t + k]]; if (!novoDe.has(v)) { novoDe.set(v, pts.length); pts.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]); } return novoDe.get(v); });
  if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) idx.push(...tri);
}
// centrado em x e z (a altura fica: a aba põe o pé no chão, ou o topo em `TOPO_DO_SOLTO`)
const mn = [0, 1, 2].map((e) => Math.min(...pts.map((p) => p[e]))), mx = [0, 1, 2].map((e) => Math.max(...pts.map((p) => p[e])));
const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2;
const pos = new Float32Array(pts.flatMap(([x, y, z]) => [x - cx, y, z - cz])), ind = new Uint32Array(idx);

// o .glb: uma malha, POSITION + índices
const alinhar = (buf, enchimento) => { const r = buf.length % 4; return r ? Buffer.concat([buf, Buffer.alloc(4 - r, enchimento)]) : buf; };
const bPos = Buffer.from(pos.buffer), bInd = Buffer.from(ind.buffer), corpo = Buffer.concat([bPos, bInd]);
const pmin = [0, 1, 2].map((e) => Math.min(...Array.from({ length: pos.length / 3 }, (_, i) => pos[i * 3 + e]))), pmax = [0, 1, 2].map((e) => Math.max(...Array.from({ length: pos.length / 3 }, (_, i) => pos[i * 3 + e])));
const gltf = {
  asset: { version: '2.0', generator: 'ferramentas/penteados/pedaco-do-glb.mjs' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'pedaco', mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  buffers: [{ byteLength: corpo.length }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bPos.length, target: 34962 }, { buffer: 0, byteOffset: bPos.length, byteLength: bInd.length, target: 34963 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: pmin, max: pmax }, { bufferView: 1, componentType: 5125, count: ind.length, type: 'SCALAR' }],
};
const js = alinhar(Buffer.from(JSON.stringify(gltf)), 0x20), dados = alinhar(corpo, 0);
const cab = Buffer.alloc(12), cj = Buffer.alloc(8), cb = Buffer.alloc(8);
cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + js.length + 8 + dados.length, 8);
cj.writeUInt32LE(js.length, 0); cj.writeUInt32LE(0x4e4f534a, 4); cb.writeUInt32LE(dados.length, 0); cb.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(SAIDA, Buffer.concat([cab, cj, js, cb, dados]));
console.log(`[pedaço] ${SAIDA}: ${VISTA ? 'a vista' : 'o pedaço'} ${PEDACO} de ${pedacos.length}, ${ind.length / 3} triângulos, ${pos.length / 3} pontos; ${((pmax[1] - pmin[1]) * 100).toFixed(1)} de altura × ${((pmax[0] - pmin[0]) * 100).toFixed(1)} de largura (em cm, na aba)`);
