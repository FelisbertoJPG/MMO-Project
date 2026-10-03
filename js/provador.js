// O PROVADOR (03/10/2026) — Shift+G abre/fecha um painel com os corpos do jogador
// (guerreiro.js): o guerreiro sem armadura, as três armaduras do pacote (A1, A2, A3)
// e o boneco antigo. A escolha fica guardada no navegador (`guardarCorpo`) e viaja
// no instantâneo, então os outros jogadores veem o mesmo corpo.
import { Assets } from './assets.js';
import { guardarCorpo, armaduraDe, corpoDe } from './guerreiro.js';

const OPCOES = [
  { id: 'nu', nome: 'Sem armadura' },
  { id: 'A1', nome: 'Armadura 1 — couro' },
  { id: 'A2', nome: 'Armadura 2 — placas' },
  { id: 'A3', nome: 'Armadura 3 — capuz' },
  { id: 'antigo', nome: 'Boneco antigo' },
];

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
  atual() { return corpoDe(this.game.player.model); }

  marcar() {
    const id = this.atual();
    for (const b of this.lista.children) b.classList.toggle('ativo', b.dataset.id === id);
  }

  async escolher(id) {
    if (!OPCOES.some((o) => o.id === id)) return;
    guardarCorpo(id);
    const armadura = armaduraDe(id);
    if (armadura !== false && !Assets.guerreiro) {
      this.estado.textContent = 'carregando o guerreiro…';
      const ok = await Assets.carregarGuerreiro();
      this.estado.textContent = ok ? '' : 'não consegui carregar o guerreiro (veja o console)';
      if (!ok) return;
    }
    this.game.player.model.usarGuerreiro(armadura);
    this.marcar();
  }
}
