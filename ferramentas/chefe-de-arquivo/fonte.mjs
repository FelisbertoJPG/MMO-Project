// A MALHA DE UM CHEFE DE ARQUIVO — o que os programas da pasta dividem (25/11/2026; a Mycohydra). A aba Modelo do editor abre a
// malha de AGORA do chefe (a `fonte` do config: o original do Meshy, ou a editada `<nome>-editado.glb`), em cm, com o pé do ORIGINAL em
// y = 0 (a `caixa` do config — não a desta malha: cortar a ponta de baixo não muda o lugar); quem grava uma malha nova (o "gravar no
// chefe", o "reduzir", o SIMPLIFICAR) passa por `gravarFonte`: a textura e o material do original, o DESFAZER de um passo
// (`<nome>-editado-antes.glb`) e o rigar.mjs (o esqueleto, os pesos, a ficha).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');

export function lerConfig(arqCfg) {
  const texto = fs.readFileSync(arqCfg, 'utf8');
  return { texto, cfg: JSON.parse(texto) };
}
/** os caminhos de um config: a pasta, o original, a editada, a de antes (o desfazer) e a fonte de agora */
export function caminhos(arqCfg, cfg) {
  const pasta = path.dirname(arqCfg), base = path.basename(cfg.saida, '.glb');
  return {
    pasta, base,
    original: path.resolve(pasta, cfg.original ?? cfg.fonte),
    editado: path.join(pasta, `${base}-editado.glb`),
    antes: path.join(pasta, `${base}-editado-antes.glb`),
    fonte: path.resolve(pasta, cfg.fonte),
    pedido: path.join(pasta, `${base}-simplificar.json`),
  };
}

/** a malha de um .glb de UMA malha e UMA primitiva: { pos, uv, idx } (o espaço do arquivo), mais o JSON e o binário */
export function lerGlb(caminho) {
  const buf = fs.readFileSync(caminho), jLen = buf.readUInt32LE(12), J = JSON.parse(buf.subarray(20, 20 + jLen).toString('utf8'));
  const bOff = 20 + jLen, BIN = buf.subarray(bOff + 8, bOff + 8 + buf.readUInt32LE(bOff));
  const TIPOS = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }, LARG = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
  const ler = (ai) => {
    const a = J.accessors[ai], v = J.bufferViews[a.bufferView], T = TIPOS[a.componentType], ini = BIN.byteOffset + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new T(BIN.buffer.slice(ini, ini + a.count * LARG[a.type] * T.BYTES_PER_ELEMENT));
  };
  const prim = J.meshes[0].primitives[0];
  return { J, BIN, pos: ler(prim.attributes.POSITION), uv: prim.attributes.TEXCOORD_0 != null ? ler(prim.attributes.TEXCOORD_0) : null, idx: Uint32Array.from(ler(prim.indices)) };
}

/** a aba Modelo (cm, o pé do original em y = 0) → o espaço do original, e o contrário */
export const daVista = (pos, caixa) => Array.from(pos, (v, i) => (i % 3 === 1 ? v / 100 + caixa.min[1] : v / 100));
export const paraVista = (x, y, z, caixa) => [x * 100, (y - caixa.min[1]) * 100, z * 100];

/** o Blender (o mais novo em Program Files) com o blender.py do corpo de arquivo: `dados` → { saida (o JSON), log } */
export function blender(modo, dados, ...extra) {
  const base = 'C:/Program Files/Blender Foundation';
  const versoes = fs.existsSync(base) ? fs.readdirSync(base).filter((v) => fs.existsSync(path.join(base, v, 'blender.exe'))).sort() : [];
  if (!versoes.length) throw new Error('Blender não encontrado');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'chefe-')), e = path.join(pasta, 'entrada.json'), s = path.join(pasta, 'saida.json');
  fs.writeFileSync(e, JSON.stringify(dados));
  try {
    const log = execFileSync(path.join(base, versoes.at(-1), 'blender.exe'), ['--background', '--factory-startup', '--python', path.join(RAIZ, 'ferramentas/corpo-de-arquivo/blender.py'), '--', modo, e, s, ...extra.map(String)], { encoding: 'utf8', maxBuffer: 64 << 20 });
    for (const l of log.split('\n')) if (l.startsWith('[corpo]')) console.log(l);
    return JSON.parse(fs.readFileSync(s, 'utf8'));
  } finally { fs.rmSync(pasta, { recursive: true, force: true }); }
}

/** os cantos dos triângulos (pos, uv: três por triângulo) soldados (posição + UV) → { pos, uv, idx } */
export function soldar(pos, uv) {
  const cantos = pos.length / 3, mapa = new Map(), idx = new Uint32Array(cantos), P = [], U = [];
  for (let c = 0; c < cantos; c++) {
    const k = `${Math.round(pos[c * 3] * 1e6)},${Math.round(pos[c * 3 + 1] * 1e6)},${Math.round(pos[c * 3 + 2] * 1e6)}|${Math.round(uv[c * 2] * 1e6)},${Math.round(uv[c * 2 + 1] * 1e6)}`;
    if (!mapa.has(k)) { mapa.set(k, P.length / 3); P.push(pos[c * 3], pos[c * 3 + 1], pos[c * 3 + 2]); U.push(uv[c * 2], uv[c * 2 + 1]); }
    idx[c] = mapa.get(k);
  }
  return { pos: P, uv: U, idx };
}

/** normais lisas: somadas pela POSIÇÃO (a costura da textura não vira quina), pesadas pela área */
function normaisLisas(P, idx) {
  const N = P.length / 3, grupo = new Int32Array(N), porPos = new Map();
  for (let v = 0; v < N; v++) { const k = `${Math.round(P[v * 3] * 1e6)},${Math.round(P[v * 3 + 1] * 1e6)},${Math.round(P[v * 3 + 2] * 1e6)}`; if (!porPos.has(k)) porPos.set(k, porPos.size); grupo[v] = porPos.get(k); }
  const soma = new Float64Array(porPos.size * 3);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t], idx[t + 1], idx[t + 2]];
    const ab = [0, 1, 2].map((e) => P[b * 3 + e] - P[a * 3 + e]), ac = [0, 1, 2].map((e) => P[c * 3 + e] - P[a * 3 + e]);
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    for (const v of [a, b, c]) for (let e = 0; e < 3; e++) soma[grupo[v] * 3 + e] += n[e];
  }
  const NRM = new Float32Array(N * 3);
  for (let v = 0; v < N; v++) { const g = grupo[v], l = Math.hypot(soma[g * 3], soma[g * 3 + 1], soma[g * 3 + 2]) || 1; for (let e = 0; e < 3; e++) NRM[v * 3 + e] = soma[g * 3 + e] / l; }
  return NRM;
}

/** o .glb (uma malha, uma primitiva — o que o rigar.mjs lê) com a textura e o material do original */
function escreverGlb(destino, original, { pos, uv, idx, normal }) {
  const POS = Float32Array.from(pos), UVS = Float32Array.from(uv), IDX = Uint32Array.from(idx), N = POS.length / 3;
  const NRM = normal?.length === POS.length ? Float32Array.from(normal) : normaisLisas(POS, IDX);
  const min = [0, 1, 2].map((e) => { let m = Infinity; for (let i = e; i < POS.length; i += 3) m = Math.min(m, POS[i]); return m; });
  const max = [0, 1, 2].map((e) => { let m = -Infinity; for (let i = e; i < POS.length; i += 3) m = Math.max(m, POS[i]); return m; });
  const { J, BIN } = lerGlb(original);
  const pedacos = [], views = [], accessors = [];
  let off = 0;
  const poe = (dado, alvo) => {
    const pad = (4 - (off % 4)) % 4; if (pad) { pedacos.push(Buffer.alloc(pad)); off += pad; }
    const b = Buffer.from(dado.buffer, dado.byteOffset, dado.byteLength);
    views.push({ buffer: 0, byteOffset: off, byteLength: b.length, ...(alvo ? { target: alvo } : {}) });
    pedacos.push(b); off += b.length;
    return views.length - 1;
  };
  const acessor = (dado, tipo, comp, conta, extra = {}, alvo) => { accessors.push({ bufferView: poe(dado, alvo), componentType: comp, count: conta, type: tipo, ...extra }); return accessors.length - 1; };
  const aIdx = acessor(IDX, 'SCALAR', 5125, IDX.length, {}, 34963);
  const aPos = acessor(POS, 'VEC3', 5126, N, { min, max }, 34962);
  const aNrm = acessor(NRM, 'VEC3', 5126, N, {}, 34962);
  const aUv = acessor(UVS, 'VEC2', 5126, N, {}, 34962);
  const imagens = (J.images ?? []).map((im) => {
    const v = J.bufferViews[im.bufferView];
    return { mimeType: im.mimeType, bufferView: poe(new Uint8Array(BIN.buffer, BIN.byteOffset + (v.byteOffset ?? 0), v.byteLength)) };
  });
  const bin = Buffer.concat(pedacos);
  const json = {
    asset: { version: '2.0', generator: 'ferramentas/chefe-de-arquivo/fonte.mjs' },
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
  fs.writeFileSync(destino, Buffer.concat([cab, cj, js, cb, bp]));
  return { triangulos: IDX.length / 3, vertices: N };
}

/** o config passa a usar `arquivo` (relativo à pasta) como a fonte, e o rigar.mjs refaz o chefe */
function usarFonte(arqCfg, arquivo) {
  const { texto } = lerConfig(arqCfg), FONTE = /("fonte":\s*)"[^"]*"/;
  if (!FONTE.test(texto)) throw new Error('o config não tem a linha "fonte"');
  const novo = texto.replace(FONTE, `$1${JSON.stringify(arquivo)}`);
  JSON.parse(novo);
  if (novo !== texto) fs.writeFileSync(arqCfg, novo);
  execFileSync(process.execPath, [path.join(AQUI, 'rigar.mjs'), arqCfg], { stdio: ['ignore', 'inherit', 'inherit'] });
}

/** GRAVA uma malha nova (o espaço do original) como a fonte: a de agora vira a de antes (o desfazer), a textura é a do original */
export function gravarFonte(arqCfg, malha) {
  const { cfg } = lerConfig(arqCfg), c = caminhos(arqCfg, cfg);
  // (o desfazer de um passo: a editada de agora vira a de antes; se a de agora é o original, não há "antes" — desfazer volta a ele)
  if (fs.existsSync(c.editado)) fs.renameSync(c.editado, c.antes); else if (fs.existsSync(c.antes)) fs.unlinkSync(c.antes);
  const r = escreverGlb(c.editado, c.original, malha);
  console.log(`[chefe] ${path.basename(c.editado)}: ${r.triangulos} triângulos (${r.vertices} vértices)`);
  usarFonte(arqCfg, path.basename(c.editado));
  return r;
}
/** DESFAZER a última: troca a editada com a de antes (desfazer de novo refaz); sem a de antes, volta ao original */
export function desfazerFonte(arqCfg) {
  const { cfg } = lerConfig(arqCfg), c = caminhos(arqCfg, cfg), tmp = `${c.antes}.tmp`;
  if (!fs.existsSync(c.antes) && !fs.existsSync(c.editado)) throw new Error('nada a desfazer: a malha já é o original');
  if (fs.existsSync(c.editado)) fs.renameSync(c.editado, tmp);
  if (fs.existsSync(c.antes)) fs.renameSync(c.antes, c.editado);
  if (fs.existsSync(tmp)) fs.renameSync(tmp, c.antes);
  usarFonte(arqCfg, path.basename(fs.existsSync(c.editado) ? c.editado : c.original));
}
/** VOLTAR AO ORIGINAL: a editada de agora vira a de antes (o desfazer a traz de volta) */
export function voltarAoOriginal(arqCfg) {
  const { cfg } = lerConfig(arqCfg), c = caminhos(arqCfg, cfg);
  if (fs.existsSync(c.editado)) fs.renameSync(c.editado, c.antes);
  usarFonte(arqCfg, path.basename(c.original));
}
