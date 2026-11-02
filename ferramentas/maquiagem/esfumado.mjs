// O ESFUMADO (maquiagem gótica — a Esfumada derretida e a Esfumada; 01/11/2026, o dono: "tenta aplicar esse esfumado ao redor dos olhos… adiciona a opção no menu
// Maquiagem → Esfumado"). Rodar: node ferramentas/maquiagem/esfumado.mjs assets/pintura/humano-arquivo3-m1.png assets/pintura/humano-arquivo3-m2.png assets/pintura/humano-arquivo3-m3.png assets/pintura/humano-arquivo3-m4.png
// (as folhas m1/m2 da Feminino 4 lisa no modelagem.json: maquiagem "Esfumado", foraDoOlho; pintura.js folhasAtivas). Depois de
// gerar, o dono pode retocar com o pincel da PINTURA no editor — e aí rodar de novo APAGA o retoque.
// a imagem de uma folha da pintura por olho — a cor à esquerda (RGBA, o alfa é a forma), o
// tipo à direita (0 = a cor como está). Coordenadas em cm a partir do centro da folha: X para FORA do rosto (o canto de fora
// do olho), Y para cima. 64 px por cm.
import { gravar } from './png.mjs';
// (DOIS tipos — 02/11/2026, o dono marcou a bochecha onde a tinta escorre: "a ideia é ter 2 tipos: Esfumada derretida, e uma Esfumada
// apenas; a Esfumada não pode ter essa maquiagem derretida e deve ser mais volumosa ao redor dos olhos": os 2 primeiros arquivos são a
// DERRETIDA — m1/m2, a de antes, com os escorridos —, os 2 seguintes (se vierem) a ESFUMADA — m3/m4, sem escorrido e mais cheia)
const [, , saida1, saida2, saida3, saida4] = process.argv;
const PX = 64, LARG = 7, ALT = 8, W = LARG * PX, H = ALT * PX;

// ---- ruído suave (manchas do pincel)
const hash = (x, y, s) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };
const suave = (t) => t * t * (3 - 2 * t);
function ruido(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = suave(x - xi), fy = suave(y - yi);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}
const fbm = (x, y, s) => 0.55 * ruido(x, y, s) + 0.3 * ruido(x * 2.1, y * 2.1, s + 1) + 0.15 * ruido(x * 4.3, y * 4.3, s + 2);
const passo = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---- as manchas do esfumado: [cx, cy, rx, ry, giro°, alfa, platô (fração do raio escura por igual)]
const OLHO = [-0.15, 1.72];
const MANCHAS = [
  [-0.05, 2.2, 2.7, 1.55, 6, 0.98, 0.62],    // a pálpebra de cima, até embaixo da sobrancelha
  [2.05, 2.2, 1.65, 0.95, 22, 0.95, 0.5],      // o canto de fora, puxado para fora e para cima
  [-0.1, 1.02, 2.45, 0.95, -4, 0.9, 0.45],      // embaixo do olho, borrado
  [-2.15, 1.62, 0.85, 0.95, 0, 0.8, 0.4],      // o canto de dentro
];
function mancha(X, Y, [cx, cy, rx, ry, g, a, plato]) {
  const r = (g * Math.PI) / 180, dx = X - cx, dy = Y - cy;
  const u = (dx * Math.cos(r) + dy * Math.sin(r)) / rx, v = (-dx * Math.sin(r) + dy * Math.cos(r)) / ry, d = Math.hypot(u, v);
  return a * (1 - passo(plato, 1, d));
}

// ---- os ESCORRIDOS (o rímel que escorreu): [x de saída, y de saída, x no fim, y no fim, largura no começo, no fim, alfa no começo, no fim, fase]
function escorrido(X, Y, [x0, y0, x1, y1, w0, w1, a0, a1, fase]) {
  if (Y > y0 + 0.2 || Y < y1 - 0.3) return 0;
  const N = 70;
  let melhor = 0;
  for (let k = 0; k < N; k++) {
    const t = k / (N - 1), y = y0 + (y1 - y0) * t;
    // (a gota desce torta: uma ondinha que cresce para baixo)
    const x = x0 + (x1 - x0) * t + 0.025 * Math.sin(t * 7 + fase) * t + 0.012 * Math.sin(t * 19 + fase * 2);
    const w = w0 + (w1 - w0) * t, a = a0 + (a1 - a0) * Math.pow(t, 1.3), d = Math.hypot(X - x, Y - y);
    melhor = Math.max(melhor, a * (1 - passo(w * 0.55, w, d)));
  }
  // (a gota na ponta)
  const xf = x1 + 0.025 * Math.sin(7 + fase) + 0.012 * Math.sin(19 + fase * 2), df = Math.hypot(X - xf, Y - (y1 - 0.06));
  melhor = Math.max(melhor, a1 * 1.15 * (1 - passo(w1 * 0.9, w1 * 1.6, df)));
  return Math.min(1, melhor);
}

const ESCURO = [18, 12, 14], CINZA = [50, 39, 39];
// (a ESFUMADA: as mesmas manchas mais cheias — a pálpebra mais escura e mais alta (até embaixo da sobrancelha), o canto de fora mais
// aberto, embaixo mais grosso, mas acabando em y ~175,1 cm: em cima da bochecha que o dono marcou, onde a derretida escorre)
const MANCHAS_DA_ESFUMADA = [
  [0.05, 2.3, 3.25, 1.5, 6, 1, 0.78],      // a pálpebra de cima: larga e escura por igual até perto da sobrancelha
  [2.35, 2.2, 1.95, 1.25, 18, 0.98, 0.66],    // o canto de fora, bem aberto para fora e para cima
  [0, 1.27, 2.85, 0.86, -4, 0.96, 0.62],      // embaixo do olho: grosso, sem descer para a bochecha (acaba em y ~175,1)
  [-2.3, 1.7, 1.05, 1.1, 0, 0.9, 0.55],       // o canto de dentro
];
function desenhar(escorridos, semente, espelhar, manchas = MANCHAS) {
  const px = new Uint8Array(W * 2 * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const X = (i + 0.5) / PX - LARG / 2, Y = ALT / 2 - (j + 0.5) / PX;
    let resto = 1;
    for (const m of manchas) resto *= 1 - mancha(X, Y, m);
    let A = 1 - resto;
    // (o pincel: o esfumado não é liso — manchas suaves, mais fortes na beira)
    const n = fbm(X * 1.6 + 7, Y * 1.6 + 3, semente);
    A = Math.min(1, Math.max(0, A * (0.92 + 0.16 * n) - 0.03 * (1 - A) * n));
    // (mais escuro rente ao olho — a linha dos cílios)
    const dOlho = Math.hypot((X - OLHO[0]) / 2.2, (Y - OLHO[1]) / 0.75);
    const perto = 1 - passo(0.9, 1.5, dOlho);
    A = Math.min(1, A + 0.25 * perto * A);
    let D = 0;
    for (const e of escorridos) D = Math.max(D, escorrido(X, Y, e));
    const total = 1 - (1 - A) * (1 - D);
    // (sem beirada na moldura da folha)
    const borda = passo(0, 0.18, Math.min(X + LARG / 2, LARG / 2 - X, Y + ALT / 2, ALT / 2 - Y));
    const alfa = total * 0.96 * borda;
    const escuridao = Math.min(1, Math.pow(A, 0.8) + 0.9 * D + 0.35 * perto);
    const cor = CINZA.map((c, k) => Math.round(c + (ESCURO[k] - c) * escuridao));
    const ii = espelhar ? W - 1 - i : i, o = (j * W * 2 + ii) * 4;
    px[o] = cor[0]; px[o + 1] = cor[1]; px[o + 2] = cor[2]; px[o + 3] = Math.round(alfa * 255);
    const t = (j * W * 2 + W + i) * 4;
    px[t + 3] = 255;   // (o tipo: nada de tinta do personagem)
  }
  return { W: W * 2, H, bpp: 4, px };
}

// o olho +x (o ESQUERDO dela): um escorrido comprido do meio e um curto de fora
gravar(saida1, desenhar([
  [0.35, 1.0, 0.22, -2.55, 0.13, 0.07, 0.95, 0.5, 0.4],
  [1.35, 1.12, 1.5, -0.55, 0.08, 0.05, 0.62, 0.28, 2.1],
], 3, false));
// o olho −x (o DIREITO dela; a folha dele não é espelho — a imagem sai virada): dois escorridos, o de dentro mais comprido
gravar(saida2, desenhar([
  [-0.85, 0.98, -1.02, -3.0, 0.14, 0.07, 0.95, 0.5, 1.3],
  [1.05, 1.08, 1.22, -1.35, 0.1, 0.055, 0.82, 0.36, 3.7],
], 11, true));
// a ESFUMADA (sem escorrido): o olho +x e o −x (virado)
if (saida3) gravar(saida3, desenhar([], 5, false, MANCHAS_DA_ESFUMADA));
if (saida4) gravar(saida4, desenhar([], 13, true, MANCHAS_DA_ESFUMADA));
console.log('ok', W * 2, H);
