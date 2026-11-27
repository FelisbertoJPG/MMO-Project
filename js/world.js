import * as THREE from 'three';
import { Assets } from './assets.js';
import { categoriaDaPeca, CRESCE_CAPIM } from './categorias.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { corDoChao, texturaDoChao, REPETE_CHAO, montarCaminhos, terreiro } from './campo.js';
import { CharacterModel, weaponMesh, shieldMesh } from './character.js';
import { ITEMS, RARIDADES, raridadeDe } from './items.js';
import { makeWeapon } from './gear.js';
import { LOD, reescreverLote, viraImpostor, vestirPassagem, profundidadeDaPassagem, CAMADA_SOMBRA, AVANCO_DO_SOL } from './lod.js';
import { fragmentos } from './fratura.js';
import { LONGE } from './graficos.js';
import { vestirVeu } from './veu.js';
import { aplicarCapsulas } from './capsulas.js';
import { montarExpositores } from './expositor.js';
// O MAPA LÓGICO (a grade, o chão, as colisões, o caminho) mora em mapa-logico.js: o World é um
// MapaLogico que também desenha. As medidas e as listas do mapa vêm de lá (o servidor as lê também).
import {
  MapaLogico, pecasDe, lugaresDasFogueiras, S, CELL, WALL_H, DIRS, YAW_INTO, TORCHES, TOCHAS_DE_ESTACA,
  CHESTS, PICKUPS, MESSAGES, ARENA, FOGUEIRAS_DO_MAPA,
} from './mapa-logico.js';
export { S, CELL, WALL_H } from './mapa-logico.js';

const flatDistXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

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
// as `gi-` (flores e ervas) também, menos o canteiro de trigo e o arbusto de frutas (grandes demais para um golpe)
const VEGETACAO = /^(Bush_|lp-Bush_|Grass_|floor_dirt_small_weeds|gi-(?!Wheat02|Raspberry))/;
export const REBROTA_S = 90;
export function cfgQuebravel(prop) {
  if (QUEBRAVEIS[prop]) return QUEBRAVEIS[prop];
  if (!VEGETACAO.test(prop)) return null;
  return { folhas: true, local: true, pedacos: 0, saque: /^(lp-)?Bush_/.test(prop) ? 'arbusto' : null };
}

/** O que cai de um quebrável: `[item, peso]`, sorteado UM; `null` = nada. */
export const SAQUES = {
  arbusto: [[null, 6], ['erva', 1]],
  barril:  [[null, 4], ['farinha', 2], ['carneCrua', 2], ['raiz', 2], ['cogumelo', 1], ['paoDuro', 1]],
  chope:   [[null, 3], ['mel', 2], ['erva', 1]],
  caixote: [[null, 4], ['raiz', 2], ['cogumelo', 2], ['pimenta', 1], ['firebomb', 1], ['paoDuro', 1]],
  saco:    [[null, 2], ['farinha', 3], ['erva', 1]],
};

// Os LUGARES fixos (padrão; as tags do mapa vencem, `aplicarMarcos`). Os das fogueiras e o da arena
// moram no mapa lógico (`FOGUEIRAS_DO_MAPA`, `ARENA`), que o servidor também lê.
const lugarPadrao = (id) => { const f = FOGUEIRAS_DO_MAPA.find((x) => x.id === id); return new THREE.Vector3(f.x, 0, f.z); };
export const BONFIRE_POS = lugarPadrao('masmorra');
export const ARENA_CENTER = new THREE.Vector3(ARENA.x, 0, ARENA.z);
export const FOG_POS = new THREE.Vector3(7 * CELL, 0, 6.5 * CELL);
export const START_POS = new THREE.Vector3(5 * CELL, 0, 24 * CELL);
// O ACAMPAMENTO (02/10/2026): a clareira a leste da floresta, com a segunda
// fogueira. É onde nasce quem entra no MUNDO ONLINE (`Player.startOutside`).
export const CAMP_POS = lugarPadrao('acampamento');

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
  // cada fogueira pela tag do mesmo nome (`masmorra`, `acampamento`, `colinas`…): a conta é a do mapa lógico
  for (const l of lugaresDasFogueiras(m)) FOGUEIRAS.find((f) => f.id === l.id).pos.set(l.x, 0, l.z);
  NASCER.id = typeof m.nascer === 'string' && FOGUEIRAS.some((f) => f.id === m.nascer) ? m.nascer : 'acampamento';
}
/** A fogueira onde se nasce no Mundo online (a tag `nascer`) e a assinatura do lugar dela. */
export const NASCER = {
  id: 'acampamento',
  get chave() { const f = FOGUEIRAS.find((x) => x.id === this.id); return `${this.id}@${f ? `${(f.pos.z / CELL).toFixed(2)},${(f.pos.x / CELL).toFixed(2)}` : '?'}`; },
};
/**
 * As FOGUEIRAS, no plural (os dados: `FOGUEIRAS_DO_MAPA`, no mapa lógico), com o lugar num
 * Vector3. Uma fogueira cuja célula é rocha no mapa ativo (o `original` não tem acampamento)
 * não é construída.
 */
export const FOGUEIRAS = FOGUEIRAS_DO_MAPA.map((f) => ({
  id: f.id, nome: f.nome, acordar: f.acordar, rumo: f.rumo,
  pos: f.id === 'masmorra' ? BONFIRE_POS : f.id === 'acampamento' ? CAMP_POS : new THREE.Vector3(f.x, 0, f.z),
}));
export const GLOW = { tex: null };

// ---------------------------------------------------------------- O CICLO DO DIA
// Um dia inteiro em DIA_S segundos (10 min desde 26/11/2026; eram 20), contado pelo relógio de verdade: duas
// telas — e todos no Mundo online — veem a mesma hora sem trocar recado nenhum.
export const DIA_S = 10 * 60;
/**
 * O DESVIO DA HORA (26/11/2026, "descansar até…" na fogueira — ui.js, `Game.passarAte`): horas somadas
 * ao relógio de verdade. Só na Jornada (`regras.horaPropria`, modo.js; guardado neste navegador): no Mundo
 * online fica 0 — todos veem a mesma hora.
 */
export const RELOGIO = { desvio: 0 };
/** A hora do mundo, de 0 a 24 (0 = meia-noite). */
// (para testar: `__hora = 12` no console prende o relógio ao meio-dia; `__hora = null` solta)
export function horaDoMundo(agora = Date.now()) { return Number.isFinite(globalThis.__hora) ? globalThis.__hora : ((((agora / 1000) % DIA_S) / DIA_S * 24 + RELOGIO.desvio) % 24 + 24) % 24; }
globalThis.__horaDoMundo = horaDoMundo;   // (o monitor lê por aqui, sem importar o mundo)
// As CHAVES do céu (hora → como está): o resto é interpolado entre a de antes e a de depois.
// `dia` (0–1) é quanto de sol há — os campos só ficam mais verdes com sol.
// A NOITE ESCURA (26/11/2026, o dono: "uma noite mais escura, onde a luz da lua e da tocha se fazem
// importantes"): o ambiente (hemi, amb) caiu para ~40% e a lua subiu um pouco — o que a lua não toca
// (debaixo das árvores, com a Sombra da lua ligada) fica bem escuro
const CEU = [
  [0, { fundo: 0x0a1226, nevoa: 0x0b1428, dens: 0.015, hemi: 0.42, amb: 0.22, lua: 1.7, ceu: 0x3a4668, chao: 0x0a0806, ambCor: 0x1c1e2a, luz: 0x9db4e8, dia: 0 }],
  [4.8, { fundo: 0x0e1630, nevoa: 0x101830, dens: 0.014, hemi: 0.5, amb: 0.26, lua: 1.6, ceu: 0x3e4a6c, chao: 0x0c0a08, ambCor: 0x1e202c, luz: 0xa0b4e0, dia: 0 }],
  [6.3, { fundo: 0xc98e78, nevoa: 0xbf9886, dens: 0.009, hemi: 1.9, amb: 1.0, lua: 2.1, ceu: 0xffc3a0, chao: 0x3a3024, ambCor: 0x3a3030, luz: 0xffad78, dia: 0.5 }],
  [8.5, { fundo: 0x7fb2e8, nevoa: 0xa9c8e8, dens: 0.005, hemi: 2.5, amb: 1.15, lua: 3.5, ceu: 0xd8e8ff, chao: 0x4a5a32, ambCor: 0x404650, luz: 0xfff1d6, dia: 1 }],
  [15.5, { fundo: 0x7fb2e8, nevoa: 0xa9c8e8, dens: 0.005, hemi: 2.5, amb: 1.15, lua: 3.5, ceu: 0xd8e8ff, chao: 0x4a5a32, ambCor: 0x404650, luz: 0xfff1d6, dia: 1 }],
  [17.6, { fundo: 0xd98a52, nevoa: 0xcf9a72, dens: 0.007, hemi: 2.05, amb: 1.0, lua: 2.8, ceu: 0xffc890, chao: 0x3d4a2a, ambCor: 0x3c3428, luz: 0xffad5c, dia: 0.7 }],
  [19.0, { fundo: 0x3a3a68, nevoa: 0x40406a, dens: 0.012, hemi: 1.45, amb: 0.9, lua: 1.8, ceu: 0x6a6a9a, chao: 0x151210, ambCor: 0x2a2836, luz: 0xc0a0d0, dia: 0.1 }],
  [20.5, { fundo: 0x0a1226, nevoa: 0x0b1428, dens: 0.015, hemi: 0.42, amb: 0.22, lua: 1.7, ceu: 0x3a4668, chao: 0x0a0806, ambCor: 0x1c1e2a, luz: 0x9db4e8, dia: 0 }],
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
const _frente = new THREE.Vector3();   // (a caixa da sombra do sol adiantada: `updateAmbience`)
// as peças que ganham colisão do próprio tamanho quando o decor.json não diz o raio

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

/** O ÍCONE de um item (o SVG do ITEMS) numa textura, para o item caído sem modelo. Uma por item. */
const icones = new Map();
function texturaDoIcone(id) {
  if (icones.has(id)) return icones.get(id);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const svg = ITEMS[id]?.icon;
  if (svg) {
    const img = new Image();
    img.onload = () => { c.getContext('2d').drawImage(img, 0, 0, 128, 128); t.needsUpdate = true; };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }
  icones.set(id, t);
  return t;
}

/**
 * A RECEITA de um material (para `agruparDecoracao` dividir os iguais): o tipo, a chave do
 * programa e cada propriedade dele — cor pelo valor, textura pela imagem e pelos ajustes.
 * O que não sei comparar (uniformes próprios, planos de corte…) devolve `null`: fica sozinho.
 */
function receitaDoMaterial(m) {
  const partes = [m.type, m.customProgramCacheKey()];
  for (const k of Object.keys(m).sort()) {
    if (k === 'uuid' || k === 'id' || k === 'name' || k === 'userData' || k === 'version' || k === '_listeners') continue;
    const v = m[k];
    if (typeof v === 'function') continue;
    if (v === null || typeof v !== 'object') { partes.push(k, v); continue; }
    if (v.isColor) partes.push(k, v.getHex());
    else if (v.isTexture) partes.push(k, v.source.uuid, v.wrapS, v.wrapT, ...v.offset.toArray(), ...v.repeat.toArray(), v.rotation, ...v.center.toArray(), v.minFilter, v.magFilter, v.anisotropy, v.flipY, v.colorSpace, v.channel, v.generateMipmaps, v.premultiplyAlpha);
    else if (v.isVector2 || v.isVector3 || v.isEuler) partes.push(k, ...v.toArray());
    else if (k === 'defines' || (Array.isArray(v) && v.every((x) => x === null || typeof x !== 'object'))) partes.push(k, JSON.stringify(v));
    else return null;
  }
  return JSON.stringify(partes);
}

/**
 * Uma geometria NOVA com os MESMOS atributos — a "casca" de cada lote da decoração
 * (`agruparDecoracao`). Os buffers na placa são dos ATRIBUTOS, que continuam os mesmos: nada
 * é copiado nem enviado de novo; só a ligação deles (o VAO) passa a ser de cada lote.
 */
function cascaDaGeometria(g) {
  if (!g.boundingSphere) g.computeBoundingSphere();
  if (!g.boundingBox) g.computeBoundingBox();
  const c = new THREE.BufferGeometry();
  c.name = g.name;
  c.index = g.index;
  Object.assign(c.attributes, g.attributes);
  Object.assign(c.morphAttributes, g.morphAttributes);
  c.morphTargetsRelative = g.morphTargetsRelative;
  c.groups = g.groups;
  c.boundingBox = g.boundingBox; c.boundingSphere = g.boundingSphere;
  c.setDrawRange(g.drawRange.start, g.drawRange.count);
  c.userData = g.userData;
  return c;
}

export class World extends MapaLogico {
  constructor(game) {
    aplicarMarcos(Assets.marcos);   // as tags de lugar do mapa, antes de montar qualquer coisa
    // O MAPA LÓGICO primeiro: a grade, o relevo, a água e TODAS as colisões (mapa-logico.js),
    // dos mesmos arquivos que o servidor lê. O mapa vem de `assets/mapa.json` (o editor de
    // cenas o grava); sem ele, a EMERGÊNCIA embutida acima — `Assets.load` já gritou o motivo.
    super({
      mapa: Assets.mapa ?? MAPA_DE_EMERGENCIA, relevo: Assets.relevo, agua: Assets.agua, decor: Assets.decor, marcos: Assets.marcos,
      pecas: pecasDe(Object.keys(Assets.props), Assets.caixasDasPecas),
    }, { vetor: (x, y, z) => new THREE.Vector3(x, y, z) });
    this.game = game;
    this.scene = game.scene;
    // o chão SEM CAPIM: a planta (retângulo em x/z) de cada peça que não é natureza, por
    // célula (`marcarSemCapim`, `podeCapim`); e as peças do decor.json por categoria
    this.semCapim = new Map();
    this.decorPorCategoria = { natureza: [], pedra: [], construcao: [], objeto: [] };
    this.interactables = [];
    this.pickups = [];
    this.torches = [];
    this.flames = [];
    this.braziers = [];
    this.doors = [];
    this.bloodstain = null;
    this.time = 0;
    GLOW.tex = glowTexture();

    this.buildLighting();
    // os CAMINHOS de terra (campo.js): a estrada, as trilhas e o terreiro das fogueiras —
    // antes do chão, que pinta a terra, e do capim, que não nasce nela
    montarCaminhos(this);
    for (const f of FOGUEIRAS) if (this.isFloor(...this.cellOf(f.pos)) && this.ch(...this.cellOf(f.pos)) === 'f') terreiro(this, f.pos.x, f.pos.z, 3.4);
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
    // o suporte de armas e o cavalete de armadura, com os itens de verdade (expositor.js)
    this.expositores = montarExpositores(this);
  }

  // ---------- Iluminação: dentro, fora e O DIA ----------
  //
  // A troca é pela CÉLULA do jogador (`updateAmbience`): dentro da masmorra, o escuro
  // de sempre; no ar livre ('f', 'a', 'e'), o CÉU DO CICLO DO DIA (`cicloDoDia`, 10 min
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
    // A SOMBRA DE LONGE ("Sempre carregadas", graficos.js: a cascata): uma luz SEM LUZ, só a sombra
    // numa caixa maior; fora da cena até a opção ligar (`Graficos.aplicar` a põe e tira, e aquece).
    // Depois da `lua` na cena: o three.js a numera 1 (o shader da cascata conta com isso)
    const luaLonge = new THREE.DirectionalLight(0xffffff, 0);
    luaLonge.name = 'sombra de longe';
    luaLonge.visible = false;
    s.add(luaLonge, luaLonge.target);
    const base = { ceu: hemi.color.clone(), chao: hemi.groundColor.clone(), amb: amb.color.clone() };
    this.ambience = { dentro, base, hemi, amb, lua, luaLonge, k: 0, kc: 0, ceu: cicloDoDia(0) };
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
    // bastante para não piscar quem anda na soleira (os campos, ~3 s). Anda ATÉ o
    // alvo e para nele: com `Math.max(0, …)` no lugar de `Math.max(alvo, …)`, quem já
    // estava ao ar livre (k = alvo = 1) caía para 0,97 num quadro e voltava no outro —
    // a névoa, o céu, a luz e o filtro de cor oscilando a cada quadro (o longe piscava)
    a.k = alvo > a.k ? Math.min(alvo, a.k + dt * 0.7) : Math.max(alvo, a.k - dt * 0.7);
    a.kc = alvoC > a.kc ? Math.min(alvoC, a.kc + dt * 0.35) : Math.max(alvoC, a.kc - dt * 0.35);
    // o céu de AGORA (a hora do ciclo); nos campos, o chão rebate mais verde
    const F = cicloDoDia(horaDoMundo(), a.ceu), kc = a.kc;
    F.chao.lerp(_verdeCampos, 0.45 * kc * F.dia);
    F.hemi *= 1 + 0.12 * kc;
    const mix = (x, y) => x + (y - x) * a.k;
    const s = this.scene;
    s.background.copy(a.dentro.fundo).lerp(F.fundo, a.k);
    s.fog.color.copy(a.dentro.nevoa).lerp(F.nevoa, a.k);
    s.fog.density = mix(a.dentro.dens, F.dens);
    // a qualidade com ALCANCE (o Mínimo, graficos.js): a névoa fecha nele (~97% no alcance:
    // 1 − e^−(d·dens)² com d·dens = 1,87), para o corte do longe não aparecer
    const alcance = this.game.graficos?.q.alcance;
    if (alcance) s.fog.density = Math.max(s.fog.density, 1.87 / alcance);
    a.hemi.intensity = mix(a.dentro.hemi, F.hemi);
    a.amb.intensity = mix(a.dentro.amb, F.amb);
    a.lua.intensity = mix(a.dentro.lua, F.lua);
    a.hemi.color.copy(a.base.ceu).lerp(F.ceu, a.k);
    a.hemi.groundColor.copy(a.base.chao).lerp(F.chao, a.k);
    a.amb.color.copy(a.base.amb).lerp(F.ambCor, a.k);
    a.lua.color.copy(F.luz);
    // o sol (ou a lua) em volta do jogador, na altura da hora
    const p = this.game.player.pos;
    // o CÉU desenhado (sol, lua, nuvens) e o reflexo dele (ceu.js); a luz vem de onde o
    // sol (ou a lua) está desenhado
    this.game.ceu?.update(dt, F, horaDoMundo(), a.k, a.dentro.fundo);
    const dir = this.game.ceu?.luzDir ?? F.dir;
    // (com sombra, o alvo anda de texel em texel do mapa dela: seguindo o jogador contínuo, a
    // borda de toda sombra tremia a cada passo)
    const passo = a.lua.castShadow ? (a.lua.shadow.camera.right - a.lua.shadow.camera.left) / a.lua.shadow.mapSize.x * 4 : 0;
    // A CAIXA ADIANTADA (20/10/2026; lod.js, `AVANCO_DO_SOL`): o centro dela vai à frente da câmera,
    // no chão (olhando quase reto para baixo, a isométrica de cima, fica no jogador)
    let cx = p.x, cz = p.z;
    const cam = this.game.camera;
    if (passo && cam) {
      cam.getWorldDirection(_frente);
      _frente.y = 0;
      const n = _frente.length();
      if (n > 0.2) { const avanco = a.lua.shadow.camera.right * AVANCO_DO_SOL / n; cx += _frente.x * avanco; cz += _frente.z * avanco; }
    }
    const ax = passo ? Math.round(cx / passo) * passo : cx, az = passo ? Math.round(cz / passo) * passo : cz;
    a.lua.position.set(ax + dir.x * 120, p.y + dir.y * 120, az + dir.z * 120);
    a.lua.target.position.set(ax, p.y, az);
    // a de LONGE (a cascata, graficos.js): a mesma direção, a caixa maior e mais à frente
    const L = a.luaLonge;
    if (L?.castShadow) {
      const passoL = (L.shadow.camera.right - L.shadow.camera.left) / L.shadow.mapSize.x * 4;
      let lx = p.x, lz = p.z;
      if (cam && _frente.lengthSq() > 0.04) { const n = _frente.length(), av = L.shadow.camera.right * LONGE.avanco / n; lx += _frente.x * av; lz += _frente.z * av; }
      lx = Math.round(lx / passoL) * passoL; lz = Math.round(lz / passoL) * passoL;
      L.position.set(lx + dir.x * 300, p.y + dir.y * 300, lz + dir.z * 300);
      L.target.position.set(lx, p.y, lz);
    }
    // a EXPOSIÇÃO: ao ar livre um pouco menor (o céu claro deixava o cenário lavado); na
    // masmorra a de sempre (1,2). Só um número do renderizador: não recompila nada
    this.game.renderer.toneMappingExposure = 1.2 - 0.17 * a.k;
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
    // Havendo, este metodo para de DESENHA-la e so desenha as passagens especiais.
    //
    // A COLISAO nao e daqui: ela vem do MAP, sempre, no mapa logico (`montarColisoes`,
    // mapa-logico.js). Tirar uma parede desenhada nao abre passagem.
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
    const livres = [];   // as células de ar livre, para o chão de grama
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const t = this.ch(row, col);
        if (t === '#') continue;
        const x = col * CELL, z = row * CELL;
        // AR LIVRE: sem piso de pedra, sem teto, sem parede desenhada (a borda com a
        // rocha barra igual: quem a mostra é a decoração, árvores e pedras). Tratado
        // antes de qualquer `r()`: consumir o sorteio aqui mudaria piso e parede de
        // todas as células seguintes no modo sem decoração.
        if (t === 'f' || t === 'a' || t === 'e') {
          if (t === 'f') livres.push([x, z]);      // grama só no chão da floresta
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
          } else if (nr > row || nc > col) {
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
      if (name.startsWith('floor')) aplicarCapsulas(info.material);   // o piso recebe a sombra do personagem (capsulas.js)
      this.scene.add(im);
    }
    if (livres.length) this.buildGrass(livres);
    // as PASSAGENS especiais (grade, porta, arco, névoa), na ordem em que o mapa lógico as achou
    for (const p of this.passagens) this.buildSpecialEdge(p);
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
    // A COR de cada vértice é a do TERRENO (`corDoChao`, campo.js) — a mesma que tinge o
    // capim, então o pé do capim some no chão. Por cima, a textura suave repetida
    // (`texturaDoChao`). O material é Lambert: o chão é fosco, e o Standard custava mais.
    const tom = new Map();   // vértices da borda entre células têm a MESMA cor (sem costura)
    const uv = [];
    for (const [cx, cz] of celulas) {
      const base = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        for (let k = 0; k <= N; k++) {
          const x = cx - CELL / 2 + i * passo, z = cz - CELL / 2 + k * passo;
          pos.push(x, 0.01 + this.relevoEm(x, z), z);
          uv.push(x / REPETE_CHAO, z / REPETE_CHAO);
          const chave = `${x.toFixed(2)},${z.toFixed(2)}`;
          if (!tom.has(chave)) tom.set(chave, corDoChao(this, x, z));
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
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const chao = new THREE.Mesh(g, aplicarCapsulas(new THREE.MeshLambertMaterial({ vertexColors: true, map: texturaDoChao() })));   // (a sombra do personagem: capsulas.js)
    chao.receiveShadow = true;
    this.scene.add(chao);
  }

  /** O DESENHO de uma passagem especial (a colisão dela já está no mapa lógico: `colisaoDaPassagem`). */
  buildSpecialEdge({ e, ex, ez, side, porta }) {
    const yaw = YAW_INTO[side];
    if (e.type === 'bars') {
      const m = Assets.prop('wall_gated'); m.position.set(ex, 0, ez); m.rotation.y = yaw; m.scale.setScalar(S);
      this.scene.add(m);
    } else if (e.type === 'door' || e.type === 'celldoor' || e.type === 'arco') {
      const m = Assets.prop('wall_doorway'); m.position.set(ex, 0, ez); m.rotation.y = yaw; m.scale.setScalar(S);
      this.scene.add(m);
      let door = null;
      m.traverse((c) => { if (/door$/.test(c.name)) door = c; });
      // ARCO: o mesmo vão, sempre aberto — a folha some e não há o que abrir.
      // O modelo é o da porta (o pacote não tem vão sem folha), por isso a
      // folha é ESCONDIDA e não retirada: o `Assets.prop` é um clone, e o
      // modelo das outras portas continua com a dela.
      if (e.type === 'arco') {
        if (door) door.visible = false;
        return;
      }
      // `box` = a caixa do vão no mapa lógico: abrir a porta a desliga (`disabled`)
      const d = { door, box: porta, open: false, t: 0, locked: e.type === 'celldoor' ? 'cellKey' : null, pos: new THREE.Vector3(ex, 0, ez) };
      this.doors.push(d);
      d.interact = { type: 'door', door: d, pos: d.pos, radius: 2.8, get label() { return d.locked ? 'Abrir porta (trancada)' : 'Abrir porta'; } };
      this.interactables.push(d.interact);
    }
    // (a névoa: `fogEdge` e `fogBox` vêm do mapa lógico; quem a desenha é o buildFogGate)
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
      this.scene.add(g);   // (a colisão dela, 0,2 m, está no mapa lógico)
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
      p.y = this.alturaChao(p);   // o do acampamento fica no ar livre, que tem relevo
      m.position.copy(p);
      m.rotation.y = YAW_INTO[def.wall];
      let lid = null;
      m.traverse((c) => { if (/lid$/.test(c.name)) lid = c; });
      this.scene.add(m);   // (a colisão do baú está no mapa lógico)
      this.marcarSemCapim(p.x - 0.9, p.z - 0.9, p.x + 0.9, p.z + 0.9);
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
    this.congelar(c);
    // o LOD (lod.js, `personagens`) corta o desenho dele como o dos inimigos
    (this.cadaveres ??= []).push({ model: c, pos: c.root.position });
    return c;
  }

  /**
   * O CADÁVER VIRA ESTÁTUA (11/10/2026): ele é um boneco inteiro (65 ossos, 5 malhas com ossos)
   * parado para sempre na pose de morto — e, como todo boneco, tinha os ossos percorridos e
   * mandados à placa a cada quadro. Eram 16 cadáveres = 1.040 ossos e 1.870 objetos na cena, e
   * na sala da fogueira da masmorra (onde há vários à vista) o quadro pesava mais que nos
   * corredores. Aqui cada malha é "assada" na pose (os vértices já no lugar que os ossos
   * dariam) e vira uma malha comum; o esqueleto sai da cena.
   */
  congelar(c) {
    c.root.updateMatrixWorld(true);
    const inv = c.root.matrixWorld.clone().invert(), v = new THREE.Vector3(), novas = [], soltas = [];
    c.root.traverse((o) => {
      if (!o.isMesh) return;
      let visivel = true; for (let p = o; p && p !== c.root.parent; p = p.parent) if (!p.visible) visivel = false;
      if (!visivel) return;
      if (!o.isSkinnedMesh) { soltas.push(o); return; }
      const g = o.geometry.clone(), pos = g.attributes.position, m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < pos.count; i++) { o.applyBoneTransform(i, v.fromBufferAttribute(pos, i)); v.applyMatrix4(m); pos.setXYZ(i, v.x, v.y, v.z); }
      g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
      g.computeVertexNormals(); g.computeBoundingSphere(); g.computeBoundingBox();
      const malha = new THREE.Mesh(g, o.material);
      malha.name = o.name; malha.castShadow = o.castShadow; malha.receiveShadow = o.receiveShadow;
      novas.push(malha);
    });
    for (const o of soltas) c.root.attach(o);          // peça rígida (presa a um osso): fica onde está
    for (const f of [...c.root.children]) if (!soltas.includes(f)) c.root.remove(f);
    for (const m of novas) c.root.add(m);
    c.root.traverse((o) => { o.matrixAutoUpdate = false; o.updateMatrix(); });
    c.root.updateMatrixWorld(true);
  }

  /**
   * O ITEM CAÍDO (16/10/2026): o PRÓPRIO item no chão — a arma deitada, o escudo, a tocha (o
   * modelo dela, levemente tingido na cor da raridade); o que não tem modelo (comida, anel,
   * armadura, ingrediente) é o ícone dele, de pé, flutuando — e em volta um BRILHO na cor da
   * RARIDADE (items.js `raridadeDe`) que pulsa. Perto dele, a ficha (ui.js `mostrarLoot`).
   */
  addPickup(itemId, qty, pos, persistent = true) {
    const g = new THREE.Group();
    const def = ITEMS[itemId], raridade = raridadeDe(itemId), cor = new THREE.Color(RARIDADES[raridade].cor);
    const chao = this.alturaChao(pos);
    g.position.set(pos.x, chao, pos.z);
    // o brilho em volta (o mesmo sprite das chamas: nada de shader novo)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW.tex, color: cor, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.5, transparent: true }));
    halo.scale.set(1.7, 1.7, 1); halo.position.y = 0.12;
    g.add(halo);
    let item = null, flutua = false;
    const modelo = def?.model;
    if (modelo && (def.type === 'weapon' || def.type === 'shield' || def.type === 'torch')) {
      const m = def.type === 'shield' ? shieldMesh(modelo) : weaponMesh(modelo);
      // deitado no chão (a arma é feita apontando para +Z: de lado, a lâmina fica chata no chão)
      if (def.type !== 'shield') m.rotation.z = Math.PI / 2;
      const casca = new THREE.Group(); casca.add(m);
      casca.rotation.y = Math.random() * Math.PI * 2;
      casca.updateMatrixWorld(true);
      const caixa = new THREE.Box3().setFromObject(casca), meio = caixa.getCenter(new THREE.Vector3());
      m.position.sub(new THREE.Vector3(meio.x, caixa.min.y - 0.02, meio.z).applyQuaternion(casca.quaternion.clone().invert()));
      // um toque da cor da raridade no próprio item (materiais próprios: o brilho não vaza para as outras armas)
      m.traverse((o) => { if (o.isMesh && o.material?.emissive) { o.material = o.material.clone(); o.material.emissive.copy(cor); o.material.emissiveIntensity = 0.28; o.castShadow = true; } });
      item = casca;
    } else {
      // sem modelo: o ícone do item, de pé, flutuando
      item = new THREE.Sprite(new THREE.SpriteMaterial({ map: texturaDoIcone(itemId), transparent: true, depthWrite: false }));
      item.scale.set(0.55, 0.55, 1);
      item.position.y = 0.55;
      flutua = true;
    }
    g.add(item);
    this.scene.add(g);
    const p = { type: 'pickup', itemId, qty, pos: new THREE.Vector3(pos.x, 0, pos.z), radius: 1.6, label: `Pegar ${def?.name ?? 'item'}${qty > 1 ? ` (${qty})` : ''}`, mesh: g, halo, item, flutua, raridade, cor, chao, persistent, seed: Math.random() * 10 };
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
  // `placeDecor`, que é explícito. Só DESENHA: a colisão da arena está no mapa lógico.
  place(name, cell, off = [0, 0], yaw = 0, y = 0) {
    const m = Assets.prop(name);
    const p = this.center(cell[0], cell[1]);
    m.position.set(p.x + off[0] * S, y * S, p.z + off[1] * S);
    if (/pillar|column|banner/.test(name)) m.scale.setScalar(S);
    m.rotation.y = yaw;
    this.scene.add(m);
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
  placeDecor(d, i) {
    if (!Assets.props[d.prop]) {
      console.warn(`[decor] "${d.prop}" não está em PROPS (js/assets.js) — pulando`);
      return null;
    }
    const m = Assets.prop(d.prop);
    const p = this.center(d.cel[0], d.cel[1]);
    const off = d.off ?? [0, 0];
    const px = p.x + off[0] * S, pz = p.z + off[1] * S, rel = this.ch(...d.cel) === 'f' ? this.relevoEm(px, pz) : 0;
    // no relevo a peça é ENTERRADA um pouco (a base reta não fica no ar na ladeira): 20 cm —
    // mas a planta e a pedra pequenas, só um décimo da própria altura (uma flor de 50 cm
    // enterrada 20 sumia pela metade; antes o `decor.json` a levantava com `y: 0.1`, que o
    // decorador do editor de cenas zera ao salvar)
    const cat = categoriaDaPeca(d.prop);
    let enterra = 0.2;
    if (cat === 'natureza' || cat === 'pedra') {
      const cx = this.caixaDoProp(d.prop);
      enterra = Math.min(0.2, (cx.max.y - cx.min.y) * (d.escala ?? 1) * 0.1);
    }
    m.position.set(px, (d.y ?? 0) * S + (Math.abs(rel) > 0.05 ? rel - enterra : 0), pz);
    m.scale.setScalar(d.escala ?? 1);
    m.rotation.set(0, d.giro ?? 0, 0);
    // `flip` é o TETO: uma placa de piso virada de cabeça para baixo. Um giro em
    // Y não expressa isso, e sem ele o teto aparece com a face para cima —
    // invisível de dentro da masmorra, que é o único lugar de onde se olha.
    // `rotateX` gira no eixo LOCAL, depois do Y: é o mesmo `R_y · R_x` que o
    // `buildGeometry()` montava na matriz.
    if (d.flip) m.rotateX(Math.PI);
    this.scene.add(m);
    // a CATEGORIA (categorias.js): o capim só cresce sobre a natureza; a planta das outras
    // peças vira chão sem capim (a caixa do modelo girada e escalada, em x/z)
    m.userData.categoria = cat;
    m.userData.prop = d.prop;   // o LOD (lod.js) agrupa os lotes pela peça
    if (!CRESCE_CAPIM.has(cat)) {
      m.updateMatrix();
      const b = this.caixaDoProp(d.prop).clone().applyMatrix4(m.matrix);
      this.marcarSemCapim(b.min.x, b.min.z, b.max.x, b.max.z);
    }
    // a COLISÃO da peça (o raio do dado, ou o automático das pedras) é do mapa lógico
    // (`montarColisoes`); aqui só o círculo dela, que o quebrável zera ao quebrar
    if (this.circulosDoDecor[i]) m.userData.circulo = this.circulosDoDecor[i];
    return m;
  }

  /** A caixa de um prop em escala 1, sem giro (guardada: é a mesma para todas as cópias). */
  caixaDoProp(nome) {
    this._caixas ??= new Map();
    if (!this._caixas.has(nome)) this._caixas.set(nome, new THREE.Box3().setFromObject(Assets.props[nome]));
    return this._caixas.get(nome);
  }

  /** Nada de capim no retângulo (x0, z0)–(x1, z1): guardado em cada célula que ele toca. */
  marcarSemCapim(x0, z0, x1, z1) {
    const ret = [x0, z0, x1, z1];
    for (let r = Math.round(z0 / CELL); r <= Math.round(z1 / CELL); r++) {
      for (let c = Math.round(x0 / CELL); c <= Math.round(x1 / CELL); c++) {
        if (c < 0 || c >= this.cols) continue;
        const k = r * this.cols + c;
        if (!this.semCapim.has(k)) this.semCapim.set(k, []);
        this.semCapim.get(k).push(ret);
      }
    }
  }

  /** O capim pode nascer em (x, z)? `folga` = o quanto o tufo se abre em volta do pé. */
  podeCapim(x, z, folga = 0) {
    const l = this.semCapim.get(Math.round(z / CELL) * this.cols + Math.round(x / CELL));
    if (!l) return true;
    for (const [x0, z0, x1, z1] of l) if (x > x0 - folga && x < x1 + folga && z > z0 - folga && z < z1 + folga) return false;
    return true;
  }

  buildDecor() {
    // Os PROPS vêm de assets/decor.json, gravado pelo editor de cenas. Antes
    // disto eram 38 chamadas de place() escritas à mão aqui — mover um barril
    // meio metro era editar código, recarregar e olhar.
    const pecas = [];
    this.quebraveis = [];
    Assets.decor.forEach((d, i) => {
      const m = this.placeDecor(d, i);
      if (!m) return;
      this.decorPorCategoria[m.userData.categoria].push({ i, prop: d.prop, obj: m });
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
    // O LADO da região: 24 m para as ÁRVORES e os arbustos (o que vira cartaz: ele troca por grupo; com grupos
    // grandes, a árvore de perto viraria cartaz junto com a de longe) e 48 m para o resto
    // (11/10/2026). Com 24 m para tudo, cada lote tinha ~2 cópias: numa GT 730 no Baixo, sem
    // sombra nenhuma, eram 604 chamadas de desenho e 36 ms de CPU só para montá-las (19
    // quadros/s com a placa folgada). Região maior = menos chamadas e um pouco mais de
    // triângulos fora da câmera, que a placa aguenta.
    const LOTE_ARVORE = 4 * CELL, LOTE_RESTO = 8 * CELL;
    const lotes = new Map(), entradas = [];
    // os GRUPOS do LOD (lod.js): por peça e região, os lotes dela e onde está cada cópia
    const grupos = new Map();
    for (const raiz of pecas) {
      let solta = false;
      raiz.traverse((o) => { if (o.isLight || o.isSprite || o.isPoints || o.isSkinnedMesh || o.isLine) solta = true; });
      if (solta) continue;
      raiz.updateMatrixWorld(true);
      const malhas = [];
      raiz.traverseVisible((o) => { if (o.isMesh) malhas.push(o); });
      if (!malhas.length) continue;
      const prop = raiz.userData.prop ?? '?', LOTE = viraImpostor(prop) ? LOTE_ARVORE : LOTE_RESTO;
      const rx = Math.floor(raiz.position.x / LOTE), rz = Math.floor(raiz.position.z / LOTE);
      // (o lado de DENTRO e o de fora da masmorra em grupos separados: o LOD esconde um ou outro
      // pelo grupo inteiro, e com a região maior a mistura na porta da masmorra crescia)
      const deDentro = this.ehDeDentro(...this.cellOf(raiz.position)), regiao = `${rx},${rz},${deDentro ? 'd' : 'f'}`;
      const chaveG = `${prop}|${regiao}`;
      let g = grupos.get(chaveG);
      if (!g) grupos.set(chaveG, (g = { prop, ims: new Set(), lotes: new Set(), visivel: true, matrizes: [], posicoes: [], raioPeca: 0, nDentro: 0 }));
      g.matrizes.push(raiz.matrixWorld.clone());
      if (deDentro) g.nDentro++;   // peça da masmorra (lod.js: o outro lado)
      g.posicoes.push(raiz.position.clone());
      if (Assets.props[prop]) g.raioPeca = Math.max(g.raioPeca, this.caixaDoProp(prop).getSize(new THREE.Vector3()).length() / 2 * raiz.scale.x);
      // (`raiz`: o lugar da RAIZ da peça — a distância do LOD é dela, igual para todas as malhas da peça)
      const lugar = new THREE.Vector3().setFromMatrixPosition(raiz.matrixWorld);
      for (const m of malhas) entradas.push({ malha: m, g, m: m.matrixWorld.clone(), raiz: lugar, x: raiz.position.x, z: raiz.position.z, q: raiz.userData.quebravel });
      raiz.removeFromParent();
    }
    // OS LOTES DE DESENHO ≠ OS GRUPOS DO LOD (15/10/2026). Eram a mesma coisa (peça × região de
    // 48 m), e a decoração é VARIADA: do acampamento desenhavam-se 163 lotes com 3,2 cópias em
    // média (103 com uma ou duas) — e com lotes maiores pouco mudava (144 m: 61), porque o que
    // multiplica é o número de peças diferentes. Agora o lote de desenho é UM POR PEÇA NO MAPA
    // INTEIRO, e quem diz o que vai nele é o LOD: a cada grupo que aparece ou some, ele reescreve
    // no lote só as cópias dos grupos à vista (`reescreverLote`, lod.js; a esfera do corte de
    // câmera passa a ser a delas). A peça que projeta SOMBRA fica em regiões de 96 m: a sombra da
    // tocha (seis vistas em volta do jogador) e a do sol cortam pelo lote, e com o mapa inteiro
    // num lote só desenhariam todas as cópias à vista em cada vista. A geometria continua
    // dividida (nada a mais na memória); a regra da sombra é a de antes, por grupo.
    const LOTE_SOMBRA = 16 * CELL;
    for (const e of entradas) {
      const { malha, g } = e, mats = [].concat(malha.material);
      // peça PEQUENA (capim de decoração, flores, pedrinhas: menos de 1,2 m de raio) não
      // projeta a sombra da tocha (07/10/2026): com a tocha acesa, a sombra redesenha tudo
      // que projeta sombra num raio de 24 m SEIS vezes (as faces do cubo) — eram ~2.200
      // chamadas a mais por quadro no Alto, e a sombra de um tufo de capim mal se vê. Piso e
      // pedra de caminho também não: são chatos, não fazem sombra que se veja
      // E SÓ ÁRVORE E PEÇA GRANDE (11/10/2026): com a sombra do sol, cada lote que projeta sombra é
      // uma chamada a mais por quadro (e seis com a tocha). Numa GT 730 as sombras eram 575 das
      // 1.007 chamadas, e o limite era a CPU montando chamadas. Flores, juncos, trigo (`gi-`),
      // moitas e pedras médias saíram: a sombra delas mal se vê no capim
      const sombra = malha.castShadow && !/^floor|RockPath|PathRocks|^gi-|Bush/.test(g.prop) && (/Tree(?!Stump)/.test(g.prop) ? g.raioPeca >= 1.2 : g.raioPeca >= 2.2);
      const regiao = sombra ? `${Math.floor(e.x / LOTE_SOMBRA)},${Math.floor(e.z / LOTE_SOMBRA)}` : 'mapa';
      const chave = `${malha.geometry.uuid}|${mats.map((x) => x.uuid).join(',')}|${sombra}|${malha.receiveShadow}|${regiao}`;
      let l = lotes.get(chave);
      if (!l) lotes.set(chave, (l = { malha, sombra, copias: [] }));
      const c = { m: e.m, g, cortada: false, raiz: e.raiz };
      l.copias.push(c);
      g.lotes.add(l);
      // um quebrável dentro do lote (a vegetação): ele precisa saber qual cópia é a dele
      if (e.q) (e.q.instancias ??= []).push({ lote: l, c });
    }
    // OS LOTES NUM GRUPO PARADO (11/10/2026). O perfil de CPU do jogo (GT 730: o "render" não caía
    // com menos chamadas de desenho) mostrou que ~35% do quadro era o three.js PERCORRENDO a cena:
    // `updateMatrixWorld` (refaz a matriz de cada objeto, todo quadro) e `projectObject`. Os ~1.300
    // lotes nunca saem do lugar (a matriz deles é a identidade; cada cópia tem a sua, dentro do
    // lote): ficam num grupo cujo `updateMatrixWorld` não faz nada.
    const parados = new THREE.Group();
    parados.name = 'lotes da decoração';
    // UM MATERIAL POR RECEITA (15/10/2026): cada peça do pacote chega com os seus materiais, e
    // muitos são iguais em tudo (o mesmo atlas, a mesma cor) — do acampamento, os opacos
    // desenhados tinham 91 materiais e só 43 receitas. A cada troca de material o three.js
    // reenvia TODOS os uniformes (as luzes, a névoa, a cor…): `setProgram` era um quarto da CPU
    // do quadro com a CPU freada 8× (a conta de um celular fraco). Os lotes de materiais iguais
    // passam a dividir UMA cópia, só deles (dividida com uma malha comum, o programa trocaria a
    // cada desenho: instanciado × não). Nada muda na tela.
    const receitas = new Map();
    // `troca`: lote de ÁRVORE/ARBUSTO, com a passagem modelo ↔ cartaz (lod.js, `vestirPassagem`) — num
    // material SÓ dele (o original é o das fotos do cartaz, e o de outra peça não pode sumir).
    // O RESTO (20/10/2026) também ganha um só dos lotes: o detalhe pequeno some em pontilhado.
    // UM SHADER SÓ para as duas passagens (lod.js, o código por cópia no `aLod`): o lote de árvore
    // e o de pedra com a mesma receita dividem o material (eram dois, e dois programas). O material
    // SEM receita também vira uma cópia só dos lotes (por uuid, como já era o das árvores): era o
    // original, e o detalhe dele ainda sumia de uma vez (menos o ShaderMaterial, sem os encaixes)
    const unico = (m) => {
      const k0 = receitaDoMaterial(m), k = k0 === null ? (m.isShaderMaterial ? null : `uuid|${m.uuid}`) : k0;
      if (k === null) return vestirVeu(m);
      let r = receitas.get(k);
      if (!r) {
        r = m.clone();
        // (o `clone` não leva os ganchos do shader: as `gi-`, assets.js)
        r.onBeforeCompile = m.onBeforeCompile; r.customProgramCacheKey = m.customProgramCacheKey;
        // o VÉU da câmera isométrica (veu.js): parado (uVeu = 0) fora dela
        vestirVeu(r);
        vestirPassagem(r);
        receitas.set(k, r);
      }
      return r;
    };
    for (const l of lotes.values()) {
      const { malha, copias } = l, troca = viraImpostor(copias[0].g.prop);
      // UMA "CASCA" DE GEOMETRIA POR LOTE (13/10/2026): os lotes da mesma peça dividiam a geometria,
      // e o three.js guarda a ligação dos atributos (o VAO) por geometria + programa — como cada
      // lote tem o SEU `instanceMatrix`, a cada desenho ele via "mudou" e religava todos os atributos
      // (o perfil de CPU com o freio de 4×, a conta de um celular: ~13% do quadro em `setup`,
      // `bindBuffer` e `vertexAttribPointer`, no quadro e de novo em cada vista da sombra)
      const im = new THREE.InstancedMesh(cascaDaGeometria(malha.geometry), Array.isArray(malha.material) ? malha.material.map((x) => unico(x)) : unico(malha.material), copias.length);
      copias.forEach((c, i) => im.setMatrixAt(i, c.m));
      im.castShadow = l.sombra;   // (a regra está acima, na montagem dos lotes)
      // o LUGAR DA RAIZ e o raio de cada cópia (lod.js, `aLod`: escrito pelo LOD com as matrizes)
      im.geometry.setAttribute('aLod', new THREE.InstancedBufferAttribute(new Float32Array(copias.length * 4), 4));
      // a SOMBRA do detalhe que some acompanha o pontilhado dele (lod.js, `profundidadeDaPassagem`)
      if (l.sombra && !troca && [].concat(im.material).every((x) => x.userData.passagem)) { const d = profundidadeDaPassagem(im.material, 'sumir'); if (d) im.customDepthMaterial = d; }
      im.receiveShadow = malha.receiveShadow;
      im.computeBoundingSphere();
      im.matrixAutoUpdate = false;
      parados.add(im);
      l.im = im;
      for (const c of copias) c.g.ims.add(im);
      // A SOMBRA DA ÁRVORE QUE JÁ É CARTAZ (19/10/2026, lod.js): as mesmas cópias, só na camada
      // que a luz do sol desenha — a câmera não as vê, então nem os vértices são pagos no quadro
      if (troca && l.sombra) {
        const s = new THREE.InstancedMesh(cascaDaGeometria(malha.geometry), im.material, copias.length);
        s.name = 'sombra de cartaz';
        s.count = 0; s.visible = false;
        s.castShadow = true; s.receiveShadow = false;
        s.layers.set(CAMADA_SOMBRA);
        s.geometry.setAttribute('aLod', new THREE.InstancedBufferAttribute(new Float32Array(copias.length * 4), 4));
        // a sombra dela some aos poucos no fim do alcance (`uSombraAte`, lod.js), em vez de saltar
        const d = profundidadeDaPassagem(im.material, 'longe');
        if (d) s.customDepthMaterial = d;
        s.matrixAutoUpdate = false;
        parados.add(s);
        l.imSombra = s;
      }
    }
    this.scene.add(parados);
    parados.updateMatrixWorld(true);
    parados.matrixAutoUpdate = false;
    parados.updateMatrixWorld = () => {};
    this.lotesDeDecoracao = lotes.size;
    this.materiaisDosLotes = receitas.size;
    // o meio e o raio de cada grupo (as cópias, mais o tamanho da peça)
    for (const g of grupos.values()) {
      g.centro = g.posicoes.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(g.posicoes.length);
      g.raio = Math.max(...g.posicoes.map((p) => p.distanceTo(g.centro))) + g.raioPeca;
      g.dentro = g.nDentro * 2 > g.posicoes.length;   // a maioria das cópias está dentro da masmorra
      delete g.posicoes;
    }
    this.lod = new LOD(this, [...grupos.values()], [...lotes.values()]);
  }

  /**
   * O ORÇAMENTO DE LUZES: sempre `luzesNoOrcamento` luzes de cenário ligadas
   * (tochas de parede/estaca, fogueiras, braseiros), as mais perto do jogador
   * — as acesas primeiro, e as apagadas (intensidade zero) completando a
   * conta. O número de luzes visíveis NUNCA muda: no three.js, mudá-lo
   * recompila o shader de todo material, e era isso o engasgo ao passar perto
   * de uma fogueira. Cada luz também custa em todo pixel, então o orçamento é
   * o que a qualidade gráfica escolhe (`graficos.js`).
   *
   * São DOIS orçamentos (05/10/2026): o de dentro (`luzesNoOrcamento`) e um menor
   * ao AR LIVRE (`luzesForaNoOrcamento`). Toda luz custa em todo pixel mesmo
   * longe demais para iluminar alguma coisa, e lá fora uma copa de árvore são
   * dezenas de camadas de folha: olhando a floresta, as 8 luzes eram ~40% do
   * quadro (26 → 45 quadros/s sem elas, Radeon 740M). Trocar de orçamento muda o
   * número de luzes, mas não recompila: os DOIS são compilados no carregamento
   * (`Graficos.aplicar`) e o three.js guarda os dois programas em cada material.
   * `fora` (padrão: o jogador está ao ar livre) escolhe qual.
   */
  distribuirLuzes(fora = (this.ambience?.k ?? 0) > 0.5) {
    const pp = this.game.player?.pos;
    if (!pp) return;
    const fontes = [
      ...this.torches.map((t) => ({ luz: t.light, pos: t.interact.pos, acesa: !!t.lit })),
      ...this.fogueiras.map((b) => ({ luz: b.light, pos: b.pos, acesa: true })),
      ...this.braziers.map((b) => ({ luz: b.light, pos: b.pos, acesa: b.target > 0 || b.lit > 0.02 })),
    ];
    // o olho do Carrasco e a brasa do dragão também (06/10/2026): fora do orçamento eles
    // ficavam SEMPRE visíveis — apagados (intensidade 0), mas pagos em todo pixel do mapa
    const boss = this.game.boss, dragao = this.game.dragao;
    if (boss?.eyeGlow) fontes.push({ luz: boss.eyeGlow, pos: boss.pos, acesa: boss.eyeGlow.intensity > 0 });
    if (dragao?.brasa) fontes.push({ luz: dragao.brasa, pos: dragao.pos, acesa: dragao.brasa.intensity > 0 });
    const d2 = (f) => f.pos.distanceToSquared(pp);
    fontes.sort((a, b) => (b.acesa - a.acesa) || d2(a) - d2(b));
    const orcamento = fora ? (this.luzesForaNoOrcamento ?? this.luzesNoOrcamento) : this.luzesNoOrcamento;
    const n = Math.min(orcamento ?? 8, fontes.length);
    fontes.forEach((f, i) => { f.luz.visible = i < n; });
  }

  // ---------- Fogueiras ----------
  buildBonfires() {
    this.fogueiras = [];
    for (const def of FOGUEIRAS) {
      if (!this.isFloor(...this.cellOf(def.pos))) continue;
      this.fogueiras.push({ ...def, ...this.buildBonfire(def) });
      this.marcarSemCapim(def.pos.x - 1.2, def.pos.z - 1.2, def.pos.x + 1.2, def.pos.z + 1.2);
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
    // as 10 pedras numa malha só, e as 6 lenhas em outra (11/10/2026): eram 16 chamadas de desenho
    // por fogueira, justo onde os jogadores ficam parados — as peças são as mesmas, no mesmo lugar
    const fundir = (malhas, material) => {
      const geo = mergeGeometries(malhas.map((m) => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix); }));
      for (const m of malhas) m.geometry.dispose();
      return new THREE.Mesh(geo, material);
    };
    const stone = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 1 });
    const pedras = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2 + r() * 0.1), stone);
      s.position.set(Math.cos(a) * 0.75, 0.1, Math.sin(a) * 0.75);
      pedras.push(s);
    }
    const anel = fundir(pedras, stone);
    anel.castShadow = true;
    g.add(anel);
    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.72, 16), new THREE.MeshStandardMaterial({ color: 0x141110, roughness: 1 }));
    ash.rotation.x = -Math.PI / 2; ash.position.y = 0.03; g.add(ash);
    const wood = new THREE.MeshStandardMaterial({ color: 0x24160c, roughness: 1 });
    const lenhas = [];
    for (let i = 0; i < 6; i++) {
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.0, 6), wood);
      const a = (i / 6) * Math.PI * 2;
      log.position.set(Math.cos(a) * 0.18, 0.28, Math.sin(a) * 0.18);
      log.rotation.set(Math.sin(a) * 0.65, 0, -Math.cos(a) * 0.65);
      lenhas.push(log);
    }
    g.add(fundir(lenhas, wood));
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
    this.scene.add(g);   // (a colisão da fogueira está no mapa lógico)
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
      this.scene.add(g);   // (a colisão dos braseiros, dos pilares e do cepo está no mapa lógico)
      this.braziers.push({ light, flame, lit: 0, target: 0, pos: new THREE.Vector3(x, 2, z) });
    };
    const c = ARENA_CENTER;
    addBrazier(c.x - 12 * S, c.z - 6 * S); addBrazier(c.x + 12 * S, c.z - 6 * S); addBrazier(c.x - 12 * S, c.z + 6 * S); addBrazier(c.x + 12 * S, c.z + 6 * S);
    for (const [r, col] of [[2, 4], [2, 10], [5, 4], [5, 10]]) this.place('pillar_decorated', [r, col], [0, 0], 0);
    this.place('banner_patternA_red', [1, 6], [0, -1.55], 0, 3);
    this.place('banner_patternA_red', [1, 8], [0, -1.55], 0, 3);
    this.place('rubble_half', [5, 9], [1, 1], 2);
    // Bloco do carrasco e cabeças rolando...
    this.place('table_medium_broken', [2, 7], [0, -0.8], 0);
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
    for (const { lote, c } of q.instancias) { c.cortada = !sim; reescreverLote(lote, this.lod?.tudo); }
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
    // O PRÓPRIO OBJETO EM PEDAÇOS (16/10/2026, fratura.js): o barril em tábuas de barril, o
    // caixote em lascas de caixote. Os blocos de cor ficam só para a peça sem malha
    if (this.soltarFragmentos(q.raiz, `q:${q.prop ?? q.cfg?.cor}`, q.cfg.pedacos, origem)) {
      const caixa = new THREE.Box3().setFromObject(q.raiz), meio = caixa.getCenter(new THREE.Vector3());
      this.game.effects.burst(meio, { count: 18, color: [0.55, 0.47, 0.38], speed: 3, size: 0.1, life: 0.6, gravity: 5 });
      this.game.sfx.quebrar?.();
      return;
    }
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

  /**
   * Os PEDAÇOS DE UM OBJETO (fratura.js) voando do lugar dele: cada lasca sai na posição, giro e
   * escala em que estava, empurrada para fora do meio (e para longe de `origem`, quem bateu).
   * `n` pedaços; `forca` multiplica o empurrão. Devolve se soltou algo (objeto sem malha: não).
   */
  soltarFragmentos(raiz, chave, n = 8, origem = null, forca = 1) {
    const frags = fragmentos(raiz, chave, n);
    if (!frags.length) return false;
    raiz.updateMatrixWorld(true);
    const mw = raiz.matrixWorld, pos = new THREE.Vector3(), quat = new THREE.Quaternion(), esc = new THREE.Vector3();
    mw.decompose(pos, quat, esc);
    const caixa = new THREE.Box3().setFromObject(raiz), meio = caixa.getCenter(new THREE.Vector3());
    const de = origem ? new THREE.Vector3(meio.x - origem.x, 0, meio.z - origem.z).normalize() : new THREE.Vector3();
    this.pedacos ??= [];
    for (const f of frags) {
      const g = new THREE.Group();
      for (const { geometry, material } of f.partes) g.add(new THREE.Mesh(geometry, material));
      g.position.copy(f.centro).applyMatrix4(mw);
      g.quaternion.copy(quat);
      g.scale.copy(esc);
      this.scene.add(g);
      const fora = g.position.clone().sub(meio).setY(0);
      if (fora.lengthSq() > 1e-6) fora.normalize();
      const vel = new THREE.Vector3((Math.random() - 0.5) * 2, 1.5 + Math.random() * 3, (Math.random() - 0.5) * 2)
        .addScaledVector(fora, 2.2 * forca).addScaledVector(de, 2 * forca);
      const giro = new THREE.Vector3((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 12);
      this.pedacos.push({ m: g, vel, giro, t: 0, meia: Math.max(0.02, f.raio * Math.max(esc.x, esc.y, esc.z) * 0.25) });
    }
    return true;
  }

  /** Os pedaços voam, quicam, ficam no chão uns segundos e afundam. */
  atualizarPedacos(dt) {
    if (!this.pedacos?.length) return;
    for (let k = this.pedacos.length - 1; k >= 0; k--) {
      const p = this.pedacos[k];
      p.t += dt;
      const chao = this.alturaChao(p.m.position) + p.meia;
      const vida = p.vida ?? 14;   // (o esqueleto desmontado fica mais: desmontar.js)
      if (p.t < vida) {
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
        if (p.t > vida + 2) {
          this.scene.remove(p.m);
          if (p.descartar) p.m.traverse((o) => o.geometry?.dispose());   // (as geometrias só daquela peça)
          this.pedacos.splice(k, 1);
        }
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
      p.y = this.alturaChao(p);
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
    s.scale.set(1.1, 1.1, 1); s.position.set(pos.x, this.alturaChao(pos) + 0.5, pos.z);
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
    // o monitor de desempenho (monitor.js) separa o céu (com o reflexo) e o LOD do resto do mundo
    const M = this.game.monitor;
    M?.fase('mundo');
    this.updateAmbience(dt);
    M?.fase('céu');
    this.lod?.update(camera);
    M?.fase('lod');

    for (const f of this.flames) {
      if (!f.g.visible || !f.outer.layers.isEnabled(0)) continue;   // (escondida pelo LOD: lod.js, `soltas`)
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
      // o brilho pulsa; o ícone (o item sem modelo) flutua; faíscas na cor da raridade
      p.halo.material.opacity = 0.38 + Math.sin(t * 3 + p.seed) * 0.14;
      if (p.flutua) p.item.position.y = 0.55 + Math.sin(t * 2 + p.seed) * 0.06;
      if (Math.random() < dt * 2.5) fx.spawn({ pos: p.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.1, (Math.random() - 0.5) * 0.5)), vel: new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.7, (Math.random() - 0.5) * 0.2), color: [p.cor.r, p.cor.g, p.cor.b], size: 0.05, life: 1 });
    }
    if (this.bloodstain) this.bloodstain.mesh.material.opacity = 0.7 + Math.sin(t * 4) * 0.3;

    // Poeira ao redor da câmera
    const arr = this.dust.geometry.attributes.position.array;
    const vc = camera.userData.vistaDe ?? camera.position, cx = vc.x, cz = vc.z;
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
