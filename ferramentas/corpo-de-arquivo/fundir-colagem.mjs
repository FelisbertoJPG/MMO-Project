#!/usr/bin/env node
// FUNDIR UM PEDAÇO COLADO NA MALHA de um corpo de arquivo (02/11/2026; o dono, no Masculino, com o olho da Feminino 4 colado pelo
// "copiar malha" da aba Modelo: "a ideia é colar e remover as malhas que ele vai sobrepor, assim ele vira a malha daquela parte do rosto"):
//
//   node ferramentas/corpo-de-arquivo/fundir-colagem.mjs <recorte.json> --chave humano:arquivo5 [--colagem <nome>] [--folga 0]
//        [--sem-aparar] [--ver <arquivo>] [--gravar]
//
// 1. o pedaço: os `novos` com aquele `colagem` (sem --colagem: o único que houver). Os furinhos dentro dele (triângulos que ficaram sem
//    marcar) são preenchidos, com a cor da maioria em volta. A frente de cada triângulo vem da malha dele, não da vista: o olho tem dobras.
//    As pontas compridas da seleção (ângulo agudo, arestas longas, sem cor) são aparadas, salvo com --sem-aparar;
// 2. o que ele cobre, olhando de frente: toda a pele que encosta no contorno dele sai (e o que ficar preso dentro disso). A pele é a
//    que aparece no editor, com os vértices movidos e apagados; os apagados que encostam no buraco viram malha, e as cores do que saiu saem;
// 3. a profundidade: o x e o y não mudam. O contorno do pedaço vai para a frente da pele que estava ali (mais `folga` cm; negativo: atrás
//    dela) e o que anda em z é distribuído para dentro (Laplace na malha do pedaço): a borda encosta na pele e o miolo guarda a forma;
// 4. o vão entre a beira do buraco e o contorno é triangulado (Delaunay com as duas beiras presas), sem pontos novos;
// 5. com `espelho`, tudo igual do outro lado.
//
// Sem --gravar só mede (--ver grava os dados para um diagrama). Com --gravar: as edições de antes vão para
// `<nome>-edicoes-antes-colagem.json`, a malha de antes para `<nome>-simples-antes.json`, a nova para `<nome>-simples.json`, o corpo é
// refeito e, no modelagem.json, os criados do pedaço saem, a cor dele vira `cores` e os movidos e apagados de pontos que sumiram saem.
// O que está fora da volta do buraco não muda. Depois de rodar, a aba Modelo aberta tem de RECARREGAR.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const args = process.argv.slice(2), recorte = args[0];
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const CHAVE = opt('chave'), FOLGA = Number(opt('folga', 0)), GRAVAR = args.includes('--gravar');
const falha = (m) => { console.error(`[corpo] ${m}`); process.exit(1); };
if (!recorte || !CHAVE) falha('uso: fundir-colagem.mjs <recorte.json> --chave humano:arquivo5 [--colagem <nome>] [--folga 0] [--ver <arquivo>] [--gravar]');
const cfg = JSON.parse(fs.readFileSync(path.resolve(RAIZ, recorte), 'utf8'));
const arq = (s) => path.join(AQUI, `${cfg.nome}${s}`), SIMPLES = arq('-simples.json'), ANTES = arq('-simples-antes.json');
const de64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const lerCorpo = (nome) => { const c = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/corpos', `${nome}.json`), 'utf8')); return { P: de64(c.pos, Float32Array), I: de64(c.idx32, Uint32Array) }; };
if (!fs.existsSync(SIMPLES)) falha(`falta ${path.basename(SIMPLES)}: esta ferramenta trabalha sobre a malha simplificada`);
const fonte = JSON.parse(fs.readFileSync(SIMPLES, 'utf8'));
const { P, I } = lerCorpo(cfg.nome);
if (I.length !== fonte.idx.length || I.some((v, i) => v !== fonte.idx[i])) falha('o corpo não é da malha de agora: rode o importar.mjs antes');
const nt = I.length / 3, nv = P.length / 3;
const pt = (v, A = P) => [A[v * 3], A[v * 3 + 1], A[v * 3 + 2]];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const NO_PONTO = 0.009;   // (cm: modelagem.js NO_MOVIDO)
const pontoEm = (em) => { let b = -1, d = NO_PONTO; for (let v = 0; v < nv; v++) { const q = dist(pt(v), em); if (q < d) { d = q; b = v; } } return b; };

// ---- as edições
const ARQ_MOD = path.join(RAIZ, 'assets/modelagem.json'), textoMod = fs.readFileSync(ARQ_MOD, 'utf8'), MOD = JSON.parse(textoMod).corpos, ed = MOD[CHAVE];
if (!ed) falha(`não há edições de ${CHAVE}`);
if (ed.cortes?.length || ed.vertices?.length) falha(`${CHAVE} tem cortes ou vértices criados pendentes: feche-os antes`);
const nomes = [...new Set((ed.novos ?? []).map((n) => n.colagem).filter(Boolean))];
const ID = opt('colagem') ?? (nomes.length === 1 ? nomes[0] : null);
if (!ID) falha(nomes.length ? `há mais de um pedaço colado (${nomes.join(', ')}): diga qual com --colagem` : 'não há pedaço colado neste corpo (salve no editor antes)');
const colados = ed.novos.filter((n) => n.colagem === ID), ESPELHO = colados.some((n) => n.espelho);
if (!colados.length) falha(`não há o pedaço ${ID}`);

// ---- a pele como aparece: os movidos e depois os apagados, na ordem do modelagem.js
const lados = (m) => (m.espelho && Math.abs(m.em[0]) >= 0.05 ? [1, -1] : [1]);
const D = Float64Array.from(P);
for (const m of ed.movidos ?? []) for (const s of lados(m)) { const v = pontoEm([m.em[0] * s, m.em[1], m.em[2]]); if (v >= 0) { D[v * 3] += m.mover[0] * s; D[v * 3 + 1] += m.mover[1]; D[v * 3 + 2] += m.mover[2]; } }
const rep = Int32Array.from({ length: nv }, (_, i) => i), deApagado = new Map();
for (const x of ed.apagados ?? []) {
  const u = pontoEm(x.em), a = pontoEm(x.com);
  if (u < 0 || a < 0) continue;
  for (let e = 0; e < 3; e++) D[u * 3 + e] = D[a * 3 + e];
  rep[u] = a;
  deApagado.set(u, x);
}
// (o vértice só está junto do alvo se ainda estiver no mesmo lugar: o alvo pode ter andado depois)
const raizDe = (v) => { let r = v; while (rep[r] !== r && dist(pt(r, D), pt(rep[r], D)) < 1e-6) r = rep[r]; return r; };
const R = Int32Array.from({ length: nv }, (_, v) => raizDe(v));
const triR = (t) => [R[I[t * 3]], R[I[t * 3 + 1]], R[I[t * 3 + 2]]];
const achatado = (q) => q[0] === q[1] || q[1] === q[2] || q[0] === q[2];
const ptD = (v) => pt(v, D);

// ---- 1. o pedaço: pontos, triângulos (de frente: anti-horário em x, y), o furo de um triângulo e o contorno
const movidoEm = (em) => { const d = [0, 0, 0]; for (const m of ed.movidos ?? []) for (const s of lados(m)) if (dist([m.em[0] * s, m.em[1], m.em[2]], em) < NO_PONTO) { d[0] += m.mover[0] * s; d[1] += m.mover[1]; d[2] += m.mover[2]; } return d; };
const pPed = [], idPed = new Map();
const noPed = (em) => { const k = em.join(); if (!idPed.has(k)) { const d = movidoEm(em); idPed.set(k, pPed.length); pPed.push([em[0] + d[0], em[1] + d[1], em[2] + d[2]]); } return idPed.get(k); };
const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const trisPed = colados.map((n) => ({ q: n.cantos.map((c) => noPed(c.em)), uv: n.uv, tom: n.tom }));
const arestasDe = (l) => { const m = new Map(); for (const q of l) for (let k = 0; k < 3; k++) { const a = q[k], b = q[(k + 1) % 3], c = a < b ? `${a}_${b}` : `${b}_${a}`; m.set(c, (m.get(c) ?? 0) + 1); } return m; };
const beiraDe = (l) => [...arestasDe(l)].filter(([, n]) => n === 1).map(([c]) => c.split('_').map(Number));
// os laços de uma lista de arestas (num ponto em que a beira se toca, segue pela aresta que resta)
function lacosDe(pares) {
  const viz = new Map(), id = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`), usadas = new Set(), lacos = [];
  for (const [a, b] of pares) { if (!viz.has(a)) viz.set(a, []); if (!viz.has(b)) viz.set(b, []); viz.get(a).push(b); viz.get(b).push(a); }
  for (const [a, b] of pares) {
    if (usadas.has(id(a, b))) continue;
    const l = [a];
    usadas.add(id(a, b));
    for (let cur = b; cur !== a;) { l.push(cur); const nx = viz.get(cur).find((x) => !usadas.has(id(cur, x))); if (nx === undefined) break; usadas.add(id(cur, nx)); cur = nx; }
    lacos.push(l);
  }
  return { viz, lacos, tocam: [...viz].filter(([, l]) => l.length !== 2).map(([v]) => v) };
}
function umLaco(pares, nome) {
  const { lacos, tocam } = lacosDe(pares);
  if (tocam.length) falha(`${nome} se toca em ${tocam.length} ponto(s)`);
  if (lacos.length !== 1) falha(`${nome}: ${lacos.length} laços (${lacos.map((l) => l.length).join(', ')} arestas)`);
  return lacos[0];
}
// os furinhos: todo laço de beira que não seja o de fora vira triângulos, com a cor da maioria dos vizinhos
const areaDoLaco = (l) => l.reduce((s, v, i) => { const a = pPed[v], b = pPed[l[(i + 1) % l.length]]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
function encher(l0) {
  const l = areaDoLaco(l0) < 0 ? [...l0].reverse() : [...l0], T = [];
  while (l.length > 3) {
    let m = -1;
    for (let i = 0; i < l.length && m < 0; i++) {
      const a = pPed[l[(i + l.length - 1) % l.length]], b = pPed[l[i]], c = pPed[l[(i + 1) % l.length]];
      if (area2(a, b, c) > 1e-7 && !l.some((v, k) => k !== i && k !== (i + l.length - 1) % l.length && k !== (i + 1) % l.length && area2(a, b, pPed[v]) >= 0 && area2(b, c, pPed[v]) >= 0 && area2(c, a, pPed[v]) >= 0)) m = i;
    }
    if (m < 0) falha(`um furo do pedaço não se triangula: ${l.map((v) => pPed[v].slice(0, 2)).join(' | ')}`);
    T.push([l[(m + l.length - 1) % l.length], l[m], l[(m + 1) % l.length]]);
    l.splice(m, 1);
  }
  T.push(l);
  return T;
}
let preenchidos = 0;
{
  const { lacos } = lacosDe(beiraDe(trisPed.map((t) => t.q)));
  const tam = (l) => { const p = l.map((v) => pPed[v]); return Math.hypot(Math.max(...p.map((x) => x[0])) - Math.min(...p.map((x) => x[0])), Math.max(...p.map((x) => x[1])) - Math.min(...p.map((x) => x[1]))); };
  const deFora = lacos.reduce((a, b) => (tam(b) > tam(a) ? b : a));
  for (const l of lacos) {
    if (l === deFora) continue;
    if (l.length > 8) falha(`o pedaço tem um furo grande, de ${l.length} arestas: marque o que falta e cole de novo`);
    const ids = new Set(l), cores = trisPed.filter((t) => t.q.filter((v) => ids.has(v)).length >= 2), brancos = cores.filter((t) => t.uv), dono = brancos.length * 2 > cores.length ? brancos[0] : null;
    for (const q of encher(l)) { trisPed.push({ q, ...(dono ? { uv: dono.uv, tom: dono.tom } : {}) }); preenchidos++; }
  }
}
// a frente de cada triângulo: a da malha (uma aresta anda ao contrário no vizinho); o maior deles, de frente, dá o sentido
{
  const donos = new Map(), id = (a, b) => (a < b ? `${a}_${b}` : `${b}_${a}`);
  trisPed.forEach((t, i) => { for (let k = 0; k < 3; k++) { const c = id(t.q[k], t.q[(k + 1) % 3]); if (!donos.has(c)) donos.set(c, []); donos.get(c).push(i); } });
  const seed = trisPed.reduce((b, t, i) => { const a = Math.abs(area2(pPed[t.q[0]], pPed[t.q[1]], pPed[t.q[2]])); return a > b.a ? { a, i } : b; }, { a: -1, i: 0 }).i;
  const feito = new Set([seed]), fila = [seed];
  if (area2(pPed[trisPed[seed].q[0]], pPed[trisPed[seed].q[1]], pPed[trisPed[seed].q[2]]) < 0) trisPed[seed].q.reverse();
  for (let f = 0; f < fila.length; f++) {
    const t = trisPed[fila[f]];
    for (let k = 0; k < 3; k++) {
      const a = t.q[k], b = t.q[(k + 1) % 3];
      for (const u of donos.get(id(a, b))) {
        const o = trisPed[u], anda = [0, 1, 2].some((j) => o.q[j] === a && o.q[(j + 1) % 3] === b);
        if (feito.has(u)) { if (u !== fila[f] && anda) falha('o pedaço não tem frente: uma faixa de Möbius?'); continue; }
        if (anda) o.q.reverse();
        feito.add(u); fila.push(u);
      }
    }
  }
  if (feito.size !== trisPed.length) falha(`o pedaço tem ${trisPed.length - feito.size} triângulo(s) soltos, que só encostam nele por um ponto: marque o que falta e cole de novo`);
}
// as PONTAS que o pincel pegou na borda (triângulos compridos da pele de lá, que só encostam na seleção por uma ponta): saem, senão apagariam
// a pele daqui até longe (a sobrancelha, o lado do nariz). Ponta = ponto do contorno de ângulo agudo cujas arestas são todas longas; o pintado nunca sai
let pontasSaem = 0;
if (!args.includes('--sem-aparar')) {
  const compr = [...arestasDe(trisPed.map((t) => t.q)).keys()].map((c) => { const [a, b] = c.split('_').map(Number); return Math.hypot(pPed[a][0] - pPed[b][0], pPed[a][1] - pPed[b][1]); }).sort((a, b) => a - b), LONGA = compr[compr.length >> 1] * 2;
  for (let volta = 0; volta < 10; volta++) {
    const pontas = new Set();
    for (const v of new Set(beiraDe(trisPed.map((t) => t.q)).flat())) {
      let ang = 0, curta = Infinity;
      const dele = trisPed.filter((t) => t.q.includes(v));
      for (const t of dele) {
        const i = t.q.indexOf(v), a = pPed[v], b = pPed[t.q[(i + 1) % 3]], c = pPed[t.q[(i + 2) % 3]], u = [b[0] - a[0], b[1] - a[1]], w = [c[0] - a[0], c[1] - a[1]];
        ang += Math.abs(Math.atan2(u[0] * w[1] - u[1] * w[0], u[0] * w[0] + u[1] * w[1]));
        curta = Math.min(curta, Math.hypot(...u), Math.hypot(...w));
      }
      if (ang < (80 * Math.PI) / 180 && curta >= LONGA && dele.every((t) => !t.uv)) pontas.add(v);
    }
    if (!pontas.size) break;
    for (let i = trisPed.length - 1; i >= 0; i--) if (trisPed[i].q.some((v) => pontas.has(v))) { trisPed.splice(i, 1); pontasSaem++; }
  }
  // (o ponto que ficou sem triângulo deixa de contar, e a numeração dos outros não muda)
}
const contorno = umLaco(beiraDe(trisPed.map((t) => t.q)), 'o contorno do pedaço');
const O = contorno.map((v) => pPed[v]);
const dentroDe = (poli, p) => { let d = false; for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) { const a = poli[i], b = poli[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) d = !d; } return d; };
const cruzam = (a, b, c, d) => { const s = (p, q, r) => area2(p, q, r); return s(a, b, c) * s(a, b, d) < 0 && s(c, d, a) * s(c, d, b) < 0; };
const lim = (l, e, f) => f(...l.map((p) => p[e]));
const LADO = Math.sign(pPed.reduce((s, p) => s + p[0], 0));
if (pPed.some((p) => p[0] * LADO <= 0.05) && ESPELHO) falha('o pedaço cruza o meio: não dá para espelhar');
const zPedMin = lim(pPed, 2, Math.min);

// ---- 2. o que ele cobre, de frente
const vivo = new Uint8Array(nt).fill(1), fora = new Set();
const cobre = (t) => {
  const q = triR(t);
  if (achatado(q)) return false;
  const c = q.map(ptD);
  if ((c[0][2] + c[1][2] + c[2][2]) / 3 < zPedMin - 2.5) return false;   // (a nuca não: ela também está "atrás" dele)
  if (c.some((p) => dentroDe(O, p)) || O.some((p) => { const s = [area2(c[0], c[1], p), area2(c[1], c[2], p), area2(c[2], c[0], p)]; return s.every((x) => x > 0) || s.every((x) => x < 0); })) return true;
  for (let i = 0; i < 3; i++) for (let j = 0; j < O.length; j++) if (cruzam(c[i], c[(i + 1) % 3], O[j], O[(j + 1) % O.length])) return true;
  return false;
};
for (let t = 0; t < nt; t++) if (cobre(t)) fora.add(t);
// (na topologia de agora: os achatados pelos apagados não contam)
const inteiros = [];
for (let t = 0; t < nt; t++) if (!achatado(triR(t))) inteiros.push(t);
const donoDaAresta = new Map();
for (const t of inteiros) { const q = triR(t); for (let k = 0; k < 3; k++) { const a = q[k], b = q[(k + 1) % 3], c = a < b ? `${a}_${b}` : `${b}_${a}`; if (!donoDaAresta.has(c)) donoDaAresta.set(c, []); donoDaAresta.get(c).push(t); } }
const vizinhos = (t) => { const q = triR(t), l = []; for (let k = 0; k < 3; k++) { const a = q[k], b = q[(k + 1) % 3], c = a < b ? `${a}_${b}` : `${b}_${a}`; for (const u of donoDaAresta.get(c)) if (u !== t) l.push(u); } return l; };
// o que ficou preso dentro entra também; do que sai, só o pedaço maior (uma ilha solta nada tem a ver com este buraco)
function componentes(lista) {
  const resto = new Set(lista), out = [];
  while (resto.size) { const s = resto.values().next().value, c = [s]; resto.delete(s); for (let i = 0; i < c.length; i++) for (const u of vizinhos(c[i])) if (resto.has(u)) { resto.delete(u); c.push(u); } out.push(c); }
  return out.sort((a, b) => b.length - a.length);
}
const fechar = () => { const cs = componentes(inteiros.filter((t) => !fora.has(t))); let n = 0; for (const c of cs.slice(1)) for (const t of c) { fora.add(t); n++; } return { n, ilhas: cs.length - 1 }; };
const presos = fechar();
const compFora = componentes([...fora]);
let ilhasFora = 0;
for (const c of compFora.slice(1)) { ilhasFora += c.length; for (const t of c) fora.delete(t); }
// a beira do buraco; se ela se toca num ponto, o leque menor em volta dele sai também
const beiraDoBuraco = () => beiraDe([...fora].map(triR));
let beira = beiraDoBuraco();
for (let volta = 0; volta < 10; volta++) {
  const { tocam } = lacosDe(beira);
  if (!tocam.length) break;
  for (const v of tocam) {
    const em = inteiros.filter((t) => !fora.has(t) && triR(t).includes(v)), cs = componentes(em);
    for (const t of cs.at(-1)) fora.add(t);
  }
  fechar();
  beira = beiraDoBuraco();
}
const laco = umLaco(beira, 'a beira do buraco');
const beiraP = laco.map(ptD);
if (beiraP.some((p) => p[0] * LADO <= 0.05)) falha('o buraco chegou ao meio do corpo');
// (o buraco tem de cercar o contorno)
if (O.some((p) => !dentroDe(beiraP, p))) falha(`o contorno do pedaço sai do buraco em ${O.filter((p) => !dentroDe(beiraP, p)).length} ponto(s): a pele dobra aqui, de frente`);
for (let i = 0; i < beiraP.length; i++) for (let j = i + 2; j < beiraP.length; j++) if ((j + 1) % beiraP.length !== i && cruzam(beiraP[i], beiraP[(i + 1) % beiraP.length], beiraP[j], beiraP[(j + 1) % beiraP.length])) falha('a beira do buraco se cruza, de frente');

// ---- 3. a profundidade: o contorno vai para a frente da pele de agora; o que ele andou em z se espalha para dentro (x e y não mudam)
const zDaBeira = (p) => { let s = 0, w = 0; for (const b of beiraP) { const d = Math.max(0.02, Math.hypot(b[0] - p[0], b[1] - p[1])), k = 1 / d ** 3; s += k * b[2]; w += k; } return s / w; };
function zDaPele(p) {
  let z = -Infinity;
  for (const t of inteiros) {
    const [a, b, c] = triR(t).map(ptD), d = area2(a, b, c);
    if (Math.abs(d) < 1e-9) continue;
    const u = area2(b, c, p) / d, v = area2(c, a, p) / d, w = 1 - u - v;
    if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) { const q = u * a[2] + v * b[2] + w * c[2]; if (q > z && q > zPedMin - 2.5) z = q; }
  }
  return z === -Infinity ? zDaBeira(p) : z;
}
const cx = O.reduce((s, p) => s + p[0], 0) / O.length, cy = O.reduce((s, p) => s + p[1], 0) / O.length;
function resolver(A, b) {
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
const dz = new Float64Array(pPed.length), presoZ = new Uint8Array(pPed.length), vizPed = pPed.map(() => new Set());
for (const t of trisPed) for (let k = 0; k < 3; k++) { vizPed[t.q[k]].add(t.q[(k + 1) % 3]); vizPed[t.q[(k + 1) % 3]].add(t.q[k]); }
for (let v = 0; v < dz.length; v++) if (!vizPed[v].size) presoZ[v] = 1;   // (as pontas aparadas: ninguém usa)
for (const v of contorno) { dz[v] = zDaPele(pPed[v]) + FOLGA - pPed[v][2]; presoZ[v] = 1; }
const mediaDz = contorno.reduce((s, v) => s + dz[v], 0) / contorno.length;
for (let v = 0; v < dz.length; v++) if (!presoZ[v]) dz[v] = mediaDz;
for (let volta = 0; volta < 2000; volta++) for (let v = 0; v < dz.length; v++) { if (presoZ[v]) continue; let s = 0; for (const u of vizPed[v]) s += dz[u]; dz[v] = s / vizPed[v].size; }
const noLugar = pPed.map((p, v) => [p[0], p[1], p[2] + dz[v]]), usados = noLugar.filter((_, v) => vizPed[v].size);

// ---- 4. o vão: as duas beiras presas, sem pontos novos
const nvN = (i) => nv + i;   // (o ponto i do pedaço, no lado de cá)
const PX = (v) => (v < nv ? ptD(v) : noLugar[v - nv]);
const sentido = (l) => l.reduce((s, v, i) => { const a = PX(v), b = PX(l[(i + 1) % l.length]); return s + a[0] * b[1] - b[0] * a[1]; }, 0);
const fora1 = sentido(laco) > 0 ? laco : [...laco].reverse();    // (anti-horário)
const contN = contorno.map(nvN), dentro1 = sentido(contN) < 0 ? contN : [...contN].reverse();   // (horário: a volta de dentro)
function triangularAnel(ext, int) {
  const obj = new Map(), xy = (v) => { if (!obj.has(v)) { const p = PX(v); obj.set(v, { i: v, x: p[0], y: p[1] }); } return obj.get(v); };
  const E = ext.map(xy), N = int.map(xy);
  const ar = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const cz = (a, b, c, d) => { const s = (p, q, r) => ar(p, q, r); return s(a, b, c) * s(a, b, d) < 0 && s(c, d, a) * s(c, d, b) < 0; };
  const pares = [...E.map((p, i) => [p, E[(i + 1) % E.length]]), ...N.map((p, i) => [p, N[(i + 1) % N.length]])];
  let ponte = null, d = Infinity;
  for (let k = 0; k < E.length; k++) for (let j = 0; j < N.length; j++) {
    const q = Math.hypot(E[k].x - N[j].x, E[k].y - N[j].y);
    if (q < d && !pares.some(([u, w]) => u !== E[k] && w !== E[k] && u !== N[j] && w !== N[j] && cz(E[k], N[j], u, w))) { d = q; ponte = [k, j]; }
  }
  if (!ponte) falha('não achei por onde ligar as duas beiras');
  const [k, j] = ponte, resto = [...E.slice(k), ...E.slice(0, k), E[k], ...N.slice(j), ...N.slice(0, j), N[j]];
  const dentro = (p, a, b, c) => ar(a, b, p) >= -1e-9 && ar(b, c, p) >= -1e-9 && ar(c, a, p) >= -1e-9;
  const T = [];
  while (resto.length > 3) {
    let m = -1;
    for (let i = 0; i < resto.length && m < 0; i++) {
      const a = resto[(i + resto.length - 1) % resto.length], b = resto[i], c = resto[(i + 1) % resto.length];
      if (ar(a, b, c) > 1e-6 && !resto.some((p) => p !== a && p !== b && p !== c && dentro(p, a, b, c))) m = i;
    }
    if (m < 0) falha('o vão entre as beiras não se triangula');
    T.push([resto[(m + resto.length - 1) % resto.length], resto[m], resto[(m + 1) % resto.length]]);
    resto.splice(m, 1);
  }
  if (ar(resto[0], resto[1], resto[2]) > 1e-9) T.push(resto);
  const presa = new Set(pares.map(([a, b]) => (a.i < b.i ? `${a.i}_${b.i}` : `${b.i}_${a.i}`)));
  const noCirculo = (a, b, c, e) => { const ax = a.x - e.x, ay = a.y - e.y, bx = b.x - e.x, by = b.y - e.y, cx2 = c.x - e.x, cy2 = c.y - e.y; return (ax * ax + ay * ay) * (bx * cy2 - cx2 * by) - (bx * bx + by * by) * (ax * cy2 - cx2 * ay) + (cx2 * cx2 + cy2 * cy2) * (ax * by - bx * ay) > 1e-9; };
  for (let mudou = true, voltas = 0; mudou && voltas < 400; voltas++) {
    mudou = false;
    for (let i = 0; i < T.length && !mudou; i++) for (let e = 0; e < 3 && !mudou; e++) {
      const a = T[i][e], b = T[i][(e + 1) % 3], c = T[i][(e + 2) % 3];
      if (presa.has(a.i < b.i ? `${a.i}_${b.i}` : `${b.i}_${a.i}`)) continue;
      for (let g = 0; g < T.length && !mudou; g++) {
        if (g === i) continue;
        for (let f = 0; f < 3 && !mudou; f++) {
          if (T[g][f] !== b || T[g][(f + 1) % 3] !== a) continue;
          const o = T[g][(f + 2) % 3];
          if (noCirculo(a, b, c, o) && ar(c, a, o) > 1e-6 && ar(c, o, b) > 1e-6) { T[i] = [c, a, o]; T[g] = [c, o, b]; mudou = true; }
        }
      }
    }
  }
  return T.map((t) => t.map((p) => p.i));
}
const anel = triangularAnel(fora1, dentro1);

// ---- 5. o outro lado: cada ponto do lado de lá, pelo espelho do modelo
const novosP = noLugar.map((p) => [...p]);
const espelhoV = (v) => { const p = pt(v), q = pontoEm([-p[0], p[1], p[2]]); if (q < 0) falha(`ponto sem par do outro lado: ${p}`); return q; };
const ladoLa = new Map();
const espelhar = (v) => {
  if (v >= nv) { if (!ladoLa.has(v)) { const p = noLugar[v - nv]; novosP.push([-p[0], p[1], p[2]]); ladoLa.set(v, nv + novosP.length - 1); } return ladoLa.get(v); }
  return espelhoV(v);
};
const trisPedN = trisPed.map((t) => ({ q: t.q.map(nvN), uv: t.uv, tom: t.tom }));
let trisPedE = [], anelE = [];
if (ESPELHO) {
  trisPedE = trisPedN.map((t) => ({ q: [espelhar(t.q[0]), espelhar(t.q[2]), espelhar(t.q[1])], uv: t.uv, tom: t.tom }));
  anelE = anel.map(([a, b, c]) => [espelhar(a), espelhar(c), espelhar(b)]);
  const porChave = new Map();
  for (const t of inteiros) porChave.set([...triR(t)].sort((a, b) => a - b).join(), t);
  const doOutro = [];
  for (const t of fora) { const q = triR(t).map(espelhoV).map((v) => R[v]), u = porChave.get([...q].sort((a, b) => a - b).join()); if (u === undefined) falha(`a malha não é simétrica aqui: o triângulo ${triR(t).map((v) => pt(v).map((x) => x.toFixed(2))).join(' | ')} não tem par`); doOutro.push(u); }
  for (const u of doOutro) fora.add(u);
}

// ---- o que sai: os triângulos, e os apagados que encostam no buraco viram malha (a beira e o de dentro têm de ser um vértice só)
const noBuraco = new Set();
for (const t of fora) for (const v of triR(t)) noBuraco.add(v);
const assado = new Map();
for (const [u] of deApagado) if (R[u] !== u && noBuraco.has(R[u])) assado.set(u, R[u]);
const finalDe = (v) => assado.get(v) ?? v;
for (const t of fora) vivo[t] = 0;
const finais = [];
let achatadosSaem = 0;
for (let t = 0; t < nt; t++) {
  if (!vivo[t]) continue;
  const q = [finalDe(I[t * 3]), finalDe(I[t * 3 + 1]), finalDe(I[t * 3 + 2])];
  if (achatado(q)) { achatadosSaem++; vivo[t] = 0; continue; }
  finais.push(q);
}
const nKept = finais.length;
const novosTris = [...trisPedN.map((t) => t.q), ...trisPedE.map((t) => t.q)], corDos = [...trisPedN, ...trisPedE];
finais.push(...novosTris, ...anel, ...anelE);
const iPed = nKept;

// ---- a conferência
const contar = (l) => { const c = new Map(), d = new Map(); for (const q of l) for (let k = 0; k < 3; k++) { const a = q[k], b = q[(k + 1) % 3], e = a < b ? `${a}_${b}` : `${b}_${a}`; c.set(e, (c.get(e) ?? 0) + 1); d.set(`${a}_${b}`, (d.get(`${a}_${b}`) ?? 0) + 1); } return { abertas: [...c.values()].filter((n) => n === 1).length, demais: [...c.values()].filter((n) => n > 2).length, contramao: [...d.values()].filter((n) => n > 1).length }; };
const antes = contar(Array.from({ length: nt }, (_, t) => [I[t * 3], I[t * 3 + 1], I[t * 3 + 2]])), depois = contar(finais);
const PF = (v) => (v < nv ? ptD(R[v]) : novosP[v - nv]);
const qual = (q) => { const [a, b, c] = q.map(PF), l = Math.max(dist(a, b), dist(b, c), dist(c, a)), u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]]; return { q: Math.hypot(...n) / (l * l), nz: n[2] / (Math.hypot(...n) || 1), l }; };
const qa = anel.map(qual);
console.log(`[corpo] ${cfg.nome}: ${nt} triângulos, ${nv} pontos; o pedaço ${ID}: ${colados.length} triângulo(s) (furinhos preenchidos: ${preenchidos} triângulo(s); das pontas aparadas: ${pontasSaem}; ficam ${trisPed.length}), ${pPed.length} pontos, contorno de ${contorno.length}${ESPELHO ? ', com espelho' : ''}`);
console.log(`[corpo] x ${lim(usados, 0, Math.min).toFixed(2)}…${lim(usados, 0, Math.max).toFixed(2)}, y ${lim(usados, 1, Math.min).toFixed(2)}…${lim(usados, 1, Math.max).toFixed(2)}; o z andou de ${Math.min(...dz).toFixed(2)} a ${Math.max(...dz).toFixed(2)} cm (no miolo, de ${Math.min(...[...dz].filter((_, v) => !presoZ[v])).toFixed(2)} a ${Math.max(...[...dz].filter((_, v) => !presoZ[v])).toFixed(2)})`);
console.log(`[corpo] a pele que sai: ${fora.size} triângulo(s) (${ESPELHO ? 'nos dois lados; ' : ''}${presos.n} presos dentro${ilhasFora ? `, ${ilhasFora} em ilha ficam` : ''}); achatados pelos apagados que saem: ${achatadosSaem}; apagados que viram malha: ${assado.size}; a beira do buraco tem ${laco.length} pontos`);
console.log(`[corpo] o vão: ${anel.length} triângulo(s) por lado; pior qualidade ${Math.min(...qa.map((x) => x.q)).toFixed(3)}, maior aresta ${Math.max(...qa.map((x) => x.l)).toFixed(2)} cm, de costas: ${qa.filter((x) => x.nz <= 0).length}; corpo: ${nt} → ${finais.length}; arestas abertas ${antes.abertas} → ${depois.abertas}, com mais de dois ${antes.demais} → ${depois.demais}, na contramão ${antes.contramao} → ${depois.contramao}`);
if (args.includes('--ver')) {
  const xy = (q, f) => q.flatMap((v) => { const p = f(v); return [p[0], p[1]]; });
  const perto = (q) => { const p = q.map(PF); return Math.abs(p[0][0] - cx) < 5 && Math.abs(p[0][1] - cy) < 4; };
  const peleV = [], foraV = [];
  for (let t = 0; t < nt; t++) { const q = triR(t); if (achatado(q)) continue; const c = q.map(ptD); if (c[0][0] * LADO <= 0 || Math.abs(c[0][0] - cx) > 5 || Math.abs(c[0][1] - cy) > 4 || c[0][2] < zPedMin - 2.5) continue; (fora.has(t) ? foraV : peleV).push(xy(q, ptD)); }
  // (o diagrama de frente — pele, fora, ped, anel, pts, cont — e a malha inteira como vai aparecer: V, F e os triângulos do pedaço, de iPed até fimPed)
  const V = [];
  for (let v = 0; v < nv + novosP.length; v++) V.push(...PF(v).map((x) => Math.round(x * 1000) / 1000));
  fs.writeFileSync(opt('ver'), JSON.stringify({ caixa: [cx - 3.2, cy - 2.2, cx + 3.2, cy + 2.2], pele: peleV, fora: foraV, ped: trisPedN.map((t) => xy(t.q, PF)), anel: anel.filter(perto).map((q) => xy(q, PF)), pts: fora1.map(PX), cont: dentro1.map(PX), V, F: finais.flat(), iPed, fimPed: iPed + corDos.length, cores: corDos.map((c) => (c.uv ? [c.uv, c.tom ?? null] : null)) }));
}
if (depois.demais > antes.demais || depois.contramao > antes.contramao || depois.abertas > antes.abertas) falha('a malha não fechou: nada gravado');
if (qa.some((x) => x.nz <= 0)) falha('um triângulo do vão ficou de costas: nada gravado');
if (!GRAVAR) process.exit(0);

// ---- o mapa entre o corpo (cm, pose T) e o arquivo, em volta do pedaço (a cabeça gira um pouco entre os dois: afim, por mínimos quadrados)
const y0 = lim(usados, 1, Math.min) - 4, y1 = lim(usados, 1, Math.max) + 4, naVolta = [];
for (let v = 0; v < nv; v++) if (P[v * 3 + 1] > y0 && P[v * 3 + 1] < y1 && P[v * 3 + 2] > 3) naVolta.push(v);
const mapa = [0, 1, 2].map((e) => {
  const A = Array.from({ length: 4 }, () => new Array(4).fill(0)), b = new Array(4).fill(0);
  for (const v of naVolta) { const q = [fonte.pos[v * 3], fonte.pos[v * 3 + 1], fonte.pos[v * 3 + 2], 1]; for (let i = 0; i < 4; i++) { b[i] += q[i] * P[v * 3 + e]; for (let j = 0; j < 4; j++) A[i][j] += q[i] * q[j]; } }
  return resolver(A, b);
});
const paraCorpo = (q) => mapa.map((l) => l[0] * q[0] + l[1] * q[1] + l[2] * q[2] + l[3]);
const erroMapa = Math.max(...naVolta.map((v) => dist(paraCorpo([fonte.pos[v * 3], fonte.pos[v * 3 + 1], fonte.pos[v * 3 + 2]]), pt(v))));
if (erroMapa > 0.03) falha(`o mapa entre o arquivo e o corpo não serve aqui (erro ${erroMapa.toFixed(3)} cm)`);
const paraArquivo = (p) => resolver(mapa.map((l) => l.slice(0, 3)), p.map((x, e) => x - mapa[e][3]));

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
  if (v < nv && fonte.uv) { uv[n * 2] = fonte.uv[v * 2]; uv[n * 2 + 1] = fonte.uv[v * 2 + 1]; }
}
// (a normal refeita onde a volta mudou: os novos e quem perdeu ou ganhou triângulo)
const mudou = new Set();
for (let t = 0; t < nt; t++) if (!vivo[t]) for (let k = 0; k < 3; k++) mudou.add(finalDe(I[t * 3 + k]));
for (const q of finais.slice(nKept)) for (const v of q) mudou.add(v);
const soma = new Map();
for (const q of finais) {
  if (!q.some((v) => mudou.has(v))) continue;
  const [a, b, c] = q.map(filePt), u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  for (const v of q) { if (!soma.has(v)) soma.set(v, [0, 0, 0]); const s = soma.get(v); s[0] += n[0]; s[1] += n[1]; s[2] += n[2]; }
}
for (const v of mudou) { const n = novoDe[v], s = soma.get(v); if (n < 0 || !s) continue; const l = Math.hypot(...s) || 1; for (let e = 0; e < 3; e++) normal[n * 3 + e] = s[e] / l; }
const idx = finais.flat().map((v) => novoDe[v]);
const vaoSomem = (v) => v < nv && novoDe[v] < 0;

if (fs.readFileSync(ARQ_MOD, 'utf8') !== textoMod) falha('o modelagem.json mudou no disco enquanto eu trabalhava: nada gravado; rode de novo');
let copia = arq('-edicoes-antes-colagem.json');
for (let n = 2; fs.existsSync(copia); n++) copia = arq(`-edicoes-antes-colagem-${n}.json`);
fs.writeFileSync(copia, JSON.stringify({ _leiame: `As edições de ${CHAVE} antes de fundir o pedaço ${ID} (fundir-colagem.mjs, ${new Date().toISOString().slice(0, 10)}): valem só para a malha de <nome>-simples-antes.json.`, novos: ed.novos ?? [], cores: ed.cores ?? [], movidos: ed.movidos ?? [], apagados: ed.apagados ?? [] }, null, 1) + '\n');
if (fs.existsSync(ANTES)) { let n = 2, velha = arq(`-simples-antes-${n}.json`); while (fs.existsSync(velha)) velha = arq(`-simples-antes-${++n}.json`); fs.renameSync(ANTES, velha); }
fs.renameSync(SIMPLES, ANTES);
fs.writeFileSync(SIMPLES, JSON.stringify({ _leiame: `A malha de ${cfg.entrada} com pedaços colados fundidos (fundir-colagem.mjs): pos/normal (pose A, unidades do arquivo), uv, idx. O importar.mjs a usa no lugar da do .glb.`, pos, uv, normal, idx }) + '\n');
console.log(`[corpo] gravado: ${path.relative(RAIZ, SIMPLES)} (${nn} pontos, ${idx.length / 3} triângulos); cópia das edições em ${path.relative(RAIZ, copia)}`);
execFileSync(process.execPath, [path.join(AQUI, 'importar.mjs'), recorte], { cwd: RAIZ, stdio: 'inherit' });

// ---- o corpo refeito: a cor do pedaço, pelo meio dos triângulos dele, e o modelagem.json
const N = lerCorpo(cfg.nome);
if (N.I.length !== idx.length) falha('o corpo refeito não bate com a malha nova');
let erroNovo = 0;
for (let v = nv; v < novoDe.length; v++) if (novoDe[v] >= 0) erroNovo = Math.max(erroNovo, dist(pt(novoDe[v], N.P), novosP[v - nv]));
console.log(`[corpo] os pontos novos ficaram até ${erroNovo.toFixed(3)} cm de onde foram desenhados`);
const r3 = (x) => Math.round(x * 1000) / 1000;
const cores = corDos.flatMap((t, k) => {
  if (!t.uv) return [];
  const o = iPed + k, em = [0, 1, 2].map((e) => r3((N.P[N.I[o * 3] * 3 + e] + N.P[N.I[o * 3 + 1] * 3 + e] + N.P[N.I[o * 3 + 2] * 3 + e]) / 3));
  return [{ de: 'corpo', em, uv: t.uv, ...(t.tom ? { tom: t.tom } : {}) }];
});
const sumiu = (em) => { const v = pontoEm(em); return v >= 0 && vaoSomem(v); };
const meiosFora = [...fora].map((t) => [0, 1, 2].map((e) => (P[I[t * 3] * 3 + e] + P[I[t * 3 + 1] * 3 + e] + P[I[t * 3 + 2] * 3 + e]) / 3));
const corDoQueSaiu = (c) => meiosFora.some((m) => Math.abs(m[0] - c.em[0]) < 0.02 && Math.abs(m[1] - c.em[1]) < 0.02 && Math.abs(m[2] - c.em[2]) < 0.02);
const cantoDoPedaco = (em) => colados.some((n) => n.cantos.some((c) => dist(c.em, em) < NO_PONTO || dist([-c.em[0], c.em[1], c.em[2]], em) < NO_PONTO));
const novoEd = {};
for (const [k, val] of Object.entries(ed)) {
  if (k === 'novos') { const resto = val.filter((n) => n.colagem !== ID); if (resto.length) novoEd.novos = resto; novoEd.cores = [...(ed.cores ?? []).filter((c) => !corDoQueSaiu(c)), ...cores]; continue; }
  if (k === 'cores') continue;
  if (k === 'movidos') { novoEd.movidos = val.filter((m) => !cantoDoPedaco(m.em) && !sumiu(m.em) && !(m.espelho && sumiu([-m.em[0], m.em[1], m.em[2]]))); continue; }
  if (k === 'apagados') { novoEd.apagados = val.filter((x) => !sumiu(x.em) && !assado.has(pontoEm(x.em))); continue; }
  novoEd[k] = val;
}
const fecha = (t, i) => { const a = t[i], b = a === '{' ? '}' : ']'; let d = 0, s = false; for (let k = i; k < t.length; k++) { const c = t[k]; if (s) { if (c === '\\') k++; else if (c === '"') s = false; continue; } if (c === '"') s = true; else if (c === a) d++; else if (c === b && --d === 0) return k; } return falha('modelagem.json torto'); };
const iniCorpo = textoMod.indexOf(`"${CHAVE}": {`), abre = textoMod.indexOf('{', iniCorpo), fimCorpo = fecha(textoMod, abre);
const bloco = `{\n${Object.entries(novoEd).map(([k, v]) => `      ${JSON.stringify(k)}: ${Array.isArray(v) && v.length ? `[\n${v.map((x) => `        ${JSON.stringify(x)}`).join(',\n')}\n      ]` : JSON.stringify(v)}`).join(',\n')}\n    }`;
const textoNovo = textoMod.slice(0, abre) + bloco + textoMod.slice(fimCorpo + 1);
JSON.parse(textoNovo);
if (fs.readFileSync(ARQ_MOD, 'utf8') !== textoMod) falha('o modelagem.json mudou no disco enquanto o corpo era refeito: a malha nova foi gravada, as edições não; rode de novo a partir de <nome>-simples-antes.json');
fs.writeFileSync(ARQ_MOD, textoNovo);
console.log(`[corpo] modelagem.json: ${colados.length} criados saíram, ${cores.length} cores entraram, ${(ed.cores ?? []).filter(corDoQueSaiu).length} saíram; movidos ${(ed.movidos ?? []).length} → ${novoEd.movidos?.length ?? 0}; apagados ${(ed.apagados ?? []).length} → ${novoEd.apagados?.length ?? 0}`);
