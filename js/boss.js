import * as THREE from 'three';
import { Enemy, ENEMY_TYPES } from './enemies.js';
import { yawTo, turnTowards, flatDist } from './combat.js';
import { ARENA_CENTER, S, GLOW } from './world.js';

const SCALE = 1.55;

const BOSS_CFG = {
  name: 'O Carrasco da Masmorra', outfit: 'executioner', skinTint: 0x4e4038, hp: 1500, souls: 5000, speed: 2.9,
  runAnim: 'Jog_Fwd_Loop', runRef: 3.9 * SCALE, idleAnim: 'Sword_Idle',
  radius: 0.75, height: 1.85 * SCALE, scale: SCALE, poise: 170, aggro: 999, cooldown: [0.8, 1.7], turnRate: 2.4,
  right: 'greataxe',
  attacks: [
    { anim: 'heavy1', dmg: 50, poise: 70, reach: 3.4, range: 3.4, lunge: 2.5, speed: 0.7, next: 'b2', nextChance: 0.6, weight: 1.3 },
    { id: 'b2', anim: 'heavy2', dmg: 46, poise: 70, reach: 3.4, range: 0, follow: true, lunge: 2.0, speed: 0.7, next: 'b3', nextChance: 0.45 },
    { id: 'b3', anim: 'heavy3', dmg: 52, poise: 80, reach: 3.4, range: 0, follow: true, lunge: 2.0, speed: 0.7 },
    { anim: 'overhead', dmg: 74, poise: 110, reach: 3.6, range: 3.8, lunge: 2.0, speed: 0.6, shock: { radius: 3.0, speed: 10 } },
    { anim: 'dash', dmg: 56, poise: 90, reach: 3.2, range: 11, minRange: 5, lunge: 12, dash: true, speed: 0.55, trackMul: 1.3 },
    { anim: 'heavy4', dmg: 46, poise: 80, reach: 3.6, range: 3.0, speed: 0.8, arc: 2.2, weight: 0.8 },
    // Fase 2
    { anim: 'leap', dmg: 72, poise: 120, reach: 3.2, range: 17, minRange: 6.5, leap: true, speed: 0.75, arc: 3.2, phase: 2, shock: { radius: 7, speed: 12 }, weight: 1.2, gap: 5, after: 'NinjaJump_Land', recover: 0.9 },
    { anim: 'summon', cast: 'summon', range: 40, phase: 2, gap: 22, weight: 2, speed: 0.9 },
  ],
  drops: [],
};

export class Boss extends Enemy {
  constructor(game) {
    super(game, BOSS_CFG, ARENA_CENTER.clone().add(new THREE.Vector3(0, 0, -4 * S)), 0);
    this.isBoss = true;
    this.defeated = false;
    this.minions = [];
    this.buildEyes();
    this.sleep();
  }

  // Olhos em brasa sob o capuz de carrasco
  buildEyes() {
    const anchor = this.model.scene.userData.eyeAnchor;
    const eyeMat = new THREE.SpriteMaterial({ map: GLOW.tex, color: 0xff2a10, blending: THREE.AdditiveBlending, depthWrite: false });
    this.eyes = [-1, 1].map((s) => {
      const e = new THREE.Sprite(eyeMat.clone());
      e.scale.set(0.07, 0.045, 1);
      e.position.set(s * 0.045, 0, 0.005);
      anchor.add(e);
      return e;
    });
    this.eyeGlow = new THREE.PointLight(0xff2a10, 0, 4, 2);
    this.eyeGlow.position.set(0, 0, 0.12);
    anchor.add(this.eyeGlow);
  }

  get deathAnim() { return 'Death01'; }
  get inArenaZone() { return true; }
  get invulnerable() { return ['dormant', 'intro', 'phase', 'gone'].includes(this.state); }
  get lockable() { return !['dormant', 'gone'].includes(this.state); }

  sleep() {
    this.cfg = BOSS_CFG;
    this.reset();
    this.phase = 1;
    this.speedMul = 1;
    this.active = !this.defeated;
    this.model.root.visible = !this.defeated;
    this.setState(this.defeated ? 'gone' : 'dormant');
    // Ajoelhado junto ao cepo, esperando o próximo condenado
    this.model.play('Crouch_Idle_Loop', { fade: 0 });
    this.eyeGlow.intensity = 0;
    this.eyes.forEach((e) => (e.material.opacity = 0.25));
    this.model.setEmissive(0, 0, 0);
    for (const m of this.minions) { this.game.scene.remove(m.model.root); const i = this.game.all.indexOf(m); if (i >= 0) this.game.all.splice(i, 1); }
    this.minions = [];
  }

  reset() {
    this.startsDormant = false;
    super.reset();
  }

  wake() {
    if (this.state !== 'dormant') return;
    this.setState('intro');
    this.model.play('Sword_Idle', { fade: 1.2 });
  }

  poseDormindo() { this.model.play('Crouch_Idle_Loop', { fade: 0 }); }

  /** Os olhos acesos de quem já acordou (o rugido da entrada os acende). */
  acenderOlhos() {
    this.eyeGlow.intensity = 5;
    this.eyes.forEach((e) => (e.material.opacity = 1));
  }

  /** O que a FASE 2 muda nele: mais rápido, vira mais depressa, descansa menos, olhos maiores. */
  aplicarFase2() {
    this.phase = 2;
    this.speedMul = 1.2;
    this.cfg = { ...this.cfg, turnRate: 3.1, cooldown: [0.5, 1.2] };
    this.eyeGlow.intensity = 10;
    this.eyes.forEach((e) => e.scale.set(0.1, 0.06, 1));
  }

  /**
   * ASSUMIR o Carrasco no meio do caminho (o mundo online trocou de simulador,
   * ver `Enemy.retomar`). Dormindo, vencido ou sem retrato: `sleep()` resolve.
   * Em luta: segue dela, na fase certa, sem repetir o rugido nem a explosão.
   */
  retomar(r) {
    this.soltarMarionete();
    this.sleep();
    if (this.defeated || !r || r.morto || !r.ativo || r.st === 'dormant' || r.st === 'gone') return;
    this.pos.set(r.x, 0, r.z);
    this.pos.y = this.game.world.alturaChao(this.pos);
    this.facing = r.g;
    this.hp = Math.min(this.maxHp, Math.max(1, r.hp));
    this.acenderOlhos();
    if (this.hp <= this.maxHp * 0.5) this.aplicarFase2();
    this.setState('chase');
    this.cooldown = 1.2;
    this.model.play(this.idleAnim, { fade: 0 });
  }

  canEngage() { return !this.alvo.dead && this.alvo.inArena; }
  podeMirar(j) { return j.inArena; }

  takeDamage(amount, srcPos, poiseDmg, opts) {
    const hit = super.takeDamage(amount, srcPos, poiseDmg, opts);
    if (hit && !this.dead && this.phase === 1 && this.hp <= this.maxHp * 0.5) {
      this.phase = 2;
      this.pos.y = this.game.world.alturaChao(this.pos);
      this.setState('phase');
      this.model.play('Hit_Knockback', { loop: false, restart: true, duration: 1.2 });
    }
    return hit;
  }

  stagger(srcPos) {
    if (this.state === 'attack' && this.st.atk?.leap) return;
    this.pos.y = this.game.world.alturaChao(this.pos);
    super.stagger(srcPos, 1.3);
    this.knock.multiplyScalar(0.3);
  }

  die() {
    this.defeated = true;
    for (const m of this.minions) if (!m.dead) m.die();
    super.die();
  }

  doCast(a) {
    if (a.cast !== 'summon') return super.doCast(a);
    if (this.minions.filter((m) => !m.dead).length >= 3) return;
    const game = this.game;
    game.sfx.roar();
    // Esqueletos se levantam do chão ao redor do jogador
    for (let i = 0; i < 2; i++) {
      const ang = Math.random() * Math.PI * 2;
      const p = this.alvo.pos.clone().add(new THREE.Vector3(Math.cos(ang) * 4.5, 0, Math.sin(ang) * 4.5));
      game.world.resolve(p, 0.6);
      const m = new Enemy(game, { ...ENEMY_TYPES.minion, souls: 0, drops: [], hp: 80 }, p, yawTo(p, this.alvo.pos));
      m.canEngage = () => !m.alvo.dead;
      m.netId = `lacaio${++game.contLacaios}`;
      Object.defineProperty(m, 'inArenaZone', { get: () => true });
      m.model.pose('LayToIdle', 0);
      m.awaken();
      game.effects.burst(p.clone().setY(p.y + 0.2), { count: 40, color: [0.5, 0.2, 0.6], speed: 4, size: 0.2, life: 0.8, gravity: 4 });
      this.minions.push(m);
      game.all.push(m);
    }
  }

  updateAI(dt) {
    const game = this.game, p = this.alvo;
    switch (this.state) {
      case 'dormant': case 'gone': return;
      case 'intro':
        if (this.stateT > 1.2 && !this.st.roared) {
          this.st.roared = true;
          game.sfx.roar(); game.addShake(0.6);
          this.acenderOlhos();
        }
        if (this.stateT > 2.6) { this.setState('chase'); this.cooldown = 0.6; }
        return;
      case 'phase':
        if (this.stateT > 0.9 && !this.st.burst) {
          this.st.burst = true;
          game.sfx.roar(); game.addShake(0.8);
          game.effects.ring(this.pos, 7, 0.6, 0xff2a10);
          game.effects.burst(this.pos.clone().setY(this.pos.y + 2), { count: 120, color: [0.9, 0.15, 0.05], speed: 12, size: 0.3, life: 1.0, gravity: 0 });
          if (flatDist(p.pos, this.pos) < 7) p.takeDamage(30, this.pos, { poise: 100, unblockable: true });
          this.aplicarFase2();
        }
        if (this.stateT > 2.4) { this.setState('chase'); this.cooldown = 0.2; }
        return;
      case 'chase': {
        if (!this.canEngage()) { this.model.play(this.idleAnim, { fade: 0.3 }); return; }
        const d = flatDist(p.pos, this.pos);
        this.cooldown -= dt;
        this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * this.cfg.turnRate);
        if (this.cooldown <= 0) {
          const atk = this.pickAttack(d);
          if (atk) { this.startAttack(atk); return; }
        }
        if (d > 3.0) {
          const run = d > 12;
          const s = this.cfg.speed * this.speedMul * (run ? 1.35 : 1);
          this.pos.x += Math.sin(this.facing) * s * dt;
          this.pos.z += Math.cos(this.facing) * s * dt;
          this.model.play(run ? 'Jog_Fwd_Loop' : 'Walk_Loop', { speed: run ? s / (3.9 * SCALE) : s / (1.5 * SCALE) });
        } else this.model.play(this.idleAnim, { fade: 0.2 });
        return;
      }
    }
    super.updateAI(dt);
  }

  update(dt) {
    super.update(dt);
    this.minions = this.minions.filter((m) => {
      if (!m.active) { this.game.scene.remove(m.model.root); const i = this.game.all.indexOf(m); if (i >= 0) this.game.all.splice(i, 1); return false; }
      return true;
    });
    if (this.phase === 2 && !this.dead && this.active) {
      const pulse = 0.5 + Math.sin(this.game.time * 5) * 0.5;
      if (this.flashT <= 0) this.model.setEmissive(0.03 + pulse * 0.04, 0.004, 0);
      if (Math.random() < 0.7) {
        this.game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 2.8, (Math.random() - 0.5) * 1.6)),
          vel: new THREE.Vector3(0, 1.5 + Math.random(), 0), color: [0.8, 0.1, 0.03], size: 0.2, life: 1.0 });
      }
    }
  }

  updateDeath() {
    const game = this.game;
    if (this.stateT < 3.5 && Math.random() < 0.9) {
      game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 1.5, (Math.random() - 0.5) * 2.5)),
        vel: new THREE.Vector3(0, 2 + Math.random() * 2, 0), color: [1, 0.55, 0.25], size: 0.22, life: 1.5 });
    }
    if (this.stateT > 3.5) {
      const k = Math.min(1, (this.stateT - 3.5) / 1.5);
      this.model.root.scale.setScalar(1 - k * 0.999);
      if (k >= 1 && this.active) { this.active = false; this.model.root.visible = false; this.setState('gone'); this.dead = true; }
    }
  }
}
