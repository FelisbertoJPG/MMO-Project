import * as THREE from 'three';
import { Assets } from './assets.js';
import { montarModelo } from './blocos.js';
import { materiaisDoJogo } from './gear.js';
import { yawTo, turnTowards, flatDist, angleToTarget } from './combat.js';
import { CELL } from './world.js';
import { Interpolador, giroCurto } from './remoto.js';

/**
 * O WYRM DAS CINZAS — o chefe secreto do terraço (o andar de cima, 'a' no
 * mapa, a que só se chega pela escada escondida na floresta).
 *
 * Ele NÃO é um `Enemy`: os inimigos do jogo são o boneco articulado (UAL) com
 * animações de clip, e o dragão é um MODELO DE BLOCOS (assets/modelos/
 * dragao.json, montado no Editor de modelo), sem esqueleto. A animação é
 * PROCEDURAL: cada peça do modelo (patas, pescoço, cabeça, mandíbula, asas,
 * cauda) é girada em volta do próprio pivô — é por isso que as peças foram
 * montadas com o pivô na articulação.
 *
 * O contrato com o resto do jogo é o mesmo dos inimigos: `pos`, `radius`,
 * `height`, `hp`/`maxHp`, `dead`/`active`/`lockable`, `takeDamage()`,
 * `update(dt)`, `cfg.souls`/`cfg.drops`, `isBoss`.
 *
 * ## O que erra CALADO aqui
 *
 * - **ele não sai do terraço.** O mapa tem a escada, e um chefe que desce
 *   atrás do jogador vira um dragão na floresta, fora da luta e da barra. Todo
 *   passo que termina fora de célula do andar de cima é desfeito.
 * - **o modelo pode não ter carregado** (arquivo faltando): o dragão nasce
 *   desativado em vez de derrubar o jogo — uma masmorra sem chefe secreto
 *   ainda é jogável.
 */

const ESCALA = 1.4;
const CFG = { souls: 8000, drops: [] };
const EMISSIVO = 0x1c0a06;

export class Dragao {
  constructor(game) {
    this.game = game;
    this.isBoss = true;
    this.name = 'Wyrm das Cinzas';
    this.cfg = CFG;
    this.maxHp = 2400;
    this.hp = this.maxHp;
    this.radius = 2.3;
    this.height = 4.2;
    this.facing = 0;
    this.defeated = false;
    this.lastHit = -99;
    this.recentDmg = 0;
    this.flashT = 0;
    this.passo = 0;           // a fase da caminhada (as patas alternam por ela)
    this.cooldown = 1.5;

    const modelo = Assets.modelos?.dragao;
    this.root = new THREE.Group();
    this.pos = this.root.position;
    if (!modelo) {
      console.warn('[dragão] sem assets/modelos/dragao.json — o chefe secreto não vai aparecer');
      this.active = false; this.dead = true; this.defeated = true; this.state = 'gone';
      return;
    }
    // um brilho de brasa por baixo das escamas: sem ele, à noite o dragão é só uma silhueta preta
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, emissive: EMISSIVO });
    // as primitivas postas no Editor de modelo (chifres, espinhos) usam os materiais do jogo
    const { raiz, pecas } = montarModelo(modelo, { material: this.material, materialDe: materiaisDoJogo().materialDe });
    raiz.scale.setScalar(ESCALA);
    this.root.add(raiz);
    this.pecas = pecas;
    // a pose do arquivo: a animação SOMA a ela (girar a partir do zero
    // desfaria a inclinação das asas e o ângulo do pescoço do modelo)
    this.base = new Map([...pecas].map(([id, g]) => [id, g.rotation.clone()]));
    // os olhos e a garganta em brasa
    this.brasa = new THREE.PointLight(0xff6a20, 0, 14, 1.6);
    const cabeca = pecas.get('cabeca');
    if (cabeca) { this.brasa.position.set(0, 0.3, 1.4); cabeca.add(this.brasa); }
    game.scene.add(this.root);

    // o NINHO: o meio do terraço mais longe da escada
    this.home = this.acharNinho();
    this.sleep();
  }

  /** O centro do ninho: a célula do andar de cima mais longe da escada. */
  acharNinho() {
    const w = this.game.world;
    let escada = null, melhor = null, dMelhor = -1;
    for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) if (w.ch(r, c) === 'e') escada = [r, c];
    for (let r = 0; r < w.rows; r++) for (let c = 0; c < w.cols; c++) {
      if (w.nivel(r, c) !== 1) continue;
      const d = escada ? Math.abs(r - escada[0]) + Math.abs(c - escada[1]) : 0;
      // longe da escada, mas não encostado na borda (o corpo é largo)
      const vizinhos = [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => w.nivel(r + a, c + b) === 1);
      if (vizinhos && d > dMelhor) { dMelhor = d; melhor = [r, c]; }
    }
    if (!melhor) return null;
    return new THREE.Vector3(melhor[1] * CELL, 0, melhor[0] * CELL);
  }

  get lockable() { return this.active && !this.dead && !['dormant', 'gone'].includes(this.state); }
  get invulnerable() { return ['dormant', 'intro', 'gone', 'morrendo'].includes(this.state); }

  setState(s, st = {}) { this.state = s; this.stateT = 0; this.st = st; }

  /** De volta ao ninho, dormindo e inteiro (descanso na fogueira, morte do jogador). */
  sleep() {
    if (!this.home) { this.active = false; this.dead = true; this.state = 'gone'; return; }
    this.hp = this.maxHp;
    this.dead = this.defeated;
    this.active = !this.defeated;
    this.root.visible = !this.defeated;
    this.pos.copy(this.home);
    this.pos.y = this.game.world.alturaChao(this.pos);
    this.facing = 0;
    this.root.rotation.set(0, 0, 0);
    this.cooldown = 1.5;
    this.setState(this.defeated ? 'gone' : 'dormant');
  }

  /** O jogador pisou no terraço: acorda com um rugido. */
  wake() {
    if (this.state !== 'dormant') return;
    this.setState('intro');
  }

  /** Algum jogador está no terraço e o dragão dorme? (o gatilho da luta, em main.js) */
  podeAcordar() {
    // no mundo de outro (co-op), quem acorda o dragão é o anfitrião
    if (this.state !== 'dormant' || this.defeated || this.game.marionetes) return false;
    return this.game.jogadores.some((j) => {
      if (j.dead) return false;
      const [r, c] = this.game.world.cellOf(j.pos);
      return this.game.world.nivel(r, c) === 1;
    });
  }

  /** Quem ele ataca: o mesmo contrato de `Enemy.alvo` (ver enemies.js). */
  get alvo() { return this._alvo ?? this.game.player; }

  takeDamage(amount, srcPos, poise, opts = {}) {
    if (!this.active || this.dead || this.invulnerable) return null;
    // ESCAMA DE DRAGÃO: fogo quase não entra (resina, bomba, tocha)
    const dano = amount * (opts.fire ? 0.35 : 1);
    this.hp -= dano;
    this.recentDmg = this.game.time - this.lastHit < 2.5 ? this.recentDmg + Math.round(dano) : Math.round(dano);
    this.lastHit = this.game.time;
    this.flashT = 0.12;
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  ignite() { /* imune: é um dragão */ }

  die() {
    this.hp = 0;
    this.dead = true;
    this.defeated = true;   // não volta mais: descansar na fogueira não o ressuscita
    this.brasa.intensity = 0;
    this.setState('morrendo');
    this.game.sfx.roar();
    this.game.onEnemyKilled(this);
  }

  // ------------------------------------------------------------------ IA
  update(dt) {
    this.stateT = (this.stateT ?? 0) + dt;
    if (this.game.marionetes) return this.updateMarionete(dt);
    if (!this.active) return;
    if (this.flashT > 0) {
      this.flashT -= dt;
      this.material.emissive.setHex(this.flashT > 0 ? 0x552211 : EMISSIVO);
    }
    const game = this.game, w = game.world;
    this.alvoT = (this.alvoT ?? 0) - dt;
    if (this.alvoT <= 0 || !this._alvo || this._alvo.dead) { this.alvoT = 0.5; this._alvo = game.alvoPara(this.pos, this._alvo); }
    const p = this.alvo;
    const antes = this.pos.clone();
    const d = flatDist(this.pos, p.pos);
    const ang = angleToTarget(this.pos, this.facing, p.pos);
    const anim = { andar: 0, pescocoX: 0, pescocoY: 0, cabecaX: 0, boca: 0, asa: 0, agacha: 0, altura: 0 };
    const t = this.stateT;
    const frente = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));

    switch (this.state) {
      case 'dormant':
        anim.pescocoX = 0.35; anim.cabecaX = 0.25; anim.agacha = 0.35;     // enrolado, cabeça baixa
        break;

      case 'intro': {
        const k = Math.min(1, t / 1.2);
        anim.agacha = 0.35 * (1 - k);
        anim.pescocoX = -0.5 * k; anim.boca = t > 1.0 && t < 2.2 ? 0.6 : 0; anim.asa = Math.sin(t * 6) * 0.4 * k;
        if (!this.st.rugiu && t > 1.0) { this.st.rugiu = true; game.sfx.roar(); game.addShake(0.5); }
        this.brasa.intensity = 6 * k;
        this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * 1.2);
        if (t > 2.6) this.setState('chase');
        break;
      }

      case 'chase': {
        this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * 1.5);
        anim.pescocoY = THREE.MathUtils.clamp(-ang * Math.sign(Math.sin(yawTo(this.pos, p.pos) - this.facing)), -0.5, 0.5);
        if (d > 4.2) {
          this.pos.addScaledVector(frente, 3.3 * dt);
          anim.andar = 1;
          this.passo += dt * 5;
        }
        this.cooldown -= dt;
        if (this.cooldown <= 0 && !p.dead) this.escolherAtaque(d, ang);
        break;
      }

      case 'mordida': {
        // recua (0–0,55), avança com a boca aberta (0,55–0,8), volta
        if (t < 0.55) { anim.pescocoX = -0.55 * (t / 0.55); anim.boca = 0.2; this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * 2); }
        else if (t < 0.8) { anim.pescocoX = 0.55; anim.cabecaX = 0.2; anim.boca = 0.65; }
        else anim.pescocoX = 0.55 * (1 - Math.min(1, (t - 0.8) / 0.5));
        if (!this.st.som && t > 0.5) { this.st.som = true; game.sfx.swing(true); }
        if (!this.st.acertou && t > 0.55 && t < 0.8 && d < 6.2 && ang < 0.7) {
          const res = p.takeDamage(58, this.pos, { poise: 90 });
          if (res !== 'iframe') { this.st.acertou = true; game.addShake(0.3); }
        }
        if (t > 1.3) this.fimDeAtaque();
        break;
      }

      case 'cauda': {
        // agacha e gira o corpo inteiro: a cauda varre em volta
        anim.agacha = t < 0.3 ? t : 0.3;
        if (t > 0.3 && t < 1.1) this.facing += (Math.PI * 2 / 0.8) * dt * (this.st.lado ?? 1);
        if (!this.st.som && t > 0.35) { this.st.som = true; game.sfx.swing(true); }
        if (!this.st.acertou && t > 0.5 && t < 1.1 && d < 7.8) {
          const res = p.takeDamage(46, this.pos, { poise: 110 });
          if (res !== 'iframe') { this.st.acertou = true; game.addShake(0.35); }
        }
        if (t > 1.5) this.fimDeAtaque();
        break;
      }

      case 'sopro': {
        // levanta a cabeça e junta brasa (0–0,9), sopra fogo num cone (0,9–2,9)
        const soprando = t > 0.9 && t < 2.9;
        anim.pescocoX = t < 0.9 ? -0.45 * (t / 0.9) : 0.15; anim.boca = soprando ? 0.7 : 0.2;
        this.brasa.intensity = t < 0.9 ? 6 + 30 * (t / 0.9) : soprando ? 40 : 6;
        this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * (soprando ? 0.45 : 1.6));
        if (!this.st.som && t > 0.85) { this.st.som = true; game.sfx.explosion(); }
        if (soprando) {
          const boca = this.soprarFogo(frente);
          this.st.tick = (this.st.tick ?? 0) - dt;
          if (this.st.tick <= 0 && d < 14 && angleToTarget(this.pos, this.facing, p.pos) < 0.38) {
            this.st.tick = 0.3;
            p.takeDamage(13, boca, { poise: 12 });
          }
        }
        if (t > 3.3) { this.brasa.intensity = 6; this.fimDeAtaque(); }
        break;
      }

      case 'salto': {
        // agacha (0–0,5), voa até onde o jogador ESTAVA (0,5–1,4), cai com onda de choque
        if (t < 0.5) { anim.agacha = t; this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * 4); }
        else if (t < 1.4) {
          if (!this.st.de) { this.st.de = this.pos.clone(); this.st.para = this.alvoNoTerraco(p.pos); }
          const k = (t - 0.5) / 0.9;
          this.pos.x = THREE.MathUtils.lerp(this.st.de.x, this.st.para.x, k);
          this.pos.z = THREE.MathUtils.lerp(this.st.de.z, this.st.para.z, k);
          anim.altura = Math.sin(k * Math.PI) * 6;
          anim.asa = Math.sin(t * 16) * 0.7;
        } else if (!this.st.caiu) {
          this.st.caiu = true;
          const centro = this.pos.clone();
          centro.y = w.alturaChao(centro);
          game.projectiles.shock({ pos: centro, maxR: 8, speed: 11, damage: 55, poise: 90 });
          game.sfx.slam();
          game.addShake(0.6);
          game.effects.burst(centro.clone().setY(centro.y + 0.2), { count: 50, color: [0.45, 0.4, 0.35], speed: 7, size: 0.28, life: 0.9, gravity: 8 });
        }
        if (t > 2.1) this.fimDeAtaque();
        break;
      }

      case 'morrendo': {
        // tomba de lado e afunda nas cinzas
        const k = Math.min(1, t / 1.6);
        this.root.rotation.z = k * 1.35;
        anim.pescocoX = 0.6 * k; anim.boca = 0.5;
        if (t > 2.5) anim.altura = -(t - 2.5) * 1.2;
        if (Math.random() < 0.5) game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0.4, (Math.random() - 0.5) * 5)), vel: new THREE.Vector3(0, 1 + Math.random(), 0), color: [0.35, 0.32, 0.3], size: 0.2, life: 1.4 });
        if (t > 5) { this.active = false; this.root.visible = false; this.setState('gone'); }
        break;
      }
    }

    // não sai do terraço (nem pela escada): o passo que termina fora é desfeito
    if (this.state !== 'morrendo') {
      const [r, c] = w.cellOf(this.pos);
      if (w.nivel(r, c) !== 1) { this.pos.x = antes.x; this.pos.z = antes.z; }
      if (anim.altura <= 0) w.resolve(this.pos, this.radius);
    }
    this.pos.y = w.alturaChao(this.pos) + anim.altura - anim.agacha * 0.6;
    this.root.rotation.y = this.facing;
    this.ultimaAnim = anim;   // vai no `TIPO.MUNDO` do co-op: o convidado anima com ela
    this.animar(dt, anim);
  }

  /** As labaredas do sopro (um quadro). Devolve a boca, de onde saem. */
  soprarFogo(frente) {
    const boca = this.boca();
    for (let i = 0; i < 3; i++) {
      const dir = frente.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.35, -0.12 + (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.35)).normalize();
      this.game.effects.spawn({ pos: boca.clone(), vel: dir.multiplyScalar(13 + Math.random() * 5), color: [1, 0.35 + Math.random() * 0.35, 0.08], size: 0.45 + Math.random() * 0.4, life: 0.8, gravity: -1.5, drag: 0.6 });
    }
    return boca;
  }

  // ---------- Marionete (co-op, no CONVIDADO) — o mesmo contrato de `Enemy` ----------
  receberMarionete(e, quando) { (this.fio ??= new Interpolador()).receber(e, quando); }
  soltarMarionete() { this.fio = null; this.root.rotation.z = 0; }

  /**
   * ASSUMIR o dragão no meio do caminho (o mundo online trocou de simulador,
   * ver `Enemy.retomar`): dormindo ou vencido, `sleep()` resolve; em luta,
   * segue de onde estava, já acordado.
   */
  retomar(r) {
    this.soltarMarionete();
    this.sleep();
    if (this.defeated || !this.home || !r || r.morto || !r.ativo || r.st === 'dormant' || r.st === 'gone') return;
    this.pos.set(r.x, r.y, r.z);
    this.pos.y = this.game.world.alturaChao(this.pos);
    this.facing = r.g;
    this.hp = Math.min(this.maxHp, Math.max(1, r.hp));
    this.brasa.intensity = 6;
    this.setState('chase');
    this.cooldown = 1.5;
  }

  updateMarionete(dt) {
    const am = this.fio?.amostra();
    if (!am || !this.pecas) return;
    const { a, b, k } = am, e = k < 0.5 ? a : b;
    this.pos.set(THREE.MathUtils.lerp(a.x, b.x, k), THREE.MathUtils.lerp(a.y, b.y, k), THREE.MathUtils.lerp(a.z, b.z, k));
    this.facing = a.g + giroCurto(b.g - a.g) * k;
    if (e.hp < this.hp - 0.5) { this.lastHit = this.game.time; this.flashT = 0.12; }
    this.hp = e.hp;
    this.active = e.ativo;
    this.dead = e.morto;
    this.root.visible = e.visivel;
    if (this.state !== e.st) this.setState(e.st);
    this.stateT = e.t ?? this.stateT;
    const x = e.extra ?? {};
    this.root.rotation.z = Number.isFinite(x.rz) ? x.rz : 0;
    this.brasa.intensity = Number.isFinite(x.br) ? x.br : 0;
    const anim = x.anim ?? { andar: 0, pescocoX: 0, pescocoY: 0, cabecaX: 0, boca: 0, asa: 0, agacha: 0, altura: 0 };
    if (this.state === 'sopro' && this.stateT > 0.9 && this.stateT < 2.9) this.soprarFogo(new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing)));
    this.passo += dt * 5 * anim.andar;
    if (this.flashT > 0) { this.flashT -= dt; this.material.emissive.setHex(this.flashT > 0 ? 0x552211 : EMISSIVO); }
    this.root.rotation.y = this.facing;
    this.animar(dt, anim);
  }

  escolherAtaque(d, ang) {
    const r = Math.random();
    if (d > 12) return this.setState('salto');
    if (ang > 1.7 && d < 8) return this.setState('cauda', { lado: Math.random() < 0.5 ? 1 : -1 });
    if (d < 5.8 && ang < 0.8) return this.setState(r < 0.7 ? 'mordida' : 'cauda', { lado: 1 });
    if (d < 14 && ang < 0.6) return this.setState(r < 0.6 ? 'sopro' : 'salto');
    if (d > 7) return this.setState(r < 0.5 ? 'salto' : 'sopro');
    this.cooldown = 0.3;
  }

  fimDeAtaque() {
    this.setState('chase');
    this.cooldown = 1.1 + Math.random() * 1.2;
  }

  /** Onde o salto cai: o ponto do jogador, puxado para dentro do terraço. */
  alvoNoTerraco(alvo) {
    const w = this.game.world;
    const p = alvo.clone();
    for (let i = 0; i < 12; i++) {
      const [r, c] = w.cellOf(p);
      const dentro = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => w.nivel(r + a, c + b) === 1);
      if (dentro) return p;
      p.lerp(this.home, 0.2);
    }
    return this.home.clone();
  }

  /** A boca, em coordenadas do mundo (de onde sai o fogo). */
  boca() {
    const cabeca = this.pecas.get('cabeca');
    return cabeca ? cabeca.localToWorld(new THREE.Vector3(0, 0.2, 1.8)) : this.pos.clone().setY(this.pos.y + 3);
  }

  // ----------------------------------------------------------- animação
  /** Gira cada peça a partir da pose do arquivo (ver `this.base`). */
  animar(dt, a) {
    const P = this.pecas, B = this.base;
    const gira = (id, dx = 0, dy = 0, dz = 0) => {
      const g = P.get(id), b = B.get(id);
      if (g && b) g.rotation.set(b.x + dx, b.y + dy, b.z + dz);
    };
    const tempo = this.game.time ?? 0;
    const respira = Math.sin(tempo * (this.state === 'dormant' ? 1.2 : 2.2)) * 0.04;
    const s = Math.sin(this.passo) * 0.55 * a.andar;
    gira('corpo', respira * 0.5, 0, Math.sin(this.passo) * 0.04 * a.andar);
    gira('pataFE', s); gira('pataTD', s);
    gira('pataFD', -s); gira('pataTE', -s);
    gira('pescoco', a.pescocoX + respira, a.pescocoY);
    gira('cabeca', a.cabecaX, a.pescocoY * 0.4);
    gira('mandibula', a.boca);
    const bate = a.asa + Math.sin(tempo * 1.4) * 0.08;
    gira('asaE', 0, 0, -bate); gira('asaD', 0, 0, bate);
    for (const [i, id] of ['cauda1', 'cauda2', 'cauda3'].entries()) {
      gira(id, 0, Math.sin(tempo * 1.6 - i * 0.7) * (0.12 + 0.08 * i) * (this.state === 'dormant' ? 0.4 : 1));
    }
  }
}
