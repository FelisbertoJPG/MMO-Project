#!/usr/bin/env node
// A MALHA DE UM MODELO SOLTO, REDUZIDA, num .glb novo (08/11/2026; o dono: "quero por exemplo reduzir a malha do cabelo somente, e
// depois copiar e mover pro personagem na aba de modelo"). Quem chama é a rota do editor (o "reduzir" da aba Modelo e da área
// Bustos da aba Cabelo), com o que está na vista: os triângulos do modelo solto que sobraram (os removidos com o cortar ✂ ficam de
// fora), em cm, como a aba os mostra.
//
//   node ferramentas/penteados/reduzir-malha.mjs <entrada.json> <saida.glb> <triângulos>
//
// entrada: { pos: [x, y, z, …] (cm; três pontos por triângulo, ou com `idx`) }. O Blender (blender.py `reduzirmalha`) solda os pontos
// repetidos e reduz até <triângulos> pelo colapso de arestas, que guarda o formato. O .glb sai em METROS, no mesmo lugar (a aba põe o
// pé no chão ou o topo em `TOPO_DO_SOLTO`, como no modelo de onde veio). A última linha da saída é { ok, antes, depois }.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const [ENTRADA, SAIDA, ALVO] = process.argv.slice(2), alvo = Math.round(Number(ALVO));
const falhar = (m) => { console.error(`[reduzir] ${m}`); console.log(JSON.stringify({ ok: false, erro: m })); process.exit(1); };
if (!ENTRADA || !/.(glb|json)$/.test(SAIDA ?? '') || !(alvo >= 50)) falhar('uso: node reduzir-malha.mjs <entrada.json> <saida.glb | saida.json> <triângulos (50 ou mais)>');
const d = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));
const pos = d.pos, idx = d.idx ?? Array.from({ length: pos.length / 3 }, (_, i) => i);
if (!Array.isArray(pos) || pos.length % 9 && !d.idx || !pos.every(Number.isFinite)) falhar('entrada torta');
const antes = idx.length / 3;

// ---- o Blender
const base = 'C:/Program Files/Blender Foundation';
const versoes = fs.existsSync(base) ? fs.readdirSync(base).filter((v) => fs.existsSync(path.join(base, v, 'blender.exe'))).sort() : [];
if (!versoes.length) falhar('Blender não encontrado');
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'reduzir-')), ent = path.join(pasta, 'entrada.json'), sai = path.join(pasta, 'saida.json');
fs.writeFileSync(ent, JSON.stringify({ pos, idx }));
let log = '';
try { log = execFileSync(path.join(base, versoes.at(-1), 'blender.exe'), ['--background', '--factory-startup', '--python', path.join(RAIZ, 'ferramentas/corpo-de-arquivo/blender.py'), '--', 'reduzirmalha', ent, sai, String(alvo)], { encoding: 'utf8', maxBuffer: 64 << 20 }); }
catch (e) { falhar(`o Blender falhou: ${(e.stdout ?? e.message).toString().slice(-400)}`); }
for (const l of log.split('\n')) if (l.startsWith('[corpo]')) console.log(l);
const r = JSON.parse(fs.readFileSync(sai, 'utf8'));
fs.rmSync(pasta, { recursive: true, force: true });
if (!r.idx?.length) falhar('o Blender não devolveu a malha');

// (saída .json: { pos, idx } em CM, como entrou — o "gravar no cabelo" da aba Modelo, a malha de um molde, 09/11/2026)
if (SAIDA.endsWith('.json')) {
  fs.writeFileSync(SAIDA, JSON.stringify({ pos: r.pos, idx: r.idx }));
  console.log(`[reduzir] ${SAIDA}: ${antes} → ${r.idx.length / 3} triângulos`);
  console.log(JSON.stringify({ ok: true, antes, depois: r.idx.length / 3 }));
  process.exit(0);
}
// ---- o .glb: uma malha, POSITION + índices, em metros (como o pedaco-do-glb.mjs)
const P = new Float32Array(r.pos.map((v) => v / 100)), I = new Uint32Array(r.idx);
const alinhar = (buf, enchimento) => { const k = buf.length % 4; return k ? Buffer.concat([buf, Buffer.alloc(4 - k, enchimento)]) : buf; };
const bPos = Buffer.from(P.buffer), bInd = Buffer.from(I.buffer), corpo = Buffer.concat([bPos, bInd]);
const mn = [0, 1, 2].map((e) => { let m = Infinity; for (let i = e; i < P.length; i += 3) m = Math.min(m, P[i]); return m; });
const mx = [0, 1, 2].map((e) => { let m = -Infinity; for (let i = e; i < P.length; i += 3) m = Math.max(m, P[i]); return m; });
const gltf = {
  asset: { version: '2.0', generator: 'ferramentas/penteados/reduzir-malha.mjs' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'reduzido', mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  buffers: [{ byteLength: corpo.length }],
  bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bPos.length, target: 34962 }, { buffer: 0, byteOffset: bPos.length, byteLength: bInd.length, target: 34963 }],
  accessors: [{ bufferView: 0, componentType: 5126, count: P.length / 3, type: 'VEC3', min: mn, max: mx }, { bufferView: 1, componentType: 5125, count: I.length, type: 'SCALAR' }],
};
const js = alinhar(Buffer.from(JSON.stringify(gltf)), 0x20), dados = alinhar(corpo, 0);
const cab = Buffer.alloc(12), cj = Buffer.alloc(8), cb = Buffer.alloc(8);
cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + js.length + 8 + dados.length, 8);
cj.writeUInt32LE(js.length, 0); cj.writeUInt32LE(0x4e4f534a, 4); cb.writeUInt32LE(dados.length, 0); cb.writeUInt32LE(0x004e4942, 4);
fs.writeFileSync(SAIDA, Buffer.concat([cab, cj, js, cb, dados]));
console.log(`[reduzir] ${SAIDA}: ${antes} → ${I.length / 3} triângulos`);
console.log(JSON.stringify({ ok: true, antes, depois: I.length / 3 }));
