#!/usr/bin/env node
// FECHAR OS CORTES de um corpo de arquivo com os triângulos criados à mão (02/11/2026; o dono, nas bochechas do Masculino: "fiz menos triângulos,
// porém ficaram com vãos e uns sobrepondo arestas dos outros. Gruda eles e não deixa eles se sobreporem"):
//
//   node ferramentas/corpo-de-arquivo/fechar-cortes.mjs <recorte.json> --chave humano:arquivo5 [--sem-criados] [--ver <arquivo>] [--gravar]
//
// (`--sem-criados`: os criados só marcam o que o dono quis e o buraco inteiro é escolhido pelo que dobra menos. O mesmo número de triângulos; na bochecha do
// Masculino, os criados longos que ficavam faziam uma estrela sob a luz, e assim ela some.)
//
// 1. os CORTES saem de vez da malha: cada grupo deles é um buraco, com uma beira (a pele como aparece, com os vértices movidos);
// 2. cada triângulo CRIADO que caiba inteiro no buraco, sem cobrir outro ponto da beira nem cruzar outra aresta, FICA como o dono fez;
// 3. o que sobra é triangulado sem pontos novos, escolhendo o que dobra menos em 3D: buraco de n pontos = n − 2 triângulos, nem um a mais. Buraco sem nenhum criado também
//    fecha. Tudo é decidido OLHANDO DE FRENTE, como o dono enxerga: num plano inclinado, um criado longo parecia caber e passava 0,6 cm na frente da
//    beira; é a sobreposição que ele via. Se a beira se cruza de frente (a pele vira para o lado), usa o plano do buraco;
// 4. com o espelho, o outro lado repete. A ferramenta para se a malha não fecha, se um canto criado não está num ponto da malha ou se um apagado
//    que ainda vale encosta num buraco.
//
// Sem --gravar só mede. Com --gravar: as edições de antes vão para `<nome>-edicoes-antes-cortes.json`, a malha de antes para `<nome>-simples-antes.json`,
// a nova para `<nome>-simples.json`, o corpo é refeito e, no modelagem.json, saem os cortes, os criados e os movidos dos pontos que sumiram.
// Depois de rodar, a aba Modelo aberta tem de RECARREGAR.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const args = process.argv.slice(2), recorte = args[0];
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const CHAVE = opt('chave'), GRAVAR = args.includes('--gravar');
const falha = (m) => { console.error(`[corpo] ${m}`); process.exit(1); };
if (!recorte || !CHAVE) falha('uso: fechar-cortes.mjs <recorte.json> --chave humano:arquivo5 [--ver <arquivo>] [--gravar]');
const cfg = JSON.parse(fs.readFileSync(path.resolve(RAIZ, recorte), 'utf8'));
const arq = (s) => path.join(AQUI, `${cfg.nome}${s}`), SIMPLES = arq('-simples.json'), ANTES = arq('-simples-antes.json');
const de64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const lerCorpo = (nome) => { const c = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/corpos', `${nome}.json`), 'utf8')); return { P: de64(c.pos, Float32Array), I: de64(c.idx32, Uint32Array) }; };
if (!fs.existsSync(SIMPLES)) falha(`falta ${path.basename(SIMPLES)}`);
const fonte = JSON.parse(fs.readFileSync(SIMPLES, 'utf8'));
const { P, I } = lerCorpo(cfg.nome);
if (I.length !== fonte.idx.length || I.some((v, i) => v !== fonte.idx[i])) falha('o corpo não é da malha de agora: rode o importar.mjs antes');
const nt = I.length / 3, nv = P.length / 3;
const pt = (v, A = P) => [A[v * 3], A[v * 3 + 1], A[v * 3 + 2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const NO_PONTO = 0.009;
const pontoEm = (em) => { let b = -1, d = NO_PONTO; for (let v = 0; v < nv; v++) { const q = dist(pt(v), em); if (q < d) { d = q; b = v; } } return b; };
const MEIOS = Array.from({ length: nt }, (_, t) => [0, 1, 2].map((e) => (P[I[t * 3] * 3 + e] + P[I[t * 3 + 1] * 3 + e] + P[I[t * 3 + 2] * 3 + e]) / 3));
const triEm = (em, lim = 0.03) => { let b = -1, d = lim; MEIOS.forEach((m, t) => { const q = dist(m, em); if (q < d) { d = q; b = t; } }); return b; };
const trio = (t) => [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]];
const id = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);

// ---- as edições e a pele como aparece
const ARQ_MOD = path.join(RAIZ, 'assets/modelagem.json'), textoMod = fs.readFileSync(ARQ_MOD, 'utf8'), ed = JSON.parse(textoMod).corpos[CHAVE];
if (!ed?.cortes?.length) falha(`${CHAVE} não tem cortes`);
if ((ed.novos ?? []).some((n) => n.colagem)) falha('há um pedaço colado: funda-o antes (fundir-colagem.mjs)');
if (ed.vertices?.length) falha('há vértices criados: esta ferramenta não os conhece');
const D = Float64Array.from(P);
for (const m of ed.movidos ?? []) for (const s of m.espelho && Math.abs(m.em[0]) >= 0.05 ? [1, -1] : [1]) { const v = pontoEm([m.em[0] * s, m.em[1], m.em[2]]); if (v >= 0) { D[v * 3] += m.mover[0] * s; D[v * 3 + 1] += m.mover[1]; D[v * 3 + 2] += m.mover[2]; } }
const apagadosVivos = [];
for (const a of ed.apagados ?? []) { const u = pontoEm(a.em), w = pontoEm(a.com); if (u >= 0 && w >= 0) { for (let e = 0; e < 3; e++) D[u * 3 + e] = D[w * 3 + e]; apagadosVivos.push([u, w]); } }
const PD = (v) => pt(v, D);

// ---- os grupos de cortes: cada um é um buraco
const fora = new Set();
for (const c of ed.cortes) { const t = triEm(c.em); if (t < 0) falha(`corte sem triângulo: ${c.em}`); fora.add(t); }
const donos = new Map();
for (let t = 0; t < nt; t++) { const q = trio(t); for (let k = 0; k < 3; k++) { const s = id(q[k], q[(k + 1) % 3]); if (!donos.has(s)) donos.set(s, []); donos.get(s).push(t); } }
function agrupar() {
  const out = [], resto = new Set(fora);
  while (resto.size) {
    const s = resto.values().next().value, g = [s];
    resto.delete(s);
    for (let i = 0; i < g.length; i++) { const q = trio(g[i]); for (let k = 0; k < 3; k++) for (const u of donos.get(id(q[k], q[(k + 1) % 3]))) if (resto.has(u)) { resto.delete(u); g.push(u); } }
    out.push(g);
  }
  return out;
}
// o lado desenhado (o dos criados) manda; o outro repete
const NOVOS = ed.novos ?? [], ESPELHO = NOVOS.length ? NOVOS.every((n) => n.espelho) : true;
if (!ESPELHO) falha('há criados sem espelho: esta ferramenta só trata os dois lados iguais');
const LADO = NOVOS.length ? Math.sign(NOVOS[0].cantos[0].em[0]) : 1;
const espelhoV = (v) => { const p = pt(v), q = pontoEm([-p[0], p[1], p[2]]); if (q < 0) falha(`ponto sem par do outro lado: ${p}`); return q; };
const noVertice = NOVOS.map((n) => n.cantos.map((c) => { const v = pontoEm(c.em); if (v < 0) falha(`canto criado fora de um ponto da malha: ${c.em}`); return v; }));

// ---- a pele DOBRADA por cima de um buraco (de frente, na mesma profundidade) entra nele: fechar por baixo dela seria sobrepor (o dono: "não deixa eles se
// sobreporem"; o canto de dentro do olho, onde a região colada tem dobras). O pintado nunca entra
const PINTADOS = new Set((ed.cores ?? []).map((c) => triEm(c.em, 0.02)));
const chaveDe = new Map();
for (let t = 0; t < nt; t++) chaveDe.set([...trio(t)].sort((a, b) => a - b).join(), t);
const dobrados = [];
function engolir() {
  const a2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const cruza = (a, b, c, d) => a2(a, b, c) * a2(a, b, d) < -1e-9 && a2(c, d, a) * a2(c, d, b) < -1e-9;
  for (let volta = 0; volta < 12; volta++) {
    let entrou = 0;
    for (const g of agrupar()) {
      if (Math.sign(MEIOS[g[0]][0]) !== LADO) continue;
      const laco = lacosDe(g, true);
      if (!laco) continue;
      const poli = laco.map(PD), naBeira = new Set(laco), noDele = new Set(g.flatMap(trio));
      const dentro = (p) => { let d = false; for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) { const a = poli[i], b = poli[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) d = !d; } return d; };
      const zPoli = (p) => { let s = 0, w = 0; for (const b of poli) { const k = 1 / Math.max(0.02, Math.hypot(b[0] - p[0], b[1] - p[1])) ** 3; s += k * b[2]; w += k; } return s / w; };
      const x0 = Math.min(...poli.map((p) => p[0])), x1 = Math.max(...poli.map((p) => p[0])), y0 = Math.min(...poli.map((p) => p[1])), y1 = Math.max(...poli.map((p) => p[1]));
      for (let t = 0; t < nt; t++) {
        if (fora.has(t) || PINTADOS.has(t)) continue;
        const q = trio(t), c = q.map(PD);
        if (c.every((p) => p[0] < x0) || c.every((p) => p[0] > x1) || c.every((p) => p[1] < y0) || c.every((p) => p[1] > y1)) continue;
        let sobre = q.some((v, i) => !naBeira.has(v) && dentro(c[i]) && Math.abs(c[i][2] - zPoli(c[i])) < 1);
        for (let i = 0; i < 3 && !sobre; i++) for (let j = 0; j < laco.length && !sobre; j++) {
          const e = q[i], f = q[(i + 1) % 3], u = laco[j], w = laco[(j + 1) % laco.length];
          if (e === u || e === w || f === u || f === w) continue;
          const A = PD(e), B = PD(f), C = PD(u), E = PD(w);
          if (!cruza(A, B, C, E)) continue;
          const s = a2(A, B, C) / (a2(A, B, C) - a2(A, B, E)), X = [C[0] + (E[0] - C[0]) * s, C[1] + (E[1] - C[1]) * s], l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, m = Math.hypot(X[0] - A[0], X[1] - A[1]) / l;
          if (Math.abs(A[2] + (B[2] - A[2]) * m - (C[2] + (E[2] - C[2]) * s)) < 1) sobre = true;
        }
        if (!sobre) continue;
        const par = chaveDe.get(q.map(espelhoV).sort((a, b) => a - b).join());
        if (par === undefined) falha(`a pele dobrada em ${MEIOS[t].map((x) => x.toFixed(2))} não tem par do outro lado`);
        fora.add(t); fora.add(par); dobrados.push(t); entrou++;
      }
    }
    if (!entrou) return;
  }
}
engolir();
const grupos = agrupar();

// ---- o buraco no plano dele
function lacosDe(g, soTentar = false) {
  const ar = new Map();
  for (const t of g) { const q = trio(t); for (let k = 0; k < 3; k++) { const s = id(q[k], q[(k + 1) % 3]); ar.set(s, (ar.get(s) ?? 0) + 1); } }
  const beira = [...ar].filter(([, n]) => n === 1).map(([s]) => s.split('_').map(Number)), viz = new Map();
  for (const [a, b] of beira) { if (!viz.has(a)) viz.set(a, []); if (!viz.has(b)) viz.set(b, []); viz.get(a).push(b); viz.get(b).push(a); }
  if ([...viz.values()].some((l) => l.length !== 2)) { if (soTentar) return null; falha('a beira de um buraco se toca num ponto: corte também o triângulo que sobrou ali'); }
  const l = [beira[0][0]];
  for (let ant = -1, cur = l[0]; ;) { const nx = viz.get(cur).find((x) => x !== ant); if (nx === l[0]) break; l.push(nx); ant = cur; cur = nx; if (l.length > beira.length) falha('a beira de um buraco não fecha'); }
  if (l.length !== beira.length) { if (soTentar) return null; falha(`um buraco tem ${beira.length} arestas de beira e ${l.length} num laço: há um pedaço de pele preso dentro`); }
  return l;
}
// um laço (anti-horário, de frente) em n − 2 triângulos sem pontos novos, escolhidos pelo que fica mais SUAVE em 3D (programação dinâmica, como no fechamento de
// buracos de Liepa): cada aresta nova ou da beira custa o quanto dobra × o tamanho dela, contando a pele em volta; fiapo custa a mais. O Delaunay de frente
// fazia um leque de triângulos finos saindo de um ponto, que aparecia como uma estrela sob a luz
function triangularSuave(l, xy, ficam) {
  const m = l.length;
  const ar = (a, b, c) => { const A = xy.get(a), B = xy.get(b), C = xy.get(c); return (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]); };
  const n3 = (q) => { const [a, b, c] = q.map(PD), n = cross(sub(b, a), sub(c, a)), s = Math.hypot(...n) || 1; return n.map((x) => x / s); };
  const fora1 = (a, b) => { const f = ficam.find((q) => q.includes(a) && q.includes(b)); if (f) return n3(f); const u = (donos.get(id(a, b)) ?? []).find((x) => !fora.has(x)); return u === undefined ? null : n3(trio(u)); };
  const cruzam = (a, b, c, d) => a !== c && a !== d && b !== c && b !== d && ar(a, b, c) * ar(a, b, d) < 0 && ar(c, d, a) * ar(c, d, b) < 0;
  const dentro = (x, y) => { let d = false; for (let i = 0, j = m - 1; i < m; j = i++) { const A = xy.get(l[i]), B = xy.get(l[j]); if ((A[1] > y) !== (B[1] > y) && x < ((B[0] - A[0]) * (y - A[1])) / (B[1] - A[1]) + A[0]) d = !d; } return d; };
  const memoD = new Map();
  const diag = (i, j) => { if (j === i + 1 || (i === 0 && j === m - 1)) return true; const k = i * m + j; if (memoD.has(k)) return memoD.get(k); const A = xy.get(l[i]), B = xy.get(l[j]); let v = dentro((A[0] + B[0]) / 2, (A[1] + B[1]) / 2); for (let e = 0; e < m && v; e++) if (cruzam(l[i], l[j], l[e], l[(e + 1) % m])) v = false; memoD.set(k, v); return v; };
  const tam = (a, b) => dist(PD(a), PD(b));
  const dobra = (n1, n2, len) => (n2 ? (1 - dot(n1, n2)) * len : 0);
  const custoTri = (q) => { const [x, y, z] = q.map(PD), n = cross(sub(y, x), sub(z, x)), area = Math.hypot(...n) / 2, lm = Math.max(dist(x, y), dist(y, z), dist(x, z)), ql = (2 * area) / (lm * lm); return 0.01 * area + 0.04 / Math.max(ql, 0.02); };
  const memo = new Map();
  // a cadeia i…j, com a aresta i–j dividida com o triângulo do pai (normal nP); j = i + 1 é uma aresta da beira
  function cadeia(i, j, p) {
    const chave = `${i},${j},${p}`;
    if (memo.has(chave)) return memo.get(chave);
    const sort3 = (a, b, c) => [a, b, c].sort((x, y) => x - y).map((x) => l[x]), nP = p >= 0 ? n3(sort3(i, j, p)) : fora1(l[m - 1], l[0]);
    let r;
    if (j === i + 1) r = { c: dobra(nP, fora1(l[i], l[j]), tam(l[i], l[j])), t: [] };
    else {
      r = { c: Infinity, t: null };
      for (let k = i + 1; k < j; k++) {
        if (!diag(i, k) || !diag(k, j) || ar(l[i], l[k], l[j]) <= 1e-7) continue;
        const q = [l[i], l[k], l[j]], n = n3(q), A = cadeia(i, k, j), B = cadeia(k, j, i);
        if (!A.t || !B.t) continue;
        const c = custoTri(q) + dobra(n, nP, tam(l[i], l[j])) + A.c + B.c;
        if (c < r.c) r = { c, t: [q, ...A.t, ...B.t] };
      }
    }
    memo.set(chave, r);
    return r;
  }
  const r = cadeia(0, m - 1, -1);
  if (!r.t) falha(`o buraco não se triangula: ${l.map((v) => PD(v).slice(0, 2).map((x) => x.toFixed(2))).join(' | ')}`);
  return r.t;
}
function encher(laco) {
  // de frente; se a beira se cruza assim, o plano do buraco (a normal de Newell, virada para +z)
  const xy = new Map();
  for (const v of laco) xy.set(v, PD(v).slice(0, 2));
  {
    const seg = laco.map((v, i) => [v, laco[(i + 1) % laco.length]]), a2 = (a, b, c) => { const A = xy.get(a), B = xy.get(b), C = xy.get(c); return (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]); };
    const cruza = seg.some(([a, b], i) => seg.some(([c, d], j) => j > i && a !== c && a !== d && b !== c && b !== d && a2(a, b, c) * a2(a, b, d) < 0 && a2(c, d, a) * a2(c, d, b) < 0));
    if (cruza) {
      let n = [0, 0, 0];
      laco.forEach((v, i) => { const a = PD(v), b = PD(laco[(i + 1) % laco.length]); n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]); });
      if (n[2] < 0) n = n.map((x) => -x);
      const ln = Math.hypot(...n), N = n.map((x) => x / ln), U0 = cross([0, 1, 0], N), lu = Math.hypot(...U0), U = U0.map((x) => x / lu), W = cross(N, U);
      for (const v of laco) { const p = PD(v); xy.set(v, [dot(p, U), dot(p, W)]); }
      console.log(`[corpo] a beira em ${PD(laco[0]).map((x) => x.toFixed(1))} se cruza de frente: usei o plano do buraco`);
    }
  }
  const ar = (a, b, c) => { const A = xy.get(a), B = xy.get(b), C = xy.get(c); return (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]); };
  const areaL = (l) => l.reduce((s, v, i) => { const a = xy.get(v), b = xy.get(l[(i + 1) % l.length]); return s + a[0] * b[1] - b[0] * a[1]; }, 0);
  const L = areaL(laco) > 0 ? [...laco] : [...laco].reverse();   // (anti-horário, de frente)
  const cruzam = (a, b, c, d) => a !== c && a !== d && b !== c && b !== d && ar(a, b, c) * ar(a, b, d) < 0 && ar(c, d, a) * ar(c, d, b) < 0;
  const arestasL = L.map((v, i) => [v, L[(i + 1) % L.length]]);
  // (a beira não pode se cruzar, de frente: aí o plano não serve)
  for (let i = 0; i < arestasL.length; i++) for (let j = i + 1; j < arestasL.length; j++) if (cruzam(arestasL[i][0], arestasL[i][1], arestasL[j][0], arestasL[j][1])) falha(`a beira de um buraco se cruza, de frente: ${PD(L[0]).map((x) => x.toFixed(1))}`);
  const dentroDoLaco = (x, y) => { let d = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) { const a = xy.get(L[i]), b = xy.get(L[j]); if ((a[1] > y) !== (b[1] > y) && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) d = !d; } return d; };
  const naBeira = new Set(arestasL.map(([a, b]) => id(a, b)));
  const diagonalVale = (a, b) => { if (naBeira.has(id(a, b))) return true; if (arestasL.some(([c, d]) => cruzam(a, b, c, d))) return false; const A = xy.get(a), B = xy.get(b); return dentroDoLaco((A[0] + B[0]) / 2, (A[1] + B[1]) / 2); };
  // 2. os do dono que cabem
  const ids = new Set(L), ficam = [], usadas = [];
  (args.includes('--sem-criados') ? [] : noVertice).forEach((q) => {
    if (!q.every((v) => ids.has(v))) return;
    const f = ar(q[0], q[1], q[2]) > 0 ? [...q] : [q[0], q[2], q[1]];
    if (Math.abs(ar(f[0], f[1], f[2])) < 1e-6) return;
    if (L.some((v) => !f.includes(v) && ar(f[0], f[1], v) >= -1e-9 && ar(f[1], f[2], v) >= -1e-9 && ar(f[2], f[0], v) >= -1e-9)) return;
    const lados = [[f[0], f[1]], [f[1], f[2]], [f[2], f[0]]];
    if (!lados.every(([a, b]) => diagonalVale(a, b))) return;
    if (lados.some(([a, b]) => usadas.some(([c, d]) => cruzam(a, b, c, d)))) return;
    // (nenhum canto de um já aceito dentro dele, nem o contrário)
    if (ficam.some((o) => o.some((v) => !f.includes(v) && ar(f[0], f[1], v) >= -1e-9 && ar(f[1], f[2], v) >= -1e-9 && ar(f[2], f[0], v) >= -1e-9))) return;
    ficam.push(f);
    usadas.push(...lados);
  });
  // 3. o que sobra: as arestas dirigidas que restam formam laços
  const dirigidas = new Set(arestasL.map(([a, b]) => `${a}>${b}`));
  for (const f of ficam) for (let k = 0; k < 3; k++) { const a = f[k], b = f[(k + 1) % 3]; if (dirigidas.has(`${a}>${b}`)) dirigidas.delete(`${a}>${b}`); else dirigidas.add(`${b}>${a}`); }
  const saem = new Map();
  for (const s of dirigidas) { const [a, b] = s.split('>').map(Number); if (!saem.has(a)) saem.set(a, []); saem.get(a).push(b); }
  const preenchidos = [];
  while ([...saem.values()].some((l) => l.length)) {
    // (num ponto de onde saem duas arestas, dois pedaços se tocam: segue a que fecha o menor ângulo por dentro, senão os dois viram um laço só)
    const ini = [...saem].find(([, l]) => l.length)[0], primeira = saem.get(ini).shift(), laco2 = [ini];
    const proxima = (ant, cur) => {
      const l = [...saem.get(cur), ...(cur === ini ? [primeira] : [])], A = xy.get(ant), C = xy.get(cur), volta = [A[0] - C[0], A[1] - C[1]];
      let m = -1, melhor = Infinity;
      l.forEach((w, i) => { const W2 = xy.get(w), s = [W2[0] - C[0], W2[1] - C[1]]; let g = Math.atan2(s[0] * volta[1] - s[1] * volta[0], s[0] * volta[0] + s[1] * volta[1]); if (g <= 1e-9) g += 2 * Math.PI; if (g < melhor) { melhor = g; m = i; } });
      return l[m];
    };
    for (let ant = ini, cur = primeira; ;) {
      const nx = proxima(ant, cur);
      if (cur === ini && nx === primeira) break;
      laco2.push(cur);
      const l = saem.get(cur), k = l.indexOf(nx);
      if (k < 0) falha('os laços que sobram não fecham');
      l.splice(k, 1);
      ant = cur; cur = nx;
      if (laco2.length > L.length + 2) falha('os laços que sobram não fecham');
    }
    preenchidos.push(...triangularSuave(laco2, xy, ficam));
  }
  return { L, ficam, preenchidos };
}

// ---- cada buraco do lado que manda
const novos = [], rel = [], noBuracoDe = [];
const noBuraco = new Set();
for (const g of grupos) for (const t of g) for (const v of trio(t)) noBuraco.add(v);
for (const [u, w] of apagadosVivos) if (noBuraco.has(u) || noBuraco.has(w)) falha(`um apagado encosta num buraco: ${pt(u).map((x) => x.toFixed(2))}. Asse-o antes (reduzir-regiao.mjs)`);
for (const g of grupos) {
  if (Math.sign(MEIOS[g[0]][0]) !== LADO) continue;
  const laco = lacosDe(g), { L, ficam, preenchidos } = encher(laco), todos = [...ficam, ...preenchidos];
  if (todos.length !== L.length - 2) falha(`um buraco de ${L.length} pontos deu ${todos.length} triângulos`);
  for (const q of todos) { noBuracoDe.push(rel.length); novos.push(q); }
  rel.push({ cortados: g.length, pontos: L.length, doDono: ficam.length, novos: preenchidos.length, x: [Math.min(...L.map((v) => D[v * 3])), Math.max(...L.map((v) => D[v * 3]))], y: [Math.min(...L.map((v) => D[v * 3 + 1])), Math.max(...L.map((v) => D[v * 3 + 1]))] });
}
// o outro lado
for (const t of fora) { if (Math.sign(MEIOS[t][0]) !== LADO) continue; const u = chaveDe.get(trio(t).map(espelhoV).sort((a, b) => a - b).join()); if (u === undefined || !fora.has(u)) falha(`o corte em ${MEIOS[t].map((x) => x.toFixed(2))} não tem par do outro lado`); }
const espelhados = novos.map(([a, b, c]) => [espelhoV(a), espelhoV(c), espelhoV(b)]);
const finais = [];
for (let t = 0; t < nt; t++) if (!fora.has(t)) finais.push(trio(t));
const nKept = finais.length;
finais.push(...novos, ...espelhados);

// ---- a conferência
const contar = (l) => { const c = new Map(), d = new Map(); for (const q of l) for (let k = 0; k < 3; k++) { const a = q[k], b = q[(k + 1) % 3], e = id(a, b); c.set(e, (c.get(e) ?? 0) + 1); d.set(`${a}_${b}`, (d.get(`${a}_${b}`) ?? 0) + 1); } return { abertas: [...c.values()].filter((n) => n === 1).length, demais: [...c.values()].filter((n) => n > 2).length, contramao: [...d.values()].filter((n) => n > 1).length }; };
const antes = contar(Array.from({ length: nt }, (_, t) => trio(t))), depois = contar(finais);
const nor = (q) => { const [a, b, c] = q.map(PD); return cross(sub(b, a), sub(c, a)); };
const qual = (q) => { const [a, b, c] = q.map(PD), l = Math.max(dist(a, b), dist(b, c), dist(c, a)); return Math.hypot(...nor(q)) / (l * l); };
for (const r of rel) console.log(`[corpo] buraco em x ${r.x[0].toFixed(1)}…${r.x[1].toFixed(1)}, y ${r.y[0].toFixed(1)}…${r.y[1].toFixed(1)}: ${r.cortados} cortados; beira de ${r.pontos} pontos; ${r.doDono} criados seus ficam, ${r.novos} novos`);
// a sobreposição, de frente: os triângulos novos entre si e com a pele em volta (os que dividem aresta ou ponto não contam, se não cruzam)
const ar2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const cruza2 = (a, b, c, d) => ar2(a, b, c) * ar2(a, b, d) < -1e-9 && ar2(c, d, a) * ar2(c, d, b) < -1e-9;
// (z de cada aresta no ponto em que elas se cruzam: a pele de trás de uma dobra, longe em z, não é sobreposição)
const zNoCruzamento = (A, B, C, D2) => { const d = ar2(A, B, C) - ar2(A, B, D2), s = ar2(A, B, C) / d, X = [C[0] + (D2[0] - C[0]) * s, C[1] + (D2[1] - C[1]) * s], l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1, u = Math.hypot(X[0] - A[0], X[1] - A[1]) / l; return [A[2] + (B[2] - A[2]) * u, C[2] + (D2[2] - C[2]) * s]; };
const vizinhas = finais.slice(0, nKept).filter((q) => q.some((v) => noBuraco.has(v)));
let cruzamEntre = 0, cruzamPele = 0, peleLonge = 0, piorZ = 0;
for (const r of rel) { r.entre = 0; r.pele = 0; r.piorZ = 0; r.ex = []; }
for (let i = 0; i < novos.length; i++) for (let k = 0; k < 3; k++) {
  const a = novos[i][k], b = novos[i][(k + 1) % 3];
  for (let j = i + 1; j < novos.length; j++) for (let m = 0; m < 3; m++) { const c = novos[j][m], d = novos[j][(m + 1) % 3]; if (![c, d].includes(a) && ![c, d].includes(b) && cruza2(PD(a), PD(b), PD(c), PD(d))) { cruzamEntre++; rel[noBuracoDe[i]].entre++; if (noBuracoDe[i] !== noBuracoDe[j]) rel[noBuracoDe[i]].entreOutro = (rel[noBuracoDe[i]].entreOutro ?? 0) + 1; } }
  for (const q of vizinhas) for (let m = 0; m < 3; m++) {
    const c = q[m], d = q[(m + 1) % 3];
    if ([c, d].includes(a) || [c, d].includes(b) || !cruza2(PD(a), PD(b), PD(c), PD(d))) continue;
    const [za, zc] = zNoCruzamento(PD(a), PD(b), PD(c), PD(d)), dz = Math.abs(za - zc);
    if (dz < 1) { cruzamPele++; piorZ = Math.max(piorZ, dz); const r = rel[noBuracoDe[i]]; r.pele++; r.piorZ = Math.max(r.piorZ, dz); if (r.ex.length < 4) r.ex.push(`${PD(a).map((x) => x.toFixed(2))} a ${PD(b).map((x) => x.toFixed(2))} × ${PD(c).map((x) => x.toFixed(2))} a ${PD(d).map((x) => x.toFixed(2))}`); } else peleLonge++;
  }
}
console.log(`[corpo] pele dobrada que entrou nos buracos, por lado: ${dobrados.length} triângulo(s)${dobrados.length ? `, em x ${Math.min(...dobrados.map((t) => MEIOS[t][0])).toFixed(1)}…${Math.max(...dobrados.map((t) => MEIOS[t][0])).toFixed(1)}, y ${Math.min(...dobrados.map((t) => MEIOS[t][1])).toFixed(1)}…${Math.max(...dobrados.map((t) => MEIOS[t][1])).toFixed(1)}` : ''}`);
console.log(`[corpo] ${fora.size} triângulos saem, ${novos.length + espelhados.length} entram (${novos.length} por lado); corpo: ${nt} → ${finais.length}; arestas abertas ${antes.abertas} → ${depois.abertas}, com mais de dois ${antes.demais} → ${depois.demais}, na contramão ${antes.contramao} → ${depois.contramao}; pior qualidade ${Math.min(...novos.map(qual)).toFixed(3)}; de costas ${novos.filter((q) => nor(q)[2] <= 0).length}; arestas novas que se cruzam, de frente: entre si ${cruzamEntre}, com a pele em volta ${cruzamPele} (a até ${piorZ.toFixed(2)} cm em z; com pele mais longe, atrás de uma dobra: ${peleLonge})`);
for (const r of rel) console.log(`[corpo]   em x ${r.x[0].toFixed(1)}…${r.x[1].toFixed(1)}, y ${r.y[0].toFixed(1)}…${r.y[1].toFixed(1)}: cruzam entre si ${r.entre} (com outro buraco ${r.entreOutro ?? 0}), com a pele ${r.pele} (até ${r.piorZ.toFixed(2)} cm em z)${process.env.DETALHE ? ' ' + r.ex.join(' ; ') : ''}`);
if (args.includes('--ver')) {
  const cor = (q) => { const m = [0, 1, 2].map((e) => (P[q[0] * 3 + e] + P[q[1] * 3 + e] + P[q[2] * 3 + e]) / 3), k = (ed.cores ?? []).find((x) => Math.abs(x.em[0] - m[0]) < 0.02 && Math.abs(x.em[1] - m[1]) < 0.02 && Math.abs(x.em[2] - m[2]) < 0.02); return k ? [k.uv, k.tom ?? null] : null; };
  const noLado = (q) => D[q[0] * 3] * LADO > 0;
  const xy = (q) => q.flatMap((v) => [D[v * 3], D[v * 3 + 1]]);
  fs.writeFileSync(opt('ver'), JSON.stringify({ V: [...D].map((x) => Math.round(x * 1000) / 1000), F: finais.flat(), iPed: 0, cores: finais.map(cor), pele: finais.slice(0, nKept).filter(noLado).map(xy), novosXY: novos.map(xy), caixa: LADO < 0 ? [-8.5, 160.4, -0.2, 172.6] : [0.2, 160.4, 8.5, 172.6] }));
}
if (depois.abertas > antes.abertas || depois.demais > antes.demais || depois.contramao > antes.contramao) falha('a malha não fechou: nada gravado');
if (!GRAVAR) process.exit(0);

// ---- a malha nova
const novoDe = new Int32Array(nv).fill(-1);
for (const q of finais) for (const v of q) novoDe[v] = 1;
let nn = 0;
for (let v = 0; v < nv; v++) if (novoDe[v] > 0) novoDe[v] = nn++;
const pos = new Array(nn * 3), normal = new Array(nn * 3), uv = new Array(nn * 2).fill(0);
for (let v = 0; v < nv; v++) {
  const n = novoDe[v];
  if (n < 0) continue;
  for (let e = 0; e < 3; e++) { pos[n * 3 + e] = fonte.pos[v * 3 + e]; normal[n * 3 + e] = fonte.normal[v * 3 + e]; }
  if (fonte.uv) { uv[n * 2] = fonte.uv[v * 2]; uv[n * 2 + 1] = fonte.uv[v * 2 + 1]; }
}
// (a normal refeita em quem mudou de volta)
const mudou = new Set();
for (const t of fora) for (const v of trio(t)) mudou.add(v);
const FP = (v) => [fonte.pos[v * 3], fonte.pos[v * 3 + 1], fonte.pos[v * 3 + 2]], soma = new Map();
for (const q of finais) {
  if (!q.some((v) => mudou.has(v))) continue;
  const [a, b, c] = q.map(FP), n = cross(sub(b, a), sub(c, a));
  for (const v of q) { if (!soma.has(v)) soma.set(v, [0, 0, 0]); const s = soma.get(v); s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; }
}
for (const v of mudou) { const n = novoDe[v], s = soma.get(v); if (n < 0 || !s) continue; const l = Math.hypot(...s) || 1; for (let e = 0; e < 3; e++) normal[n * 3 + e] = s[e] / l; }
const idx = finais.flat().map((v) => novoDe[v]);

if (fs.readFileSync(ARQ_MOD, 'utf8') !== textoMod) falha('o modelagem.json mudou no disco enquanto eu trabalhava: nada gravado; rode de novo');
let copia = arq('-edicoes-antes-cortes.json');
for (let n = 2; fs.existsSync(copia); n++) copia = arq(`-edicoes-antes-cortes-${n}.json`);
fs.writeFileSync(copia, JSON.stringify({ _leiame: `As edições de ${CHAVE} antes de fechar os cortes (fechar-cortes.mjs, ${new Date().toISOString().slice(0, 10)}): valem só para a malha de <nome>-simples-antes.json.`, cortes: ed.cortes, novos: ed.novos ?? [], movidos: ed.movidos ?? [] }, null, 1) + '\n');
if (fs.existsSync(ANTES)) { let n = 2, velha = arq(`-simples-antes-${n}.json`); while (fs.existsSync(velha)) velha = arq(`-simples-antes-${++n}.json`); fs.renameSync(ANTES, velha); }
fs.renameSync(SIMPLES, ANTES);
fs.writeFileSync(SIMPLES, JSON.stringify({ _leiame: `A malha de ${cfg.entrada} com os cortes fechados (fechar-cortes.mjs): pos/normal (pose A, unidades do arquivo), uv, idx. O importar.mjs a usa no lugar da do .glb.`, pos, uv, normal, idx }) + '\n');
console.log(`[corpo] gravado: ${path.relative(RAIZ, SIMPLES)} (${nn} pontos, ${idx.length / 3} triângulos); cópia das edições em ${path.relative(RAIZ, copia)}`);
execFileSync(process.execPath, [path.join(AQUI, 'importar.mjs'), recorte], { cwd: RAIZ, stdio: 'inherit' });

// ---- o modelagem.json: só este corpo muda (o resto, byte a byte)
const N = lerCorpo(cfg.nome);
if (N.I.length !== idx.length) falha('o corpo refeito não bate com a malha nova');
const sumiu = (em) => { const v = pontoEm(em); return v >= 0 && novoDe[v] < 0; };
const novoEd = {};
for (const [k, val] of Object.entries(ed)) {
  if (k === 'cortes' || k === 'novos') continue;
  if (k === 'movidos') { novoEd.movidos = val.filter((m) => !sumiu(m.em) && !(m.espelho && sumiu([-m.em[0], m.em[1], m.em[2]]))); continue; }
  novoEd[k] = val;
}
const fecha = (t, i) => { const a = t[i], b = a === '{' ? '}' : ']'; let d = 0, s = false; for (let k = i; k < t.length; k++) { const c = t[k]; if (s) { if (c === '\\') k++; else if (c === '"') s = false; continue; } if (c === '"') s = true; else if (c === a) d++; else if (c === b && --d === 0) return k; } return falha('modelagem.json torto'); };
const iniCorpo = textoMod.indexOf(`"${CHAVE}": {`), abre = textoMod.indexOf('{', iniCorpo), fimCorpo = fecha(textoMod, abre);
const bloco = `{\n${Object.entries(novoEd).map(([k, v]) => `      ${JSON.stringify(k)}: ${Array.isArray(v) && v.length ? `[\n${v.map((x) => `        ${JSON.stringify(x)}`).join(',\n')}\n      ]` : JSON.stringify(v)}`).join(',\n')}\n    }`;
const textoNovo = textoMod.slice(0, abre) + bloco + textoMod.slice(fimCorpo + 1);
JSON.parse(textoNovo);
if (fs.readFileSync(ARQ_MOD, 'utf8') !== textoMod) falha('o modelagem.json mudou no disco enquanto o corpo era refeito: a malha nova foi gravada, as edições não');
fs.writeFileSync(ARQ_MOD, textoNovo);
console.log(`[corpo] modelagem.json: ${ed.cortes.length} cortes e ${NOVOS.length} criados saíram; movidos ${(ed.movidos ?? []).length} → ${novoEd.movidos?.length ?? 0}`);
