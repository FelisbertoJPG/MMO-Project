import * as THREE from 'three';
import { CharacterModel, ATTACKS, weaponMesh, shieldMesh } from './character.js';
import { Interpolador, giroCurto, loopa } from './remoto.js';
import { angleToTarget, yawTo, turnTowards, flatDist } from './combat.js';
import { CELL, S } from './world.js';

const _v = new THREE.Vector3();

export const ENEMY_TYPES = {
  minion: {
    name: 'Esqueleto Desperto', outfit: 'skMinion', skeleton: true, hp: 70, souls: 50, speed: 2.2,
    runAnim: 'Zombie_Walk_Fwd_Loop', runRef: 1.1, idleAnim: 'Zombie_Idle_Loop',
    radius: 0.4, height: 1.8, scale: 1, poise: 15, aggro: 11, cooldown: [0.9, 2.0], turnRate: 4.5,
    right: 'rustySword', fireWeak: 1.3,
    attacks: [
      { anim: 'scratch', dmg: 22, poise: 30, reach: 1.6, range: 1.8, lunge: 1.5, speed: 0.9 },
      { anim: 'slashA', dmg: 20, poise: 25, reach: 1.9, range: 2.0, lunge: 2.0, speed: 0.55, next: 'm2', nextChance: 0.4 },
      { id: 'm2', anim: 'slashB', dmg: 18, poise: 25, reach: 1.9, range: 0, follow: true, lunge: 1.8, speed: 0.55 },
    ],
    drops: [['firebomb', 0.12], ['lostSoul', 0.15]],
  },
  warrior: {
    name: 'Guerreiro Esqueleto', outfit: 'skWarrior', skeleton: true, hp: 150, souls: 150, speed: 2.6,
    runAnim: 'Jog_Fwd_Loop', runRef: 3.9, idleAnim: 'Sword_Idle',
    radius: 0.45, height: 1.9, scale: 1.05, poise: 45, aggro: 12, cooldown: [1.0, 2.2], turnRate: 3.6,
    right: 'rustyAxe', left: 'rustyRound', blockChance: 0.55, fireWeak: 1.3,
    attacks: [
      { anim: 'slashC', dmg: 30, poise: 40, reach: 2.0, range: 2.2, lunge: 2.0, speed: 0.8, next: 'w2', nextChance: 0.45 },
      { id: 'w2', anim: 'overhead', dmg: 36, poise: 55, reach: 2.1, range: 0, follow: true, lunge: 1.8, speed: 0.75 },
      { anim: 'dash', dmg: 38, poise: 60, reach: 2.0, range: 6, minRange: 3.2, lunge: 6.5, speed: 0.75, trackMul: 1.4 },
    ],
    drops: [['resin', 0.4], ['lostSoul', 0.3]],
  },
  rogue: {
    name: 'Ladino Esqueleto', outfit: 'skRogue', skeleton: true, hp: 85, souls: 110, speed: 3.6,
    runAnim: 'Jog_Fwd_Loop', runRef: 3.9, idleAnim: 'Sword_Idle',
    radius: 0.4, height: 1.85, scale: 1, poise: 12, aggro: 13, cooldown: [0.5, 1.4], turnRate: 6, dodgeChance: 0.35,
    right: 'dagger', fireWeak: 1.3,
    attacks: [
      { anim: 'slashA', dmg: 18, poise: 20, reach: 1.6, range: 1.8, lunge: 3.2, speed: 0.7, next: 'r2', nextChance: 0.5 },
      { id: 'r2', anim: 'hook', dmg: 16, poise: 20, reach: 1.6, range: 0, follow: true, lunge: 2.5, speed: 0.6 },
    ],
    drops: [['blossom', 0.35]],
  },
  mage: {
    name: 'Necromante Esqueleto', outfit: 'skMage', skeleton: true, hp: 60, souls: 120, speed: 2.2,
    runAnim: 'Walk_Loop', runRef: 1.5, idleAnim: 'Spell_Simple_Idle_Loop',
    radius: 0.4, height: 1.9, scale: 1, poise: 8, aggro: 16, cooldown: [1.8, 3.0], turnRate: 5, ranged: true,
    right: 'staff', fireWeak: 1.3,
    attacks: [
      { anim: 'summon', cast: 'orb', dmg: 28, range: 15, minRange: 2.5, speed: 1.0 },
      { anim: 'slashA', dmg: 16, poise: 20, reach: 1.8, range: 1.9, lunge: 1.5, speed: 0.6 },
    ],
    drops: [['firebomb', 0.35]],
  },
};

export class Enemy {
  constructor(game, cfg, spawnPos, facing = 0, { dormant = false } = {}) {
    this.game = game;
    this.cfg = cfg;
    this.name = cfg.name;
    this.model = new CharacterModel({ outfit: cfg.outfit, scale: cfg.scale, hideBody: !!cfg.skeleton, skinTint: cfg.skinTint });
    if (cfg.right) this.model.equip('r', weaponMesh(cfg.right));
    if (cfg.left) this.model.equip('l', shieldMesh(cfg.left));
    game.scene.add(this.model.root);
    this.pos = this.model.root.position;
    this.home = spawnPos.clone();
    this.homeFacing = facing;
    this.radius = cfg.radius;
    this.height = cfg.height;
    this.maxHp = cfg.hp;
    this.startsDormant = dormant;
    this.reset();
  }

  reset() {
    this.pos.copy(this.home);
    this.facing = this.homeFacing;
    this.hp = this.maxHp;
    this.dead = false;
    this.active = true;
    this.model.root.visible = true;
    this.model.root.scale.setScalar(1);
    this.poiseCur = this.cfg.poise;
    this.cooldown = 0.6;
    this.flashT = 0; this.burnT = 0;
    this.recentDmg = 0; this.lastHit = -99;
    this.knock = new THREE.Vector3();
    this.speedMul = 1;
    this.lastAttacks = [];
    this.usedAt = new Map();
    this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0;
    this.pathT = 0; this.waypoint = null;
    this.model.flash(false);
    if (this.startsDormant) {
      this.setState('dormant');
      this.model.pose('LayToIdle', 0);
    } else {
      this.setState('idle');
      this.model.play(this.idleAnim, { fade: 0 });
    }
  }

  get idleAnim() { return this.cfg.idleAnim ?? 'Sword_Idle'; }
  get lockable() { return this.state !== 'dormant' && this.state !== 'awaken'; }
  get invulnerable() { return this.state === 'awaken'; }
  get inArenaZone() { return false; }

  setState(s, data = {}) { this.state = s; this.stateT = 0; this.st = data; }

  // ---------- Dano ----------
  takeDamage(amount, srcPos, poiseDmg = 20, { fire = false } = {}) {
    if (this.dead || this.invulnerable) return false;
    const game = this.game;
    if (this.state === 'dormant') this.awaken(true);
    if (fire) amount *= this.cfg.fireWeak ?? 1;
    // Bloqueio frontal com escudo
    const frontal = angleToTarget(this.pos, this.facing, srcPos) < 1.0;
    const chance = this.guarding ? 0.9 : this.cfg.blockChance;
    if (this.cfg.blockChance && ['chase', 'idle', 'blockstun'].includes(this.state) && frontal && Math.random() < chance) {
      game.effects.sparks(this.model.handL.getWorldPosition(new THREE.Vector3()));
      this.applyDamage(amount * 0.15);
      if (this.hp <= 0) { this.die(); return 'hit'; }
      // Golpes pesados quebram a guarda
      if (poiseDmg >= 45 && Math.random() < 0.6) {
        this.guarding = false;
        this.stagger(srcPos, 1.1);
        return 'hit';
      }
      this.model.play('Shield_OneShot', { loop: false, restart: true, fade: 0.05 });
      this.setState('blockstun', { dur: 0.5 });
      return 'blocked';
    }
    // Ladino às vezes recua
    if (this.cfg.dodgeChance && this.state === 'chase' && Math.random() < this.cfg.dodgeChance) {
      this.dodge(srcPos);
      return false;
    }
    this.applyDamage(amount);
    this.flashT = 0.12;
    const hitPos = this.pos.clone().setY(this.pos.y + this.height * 0.6);
    game.effects.burst(hitPos, { count: 16, color: [0.85, 0.82, 0.72], speed: 5, size: 0.09, life: 0.5, gravity: 12 });
    game.effects.sparks(hitPos);
    game.sfx.rattle();
    if (this.state === 'idle' || this.state === 'return') this.setState('chase');
    if (this.hp <= 0) { this.die(); return 'hit'; }
    this.poiseCur -= poiseDmg;
    if (this.poiseCur <= 0) { this.poiseCur = this.cfg.poise; this.stagger(srcPos); }
    return 'hit';
  }

  applyDamage(amount) {
    amount = Math.round(amount);
    this.hp -= amount;
    if (this.game.time - this.lastHit > 2.5) this.recentDmg = 0;
    this.recentDmg += amount;
    this.lastHit = this.game.time;
  }

  ignite(sec) { this.burnT = Math.max(this.burnT, sec); }

  dodge(srcPos) {
    const side = Math.random() < 0.5 ? 1 : -1;
    this.facing = yawTo(this.pos, srcPos) + side * Math.PI / 2;
    this.setState('dodge', { dur: 0.6 });
    this.model.play('Roll', { loop: false, duration: 0.6, restart: true, fade: 0.05 });
  }

  stagger(srcPos, dur = 0.6) {
    const dir = new THREE.Vector3(this.pos.x - srcPos.x, 0, this.pos.z - srcPos.z).normalize();
    this.knock.copy(dir).multiplyScalar(4);
    this.setState('hurt', { dur });
    this.model.play(dur > 0.8 ? 'Hit_Knockback' : 'Hit_Chest', { loop: false, duration: dur + 0.1, restart: true, fade: 0.05 });
  }

  die() {
    this.hp = 0;
    this.dead = true;
    this.burnT = 0;
    this.setState('dead');
    this.model.play(this.deathAnim, { loop: false, fade: 0.1 });
    this.game.sfx.rattle();
    this.game.onEnemyKilled(this);
  }

  get deathAnim() { return 'Death01'; }

  awaken(fast = false) {
    this.setState('awaken', { dur: fast ? 1.0 : 2.3 });
    this.model.play('LayToIdle', { loop: false, fade: 0.1, duration: fast ? 1.0 : 2.3, restart: true });
    this.game.sfx.rattle();
  }

  // ---------- IA ----------
  /**
   * Quem este inimigo persegue. Hoje é sempre o jogador local; no co-op é o
   * jogador vivo mais perto (ver `Game.alvoPara`), relido a cada meio segundo
   * por `escolherAlvo`. TODO código de IA lê `this.alvo`, nunca `game.player`:
   * é o que deixa um segundo jogador ser perseguido sem reescrever a IA.
   */
  get alvo() { return this._alvo ?? this.game.player; }
  escolherAlvo(dt) {
    this.alvoT = (this.alvoT ?? 0) - dt;
    if (this.alvoT > 0 && this._alvo && !this._alvo.dead) return;
    this.alvoT = 0.5;
    this._alvo = this.game.alvoPara(this.pos, this._alvo, (j) => this.podeMirar(j));
  }

  /** Quem este inimigo pode escolher como alvo: os comuns não entram na arena do chefe. */
  podeMirar(j) { return !j.inArena; }

  canEngage() {
    const p = this.alvo;
    return !p.dead && !p.inArena && !['rest', 'restUp', 'lying', 'standing', 'fog'].includes(p.state);
  }

  pickAttack(d) {
    const now = this.game.time;
    const options = this.cfg.attacks.filter((a) => !a.follow && d <= a.range && d >= (a.minRange ?? 0)
      && (!a.phase || a.phase <= (this.phase ?? 1)) && (!a.gap || now - (this.usedAt.get(a) ?? -99) > a.gap));
    if (!options.length) return null;
    const weighted = options.map((a) => ({ a, w: (a.weight ?? 1) * (this.lastAttacks.slice(-2).includes(a) ? 0.35 : 1) }));
    let r = Math.random() * weighted.reduce((s, x) => s + x.w, 0);
    for (const x of weighted) { r -= x.w; if (r <= 0) return x.a; }
    return weighted[0].a;
  }

  startAttack(atk) {
    const p = this.alvo;
    this.lastAttacks.push(atk); if (this.lastAttacks.length > 4) this.lastAttacks.shift();
    this.usedAt.set(atk, this.game.time);
    const spec = ATTACKS[atk.anim];
    const from = spec.from ?? 0, seg = spec.to - from;
    const speed = (atk.speed ?? 1) * this.speedMul;
    const dur = seg / speed;
    const data = { atk, dur, spec, speed, hitStart: (spec.hit[0] - from) / seg, hitEnd: (spec.hit[1] - from) / seg, endAt: 1 + (atk.recover ?? 0.3) / dur, arc: atk.arc ?? spec.arc, hitDone: false, swung: false, fx: false, recovering: false };
    if (atk.leap) {
      data.from = this.pos.clone();
      const d = flatDist(p.pos, this.pos);
      data.to = this.pos.clone().add(new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize().multiplyScalar(Math.max(0, Math.min(d - 1.8, 16))));
    }
    this.setState('attack', data);
    this.model.play(spec.clip, { loop: false, speed, from, restart: true, fade: 0.12 });
  }

  // Alvo de movimento: direto se houver linha de visão, senão pelo caminho no grid
  steerTarget(dt) {
    const p = this.alvo, world = this.game.world;
    this.pathT -= dt;
    if (this.pathT <= 0) {
      this.pathT = 0.4;
      this.waypoint = world.lineOfSight(this.pos, p.pos) ? null : world.nextWaypoint(this.pos, p.pos);
      this.unreachable = !this.waypoint && !world.lineOfSight(this.pos, p.pos);
    }
    return this.waypoint ?? p.pos;
  }

  updateAI(dt) {
    const game = this.game, p = this.alvo, cfg = this.cfg;
    const d = flatDist(p.pos, this.pos);
    const speed = cfg.speed * this.speedMul;
    let moving = 0, strafe = 0;

    switch (this.state) {
      case 'dormant':
        if (this.canEngage() && d < 6.5 && game.world.lineOfSight(this.pos, p.pos)) this.awaken();
        break;
      case 'awaken':
        if (this.stateT >= this.st.dur) { this.setState('chase'); this.cooldown = 0.4; }
        break;
      case 'idle':
        if (this.canEngage() && d < cfg.aggro && game.world.lineOfSight(this.pos, p.pos)) { this.setState('chase'); game.sfx.rattle(); }
        break;
      case 'return': {
        const toHome = flatDist(this.home, this.pos);
        this.hp = Math.min(this.maxHp, this.hp + dt * 20);
        if (toHome < 0.5) { this.setState('idle'); this.facing = this.homeFacing; break; }
        const tgt = game.world.lineOfSight(this.pos, this.home) ? this.home : (game.world.nextWaypoint(this.pos, this.home) ?? this.home);
        this.facing = turnTowards(this.facing, yawTo(this.pos, tgt), dt * 6);
        this.pos.x += Math.sin(this.facing) * speed * 0.7 * dt;
        this.pos.z += Math.cos(this.facing) * speed * 0.7 * dt;
        moving = speed * 0.7;
        if (this.canEngage() && d < cfg.aggro * 0.7 && game.world.lineOfSight(this.pos, p.pos)) this.setState('chase');
        break;
      }
      case 'chase': {
        const tgt = this.steerTarget(dt);
        if (!this.canEngage() || flatDist(this.pos, this.home) > 38 || this.unreachable) { this.setState('return'); break; }
        this.cooldown -= dt;
        const direct = tgt === p.pos;
        this.facing = turnTowards(this.facing, yawTo(this.pos, tgt), dt * cfg.turnRate);
        if (direct && this.cooldown <= 0) {
          const atk = this.pickAttack(d);
          if (atk) { this.startAttack(atk); break; }
        }
        this.strafeT -= dt;
        if (this.strafeT <= 0) { this.strafeT = 1.5 + Math.random() * 2; this.strafeDir *= -1; }
        const fwd = _v.set(Math.sin(this.facing), 0, Math.cos(this.facing));
        let want;
        if (!direct) want = 1;
        else if (cfg.ranged) want = d > 11 ? 1 : d < 5 ? -0.7 : 0;
        else want = d > this.engageRange() ? 1 : 0;
        if (want > 0) {
          const dir = game.world.avoid(this.pos, fwd.clone(), this.radius);
          this.pos.addScaledVector(dir, speed * dt); moving = speed;
        } else if (want < 0) { this.pos.addScaledVector(fwd, want * speed * dt); moving = speed * want; }
        else {
          const side = new THREE.Vector3(fwd.z, 0, -fwd.x);
          this.pos.addScaledVector(side, this.strafeDir * speed * 0.4 * dt);
          strafe = this.strafeDir;
        }
        break;
      }
      case 'attack': this.updateAttack(dt, p, d); break;
      case 'hurt':
        this.pos.addScaledVector(this.knock, dt);
        this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
        if (this.stateT >= this.st.dur) { this.setState('chase'); this.cooldown = 0.3; }
        break;
      case 'blockstun':
        if (this.stateT >= this.st.dur) { this.setState('chase'); this.cooldown = 0.2; }
        break;
      case 'dodge': {
        const roll = _v.set(Math.sin(this.facing), 0, Math.cos(this.facing));
        this.pos.addScaledVector(roll, 7 * Math.sin(Math.PI * Math.min(1, this.stateT / this.st.dur)) * dt);
        if (this.stateT >= this.st.dur) { this.setState('chase'); this.cooldown = 0; }
        break;
      }
    }
    this.animLoco(moving, strafe);
  }

  animLoco(moving, strafe) {
    const m = this.model;
    // Guerreiro com escudo ergue a guarda enquanto espera para atacar
    const p = this.alvo;
    this.guarding = !!this.cfg.blockChance && this.state === 'chase' && this.cooldown > 0.25 && flatDist(p.pos, this.pos) < 4.5;
    if (!['chase', 'return', 'idle'].includes(this.state)) return;
    if (this.guarding) { m.play('Idle_Shield_Loop', { fade: 0.15 }); return; }
    if (strafe) m.play('Walk_Loop', { speed: 1.0 });
    else if (moving > 0) m.play(this.cfg.runAnim, { speed: moving / this.cfg.runRef });
    else if (moving < 0) m.play('Walk_Loop', { speed: -1.2 });
    else m.play(this.idleAnim, { fade: 0.2 });
  }

  engageRange() {
    const ranges = this.cfg.attacks.filter((a) => !a.follow && !a.cast && !a.minRange).map((a) => a.range);
    return Math.max(1.5, Math.min(...ranges) * 0.85);
  }

  updateAttack(dt, p, d) {
    const game = this.game;
    const s = this.st, a = s.atk;
    const t = this.stateT / s.dur;
    if (t < s.hitStart * 0.85 && !a.leap) this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * this.cfg.turnRate * (a.trackMul ?? 1));
    const fwd = _v.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    if (a.leap && s.from) {
      const k = THREE.MathUtils.clamp((t - 0.15) / (s.hitStart - 0.15), 0, 1);
      if (t < 0.15) this.facing = turnTowards(this.facing, yawTo(this.pos, s.to), dt * 6);
      this.pos.x = THREE.MathUtils.lerp(s.from.x, s.to.x, k);
      this.pos.z = THREE.MathUtils.lerp(s.from.z, s.to.z, k);
      this.pos.y = this.game.world.alturaChao(this.pos) + Math.sin(k * Math.PI) * 4.5;
    }
    if (a.lunge && t > s.hitStart * 0.5 && t < s.hitEnd) {
      const close = d < this.radius + p.radius + 0.4;
      if (!close || a.dash) this.pos.addScaledVector(fwd, a.lunge * dt * this.speedMul);
    }
    if (!s.swung && t >= s.hitStart - 0.08) { s.swung = true; if (!a.cast) game.sfx.swing(this.cfg.scale > 1.3); }
    if (!a.cast && !s.hitDone && t >= s.hitStart && t <= s.hitEnd) {
      const reach = a.reach + p.radius;
      const allowed = s.arc + Math.atan2(p.radius, Math.max(d, 0.1));
      if (d <= reach && (s.arc >= 3 || angleToTarget(this.pos, this.facing, p.pos) <= allowed) && game.world.lineOfSight(this.pos, p.pos)) {
        const res = p.takeDamage(a.dmg, this.pos, { poise: a.poise, unblockable: a.unblockable });
        if (res !== 'iframe') s.hitDone = true;
      }
    }
    if (t >= s.hitStart && !s.fx) {
      s.fx = true;
      if (a.cast) this.doCast(a);
      if (a.shock) {
        const center = this.pos.clone().addScaledVector(fwd, a.leap ? 0 : a.reach * 0.7);
        center.y = game.world.alturaChao(center);
        game.projectiles.shock({ pos: center, maxR: a.shock.radius, speed: a.shock.speed ?? 10, damage: a.dmg * 0.6, poise: 60, skip: s.hitDone });
        game.sfx.slam();
        game.addShake(0.45);
        game.effects.burst(center.clone().setY(center.y + 0.2), { count: 40, color: [0.45, 0.4, 0.35], speed: 6, size: 0.22, life: 0.8, gravity: 8 });
      }
    }
    if (t >= 1 && !s.recovering) {
      s.recovering = true; this.pos.y = game.world.alturaChao(this.pos);
      if (a.after) this.model.play(a.after, { loop: false, fade: 0.1, restart: true });
      else this.model.play(this.idleAnim, { fade: 0.3 });
    }
    if (t >= s.endAt) {
      this.pos.y = game.world.alturaChao(this.pos);
      const next = a.next && this.cfg.attacks.find((x) => x.id === a.next);
      if (next && Math.random() < (a.nextChance ?? 0.6)) return this.startAttack(next);
      this.setState('chase');
      const [c0, c1] = this.cfg.cooldown;
      this.cooldown = (c0 + Math.random() * (c1 - c0)) / this.speedMul;
    }
  }

  doCast(a) {
    const game = this.game;
    const from = this.model.handR.getWorldPosition(new THREE.Vector3());
    from.y = Math.max(from.y, this.pos.y + 1.8);
    const target = this.alvo.pos.clone().setY(this.alvo.pos.y + 1.2);
    game.projectiles.orb({ pos: from, dir: target.sub(from), speed: 10, damage: a.dmg, homing: 1.2, alvo: this.alvo });
    game.sfx.cast();
  }

  // ---------- Atualização ----------
  update(dt) {
    this.stateT += dt;
    if (this.game.marionetes) return this.updateMarionete(dt);
    if (!this.active) return;
    this.escolherAlvo(dt);
    if (this.flashT > 0) { this.flashT -= dt; this.model.flash(this.flashT > 0); }
    if (this.burnT > 0 && !this.dead) {
      this.burnT -= dt;
      this.hp -= 6 * dt;
      if (Math.random() < 0.6) this.game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * this.height, (Math.random() - 0.5) * 0.8)), vel: new THREE.Vector3(0, 1.5, 0), color: [1, 0.5, 0.1], size: 0.18, life: 0.5 });
      if (this.hp <= 0) this.die();
    }
    if (this.dead) this.updateDeath(dt);
    else {
      this.updateAI(dt);
      const w = this.game.world;
      // pisa no chão de onde está (a escada, o andar de cima) — menos no salto,
      // que é quem cuida da própria altura
      if (!(this.state === 'attack' && this.st?.atk?.leap)) this.pos.y = w.alturaChao(this.pos);
      if (w.acimaDoChao(this.pos) <= 0.01) w.resolve(this.pos, this.radius);
    }
    this.model.root.rotation.y = this.facing;
    this.model.update(dt);
  }

  // ---------- Marionete (co-op, no CONVIDADO) ----------
  // No mundo de outro, quem decide o que este inimigo faz é o ANFITRIÃO: ele
  // manda o estado (`TIPO.MUNDO`, ver rede/coop.js) e aqui só se repete,
  // interpolado. Nada de IA, de dano, de alma: o golpe do convidado vai para
  // o anfitrião (`game.golpear`) e volta como vida nova aqui.

  /** Um retrato do anfitrião: `{x, y, z, g, a, s, hp, st, ativo, morto, visivel}`. */
  receberMarionete(e, quando) {
    (this.fio ??= new Interpolador()).receber(e, quando);
  }

  updateMarionete(dt) {
    const am = this.fio?.amostra();
    if (am) {
      const { a, b, k } = am, e = k < 0.5 ? a : b;
      this.pos.set(THREE.MathUtils.lerp(a.x, b.x, k), THREE.MathUtils.lerp(a.y, b.y, k), THREE.MathUtils.lerp(a.z, b.z, k));
      this.facing = a.g + giroCurto(b.g - a.g) * k;
      if (e.hp < this.hp - 0.5) { this.recentDmg = this.game.time - this.lastHit < 2.5 ? this.recentDmg + Math.round(this.hp - e.hp) : Math.round(this.hp - e.hp); this.lastHit = this.game.time; }
      this.hp = e.hp;
      this.active = e.ativo;
      this.model.root.visible = e.visivel;
      if (e.morto && !this.dead) {
        this.dead = true;
        this.setState('dead');
        this.model.play(this.deathAnim, { loop: false, fade: 0.1 });
        this.game.sfx.rattle();
      } else if (!e.morto && this.dead) {
        // RENASCEU lá (no mundo online os inimigos voltam por tempo): desfaz o
        // que a morte daqui deixou — o Carrasco encolhe ao morrer, e sem isto
        // voltaria do tamanho de um grão
        this.dead = false;
        this.model.root.scale.setScalar(1);
        this.model.flash(false);
        this.setState(e.st === 'dormant' ? 'acordado' : e.st);   // 'dormant' é posto logo abaixo, com a pose
      }
      if (!this.dead) {
        if (e.st === 'dormant' && this.state !== 'dormant') { this.setState('dormant'); this.poseDormindo(); }
        else if (e.st !== 'dormant') {
          if (this.state !== e.st) this.setState(e.st);
          if (e.a && e.a !== this.model.currentName) {
            this.model.play(e.a, { loop: loopa(e.a), speed: e.s || 1, fade: 0.12 });
            if (e.st === 'attack') this.game.sfx.swing(this.cfg.scale > 1.3);
          }
        }
      }
    }
    if (this.dead) this.updateDeath(dt);
    this.model.root.rotation.y = this.facing;
    this.model.update(dt);
  }

  /** Larga o modo marionete: de volta ao próprio mundo, `reset` põe de pé. */
  soltarMarionete() { this.fio = null; }

  /** A pose de quem dorme: deitado no chão (o Carrasco, ajoelhado junto ao cepo). */
  poseDormindo() { this.model.pose('LayToIdle', 0); }

  /**
   * ASSUMIR este inimigo no meio do caminho — o mundo online trocou de
   * simulador (`rede/mundo.js`) e ele deixa de ser marionete AQUI. `r` é o
   * último retrato dele (`protocolo.lerRetrato`), ou nada (mundo recém-aberto):
   * volta para casa inteiro, e com o retrato segue de onde estava.
   */
  retomar(r) {
    this.soltarMarionete();
    this.reset();
    if (!r || r.morto || !r.ativo) return;
    this.pos.set(r.x, r.y, r.z);
    this.facing = r.g;
    this.hp = Math.min(this.maxHp, Math.max(1, r.hp));
    if (r.st === 'dormant') return;                       // `reset` já o deitou, se ele é dos que dormem
    this.setState(r.st === 'idle' || r.st === 'return' ? r.st : 'chase');
    this.model.play(this.idleAnim, { fade: 0 });
  }

  updateDeath() {
    if (this.stateT > 3) {
      const k = (this.stateT - 3) / 1.2;
      this.pos.y = this.game.world.alturaChao(this.pos) - k * 0.8;
      if (Math.random() < 0.4) this.game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.3, (Math.random() - 0.5) * 1.5)), vel: new THREE.Vector3(0, 1 + Math.random(), 0), color: [0.4, 0.38, 0.35], size: 0.1, life: 1.2 });
      if (k >= 1) { this.active = false; this.model.root.visible = false; }
    }
  }
}

// Posições em células do grid: [linha, coluna, deslocamento x, deslocamento z]
export function spawnEnemies(game) {
  const list = [];
  const at = (r, c, dx = 0, dz = 0) => new THREE.Vector3(c * CELL + dx * S, 0, r * CELL + dz * S);
  const add = (type, r, c, facing = Math.PI, opts = {}, dx = 0, dz = 0) => list.push(new Enemy(game, ENEMY_TYPES[type], at(r, c, dx, dz), facing, opts));
  // Corredor das celas
  add('minion', 23, 12, -Math.PI / 2, { dormant: true });
  // Sala da guarda
  add('minion', 16, 5, 0, { dormant: true });
  add('minion', 15, 9, 0, { dormant: true }, 0, 0.5);
  add('rogue', 17, 9, Math.PI);
  // Alcova do tesouro
  add('warrior', 16, 12, -Math.PI / 2);
  // Ossário
  add('warrior', 11, 7, 0, {}, 0, 1.6);
  add('minion', 12, 5, 0, { dormant: true }, 1.5, 0);
  add('minion', 10, 9, 0, { dormant: true });
  add('rogue', 9, 4, Math.PI / 2);
  add('mage', 9, 11, Math.PI, {}, 0, -0.5);
  add('mage', 13, 3, Math.PI / 2);
  // Floresta e ruínas (mapa `floresta`): só onde a célula É ar livre — com o
  // mapa `original` ativo ela é rocha, e o inimigo nasceria dentro da pedra.
  const fora = (type, r, c, facing, opts = {}) => {
    if (game.world?.isOpenAir?.(r, c)) add(type, r, c, facing, opts);
  };
  fora('minion', 15, 18, -Math.PI / 2, { dormant: true });
  fora('minion', 17, 19, -Math.PI / 2, { dormant: true });
  fora('minion', 14, 20, -Math.PI / 2, { dormant: true });
  fora('rogue', 12, 22, Math.PI / 2);
  // A estrada do acampamento (02/10/2026): o primeiro susto de quem nasce do
  // lado de fora, já longe da fogueira de lá. Sempre no FIM da lista: o `netId`
  // de cada inimigo é a posição dele aqui (`e<i>`, ver main.js).
  fora('minion', 15, 27, Math.PI / 2, { dormant: true });
  fora('minion', 17, 26, Math.PI / 2, { dormant: true });
  return list;
}
