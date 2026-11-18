/**
 * **A TELA DOS PERFIS** (18/11/2026): escolher, criar e apagar personagem, na tela de
 * entrada, para quem tem conta. As regras e a lista moram em `rede/perfis.js`.
 *
 * CRIAR reaproveita o painel de Aparência (`EditorDeAparencia`): a tela de título sai da
 * frente, o personagem fica de pé com a câmera no rosto (`Game.loop`, `criandoPerfil`) e
 * uma caixinha pede o nome. Nada é gravado até o banco aceitar o nome.
 *
 * APAGAR pede o nome digitado: é definitivo, e leva os dois progressos.
 */
import { MAX_PERFIS, chaveDoNome, erroDoNome, fonteDosPerfis, limparNome } from './rede/perfis.js';
import { nomeDaRaca } from './aparencia.js';
import { contaId } from './rede/supabase.js';
import { ehToque } from './toque.js';

const $ = (id) => document.getElementById(id);
/** Quanto esperar o jogador parar de digitar antes de perguntar se o nome está livre. */
const ESPERA_NOME_MS = 350;

export class TelaPerfis {
  constructor(game) {
    this.game = game;
    this.perfis = [];
    this.lista = false;        // a lista foi lida (falhar em ler NÃO é "não tem personagens")
    this.apagando = null;      // o perfil com a confirmação aberta
    this.fonte = null;
    $('perfis-criar').addEventListener('click', () => this.abrirCriacao());
    $('perfis-tentar').addEventListener('click', () => this.carregar());
    $('perfil-voltar').addEventListener('click', () => this.fecharCriacao());
    $('perfil-form').addEventListener('submit', (e) => { e.preventDefault(); this.confirmarCriacao(); });
    $('perfil-nome').addEventListener('input', () => this.conferirNomeDigitado());
    // o `Input` do jogo ignora o que se digita numa caixa: o Esc é tratado aqui
    $('perfil-nome').addEventListener('keydown', (e) => { if (e.key === 'Escape') this.fecharCriacao(); });
  }

  /** O nome de `?teste=`, ou null. */
  get teste() { return new URLSearchParams(location.search).get('teste'); }
  get chaveGuardada() { return `masmorra:perfil:${this.teste ? `teste-${this.teste}` : contaId() ?? ''}`; }

  /** Saiu da conta: nada de personagem escolhido. */
  limpar() {
    this.perfis = [];
    this.lista = false;
    this.apagando = null;
    this.game.escolherPerfil(null);
  }

  /** Lê a lista. Falhou: mostra o erro e oferece tentar de novo; nada é criado nem gravado. */
  async carregar() {
    const vez = this.vez = (this.vez ?? 0) + 1, g = this.game;
    this.lista = false;
    this.apagando = null;
    this.mostrarErro('');
    $('perfis-titulo').textContent = 'Lendo os seus personagens…';
    $('perfis-lista').innerHTML = '';
    $('perfis-criar').classList.add('hidden');
    g.escolherPerfil(null);
    this.fonte = fonteDosPerfis({ teste: this.teste, base: g.enderecoDoMundo() });
    // a conta entrou sem o Supabase responder: tenta de novo antes de pedir a lista
    if (!this.teste && !g.online.ativo) await g.online.confirmarJogador();
    if (vez !== this.vez) return;
    const r = this.teste || g.online.ativo ? await this.fonte.listar() : { ok: false, error: g.online.motivo || 'Sem conexão com a sua conta.' };
    if (vez !== this.vez) return;
    if (!r.ok) {
      $('perfis-titulo').textContent = '';
      this.mostrarErro(r.error);
      return;
    }
    this.perfis = r.perfis;
    this.lista = true;
    // volta ao último escolhido neste aparelho; sem ele, o primeiro da lista
    let guardado = null;
    try { guardado = localStorage.getItem(this.chaveGuardada); } catch { }
    g.escolherPerfil(this.perfis.find((p) => p.id === guardado) ?? this.perfis[0] ?? null);
    this.desenhar();
  }

  mostrarErro(texto) {
    $('perfis-erro').classList.toggle('hidden', !texto);
    $('perfis-erro-texto').textContent = texto;
  }

  escolher(perfil) {
    this.apagando = null;
    try { localStorage.setItem(this.chaveGuardada, perfil.id); } catch { }
    this.game.escolherPerfil(perfil);
    this.desenhar();
  }

  desenhar() {
    const lista = $('perfis-lista'), escolhido = this.game.perfil;
    lista.innerHTML = '';
    $('perfis-titulo').textContent = this.perfis.length ? 'Escolha o seu personagem' : 'Crie o seu primeiro personagem';
    for (const p of this.perfis) {
      const linha = document.createElement('div');
      linha.className = 'perfil-linha';
      const cartao = document.createElement('button');
      cartao.type = 'button';
      cartao.className = `perfil-cartao${p === escolhido ? ' ativo' : ''}`;
      const nome = document.createElement('span'), info = document.createElement('small');
      nome.className = 'perfil-nome';
      nome.textContent = p.nome;
      const codigo = document.createElement('span');
      codigo.className = 'perfil-codigo';
      codigo.textContent = `#${p.codigo}`;
      nome.append(' ', codigo);
      info.textContent = `${nomeDaRaca(p.aparencia)} · nível ${p.nivel ?? 1}`;
      cartao.append(nome, info);
      cartao.addEventListener('click', () => this.escolher(p));
      const apagar = document.createElement('button');
      apagar.type = 'button';
      apagar.className = 'perfil-apagar';
      apagar.textContent = 'Apagar';
      apagar.setAttribute('aria-label', `Apagar ${p.nome}`);
      apagar.addEventListener('click', () => { this.apagando = this.apagando === p ? null : p; this.desenhar(); });
      linha.append(cartao, apagar);
      lista.append(linha);
      if (this.apagando === p) lista.append(this.caixaDeApagar(p));
    }
    $('perfis-criar').classList.toggle('hidden', !this.lista || this.perfis.length >= MAX_PERFIS);
  }

  /** A confirmação: só libera com o nome digitado certo. */
  caixaDeApagar(p) {
    const caixa = document.createElement('form');
    caixa.className = 'perfil-confirma';
    caixa.autocomplete = 'off';
    const aviso = document.createElement('p');
    aviso.textContent = `Apagar é definitivo: ${p.nome} perde o progresso da Jornada e do Mundo. Digite o nome para confirmar.`;
    const entrada = document.createElement('input');
    entrada.id = 'perfil-apagar-nome';
    entrada.maxLength = 16;
    entrada.spellcheck = false;
    entrada.setAttribute('aria-label', 'Nome do personagem');
    const erro = document.createElement('div');
    erro.className = 'perfil-aviso';
    const botoes = document.createElement('div');
    botoes.className = 'conta-botoes';
    const cancelar = Object.assign(document.createElement('button'), { type: 'button', textContent: 'Cancelar' });
    const ok = Object.assign(document.createElement('button'), { type: 'submit', textContent: 'Apagar para sempre', disabled: true, id: 'perfil-apagar-ok' });
    botoes.append(cancelar, ok);
    caixa.append(aviso, entrada, erro, botoes);
    const confere = () => chaveDoNome(limparNome(entrada.value)) === chaveDoNome(p.nome);
    entrada.addEventListener('input', () => { ok.disabled = !confere(); erro.textContent = ''; });
    cancelar.addEventListener('click', () => { this.apagando = null; this.desenhar(); });
    caixa.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!confere() || ok.disabled) return;
      ok.disabled = true;
      erro.textContent = 'Apagando…';
      const r = await this.fonte.apagar(p.id, limparNome(entrada.value));
      if (!r.ok) { erro.textContent = r.error; ok.disabled = false; return; }
      await this.carregar();
    });
    if (!ehToque()) setTimeout(() => entrada.focus(), 0);
    return caixa;
  }

  // ------------------------------------------------------------ criar

  abrirCriacao() {
    if (!this.lista || this.perfis.length >= MAX_PERFIS) return;
    const g = this.game, p = g.player;
    this.aparenciaAntes = p.aparencia;
    g.criandoPerfil = true;
    $('title-screen').classList.add('hidden');
    $('perfil-novo').classList.remove('hidden');
    $('perfil-nome').value = '';
    this.avisoDoNome('');
    p.model.play(p.idleAnim, { fade: 0.2 });   // de pé: o painel mostra o corpo e o rosto
    // na tela de título o `Player.update` não roda: sem isto o corpo fica de costas para a câmera do painel
    this.giroAntes = p.model.root.rotation.y;
    p.model.root.rotation.y = p.facing;
    g.editorAparencia.abrir({ criando: true });
    if (!ehToque()) $('perfil-nome').focus();
  }

  fecharCriacao() {
    const g = this.game, p = g.player;
    if (!g.criandoPerfil) return;
    g.criandoPerfil = false;
    clearTimeout(this.esperaNome);
    g.editorAparencia.fechar();
    $('perfil-novo').classList.add('hidden');
    $('title-screen').classList.remove('hidden');
    p.aparencia = this.aparenciaAntes;
    p.refreshEquipment();
    p.model.root.rotation.y = this.giroAntes;
    p.model.pose('LayToIdle', 0);   // de volta ao prisioneiro deitado da tela de título
  }

  avisoDoNome(texto, ok = false) {
    $('perfil-nome-aviso').textContent = texto;
    $('perfil-nome-aviso').classList.toggle('ok', ok);
  }

  /** Avisa enquanto digita. Quem decide de verdade é o banco, ao criar. */
  conferirNomeDigitado() {
    clearTimeout(this.esperaNome);
    const nome = limparNome($('perfil-nome').value);
    if (!nome) return this.avisoDoNome('');
    const erro = erroDoNome(nome);
    if (erro) return this.avisoDoNome(erro);
    this.avisoDoNome('');
    this.esperaNome = setTimeout(async () => {
      const livre = await this.fonte.nomeLivre(nome);
      if (limparNome($('perfil-nome').value) !== nome || !this.game.criandoPerfil) return;
      if (livre === false) this.avisoDoNome('Este nome já existe. Escolha outro.');
      else if (livre) this.avisoDoNome('Nome disponível.', true);
    }, ESPERA_NOME_MS);
  }

  async confirmarCriacao() {
    const g = this.game, nome = limparNome($('perfil-nome').value), bt = $('perfil-confirmar');
    const erro = erroDoNome(nome);
    if (erro) return this.avisoDoNome(erro);
    clearTimeout(this.esperaNome);
    bt.disabled = true;
    this.avisoDoNome('Criando…', true);
    const r = await this.fonte.criar(nome, g.player.aparencia);
    bt.disabled = false;
    if (!r.ok) return this.avisoDoNome(r.error);
    try { localStorage.setItem(this.chaveGuardada, r.perfil.id); } catch { }
    this.fecharCriacao();
    await this.carregar();
  }
}
