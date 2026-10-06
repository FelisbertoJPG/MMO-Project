import * as THREE from 'three';
import { Assets } from './assets.js';
import { initGear } from './gear.js';
import { Ceu } from './ceu.js';
import { EditorDeAparencia } from './aparencia.js';
import { assarRefeicoes } from './refeicao.js';
import { Input } from './input.js';
import { Sfx } from './audio.js';
import { World, START_POS, SAQUES, horaDoMundo } from './world.js';
import { Effects, Projectiles, flatDist, yawTo } from './combat.js';
import { Player } from './player.js';
import { Monitor } from './monitor.js';
import { spawnEnemies } from './enemies.js';
import { Boss } from './boss.js';
import { Dragao } from './dragao.js';
import { Inventory } from './inventory.js';
import { UI } from './ui.js';
import { ITEMS } from './items.js';
import { lerProgresso, salvarProgresso, aplicarProgresso, apagarProgresso, fichaAtual } from './save.js';
import { Online } from './rede/online.js';
import { MAX_LETRAS } from './rede/mensagens.js';
import { SalaUI } from './salaui.js';
import { ControlesToque, ehToque } from './toque.js';
import { Provador } from './provador.js';
import { Capim } from './capim.js';
import { Graficos, qualidadeSalva } from './graficos.js';
import { receitaDaMistura, NA_PANELA } from './receitas.js';
import { REGRAS } from './modo.js';
import { Mundo, CHEFES } from './rede/mundo.js';
import { tokenValido } from './rede/supabase.js';
import { MUNDO_PADRAO, detectarHospedagem, temSaveEmArquivo, serveOMundo } from './hospedagem.js';
import { vigiarVersao, notaDaAtualizacao } from './versao.js';

/** Onde fica guardado o endereço do servidor de mundo escolhido na tela inicial ('' = o deste jogo). */
const CHAVE_ENDERECO = 'masmorra:mundo';

class Game {
  constructor() {
    const container = document.getElementById('game');
    // A qualidade gráfica (js/graficos.js) vem antes do renderizador: o
    // antisserrilhado só se escolhe ao criar o contexto WebGL.
    this.graficos = new Graficos(this, qualidadeSalva(ehToque()));
    this.renderer = new THREE.WebGLRenderer({ antialias: Graficos.antialias(this.graficos.nome), powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 300);
    this.clock = new THREE.Clock();
    this.time = 0;
    this.hitstop = 0;
    this.shake = 0;
    this.state = 'loading';
    this.menu = null;
    this.bossFight = false;
    this.fogueirasAcesas = new Set();   // ids das fogueiras em que já se descansou
    // 'offline' = a Jornada de sempre (acorda na cela, save local, sala com amigo);
    // 'mmo' = o Mundo online (um mapa para todos, o personagem no servidor).
    // Quem escolhe é o botão da tela de título; o que muda está em `js/modo.js`.
    this.modo = 'offline';
    this.timers = [];
    this.sfx = new Sfx();
    this.input = new Input(this.renderer.domElement);
    addEventListener('resize', () => this.onResize());
    this.load();
  }

  async load() {
    const fill = document.querySelector('.load-fill'), text = document.querySelector('.load-text');
    try {
      await Assets.load((k) => { fill.style.width = `${Math.round(k * 100)}%`; });
    } catch (e) {
      text.textContent = 'Erro ao carregar modelos: ' + e.message;
      throw e;
    }
    // o CÉU antes de tudo: o reflexo dele é o mapa de ambiente das armas e do mundo, e tem
    // de existir antes da primeira compilação dos shaders (senão recompila no meio do jogo)
    this.ceu = new Ceu(this);
    initGear(this.renderer, this.ceu.reflexo);
    assarRefeicoes();   // as animações de comer e beber (refeicao.js), antes de qualquer boneco
    this.world = new World(this);
    this.capim = new Capim(this);   // as graminhas que balançam com o vento (capim.js)
    this.effects = new Effects(this);
    this.projectiles = new Projectiles(this);
    this.ui = new UI(this);
    this.provador = new Provador(this);   // Shift+G: os corpos do jogador (guerreiro.js)
    this.editorAparencia = new EditorDeAparencia(this);   // o rosto e o cabelo (pausa → Aparência)
    this.inventory = new Inventory(this);
    this.player = new Player(this);
    this.enemies = spawnEnemies(this);
    this.boss = new Boss(this);
    this.dragao = new Dragao(this);   // o chefe secreto do terraço
    this.bossAtual = null;            // de quem é a barra de chefe (null = o Carrasco)
    this.all = [...this.enemies, this.boss, this.dragao];
    // ---- O terreno do co-op (níveis 2 e 3 do online) ----
    // `jogadores`: quem os inimigos podem perseguir e os projéteis atingir. Hoje
    // só o local; no co-op entra o `JogadorRemoto` sólido do outro (ver remoto.js).
    this.jogadores = [this.player];
    // `netId`: o nome estável de cada inimigo, para o anfitrião dizer ao
    // convidado "o inimigo e7 está ali" (TIPO.MUNDO em rede/protocolo.js).
    this.enemies.forEach((e, i) => { e.netId = `e${i}`; });
    this.boss.netId = 'carrasco';
    this.dragao.netId = 'wyrm';
    this.contLacaios = 0;
    // `sessao`: a partida compartilhada (co-op/PvP). null = sozinho.
    this.sessao = null;
    this.online = new Online(this);
    this.salaUI = new SalaUI(this);
    // celular: joystick, botões na tela e a tela deitada (js/toque.js)
    if (ehToque()) this.toque = new ControlesToque(this);
    this.player.startInCell();
    this.bindUI();
    this.onResize();
    // Aplica a qualidade gráfica e COMPILA todos os shaders agora, na tela de
    // carregamento — compilar na hora em que algo aparece era um engasgo.
    this.graficos.aplicar();
    this.marcarGraficos();
    this.monitor = new Monitor(this);   // o monitor de desempenho (F3; monitor.js)
    // A conta guardada reabre sozinha; sem rede em 6 s, segue offline.
    await Promise.race([this.online.iniciar(), new Promise((ok) => setTimeout(ok, 6000))]);
    // Há um servidor nosso por trás da página, ou só arquivos (GitHub Pages)? Decide onde o save mora.
    await detectarHospedagem();
    document.getElementById('loading').classList.add('hidden');
    await this.prepararTitulo();
    this.state = 'title';
    this.renderer.setAnimationLoop(() => this.loop());
    // quando sai uma versão nova, as páginas abertas salvam e recarregam sozinhas (js/versao.js)
    vigiarVersao(this);
    const nota = notaDaAtualizacao();
    if (nota) { const el = document.getElementById('aviso-versao'); el.textContent = `Jogo atualizado: ${nota}.`; el.classList.remove('hidden'); }
  }

  /** As regras do modo de jogo (`js/modo.js`): o código pergunta por elas, não pelo modo. */
  get regras() { return REGRAS[this.modo]; }

  /** Tudo que o jogador pode travar a mira e golpear: os inimigos, e o rival no duelo. */
  allEnemies() {
    const rival = this.sessao?.rival;
    return rival ? [...this.all, rival] : this.all;
  }

  /**
   * O duelo acontece num mundo vazio: os inimigos somem e param (`active = false`
   * já faz o `update` deles não fazer nada). Ao voltar, `resetWorld` põe cada um
   * de pé no lugar dele — inclusive o Carrasco e o dragão, que respeitam `defeated`.
   */
  esconderMundo(sim) {
    this.mundoEscondido = sim;
    this.projectiles.clear();
    if (sim) {
      for (const e of this.all) { e.active = false; (e.model?.root ?? e.root).visible = false; }
      this.player.lockTarget = null;
    } else {
      this.resetWorld();
    }
  }

  /**
   * O jogador que um inimigo em `pos` deve perseguir: o vivo mais perto. Fica
   * com o `atual` se ele não estiver bem mais longe que o novo (3 m de folga),
   * para o inimigo não ficar trocando de alvo a cada passo de dois jogadores.
   */
  alvoPara(pos, atual = null, pode = () => true) {
    let melhor = null, dMelhor = Infinity;
    for (const j of this.jogadores) {
      if (j.dead || !pode(j)) continue;
      const d = flatDist(j.pos, pos);
      if (d < dMelhor) { melhor = j; dMelhor = d; }
    }
    if (atual && !atual.dead && pode(atual) && this.jogadores.includes(atual) && flatDist(atual.pos, pos) < dMelhor + 3) return atual;
    return melhor ?? this.player;
  }

  /**
   * TODO golpe do jogador num inimigo passa por aqui (espada, bomba). Sozinho,
   * aplica direto. No co-op, o CONVIDADO não simula os inimigos: este é o
   * ponto em que o golpe vira um recado `TIPO.GOLPE` para o anfitrião aplicar.
   */
  golpear(alvo, dano, origem, poise, opts) {
    if (this.sessao?.golpear) return this.sessao.golpear(alvo, dano, origem, poise, opts);
    return alvo.takeDamage(dano, origem, poise, opts);
  }

  // Temporizador em tempo de jogo (respeita pausa e hitstop)
  after(sec, fn) { this.timers.push({ t: this.time + sec, fn }); }

  runTimers() {
    const due = this.timers.filter((x) => x.t <= this.time);
    if (!due.length) return;
    this.timers = this.timers.filter((x) => x.t > this.time);
    for (const x of due) x.fn();
  }

  bindUI() {
    document.getElementById('start-btn').addEventListener('click', (ev) => {
      // Com progresso salvo, o primeiro clique só pergunta: começar do zero o apaga
      if (this.progresso && !this.confirmouNovo) {
        this.confirmouNovo = true;
        ev.currentTarget.textContent = 'Apagar o progresso e começar do zero?';
        return;
      }
      if (this.progresso) { apagarProgresso(this.online); this.progresso = null; }
      this.start();
    });
    document.getElementById('continue-btn').addEventListener('click', () => this.continuar());
    this.bindMundo();
    this.bindConta();
    this.bindEscrita();
    // Grava sozinho de tempos em tempos e ao fechar a janela
    setInterval(() => { if (!this.menu) this.salvar(); }, 15000);
    addEventListener('pagehide', () => this.salvar({ aoSair: true }));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.salvar({ aoSair: true }); });
    document.getElementById('resume-btn').addEventListener('click', () => this.closeMenu());
    document.getElementById('aparencia-btn').addEventListener('click', () => { this.closeMenu(); this.openMenu('aparencia'); });
    document.getElementById('monitor-btn').addEventListener('click', () => this.monitor?.alternar());
    document.getElementById('bf-leave').addEventListener('click', () => this.closeMenu());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.menu && !this.input.locked) this.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (this.input.locked || this.state !== 'playing' || this.menu) return;
      if (this.provador.aberto) return;   // o provador soltou o mouse para os cliques
      // Esc com o chat aberto: o navegador solta o mouse antes de a tecla chegar à
      // caixa — é "desistir de escrever", não "pausar"
      if (this.online.chat?.escrevendo) { this.online.chat.fecharEscrita(); return; }
      this.openMenu('pause');
    });
  }

  /**
   * Quebrei um barril/caixote/saco (golpe ou bomba): estoura em pedaços, pode
   * cair um item (a tabela `SAQUES` do world.js) e — no Mundo online — o
   * quebrado vira de todos (`sessao.aoQuebrar`). O que cai é de quem quebrou.
   */
  quebrar(q, origem) {
    if (!this.world.quebrar(q, { origem })) return;
    const tabela = SAQUES[q.cfg.saque];
    if (tabela) {
      let r = Math.random() * tabela.reduce((t, [, peso]) => t + peso, 0), item = null;
      for (const [id, peso] of tabela) { r -= peso; if (r <= 0) { item = id; break; } }
      if (item) this.world.addPickup(item, 1, { x: q.pos.x + (Math.random() - 0.5) * 0.6, z: q.pos.z + (Math.random() - 0.5) * 0.6 }, false);
    }
    if (!q.cfg.local) this.sessao?.aoQuebrar?.(q);   // a vegetação é de cada um
  }

  /**
   * Cozinha a MISTURA que está na panela (até `NA_PANELA` ingredientes, sem
   * ordem). Bateu com uma receita: sai a comida e a receita fica conhecida.
   * Não bateu: sai uma gororoba. Os ingredientes se gastam nos dois casos.
   * Devolve `{receita, nova}` (receita null = gororoba). O minigame entra aqui depois.
   */
  cozinhar(ids) {
    const inv = this.inventory, p = this.player;
    if (!ids?.length || ids.length > NA_PANELA) return null;
    const conta = {};
    for (const id of ids) conta[id] = (conta[id] ?? 0) + 1;
    if (!Object.entries(conta).every(([id, n]) => ITEMS[id]?.type === 'ingrediente' && inv.count(id) >= n)) return null;
    for (const [id, n] of Object.entries(conta)) inv.remove(id, n);
    const receita = receitaDaMistura(ids);
    if (!receita) { inv.add('gororoba', 1); this.sfx.cozinhar(); return { receita: null, nova: false }; }
    const nova = !p.receitas.has(receita.id);
    p.receitas.add(receita.id);
    inv.add(receita.resultado, receita.qtd);
    this.sfx.cozinhar();
    if (nova) this.ui.centerMessage(`RECEITA DESCOBERTA: ${ITEMS[receita.resultado].name.toUpperCase()}`, 'info', 3200);
    return { receita, nova };
  }

  /** Destaca, no menu de pausa, a qualidade gráfica em uso. */
  marcarGraficos() {
    for (const b of document.querySelectorAll('#graficos-opcoes button')) b.classList.toggle('ativo', b.dataset.q === this.graficos.nome);
  }

  /** Grava o progresso (ver `save.js`): `{aoSair}` = a página está fechando; `{nuvem}` = já, na nuvem. */
  salvar(opts) { return salvarProgresso(this, opts); }

  // ---------- Tela de título: conta e progresso ----------
  /** Lê o progresso DE QUEM ESTÁ JOGANDO e arruma os botões e a linha da conta. */
  async prepararTitulo() {
    const contBt = document.getElementById('continue-btn'), novoBt = document.getElementById('start-btn');
    contBt.classList.add('hidden');
    novoBt.disabled = true;
    this.progresso = await lerProgresso(this.online);
    this.confirmouNovo = false;
    novoBt.disabled = false;
    novoBt.textContent = this.progresso ? 'Novo Jogo' : 'Iniciar Jornada';
    if (this.progresso) {
      const d = this.progresso.dados;
      const quando = new Date(d.salvoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      const de = this.progresso.origem === 'adotado' ? ' · deste computador' : this.progresso.origem === 'nuvem' ? ' · da nuvem' : '';
      contBt.innerHTML = `Continuar <small>nível ${d.jogador.nivel} · ${quando}${de}</small>`;
      contBt.classList.remove('hidden');
    }
    document.getElementById('jornada-dica').innerHTML = temSaveEmArquivo()
      ? 'O seu mundo, no seu ritmo. O progresso fica neste computador. Chame um amigo pela tecla <b>O</b>.'
      : 'O seu mundo, no seu ritmo. O progresso fica neste navegador — e na sua conta, se entrar com uma.';
    this.mostrarConta();
    this.prepararMundo();
  }

  // ---------- Tela de título: o MUNDO ONLINE ----------

  /**
   * O endereço do servidor de mundo. '' = o mesmo que serve este jogo — ou, num
   * host só de arquivos sem `MUNDO_PADRAO`, que ainda NÃO HÁ servidor (`haMundo`).
   * O que o jogador escolheu em "trocar" vence os dois.
   */
  enderecoDoMundo() {
    let escolhido = '';
    try { escolhido = (localStorage.getItem(CHAVE_ENDERECO) ?? '').replace(/\/+$/, ''); } catch { }
    return escolhido || (serveOMundo() ? '' : MUNDO_PADRAO.replace(/\/+$/, ''));
  }

  /** Há algum servidor de mundo para procurar? */
  haMundo() { return serveOMundo() || !!this.enderecoDoMundo(); }

  /**
   * De onde vem o token da conta para entrar no mundo. `?teste=<Nome>` na URL é
   * o atalho de duas janelas na mesma máquina — só vale num servidor subido com
   * `MUNDO_AUTH=teste` (os outros o recusam).
   */
  tokenDoMundo() {
    const teste = new URLSearchParams(location.search).get('teste');
    return teste ? async () => `teste:${teste}` : tokenValido;
  }

  /** A linha de estado do bloco "Mundo online": quem está lá, ou por que não dá para entrar. */
  async prepararMundo() {
    const bt = document.getElementById('mmo-btn'), st = document.getElementById('mmo-status');
    const base = this.enderecoDoMundo();
    document.getElementById('mmo-onde').textContent = base || (temSaveEmArquivo() ? 'este computador' : serveOMundo() ? 'este endereço' : 'nenhum ainda');
    bt.disabled = true;
    if (!this.haMundo()) { st.textContent = 'o servidor do mundo ainda não está no ar'; return; }
    st.textContent = 'procurando o servidor…';
    // Um servidor em plataforma grátis DORME sem visita e leva perto de um minuto
    // para acordar: em vez de desistir no primeiro silêncio, insiste e diz o que
    // está esperando. (O desta própria máquina responde na hora ou não está.)
    const vez = this.buscaDoMundo = (this.buscaDoMundo ?? 0) + 1;
    const velha = () => vez !== this.buscaDoMundo || (this.state !== 'title' && this.state !== 'loading');
    const prazo = Date.now() + (base ? 100_000 : 5_000);
    let info = null;
    for (let i = 0; !info; i++) {
      info = await Mundo.info(base, i ? 15_000 : 5_000);
      if (velha()) return;
      if (info || Date.now() >= prazo) break;
      st.textContent = 'acordando o servidor do mundo… (pode levar um minuto)';
      await new Promise((ok) => setTimeout(ok, 3000));
      if (velha()) return;
    }
    const teste = new URLSearchParams(location.search).has('teste');
    if (!info) {
      st.innerHTML = 'o servidor do mundo não respondeu · <a href="#" id="mmo-denovo">tentar de novo</a>';
      document.getElementById('mmo-denovo').addEventListener('click', (e) => { e.preventDefault(); this.prepararMundo(); });
      return;
    }
    if (info.mapa && info.mapa !== Assets.mapaNome) { st.textContent = `o servidor está em outro mapa (${info.mapa})`; return; }
    const quantos = info.jogadores === 1 ? '1 jogador no mundo agora' : `${info.jogadores} jogadores no mundo agora`;
    if (!this.online.ativo && !teste) {
      // logado, mas a conta não entrou na Masmorra (Supabase fora, schema não exposto…):
      // pedir "entre com uma conta" a quem já entrou só confunde
      const o = this.online;
      st.textContent = o.estado === 'deslogado' ? `${quantos} · entre com uma conta para jogar online`
        : `${quantos} · a sua conta não pôde entrar: ${o.motivo || 'tente de novo'}`;
      return;
    }
    st.textContent = info.jogadores >= info.max ? 'o mundo está cheio' : quantos;
    bt.disabled = info.jogadores >= info.max;
  }

  bindMundo() {
    const $ = (id) => document.getElementById(id);
    $('mmo-btn').addEventListener('click', () => this.entrarNoMundo());
    $('mmo-trocar').addEventListener('click', (e) => {
      e.preventDefault();
      $('mmo-form').classList.toggle('hidden');
      $('mmo-endereco').value = this.enderecoDoMundo();
      $('mmo-endereco').focus();
    });
    $('mmo-form').addEventListener('submit', (e) => {
      e.preventDefault();
      let v = $('mmo-endereco').value.trim().replace(/\/+$/, '');
      if (v && !/^https?:\/\//i.test(v)) v = `${location.protocol === 'https:' ? 'https' : 'http'}://${v}`;
      // página https não fala com servidor http: o navegador bloqueia sem dizer por quê
      if (location.protocol === 'https:' && /^http:\/\//i.test(v)) { $('mmo-status').textContent = 'esta página é https: o servidor do mundo também precisa ser https'; return; }
      try { if (v) localStorage.setItem(CHAVE_ENDERECO, v); else localStorage.removeItem(CHAVE_ENDERECO); } catch { }
      $('mmo-form').classList.add('hidden');
      this.prepararMundo();
    });
    $('sair-mundo-btn').addEventListener('click', () => this.voltarAoInicio());
    for (const b of document.querySelectorAll('#graficos-opcoes button')) {
      b.addEventListener('click', () => { this.graficos.trocar(b.dataset.q); this.marcarGraficos(); });
    }
  }

  /**
   * Entra no MUNDO ONLINE: o servidor confere a conta e devolve o personagem
   * (ou nada, se é a primeira vez — aí ele nasce no acampamento, com a adaga).
   */
  async entrarNoMundo() {
    if (this.state !== 'title' || this.entrando) return;
    const bt = document.getElementById('mmo-btn'), st = document.getElementById('mmo-status');
    this.entrando = true;
    bt.disabled = true;
    st.textContent = 'entrando no mundo…';
    const r = await Mundo.entrar(this, { base: this.enderecoDoMundo(), obterToken: this.tokenDoMundo() });
    this.entrando = false;
    if (!r.ok) { bt.disabled = false; st.textContent = r.error; return; }
    this.modo = 'mmo';
    this.sessao = r.mundo;
    // personagem de outra ficha (ficha.js) recomeça do zero: é o reset de todos
    const salvo = fichaAtual(r.mundo.personagem);
    if (salvo) aplicarProgresso(this, salvo);
    this.world.destrancarCela();   // no mundo de todos ninguém acorda preso
    this.entrarNoJogo();
    this.online.comecarPartida();
    if (salvo) { this.snapCamera(); this.ui.centerMessage('Mundo online', 'info', 3000); }
    else this.comecarFora();
    document.getElementById('sair-mundo-btn').textContent = 'Sair do mundo';
    r.mundo.ligar();
    this.salvar({ nuvem: true });   // o personagem novo já fica guardado
  }

  /**
   * "Sair para a tela inicial" (menu de pausa, nos dois modos; no MMO o botão
   * diz "Sair do mundo"): grava, sai da sala ou do mundo e recarrega a página,
   * que abre na tela inicial. Refazer o mundo local à mão seria refazer o
   * carregamento inteiro. No duelo e no mundo de outro jogador o save não grava
   * (`salvarProgresso` recusa) — vale o que estava antes, como deve ser.
   */
  async voltarAoInicio() {
    if (this.saindo) return;
    this.saindo = true;
    await this.salvar({ nuvem: true });
    this.sessao?.sair();
    location.reload();
  }

  /** O servidor encerrou a sessão (a conta entrou em outro lugar): avisa e volta à tela inicial. */
  aoCairDoMundo(motivo) {
    this.ui.centerMessage('DESCONECTADO', 'died', 4500);
    this.ui.toast(motivo);
    setTimeout(() => location.reload(), 4500);
  }

  /**
   * A PORTA DE ENTRADA (03/10/2026). Sem conta: e-mail e senha, "Criar conta" e
   * "Jogar Offline" — que abre só o quadro da Jornada (`escolheuOffline`). Logado:
   * os dois quadros, com o Mundo online na frente.
   */
  mostrarConta() {
    const o = this.online, st = document.getElementById('conta-status'), modos = document.getElementById('modos');
    document.getElementById('conta').classList.remove('hidden');
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    // `?teste=Nome` (as duas janelas do teste local, sem conta) conta como logado
    const logado = o.estado !== 'deslogado' || new URLSearchParams(location.search).has('teste');
    modos.classList.toggle('online', logado);
    modos.classList.toggle('offline', !logado);
    if (!logado && !this.escolheuOffline) {
      // a porta: só o formulário
      modos.classList.add('hidden');
      st.innerHTML = o.motivo ? `<small>${esc(o.motivo)}</small>` : '';
      this.abrirFormConta(this.criandoConta);
      return;
    }
    modos.classList.remove('hidden');
    document.getElementById('conta-form').classList.add('hidden');
    if (o.estado === 'deslogado') st.innerHTML = `Jogando offline · <a id="conta-abrir">Entrar ou criar conta</a>`;
    else if (o.estado === 'logado') st.innerHTML = `Conectado como <b>${esc(o.nome)}</b> · <a id="conta-sair">Sair</a>`;
    else st.innerHTML = `<b>${esc(o.nome)}</b> · ${esc(o.motivo)} · <a id="conta-sair">Sair</a>`;
    document.getElementById('conta-abrir')?.addEventListener('click', (e) => { e.preventDefault(); this.escolheuOffline = false; this.mostrarConta(); });
    document.getElementById('conta-sair')?.addEventListener('click', async (e) => {
      e.preventDefault();
      await this.online.sair();
      await this.prepararTitulo();
    });
  }

  abrirFormConta(criar = false) {
    this.criandoConta = criar;
    document.getElementById('conta-form').classList.remove('hidden');
    document.getElementById('conta-nome').classList.toggle('hidden', !criar);
    // criando: o botão principal cria, e o outro volta para "entrar"
    document.getElementById('conta-ok').textContent = criar ? 'Criar conta' : 'Entrar';
    document.getElementById('conta-criar').textContent = criar ? 'Já tenho conta' : 'Criar conta';
    document.getElementById('conta-senha').autocomplete = criar ? 'new-password' : 'current-password';
    document.getElementById('conta-erro').textContent = '';
    if (!ehToque()) document.getElementById(criar ? 'conta-nome' : 'conta-email').focus();
  }

  bindConta() {
    const $ = (id) => document.getElementById(id);
    $('conta-criar').addEventListener('click', () => this.abrirFormConta(!this.criandoConta));
    $('jogar-offline').addEventListener('click', () => { this.escolheuOffline = true; this.mostrarConta(); });
    $('conta-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('conta-email').value.trim(), senha = $('conta-senha').value, nome = $('conta-nome').value.trim();
      const erro = $('conta-erro');
      if (!email || !senha) { erro.textContent = 'preencha e-mail e senha'; return; }
      if (this.criandoConta && nome.length < 3) { erro.textContent = 'o nome precisa ter pelo menos 3 letras'; return; }
      $('conta-ok').disabled = true;
      erro.textContent = this.criandoConta ? 'criando…' : 'entrando…';
      const r = this.criandoConta ? await this.online.cadastrar(email, senha, nome) : await this.online.entrar(email, senha);
      $('conta-ok').disabled = false;
      if (!r.ok) { erro.textContent = r.error; return; }
      if (r.precisaConfirmar) {
        this.abrirFormConta(false);
        $('conta-erro').textContent = 'conta criada! confirme pelo link no seu e-mail e depois entre aqui.';
        return;
      }
      $('conta-senha').value = '';
      this.criandoConta = false;
      await this.prepararTitulo();
    });
  }

  // ---------- Mensagens no chão (online) ----------
  bindEscrita() {
    const $ = (id) => document.getElementById(id);
    const texto = $('msg-texto');
    texto.addEventListener('input', () => { $('msg-contador').textContent = `${texto.value.length} / ${MAX_LETRAS}`; });
    // O Input do jogo ignora o que se digita aqui, então Esc e Enter são tratados na própria caixa
    texto.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeMenu();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('msg-gravar').click(); }
    });
    $('msg-cancelar').addEventListener('click', () => this.closeMenu());
    $('msg-gravar').addEventListener('click', async () => {
      const m = this.online.mensagens;
      if (!m) return;
      $('msg-gravar').disabled = true;
      $('msg-erro').textContent = 'gravando…';
      const r = await m.escrever(texto.value);
      $('msg-gravar').disabled = false;
      if (!r.ok) { $('msg-erro').textContent = r.error; return; }
      texto.value = '';
      this.closeMenu();
      this.ui.toast('Sua mensagem ficou gravada no chão.');
    });
  }

  /** Leitura de mensagem de outro jogador: vota (1/2) ou apaga a sua (X). */
  async votarNaMensagem(it, acao) {
    const m = this.online.mensagens;
    if (!m) return;
    const r = acao === 'apagar' ? await m.apagar(it) : await m.avaliar(it, acao);
    if (!r.ok) { if (r.error) this.ui.toast(r.error); return; }
    if (acao === 'apagar') { this.ui.hideReader(); this.ui.toast('Mensagem apagada.'); return; }
    this.ui.showReader(it.text, { autor: it.autor, nota: it.nota, minha: it.minha, voto: m.meuVoto(it) });
  }

  entrarNoJogo() {
    document.activeElement?.blur(); // o Espaço não pode "clicar" o botão de novo
    this.sfx.init();
    document.getElementById('title-screen').classList.add('hidden');
    this.ui.show();
    this.state = 'playing';
    this.input.requestLock();
  }

  /** Volta de onde parou: o mundo como estava, o jogador se levantando. */
  continuar() {
    if (this.state !== 'title' || !this.progresso) return;
    aplicarProgresso(this, this.progresso.dados);
    this.entrarNoJogo();
    this.online.comecarPartida();
    // O save sem conta passou a ser da conta: grava já com o dono novo
    if (this.progresso.origem === 'adotado') { this.salvar({ nuvem: true }); this.ui.toast('O progresso deste computador agora é da sua conta.'); }
    this.snapCamera();
    this.ui.centerMessage('Masmorra dos Esquecidos', 'info', 3000);
    // Salvo antes de a chave cair (os primeiros segundos): ela cai agora, se ainda faz falta
    const celaTrancada = this.world.doors.some((d) => d.locked && !d.open);
    if (!this.world.chaveCaiu && celaTrancada && !this.inventory.count('cellKey')) this.after(2.5, () => { this.world.dropKey(); this.ui.toast('Algo caiu pela grade do teto...'); });
  }

  start() {
    if (this.state !== 'title') return;
    this.entrarNoJogo();
    this.online.comecarPartida();
    const p = this.player;
    p.setState('standing', { dur: 2.4 });
    p.model.play('LayToIdle', { loop: false, fade: 0.2, duration: 2.4, restart: true });
    this.snapCamera();
    this.ui.centerMessage('Masmorra dos Esquecidos', 'info', 3000);
    // Alguém lá em cima joga a chave pela grade do teto
    this.after(4.2, () => { this.world.dropKey(); this.ui.toast('Algo caiu pela grade do teto...'); });
  }

  /**
   * Personagem novo no MUNDO ONLINE: acorda no acampamento, do lado de fora, já
   * com a adaga na mão. A cela não é dele: a porta de lá nasce aberta e a chave
   * não cai (ninguém acorda preso).
   */
  comecarFora() {
    this.inventory.add('dagger', 1, true);   // a primeira arma já entra equipada
    this.inventory.add('paoDuro', 3, true);  // e um pouco de comida: a cura agora é comida (sem Estus)
    this.world.destrancarCela();
    this.player.startOutside();
    this.snapCamera();
    this.ui.centerMessage('Acampamento dos Recém-chegados', 'info', 3000);
    // o personagem NOVO escolhe o rosto antes de sair andando
    this.after(1.2, () => { if (!this.menu) this.openMenu('aparencia'); });
  }

  // ---------- Menus ----------
  /**
   * As COORDENADAS no menu de pausa: x y z em metros (y = altura do pé) e a célula do
   * mapa [linha, coluna] — para o jogador dizer "em x y z tem um bug". Clicar copia.
   */
  mostrarCoordenadas() {
    const p = this.player.pos, [lin, col] = this.world.cellOf(p);
    const h = horaDoMundo(), hora = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;
    const texto = `x ${p.x.toFixed(1)}  y ${p.y.toFixed(1)}  z ${p.z.toFixed(1)}  ·  célula [${lin}, ${col}]  ·  ${hora}`;
    const el = document.getElementById('coordenadas');
    el.textContent = texto;
    el.onclick = () => { navigator.clipboard?.writeText(texto).then(() => this.ui.toast('Coordenadas copiadas.'), () => {}); };
  }

  openMenu(kind) {
    this.menu = kind;
    this.input.clearAll();
    if (kind === 'inventory') this.inventory.open();
    if (kind === 'bonfire') this.ui.openBonfire();
    if (kind === 'pause') { this.mostrarCoordenadas(); document.getElementById('pause').classList.remove('hidden'); }
    if (kind === 'sala') this.salaUI.abrir();
    if (kind === 'aparencia') this.editorAparencia.abrir();
    if (kind === 'escrever') {
      document.getElementById('msg-writer').classList.remove('hidden');
      document.getElementById('msg-erro').textContent = '';
      setTimeout(() => document.getElementById('msg-texto').focus(), 0);
    }
    this.input.exitLock();
  }

  closeMenu() {
    if (this.menu === 'inventory') this.inventory.close();
    if (this.menu === 'bonfire') {
      this.ui.closeBonfire();
      this.salvar({ nuvem: true });   // grava os níveis comprados na fogueira
      this.player.setState('restUp', { dur: 1.1 });
      this.player.model.play(this.player.idleAnim, { fade: 0.6 });
    }
    if (this.menu === 'pause') document.getElementById('pause').classList.add('hidden');
    if (this.menu === 'escrever') document.getElementById('msg-writer').classList.add('hidden');
    if (this.menu === 'sala') this.salaUI.fechar();
    if (this.menu === 'aparencia') { this.editorAparencia.fechar(); this.salvar({ nuvem: true }); }
    this.menu = null;
    document.activeElement?.blur();
    this.input.clearAll();
    this.input.requestLock();
  }

  // ---------- Eventos ----------
  addSouls(n) { this.player.souls += Math.round(n); this.sfx.souls(); }
  addShake(v) { this.shake = Math.max(this.shake, v); }

  onEnemyKilled(e) {
    if (this.player.lockTarget === e) this.player.lockTarget = null;
    // O que ele deixa cair é sorteado UMA vez (no mundo online, quem simula sorteia para todos).
    let queda = null;
    for (const [id, chance] of e.cfg.drops ?? []) if (Math.random() < chance) { queda = id; break; }
    // Mundo online: almas e espólio são de quem lutou ou estava perto (`Mundo.repartir`)
    // — e quem simula o inimigo pode estar do outro lado do mapa.
    const levo = this.sessao?.repartir ? this.sessao.repartir(e, queda) : true;
    if (levo && e.cfg.souls > 0) {
      this.effects.soulStream(e.pos.clone().setY(e.pos.y + e.height * 0.5), e.isBoss ? 200 : 25);
      this.addSouls(e.cfg.souls);
    }
    if (levo && queda) this.world.addPickup(queda, 1, e.pos.clone().add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)), false);
    this.sessao?.coop?.aoMatarInimigo(e);   // as almas também são do convidado
    if (e === this.dragao) this.onDragaoKilled();
    else if (e.isBoss) this.onBossKilled();
  }

  onDragaoKilled() {
    this.sfx.stopBossMusic();
    this.hitstop = 0.25;
    this.after(1.5, () => {
      // Mundo online: o prêmio é de quem lutou (`Mundo.aoVencerChefe` → `premiarChefe` em cada um)
      if (this.sessao?.aoVencerChefe) return this.sessao.aoVencerChefe(this.dragao);
      this.sessao?.coop?.aoVencerChefe('WYRM DAS CINZAS');
      this.bossFight = false;
      this.bossAtual = null;
      this.premiarChefe('wyrm');
    });
  }

  /** O que cabe a QUEM VENCEU um chefe: a festa, a alma dele, a vida cheia — e grava. */
  premiarChefe(qual) {
    const chefe = CHEFES[qual];
    this.sfx.victory();
    this.ui.centerMessage(chefe.titulo, 'victory', 5500);
    this.inventory.add(chefe.alma, 1);
    for (const id of chefe.armadura ?? []) if (!this.inventory.count(id)) this.inventory.add(id, 1);
    this.player.hp = this.player.maxHp;
    this.salvar({ nuvem: true });
  }

  /** O jogador pisou no terraço com o dragão dormindo (ver `Dragao.podeAcordar`). */
  onDragaoAcorda() {
    this.dragao.wake();
    // no mundo online, a barra e a música são de quem está NA luta (`Mundo.atualizarLuta`)
    if (!this.regras.lutaDoMundo) return;
    this.bossFight = true;
    this.bossAtual = this.dragao;
    this.sfx.startBossMusic();
  }

  /** Fim da luta com o dragão SEM vitória (morte, fogueira, teleporte): ele volta a dormir no ninho. */
  adormecerDragao() {
    this.dragao.sleep();
    if (this.bossAtual !== this.dragao) return;
    this.bossAtual = null;
    this.bossFight = false;
    this.sfx.stopBossMusic();
  }

  onBossKilled() {
    this.sfx.stopBossMusic();
    this.hitstop = 0.25;
    this.after(1.5, () => {
      this.world.openFog();
      if (this.sessao?.aoVencerChefe) return this.sessao.aoVencerChefe(this.boss);
      this.sessao?.coop?.aoVencerChefe('CARRASCO');
      this.bossFight = false;
      this.premiarChefe('carrasco');
    });
  }

  onEnterArena() {
    // mundo online: quem acorda o Carrasco é quem simula, e a luta é de quem está nela
    if (this.sessao?.aoEntrarNaArena) return this.sessao.aoEntrarNaArena();
    if (this.marionetes) return;
    this.bossFight = true;
    this.boss.wake();
    this.world.setBraziers(true);
    this.sfx.startBossMusic();
  }

  onTorchBurnedOut() {
    const inv = this.inventory;
    inv.torchTime = 0;
    inv.remove('torch');
    inv.equipped.left = inv.lastShield && inv.count(inv.lastShield) ? inv.lastShield : null;
    this.player.refreshEquipment();
    this.sfx.torchOut();
    this.effects.burst(this.player.model.handL.getWorldPosition(new THREE.Vector3()), { count: 20, color: [0.5, 0.5, 0.5], speed: 1.5, size: 0.12, life: 1, gravity: -1 });
    this.ui.toast('Sua tocha se apagou.');
  }

  onPlayerDeath() {
    // No duelo, morrer só perde o duelo: sem mancha, sem almas perdidas
    if (this.sessao?.duelo?.fase === 'luta') return this.sessao.perdi();
    // No mundo de outro, morrer só manda de volta para casa, sem perder nada
    if (this.sessao?.coop && !this.sessao.coop.dono) return this.sessao.morriComoConvidado();
    // O dono morreu: o convidado volta para o mundo dele, e a morte segue normal aqui
    if (this.sessao?.coop) this.sessao.encerrarCoop('o dono do mundo morreu');
    this.deathPos = this.player.pos.clone();
    this.sfx.died();
    this.sfx.stopBossMusic();
    this.after(0.9, () => this.ui.centerMessage('VOCÊ MORREU', 'died', 4200));
    // Online: a mancha para os outros sai depois da queda, para o replay mostrá-la
    this.after(1.5, () => this.online.mortes?.registrar());
    this.after(5.6, () => this.respawnAfterDeath());
  }

  respawnAfterDeath() {
    this.world.setBloodstain(this.deathPos, this.player.souls);
    this.player.souls = 0;
    this.ui.displaySouls = 0;
    // no mundo de todos a minha morte não põe os inimigos dos outros de pé
    if (this.regras.mundoReinicia) this.resetWorld();
    this.player.respawn();
    this.snapCamera();
    this.salvar();
  }

  resetWorld() {
    for (const e of this.enemies) e.reset();
    this.adormecerDragao();
    if (!this.boss.defeated) {
      this.boss.sleep();
      this.bossFight = false;
      this.world.setBraziers(false);
      this.sfx.stopBossMusic();
    }
    this.projectiles.clear();
    this.world.restaurarQuebraveis();   // os barris voltam inteiros, como os inimigos
  }

  /** Descansa na fogueira `id`, que passa a ser o ponto de retorno. */
  rest(id) {
    this.sessao?.encerrarCoop?.('o dono do mundo descansou na fogueira');
    const p = this.player, fogueira = this.world.fogueira(id);
    p.fogueira = fogueira.id;
    p.lockTarget = null;
    p.facing = yawTo(p.pos, fogueira.pos);
    p.setState('rest');
    p.model.play('Crouch_Idle_Loop', { fade: 0.5 });
    p.hp = p.maxHp; p.stamina = p.maxStamina;
    p.buffs.resin = 0;
    // no mundo de todos o descanso é só meu: os inimigos renascem por tempo (`Mundo.tique`)
    if (this.regras.mundoReinicia) this.resetWorld();
    this.sfx.bonfire();
    if (!this.fogueirasAcesas.has(fogueira.id)) { this.fogueirasAcesas.add(fogueira.id); this.ui.centerMessage('FOGUEIRA ACESA', 'info', 2600); }
    this.salvar({ nuvem: true });
    this.after(1.1, () => { if (this.player.state === 'rest' && this.state === 'playing') this.openMenu('bonfire'); });
  }

  teleportHome() {
    if (this.sessao?.coop) return this.sessao.encerrarCoop(this.sessao.coop.dono ? 'o dono do mundo voltou à fogueira' : 'você voltou para casa');
    const p = this.player;
    // (no mundo online o chefe não é só meu: quem o põe para dormir é o simulador, quando a luta esvazia)
    if (this.regras.mundoReinicia) {
      if (this.bossAtual === this.dragao) this.adormecerDragao();
      if (this.bossFight) { this.boss.sleep(); this.bossFight = false; this.world.setBraziers(false); this.sfx.stopBossMusic(); }
    }
    const { pos, rumo } = this.world.retorno(p.fogueira, this.regras.espalharAoAcordar);
    p.pos.copy(pos);
    p.inArena = false; p.lockTarget = null;
    p.facing = rumo; p.camYaw = rumo;
    this.projectiles.clear();
    this.snapCamera();
    this.sfx.bonfire();
  }

  snapCamera() {
    const p = this.player;
    this.camera.position.set(p.pos.x - Math.sin(p.camYaw) * 5, p.pos.y + 3.5, p.pos.z - Math.cos(p.camYaw) * 5);
  }

  // ---------- Interação ----------
  nearestInteractable() {
    const p = this.player;
    let best = null, bestD = Infinity;
    for (const it of this.world.interactables) {
      if (it.type === 'fog' && p.inArena) continue;
      const d = flatDist(it.pos, p.pos);
      if (d < it.radius && d < bestD) { best = it; bestD = d; }
    }
    return best;
  }

  interact(it) {
    const p = this.player, world = this.world, inv = this.inventory;
    if (this.marionetes && this.regras.visitaSoAjuda && ['pickup', 'chest', 'torch', 'door', 'bonfire', 'bloodstain'].includes(it.type)) {
      this.ui.toast('No mundo de outro jogador, você só pode ajudar.');
      this.sfx.locked();
      return;
    }
    const face = yawTo(p.pos, it.pos);
    switch (it.type) {
      case 'bonfire': this.rest(it.fogueira); break;
      case 'message':
        this.lendo = it;
        this.ui.showReader(it.text, it.online ? { autor: it.autor, nota: it.nota, minha: it.minha, voto: this.online.mensagens?.meuVoto(it) ?? 0 } : null);
        this.readingAt = p.pos.clone();
        break;
      case 'outraMancha': this.online.mortes?.tocar(it); break;
      case 'pickup':
        p.startInteract('PickUp', () => {
          if (!world.pickups.includes(it)) return;
          inv.add(it.itemId, it.qty);
          world.removePickup(it);
          this.sfx.pickup();
          if (it.itemId === 'cellKey') this.ui.toast('Talvez abra a porta da cela...');
        }, { dur: 1.3, at: 0.45, face });   // abaixar, pegar e levantar (Farm_Harvest)
        break;
      case 'torch':
        if (inv.count('torch')) { this.ui.toast('Você só pode carregar uma tocha por vez.'); this.sfx.locked(); break; }
        p.startInteract('Interact', () => {
          world.takeTorch(it.torch);
          inv.add('torch', 1);
          if (inv.equipped.left && inv.equipped.left !== 'torch') inv.lastShield = inv.equipped.left;
          inv.equipped.left = 'torch';
          p.refreshEquipment();
          this.sfx.torchIgnite();
        }, { dur: 0.9, at: 0.5, face });
        break;
      case 'chest':
        p.startInteract('Interact', () => {
          world.openChest(it.chest);
          this.sfx.chest();
          this.after(0.7, () => { for (const [id, q] of it.chest.def.items) inv.add(id, q); });
        }, { dur: 1.1, at: 0.45, face });
        break;
      case 'door': {
        const d = it.door;
        if (d.locked && !inv.count(d.locked)) { this.sfx.locked(); this.ui.toast('Está trancada.'); break; }
        p.startInteract('Interact', () => {
          if (d.locked) { inv.remove(d.locked); this.ui.toast('A chave gira na fechadura.'); }
          world.openDoor(d);
          this.sessao?.aoAbrirPorta?.(d);   // mundo online: a porta é de todos
          this.sfx.door();
        }, { dur: 1.0, at: 0.5, face });
        break;
      }
      case 'fog':
        p.lockTarget = null;
        p.pos.x = THREE.MathUtils.clamp(p.pos.x, it.pos.x - 1, it.pos.x + 1);
        p.setState('fog');
        break;
      case 'bloodstain':
        this.addSouls(it.souls);
        this.effects.soulStream(it.pos.clone().setY(it.pos.y + 0.5), 30);
        world.clearBloodstain();
        break;
    }
  }

  separate() {
    const bodies = [this.player, ...this.all.filter((e) => e.active && !e.dead && e.state !== 'gone' && e.state !== 'dormant')];
    // os outros jogadores (o da sala; todos os do mundo online) são sólidos, mas quem os move é a rede
    for (const outro of this.sessao?.outros ?? []) if (!outro.dead) bodies.push(outro);
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        if (a.remoto && b.remoto) continue;
        // no ar = acima do chão DE ONDE ESTÁ (no andar de cima o chão é 6 m)
        if (this.world.acimaDoChao(a.pos) > 0.5 || this.world.acimaDoChao(b.pos) > 0.5) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius, d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2), push = min - d;
        let wa = b.radius / min, wb = a.radius / min;
        if (b.remoto) { wa = 1; wb = 0; } else if (a.remoto) { wa = 0; wb = 1; }
        a.pos.x -= (dx / d) * push * wa; a.pos.z -= (dz / d) * push * wa;
        b.pos.x += (dx / d) * push * wb; b.pos.z += (dz / d) * push * wb;
      }
    }
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.effects?.setScale(innerHeight, this.camera.fov);
  }

  // ---------- Loop ----------
  handleInput() {
    const inp = this.input, p = this.player;
    if (this.ui.readerOpen) {
      if (inp.pressed('KeyE') || (this.readingAt && flatDist(this.readingAt, p.pos) > 1.5)) this.ui.hideReader();
      else if (this.lendo?.online && this.lendo.minha && inp.pressed('KeyX')) this.votarNaMensagem(this.lendo, 'apagar');
      else if (this.lendo?.online && !this.lendo.minha && inp.pressed('Digit1')) this.votarNaMensagem(this.lendo, 1);
      else if (this.lendo?.online && !this.lendo.minha && inp.pressed('Digit2')) this.votarNaMensagem(this.lendo, -1);
      return;
    }
    if (inp.pressed('Enter') && this.online.chat) { this.online.chat.abrirEscrita(); return; }
    if (this.sessao?.convite && inp.pressed('KeyY')) this.sessao.responderConvite(true);
    if (this.sessao?.convite && inp.pressed('KeyN')) this.sessao.responderConvite(false);
    if (inp.pressed('KeyO') && !p.dead) { this.openMenu('sala'); return; }
    if (inp.pressed('KeyM') && p.state === 'free') {
      if (this.online.mensagens) { this.openMenu('escrever'); return; }
      this.ui.toast('Entre com uma conta (tela inicial) para deixar mensagens.');
    }
    if ((inp.pressed('KeyI') || inp.pressed('Tab')) && !p.dead) { this.openMenu('inventory'); return; }
    if (inp.pressed('KeyC') || inp.pressed('ArrowDown') || inp.wheel > 0) this.inventory.cycleQuick(1);
    if (inp.pressed('ArrowUp') || inp.wheel < 0) this.inventory.cycleQuick(-1);
    const it = p.state === 'free' ? this.nearestInteractable() : null;
    const label = it ? (it.type === 'torch' && this.inventory.count('torch') ? 'Pegar tocha (você já tem uma)' : it.label) : null;
    this.ui.setPrompt(label);
    if (it && inp.pressed('KeyE')) { this.interact(it); this.ui.setPrompt(null); }
  }

  handleMenuInput() {
    const inp = this.input;
    if (this.menu === 'inventory' && (inp.pressed('KeyI') || inp.pressed('Tab') || inp.pressed('Escape'))) this.closeMenu();
    else if ((this.menu === 'bonfire' || this.menu === 'pause' || this.menu === 'escrever' || this.menu === 'sala' || this.menu === 'aparencia') && inp.pressed('Escape')) this.closeMenu();
    else if (this.menu === 'sala' && inp.pressed('KeyO')) this.closeMenu();
  }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 1 / 20);

    if (this.state === 'title') {
      this.time += dt;
      // Câmera lenta sobre o prisioneiro deitado na cela
      const a = this.time * 0.15;
      this.camera.position.set(START_POS.x + Math.sin(a) * 3, 4.4, START_POS.z + Math.cos(a) * 3);
      this.camera.lookAt(START_POS.x, 0.3, START_POS.z);
      this.player.model.update(dt);
      this.world.update(dt, this.camera);
      this.effects.update(dt);
      this.toque?.update();
      this.renderer.render(this.scene, this.camera);
      this.input.endFrame();
      return;
    }

    // o MONITOR de desempenho (monitor.js, F3): cada `M.fase(nome)` fecha o tempo de CPU
    // gasto desde a marca anterior naquela fase
    const M = this.monitor;
    M?.inicio();
    // com alguém junto (na sala) ou no mundo de todos, abrir menu não para o tempo
    const congela = this.menu && this.regras.pausa && !this.sessao?.outros?.length;
    if (congela) {
      this.handleMenuInput();
      this.ui.setPrompt(null);
      M?.fase('entrada');
      this.player.model.update(dt);
      M?.fase('jogador');
    } else {
      if (this.menu) { this.handleMenuInput(); this.ui.setPrompt(null); } else this.handleInput();
      M?.fase('entrada');
      if (this.hitstop > 0) this.hitstop -= dt;
      else {
        this.time += dt;
        this.runTimers();
        this.player.update(dt);
        if (this.dragao.podeAcordar()) this.onDragaoAcorda();
        M?.fase('jogador');
        for (const e of [...this.all]) e.update(dt);
        M?.fase('inimigos');
        this.separate();
        for (const e of this.all) if (!e.dead && this.world.acimaDoChao(e.pos) <= 0.01 && e.state !== 'dormant') this.world.resolve(e.pos, e.radius);
        if (this.player.state !== 'fog') this.world.resolve(this.player.pos, this.player.radius);
        this.projectiles.update(dt);
        M?.fase('colisão');
      }
      this.effects.update(dt);
      M?.fase('efeitos');
      this.world.update(dt, this.camera);
      M?.fase('mundo');
      this.capim.update(dt);
      M?.fase('capim');
      this.player.updateCamera(dt, this.camera);
      M?.fase('câmera');
    }
    this.online.update(dt);
    this.sessao?.update(dt);
    this.salaUI.update();
    M?.fase('rede');

    if (this.shake > 0 && !this.menu) {
      const s = this.shake * 0.2;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    if (this.menu === 'aparencia') this.editorAparencia.camera(this.camera);   // a câmera no rosto
    this.toque?.update();
    this.graficos.update();
    this.ui.update(dt);
    this.input.endFrame();
    M?.fase('interface');
    this.renderer.render(this.scene, this.camera);
    M?.fase('render');
    M?.depoisDoRender();
    this.ceu?.depoisDoQuadro(dt);   // o reflexo de lente do sol e da lua (por cima do quadro)
    M?.fase('clarão');
    M?.fim();
  }
}

window.game = new Game();
