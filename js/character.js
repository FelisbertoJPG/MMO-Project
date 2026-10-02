// Personagem humanoide realista (manequim Quaternius UAL) com trajes e armas presos aos ossos
import * as THREE from 'three';
import { Assets } from './assets.js';
import { buildOutfit, makeWeapon, makeShield } from './gear.js';

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
  constructor({ outfit = 'knight', scale = 1, skinTint = null, hideBody = false } = {}) {
    const { scene, materials } = Assets.character();
    this.scene = scene;
    // Traje montado na pose T (antes de qualquer transformação/animação)
    scene.updateMatrixWorld(true);
    buildOutfit(scene, outfit);
    this.body = [];
    scene.traverse((c) => { if (c.isSkinnedMesh) this.body.push(c); });
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
    holder.matrix.copy(gripMatrix(boneName, side, shield));
    holder.matrix.decompose(holder.position, holder.quaternion, holder.scale);
    holder.add(obj);
    this.scene.getObjectByName(boneName).add(holder);
    this[key] = holder;
  }

  flash(on) {
    this.flashMats.forEach((m, i) => { if (on) m.emissive.setRGB(0.35, 0.2, 0.16); else m.emissive.copy(this.baseEmissive[i]); });
  }

  setEmissive(r, g, b) { for (const m of this.flashMats) m.emissive.setRGB(r, g, b); }

  update(dt) { this.mixer.update(dt); }
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
