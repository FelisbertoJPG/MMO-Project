/**
 * A TELA DA ÁRVORE DE HABILIDADES (19/11/2026; tecla K, fora do menu de pausa e da fogueira).
 *
 * O desenho é a árvore vista de cima: os 7 ELEMENTOS ficam num anel, cada um com o seu GALHO
 * crescendo para fora (a Maestria no anel; depois as 3 linhas: Magia, Defesa e Arma). Por
 * DENTRO do anel, cada par de elementos é ligado por um galho-ponte: a REAÇÃO, cuja maestria é
 * o "Conhecimento do …" (luz + trevas = Conhecimento do Caos). O galho da reação acende quando
 * os dois elementos têm Maestria 5. A ordem do anel põe os pares opostos (fogo/água,
 * luz/trevas) atravessando o centro.
 *
 * Os dados vêm de `assets/habilidades.json` (GERADO: ferramentas/habilidades/gerar-catalogo.mjs).
 * Só elemento `funcional` deixa gastar ponto (hoje, o Fogo); os outros e as reações aparecem
 * para ver. Os pontos gastos vão primeiro para `pend` (a confirmar): só o Confirmar grava em
 * `player.habilidades.nos` (id → PONTOS gastos, como o save e o `saveTorto()` esperam) — fechar
 * sem confirmar devolve, porque ainda não há como refazer a árvore (D9).
 *
 * Regras do modelo aprovado (Fogo): a Maestria tem `regras.maestria` pontos (3, D19) e, cheia,
 * abre a linha 1; cada linha aceita 3 pontos, e a seguinte abre quando a anterior está cheia;
 * cada escolha precisa de 1 ponto em uma das que ela `requer`; a suprema custa os 3 da linha.
 *
 * O QUE NÃO ESTÁ LIBERADO NÃO APARECE (D20): o personagem começa conhecendo só o elemento
 * `inicial` (o Fogo; os outros virão das missões — por enquanto, conhecer = ser inicial ou ter
 * ponto na Maestria). Do elemento conhecido aparece a Maestria e só os nós cujos requisitos
 * já foram cumpridos (ou que já têm ponto); a reação aparece quando abre. `mostrarTudo` (a
 * vitrine, ferramentas/habilidades/vitrine.mjs) mostra o que estaria escondido.
 *
 * Não há círculo fixo: os elementos CONHECIDOS se ligam por RETAS na ordem de uma estrela de
 * 7 pontas (`estrela`; com um só, nada; com os 7, a estrela fecha e o círculo de fora se desenha
 * por cima — o círculo alquímico). O que passa a aparecer entre um desenho e o seguinte NASCE
 * animado (`antes` = o que já estava na tela): a reta se desenha da Maestria conhecida até a
 * nova, o galho cresce até a habilidade liberada, e só então o nó surge. Abrir a tela não anima.
 *
 * OS CAMINHOS (D28, 21/11/2026; a BETA): a primeira face é a página dos 3 começos (Batalha,
 * Éter, Esquiva), em cards, no layout do Editor de Árvore (o catálogo traz `x`/`y` prontos:
 * gerar-catalogo.mjs). Tudo aparece; os requisitos são `requer_minimo` (todos). O que cada
 * card faz no jogo está em `caminhos.js` (card sem efeito aceita ponto, com o aviso). A Arte
 * Arcana (o círculo) só abre com a Maestria Elemental. A Arte Marcial saiu: o save devolve
 * os pontos dela (save.js). Na beta, o Refazer devolve todos os pontos, de graça.
 */
import { pontosGastos } from './ficha.js';
import { efeitoDe, ATIVAS, abreArteArcana, definirCustos } from './caminhos.js';

const ORDEM = ['fogo', 'vento', 'luz', 'eletrico', 'agua', 'terra', 'trevas'];
const R = 250;                      // o raio do anel (onde ficam as Maestrias)
const LIMITE = 650;                 // metade do tamanho do desenho
const TUDO = { x: -LIMITE, y: -LIMITE, w: 2 * LIMITE };
const PERTO = 900;                  // vista mais estreita que isto mostra os nomes dos nós
const TIPO = { maestria: 'Maestria', ativa: 'Ativa', passiva: 'Passiva', suprema: 'Suprema', identidade: 'Identidade' };
const COLUNA = { magia: 'Magia', defesa: 'Defesa', arma: 'Arma', base: 'Base' };
// o CARD da página dos Caminhos (unidades do desenho; o catálogo já vem na escala dele)
const CARD = { w: 104, h: 46 };
/** O nome do card em até 2 linhas (quebra nas palavras, ~15 letras por linha). */
function linhasDoNome(nome) {
  const linhas = [''];
  for (const p of nome.split(' ')) {
    const l = linhas[linhas.length - 1];
    if (l && (l + ' ' + p).length > 15 && linhas.length < 2) linhas.push(p);
    else linhas[linhas.length - 1] = l ? `${l} ${p}` : p;
  }
  return linhas;
}
// a rachadura do círculo quando se faz o Juramento da Força Bruta
const RACHAS = [
  'M-30 -330 L-5 -250 L-45 -170 L10 -90 L-20 -10 L35 70 L0 150 L40 230 L15 330',
  'M-20 -10 L-110 30 L-150 110 L-240 140',
  'M10 -90 L110 -120 L170 -200',
];

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const polar = (r, a) => [r * Math.cos(a), r * Math.sin(a)];
const n1 = (v) => v.toFixed(1);

export class ArvoreUI {
  constructor(game) {
    this.game = game;
    this.el = document.getElementById('arvore');
    this.svg = this.el.querySelector('svg');
    this.detalhe = this.el.querySelector('.arv-detalhe');
    this.pontos = this.el.querySelector('.arv-pontos');
    this.btConfirmar = this.el.querySelector('.arv-confirmar');
    this.btDesfazer = this.el.querySelector('.arv-desfazer');
    this.cat = null;
    this.pend = {};
    this.sel = null;
    this.vista = { ...TUDO };
    this.mostrarTudo = false;
    this.descobertos = new Set();   // elementos descobertos além do inicial (um dia: as missões)
    this.face = 'caminhos';         // 'caminhos' (a página dos 3 começos) ou 'arcana' (o círculo dos elementos)
    this.refazendo = 0;             // o Refazer pede o segundo clique (até este performance.now())
    // jurar só depois que existir o REFAZER na fogueira (D9): sem ele, o juramento seria para
    // sempre (a Força Bruta fecharia o Fogo sem volta). A vitrine liga.
    this.juramentosLiberados = false;
    this.antesFace = {};            // por face: as chaves do último desenho dela (sem = não animar)
    this.el.querySelectorAll('[data-face]').forEach((b) => b.addEventListener('click', () => this.trocarFace(b.dataset.face)));
    this.btConfirmar.addEventListener('click', () => this.confirmar());
    this.btDesfazer.addEventListener('click', () => { this.pend = {}; this.render(); });
    this.el.querySelector('.arv-tudo').addEventListener('click', () => this.irPara(TUDO));
    this.el.querySelector('.arv-mais').addEventListener('click', () => this.zoom(0.7));
    this.el.querySelector('.arv-menos').addEventListener('click', () => this.zoom(1 / 0.7));
    this.btRefazer = this.el.querySelector('.arv-refazer');
    this.btRefazer?.addEventListener('click', () => this.refazer());
    // PONTOS INFINITOS (só no jogo local, para testar a árvore): `treino` guarda a árvore de verdade —
    // é ELA que vai para o save (coletar, save.js) enquanto o teste estiver ligado, e volta ao desligar
    this.treino = null;
    this.btTreino = this.el.querySelector('.arv-treino');
    if (this.btTreino && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) {
      this.btTreino.hidden = false;
      this.btTreino.addEventListener('click', () => this.alternarTreino());
    }
    this.detalhe.addEventListener('click', (e) => {
      const da = e.target.closest('[data-aprender]');
      if (da) { this.aprender(da.dataset.aprender); return; }
      const dv = e.target.closest('[data-vaga]');
      if (dv && this.sel) { this.porNaVaga(this.sel, Number(dv.dataset.vaga)); return; }
      if (e.target.closest('.arv-aprender') && this.sel) this.aprender(this.sel);
    });
    this.ligarMapa();
  }

  get aberta() { return !this.el.classList.contains('hidden'); }

  abrir() {
    this.pend = {};
    this.el.classList.remove('hidden');
    this.aplicarVista();
    const pronta = () => {
      this.antesFace = {};
      this.normalizar();
      // a Arte Arcana trancada (refez a árvore, save novo): abre nos Caminhos
      if (this.face === 'arcana' && !this.arteArcanaAberta()) this.face = 'caminhos';
      this.el.querySelectorAll('[data-face]').forEach((b) => b.classList.toggle('ativa', b.dataset.face === this.face));
      this.vistaInicial();
      this.render();
    };
    if (this.cat) { pronta(); return; }
    this.detalhe.textContent = 'Carregando…';
    this.carregar()
      .then(() => { if (this.aberta) pronta(); })
      .catch((e) => { this.detalhe.textContent = 'Não foi possível carregar as habilidades.'; console.warn('[arvore]', e); });
  }

  /**
   * Lê o catálogo, uma vez: ao abrir a tela e ao começar o jogo (js/ao-vivo.js), para os efeitos
   * dos cards de mais de 1 ponto saberem o custo deles (caminhos.js) sem esperar a tecla K.
   */
  carregar() {
    this.carregando ??= fetch('assets/habilidades.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((cat) => { if (!this.cat) this.montar(cat); return this.cat; })
      .catch((e) => { this.carregando = null; throw e; });
    return this.carregando;
  }

  /**
   * O catálogo mudou (o Editor de Árvore gravou a página: js/ao-vivo.js): relê e redesenha.
   * Não mexe nos pontos (card apagado só some da tela; a próxima abertura devolve o ponto).
   */
  recarregar() {
    if (!this.cat) return;   // a tela nunca abriu: a primeira abertura já lê o novo
    fetch('assets/habilidades.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((cat) => {
        const sel = this.sel;
        this.montar(cat);
        this.sel = sel && this.nos.has(sel) ? sel : null;
        this.antesFace = {};
        if (this.aberta) this.render();
        this.game.ui.barraVista = null;   // os nomes das vagas
        this.game.ui.toast('Árvore atualizada pelo editor.');
      })
      .catch((e) => console.warn('[arvore] recarregar', e));
  }

  fechar() {
    if (this.totalPendente() > 0) this.game.ui.toast('Os pontos não confirmados voltaram.');
    this.pend = {};
    this.el.classList.add('hidden');
  }

  // ---------- A montagem (uma vez): onde fica cada nó ----------
  montar(cat) {
    this.cat = cat;
    this.nos = new Map();        // id → { no, elem, x, y, pais, linha }
    this.elems = new Map();      // id do elemento → { e, ang, x, y }
    this.reacoes = [];
    const lista = [...cat.elementos].sort((a, b) => (ORDEM.indexOf(a.id) + 99) % 99 - (ORDEM.indexOf(b.id) + 99) % 99);
    lista.forEach((e, i) => {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / lista.length;
      const [x, y] = polar(R, ang);
      this.elems.set(e.id, { e, i, ang, x, y });
      const m = e.arvore.maestria;
      this.nos.set(m.id, { no: m, elem: e, face: 'arcana', cor: e.cor, x, y, pais: [], linha: 0 });
      const por = (grupos, raio) => grupos.forEach((g, gi) => g.forEach((no, j) => {
        // os nós de uma linha ficam a ~95 unidades um do outro (perto do anel, o ângulo abre mais)
        const [nx, ny] = polar(raio(gi), ang + ((j - (g.length - 1) / 2) * 95) / raio(gi));
        const pais = (no.requer ?? []).length ? no.requer : [m.id];
        this.nos.set(no.id, { no, elem: e, face: 'arcana', cor: e.cor, x: nx, y: ny, pais, linha: e.arvore.modelo === 'linhas' ? gi + 1 : null });
      }));
      if (e.arvore.modelo === 'linhas') por(e.arvore.linhas.map((l) => l.escolhas), (gi) => R + 105 + 80 * gi);
      else {
        const tiers = [];
        for (const no of e.arvore.nos) (tiers[no.tier - 1] ??= []).push(no);
        por(tiers.map((t) => t ?? []), (gi) => R + 62 + 52 * gi);
      }
    });
    for (const r of cat.reacoes) {
      const a = this.elems.get(r.elementos[0]), b = this.elems.get(r.elementos[1]);
      if (a && b) this.reacoes.push({ r, a, b, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    }
    this.maestriaId = new Map([...this.elems.values()].map((x) => [x.e.id, x.e.arvore.maestria.id]));
    this.juramentos = {};   // (os juramentos saíram com a Arte Marcial; `jurou` fica sempre falso)
    // os CAMINHOS (D28): a página dos 3 começos, no layout do editor
    this.comecos = new Map((cat.caminhos?.comecos ?? []).map((c) => [c.id, { ...c, funcional: true, inicial: true }]));
    const HIBRIDO = { id: 'hibrido', nome: 'Híbrido', cor: cat.caminhos?.cor_hibrido ?? '#e8c25a', funcional: true, inicial: true };
    definirCustos(cat.caminhos?.nos);   // os níveis dos cards de mais de 1 ponto (caminhos.js)
    for (const no of cat.caminhos?.nos ?? []) {
      const elem = this.comecos.get(no.comeco) ?? HIBRIDO;
      this.nos.set(no.id, { no, elem, face: 'caminhos', cor: elem.cor, x: no.x, y: no.y, pais: Object.keys(no.requer_minimo ?? {}), linha: null });
    }
  }

  /** A Arte Arcana está aberta? (a Maestria Elemental, ou já tem ponto no círculo, ou a vitrine) */
  arteArcanaAberta() {
    if (this.mostrarTudo || this.cat?.caminhos == null) return true;
    const h = { nos: { ...this.hab.nos, ...this.pend } };
    return abreArteArcana(h) || this.pontosElementais() > 0;
  }

  /** Troca a face da árvore: a página dos Caminhos ou o círculo dos elementos (Arte Arcana). */
  trocarFace(face) {
    if (face === this.face || !this.cat) return;
    if (face === 'arcana' && !this.arteArcanaAberta()) { this.game.ui.toast('A Arte Arcana abre com a Maestria Elemental, no caminho do Éter.'); return; }
    this.face = face;
    this.sel = null;
    this.el.querySelectorAll('[data-face]').forEach((b) => b.classList.toggle('ativa', b.dataset.face === face));
    this.vistaInicial();
    this.render();
  }

  /**
   * Ponto gasto acima do máximo de um nó (a Maestria era de 5 e passou a 3: D19) volta a ser
   * disponível — os disponíveis saem do nível, então basta cortar o excesso e gravar.
   */
  normalizar() {
    let mudou = false, sumiu = false;
    for (const [id, n] of Object.entries(this.hab.nos)) {
      const info = this.nos.get(id);
      // card que saiu do catálogo (apagado no editor): os pontos voltam
      if (!info) { delete this.hab.nos[id]; mudou = sumiu = true; continue; }
      const max = info.no.ranks * (info.no.custo || 1);
      if (n > max) { this.hab.nos[id] = max; mudou = true; }
    }
    // a vaga com habilidade que não se tem mais fica vazia
    this.hab.barra = this.hab.barra.map((id) => (id && !(this.hab.nos[id] > 0) ? ((mudou = true), null) : id));
    if (!mudou) return;
    this.game.salvar({ nuvem: true });
    this.game.player?.aoMudarHabilidades?.();
    this.game.ui.toast(sumiu ? 'A árvore mudou: os pontos de cards que saíram voltaram.' : 'Os pontos acima do novo máximo voltaram.');
  }

  /** O REFAZER da beta: o 1º clique pergunta, o 2º devolve todos os pontos (das duas faces) e esvazia as vagas. */
  refazer() {
    if (!pontosGastos(this.hab) && !this.totalPendente()) { this.game.ui.toast('Não há pontos para devolver.'); return; }
    if (performance.now() > this.refazendo) {   // o 1º clique só pergunta (vale por 4 s)
      this.refazendo = performance.now() + 4000;
      this.renderLado();
      return;
    }
    this.refazendo = 0;
    this.pend = {};
    this.hab.nos = {};
    this.hab.barra = this.hab.barra.map(() => null);
    this.game.salvar({ nuvem: true });
    this.game.player?.aoMudarHabilidades?.();
    this.game.ui.toast('Todos os pontos voltaram.');
    if (this.face === 'arcana' && !this.arteArcanaAberta()) this.trocarFace('caminhos');
    else this.render();
  }

  /** Liga/desliga os pontos infinitos do teste (só local): desligar devolve a árvore de antes. */
  alternarTreino() {
    const p = this.game.player;
    this.pend = {};
    if (!this.treino) {
      this.treino = { v: this.hab.v, nos: { ...this.hab.nos }, barra: [...this.hab.barra] };
      this.game.ui.toast('Pontos infinitos: teste à vontade. Nada disso fica salvo; desligar volta a sua árvore.');
    } else {
      p.habilidades = this.treino;
      this.treino = null;
      this.game.ui.toast('Teste desligado: a sua árvore voltou.');
    }
    p.aoMudarHabilidades?.();
    if (this.face === 'arcana' && !this.arteArcanaAberta()) this.trocarFace('caminhos');
    else this.render();
  }

  /** Põe a ativa `id` na vaga `i` (tira das outras); de novo na mesma vaga, tira. */
  porNaVaga(id, i) {
    const barra = this.hab.barra;
    const tirar = barra[i] === id;
    for (let k = 0; k < barra.length; k++) if (barra[k] === id) barra[k] = null;
    if (!tirar) barra[i] = id;
    this.game.salvar({ nuvem: true });
    this.render();
  }

  /** A vista abre enquadrando os galhos dos elementos conhecidos (com o espaço para crescerem). */
  vistaInicial() {
    this.vista = this.prender(this.mostrarTudo && this.face === 'arcana' ? TUDO : this.enquadrar());
    this.aplicarVista();
  }

  /** O quadro que cabe os galhos INTEIROS (até o escondido) e os nomes dos elementos conhecidos. */
  enquadrar() {
    const pts = [];
    if (this.face === 'caminhos') {
      // a página é larga: abre no meio (o Éter), na altura da página inteira; o resto, arrastando
      for (const info of this.nos.values()) if (info.face === 'caminhos') pts.push([info.x, info.y]);
      if (!pts.length) return { ...TUDO };
      const ys = pts.map((q) => q[1]), y0 = Math.min(...ys) - 70, y1 = Math.max(...ys) + 40;
      const w = Math.max(720, y1 - y0);
      return { x: -w / 2, y: (y0 + y1) / 2 - w / 2, w };
    }
    for (const info of this.nos.values()) if (info.face === 'arcana' && (this.mostrarTudo || this.conhecido(info.elem))) pts.push([info.x, info.y]);
    for (const x of this.elems.values()) if (this.mostrarTudo || this.conhecido(x.e)) pts.push(polar(LIMITE - 40, x.ang));
    if (!pts.length) return { ...TUDO };
    const xs = pts.map((q) => q[0]), ys = pts.map((q) => q[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const w = Math.max(680, Math.max(x1 - x0, y1 - y0) + 120);
    return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - w / 2, w };
  }

  /** Um elemento novo entra no aro (a vitrine; um dia, a missão que o ensina). */
  descobrir(id) {
    if (!this.elems.has(id)) return;
    this.descobertos.add(id);
    this.render();
    this.irPara(this.enquadrar());
  }

  /**
   * As RETAS da estrela: os conhecidos na ordem da estrela de 7 pontas (cada ponta liga a que
   * fica 3 casas adiante no anel: 0, 3, 6, 2, 5, 1, 4), cada um ligado ao próximo conhecido,
   * menos o maior vão. Com os 7, a estrela fecha (e o círculo de fora vem por cima).
   */
  estrela() {
    const n = this.elems.size, salto = Math.floor(n / 2) || 1;
    const lugar = (i) => { for (let s = 0; s < n; s++) if ((s * salto) % n === i) return s; return i; };
    const conh = [...this.elems.values()].filter((x) => this.mostrarTudo || this.conhecido(x.e))
      .map((x) => ({ ...x, s: lugar(x.i) })).sort((a, b) => a.s - b.s);
    if (conh.length < 2) return [];
    const pares = conh.map((p, k) => { const q = conh[(k + 1) % conh.length]; return { p, q, vao: (q.s - p.s + n) % n || n }; });
    if (conh.length < n) {
      let maior = 0;
      pares.forEach((x, k) => { if (x.vao > pares[maior].vao) maior = k; });
      pares.splice(maior, 1);
    }
    return pares;
  }

  // ---------- As contas ----------
  get hab() { return this.game.player.habilidades; }
  pts(id) { return (this.hab.nos[id] ?? 0) + (this.pend[id] ?? 0); }
  rank(info) { return Math.floor(this.pts(info.no.id) / (info.no.custo || 1)); }
  totalPendente() { return Object.values(this.pend).reduce((s, n) => s + n, 0); }
  disponiveis() { return this.treino ? 999 : Math.max(0, this.game.player.level - 1 - pontosGastos(this.hab) - this.totalPendente()); }
  maestria(idElem) { const m = this.nos.get(this.maestriaId?.get(idElem) ?? `${idElem}.maestria`); return m ? this.rank(m) : 0; }
  /** Fez o juramento ('forca' ou 'canalizacao')? */
  jurou(tipo) { const id = this.juramentos?.[tipo]; return !!id && this.pts(id) > 0; }
  ehElemental(info) { return this.elems.has(info.elem.id); }
  somaPontos(teste) { let s = 0; for (const info of this.nos.values()) if (teste(info)) s += this.pts(info.no.id); return s; }
  pontosElementais() { return this.somaPontos((info) => this.ehElemental(info)); }
  pontosTecnicas() { return this.somaPontos((info) => info.no.secao === 'tecnica'); }
  pontosNaLinha(elem, linha) {
    let s = 0;
    for (const info of this.nos.values()) if (info.elem === elem && info.linha === linha) s += this.pts(info.no.id);
    return s;
  }

  /** O personagem conhece este elemento? (por enquanto: o inicial, ou com ponto na Maestria) */
  conhecido(elem) { return !!elem.inicial || this.descobertos.has(elem.id) || this.pts(`${elem.id}.maestria`) > 0; }

  /**
   * O requisito que falta para este nó ser LIBERADO (null = liberado). Não conta pontos.
   * `ver` = só a ESTRUTURA (o que faz o nó aparecer): sem as travas de escolha — o estilo já
   * escolhido, o juramento do outro caminho, o que um juramento fechou. O nó travado assim
   * aparece, apagado, com o motivo.
   */
  requisito(info, ver = false) {
    const { no, elem } = info;
    const req1 = () => (no.requer?.length && !no.requer.some((id) => this.pts(id) > 0)
      ? `Precisa de 1 ponto em ${no.requer.map((id) => this.nos.get(id)?.no.nome ?? id).join(' ou ')}.` : null);
    if (this.ehElemental(info)) {
      if (!ver && this.jurou('forca')) return 'Você fez o Juramento da Força Bruta: os elementos se fecharam.';
      if (no.tipo === 'maestria') return this.conhecido(elem) ? null : 'Elemento ainda não descoberto.';
      const max = this.cat.regras.maestria, linhaMax = this.cat.regras.pontos_por_linha;
      const k = this.maestria(elem.id);
      if (k < max) return `Precisa de ${elem.arvore.maestria.nome} ${max} (tem ${k}).`;
      if (info.linha > 1 && this.pontosNaLinha(elem, info.linha - 1) < linhaMax) return `Abre quando a linha ${info.linha - 1} estiver cheia (${linhaMax} pontos).`;
      return req1();
    }
    // a Arte Marcial e a Canalização
    if (!ver && no.secao === 'tecnica' && this.jurou('canalizacao')) return 'Você fez o Juramento da Canalização: as técnicas de arma se fecharam.';
    for (const [id, n] of Object.entries(no.requer_minimo ?? {})) {
      const outro = this.nos.get(id), k = outro ? this.rank(outro) : 0;
      if (k < n) return `Precisa de ${outro?.no.nome ?? id} ${n} (tem ${k}).`;
    }
    const r = req1();
    if (r) return r;
    const max = this.cat.regras.maestria;
    if (no.juramento === 'canalizacao' && ![...this.elems.keys()].some((id) => this.maestria(id) >= max)) return `Precisa de uma Maestria completa (${max}).`;
    if (ver || this.pts(no.id) > 0) return null;
    if (no.grupo) {
      const outro = [...this.nos.values()].find((x) => x.no.grupo === no.grupo && x !== info && this.pts(x.no.id) > 0);
      if (outro) return `Você já escolheu outro estilo: ${outro.no.nome}.`;
    }
    if (no.juramento) {
      const oOutro = no.juramento === 'forca' ? 'canalizacao' : 'forca';
      if (this.jurou(oOutro)) return `Você já fez o ${this.nos.get(this.juramentos[oOutro])?.no.nome}.`;
      if (no.juramento === 'forca' && this.pontosElementais() > 0) return 'Exige nenhum ponto nos elementos (refazer a árvore, na fogueira).';
      if (no.juramento === 'canalizacao' && this.pontosTecnicas() > 0) return 'Exige nenhum ponto em técnicas de arma.';
    }
    return null;
  }

  /** Aparece na tela? O que não está liberado fica escondido (D20); o que uma escolha travou aparece apagado. */
  visivel(info) {
    if (info.face === 'caminhos' || this.mostrarTudo || this.pts(info.no.id) > 0) return true;
    if (info.no.tipo === 'maestria' && this.ehElemental(info)) return this.conhecido(info.elem);
    return !this.requisito(info, true);
  }
  reacaoVisivel(x) { return this.mostrarTudo || (!this.jurou('forca') && this.estadoReacao(x) === 'aberta'); }

  /** Por que este nó NÃO pode receber mais um ponto agora (null = pode). */
  motivo(info) {
    const { no, elem } = info;
    const linhaMax = this.cat.regras.pontos_por_linha;
    if (this.rank(info) >= no.ranks) return 'Já está no máximo.';
    if (!elem.funcional) return 'Em breve: este elemento ainda não funciona no jogo.';
    if (no.juramento && !this.juramentosLiberados) return 'Em breve: o juramento chega junto com o refazer da árvore na fogueira.';
    const req = this.requisito(info);
    if (req) return req;
    if (info.linha && this.pontosNaLinha(elem, info.linha) + no.custo > linhaMax) return `A linha ${info.linha} já está cheia (${linhaMax} pontos).`;
    if (this.disponiveis() < no.custo) return no.custo > 1 ? `Precisa de ${no.custo} pontos disponíveis.` : 'Sem pontos disponíveis: suba de nível.';
    return null;
  }

  aprender(id) {
    const info = this.nos.get(id);
    if (!info || this.motivo(info)) return;
    this.pend[id] = (this.pend[id] ?? 0) + info.no.custo;
    this.game.sfx?.souls?.();
    this.render();
  }

  confirmar() {
    if (!this.totalPendente()) return;
    for (const [id, n] of Object.entries(this.pend)) this.hab.nos[id] = (this.hab.nos[id] ?? 0) + n;
    this.pend = {};
    this.game.player?.aoMudarHabilidades?.();
    this.game.salvar({ nuvem: true });
    this.game.sfx?.heal?.();
    this.game.ui.toast('Habilidades aprendidas.');
    this.render();
  }

  estadoReacao(x) {
    const ka = this.maestria(x.a.e.id), kb = this.maestria(x.b.e.id), max = this.cat.regras.reacao_abre_com_maestria;
    return ka >= max && kb >= max ? 'aberta' : ka > 0 && kb > 0 ? 'formando' : 'trancada';
  }

  // ---------- O desenho ----------
  render() {
    if (!this.cat) return;
    // o selecionado sumiu (Desfazer, Zerar)? solta a seleção
    if (this.sel?.startsWith('r:') ? !this.reacoes.some((x) => `r:${x.r.id}` === this.sel && this.reacaoVisivel(x))
      : this.sel && !(this.nos.get(this.sel) && this.visivel(this.nos.get(this.sel)))) this.sel = null;
    const partes = [], defs = [], agora = new Set(), antes = this.antesFace[this.face] ?? null;
    const arcana = this.face === 'arcana', forca = this.jurou('forca');
    // o que NASCE neste desenho ganha a animação (`atraso` e `dur` em segundos)
    const nasce = (chave) => { agora.add(chave); return !!antes && !antes.has(chave); };
    const traco = (chave, atraso, dur) => (nasce(chave)
      ? { cl: ' nasce-traco', at: ' pathLength="1"', st: `--atraso:${atraso}s;--dur:${dur}s;` } : { cl: '', at: '', st: '' });
    const surge = (chave, atraso) => (nasce(chave) ? { cl: ' nasce-no', st: `--atraso:${atraso}s;` } : { cl: '', st: '' });

    const reacoes = arcana ? this.reacoes.filter((x) => this.reacaoVisivel(x)) : [];
    const nos = [...this.nos.values()].filter((info) => info.face === this.face && this.visivel(info));
    const vistos = new Set(nos.map((info) => info.no.id));
    if (this.face === 'caminhos') {
      this.desenharCaminhos(nos, vistos, partes);
      this.svg.innerHTML = partes.join('');
      this.renderLado();
      return;
    }
    // o Juramento da Força Bruta APAGA e RACHA o círculo (a rachadura se desenha uma vez)
    if (arcana) {
      const rachaNova = forca && !!antes && !antes.has('racha');
      partes.push(`<g class="arv-arcano${forca ? (rachaNova ? ' apagando' : ' apagado') : ''}">`);
    }
    // a estrela: cada reta nova sai da Maestria que já estava e vai até a que chegou
    const DUR_RETA = 0.9, pares = arcana ? this.estrela() : [];
    let fimDoAro = 0;
    for (const { p, q } of pares) {
      const novaP = !!antes && !antes.has(p.e.arvore.maestria.id), novaQ = !!antes && !antes.has(q.e.arvore.maestria.id);
      const [de, para] = novaP && !novaQ ? [q, p] : [p, q];
      const t = traco(`reta:${[p.e.id, q.e.id].sort().join('|')}`, 0.35, DUR_RETA);
      if (t.cl) fimDoAro = Math.max(fimDoAro, 0.35 + DUR_RETA);
      partes.push(`<path class="arv-anel${t.cl}"${t.at} style="${t.st}" d="M${n1(de.x)} ${n1(de.y)} L${n1(para.x)} ${n1(para.y)}"/>`);
    }
    // a estrela fechada (os 7): o círculo de fora se desenha por cima, a partir do topo
    // (a Maestria nova surge quando a reta chega; o círculo vem depois dela)
    if (arcana && pares.length === this.elems.size) {
      const t = traco('circulo', Math.max(0.35, fimDoAro) + 0.4, 1.6);
      partes.push(`<path class="arv-anel arv-circulo${t.cl}"${t.at} style="${t.st}" d="M0 ${-R} A${R} ${R} 0 1 1 0 ${R} A${R} ${R} 0 1 1 0 ${-R}"/>`);
    }
    // os galhos das reações (por dentro do aro)
    for (const x of reacoes) {
      const id = x.r.id, ca = x.a.e.cor, cb = x.b.e.cor;
      const g = `x1="${n1(x.a.x)}" y1="${n1(x.a.y)}" x2="${n1(x.b.x)}" y2="${n1(x.b.y)}" gradientUnits="userSpaceOnUse"`;
      defs.push(`<linearGradient id="arv-c-${id}" ${g}><stop offset="0" stop-color="${ca}"/><stop offset="1" stop-color="${cb}"/></linearGradient>`,
        `<linearGradient id="arv-n-${id}" ${g}><stop offset=".5" stop-color="${ca}"/><stop offset=".5" stop-color="${cb}"/></linearGradient>`);
      const t = traco(`corda:${id}`, 0, 1);
      partes.push(`<line class="arv-corda ${this.estadoReacao(x)}${t.cl}"${t.at} style="${t.st}" x1="${n1(x.a.x)}" y1="${n1(x.a.y)}" x2="${n1(x.b.x)}" y2="${n1(x.b.y)}" stroke="url(#arv-c-${id})"/>`);
    }
    // os galhos dos elementos (para fora)
    for (const info of nos) {
      for (const pai of info.pais) {
        const p = this.nos.get(pai);
        if (!p || !vistos.has(pai)) continue;
        let d;
        if (arcana) {   // o galho sai do anel para fora, curvando
          const ap = Math.atan2(p.y, p.x), rm = (Math.hypot(p.x, p.y) + Math.hypot(info.x, info.y)) / 2;
          const [cx, cy] = polar(rm, ap);
          d = `M${n1(p.x)} ${n1(p.y)} Q${n1(cx)} ${n1(cy)} ${n1(info.x)} ${n1(info.y)}`;
        } else d = `M${n1(p.x)} ${n1(p.y)} L${n1(info.x)} ${n1(info.y)}`;
        const tem = this.pts(info.no.id) > 0 ? ' tem' : '';
        const t = traco(`galho:${pai}>${info.no.id}`, 0, 0.6);
        partes.push(`<path class="arv-galho${tem}${t.cl}"${t.at} style="--c:${info.cor};${t.st}" d="${d}"/>`);
      }
    }
    // os nós das reações
    for (const x of reacoes) {
      const est = this.estadoReacao(x), sel = this.sel === `r:${x.r.id}` ? ' sel' : '';
      const s = surge(`r:${x.r.id}`, 0.8);
      partes.push(`<g class="arv-no arv-reacao ${est}${sel}${s.cl}" style="${s.st}" data-id="r:${x.r.id}" transform="translate(${n1(x.x)} ${n1(x.y)})">` +
        `<title>${esc(x.r.conhecimento)} (${esc(x.a.e.nome)} + ${esc(x.b.e.nome)})</title>` +
        `<circle r="13" style="fill:url(#arv-n-${x.r.id})"/><text class="rotulo" y="27">${esc(x.r.nome)}</text></g>`);
    }
    // os nós dos elementos
    for (const info of nos) {
      const { no, elem } = info, k = this.rank(info);
      const est = [k > 0 ? 'tem' : this.motivo(info) ? 'trancado' : 'pode'];
      if (!elem.funcional) est.push('breve');
      if (this.pend[no.id]) est.push('novo');
      if (this.sel === no.id) est.push('sel');
      if (no.juramento) est.push('juramento');
      const raio = no.juramento ? 22 : no.tipo === 'maestria' ? 25 : no.tipo === 'suprema' ? 17 : 14;
      const s = surge(no.id, no.tipo === 'maestria' && arcana ? Math.max(0.35, fimDoAro) : 0.45);   // a Maestria nova espera o aro chegar
      partes.push(`<g class="arv-no ${no.tipo} ${est.join(' ')}${s.cl}" data-id="${no.id}" style="--c:${info.cor};${s.st}" transform="translate(${n1(info.x)} ${n1(info.y)})">` +
        `<title>${esc(no.nome)}</title>` +
        (no.tipo === 'suprema' ? `<circle class="arv-aro" r="${raio + 5}"/>` : '') +
        (no.juramento ? `<circle class="arv-aro" r="${raio + 11}"/>` : '') +
        `<circle r="${raio}"/><text class="arv-rank" dy="4">${k}/${no.ranks}</text>` +
        `<text class="rotulo" y="${raio + 16}">${esc(no.nome)}</text></g>`);
    }
    // os nomes dos elementos, por fora
    for (const { e, ang } of arcana ? this.elems.values() : []) {
      if (!this.mostrarTudo && !this.conhecido(e)) continue;
      const [x, y] = polar(LIMITE - 40, ang);
      const s = surge(`nome:${e.id}`, Math.max(0.35, fimDoAro));
      partes.push(`<text class="arv-elem${e.funcional ? '' : ' breve'}${s.cl}" data-elem="${e.id}" style="--c:${e.cor};${s.st}" x="${n1(x)}" y="${n1(y)}">${esc(e.nome.toUpperCase())}</text>`);
    }
    if (arcana) {
      partes.push('</g>');
      if (forca) for (const [i, d] of RACHAS.entries()) {
        const t = traco(i ? `racha:${i}` : 'racha', 0.3 + i * 0.5, 1.2);
        partes.push(`<path class="arv-racha${t.cl}"${t.at} style="${t.st}" d="${d}"/>`);
      }
    }
    this.svg.innerHTML = `<defs>${defs.join('')}</defs>${partes.join('')}`;
    this.antesFace[this.face] = agora;
    this.renderLado();
  }

  /**
   * A página dos CAMINHOS: o nome de cada começo acima da raiz, as ligações (do requisito ao
   * card, por baixo) e os cards. O card sem efeito no jogo leva uma bolinha no canto.
   */
  desenharCaminhos(nos, vistos, partes) {
    for (const c of this.comecos.values()) {
      const raiz = this.nos.get(c.raiz);
      if (raiz) partes.push(`<text class="arv-comeco" style="--c:${c.cor}" x="${n1(raiz.x)}" y="${n1(raiz.y - CARD.h / 2 - 14)}">${esc(c.nome.toUpperCase())}</text>`);
    }
    for (const info of nos) for (const pai of info.pais) {
      const p = this.nos.get(pai);
      if (!p || !vistos.has(pai)) continue;
      const tem = this.pts(info.no.id) > 0 ? ' tem' : '';
      partes.push(`<path class="arv-galho arv-fio${tem}" style="--c:${info.cor}" d="M${n1(p.x)} ${n1(p.y)} L${n1(info.x)} ${n1(info.y)}"/>`);
    }
    for (const info of nos) {
      const { no } = info, k = this.rank(info);
      const est = [k > 0 ? 'tem' : this.motivo(info) ? 'trancado' : 'pode', no.tipo];
      if (!efeitoDe(no.id)) est.push('breve');
      if (this.pend[no.id]) est.push('novo');
      if (this.sel === no.id) est.push('sel');
      const linhas = linhasDoNome(no.nome), y0 = linhas.length > 1 ? -9 : -3;
      partes.push(`<g class="arv-card ${est.join(' ')}" data-id="${no.id}" style="--c:${info.cor}" transform="translate(${n1(info.x)} ${n1(info.y)})">` +
        `<title>${esc(no.nome)}</title>` +
        `<rect x="${-CARD.w / 2}" y="${-CARD.h / 2}" width="${CARD.w}" height="${CARD.h}" rx="5"/>` +
        linhas.map((l, i) => `<text class="arv-card-nome" y="${y0 + i * 12}">${esc(l)}</text>`).join('') +
        `<text class="arv-card-pts" y="${CARD.h / 2 - 5}">${k}/${no.ranks}${no.custo > 1 ? ` · custa ${no.custo}` : ''}</text>` +
        (est.includes('breve') ? `<circle class="arv-card-breve" cx="${CARD.w / 2 - 7}" cy="${-CARD.h / 2 + 7}" r="3"><title>Ainda sem efeito no jogo</title></circle>` : '') +
        '</g>');
    }
  }

  renderLado() {
    const pend = this.totalPendente();
    this.pontos.innerHTML = `Pontos disponíveis <b>${this.treino ? '∞ (teste)' : this.disponiveis()}</b>` + (pend ? ` <span class="arv-pend">· ${pend} a confirmar</span>` : '');
    if (this.btTreino) { this.btTreino.classList.toggle('ligado', !!this.treino); this.btTreino.textContent = this.treino ? 'Sair do teste (volta a sua árvore)' : 'Pontos infinitos (teste)'; }
    this.btConfirmar.disabled = this.btDesfazer.disabled = !pend;
    if (this.btRefazer) this.btRefazer.textContent = performance.now() < this.refazendo ? 'Devolver todos os pontos?' : 'Refazer (beta)';

    const sel = this.sel;
    this.el.querySelector('[data-face="arcana"]')?.classList.toggle('trancada', !this.arteArcanaAberta());
    if (!sel && this.face === 'caminhos') {
      this.detalhe.innerHTML = `<p>Três <b>começos</b>, e você anda por quantos quiser: a <b>Batalha</b> (o golpe pesado, as armas, o escudo), o <b>Éter</b> (a barra, os milagres, a magia) e a <b>Esquiva</b> (o rolamento, a agilidade, a furtividade).</p>` +
        `<p>Cada galho desce em degraus que custam 1, 2 e 3 pontos; no fim fica a <b>identidade</b> (5), o que diz quem você é. Onde dois começos se encontram, nascem as identidades híbridas.</p>` +
        `<p>A barra é uma só: o Éter enche lutando; com o Conhecimento Arcano, vira Mana, que enche sozinha.</p>` +
        `<p class="arv-breve">Beta: card com bolinha no canto ainda não tem efeito no jogo (aceita ponto, para seguir o caminho). O Refazer devolve todos os pontos.</p>`;
      return;
    }
    if (!sel) {
      this.detalhe.innerHTML = (this.jurou('forca') ? `<p class="arv-motivo">Você fez o Juramento da Força Bruta: o círculo se apagou e os elementos se fecharam.</p>` : '') +
        `<p>Cada <b>elemento</b> é um galho: a Maestria é a raiz e, com ${this.cat.regras.maestria} pontos, o galho se abre em Magia, Defesa e Arma.</p>` +
        `<p>Os outros elementos se descobrem pelo caminho, e cada um entra no aro. Quando dois deles se encontram com Maestria ${this.cat.regras.reacao_abre_com_maestria}, nasce entre eles um <b>galho de reação</b>, com um Conhecimento próprio.</p>` +
        `<p>Com uma Maestria completa, nasce no centro do círculo o <b>Juramento da Canalização</b>: o Éter vira Mana, e você abre mão das técnicas de arma.</p>` +
        (this.mostrarTudo ? `<p class="arv-breve">Mostrando tudo, até o que no jogo fica escondido. Só o Fogo aceita pontos.</p>` : '');
      return;
    }
    if (sel.startsWith('r:')) {
      const x = this.reacoes.find((y) => `r:${y.r.id}` === sel);
      if (!x) return;
      const max = this.cat.regras.reacao_abre_com_maestria, est = this.estadoReacao(x);
      this.detalhe.innerHTML = `<h3>${esc(x.r.conhecimento)}</h3>` +
        `<div class="arv-sub">Reação: ${esc(x.r.nome)} · ${esc(x.a.e.nome)} + ${esc(x.b.e.nome)}</div>` +
        `<p>${esc(x.r.desc)}</p>` +
        `<p class="arv-motivo">${est === 'aberta' ? 'Galho aberto.' : `Abre com Maestria ${max} em ${esc(x.a.e.nome)} (${this.maestria(x.a.e.id)}/${max}) e em ${esc(x.b.e.nome)} (${this.maestria(x.b.e.id)}/${max}).`}</p>` +
        `<ul class="arv-lista">${x.r.nos.map((no) => `<li><b>${esc(no.nome)}</b> <span>${TIPO[no.tipo] ?? no.tipo}</span><br>${esc(no.desc)}</li>`).join('')}</ul>` +
        `<p class="arv-breve">Em breve: as árvores de reação ainda não funcionam no jogo.</p>`;
      return;
    }
    const info = this.nos.get(sel);
    if (!info) return;
    const { no, elem } = info, k = this.rank(info), mot = this.motivo(info);
    const tipo = TIPO[no.tipo] ?? no.tipo;
    const caminho = info.face === 'caminhos';
    const sub = (this.ehElemental(info)
      ? [tipo, COLUNA[no.coluna], elem.nome, info.linha ? `linha ${info.linha}` : null]
      : [tipo, elem.nome]).filter(Boolean).join(' · ');
    // nos Caminhos: o que o card faz NO JOGO (caminhos.js) e, se for ativa que já funciona, as vagas
    const efeito = caminho ? efeitoDe(no.id) : null;
    const ativa = caminho && ATIVAS[no.id] && this.hab.nos[no.id] > 0;
    this.detalhe.innerHTML = `<h3 style="color:${info.cor}">${esc(no.nome)}</h3><div class="arv-sub">${esc(sub)}</div>` +
      `<div class="arv-nivel">Pontos nela <b>${k}/${no.ranks}</b>${no.custo > 1 ? ` · custa ${no.custo} pontos` : ''}</div>` +
      (no.por_ponto?.filter(Boolean).length ? `<ol class="arv-ranks">${no.por_ponto.map((t, i) => `<li class="${i < k ? 'tem' : ''}">${esc(t)}</li>`).join('')}</ol>` : '') +
      (no.desc ? `<p>${esc(no.desc)}</p>` : '') +
      (caminho ? (efeito ? `<p class="arv-nojogo"><b>No jogo:</b> ${esc(efeito)}</p>` : `<p class="arv-breve">Ainda sem efeito no jogo (beta): o ponto vale para seguir o caminho.</p>`) : '') +
      (no.tipo === 'maestria' ? `<p class="arv-sub">${esc(elem.identidade ?? '')}</p>` : '') +
      (mot ? `<p class="arv-motivo">${esc(mot)}</p>` : '') +
      `<button class="arv-aprender" ${mot ? 'disabled' : ''}>Aprender (${no.custo} ${no.custo > 1 ? 'pontos' : 'ponto'})</button>` +
      (ativa ? `<div class="arv-vagas"><span>${esc(ATIVAS[no.id].nome)} na vaga:</span>${this.hab.barra.map((id, i) => `<button data-vaga="${i}" class="${id === no.id ? 'ativa' : ''}">${i + 1}</button>`).join('')}</div>` : '') +
      (elem.funcional ? '' : `<p class="arv-breve">Em breve.</p>`);
  }

  // ---------- Mover e aproximar ----------
  aplicarVista() {
    const v = this.vista;
    this.svg.setAttribute('viewBox', `${n1(v.x)} ${n1(v.y)} ${n1(v.w)} ${n1(v.w)}`);
    this.svg.classList.toggle('perto', v.w < PERTO);
  }

  prender(v) {
    const w = Math.min(2 * LIMITE, Math.max(260, v.w));
    const cx = Math.min(LIMITE - w / 2, Math.max(-LIMITE + w / 2, v.x + v.w / 2));
    const cy = Math.min(LIMITE - w / 2, Math.max(-LIMITE + w / 2, v.y + v.w / 2));
    return { x: cx - w / 2, y: cy - w / 2, w };
  }

  /** Aproxima (f < 1) ou afasta em volta do ponto (ux, uy) do desenho (o centro, se faltar). */
  zoom(f, ux, uy) {
    const v = this.vista;
    ux ??= v.x + v.w / 2; uy ??= v.y + v.w / 2;
    const w = v.w * f;
    this.vista = this.prender({ x: ux - (ux - v.x) * (w / v.w), y: uy - (uy - v.y) * (w / v.w), w });
    this.aplicarVista();
  }

  irPara(alvo) {
    const de = { ...this.vista }, para = this.prender(alvo), t0 = performance.now();
    cancelAnimationFrame(this.anim);
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / 320), s = k * k * (3 - 2 * k);
      this.vista = { x: de.x + (para.x - de.x) * s, y: de.y + (para.y - de.y) * s, w: de.w + (para.w - de.w) * s };
      this.aplicarVista();
      if (k < 1) this.anim = requestAnimationFrame(passo);
    };
    this.anim = requestAnimationFrame(passo);
  }

  /** O ponto do desenho sob o cursor (o SVG é quadrado dentro da caixa: `meet`). */
  noDesenho(e) {
    const r = this.svg.getBoundingClientRect(), lado = Math.min(r.width, r.height), upp = this.vista.w / lado;
    return [this.vista.x + (e.clientX - r.left - (r.width - lado) / 2) * upp, this.vista.y + (e.clientY - r.top - (r.height - lado) / 2) * upp, upp];
  }

  ligarMapa() {
    let arrasto = null;
    this.svg.addEventListener('pointerdown', (e) => {
      arrasto = { x: e.clientX, y: e.clientY, v: { ...this.vista }, moveu: false };
      this.svg.setPointerCapture(e.pointerId);
    });
    this.svg.addEventListener('pointermove', (e) => {
      if (!arrasto) return;
      const dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
      if (!arrasto.moveu && Math.hypot(dx, dy) < 5) return;
      arrasto.moveu = true;
      cancelAnimationFrame(this.anim);
      const upp = this.noDesenho(e)[2];
      this.vista = this.prender({ x: arrasto.v.x - dx * upp, y: arrasto.v.y - dy * upp, w: arrasto.v.w });
      this.aplicarVista();
    });
    this.svg.addEventListener('pointerup', (e) => {
      const a = arrasto;
      arrasto = null;
      if (!a || a.moveu || !this.cat) return;
      const alvo = document.elementFromPoint(e.clientX, e.clientY);
      const no = alvo?.closest?.('[data-id]'), nomeElem = alvo?.closest?.('[data-elem]');
      if (nomeElem) { this.focar(this.nos.get(`${nomeElem.dataset.elem}.maestria`)); return; }
      this.sel = no ? no.dataset.id : null;
      if (no && this.vista.w >= PERTO) this.focar(this.sel.startsWith('r:') ? this.reacoes.find((y) => `r:${y.r.id}` === this.sel) : this.nos.get(this.sel));
      this.render();
    });
    this.svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [ux, uy] = this.noDesenho(e);
      cancelAnimationFrame(this.anim);
      this.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, ux, uy);
    }, { passive: false });
  }

  /** Aproxima a vista de um nó: o galho inteiro de um elemento, ou a reação. */
  focar(alvo) {
    if (!alvo) return;
    if (alvo.r) { this.irPara({ x: alvo.x - 260, y: alvo.y - 260, w: 520 }); return; }
    if (!this.ehElemental(alvo)) { this.irPara({ x: alvo.x - 300, y: alvo.y - 300, w: 600 }); return; }
    const e = this.elems.get(alvo.elem.id);
    const [cx, cy] = polar(R + 150, e.ang);
    this.irPara({ x: cx - 340, y: cy - 340, w: 680 });
  }
}
