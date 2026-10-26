/**
 * A APARÊNCIA DO PERSONAGEM (04/10/2026) — o editor de personagem: cor da pele, cabelo
 * (o penteado, ou sem, e a cor), barba e sobrancelhas (o modelo delas, ou sem; a cor é a do
 * cabelo) e a cor dos olhos. Fica no save (`jogador.aparencia`) e VIAJA com o corpo (o `c` do
 * instantâneo, guerreiro.js: `'<armadura>:<aparência>'`), então os outros veem igual.
 *
 * O CÓDIGO são 5 dígitos: [pele, cabelo, cor do cabelo, barba, olhos]; o índice 0
 * de cada paleta é o ORIGINAL do modelo. `APARENCIA_PADRAO` = como o modelo é.
 * O CABELO é 0 (sem) ou o número do PENTEADO (penteado.js: o rabo de cavalo, a trança, o
 * moicano… desenhados em código) na lista do humano ou da raça. O cabelo solto do modelo
 * saiu do jogo (12/10/2026): o "1" dos saves de antes é hoje o primeiro penteado.
 * A BARBA é igual: 0 (sem) ou o número dela na lista (`BARBAS` do penteado.js) — a 1 é a
 * do modelo inteira, a "Cheia" (o "com barba" dos saves de antes).
 * Um 7º dígito, quando há, é a SOBRANCELHA (0 = sem; n = a n-ésima da lista,
 * `SOBRANCELHAS`): sem ele vale a 1, a do modelo — por isso o código só ganha os dois
 * dígitos a mais (a raça, mesmo 0, e a sobrancelha) quando ela não é a de sempre.
 * Um 6º dígito, quando há, é a RAÇA (raca.js; sem ele, humano): ela pode mandar na cor
 * da pele e dos olhos e tirar o cabelo e a barba, e muda as proporções do corpo.
 * Um 8º, o SEXO (0 = masculino, o de sempre; 1 = feminino — raca.js `racaDe`): só vai no
 * código quando é 1 (aí a raça e a sobrancelha vão sempre).
 * Um 9º, o BATOM (0 = sem, o de sempre; n = o n-ésimo de `BATONS` — os lábios pintados, boca.js):
 * só vai no código quando não é 0, e aí vão os 9 (o sexo também, 0 ou 1). Código sem ele = sem batom.
 *
 * COMO SE PINTA: o modelo do guerreiro tem as cores numa TEXTURA (a paleta), e a cor de
 * vértice dele é branca. Cada vértice de pele/cabelo/barba/olho ganha uma cor de vértice
 * = cor pedida ÷ cor média daquela região na textura: multiplicada pela textura no
 * shader, dá a cor pedida e GUARDA a luz e a sombra que a textura tinha. A pele é achada
 * pela UV (a faixa de pele da paleta, `FAIXA_PELE`), os olhos pela peça. (O cabelo, a barba
 * e as sobrancelhas não são tingidos: o penteado.js já os desenha na cor.)
 * Tudo vira geometrias tingidas (uma vez por peça e cor, divididas por todos), que
 * entram na malha fundida no lugar das peças originais (`tingir`, chamado no `vestir`).
 */
import * as THREE from 'three';
import { Assets } from './assets.js';
import { tela, pontoNaTela, retanguloNaTela } from './tela.js';
import { racaDe, proporcoesDe, sexosDe, temFeminino, temArquivo, esculpidoDe } from './raca.js';
import { penteadosDe, nomeDoPenteado, barbasDe, nomeDaBarba, sobrancelhasDe, nomeDaSobrancelha } from './penteado.js';

export const PELES = [
  // (tons pensados para a luz do jogo: a paleta original do modelo é #f8bb7f)
  ['Original', null], ['Clara', '#ffcfa0'], ['Morena clara', '#e8ae80'], ['Morena', '#cf9061'], ['Parda', '#ad7148'], ['Negra', '#80523a'],
];
// O TOM DE PELE LIVRE (26/10/2026, o dono: "mudar a cor do personagem humano dentro do espectro bege a preto — cores
// humanas mesmo", na Aparência do jogo também): `tom` de 0 a 99, do bege mais claro ao quase preto, passando pelos tons
// de PELES (os pontos da régua: `TONS`). No código, os dígitos 10 e 11 (com os 9 de antes inteiros); o código sem eles
// (o de todos até aqui) segue com o tom da lista PELES pelo 1º dígito.
const TONS = ['#ffe2c6', '#ffcfa0', '#e8ae80', '#cf9061', '#ad7148', '#80523a', '#5c3828', '#3a2219'];
export const TOM_MAX = 99;
// (onde cada tom da lista PELES cai na régua — o "Original", o do modelo, entre a Clara e a Morena clara)
export const TOM_DE_PELE = [20, 14, 28, 42, 57, 71];
export function corDoTom(t) {
  const x = (Math.min(TOM_MAX, Math.max(0, t)) / TOM_MAX) * (TONS.length - 1), i = Math.min(TONS.length - 2, Math.floor(x)), f = x - i;
  const a = parseInt(TONS[i].slice(1), 16), b = parseInt(TONS[i + 1].slice(1), 16);
  const c = [16, 8, 0].map((s) => Math.round(((a >> s) & 255) * (1 - f) + ((b >> s) & 255) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
/** a cor da pele de uma aparência lida (o tom livre, ou o da lista; null = a do modelo) */
export const corDaPele = (a) => (a.tom != null ? corDoTom(a.tom) : PELES[a.pele]?.[1] ?? null);
/** a régua em CSS (o fundo dela no painel) */
export const GRADIENTE_DA_PELE = `linear-gradient(90deg, ${TONS.join(', ')})`;
// (a ORDEM é o número no save, o 3º dígito: cor nova entra no FIM — no máximo 10)
export const CABELOS = [
  ['Original', null], ['Preto', '#1e1712'], ['Castanho', '#4b2f1b'], ['Castanho claro', '#7b4c27'], ['Loiro', '#c99f5c'], ['Ruivo', '#a3431f'], ['Grisalho', '#8c8a86'], ['Branco', '#e6e0d2'], ['Vinho', '#74202a'], ['Vermelho', '#c0262c'],
];
export const OLHOS = [
  ['Original', null], ['Azuis', '#3f6fb8'], ['Verdes', '#4a8c4c'], ['Castanhos', '#6a4528'], ['Cinzentos', '#8a8f9c'],
];
// O BATOM (19/10/2026; os lábios, boca.js): [nome, a cor, quanto dela é a PELE de quem veste (0 a 1)].
// O "Natural" é a boca sem maquiagem: a pele, mais rosada. (A ORDEM é o número no save, o 9º dígito:
// cor nova entra no FIM — no máximo 10.)
export const BATONS = [
  ['Sem batom', null, 0], ['Natural', '#b04a58', 0.55], ['Vermelho', '#b3121f', 0], ['Vinho', '#5c0d1c', 0], ['Rosa', '#d0587e', 0],
  ['Coral', '#e0644e', 0], ['Nude', '#b07463', 0], ['Roxo', '#4b1d4f', 0], ['Preto', '#1c1418', 0],
];
// A SOMBRA DOS OLHOS (26/10/2026; sombra.js — a maquiagem esfumada em volta dos olhos): [nome, cor, força (o alfa no mais
// escuro)]. (A ORDEM é o número no save, o 13º dígito: sombra nova entra no FIM — no máximo 10.)
export const SOMBRAS = [
  ['Sem sombra', null, 0], ['Esfumada preta', '#16121a', 0.92], ['Esfumada marrom', '#3b2418', 0.85], ['Esfumada vinho', '#4a1222', 0.85],
  ['Esfumada roxa', '#33183f', 0.85], ['Esfumada cinza', '#3c3c44', 0.8], ['Dourada', '#9a7432', 0.7],
];
export const APARENCIA_PADRAO = '01010';
const CODIGO = /^(?:[0-9]{5,9}|[0-9]{11,13})$/;

/** Lê um código (ou o padrão, se torto): { pele, cabelo, cor, barba, olhos, raca, sobrancelha, sexo, batom, tom, sombra }. */
export function lerAparencia(c) {
  const s = CODIGO.test(c ?? '') ? c : APARENCIA_PADRAO;
  const d = [...s].map(Number);
  return {
    pele: d[0] < PELES.length ? d[0] : 0, cabelo: d[1] + (s.length >= 12 ? d[11] * 10 : 0), cor: d[2] < CABELOS.length ? d[2] : 0,
    barba: d[3], olhos: d[4] < OLHOS.length ? d[4] : 0, raca: d[5] ?? 0, sobrancelha: d[6] ?? 1, sexo: d[7] === 1 || d[7] === 2 ? d[7] : 0,
    batom: d[8] < BATONS.length ? d[8] : 0, tom: s.length >= 11 ? d[9] * 10 + d[10] : null, sombra: s.length >= 13 && d[12] < SOMBRAS.length ? d[12] : 0,
  };
}
// (humano de sobrancelha normal: os 5 dígitos de sempre; a raça é o 6º; a sobrancelha que não é a do modelo pede os 7; o feminino, os 8; o batom, os 9;
// o TOM livre, os 11 — os 9 inteiros e ele em 2 dígitos; o CABELO de número 10 em diante, os 12 — o 12º é a dezena dele
// (as listas passaram de 9: a humana tem 10 penteados); a SOMBRA dos olhos, os 13. Sem tom e com um dos dois, o tom é o
// da lista PELES na régua — `TOM_DE_PELE` —, e a pele passa a ir por ele)
export function codigoDaAparencia(a) {
  const sobrancelha = a.sobrancelha ?? 1, alto = a.cabelo > 9 || a.sombra > 0;
  if (a.tom != null || alto) {
    const tom = String(Math.min(TOM_MAX, Math.max(0, Math.round(a.tom ?? TOM_DE_PELE[a.pele] ?? TOM_DE_PELE[0])))).padStart(2, '0');
    return `0${a.cabelo % 10}${a.cor}${a.barba}${a.olhos}${a.raca || 0}${sobrancelha}${a.sexo || 0}${a.batom || 0}${tom}${alto ? Math.floor(a.cabelo / 10) : ''}${a.sombra > 0 ? a.sombra : ''}`;
  }
  const cauda = a.batom ? `${a.raca || 0}${sobrancelha}${a.sexo || 0}${a.batom}`
    : a.sexo ? `${a.raca || 0}${sobrancelha}${a.sexo}` : sobrancelha === 1 ? a.raca || '' : `${a.raca || 0}${sobrancelha}`;
  return `${a.pele}${a.cabelo}${a.cor}${a.barba}${a.olhos}${cauda}`;
}
export const aparenciaValida = (c) => CODIGO.test(c ?? '');

// ------------------------------------------------------------ a textura
export const FAIXA_PELE = { u: [0.33, 0.46], v: [0.28, 0.34] };
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
/** A cor (linear) da paleta num ponto (u, v), ou null (sem leitura) — corpo-arquivo.js pinta por cima dela. */
export function corNaPaleta(mapa, u, v) { const px = lerTextura(mapa); return px ? texel(px, u, v) : null; }
export const naPele = (u, v) => u >= FAIXA_PELE.u[0] && u <= FAIXA_PELE.u[1] && v >= FAIXA_PELE.v[0] && v <= FAIXA_PELE.v[1];

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
/** Esquece as peças tingidas (o editor de raças, depois de mudar uma cor). */
export function esquecerTingidas() { for (const g of tingidas.values()) g?.dispose?.(); tingidas.clear(); delete tingidas.razaoPele; }
/**
 * A peça do corpo com a aparência aplicada (um objeto no formato da malha fundida), ou a
 * própria peça (nada a tingir nela).
 */
export function tingir(peca, codigo) {
  const a = lerAparencia(codigo), nome = peca.name, raca = racaDe(a.raca, a.sexo);
  const pele = raca?.pele ?? corDaPele(a), olhos = raca?.olhos ?? OLHOS[a.olhos][1];
  let hex = null, escolhe = null;
  const uv = peca.geometry.attributes.uv;
  if (!uv) return peca;
  // (`peca.pele`: uma peça de pele que a raça acrescentou — o busto, raca.js)
  const dePele = PECAS_DE_PELE.includes(nome) || !!peca.pele;
  if (dePele && pele) { hex = pele; escolhe = (i) => naPele(uv.getX(i), uv.getY(i)); }
  else if (nome === 'Eyes' && olhos) {
    hex = olhos;
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
      if (dePele) {
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
// [chave, rótulo, as opções (dada a raça), some quando a raça manda nisso (dada a raça e a aparência)]
const LINHAS = [
  ['raca', 'Raça', () => racasDoPainel().map((r) => r.nome), () => racasDoPainel().length < 2],
  // (o sexo só aparece para a raça que TEM o corpo feminino no arquivo — ou o corpo de ARQUIVO, o 3º: raca.js)
  ['sexo', 'Sexo', (r, a) => sexosDe(a.raca), (r, a) => sexosDe(a.raca).length < 2],
  ['pele', 'Pele', () => PELES.map((p) => p[0]), (r) => !!r?.pele],
  ['cabelo', 'Cabelo', (r) => ['Sem cabelo', ...penteadosDe(r).map(nomeDoPenteado)], (r) => !penteadosDe(r).length],
  ['cor', 'Cor do cabelo e da barba', () => CABELOS.map((p) => p[0])],
  ['barba', 'Barba', (r) => ['Sem barba', ...barbasDe(r).map(nomeDaBarba)], (r) => !barbasDe(r).length],
  ['sobrancelha', 'Sobrancelhas', (r) => ['Sem sobrancelhas', ...sobrancelhasDe(r).map(nomeDaSobrancelha)], (r) => !sobrancelhasDe(r).length],
  ['olhos', 'Olhos', () => OLHOS.map((p) => p[0]), (r) => !!r?.olhos],
  // (o corpo de ARQUIVO tem o rosto dele: sem batom nem sombra — corpo-arquivo.js)
  ['batom', 'Batom', () => BATONS.map((b) => b[0]), (r) => !!r?.arquivo],
  ['sombra', 'Sombra nos olhos', () => SOMBRAS.map((s) => s[0]), (r) => !!r?.arquivo],
];
/** As raças que o jogador pode escolher: o humano e as `jogavel` do arquivo ({ n, nome }). */
const racasDoPainel = () => [{ n: 0, nome: 'Humano' }, ...Assets.racas.map((r, i) => ({ n: i + 1, nome: r.nome, jogavel: r.jogavel })).filter((r) => r.jogavel)];

/**
 * O EDITOR DE PERSONAGEM no jogo (`game.menu = 'aparencia'`): um painel com ◀ ▶ por
 * opção, a câmera no rosto do jogador, e o corpo mudando na hora. "Pronto" grava.
 * ARRASTAR fora do painel (mouse ou dedo) gira a vista em volta do personagem: o rabo de
 * cavalo e as tranças ficam nas costas, e de frente não se viam. A RODA do mouse e a PINÇA
 * (dois dedos) aproximam e afastam (`dist`, de `DIST_MIN` — o rosto enche a tela — a
 * `DIST_MAX` — o corpo inteiro).
 */
const DIST_MIN = 0.42, DIST_PADRAO = 1.25, DIST_MAX = 3.2;
const _alvo = new THREE.Vector3(), _cam = new THREE.Vector3();
export class EditorDeAparencia {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('aparencia');
    this.lista = document.getElementById('aparencia-lista');
    document.getElementById('aparencia-pronto').addEventListener('click', () => game.closeMenu());
    document.getElementById('aparencia-sorte').addEventListener('click', () => {
      const r = (n) => Math.floor(Math.random() * n);
      // (a raça não entra no sorteio: é escolha)
      const agora = lerAparencia(game.player.aparencia), raca = racaDe(agora.raca, agora.sexo), penteados = penteadosDe(raca).length, barbas = barbasDe(raca).length, sobrancelhas = sobrancelhasDe(raca).length;
      // (o batom só no sorteio do corpo feminino; no masculino, sai)
      this.mudar({ pele: 0, tom: r(TOM_MAX + 1), cabelo: penteados && Math.random() < 0.85 ? 1 + r(penteados) : 0, cor: 1 + r(CABELOS.length - 1), barba: barbas && Math.random() < 0.6 ? 1 + r(barbas) : 0, olhos: r(OLHOS.length), sobrancelha: sobrancelhas ? 1 + r(sobrancelhas) : 0, batom: agora.sexo ? r(BATONS.length) : 0, sombra: agora.sexo && Math.random() < 0.4 ? 1 + r(SOMBRAS.length - 1) : 0 });
    });
    // a volta da vista: 0 = de frente para o rosto, π = as costas
    this.giro = 0;
    this.dist = DIST_PADRAO;
    // os dedos (ou o mouse) apertados FORA do painel: um gira, dois fazem a pinça
    this.dedos = new Map();
    const pinca = () => { const [a, b] = [...this.dedos.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    // (os pontos no sistema da página girada pelo CSS no iPhone: tela.js)
    addEventListener('pointerdown', (e) => { if (this.aberto && !e.target.closest?.('#aparencia')) this.dedos.set(e.pointerId, pontoNaTela(e.clientX, e.clientY)); });
    addEventListener('pointermove', (e) => {
      const d = this.dedos.get(e.pointerId);
      if (!d || !this.aberto) return;
      const p = pontoNaTela(e.clientX, e.clientY);
      if (this.dedos.size === 1) this.giro += (p.x - d.x) * 0.012;
      const antes = this.dedos.size >= 2 ? pinca() : 0;
      d.x = p.x; d.y = p.y;
      if (antes > 20) this.aproximar(antes / Math.max(20, pinca()));
    });
    for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, (e) => this.dedos.delete(e.pointerId));
    addEventListener('wheel', (e) => {
      if (!this.aberto || e.target.closest?.('#aparencia')) return;
      this.aproximar(Math.exp(e.deltaY * (e.deltaMode === 1 ? 33 : 1) * 0.0012));
    }, { passive: true });
  }

  get aberto() { return !this.el.classList.contains('hidden'); }

  /** a distância da câmera vezes `k` (< 1 aproxima) */
  aproximar(k) { this.dist = THREE.MathUtils.clamp(this.dist * k, DIST_MIN, DIST_MAX); }

  abrir() {
    this.el.classList.remove('hidden');
    this.game.player.esconderCorpo?.(false);   // (a primeira pessoa esconde o corpo da câmera)
    this.giro = 0;
    this.dist = DIST_PADRAO;
    this.el.querySelector('.aparencia-dica').textContent = document.body.classList.contains('toque')
      ? 'Arraste fora do painel para girar · pinça para aproximar'
      : 'Arraste fora do painel para girar · roda do mouse para aproximar';
    this.desenhar();
  }
  fechar() { this.el.classList.add('hidden'); this.dedos.clear(); }

  mudar(parcial) {
    const p = this.game.player, antes = lerAparencia(p.aparencia), a = { ...antes, ...parcial };
    // (trocou de raça: o sexo só vale se ela tem o corpo — o 2, o de arquivo; sem ele, o feminino)
    if (a.sexo === 2 && !temArquivo(a.raca)) a.sexo = 1;
    if (a.sexo === 1 && !temFeminino(a.raca)) a.sexo = 0;
    // O número do cabelo, da barba e da sobrancelha é o lugar na lista de CADA raça (e de cada
    // corpo dela). Trocou de raça ou de sexo: fica o MESMO corte, se o outro o tem (a "Longa"
    // é a 8ª do humano e a 6ª do orc); senão, o que passa do fim da lista vale o último
    const de = racaDe(antes.raca, antes.sexo), raca = racaDe(a.raca, a.sexo);
    // (o corpo de ARQUIVO não usa nenhum dos três: os números ficam guardados para quando voltar)
    for (const [k, lista] of [['cabelo', penteadosDe], ['barba', barbasDe], ['sobrancelha', sobrancelhasDe]]) {
      if (raca?.arquivo) continue;
      const nova = lista(raca), id = !(k in parcial) && a[k] > 0 && !de?.arquivo ? lista(de)[a[k] - 1] : null;
      a[k] = (id ? nova.indexOf(id) + 1 : 0) || Math.min(a[k], nova.length);
    }
    p.aparencia = codigoDaAparencia(a);
    p.refreshEquipment();
    this.desenhar();
  }

  desenhar() {
    const a = lerAparencia(this.game.player.aparencia), raca = racaDe(a.raca, a.sexo), racas = racasDoPainel();
    this.lista.innerHTML = '';
    for (const [k, rotulo, opcoes, some] of LINHAS) {
      if (some?.(raca, a)) continue;
      // (a raça ESCULPIDA — um corpo feito de fotos, esculpido.js — já vem pintada e vestida:
      // só a linha da raça; o resto do código fica guardado para quando voltar ao humano)
      if (k !== 'raca' && esculpidoDe(raca)) continue;
      // (a PELE é uma régua — o tom livre, do bege ao quase preto: o corpo muda ao SOLTAR; arrastando, só a amostra)
      if (k === 'pele') { this.lista.appendChild(this.reguaDaPele(a)); continue; }
      const ops = opcoes(raca, a), linha = document.createElement('div');
      // a raça anda pela lista das jogáveis (o número dela é o lugar no arquivo, não na lista)
      const agora = k === 'raca' ? Math.max(0, racas.findIndex((r) => r.n === a.raca)) : a[k];
      const valor = (i) => (k === 'raca' ? racas[i].n : i);
      linha.className = 'aparencia-linha';
      linha.innerHTML = `<span class="rotulo">${rotulo}</span><button class="seta" data-d="-1">◀</button><span class="valor">${ops[agora]}</span><button class="seta" data-d="1">▶</button>`;
      for (const b of linha.querySelectorAll('.seta')) {
        b.addEventListener('click', () => this.mudar({ [k]: valor((agora + Number(b.dataset.d) + ops.length) % ops.length) }));
      }
      this.lista.appendChild(linha);
    }
  }

  reguaDaPele(a) {
    const linha = document.createElement('div'), tom = a.tom ?? TOM_DE_PELE[a.pele] ?? TOM_DE_PELE[0];
    linha.className = 'aparencia-linha aparencia-tom';
    linha.innerHTML = `<span class="rotulo">Pele</span><input type="range" min="0" max="${TOM_MAX}" step="1" value="${tom}" aria-label="tom de pele"><span class="tom-amostra"></span>`;
    const regua = linha.querySelector('input'), amostra = linha.querySelector('.tom-amostra');
    regua.style.background = GRADIENTE_DA_PELE;
    const mostrar = () => { amostra.style.background = corDoTom(Number(regua.value)); };
    mostrar();
    regua.addEventListener('input', mostrar);
    regua.addEventListener('change', () => this.mudar({ pele: 0, tom: Number(regua.value) }));
    return linha;
  }

  /**
   * a câmera de frente para o rosto (chamada no laço, depois da câmera de sempre), girada
   * pelo arrasto; indo para as costas ela se afasta e desce um pouco, para caber a trança.
   * A altura é a do rosto da RAÇA (o orc é mais alto: a câmera ficava no queixo dele).
   * Afastando (`dist`), a vista desce do rosto para o meio do corpo. Parede atrás: a câmera
   * encosta nela, como a de sempre. O personagem fica no MEIO da parte da tela que o painel
   * não cobre (`setViewOffset`: a imagem anda de lado sem mudar o ângulo da vista).
   */
  camera(cam) {
    // (a câmera isométrica usa outra lente: aqui, a de sempre)
    if (cam.userData.fovNormal != null && cam.fov !== cam.userData.fovNormal) { cam.fov = cam.userData.fovNormal; cam.updateProjectionMatrix(); }
    const p = this.game.player, w = this.game.world, f = p.facing + this.giro, atras = (1 - Math.cos(this.giro)) / 2, a = lerAparencia(p.aparencia);
    // (a altura do corpo vestido — a do esculpido é a dele; sem corpo, a da raça)
    const alto = p.model.guerreiro?.altura ?? proporcoesDe(racaDe(a.raca, a.sexo)).altura, corpo = THREE.MathUtils.clamp((this.dist - DIST_PADRAO) / (DIST_MAX - DIST_PADRAO), 0, 1);
    const y = p.pos.y + 1.55 * alto - 0.2 * atras;
    _alvo.set(p.pos.x, y - 0.05 - 0.6 * alto * corpo, p.pos.z);
    let d = this.dist * (1 + 0.56 * atras);
    _cam.set(_alvo.x + Math.sin(f) * d, 0, _alvo.z + Math.cos(f) * d);
    d *= Math.max(DIST_MIN * 0.8 / d, w.rayFraction(_alvo, _cam, 0.15) - 0.03);
    _cam.set(_alvo.x + Math.sin(f) * d, _alvo.y + 0.13 + 0.25 * corpo, _alvo.z + Math.cos(f) * d);
    _cam.y = Math.max(_cam.y, w.alturaChao(_cam) + 0.3);
    cam.position.copy(_cam);
    cam.lookAt(_alvo);
    // a câmera de sempre (que no Mundo online segue rodando por baixo do menu) esconde o
    // modelo quando passa perto da cabeça — e, indo do rosto para trás do ombro, ela passava
    // por dentro dele: o personagem sumia em alguns ângulos
    p.model.scene.visible = true;
    if (p.model.guerreiro) p.model.guerreiro.cena.visible = true;
    const W = tela.w, H = tela.h, r = retanguloNaTela(this.el.getBoundingClientRect());
    const meio = r.left > W - r.right ? r.left / 2 : (r.right + W) / 2;
    cam.setViewOffset(W, H, W / 2 - meio, 0, W, H);
  }
}
