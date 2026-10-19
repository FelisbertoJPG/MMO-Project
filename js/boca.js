/**
 * A BOCA E O BATOM (19/10/2026) — os lábios do guerreiro, com a cor escolhida no painel de Aparência.
 *
 * O modelo NÃO tem boca desenhada: os 216 triângulos do rosto (`Face`) são todos da cor da pele, e a
 * boca é só uma dobra da malha — a linha dos lábios em y 160,96 (z 15,18), o lábio de cima mais à
 * frente em 161,86, o de baixo em 160,21 (cm, pose T), numa faixa de ±0,53 cm no meio do rosto; em
 * volta, a próxima coluna de pontos já está em x ≈ 2 cm, 1,7 cm mais funda. Não há o que tingir
 * (pintar triângulos daria uma boca de quadradões, e depende da malha que o dono edita).
 *
 * Os lábios são uma FOLHA da pintura (pintura.js) feita aqui, em código: um desenho de lábios
 * FACETADOS — o estilo do jogo: polígonos chapados, nítidos, sem degradê (o lábio de cima mais escuro,
 * o de baixo com uma faceta clara no meio, a linha da boca e os cantos escuros, uma sombra leve
 * debaixo do lábio de baixo) — projetado no rosto de frente. A projeção é feita no MODELO
 * (`noModelo`: em `ctx.antes`) e cada ponto vai para onde aquele lugar da pele foi parar: a boca
 * acompanha a raça (o queixo estreito estreita a boca, a cabeça menor a diminui), a modelagem do
 * corpo e a animação, sem um triângulo a mais na malha do corpo. Só pinta a pele (`so: 'corpo'`):
 * as presas, a barba e o cabelo passam por cima.
 *
 * As cores são as de `BATONS` (aparencia.js): [nome, cor, pele] — `pele` é quanto da cor é a da PELE
 * de quem veste (a tinta "pele" da folha): o "Natural" é a pele mais rosada, e segue a pele escolhida.
 * Cada faceta é a cor base vezes um brilho (`k`): na mistura com a pele, a conta acerta a tinta e a
 * cor para que a faceta saia exatamente k vezes a base (`tinta`).
 */
import { imagemVazia } from './pintura.js';
import { BATONS } from './aparencia.js';

/** A folha da boca (o formato das `pinturas` da modelagem): o centro na linha dos lábios do modelo. */
export const FOLHA_DA_BOCA = {
  id: 'boca', nome: 'Boca', parte: 'cabeca', de: 'corpo', em: [0, 160.96, 15.18], dir: [0, 0, -1], cima: [0, 1, 0],
  largura: 7, altura: 3.5, prof: 3, px: [448, 224], espelho: false, noModelo: true, so: 'corpo',
};

// OS LÁBIOS, em cm a partir do centro da folha (x para a direita de quem olha, y para cima). O contorno
// de cima tem o arco do cupido; a linha da boca ondula de leve; os cantos ficam um fio acima do meio.
const CANTO = [2.3, 0.06];
const LINHA = [[-2.3, 0.06], [-1.5, -0.02], [-0.55, 0.03], [0, -0.05], [0.55, 0.03], [1.5, -0.02], [2.3, 0.06]];
const CIMA = [[-2.3, 0.06], [-1.75, 0.36], [-0.95, 0.7], [-0.4, 0.88], [0, 0.68], [0.4, 0.88], [0.95, 0.7], [1.75, 0.36], [2.3, 0.06]];
const BAIXO = [[2.3, 0.06], [1.85, -0.36], [1.05, -0.76], [0, -0.92], [-1.05, -0.76], [-1.85, -0.36], [-2.3, 0.06]];
// as facetas: [o polígono, o brilho k (1 = a cor base)] — por cima umas das outras, nesta ordem
const FACETAS = [
  [[...LINHA, ...BAIXO.slice(1, -1)], 1],                                       // o lábio de baixo
  [[[-1.0, -0.2], [1.0, -0.2], [0.62, -0.62], [-0.62, -0.62]], 1.16],           // … e a faceta clara no meio dele
  [[[-1.85, -0.36], [-1.05, -0.76], [-0.62, -0.62], [-1.0, -0.2]], 0.9],        // … os lados dele, um pouco de sombra
  [[[1.85, -0.36], [1.05, -0.76], [0.62, -0.62], [1.0, -0.2]], 0.9],
  [[...CIMA, ...LINHA.slice(1, -1).reverse()], 0.8],                            // o lábio de cima (virado para baixo: mais escuro)
  [[[-0.4, 0.88], [0, 0.68], [0.4, 0.88], [0.3, 0.42], [-0.3, 0.42]], 0.9],     // … o meio dele, um tom acima
  [[[-2.3, 0.06], [-1.9, 0.24], [-1.95, -0.14]], 0.55],                          // os cantos, recolhidos
  [[[2.3, 0.06], [1.9, 0.24], [1.95, -0.14]], 0.55],
];
const GROSSURA_DA_LINHA = 0.08, BRILHO_DA_LINHA = 0.42;
// a sombra debaixo do lábio de baixo: pele mais escura, meio transparente
const SOMBRA = { poli: [[-1.15, -0.94], [1.15, -0.94], [0.62, -1.34], [-0.62, -1.34]], k: 0.78, alfa: 0.35 };
// o desenho acima é o de uma boca de 4,6 × 1,8 cm; no rosto ela sai `ESCALA` vezes isso (x, y) — no modelo:
// a raça e a modelagem mudam depois (o rosto da humana, de queixo e cabeça menores, a estreita)
const ESCALA = [1.22, 1.2];

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/**
 * A tinta de uma faceta de brilho `k` sobre a base `cor` com `s` de pele: [a cor (r, g, b), a fração de
 * pele]. O que se vê é cor·(1 − s') + pele·s' (comporFolha); com s' = s·k e cor' = cor·k·(1 − s)/(1 − s'),
 * sai k vezes a base, qualquer que seja a pele.
 */
function tinta(cor, s, k) {
  const s2 = Math.min(0.98, s * k), f = (k * (1 - s)) / (1 - s2);
  return [cor.map((c) => Math.min(255, Math.round(c * f))), s2];
}

const imagens = new Map();
/** A imagem da folha da boca para o batom `n` (o número em `BATONS`) — ou null (sem batom). Uma por batom. */
export function imagemDaBoca(n) {
  const b = BATONS[n];
  if (!b?.[1]) return null;
  if (imagens.has(n)) return imagens.get(n);
  const F = FOLHA_DA_BOCA, [w, h] = F.px, cm = w / F.largura;
  const tela = () => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.setTransform(cm * ESCALA[0], 0, 0, -cm * ESCALA[1], w / 2, h / 2);   // (cm do desenho, y para cima)
    return g;
  };
  const caminho = (g, poli) => { g.beginPath(); poli.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  // a COR e a TINTA (o tipo: R = pele) em duas telas OPACAS, e a forma (o alfa) numa terceira: fora dos
  // lábios a cor continua a da borda (filtrada, a beira não puxa para o preto do vazio)
  const base = rgb(b[1]), s = b[2] ?? 0;
  const cor = tela(), tipo = tela(), forma = tela();
  const pintar = (poli, k, de = base, sp = s) => {
    const [c, s2] = tinta(de, sp, k);
    caminho(cor, poli); cor.fillStyle = `rgb(${c})`; cor.fill();
    caminho(tipo, poli); tipo.fillStyle = `rgb(${Math.round(s2 * 255)},0,0)`; tipo.fill();
  };
  const [c0, s0] = tinta(base, s, 1);
  cor.fillStyle = `rgb(${c0})`; cor.fillRect(-F.largura, -F.altura, 2 * F.largura, 2 * F.altura);
  tipo.fillStyle = `rgb(${Math.round(s0 * 255)},0,0)`; tipo.fillRect(-F.largura, -F.altura, 2 * F.largura, 2 * F.altura);
  for (const [poli, k] of FACETAS) pintar(poli, k);
  // a linha da boca (e um fio além dos cantos: a dobra da pele)
  const [cl, sl] = tinta(base, s, BRILHO_DA_LINHA);
  for (const g of [cor, tipo]) {
    g.beginPath(); LINHA.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.lineWidth = GROSSURA_DA_LINHA; g.lineJoin = g.lineCap = 'round';
    g.strokeStyle = g === cor ? `rgb(${cl})` : `rgb(${Math.round(sl * 255)},0,0)`; g.stroke();
  }
  // a forma: os lábios inteiros, e a sombra debaixo deles meio transparente
  forma.fillStyle = '#fff';
  caminho(forma, [...CIMA, ...BAIXO.slice(1, -1)]); forma.fill();
  forma.beginPath(); forma.moveTo(...CANTO.map((v, i) => (i ? v : -v))); forma.lineTo(-CANTO[0] - 0.07, CANTO[1] - 0.04);
  forma.moveTo(...CANTO); forma.lineTo(CANTO[0] + 0.07, CANTO[1] - 0.04);
  forma.lineWidth = GROSSURA_DA_LINHA * 0.7; forma.lineCap = 'round'; forma.strokeStyle = '#fff'; forma.stroke();
  // (a sombra é PELE: a tinta inteira, escurecida — pele·k)
  pintar(SOMBRA.poli, SOMBRA.k, [0, 0, 0], 1);
  caminho(forma, SOMBRA.poli); forma.fillStyle = `rgba(255,255,255,${SOMBRA.alfa})`; forma.fill();
  // o fim dos cantos (a dobra) é da cor da linha
  for (const lado of [-1, 1]) pintar([[lado * CANTO[0], CANTO[1] + 0.06], [lado * (CANTO[0] + 0.2), CANTO[1] - 0.02], [lado * CANTO[0], CANTO[1] - 0.08]], BRILHO_DA_LINHA);
  const dc = cor.getImageData(0, 0, w, h).data, dt = tipo.getImageData(0, 0, w, h).data, df = forma.getImageData(0, 0, w, h).data;
  const img = imagemVazia(w, h);
  for (let i = 0; i < w * h * 4; i += 4) {
    img.cor[i] = dc[i]; img.cor[i + 1] = dc[i + 1]; img.cor[i + 2] = dc[i + 2]; img.cor[i + 3] = df[i];
    img.tipo[i] = dt[i];
  }
  imagens.set(n, img);
  return img;
}

// o corpo FEMININO tem os lábios mais cheios (a folha esticada: x, y). Sem isso a humana, de cabeça e queixo
// menores (racas.json), ficava com a boca fina
const FEMININA = [1.06, 1.18];
/** A folha da boca para o batom `n` (com a imagem dela), ou null — sem batom não há folha. */
export function folhaDaBoca(n, feminina = false) {
  const imagem = imagemDaBoca(n);
  if (!imagem) return null;
  const [kx, ky] = feminina ? FEMININA : [1, 1];
  return { ...FOLHA_DA_BOCA, largura: FOLHA_DA_BOCA.largura * kx, altura: FOLHA_DA_BOCA.altura * ky, arquivo: `boca-${n}`, imagem };
}
