import * as THREE from 'three';
import { ITEMS } from './items.js';
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
  levelCost() { return Math.round(160 * Math.pow(1.13, this.game.player.level - 1)); }

  openBonfire() {
    this.bonfireMenu.classList.remove('hidden');
    this.renderLevelUp();
  }
  closeBonfire() { this.bonfireMenu.classList.add('hidden'); }

  renderLevelUp() {
    const p = this.game.player;
    const cost = this.levelCost();
    const can = p.souls >= cost;
    const attrs = [
      ['vigor', 'Vitalidade', `Vida máx.: ${p.maxHp}`],
      ['endurance', 'Resistência', `Vigor máx.: ${p.maxStamina}`],
      ['strength', 'Força', `Dano: +${Math.round((p.strength - 10) * 6)}%`],
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
