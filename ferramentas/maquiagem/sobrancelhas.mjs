// AS SOBRANCELHAS DESENHADAS (02/11/2026, o dono: "faz algumas variações de sobrancelha mais livres — eu fiz pela pintura de triângulos,
// o que me limitou —, faz umas finas, umas mais estilizadas e por aí vai"): uma imagem de folha da pintura por estilo (a cor à esquerda,
// RGBA — o alfa é a forma —, o tipo à direita, 0 = a cor como está), ESPELHADA no outro olho. Coordenadas em cm a partir do centro da folha
// (o arco da sobrancelha da Feminino 4 lisa, medido na "Sombrancelha grossa" do dono): X para FORA do rosto (a cauda), Y para cima.
// 64 px por cm. As folhas s1…s6 do corpo humano:arquivo3 no assets/modelagem.json (`sobrancelha: '<nome>'`: raca.js nomesDasSobrancelhas).
// Rodar: node ferramentas/maquiagem/sobrancelhas.mjs assets/pintura   (grava humano-arquivo3-s1.png … s7.png; APAGA retoque feito à mão)
//   --corpo humano-arquivo7   o começo do nome das imagens (o corpo; sem ele, a Feminino 4: humano-arquivo3)
//   --so s7                   só esses estilos (separados por vírgula) — o resto fica como está, com os retoques
// (05/11/2026, o Masculino jovem: `node ferramentas/maquiagem/sobrancelhas.mjs assets/pintura --corpo humano-arquivo7 --so s7`)
import { gravar } from './png.mjs';
const pasta = process.argv[2] ?? '.';
const opcao = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const CORPO = opcao('corpo') ?? 'humano-arquivo3', SO = opcao('so')?.split(',') ?? null;
const PX = 64, LARG = 8.25, ALT = 3.25, W = Math.round(LARG * PX), H = Math.round(ALT * PX);

const passo = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// um valor que muda ao longo da sobrancelha: [[t, v], …] (t de 0, a cabeça, a 1, a cauda), entre eles em linha reta
const perfil = (l) => (t) => { for (let i = 1; i < l.length; i++) if (t <= l[i][0]) { const [a, va] = l[i - 1], [b, vb] = l[i]; return va + ((vb - va) * (t - a)) / (b - a); } return l[l.length - 1][1]; };
// sorteio que se repete (a mesma imagem toda vez)
const sorteio = (s) => () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

// a curva pelos pontos (Catmull-Rom; `reta`: os segmentos retos — a ponta da "Angulosa"), em amostras { x, y, t, tx, ty } (t pelo comprimento)
function curva(pts, reta = false, N = 60) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < N; k++) {
      const u = k / N, u2 = u * u, u3 = u2 * u;
      out.push(reta ? [p1[0] + (p2[0] - p1[0]) * u, p1[1] + (p2[1] - p1[1]) * u]
        : [0, 1].map((q) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * u + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * u2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * u3)));
    }
  }
  out.push([...pts[pts.length - 1]]);
  let L = 0;
  const comp = out.map((p, i) => (i ? (L += Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1])) : 0));
  return out.map((p, i) => {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: p[0], y: p[1], t: comp[i] / L, tx: (b[0] - a[0]) / l, ty: (b[1] - a[1]) / l };
  });
}

// o arco natural dela (o meio da "Sombrancelha grossa", na moldura da folha)
const NATURAL = [[-3.05, -0.02], [-2.0, 0.18], [-0.8, 0.36], [0.6, 0.42], [1.8, 0.2], [2.8, -0.28], [3.55, -0.68]];
const BASE = [42, 29, 23], ESCURO = [26, 18, 14];

// uma sobrancelha CHEIA: a curva com a grossura `w(t)` e o alfa `a(t)`; `corte` = um risco aberto em t (o estilo "Com corte")
function cheia({ pts, reta = false, w, a, corte = null }) {
  const c = curva(pts, reta), larg = perfil(w), alfa = perfil(a);
  const cut = corte != null ? c.reduce((m, s) => (Math.abs(s.t - corte) < Math.abs(m.t - corte) ? s : m)) : null;
  return (X, Y) => {
    let melhor = 0, dentro = 0;
    for (const s of c) {
      const h = larg(s.t) / 2, d = Math.hypot(X - s.x, Y - s.y);
      if (d > h + 0.03) continue;
      const v = alfa(s.t) * (1 - passo(h - 0.022, h + 0.022, d));
      if (v > melhor) { melhor = v; dentro = 1 - Math.min(1, d / Math.max(0.01, h)); }
    }
    if (cut && melhor > 0) {
      // (o risco: uma faixa inclinada a ~70° da curva, aberta)
      const ang = Math.atan2(cut.ty, cut.tx) + (70 * Math.PI) / 180, nx = -Math.sin(ang), ny = Math.cos(ang), d = Math.abs((X - cut.x) * nx + (Y - cut.y) * ny);
      melhor *= passo(0.035, 0.07, d);
    }
    return [melhor, dentro];
  };
}
// FIO A FIO: pelos curtos ao longo do arco — de pé na cabeça, deitando até a cauda
function fios({ pts, w, semente }) {
  const c = curva(pts), larg = perfil(w), r = sorteio(semente), pelos = [];
  for (let i = 0; i < 150; i++) {
    const t = Math.pow(r(), 0.9), s = c.reduce((m, q) => (Math.abs(q.t - t) < Math.abs(m.t - t) ? q : m)), h = larg(t) / 2;
    const ang = Math.atan2(s.ty, s.tx) + ((70 - 58 * Math.min(1, t * 1.3)) * Math.PI) / 180 + (r() - 0.5) * 0.25;
    const off = (r() * 2 - 1) * h * 0.85, bx = s.x - s.ty * off, by = s.y + s.tx * off, len = (0.26 + r() * 0.16) * (1 - 0.45 * t);
    pelos.push({ ax: bx - (Math.cos(ang) * len) / 2, ay: by - (Math.sin(ang) * len) / 2, dx: Math.cos(ang) * len, dy: Math.sin(ang) * len, len, w: 0.024 + r() * 0.012, al: 0.78 + r() * 0.2 });
  }
  return (X, Y) => {
    let melhor = 0;
    for (const p of pelos) {
      const u = Math.min(1, Math.max(0, ((X - p.ax) * p.dx + (Y - p.ay) * p.dy) / (p.len * p.len))), d = Math.hypot(X - p.ax - p.dx * u, Y - p.ay - p.dy * u);
      if (d > p.w + 0.02) continue;
      // (o pelo afina na ponta)
      const w = p.w * (1 - 0.6 * u);
      melhor = Math.max(melhor, p.al * (1 - passo(w * 0.5, w + 0.012, d)));
    }
    return [melhor, 0.5];
  };
}

const ESTILOS = [
  ['s1', 'Fina', cheia({ pts: NATURAL.map(([x, y]) => [x, y + 0.04]), w: [[0, 0.2], [0.15, 0.19], [0.7, 0.15], [1, 0.045]], a: [[0, 0.75], [0.08, 0.95], [1, 0.9]] })],
  ['s2', 'Fina arqueada', cheia({ pts: [[-3.05, -0.06], [-1.8, 0.2], [-0.4, 0.6], [0.8, 0.8], [1.8, 0.45], [2.8, -0.12], [3.55, -0.6]], w: [[0, 0.22], [0.2, 0.18], [0.65, 0.15], [1, 0.04]], a: [[0, 0.75], [0.08, 0.95], [1, 0.9]] })],
  ['s3', 'Reta', cheia({ pts: [[-3.05, 0.05], [-1.0, 0.2], [1.0, 0.26], [2.4, 0.1], [3.4, -0.22]], w: [[0, 0.44], [0.25, 0.4], [0.75, 0.32], [1, 0.12]], a: [[0, 0.45], [0.18, 0.92], [1, 0.9]] })],
  ['s4', 'Angulosa', cheia({ pts: [[-3.05, -0.05], [0.95, 0.66], [3.55, -0.7]], reta: true, w: [[0, 0.42], [0.55, 0.3], [1, 0.04]], a: [[0, 0.8], [0.06, 0.96], [1, 0.92]] })],
  ['s5', 'Fio a fio', fios({ pts: NATURAL, w: [[0, 0.46], [0.3, 0.4], [0.8, 0.25], [1, 0.08]], semente: 7 })],
  ['s6', 'Com corte', cheia({ pts: NATURAL, w: [[0, 0.4], [0.3, 0.36], [0.8, 0.24], [1, 0.07]], a: [[0, 0.7], [0.1, 0.95], [1, 0.92]], corte: 0.66 })],
  // (05/11/2026, o Masculino jovem; o dono, com fotos de um personagem de anime: "faz uma sobrancelha grossa, estilo essa aqui"):
  // GROSSA e quase reta, baixa sobre o olho — a cabeça larga e firme um pouco abaixo do pico (o ar sério), o pico a ~60% do caminho
  // e a cauda descendo de leve e afinando; 3,5 mm abaixo do arco das outras (nas fotos ela quase encosta na pálpebra)
  ['s7', 'Grossa', cheia({ pts: [[-3.0, -0.49], [-1.6, -0.25], [0.2, -0.05], [1.6, -0.07], [2.7, -0.37], [3.45, -0.77]], w: [[0, 0.7], [0.2, 0.74], [0.6, 0.6], [0.85, 0.38], [1, 0.12]], a: [[0, 0.72], [0.05, 0.96], [1, 0.94]] })],
];

for (const [id, nome, forma] of ESTILOS) {
  if (SO && !SO.includes(id)) continue;
  const px = new Uint8Array(W * 2 * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const X = (i + 0.5) / PX - LARG / 2, Y = ALT / 2 - (j + 0.5) / PX, [al, dentro] = forma(X, Y), o = (j * W * 2 + i) * 4;
    const cor = BASE.map((c, k) => Math.round(c + (ESCURO[k] - c) * dentro));
    // (fora da forma a cor continua a da borda — o filtro da textura não puxa a beira para o preto)
    px[o] = cor[0]; px[o + 1] = cor[1]; px[o + 2] = cor[2]; px[o + 3] = Math.round(Math.min(1, al) * 255);
    px[(j * W * 2 + W + i) * 4 + 3] = 255;   // (o tipo: nada de tinta do personagem)
  }
  gravar(`${pasta}/${CORPO}-${id}.png`, { W: W * 2, H, bpp: 4, px });
  console.log(id, nome);
}
