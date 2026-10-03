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

// Os corpos, pelo nome que viaja na rede e fica guardado: 'antigo' = o manequim UAL
export const CORPOS = ['nu', 'A1', 'A2', 'A3', 'antigo'];
const CHAVE = 'masmorra.provador';
/** O corpo escolhido neste navegador (da primeira vez, o guerreiro sem armadura). */
export function corpoGuardado() {
  let c = null;
  try { c = localStorage.getItem(CHAVE); } catch { /* sem armazenamento */ }
  return CORPOS.includes(c) ? c : 'nu';
}
export function guardarCorpo(c) { try { localStorage.setItem(CHAVE, c); } catch { /* só não lembra */ } }
/** nome do corpo → o argumento de `CharacterModel.usarGuerreiro` (false = boneco antigo) */
export const armaduraDe = (c) => (c === 'antigo' ? false : c === 'nu' || !CORPOS.includes(c) ? null : c);
/** o corpo que um boneco está usando agora */
export const corpoDe = (modelo) => (!modelo.guerreiro ? 'antigo' : modelo.guerreiro.armadura ?? 'nu');

// osso UAL → osso do guerreiro
const PARES = {
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

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

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
function geometriaFundida(chave, pecas, ordem) {
  if (fundidas.has(chave)) return fundidas.get(chave);
  const comCor = pecas.some((p) => p.geometry.attributes.color);
  const geos = pecas.map((p) => {
    const g = p.geometry.clone();
    for (const nome of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'skinIndex', 'skinWeight', 'color'].includes(nome)) g.deleteAttribute(nome);
    if (comCor && !g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    g.morphAttributes = {};
    // o osso i DESTA peça → o índice dele na ordem única
    const troca = p.skeleton.bones.map((b) => ordem.indexOf(b.name));
    const si = g.attributes.skinIndex, novo = new Uint16Array(si.count * 4);
    for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) novo[i * 4 + k] = Math.max(0, troca[si.getComponent(i, k)]);
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(novo, 4));
    return g;
  });
  const todasComIndice = geos.every((g) => g.index), nenhuma = geos.every((g) => !g.index);
  const lista = todasComIndice || nenhuma ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const geo = mergeGeometries(lista) ?? null;
  for (const g of geos) g.dispose();
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
    this.raizQ = new THREE.Quaternion();   // a orientação da cena do guerreiro no pivot
    this.hips = this.indice.get(cena.getObjectByName('Hips'));
    this.hipRestoU = hipU.clone();
    // o quadril do guerreiro na pose T, no espaço da cena DELE (a cena pode andar no pivot)
    this.hipRestoG = cena.worldToLocal(cena.getObjectByName('Hips').getWorldPosition(new THREE.Vector3()));
    this.proporcao = 1 / cena.scale.x;   // o deslocamento do UAL (em metros do pivot) na escala da cena
    this.pivoInv = new THREE.Matrix4();
  }

  // a armadura dele: null = sem armadura; 'A1', 'A2' ou 'A3'. Os machados do pacote
  // nunca aparecem (as armas são as do jogo).
  vestir(armadura) {
    this.armadura = armadura;
    for (const o of this.rigidas) o.visible = false;
    const usadas = this.pecas.filter((o) => { const a = o.name.match(ARMADURA); return !a || `A${a[1]}` === armadura; });
    // o material: o com cor de vértice, se alguma peça tem (ver geometriaFundida)
    const material = (usadas.find((o) => o.geometry.attributes.color) ?? usadas[0])?.material;
    // atributos que não casam: o mergeGeometries devolve null, e as peças ficam soltas
    const geo = material ? geometriaFundida(armadura ?? 'nu', usadas, this.ordem) : null;
    for (const o of this.pecas) o.visible = !geo && usadas.includes(o);
    if (!geo) { if (this.fundida) this.fundida.visible = false; return; }
    if (!this.fundida) {
      this.fundida = new THREE.SkinnedMesh(geo, material);
      this.fundida.name = 'guerreiro-fundido';
      this.fundida.frustumCulled = false; this.fundida.castShadow = true; this.fundida.receiveShadow = true;
      this.cena.add(this.fundida);
      this.fundida.bind(this.esqueleto, usadas[0].bindMatrix.clone());
    } else this.fundida.geometry = geo;
    this.fundida.visible = true;
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
        e.agora.copy(_q).multiply(e.tUinv).multiply(e.tG);
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
    return { osso: e.osso, matriz: e.mG.clone().invert().multiply(uNaMaoG).multiply(matrizNoUal) };
  }
}
