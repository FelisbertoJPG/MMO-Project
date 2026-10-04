// ENXUGA um .glb para a web: tira os mapas de NORMAL (num jogo low poly, à noite, não
// se veem) e reduz as texturas maiores que MAX px (pelo System.Drawing do Windows,
// sem dependência). PNG continua PNG (as folhas têm transparência); JPEG continua JPEG.
//
// Uso: node ferramentas/enxugar-glb.mjs [--max=512] <arquivo.glb> [<arquivo.glb> …]
// (sobrescreve; os pacotes de origem continuam na biblioteca do editor de cenas)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const MAX = Number(process.argv.find((a) => a.startsWith('--max='))?.split('=')[1] ?? 512);
const arquivos = process.argv.slice(2).filter((a) => !a.startsWith('--'));

function lerGlb(buf) {
  const jLen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jLen).toString('utf8'));
  const bOff = 20 + jLen;
  const bin = buf.length > bOff ? buf.subarray(bOff + 8, bOff + 8 + buf.readUInt32LE(bOff)) : Buffer.alloc(0);
  return { json, bin };
}
function gravarGlb(json, bin) {
  let js = Buffer.from(JSON.stringify(json)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const bp = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
  const cab = Buffer.alloc(12); cab.writeUInt32LE(0x46546c67, 0); cab.writeUInt32LE(2, 4); cab.writeUInt32LE(12 + 8 + js.length + 8 + bp.length, 8);
  const cj = Buffer.alloc(8); cj.writeUInt32LE(js.length, 0); cj.writeUInt32LE(0x4e4f534a, 4);
  const cb = Buffer.alloc(8); cb.writeUInt32LE(bp.length, 0); cb.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([cab, cj, js, cb, bp]);
}
// largura × altura pelo cabeçalho (PNG: IHDR; JPEG: o marcador SOF)
function tamanho(img) {
  if (img[0] === 0x89) return [img.readUInt32BE(16), img.readUInt32BE(20)];
  for (let i = 2; i < img.length;) {
    if (img[i] !== 0xff) { i++; continue; }
    const m = img[i + 1], len = img.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xc3) return [img.readUInt16BE(i + 7), img.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  return [0, 0];
}
function reduzir(img, png) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'enxugar-'));
  const ent = path.join(tmp, png ? 'a.png' : 'a.jpg'), sai = path.join(tmp, png ? 'b.png' : 'b.jpg');
  fs.writeFileSync(ent, img);
  const ps = `Add-Type -AssemblyName System.Drawing
$i = [System.Drawing.Image]::FromFile('${ent}')
$k = [Math]::Min(1.0, ${MAX} / [Math]::Max($i.Width, $i.Height))
$w = [int][Math]::Max(1, [Math]::Round($i.Width * $k)); $h = [int][Math]::Max(1, [Math]::Round($i.Height * $k))
$b = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($b)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($i, 0, 0, $w, $h)
$i.Dispose()
${png ? `$b.Save('${sai}', [System.Drawing.Imaging.ImageFormat]::Png)`
    : `$c = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 82L
$b.Save('${sai}', $c, $p)`}`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps]);
  const r = fs.readFileSync(sai);
  fs.rmSync(tmp, { recursive: true, force: true });
  return r;
}

for (const arq of arquivos) {
  const antes = fs.statSync(arq).size;
  const { json, bin } = lerGlb(fs.readFileSync(arq));
  // 1. sem mapas de normal
  for (const m of json.materials ?? []) delete m.normalTexture;
  // 2. as texturas e imagens ainda usadas
  const texUsadas = new Set();
  const marca = (o) => { if (o && typeof o === 'object') { if (Number.isInteger(o.index) && 'index' in o && Object.keys(o).every((k) => ['index', 'texCoord', 'scale', 'strength', 'extensions'].includes(k))) texUsadas.add(o.index); for (const v of Object.values(o)) marca(v); } };
  for (const m of json.materials ?? []) marca(m);
  const imgUsadas = new Set([...texUsadas].map((t) => json.textures[t].source));
  // 3. cada bufferView: o dado de antes, a imagem reduzida, ou nada (imagem largada)
  const viewDeImg = new Map((json.images ?? []).map((im, i) => [im.bufferView, i]));
  const novos = [], mapaView = new Map();
  json.bufferViews.forEach((v, i) => {
    let dado = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
    if (viewDeImg.has(i)) {
      const im = viewDeImg.get(i);
      if (!imgUsadas.has(im)) return;   // imagem sem uso: some
      const [w, h] = tamanho(dado);
      if (Math.max(w, h) > MAX) dado = reduzir(dado, json.images[im].mimeType === 'image/png');
    }
    mapaView.set(i, novos.length);
    novos.push({ v: { ...v }, dado });
  });
  // 4. remonta o binário (alinhado em 4) e renumera as referências
  let off = 0; const pedacos = [];
  for (const n of novos) {
    const pad = (4 - (off % 4)) % 4; if (pad) { pedacos.push(Buffer.alloc(pad)); off += pad; }
    n.v.byteOffset = off; n.v.byteLength = n.dado.length; pedacos.push(n.dado); off += n.dado.length;
  }
  for (const a of json.accessors ?? []) if (a.bufferView !== undefined) a.bufferView = mapaView.get(a.bufferView);
  // imagens e texturas sem uso saem; as que ficam são renumeradas
  const imgNova = new Map(); const imagens = [];
  (json.images ?? []).forEach((im, i) => { if (imgUsadas.has(i)) { imgNova.set(i, imagens.length); imagens.push({ ...im, bufferView: mapaView.get(im.bufferView) }); } });
  const texNova = new Map(); const texturas = [];
  (json.textures ?? []).forEach((t, i) => { if (texUsadas.has(i)) { texNova.set(i, texturas.length); texturas.push({ ...t, source: imgNova.get(t.source) }); } });
  const remarca = (o) => { if (o && typeof o === 'object') { if (texNova.has(o.index) && 'index' in o && Object.keys(o).every((k) => ['index', 'texCoord', 'scale', 'strength', 'extensions'].includes(k))) o.index = texNova.get(o.index); else for (const v of Object.values(o)) remarca(v); } };
  for (const m of json.materials ?? []) remarca(m);
  json.images = imagens; json.textures = texturas;
  if (!imagens.length) { delete json.images; delete json.textures; delete json.samplers; }
  json.bufferViews = novos.map((n) => n.v);
  const binNovo = Buffer.concat(pedacos);
  json.buffers = [{ byteLength: binNovo.length }];
  fs.writeFileSync(arq, gravarGlb(json, binNovo));
  console.log(`${path.basename(arq).padEnd(40)} ${(antes / 1024 | 0)} KB → ${(fs.statSync(arq).size / 1024 | 0)} KB`);
}
