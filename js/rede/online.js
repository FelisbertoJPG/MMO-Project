/**
 * **O online da Masmorra** — a conta, e o que liga quando há conta.
 *
 * O jogo abre e joga inteiro sem isto (login é OPCIONAL, decisão de
 * 01/10/2026). Logado e com rede, liga o NÍVEL 1:
 *
 *   • o save da conta também na nuvem (`js/save.js`);
 *   • `Fantasmas` — os outros jogadores andando, translúcidos (`fantasmas.js`);
 *   • `Mensagens` — texto deixado no chão por outros (`mensagens.js`);
 *   • `Mortes` — as manchas de sangue dos outros, com o replay (`mortes.js`).
 *
 * Os níveis 2 e 3 (co-op e PvP) entram aqui como uma SESSÃO (`game.sessao`)
 * sobre o mesmo canal ao vivo — o terreno está descrito no CLAUDE.md.
 *
 * Tudo no Supabase mora no schema `masmorra` (ver supabase/migrations). Se o
 * schema estiver desligado (`masmorra.config.ligado = false`) ou não exposto na
 * API, `iniciar` cai em `indisponivel` e o jogo segue offline sem reclamar.
 */
import { sessao, contaId, entrar, cadastrar, sair, rpc } from './supabase.js';
import { Fantasmas } from './fantasmas.js';
import { Mensagens } from './mensagens.js';
import { Mortes } from './mortes.js';
import { ChatGlobal } from './chat.js';

export class Online {
  constructor(game) {
    this.game = game;
    /** 'deslogado' | 'logado' | 'semRede' (logado, mas o servidor não respondeu) | 'indisponivel' */
    this.estado = 'deslogado';
    this.jogador = null;        // {id, nome} na Masmorra
    this.motivo = '';
    this.fantasmas = null; this.mensagens = null; this.mortes = null;
  }

  /** Online de verdade: conta + servidor respondendo + Masmorra ligada. */
  get ativo() { return this.estado === 'logado'; }
  /** Id da conta (mesmo sem rede: o save local é separado por ele). */
  get contaId() { return contaId(); }
  get nome() { return this.jogador?.nome ?? sessao()?.user?.email ?? ''; }

  /** No carregamento: reabre a sessão guardada, se houver. */
  async iniciar() {
    if (!sessao()) { this.estado = 'deslogado'; return; }
    await this.confirmarJogador();
  }

  async confirmarJogador() {
    const r = await rpc('entrar');
    if (r.ok && r.dados?.id) { this.jogador = { id: r.dados.id, nome: r.dados.nome }; this.estado = 'logado'; this.motivo = ''; return; }
    if (r.status === 0) { this.estado = 'semRede'; this.motivo = 'sem conexão — jogando offline com a sua conta'; return; }
    if (r.status === 401) { await sair(); this.estado = 'deslogado'; this.motivo = 'a sessão expirou, entre de novo'; return; }
    // 406 = schema não exposto; 'masmorra desligada' = interruptor; 404 = migration não rodou
    this.estado = 'indisponivel';
    // O motivo DIZ qual dos três é: "está desligado" para os três fazia quem
    // configura o Supabase procurar o defeito no lugar errado (o servidor de
    // mundo, o login), quando faltava um clique no painel.
    this.motivo = r.status === 406 ? 'o online da Masmorra não está exposto no Supabase (falta "masmorra" em Exposed schemas)'
      : r.status === 404 ? 'o online da Masmorra não foi instalado no Supabase (faltam as migrations)'
        : 'o online da Masmorra está desligado no momento';
    console.warn('[online] indisponível:', r.status, r.error);
  }

  async entrar(email, senha) {
    const r = await entrar(email, senha);
    if (!r.ok) return r;
    await this.confirmarJogador();
    return { ok: true };
  }

  async cadastrar(email, senha, nome) {
    const r = await cadastrar(email, senha, nome);
    if (!r.ok || r.precisaConfirmar) return r;
    await this.confirmarJogador();
    return { ok: true };
  }

  async sair() {
    this.pararPartida();
    await sair();
    this.jogador = null;
    this.estado = 'deslogado';
    this.motivo = '';
  }

  /** O jogo começou (Continuar/Novo Jogo): liga o nível 1. */
  comecarPartida() {
    if (!this.ativo) return;
    const game = this.game;
    // no mundo online quem está no mapa aparece de verdade (rede/mundo.js), não como fantasma
    if (game.regras.fantasmas) this.fantasmas = new Fantasmas(game, this);
    this.mensagens = new Mensagens(game, this);
    this.mortes = new Mortes(game, this);
    this.chat = new ChatGlobal(game);   // o chat global, o mesmo do Duel Academy
  }

  pararPartida() {
    this.fantasmas?.fechar(); this.mensagens?.fechar(); this.mortes?.fechar(); this.chat?.fechar();
    this.fantasmas = this.mensagens = this.mortes = this.chat = null;
  }

  /** Todo quadro, inclusive com menu aberto (os outros não pausam junto). */
  update(dt) {
    this.fantasmas?.update(dt);
    this.mortes?.update(dt);
  }
}
