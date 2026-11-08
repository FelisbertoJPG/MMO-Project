#!/usr/bin/env node
// A UNIÃO de um pedaço colado com o corpo de arquivo (03/11/2026; o dono, com o busto jovem em cima do corpo jovem: "o que estiver abaixo da linha vermelha OU dentro do
// corpo antigo, não apagar, vai ser um merge entre as duas, da maneira que o preview mostra ficou bom; a peça inteira não pode substituir a anterior"):
//
//   node ferramentas/corpo-de-arquivo/fundir-uniao.mjs <recorte.json> --chave humano:arquivo7 [--colagem <nome>] [--referencia <referencia.json>] [--ver <arquivo>] [--gravar]
//
// Fica o lado de fora das duas malhas: o que se vê no preview. O que está escondido dentro da outra sai, as duas se cortam onde se encontram e viram uma malha só (o
// booleano exato do Blender, blender.py `uniao`; os furinhos do pedaço são fechados antes). A diferença para o fundir-colagem.mjs: lá o pedaço apaga a pele que cobre e
// é ligado à beira. --referencia = o referencia.json do editor: os traços deste corpo, juntos, são a LINHA em volta do pescoço. O pedaço é cortado nela antes da união: abaixo
// dela nada do corpo é apagado (sem isso, a gola e as faixas do busto ficavam por cima do peito).
//
// Sem --gravar só mede. Com --gravar: as edições de antes vão para `<nome>-edicoes-antes-uniao.json`, a nova malha para `<nome>-simples.json`, o corpo é refeito e os pontos
// voltam ao lugar da união (os pesos de braço pequenos os deslocam, como no guardar-forma.mjs); os criados do pedaço saem do modelagem.json. A aba aberta tem de RECARREGAR.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const args = process.argv.slice(2), recorte = args[0];
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i < 0 ? d : args[i + 1]; };
const CHAVE = opt('chave'), GRAVAR = args.includes('--gravar');
const falha = (m) => { console.error(`[corpo] ${m}`); process.exit(1); };
if (!recorte || !CHAVE) falha('uso: fundir-uniao.mjs <recorte.json> --chave humano:arquivo7 [--colagem <nome>] [--ver <arquivo>] [--gravar]');
const cfg = JSON.parse(fs.readFileSync(path.resolve(RAIZ, recorte), 'utf8')), k = cfg.cmPorUnidade;
if (!k) falha('o recorte não tem cmPorUnidade');
const arq = (s) => path.join(AQUI, `${cfg.nome}${s}`), SIMPLES = arq('-simples.json'), ANTES = arq('-simples-antes.json');
const de64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const lerCorpo = (nome) => { const c = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/corpos', `${nome}.json`), 'utf8')); return { P: de64(c.pos, Float32Array), I: de64(c.idx32, Uint32Array) }; };
function lerGlb(a) {
  const b = fs.readFileSync(path.resolve(RAIZ, a)), jl = b.readUInt32LE(12), jg = JSON.parse(b.subarray(20, 20 + jl).toString('utf8')), bin = b.subarray(20 + jl + 8);
  const acc = (i) => { const x = jg.accessors[i], bv = jg.bufferViews[x.bufferView], n = { VEC3: 3, VEC2: 2, SCALAR: 1 }[x.type], C = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array }[x.componentType], off = bin.byteOffset + (bv.byteOffset ?? 0) + (x.byteOffset ?? 0); return new C(bin.buffer.slice(off, off + x.count * n * C.BYTES_PER_ELEMENT)); };
  const prim = jg.meshes[0].primitives[0];
  return { pos: acc(prim.attributes.POSITION), normal: acc(prim.attributes.NORMAL), idx: acc(prim.indices) };
}
const fonte = fs.existsSync(SIMPLES) ? JSON.parse(fs.readFileSync(SIMPLES, 'utf8')) : lerGlb(cfg.entrada);
const { P, I } = lerCorpo(cfg.nome);
if (I.length !== fonte.idx.length || I.some((v, i) => v !== fonte.idx[i])) falha('o corpo não é da malha de agora: rode o importar.mjs antes');
const nv = P.length / 3;

// ---- o pedaço
const ARQ_MOD = path.join(RAIZ, 'assets/modelagem.json'), textoMod = fs.readFileSync(ARQ_MOD, 'utf8'), ed = JSON.parse(textoMod).corpos[CHAVE];
if (!ed) falha(`não há edições de ${CHAVE}`);
if (ed.cortes?.length || ed.vertices?.length || ed.movidos?.length || ed.apagados?.length) falha(`${CHAVE} tem outras edições na malha: a união ainda não as conhece; asse-as antes`);
const nomes = [...new Set((ed.novos ?? []).map((n) => n.colagem).filter(Boolean))], ID = opt('colagem') ?? (nomes.length === 1 ? nomes[0] : null);
if (!ID) falha(nomes.length ? `há mais de um pedaço colado (${nomes.join(', ')}): diga qual com --colagem` : 'não há pedaço colado neste corpo (salve no editor antes)');
const colados = ed.novos.filter((n) => n.colagem === ID);
if (colados.some((n) => n.espelho)) falha('o pedaço tem espelho: esta ferramenta une o que está à vista, sem espelhar');
const pos = [], visto = new Map(), idxPeca = [];
for (const n of colados) for (const c of n.cantos) { const q = c.em.join(); if (!visto.has(q)) { visto.set(q, pos.length / 3); pos.push(...c.em); } idxPeca.push(visto.get(q)); }

// ---- a união
function acharBlender() { const base = 'C:/Program Files/Blender Foundation', l = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'blender.exe'))).sort() : []; if (!l.length) falha('Blender não encontrado'); return path.join(base, l.at(-1), 'blender.exe'); }
const TEMPO = fs.mkdtempSync(path.join(os.tmpdir(), 'uniao-')), ent = path.join(TEMPO, 'ent.json'), sai = path.join(TEMPO, 'sai.json');
// (as peças da colagem: a maior entra na união; as outras, soltas dentro dela — os olhos do busto, que se cruzam com a órbita —, vão inteiras: num booleano, elas
// deixavam centenas de arestas com três faces)
const npt = pos.length / 3, paiP = Int32Array.from({ length: npt }, (_, i) => i), raizP = (x) => { while (paiP[x] !== x) { paiP[x] = paiP[paiP[x]]; x = paiP[x]; } return x; };
for (let i = 0; i < idxPeca.length; i += 3) { paiP[raizP(idxPeca[i])] = raizP(idxPeca[i + 1]); paiP[raizP(idxPeca[i + 2])] = raizP(idxPeca[i + 1]); }
const gruposP = new Map();
for (let i = 0; i < idxPeca.length; i += 3) { const r = raizP(idxPeca[i]); if (!gruposP.has(r)) gruposP.set(r, []); gruposP.get(r).push(idxPeca[i], idxPeca[i + 1], idxPeca[i + 2]); }
const pecasP = [...gruposP.values()].sort((a, b) => b.length - a.length);
console.log(`[corpo] as peças da colagem: ${pecasP.map((l) => l.length / 3).join(', ')} triângulos`);
// o sólido que fica: tudo acima da linha (em volta do pescoço, por ângulo; longe dele, na altura da linha naquele ângulo)
function corteDaLinha() {
  const arq2 = opt('referencia');
  if (!arq2) return null;
  const tr = JSON.parse(fs.readFileSync(arq2, 'utf8')).corpos?.[CHAVE]?.tracos ?? [], anel = tr.flatMap((x) => x.pontos.map((p) => p.p));
  if (anel.length < 12) falha('a referência não tem a linha deste corpo');
  const cx = anel.reduce((s, p) => s + p[0], 0) / anel.length, cz = anel.reduce((s, p) => s + p[2], 0) / anel.length, N = 96;
  const fx = anel.map((p) => ({ a: Math.atan2(p[2] - cz, p[0] - cx), r: Math.hypot(p[0] - cx, p[2] - cz), y: p[1] }));
  // (a volta em N ângulos: a média dos pontos perto de cada um, para o traço à mão não virar serra)
  const volta = Array.from({ length: N }, (_, i) => { const a = -Math.PI + (i / N) * 2 * Math.PI; let s = 0, r = 0, y = 0; for (const q of fx) { let d = Math.abs(q.a - a); d = Math.min(d, 2 * Math.PI - d); const w = Math.exp(-((d / 0.07) ** 2)); s += w; r += w * q.r; y += w * q.y; } return { a, r: r / s, y: y / s }; });
  const ALTO = 300, LONGE = 90, yMeio = volta.reduce((s, q) => s + q.y, 0) / N, p2 = [cx, yMeio, cz, cx, ALTO, cz], id2 = [];
  const anelV = (r, y, a) => [cx + r * Math.cos(a), y, cz + r * Math.sin(a)];
  for (const q of volta) p2.push(...anelV(q.r, q.y, q.a));
  for (const q of volta) p2.push(...anelV(LONGE, q.y, q.a));
  for (const q of volta) p2.push(...anelV(LONGE, ALTO, q.a));
  const I1 = (i) => 2 + ((i + N) % N), I2 = (i) => 2 + N + ((i + N) % N), I3 = (i) => 2 + 2 * N + ((i + N) % N);
  for (let i = 0; i < N; i++) {
    // (a é de −π a π em x, z: a frente de fora do sólido, por baixo, olha para −y)
    id2.push(0, I1(i), I1(i + 1));
    id2.push(I1(i), I2(i), I2(i + 1), I1(i), I2(i + 1), I1(i + 1));
    id2.push(I2(i), I3(i), I3(i + 1), I2(i), I3(i + 1), I2(i + 1));
    id2.push(1, I3(i + 1), I3(i));
  }
  console.log(`[corpo] a linha: ${anel.length} pontos em ${tr.length} traços; y de ${Math.min(...volta.map((q) => q.y)).toFixed(1)} a ${Math.max(...volta.map((q) => q.y)).toFixed(1)}`);
  return { pos: p2, idx: id2 };
}
const malhaDe = (l) => { const m = new Map(), p = []; const q = l.map((v) => { if (!m.has(v)) { m.set(v, p.length / 3); p.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); } return m.get(v); }); return { pos: p, idx: q }; };
fs.writeFileSync(ent, JSON.stringify({ a: { pos: [...P], idx: [...I] }, b: malhaDe(pecasP[0]), extras: pecasP.slice(1).map(malhaDe), corte: corteDaLinha() }));
const t0 = Date.now(), saida = execFileSync(acharBlender(), ['--background', '--factory-startup', '--python', path.join(AQUI, 'blender.py'), '--', 'uniao', ent, sai], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 });
for (const l of saida.split('\n')) if (l.startsWith('[corpo]')) console.log(l);
const R = JSON.parse(fs.readFileSync(sai, 'utf8'));
fs.rmSync(TEMPO, { recursive: true, force: true });
const V = R.pos, F = R.idx, nvR = V.length / 3, ntR = F.length / 3;

// ---- a conferência: fechada, de quem veio cada ponto, o que saiu do corpo
const ar = new Map();
for (let t = 0; t < ntR; t++) for (let e = 0; e < 3; e++) { const a = F[t * 3 + e], b = F[t * 3 + (e + 1) % 3], s = a < b ? `${a}_${b}` : `${b}_${a}`; ar.set(s, (ar.get(s) ?? 0) + 1); }
const abertas = [...ar.values()].filter((n) => n === 1).length, demais = [...ar.values()].filter((n) => n > 2).length;
const pai = Int32Array.from({ length: nvR }, (_, i) => i), raiz = (x) => { while (pai[x] !== x) { pai[x] = pai[pai[x]]; x = pai[x]; } return x; };
for (let t = 0; t < ntR; t++) { pai[raiz(F[t * 3])] = raiz(F[t * 3 + 1]); pai[raiz(F[t * 3 + 2])] = raiz(F[t * 3 + 1]); }
const pedacos = new Map();
for (let t = 0; t < ntR; t++) { const r = raiz(F[t * 3]); pedacos.set(r, (pedacos.get(r) ?? 0) + 1); }
const principal = [...pedacos].sort((a, b) => b[1] - a[1])[0][0];
const ruinsNaPrincipal = [...ar].filter(([s, n]) => n !== 2 && raiz(Number(s.split('_')[0])) === principal).length;
const chave = (x, y, z) => `${Math.round(x * 500)},${Math.round(y * 500)},${Math.round(z * 500)}`, noCorpo = new Map();
for (let v = 0; v < nv; v++) noCorpo.set(chave(P[v * 3], P[v * 3 + 1], P[v * 3 + 2]), v);
const deOnde = new Int32Array(nvR).fill(-1);
for (let v = 0; v < nvR; v++) { const q = noCorpo.get(chave(V[v * 3], V[v * 3 + 1], V[v * 3 + 2])); if (q !== undefined) deOnde[v] = q; }
const doCorpo = [...deOnde].filter((v) => v >= 0).length, ficaram = new Set(deOnde);
// o que saiu do corpo, por altura (a linha vermelha é na base do pescoço)
const faixas = {};
for (let v = 0; v < nv; v++) { if (ficaram.has(v)) continue; const y = Math.floor(P[v * 3 + 1] / 5) * 5; faixas[y] = (faixas[y] ?? 0) + 1; }
console.log(`[corpo] o corpo: ${I.length / 3} triângulos; o pedaço ${ID}: ${colados.length}; a união: ${ntR} triângulos, ${nvR} pontos (${doCorpo} do corpo, ${nvR - doCorpo} do pedaço ou do corte), em ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`[corpo] arestas abertas ${abertas}, com mais de dois ${demais} (na malha principal: ${ruinsNaPrincipal}); pedaços: ${[...pedacos.values()].sort((a, b) => b - a).join(', ')}`);
console.log(`[corpo] pontos do corpo que saíram, por altura (cm): ${Object.entries(faixas).sort((a, b) => a[0] - b[0]).map(([y, n]) => `${y}: ${n}`).join(' · ')}`);
if (args.includes('--ver')) fs.writeFileSync(opt('ver'), JSON.stringify({ V, F, iPed: 0, cores: [] }));
if (!GRAVAR) process.exit(0);
if (ruinsNaPrincipal) falha('a união não fechou: nada gravado');

// ---- a malha nova, nas unidades do arquivo (cm(v) = [x·k, (y − y0)·k, z·k], importar.mjs): o que já era do corpo fica como no arquivo (os braços estão na pose A)
let y0 = 0, n0 = 0;
for (let v = 0; v < nv; v++) if (P[v * 3 + 1] > 150 && Math.abs(P[v * 3]) < 10) { y0 += fonte.pos[v * 3 + 1] - P[v * 3 + 1] / k; n0++; }
y0 /= n0;
const posF = new Array(nvR * 3), normal = new Array(nvR * 3).fill(0), soma = Array.from({ length: nvR }, () => [0, 0, 0]);
for (let v = 0; v < nvR; v++) {
  const o = deOnde[v];
  if (o >= 0) for (let e = 0; e < 3; e++) posF[v * 3 + e] = fonte.pos[o * 3 + e];
  else { posF[v * 3] = V[v * 3] / k; posF[v * 3 + 1] = V[v * 3 + 1] / k + y0; posF[v * 3 + 2] = V[v * 3 + 2] / k; }
}
for (let t = 0; t < ntR; t++) {
  const [a, b, c] = [F[t * 3], F[t * 3 + 1], F[t * 3 + 2]], u = [0, 1, 2].map((e) => posF[b * 3 + e] - posF[a * 3 + e]), w = [0, 1, 2].map((e) => posF[c * 3 + e] - posF[a * 3 + e]), n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  for (const v of [a, b, c]) for (let e = 0; e < 3; e++) soma[v][e] += n[e];
}
for (let v = 0; v < nvR; v++) { const l = Math.hypot(...soma[v]) || 1; for (let e = 0; e < 3; e++) normal[v * 3 + e] = soma[v][e] / l; }
if (fs.readFileSync(ARQ_MOD, 'utf8') !== textoMod) falha('o modelagem.json mudou no disco enquanto eu trabalhava: nada gravado; rode de novo');
let copia = arq('-edicoes-antes-uniao.json');
for (let n = 2; fs.existsSync(copia); n++) copia = arq(`-edicoes-antes-uniao-${n}.json`);
fs.writeFileSync(copia, JSON.stringify({ _leiame: `As edições de ${CHAVE} antes da união (fundir-uniao.mjs, ${new Date().toISOString().slice(0, 10)}): o pedaço colado, no lugar em que o dono o deixou. Valem só para a malha de antes.`, novos: ed.novos }, null, 0) + '\n');
if (fs.existsSync(SIMPLES)) { if (fs.existsSync(ANTES)) { let n = 2, velha = arq(`-simples-antes-${n}.json`); while (fs.existsSync(velha)) velha = arq(`-simples-antes-${++n}.json`); fs.renameSync(ANTES, velha); } fs.renameSync(SIMPLES, ANTES); }
const dados = { _leiame: `A malha de ${cfg.entrada} unida a um pedaço colado (fundir-uniao.mjs): pos/normal (pose A, unidades do arquivo), uv, idx. O importar.mjs a usa no lugar da do .glb.`, pos: posF, uv: new Array(nvR * 2).fill(0), normal, idx: [...F] };
fs.writeFileSync(SIMPLES, JSON.stringify(dados) + '\n');
const importar = () => execFileSync(process.execPath, [path.join(AQUI, 'importar.mjs'), recorte], { cwd: RAIZ, stdio: 'ignore' });
importar();
// (os pontos voltam ao lugar da união, como no guardar-forma.mjs: só perto do tronco, onde o giro do braço é quase nenhum)
for (let volta = 1; volta <= 8; volta++) {
  const N = lerCorpo(cfg.nome);
  if (N.P.length !== V.length) falha('o corpo refeito não bate com a união');
  let n = 0, pior = 0;
  for (let v = 0; v < nvR; v++) {
    if (Math.abs(V[v * 3]) > 24) continue;
    const d = [0, 1, 2].map((e) => V[v * 3 + e] - N.P[v * 3 + e]), q = Math.hypot(...d);
    if (q <= 0.001) continue;
    n++; pior = Math.max(pior, q);
    for (let e = 0; e < 3; e++) dados.pos[v * 3 + e] += d[e] / k;
  }
  console.log(`[corpo] volta ${volta}: ${n} ponto(s) fora do lugar, o pior a ${pior.toFixed(4)} cm`);
  if (!n) break;
  if (volta === 8) { console.error('[corpo] AVISO: não voltaram todos ao lugar'); break; }
  fs.writeFileSync(SIMPLES, JSON.stringify(dados) + '\n');
  importar();
}
// ---- o modelagem.json: só este corpo muda
const novoEd = {};
for (const [c, val] of Object.entries(ed)) { if (c !== 'novos') { novoEd[c] = val; continue; } const resto = val.filter((n) => n.colagem !== ID); if (resto.length) novoEd.novos = resto; }
const fecha = (t, i) => { const a = t[i], b = a === '{' ? '}' : ']'; let d = 0, s = false; for (let q = i; q < t.length; q++) { const c = t[q]; if (s) { if (c === '\\') q++; else if (c === '"') s = false; continue; } if (c === '"') s = true; else if (c === a) d++; else if (c === b && --d === 0) return q; } return falha('modelagem.json torto'); };
const iniCorpo = textoMod.indexOf(`"${CHAVE}": {`), abre = textoMod.indexOf('{', iniCorpo), fimCorpo = fecha(textoMod, abre);
const bloco = `{\n${Object.entries(novoEd).map(([c, v]) => `      ${JSON.stringify(c)}: ${Array.isArray(v) && v.length ? `[\n${v.map((x) => `        ${JSON.stringify(x)}`).join(',\n')}\n      ]` : JSON.stringify(v)}`).join(',\n')}\n    }`;
const textoNovo = textoMod.slice(0, abre) + bloco + textoMod.slice(fimCorpo + 1);
JSON.parse(textoNovo);
if (fs.readFileSync(ARQ_MOD, 'utf8') !== textoMod) falha('o modelagem.json mudou no disco enquanto o corpo era refeito: a malha nova foi gravada, as edições não');
fs.writeFileSync(ARQ_MOD, textoNovo);
console.log(`[corpo] gravado: ${path.relative(RAIZ, SIMPLES)} (${nvR} pontos, ${ntR} triângulos); cópia das edições em ${path.relative(RAIZ, copia)}`);
