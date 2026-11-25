/**
 * OS INIMIGOS NO NAVEGADOR (24/11/2026: o cérebro saiu para js/inimigos/cerebro.js). O `Enemy` é
 * o cérebro (`Inimigo`) com um CORPO: o boneco (`CharacterModel`), as armas na mão, as animações
 * que o cérebro pede, as faíscas, os sons, o escudo em pedaços e o esqueleto que desmonta. O corpo
 * NÃO decide nada: lê o estado do cérebro a cada quadro (`vestirCorpo`) e responde aos eventos dele
 * (`aoEvento`). Lá, as regras; aqui, só o que se vê e se ouve.
 *
 * A MARIONETE (o co-op e o Mundo online, quando outro simula) também é daqui: quem decide é o
 * retrato que chega pela rede, e o corpo só o repete.
 */
import * as THREE from 'three';
import { CharacterModel, weaponMesh, shieldMesh } from './character.js';
import { desmontar } from './desmontar.js';
import { Interpolador, giroCurto, loopa } from './remoto.js';
import { Inimigo } from './inimigos/cerebro.js';
import { ENEMY_TYPES } from './inimigos/tipos.js';
import { ESQUELETOS, BICHOS, CHEFES, lugarDoNascimento } from './inimigos/nascimentos.js';
import { Animal } from './animais.js';
import { GLOW } from './world.js';

export { ENEMY_TYPES, REFORCO_ESQUELETOS } from './inimigos/tipos.js';

/** Quanto da queda o esqueleto faz inteiro antes de desmontar (desmontar.js). */
const DESMONTA_APOS = 0.3;

export class Enemy extends Inimigo {
  constructor(game, cfg, spawnPos, facing = 0, opts = {}) {
    super(game, cfg, spawnPos, facing, opts);   // o cérebro (o `Game` é o mundo dele)
    this.game = game;
    this.model = new CharacterModel({ outfit: cfg.outfit, scale: cfg.scale, hideBody: !!cfg.skeleton, skinTint: cfg.skinTint });
    if (cfg.right) this.model.equip('r', weaponMesh(cfg.right));
    if (cfg.left) this.model.equip('l', shieldMesh(cfg.left));
    game.scene.add(this.model.root);
    this.desmontado = false; this.desmontarEm = null;
    if (cfg.corpo?.olhos === 'brasa') this.montarOlhos();
    this.ouvir((tipo, d) => this.aoEvento(tipo, d));
    // o que o cérebro já pediu ao nascer (antes de o corpo existir): a pose e o lugar
    this.aplicarAnim(this.animPedida);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
  }

  // ---------- O corpo responde ao cérebro ----------
  aplicarAnim(p) {
    if (!p) return;
    if (p.pose != null) this.model.pose(p.nome, p.pose);
    else this.model.play(p.nome, p.opcoes);
  }

  /** A mão esquerda no mundo (onde o escudo segura o golpe). */
  maoEsquerda() { return this.model.handL.getWorldPosition(new THREE.Vector3()); }

  /**
   * OLHOS EM BRASA (a ficha: `corpo.olhos = 'brasa'`, o Carrasco): dois pontos acesos sob o capuz e
   * uma luz fraca. Apagados dormindo, acesos no rugido, maiores na fase 2. A luz (`eyeGlow`) entra no
   * orçamento de luzes do mundo (`World.distribuirLuzes`).
   */
  montarOlhos() {
    const anchor = this.model.scene.userData.eyeAnchor;
    if (!anchor) return;
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
    this.olhos(0, 0.25, 1);
  }

  /** A luz, o quanto os olhos aparecem e o tamanho deles. */
  olhos(luz, opacidade, tamanho) {
    if (!this.eyes) return;
    this.eyeGlow.intensity = luz;
    for (const e of this.eyes) { e.material.opacity = opacidade; e.scale.set(0.07 * tamanho, 0.045 * tamanho, 1); }
  }

  aoEvento(tipo, d) {
    const g = this.game;
    switch (tipo) {
      case 'anim': this.aplicarAnim(d); return;
      case 'renasceu':
        this.model.root.scale.setScalar(1);
        this.desmontado = false; this.desmontarEm = null;
        if (d.escudoDeVolta) this.model.equip('l', shieldMesh(this.cfg.left));
        this.model.flash(false); this._piscando = false;
        return;
      case 'bloqueou': g.effects.sparks(this.maoEsquerda()); return;
      case 'escudoRachou': g.effects.burst(this.maoEsquerda(), { count: 10, color: [0.5, 0.36, 0.22], speed: 3.5, size: 0.07, life: 0.5, gravity: 10 }); return;
      case 'escudoPartiu': {
        // os pedaços dele voam (fratura.js) e o braço fica vazio
        const peca = this.model.slotL?.children[0];
        if (peca && this.model.root.visible) g.world.soltarFragmentos(peca, `escudo:${this.escudo.kind}`, 7, d.de, 1.2);
        this.model.equip('l', null);
        g.sfx.quebrar?.();
        return;
      }
      case 'ferido':
        g.effects.burst(d.pos, { count: 16, color: [0.85, 0.82, 0.72], speed: 5, size: 0.09, life: 0.5, gravity: 12 });
        g.effects.sparks(d.pos);
        g.sfx.rattle();
        return;
      case 'morreu':
        g.sfx.rattle();
        if (this.cfg.skeleton) this.desmontarEm = DESMONTA_APOS;
        return;
      case 'acordou': case 'avistou': g.sfx.rattle(); return;
      case 'brandiu': g.sfx.swing(d.pesado); return;
      case 'pancada':
        g.sfx.slam();
        g.addShake(0.45);
        g.effects.burst(d.pos.clone().setY(d.pos.y + 0.2), { count: 40, color: [0.45, 0.4, 0.35], speed: 6, size: 0.22, life: 0.8, gravity: 8 });
        return;
      case 'conjurou': g.sfx.cast(); return;
      // o CHEFE (os traços `chefe`, `fases` e `invocar`)
      case 'adormeceu': this.olhos(0, 0.25, 1); this.model.setEmissive(0, 0, 0); return;
      case 'olhosAcesos': this.olhos(5, 1, 1); return;
      case 'fase': this.olhos(10, 1, 1.4); return;
      case 'rugiu': g.sfx.roar(); if (d.tremor) g.addShake(d.tremor); return;
      case 'explodiu':
        g.effects.ring(d.pos, d.raio, 0.6, 0xff2a10);
        g.effects.burst(d.pos.clone().setY(d.pos.y + 2), { count: 120, color: [0.9, 0.15, 0.05], speed: 12, size: 0.3, life: 1.0, gravity: 0 });
        return;
      case 'invocou': g.effects.burst(d.pos.clone().setY(d.pos.y + 0.2), { count: 40, color: [0.5, 0.2, 0.6], speed: 4, size: 0.2, life: 0.8, gravity: 4 }); return;
    }
  }

  /** O ESQUELETO DESMONTA (desmontar.js): as partes caem soltas e o boneco some. */
  desmontarAgora() {
    const raiz = this.model.root;
    if (raiz.visible && raiz.parent) desmontar(this.model, this.game.world, this.golpeDe);
    this.desmontado = true;
    raiz.visible = false;
  }

  // ---------- Atualização ----------
  update(dt) {
    // o esqueleto vencido desmonta um instante depois de cair (o começo da queda é a animação)
    if (this.desmontarEm != null && this.dead && (this.desmontarEm -= dt) <= 0) { this.desmontarEm = null; this.desmontarAgora(); }
    if (this.game.marionetes) {
      this.stateT += dt;
      if (this.flashT > 0) this.flashT -= dt;   // (o golpe dado aqui pisca na hora: `Mundo.golpear`)
      this.updateMarionete(dt);
      this.traco('depois', dt);
    } else super.update(dt);
    this.vestirCorpo(dt);
  }

  /** O corpo segue o cérebro: o lugar, o rumo, se aparece, o piscar, o fogo e o sangue, a animação. */
  vestirCorpo(dt) {
    const raiz = this.model.root;
    raiz.position.copy(this.pos);
    raiz.visible = this.visivel && !this.desmontado;
    if (!this.game.marionetes && !this.active) return;   // (fora de cena: nem anima)
    const pisca = this.flashT > 0;
    if (pisca !== this._piscando) { this._piscando = pisca; this.model.flash(pisca); }
    if (!this.game.marionetes && !this.dead) {
      if (this.burnT > 0 && Math.random() < 0.6) this.game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * this.height, (Math.random() - 0.5) * 0.8)), vel: new THREE.Vector3(0, 1.5, 0), color: [1, 0.5, 0.1], size: 0.18, life: 0.5 });
      if (this.bleedT > 0 && Math.random() < 0.35) this.game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, this.height * (0.3 + Math.random() * 0.5), (Math.random() - 0.5) * 0.6)), vel: new THREE.Vector3(0, -1.2, 0), color: [0.55, 0.02, 0.02], size: 0.12, life: 0.6 });
    }
    // a FASE 2 de quem tem `corpo.pulsoNaFase` (o Carrasco): o corpo pulsa em brasa e solta faíscas
    if (this.cfg.corpo?.pulsoNaFase && this.phase >= 2 && !this.dead && this.active) {
      const pulso = 0.5 + Math.sin(this.game.time * 5) * 0.5;
      if (this.flashT <= 0) this.model.setEmissive(0.03 + pulso * 0.04, 0.004, 0);
      if (Math.random() < 0.7) {
        this.game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 2.8, (Math.random() - 0.5) * 1.6)),
          vel: new THREE.Vector3(0, 1.5 + Math.random(), 0), color: [0.8, 0.1, 0.03], size: 0.2, life: 1.0 });
      }
    }
    raiz.rotation.y = this.facing;
    this.model.update(dt);
  }

  /** Caído: o cérebro afunda o corpo (ou o encolhe: o traço `morte`); aqui, a poeira (ou as brasas). */
  updateDeath(dt) {
    super.updateDeath(dt);
    const m = this.cfg.morte;
    if (m?.estilo === 'encolher') {
      if (this.state === 'gone') return;
      if (this.stateT < m.espera && Math.random() < 0.9) {
        this.game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, Math.random() * 1.5, (Math.random() - 0.5) * 2.5)),
          vel: new THREE.Vector3(0, 2 + Math.random() * 2, 0), color: [1, 0.55, 0.25], size: 0.22, life: 1.5 });
      }
      if (this.stateT > m.espera) this.model.root.scale.setScalar(1 - Math.min(1, (this.stateT - m.espera) / m.dura) * 0.999);
      return;
    }
    if (this.stateT > 3 && Math.random() < 0.4) this.game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.3, (Math.random() - 0.5) * 1.5)), vel: new THREE.Vector3(0, 1 + Math.random(), 0), color: [0.4, 0.38, 0.35], size: 0.1, life: 1.2 });
  }

  // ---------- Marionete (co-op e Mundo online, quando outro simula) ----------
  // No mundo de outro, quem decide o que este inimigo faz é quem SIMULA: ele manda o estado
  // (`TIPO.MUNDO`, ver rede/coop.js e rede/mundo.js) e aqui só se repete, interpolado. Nada de IA,
  // de dano, de alma: o golpe daqui vai para quem simula (`game.golpear`) e volta como vida nova.

  /** Um retrato de quem simula: `{x, y, z, g, a, s, hp, st, ativo, morto, visivel}`. */
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
      // o ESCUDO como o simulador o tem (escudo.js): a barra, os losangos e a quebra (só o visual)
      if (this.escudo && e.esc != null) {
        const esc = this.escudo;
        if (e.esc < 0 && !esc.quebrado) this.quebrarEscudo(null);
        else if (e.esc >= 0 && esc.quebrado) { this.model.equip('l', shieldMesh(this.cfg.left)); esc.quebrado = false; }
        if (e.esc >= 0) { const v = e.esc * esc.max; if (v < esc.vida - 0.5) esc.ultimoGolpe = this.game.time; esc.vida = v; }
        esc.postura = e.post * esc.posturaMax;
      }
      this.visivel = e.visivel;
      if (e.morto && !this.dead) {
        this.dead = true;
        this.setState('dead');
        this.model.play(this.deathAnim, { loop: false, fade: 0.1 });
        this.game.sfx.rattle();
        if (this.cfg.skeleton) this.desmontarEm = DESMONTA_APOS;   // (desmonta aqui também: é só o visual)
      } else if (!e.morto && this.dead) {
        // RENASCEU lá (no mundo online os inimigos voltam por tempo): desfaz o
        // que a morte daqui deixou — o Carrasco encolhe ao morrer, e sem isto
        // voltaria do tamanho de um grão
        this.dead = false;
        this.desmontado = false; this.desmontarEm = null;
        this.model.root.scale.setScalar(1);
        this.model.flash(false); this._piscando = false;
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
  }

  /** Larga o modo marionete: de volta ao próprio mundo, `reset` põe de pé. */
  soltarMarionete() { this.fio = null; }

  /** A pose de quem dorme (a da ficha: deitado no chão; o Carrasco, ajoelhado junto ao cepo). */
  poseDormindo() { this.aplicarAnim(this.animDeDormir()); }

  /** ASSUMIR este inimigo no meio do caminho (o cérebro: `Inimigo.retomar`). */
  retomar(r) {
    this.soltarMarionete();
    super.retomar(r);
  }
}

/** Um CHEFE (a ficha `tipo` e o lugar dele em `CHEFES`, nascimentos.js): o Carrasco. */
export function criarChefe(game, tipo) {
  const c = CHEFES[tipo];
  return new Enemy(game, ENEMY_TYPES[tipo], new THREE.Vector3(c.x, 0, c.z), c.rumo);
}

/** Os inimigos e os bichos do mapa (js/inimigos/nascimentos.js), na ordem que dá o `netId` de cada um. */
export function spawnEnemies(game) {
  const list = [];
  const at = (r, c, dx, dz) => { const l = lugarDoNascimento(r, c, dx, dz); return new THREE.Vector3(l.x, 0, l.z); };
  for (const n of ESQUELETOS) list.push(new Enemy(game, ENEMY_TYPES[n.tipo], at(n.r, n.c, n.dx, n.dz), n.rumo ?? Math.PI, { dormant: !!n.dormindo }));
  // os ANIMAIS: só onde a célula é ar livre e o modelo existe (sem o .glb, o animal não nasce)
  for (const n of BICHOS) {
    if (!game.world?.isOpenAir?.(n.r, n.c) || !Animal.existe(n.tipo)) continue;
    list.push(new Animal(game, n.tipo, at(n.r, n.c, n.dx, n.dz), n.rumo ?? Math.random() * Math.PI * 2));
  }
  return list;
}
