#!/usr/bin/env node
// A SIMPLIFICAÇÃO do corpo de arquivo INTEIRO (`manter`: a Feminino 3 e a 4) — a ferramenta SIMPLIFICAR da aba Modelo do
// editor (27/10/2026; o dono: "a orelha tá muito detalhada, pode virar poucos triângulos; o nariz tá lindo mas com muitos
// polígonos — o buraco da narina não precisa existir"):
//
//   node ferramentas/corpo-de-arquivo/simplificar.mjs <recorte.json> [simplificar | desfazer | original]
//
// simplificar: lê o pedido `<nome>-simplificar.json` (a pintura da aba: `proteger`, `reduzir`, `juntar` — o meio de cada
//   triângulo pintado, cm, pose T, como no `assets/corpos/<nome>.json` de agora — e `alvo`, o total de triângulos), dá a
//   cada triângulo da malha de agora o grupo do meio pintado mais perto (até 1,5 cm; o PROTEGER manda), e o Blender
//   (blender.py `simplificar`) junta as ilhas do JUNTAR num ponto e reduz o resto, guardando o formato e a UV. A malha nova
//   vai em `<nome>-simples.json` (a de antes em `<nome>-simples-antes.json`, para o desfazer) e o importar.mjs refaz o
//   corpo com ela (o esqueleto e os pesos de novo). As marcas do JUNTAR são gastas (saem do pedido).
// desfazer: volta à malha de antes da última simplificação.  original: volta ao .glb inteiro (o desfazer traz de volta).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const [recorte, acao = 'simplificar'] = process.argv.slice(2);
if (!recorte) { console.error('uso: node simplificar.mjs <recorte.json> [simplificar | desfazer | original]'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(path.resolve(RAIZ, recorte), 'utf8'));
if (!cfg.manter) { console.error('[corpo] só o corpo de arquivo inteiro (`manter`) se simplifica'); process.exit(1); }
const arq = (s) => path.join(AQUI, `${cfg.nome}${s}`);
const SIMPLES = arq('-simples.json'), ANTES = arq('-simples-antes.json'), PEDIDO = arq('-simplificar.json');
const importar = () => execFileSync(process.execPath, [path.join(AQUI, 'importar.mjs'), recorte], { cwd: RAIZ, stdio: 'inherit' });

if (acao === 'desfazer') {
  if (!fs.existsSync(ANTES)) { console.error('[corpo] nada a desfazer'); process.exit(1); }
  const a = fs.readFileSync(ANTES, 'utf8');
  if (fs.existsSync(SIMPLES)) fs.renameSync(SIMPLES, `${SIMPLES}.tmp`);
  if (JSON.parse(a).original) fs.unlinkSync(ANTES); else fs.renameSync(ANTES, SIMPLES);
  if (fs.existsSync(`${SIMPLES}.tmp`)) fs.renameSync(`${SIMPLES}.tmp`, ANTES); else fs.writeFileSync(ANTES, '{"original":true}\n');
  console.log('[corpo] desfeito');
  importar();
  process.exit(0);
}
if (acao === 'original') {
  if (!fs.existsSync(SIMPLES)) { console.log('[corpo] já é o original'); process.exit(0); }
  fs.renameSync(SIMPLES, ANTES);
  console.log('[corpo] de volta ao modelo inteiro');
  importar();
  process.exit(0);
}

// ---- a malha de agora (a simplificada, ou a do .glb) — no espaço do arquivo (pose A)
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
  fonte = { pos: [...acc(prim.attributes.POSITION)], uv: [...acc(prim.attributes.TEXCOORD_0)], idx: [...acc(prim.indices)] };
}
const nt = fonte.idx.length / 3;

// ---- o corpo de agora (pose T, cm): o meio de cada triângulo — os mesmos triângulos, na mesma ordem
const corpo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/corpos', `${cfg.nome}.json`), 'utf8'));
const de64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const P = de64(corpo.pos, Float32Array), I = de64(corpo.idx32, Uint32Array);
if (I.length / 3 !== nt) { console.error(`[corpo] o corpo (${I.length / 3} triângulos) não é da malha de agora (${nt}): rode o importar.mjs antes`); process.exit(1); }
const L = 1.5, grade = new Map(), cel = (x) => Math.floor(x / L), meios = new Float32Array(nt * 3);
for (let t = 0; t < nt; t++) {
  for (let e = 0; e < 3; e++) meios[t * 3 + e] = (P[I[t * 3] * 3 + e] + P[I[t * 3 + 1] * 3 + e] + P[I[t * 3 + 2] * 3 + e]) / 3;
  const k = `${cel(meios[t * 3])},${cel(meios[t * 3 + 1])},${cel(meios[t * 3 + 2])}`;
  if (!grade.has(k)) grade.set(k, []);
  grade.get(k).push(t);
}
const maisPerto = (m) => {
  let b = -1, d = L * L;
  const cx = cel(m[0]), cy = cel(m[1]), cz = cel(m[2]);
  for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) for (const t of grade.get(`${x},${y},${z}`) ?? []) {
    const q = (meios[t * 3] - m[0]) ** 2 + (meios[t * 3 + 1] - m[1]) ** 2 + (meios[t * 3 + 2] - m[2]) ** 2;
    if (q < d) { d = q; b = t; }
  }
  return b;
};
const pedido = JSON.parse(fs.readFileSync(PEDIDO, 'utf8'));
const cats = new Array(nt).fill(0), contas = {};
for (const [lista, c] of [['reduzir', 2], ['juntar', 3], ['proteger', 1]]) {
  contas[lista] = 0;
  for (const m of pedido[lista] ?? []) { const t = maisPerto(m); if (t >= 0) { cats[t] = c; contas[lista]++; } }
}
const alvo = Math.max(500, Math.round(Number(pedido.alvo) || nt));
console.log(`[corpo] simplificando ${cfg.nome}: ${nt} triângulos → ${alvo}; pintados: proteger ${contas.proteger}, reduzir muito ${contas.reduzir}, juntar ${contas.juntar}`);

// ---- o Blender
const TRABALHO = path.join(os.tmpdir(), `corpo-de-arquivo-${cfg.nome}`);
fs.mkdirSync(TRABALHO, { recursive: true });
const ent = path.join(TRABALHO, 'simplificar-entrada.json'), sai = path.join(TRABALHO, 'simplificar-saida.json');
fs.writeFileSync(ent, JSON.stringify({ pos: [...fonte.pos], uv: [...fonte.uv], idx: [...fonte.idx], cats, alvo }));
const base = 'C:/Program Files/Blender Foundation';
const versoes = fs.existsSync(base) ? fs.readdirSync(base).filter((d) => fs.existsSync(path.join(base, d, 'blender.exe'))).sort() : [];
if (!versoes.length) { console.error('[corpo] Blender não encontrado'); process.exit(1); }
const saida = execFileSync(path.join(base, versoes.at(-1), 'blender.exe'), ['--background', '--factory-startup', '--python', path.join(AQUI, 'blender.py'), '--', 'simplificar', ent, sai], { encoding: 'utf8', maxBuffer: 64 << 20 });
for (const l of saida.split('\n')) if (l.startsWith('[corpo]')) console.log(l);
const nova = JSON.parse(fs.readFileSync(sai, 'utf8'));
if (!nova.idx?.length) { console.error('[corpo] o Blender não devolveu a malha'); process.exit(1); }

// ---- grava (a de antes para o desfazer), gasta as marcas do JUNTAR e refaz o corpo
if (fs.existsSync(SIMPLES)) fs.renameSync(SIMPLES, ANTES); else fs.writeFileSync(ANTES, '{"original":true}\n');
fs.writeFileSync(SIMPLES, JSON.stringify({ _leiame: `A malha SIMPLIFICADA de ${cfg.entrada} (simplificar.mjs, a ferramenta Simplificar da aba Modelo): pos/normal (pose A, unidades do arquivo), uv, idx. O importar.mjs a usa no lugar da do .glb. Apagar = voltar ao modelo inteiro.`, ...nova }) + '\n');
if (pedido.juntar?.length) { pedido.juntar = []; fs.writeFileSync(PEDIDO, JSON.stringify(pedido) + '\n'); }
importar();
