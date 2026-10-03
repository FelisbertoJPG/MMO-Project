// O PROVADOR (03/10/2026) — ferramenta de DEPURAÇÃO do corpo novo (guerreiro.js).
// Shift+G abre/fecha um painel com os designs do guerreiro: sem armadura, as três
// armaduras do pacote (A1, A2, A3) e o boneco antigo. A escolha fica guardada no
// navegador (localStorage) e vale de novo na próxima vez.
//
// No Mundo online o jogador já entra com o guerreiro (o que estiver escolhido; da
// primeira vez, sem armadura). Na Jornada nada muda até alguém abrir o provador.
// É só VISUAL e LOCAL: os outros jogadores continuam vendo o boneco antigo.
import { Assets } from './assets.js';

const CHAVE = 'masmorra.provador';
const OPCOES = [
  { id: 'nu', nome: 'Sem armadura', armadura: null },
  { id: 'A1', nome: 'Armadura 1 — couro', armadura: 'A1' },
  { id: 'A2', nome: 'Armadura 2 — placas', armadura: 'A2' },
  { id: 'A3', nome: 'Armadura 3 — capuz', armadura: 'A3' },
  { id: 'antigo', nome: 'Boneco antigo', armadura: false },
];

const lerEscolha = () => { try { return localStorage.getItem(CHAVE); } catch { return null; } };
const gravarEscolha = (id) => { try { localStorage.setItem(CHAVE, id); } catch { /* sem armazenamento: só não lembra */ } };

export class Provador {
  constructor(game) {
    this.game = game;
    this.painel = document.getElementById('provador');
    this.lista = document.getElementById('provador-lista');
    this.estado = document.getElementById('provador-estado');
    for (const op of OPCOES) {
      const b = document.createElement('button');
      b.dataset.id = op.id;
      b.textContent = op.nome;
      b.addEventListener('click', () => this.escolher(op.id));
      this.lista.appendChild(b);
    }
    document.getElementById('provador-fechar').addEventListener('click', () => this.fechar());
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyG' || !e.shiftKey || e.repeat) return;
      if (/^(INPUT|TEXTAREA)$/.test(e.target?.tagName)) return;
      if (this.game.state !== 'playing') return;
      e.preventDefault();
      if (this.aberto) this.fechar(); else this.abrir();
    });
  }

  get aberto() { return !this.painel.classList.contains('hidden'); }

  abrir() {
    document.exitPointerLock?.();   // o mouse solto, para clicar
    this.painel.classList.remove('hidden');
    this.marcar();
  }

  fechar() {
    this.painel.classList.add('hidden');
    if (this.game.state === 'playing' && !this.game.menu) this.game.input.requestLock();
  }

  // a opção atual, pelo que o boneco está usando agora
  atual() {
    const g = this.game.player?.model?.guerreiro;
    return !g ? 'antigo' : g.armadura ?? 'nu';
  }

  marcar() {
    const id = this.atual();
    for (const b of this.lista.children) b.classList.toggle('ativo', b.dataset.id === id);
  }

  async escolher(id) {
    const op = OPCOES.find((o) => o.id === id);
    if (!op) return;
    gravarEscolha(id);
    if (op.armadura !== false && !Assets.guerreiro) {
      this.estado.textContent = 'carregando o guerreiro…';
      const ok = await Assets.carregarGuerreiro();
      this.estado.textContent = ok ? '' : 'não consegui carregar o guerreiro (veja o console)';
      if (!ok) return;
    }
    this.game.player.model.usarGuerreiro(op.armadura);
    this.marcar();
  }

  // ao entrar no Mundo online: o guerreiro, com o design guardado (da primeira vez, sem armadura)
  aoEntrarNoMundo() {
    const id = lerEscolha() ?? 'nu';
    if (id !== 'antigo') this.escolher(id);
  }
}
