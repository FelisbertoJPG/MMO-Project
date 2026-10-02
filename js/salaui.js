// O painel MULTIJOGADOR (tecla O): abrir sala, entrar por código ou pela lista
// da rede local, desafiar para duelo. A lógica mora em `rede/sala.js`; aqui só
// se desenha o estado dela e se repassa o clique.
//
// No MUNDO ONLINE (`game.modo === 'mmo'`) não há sala: o painel mostra quem está
// no mundo (`rede/mundo.js`) e o botão de sair.
import { Sala, codigoValido } from './rede/sala.js';
import { salasNaRede } from './rede/transporte.js';
import { temRedeLocal } from './hospedagem.js';

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class SalaUI {
  constructor(game) {
    this.game = game;
    const $ = (id) => document.getElementById(id);
    this.el = $('sala-menu');
    this.fora = $('sala-fora');
    this.dentro = $('sala-dentro');
    this.mundo = $('sala-mundo');
    this.lista = $('sala-lista');
    this.codigo = $('sala-codigo');
    this.aviso = $('sala-aviso');
    this.hud = $('sala-hud');
    this.aberto = false;
    this.vizinhos = [];
    this.desenhado = '';
    this.listaDesenhada = '';
    $('sala-fechar').addEventListener('click', () => game.closeMenu());
    $('sala-abrir').addEventListener('click', () => this.abrirSala());
    $('sala-entrar').addEventListener('click', () => this.entrarPorCodigo());
    this.codigo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.entrarPorCodigo();
      if (e.key === 'Escape') game.closeMenu();
    });
    this.codigo.addEventListener('input', () => { this.codigo.value = this.codigo.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    // os botões desenhados dinamicamente
    for (const caixa of [this.dentro, this.lista, this.mundo]) caixa.addEventListener('click', (e) => this.acao(e.target.closest('[data-acao]')));
  }

  abrir() {
    this.aberto = true;
    this.el.classList.remove('hidden');
    this.aviso.textContent = '';
    this.buscarVizinhos();
    this.timer = setInterval(() => this.buscarVizinhos(), 2000);
    this.update();
  }

  fechar() {
    this.aberto = false;
    this.el.classList.add('hidden');
    clearInterval(this.timer);
  }

  async buscarVizinhos() { this.vizinhos = await salasNaRede(); }

  async abrirSala() {
    if (this.game.sessao) return;
    this.aviso.textContent = 'abrindo…';
    this.game.sessao = await Sala.abrir(this.game);
    this.aviso.textContent = '';
  }

  entrarPorCodigo() {
    const c = this.codigo.value.trim().toUpperCase();
    if (!codigoValido(c)) { this.aviso.textContent = 'o código tem 6 letras/números'; return; }
    if (this.game.sessao) return;
    this.game.sessao = Sala.entrar(this.game, c);
  }

  acao(bt) {
    if (!bt) return;
    const g = this.game, s = g.sessao;
    switch (bt.dataset.acao) {
      case 'entrar-lan': if (!s) g.sessao = Sala.entrar(g, bt.dataset.codigo, bt.dataset.base); break;
      case 'sair': s?.sair(); g.sessao = null; break;
      case 'desafiar': s?.desafiar(); break;
      case 'coop': s?.chamarParaMeuMundo(); break;
      case 'fim-coop': s?.encerrarCoop(s.coop?.dono ? 'o dono do mundo encerrou' : 'o convidado foi embora'); break;
      case 'aceitar': s?.responderConvite(true); break;
      case 'recusar': s?.responderConvite(false); break;
      case 'sair-mundo': g.sairDoMundo(); break;
    }
  }

  /** Todo quadro: o aviso no canto e, com o painel aberto, o conteúdo dele. */
  update() {
    const s = this.game.sessao;
    if (this.game.modo === 'mmo') return this.updateMundo(s);
    // aviso no canto da tela
    const hud = s && this.game.state === 'playing'
      ? `Sala ${s.codigo} · ${s.outro ? `${esc(s.outro.nome || '...')} · ${s.conexao === 'local' ? 'rede local' : 'internet'}` : s.estado === 'erro' ? 'desconectado' : 'esperando...'}`
        + (s.coop ? (s.coop.dono ? ' · ajudando você' : ' · no mundo dele') : '')
      : '';
    if (hud !== this.hudTexto) { this.hudTexto = hud; this.hud.innerHTML = hud; this.hud.classList.toggle('hidden', !hud); }
    if (!this.aberto) return;

    this.fora.classList.toggle('hidden', !!s);
    this.dentro.classList.toggle('hidden', !s);
    if (!s) return this.desenharLista();
    const html = this.htmlDentro(s);
    if (html !== this.desenhado) { this.desenhado = html; this.dentro.innerHTML = html; }
  }

  /** O mundo online: o aviso no canto e, com o painel aberto, a lista de quem está lá. */
  updateMundo(m) {
    const n = m?.presentes.length ?? 0;
    const hud = !m ? '' : m.estado === 'ligado' ? `Mundo online · ${n === 1 ? 'só você' : `${n} jogadores`}`
      : m.estado === 'fora' ? 'Mundo online · desconectado' : 'Mundo online · reconectando…';
    if (hud !== this.hudTexto) { this.hudTexto = hud; this.hud.textContent = hud; this.hud.classList.toggle('hidden', !hud); }
    if (!this.aberto || !m) return;
    this.fora.classList.add('hidden');
    this.dentro.classList.add('hidden');
    this.mundo.classList.remove('hidden');
    const estado = m.estado === 'ligado' ? '' : `<p class="erro">${m.estado === 'fora' ? 'Desconectado.' : 'Sem conexão com o servidor — reconectando…'} ${esc(m.motivo || '')}</p>`;
    const quem = m.presentes.map((j) => `<li>${esc(j.nome)}${j.eu ? '<small>(você)</small>' : ''}</li>`).join('');
    const html = `<p class="dica">Todos aqui dividem o mesmo mapa: os inimigos, as portas e os chefes são de todos. Os baús e os itens são de cada um.</p>`
      + `${estado}<h3>No mundo agora</h3><ul class="mundo-lista">${quem || '<li>—</li>'}</ul>`
      + `<p class="dica">O seu progresso é gravado no servidor.${m.souSim ? ' Este jogo está movendo os inimigos para todos; se a janela for escondida, outro jogador assume.' : ''}</p>`
      + '<div class="conta-botoes"><button data-acao="sair-mundo">Sair do mundo</button></div>';
    if (html !== this.desenhado) { this.desenhado = html; this.mundo.innerHTML = html; }
  }

  desenharLista() {
    const online = this.game.online?.ativo;
    const semConta = document.getElementById('sala-sem-conta'), lan = temRedeLocal();
    semConta.classList.toggle('hidden', !!online);
    // num host só de arquivos (GitHub Pages) não há rede local: a sala é só pela internet
    if (!lan) semConta.textContent = 'Para abrir ou entrar numa sala, entre com uma conta na tela inicial.';
    document.getElementById('sala-rede-titulo').classList.toggle('hidden', !lan);
    this.lista.classList.toggle('hidden', !lan);
    const html = this.vizinhos.length
      ? this.vizinhos.map((v) => `<button data-acao="entrar-lan" data-codigo="${esc(v.codigo)}" data-base="http://${esc(v.ip)}:${Number(v.porta)}">${esc(v.nome || 'Sala')} · ${esc(v.codigo)}</button>`).join('')
      : '<span class="dica">Nenhuma sala aberta na sua rede agora.</span>';
    if (html !== this.listaDesenhada) { this.listaDesenhada = html; this.lista.innerHTML = html; }
  }

  htmlDentro(s) {
    const cod = `<p>Sala <b class="sala-cod">${esc(s.codigo)}</b></p>`;
    if (s.estado === 'erro') return `<p class="erro">${esc(s.erro)}</p><div class="conta-botoes"><button data-acao="sair">Voltar</button></div>`;
    if (s.estado === 'conectando') return `<p>Procurando a sala <b class="sala-cod">${esc(s.codigo)}</b>…</p><div class="conta-botoes"><button data-acao="sair">Cancelar</button></div>`;
    if (s.estado === 'esperando') {
      const canos = s.canos.map((c) => (c.tipo === 'local' ? 'rede local' : 'internet')).join(' e ');
      return `${cod}<p class="dica">Passe o código para o seu amigo. Se ele estiver na mesma rede, a sala também aparece na lista dele.</p>`
        + `<p class="dica">Aberta pela ${esc(canos)}.</p><div class="conta-botoes"><button data-acao="sair">Fechar a sala</button></div>`;
    }
    // juntos
    const nome = esc(s.outro.nome);
    let duelo;
    if (s.duelo) duelo = '<p class="dica">Duelo em andamento.</p>';
    else if (s.coop) {
      duelo = s.coop.dono ? `<p class="dica">${nome} está ajudando no seu mundo.</p>` : `<p class="dica">Você está ajudando no mundo de ${nome}.</p>`;
      duelo += `<div class="conta-botoes"><button data-acao="fim-coop">${s.coop.dono ? 'Mandar de volta' : 'Voltar para o meu mundo'}</button></div>`;
    } else if (s.convite) {
      const txt = s.convite.tipo === 'coop' ? `${nome} chama você para ajudar no mundo dele.` : `${nome} desafia você para um duelo.`;
      duelo = `<p>${txt}</p><div class="conta-botoes"><button data-acao="aceitar">Aceitar</button><button data-acao="recusar">Recusar</button></div>`;
    } else if (s.convidei) duelo = `<p class="dica">Esperando a resposta ao ${s.convidei.tipo === 'coop' ? 'chamado' : 'desafio'}…</p>`;
    else {
      duelo = '<div class="conta-botoes"><button data-acao="coop">Chamar para o meu mundo</button><button data-acao="desafiar">Desafiar para duelo</button></div>'
        + '<p class="dica">No seu mundo, ele luta ao seu lado contra os seus inimigos e leva as almas também.</p>';
    }
    const via = s.conexao === 'local' ? 'pela rede local (mesma rede)' : 'pela internet';
    return `${cod}<p><b>${esc(s.outro.nome || '...')}</b> está com você, ${via}.</p>${duelo}`
      + `<div class="conta-botoes"><button data-acao="sair">Sair da sala</button></div>`;
  }
}
