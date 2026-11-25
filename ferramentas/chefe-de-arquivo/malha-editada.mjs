#!/usr/bin/env node
// A MALHA EDITADA DE UM CHEFE DE ARQUIVO (25/11/2026; a primeira: a Mycohydra). Quem chama é a rota do editor de cenas
// (/__alvo/ds/chefe/<nome>/malha: o "gravar no chefe" e o "reduzir → gravar no chefe" da aba Modelo, com o chefe aberto como modelo
// solto). A aba abre SEMPRE o modelo ORIGINAL (`original` no config) e as edições dela (cortar ✂, mover vértice, criar △…) ficam no
// modelagem.json, na chave `chefe-<nome>`; o que chega aqui são os triângulos da vista, com o UV de cada canto.
//
//   node ferramentas/chefe-de-arquivo/malha-editada.mjs <config.json> <entrada.json>
//
// entrada: { pos: [x, y, z, …] (cm, como a aba mostra: o original × 100 com o pé em y = 0; três cantos por triângulo),
//            uv: [u, v, …] (dois por canto), reduzir?: <triângulos> }
// Os passos: volta ao espaço do original; com `reduzir`, o Blender (blender.py `reduzirchefe`) reduz guardando o UV; solda os cantos
// iguais (posição + UV), refaz as normais (lisas: somadas pela posição, a costura da textura não vira quina); grava
// <nome>-editado.glb ao lado do config, com a textura e o material do original; o config passa a ter `fonte` = ele; e roda o
// rigar.mjs (o esqueleto, os pesos, a ficha e a textura em JPEG). A última linha da saída é { ok, antes, depois }.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const falhar = (m) => { console.error(`[malha-editada] ${m}`); console.log(JSON.stringify({ ok: false, erro: m })); process.exit(1); };
const [arqCfg, arqEnt] = process.argv.slice(2);
if (!arqCfg || !arqEnt) falhar('uso: node ferramentas/chefe-de-arquivo/malha-editada.mjs <config.json> <entrada.json>');
const textoCfg = fs.readFileSync(arqCfg, 'utf8'), cfg = JSON.parse(textoCfg);
const ent = JSON.parse(fs.readFileSync(arqEnt, 'utf8'));
let { pos, uv } = ent;
if (!Array.isArray(pos) || !pos.length || pos.length % 9 || !Array.isArray(uv) || uv.length !== (pos.length / 3) * 2 || !pos.every(Number.isFinite) || !uv.every(Number.isFinite)) falhar('entrada torta');
if (!cfg.original || !cfg.caixa) falhar('o config não tem `original` e `caixa` (o modelo de onde a aba parte e a caixa dele)');
const antes = pos.length / 9;

// ---------------------------------------------------------------- o original (a textura, o material)
const buf = fs.readFileSync(path.resolve(path.dirname(arqCfg), cfg.original));
const jLen = buf.readUInt32LE(12), J = JSON.parse(buf.subarray(20, 20 + jLen).toString('utf8'));
const bOff = 20 + jLen, BIN = buf.subarray(bOff + 8, bOff + 8 + buf.readUInt32LE(bOff));

// ---------------------------------------------------------------- de volta ao espaço do original (a aba: × 100 e o pé em y = 0)
const y0 = cfg.caixa.min[1];
pos = pos.map((v, i) => (i % 3 === 1 ? v / 100 + y0 : v / 100));

// ---------------------------------------------------------------- reduzir (o Blender)
if (ent.reduzir != null) {
  const alvo = Math.round(Number(ent.reduzir));
  if (!(alvo >= 50)) falhar('reduzir para quantos? (50 ou mais)');
  if (alvo < antes) {
    const base = 'C:/Program Files/Blender Foundation';
    const versoes = fs.existsSync(base) ? fs.readdirSync(base).filter((v) => fs.existsSync(path.join(base, v, 'blender.exe'))).sort() : [];
    if (!versoes.length) falhar('Blender não encontrado');
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'chefe-')), e = path.join(pasta, 'entrada.json'), s = path.join(pasta, 'saida.json');
    fs.writeFileSync(e, JSON.stringify({ pos, uv }));
    let log = '';
    try { log = execFileSync(path.join(base, versoes.at(-1), 'blender.exe'), ['--background', '--factory-startup', '--python', path.join(RAIZ, 'ferramentas/corpo-de-arquivo/blender.py'), '--', 'reduzirchefe', e, s, String(alvo)], { encoding: 'utf8', maxBuffer: 64 << 20 }); }
    catch (err) { falhar(`o Blender falhou: ${(err.stdout ?? err.message).toString().slice(-400)}`); }
    for (const l of log.split('\n')) if (l.startsWith('[corpo]')) console.log(l);
    ({ pos, uv } = JSON.parse(fs.readFileSync(s, 'utf8')));
    fs.rmSync(pasta, { recursive: true, force: true });
    if (!pos?.length) falhar('o Blender não devolveu a malha');
  }
}

// ---------------------------------------------------------------- soldar (posição + UV) e as normais (pela posição)
const cantos = pos.length / 3, porChave = new Map(), idx = new Uint32Array(cantos), P = [], U = [];
const naPos = new Map(), grupo = [];   // (o canto → o ponto pela posição só: a normal é somada aqui)
for (let c = 0; c < cantos; c++) {
  const kp = `${Math.round(pos[c * 3] * 1e6)},${Math.round(pos[c * 3 + 1] * 1e6)},${Math.round(pos[c * 3 + 2] * 1e6)}`;
  const k = `${kp}|${Math.round(uv[c * 2] * 1e6)},${Math.round(uv[c * 2 + 1] * 1e6)}`;
  if (!porChave.has(k)) {
    porChave.set(k, P.length / 3);
    P.push(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]); U.push(uv[c * 2], uv[c * 2 + 1]);
    if (!naPos.has(kp)) naPos.set(kp, naPos.size);
    grupo.push(naPos.get(kp));
  }
  idx[c] = porChave.get(k);
}
const N = P.length / 3, soma = new Float64Array(naPos.size * 3);
for (let t = 0; t < cantos; t += 3) {
  const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
  const ab = [0, 1, 2].map((e) => P[b * 3 + e] - P[a * 3 + e]), ac = [0, 1, 2].map((e) => P[c * 3 + e] - P[a * 3 + e]);
  const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];   // (a área pesa)
  for (const v of [a, b, c]) for (let e = 0; e < 3; e++) soma[grupo[v] * 3 + e] += n[e];
}
const NRM = new Float32Array(N * 3);
for (let v = 0; v < N; v++) {
  const g = grupo[v], l = Math.hypot(soma[g * 3], soma[g * 3 + 1], soma[g * 3 + 2]) || 1;
  for (let e = 0; e < 3; e++) NRM[v * 3 + e] = soma[g * 3 + e] / l;
}
const POS = new Float32Array(P), UVS = new Float32Array(U);
const min = [0, 1, 2].map((e) => { let m = Infinity; for (let i = e; i < POS.length; i += 3) m = Math.min(m, POS[i]); return m; });
const max = [0, 1, 2].map((e) => { let m = -Infinity; for (let i = e; i < POS.length; i += 3) m = Math.max(m, POS[i]); return m; });

// ---------------------------------------------------------------- o .glb (uma malha, uma primitiva — o que o rigar.mjs lê)
const pedacos = [], views = [], accessors = [];
let off = 0;
function poe(dado, alvo) {
  const pad = (4 - (off % 4)) % 4; if (pad) { pedacos.push(Buffer.alloc(pad)); off += pad; }
  const b = Buffer.from(dado.buffer, dado.byteOffset, dado.byteLength);
  views.push({ buffer: 0, byteOffset: off, byteLength: b.length, ...(alvo ? { target: alvo } : {}) });
  pedacos.push(b); off += b.length;
  return views.length - 1;
}
const acessor = (dado, tipo, comp, conta, extra = {}, alvo) => { accessors.push({ bufferView: poe(dado, alvo), componentType: comp, count: conta, type: tipo, ...extra }); return accessors.length - 1; };
const aIdx = acessor(idx, 'SCALAR', 5125, idx.length, {}, 34963);
const aPos = acessor(POS, 'VEC3', 5126, N, { min, max }, 34962);
const aNrm = acessor(NRM, 'VEC3', 5126, N, {}, 34962);
const aUv = acessor(UVS, 'VEC2', 5126, N, {}, 34962);
const imagens = (J.images ?? []).map((im) => {
  const v = J.bufferViews[im.bufferView];
  return { mimeType: im.mimeType, bufferView: poe(new Uint8Array(BIN.buffer, BIN.byteOffset + (v.byteOffset ?? 0), v.byteLength)) };
});
const bin = Buffer.concat(pedacos);
const json = {
  asset: { version: '2.0', generator: 'ferramentas/chefe-de-arquivo/malha-editada.mjs' },
  scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'editado', mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUv }, indices: aIdx, ...(J.materials?.length ? { material: 0 } : {}), mode: 4 }] }],
  materials: J.materials, textures: J.textures, images: imagens, samplers: J.samplers,
  accessors, bufferViews: views, buffers: [{ byteLength: bin.length }],
};
for (const k of ['materials', 'textures', 'images', 'samplers']) if (!json[k]?.length) delete json[k];
let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const bp = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
const cab = Buffer.alloc(12), cj = Buffer.alloc(8), cb = Buffer.alloc(8);
cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + js.length + 8 + bp.length, 8);
cj.writeUInt32LE(js.length, 0); cj.writeUInt32LE(0x4e4f534a, 4); cb.writeUInt32LE(bp.length, 0); cb.writeUInt32LE(0x004e4942, 4);
const nomeSaida = `${path.basename(cfg.saida, '.glb')}-editado.glb`;
fs.writeFileSync(path.join(path.dirname(arqCfg), nomeSaida), Buffer.concat([cab, cj, js, cb, bp]));
const depois = cantos / 3;
console.log(`[malha-editada] ${nomeSaida}: ${antes} → ${depois} triângulos (${N} vértices)`);

// ---------------------------------------------------------------- o config aponta para ela, e o rigar.mjs
const FONTE = /("fonte":\s*)"[^"]*"/;
if (!FONTE.test(textoCfg)) falhar('o config não tem a linha "fonte"');
const novoCfg = textoCfg.replace(FONTE, `$1${JSON.stringify(nomeSaida)}`);
JSON.parse(novoCfg);
if (novoCfg !== textoCfg) fs.writeFileSync(arqCfg, novoCfg);
try { execFileSync(process.execPath, [path.join(AQUI, 'rigar.mjs'), arqCfg], { stdio: ['ignore', 'inherit', 'inherit'] }); }
catch (err) { falhar(`o rigar.mjs falhou: ${err.message}`); }
console.log(JSON.stringify({ ok: true, antes, depois }));
