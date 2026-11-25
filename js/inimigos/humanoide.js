/**
 * O COMPORTAMENTO HUMANOIDE (24/11/2026): quem anda em pé e luta de arma na mão — os esqueletos e o
 * Carrasco. Persegue pelo caminho do mapa e rodeia o alvo, escolhe o golpe pela distância (a ficha:
 * `attacks`, as linhas de js/ataques.js), defende com escudo (escudo.js), recua, cambaleia, conjura,
 * dorme deitado e acorda quando alguém chega perto. A base (vida, estado, alvo, morte) é a do
 * cerebro.js; o que vai além (chefe, fases, invocar…), os traços (tracos.js).
 *
 * Os EVENTOS deste comportamento (o corpo, enemies.js, desenha):
 *   'bloqueou'     o escudo segurou o golpe;       'escudoRachou' o golpe lascou o escudo
 *   'escudoPartiu' { de }: o escudo se partiu (de onde veio o golpe; null na marionete)
 *   'ferido'       { pos }: levou o golpe (o ponto do peito)
 *   'acordou', 'avistou' (viu o alvo e partiu para cima), 'conjurou'
 *   'brandiu'      { pesado }: o golpe começou a descer;  'pancada' { pos }: a onda de choque
 */
import * as THREE from 'three';
import { ATTACKS } from '../ataques.js';
import { novoEscudo, danoNoEscudo, RECUPERA_APOS, RECUPERA_POR_S } from '../escudo.js';
import { angleToTarget, yawTo, turnTowards, flatDist } from '../geometria.js';
import { Inimigo } from './cerebro.js';

const _v = new THREE.Vector3();

/**
 * De onde sai o FEITIÇO (a bola de fogo do Necromante), em relação a quem conjura: medido na mão
 * do boneco no instante do golpe (a animação recua a mão: fica ATRÁS do corpo), a 1,8 m do chão.
 * É conta, e não o osso da mão, para o servidor (sem boneco) lançar do mesmo lugar.
 */
const FEITICO = { frente: -0.44, direita: 0.2, altura: 1.8 };

export class Humanoide extends Inimigo {
  renascer() {
    this.poiseCur = this.cfg.poise;
    // o ESCUDO (escudo.js): volta inteiro a cada renascer (o quebrado é posto de novo no braço)
    let escudoDeVolta = false;
    if (this.cfg.left) {
      escudoDeVolta = !!this.escudo?.quebrado;
      this.escudo = novoEscudo(this.cfg.left, this.cfg.poise);
    }
    this.cooldown = 0.6;
    this.knock = new THREE.Vector3();
    this.speedMul = 1;
    this.lastAttacks = [];
    this.usedAt = new Map();
    this.strafeDir = Math.random() < 0.5 ? 1 : -1; this.strafeT = 0;
    this.pathT = 0; this.waypoint = null;
    return { escudoDeVolta };
  }

  posturaInicial() {
    if (this.startsDormant) {
      this.setState('dormant');
      this.posarDormindo();
    } else {
      this.setState('idle');
      this.tocar(this.idleAnim, { fade: 0 });
    }
  }

  get lockable() { return this.state !== 'dormant' && this.state !== 'awaken' && super.lockable; }
  get invulnerable() { return this.state === 'awaken' || super.invulnerable; }

  // ---------- Dano ----------
  receberGolpe(amount, srcPos, poiseDmg = 20, opts = {}) {
    const fire = !!opts.fire;
    if (this.dead || this.invulnerable) return false;
    this.golpeDe = srcPos?.clone?.() ?? null;   // (de onde veio o último golpe: o esqueleto desmonta para longe dele)
    if (this.state === 'dormant') this.awaken(true);
    if (fire) amount *= this.cfg.fireWeak ?? 1;
    // Bloqueio frontal com escudo
    const frontal = angleToTarget(this.pos, this.facing, srcPos) < 1.0;
    const chance = this.guarding ? 0.9 : this.cfg.blockChance;
    const esc = this.escudo;
    if (this.cfg.blockChance && !esc?.quebrado && ['chase', 'idle', 'blockstun'].includes(this.state) && frontal && Math.random() < chance) {
      this.emitir('bloqueou');
      this.applyDamage(amount * 0.15);
      if (this.hp <= 0) { this.die(); return 'hit'; }
      if (esc) {
        esc.ultimoGolpe = this.mundo.time;
        // o ESCUDO (escudo.js): só a arma com força para o material o racha; zerou, ele se parte
        // em pedaços e a postura vai junto
        const d = danoNoEscudo(opts.quebra, esc.material);
        if (d > 0) {
          esc.vida = Math.max(0, esc.vida - d);
          this.emitir('escudoRachou');
          if (esc.vida <= 0) { this.quebrarEscudo(srcPos); return 'hit'; }
        }
        // a POSTURA da guarda: TODO golpe defendido gasta (até o que não arranha o escudo); zerou, a guarda abre
        esc.postura -= poiseDmg;
        if (esc.postura <= 0) {
          esc.postura = esc.posturaMax;
          this.guarding = false;
          this.stagger(srcPos, 1.1);
          return 'hit';
        }
      } else if (poiseDmg >= 45 && Math.random() < 0.6) {
        // (sem a ficha do escudo: golpes pesados quebram a guarda)
        this.guarding = false;
        this.stagger(srcPos, 1.1);
        return 'hit';
      }
      this.tocar('Shield_OneShot', { loop: false, restart: true, fade: 0.05 });
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
    this.emitir('ferido', { pos: this.pos.clone().setY(this.pos.y + this.height * 0.6) });
    if (this.state === 'idle' || this.state === 'return') this.setState('chase');
    if (this.hp <= 0) { this.die(); return 'hit'; }
    this.poiseCur -= poiseDmg;
    if (this.poiseCur <= 0) { this.poiseCur = this.cfg.poise; this.stagger(srcPos); }
    return 'hit';
  }

  dodge(srcPos) {
    const side = Math.random() < 0.5 ? 1 : -1;
    this.facing = yawTo(this.pos, srcPos) + side * Math.PI / 2;
    this.setState('dodge', { dur: 0.6 });
    this.tocar('Roll', { loop: false, duration: 0.6, restart: true, fade: 0.05 });
  }

  /**
   * O ESCUDO SE PARTE (escudo.js): o braço fica vazio e a postura quebra junto (cambaleia longo).
   * Na MARIONETE (`srcPos` nulo) é só o aviso ao corpo: quem cambaleia é o retrato que chega.
   */
  quebrarEscudo(srcPos) {
    const esc = this.escudo;
    if (!esc || esc.quebrado) return;
    esc.quebrado = true; esc.vida = 0;
    this.emitir('escudoPartiu', { de: srcPos });
    this.guarding = false;
    if (srcPos && !this.mundo.marionetes) this.stagger(srcPos, 1.4);
  }

  stagger(srcPos, dur = 0.6) {
    const t = this.traco('cambalear', srcPos, dur);   // (o traço `firme`)
    if (t === false) return;
    if (typeof t === 'number') dur = t;
    const dir = new THREE.Vector3(this.pos.x - srcPos.x, 0, this.pos.z - srcPos.z).normalize();
    this.knock.copy(dir).multiplyScalar(4);
    this.setState('hurt', { dur });
    this.tocar(dur > 0.8 ? 'Hit_Knockback' : 'Hit_Chest', { loop: false, duration: dur + 0.1, restart: true, fade: 0.05 });
    this.traco('depoisDeCambalear');
  }

  awaken(fast = false) {
    this.setState('awaken', { dur: fast ? 1.0 : 2.3 });
    this.tocar('LayToIdle', { loop: false, fade: 0.1, duration: fast ? 1.0 : 2.3, restart: true });
    this.emitir('acordou');
  }

  // ---------- O quadro ----------
  preparar(dt) { this.escolherAlvo(dt); }

  /** A postura da guarda volta aos poucos, sem apanhar por um tempo (escudo.js). */
  recuperar(dt) {
    const esc = this.escudo;
    if (esc && esc.postura < esc.posturaMax && this.mundo.time - esc.ultimoGolpe > RECUPERA_APOS) esc.postura = Math.min(esc.posturaMax, esc.postura + esc.posturaMax * RECUPERA_POR_S * dt);
  }

  pisar() {
    const w = this.mundo.world;
    // pisa no chão de onde está (a escada, o andar de cima) — menos no salto,
    // que é quem cuida da própria altura
    if (!(this.state === 'attack' && this.st?.atk?.leap)) this.pos.y = w.alturaChao(this.pos);
    if (w.acimaDoChao(this.pos) <= 0.01) w.resolve(this.pos, this.radius);
  }

  // ---------- IA ----------
  pickAttack(d) {
    const now = this.mundo.time;
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
    this.usedAt.set(atk, this.mundo.time);
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
    this.tocar(spec.clip, { loop: false, speed, from, restart: true, fade: 0.12 });
  }

  // Alvo de movimento: direto se houver linha de visão, senão pelo caminho no grid
  steerTarget(dt) {
    const p = this.alvo, world = this.mundo.world;
    this.pathT -= dt;
    if (this.pathT <= 0) {
      this.pathT = 0.4;
      this.waypoint = world.lineOfSight(this.pos, p.pos) ? null : world.nextWaypoint(this.pos, p.pos);
      this.unreachable = !this.waypoint && !world.lineOfSight(this.pos, p.pos);
    }
    return this.waypoint ?? p.pos;
  }

  decidir(dt) {
    const world = this.mundo.world, p = this.alvo, cfg = this.cfg;
    // `p.furtividade` (o jogador agachado: caminhos.js) encolhe a distância em que o inimigo percebe o alvo;
    // FURTIVO (a Furtividade), ele só é percebido dentro de `p.areaFurtiva` (m)
    const d = flatDist(p.pos, this.pos);
    const furt = p.furtividade ?? 1, area = p.areaFurtiva ?? Infinity;
    const speed = cfg.speed * this.speedMul;
    let moving = 0, strafe = 0;

    switch (this.state) {
      case 'dormant':
        if (this.canEngage() && d < Math.min(6.5 * furt, area) && world.lineOfSight(this.pos, p.pos)) this.awaken();
        break;
      case 'awaken':
        if (this.stateT >= this.st.dur) { this.setState('chase'); this.cooldown = 0.4; }
        break;
      case 'idle':
        if (this.canEngage() && d < Math.min(cfg.aggro * furt, area) && world.lineOfSight(this.pos, p.pos)) { this.setState('chase'); this.emitir('avistou'); }
        break;
      case 'return': {
        const toHome = flatDist(this.home, this.pos);
        this.hp = Math.min(this.maxHp, this.hp + dt * 20);
        if (toHome < 0.5) { this.setState('idle'); this.facing = this.homeFacing; break; }
        const tgt = world.lineOfSight(this.pos, this.home) ? this.home : (world.nextWaypoint(this.pos, this.home) ?? this.home);
        this.facing = turnTowards(this.facing, yawTo(this.pos, tgt), dt * 6);
        this.pos.x += Math.sin(this.facing) * speed * 0.7 * dt;
        this.pos.z += Math.cos(this.facing) * speed * 0.7 * dt;
        moving = speed * 0.7;
        if (this.canEngage() && d < Math.min(cfg.aggro * 0.7 * furt, area) && world.lineOfSight(this.pos, p.pos)) this.setState('chase');
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
          const dir = world.avoid(this.pos, fwd.clone(), this.radius);
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

  /** A animação de andar/parar (e a guarda erguida de quem tem escudo, esperando para atacar). */
  animLoco(moving, strafe) {
    const p = this.alvo;
    this.guarding = !!this.cfg.blockChance && !this.escudo?.quebrado && this.state === 'chase' && this.cooldown > 0.25 && flatDist(p.pos, this.pos) < 4.5;
    if (!['chase', 'return', 'idle'].includes(this.state)) return;
    if (this.guarding) { this.tocar('Idle_Shield_Loop', { fade: 0.15 }); return; }
    if (strafe) this.tocar('Walk_Loop', { speed: 1.0 });
    else if (moving > 0) this.tocar(this.cfg.runAnim, { speed: moving / this.cfg.runRef });
    else if (moving < 0) this.tocar('Walk_Loop', { speed: -1.2 });
    else this.tocar(this.idleAnim, { fade: 0.2 });
  }

  engageRange() {
    const ranges = this.cfg.attacks.filter((a) => !a.follow && !a.cast && !a.minRange).map((a) => a.range);
    return Math.max(1.5, Math.min(...ranges) * 0.85);
  }

  updateAttack(dt, p, d) {
    const world = this.mundo.world;
    const s = this.st, a = s.atk;
    const t = this.stateT / s.dur;
    if (t < s.hitStart * 0.85 && !a.leap) this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * this.cfg.turnRate * (a.trackMul ?? 1));
    const fwd = _v.set(Math.sin(this.facing), 0, Math.cos(this.facing));
    if (a.leap && s.from) {
      const k = THREE.MathUtils.clamp((t - 0.15) / (s.hitStart - 0.15), 0, 1);
      if (t < 0.15) this.facing = turnTowards(this.facing, yawTo(this.pos, s.to), dt * 6);
      this.pos.x = THREE.MathUtils.lerp(s.from.x, s.to.x, k);
      this.pos.z = THREE.MathUtils.lerp(s.from.z, s.to.z, k);
      this.pos.y = world.alturaChao(this.pos) + Math.sin(k * Math.PI) * 4.5;
    }
    if (a.lunge && t > s.hitStart * 0.5 && t < s.hitEnd) {
      const close = d < this.radius + p.radius + 0.4;
      if (!close || a.dash) this.pos.addScaledVector(fwd, a.lunge * dt * this.speedMul);
    }
    if (!s.swung && t >= s.hitStart - 0.08) { s.swung = true; if (!a.cast) this.emitir('brandiu', { pesado: this.cfg.scale > 1.3 }); }
    if (!a.cast && !s.hitDone && t >= s.hitStart && t <= s.hitEnd) {
      const reach = a.reach + p.radius;
      const allowed = s.arc + Math.atan2(p.radius, Math.max(d, 0.1));
      if (d <= reach && (s.arc >= 3 || angleToTarget(this.pos, this.facing, p.pos) <= allowed) && world.lineOfSight(this.pos, p.pos)) {
        const res = p.takeDamage(a.dmg, this.pos, { poise: a.poise, unblockable: a.unblockable });
        if (res !== 'iframe') s.hitDone = true;
      }
    }
    if (t >= s.hitStart && !s.fx) {
      s.fx = true;
      if (a.cast) this.doCast(a);
      if (a.shock) {
        const center = this.pos.clone().addScaledVector(fwd, a.leap ? 0 : a.reach * 0.7);
        center.y = world.alturaChao(center);
        this.mundo.projectiles.shock({ pos: center, maxR: a.shock.radius, speed: a.shock.speed ?? 10, damage: a.dmg * 0.6, poise: 60, skip: s.hitDone });
        this.emitir('pancada', { pos: center });
      }
    }
    if (t >= 1 && !s.recovering) {
      s.recovering = true; this.pos.y = world.alturaChao(this.pos);
      if (a.after) this.tocar(a.after, { loop: false, fade: 0.1, restart: true });
      else this.tocar(this.idleAnim, { fade: 0.3 });
    }
    if (t >= s.endAt) {
      this.pos.y = world.alturaChao(this.pos);
      const next = a.next && this.cfg.attacks.find((x) => x.id === a.next);
      if (next && Math.random() < (a.nextChance ?? 0.6)) return this.startAttack(next);
      this.setState('chase');
      const [c0, c1] = this.cfg.cooldown;
      this.cooldown = (c0 + Math.random() * (c1 - c0)) / this.speedMul;
    }
  }

  /** De onde sai o feitiço agora (ver `FEITICO`). */
  origemDoFeitico() {
    const f = this.facing, frente = [Math.sin(f), Math.cos(f)], direita = [-Math.cos(f), Math.sin(f)];
    return new THREE.Vector3(
      this.pos.x + frente[0] * FEITICO.frente + direita[0] * FEITICO.direita,
      this.pos.y + FEITICO.altura,
      this.pos.z + frente[1] * FEITICO.frente + direita[1] * FEITICO.direita,
    );
  }

  doCast(a) {
    if (this.traco('conjurar', a)) return;   // (o traço `invocar`)
    const from = this.origemDoFeitico();
    const target = this.alvo.pos.clone().setY(this.alvo.pos.y + 1.2);
    this.mundo.projectiles.orb({ pos: from, dir: target.sub(from), speed: 10, damage: a.dmg, homing: 1.2, alvo: this.alvo });
    this.emitir('conjurou');
  }

  aoRetomar(r) {
    if (r.st === 'dormant') return;                       // `reset` já o deitou, se ele é dos que dormem
    this.setState(r.st === 'idle' || r.st === 'return' ? r.st : 'chase');
    this.tocar(this.idleAnim, { fade: 0 });
  }
}
