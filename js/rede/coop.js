/**
 * **O CO-OP** (etapa 3, 02/10/2026) — ajudar alguém no mundo DELE.
 *
 * Quem chama é o DONO do mundo (`dono = true`); quem aceita entra nele. É o
 * desenho do Dark Souls, e ele decide tudo o mais:
 *
 *   • **No dono, o mundo é de verdade.** A IA, o dano, as almas e o save são
 *     dele. O convidado entra em `game.jogadores` (os inimigos o perseguem e os
 *     projéteis o acertam), e o dano que ele leva vira `TIPO.DANO`.
 *   • **No convidado, os inimigos são MARIONETES** (`game.marionetes`): o dono
 *     manda o `TIPO.MUNDO` dez vezes por segundo (o retrato de cada inimigo, as
 *     portas, a névoa, a barra do chefe) e aqui só se repete, interpolado. O
 *     golpe do convidado vira `TIPO.GOLPE` e quem o aplica é o dono; a vida
 *     nova volta no próximo `MUNDO`. Cada morte rende ao convidado as almas do
 *     inimigo (`EVENTO almas`).
 *   • **O mundo do convidado não muda.** Portas e névoa copiam as do dono e, no
 *     fim, voltam ao que eram (`world.estadoPassagens`); ele não pega item, não
 *     abre baú nem porta, não descansa (`Game.interact`), e o save dele não
 *     grava durante a visita — só depois, com as almas ganhas.
 *   • **Acaba** quando o dono morre ou descansa, quando o convidado morre (volta
 *     para casa sem perder nada) ou alguns segundos depois de um chefe cair.
 *
 * Os projéteis (orbe, onda, bomba) aparecem do outro lado como cópia VISUAL
 * (`Projectiles`, opção `visual`): o dano é sempre de quem os criou.
 * Validação: o que chega é do outro cliente, então números são conferidos e o
 * que é absurdo (dano > 500, golpe de longe) é descartado.
 */
import * as THREE from 'three';
import { TIPO, retratoDoInimigo, lerRetrato } from './protocolo.js';
import { Enemy, ENEMY_TYPES } from '../enemies.js';

/** De quanto em quanto tempo o dono manda o MUNDO. */
const MUNDO_MS = 100;
/** Um lacaio do Carrasco que some do MUNDO por isto é tirado da tela do convidado. */
const LACAIO_SOME_MS = 3000;
const FIM_DO_CHEFE_S = 6;

const r2 = (v) => Math.round(v * 100) / 100;
const vet = (v) => (v ? [r2(v.x), r2(v.y), r2(v.z)] : null);
const lerVet = (a) => (Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) && a.every((n) => Math.abs(n) < 1e4) ? new THREE.Vector3(a[0], a[1], a[2]) : null);

export class Coop {
  constructor(sala, dono) {
    this.sala = sala;
    this.game = sala.game;
    this.dono = dono;
    this.ultimoMundo = 0;
    this.lacaios = new Map();   // netId → {inimigo, visto} (só no convidado)
  }

  get outro() { return this.sala.outro; }
  get nomeOutro() { return this.outro?.nome || 'O outro jogador'; }

  iniciar() {
    const g = this.game, p = g.player, o = this.outro;
    if (this.dono) {
      g.jogadores.push(o);
      o.aoSofrerDano = (r, dano, src, opts = {}) => this.sala.enviar(TIPO.DANO, {
        dano: Math.round(dano), poise: Math.round(opts.poise ?? 30), unb: !!opts.unblockable, o: vet(src),
      });
      g.ui.toast(`${this.nomeOutro} entrou no seu mundo.`);
      return;
    }
    // convidado: guarda o próprio mundo e entra no do outro, ao lado dele
    this.guardado = { pos: p.pos.clone(), facing: p.facing, passagens: g.world.estadoPassagens() };
    g.marionetes = true;
    g.projectiles.clear();
    p.lockTarget = null;
    p.pos.set(o.pos.x - Math.sin(o.facing) * 1.6, o.pos.y, o.pos.z - Math.cos(o.facing) * 1.6);
    p.pos.y = g.world.alturaChao(p.pos);
    g.world.resolve(p.pos, p.radius);
    p.facing = o.facing; p.camYaw = o.facing;
    p.inArena = o.inArena;
    g.snapCamera();
    g.ui.centerMessage(`Mundo de ${this.nomeOutro}`, 'info', 2600);
  }

  update() {
    if (!this.dono) return this.limparLacaios();
    const agora = performance.now();
    if (agora - this.ultimoMundo < MUNDO_MS) return;
    this.ultimoMundo = agora;
    const g = this.game;
    this.sala.enviar(TIPO.MUNDO, {
      bf: !!g.bossFight,
      ba: g.bossFight ? (g.bossAtual?.netId ?? 'carrasco') : null,
      pass: g.world.estadoPassagens(),
      e: g.all.filter((e) => e.netId).map(retratoDoInimigo),
    });
  }

  // ------------------------------------------------------------ convidado

  receberMundo(c) {
    const g = this.game, quando = performance.now(), lim = g.world.limites();
    if (Array.isArray(c.e)) {
      for (const q of c.e.slice(0, 64)) {
        const r = lerRetrato(q, lim);
        if (!r) continue;
        let ent = g.all.find((e) => e.netId === r.netId);
        if (!ent && r.netId.startsWith('lacaio')) ent = this.criarLacaio(r);
        if (!ent) continue;
        if (this.lacaios.has(r.netId)) this.lacaios.get(r.netId).visto = quando;
        ent.receberMarionete(r, quando);
      }
    }
    const pass = c.pass;
    if (pass && Array.isArray(pass.portas) && pass.portas.length <= 64) {
      // os barris quebrados do dono; o que EU acabei de quebrar segue quebrado até ele saber
      let quebrados = null;
      if (Array.isArray(pass.quebrados) && pass.quebrados.length <= 300) {
        quebrados = pass.quebrados.filter(Number.isInteger);
        this.quebrasPendentes ??= new Map();
        for (const [i, t] of this.quebrasPendentes) {
          if (quando - t > 2500 || quebrados.includes(i)) this.quebrasPendentes.delete(i); else quebrados.push(i);
        }
      }
      g.world.aplicarPassagens({ portas: pass.portas.map(Boolean), nevoa: !!pass.nevoa, quebrados });
    }
    // a barra (e a música) do chefe acompanham a luta do dono
    const bf = !!c.bf;
    if (bf !== g.bossFight) {
      g.bossFight = bf;
      if (bf) g.sfx.startBossMusic(); else g.sfx.stopBossMusic();
    }
    g.bossAtual = c.ba === 'wyrm' ? g.dragao : null;
    g.world.setBraziers(bf && c.ba !== 'wyrm');
  }

  criarLacaio(r) {
    const g = this.game;
    const m = new Enemy(g, { ...ENEMY_TYPES.minion, souls: 0, drops: [], hp: 50 }, new THREE.Vector3(r.x, r.y, r.z), r.g);
    m.netId = r.netId;
    m.canEngage = () => false;
    g.all.push(m);
    g.boss.minions.push(m);
    this.lacaios.set(r.netId, { inimigo: m, visto: performance.now() });
    return m;
  }

  limparLacaios(tudo = false) {
    const agora = performance.now();
    for (const [id, l] of this.lacaios) {
      if (!tudo && agora - l.visto < LACAIO_SOME_MS) continue;
      const g = this.game, m = l.inimigo;
      g.scene.remove(m.model.root);
      g.all = g.all.filter((x) => x !== m);
      g.boss.minions = g.boss.minions.filter((x) => x !== m);
      this.lacaios.delete(id);
    }
  }

  /** O meu golpe acertou um inimigo NA MINHA TELA: quem aplica é o dono. */
  golpear(alvo, dano, origem, poise, opts = {}) {
    this.sala.enviar(TIPO.GOLPE, { id: alvo.netId, dano: Math.round(dano), poise: Math.round(poise ?? 20), fogo: !!opts.fire, o: vet(origem) });
    alvo.flashT = 0.12;   // resposta imediata; a vida de verdade vem no próximo MUNDO
    return 'hit';
  }

  receberDano(c) {
    const { dano, poise } = c;
    if (![dano, poise].every(Number.isFinite) || dano < 0 || dano > 500 || poise < 0 || poise > 300) return;
    const p = this.game.player;
    const src = lerVet(c.o) ?? p.pos.clone();
    if (src.distanceTo(p.pos) > 40) return;
    p.takeDamage(dano, src, { poise, unblockable: !!c.unb });
  }

  // ------------------------------------------------------------ dono

  receberGolpe(c) {
    const { dano, poise } = c;
    if (![dano, poise].every(Number.isFinite) || dano < 0 || dano > 500 || poise < 0 || poise > 300) return;
    const e = this.game.all.find((x) => x.netId === c.id);
    if (!e || e.dead || !e.active) return;
    // o atraso perdoa uns metros, não a masmorra inteira
    if (this.outro && Math.hypot(e.pos.x - this.outro.pos.x, e.pos.z - this.outro.pos.z) > 8 + e.radius) return;
    const origem = lerVet(c.o) ?? this.outro?.pos.clone() ?? e.pos.clone();
    const res = e.takeDamage(dano, origem, poise, { fire: !!c.fogo });
    if (res && c.fogo) e.ignite?.(3);
    if (res) this.game.sfx.hit();
  }

  /** `Game.onEnemyKilled`: as almas do inimigo também são do convidado. */
  aoMatarInimigo(e) {
    if (e.cfg?.souls > 0) this.sala.enviar(TIPO.EVENTO, { tipo: 'almas', n: e.cfg.souls, id: e.netId });
  }

  /** Um chefe caiu no mundo do dono: festa dos dois, e o convidado volta para casa. */
  aoVencerChefe(nome) {
    this.sala.enviar(TIPO.EVENTO, { tipo: 'chefe', nome });
    this.game.after(FIM_DO_CHEFE_S, () => this.sala.encerrarCoop('o chefe caiu'));
  }

  // ------------------------------------------------------------ dos dois lados

  /** Um projétil nasceu aqui: o outro lado desenha uma cópia que não fere. */
  /** Quebrei um barril no mundo do dono: ele fica sabendo (o que caiu é meu). */
  aoQuebrar(q) {
    if (this.dono) return;   // no meu mundo o quebrado já vai no MUNDO
    (this.quebrasPendentes ??= new Map()).set(q.i, performance.now());
    this.sala.enviar(TIPO.EVENTO, { tipo: 'quebrar', i: q.i });
  }

  aoProjetil(k, a) {
    this.sala.enviar(TIPO.EVENTO, { tipo: 'proj', k, pos: vet(a.pos), dir: vet(a.dir), vel: vet(a.vel),
      speed: a.speed, life: a.life, delay: a.delay, maxR: a.maxR, radius: a.radius });
  }

  receberEvento(c) {
    const g = this.game;
    if (c.tipo === 'quebrar' && this.dono && Number.isInteger(c.i)) {
      const q = g.world.quebravel(c.i);
      if (q && !q.quebrado && (!this.outro || Math.hypot(q.pos.x - this.outro.pos.x, q.pos.z - this.outro.pos.z) < 8)) g.world.quebrar(q, { origem: this.outro?.pos });
      return;
    }
    if (c.tipo === 'proj') {
      const pos = lerVet(c.pos);
      if (!pos) return;
      const num = (v, max, padrao) => (Number.isFinite(v) && v >= 0 && v <= max ? v : padrao);
      if (c.k === 'orb') { const dir = lerVet(c.dir); if (dir) g.projectiles.orb({ pos, dir, speed: num(c.speed, 40, 9), life: num(c.life, 10, 4), delay: num(c.delay, 3, 0), visual: true }); }
      else if (c.k === 'shock') g.projectiles.shock({ pos, maxR: num(c.maxR, 20, 6), speed: num(c.speed, 40, 10), visual: true });
      else if (c.k === 'bomb') { const vel = lerVet(c.vel); if (vel) g.projectiles.bomb({ pos, vel, damage: 0, radius: num(c.radius, 8, 2), visual: true }); }
      return;
    }
    if (this.dono) return;
    if (c.tipo === 'almas' && Number.isFinite(c.n) && c.n > 0 && c.n <= 20000) {
      const e = g.all.find((x) => x.netId === c.id);
      if (e) g.effects.soulStream(e.pos.clone().setY(e.pos.y + (e.height ?? 1.8) * 0.5), 25);
      g.addSouls(c.n);
    } else if (c.tipo === 'chefe' && typeof c.nome === 'string') {
      g.sfx.stopBossMusic();
      g.sfx.victory();
      g.ui.centerMessage(`${c.nome.slice(0, 30)} ABATIDO`, 'victory', 5000);
    }
  }

  /** Fim do co-op. O dono só solta o convidado; o convidado volta para casa. */
  encerrar(motivo) {
    const g = this.game;
    if (this.dono) {
      g.jogadores = g.jogadores.filter((j) => j !== this.outro && !j.remoto);
      if (this.outro) this.outro.aoSofrerDano = null;
      if (motivo) g.ui.toast(`${this.nomeOutro} voltou ao mundo dele (${motivo}).`);
      return;
    }
    this.voltarParaCasa(motivo);
  }

  voltarParaCasa(motivo) {
    const g = this.game, p = g.player, guardado = this.guardado;
    g.marionetes = false;
    this.limparLacaios(true);
    for (const e of g.all) e.soltarMarionete?.();
    g.projectiles.clear();
    g.world.aplicarPassagens(guardado.passagens);
    g.bossFight = false;
    g.bossAtual = null;
    g.sfx.stopBossMusic();
    g.world.setBraziers(false);
    g.resetWorld();
    g.boss.sleep();   // o `resetWorld` pula o Carrasco vencido; a marionete dele precisa voltar ao estado DESTE mundo
    if (p.dead) p.respawn();
    p.pos.copy(guardado.pos);
    p.facing = guardado.facing; p.camYaw = guardado.facing;
    p.inArena = false;
    p.lockTarget = null;
    g.snapCamera();
    g.ui.centerMessage('De volta ao seu mundo', 'info', 2600);
    if (motivo) g.ui.toast(`Fim da ajuda: ${motivo}.`);
    g.after(0.5, () => g.salvar({ nuvem: true }));   // as almas ganhas
  }
}
