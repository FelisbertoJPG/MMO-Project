// Personagem humanoide realista (manequim Quaternius UAL) com trajes e armas presos aos ossos
import * as THREE from 'three';
import { Assets } from './assets.js';
import { buildOutfit, makeWeapon, makeShield } from './gear.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { CorpoGuerreiro, ARMADURA_TESTE } from './guerreiro.js';

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
  constructor({ outfit = 'knight', scale = 1, skinTint = null, hideBody = false, corpo = null } = {}) {
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
    this.slotR = null; this.slotL = null;
    // o corpo do guerreiro (em teste, guerreiro.js): o manequim segue animando, invisível
    this.guerreiro = corpo === 'guerreiro' && Assets.guerreiro ? new CorpoGuerreiro(this, ARMADURA_TESTE) : null;
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

  flash(on) {
    this.flashMats.forEach((m, i) => { if (on) m.emissive.setRGB(0.35, 0.2, 0.16); else m.emissive.copy(this.baseEmissive[i]); });
  }

  setEmissive(r, g, b) { for (const m of this.flashMats) m.emissive.setRGB(r, g, b); }

  update(dt) { this.mixer.update(dt); this.guerreiro?.seguir(); }
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
