import * as THREE from 'three';
import { CharacterModel, ATTACKS, weaponMesh, shieldMesh } from './character.js';
import { corpoGuardado, armaduraDe } from './guerreiro.js';
import { angleToTarget, yawTo, turnTowards, flatDist } from './combat.js';
import { ITEMS, UNARMED, TORCH_LIFE } from './items.js';
import { START_POS } from './world.js';
import { Assets } from './assets.js';

const SPRINT_HOLD = 0.28;
const ROLL_COST = 22;
const _v = new THREE.Vector3();

// estados em que a mão esquerda faz outra coisa (ou o boneco está no chão): sem as duas mãos na arma
export const MAO_OCUPADA = ['heal', 'item', 'interact', 'dead', 'rest', 'restUp', 'lying', 'standing'];

export class Player {
  constructor(game) {
    this.game = game;
    this.model = new CharacterModel({ outfit: 'knight', armadura: armaduraDe(corpoGuardado()) });   // o corpo do provador
    game.scene.add(this.model.root);
    this.pos = this.model.root.position;
    this.radius = 0.42;
    this.height = 1.85;

    // Luz fraca que sempre acompanha o jogador (para não ficar 100% no breu)
    this.soulLight = new THREE.PointLight(0x8090b8, 7.0, 11, 2);
    this.soulLight.position.set(0, 2.4, -1.4);
    this.model.root.add(this.soulLight);

    // Tocha empunhada: modelo, chama e luz com sombra
    this.torchMesh = weaponMesh('torch');
    this.torchFlame = game.world.makeFlame(0.32);
    this.torchFlame.position.copy(this.torchMesh.userData.flameAt);
    this.torchMesh.add(this.torchFlame);
    this.torchLight = new THREE.PointLight(0xff9448, 0, 24, 1.3);
    this.torchLight.castShadow = true;
    this.torchLight.shadow.mapSize.set(512, 512);
    this.torchLight.shadow.bias = -0.003;
    this.torchLight.shadow.camera.near = 0.2;
    this.torchLight.shadow.intensity = 0.65;
    game.scene.add(this.torchLight);

    this.level = 1; this.vigor = 10; this.endurance = 10; this.strength = 10;
    this.souls = 0;
    this.receitas = new Set();    // receitas descobertas na panela (receitas.js), pelo id
    this.fogueira = 'masmorra';   // a última em que descansou: é onde renasce (ver `World.retorno`)
    // status com tempo (segundos que faltam). As COMIDAS (items.js, `use: 'comer'`)
    // dão `regen` (cura aos poucos, `regenPorSeg`), `folego`, `fortaleza` e `furia`.
    this.buffs = { resin: 0, blossom: 0, regen: 0, folego: 0, fortaleza: 0, furia: 0 };
    this.regenPorSeg = 0;
    this.camYaw = Math.PI; this.camPitch = 0.3; this.camDist = 5.2;
    this.lockTarget = null;
    this.spaceHeld = 0;
    this.buffer = null; this.bufferT = 0;
    this.blockHitT = 0;
    this.stepTimer = 0;
    this.knock = new THREE.Vector3();
    this.facing = Math.PI;
    this.hp = this.maxHp; this.stamina = this.maxStamina; this.staminaDelay = 0;
    this.state = 'free'; this.stateT = 0; this.st = {};
    this.inArena = false;
    this.refreshEquipment();
  }

  // ---------- Atributos ----------
  get inv() { return this.game.inventory; }
  get weapon() { const id = this.inv.equipped.weapon; return id ? ITEMS[id] : UNARMED; }
  get left() { return this.inv.equipped.left; }
  get torchLit() { return this.left === 'torch'; }
  get shield() { return this.left && ITEMS[this.left].type === 'shield' && !this.weapon.twoHanded ? ITEMS[this.left] : null; }
  ringEffect(key) {
    let v = 0;
    for (const id of this.inv.equipped.rings) if (id) v += ITEMS[id].effect[key] ?? 0;
    return v;
  }
  get maxHp() { return Math.round((200 + (this.vigor - 10) * 22) * (1 + this.ringEffect('hpMul'))); }
  get maxStamina() { return 90 + (this.endurance - 10) * 6; }
  get poise() { return 12 + this.ringEffect('poise'); }
  get defense() { return this.ringEffect('defense') + (this.buffs.fortaleza > 0 ? 0.15 : 0); }
  get damageMul() { return (1 + (this.strength - 10) * 0.06) * (this.buffs.resin > 0 ? 1.35 : 1) * (this.buffs.furia > 0 ? 1.2 : 1); }
  get dead() { return this.state === 'dead'; }
  get iframes() {
    if (this.state === 'roll') { const p = this.stateT / this.st.dur; return p > 0.05 && p < 0.62; }
    return ['fog', 'rest', 'restUp', 'lying', 'standing'].includes(this.state);
  }
  /**
   * A GUARDA (03/10/2026): com escudo, o escudo; com arma de DUAS MÃOS (o escudo
   * vai para as costas), a própria arma — como no Dark Souls, segura menos. `pose`
   * é o clipe enquanto segura (`segura` = o quadro em que ele para), `golpe` o de
   * quando aparou um golpe, `estabilidade` quanto do golpe ela absorve.
   */
  get guarda() {
    if (this.shield) return { estabilidade: this.shield.stability, pose: 'Idle_Shield_Loop', loop: true, golpe: 'Shield_OneShot', mao: 'l' };
    const w = this.weapon;
    // (com a tocha na esquerda, o botão direito é o golpe dela: sem guarda)
    if (w.twoHanded && !this.torchLit) return { estabilidade: w.guarda ?? 0.4, pose: 'Sword_Block', loop: false, segura: 0.45, golpe: 'Sword_Block', mao: 'r' };
    return null;
  }
  get blocking() {
    return this.state === 'free' && this.game.input.mouseDown[2] && this.stamina > 0 && !!this.guarda;
  }

  // Posição inicial: deitado na cela
  startInCell() {
    this.pos.copy(START_POS);
    this.facing = Math.PI;
    this.camYaw = Math.PI;
    this.setState('lying');
    this.model.pose('LayToIdle', 0);
  }

  /**
   * Nasce no ACAMPAMENTO, do lado de fora (o mundo online): acorda junto à
   * fogueira de lá, que já é o ponto de retorno. Sem a cena da cela.
   */
  startOutside() {
    this.fogueira = 'acampamento';
    this.respawn();
  }

  /** Acorda junto à última fogueira em que descansou (`this.fogueira`). */
  respawn() {
    const { pos, rumo } = this.game.world.retorno(this.fogueira, this.game.regras.espalharAoAcordar);
    this.pos.copy(pos);
    this.facing = rumo; this.camYaw = rumo;
    this.hp = this.maxHp; this.stamina = this.maxStamina; this.staminaDelay = 0;
    for (const k in this.buffs) this.buffs[k] = 0;
    this.lockTarget = null;
    this.inArena = false;
    this.knock.set(0, 0, 0);
    this.setState('standing', { dur: 1.7 });
    this.model.pose('LayToIdle', 0);
    this.model.play('LayToIdle', { loop: false, fade: 0, duration: 1.7, restart: true });
  }

  refreshEquipment() {
    const w = this.weapon;
    let right = null;
    if (w.model) {
      right = weaponMesh(w.model);
      // Materiais próprios (brilho da resina não afeta outras armas)
      right.traverse((c) => { if (c.isMesh) c.material = c.material.clone(); });
    }
    this.model.equip('r', right);
    let leftObj = null, costas = null;
    if (this.left === 'torch') leftObj = this.torchMesh;
    // com arma de duas mãos o escudo vai para as COSTAS: aparece, mas quem guarda é a arma
    else if (this.left) { const s = shieldMesh(ITEMS[this.left].model); if (w.twoHanded) costas = s; else leftObj = s; }
    this.model.equip('l', leftObj);
    this.model.equipCostas(costas);
    this.torchFlame.visible = this.left === 'torch';
    this.hp = Math.min(this.hp, this.maxHp);
  }

  setState(s, data = {}) { this.state = s; this.stateT = 0; this.st = data; }

  // ---------- Entrada ----------
  moveInput() {
    const inp = this.game.input;
    let x = 0, z = 0;
    if (inp.isDown('KeyW')) z += 1;
    if (inp.isDown('KeyS')) z -= 1;
    if (inp.isDown('KeyD')) x += 1;
    if (inp.isDown('KeyA')) x -= 1;
    // o joystick do celular (js/toque.js): a zona morta no meio evita o boneco
    // andando sozinho com o polegar só encostado
    const e = inp.eixo;
    if (!x && !z && e && Math.hypot(e.x, e.z) > 0.2) { x = e.x; z = e.z; }
    if (!x && !z) return null;
    const fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    return new THREE.Vector3(fx * z - fz * x, 0, fz * z + fx * x).normalize();
  }

  toggleLock() {
    if (this.lockTarget) { this.lockTarget = null; return; }
    let best = null, bestScore = Infinity;
    for (const e of this.game.allEnemies()) {
      if (e.dead || !e.active || e.lockable === false) continue;
      const d = flatDist(e.pos, this.pos);
      if (d > 18) continue;
      const ang = angleToTarget(this.pos, this.camYaw, e.pos);
      if (ang > 1.3) continue;
      if (!this.game.world.lineOfSight(this.pos, e.pos)) continue;
      const score = ang * 8 + d;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    this.lockTarget = best;
    if (!best) this.camYaw = this.facing;
  }

  bufferAction(a) { this.buffer = a; this.bufferT = 0.4; }

  toggleTorch() {
    const inv = this.inv;
    if (!inv.count('torch')) return false;
    if (this.left === 'torch') inv.equipped.left = inv.lastShield;
    else { if (this.left) inv.lastShield = this.left; inv.equipped.left = 'torch'; this.game.sfx.torchIgnite(); }
    this.refreshEquipment();
    return true;
  }

  // ---------- Atualização ----------
  update(dt) {
    const game = this.game, inp = game.input;
    this.stateT += dt;
    this.bufferT -= dt;
    if (this.bufferT <= 0) this.buffer = null;
    for (const k in this.buffs) this.buffs[k] = Math.max(0, this.buffs[k] - dt);
    this.blockHitT = Math.max(0, this.blockHitT - dt);

    if (!this.lockTarget) {
      this.camYaw -= inp.dx * 0.0024;
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + inp.dy * 0.0024, -0.3, 1.0);
    }
    if (inp.pressed('KeyQ') || inp.mousePressed(1)) this.toggleLock();
    if (this.lockTarget && (this.lockTarget.dead || !this.lockTarget.active || flatDist(this.lockTarget.pos, this.pos) > 24)) this.lockTarget = null;
    if (inp.pressed('KeyT') && !this.dead) this.toggleTorch();

    // Espaço: toque = rolar, segurar = correr
    // "Armado" no keydown: um toque rápido (apertar e soltar no mesmo frame) também rola
    let rollPressed = false;
    if (inp.pressed('Space')) { this.spaceArmed = true; this.spaceHeld = 0; }
    if (inp.isDown('Space')) this.spaceHeld += dt;
    if (inp.released('Space')) {
      if (this.spaceArmed && this.spaceHeld < SPRINT_HOLD) rollPressed = true;
      this.spaceHeld = 0;
      this.spaceArmed = false;
    }
    if (rollPressed) this.bufferAction('roll');
    if (inp.mousePressed(0)) this.bufferAction('light');
    if (inp.pressed('KeyF')) this.bufferAction('heavy');
    if (inp.pressed('KeyR')) this.bufferAction('item');
    if (inp.mousePressed(2) && this.torchLit) this.bufferAction('torch');

    const dir = this.dead ? null : this.moveInput();
    let staminaUse = false;
    this.moveSpeed = 0;

    switch (this.state) {
      case 'free': {
        if (this.buffer && this.tryAction(this.buffer, dir)) break;
        const sprint = dir && inp.isDown('Space') && this.spaceHeld >= SPRINT_HOLD && this.stamina > 0;
        const blocking = this.blocking;
        const speed = blocking ? 1.8 : sprint ? 6.8 : 4.3;
        if (dir) {
          this.pos.addScaledVector(dir, speed * dt);
          this.moveSpeed = speed;
          const faceTarget = this.lockTarget && !sprint;
          const want = faceTarget ? yawTo(this.pos, this.lockTarget.pos) : Math.atan2(dir.x, dir.z);
          this.facing = turnTowards(this.facing, want, dt * 12);
        } else if (this.lockTarget) {
          this.facing = turnTowards(this.facing, yawTo(this.pos, this.lockTarget.pos), dt * 10);
        }
        if (sprint) { this.stamina -= 14 * dt; staminaUse = true; this.staminaDelay = 0.4; }
        this.st.sprint = sprint;
        this.st.dir = dir;
        break;
      }
      case 'attack': this.updateAttack(dt, dir); break;
      case 'roll': this.updateRoll(dt); break;
      case 'hurt':
        this.pos.addScaledVector(this.knock, dt);
        this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
        if (this.stateT >= this.st.dur) this.setState('free');
        break;
      case 'heal': case 'item': this.updateItemUse(dt, dir); break;
      case 'interact':
        if (this.st.face !== undefined) this.facing = turnTowards(this.facing, this.st.face, dt * 10);
        if (!this.st.done && this.stateT >= this.st.at) { this.st.done = true; this.st.fn?.(); }
        if (this.stateT >= this.st.dur) this.setState('free');
        break;
      case 'standing': case 'restUp':
        if (this.stateT >= (this.st.dur ?? 1.1)) this.setState('free');
        break;
      case 'fog':
        this.pos.z -= dt * 3.2;
        this.facing = Math.PI;
        this.moveSpeed = 3.2;
        if (this.stateT >= 2.3) { this.inArena = true; this.setState('free'); game.onEnterArena(); }
        break;
    }

    // Cura aos poucos (comida com `regen`)
    if (this.buffs.regen > 0 && !this.dead) this.hp = Math.min(this.maxHp, this.hp + this.regenPorSeg * dt);

    // Vigor
    if (this.staminaDelay > 0) this.staminaDelay -= dt;
    else if (!staminaUse && this.state !== 'attack' && this.state !== 'roll') {
      let regen = 52 * (1 + this.ringEffect('staminaRegen') + (this.buffs.blossom > 0 || this.buffs.folego > 0 ? 0.6 : 0));
      if (this.blocking) regen *= 0.35;
      this.stamina = Math.min(this.maxStamina, this.stamina + regen * dt);
    }
    if (this.stamina < 0) { this.stamina = 0; this.staminaDelay = Math.max(this.staminaDelay, 0.9); }

    // Tocha queimando
    if (this.torchLit) {
      this.inv.torchTime -= dt;
      if (this.inv.torchTime <= 0) game.onTorchBurnedOut();
    }

    if (this.state !== 'fog') game.world.resolve(this.pos, this.radius);
    // Névoa ABERTA (o Carrasco caiu): entra-se e sai-se da arena a pé, e "estar na
    // arena" passa a ser onde se pisa. Sem isto quem vencia o chefe saía de lá
    // ainda marcado, e os inimigos de fora o ignoravam para sempre.
    if (game.world.gateOpen && this.state !== 'fog') this.inArena = game.world.isArenaCell(...game.world.cellOf(this.pos));
    // pisa no chão de onde está: 0, a rampa da escada ou o andar de cima
    this.pos.y = game.world.alturaChao(this.pos);

    if (this.moveSpeed > 0 && this.state === 'free') {
      this.stepTimer -= dt * this.moveSpeed;
      if (this.stepTimer <= 0) { this.stepTimer = 1.7; game.sfx.step(); }
    }
    this.animate(dt);
  }

  tryAction(a, dir) {
    if (a === 'roll') {
      if (this.stamina <= 0) return false;
      this.buffer = null; this.startRoll(dir); return true;
    }
    if (a === 'light' || a === 'heavy') {
      if (this.stamina <= 0) return false;
      this.buffer = null; this.startAttack(a, 0, dir); return true;
    }
    if (a === 'torch') {
      if (this.stamina <= 0 || !this.torchLit) return false;
      this.buffer = null; this.startAttack('torch', 0, dir); return true;
    }
    if (a === 'item') {
      this.buffer = null;
      const id = this.inv.useQuick();
      if (!id) return false;
      this.startItemUse(id); return true;
    }
    return false;
  }

  // ---------- Ataque ----------
  startAttack(kind, combo = 0, dir = null) {
    let w = this.weapon;
    let key;
    if (kind === 'torch') {
      w = { ...ITEMS.torch, speed: 1.1, stamina: 12, reach: 1.7, poise: 12 };
      key = 'jab';
    } else {
      key = kind === 'heavy' ? w.heavy : w.light[combo % w.light.length];
    }
    const heavy = kind === 'heavy';
    const spec = ATTACKS[key];
    const from = spec.from ?? 0;
    const seg = spec.to - from;
    const speed = w.speed * (heavy ? 0.9 : 1);
    const dur = seg / speed;
    const data = {
      kind, combo, key, dur,
      hitStart: (spec.hit[0] - from) / seg, hitEnd: (spec.hit[1] - from) / seg, endAt: 1 + 0.14 / dur,
      arc: spec.arc, reach: w.reach + (heavy ? 0.2 : 0),
      damage: w.damage * (heavy ? 1.55 : 1) * this.damageMul,
      poise: (w.poise ?? 10) * (heavy ? 1.8 : 1),
      fire: kind === 'torch',
      hitSet: new Set(), queued: null, swung: false, recovering: false,
    };
    this.stamina -= w.stamina * (heavy ? 1.6 : 1);
    this.staminaDelay = 0.6;
    if (this.lockTarget) this.facing = yawTo(this.pos, this.lockTarget.pos);
    else if (dir) this.facing = Math.atan2(dir.x, dir.z);
    this.setState('attack', data);
    this.model.play(spec.clip, { loop: false, speed, from, restart: true, fade: 0.1 });
  }

  updateAttack(dt, dir) {
    const a = this.st, game = this.game;
    const p = this.stateT / a.dur;
    if (p < a.hitStart * 0.8) {
      const want = this.lockTarget ? yawTo(this.pos, this.lockTarget.pos) : dir ? Math.atan2(dir.x, dir.z) : this.facing;
      this.facing = turnTowards(this.facing, want, dt * 5);
    }
    if (p > a.hitStart * 0.4 && p < a.hitEnd) {
      const close = this.lockTarget && flatDist(this.lockTarget.pos, this.pos) < this.lockTarget.radius + 1.1;
      if (!close) this.pos.addScaledVector(_v.set(Math.sin(this.facing), 0, Math.cos(this.facing)), (a.kind === 'heavy' ? 2.2 : 1.6) * dt);
    }
    if (!a.swung && p >= a.hitStart - 0.06) { a.swung = true; game.sfx.swing(a.kind === 'heavy'); }
    if (p >= a.hitStart && p <= a.hitEnd) {
      for (const e of game.allEnemies()) {
        if (e.dead || !e.active || a.hitSet.has(e)) continue;
        const d = flatDist(e.pos, this.pos);
        if (d > a.reach + e.radius) continue;
        const allowed = a.arc + Math.atan2(e.radius, Math.max(d, 0.1));
        if (a.arc < 3 && angleToTarget(this.pos, this.facing, e.pos) > allowed) continue;
        a.hitSet.add(e);
        const res = this.game.golpear(e, a.damage, this.pos, a.poise, { fire: a.fire || this.buffs.resin > 0 });
        if (res) {
          game.hitstop = a.kind === 'heavy' ? 0.1 : 0.06;
          game.addShake(a.kind === 'heavy' ? 0.2 : 0.1);
          if (res === 'blocked') game.sfx.block(); else game.sfx.hit();
          if (a.fire) { e.ignite?.(3); game.effects.burst(e.pos.clone().setY(e.pos.y + e.height * 0.6), { count: 25, color: [1, 0.5, 0.1], speed: 4, size: 0.18, life: 0.5, gravity: -1 }); }
        }
      }
    }
    // barris, caixotes, sacos... (world.quebraveis): o golpe que pega, quebra
    if (p >= a.hitStart && p <= a.hitEnd) {
      for (const q of game.world.quebraveisPerto(this.pos, a.reach)) {
        if (a.hitSet.has(q)) continue;
        const d = flatDist(q.pos, this.pos);
        if (a.arc < 3 && angleToTarget(this.pos, this.facing, q.pos) > a.arc + Math.atan2(q.raio, Math.max(d, 0.1))) continue;
        a.hitSet.add(q);
        game.quebrar(q, this.pos);
      }
    }
    if (p > 0.25 && this.buffer && !a.queued) { a.queued = this.buffer; this.buffer = null; }
    if (p >= a.hitEnd + 0.08 && a.queued) {
      const q = a.queued; a.queued = null;
      if ((q === 'light' || q === 'heavy') && this.stamina > 0) return this.startAttack(q, a.combo + 1, dir);
      if (q === 'torch' && this.stamina > 0 && this.torchLit) return this.startAttack('torch', 0, dir);
      if (q === 'roll' && this.stamina > 0) return this.startRoll(dir);
      this.bufferAction(q);
    }
    // Fim do trecho do clipe: volta suavemente para a guarda
    if (p >= 1 && !a.recovering) { a.recovering = true; this.model.play(this.idleAnim, { fade: 0.25 }); }
    if (p >= a.endAt) this.setState('free');
  }

  // ---------- Rolamento ----------
  // Rolamento na direção do movimento; sem direção, rola para a frente do personagem
  startRoll(dir) {
    this.stamina -= ROLL_COST;
    this.staminaDelay = 0.55;
    const d = dir ?? new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.facing = Math.atan2(d.x, d.z);
    const dur = 0.78;
    this.setState('roll', { dir: d.clone(), dur });
    this.model.play('Roll', { loop: false, duration: dur, restart: true, fade: 0.06 });
    this.game.sfx.roll();
  }

  updateRoll(dt) {
    const r = this.st;
    const p = Math.min(1, this.stateT / r.dur);
    const speed = 9 * Math.sin(Math.PI * Math.min(1, p * 1.08));
    this.pos.addScaledVector(r.dir, speed * dt);
    if (p > 0.82 && this.buffer === 'light' && this.stamina > 0) { this.buffer = null; return this.startAttack('light', 0, r.dir); }
    if (p >= 1) this.setState('free');
  }

  get idleAnim() {
    // arma de duas mãos (sem a tocha na esquerda): a guarda de espadão do Mixamo, se carregou
    if (this.weapon.twoHanded && !this.torchLit && Assets.clips.GreatSword_Idle) return 'GreatSword_Idle';
    if (this.weapon.model) return 'Sword_Idle';
    return this.torchLit ? 'Idle_Torch_Loop' : 'Idle_Loop';
  }

  // ---------- Interações e itens ----------
  startInteract(anim, fn, { dur = 1.0, at = 0.45, face } = {}) {
    this.lockTarget = null;
    this.setState('interact', { fn, dur, at, face, done: false });
    // PEGAR DO CHÃO = o Farm_Harvest do UAL: a mão desce a ~26 cm do chão aos 45% do clipe —
    // o mesmo `at` em que o item é entregue (o PickUp_Table, de antes, nem baixava a mão)
    const clip = { PickUp: 'Farm_Harvest', Interact: 'Interact', Chest: 'Chest_Open' }[anim] ?? anim;
    this.model.play(clip, { loop: false, duration: dur / 0.85, restart: true, fade: 0.12 });
  }

  startItemUse(id) {
    const def = ITEMS[id];
    const dur = { heal: 1.3, comer: 1.3, throw: 0.9, resin: 1.0, blossom: 1.0, souls: 0.9, home: 1.8 }[def.use] ?? 1;
    // comer é como beber o frasco era: lento, e um golpe forte interrompe (estado 'heal')
    this.setState(def.use === 'heal' || def.use === 'comer' ? 'heal' : 'item', { id, def, dur, applied: false });
    this.model.play(def.use === 'throw' ? 'OverhandThrow' : 'Consume', { loop: false, duration: def.use === 'throw' ? dur / 0.85 : dur, restart: true });
  }

  updateItemUse(dt, dir) {
    const s = this.st, p = this.stateT / s.dur, game = this.game;
    if (dir) {
      this.pos.addScaledVector(dir, 1.2 * dt);
      if (!this.lockTarget) this.facing = turnTowards(this.facing, Math.atan2(dir.x, dir.z), dt * 5);
    }
    if (this.lockTarget) this.facing = turnTowards(this.facing, yawTo(this.pos, this.lockTarget.pos), dt * 8);
    const applyAt = { heal: 0.5, comer: 0.55, throw: 0.5, home: 0.95 }[s.def.use] ?? 0.6;
    if ((s.def.use === 'heal' || s.def.use === 'comer') && p < applyAt && Math.random() < 0.5) {
      game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 1.8, (Math.random() - 0.5) * 0.8)), vel: new THREE.Vector3(0, 1.2, 0), color: [1, 0.6, 0.2], size: 0.1, life: 0.7 });
    }
    if (!s.applied && p >= applyAt) { s.applied = true; this.applyItem(s.def); }
    if (p >= 1) this.setState('free');
  }

  applyItem(def) {
    const game = this.game;
    switch (def.use) {
      case 'heal':
        this.hp = Math.min(this.maxHp, this.hp + def.amount);
        game.sfx.heal();
        game.effects.burst(this.pos.clone().setY(this.pos.y + 1.2), { count: 30, color: [1, 0.7, 0.3], speed: 2, size: 0.12, life: 0.8, gravity: -2 });
        break;
      case 'throw': {
        const from = this.model.handR.getWorldPosition(new THREE.Vector3());
        from.y = Math.max(from.y, this.pos.y + 1.8);
        let vel;
        if (this.lockTarget) {
          const to = this.lockTarget.pos;
          const d = flatDist(to, from);
          const t = Math.max(0.3, d / 12);
          vel = new THREE.Vector3(to.x - from.x, 0, to.z - from.z).normalize().multiplyScalar(d / t);
          vel.y = (0.5 * 16 * t * t - (from.y - 1.0)) / t;
        } else {
          vel = new THREE.Vector3(Math.sin(this.facing) * 10, 4.5, Math.cos(this.facing) * 10);
        }
        game.projectiles.bomb({ pos: from, vel, damage: def.damage * (1 + (this.strength - 10) * 0.03), radius: def.radius });
        game.sfx.swing();
        break;
      }
      case 'comer':
        this.hp = Math.min(this.maxHp, this.hp + (def.cura ?? 0));
        if (def.regen) { this.buffs.regen = def.regen.dur; this.regenPorSeg = def.regen.porSeg; }
        if (def.efeito) this.buffs[def.efeito.tipo] = def.efeito.dur;
        game.sfx.heal();
        game.effects.burst(this.pos.clone().setY(this.pos.y + 1.2), { count: 24, color: [1, 0.75, 0.35], speed: 2, size: 0.11, life: 0.8, gravity: -2 });
        break;
      case 'resin': this.buffs.resin = def.duration; game.sfx.torchIgnite(); break;
      case 'blossom': this.buffs.blossom = def.duration; game.sfx.heal(); break;
      case 'souls': game.addSouls(def.amount); game.effects.soulStream(this.pos.clone().setY(this.pos.y + 1.5), 25); break;
      case 'home': game.teleportHome(); break;
    }
  }

  // ---------- Dano recebido ----------
  takeDamage(amount, srcPos, { poise = 30, unblockable = false } = {}) {
    const game = this.game;
    if (this.dead || this.iframes) return 'iframe';
    if (this.blocking && !unblockable && angleToTarget(this.pos, this.facing, srcPos) < 1.25) {
      const guarda = this.guarda, stability = guarda.estabilidade;
      this.stamina -= amount * (1.5 - stability);
      this.staminaDelay = 0.8;
      const pushDir = new THREE.Vector3(this.pos.x - srcPos.x, 0, this.pos.z - srcPos.z).normalize();
      game.effects.sparks((guarda.mao === 'r' ? this.model.handR : this.model.handL).getWorldPosition(new THREE.Vector3()));
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.hp -= amount * 0.3;
        game.sfx.guardBreak();
        this.knock.copy(pushDir).multiplyScalar(4);
        this.setState('hurt', { dur: 1.1 });
        this.model.play('Idle_Shield_Break', { loop: false, duration: 1.1, restart: true });
        game.addShake(0.3);
        if (this.hp <= 0) this.die();
      } else {
        this.hp -= amount * (1 - stability) * 0.15;
        game.sfx.block();
        this.blockHitT = 0.35;
        this.pos.addScaledVector(pushDir, Math.min(0.7, amount * 0.012));
        game.addShake(0.1);
      }
      return 'blocked';
    }
    this.hp -= amount * (1 - this.defense);
    game.ui.hurtFlash();
    game.effects.blood(this.pos.clone().setY(this.pos.y + 1.4));
    game.sfx.playerHurt();
    game.addShake(0.3);
    game.hitstop = 0.05;
    if (this.hp <= 0) { this.die(); return 'hit'; }
    if (poise > this.poise || this.state === 'heal' || this.state === 'item' || this.state === 'interact') {
      const pushDir = new THREE.Vector3(this.pos.x - srcPos.x, 0, this.pos.z - srcPos.z).normalize();
      this.knock.copy(pushDir).multiplyScalar(Math.min(9, 2 + poise * 0.06));
      this.facing = yawTo(this.pos, srcPos);
      const dur = poise > 60 ? 0.8 : 0.5;
      this.setState('hurt', { dur });
      this.model.play(poise > 60 ? 'Hit_Knockback' : 'Hit_Chest', { loop: false, duration: dur + 0.1, restart: true, fade: 0.05 });
    }
    return 'hit';
  }

  die() {
    this.hp = 0;
    this.lockTarget = null;
    this.setState('dead');
    this.model.play('Death01', { loop: false, duration: 2.0, fade: 0.1 });
    this.game.onPlayerDeath();
  }

  // ---------- Animação ----------
  animate(dt) {
    const m = this.model;
    this.model.root.rotation.y = this.facing;
    // arma de duas mãos: a esquerda vai ao cabo (character.js), menos com ela ocupada
    m.duasMaos = !!this.weapon.twoHanded && !this.torchLit && !MAO_OCUPADA.includes(this.state);
    if (this.state === 'free') {
      if (this.blockHitT > 0 && this.guarda) m.play(this.guarda.golpe, { loop: false, fade: 0.05 });
      else if (this.blocking) {
        const g = this.guarda, a = m.play(g.pose, { loop: g.loop, fade: 0.12 });
        // a guarda com a arma é o MEIO do Sword_Block (a espada atravessada): para ali
        if (g.segura && a && a.time >= g.segura) a.paused = true;
      }
      else if (this.moveSpeed > 0) {
        const dir = this.st.dir;
        const fx = Math.sin(this.facing), fz = Math.cos(this.facing);
        const fwd = dir ? dir.x * fx + dir.z * fz : 1;
        if (this.lockTarget && !this.st.sprint && fwd < -0.3) m.play('Walk_Loop', { speed: -1.6 });
        else if (this.st.sprint) m.play('Sprint_Loop', { speed: this.moveSpeed / 6.2 });
        else if (this.moveSpeed < 2.5) m.play('Walk_Loop', { speed: this.moveSpeed / 1.5 });
        else m.play('Jog_Fwd_Loop', { speed: this.moveSpeed / 3.9 });
      } else m.play(this.idleAnim, { fade: 0.25 });
    } else if (this.state === 'fog') {
      m.play('Walk_Loop', { speed: 1.6 });
    } else if (this.state === 'rest') {
      m.play('Crouch_Idle_Loop', { fade: 0.5 });
    } else if (this.state === 'restUp') {
      m.play(this.idleAnim, { fade: 0.5 });
    }
    m.update(dt);

    // Tocha: luz segue a chama
    if (this.torchLit && this.model.root.visible) {
      this.torchFlame.getWorldPosition(this.torchLight.position);
      this.torchLight.position.y += 0.25;
      const t = this.game.time;
      this.torchLight.intensity = 32 * (1 + Math.sin(t * 12) * 0.08 + Math.sin(t * 19.7) * 0.06 + (Math.random() - 0.5) * 0.06);
      if (Math.random() < dt * 8) {
        this.game.effects.spawn({ pos: this.torchLight.position.clone(), vel: new THREE.Vector3((Math.random() - 0.5) * 0.4, 1 + Math.random(), (Math.random() - 0.5) * 0.4), color: [1, 0.55, 0.2], size: 0.06, life: 0.7, gravity: -0.2 });
      }
    } else this.torchLight.intensity = 0;
    // Quando a sombra da tocha é redesenhada (só acesa; no Médio, a cada 2
    // quadros) quem decide é `Graficos.update` (js/graficos.js) — com
    // `needsUpdate`, e não `visible`/`castShadow`, que mudariam a conta de luzes
    // do shader e recompilariam tudo ao acender a tocha.

    // Brilho de resina
    const blade = this.model.slotR;
    if (blade) blade.traverse((c) => { if (c.isMesh) { c.material.emissive?.setHex(this.buffs.resin > 0 ? 0x802008 : 0x000000); } });
  }

  // ---------- Câmera com colisão ----------
  updateCamera(dt, camera) {
    const world = this.game.world;
    // a cabeça A PARTIR DO CHÃO de onde está (no andar de cima, 6 m acima)
    const target = new THREE.Vector3(this.pos.x, this.pos.y + 1.65, this.pos.z);
    if (this.lockTarget) {
      const lt = this.lockTarget;
      this.camYaw = turnTowards(this.camYaw, yawTo(this.pos, lt.pos), dt * 6);
      const d = flatDist(lt.pos, this.pos);
      const wantPitch = THREE.MathUtils.clamp(0.25 + (lt.height - 2.4) * 0.05 - d * 0.004, 0.08, 0.55);
      this.camPitch += (wantPitch - this.camPitch) * Math.min(1, dt * 4);
    }
    // Se algo bloqueia atrás, tenta ângulos mais altos (olhar por cima do ombro)
    const ceil = world.ceilingAt(this.pos) - 0.25;
    let best = null;
    for (const lift of [0, 0.22, 0.45]) {
      const pitch = Math.min(1.2, this.camPitch + lift);
      const cp = Math.cos(pitch), sp = Math.sin(pitch);
      const dir = new THREE.Vector3(Math.sin(this.camYaw) * cp, -sp, Math.cos(this.camYaw) * cp);
      let dist = this.camDist * Math.max(0.12, world.rayFraction(target, target.clone().addScaledVector(dir, -this.camDist), 0.3) - 0.03);
      // Respeita o teto encurtando a distância
      if (target.y + sp * dist > ceil) dist = Math.min(dist, (ceil - target.y) / Math.max(0.05, sp));
      const score = dist - lift * 1.2;
      if (!best || score > best.score) best = { dir, dist, score };
      if (dist > this.camDist * 0.75) break;
    }
    this.camLift = best;
    const cam = target.clone().addScaledVector(best.dir, -best.dist);
    cam.y = THREE.MathUtils.clamp(cam.y, this.pos.y + 0.5, ceil);
    camera.position.lerp(cam, 1 - Math.exp(-dt * 18));
    // Em espaços apertados a câmera encosta no personagem: esconde o modelo
    const headDist = camera.position.distanceTo(_v.set(this.pos.x, this.pos.y + 1.55, this.pos.z));
    this.model.scene.visible = headDist > 0.95 || this.dead;
    if (this.model.guerreiro) this.model.guerreiro.cena.visible = this.model.scene.visible;
    const look = target.clone();
    look.y += 0.35;
    if (this.lockTarget) look.lerp(new THREE.Vector3(this.lockTarget.pos.x, this.lockTarget.height * 0.55, this.lockTarget.pos.z), 0.3);
    camera.lookAt(look);
  }
}
