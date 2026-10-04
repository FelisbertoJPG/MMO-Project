import { ITEMS, TORCH_LIFE } from './items.js';
import { LUGARES, NOME_DO_LUGAR, ESCALA, SEM_REQUISITO } from './ficha.js';

const TYPE_LABEL = { consumable: 'Consumível', ingrediente: 'Ingrediente — vai para a panela da fogueira', weapon: 'Arma', shield: 'Escudo', torch: 'Mão esquerda — fonte de luz', ring: 'Anel', key: 'Item especial', armadura: 'Armadura' };
const TAB_TYPES = { consumable: ['consumable'], ingrediente: ['ingrediente'], weapon: ['weapon', 'shield', 'torch'], armadura: ['armadura'], ring: ['ring'], key: ['key'] };
const pct = (v) => `${Math.round(v * 100)}%`;
/** Armadura vazia: um lugar para cada peça (ficha.js `LUGARES`). */
export const armaduraVazia = () => Object.fromEntries(LUGARES.map((l) => [l, null]));

export const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export class Inventory {
  constructor(game) {
    this.game = game;
    this.items = new Map();
    // O morto-vivo acorda na cela sem nada
    this.equipped = { weapon: null, left: null, rings: [null, null], armadura: armaduraVazia() };
    this.lastShield = null;
    this.torchTime = 0;
    this.belt = [null, null, null, null];
    this.beltIdx = 0;
    this.tab = 'consumable';
    this.selected = null;
    this.isOpen = false;

    this.el = document.getElementById('inventory');
    this.gridEl = document.getElementById('inv-grid');
    this.beltEl = document.getElementById('inv-belt');
    this.detailEl = document.getElementById('inv-detail');
    this.statsEl = document.getElementById('inv-stats');
    this.el.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
      this.tab = b.dataset.tab; this.selected = null; this.render();
    }));
  }

  count(id) { return this.items.get(id) ?? 0; }

  add(id, qty = 1, silent = false) {
    const def = ITEMS[id];
    if (!def) return;
    if (def.type === 'ingrediente') {
      // empilha como consumível, mas não vai para o cinto: não se usa sozinho
      this.items.set(id, Math.min(def.max ?? 99, this.count(id) + qty));
    } else if (def.type !== 'consumable') {
      this.items.set(id, 1);
      if (id === 'torch') this.torchTime = TORCH_LIFE;
      // Primeira arma/escudo encontrados já são equipados, como no início de DS
      const p = this.game.player;
      if (def.type === 'weapon' && !this.equipped.weapon) { this.equipped.weapon = id; p?.refreshEquipment(); }
      // a primeira peça de cada lugar já é vestida
      if (def.type === 'armadura' && !this.equipped.armadura[def.lugar]) { this.equipped.armadura[def.lugar] = id; p?.refreshEquipment(); }
      if (def.type === 'shield' && !this.lastShield) {
        this.lastShield = id;
        if (!this.equipped.left) { this.equipped.left = id; p?.refreshEquipment(); }
      }
    } else {
      this.items.set(id, Math.min(def.max ?? 99, this.count(id) + qty));
      if (!this.belt.includes(id)) {
        const free = this.belt.indexOf(null);
        if (free >= 0) { this.belt[free] = id; if (!this.belt[this.beltIdx]) this.beltIdx = free; }
      }
    }
    if (!silent) this.game.ui.notify(def, qty);
    if (this.isOpen) this.render();
  }

  remove(id, n = 1) {
    const left = this.count(id) - n;
    if (left > 0) { this.items.set(id, left); return; }
    this.items.delete(id);
    const i = this.belt.indexOf(id);
    if (i >= 0) this.belt[i] = null;
    if (!this.belt[this.beltIdx]) this.cycleQuick();
    if (this.equipped.left === id) this.equipped.left = null;
  }

  currentQuick() { return this.belt[this.beltIdx]; }

  cycleQuick(dir = 1) {
    for (let i = 1; i <= this.belt.length; i++) {
      const idx = (this.beltIdx + i * dir + this.belt.length * 4) % this.belt.length;
      if (this.belt[idx]) { this.beltIdx = idx; return; }
    }
  }

  useQuick() {
    const id = this.currentQuick();
    if (!id || this.count(id) <= 0) return null;
    this.remove(id, 1);
    return id;
  }

  equip(id) {
    const def = ITEMS[id];
    const p = this.game.player;
    if (def.type === 'weapon') this.equipped.weapon = this.equipped.weapon === id ? null : id;
    else if (def.type === 'shield') {
      if (this.equipped.left === id) this.equipped.left = null;
      else { this.equipped.left = id; this.lastShield = id; }
    } else if (def.type === 'torch') {
      if (this.equipped.left === 'torch') this.equipped.left = this.lastShield;
      else { this.equipped.left = 'torch'; this.game.sfx.torchIgnite(); }
    } else if (def.type === 'armadura') {
      const a = this.equipped.armadura;
      a[def.lugar] = a[def.lugar] === id ? null : id;
    } else if (def.type === 'ring') {
      const r = this.equipped.rings;
      const at = r.indexOf(id);
      if (at >= 0) r[at] = null;
      else { const free = r.indexOf(null); r[free >= 0 ? free : 0] = id; }
    }
    p.refreshEquipment();
    this.game.sfx.pickup();
    this.render();
  }

  toggleBelt(id) {
    const i = this.belt.indexOf(id);
    if (i >= 0) { this.belt[i] = null; if (i === this.beltIdx) this.cycleQuick(); }
    else {
      const free = this.belt.indexOf(null);
      if (free >= 0) this.belt[free] = id; else this.belt[this.beltIdx] = id;
    }
    this.render();
  }

  isEquipped(id) { return this.equipped.weapon === id || this.equipped.left === id || this.equipped.rings.includes(id) || this.equipped.armadura[ITEMS[id]?.lugar] === id; }

  open() { this.isOpen = true; this.el.classList.remove('hidden'); this.render(); }
  close() { this.isOpen = false; this.el.classList.add('hidden'); }

  iconFor(id) { return ITEMS[id].icon; }

  render() {
    const types = TAB_TYPES[this.tab];
    const ids = [...this.items.keys()].filter((id) => types.includes(ITEMS[id].type));
    this.el.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === this.tab));
    this.gridEl.innerHTML = '';
    if (!this.selected || !ids.includes(this.selected)) this.selected = ids[0] ?? null;
    for (const id of ids) {
      const c = document.createElement('div');
      c.className = 'cell' + (id === this.selected ? ' sel' : '');
      const def = ITEMS[id];
      const qty = def.type === 'consumable' || def.type === 'ingrediente' ? `<span class="q">${this.count(id)}</span>` : id === 'torch' ? `<span class="q">${fmtTime(this.torchTime)}</span>` : '';
      const eq = this.isEquipped(id) ? '<span class="eq">E</span>' : this.belt.includes(id) ? '<span class="eq">◆</span>' : '';
      c.innerHTML = this.iconFor(id) + qty + eq;
      c.title = def.name;
      c.addEventListener('click', () => { this.selected = id; this.render(); });
      this.gridEl.appendChild(c);
    }
    if (!ids.length) this.gridEl.innerHTML = '<div style="color:#6d6558;font-style:italic;grid-column:1/-1">Nada aqui... ainda.</div>';

    this.beltEl.innerHTML = '';
    this.belt.forEach((id, i) => {
      const c = document.createElement('div');
      c.className = 'cell' + (i === this.beltIdx ? ' active' : '');
      if (id) c.innerHTML = this.iconFor(id) + `<span class="q">${this.count(id)}</span>`;
      c.title = id ? ITEMS[id].name : 'Vazio';
      c.addEventListener('click', () => { if (id) { this.beltIdx = i; this.render(); } });
      this.beltEl.appendChild(c);
    });
    this.renderDetail();
    this.renderStats();
  }

  renderDetail() {
    const d = this.detailEl, id = this.selected;
    const q = (s) => d.querySelector(s);
    if (!id) {
      q('.d-icon').innerHTML = ''; q('.d-name').textContent = '—'; q('.d-type').textContent = '';
      q('.d-stats').innerHTML = ''; q('.d-desc').textContent = ''; q('.d-actions').innerHTML = '';
      return;
    }
    const def = ITEMS[id], p = this.game.player;
    q('.d-icon').innerHTML = this.iconFor(id);
    q('.d-name').textContent = def.name;
    q('.d-type').textContent = TYPE_LABEL[def.type] + (def.twoHanded ? ' (duas mãos)' : '') + (def.lugar ? ` — ${NOME_DO_LUGAR[def.lugar]}` : '');
    let stats = def.stats ? { ...def.stats } : {};
    if (def.type === 'weapon') {
      const fraco = p.strength < (def.requisito ?? 0);
      stats = {
        'Dano': `${def.damage} → ${Math.round(def.damage * p.forcaNaArma(def))}`,
        'Escala (força)': `${def.escala ?? 'E'} (+${pct(p.bonusForca * ESCALA[def.escala ?? 'E'])})`,
        'Força mínima': def.requisito ? (fraco ? `<b style="color:#c85a4a">${def.requisito} — golpes a ${pct(SEM_REQUISITO)}</b>` : def.requisito) : '—',
        'Peso': def.peso ?? 0,
        'Velocidade': def.speed >= 1.3 ? 'Muito rápida' : def.speed >= 1.05 ? 'Rápida' : def.speed >= 0.95 ? 'Média' : 'Lenta',
        'Custo de vigor': def.stamina, 'Alcance': def.reach.toFixed(1) + ' m', 'Quebra de postura': def.poise,
      };
    }
    if (def.type === 'armadura') stats = { 'Absorção': pct(def.absorcao), 'Equilíbrio': `+${def.equilibrio}`, 'Peso': def.peso };
    if (def.type === 'shield' || def.type === 'torch') stats['Peso'] = def.peso ?? 0;
    if (id === 'torch') stats['Restante'] = fmtTime(this.torchTime);
    if (def.type === 'consumable' || def.type === 'ingrediente') stats['Quantidade'] = `${this.count(id)} / ${def.max}`;
    q('.d-stats').innerHTML = Object.entries(stats).map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    q('.d-desc').textContent = def.desc;

    const actions = q('.d-actions');
    actions.innerHTML = '';
    const btn = (label, fn) => { const b = document.createElement('button'); b.textContent = label; b.addEventListener('click', fn); actions.appendChild(b); };
    if (def.type === 'weapon') btn(this.equipped.weapon === id ? 'Desequipar' : 'Equipar', () => this.equip(id));
    if (def.type === 'shield') btn(this.equipped.left === id ? 'Desequipar' : 'Equipar (mão esq.)', () => this.equip(id));
    if (def.type === 'torch') btn(this.equipped.left === 'torch' ? 'Apagar e guardar' : 'Acender (mão esq.)', () => this.equip(id));
    if (def.type === 'ring') btn(this.equipped.rings.includes(id) ? 'Remover' : 'Equipar', () => this.equip(id));
    if (def.type === 'armadura') btn(this.equipped.armadura[def.lugar] === id ? 'Tirar' : 'Vestir', () => this.equip(id));
    if (def.type === 'consumable') btn(this.belt.includes(id) ? 'Tirar do cinto' : 'Pôr no cinto', () => this.toggleBelt(id));
  }

  renderStats() {
    const p = this.game.player;
    const w = p.weapon;
    const rings = this.equipped.rings.filter(Boolean).map((r) => ITEMS[r].name).join(', ') || '—';
    const carga = p.carga;
    const rows = [
      ['Nível', p.level], ['Almas', p.souls],
      ['Vida', `${Math.ceil(p.hp)} / ${p.maxHp}`], ['Vigor', p.maxStamina],
      ['Força', p.strength], ['Mão direita', w.name], ['Dano da arma', Math.round(w.damage * p.damageMul)],
      ['Mão esquerda', this.equipped.left ? ITEMS[this.equipped.left].name : '—'],
      ...LUGARES.map((l) => [NOME_DO_LUGAR[l], this.equipped.armadura[l] ? ITEMS[this.equipped.armadura[l]].name : '—']),
      ['Equilíbrio', p.poise], ['Defesa', pct(p.defense)],
      ['Carga', `${p.peso} / ${p.cargaMax} — <span style="color:${carga.fracao > 1 ? '#c85a4a' : carga.fracao > 0.7 ? '#c8a86a' : 'inherit'}">${carga.nome}</span>`],
      ['Anéis', rings],
    ];
    this.statsEl.innerHTML = rows.map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
  }
}
