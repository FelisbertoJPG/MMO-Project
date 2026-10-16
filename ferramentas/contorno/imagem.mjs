// LER E GRAVAR IMAGENS sem dependência nenhuma (o projeto não tem pacotes npm).
//  - `lerJpeg(buffer)`: o JPEG "baseline" (o que o WhatsApp, o celular e quase todo
//    programa gravam): Huffman, 8 bits, uma varredura com as cores entrelaçadas
//    (4:4:4, 4:2:2 ou 4:2:0) e marcas de recomeço. O JPEG "progressivo" não: avisa.
//  - `gravarPng(caminho, largura, altura, rgb)`: para conferir as silhuetas e os recortes.
// Uma imagem aqui é { largura, altura, rgb: Uint8Array (3 por ponto, linha a linha) }.
import fs from 'node:fs';
import zlib from 'node:zlib';

const ZIGUE = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
// cos((2x+1)uπ/16)·C(u)/2, para a transformada inversa (linha e coluna)
const COS = new Float32Array(64);
for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) COS[x * 8 + u] = (u === 0 ? Math.SQRT1_2 : 1) * Math.cos(((2 * x + 1) * u * Math.PI) / 16) / 2;

function tabelaHuffman(contagens, simbolos) {
  // o código canônico: por tamanho, o menor e o maior código e onde começam os símbolos
  const maior = new Int32Array(18).fill(-1), menor = new Int32Array(17), inicio = new Int32Array(17);
  let codigo = 0, k = 0;
  for (let t = 1; t <= 16; t++) {
    inicio[t] = k; menor[t] = codigo;
    codigo += contagens[t - 1]; k += contagens[t - 1];
    maior[t] = contagens[t - 1] ? codigo - 1 : -1;
    codigo <<= 1;
  }
  return { maior, menor, inicio, simbolos };
}

export function lerJpeg(buf) {
  const quant = [], dc = [], ac = [];
  let quadro = null, recomeco = 0, i = 2;
  if (buf[0] !== 0xFF || buf[1] !== 0xD8) throw new Error('não é JPEG');
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xD8 || m === 0x01 || m === 0xFF || (m >= 0xD0 && m <= 0xD7)) { i += m === 0xFF ? 1 : 2; continue; }
    if (m === 0xD9) break;
    const tam = buf.readUInt16BE(i + 2), seg = buf.subarray(i + 4, i + 2 + tam);
    if (m === 0xDB) {
      for (let p = 0; p < seg.length;) {
        const pq = seg[p] >> 4, tq = seg[p] & 15; p++;
        const q = new Int32Array(64);
        for (let k = 0; k < 64; k++) { q[k] = pq ? seg.readUInt16BE(p + k * 2) : seg[p + k]; }
        p += pq ? 128 : 64;
        quant[tq] = q;
      }
    } else if (m === 0xC0 || m === 0xC1) {
      quadro = { altura: seg.readUInt16BE(1), largura: seg.readUInt16BE(3), comps: [] };
      for (let c = 0; c < seg[5]; c++) quadro.comps.push({ id: seg[6 + c * 3], h: seg[7 + c * 3] >> 4, v: seg[7 + c * 3] & 15, tq: seg[8 + c * 3] });
    } else if (m === 0xC2 || m === 0xC3 || (m >= 0xC5 && m <= 0xCF && m !== 0xC8 && m !== 0xCC)) {
      throw new Error('JPEG progressivo/sem perda: não suportado (abra e salve de novo como JPEG comum ou PNG)');
    } else if (m === 0xC4) {
      for (let p = 0; p < seg.length;) {
        const classe = seg[p] >> 4, id = seg[p] & 15; p++;
        const cont = [...seg.subarray(p, p + 16)]; p += 16;
        const n = cont.reduce((a, b) => a + b, 0);
        const t = tabelaHuffman(cont, seg.subarray(p, p + n)); p += n;
        (classe ? ac : dc)[id] = t;
      }
    } else if (m === 0xDD) {
      recomeco = seg.readUInt16BE(0);
    } else if (m === 0xDA) {
      if (!quadro) throw new Error('JPEG sem quadro');
      const ns = seg[0];
      if (ns !== quadro.comps.length) throw new Error('JPEG com varreduras separadas: não suportado');
      for (let c = 0; c < ns; c++) {
        const comp = quadro.comps.find((x) => x.id === seg[1 + c * 2]);
        comp.dc = dc[seg[2 + c * 2] >> 4]; comp.ac = ac[seg[2 + c * 2] & 15];
      }
      i = decodificar(buf, i + 2 + tam, quadro, quant, recomeco);
      continue;
    }
    i += 2 + tam;
  }
  return montar(quadro);
}

function decodificar(buf, inicio, quadro, quant, recomeco) {
  let p = inicio, bits = 0, nbits = 0, fim = false;
  const bit = () => {
    if (nbits === 0) {
      if (fim) return 0;
      let b = buf[p];
      if (b === 0xFF) {
        const prox = buf[p + 1];
        if (prox === 0) p += 2;
        else { fim = true; return 0; }   // uma marca no meio: o resto vira zero
      } else p++;
      bits = b; nbits = 8;
    }
    nbits--;
    return (bits >> nbits) & 1;
  };
  const receber = (n) => { let v = 0; for (let k = 0; k < n; k++) v = (v << 1) | bit(); return v; };
  const estender = (v, n) => (n && v < 1 << (n - 1) ? v - (1 << n) + 1 : v);
  const simbolo = (t) => {
    let codigo = 0;
    for (let tam = 1; tam <= 16; tam++) {
      codigo = (codigo << 1) | bit();
      if (t.maior[tam] >= 0 && codigo <= t.maior[tam] && codigo >= t.menor[tam]) return t.simbolos[t.inicio[tam] + codigo - t.menor[tam]];
    }
    return 0;
  };
  const hmax = Math.max(...quadro.comps.map((c) => c.h)), vmax = Math.max(...quadro.comps.map((c) => c.v));
  const mcuX = Math.ceil(quadro.largura / (8 * hmax)), mcuY = Math.ceil(quadro.altura / (8 * vmax));
  for (const c of quadro.comps) {
    c.larg = mcuX * c.h * 8; c.alt = mcuY * c.v * 8;
    c.plano = new Uint8Array(c.larg * c.alt);
    c.pred = 0; c.q = quant[c.tq];
  }
  quadro.hmax = hmax; quadro.vmax = vmax;
  const coef = new Float32Array(64), tmp = new Float32Array(64);
  const bloco = (c, bx, by) => {
    coef.fill(0);
    const t = simbolo(c.dc);
    c.pred += t ? estender(receber(t), t) : 0;
    coef[0] = c.pred * c.q[0];
    for (let k = 1; k < 64;) {
      const rs = simbolo(c.ac), r = rs >> 4, s = rs & 15;
      if (s === 0) { if (r === 15) { k += 16; continue; } break; }
      k += r;
      if (k > 63) break;
      coef[ZIGUE[k]] = estender(receber(s), s) * c.q[k];
      k++;
    }
    // a transformada inversa, primeiro nas linhas e depois nas colunas
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      let s = 0; for (let u = 0; u < 8; u++) s += COS[x * 8 + u] * coef[y * 8 + u];
      tmp[y * 8 + x] = s;
    }
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) {
      let s = 0; for (let v = 0; v < 8; v++) s += COS[y * 8 + v] * tmp[v * 8 + x];
      const val = Math.round(s + 128);
      c.plano[(by * 8 + y) * c.larg + bx * 8 + x] = val < 0 ? 0 : val > 255 ? 255 : val;
    }
  };
  let n = 0;
  for (let my = 0; my < mcuY; my++) for (let mx = 0; mx < mcuX; mx++) {
    if (recomeco && n > 0 && n % recomeco === 0) {
      // a marca de recomeço: os bits que sobraram se jogam fora e a previsão zera
      nbits = 0; fim = false;
      while (p < buf.length && !(buf[p] === 0xFF && buf[p + 1] >= 0xD0 && buf[p + 1] <= 0xD7)) p++;
      p += 2;
      for (const c of quadro.comps) c.pred = 0;
    }
    for (const c of quadro.comps) for (let v = 0; v < c.v; v++) for (let h = 0; h < c.h; h++) bloco(c, mx * c.h + h, my * c.v + v);
    n++;
  }
  // segue até a próxima marca de verdade
  while (p < buf.length - 1 && !(buf[p] === 0xFF && buf[p + 1] !== 0 && !(buf[p + 1] >= 0xD0 && buf[p + 1] <= 0xD7))) p++;
  return p;
}

function montar(q) {
  const { largura: L, altura: A, comps } = q;
  const rgb = new Uint8Array(L * A * 3);
  const amostra = (c, x, y) => c.plano[Math.floor((y * c.v) / q.vmax) * c.larg + Math.floor((x * c.h) / q.hmax)];
  for (let y = 0; y < A; y++) for (let x = 0; x < L; x++) {
    const o = (y * L + x) * 3;
    if (comps.length === 1) { rgb[o] = rgb[o + 1] = rgb[o + 2] = amostra(comps[0], x, y); continue; }
    const Y = amostra(comps[0], x, y), Cb = amostra(comps[1], x, y) - 128, Cr = amostra(comps[2], x, y) - 128;
    const cor = [Y + 1.402 * Cr, Y - 0.344136 * Cb - 0.714136 * Cr, Y + 1.772 * Cb];
    for (let k = 0; k < 3; k++) rgb[o + k] = cor[k] < 0 ? 0 : cor[k] > 255 ? 255 : Math.round(cor[k]);
  }
  return { largura: L, altura: A, rgb };
}

export function lerImagem(caminho) { return lerJpeg(fs.readFileSync(caminho)); }

// ---- PNG (só gravar), para conferir
const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xFFFFFFFF; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function pedaco(tipo, dados) {
  const t = Buffer.from(tipo, 'ascii'), tam = Buffer.alloc(4), crc = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length); crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([tam, t, dados, crc]);
}
export function gravarPng(caminho, L, A, rgb) {
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(L, 0); cab.writeUInt32BE(A, 4); cab[8] = 8; cab[9] = 2;
  const cru = Buffer.alloc((L * 3 + 1) * A);
  for (let y = 0; y < A; y++) { cru[y * (L * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * L * 3, L * 3).copy(cru, y * (L * 3 + 1) + 1); }
  fs.writeFileSync(caminho, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pedaco('IHDR', cab), pedaco('IDAT', zlib.deflateSync(cru)), pedaco('IEND', Buffer.alloc(0))]));
}
