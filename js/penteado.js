/**
 * OS PENTEADOS (12/10/2026) — o cabelo DESENHADO EM CÓDIGO, de todos (o humano e as
 * raças): o moicano, os espinhos, a crista, o coque, o rabo de cavalo e as tranças. O
 * cabelo solto do modelo (a peça `Hair`) SAIU do jogo: quem tem cabelo tem um destes.
 *
 * QUAIS cada um tem: o humano, os de `PENTEADOS_PADRAO`; a raça, os da lista `penteados`
 * dela em `assets/racas.json` (ids daqui; sem a lista, os do humano). O dígito do cabelo
 * na aparência (aparencia.js) é o LUGAR nessa lista — 0 = sem cabelo, 1 = o primeiro… —,
 * por isso penteado novo entra no FIM dela.
 *
 * COMO SE DESENHA. Tudo é TUBO facetado (`tubo`): seções seguidas ao longo de um caminho,
 * em cm no espaço da pose T do modelo (como as presas, raca.js), a cor nos vértices e a
 * normal reta por face — o jeito low poly do corpo. Há dois tipos de forma:
 *  - as da CABEÇA (a crina, os espinhos, o coque): presas só ao osso da cabeça, desenhadas
 *    sobre a linha do meio do couro cabeludo (`COURO`). Com ELMO, saem.
 *  - a MECHA que cai (o rabo, a trança): sai da cabeça e desce pelas costas. Da nuca para
 *    baixo cada ponto POUSA no corpo (`pousar`: um raio de trás para a frente acha a pele —
 *    ou a armadura do peito — naquele lugar) e fica preso aos mesmos ossos que ela: a mecha
 *    acompanha as costas em qualquer animação, sem física. Com elmo, sai de baixo dele.
 *
 * O penteado é feito JÁ com as proporções da raça (`deformador`, raca.js): o pouso é no
 * corpo como a raça o deixa, e a grossura da mecha não estica com ele (engrossada junto
 * com as costas do orc, a trança ficava com o dobro do fundo). Por isso entra na malha
 * fundida por último e fora do `deformar` (guerreiro.js `geometriaFundida`), e é refeito a
 * cada corpo: depende da raça e do que está vestido.
 *
 * AS BARBAS (`BARBAS`, 12/10/2026) são feitas do mesmo jeito e vão na mesma geometria. A
 * 'modelo' é a peça `Beard` do modelo, inteira (a barba de sempre do humano; quem a tinge
 * é o aparencia.js). As outras são desenhadas aqui, com duas formas:
 *  - o RECORTE: PARTES da própria barba do modelo — o bigode, o queixo, o maxilar, a
 *    costeleta (`parteDaBarba`: pelo lugar de cada triângulo) —, que já assenta no rosto;
 *    com `folga`, mais cheia. O cavanhaque é bigode + queixo; a moldura, tudo menos o bigode;
 *  - o PENDENTE: o que cai do queixo (a barbicha, a barba longa, a trança de barba). É preso
 *    à cabeça, mas onde o corpo passa à frente dele (o peito do orc, a armadura) POUSA nele,
 *    pela frente, como a mecha nas costas.
 * As duas alargam junto com o QUEIXO da raça (`largo`, raca.js `largoDoQueixo`). O dígito
 * da barba na aparência é o lugar na lista (`BARBAS_PADRAO`, ou `barbas` da raça), como o
 * do cabelo.
 */
import * as THREE from 'three';
import { texelClaro } from './casca.js';

// quem não escolheu a cor ("Original"): o castanho do cabelo do modelo, medido na textura
// dele — é a cor em que a barba e as sobrancelhas ficam
const COR_PADRAO = '#62423c';
const FAIXA = '#5b3a22', OSSO = '#e6dcc0';   // a tira de couro que amarra, e a argola de osso
// A LINHA DO MEIO do couro cabeludo (x = 0), da testa à nuca: [z, y], medidos na peça `head`
const COURO = [[13.5, 180.5], [10.4, 184.3], [4.8, 187.2], [-2.8, 188.0], [-12.8, 182.7], [-15.2, 179.0], [-15.6, 175.6], [-15.2, 172.3], [-14.4, 168.8], [-11.3, 162.9]];
const NUCA = 161;      // dessa altura para baixo a mecha pousa no corpo
const AFUNDA = 1.3;    // quanto a raiz de cada forma entra na cabeça (não fica fresta)
const FOLGA = 0.5;     // entre a mecha e o corpo em que ela pousa

/**
 * Os penteados que há. `formas`: [nome da forma em `FORMAS`, as medidas dela]. As medidas
 * são em cm; `de`/`ate`/`em`/`raiz` são lugares na linha do couro (cm a partir da testa:
 * ~19 é o alto da cabeça, ~30 o cocuruto de trás).
 */
const CRISTA = (ate) => ['crina', { de: 2.5, ate, altura: 2.7, largura: 3.5, topo: 0.6, dente: 0.6 }];
const TRANCA = (x = 0, o = {}) => ['mecha', { raiz: 33.5, x, solta: [[179.4, -18.6], [175, -20.6], [169.5, -20.2], [165, -18.6]], ate: 120, raio: 2.7, elo: 4.6, argola: true, ...o }];
export const PENTEADOS = {
  rabo: { nome: 'Rabo de cavalo', formas: [['mecha', { raiz: 29.5, solta: [[187, -16.8], [186.2, -21.4], [181, -24.6], [174, -25], [167.5, -22.6]], ate: 134, raio: 3.7 }]] },
  tranca: { nome: 'Trança', formas: [TRANCA()] },
  trancas: { nome: 'Duas tranças', formas: [TRANCA(4.4, { abre: 3, raio: 2.1, elo: 3.9, ate: 126 }), TRANCA(-4.4, { abre: -3, raio: 2.1, elo: 3.9, ate: 126 })] },
  coque: { nome: 'Coque', formas: [['coque', { em: 24, raio: 4.3 }]] },
  crista: { nome: 'Crista', formas: [CRISTA(41)] },
  moicano: { nome: 'Moicano', formas: [['crina', { de: 1.5, ate: 42, altura: 9, largura: 3.1, topo: 0.3, dente: 2.4, inclina: 0.2 }]] },
  espinhos: { nome: 'Espinhos', formas: [['espinhos', { de: 3.5, ate: 39, n: 8, altura: 11.5, largura: 2.6, base: 3.6 }]] },
  cristaTranca: { nome: 'Crista e trança', formas: [CRISTA(31), TRANCA()] },
};

/**
 * Os do HUMANO (e da raça sem lista própria). A ORDEM é o número do cabelo no save do
 * personagem: não reordene nem tire do meio — penteado novo entra no FIM. (O primeiro é o
 * de quem tinha o cabelo solto do modelo: o save dele diz "1".)
 */
export const PENTEADOS_PADRAO = ['rabo', 'tranca', 'trancas', 'coque', 'crista', 'moicano', 'espinhos', 'cristaTranca'];

/** Os penteados de uma raça (null = humano), na ordem em que valem: o número no save é o lugar aqui, mais 1. */
export function penteadosDe(raca) {
  if (raca?.semCabelo) return [];
  return Array.isArray(raca?.penteados) ? raca.penteados : PENTEADOS_PADRAO;
}
/**
 * O penteado de número `n` (o dígito do cabelo na aparência; 0 = sem) de uma raça: o id, ou
 * null. Número além da lista vale o último.
 */
export function penteadoDe(raca, n) {
  const lista = penteadosDe(raca);
  return n > 0 && lista.length ? lista[Math.min(n, lista.length) - 1] : null;
}
export const nomeDoPenteado = (id) => PENTEADOS[id]?.nome ?? id;

/**
 * As barbas que há. Sem `formas`, é a peça do modelo. `partes`: as partes da barba do
 * modelo que o recorte leva (`parteDaBarba`); `solta`: os pontos [y, z] por onde o pendente
 * desce, na linha do meio.
 */
const MOLDURA = ['costeleta', 'maxilar', 'queixo'];
export const BARBAS = {
  modelo: { nome: 'Cheia' },
  cavanhaque: { nome: 'Cavanhaque', formas: [['recorte', { partes: ['bigode', 'queixo'] }]] },
  moldura: { nome: 'Moldura', formas: [['recorte', { partes: MOLDURA, folga: 0.9 }]] },
  costeletas: { nome: 'Costeletas', formas: [['recorte', { partes: ['costeleta', 'maxilar'], folga: 0.9 }]] },
  bigode: { nome: 'Bigode', formas: [['recorte', { partes: ['bigode'], folga: 0.4 }]] },
  barbicha: { nome: 'Barbicha', formas: [['recorte', { partes: ['queixo'], folga: 0.3 }], ['pendente', { solta: [[157.2, 12.6], [153.4, 13.6], [149.2, 14]], raio: 2.4, cunha: true }]] },
  tranca: { nome: 'Trançada', formas: [['recorte', { partes: ['queixo', 'maxilar'], folga: 0.5 }], ['pendente', { solta: [[157.4, 12.4], [153.2, 13.8], [147, 14.2], [141, 13.8], [135.5, 13.4]], raio: 2, elo: 3.6, argola: true }]] },
  longa: { nome: 'Longa', formas: [['recorte', { partes: MOLDURA, folga: 0.9 }], ['pendente', { solta: [[158.2, 10.6], [153, 12.8], [147, 13.6], [141, 13.4], [135.5, 13]], raio: 2.7, larg: 2.1, cunha: true }]] },
};
/**
 * As do HUMANO (e da raça sem lista própria). A ORDEM é o número da barba no save do
 * personagem: não reordene nem tire do meio — barba nova entra no FIM. (A primeira é a do
 * modelo: o save de antes dizia "1" para "com barba".)
 */
export const BARBAS_PADRAO = ['modelo', 'cavanhaque', 'moldura', 'costeletas', 'bigode', 'barbicha', 'tranca', 'longa'];
/** As barbas de uma raça (null = humano), na ordem em que valem. */
export function barbasDe(raca) {
  if (raca?.semBarba) return [];
  return Array.isArray(raca?.barbas) ? raca.barbas : BARBAS_PADRAO;
}
/** A barba de número `n` (o dígito da barba na aparência; 0 = sem) de uma raça: o id, ou null. Além da lista, a última. */
export function barbaDe(raca, n) {
  const lista = barbasDe(raca);
  return n > 0 && lista.length ? lista[Math.min(n, lista.length) - 1] : null;
}
export const nomeDaBarba = (id) => BARBAS[id]?.nome ?? id;
// A que PARTE da barba do modelo pertence um triângulo, pelo meio dele (|x|, y, z em cm): a
// costeleta sobe pela bochecha até a têmpora; o bigode é o que fica da boca para cima; o
// queixo, a frente abaixo da boca; o maxilar, o resto — a linha do osso, do queixo à orelha.
const parteDaBarba = (x, y, z) => (y >= 163.5 && x >= 7 ? 'costeleta' : y >= 161.5 && x < 7 && z > 9 ? 'bigode' : x < 4.2 && z > 9 ? 'queixo' : 'maxilar');
const PESCOCO = 153;   // dessa altura para baixo o pendente confere se o corpo passa à frente dele

// ------------------------------------------------------------ o couro cabeludo
const ao = [0];   // o comprimento da linha até cada ponto dela
for (let i = 1; i < COURO.length; i++) ao.push(ao[i - 1] + Math.hypot(COURO[i][0] - COURO[i - 1][0], COURO[i][1] - COURO[i - 1][1]));
function pontoDoCouro(s) {
  s = Math.min(ao[ao.length - 1], Math.max(0, s));
  let i = 1;
  while (i < ao.length - 1 && ao[i] < s) i++;
  const f = (s - ao[i - 1]) / (ao[i] - ao[i - 1]);
  return [COURO[i - 1][0] + (COURO[i][0] - COURO[i - 1][0]) * f, COURO[i - 1][1] + (COURO[i][1] - COURO[i - 1][1]) * f];
}
/** Um lugar na linha do couro, a `s` cm da testa: o ponto, a direção da linha (para trás) e a de FORA da cabeça. */
function noCouro(s) {
  const [z, y] = pontoDoCouro(s), [z0, y0] = pontoDoCouro(s - 1.5), [z1, y1] = pontoDoCouro(s + 1.5);
  const t = new THREE.Vector3(0, y1 - y0, z1 - z0).normalize();
  return { p: new THREE.Vector3(0, y, z), t, n: new THREE.Vector3(0, -t.z, t.y) };
}

// ------------------------------------------------------------ a malha
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), ZERO = new THREE.Vector3();
class Malha {
  constructor() { this.v = []; }   // os cantos, de três em três: { p, cor, w: os pesos }
  /** um triângulo, virado para FORA de `dentro` (um ponto do lado de dentro da forma) */
  tri(dentro, a, b, c) {
    _a.subVectors(b.p, a.p).cross(_b.subVectors(c.p, a.p));
    if (_a.lengthSq() < 1e-8) return;   // (a seção que é uma ponta: dois cantos no mesmo lugar)
    _b.copy(a.p).add(b.p).add(c.p).multiplyScalar(1 / 3).sub(dentro);
    if (_a.dot(_b) < 0) this.v.push(a, c, b); else this.v.push(a, b, c);
  }
}
const poligono = (n) => Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2), Math.sin((i / n) * Math.PI * 2)]);
const LOSANGO = poligono(4), HEXAGONO = poligono(6);
/**
 * Um TUBO facetado. `est`: as estações — { c: o centro, a, b: os dois eixos da seção (já do
 * tamanho; nulos = uma ponta), cor, cor2 (a cor do alto da seção, quando muda), w: os
 * pesos }; `perfil`: a seção, pontos [pa, pb] nos dois eixos; `tampas`: fecha o começo e o fim.
 */
function tubo(m, est, perfil, tampas = [false, false]) {
  const aneis = est.map((e) => perfil.map(([pa, pb]) => ({
    p: e.c.clone().addScaledVector(e.a, pa).addScaledVector(e.b, pb),
    cor: e.cor2 ? e.cor.clone().lerp(e.cor2, Math.min(1, Math.max(0, pb))) : e.cor, w: e.w,
  })));
  const meio = aneis.map((a) => a.reduce((s, v) => s.add(v.p), new THREE.Vector3()).multiplyScalar(1 / a.length));
  const n = perfil.length;
  for (let i = 0; i < est.length - 1; i++) {
    const dentro = meio[i].clone().add(meio[i + 1]).multiplyScalar(0.5);
    for (let j = 0; j < n; j++) {
      const k = (j + 1) % n;
      m.tri(dentro, aneis[i][j], aneis[i][k], aneis[i + 1][k]);
      m.tri(dentro, aneis[i][j], aneis[i + 1][k], aneis[i + 1][j]);
    }
  }
  const tampa = (i, dentro) => { const c = { p: meio[i].clone(), cor: est[i].cor, w: est[i].w }; for (let j = 0; j < n; j++) m.tri(dentro, c, aneis[i][j], aneis[i][(j + 1) % n]); };
  if (tampas[0]) tampa(0, meio[1]);
  if (tampas[1]) tampa(est.length - 1, meio[est.length - 2]);
}
// o que é preso só à CABEÇA: desenha-se como o modelo é, e cada canto vai às proporções da raça
function naCabeca(m, c, desenhar) {
  const r = new Malha();
  desenhar(r);
  for (const v of new Set(r.v)) c.firme(v.p);
  m.v.push(...r.v);
}
const entre = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

// ------------------------------------------------------------ as formas
const FORMAS = {
  // A CRINA: uma lâmina de pé na linha do meio, da testa (`de`) à nuca (`ate`) — alta e
  // dentada é o moicano; baixa, a crista. `largura`: a meia largura no pé; `topo`: a do alto
  // (fração da do pé); `dente`: o quanto uma seção sim, outra não, sobe a mais.
  crina(m, c, { de, ate, altura, largura, topo = 0.5, dente = 0, inclina = 0, passo = 3.2 }) {
    if (c.elmo) return;
    naCabeca(m, c, (r) => {
      const n = Math.max(4, Math.round((ate - de) / passo)), est = [];
      for (let i = 0; i <= n; i++) {
        const f = i / n, { p, t, n: fora } = noCouro(de + (ate - de) * f);
        // o contorno: sobe depressa na testa, o mais alto um pouco à frente do meio, e desce até a nuca
        const env = Math.sin(Math.PI * f ** 0.75) ** 0.6;
        const h = (altura + (i % 2 ? dente : 0)) * env + AFUNDA;
        est.push({
          c: p.clone().addScaledVector(fora, -AFUNDA), a: new THREE.Vector3(largura * (0.5 + 0.5 * env), 0, 0),
          b: fora.clone().addScaledVector(t, inclina).multiplyScalar(h), cor: c.tom(0.72), cor2: c.tom(1.22), w: c.CABECA,
        });
      }
      tubo(r, est, [[-1, 0], [1, 0], [topo, 1], [-topo, 1]], [true, true]);
    });
  },

  // OS ESPINHOS: `n` pontas separadas na linha do meio, deitadas para trás (`inclina`).
  // `largura` e `base`: a meia largura e o meio comprimento do pé de cada uma.
  espinhos(m, c, { de, ate, n, altura, largura = 1.9, base = 3.3, inclina = 0.35 }) {
    if (c.elmo) return;
    naCabeca(m, c, (r) => {
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1), { p, t, n: fora } = noCouro(de + (ate - de) * f);
        const h = altura * (0.55 + 0.45 * Math.sin(Math.PI * f ** 0.75)) * (i % 2 ? 0.84 : 1);
        const dir = fora.clone().addScaledVector(t, inclina).normalize(), a = new THREE.Vector3(largura, 0, 0), b = t.clone().multiplyScalar(base);
        tubo(r, [
          { c: p.clone().addScaledVector(fora, -AFUNDA), a, b, cor: c.tom(0.72), w: c.CABECA },
          { c: p.clone().addScaledVector(dir, h * 0.4), a: a.clone().multiplyScalar(0.7), b: b.clone().multiplyScalar(0.62), cor: c.tom(1), w: c.CABECA },
          { c: p.clone().addScaledVector(dir, h).addScaledVector(t, h * 0.1), a: ZERO, b: ZERO, cor: c.tom(1.28), w: c.CABECA },
        ], LOSANGO);
      }
    });
  },

  // O COQUE: uma bola de cabelo no alto da cabeça (`em`), amarrada no pé por uma tira de couro.
  coque(m, c, { em, raio }) {
    if (c.elmo) return;
    naCabeca(m, c, (r) => {
      const { p, t, n: fora } = noCouro(em), eixo = fora.clone().addScaledVector(t, 0.3).normalize();
      const b = new THREE.Vector3().crossVectors(X, eixo), faixa = new THREE.Color(FAIXA);
      const est = (d, q, cor) => ({ c: p.clone().addScaledVector(eixo, d * raio), a: X.clone().multiplyScalar(q * raio), b: b.clone().multiplyScalar(q * raio), cor, w: c.CABECA });
      tubo(r, [est(-AFUNDA / raio, 0.7, faixa), est(0.55, 0.7, faixa)], HEXAGONO, [false, true]);
      tubo(r, [est(0.45, 0.55, c.tom(0.75)), est(0.95, 1, c.tom(0.92)), est(1.6, 1.02, c.tom(1.1)), est(2.1, 0.62, c.tom(1.22)), est(2.32, 0, c.tom(1.28))], HEXAGONO);
    });
  },

  // A MECHA que cai: sai da cabeça em `raiz` (amarrada por uma tira de couro), passa pelos
  // pontos `solta` ([y, z], presos à cabeça) e da NUCA para baixo pousa nas costas, até a
  // altura `ate`. `raio`: a grossura; `elo`: o comprimento de cada gomo — com ele é uma
  // TRANÇA; `argola`: uma argola de osso antes da ponta; `x`: fora da linha do meio (a
  // cabeça é chata até ~4 cm dela), e `abre`: o quanto se afasta a mais até a ponta.
  mecha(m, c, { raiz, solta, ate, raio, x = 0, abre = 0, elo = 0, argola = false, achata = 0.72 }) {
    const R = raio * c.k, linha = [];
    if (!c.elmo) {
      const { p, n: fora } = noCouro(raiz), b = new THREE.Vector3().crossVectors(X, fora), faixa = new THREE.Color(FAIXA);
      p.x = x;
      naCabeca(m, c, (r) => {
        const est = (d) => ({ c: p.clone().addScaledVector(fora, d), a: X.clone().multiplyScalar(raio * 1.12), b: b.clone().multiplyScalar(raio * 1.12), cor: faixa, w: c.CABECA });
        tubo(r, [est(-AFUNDA), est(raio * 0.8)], HEXAGONO, [false, true]);
      });
      for (const q of [p.clone().addScaledVector(fora, -AFUNDA), p.clone().addScaledVector(fora, raio), ...solta.map(([y, z]) => new THREE.Vector3(x, y, z))]) linha.push({ p: c.firme(q), w: c.CABECA });
    }
    for (let y = NUCA; y > ate - 1; y -= 3) {
      const s = c.pousar(x + (abre * (NUCA - y)) / (NUCA - ate), y);
      if (s) linha.push({ p: s.p.setZ(s.p.z - (R * achata + FOLGA) / Math.max(0.55, -s.n.z)), w: s.w });
    }
    fio(m, c, linha, { raio, elo, argola, achata });
  },

  // O RECORTE: as `partes` da barba do MODELO (o bigode, o queixo, o maxilar, a costeleta),
  // que já assenta no rosto. `folga`: quanto sai a mais, pela normal (a barba mais cheia) —
  // com ELMO fica rente, como a do modelo, que cabe dentro dele (cheia, saía pelas frestas);
  // `tom`: o da barba do modelo é um pouco mais escuro que o do cabelo.
  recorte(m, c, { partes, folga = 0, tom = 0.86 }) {
    if (c.elmo) folga = 0;
    for (const t of c.barba()) {
      if (!partes.includes(t.parte)) continue;
      for (const k of t.cantos) {
        const p = k.p.clone().addScaledVector(k.n, folga);
        p.x *= c.largo(p.y, p.z);
        m.v.push({ p: c.deformador(p, k.o, k.w), cor: c.tom(tom), w: { o: k.o, p: k.w } });
      }
    }
  },

  // O PENDENTE: o que cai do queixo, pelos pontos `solta` ([y, z], na linha do meio, presos
  // à cabeça). Abaixo do pescoço, se o corpo (o peito do orc, a armadura) passa à frente do
  // ponto, o ponto pousa nele. `cunha`: larga no pé e afinando até a ponta (a barba longa);
  // `larg`: quantas vezes mais larga que funda; `elo`/`argola`: a trança de barba.
  pendente(m, c, { solta, raio, elo = 0, argola = false, achata = 0.72, larg = 1.15, cunha = false }) {
    const R = raio * c.k, linha = [];
    for (const [y, z] of solta) {
      // (a largura do pé acompanha o queixo da raça)
      const ponto = { p: c.firme(new THREE.Vector3(0, y, z)), w: c.CABECA, f: c.largo(y, z) };
      const s = ponto.p.y < PESCOCO ? c.pousar(0, ponto.p.y, true) : null;
      const frente = s ? s.p.z + (R * achata + FOLGA) / Math.max(0.55, s.n.z) : -Infinity;
      if (frente > ponto.p.z) { ponto.p.z = frente; ponto.w = s.w; }
      linha.push(ponto);
    }
    fio(m, c, linha, { raio, elo, argola, achata, larg, cunha });
  },
};

/**
 * O FIO: o tubo ao longo de uma linha de pontos já nas proporções da raça ({ p, w: os
 * pesos, f: quanto alarga ali }) — o rabo (engrossa ao sair, ondula e afina), a TRANÇA
 * (`elo`: o comprimento de cada gomo), com a `argola` de osso antes da ponta, ou a CUNHA
 * (larga no começo, afinando até a ponta).
 */
function fio(m, c, linha, { raio, elo = 0, argola = false, achata = 0.72, larg = 1.15, cunha = false }) {
  if (linha.length < 2) return;
  const R = raio * c.k;   // (a grossura acompanha o tamanho da cabeça)
  // a linha medida: um ponto (e os pesos dele) a `s` cm do começo
  const comp = [0];
  for (let i = 1; i < linha.length; i++) comp.push(comp[i - 1] + linha[i].p.distanceTo(linha[i - 1].p));
  const total = comp[comp.length - 1];
  const em = (s) => {
    s = entre(s, 0, total);
    let i = 1;
    while (i < comp.length - 1 && comp[i] < s) i++;
    const f = (s - comp[i - 1]) / Math.max(1e-6, comp[i] - comp[i - 1]);
    return { p: linha[i - 1].p.clone().lerp(linha[i].p, f), w: misturar([[linha[i - 1].w, 1 - f], [linha[i].w, f]]), f: (linha[i - 1].f ?? 1) * (1 - f) + (linha[i].f ?? 1) * f };
  };
  // uma estação do fio: a seção deitada de lado (larga em x, achatada contra o corpo)
  const est = (s, q, cor, desvio = 0) => {
    const { p, w, f } = em(s), t = em(s + 1).p.sub(em(s - 1).p).normalize();
    const u = X.clone().addScaledVector(t, -t.x).normalize(), v = new THREE.Vector3().crossVectors(u, t);
    return { c: p.addScaledVector(u, desvio * R), a: u.multiplyScalar(q * R * larg * f), b: v.multiplyScalar(q * R * achata), cor, w };
  };
  const ponta = argola ? 7.5 * c.k : 0, corpo = total - ponta, lista = [];
  if (elo) {
    // a TRANÇA: gomos — fina na emenda, grossa no meio, um para cada lado
    const n = Math.max(2, Math.round(corpo / (elo * c.k))) * 2;
    for (let i = 0; i <= n; i++) {
      const afina = 1 - 0.3 * (i / n), gomo = i % 2;
      lista.push(est((corpo * i) / n, (gomo ? 1 : 0.6) * afina, c.tom(gomo ? 1.12 : 0.7), gomo ? (i % 4 === 1 ? 0.28 : -0.28) : 0));
    }
  } else {
    const n = Math.max(3, Math.round(total / 4));
    for (let i = 0; i <= n; i++) {
      const s = (total * i) / n;
      // a CUNHA afina do pé à ponta; o RABO engrossa ao sair da tira, ondula um pouco e afina no fim
      const q = cunha ? (1 - i / n) ** 0.75 * (i % 2 ? 1.06 : 0.96) : Math.min(1, 0.72 + s / 22) * entre((total - s) / (total * 0.4)) ** 0.6 * (i % 2 ? 1.07 : 0.95);
      lista.push(est(s, i === n ? 0 : q, c.tom(0.78 + 0.5 * (i / n))));
    }
  }
  tubo(m, lista, HEXAGONO, [true, false]);
  if (argola) {
    const osso = new THREE.Color(OSSO);
    tubo(m, [est(corpo - 0.4 * c.k, 0.95, osso), est(corpo + 1.5 * c.k, 0.95, osso)], HEXAGONO, [true, true]);
    tubo(m, [est(corpo + 1.2 * c.k, 0.6, c.tom(0.8)), est(corpo + 3.6 * c.k, 0.78, c.tom(1.05)), est(total, 0, c.tom(1.25))], HEXAGONO);
  }
}

// ------------------------------------------------------------ os pesos e o pouso
// os pesos de um ponto: { o: os 4 ossos (na ordem única), p: os 4 pesos }
function misturar(partes) {
  const soma = new Map();
  for (const [w, f] of partes) for (let k = 0; k < 4; k++) if (w.p[k] && f) soma.set(w.o[k], (soma.get(w.o[k]) ?? 0) + w.p[k] * f);
  const maiores = [...soma].sort((a, b) => b[1] - a[1]).slice(0, 4), total = maiores.reduce((s, x) => s + x[1], 0) || 1;
  return { o: [0, 1, 2, 3].map((k) => maiores[k]?.[0] ?? 0), p: [0, 1, 2, 3].map((k) => (maiores[k]?.[1] ?? 0) / total) };
}
// os triângulos das peças de apoio, como o modelo é: os 3 cantos, cada um com os pesos dele
function triangulosDe(pecas, ordem) {
  const tris = [];
  for (const peca of pecas) {
    const g = peca.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    if (!si || !sw) continue;
    const troca = peca.skeleton.bones.map((o) => Math.max(0, ordem.indexOf(o.name)));
    const canto = (i) => ({ p: new THREE.Vector3().fromBufferAttribute(pos, i), o: [0, 1, 2, 3].map((k) => troca[si.getComponent(i, k)] ?? 0), w: [0, 1, 2, 3].map((k) => sw.getComponent(i, k)) });
    const n = g.index ? g.index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) tris.push([0, 1, 2].map((k) => canto(g.index ? g.index.getX(t + k) : t + k)));
  }
  return tris;
}
/**
 * O POUSO: onde um raio que vem de trás (pelo eixo z; ou da FRENTE), na posição (x, y) do
 * modelo, encontra o corpo — devolvido JÁ com as proporções da raça: { p: o ponto, n: a
 * normal (para fora), w: os pesos dali }. null = não há corpo ali.
 */
function pousoEm(tris, deformador, x, y, frente = false) {
  let z = frente ? -Infinity : Infinity, achado = null, bar = null;
  for (const tri of tris) {
    const [A, B, C] = tri, d = (B.p.y - C.p.y) * (A.p.x - C.p.x) + (C.p.x - B.p.x) * (A.p.y - C.p.y);
    if (Math.abs(d) < 1e-9) continue;
    const a = ((B.p.y - C.p.y) * (x - C.p.x) + (C.p.x - B.p.x) * (y - C.p.y)) / d, b = ((C.p.y - A.p.y) * (x - C.p.x) + (A.p.x - C.p.x) * (y - C.p.y)) / d, g = 1 - a - b;
    if (a < -1e-4 || b < -1e-4 || g < -1e-4) continue;
    const zt = a * A.p.z + b * B.p.z + g * C.p.z;
    if (frente ? zt > z : zt < z) { z = zt; achado = tri; bar = [a, b, g]; }
  }
  if (!achado) return null;
  const V = achado.map((k) => deformador(k.p.clone(), k.o, k.w));
  const n = new THREE.Vector3().subVectors(V[1], V[0]).cross(new THREE.Vector3().subVectors(V[2], V[0])).normalize();
  if (frente ? n.z < 0 : n.z > 0) n.negate();
  return {
    p: new THREE.Vector3().addScaledVector(V[0], bar[0]).addScaledVector(V[1], bar[1]).addScaledVector(V[2], bar[2]), n,
    w: misturar(achado.map((k, i) => [{ o: k.o, p: k.w }, bar[i]])),
  };
}

/**
 * A geometria do penteado e da barba de um corpo, pronta para a malha fundida (já com as
 * proporções da raça e os ossos na ordem única) — ou null: não há o que desenhar (ids
 * desconhecidos, a barba do modelo, tudo debaixo do elmo).
 *  - `id`, `barba`: o penteado e a barba (ids de `PENTEADOS` e de `BARBAS`, ou null);
 *  - `cor`: '#rrggbb' ou null (a do modelo, `COR_PADRAO`); `elmo`: há elmo;
 *  - `apoio`: as peças em que a mecha e o pendente podem pousar (o tronco, o pescoço, a
 *    armadura do peito); `pecaDaBarba`: a peça `Beard` do modelo (a matéria do recorte);
 *  - `ordem`, `deformador`, `escala`, `largo`: os ossos do esqueleto único, a conta da raça
 *    para um ponto (raca.js `deformadorDe`), o tamanho da cabeça dela e o quanto o queixo
 *    alarga num lugar (`largoDoQueixo`, ou null);
 *  - `modelo`: uma geometria já pronta da malha fundida (os atributos saem do mesmo tipo:
 *    o `mergeGeometries` recusa tipos diferentes); `mapa`: a textura do corpo.
 */
export function geometriaDoPenteado({ id, barba, cor, elmo, apoio, pecaDaBarba, ordem, deformador, escala, largo, modelo, mapa }) {
  const formas = [...(PENTEADOS[id]?.formas ?? []), ...(BARBAS[barba]?.formas ?? [])];
  if (!formas.length) return null;
  const base = new THREE.Color(cor ?? COR_PADRAO), cabeca = Math.max(0, ordem.indexOf('Head'));
  let tris = null, daBarba = null;
  const pouso = (x, y, frente) => pousoEm(tris ??= triangulosDe(apoio, ordem), deformador, x, y, frente);
  const c = {
    elmo, k: escala, deformador, largo: largo ?? (() => 1), CABECA: { o: [cabeca, 0, 0, 0], p: [1, 0, 0, 0] },
    // o tom do cabelo: mais escuro na raiz, mais claro na ponta (o claro soma um pouco: no preto, só multiplicar não aparecia)
    tom: (f) => base.clone().multiplyScalar(f).addScalar(Math.max(0, f - 1) * 0.1),
    firme: (p) => deformador(p, c.CABECA.o, c.CABECA.p),
    // o pouso; na linha do meio, a média dos dois lados (um lado só prenderia a mecha a um ombro)
    pousar(x, y, frente = false) {
      if (Math.abs(x) > 2) return pouso(x, y, frente);
      const e = pouso(1, y, frente), d = pouso(-1, y, frente);
      if (!e || !d) return e ?? d;
      return { p: e.p.add(d.p).multiplyScalar(0.5).setX(0), n: e.n.add(d.n).normalize(), w: misturar([[e.w, 0.5], [d.w, 0.5]]) };
    },
    // a barba do modelo em triângulos: a parte de cada um e, em cada canto, a normal MÉDIA
    // do lugar (os cantos repetidos nas quinas saem juntos quando a folga os empurra)
    barba() {
      if (daBarba) return daBarba;
      const lista = pecaDaBarba ? triangulosDe([pecaDaBarba], ordem) : [], media = new Map();
      const chave = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
      for (const t of lista) {
        const n = new THREE.Vector3().subVectors(t[1].p, t[0].p).cross(new THREE.Vector3().subVectors(t[2].p, t[0].p));
        for (const k of t) { const s = media.get(chave(k.p)) ?? new THREE.Vector3(); media.set(chave(k.p), s.add(n)); }
      }
      for (const n of media.values()) n.normalize();
      return daBarba = lista.map((t) => {
        for (const k of t) k.n = media.get(chave(k.p));
        return { cantos: t, parte: parteDaBarba(Math.abs(t[0].p.x + t[1].p.x + t[2].p.x) / 3, (t[0].p.y + t[1].p.y + t[2].p.y) / 3, (t[0].p.z + t[1].p.z + t[2].p.z) / 3) };
      });
    },
  };
  const m = new Malha();
  for (const [forma, medidas] of formas) FORMAS[forma]?.(m, c, medidas);
  const n = m.v.length;
  if (!n) return null;
  const g = new THREE.BufferGeometry(), uvClaro = texelClaro(mapa) ?? [0.5, 0.5];
  const igual = (nome, padrao) => { const a = modelo.attributes[nome]; return a ? new THREE.BufferAttribute(new a.array.constructor(n * a.itemSize), a.itemSize, a.normalized) : padrao; };
  const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3), uv = igual('uv'), corV = igual('color');
  const si = new THREE.BufferAttribute(new Uint16Array(n * 4), 4), sw = igual('skinWeight', new THREE.BufferAttribute(new Float32Array(n * 4), 4));
  m.v.forEach((v, i) => {
    pos.setXYZ(i, v.p.x, v.p.y, v.p.z);
    uv?.setXY(i, uvClaro[0], uvClaro[1]);
    if (corV) { corV.setXYZ(i, Math.min(1, v.cor.r), Math.min(1, v.cor.g), Math.min(1, v.cor.b)); if (corV.itemSize > 3) corV.setW(i, 1); }
    si.setXYZW(i, ...v.w.o); sw.setXYZW(i, ...v.w.p);
  });
  g.setAttribute('position', pos);
  if (uv) g.setAttribute('uv', uv);
  if (corV) g.setAttribute('color', corV);
  g.setAttribute('skinIndex', si); g.setAttribute('skinWeight', sw);
  g.computeVertexNormals();   // sem índice: normal por face
  return g;
}
