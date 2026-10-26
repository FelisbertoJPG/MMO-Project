/**
 * A SOMBRA DOS OLHOS (26/10/2026, o dono: "a possibilidade da maquiagem", com a foto de uma personagem gótica — a sombra
 * escura esfumada em volta dos olhos). Como o batom (boca.js): uma FOLHA da pintura (pintura.js) feita aqui, em código,
 * projetada no rosto no MODELO (`noModelo`: o lugar do olho é o mesmo para todos os corpos — a malha base) e ESPELHADA no
 * outro olho; cada ponto vai para onde aquele lugar da pele foi parar (a raça, a modelagem, a animação). Só pinta a pele
 * (`so: 'corpo'`): o olho, os cílios, as sobrancelhas e o cabelo ficam por cima.
 *
 * É ESFUMADA — o alfa cai devagar até a pele, sem beirada: o escuro na pálpebra de cima, subindo até perto da sobrancelha
 * e puxado para fora e para cima no canto (o "olho de gato" da referência), e uma faixa mais fina e mais clara embaixo.
 * As cores são as de `SOMBRAS` (aparencia.js): [nome, cor, força — o alfa no mais escuro].
 */
import { imagemVazia } from './pintura.js';
import { SOMBRAS } from './aparencia.js';

// a folha em volta do olho do lado +x (cm, no MODELO, pose T: a peça `Eyes` vai de x 2,9 a 7,1 e de y 170,6 a 172,6; o
// x da folha é o do modelo, o y para cima) — o outro olho é o espelho
export const FOLHA_DA_SOMBRA = {
  id: 'sombra', nome: 'Sombra', parte: 'cabeca', de: 'corpo', em: [5, 171.6, 12.4], dir: [0, 0, -1], cima: [0, 1, 0],
  largura: 8, altura: 5, prof: 2.8, px: [640, 400], espelho: true, noModelo: true, so: 'corpo',
};
// as manchas que somam a sombra: [x, y do meio (cm, no modelo), raio em x, raio em y, giro (graus), alfa no meio, onde o
// alfa começa a cair (fração do raio)]
const MANCHAS = [
  [5.0, 172.15, 2.9, 1.45, 4, 0.95, 0.5],     // a pálpebra de cima, até perto da sobrancelha
  [7.15, 172.35, 1.55, 0.72, 24, 0.9, 0.35],  // o canto de fora, puxado para fora e para cima
  [5.1, 170.85, 2.5, 0.62, 0, 0.6, 0.3],      // a de baixo, mais fina e mais clara
];

const imagens = new Map();
/** A imagem da folha da sombra `n` (o número em `SOMBRAS`) — ou null (sem sombra). Uma por sombra. */
export function imagemDaSombra(n) {
  const s = SOMBRAS[n];
  if (!s?.[1]) return null;
  if (imagens.has(n)) return imagens.get(n);
  const F = FOLHA_DA_SOMBRA, [w, h] = F.px, cm = w / F.largura;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.setTransform(cm, 0, 0, -cm, w / 2, h / 2);   // (cm no modelo a partir do centro da folha, y para cima)
  // cada mancha: um degradê redondo, achatado e girado (o alfa vai no branco; a cor entra depois)
  for (const [x, y, rx, ry, giro, alfa, cai] of MANCHAS) {
    g.save();
    g.translate(x - F.em[0], y - F.em[1]); g.rotate((giro * Math.PI) / 180); g.scale(rx, ry);
    const d = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    d.addColorStop(0, `rgba(255,255,255,${alfa})`); d.addColorStop(cai, `rgba(255,255,255,${alfa})`); d.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = d;
    g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  const forma = g.getImageData(0, 0, w, h).data, img = imagemVazia(w, h), n16 = parseInt(s[1].slice(1), 16), rgb = [(n16 >> 16) & 255, (n16 >> 8) & 255, n16 & 255];
  for (let i = 0; i < w * h * 4; i += 4) {
    img.cor[i] = rgb[0]; img.cor[i + 1] = rgb[1]; img.cor[i + 2] = rgb[2];
    img.cor[i + 3] = Math.round(forma[i + 3] * s[2]);
  }
  imagens.set(n, img);
  return img;
}

/** A folha da sombra `n` (com a imagem dela), ou null — sem sombra não há folha. */
export function folhaDaSombra(n) {
  const imagem = imagemDaSombra(n);
  if (!imagem) return null;
  return { ...FOLHA_DA_SOMBRA, arquivo: `sombra-${n}`, imagem };
}
