/**
 * O COMPORTAMENTO DO DRAGÃO (24/11/2026; o Wyrm das Cinzas, o chefe secreto do terraço): um colosso
 * que anda, MORDE quem está na frente, VARRE com a cauda quem está atrás, SOPRA fogo num cone e
 * SALTA de asas abertas até onde o alvo estava, caindo com uma onda de choque. A base (vida, estado,
 * alvo, morte, troca de simulador) é a do cerebro.js; dormir, acordar e não sair do terraço são os
 * traços `chefe` e `territorio` (tracos.js). Os números de cada golpe moram na ficha (`golpes`).
 *
 * O corpo dele (js/dragao.js) é um MODELO DE BLOCOS sem esqueleto, animado peça por peça: por isso o
 * cérebro diz a POSE de cada quadro (`pose`: andar, pescoço, cabeça, boca, asas, agachar, altura do
 * salto), o passo das patas (`passo`), o tombo de quem morre (`tombo`) e o brilho da garganta
 * (`brilhoDaBrasa`). A pose vai também no retrato da rede (`ultimaAnim`): quem não simula anima com ela.
 *
 * Os EVENTOS deste comportamento (o corpo desenha): 'brandiu' { pesado } (a mordida e a cauda),
 * 'tremeu' { forca } (o golpe pegou), 'soprou' (o fogo começa), 'soprando' (um quadro de fogo),
 * 'pancada' { pos } (o salto caiu), 'morreu'.
 */
import * as THREE from 'three';
import { angleToTarget, yawTo, turnTowards, flatDist } from '../geometria.js';
import { Inimigo } from './cerebro.js';

export const POSE_PARADA = { andar: 0, pescocoX: 0, pescocoY: 0, cabecaX: 0, boca: 0, asa: 0, agacha: 0, altura: 0 };
/** A ORDEM da pose na rede (`poseEmNumeros`): mudar a ordem desencontra quem está com a versão de antes. */
const PARTES_DA_POSE = ['andar', 'pescocoX', 'pescocoY', 'cabecaX', 'boca', 'asa', 'agacha', 'altura'];
const POSE_DORMINDO = { ...POSE_PARADA, pescocoX: 0.35, cabecaX: 0.25, agacha: 0.35 };   // enrolado, cabeça baixa
// de onde sai o fogo e o dano do sopro, sem o modelo: à frente do corpo, na altura da cabeça erguida
const BOCA = { frente: 4.2, altura: 3 };

export class Draconico extends Inimigo {
  renascer() {
    this.pos.y = this.mundo.world.alturaChao(this.pos);
    this.cooldown = this.cfg.chefe?.pausa ?? 1.5;
    this.passo = 0;           // a fase da caminhada (as patas alternam por ela)
    this.tombo = 0;           // o quanto tomba de lado (morrendo)
    this.brilhoDaBrasa = 0;   // a luz da garganta e dos olhos
    this.pose = { ...POSE_PARADA };
    return {};
  }

  get lockable() { return this.active && !this.dead && !['dormant', 'gone'].includes(this.state) && super.lockable; }
  get invulnerable() { return this.state === 'morrendo' || super.invulnerable; }
  get estadoDeMorto() { return 'morrendo'; }
  /** Ataca quem estiver mais perto, sem olhar a arena do Carrasco. */
  podeMirar() { return true; }

  // ---------- Dano ----------
  receberGolpe(amount, srcPos, poise, opts = {}) {
    if (!this.active || this.dead || this.invulnerable) return null;
    // ESCAMA DE DRAGÃO: fogo quase não entra (resina, bomba, tocha) — a ficha: `fireWeak`
    const dano = amount * (opts.fire ? (this.cfg.fireWeak ?? 1) : 1);
    this.hp -= dano;
    this.recentDmg = this.mundo.time - this.lastHit < 2.5 ? this.recentDmg + Math.round(dano) : Math.round(dano);
    this.lastHit = this.mundo.time;
    this.flashT = 0.12;
    if (this.hp <= 0) this.die();
    return 'hit';
  }

  die() {
    this.brilhoDaBrasa = 0;
    super.die();
  }

  // ---------- O quadro ----------
  /** A pose de partida do quadro (dormindo, enrolado; acordado, parado) e o alvo. */
  preparar(dt) {
    this.escolherAlvo(dt);
    this.pose = { ...(this.state === 'dormant' ? POSE_DORMINDO : POSE_PARADA) };
  }

  decidir(dt) {
    const p = this.alvo, c = this.cfg, g = c.golpes, a = this.pose, t = this.stateT;
    const d = flatDist(this.pos, p.pos), ang = angleToTarget(this.pos, this.facing, p.pos);
    const frente = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));

    switch (this.state) {
      case 'intro': {   // (o rugido e o fim da entrada: o traço `chefe`)
        const k = Math.min(1, t / 1.2);
        a.agacha = 0.35 * (1 - k);
        a.pescocoX = -0.5 * k; a.boca = t > 1.0 && t < 2.2 ? 0.6 : 0; a.asa = Math.sin(t * 6) * 0.4 * k;
        this.brilhoDaBrasa = 6 * k;
        this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * 1.2);
        break;
      }

      case 'chase': {
        this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * c.giro);
        a.pescocoY = THREE.MathUtils.clamp(-ang * Math.sign(Math.sin(yawTo(this.pos, p.pos) - this.facing)), -0.5, 0.5);
        if (d > c.perto) {
          this.pos.addScaledVector(frente, c.velocidade * dt);
          a.andar = 1;
          this.passo += dt * 5;
        }
        this.cooldown -= dt;
        if (this.cooldown <= 0 && !p.dead) this.escolherAtaque(d, ang);
        break;
      }

      case 'mordida': {
        // recua (0–0,55), avança com a boca aberta (0,55–0,8), volta
        if (t < 0.55) { a.pescocoX = -0.55 * (t / 0.55); a.boca = 0.2; this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * 2); }
        else if (t < 0.8) { a.pescocoX = 0.55; a.cabecaX = 0.2; a.boca = 0.65; }
        else a.pescocoX = 0.55 * (1 - Math.min(1, (t - 0.8) / 0.5));
        if (!this.st.som && t > 0.5) { this.st.som = true; this.emitir('brandiu', { pesado: true }); }
        if (!this.st.acertou && t > 0.55 && t < 0.8 && d < g.mordida.alcance && ang < g.mordida.angulo) {
          const res = p.takeDamage(g.mordida.dano, this.pos, { poise: g.mordida.poise });
          if (res !== 'iframe') { this.st.acertou = true; this.emitir('tremeu', { forca: g.mordida.tremor }); }
        }
        if (t > 1.3) this.fimDeAtaque();
        break;
      }

      case 'cauda': {
        // agacha e gira o corpo inteiro: a cauda varre em volta
        a.agacha = t < 0.3 ? t : 0.3;
        if (t > 0.3 && t < 1.1) this.facing += (Math.PI * 2 / 0.8) * dt * (this.st.lado ?? 1);
        if (!this.st.som && t > 0.35) { this.st.som = true; this.emitir('brandiu', { pesado: true }); }
        if (!this.st.acertou && t > 0.5 && t < 1.1 && d < g.cauda.alcance) {
          const res = p.takeDamage(g.cauda.dano, this.pos, { poise: g.cauda.poise });
          if (res !== 'iframe') { this.st.acertou = true; this.emitir('tremeu', { forca: g.cauda.tremor }); }
        }
        if (t > 1.5) this.fimDeAtaque();
        break;
      }

      case 'sopro': {
        // levanta a cabeça e junta brasa (0–0,9), sopra fogo num cone (0,9–2,9)
        const soprando = t > 0.9 && t < 2.9;
        a.pescocoX = t < 0.9 ? -0.45 * (t / 0.9) : 0.15; a.boca = soprando ? 0.7 : 0.2;
        this.brilhoDaBrasa = t < 0.9 ? 6 + 30 * (t / 0.9) : soprando ? 40 : 6;
        this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * (soprando ? 0.45 : 1.6));
        if (!this.st.som && t > 0.85) { this.st.som = true; this.emitir('soprou'); }
        if (soprando) {
          this.emitir('soprando');
          this.st.tick = (this.st.tick ?? 0) - dt;
          if (this.st.tick <= 0 && d < g.sopro.alcance && angleToTarget(this.pos, this.facing, p.pos) < g.sopro.angulo) {
            this.st.tick = g.sopro.intervalo;
            p.takeDamage(g.sopro.dano, this.boca(), { poise: g.sopro.poise });
          }
        }
        if (t > 3.3) { this.brilhoDaBrasa = 6; this.fimDeAtaque(); }
        break;
      }

      case 'salto': {
        // agacha (0–0,5), voa até onde o alvo ESTAVA (0,5–1,4), cai com onda de choque
        if (t < 0.5) { a.agacha = t; this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * 4); }
        else if (t < 1.4) {
          if (!this.st.de) { this.st.de = this.pos.clone(); this.st.para = this.ondeCair(p.pos); }
          const k = (t - 0.5) / 0.9;
          this.pos.x = THREE.MathUtils.lerp(this.st.de.x, this.st.para.x, k);
          this.pos.z = THREE.MathUtils.lerp(this.st.de.z, this.st.para.z, k);
          a.altura = Math.sin(k * Math.PI) * 6;
          a.asa = Math.sin(t * 16) * 0.7;
        } else if (!this.st.caiu) {
          this.st.caiu = true;
          const centro = this.pos.clone();
          centro.y = this.mundo.world.alturaChao(centro);
          this.mundo.projectiles.shock({ pos: centro, maxR: g.salto.raio, speed: g.salto.velocidade, damage: g.salto.dano, poise: g.salto.poise });
          this.emitir('pancada', { pos: centro });
        }
        if (t > 2.1) this.fimDeAtaque();
        break;
      }
    }
  }

  /** Pisa: não sai do terraço (o traço `territorio`), não atravessa parede no chão, e a altura da pose. */
  pisar() {
    const w = this.mundo.world, a = this.pose;
    if (this.state !== 'morrendo') {
      this.traco('aoPisar');
      if (a.altura <= 0) w.resolve(this.pos, this.radius);
    }
    this.pos.y = w.alturaChao(this.pos) + a.altura - a.agacha * 0.6;
    this.ultimaAnim = a;   // vai no `TIPO.MUNDO`: quem não simula anima com ela
  }

  /** Morrendo: tomba de lado e afunda nas cinzas; em 5 s sai de cena. */
  updateDeath(dt) {
    if (this.traco('morrendo', dt)) return;
    const t = this.stateT, k = Math.min(1, t / 1.6), a = this.pose;
    this.tombo = k * 1.35;
    a.pescocoX = 0.6 * k; a.boca = 0.5;
    if (t > 2.5) a.altura = -(t - 2.5) * 1.2;
    if (t > 5) { this.active = false; this.visivel = false; this.setState('gone'); }
    this.pisar();
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
    const [p0, p1] = this.cfg.pausa;
    this.cooldown = p0 + Math.random() * (p1 - p0);
  }

  /** Onde o salto cai: o ponto do alvo, puxado para dentro do território (com folga para o corpo largo). */
  ondeCair(alvo) {
    const w = this.mundo.world, nivel = this.cfg.territorio?.nivel ?? 1;
    const p = alvo.clone();
    for (let i = 0; i < 12; i++) {
      const [r, c] = w.cellOf(p);
      const dentro = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => w.nivel(r + a, c + b) === nivel);
      if (dentro) return p;
      p.lerp(this.home, 0.2);
    }
    return this.home.clone();
  }

  /** De onde sai o sopro (a origem do dano): à frente, na altura da cabeça (ver `BOCA`). */
  boca() {
    return new THREE.Vector3(this.pos.x + Math.sin(this.facing) * BOCA.frente, this.pos.y + BOCA.altura, this.pos.z + Math.cos(this.facing) * BOCA.frente);
  }

  // ---------- A pose na rede ----------
  /** A pose em números (o `extra.anim` do retrato), na ordem de `PARTES_DA_POSE`. */
  poseEmNumeros() { return PARTES_DA_POSE.map((k) => this.ultimaAnim?.[k] ?? 0); }
  /** O contrário (quem anima pelo retrato). Números a menos ou tortos: a pose parada. */
  static poseDeNumeros(n) {
    if (!Array.isArray(n) || n.length !== PARTES_DA_POSE.length) return { ...POSE_PARADA };
    return Object.fromEntries(PARTES_DA_POSE.map((k, i) => [k, n[i]]));
  }

  /** Assumido do retrato no meio da luta: a garganta já acesa. */
  retomar(r) {
    super.retomar(r);
    if (!this.defeated && this.state === 'chase') this.brilhoDaBrasa = 6;
  }
}
