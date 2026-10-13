/**
 * AS RAÇAS (12/10/2026) — o MESMO corpo do guerreiro com outra cor e outras PROPORÇÕES:
 * o Orc é o guerreiro verde, careca, com a barriga, o tronco, os braços e as pernas
 * maiores. São DADO (`assets/racas.json`, `Assets.racas`), e quem as edita é a tela
 * "Raças" do editor de cenas (que monta o boneco com ESTE código).
 *
 * A raça é o 6º dígito da APARÊNCIA (aparencia.js): 0 (ou nenhum) = humano, n = a
 * n-ésima raça do arquivo — por isso a ORDEM do arquivo não muda (raça nova, no fim).
 *
 * MASCULINO E FEMININO (o terreno, 12/10/2026): o 8º dígito da aparência é o SEXO (0 =
 * masculino, 1 = feminino). O corpo FEMININO de uma raça é DADO: `feminino: { proporcoes,
 * … }` dentro dela — e o do humano, em `humano.feminino`, ao lado de `racas` no arquivo
 * (`Assets.humano`). É outro boneco inteiro: as proporções DELE, e o que mais mudar (a pele,
 * `semBarba`, as listas); o que ele não diz vale o da raça. `racaDe(n, sexo)` devolve a raça
 * já com esse corpo, e TUDO o que monta o boneco passa por ela — quem escreve código novo
 * pede a raça por aí, com o sexo, e não precisa saber dele. Sem `feminino` no arquivo, a
 * escolha não aparece para o jogador (`temFeminino`).
 *
 * Uma raça: { id, nome, jogavel, pele, olhos, semCabelo, semBarba, penteados, barbas, sobrancelhas, proporcoes }.
 *  - `pele` / `olhos` ('#rrggbb' ou null): a cor é a da raça, e não a que o jogador escolheu;
 *  - `semCabelo` / `semBarba`: a peça sai;
 *  - `penteados` / `barbas` / `sobrancelhas`: os cabelos, as barbas e as sobrancelhas que a
 *    raça tem (penteado.js; sem a lista, os do humano);
 *  - `jogavel`: aparece no editor de personagem do jogo (falso = só no editor de cenas);
 *  - `proporcoes`: os números de `PROPORCOES` (1 = como o modelo é; o que falta vale 1).
 *
 * COMO SE MUDA A PROPORÇÃO, em dois lugares:
 *  1. NA MALHA (`deformar`, chamado ao fundir o corpo — guerreiro.js `geometriaFundida`):
 *     cada vértice é engrossado em volta do osso a que está preso (a mistura dos pesos
 *     dele emenda uma parte na outra). Membros engrossam em volta do próprio eixo; o
 *     tronco, em volta da linha da coluna (a barriga cresce para a frente); a cabeça e
 *     os pés crescem a partir da junta. Em toda parte a LARGURA (o que se vê de frente)
 *     e a GROSSURA ou fundo (o que se vê de lado) são réguas separadas — com uma só, o
 *     braço do orc ficava forte de frente e fino de lado. Os BRAÇOS engrossam em volta do
 *     MEIO da carne, e não do osso, que passa pela beirada (`MEIO`); a VIRILHA não é de
 *     um osso só e vale por lugar (`VIRILHA`). É feito uma vez por corpo, e a armadura
 *     (do pacote ou pintada) cresce junto: é a mesma malha.
 *  2. NOS OSSOS (`CorpoGuerreiro.aplicarRaca`): a ALTURA (a cena inteira), os OMBROS (os
 *     braços nascem mais para fora), o QUADRIL (as coxas se afastam com a largura dele)
 *     e as MÃOS — a escala do osso da mão, que os dedos herdam. (Na malha, a mão crescia
 *     e as juntas dos dedos ficavam onde estavam: ao fechar a mão os dedos esticavam
 *     como espaguete.)
 * As animações não mudam: o retarget só copia giros.
 *
 * AS PRESAS (`pecasDaRaca`): um par de dentes que sobe do maxilar de baixo, desenhado
 * em código e preso ao osso da cabeça — mais uma peça da malha fundida. `presas` é o
 * tamanho (0 = sem); `presasAfastadas`, o quanto ficam longe uma da outra (do meio da boca
 * ao canto do maxilar); `presasAltura`, de que altura do rosto nascem. O PÉ de cada uma é
 * preso à PELE do rosto pelo ÍMÃ (ima.js): onde quer que as réguas a ponham, nasce da malha.
 *
 * O BUSTO (`pecasDoBusto`, `BUSTO`, `TOP`): o peito do modelo é o de um homem, e são poucos
 * triângulos — não há o que esticar. `busto` (0 = sem, o padrão) ACRESCENTA os dois seios,
 * cúpulas de pele presas aos ossos do peito, e o TOP de couro que os veste: os bojos, a faixa
 * por baixo e as alças. Os seios são COSTURADOS no peito (`costuraDoBusto`, `torsoCosturado`):
 * a pele do peito debaixo de cada um sai e o buraco é fechado do pé da cúpula até a beira
 * dele — uma superfície só, que estica em vez de abrir fresta quando a malha é mexida (a
 * modelagem). Só no peito NU: com armadura no peito, não entram (ela os cobre).
 *
 * AS ORELHAS (`moldarPeca`, `ORELHA`): NÃO se acrescenta orelha — o modelo já tem uma (uma
 * abinha na peça `Face`; um par a mais por cima dava quatro). `orelhas` ESTICA a que há: o
 * canto de cima e de fora dela é puxado para cima, para trás e para fora, até virar ponta.
 * É feito na peça, antes de fundir (na malha fundida não dá para saber o que é orelha e o
 * que é cabelo ao lado dela), e só SEM elmo.
 *
 * A ARCADA (`ARCADA`): a saliência da testa sobre os olhos — `arcada` traz para a frente
 * a faixa das sobrancelhas (os olhos ficam no fundo, à sombra dela) e `arcadaLargura` a
 * alarga para os lados (os cantos dela passam das têmporas).
 *
 * O QUEIXO (`largoDoQueixo`, `QUEIXO`): o maxilar de baixo do modelo é um V fino; `queixo`
 * o ALARGA — o x de cada ponto do rosto de baixo, a partir do meio. Vale por LUGAR, e não
 * por peça: a pele do rosto, o alto do pescoço e o elmo passam pela mesma conta.
 */
import * as THREE from 'three';
import { Assets } from './assets.js';
import { texelClaro } from './casca.js';
import { triangulosDe, raio, raioDe, grudar, lugar, normalLisa, pesos } from './ima.js';

// [chave, rótulo, mínimo, máximo, padrão (1 se não diz), segue] — a tela Raças do editor
// monta os controles por aqui. A LARGURA é o que se vê de FRENTE; a GROSSURA (o fundo), o
// que se vê de LADO. `segue`: de que chave vem o valor quando o arquivo não tem esta — as
// grossuras nasceram depois, e até então a régua da largura valia para as duas direções.
export const PROPORCOES = [
  ['altura', 'Altura', 0.8, 1.3],
  ['cabeca', 'Cabeça', 0.8, 1.4],
  ['arcada', 'Arcada — para a frente', 0.8, 2.5],
  ['arcadaLargura', 'Arcada — largura', 0.8, 1.8],
  ['queixo', 'Queixo — largura', 0.8, 2.2],
  ['pescoco', 'Pescoço — largura', 0.7, 1.8],
  ['pescocoGrossura', 'Pescoço — grossura', 0.7, 1.8, 1, 'pescoco'],
  ['ombros', 'Ombros — largura', 0.8, 1.5],
  ['ombrosGrossura', 'Ombros — grossura', 0.8, 1.8],
  ['peitoLargura', 'Peito — largura', 0.8, 1.6],
  ['peitoFundo', 'Peito — fundo', 0.8, 1.8],
  ['busto', 'Busto (0 = sem)', 0, 2, 0],
  ['barrigaLargura', 'Barriga — largura', 0.8, 1.8],
  ['barrigaFrente', 'Barriga — para a frente', 0.8, 3],
  ['quadril', 'Quadril — largura', 0.8, 1.6],
  ['quadrilFundo', 'Quadril — fundo', 0.8, 1.8, 1, 'quadril'],
  ['virilha', 'Virilha — para a frente', 0.5, 2.5],
  ['bracos', 'Braços — largura', 0.7, 1.8],
  ['bracosGrossura', 'Braços — grossura', 0.7, 2.2, 1, 'bracos'],
  ['antebracos', 'Antebraços — largura', 0.7, 1.8],
  ['antebracosGrossura', 'Antebraços — grossura', 0.7, 2.2, 1, 'antebracos'],
  ['maos', 'Mãos', 0.8, 1.6],
  ['coxas', 'Coxas — largura', 0.7, 1.8],
  ['coxasGrossura', 'Coxas — grossura', 0.7, 1.8, 1, 'coxas'],
  ['canelas', 'Canelas — largura', 0.7, 1.8],
  ['canelasGrossura', 'Canelas — grossura', 0.7, 1.8, 1, 'canelas'],
  ['pes', 'Pés', 0.8, 1.6],
  ['presas', 'Presas (0 = sem)', 0, 2.5, 0],
  ['presasAfastadas', 'Presas — afastadas', 0.4, 1.9],
  ['presasAltura', 'Presas — altura', 0.5, 2],
  ['orelhas', 'Orelhas (esticadas)', 1, 3],
];

export const SEXOS = ['Masculino', 'Feminino'];
// o corpo FEMININO da raça de número `n` (0 = o humano), ou undefined: não há
const feminino = (n) => (n > 0 ? Assets.racas?.[n - 1]?.feminino : Assets.humano?.feminino);
/** A raça de número `n` tem o corpo feminino? (só então o jogador escolhe o sexo) */
export const temFeminino = (n) => !!feminino(n);
/**
 * A raça de número `n` (o dígito da aparência) no corpo do `sexo` (0 = masculino, 1 =
 * feminino): de onde saem as proporções, as cores e as listas do boneco — ou null: o humano
 * como o modelo é (ou raça que não existe mais). No feminino, a raça com o que o corpo
 * `feminino` dela diz por cima (sem ele, a própria raça).
 */
export function racaDe(n, sexo = 0) {
  const raca = n > 0 ? Assets.racas?.[n - 1] ?? null : null, f = sexo === 1 ? feminino(n) : null;
  return f ? { ...raca, ...f, feminino: undefined } : raca;
}
/** As proporções completas de uma raça (o que falta, ou está torto, vale o padrão: o humano). */
export function proporcoesDe(raca) {
  const p = {}, tem = raca?.proporcoes;
  for (const [k, , min, max, padrao = 1, segue] of PROPORCOES) {
    const v = Number.isFinite(tem?.[k]) || !segue ? tem?.[k] : tem?.[segue];
    p[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao;
  }
  return p;
}
/** Uma raça nova, igual ao humano (o ponto de partida do editor). */
export const racaNova = (id, nome) => ({
  id, nome, jogavel: false, pele: null, olhos: null, semCabelo: false, semBarba: false,
  proporcoes: proporcoesDe(null),
});

// ------------------------------------------------------------ as presas
// A forma de uma presa (a do lado +x), em cm A PARTIR DO PÉ dela: sobe curvando para fora
// e para a frente. [x, y, z, raio] — o tamanho estica o caminho e engrossa junto.
const PRESA = [[0, 0, 0, 1.4], [0.5, 2.6, 3.1, 1.25], [1.1, 5.2, 4.1, 0.9], [1.5, 8.2, 4.3, 0]];
// ONDE o pé nasce, no rosto como o MODELO é (cm, pose T): `x`, `y` — o lugar de sempre, no
// canto da boca, dentro do queixo; as réguas mexem nele (`presasAfastadas` multiplica o x,
// até `ate`: além do lado do maxilar a presa sumiria dentro da bochecha; `presasAltura`
// soma `passo` cm a cada 100%). O ÍMÃ acha a PELE nesse (x, y) — um raio pela frente; onde
// não há rosto (abaixo do queixo), o ponto mais perto dela — e o pé nasce ali, `funda` cm
// para dentro, na malha já com o queixo da raça: a base nunca fica no ar, e o queixo largo
// leva a presa junto. Ela VIRA com o rosto (`giro`: a fração do quanto a pele virou do
// lugar de sempre até ali — inteiro, no canto do maxilar a ponta apontava para o lado).
const PE_DA_PRESA = { x: 3.0, y: 157.8, ate: 5.8, giro: 0.5, passo: 4, funda: 0.5 };
const LADOS_DA_PRESA = 5, MARFIM = ['#b9ad8c', '#e6dcc0', '#f4eedc', '#fbf8ee'];
const presas = new Map();
function geometriaDasPresas(raca, rosto, cabeca, elmo) {
  const p = proporcoesDe(raca), tamanho = p.presas, o = PE_DA_PRESA, moldar = rostoDaRaca(raca);
  // ---- o pé: na pele do rosto (o ÍMÃ), no lugar que as réguas pedem
  // (com ELMO as presas não se afastam além do lugar de sempre: no canto do maxilar, furavam as placas do rosto)
  const x1 = Math.min(o.ate, o.x * (elmo ? Math.min(1, p.presasAfastadas) : p.presasAfastadas)), y1 = o.y + (p.presasAltura - 1) * o.passo;
  const pele = rosto ? triangulosDe([rosto]) : [];
  const no = (x, y) => raio(pele, x, y, true) ?? grudar(pele, new THREE.Vector3(x, y, 13));
  const alargado = (k) => (moldar ? moldar(k.p.clone()) : k.p.clone());
  const virada = (g) => { const n = normalLisa(g); return Math.atan2(n.x, n.z); };
  const aqui = no(x1, y1), sempre = no(o.x, o.y), pe = new THREE.Vector3(x1, y1, 12.4);
  let giro = 0;
  if (aqui && sempre) {
    const la = lugar(aqui, alargado, normalLisa(aqui));
    pe.copy(la.p).addScaledVector(la.n, -o.funda);
    giro = (virada(aqui) - virada(sempre)) * o.giro;
  }
  const c = Math.cos(giro), s = Math.sin(giro);
  // ---- a presa do lado +x: os anéis em volta do caminho, de pé no eixo dele
  const eixo = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3();
  const aneis = PRESA.map(([x, y, z, r], i) => {
    const a = new THREE.Vector3(x, y, z).multiplyScalar(tamanho);
    const [xa, ya, za] = PRESA[Math.max(0, i - 1)], [xb, yb, zb] = PRESA[Math.min(PRESA.length - 1, i + 1)];
    eixo.set(xb - xa, yb - ya, zb - za).normalize();
    u.set(1, 0, 0).addScaledVector(eixo, -eixo.x).normalize(); w.crossVectors(eixo, u);
    const grossura = r * (0.75 + 0.25 * tamanho);
    return { centro: a, pontos: Array.from({ length: LADOS_DA_PRESA }, (_, j) => {
      const t = (j / LADOS_DA_PRESA) * Math.PI * 2;
      return a.clone().addScaledVector(u, Math.cos(t) * grossura).addScaledVector(w, Math.sin(t) * grossura);
    }) };
  });
  // (do pé para o rosto: girada em volta do eixo de pé e posta no lugar)
  const noRosto = (v) => new THREE.Vector3(pe.x + v.x * c + v.z * s, pe.y + v.y, pe.z - v.x * s + v.z * c);
  const tris = [], cores = [], cor = new THREE.Color(), n1 = new THREE.Vector3(), n2 = new THREE.Vector3();
  const face = (a, b, d, ca, cb, cd, dentro) => {
    // virada para FORA do eixo da presa (a ordem dos cantos é que diz o lado da face)
    n1.subVectors(b, a).cross(n2.subVectors(d, a));
    if (n1.lengthSq() < 1e-10) return;   // (a ponta é um ponto só)
    n2.copy(a).add(b).add(d).multiplyScalar(1 / 3).sub(dentro);
    const cantos = n1.dot(n2) < 0 ? [[a, ca], [d, cd], [b, cb]] : [[a, ca], [b, cb], [d, cd]];
    // … e a do outro lado é o ESPELHO exato desta (os cantos na ordem contrária)
    for (const lado of [1, -1]) for (const [v, i] of lado > 0 ? cantos : [...cantos].reverse()) {
      const q = noRosto(v);
      tris.push(lado * q.x, q.y, q.z); cor.set(MARFIM[i]); cores.push(cor.r, cor.g, cor.b);
    }
  };
  for (let i = 0; i < aneis.length - 1; i++) {
    const dentro = aneis[i].centro.clone().add(aneis[i + 1].centro).multiplyScalar(0.5);
    for (let j = 0; j < LADOS_DA_PRESA; j++) {
      const k = (j + 1) % LADOS_DA_PRESA, A = aneis[i].pontos, B = aneis[i + 1].pontos;
      face(A[j], A[k], B[k], i, i, i + 1, dentro);
      face(A[j], B[k], B[j], i, i + 1, i + 1, dentro);
    }
  }
  const uvDe = texelClaro(cabeca.material?.map) ?? [0.5, 0.5];
  const n = tris.length / 3, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  // os outros atributos no MESMO tipo dos da cabeça (o `mergeGeometries` recusa tipos diferentes)
  const igual = (nome) => { const m = cabeca.geometry.attributes[nome]; return new THREE.BufferAttribute(new m.array.constructor(n * m.itemSize), m.itemSize, m.normalized); };
  const osso = Math.max(0, cabeca.skeleton.bones.findIndex((b) => b.name === 'Head'));
  const uv = igual('uv'), si = igual('skinIndex'), sw = igual('skinWeight');
  for (let i = 0; i < n; i++) { uv.setXY(i, uvDe[0], uvDe[1]); si.setXYZW(i, osso, 0, 0, 0); sw.setXYZW(i, 1, 0, 0, 0); }
  g.setAttribute('uv', uv); g.setAttribute('skinIndex', si); g.setAttribute('skinWeight', sw);
  g.computeVertexNormals();   // sem índice: normal por face
  return g;
}

/**
 * As peças que a raça ACRESCENTA ao corpo (as presas; o busto e o top), no formato da malha
 * fundida (`geometry`, `skeleton`, `material`, `name`). `pecas` são as do corpo do
 * guerreiro; `elmo`: há elmo (as presas não se afastam); `peitoVestido`: há armadura no
 * peito (o busto e o top não entram: ela os cobre).
 */
export function pecasDaRaca(raca, pecas, elmo = false, peitoVestido = false) {
  return [...pecasDasPresas(raca, pecas, elmo), ...(peitoVestido ? [] : pecasDoBusto(raca, pecas))];
}
function pecasDasPresas(raca, pecas, elmo) {
  const p = proporcoesDe(raca), cabeca = pecas.find((o) => o.name === 'head');
  if (!(p.presas > 0.01) || !cabeca?.geometry.attributes.uv) return [];
  const chave = [p.presas, p.presasAfastadas, p.presasAltura, p.queixo, p.arcada, p.arcadaLargura, elmo ? 1 : 0].join('|');
  if (!presas.has(chave)) {
    // (no editor de raças cada toque numa régua faz uma: não guarda para sempre)
    if (presas.size > 60) { for (const g of presas.values()) g.dispose(); presas.clear(); }
    presas.set(chave, geometriaDasPresas(raca, pecas.find((o) => o.name === 'Face'), cabeca, elmo));
  }
  return [{ name: 'presas', geometry: presas.get(chave), skeleton: cabeca.skeleton, material: cabeca.material, bindMatrix: cabeca.bindMatrix }];
}

// ------------------------------------------------------------ o busto e o top
// OS SEIOS (cm, pose T; o do lado +x — o outro é o espelho): cada um é uma cúpula facetada
// assentada no peito. O pé dela é uma elipse em volta de (`x`, `y`), de meia largura `rx` e
// alturas `cima` e `baixo` (cai mais depressa por baixo); o cume fica `cai` cm abaixo do
// meio e sai `fundo` cm do peito. `busto` (a régua) multiplica o fundo e, pela raiz, o pé.
// A cúpula: `lados` gomos em volta e os anéis `aneis` (frações do pé), cada um na altura
// `perfil` (fração do fundo). O pé fica `afunda` cm dentro da pele — 0 desde a COSTURA (o pé é
// a borda da pele do peito; enterrado, abria um sulco em volta do seio).
export const BUSTO = { x: 8.6, y: 129.6, rx: 7.8, cima: 8.4, baixo: 6.4, fundo: 5.8, cai: 1.6, lados: 8, aneis: [0.42, 0.78, 1], perfil: [0.94, 0.6, 0], afunda: 0 };
// O TOP de couro: os BOJOS são os triângulos da cúpula, `folga` cm para fora — todos, menos a
// JANELA do colo: `janela` são [gomo, anel] — o gomo (0 = o lado de fora, contando para cima e
// para dentro) fica nu desse anel para fora (0 = o do cume): a beira de cima do bojo desce em
// degraus do alto do seio até o meio do peito. A FAIXA dá a volta no tronco na altura
// `faixa` (meia altura `meia`), e as ALÇAS sobem do alto de cada bojo, passam pelo ombro e
// descem pelas costas até ela.
export const TOP = { folga: 0.4, janela: [[2, 2], [3, 1]], faixa: 122.4, meia: 1.25, voltas: 28, alca: 0.8, passos: 15, cores: ['#6e4528', '#4a2c18', '#8a5a34'] };
const PELE_UV = [0.4, 0.31];   // um ponto da faixa de pele da paleta do modelo (a pele é de uma cor só; a aparência a tinge)
const bustos = new Map();
function pecasDoBusto(raca, pecas) {
  const b = proporcoesDe(raca).busto, tronco = pecas.find((o) => o.name === 'Upper_Torso');
  if (!(b > 0.01) || !tronco?.geometry.attributes.uv) return [];
  const chave = b.toFixed(3);
  if (!bustos.has(chave)) {
    if (bustos.size > 40) {
      for (const [pele, couro, costura] of bustos.values()) { pele.dispose(); couro.dispose(); for (const g of costura?.feitos?.values() ?? []) g.dispose(); }
      bustos.clear();
    }
    bustos.set(chave, geometriasDoBusto(b, pecas, tronco));
  }
  const [pele, couro, costura] = bustos.get(chave), base = { skeleton: tronco.skeleton, material: tronco.material, bindMatrix: tronco.bindMatrix };
  // (`pele`: a aparência tinge a peça como o resto da pele — aparencia.js `tingir`; `costura`: quem
  // monta o corpo troca o Upper_Torso pelo costurado — `torsoCosturado`)
  return [{ name: `busto_${chave}`, geometry: pele, pele: true, costura, ...base }, { name: `top_${chave}`, geometry: couro, ...base }];
}
function geometriasDoBusto(b, pecas, tronco) {
  const o = BUSTO, T = TOP, tam = Math.sqrt(b), fundo = o.fundo * b;
  // o corpo em que tudo assenta (todas as peças têm o mesmo esqueleto: os ossos são os da peça)
  const torso = triangulosDe(['Upper_Torso', 'Trapezius', 'Lower_Torso', 'Shoulder', 'neck'].map((n) => pecas.find((x) => x.name === n)).filter(Boolean));
  const naPele = (x, y) => {
    const g = raio(torso, x, y, true) ?? grudar(torso, new THREE.Vector3(x, y, 14));
    return { q: new THREE.Vector3().addScaledVector(g.tri[0].p, g.bar[0]).addScaledVector(g.tri[1].p, g.bar[1]).addScaledVector(g.tri[2].p, g.bar[2]), w: pesos(g) };
  };
  const pele = [], couro = [];   // os cantos, de três em três: { p, w, cor, de: o canto da cúpula de onde saiu }
  const tri = (lista, dentro, a, c2, d, cor) => {
    const n = new THREE.Vector3().subVectors(c2.p, a.p).cross(new THREE.Vector3().subVectors(d.p, a.p));
    if (n.lengthSq() < 1e-8) return;
    const fora = new THREE.Vector3().add(a.p).add(c2.p).add(d.p).multiplyScalar(1 / 3).sub(dentro);
    for (const k of n.dot(fora) < 0 ? [a, d, c2] : [a, c2, d]) lista.push({ p: k.p, w: k.w, cor, de: k.de ?? k });
  };
  const cor = T.cores.map((h) => new THREE.Color(h)), pes = [];
  for (const lado of [1, -1]) {
    // ---- a cúpula: o cume e os anéis (o do lado −x é o espelho: os mesmos números, o x trocado)
    const ponto = (r, j, h) => {
      const a = (j / o.lados) * Math.PI * 2, sx = Math.cos(a), sy = Math.sin(a);
      const x = o.x + o.rx * tam * r * sx, y = o.y - o.cai * (1 - r) + (sy > 0 ? o.cima : o.baixo) * tam * r * sy, s = naPele(x * lado, y);
      return { p: new THREE.Vector3(x * lado, y, s.q.z + fundo * h - (r >= 1 ? o.afunda : 0)), w: s.w };
    };
    const cume = ponto(0, 0, 1), aneis = o.aneis.map((r, k) => Array.from({ length: o.lados }, (_, j) => ponto(r, j, o.perfil[k])));
    pes.push({ lado, anel: aneis.at(-1) });   // (o pé: onde a costura emenda a pele do peito)
    const dentro = cume.p.clone().setZ(cume.p.z - fundo - 2);
    // (o bojo: o mesmo triângulo, um pouco para fora do meio do seio)
    const fora = (k) => ({ p: k.p.clone().add(k.p.clone().sub(dentro).normalize().multiplyScalar(T.folga)), w: k.w, de: k });
    const noBojo = (j, anel) => !T.janela.some(([gomo, de]) => gomo === j && anel >= de);
    const face = (a, c2, d, j, anel) => {
      tri(pele, dentro, a, c2, d, null);
      if (noBojo(j, anel)) tri(couro, dentro, fora(a), fora(c2), fora(d), cor[anel === 0 ? 2 : 0]);
    };
    for (let j = 0; j < o.lados; j++) {
      const k = (j + 1) % o.lados;
      face(cume, aneis[0][j], aneis[0][k], j, 0);
      for (let a = 0; a < aneis.length - 1; a++) { face(aneis[a][j], aneis[a][k], aneis[a + 1][k], j, a + 1); face(aneis[a][j], aneis[a + 1][k], aneis[a + 1][j], j, a + 1); }
    }
    // ---- a alça: do alto do bojo, por cima do ombro, até a faixa nas costas (raios saídos de dentro do ombro)
    const cx = o.x * lado, origem = new THREE.Vector3(cx, 136, -3), de = 12, ate = 224, tira = [];
    for (let i = 0; i <= T.passos; i++) {
      const a = ((de + ((ate - de) * i) / T.passos) * Math.PI) / 180, dir = new THREE.Vector3(0, Math.sin(a), Math.cos(a)), par = [];
      for (const dx of [-T.alca, T.alca]) {
        const g = raioDe(torso, origem.clone().setX(cx + dx), dir);
        par.push(g && { p: origem.clone().setX(cx + dx).addScaledVector(dir, g.t + T.folga), w: pesos(g) });
      }
      if (par[0] && par[1]) tira.push(par);
    }
    for (let i = 0; i < tira.length - 1; i++) {
      const [a, c2] = tira[i], [e, d] = tira[i + 1], meio = origem;
      tri(couro, meio, a, c2, d, cor[1]); tri(couro, meio, a, d, e, cor[1]);
    }
  }
  // ---- a faixa: uma volta no tronco, por baixo dos seios (raios saídos da coluna)
  const eixo = new THREE.Vector3(0, T.faixa, -2), volta = [];
  for (let i = 0; i < T.voltas; i++) {
    const a = (i / T.voltas) * Math.PI * 2, dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), par = [];
    for (const dy of [-T.meia, T.meia]) {
      const g = raioDe(torso, eixo.clone().setY(T.faixa + dy), dir);
      par.push(g && { p: eixo.clone().setY(T.faixa + dy).addScaledVector(dir, g.t + T.folga), w: pesos(g) });
    }
    volta.push(par[0] && par[1] ? par : null);
  }
  for (let i = 0; i < T.voltas; i++) {
    const A = volta[i], B = volta[(i + 1) % T.voltas];
    if (!A || !B) continue;
    tri(couro, eixo, A[0], B[0], B[1], cor[1]); tri(couro, eixo, A[0], B[1], A[1], cor[1]);
  }
  // ---- as duas geometrias, com os atributos do MESMO tipo dos do tronco (o `mergeGeometries` recusa tipos diferentes)
  const uvClaro = texelClaro(tronco.material?.map) ?? [0.5, 0.5];
  const geometria = (cantos, uvDe, comCor) => {
    const n = cantos.length, g = new THREE.BufferGeometry();
    const igual = (nome) => { const m = tronco.geometry.attributes[nome]; return new THREE.BufferAttribute(new m.array.constructor(n * m.itemSize), m.itemSize, m.normalized); };
    const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3), uv = igual('uv'), si = igual('skinIndex'), sw = igual('skinWeight'), corV = comCor ? new THREE.BufferAttribute(new Float32Array(n * 3), 3) : null;
    cantos.forEach((k, i) => {
      pos.setXYZ(i, k.p.x, k.p.y, k.p.z); uv.setXY(i, uvDe[0], uvDe[1]);
      si.setXYZW(i, ...k.w.o); sw.setXYZW(i, ...k.w.p);
      if (corV) corV.setXYZ(i, k.cor.r, k.cor.g, k.cor.b);
    });
    g.setAttribute('position', pos); g.setAttribute('uv', uv); g.setAttribute('skinIndex', si); g.setAttribute('skinWeight', sw);
    if (corV) g.setAttribute('color', corV);
    g.computeVertexNormals();   // sem índice: normal por face
    return g;
  };
  // O BOJO SEGUE A PELE: cada canto do couro do bojo diz de que vértice da pele do seio ele saiu
  // (`userData.segue`; −1 = a faixa e as alças) — a modelagem, depois de mexer na malha, o põe de
  // volta à folga do top em cima dele (puxões grandes mexiam a pele e o couro de jeitos diferentes
  // na beira do pincel, e a pele furava o couro)
  const daPele = new Map();
  pele.forEach((k, i) => { if (!daPele.has(k.de)) daPele.set(k.de, i); });
  const geoCouro = geometria(couro, uvClaro, true);
  geoCouro.userData.segue = Int32Array.from(couro, (k) => daPele.get(k.de) ?? -1);
  geoCouro.userData.folga = T.folga;
  return [geometria(pele, PELE_UV, false), geoCouro, costuraDoBusto(tronco, pes, tam)];
}

/**
 * A COSTURA de cada seio no peito: os triângulos do Upper_Torso que têm um canto DEBAIXO do pé
 * da cúpula ou perto dele (dentro da elipse dele vezes `COSTURA`, na frente, do lado dele) saem, e a beira do buraco que eles
 * deixam (um laço de pontos do peito) é ligada ao pé da cúpula. Devolve { tirar: os triângulos,
 * lados: [{ lado, anel: o pé, borda: os vértices do laço }] } — ou null (o buraco não é um laço
 * simples, ou não há ponto do peito debaixo do pé: o seio fica só posto em cima, como antes).
 */
// (o buraco vai um pouco além do pé — `COSTURA` vezes a elipse dele: perto do pé a costura não tinha
// onde esticar, e a borda do seio puxada para baixo pela modelagem dobrava a pele por cima do top)
const COSTURA = 1.35;
function costuraDoBusto(tronco, pes, tam) {
  const o = BUSTO, g = tronco.geometry, P = g.attributes.position, idx = g.index, nt = (idx ? idx.count : P.count) / 3;
  const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  const chave = (i) => `${P.getX(i).toFixed(3)},${P.getY(i).toFixed(3)},${P.getZ(i).toFixed(3)}`;
  const tirar = new Set(), lados = [];
  for (const { lado, anel } of pes) {
    const debaixo = (i) => {
      const x = P.getX(i) * lado, y = P.getY(i);
      // (a linha do meio fica: ela é a beira dos dois buracos — e no modelo o x dela é ±0,000, um fio para cada lado)
      if (x <= 0.5 || P.getZ(i) <= 0) return false;
      const dx = (x - o.x) / (o.rx * tam), dy = (y - o.y) / ((y > o.y ? o.cima : o.baixo) * tam);
      return dx * dx + dy * dy < COSTURA * COSTURA;
    };
    const meus = [];
    for (let t = 0; t < nt; t++) if ([0, 1, 2].some((k) => debaixo(vi(t, k)))) meus.push(t);
    if (!meus.length || meus.some((t) => tirar.has(t))) return null;
    for (const t of meus) tirar.add(t);
    // a beira do buraco: as arestas dos triângulos tirados que não são de dois deles
    const arestas = new Map();
    for (const t of meus) for (let k = 0; k < 3; k++) {
      const a = vi(t, k), b = vi(t, (k + 1) % 3), ka = chave(a), kb = chave(b), id = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
      const e = arestas.get(id);
      if (e) e.n++; else arestas.set(id, { n: 1, a, b, ka, kb });
    }
    const vizinhos = new Map(), vertice = new Map();
    for (const e of arestas.values()) {
      if (e.n !== 1) continue;
      for (const [k, i, outro] of [[e.ka, e.a, e.kb], [e.kb, e.b, e.ka]]) { (vizinhos.get(k) ?? vizinhos.set(k, []).get(k)).push(outro); vertice.set(k, i); }
    }
    if (!vizinhos.size || ![...vizinhos.values()].every((l) => l.length === 2)) return null;
    // … em ordem: um laço só, que passe por todos
    const inicio = vizinhos.keys().next().value, laco = [inicio];
    for (let antes = null, aqui = inicio; ;) {
      const prox = vizinhos.get(aqui).find((k) => k !== antes);
      if (prox === inicio || prox === undefined) break;
      laco.push(prox); antes = aqui; aqui = prox;
      if (laco.length > vizinhos.size) return null;
    }
    if (laco.length !== vizinhos.size) return null;
    lados.push({ lado, anel, borda: laco.map((k) => vertice.get(k)) });
  }
  return { tirar, lados };
}

/**
 * O pé de cada seio da raça, como elipse no MODELO ([{ lado, x, y, rx, cima, baixo }], [] sem busto):
 * a pele do peito ali é a que o seio cobre — a modelagem não vale puxão feito nela (`debaixoDoBusto`),
 * com o seio costurado ou com a armadura no peito (que o tira).
 */
export function sobOBustoDe(raca) {
  const b = proporcoesDe(raca).busto, o = BUSTO, tam = Math.sqrt(b);
  return b > 0.01 ? [1, -1].map((lado) => ({ lado, x: o.x, y: o.y, rx: o.rx * tam, cima: o.cima * tam, baixo: o.baixo * tam })) : [];
}

/**
 * O Upper_Torso COSTURADO (`costura` de `pecasDoBusto`): a peça do peito (a do modelo ou a tingida)
 * sem os triângulos debaixo dos seios, e com a faixa que fecha o buraco — do laço da beira até o
 * pé de cada cúpula, em volta do meio do seio (os dois na ordem do ângulo: cada passo avança no
 * que vem antes). Os cantos da beira são vértices do peito (copiados inteiros: a cor, o osso); os
 * do pé, os da cúpula (com a cor e a UV de um vértice da beira). Feita uma vez por peça e busto.
 */
export function torsoCosturado(peca, costura) {
  const feitos = (costura.feitos ??= new Map());
  if (!feitos.has(peca.geometry.uuid)) feitos.set(peca.geometry.uuid, costurar(peca.geometry, costura));
  return { name: peca.name, geometry: feitos.get(peca.geometry.uuid), skeleton: peca.skeleton, material: peca.material, bindMatrix: peca.bindMatrix };
}
function costurar(g0, { tirar, lados }) {
  const o = BUSTO, P0 = g0.attributes.position, idx = g0.index, nt = (idx ? idx.count : P0.count) / 3;
  const vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  const doPeito = (i) => new THREE.Vector3().fromBufferAttribute(P0, i);
  // os cantos, de três em três: { i } (um vértice do peito) ou { p, w, ref } (o pé da cúpula)
  const cantos = [];
  for (let t = 0; t < nt; t++) if (!tirar.has(t)) for (let k = 0; k < 3; k++) cantos.push({ i: vi(t, k) });
  const daCostura = cantos.length;
  for (const { lado, anel, borda } of lados) {
    const ang = (p) => Math.atan2(p.y - o.y, p.x * lado - o.x), desde = (a, a0) => (((a - a0) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const R = anel.map((k) => ({ c: { p: k.p, w: k.w, ref: borda[0] }, p: k.p })), L = borda.map((i) => ({ c: { i }, p: doPeito(i) }));
    const a0 = ang(R[0].p);
    for (const x of [...R, ...L]) x.d = desde(ang(x.p), a0);
    R.sort((a, b) => a.d - b.d); L.sort((a, b) => a.d - b.d);
    R.push({ ...R[0], d: Math.PI * 2 }); L.push({ ...L[0], d: L[0].d + Math.PI * 2 });
    // por dentro (para virar os triângulos para fora): atrás do meio do pé
    const meio = anel.reduce((s, k) => s.add(k.p), new THREE.Vector3()).multiplyScalar(1 / anel.length), dentro = meio.clone().setZ(meio.z - 10);
    const pos = (c) => (c.p ?? doPeito(c.i));
    const tri = (a, b, c) => {
      const pa = pos(a), pb = pos(b), pc = pos(c), n = new THREE.Vector3().subVectors(pb, pa).cross(new THREE.Vector3().subVectors(pc, pa));
      if (n.lengthSq() < 1e-8) return;
      const fora = pa.clone().add(pb).add(pc).multiplyScalar(1 / 3).sub(dentro);
      cantos.push(...(n.dot(fora) < 0 ? [a, c, b] : [a, b, c]));
    };
    for (let i = 0, j = 0, nR = R.length - 1, nL = L.length - 1; i < nR || j < nL;) {
      if (j >= nL || (i < nR && R[i + 1].d <= L[j + 1].d)) { tri(R[i].c, R[i + 1].c, L[j].c); i++; }
      else { tri(R[i].c, L[j + 1].c, L[j].c); j++; }
    }
  }
  const g = new THREE.BufferGeometry(), n = cantos.length;
  for (const [nome, a] of Object.entries(g0.attributes)) {
    const arr = new a.array.constructor(n * a.itemSize), s = a.itemSize;
    cantos.forEach((c, j) => {
      const de = c.i ?? c.ref;
      for (let k = 0; k < s; k++) arr[j * s + k] = a.array[de * s + k];   // (o resto: a cor, a UV, de um vértice da beira)
      if (c.i !== undefined) return;
      if (nome === 'position') { arr[j * 3] = c.p.x; arr[j * 3 + 1] = c.p.y; arr[j * 3 + 2] = c.p.z; }
      else if (nome === 'skinIndex') for (let k = 0; k < 4; k++) arr[j * s + k] = c.w.o[k];
      else if (nome === 'skinWeight') for (let k = 0; k < 4; k++) arr[j * s + k] = c.w.p[k];
    });
    g.setAttribute(nome, new THREE.BufferAttribute(arr, s, a.normalized));
  }
  // a normal reta das faces da costura (as do peito ficam como eram)
  const P = g.attributes.position, N = g.attributes.normal, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  if (N) for (let t = daCostura; t < n; t += 3) {
    a.fromBufferAttribute(P, t); b.fromBufferAttribute(P, t + 1).sub(a); c.fromBufferAttribute(P, t + 2).sub(a);
    b.cross(c).normalize();
    for (let k = 0; k < 3; k++) N.setXYZ(t + k, b.x, b.y, b.z);
  }
  return g;
}

// ------------------------------------------------------------ as orelhas
// A orelha do modelo (a do lado +x; cm, pose T) é uma abinha na peça `Face`: nasce no lado
// da cabeça (`raiz`) e sai para fora e para trás até a `borda`, com a ponta de BAIXO no
// lóbulo e o alto reto. Esticar é puxar o canto de cima e de fora na direção `ponta`
// (fora, cima, trás): cada vértice vai junto na medida em que está ALTO na orelha e LONGE
// da cabeça (`curva`: os expoentes das duas medidas) — o canto vira a ponta, a borda de
// trás e a de cima viram os dois lados dela, e o lóbulo e a raiz não saem do lugar.
// `passo`: quantos cm a ponta anda a cada 100% da régua.
export const ORELHA = {
  caixa: { x: 10.9, y: [164, 172.2], z: [-4.5, -1] },   // onde estão os vértices dela
  raiz: [10.6, -1.2], borda: [12.5, -3.8],              // (x, z)
  lobulo: 164.5, alto: 171.5,
  ponta: [0.5, 0.75, -0.43], passo: 6, curva: [1.5, 2],
};
// ------------------------------------------------------------ o queixo
// O maxilar de baixo do modelo é um V: 3 cm de meia largura na ponta do queixo, 7 na altura
// da boca, e só chega à largura do crânio no ângulo do osso, debaixo da orelha — num orc,
// de frente, o rosto afinava para baixo. `queixo` multiplica o x de cada ponto do rosto DE
// BAIXO: inteiro da ponta do queixo à boca (`baixo[1]` a `alto[0]`, alturas em cm na pose
// T), sumindo até a maçã do rosto (`alto[1]`) em cima e até debaixo do queixo (`baixo[0]`:
// o alto do pescoço vem junto, é a emenda), e só da orelha para a FRENTE (`fundo`, em z: a
// orelha e a nuca ficam onde estão).
export const QUEIXO = { baixo: [152, 155], alto: [160, 169], fundo: [-1, 3] };
/**
 * O quanto o queixo da raça ALARGA num lugar do rosto: uma função (y, z) → o fator do x
 * (1 = fica) — ou null, se a raça tem o queixo do modelo. É por LUGAR, e não por peça:
 * quem tem ponto ali (o rosto, o alto do pescoço, o elmo) usa a mesma conta, e nada abre
 * fresta. As presas e a barba são presas à PELE já alargada (o ÍMÃ, ima.js).
 */
export function largoDoQueixo(raca) {
  const q = proporcoesDe(raca).queixo - 1, o = QUEIXO, suave = THREE.MathUtils.smoothstep;
  if (Math.abs(q) < 1e-3) return null;
  return (y, z) => 1 + q * suave(y, o.baixo[0], o.baixo[1]) * (1 - suave(y, o.alto[0], o.alto[1])) * suave(z, o.fundo[0], o.fundo[1]);
}

// ------------------------------------------------------------ a arcada
// A saliência da testa sobre os olhos (a "sobrancelha avantajada" do orc). `arcada` traz
// para a FRENTE a faixa das sobrancelhas — `passo` cm a cada 100% da régua —, inteira logo
// acima dos olhos (`baixo`: de onde começa até onde já é inteira; os olhos não saem do
// lugar: ficam no fundo, à sombra dela) e sumindo testa acima até a linha do cabelo (`alto`),
// e só no rosto de frente (`fundo`, em z: as têmporas ficam). `cai`: o quanto ela DESCE a
// cada cm que avança (pesa sobre os olhos). `arcadaLargura` ALARGA a mesma faixa (o x de
// cada ponto, a partir do meio): os cantos de fora da arcada passam dos olhos e das têmporas.
export const ARCADA = { baixo: [172.6, 173.5], alto: [174.5, 180.5], fundo: [4, 9], passo: 2, cai: 0.2 };

/**
 * O ROSTO como a raça o deixa, ANTES dos ossos: uma função que leva um ponto do rosto do
 * modelo (um Vector3 em cm, pose T — mudado no lugar e devolvido) para onde a arcada e o
 * queixo o põem — ou null, se a raça tem o rosto do modelo. É por LUGAR, e não por peça:
 * a pele, a testa, o alto do pescoço e o elmo passam pela mesma conta (`moldarPeca`) e
 * nada abre fresta; as presas, a barba e as sobrancelhas são presas à pele já assim (o
 * ÍMÃ, ima.js).
 */
export function rostoDaRaca(raca) {
  const p = proporcoesDe(raca), largo = largoDoQueixo(raca), a = (p.arcada - 1) * ARCADA.passo, l = p.arcadaLargura - 1, o = ARCADA, suave = THREE.MathUtils.smoothstep;
  if (!largo && Math.abs(a) < 1e-3 && Math.abs(l) < 1e-3) return null;
  return (v) => {
    if (a || l) {
      // o quanto o ponto é da arcada (pela altura e pelo fundo em que o MODELO o tem)
      const w = suave(v.y, o.baixo[0], o.baixo[1]) * (1 - suave(v.y, o.alto[0], o.alto[1])) * suave(v.z, o.fundo[0], o.fundo[1]);
      v.x *= 1 + l * w; v.z += a * w; v.y -= a * w * o.cai;
    }
    if (largo) v.x *= largo(v.y, v.z);
    return v;
  };
}

const daOrelha = (nome) => /^Face(_|$)/.test(nome);   // (a tingida chama-se `Face_tingido`)
// quem tem ponto no rosto: a pele, a testa (a peça `head`: divide com a `Face` a linha de
// cima da arcada) e o alto do pescoço — e o ELMO (o do pacote, ou pintado sobre a cabeça e
// o pescoço), que vai junto: como o resto da armadura, cresce com o corpo (parado, o queixo
// do orc furava as laterais dele, e a arcada, a viseira)
const doRosto = (nome) => /^(Face|head|neck)(_|$)|Helmet|^casca_.*_(head|neck)$/.test(nome);
/**
 * As proporções da raça que se fazem NA PEÇA, antes de fundir (as orelhas, a arcada e o queixo): muda
 * a geometria no lugar — quem chama dá uma cópia (guerreiro.js `geometriaFundida`).
 * Com ELMO a orelha fica como o modelo a tem (esticada, a ponta furava o elmo).
 */
export function moldarPeca(geo, nome, raca, elmo = false) {
  const pos = geo.attributes.position, mexeu = new Uint8Array(pos.count);
  const quanto = proporcoesDe(raca).orelhas - 1;
  if (!elmo && daOrelha(nome) && Math.abs(quanto) >= 1e-3) {
    const o = ORELHA, ax = o.borda[0] - o.raiz[0], az = o.borda[1] - o.raiz[1], comprimento = Math.hypot(ax, az);
    const dir = new THREE.Vector3(...o.ponta).normalize();
    const entre = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), lado = Math.sign(x), fora = Math.abs(x);
      if (fora < o.caixa.x || y < o.caixa.y[0] || y > o.caixa.y[1] || z < o.caixa.z[0] || z > o.caixa.z[1]) continue;
      // quão longe da cabeça (ao longo da aba) e quão alto na orelha, de 0 a 1
      const longe = entre(((fora - o.raiz[0]) * ax + (z - o.raiz[1]) * az) / comprimento, 0, comprimento);
      const alto = entre(y, o.lobulo, o.alto);
      const d = longe ** o.curva[0] * alto ** o.curva[1] * quanto * o.passo;
      if (!d) continue;
      pos.setXYZ(i, x + lado * dir.x * d, y + dir.y * d, z + dir.z * d);
      mexeu[i] = 1;
    }
  }
  // O ROSTO: a arcada e o queixo, por lugar (as presas, a barba e as sobrancelhas não passam
  // por aqui: nascem presas à pele já assim — o ÍMÃ)
  const rosto = doRosto(nome) ? rostoDaRaca(raca) : null;
  if (rosto) {
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      rosto(v.set(x, y, z));
      if (Math.abs(v.x - x) + Math.abs(v.y - y) + Math.abs(v.z - z) < 1e-5) continue;
      pos.setXYZ(i, v.x, v.y, v.z);
      mexeu[i] = 1;
    }
  }
  if (!mexeu.includes(1)) return;
  pos.needsUpdate = true;
  normaisDasFaces(geo, mexeu);
}

// As normais das faces que mudaram (a malha não tem índice: cada triângulo tem os seus três
// vértices, e a normal é a da face — o facetado do modelo). `mexeu`: 1 por vértice mexido.
function normaisDasFaces(geo, mexeu) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  if (!nor || geo.index) return;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    if (!mexeu[t] && !mexeu[t + 1] && !mexeu[t + 2]) continue;
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1).sub(a); c.fromBufferAttribute(pos, t + 2).sub(a);
    b.cross(c).normalize();
    for (let k = 0; k < 3; k++) nor.setXYZ(t + k, b.x, b.y, b.z);
  }
  nor.needsUpdate = true;
}

// ------------------------------------------------------------ a virilha
// A frente da bacia entre as coxas (do cinto ao fundo da tanga). No orc a barriga cresce
// para a frente e as coxas engrossam em volta do próprio osso, e esse pedaço — parte preso
// ao quadril, parte às coxas — ficava para trás dos dois: um buraco. Não é de um osso só,
// então a régua vale por LUGAR (cm a partir do osso do quadril, na pose T): quem está na
// frente dele avança na proporção do quanto já está à frente — inteiro até `lado[0]` do
// meio do corpo, sumindo até `lado[1]` (a linha das coxas), e de `cima[1]` a `cima[2]` de
// altura, sumindo até `cima[0]` embaixo (antes do meio da coxa) e `cima[3]` em cima (antes
// do anel de baixo da barriga). E só na medida em que o vértice é preso ao quadril e às
// coxas: o cinto e a fivela das armaduras são do osso da barriga, e ficam onde estão.
export const VIRILHA = { lado: [6, 16], cima: [-11, -3, 12, 17.5] };

// ------------------------------------------------------------ o meio dos braços
// O osso do braço NÃO passa pelo meio da carne: no antebraço corre ~2 cm para trás do meio
// (num antebraço de 10 de grossura), e no braço cruza a carne de viés (atrás do meio perto
// do ombro, à frente perto do cotovelo). Engrossar em volta do osso fazia um lado crescer
// o dobro do outro: o antebraço só ganhava volume para a frente, o braço para trás, e os
// músculos saíam tortos. Os braços engrossam em volta do MEIO: [largura, grossura] em cm,
// do osso até o meio da seção, a ¼ e a ¾ do comprimento, nos eixos do membro ESQUERDO —
// medido no corpo nu (o meio entre os extremos dos vértices presos ao osso). As pernas e o
// pescoço seguem em volta do osso (a panturrilha cresce para trás, como é).
const MEIO = { Arm: [[1.07, -1.76], [-0.71, 0.79]], Elbow: [[0.54, 1.98], [-0.45, 1.51]] };

const um = (v) => Math.abs(v - 1) < 1e-4;
/**
 * As REGRAS da raça, uma por osso do esqueleto único (`ordem`, `inversos`: os nomes e os
 * inversos de ligação), e os eixos do corpo na pose T — ou null (outro esqueleto: o corpo
 * fica como é). `p` são as proporções completas.
 */
function regrasDaRaca(p, ordem, inversos) {
  const lugar = new Map(ordem.map((n, i) => [n, new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(inversos[i]).invert())]));
  const de = (n) => lugar.get(n);
  if (!de('Hips') || !de('Head') || !de('ArmL') || !de('ArmR') || !de('Footl') || !de('ToeL')) return null;
  // os eixos do corpo na pose T: para cima, para o lado e para a frente (a ponta do pé)
  const cima = de('Head').clone().sub(de('Hips')).normalize();
  const lado = de('ArmL').clone().sub(de('ArmR'));
  lado.addScaledVector(cima, -lado.dot(cima)).normalize();
  const frente = new THREE.Vector3().crossVectors(lado, cima).normalize();
  if (frente.dot(de('ToeL').clone().sub(de('Footl'))) < 0) frente.negate();

  // a regra de cada osso: { a: de onde cresce, d: o eixo ao longo do qual NÃO cresce (null
  // = a partir do ponto), e: os três eixos da conta, s: quanto cresce em cada um, tras: o
  // fator do terceiro eixo para quem está ATRÁS (do lado negativo dele) }
  const corpo = [lado, cima, frente];
  const regras = new Array(ordem.length).fill(null);
  const por = (nomes, regra) => {
    for (const n of nomes) ordem.forEach((o, i) => { if (typeof n === 'string' ? o === n : n.test(o)) regras[i] = typeof regra === 'function' ? regra(o) : regra; });
  };
  // o tronco: em volta da linha da coluna (de pé), a largura e o fundo separados
  const tronco = (raiz, largura, fundo, tras = fundo) => (um(largura) && um(fundo) && um(tras) ? null : { a: de(raiz), d: cima, e: corpo, s: [largura, 1, fundo], tras });
  por(['Hips'], tronco('Hips', p.quadril, p.quadrilFundo));
  por(['Spine003', 'Spine002'], tronco('Spine003', p.barrigaLargura, p.barrigaFrente, 1 + (p.barrigaFrente - 1) * 0.25));
  por(['Spine001', 'Spine'], tronco('Spine001', p.peitoLargura, p.peitoFundo));
  // os ombros (as clavículas) são do peito, com o fundo dele vezes a grossura deles
  por(['CollarL', 'CollarR'], tronco('Spine001', p.peitoLargura, p.peitoFundo * p.ombrosGrossura));
  // os membros: cada osso em volta do próprio eixo (dele até o filho), a LARGURA (o que se
  // vê de frente) e a GROSSURA (de lado) separadas. `ref` é a direção do corpo que dá a
  // largura: nas pernas e no pescoço, o lado; nos BRAÇOS, a de cima — na pose T o braço
  // está deitado, e o que ali é "para cima" é o que fica "para o lado" com o braço caído
  // (os eixos de um membro: a largura, o comprimento e a grossura)
  const eixosDe = (d, ref) => { const l = ref.clone().addScaledVector(d, -ref.dot(d)).normalize(); return [l, d, new THREE.Vector3().crossVectors(d, l)]; };
  const membro = (filho, largura, grossura, ref, meio = null) => (o) => {
    const f = de(filho(o));
    if ((um(largura) && um(grossura)) || !f) return null;
    let a = de(o);
    const d = f.clone().sub(a), comp = d.length();
    d.normalize();
    if (meio) {
      // em volta do MEIO da carne, e não do osso (ver `MEIO`): a reta que passa pelos dois
      // meios medidos (no braço direito o eixo da grossura é o espelho do esquerdo)
      const e = eixosDe(d, ref), espelho = d.dot(lado) < 0 ? -1 : 1;
      const [m1, m2] = meio.map(([x, z], i) => a.clone().addScaledVector(d, comp * (0.25 + 0.5 * i)).addScaledVector(e[0], x).addScaledVector(e[2], z * espelho));
      a = m1; d.subVectors(m2, m1).normalize();
    }
    return { a, d, e: eixosDe(d, ref), s: [largura, 1, grossura], tras: grossura };
  };
  por(['Neck'], membro(() => 'Head', p.pescoco, p.pescocoGrossura, lado));
  por(['ArmL', 'ArmR'], membro((o) => `Elbow${o.slice(-1)}`, p.bracos, p.bracosGrossura, cima, MEIO.Arm));
  por(['ElbowL', 'ElbowR'], membro((o) => `Hand${o.slice(-1)}`, p.antebracos, p.antebracosGrossura, cima, MEIO.Elbow));
  por(['Thighl', 'Thighr'], membro((o) => `Shin${o.slice(-1)}`, p.coxas, p.coxasGrossura, lado));
  por(['Shinl', 'Shinr'], membro((o) => `Foot${o.slice(-1)}`, p.canelas, p.canelasGrossura, lado));
  // a cabeça cresce inteira a partir da junta; os pés só no chão (não afundam). As MÃOS
  // não são aqui: é a escala do osso (`aplicarRaca`), senão os dedos esticam ao fechar
  const ponto = (raiz, s) => (s.every(um) ? null : { a: de(raiz), d: null, e: corpo, s, tras: s[2] });
  por(['Head'], ponto('Head', [p.cabeca, p.cabeca, p.cabeca]));
  for (const l of ['l', 'r']) por([`Foot${l}`, `Toe${l.toUpperCase()}`], ponto(`Foot${l}`, [p.pes, 1, p.pes]));
  return { regras, de, lado, cima, frente };
}

// Um ponto `v` (no espaço da ligação) levado pelas regras dos ossos a que está preso — os
// 4 de `ossos`/`pesos` — para `somaV`, e a normal `n` dele (null = só o ponto) para
// `somaN`. Devolve a soma dos pesos (as somas ainda não estão divididas por ela).
const _r = new THREE.Vector3();
function levar(regras, v, n, ossos, pesos, somaV, somaN) {
  const r = _r;
  somaV.set(0, 0, 0); somaN?.set(0, 0, 0);
  let peso = 0;
  for (let k = 0; k < 4; k++) {
    const w = pesos[k];
    if (!w) continue;
    peso += w;
    const g = regras[ossos[k]];
    if (!g) { somaV.addScaledVector(v, w); if (n) somaN.addScaledVector(n, w); continue; }
    // o vértice visto do osso, sem a parte que corre AO LONGO do eixo (essa não cresce)
    r.subVectors(v, g.a);
    if (g.d) r.addScaledVector(g.d, -r.dot(g.d));
    const e = g.e, x = r.dot(e[0]), y = r.dot(e[1]), z = r.dot(e[2]), sz = z < 0 ? g.tras : g.s[2];
    somaV.addScaledVector(v, w).addScaledVector(e[0], w * x * (g.s[0] - 1)).addScaledVector(e[1], w * y * (g.s[1] - 1)).addScaledVector(e[2], w * z * (sz - 1));
    if (!n) continue;
    // a normal: cada parte dividida pelo que aquela direção cresceu
    const nx = n.dot(e[0]), ny = n.dot(e[1]), nz = n.dot(e[2]);
    somaN.addScaledVector(n, w).addScaledVector(e[0], w * nx * (1 / g.s[0] - 1)).addScaledVector(e[1], w * ny * (1 / g.s[1] - 1)).addScaledVector(e[2], w * nz * (1 / sz - 1));
  }
  return peso;
}

/**
 * Para o que é feito JÁ com as proporções da raça (o cabelo que cai nas costas,
 * penteado.js): devolve a função que leva UM ponto (`v`, mudado no lugar; os 4 ossos e os 4
 * pesos dele, na ordem única) para onde a raça o põe — a mesma conta do `deformar`, menos a
 * virilha (que é da frente da bacia). Sem raça, ou raça igual ao humano, o ponto fica.
 */
export function deformadorDe(raca, ordem, inversos, ligacao) {
  const R = raca ? regrasDaRaca(proporcoesDe(raca), ordem, inversos) : null;
  if (!R?.regras.some(Boolean)) return (v) => v;
  const volta = new THREE.Matrix4().copy(ligacao).invert(), soma = new THREE.Vector3();
  return (v, ossos, pesos) => {
    const peso = levar(R.regras, v.applyMatrix4(ligacao), null, ossos, pesos, soma, null);
    if (peso) v.copy(soma).multiplyScalar(1 / peso);
    return v.applyMatrix4(volta);
  };
}

/**
 * Engrossa a malha fundida do corpo pelas proporções da raça (muda a geometria NO LUGAR).
 * `ordem` e `inversos` são os ossos do esqueleto único (nomes e inversos de ligação) e
 * `ligacao` a matriz de ligação das peças: a conta é feita no espaço em que os ossos
 * estão na pose T. Só os primeiros `ate` vértices: o que vem depois já foi feito com as
 * proporções (o penteado).
 */
export function deformar(geo, raca, ordem, inversos, ligacao, ate = geo.attributes.position.count) {
  const p = proporcoesDe(raca), R = regrasDaRaca(p, ordem, inversos);
  if (!R) return;   // outro esqueleto: fica como é
  const { regras, de, lado, cima, frente } = R;
  const pos = geo.attributes.position, nor = geo.attributes.normal, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const volta = new THREE.Matrix4().copy(ligacao).invert();
  const v = new THREE.Vector3(), n = new THREE.Vector3(), r = new THREE.Vector3(), somaV = new THREE.Vector3(), somaN = new THREE.Vector3();
  // A VIRILHA (por lugar, ver `VIRILHA`), ANTES das regras dos ossos: o que avança aqui
  // cresce depois junto com o quadril e as coxas
  if (!um(p.virilha)) {
    const o = VIRILHA, bacia = de('Hips'), suave = THREE.MathUtils.smoothstep, mexeu = new Uint8Array(pos.count);
    const daBacia = ordem.map((n) => /^(Hips|Thigh[lr])$/.test(n));
    for (let i = 0; i < ate; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(ligacao);
      r.subVectors(v, bacia);
      const z = r.dot(frente), y = r.dot(cima);
      if (z <= 0) continue;
      // só o que é preso ao quadril e às coxas: a fivela do cinto das armaduras é da
      // barriga inteira, e sem isto a metade de baixo dela era puxada em bico
      let preso = 0;
      for (let k = 0; k < 4; k++) if (daBacia[si.getComponent(i, k)]) preso += sw.getComponent(i, k);
      const w = preso * (1 - suave(Math.abs(r.dot(lado)), o.lado[0], o.lado[1])) * suave(y, o.cima[0], o.cima[1]) * (1 - suave(y, o.cima[2], o.cima[3]));
      if (!w) continue;
      v.addScaledVector(frente, z * (p.virilha - 1) * w).applyMatrix4(volta);
      pos.setXYZ(i, v.x, v.y, v.z);
      mexeu[i] = 1;
    }
    normaisDasFaces(geo, mexeu);
    pos.needsUpdate = true;
    geo.boundingBox = null; geo.boundingSphere = null;
  }
  if (!regras.some(Boolean)) return;

  const normalIda = new THREE.Matrix3().getNormalMatrix(ligacao), normalVolta = new THREE.Matrix3().getNormalMatrix(volta);
  const ossos = [0, 0, 0, 0], pesos = [0, 0, 0, 0];
  for (let i = 0; i < ate; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(ligacao);
    if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(normalIda).normalize();
    for (let k = 0; k < 4; k++) { ossos[k] = si.getComponent(i, k); pesos[k] = sw.getComponent(i, k); }
    const peso = levar(regras, v, nor ? n : null, ossos, pesos, somaV, somaN);
    if (!peso) continue;
    somaV.multiplyScalar(1 / peso).applyMatrix4(volta);
    pos.setXYZ(i, somaV.x, somaV.y, somaV.z);
    if (nor) { somaN.applyMatrix3(normalVolta).normalize(); nor.setXYZ(i, somaN.x, somaN.y, somaN.z); }
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  geo.boundingBox = null; geo.boundingSphere = null;
}
