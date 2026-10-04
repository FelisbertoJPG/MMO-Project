// Personagem humanoide realista (manequim Quaternius UAL) com trajes e armas presos aos ossos
import * as THREE from 'three';
import { Assets } from './assets.js';
import { buildOutfit, makeWeapon, makeShield } from './gear.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { CorpoGuerreiro } from './guerreiro.js';

// Golpes: tempos em SEGUNDOS do clipe (medidos pela velocidade da ponta da lâmina).
// from/to recortam trechos de clipes longos (combos); hit = janela de dano; arc = abertura do golpe.
export const ATTACKS = {
  slashA: { clip: 'Sword_Regular_A', to: 0.43, hit: [0.18, 0.31], arc: 1.3 },
  slashB: { clip: 'Sword_Regular_B', to: 0.53, hit: [0.19, 0.31], arc: 1.3 },
  slashC: { clip: 'Sword_Regular_C', to: 1.15, hit: [0.58, 0.74], arc: 1.1 },
  overhead: { clip: 'Sword_Attack', to: 0.95, hit: [0.36, 0.52], arc: 0.7 },
  dash: { clip: 'Sword_Dash', to: 0.95, hit: [0.26, 0.4], arc: 0.8 },
  heavy1: { clip: 'Sword_Heavy_Combo', from: 0, to: 0.85, hit: [0.33, 0.62], arc: 1.4 },
  heavy2: { clip: 'Sword_Heavy_Combo', from: 0.8, to: 1.5, hit: [1.1, 1.3], arc: 1.4 },
  heavy3: { clip: 'Sword_Heavy_Combo', from: 1.45, to: 2.25, hit: [1.72, 1.98], arc: 1.4 },
  heavy4: { clip: 'Sword_Heavy_Combo', from: 2.2, to: 3.1, hit: [2.57, 2.72], arc: 1.5 },
  hook: { clip: 'Melee_Hook', to: 0.47, hit: [0.22, 0.29], arc: 1.1 },
  jab: { clip: 'Punch_Jab', to: 0.6, hit: [0.12, 0.22], arc: 0.9 },
  cross: { clip: 'Punch_Cross', to: 0.65, hit: [0.16, 0.25], arc: 0.9 },
  scratch: { clip: 'Zombie_Scratch', to: 1.25, hit: [0.5, 0.66], arc: 1.2 },
  cast: { clip: 'Spell_Simple_Shoot', to: 0.5, hit: [0.06, 0.1], arc: 0 },
  throw: { clip: 'OverhandThrow', to: 1.0, hit: [0.28, 0.32], arc: 0 },
  leap: { clip: 'NinjaJump_Start', to: 0.97, hit: [0.9, 0.97], arc: 3.2 },
  summon: { clip: 'Spell_Simple_Enter', to: 1.2, hit: [0.9, 0.95], arc: 0 },
};

export class CharacterModel {
  constructor({ outfit = 'knight', scale = 1, skinTint = null, hideBody = false, armadura = false } = {}) {
    const { scene, materials } = Assets.character();
    this.scene = scene;
    // Traje montado na pose T (antes de qualquer transformação/animação)
    scene.updateMatrixWorld(true);
    buildOutfit(scene, outfit);
    this.body = [];
    scene.traverse((c) => { if (c.isSkinnedMesh) this.body.push(c); });
    // As dezenas de blocos da armadura viram poucas malhas (uma por tipo de
    // material): mesmo visual, uma fração das chamadas de desenho
    if (this.body[0]) fundirTraje(scene, this.body[0]);
    for (const m of this.body) m.visible = !hideBody;
    if (skinTint) for (const m of materials) m.color.setHex(skinTint);

    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    this.pivot.add(scene);
    scene.scale.setScalar(scale);
    this.scale = scale;
    this.handR = scene.getObjectByName('hand_r');
    this.handL = scene.getObjectByName('hand_l');
    this.lowerArmL = scene.getObjectByName('lowerarm_l');
    this.head = scene.getObjectByName('Head');
    this.materials = [];
    scene.traverse((c) => { if (c.isMesh && c.material && !this.materials.includes(c.material)) this.materials.push(c.material); });
    this.flashMats = [];
    scene.traverse((c) => { if (c.isMesh && c.material?.isMeshStandardMaterial) { c.material = c.material.clone(); this.flashMats.push(c.material); } });
    this.baseEmissive = this.flashMats.map((m) => m.emissive.clone());
    this.mixer = new THREE.AnimationMixer(scene);
    this.actions = {};
    this.current = null; this.currentName = null;
    this.slotR = null; this.slotL = null; this.slotCostas = null;
    // AS DUAS MÃOS (arma de duas mãos): quem anima liga `duasMaos`; o peso entra e sai suave
    this.duasMaos = false;
    this.pesoDuasMaos = 0;
    // o corpo do guerreiro (guerreiro.js): o manequim segue animando, invisível.
    // `armadura` como em `usarGuerreiro` (false = só o manequim, o padrão dos inimigos)
    this.guerreiro = armadura !== false && Assets.guerreiro ? new CorpoGuerreiro(this, armadura) : null;
  }

  // O PROVADOR (provador.js) troca o corpo com o jogo rodando: `false` = o boneco
  // antigo; null = o guerreiro sem armadura; 'A1'/'A2'/'A3' = com uma das dele.
  // As armas na mão passam para o corpo novo, com a mesma pegada.
  usarGuerreiro(armadura) {
    if (armadura === false) {
      if (!this.guerreiro) return;
      this.guerreiro.remover();
      this.guerreiro = null;
    } else if (this.guerreiro) {
      this.guerreiro.vestir(armadura);
      return;
    } else {
      if (!Assets.guerreiro) return;
      this.guerreiro = new CorpoGuerreiro(this, armadura);
    }
    for (const lado of ['r', 'l']) {
      const obj = (lado === 'r' ? this.slotR : this.slotL)?.children[0];
      if (obj) this.equip(lado, obj);
    }
    const costas = this.slotCostas?.children[0];
    if (costas) this.equipCostas(costas);
  }

  duration(name) { return Assets.clips[name]?.duration ?? 1; }

  action(name) {
    if (!this.actions[name]) {
      const clip = Assets.clips[name];
      if (!clip) { console.warn('Animação inexistente:', name); return null; }
      this.actions[name] = this.mixer.clipAction(clip);
    }
    return this.actions[name];
  }

  play(name, { fade = 0.18, loop = true, speed = 1, duration = null, restart = false, from = 0 } = {}) {
    const a = this.action(name);
    if (!a) return null;
    const ts = duration ? a.getClip().duration / duration : speed;
    if (this.current === a && !restart) { a.timeScale = ts; return a; }
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = ts;
    a.time = from;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a && fade > 0) a.crossFadeFrom(this.current, fade, false);
    else if (this.current && this.current !== a) this.current.stop();
    a.play();
    this.current = a; this.currentName = name;
    return a;
  }

  pose(name, t = 0) {
    const a = this.action(name);
    this.mixer.stopAllAction();
    a.reset(); a.play(); a.paused = true; a.time = t;
    this.mixer.update(0);
    this.current = a; this.currentName = name;
  }

  // Arma na mão direita: construída na pose T e presa ao osso da mão
  equip(side, obj) {
    const hand = side === 'r' ? this.handR : this.handL;
    const key = side === 'r' ? 'slotR' : 'slotL';
    if (this[key]) { this[key].parent?.remove(this[key]); this[key] = null; }
    if (!obj) return;
    const shield = !!obj.userData.shield;
    const boneName = shield ? 'lowerarm_l' : side === 'r' ? 'hand_r' : 'hand_l';
    const holder = new THREE.Group();
    let osso = this.scene.getObjectByName(boneName);
    holder.matrix.copy(gripMatrix(boneName, side, shield));
    if (this.guerreiro) ({ osso, matriz: holder.matrix } = this.guerreiro.pegada(boneName, holder.matrix));
    holder.matrix.decompose(holder.position, holder.quaternion, holder.scale);
    holder.add(obj);
    osso.add(holder);
    this[key] = holder;
  }

  // O escudo nas COSTAS (arma de duas mãos): preso ao alto da coluna, virado para trás
  equipCostas(obj) {
    if (this.slotCostas) { this.slotCostas.parent?.remove(this.slotCostas); this.slotCostas = null; }
    if (!obj) return;
    const holder = new THREE.Group();
    let osso = this.scene.getObjectByName('spine_03');
    holder.matrix.copy(costasMatrix());
    if (this.guerreiro) ({ osso, matriz: holder.matrix } = this.guerreiro.pegada('spine_03', holder.matrix));
    holder.matrix.decompose(holder.position, holder.quaternion, holder.scale);
    holder.add(obj);
    osso.add(holder);
    this.slotCostas = holder;
  }

  flash(on) {
    this.flashMats.forEach((m, i) => { if (on) m.emissive.setRGB(0.35, 0.2, 0.16); else m.emissive.copy(this.baseEmissive[i]); });
  }

  setEmissive(r, g, b) { for (const m of this.flashMats) m.emissive.setRGB(r, g, b); }

  update(dt) {
    this.mixer.update(dt);
    const meta = this.duasMaos && this.slotR ? 1 : 0;
    this.pesoDuasMaos += (meta - this.pesoDuasMaos) * Math.min(1, dt * 10);
    // os dedos da esquerda FECHADOS no cabo — no manequim, ANTES do retarget (o
    // guerreiro copia os dedos dele)
    if (this.pesoDuasMaos > 0.01 && this.slotR) this.fecharDedosEsquerdos(this.pesoDuasMaos);
    this.guerreiro?.seguir();
    if (this.pesoDuasMaos > 0.01 && this.slotR) this.segurarComAsDuas(this.pesoDuasMaos);
  }

  /**
   * AS DUAS MÃOS no cabo da arma de duas mãos (IK, depois da animação — e do
   * retarget, no guerreiro). Os clipes do UAL são de uma mão: o pulso esquerdo vai
   * para o cabo, 14 cm abaixo do direito e do MESMO lado (as duas fecham o cabo pelo
   * mesmo lado). Quando o cabo está longe demais para o braço esquerdo, o direito
   * TRAZ a arma para perto do corpo (IK também), com a mão no mesmo giro — a lâmina
   * só anda, não torce. O cabo fica SEMPRE NA FRENTE do peito (nos eixos do tronco:
   * os ombros dão o lado, o mundo dá o alto), senão o braço esquerdo atravessava o
   * corpo para pegar uma espada do lado direito; e os cotovelos apontam para fora e
   * para baixo (`polo`).
   */
  segurarComAsDuas(peso) {
    const g = this.guerreiro;
    const osso = (ual, gu) => (g ? g.cena.getObjectByName(gu) : this.scene.getObjectByName(ual));
    const ombroL = osso('upperarm_l', 'ArmL'), cotL = osso('lowerarm_l', 'ElbowL'), maoL = osso('hand_l', 'HandL');
    const ombroR = osso('upperarm_r', 'ArmR'), cotR = osso('lowerarm_r', 'ElbowR'), maoR = osso('hand_r', 'HandR');
    this.root.updateMatrixWorld(true);
    // A MÃO ESQUERDA FECHADA NO CABO: a mesma pegada com que ela segura a tocha
    // (`gripMatrix` da mão esquerda; no guerreiro, passada para o osso dele), posta
    // num ponto do cabo ABAIXO_NO_CABO para o pomo. Daí sai onde o pulso tem de ficar
    // E o giro da mão — o polegar para o lado da lâmina, como o da direita.
    const pegaL = this.pegadaEsquerda();
    const maoLQuer = _hL.copy(this.slotR.matrixWorld).multiply(_desce).multiply(_inv.copy(pegaL).invert());
    const pulsoR = maoR.getWorldPosition(_pR);
    const d = _d.setFromMatrixPosition(maoLQuer).sub(pulsoR);   // pulso direito → pulso esquerdo, no mundo (a arma é rígida)
    // onde o pulso direito tem de ficar para os DOIS braços alcançarem (umas voltas de ajuste)
    const sL = ombroL.getWorldPosition(_sL), sR = ombroR.getWorldPosition(_sR);
    const alcL = (sL.distanceTo(cotL.getWorldPosition(_t1)) + _t1.distanceTo(maoL.getWorldPosition(_t2))) * 0.97;
    const alcR = (sR.distanceTo(cotR.getWorldPosition(_t1)) + _t1.distanceTo(pulsoR)) * 0.97;
    // os eixos do tronco: lado (ombro esq. → dir.), alto (o do mundo), frente
    const lado = _lado.subVectors(sR, sL).normalize(), alto = _alto.set(0, 1, 0);
    const frente = _frente.crossVectors(alto, lado).normalize();
    const peito = _peito.addVectors(sL, sR).multiplyScalar(0.5).addScaledVector(alto, -0.2);
    const R = _R.copy(pulsoR);
    for (let k = 0; k < 6; k++) {
      // na frente do peito: as duas mãos a pelo menos FRENTE_MIN dele
      const zR = _t1.subVectors(R, peito).dot(frente), zL = _t1.addVectors(R, d).sub(peito).dot(frente);
      const falta = FRENTE_MIN - Math.min(zR, zL);
      if (falta > 0) R.addScaledVector(frente, falta);
      // e não muito para os lados: a direita até 28 cm do meio, a esquerda até 15 cm
      const xR = _t1.subVectors(R, peito).dot(lado), xL = _t1.addVectors(R, d).sub(peito).dot(lado);
      if (xR > 0.28) R.addScaledVector(lado, 0.28 - xR);
      if (xL < -0.15) R.addScaledVector(lado, -0.15 - xL);
      // o que os braços alcançam
      _t1.addVectors(R, d).sub(sL); if (_t1.length() > alcL) _t1.setLength(alcL); R.copy(sL).add(_t1).sub(d);
      _t1.subVectors(R, sR); if (_t1.length() > alcR) _t1.setLength(alcR); R.copy(sR).add(_t1);
    }
    // os cotovelos: para fora e para baixo, um pouco para trás
    const poloR = _poloR.copy(sR).addScaledVector(lado, 0.35).addScaledVector(alto, -0.45).addScaledVector(frente, -0.1);
    const poloL = _poloL.copy(sL).addScaledVector(lado, -0.35).addScaledVector(alto, -0.45).addScaledVector(frente, -0.1);
    R.lerpVectors(pulsoR, R, peso);
    if (R.distanceToSquared(pulsoR) > 1e-6) {
      maoR.getWorldQuaternion(_qMao);
      ikDoisOssos(ombroR, cotR, maoR, R, poloR);
      // a mão no giro de antes (no mundo): a arma não torce
      maoR.parent.getWorldQuaternion(_qp);
      maoR.quaternion.copy(_qp.invert().multiply(_qMao));
      maoR.updateMatrixWorld(true);
    }
    // e a esquerda no cabo: o pulso no lugar, e a mão no giro da pegada
    this.slotR.updateMatrixWorld(true);
    maoLQuer.copy(this.slotR.matrixWorld).multiply(_desce).multiply(_inv.copy(pegaL).invert());
    const alvo = _alvo.setFromMatrixPosition(maoLQuer);
    alvo.lerpVectors(maoL.getWorldPosition(_t2), alvo, peso);
    ikDoisOssos(ombroL, cotL, maoL, alvo, poloL);
    maoLQuer.decompose(_t1, _qMao, _t2);
    maoL.getWorldQuaternion(_qw);
    _qw.slerp(_qMao, peso);
    maoL.parent.getWorldQuaternion(_qp);
    maoL.quaternion.copy(_qp.invert().multiply(_qw));
    maoL.updateMatrixWorld(true);
  }

  // Os clipes de uma mão deixam a esquerda ABERTA (ela está livre): no cabo, os dedos
  // vão para a pose de quem segura a tocha (o primeiro quadro do `Idle_Torch_Loop`)
  fecharDedosEsquerdos(peso) {
    const dedos = dedosDaTocha();
    if (!this._dedosL) this._dedosL = [...dedos.keys()].map((n) => this.scene.getObjectByName(n));
    let i = 0;
    for (const q of dedos.values()) { const o = this._dedosL[i++]; if (o) o.quaternion.slerp(q, peso); }
  }

  // a pegada da mão esquerda (osso da mão → arma), a da tocha; no guerreiro, no osso dele
  pegadaEsquerda() {
    const chave = this.guerreiro ?? this;
    if (this._pegaL?.chave !== chave) {
      const naUal = gripMatrix('hand_l', 'l', false);
      this._pegaL = { chave, m: this.guerreiro ? this.guerreiro.pegada('hand_l', naUal.clone()).matriz : naUal.clone() };
    }
    return this._pegaL.m;
  }
}

// os dedos da mão esquerda (falanges 01–03) no primeiro quadro do clipe da tocha
let dedosTocha = null;
function dedosDaTocha() {
  if (dedosTocha) return dedosTocha;
  dedosTocha = new Map();
  const clip = Assets.clips.Idle_Torch_Loop;
  for (const t of clip?.tracks ?? []) {
    const [osso, prop] = t.name.split('.');
    if (prop === 'quaternion' && /^(thumb|index|middle|ring|pinky)_0[123]_l$/.test(osso)) dedosTocha.set(osso, new THREE.Quaternion().fromArray(t.values, 0));
  }
  return dedosTocha;
}

// ---------------------------------------------------------------- IK de dois ossos
// Gira o ombro e o cotovelo para a ponta (`osC`) chegar ao alvo, mantendo o plano
// de dobra do braço: (1) o cotovelo abre/fecha até a distância ombro→ponta ser a
// do alvo (teorema dos cossenos), (2) o ombro gira essa reta até o alvo. Tudo em
// giros NO MUNDO, convertidos para o local de cada osso; alvo fora do alcance =
// braço esticado na direção dele.
const _alvoLocal = new THREE.Vector3(), _alvo = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _ba = new THREE.Vector3(), _bc = new THREE.Vector3(), _ac = new THREE.Vector3(), _at = new THREE.Vector3(), _eixo = new THREE.Vector3();
const _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _qMao = new THREE.Quaternion();
const FRENTE_MIN = 0.3;   // o cabo, no mínimo isto à frente do peito (m)
const ABAIXO_NO_CABO = 0.11;   // a mão esquerda, este tanto abaixo da direita no cabo (m), para o pomo
const _desce = new THREE.Matrix4().makeTranslation(0, 0, -ABAIXO_NO_CABO), _hL = new THREE.Matrix4();
const _lado = new THREE.Vector3(), _alto = new THREE.Vector3(), _frente = new THREE.Vector3(), _peito = new THREE.Vector3(), _poloR = new THREE.Vector3(), _poloL = new THREE.Vector3();
const _pb = new THREE.Vector3(), _pp = new THREE.Vector3();
const _pR = new THREE.Vector3(), _d = new THREE.Vector3(), _sL = new THREE.Vector3(), _sR = new THREE.Vector3(), _R = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();
// gira o osso `o` no MUNDO por `r` (o pai fica onde está)
function girarNoMundo(o, r) {
  o.getWorldQuaternion(_qw);
  o.parent.getWorldQuaternion(_qp);
  o.quaternion.copy(_qp.invert().multiply(r.multiply(_qw)));
  o.updateMatrixWorld(true);
}
function ikDoisOssos(osA, osB, osC, alvo, polo = null) {
  osA.getWorldPosition(_a); osB.getWorldPosition(_b); osC.getWorldPosition(_c);
  const lab = _a.distanceTo(_b), lcb = _b.distanceTo(_c);
  const lat = THREE.MathUtils.clamp(_a.distanceTo(alvo), Math.abs(lab - lcb) + 0.002, lab + lcb - 0.002);
  // (1) o cotovelo: o ângulo em B que dá a distância `lat`
  _ba.subVectors(_a, _b).normalize(); _bc.subVectors(_c, _b).normalize();
  const atual = Math.acos(THREE.MathUtils.clamp(_ba.dot(_bc), -1, 1));
  const quer = Math.acos(THREE.MathUtils.clamp((lab * lab + lcb * lcb - lat * lat) / (2 * lab * lcb), -1, 1));
  _eixo.crossVectors(_ba, _bc);
  if (_eixo.lengthSq() < 1e-10) _eixo.set(0, 1, 0).cross(_ba);   // braço reto: dobra para qualquer lado
  _eixo.normalize();
  girarNoMundo(osB, _qr.setFromAxisAngle(_eixo, quer - atual));
  // (2) o ombro: a reta ombro→ponta para cima do alvo
  osC.getWorldPosition(_c);
  _ac.subVectors(_c, _a).normalize(); _at.subVectors(alvo, _a).normalize();
  girarNoMundo(osA, _qr.setFromUnitVectors(_ac, _at));
  // (3) o POLO: gira o braço em volta da reta ombro→alvo (a mão não sai do lugar)
  // até o cotovelo ficar do lado do polo
  if (!polo) return;
  osB.getWorldPosition(_b);
  _pb.subVectors(_b, _a).addScaledVector(_at, -_b.clone().sub(_a).dot(_at));
  _pp.subVectors(polo, _a).addScaledVector(_at, -polo.clone().sub(_a).dot(_at));
  if (_pb.lengthSq() < 1e-8 || _pp.lengthSq() < 1e-8) return;
  _pb.normalize(); _pp.normalize();
  const ang = Math.atan2(_eixo.crossVectors(_pb, _pp).dot(_at), _pb.dot(_pp));
  girarNoMundo(osA, _qr.setFromAxisAngle(_at, ang));
}

// Matriz local (relativa ao osso) de uma arma/escudo, calculada na pose T da cena-fonte
const gripCache = {};
function gripMatrix(boneName, side, shield) {
  const key = boneName + side + shield;
  if (gripCache[key]) return gripCache[key];
  const src = Assets.baseScene;
  src.updateMatrixWorld(true);
  const hp = src.getObjectByName(side === 'r' ? 'hand_r' : 'hand_l').getWorldPosition(new THREE.Vector3());
  const sx = Math.sign(hp.x);
  const target = shield
    ? new THREE.Matrix4().makeTranslation(hp.x - sx * 0.19, hp.y + 0.075, hp.z)
    : new THREE.Matrix4().makeTranslation(hp.x + sx * 0.075, hp.y - 0.02, hp.z + 0.005);
  const bone = src.getObjectByName(boneName);
  gripCache[key] = bone.matrixWorld.clone().invert().multiply(target);
  return gripCache[key];
}

// Matriz local (no osso spine_03) do escudo nas costas, na pose T: atrás do peito,
// um pouco abaixo. O escudo é feito (gear.js) com a face para +Y e o alto para −Z:
// Rx(−90°) põe a face para trás (−Z) e Rz(180°) desvira o alto para cima
let costasCache = null;
function costasMatrix() {
  if (costasCache) return costasCache;
  const src = Assets.baseScene;
  src.updateMatrixWorld(true);
  const osso = src.getObjectByName('spine_03');
  const p = osso.getWorldPosition(new THREE.Vector3());
  const alvo = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y - 0.12, p.z - 0.2),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)), new THREE.Vector3(1, 1, 1));
  costasCache = osso.matrixWorld.clone().invert().multiply(alvo);
  return costasCache;
}

export function weaponMesh(kind) { return makeWeapon(kind); }
export function shieldMesh(kind) { const s = makeShield(kind); s.userData.shield = true; return s; }

// ---------------------------------------------------------------- a armadura fundida
//
// O DESEMPENHO (03/10/2026): cada boneco tinha ~84 malhas soltas (os blocos dos
// `traje-*.json`, presos aos ossos), e com 19 inimigos e 16 cadáveres eram ~2.700
// das ~3.500 malhas da cena — uma chamada de desenho cada, repetida 6 vezes pela
// sombra da tocha. Aqui elas viram UMA malha por tipo de material, sem mudar
// nada do que se vê:
//
//   • a COR de cada bloco vai para os vértices (o shader já multiplica a cor do
//     material pela do vértice — branco × cor do vértice = a cor de antes), e
//     blocos de materiais iguais em tudo menos a cor passam a dividir um;
//   • os blocos de TODOS os ossos entram numa `SkinnedMesh` só, cada vértice
//     preso ao seu osso com peso 1 — o mesmo jeito do corpo do boneco. A posição
//     guardada é `inv(osso(T) · inversoDoOsso) · bloco(T) · p`, então em qualquer
//     pose o bloco vai para `osso(agora) · inv(osso(T)) · bloco(T) · p`: exatamente
//     o que um filho rígido do osso faria.
//
// Fica de fora o que muda sozinho depois: o material dos OLHOS (o Carrasco
// acende, o cadáver apaga), o que é transparente, e as armas (presas depois).
function assinaturaDoMaterial(m) {
  return [m.type, m.map?.uuid, m.normalMap?.uuid, m.roughnessMap?.uuid, m.metalnessMap?.uuid, m.emissiveMap?.uuid,
    m.envMap?.uuid, m.roughness, m.metalness, m.emissive?.getHex(), m.emissiveIntensity, m.envMapIntensity,
    m.side, m.flatShading, m.alphaTest, m.opacity, m.transparent].join('|');
}

function fundirTraje(scene, corpo) {
  const esqueleto = corpo.skeleton;
  scene.updateMatrixWorld(true);
  const olho = scene.userData.eyeMat;
  const grupos = new Map();
  scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || !o.visible || Array.isArray(o.material) || !o.material?.color) return;
    if (o.material === olho || o.material.transparent) return;
    let osso = o.parent;
    while (osso && !osso.isBone) osso = osso.parent;
    const i = osso ? esqueleto.bones.indexOf(osso) : -1;
    if (i < 0) return;
    // algum ancestral escondido: o bloco não aparece hoje, e não deve aparecer fundido
    for (let a = o.parent; a && a !== scene; a = a.parent) if (!a.visible) return;
    const k = assinaturaDoMaterial(o.material);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push({ o, i });
  });
  const _m = new THREE.Matrix4();
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue;   // um bloco sozinho não ganha nada fundido
    const comUV = lista.some(({ o }) => o.geometry.attributes.uv);
    const geos = [];
    for (const { o, i } of lista) {
      let g = o.geometry.clone();
      for (const nome of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(nome)) g.deleteAttribute(nome);
      g.morphAttributes = {};
      if (g.index) g = g.toNonIndexed();
      const n = g.attributes.position.count;
      if (!g.attributes.normal) g.computeVertexNormals();
      if (comUV && !g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      // a cor do material para os vértices (multiplicando a que o bloco já tiver)
      const c = o.material.color, cor = new Float32Array(n * 3), antes = g.attributes.color;
      for (let v = 0; v < n; v++) {
        cor[v * 3] = c.r * (antes ? antes.getX(v) : 1);
        cor[v * 3 + 1] = c.g * (antes ? antes.getY(v) : 1);
        cor[v * 3 + 2] = c.b * (antes ? antes.getZ(v) : 1);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
      // a posição no espaço de ligação do osso (ver o comentário acima)
      _m.multiplyMatrices(esqueleto.bones[i].matrixWorld, esqueleto.boneInverses[i]).invert().multiply(o.matrixWorld);
      g.applyMatrix4(_m);
      const idx = new Uint16Array(n * 4), peso = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) { idx[v * 4] = i; peso[v * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(peso, 4));
      geos.push(g);
    }
    const geo = mergeGeometries(geos);
    if (!geo) continue;   // atributos que não casam: deixa os blocos como estavam
    const mat = lista[0].o.material.clone();
    mat.color.setRGB(1, 1, 1);
    mat.vertexColors = true;
    const malha = new THREE.SkinnedMesh(geo, mat);
    malha.castShadow = lista.some(({ o }) => o.castShadow);
    malha.receiveShadow = lista.some(({ o }) => o.receiveShadow);
    malha.bind(esqueleto, new THREE.Matrix4());
    // o boneco deitado (cadáver, morte) passa da esfera da pose T: uma folgada
    malha.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.4);
    malha.frustumCulled = corpo.frustumCulled;
    scene.add(malha);
    for (const { o } of lista) {
      // uma peça pode ser PAI de outra (o editor deixa): a filha fica, no mesmo lugar
      for (const filha of [...o.children]) o.parent.attach(filha);
      o.removeFromParent();
    }
  }
}
