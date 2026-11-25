#!/usr/bin/env node
// TAPAR OS BURACOS do modelo de um chefe de arquivo (25/11/2026; a Mycohydra — o dono: "a cabeça 1 (do meio) tem na parte inferior do
// cogumelo um pedaço sem malha, consegue preencher?"). O .glb do Meshy tem buracos: bordas de UM triângulo só, em laços. Esta ferramenta
// acha os laços e TAPA cada um só com os pontos que já existem (ear clipping no plano do laço; um laço que se toca num ponto vira dois),
// com o sentido certo (a face para fora, como as vizinhas) e o UV dos cantos; as normais de antes ficam.
//
//   node ferramentas/chefe-de-arquivo/tapar-buracos.mjs <config.json> [--perto=x,y,z] [--raio=r] [--listar]
//
// --listar: só mostra os laços (pontos, centro, raio — no espaço do original). --perto/--raio: só os laços com o centro a menos de `raio`
// (padrão 0,05) do ponto; sem eles, TODOS. O conserto vai no MODELO-BASE (`original` do config): o .glb cru do Meshy é guardado ao lado
// (`<original>-cru.glb`, só da primeira vez) e a textura vem dele. Se a fonte de agora é o original, o rigar.mjs refaz o chefe; se é uma
// editada, ela fica como está (simplifique ou grave de novo a partir do original para levar o conserto).
import fs from 'node:fs';
import path from 'node:path';
import { lerConfig, caminhos, lerGlb, escreverGlb, usarFonte } from './fonte.mjs';

const args = process.argv.slice(2), arqCfg = args.find((a) => !a.startsWith('--'));
const opc = (n) => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
if (!arqCfg) { console.error('uso: node ferramentas/chefe-de-arquivo/tapar-buracos.mjs <config.json> [--perto=x,y,z] [--raio=r] [--listar]'); process.exit(1); }
const { cfg } = lerConfig(arqCfg), c = caminhos(arqCfg, cfg);
const cru = c.original.replace(/\.glb$/, '-cru.glb');
const m = lerGlb(c.original);

// ---- soldar (a costura da textura repete o ponto) e as arestas de um triângulo só, com o sentido do tampão (ao contrário do vizinho)
const N = m.pos.length / 3, sold = new Int32Array(N), mapa = new Map(), P = [];
for (let i = 0; i < N; i++) {
  const k = `${Math.round(m.pos[i * 3] * 1e5)},${Math.round(m.pos[i * 3 + 1] * 1e5)},${Math.round(m.pos[i * 3 + 2] * 1e5)}`;
  if (!mapa.has(k)) { mapa.set(k, P.length / 3); P.push(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]); }
  sold[i] = mapa.get(k);
}
const conta = new Map();
const chave = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
for (let t = 0; t < m.idx.length; t += 3) for (let e = 0; e < 3; e++) {
  const a = sold[m.idx[t + e]], b = sold[m.idx[t + (e + 1) % 3]];
  if (a !== b) conta.set(chave(a, b), (conta.get(chave(a, b)) ?? 0) + 1);
}
const saem = new Map(), cruDe = new Map();   // (o tampão anda b → a; o vértice cru de cada ponto da borda: o UV dele)
for (let t = 0; t < m.idx.length; t += 3) for (let e = 0; e < 3; e++) {
  const ia = m.idx[t + e], ib = m.idx[t + (e + 1) % 3], a = sold[ia], b = sold[ib];
  if (a === b || conta.get(chave(a, b)) !== 1) continue;
  (saem.get(b) ?? saem.set(b, []).get(b)).push(a);
  if (!cruDe.has(a)) cruDe.set(a, ia);
  if (!cruDe.has(b)) cruDe.set(b, ib);
}
// ---- os laços: seguindo as arestas (cada uma uma vez); um ponto com duas saídas (o laço que se toca) parte o laço em dois
const usadas = new Set(), lacos = [];
for (const [v0, l0] of saem) for (const w0 of l0) {
  if (usadas.has(`${v0}>${w0}`)) continue;
  const laco = [v0];
  let v = v0, w = w0;
  while (true) {
    usadas.add(`${v}>${w}`);
    if (w === v0) break;
    // (se `w` já está no laço, fecha o pedaço de lá até aqui como um laço próprio)
    const j = laco.indexOf(w);
    if (j >= 0) { lacos.push(laco.splice(j)); }
    laco.push(w);
    const prox = (saem.get(w) ?? []).find((x) => !usadas.has(`${w}>${x}`));
    if (prox == null) break;
    v = w; w = prox;
  }
  if (laco.length >= 3) lacos.push(laco);
}
const centro = (l) => [0, 1, 2].map((e) => l.reduce((s, v) => s + P[v * 3 + e], 0) / l.length);
const raioDe = (l) => { const k = centro(l); return Math.max(...l.map((v) => Math.hypot(P[v * 3] - k[0], P[v * 3 + 1] - k[1], P[v * 3 + 2] - k[2]))); };
if (args.includes('--listar')) {
  for (const l of [...lacos].sort((a, b) => raioDe(b) - raioDe(a))) console.log(`  ${l.length} pontos, raio ${raioDe(l).toFixed(4)}, centro ${centro(l).map((x) => x.toFixed(3)).join(', ')}`);
  process.exit(0);
}
const perto = opc('perto')?.split(',').map(Number), raio = Number(opc('raio') ?? 0.05);
const escolhidos = perto ? lacos.filter((l) => { const k = centro(l); return Math.hypot(k[0] - perto[0], k[1] - perto[1], k[2] - perto[2]) < raio; }) : lacos;
if (!escolhidos.length) { console.error('[tapar] nenhum buraco aí (rode com --listar)'); process.exit(1); }

// ---- tapar: ear clipping no plano do laço (a normal de Newell), na ordem do tampão
function tapar(l) {
  const n = [0, 0, 0];
  for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; n[0] += (P[p * 3 + 1] - P[q * 3 + 1]) * (P[p * 3 + 2] + P[q * 3 + 2]); n[1] += (P[p * 3 + 2] - P[q * 3 + 2]) * (P[p * 3] + P[q * 3]); n[2] += (P[p * 3] - P[q * 3]) * (P[p * 3 + 1] + P[q * 3 + 1]); }
  const ln = Math.hypot(...n) || 1; n.forEach((x, i) => { n[i] = x / ln; });
  // (uma base no plano)
  const u = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], ux = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
  const lu = Math.hypot(...ux); ux.forEach((x, i) => { ux[i] = x / lu; });
  const uy = [n[1] * ux[2] - n[2] * ux[1], n[2] * ux[0] - n[0] * ux[2], n[0] * ux[1] - n[1] * ux[0]];
  const p2 = (v) => [ux[0] * P[v * 3] + ux[1] * P[v * 3 + 1] + ux[2] * P[v * 3 + 2], uy[0] * P[v * 3] + uy[1] * P[v * 3 + 1] + uy[2] * P[v * 3 + 2]];
  const area2 = (a, b, q) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);
  const dentro = (q, a, b, d) => area2(a, b, q) > 0 && area2(b, d, q) > 0 && area2(d, a, q) > 0;
  const resto = [...l], tris = [];
  let guarda = 0;
  while (resto.length > 3 && guarda++ < 1000) {
    let cortou = false;
    for (let i = 0; i < resto.length; i++) {
      const a = resto[(i + resto.length - 1) % resto.length], b = resto[i], d = resto[(i + 1) % resto.length];
      const A = p2(a), B = p2(b), D = p2(d);
      if (area2(A, B, D) <= 0) continue;   // (canto côncavo)
      if (resto.some((x) => x !== a && x !== b && x !== d && dentro(p2(x), A, B, D))) continue;
      tris.push([a, b, d]); resto.splice(i, 1); cortou = true; break;
    }
    if (!cortou) break;
  }
  if (resto.length === 3) tris.push(resto);
  else for (let i = 1; i + 1 < resto.length; i++) tris.push([resto[0], resto[i], resto[i + 1]]);   // (o que sobrar: em leque)
  return tris;
}
const novos = escolhidos.flatMap(tapar);
// (o sentido: a face do tampão deve olhar como a normal de Newell da ordem do tampão — o ear clipping já segue essa ordem)
const idx = [...m.idx];
for (const t of novos) idx.push(...t.map((v) => cruDe.get(v)));
console.log(`[tapar] ${escolhidos.length} buraco(s), ${novos.length} triângulo(s) novo(s): ${escolhidos.map((l) => `${l.length} pontos em ${centro(l).map((x) => x.toFixed(3)).join(', ')}`).join(' · ')}`);

// ---- grava: o cru guardado (da primeira vez), o modelo-base consertado, e o chefe refeito se a fonte é ele
if (!fs.existsSync(cru)) fs.copyFileSync(c.original, cru);
const r = escreverGlb(c.original, cru, { pos: m.pos, uv: m.uv, idx, normal: lerNormais(cru) });
console.log(`[tapar] ${path.basename(c.original)}: ${r.triangulos} triângulos (o cru em ${path.basename(cru)})`);
if (path.resolve(c.fonte) === path.resolve(c.original)) usarFonte(arqCfg, path.basename(c.original));
else console.log(`[tapar] a fonte de agora é ${path.basename(c.fonte)} (não o original): ela fica como está`);

function lerNormais(caminho) {
  const g = lerGlb(caminho), prim = g.J.meshes[0].primitives[0];
  if (prim.attributes.NORMAL == null) return null;
  const a = g.J.accessors[prim.attributes.NORMAL], v = g.J.bufferViews[a.bufferView], ini = g.BIN.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return new Float32Array(g.BIN.buffer.slice(ini, ini + a.count * 3 * 4));
}
