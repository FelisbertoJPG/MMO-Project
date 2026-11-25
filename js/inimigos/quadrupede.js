/**
 * O COMPORTAMENTO QUADRÚPEDE (24/11/2026; os bichos de 03/10/2026): cervos, raposas, cavalos, o
 * cervo real, o touro e os lobos. A base (vida, estado, alvo, morte, troca de simulador) é a do
 * cerebro.js; aqui, o jeito de bicho, pelo TEMPERAMENTO da ficha (`temperamento`):
 *   • `pacifico` — pasta e passeia; foge galopando de quem chega perto (`medo`) ou o fere;
 *   • `neutro`   — ignora o jogador; ferido, fica com RAIVA por `raiva` segundos e persegue quem o
 *                  feriu (depois volta para casa);
 *   • `agressivo`— caça quem entra no raio `faro`, sem se afastar demais de casa.
 * Os golpes (`ataques`: { clipe, dano, poise, alcance, janela [frações do clipe], atras }) duram o
 * que dura o clipe: as animações e as durações de cada modelo vêm de `mundo.clipesDe(modelo)`
 * (assets/clipes-dos-bichos.json, medido nos .glb: o mesmo no jogo e no servidor).
 *
 * Só anda em chão de AR LIVRE do térreo (`isOpenAir` e `nivel` 0): passo que termina na masmorra,
 * na escada ou no terraço é desfeito. Não sangra nem pega fogo depois do golpe (o fogo já entra no
 * dano: × 1,25).
 *
 * Os EVENTOS deste comportamento (o corpo, animais.js, desenha): 'sangrou' { pos }.
 */
import * as THREE from 'three';
import { angleToTarget, yawTo, turnTowards, flatDist } from '../geometria.js';
import { Inimigo } from './cerebro.js';

const _v = new THREE.Vector3();
const LONGE_DE_CASA = 35;   // persegue no máximo isto longe de onde nasceu
const PASSEIO = 9;          // passeia até isto longe de casa

export class Quadrupede extends Inimigo {
  /** As animações deste modelo: { nome: duração }. */
  get clipes() { return (this._clipes ??= this.mundo.clipesDe?.(this.cfg.modelo) ?? {}); }
  /** O primeiro destes nomes que o modelo tem (os pacotes variam: `Attack` × `Attack_Headbutt`). */
  qual(...nomes) { return nomes.find((n) => n in this.clipes) ?? null; }
  duracao(nome) { return this.clipes[nome] ?? 1; }

  get lockable() { return this.active && !this.dead && super.lockable; }
  get deathAnim() { return this.qual('Death'); }
  get estadoDeMorto() { return 'morto'; }

  renascer() {
    this.pos.y = this.mundo.world.alturaChao(this.pos);
    this.raiva = 0; this._alvo = null; this.espera = 0;
    return {};
  }
  posturaInicial() { this.repousar(); }

  // ------------------------------------------------------------ dano

  receberGolpe(amount, srcPos, poise = 20, opts = {}) {
    if (this.dead || !this.active) return false;
    const m = this.mundo;
    const dano = amount * (opts.fire ? 1.25 : 1);
    this.hp -= dano;
    this.recentDmg = m.time - this.lastHit < 2.5 ? this.recentDmg + Math.round(dano) : Math.round(dano);
    this.lastHit = m.time;
    this.flashT = 0.12;
    this.emitir('sangrou', { pos: this.pos.clone().setY(this.pos.y + this.height * 0.6) });
    if (this.hp <= 0) { this.die(); return 'hit'; }
    const quem = srcPos ? m.alvoPara(srcPos) : this.alvo;
    if (this.cfg.temperamento === 'pacifico') this.fugir(srcPos ?? quem.pos, 1.0 + Math.random());
    else {
      // neutro e agressivo: revida em quem bateu
      this._alvo = quem;
      if (this.cfg.temperamento === 'neutro') this.raiva = this.cfg.raiva;
      if (this.state !== 'ataque') {
        this.setState('ferido', { dur: 0.45 });
        this.tocar(this.qual('Idle_HitReact1', 'Idle'), { loop: false, fade: 0.08, restart: true });
      }
    }
    return 'hit';
  }

  ignite() { /* o fogo já entra no golpe (`opts.fire`) */ }
  sangrar() { /* bicho não sangra depois do golpe */ }

  // ------------------------------------------------------------ andar

  /** Dá um passo, desviando; passo que sai do ar livre do térreo é desfeito. */
  andar(dir, vel, dt) {
    const w = this.mundo.world, antes = this.pos.clone();
    const d = w.avoid(this.pos, dir.clone(), this.radius);
    this.pos.addScaledVector(d, vel * dt);
    const [r, c] = w.cellOf(this.pos);
    if (!w.isOpenAir(r, c) || w.nivel(r, c) !== 0) { this.pos.x = antes.x; this.pos.z = antes.z; return false; }
    this.facing = turnTowards(this.facing, Math.atan2(d.x, d.z), dt * 6);
    return true;
  }

  /** O jogador vivo mais perto, e a que distância. */
  maisPerto() {
    const j = this.mundo.alvoPara(this.pos);
    return { j, d: j && !j.dead ? flatDist(j.pos, this.pos) : Infinity };
  }

  repousar() {
    this.setState('repouso', { dur: 3 + Math.random() * 5 });
    this.tocar(Math.random() < 0.5 ? this.qual('Eating', 'Idle') : this.qual('Idle', 'Idle_2'), { fade: 0.4 });
  }

  passear() {
    const w = this.mundo.world;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * PASSEIO;
      const to = this.home.clone().add(_v.set(Math.cos(a) * r, 0, Math.sin(a) * r));
      const [cr, cc] = w.cellOf(to);
      if (w.isOpenAir(cr, cc) && w.nivel(cr, cc) === 0) {
        this.setState('passeio', { to, dur: 9 });
        this.tocar(this.qual('Walk'), { fade: 0.3 });
        return;
      }
    }
    this.repousar();
  }

  fugir(de, dur = 4) {
    this.setState('fuga', { de: de.clone(), dur: dur + 2.5 });
    this.tocar(this.qual('Gallop', 'Walk'), { fade: 0.15 });
  }

  // ------------------------------------------------------------ a IA

  decidir(dt) {
    const c = this.cfg, s = this.st;
    if (this.raiva > 0) this.raiva -= dt;
    this.espera -= dt;
    const { j: perto, d: dPerto } = this.maisPerto();

    // o que faz um animal largar o que está fazendo
    const tranquilo = ['repouso', 'passeio', 'volta'].includes(this.state);
    if (tranquilo) {
      if (c.temperamento === 'pacifico' && dPerto < c.medo) return this.fugir(perto.pos);
      if (c.temperamento === 'agressivo' && dPerto < c.faro && this.mundo.world.lineOfSight(this.pos, perto.pos)) {
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
        if (desiste) { this._alvo = null; this.raiva = 0; this.setState('volta'); this.tocar(this.qual('Walk'), { fade: 0.3 }); return; }
        const d = flatDist(a.pos, this.pos);
        const atq = this.escolherAtaque(d, a);
        if (atq && this.espera <= 0) return this.atacar(atq);
        if (d > this.radius + a.radius + 0.6) this.andar(_v.set(a.pos.x - this.pos.x, 0, a.pos.z - this.pos.z).normalize(), c.correr, dt);
        else {
          this.facing = turnTowards(this.facing, yawTo(this.pos, a.pos), dt * 6);
          if (this.animPedida?.nome !== this.qual('Idle')) this.tocar(this.qual('Idle'), { fade: 0.2 });
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
    this.tocar(this.qual('Gallop', 'Walk'), { fade: 0.15 });
  }

  escolherAtaque(d, a) {
    const opcoes = (this.cfg.ataques ?? []).filter((x) => x.clipe in this.clipes && d <= x.alcance + a.radius);
    if (!opcoes.length) return null;
    // o coice é para quem está ATRÁS; a cabeçada, para quem está na frente
    const atras = angleToTarget(this.pos, this.facing, a.pos) > 2.0;
    return opcoes.find((x) => !!x.atras === atras) ?? (atras ? null : opcoes[0]);
  }

  atacar(atq) {
    const dur = this.duracao(atq.clipe);
    this.setState('ataque', { atq, dur, acertou: false });
    this.tocar(atq.clipe, { loop: false, fade: 0.1, restart: true });
  }

  atualizarAtaque(dt) {
    const s = this.st, a = this.alvo, k = this.stateT / s.dur;
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
}
