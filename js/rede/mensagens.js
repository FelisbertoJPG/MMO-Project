/**
 * **Mensagens no chão, escritas pelos jogadores** — online nível 1.
 *
 * Texto LIVRE, até 140 letras (decisão de 01/10/2026). Quem modera são os
 * próprios jogadores: cada um vota +1/−1 uma vez por mensagem, e com nota −3 o
 * banco a esconde de todos (menos do autor) — ver `masmorra.avaliar`. Os
 * limites (10 por hora, 30 no mundo por autor) também moram no banco: o
 * cliente pode ser editado, a função SQL não.
 *
 * As mensagens são do MAPA (`Assets.mapaNome`) e aparecem como as do próprio
 * jogo (`world.addMessage`), só que com autor e nota (ver `Game.interact`).
 */
import { req, rpc } from './supabase.js';
import { Assets } from '../assets.js';

/** Quantas mensagens aparecem no mapa (as mais recentes). */
const LIMITE = 80;
/** De quanto em quanto tempo relê (para as novas dos outros aparecerem). */
const RELER_MS = 90_000;
export const MAX_LETRAS = 140;

export class Mensagens {
  constructor(game, online) {
    this.game = game;
    this.online = online;
    this.itens = new Map();     // id → interagível no mundo
    this.votos = new Map();     // id → meu voto
    this.carregar();
    this.timer = setInterval(() => this.carregar(), RELER_MS);
  }

  async carregar() {
    const mapa = encodeURIComponent(Assets.mapaNome);
    const [r, v] = await Promise.all([
      req(`mensagens?select=id,autor,x,y,z,texto,nota,criado_em,jogadores(nome)&mapa=eq.${mapa}&order=criado_em.desc&limit=${LIMITE}`),
      req('avaliacoes?select=mensagem,voto'),
    ]);
    if (!r.ok || !Array.isArray(r.dados)) return;
    if (v.ok && Array.isArray(v.dados)) for (const x of v.dados) this.votos.set(x.mensagem, x.voto);
    const vistas = new Set();
    for (const m of r.dados) {
      vistas.add(m.id);
      const it = this.itens.get(m.id);
      if (it) { it.nota = m.nota; continue; }
      this.colocar(m);
    }
    // as que sumiram do banco (apagadas, escondidas por voto, empurradas pelo limite)
    for (const [id, it] of this.itens) if (!vistas.has(id)) { this.game.world.removeMessage(it); this.itens.delete(id); }
  }

  colocar(m) {
    if (![m.x, m.y, m.z].every(Number.isFinite) || typeof m.texto !== 'string') return;
    const it = this.game.world.addMessage({ x: m.x, y: m.y, z: m.z }, m.texto.slice(0, MAX_LETRAS), {
      seed: m.id * 7 + 1, online: true, id: m.id,
      autor: m.jogadores?.nome ?? '?', minha: m.autor === this.online.jogador.id, nota: m.nota ?? 0,
    });
    this.itens.set(m.id, it);
  }

  /** Grava uma mensagem um pouco à frente do jogador. Devolve `{ok, error}`. */
  async escrever(texto) {
    texto = texto.trim();
    if (!texto) return { ok: false, error: 'escreva alguma coisa' };
    const p = this.game.player;
    const x = p.pos.x + Math.sin(p.facing) * 1.2, z = p.pos.z + Math.cos(p.facing) * 1.2;
    const y = this.game.world.alturaChao({ x, y: p.pos.y, z });
    const r = await rpc('escrever_mensagem', { p_mapa: Assets.mapaNome, p_x: x, p_y: y, p_z: z, p_texto: texto.slice(0, MAX_LETRAS) });
    if (!r.ok) return { ok: false, error: r.error };
    this.colocar({ ...r.dados, jogadores: { nome: this.online.jogador.nome } });
    return { ok: true };
  }

  meuVoto(it) { return this.votos.get(it.id) ?? 0; }

  async avaliar(it, voto) {
    if (it.minha) return { ok: false, error: 'é a sua mensagem' };
    const r = await rpc('avaliar', { p_mensagem: it.id, p_voto: voto });
    if (!r.ok) return { ok: false, error: r.error };
    it.nota = r.dados;
    this.votos.set(it.id, voto);
    if (it.nota <= -3) { this.game.world.removeMessage(it); this.itens.delete(it.id); }
    return { ok: true };
  }

  async apagar(it) {
    if (!it.minha) return { ok: false };
    const r = await req(`mensagens?id=eq.${it.id}`, { method: 'DELETE' });
    if (!r.ok) return { ok: false, error: r.error };
    this.game.world.removeMessage(it);
    this.itens.delete(it.id);
    return { ok: true };
  }

  fechar() {
    clearInterval(this.timer);
    for (const it of this.itens.values()) this.game.world.removeMessage(it);
    this.itens.clear();
  }
}
