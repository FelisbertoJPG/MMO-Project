// lê e grava PNG de 8 bits sem entrelaçamento (RGB ou RGBA) — só o necessário
import fs from 'node:fs';
import zlib from 'node:zlib';
const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
const crc = (buf) => { let x = 0xffffffff; for (const v of buf) x = crcT[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
export function ler(arq) {
  const b = fs.readFileSync(arq);
  let p = 8, W, H, prof, tipo, entre; const dados = [];
  while (p < b.length) {
    const n = b.readUInt32BE(p), t = b.toString('latin1', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + n);
    if (t === 'IHDR') { W = d.readUInt32BE(0); H = d.readUInt32BE(4); prof = d[8]; tipo = d[9]; entre = d[12]; }
    if (t === 'IDAT') dados.push(d);
    p += 12 + n;
  }
  if (prof !== 8 || ![2, 6].includes(tipo) || entre) throw new Error(`PNG fora do esperado: prof ${prof} tipo ${tipo} entrelaçado ${entre}`);
  const bpp = tipo === 6 ? 4 : 3, raw = zlib.inflateSync(Buffer.concat(dados)), lin = W * bpp, px = new Uint8Array(H * lin);
  for (let y = 0; y < H; y++) {
    const f = raw[y * (lin + 1)], o = y * (lin + 1) + 1;
    for (let x = 0; x < lin; x++) {
      const a = x >= bpp ? px[y * lin + x - bpp] : 0, c = y ? px[(y - 1) * lin + x] : 0, ac = y && x >= bpp ? px[(y - 1) * lin + x - bpp] : 0;
      let v = raw[o + x];
      if (f === 1) v += a; else if (f === 2) v += c; else if (f === 3) v += (a + c) >> 1;
      else if (f === 4) { const q = a + c - ac, pa = Math.abs(q - a), pb = Math.abs(q - c), pc = Math.abs(q - ac); v += pa <= pb && pa <= pc ? a : pb <= pc ? c : ac; }
      px[y * lin + x] = v & 255;
    }
  }
  return { W, H, bpp, px };
}
export function gravar(arq, { W, H, bpp, px }) {
  const lin = W * bpp, raw = Buffer.alloc((lin + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (lin + 1)] = 0; Buffer.from(px.buffer, px.byteOffset + y * lin, lin).copy(raw, y * (lin + 1) + 1); }
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t, 'latin1'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = bpp === 4 ? 6 : 2;
  fs.writeFileSync(arq, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}
