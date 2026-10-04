/**
 * **O que viaja entre jogadores** — o formato único de tudo que é online.
 *
 * Um INSTANTÂNEO é a fotografia de um jogador num momento: onde está, para onde
 * olha, que animação toca, o que tem nas mãos. É a mesma peça em três lugares:
 *
 *   • nível 1 — os FANTASMAS: cada um transmite o seu, os outros desenham;
 *   • nível 1 — o RASTRO da morte: os últimos segundos gravados em sequência,
 *     reproduzidos por quem toca a mancha de sangue;
 *   • nível 2/3 — o CO-OP/PvP: o boneco do outro jogador na sua tela é um
 *     `JogadorRemoto` (`js/remoto.js`) alimentado por estes mesmos instantâneos.
 *
 * O que chega da rede foi escrito por OUTRO cliente e não passou por banco,
 * policy nem tipo de coluna. Por isso tudo entra por `limparInstantaneo`, e o
 * que não passa é DESCARTADO, não corrigido: um número torto vira NaN na matriz
 * do boneco, e boneco com matriz NaN some sem erro nenhum (a lição está escrita
 * em `duel academy/web/js/mundovivo.js`).
 */
import { Assets } from '../assets.js';
import { ITEMS } from '../items.js';
import { corpoValido, corpoDe } from '../guerreiro.js';

/** Sobe quando o formato muda de um jeito que o cliente antigo leria errado. */
export const VERSAO = 1;

/**
 * Os tipos de recado no canal. Só `POS` é usado no nível 1; os outros estão
 * reservados aqui para o co-op não inventar nomes soltos depois.
 */
export const TIPO = {
  POS: 'pos',          // instantâneo de um jogador (fantasma / boneco remoto)
  // --- a sala (etapas 1 e 2: estar junto e duelar) ---
  OLA: 'ola',          // "estou aqui": {id, nome, mapa, v, rede?: {ips, porta}}
  CHEIA: 'cheia',      // anfitrião → intruso: a sala já tem dois
  TCHAU: 'tchau',      // saí da sala
  DUELO: 'duelo',      // {fase: 'convite' | 'aceito' | 'recusado' | 'fim', perdedor?}
  GOLPE_PVP: 'gpvp',   // atacante → vítima: {dano, poise, x, z, fogo} — a VÍTIMA decide (rolou? bloqueou?)
  COOP: 'coop',        // {fase: 'convite' | 'aceito' | 'recusado' | 'fim', motivo?} — quem CONVIDA é o dono do mundo
  // --- nível 2 (co-op, anfitrião no controle) ---
  ACAO: 'acao',        // convidado → anfitrião: "apertei ataque/rolamento" (para efeitos e som)
  GOLPE: 'golpe',      // convidado → anfitrião: "acertei o inimigo N" (o anfitrião aplica)
  DANO: 'dano',        // anfitrião → convidado: "o inimigo N te acertou"
  MUNDO: 'mundo',      // anfitrião → todos: estado dos inimigos (netId, pos, giro, anim, hp)
  EVENTO: 'evento',    // anfitrião → todos: porta aberta, baú, chefe vencido...
};

// Arredonda para o recado ficar curto (centímetro e centésimo de radiano bastam).
const r2 = (v) => Math.round(v * 100) / 100;

/** Fotografa o jogador local. */
export function instantaneo(player, id) {
  const m = player.model, inv = player.inv;
  const a = m.current;
  return {
    v: VERSAO, id,
    x: r2(player.pos.x), y: r2(player.pos.y), z: r2(player.pos.z), g: r2(player.facing),
    a: m.currentName ?? null,
    s: a ? r2(a.timeScale) : 1,
    t: a ? r2(a.time) : 0,
    d: inv.equipped.weapon ?? null,
    e: inv.equipped.left ?? null,
    st: player.state,
    h: r2(Math.max(0, player.hp / player.maxHp)),   // a barra do oponente no duelo
    c: corpoDe(m),   // o corpo (guerreiro.js): os outros desenham o mesmo
  };
}

/**
 * Confere um instantâneo cru. Devolve a versão limpa ou `null`.
 * `limites` = `{minX, maxX, minZ, maxZ}` do mapa (fora dele não existe lugar).
 * `meuId` descarta o meu próprio eco (uma segunda aba da mesma conta).
 */
export function limparInstantaneo(c, { limites = null, meuId = null } = {}) {
  if (!c || typeof c !== 'object' || c.v !== VERSAO) return null;
  const id = typeof c.id === 'string' ? c.id : '';
  if (!id || id.length > 64 || id === meuId) return null;
  // `Number.isFinite` sobre o valor CRU: `Number(null)` seria 0, um lugar
  // legítimo do mapa, e o boneco apareceria plantado lá sem reclamar.
  for (const k of ['x', 'y', 'z', 'g', 's', 't']) if (!Number.isFinite(c[k])) return null;
  if (Math.abs(c.y) > 100 || Math.abs(c.s) > 10 || c.t < 0 || c.t > 600) return null;
  if (limites && (c.x < limites.minX || c.x > limites.maxX || c.z < limites.minZ || c.z > limites.maxZ)) return null;
  const clip = typeof c.a === 'string' && c.a.length <= 48 && Assets.clips[c.a] ? c.a : null;
  const item = (v, tipos) => (typeof v === 'string' && ITEMS[v] && tipos.includes(ITEMS[v].type) ? v : null);
  return {
    id, x: c.x, y: c.y, z: c.z, g: c.g, a: clip, s: c.s, t: c.t,
    d: item(c.d, ['weapon']), e: item(c.e, ['shield', 'torch']),
    st: typeof c.st === 'string' && c.st.length <= 24 ? c.st : 'free',
    h: Number.isFinite(c.h) ? Math.min(1, Math.max(0, c.h)) : null,   // opcional
    c: corpoValido(c.c) ? c.c : 'antigo',   // opcional: sem ele (rastro antigo), o boneco antigo; senão o código da armadura
  };
}

// ------------------------------------------------------------ o rastro

/** Quadros por segundo do rastro gravado (e do replay da mancha de sangue). */
export const RASTRO_HZ = 10;
/** Quantos segundos antes da morte ficam gravados. */
export const RASTRO_SEG = 5;

/**
 * Compacta uma sequência de instantâneos para o banco: as mãos uma vez só
 * (`d`, `e`) e cada quadro como `[x, y, z, giro, clipe, velocidade]`.
 */
export function compactarRastro(lista) {
  const ult = lista[lista.length - 1];
  return { v: VERSAO, d: ult?.d ?? null, e: ult?.e ?? null, q: lista.map((i) => [i.x, i.y, i.z, i.g, i.a, i.s]) };
}

/** O inverso, já passando cada quadro por `limparInstantaneo`. */
export function expandirRastro(r, limites) {
  if (!r || typeof r !== 'object' || r.v !== VERSAO || !Array.isArray(r.q)) return [];
  const saida = [];
  for (const q of r.q.slice(0, RASTRO_HZ * RASTRO_SEG * 2)) {
    if (!Array.isArray(q)) continue;
    const [x, y, z, g, a, s] = q;
    const limpo = limparInstantaneo({ v: VERSAO, id: 'rastro', x, y, z, g, a, s, t: 0, d: r.d, e: r.e }, { limites });
    if (limpo) saida.push(limpo);
  }
  return saida;
}

// ------------------------------------------------------------ o co-op: o MUNDO do anfitrião

const PARTES_DA_POSE = ['andar', 'pescocoX', 'pescocoY', 'cabecaX', 'boca', 'asa', 'agacha', 'altura'];
const NET_ID = /^(e\d{1,3}|carrasco|wyrm|lacaio\d{1,4})$/;

/**
 * O retrato de um inimigo para o `TIPO.MUNDO`: um array curto, porque vão
 * vinte deles dez vezes por segundo.
 * `[netId, x, y, z, giro, clipe, velocidade, vida, estado, flags, tempoDoEstado, extra]`
 * flags: 1 = ativo, 2 = morto, 4 = visível. `extra` só no dragão (a pose dele
 * não é de clipe: são as peças girando — ver `Dragao.animar`).
 */
export function retratoDoInimigo(e) {
  const raiz = e.model?.root ?? e.root;
  const flags = (e.active ? 1 : 0) | (e.dead ? 2 : 0) | (raiz?.visible ? 4 : 0);
  const atual = e.model?.current;
  let extra = null;
  if (e.ultimaAnim) {
    extra = { rz: r2(e.root.rotation.z), br: Math.round(e.brasa?.intensity ?? 0), anim: PARTES_DA_POSE.map((k) => r2(e.ultimaAnim[k] ?? 0)) };
  }
  return [e.netId, r2(e.pos.x), r2(e.pos.y), r2(e.pos.z), r2(e.facing), e.model?.currentName ?? null,
    atual ? r2(atual.timeScale) : 1, Math.round(e.hp), e.state, flags, r2(e.stateT ?? 0), extra];
}

/** Confere um retrato que chegou. Devolve `{netId, x, y, z, g, a, s, hp, st, ativo, morto, visivel, t, extra}` ou null. */
export function lerRetrato(q, limites = null) {
  if (!Array.isArray(q) || q.length < 11) return null;
  const [netId, x, y, z, g, a, s, hp, st, flags, t, extra] = q;
  if (typeof netId !== 'string' || !NET_ID.test(netId)) return null;
  if (![x, y, z, g, s, hp, flags, t].every(Number.isFinite) || Math.abs(y) > 100 || hp < -1e4 || hp > 1e5) return null;
  if (limites && (x < limites.minX - 50 || x > limites.maxX + 50 || z < limites.minZ - 50 || z > limites.maxZ + 50)) return null;
  const r = {
    netId, x, y, z, g, s, hp, t,
    a: typeof a === 'string' && a.length <= 48 && Assets.clips[a] ? a : null,
    st: typeof st === 'string' && st.length <= 16 ? st : 'idle',
    ativo: !!(flags & 1), morto: !!(flags & 2), visivel: !!(flags & 4),
    extra: null,
  };
  if (extra && typeof extra === 'object' && Array.isArray(extra.anim) && extra.anim.length === PARTES_DA_POSE.length && extra.anim.every(Number.isFinite)) {
    r.extra = { rz: Number.isFinite(extra.rz) ? extra.rz : 0, br: Number.isFinite(extra.br) ? extra.br : 0,
      anim: Object.fromEntries(PARTES_DA_POSE.map((k, i) => [k, extra.anim[i]])) };
  }
  return r;
}
