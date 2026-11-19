/**
 * **O CHAT GLOBAL** (03/10/2026) — o MESMO chat global do Duel Academy.
 *
 * Os dois jogos dividem a conversa de propósito: a tabela é a `public.mensagens`
 * de lá (migration 0040 do Duel Academy; `para` nulo = global), lida pelo RPC
 * `chat_global` (que já traz o nome de quem falou) e escrita pelo
 * `enviar_mensagem` (que tem o teto de 500 letras e o limite de ritmo). Nada
 * daqui repete essas regras: elas valem no banco, para os dois jogos.
 *
 * É a ÚNICA coisa da Masmorra fora do schema `masmorra` — o interruptor
 * `masmorra.ligado` não a desliga. Para tirar o chat só da Masmorra, basta não
 * criar esta classe (`Online.comecarPartida`).
 *
 * **Sempre aberto**: a caixa fica no canto da tela enquanto se joga logado; a
 * mensagem nova entra embaixo e as mais velhas sobem. **Enter** abre a linha de
 * escrever, Enter manda, Esc desiste.
 *
 * **No Mundo online (18/11/2026), o que se escreve vai pelo servidor de mundo** e aparece
 * com o nome do PERSONAGEM (`Kael #7K3F9Q`), para quem está no mundo. Pelo chat global não
 * dá: cada mensagem de lá leva o id da conta e o nome dela, e pôr o personagem junto ligaria
 * os dois à vista de todos (o código de denúncia só a moderação liga à conta). As mensagens
 * do chat global continuam chegando na mesma caixa.
 *
 * **A JANELA (19/11/2026, `JanelaDoChat`)**: pequena por padrão, com uma barra em cima que
 * ARRASTA a caixa para onde se quiser e tem três botões — fixar (trava no lugar), expandir
 * (maior, com rolagem) e minimizar (só a barra, contando as novas). O lugar e os botões ficam
 * em `localStorage['masmorra:chat-janela']` (por aparelho). Escrever (Enter) SOLTA O MOUSE, para
 * dar para arrastar, rolar e clicar; Enter manda e prende o mouse de novo.
 *
 * A entrega tem dois caminhos, como no Duel Academy: o Realtime avisa em menos
 * de um segundo ("chegou algo, releia"), e uma releitura a cada `RESERVA_MS`
 * cobre o socket caído ou o token vencido.
 */
import { SUPABASE_URL, SUPABASE_KEY, tokenValido, req, contaId } from './supabase.js';
import { ouvirMudancas } from './realtime.js';
import { rotuloDoPerfil } from './perfis.js';
import { tela, pontoNaTela } from '../tela.js';

/** O teto do texto: o MESMO do banco — aqui só evita a viagem. */
export const MAX_TEXTO = 500;
const RESERVA_MS = 8000;
/** Quantas mensagens ficam na caixa (as mais velhas saem por cima). */
const NA_TELA = 60;

const CHAVE_JANELA = 'masmorra:chat-janela';

/**
 * A janela do chat: arrastar pela barra de cima, fixar, expandir e minimizar. Não sabe nada
 * de mensagens — o ChatGlobal só avisa quando chega uma (`chegou`).
 */
export class JanelaDoChat {
  constructor(el) {
    this.el = el;
    this.topo = el.querySelector('#chat-topo');
    this.novasEl = el.querySelector('.chat-novas');
    this.novas = 0;
    this.estado = { x: null, y: null, fixo: false, grande: false, min: false };
    try { Object.assign(this.estado, JSON.parse(localStorage.getItem(CHAVE_JANELA) || '{}')); } catch { /* sem armazenamento: o padrão */ }
    this.topo.addEventListener('click', (e) => {
      const acao = e.target.closest('[data-chat]')?.dataset.chat;
      if (!acao) return;
      if (acao === 'fixar') this.estado.fixo = !this.estado.fixo;
      if (acao === 'expandir') this.estado.grande = !this.estado.grande;
      if (acao === 'minimizar') { this.estado.min = !this.estado.min; if (!this.estado.min) this.novas = 0; }
      this.aplicar(); this.gravar();
    });
    // clicar na barra não tira o foco da linha de escrever nem seleciona texto
    this.topo.addEventListener('mousedown', (e) => e.preventDefault());
    // arrastar pela barra (os botões não arrastam; fixo não arrasta)
    let arrasto = null;
    this.topo.addEventListener('pointerdown', (e) => {
      if (this.estado.fixo || e.target.closest('button')) return;
      // (pontoNaTela: com a página girada pelo CSS, o dedo vem nas medidas da tela física)
      const q = pontoNaTela(e.clientX, e.clientY);
      arrasto = { dx: q.x - this.el.offsetLeft, dy: q.y - this.el.offsetTop };
      this.topo.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    this.topo.addEventListener('pointermove', (e) => {
      if (!arrasto) return;
      const q = pontoNaTela(e.clientX, e.clientY);
      this.estado.x = q.x - arrasto.dx; this.estado.y = q.y - arrasto.dy;
      this.posicionar();
    });
    const soltar = () => { if (arrasto) { arrasto = null; this.gravar(); } };
    this.topo.addEventListener('pointerup', soltar);
    this.topo.addEventListener('pointercancel', soltar);
    this.aoRedimensionar = () => this.posicionar();
    addEventListener('resize', this.aoRedimensionar);
    this.aplicar();
  }

  aplicar() {
    const s = this.estado, el = this.el;
    el.classList.toggle('fixo', s.fixo);
    el.classList.toggle('grande', s.grande);
    el.classList.toggle('minimizado', s.min);
    this.topo.querySelector('[data-chat="fixar"]').title = s.fixo ? 'Soltar (voltar a arrastar)' : 'Fixar no lugar';
    this.topo.querySelector('[data-chat="expandir"]').title = s.grande ? 'Diminuir' : 'Expandir';
    const min = this.topo.querySelector('[data-chat="minimizar"]');
    min.textContent = s.min ? '+' : '–';
    min.title = s.min ? 'Abrir' : 'Minimizar';
    this.novasEl.textContent = s.min && this.novas ? `(${this.novas} nova${this.novas > 1 ? 's' : ''})` : '';
    this.posicionar();
  }

  /** Põe a janela onde o jogador a deixou, sem sair da tela (null = o lugar do CSS). */
  posicionar() {
    const s = this.estado, el = this.el;
    if (s.x === null || s.y === null) { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; return; }
    s.x = Math.max(0, Math.min(tela.w - Math.min(el.offsetWidth, tela.w), s.x));
    s.y = Math.max(0, Math.min(tela.h - this.topo.offsetHeight, s.y));
    el.style.left = `${Math.round(s.x)}px`; el.style.top = `${Math.round(s.y)}px`;
    el.style.right = 'auto'; el.style.bottom = 'auto';
  }

  gravar() { try { localStorage.setItem(CHAVE_JANELA, JSON.stringify(this.estado)); } catch { /* sem armazenamento */ } }

  /** Chegou uma mensagem: minimizado, conta na barra. */
  chegou() { if (this.estado.min) { this.novas++; this.aplicar(); } }

  fechar() { removeEventListener('resize', this.aoRedimensionar); }
}

const rpcPublico = (nome, args) => req(`rpc/${nome}`, { method: 'POST', body: args, schema: 'public' });

export class ChatGlobal {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('chat');
    this.lista = document.getElementById('chat-lista');
    this.entrada = document.getElementById('chat-entrada');
    this.ultimo = 0;
    this.vistos = new Set();
    this.escrevendo = false;
    this.lista.innerHTML = '';
    this.el.classList.remove('hidden');
    this.janela = new JanelaDoChat(this.el);

    // O Input do jogo ignora o que se digita numa caixa de texto
    // (input.js), então Enter e Esc são tratados aqui mesmo.
    this.aoTeclar = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.enviar(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.fecharEscrita(); }
    };
    this.entrada.addEventListener('keydown', this.aoTeclar);
    // a caixa muda de altura com a janela: a última mensagem continua à vista
    this.aoRedimensionar = () => { this.lista.scrollTop = this.lista.scrollHeight; };
    addEventListener('resize', this.aoRedimensionar);
    this.entrada.maxLength = MAX_TEXTO;

    this.ler();
    this.fecharRT = ouvirMudancas(
      { url: SUPABASE_URL, apikey: SUPABASE_KEY, token: tokenValido, topico: 'masmorra-chat', schema: 'public', tabelas: [{ table: 'mensagens', event: 'INSERT' }] },
      () => this.ler(),
    );
    this.timer = setInterval(() => this.ler(), RESERVA_MS);
  }

  /** Busca o que chegou depois da última mensagem da caixa. Leituras não se cruzam. */
  async ler() {
    if (this.lendo) { this.deNovo = true; return; }
    this.lendo = true;
    try {
      const r = await rpcPublico('chat_global', { p_desde: this.ultimo, p_limite: this.ultimo ? 100 : 30 });
      if (!r.ok || !Array.isArray(r.dados)) return;
      // o banco devolve do mais novo para o mais velho; a caixa desenha na ordem da conversa
      const novas = r.dados.filter((m) => Number.isFinite(Number(m?.id)) && !this.vistos.has(Number(m.id)))
        .sort((a, b) => Number(a.id) - Number(b.id));
      for (const m of novas) this.mostrar(m);
    } finally {
      this.lendo = false;
      if (this.deNovo) { this.deNovo = false; this.ler(); }
    }
  }

  mostrar(m) {
    const id = Number(m.id);
    this.vistos.add(id);
    this.ultimo = Math.max(this.ultimo, id);
    const linha = document.createElement('div');
    linha.className = 'chat-msg' + (m.de && m.de === contaId() ? ' minha' : '');
    const nome = document.createElement('b');
    nome.textContent = `${String(m.usuario ?? '?').slice(0, 32)}: `;
    linha.append(nome, document.createTextNode(String(m.texto ?? '').slice(0, MAX_TEXTO)));
    this.adicionar(linha);
  }

  /** Uma mensagem do chat do MUNDO: o nome e o código vêm carimbados pelo servidor. */
  mostrarDoMundo(c, minha) {
    if (typeof c?.texto !== 'string' || typeof c.nome !== 'string') return;
    const linha = document.createElement('div');
    linha.className = `chat-msg${minha ? ' minha' : ''}`;
    const nome = document.createElement('b');
    nome.textContent = `${rotuloDoPerfil({ nome: c.nome.slice(0, 16), codigo: typeof c.codigo === 'string' ? c.codigo.slice(0, 6) : '' })}: `;
    linha.append(nome, document.createTextNode(c.texto.slice(0, MAX_TEXTO)));
    this.adicionar(linha);
  }

  /** Um aviso do próprio jogo na caixa (erro ao mandar, por exemplo). */
  avisar(texto) {
    const linha = document.createElement('div');
    linha.className = 'chat-msg aviso';
    linha.textContent = texto;
    this.adicionar(linha);
  }

  adicionar(linha) {
    this.janela.chegou();
    this.lista.append(linha);
    while (this.lista.children.length > NA_TELA) this.lista.firstChild.remove();
    this.lista.scrollTop = this.lista.scrollHeight;
  }

  abrirEscrita() {
    this.escrevendo = true;
    this.game.input.clearAll();   // a tecla que estava apertada (andar) não fica presa
    this.el.classList.add('escrevendo');
    this.entrada.value = '';
    this.entrada.focus();
    this.lista.scrollTop = this.lista.scrollHeight;
    // o mouse fica livre enquanto se escreve: arrastar a janela, rolar, clicar nos botões
    // (o `pointerlockchange` do Game sabe que é o chat e não pausa)
    this.game.input.exitLock();
  }

  fecharEscrita() {
    this.escrevendo = false;
    this.el.classList.remove('escrevendo');
    this.entrada.value = '';
    this.entrada.blur();
    this.game.input.clearAll();
  }

  async enviar() {
    const texto = this.entrada.value.trim();
    // Enter com a linha vazia só fecha (ninguém quer um erro vermelho por isso)
    if (!texto) { this.fecharEscrita(); this.prenderMouse(); return; }
    this.fecharEscrita();
    this.prenderMouse();
    if (this.game.sessao?.enviarChat?.(texto.slice(0, MAX_TEXTO))) return;   // no Mundo online (ver o cabeçalho)
    const r = await rpcPublico('enviar_mensagem', { p_para: null, p_texto: texto.slice(0, MAX_TEXTO) });
    if (!r.ok) { this.avisar(`(não foi: ${r.error})`); return; }
    this.ler();
  }

  /** Depois de mandar (Enter é um gesto do jogador: o navegador deixa prender o mouse de novo). */
  prenderMouse() {
    const g = this.game;
    if (g.state === 'playing' && !g.menu) g.input.requestLock();
  }

  fechar() {
    this.janela.fechar();
    clearInterval(this.timer);
    this.fecharRT?.();
    this.entrada.removeEventListener('keydown', this.aoTeclar);
    removeEventListener('resize', this.aoRedimensionar);
    if (this.escrevendo) this.fecharEscrita();
    this.el.classList.add('hidden');
  }
}
