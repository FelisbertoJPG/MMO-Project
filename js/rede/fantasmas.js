/**
 * **Os outros jogadores, como fantasmas** — online nível 1.
 *
 * Cada um transmite o próprio instantâneo (`protocolo.js`) num canal ao vivo
 * do mapa, e desenha os dos outros como `JogadorRemoto` translúcidos. Não há
 * colisão, combate nem nada que um fantasma faça no seu mundo: ele só passa.
 *
 * **Por que transmissão e não tabela**: uma posição vale 120 ms; gravá-la no
 * banco oito vezes por segundo por pessoa seria pagar escrita por um dado que
 * já nasceu velho. A transmissão vai de cliente a cliente sem tocar o Postgres.
 *
 * **Dois ritmos** (a lição de `duel academy/web/js/mundovivo.js`): mandar só
 * quando muda faz quem está PARADO sumir da tela dos outros quando o prazo
 * vence; mandar todo quadro estoura o limite de mensagens do Realtime. Por isso
 * `ENVIO_MS` em movimento e `BATIDA_MS` parado.
 *
 * O canal é PRIVADO (`masmorra:mundo:<mapa>`): só logado e só com a Masmorra
 * ligada (policies em `realtime.messages`, migration 0001). No co-op, a sala
 * da sessão é outro canal com o mesmo cano.
 */
import { SUPABASE_URL, SUPABASE_KEY, tokenValido, req } from './supabase.js';
import { ouvirTransmissoes } from './realtime.js';
import { TIPO, instantaneo, limparInstantaneo } from './protocolo.js';
import { Assets } from '../assets.js';
import { JogadorRemoto } from '../remoto.js';

export const ENVIO_MS = 125;
export const BATIDA_MS = 2000;
/** Sem notícia por isto, o fantasma some. Folga de quatro batidas. */
export const SUMICO_MS = 8000;

export class Fantasmas {
  constructor(game, online) {
    this.game = game;
    this.online = online;
    this.meuId = online.jogador.id;
    this.remotos = new Map();     // id → JogadorRemoto
    this.nomes = new Map();       // id → nome (ou null enquanto busca)
    this.ultimoEnvio = 0;
    this.ultimo = null;
    this.ligado = false;
    this.canal = ouvirTransmissoes(
      { url: SUPABASE_URL, apikey: SUPABASE_KEY, token: tokenValido, sala: `masmorra:mundo:${Assets.mapaNome}`, privado: true },
      (evento, carga) => this.aoReceber(evento, carga),
      (ligado) => { this.ligado = ligado; },
    );
  }

  aoReceber(evento, carga) {
    if (evento !== TIPO.POS) return;
    const inst = limparInstantaneo(carga, { limites: this.game.world.limites(), meuId: this.meuId });
    if (!inst) return;
    // quem está na minha sala já aparece sólido (rede/sala.js), não como fantasma
    if (this.game.sessao?.outroId === inst.id) return this.esquecer(inst.id);
    let r = this.remotos.get(inst.id);
    if (!r || r.sumindo) {
      if (r) { r.remover(); }
      r = new JogadorRemoto(this.game, { id: inst.id, nome: this.nomes.get(inst.id) ?? '', aparencia: 'fantasma' });
      this.remotos.set(inst.id, r);
      this.buscarNome(inst.id);
    }
    r.receber(inst);
  }

  /**
   * O nome vem do BANCO (`masmorra.jogadores`), nunca do recado: o recado é
   * escrito pelo outro cliente, e um nome dito por ele seria um nome que
   * qualquer um inventa.
   */
  async buscarNome(id) {
    if (this.nomes.has(id)) return;
    this.nomes.set(id, null);
    const r = await req(`jogadores?select=nome&id=eq.${encodeURIComponent(id)}`);
    const nome = r.ok && r.dados?.[0]?.nome;
    if (!nome) { this.nomes.delete(id); return; }
    this.nomes.set(id, nome);
    this.remotos.get(id)?.nomear(nome);
  }

  update(dt) {
    const agora = performance.now();
    if (this.game.state === 'playing') this.enviar(agora);
    for (const [id, r] of this.remotos) {
      if (!r.sumindo && agora - r.ultimoRecado > SUMICO_MS) r.sumir();
      r.update(dt, agora);
      if (r.sumiu) { r.remover(); this.remotos.delete(id); }
    }
  }

  enviar(agora) {
    if (!this.ligado) return;
    const p = this.game.player;
    const desde = agora - this.ultimoEnvio;
    if (desde < ENVIO_MS) return;
    const u = this.ultimo;
    const mudou = !u || Math.abs(u.x - p.pos.x) + Math.abs(u.z - p.pos.z) + Math.abs(u.y - p.pos.y) > 0.02
      || Math.abs(u.g - p.facing) > 0.04 || u.a !== p.model.currentName;
    if (!mudou && desde < BATIDA_MS) return;
    const inst = instantaneo(p, this.meuId);
    this.canal.transmitir(TIPO.POS, inst);
    this.ultimo = inst;
    this.ultimoEnvio = agora;
  }

  /** Tira um fantasma da tela já (ele entrou na minha sala). */
  esquecer(id) {
    const r = this.remotos.get(id);
    if (r) { r.remover(); this.remotos.delete(id); }
  }

  /** Quantos estão andando por aqui agora (para a interface). */
  get quantos() { let n = 0; for (const r of this.remotos.values()) if (!r.sumindo) n++; return n; }

  fechar() {
    this.canal.fechar();
    for (const r of this.remotos.values()) r.remover();
    this.remotos.clear();
  }
}
