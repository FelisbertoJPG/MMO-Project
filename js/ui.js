import * as THREE from 'three';
import { ITEMS, ICON_PANELA } from './items.js';
import { custoDoNivel, curva, VITALIDADE, RESISTENCIA_VIGOR, RESISTENCIA_CARGA, FORCA } from './ficha.js';
import { RECEITAS, podeCozinhar, listaDaReceita, NA_PANELA } from './receitas.js';
import { fmtTime } from './inventory.js';

const $ = (s) => document.querySelector(s);
const _v = new THREE.Vector3();

export class UI {
  constructor(game) {
    this.game = game;
    this.hud = $('#hud');
    this.hpBar = $('#bars .hp'); this.hpFill = $('#bars .hp .fill'); this.hpTrail = $('#bars .hp .trail');
    this.stBar = $('#bars .st'); this.stFill = $('#bars .st .fill');
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

  setPrompt(text) {
    if (!text) { this.prompt.classList.add('hidden'); return; }
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

  /** 'opcoes' | 'nivel' | 'panela' */
  mostrarFogueira(tela) {
    for (const t of ['opcoes', 'nivel', 'panela']) document.getElementById(`bf-${t}`).classList.toggle('hidden', t !== tela);
    if (tela === 'nivel') this.renderLevelUp();
    if (tela === 'panela') { this.naPanela = []; this.renderPanela(); }
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
    // quanto o PRÓXIMO ponto rende (ficha.js: cada atributo rende menos a cada ponto)
    const mais = (faixas, v) => curva(v + 1, faixas) - curva(v, faixas);
    const n = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');
    const attrs = [
      ['vigor', 'Vitalidade', `Vida máx.: ${p.maxHp} <i>(próximo: +${n(mais(VITALIDADE, p.vigor))})</i>`],
      ['endurance', 'Resistência', `Vigor máx.: ${p.maxStamina} · Carga: ${p.cargaMax} <i>(próximo: +${n(mais(RESISTENCIA_VIGOR, p.endurance))} / +${n(mais(RESISTENCIA_CARGA, p.endurance))})</i>`],
      ['strength', 'Força', `Bônus de força: +${Math.round(p.bonusForca * 100)}% × escala da arma <i>(próximo: +${n(mais(FORCA, p.strength) * 100)}%)</i>`],
    ];
    this.levelup.innerHTML = `<div class="lv-head"><span>Nível <b>${p.level}</b></span><span>Almas <b>${p.souls}</b></span><span>Custo <b style="color:${can ? '#c8a86a' : '#8a3a3a'}">${cost}</b></span></div>` +
      attrs.map(([k, label, desc]) => `<div>${label}<div class="desc">${desc}</div></div><b style="font-family:Cinzel;font-weight:400">${p[k]}</b><button data-attr="${k}" ${can ? '' : 'disabled'}>+</button>`).join('');
    this.levelup.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const c = this.levelCost();
      if (p.souls < c) return;
      p.souls -= c;
      p[b.dataset.attr]++;
      p.level++;
      p.hp = p.maxHp; p.stamina = p.maxStamina;
      this.displaySouls = p.souls;
      this.game.sfx.heal();
      this.renderLevelUp();
    }));
  }

  // ---------- Atualização por frame ----------
  update(dt) {
    const game = this.game, p = game.player;

    // Barras
    this.hpBar.style.width = `${p.maxHp * 1.35}px`;
    this.stBar.style.width = `${p.maxStamina * 2.4}px`;
    const hpPct = THREE.MathUtils.clamp(p.hp / p.maxHp, 0, 1) * 100;
    this.hpFill.style.width = `${hpPct}%`;
    this.hpTrail.style.width = `${hpPct}%`;
    this.stFill.style.width = `${Math.max(0, p.stamina / p.maxStamina) * 100}%`;

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
    return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight };
  }

  updateEnemyBars() {
    const game = this.game;
    const seen = new Set();
    for (const e of game.all) {
      if (e.isBoss) continue;
      const recent = game.time - e.lastHit < 4 || game.player.lockTarget === e;
      if (e.dead || !e.active || !recent) continue;
      const s = this.project(_v.set(e.pos.x, e.height + 0.35, e.pos.z).clone());
      if (!s) continue;
      seen.add(e);
      let el = this.ebarMap.get(e);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ebar';
        el.innerHTML = '<div class="dmg"></div><div class="bar"><div class="trail"></div><div class="fill"></div></div>';
        this.enemyBars.appendChild(el);
        this.ebarMap.set(e, el);
      }
      el.style.left = `${s.x}px`; el.style.top = `${s.y}px`;
      const pct = `${(e.hp / e.maxHp) * 100}%`;
      el.querySelector('.fill').style.width = pct;
      el.querySelector('.trail').style.width = pct;
      el.querySelector('.dmg').textContent = game.time - e.lastHit < 2.5 && e.recentDmg > 0 ? e.recentDmg : '';
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
