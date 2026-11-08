#!/usr/bin/env node
// FECHAR O VÃO DA BOCA de um corpo de arquivo com a boca de OUTRO corpo (02/11/2026; o dono, no Masculino: "apaga os fantasmas
// restantes e refaz essa região que ficou um vão. Se precisar exporta a boca feminina pra aquele vão e fecha ao redor dela"):
//
//   node ferramentas/corpo-de-arquivo/fechar-boca.mjs <recorte.json> --chave humano:arquivo5 --de feminino4 --chave-de humano:arquivo3
//        [--escala 0.8] [--y 164.3] [--z 9.35] [--marcas <arquivo> --marca <id>] [--ver <arquivo>] [--gravar]
//
// 1. os CORTES saem de vez da malha (o fantasma some), os TRIÂNGULOS CRIADOS viram malha, os pedaços soltos são apagados e as
//    DOBRAS abaixo são juntadas;
// 2. a boca do outro corpo (a lista `boca` das edições dele, com os `movidos` e os criados) vem para o vão: `escala` uniforme,
//    a linha da boca em `y` e os cantos dela em `z` (cm, pose T);
// 3. o que sobra entre a boca e a beira do vão é triangulado (metade x ≥ 0, Delaunay com a beira presa, e espelhado) com os
//    PONTOS abaixo; o z deles vem do formato ORIGINAL do .glb, pela mediana em volta, porque a pele ali tinha dobras do Meshy.
//
// Sem --gravar só mede (--ver grava os dados para uma prancha). Com --gravar: as edições de antes vão para
// `<nome>-edicoes-antes-boca.json`, a malha de antes para `<nome>-simples-antes.json`, a nova para `<nome>-simples.json`, os cortes e
// os criados saem do modelagem.json, a marca passa para os lábios novos e o corpo é refeito.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// os pontos da pele nova, metade direita (x, y em cm): o sulco e o queixo no meio; o lado do lábio, o canto da boca e o queixo
const PONTOS_MEIO = [[0, 162.75], [0, 161.8]];
const PONTOS_LADO = [[1.75, 165.2], [2.95, 164.95], [3.25, 163.75], [2.4, 163.05], [1.2, 162.8], [2.3, 162.3], [1.2, 161.85]];
// o vinco que a malha antiga deixou na base do filtro: [o ponto que some, o vizinho que fica] (o lado de lá vai junto)
const DOBRAS = [[[0.5, 165.94, 10.5], [0.49, 165.8, 10.65]]];

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const args = process.argv.slice(2), recorte = args[0];
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const CHAVE = opt('chave'), DE = opt('de'), CHAVE_DE = opt('chave-de'), ESCALA = Number(opt('escala', 0.8)), Y_BOCA = Number(opt('y', 164.3)), Z_BOCA = Number(opt('z', 9.35));
const ARQ_MARCAS = opt('marcas'), ID_MARCA = opt('marca'), GRAVAR = args.includes('--gravar');
if (!recorte || !CHAVE || !DE || !CHAVE_DE) { console.error('uso: node fechar-boca.mjs <recorte.json> --chave humano:arquivoN --de <corpo> --chave-de humano:arquivoM [--escala 0.8] [--y 164.3] [--z 9.35] [--marcas <arquivo> --marca <id>] [--ver <arquivo>] [--gravar]'); process.exit(1); }
const falha = (m) => { console.error(`[corpo] ${m}`); process.exit(1); };
const cfg = JSON.parse(fs.readFileSync(path.resolve(RAIZ, recorte), 'utf8'));
const arq = (s) => path.join(AQUI, `${cfg.nome}${s}`), SIMPLES = arq('-simples.json'), ANTES = arq('-simples-antes.json');
const de64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const lerCorpo = (nome) => { const c = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/corpos', `${nome}.json`), 'utf8')); return { P: de64(c.pos, Float32Array), I: de64(c.idx32, Uint32Array) }; };
function lerGlb(a) {
  const b = fs.readFileSync(path.resolve(RAIZ, a)), jl = b.readUInt32LE(12), jg = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')), bin = b.subarray(20 + jl + 8);
  const acc = (i) => { const x = jg.accessors[i], bv = jg.bufferViews[x.bufferView], n = { VEC3: 3, VEC2: 2, SCALAR: 1 }[x.type], C = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[x.componentType], off = bin.byteOffset + (bv.byteOffset ?? 0) + (x.byteOffset ?? 0); return new C(bin.buffer.slice(off, off + x.count * n * C.BYTES_PER_ELEMENT)); };
  const prim = jg.meshes[0].primitives[0];
  return { pos: acc(prim.attributes.POSITION), normal: acc(prim.attributes.NORMAL), uv: prim.attributes.TEXCOORD_0 != null ? acc(prim.attributes.TEXCOORD_0) : null, idx: acc(prim.indices) };
}
const glb = lerGlb(cfg.entrada), fonte = fs.existsSync(SIMPLES) ? JSON.parse(fs.readFileSync(SIMPLES, 'utf8')) : glb;
const { P, I } = lerCorpo(cfg.nome);
if (I.length !== fonte.idx.length || I.some((v, i) => v !== fonte.idx[i])) falha('o corpo não é da malha de agora: rode o importar.mjs antes');
const nt = I.length / 3, nv = P.length / 3;
const pt = (v, A = P) => [A[v * 3], A[v * 3 + 1], A[v * 3 + 2]];
const meioDe = (C, t) => [0, 1, 2].map((e) => (C.P[C.I[t * 3] * 3 + e] + C.P[C.I[t * 3 + 1] * 3 + e] + C.P[C.I[t * 3 + 2] * 3 + e]) / 3);
const perto = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const corpoM = { P, I }, MEIOS = Array.from({ length: nt }, (_, t) => meioDe(corpoM, t));
const triDe = (meios, em, lim = 0.03) => { let b = -1, d = lim; meios.forEach((m, t) => { const q = perto(m, em); if (q < d) { d = q; b = t; } }); return b; };
const pontoDe = (A, em, lim = 0.05) => { let b = -1, d = lim; for (let v = 0; v < A.length / 3; v++) { const q = perto(pt(v, A), em); if (q < d) { d = q; b = v; } } return b; };

// ---- as edições
const ARQ_MOD = path.join(RAIZ, 'assets/modelagem.json'), textoMod = fs.readFileSync(ARQ_MOD, 'utf8'), MOD = JSON.parse(textoMod).corpos, ed = MOD[CHAVE], edDe = MOD[CHAVE_DE];
if (!ed?.cortes?.length) falha(`${CHAVE} não tem cortes: o vão já foi fechado?`);
if (!edDe?.boca?.length) falha(`${CHAVE_DE} não tem a lista boca`);

// ---- 1. os cortes saem, os criados entram
const vivo = new Uint8Array(nt).fill(1);
for (const c of ed.cortes) { const t = triDe(MEIOS, c.em); if (t < 0) falha(`corte sem triângulo: ${c.em}`); vivo[t] = 0; }
const criados = [];
for (const n of ed.novos ?? []) {
  const a = n.cantos.map((c) => pontoDe(P, c.em));
  if (a.includes(-1)) falha(`criado com canto fora da malha: ${JSON.stringify(n.cantos)}`);
  criados.push(a);
  if (n.espelho) { const b = n.cantos.map((c) => pontoDe(P, [-c.em[0], c.em[1], c.em[2]])); if ([...b].sort().join() !== [...a].sort().join()) criados.push(b); }
}
// as dobrinhas da malha antiga na beira do vão: o ponto vai para o vizinho, dos dois lados
const tocados = new Set();
let nDobras = 0;
for (const [de, para] of DOBRAS) for (const s of [1, -1]) {
  const u = pontoDe(P, [s * de[0], de[1], de[2]]), v = pontoDe(P, [s * para[0], para[1], para[2]]);
  if (u < 0 || v < 0) falha(`dobra fora da malha: ${de}`);
  for (let t = 0; t < nt; t++) {
    if (!vivo[t] || (I[t * 3] !== u && I[t * 3 + 1] !== u && I[t * 3 + 2] !== u)) continue;
    for (let k = 0; k < 3; k++) { tocados.add(I[t * 3 + k]); if (I[t * 3 + k] === u) I[t * 3 + k] = v; }
    if (I[t * 3] === I[t * 3 + 1] || I[t * 3 + 1] === I[t * 3 + 2] || I[t * 3] === I[t * 3 + 2]) { vivo[t] = 0; nDobras++; }
  }
}
// os pedaços soltos (quem não está ligado ao maior) são apagados
const pai = Int32Array.from({ length: nv }, (_, i) => i), raiz = (x) => { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; };
const ligar = (a, b, c) => { pai[raiz(a)] = raiz(b); pai[raiz(c)] = raiz(b); };
for (let t = 0; t < nt; t++) if (vivo[t]) ligar(I[t * 3], I[t * 3 + 1], I[t * 3 + 2]);
for (const [a, b, c] of criados) ligar(a, b, c);
const tamanhos = new Map();
for (let t = 0; t < nt; t++) if (vivo[t]) tamanhos.set(raiz(I[t * 3]), (tamanhos.get(raiz(I[t * 3])) ?? 0) + 1);
const maior = [...tamanhos].sort((a, b) => b[1] - a[1])[0][0];
let nSoltos = 0;
for (let t = 0; t < nt; t++) if (vivo[t] && raiz(I[t * 3]) !== maior) { vivo[t] = 0; nSoltos++; }

// ---- a orientação dos criados (a aresta dividida anda ao contrário da do vizinho) e o vão
const dirigidas = new Set();
for (let t = 0; t < nt; t++) if (vivo[t]) for (let k = 0; k < 3; k++) dirigidas.add(`${I[t * 3 + k]}_${I[t * 3 + (k + 1) % 3]}`);
const faltam = [...criados], orientados = [];
for (let volta = 0; faltam.length && volta < 20; volta++) {
  for (let i = faltam.length - 1; i >= 0; i--) {
    const q = faltam[i], lig = [0, 1, 2].map((k) => [q[k], q[(k + 1) % 3]]);
    const certo = lig.some(([a, b]) => dirigidas.has(`${b}_${a}`)), errado = lig.some(([a, b]) => dirigidas.has(`${a}_${b}`));
    if (!certo && !errado) continue;
    const o = certo ? q : [q[0], q[2], q[1]];
    for (let k = 0; k < 3; k++) dirigidas.add(`${o[k]}_${o[(k + 1) % 3]}`);
    orientados.push(o);
    faltam.splice(i, 1);
  }
}
if (faltam.length) falha('um triângulo criado não encosta na malha');
const contagem = new Map();
const conta = (a, b) => { const q = a < b ? `${a}_${b}` : `${b}_${a}`; contagem.set(q, (contagem.get(q) ?? 0) + 1); };
for (let t = 0; t < nt; t++) if (vivo[t]) for (let k = 0; k < 3; k++) conta(I[t * 3 + k], I[t * 3 + (k + 1) % 3]);
for (const o of orientados) for (let k = 0; k < 3; k++) conta(o[k], o[(k + 1) % 3]);
const beira = [...contagem].filter(([, n]) => n === 1).map(([q]) => q.split('_').map(Number));
if ([...contagem.values()].some((n) => n > 2)) falha('aresta com mais de dois triângulos');
const viz = new Map();
for (const [a, b] of beira) { if (!viz.has(a)) viz.set(a, []); if (!viz.has(b)) viz.set(b, []); viz.get(a).push(b); viz.get(b).push(a); }
if ([...viz.values()].some((l) => l.length !== 2)) falha('a beira do vão se toca');
const laco = [beira[0][0]];
for (let ant = -1, cur = laco[0]; ;) { const nx = viz.get(cur).find((x) => x !== ant); if (nx === laco[0]) break; laco.push(nx); ant = cur; cur = nx; }
if (laco.length !== beira.length) falha(`mais de um vão: ${beira.length} arestas de beira, ${laco.length} num laço`);
// a metade direita da beira: de baixo para cima (a ordem do laço pode vir nos dois sentidos)
const noMeio = (v) => Math.abs(P[v * 3]) < 1e-3;
const iTopo = laco.findIndex((v) => noMeio(v));
if (iTopo < 0) falha('a beira do vão não tem ponto em cima, no meio');
const emOrdem = [...laco.slice(iTopo), ...laco.slice(0, iTopo)], direcao = P[emOrdem[1] * 3] > 0 ? 1 : -1;
const metade = [emOrdem[0]];
for (let k = direcao > 0 ? 1 : emOrdem.length - 1; P[emOrdem[k] * 3] > 0; k += direcao) metade.push(emOrdem[k]);
metade.reverse();   // (de baixo para cima; o último é o do meio, em cima)
const espelhoDe = (v) => { const b = pontoDe(P, [-P[v * 3], P[v * 3 + 1], P[v * 3 + 2]], 0.01); if (b < 0) falha(`ponto da beira sem par: ${pt(v)}`); return b; };

// ---- o mapa entre o corpo (cm, pose T) e o arquivo, em volta da boca (a cabeça gira um pouco entre os dois: afim, por mínimos quadrados)
const naCabeca = [];
for (let v = 0; v < nv; v++) if (P[v * 3 + 1] > 160 && P[v * 3 + 1] < 170 && Math.abs(P[v * 3]) < 6 && P[v * 3 + 2] > 5) naCabeca.push(v);
function resolver(A, b) {   // Gauss com pivô
  const n = b.length, M = A.map((l, i) => [...l, b[i]]);
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let k = i + 1; k < n; k++) if (Math.abs(M[k][i]) > Math.abs(M[p][i])) p = k;
    [M[i], M[p]] = [M[p], M[i]];
    for (let k = i + 1; k < n; k++) { const f = M[k][i] / M[i][i]; for (let j = i; j <= n; j++) M[k][j] -= f * M[i][j]; }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = M[i][n]; for (let j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
  return x;
}
const mapa = [0, 1, 2].map((e) => {
  const A = Array.from({ length: 4 }, () => new Array(4).fill(0)), b = new Array(4).fill(0);
  for (const v of naCabeca) { const q = [fonte.pos[v * 3], fonte.pos[v * 3 + 1], fonte.pos[v * 3 + 2], 1]; for (let i = 0; i < 4; i++) { b[i] += q[i] * P[v * 3 + e]; for (let j = 0; j < 4; j++) A[i][j] += q[i] * q[j]; } }
  return resolver(A, b);
});
const paraCorpo = (q) => mapa.map((l) => l[0] * q[0] + l[1] * q[1] + l[2] * q[2] + l[3]);
const erroMapa = Math.max(...naCabeca.map((v) => perto(paraCorpo([fonte.pos[v * 3], fonte.pos[v * 3 + 1], fonte.pos[v * 3 + 2]]), pt(v))));
if (erroMapa > 0.03) falha(`o mapa entre o arquivo e o corpo não serve em volta da boca (erro ${erroMapa.toFixed(3)} cm)`);
const paraArquivo = (p) => resolver(mapa.map((l) => l.slice(0, 3)), p.map((x, e) => x - mapa[e][3]));

// ---- o z do formato original: o que está na frente em (x, y), a mediana em volta (e dos dois lados) para as dobras não contarem
const ORIG = [];
for (let t = 0; t < glb.idx.length / 3; t++) {
  const q = [0, 1, 2].map((k) => { const v = glb.idx[t * 3 + k]; return paraCorpo([glb.pos[v * 3], glb.pos[v * 3 + 1], glb.pos[v * 3 + 2]]); });
  if (q.some((p) => p[1] > 156 && p[1] < 170 && p[2] > 2)) ORIG.push(q);
}
function zFrente(x, y) {
  let z = -Infinity;
  for (const [a, b, c] of ORIG) {
    const d = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
    if (Math.abs(d) < 1e-9) continue;
    const u = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (y - c[1])) / d, w = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (y - c[1])) / d, s = 1 - u - w;
    if (u >= -1e-6 && w >= -1e-6 && s >= -1e-6) z = Math.max(z, u * a[2] + w * b[2] + s * c[2]);
  }
  return z;
}
function zSuave(x, y) {
  const q = [];
  for (const r of [0, 0.18, 0.36]) for (let k = 0; k < (r ? 6 : 1); k++) { const a = (k * Math.PI) / 3; for (const s of [1, -1]) q.push(zFrente(s * (x + r * Math.cos(a)), y + r * Math.sin(a))); }
  q.sort((a, b) => a - b);
  return q[q.length >> 1];
}

// ---- 2. a boca do outro corpo: os triângulos e os criados da lista `boca`, com os movidos
const F = lerCorpo(DE), mF = Array.from({ length: F.I.length / 3 }, (_, t) => meioDe(F, t));
const movido = (p) => {
  const q = [...p];
  for (const m of edDe.movidos ?? []) for (const s of m.espelho ? [1, -1] : [1]) if (Math.hypot(m.em[0] * s - p[0], m.em[1] - p[1], m.em[2] - p[2]) < 0.009) { q[0] += m.mover[0] * s; q[1] += m.mover[1]; q[2] += m.mover[2]; }
  return q;
};
const criadosDe = [];
for (const n of edDe.novos ?? []) { const c = n.cantos.map((k) => k.em); criadosDe.push(c); if (n.espelho) criadosDe.push(c.map((p) => [-p[0], p[1], p[2]])); }
const pontosBoca = new Map(), trisBoca = [];
const daBoca = (v) => { if (!pontosBoca.has(v)) pontosBoca.set(v, movido(pt(v, F.P))); return v; };
for (const b of edDe.boca) {
  const t = triDe(mF, b.em);
  if (t >= 0) { trisBoca.push([daBoca(F.I[t * 3]), daBoca(F.I[t * 3 + 1]), daBoca(F.I[t * 3 + 2])]); continue; }
  const c = criadosDe.find((q) => perto([0, 1, 2].map((e) => (q[0][e] + q[1][e] + q[2][e]) / 3), b.em) < 0.03);
  if (!c) falha(`triângulo da boca não achado: ${b.em}`);
  const vs = c.map((p) => pontoDe(F.P, p));
  if (vs.includes(-1)) falha(`canto da boca fora da malha: ${c}`);
  trisBoca.push(vs.map(daBoca));
}
// (a frente para fora, de frente: +z)
for (const q of trisBoca) { const [a, b, c] = q.map((v) => pontosBoca.get(v)); if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) < 0) q.reverse(); }
// o contorno e o tamanho dela
const cBoca = new Map();
for (const q of trisBoca) for (let k = 0; k < 3; k++) { const a = q[k], b = q[(k + 1) % 3], c = a < b ? `${a}_${b}` : `${b}_${a}`; cBoca.set(c, (cBoca.get(c) ?? 0) + 1); }
const bordaBoca = [...cBoca].filter(([, n]) => n === 1).map(([q]) => q.split('_').map(Number)), vizB = new Map();
for (const [a, b] of bordaBoca) { if (!vizB.has(a)) vizB.set(a, []); if (!vizB.has(b)) vizB.set(b, []); vizB.get(a).push(b); vizB.get(b).push(a); }
if ([...vizB.values()].some((l) => l.length !== 2)) falha('o contorno da boca se toca');
const ptsB = [...pontosBoca.values()], lim = (e, f) => f(...ptsB.map((p) => p[e]));
const cantoB = [...vizB.keys()].sort((a, b) => pontosBoca.get(b)[0] - pontosBoca.get(a)[0])[0], zCanto = pontosBoca.get(cantoB)[2], yMeio = (lim(1, Math.min) + lim(1, Math.max)) / 2;
const paraCa = (p) => [p[0] * ESCALA, Y_BOCA + (p[1] - yMeio) * ESCALA, Z_BOCA + (p[2] - zCanto) * ESCALA];

// ---- os pontos novos
const novosP = [], idDe = (p) => { novosP.push(p); return nv + novosP.length - 1; };
const idBoca = new Map();
for (const [v, p] of pontosBoca) idBoca.set(v, idDe(paraCa(p)));
const PX = (v) => (v < nv ? pt(v) : novosP[v - nv]);
const novosTris = trisBoca.map((q) => q.map((v) => idBoca.get(v)));
const iBoca0 = 0, nBoca = novosTris.length;
// a metade direita do contorno da boca: de cima para baixo
const meioB = [...vizB.keys()].filter((v) => Math.abs(pontosBoca.get(v)[0]) < 1e-3).sort((a, b) => pontosBoca.get(b)[1] - pontosBoca.get(a)[1]);
if (meioB.length !== 2) falha('o contorno da boca não cruza o meio em dois pontos');
const contornoD = [meioB[0]];
for (let ant = -1, cur = meioB[0]; cur !== meioB[1];) { const nx = ant < 0 ? vizB.get(cur).find((x) => pontosBoca.get(x)[0] > 0) : vizB.get(cur).find((x) => x !== ant); contornoD.push(nx); ant = cur; cur = nx; }

// a beira de baixo cruza o meio sem ponto: ela ganha um (e o triângulo criado de baixo se parte em dois)
const noPrimeiro = metade[0];
let baixoMeio = noPrimeiro;
const trisDoVao = [...orientados];
if (!noMeio(noPrimeiro)) {
  const par = espelhoDe(noPrimeiro), q = trisDoVao.findIndex((o) => o.includes(noPrimeiro) && o.includes(par));
  if (q < 0) falha('a beira de baixo do vão não é de um triângulo criado');
  const o = trisDoVao[q], k = o.indexOf(noPrimeiro) === (o.indexOf(par) + 1) % 3 ? o.indexOf(par) : o.indexOf(noPrimeiro), a = o[k], b = o[(k + 1) % 3], c = o[(k + 2) % 3];
  // (no meio da aresta em x e y; o z sobe até a metade do caminho para o original: o queixo arredonda, a aresta não fica reta)
  const m = [0, 1, 2].map((e) => (P[a * 3 + e] + P[b * 3 + e]) / 2);
  m[2] = (m[2] + zSuave(0, m[1])) / 2;
  baixoMeio = idDe(m);
  trisDoVao.splice(q, 1, [a, baixoMeio, c], [baixoMeio, b, c]);
  metade.unshift(baixoMeio);
}

// ---- 3. a pele: o polígono da metade (de baixo pelo lado, em cima, e de volta pelo contorno da boca e pelo meio)
const poli = [...metade];
const mapaEsp = new Map();   // o par, no lado de lá
for (const v of contornoD) poli.push(idBoca.get(v));
const meioNovos = [...PONTOS_MEIO].sort((a, b) => b[1] - a[1]).map(([x, y]) => idDe([x, y, zSuave(x, y)]));
poli.push(...meioNovos);
const ladoNovos = PONTOS_LADO.map(([x, y]) => { const i = idDe([x, y, zSuave(x, y)]); const j = idDe([-x, y, novosP[i - nv][2]]); mapaEsp.set(i, j); return i; });
const espelho = (v) => {
  if (mapaEsp.has(v)) return mapaEsp.get(v);
  if (v >= nv) { const p = PX(v); if (Math.abs(p[0]) < 1e-3) return v; for (let w = nv; w < nv + novosP.length; w++) if (w !== v && perto(PX(w), [-p[0], p[1], p[2]]) < 1e-3) return w; return falha(`ponto novo sem par: ${p}`); }
  return espelhoDe(v);
};
const xy = (v) => { const p = PX(v); return { i: v, x: p[0], y: p[1] }; };
function triangular(poligono, internos) {
  const area = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const dentro = (p, a, b, c) => area(a, b, p) >= -1e-9 && area(b, c, p) >= -1e-9 && area(c, a, p) >= -1e-9;
  const resto = [...poligono], T = [];
  while (resto.length > 3) {
    let k = -1;
    for (let i = 0; i < resto.length && k < 0; i++) {
      const a = resto[(i + resto.length - 1) % resto.length], b = resto[i], c = resto[(i + 1) % resto.length];
      if (area(a, b, c) > 1e-6 && !resto.some((p) => p !== a && p !== b && p !== c && dentro(p, a, b, c))) k = i;
    }
    if (k < 0) falha('o polígono do vão não se triangula');
    T.push([resto[(k + resto.length - 1) % resto.length], resto[k], resto[(k + 1) % resto.length]]);
    resto.splice(k, 1);
  }
  T.push(resto);
  for (const p of internos) {
    const q = T.findIndex(([a, b, c]) => dentro(p, a, b, c));
    if (q < 0) falha(`ponto fora do vão: ${p.x}, ${p.y}`);
    const [a, b, c] = T[q];
    T.splice(q, 1, [a, b, p], [b, c, p], [c, a, p]);
  }
  const presa = new Set(poligono.map((p, i) => { const r = poligono[(i + 1) % poligono.length]; return `${p.i}_${r.i}`; }));
  const noCirculo = (a, b, c, d) => {
    const ax = a.x - d.x, ay = a.y - d.y, bx = b.x - d.x, by = b.y - d.y, cx = c.x - d.x, cy = c.y - d.y;
    return (ax * ax + ay * ay) * (bx * cy - cx * by) - (bx * bx + by * by) * (ax * cy - cx * ay) + (cx * cx + cy * cy) * (ax * by - bx * ay) > 1e-9;
  };
  for (let mudou = true, voltas = 0; mudou && voltas < 200; voltas++) {
    mudou = false;
    for (let i = 0; i < T.length && !mudou; i++) for (let e = 0; e < 3 && !mudou; e++) {
      const a = T[i][e], b = T[i][(e + 1) % 3], c = T[i][(e + 2) % 3];
      if (presa.has(`${a.i}_${b.i}`) || presa.has(`${b.i}_${a.i}`)) continue;
      for (let j = i + 1; j < T.length && !mudou; j++) for (let f = 0; f < 3 && !mudou; f++) {
        if (T[j][f] !== b || T[j][(f + 1) % 3] !== a) continue;
        const d = T[j][(f + 2) % 3];
        if (noCirculo(a, b, c, d) && area(c, a, d) > 1e-6 && area(c, d, b) > 1e-6) { T[i] = [c, a, d]; T[j] = [c, d, b]; mudou = true; }
      }
    }
  }
  return T.map((t) => t.map((p) => p.i));
}
const peleD = triangular(poli.map(xy), ladoNovos.map(xy));
const pele = [...peleD, ...peleD.map(([a, b, c]) => [espelho(a), espelho(c), espelho(b)])];

// ---- o resultado e a conferência
const finais = [];
for (let t = 0; t < nt; t++) if (vivo[t]) finais.push([I[t * 3], I[t * 3 + 1], I[t * 3 + 2]]);
const nKept = finais.length;
finais.push(...trisDoVao, ...novosTris, ...pele);
const iBoca = nKept + trisDoVao.length;
const chk = new Map(), dirigidasF = new Map();
for (const q of finais) for (let k = 0; k < 3; k++) { const a = q[k], b = q[(k + 1) % 3], c = a < b ? `${a}_${b}` : `${b}_${a}`; chk.set(c, (chk.get(c) ?? 0) + 1); dirigidasF.set(`${a}_${b}`, (dirigidasF.get(`${a}_${b}`) ?? 0) + 1); }
const abertas = [...chk.values()].filter((n) => n === 1).length, demais = [...chk.values()].filter((n) => n > 2).length, contramao = [...dirigidasF.values()].filter((n) => n > 1).length;
const nor = (q) => { const [a, b, c] = q.map(PX), u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; return n; };
const qual = (q) => { const [a, b, c] = q.map(PX), l = Math.max(perto(a, b), perto(b, c), perto(c, a)), n = nor(q); return Math.hypot(...n) / (l * l); };
const novosTodos = [...novosTris, ...pele];
console.log(`[corpo] ${cfg.nome}: ${nt} triângulos; cortes: ${ed.cortes.length}; soltos apagados: ${nSoltos}; da dobra: ${nDobras}; criados que viram malha: ${trisDoVao.length} (${(ed.novos ?? []).length} no editor, com o espelho e a divisão do meio)`);
console.log(`[corpo] a boca de ${DE}: ${nBoca} triângulos, ${pontosBoca.size} pontos; escala ${ESCALA}: x ±${(lim(0, Math.max) * ESCALA).toFixed(2)}, y ${(Y_BOCA + (lim(1, Math.min) - yMeio) * ESCALA).toFixed(2)}…${(Y_BOCA + (lim(1, Math.max) - yMeio) * ESCALA).toFixed(2)} (a beira do vão em cima, no meio: y ${P[metade.at(-1) * 3 + 1].toFixed(2)})`);
console.log(`[corpo] a pele nova: ${pele.length} triângulos, ${novosP.length - pontosBoca.size} pontos novos; corpo: ${nt} → ${finais.length}; arestas abertas: ${abertas}, com mais de dois: ${demais}, na contramão: ${contramao}; frente para trás: ${novosTodos.filter((q) => nor(q)[2] <= 0).length}; pior qualidade: ${Math.min(...pele.map(qual)).toFixed(3)}; erro do mapa da cabeça: ${erroMapa.toFixed(4)} cm`);
if (args.includes('--ver')) { const Pv = [...P]; for (const p of novosP) Pv.push(...p); fs.writeFileSync(opt('ver'), JSON.stringify({ P: Pv, F: finais.flat(), lab: finais.map((_, t) => (t >= iBoca && t < iBoca + nBoca ? 1 : 0)) })); }
if (abertas || demais || contramao) falha('a malha não fechou: nada gravado');
if (!GRAVAR) process.exit(0);

// ---- a malha nova
const novoDe = new Int32Array(nv + novosP.length).fill(-1);
for (const q of finais) for (const v of q) novoDe[v] = 1;
let nn = 0;
for (let v = 0; v < novoDe.length; v++) if (novoDe[v] > 0) novoDe[v] = nn++;
const filePt = (v) => (v < nv ? [fonte.pos[v * 3], fonte.pos[v * 3 + 1], fonte.pos[v * 3 + 2]] : paraArquivo(novosP[v - nv]));
const pos = new Array(nn * 3), normal = new Array(nn * 3), uv = new Array(nn * 2).fill(0);
for (let v = 0; v < novoDe.length; v++) {
  const n = novoDe[v];
  if (n < 0) continue;
  const p = filePt(v);
  for (let e = 0; e < 3; e++) { pos[n * 3 + e] = p[e]; normal[n * 3 + e] = v < nv ? fonte.normal[v * 3 + e] : 0; }
}
// (a normal refeita onde a volta mudou: os novos e quem perdeu ou ganhou triângulo)
const mudou = new Set();
for (let t = 0; t < nt; t++) if (!vivo[t]) for (let k = 0; k < 3; k++) mudou.add(I[t * 3 + k]);
for (const q of [...trisDoVao, ...novosTris, ...pele]) for (const v of q) mudou.add(v);
for (const v of tocados) mudou.add(v);
const soma = new Map();
for (const q of finais) {
  if (!q.some((v) => mudou.has(v))) continue;
  const [a, b, c] = q.map(filePt), u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  for (const v of q) { if (!soma.has(v)) soma.set(v, [0, 0, 0]); const s = soma.get(v); s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; }
}
for (const v of mudou) { const n = novoDe[v], s = soma.get(v); if (n < 0 || !s) continue; const l = Math.hypot(...s) || 1; for (let e = 0; e < 3; e++) normal[n * 3 + e] = s[e] / l; }
const idx = finais.flat().map((v) => novoDe[v]);

if (fs.readFileSync(ARQ_MOD, 'utf8') !== textoMod) falha('o modelagem.json mudou no disco enquanto eu trabalhava: nada gravado; rode de novo');
let copia = arq('-edicoes-antes-boca.json');
for (let n = 2; fs.existsSync(copia); n++) copia = arq(`-edicoes-antes-boca-${n}.json`);
const marcas = ARQ_MARCAS && ID_MARCA ? JSON.parse(fs.readFileSync(ARQ_MARCAS, 'utf8')) : null, marca = marcas?.marcas.find((m) => m.id === ID_MARCA) ?? null;
fs.writeFileSync(copia, JSON.stringify({ _leiame: `As edições de ${CHAVE} antes de fechar o vão da boca (fechar-boca.mjs, ${new Date().toISOString().slice(0, 10)}): valem só para a malha de <nome>-simples-antes.json.`, cortes: ed.cortes, novos: ed.novos ?? [], marca }, null, 1) + '\n');
if (fs.existsSync(SIMPLES)) fs.renameSync(SIMPLES, ANTES);
fs.writeFileSync(SIMPLES, JSON.stringify({ _leiame: `A malha de ${cfg.entrada} com a boca refeita (reduzir-regiao.mjs e fechar-boca.mjs): pos/normal (pose A, unidades do arquivo), uv, idx. O importar.mjs a usa no lugar da do .glb.`, pos, uv, normal, idx }) + '\n');

// o modelagem.json: só as listas de cortes e de criados deste corpo mudam (o resto, byte a byte)
const fecha = (t, i) => { const a = t[i], b = a === '{' ? '}' : ']'; let d = 0, s = false; for (let k = i; k < t.length; k++) { const c = t[k]; if (s) { if (c === '\\') k++; else if (c === '"') s = false; continue; } if (c === '"') s = true; else if (c === a) d++; else if (c === b && --d === 0) return k; } return falha('modelagem.json torto'); };
const iniCorpo = textoMod.indexOf(`"${CHAVE}": {`), abre = textoMod.indexOf('{', iniCorpo), fimCorpo = fecha(textoMod, abre);
let bloco = textoMod.slice(abre, fimCorpo + 1);
for (const nome of ['cortes', 'novos']) { const a = bloco.indexOf(`"${nome}": [`); if (a < 0) continue; const b = bloco.indexOf('[', a); bloco = `${bloco.slice(0, b)}[]${bloco.slice(fecha(bloco, b) + 1)}`; }
const textoNovo = textoMod.slice(0, abre) + bloco + textoMod.slice(fimCorpo + 1);
JSON.parse(textoNovo);
fs.writeFileSync(ARQ_MOD, textoNovo);
console.log(`[corpo] gravado: ${path.relative(RAIZ, SIMPLES)} (${nn} pontos, ${idx.length / 3} triângulos); cópia das edições em ${path.relative(RAIZ, copia)}`);
execFileSync(process.execPath, [path.join(AQUI, 'importar.mjs'), recorte], { cwd: RAIZ, stdio: 'inherit' });

// a marca passa para os lábios novos (o meio no corpo refeito, 3 casas, como a ferramenta grava)
const N = lerCorpo(cfg.nome);
if (N.I.length !== idx.length) falha('o corpo refeito não bate com a malha nova');
let erroNovo = 0;
for (let v = 0; v < novoDe.length; v++) if (v >= nv && novoDe[v] >= 0) erroNovo = Math.max(erroNovo, perto(pt(novoDe[v], N.P), novosP[v - nv]));
console.log(`[corpo] os pontos novos ficaram até ${erroNovo.toFixed(3)} cm de onde foram desenhados`);
if (marca) {
  const em = Array.from({ length: nBoca }, (_, k) => meioDe(N, iBoca + k).map((x) => Math.round(x * 1000) / 1000));
  marca.tris = em.map((e) => ({ de: 'corpo', em: e }));
  const lim3 = (f) => [0, 1, 2].map((e) => f(...em.map((p) => p[e])));
  marca.resumo = { n: em.length, centro: [0, 1, 2].map((e) => Math.round((em.reduce((s, p) => s + p[e], 0) / em.length) * 1000) / 1000), min: lim3(Math.min), max: lim3(Math.max) };
  fs.writeFileSync(ARQ_MARCAS, `{\n  "_leiame": ${JSON.stringify(marcas._leiame)},\n  "marcas": [\n${marcas.marcas.map((m) => `    ${JSON.stringify(m)}`).join(',\n')}\n  ]\n}\n`);
}
