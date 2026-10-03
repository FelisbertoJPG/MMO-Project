/**
 * **OS ANIMAIS SELVAGENS** (03/10/2026) — a floresta e a mata, no lugar dos esqueletos.
 *
 * Modelos do pacote Ultimate Animated Animals (Quaternius), em
 * `assets/animais/<modelo>.glb` (`Assets.animais`): cada um com o próprio
 * esqueleto e as mesmas animações (Idle, Eating, Walk, Gallop, Attack…, Death).
 *
 * Três TEMPERAMENTOS (o campo `temperamento` em `ANIMAIS`):
 *   • `pacifico` — pasta e passeia; foge galopando de quem chega perto ou o fere;
 *   • `neutro`   — ignora o jogador; ferido, fica com RAIVA por `raiva` segundos
 *                  e persegue quem o feriu (depois volta para casa);
 *   • `agressivo`— caça quem entra no raio `faro`, sem se afastar demais de casa.
 *
 * O animal NÃO é um `Enemy` (não tem o manequim UAL), mas segue o MESMO
 * contrato que o jogo e a rede esperam de um inimigo — `pos`, `radius`,
 * `height`, `hp`, `dead`, `active`, `lockable`, `takeDamage`, `update`, `reset`,
 * `retomar` (troca de simulador no MMO), `receberMarionete`/`updateMarionete`/
 * `soltarMarionete` (co-op e MMO), `model.current`/`currentName` (o retrato do
 * `MUNDO`) e `cfg.souls`/`cfg.drops`. Por isso eles moram em `game.enemies`, com
 * `netId` como os outros: renascer por tempo, almas, o que cai e a mira travada
 * vêm de graça. Animal novo = uma linha em `ANIMAIS` (e o modelo em ANIMAIS_MODELOS).
 *
 * Eles só andam em chão de AR LIVRE do térreo (`isOpenAir` e `nivel` 0): passo
 * que termina na masmorra, na escada ou no terraço é desfeito.
 */
import * as THREE from 'three';
import { Assets } from './assets.js';
import { clone as cloneSkinned } from '../vendor/jsm/utils/SkeletonUtils.js';
import { flatDist, yawTo, turnTowards, angleToTarget } from './combat.js';
import { Interpolador, giroCurto, loopa } from './remoto.js';

const _v = new THREE.Vector3();

/** `escala` deixa o bicho do tamanho certo ao lado do jogador (1,85 m). */
export const ANIMAIS = {
  cervo: {
    nome: 'Cervo', modelo: 'cervo', escala: 0.36, temperamento: 'pacifico',
    hp: 60, almas: 40, quedas: [['carneCrua', 0.8]], andar: 1.3, correr: 7.5, raio: 0.5, altura: 1.5, medo: 10,
  },
  raposa: {
    nome: 'Raposa', modelo: 'raposa', escala: 0.2, temperamento: 'pacifico',
    hp: 30, almas: 20, quedas: [['carneCrua', 0.35], ['erva', 0.2]], andar: 1.2, correr: 6.8, raio: 0.3, altura: 0.6, medo: 8,
  },
  cavalo: {
    nome: 'Cavalo Selvagem', modelo: 'cavalo', escala: 0.42, temperamento: 'pacifico',
    hp: 140, almas: 70, quedas: [['carneCrua', 0.6]], andar: 1.6, correr: 9, raio: 0.7, altura: 2.0, medo: 11,
  },
  cervoReal: {
    nome: 'Cervo Real', modelo: 'cervoReal', escala: 0.45, temperamento: 'neutro',
    hp: 150, almas: 120, quedas: [['carneCrua', 1]], andar: 1.3, correr: 7, raio: 0.6, altura: 1.9, raiva: 20,
    ataques: [
      { clipe: 'Attack_Headbutt', dano: 30, poise: 55, alcance: 2.1, janela: [0.35, 0.6] },
      { clipe: 'Attack_Kick', dano: 24, poise: 40, alcance: 1.9, janela: [0.3, 0.55], atras: true },
    ],
    espera: [1.0, 2.2],
  },
  touro: {
    nome: 'Touro Selvagem', modelo: 'touro', escala: 0.4, temperamento: 'neutro',
    hp: 240, almas: 180, quedas: [['carneCrua', 1]], andar: 1.2, correr: 7.8, raio: 0.85, altura: 1.8, raiva: 25,
    ataques: [
      { clipe: 'Attack_Headbutt', dano: 46, poise: 85, alcance: 2.4, janela: [0.35, 0.6] },
      { clipe: 'Attack_Kick', dano: 32, poise: 50, alcance: 2.1, janela: [0.3, 0.55], atras: true },
    ],
    espera: [1.2, 2.6],
  },
  lobo: {
    nome: 'Lobo', modelo: 'lobo', escala: 0.4, temperamento: 'agressivo',
    hp: 85, almas: 80, quedas: [['carneCrua', 0.5]], andar: 1.4, correr: 7.2, raio: 0.45, altura: 1.0, faro: 14,
    ataques: [{ clipe: 'Attack', dano: 20, poise: 25, alcance: 1.7, janela: [0.3, 0.55] }],
    espera: [0.7, 1.7],
  },
};

const LONGE_DE_CASA = 35;   // persegue no máximo isto longe de onde nasceu
const PASSEIO = 9;          // passeia até isto longe de casa

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

  /** O primeiro destes nomes que o modelo tem (os pacotes variam: `Attack` × `Attack_Headbutt`). */
  qual(...nomes) { return nomes.find((n) => this.clips.has(n)) ?? null; }
  duracao(nome) { return this.clips.get(nome)?.duration ?? 1; }

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
  update(dt) { this.mixer.update(dt); }
}

export class Animal {
  constructor(game, tipo, pos, facing = 0) {
    const c = ANIMAIS[tipo];
    this.game = game;
    this.tipo = tipo;
    this.animal = true;
    this.cfg = { ...c, souls: c.almas, drops: c.quedas };
    this.name = c.nome;
    this.model = new ModeloAnimal(c.modelo, c.escala);
    game.scene.add(this.model.root);
    this.pos = this.model.root.position;
    this.home = pos.clone();
    this.homeFacing = facing;
    this.radius = c.raio;
    this.height = c.altura;
    this.maxHp = c.hp;
    this.isBoss = false;
    this.reset();
  }

  /** Há um modelo para este tipo? (sem o .glb, o animal não nasce — `spawnEnemies`) */
  static existe(tipo) { return !!Assets.animais?.[ANIMAIS[tipo]?.modelo]; }

  get lockable() { return this.active && !this.dead; }
  get invulnerable() { return false; }
  get alvo() { return this._alvo ?? this.game.player; }
  setState(s, st = {}) { this.state = s; this.stateT = 0; this.st = st; }

  reset() {
    this.pos.copy(this.home);
    this.pos.y = this.game.world.alturaChao(this.pos);
    this.facing = this.homeFacing;
    this.hp = this.maxHp;
    this.dead = false;
    this.active = true;
    this.model.root.visible = true;
    this.model.flash(false);
    this.flashT = 0; this.lastHit = -99; this.recentDmg = 0;
    this.raiva = 0; this._alvo = null; this.espera = 0;
    this.repousar();
  }

  // ------------------------------------------------------------ dano

  takeDamage(amount, srcPos, poise = 20, opts = {}) {
    if (this.dead || !this.active) return false;
    const g = this.game;
    const dano = amount * (opts.fire ? 1.25 : 1);
    this.hp -= dano;
    this.recentDmg = g.time - this.lastHit < 2.5 ? this.recentDmg + Math.round(dano) : Math.round(dano);
    this.lastHit = g.time;
    this.flashT = 0.12;
    g.effects.blood(this.pos.clone().setY(this.pos.y + this.height * 0.6));
    if (this.hp <= 0) { this.die(); return 'hit'; }
    const quem = srcPos ? g.alvoPara(srcPos) : this.alvo;
    if (this.cfg.temperamento === 'pacifico') this.fugir(srcPos ?? quem.pos, 1.0 + Math.random());
    else {
      // neutro e agressivo: revida em quem bateu
      this._alvo = quem;
      if (this.cfg.temperamento === 'neutro') this.raiva = this.cfg.raiva;
      if (this.state !== 'ataque') {
        this.setState('ferido', { dur: 0.45 });
        this.model.play(this.model.qual('Idle_HitReact1', 'Idle'), { loop: false, fade: 0.08, restart: true });
      }
    }
    return 'hit';
  }

  ignite() { /* o fogo já entra no `takeDamage` (`opts.fire`) */ }

  die() {
    this.hp = 0;
    this.dead = true;
    this.setState('morto');
    this.model.play(this.model.qual('Death'), { loop: false, fade: 0.1 });
    this.game.onEnemyKilled(this);
  }

  // ------------------------------------------------------------ o quadro

  update(dt) {
    this.stateT += dt;
    if (this.game.marionetes) return this.updateMarionete(dt);
    if (!this.active) return;
    if (this.flashT > 0) { this.flashT -= dt; this.model.flash(this.flashT > 0); }
    if (this.dead) this.afundar();
    else {
      this.pensar(dt);
      this.pos.y = this.game.world.alturaChao(this.pos);
    }
    this.model.root.rotation.y = this.facing;
    this.model.update(dt);
  }

  /** Depois de cair, afunda na terra e some (como os esqueletos). */
  afundar() {
    if (this.stateT < 3) return;
    const k = (this.stateT - 3) / 1.2;
    this.pos.y = this.game.world.alturaChao(this.pos) - k * 0.8;
    if (k >= 1) { this.active = false; this.model.root.visible = false; }
  }

  /** Dá um passo, desviando; passo que sai do ar livre do térreo é desfeito. */
  andar(dir, vel, dt) {
    const w = this.game.world, antes = this.pos.clone();
    const d = w.avoid(this.pos, dir.clone(), this.radius);
    this.pos.addScaledVector(d, vel * dt);
    const [r, c] = w.cellOf(this.pos);
    if (!w.isOpenAir(r, c) || w.nivel(r, c) !== 0) { this.pos.x = antes.x; this.pos.z = antes.z; return false; }
    this.facing = turnTowards(this.facing, Math.atan2(d.x, d.z), dt * 6);
    return true;
  }

  /** O jogador vivo mais perto, e a que distância. */
  maisPerto() {
    const j = this.game.alvoPara(this.pos);
    return { j, d: j && !j.dead ? flatDist(j.pos, this.pos) : Infinity };
  }

  repousar() {
    this.setState('repouso', { dur: 3 + Math.random() * 5 });
    const m = this.model;
    m.play(Math.random() < 0.5 ? m.qual('Eating', 'Idle') : m.qual('Idle', 'Idle_2'), { fade: 0.4 });
  }

  passear() {
    const w = this.game.world;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * PASSEIO;
      const to = this.home.clone().add(_v.set(Math.cos(a) * r, 0, Math.sin(a) * r));
      const [cr, cc] = w.cellOf(to);
      if (w.isOpenAir(cr, cc) && w.nivel(cr, cc) === 0) {
        this.setState('passeio', { to, dur: 9 });
        this.model.play(this.model.qual('Walk'), { fade: 0.3 });
        return;
      }
    }
    this.repousar();
  }

  fugir(de, dur = 4) {
    this.setState('fuga', { de: de.clone(), dur: dur + 2.5 });
    this.model.play(this.model.qual('Gallop', 'Walk'), { fade: 0.15 });
  }

  pensar(dt) {
    const c = this.cfg, s = this.st;
    if (this.raiva > 0) this.raiva -= dt;
    this.espera -= dt;
    const { j: perto, d: dPerto } = this.maisPerto();

    // o que faz um animal largar o que está fazendo
    const tranquilo = ['repouso', 'passeio', 'volta'].includes(this.state);
    if (tranquilo) {
      if (c.temperamento === 'pacifico' && dPerto < c.medo) return this.fugir(perto.pos);
      if (c.temperamento === 'agressivo' && dPerto < c.faro && this.game.world.lineOfSight(this.pos, perto.pos)) {
        this._alvo = perto;
        return this.perseguir();
      }
      if (c.temperamento === 'neutro' && this.raiva > 0 && this._alvo && !this._alvo.dead) return this.perseguir();
    }

    switch (this.state) {
      case 'repouso':
        if (this.stateT > s.dur) { if (Math.random() < 0.6) this.passear(); else this.repousar(); }
        break;
      case 'passeio':
        if (flatDist(this.pos, s.to) < 0.6 || this.stateT > s.dur) return this.repousar();
        if (!this.andar(_v.set(s.to.x - this.pos.x, 0, s.to.z - this.pos.z).normalize(), c.andar, dt)) this.repousar();
        break;
      case 'volta':
        if (flatDist(this.pos, this.home) < 1.5) return this.repousar();
        this.andar(_v.set(this.home.x - this.pos.x, 0, this.home.z - this.pos.z).normalize(), c.andar * 1.6, dt);
        break;
      case 'fuga': {
        // corre para longe de quem assusta, e cansa
        const ameaca = perto && dPerto < c.medo * 1.5 ? perto.pos : s.de;
        const dir = _v.set(this.pos.x - ameaca.x, 0, this.pos.z - ameaca.z);
        if (dir.lengthSq() < 0.01) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        dir.normalize();
        // longe demais de casa: puxa de volta, senão foge para fora do mapa
        if (flatDist(this.pos, this.home) > LONGE_DE_CASA * 0.8) dir.lerp(_v.clone().set(this.home.x - this.pos.x, 0, this.home.z - this.pos.z).normalize(), 0.6).normalize();
        this.andar(dir, c.correr, dt);
        if (this.stateT > s.dur && dPerto > c.medo) this.repousar();
        break;
      }
      case 'caca': {
        const a = this.alvo;
        const desiste = !a || a.dead || flatDist(this.pos, this.home) > LONGE_DE_CASA
          || (c.temperamento === 'neutro' && this.raiva <= 0)
          || (c.temperamento === 'agressivo' && flatDist(a.pos, this.pos) > c.faro * 1.8);
        if (desiste) { this._alvo = null; this.raiva = 0; this.setState('volta'); this.model.play(this.model.qual('Walk'), { fade: 0.3 }); return; }
        const d = flatDist(a.pos, this.pos);
        const atq = this.escolherAtaque(d, a);
        if (atq && this.espera <= 0) return this.atacar(atq);
        if (d > this.radius + a.radius + 0.6) this.andar(_v.set(a.pos.x - this.pos.x, 0, a.pos.z - this.pos.z).normalize(), c.correr, dt);
        else {
          this.facing = turnTowards(this.facing, yawTo(this.pos, a.pos), dt * 6);
          if (this.model.currentName !== this.model.qual('Idle')) this.model.play(this.model.qual('Idle'), { fade: 0.2 });
        }
        break;
      }
      case 'ataque': this.atualizarAtaque(dt); break;
      case 'ferido':
        if (this.stateT > s.dur) this.perseguir();
        break;
    }
  }

  perseguir() {
    if (!this.cfg.ataques) return this.fugir(this.alvo.pos);
    this.setState('caca');
    this.model.play(this.model.qual('Gallop', 'Walk'), { fade: 0.15 });
  }

  escolherAtaque(d, a) {
    const opcoes = (this.cfg.ataques ?? []).filter((x) => this.model.clips.has(x.clipe) && d <= x.alcance + a.radius);
    if (!opcoes.length) return null;
    // o coice é para quem está ATRÁS; a cabeçada, para quem está na frente
    const atras = angleToTarget(this.pos, this.facing, a.pos) > 2.0;
    return opcoes.find((x) => !!x.atras === atras) ?? (atras ? null : opcoes[0]);
  }

  atacar(atq) {
    const dur = this.model.duracao(atq.clipe);
    this.setState('ataque', { atq, dur, acertou: false });
    this.model.play(atq.clipe, { loop: false, fade: 0.1, restart: true });
  }

  atualizarAtaque(dt) {
    const s = this.st, a = this.alvo, k = this.stateT / s.dur, g = this.game;
    if (k < s.atq.janela[0] && !s.atq.atras && a) this.facing = turnTowards(this.facing, yawTo(this.pos, a.pos), dt * 5);
    if (!s.acertou && a && !a.dead && k >= s.atq.janela[0] && k <= s.atq.janela[1]) {
      const d = flatDist(a.pos, this.pos);
      const ang = angleToTarget(this.pos, this.facing, a.pos);
      const mira = s.atq.atras ? ang > Math.PI - 1.2 : ang < 1.1;
      if (d <= s.atq.alcance + a.radius && mira) {
        const res = a.takeDamage(s.atq.dano, this.pos, { poise: s.atq.poise });
        if (res !== 'iframe') s.acertou = true;
      }
    }
    if (k >= 1) {
      const [e0, e1] = this.cfg.espera ?? [1, 2];
      this.espera = e0 + Math.random() * (e1 - e0);
      this.perseguir();
    }
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
      this.model.root.visible = e.visivel;
      if (e.morto && !this.dead) { this.dead = true; this.setState('morto'); this.model.play(this.model.qual('Death'), { loop: false, fade: 0.1 }); }
      else if (!e.morto && this.dead) { this.dead = false; this.setState(e.st); }
      if (!this.dead) {
        if (this.state !== e.st) this.setState(e.st);
        if (e.a && e.a !== this.model.currentName) this.model.play(e.a, { loop: loopa(e.a) || /Walk|Gallop|Eating/.test(e.a), speed: e.s || 1, fade: 0.15 });
      }
    }
    if (this.flashT > 0) { this.flashT -= dt; this.model.flash(this.flashT > 0); }
    if (this.dead) this.afundar();
    this.model.root.rotation.y = this.facing;
    this.model.update(dt);
  }

  /** MMO: passei a simular. Com o retrato de quem simulava, segue de onde estava. */
  retomar(r) {
    this.soltarMarionete();
    this.reset();
    if (!r || r.morto || !r.ativo) return;
    this.pos.set(r.x, r.y, r.z);
    this.facing = r.g;
    this.hp = Math.min(this.maxHp, Math.max(1, r.hp));
  }
}
