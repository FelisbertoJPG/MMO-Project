// rasterizador simples: prancha de vistas de uma malha (pos, idx, cor por triângulo opcional)
import fs from 'fs'; import zlib from 'zlib';
const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = (buf) => { let x = 0xffffffff; for (const v of buf) x = crcT[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
export function png(arq, W, H, img) {
  const raw = Buffer.alloc((W * 3 + 1) * H); for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(img.buffer, img.byteOffset + y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  fs.writeFileSync(arq, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
// vistas: [{ giro (graus em volta de y), centro [x,y], escala px/unidade }]
export function prancha(arq, pos, idx, { vistas, W = 400, H = 560, cores = null, pontos = [] }) {
  const T = vistas.length, img = new Uint8Array(W * T * H * 3).fill(40);
  vistas.forEach((v, n) => {
    const zb = new Float32Array(W * H).fill(-1e9), a = v.giro * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    const pr = (x, y, z) => { const u = x * c + z * s, d = -x * s + z * c; return [W / 2 + (u - v.centro[0]) * v.escala, H / 2 - (y - v.centro[1]) * v.escala, d]; };
    const L = [0.35, 0.55, 0.75];
    for (let t = 0; t < idx.length; t += 3) {
      const P = [0, 1, 2].map((k) => [pos[3 * idx[t + k]], pos[3 * idx[t + k] + 1], pos[3 * idx[t + k] + 2]]);
      const e1 = P[1].map((q, k) => q - P[0][k]), e2 = P[2].map((q, k) => q - P[0][k]);
      let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0]; const l = Math.hypot(nx, ny, nz) || 1;
      // normal na vista
      const nu = nx * c + nz * s, nd = -nx * s + nz * c;
      const sh = Math.max(0.18, (nu / l) * L[0] + (ny / l) * L[1] + (nd / l) * L[2]);
      const q = P.map((p) => pr(...p));
      const ar = (q[1][0] - q[0][0]) * (q[2][1] - q[0][1]) - (q[1][1] - q[0][1]) * (q[2][0] - q[0][0]); if (Math.abs(ar) < 1e-9) continue;
      const cor = cores ? cores[t / 3] : [235, 232, 225];
      const x0 = Math.max(0, Math.floor(Math.min(q[0][0], q[1][0], q[2][0]))), x1 = Math.min(W - 1, Math.ceil(Math.max(q[0][0], q[1][0], q[2][0])));
      const y0 = Math.max(0, Math.floor(Math.min(q[0][1], q[1][1], q[2][1]))), y1 = Math.min(H - 1, Math.ceil(Math.max(q[0][1], q[1][1], q[2][1])));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const w0 = ((q[1][0] - x) * (q[2][1] - y) - (q[1][1] - y) * (q[2][0] - x)) / ar, w1 = ((q[2][0] - x) * (q[0][1] - y) - (q[2][1] - y) * (q[0][0] - x)) / ar, w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * q[0][2] + w1 * q[1][2] + w2 * q[2][2], k = y * W + x;
        if (z > zb[k]) { zb[k] = z; const o = (y * W * T + n * W + x) * 3; img[o] = cor[0] * sh; img[o + 1] = cor[1] * sh; img[o + 2] = cor[2] * sh; }
      }
    }
    for (const [p, cor] of pontos) { const q = pr(...p); for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = Math.round(q[0]) + dx, y = Math.round(q[1]) + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const o = (y * W * T + n * W + x) * 3; img[o] = cor[0]; img[o + 1] = cor[1]; img[o + 2] = cor[2]; } }
  });
  png(arq, W * T, H, img);
}
