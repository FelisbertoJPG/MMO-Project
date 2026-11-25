/**
 * O CÉREBRO DAS CRIATURAS (24/11/2026, a etapa 3.2 do caminho 2): tudo o que um inimigo ou bicho
 * DECIDE e SOFRE, sem nada de desenho. Roda igual no navegador e no servidor do Mundo online (Node,
 * com o three do npm), e é o que tira do jogador simulador o poder de mandar nos inimigos.
 *
 * Em CAMADAS:
 *   • a BASE (este arquivo, `Inimigo`): o que toda criatura tem — o lugar, a vida, o estado, o fogo
 *     e o sangramento, a morte, o alvo, a conversa com o corpo, os traços e a troca de simulador;
 *   • o COMPORTAMENTO (a ficha: `comportamento`): como ela anda e decide. `humanoide` (humanoide.js:
 *     os esqueletos e o Carrasco), `quadrupede` (quadrupede.js: os bichos) e `dragao` (dragao.js: o Wyrm).
 *     `criarCerebro` (criar.js) escolhe pela ficha;
 *   • os TRAÇOS (tracos.js): o que vai além do comum (chefe, arena, fases, invocar…), ligados pela ficha;
 *   • a FICHA (tipos.js): os números, os golpes, o comportamento e os traços.
 *
 * O cérebro NÃO conhece o corpo. Fala com ele de duas formas:
 *   • pelo ESTADO, que o corpo lê a cada quadro: `pos`, `facing`, `visivel`, `flashT` (piscar),
 *     `burnT`/`bleedT`, `dead`, `active`, `phase`…;
 *   • por EVENTOS (`ouvir(fn)` → `fn(tipo, dados, criatura)`), na hora em que acontecem:
 *       'anim'         { nome, opcoes } ou { nome, pose }: a animação que ele quer (`tocar`/`posar`)
 *       'renasceu'     de pé de novo (o humanoide diz `escudoDeVolta`)
 *       'morreu'       e os de cada comportamento e traço (ver humanoide.js, quadrupede.js, tracos.js)
 *   No navegador, o corpo (enemies.js: `Enemy`; animais.js: `Animal`) desenha, toca e treme a câmera;
 *   no servidor, os eventos são descartados (ou, mais adiante, repassados aos jogadores).
 *
 * O MUNDO que o cérebro enxerga (`mundo`; no navegador é o próprio `Game`) é pequeno:
 *   `time` (s), `world` (o mapa lógico: resolve, lineOfSight, nextWaypoint, alturaChao, avoid…),
 *   `alvoPara(pos, atual, pode)` (o jogador a perseguir), `player` (o alvo sem ninguém por perto),
 *   `projectiles.orb/shock` (os projéteis, que são regra), `onEnemyKilled(e)`, `marionetes`,
 *   `invocar(cfg, pos, rumo, opts)`/`dispensar(e)` (o traço `invocar`) e `clipesDe(modelo)` (as
 *   animações de um bicho: assets/clipes-dos-bichos.json).
 *   O alvo é qualquer `{ pos, radius, dead, state, inArena, takeDamage(dano, de, { poise, unblockable }) }`.
 *
 * A IA nunca lê `game.player` direto: lê `this.alvo` (o co-op e o Mundo online têm vários).
 */
import * as THREE from 'three';
import { TRACOS } from './tracos.js';

export class Inimigo {
  constructor(mundo, cfg, spawnPos, facing = 0, { dormant = false } = {}) {
    this.mundo = mundo;
    this.cfg = this.cfgBase = cfg;
    this.name = cfg.name;
    this.isBoss = false;
    this.pos = new THREE.Vector3();
    this.home = spawnPos.clone();
    this.homeFacing = facing;
    this.radius = cfg.radius;
    this.height = cfg.height;
    this.maxHp = cfg.hp;
    this.startsDormant = dormant;
    this.ouvintes = [];
    this.antesDoPasso = new THREE.Vector3();   // onde estava antes da IA deste quadro (o traço `territorio` desfaz o passo)
    // os TRAÇOS que a ficha liga (tracos.js), na ordem da tabela
    this.tracos = Object.keys(TRACOS).filter((nome) => cfg[nome]).map((nome) => ({ nome, def: TRACOS[nome] }));
    this.traco('iniciar');
    this.reset();
    this.traco('nascer');
  }

  /** Chama o gancho `gancho` dos traços: devolve o que o primeiro respondeu (undefined: nenhum decidiu). */
  traco(gancho, ...args) {
    for (const { nome, def } of this.tracos) {
      const f = def[gancho];
      if (!f) continue;
      const v = f(this, this.cfg[nome], ...args);
      if (v !== undefined) return v;
    }
    return undefined;
  }

  /** O CHEFE dorme (de vida cheia, à espera de quem entra) / acorda (traço `chefe`; sem ele, nada). */
  sleep() { this.traco('dormir'); }
  wake() { this.traco('acordar'); }
  /** Alguém entrou onde ele dorme? (traço `territorio`: o jogo pergunta a cada quadro e então chama `wake`) */
  podeAcordar() { return this.traco('podeAcordar') ?? false; }

  /** Passa para a fase `n` (traço `fases`): a velocidade, o giro e a pausa dela. */
  entrarNaFase(n) {
    const f = this.cfg.fases?.[n - 2];
    if (!f) return;
    this.phase = n;
    if (f.velocidade) this.speedMul = f.velocidade;
    this.cfg = { ...this.cfg, turnRate: f.giro ?? this.cfg.turnRate, cooldown: f.pausa ?? this.cfg.cooldown };
    this.emitir('fase', { n });
  }

  /** Como ele DORME: a animação da ficha (`animDormindo`, o Carrasco ajoelhado), ou deitado no chão. */
  animDeDormir() { return this.cfg.animDormindo ? { nome: this.cfg.animDormindo, opcoes: { fade: 0 } } : { nome: 'LayToIdle', pose: 0 }; }
  posarDormindo() { this.animPedida = this.animDeDormir(); this.emitir('anim', this.animPedida); }

  // ---------- A conversa com o corpo ----------
  /** Quem quer saber o que acontece com esta criatura (o corpo, no navegador). */
  ouvir(fn) { this.ouvintes.push(fn); }
  emitir(tipo, dados = {}) { for (const fn of this.ouvintes) fn(tipo, dados, this); }
  /** A animação que ele quer agora (`opcoes` como as do `play` do corpo). */
  tocar(nome, opcoes = {}) { this.animPedida = { nome, opcoes }; this.emitir('anim', this.animPedida); }
  /** Uma pose parada (o quadro `t` da animação `nome`): quem dorme deitado. */
  posar(nome, t = 0) { this.animPedida = { nome, pose: t }; this.emitir('anim', this.animPedida); }

  /** De pé de novo, em casa: o comum aqui; o do comportamento em `renascer` e `posturaInicial`. */
  reset() {
    this.pos.copy(this.home);
    this.facing = this.homeFacing;
    this.hp = this.maxHp;
    this.dead = false;
    this.active = true;
    this.visivel = true;
    this.flashT = 0; this.burnT = 0; this.bleedT = 0; this.bleedDps = 0;
    this.recentDmg = 0; this.lastHit = -99;
    const info = this.renascer();
    this.emitir('renasceu', info ?? {});
    this.posturaInicial();
    this.traco('aoReset');
  }

  /** (o comportamento) o que mais volta ao renascer; devolve o que o corpo precisa saber. */
  renascer() { return {}; }
  /** (o comportamento) o estado e a animação de quem acabou de renascer. */
  posturaInicial() { this.setState('idle'); }

  get idleAnim() { return this.cfg.idleAnim ?? 'Sword_Idle'; }
  get lockable() { return this.traco('travavel') !== false; }
  get invulnerable() { return this.traco('invulneravel') === true; }
  get inArenaZone() { return this.traco('naArena') ?? false; }
  get deathAnim() { return this.cfg.deathAnim ?? 'Death01'; }
  /** O nome do estado de quem caiu (o bicho é 'morto': é o que vai no retrato da rede). */
  get estadoDeMorto() { return 'dead'; }

  setState(s, data = {}) { this.state = s; this.stateT = 0; this.st = data; }

  // ---------- Dano ----------
  /** Um golpe: 'hit', 'blocked' ou false (não pegou). Os traços sabem do que pegou (`aoSofrer`: as fases). */
  takeDamage(amount, srcPos, poiseDmg = 20, opts = {}) {
    const res = this.receberGolpe(amount, srcPos, poiseDmg, opts);
    if (res) this.traco('aoSofrer', res);
    return res;
  }

  /** (o comportamento) o golpe de verdade: defesa, esquiva, dano, revide. */
  receberGolpe() { return false; }

  applyDamage(amount) {
    amount = Math.round(amount);
    this.hp -= amount;
    if (this.mundo.time - this.lastHit > 2.5) this.recentDmg = 0;
    this.recentDmg += amount;
    this.lastHit = this.mundo.time;
  }

  /** PEGA FOGO por `sec` segundos (a ficha: `queima: false` = não pega; o fogo do golpe é `fireWeak`). */
  ignite(sec) { if (this.cfg.queima !== false) this.burnT = Math.max(this.burnT, sec); }
  /** SANGRA (a Emboscada no nível 3, caminhos.js): `porSeg` de dano por `sec` segundos (a ficha: `sangra: false` = não sangra). */
  sangrar(sec, porSeg) { if (this.cfg.sangra === false) return; this.bleedT = Math.max(this.bleedT ?? 0, sec); this.bleedDps = porSeg; }

  die() {
    this.traco('antesDeMorrer');
    this.hp = 0;
    this.dead = true;
    this.burnT = 0; this.bleedT = 0;
    this.setState(this.estadoDeMorto);
    this.tocar(this.deathAnim, { loop: false, fade: 0.1 });
    this.emitir('morreu');
    this.mundo.onEnemyKilled(this);
  }

  // ---------- O alvo ----------
  /**
   * Quem esta criatura persegue: o jogador vivo mais perto (`mundo.alvoPara`), relido a cada meio
   * segundo por `escolherAlvo`. TODO código de IA lê `this.alvo`, nunca o jogador local.
   */
  get alvo() { return this._alvo ?? this.mundo.player; }
  escolherAlvo(dt) {
    this.alvoT = (this.alvoT ?? 0) - dt;
    if (this.alvoT > 0 && this._alvo && !this._alvo.dead) return;
    this.alvoT = 0.5;
    this._alvo = this.mundo.alvoPara(this.pos, this._alvo, (j) => this.podeMirar(j));
  }

  /** Quem pode ser alvo: os comuns não entram na arena do chefe (traço `arena`: só quem está nela). */
  podeMirar(j) { return this.traco('podeMirar', j) ?? !j.inArena; }

  canEngage() {
    const v = this.traco('podeLutar');
    if (v !== undefined) return v;
    const p = this.alvo;
    return !p.dead && !p.inArena && !['rest', 'restUp', 'lying', 'standing', 'fog'].includes(p.state);
  }

  // ---------- O quadro ----------
  update(dt) {
    this.viver(dt);
    this.traco('depois', dt);   // (o fim do quadro dos traços: os lacaios que já saíram de cena)
  }

  viver(dt) {
    this.stateT += dt;
    if (!this.active) return;
    this.preparar(dt);
    if (this.flashT > 0) this.flashT -= dt;
    if (this.burnT > 0 && !this.dead) {
      this.burnT -= dt;
      this.hp -= 6 * dt;
      if (this.hp <= 0) this.die();
    }
    if (this.bleedT > 0 && !this.dead) {
      this.bleedT -= dt;
      this.hp -= this.bleedDps * dt;
      if (this.hp <= 0) this.die();
    }
    this.recuperar(dt);
    if (this.dead) this.updateDeath(dt);
    else {
      this.antesDoPasso.copy(this.pos);
      this.updateAI(dt);
      this.pisar();
    }
  }

  /** (o comportamento) antes de tudo no quadro: o humanoide relê o alvo. */
  preparar() {}
  /** (o comportamento) o que volta sozinho com o tempo: a postura do escudo. */
  recuperar() {}
  /** (o comportamento) pisar no chão de onde está (e a colisão). */
  pisar() { this.pos.y = this.mundo.world.alturaChao(this.pos); }

  updateAI(dt) {
    if (this.traco('pensar', dt)) return;   // (um traço cuidou deste estado: o chefe dormindo, a fase, o perseguir direto)
    this.decidir(dt);
  }

  /** (o comportamento) a IA: o que fazer agora. */
  decidir() {}

  /** Caído: afunda no chão e, no fim, sai de cena (`active` falso, invisível). O traço `morte` muda o jeito. */
  updateDeath(dt) {
    if (this.traco('morrendo', dt)) return;
    if (this.stateT > 3) {
      const k = (this.stateT - 3) / 1.2;
      this.pos.y = this.mundo.world.alturaChao(this.pos) - k * 0.8;
      if (k >= 1) { this.active = false; this.visivel = false; }
    }
  }

  /**
   * ASSUMIR esta criatura no meio do caminho — o mundo online trocou de simulador e ela deixa de ser
   * marionete aqui. `r` é o último retrato dela (`protocolo.lerRetrato`), ou nada (mundo recém-aberto):
   * volta para casa inteira, e com o retrato segue de onde estava.
   */
  retomar(r) {
    if (this.traco('retomar', r)) return;   // (o chefe tem o seu jeito: traço `chefe`)
    this.reset();
    if (!r || r.morto || !r.ativo) return;
    this.pos.set(r.x, r.y, r.z);
    this.facing = r.g;
    this.hp = Math.min(this.maxHp, Math.max(1, r.hp));
    this.aoRetomar(r);
  }

  /** (o comportamento) o estado de quem foi assumido do retrato. */
  aoRetomar() {}
}
