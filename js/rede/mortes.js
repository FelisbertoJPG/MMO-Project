/**
 * **As manchas de sangue dos outros** — online nível 1.
 *
 * O jogo grava sempre os últimos `RASTRO_SEG` segundos do jogador (instantâneos
 * a `RASTRO_HZ`, no formato de `protocolo.js`). Ao morrer, esse rastro vai para
 * `masmorra.mortes`. As mortes dos OUTROS aparecem no mapa como manchas
 * vermelhas; tocá-la mostra um boneco vermelho revivendo aqueles segundos —
 * o aviso de que ali tem perigo.
 *
 * A mancha VERDE (as suas almas) é outra coisa e continua em `world.setBloodstain`.
 */
import { req, rpc } from './supabase.js';
import { Assets } from '../assets.js';
import { instantaneo, compactarRastro, expandirRastro, RASTRO_HZ, RASTRO_SEG } from './protocolo.js';
import { JogadorRemoto } from '../remoto.js';

const LIMITE = 25;
const RELER_MS = 120_000;
const QUADRO_MS = 1000 / RASTRO_HZ;

export class Mortes {
  constructor(game, online) {
    this.game = game;
    this.online = online;
    this.rastro = [];
    this.gravarT = 0;
    this.manchas = new Map();     // id → interagível
    this.replays = [];
    this.carregar();
    this.timer = setInterval(() => this.carregar(), RELER_MS);
  }

  async carregar() {
    const mapa = encodeURIComponent(Assets.mapaNome);
    const eu = encodeURIComponent(this.online.jogador.id);
    const r = await req(`mortes?select=id,x,y,z,causa,rastro,criado_em,jogadores(nome)&mapa=eq.${mapa}&autor=neq.${eu}&order=criado_em.desc&limit=${LIMITE}`);
    if (!r.ok || !Array.isArray(r.dados)) return;
    const vistas = new Set();
    for (const m of r.dados) {
      vistas.add(m.id);
      if (this.manchas.has(m.id) || ![m.x, m.y, m.z].every(Number.isFinite)) continue;
      this.manchas.set(m.id, this.game.world.addOutraMancha({ x: m.x, y: m.y, z: m.z }, {
        id: m.id, autor: m.jogadores?.nome ?? '?', causa: m.causa, rastro: m.rastro, quando: m.criado_em,
      }));
    }
    for (const [id, it] of this.manchas) if (!vistas.has(id)) { this.game.world.removeOutraMancha(it); this.manchas.delete(id); }
  }

  /** Grava o quadro corrente do jogador local (chamado todo quadro de jogo). */
  gravar(dt) {
    this.gravarT -= dt;
    if (this.gravarT > 0) return;
    this.gravarT = 1 / RASTRO_HZ;
    this.rastro.push(instantaneo(this.game.player, 'eu'));
    if (this.rastro.length > RASTRO_HZ * RASTRO_SEG) this.rastro.shift();
  }

  /** O jogador local morreu: manda a mancha com os últimos segundos. */
  registrar(causa = null) {
    const p = this.game.player;
    rpc('registrar_morte', {
      p_mapa: Assets.mapaNome, p_x: p.pos.x, p_y: p.pos.y, p_z: p.pos.z,
      p_causa: causa, p_rastro: compactarRastro(this.rastro),
    }).then((r) => { if (!r.ok) console.warn('[mortes] não registrou:', r.error); });
    this.rastro = [];
  }

  /** Tocou uma mancha: o boneco vermelho revive os últimos segundos dela. */
  tocar(it) {
    if (it.tocando) return;
    const quadros = expandirRastro(it.rastro, this.game.world.limites());
    if (!quadros.length) { this.game.ui.toast(`${it.autor} morreu aqui.`); return; }
    it.tocando = true;
    const r = new JogadorRemoto(this.game, { id: `mancha${it.id}`, nome: it.autor, aparencia: 'sangue' });
    const t0 = performance.now() + 200;
    quadros.forEach((q, i) => r.receber(q, t0 + i * QUADRO_MS));
    // `receber` marca o "último recado" no futuro; o fim é quando o rastro acaba
    this.replays.push({ r, it, fim: t0 + quadros.length * QUADRO_MS + 900 });
    this.game.ui.toast(`${it.autor} morreu aqui${tempoAtras(it.quando)}.`);
  }

  update(dt) {
    // grava também caído: o registro sai 1,5 s depois da morte (Game.onPlayerDeath), com a queda junto
    if (this.game.state === 'playing' && !this.game.menu) this.gravar(dt);
    const agora = performance.now();
    for (let i = this.replays.length - 1; i >= 0; i--) {
      const x = this.replays[i];
      if (agora > x.fim) x.r.sumir();
      x.r.update(dt, agora);
      if (x.r.sumiu) { x.r.remover(); x.it.tocando = false; this.replays.splice(i, 1); }
    }
  }

  fechar() {
    clearInterval(this.timer);
    for (const it of this.manchas.values()) this.game.world.removeOutraMancha(it);
    this.manchas.clear();
    for (const x of this.replays) x.r.remover();
    this.replays = [];
  }
}

function tempoAtras(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s) || s < 0) return '';
  if (s < 3600) return `, há ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `, há ${Math.round(s / 3600)} h`;
  return `, há ${Math.round(s / 86400)} dia(s)`;
}
