// AS MAQUIAGENS DOS OLHOS (02/11/2026, o dono: "faz umas variações de maquiagem, e refaz a esfumada clássica, pq ela tá misturada com o
// delineado — ficou uma pontinha dele pra fora, triângulo no final do esfumado —; minha ideia é poder ter um delineado preto e uma
// maquiagem esfumada de outra cor, pra dar contraste nos cílios"). Cada uma é uma COR SÓ — a forma vai toda no alfa: tingida pela roda de
// cores, sai exatamente a cor escolhida (pintura.js `tingirTela`) — e NADA de traço rente aos cílios nem asa no canto: isso é o delineado
// (que a folha não cobre: `foraDoDelineado`). A moldura é a do Esfumado (esfumado.mjs): cm a partir do centro, X para FORA do rosto, Y para
// cima, 7 × 8 cm, 64 px por cm. O olho dela fica em X −2,15…1,85, Y 1,2…2,3; a sobrancelha começa em Y ~3,1.
// Rodar: node ferramentas/maquiagem/maquiagens.mjs assets/pintura   (grava humano-arquivo3-m3/m4 — a Esfumada — e m5…m9; APAGA retoque à mão)
import { gravar } from './png.mjs';
const pasta = process.argv[2] ?? '.';
const PX = 64, LARG = 7, ALT = 8, W = LARG * PX, H = ALT * PX;

const hash = (x, y, s) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
const suave = (t) => t * t * (3 - 2 * t);
function ruido(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = suave(x - xi), fy = suave(y - yi);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const passo = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// uma mancha: [cx, cy, rx, ry, giro°, alfa, platô (a fração do raio de alfa cheio)]
function mancha(X, Y, [cx, cy, rx, ry, g, a, plato]) {
  const r = (g * Math.PI) / 180, dx = X - cx, dy = Y - cy;
  const u = (dx * Math.cos(r) + dy * Math.sin(r)) / rx, v = (-dx * Math.sin(r) + dy * Math.cos(r)) / ry;
  return a * (1 - passo(plato, 1, Math.hypot(u, v)));
}
// (o que sobra de uma mancha quando outra a TIRA — o "côncavo marcado" deixa a pálpebra limpa)
const menos = (X, Y, m) => 1 - mancha(X, Y, m);

const ESTILOS = [
  // a ESFUMADA (refeita): a pálpebra e o côncavo esfumados até perto da sobrancelha, saindo macio no canto de fora (sem asa) e um véu embaixo
  { arquivos: ['m3', 'm4'], nome: 'Esfumada', cor: [34, 30, 36], semente: 5, manchas: [
    [0.0, 2.55, 3.0, 1.2, 6, 0.97, 0.55],
    [1.95, 2.45, 1.6, 1.0, 12, 0.85, 0.35],
    [-2.15, 1.9, 0.9, 0.9, 0, 0.7, 0.3],
    [-0.05, 1.12, 2.4, 0.62, -3, 0.68, 0.3],
  ] },
  // SOMBRA LEVE: só um véu na pálpebra, até o côncavo
  { arquivos: ['m5'], nome: 'Sombra leve', cor: [122, 84, 104], semente: 9, manchas: [
    [0.05, 2.45, 2.45, 0.88, 6, 0.74, 0.35],
  ] },
  // OLHO DE GATO: a sombra puxada para fora e para cima no canto (esfumada, não traço) e um fio dela embaixo, só na metade de fora
  { arquivos: ['m6'], nome: 'Olho de gato', cor: [70, 44, 92], semente: 13, manchas: [
    [0.9, 2.5, 2.1, 0.78, 16, 0.85, 0.3],
    [2.55, 2.85, 1.05, 0.48, 26, 0.75, 0.15],
    [1.2, 1.25, 1.25, 0.38, -8, 0.5, 0.1],
  ] },
  // CÔNCAVO MARCADO: uma faixa no vinco, acima da pálpebra (que fica limpa)
  { arquivos: ['m7'], nome: 'Côncavo marcado', cor: [86, 52, 34], semente: 17, manchas: [
    [0.15, 2.95, 2.7, 0.55, 7, 0.85, 0.3],
    [1.9, 2.75, 0.9, 0.42, 22, 0.6, 0.1],
  ], tira: [[0.0, 2.35, 2.35, 0.48, 6, 0.9, 0.55]] },
  // HALO: em volta do olho inteiro, por igual (em cima e embaixo)
  { arquivos: ['m8'], nome: 'Halo', cor: [52, 44, 62], semente: 21, manchas: [
    [0.0, 2.35, 2.6, 1.0, 5, 0.85, 0.35],
    [-0.05, 1.05, 2.45, 0.72, -3, 0.8, 0.3],
    [-2.25, 1.75, 0.85, 0.95, 0, 0.75, 0.25],
    [1.95, 1.85, 0.9, 0.95, 0, 0.75, 0.25],
  ] },
  // BRILHO DOURADO: um véu dourado na pálpebra com pontinhos de brilho
  { arquivos: ['m9'], nome: 'Brilho dourado', cor: [176, 136, 58], brilho: [255, 236, 170], semente: 29, manchas: [
    [0.05, 2.4, 2.4, 0.85, 6, 0.75, 0.3],
    [1.6, 2.4, 1.0, 0.6, 14, 0.5, 0.1],
  ] },
];

for (const e of ESTILOS) {
  const px = new Uint8Array(W * 2 * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const X = (i + 0.5) / PX - LARG / 2, Y = ALT / 2 - (j + 0.5) / PX;
    let resto = 1;
    for (const m of e.manchas) resto *= 1 - mancha(X, Y, m);
    let A = 1 - resto;
    for (const m of e.tira ?? []) A *= menos(X, Y, m);
    // (o pincel: o alfa um pouco irregular — a cor não muda)
    A *= 0.9 + 0.2 * ruido(X * 1.7 + 3, Y * 1.7 + 7, e.semente);
    // (sem beirada na moldura)
    A *= passo(0, 0.18, Math.min(X + LARG / 2, LARG / 2 - X, Y + ALT / 2, ALT / 2 - Y));
    let cor = e.cor;
    // (os pontinhos de brilho: claros e opacos, onde há a sombra)
    if (e.brilho && A > 0.15) {
      const gx = X * 9, gy = Y * 9, cx = Math.floor(gx), cy = Math.floor(gy), sx = cx + hash(cx, cy, 1), sy = cy + hash(cx, cy, 2);
      if (hash(cx, cy, 3) < 0.35) { const d = Math.hypot(gx - sx, gy - sy), k = 1 - passo(0.08, 0.2, d); if (k > 0) { cor = e.cor.map((c, q) => Math.round(c + (e.brilho[q] - c) * k)); A = Math.max(A, k * 0.95); } }
    }
    const o = (j * W * 2 + i) * 4;
    px[o] = cor[0]; px[o + 1] = cor[1]; px[o + 2] = cor[2]; px[o + 3] = Math.round(Math.min(1, A) * 255);
    px[(j * W * 2 + W + i) * 4 + 3] = 255;   // (o tipo: nada de tinta do personagem)
  }
  // (o 2º arquivo — o olho −x da Esfumada, a folha sem espelho — é o mesmo desenho virado)
  e.arquivos.forEach((id, k) => {
    let p = px;
    if (k === 1) { p = new Uint8Array(px.length); for (let j = 0; j < H; j++) for (let i = 0; i < W * 2; i++) { const de = i < W ? (j * W * 2 + (W - 1 - i)) * 4 : (j * W * 2 + i) * 4; p.set(px.subarray(de, de + 4), (j * W * 2 + i) * 4); } }
    gravar(`${pasta}/humano-arquivo3-${id}.png`, { W: W * 2, H, bpp: 4, px: p });
  });
  console.log(e.arquivos.join('/'), e.nome);
}
