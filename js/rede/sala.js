/**
 * **A SALA** — dois jogadores juntos (etapa 1) e o DUELO (etapa 2).
 *
 * Quem abre é o ANFITRIÃO; quem entra, o CONVIDADO. Cada um continua no
 * próprio mundo (os inimigos de cada um são só dele até o co-op, etapa 3) e vê
 * o outro SÓLIDO, como `JogadorRemoto` "aliado", trocando instantâneos como os
 * fantasmas.
 *
 * **Por onde conversa** (`transporte.js`):
 *   • pela INTERNET (Supabase), entrando com o código — precisa de conta;
 *   • pela REDE LOCAL, direto no `server.js` do anfitrião — sem conta, sem internet.
 * O anfitrião ouve nos dois ao mesmo tempo. O convidado que entrou pela
 * internet recebe no `OLA` os IPs do anfitrião e tenta alcançá-lo; se
 * responder, os dois estão na MESMA REDE e a sala troca para o cano local
 * (1–5 ms em vez de 100–200 ms). Quem decide a troca é o convidado, e o
 * anfitrião só passa a responder pelo cano por onde o convidado falou por último.
 *
 * **O duelo**: convite → aceito → os dois vão para a arena, o mundo some
 * (`game.esconderMundo`), contagem de 3 s e luta. QUEM ATACA detecta o acerto e
 * manda `GOLPE_PVP`; QUEM APANHA aplica com o próprio estado — se rolou ou
 * bloqueou na tela dele, valeu. É o que deixa o atraso justo para quem defende.
 * Quem morre avisa (`DUELO fim`). Ninguém perde nada: o inventário volta ao que
 * era antes do duelo, e os dois acordam na fogueira.
 *
 * **O co-op** (etapa 3) mora em `coop.js`: aqui só o convite (o mesmo dos
 * duelos — um convite por vez, de qualquer tipo) e as rotas dos recados.
 */
import { TIPO, instantaneo, limparInstantaneo } from './protocolo.js';
import { transporteInternet, transporteLocal, minhaRede, acharNaRede } from './transporte.js';
import { temRedeLocal } from '../hospedagem.js';
import { req } from './supabase.js';
import { Assets } from '../assets.js';
import { JogadorRemoto } from '../remoto.js';
import { ARENA_CENTER } from '../world.js';
import { ENVIO_MS, BATIDA_MS } from './fantasmas.js';
import { Coop } from './coop.js';
import * as THREE from 'three';

const LETRAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // sem 0/O e 1/I, que se confundem ditados
export const novoCodigo = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => LETRAS[b % LETRAS.length]).join('');
export const codigoValido = (c) => /^[A-Z0-9]{6}$/.test(c);

/** Sem conta (só rede local), um id por aba — basta para os dois se distinguirem. */
let idSemConta = null;
function meuId(online) {
  if (online?.jogador?.id) return online.jogador.id;
  idSemConta ??= `lan-${crypto.randomUUID()}`;
  return idSemConta;
}

const CONTAGEM_S = 3;
const FIM_S = 4;
const CONVITE_MS = 20_000;
const PROCURAR_MS = 12_000;
/**
 * Sem recado do outro por isto, ele "perdeu a conexão". Folga larga de
 * propósito: com a janela minimizada ou atrás de outra (Alt+Tab), o navegador
 * para de desenhar, e só o batimento de `BATIMENTO_MS` (um `setInterval`, que
 * segue rodando escondido) mantém a pessoa na sala.
 */
const SUMICO_MS = 15_000;
const BATIMENTO_MS = 1000;

export class Sala {
  constructor(game, papel, codigo) {
    this.game = game;
    this.online = game.online;
    this.papel = papel;                 // 'anfitriao' | 'convidado'
    this.codigo = codigo;
    this.meuId = meuId(this.online);
    this.meuNome = this.online?.jogador?.nome || 'Morto-vivo';
    this.estado = 'conectando';         // 'conectando' | 'esperando' | 'juntos' | 'erro'
    this.erro = '';
    this.canos = [];                    // transportes abertos
    this.canal = null;                  // o cano por onde falo com o outro
    this.outro = null; this.outroId = null;
    this.duelo = null;                  // {fase: 'contagem'|'luta'|'fim', t, guardado}
    this.convite = null;                // convite RECEBIDO: {tipo: 'duelo'|'coop', ate}
    this.convidei = 0;                  // convite que EU mandei: {tipo, quando}, 0 = nenhum
    this.coop = null;                   // o co-op em andamento (rede/coop.js)
    this.ultimoEnvio = 0; this.ultimo = null; this.ultimoRecado = 0; this.ultimoOla = 0;
    this.inicio = performance.now();
    // O envio da posição anda com o QUADRO (`update`); este batimento anda com
    // o relógio, e é o que sobra quando a janela está escondida e não há quadro.
    this.batimento = setInterval(() => {
      if (this.outro && performance.now() - this.ultimoEnvio > BATIMENTO_MS) {
        this.ultimo = instantaneo(this.game.player, this.meuId);
        this.enviar(TIPO.POS, this.ultimo);
        this.ultimoEnvio = performance.now();
      }
    }, BATIMENTO_MS);
  }

  // ------------------------------------------------------------ abrir / entrar

  /** Abre uma sala nova. Ouve na rede local (se o servidor tiver) e na internet (se houver conta). */
  static async abrir(game) {
    const s = new Sala(game, 'anfitriao', novoCodigo());
    s.rede = await minhaRede();
    if (s.rede) s.canos.push(transporteLocal('', s.codigo, s.meuId, s.receptor('local'), () => {}, { anunciar: true, nome: s.meuNome }));
    if (game.online?.ativo) s.canos.push(transporteInternet(s.codigo, s.meuId, s.receptor('internet')));
    if (!s.canos.length) { s.estado = 'erro'; s.erro = temRedeLocal() ? 'Sem rede local (reinicie o jogo pelo masmorra.exe) e sem conta para jogar pela internet.' : 'Neste endereço a sala é pela internet: entre com uma conta na tela inicial.'; }
    else s.estado = 'esperando';
    return s;
  }

  /**
   * Entra numa sala. `base` (de "salas na rede local") vai direto ao servidor
   * do anfitrião; sem ela, procura pelo código na internet.
   */
  static entrar(game, codigo, base = null) {
    const s = new Sala(game, 'convidado', codigo);
    if (base) s.canal = s.abrirCano(transporteLocal(base, codigo, s.meuId, s.receptor('local'), (ok) => { if (ok) s.dizerOla(); }));
    else if (game.online?.ativo) s.canal = s.abrirCano(transporteInternet(codigo, s.meuId, s.receptor('internet'), (ok) => { if (ok) s.dizerOla(); }));
    else { s.estado = 'erro'; s.erro = 'Para entrar por código pela internet, entre com uma conta. Na mesma rede, use a lista de salas.'; }
    return s;
  }

  abrirCano(t) { this.canos.push(t); return t; }

  receptor(tipo) {
    return (evento, carga, de) => {
      const cano = this.canos.find((c) => c.tipo === tipo && !c.fechado) ?? null;
      try { this.aoReceber(evento, carga, de, cano); } catch (e) { console.warn('[sala] recado ruim:', evento, e); }
    };
  }

  dizerOla(cano = this.canal) {
    this.ultimoOla = performance.now();
    const carga = { id: this.meuId, nome: this.meuNome, mapa: Assets.mapaNome };
    // O anfitrião conta onde está na rede: é a sonda de "mesma rede" do convidado
    if (this.papel === 'anfitriao' && this.rede) carga.rede = this.rede;
    cano?.enviar(TIPO.OLA, carga);
  }

  enviar(evento, carga) { this.canal?.enviar(evento, carga); }

  // ------------------------------------------------------------ recados

  aoReceber(evento, carga, de, cano) {
    if (!de || de === this.meuId || !cano) return;
    const c = carga && typeof carga === 'object' ? carga : {};
    switch (evento) {
      case TIPO.OLA: return this.recebeuOla(c, de, cano);
      case TIPO.CHEIA:
        if (c.para === this.meuId && !this.outro) this.falhar('A sala já tem dois jogadores.');
        return;
      case TIPO.TCHAU: if (de === this.outroId) this.outroSaiu('saiu da sala'); return;
      case TIPO.POS: {
        if (de !== this.outroId) return;
        const inst = limparInstantaneo(c, { limites: this.game.world.limites(), meuId: this.meuId });
        if (!inst || inst.id !== de) return;
        this.outro.receber(inst);
        this.ultimoRecado = performance.now();
        // o cano por onde ele fala por último é o cano por onde respondo
        if (this.papel === 'anfitriao') this.usarCano(cano);
        return;
      }
      case TIPO.DUELO: if (de === this.outroId) this.recebeuConvite('duelo', c); return;
      case TIPO.COOP: if (de === this.outroId) this.recebeuConvite('coop', c); return;
      case TIPO.GOLPE_PVP: if (de === this.outroId) this.recebeuGolpe(c); return;
      // o co-op: o MUNDO e o DANO vão do dono ao convidado; o GOLPE, do convidado ao dono
      case TIPO.MUNDO: if (de === this.outroId && this.coop && !this.coop.dono) this.coop.receberMundo(c); return;
      case TIPO.DANO: if (de === this.outroId && this.coop && !this.coop.dono) this.coop.receberDano(c); return;
      case TIPO.GOLPE: if (de === this.outroId && this.coop?.dono) this.coop.receberGolpe(c); return;
      case TIPO.EVENTO: if (de === this.outroId) this.coop?.receberEvento(c); return;
    }
  }

  recebeuOla(c, de, cano) {
    if (typeof c.id !== 'string' || c.id !== de) return;
    const nome = typeof c.nome === 'string' && c.nome.trim() ? c.nome.trim().slice(0, 24) : 'Morto-vivo';
    if (c.mapa !== Assets.mapaNome) {
      if (this.papel === 'convidado') this.falhar('O anfitrião está em outro mapa da masmorra.');
      return;
    }
    if (this.papel === 'anfitriao') {
      if (this.outroId && this.outroId !== de) return cano.enviar(TIPO.CHEIA, { para: de });
      if (!this.outro) this.aceitar(de, nome, cano);
      this.usarCano(cano);
      this.dizerOla(cano);   // responde por onde veio
      return;
    }
    // convidado
    if (!this.outro) this.aceitar(de, nome, cano);
    if (cano !== this.canal) this.usarCano(cano);
    if (cano.tipo === 'internet' && c.rede && !this.tentouLocal) this.tentarRedeLocal(c.rede);
  }

  aceitar(id, nome, cano) {
    this.outroId = id;
    this.outro = new JogadorRemoto(this.game, { id, nome, aparencia: 'aliado' });
    this.ultimoRecado = performance.now();
    this.estado = 'juntos';
    this.usarCano(cano);
    this.online?.fantasmas?.esquecer(id);   // não aparece duas vezes (fantasma + sala)
    this.game.ui.toast(`${nome} ${this.papel === 'anfitriao' ? 'entrou na sua sala' : 'está com você'}.`);
    // Pela internet, o nome que vale é o do banco (o do recado é dito pelo cliente)
    if (!id.startsWith('lan-') && this.online?.ativo) {
      req(`jogadores?select=nome&id=eq.${encodeURIComponent(id)}`).then((r) => {
        const n = r.ok && r.dados?.[0]?.nome;
        if (n && this.outroId === id) this.outro?.nomear(n);
      });
    }
  }

  usarCano(cano) {
    if (!cano || cano === this.canal) return;
    this.canal = cano;
    // O convidado que achou o caminho local larga o da internet (o anfitrião
    // mantém os dois: é por eles que alguém novo poderia chegar)
    if (this.papel === 'convidado' && cano.tipo === 'local') {
      for (const c of this.canos) if (c.tipo === 'internet' && !c.fechado) { c.fechado = true; c.fechar(); }
    }
    if (this.estado === 'juntos') this.game.ui.toast(cano.tipo === 'local' ? 'Mesma rede: conexão direta pela rede local.' : 'Conectado pela internet.');
  }

  /** Convidado pela internet: os dois estão na mesma rede? Se sim, troca de cano. */
  async tentarRedeLocal(rede) {
    this.tentouLocal = true;
    const base = await acharNaRede(rede);
    if (!base || this.fechada) return;
    const local = this.abrirCano(transporteLocal(base, this.codigo, this.meuId, this.receptor('local'), (ok) => { if (ok) this.dizerOla(local); }));
  }

  get conexao() { return this.canal?.tipo ?? null; }

  /** O contrato que o jogo lê de qualquer `game.sessao` (a sala tem um; o mundo online, vários). */
  get outros() { return this.outro ? [this.outro] : []; }
  aoProjetil(k, a) { this.coop?.aoProjetil(k, a); }

  // ------------------------------------------------------------ o quadro

  update(dt) {
    const agora = performance.now();
    if (this.estado === 'conectando') {
      if (agora - this.inicio > PROCURAR_MS) this.falhar(`Não achei a sala ${this.codigo}.`);
      else if (agora - this.ultimoOla > 1500) this.dizerOla();   // o anfitrião pode ter perdido o primeiro
    }
    if (this.outro) {
      this.enviarPosicao(agora);
      this.outro.update(dt, agora);
      if (agora - this.ultimoRecado > SUMICO_MS) this.outroSaiu('perdeu a conexão');
    }
    if (this.convite && agora > this.convite.ate) this.responderConvite(false);
    if (this.convidei && agora - this.convidei.quando > CONVITE_MS) { this.convidei = 0; this.game.ui.toast('O convite não foi respondido.'); }
    if (this.duelo) this.atualizarDuelo(dt);
    this.coop?.update(dt);
  }

  enviarPosicao(agora) {
    const p = this.game.player, desde = agora - this.ultimoEnvio;
    // no duelo, o dobro do ritmo: cada golpe depende de onde o outro está
    if (desde < (this.duelo ? ENVIO_MS / 2 : ENVIO_MS)) return;
    const u = this.ultimo;
    const mudou = !u || Math.abs(u.x - p.pos.x) + Math.abs(u.z - p.pos.z) + Math.abs(u.y - p.pos.y) > 0.02
      || Math.abs(u.g - p.facing) > 0.04 || u.a !== p.model.currentName || u.st !== p.state || u.h !== instantaneo(p, '').h;
    if (!mudou && desde < BATIDA_MS) return;
    this.ultimo = instantaneo(p, this.meuId);
    this.enviar(TIPO.POS, this.ultimo);
    this.ultimoEnvio = agora;
  }

  outroSaiu(motivo) {
    const nome = this.outro?.nome || 'O outro jogador';
    if (this.coop) this.encerrarCoop(motivo, false);
    if (this.duelo) this.encerrarDuelo();
    this.outro?.remover();
    this.outro = null; this.outroId = null;
    this.convite = null; this.convidei = 0;
    this.game.ui.esconderConvite?.();
    this.estado = this.papel === 'anfitriao' ? 'esperando' : 'erro';
    if (this.papel === 'convidado') this.erro = `${nome} ${motivo}.`;
    this.game.ui.toast(`${nome} ${motivo}.`);
  }

  falhar(motivo) { this.estado = 'erro'; this.erro = motivo; this.fecharCanos(); }

  fecharCanos() { clearInterval(this.batimento); for (const c of this.canos) { c.fechado = true; c.fechar(); } }

  /** Sai da sala (e encerra o duelo, se houver). */
  sair() {
    if (this.coop) this.encerrarCoop('saiu da sala');
    this.enviar(TIPO.TCHAU, {});
    if (this.duelo) this.encerrarDuelo();
    this.fechada = true;
    // dá tempo ao TCHAU de sair antes de fechar o cano
    setTimeout(() => this.fecharCanos(), 300);
    this.outro?.remover();
    this.outro = null; this.outroId = null;
    this.game.ui.esconderConvite?.();
  }

  // ------------------------------------------------------------ o duelo

  /** O alvo de PvP (para a mira travada e o golpe): o outro, só durante o duelo. */
  get rival() { return this.duelo && this.outro ? this.outro : null; }

  // ------------------------------------------------------------ os convites (duelo e co-op)
  // Um por vez, de qualquer tipo: `convidei` = o que EU mandei, `convite` = o que recebi.

  get ocupado() { return !!(this.duelo || this.coop); }

  convidar(tipo) {
    if (!this.outro || this.ocupado || this.convidei || this.convite) return;
    this.convidei = { tipo, quando: performance.now() };
    this.enviar(tipo === 'coop' ? TIPO.COOP : TIPO.DUELO, { fase: 'convite' });
    this.game.ui.toast(tipo === 'coop' ? `Chamado enviado a ${this.outro.nome}...` : `Desafio enviado a ${this.outro.nome}...`);
  }
  desafiar() { this.convidar('duelo'); }
  /** Co-op: quem chama é o DONO do mundo; o outro vem ajudar. */
  chamarParaMeuMundo() { this.convidar('coop'); }

  responderConvite(aceito) {
    const cv = this.convite;
    if (!cv) return;
    this.convite = null;
    this.game.ui.esconderConvite?.();
    this.enviar(cv.tipo === 'coop' ? TIPO.COOP : TIPO.DUELO, { fase: aceito ? 'aceito' : 'recusado' });
    if (aceito) this.comecar(cv.tipo, false);
  }

  /** `euConvidei`: no co-op, quem convidou é o dono do mundo. */
  comecar(tipo, euConvidei) {
    if (tipo === 'duelo') this.iniciarDuelo();
    else this.iniciarCoop(euConvidei);
  }

  recebeuConvite(tipo, c) {
    const nome = this.outro.nome, recado = tipo === 'coop' ? TIPO.COOP : TIPO.DUELO;
    switch (c.fase) {
      case 'convite':
        if (this.ocupado || this.convite) return this.enviar(recado, { fase: 'recusado' });
        // os dois desafiaram ao mesmo tempo: é duelo
        if (this.convidei?.tipo === 'duelo' && tipo === 'duelo') { this.convidei = 0; this.enviar(recado, { fase: 'aceito' }); return this.iniciarDuelo(); }
        // já chamei para outra coisa (ou os dois chamaram para o próprio mundo: não dá para juntar dois mundos)
        if (this.convidei) return this.enviar(recado, { fase: 'recusado' });
        this.convite = { tipo, ate: performance.now() + CONVITE_MS };
        this.game.ui.mostrarConvite?.(tipo === 'coop' ? `${nome} chama você para ajudar no mundo dele.` : `${nome} desafia você para um duelo.`);
        return;
      case 'aceito':
        if (this.convidei?.tipo === tipo && !this.ocupado) { this.convidei = 0; this.comecar(tipo, true); }
        return;
      case 'recusado':
        if (this.convidei?.tipo === tipo) { this.convidei = 0; this.game.ui.toast(`${nome} recusou ${tipo === 'coop' ? 'o chamado' : 'o duelo'}.`); }
        return;
      case 'fim':
        if (tipo === 'duelo' && this.duelo?.fase === 'luta' && c.perdedor === this.outroId) this.terminar(true);
        if (tipo === 'coop' && this.coop) this.encerrarCoop(typeof c.motivo === 'string' ? c.motivo.slice(0, 60) : '', false);
        return;
    }
  }

  // ------------------------------------------------------------ o co-op

  iniciarCoop(dono) {
    if (this.game.menu) this.game.closeMenu();
    this.coop = new Coop(this, dono);
    this.coop.iniciar();
  }

  /** Fim do co-op (`avisar`: conta ao outro; falso quando o fim veio dele). */
  encerrarCoop(motivo = '', avisar = true) {
    const c = this.coop;
    if (!c) return;
    if (avisar) this.enviar(TIPO.COOP, { fase: 'fim', motivo });
    this.coop = null;
    c.encerrar(motivo);
  }

  /** Morri no mundo do outro: aviso, caio, e volto para casa sem perder nada. */
  morriComoConvidado() {
    const c = this.coop;
    this.enviar(TIPO.COOP, { fase: 'fim', motivo: 'o convidado morreu' });
    this.coop = null;
    this.game.after(0.9, () => this.game.ui.centerMessage('VOCÊ MORREU', 'died', 2600));
    this.game.after(3.5, () => c.encerrar('você morreu no mundo dele'));
  }

  iniciarDuelo() {
    const g = this.game, p = g.player, inv = g.inventory;
    if (g.menu) g.closeMenu();
    this.duelo = {
      fase: 'contagem', t: CONTAGEM_S, numero: null,
      // tudo o que o duelo pode gastar volta ao fim: duelo não custa nada
      guardado: { itens: new Map(inv.items), tocha: inv.torchTime, almas: p.souls },
    };
    g.esconderMundo(true);
    // frente a frente no centro da arena: o anfitrião ao norte, o convidado ao sul
    const lado = this.papel === 'anfitriao' ? -1 : 1;
    p.pos.set(ARENA_CENTER.x, 0, ARENA_CENTER.z + lado * 5);
    p.pos.y = g.world.alturaChao(p.pos);
    p.facing = lado < 0 ? 0 : Math.PI;
    p.camYaw = p.facing;
    p.inArena = true;
    p.lockTarget = null;
    p.knock.set(0, 0, 0);
    p.hp = p.maxHp; p.stamina = p.maxStamina;
    p.setState('free');
    p.model.play(p.idleAnim, { fade: 0.2 });
    g.snapCamera();
    this.outro.mudarAparencia('rival');
    this.outro.hpFrac = 1;
    g.bossAtual = this.outro;
    g.bossFight = true;
    g.world.setBraziers(true);
    g.sfx.startBossMusic();
  }

  atualizarDuelo(dt) {
    const d = this.duelo, g = this.game;
    d.t -= dt;
    if (d.fase === 'contagem') {
      const n = Math.ceil(d.t);
      if (n !== d.numero && n > 0) { d.numero = n; g.ui.centerMessage(String(n), 'info', 900); }
      if (d.t <= 0) { d.fase = 'luta'; g.ui.centerMessage('LUTEM', 'died', 1200); g.sfx.roar?.(); }
    } else if (d.fase === 'fim' && d.t <= 0) {
      this.encerrarDuelo();
    }
  }

  /** O meu golpe acertou o outro NA MINHA TELA: manda para ele decidir. */
  golpear(alvo, dano, origem, poise, opts = {}) {
    // no mundo do outro, o golpe num inimigo vai para quem manda nele
    if (this.coop && !this.coop.dono && alvo.netId) return this.coop.golpear(alvo, dano, origem, poise, opts);
    if (alvo !== this.outro) return alvo.takeDamage(dano, origem, poise, opts);
    if (this.duelo?.fase !== 'luta') return null;
    this.enviar(TIPO.GOLPE_PVP, { dano: Math.round(dano), poise: Math.round(poise ?? 30), x: origem.x, z: origem.z, fogo: !!opts.fire });
    return 'hit';
  }

  /** O golpe do outro chegou: EU decido se pegou (rolei? bloqueei?). */
  recebeuGolpe(c) {
    if (this.duelo?.fase !== 'luta') return;
    const { dano, poise, x, z } = c;
    if (![dano, poise, x, z].every(Number.isFinite) || dano < 0 || dano > 500 || poise < 0 || poise > 300) return;
    const p = this.game.player;
    // de muito longe não acerta: o atraso perdoa uns metros, não a arena inteira
    if (Math.hypot(p.pos.x - x, p.pos.z - z) > 8) return;
    p.takeDamage(dano, new THREE.Vector3(x, p.pos.y, z), { poise });
  }

  /** Morri no duelo (chamado por `Game.onPlayerDeath` no lugar da morte de verdade). */
  perdi() {
    this.enviar(TIPO.DUELO, { fase: 'fim', perdedor: this.meuId });
    this.terminar(false);
  }

  terminar(venci) {
    const g = this.game;
    this.duelo.fase = 'fim';
    this.duelo.t = FIM_S;
    g.sfx.stopBossMusic();
    g.ui.centerMessage(venci ? 'VITÓRIA' : 'DERROTA', venci ? 'victory' : 'died', FIM_S * 1000 - 500);
    if (venci) g.sfx.victory();
  }

  /** Volta tudo ao que era: mundo, inventário, vida; os dois acordam na fogueira. */
  encerrarDuelo() {
    const g = this.game, p = g.player, inv = g.inventory, guardado = this.duelo.guardado;
    this.duelo = null;
    g.bossAtual = null;
    g.bossFight = false;
    g.sfx.stopBossMusic();
    g.esconderMundo(false);
    inv.items = new Map(guardado.itens);
    inv.torchTime = guardado.tocha;
    p.souls = guardado.almas;
    p.refreshEquipment();
    p.respawn();
    g.snapCamera();
    this.outro?.mudarAparencia('aliado');
  }
}
