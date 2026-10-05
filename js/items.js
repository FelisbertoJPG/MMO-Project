// Definições de itens + ícones em SVG
const svg = (inner) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;

// AS ARMADURAS: um desenho por lugar, na cor do conjunto (couro, malha, placas)
const armaduraIcone = {
  cabeca: (c, b) => svg(`<path d="M14 40 q0-26 18-28 q18 2 18 28 v8 h-10 v-10 h-16 v10 h-10z" fill="${c}" stroke="${b}" stroke-width="2"/>
    <path d="M22 30 h20" stroke="${b}" stroke-width="3"/><path d="M32 12 v14" stroke="${b}" stroke-width="2" opacity=".6"/>`),
  peito: (c, b) => svg(`<path d="M18 12 l8 -2 q6 6 12 0 l8 2 l10 10 -6 8 -4 -3 v29 h-28 v-29 l-4 3 -6 -8z" fill="${c}" stroke="${b}" stroke-width="2"/>
    <path d="M32 18 v38" stroke="${b}" stroke-width="2" opacity=".5"/><path d="M22 40 h20" stroke="${b}" stroke-width="2" opacity=".6"/>`),
  bracos: (c, b) => svg(`<path d="M10 22 l14 -6 l10 26 -14 6z" fill="${c}" stroke="${b}" stroke-width="2"/><path d="M30 22 l14 -6 l10 26 -14 6z" fill="${c}" stroke="${b}" stroke-width="2"/>
    <path d="M14 30 l12 -5 M34 30 l12 -5" stroke="${b}" stroke-width="2" opacity=".6"/>`),
  pernas: (c, b) => svg(`<path d="M18 8 h28 l-2 22 -4 28 h-8 l-2 -26 -2 26 h-8 l-4 -28z" fill="${c}" stroke="${b}" stroke-width="2"/>
    <path d="M18 16 h28" stroke="${b}" stroke-width="3"/><circle cx="24" cy="36" r="3" fill="${b}"/><circle cx="40" cy="36" r="3" fill="${b}"/>`),
};

const ICONS = {
  firebomb: svg(`<circle cx="30" cy="38" r="18" fill="#2a2320" stroke="#6b5a45" stroke-width="2"/>
    <path d="M36 21 q6-8 12-6" stroke="#8a7a5a" stroke-width="3" fill="none"/>
    <circle cx="49" cy="14" r="5" fill="#ffb347"/><circle cx="49" cy="14" r="2.5" fill="#fff4c0"/>
    <path d="M22 30 q4-4 10-3" stroke="#6b5a45" stroke-width="2" fill="none"/>`),
  resin: svg(`<defs><radialGradient id="rg"><stop offset="0" stop-color="#ffb08a"/><stop offset="1" stop-color="#a0200e"/></radialGradient></defs>
    <rect x="18" y="14" width="28" height="42" rx="8" fill="url(#rg)" stroke="#5a2a1a" stroke-width="2"/>
    <rect x="20" y="8" width="24" height="8" rx="2" fill="#4a3a2a"/>
    <path d="M26 28 q6 6 12 0" stroke="#ffd9c0" stroke-width="2" fill="none" opacity=".6"/>`),
  blossom: svg(`<g transform="translate(32 30)" fill="#6fbf4a" stroke="#2f5a1f" stroke-width="1.5">
    <ellipse rx="7" ry="14" transform="rotate(0) translate(0 -9)"/><ellipse rx="7" ry="14" transform="rotate(72) translate(0 -9)"/>
    <ellipse rx="7" ry="14" transform="rotate(144) translate(0 -9)"/><ellipse rx="7" ry="14" transform="rotate(216) translate(0 -9)"/>
    <ellipse rx="7" ry="14" transform="rotate(288) translate(0 -9)"/></g><circle cx="32" cy="30" r="5" fill="#e8f5a0"/>
    <path d="M32 44 v16" stroke="#2f5a1f" stroke-width="3"/>`),
  soul: svg(`<defs><radialGradient id="sg"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#bfe0ff"/><stop offset="1" stop-color="#3a6aa0" stop-opacity="0"/></radialGradient></defs>
    <circle cx="32" cy="34" r="26" fill="url(#sg)"/><path d="M32 8 q-8 14 0 24 q8-10 0-24" fill="#e8f4ff" opacity=".8"/>`),
  bone: svg(`<g fill="#d8cfb6" stroke="#6b634f" stroke-width="2"><rect x="18" y="28" width="28" height="8" rx="3" transform="rotate(-35 32 32)"/>
    <circle cx="17" cy="42" r="6"/><circle cx="23" cy="49" r="6"/><circle cx="41" cy="15" r="6"/><circle cx="47" cy="22" r="6"/></g>`),
  longsword: svg(`<path d="M46 6 l6 6 -30 30 -6 -6z" fill="#c9ccd1" stroke="#555" stroke-width="1.5"/><path d="M48 8 l2 2 -28 28 -2 -2z" fill="#eef0f2" opacity=".6"/>
    <path d="M12 36 l16 16" stroke="#7a6030" stroke-width="5" stroke-linecap="round"/><path d="M18 48 l-8 8" stroke="#3a2a1a" stroke-width="5" stroke-linecap="round"/><circle cx="8" cy="58" r="3.5" fill="#7a6030"/>`),
  dagger: svg(`<path d="M44 12 l6 2 -18 24 -4 -4z" fill="#c9ccd1" stroke="#555" stroke-width="1.5"/>
    <path d="M20 32 l12 12" stroke="#7a6030" stroke-width="4" stroke-linecap="round"/><path d="M26 40 l-10 12" stroke="#3a2a1a" stroke-width="5" stroke-linecap="round"/>`),
  axe: svg(`<path d="M14 58 L46 10" stroke="#5a3a1f" stroke-width="5" stroke-linecap="round"/>
    <path d="M36 10 q18 -4 22 14 q-12 -2 -18 6 z" fill="#aab0b8" stroke="#444" stroke-width="1.5"/>`),
  greatsword: svg(`<path d="M50 4 l10 0 0 10 -34 34 -10 -10z" fill="#b8bcc2" stroke="#444" stroke-width="1.5"/><path d="M54 6 l3 0 -31 34 -2 -2z" fill="#eef0f2" opacity=".5"/>
    <path d="M8 34 l22 22" stroke="#6a5226" stroke-width="6" stroke-linecap="round"/><path d="M16 48 l-10 10" stroke="#2a1d10" stroke-width="6" stroke-linecap="round"/>`),
  ringLife: svg(`<circle cx="32" cy="36" r="17" fill="none" stroke="#c8a24a" stroke-width="6"/><circle cx="32" cy="17" r="8" fill="#c8243a" stroke="#6a0f1a" stroke-width="2"/><circle cx="30" cy="15" r="2.5" fill="#ffb0b8"/>`),
  ringWolf: svg(`<circle cx="32" cy="36" r="17" fill="none" stroke="#8a8f96" stroke-width="6"/><circle cx="32" cy="17" r="8" fill="#5a6a8a" stroke="#223" stroke-width="2"/><path d="M28 14 l4 6 4 -6" stroke="#dde" stroke-width="1.5" fill="none"/>`),
  ringGreen: svg(`<circle cx="32" cy="36" r="17" fill="none" stroke="#b09a4a" stroke-width="6"/><circle cx="32" cy="17" r="8" fill="#3aa04a" stroke="#1a4a1f" stroke-width="2"/><circle cx="30" cy="15" r="2.5" fill="#c0ffc8"/>`),
  bossSoul: svg(`<defs><radialGradient id="bs"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ff7a4a"/><stop offset="1" stop-color="#400" stop-opacity="0"/></radialGradient></defs>
    <circle cx="32" cy="32" r="28" fill="url(#bs)"/><path d="M32 6 q-12 20 0 34 q12 -14 0 -34" fill="#fff0e0" opacity=".7"/>`),
};

ICONS.torch = svg(`<defs><radialGradient id="tf" cx=".5" cy=".7"><stop offset="0" stop-color="#fff2b0"/><stop offset=".45" stop-color="#ff9a2a"/><stop offset="1" stop-color="#c0300a" stop-opacity="0"/></radialGradient></defs>
    <path d="M28 30 L36 30 L34 60 L30 60 Z" fill="#5a3a1f" stroke="#2a1a0a" stroke-width="1.5"/>
    <rect x="26" y="26" width="12" height="7" rx="2" fill="#3a2a1a"/>
    <path d="M32 2 C22 14 20 22 26 28 L38 28 C44 22 42 12 32 2 Z" fill="url(#tf)"/>
    <path d="M32 10 C28 17 28 22 31 26 L34 26 C37 21 36 16 32 10 Z" fill="#fff4c8" opacity=".85"/>`);
ICONS.torchOut = svg(`<path d="M28 30 L36 30 L34 60 L30 60 Z" fill="#3a2a1a" stroke="#1a100a" stroke-width="1.5"/><rect x="26" y="24" width="12" height="9" rx="2" fill="#1c1612"/>
    <path d="M30 20 q2 -8 -1 -14 M34 20 q3 -7 1 -12" stroke="#555" stroke-width="2" fill="none" opacity=".6"/>`);
ICONS.key = svg(`<circle cx="20" cy="22" r="11" fill="none" stroke="#b08a3a" stroke-width="5"/><circle cx="20" cy="22" r="4" fill="#3a2a10"/>
    <path d="M28 30 L54 56" stroke="#b08a3a" stroke-width="6" stroke-linecap="round"/><path d="M44 46 l6 -6 M50 52 l5 -5" stroke="#b08a3a" stroke-width="5" stroke-linecap="round"/>`);
ICONS.shieldRound = svg(`<circle cx="32" cy="32" r="26" fill="#6a4a2a" stroke="#888c92" stroke-width="5"/><circle cx="32" cy="32" r="7" fill="#9a9ea4"/>
    <path d="M32 8 V56 M8 32 H56" stroke="#4a321c" stroke-width="2"/>`);
ICONS.shieldKnight = svg(`<path d="M10 8 H54 V30 C54 46 44 54 32 60 C20 54 10 46 10 30 Z" fill="#3a4a6a" stroke="#a8acb2" stroke-width="4"/>
    <path d="M32 14 V50 M18 28 H46" stroke="#d8c070" stroke-width="5"/>`);
ICONS.fist = svg(`<rect x="16" y="22" width="32" height="26" rx="8" fill="#b89a80" stroke="#5a4636" stroke-width="2"/>
    <path d="M24 22 V34 M32 22 V34 M40 22 V34" stroke="#5a4636" stroke-width="2"/><rect x="20" y="46" width="24" height="12" fill="#6a5a4a"/>`);

// ---- A COZINHA (03/10/2026): ingredientes, comidas e a panela da fogueira ----
const prato = (comida) => svg(`<ellipse cx="32" cy="46" rx="26" ry="9" fill="#6b5a45" stroke="#2a2018" stroke-width="2"/>
    <ellipse cx="32" cy="43" rx="21" ry="6" fill="#8a7658"/>${comida}`);
const tigela = (caldo, extra = '') => svg(`<path d="M8 30 h48 c0 14-10 24-24 24 S8 44 8 30z" fill="#5a4030" stroke="#24180f" stroke-width="2"/>
    <ellipse cx="32" cy="30" rx="24" ry="7" fill="${caldo}" stroke="#24180f" stroke-width="2"/>${extra}
    <path d="M22 18 q-3-6 1-10 M32 16 q-3-6 1-10 M42 18 q-3-6 1-10" stroke="#d8d0c0" stroke-width="2" fill="none" opacity=".55"/>`);
Object.assign(ICONS, {
  farinha: svg(`<path d="M18 22 q14-12 28 0 l4 32 q-18 8-36 0z" fill="#d8c8a0" stroke="#6b5a3a" stroke-width="2"/>
    <path d="M22 22 q10 6 20 0" stroke="#6b5a3a" stroke-width="2" fill="none"/><path d="M26 34 h12 M24 42 h16" stroke="#a89670" stroke-width="2"/>`),
  carneCrua: svg(`<path d="M14 36 q-2-16 16-20 q18-2 22 12 q4 16-14 20 q-20 4-24-12z" fill="#b8404a" stroke="#5a1a1f" stroke-width="2"/>
    <path d="M22 32 q8-6 18 0" stroke="#f0d0c8" stroke-width="3" fill="none"/><circle cx="44" cy="40" r="5" fill="#f0e6d8" stroke="#8a7a6a"/>`),
  cogumelo: svg(`<path d="M10 34 q2-20 22-22 q20 2 22 22z" fill="#8a5a3a" stroke="#3a2214" stroke-width="2"/>
    <circle cx="22" cy="26" r="3" fill="#d8c0a0"/><circle cx="36" cy="22" r="3" fill="#d8c0a0"/><circle cx="44" cy="30" r="2.5" fill="#d8c0a0"/>
    <path d="M26 34 h12 l-2 22 h-8z" fill="#e8dcc0" stroke="#6b5a3a" stroke-width="2"/>`),
  raiz: svg(`<path d="M24 14 q16-4 18 14 q2 18-8 28 q-4 4-8-2 q-10-14-2-40z" fill="#a8763a" stroke="#4a2e14" stroke-width="2"/>
    <path d="M30 14 q-4-8 2-10 M34 13 q2-8 8-8" stroke="#4a7a2a" stroke-width="3" fill="none"/><path d="M28 30 h8 M27 40 h8" stroke="#6b4a24" stroke-width="2"/>`),
  mel: svg(`<path d="M18 22 h28 v26 q0 10-14 10 q-14 0-14-10z" fill="#e0a020" stroke="#6a4a10" stroke-width="2" opacity=".95"/>
    <rect x="16" y="14" width="32" height="9" rx="3" fill="#8a6a40" stroke="#4a3418" stroke-width="2"/><path d="M24 30 q2 8 0 12" stroke="#ffe080" stroke-width="3" fill="none"/>`),
  erva: svg(`<path d="M32 58 V18" stroke="#2f5a1f" stroke-width="3"/>
    <g fill="#5a9a3a" stroke="#2f5a1f" stroke-width="1.5"><ellipse cx="24" cy="24" rx="6" ry="11" transform="rotate(-35 24 24)"/><ellipse cx="40" cy="30" rx="6" ry="11" transform="rotate(35 40 30)"/>
    <ellipse cx="25" cy="40" rx="5" ry="10" transform="rotate(-40 25 40)"/><ellipse cx="39" cy="46" rx="5" ry="9" transform="rotate(40 39 46)"/></g>`),
  pimenta: svg(`<path d="M18 22 q-4 22 18 34 q8 2 4-6 q-14-12-10-28z" fill="#c8241a" stroke="#5a0f0a" stroke-width="2"/>
    <path d="M30 22 q-4-10 6-14" stroke="#3a6a1f" stroke-width="4" fill="none"/><path d="M22 30 q2 10 8 16" stroke="#ff8070" stroke-width="2" fill="none" opacity=".6"/>`),
  paoDuro: prato(`<path d="M14 40 q2-16 18-18 q16 2 18 18 q-18 6-36 0z" fill="#b8843a" stroke="#5a3a14" stroke-width="2"/>
    <path d="M22 32 l4 4 M30 28 l4 4 M38 30 l4 4" stroke="#7a5420" stroke-width="2"/>`),
  carneAssada: prato(`<path d="M14 40 q-2-14 16-16 q18-2 20 10 q2 10-14 12 q-18 2-22-6z" fill="#7a3a1a" stroke="#2a1208" stroke-width="2"/>
    <path d="M44 30 l10-8" stroke="#f0e6d8" stroke-width="5" stroke-linecap="round"/><path d="M22 34 q8-4 16 0" stroke="#b86a3a" stroke-width="2" fill="none"/>`),
  ensopado: tigela('#7a5230', '<circle cx="24" cy="29" r="3" fill="#c8a070"/><circle cx="36" cy="31" r="3" fill="#a8763a"/><circle cx="42" cy="28" r="2.5" fill="#c8a070"/>'),
  mingau: tigela('#e8d8b0', '<path d="M26 28 q6 6 12 0" stroke="#e0a020" stroke-width="3" fill="none"/>'),
  guisado: tigela('#8a3a1a', '<rect x="22" y="26" width="6" height="5" fill="#a8763a"/><rect x="34" y="28" width="6" height="5" fill="#5a2a14"/>'),
  caldoPicante: tigela('#c8301a', '<path d="M30 26 q4 4 8 2" stroke="#3a6a1f" stroke-width="3" fill="none"/>'),
  gororoba: tigela('#6a6450', '<circle cx="26" cy="29" r="3" fill="#4a4a3a"/><circle cx="38" cy="30" r="2.5" fill="#8a7a50"/>'),
  chaErva: svg(`<path d="M14 26 h32 v14 q0 14-16 14 q-16 0-16-14z" fill="#e8dcc8" stroke="#5a4a3a" stroke-width="2"/>
    <path d="M46 30 q10 0 8 8 q-2 6-8 4" stroke="#5a4a3a" stroke-width="3" fill="none"/><ellipse cx="30" cy="27" rx="15" ry="4" fill="#7aa04a"/>
    <path d="M24 18 q-3-6 1-10 M34 18 q-3-6 1-10" stroke="#d8d0c0" stroke-width="2" fill="none" opacity=".55"/>`),
  panela: svg(`<path d="M10 26 h44 v14 q0 14-22 14 q-22 0-22-14z" fill="#2a2420" stroke="#8a7a5a" stroke-width="2"/>
    <path d="M4 28 h6 M54 28 h6" stroke="#8a7a5a" stroke-width="4"/><ellipse cx="32" cy="26" rx="22" ry="5" fill="#7a5230" stroke="#8a7a5a" stroke-width="2"/>
    <path d="M18 54 l-4 6 M46 54 l4 6" stroke="#ff8a2a" stroke-width="3"/>`),
});

export const ICON_PANELA = ICONS.panela;

export const UNARMED = {
  id: 'unarmed', name: 'Punhos', type: 'weapon', icon: ICONS.fist,
  damage: 9, speed: 1.0, stamina: 10, reach: 1.2, poise: 6, escala: 'E', peso: 0,
  light: ['jab', 'cross'], heavy: 'cross',
};

export const TORCH_LIFE = 3600; // segundos acesa na mão (1 hora)

/**
 * AS ARMADURAS (04/10/2026) — três conjuntos, um por armadura do guerreiro (o corpo do
 * jogador, guerreiro.js: `conjunto` 1, 2 ou 3 é o A1/A2/A3 do modelo), em quatro lugares
 * (ficha.js `LUGARES`; o couro não tem elmo — o modelo também não). `absorcao` = a fração
 * do golpe que a peça segura (somada às outras), `peso` conta na carga, `equilibrio`
 * soma ao do jogador (aguenta mais golpes sem cambalear). Os três conjuntos:
 * couro (leve: 16%, peso 6), malha (média: 29%, peso 14), placas (pesada: 40%, peso 24).
 */
function armaduras() {
  const CONJ = {
    1: { nome: 'do Batedor', cor: '#8a5a32', borda: '#3a2210', desc: 'Couro curtido de um batedor da estrada. Leve: quase não atrapalha o rolamento.' },
    2: { nome: 'do Sentinela', cor: '#8a8f96', borda: '#2a2e34', desc: 'Malha e placas de um sentinela da masmorra. Protege bem sem pesar demais.' },
    3: { nome: 'do Cavaleiro Caído', cor: '#4e5866', borda: '#c8a24a', desc: 'Placas pesadas de uma ordem que desafiou o Carrasco. Segura muito, mas pede resistência para ser carregada.' },
  };
  // [nome, nome no couro] — o peito de couro é a TÚNICA (o nosso desenho, tunica.js)
  const PECA = { cabeca: ['Elmo', 'Capacete'], peito: ['Peitoral', 'Túnica'], bracos: ['Braçadeiras', 'Braçadeiras'], pernas: ['Grevas', 'Calças'] };
  // [absorção, peso, equilíbrio] por conjunto e lugar
  const NUM = {
    1: { peito: [0.08, 3, 2], bracos: [0.03, 1, 1], pernas: [0.05, 2, 1] },
    2: { cabeca: [0.05, 2, 2], peito: [0.12, 6, 6], bracos: [0.04, 2, 2], pernas: [0.08, 4, 4] },
    3: { cabeca: [0.07, 3.5, 4], peito: [0.16, 10, 12], bracos: [0.06, 3.5, 4], pernas: [0.11, 7, 8] },
  };
  const itens = {};
  for (const [k, c] of Object.entries(CONJ)) {
    for (const [lugar, [absorcao, peso, equilibrio]] of Object.entries(NUM[k])) {
      itens[`arm${k}_${lugar}`] = {
        name: `${PECA[lugar][k === '1' ? 1 : 0]} ${c.nome}`, type: 'armadura', lugar, conjunto: Number(k),
        icon: armaduraIcone[lugar](c.cor, c.borda), desc: c.desc,
        absorcao, peso, equilibrio,
      };
    }
  }
  return itens;
}

export const ITEMS = {
  // ---- COMIDAS (substituem o Estus): `use: 'comer'`. `cura` na hora; `regen`
  // = cura por segundo durante `dur`; `efeito` = um status por `dur` segundos
  // (ver `Player.applyItem` e os `buffs`). Saem da panela da fogueira (`receitas.js`)
  // ou caem de barris e inimigos.
  paoDuro: {
    name: 'Pão Duro', type: 'consumable', icon: ICONS.paoDuro, use: 'comer', cura: 70, max: 10,
    desc: 'Pão de muitos dias, duro como pedra. Mata a fome e fecha um corte ou dois.',
    stats: { 'Cura': '70 PV' },
  },
  carneAssada: {
    name: 'Carne Assada', type: 'consumable', icon: ICONS.carneAssada, use: 'comer', cura: 140, max: 10,
    desc: 'Carne tostada direto na chama da fogueira. Cura de uma vez só.',
    stats: { 'Cura': '140 PV' },
  },
  ensopado: {
    name: 'Ensopado de Cogumelos', type: 'consumable', icon: ICONS.ensopado, use: 'comer', cura: 40, regen: { porSeg: 18, dur: 10 }, max: 10,
    desc: 'Cogumelos da caverna cozidos com raiz. Esquenta o corpo e vai curando aos poucos.',
    stats: { 'Cura': '40 PV + 180 em 10s' },
  },
  mingau: {
    name: 'Mingau com Mel', type: 'consumable', icon: ICONS.mingau, use: 'comer', cura: 60, efeito: { tipo: 'folego', dur: 40 }, max: 10,
    desc: 'Farinha, água e mel. Doce e quente: o fôlego volta mais rápido por um tempo.',
    stats: { 'Cura': '60 PV', 'Fôlego': '+60% vigor por 40s' },
  },
  guisado: {
    name: 'Guisado de Raiz', type: 'consumable', icon: ICONS.guisado, use: 'comer', cura: 50, efeito: { tipo: 'fortaleza', dur: 60 }, max: 10,
    desc: 'Raiz grossa e carne, cozidas até desmanchar. Pesa no estômago e endurece a pele.',
    stats: { 'Cura': '50 PV', 'Fortaleza': '+15% defesa por 60s' },
  },
  caldoPicante: {
    name: 'Caldo Picante', type: 'consumable', icon: ICONS.caldoPicante, use: 'comer', cura: 30, efeito: { tipo: 'furia', dur: 45 }, max: 10,
    desc: 'Pimenta fervida até arder os olhos. Esquenta o sangue: os golpes saem mais fortes.',
    stats: { 'Cura': '30 PV', 'Fúria': '+20% dano por 45s' },
  },
  chaErva: {
    name: 'Chá de Erva Amarga', type: 'consumable', icon: ICONS.chaErva, use: 'comer', cura: 20, regen: { porSeg: 6, dur: 40 }, max: 10,
    desc: 'Amargo de doer. Não enche a barriga, mas o corpo se remenda devagar por bastante tempo.',
    stats: { 'Cura': '20 PV + 240 em 40s' },
  },

  gororoba: {
    name: 'Gororoba', type: 'consumable', icon: ICONS.gororoba, use: 'comer', cura: 15, max: 10,
    desc: 'O que sai da panela quando a mistura não é receita nenhuma. Mal dá para engolir, mas alimenta um pouco.',
    stats: { 'Cura': '15 PV' },
  },

  // ---- INGREDIENTES: não se usam sozinhos — vão para a panela da fogueira
  farinha: { name: 'Farinha', type: 'ingrediente', icon: ICONS.farinha, max: 20, desc: 'Um punhado de farinha grossa, guardada num saco. Base de pão e de mingau.' },
  carneCrua: { name: 'Carne Crua', type: 'ingrediente', icon: ICONS.carneCrua, max: 20, desc: 'Carne salgada para durar. Melhor não comer assim.' },
  cogumelo: { name: 'Cogumelo da Caverna', type: 'ingrediente', icon: ICONS.cogumelo, max: 20, desc: 'Cresce no escuro úmido da masmorra. Cozido, perde o amargor.' },
  raiz: { name: 'Raiz Grossa', type: 'ingrediente', icon: ICONS.raiz, max: 20, desc: 'Uma raiz dura e farinhenta. Engrossa qualquer caldo.' },
  mel: { name: 'Mel Silvestre', type: 'ingrediente', icon: ICONS.mel, max: 20, desc: 'Um pote de mel escuro. Raro e doce.' },
  erva: { name: 'Erva Amarga', type: 'ingrediente', icon: ICONS.erva, max: 20, desc: 'Folhas amargas que os velhos curandeiros ferviam para remendar o corpo.' },
  pimenta: { name: 'Pimenta Rubra', type: 'ingrediente', icon: ICONS.pimenta, max: 20, desc: 'Arde só de olhar. Os esqueletos ladinos a carregam por algum motivo.' },

  firebomb: {
    name: 'Bomba Incendiária', type: 'consumable', icon: ICONS.firebomb,
    desc: 'Pote de barro cheio de pólvora negra. Arremesse para explodir inimigos em chamas.',
    use: 'throw', damage: 85, radius: 2.8, max: 10, stats: { 'Dano': '85 (área)' },
  },
  resin: {
    name: 'Resina Carmesim', type: 'consumable', icon: ICONS.resin,
    desc: 'Resina que queima ao tocar o aço. Imbui a arma com fogo por 40 segundos (+35% de dano).',
    use: 'resin', duration: 40, max: 5, stats: { 'Duração': '40s', 'Dano': '+35%' },
  },
  blossom: {
    name: 'Flor Verde', type: 'consumable', icon: ICONS.blossom,
    desc: 'Erva perfumada cultivada por um clérigo esquecido. Acelera muito a recuperação de vigor por 30s.',
    use: 'blossom', duration: 30, max: 5, stats: { 'Duração': '30s', 'Vigor': '+60% regen.' },
  },
  lostSoul: {
    name: 'Alma de Morto-Vivo', type: 'consumable', icon: ICONS.soul,
    desc: 'A alma de um morto-vivo que se perdeu. Consuma para obter 250 almas.',
    use: 'souls', amount: 250, max: 99, stats: { 'Almas': '+250' },
  },
  bone: {
    name: 'Osso de Retorno', type: 'consumable', icon: ICONS.bone,
    desc: 'Osso de um morto-vivo queimado em uma fogueira. Retorna à última fogueira em que descansou.',
    use: 'home', max: 10, stats: { 'Efeito': 'Teleporte' },
  },

  // ARMAS (ficha.js): `escala` = quanto a arma aproveita da força (E a A), `requisito` =
  // força mínima (abaixo dela, golpes fracos), `peso` = o que conta na carga
  dagger: {
    name: 'Adaga Enferrujada', type: 'weapon', icon: ICONS.dagger, model: 'dagger',
    desc: 'Encontrada junto a um prisioneiro que nunca saiu da cela. Curta, veloz e barata de usar.',
    damage: 17, speed: 1.25, stamina: 9, reach: 1.5, poise: 8,
    escala: 'D', requisito: 6, peso: 1,
    light: ['slashA', 'slashB'], heavy: 'dash',
  },
  longsword: {
    name: 'Espada Longa', type: 'weapon', icon: ICONS.longsword, model: 'longsword',
    desc: 'Espada reta de um guarda da masmorra. Equilibrada e confiável.',
    damage: 30, speed: 0.85, stamina: 16, reach: 2.0, poise: 20,
    escala: 'C', requisito: 10, peso: 3,
    light: ['slashA', 'slashB', 'slashC'], heavy: 'overhead',
  },
  axe: {
    name: 'Machado de Batalha', type: 'weapon', icon: ICONS.axe, model: 'axe',
    desc: 'Machado pesado de um carcereiro. Golpes brutais que quebram a postura.',
    damage: 40, speed: 0.72, stamina: 21, reach: 1.9, poise: 35,
    escala: 'B', requisito: 14, peso: 4.5,
    light: ['slashC', 'slashB'], heavy: 'overhead',
  },
  greatsword: {
    name: 'Espadão do Cavaleiro', type: 'weapon', icon: ICONS.greatsword, model: 'greatsword', twoHanded: true,
    desc: 'Espada colossal de um cavaleiro que tentou desafiar o Carrasco. Empunhada com as duas mãos.',
    damage: 62, speed: 0.9, stamina: 30, reach: 2.5, poise: 60,
    escala: 'A', requisito: 18, peso: 9,
    guarda: 0.5,   // bloqueia com a própria lâmina (o escudo vai para as costas)
    light: ['heavy1', 'heavy2', 'heavy3', 'heavy4'], heavy: 'overhead',
  },

  shieldRound: {
    name: 'Escudo Redondo de Madeira', type: 'shield', icon: ICONS.shieldRound, model: 'round',
    desc: 'Escudo simples de tábuas com aro de ferro. Bloqueia, mas cansa o braço.',
    stability: 0.45, peso: 2.5, stats: { 'Estabilidade': '45' },
  },
  shieldKnight: {
    name: 'Escudo do Cavaleiro', type: 'shield', icon: ICONS.shieldKnight, model: 'knight',
    desc: 'Escudo de aço com o brasão de uma ordem extinta. Absorve golpes pesados com facilidade.',
    stability: 0.75, peso: 7, stats: { 'Estabilidade': '75' },
  },
  torch: {
    name: 'Tocha', type: 'torch', icon: ICONS.torch, model: 'torch',
    desc: 'Tocha arrancada da parede da masmorra. Empunhada na mão esquerda, ilumina o caminho e queima inimigos (botão direito). Queima por 1 hora enquanto estiver na mão. Só é possível carregar uma.',
    damage: 20, burn: 6, peso: 0.5, stats: { 'Dano': '20 + fogo', 'Duração': '1 hora acesa' },
  },

  ringLife: {
    name: 'Anel do Coração Rubro', type: 'ring', icon: ICONS.ringLife,
    desc: 'Um rubi pulsante encravado em ouro. Aumenta a vida máxima em 20%.',
    effect: { hpMul: 0.2 }, stats: { 'Vida': '+20%' },
  },
  ringWolf: {
    name: 'Anel do Lobo Cinzento', type: 'ring', icon: ICONS.ringWolf,
    desc: 'Pertenceu a um cavaleiro que caminhou pelo abismo. Aumenta o equilíbrio e reduz o dano recebido em 12%.',
    effect: { poise: 30, defense: 0.12 }, stats: { 'Equilíbrio': '+30', 'Defesa': '+12%' },
  },
  ringGreen: {
    name: 'Anel da Folha Verde', type: 'ring', icon: ICONS.ringGreen,
    desc: 'Anel de uma ordem de ermitãos. Aumenta a recuperação de vigor em 25%.',
    effect: { staminaRegen: 0.25 }, stats: { 'Vigor': '+25% regen.' },
  },

  ...armaduras(),

  cellKey: {
    name: 'Chave da Cela', type: 'key', icon: ICONS.key,
    desc: 'Chave enferrujada jogada por alguém lá de cima. Quem? E por quê?',
    stats: { 'Tipo': 'Chave' },
  },
  executionerSoul: {
    name: 'Alma do Carrasco', type: 'key', icon: ICONS.bossSoul,
    desc: 'A alma do Carrasco da masmorra, que decapitou mil mortos-vivos antes de você. Ainda pesa como ferro.',
    stats: { 'Tipo': 'Alma de Chefe' },
  },
  wyrmSoul: {
    name: 'Alma do Wyrm das Cinzas', type: 'key', icon: ICONS.bossSoul,
    desc: 'Arde sem chama. O dragão que dormia sobre a masmorra nunca voou — mas também nunca desceu.',
    stats: { 'Tipo': 'Alma de Chefe' },
  },
};

export const ICON_TORCH_OUT = ICONS.torchOut;
