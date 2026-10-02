/**
 * **O MUNDO ONLINE** (02/10/2026) — o MMO: todos no mesmo mapa, o tempo todo.
 *
 * É a `game.sessao` do modo `mmo` (o lugar da `Sala` no modo offline), e fala
 * com o `servidor-mundo.mjs` — as regras de lá (quem recebe o quê) estão no
 * cabeçalho dele. Daqui, três coisas para ter na cabeça:
 *
 * **1. Um dos jogadores SIMULA os inimigos; os outros veem marionetes.** É o
 * desenho do co-op (`coop.js`: o dono do mundo manda o `MUNDO`, o convidado só
 * repete), com duas diferenças: são N jogadores, e o simulador TROCA no meio
 * do caminho — o servidor escolhe outro quando ele sai, trava ou esconde a
 * janela. Quem assume recebe o último retrato de cada inimigo e segue dali
 * (`assumir` → `Enemy.retomar`); quem entrega volta a ser marionete (`entregar`).
 * `game.marionetes` é sempre o contrário de `souSim`.
 *
 * **2. O mundo não reinicia.** No offline, descansar e morrer põem todo
 * inimigo de pé e os chefes para dormir (`resetWorld`). Aqui isso derrubaria a
 * luta dos outros, então quem cuida é o simulador, por TEMPO (`tique`):
 *   • inimigo comum renasce `RENASCE_MS` depois de cair, se ninguém estiver olhando;
 *   • chefe acorda quando alguém entra na arena/terraço, volta a dormir (vida
 *     cheia) quando todos lá morrem ou saem, e RESSURGE `CHEFE_VOLTA_MS` depois
 *     de vencido — com a névoa fechando de novo.
 * Os relógios são do SERVIDOR (`agora()`): andam igual para todos e
 * sobrevivem à troca de simulador e ao mundo ficar vazio (`est`, no `MUNDO`).
 *
 * **3. O que é de todos e o que é de cada um.** De todos: inimigos, portas,
 * névoa, chefes. De cada um (fica no save do personagem, e cada um vê o seu):
 * baús, itens no chão, tochas da parede, a mancha de sangue, as almas. Quem
 * bateu num inimigo ou estava por perto leva as almas INTEIRAS, e o que ele
 * deixa cair aparece para cada um desses (`repartir`).
 *
 * **Onde mora o personagem** (`this.saves`, dito pelo servidor ao entrar):
 *   • `'disco'` — no servidor de mundo (`/__mundo/personagem`), quando ele tem disco;
 *   • `'nuvem'` — no Supabase (`masmorra.personagens`, migration 0002), quando o
 *     servidor roda numa plataforma que apaga o disco (o Render). Aí quem lê e
 *     grava é ESTE arquivo, com o token da conta, como o save da Jornada.
 * Nos dois, falhar em LER nunca vira "personagem novo": entrar com um
 * personagem zerado gravaria por cima do de verdade no primeiro save.
 *
 * Validação: o que chega veio de outro cliente. Números são conferidos e o
 * absurdo (dano > 500, golpe de longe, item que não existe) é descartado.
 */
import * as THREE from 'three';
import { TIPO, instantaneo, limparInstantaneo, retratoDoInimigo, lerRetrato } from './protocolo.js';
import { transporteMundo } from './transporte.js';
import { req } from './supabase.js';
import { ENVIO_MS, BATIDA_MS } from './fantasmas.js';
import { Assets } from '../assets.js';
import { ITEMS } from '../items.js';
import { JogadorRemoto } from '../remoto.js';
import { Enemy, ENEMY_TYPES } from '../enemies.js';
import { flatDist } from '../combat.js';

/** Tem de bater com a do `servidor-mundo.mjs`: versões diferentes não se entendem. */
export const VERSAO_MUNDO = 1;

const MUNDO_MS = 100;              // o simulador manda o retrato dos inimigos 10× por segundo
const TIQUE_MS = 1000;             // …e cuida dos relógios (renascer, chefes) uma vez por segundo
const RENASCE_MS = 180_000;        // inimigo comum: 3 min depois de cair
const CHEFE_VOLTA_MS = 15 * 60_000;
const CHEFE_DESISTE_S = 4;         // chefe acordado sem ninguém vivo na luta: volta a dormir
const LONGE_PARA_RENASCER = 22;    // metros: ninguém vê o esqueleto brotar do nada
const RAIO_DAS_ALMAS = 25;         // quem está a isto do inimigo que caiu também leva as almas
const PORTA_PENDENTE_MS = 2500;    // a porta que EU abri não fecha na minha cara até o simulador saber
const LACAIO_SOME_MS = 3000;
const BATIMENTO_MS = 1000;
const REENTRAR_MS = 3000;
/** Na nuvem, o save comum vai no máximo a cada isto (o da fogueira, do chefe e o de sair vão na hora). */
const NUVEM_MS = 60_000;

/** Os chefes: o id que viaja, o inimigo no jogo e o que cada um rende. */
export const CHEFES = {
  carrasco: { netId: 'carrasco', titulo: 'CARRASCO ABATIDO', alma: 'executionerSoul' },
  wyrm: { netId: 'wyrm', titulo: 'WYRM DAS CINZAS ABATIDO', alma: 'wyrmSoul' },
};

const r2 = (v) => Math.round(v * 100) / 100;
const vet = (v) => (v ? [r2(v.x), r2(v.y), r2(v.z)] : null);
const lerVet = (a) => (Array.isArray(a) && a.length === 3 && a.every(Number.isFinite) && a.every((n) => Math.abs(n) < 1e4) ? new THREE.Vector3(a[0], a[1], a[2]) : null);

export class Mundo {
  /**
   * Entra no mundo: `{ok, mundo}` ou `{ok: false, error}`. `obterToken` devolve
   * o token da conta (é chamado de novo a cada reentrada: o token renova).
   * O cano só abre em `ligar()`, depois de o jogo pôr o personagem de pé.
   */
  static async entrar(game, { base = '', obterToken }) {
    const d = await Mundo.pedirEntrada(base, obterToken);
    if (!d.ok) return d;
    if (d.saves === 'nuvem') {
      const r = await Mundo.lerDaNuvem(game.online);
      if (!r.ok) {
        // desiste da vaga que o servidor acabou de dar
        fetch(`${base}/__mundo/sair?b=${d.bilhete}`, { method: 'POST', keepalive: true }).catch(() => {});
        return r;
      }
      d.personagem = r.personagem;
    }
    return { ok: true, mundo: new Mundo(game, base, d, obterToken) };
  }

  /**
   * O personagem desta conta no Supabase: `{ok, personagem}` (null = ainda não
   * tem) ou `{ok: false, error}`. "Não consegui ler" e "não tem" são respostas
   * DIFERENTES de propósito — ver o cabeçalho.
   */
  static async lerDaNuvem(online) {
    const conta = online?.contaId;
    if (!conta || !online.ativo) return { ok: false, error: 'neste mundo o personagem fica na sua conta: entre com uma conta' };
    const r = await req(`personagens?select=dados&dono=eq.${encodeURIComponent(conta)}`);
    if (r.status === 404) return { ok: false, error: 'a tabela dos personagens não existe no Supabase (falta rodar a migration 0002)' };
    if (!r.ok || !Array.isArray(r.dados)) return { ok: false, error: `não consegui ler o seu personagem (${r.error ?? 'resposta inesperada'}) — tente de novo` };
    const dados = r.dados[0]?.dados ?? null;
    if (dados && dados.versao !== 1) return { ok: false, error: 'o seu personagem foi gravado por uma versão mais nova do jogo — atualize a página' };
    return { ok: true, personagem: dados };
  }

  static async pedirEntrada(base, obterToken) {
    const token = await obterToken();
    if (!token) return { ok: false, error: 'entre com uma conta para jogar online' };
    let r;
    try {
      r = await fetch(`${base}/__mundo/entrar`, {
        method: 'POST', headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ token, v: VERSAO_MUNDO, mapa: Assets.mapaNome }),
      });
    } catch { return { ok: false, error: 'o servidor do mundo não respondeu' }; }
    const d = await r.json().catch(() => null);
    if (!r.ok || !d?.ok) return { ok: false, error: d?.erro ?? `o servidor do mundo recusou (HTTP ${r.status})` };
    return d;
  }

  /** O que o servidor diz de si (`/__mundo/info`), ou null se não respondeu. */
  static async info(base = '', ms = 4000) {
    try {
      const r = await fetch(`${base}/__mundo/info`, { cache: 'no-store', signal: AbortSignal.timeout(ms) });
      const d = r.ok ? await r.json() : null;
      return d?.quem === 'masmorra-do-carrasco' ? d : null;
    } catch { return null; }
  }

  constructor(game, base, entrada, obterToken) {
    this.game = game;
    this.base = base;
    this.obterToken = obterToken;
    this.eu = entrada.id;
    this.meuNome = entrada.nome;
    this.bilhete = entrada.bilhete;
    /** O save que o servidor guardava (null = personagem novo). */
    this.personagem = entrada.personagem ?? null;
    /** Onde o personagem é gravado: 'disco' (no servidor de mundo) ou 'nuvem' (Supabase). */
    this.saves = entrada.saves === 'nuvem' ? 'nuvem' : 'disco';
    this.ultimaNuvem = 0;
    this.desvio = (entrada.agora ?? Date.now()) - Date.now();
    this.estado = 'conectando';        // 'conectando' | 'ligado' | 'reconectando' | 'fora'
    this.motivo = '';
    this.simulador = null;
    this.pronto = false;               // já soube quem simula (até lá, ninguém mexe nos inimigos)
    this.nomes = new Map();            // id → nome, de quem o SERVIDOR diz que está no mundo
    this.remotos = new Map();          // id → JogadorRemoto (nasce no primeiro `pos` dele)
    this.mortos = new Map();           // netId → quando renasce (relógio do servidor)
    this.chefes = {};                  // 'carrasco' | 'wyrm' → quando ressurge (relógio do servidor)
    this.semLuta = { carrasco: 0, wyrm: 0 };
    this.pendentes = new Map();        // índice da porta → quando EU a abri
    this.lacaios = new Map();          // netId → {inimigo, visto} (marionetes dos lacaios do Carrasco)
    this.luta = null;                  // o chefe com quem EU estou lutando (barra e música)
    this.ultimoEnvio = 0; this.ultimo = null; this.ultimoMundo = 0; this.ultimoTique = 0;
    this.falhouSalvar = false;
    this.guardarEstado(entrada.estado);
    // até o servidor dizer quem simula, os inimigos daqui ficam parados
    game.marionetes = true;
    this.aoMudarVisao = () => this.cano?.enviar('visivel', { v: !document.hidden });
  }

  // ------------------------------------------------------------ o contrato de `game.sessao`

  get souSim() { return this.pronto && this.simulador === this.eu; }
  /** Os outros jogadores que já apareceram (bonecos sólidos). */
  get outros() { return [...this.remotos.values()]; }
  /** Para o painel: todos os que o servidor diz que estão no mundo, eu inclusive. */
  get presentes() { return [...this.nomes].map(([id, nome]) => ({ id, nome, eu: id === this.eu, simula: id === this.simulador })); }
  /** Relógio do SERVIDOR, em ms: o mesmo para todos os jogadores. */
  agora() { return Date.now() + this.desvio; }

  /** Abre o cano. O servidor responde com o `ola` (quem está, quem simula, o estado). */
  ligar() {
    this.abrirCano();
    document.addEventListener('visibilitychange', this.aoMudarVisao);
    // O envio da posição anda com o QUADRO; este batimento anda com o relógio,
    // e é o que sobra quando a janela está escondida e não há quadro.
    this.batimento = setInterval(() => {
      if (this.estado === 'ligado' && performance.now() - this.ultimoEnvio > BATIMENTO_MS) this.enviarPosicao(performance.now(), true);
    }, BATIMENTO_MS);
  }

  abrirCano() {
    this.cano?.fechar();
    this.cano = transporteMundo(this.base, this.bilhete,
      (evento, carga, de) => { try { this.aoReceber(evento, carga, de); } catch (e) { console.warn('[mundo] recado ruim:', evento, e); } },
      (ligado, motivo) => this.aoEstado(ligado, motivo));
  }

  aoEstado(ligado, motivo) {
    if (this.estado === 'fora') return;
    if (ligado) {
      if (this.estado === 'reconectando') this.game.ui.toast('De volta ao mundo.');
      this.estado = 'ligado';
      return;
    }
    if (this.estado === 'ligado') this.game.ui.toast('A conexão com o mundo caiu. Reconectando…');
    this.estado = 'reconectando';
    // sem o simulador falando, os inimigos daqui param onde estão
    if (motivo === 'bilhete') this.reentrar();
  }

  /** O servidor não nos conhece mais (reiniciou, a carência venceu): entra de novo, com bilhete novo. */
  async reentrar() {
    if (this.reentrando || this.estado === 'fora') return;
    this.reentrando = true;
    this.cano?.fechar();
    for (;;) {
      if (this.estado === 'fora') break;
      const d = await Mundo.pedirEntrada(this.base, this.obterToken);
      if (d.ok) {
        this.bilhete = d.bilhete;
        this.desvio = (d.agora ?? Date.now()) - Date.now();
        this.pronto = false; this.simulador = null;
        this.game.marionetes = true;
        this.abrirCano();
        break;
      }
      this.motivo = d.error;
      await new Promise((ok) => setTimeout(ok, REENTRAR_MS));
    }
    this.reentrando = false;
  }

  /** Sai do mundo de vez (o save já foi mandado por quem chama). */
  sair() {
    if (this.estado === 'fora') return;
    this.estado = 'fora';
    clearInterval(this.batimento);
    document.removeEventListener('visibilitychange', this.aoMudarVisao);
    // `keepalive`: o pedido sobrevive à página fechando logo em seguida
    fetch(`${this.base}/__mundo/sair?b=${this.bilhete}`, { method: 'POST', keepalive: true }).catch(() => {});
    this.cano?.fechar();
    for (const r of this.remotos.values()) r.remover();
    this.remotos.clear();
  }

  // ------------------------------------------------------------ o save do personagem

  /**
   * Grava o personagem — no servidor de mundo ou na nuvem (`this.saves`); é o
   * único lugar em que ele existe. `aoSair`: a página está fechando (o pedido
   * tem de sobreviver ao fechamento). `nuvem`: momento marcante, grava já.
   */
  salvar(dados, { aoSair = false, nuvem = false } = {}) {
    if (this.estado === 'fora') return;
    if (this.saves === 'nuvem') return this.salvarNaNuvem(dados, aoSair, nuvem);
    const url = `${this.base}/__mundo/personagem?b=${this.bilhete}`, corpo = JSON.stringify(dados);
    if (aoSair && navigator.sendBeacon) { navigator.sendBeacon(url, new Blob([corpo], { type: 'text/plain' })); return; }
    return fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: corpo, keepalive: aoSair })
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.erro ?? `HTTP ${r.status}`);
        this.gravou();
      })
      .catch((e) => this.naoGravou(e));
  }

  /** O save no Supabase (`masmorra.personagens`): o da rotina no máximo a cada `NUVEM_MS`. */
  salvarNaNuvem(dados, aoSair, ja) {
    const online = this.game.online, conta = online?.contaId;
    if (!conta || !online.ativo) return;
    if (!aoSair && !ja && Date.now() - this.ultimaNuvem < NUVEM_MS) return;
    this.ultimaNuvem = Date.now();
    return req('personagens', { method: 'POST', body: { dono: conta, dados, salvo_em: dados.salvoEm }, prefer: 'resolution=merge-duplicates', keepalive: aoSair })
      .then((r) => { if (!r.ok) throw new Error(r.error ?? `HTTP ${r.status}`); this.gravou(); })
      .catch((e) => { this.ultimaNuvem = 0; this.naoGravou(e); });   // falhou: a próxima tentativa não espera o minuto
  }

  gravou() {
    if (this.falhouSalvar) { this.falhouSalvar = false; this.game.ui.toast('O progresso voltou a ser gravado.'); }
  }

  naoGravou(e) {
    console.warn('[mundo] não consegui gravar o personagem:', e.message);
    // avisa UMA vez: quem joga precisa saber que o que fizer agora pode não ficar
    if (!this.falhouSalvar) { this.falhouSalvar = true; this.game.ui.toast('O seu progresso não foi gravado. Tentando de novo…'); }
  }

  // ------------------------------------------------------------ recados

  aoReceber(evento, carga, de) {
    const c = carga && typeof carga === 'object' ? carga : {};
    switch (evento) {
      // ---- do servidor
      case 'ola': return this.recebeuOla(c);
      case 'entrou': return this.entrou(c);
      case 'saiu': return this.saiu(c);
      case 'sim': return this.trocarSimulador(c.id, c.mundo, c.estado);
      case 'expulso': return this.cair(typeof c.motivo === 'string' ? c.motivo.slice(0, 120) : 'o servidor encerrou a sessão');
      // ---- dos outros jogadores (o `de` é o servidor quem diz)
      case TIPO.POS: return this.recebeuPos(c, de);
      case TIPO.MUNDO: if (de === this.simulador && !this.souSim) this.receberMundo(c); return;
      case TIPO.GOLPE: if (this.souSim) this.receberGolpe(c, de); return;
      case TIPO.DANO: if (de === this.simulador && !this.souSim) this.receberDano(c); return;
      case TIPO.ACAO: if (this.souSim) this.receberAcao(c, de); return;
      case TIPO.EVENTO: return this.receberEvento(c, de);
    }
  }

  recebeuOla(c) {
    if (typeof c.eu === 'string') this.eu = c.eu;
    if (Number.isFinite(c.agora)) this.desvio = c.agora - Date.now();
    this.nomes.clear();
    for (const j of Array.isArray(c.jogadores) ? c.jogadores.slice(0, 64) : []) {
      if (typeof j?.id === 'string') this.nomes.set(j.id, this.limparNome(j.nome));
    }
    // quem saiu enquanto eu estava fora do ar
    for (const id of [...this.remotos.keys()]) if (!this.nomes.has(id)) this.tirarRemoto(id);
    this.estado = 'ligado';
    this.trocarSimulador(c.simulador, c.mundo, c.estado);
    this.cano.enviar('visivel', { v: !document.hidden });
  }

  limparNome(n) { return typeof n === 'string' && n.trim() ? n.trim().slice(0, 24) : 'Morto-vivo'; }

  entrou(c) {
    if (typeof c.id !== 'string' || c.id === this.eu) return;
    const novo = !this.nomes.has(c.id);
    this.nomes.set(c.id, this.limparNome(c.nome));
    this.remotos.get(c.id)?.nomear(this.nomes.get(c.id));
    if (novo) this.game.ui.toast(`${this.nomes.get(c.id)} entrou no mundo.`);
  }

  saiu(c) {
    if (typeof c.id !== 'string' || !this.nomes.has(c.id)) return;
    this.game.ui.toast(`${this.nomes.get(c.id)} saiu do mundo.`);
    this.nomes.delete(c.id);
    this.tirarRemoto(c.id);
  }

  tirarRemoto(id) {
    const r = this.remotos.get(id);
    if (!r) return;
    if (this.game.player.lockTarget === r) this.game.player.lockTarget = null;
    r.remover();
    this.remotos.delete(id);
    this.atualizarAlvos();
  }

  /** O servidor encerrou a sessão (a conta entrou em outro lugar): volta à tela inicial. */
  cair(motivo) {
    this.estado = 'fora';
    this.motivo = motivo;
    clearInterval(this.batimento);
    this.cano?.fechar();
    this.game.aoCairDoMundo?.(motivo);
  }

  recebeuPos(c, de) {
    if (!de || de === this.eu || !this.nomes.has(de)) return;
    // o id que vale é o do SERVIDOR (`de`), não o que veio escrito no recado
    const inst = limparInstantaneo({ ...c, id: de }, { limites: this.game.world.limites(), meuId: this.eu });
    if (!inst) return;
    let r = this.remotos.get(de);
    if (!r) {
      r = new JogadorRemoto(this.game, { id: de, nome: this.nomes.get(de), aparencia: 'aliado' });
      this.remotos.set(de, r);
      this.atualizarAlvos();
    }
    r.receber(inst);
  }

  // ------------------------------------------------------------ quem simula

  trocarSimulador(id, mundo, estado) {
    const era = this.souSim, primeira = !this.pronto;
    this.simulador = typeof id === 'string' ? id : null;
    this.pronto = true;
    this.guardarEstado(estado);
    if (this.souSim && (!era || primeira)) this.assumir(mundo);
    else if (!this.souSim && (era || primeira)) this.entregar();
  }

  /** O `est` que o simulador manda e o servidor guarda: os relógios do mundo. */
  guardarEstado(est) {
    if (!est || typeof est !== 'object') return;
    this.mortos.clear();
    for (const [k, v] of Object.entries(est.mortos && typeof est.mortos === 'object' ? est.mortos : {}).slice(0, 200)) {
      if (/^e\d{1,3}$/.test(k) && Number.isFinite(v)) this.mortos.set(k, v);
    }
    this.chefes = {};
    for (const k of Object.keys(CHEFES)) if (Number.isFinite(est.chefes?.[k]) && est.chefes[k] > 0) this.chefes[k] = est.chefes[k];
    if (Array.isArray(est.portas) && est.portas.length <= 64) this.passagensGuardadas = { portas: est.portas.map(Boolean), nevoa: !!est.nevoa };
  }

  estadoParaGuardar() {
    const pass = this.game.world.estadoPassagens();
    return { portas: pass.portas, nevoa: pass.nevoa, mortos: Object.fromEntries(this.mortos), chefes: { ...this.chefes } };
  }

  /**
   * Passei a SIMULAR. `mundo` é o último retrato de quem simulava (ou nada, se
   * o mundo estava vazio): cada inimigo segue de onde estava, os mortos seguem
   * mortos até a hora deles, os chefes vencidos seguem vencidos.
   */
  assumir(mundo) {
    const g = this.game, agora = this.agora(), lim = g.world.limites();
    g.marionetes = false;
    this.limparLacaios(true);
    const retratos = new Map();
    for (const q of Array.isArray(mundo?.e) ? mundo.e.slice(0, 64) : []) {
      const r = lerRetrato(q, lim);
      if (r) retratos.set(r.netId, r);
    }
    if (this.passagensGuardadas) g.world.aplicarPassagens(this.passagensGuardadas);
    for (const e of g.enemies) {
      const r = retratos.get(e.netId);
      // caiu no fim do retrato e ninguém anotou: a contagem começa agora
      if (r?.morto && !this.mortos.has(e.netId)) this.mortos.set(e.netId, agora + RENASCE_MS);
      e.retomar(r);
      e.bateram = null;
      if ((this.mortos.get(e.netId) ?? 0) > agora) this.deixarMorto(e);
      else this.mortos.delete(e.netId);
    }
    for (const [qual, def] of Object.entries(CHEFES)) {
      const chefe = this.chefe(qual), r = retratos.get(def.netId);
      if (r?.morto && !this.chefes[qual]) this.chefes[qual] = agora + CHEFE_VOLTA_MS;
      chefe.defeated = (this.chefes[qual] ?? 0) > agora;
      if (!chefe.defeated) delete this.chefes[qual];
      chefe.retomar(r);
      chefe.bateram = null;
    }
    // a névoa acompanha o Carrasco: aberta enquanto ele está vencido
    g.world.aplicarPassagens({ ...g.world.estadoPassagens(), nevoa: g.boss.defeated });
    g.projectiles.clear();
    this.atualizarAlvos();
    this.ultimoMundo = 0;
    console.info('[mundo] este jogo passou a simular os inimigos');
  }

  /** Deixei de simular (ou acabei de chegar): os inimigos daqui viram marionetes de quem simula. */
  entregar() {
    const g = this.game;
    g.marionetes = true;
    g.jogadores = [g.player];
    for (const r of this.remotos.values()) r.aoSofrerDano = null;
    // os lacaios que EU invoquei eram de verdade aqui: quem assume não os tem
    for (const m of g.boss.minions) { g.scene.remove(m.model.root); g.all = g.all.filter((x) => x !== m); }
    g.boss.minions = [];
    if (this.passagensGuardadas) g.world.aplicarPassagens(this.passagensGuardadas);
  }

  chefe(qual) { return qual === 'wyrm' ? this.game.dragao : this.game.boss; }

  /** Um inimigo comum que está morto e esperando a hora de renascer: fora de cena. */
  deixarMorto(e) {
    e.dead = true; e.active = false; e.hp = 0;
    e.model.root.visible = false;
    e.setState('dead');
  }

  /** No simulador, todo jogador é alvo dos inimigos; o dano num remoto vira `DANO` para ele. */
  atualizarAlvos() {
    const g = this.game;
    if (!this.souSim) return;
    g.jogadores = [g.player, ...this.remotos.values()];
    for (const r of this.remotos.values()) {
      r.aoSofrerDano = (rem, dano, src, opts = {}) => this.cano.enviar(TIPO.DANO, {
        para: rem.id, dano: Math.round(dano), poise: Math.round(opts.poise ?? 30), unb: !!opts.unblockable, o: vet(src),
      });
    }
  }

  // ------------------------------------------------------------ o quadro

  update(dt) {
    const agora = performance.now();
    if (this.estado === 'ligado') this.enviarPosicao(agora);
    for (const r of this.remotos.values()) r.update(dt, agora);
    if (this.souSim) {
      if (agora - this.ultimoTique >= TIQUE_MS) { this.tique((agora - this.ultimoTique) / 1000); this.ultimoTique = agora; }
      if (this.estado === 'ligado' && agora - this.ultimoMundo >= MUNDO_MS) this.enviarMundo(agora);
    } else this.limparLacaios();
    this.atualizarLuta();
  }

  enviarPosicao(agora, forcar = false) {
    const p = this.game.player, desde = agora - this.ultimoEnvio;
    if (!forcar && desde < ENVIO_MS) return;
    const u = this.ultimo, novo = instantaneo(p, this.eu);
    const mudou = !u || Math.abs(u.x - novo.x) + Math.abs(u.z - novo.z) + Math.abs(u.y - novo.y) > 0.02
      || Math.abs(u.g - novo.g) > 0.04 || u.a !== novo.a || u.st !== novo.st || u.h !== novo.h || u.d !== novo.d || u.e !== novo.e;
    if (!forcar && !mudou && desde < BATIDA_MS) return;
    this.ultimo = novo;
    this.cano.enviar(TIPO.POS, novo, { troca: true });
    this.ultimoEnvio = agora;
  }

  enviarMundo(agora) {
    const g = this.game;
    const carga = { e: g.all.filter((e) => e.netId).map(retratoDoInimigo), pass: g.world.estadoPassagens() };
    // os relógios vão junto uma vez por segundo: é o que o servidor guarda
    if (agora - (this.ultimoEst ?? 0) >= TIQUE_MS) { this.ultimoEst = agora; carga.est = this.estadoParaGuardar(); }
    this.cano.enviar(TIPO.MUNDO, carga, { troca: !carga.est });
    this.ultimoMundo = agora;
  }

  /** Há algum jogador VIVO a menos de `raio` de `pos`? */
  alguemPerto(pos, raio) {
    const g = this.game;
    if (!g.player.dead && flatDist(g.player.pos, pos) < raio) return true;
    for (const r of this.remotos.values()) if (!r.dead && flatDist(r.pos, pos) < raio) return true;
    return false;
  }

  /** Todos os jogadores, eu inclusive: `{id, j}` (o `Player` ou o `JogadorRemoto`). */
  todos() { return [{ id: this.eu, j: this.game.player }, ...[...this.remotos].map(([id, j]) => ({ id, j }))]; }

  naLuta(qual, j) {
    if (j.dead) return false;
    if (qual === 'carrasco') return !!j.inArena;
    const w = this.game.world;
    return w.nivel(...w.cellOf(j.pos)) === 1;
  }

  /** Uma vez por segundo, SÓ no simulador: quem renasce, que chefe acorda, dorme ou ressurge. */
  tique(seg) {
    const g = this.game, agora = this.agora();
    for (const e of g.enemies) {
      if (e.dead && !this.mortos.has(e.netId)) this.mortos.set(e.netId, agora + RENASCE_MS);
      const quando = this.mortos.get(e.netId);
      // só volta quem já terminou de cair (`active` falso) e sem plateia
      if (quando && agora >= quando && !e.active && !this.alguemPerto(e.home, LONGE_PARA_RENASCER)) {
        e.reset();
        e.bateram = null;
        this.mortos.delete(e.netId);
      }
    }
    for (const qual of Object.keys(CHEFES)) {
      const chefe = this.chefe(qual);
      const alguem = this.todos().some(({ j }) => this.naLuta(qual, j));
      if (chefe.defeated) {
        this.chefes[qual] ??= agora + CHEFE_VOLTA_MS;
        // ressurge na hora dele, se ninguém estiver no lugar da luta
        if (agora >= this.chefes[qual] && !alguem) {
          delete this.chefes[qual];
          chefe.defeated = false;
          chefe.bateram = null;
          chefe.sleep();
          if (qual === 'carrasco') g.world.closeFog();
        }
        continue;
      }
      const dormindo = chefe.state === 'dormant';
      if (dormindo && alguem && qual === 'carrasco') chefe.wake();   // o dragão acorda pelo `podeAcordar` do laço do jogo
      // acordado e sem ninguém vivo na luta: desiste e volta a dormir, inteiro
      if (!dormindo && !chefe.dead && !alguem) {
        this.semLuta[qual] += seg;
        if (this.semLuta[qual] >= CHEFE_DESISTE_S) { this.semLuta[qual] = 0; chefe.bateram = null; chefe.sleep(); }
      } else this.semLuta[qual] = 0;
    }
  }

  /**
   * A luta de chefe é de QUEM ESTÁ NELA: a barra e a música ligam só para o
   * jogador que está na arena (ou no terraço) com o chefe acordado. Roda em
   * todos, simulador ou não — cada um olha o próprio lugar.
   */
  atualizarLuta() {
    const g = this.game, p = g.player;
    const acordado = (e) => e.active && !e.dead && !['dormant', 'gone'].includes(e.state);
    let luta = null;
    if (acordado(g.boss) && this.naLuta('carrasco', p)) luta = g.boss;
    else if (acordado(g.dragao) && this.naLuta('wyrm', p)) luta = g.dragao;
    if (luta !== this.luta) {
      this.luta = luta;
      g.bossFight = !!luta;
      g.bossAtual = luta === g.dragao ? g.dragao : null;
      if (luta) g.sfx.startBossMusic(); else g.sfx.stopBossMusic();
    }
    // os braseiros da arena acendem com o Carrasco acordado, para quem quer que olhe
    const brasas = acordado(g.boss);
    if (brasas !== this.brasas) { this.brasas = brasas; g.world.setBraziers(brasas); }
  }

  // ------------------------------------------------------------ marionete: o mundo de quem simula

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
      const portas = pass.portas.map(Boolean);
      // a porta que eu acabei de abrir fica aberta até o simulador saber dela
      for (const [i, t] of this.pendentes) {
        if (quando - t > PORTA_PENDENTE_MS || portas[i]) this.pendentes.delete(i); else portas[i] = true;
      }
      g.world.aplicarPassagens({ portas, nevoa: !!pass.nevoa });
    }
    if (c.est) this.guardarEstado(c.est);
  }

  criarLacaio(r) {
    const g = this.game;
    const m = new Enemy(g, { ...ENEMY_TYPES.minion, souls: 0, drops: [], hp: 50 }, new THREE.Vector3(r.x, r.y, r.z), r.g);
    m.netId = r.netId;
    m.canEngage = () => false;
    g.all.push(m);
    this.lacaios.set(r.netId, { inimigo: m, visto: performance.now() });
    return m;
  }

  limparLacaios(tudo = false) {
    const agora = performance.now();
    for (const [id, l] of this.lacaios) {
      if (!tudo && agora - l.visto < LACAIO_SOME_MS) continue;
      const g = this.game, m = l.inimigo;
      if (g.player.lockTarget === m) g.player.lockTarget = null;
      g.scene.remove(m.model.root);
      g.all = g.all.filter((x) => x !== m);
      this.lacaios.delete(id);
    }
  }

  receberDano(c) {
    const { dano, poise } = c;
    if (![dano, poise].every(Number.isFinite) || dano < 0 || dano > 500 || poise < 0 || poise > 300) return;
    const p = this.game.player;
    const src = lerVet(c.o) ?? p.pos.clone();
    if (src.distanceTo(p.pos) > 40) return;
    p.takeDamage(dano, src, { poise, unblockable: !!c.unb });
  }

  // ------------------------------------------------------------ golpes

  /**
   * TODO golpe do jogador num inimigo passa por aqui (`Game.golpear`). Quem
   * simula aplica na hora; os outros mandam `GOLPE` e quem aplica é o simulador
   * — a vida nova volta no próximo `MUNDO`.
   */
  golpear(alvo, dano, origem, poise, opts = {}) {
    if (!alvo.netId) return alvo.remoto ? null : alvo.takeDamage(dano, origem, poise, opts);   // aliado não se fere
    if (this.souSim) {
      const res = alvo.takeDamage(dano, origem, poise, opts);
      if (res) (alvo.bateram ??= new Set()).add(this.eu);
      return res;
    }
    if (alvo.dead || !alvo.active || alvo.invulnerable) return null;
    this.cano.enviar(TIPO.GOLPE, { id: alvo.netId, dano: Math.round(dano), poise: Math.round(poise ?? 20), fogo: !!opts.fire, o: vet(origem) });
    alvo.flashT = 0.12;   // resposta imediata; a vida de verdade vem no próximo MUNDO
    return 'hit';
  }

  receberGolpe(c, de) {
    const { dano, poise } = c;
    if (![dano, poise].every(Number.isFinite) || dano < 0 || dano > 500 || poise < 0 || poise > 300) return;
    const g = this.game, quem = this.remotos.get(de);
    const e = g.all.find((x) => x.netId === c.id);
    if (!e || !quem || e.dead || !e.active) return;
    // o atraso perdoa uns metros, não a masmorra inteira (a bomba alcança mais que a espada)
    if (flatDist(e.pos, quem.pos) > (c.fogo ? 22 : 8) + e.radius) return;
    const origem = lerVet(c.o) ?? quem.pos.clone();
    const res = e.takeDamage(dano, origem, poise, { fire: !!c.fogo });
    if (!res) return;
    (e.bateram ??= new Set()).add(de);
    if (c.fogo) e.ignite?.(3);
    if (flatDist(e.pos, g.player.pos) < 30) g.sfx.hit();
  }

  // ------------------------------------------------------------ almas, espólio, chefes

  /** Quem leva o que este inimigo deixa: quem bateu nele e quem estava por perto. */
  participantes(e) {
    const ids = new Set(e.bateram ?? []);
    for (const { id, j } of this.todos()) if (flatDist(j.pos, e.pos) < RAIO_DAS_ALMAS) ids.add(id);
    return ids;
  }

  /**
   * `Game.onEnemyKilled`, no simulador: reparte as almas e o que caiu. Devolve
   * se o jogador DAQUI também leva (quem simula pode estar do outro lado do mapa).
   */
  repartir(e, queda) {
    const ids = this.participantes(e);
    for (const id of ids) {
      if (id === this.eu || !this.remotos.has(id)) continue;
      if (e.cfg?.souls > 0) this.cano.enviar(TIPO.EVENTO, { tipo: 'almas', para: id, n: e.cfg.souls, id: e.netId });
      if (queda) this.cano.enviar(TIPO.EVENTO, { tipo: 'queda', para: id, item: queda, x: r2(e.pos.x), z: r2(e.pos.z) });
    }
    return ids.has(this.eu);
  }

  /** Um chefe caiu (no simulador): o prêmio é de quem lutou, e o relógio da volta começa. */
  aoVencerChefe(chefe) {
    const qual = chefe === this.game.dragao ? 'wyrm' : 'carrasco';
    const ids = this.participantes(chefe);
    this.chefes[qual] = this.agora() + CHEFE_VOLTA_MS;
    for (const id of ids) if (id !== this.eu && this.remotos.has(id)) this.cano.enviar(TIPO.EVENTO, { tipo: 'chefe', para: id, qual });
    if (ids.has(this.eu)) this.game.premiarChefe(qual);
  }

  /** `Game.onEnterArena`: atravessei a névoa. O simulador acorda o Carrasco (o daqui, ou o de lá, que me vê na arena). */
  aoEntrarNaArena() {
    if (this.souSim && !this.game.boss.defeated) this.game.boss.wake();
  }

  /** Abri uma porta (`Game.interact`): ela é de todos, e quem manda nela é o simulador. */
  aoAbrirPorta(d) {
    if (this.souSim) return;
    const i = this.game.world.doors.indexOf(d);
    if (i < 0) return;
    this.pendentes.set(i, performance.now());
    this.cano.enviar(TIPO.ACAO, { tipo: 'porta', i });
  }

  receberAcao(c, de) {
    const g = this.game, quem = this.remotos.get(de);
    if (c.tipo === 'porta' && Number.isInteger(c.i) && quem) {
      const d = g.world.doors[c.i];
      if (d && !d.open && flatDist(d.pos, quem.pos) < 10) { g.world.openDoor(d); if (flatDist(d.pos, g.player.pos) < 25) g.sfx.door(); }
    }
  }

  /** Um projétil nasceu aqui: os outros desenham uma cópia que não fere. */
  aoProjetil(k, a) {
    if (this.estado !== 'ligado') return;
    this.cano.enviar(TIPO.EVENTO, { tipo: 'proj', k, pos: vet(a.pos), dir: vet(a.dir), vel: vet(a.vel),
      speed: a.speed, life: a.life, delay: a.delay, maxR: a.maxR, radius: a.radius });
  }

  receberEvento(c, de) {
    const g = this.game;
    if (c.tipo === 'proj') {
      if (de === this.eu) return;
      const pos = lerVet(c.pos);
      if (!pos || pos.distanceTo(g.player.pos) > 80) return;
      const num = (v, max, padrao) => (Number.isFinite(v) && v >= 0 && v <= max ? v : padrao);
      if (c.k === 'orb') { const dir = lerVet(c.dir); if (dir) g.projectiles.orb({ pos, dir, speed: num(c.speed, 40, 9), life: num(c.life, 10, 4), delay: num(c.delay, 3, 0), visual: true }); }
      else if (c.k === 'shock') g.projectiles.shock({ pos, maxR: num(c.maxR, 20, 6), speed: num(c.speed, 40, 10), visual: true });
      else if (c.k === 'bomb') { const vel = lerVet(c.vel); if (vel) g.projectiles.bomb({ pos, vel, damage: 0, radius: num(c.radius, 8, 2), visual: true }); }
      return;
    }
    // o resto só vale vindo de quem simula
    if (de !== this.simulador || this.souSim) return;
    if (c.tipo === 'almas' && Number.isFinite(c.n) && c.n > 0 && c.n <= 20000) {
      const e = g.all.find((x) => x.netId === c.id);
      if (e) g.effects.soulStream(e.pos.clone().setY(e.pos.y + (e.height ?? 1.8) * 0.5), e.isBoss ? 200 : 25);
      g.addSouls(c.n);
    } else if (c.tipo === 'queda' && typeof c.item === 'string' && ITEMS[c.item]?.type === 'consumable' && Number.isFinite(c.x) && Number.isFinite(c.z)) {
      const lim = g.world.limites();
      if (c.x > lim.minX && c.x < lim.maxX && c.z > lim.minZ && c.z < lim.maxZ) g.world.addPickup(c.item, 1, { x: c.x, z: c.z }, false);
    } else if (c.tipo === 'chefe' && CHEFES[c.qual]) {
      g.premiarChefe(c.qual);
    }
  }
}
