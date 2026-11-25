/**
 * **OS ANIMAIS SELVAGENS NO NAVEGADOR** (03/10/2026; 24/11/2026: o cérebro saiu para
 * js/inimigos/quadrupede.js e as fichas para js/inimigos/tipos.js). O `Animal` é o cérebro
 * quadrúpede com um CORPO: o modelo do pacote Ultimate Animated Animals (Quaternius), em
 * `assets/animais/<modelo>.glb` (`Assets.animais`), cada um com o próprio esqueleto e as mesmas
 * animações (Idle, Eating, Walk, Gallop, Attack…, Death). O corpo não decide nada: toca o que o
 * cérebro pede (evento 'anim'), sangra ('sangrou'), pisca e repete o retrato da rede (a marionete).
 *
 * Segue o MESMO contrato que o jogo e a rede esperam de um inimigo (`pos`, `hp`, `takeDamage`,
 * `update`, `retomar`, `receberMarionete`…, `model.current`/`currentName` para o retrato do
 * `MUNDO`), então mora em `game.enemies`, com `netId`: renascer por tempo, almas, o que cai e a mira
 * travada vêm de graça. Bicho novo = uma ficha em tipos.js (e o modelo em ANIMAIS_MODELOS).
 */
import * as THREE from 'three';
import { Assets } from './assets.js';
import { clone as cloneSkinned } from '../vendor/jsm/utils/SkeletonUtils.js';
import { Interpolador, giroCurto, loopa } from './remoto.js';
import { Quadrupede } from './inimigos/quadrupede.js';

/** O boneco do animal: o modelo clonado (com o esqueleto) e as animações por nome. */
class ModeloAnimal {
  constructor(modelo, escala) {
    const fonte = Assets.animais[modelo];
    this.scene = cloneSkinned(fonte.scene);
    this.root = new THREE.Group();
    this.root.add(this.scene);
    this.scene.scale.setScalar(escala);
    this.mats = [];
    const clones = new Map();
    this.scene.traverse((c) => {
      if (!c.isMesh) return;
      // materiais próprios: o piscar ao apanhar não pisca todos os cervos juntos
      if (!clones.has(c.material)) { const m = c.material.clone(); clones.set(c.material, m); this.mats.push(m); }
      c.material = clones.get(c.material);
      c.castShadow = true; c.receiveShadow = true;
      c.frustumCulled = false;
    });
    this.brilho = this.mats.map((m) => m.emissive?.clone());
    this.clips = new Map(fonte.clips.map((a) => [a.name, a]));
    this.mixer = new THREE.AnimationMixer(this.scene);
    this.acoes = {};
    this.current = null; this.currentName = null;
  }

  play(nome, { fade = 0.2, loop = true, speed = 1, restart = false } = {}) {
    const clip = this.clips.get(nome);
    if (!clip) return null;
    const a = (this.acoes[nome] ??= this.mixer.clipAction(clip));
    if (this.current === a && !restart) { a.timeScale = speed; return a; }
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = speed;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a && fade > 0) a.crossFadeFrom(this.current, fade, false);
    else if (this.current && this.current !== a) this.current.stop();
    a.play();
    this.current = a; this.currentName = nome;
    return a;
  }

  flash(on) { this.mats.forEach((m, i) => { if (m.emissive) { if (on) m.emissive.setRGB(0.35, 0.12, 0.1); else m.emissive.copy(this.brilho[i]); } }); }
  update(dt) {
    // escondido pelo LOD (`oculto`, lod.js): ninguém vê os ossos, e a lógica do bicho não lê o
    // relógio do clipe (os tempos dele são o `stateT`) — então a animação NÃO RODA (15/10/2026;
    // antes, a cada 4 quadros: ~27 bichos escondidos do acampamento). O tempo fica guardado e
    // vai inteiro no primeiro quadro em que ele volta à vista. (O manequim dos inimigos segue a
    // cada 4 quadros: as janelas de golpe deles são o tempo do clipe.)
    if (this.oculto) { this._pendente = (this._pendente ?? 0) + dt; return; }
    if (this._pendente) { dt += this._pendente; this._pendente = 0; }
    this.mixer.update(dt);
  }
}

export class Animal extends Quadrupede {
  constructor(game, cfg, pos, facing = 0) {
    super(game, cfg, pos, facing);   // o cérebro (o `Game` é o mundo dele)
    this.game = game;
    this.tipo = cfg.modelo;
    this.animal = true;
    this.model = new ModeloAnimal(cfg.modelo, cfg.escala);
    game.scene.add(this.model.root);
    this.ouvir((tipo, d) => this.aoEvento(tipo, d));
    // o que o cérebro já pediu ao nascer (antes de o corpo existir): a animação e o lugar
    if (this.animPedida) this.model.play(this.animPedida.nome, this.animPedida.opcoes);
    this.model.root.position.copy(this.pos);
    this.model.root.rotation.y = this.facing;
  }

  /** Há um modelo para esta ficha? (sem o .glb, o animal não nasce — `spawnEnemies`) */
  static existe(cfg) { return !!Assets.animais?.[cfg?.modelo]; }

  aoEvento(tipo, d) {
    switch (tipo) {
      case 'anim': this.model.play(d.nome, d.opcoes); return;
      case 'renasceu': this.model.flash(false); this._piscando = false; return;
      case 'sangrou': this.game.effects.blood(d.pos); return;
    }
  }

  update(dt) {
    if (this.game.marionetes) {
      this.stateT += dt;
      this.updateMarionete(dt);
    } else super.update(dt);
    this.vestirCorpo(dt);
  }

  /** O corpo segue o cérebro: o lugar, o rumo, se aparece, o piscar, a animação. */
  vestirCorpo(dt) {
    const raiz = this.model.root;
    raiz.position.copy(this.pos);
    raiz.visible = this.visivel;
    if (!this.game.marionetes && !this.active) return;   // (fora de cena: nem anima)
    const pisca = this.flashT > 0;
    if (pisca !== this._piscando) { this._piscando = pisca; this.model.flash(pisca); }
    raiz.rotation.y = this.facing;
    this.model.update(dt);
  }

  // ---------- Marionete (co-op e MMO: quem manda neste animal é outra máquina) ----------
  receberMarionete(e, quando) { (this.fio ??= new Interpolador()).receber(e, quando); }
  soltarMarionete() { this.fio = null; }

  updateMarionete(dt) {
    const am = this.fio?.amostra();
    if (am) {
      const { a, b, k } = am, e = k < 0.5 ? a : b;
      this.pos.set(THREE.MathUtils.lerp(a.x, b.x, k), THREE.MathUtils.lerp(a.y, b.y, k), THREE.MathUtils.lerp(a.z, b.z, k));
      this.facing = a.g + giroCurto(b.g - a.g) * k;
      if (e.hp < this.hp - 0.5) { this.lastHit = this.game.time; this.flashT = 0.12; }
      this.hp = e.hp;
      this.active = e.ativo;
      this.visivel = e.visivel;
      if (e.morto && !this.dead) { this.dead = true; this.setState('morto'); this.model.play(this.qual('Death'), { loop: false, fade: 0.1 }); }
      else if (!e.morto && this.dead) { this.dead = false; this.setState(e.st); }
      if (!this.dead) {
        if (this.state !== e.st) this.setState(e.st);
        if (e.a && e.a !== this.model.currentName) this.model.play(e.a, { loop: loopa(e.a) || /Walk|Gallop|Eating/.test(e.a), speed: e.s || 1, fade: 0.15 });
      }
    }
    if (this.flashT > 0) this.flashT -= dt;
    if (this.dead) this.updateDeath(dt);
  }

  /** MMO: passei a simular. Com o retrato de quem simulava, segue de onde estava (o cérebro: `retomar`). */
  retomar(r) {
    this.soltarMarionete();
    super.retomar(r);
  }
}
