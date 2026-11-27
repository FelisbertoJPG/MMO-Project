import { tela } from './tela.js';
import * as THREE from 'three';
import { ITEMS, ICON_PANELA, RARIDADES } from './items.js';
import { custoDoNivel, vigorDoNivel, cargaDoNivel, bonusForcaDoNivel, pontosDisponiveis } from './ficha.js';
import { ATIVAS } from './caminhos.js';
import { RECEITAS, podeCozinhar, listaDaReceita, NA_PANELA } from './receitas.js';
import { fmtTime } from './inventory.js';
import { horaDoMundo } from './world.js';

const $ = (s) => document.querySelector(s);
const _v = new THREE.Vector3();

export class UI {
  constructor(game) {
    this.game = game;
    this.hud = $('#hud');
    this.hpBar = $('#bars .hp'); this.hpFill = $('#bars .hp .fill'); this.hpTrail = $('#bars .hp .trail');
    this.stBar = $('#bars .st'); this.stFill = $('#bars .st .fill');
    this.hpNum = $('#bars .hp .num'); this.stNum = $('#bars .st .num');
    this.nomeEl = $('#hud-nome'); this.nivelEl = $('#hud-nivel');
    this.textos = {};   // (o último texto de cada número: só mexe no DOM quando muda)
    this.eterFill = $('#bars .eter .fill'); this.eterNum = $('#bars .eter .num');
    this.habVagas = [...document.querySelectorAll('#hab-hud .hab-vaga')];
    this.eterPct = -1; this.barraVista = null;
    this.buffs = $('#buffs');
    this.soulsEl = $('#souls'); this.soulsVal = $('#souls-value');
    this.prompt = $('#prompt');
    this.notes = $('#notifications');
    this.enemyBars = $('#enemy-bars');
    this.reticle = $('#lock-reticle');
    this.bossbar = $('#bossbar'); this.bossFill = $('#bossbar .fill'); this.bossTrail = $('#bossbar .trail'); this.bossName = $('#bossbar .name');
    this.vignette = $('#vignette');
    this.center = $('#center-msg'); this.centerText = $('#center-msg .text');
    this.reader = $('#message-reader');
    this.quickSlot = $('#slot-quick'); this.weaponSlot = $('#slot-weapon'); this.leftSlot = $('#slot-left');
    this.bonfireMenu = $('#bonfire-menu'); this.levelup = $('#levelup');
    this.pause = $('#pause');
    this.displaySouls = 0;
    this.ebarMap = new Map();
    this.hurt = 0;
    this.lastQuick = null;
    this.centerTimer = null;
  }

  show() { this.hud.classList.remove('hidden'); }

  hurtFlash() { this.hurt = 1; }

  notify(def, qty = 1) {
    const n = document.createElement('div');
    n.className = 'note';
    n.innerHTML = `${def.icon}<span>${def.name}${qty > 1 ? ` x${qty}` : ''}</span>`;
    this.notes.appendChild(n);
    setTimeout(() => n.remove(), 4100);
  }

  toast(text) {
    const n = document.createElement('div');
    n.className = 'note';
    n.innerHTML = `<span>${text}</span>`;
    this.notes.appendChild(n);
    setTimeout(() => n.remove(), 4100);
  }

  centerMessage(text, kind = 'info', ms = 3500) {
    clearTimeout(this.centerTimer);
    this.center.className = kind;
    this.centerText.textContent = text;
    void this.center.offsetWidth;
    this.center.classList.add('show');
    this.centerTimer = setTimeout(() => this.center.classList.remove('show'), ms);
  }

  /**
   * Abre a leitura de uma mensagem. `online` (opcional) é a de outro jogador:
   * `{autor, nota, minha, voto}` — mostra quem escreveu e as teclas de voto.
   */
  showReader(text, online = null) {
    this.reader.querySelector('.msg-text').textContent = `"${text}"`;
    const autor = this.reader.querySelector('.msg-autor'), dica = this.reader.querySelector('.msg-hint');
    if (online) {
      const nota = online.nota > 0 ? `+${online.nota}` : `${online.nota}`;
      autor.textContent = `— ${online.minha ? 'você' : online.autor} · ${nota}`;
      dica.textContent = online.minha ? '[E] Fechar   [X] Apagar'
        : `[E] Fechar   [1] Boa${online.voto > 0 ? ' ✓' : ''}   [2] Ruim${online.voto < 0 ? ' ✓' : ''}`;
    } else {
      autor.textContent = '';
      dica.textContent = '[E] Fechar';
    }
    this.reader.classList.remove('hidden');
  }
  hideReader() { this.reader.classList.add('hidden'); }

  /** O convite de duelo (rede/sala.js), respondido com Y/N ou no painel da sala. */
  mostrarConvite(texto) {
    document.getElementById('convite-texto').textContent = texto;
    document.getElementById('convite').classList.remove('hidden');
    this.game.sfx.bonfire?.();
  }
  esconderConvite() { document.getElementById('convite').classList.add('hidden'); }
  get readerOpen() { return !this.reader.classList.contains('hidden'); }

  /**
   * A FICHA DO ITEM CAÍDO (16/10/2026), ao lado dele quando se está perto: o losango com o ícone,
   * a tecla de pegar e o nome numa etiqueta na cor da RARIDADE (items.js). `null` esconde.
   */
  mostrarLoot(it) {
    this.loot ??= document.getElementById('loot');
    const el = this.loot;
    const s = it && this.project(_v.copy(it.mesh.position).setY(it.mesh.position.y + 0.4).clone());
    if (!it || !s) { el.classList.add('hidden'); this.lootDe = null; return; }
    if (this.lootDe !== it) {
      this.lootDe = it;
      const def = ITEMS[it.itemId], r = RARIDADES[it.raridade] ?? RARIDADES.comum;
      el.style.setProperty('--raridade', r.cor);
      el.querySelector('.loot-icone').innerHTML = def?.icon ?? '';
      el.querySelector('.loot-nome').textContent = `${def?.name ?? it.itemId}${it.qty > 1 ? ` ×${it.qty}` : ''}`;
      el.querySelector('.loot-raridade').textContent = r.nome;
      el.querySelector('.loot-tecla').classList.toggle('hidden', document.body.classList.contains('toque'));
    }
    el.style.left = `${s.x}px`; el.style.top = `${s.y}px`;
    el.classList.remove('hidden');
  }

  setPrompt(text) {
    if (!text) { this.prompt.classList.add('hidden'); this.mostrarLoot(null); return; }
    this.prompt.innerHTML = `<b>E</b> &nbsp;${text}`;
    this.prompt.classList.remove('hidden');
  }

  // ---------- Fogueira / level up ----------
  levelCost() { return custoDoNivel(this.game.player.level); }

  /** A fogueira abre no menu de OPÇÕES; cada opção mostra a sua tela (`mostrarFogueira`). */
  openBonfire() {
    this.bonfireMenu.classList.remove('hidden');
    if (!this.bfLigado) {
      this.bfLigado = true;
      this.bonfireMenu.addEventListener('click', (e) => {
        const b = e.target.closest('[data-bf]');
        if (b) this.mostrarFogueira(b.dataset.bf);
      });
    }
    this.mostrarFogueira('opcoes');
  }

  /** 'opcoes' | 'nivel' | 'panela' | 'viajar' | 'hora' */
  mostrarFogueira(tela) {
    if (this.game.passagem && tela !== 'hora') return;   // (o tempo correndo: fica no relógio até acabar)
    for (const t of ['opcoes', 'nivel', 'panela', 'viajar', 'hora']) document.getElementById(`bf-${t}`).classList.toggle('hidden', t !== tela);
    // "Mudar a hora" só onde a hora é sua (a Jornada: `regras.horaPropria`)
    document.querySelector('[data-bf="hora"]')?.classList.toggle('hidden', !this.game.regras.horaPropria);
    if (tela === 'nivel') this.renderLevelUp();
    if (tela === 'panela') { this.naPanela = []; this.renderPanela(); }
    if (tela === 'viajar') this.renderViajar();
    if (tela === 'hora') this.renderRelogio();
  }

  /**
   * O RELÓGIO DA FOGUEIRA (26/11/2026, no estilo do Genshin; só na Jornada): um mostrador de 24 h —
   * meia-noite embaixo, meio-dia em cima, o dia (6 h às 18 h) claro e a noite escura. O ponteiro
   * dourado se arrasta até a hora em que se quer acordar (de 15 em 15 min, sempre para a FRENTE); o
   * arco mostra o tempo que vai passar. "Descansar" chama `Game.passarAte`, e o relógio gira junto
   * com o céu (`mostrarRelogio`, a cada quadro da passagem).
   */
  renderRelogio() {
    const el = document.getElementById('relogio-fogueira');
    const C = 120, R = 92, ns = 'http://www.w3.org/2000/svg';
    // hora → ponto no círculo (meia-noite embaixo, horário)
    const ponto = (h, r = R) => { const a = (h / 24) * Math.PI * 2; return [C - r * Math.sin(a), C + r * Math.cos(a)]; };
    if (!this.relogio) {
      const metade = (de, ate, cor) => { const [x0, y0] = ponto(de, R + 14), [x1, y1] = ponto(ate, R + 14); return `<path d="M${C},${C} L${x0},${y0} A${R + 14},${R + 14} 0 0 1 ${x1},${y1} Z" fill="${cor}"/>`; };
      let marcas = '';
      for (let h = 0; h < 24; h++) {
        const [x0, y0] = ponto(h, R + 10), [x1, y1] = ponto(h, h % 6 ? R + 4 : R - 2);
        marcas += `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" class="rl-marca${h % 6 ? '' : ' grande'}"/>`;
      }
      const rotulo = (h, t) => { const [x, y] = ponto(h, R - 16); return `<text x="${x}" y="${y + 5}" class="rl-num">${t}</text>`; };
      const [sx, sy] = ponto(12, R - 38), [lx, ly] = ponto(0, R - 38);
      el.innerHTML = `<svg viewBox="0 0 240 240" class="relogio">
        ${metade(6, 18, 'var(--rl-dia)')}${metade(18, 30, 'var(--rl-noite)')}
        <circle cx="${C}" cy="${C}" r="${R + 14}" class="rl-aro"/>
        ${marcas}${rotulo(0, '0')}${rotulo(6, '6')}${rotulo(12, '12')}${rotulo(18, '18')}
        <circle cx="${sx}" cy="${sy}" r="9" class="rl-sol"/>
        <path d="M${lx + 3},${ly - 9} a9,9 0 1,0 0,18 a11,11 0 0,1 0,-18 Z" class="rl-lua"/>
        <path id="rl-arco" class="rl-arco" d=""/>
        <line id="rl-ponteiro" x1="${C}" y1="${C}" x2="${C}" y2="${C}" class="rl-ponteiro"/>
        <circle id="rl-agora" r="6" class="rl-agora"/>
        <circle id="rl-pegador" r="11" class="rl-pegador"/>
        <circle cx="${C}" cy="${C}" r="40" class="rl-centro"/>
        <text id="rl-hora" x="${C}" y="${C + 4}" class="rl-hora">--:--</text>
        <text id="rl-falta" x="${C}" y="${C + 22}" class="rl-falta"></text>
      </svg>`;
      const svg = el.querySelector('svg');
      const escolher = (e) => {
        if (this.game.passagem) return;
        const b = svg.getBoundingClientRect(), x = (e.clientX - b.left) / b.width * 240 - C, y = (e.clientY - b.top) / b.height * 240 - C;
        if (x * x + y * y < 20 * 20) return;   // (no miolo não dá para saber o ângulo)
        const h = ((Math.atan2(-x, y) / (Math.PI * 2)) * 24 + 24) % 24;
        this.relogio.alvo = Math.round(h * 4) / 4 % 24;
        this.mostrarRelogio();
      };
      svg.addEventListener('pointerdown', (e) => { svg.setPointerCapture(e.pointerId); this.relogio.arrastando = true; escolher(e); });
      svg.addEventListener('pointermove', (e) => { if (this.relogio.arrastando) escolher(e); });
      for (const ev of ['pointerup', 'pointercancel']) svg.addEventListener(ev, () => { this.relogio.arrastando = false; });
      document.getElementById('bf-hora-ok').addEventListener('click', () => {
        if (this.game.passarAte(this.relogio.alvo)) this.mostrarRelogio();
      });
      this.relogio = { ponto, alvo: null, arrastando: false };
    }
    // abre com o ponteiro na próxima hora cheia depois de agora + 1 h
    this.relogio.alvo = Math.ceil(horaDoMundo() + 1) % 24;
    this.mostrarRelogio();
  }

  /** Redesenha os ponteiros (a cada quadro enquanto o tempo corre; `fim` = a passagem acabou). */
  mostrarRelogio(fim = false) {
    const R0 = this.relogio;
    if (!R0) return;
    const el = (id) => document.getElementById(id), agora = horaDoMundo(), R = 92;
    const fmt = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor(Math.round((h % 1) * 60) % 60)).padStart(2, '0')}`;
    const correndo = !!this.game.passagem;
    if (fim) R0.alvo = Math.ceil(agora + 1) % 24;
    const alvo = R0.alvo, falta = (((alvo - agora) % 24) + 24) % 24;
    const [ax, ay] = R0.ponto(agora), [px, py] = R0.ponto(correndo ? agora : alvo);
    el('rl-agora').setAttribute('cx', ax); el('rl-agora').setAttribute('cy', ay);
    el('rl-pegador').setAttribute('cx', px); el('rl-pegador').setAttribute('cy', py);
    el('rl-ponteiro').setAttribute('x2', px); el('rl-ponteiro').setAttribute('y2', py);
    // o arco do tempo que vai passar (de agora até o alvo, no sentido do relógio)
    const [bx, by] = R0.ponto(alvo);
    el('rl-arco').setAttribute('d', falta > 0.01 ? `M${ax},${ay} A${R},${R} 0 ${falta > 12 ? 1 : 0} 1 ${bx},${by}` : '');
    el('rl-hora').textContent = fmt(correndo ? agora : alvo);
    const hh = Math.floor(falta), mm = Math.round((falta - hh) * 60);
    el('rl-falta').textContent = correndo ? 'descansando…' : falta > 0.01 ? `+${hh} h${mm ? ` ${mm} min` : ''}` : `agora ${fmt(agora)}`;
    const ok = el('bf-hora-ok');
    ok.disabled = correndo || falta < 1 / 60;
    ok.textContent = correndo ? 'Descansando…' : `Descansar até ${fmt(alvo)}`;
  }

  /** VIAJAR (por ora, para testes): todas as fogueiras do mapa, acesas ou não, menos a de agora (`Game.viajar`). */
  renderViajar() {
    const g = this.game, el = document.getElementById('viajar');
    el.innerHTML = '';
    for (const f of g.world.fogueiras) {
      if (f.id === g.player.fogueira) continue;
      const b = document.createElement('button');
      b.textContent = f.nome;
      b.addEventListener('click', () => g.viajar(f.id));
      el.appendChild(b);
    }
  }

  /**
   * A PANELA (receitas.js): as receitas se DESCOBREM misturando. Em cima, a
   * panela com até `NA_PANELA` ingredientes (tocar tira); no meio, os
   * ingredientes que o jogador tem (tocar põe na panela); embaixo, as receitas
   * conhecidas (tocar enche a panela com elas) e as que faltam, como "???".
   * O minigame de cozinhar entra depois no lugar do botão (`Game.cozinhar`).
   */
  renderPanela() {
    const g = this.game, inv = g.inventory, el = document.getElementById('panela');
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    this.naPanela ??= [];
    const usados = (id) => this.naPanela.filter((x) => x === id).length;
    const vagas = Array.from({ length: NA_PANELA }, (_, k) => this.naPanela[k]);
    const panela = vagas.map((id, k) => (id
      ? `<button class="vaga cheia" data-tirar="${k}" title="Tirar ${esc(ITEMS[id].name)}">${ITEMS[id].icon}</button>`
      : '<div class="vaga"></div>')).join('');
    const meus = Object.keys(ITEMS).filter((id) => ITEMS[id].type === 'ingrediente' && inv.count(id) > 0);
    const despensa = meus.map((id) => {
      const sobra = inv.count(id) - usados(id);
      return `<button class="ingr" data-por="${id}" ${sobra > 0 && this.naPanela.length < NA_PANELA ? '' : 'disabled'} title="${esc(ITEMS[id].name)}">${ITEMS[id].icon}<b>${sobra}</b><span>${esc(ITEMS[id].name)}</span></button>`;
    }).join('') || '<div class="rc-efeito">Você não tem ingredientes. Quebre barris e caixotes, corte arbustos, derrote inimigos.</div>';
    const conhecidas = RECEITAS.filter((r) => g.player.receitas.has(r.id));
    const livro = RECEITAS.map((r) => {
      if (!g.player.receitas.has(r.id)) {
        const n = listaDaReceita(r).length;
        return `<div class="receita sem"><div class="rc-icone desconhecida">?</div><div class="rc-info"><div class="rc-nome">???</div><div class="rc-efeito">${n} ingrediente${n > 1 ? 's' : ''}</div></div></div>`;
      }
      const res = ITEMS[r.resultado];
      const efeito = Object.entries(res.stats ?? {}).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ');
      const ing = r.ingredientes.map(([id, n]) => {
        const tem = inv.count(id);
        return `<span class="ing${tem >= n ? '' : ' falta'}" title="${esc(ITEMS[id].name)}">${ITEMS[id].icon}<b>${tem}/${n}</b></span>`;
      }).join('');
      const pode = podeCozinhar(r, (id) => inv.count(id));
      return `<div class="receita${pode ? '' : ' sem'}"><div class="rc-icone">${res.icon}</div>
        <div class="rc-info"><div class="rc-nome">${esc(res.name)}${r.qtd > 1 ? ` ×${r.qtd}` : ''}</div><div class="rc-efeito">${efeito}</div><div class="rc-ing">${ing}</div></div>
        <button data-repetir="${r.id}" ${pode ? '' : 'disabled'}>Pôr na panela</button></div>`;
    }).join('');
    el.innerHTML = `<h3 class="panela-titulo">${ICON_PANELA}Panela</h3>
      <div class="panela-vagas">${panela}</div>
      <div class="panela-acoes"><button id="panela-cozinhar" ${this.naPanela.length ? '' : 'disabled'}>Cozinhar</button></div>
      <div id="panela-aviso" class="rc-efeito">${esc(this.avisoPanela ?? 'Misture até ' + NA_PANELA + ' ingredientes e descubra receitas.')}</div>
      <div class="panela-sub">Seus ingredientes</div><div class="despensa">${despensa}</div>
      <div class="panela-sub">Receitas (${conhecidas.length} de ${RECEITAS.length})</div><div class="livro">${livro}</div>`;
    this.avisoPanela = null;
    el.querySelectorAll('[data-por]').forEach((b) => b.addEventListener('click', () => { this.naPanela.push(b.dataset.por); this.renderPanela(); }));
    el.querySelectorAll('[data-tirar]').forEach((b) => b.addEventListener('click', () => { this.naPanela.splice(Number(b.dataset.tirar), 1); this.renderPanela(); }));
    el.querySelectorAll('[data-repetir]').forEach((b) => b.addEventListener('click', () => {
      this.naPanela = listaDaReceita(RECEITAS.find((r) => r.id === b.dataset.repetir));
      this.renderPanela();
    }));
    el.querySelector('#panela-cozinhar').addEventListener('click', () => {
      const r = g.cozinhar(this.naPanela);
      if (r) this.avisoPanela = r.receita ? `Saiu ${ITEMS[r.receita.resultado].name}${r.nova ? ' — receita nova!' : '.'}` : 'Não era receita nenhuma... virou uma gororoba.';
      this.naPanela = [];
      this.renderPanela();
    });
  }
  closeBonfire() { this.bonfireMenu.classList.add('hidden'); }

  renderLevelUp() {
    const p = this.game.player;
    const cost = this.levelCost();
    const can = p.souls >= cost;
    // o que o PRÓXIMO nível dá (ficha.js: cada nível aumenta tudo um pouco)
    const n = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');
    const prox = p.level + 1;
    const linhas = [
      ['Vida máx.', p.maxHp, p.maxHpNoNivel(prox)],
      ['Vigor máx.', p.maxStamina, vigorDoNivel(prox)],
      ['Carga', n(p.cargaMax), n(cargaDoNivel(prox))],
      ['Bônus de força', `+${n(p.bonusForca * 100)}%`, `+${n(bonusForcaDoNivel(prox) * 100)}%`],
    ];
    const pontos = pontosDisponiveis(p.level, p.habilidades);
    this.levelup.innerHTML = `<div class="lv-head"><span>Nível <b>${p.level}</b></span><span>Almas <b>${p.souls}</b></span><span>Custo <b style="color:${can ? '#c8a86a' : '#8a3a3a'}">${cost}</b></span></div>` +
      linhas.map(([rotulo, agora, depois]) => `<div>${rotulo}</div><b class="lv-agora">${agora}</b><span class="lv-depois">→ ${depois}</span>`).join('') +
      `<div class="lv-pontos">Pontos de habilidade disponíveis <b>${pontos}</b></div>` +
      `<button class="lv-subir" ${can ? '' : 'disabled'}>Subir para o nível ${prox}</button>`;
    this.levelup.querySelector('.lv-subir').addEventListener('click', () => {
      if (!p.subirDeNivel()) return;
      this.displaySouls = p.souls;
      this.game.sfx.heal();
      this.renderLevelUp();
    });
  }

  /**
   * O Éter (no quadro do jogador, abaixo da vida) e a barra das habilidades (embaixo no meio). Só mexe no DOM quando muda:
   * a largura do Éter em passos de 0,5% e os nomes das vagas quando a barra muda.
   */
  atualizarHabilidades(p) {
    // a barra única (caminhos.js): some sem o começo do Éter; com o Conhecimento Arcano, vira Mana
    const modo = p.modoBarra;
    if (modo !== this.modoVisto) {
      this.modoVisto = modo;
      const bar = this.eterFill.parentElement;
      bar.style.display = modo ? '' : 'none';
      bar.classList.toggle('mana', modo === 'mana');
      this.eterPct = -1;
      if (!this.vagasLigadas) {   // tocar na vaga usa a habilidade (no toque; no teclado, 1 a 4)
        this.vagasLigadas = true;
        this.habVagas.forEach((v, i) => v.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.game.player.usarVaga(i); }));
      }
    }
    if (!modo) return this.atualizarVagas(p);
    const pct = Math.round(Math.max(0, Math.min(1, p.eter / p.eterMax)) * 200) / 2;
    if (pct !== this.eterPct) {
      this.eterPct = pct;
      this.eterFill.style.width = `${pct}%`;
      this.eterFill.parentElement.classList.toggle('cheia', pct >= 100);
    }
    this.texto('eter', this.eterNum, `${modo === 'mana' ? 'Mana' : 'Éter'} ${Math.floor(p.eter)} / ${p.eterMax}`);
    this.atualizarVagas(p);
  }

  /** Os nomes das 4 vagas (só quando a barra de atalhos muda). */
  atualizarVagas(p) {
    const barra = p.habilidades.barra, chave = barra.join('|') + (p.furtivo ? '|furtivo' : '');
    if (chave === this.barraVista) return;
    this.barraVista = chave;
    barra.forEach((id, i) => {
      const vaga = this.habVagas[i];
      if (!vaga) return;
      const nome = id ? (ATIVAS[id]?.nome ?? this.game.arvore?.nos?.get(id)?.no.nome ?? id) : '';
      vaga.classList.toggle('vazia', !id);
      vaga.classList.toggle('ligada', !!(id && ATIVAS[id]?.alterna && p.furtivo));   // a Furtividade ligada
      vaga.querySelector('.hab-nome').textContent = nome;
      vaga.title = id ? nome : 'Vaga de habilidade (monte na árvore: K)';
    });
  }

  /** Troca o texto de `el` só quando muda (`chave` guarda o último). */
  texto(chave, el, t) {
    if (this.textos[chave] !== t) { this.textos[chave] = t; el.textContent = t; }
  }

  // ---------- Atualização por frame ----------
  update(dt) {
    const game = this.game, p = game.player;

    // O quadro do jogador (estilo MMO): barras de largura fixa, com os números, o nome e o nível
    this.texto('hp', this.hpNum, `${Math.max(0, Math.ceil(p.hp))} / ${Math.round(p.maxHp)}`);
    this.texto('st', this.stNum, `${Math.max(0, Math.floor(p.stamina))} / ${Math.round(p.maxStamina)}`);
    this.texto('nv', this.nivelEl, `Nv ${p.level ?? 1}`);
    this.texto('nome', this.nomeEl, (game.sessao?.meuNome || game.perfil?.nome || game.online?.nome || 'Aventureiro').split('@')[0]);
    const hpPct = THREE.MathUtils.clamp(p.hp / p.maxHp, 0, 1) * 100;
    this.hpFill.style.width = `${hpPct}%`;
    this.hpTrail.style.width = `${hpPct}%`;
    this.stFill.style.width = `${Math.max(0, p.stamina / p.maxStamina) * 100}%`;
    this.atualizarHabilidades(p);

    // Buffs
    const b = [];
    if (p.buffs.resin > 0) b.push(`<span class="buff resin">Resina ${Math.ceil(p.buffs.resin)}s</span>`);
    if (p.buffs.blossom > 0) b.push(`<span class="buff blossom">Flor ${Math.ceil(p.buffs.blossom)}s</span>`);
    if (p.buffs.regen > 0) b.push(`<span class="buff regen">Curando ${Math.ceil(p.buffs.regen)}s</span>`);
    if (p.buffs.folego > 0) b.push(`<span class="buff blossom">Fôlego ${Math.ceil(p.buffs.folego)}s</span>`);
    if (p.buffs.fortaleza > 0) b.push(`<span class="buff fortaleza">Fortaleza ${Math.ceil(p.buffs.fortaleza)}s</span>`);
    if (p.buffs.furia > 0) b.push(`<span class="buff resin">Fúria ${Math.ceil(p.buffs.furia)}s</span>`);
    const bh = b.join('');
    if (this.buffs.innerHTML !== bh) this.buffs.innerHTML = bh;

    // Almas (contador animado)
    if (this.displaySouls !== p.souls) {
      const diff = p.souls - this.displaySouls;
      const step = Math.sign(diff) * Math.max(1, Math.ceil(Math.abs(diff) * dt * 4));
      this.displaySouls = Math.abs(step) >= Math.abs(diff) ? p.souls : this.displaySouls + step;
      this.soulsEl.classList.toggle('gain', diff > 0);
    } else this.soulsEl.classList.remove('gain');
    this.soulsVal.textContent = this.displaySouls;

    // Slots de equipamento
    const inv = game.inventory;
    const q = inv.currentQuick();
    const left = inv.equipped.left;
    const key = `${q}:${q ? inv.count(q) : 0}:${inv.equipped.weapon}:${left}`;
    if (key !== this.lastQuick) {
      this.lastQuick = key;
      this.quickSlot.querySelector('.icon').innerHTML = q ? inv.iconFor(q) : '';
      this.quickSlot.querySelector('.count').textContent = q ? inv.count(q) : '';
      this.quickSlot.querySelector('.label').textContent = q ? ITEMS[q].name : '';
      // o nome do item rápido fica ao lado do losango de baixo (como no Dark Souls)
      this.equipNome ??= document.getElementById('equip-nome');
      this.equipNome.textContent = q ? ITEMS[q].name : '';
      const w = p.weapon;
      this.weaponSlot.querySelector('.icon').innerHTML = w.icon;
      this.weaponSlot.querySelector('.label').textContent = w.name;
      this.leftSlot.querySelector('.icon').innerHTML = left ? ITEMS[left].icon : '';
      this.leftSlot.querySelector('.label').textContent = left ? ITEMS[left].name : '';
      this.leftSlot.classList.toggle('torch', left === 'torch');
    }
    this.leftSlot.querySelector('.count').textContent = left === 'torch' ? fmtTime(inv.torchTime) : '';

    // Vinheta de dano / vida baixa
    this.hurt = Math.max(0, this.hurt - dt * 2.5);
    const low = p.hp / p.maxHp < 0.25 && !p.dead ? 0.35 + Math.sin(game.time * 5) * 0.15 : 0;
    this.vignette.style.opacity = Math.max(this.hurt, low);

    this.updateEnemyBars();
    this.updateBossBar();
    this.updateReticle();
  }

  project(pos) {
    _v.copy(pos).project(this.game.camera);
    if (_v.z > 1) return null;
    return { x: (_v.x * 0.5 + 0.5) * tela.w, y: (-_v.y * 0.5 + 0.5) * tela.h };
  }

  updateEnemyBars() {
    const game = this.game;
    const seen = new Set();
    for (const e of game.all) {
      if (e.isBoss) continue;
      const recent = game.time - e.lastHit < 4 || game.player.lockTarget === e;
      if (e.dead || !e.active || !recent) continue;
      // acima da cabeça, A PARTIR DO PÉ (`pos.y` = o chão de onde ele está): com a altura
      // contada do zero, no alto de um morro a barra ficava metros abaixo do bicho
      const s = this.project(_v.set(e.pos.x, e.pos.y + e.height + 0.35, e.pos.z).clone());
      if (!s) continue;
      seen.add(e);
      let el = this.ebarMap.get(e);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ebar';
        el.innerHTML = '<div class="dmg"></div><div class="bar"><div class="trail"></div><div class="fill"></div></div>'
          // o ESCUDO (escudo.js): a barra branca da durabilidade e os losangos da postura
          + (e.escudo ? '<div class="escudo"><div class="esc-barra"><div class="esc-fill"></div></div><div class="esc-pips"><i></i><i></i><i></i></div></div>' : '');
        this.enemyBars.appendChild(el);
        this.ebarMap.set(e, el);
      }
      el.style.left = `${s.x}px`; el.style.top = `${s.y}px`;
      const pct = `${(e.hp / e.maxHp) * 100}%`;
      el.querySelector('.fill').style.width = pct;
      el.querySelector('.trail').style.width = pct;
      el.querySelector('.dmg').textContent = game.time - e.lastHit < 2.5 && e.recentDmg > 0 ? e.recentDmg : '';
      const esc = e.escudo;
      if (esc) {
        const caixa = el.querySelector('.escudo');
        caixa.classList.toggle('hidden', esc.quebrado);
        if (!esc.quebrado) {
          caixa.querySelector('.esc-fill').style.width = `${(esc.vida / esc.max) * 100}%`;
          const cheios = Math.ceil((esc.postura / esc.posturaMax) * 3 - 1e-6);
          caixa.querySelectorAll('.esc-pips i').forEach((p, k) => p.classList.toggle('cheio', k < cheios));
        }
      }
    }
    for (const [e, el] of this.ebarMap) if (!seen.has(e)) { el.remove(); this.ebarMap.delete(e); }
  }

  updateBossBar() {
    const boss = this.game.bossAtual ?? this.game.boss;
    const show = this.game.bossFight && !boss.dead;
    this.bossbar.classList.toggle('hidden', !show);
    if (!show) return;
    this.bossName.textContent = boss.name;
    const pct = `${Math.max(0, boss.hp / boss.maxHp) * 100}%`;
    this.bossFill.style.width = pct;
    this.bossTrail.style.width = pct;
  }

  updateReticle() {
    const t = this.game.player.lockTarget;
    if (!t) { this.reticle.classList.add('hidden'); return; }
    const s = this.project(new THREE.Vector3(t.pos.x, t.height * 0.6 + t.pos.y, t.pos.z));
    if (!s) { this.reticle.classList.add('hidden'); return; }
    this.reticle.classList.remove('hidden');
    this.reticle.style.left = `${s.x}px`; this.reticle.style.top = `${s.y}px`;
  }
}
