// O GUERREIRO (03/10/2026) — o corpo do jogador, nos dois modos. O PROVADOR
// (Shift+G, `provador.js`) troca entre o sem armadura, as três armaduras dele e o
// boneco antigo; a escolha fica no navegador (`corpoGuardado`) e VIAJA no
// instantâneo (`c`, protocolo.js), para os outros verem o mesmo corpo.
//
// Um corpo novo para o jogador, vindo do "Low Poly Axe Warrior" (FBX da loja da
// Unity, convertido para assets/guerreiro/guerreiro.glb): o corpo nu em peças, as
// três armaduras dele (A1, A2, A3) e um esqueleto PRÓPRIO, de 54 ossos.
//
// As animações continuam sendo as do manequim UAL: o boneco de sempre segue
// montado e animado (golpes, janelas de acerto, tudo igual), só que INVISÍVEL, e
// a cada quadro o esqueleto do guerreiro COPIA o dele — o "retarget ao vivo":
//
//   • os dois estão na pose T no arquivo; guardamos a orientação de cada osso
//     nessa pose (no espaço do `pivot`, o mesmo para os dois);
//   • a cada quadro, o quanto o osso UAL girou desde a pose T (D = agora · T⁻¹)
//     é aplicado ao osso par do guerreiro (D · T_guerreiro);
//   • o quadril leva também o deslocamento (pulo, rolamento, agachar),
//     na proporção da altura dos dois.
//
// Osso do guerreiro sem par (a coluna tem um a mais) fica na pose do arquivo,
// preso ao pai. As armas, que o jogo constrói para a mão do UAL, vão para a mão
// do guerreiro com a mesma pegada (`pegada`).
import * as THREE from 'three';
import { Assets } from './assets.js';
import { clone as cloneSkinned } from '../vendor/jsm/utils/SkeletonUtils.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { LUGARES } from './ficha.js';
import { pecasDaCasca, desenhoDe } from './casca.js';
import { Gear } from './gear.js';
import { tingir, APARENCIA_PADRAO, aparenciaValida, lerAparencia, CABELOS, PELES, OLHOS, naPele } from './aparencia.js';
import { racaDe, proporcoesDe, deformar, deformadorDe, pecasDaRaca, moldarPeca, largoDoQueixo, rostoDaRaca, torsoCosturado, sobOBustoDe, temFeminino } from './raca.js';
import { PENTEADOS, penteadoDe, BARBAS, barbaDe, SOBRANCELHAS, sobrancelhaDe, geometriaDoPenteado } from './penteado.js';
import { ORIGENS, origemDaPeca, edicoesDoCorpo, aplicarModelagem, acrescentarTriangulos, modelagemAberta, aplicarLuzes } from './modelagem.js';
import { geometriaDaFolha, texturaDaFolha, materialDaPintura, olhosApagados, olhosLisos, cascaDoOlho, uvEscura, uvClara, CORES_DO_MODELO } from './pintura.js';
import { geometriaDosCilios, alisarOlhos } from './cilios.js';
import { geometriasDasPalpebras, PISCADA, proximaPiscada } from './piscada.js';
import { folhaDaBoca } from './boca.js';

// O CORPO, como viaja na rede (`c` do instantâneo): 'antigo' = o manequim UAL, ou o
// CÓDIGO DA ARMADURA — um dígito por lugar (ficha.js `LUGARES`: cabeça, peito, braços,
// pernas), 0 = nada ali, 1/2/3 = a peça do conjunto A1/A2/A3 do modelo. '0000' = nu,
// '0213' = sem elmo, peito da malha, braços de couro, pernas de placas (04/10/2026: a
// armadura vem do EQUIPAMENTO; antes vinha do provador, inteira).
// Depois de ':' vem a APARÊNCIA (aparencia.js: pele, cabelo, barba, olhos — 5 dígitos):
// '0100:21310'. Sem ela, a do modelo. Um 6º dígito na aparência é a RAÇA (raca.js), um 7º, a
// SOBRANCELHA (penteado.js), um 8º, o SEXO (raca.js `racaDe`), e um 9º, o BATOM (boca.js).
export const NU = '0000';
const CODIGO = /^[0-9]{4}(:[0-9]{5,9})?$/;
/** O corpo que veio da rede é válido? (os nomes de antes — 'nu', 'A1'… — ainda valem) */
export const corpoValido = (c) => c === 'antigo' || CODIGO.test(c) || ['nu', 'A1', 'A2', 'A3'].includes(c);
/** corpo → o argumento de `CharacterModel.usarGuerreiro` (false = boneco antigo; senão o código) */
export function armaduraDe(c) {
  if (c === 'antigo') return false;
  if (CODIGO.test(c)) return c;
  const velho = /^A([123])$/.exec(c ?? '');
  return velho ? velho[1].repeat(4) : NU;
}
/** O código da armadura a partir do que está vestido: { cabeca: 2, peito: 1, … } (conjuntos) */
export const codigoDaArmadura = (conjuntos) => LUGARES.map((l) => conjuntos[l] ?? 0).join('');

// O PROVADOR (Shift+G) só escolhe entre o guerreiro ('nu': veste o que está equipado)
// e o boneco antigo; a escolha fica neste navegador
const CHAVE = 'masmorra.provador';
export function corpoGuardado() {
  let c = null;
  try { c = localStorage.getItem(CHAVE); } catch { /* sem armazenamento */ }
  return c === 'antigo' ? 'antigo' : 'nu';
}
export function guardarCorpo(c) { try { localStorage.setItem(CHAVE, c); } catch { /* só não lembra */ } }
/** o corpo que um boneco está usando agora (o que vai na rede) */
export const corpoDe = (modelo) => (!modelo.guerreiro ? 'antigo' : modelo.guerreiro.armadura ?? NU);

// osso UAL → osso do guerreiro
export const PARES = {
  root: 'Root', pelvis: 'Hips', spine_01: 'Spine003', spine_02: 'Spine002', spine_03: 'Spine001',
  neck_01: 'Neck', Head: 'Head',
  thigh_l: 'Thighl', calf_l: 'Shinl', foot_l: 'Footl', ball_l: 'ToeL',
  thigh_r: 'Thighr', calf_r: 'Shinr', foot_r: 'Footr', ball_r: 'ToeR',
};
for (const [l, L, cot] of [['l', 'L', 'l'], ['r', 'R', 'r']]) {
  Object.assign(PARES, {
    [`clavicle_${l}`]: `Collar${L}`, [`upperarm_${l}`]: `Arm${L}`, [`lowerarm_${l}`]: `Elbow${L}`, [`hand_${l}`]: `Hand${L}`,
  });
  // os dedos: três falanges em cada um (os nomes do pacote misturam maiúsculas)
  const dedos = { thumb: `Thumb${cot}`, index: `Index${cot}`, middle: `Middle${cot}`, ring: `Ring${L}`, pinky: `Pinky${L}` };
  for (const [u, g] of Object.entries(dedos)) {
    PARES[`${u}_01_${l}`] = g; PARES[`${u}_02_${l}`] = `${g}001`; PARES[`${u}_03_${l}`] = `${g}002`;
  }
}

// o que é peça de armadura (o resto é o corpo): A1_…, A2_…, A3_… e os machados
const ARMADURA = /^A([123])_/;
// a que LUGAR cada peça de armadura pertence, pelo nome (o resto — Armor, ombreiras,
// cinto, bolsas, tanga — é do peito)
const LUGAR_DA_PECA = [['cabeca', /Helmet/i], ['bracos', /Forearm/i], ['pernas', /Boot|Pant|Knee|Thigh/i]];
export const lugarDaPeca = (nome) => LUGAR_DA_PECA.find(([, re]) => re.test(nome))?.[0] ?? 'peito';
// onde o cabelo que cai pelas costas pode POUSAR (penteado.js): o pescoço e o tronco — e a
// armadura do peito, que se soma em `vestir`
// (… e o busto e o top da raça, raca.js: as mechas que caem pela frente pousam neles)
const APOIO = /^(neck|Trapezius|Shoulder|Upper_Torso|Lower_Torso|hips)(_tingido)?$|^(busto|top)_/;
// AS ARMADURAS PINTADAS (casca.js, assets/armaduras.json): o lugar + conjunto que tem
// desenho NÃO usa as peças do pacote, e sim a casca pintada sobre o corpo

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// A MALHA FUNDIDA (03/10/2026). O arquivo traz ~50 peças, cada uma uma SkinnedMesh
// com o próprio Skeleton de 54 ossos: vestido, um guerreiro eram ~30 chamadas de
// desenho (mais as da sombra) e ~30 texturas de ossos refeitas por quadro — e cada
// jogador remoto pagava o mesmo. As peças visíveis viram UMA malha com UM esqueleto:
// todas já estão na mesma ligação (o conversor garante), então basta renumerar os
// ossos de cada uma para a ordem única e juntar. A geometria de cada corpo ('nu',
// 'A1'…) é feita uma vez e DIVIDIDA por todos os guerreiros (não se descarta).
// Umas peças têm COR POR VÉRTICE e o GLTFLoader dá a elas um material à parte (o
// mesmo, com `vertexColors`): as outras ganham cor branca — o mesmo que não ter —
// e todas vão no material com cor de vértice.
const fundidas = new Map();
/** Esquece as malhas fundidas (o editor de armaduras, depois de mudar um desenho). */
export function esquecerFundidas() { for (const g of fundidas.values()) { g?.dispose(); for (const f of g?.userData.pinturas ?? []) f.geometry.dispose(); for (const p of g?.userData.palpebras ?? []) p.dispose(); g?.userData.cilios?.dispose(); } fundidas.clear(); }

// OS PLANOS DO ROSTO (20/10/2026): o rosto do modelo tem a normal POR FACE — cada triângulo na sua
// luz, e os vizinhos quase no mesmo plano saíam cada um num tom (o "quadriculado"; os puxões da
// modelagem pioram). Os vizinhos que cabem num plano (até `PLANO` graus do primeiro do grupo e da
// média dele) ganham UMA normal, a média pela área: o rosto lê como poucas faces grandes, e nenhum
// ponto se mexe (raça, modelagem, cortes e criados valem igual). Grupos crescem a partir dos maiores
// triângulos. `faixas`: os vértices das peças do rosto; `extrasDe`: os triângulos CRIADOS (do fim da
// malha) entram quando dois cantos deles são pontos do rosto. (O pescoço vai junto.)
export const PLANO = 20;
export function planosDoRosto(geo, faixas, extrasDe = null, graus = PLANO) {
  const P = geo.attributes.position.array, nor = geo.attributes.normal;
  if (!nor || geo.index || !faixas?.length) return;
  const chave = (v) => `${Math.round(P[v * 3] * 500)},${Math.round(P[v * 3 + 1] * 500)},${Math.round(P[v * 3 + 2] * 500)}`;
  const tris = [], doRosto = new Set();
  for (const [de, ate] of faixas) for (let v = de; v + 2 < ate; v += 3) { tris.push(v); for (let e = 0; e < 3; e++) doRosto.add(chave(v + e)); }
  if (extrasDe != null) for (let v = extrasDe; v + 2 < P.length / 3; v += 3) if ([0, 1, 2].filter((e) => doRosto.has(chave(v + e))).length >= 2) tris.push(v);
  const n = tris.length, N = new Float32Array(n * 3), area = new Float32Array(n);
  for (let t = 0; t < n; t++) {
    const v = tris[t] * 3, ux = P[v + 3] - P[v], uy = P[v + 4] - P[v + 1], uz = P[v + 5] - P[v + 2], wx = P[v + 6] - P[v], wy = P[v + 7] - P[v + 1], wz = P[v + 8] - P[v + 2];
    const x = uy * wz - uz * wy, y = uz * wx - ux * wz, z = ux * wy - uy * wx, l = Math.hypot(x, y, z);
    if (l < 1e-9) continue;   // (o triângulo cortado — os cantos no mesmo ponto — fica como está)
    area[t] = l / 2; N[t * 3] = x / l; N[t * 3 + 1] = y / l; N[t * 3 + 2] = z / l;
  }
  // os vizinhos: os triângulos que dividem uma aresta (pelos pontos, que se repetem a cada triângulo)
  const arestas = new Map(), viz = Array.from({ length: n }, () => []);
  for (let t = 0; t < n; t++) {
    const k = [0, 1, 2].map((e) => chave(tris[t] + e));
    for (let e = 0; e < 3; e++) {
      const a = k[e], b = k[(e + 1) % 3], ab = a < b ? `${a}|${b}` : `${b}|${a}`, l = arestas.get(ab);
      if (!l) { arestas.set(ab, [t]); continue; }
      for (const o of l) { viz[t].push(o); viz[o].push(t); }
      l.push(t);
    }
  }
  const lim = Math.cos((graus * Math.PI) / 180), grupo = new Uint8Array(n), fila = [];
  const cos = (o, x, y, z) => N[o * 3] * x + N[o * 3 + 1] * y + N[o * 3 + 2] * z;
  for (const s of [...tris.keys()].sort((a, b) => area[b] - area[a])) {
    if (grupo[s] || !area[s]) continue;
    grupo[s] = 1;
    const membros = [s];
    let sx = N[s * 3] * area[s], sy = N[s * 3 + 1] * area[s], sz = N[s * 3 + 2] * area[s];
    fila.push(s);
    while (fila.length) {
      for (const o of viz[fila.pop()]) {
        if (grupo[o] || !area[o]) continue;
        const l = Math.hypot(sx, sy, sz);
        if (cos(o, N[s * 3], N[s * 3 + 1], N[s * 3 + 2]) < lim || cos(o, sx / l, sy / l, sz / l) < lim) continue;
        grupo[o] = 1; membros.push(o); fila.push(o);
        sx += N[o * 3] * area[o]; sy += N[o * 3 + 1] * area[o]; sz += N[o * 3 + 2] * area[o];
      }
    }
    const l = Math.hypot(sx, sy, sz);
    for (const t of membros) for (let e = 0; e < 3; e++) nor.setXYZ(tris[t] + e, sx / l, sy / l, sz / l);
  }
  nor.needsUpdate = true;
}

// (`boca`:a folha dos lábios com batom — boca.js —, pintada como as da modelagem, mesmo no corpo sem edição)
function geometriaFundida(chave, pecas, ordem, raca = null, inversos = null, elmo = false, penteado = null, edicoes = null, boca = null, corOlhos = null) {
  if (fundidas.has(chave)) return fundidas.get(chave);
  const comCor = pecas.some((p) => p.geometry.attributes.color);
  const geos = pecas.map((p) => {
    const g = p.geometry.clone();
    for (const nome of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'color'].includes(nome)) g.deleteAttribute(nome);
    if (comCor && !g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    g.morphAttributes = {};
    if (raca) moldarPeca(g, p.name, raca, elmo);   // (o que a raça muda NA PEÇA: as orelhas, a arcada, o queixo)
    // o osso i DESTA peça → o índice dele na ordem única
    const troca = p.skeleton.bones.map((b) => ordem.indexOf(b.name));
    const si = g.attributes.skinIndex, novo = new Uint16Array(si.count * 4);
    for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) novo[i * 4 + k] = Math.max(0, troca[si.getComponent(i, k)]);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(novo, 4));
    return g;
  });
  const todasComIndice = geos.every((g) => g.index), nenhuma = geos.every((g) => !g.index);
  const lista = (todasComIndice && !penteado) || nenhuma ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g));
  // O PENTEADO, a BARBA e as SOBRANCELHAS (penteado.js): desenhados aqui, sobre o corpo que
  // se está fundindo (o que cai pousa nas costas, no peito e na armadura). Vêm JÁ com as
  // proporções da raça e sem índice: entram por último, e o `deformar` para antes deles
  let doCorpo = 0;
  for (const g of lista) doCorpo += g.attributes.position.count;
  const cabelo = penteado && inversos ? geometriaDoPenteado({
    ...penteado, ordem, deformador: deformadorDe(raca, ordem, inversos, pecas[0].bindMatrix), escala: proporcoesDe(raca).cabeca, rosto: rostoDaRaca(raca), largo: largoDoQueixo(raca), modelo: lista[0], mapa: pecas[0].material?.map,
  }) : null;
  let geo = (cabelo && mergeGeometries([...lista, cabelo])) || (mergeGeometries(lista) ?? null);
  // A MODELAGEM (modelagem.js), só quando o corpo tem edição (ou a aba Modelo do editor está
  // aberta): de onde veio cada vértice (`origem`) e onde ele estava no MODELO, antes da raça
  // (`antes`: é onde o pincel guarda o centro), e as juntas no espaço da malha (os pivôs). A BOCA
  // pintada também precisa disso (sem edição, a malha continua bit a bit a de sempre)
  const comModelo = geo && (edicoes || modelagemAberta() || boca) ? { ordem } : null;
  if (comModelo) {
    const n = geo.attributes.position.count, origem = new Uint8Array(n), antes = new Float32Array(n * 3);
    let k = 0;
    const pedaco = (P, o, de = 0, ate = P.length / 3) => { antes.set(P.subarray(de * 3, ate * 3), k * 3); origem.fill(o, k, k + ate - de); k += ate - de; };
    const inicio = pecas.map((p, i) => { const de = k; pedaco((lista[i] === geos[i] ? p.geometry : p.geometry.toNonIndexed()).attributes.position.array, ORIGENS.indexOf(origemDaPeca(p.name))); return de; });
    // (o couro do bojo segue a pele do seio: raca.js — cada vértice dele, o vértice da pele de onde saiu)
    const top = pecas.findIndex((p) => p.geometry.userData.segue), pele = pecas.findIndex((p) => /^busto_/.test(p.name));
    if (top >= 0 && pele >= 0) {
      comModelo.segue = new Int32Array(n).fill(-1);
      pecas[top].geometry.userData.segue.forEach((j, i) => { if (j >= 0) comModelo.segue[inicio[top] + i] = inicio[pele] + j; });
      comModelo.folgaDoTop = pecas[top].geometry.userData.folga;
    }
    if (cabelo) for (const nome of ['cabelo', 'barba', 'sobrancelhas']) pedaco(cabelo.attributes.position.array, ORIGENS.indexOf(nome), ...cabelo.userData.partes[nome]);
    const volta = pecas[0].bindMatrix.clone().invert(), m = new THREE.Matrix4();
    // (a pele do peito que o seio cobre: os puxões feitos nela não fazem nada — raca.js `sobOBustoDe`)
    comModelo.sobOBusto = sobOBustoDe(raca);
    Object.assign(comModelo, { origem, antes, juntas: new Map(inversos ? ordem.map((nome, i) => [nome, new THREE.Vector3().setFromMatrixPosition(m.copy(inversos[i]).invert()).applyMatrix4(volta)]) : []) });
  }
  for (const g of geos) g.dispose();
  cabelo?.dispose();
  // a RAÇA: as proporções dela na malha (raca.js), uma vez por corpo
  if (geo && raca) deformar(geo, raca, ordem, inversos, pecas[0].bindMatrix, doCorpo);
  // … e as EDIÇÕES do corpo, por cima (a aba guarda também a malha de antes delas: `base`)
  if (comModelo) {
    // (a malha antes das edições: a aba Modelo refaz a vista dela, e a pintura projeta nela — pintura.js)
    comModelo.base = geo.attributes.position.array.slice();
    if (modelagemAberta()) geo.userData.modelagem = comModelo;
    aplicarModelagem(geo, edicoes, comModelo);
    // (os triângulos CRIADOS entram no fim: outra geometria, com o ctx crescido junto)
    geo = acrescentarTriangulos(geo, comModelo);
  }
  // OS PLANOS DO ROSTO (acima), no rosto como ficou — antes das folhas, que tomam a luz da pele de baixo
  if (geo && !geo.index) {
    const rosto = [];
    let de = 0;
    lista.forEach((g, i) => { const n = g.attributes.position.count; if (/^(Face|head|neck)(_tingido)?$/.test(pecas[i].name)) rosto.push([de, de + n]); de += n; });
    planosDoRosto(geo, rosto, comModelo?.novosDe);
    geo.userData.rosto = rosto;
    if (comModelo) comModelo.rosto = rosto;   // (a aba Modelo do editor refaz os planos na vista)
  }
  // … e as LUZES escolhidas no editor (modelagem.js `aplicarLuzes`: o triângulo com a luz de outro), por cima dos planos
  if (comModelo && edicoes?.luzes?.length) aplicarLuzes(geo, edicoes.luzes, comModelo);
  // (o olho LISO com uma luz só em cada olho — cilios.js `alisarOlhos`: as facetas dele saíam claras e escuras)
  if (comModelo?.origem && edicoes?.olhosLisos) alisarOlhos(geo, comModelo.origem);
  if (comModelo) {
    // … e as FOLHAS da pintura (pintura.js), sobre o corpo como ficou: uma malha cada, presa aos mesmos ossos
    // (a da BOCA por último: os lábios por cima de qualquer pintura do rosto)
    const folhas = [...(edicoes?.pinturas ?? []), ...(boca ? [boca] : [])];
    if (folhas.length) geo.userData.pinturas = folhas.map((folha) => ({ folha, geometry: geometriaDaFolha(folha, geo, comModelo) })).filter((f) => f.geometry);
  }
  // AS PÁLPEBRAS (piscada.js), sobre o olho como ele ficou (a raça, a modelagem): a tampa da frente
  // da peça dos olhos, na cor de um ponto de pele da cabeça
  if (geo && !geo.index) {
    const io = pecas.findIndex((p) => /^Eyes(_tingido)?$/.test(p.name)), ic = pecas.findIndex((p) => /^head(_tingido)?$/.test(p.name));
    if (io >= 0 && ic >= 0 && !pecas[io].geometry.index) {
      const faixa = (i) => { let de = 0; for (let k = 0; k < i; k++) de += lista[k].attributes.position.count; return { de, n: lista[i].attributes.position.count }; };
      const cabeca = faixa(ic), uv = geo.attributes.uv;
      let pele = -1;
      for (let i = cabeca.de; i < cabeca.de + cabeca.n && pele < 0; i++) if (naPele(uv.getX(i), uv.getY(i))) pele = i;
      geo.userData.palpebras = geometriasDasPalpebras(geo, faixa(io), cascaDoOlho(pecas[io].geometry), pele);
    }
  }
  // OS CÍLIOS-DELINEADO e a ÍRIS (cilios.js, `cilios` e `iris` no corpo): sobre o olho como ele ficou
  if (geo && !geo.index && (edicoes?.cilios || edicoes?.iris) && comModelo?.origem) {
    const io = pecas.findIndex((p) => /^Eyes(_tingido)?$/.test(p.name));
    if (io >= 0) geo.userData.cilios = geometriaDosCilios(geo, comModelo.origem, { cilios: edicoes.cilios, iris: edicoes.iris }, { escuro: uvEscura(pecas[io]), claro: uvClara(pecas[io]) }, corOlhos ?? undefined);
  }
  fundidas.set(chave, geo);
  return geo;
}

export class CorpoGuerreiro {
  constructor(modelo, armadura = null) {
    this.modelo = modelo;
    const cena = cloneSkinned(Assets.guerreiro);
    this.cena = cena;
    const mat = [];
    this.pecas = [];    // as SkinnedMesh do arquivo (só servem de matéria-prima para a fundida)
    this.rigidas = [];  // os machados do pacote, presos às mãos: nunca aparecem
    cena.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false; o.castShadow = true; o.receiveShadow = true;
      if (!mat.includes(o.material)) mat.push(o.material);
      (o.isSkinnedMesh ? this.pecas : this.rigidas).push(o);
    });
    // um material por boneco, para o clarão de dano não acender os outros
    const proprio = new Map(mat.map((m) => [m, m.clone()]));
    cena.traverse((o) => { if (o.isMesh) o.material = proprio.get(o.material); });
    this.materiais = [...proprio.values()];
    for (const m of this.materiais) {
      m.roughness = 0.85; m.metalness = 0;
      // o céu de agora (ceu.js), de leve: a armadura e o corpo tomam o tom do dia/noite
      if (Gear.env) { m.envMap = Gear.env; m.envMapIntensity = 0.5; }
      modelo.flashMats.push(m); modelo.baseEmissive.push(m.emissive.clone());
    }
    // o esqueleto ÚNICO da malha fundida: os ossos da cena, na ordem dela, com o
    // inverso de ligação de qualquer peça que use o osso (são todos iguais)
    const ossos = [];
    cena.traverse((o) => { if (o.isBone) ossos.push(o); });
    this.ordem = ossos.map((b) => b.name);
    const inversos = ossos.map((b) => {
      for (const p of this.pecas) { const i = p.skeleton.bones.findIndex((x) => x.name === b.name); if (i >= 0) return p.skeleton.boneInverses[i].clone(); }
      return new THREE.Matrix4();
    });
    this.esqueleto = new THREE.Skeleton(ossos, inversos);
    this.inversos = inversos;
    // (a raça nos ossos ainda não: ela entra depois das medidas da pose T)
    this.vestir(armadura);

    // o manequim UAL some (corpo e traje), mas continua animando
    // — menos as ARMAS: trocado com o jogo rodando (o provador), a arma ainda está
    // na mão do UAL e vai para a do guerreiro logo depois (`usarGuerreiro`); escondê-la
    // aqui a deixava invisível na mão nova
    this.escondidos = [];
    const armas = new Set();
    for (const slot of [modelo.slotR, modelo.slotL, modelo.slotCostas]) slot?.traverse((o) => armas.add(o));
    modelo.scene.traverse((o) => { if (o.isMesh && o.visible && !armas.has(o)) { o.visible = false; this.escondidos.push(o); } });

    // a pose T dos dois, no espaço do pivot. A do UAL vem do manequim-FONTE
    // (Assets.baseScene, que nunca anima): o boneco pode estar no meio de um golpe
    // quando o provador troca o corpo.
    modelo.root.updateMatrixWorld(true);
    modelo.pivot.add(cena);
    const ual = modelo.scene;
    const fonte = Assets.baseScene;
    fonte.updateMatrixWorld(true);
    const fonteInv = new THREE.Matrix4().copy(fonte.matrixWorld).invert();
    ual.updateMatrix();
    const pivoInv = new THREE.Matrix4().copy(modelo.pivot.matrixWorld).invert();
    const noPivo = (o) => { o.updateWorldMatrix(true, false); return new THREE.Matrix4().multiplyMatrices(pivoInv, o.matrixWorld); };
    const naPoseT = (nome) => new THREE.Matrix4().multiplyMatrices(ual.matrix, fonteInv).multiply(fonte.getObjectByName(nome).matrixWorld);
    // a escala: o quadril do guerreiro na altura do quadril UAL (os pés no chão)
    const hipU = new THREE.Vector3().setFromMatrixPosition(naPoseT('pelvis'));
    const hipG = new THREE.Vector3().setFromMatrixPosition(noPivo(cena.getObjectByName('Hips')));
    cena.scale.setScalar(hipU.y / hipG.y);
    cena.updateMatrixWorld(true);

    this.ossos = [];   // na ordem da hierarquia (pai antes do filho)
    this.indice = new Map();
    cena.traverse((o) => {
      if (!o.isBone) return;
      const par = Object.entries(PARES).find(([, g]) => g === o.name)?.[0];
      const u = par ? ual.getObjectByName(par) : null;
      const e = {
        osso: o, pai: this.indice.get(o.parent) ?? null, u,
        restoLocal: o.quaternion.clone(),
        tG: new THREE.Quaternion(), tUinv: null, agora: new THREE.Quaternion(),
        mG: noPivo(o), mU: u ? naPoseT(par) : null,   // as matrizes inteiras da pose T (para a pegada)
      };
      e.mG.decompose(_v, e.tG, _s);
      if (u) { e.mU.decompose(_v, _q, _s); e.tUinv = _q.clone().invert(); }
      this.indice.set(o, e);
      this.ossos.push(e);
    });
    this.calibrarDedos();
    this.raizQ = new THREE.Quaternion();   // a orientação da cena do guerreiro no pivot
    this.hips = this.indice.get(cena.getObjectByName('Hips'));
    this.hipRestoU = hipU.clone();
    // o quadril do guerreiro na pose T, no espaço da cena DELE (a cena pode andar no pivot)
    this.hipRestoG = cena.worldToLocal(cena.getObjectByName('Hips').getWorldPosition(new THREE.Vector3()));
    this.proporcao = 1 / cena.scale.x;   // o deslocamento do UAL (em metros do pivot) na escala da cena
    this.pivoInv = new THREE.Matrix4();
    // A RAÇA NOS OSSOS (raca.js): a escala da cena sem raça, e os ossos que se afastam
    // para o lado (os braços com os ombros, as coxas com o quadril) — o lugar de cada um
    // na pose T e a direção "para o lado" vista do pai dele
    this.escalaBase = cena.scale.x;
    this.altura = 1;
    this.maos = 1;   // a escala do osso de cada mão (os dedos herdam)
    this.ossosDasMaos = ['HandL', 'HandR'].map((n) => cena.getObjectByName(n));
    const ladoCena = cena.getObjectByName('ArmL').getWorldPosition(new THREE.Vector3()).sub(cena.getObjectByName('ArmR').getWorldPosition(new THREE.Vector3())).normalize();
    this.afastados = [['ArmL', 'ombros'], ['ArmR', 'ombros'], ['Thighl', 'quadril'], ['Thighr', 'quadril']].map(([nome, chave]) => {
      const osso = cena.getObjectByName(nome);
      const lado = ladoCena.clone().applyQuaternion(osso.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
      return { osso, chave, resto: osso.position.clone(), lado };
    });
    this.aplicarRaca();
  }

  // OS DEDOS (12/10/2026). Na pose do arquivo os dedos do guerreiro NÃO estão retos como
  // os do manequim: vêm ~40° dobrados (e a palma, virada de outro jeito). Copiar só "o
  // quanto o osso girou desde a pose T" dobrava por cima do que já estava dobrado — a mão
  // em garra, os dedos tortos em toda animação. Para os dedos a conta é outra: o dedo do
  // guerreiro fica, EM RELAÇÃO À PALMA DELE, como o do manequim está em relação à dele.
  //  - `R`: o giro que leva a palma do manequim à do guerreiro na pose T (a palma = o
  //    pulso e as bases do indicador, do médio e do mínimo);
  //  - `c`: o giro que põe o osso do dedo, na pose T, na direção em que o do manequim
  //    está (visto pela palma) — o "dedo reto" do guerreiro;
  //  - a cada quadro: dedo = Dmão · R · Dmão⁻¹ · Ddedo · R⁻¹ · c · (dedo na pose T).
  calibrarDedos() {
    const porU = new Map(this.ossos.filter((e) => e.u).map((e) => [e.u.name, e]));
    const P = (m) => new THREE.Vector3().setFromMatrixPosition(m);
    const palma = (h, i, m, k) => {
      const x = m.clone().sub(h).normalize(), n = i.clone().sub(h).cross(k.clone().sub(h)).normalize();
      const y = new THREE.Vector3().crossVectors(n, x).normalize();
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
    };
    for (const l of ['l', 'r']) {
      const mao = porU.get(`hand_${l}`), bases = ['index', 'middle', 'pinky'].map((d) => porU.get(`${d}_01_${l}`));
      if (!mao || bases.some((b) => !b)) continue;
      const R = palma(P(mao.mG), ...bases.map((b) => P(b.mG))).multiply(palma(P(mao.mU), ...bases.map((b) => P(b.mU))).invert());
      const Rinv = R.clone().invert();
      mao.D = new THREE.Quaternion();
      for (const d of ['thumb', 'index', 'middle', 'ring', 'pinky']) for (const f of [1, 2, 3]) {
        const e = porU.get(`${d}_0${f}_${l}`);
        // a direção do osso: dele ao seguinte (a ponta usa a do osso anterior até ela)
        const [de, ate] = f < 3 ? [e, porU.get(`${d}_0${f + 1}_${l}`)] : [porU.get(`${d}_02_${l}`), e];
        if (!e || !de || !ate) continue;
        const dG = P(ate.mG).sub(P(de.mG)).normalize(), dU = P(ate.mU).sub(P(de.mU)).normalize().applyQuaternion(R);
        const c = new THREE.Quaternion().setFromUnitVectors(dG, dU);
        e.dedo = { mao, R, K: Rinv.clone().multiply(c).multiply(e.tG) };
      }
    }
  }

  /** a raça do código vestido, no corpo do sexo dele (null = o humano do modelo) */
  get raca() { const a = lerAparencia(this.armadura?.split(':')[1]); return racaDe(a.raca, a.sexo); }

  // A raça nos ossos: a altura (a cena inteira, os pés no chão), os ossos afastados e o
  // tamanho das mãos. Devolve se a ALTURA ou as MÃOS mudaram — a pegada das armas depende
  // delas (`usarGuerreiro` as repõe).
  aplicarRaca() {
    if (!this.afastados) return false;   // (no construtor, antes das medidas)
    const p = proporcoesDe(this.raca), antes = this.altura * 1000 + this.maos;
    this.altura = p.altura;
    this.maos = p.maos;
    for (const o of this.ossosDasMaos) o?.scale.setScalar(p.maos);
    this.cena.scale.setScalar(this.escalaBase * p.altura);
    this.proporcao = 1 / this.cena.scale.x;
    for (const a of this.afastados) a.osso.position.copy(a.resto).addScaledVector(a.lado, a.resto.dot(a.lado) * (p[a.chave] - 1));
    return antes !== this.altura * 1000 + this.maos;
  }

  // a armadura dele: o CÓDIGO (um dígito por lugar, ver `NU`, e a aparência depois de ':');
  // null = sem armadura.
  // Cada peça do arquivo entra se o lugar dela pede o conjunto dela. Os machados do
  // pacote nunca aparecem (as armas são as do jogo).
  vestir(armadura) {
    armadura = armaduraDe(armadura ?? NU) || NU;
    this.armadura = armadura;
    this.alturaMudou = this.aplicarRaca();
    const aparencia = armadura.split(':')[1] ?? APARENCIA_PADRAO;
    for (const o of this.rigidas) o.visible = false;
    const desenho = (lugar, conj) => desenhoDe(Assets.armaduras, lugar, conj);
    const usadas = this.pecas.filter((o) => {
      // (o cabelo solto do modelo saiu do jogo, e a barba e as sobrancelhas dele são só a
      // matéria das do jogo: o PENTEADO, a BARBA e as SOBRANCELHAS desenhados, abaixo; o COLAR
      // — `Chain`, a corrente de plaquinha de soldado, 170 triângulos — saiu de todos os corpos, 19/10/2026)
      if (o.name === 'Hair' || o.name === 'Beard' || o.name === 'Eye_Brows' || o.name === 'Chain') return false;
      const a = o.name.match(ARMADURA);
      if (!a) return true;
      const lugar = lugarDaPeca(o.name);
      return armadura[LUGARES.indexOf(lugar)] === a[1] && !desenho(lugar, a[1]);
    });
    // há ELMO? (uma peça de cabeça do pacote, ou um desenho nosso para a cabeça — o dígito
    // sozinho não diz: o couro não tem elmo.) Com ele, a raça não estica as orelhas
    const elmo = usadas.some((o) => ARMADURA.test(o.name) && lugarDaPeca(o.name) === 'cabeca') || !!desenho('cabeca', armadura[0]);
    // os nossos desenhos entram como mais peças da malha fundida
    LUGARES.forEach((lugar, i) => { const d = desenho(lugar, armadura[i]); if (d) usadas.push(...pecasDaCasca(d, this.pecas)); });
    // a APARÊNCIA: as peças de pele e de olhos tingidas
    if (aparenciaValida(aparencia)) for (let i = usadas.length - 1; i >= 0; i--) {
      if (!usadas[i].isSkinnedMesh) continue;
      const t = tingir(usadas[i], aparencia);
      if (t) usadas[i] = t; else usadas.splice(i, 1);
    }
    // o OLHO DO MODELO apagado debaixo de uma folha pintada (pintura.js: o desenho velho aparecia nas bordas)
    const lida = lerAparencia(aparencia), edicoes = edicoesDoCorpo(lida.raca, lida.sexo);
    // (… ou SEM o olho do modelo — `semOlhos` no corpo, 24/10/2026, pedido do dono: era mal feito. A peça sai
    // inteira (o rosto debaixo dela é fechado) e o olho é a IMAGEM que o dono pôs numa folha; sem a peça não
    // há pálpebra: esse corpo não pisca)
    if (edicoes?.semOlhos) { const i = usadas.findIndex((x) => /^Eyes(_tingido)?$/.test(x.name)); if (i >= 0) usadas.splice(i, 1); }
    // (… ou LISOS — `olhosLisos`, pintura.js: só a plaquinha da frente de cada olho, sem textura, para o dono moldar)
    else if (edicoes?.olhosLisos) { const i = usadas.findIndex((x) => /^Eyes(_tingido)?$/.test(x.name)); if (i >= 0) usadas[i] = olhosLisos(usadas[i]); }
    else if (edicoes?.pinturas?.some((f) => f.apagaOlhos)) {
      const i = usadas.findIndex((x) => /^Eyes(_tingido)?$/.test(x.name));
      if (i >= 0) usadas.splice(i, 1, ...olhosApagados(usadas[i], usadas.find((x) => /^head(_tingido)?$/.test(x.name))));
    }
    // o que a RAÇA acrescenta (as presas do orc; o busto e o top do corpo feminino — só no
    // peito nu). O que é PELE (o busto) é tingido como ela — DEPOIS das peças do corpo: a
    // razão da cor da pele é uma só, e quem a mede são elas
    if (this.raca) for (const o of pecasDaRaca(this.raca, this.pecas, elmo, armadura[LUGARES.indexOf('peito')] !== '0')) {
      usadas.push(o.pele && aparenciaValida(aparencia) ? tingir(o, aparencia) : o);
      // (o busto é COSTURADO no peito: a pele debaixo dele sai e o buraco fecha até o pé dele — raca.js)
      const i = o.costura ? usadas.findIndex((x) => /^Upper_Torso(_tingido)?$/.test(x.name)) : -1;
      if (i >= 0) usadas[i] = torsoCosturado(usadas[i], o.costura);
    }
    // o PENTEADO, a BARBA e as SOBRANCELHAS (penteado.js): desenhados em código ao fundir o corpo
    const ap = lerAparencia(aparencia), cabelo = penteadoDe(this.raca, ap.cabelo), barba = barbaDe(this.raca, ap.barba), sobrancelha = sobrancelhaDe(this.raca, ap.sobrancelha), doPeito = desenho('peito', armadura[LUGARES.indexOf('peito')]);
    const peca = (nome) => this.pecas.find((o) => o.name === nome);
    const penteado = PENTEADOS[cabelo]?.formas || BARBAS[barba]?.formas || SOBRANCELHAS[sobrancelha]?.formas ? {
      id: cabelo, barba, sobrancelha, cor: CABELOS[ap.cor][1], elmo, pecaDaBarba: peca('Beard'), pecaDaSobrancelha: peca('Eye_Brows'), pecaDoRosto: peca('Face'), pecaDaCabeca: peca('head'),
      apoio: usadas.filter((o) => APOIO.test(o.name) || (ARMADURA.test(o.name) && lugarDaPeca(o.name) === 'peito') || (doPeito && o.name.startsWith(`casca_${doPeito.id}_`))),
    } : null;
    // o material: o com cor de vértice, se alguma peça tem (ver geometriaFundida)
    // (uma peça TINGIDA tem cor mas guarda o material da original, que pode ser o sem cor
    // de vértice — nu, só com a aparência, a cor não aparecia: vale o material com cor)
    const comCor = usadas.some((o) => o.geometry.attributes.color);
    const material = (comCor && this.materiais.find((m) => m.vertexColors)) || (usadas.find((o) => o.geometry.attributes.color) ?? usadas[0])?.material;
    // atributos que não casam: o mergeGeometries devolve null, e as peças ficam soltas
    // (o BATOM — boca.js: os lábios, uma folha pintada no rosto; 0 = sem, nada muda)
    const boca = aparenciaValida(aparencia) ? folhaDaBoca(ap.batom, ap.sexo === 1 && temFeminino(ap.raca)) : null;
    // (a cor da ÍRIS desenhada em malha — cilios.js: a dos olhos da raça, ou a escolhida)
    const corOlhos = this.raca?.olhos ?? OLHOS[ap.olhos]?.[1] ?? null;
    const geo = material ? geometriaFundida(armadura, usadas, this.ordem, this.raca, this.inversos, elmo, penteado, edicoes, boca, corOlhos) : null;
    for (const o of this.pecas) o.visible = !geo && usadas.includes(o);   // (sem a fundida, os desenhos, a aparência e a raça não aparecem)
    if (!geo) { if (this.fundida) this.fundida.visible = false; if (this.palpebras) this.palpebras.visible = false; if (this.cilios) this.cilios.visible = false; return; }
    if (!this.fundida) {
      this.fundida = new THREE.SkinnedMesh(geo, material);
      this.fundida.name = 'guerreiro-fundido';
      this.fundida.frustumCulled = false; this.fundida.castShadow = true; this.fundida.receiveShadow = true;
      this.cena.add(this.fundida);
      this.fundida.bind(this.esqueleto, usadas[0].bindMatrix.clone());
    } else { this.fundida.geometry = geo; this.fundida.material = material; }
    this.fundida.visible = true;
    this.vestirPinturas(geo, material, ap);
    this.vestirPalpebras(geo, material);
    this.vestirCilios(geo, material);
  }

  // OS CÍLIOS-DELINEADO (cilios.js): uma malha a mais, presa ao mesmo esqueleto, com o material do corpo
  // (a cor é um texel escuro da paleta) — o material de agora vem a cada quadro, no `piscar`
  vestirCilios(geo, material) {
    const g = geo.userData.cilios ?? null;
    if (!g) { if (this.cilios) this.cilios.visible = false; return; }
    if (!this.cilios) {
      const m = new THREE.SkinnedMesh(g, material);
      m.name = 'cilios'; m.frustumCulled = false; m.receiveShadow = true;
      this.cena.add(m);
      m.bind(this.esqueleto, this.fundida.bindMatrix);
      this.cilios = m;
    } else { this.cilios.geometry = g; this.cilios.material = material; }
    this.cilios.visible = true;
  }

  // AS PÁLPEBRAS (piscada.js): uma malha a mais, presa ao mesmo esqueleto e com o material do
  // corpo (o mesmo shader), que só é desenhada enquanto o olho pisca (`piscar`)
  vestirPalpebras(geo, material) {
    const etapas = geo.userData.palpebras ?? null;
    this.etapasDaPiscada = etapas;
    if (this.palpebras) this.palpebras.visible = false;
    if (!etapas || this.palpebras) return;
    const m = new THREE.SkinnedMesh(etapas[etapas.length - 1], material);
    m.name = 'palpebras'; m.frustumCulled = false; m.receiveShadow = true; m.visible = false;
    this.cena.add(m);
    m.bind(this.esqueleto, this.fundida.bindMatrix);
    this.palpebras = m;
    this.piscaEm = 0.5 + Math.random() * 4;   // (cada um no seu tempo)
  }

  // A PISCADA: de tempos em tempos a pálpebra desce, fica e sobe (os tempos: `PISCADA`), um
  // degrau por geometria. `fechados`: os olhos fecham e ficam (morto). A cada quadro, depois
  // do `seguir` (character.js)
  piscar(dt, fechados = false) {
    const m = this.palpebras, etapas = this.etapasDaPiscada, mat = this.fundida?.material;
    // (os cílios com o material de agora — o do jogador remoto é uma cópia, o do fantasma é translúcido — e só com o corpo)
    if (this.cilios) { this.cilios.material = mat ?? this.cilios.material; this.cilios.visible = !!this.fundida?.visible && !!this.fundida.geometry.userData.cilios; }
    if (!m) return;
    // (o fantasma, translúcido, não pisca: a pálpebra sairia translúcida por cima do olho)
    if (!etapas || !this.fundida.visible || mat.transparent) { m.visible = false; return; }
    const T = PISCADA;
    if (fechados) this.tPisca = Math.min((this.tPisca ?? 0) + dt, T.fecha);
    else if (this.tPisca != null) { this.tPisca += dt; if (this.tPisca >= T.fecha + T.parada + T.abre) { this.tPisca = null; this.piscaEm = proximaPiscada(); } }
    else if ((this.piscaEm -= dt) <= 0) this.tPisca = 0;
    const t = this.tPisca;
    const f = t == null ? 0 : t < T.fecha ? t / T.fecha : t < T.fecha + T.parada ? 1 : 1 - (t - T.fecha - T.parada) / T.abre;
    const k = Math.min(etapas.length, Math.ceil(f * etapas.length - 1e-6));
    if (k <= 0) { m.visible = false; return; }
    // (o material de AGORA do corpo: o jogador remoto troca o dele por uma cópia — remoto.js)
    m.geometry = etapas[k - 1]; m.material = mat; m.visible = true;
  }

  // A PINTURA (pintura.js): uma malha por folha do corpo, por cima da pele, presa ao mesmo
  // esqueleto; a imagem nas cores DESTE personagem (as tintas "pele", "olhos" e "cabelo")
  vestirPinturas(geo, material, ap) {
    this.pinturas ??= [];
    const folhas = geo.userData.pinturas ?? [], raca = this.raca;
    const cores = { pele: raca?.pele ?? PELES[ap.pele][1] ?? CORES_DO_MODELO.pele, olhos: raca?.olhos ?? OLHOS[ap.olhos][1] ?? CORES_DO_MODELO.olhos, cabelo: CABELOS[ap.cor][1] ?? CORES_DO_MODELO.cabelo };
    folhas.forEach(({ folha, geometry }, i) => {
      const map = texturaDaFolha(folha, cores, Assets.pinturas);
      let m = this.pinturas[i];
      if (!map) { if (m) m.visible = false; return; }
      if (!m) {
        m = new THREE.SkinnedMesh(geometry, materialDaPintura(material, map));
        m.name = 'pintura'; m.frustumCulled = false; m.receiveShadow = true;
        this.cena.add(m);
        m.bind(this.esqueleto, this.fundida.bindMatrix);
        this.pinturas.push(m);
      } else { m.geometry = geometry; m.material.map = map; }
      m.visible = true;
    });
    for (let i = folhas.length; i < this.pinturas.length; i++) this.pinturas[i].visible = false;
  }

  // devolve o boneco antigo, como estava
  remover() {
    const { modelo } = this;
    this.cena.removeFromParent();
    for (const o of this.escondidos) o.visible = true;
    for (const m of this.materiais) {
      const i = modelo.flashMats.indexOf(m);
      if (i >= 0) { modelo.flashMats.splice(i, 1); modelo.baseEmissive.splice(i, 1); }
    }
  }

  // depois do mixer: o esqueleto do guerreiro copia o do UAL
  seguir() {
    const { modelo } = this;
    modelo.pivot.updateWorldMatrix(true, false);
    modelo.scene.updateMatrixWorld(true);
    this.pivoInv.copy(modelo.pivot.matrixWorld).invert();
    for (const e of this.ossos) {
      const paiQ = e.pai ? e.pai.agora : this.raizQ;
      if (e.u) {
        // D = (UAL agora) · (UAL na pose T)⁻¹, e o guerreiro = D · (guerreiro na pose T)
        _m.multiplyMatrices(this.pivoInv, e.u.matrixWorld).decompose(_v, _q, _s);
        _q.multiply(e.tUinv);   // D: o giro desde a pose T
        if (e.D) e.D.copy(_q);  // (a mão guarda o dela: os dedos são medidos pela palma)
        if (e.dedo) e.agora.copy(e.dedo.mao.D).multiply(e.dedo.R).multiply(_q2.copy(e.dedo.mao.D).invert()).multiply(_q).multiply(e.dedo.K);
        else e.agora.copy(_q).multiply(e.tG);
        e.osso.quaternion.copy(paiQ).invert().multiply(e.agora);
      } else {
        e.agora.copy(paiQ).multiply(e.restoLocal);
      }
    }
    // o quadril: o deslocamento do UAL desde a pose T, no espaço do pai dele
    const h = this.hips;
    if (h?.u) {
      _v.setFromMatrixPosition(_m.multiplyMatrices(this.pivoInv, h.u.matrixWorld)).sub(this.hipRestoU)
        .multiplyScalar(this.proporcao).add(this.hipRestoG);
      const pai = h.osso.parent;
      pai.updateWorldMatrix(true, false);
      _m.copy(this.cena.matrixWorld).invert().multiply(pai.matrixWorld).invert();
      h.osso.position.copy(_v.applyMatrix4(_m));
    }
  }

  // a matriz local de uma arma no osso do guerreiro, a partir da pegada no osso UAL:
  // na pose T, a arma fica em relação à mão do guerreiro como ficava à do UAL
  // (a mesma orientação e o mesmo afastamento, medidos no osso UAL)
  pegada(ossoUal, matrizNoUal) {
    const e = this.indice.get(this.cena.getObjectByName(PARES[ossoUal]));
    const pU = new THREE.Vector3(), qU = new THREE.Quaternion(), sU = new THREE.Vector3();
    e.mU.decompose(pU, qU, sU);
    const uNaMaoG = new THREE.Matrix4().compose(new THREE.Vector3().setFromMatrixPosition(e.mG), qU, sU);
    // (as medidas da pose T são de antes da ALTURA e das MÃOS da raça: a arma fica do
    // tamanho dela)
    const k = 1 / (this.altura * (this.ossosDasMaos.includes(e.osso) ? this.maos : 1));
    const semAltura = new THREE.Matrix4().makeScale(k, k, k);
    return { osso: e.osso, matriz: semAltura.multiply(e.mG.clone().invert()).multiply(uNaMaoG).multiply(matrizNoUal) };
  }
}
