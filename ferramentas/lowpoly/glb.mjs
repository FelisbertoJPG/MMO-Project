// Ler e escrever .glb sem biblioteca: o que as ferramentas desta pasta precisam.
import fs from 'node:fs';

/** A caixa `[largura, altura, fundo]` de um .glb (com os giros e escalas dos nós). */
export function caixaDoGlb(arq) {
  const b = fs.readFileSync(arq), j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString('utf8'));
  const vezes = (a, m) => { const o = new Array(16); for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) o[k * 4 + i] = a[i] * m[k * 4] + a[4 + i] * m[k * 4 + 1] + a[8 + i] * m[k * 4 + 2] + a[12 + i] * m[k * 4 + 3]; return o; };
  const local = (n) => {
    if (n.matrix) return n.matrix;
    const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0];
    return [(1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
      2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
      2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0, tx, ty, tz, 1];
  };
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const anda = (i, pai) => {
    const n = j.nodes[i], m = vezes(pai, local(n));
    for (const p of n.mesh === undefined ? [] : j.meshes[n.mesh].primitives) {
      const a = j.accessors[p.attributes.POSITION];
      for (let q = 0; q < 8; q++) {
        const v = [q & 1 ? a.max[0] : a.min[0], q & 2 ? a.max[1] : a.min[1], q & 4 ? a.max[2] : a.min[2]];
        for (let e = 0; e < 3; e++) { const w = m[e] * v[0] + m[4 + e] * v[1] + m[8 + e] * v[2] + m[12 + e]; min[e] = Math.min(min[e], w); max[e] = Math.max(max[e], w); }
      }
    }
    for (const f of n.children ?? []) anda(f, m);
  };
  for (const i of j.scenes[j.scene ?? 0].nodes) anda(i, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  return [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
}

/**
 * Grava um .glb de UMA malha sem índices nem textura: `pos`, `normal` e `cor` (linear) são listas
 * de números, três por vértice, três vértices por triângulo. Um material só, a cor nos vértices.
 */
export function gravarGlb(arq, nome, { pos, normal, cor }) {
  const n = pos.length / 3, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i++) { min[i % 3] = Math.min(min[i % 3], pos[i]); max[i % 3] = Math.max(max[i % 3], pos[i]); }
  const bin = Buffer.from(new Float32Array([...pos, ...normal, ...cor]).buffer), parte = n * 12;
  const json = {
    asset: { version: '2.0', generator: 'ferramentas/lowpoly' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: nome }],
    meshes: [{ name: nome, primitives: [{ attributes: { POSITION: 0, NORMAL: 1, COLOR_0: 2 }, material: 0 }] }],
    materials: [{ name: nome, pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 } }],
    accessors: [0, 1, 2].map((i) => ({ bufferView: i, componentType: 5126, count: n, type: 'VEC3', ...(i ? {} : { min, max }) })),
    bufferViews: [0, 1, 2].map((i) => ({ buffer: 0, byteOffset: i * parte, byteLength: parte, target: 34962 })),
    buffers: [{ byteLength: bin.length }],
  };
  let texto = Buffer.from(JSON.stringify(json));
  texto = Buffer.concat([texto, Buffer.alloc((4 - texto.length % 4) % 4, 0x20)]);
  const cab = Buffer.alloc(12), c1 = Buffer.alloc(8), c2 = Buffer.alloc(8);
  cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(28 + texto.length + bin.length, 8);
  c1.writeUInt32LE(texto.length, 0); c1.writeUInt32LE(0x4e4f534a, 4);
  c2.writeUInt32LE(bin.length, 0); c2.writeUInt32LE(0x004e4942, 4);
  fs.writeFileSync(arq, Buffer.concat([cab, c1, texto, c2, bin]));
}
