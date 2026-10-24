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
  largura: 8, altura: 2.6, prof: 3, px: [640, 208], espelho: false, noModelo: true, so: 'corpo',
};

// OS LÁBIOS = os VÉRTICES dos lábios do modelo (24/10/2026, pedido do dono: o batom estava "bugado" — era um desenho
// à parte, de 4,6 × 1,8 cm esticado, com os cantos em x ±3 enquanto os da malha estão em ±3,74, e na humana descia
// 1,3 cm abaixo da linha da boca, no queixo, quando o lábio de baixo vai até 0,75; e, com o contorno fora das arestas,
// ao mover os vértices da boca o desenho entortava). Agora cada contorno passa pelos vértices — o canto, o alto do lábio
// de cima, a linha da boca, o lábio de baixo — no MODELO (cm, a partir do centro da folha; a malha base é a mesma para
// todos os corpos): a tinta cobre exatamente os triângulos dos lábios e segue cada vértice movido na modelagem.
const Y0 = FOLHA_DA_BOCA.em[1], P = (x, y) => [x, y - Y0];
const CANTO = P(3.743, 160.842);
const CIMA = [P(-3.743, 160.842), P(-0.531, 161.861), P(0, 161.862), P(0.531, 161.861), P(3.743, 160.842)];            // o alto do lábio de cima
const LINHA = [P(-3.743, 160.842), P(-0.531, 160.963), P(0, 160.963), P(0.531, 160.963), P(3.743, 160.842)];           // a linha da boca
const BAIXO = [P(3.743, 160.842), P(0.531, 160.213), P(0, 160.21), P(-0.531, 160.213), P(-3.743, 160.842)];            // o lábio de baixo
// as facetas: [o polígono, o brilho k (1 = a cor base), o claro (0 a 1: o quanto vai para o branco — o brilho do lábio
// de baixo, que num batom escuro, só multiplicado, nem aparecia)] — por cima umas das outras, nesta ordem
const FACETAS = [
  [[P(-3.743, 160.842), P(0, 160.963), ...BAIXO.slice(0, -1)], 1],                                                    // o lábio de baixo
  [[P(-0.8, 160.84), P(0.8, 160.84), P(0.45, 160.46), P(-0.45, 160.46)], 1, 0.16],                                    // … a faceta clara no meio dele
  [[P(-2.1, 160.5), P(-0.531, 160.213), P(-0.8, 160.84), P(-2.1, 160.86)], 0.88],                                     // … os lados dele, um pouco de sombra
  [[P(2.1, 160.5), P(0.531, 160.213), P(0.8, 160.84), P(2.1, 160.86)], 0.88],
  [[...CIMA, ...LINHA.slice(1, -1).reverse()], 0.78],                                                                 // o lábio de cima (virado para baixo: mais escuro)
  [[P(-0.531, 161.861), P(0, 161.862), P(0.531, 161.861), P(0.38, 161.36), P(-0.38, 161.36)], 0.9],                  // … o meio dele, um tom acima
  [[P(-3.743, 160.842), P(-3.1, 161.04), P(-3.1, 160.62)], 0.55],                                                     // os cantos, recolhidos
  [[P(3.743, 160.842), P(3.1, 161.04), P(3.1, 160.62)], 0.55],
];
const GROSSURA_DA_LINHA = 0.08, BRILHO_DA_LINHA = 0.42;
// a sombra debaixo do lábio de baixo: pele mais escura, meio transparente (no alto do queixo)
const SOMBRA = { poli: [[-0.5, P(0, 160.2)[1]], [0.5, P(0, 160.2)[1]], [0.3, P(0, 159.95)[1]], [-0.3, P(0, 159.95)[1]]], k: 0.8, alfa: 0.3 };

const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/**
 * A tinta de uma faceta de brilho `k` sobre a base `cor` com `s` de pele: [a cor (r, g, b), a fração de
 * pele]. O que se vê é cor·(1 − s') + pele·s' (comporFolha); com s' = s·k e cor' = cor·k·(1 − s)/(1 − s'),
 * sai k vezes a base, qualquer que seja a pele.
 */
function tinta(cor, s, k, claro = 0) {
  const s2 = Math.min(0.98, s * k), f = (k * (1 - s)) / (1 - s2);
  return [cor.map((c) => Math.min(255, Math.round(c * f + (255 - c * f) * claro))), s2];
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
    g.setTransform(cm, 0, 0, -cm, w / 2, h / 2);   // (cm no modelo a partir do centro da folha, y para cima)
    return g;
  };
  const caminho = (g, poli) => { g.beginPath(); poli.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  // a COR e a TINTA (o tipo: R = pele) em duas telas OPACAS, e a forma (o alfa) numa terceira: fora dos
  // lábios a cor continua a da borda (filtrada, a beira não puxa para o preto do vazio)
  const base = rgb(b[1]), s = b[2] ?? 0;
  const cor = tela(), tipo = tela(), forma = tela();
  const pintar = (poli, k, de = base, sp = s, claro = 0) => {
    const [c, s2] = tinta(de, sp, k, claro);
    caminho(cor, poli); cor.fillStyle = `rgb(${c})`; cor.fill();
    caminho(tipo, poli); tipo.fillStyle = `rgb(${Math.round(s2 * 255)},0,0)`; tipo.fill();
  };
  const [c0, s0] = tinta(base, s, 1);
  cor.fillStyle = `rgb(${c0})`; cor.fillRect(-F.largura, -F.altura, 2 * F.largura, 2 * F.altura);
  tipo.fillStyle = `rgb(${Math.round(s0 * 255)},0,0)`; tipo.fillRect(-F.largura, -F.altura, 2 * F.largura, 2 * F.altura);
  for (const [poli, k, claro] of FACETAS) pintar(poli, k, base, s, claro);
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
    // (o ALFA da forma — lido do vermelho, a sombra "meio transparente" saía opaca e a beira dos lábios, serrilhada)
    img.cor[i] = dc[i]; img.cor[i + 1] = dc[i + 1]; img.cor[i + 2] = dc[i + 2]; img.cor[i + 3] = df[i + 3];
    img.tipo[i] = dt[i];
  }
  imagens.set(n, img);
  return img;
}

/**
 * A folha da boca para o batom `n` (com a imagem dela), ou null — sem batom não há folha. (O corpo feminino era
 * esticado à parte — `feminina` — para os lábios saírem cheios; com o desenho nos vértices, a boca de cada corpo é a
 * malha dele: a raça e a modelagem dão o tamanho.)
 */
export function folhaDaBoca(n) {
  const imagem = imagemDaBoca(n);
  if (!imagem) return null;
  return { ...FOLHA_DA_BOCA, arquivo: `boca-${n}`, imagem };
}
