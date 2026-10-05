/**
 * A APARÊNCIA DO PERSONAGEM (04/10/2026) — o editor de personagem: cor da pele, cabelo
 * (com ou sem, e a cor), barba (com ou sem; a cor é a do cabelo, e as sobrancelhas também)
 * e a cor dos olhos. Fica no save (`jogador.aparencia`) e VIAJA com o corpo (o `c` do
 * instantâneo, guerreiro.js: `'<armadura>:<aparência>'`), então os outros veem igual.
 *
 * O CÓDIGO são 5 dígitos: [pele, cabelo (0/1), cor do cabelo, barba (0/1), olhos]; o
 * índice 0 de cada paleta é o ORIGINAL do modelo. `APARENCIA_PADRAO` = como o modelo é.
 *
 * COMO SE PINTA: o modelo do guerreiro tem as cores numa TEXTURA (a paleta), e a cor de
 * vértice dele é branca. Cada vértice de pele/cabelo/barba/olho ganha uma cor de vértice
 * = cor pedida ÷ cor média daquela região na textura: multiplicada pela textura no
 * shader, dá a cor pedida e GUARDA a luz e a sombra que a textura tinha. A pele é achada
 * pela UV (a faixa de pele da paleta, `FAIXA_PELE`), o cabelo/barba/olhos pela peça.
 * Tudo vira geometrias tingidas (uma vez por peça e cor, divididas por todos), que
 * entram na malha fundida no lugar das peças originais (`tingir`, chamado no `vestir`).
 */
import * as THREE from 'three';

export const PELES = [
  // (tons pensados para a luz do jogo: a paleta original do modelo é #f8bb7f)
  ['Original', null], ['Clara', '#ffcfa0'], ['Morena clara', '#e8ae80'], ['Morena', '#cf9061'], ['Parda', '#ad7148'], ['Negra', '#80523a'],
];
export const CABELOS = [
  ['Original', null], ['Preto', '#1e1712'], ['Castanho', '#4b2f1b'], ['Castanho claro', '#7b4c27'], ['Loiro', '#c99f5c'], ['Ruivo', '#a3431f'], ['Grisalho', '#8c8a86'], ['Branco', '#e6e0d2'],
];
export const OLHOS = [
  ['Original', null], ['Azuis', '#3f6fb8'], ['Verdes', '#4a8c4c'], ['Castanhos', '#6a4528'], ['Cinzentos', '#8a8f9c'],
];
export const APARENCIA_PADRAO = '01010';
const CODIGO = /^[0-9]{5}$/;

/** Lê um código (ou o padrão, se torto): { pele, cabelo, cor, barba, olhos }. */
export function lerAparencia(c) {
  const s = CODIGO.test(c ?? '') ? c : APARENCIA_PADRAO;
  const d = [...s].map(Number);
  return {
    pele: d[0] < PELES.length ? d[0] : 0, cabelo: d[1] ? 1 : 0, cor: d[2] < CABELOS.length ? d[2] : 0,
    barba: d[3] ? 1 : 0, olhos: d[4] < OLHOS.length ? d[4] : 0,
  };
}
export const codigoDaAparencia = (a) => `${a.pele}${a.cabelo}${a.cor}${a.barba}${a.olhos}`;
export const aparenciaValida = (c) => CODIGO.test(c ?? '');

// ------------------------------------------------------------ a textura
const FAIXA_PELE = { u: [0.33, 0.46], v: [0.28, 0.34] };
const PECAS_DE_PELE = ['head', 'neck', 'Face', 'Trapezius', 'Shoulder', 'Upper_Torso', 'Lower_Torso', 'arm', 'Forearm', 'Hand', 'thigh', 'shin', 'Feet', 'hips'];
let pixels = null;
function lerTextura(mapa) {
  if (pixels !== null) return pixels;
  pixels = undefined;
  const img = mapa?.image;
  if (!img?.width) return pixels;
  try {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    pixels = { w: c.width, h: c.height, d: g.getImageData(0, 0, c.width, c.height).data };
  } catch { /* sem leitura: a aparência não tinge (fica a original) */ }
  return pixels;
}
const linear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** a cor (linear) da textura numa UV (glTF: flipY falso — v cresce para baixo) */
function texel(px, u, v) {
  const x = Math.min(px.w - 1, Math.max(0, Math.floor(u * px.w))), y = Math.min(px.h - 1, Math.max(0, Math.floor(v * px.h)));
  const i = (y * px.w + x) * 4;
  return [linear(px.d[i]), linear(px.d[i + 1]), linear(px.d[i + 2])];
}
const naPele = (u, v) => u >= FAIXA_PELE.u[0] && u <= FAIXA_PELE.u[1] && v >= FAIXA_PELE.v[0] && v <= FAIXA_PELE.v[1];

/** O tom pedido ÷ a média dos texels escolhidos (as cores de vértice que dão o tom pedido). */
function razao(px, uv, escolhe, hex) {
  const s = [0, 0, 0]; let n = 0;
  for (let i = 0; i < uv.count; i++) {
    if (!escolhe(i)) continue;
    const t = texel(px, uv.getX(i), uv.getY(i));
    s[0] += t[0]; s[1] += t[1]; s[2] += t[2]; n++;
  }
  if (!n) return null;
  const alvo = new THREE.Color(hex);   // (linear)
  return [alvo.r / Math.max(0.02, s[0] / n), alvo.g / Math.max(0.02, s[1] / n), alvo.b / Math.max(0.02, s[2] / n)];
}

const tingidas = new Map();
/**
 * A peça do corpo com a aparência aplicada (um objeto no formato da malha fundida), ou a
 * própria peça (nada a tingir nela), ou null (a peça some: sem cabelo / sem barba).
 */
export function tingir(peca, codigo) {
  const a = lerAparencia(codigo), nome = peca.name;
  if (nome === 'Hair' && !a.cabelo) return null;
  if (nome === 'Beard' && !a.barba) return null;
  let hex = null, escolhe = null;
  const uv = peca.geometry.attributes.uv;
  if (!uv) return peca;
  if (PECAS_DE_PELE.includes(nome) && PELES[a.pele][1]) { hex = PELES[a.pele][1]; escolhe = (i) => naPele(uv.getX(i), uv.getY(i)); }
  else if ((nome === 'Hair' || nome === 'Beard' || nome === 'Eye_Brows') && CABELOS[a.cor][1]) { hex = CABELOS[a.cor][1]; escolhe = () => true; }
  else if (nome === 'Eyes' && OLHOS[a.olhos][1]) {
    hex = OLHOS[a.olhos][1];
    const px0 = lerTextura(peca.material?.map);
    // a íris: o que não é o branco do olho
    escolhe = (i) => { if (!px0) return false; const t = texel(px0, uv.getX(i), uv.getY(i)); return t[0] + t[1] + t[2] < 1.6; };
  }
  if (!hex) return peca;
  const chave = `${nome}|${hex}`;
  if (!tingidas.has(chave)) {
    const px = lerTextura(peca.material?.map);
    let geo = null;
    if (px) {
      // a pele: UMA razão para todas as peças de pele (senão cada peça sairia num tom
      // diferente); o resto, a média da própria peça
      let r;
      if (PECAS_DE_PELE.includes(nome)) {
        tingidas.razaoPele ??= new Map();
        r = tingidas.razaoPele.get(hex) ?? null;
        if (!r) { r = razao(px, uv, escolhe, hex); tingidas.razaoPele.set(hex, r); }
      } else r = razao(px, uv, escolhe, hex);
      if (r) {
        geo = peca.geometry.clone();
        const cor = new Float32Array(uv.count * 3).fill(1);
        for (let i = 0; i < uv.count; i++) if (escolhe(i)) { cor[i * 3] = r[0]; cor[i * 3 + 1] = r[1]; cor[i * 3 + 2] = r[2]; }
        geo.setAttribute('color', new THREE.BufferAttribute(cor, 3));
      }
    }
    tingidas.set(chave, geo);
  }
  const geometry = tingidas.get(chave);
  return geometry ? { name: `${nome}_tingido`, geometry, skeleton: peca.skeleton, material: peca.material, bindMatrix: peca.bindMatrix } : peca;
}

// ------------------------------------------------------------ o painel (o editor no jogo)
const LINHAS = [
  ['pele', 'Pele', () => PELES.map((p) => p[0])],
  ['cabelo', 'Cabelo', () => ['Sem cabelo', 'Com cabelo']],
  ['cor', 'Cor do cabelo e da barba', () => CABELOS.map((p) => p[0])],
  ['barba', 'Barba', () => ['Sem barba', 'Com barba']],
  ['olhos', 'Olhos', () => OLHOS.map((p) => p[0])],
];

/**
 * O EDITOR DE PERSONAGEM no jogo (`game.menu = 'aparencia'`): um painel com ◀ ▶ por
 * opção, a câmera no rosto do jogador, e o corpo mudando na hora. "Pronto" grava.
 */
export class EditorDeAparencia {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('aparencia');
    this.lista = document.getElementById('aparencia-lista');
    document.getElementById('aparencia-pronto').addEventListener('click', () => game.closeMenu());
    document.getElementById('aparencia-sorte').addEventListener('click', () => {
      const r = (n) => Math.floor(Math.random() * n);
      this.mudar({ pele: 1 + r(PELES.length - 1), cabelo: Math.random() < 0.85 ? 1 : 0, cor: 1 + r(CABELOS.length - 1), barba: Math.random() < 0.6 ? 1 : 0, olhos: r(OLHOS.length) });
    });
  }

  get aberto() { return !this.el.classList.contains('hidden'); }

  abrir() {
    this.el.classList.remove('hidden');
    this.desenhar();
  }
  fechar() { this.el.classList.add('hidden'); }

  mudar(parcial) {
    const p = this.game.player;
    p.aparencia = codigoDaAparencia({ ...lerAparencia(p.aparencia), ...parcial });
    p.refreshEquipment();
    this.desenhar();
  }

  desenhar() {
    const a = lerAparencia(this.game.player.aparencia);
    this.lista.innerHTML = '';
    for (const [k, rotulo, opcoes] of LINHAS) {
      const ops = opcoes(), linha = document.createElement('div');
      linha.className = 'aparencia-linha';
      linha.innerHTML = `<span class="rotulo">${rotulo}</span><button class="seta" data-d="-1">◀</button><span class="valor">${ops[a[k]]}</span><button class="seta" data-d="1">▶</button>`;
      for (const b of linha.querySelectorAll('.seta')) {
        b.addEventListener('click', () => this.mudar({ [k]: (a[k] + Number(b.dataset.d) + ops.length) % ops.length }));
      }
      this.lista.appendChild(linha);
    }
  }

  /** a câmera de frente para o rosto (chamada no laço, depois da câmera de sempre) */
  camera(cam) {
    const p = this.game.player, f = p.facing;
    const y = p.pos.y + 1.55;
    cam.position.set(p.pos.x + Math.sin(f) * 1.25 - Math.cos(f) * 0.35, y + 0.08, p.pos.z + Math.cos(f) * 1.25 + Math.sin(f) * 0.35);
    cam.lookAt(p.pos.x - Math.cos(f) * 0.25, y - 0.05, p.pos.z + Math.sin(f) * 0.25);
  }
}
