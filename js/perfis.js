/**
 * **A TELA DOS PERFIS** (18/11/2026): escolher, criar e apagar personagem, na tela de
 * entrada, para quem tem conta. As regras e a lista moram em `rede/perfis.js`.
 *
 * CRIAR é uma tela inteira (19/11/2026): à esquerda a ficha (nome, raça, sexo, atributos e
 * status), à direita o personagem iluminado no escuro (`palco-criacao.js`). "Personalizar"
 * troca os atributos pelo painel de Aparência (`EditorDeAparencia`). Nada é gravado até o
 * banco aceitar o nome.
 *
 * APAGAR pede o nome digitado: é definitivo, e leva os dois progressos.
 */
import { MAX_PERFIS, chaveDoNome, erroDoNome, fonteDosPerfis, limparNome } from './rede/perfis.js';
import { nomeDaRaca } from './aparencia.js';
import { contaId } from './rede/supabase.js';
import { ehToque } from './toque.js';
import { PalcoDaCriacao } from './palco-criacao.js';
import { cargaDoNivel, vidaDoNivel, vigorDoNivel } from './ficha.js';

const $ = (id) => document.getElementById(id);
/** Quanto esperar o jogador parar de digitar antes de perguntar se o nome está livre. */
const ESPERA_NOME_MS = 350;
/**
 * A FICHA DE EXEMPLO da criação: só mostra, nada disto é gravado. Quando as classes existirem,
 * cada uma traz os seus números. Vida, fôlego e carga já são os do nível 1 de verdade.
 */
const FICHA_DE_EXEMPLO = {
  atributos: [['Nível', 1], ['Vitalidade', 10], ['Vigor', 10], ['Força', 10], ['Destreza', 10], ['Inteligência', 10], ['Espírito', 10]],
  status: [['Vida', vidaDoNivel(1)], ['Fôlego', vigorDoNivel(1)], ['Éter', 100], ['Carga', cargaDoNivel(1)], ['Ataque', 10], ['Defesa', 10], ['Resistência', 10]],
};

export class TelaPerfis {
  constructor(game) {
    this.game = game;
    this.perfis = [];
    this.lista = false;        // a lista foi lida (falhar em ler NÃO é "não tem personagens")
    this.apagando = null;      // o perfil com a confirmação aberta
    this.fonte = null;
    this.palco = new PalcoDaCriacao(game);
    // o painel de Aparência entra na coluna da ficha enquanto se cria (e volta ao lugar depois)
    const painel = $('aparencia');
    this.casaDoPainel = { pai: painel.parentNode, depois: painel.nextSibling };
    this.desenharFichaDeExemplo();
    $('perfis-criar').addEventListener('click', () => this.abrirCriacao());
    $('perfis-tentar').addEventListener('click', () => this.carregar());
    $('perfil-voltar').addEventListener('click', () => this.fecharCriacao());
    $('perfil-form').addEventListener('submit', (e) => { e.preventDefault(); this.confirmarCriacao(); });
    $('perfil-nome').addEventListener('input', () => this.conferirNomeDigitado());
    // (`?.`: logo depois de publicar, o navegador ainda pode ter o index.html antigo guardado por até 10 min)
    $('perfil-personalizar')?.addEventListener('click', () => this.personalizar($('perfil-custom').classList.contains('hidden')));
    // as setas da raça e do sexo
    $('perfil-form').addEventListener('click', (e) => {
      const seta = e.target.closest?.('.cp-seta');
      if (seta) game.editorAparencia.opcaoDaFicha(seta.closest('[data-campo]').dataset.campo).passar(Number(seta.dataset.d));
    });
    // o `Input` do jogo ignora o que se digita numa caixa: o Esc é tratado aqui
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !game.criandoPerfil) return;
      if ($('perfil-custom').classList.contains('hidden')) this.fecharCriacao();
      else this.personalizar(false);
    });
  }

  /** Os atributos e o status de exemplo, nos dois painéis da ficha. */
  desenharFichaDeExemplo() {
    for (const [id, linhas] of [['perfil-atributos', FICHA_DE_EXEMPLO.atributos], ['perfil-status', FICHA_DE_EXEMPLO.status]]) {
      $(id)?.replaceChildren(...linhas.map(([nome, valor]) => {
        const linha = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
        dt.textContent = nome;
        dd.textContent = valor;
        linha.append(dt, dd);
        return linha;
      }));
    }
  }

  /** A raça e o sexo de agora, na ficha. */
  desenharFicha() {
    const ed = this.game.editorAparencia;
    for (const campo of document.querySelectorAll('#perfil-form [data-campo]')) {
      const o = ed.opcaoDaFicha(campo.dataset.campo);
      campo.querySelector('.cp-valor').textContent = o.nome;
      for (const seta of campo.querySelectorAll('.cp-seta')) seta.disabled = o.total < 2;
    }
    // (a raça esculpida já vem pintada e vestida: não há o que personalizar)
    const temDetalhes = ed.lista.children.length > 0;
    $('perfil-personalizar').disabled = !temDetalhes;
    if (!temDetalhes) this.personalizar(false);
  }

  /** Troca os atributos pelo painel de Aparência, ou volta. */
  personalizar(sim) {
    $('perfil-custom').classList.toggle('hidden', !sim);
    $('perfil-fichas').classList.toggle('hidden', sim);
    $('perfil-personalizar').classList.toggle('ativo', sim);
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
    const ed = g.editorAparencia;
    $('perfil-custom').append(ed.el);
    ed.aoMudar = () => this.desenharFicha();
    ed.aoPronto = () => this.personalizar(false);
    ed.abrir({ criando: true });
    this.personalizar(false);
    this.desenharFicha();
    this.palco.abrir();
    if (!ehToque()) $('perfil-nome').focus();
  }

  fecharCriacao() {
    const g = this.game, p = g.player;
    if (!g.criandoPerfil) return;
    g.criandoPerfil = false;
    clearTimeout(this.esperaNome);
    const ed = g.editorAparencia;
    ed.fechar();
    ed.aoMudar = ed.aoPronto = null;
    this.casaDoPainel.pai.insertBefore(ed.el, this.casaDoPainel.depois);
    this.palco.fechar();
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
