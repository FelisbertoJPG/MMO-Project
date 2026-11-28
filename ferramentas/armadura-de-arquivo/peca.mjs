// A PEÇA PRONTA (.glb da Meshy) ANTES DE VESTIR (28/11/2026; o dono, na aba Armaduras: "remover malha… essas malhas podem literalmente ser
// deletadas", "adornos… remove eles", e: "remove qualquer malha muito pequena (unifica com as maiores próximas) — o modelo da armadura tá
// com malhas muito pequenas espalhadas — e espelha ela"). Os passos, na ordem, pelo config do vestir.mjs:
//   apagar   = o meio (cm, a peça como abre no editor: o .glb × 100, o pé em y = 0) de cada triângulo que sai;
//   limpar   = { aresta, area }: o triângulo com uma aresta menor que `aresta` cm (ou área menor que `area` cm²) some, a aresta mais curta
//              vira um ponto (o meio dela) e os vizinhos maiores o absorvem — só nos pedaços grandes (as fivelas ficam como são);
//   espelhar = '+x' ou '-x': fica esse lado, o outro é a cópia espelhada (o que cruzava o meio vai para x = 0, a costura soldada).
// O vestir.mjs veste o resultado (`prepararPeca`); a peça SOLTA do editor é o mesmo resultado gravado num .glb:
//   node ferramentas/armadura-de-arquivo/peca.mjs <config> <saida.glb>
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/** O .glb (a malha, em cm): { pos, idx }. */
export function lerGlb(arq) {
  const buf = fs.readFileSync(arq), jl = buf.readUInt32LE(12), J = JSON.parse(buf.slice(20, 20 + jl).toString()), BIN = buf.slice(20 + jl + 8);
  const acc = (i) => {
    const a = J.accessors[i], v = J.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[a.componentType], off = (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return new T(BIN.buffer.slice(BIN.byteOffset + off, BIN.byteOffset + off + a.count * n * T.BYTES_PER_ELEMENT));
  };
  const pos = [], idx = [];
  for (const no of J.nodes) {
    if (no.mesh === undefined) continue;
    if (no.matrix || no.rotation || no.scale || no.translation) throw new Error('o nó da malha tem transformação: esta ferramenta não a aplica');
    for (const p of J.meshes[no.mesh].primitives) {
      const P = acc(p.attributes.POSITION), base = pos.length / 3;
      for (const v of P) pos.push(v * 100);   // (m → cm)
      const I = p.indices !== undefined ? acc(p.indices) : Array.from({ length: P.length / 3 }, (_, k) => k);
      for (const i of I) idx.push(base + i);
    }
  }
  return { pos: new Float32Array(pos), idx: Uint32Array.from(idx) };
}

/** Grava { pos (cm), idx } num .glb (em metros): só a posição e os triângulos. */
export function gravarGlb(arq, { pos, idx }) {
  const P = Float32Array.from(pos, (x) => x / 100), mn = [0, 1, 2].map((k) => Math.min(...P.filter((_, i) => i % 3 === k))), mx = [0, 1, 2].map((k) => Math.max(...P.filter((_, i) => i % 3 === k)));
  const bi = Buffer.from(Uint32Array.from(idx).buffer), bp = Buffer.from(P.buffer);
  const J = { asset: { version: '2.0', generator: 'ferramentas/armadura-de-arquivo/peca.mjs' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'peca', mesh: 0 }], meshes: [{ name: 'peca', primitives: [{ attributes: { POSITION: 1 }, indices: 0, mode: 4 }] }],
    accessors: [{ componentType: 5125, type: 'SCALAR', bufferView: 0, count: idx.length, min: [0], max: [P.length / 3 - 1] }, { componentType: 5126, type: 'VEC3', bufferView: 1, count: P.length / 3, min: mn, max: mx }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bi.length }, { buffer: 0, byteOffset: bi.length, byteLength: bp.length }], buffers: [{ byteLength: bi.length + bp.length }] };
  let js = Buffer.from(JSON.stringify(J)); while (js.length % 4) js = Buffer.concat([js, Buffer.from(' ')]);
  let bin = Buffer.concat([bi, bp]); while (bin.length % 4) bin = Buffer.concat([bin, Buffer.alloc(1)]);
  const cab = Buffer.alloc(12); cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const cj = Buffer.alloc(8); cj.writeUInt32LE(js.length, 0); cj.writeUInt32LE(0x4e4f534a, 4);
  const cb = Buffer.alloc(8); cb.writeUInt32LE(bin.length, 0); cb.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(arq, Buffer.concat([cab, cj, js, cb, bin]));
}

// (os pontos que sobram sem triângulo saem; os de mesma posição viram um — a costura soldada)
function compactar(pos, tris) {
  const porLugar = new Map(), novo = new Map(), P = [], I = [];
  for (const t of tris) for (const v of t) {
    if (novo.has(v)) { I.push(novo.get(v)); continue; }
    const k = `${pos[v * 3].toFixed(3)},${pos[v * 3 + 1].toFixed(3)},${pos[v * 3 + 2].toFixed(3)}`;
    if (!porLugar.has(k)) { porLugar.set(k, P.length / 3); P.push(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]); }
    novo.set(v, porLugar.get(k)); I.push(novo.get(v));
  }
  const idx = [];
  for (let t = 0; t < I.length; t += 3) if (I[t] !== I[t + 1] && I[t + 1] !== I[t + 2] && I[t] !== I[t + 2]) idx.push(I[t], I[t + 1], I[t + 2]);
  return { pos: Float32Array.from(P), idx: Uint32Array.from(idx) };
}
const triangulos = (idx) => Array.from({ length: idx.length / 3 }, (_, t) => [idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]]);

/** APAGAR: os triângulos com o meio num dos `marcas` (até 0,02 cm). */
export function apagarTriangulos({ pos, idx }, marcas, log = () => {}) {
  let pe = Infinity; for (let i = 1; i < pos.length; i += 3) pe = Math.min(pe, pos[i]);
  const m = marcas.filter((x) => Array.isArray(x) && x.length === 3 && x.every(Number.isFinite)), fica = [];
  let saiu = 0;
  for (const t of triangulos(idx)) {
    const c = [0, 1, 2].map((k) => (pos[t[0] * 3 + k] + pos[t[1] * 3 + k] + pos[t[2] * 3 + k]) / 3 - (k === 1 ? pe : 0));
    if (m.some((x) => Math.abs(x[0] - c[0]) < 0.02 && Math.abs(x[1] - c[1]) < 0.02 && Math.abs(x[2] - c[2]) < 0.02)) saiu++; else fica.push(t);
  }
  log(`apagar: ${saiu} de ${m.length} triângulos marcados saíram da peça (ficam ${fica.length})`);
  return compactar(pos, fica);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], comp = (a) => Math.hypot(a[0], a[1], a[2]);

/** LIMPAR: as arestas curtas (e as dos triângulos minúsculos) viram um ponto — sem virar nenhum vizinho do avesso; só nos pedaços grandes. */
export function juntarPequenos({ pos, idx }, { aresta = 1, area = 0.3 } = {}, log = () => {}) {
  const P = Array.from({ length: pos.length / 3 }, (_, v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]), T = triangulos(idx), vivo = T.map(() => true);
  // os pedaços (pela ligação dos triângulos): os grandes, a partir de 5% do maior
  const pai = P.map((_, i) => i), raiz = (x) => { while (pai[x] !== x) x = pai[x] = pai[pai[x]]; return x; };
  for (const [a, b, c] of T) { pai[raiz(b)] = raiz(a); pai[raiz(c)] = raiz(a); }
  const tam = new Map(); for (const [a] of T) tam.set(raiz(a), (tam.get(raiz(a)) ?? 0) + 1);
  const maior = Math.max(...tam.values()), grande = T.map(([a]) => tam.get(raiz(a)) >= 0.05 * maior);
  const normal = (t, troca = null) => { const q = t.map((v) => (troca && (v === troca[0] || v === troca[1]) ? troca[2] : P[v])); return cruz(sub(q[1], q[0]), sub(q[2], q[0])); };
  const travadas = new Set(), chave = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  let juntas = 0;
  for (let volta = 0; volta < 20000; volta++) {
    let melhor = null;
    T.forEach((t, i) => {
      if (!vivo[i] || !grande[i]) return;
      const ar = [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]].map(([a, b]) => ({ a, b, l: comp(sub(P[a], P[b])) })).filter((e) => !travadas.has(chave(e.a, e.b))).sort((x, y) => x.l - y.l);
      if (!ar.length) return;
      const pequeno = ar[0].l < aresta || comp(normal(t)) / 2 < area;
      if (pequeno && (!melhor || ar[0].l < melhor.l)) melhor = ar[0];
    });
    if (!melhor) break;
    const { a, b } = melhor, m = P[a].map((x, k) => (x + P[b][k]) / 2);
    // (nenhum vizinho vira do avesso: a normal de cada triângulo em volta continua para o mesmo lado)
    const ok = T.every((t, i) => {
      if (!vivo[i] || (!t.includes(a) && !t.includes(b)) || (t.includes(a) && t.includes(b))) return true;
      const n0 = normal(t), n1 = normal(t, [a, b, m]), l0 = comp(n0), l1 = comp(n1);
      return l0 < 1e-9 || (l1 > 1e-9 && dot(n0, n1) / (l0 * l1) > 0.2);
    });
    if (!ok) { travadas.add(chave(a, b)); continue; }
    P[a] = m;
    T.forEach((t, i) => { if (!vivo[i]) return; if (t.includes(a) && t.includes(b)) { vivo[i] = false; return; } for (let k = 0; k < 3; k++) if (t[k] === b) t[k] = a; });
    juntas++;
  }
  const fica = T.filter((_, i) => vivo[i]), flat = new Float32Array(P.length * 3);
  P.forEach((p, v) => flat.set(p, v * 3));
  log(`limpar: ${juntas} arestas curtas viraram um ponto (menor que ${aresta} cm ou triângulo abaixo de ${area} cm²); ficam ${fica.length} triângulos`);
  return compactar(flat, fica);
}

/** ESPELHAR: fica o lado `lado` (1 = +x), o outro é a cópia espelhada; o ponto do outro lado vai para x = 0 (a costura, soldada). */
export function espelharPeca({ pos, idx }, lado = 1, log = () => {}) {
  const P = [], I = [], novo = new Map();
  const ponto = (v) => {
    if (!novo.has(v)) { let x = pos[v * 3]; if (x * lado < 0.05) x = 0; novo.set(v, P.length / 3); P.push(x, pos[v * 3 + 1], pos[v * 3 + 2]); }
    return novo.get(v);
  };
  // (fica todo triângulo com algum ponto deste lado — o ponto do outro vai para x = 0: a metade continua inteira, sem vão no meio)
  for (const t of triangulos(idx)) if (t.some((v) => pos[v * 3] * lado > 0.05)) I.push(...t.map(ponto));
  const n = P.length / 3, par = new Int32Array(n);
  for (let v = 0; v < n; v++) { if (P[v * 3] === 0) par[v] = v; else { par[v] = P.length / 3; P.push(-P[v * 3], P[v * 3 + 1], P[v * 3 + 2]); } }
  const metade = I.length;
  for (let t = 0; t < metade; t += 3) {
    if (P[I[t] * 3] === 0 && P[I[t + 1] * 3] === 0 && P[I[t + 2] * 3] === 0) continue;   // (deitado no meio: um só)
    I.push(par[I[t]], par[I[t + 2]], par[I[t + 1]]);   // (a volta trocada: a face continua para fora)
  }
  log(`espelhar: o lado ${lado > 0 ? '+x' : '-x'} ficou e o outro é a cópia dele (${metade / 3} → ${I.length / 3} triângulos)`);
  return compactar(Float32Array.from(P), triangulos(I));
}

/** A peça do config: o .glb dele, com o apagar, o limpar e o espelhar do config, nessa ordem. */
export function prepararPeca(cfg, dirCfg, log = () => {}) {
  let peca = lerGlb(path.join(dirCfg, cfg.glb));
  if (Array.isArray(cfg.apagar) && cfg.apagar.length) peca = apagarTriangulos(peca, cfg.apagar, log);
  if (cfg.limpar) peca = juntarPequenos(peca, cfg.limpar, log);
  if (cfg.espelhar) peca = espelharPeca(peca, cfg.espelhar === '-x' ? -1 : 1, log);
  return peca;
}

// (sozinho: grava a peça preparada num .glb — a peça SOLTA do editor)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [arqCfg, saida] = process.argv.slice(2);
  if (!arqCfg || !saida) { console.log('uso: node ferramentas/armadura-de-arquivo/peca.mjs <config.json> <saida.glb>'); process.exit(1); }
  const cfg = JSON.parse(fs.readFileSync(arqCfg, 'utf8')), peca = prepararPeca(cfg, path.dirname(path.resolve(arqCfg)), console.log);
  gravarGlb(saida, peca);
  console.log(`gravado ${saida}: ${peca.pos.length / 3} pontos, ${peca.idx.length / 3} triângulos`);
}
