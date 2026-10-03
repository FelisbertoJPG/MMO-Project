/**
 * **O CELULAR** (03/10/2026) — os controles de toque e a tela deitada.
 *
 * O jogo não foi reescrito para o toque: estes botões APERTAM as mesmas teclas
 * e botões de mouse que o teclado (`Input.apertar`/`mouseApertar`), e o
 * joystick dá um eixo analógico (`Input.eixo`, lido em `Player.moveInput`).
 * Por isso o combate, o MMO, a sala e os menus funcionam aqui sem uma linha de
 * regra a mais — botão novo é uma linha na tabela `BOTOES`.
 *
 *   • metade ESQUERDA da tela: o joystick nasce onde o polegar encosta;
 *   • o resto da tela: arrastar gira a câmera;
 *   • canto de baixo à direita: os botões de combate (Atacar, Forte, Rolar —
 *     segurar corre —, Defender, Mira, Usar) e o "E" quando há o que interagir;
 *   • em cima, ao lado das almas: menu, inventário, grupo (sala), chat, escrever;
 *   • a cruz dos itens também se toca: embaixo troca o item, à esquerda acende
 *     ou guarda a tocha (por isso esses dois não têm botão próprio).
 *
 * **Tela deitada**: no primeiro toque o jogo pede tela cheia e trava na
 * horizontal (`screen.orientation.lock`, que só existe com tela cheia — o
 * Android aceita; o iPhone não tem nenhum dos dois). Em pé durante o jogo,
 * um aviso pede para girar o celular.
 *
 * O que abre o TECLADO do celular (chat, mensagem) é chamado direto no toque:
 * fora do gesto do dedo o navegador não deixa a caixa de texto ganhar o foco.
 */

/** É celular/tablet? (`?toque` na URL força, para testar no computador.) */
export function ehToque() {
  return new URLSearchParams(location.search).has('toque') || matchMedia('(pointer: coarse)').matches;
}

/** Quanto a câmera gira por pixel arrastado (o mouse do PC usa 1). */
const SENS_CAMERA = 2.4;
/** Raio do joystick, em pixels: o polegar a esta distância = velocidade cheia. */
const RAIO_JOY = 56;

// Os botões: `tecla` (código do teclado) ou `mouse` (0 = esquerdo, 2 = direito)
// ficam apertados enquanto o dedo estiver em cima; `acao` é chamada no toque.
const BOTOES = [
  // combate (canto de baixo à direita)
  { id: 'atacar', rotulo: 'Atacar', mouse: 0, lugar: 'combate' },
  { id: 'forte', rotulo: 'Forte', tecla: 'KeyF', lugar: 'combate' },
  { id: 'rolar', rotulo: 'Rolar', tecla: 'Space', lugar: 'combate' },
  { id: 'defender', rotulo: 'Defender', mouse: 2, lugar: 'combate' },
  { id: 'mira', rotulo: 'Mira', tecla: 'KeyQ', lugar: 'combate' },
  { id: 'usar', rotulo: 'Usar', tecla: 'KeyR', lugar: 'combate' },
  { id: 'interagir', rotulo: 'E', tecla: 'KeyE', lugar: 'combate' },
  // barra de cima
  { id: 'menu', rotulo: '☰', titulo: 'Menu', lugar: 'topo', acao: (g) => g.openMenu('pause') },
  { id: 'inventario', rotulo: 'Itens', tecla: 'KeyI', lugar: 'topo' },
  { id: 'sala', rotulo: 'Grupo', tecla: 'KeyO', lugar: 'topo' },
  { id: 'chat', rotulo: 'Chat', lugar: 'topo', acao: (g) => g.online.chat?.abrirEscrita() ?? g.ui.toast('Entre com uma conta para usar o chat.') },
  { id: 'mensagem', rotulo: 'Escrever', lugar: 'topo', acao: (g) => (g.online.mensagens ? g.openMenu('escrever') : g.ui.toast('Entre com uma conta para deixar mensagens.')) },
];

export class ControlesToque {
  constructor(game) {
    this.game = game;
    this.inp = game.input;
    this.inp.toque = true;
    document.body.classList.add('toque');
    this.dedos = new Map();   // pointerId → {tipo: 'botao'|'joy'|'cam', ...}

    // ---- a camada dos controles
    this.el = document.createElement('div');
    this.el.id = 'toque';
    this.el.innerHTML = `<div class="joy hidden"><div class="joy-pino"></div></div>
      <div class="toque-topo"></div><div class="toque-combate"></div><div class="toque-contexto"></div>`;
    document.body.append(this.el);
    this.joy = this.el.querySelector('.joy');
    this.pino = this.el.querySelector('.joy-pino');
    this.contexto = this.el.querySelector('.toque-contexto');
    for (const b of BOTOES) {
      const bt = document.createElement('div');
      bt.className = `tb tb-${b.id}`;
      bt.dataset.b = b.id;
      bt.textContent = b.rotulo;
      if (b.titulo) bt.title = b.titulo;
      this.el.querySelector(`.toque-${b.lugar}`).append(bt);
    }
    this.btInteragir = this.el.querySelector('.tb-interagir');

    // ---- fechar menus (o inventário, por exemplo, só fechava por tecla)
    this.fechar = document.createElement('button');
    this.fechar.id = 'toque-fechar';
    this.fechar.textContent = '✕ Fechar';
    this.fechar.addEventListener('click', () => game.closeMenu());
    document.body.append(this.fechar);

    // ---- o aviso de girar o celular
    this.girar = document.createElement('div');
    this.girar.id = 'girar';
    this.girar.innerHTML = '<div><div class="girar-icone">⟳</div>Gire o celular para jogar<br><small>toque aqui para deitar a tela</small></div>';
    this.girar.addEventListener('click', () => this.deitarTela());
    document.body.append(this.girar);

    for (const ev of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel']) {
      this.el.addEventListener(ev, (e) => this[ev](e), { passive: false });
    }
    // a cruz dos itens e o aviso "E ..." também se tocam
    this.tocavel(document.getElementById('slot-quick'), 'KeyC');
    this.tocavel(document.getElementById('slot-left'), 'KeyT');
    this.tocavel(document.getElementById('prompt'), 'KeyE');
    // o primeiro toque em qualquer lugar deita a tela (precisa ser num gesto do dedo)
    document.addEventListener('pointerdown', () => this.deitarTela(), { capture: true });
  }

  /** Tela cheia + horizontal. Só funciona dentro de um toque; falhar é normal (iPhone). */
  deitarTela() {
    if (document.fullscreenElement || !document.documentElement.requestFullscreen) return;
    document.documentElement.requestFullscreen({ navigationUI: 'hide' })
      .then(() => screen.orientation?.lock?.('landscape'))
      .catch(() => {});
  }

  tocavel(el, tecla) {
    if (!el) return;
    // `stopPropagation`: o toque é do botão, não vira câmera nem joystick por baixo
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.inp.apertar(tecla); });
    const solta = () => this.inp.soltar(tecla);
    el.addEventListener('pointerup', solta);
    el.addEventListener('pointercancel', solta);
    el.addEventListener('pointerleave', solta);
  }

  // ------------------------------------------------------------ os dedos

  pointerdown(e) {
    e.preventDefault();
    this.el.setPointerCapture?.(e.pointerId);
    const bt = e.target.closest?.('[data-b]');
    if (bt) {
      const b = BOTOES.find((x) => x.id === bt.dataset.b);
      bt.classList.add('apertado');
      if (b.acao) { b.acao(this.game); this.dedos.set(e.pointerId, { tipo: 'botao', el: bt }); return; }
      if (b.tecla) this.inp.apertar(b.tecla);
      if (b.mouse != null) this.inp.mouseApertar(b.mouse);
      this.dedos.set(e.pointerId, { tipo: 'botao', b, el: bt });
      return;
    }
    // tocar fora com o chat aberto = desistir de escrever
    if (this.game.online.chat?.escrevendo) this.game.online.chat.fecharEscrita();
    const joyLivre = ![...this.dedos.values()].some((d) => d.tipo === 'joy');
    if (joyLivre && e.clientX < innerWidth * 0.42) {
      this.dedos.set(e.pointerId, { tipo: 'joy', x0: e.clientX, y0: e.clientY });
      this.joy.style.left = `${e.clientX}px`;
      this.joy.style.top = `${e.clientY}px`;
      this.joy.classList.remove('hidden');
      this.pino.style.transform = 'translate(-50%, -50%)';
      return;
    }
    this.dedos.set(e.pointerId, { tipo: 'cam', x: e.clientX, y: e.clientY });
  }

  pointermove(e) {
    const d = this.dedos.get(e.pointerId);
    if (!d) return;
    e.preventDefault();
    if (d.tipo === 'joy') {
      let dx = e.clientX - d.x0, dy = e.clientY - d.y0;
      const r = Math.hypot(dx, dy);
      if (r > RAIO_JOY) { dx *= RAIO_JOY / r; dy *= RAIO_JOY / r; }
      this.pino.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.inp.eixo = { x: dx / RAIO_JOY, z: -dy / RAIO_JOY };
    } else if (d.tipo === 'cam') {
      this.inp.dx += (e.clientX - d.x) * SENS_CAMERA;
      this.inp.dy += (e.clientY - d.y) * SENS_CAMERA;
      d.x = e.clientX; d.y = e.clientY;
    }
  }

  pointerup(e) {
    const d = this.dedos.get(e.pointerId);
    if (!d) return;
    this.dedos.delete(e.pointerId);
    if (d.tipo === 'joy') { this.inp.eixo = null; this.joy.classList.add('hidden'); }
    if (d.tipo === 'botao') {
      d.el.classList.remove('apertado');
      if (d.b?.tecla) this.inp.soltar(d.b.tecla);
      if (d.b?.mouse != null) this.inp.mouseSoltar(d.b.mouse);
    }
  }

  pointercancel(e) { this.pointerup(e); }

  /** Solta tudo (menu abriu, a janela perdeu o foco): nenhum botão fica preso. */
  soltarTudo() {
    for (const id of [...this.dedos.keys()]) this.pointerup({ pointerId: id });
  }

  // ------------------------------------------------------------ todo quadro

  update() {
    const g = this.game;
    const jogando = g.state === 'playing';
    document.body.classList.toggle('jogando', jogando);
    const visivel = jogando && !g.menu;
    if (!visivel && this.dedos.size) this.soltarTudo();
    this.el.classList.toggle('hidden', !visivel);
    this.fechar.classList.toggle('hidden', !(jogando && g.menu));
    if (!visivel) return;
    // o "E" só aparece quando há o que interagir
    this.btInteragir.classList.toggle('hidden', document.getElementById('prompt')?.classList.contains('hidden') ?? true);
    // botões do momento: a mensagem aberta e o convite de duelo/co-op
    const ctx = [];
    if (g.ui.readerOpen) {
      ctx.push(['KeyE', 'Fechar']);
      if (g.lendo?.online && g.lendo.minha) ctx.push(['KeyX', 'Apagar']);
      else if (g.lendo?.online) ctx.push(['Digit1', 'Boa'], ['Digit2', 'Ruim']);
    }
    if (g.sessao?.convite) ctx.push(['KeyY', 'Aceitar'], ['KeyN', 'Recusar']);
    const chave = ctx.map((c) => c[0]).join();
    if (chave !== this.ctxChave) {
      this.ctxChave = chave;
      this.contexto.innerHTML = '';
      for (const [tecla, rotulo] of ctx) {
        const bt = document.createElement('div');
        bt.className = 'tb tb-ctx';
        bt.textContent = rotulo;
        this.contexto.append(bt);
        this.tocavel(bt, tecla);
      }
    }
  }
}
