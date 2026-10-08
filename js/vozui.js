/**
 * A tela do CHAT DE VOZ (`rede/voz.js`): as opções no menu de pausa (o modo do
 * microfone, a tecla de falar, o volume das vozes, o medidor e com quem está
 * ligado) e o aviso no HUD (`#voz-hud`: "falando" e quem está falando).
 */
import { nomeDaTecla, FALANDO } from './rede/voz.js';

const $ = (id) => document.getElementById(id);

export class VozUI {
  constructor(game) {
    this.game = game;
    this.voz = game.voz;
    this.hud = $('voz-hud');
    this.estado = $('voz-estado');
    this.medidor = $('voz-medidor').firstElementChild;
    this.btTecla = $('voz-tecla');
    this.volume = $('voz-volume');
    this.ultimoHud = null;
    this.ultimoEstado = null;

    for (const b of document.querySelectorAll('#voz-opcoes [data-modo]')) {
      b.addEventListener('click', () => { this.voz.mudarModo(b.dataset.modo); this.marcar(); });
    }
    this.btTecla.addEventListener('click', () => {
      this.btTecla.textContent = 'aperte a tecla… (Esc desiste)';
      this.btTecla.classList.add('ativo');
      this.voz.capturarTecla((code, recusa) => {
        if (recusa) this.game.ui.toast(`Essa não: ${recusa}.`);
        this.marcar();
      });
    });
    this.volume.addEventListener('input', () => this.voz.mudarVolume(Number(this.volume.value) / 100));
    // a barra fica com o foco depois de arrastada, e o jogo ignora tecla com foco num `input` (WASD parava)
    this.volume.addEventListener('change', () => this.volume.blur());
    this.marcar();
  }

  /** Mostra os ajustes atuais nos botões. */
  marcar() {
    const v = this.voz;
    for (const b of document.querySelectorAll('#voz-opcoes [data-modo]')) b.classList.toggle('ativo', b.dataset.modo === v.modo);
    this.btTecla.textContent = nomeDaTecla(v.tecla);
    for (const el of document.querySelectorAll('.voz-tecla-nome')) el.textContent = nomeDaTecla(v.tecla);
    this.btTecla.classList.remove('ativo');
    this.btTecla.disabled = v.modo !== 'segurar';
    this.volume.value = String(Math.round(v.volume * 100));
    this.ultimoEstado = null;
  }

  update() {
    const v = this.voz, g = this.game, agora = performance.now();
    if (agora - (this.ultimo ?? 0) < 100) return;   // 10× por segundo basta para texto
    this.ultimo = agora;
    // ---- o HUD: eu falando, e quem está falando agora
    let hud = '';
    if (g.state === 'playing') {
      const r = v.pares.size ? v.resumo() : null;
      const partes = [];
      // no "aberto" a trilha está sempre ligada: o aviso só acende com som de verdade
      if (v.falando && (v.modo === 'segurar' || v.nivelMic > FALANDO)) partes.push('<span class="eu">🎙 falando</span>');
      if (r?.falando.length) partes.push(`🔊 ${r.falando.map(esc).join(', ')}`);
      hud = partes.join(' · ');
    }
    if (hud !== this.ultimoHud) {
      this.ultimoHud = hud;
      this.hud.innerHTML = hud;
      this.hud.classList.toggle('hidden', !hud);
    }

    // ---- o painel de opções, só com a pausa aberta
    if (g.menu !== 'pause') {
      if (this.btTecla.classList.contains('ativo')) v.pararCaptura();
      this.aberto = false;
      return;
    }
    if (!this.aberto) { this.aberto = true; this.marcar(); }   // o ajuste pode ter mudado por fora (o botão "Falar" do celular, o console)
    this.medidor.style.width = `${Math.min(100, Math.round(v.nivelMic * 600))}%`;
    const texto = this.textoDoEstado();
    if (texto !== this.ultimoEstado) { this.ultimoEstado = texto; this.estado.innerHTML = texto; }
  }

  textoDoEstado() {
    const v = this.voz, mmo = this.game.modo === 'mmo';
    const linhas = [];
    if (v.modo === 'mudo') linhas.push(v.volume > 0 ? 'Microfone desligado: você ouve os outros, mas não fala.' : 'Desligado: nem fala nem ouve (volume 0).');
    else if (v.modo === 'aberto') linhas.push('Microfone aberto: quem está ligado com você ouve tudo.');
    else linhas.push(`Segure <b>${esc(nomeDaTecla(v.tecla))}</b> para falar (o medidor acende).`);
    if (v.modo !== 'mudo' && v.semMic) linhas.push(`<span class="erro">${esc(v.semMic)}</span>`);
    const r = v.resumo();
    if (!r.temSessao) linhas.push('Fala com quem está na sua sala (tecla O) ou no Mundo online.');
    else {
      linhas.push('A voz vem de onde a pessoa está e vai sumindo com a distância (some a ~35 m).');
      const quem = [];
      if (r.ligados.length) quem.push(`ligado com ${r.ligados.map(esc).join(', ')}`);
      if (r.ligando.length) quem.push(`ligando com ${r.ligando.map(esc).join(', ')}…`);
      if (r.falhas.length) {
        quem.push(`<span class="erro">não conectou com ${r.falhas.map(esc).join(', ')}</span> `
          + (r.turn ? '(nem pelo retransmissor: a rede de um dos dois não deixa)' : '(a rede de um dos dois não deixa, e o servidor está sem retransmissor)'));
      }
      linhas.push(quem.length ? `${quem.join(' · ')}.` : (mmo ? 'Ninguém por perto.' : 'Ninguém na sala ainda.'));
    }
    return linhas.join('<br>');
  }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
