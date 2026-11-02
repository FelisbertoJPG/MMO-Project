// OS DELINEADOS DESENHADOS (02/11/2026, o dono: "faz umas variações livres de delineado, ficou muito triangular e marcado o meu.
// Pode editar ele, a localidade tá boa, mas o traço não"): uma imagem de folha da pintura por estilo (a cor à esquerda, RGBA — o alfa
// é a forma —, o tipo à direita, 0 = a cor como está), ESPELHADA no outro olho. A moldura é a das maquiagens (maquiagens.mjs): cm a
// partir do centro, X para FORA do rosto, Y para cima, 7 × 8 cm, 64 px por cm. O traço segue a BORDA DO OLHO da Feminino 4 lisa,
// medida na malha (os triângulos do olho, na moldura): a de cima e a de baixo, do canto de dentro (−1,98; 1,38) ao de fora (1,68;
// 1,77). Por baixo, o traço entra um pouco no olho — a folha não pinta o olho (`foraDoOlho`): a beira fica a do olho. Uma COR SÓ
// (a roda de cores tinge, pintura.js `tingirTela`). As folhas d1…d7 do corpo humano:arquivo3 no assets/modelagem.json
// (`delineado: '<nome>'`; a lista `delineados` do corpo dá a ordem — raca.js `nomesDosDelineados`).
// O "Delineado simples" é o do dono, no MESMO lugar (o traço dos triângulos dele: delineado-simples-triangulos.json), redesenhado.
// Rodar: node ferramentas/maquiagem/delineados.mjs assets/pintura   (grava humano-arquivo3-d1…d7.png; APAGA retoque feito à mão)
import { gravar } from './png.mjs';
const pasta = process.argv[2] ?? '.';
const PX = 64, LARG = 7, ALT = 8, W = LARG * PX, H = ALT * PX;
const COR = [20, 15, 18];

const passo = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const perfil = (l) => (t) => { for (let i = 1; i < l.length; i++) if (t <= l[i][0]) { const [a, va] = l[i - 1], [b, vb] = l[i]; return va + ((vb - va) * (t - a)) / (b - a); } return l[l.length - 1][1]; };

// a curva pelos pontos (Catmull-Rom), em amostras { x, y, t, nx, ny } (t pelo comprimento; n = a normal à ESQUERDA do caminho)
function curva(pts, N = 40) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let k = 0; k < N; k++) {
      const u = k / N, u2 = u * u, u3 = u2 * u;
      out.push([0, 1].map((q) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * u + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * u2 + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * u3)));
    }
  }
  out.push([...pts[pts.length - 1]]);
  let L = 0;
  const comp = out.map((p, i) => (i ? (L += Math.hypot(p[0] - out[i - 1][0], p[1] - out[i - 1][1])) : 0));
  return out.map((p, i) => {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return { x: p[0], y: p[1], t: comp[i] / L, nx: -(b[1] - a[1]) / l, ny: (b[0] - a[0]) / l };
  });
}
// a BORDA DO OLHO (medida; alisada — por baixo o traço entra no olho, então o alisado não abre fresta)
const CIMA = curva([[-1.98, 1.38], [-1.66, 1.7], [-1.25, 2.1], [-0.65, 2.31], [-0.2, 2.37], [0.5, 2.26], [1.2, 2.04], [1.55, 1.93], [1.68, 1.77]]);
const BAIXO = curva([[-1.98, 1.38], [-1.45, 1.14], [-0.6, 1.08], [0.1, 1.04], [0.85, 1.13], [1.45, 1.4], [1.68, 1.77]]);
const em = (c, t) => c.reduce((m, s) => (Math.abs(s.t - t) < Math.abs(m.t - t) ? s : m));
// um ponto da borda deslocado pela normal (+ = para FORA do olho: em cima, para cima; embaixo, para baixo)
const fora = (c, s, d, baixo = false) => [s.x + s.nx * d * (baixo ? -1 : 1), s.y + s.ny * d * (baixo ? -1 : 1)];
// uma curva de Bézier quadrática (a beira da asa), de a a b passando perto de c
const bezier = (a, c, b, N = 24) => Array.from({ length: N + 1 }, (_, i) => { const u = i / N; return [0, 1].map((q) => (1 - u) * (1 - u) * a[q] + 2 * (1 - u) * u * c[q] + u * u * b[q]); });

/**
 * Um TRAÇO na borda (de cima ou de baixo) como polígono: do `ini` ao `fim` (t na borda), com a grossura `esp(t)` para fora e um
 * pouco para DENTRO do olho (`entra`, cortado pela folha); `asa`: { ponta: [x, y], sai (t onde a beira de cima da asa deixa o traço),
 * curva (quanto a beira de cima afunda, cm), baixa: [x, y] (onde a beira de baixo começa — sem, o fim do traço) }.
 */
function traco({ borda = CIMA, baixo = false, ini = 0.02, fim = 1, esp, entra = 0.1, asa = null }) {
  const g = perfil(esp), pts = [];
  const de = borda.filter((s) => s.t >= ini && s.t <= fim);
  // (por baixo: entra no olho, menos nas pontas — ali, fora do olho, é pele)
  for (const s of de) pts.push(fora(borda, s, -entra * passo(ini, ini + 0.1, s.t) * (1 - passo(fim - 0.08, fim, s.t)), baixo));
  if (asa) {
    const fimP = pts[pts.length - 1], b0 = asa.baixa ?? fimP, sai = em(borda, asa.sai), topo = fora(borda, sai, g(asa.sai), baixo);
    // (a beira de baixo da asa: do canto de fora à ponta, quase reta; a de cima: da ponta de volta ao traço, afundada)
    const meioB = [(b0[0] + asa.ponta[0]) / 2, (b0[1] + asa.ponta[1]) / 2 - (asa.barriga ?? 0.03)];
    if (asa.baixa) pts.push(asa.baixa);
    pts.push(...bezier(b0, meioB, asa.ponta).slice(1));
    const meioC = [(asa.ponta[0] + topo[0]) / 2, (asa.ponta[1] + topo[1]) / 2 - (asa.curva ?? 0.06)];
    pts.push(...bezier(asa.ponta, meioC, topo).slice(1, -1));
    for (const s of [...de].reverse()) if (s.t <= asa.sai) pts.push(fora(borda, s, g(s.t), baixo));
  } else for (const s of [...de].reverse()) pts.push(fora(borda, s, g(s.t), baixo));
  return pts;
}
// um RISCO livre (a 2ª asa, o risco no côncavo): pela curva dos pontos, com a grossura `esp(t)` dos dois lados
function risco(pontos, esp) {
  const c = curva(pontos), g = perfil(esp);
  return [...c.map((s) => [s.x + (s.nx * g(s.t)) / 2, s.y + (s.ny * g(s.t)) / 2]), ...[...c].reverse().map((s) => [s.x - (s.nx * g(s.t)) / 2, s.y - (s.ny * g(s.t)) / 2])];
}

// a distância (com sinal: − = dentro) de um ponto a um polígono
function distancia(poli, X, Y) {
  let d = Infinity, dentro = false;
  for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) {
    const [ax, ay] = poli[j], [bx, by] = poli[i];
    if ((ay > Y) !== (by > Y) && X < ((bx - ax) * (Y - ay)) / (by - ay) + ax) dentro = !dentro;
    const ex = bx - ax, ey = by - ay, u = Math.max(0, Math.min(1, ((X - ax) * ex + (Y - ay) * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(X - ax - ex * u, Y - ay - ey * u));
  }
  return dentro ? -d : d;
}
// uma camada: o polígono, a beira (cm: 0,012 = nítida; maior = esfumada) e o alfa; `some`: o alfa cai para fora da borda
const camada = (poli, { beira = 0.012, alfa = 1, some = null } = {}) => ({ poli, beira, alfa, some, caixa: [Math.min(...poli.map((p) => p[0])) - beira * 3, Math.max(...poli.map((p) => p[0])) + beira * 3, Math.min(...poli.map((p) => p[1])) - beira * 3, Math.max(...poli.map((p) => p[1])) + beira * 3] });

const ESTILOS = [
  // o DO DONO, redesenhado: o mesmo lugar (a linha em cima do olho e a asa até ~3,2 cm), mas um traço que afina no canto de dentro,
  // engrossa devagar e sai numa asa de beiras curvas e ponta fina — nada de bloco descendo no canto de fora
  ['d1', 'Delineado simples', [camada(traco({ esp: [[0, 0.03], [0.15, 0.07], [0.55, 0.13], [0.8, 0.19], [1, 0.2]], asa: { ponta: [3.15, 2.18], sai: 0.66, curva: 0.07, baixa: [1.66, 1.72] } }))]],
  // FINO: um fio rente aos cílios, com um tiquinho de ponta no canto
  ['d2', 'Fino', [camada(traco({ esp: [[0, 0.025], [0.2, 0.06], [0.7, 0.08], [1, 0.09]], entra: 0.08, asa: { ponta: [2.02, 1.98], sai: 0.9, curva: 0.02, baixa: [1.67, 1.74] } }))]],
  // GATINHO: fino, com uma asinha curta virada para cima
  ['d3', 'Gatinho', [camada(traco({ esp: [[0, 0.03], [0.3, 0.06], [0.75, 0.1], [1, 0.12]], asa: { ponta: [2.42, 2.32], sai: 0.8, curva: 0.04, baixa: [1.66, 1.74] } }))]],
  // ASA LONGA: grosso e a asa comprida, bem levantada (o "olho de gato" forte)
  ['d4', 'Asa longa', [camada(traco({ esp: [[0, 0.05], [0.2, 0.1], [0.6, 0.2], [0.85, 0.28], [1, 0.3]], asa: { ponta: [3.4, 2.92], sai: 0.55, curva: 0.12, baixa: [1.64, 1.7], barriga: 0.06 } }))]],
  // CONTORNO: em volta do olho todo, em cima e embaixo, fechando nos cantos (com uma pontinha para fora)
  ['d5', 'Contorno', [
    camada(traco({ ini: 0, esp: [[0, 0.05], [0.15, 0.08], [0.6, 0.11], [1, 0.12]], asa: { ponta: [2.0, 1.83], sai: 0.88, curva: 0.02, baixa: [1.67, 1.7] } })),
    camada(traco({ borda: BAIXO, baixo: true, ini: 0, esp: [[0, 0.05], [0.2, 0.06], [0.7, 0.07], [1, 0.09]], entra: 0.08 })),
  ]],
  // BORRADO: o lápis esfumado — macio, mais grosso, e embaixo só na metade de fora
  ['d6', 'Borrado', [
    camada(traco({ esp: [[0, 0.08], [0.3, 0.18], [0.8, 0.26], [1, 0.28]], asa: { ponta: [2.3, 2.12], sai: 0.8, curva: 0.03, baixa: [1.66, 1.68] } }), { beira: 0.13, alfa: 0.92 }),
    camada(traco({ borda: BAIXO, baixo: true, ini: 0.42, esp: [[0.42, 0.04], [0.7, 0.13], [1, 0.18]], entra: 0.08 }), { beira: 0.12, alfa: 0.75 }),
  ]],
  // ASA DUPLA: a asa de cima e uma segunda, embaixo, saindo da metade de fora da borda de baixo — um "<" aberto
  ['d7', 'Asa dupla', [
    camada(traco({ esp: [[0, 0.03], [0.3, 0.07], [0.75, 0.13], [1, 0.15]], asa: { ponta: [2.95, 2.42], sai: 0.72, curva: 0.06, baixa: [1.66, 1.74] } })),
    camada(risco([[0.55, 1.0], [1.2, 1.18], [1.85, 1.48], [2.75, 1.86]], [[0, 0.03], [0.35, 0.1], [0.8, 0.1], [1, 0.0]])),
  ]],
];

for (const [id, nome, camadas] of ESTILOS) {
  const px = new Uint8Array(W * 2 * H * 4);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const X = (i + 0.5) / PX - LARG / 2, Y = ALT / 2 - (j + 0.5) / PX, o = (j * W * 2 + i) * 4;
    let resto = 1;
    for (const c of camadas) {
      const [x0, x1, y0, y1] = c.caixa;
      if (X < x0 || X > x1 || Y < y0 || Y > y1) continue;
      const d = distancia(c.poli, X, Y), a = c.alfa * (1 - passo(-c.beira, c.beira, d));
      resto *= 1 - a;
    }
    px[o] = COR[0]; px[o + 1] = COR[1]; px[o + 2] = COR[2]; px[o + 3] = Math.round((1 - resto) * 255);
    px[(j * W * 2 + W + i) * 4 + 3] = 255;   // (o tipo: nada de tinta do personagem)
  }
  gravar(`${pasta}/humano-arquivo3-${id}.png`, { W: W * 2, H, bpp: 4, px });
  console.log(id, nome);
}
