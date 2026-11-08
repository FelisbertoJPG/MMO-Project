#!/usr/bin/env node
// A REDUÇÃO DE UMA REGIÃO do corpo de arquivo, sem mudar o formato (02/11/2026; o dono, na boca do Masculino: "reduzir os
// polígonos, vértices e triângulos de toda aquela área, principalmente a deletada [...] reduzir sem alterar o formato atual do
// rosto"). O Simplificar reduz o corpo inteiro e perde as edições; aqui o resto do corpo fica ponto por ponto como está:
//
//   node ferramentas/corpo-de-arquivo/reduzir-regiao.mjs <recorte.json> --chave humano:arquivo5 [--mm 0.5] [--margem 1] [--acima 0.3]
//        [--caixa x,y0,y1,z0] [--cor-solta] [--marcas <marcas-triangulos.json> --marca <id>] [--ver <arquivo>] [--gravar]
//
// (02/11/2026, o rosto do Masculino: "tem muitos triângulos, quer dar uma polida?") A região também pode vir de --caixa (|x| até x, y entre y0 e
// y1, z acima de z0), sem cortes. As contas são sobre a pele COMO APARECE (com os movidos). Os pontos do contorno de uma COR não saem do lugar
// (o olho a 0,5 mm perdia a curva da amêndoa; com --cor-solta, andam ao longo do contorno, como os da marca), e as `cores` são regravadas pelo
// meio dos triângulos novos. Movidos de pontos que sumiram saem do modelagem.json.
//
// 1. os CORTES do dono (assets/modelagem.json) saem de vez da malha: o buraco fica aberto e o fantasma laranja some;
// 2. os APAGADOS dentro da região viram malha de verdade (no jogo eles só achatam o triângulo, que continua lá);
// 3. colapso de arestas só na região (a caixa dos cortes + `margem` cm de lado e embaixo + `acima` cm em cima, para não mexer
//    no nariz): cada ponto vai para um VIZINHO (nenhum ponto novo), o par espelhado junto, e cada passo só vale se a superfície
//    nova ficar a até `mm` da de antes, nos dois sentidos (a nova perto da antiga, e a antiga perto da nova). A beira do buraco e
//    o contorno da `marca` só andam ao longo de si mesmos; quem toca em triângulo fora da região não sai do lugar.
//
// Sem --gravar só mede. Com --gravar: as edições de antes vão para `<nome>-edicoes-antes-reducao*.json`, a malha para
// `<nome>-simples.json` (o importar.mjs a usa no lugar da do .glb), os cortes e os apagados usados saem do modelagem.json, a marca
// passa a apontar para os triângulos novos e o corpo é refeito. VOLTAR: ponha os cortes e os apagados de volta a partir daquele
// arquivo, e o simplificar.mjs `desfazer`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const args = process.argv.slice(2), recorte = args[0];
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const CHAVE = opt('chave'), MM = Number(opt('mm', 0.5)), MARGEM = Number(opt('margem', 1)), ACIMA = Number(opt('acima', 0.3));
const ARQ_MARCAS = opt('marcas'), ID_MARCA = opt('marca'), GRAVAR = args.includes('--gravar'), TOL = MM / 10, CAIXA = opt('caixa')?.split(',').map(Number);
if (!recorte || !CHAVE) { console.error('uso: node reduzir-regiao.mjs <recorte.json> --chave humano:arquivoN [--mm 0.5] [--margem 1] [--acima 0.3] [--marcas <arquivo> --marca <id>] [--gravar]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.resolve(RAIZ, recorte), 'utf8'));
if (!cfg.manter) { console.error('[corpo] só o corpo de arquivo inteiro (`manter`)'); process.exit(1); }
const arq = (s) => path.join(AQUI, `${cfg.nome}${s}`), SIMPLES = arq('-simples.json'), ANTES = arq('-simples-antes.json');

// ---- a malha de agora (a simplificada, ou a do .glb) e o corpo (pose T, cm): os mesmos pontos, os mesmos triângulos
let fonte;
if (fs.existsSync(SIMPLES)) fonte = JSON.parse(fs.readFileSync(SIMPLES, 'utf8'));
else {
  const b = fs.readFileSync(path.resolve(RAIZ, cfg.entrada)), jl = b.readUInt32LE(12), jg = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')), bin = b.subarray(20 + jl + 8);
  const acc = (i) => {
    const a = jg.accessors[i], bv = jg.bufferViews[a.bufferView], n = { VEC3: 3, VEC2: 2, SCALAR: 1 }[a.type];
    const C = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType], off = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new C(bin.buffer.slice(off, off + a.count * n * C.BYTES_PER_ELEMENT));
  };
  const prim = jg.meshes[0].primitives[0];
  fonte = { pos: acc(prim.attributes.POSITION), normal: acc(prim.attributes.NORMAL), uv: prim.attributes.TEXCOORD_0 != null ? acc(prim.attributes.TEXCOORD_0) : null, idx: acc(prim.indices) };
}
const de64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const corpo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/corpos', `${cfg.nome}.json`), 'utf8'));
const P = de64(corpo.pos, Float32Array), I = de64(corpo.idx32, Uint32Array);
if (I.length !== fonte.idx.length || I.some((v, i) => v !== fonte.idx[i])) { console.error('[corpo] o corpo não é da malha de agora: rode o importar.mjs antes'); process.exit(1); }
const nt = I.length / 3, nv = P.length / 3;
const meio = (t, F = I) => [0, 1, 2].map((e) => (P[F[t * 3] * 3 + e] + P[F[t * 3 + 1] * 3 + e] + P[F[t * 3 + 2] * 3 + e]) / 3);
const MEIOS = Array.from({ length: nt }, (_, t) => meio(t));
const maisPerto = (em) => { let b = -1, d = 0.05; MEIOS.forEach((m, t) => { const q = Math.hypot(m[0] - em[0], m[1] - em[1], m[2] - em[2]); if (q < d) { d = q; b = t; } }); return b; };

// ---- as edições do dono
const ARQ_MOD = path.join(RAIZ, 'assets/modelagem.json'), textoMod = fs.readFileSync(ARQ_MOD, 'utf8');
const ed = JSON.parse(textoMod).corpos?.[CHAVE];
if (!ed) { console.error(`[corpo] não há edições de ${CHAVE}`); process.exit(1); }
if (!ed.cortes?.length && !CAIXA) { console.error(`[corpo] ${CHAVE} não tem cortes: diga a região com --caixa x,y0,y1,z0`); process.exit(1); }
if ((ed.novos ?? []).length) { console.error(`[corpo] ${CHAVE} tem triângulos criados: funda-os antes`); process.exit(1); }
const vivo = new Uint8Array(nt).fill(1), F = Int32Array.from(I);
for (const c of ed.cortes ?? []) { const t = maisPerto(c.em); if (t < 0) { console.error(`[corpo] corte sem triângulo: ${c.em}`); process.exit(1); } vivo[t] = 0; }
const nCortes = nt - vivo.reduce((s, x) => s + x, 0);

// ---- a caixa da região
const EM = (ed.cortes ?? []).map((c) => c.em), lim = (e, f) => f(...EM.map((p) => (e ? p[e] : Math.abs(p[0]))));
const [CX, Y0, Y1, Z0] = CAIXA ?? [lim(0, Math.max) + MARGEM, lim(1, Math.min) - MARGEM, lim(1, Math.max) + ACIMA, lim(2, Math.min) - MARGEM];
const naCaixa = (p) => Math.abs(p[0]) < CX && p[1] > Y0 && p[1] < Y1 && p[2] > Z0;

// ---- os APAGADOS da região viram malha (a mesma conta do apagarVertices: `em` e quem está colado nele vão para `com`)
const dono = Int32Array.from({ length: nv }, (_, i) => i), raiz = (x) => { while (dono[x] !== x) { dono[x] = dono[dono[x]]; x = dono[x]; } return x; };
const pontoEm = (em) => { for (let v = 0; v < nv; v++) if (Math.hypot(P[v * 3] - em[0], P[v * 3 + 1] - em[1], P[v * 3 + 2] - em[2]) < 0.009) return v; return -1; };
const G = Float64Array.from(P);   // (a pele como aparece: com os movidos; só o arquivo guarda as posições sem eles)
for (const m of ed.movidos ?? []) for (const s of m.espelho && Math.abs(m.em[0]) >= 0.05 ? [1, -1] : [1]) { const v = pontoEm([m.em[0] * s, m.em[1], m.em[2]]); if (v >= 0) { G[v * 3] += m.mover[0] * s; G[v * 3 + 1] += m.mover[1]; G[v * 3 + 2] += m.mover[2]; } }
const usados = [], restam = [];
for (const a of ed.apagados ?? []) {
  const noVaz = pontoEm(a.em), alvo = pontoEm(a.com);
  if (noVaz >= 0 && alvo >= 0) for (let e = 0; e < 3; e++) G[noVaz * 3 + e] = G[alvo * 3 + e];
  const u = naCaixa(a.em) && naCaixa(a.com) ? noVaz : -1, v = u >= 0 ? alvo : -1;
  if (u < 0 || v < 0) { restam.push(a); continue; }
  dono[raiz(u)] = raiz(v); usados.push(a);
}
for (let i = 0; i < F.length; i++) F[i] = raiz(F[i]);
let nAchatados = 0;
for (let t = 0; t < nt; t++) if (vivo[t] && (F[t * 3] === F[t * 3 + 1] || F[t * 3 + 1] === F[t * 3 + 2] || F[t * 3] === F[t * 3 + 2])) { vivo[t] = 0; nAchatados++; }

// ---- a marca (os lábios): o contorno dela é guardado como a beira do buraco
const lab = new Uint8Array(nt);
let marcas = null, marca = null;
if (ARQ_MARCAS && ID_MARCA) {
  marcas = JSON.parse(fs.readFileSync(ARQ_MARCAS, 'utf8'));
  marca = marcas.marcas.find((m) => m.id === ID_MARCA);
  if (!marca) { console.error(`[corpo] marca ${ID_MARCA} não existe`); process.exit(1); }
  for (const q of marca.tris) { const t = maisPerto(q.em); if (t >= 0 && vivo[t]) lab[t] = 1; }
}

// as CORES: cada cor é uma "marca"; o contorno dela só anda ao longo de si
const corDe = new Map(), tiposDeCor = new Map();
for (const c of ed.cores ?? []) {
  const t = maisPerto(c.em);
  if (t < 0 || !vivo[t]) continue;
  corDe.set(t, c);
  const k = JSON.stringify([c.uv, c.tom ?? null]);
  if (!tiposDeCor.has(k)) tiposDeCor.set(k, tiposDeCor.size + 2);
  lab[t] = tiposDeCor.get(k);
}
// ---- a região, a vizinhança e quem pode sair do lugar
const reg = new Uint8Array(nt);
for (let t = 0; t < nt; t++) if (vivo[t] && naCaixa(MEIOS[t])) reg[t] = 1;
const vf = Array.from({ length: nv }, () => new Set());
for (let t = 0; t < nt; t++) if (vivo[t]) for (let k = 0; k < 3; k++) vf[F[t * 3 + k]].add(t);
const contar = () => vivo.reduce((s, x, t) => s + (x && reg[t] ? 1 : 0), 0);
const nRegiao0 = contar(), nVivos0 = vivo.reduce((s, x) => s + x, 0);
const px = (v) => G[v * 3], py = (v) => G[v * 3 + 1], pz = (v) => G[v * 3 + 2];
const usa = (t, v) => F[t * 3] === v || F[t * 3 + 1] === v || F[t * 3 + 2] === v;
const daAresta = (u, v) => [...vf[u]].filter((t) => usa(t, v));
const vizinhos = (u) => { const s = new Set(); for (const t of vf[u]) for (let k = 0; k < 3; k++) if (F[t * 3 + k] !== u) s.add(F[t * 3 + k]); return s; };
// o espelho de cada ponto (no mesmo lugar, do outro lado); quem não tem par não se mexe
const espelho = new Int32Array(nv).fill(-1);
for (let v = 0; v < nv; v++) {
  if (!vf[v].size || !(Math.abs(P[v * 3]) < CX + 3 && P[v * 3 + 1] > Y0 - 3 && P[v * 3 + 1] < Y1 + 3 && P[v * 3 + 2] > Z0 - 3)) continue;
  let b = -1, d = 0.01;
  for (let w = 0; w < nv; w++) { if (!vf[w].size) continue; const q = Math.hypot(P[w * 3] + P[v * 3], P[w * 3 + 1] - P[v * 3 + 1], P[w * 3 + 2] - P[v * 3 + 2]); if (q < d) { d = q; b = w; } }
  espelho[v] = b;
}
const centro = (v) => espelho[v] === v;
// os pedaços soltos (o que sobrou no meio do buraco) não são tocados
const tam = new Map(), grupo = new Int32Array(nv).fill(-1);
for (let v = 0; v < nv; v++) {
  if (grupo[v] >= 0 || !vf[v].size) continue;
  const pilha = [v]; grupo[v] = v; let n = 0;
  while (pilha.length) { const x = pilha.pop(); n++; for (const y of vizinhos(x)) if (grupo[y] < 0) { grupo[y] = v; pilha.push(y); } }
  tam.set(v, n);
}
const preso = new Uint8Array(nv);
for (let v = 0; v < nv; v++) {
  if (espelho[v] < 0 || espelho[espelho[v]] !== v || tam.get(grupo[v]) < 20) preso[v] = 1;
  else for (const t of vf[v]) if (!reg[t]) { preso[v] = 1; break; }
}
for (const a of restam) for (const em of [a.em, a.com]) { const v = pontoEm(em); if (v >= 0) { preso[v] = 1; preso[raiz(v)] = 1; } }
const soltos = [...tam].filter(([, n]) => n < 20);

// ---- as contas de geometria (cm, pose T)
const tri = (t) => [F[t * 3], F[t * 3 + 1], F[t * 3 + 2]].map((v) => [px(v), py(v), pz(v)]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], tamanho = (a) => Math.hypot(a[0], a[1], a[2]);
const normalDe = ([a, b, c]) => cross(sub(b, a), sub(c, a));
const qualidade = ([a, b, c]) => { const l = Math.max(tamanho(sub(b, a)), tamanho(sub(c, b)), tamanho(sub(a, c))); return l > 0 ? tamanho(normalDe([a, b, c])) / (l * l) : 0; };
function dist2(p, [a, b, c]) {   // o quadrado da distância de p ao triângulo (Ericson)
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  const q2 = (x, y, z) => x * x + y * y + z * z;
  if (d1 <= 0 && d2 <= 0) return q2(ap[0], ap[1], ap[2]);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return q2(bp[0], bp[1], bp[2]);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return q2(ap[0] - v * ab[0], ap[1] - v * ab[1], ap[2] - v * ab[2]); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return q2(cp[0], cp[1], cp[2]);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return q2(ap[0] - w * ac[0], ap[1] - w * ac[1], ap[2] - w * ac[2]); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + d5 - d6); return q2(bp[0] - w * (c[0] - b[0]), bp[1] - w * (c[1] - b[1]), bp[2] - w * (c[2] - b[2])); }
  const n = cross(ab, ac), l = dot(n, n), s = dot(ap, n);
  return l > 0 ? (s * s) / l : q2(ap[0], ap[1], ap[2]);
}
const pontosDe = ([a, b, c], n) => {
  const out = [];
  for (let i = 0; i <= n; i++) for (let j = 0; j <= n - i; j++) { const w = i / n, u = j / n, s = 1 - w - u; out.push([a[0] * s + b[0] * w + c[0] * u, a[1] * s + b[1] * w + c[1] * u, a[2] * s + b[2] * w + c[2] * u]); }
  return out;
};

// ---- a superfície de ANTES (a região e o que encosta nela) e os pontos dela
const pertoDaCaixa = (p) => Math.abs(p[0]) < CX + 2 && p[1] > Y0 - 2 && p[1] < Y1 + 2 && p[2] > Z0 - 2;
const pertos = [];
for (let t = 0; t < nt; t++) if (vivo[t] && pertoDaCaixa(MEIOS[t])) pertos.push(t);
const REF = pertos.map(tri), DENTES = [];
for (let t = 0; t < nt; t++) if (vivo[t] && reg[t]) DENTES.push(...pontosDe(tri(t), 4));
const REF2 = TOL * TOL;
const pertoDaRef = (p) => { for (const r of REF) if (dist2(p, r) <= REF2) return true; return false; };

// ---- as quádricas (o formato em volta de cada ponto; vão junto quando ele some)
const Q = Array.from({ length: nv }, () => new Float64Array(10));
const juntaQ = (q, [a, b, c, d], w) => { const m = [a * a, a * b, a * c, a * d, b * b, b * c, b * d, c * c, c * d, d * d]; for (let i = 0; i < 10; i++) q[i] += m[i] * w; };
for (let t = 0; t < nt; t++) {
  if (!vivo[t]) continue;
  const T = tri(t), n = normalDe(T), l = tamanho(n);
  if (l < 1e-9) continue;
  const u = [n[0] / l, n[1] / l, n[2] / l], pl = [u[0], u[1], u[2], -dot(u, T[0])];
  for (let k = 0; k < 3; k++) juntaQ(Q[F[t * 3 + k]], pl, l / 2);
}
const custo = (u, v) => {
  const a = Q[u], b = Q[v], x = px(v), y = py(v), z = pz(v), q = (m) => m[0] * x * x + 2 * m[1] * x * y + 2 * m[2] * x * z + 2 * m[3] * x + m[4] * y * y + 2 * m[5] * y * z + 2 * m[6] * y + m[7] * z * z + 2 * m[8] * z + m[9];
  return q(a) + q(b) + 1e-4 * ((x - px(u)) ** 2 + (y - py(u)) ** 2 + (z - pz(u)) ** 2);
};

// ---- as regras: a beira e o contorno só andam ao longo de si; o meio fica no meio
const especial = (u, v) => { const f = daAresta(u, v); return f.length !== 2 || lab[f[0]] !== lab[f[1]]; };
const COR_PRESA = !args.includes('--cor-solta');
const bordaDeCor = (u, w) => { const f = daAresta(u, w); return f.length === 2 && lab[f[0]] !== lab[f[1]] && (lab[f[0]] >= 2 || lab[f[1]] >= 2); };
function pode(u, v) {
  if (preso[u] || !vf[u].size || !vf[v].size || espelho[v] < 0 || v === espelho[u]) return false;
  if (COR_PRESA && [...vizinhos(u)].some((w) => bordaDeCor(u, w))) return false;
  if (centro(u) && !centro(v)) return false;
  if (!centro(u) && !centro(v) && px(u) * px(v) < 0) return false;
  const esp = [...vizinhos(u)].filter((w) => especial(u, w));
  if (esp.length) { if (esp.length !== 2 || !esp.includes(v)) return false; }
  else { const l = lab[[...vf[u]][0]]; if (![...vf[v]].some((t) => lab[t] === l)) return false; }
  // o elo: os vizinhos em comum são só os dos triângulos da aresta
  const f = daAresta(u, v), asas = new Set(f.flatMap((t) => [F[t * 3], F[t * 3 + 1], F[t * 3 + 2]])), nv2 = vizinhos(v);
  for (const w of vizinhos(u)) if (w !== v && nv2.has(w) && !asas.has(w)) return false;
  return f.length > 0;
}
// o colapso u → v, com o registro para desfazer
function colapsar(u, v, log) {
  for (const t of [...vf[u]]) {
    log.push([t, F[t * 3], F[t * 3 + 1], F[t * 3 + 2], vivo[t]]);
    if (usa(t, v)) { for (let k = 0; k < 3; k++) vf[F[t * 3 + k]].delete(t); vivo[t] = 0; continue; }
    for (let k = 0; k < 3; k++) if (F[t * 3 + k] === u) F[t * 3 + k] = v;
    vf[u].delete(t); vf[v].add(t);
  }
}
function desfazer(log) {
  for (const [t, a, b, c, era] of log.reverse()) {
    if (vivo[t]) for (let k = 0; k < 3; k++) vf[F[t * 3 + k]].delete(t);
    F[t * 3] = a; F[t * 3 + 1] = b; F[t * 3 + 2] = c; vivo[t] = era;
    if (era) { vf[a].add(t); vf[b].add(t); vf[c].add(t); }
  }
}
const ANTES_N = new Map();
function tentar(u, v) {
  const antes = [[u, v], ...(centro(u) ? [] : [[espelho[u], espelho[v]]])];
  const foram = new Map(), log = [];
  for (const [a, b] of antes) {
    if (!pode(a, b)) { desfazer(log); return false; }
    for (const t of vf[a]) if (!foram.has(t) && !usa(t, b)) foram.set(t, tri(t));
    colapsar(a, b, log);
  }
  const volta = () => { desfazer(log); return false; };
  // nenhum triângulo vira nem vira fiapo; nenhuma aresta com mais de dois; a beira não se abre em dois
  const novos = [...foram.keys()].filter((t) => vivo[t]);
  for (const t of novos) {
    const A = foram.get(t), B = tri(t), na = normalDe(A), nb = normalDe(B), la = tamanho(na), lb = tamanho(nb);
    if (lb < 1e-5 || (la > 1e-9 && dot(na, nb) / (la * lb) < 0.5)) return volta();
    if (qualidade(B) < Math.min(0.08, qualidade(A))) return volta();
  }
  for (const [, b] of antes) {
    let beiras = 0;
    for (const w of vizinhos(b)) { const n = daAresta(b, w).length; if (n > 2) return volta(); if (n === 1) beiras++; }
    if (beiras > 2) return volta();
  }
  // a superfície nova perto da de antes …
  for (const t of novos) for (const p of pontosDe(tri(t), 4)) if (!pertoDaRef(p)) return volta();
  // … e a de antes perto da nova, em volta do que mudou
  let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const e of log) for (let k = 1; k <= 3; k++) { const q = e[k]; for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], G[q * 3 + i]); hi[i] = Math.max(hi[i], G[q * 3 + i]); } }
  const faces = pertos.filter((t) => vivo[t]).map(tri);
  for (const p of DENTES) {
    if (p[0] < lo[0] - TOL || p[1] < lo[1] - TOL || p[2] < lo[2] - TOL || p[0] > hi[0] + TOL || p[1] > hi[1] + TOL || p[2] > hi[2] + TOL) continue;
    let ok = false;
    for (const f of faces) if (dist2(p, f) <= REF2) { ok = true; break; }
    if (!ok) return volta();
  }
  for (const [a, b] of antes) { for (let i = 0; i < 10; i++) Q[b][i] += Q[a][i]; }
  return true;
}

// ---- o laço: sempre o mais barato que passe (quem reprovou só volta quando a volta dele mudar)
const ver = new Uint32Array(nv), reprovou = new Map();
const carimbo = (u, v) => `${ver[u]}.${ver[v]}.${ver[espelho[u]] ?? 0}.${ver[espelho[v]] ?? 0}`;
let passos = 0;
for (;;) {
  const lista = [];
  for (let u = 0; u < nv; u++) {
    if (preso[u] || !vf[u].size) continue;
    for (const v of vizinhos(u)) if (reprovou.get(`${u}_${v}`) !== carimbo(u, v) && pode(u, v)) lista.push([custo(u, v), u, v]);
  }
  lista.sort((a, b) => a[0] - b[0]);
  let feito = false;
  for (const [, u, v] of lista) {
    const volta = [...vf[u], ...(centro(u) ? [] : vf[espelho[u]])];
    const envolvidos = new Set(volta.flatMap((t) => [F[t * 3], F[t * 3 + 1], F[t * 3 + 2]]));
    if (tentar(u, v)) { for (const x of envolvidos) ver[x]++; passos++; feito = true; break; }
    reprovou.set(`${u}_${v}`, carimbo(u, v));
  }
  if (!feito) break;
}

// ---- a conferência: o desvio de verdade, nos dois sentidos, com mais pontos
const nRegiao1 = contar();
const mudados = [];
for (let t = 0; t < nt; t++) if (vivo[t] && reg[t]) mudados.push(t);
const faces = pertos.filter((t) => vivo[t]).map(tri);
const maxD = (pts, alvo) => { let m = 0; for (const p of pts) { let b = Infinity; for (const f of alvo) { const d = dist2(p, f); if (d < b) b = d; } if (b > m) m = b; } return Math.sqrt(m) * 10; };
const ida = maxD(mudados.flatMap((t) => pontosDe(tri(t), 8)), REF), volta = maxD(DENTES, faces);
// a simetria: cada triângulo da região tem o par espelhado
const chaveTri = (a, b, c) => [a, b, c].sort((x, y) => x - y).join('_'), tem = new Set();
for (const t of mudados) tem.add(chaveTri(F[t * 3], F[t * 3 + 1], F[t * 3 + 2]));
const semPar = mudados.filter((t) => !tem.has(chaveTri(espelho[F[t * 3]], espelho[F[t * 3 + 1]], espelho[F[t * 3 + 2]]))).length;
const nLab1 = mudados.filter((t) => lab[t]).length;
console.log(`[corpo] ${cfg.nome}: ${nt} triângulos no corpo; cortes tirados: ${nCortes}; apagados da região: ${usados.length} (${nAchatados} triângulos achatados tirados), ficam ${restam.length} fora dela`);
console.log(`[corpo] região: x até ${CX.toFixed(1)}, y ${Y0.toFixed(1)}…${Y1.toFixed(1)}, z de ${Z0.toFixed(1)}; ${nRegiao0} → ${nRegiao1} triângulos em ${passos} colapsos, a ${MM} mm${marca ? `; a marca: ${marca.tris.length} → ${nLab1}` : ''}`);
console.log(`[corpo] desvio medido: a nova até ${ida.toFixed(3)} mm da de antes, a de antes até ${volta.toFixed(3)} mm da nova; triângulos sem par espelhado: ${semPar}; corpo inteiro: ${nt} → ${nVivos0 - nRegiao0 + nRegiao1}; pedaços soltos (intactos): ${soltos.length}`);
const vivosFinal = [...vivo.keys()].filter((t) => vivo[t]);
if (args.includes('--ver')) fs.writeFileSync(opt('ver'), JSON.stringify({ V: [...G].map((x) => Math.round(x * 1000) / 1000), F: vivosFinal.flatMap((t) => [F[t * 3], F[t * 3 + 1], F[t * 3 + 2]]), iPed: 0, cores: vivosFinal.map((t) => { const c = corDe.get(t); return c ? [c.uv, c.tom ?? null] : null; }), reg: vivosFinal.map((t) => reg[t]) }));
if (!GRAVAR) process.exit(0);

// ---- a malha nova: os pontos que sobraram (na mesma ordem), os triângulos na mesma ordem; a normal refeita só onde a volta mudou
const novoDe = new Int32Array(nv).fill(-1);
let nn = 0;
for (const t of vivosFinal) for (let k = 0; k < 3; k++) if (novoDe[F[t * 3 + k]] < 0) novoDe[F[t * 3 + k]] = 1;
for (let v = 0; v < nv; v++) if (novoDe[v] > 0) novoDe[v] = nn++;
const FP = fonte.pos, FN = fonte.normal;
const pos = new Array(nn * 3), normal = new Array(nn * 3), uv = new Array(nn * 2).fill(0);
for (let v = 0; v < nv; v++) {
  const n = novoDe[v];
  if (n < 0) continue;
  for (let e = 0; e < 3; e++) { pos[n * 3 + e] = FP[v * 3 + e]; normal[n * 3 + e] = FN[v * 3 + e]; }
  if (fonte.uv) { uv[n * 2] = fonte.uv[v * 2]; uv[n * 2 + 1] = fonte.uv[v * 2 + 1]; }
}
// quem mudou de volta: o conjunto de triângulos dele não é mais o de antes
const antigos = Array.from({ length: nv }, () => []);
for (let t = 0; t < nt; t++) for (let k = 0; k < 3; k++) antigos[I[t * 3 + k]].push(t);
const fic = (v) => [FP[v * 3], FP[v * 3 + 1], FP[v * 3 + 2]];
let refeitas = 0;
for (let v = 0; v < nv; v++) {
  const n = novoDe[v];
  if (n < 0) continue;
  const iguais = vf[v].size === antigos[v].length && antigos[v].every((t) => vf[v].has(t) && [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]].every((q, k) => q === F[t * 3 + k]));
  if (iguais) continue;
  const s = [0, 0, 0];
  for (const t of vf[v]) { const m = normalDe([F[t * 3], F[t * 3 + 1], F[t * 3 + 2]].map(fic)); s[0] += m[0]; s[1] += m[1]; s[2] += m[2]; }
  const l = tamanho(s) || 1;
  for (let e = 0; e < 3; e++) normal[n * 3 + e] = s[e] / l;
  refeitas++;
}
const idx = vivosFinal.flatMap((t) => [novoDe[F[t * 3]], novoDe[F[t * 3 + 1]], novoDe[F[t * 3 + 2]]]);

if (fs.readFileSync(ARQ_MOD, 'utf8') !== textoMod) { console.error('[corpo] o modelagem.json mudou no disco enquanto eu trabalhava: nada gravado; rode de novo'); process.exit(1); }
// (a cópia das edições de antes: nunca por cima de outra)
let copia = arq('-edicoes-antes-reducao.json');
for (let n = 2; fs.existsSync(copia); n++) copia = arq(`-edicoes-antes-reducao-${n}.json`);
fs.writeFileSync(copia, JSON.stringify({ _leiame: `As edições de ${CHAVE} antes da redução da região (reduzir-regiao.mjs, ${new Date().toISOString().slice(0, 10)}): os cortes e os apagados como estavam no modelagem.json, e a marca${marca ? ` ${marca.id}` : ''}. Valem só para a malha de antes (o .glb, ou o -simples.json guardado).`, cortes: ed.cortes ?? [], apagados: ed.apagados ?? [], cores: ed.cores ?? [], movidos: ed.movidos ?? [], marca }, null, 1) + '\n');
// (a simplificação que estava guardada para o desfazer não se perde)
if (fs.existsSync(ANTES)) {
  const a = JSON.parse(fs.readFileSync(ANTES, 'utf8'));
  if (!a.original) fs.renameSync(ANTES, arq(`-simples-guardada-${a.idx.length / 3}.json`));
}
if (fs.existsSync(SIMPLES)) fs.renameSync(SIMPLES, ANTES); else fs.writeFileSync(ANTES, '{"original":true}\n');
fs.writeFileSync(SIMPLES, JSON.stringify({ _leiame: `A malha de ${cfg.entrada} com a região reduzida (reduzir-regiao.mjs): pos/normal (pose A, unidades do arquivo), uv, idx. O importar.mjs a usa no lugar da do .glb.`, pos, uv, normal, idx }) + '\n');

// o modelagem.json: só as listas deste corpo que mudaram (o resto, byte a byte)
const ini = textoMod.indexOf(`"${CHAVE}": {`), fimDoCorpo = textoMod.indexOf('\n    }', ini);
let bloco = textoMod.slice(ini, fimDoCorpo);
const trocarLista = (nome, itens) => {
  const a = bloco.indexOf(`"${nome}": [`), b = bloco.indexOf('\n      ]', a);
  if (a < 0 || b < 0) { console.error(`[corpo] não achei a lista ${nome} no modelagem.json`); process.exit(1); }
  bloco = bloco.slice(0, a) + (itens.length ? `"${nome}": [\n${itens.map((x) => `        ${JSON.stringify(x)}`).join(',\n')}\n      ]` : `"${nome}": []`) + bloco.slice(b + '\n      ]'.length);
};
if (ed.cortes?.length) trocarLista('cortes', []);
if (ed.apagados?.length) trocarLista('apagados', restam);
const r3 = (x) => Math.round(x * 1000) / 1000;
const coresNovas = [...corDe].filter(([q]) => vivo[q]).map(([q, c]) => ({ de: c.de, em: meio(q, F).map(r3), uv: c.uv, ...(c.tom ? { tom: c.tom } : {}) }));
if (ed.cores?.length) trocarLista('cores', coresNovas);
const movidosNovos = (ed.movidos ?? []).filter((m) => { const v = pontoEm(m.em); return v < 0 || novoDe[v] >= 0; });
if (ed.movidos?.length) trocarLista('movidos', movidosNovos);
console.log(`[corpo] modelagem.json: cores ${ed.cores?.length ?? 0} → ${coresNovas.length}; movidos ${ed.movidos?.length ?? 0} → ${movidosNovos.length}; apagados ${ed.apagados?.length ?? 0} → ${restam.length}`);
const textoNovo = textoMod.slice(0, ini) + bloco + textoMod.slice(fimDoCorpo);
JSON.parse(textoNovo);
fs.writeFileSync(ARQ_MOD, textoNovo);

// a marca passa a apontar para os triângulos novos (o meio no modelo, 3 casas, como a ferramenta grava)
if (marca) {
  const em = mudados.filter((t) => lab[t]).map((t) => meio(t, F).map((x) => Math.round(x * 1000) / 1000));
  marca.tris = em.map((e) => ({ de: 'corpo', em: e }));
  const lim3 = (f) => [0, 1, 2].map((e) => f(...em.map((p) => p[e])));
  marca.resumo = { n: em.length, centro: [0, 1, 2].map((e) => Math.round((em.reduce((s, p) => s + p[e], 0) / em.length) * 1000) / 1000), min: lim3(Math.min), max: lim3(Math.max) };
  fs.writeFileSync(ARQ_MARCAS, `{\n  "_leiame": ${JSON.stringify(marcas._leiame)},\n  "marcas": [\n${marcas.marcas.map((m) => `    ${JSON.stringify(m)}`).join(',\n')}\n  ]\n}\n`);
}
console.log(`[corpo] gravado: ${path.relative(RAIZ, SIMPLES)} (${nn} pontos, ${idx.length / 3} triângulos; ${refeitas} normais refeitas); cópia das edições em ${path.relative(RAIZ, copia)}`);
execFileSync(process.execPath, [path.join(AQUI, 'importar.mjs'), recorte], { cwd: RAIZ, stdio: 'inherit' });
