#!/usr/bin/env node
// A SIMETRIA DO CORPO DE ARQUIVO (02/11/2026; o dono, com o Masculino de dois narizes: "ao espelhar tu não pegou o centro exato, então
// carrega a ferramenta de espelhar, evita espelhar na mão… corrige definindo o centro do rosto e espelhando só ele; o corpo tá certo"):
// prepara a `entrada` do recorte a partir do .glb ORIGINAL do Meshy, pelo bloco `simetria` do recorte:
//
//   node ferramentas/corpo-de-arquivo/simetria.mjs <recorte.json> [--medir] [--malha]     (depois: importar.mjs <recorte.json>)
//   (--malha: em cima da <nome>-simples.json, a malha de agora, e não do .glb original: para o corpo que já tem pedaço colado ou unido)
//
// O Meshy não faz a cabeça em cima do plano do corpo: a do Masculino olha ~6° para o lado (as orelhas centradas, o nariz a ~1 cm do meio).
// Espelhar tudo num plano só copia meio nariz fora do centro — sai com DOIS. Então:
//   1. a FIGURA: o .glb pode trazer várias lado a lado (`figura`, da esquerda para a direita); `girar180` a põe de frente para +z,
//      `altura` a escala (as constantes do importar.mjs são para ~1,90) e `x` é o plano de simetria do CORPO;
//   2. o PLANO DO ROSTO: com `cabeca.medir` (ou --medir), procura o giro, a inclinação e o deslocamento que deixam a superfície da cabeça
//      mais parecida com o próprio espelho (amostras na superfície, mais densas no rosto; os 10% piores — as dobras do queixo — não contam).
//      O que vale é o que está no recorte (`cabeca.giro`, `cabeca.inclina`, em graus, e `cabeca.x`): dá para acertar à mão e rodar de novo;
//   3. a CABEÇA ENDIREITADA: só ela gira e anda; o peso cai a zero no pescoço (de `cabeca.de` a `cabeca.ate`, alturas do arquivo) e nos ombros;
//      abaixo disso NENHUM ponto se mexe;
//   4. o ESPELHO: o do Blender (blender.py `simetrizar`, bmesh symmetrize) no x = 0, o lado `lado` (1 = o +x, o esquerdo DELE) copiado no outro;
//      buracos fechados. Grava a `entrada` do recorte.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const args = process.argv.slice(2), recorte = args.find((a) => !a.startsWith('--')), soMedir = args.includes('--medir');
if (!recorte) { console.error('uso: node simetria.mjs <recorte.json> [--medir]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.resolve(RAIZ, recorte), 'utf8')), S = cfg.simetria;
if (!S?.original) { console.error('[simetria] o recorte não tem o bloco `simetria` com o `original`'); process.exit(1); }

// ------------------------------------------------------------ o .glb
function lerGlb(arq) {
  const b = fs.readFileSync(arq), n = b.readUInt32LE(12), j = JSON.parse(b.toString('utf8', 20, 20 + n)), bin = b.subarray(20 + n + 8);
  const acc = (i) => { const a = j.accessors[i], bv = j.bufferViews[a.bufferView], off = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), C = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType]; return new C(bin.buffer.slice(off, off + a.count * (a.type === 'VEC3' ? 3 : 1) * C.BYTES_PER_ELEMENT)); };
  const p = j.meshes[0].primitives[0];
  return { P: acc(p.attributes.POSITION), I: acc(p.indices) };
}
// as figuras: os pedaços ligados (soldados pelo lugar), da esquerda para a direita
function figuras(P, I) {
  const nv = P.length / 3, pai = Int32Array.from({ length: nv }, (_, i) => i), raiz = (k) => { while (pai[k] !== k) k = pai[k] = pai[pai[k]]; return k; }, lugar = new Map();
  for (let v = 0; v < nv; v++) { const k = `${P[v * 3].toFixed(5)},${P[v * 3 + 1].toFixed(5)},${P[v * 3 + 2].toFixed(5)}`; if (lugar.has(k)) pai[raiz(v)] = raiz(lugar.get(k)); else lugar.set(k, v); }
  const nt = I.length / 3;
  for (let t = 0; t < nt; t++) { pai[raiz(I[t * 3 + 1])] = raiz(I[t * 3]); pai[raiz(I[t * 3 + 2])] = raiz(I[t * 3]); }
  const g = new Map();
  for (let t = 0; t < nt; t++) { const r = raiz(I[t * 3]); (g.get(r) ?? g.set(r, []).get(r)).push(t); }
  return [...g.values()].filter((tris) => tris.length > 100).map((tris) => {
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const t of tris) for (let k = 0; k < 3; k++) for (let e = 0; e < 3; e++) { const c = P[I[t * 3 + k] * 3 + e]; mn[e] = Math.min(mn[e], c); mx[e] = Math.max(mx[e], c); }
    return { tris, mn, mx };
  }).sort((a, b) => a.mn[0] - b.mn[0]);
}
// (--malha, 02/11/2026; o dono, com o Masculino jovem: "aplica a simetria" DEPOIS da união com o busto: a fonte é a `-simples.json` do corpo, e o resultado volta para ela.
// O .glb original não tem o busto: partir dele apagaria o que foi encaixado. Quem roda guarda antes uma cópia da -simples, que o git não tem)
const NA_MALHA = args.includes('--malha'), SIMPLES = path.join(AQUI, `${cfg.nome}-simples.json`);
let pos, idx;
if (NA_MALHA) {
  const s = JSON.parse(fs.readFileSync(SIMPLES, 'utf8'));
  pos = Array.from({ length: s.pos.length / 3 }, (_, v) => [s.pos[v * 3], s.pos[v * 3 + 1], s.pos[v * 3 + 2]]);
  idx = s.idx;
} else {
  const { P: P0, I: I0 } = lerGlb(path.resolve(RAIZ, S.original));
  const fig = figuras(P0, I0)[S.figura ?? 0];
  if (!fig) { console.error('[simetria] essa figura não existe no .glb'); process.exit(1); }
  const usados = [...new Set(fig.tris.flatMap((t) => [I0[t * 3], I0[t * 3 + 1], I0[t * 3 + 2]]))], novo = new Map(usados.map((v, i) => [v, i]));
  const esc = (S.altura ?? 1.9) / (fig.mx[1] - fig.mn[1]), cx = (fig.mn[0] + fig.mx[0]) / 2, cz = (fig.mn[2] + fig.mx[2]) / 2, s180 = S.girar180 ? -1 : 1;
  pos = usados.map((v) => [s180 * (P0[v * 3] - cx) * esc - (S.x ?? 0), (P0[v * 3 + 1] - fig.mn[1]) * esc, s180 * (P0[v * 3 + 2] - cz) * esc]);
  idx = fig.tris.flatMap((t) => [novo.get(I0[t * 3]), novo.get(I0[t * 3 + 1]), novo.get(I0[t * 3 + 2])]);
}

// ------------------------------------------------------------ a cabeça
const C = S.cabeca;
const passo = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const RAD = Math.PI / 180;
// o giro em volta da vertical pelo meio do pescoço e a inclinação em volta da frente, na base do crânio
function endireitar(p, giro, inclina, dx, w, pivo) {
  const a = giro * RAD * w, b = inclina * RAD * w;
  let x = p[0] - pivo[0], y = p[1] - pivo[1], z = p[2] - pivo[2];
  [x, z] = [x * Math.cos(a) + z * Math.sin(a), -x * Math.sin(a) + z * Math.cos(a)];
  [x, y] = [x * Math.cos(b) - y * Math.sin(b), x * Math.sin(b) + y * Math.cos(b)];
  return [x + pivo[0] + dx * w, y + pivo[1], z + pivo[2]];
}
// o peso: 1 na cabeça, caindo a 0 no pescoço; abaixo do queixo, os ombros (longe do eixo) não vão junto
function pesoDaCabeca(p) {
  const r = 1 - passo(0.09, 0.17, Math.abs(p[0]));
  const perto = 1 - (1 - r) * (1 - passo(C.ate - 0.02, C.ate + 0.02, p[1]));
  return passo(C.de, C.ate, p[1]) * perto;
}
if (C && (soMedir || C.medir || C.giro === undefined)) {
  // as amostras na superfície da cabeça (acima do queixo), mais densas no rosto
  const am = [];
  let semente = 12345; const sorte = () => { semente = (semente * 1664525 + 1013904223) >>> 0; return semente / 4294967296; };
  for (let t = 0; t < idx.length; t += 3) {
    const a = pos[idx[t]], b = pos[idx[t + 1]], c = pos[idx[t + 2]], meio = [0, 1, 2].map((e) => (a[e] + b[e] + c[e]) / 3);
    if (meio[1] < C.ate) continue;
    const u = [0, 1, 2].map((e) => b[e] - a[e]), v = [0, 1, 2].map((e) => c[e] - a[e]), area = Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
    const n = area * (meio[2] > 0.03 ? 90000 : 25000);
    for (let k = Math.floor(n) + (sorte() < n % 1 ? 1 : 0); k > 0; k--) { let r1 = sorte(), r2 = sorte(); if (r1 + r2 > 1) { r1 = 1 - r1; r2 = 1 - r2; } am.push([0, 1, 2].map((e) => a[e] + u[e] * r1 + v[e] * r2)); }
  }
  // o eixo: o meio do pescoço (no corte logo abaixo do queixo)
  const noPescoco = pos.filter((p) => Math.abs(p[1] - C.ate) < 0.03 && Math.abs(p[0]) < 0.08);
  const pivo = [0, C.ate, noPescoco.reduce((s, p) => s + p[2], 0) / noPescoco.length];
  const L = 0.012;
  const custo = (g, i, d) => {
    const q = am.map((p) => endireitar(p, g, i, d, 1, pivo)), grade = new Map(), cel = (x) => Math.floor(x / L);
    for (const p of q) { const k = `${cel(-p[0])},${cel(p[1])},${cel(p[2])}`; (grade.get(k) ?? grade.set(k, []).get(k)).push(p); }
    const ds = q.map((p) => { let m = Infinity; const cxx = cel(p[0]), cy = cel(p[1]), cz2 = cel(p[2]); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (const o of grade.get(`${cxx + a},${cy + b},${cz2 + c}`) ?? []) { const dd = (p[0] + o[0]) ** 2 + (p[1] - o[1]) ** 2 + (p[2] - o[2]) ** 2; if (dd < m) m = dd; } return m === Infinity ? L * 2 : Math.sqrt(m); }).sort((x, y) => x - y);
    const fim = Math.floor(ds.length * 0.9); let s = 0; for (let k = 0; k < fim; k++) s += ds[k];
    return s / fim;
  };
  let g = 0, i = 0, d = 0, melhor = custo(0, 0, 0);
  console.log(`[simetria] ${am.length} amostras na cabeça; sem endireitar: ${(melhor * 95.9).toFixed(3)} cm`);
  for (const [pg, pi, pd] of [[2, 1, 0.004], [1, 0.5, 0.002], [0.5, 0.25, 0.001], [0.25, 0.1, 0.0005]]) {
    let mudou = true;
    while (mudou) {
      mudou = false;
      for (const [dg, di, dd] of [[pg, 0, 0], [-pg, 0, 0], [0, pi, 0], [0, -pi, 0], [0, 0, pd], [0, 0, -pd]]) {
        const c = custo(g + dg, i + di, d + dd);
        if (c < melhor - 1e-7) { melhor = c; g += dg; i += di; d += dd; mudou = true; }
      }
    }
  }
  console.log(`[simetria] o plano do rosto: giro ${g.toFixed(2)}°, inclinação ${i.toFixed(2)}°, x ${d.toFixed(4)} (erro ${(melhor * 95.9).toFixed(3)} cm); eixo z ${pivo[2].toFixed(4)}`);
  Object.assign(C, { giro: +g.toFixed(2), inclina: +i.toFixed(2), x: +d.toFixed(4), pivo: pivo.map((x) => +x.toFixed(4)) });
  if (soMedir) process.exit(0);
}
let mexidos = 0;
const final = pos.map((p) => {
  const w = C ? pesoDaCabeca(p) : 0;
  if (w <= 0) return p;
  mexidos++;
  return endireitar(p, C.giro, C.inclina, C.x, w, C.pivo);
});
if (C) console.log(`[simetria] a cabeça endireitada (giro ${C.giro}°, inclinação ${C.inclina}°, x ${C.x}): ${mexidos} de ${pos.length} pontos (nenhum abaixo de y ${C.de})`);

// ------------------------------------------------------------ o espelho do Blender
const TRAB = path.join(os.tmpdir(), `corpo-de-arquivo-${cfg.nome}`);
fs.mkdirSync(TRAB, { recursive: true });
const ent = path.join(TRAB, 'simetria.json');
fs.writeFileSync(ent, JSON.stringify({ pos: final.flat(), idx, lado: S.lado ?? 1 }));
const base = 'C:/Program Files/Blender Foundation', versoes = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'blender.exe'))).sort() : [];
if (!versoes.length) { console.error('[simetria] Blender não encontrado'); process.exit(1); }
const destino = NA_MALHA ? path.join(TRAB, 'simetria.glb') : path.resolve(RAIZ, cfg.entrada);
const saida = execFileSync(path.join(base, versoes.at(-1), 'blender.exe'), ['--background', '--factory-startup', '--python', path.join(AQUI, 'blender.py'), '--', 'simetrizar', ent, destino], { encoding: 'utf8', maxBuffer: 64 << 20 });
for (const l of saida.split('\n')) if (l.startsWith('[corpo]')) console.log(l);
if (NA_MALHA) {
  const b = fs.readFileSync(destino), n = b.readUInt32LE(12), j = JSON.parse(b.toString('utf8', 20, 20 + n)), bin = b.subarray(20 + n + 8);
  const acc = (i) => { const a = j.accessors[i], bv = j.bufferViews[a.bufferView], off = bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), K = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[a.componentType]; return new K(bin.buffer.slice(off, off + a.count * (a.type === 'VEC3' ? 3 : 1) * K.BYTES_PER_ELEMENT)); };
  const p = j.meshes[0].primitives[0], red = (v) => +v.toFixed(6);
  fs.writeFileSync(SIMPLES, JSON.stringify({ _leiame: 'A malha do corpo com a simetria aplicada por cima dela (simetria.mjs --malha), nas unidades do arquivo; o importar.mjs a usa no lugar da do .glb.', pos: Array.from(acc(p.attributes.POSITION), red), normal: Array.from(acc(p.attributes.NORMAL), red), idx: Array.from(acc(p.indices)) }));
  console.log(`[simetria] gravado ${path.basename(SIMPLES)}; agora: node ferramentas/corpo-de-arquivo/importar.mjs ${recorte}`);
} else console.log(`[simetria] gravado ${cfg.entrada}; agora: node ferramentas/corpo-de-arquivo/importar.mjs ${recorte}`);
