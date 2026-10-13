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
import { racaDe, proporcoesDe, SEXOS, temFeminino } from './raca.js';
import { penteadosDe, nomeDoPenteado, barbasDe, nomeDaBarba, sobrancelhasDe, nomeDaSobrancelha } from './penteado.js';

export const PELES = [
  // (tons pensados para a luz do jogo: a paleta original do modelo é #f8bb7f)
  ['Original', null], ['Clara', '#ffcfa0'], ['Morena clara', '#e8ae80'], ['Morena', '#cf9061'], ['Parda', '#ad7148'], ['Negra', '#80523a'],
];
// (a ORDEM é o número no save, o 3º dígito: cor nova entra no FIM — no máximo 10)
export const CABELOS = [
  ['Original', null], ['Preto', '#1e1712'], ['Castanho', '#4b2f1b'], ['Castanho claro', '#7b4c27'], ['Loiro', '#c99f5c'], ['Ruivo', '#a3431f'], ['Grisalho', '#8c8a86'], ['Branco', '#e6e0d2'], ['Vinho', '#74202a'],
];
export const OLHOS = [
  ['Original', null], ['Azuis', '#3f6fb8'], ['Verdes', '#4a8c4c'], ['Castanhos', '#6a4528'], ['Cinzentos', '#8a8f9c'],
];
export const APARENCIA_PADRAO = '01010';
const CODIGO = /^[0-9]{5,8}$/;

/** Lê um código (ou o padrão, se torto): { pele, cabelo, cor, barba, olhos, raca, sobrancelha, sexo }. */
export function lerAparencia(c) {
  const s = CODIGO.test(c ?? '') ? c : APARENCIA_PADRAO;
  const d = [...s].map(Number);
  return {
    pele: d[0] < PELES.length ? d[0] : 0, cabelo: d[1], cor: d[2] < CABELOS.length ? d[2] : 0,
    barba: d[3], olhos: d[4] < OLHOS.length ? d[4] : 0, raca: d[5] ?? 0, sobrancelha: d[6] ?? 1, sexo: d[7] === 1 ? 1 : 0,
  };
}
// (humano de sobrancelha normal: os 5 dígitos de sempre; a raça é o 6º; a sobrancelha que não é a do modelo pede os 7; o feminino, os 8)
export function codigoDaAparencia(a) {
  const sobrancelha = a.sobrancelha ?? 1;
  const cauda = a.sexo ? `${a.raca || 0}${sobrancelha}${a.sexo}` : sobrancelha === 1 ? a.raca || '' : `${a.raca || 0}${sobrancelha}`;
  return `${a.pele}${a.cabelo}${a.cor}${a.barba}${a.olhos}${cauda}`;
}
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
/** Esquece as peças tingidas (o editor de raças, depois de mudar uma cor). */
export function esquecerTingidas() { for (const g of tingidas.values()) g?.dispose?.(); tingidas.clear(); delete tingidas.razaoPele; }
/**
 * A peça do corpo com a aparência aplicada (um objeto no formato da malha fundida), ou a
 * própria peça (nada a tingir nela).
 */
export function tingir(peca, codigo) {
  const a = lerAparencia(codigo), nome = peca.name, raca = racaDe(a.raca, a.sexo);
  const pele = raca?.pele ?? PELES[a.pele][1], olhos = raca?.olhos ?? OLHOS[a.olhos][1];
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
  // (o sexo só aparece para a raça que TEM o corpo feminino no arquivo: raca.js)
  ['sexo', 'Sexo', () => SEXOS, (r, a) => !temFeminino(a.raca)],
  ['pele', 'Pele', () => PELES.map((p) => p[0]), (r) => !!r?.pele],
  ['cabelo', 'Cabelo', (r) => ['Sem cabelo', ...penteadosDe(r).map(nomeDoPenteado)], (r) => !penteadosDe(r).length],
  ['cor', 'Cor do cabelo e da barba', () => CABELOS.map((p) => p[0])],
  ['barba', 'Barba', (r) => ['Sem barba', ...barbasDe(r).map(nomeDaBarba)], (r) => !barbasDe(r).length],
  ['sobrancelha', 'Sobrancelhas', (r) => ['Sem sobrancelhas', ...sobrancelhasDe(r).map(nomeDaSobrancelha)], (r) => !sobrancelhasDe(r).length],
  ['olhos', 'Olhos', () => OLHOS.map((p) => p[0]), (r) => !!r?.olhos],
];
/** As raças que o jogador pode escolher: o humano e as `jogavel` do arquivo ({ n, nome }). */
const racasDoPainel = () => [{ n: 0, nome: 'Humano' }, ...Assets.racas.map((r, i) => ({ n: i + 1, nome: r.nome, jogavel: r.jogavel })).filter((r) => r.jogavel)];

/**
 * O EDITOR DE PERSONAGEM no jogo (`game.menu = 'aparencia'`): um painel com ◀ ▶ por
 * opção, a câmera no rosto do jogador, e o corpo mudando na hora. "Pronto" grava.
 * ARRASTAR fora do painel (mouse ou dedo) gira a vista em volta do personagem: o rabo de
 * cavalo e as tranças ficam nas costas, e de frente não se viam.
 */
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
      this.mudar({ pele: 1 + r(PELES.length - 1), cabelo: penteados && Math.random() < 0.85 ? 1 + r(penteados) : 0, cor: 1 + r(CABELOS.length - 1), barba: barbas && Math.random() < 0.6 ? 1 + r(barbas) : 0, olhos: r(OLHOS.length), sobrancelha: sobrancelhas ? 1 + r(sobrancelhas) : 0 });
    });
    // a volta da vista: 0 = de frente para o rosto, π = as costas
    this.giro = 0;
    let de = null;
    addEventListener('pointerdown', (e) => { if (this.aberto && !e.target.closest?.('#aparencia')) de = e.clientX; });
    addEventListener('pointermove', (e) => { if (de === null || !this.aberto) return; this.giro += (e.clientX - de) * 0.012; de = e.clientX; });
    for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, () => { de = null; });
  }

  get aberto() { return !this.el.classList.contains('hidden'); }

  abrir() {
    this.el.classList.remove('hidden');
    this.giro = 0;
    this.desenhar();
  }
  fechar() { this.el.classList.add('hidden'); }

  mudar(parcial) {
    const p = this.game.player, antes = lerAparencia(p.aparencia), a = { ...antes, ...parcial };
    // (trocou de raça: o sexo só vale se ela tem o corpo)
    if (!temFeminino(a.raca)) a.sexo = 0;
    // O número do cabelo, da barba e da sobrancelha é o lugar na lista de CADA raça (e de cada
    // corpo dela). Trocou de raça ou de sexo: fica o MESMO corte, se o outro o tem (a "Longa"
    // é a 8ª do humano e a 6ª do orc); senão, o que passa do fim da lista vale o último
    const de = racaDe(antes.raca, antes.sexo), raca = racaDe(a.raca, a.sexo);
    for (const [k, lista] of [['cabelo', penteadosDe], ['barba', barbasDe], ['sobrancelha', sobrancelhasDe]]) {
      const nova = lista(raca), id = !(k in parcial) && a[k] > 0 ? lista(de)[a[k] - 1] : null;
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
      const ops = opcoes(raca), linha = document.createElement('div');
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

  /**
   * a câmera de frente para o rosto (chamada no laço, depois da câmera de sempre), girada
   * pelo arrasto; indo para as costas ela se afasta e desce um pouco, para caber a trança.
   * A altura é a do rosto da RAÇA (o orc é mais alto: a câmera ficava no queixo dele)
   */
  camera(cam) {
    const p = this.game.player, f = p.facing + this.giro, atras = (1 - Math.cos(this.giro)) / 2, a = lerAparencia(p.aparencia);
    const y = p.pos.y + 1.55 * proporcoesDe(racaDe(a.raca, a.sexo)).altura - 0.2 * atras, d = 1.25 + 0.7 * atras;
    cam.position.set(p.pos.x + Math.sin(f) * d - Math.cos(f) * 0.35, y + 0.08, p.pos.z + Math.cos(f) * d + Math.sin(f) * 0.35);
    cam.lookAt(p.pos.x - Math.cos(f) * 0.25, y - 0.05, p.pos.z + Math.sin(f) * 0.25);
  }
}
