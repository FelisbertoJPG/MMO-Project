/**
 * EDITOR DE ÁRVORE — a lógica da página (o servidor é o editor-arvore.mjs, ao lado).
 *
 * O estado: os quadrinhos (`nos`) e as ligações (`ligacoes`): o quadrinho `de` é REQUISITO do
 * `para`, pedindo `min` pontos nele. Gravar converte para o formato do catálogo do jogo: cada nó
 * com `requer_minimo` ({ id do requisito: pontos }), e o `id` sai do nome (`novato.golpe_basico`).
 */
const $ = (s) => document.querySelector(s);
// sem ?arvore=: abre a página dos Caminhos do JOGO (a do gerar-catalogo.mjs; é a que a aba Árvore do
// Editor de Personagem mostra) — e, se ela sumir, a 1ª que existir
const PEDIDA = new URLSearchParams(location.search).get('arvore');
const ARVORE = (PEDIDA || 'resumo-3-comecos').toLowerCase();
const NOME_OK = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const GRADE = 10, LARG = 150, MUNDO = 10000;
const TIPOS = { passiva: 'Passiva', ativa: 'Ativa', identidade: 'Identidade', identidade2: 'Identidade 2º grau', classe: 'Libera classe' };

const tela = $('#tela'), mundo = $('#mundo'), fios = $('#fios'), camada = $('#nos'), painel = $('#painel');

let est = { nome: '', pontos: 10, nos: [], ligacoes: [] };
let sel = null;              // { tipo: 'no', uid } | { tipo: 'lig', i }
let vista = { x: 0, y: 0, z: 1 };
let arrasto = null;          // mover um quadrinho, puxar o fundo ou ligar
let sujo = false;
let podeSalvar = false;      // só depois de LER o arquivo: falhar em ler nunca grava por cima
let proximo = 1;
const pilha = [];            // fotos do estado, para o Ctrl+Z
const tam = new Map();       // uid → [largura, altura] do quadrinho

const novoUid = () => 'q' + proximo++;
const acharNo = (uid) => est.nos.find((n) => n.uid === uid);
const snap = (v) => Math.round(v / GRADE) * GRADE;
const inteiro = (v, a, b) => Math.min(b, Math.max(a, Math.round(Number(v) || 0)));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'sem_nome';
const nomeDe = (n) => n?.nome || 'Sem nome';

let tAviso = 0;
function avisar(t) {
  const e = $('#toast');
  e.textContent = t; e.classList.add('ver');
  clearTimeout(tAviso); tAviso = setTimeout(() => e.classList.remove('ver'), 2400);
}

// ---------- desfazer e "não salvo" ----------
const foto = () => JSON.stringify(est);
function empilhar(f = foto()) { pilha.push(f); if (pilha.length > 200) pilha.shift(); }
function desfazer() {
  const f = pilha.pop();
  if (!f) return avisar('Nada para desfazer.');
  est = JSON.parse(f); sel = null; marcarSujo(); tudo();
}
function marcarSujo(v = true) {
  sujo = v;
  const e = $('#t-estado');
  e.textContent = v ? 'não salvo' : (e.dataset.salvo || '');
  e.classList.toggle('sujo', v);
  // AO VIVO: grava sozinho logo depois da última mudança (na página dos Caminhos, o jogo local muda na hora)
  if (v && aoVivo && podeSalvar) { clearTimeout(tSalvar); tSalvar = setTimeout(salvar, 700); }
}
let aoVivo = false, tSalvar = 0;
try { aoVivo = localStorage.getItem('editor-arvore:aovivo') !== '0'; } catch { aoVivo = true; }
/** Liga um campo ao estado: a 1ª mudança de cada vez que ele ganha o foco vai para o Ctrl+Z. */
function editavel(el, aplicar, evento = 'input') {
  let comecou = false;
  el.addEventListener('focus', () => (comecou = false));
  el.addEventListener(evento, () => {
    if (!comecou) { empilhar(); comecou = true; }
    aplicar(el); marcarSujo();
  });
}

// ---------- vista (mover e zoom) ----------
function aplicarVista() {
  mundo.style.transform = `translate(${vista.x}px, ${vista.y}px) scale(${vista.z})`;
  const g = 20 * vista.z, G = g * 5;
  tela.style.backgroundSize = `${g}px ${g}px, ${g}px ${g}px, ${G}px ${G}px, ${G}px ${G}px`;
  tela.style.backgroundPosition = `${vista.x}px ${vista.y}px`;
}
function paraMundo(ev) {
  const r = tela.getBoundingClientRect();
  return [(ev.clientX - r.left - vista.x) / vista.z, (ev.clientY - r.top - vista.y) / vista.z];
}
function verTudo() {
  const r = tela.getBoundingClientRect();
  if (!est.nos.length) { vista = { x: r.width / 2, y: r.height / 2, z: 1 }; return aplicarVista(); }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of est.nos) {
    const [w, h] = tam.get(n.uid) ?? [LARG, 60];
    x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x + w); y1 = Math.max(y1, n.y + h);
  }
  const m = 70;
  const z = Math.min(1.25, Math.max(0.3, Math.min((r.width - 2 * m) / (x1 - x0), (r.height - 2 * m) / (y1 - y0))));
  vista = { z, x: r.width / 2 - ((x0 + x1) / 2) * z, y: r.height / 2 - ((y0 + y1) / 2) * z };
  aplicarVista();
}

// ---------- quadrinhos ----------
function textoPts(n) {
  if (n.tipo === 'classe') return n.requer_total > 0 ? `libera a classe · ${n.requer_total} pts gastos` : 'libera a classe';
  if (n.custo === 0) return `${n.ranks} ${n.ranks === 1 ? 'nível' : 'níveis'} · de missão, não gasta ponto`;
  const p = `${n.ranks} ${n.ranks === 1 ? 'ponto' : 'pontos'}`;
  return n.custo > 1 ? `${p} · ${n.custo} cada` : p;
}
function preencher(el, n) {
  el.className = `no tipo-${n.tipo}` + (n.custo === 0 && n.tipo !== 'classe' ? ' missao' : '') + (sel?.tipo === 'no' && sel.uid === n.uid ? ' sel' : '');
  el.style.left = n.x + 'px';
  el.style.top = n.y + 'px';
  el.querySelector('.no-tipo').textContent = TIPOS[n.tipo] ?? n.tipo;
  el.querySelector('.no-nome').textContent = nomeDe(n);
  el.querySelector('.no-pts').textContent = textoPts(n);
}
function renderNos() {
  camada.textContent = '';
  for (const n of est.nos) {
    const el = document.createElement('div');
    el.dataset.uid = n.uid;
    el.innerHTML = '<div class="no-tipo"></div><div class="no-nome"></div><div class="no-pts"></div>' +
      '<div class="alca" title="Arraste até outro quadrinho: este vira requisito dele"></div>';
    preencher(el, n);
    camada.append(el);
  }
  tam.clear();
  for (const el of camada.children) tam.set(el.dataset.uid, [el.offsetWidth, el.offsetHeight]);
}
function atualizarNo(n) {
  const el = camada.querySelector(`[data-uid="${n.uid}"]`);
  if (!el) return;
  preencher(el, n);
  tam.set(n.uid, [el.offsetWidth, el.offsetHeight]);
}
function criarNo(wx, wy) {
  empilhar();
  const n = {
    uid: novoUid(), nome: 'Nova habilidade', tipo: 'passiva', ranks: 1, custo: 1, por_ponto: [''], desc: '',
    eter: 0, recarga: 0, requer_total: 0, x: snap(wx - LARG / 2), y: snap(wy - 30),
  };
  est.nos.push(n);
  sel = { tipo: 'no', uid: n.uid };
  marcarSujo(); tudo();
  const campo = $('#f-nome');
  campo?.focus(); campo?.select();
}
/**
 * O id de cada quadrinho no arquivo. Ele NASCE do nome (`<árvore>.<nome sem acento>`, com _2,
 * _3… se repetir) e depois FICA: renomear o card não muda o id — o jogo acha o efeito e os
 * pontos de cada card pelo id (js/caminhos.js), e o nome é só o que aparece.
 */
function idsDosNos() {
  const ids = new Map(), usados = new Set();
  for (const n of est.nos) if (n.id && !usados.has(n.id)) { usados.add(n.id); ids.set(n.uid, n.id); }
  for (const n of est.nos) {
    if (ids.has(n.uid)) continue;   // card novo (ou cópia): o id sai do nome
    const base = `${ARVORE}.${slug(n.nome)}`;
    let id = base, k = 2;
    while (usados.has(id)) id = `${base}_${k++}`;
    usados.add(id); ids.set(n.uid, id); n.id = id;
  }
  return ids;
}

// ---------- ligações ----------
function centro(n) { const [w, h] = tam.get(n.uid) ?? [LARG, 60]; return [n.x + w / 2, n.y + h / 2, w, h]; }
function naBorda([cx, cy, w, h], dx, dy) {
  const s = Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity);
  return [cx + dx * s, cy + dy * s];
}
function pontas(a, b) {
  const ca = centro(a), cb = centro(b);
  const dx = cb[0] - ca[0], dy = cb[1] - ca[1], d = Math.hypot(dx, dy) || 1;
  return [naBorda(ca, dx / d, dy / d), naBorda(cb, -dx / d, -dy / d)];
}
const impossivel = (l) => { const a = acharNo(l.de); return a && a.tipo !== 'classe' && l.min > a.ranks; };
function renderFios() {
  let s = '<defs><marker id="seta" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto">' +
    `<path d="M0,0L10,5L0,10z" fill="#a88e58"/></marker></defs><g transform="translate(${MUNDO},${MUNDO})">`;
  est.ligacoes.forEach((l, i) => {
    const a = acharNo(l.de), b = acharNo(l.para);
    if (!a || !b) return;
    const [[x1, y1], [x2, y2]] = pontas(a, b);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const cls = ['fio'];
    if (sel?.tipo === 'lig' && sel.i === i) cls.push('sel');
    if (impossivel(l)) cls.push('impossivel');
    const linha = `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`;
    s += `<g class="${cls.join(' ')}"><line class="fio-linha" ${linha} marker-end="url(#seta)"/>` +
      `<line class="fio-alvo" data-i="${i}" ${linha}/>` +
      `<g class="fio-rot" data-i="${i}"><circle cx="${mx}" cy="${my}" r="10"/><text x="${mx}" y="${my}">${a.tipo === 'classe' ? '✓' : l.min}</text></g></g>`;
  });
  if (arrasto?.modo === 'ligar' && arrasto.ponta) {
    const c = centro(acharNo(arrasto.de));
    s += `<line class="fio-temp" x1="${c[0]}" y1="${c[1]}" x2="${arrasto.ponta[0]}" y2="${arrasto.ponta[1]}"/>`;
  }
  fios.innerHTML = s + '</g>';
}
/** Existe caminho de → … → ate? (para não fechar um círculo de requisitos) */
function alcanca(de, ate) {
  const vistos = new Set(), fila = [de];
  while (fila.length) {
    const u = fila.pop();
    if (u === ate) return true;
    if (vistos.has(u)) continue;
    vistos.add(u);
    for (const l of est.ligacoes) if (l.de === u) fila.push(l.para);
  }
  return false;
}
function ligar(de, para) {
  if (est.ligacoes.some((l) => l.de === de && l.para === para)) return avisar('Essa ligação já existe.');
  if (alcanca(para, de)) return avisar('Assim fecharia um círculo: um seria requisito do outro.');
  empilhar();
  est.ligacoes.push({ de, para, min: 1 });
  sel = { tipo: 'lig', i: est.ligacoes.length - 1 };
  marcarSujo(); tudo();
}

// ---------- seleção e painel ----------
function selecionar(s) {
  sel = s;
  for (const el of camada.children) el.classList.toggle('sel', s?.tipo === 'no' && s.uid === el.dataset.uid);
  renderFios(); renderPainel();
}
function apagarSelecao() {
  if (!sel) return;
  empilhar();
  if (sel.tipo === 'no') {
    const uid = sel.uid;
    est.nos = est.nos.filter((n) => n.uid !== uid);
    est.ligacoes = est.ligacoes.filter((l) => l.de !== uid && l.para !== uid);
  } else est.ligacoes.splice(sel.i, 1);
  sel = null; marcarSujo(); tudo();
}

const AJUDA = () => `<div class="ajuda"><h2>Como usar</h2>
  <p><b>Duplo clique</b> no fundo (ou <b>+ Quadrinho</b>) cria uma habilidade.</p>
  <p>Arraste a <b>bolinha dourada</b> de um quadrinho até outro: o primeiro vira <b>requisito</b> do segundo. O número na ligação é quantos pontos o requisito pede.</p>
  <p>Clique num quadrinho ou numa ligação para editar. <b>Del</b> apaga, <b>Ctrl+Z</b> desfaz, <b>Ctrl+S</b> salva.</p>
  <p>O tipo <b>Libera classe</b> é o quadrinho de uma classe: não recebe pontos, só abre quando os requisitos dele estão cumpridos (ex.: 3 pontos em uma skill e 10 pontos gastos na árvore).</p>
  <p>O tipo <b>Identidade</b> recebe pontos como uma passiva, mas aparece em roxo: é o "buff" caro no fim de um caminho, o que diz quem o jogador é (ex.: muda a forma do Éter). A <b>Identidade 2º grau</b> (dourada) pede uma identidade e uma caminhada até outro lado da árvore: a evolução dela.</p>
  <p>Salvar grava <code>planejamento/arvores/${esc(ARVORE)}.json</code>, que o Claude lê.</p></div>`;

function renderPainel() {
  if (sel?.tipo === 'no' && acharNo(sel.uid)) return painelNo(acharNo(sel.uid));
  if (sel?.tipo === 'lig' && est.ligacoes[sel.i]) return painelLig(est.ligacoes[sel.i]);
  if (modoBalanco) return painelBalanco();
  painel.innerHTML = AJUDA();
}

// ---------- O BALANCEAMENTO (assets/balanco.json; o jogo local muda na hora: js/ao-vivo.js) ----------
let modoBalanco = false, balanco = null, tBalanco = 0;
$('#b-balanco').addEventListener('click', () => {
  modoBalanco = !modoBalanco;
  $('#b-balanco').classList.toggle('ligado', modoBalanco);
  sel = null;
  tudo();
});

async function painelBalanco() {
  if (!balanco) {
    painel.innerHTML = '<p class="vazio">Lendo o balanceamento…</p>';
    try { balanco = await fetch('balanco').then((r) => (r.ok ? r.json() : Promise.reject(new Error('HTTP ' + r.status)))); }
    catch (e) { painel.innerHTML = `<p class="aviso">Não deu para ler assets/balanco.json: ${esc(e.message)}</p>`; return; }
    if (!modoBalanco || sel) return;
  }
  const campos = Object.entries(balanco.campos);
  painel.innerHTML = '<h2>Balanceamento</h2>' +
    '<p class="vazio">O golpe e o vigor do jogador. Mexeu, o jogo local (localhost:5173) muda na hora: é só bater de novo. Grava em <code>assets/balanco.json</code>.</p>' +
    campos.map(([k, c]) => `<label class="bal"><span>${esc(c.rotulo)} <i>antes: ${c.antes}</i></span>` +
      `<div class="linha"><input type="range" data-k="${k}" min="${c.min}" max="${c.max}" step="${c.passo}" value="${c.valor}">` +
      `<input type="number" data-k="${k}" min="${c.min}" max="${c.max}" step="${c.passo}" value="${c.valor}"></div>` +
      `<small>${esc(c.desc)}</small></label>`).join('') +
    '<div class="bal-conta" id="bal-conta"></div>';
  painel.querySelectorAll('.bal input').forEach((inp) => inp.addEventListener('input', () => {
    const k = inp.dataset.k, v = Number(inp.value);
    if (!Number.isFinite(v)) return;
    painel.querySelectorAll(`.bal input[data-k="${k}"]`).forEach((o) => { if (o !== inp) o.value = v; });
    balanco.campos[k].valor = v;
    contaDoBalanco();
    clearTimeout(tBalanco);
    tBalanco = setTimeout(gravarBalanco, 250);
  }));
  contaDoBalanco();
}

/** Quantos golpes leves seguidos cabem na barra cheia do nível 1, por arma (a referência do arquivo). */
function contaDoBalanco() {
  const caixa = $('#bal-conta');
  if (!caixa || !balanco) return;
  const ref = balanco._referencia ?? {}, vigor = ref.vigor_no_nivel_1 ?? 90, k = balanco.campos.golpe_vigor?.valor ?? 1;
  const vel = balanco.campos.golpe_velocidade?.valor ?? 1, minimo = balanco.campos.golpe_vigor_minimo?.valor ?? 0;
  // o golpe só começa com vigor > 0 e ≥ o mínimo (Player.vigorParaGolpe)
  const golpes = (custo) => { let v = vigor, n = 0; while (v > 0 && v >= minimo && n < 99) { v -= custo * k; n++; } return n; };
  caixa.innerHTML = `Golpes leves seguidos com a barra cheia (nível 1, vigor ${vigor}${minimo ? `, mínimo ${minimo} para golpear` : ''}):<br>` +
    Object.entries(ref.vigor_por_golpe_das_armas ?? {}).map(([arma, custo]) => `${esc(arma)}: <b>${golpes(custo)}</b>`).join(' · ') +
    `<br>Cada golpe leva <b>${Math.round(100 / vel)}%</b> do tempo de antes desta rodada.` +
    (balanco.campos.rolamento_vigor ? (() => {
      const r = balanco.campos, custo = r.rolamento_vigor.valor;
      let v = vigor, n = 0;
      while (v > 0 && n < 99) { v -= custo; n++; }   // o rolamento só pede vigor > 0
      return `<br>Rolamentos seguidos com a barra cheia: <b>${n}</b> · cada um leva <b>${r.rolamento_duracao.valor}s</b>, ` +
        `percorre uns <b>${(4.14 * r.rolamento_distancia.valor).toFixed(1)} m</b> e fica <b>${r.rolamento_invulneravel.valor}s</b> invulnerável (antes da árvore e da carga).`;
    })() : '');
}

async function gravarBalanco() {
  try {
    const valores = Object.fromEntries(Object.entries(balanco.campos).map(([k, c]) => [k, c.valor]));
    const r = await fetch('balanco', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(valores) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'HTTP ' + r.status);
    avisar(j.jogos ? `Balanceamento no jogo (${j.jogos} ligado${j.jogos > 1 ? 's' : ''})` : 'Gravado (nenhum jogo local ligado: abra localhost:5173)');
  } catch (e) {
    avisar('Não gravou o balanceamento: ' + e.message);
  }
}

function renderPor(n) {
  const caixa = $('#f-por');
  if (!caixa) return;
  while (n.por_ponto.length < n.ranks) n.por_ponto.push('');
  caixa.innerHTML = Array.from({ length: n.ranks }, (_, k) =>
    `<div class="ponto"><b>${k + 1}º</b><input data-k="${k}" placeholder="o que este ponto dá"></div>`).join('');
  caixa.querySelectorAll('input').forEach((inp) => {
    const k = Number(inp.dataset.k);
    inp.value = n.por_ponto[k] ?? '';
    editavel(inp, () => { n.por_ponto[k] = inp.value; });
  });
}

function painelNo(n) {
  const entram = est.ligacoes.map((l, i) => [l, i]).filter(([l]) => l.para === n.uid && acharNo(l.de));
  const saem = est.ligacoes.filter((l) => l.de === n.uid).map((l) => nomeDe(acharNo(l.para)));
  const classe = n.tipo === 'classe';
  painel.innerHTML = `<h2>Quadrinho</h2>
    <label class="campo"><span>Nome</span><input id="f-nome"></label>
    <label class="campo"><span>Tipo</span><select id="f-tipo">${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    ${classe ? '' : `<div class="linha">
      <label class="campo"><span>Pontos máximos</span><input id="f-ranks" type="number" min="1" max="20"></label>
      <label class="campo"><span>Custo por ponto (0 = de missão)</span><input id="f-custo" type="number" min="0" max="10"></label></div>
    <h3>O que cada ponto dá</h3><div id="f-por"></div>`}
    ${n.tipo === 'ativa' ? `<div class="linha">
      <label class="campo"><span>Éter</span><input id="f-eter" type="number" min="0" max="999"></label>
      <label class="campo"><span>Recarga (s)</span><input id="f-recarga" type="number" min="0" max="999" step="0.5"></label></div>` : ''}
    <label class="campo"><span>Descrição</span><textarea id="f-desc"></textarea></label>
    <h3>Requisitos</h3>
    ${entram.length ? entram.map(([l, i]) => {
      const a = acharNo(l.de);
      return a.tipo === 'classe'
        ? `<div class="req"><span>ter a classe <b>${esc(nomeDe(a))}</b></span><button class="f-tirar" data-i="${i}" title="Tirar este requisito">✕</button></div>`
        : `<div class="req"><span>${esc(nomeDe(a))}</span><input class="f-min" type="number" min="1" max="20" data-i="${i}"> pts<button class="f-tirar" data-i="${i}" title="Tirar este requisito">✕</button></div>`;
    }).join('') : '<p class="vazio">Nenhum: liberado desde o começo. Para pôr um, arraste a bolinha de outro quadrinho até este.</p>'}
    ${entram.some(([l]) => impossivel(l)) ? '<p class="aviso">Um requisito pede mais pontos do que o quadrinho dele tem: assim nunca abre.</p>' : ''}
    <label class="campo" style="margin-top:10px"><span>Pontos já gastos nesta árvore (mínimo; 0 = nenhum)</span><input id="f-total" type="number" min="0" max="999"></label>
    ${saem.length ? `<h3>Abre</h3><p class="vazio">${saem.map(esc).join(', ')}</p>` : ''}
    <p class="id">no arquivo: ${esc(idsDosNos().get(n.uid))}</p>
    <button id="f-apagar" class="perigo">Apagar quadrinho (Del)</button>`;

  const nome = $('#f-nome');
  nome.value = n.nome;
  editavel(nome, () => { n.nome = nome.value; atualizarNo(n); renderFios(); });
  const tipo = $('#f-tipo');
  tipo.value = n.tipo;
  editavel(tipo, () => { n.tipo = tipo.value; atualizarNo(n); renderFios(); renderSoma(); painelNo(n); }, 'change');
  const ranks = $('#f-ranks');
  if (ranks) {
    ranks.value = n.ranks;
    editavel(ranks, () => { n.ranks = inteiro(ranks.value, 1, 20); atualizarNo(n); renderFios(); renderSoma(); renderPor(n); });
    renderPor(n);
  }
  const custo = $('#f-custo');
  if (custo) { custo.value = n.custo; editavel(custo, () => { n.custo = inteiro(custo.value, 0, 10); atualizarNo(n); renderSoma(); }); }
  const eter = $('#f-eter');
  if (eter) { eter.value = n.eter; editavel(eter, () => { n.eter = inteiro(eter.value, 0, 999); }); }
  const recarga = $('#f-recarga');
  if (recarga) { recarga.value = n.recarga; editavel(recarga, () => { n.recarga = Math.min(999, Math.max(0, Number(recarga.value) || 0)); }); }
  const desc = $('#f-desc');
  desc.value = n.desc;
  editavel(desc, () => { n.desc = desc.value; });
  const total = $('#f-total');
  total.value = n.requer_total;
  editavel(total, () => { n.requer_total = inteiro(total.value, 0, 999); atualizarNo(n); renderFios(); });
  painel.querySelectorAll('.f-min').forEach((inp) => {
    inp.value = est.ligacoes[Number(inp.dataset.i)].min;
    editavel(inp, () => { est.ligacoes[Number(inp.dataset.i)].min = inteiro(inp.value, 1, 20); renderFios(); });
  });
  painel.querySelectorAll('.f-tirar').forEach((b) => b.addEventListener('click', () => {
    empilhar();
    est.ligacoes.splice(Number(b.dataset.i), 1);
    marcarSujo(); renderFios(); painelNo(n);
  }));
  $('#f-apagar').addEventListener('click', apagarSelecao);
}

function painelLig(l) {
  const a = acharNo(l.de), b = acharNo(l.para);
  const classe = a?.tipo === 'classe';
  painel.innerHTML = `<h2>Ligação</h2>
    <p><b>${esc(nomeDe(a))}</b> é requisito de <b>${esc(nomeDe(b))}</b>.</p>
    ${classe ? '<p class="vazio">Pede que a classe esteja liberada.</p>'
      : `<label class="campo"><span>Pontos que pede em ${esc(nomeDe(a))}</span><input id="f-min" type="number" min="1" max="20"></label>
         ${impossivel(l) ? `<p class="aviso">${esc(nomeDe(a))} só vai até ${a.ranks}: assim nunca abre.</p>` : ''}`}
    <button id="f-apagar" class="perigo">Apagar ligação (Del)</button>`;
  const min = $('#f-min');
  if (min) { min.value = l.min; editavel(min, () => { l.min = inteiro(min.value, 1, 20); renderFios(); }); }
  $('#f-apagar').addEventListener('click', apagarSelecao);
}

// ---------- topo ----------
function renderSoma() {
  const soma = est.nos.filter((n) => n.tipo !== 'classe').reduce((s, n) => s + n.ranks * n.custo, 0);
  $('#t-soma').textContent = `${est.nos.length} quadrinho(s) · soma dos máximos: ${soma} pts`;
}
function renderTopo() {
  $('#t-nome').value = est.nome;
  $('#t-pontos').value = est.pontos;
  renderSoma();
}
function tudo() { renderNos(); renderFios(); renderPainel(); renderTopo(); }

// ---------- o mouse na tela ----------
tela.addEventListener('pointerdown', (ev) => {
  if (ev.button !== 0) return;
  const alca = ev.target.closest('.alca'), noEl = ev.target.closest('.no'), fio = ev.target.closest('.fio-alvo, .fio-rot');
  if (alca && noEl) {
    arrasto = { modo: 'ligar', de: noEl.dataset.uid, ponta: null };
  } else if (noEl) {
    const n = acharNo(noEl.dataset.uid);
    selecionar({ tipo: 'no', uid: n.uid });
    const [wx, wy] = paraMundo(ev);
    arrasto = { modo: 'mover', uid: n.uid, dx: wx - n.x, dy: wy - n.y, moveu: false, foto: foto() };
  } else if (fio) {
    selecionar({ tipo: 'lig', i: Number(fio.dataset.i) });
  } else {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    selecionar(null);
    arrasto = { modo: 'pan', x0: ev.clientX, y0: ev.clientY, vx: vista.x, vy: vista.y };
    tela.classList.add('puxando');
  }
  if (arrasto) tela.setPointerCapture(ev.pointerId);
});
tela.addEventListener('pointermove', (ev) => {
  if (!arrasto) return;
  if (arrasto.modo === 'pan') {
    vista.x = arrasto.vx + ev.clientX - arrasto.x0;
    vista.y = arrasto.vy + ev.clientY - arrasto.y0;
    aplicarVista();
  } else if (arrasto.modo === 'mover') {
    const [wx, wy] = paraMundo(ev), n = acharNo(arrasto.uid);
    const nx = snap(wx - arrasto.dx), ny = snap(wy - arrasto.dy);
    if (nx === n.x && ny === n.y) return;
    if (!arrasto.moveu) { empilhar(arrasto.foto); arrasto.moveu = true; }
    n.x = nx; n.y = ny;
    atualizarNo(n); renderFios(); marcarSujo();
  } else if (arrasto.modo === 'ligar') {
    arrasto.ponta = paraMundo(ev);
    renderFios();
  }
});
function soltar(ev) {
  if (arrasto?.modo === 'ligar' && ev.type === 'pointerup') {
    const alvo = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.no');
    if (alvo && alvo.dataset.uid !== arrasto.de) { const de = arrasto.de; arrasto = null; ligar(de, alvo.dataset.uid); }
  }
  arrasto = null;
  tela.classList.remove('puxando');
  renderFios();
}
tela.addEventListener('pointerup', soltar);
tela.addEventListener('pointercancel', soltar);
tela.addEventListener('dblclick', (ev) => {
  if (ev.target.closest('.no, .fio-alvo, .fio-rot')) return;
  const [wx, wy] = paraMundo(ev);
  criarNo(wx, wy);
});
tela.addEventListener('wheel', (ev) => {
  ev.preventDefault();
  const r = tela.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
  const z = Math.min(2, Math.max(0.3, vista.z * Math.exp(-ev.deltaY * 0.0015)));
  vista.x = mx - ((mx - vista.x) * z) / vista.z;
  vista.y = my - ((my - vista.y) * z) / vista.z;
  vista.z = z;
  aplicarVista();
}, { passive: false });

// ---------- teclado e botões ----------
addEventListener('keydown', (ev) => {
  const k = ev.key.toLowerCase(), ctrl = ev.ctrlKey || ev.metaKey;
  if (ctrl && k === 's') { ev.preventDefault(); salvar(); return; }
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName)) return;
  if (ctrl && k === 'z') { ev.preventDefault(); desfazer(); }
  else if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); apagarSelecao(); }
  else if (ev.key === 'Escape') selecionar(null);
});
$('#b-novo').addEventListener('click', () => {
  const r = tela.getBoundingClientRect();
  criarNo((r.width / 2 - vista.x) / vista.z, (r.height / 2 - vista.y) / vista.z);
});
$('#b-ver').addEventListener('click', verTudo);
$('#b-desfazer').addEventListener('click', desfazer);
$('#b-salvar').addEventListener('click', salvar);
editavel($('#t-nome'), (el) => { est.nome = el.value; });
editavel($('#t-pontos'), (el) => { est.pontos = inteiro(el.value, 0, 999); renderSoma(); });
$('#t-arvore').addEventListener('change', (ev) => {
  const v = ev.target.value.trim().toLowerCase();
  if (v === ARVORE) return;
  if (!NOME_OK.test(v)) { avisar('Nome de árvore: letras minúsculas, números, - e _.'); ev.target.value = ARVORE; return; }
  if (sujo && !confirm('Há mudanças não salvas nesta árvore. Trocar mesmo assim?')) { ev.target.value = ARVORE; return; }
  sujo = false;
  location.search = '?arvore=' + encodeURIComponent(v);
});
addEventListener('beforeunload', (ev) => { if (sujo) { ev.preventDefault(); ev.returnValue = ''; } });

// ---------- arquivo ----------
function paraArquivo() {
  const ids = idsDosNos();
  return {
    _sobre: 'Árvore desenhada no Editor de Árvore (node ferramentas/habilidades/editor-arvore.mjs). Rascunho: o jogo ainda não lê este arquivo.',
    arvore: ARVORE,
    nome: est.nome,
    pontos: est.pontos,
    atualizado_em: new Date().toISOString(),
    nos: est.nos.map((n) => {
      const o = { id: ids.get(n.uid), nome: n.nome, tipo: n.tipo };
      if (n.tipo !== 'classe') Object.assign(o, { ranks: n.ranks, custo: n.custo, por_ponto: n.por_ponto.slice(0, n.ranks) });
      o.desc = n.desc;
      o.requer_minimo = Object.fromEntries(est.ligacoes.filter((l) => l.para === n.uid && acharNo(l.de)).map((l) => [ids.get(l.de), l.min]));
      if (n.requer_total > 0) o.requer_total = n.requer_total;
      if (n.tipo === 'ativa') o.ativa = { eter: n.eter, recarga: n.recarga };
      o.pos = [n.x, n.y];
      return o;
    }),
  };
}
function doArquivo(a) {
  est = { nome: a?.nome ?? '', pontos: Number.isFinite(a?.pontos) ? a.pontos : 10, nos: [], ligacoes: [] };
  const porId = new Map();
  for (const o of a?.nos ?? []) {
    const n = {
      uid: novoUid(), id: typeof o.id === 'string' ? o.id : null, nome: o.nome ?? '', tipo: TIPOS[o.tipo] ? o.tipo : 'passiva',
      ranks: o.ranks ?? 1, custo: o.custo ?? 1, por_ponto: [...(o.por_ponto ?? [])], desc: o.desc ?? '',
      eter: o.ativa?.eter ?? 0, recarga: o.ativa?.recarga ?? 0, requer_total: o.requer_total ?? 0,
      x: o.pos?.[0] ?? 0, y: o.pos?.[1] ?? 0,
    };
    porId.set(o.id, n.uid);
    est.nos.push(n);
  }
  for (const o of a?.nos ?? []) {
    for (const [id, min] of Object.entries(o.requer_minimo ?? {})) {
      if (porId.has(id)) est.ligacoes.push({ de: porId.get(id), para: porId.get(o.id), min });
    }
  }
}
async function salvar() {
  if (!podeSalvar) return avisar('Não li o arquivo desta árvore: recarregue a página antes de salvar.');
  try {
    const r = await fetch('arvore?nome=' + encodeURIComponent(ARVORE), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(paraArquivo()),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'HTTP ' + r.status);
    const h = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    $('#t-estado').dataset.salvo = `salvo às ${h}`;
    marcarSujo(false);
    // a página dos Caminhos: o servidor regera o catálogo e avisa o jogo local
    avisar(j.jogo_erro ? `Salvo, mas o jogo NÃO atualizou: ${j.jogo_erro}` : j.jogo ? `Salvo · ${j.jogo}` : `Salvo em ${j.arquivo}`);
  } catch (e) {
    avisar('Não salvou: ' + e.message);
  }
}

async function iniciar() {
  $('#t-arvore').value = ARVORE;
  const caixaAoVivo = $('#t-aovivo');
  caixaAoVivo.checked = aoVivo;
  caixaAoVivo.addEventListener('change', () => {
    aoVivo = caixaAoVivo.checked;
    try { localStorage.setItem('editor-arvore:aovivo', aoVivo ? '1' : '0'); } catch { /* sem armazenamento: só nesta aba */ }
    if (aoVivo && sujo) salvar();
  });
  const lista = await fetch('arvores').then((r) => r.json()).catch(() => []);
  if (!PEDIDA && lista.length && !lista.includes(ARVORE)) return location.replace('?arvore=' + encodeURIComponent(lista[0]));
  $('#t-lista').innerHTML = lista.map((n) => `<option value="${esc(n)}">`).join('');
  let a = null;
  try {
    const r = await fetch('arvore?nome=' + encodeURIComponent(ARVORE));
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).erro || 'HTTP ' + r.status);
    a = await r.json();
    podeSalvar = true;
  } catch (e) {
    avisar('Não deu para ler a árvore: ' + e.message + '. Salvar fica desligado.');
  }
  doArquivo(a ?? { nome: ARVORE[0].toUpperCase() + ARVORE.slice(1), pontos: 10 });
  tudo();
  verTudo();
  marcarSujo(false);
  document.title = `Editor de Árvore · ${est.nome || ARVORE}`;
}
iniciar();
