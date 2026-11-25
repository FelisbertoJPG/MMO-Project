// O ESQUELETO DE UM CHEFE DE ARQUIVO (25/11/2026; o primeiro: a Mycohydra das WindHills).
//
// O .glb do Meshy vem SEM esqueleto e sem animação. Esta ferramenta lê um JSON com as JUNTAS
// (no espaço do modelo de origem: lidas nas vistas ortográficas) e grava um .glb com o esqueleto e
// os pesos — que o jogo anima por código (o cérebro diz a pose; o corpo gira os ossos).
//
// OS PESOS, pela distância ANDANDO SOBRE A PELE (geodésica), não pelo ar: a malha do Meshy é uma
// peça só, e dois pescoços que passam perto no espaço estão longe pela pele — assim um não puxa o
// outro. Os passos:
//   1. solda os vértices repetidos (a costura da textura duplica posição) e monta as arestas;
//   2. as SEMENTES de cada osso: os vértices mais perto do segmento dele (o anel do tubo); um osso com
//      `raio` (o tronco, que corre por dentro de um bulbo largo) pega tudo a menos de `raio` do segmento;
//      quem está mais perto de outro osso fica com o outro;
//   3. Dijkstra de todas as sementes juntas: cada vértice fica com o osso que chega primeiro pela pele;
//   4. SUAVIZA (cada vértice vira a média com os vizinhos, `suavizar` vezes): a dobra fica macia;
//   5. os OSSOS DE REGIÃO (`regiao`: a boca) entram por cima: pegam a pele dentro de um elipsoide
//      (`raio` [x, y, z] em volta do `de`, caindo suave até a borda; só a metade da FRENTE, +Z, se
//      `frente`), e só a dos ossos de `so` — o resto do vértice fica com quem já era dono, na proporção;
//   6. os 4 maiores pesos de cada vértice, somando 1.
// O modelo é escalado para `altura` metros, com os pés no chão (y = 0) e o meio da caixa em x = z = 0.
// No fim, a textura é reduzida a `textura` px e vira JPEG (ferramentas/enxugar-glb.mjs --jpeg).
//
// Uso: node ferramentas/chefe-de-arquivo/rigar.mjs ferramentas/chefe-de-arquivo/mycohydra.json
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arqCfg = process.argv[2];
if (!arqCfg) { console.error('uso: node ferramentas/chefe-de-arquivo/rigar.mjs <config.json>'); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(arqCfg, 'utf8'));
const fonte = path.resolve(path.dirname(arqCfg), cfg.fonte), saida = path.resolve(RAIZ, cfg.saida);

// ---------------------------------------------------------------- o .glb de origem
const buf = fs.readFileSync(fonte);
const jLen = buf.readUInt32LE(12);
const J = JSON.parse(buf.subarray(20, 20 + jLen).toString('utf8'));
const bOff = 20 + jLen, BIN = buf.subarray(bOff + 8, bOff + 8 + buf.readUInt32LE(bOff));
if (J.meshes.length !== 1 || J.meshes[0].primitives.length !== 1) throw new Error('esperava UMA malha com UMA primitiva (o .glb do Meshy)');
const TIPOS = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array };
const LARG = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
function ler(ai) {
  const a = J.accessors[ai], v = J.bufferViews[a.bufferView], T = TIPOS[a.componentType];
  const n = a.count * LARG[a.type], ini = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
  if (v.byteStride && v.byteStride !== LARG[a.type] * T.BYTES_PER_ELEMENT) throw new Error('bufferView intercalado: não previsto');
  return new T(BIN.buffer.slice(BIN.byteOffset + ini, BIN.byteOffset + ini + n * T.BYTES_PER_ELEMENT));
}
const prim = J.meshes[0].primitives[0];
const P0 = ler(prim.attributes.POSITION), NRM = ler(prim.attributes.NORMAL), UV = ler(prim.attributes.TEXCOORD_0);
const IDX = ler(prim.indices);
const N = P0.length / 3;

// ---------------------------------------------------------------- escala e lugar
let ymin = Infinity, ymax = -Infinity, xmin = Infinity, xmax = -Infinity, zmin = Infinity, zmax = -Infinity;
for (let i = 0; i < N; i++) {
  const x = P0[i * 3], y = P0[i * 3 + 1], z = P0[i * 3 + 2];
  if (x < xmin) xmin = x; if (x > xmax) xmax = x; if (y < ymin) ymin = y; if (y > ymax) ymax = y; if (z < zmin) zmin = z; if (z > zmax) zmax = z;
}
// (a CAIXA do config — a do modelo ORIGINAL — vale no lugar da desta malha: editada na aba Modelo do editor ou reduzida, a malha
// não muda de escala nem de lugar, e as juntas, que estão no espaço do original, seguem certas)
if (cfg.caixa) ({ min: [xmin, ymin, zmin], max: [xmax, ymax, zmax] } = cfg.caixa);
const ESC = cfg.altura / (ymax - ymin), cx = (xmin + xmax) / 2, cz = (zmin + zmax) / 2;
const noMundo = ([x, y, z]) => [(x - cx) * ESC, (y - ymin) * ESC, (z - cz) * ESC];

// ---------------------------------------------------------------- 1. soldar e as arestas
const chave = new Map(), sold = new Int32Array(N);
const unicos = [];
for (let i = 0; i < N; i++) {
  const k = `${Math.round(P0[i * 3] * 1e5)},${Math.round(P0[i * 3 + 1] * 1e5)},${Math.round(P0[i * 3 + 2] * 1e5)}`;
  if (!chave.has(k)) { chave.set(k, unicos.length); unicos.push(i); }
  sold[i] = chave.get(k);
}
const M = unicos.length;
const PX = (u, e) => P0[unicos[u] * 3 + e];
const viz = Array.from({ length: M }, () => new Map());
for (let t = 0; t < IDX.length; t += 3) {
  const tri = [sold[IDX[t]], sold[IDX[t + 1]], sold[IDX[t + 2]]];
  for (let e = 0; e < 3; e++) {
    const a = tri[e], b = tri[(e + 1) % 3];
    if (a === b || viz[a].has(b)) continue;
    const d = Math.hypot(PX(a, 0) - PX(b, 0), PX(a, 1) - PX(b, 1), PX(a, 2) - PX(b, 2));
    viz[a].set(b, d); viz[b].set(a, d);
  }
}

// ---------------------------------------------------------------- os ossos e os segmentos
const ossos = cfg.ossos, B = ossos.length;
const porNome = new Map(ossos.map((o, i) => [o.nome, i]));
for (const o of ossos) if (o.pai && !porNome.has(o.pai)) throw new Error(`osso ${o.nome}: pai ${o.pai} não existe`);
const filhos = ossos.map((o) => ossos.filter((f) => f.pai === o.nome));
const regiao = ossos.map((o) => !!o.regiao);
const segmento = ossos.map((o, i) => {
  if (o.ponta) return [o.de, o.ponta];
  if (o.regiao) return [o.de, o.de];
  if (filhos[i].length === 1) return [o.de, filhos[i][0].de];
  throw new Error(`osso ${o.nome}: sem "ponta" e com ${filhos[i].length} filhos — diga onde ele acaba`);
});
function distSeg(u, [a, b]) {
  const px = PX(u, 0), py = PX(u, 1), pz = PX(u, 2);
  const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
  const t = Math.max(0, Math.min(1, ((px - a[0]) * abx + (py - a[1]) * aby + (pz - a[2]) * abz) / (abx * abx + aby * aby + abz * abz || 1)));
  return Math.hypot(px - a[0] - abx * t, py - a[1] - aby * t, pz - a[2] - abz * t);
}

// ---------------------------------------------------------------- 2. as sementes
const D = new Float64Array(M).fill(Infinity), dono = new Int32Array(M).fill(-1);
const dist = ossos.map((_, b) => { const d = new Float64Array(M); for (let u = 0; u < M; u++) d[u] = distSeg(u, segmento[b]); return d; });
for (let b = 0; b < B; b++) {
  if (regiao[b]) continue;   // (o osso de região não semeia: entra no passo 5)
  let menor = Infinity; for (let u = 0; u < M; u++) menor = Math.min(menor, dist[b][u]);
  const limite = Math.max(menor * 1.25 + 0.008, ossos[b].raio ?? 0);
  for (let u = 0; u < M; u++) if (dist[b][u] <= limite && dist[b][u] < D[u]) { D[u] = dist[b][u]; dono[u] = b; }
}

// ---------------------------------------------------------------- 3. Dijkstra pela pele (heap binário)
const heap = [];
const sobe = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
const desce = (i) => { for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } };
const por = (d, u) => { heap.push([d, u]); sobe(heap.length - 1); };
const tira = () => { const t = heap[0], f = heap.pop(); if (heap.length) { heap[0] = f; desce(0); } return t; };
for (let u = 0; u < M; u++) if (dono[u] >= 0) por(D[u], u);
while (heap.length) {
  const [d, u] = tira();
  if (d > D[u]) continue;
  for (const [v, w] of viz[u]) if (d + w < D[v]) { D[v] = d + w; dono[v] = dono[u]; por(D[v], v); }
}
// (pedaço solto da malha, sem caminho até semente nenhuma: o osso mais perto pelo ar)
for (let u = 0; u < M; u++) if (dono[u] < 0) { let m = -1; for (let b = 0; b < B; b++) if (!regiao[b] && (m < 0 || dist[b][u] < dist[m][u])) m = b; dono[u] = m; }

// ---------------------------------------------------------------- 4. suavizar
let W = new Float32Array(M * B);
for (let u = 0; u < M; u++) W[u * B + dono[u]] = 1;
for (let it = 0; it < (cfg.suavizar ?? 10); it++) {
  const nw = new Float32Array(M * B);
  for (let u = 0; u < M; u++) {
    const k = viz[u].size, base = u * B;
    for (let b = 0; b < B; b++) nw[base + b] = W[base + b] * 0.5;
    if (!k) { for (let b = 0; b < B; b++) nw[base + b] = W[base + b]; continue; }
    for (const v of viz[u].keys()) { const vb = v * B; for (let b = 0; b < B; b++) nw[base + b] += W[vb + b] * 0.5 / k; }
  }
  W = nw;
}

// ---------------------------------------------------------------- 5. os ossos de região (a boca)
const suave = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
// (a CÁPSULA — `capsula: true`, a MANDÍBULA, 25/11/2026: a pele a menos de `raio` (um número) do segmento de → ponta, da
// articulação ao queixo; cheia por dentro, caindo até a borda. Em ordem: depois da boca, leva junto a parte da boca que cai nela —
// o lábio de baixo)
ossos.forEach((o, b) => {
  if (!o.regiao) return;
  const R = o.regiao.raio, [rx, ry, rz] = Array.isArray(R) ? R : [R, R, R], [cx0, cy0, cz0] = o.de;
  const capsula = o.regiao.capsula ? [o.de, o.ponta ?? o.de] : null;
  const so = new Set((o.regiao.so ?? []).map((n) => porNome.get(n)));
  for (let u = 0; u < M; u++) {
    if (so.size && !so.has(dono[u])) continue;
    const dx = (PX(u, 0) - cx0) / rx, dy = (PX(u, 1) - cy0) / ry, dz = (PX(u, 2) - cz0) / rz;
    const e = capsula ? distSeg(u, capsula) / rx : Math.hypot(dx, dy, dz);
    let w = 1 - suave((e - 0.55) / 0.45);   // (cheio até a borda dos lábios, caindo do lado de fora)
    if (o.regiao.frente && !capsula) w *= suave((dz + 0.5) / 0.5);   // (atrás do centro some: a nuca não fecha junto)
    if (w <= 0.01) continue;
    const base = u * B;
    for (let k = 0; k < B; k++) W[base + k] *= 1 - w;
    W[base + b] += w;
  }
});

// ---------------------------------------------------------------- 6. os 4 maiores, somando 1
const JNT = new Uint8Array(N * 4), WGT = new Float32Array(N * 4);
const contagem = new Array(B).fill(0);
for (let i = 0; i < N; i++) {
  const u = sold[i], base = u * B;
  const ordem = [...Array(B).keys()].sort((a, b) => W[base + b] - W[base + a]).slice(0, 4);
  let soma = 0; for (const b of ordem) soma += W[base + b];
  ordem.forEach((b, k) => { JNT[i * 4 + k] = b; WGT[i * 4 + k] = soma > 0 ? W[base + b] / soma : (k === 0 ? 1 : 0); });
  contagem[ordem[0]]++;
}

// ---------------------------------------------------------------- o .glb novo
const POS = new Float32Array(N * 3);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < N; i++) {
  const p = noMundo([P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]]);
  for (let e = 0; e < 3; e++) { POS[i * 3 + e] = p[e]; min[e] = Math.min(min[e], p[e]); max[e] = Math.max(max[e], p[e]); }
}
const mundo = ossos.map((o) => noMundo(o.de));
const IBM = new Float32Array(B * 16);
mundo.forEach(([x, y, z], b) => { const m = IBM.subarray(b * 16, b * 16 + 16); m[0] = m[5] = m[10] = m[15] = 1; m[12] = -x; m[13] = -y; m[14] = -z; });

const pedacos = []; let off = 0;
const views = [], accessors = [];
function poe(dado, alvo) {
  const pad = (4 - (off % 4)) % 4; if (pad) { pedacos.push(Buffer.alloc(pad)); off += pad; }
  const b = Buffer.from(dado.buffer, dado.byteOffset, dado.byteLength);
  views.push({ buffer: 0, byteOffset: off, byteLength: b.length, ...(alvo ? { target: alvo } : {}) });
  pedacos.push(b); off += b.length;
  return views.length - 1;
}
function acessor(dado, tipo, compType, extra = {}) {
  const v = poe(dado, extra.alvo); delete extra.alvo;
  accessors.push({ bufferView: v, componentType: compType, count: dado.length / LARG[tipo], type: tipo, ...extra });
  return accessors.length - 1;
}
const indices = IDX instanceof Uint32Array ? IDX : new Uint32Array(IDX);
const aIdx = acessor(indices, 'SCALAR', 5125, { alvo: 34963 });
const aPos = acessor(POS, 'VEC3', 5126, { alvo: 34962, min, max });
const aNrm = acessor(NRM, 'VEC3', 5126, { alvo: 34962 });
const aUv = acessor(UV, 'VEC2', 5126, { alvo: 34962 });
const aJnt = acessor(JNT, 'VEC4', 5121, { alvo: 34962 });
const aWgt = acessor(WGT, 'VEC4', 5126, { alvo: 34962 });
const aIbm = acessor(IBM, 'MAT4', 5126);
// a imagem da textura (do jeito que veio; o enxugar-glb a reduz depois)
const imagens = (J.images ?? []).map((im) => {
  const v = J.bufferViews[im.bufferView];
  const dado = new Uint8Array(BIN.buffer, BIN.byteOffset + (v.byteOffset ?? 0), v.byteLength);
  return { mimeType: im.mimeType, bufferView: poe(dado) };
});

// os nós: 0 = a malha; 1.. = os ossos (a translação é relativa ao pai; a pose de ligação não gira nada)
const nos = [{ name: cfg.nome ?? path.basename(saida, '.glb'), mesh: 0, skin: 0 }];
ossos.forEach((o, b) => {
  const pai = o.pai ? mundo[porNome.get(o.pai)] : [0, 0, 0];
  // (a PONTA vai junto, em metros no espaço da malha — `extras` vira o `userData` do osso no three: o corpo a usa, ex.: a mandíbula
  // de baixo fecha até o queixo apontar para a ponta da de cima)
  nos.push({ name: o.nome, translation: mundo[b].map((v, e) => v - pai[e]), ...(o.ponta ? { extras: { ponta: noMundo(o.ponta).map((v) => Math.round(v * 1e4) / 1e4) } } : {}) });
});
ossos.forEach((o, b) => { const f = filhos[b].map((x) => 1 + porNome.get(x.nome)); if (f.length) nos[1 + b].children = f; });
const raizes = ossos.map((o, b) => (o.pai ? null : 1 + b)).filter((x) => x !== null);

const binNovo = Buffer.concat(pedacos);
const json = {
  asset: { version: '2.0', generator: 'ferramentas/chefe-de-arquivo/rigar.mjs' },
  scene: 0, scenes: [{ nodes: [0, ...raizes] }],
  nodes: nos,
  meshes: [{ name: 'corpo', primitives: [{ attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUv, JOINTS_0: aJnt, WEIGHTS_0: aWgt }, indices: aIdx, material: 0, mode: 4 }] }],
  skins: [{ joints: ossos.map((_, b) => 1 + b), inverseBindMatrices: aIbm, skeleton: raizes[0] }],
  materials: J.materials, textures: J.textures, images: imagens, samplers: J.samplers,
  accessors, bufferViews: views, buffers: [{ byteLength: binNovo.length }],
};
for (const k of ['textures', 'images', 'samplers']) if (!json[k]?.length) delete json[k];

let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
const bp = Buffer.concat([binNovo, Buffer.alloc((4 - (binNovo.length % 4)) % 4)]);
const cab = Buffer.alloc(12); cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + js.length + 8 + bp.length, 8);
const cj = Buffer.alloc(8); cj.writeUInt32LE(js.length, 0); cj.writeUInt32LE(0x4e4f534a, 4);
const cb = Buffer.alloc(8); cb.writeUInt32LE(bp.length, 0); cb.writeUInt32LE(0x004e4942, 4);
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, Buffer.concat([cab, cj, js, cb, bp]));

console.log(`${path.relative(RAIZ, saida)}: ${N} vértices (${M} soldados), ${B} ossos, ${cfg.altura} m (escala ${ESC.toFixed(3)})`);
console.log('vértices por osso (o peso maior):', ossos.map((o, b) => `${o.nome} ${contagem[b]}`).join(', '));
// as JUNTAS EM METROS (o modelo olhando para +Z, os pés no chão): o que a ficha copia (as bocas, os pés)
const m2 = (v) => v.map((x) => Math.round(x * 100) / 100);
console.log('juntas em metros (de → ponta):', JSON.stringify(Object.fromEntries(ossos.map((o, b) => [o.nome, o.ponta ? [m2(mundo[b]), m2(noMundo(o.ponta))] : m2(mundo[b])]))));
const vazios = ossos.filter((_, b) => !contagem[b]).map((o) => o.nome);
if (vazios.length) console.warn('AVISO: ossos sem vértice nenhum (confira a junta):', vazios.join(', '));

// a FICHA (`ficha` no config: o tipo em js/inimigos/tipos.js): as `bocas` (a junta `boca<k>` + `frenteDaBoca` m em +Z: o cuspe
// nasce na frente da bocarra) e os `pes` ([x, z] da junta `pe<k>`) medidos agora entram no lugar dos de lá, linha a linha —
// moveu uma junta (aba Esqueleto do editor), o cuspe e o pisão saem do lugar novo
if (cfg.ficha) {
  const arq = path.join(RAIZ, 'js/inimigos/tipos.js');
  const txt = fs.readFileSync(arq, 'utf8'), ini = txt.indexOf(`ENEMY_TYPES.${cfg.ficha} = {`), fim = ini < 0 ? -1 : txt.indexOf('\n};', ini);
  const deNome = (re) => ossos.map((o, b) => [re.exec(o.nome), b]).filter(([m]) => m).sort((a, b) => a[0][1] - b[0][1]).map(([, b]) => mundo[b]);
  const bocas = deNome(/^boca(\d+)$/).map(([x, y, z]) => m2([x, y, z + (cfg.frenteDaBoca ?? 0)]));
  const pes = deNome(/^pe(\d+)$/).map(([x, , z]) => m2([x, z]));
  const lista = (l) => JSON.stringify(l).replace(/,/g, ', ');
  let bloco = fim < 0 ? '' : txt.slice(ini, fim);
  const troca = (campo, l) => { const re = new RegExp(`^(\\s*${campo}:\\s*)\\[.*\\],?\\s*$`, 'm'); if (!l.length || !re.test(bloco)) return false; bloco = bloco.replace(re, `$1${lista(l)},`); return true; };
  const ok = [troca('bocas', bocas), troca('pes', pes)];
  if (fim < 0 || !ok.every(Boolean)) console.warn(`AVISO: não achei ${fim < 0 ? `a ficha ENEMY_TYPES.${cfg.ficha}` : 'as linhas bocas:/pes:'} em js/inimigos/tipos.js — a ficha ficou como estava`);
  else {
    const novo = txt.slice(0, ini) + bloco + txt.slice(fim);
    if (novo !== txt) fs.writeFileSync(arq, novo);
    console.log(`ficha ${cfg.ficha} (js/inimigos/tipos.js)${novo === txt ? ', igual' : ''}: bocas ${lista(bocas)}, pes ${lista(pes)}`);
  }
}

// a textura: reduzida e em JPEG
if (cfg.textura) execFileSync(process.execPath, [path.join(RAIZ, 'ferramentas/enxugar-glb.mjs'), `--max=${cfg.textura}`, '--jpeg', saida], { stdio: 'inherit' });
