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
 */
import { pontosGastos } from './ficha.js';

const ORDEM = ['fogo', 'vento', 'luz', 'eletrico', 'agua', 'terra', 'trevas'];
const R = 250;                      // o raio do anel (onde ficam as Maestrias)
const LIMITE = 650;                 // metade do tamanho do desenho
const TUDO = { x: -LIMITE, y: -LIMITE, w: 2 * LIMITE };
const PERTO = 900;                  // vista mais estreita que isto mostra os nomes dos nós
const TIPO = { maestria: 'Maestria', ativa: 'Ativa', passiva: 'Passiva', suprema: 'Suprema' };
const COLUNA = { magia: 'Magia', defesa: 'Defesa', arma: 'Arma', base: 'Base' };

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
    this.antes = null;              // as chaves do que estava no último desenho (null = não animar)
    this.btConfirmar.addEventListener('click', () => this.confirmar());
    this.btDesfazer.addEventListener('click', () => { this.pend = {}; this.render(); });
    this.el.querySelector('.arv-tudo').addEventListener('click', () => this.irPara(TUDO));
    this.el.querySelector('.arv-mais').addEventListener('click', () => this.zoom(0.7));
    this.el.querySelector('.arv-menos').addEventListener('click', () => this.zoom(1 / 0.7));
    this.detalhe.addEventListener('click', (e) => {
      if (e.target.closest('.arv-aprender') && this.sel) this.aprender(this.sel);
    });
    this.ligarMapa();
  }

  get aberta() { return !this.el.classList.contains('hidden'); }

  abrir() {
    this.pend = {};
    this.el.classList.remove('hidden');
    this.aplicarVista();
    const pronta = () => { this.antes = null; this.normalizar(); this.vistaInicial(); this.render(); };
    if (this.cat) { pronta(); return; }
    this.detalhe.textContent = 'Carregando…';
    fetch('assets/habilidades.json', { cache: 'no-store' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((cat) => { this.montar(cat); if (this.aberta) pronta(); })
      .catch((e) => { this.detalhe.textContent = 'Não foi possível carregar as habilidades.'; console.warn('[arvore]', e); });
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
      this.nos.set(m.id, { no: m, elem: e, x, y, pais: [], linha: 0 });
      const por = (grupos, raio) => grupos.forEach((g, gi) => g.forEach((no, j) => {
        // os nós de uma linha ficam a ~95 unidades um do outro (perto do anel, o ângulo abre mais)
        const [nx, ny] = polar(raio(gi), ang + ((j - (g.length - 1) / 2) * 95) / raio(gi));
        const pais = (no.requer ?? []).length ? no.requer : [m.id];
        this.nos.set(no.id, { no, elem: e, x: nx, y: ny, pais, linha: e.arvore.modelo === 'linhas' ? gi + 1 : null });
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
  }

  /**
   * Ponto gasto acima do máximo de um nó (a Maestria era de 5 e passou a 3: D19) volta a ser
   * disponível — os disponíveis saem do nível, então basta cortar o excesso e gravar.
   */
  normalizar() {
    let mudou = false;
    for (const [id, n] of Object.entries(this.hab.nos)) {
      const info = this.nos.get(id);
      const max = info ? info.no.ranks * (info.no.custo || 1) : n;
      if (n > max) { this.hab.nos[id] = max; mudou = true; }
    }
    if (mudou) { this.game.salvar({ nuvem: true }); this.game.ui.toast('Os pontos acima do novo máximo da Maestria voltaram.'); }
  }

  /** A vista abre enquadrando os galhos dos elementos conhecidos (com o espaço para crescerem). */
  vistaInicial() {
    this.vista = this.prender(this.mostrarTudo ? TUDO : this.enquadrar());
    this.aplicarVista();
  }

  /** O quadro que cabe os galhos INTEIROS (até o escondido) e os nomes dos elementos conhecidos. */
  enquadrar() {
    const pts = [];
    for (const info of this.nos.values()) if (this.mostrarTudo || this.conhecido(info.elem)) pts.push([info.x, info.y]);
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
  disponiveis() { return Math.max(0, this.game.player.level - 1 - pontosGastos(this.hab) - this.totalPendente()); }
  maestria(idElem) { const m = this.nos.get(`${idElem}.maestria`); return m ? this.rank(m) : 0; }
  pontosNaLinha(elem, linha) {
    let s = 0;
    for (const info of this.nos.values()) if (info.elem === elem && info.linha === linha) s += this.pts(info.no.id);
    return s;
  }

  /** O personagem conhece este elemento? (por enquanto: o inicial, ou com ponto na Maestria) */
  conhecido(elem) { return !!elem.inicial || this.descobertos.has(elem.id) || this.pts(`${elem.id}.maestria`) > 0; }

  /** O requisito que falta para este nó ser LIBERADO (null = liberado). Não conta pontos. */
  requisito(info) {
    const { no, elem } = info;
    if (no.tipo === 'maestria') return this.conhecido(elem) ? null : 'Elemento ainda não descoberto.';
    const max = this.cat.regras.maestria, linhaMax = this.cat.regras.pontos_por_linha;
    const k = this.maestria(elem.id);
    if (k < max) return `Precisa de ${elem.arvore.maestria.nome} ${max} (tem ${k}).`;
    if (info.linha > 1 && this.pontosNaLinha(elem, info.linha - 1) < linhaMax) return `Abre quando a linha ${info.linha - 1} estiver cheia (${linhaMax} pontos).`;
    if (no.requer?.length && !no.requer.some((id) => this.pts(id) > 0)) {
      return `Precisa de 1 ponto em ${no.requer.map((id) => this.nos.get(id)?.no.nome ?? id).join(' ou ')}.`;
    }
    return null;
  }

  /** Aparece na tela? O que não está liberado fica escondido (D20). */
  visivel(info) { return this.mostrarTudo || this.pts(info.no.id) > 0 || !this.requisito(info); }
  reacaoVisivel(x) { return this.mostrarTudo || this.estadoReacao(x) === 'aberta'; }

  /** Por que este nó NÃO pode receber mais um ponto agora (null = pode). */
  motivo(info) {
    const { no, elem } = info;
    const linhaMax = this.cat.regras.pontos_por_linha;
    if (this.rank(info) >= no.ranks) return 'Já está no máximo.';
    if (!elem.funcional) return 'Em breve: este elemento ainda não funciona no jogo.';
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
    const partes = [], defs = [], agora = new Set(), antes = this.antes;
    // o que NASCE neste desenho ganha a animação (`atraso` e `dur` em segundos)
    const nasce = (chave) => { agora.add(chave); return !!antes && !antes.has(chave); };
    const traco = (chave, atraso, dur) => (nasce(chave)
      ? { cl: ' nasce-traco', at: ' pathLength="1"', st: `--atraso:${atraso}s;--dur:${dur}s;` } : { cl: '', at: '', st: '' });
    const surge = (chave, atraso) => (nasce(chave) ? { cl: ' nasce-no', st: `--atraso:${atraso}s;` } : { cl: '', st: '' });

    const reacoes = this.reacoes.filter((x) => this.reacaoVisivel(x));
    const nos = [...this.nos.values()].filter((info) => this.visivel(info));
    const vistos = new Set(nos.map((info) => info.no.id));
    // a estrela: cada reta nova sai da Maestria que já estava e vai até a que chegou
    const DUR_RETA = 0.9, pares = this.estrela();
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
    if (pares.length === this.elems.size) {
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
        const ap = Math.atan2(p.y, p.x), rm = (Math.hypot(p.x, p.y) + Math.hypot(info.x, info.y)) / 2;
        const [cx, cy] = polar(rm, ap);
        const tem = this.pts(info.no.id) > 0 ? ' tem' : '';
        const t = traco(`galho:${pai}>${info.no.id}`, 0, 0.6);
        partes.push(`<path class="arv-galho${tem}${t.cl}"${t.at} style="--c:${info.elem.cor};${t.st}" d="M${n1(p.x)} ${n1(p.y)} Q${n1(cx)} ${n1(cy)} ${n1(info.x)} ${n1(info.y)}"/>`);
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
      const raio = no.tipo === 'maestria' ? 25 : no.tipo === 'suprema' ? 17 : 14;
      const s = surge(no.id, no.tipo === 'maestria' ? Math.max(0.35, fimDoAro) : 0.45);   // a Maestria nova espera o aro chegar
      partes.push(`<g class="arv-no ${no.tipo} ${est.join(' ')}${s.cl}" data-id="${no.id}" style="--c:${elem.cor};${s.st}" transform="translate(${n1(info.x)} ${n1(info.y)})">` +
        `<title>${esc(no.nome)}</title>` +
        (no.tipo === 'suprema' ? `<circle class="arv-aro" r="${raio + 5}"/>` : '') +
        `<circle r="${raio}"/><text class="arv-rank" dy="4">${k}/${no.ranks}</text>` +
        `<text class="rotulo" y="${raio + 16}">${esc(no.nome)}</text></g>`);
    }
    // os nomes dos elementos, por fora
    for (const { e, ang } of this.elems.values()) {
      if (!this.mostrarTudo && !this.conhecido(e)) continue;
      const [x, y] = polar(LIMITE - 40, ang);
      const s = surge(`nome:${e.id}`, Math.max(0.35, fimDoAro));
      partes.push(`<text class="arv-elem${e.funcional ? '' : ' breve'}${s.cl}" data-elem="${e.id}" style="--c:${e.cor};${s.st}" x="${n1(x)}" y="${n1(y)}">${esc(e.nome.toUpperCase())}</text>`);
    }
    this.svg.innerHTML = `<defs>${defs.join('')}</defs>${partes.join('')}`;
    this.antes = agora;
    this.renderLado();
  }

  renderLado() {
    const pend = this.totalPendente();
    this.pontos.innerHTML = `Pontos disponíveis <b>${this.disponiveis()}</b>` + (pend ? ` <span class="arv-pend">· ${pend} a confirmar</span>` : '');
    this.btConfirmar.disabled = this.btDesfazer.disabled = !pend;

    const sel = this.sel;
    if (!sel) {
      this.detalhe.innerHTML = `<p>Cada <b>elemento</b> é um galho: a Maestria é a raiz e, com ${this.cat.regras.maestria} pontos, o galho se abre em Magia, Defesa e Arma.</p>` +
        `<p>Os outros elementos se descobrem pelo caminho, e cada um entra no aro. Quando dois deles se encontram com Maestria ${this.cat.regras.reacao_abre_com_maestria}, nasce entre eles um <b>galho de reação</b>, com um Conhecimento próprio.</p>` +
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
    const sub = [TIPO[no.tipo] ?? no.tipo, COLUNA[no.coluna], elem.nome, info.linha ? `linha ${info.linha}` : null].filter(Boolean).join(' · ');
    this.detalhe.innerHTML = `<h3 style="color:${elem.cor}">${esc(no.nome)}</h3><div class="arv-sub">${esc(sub)}</div>` +
      `<div class="arv-nivel">Pontos nela <b>${k}/${no.ranks}</b>${no.custo > 1 ? ` · custa ${no.custo} pontos` : ''}</div>` +
      (no.por_ponto?.length ? `<ol class="arv-ranks">${no.por_ponto.map((t, i) => `<li class="${i < k ? 'tem' : ''}">${esc(t)}</li>`).join('')}</ol>` : '') +
      `<p>${esc(no.desc)}</p>` +
      (no.tipo === 'maestria' ? `<p class="arv-sub">${esc(elem.identidade ?? '')}</p>` : '') +
      (mot ? `<p class="arv-motivo">${esc(mot)}</p>` : '') +
      `<button class="arv-aprender" ${mot ? 'disabled' : ''}>Aprender (${no.custo} ${no.custo > 1 ? 'pontos' : 'ponto'})</button>` +
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
    const e = this.elems.get(alvo.elem.id);
    const [cx, cy] = polar(R + 150, e.ang);
    this.irPara({ x: cx - 340, y: cy - 340, w: 680 });
  }
}
