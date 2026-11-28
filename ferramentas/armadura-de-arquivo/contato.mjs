// O CONTATO ENTRE A ARMADURA DE ARQUIVO E O CORPO, numa pose (28/11/2026; o dono: "preciso que tu consiga ler quais malhas de diferentes
// origens estão se encostando… eu abaixei os braços do personagem 81° pra ligar direitinho no peitoral, nas mangas… algumas partes dele
// encostando na malha do personagem, e outras partes que foram removidas que talvez nem precisassem ser removidas").
//
// node ferramentas/armadura-de-arquivo/contato.mjs <config.json> [--bracos 81] [--frente 0] [--cotovelos 0] [--perto 0.3]
//                                               [--edicoes humano:arquivo7] [--saida <contato.json>] [--foto <prancha.png>]
//
// O corpo é o do JOGO: o arquivo (assets/corpos/<corpo>.json, com as juntas do esqueletos.json) e as EDIÇÕES dele no assets/modelagem.json
// (cortes, vértices apagados e movidos, partes, criados), pelo mesmo modelagem.js do jogo — mas com TODA a pele (nada do `esconde`), para
// saber o que cada triângulo faria de volta. A armadura é a gravada (assets/armaduras-de-arquivo/<id>.json). Os dois vão à pose como na
// aba Armaduras do editor (`matrizesDaPose`: os braços giram no ombro — abaixar, depois para a frente —, o antebraço no cotovelo), pelos
// pesos de cada um. Depois, triângulo a triângulo:
//   CRUZA   = um triângulo do corpo e um da armadura se atravessam;
//   ENCOSTA = não se atravessam, mas ficam a menos de `perto` cm;
//   DEBAIXO = (só o corpo) o raio que sai dele para fora bate na peça a até `alcance` cm (o do config) — tapado, sem encostar;
//   FORA    = nada disso: à mostra.
// E cruza com o `esconde` de agora: o escondido que cruza ou encosta, o escondido que podia voltar (debaixo) e o escondido à mostra (fora).
// A `--saida` grava tudo (os números do `esconde`, os da armadura, os criados pelo meio no modelo); a `--foto`, duas pranchas.
globalThis.document ??= { createElement: () => ({ getContext: () => null, style: {} }), documentElement: { classList: { contains: () => false } }, addEventListener() {} };
globalThis.window ??= globalThis; globalThis.innerWidth ??= 1000; globalThis.innerHeight ??= 800; globalThis.addEventListener ??= () => {};
globalThis.localStorage ??= { getItem: () => null, setItem() {} };
import fs from 'fs';
import path from 'path';
import * as THREE from 'three';
import { prancha } from '../corpo-de-arquivo/foto.mjs';
import { lerCorpo, raio, pt, sub, cross, dot, norm } from './pele.mjs';
await import('../../js/guerreiro.js');   // (antes do modelagem.js: a ordem dos módulos que o jogo usa — sem ela, o import circular quebra)
const { aplicarModelagem, acrescentarTriangulos, ORIGENS } = await import('../../js/modelagem.js');

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '../..');
const args = process.argv.slice(2), opcao = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);
const arqConfig = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
if (!arqConfig) { console.log('uso: node ferramentas/armadura-de-arquivo/contato.mjs <config.json> [--bracos 81] [--frente 0] [--cotovelos 0] [--perto 0.3] [--saida x.json] [--foto x.png]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(arqConfig, 'utf8'));
const pose = { bracos: Number(opcao('--bracos') ?? cfg.bracos ?? 70), frente: Number(opcao('--frente') ?? 0), cotovelos: Number(opcao('--cotovelos') ?? 0) };
const PERTO = Number(opcao('--perto') ?? 0.3), ALCANCE = cfg.esconder?.alcance ?? 8;
// (a chave das edições do corpo no modelagem.json: o masculino jovem é humano:arquivo7, a Modelo 4 lisa humano:arquivo3)
const EDICOES = { masculino3: 'humano:arquivo7', 'feminino4-lisa': 'humano:arquivo3', masculino1: 'humano:arquivo5' };
const chaveDasEdicoes = opcao('--edicoes') ?? EDICOES[cfg.corpo] ?? null;

// ------------------------------------------------------------------ o CORPO do jogo, com toda a pele
const corpo = lerCorpo(cfg.corpo), nT = corpo.I.length / 3;
const nv = corpo.I.length, P0 = new Float32Array(nv * 3), SI = new Uint16Array(nv * 4), SW = new Float32Array(nv * 4);
for (let i = 0; i < nv; i++) {
  const v = corpo.I[i];
  P0.set(corpo.P.subarray(v * 3, v * 3 + 3), i * 3);
  for (let k = 0; k < 4; k++) { SI[i * 4 + k] = corpo.ossoDe[v * 4 + k]; SW[i * 4 + k] = corpo.peso[v * 4 + k] / 255; }
}
let geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(P0.slice(), 3));
geo.setAttribute('skinIndex', new THREE.BufferAttribute(SI, 4));
geo.setAttribute('skinWeight', new THREE.BufferAttribute(SW, 4));
const ctx = { ordem: corpo.nomes, origem: new Uint8Array(nv).fill(ORIGENS.indexOf('corpo')), antes: P0.slice(), base: P0.slice(), sobOBusto: null, rosto: [],
  juntas: new Map(Object.entries(corpo.ossos).map(([n, v]) => [n, new THREE.Vector3(...v)])), faixaDoArquivo: [0, nT] };
let edicoes = null;
if (chaveDasEdicoes) {
  const m = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/modelagem.json'), 'utf8'));
  edicoes = (m.corpos ?? m)[chaveDasEdicoes] ?? null;
}
if (edicoes) { aplicarModelagem(geo, edicoes, ctx); geo = acrescentarTriangulos(geo, ctx); }
const B = geo.attributes.position.array, BS = geo.attributes.skinIndex.array, BW = geo.attributes.skinWeight.array, nB = B.length / 9;
const criado = (t) => t >= nT;   // (os triângulos criados na aba Modelo entram no fim)

// ------------------------------------------------------------------ a ARMADURA gravada
const de64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.length)); };
const arm = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/armaduras-de-arquivo', `${cfg.id}.json`), 'utf8'));
const AP = de64(arm.pos, Float32Array), AI = de64(arm.idx32, Uint32Array), AO = de64(arm.ossoDe, Uint8Array), AW = de64(arm.peso, Uint8Array), AC = de64(arm.cor, Uint8Array);
const esconde = new Set(arm.esconde32 ? de64(arm.esconde32, Uint32Array) : []);
const doArm = arm.nomes.map((n) => corpo.nomes.indexOf(n)), nA = AI.length / 3;

// ------------------------------------------------------------------ a POSE (como a aba Armaduras: `matrizesDaPose`)
const rad = Math.PI / 180, J = (n) => new THREE.Vector3(...corpo.ossos[n]);
const giroEm = (c, e) => new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeRotationFromEuler(e)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
const mats = corpo.nomes.map(() => new THREE.Matrix4());
for (const L of ['L', 'R']) {
  const s = Math.sign(corpo.ossos[`Arm${L}`][0]) || 1;
  const mBraco = giroEm(J(`Arm${L}`), new THREE.Euler(0, -pose.frente * rad * s, -pose.bracos * rad * s, 'YZX'));
  const mAnte = mBraco.clone().multiply(giroEm(J(`Elbow${L}`), new THREE.Euler(0, -pose.cotovelos * rad * s, 0)));
  mats[corpo.nomes.indexOf(`Arm${L}`)] = mBraco;
  for (const n of [`Elbow${L}`, `Hand${L}`]) mats[corpo.nomes.indexOf(n)] = mAnte;
}
function posar(P, ossos, pesos, osso = (i) => i) {
  const out = new Float32Array(P.length), v = new THREE.Vector3(), q = new THREE.Vector3(), soma = new THREE.Vector3();
  for (let i = 0; i < P.length / 3; i++) {
    v.fromArray(P, i * 3); soma.set(0, 0, 0);
    let wt = 0;
    for (let k = 0; k < 4; k++) { const w = pesos(i, k), o = osso(ossos[i * 4 + k]); if (!(w > 0) || o < 0) continue; soma.addScaledVector(q.copy(v).applyMatrix4(mats[o]), w); wt += w; }
    (wt > 0 ? soma.divideScalar(wt) : v).toArray(out, i * 3);
  }
  return out;
}
const BP = posar(B, BS, (i, k) => BW[i * 4 + k]);
const XP = posar(AP, AO, (i, k) => AW[i * 4 + k] / 255, (o) => doArm[o]);

// ------------------------------------------------------------------ a geometria do contato
const triB = (t) => [[BP[t * 9], BP[t * 9 + 1], BP[t * 9 + 2]], [BP[t * 9 + 3], BP[t * 9 + 4], BP[t * 9 + 5]], [BP[t * 9 + 6], BP[t * 9 + 7], BP[t * 9 + 8]]];
const triA = (t) => [pt(XP, AI[t * 3]), pt(XP, AI[t * 3 + 1]), pt(XP, AI[t * 3 + 2])];
const area = ([a, b, c]) => Math.hypot(...cross(sub(b, a), sub(c, a))) / 2;
// o segmento p→q atravessa o triângulo? (Möller–Trumbore, 0 ≤ t ≤ 1)
function segCruza(p, q, [a, b, c]) {
  const d = sub(q, p), e1 = sub(b, a), e2 = sub(c, a), h = cross(d, e2), det = dot(e1, h);
  if (Math.abs(det) < 1e-12) return false;
  const f = 1 / det, s = sub(p, a), u = f * dot(s, h); if (u < 0 || u > 1) return false;
  const r = cross(s, e1), v = f * dot(d, r); if (v < 0 || u + v > 1) return false;
  const t = f * dot(e2, r); return t >= 0 && t <= 1;
}
const cruzam = (A, Bt) => [0, 1, 2].some((k) => segCruza(A[k], A[(k + 1) % 3], Bt) || segCruza(Bt[k], Bt[(k + 1) % 3], A));
// a distância de p ao triângulo (Ericson 5.1.5)
function aoTri(p, [a, b, c]) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap), D = (x) => Math.hypot(...sub(p, x));
  if (d1 <= 0 && d2 <= 0) return D(a);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return D(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return D([a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return D(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return D([a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return D([b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]); }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return D([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}
// a distância entre dois segmentos (Ericson 5.1.9)
function segSeg(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2), a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s = 0, t = 0;
  if (a < 1e-12 && e < 1e-12) return Math.hypot(...r);
  if (a < 1e-12) t = Math.min(1, Math.max(0, f / e));
  else {
    const c = dot(d1, r);
    if (e < 1e-12) s = Math.min(1, Math.max(0, -c / a));
    else { const b = dot(d1, d2), den = a * e - b * b; s = den > 1e-12 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0; t = (b * s + f) / e; if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); } }
  }
  return Math.hypot(...sub([p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s], [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t]));
}
function distTri(A, Bt) {
  let m = Infinity;
  for (let k = 0; k < 3; k++) { m = Math.min(m, aoTri(A[k], Bt), aoTri(Bt[k], A)); for (let j = 0; j < 3; j++) m = Math.min(m, segSeg(A[k], A[(k + 1) % 3], Bt[j], Bt[(j + 1) % 3])); }
  return m;
}

// ------------------------------------------------------------------ a grade da armadura (caixas de 3 cm) e o teste par a par
const LADO = 3, grade = new Map(), casa = (x, y, z) => `${x},${y},${z}`;
const caixa = (T, folga = 0) => [0, 1, 2].map((k) => [Math.floor((Math.min(T[0][k], T[1][k], T[2][k]) - folga) / LADO), Math.floor((Math.max(T[0][k], T[1][k], T[2][k]) + folga) / LADO)]);
const AT = Array.from({ length: nA }, (_, t) => triA(t));
AT.forEach((T, t) => { if (area(T) < 1e-8) return; const [[x0, x1], [y0, y1], [z0, z1]] = caixa(T); for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const k = casa(x, y, z); if (!grade.has(k)) grade.set(k, []); grade.get(k).push(t); } });
const estadoB = new Array(nB).fill(null), estadoA = new Array(nA).fill(null), BT = Array.from({ length: nB }, (_, t) => triB(t));
for (let t = 0; t < nB; t++) {
  const T = BT[t];
  if (area(T) < 1e-8) { estadoB[t] = 'some'; continue; }   // (cortado ou apagado nas edições: não existe no jogo)
  const vistos = new Set(), [[x0, x1], [y0, y1], [z0, z1]] = caixa(T, PERTO);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (const a of grade.get(casa(x, y, z)) ?? []) {
    if (vistos.has(a)) continue;
    vistos.add(a);
    if (cruzam(T, AT[a])) { estadoB[t] = 'cruza'; estadoA[a] = 'cruza'; }
    else if (distTri(T, AT[a]) < PERTO) { estadoB[t] ??= 'encosta'; estadoA[a] ??= 'encosta'; }
  }
}
// DEBAIXO: o raio de fora (a normal do jogo, (c − b) × (a − b)) bate na peça a até ALCANCE cm
for (let t = 0; t < nB; t++) {
  if (estadoB[t]) continue;
  const [a, b, c] = BT[t], o = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3], n = norm(cross(sub(c, b), sub(a, b)));
  estadoB[t] = raio([o[0] + n[0] * 0.05, o[1] + n[1] * 0.05, o[2] + n[2] * 0.05], n, XP, AI) <= ALCANCE ? 'debaixo' : 'fora';
}

// ------------------------------------------------------------------ o relatório
// o lugar: o osso que mais pesa no triângulo
const GRUPO = (n) => (/^Collar/.test(n) ? 'ombro' : /^Arm/.test(n) ? 'braço' : /^(Elbow|Hand)/.test(n) ? 'antebraço' : /^(Neck|Head)$/.test(n) ? 'pescoço/cabeça' : /^(Thigh|Shin|Foot|Toe)/i.test(n) ? 'pernas' : 'tronco');
function lugarDe(ossos, pesos, vs, osso = (i) => i) {
  const s = new Map();
  for (const v of vs) for (let k = 0; k < 4; k++) { const w = pesos(v, k), o = osso(ossos[v * 4 + k]); if (w > 0 && o >= 0) s.set(o, (s.get(o) ?? 0) + w); }
  const o = [...s.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return o == null ? '?' : GRUPO(corpo.nomes[o]);
}
const lugarB = (t) => lugarDe(BS, (i, k) => BW[i * 4 + k], [t * 3, t * 3 + 1, t * 3 + 2]);
const lugarA = (t) => lugarDe(AO, (i, k) => AW[i * 4 + k] / 255, [AI[t * 3], AI[t * 3 + 1], AI[t * 3 + 2]], (o) => doArm[o]) === 'tronco' ? 'tronco da peça' : 'manga';
const contar = (l, de) => { const m = {}; for (const t of l) { const k = de(t); m[k] = (m[k] ?? 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(', ') || '—'; };
const tB = (e, filtro = () => true) => [...Array(nB).keys()].filter((t) => estadoB[t] === e && filtro(t));
const escondido = (t) => !criado(t) && esconde.has(t), aMostra = (t) => !criado(t) && !esconde.has(t);
const mais = new Set(cfg.esconder?.mais ?? []);
const r = {
  pose, perto: PERTO, alcance: ALCANCE, edicoes: edicoes ? chaveDasEdicoes : null,
  corpo: { triangulos: nT, criados: nB - nT, somem_nas_edicoes: tB('some').length },
  cruza: { corpo: tB('cruza', (t) => !criado(t)), criados: tB('cruza', criado), armadura: [...Array(nA).keys()].filter((t) => estadoA[t] === 'cruza') },
  encosta: { corpo: tB('encosta', (t) => !criado(t)), criados: tB('encosta', criado), armadura: [...Array(nA).keys()].filter((t) => estadoA[t] === 'encosta') },
  escondidos: { total: esconde.size, cruzam_ou_encostam: [...tB('cruza', escondido), ...tB('encosta', escondido)].sort((a, b) => a - b), debaixo: tB('debaixo', escondido), fora: tB('fora', escondido) },
  a_mostra_que_cruzam_ou_encostam: [...tB('cruza', aMostra), ...tB('encosta', aMostra)].sort((a, b) => a - b),
};
const meio = (t) => [0, 1, 2].map((k) => Math.round(((ctx.antes[t * 9 + k] + ctx.antes[t * 9 + 3 + k] + ctx.antes[t * 9 + 6 + k]) / 3) * 1000) / 1000);
r.cruza.criados = r.cruza.criados.map(meio); r.encosta.criados = r.encosta.criados.map(meio);
console.log(`pose: braços ${pose.bracos}° abaixo${pose.frente ? `, ${pose.frente}° para a frente` : ''}${pose.cotovelos ? `, cotovelos ${pose.cotovelos}°` : ''} · "encosta" = a menos de ${PERTO} cm · edições: ${r.edicoes ?? 'nenhuma'}`);
console.log(`corpo: ${nT} triângulos do arquivo (${r.corpo.somem_nas_edicoes} cortados/apagados nas edições) + ${r.corpo.criados} criados; armadura: ${nA}`);
console.log(`CRUZAM   — corpo ${r.cruza.corpo.length} (${contar(r.cruza.corpo, lugarB)}) + ${r.cruza.criados.length} criados · armadura ${r.cruza.armadura.length} (${contar(r.cruza.armadura, lugarA)})`);
console.log(`ENCOSTAM — corpo ${r.encosta.corpo.length} (${contar(r.encosta.corpo, lugarB)}) + ${r.encosta.criados.length} criados · armadura ${r.encosta.armadura.length} (${contar(r.encosta.armadura, lugarA)})`);
const E = r.escondidos;
console.log(`os ${E.total} ESCONDIDOS de agora: ${E.cruzam_ou_encostam.length} cruzam/encostam (${contar(E.cruzam_ou_encostam, lugarB)}) · ${E.debaixo.length} debaixo da peça sem encostar (${contar(E.debaixo, lugarB)}) · ${E.fora.length} à mostra nesta pose (${contar(E.fora, lugarB)})`);
console.log(`  (dos ${mais.size} que o dono marcou: ${E.cruzam_ou_encostam.filter((t) => mais.has(t)).length} cruzam/encostam, ${E.debaixo.filter((t) => mais.has(t)).length} debaixo, ${E.fora.filter((t) => mais.has(t)).length} à mostra)`);
console.log(`À MOSTRA que cruzam/encostam na peça (furam por ela): ${r.a_mostra_que_cruzam_ou_encostam.length} (${contar(r.a_mostra_que_cruzam_ou_encostam, lugarB)})`);
const saida = opcao('--saida');
if (saida) { fs.mkdirSync(path.dirname(path.resolve(saida)), { recursive: true }); fs.writeFileSync(saida, JSON.stringify({ _leiame: `contato.mjs com ${path.basename(arqConfig)}: corpo = o lugar no arquivo do corpo (o número do esconde); armadura = o triângulo dela; criados = o meio no modelo (cm)`, ...r }, null, 1) + '\n'); console.log(`gravado ${saida}`); }

// ------------------------------------------------------------------ a foto: (1) vestido, o contato aceso; (2) o corpo só, os escondidos por classe
const foto = opcao('--foto');
if (foto) {
  const PELE = [205, 170, 140], COR_B = { cruza: [230, 40, 40], encosta: [250, 150, 40] }, COR_A = { cruza: [220, 40, 220], encosta: [240, 140, 230] };
  const vistas = [0, 40, 90, 180].map((giro) => ({ giro, centro: [0, 128], escala: 3.6 }));
  const vivos = [...Array(nB).keys()].filter((t) => estadoB[t] !== 'some');
  const juntar = (lB, lA, corB, corA) => {
    const pos = new Float32Array((lB.length + lA.length) * 9), cores = [];
    lB.forEach((t, i) => { pos.set(BP.subarray(t * 9, t * 9 + 9), i * 9); cores.push(corB(t)); });
    lA.forEach((t, i) => { AT[t].forEach((p, k) => pos.set(p, (lB.length + i) * 9 + k * 3)); cores.push(corA(t)); });
    return [pos, Uint32Array.from({ length: pos.length / 3 }, (_, i) => i), cores];
  };
  const [p1, i1, c1] = juntar(vivos, [...Array(nA).keys()], (t) => COR_B[estadoB[t]] ?? PELE, (t) => COR_A[estadoA[t]] ?? [AC[t * 3], AC[t * 3 + 1], AC[t * 3 + 2]]);
  prancha(foto, p1, i1, { cores: c1, W: 420, H: 520, vistas });
  // (o corpo só: escondido que cruza/encosta em vermelho, escondido debaixo da peça em verde, escondido à mostra em amarelo)
  const COR_E = { cruza: [230, 40, 40], encosta: [230, 40, 40], debaixo: [60, 190, 90], fora: [240, 220, 40] };
  const [p2, i2, c2] = juntar(vivos, [], (t) => (escondido(t) ? COR_E[estadoB[t]] : PELE), () => PELE);
  const foto2 = foto.replace(/\.png$/, '-escondidos.png');
  prancha(foto2, p2, i2, { cores: c2, W: 420, H: 520, vistas });
  console.log(`fotos: ${foto} (vermelho/laranja = o corpo que cruza/encosta; roxo/rosa = a armadura) e ${foto2} (escondidos: vermelho cruza/encosta, verde debaixo, amarelo à mostra)`);
}
