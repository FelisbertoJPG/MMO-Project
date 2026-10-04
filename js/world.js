import * as THREE from 'three';
import { Assets } from './assets.js';
import { CharacterModel } from './character.js';
import { makeWeapon } from './gear.js';

const flatDistXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const S = 1.5; // escala da masmorra (salas e corredores 50% maiores)
export const CELL = 4 * S;
export const WALL_H = 4 * S;
const WT = 0.5 * S; // meia espessura das paredes

// Masmorra (cada caractere = 4x4 m). Norte = -Z. O jogador começa na cela de baixo e sobe.
// '#' rocha, '.' piso de pedra, ',' terra, 'c' cela, 'X' arena do Carrasco,
// 'f' AR LIVRE (a floresta a leste: grama, sem teto, borda sem parede desenhada)
//
// O MAPA DE VERDADE mora em `assets/mapa.json` (26/09/2026) e é editado pelo
// editor de cenas — o arquivo guarda variantes e diz qual está ativa. Isto aqui
// é a EMERGÊNCIA: o que o jogo usa quando o arquivo não pode ser lido, com um
// `console.error` gritando o motivo.
//
// Ele é uma segunda cópia do mapa e PODE envelhecer — preço assumido. Uma
// masmorra sem barril é jogável; uma sem paredes não existe, então não abrir
// seria pior. O editor não lê isto daqui: ele lê o ARQUIVO, e se recusa a abrir
// sem ele, para ninguém editar a emergência achando que salvou o de verdade.
const MAPA_DE_EMERGENCIA = [
  '###############', // 0
  '####XXXXXXX####', // 1
  '###XXXXXXXXX###', // 2
  '###XXXXXXXXX###', // 3
  '###XXXXXXXXX###', // 4
  '###XXXXXXXXX###', // 5
  '####XXXXXXX####', // 6
  '#######.#######', // 7  corredor da névoa
  '#######,#######', // 8
  '##...........##', // 9  ossário
  '##...........##', // 10
  '##...........##', // 11
  '##...........##', // 12
  '##...........##', // 13
  '#######.#######', // 14
  '###.........###', // 15 sala da guarda
  '###..........,#', // 16 (alcova do tesouro a leste)
  '###.........###', // 17
  '#######.#######', // 18
  '####.......####', // 19 sala da fogueira
  '####.......####', // 20
  '####.......####', // 21
  '#######.#######', // 22
  '#.............#', // 23 corredor das celas
  '#c#c#c#c#c#c###', // 24 celas
  '###############', // 25
];

const SPECIAL_EDGES = [
  { a: [24, 5], b: [23, 5], type: 'celldoor' },
  ...[1, 3, 7, 9, 11].map((c) => ({ a: [24, c], b: [23, c], type: 'bars' })),
  { a: [18, 7], b: [17, 7], type: 'door' },
  { a: [16, 11], b: [16, 12], type: 'door' },
  { a: [7, 7], b: [6, 7], type: 'fog' },
  // a saída para a FLORESTA: um vão aberto na parede de terra da alcova do
  // tesouro. Só existe no mapa `floresta` (assets/mapa.json); no `original` a
  // célula (16,14) é rocha e esta aresta nunca é visitada.
  { a: [16, 13], b: [16, 14], type: 'arco' },
];

// Tochas de parede: [linha, coluna, lado da parede]
const TORCHES = [
  [23, 3, 'n'], [23, 9, 'n'], [23, 13, 'e'],
  [19, 4, 'w'], [21, 10, 'e'],
  [15, 3, 'n'], [17, 11, 's'], [15, 9, 'n'],
  [9, 2, 'w'], [13, 12, 'e'], [9, 10, 'n'], [13, 4, 's'],
  [8, 7, 'e'],
];

// Tochas de ESTACA (02/10/2026): fincadas no chão, para onde não há parede em
// que pendurar — o acampamento e a entrada da masmorra. Quem nasce do lado de
// fora (o mundo online) não passa pelo corredor das celas, que é onde estavam
// as primeiras tochas. `off` em metros a partir do centro da célula.
// Entram em `world.torches` DEPOIS das de parede: o save guarda as tochas pela
// ordem, e uma no meio embaralharia os saves antigos.
const TOCHAS_DE_ESTACA = [
  { cell: [16, 14], off: [-1.3, -2.3] },   // a entrada da masmorra (o arco), uma de cada lado
  { cell: [16, 14], off: [-1.3, 2.3] },
  { cell: [15, 42], off: [1.2, 0.8] },     // o portão do acampamento, junto à cerca
  { cell: [17, 42], off: [1.2, -0.8] },
  { cell: [13, 48], off: [0.5, 2.2] },     // ao lado do cabide de armas
];

/**
 * OS QUEBRÁVEIS (03/10/2026): peças do `decor.json` que um golpe (ou a explosão
 * de uma bomba) estoura em pedaços. `cor` é a dos pedaços; `pedacos`, quantos;
 * `saque`, a tabela do que pode cair (ver `SAQUES`). Peça nova que deva quebrar
 * é uma linha aqui — o nome é o do `PROPS` (assets.js), como no decor.json.
 */
export const QUEBRAVEIS = {
  barrel_small:   { cor: 0x6b4a2b, pedacos: 9,  saque: 'barril' },
  barrel_large:   { cor: 0x6b4a2b, pedacos: 13, saque: 'barril' },
  keg:            { cor: 0x5e4026, pedacos: 9,  saque: 'chope' },
  crates_stacked: { cor: 0x7a5a36, pedacos: 14, saque: 'caixote' },
  crate_open:     { cor: 0x7a5a36, pedacos: 10, saque: 'caixote' },
  box_stacked:    { cor: 0x7a5a36, pedacos: 12, saque: 'caixote' },
  sack:           { cor: 0x9a8458, pedacos: 7,  saque: 'saco' },
  bucket_water:   { cor: 0x5a4a3a, pedacos: 6,  saque: null },
  bottle_A_green: { cor: 0x3a7a4a, pedacos: 5,  saque: null },
  stool:          { cor: 0x5a3a20, pedacos: 6,  saque: null },
};

/**
 * A VEGETAÇÃO também se corta (arbustos, gramas, mato): em vez de lascas, solta
 * FOLHAS (partículas verdes). Ela é LOCAL — só quem cortou a vê cortada, e ela
 * cresce de novo `REBROTA_S` segundos depois, com o jogador longe: sincronizar
 * centenas de matinhos encheria o retrato do Mundo online à toa. E ela continua
 * nos LOTES da decoração (são ~100 peças): cortar esconde só aquela cópia.
 */
const VEGETACAO = /^(Bush_|Grass_|floor_dirt_small_weeds)/;
export const REBROTA_S = 90;
export function cfgQuebravel(prop) {
  if (QUEBRAVEIS[prop]) return QUEBRAVEIS[prop];
  if (!VEGETACAO.test(prop)) return null;
  return { folhas: true, local: true, pedacos: 0, saque: prop.startsWith('Bush_') ? 'arbusto' : null };
}

/** O que cai de um quebrável: `[item, peso]`, sorteado UM; `null` = nada. */
export const SAQUES = {
  arbusto: [[null, 6], ['erva', 1]],
  barril:  [[null, 4], ['farinha', 2], ['carneCrua', 2], ['raiz', 2], ['cogumelo', 1], ['paoDuro', 1]],
  chope:   [[null, 3], ['mel', 2], ['erva', 1]],
  caixote: [[null, 4], ['raiz', 2], ['cogumelo', 2], ['pimenta', 1], ['firebomb', 1], ['paoDuro', 1]],
  saco:    [[null, 2], ['farinha', 3], ['erva', 1]],
};

// Baús: célula, parede de apoio e conteúdo
const CHESTS = [
  { cell: [19, 10], wall: 'n', items: [['paoDuro', 3], ['ensopado', 2]] },
  { cell: [23, 1], wall: 'w', items: [['bone', 2]] },
  { cell: [15, 11], wall: 'n', items: [['shieldRound', 1]] },
  { cell: [9, 12], wall: 'n', items: [['firebomb', 3]] },
  { cell: [13, 2], wall: 's', items: [['ringLife', 1], ['lostSoul', 1]] },
  // na parede SUL da alcova: a leste agora é a saída para a floresta (`arco`),
  // e encostado nela o baú ficava no meio da passagem
  { cell: [16, 13], wall: 's', items: [['greatsword', 1], ['ringWolf', 1]], gold: true },
  // o do ACAMPAMENTO, atrás da barraca do norte. No FIM da lista: o save
  // guarda os baús pela ordem, e um no meio embaralharia os saves antigos
  // (`buildChests` pula o que cai na rocha: o mapa `original` não tem acampamento).
  { cell: [12, 47], wall: 'n', items: [['firebomb', 2], ['lostSoul', 1]] },
];

// Itens no chão (alguns junto a cadáveres)
const PICKUPS = [
  { cell: [23, 2], wall: 'n', item: 'dagger', corpse: true },
  { cell: [17, 4], wall: 's', item: 'longsword', corpse: true },
  { cell: [11, 2], wall: 'w', item: 'axe', corpse: true },
  { cell: [9, 6], wall: 'n', item: 'shieldKnight', corpse: true },
  { cell: [13, 8], wall: 's', item: 'resin', qty: 2 },
  { cell: [15, 6], wall: 'n', item: 'blossom', qty: 2 },
  { cell: [21, 4], wall: 's', item: 'lostSoul', qty: 1 },
  { cell: [23, 11], wall: 'n', item: 'firebomb', qty: 2 },
  { cell: [8, 7], wall: 'w', item: 'ringGreen', qty: 1 },
];

const MESSAGES = [
  { cell: [23, 5], text: 'Tochas iluminam o caminho — pegue uma na parede (E)', off: [0, -0.8] },
  { cell: [21, 7], text: 'Descanse. Mas os mortos se levantarão de novo.', off: [0, 1.2] },
  { cell: [16, 7], text: 'Ossos dormem no chão... até você chegar perto', off: [0, 0] },
  { cell: [13, 7], text: 'Fogo é a fraqueza dos ossos', off: [0, 1] },
  { cell: [7, 7], text: 'O Carrasco aguarda. Role através do machado.', off: [0, 1] },
  // o acampamento e a estrada (só existem no mapa `floresta` estendido — `buildMessages` pula as que caem na rocha)
  { cell: [16, 52], text: 'O desabamento fechou a estrada. Só resta seguir em frente.', off: [-1.5, 1.4] },
  { cell: [16, 43], text: 'A masmorra fica a oeste, depois da floresta. Não vá de mãos vazias.', off: [0, 1.6] },
  { cell: [16, 41], text: 'Há ossos sob a relva. Pise leve.', off: [1.5, -1.2] },
];

const DIRS = { n: [-1, 0], s: [1, 0], w: [0, -1], e: [0, 1] };
const YAW_INTO = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 }; // rotação para +Z apontar para dentro da célula

export const BONFIRE_POS = new THREE.Vector3(7 * CELL, 0, 20 * CELL);
export const ARENA_CENTER = new THREE.Vector3(7 * CELL, 0, 3.5 * CELL);
export const FOG_POS = new THREE.Vector3(7 * CELL, 0, 6.5 * CELL);
export const START_POS = new THREE.Vector3(5 * CELL, 0, 24 * CELL);
// O ACAMPAMENTO (02/10/2026): a clareira a leste da floresta, com a segunda
// fogueira. É onde nasce quem entra no MUNDO ONLINE (`Player.startOutside`).
// O `decorar-acampamento.mjs` do editor de cenas LÊ esta linha para arrumar as
// barracas em volta — mudou aqui, rode a ferramenta de novo.
// 03/10/2026: a MATA abriu 14 colunas entre a floresta e o acampamento, que foi
// de 26–39 para 40–53 (e a decoração dele andou junto no decor.json). A
// ferramenta do editor ainda assume "da coluna 26 em diante": ajuste-a antes de
// rodá-la de novo, ou ela redecora a mata como se fosse o acampamento.
export const CAMP_POS = new THREE.Vector3(47.5 * CELL, 0, 16 * CELL);

/**
 * AS TAGS DE LUGAR (`marcos` no mapa.json, 04/10/2026). As posições acima são o
 * padrão; a variante ativa do mapa pode trazer as suas, em [linha, coluna]:
 * `inicio` (START_POS), `masmorra` (BONFIRE_POS), `acampamento` (CAMP_POS) e
 * `nascer` (o id da fogueira onde nasce o personagem novo do Mundo online, e onde
 * acorda quem estava salvo com outro `nascer` — save.js). Editar o mapa e mudar o
 * ponto de nascer é só mudar a tag: o código não muda.
 * Muda os Vector3 NO LUGAR: as FOGUEIRAS e quem importou as constantes os seguem.
 */
export function aplicarMarcos(m = {}) {
  const cel = (v) => (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? v : null);
  const c0 = cel(m.inicio);
  if (c0) START_POS.set(c0[1] * CELL, 0, c0[0] * CELL);
  // cada fogueira pela tag do mesmo nome (`masmorra`, `acampamento`, `colinas`…)
  for (const f of FOGUEIRAS) { const c = cel(m[f.id]); if (c) f.pos.set(c[1] * CELL, 0, c[0] * CELL); }
  NASCER.id = typeof m.nascer === 'string' && FOGUEIRAS.some((f) => f.id === m.nascer) ? m.nascer : 'acampamento';
}
/** A fogueira onde se nasce no Mundo online (a tag `nascer`) e a assinatura do lugar dela. */
export const NASCER = {
  id: 'acampamento',
  get chave() { const f = FOGUEIRAS.find((x) => x.id === this.id); return `${this.id}@${f ? `${(f.pos.z / CELL).toFixed(2)},${(f.pos.x / CELL).toFixed(2)}` : '?'}`; },
};
/**
 * As FOGUEIRAS, no plural. `acordar` = onde se renasce, em metros a partir do
 * fogo, e `rumo` = para onde se acorda olhando. A da masmorra é a primeira: é
 * a de quem tem um save de antes de haver duas. Uma fogueira cuja célula é
 * rocha no mapa ativo (o `original` não tem acampamento) não é construída.
 */
export const FOGUEIRAS = [
  { id: 'masmorra', nome: 'Sala da Fogueira', pos: BONFIRE_POS, acordar: [0, 2.6], rumo: Math.PI },
  { id: 'acampamento', nome: 'Acampamento', pos: CAMP_POS, acordar: [3.2, 0], rumo: -Math.PI / 2 },
  // a das COLINAS DO VENTO (a região de relevo a leste do acampamento): o lugar vem da
  // tag `colinas` do mapa; sem ela (ou no mapa `original`) fica na rocha e não é construída
  { id: 'colinas', nome: 'Colinas do Vento', pos: new THREE.Vector3(-99, 0, -99), acordar: [3.2, 0], rumo: Math.PI / 2 },
];
export const GLOW = { tex: null };

// ---------------------------------------------------------------- O CICLO DO DIA
// Um dia inteiro em DIA_S segundos (20 min), contado pelo relógio de verdade: duas
// telas — e todos no Mundo online — veem a mesma hora sem trocar recado nenhum.
export const DIA_S = 20 * 60;
/** A hora do mundo, de 0 a 24 (0 = meia-noite). */
// (para testar: `__hora = 12` no console prende o relógio ao meio-dia; `__hora = null` solta)
export function horaDoMundo(agora = Date.now()) { return Number.isFinite(globalThis.__hora) ? globalThis.__hora : ((agora / 1000) % DIA_S) / DIA_S * 24; }
// As CHAVES do céu (hora → como está): o resto é interpolado entre a de antes e a de depois.
// `dia` (0–1) é quanto de sol há — os campos só ficam mais verdes com sol.
const CEU = [
  [0, { fundo: 0x0e1830, nevoa: 0x101a30, dens: 0.014, hemi: 2.1, amb: 1.6, lua: 3.0, ceu: 0x46506e, chao: 0x100c08, ambCor: 0x24242e, luz: 0x9db4e8, dia: 0 }],
  [4.8, { fundo: 0x121a34, nevoa: 0x141d34, dens: 0.013, hemi: 2.1, amb: 1.6, lua: 2.6, ceu: 0x4a5272, chao: 0x120e0a, ambCor: 0x26262f, luz: 0xa0b4e0, dia: 0 }],
  [6.3, { fundo: 0xc98e78, nevoa: 0xbf9886, dens: 0.009, hemi: 2.4, amb: 1.4, lua: 2.6, ceu: 0xffc3a0, chao: 0x3a3024, ambCor: 0x3a3030, luz: 0xffad78, dia: 0.5 }],
  [8.5, { fundo: 0x7fb2e8, nevoa: 0xa9c8e8, dens: 0.005, hemi: 3.0, amb: 1.5, lua: 4.0, ceu: 0xd8e8ff, chao: 0x4a5a32, ambCor: 0x404650, luz: 0xfff1d6, dia: 1 }],
  [15.5, { fundo: 0x7fb2e8, nevoa: 0xa9c8e8, dens: 0.005, hemi: 3.0, amb: 1.5, lua: 4.0, ceu: 0xd8e8ff, chao: 0x4a5a32, ambCor: 0x404650, luz: 0xfff1d6, dia: 1 }],
  [17.6, { fundo: 0xd98a52, nevoa: 0xcf9a72, dens: 0.007, hemi: 2.6, amb: 1.35, lua: 3.4, ceu: 0xffc890, chao: 0x3d4a2a, ambCor: 0x3c3428, luz: 0xffad5c, dia: 0.7 }],
  [19.0, { fundo: 0x3a3a68, nevoa: 0x40406a, dens: 0.011, hemi: 2.2, amb: 1.5, lua: 2.6, ceu: 0x6a6a9a, chao: 0x151210, ambCor: 0x2a2836, luz: 0xc0a0d0, dia: 0.1 }],
  [20.5, { fundo: 0x0e1830, nevoa: 0x101a30, dens: 0.014, hemi: 2.1, amb: 1.6, lua: 3.0, ceu: 0x46506e, chao: 0x100c08, ambCor: 0x24242e, luz: 0x9db4e8, dia: 0 }],
  [24, null],   // = a da meia-noite
].map(([h, c]) => [h, c && Object.fromEntries(Object.entries(c).map(([k, v]) => [k, typeof v === 'number' && k !== 'dens' && k !== 'hemi' && k !== 'amb' && k !== 'lua' && k !== 'dia' ? new THREE.Color(v) : v]))]);
CEU[CEU.length - 1][1] = CEU[0][1];
/** Como está o céu na hora `h` (0–24). Reaproveita `alvo` (não aloca por quadro). */
export function cicloDoDia(h, alvo = null) {
  let i = 0;
  while (i < CEU.length - 2 && CEU[i + 1][0] <= h) i++;
  const [ha, a] = CEU[i], [hb, b] = CEU[i + 1], u = hb > ha ? Math.min(1, Math.max(0, (h - ha) / (hb - ha))) : 0;
  const t = u * u * (3 - 2 * u);
  const o = alvo ?? { fundo: new THREE.Color(), nevoa: new THREE.Color(), ceu: new THREE.Color(), chao: new THREE.Color(), ambCor: new THREE.Color(), luz: new THREE.Color(), dir: new THREE.Vector3() };
  for (const k of ['fundo', 'nevoa', 'ceu', 'chao', 'ambCor', 'luz']) o[k].copy(a[k]).lerp(b[k], t);
  for (const k of ['dens', 'hemi', 'amb', 'lua', 'dia']) o[k] = a[k] + (b[k] - a[k]) * t;
  // o sol nasce no LESTE (+x) às 6 e se põe no oeste às 18; de noite a mesma luz é a lua,
  // no arco oposto; sempre um pouco acima do horizonte (luz rasante demais some)
  const sol = h >= 6 && h < 18, ang = ((sol ? h - 6 : (h + 6) % 24) / 12) * Math.PI;
  o.dir.set(Math.cos(ang), Math.max(0.25, Math.sin(ang)), 0.35).normalize();
  return o;
}
const _verdeCampos = new THREE.Color(0x3d5a2a);
// as peças que ganham colisão do próprio tamanho quando o decor.json não diz o raio
const RAIO_AUTOMATICO = /(^|-)Rock_|^rubble_|^barrier_column/;

const rand = (seed) => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function messageTexture(seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d'); const r = rand(seed);
  g.strokeStyle = '#ff9a3a'; g.lineWidth = 5; g.lineCap = 'round'; g.shadowColor = '#ff6a00'; g.shadowBlur = 12;
  for (let line = 0; line < 2; line++) {
    g.beginPath(); let x = 30; const y = 40 + line * 45; g.moveTo(x, y);
    while (x < 220) { x += 8 + r() * 14; g.lineTo(x, y + (r() - 0.5) * 22); }
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World {
  constructor(game) {
    aplicarMarcos(Assets.marcos);   // as tags de lugar do mapa, antes de montar qualquer coisa
    this.game = game;
    this.scene = game.scene;
    this.boxes = [];
    this.circles = [];
    this.interactables = [];
    this.pickups = [];
    this.torches = [];
    this.flames = [];
    this.braziers = [];
    this.doors = [];
    this.gateOpen = false;
    this.bloodstain = null;
    this.time = 0;
    // O mapa vem de `assets/mapa.json` (o editor de cenas o grava). Sem ele,
    // a EMERGENCIA embutida acima — `Assets.load` ja gritou o motivo no console.
    this.mapa = Assets.mapa ?? MAPA_DE_EMERGENCIA;
    this.rows = this.mapa.length;
    this.cols = this.mapa[0].length;
    this.edgeMap = new Map();
    GLOW.tex = glowTexture();

    this.buildLighting();
    this.montarRelevo(Assets.relevo);   // a altura do chão das colinas, antes do chão e da decoração
    this.buildGeometry();
    this.buildTorches();
    this.buildChests();
    this.buildPickups();
    this.buildDecor();
    this.buildBonfires();
    this.buildArena();
    this.buildFogGate();
    this.buildMessages();
    this.buildDust();
  }

  // ---------- Grid ----------
  ch(r, c) { return r < 0 || r >= this.rows || c < 0 || c >= this.cols ? '#' : this.mapa[r][c]; }
  isFloor(r, c) { return this.ch(r, c) !== '#'; }
  center(r, c) { return new THREE.Vector3(c * CELL, 0, r * CELL); }
  cellOf(pos) { return [Math.round(pos.z / CELL), Math.round(pos.x / CELL)]; }
  isArenaCell(r, c) { return this.ch(r, c) === 'X'; }
  // ar livre: a floresta ('f'), o andar de cima ('a') e a escada ('e') que o liga
  isOpenAir(r, c) { return 'fae'.includes(this.ch(r, c)); }
  edgeKey(a, b) { return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]) ? `${a}|${b}` : `${b}|${a}`; }

  // ---------- Altura: o ANDAR DE CIMA ----------
  //
  // A colisão do jogo é uma PLANTA (caixas e círculos em x,z) — por isso o andar
  // de cima ('a') fica sobre ROCHA, nunca sobre um cômodo: duas salas na mesma
  // planta, uma em cima da outra, teriam as paredes de uma barrando a outra. Ele
  // é chão a `WALL_H`, e a ESCADA ('e') é uma rampa da borda baixa até a alta.
  //
  // Borda entre níveis diferentes BARRA (`conectaNivel`): sem isso, andar da
  // floresta para uma célula do andar de cima seria "subir" 6 m num passo. A
  // escada só liga pelas duas pontas — o lado dela que dá para o andar ('a') e
  // o oposto, que dá para o chão.

  /** 0 (chão), 1 (andar de cima) ou 'e' (escada). Rocha fica 0 — ninguém pisa. */
  nivel(r, c) { const t = this.ch(r, c); return t === 'a' ? 1 : t === 'e' ? 'e' : 0; }

  /** Para onde a escada SOBE: `[dl, dc]` do vizinho do andar de cima, ou `null`. */
  subidaDaEscada(r, c) {
    for (const d of Object.values(DIRS)) if (this.nivel(r + d[0], c + d[1]) === 1) return d;
    return null;
  }

  /** Dá para passar de uma célula para a vizinha sem pular um andar? */
  conectaNivel(a, b) {
    const na = this.nivel(...a), nb = this.nivel(...b);
    if (na !== 'e' && nb !== 'e') return na === nb;
    if (na === 'e' && nb === 'e') return true;
    const [esc, fora] = na === 'e' ? [a, b] : [b, a];
    const d = this.subidaDaEscada(...esc);
    if (!d) return this.nivel(...fora) === 0;
    if (fora[0] === esc[0] + d[0] && fora[1] === esc[1] + d[1]) return this.nivel(...fora) === 1;
    if (fora[0] === esc[0] - d[0] && fora[1] === esc[1] - d[1]) return this.nivel(...fora) === 0;
    return false;                                           // o lado da escada é parede
  }

  /** A altura do CHÃO onde está `pos`: 0, `WALL_H` no andar de cima, rampa na escada. */
  alturaChao(pos) {
    const [r, c] = this.cellOf(pos);
    const t = this.ch(r, c);
    if (t === 'f') return this.relevoEm(pos.x, pos.z);
    if (t === 'a') return WALL_H;
    if (t !== 'e') return 0;
    const d = this.subidaDaEscada(r, c);
    if (!d) return 0;
    // o quanto se avançou na direção da subida, de 0 (borda baixa) a 1 (alta)
    const k = ((pos.x - c * CELL) * d[1] + (pos.z - r * CELL) * d[0]) / CELL + 0.5;
    return WALL_H * Math.min(1, Math.max(0, k));
  }

  // ---------- O RELEVO: as COLINAS (04/10/2026) ----------
  //
  // A altura do chão de ar livre ('f') numa ÁREA do mapa vem de `relevo` no mapa.json
  // (`Assets.relevo`): a soma de colinas suaves (cosseno; `plano` = topo chato), indo a
  // zero perto da rocha e da borda da área (`borda`, em células) — então a colina nunca
  // encosta num paredão nem num chão plano de fora com degrau. A altura é calculada UMA
  // vez numa grade de CELL/4 (a mesma da grama: o chão que se vê é o chão que se pisa)
  // e lida com interpolação bilinear. A colisão é uma planta (x, z): o relevo não barra,
  // só ergue. Fora da área (e sem `relevo`), tudo plano como sempre.
  montarRelevo(rel) {
    this.relevo = null;
    const area = rel?.area, colinas = Array.isArray(rel?.colinas) ? rel.colinas : [];
    if (!Array.isArray(area) || area.length !== 2 || !colinas.length) return;
    const [[r0, c0], [r1, c1]] = area, N = 4, passo = CELL / N, borda = (rel.borda ?? 2) * CELL;
    const x0 = c0 * CELL - CELL / 2, z0 = r0 * CELL - CELL / 2;
    const nx = (c1 - c0 + 1) * N + 1, nz = (r1 - r0 + 1) * N + 1;
    const h = new Float32Array(nx * nz);
    const dentro = (r, c) => r >= r0 && r <= r1 && c >= c0 && c <= c1 && this.ch(r, c) === 'f';
    const viz = Math.ceil(rel.borda ?? 2) + 1;
    for (let k = 0; k < nz; k++) {
      for (let i = 0; i < nx; i++) {
        const x = x0 + i * passo, z = z0 + k * passo;
        // a distância (m) até a célula mais perto que NÃO é relevo (rocha, fora da área)
        const cr = Math.round(z / CELL), cc = Math.round(x / CELL);
        let dist = borda;
        for (let dr = -viz; dr <= viz; dr++) for (let dc = -viz; dc <= viz; dc++) {
          const rr = cr + dr, ccc = cc + dc;
          if (dentro(rr, ccc)) continue;
          const dx = Math.max(Math.abs(x - ccc * CELL) - CELL / 2, 0), dz = Math.max(Math.abs(z - rr * CELL) - CELL / 2, 0);
          dist = Math.min(dist, Math.hypot(dx, dz));
        }
        if (dist <= 0) continue;
        let alt = 0;
        for (const col of colinas) {
          const d = Math.hypot(z / CELL - col.centro[0], x / CELL - col.centro[1]) / col.raio;
          if (d >= 1) continue;
          const p = col.plano ?? 0, t = d <= p ? 0 : (d - p) / (1 - p);
          alt += col.altura * 0.5 * (1 + Math.cos(Math.PI * t));
        }
        const s = Math.min(1, dist / borda);
        h[k * nx + i] = alt * s * s * (3 - 2 * s);
      }
    }
    this.relevo = { x0, z0, nx, nz, passo, h };
    this.areaRelevo = area;
  }

  /** A altura do RELEVO em (x, z): 0 fora da área das colinas. */
  relevoEm(x, z) {
    const R = this.relevo;
    if (!R) return 0;
    const fi = (x - R.x0) / R.passo, fk = (z - R.z0) / R.passo;
    if (fi < 0 || fk < 0 || fi >= R.nx - 1 || fk >= R.nz - 1) return 0;
    const i = Math.floor(fi), k = Math.floor(fk), u = fi - i, v = fk - k, n = R.nx, h = R.h;
    const a = h[k * n + i], b = h[k * n + i + 1], c = h[(k + 1) * n + i], d = h[(k + 1) * n + i + 1];
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }

  /** Quanto `pos` está ACIMA do chão dele (o que "no ar" quer dizer). */
  acimaDoChao(pos) { return pos.y - this.alturaChao(pos); }

  // ---------- Iluminação: dentro, fora e O DIA ----------
  //
  // A troca é pela CÉLULA do jogador (`updateAmbience`): dentro da masmorra, o escuro
  // de sempre; no ar livre ('f', 'a', 'e'), o CÉU DO CICLO DO DIA (`cicloDoDia`, 20 min
  // por dia, pelo relógio de verdade — no Mundo online todos veem a mesma hora). Uma
  // luz direcional acesa dentro clarearia a masmorra inteira (sem sombras, ela atravessa
  // teto e parede), e o clima dela é metade do jogo: por isso ela apaga lá dentro.
  buildLighting() {
    const s = this.scene;
    const dentro = { fundo: new THREE.Color(0x020203), nevoa: new THREE.Color(0x030304), dens: 0.028, hemi: 0.95, amb: 0.8, lua: 0 };
    s.background = dentro.fundo.clone();
    s.fog = new THREE.FogExp2(dentro.nevoa.getHex(), dentro.dens);
    const hemi = new THREE.HemisphereLight(0x46506e, 0x100c08, dentro.hemi);
    const amb = new THREE.AmbientLight(0x24242e, dentro.amb);
    const lua = new THREE.DirectionalLight(0x9db4e8, 0);   // o SOL de dia, a LUA de noite
    lua.position.set(60, 70, 20);
    s.add(hemi, amb, lua, lua.target);
    const base = { ceu: hemi.color.clone(), chao: hemi.groundColor.clone(), amb: amb.color.clone() };
    this.ambience = { dentro, base, hemi, amb, lua, k: 0, kc: 0, ceu: cicloDoDia(0) };
  }

  /** O jogador está na área do relevo (os campos)? */
  nosCampos(r, c) {
    const A = this.areaRelevo;
    return !!A && this.ch(r, c) === 'f' && r >= A[0][0] && r <= A[1][0] && c >= A[0][1] && c <= A[1][1];
  }

  /** Aproxima o clima do lugar em que o jogador está (0 = masmorra, 1 = ar livre). */
  updateAmbience(dt) {
    const a = this.ambience;
    const [r, c] = this.cellOf(this.game.player.pos);
    const alvo = this.isOpenAir(r, c) ? 1 : 0, alvoC = this.nosCampos(r, c) ? 1 : 0;
    // ~1,5 s para trocar: rápido o bastante para a saída "abrir", devagar o
    // bastante para não piscar quem anda na soleira (os campos, ~3 s)
    a.k = alvo > a.k ? Math.min(1, a.k + dt * 0.7) : Math.max(0, a.k - dt * 0.7);
    a.kc = alvoC > a.kc ? Math.min(1, a.kc + dt * 0.35) : Math.max(0, a.kc - dt * 0.35);
    // o céu de AGORA (a hora do ciclo); nos campos, o chão rebate mais verde
    const F = cicloDoDia(horaDoMundo(), a.ceu), kc = a.kc;
    F.chao.lerp(_verdeCampos, 0.45 * kc * F.dia);
    F.hemi *= 1 + 0.12 * kc;
    const mix = (x, y) => x + (y - x) * a.k;
    const s = this.scene;
    s.background.copy(a.dentro.fundo).lerp(F.fundo, a.k);
    s.fog.color.copy(a.dentro.nevoa).lerp(F.nevoa, a.k);
    s.fog.density = mix(a.dentro.dens, F.dens);
    a.hemi.intensity = mix(a.dentro.hemi, F.hemi);
    a.amb.intensity = mix(a.dentro.amb, F.amb);
    a.lua.intensity = mix(a.dentro.lua, F.lua);
    a.hemi.color.copy(a.base.ceu).lerp(F.ceu, a.k);
    a.hemi.groundColor.copy(a.base.chao).lerp(F.chao, a.k);
    a.amb.color.copy(a.base.amb).lerp(F.ambCor, a.k);
    a.lua.color.copy(F.luz);
    // o sol (ou a lua) em volta do jogador, na altura da hora
    const p = this.game.player.pos;
    a.lua.position.set(p.x + F.dir.x * 90, p.y + F.dir.y * 90, p.z + F.dir.z * 90);
    a.lua.target.position.copy(p);
    // o FILTRO DE COR (style.css): sombrio na masmorra, quase limpo ao ar livre
    const kf = Math.round(a.k * 50) / 50;
    if (kf !== a.filtroK) {
      a.filtroK = kf;
      const st = document.documentElement.style;
      st.setProperty('--filtro-sat', (0.62 + (1.0 - 0.62) * kf).toFixed(3));
      st.setProperty('--filtro-con', (1.12 + (1.04 - 1.12) * kf).toFixed(3));
      st.setProperty('--filtro-sep', (0.12 + (0.02 - 0.12) * kf).toFixed(3));
    }
  }

  // ---------- Pisos, paredes, tetos ----------
  buildGeometry() {
    // A ESTRUTURA (piso, parede, teto) pode ter sido exportada para
    // assets/decor.json pelo editor de cenas — la ela e editavel peca a peca.
    // Havendo, este metodo para de DESENHA-la e passa a cuidar so do que nao e
    // visual: as caixas de colisao e as passagens especiais.
    //
    // A colisao continua vindo do MAP, sempre. Ela nao e decoracao: tirar uma
    // parede desenhada nao pode abrir passagem sozinha, nem uma parede posta a
    // mao pode barrar sem alguem dizer.
    const daEstrutura = Assets.decor.some((d) => d.ger);
    const r = rand(42);
    const inst = {}; // nome -> lista de matrizes
    const push = (name, m) => (inst[name] ??= []).push(m);
    const mtx = (x, y, z, yaw = 0, flip = false) => {
      const m = new THREE.Matrix4().makeRotationY(yaw);
      if (flip) m.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
      m.multiply(new THREE.Matrix4().makeScale(S, S, S));
      m.setPosition(x, y, z);
      return m;
    };
    for (const e of SPECIAL_EDGES) this.edgeMap.set(this.edgeKey(e.a, e.b), e);

    const livres = [];   // as células de ar livre, para o chão de grama
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const t = this.ch(row, col);
        if (t === '#') continue;
        const x = col * CELL, z = row * CELL;
        // AR LIVRE: sem piso de pedra, sem teto, sem parede desenhada — mas a
        // borda com a rocha BARRA igual (quem a mostra é a decoração: árvores e
        // pedras). Tratado antes de qualquer `r()`: consumir o sorteio aqui
        // mudaria piso e parede de todas as células seguintes no modo sem
        // decoração.
        if (t === 'f' || t === 'a' || t === 'e') {
          if (t === 'f') livres.push([x, z]);      // grama só no chão da floresta
          for (const [side, [dr, dc]] of Object.entries(DIRS)) {
            const nr = row + dr, nc = col + dc;
            const ex = x + dc * CELL / 2, ez = z + dr * CELL / 2;
            if (!this.isFloor(nr, nc)) this.addEdgeBox(ex, ez, side, 'wall');
            // DESNÍVEL barra (ver `conectaNivel`). Sem conferir a ordem das
            // células: o vizinho de chão comum não sabe de andar nenhum e não
            // poria a caixa, então quem a põe é sempre este lado.
            else if (!this.conectaNivel([row, col], [nr, nc])) this.addEdgeBox(ex, ez, side, 'wall');
            else if (nr > row || nc > col) {
              const special = this.edgeMap.get(this.edgeKey([row, col], [nr, nc]));
              if (special) this.buildSpecialEdge(special, ex, ez, side);
            }
          }
          continue;
        }
        const arena = t === 'X';
        const floor = t === 'c' ? (r() < 0.5 ? 'floor_dirt_large' : 'floor_dirt_large_rocky')
          : t === ',' ? 'floor_dirt_large'
          : arena && r() < 0.12 ? 'floor_tile_big_grate'
          : r() < 0.3 ? 'floor_tile_large_rocks' : 'floor_tile_large';
        if (!daEstrutura) push(floor, mtx(x, 0, z, Math.floor(r() * 4) * Math.PI / 2));
        // Teto (a cela do jogador tem uma grade no teto)
        const ceilY = arena ? WALL_H * 2 : WALL_H;
        const isStartCell = row === 24 && col === 5;
        if (!daEstrutura) push(isStartCell ? 'floor_tile_big_grate' : 'floor_tile_large', mtx(x, ceilY + 0.05, z, 0, true));

        for (const [side, [dr, dc]] of Object.entries(DIRS)) {
          const nr = row + dr, nc = col + dc;
          const yaw = YAW_INTO[side];
          const ex = x + dc * CELL / 2, ez = z + dr * CELL / 2;
          if (!this.isFloor(nr, nc)) {
            const kind = r() < 0.15 ? 'wall_cracked' : r() < 0.06 ? 'wall_shelves' : 'wall';
            if (!daEstrutura) {
              push(kind, mtx(ex, 0, ez, yaw));
              if (arena) push('wall', mtx(ex, WALL_H, ez, yaw));
            }
            this.addEdgeBox(ex, ez, side, 'wall');   // colisao: SEMPRE, vem do MAP
          } else if (nr > row || nc > col) {
            const special = this.edgeMap.get(this.edgeKey([row, col], [nr, nc]));
            if (special) this.buildSpecialEdge(special, ex, ez, side);
            // Arena mais alta que o corredor: parede acima da passagem
            if (!daEstrutura && arena !== this.isArenaCell(nr, nc)) push('wall', mtx(ex, WALL_H, ez, yaw));
          }
        }
      }
    }
    for (const [name, list] of Object.entries(inst)) {
      const info = Assets.meshInfo(name);
      const im = new THREE.InstancedMesh(info.geometry, info.material, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(info.matrix)));
      im.castShadow = !name.startsWith('floor');
      im.receiveShadow = true;
      this.scene.add(im);
    }
    if (livres.length) this.buildGrass(livres);
  }

  /**
   * O chão de GRAMA das células de ar livre — uma malha só para a área toda.
   *
   * Em código, e não em peça: nenhum pacote do jogo tem chão de grama, e uma
   * placa por célula seriam dezenas de objetos para desenhar um plano. Cada
   * célula é subdividida em 4×4 com a cor variando por vértice (sorteio
   * semeado): grama de uma cor só parece carpete.
   */
  buildGrass(celulas) {
    const N = 4, passo = CELL / N;
    const pos = [], cor = [], idx = [];
    const r = rand(7);
    // Os quatro tons sorteados por vértice. Com `grama` no decor.json (a cor
    // escolhida na roda do editor de cenas), eles saem DELA, na mesma proporção
    // de claro/escuro dos verdes de sempre — o mais claro é a cor escolhida.
    const verdes = Assets.grama
      ? [0.7, 0.9, 1, 0.73].map((k) => new THREE.Color(Assets.grama).multiplyScalar(k))
      : [new THREE.Color(0x1f3a1c), new THREE.Color(0x2a4a22), new THREE.Color(0x33502a), new THREE.Color(0x283a1e)];
    const tom = new Map();   // vértices da borda entre células têm a MESMA cor (sem costura)
    for (const [cx, cz] of celulas) {
      const base = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        for (let k = 0; k <= N; k++) {
          const x = cx - CELL / 2 + i * passo, z = cz - CELL / 2 + k * passo;
          pos.push(x, 0.01 + this.relevoEm(x, z), z);
          const chave = `${x.toFixed(2)},${z.toFixed(2)}`;
          if (!tom.has(chave)) tom.set(chave, verdes[Math.floor(r() * verdes.length)].clone().multiplyScalar(0.85 + r() * 0.3));
          const c = tom.get(chave);
          cor.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < N; i++) {
        for (let k = 0; k < N; k++) {
          const a = base + i * (N + 1) + k, b = a + N + 1;
          idx.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const chao = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
    chao.receiveShadow = true;
    this.scene.add(chao);
  }

  // Caixa de colisão de uma parede (1 m de espessura centrada na borda da célula)
  addEdgeBox(ex, ez, side, kind, extra = {}) {
    const alongX = side === 'n' || side === 's';
    const b = alongX
      ? { minX: ex - CELL / 2, maxX: ex + CELL / 2, minZ: ez - WT, maxZ: ez + WT }
      : { minX: ex - WT, maxX: ex + WT, minZ: ez - CELL / 2, maxZ: ez + CELL / 2 };
    Object.assign(b, { kind, ...extra });
    this.boxes.push(b);
    return b;
  }

  buildSpecialEdge(e, ex, ez, side) {
    const yaw = YAW_INTO[side];
    if (e.type === 'bars') {
      const m = Assets.prop('wall_gated'); m.position.set(ex, 0, ez); m.rotation.y = yaw; m.scale.setScalar(S);
      this.scene.add(m);
      this.addEdgeBox(ex, ez, side, 'bars');
    } else if (e.type === 'door' || e.type === 'celldoor' || e.type === 'arco') {
      const m = Assets.prop('wall_doorway'); m.position.set(ex, 0, ez); m.rotation.y = yaw; m.scale.setScalar(S);
      this.scene.add(m);
      let door = null;
      m.traverse((c) => { if (/door$/.test(c.name)) door = c; });
      // Batentes laterais sempre bloqueiam; o vão central bloqueia enquanto fechada
      const alongX = side === 'n' || side === 's';
      const half = CELL / 2, gh = S; // vão da porta: 2 m no modelo original
      const jamb = (sg) => {
        const a = sg < 0 ? -half - 1 : gh, b = sg < 0 ? -gh : half + 1;
        this.boxes.push(alongX
          ? { minX: ex + a, maxX: ex + b, minZ: ez - WT, maxZ: ez + WT, kind: 'wall' }
          : { minX: ex - WT, maxX: ex + WT, minZ: ez + a, maxZ: ez + b, kind: 'wall' });
      };
      jamb(-1); jamb(1);
      // ARCO: o mesmo vão, sempre aberto — a folha some e não há o que abrir.
      // O modelo é o da porta (o pacote não tem vão sem folha), por isso a
      // folha é ESCONDIDA e não retirada: o `Assets.prop` é um clone, e o
      // modelo das outras portas continua com a dela.
      if (e.type === 'arco') {
        if (door) door.visible = false;
        return;
      }
      const gap = alongX
        ? { minX: ex - gh, maxX: ex + gh, minZ: ez - 0.35 * S, maxZ: ez + 0.35 * S, kind: 'door' }
        : { minX: ex - 0.35 * S, maxX: ex + 0.35 * S, minZ: ez - gh, maxZ: ez + gh, kind: 'door' };
      this.boxes.push(gap);
      const d = { door, box: gap, open: false, t: 0, locked: e.type === 'celldoor' ? 'cellKey' : null, pos: new THREE.Vector3(ex, 0, ez) };
      this.doors.push(d);
      d.interact = { type: 'door', door: d, pos: d.pos, radius: 2.8, get label() { return d.locked ? 'Abrir porta (trancada)' : 'Abrir porta'; } };
      this.interactables.push(d.interact);
    } else if (e.type === 'fog') {
      this.fogEdge = { ex, ez, side };
      this.fogBox = this.addEdgeBox(ex, ez, side, 'fog');
      this.fogBox.minX = ex - CELL / 2; this.fogBox.maxX = ex + CELL / 2;
    }
  }

  openDoor(d) {
    d.open = true;
    d.box.disabled = true;
    this.interactables = this.interactables.filter((i) => i.door !== d);
  }

  /** No mundo online ninguém acorda preso: a porta da cela já nasce aberta, sem chave. */
  destrancarCela() {
    for (const d of this.doors) {
      if (!d.locked) continue;
      d.locked = null;
      this.openDoor(d);
      d.t = 1;
      if (d.door) d.door.rotation.y = -1.7;
    }
    this.chaveCaiu = true;
  }

  // ---------- Tochas de parede ----------
  wallAnchor(cell, side, inset) {
    const [dr, dc] = DIRS[side];
    const p = this.center(cell[0], cell[1]);
    p.x += dc * (CELL / 2 - WT - inset); p.z += dr * (CELL / 2 - WT - inset);
    return p;
  }

  buildTorches() {
    for (const [row, col, side] of TORCHES) {
      const p = this.wallAnchor([row, col], side, 0);
      const g = new THREE.Group();
      g.position.set(p.x, 3.0, p.z);
      g.rotation.y = YAW_INTO[side];
      const mount = Assets.prop('torch_mounted');
      g.add(mount);
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.35, 0.3), new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.8, metalness: 0.6 }));
      bracket.position.set(0, 0, 0.12); bracket.visible = false;
      g.add(bracket);
      const flame = this.makeFlame(0.55);
      flame.position.set(0, 0.85, 0.42);
      g.add(flame);
      const light = new THREE.PointLight(0xff8a3a, 26, 20, 1.5);
      light.position.set(0, 1.0, 0.9);
      g.add(light);
      this.scene.add(g);
      const t = { group: g, mount, bracket, flame, light, lit: true, seed: Math.random() * 100, base: 26 };
      t.interact = { type: 'torch', torch: t, pos: new THREE.Vector3(p.x, 0, p.z), radius: 2.4, label: 'Pegar tocha' };
      this.torches.push(t);
      this.interactables.push(t.interact);
    }
    this.buildTochasDeEstaca();
  }

  /**
   * As tochas fincadas no chão (`TOCHAS_DE_ESTACA`). São tochas como as de
   * parede — o mesmo objeto em `this.torches`, então pegar, apagar a luz, o
   * save e o corte das seis mais próximas valem sem mudar nada —, só que o
   * suporte é uma estaca com um aro de ferro, e a tocha é a de mão, em pé.
   */
  buildTochasDeEstaca() {
    const madeira = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 });
    const ferro = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 0.8, metalness: 0.6 });
    const ALTURA = 1.35;
    for (const def of TOCHAS_DE_ESTACA) {
      if (!this.isFloor(...def.cell)) continue;   // mapa sem aquela área
      const p = this.center(...def.cell);
      p.x += def.off[0]; p.z += def.off[1];
      const g = new THREE.Group();
      g.position.set(p.x, this.alturaChao(p), p.z);
      g.rotation.y = (p.x * 7 + p.z * 13) % 6.28;   // cada uma virada para um lado, sempre o mesmo
      const estaca = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.075, ALTURA, 6), madeira);
      estaca.position.y = ALTURA / 2; estaca.rotation.z = 0.05; estaca.castShadow = true;
      // o aro de ferro no alto: é o que sobra quando a tocha é levada
      const aro = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.06, 0.12, 8, 1, true), ferro);
      aro.material.side = THREE.DoubleSide; aro.position.y = ALTURA + 0.04;
      g.add(estaca, aro);
      // a tocha de mão aponta para +Z: em pé, com o cabo dentro do aro
      const mount = makeWeapon('torch');
      mount.rotation.x = -Math.PI / 2;
      mount.position.y = ALTURA + 0.1;
      g.add(mount);
      const flame = this.makeFlame(0.5);
      flame.position.y = ALTURA + 0.72;
      g.add(flame);
      const light = new THREE.PointLight(0xff8a3a, 26, 20, 1.5);
      light.position.y = ALTURA + 0.9;
      g.add(light);
      this.scene.add(g);
      this.circles.push({ x: p.x, z: p.z, r: 0.2 });
      // `bracket` é o que aparece no lugar da tocha levada: aqui o aro já está lá, não há o que trocar
      const t = { group: g, mount, bracket: new THREE.Object3D(), flame, light, lit: true, seed: Math.random() * 100, base: 26 };
      t.interact = { type: 'torch', torch: t, pos: new THREE.Vector3(p.x, g.position.y, p.z), radius: 2.0, label: 'Pegar tocha' };
      this.torches.push(t);
      this.interactables.push(t.interact);
    }
  }

  makeFlame(size) {
    const g = new THREE.Group();
    const outer = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW.tex, color: 0xff6a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    outer.scale.set(size * 1.3, size * 1.8, 1);
    const inner = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW.tex, color: 0xffd080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    inner.scale.set(size * 0.6, size * 0.9, 1); inner.position.y = -size * 0.15;
    g.add(outer, inner);
    this.flames.push({ g, outer, inner, size, seed: Math.random() * 10 });
    return g;
  }

  takeTorch(t) {
    t.lit = false;
    t.mount.visible = false;
    t.bracket.visible = true;
    t.flame.visible = false;
    t.light.intensity = 0;
    this.interactables = this.interactables.filter((i) => i !== t.interact);
  }

  // ---------- Baús ----------
  buildChests() {
    // baú em célula de rocha (mapa sem aquela área) não é construído
    this.chests = CHESTS.filter((def) => this.isFloor(...def.cell)).map((def) => {
      const p = this.wallAnchor(def.cell, def.wall, 0.8);
      const m = Assets.prop(def.gold ? 'chest_gold' : 'chest');
      m.position.copy(p);
      m.rotation.y = YAW_INTO[def.wall];
      let lid = null;
      m.traverse((c) => { if (/lid$/.test(c.name)) lid = c; });
      this.scene.add(m);
      this.circles.push({ x: p.x, z: p.z, r: 0.85 });
      const chest = { def, mesh: m, lid, open: false, t: 0, pos: p };
      chest.interact = { type: 'chest', chest, pos: p.clone(), radius: 2.0, label: 'Abrir baú' };
      this.interactables.push(chest.interact);
      return chest;
    });
  }

  openChest(chest) {
    chest.open = true;
    this.interactables = this.interactables.filter((i) => i !== chest.interact);
  }

  // ---------- Itens e cadáveres ----------
  buildPickups() {
    for (const def of PICKUPS) {
      const p = this.wallAnchor(def.cell, def.wall, def.corpse ? 0.6 : 0.9);
      if (def.corpse) this.addCorpse(p, YAW_INTO[def.wall]);
      const itemPos = def.corpse ? p.clone().add(new THREE.Vector3(Math.sin(YAW_INTO[def.wall]) * 0.9, 0, Math.cos(YAW_INTO[def.wall]) * 0.9)) : p;
      this.addPickup(def.item, def.qty ?? 1, itemPos);
    }
  }

  addCorpse(p, yaw, skeleton = false) {
    // Cavaleiros mortos de armadura enferrujada ou ossadas caídas no chão
    const c = new CharacterModel({ outfit: skeleton ? 'skMinion' : 'corpse', hideBody: skeleton });
    if (skeleton) c.scene.userData.eyeMat.color.setHex(0x000000);
    c.root.position.copy(p);
    c.root.rotation.y = yaw;
    c.pose('Death01', 2.38);
    this.scene.add(c.root);
    return c;
  }

  addPickup(itemId, qty, pos, persistent = true) {
    const g = new THREE.Group();
    const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW.tex, color: 0xfff2d0, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.set(0.45, 0.45, 1);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW.tex, color: 0xa0c0ff, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5, transparent: true }));
    halo.scale.set(1.3, 1.3, 1);
    g.add(core, halo);
    g.position.set(pos.x, 0.35, pos.z);
    this.scene.add(g);
    const p = { type: 'pickup', itemId, qty, pos: new THREE.Vector3(pos.x, 0, pos.z), radius: 1.6, label: 'Pegar item', mesh: g, persistent, seed: Math.random() * 10 };
    this.pickups.push(p);
    this.interactables.push(p);
    return p;
  }

  removePickup(p) {
    this.scene.remove(p.mesh);
    this.pickups = this.pickups.filter((x) => x !== p);
    this.interactables = this.interactables.filter((x) => x !== p);
  }

  // Chave que cai pela grade do teto da cela
  dropKey() {
    this.chaveCaiu = true;   // o save lembra: ao continuar, ela não cai de novo
    const m = Assets.prop('keyring_hanging');
    const p = START_POS.clone().add(new THREE.Vector3(-0.9, 0, -0.6));
    m.position.set(p.x, WALL_H + 0.2, p.z);
    this.scene.add(m);
    this.fallingKey = { mesh: m, vy: 0, target: p };
  }

  // ---------- Decoração ----------
  // Usado pelo que ainda é posicionado em CÓDIGO (a arena, em buildArena).
  // A regra de escala por NOME da peça continua aqui só por causa deles: a
  // arena tem pillar_decorated e banner_patternA_red, e tirá-la encolheria os
  // dois em silêncio. Decoração vinda de dado NÃO passa por aqui — ver
  // `placeDecor`, que é explícito.
  place(name, cell, off = [0, 0], yaw = 0, collide = 0, y = 0) {
    const m = Assets.prop(name);
    const p = this.center(cell[0], cell[1]);
    m.position.set(p.x + off[0] * S, y * S, p.z + off[1] * S);
    if (/pillar|column|banner/.test(name)) { m.scale.setScalar(S); collide *= S; }
    m.rotation.y = yaw;
    this.scene.add(m);
    if (collide) this.circles.push({ x: m.position.x, z: m.position.z, r: collide });
    return m;
  }

  /**
   * Um prop vindo de `assets/decor.json`, gravado pelo editor de cenas.
   *
   * Sem NENHUMA regra escondida: escala, altura e raio de colisão vêm do dado.
   * É o que deixa o editor mostrar na tela exatamente o que o jogo desenha —
   * uma regra por nome de peça faria uma peça nova chamada `pillar_novo` nascer
   * grande no jogo e pequena no editor, sem nada acusar.
   *
   * Peça que não está em `PROPS` é PULADA com o nome no console, em vez de
   * derrubar o mundo inteiro: `Assets.prop()` devolveria `undefined` e o
   * `.clone()` estouraria, levando junto toda a decoração seguinte.
   */
  placeDecor(d) {
    if (!Assets.props[d.prop]) {
      console.warn(`[decor] "${d.prop}" não está em PROPS (js/assets.js) — pulando`);
      return null;
    }
    const m = Assets.prop(d.prop);
    const p = this.center(d.cel[0], d.cel[1]);
    const off = d.off ?? [0, 0];
    const px = p.x + off[0] * S, pz = p.z + off[1] * S, rel = this.ch(...d.cel) === 'f' ? this.relevoEm(px, pz) : 0;
    m.position.set(px, (d.y ?? 0) * S + (rel > 0.05 ? rel - 0.2 : 0), pz);
    m.scale.setScalar(d.escala ?? 1);
    m.rotation.set(0, d.giro ?? 0, 0);
    // `flip` é o TETO: uma placa de piso virada de cabeça para baixo. Um giro em
    // Y não expressa isso, e sem ele o teto aparece com a face para cima —
    // invisível de dentro da masmorra, que é o único lugar de onde se olha.
    // `rotateX` gira no eixo LOCAL, depois do Y: é o mesmo `R_y · R_x` que o
    // `buildGeometry()` montava na matriz.
    if (d.flip) m.rotateX(Math.PI);
    this.scene.add(m);
    // PEDRA e ENTULHO sem raio declarado ganham o raio do próprio tamanho (o desabamento
    // tem de barrar) — menos os que estão em cima da borda com a rocha (a menos de 1,2 m de
    // uma parede), que já barra, e onde um círculo só comeria o chão de passagem.
    // `colisao: 0` = não barra.
    let raio = d.colisao;
    if (raio === undefined && RAIO_AUTOMATICO.test(d.prop) && !this.pertoDaRocha(px, pz, 1.2)) raio = this.raioDoProp(d.prop) * (d.escala ?? 1);
    if (raio) { m.userData.circulo = { x: m.position.x, z: m.position.z, r: raio }; this.circles.push(m.userData.circulo); }
    return m;
  }

  /** `(x, z)` está a menos de `dist` m de uma célula de rocha (uma parede do mapa)? */
  pertoDaRocha(x, z, dist) {
    const r0 = Math.round(z / CELL), c0 = Math.round(x / CELL);
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (this.isFloor(r0 + dr, c0 + dc)) continue;
      const dx = Math.max(Math.abs(x - (c0 + dc) * CELL) - CELL / 2, 0), dz = Math.max(Math.abs(z - (r0 + dr) * CELL) - CELL / 2, 0);
      if (Math.hypot(dx, dz) < dist) return true;
    }
    return false;
  }

  /** Meia largura (m) da planta de um prop em escala 1 — 80% do maior lado (a pedra é redonda). */
  raioDoProp(nome) {
    this._raios ??= new Map();
    if (!this._raios.has(nome)) {
      const t = new THREE.Box3().setFromObject(Assets.props[nome]).getSize(new THREE.Vector3());
      this._raios.set(nome, Math.max(t.x, t.z) * 0.4);
    }
    return this._raios.get(nome);
  }

  buildDecor() {
    // Os PROPS vêm de assets/decor.json, gravado pelo editor de cenas. Antes
    // disto eram 38 chamadas de place() escritas à mão aqui — mover um barril
    // meio metro era editar código, recarregar e olhar.
    const pecas = [];
    this.quebraveis = [];
    Assets.decor.forEach((d, i) => {
      const m = this.placeDecor(d);
      if (!m) return;
      const cfg = cfgQuebravel(d.prop);
      // o quebrável fica SOLTO: some sozinho ao quebrar e volta inteiro depois.
      // `i` (a posição no decor.json) é o nome dele na rede — igual para todos.
      const q = cfg && { i, prop: d.prop, cfg, raiz: m, pos: m.position.clone(), raio: Math.max(0.45, d.colisao ?? 0.5), circulo: m.userData.circulo, rCirculo: m.userData.circulo?.r ?? 0, quebrado: false };
      if (q) this.quebraveis.push(q);
      // a vegetação fica nos lotes (o lote guarda onde está cada cópia dela, `q.instancias`)
      if (!q) pecas.push(m);
      else if (cfg.local) { m.userData.quebravel = q; pecas.push(m); }
    });
    this.agruparDecoracao(pecas);

    // Os CADÁVERES ficam no código, e não é esquecimento: eles são espalhados
    // com Math.random(), então não há posição para gravar em arquivo nenhum —
    // duas aberturas do jogo dão dois arranjos. Congelá-los num .json mudaria
    // a masmorra (os ossos passariam a cair sempre no mesmo lugar), e isso é
    // decisão de jogo, não de ferramenta.
    for (const col of [1, 3, 5, 7, 9, 11]) {
      if (col !== 5) this.addCorpse(this.center(24, col).add(new THREE.Vector3(-0.6, 0, 0.6)), Math.random() * 6, true);
    }
    // Crânios espalhados pelo ossário
    for (const [r, c] of [[11, 5], [12, 8], [10, 11], [13, 3]]) this.addCorpse(this.center(r, c).add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)), Math.random() * 6, true);
  }

  /**
   * A decoração em LOTES (03/10/2026): as ~1.200 peças do `decor.json` eram
   * ~4.000 malhas soltas, uma chamada de desenho cada — e a sombra da tocha
   * repete tudo seis vezes. Peças iguais (mesma geometria e material) da mesma
   * REGIÃO viram um `InstancedMesh`: um desenho só, com o mesmo visual.
   *
   * A região (`LOTE` metros de lado) existe para não perder o recorte do que
   * está fora da câmera: um lote do mapa inteiro seria sempre desenhado.
   * Peça com luz, sprite ou esqueleto fica solta (o lote não os carrega). Nada
   * mexe na decoração depois de pronta — se um dia mexer (porta, baú vindo do
   * decor), essa peça tem de ficar fora dos lotes.
   */
  agruparDecoracao(pecas) {
    const LOTE = 4 * CELL;
    const lotes = new Map();
    for (const raiz of pecas) {
      let solta = false;
      raiz.traverse((o) => { if (o.isLight || o.isSprite || o.isPoints || o.isSkinnedMesh || o.isLine) solta = true; });
      if (solta) continue;
      raiz.updateMatrixWorld(true);
      const malhas = [];
      raiz.traverseVisible((o) => { if (o.isMesh) malhas.push(o); });
      if (!malhas.length) continue;
      const rx = Math.floor(raiz.position.x / LOTE), rz = Math.floor(raiz.position.z / LOTE);
      for (const m of malhas) {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        const chave = `${m.geometry.uuid}|${mats.map((x) => x.uuid).join(',')}|${m.castShadow}|${m.receiveShadow}|${rx},${rz}`;
        let l = lotes.get(chave);
        if (!l) lotes.set(chave, (l = { malha: m, matrizes: [] }));
        // um quebrável dentro do lote: ele precisa saber qual cópia é a dele
        if (raiz.userData.quebravel) (l.donos ??= []).push([raiz.userData.quebravel, l.matrizes.length]);
        l.matrizes.push(m.matrixWorld.clone());
      }
      raiz.removeFromParent();
    }
    for (const { malha, matrizes, donos } of lotes.values()) {
      const im = new THREE.InstancedMesh(malha.geometry, malha.material, matrizes.length);
      matrizes.forEach((mt, i) => im.setMatrixAt(i, mt));
      im.castShadow = malha.castShadow;
      im.receiveShadow = malha.receiveShadow;
      im.computeBoundingSphere();
      this.scene.add(im);
      for (const [q, idx] of donos ?? []) (q.instancias ??= []).push({ im, idx, m: matrizes[idx] });
    }
    this.lotesDeDecoracao = lotes.size;
  }

  /**
   * O ORÇAMENTO DE LUZES: sempre `luzesNoOrcamento` luzes de cenário ligadas
   * (tochas de parede/estaca, fogueiras, braseiros), as mais perto do jogador
   * — as acesas primeiro, e as apagadas (intensidade zero) completando a
   * conta. O número de luzes visíveis NUNCA muda: no three.js, mudá-lo
   * recompila o shader de todo material, e era isso o engasgo ao passar perto
   * de uma fogueira. Cada luz também custa em todo pixel, então o orçamento é
   * o que a qualidade gráfica escolhe (`graficos.js`).
   */
  distribuirLuzes() {
    const pp = this.game.player?.pos;
    if (!pp) return;
    const fontes = [
      ...this.torches.map((t) => ({ luz: t.light, pos: t.interact.pos, acesa: !!t.lit })),
      ...this.fogueiras.map((b) => ({ luz: b.light, pos: b.pos, acesa: true })),
      ...this.braziers.map((b) => ({ luz: b.light, pos: b.pos, acesa: b.target > 0 || b.lit > 0.02 })),
    ];
    const d2 = (f) => f.pos.distanceToSquared(pp);
    fontes.sort((a, b) => (b.acesa - a.acesa) || d2(a) - d2(b));
    const n = Math.min(this.luzesNoOrcamento ?? 8, fontes.length);
    fontes.forEach((f, i) => { f.luz.visible = i < n; });
  }

  // ---------- Fogueiras ----------
  buildBonfires() {
    this.fogueiras = [];
    for (const def of FOGUEIRAS) {
      if (!this.isFloor(...this.cellOf(def.pos))) continue;
      this.fogueiras.push({ ...def, ...this.buildBonfire(def) });
    }
  }

  /** A fogueira de id `id`; sem ela (save antigo, mapa sem acampamento), a primeira. */
  fogueira(id) { return this.fogueiras.find((f) => f.id === id) ?? this.fogueiras[0]; }

  /**
   * Onde se acorda junto à fogueira `id`: `{pos, rumo}`. `espalhar` sorteia o
   * ponto num raio (o mundo online: vários acordam na mesma fogueira), sempre
   * para o lado de FORA do fogo — nunca dentro dele.
   */
  retorno(id, espalhar = 0) {
    const f = this.fogueira(id);
    const pos = new THREE.Vector3(f.pos.x + f.acordar[0], 0, f.pos.z + f.acordar[1]);
    if (espalhar > 0) {
      const fora = Math.atan2(f.acordar[0], f.acordar[1]), a = fora + (Math.random() - 0.5) * 2.2, d = Math.random() * espalhar;
      pos.x += Math.sin(a) * d; pos.z += Math.cos(a) * d;
      this.resolve(pos, 0.5);
    }
    pos.y = this.alturaChao(pos);
    return { pos, rumo: f.rumo, fogueira: f };
  }

  buildBonfire(def) {
    const g = new THREE.Group();
    const r = rand(5);
    const stone = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 1 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + r() * 0.1), stone);
      s.position.set(Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75); s.castShadow = true;
      g.add(s);
    }
    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.72, 16), new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 1 }));
    ash.rotation.x = -Math.PI / 2; ash.position.y = 0.03; g.add(ash);
    const wood = new THREE.MeshStandardMaterial({ color: 0x24160c, roughness: 1 });
    for (let i = 0; i < 6; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.0, 6), wood);
      const a = (i / 6) * Math.PI * 2;
      log.position.set(Math.cos(a) * 0.18, 0.28, Math.sin(a) * 0.18);
      log.rotation.set(Math.sin(a) * 0.65, 0, -Math.cos(a) * 0.65);
      g.add(log);
    }
    // Espada fincada nas cinzas
    const sword = makeWeapon('longsword');
    sword.rotation.set(Math.PI / 2 + 0.1, 0, 0.08);
    sword.position.y = 0.95;
    g.add(sword);
    const flame = this.makeFlame(1.3);
    flame.position.y = 0.65;
    g.add(flame);
    const light = new THREE.PointLight(0xff8a3a, 36, 28, 1.4);
    light.position.y = 1.3;
    g.add(light);
    g.position.copy(def.pos);
    g.position.y = this.alturaChao(def.pos);   // (nas colinas, o chão tem altura)
    this.scene.add(g);
    this.circles.push({ x: def.pos.x, z: def.pos.z, r: 0.85 });
    this.interactables.push({ type: 'bonfire', fogueira: def.id, pos: def.pos.clone(), radius: 2.8, label: 'Descansar na fogueira' });
    return { light, flame };
  }

  // ---------- Arena do Carrasco ----------
  buildArena() {
    const iron = new THREE.MeshStandardMaterial({ color: 0x2a2522, metalness: 0.8, roughness: 0.5 });
    const addBrazier = (x, z) => {
      const g = new THREE.Group();
      const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.45, 1.2, 6), iron); legs.position.y = 0.6;
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.35, 0.5, 10, 1, true), iron); bowl.position.y = 1.4;
      bowl.material = iron.clone(); bowl.material.side = THREE.DoubleSide;
      g.add(legs, bowl);
      const flame = this.makeFlame(1.8); flame.position.y = 2.0; flame.visible = false;
      g.add(flame);
      const light = new THREE.PointLight(0xff6a2a, 0, 34, 1.3); light.position.y = 2.4;
      g.add(light);
      g.traverse((c) => { if (c.isMesh) c.castShadow = true; });
      g.position.set(x, 0, z);
      this.scene.add(g);
      this.circles.push({ x, z, r: 0.75 });
      this.braziers.push({ light, flame, lit: 0, target: 0, pos: new THREE.Vector3(x, 2, z) });
    };
    const c = ARENA_CENTER;
    addBrazier(c.x - 12 * S, c.z - 6 * S); addBrazier(c.x + 12 * S, c.z - 6 * S); addBrazier(c.x - 12 * S, c.z + 6 * S); addBrazier(c.x + 12 * S, c.z + 6 * S);
    for (const [r, col] of [[2, 4], [2, 10], [5, 4], [5, 10]]) this.place('pillar_decorated', [r, col], [0, 0], 0, 0.85);
    this.place('banner_patternA_red', [1, 6], [0, -1.55], 0, 0, 3);
    this.place('banner_patternA_red', [1, 8], [0, -1.55], 0, 0, 3);
    this.place('rubble_half', [5, 9], [1, 1], 2);
    // Bloco do carrasco e cabeças rolando...
    this.place('table_medium_broken', [2, 7], [0, -0.8], 0, 1.1);
    for (let i = 0; i < 3; i++) this.addCorpse(this.center(2, 6 + i).add(new THREE.Vector3(Math.random() - 0.5, 0, 1.2)), Math.random() * 6, true);
  }

  setBraziers(on) { for (const b of this.braziers) { b.target = on ? 1 : 0; if (on) b.flame.visible = true; } }

  buildFogGate() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, opacity: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
      fragmentShader: `
        varying vec2 vUv; uniform float time; uniform float opacity;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          float a = n(vUv*vec2(5.,7.) + vec2(sin(time*.3)*.5, time*.6))*.55 + n(vUv*vec2(11.,15.) - vec2(time*.4, time*1.1))*.3 + n(vUv*vec2(23.,30.) + vec2(time*.2, -time*.7))*.15;
          float edge = smoothstep(0.,.1,vUv.x)*smoothstep(1.,.9,vUv.x)*smoothstep(1.,.85,vUv.y);
          gl_FragColor = vec4(vec3(.82,.84,.9) + a*.15, (.35 + .6*a)*edge*opacity);
        }`,
    });
    const { ex, ez } = this.fogEdge;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(CELL, WALL_H), mat);
    m.position.set(ex, WALL_H / 2, ez);
    const m2 = m.clone(); m2.position.z -= 0.25;
    this.scene.add(m, m2);
    this.fog = { meshes: [m, m2], mat, fading: false };
    this.fogInteract = { type: 'fog', pos: new THREE.Vector3(ex, 0, ez + 1.2), radius: 3.2, label: 'Atravessar a névoa' };
    this.interactables.push(this.fogInteract);
  }

  // ---------- Co-op: as passagens do mundo do anfitrião ----------
  // O convidado vê as portas e a névoa COMO O ANFITRIÃO AS TEM (senão um bateria
  // numa porta que o outro atravessa), e no fim volta exatamente ao que eram.
  // Os quebrados vão junto (`quebrados`: as posições no decor.json): é o que
  // faz o barril que um quebra aparecer quebrado para os outros, no Mundo
  // online e no co-op — e voltar inteiro quando quem manda o restaura.
  estadoPassagens() {
    return { portas: this.doors.map((d) => d.open), nevoa: !!this.gateOpen, quebrados: this.quebraveis.filter((q) => q.quebrado && !q.cfg.local).map((q) => q.i) };
  }

  aplicarPassagens({ portas = [], nevoa = false, quebrados = null } = {}) {
    portas.forEach((aberta, i) => {
      const d = this.doors[i];
      if (!d || d.open === !!aberta) return;
      if (aberta) this.openDoor(d); else this.closeDoor(d);
    });
    if (!!nevoa !== !!this.gateOpen) { if (nevoa) this.openFog(); else this.closeFog(); }
    if (Array.isArray(quebrados)) {
      const set = new Set(quebrados);
      for (const q of this.quebraveis) {
        if (q.cfg.local) continue;   // a vegetação é de cada um
        if (set.has(q.i) && !q.quebrado) this.quebrar(q);
        else if (!set.has(q.i) && q.quebrado) this.restaurar(q);
      }
    }
  }

  // ---------- Quebráveis (barris, caixotes, sacos...) ----------
  quebravel(i) { return this.quebraveis.find((q) => q.i === i) ?? null; }

  /** Os inteiros a menos de `raio` de `pos` (golpe, explosão). */
  quebraveisPerto(pos, raio) {
    return this.quebraveis.filter((q) => !q.quebrado && Math.hypot(q.pos.x - pos.x, q.pos.z - pos.z) < raio + q.raio);
  }

  /**
   * Estoura em pedaços. Só o VISUAL e a colisão: o que cai e a rede são do
   * `Game.quebrar`. Longe da câmera não vale a pena desenhar os pedaços (quem
   * entra no mundo com muitos barris já quebrados não ganha uma chuva de lascas).
   * Devolve falso se já estava quebrado.
   */
  quebrar(q, { origem = null } = {}) {
    if (q.quebrado) return false;
    q.quebrado = true;
    this.mostrarQuebravel(q, false);
    if (q.circulo) q.circulo.r = 0;
    if (q.cfg.local) q.rebrota = this.time + REBROTA_S;
    const cam = this.game.camera.position;
    if (q.pos.distanceTo(cam) < 45) { if (q.cfg.folhas) this.soltarFolhas(q); else this.soltarPedacos(q, origem); }
    return true;
  }

  /** Mostra/esconde: a peça solta, ou a(s) cópia(s) dela dentro de um lote. */
  mostrarQuebravel(q, sim) {
    if (!q.instancias) { q.raiz.visible = sim; return; }
    this.zero ??= new THREE.Matrix4().makeScale(0, 0, 0);
    for (const { im, idx, m } of q.instancias) { im.setMatrixAt(idx, sim ? m : this.zero); im.instanceMatrix.needsUpdate = true; }
  }

  /** Folhas verdes rodopiando e caindo devagar (a vegetação cortada). */
  soltarFolhas(q) {
    const fx = this.game.effects, chao = this.alturaChao(q.pos);
    const tons = [[0.32, 0.55, 0.18], [0.22, 0.42, 0.12], [0.45, 0.62, 0.2], [0.55, 0.5, 0.18]];
    for (let k = 0; k < 34; k++) {
      const c = tons[k % tons.length];
      fx.spawn({ pos: new THREE.Vector3(q.pos.x + (Math.random() - 0.5) * 0.9, chao + 0.2 + Math.random() * 0.9, q.pos.z + (Math.random() - 0.5) * 0.9),
        vel: new THREE.Vector3((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3),
        color: c, size: 0.07 + Math.random() * 0.07, life: 1.4 + Math.random() * 1.2, gravity: 2.2, drag: 1.8 });
    }
    this.game.sfx.folhas?.();
  }

  restaurar(q) {
    if (!q.quebrado) return;
    q.quebrado = false;
    this.mostrarQuebravel(q, true);
    if (q.circulo) q.circulo.r = q.rCirculo;
  }

  /** Descanso/morte na Jornada: todos voltam inteiros (como os inimigos). */
  restaurarQuebraveis() { for (const q of this.quebraveis) this.restaurar(q); }

  soltarPedacos(q, origem) {
    // `setFromObject` mede mesmo escondido; o tamanho da peça guia o dos pedaços
    const caixa = new THREE.Box3().setFromObject(q.raiz);
    const tam = caixa.getSize(new THREE.Vector3());
    const altura = Math.max(0.3, Math.min(2.5, tam.y || 1)), largura = Math.max(0.3, Math.min(2, Math.max(tam.x, tam.z) || 0.8));
    this.matPedaco ??= new Map();
    if (!this.matPedaco.has(q.cfg.cor)) this.matPedaco.set(q.cfg.cor, new THREE.MeshStandardMaterial({ color: q.cfg.cor, roughness: 0.9 }));
    this.geoPedaco ??= new THREE.BoxGeometry(1, 1, 1);
    this.pedacos ??= [];
    const chao = this.alturaChao(q.pos);
    const de = origem ? new THREE.Vector3(q.pos.x - origem.x, 0, q.pos.z - origem.z).normalize() : new THREE.Vector3();
    for (let k = 0; k < q.cfg.pedacos; k++) {
      // lascas compridas e finas, como tábua quebrada
      const sx = largura * (0.12 + Math.random() * 0.25), sy = altura * (0.08 + Math.random() * 0.18), sz = largura * (0.05 + Math.random() * 0.1);
      const m = new THREE.Mesh(this.geoPedaco, this.matPedaco.get(q.cfg.cor));
      m.scale.set(sx, sy, sz);
      m.position.set(q.pos.x + (Math.random() - 0.5) * largura * 0.6, chao + Math.random() * altura, q.pos.z + (Math.random() - 0.5) * largura * 0.6);
      m.rotation.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      this.scene.add(m);
      const vel = new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3.5, (Math.random() - 0.5) * 4).addScaledVector(de, 2.5);
      this.pedacos.push({ m, vel, giro: new THREE.Vector3((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14), t: 0, meia: sy / 2 });
    }
    this.game.effects.burst(q.pos.clone().setY(chao + altura * 0.5), { count: 26, color: [0.55, 0.47, 0.38], speed: 3.5, size: 0.14, life: 0.7, gravity: 5 });
    this.game.sfx.quebrar?.();
  }

  /** Os pedaços voam, quicam, ficam no chão uns segundos e afundam. */
  atualizarPedacos(dt) {
    if (!this.pedacos?.length) return;
    for (let k = this.pedacos.length - 1; k >= 0; k--) {
      const p = this.pedacos[k];
      p.t += dt;
      const chao = this.alturaChao(p.m.position) + p.meia;
      if (p.t < 14) {
        p.vel.y -= 16 * dt;
        p.m.position.addScaledVector(p.vel, dt);
        if (p.m.position.y <= chao) {
          p.m.position.y = chao;
          if (Math.abs(p.vel.y) > 1.2) { p.vel.y *= -0.3; p.vel.x *= 0.6; p.vel.z *= 0.6; p.giro.multiplyScalar(0.5); }
          else { p.vel.set(0, 0, 0); p.giro.multiplyScalar(Math.max(0, 1 - dt * 8)); }
        }
        p.m.rotation.x += p.giro.x * dt; p.m.rotation.y += p.giro.y * dt; p.m.rotation.z += p.giro.z * dt;
      } else {
        p.m.position.y -= dt * 0.25;   // afunda no chão e some
        if (p.t > 16) { this.scene.remove(p.m); this.pedacos.splice(k, 1); }
      }
    }
  }

  closeDoor(d) {
    d.open = false; d.t = 0;
    d.box.disabled = false;
    if (d.door) d.door.rotation.y = 0;
    if (d.interact && !this.interactables.includes(d.interact)) this.interactables.push(d.interact);
  }

  closeFog() {
    this.gateOpen = false;
    this.fogBox.disabled = false;
    this.fog.fading = false;
    this.fog.mat.uniforms.opacity.value = 1;
    this.fog.meshes.forEach((m) => (m.visible = true));
    if (!this.interactables.includes(this.fogInteract)) this.interactables.push(this.fogInteract);
  }

  openFog() {
    this.gateOpen = true;
    this.fogBox.disabled = true;
    this.fog.fading = true;
    this.interactables = this.interactables.filter((i) => i !== this.fogInteract);
  }

  buildMessages() {
    MESSAGES.forEach((d, i) => {
      if (!this.isFloor(...d.cell)) return;   // mapa sem aquela área
      const p = this.center(d.cell[0], d.cell[1]).add(new THREE.Vector3(d.off[0], 0, d.off[1]));
      this.addMessage(p, d.text, { seed: i * 7 + 3 });
    });
  }

  /**
   * Uma mensagem no chão. As do mapa vêm de `MESSAGES`; as dos outros
   * jogadores, de `js/rede/mensagens.js` — que passa `extra` com o id, o autor
   * e a nota (ver o caso 'message' em `Game.interact`). Devolve o interagível,
   * que `removeMessage` tira de volta.
   */
  addMessage(pos, text, { seed = Math.floor(Math.random() * 1000), ...extra } = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), new THREE.MeshBasicMaterial({ map: messageTexture(seed), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.rotation.x = -Math.PI / 2; m.position.set(pos.x, (pos.y ?? 0) + 0.08, pos.z);
    this.scene.add(m);
    const it = { type: 'message', pos: new THREE.Vector3(pos.x, pos.y ?? 0, pos.z), radius: 1.5, label: 'Ler mensagem', text, mesh: m, ...extra };
    this.interactables.push(it);
    return it;
  }

  removeMessage(it) {
    this.scene.remove(it.mesh);
    it.mesh.material.map?.dispose(); it.mesh.material.dispose(); it.mesh.geometry.dispose();
    this.interactables = this.interactables.filter((x) => x !== it);
  }

  /**
   * Uma mancha de sangue de OUTRO jogador (`js/rede/mortes.js`): vermelha, e
   * tocá-la mostra os últimos segundos dele. A mancha VERDE, de almas, continua
   * sendo `setBloodstain` — é a sua.
   */
  addOutraMancha(pos, extra = {}) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW.tex, color: 0xff2a1a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
    s.scale.set(0.9, 0.9, 1); s.position.set(pos.x, (pos.y ?? 0) + 0.35, pos.z);
    this.scene.add(s);
    const it = { type: 'outraMancha', pos: new THREE.Vector3(pos.x, pos.y ?? 0, pos.z), radius: 1.4, label: 'Tocar a mancha de sangue', mesh: s, ...extra };
    this.interactables.push(it);
    return it;
  }

  removeOutraMancha(it) {
    this.scene.remove(it.mesh);
    it.mesh.material.dispose();
    this.interactables = this.interactables.filter((x) => x !== it);
  }

  /** O retângulo do mapa, em metros: fora dele não existe lugar (`protocolo.limparInstantaneo`). */
  limites() {
    return { minX: -CELL, maxX: this.cols * CELL, minZ: -CELL, maxZ: this.rows * CELL };
  }

  buildDust() {
    const N = 400;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = Math.random() * WALL_H; pos[i * 3 + 2] = (Math.random() - 0.5) * 30; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9a8f80, size: 0.035, transparent: true, opacity: 0.6, depthWrite: false }));
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);
  }

  // ---------- Sangue ----------
  setBloodstain(pos, souls) {
    this.clearBloodstain();
    if (souls <= 0) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW.tex, color: 0x40ff90, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.set(1.1, 1.1, 1); s.position.set(pos.x, 0.5, pos.z);
    this.scene.add(s);
    this.bloodstain = { type: 'bloodstain', pos: new THREE.Vector3(pos.x, 0, pos.z), radius: 1.6, label: `Recuperar almas (${souls})`, souls, mesh: s };
    this.interactables.push(this.bloodstain);
  }

  clearBloodstain() {
    if (!this.bloodstain) return;
    this.scene.remove(this.bloodstain.mesh);
    this.interactables = this.interactables.filter((x) => x !== this.bloodstain);
    this.bloodstain = null;
  }

  // ---------- Colisão ----------
  resolve(pos, radius) {
    for (let iter = 0; iter < 2; iter++) {
      for (const b of this.boxes) {
        if (b.disabled) continue;
        if (pos.x + radius < b.minX || pos.x - radius > b.maxX || pos.z + radius < b.minZ || pos.z - radius > b.maxZ) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > 1e-8) {
          if (d2 >= radius * radius) continue;
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius; pos.z = cz + (dz / d) * radius;
        } else {
          // Centro dentro da caixa: sai pelo lado mais próximo
          const pen = [[pos.x - b.minX, -1, 0], [b.maxX - pos.x, 1, 0], [pos.z - b.minZ, 0, -1], [b.maxZ - pos.z, 0, 1]].sort((a, c) => a[0] - c[0])[0];
          if (pen[1]) pos.x = pen[1] < 0 ? b.minX - radius : b.maxX + radius;
          else pos.z = pen[2] < 0 ? b.minZ - radius : b.maxZ + radius;
        }
      }
      for (const c of this.circles) {
        const dx = pos.x - c.x, dz = pos.z - c.z;
        const min = c.r + radius, d2 = dx * dx + dz * dz;
        if (d2 < min * min) { const d = Math.sqrt(d2) || 1e-4; pos.x = c.x + (dx / d) * min; pos.z = c.z + (dz / d) * min; }
      }
    }
  }

  // Desvia de pilares/barris no caminho (steering simples)
  avoid(pos, dir, radius) {
    for (const c of this.circles) {
      const dx = c.x - pos.x, dz = c.z - pos.z;
      const ahead = dx * dir.x + dz * dir.z;
      if (ahead < 0 || ahead > 2.5) continue;
      const side = dx * dir.z - dz * dir.x; // >0: obstáculo à esquerda
      const clear = c.r + radius + 0.2;
      if (Math.abs(side) > clear) continue;
      const k = 1 - Math.abs(side) / clear;
      // Obstáculo à esquerda → desvia para a direita (e vice-versa)
      const s = side >= 0 ? 1 : -1;
      const nx = dir.x - dir.z * s * k * 1.5, nz = dir.z + dir.x * s * k * 1.5;
      dir.set(nx, 0, nz).normalize();
    }
    return dir;
  }

  solidAt(x, z, pad = 0) {
    for (const b of this.boxes) {
      if (b.disabled) continue;
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return true;
    }
    return false;
  }

  // Fração [0..1] do segmento até bater numa parede
  rayFraction(from, to, pad = 0.2) {
    const d = from.distanceTo(to);
    const steps = Math.max(2, Math.ceil(d / 0.15));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (this.solidAt(from.x + (to.x - from.x) * t, from.z + (to.z - from.z) * t, pad)) return (i - 1) / steps;
    }
    return 1;
  }

  lineOfSight(a, b) { return this.rayFraction(a, b, 0) >= 1; }

  pointInside(pos) {
    const [r, c] = this.cellOf(pos);
    if (!this.isFloor(r, c)) return false;
    // no ar livre não há teto; dentro, o teto conta A PARTIR do chão dali
    if (!this.isOpenAir(r, c) && this.acimaDoChao(pos) > (this.isArenaCell(r, c) ? WALL_H * 2 : WALL_H)) return false;
    return !this.solidAt(pos.x, pos.z);
  }

  // ar livre não tem teto: a câmera sobe à vontade (o limite só existe para ela
  // não atravessar a laje da masmorra)
  ceilingAt(pos) {
    const [r, c] = this.cellOf(pos);
    return this.isOpenAir(r, c) ? 40 : this.isArenaCell(r, c) ? WALL_H * 2 - 0.4 : WALL_H - 0.3;
  }

  // Busca em largura no grid: próximo ponto rumo ao alvo
  nextWaypoint(from, to) {
    const start = this.cellOf(from), goal = this.cellOf(to);
    if (start[0] === goal[0] && start[1] === goal[1]) return to;
    const key = (r, c) => r * 100 + c;
    const prev = new Map([[key(...start), null]]);
    const queue = [start];
    while (queue.length) {
      const [r, c] = queue.shift();
      if (r === goal[0] && c === goal[1]) break;
      for (const [dr, dc] of Object.values(DIRS)) {
        const nr = r + dr, nc = c + dc, k = key(nr, nc);
        if (!this.isFloor(nr, nc) || prev.has(k) || this.edgeBlocked([r, c], [nr, nc])) continue;
        if (!this.conectaNivel([r, c], [nr, nc])) continue;   // não "atravessa" o desnível
        prev.set(k, [r, c]);
        queue.push([nr, nc]);
      }
    }
    if (!prev.has(key(...goal))) return null;
    let cur = goal, step = goal;
    while (cur && !(cur[0] === start[0] && cur[1] === start[1])) { step = cur; cur = prev.get(key(...cur)); }
    return this.center(step[0], step[1]);
  }

  edgeBlocked(a, b) {
    const e = this.edgeMap.get(this.edgeKey(a, b));
    if (!e) return false;
    if (e.type === 'bars') return true;
    if (e.type === 'fog') return !this.gateOpen;
    const d = this.doors.find((x) => x.pos.distanceTo(new THREE.Vector3((a[1] + b[1]) * CELL / 2, 0, (a[0] + b[0]) * CELL / 2)) < 0.5);
    return d ? !d.open : false;
  }

  // ---------- Atualização ----------
  update(dt, camera) {
    this.atualizarPedacos(dt);
    this.rebrotaT = (this.rebrotaT ?? 0) - dt;
    if (this.rebrotaT <= 0) {
      this.rebrotaT = 2;
      const pp = this.game.player.pos;
      for (const q of this.quebraveis) {
        if (q.quebrado && q.cfg.local && this.time > q.rebrota && flatDistXZ(q.pos, pp) > 14) this.restaurar(q);
      }
    }
    this.time += dt;
    const t = this.time;
    const fx = this.game.effects;
    this.updateAmbience(dt);

    for (const f of this.flames) {
      if (!f.g.visible) continue;
      const k = 1 + Math.sin(t * 13 + f.seed) * 0.08 + Math.sin(t * 7.7 + f.seed * 3) * 0.07;
      f.outer.scale.set(f.size * 1.3 * (2 - k), f.size * 1.8 * k, 1);
      f.inner.material.opacity = 0.8 + Math.sin(t * 17 + f.seed) * 0.2;
    }
    for (const b of this.fogueiras) {
      if (!b.light.visible) continue;   // longe demais para se ver (o corte é logo abaixo)
      b.light.intensity = 36 + Math.sin(t * 13 + b.pos.x) * 4 + Math.sin(t * 7.3 + b.pos.x) * 5 + Math.random() * 3;
      if (Math.random() < dt * 22) {
        fx.spawn({ pos: new THREE.Vector3(b.pos.x + (Math.random() - 0.5) * 0.5, 0.6, b.pos.z + (Math.random() - 0.5) * 0.5),
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 1.4 + Math.random() * 1.4, (Math.random() - 0.5) * 0.5),
          color: [1, 0.5 + Math.random() * 0.3, 0.15], size: 0.11, life: 1.5 + Math.random(), gravity: -0.3, drag: 0.5 });
      }
    }
    this.lightCull = (this.lightCull ?? 0) - dt;
    if (this.lightCull <= 0) { this.lightCull = 0.4; this.distribuirLuzes(); }
    for (const tr of this.torches) {
      if (!tr.lit) continue;
      const k = Math.sin(t * 11 + tr.seed) * 0.12 + Math.sin(t * 17.3 + tr.seed * 2) * 0.08 + (Math.random() - 0.5) * 0.08;
      tr.light.intensity = tr.base * (1 + k);
      if (Math.random() < dt * 3) {
        const p = tr.flame.getWorldPosition(new THREE.Vector3());
        fx.spawn({ pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.9 + Math.random(), (Math.random() - 0.5) * 0.3), color: [1, 0.55, 0.2], size: 0.06, life: 0.8, gravity: -0.2 });
      }
    }
    for (const br of this.braziers) {
      br.lit += (br.target - br.lit) * Math.min(1, dt * 2);
      br.light.intensity = 40 * br.lit * (1 + Math.sin(t * 9 + br.pos.x) * 0.1);
      br.flame.scale.setScalar(Math.max(0.01, br.lit));
      if (br.lit < 0.02 && br.target === 0) br.flame.visible = false;
      if (br.lit > 0.3 && Math.random() < dt * 10) {
        fx.spawn({ pos: br.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, 0, (Math.random() - 0.5) * 0.8)),
          vel: new THREE.Vector3((Math.random() - 0.5) * 0.5, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.5), color: [1, 0.45, 0.1], size: 0.13, life: 1.1, gravity: -0.3 });
      }
    }
    // Portas e baús animados
    for (const d of this.doors) {
      if (d.open && d.t < 1) { d.t = Math.min(1, d.t + dt * 1.4); if (d.door) d.door.rotation.y = -THREE.MathUtils.smoothstep(d.t, 0, 1) * 1.7; }
    }
    for (const c of this.chests) {
      if (c.open && c.t < 1) { c.t = Math.min(1, c.t + dt * 1.2); if (c.lid) c.lid.rotation.x = -THREE.MathUtils.smoothstep(c.t, 0, 1) * 1.25; }
    }
    // Chave caindo
    if (this.fallingKey) {
      const k = this.fallingKey;
      k.vy -= 18 * dt; k.mesh.position.y += k.vy * dt; k.mesh.rotation.z += dt * 6;
      if (k.mesh.position.y <= 0.05) {
        this.scene.remove(k.mesh);
        this.fallingKey = null;
        this.addPickup('cellKey', 1, k.target);
        this.game.sfx.keyDrop();
        fx.burst(k.target.clone().setY(k.target.y + 0.1), { count: 14, color: [0.6, 0.55, 0.5], speed: 2.5, size: 0.08, life: 0.5, gravity: 6 });
      }
    }
    // Névoa
    this.fog.mat.uniforms.time.value = t;
    if (this.fog.fading) {
      const o = Math.max(0, this.fog.mat.uniforms.opacity.value - dt * 0.4);
      this.fog.mat.uniforms.opacity.value = o;
      if (o <= 0) this.fog.meshes.forEach((m) => (m.visible = false));
    }
    for (const p of this.pickups) {
      p.mesh.position.y = 0.35 + Math.sin(t * 2 + p.seed) * 0.07;
      p.mesh.children[1].material.opacity = 0.35 + Math.sin(t * 3 + p.seed) * 0.15;
      if (Math.random() < dt * 3) fx.spawn({ pos: p.mesh.position.clone(), vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.6, (Math.random() - 0.5) * 0.3), color: [0.8, 0.9, 1], size: 0.05, life: 1 });
    }
    if (this.bloodstain) this.bloodstain.mesh.material.opacity = 0.7 + Math.sin(t * 4) * 0.3;

    // Poeira ao redor da câmera
    const arr = this.dust.geometry.attributes.position.array;
    const cx = camera.position.x, cz = camera.position.z;
    for (let i = 0; i < arr.length; i += 3) {
      arr[i] += Math.sin(t * 0.4 + i) * dt * 0.1;
      arr[i + 1] -= dt * 0.12;
      if (arr[i + 1] < 0) arr[i + 1] = WALL_H;
      if (arr[i] - cx > 15) arr[i] -= 30; else if (arr[i] - cx < -15) arr[i] += 30;
      if (arr[i + 2] - cz > 15) arr[i + 2] -= 30; else if (arr[i + 2] - cz < -15) arr[i + 2] += 30;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }
}
