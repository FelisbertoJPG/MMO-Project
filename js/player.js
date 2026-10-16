import * as THREE from 'three';
import { CharacterModel, ATTACKS, weaponMesh, shieldMesh } from './character.js';
import { corpoGuardado, NU, codigoDaArmadura } from './guerreiro.js';
import { APARENCIA_PADRAO, lerAparencia } from './aparencia.js';
import { racaDe, proporcoesDe } from './raca.js';
import { tela } from './tela.js';
import { VEU } from './veu.js';
import { DURACAO as DURACAO_REFEICAO, objetoDaRefeicao } from './refeicao.js';
import {
  curva, VIDA_BASE, VITALIDADE, VIGOR_BASE, RESISTENCIA_VIGOR, CARGA_BASE, RESISTENCIA_CARGA,
  FORCA, ESCALA, SEM_REQUISITO, DANO_RECEBIDO, DEFESA_MAX, estadoDaCarga, LUGARES,
} from './ficha.js';
import { angleToTarget, yawTo, turnTowards, flatDist } from './combat.js';
import { ITEMS, UNARMED, TORCH_LIFE } from './items.js';
import { START_POS, NASCER } from './world.js';
import { Assets } from './assets.js';

const SPRINT_HOLD = 0.28;
const ROLL_COST = 22;
const _v = new THREE.Vector3();
// A CÂMERA ISOMÉTRICA (cameraIsometrica): a inclinação da projeção isométrica de verdade
// (arctan 1/√2 ≈ 35,264°), a lente estreita de longe (quase sem perspectiva) e a altura do corte
export const ISO_INCLINACAO = Math.atan(1 / Math.SQRT2), ISO_FOV = 15, ISO_DIST = 55, ISO_CORTE = 2.8, ISO_CORTE_ARENA = 7.5;
const _alvoIso = new THREE.Vector3(), _camIso = new THREE.Vector3();

// estados em que a mão esquerda faz outra coisa (ou o boneco está no chão): sem as duas mãos na arma
export const MAO_OCUPADA = ['heal', 'item', 'interact', 'dead', 'rest', 'restUp', 'lying', 'standing'];

export class Player {
  constructor(game) {
    this.game = game;
    // o corpo: o guerreiro (a armadura vem do equipamento, `refreshEquipment`) ou, pelo provador, o boneco antigo
    this.model = new CharacterModel({ outfit: 'knight', armadura: corpoGuardado() === 'antigo' ? false : NU });
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
    this.aparencia = APARENCIA_PADRAO;   // o rosto e o cabelo (aparencia.js); vai no save e no corpo que viaja
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
  // AS CONTAS DA FICHA (ficha.js): cada atributo rende menos a cada ponto, a força vale o
  // quanto a ARMA aproveita dela, e a armadura defende mas pesa
  get maxHp() { return Math.round((VIDA_BASE + curva(this.vigor, VITALIDADE)) * (1 + this.ringEffect('hpMul'))); }
  get maxStamina() { return Math.round(VIGOR_BASE + curva(this.endurance, RESISTENCIA_VIGOR)); }
  get cargaMax() { return Math.round((CARGA_BASE + curva(this.endurance, RESISTENCIA_CARGA)) * 10) / 10; }
  /** As peças de armadura vestidas (as definições, de ITEMS). */
  get armaduras() { return LUGARES.map((l) => this.inv.equipped.armadura[l]).filter(Boolean).map((id) => ITEMS[id]); }
  /** O peso carregado: as duas mãos (o escudo nas costas conta) e a armadura. */
  get peso() {
    const eq = this.inv.equipped;
    let p = (eq.weapon ? ITEMS[eq.weapon].peso ?? 0 : 0) + (eq.left ? ITEMS[eq.left].peso ?? 0 : 0);
    for (const a of this.armaduras) p += a.peso;
    return Math.round(p * 10) / 10;
  }
  get carga() { return estadoDaCarga(this.peso, this.cargaMax); }
  get poise() { return 12 + this.ringEffect('poise') + this.armaduras.reduce((s, a) => s + a.equilibrio, 0); }
  /** A absorção da armadura vestida (soma das peças). */
  get absorcao() { return this.armaduras.reduce((s, a) => s + a.absorcao, 0); }
  get defense() { return Math.min(DEFESA_MAX, this.absorcao + this.ringEffect('defense') + (this.buffs.fortaleza > 0 ? 0.15 : 0)); }
  /** O bônus de força (antes da escala da arma): +30% no 20, +60% no 40. */
  get bonusForca() { return curva(this.strength, FORCA); }
  /** Quanto a força multiplica o dano de uma ARMA: a escala dela, e o requisito. */
  forcaNaArma(w) { return (1 + this.bonusForca * ESCALA[w.escala ?? 'E']) * (this.strength < (w.requisito ?? 0) ? SEM_REQUISITO : 1); }
  get damageMul() { return this.forcaNaArma(this.weapon) * (this.buffs.resin > 0 ? 1.35 : 1) * (this.buffs.furia > 0 ? 1.2 : 1); }
  /** O código do corpo pela armadura vestida (guerreiro.js): um dígito por lugar. */
  get codigoDaArmadura() {
    const eq = this.inv.equipped.armadura, conj = {};
    for (const l of LUGARES) if (eq[l]) conj[l] = ITEMS[eq[l]].conjunto;
    return `${codigoDaArmadura(conj)}:${this.aparencia}`;
  }
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
    this.fogueira = NASCER.id;   // a tag `nascer` do mapa (world.js)
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
    // a ARMADURA no corpo do guerreiro (o boneco antigo, do provador, não a mostra)
    if (this.model.guerreiro && this.model.guerreiro.armadura !== this.codigoDaArmadura) this.model.usarGuerreiro(this.codigoDaArmadura);
    this.hp = Math.min(this.hp, this.maxHp);
  }

  setState(s, data = {}) {
    // saindo de uma refeição (acabou ou foi interrompida): o que estava na mão esquerda volta
    const devolver = this.st?.naMao && s !== this.state;
    this.state = s; this.stateT = 0; this.st = data;
    if (devolver) this.refreshEquipment();
  }

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

    if (game.modoCamera === 'isometrica') {
      // a ISOMÉTRICA não gira solta: arrastar de lado vira a vista de 90 em 90 graus (cameraIsometrica)
      this.isoArrasto = (this.isoArrasto ?? 0) + inp.dx;
      if (Math.abs(this.isoArrasto) > 260) { this.isoQuarto = (this.isoQuarto ?? 0) - Math.sign(this.isoArrasto); this.isoArrasto = 0; }
    } else if (!this.lockTarget) {
      this.camYaw -= inp.dx * 0.0024;
      // (a primeira pessoa olha mais para cima e para baixo)
      const [baixo, alto] = game.modoCamera === 'primeira' ? [-1.2, 1.3] : [-0.3, 1.0];
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + inp.dy * 0.0024, baixo, alto);
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
        const carga = this.carga;
        const sprint = dir && carga.corre && inp.isDown('Space') && this.spaceHeld >= SPRINT_HOLD && this.stamina > 0;
        const blocking = this.blocking;
        const speed = (blocking ? 1.8 : sprint ? 6.8 : 4.3) * carga.passo;
        if (dir) {
          this.pos.addScaledVector(dir, speed * dt);
          this.moveSpeed = speed;
          const faceTarget = this.lockTarget && !sprint;
          const want = faceTarget ? yawTo(this.pos, this.lockTarget.pos) : this.rumo(dir);
          this.facing = turnTowards(this.facing, want, dt * 12);
        } else if (this.lockTarget) {
          this.facing = turnTowards(this.facing, yawTo(this.pos, this.lockTarget.pos), dt * 10);
        } else if (this.primeiraPessoa) this.facing = this.camYaw;
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
      let regen = 52 * (1 + this.ringEffect('staminaRegen') + (this.buffs.blossom > 0 || this.buffs.folego > 0 ? 0.6 : 0)) * this.carga.regen;
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
      // contra ESCUDO (escudo.js): o forte racha 1,6× mais; a tocha não racha
      quebra: w.quebra && kind !== 'torch' ? { nivel: w.quebra.nivel, dano: w.quebra.dano * (heavy ? 1.6 : 1) } : null,
      fire: kind === 'torch',
      hitSet: new Set(), queued: null, swung: false, recovering: false,
      // de onde o golpe pode ser emendado (outro golpe, rolar): logo depois do acerto, ou
      // só no FIM da animação nas armas que pedem (`terminaGolpe`: o espadão)
      solta: w.terminaGolpe ? 1 : (spec.hit[1] - from) / seg + 0.08,
    };
    this.stamina -= w.stamina * (heavy ? 1.6 : 1);
    this.staminaDelay = 0.6;
    if (this.lockTarget) this.facing = yawTo(this.pos, this.lockTarget.pos);
    else if (dir || this.primeiraPessoa) this.facing = this.rumo(dir);
    this.setState('attack', data);
    this.model.play(spec.clip, { loop: false, speed, from, restart: true, fade: 0.1 });
  }

  updateAttack(dt, dir) {
    const a = this.st, game = this.game;
    const p = this.stateT / a.dur;
    if (p < a.hitStart * 0.8) {
      const want = this.lockTarget ? yawTo(this.pos, this.lockTarget.pos) : dir || this.primeiraPessoa ? this.rumo(dir) : this.facing;
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
        const res = this.game.golpear(e, a.damage, this.pos, a.poise, { fire: a.fire || this.buffs.resin > 0, quebra: a.quebra });
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
    if (p >= a.solta && a.queued) {
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
    const carga = this.carga;
    this.stamina -= ROLL_COST * carga.rolagemCusto;
    this.staminaDelay = 0.55;
    const d = dir ?? new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    this.facing = Math.atan2(d.x, d.z);
    const dur = 0.78;
    this.setState('roll', { dir: d.clone(), dur, dist: carga.rolagemDist });
    this.model.play('Roll', { loop: false, duration: dur, restart: true, fade: 0.06 });
    this.game.sfx.roll();
  }

  updateRoll(dt) {
    const r = this.st;
    const p = Math.min(1, this.stateT / r.dur);
    const speed = 9 * (r.dist ?? 1) * Math.sin(Math.PI * Math.min(1, p * 1.08));
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
    // COMER e BEBER (refeicao.js): o clipe próprio, com a comida (ou o caneco) na mão esquerda
    const refeicao = def.use === 'comer' ? (def.bebida ? 'Beber' : 'Comer') : null;
    const temClipe = refeicao && Assets.clips[refeicao];
    const dur = temClipe ? DURACAO_REFEICAO[refeicao] : { heal: 1.3, comer: 1.3, throw: 0.9, resin: 1.0, blossom: 1.0, souls: 0.9, home: 1.8 }[def.use] ?? 1;
    // comer é lento, e um golpe forte interrompe (estado 'heal')
    this.setState(def.use === 'heal' || def.use === 'comer' ? 'heal' : 'item', { id, def, dur, applied: false, naMao: !!temClipe });
    if (temClipe) {
      this.model.equip('l', objetoDaRefeicao(!!def.bebida, def.corNaMao));
      this.model.play(refeicao, { loop: false, duration: dur, restart: true, fade: 0.15 });
      return;
    }
    this.model.play(def.use === 'throw' ? 'OverhandThrow' : 'Consume', { loop: false, duration: def.use === 'throw' ? dur / 0.85 : dur, restart: true });
  }

  updateItemUse(dt, dir) {
    const s = this.st, p = this.stateT / s.dur, game = this.game;
    if (dir) {
      this.pos.addScaledVector(dir, 1.2 * dt);
      if (!this.lockTarget) this.facing = turnTowards(this.facing, this.rumo(dir), dt * 5);
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
        game.projectiles.bomb({ pos: from, vel, damage: def.damage * (1 + this.bonusForca * 0.5), radius: def.radius });
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
        this.hp -= amount * 0.3 * DANO_RECEBIDO * (1 - this.defense);
        game.sfx.guardBreak();
        this.knock.copy(pushDir).multiplyScalar(4);
        this.setState('hurt', { dur: 1.1 });
        this.model.play('Idle_Shield_Break', { loop: false, duration: 1.1, restart: true });
        game.addShake(0.3);
        if (this.hp <= 0) this.die();
      } else {
        this.hp -= amount * (1 - stability) * 0.15 * DANO_RECEBIDO * (1 - this.defense);
        game.sfx.block();
        this.blockHitT = 0.35;
        this.pos.addScaledVector(pushDir, Math.min(0.7, amount * 0.012));
        game.addShake(0.1);
      }
      return 'blocked';
    }
    // o golpe vale a tabela do inimigo × DANO_RECEBIDO, menos a defesa (ficha.js)
    this.hp -= amount * DANO_RECEBIDO * (1 - this.defense);
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
  /** Na PRIMEIRA PESSOA (e vivo: morto, a vista sai para trás do ombro para se ver cair). */
  get primeiraPessoa() { return this.game.modoCamera === 'primeira' && !this.dead; }

  /**
   * Para onde o corpo vira ao andar: para onde anda — e, na primeira pessoa, para onde a VISTA
   * olha (o golpe vai na mira; andar de lado ou para trás não vira o corpo).
   */
  rumo(dir) { return this.primeiraPessoa ? this.camYaw : dir ? Math.atan2(dir.x, dir.z) : this.facing; }

  /**
   * A PRIMEIRA PESSOA esconde o CORPO da câmera e deixa as armas (o que está nas mãos e nas
   * costas). Por `layers` (o jogo mexe no `visible` das peças); some também a sombra dele.
   */
  esconderCorpo(sim) {
    if (!sim && !this.corpoEscondido) return;
    this.corpoEscondido = sim;
    const m = this.model, armas = [m.slotR, m.slotL, m.slotCostas];
    m.root.traverse((o) => {
      if (!o.isMesh && !o.isSprite) return;
      for (let p = o; p; p = p.parent) if (armas.includes(p)) return;
      o.layers.set(sim ? 31 : 0);
    });
  }

  /**
   * A CÂMERA (16/10/2026: três modos, `game.modoCamera`, menu de pausa → Interface):
   * `ombro` (a de sempre, atrás do ombro), `primeira` (os olhos do personagem) e `isometrica`
   * (a vista dos jogos isométricos: ver `cameraIsometrica`).
   */
  updateCamera(dt, camera) {
    if (this.game.modoCamera === 'isometrica') return this.cameraIsometrica(dt, camera);
    this.sairDaIsometrica(camera);
    if (this.primeiraPessoa) return this.cameraPrimeira(dt, camera);
    if (this.corpoEscondido) this.esconderCorpo(false);
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
    // nas colinas, a câmera não entra no morro atrás (o chão sob ELA)
    cam.y = Math.max(cam.y, world.alturaChao(cam) + 0.6);
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

  /** A altura dos olhos, da raça (o orc é mais alto) — a do corpo vestido (o esculpido tem a dele). */
  get alturaDosOlhos() {
    const a = lerAparencia(this.aparencia);
    return 1.6 * (this.model.guerreiro?.altura ?? proporcoesDe(racaDe(a.raca, a.sexo)).altura ?? 1);
  }

  cameraPrimeira(dt, camera) {
    // o corpo some (menos no painel de Aparência, que precisa dele); de 8 em 8 quadros de novo,
    // para pegar as peças que o equipamento trocou
    if (this.game.menu === 'aparencia') this.esconderCorpo(false);
    else if (!this.corpoEscondido || (this.quadroCam = (this.quadroCam ?? 0) + 1) % 8 === 0) this.esconderCorpo(true);
    this.model.scene.visible = true;
    if (this.model.guerreiro) this.model.guerreiro.cena.visible = true;
    // com a mira travada, a vista vai ao alvo (o giro e a inclinação)
    const olho = _v.set(this.pos.x, this.pos.y + this.alturaDosOlhos, this.pos.z);
    if (this.lockTarget) {
      const lt = this.lockTarget;
      this.camYaw = turnTowards(this.camYaw, yawTo(this.pos, lt.pos), dt * 8);
      const quer = Math.atan2(olho.y - (lt.pos.y + (lt.height ?? 1.8) * 0.6), Math.max(0.5, flatDist(lt.pos, this.pos)));
      this.camPitch += (quer - this.camPitch) * Math.min(1, dt * 6);
    }
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch), fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    // um palmo à frente da cabeça (o corpo está escondido, mas não o que encosta nela)
    camera.position.set(olho.x + fx * 0.12, olho.y, olho.z + fz * 0.12);
    camera.lookAt(camera.position.x + fx * cp, camera.position.y - sp, camera.position.z + fz * cp);
  }

  /**
   * A CÂMERA ISOMÉTRICA (16/10/2026), no jeito dos jogos isométricos (Diablo, Hades, Baldur's
   * Gate, os RPGs táticos):
   *   • o ÂNGULO clássico: a vista desce `ISO_INCLINACAO` = arctan(1/√2) ≈ 35,264° (a projeção
   *     isométrica de verdade: os três eixos com o mesmo encurtamento) e gira 45° em relação ao
   *     mapa (as células aparecem como losangos); NÃO gira solta — arrastar de lado (mouse ou
   *     dedo) vira a vista de 90 em 90°, como nesses jogos (`isoQuarto`, no `update`);
   *   • QUASE SEM PERSPECTIVA: uma câmera ortográfica quebraria o céu, a névoa, o LOD e a
   *     interface; aqui é a mesma câmera com uma lente "teleobjetiva" (`ISO_FOV` = 15°) de LONGE
   *     (`ISO_DIST`): as paralelas quase não convergem e o tamanho das coisas não muda com a
   *     distância. Para o resto do jogo continuar medindo "de perto", a câmera diz de onde uma
   *     câmera comum veria (`userData.vistaDe`, a 13 m do jogador, e `lodFov`: o LOD e a poeira
   *     usam) e a névoa é compensada pela distância (senão, de 55 m, ela cobria tudo);
   *   • A VISTA EM CORTE na masmorra: um plano de recorte global (`renderer.clippingPlanes`)
   *     tira tudo acima de `ISO_CORTE` m sobre o chão do jogador — o teto e o alto das paredes —,
   *     como as plantas em corte desses jogos; na arena (o Carrasco é alto), mais em cima; ao ar
   *     livre o plano fica no céu. O plano EXISTE o tempo todo na isométrica (só a altura muda):
   *     ligar e desligar o recorte recompila todos os shaders — `Game.escolherCamera` pré-aquece.
   */
  cameraIsometrica(dt, camera) {
    const world = this.game.world, r = this.game.renderer;
    if (this.corpoEscondido) this.esconderCorpo(false);
    // o giro: 45° mais os quartos de volta pedidos; vai até lá suave
    const quer = Math.PI / 4 + (this.isoQuarto ?? 0) * Math.PI / 2;
    this.camYaw = turnTowards(this.camYaw, quer, dt * 7);
    const p = ISO_INCLINACAO, cp = Math.cos(p), sp = Math.sin(p), fx = Math.sin(this.camYaw), fz = Math.cos(this.camYaw);
    const alvo = _alvoIso.set(this.pos.x, this.pos.y + 1.0, this.pos.z);
    if (camera.userData.fovNormal == null) camera.userData.fovNormal = camera.fov;
    if (camera.fov !== ISO_FOV && this.game.menu !== 'aparencia') { camera.fov = ISO_FOV; camera.updateProjectionMatrix(); this.game.effects?.setScale(tela.h, camera.fov); }
    _camIso.set(alvo.x - fx * cp * ISO_DIST, alvo.y + sp * ISO_DIST, alvo.z - fz * cp * ISO_DIST);
    if (camera.position.distanceToSquared(_camIso) > 400) camera.position.copy(_camIso);   // (chegando de outro modo: sem voar até lá)
    else camera.position.lerp(_camIso, 1 - Math.exp(-dt * 10));
    camera.lookAt(alvo);
    // o VÉU (veu.js): a copa da árvore entre a câmera e o personagem fica meio transparente —
    // em volta do peito dele como a câmera o vê, acima da cintura
    camera.updateMatrixWorld();
    VEU.uVeu.value = this.game.menu === 'aparencia' ? 0 : 0.6;
    VEU.uVeuAlvo.value.copy(alvo).applyMatrix4(camera.matrixWorldInverse);
    VEU.uVeuChao.value = this.pos.y + 1.3;
    // para o LOD e a poeira: de onde uma câmera comum veria
    (camera.userData.vistaDe ??= new THREE.Vector3()).set(alvo.x - fx * cp * 13, alvo.y + sp * 13, alvo.z - fz * cp * 13);
    camera.userData.lodFov = camera.userData.fovNormal;
    // a névoa conta da câmera: de longe ela cobria tudo — a densidade cai na proporção
    if (this.game.scene.fog?.density) this.game.scene.fog.density *= 13 / ISO_DIST;
    // a vista em corte (dentro da masmorra)
    const [lin, col] = world.cellOf(this.pos);
    const dentro = !world.isOpenAir(lin, col);
    this.planoIso ??= new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);
    this.planoIso.constant = dentro ? this.pos.y + (world.isArenaCell(lin, col) ? ISO_CORTE_ARENA : ISO_CORTE) : 1e4;
    if (r.clippingPlanes[0] !== this.planoIso) r.clippingPlanes = [this.planoIso];
    this.model.scene.visible = true;
    if (this.model.guerreiro) this.model.guerreiro.cena.visible = true;
  }

  /** Volta do que a isométrica mudou: a lente, o recorte, as dicas ao LOD. */
  sairDaIsometrica(camera) {
    const u = camera.userData;
    if (u.fovNormal != null && camera.fov !== u.fovNormal) { camera.fov = u.fovNormal; camera.updateProjectionMatrix(); this.game.effects?.setScale(tela.h, camera.fov); }
    u.vistaDe = null; u.lodFov = null;
    VEU.uVeu.value = 0;
    const r = this.game.renderer;
    if (r.clippingPlanes.length) r.clippingPlanes = [];
  }
}
