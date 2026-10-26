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
 *  - o cabelo que COBRE a cabeça (a TOUCA, os TUFOS): o couro cabeludo é achado por RAIOS
 *    saídos do meio da cabeça (`CENTRO`, `direcao`: graus de volta e de lado), e a touca é
 *    uma casca facetada sobre ele, presa aos ossos da pele dali. A CAÍDA é a mecha que cai
 *    pela FRENTE do ombro (as "tranças de guerra": gomos amarrados com couro, a argola de
 *    ferro de pontas e a ponta desfiada — `cauda`); o FIAPO, um fio solto preso à pele do
 *    rosto.
 *
 * O penteado é feito JÁ com as proporções da raça (`deformador`, raca.js): o pouso é no
 * corpo como a raça o deixa, e a grossura da mecha não estica com ele (engrossada junto
 * com as costas do orc, a trança ficava com o dobro do fundo). Por isso entra na malha
 * fundida por último e fora do `deformar` (guerreiro.js `geometriaFundida`), e é refeito a
 * cada corpo: depende da raça e do que está vestido.
 *
 * AS BARBAS (`BARBAS`, 12/10/2026) são feitas do mesmo jeito e vão na mesma geometria,
 * com duas formas:
 *  - o RECORTE: PARTES da barba do modelo (a peça `Beard`) — o bigode, o queixo, o maxilar,
 *    a costeleta (`parteDaBarba`: pelo lugar de cada triângulo). A 'modelo' ("Cheia") são
 *    todas; o cavanhaque, bigode + queixo; a moldura, tudo menos o bigode. Cada ponto é
 *    preso à PELE do rosto pelo ÍMÃ (ima.js): fica do lugar da pele mais perto dele à
 *    distância a que o modelo o pôs — e vai com ela para onde a raça a levar (alargada "como
 *    o queixo", por uma conta à parte, a barba flutuava a dois dedos da bochecha). Na
 *    BEIRADA do recorte a barba desce até a pele (não fica uma casca aberta no ar), e a
 *    `folga` (a barba mais cheia) só levanta a camada de fora;
 *  - o PENDENTE: o que cai do queixo (a barbicha, a barba longa, a trança de barba). É preso
 *    à cabeça, mas onde o corpo passa à frente dele (o peito do orc, a armadura) POUSA nele,
 *    pela frente, como a mecha nas costas.
 * O dígito da barba na aparência é o lugar na lista (`BARBAS_PADRAO`, ou `barbas` da raça),
 * como o do cabelo.
 *
 * O PENTEADO DO ARQUIVO (26/10/2026): `assets/penteados.json`, gravado pela aba CABELO do Editor de
 * Personagem (o editor de cenas), SUBSTITUI o do código de mesmo id — ou entra como novo (`usarPenteados`,
 * chamado pelo assets.js ao carregar). As medidas que a aba mostra, com rótulo e régua, são as de `MEDIDAS`:
 * forma nova do cabelo = a função em `FORMAS` E a lista dela em `MEDIDAS`.
 *
 * AS SOBRANCELHAS (`SOBRANCELHAS`) são a do modelo (a peça `Eye_Brows`) inteira ou MEXIDA —
 * mais alta, mais curta, inclinada, unida no meio — e presa à pele do rosto pelo mesmo ÍMÃ:
 * na raça de arcada saliente, assentam em cima dela. O lugar na lista é o 7º dígito da
 * aparência.
 */
import * as THREE from 'three';
import { texelClaro } from './casca.js';
import { Assets, CORPOS_DE_ARQUIVO } from './assets.js';   // (o cabelo dos corpos de arquivo: a forma `malha`; só lido ao desenhar)
import { triangulosDe, raio, raioDe, grudar, lugar, normalLisa, pesos, misturar } from './ima.js';

// quem não escolheu a cor ("Original"): o castanho do cabelo do modelo, medido na textura
// dele — é a cor em que a barba e as sobrancelhas ficam
const COR_PADRAO = '#62423c';
const FAIXA = '#5b3a22', OSSO = '#e6dcc0';   // a tira de couro que amarra, e a argola de osso
const FERRO = '#767e8a', FERRO_CLARO = '#bcc3cc';   // a argola de ferro das tranças de guerra, e as pontas dela
// O MEIO DA CABEÇA na altura das orelhas (cm, pose T): de onde saem os raios que acham o couro
const CENTRO = new THREE.Vector3(0, 169, -2.5);
/**
 * Uma direção a partir do meio da cabeça: `volta` graus do rosto à nuca POR CIMA (0 = para
 * a frente, 90 = para cima, 180 = para trás) e `lado` graus para o lado (+ = o x positivo;
 * ±90 = a orelha).
 */
const direcao = (volta, lado) => { const a = (volta * Math.PI) / 180, b = (lado * Math.PI) / 180; return new THREE.Vector3(Math.sin(b), Math.cos(b) * Math.sin(a), Math.cos(b) * Math.cos(a)); };
// A LINHA DO MEIO do couro cabeludo (x = 0), da testa à nuca: [z, y], medidos na peça `head`
const COURO = [[13.5, 180.5], [10.4, 184.3], [4.8, 187.2], [-2.8, 188.0], [-12.8, 182.7], [-15.2, 179.0], [-15.6, 175.6], [-15.2, 172.3], [-14.4, 168.8], [-11.3, 162.9]];
const NUCA = 161;      // dessa altura para baixo a mecha pousa no corpo
const AFUNDA = 1.3;    // quanto a raiz de cada forma entra na cabeça (não fica fresta)
const FOLGA = 0.5;     // entre a mecha e o corpo em que ela pousa
const BEIRA = 0.45;    // a que distância da pele fica a beirada da touca (rente, o crânio facetado aparecia por entre os triângulos dela)
const COBRE = 0.5;     // quanto a touca passa de cada quina do crânio (ver `touca`)

/**
 * Os penteados que há. `formas`: [nome da forma em `FORMAS`, as medidas dela]. As medidas
 * são em cm; `de`/`ate`/`em`/`raiz` são lugares na linha do couro (cm a partir da testa:
 * ~19 é o alto da cabeça, ~30 o cocuruto de trás).
 */
const CRISTA = (ate) => ['crina', { de: 2.5, ate, altura: 2.7, largura: 3.5, topo: 0.6, dente: 0.6 }];
const TRANCA = (x = 0, o = {}) => ['mecha', { raiz: 33.5, x, solta: [[179.4, -18.6], [175, -20.6], [169.5, -20.2], [165, -18.6]], ate: 120, raio: 2.7, elo: 4.6, argola: true, ...o }];
// as TRANÇAS DE GUERRA: a mecha de cada lado (nasce atrás da orelha e cai pela frente do ombro) e o fiapo da têmpora
const CAIDA = (lado) => ['caida', { lado, raiz: [198, 47], solta: [[11.8, 164.2, -7.2], [13.4, 160.2, -2.8]], x: 12.8, abre: -2.2, de: 151, ate: 120, raio: 4.1, gomos: 4 }];
// o COMPRIDO: as mechas soltas das costas (nascem no alto de trás, `l` graus para o lado, e caem em `x`) e a da frente do ombro
const COSTAS = (lado, l, x, o = {}) => ['solto', { lado, raiz: [150, l], sai: [200, l * 0.9], x, ate: 118, raio: 4.2, larg: 1.65, achata: 0.5, ...o }];
const SOLTA_NA_FRENTE = (lado) => ['solto', { lado, frente: true, raiz: [120, 60], sai: [175, 72], solta: [[12, 162.5, -6.5], [13.6, 158.5, -2.4]], x: 12.6, abre: -1, de: 151, ate: 126, raio: 3.9, larg: 1.5, onda: 1.1, passo: 11, fase: 0.6 }];
// o LISO COM FRANJA: as mechas lisas que caem dos lados do rosto, por cima da orelha, até o peito (`perto`: a de junto
// do rosto; a outra, mais para fora e para trás, por cima do ombro) — sem onda, a ponta quase reta
// (ESTREITAS: a seção do fio é larga de um lado ao outro — certo deitada no peito, mas do lado do rosto virava uma aba)
const LISA_NA_FRENTE = (lado, o = {}) => ['solto', { lado, frente: true, raiz: [88, 64], sai: [104, 82], solta: [[9.2, 170.5, 6.4], [9.6, 164.5, 5.4], [10.2, 158.5, 3.4]], x: 10.2, abre: 0.8, de: 152, ate: 124, raio: 2.3, larg: 1.15, achata: 0.6, onda: 0.1, passo: 40, vira: 0.2, folga: 1.4, ...o }];
const LISA_NAS_COSTAS = (lado, l, x, o = {}) => COSTAS(lado, l, x, { onda: 0.18, passo: 40, vira: 0.3, folga: 1.2, raio: 3.4, ...o });
const FIAPO = (lado) => ['fiapo',{ lado, pontos: [[9.3, 176.6, 4.8], [10.8, 172.4, 4.4], [11.2, 167.4, 4.8], [10.9, 162.6, 5.6], [10.4, 158.8, 6.2]] }];
export const PENTEADOS = {
  rabo: { nome: 'Rabo de cavalo', formas: [['mecha', { raiz: 29.5, solta: [[187, -16.8], [186.2, -21.4], [181, -24.6], [174, -25], [167.5, -22.6]], ate: 134, raio: 3.7 }]] },
  tranca: { nome: 'Trança', formas: [TRANCA()] },
  trancas: { nome: 'Duas tranças', formas: [TRANCA(4.4, { abre: 3, raio: 2.1, elo: 3.9, ate: 126 }), TRANCA(-4.4, { abre: -3, raio: 2.1, elo: 3.9, ate: 126 })] },
  coque: { nome: 'Coque', formas: [['coque', { em: 24, raio: 4.3 }]] },
  crista: { nome: 'Crista', formas: [CRISTA(41)] },
  moicano: { nome: 'Moicano', formas: [['crina', { de: 1.5, ate: 42, altura: 9, largura: 3.1, topo: 0.3, dente: 2.4, inclina: 0.2 }]] },
  espinhos: { nome: 'Espinhos', formas: [['espinhos', { de: 3.5, ate: 39, n: 8, altura: 11.5, largura: 2.6, base: 3.6 }]] },
  cristaTranca: { nome: 'Crista e trança', formas: [CRISTA(31), TRANCA()] },
  // O REPICADO (19/10/2026): curto e bagunçado, as mechas pontudas saindo do alto da cabeça — a
  // franja em pontas na testa (uma cai entre os olhos), as laterais na frente da orelha até o
  // maxilar, a nuca curta — e a ANTENA (o fio que sobe do cocuruto e cai para a frente)
  repicado: { nome: 'Repicado', formas: [
    ['touca', { de: 34, ate: 214, lado: 86, linhas: 9, colunas: 13, folga: 1.7, onda: 0.4, recua: 4 }],
    ['mechas', { folga: 2.5, passos: 3, lista: [
      // [volta, lado] da raiz e da ponta, a meia largura, quanto a ponta cai além do crânio e abre para fora
      // a franja: larga, em pontas, uma caindo entre os olhos
      [97, 2, 7, 4, 3.1, 0.5, 0.3], [95, 11, 15, 13, 3.0], [93, 21, 20, 25, 2.9, 0, 0.3], [91, 31, 17, 37, 2.8, 0.3, 0.4], [89, 41, 13, 50, 2.6, 0.6, 0.6],
      // as laterais (na frente da orelha e por cima dela, até o maxilar, abrindo na ponta)
      [84, 52, -18, 70, 2.5, 1.5, 0.9], [76, 63, -26, 84, 2.7, 2.5, 1.3], [118, 60, 202, 76, 2.6, 2.5, 1.3],
      // a nuca, curta
      [132, 0, 218, 0, 2.8, 2.2, 0.5], [130, 19, 216, 24, 2.7, 2.4, 0.7], [126, 38, 211, 46, 2.6, 2.4, 1],
    ] }],
    // (pontas espetadas no alto: o contorno bagunçado)
    ['tufos', { deita: 38, largura: 1.7, base: 2.6, pontas: [[102, -30, 3.6], [102, 30, 3.6], [122, -52, 3.2], [122, 52, 3.2], [140, -20, 3], [140, 20, 3]] }],
    ['antena', { em: [104, 3], altura: 6.5, frente: 6.5, largura: 1.15 }],
  ] },
  guerreira: { nome: 'Tranças de guerra', formas: [
    ['touca', { de: 36, ate: 204, lado: 62, linhas: 9, colunas: 9, folga: 1.1, onda: 0.7, recua: 10 }],
    ['tufos', { deita: 62, largura: 2, base: 3.4, pontas: [[74, 0, 6.5], [80, -26, 5.5], [80, 26, 5.5], [104, -13, 7.5], [104, 13, 7.5], [110, -38, 6], [110, 38, 6], [134, 0, 8.5], [138, -26, 7], [138, 26, 7]] }],
    CAIDA(1), CAIDA(-1), FIAPO(1), FIAPO(-1),
  ] },
  // O COMPRIDO (20/10/2026, o da referência do dono): solto e ondulado até o meio das costas — a touca
  // cheia, repartida no meio com as mechas caindo nas têmporas e por cima das orelhas, uma mecha solta
  // pela frente de cada ombro e sete pelas costas, cada uma ondulando no seu tempo, as pontas virando
  longo: { nome: 'Comprido', formas: [
    ['touca', { de: 30, ate: 214, lado: 86, linhas: 9, colunas: 13, folga: 2, onda: 0.7, recua: 6 }],
    ['mechas', { folga: 2.6, rente: 1.2, grossura: 0.5, lista: [[104, 5, 62, 58, 3.6, 3.5, 1.2], [112, 14, 78, 76, 3.4, 5.5, 1.6], [126, 24, 128, 80, 3.2, 6, 1.6]] }],
    COSTAS(1, 0, 0, { ate: 115 }),
    COSTAS(1, 24, 5, { fase: 2.1, abre: 1, ate: 118, raio: 4.1 }), COSTAS(-1, 24, 5, { fase: 3.3, abre: 1, ate: 117, raio: 4.1 }),
    COSTAS(1, 46, 9, { fase: 4.2, abre: 2.5, ate: 120, raio: 4 }), COSTAS(-1, 46, 9, { fase: 5.1, abre: 2.5, ate: 121, raio: 4 }),
    COSTAS(1, 66, 12.5, { fase: 1, abre: 4, ate: 124, raio: 3.8 }), COSTAS(-1, 66, 12.5, { fase: 0.2, abre: 4, ate: 123, raio: 3.8 }),
    SOLTA_NA_FRENTE(1), SOLTA_NA_FRENTE(-1),
  ] },
  // O LISO COM FRANJA (26/10/2026, a referência do dono — a personagem gótica): liso e comprido, a FRANJA reta cortada
  // logo acima das sobrancelhas, as laterais caindo lisas dos dois lados do rosto até o peito e as costas lisas até o
  // meio delas
  lisoFranja: { nome: 'Liso com franja', formas: [
    ['touca', { de: 30, ate: 214, lado: 86, linhas: 9, colunas: 13, folga: 1.8, onda: 0.15, recua: 4 }],
    ['franja', { raiz: 104, corte: 15, lado: 62 }],
    LISA_NA_FRENTE(1), LISA_NA_FRENTE(-1),
    LISA_NA_FRENTE(1, { raiz: [96, 80], sai: [112, 90], solta: [[10.6, 168, 3.6], [11.2, 161.5, 1.8]], x: 11.8, abre: 1, ate: 127 }),
    LISA_NA_FRENTE(-1, { raiz: [96, 80], sai: [112, 90], solta: [[10.6, 168, 3.6], [11.2, 161.5, 1.8]], x: 11.8, abre: 1, ate: 127 }),
    LISA_NAS_COSTAS(1, 0, 0, { ate: 114 }),
    LISA_NAS_COSTAS(1, 24, 5, { abre: 0.6, ate: 115 }), LISA_NAS_COSTAS(-1, 24, 5, { abre: 0.6, ate: 115 }),
    LISA_NAS_COSTAS(1, 46, 9, { abre: 1.5, ate: 116, raio: 3.3 }), LISA_NAS_COSTAS(-1, 46, 9, { abre: 1.5, ate: 116, raio: 3.3 }),
    LISA_NAS_COSTAS(1, 66, 12.5, { abre: 2.5, ate: 118, raio: 3.1 }), LISA_NAS_COSTAS(-1, 66, 12.5, { abre: 2.5, ate: 118, raio: 3.1 }),
  ] },
  // OS DOIS COQUES (26/10/2026, a referência do dono — a prancha low poly): o cabelo preso em duas BOLAS facetadas no
  // alto da cabeça, a franja reta e grossa na testa, a risca no meio, as mechas pontudas emoldurando o rosto até o
  // maxilar e a nuca em V
  coques: { nome: 'Dois coques', formas: [
    ['touca', { de: 30, ate: 214, lado: 86, linhas: 9, colunas: 13, folga: 2.2, onda: 0.1, recua: 5, risca: 1 }],
    ['franja', { raiz: 98, corte: 16, lado: 52, colunas: 11, passos: 6, folga: 2.3, rente: 0.9, grossura: 0.7, fios: 0.6 }],
    ['mechas', { folga: 2.3, rente: 1, grossura: 0.5, passos: 4, lista: [
      // a do rosto: da têmpora, na frente da orelha, até o maxilar
      [62, 58, -22, 70, 2.3, 4.5, 1],
      // atrás da orelha, até o pescoço
      [112, 64, 200, 80, 2.6, 3, 1.4],
      // a nuca em V
      [136, 0, 218, 0, 3, 3.6, 0.5], [132, 22, 214, 26, 2.4, 1.6, 0.8],
    ] }],
    // (os coques nos cantos de cima da cabeça, o meio deles acima do couro: saltam da silhueta, como na referência)
    ['bola', { em: [108, 33], raio: 5.6, sai: 6.1, achata: 0.94, inclina: 6, bagunca: 0.1 }],
  ] },
  // OS COQUES DO MODELO (26/10/2026): o cabelo do próprio modelo da Feminino 2 (o corpo de arquivo), tirado do corpo dela
  // — a forma MALHA; as réguas (na aba Cabelo do editor) aumentam, achatam, giram e mudam o lugar dele
  coquesDoModelo: { nome: 'Coques (do modelo)', formas: [['malha', { corpo: 0 }]] },
};

/**
 * Os do HUMANO (e da raça sem lista própria). A ORDEM é o número do cabelo no save do
 * personagem: não reordene nem tire do meio — penteado novo entra no FIM. (O primeiro é o
 * de quem tinha o cabelo solto do modelo: o save dele diz "1".)
 */
export const PENTEADOS_PADRAO = ['rabo', 'tranca', 'trancas', 'coque', 'crista', 'moicano', 'espinhos', 'cristaTranca', 'repicado'];

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
 * AS MEDIDAS de cada forma do CABELO, para a aba Cabelo do editor: [chave, rótulo, padrão, mín, máx, passo, colunas]. O
 * PADRÃO diz o tipo — número (a régua), sim/não, um PAR de números ([volta, lado], com os nomes em `colunas`) ou uma
 * LISTA de linhas de números (as colunas nomeadas) —, e vale quando a forma não diz a medida (o mesmo padrão da função;
 * nas que ela exige, um exemplo: é com ele que nasce a forma nova). Só estas formas entram num penteado do arquivo.
 */
const VL = ['volta', 'lado'], XYZ = ['x', 'y', 'z'];
export const MEDIDAS = {
  touca: [['de', 'testa (volta)', 30, 0, 120, 1], ['ate', 'nuca (volta)', 214, 150, 240, 1], ['lado', 'até o lado (graus)', 86, 30, 100, 1],
    ['linhas', 'linhas', 9, 3, 17, 1], ['colunas', 'colunas', 13, 3, 21, 1], ['folga', 'volume (cm)', 1.1, 0, 5, 0.05], ['onda', 'gomos (cm)', 0.6, 0, 3, 0.05],
    ['recua', 'recuo nas têmporas', 0, 0, 30, 0.5], ['risca', 'risca no meio (cm)', 0, 0, 3, 0.05]],
  franja: [['raiz', 'raiz (volta)', 104, 60, 140, 1], ['corte', 'corte (volta: menos = mais baixo)', 19, -10, 60, 0.5], ['lado', 'largura (graus de cada lado)', 60, 10, 90, 1],
    ['colunas', 'colunas', 13, 3, 25, 1], ['passos', 'passos', 7, 2, 12, 1], ['folga', 'volume (cm)', 1.9, 0, 5, 0.05], ['rente', 'rente no corte (cm)', 0.75, 0, 3, 0.05],
    ['grossura', 'grossura do corte (cm)', 0.5, 0.1, 2, 0.05], ['fios', 'pontas desiguais (cm)', 0.22, 0, 3, 0.02]],
  mechas: [['lista', 'mechas', [[95, 20, 30, 40, 2.2, 1, 0.5]], -90, 240, 0.5, ['raiz volta', 'raiz lado', 'ponta volta', 'ponta lado', 'largura', 'cai', 'abre']],
    ['folga', 'volume (cm)', 1.9, 0, 5, 0.05], ['rente', 'rente na ponta (cm)', 0.8, 0, 3, 0.05], ['grossura', 'grossura', 0.42, 0.1, 2, 0.02], ['passos', 'passos', 4, 2, 8, 1]],
  bola: [['em', 'lugar', [122, 42], -90, 240, 1, VL], ['raio', 'raio (cm)', 5, 1, 12, 0.1], ['sai', 'meio afastado do couro (cm)', 4, -3, 12, 0.1],
    ['achata', 'achatada', 0.92, 0.3, 1.6, 0.01], ['inclina', 'deitada para trás (graus)', 0, -60, 60, 1], ['bagunca', 'facetas desiguais', 0.1, 0, 0.4, 0.01],
    ['detalhe', 'faces (0 = 20, 1 = 80, 2 = 320)', 1, 0, 2, 1], ['semente', 'sorteio das facetas', 1, 1, 99, 1], ['espelho', 'dos dois lados', true]],
  tufos: [['pontas', 'pontas', [[102, 0, 4]], -90, 240, 0.1, ['volta', 'lado', 'altura']], ['deita', 'deitados (graus)', 55, 0, 90, 1],
    ['largura', 'largura', 1.6, 0.3, 5, 0.05], ['base', 'pé (comprimento)', 2.8, 0.5, 8, 0.1]],
  coque: [['em', 'lugar (cm da testa)', 24, 0, 45, 0.5], ['raio', 'raio (cm)', 4.3, 1, 10, 0.1]],
  crina: [['de', 'de (cm da testa)', 2.5, 0, 45, 0.5], ['ate', 'até', 41, 0, 45, 0.5], ['altura', 'altura', 2.7, 0, 15, 0.1], ['largura', 'largura', 3.5, 0.5, 8, 0.1],
    ['topo', 'topo (fração)', 0.5, 0, 1, 0.05], ['dente', 'dentes', 0, 0, 5, 0.1], ['inclina', 'inclina', 0, -1, 1, 0.05], ['passo', 'passo', 3.2, 1, 8, 0.1]],
  espinhos: [['de', 'de (cm da testa)', 3.5, 0, 45, 0.5], ['ate', 'até', 39, 0, 45, 0.5], ['n', 'quantos', 8, 2, 20, 1], ['altura', 'altura', 11.5, 1, 25, 0.1],
    ['largura', 'largura', 1.9, 0.3, 5, 0.05], ['base', 'pé', 3.3, 0.5, 8, 0.1], ['inclina', 'inclina', 0.35, -1, 1.5, 0.05]],
  antena: [['em', 'lugar', [104, 3], -90, 240, 1, VL], ['altura', 'altura', 4.5, 0, 15, 0.1], ['frente', 'para a frente', 5.5, -10, 15, 0.1], ['largura', 'largura', 0.85, 0.2, 3, 0.05]],
  mecha: [['raiz', 'raiz (cm da testa)', 29.5, 0, 45, 0.5], ['solta', 'pontos soltos', [[187, -16.8], [181, -24.6]], -40, 200, 0.1, ['y', 'z']], ['ate', 'até a altura', 134, 60, 160, 1],
    ['raio', 'grossura', 3.7, 0.5, 8, 0.05], ['x', 'x', 0, -10, 10, 0.1], ['abre', 'abre', 0, -10, 10, 0.1], ['elo', 'trança: gomo (0 = sem)', 0, 0, 10, 0.1],
    ['argola', 'argola', false], ['achata', 'achatada', 0.72, 0.2, 1.5, 0.01]],
  caida: [['lado', 'lado (1 ou -1)', 1, -1, 1, 2], ['raiz', 'raiz', [198, 47], -90, 240, 1, VL], ['solta', 'pontos soltos', [[11.8, 164.2, -7.2], [13.4, 160.2, -2.8]], -40, 200, 0.1, XYZ],
    ['x', 'x', 12.8, 0, 20, 0.1], ['abre', 'abre', 0, -10, 10, 0.1], ['de', 'pousa de', 151, 100, 170, 1], ['ate', 'até a altura', 120, 60, 160, 1], ['raio', 'grossura', 4.1, 0.5, 8, 0.05],
    ['gomos', 'gomos', 3, 1, 8, 1], ['ferro', 'argola de ferro', true], ['achata', 'achatada', 0.86, 0.2, 1.5, 0.01], ['prumo', 'prumo', 0.12, 0, 1, 0.01]],
  solto: [['lado', 'lado (1 ou -1)', 1, -1, 1, 2], ['raiz', 'raiz', [150, 0], -90, 240, 1, VL], ['sai', 'sai do couro em', [200, 0], -90, 240, 1, VL], ['solta', 'pontos soltos', [], -40, 200, 0.1, XYZ],
    ['frente', 'pela frente do ombro', false], ['x', 'x', 0, -20, 20, 0.1], ['abre', 'abre', 0, -10, 10, 0.1], ['de', 'pousa de', NUCA, 100, 175, 1], ['ate', 'até a altura', 118, 60, 160, 1],
    ['raio', 'grossura', 4.2, 0.5, 8, 0.05], ['onda', 'onda (cm)', 1.4, 0, 5, 0.05], ['passo', 'passo da onda', 13, 3, 60, 0.5], ['fase', 'fase', 0, 0, 6.3, 0.05], ['folga', 'volume (cm)', 2.2, 0, 5, 0.05],
    ['vira', 'ponta vira', 2, -5, 8, 0.05], ['achata', 'achatada', 0.6, 0.2, 1.5, 0.01], ['larg', 'largura', 1.3, 0.5, 3, 0.05], ['prumo', 'prumo', 0.12, 0, 1, 0.01]],
  fiapo: [['lado', 'lado (1 ou -1)', 1, -1, 1, 2], ['pontos', 'pontos', [[9.3, 176.6, 4.8], [10.8, 172.4, 4.4], [11.2, 167.4, 4.8]], -40, 200, 0.1, XYZ], ['raio', 'grossura', 0.62, 0.1, 3, 0.02]],
  malha: [['corpo', 'de qual corpo de arquivo (nº)', 0, 0, 9, 1], ['escala', 'tamanho', 1, 0.5, 1.6, 0.01], ['largura', 'largura', 1, 0.5, 1.6, 0.01],
    ['altura', 'altura', 1, 0.5, 1.6, 0.01], ['fundo', 'fundo', 1, 0.5, 1.6, 0.01], ['x', 'para o lado (cm)', 0, -10, 10, 0.1], ['y', 'para cima (cm)', 0, -10, 10, 0.1],
    ['z', 'para a frente (cm)', 0, -10, 10, 0.1], ['giro', 'giro (graus)', 0, -45, 45, 0.5], ['inclina', 'inclinação (graus, + para trás)', 0, -45, 45, 0.5],
    ['tomBaixo', 'tom embaixo', 0.8, 0.3, 1.5, 0.01], ['tomCima', 'tom em cima', 1.08, 0.3, 1.5, 0.01]],
};
/** Uma forma NOVA do cabelo, com as medidas de exemplo (as de `MEDIDAS`). */
export const formaNova = (forma) => [forma, Object.fromEntries((MEDIDAS[forma] ?? []).map(([k, , p]) => [k, JSON.parse(JSON.stringify(p))]))];

// uma medida do arquivo: número, sim/não, ou lista (de números, ou de listas de números) — nada de texto, objeto ou fundo demais
const medidaBoa = (v, fundo = 0) => (typeof v === 'number' ? Number.isFinite(v) : typeof v === 'boolean' || (Array.isArray(v) && fundo < 2 && v.length <= 200 && v.every((x) => medidaBoa(x, fundo + 1))));
/** Um penteado do arquivo está em ordem? (o id só de letras, como nas listas das raças; as formas, as do cabelo) */
export const penteadoValido = (id, p) => /^[A-Za-z]{1,30}$/.test(id) && !!p && typeof p.nome === 'string' && p.nome.length <= 40 && Array.isArray(p.formas) && p.formas.length <= 80
  && p.formas.every((f) => Array.isArray(f) && f.length === 2 && f[0] in MEDIDAS && f[1] && typeof f[1] === 'object' && !Array.isArray(f[1]) && Object.entries(f[1]).every(([k, v]) => /^\w{1,30}$/.test(k) && medidaBoa(v)));
/** Os penteados como o CÓDIGO os desenha (a aba Cabelo compara com eles: "voltar ao do código"). */
export const PENTEADOS_DO_CODIGO = JSON.parse(JSON.stringify(PENTEADOS));
/**
 * Usa os penteados do ARQUIVO (`assets/penteados.json`: { penteados: { id: { nome, formas } } }): cada um substitui o do
 * código de mesmo id, ou entra no FIM do catálogo; o torto é ignorado (fica o do código). Chamar de novo refaz tudo a
 * partir do código (a aba Cabelo, a cada mudança). Devolve os ids ignorados.
 */
export function usarPenteados(dados) {
  for (const id of Object.keys(PENTEADOS)) delete PENTEADOS[id];
  Object.assign(PENTEADOS, JSON.parse(JSON.stringify(PENTEADOS_DO_CODIGO)));
  const tortos = [];
  for (const [id, p] of Object.entries(dados?.penteados ?? {})) {
    if (penteadoValido(id, p)) PENTEADOS[id] = { nome: p.nome, formas: JSON.parse(JSON.stringify(p.formas)) };
    else tortos.push(id);
  }
  if (tortos.length) console.warn('[penteados] ignorei os do arquivo que vieram tortos:', tortos.join(', '));
  return tortos;
}
/** Onde um ponto (cm, pose T) está no crânio: [volta, lado] em graus, as medidas das formas (ver `direcao`). */
export function voltaELado(p) {
  const d = new THREE.Vector3(p.x, p.y, p.z).sub(CENTRO).normalize();
  let volta = (Math.atan2(d.y, d.z) * 180) / Math.PI;
  if (volta < -90) volta += 360;
  return [Math.round(volta), Math.round((Math.asin(d.x) * 180) / Math.PI)];
}

/**
 * As barbas que há ('modelo' é a do modelo inteira, a de sempre). `partes`: as partes da
 * barba do modelo que o recorte leva (`parteDaBarba`); `solta`: os pontos [y, z] por onde
 * o pendente desce, na linha do meio.
 */
const MOLDURA = ['costeleta', 'maxilar', 'queixo'];
export const BARBAS = {
  modelo: { nome: 'Cheia', formas: [['recorte', { partes: ['bigode', ...MOLDURA] }]] },
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
 * modelo inteira: o save de antes dizia "1" para "com barba".)
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

/**
 * As sobrancelhas que há: a do modelo como é ('modelo'), ou mexida — `alta`: quantas vezes
 * mais alta (a partir da beira de baixo: não desce sobre o olho); `longa`: o comprimento
 * (menos de 1 encolhe em volta do meio; mais de 1 cresce para dentro); `inclina`: graus —
 * positivo, a ponta de fora sobe e a de dentro desce (brava); `folga`: quanto sai a mais da
 * pele (mais grossa); `ponte`: uma faixa de pelo por cima do nariz, de uma à outra (unidas).
 */
export const SOBRANCELHAS = {
  modelo: { nome: 'Normais', formas: [['sobrancelha', {}]] },
  grossas: { nome: 'Grossas', formas: [['sobrancelha', { alta: 1.75, folga: 0.3 }]] },
  finas: { nome: 'Finas', formas: [['sobrancelha', { alta: 0.5 }]] },
  bravas: { nome: 'Bravas', formas: [['sobrancelha', { inclina: 16, alta: 1.25 }]] },
  caidas: { nome: 'Caídas', formas: [['sobrancelha', { inclina: -13 }]] },
  curtas: { nome: 'Curtas', formas: [['sobrancelha', { longa: 0.6 }]] },
  unidas: { nome: 'Unidas', formas: [['sobrancelha', { alta: 1.15, ponte: true }]] },
  // (20/10/2026: o rosto estilizado da referência do dono — fina e brava, a ponta de fora subindo)
  afiadas: { nome: 'Afiadas', formas: [['sobrancelha', { alta: 0.45, inclina: 14 }]] },
};
/**
 * As do HUMANO (e da raça sem lista própria). A ORDEM é o número da sobrancelha no save
 * do personagem (o 7º dígito da aparência): não reordene nem tire do meio — a nova entra no
 * FIM. (A primeira é a do modelo: código sem o 7º dígito vale ela.)
 */
export const SOBRANCELHAS_PADRAO = ['modelo', 'grossas', 'finas', 'bravas', 'caidas', 'curtas', 'unidas', 'afiadas'];
/** As sobrancelhas de uma raça (null = humano), na ordem em que valem ([] = a raça não tem). */
export const sobrancelhasDe = (raca) => (Array.isArray(raca?.sobrancelhas) ? raca.sobrancelhas : SOBRANCELHAS_PADRAO);
/** A sobrancelha de número `n` (0 = sem) de uma raça: o id, ou null. Além da lista, a última. */
export function sobrancelhaDe(raca, n) {
  const lista = sobrancelhasDe(raca);
  return n > 0 && lista.length ? lista[Math.min(n, lista.length) - 1] : null;
}
export const nomeDaSobrancelha = (id) => SOBRANCELHAS[id]?.nome ?? id;
// a sobrancelha do modelo (a do lado +x; cm, pose T): de onde a onde vai (`dentro`, `fora`:
// o x das pontas), a beira de baixo e o meio dela. `acima`: a distância mínima da pele a
// que a camada de FORA de uma sobrancelha mexida fica — o rosto é facetado, e rente a ele a
// pele aparecia por entre os triângulos dela
const SOBRANCELHA = { dentro: 2.0, fora: 7.4, baixo: 173.15, meio: 4.7, acima: 0.15 };
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
// um número "sorteado" entre 0 e 1, sempre o mesmo para o mesmo (i, semente): as facetas da bola não mudam a cada corpo
const sorteio = (i, s) => { const x = Math.sin(i * 12.9898 + s * 78.233) * 43758.5453; return x - Math.floor(x); };
// a ESFERA de raio 1 facetada (o icosaedro dividido `detalhe` vezes): os lugares (sem repetir) e as faces (três lugares cada)
const esferas = new Map();
function esferaUnitaria(detalhe) {
  if (esferas.has(detalhe)) return esferas.get(detalhe);
  const g = new THREE.IcosahedronGeometry(1, detalhe), P = g.attributes.position, lugares = [], indice = new Map(), faces = [];
  const lugar = (i) => {
    const chave = `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`;
    if (!indice.has(chave)) { indice.set(chave, lugares.length); lugares.push(new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i))); }
    return indice.get(chave);
  };
  for (let i = 0; i < P.count; i += 3) faces.push([lugar(i), lugar(i + 1), lugar(i + 2)]);
  g.dispose();
  const e = { lugares, faces };
  esferas.set(detalhe, e);
  return e;
}

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

  // A MALHA (26/10/2026): o cabelo PRONTO de um corpo de arquivo (corpo-arquivo.js — o da Feminino 2, tirado do modelo
  // dela pelo importar.mjs: `Assets.corpos[nome].cabelo`), inteiro e preso à cabeça. `corpo`: o número dele em
  // CORPOS_DE_ARQUIVO. As réguas: `escala` (e por eixo `largura`, `altura`, `fundo`) em volta do meio da cabeça dele
  // (`pivo`), `giro` (em volta do eixo de pé) e `inclina` (para trás), e andar `x`, `y`, `z` cm; o tom vai de `tomBaixo`
  // a `tomCima`. Ele está no lugar da cabeça DAQUELE corpo: em outro corpo, fica onde ela estaria. Com elmo, sai.
  malha(m, c, { corpo = 0, escala = 1, largura = 1, altura = 1, fundo = 1, x = 0, y = 0, z = 0, giro = 0, inclina = 0, tomBaixo = 0.8, tomCima = 1.08 }) {
    const cab = Assets.corpos?.[CORPOS_DE_ARQUIVO[Math.round(corpo)]]?.cabelo;
    if (c.elmo || !cab) return;
    const piv = new THREE.Vector3(...cab.pivo), anda = new THREE.Vector3(x, y, z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((inclina * Math.PI) / 180, (giro * Math.PI) / 180, 0, 'YXZ'));
    let baixo = Infinity, cima = -Infinity;
    for (let i = 1; i < cab.pos.length; i += 3) { baixo = Math.min(baixo, cab.pos[i]); cima = Math.max(cima, cab.pos[i]); }
    naCabeca(m, c, (r) => {
      const cantos = [];
      for (let i = 0; i < cab.pos.length; i += 3) {
        const p = new THREE.Vector3(cab.pos[i], cab.pos[i + 1], cab.pos[i + 2]).sub(piv);
        p.set(p.x * escala * largura, p.y * escala * altura, p.z * escala * fundo).applyQuaternion(q).add(piv).add(anda);
        const f = (cab.pos[i + 1] - baixo) / Math.max(1e-6, cima - baixo);
        cantos.push({ p, cor: c.tom(tomBaixo + (tomCima - tomBaixo) * f), w: c.CABECA });
      }
      // (a ordem dos cantos é a do modelo: já virada para fora)
      for (let t = 0; t < cab.idx.length; t += 3) r.v.push(cantos[cab.idx[t]], cantos[cab.idx[t + 1]], cantos[cab.idx[t + 2]]);
    });
  },

  // A BOLA (26/10/2026, os dois coques): o coque REDONDO e facetado do low poly — um icosaedro dividido `detalhe` vezes
  // (0 = 20 faces, 1 = 80, 2 = 320), preso ao crânio em `em` ([volta, lado], ver `direcao`; com `espelho`, o mesmo do
  // outro lado), o MEIO dele a `sai` cm do couro pela normal dali (o pé afunda na touca), deitado `inclina` graus para
  // trás, achatado `achata` no eixo de fora, e cada canto mexido até `bagunca` do raio (as facetas desiguais; `semente`
  // sorteia outras). O tom: escuro no pé, claro em cima.
  bola(m, c, { em, raio = 5, sai = 4, achata = 0.92, inclina = 0, bagunca = 0.1, detalhe = 1, semente = 1, espelho = true }) {
    if (c.elmo || !Array.isArray(em)) return;
    const esfera = esferaUnitaria(Math.round(entre(detalhe, 0, 3)));
    naCabeca(m, c, (r) => {
      for (const lado of espelho && em[1] ? [1, -1] : [1]) {
        const h = c.noCranio(direcao(em[0], em[1] * lado));
        if (!h) continue;
        const eixo = h.n.clone().applyAxisAngle(X, (-inclina * Math.PI) / 180).normalize();
        const a = new THREE.Vector3().crossVectors(eixo, Math.abs(eixo.x) > 0.9 ? FRENTE : X).normalize(), b = new THREE.Vector3().crossVectors(eixo, a);
        const meio = h.q.clone().addScaledVector(eixo, sai);
        // um canto por LUGAR da esfera (as faces vizinhas dividem o mesmo: a bola não abre)
        const cantos = esfera.lugares.map((u, i) => {
          const q = raio * (1 + bagunca * (2 * sorteio(i, semente) - 1));
          return {
            p: meio.clone().addScaledVector(a, u.x * q).addScaledVector(b, u.y * q).addScaledVector(eixo, u.z * q * achata),
            cor: c.tom(0.74 + 0.24 * (u.z + 1) + 0.1 * (sorteio(i, semente + 7) - 0.5)), w: c.CABECA,
          };
        });
        for (const [i, j, k] of esfera.faces) r.tri(meio, cantos[i], cantos[j], cantos[k]);
      }
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

  // A TOUCA: o cabelo que COBRE a cabeça, penteado para trás — uma casca facetada sobre o
  // couro cabeludo, da testa (`de`) à nuca (`ate`: graus de volta, ver `direcao`) e até
  // `lado` graus para cada lado (o que sobra, em volta do meio da cabeça, é o lugar da
  // orelha). A BEIRADA fecha na pele; por dentro fica a `folga` cm dela, e uma fileira sim,
  // outra não, sobe `onda` a mais (os gomos do cabelo penteado). `recua`: quantos graus a
  // linha da testa recua nas têmporas.
  // `risca`: quantos cm a coluna do MEIO afunda (a risca do cabelo repartido; só com `colunas` ímpar).
  touca(m, c, { de, ate, lado, linhas = 9, colunas = 9, folga = 1.1, onda = 0.6, recua = 0, risca = 0 }) {
    if (c.elmo) return;
    const meio = (colunas - 1) / 2, comeco = (fj) => de + recua * (2 * fj - 1) ** 2;
    // a grade: onde cada raio acha o couro, e a que distância dele fica a casca ali
    const grade = [];
    for (let j = 0; j < colunas; j++) {
      const fj = j / (colunas - 1), borda = j === 0 || j === colunas - 1, gomo = (j - meio) % 2 === 0, coluna = [];
      for (let i = 0; i < linhas; i++) {
        const fi = i / (linhas - 1), h = c.noCranio(direcao(comeco(fj) + (ate - comeco(fj)) * fi, (fj * 2 - 1) * lado));
        const beira = borda || i === 0 || i === linhas - 1, f = folga * (0.7 + 0.3 * Math.sin(Math.PI * fi)) + (gomo ? onda : 0);
        coluna.push(h && { h, beira, gomo, f: beira ? BEIRA : j === meio && risca ? Math.max(BEIRA, f - onda - risca) : f });
      }
      grade.push(coluna);
    }
    // A CASCA COBRE O CRÂNIO: a cabeça do modelo é facetada (quase uma caixa), e a grade corta as
    // quinas dela — a pele aparecia por entre os triângulos do cabelo. Cada ponto do crânio que
    // ficaria para fora da casca (medido do meio da cabeça) levanta os quatro cantos da casa dele
    for (let vez = 0; vez < 2; vez++) for (const v of c.pontosDoCranio()) {
      const d = v.clone().sub(CENTRO), longe = d.length(), fj = (Math.asin(d.x / longe) / ((lado * Math.PI) / 180) + 1) / 2;
      if (fj < 0 || fj > 1) continue;
      let volta = (Math.atan2(d.y, d.z) * 180) / Math.PI;
      if (volta < -90) volta += 360;
      const fi = (volta - comeco(fj)) / (ate - comeco(fj));
      if (fi < 0 || fi > 1) continue;
      const pj = fj * (colunas - 1), pi = fi * (linhas - 1), j = Math.min(colunas - 2, Math.floor(pj)), i = Math.min(linhas - 2, Math.floor(pi)), a = pj - j, b = pi - i;
      const cantos = [[grade[j][i], (1 - a) * (1 - b)], [grade[j + 1][i], a * (1 - b)], [grade[j][i + 1], (1 - a) * b], [grade[j + 1][i + 1], a * b]];
      if (cantos.some(([k]) => !k)) continue;
      const falta = longe + COBRE - cantos.reduce((s, [k, w]) => s + (k.h.t + k.f) * w, 0);
      if (falta > 0) for (const [k] of cantos) k.f += falta;
    }
    const canto = (k) => k && { p: k.h.p(k.f), cor: c.tom(k.beira ? 0.7 : k.gomo ? 1.14 : 0.86), w: k.h.w, dentro: k.h.p(-3) };
    const pontos = grade.map((coluna) => coluna.map(canto));
    for (let j = 0; j < colunas - 1; j++) for (let i = 0; i < linhas - 1; i++) {
      const a = pontos[j][i], b = pontos[j + 1][i], d = pontos[j + 1][i + 1], e = pontos[j][i + 1];
      if (!a || !b || !d || !e) continue;
      m.tri(a.dentro, a, b, d); m.tri(a.dentro, a, d, e);
    }
  },

  // OS TUFOS: pontas de cabelo deitadas para trás, por cima da touca — `pontas`: [volta,
  // lado, altura] de cada uma (graus no crânio, cm). `deita`: quantos graus caem para trás
  // (0 = de pé); `largura` e `base`: a meia largura e o meio comprimento do pé.
  tufos(m, c, { pontas, deita = 55, largura = 1.6, base = 2.8 }) {
    if (c.elmo) return;
    const ca = Math.cos((deita * Math.PI) / 180), sa = Math.sin((deita * Math.PI) / 180);
    naCabeca(m, c, (r) => {
      pontas.forEach(([volta, lado, altura], i) => {
        const h = c.noCranio(direcao(volta, lado));
        if (!h) return;
        // para onde a volta anda (da testa para a nuca), rente ao couro, e o lado
        const a = (volta * Math.PI) / 180, tras = new THREE.Vector3(0, Math.cos(a), -Math.sin(a));
        tras.addScaledVector(h.n, -tras.dot(h.n)).normalize();
        const eixo = h.n.clone().multiplyScalar(ca).addScaledVector(tras, sa);
        const A = new THREE.Vector3().crossVectors(h.n, tras).multiplyScalar(largura), B = tras.clone().multiplyScalar(base);
        tubo(r, [
          { c: h.q.clone().addScaledVector(h.n, -AFUNDA), a: A, b: B, cor: c.tom(0.74), w: c.CABECA },
          { c: h.q.clone().addScaledVector(eixo, altura * 0.45), a: A.clone().multiplyScalar(0.72), b: B.clone().multiplyScalar(0.6), cor: c.tom(1), w: c.CABECA },
          { c: h.q.clone().addScaledVector(eixo, altura), a: ZERO, b: ZERO, cor: c.tom(i % 2 ? 1.3 : 1.2), w: c.CABECA },
        ], LOSANGO);
      });
    });
  },

  // AS MECHAS: lâminas de cabelo pontudas que saem do alto da cabeça e DEITAM sobre o crânio
  // até passar da linha do cabelo (o repicado: a franja na testa, as laterais, a nuca). Cada
  // uma da `lista`: [volta, lado] da raiz e da ponta (graus no crânio, ver `direcao`; com lado,
  // a do outro lado também), a meia `largura` (cm), quanto a ponta CAI além do crânio (cm, para
  // baixo) e ABRE para fora. O caminho é o do couro (raios do meio da cabeça) a `folga` dele —
  // por cima da touca, descendo até `rente` na ponta (a franja assenta na testa); a seção é um
  // losango achatado (`grossura`), largo no meio e afinando até a ponta.
  mechas(m, c, { lista, folga = 1.9, rente = 0.8, grossura = 0.42, passos = 4 }) {
    if (c.elmo) return;
    const todas = lista.flatMap((x) => (x[1] || x[3] ? [x, [x[0], -x[1], x[2], -x[3], ...x.slice(4)]] : [x]));
    for (const [v0, l0, v1, l1, largura = 2.2, cai = 0, abre = 0] of todas) {
      const d0 = direcao(v0, l0), d1 = direcao(v1, l1), pts = [];
      for (let i = 0; i <= passos; i++) {
        const f = i / passos, h = c.noCranio(d0.clone().lerp(d1, f).normalize());
        if (!h) break;
        // (a raiz dentro da touca; depois por cima dela, e assentando na ponta)
        const fo = i === 0 ? 0.4 : folga + (rente - folga) * entre((f - 0.35) / 0.65);
        pts.push({ p: h.p(fo), n: h.n });
      }
      if (pts.length < 2) continue;
      // a ponta: além do último ponto do couro, cai e abre (do tamanho da cabeça)
      const ult = pts[pts.length - 1], seg = ult.p.clone().sub(pts[pts.length - 2].p);
      const ponta = ult.p.clone().addScaledVector(seg.normalize(), 1.2 * c.k).add(new THREE.Vector3(0, -cai * c.k, 0)).addScaledVector(ult.n, abre * c.k);
      pts.push({ p: ponta, n: ult.n });
      const n = pts.length, est = pts.map((q, i) => {
        const t = (pts[Math.min(n - 1, i + 1)].p.clone().sub(pts[Math.max(0, i - 1)].p)).normalize();
        const u = new THREE.Vector3().crossVectors(q.n, t).normalize(), v = new THREE.Vector3().crossVectors(t, u);
        const f = i / (n - 1), larg = i === n - 1 ? 0 : largura * (f < 0.3 ? 0.75 + f / 1.2 : f < 0.75 ? 1 : 1 - 0.35 * ((f - 0.75) / 0.25)) * c.k;
        return { c: q.p, a: u.multiplyScalar(larg), b: v.multiplyScalar(i === n - 1 ? 0 : grossura * c.k * (1 - 0.4 * f)), cor: c.tom(0.78 + 0.45 * f), w: c.CABECA };
      });
      tubo(m, est, LOSANGO, [true, false]);
    }
  },

  // A FRANJA (26/10/2026, o liso com franja): uma LÂMINA de cabelo que desce do alto da cabeça (`raiz`, graus de volta no
  // crânio — ver `direcao`), por cima da touca, e acaba num CORTE RETO na testa: a altura em que o raio do meio da cabeça
  // acha o couro na volta `corte` (no meio; nas outras colunas, a mesma altura — o crânio arredonda para os lados, cada
  // uma busca a sua volta), uma coluna sim, outra não, um tico mais comprida (os fios). De `lado` a `lado` graus
  // (`colunas`), a `folga` cm do couro, assentando até `rente` no corte; a beirada do corte tem `grossura` (não é uma folha).
  franja(m, c, { raiz = 104, corte = 19, lado = 60, colunas = 13, passos = 7, folga = 1.9, rente = 0.75, grossura = 0.5, fios = 0.22 }) {
    if (c.elmo) return;
    const meio = c.noCranio(direcao(corte, 0));
    if (!meio) return;
    // a volta, na coluna de `lado` l, em que o couro chega à altura y (busca: a altura cresce com a volta, na testa)
    const voltaNaAltura = (l, y) => {
      let a = corte - 20, b = raiz;
      for (let k = 0; k < 20; k++) { const v = (a + b) / 2, h = c.noCranio(direcao(v, l)); if (h && h.q.y >= y) b = v; else a = v; }
      return b;
    };
    const grade = [];
    for (let j = 0; j < colunas; j++) {
      const l = ((2 * j) / (colunas - 1) - 1) * lado, vc = voltaNaAltura(l, meio.q.y - (j % 2 ? fios : 0)), col = [];
      for (let i = 0; i <= passos; i++) {
        const f = i / passos, h = c.noCranio(direcao(raiz + (vc - raiz) * f, l));
        if (!h) break;
        const fo = i === 0 ? 0.4 : folga + (rente - folga) * entre((f - 0.45) / 0.55);
        col.push({ p: h.p(fo), cor: c.tom(0.8 + 0.32 * f), w: h.w, dentro: h.p(-3), baixo: h.p(fo - grossura) });
      }
      grade.push(col.length === passos + 1 ? col : null);
    }
    for (let j = 0; j < colunas - 1; j++) {
      const A = grade[j], B = grade[j + 1];
      if (!A || !B) continue;
      for (let i = 0; i < passos; i++) { m.tri(A[i].dentro, A[i], B[i], B[i + 1]); m.tri(A[i].dentro, A[i], B[i + 1], A[i + 1]); }
      // a beirada do corte, virada para baixo: da lâmina até a camada de dentro dela
      const a = A[passos], b = B[passos], ai = { p: a.baixo, cor: c.tom(0.66), w: a.w }, bi = { p: b.baixo, cor: c.tom(0.66), w: b.w };
      const cima = a.p.clone().add(b.p).multiplyScalar(0.5).add(new THREE.Vector3(0, 0.6, 0));
      m.tri(cima, a, b, bi); m.tri(cima, a, bi, ai);
    }
  },

  // A ANTENA: o fio solto que sobe do cocuruto (`em`: [volta, lado] no crânio), faz a curva e cai
  // para a frente — `altura` e `frente` (cm), a meia `largura` no pé, afinando até a ponta.
  antena(m, c, { em, altura = 4.5, frente = 5.5, largura = 0.85 }) {
    if (c.elmo) return;
    const h = c.noCranio(direcao(em[0], em[1]));
    if (!h) return;
    naCabeca(m, c, (r) => {
      const pe = h.q.clone(), F = new THREE.Vector3(0, 0, 1), Y = new THREE.Vector3(0, 1, 0);
      const linha = [
        pe.clone().addScaledVector(h.n, -AFUNDA), pe.clone().addScaledVector(h.n, 1.2),
        pe.clone().addScaledVector(Y, altura * 0.7).addScaledVector(F, frente * 0.15),
        pe.clone().addScaledVector(Y, altura).addScaledVector(F, frente * 0.5),
        pe.clone().addScaledVector(Y, altura * 0.85).addScaledVector(F, frente * 0.85),
        pe.clone().addScaledVector(Y, altura * 0.45).addScaledVector(F, frente),
      ];
      const n = linha.length;
      tubo(r, linha.map((p, i) => {
        const t = linha[Math.min(n - 1, i + 1)].clone().sub(linha[Math.max(0, i - 1)]).normalize(), u = X.clone(), v = new THREE.Vector3().crossVectors(t, u).normalize();
        const q = i === n - 1 ? 0 : largura * (1 - 0.75 * (i / (n - 1)));
        return { c: p, a: u.multiplyScalar(q), b: v.multiplyScalar(q * 0.55), cor: c.tom(0.85 + 0.4 * (i / (n - 1))), w: c.CABECA };
      }), LOSANGO, [true, false]);
    });
  },

  // A CAÍDA: a mecha que cai pela FRENTE do ombro (a de um `lado`: 1 ou −1). Nasce atrás da
  // orelha (`raiz`: [volta, lado] no crânio), passa pelos pontos `solta` ([x, y, z] do lado
  // +x, presos à cabeça) e, do ombro (`de`) para baixo, POUSA no corpo pela frente — em `x`,
  // chegando `abre` cm mais para fora (ou para dentro) na ponta — até a altura `ate`. Onde o
  // corpo recua debaixo dela (abaixo do busto) ela não volta: cai a PRUMO (`prumo`: quanto
  // pode recuar a cada cm que desce). É uma CAUDA AMARRADA (`cauda`): `gomos`, `ferro`.
  caida(m, c, { lado = 1, raiz, solta, x, abre = 0, de = 151, ate, raio, gomos = 3, ferro = true, achata = 0.86, prumo = 0.12 }) {
    const R = raio * c.k, linha = [];
    if (!c.elmo) {
      const h = c.noCranio(direcao(raiz[0], raiz[1] * lado));
      if (h) for (const d of [-AFUNDA, raio * 0.5]) linha.push({ p: c.firme(h.q.clone().addScaledVector(h.n, d)), w: c.CABECA });
      for (const [sx, sy, sz] of solta) linha.push({ p: c.firme(new THREE.Vector3(sx * lado, sy, sz)), w: c.CABECA });
    }
    let z = -Infinity, antes = null;
    for (let y = de; y > ate - 1; y -= 3) {
      const s = c.pousar((x + (abre * (de - y)) / (de - ate)) * lado, y, true);
      if (!s) continue;
      let frente = s.p.z + (R * achata + FOLGA) / Math.max(0.55, s.n.z);
      if (antes !== null) frente = Math.max(frente, z - prumo * Math.max(0, antes - s.p.y));
      z = frente; antes = s.p.y;
      linha.push({ p: s.p.setZ(frente), w: s.w });
    }
    cauda(m, c, linha, { raio, gomos, ferro, achata });
  },

  // O SOLTO (20/10/2026, o comprido da referência do dono): a mecha ONDULADA que cai solta, sem
  // amarra. Nasce no crânio (`raiz`: [volta, lado]) dentro da touca, passa por cima dela (`folga`
  // cm do couro) até sair dele em `sai`, segue os pontos `solta` ([x, y, z] do lado +x, presos à
  // cabeça) e, de `de` para baixo, POUSA no corpo — nas costas, ou pela FRENTE do ombro (`frente`,
  // caindo a prumo debaixo do busto como a caída) — em `x` (+ `abre` na ponta), até `ate`. Ondula
  // para os lados (`onda` cm, uma volta a cada `passo` cm, `fase`) e um pouco para fora, afina, e a
  // ponta VIRA para fora (`vira` cm). Com elmo, só o que cai (sai de baixo dele).
  solto(m, c, { lado = 1, raiz, sai, solta = [], frente = false, x, abre = 0, de = NUCA, ate, raio, onda = 1.4, passo = 13, fase = 0, folga = 2.2, vira = 2, achata = 0.6, larg = 1.3, prumo = 0.12 }) {
    const R = raio * c.k, linha = [];
    if (!c.elmo) {
      const d0 = direcao(raiz[0], raiz[1] * lado), d1 = direcao(sai[0], sai[1] * lado);
      for (let i = 0; i <= 4; i++) {
        const h = c.noCranio(d0.clone().lerp(d1, i / 4).normalize());
        if (h) linha.push({ p: h.p(i ? folga : -AFUNDA), w: h.w });
      }
      for (const [sx, sy, sz] of solta) linha.push({ p: c.firme(new THREE.Vector3(sx * lado, sy, sz)), w: c.CABECA });
    }
    const fora = frente ? 1 : -1;
    let z = fora * -Infinity, antes = null, ult = null;
    for (let y = de; y > ate - 1; y -= 3) {
      const f = (de - y) / (de - ate), volta = (2 * Math.PI * (de - y)) / passo + fase;
      const s = c.pousar((x + abre * f + onda * Math.sin(volta)) * lado, y, frente);
      if (!s) continue;
      // (afastada da pele pela grossura, e um pouco mais na barriga de cada onda: o volume)
      let pz = s.p.z + (fora * (R * achata + FOLGA + onda * 0.35 * (1 + Math.cos(volta)) * c.k)) / Math.max(0.55, fora * s.n.z);
      if (frente && antes !== null) pz = Math.max(pz, z - prumo * Math.max(0, antes - s.p.y));
      z = pz; antes = s.p.y;
      linha.push(ult = { p: s.p.setZ(pz), w: s.w });
    }
    // a ponta vira para fora (e sobe um pouco): o cacho
    if (ult) linha.push({ p: ult.p.clone().add(new THREE.Vector3(0.4 * vira * lado * c.k, 0.9 * vira * c.k, fora * vira * c.k)), w: ult.w });
    fio(m, c, linha, { raio, achata, larg });
  },

  // O FIAPO: um fio fino solto à frente da orelha, da têmpora ao maxilar — `pontos`: [x, y,
  // z] (do lado +x), cada um preso à pele do rosto (o ÍMÃ) à distância a que foi desenhado.
  fiapo(m, c, { lado = 1, pontos, raio = 0.62 }) {
    if (c.elmo) return;
    const linha = [];
    for (const [x, y, z] of pontos) { const ima = c.ima(new THREE.Vector3(x * lado, y, z)); if (ima) linha.push({ p: c.aDistancia(ima, ima.d), w: ima.w }); }
    fio(m, c, linha, { raio, achata: 0.8, larg: 1 });
  },

  // O RECORTE: as `partes` da barba do MODELO (o bigode, o queixo, o maxilar, a costeleta),
  // cada ponto preso à pele do rosto (o ÍMÃ: `c.naPele`). `folga`: quanto a camada de fora
  // sai a mais (a barba mais cheia) — com ELMO fica rente, como a do modelo, que cabe dentro
  // dele (cheia, saía pelas frestas); `tom`: o da barba do modelo é um pouco mais escuro que
  // o do cabelo.
  recorte(m, c, { partes, folga = 0, tom = 0.86 }) {
    if (c.elmo) folga = 0;
    const tris = c.barba(), cor = c.tom(tom), beirada = new Set();
    // a BEIRADA do recorte: os lugares que também são de um triângulo que ficou de fora
    for (const t of tris) if (!partes.includes(t.parte)) for (const k of t.cantos) beirada.add(k.ima);
    for (const t of tris) {
      if (!partes.includes(t.parte)) continue;
      for (const k of t.cantos) m.v.push({ p: c.naPele(k.ima, beirada.has(k.ima) ? null : folga), cor, w: k.ima.w });
    }
  },

  // A SOBRANCELHA: a do modelo, mexida (ver `SOBRANCELHAS`) e presa à pele do rosto (o ÍMÃ).
  // Como o modelo é (sem mexer), cada ponto fica do lugar da pele mais perto DELE; mexida,
  // do lugar mais perto de onde o ponto foi parar — à mesma distância da pele que tinha.
  sobrancelha(m, c, { alta = 1, longa = 1, inclina = 0, folga = 0, ponte = false, tom = 1 }) {
    const o = SOBRANCELHA, cor = c.tom(tom), mexida = alta !== 1 || longa !== 1 || inclina !== 0, sobe = Math.tan((inclina * Math.PI) / 180);
    const lugares = new Map();   // um por lugar do modelo (os cantos repetidos dividem o mesmo)
    const noRosto = (k) => {
      if (lugares.has(k.ima)) return lugares.get(k.ima);
      let ima = k.ima, d = ima.d;
      if (mexida) {
        const x0 = Math.abs(k.p.x), x = longa < 1 ? o.meio + (x0 - o.meio) * longa : o.fora - (o.fora - x0) * longa;
        const g = grudar(c.pele(), new THREE.Vector3(Math.sign(k.p.x) * x, o.baixo + (k.p.y - o.baixo) * alta + (x - o.meio) * sobe, k.p.z));
        // a camada de FORA (a normal do canto aponta para longe da pele) fica acima dela; a de dentro, na pele
        const fora = k.n.dot(normalLisa(ima.g)) > 0;
        if (g) ima = { g, d, dir: normalLisa(g), w: pesos(g) };
        d = fora ? Math.max(d, o.acima) + folga : Math.min(d, 0.03);
      }
      const l = { p: c.aDistancia(ima, d), w: ima.w };
      lugares.set(k.ima, l);
      return l;
    };
    const tris = c.sobrancelhas();
    for (const t of tris) for (const k of t) { const l = noRosto(k); m.v.push({ p: l.p, cor, w: l.w }); }
    if (!ponte || !tris.length) return;
    // A PONTE: uma faixa entre as pontas de dentro das duas, por cima do nariz — uma grade de
    // pontos presos à pele, as fileiras do meio acima dela e as de cima e de baixo NELA (a
    // faixa fecha na pele, não fica uma lâmina no ar)
    const xs = [-o.dentro - 0.5, -o.dentro / 2, 0, o.dentro / 2, o.dentro + 0.5];
    const ys = [[o.baixo - 0.3, 0], [o.baixo - 0.1, 1], [o.baixo + 0.7 * alta, 1], [o.baixo + 0.9 * alta, 0]];
    const grade = xs.map((x) => ys.map(([y, fora]) => {
      const g = grudar(c.pele(), new THREE.Vector3(x, y, 16)), ima = { g, d: 0, dir: normalLisa(g), w: pesos(g) };
      return { p: c.aDistancia(ima, fora ? o.acima + folga : 0.02), cor, w: ima.w, dentro: c.aDistancia(ima, -1) };
    }));
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < ys.length - 1; j++) {
      const a = grade[i][j], b = grade[i + 1][j], d = grade[i + 1][j + 1], e = grade[i][j + 1];
      m.tri(a.dentro, a, b, d); m.tri(a.dentro, a, d, e);
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
 * O TRILHO de um fio: a linha de pontos medida. `em(s)`: o ponto (e os pesos dele) a `s` cm
 * do começo; `est`: uma estação do tubo ali — a seção deitada de lado (larga em x, achatada
 * contra o corpo); `quadro`: os eixos dela (`t` ao longo do fio, `u` de lado, `v`).
 */
function trilho(c, linha, raio, achata, larg) {
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
  const quadro = (s) => {
    const { p, w, f } = em(s), t = em(s + 1).p.sub(em(s - 1).p).normalize(), u = X.clone().addScaledVector(t, -t.x).normalize();
    return { p, w, f, t, u, v: new THREE.Vector3().crossVectors(u, t) };
  };
  return { R, total, em, est, quadro };
}

/**
 * A CAUDA AMARRADA (as tranças de guerra): o rabo grosso preso em `gomos` por voltas de
 * couro, com a argola de FERRO de pontas (`ferro`; sem ele, mais uma volta de couro) e o
 * tufo desfiado no fim (`ponta`: o comprimento dele, cm).
 */
function cauda(m, c, linha, { raio, gomos = 3, ferro = true, achata = 0.86, larg = 1.05, ponta = 8.5 }) {
  if (linha.length < 2) return;
  const { R, total, est, quadro } = trilho(c, linha, raio, achata, larg);
  const k = c.k, argola = 2.4 * k, amarra = 1.2 * k, corpo = Math.max(total * 0.5, total - ponta * k - argola), L = corpo / gomos;
  const couro = new THREE.Color(FAIXA), metal = new THREE.Color(ferro ? FERRO : FAIXA), lista = [est(0, 0.6, c.tom(0.7))];
  for (let i = 0; i < gomos; i++) {
    const a = i * L, b = a + L, f = 1 - 0.1 * (i / Math.max(1, gomos - 1)), fim = i === gomos - 1;
    // o gomo: cheio no meio, fino onde a amarra aperta
    lista.push(est(a + (L - amarra) * 0.5, f, c.tom(1.1)), est(b - (fim ? 0 : amarra), 0.7 * f, c.tom(0.84)));
    if (fim) break;
    // a amarra: uma volta de couro (estações repetidas: a cor não escorre para o cabelo)
    lista.push(est(b - amarra, 0.79 * f, couro), est(b, 0.79 * f, couro), est(b, 0.7 * f, c.tom(0.8)));
  }
  // a argola e o tufo da ponta (abre e afina)
  const q = 0.88, resto = total - corpo - argola;
  lista.push(est(corpo, q, metal), est(corpo + argola, q, metal));
  lista.push(est(corpo + argola, 0.62, c.tom(0.82)), est(corpo + argola + resto * 0.42, 0.9, c.tom(1.06)), est(total, 0, c.tom(1.28)));
  tubo(m, lista, HEXAGONO, [true, false]);
  if (!ferro) return;
  // as PONTAS da argola: três pirâmides viradas para fora (para a frente e para os dois lados)
  const { p, u, v, t, w, f } = quadro(corpo + argola * 0.5), claro = new THREE.Color(FERRO_CLARO);
  for (const graus of [-62, 0, 62]) {
    const g = (graus * Math.PI) / 180, fora = u.clone().multiplyScalar(Math.sin(g)).addScaledVector(v, -Math.cos(g));
    const pe = p.clone().addScaledVector(u, Math.sin(g) * q * R * larg * f).addScaledVector(v, -Math.cos(g) * q * R * achata);
    tubo(m, [
      { c: pe.clone().addScaledVector(fora, -0.3 * k), a: t.clone().multiplyScalar(0.62 * k), b: new THREE.Vector3().crossVectors(fora, t).multiplyScalar(0.62 * k), cor: metal, w },
      { c: pe.clone().addScaledVector(fora, 1.7 * k), a: ZERO, b: ZERO, cor: claro, w },
    ], LOSANGO);
  }
}

/**
 * O FIO: o tubo ao longo de uma linha de pontos já nas proporções da raça ({ p, w: os
 * pesos, f: quanto alarga ali }) — o rabo (engrossa ao sair, ondula e afina), a TRANÇA
 * (`elo`: o comprimento de cada gomo), com a `argola` de osso antes da ponta, ou a CUNHA
 * (larga no começo, afinando até a ponta).
 */
function fio(m, c, linha, { raio, elo = 0, argola = false, achata = 0.72, larg = 1.15, cunha = false }) {
  if (linha.length < 2) return;
  const { total, est } = trilho(c, linha, raio, achata, larg);
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

const FRENTE = new THREE.Vector3(0, 0, 1), TRAS = new THREE.Vector3(0, 0, -1);

/**
 * A geometria do penteado, da barba e das sobrancelhas de um corpo, pronta para a malha
 * fundida (já com as proporções da raça e os ossos na ordem única) — ou null: não há o que
 * desenhar (ids desconhecidos, tudo debaixo do elmo).
 *  - `id`, `barba`, `sobrancelha`: os ids (de `PENTEADOS`, `BARBAS` e `SOBRANCELHAS`), ou null;
 *  - `cor`: '#rrggbb' ou null (a do modelo, `COR_PADRAO`); `elmo`: há elmo;
 *  - `apoio`: as peças em que a mecha e o pendente podem pousar (o tronco, o pescoço, a
 *    armadura do peito); `pecaDaBarba`: a peça `Beard` do modelo (a matéria do recorte);
 *    `pecaDaSobrancelha`: a `Eye_Brows`; `pecaDoRosto`: a `Face` — a pele a que a barba e
 *    as sobrancelhas são presas; `pecaDaCabeca`: a `head` — com a `Face`, o crânio em que
 *    a touca e os tufos assentam;
 *  - `ordem`, `deformador`, `escala`: os ossos do esqueleto único, a conta da raça para um
 *    ponto (raca.js `deformadorDe`) e o tamanho da cabeça dela; `rosto`: o que a raça faz ao
 *    rosto antes dos ossos — a arcada, o queixo (`rostoDaRaca`, ou null); `largo`: o quanto
 *    o queixo alarga num lugar (`largoDoQueixo`, ou null: a largura do pé do pendente);
 *  - `modelo`: uma geometria já pronta da malha fundida (os atributos saem do mesmo tipo:
 *    o `mergeGeometries` recusa tipos diferentes); `mapa`: a textura do corpo.
 */
export function geometriaDoPenteado({ id, barba, sobrancelha, cor, elmo, apoio, pecaDaBarba, pecaDaSobrancelha, pecaDoRosto, pecaDaCabeca, ordem, deformador, escala, rosto, largo, modelo, mapa }) {
  const formas = [...(PENTEADOS[id]?.formas ?? []), ...(BARBAS[barba]?.formas ?? []), ...(SOBRANCELHAS[sobrancelha]?.formas ?? [])];
  if (!formas.length) return null;
  const base = new THREE.Color(cor ?? COR_PADRAO), cabeca = Math.max(0, ordem.indexOf('Head'));
  let tris = null, daBarba = null, daSobrancelha = null, pele = null, cranio = null, quinas = null;
  // um canto da malha como a raça o deixa (as proporções), e o do ROSTO (antes, a arcada e o queixo)
  const movido = (k) => deformador(k.p.clone(), k.o, k.w);
  const doRosto = (k) => deformador(rosto ? rosto(k.p.clone()) : k.p.clone(), k.o, k.w);
  // o ÍMÃ de um ponto do modelo: o lugar da pele do rosto mais perto (`g`), a que distância
  // (`d`) e para que lado (`dir`) o modelo o pôs, e os ossos dali (`w`). Um por LUGAR: os
  // cantos repetidos dividem o mesmo
  const imas = new Map();
  const imaDe = (p) => {
    const chave = `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
    if (!imas.has(chave)) {
      const g = grudar(c.pele(), p);
      imas.set(chave, g ? { g, d: g.d, dir: g.d > 1e-3 ? p.clone().sub(g.q).multiplyScalar(1 / g.d) : normalLisa(g), w: pesos(g) } : null);
    }
    return imas.get(chave);
  };
  // os triângulos de uma peça do rosto (a barba, as sobrancelhas), cada canto com o ímã dele
  const presos = (peca) => (peca ? triangulosDe([peca], ordem) : []).filter((t) => t.every((k) => (k.ima = imaDe(k.p))));
  // O POUSO: onde um raio pelo eixo z (de trás, ou da frente), na posição (x, y) do modelo,
  // encontra o corpo — JÁ com as proporções da raça: { p: o ponto, n: a normal (para fora), w: os pesos dali }
  const pouso = (x, y, frente) => {
    const g = raio(tris ??= triangulosDe(apoio, ordem), x, y, frente);
    return g ? { ...lugar(g, movido, frente ? FRENTE : TRAS), w: pesos(g) } : null;
  };
  const c = {
    elmo, k: escala, largo: largo ?? (() => 1), CABECA: { o: [cabeca, 0, 0, 0], p: [1, 0, 0, 0] },
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
    // o ímã de um ponto do modelo (ver `imaDe`)
    ima: (p) => imaDe(p),
    // O CRÂNIO (as peças `head` e `Face`): onde um raio saído do meio da cabeça encontra o
    // couro — { q, n: o ponto e a normal lisa, no modelo; w: os ossos dali; p(folga): o
    // ponto como a raça o deixa, `folga` cm para fora (do tamanho da cabeça) }
    noCranio(dir) {
      const g = raioDe(cranio ??= triangulosDe([pecaDaCabeca, pecaDoRosto].filter(Boolean), ordem), CENTRO, dir);
      if (!g) return null;
      const n = normalLisa(g);
      return { q: CENTRO.clone().addScaledVector(dir, g.t), t: g.t, n, w: pesos(g), p: (folga) => lugar(g, doRosto).p.addScaledVector(n, folga * escala) };
    },
    // os pontos do crânio (um por lugar), no modelo
    pontosDoCranio() {
      if (!quinas) {
        const vistos = new Map();
        for (const tri of (cranio ??= triangulosDe([pecaDaCabeca, pecaDoRosto].filter(Boolean), ordem))) for (const k of tri) vistos.set(`${k.p.x.toFixed(2)},${k.p.y.toFixed(2)},${k.p.z.toFixed(2)}`, k.p);
        quinas = [...vistos.values()];
      }
      return quinas;
    },
    // a pele do ROSTO (a peça `Face`: é presa à cabeça — pelo pescoço, a barba esticaria ao virar o rosto)
    pele: () => pele ??= pecaDoRosto ? triangulosDe([pecaDoRosto], ordem) : [],
    // a barba do modelo em triângulos presos à pele, e a parte de cada um
    barba: () => daBarba ??= presos(pecaDaBarba).map((t) => ({ cantos: t, parte: parteDaBarba(Math.abs(t[0].p.x + t[1].p.x + t[2].p.x) / 3, (t[0].p.y + t[1].p.y + t[2].p.y) / 3, (t[0].p.z + t[1].p.z + t[2].p.z) / 3) })),
    // as sobrancelhas do modelo, idem
    sobrancelhas: () => daSobrancelha ??= presos(pecaDaSobrancelha),
    // onde um ponto preso à pele foi parar: o lugar dela como a raça o deixou, mais a distância
    // do modelo (do tamanho da cabeça) — na beirada do recorte (`folga` null), quase nada: a
    // barba fecha na pele; a folga só levanta a camada de FORA (a de dentro já está na pele)
    naPele(ima, folga) { return c.aDistancia(ima, folga === null ? Math.min(ima.d, 0.06) : ima.d + folga * entre((ima.d - 0.2) / 0.3)); },
    // … e a `d` cm dela (do tamanho da cabeça), para o lado em que o ímã o pôs
    aDistancia: (ima, d) => lugar(ima.g, doRosto).p.addScaledVector(ima.dir, d * escala),
  };
  const m = new Malha(), fim = [];
  formas.forEach(([forma, medidas], i) => {
    // (a forma que falha — uma medida torta do arquivo — sai inteira; o resto do corpo é desenhado)
    const antes = m.v.length;
    try { FORMAS[forma]?.(m, c, medidas); } catch (e) { m.v.length = antes; console.warn(`[penteados] a forma ${i + 1} (${forma}) de "${id ?? barba ?? sobrancelha}" falhou:`, e); }
    fim[i] = m.v.length;
  });
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
  // o que é o cabelo, a barba e as sobrancelhas (os vértices de cada um, [de, até]: a modelagem os edita à parte)
  const ate = (k) => (k > 0 ? fim[k - 1] : 0), nc = PENTEADOS[id]?.formas?.length ?? 0, nb = nc + (BARBAS[barba]?.formas?.length ?? 0);
  g.userData.partes = { cabelo: [0, ate(nc)], barba: [ate(nc), ate(nb)], sobrancelhas: [ate(nb), n] };
  // … e cada FORMA do cabelo, [de, até] (a aba Cabelo do editor acende a escolhida e acha a que foi clicada)
  g.userData.formas = Array.from({ length: nc }, (_, i) => [ate(i), fim[i]]);
  return g;
}
