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
 * A entrega tem dois caminhos, como no Duel Academy: o Realtime avisa em menos
 * de um segundo ("chegou algo, releia"), e uma releitura a cada `RESERVA_MS`
 * cobre o socket caído ou o token vencido.
 */
import { SUPABASE_URL, SUPABASE_KEY, tokenValido, req, contaId } from './supabase.js';
import { ouvirMudancas } from './realtime.js';

/** O teto do texto: o MESMO do banco — aqui só evita a viagem. */
export const MAX_TEXTO = 500;
const RESERVA_MS = 8000;
/** Quantas mensagens ficam na caixa (as mais velhas saem por cima). */
const NA_TELA = 60;

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

    // O Input do jogo ignora o que se digita numa caixa de texto
    // (input.js), então Enter e Esc são tratados aqui mesmo.
    this.aoTeclar = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.enviar(); }
      else if (e.key === 'Escape') { e.preventDefault(); this.fecharEscrita(); }
    };
    this.entrada.addEventListener('keydown', this.aoTeclar);
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

  /** Um aviso do próprio jogo na caixa (erro ao mandar, por exemplo). */
  avisar(texto) {
    const linha = document.createElement('div');
    linha.className = 'chat-msg aviso';
    linha.textContent = texto;
    this.adicionar(linha);
  }

  adicionar(linha) {
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
    if (!texto) return this.fecharEscrita();
    this.fecharEscrita();
    const r = await rpcPublico('enviar_mensagem', { p_para: null, p_texto: texto.slice(0, MAX_TEXTO) });
    if (!r.ok) { this.avisar(`(não foi: ${r.error})`); return; }
    this.ler();
  }

  fechar() {
    clearInterval(this.timer);
    this.fecharRT?.();
    this.entrada.removeEventListener('keydown', this.aoTeclar);
    if (this.escrevendo) this.fecharEscrita();
    this.el.classList.add('hidden');
  }
}
