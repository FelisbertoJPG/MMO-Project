// AS REGRAS DO MUNDO ONLINE (24/11/2026) — o que o servidor CONFERE no que cada jogador diz,
// pelos MESMOS números do jogo: o balanceamento (`assets/balanco.json`, lido pelo `aplicarBalanco`
// do js/ficha.js), as armas (js/items.js) e a árvore (js/caminhos.js). Mudou o número no editor
// (o painel Balanceamento), a regra muda junto — relida a cada RELER_MS.
//
//   • O PASSO (`pos`): ninguém anda mais rápido que o mais rápido possível — a corrida com todos
//     os bônus da árvore, o rolamento, o dash — × FOLGA. Um BALDE de metros enche nessa velocidade
//     (cabe BALDE_S segundos dela: o atraso da rede junta recados); o `pos` que pede mais do que há
//     no balde é CORTADO no caminho: os outros (e o simulador, que confere o alcance do golpe pelo
//     boneco que vê) veem o boneco só até onde dava. Cair perto de uma FOGUEIRA (renascer, voltar
//     para casa) vale sempre.
//   • O GOLPE (`golpe`, o que vai ao simulador): o dano, o poise e a força contra escudo não passam
//     do máximo da arma que ele tem nas mãos (o `d`/`e` do último `pos`; antes do primeiro, a mais
//     forte), no nível dele, com TODOS os bônus juntos (o golpe forte, a força, a resina, a fúria, a
//     Emboscada, a fraqueza ao fogo); golpe de fogo vale também a bomba e a Seta de Fogo. Acima
//     disso, o golpe não chega.
//
// O que NÃO confere (precisaria o servidor rodar o combate — o "caminho 2"): o vigor, a velocidade
// do golpe, e o que o SIMULADOR faz com as próprias mãos (os golpes dele não passam por aqui).
// Só pega a trapaça GROSSEIRA; o jogador honesto nunca encosta nos tetos.
import fs from 'node:fs';
import path from 'node:path';
import { BALANCO, aplicarBalanco, bonusForcaDoNivel, ESCALA, GOLPE_FORTE, BUFF_DANO, FORCA_NA_BOMBA, ALCANCE_DO_ROLAMENTO } from './js/ficha.js';
import { ITEMS, UNARMED } from './js/items.js';
import * as Caminho from './js/caminhos.js';

const FOLGA = 1.25;            // a velocidade: 25% acima do máximo (o tranco do golpe recebido, o relógio da rede)
const BALDE_S = 4;             // s de velocidade máxima guardados no balde
const PERTO_DA_FOGUEIRA = 12;  // m: onde se acorda (3,2 m do fogo) + o espalhar (1,8 m) + folga
const FOLGA_DANO = 1.05;       // o dano: 5% acima do teto (e +1, o arredondamento de quem manda)
const NIVEIS_NA_SESSAO = 20;   // o nível é o da ENTRADA; quem sobe na fogueira não pode cair no teto
const NIVEL_DESCONHECIDO = 999;   // sem saber o nível (o Supabase não respondeu): o teto do save
const RELER_MS = 5000;
const TROCOU_MS = 3000;        // a arma de antes ainda vale (o golpe pode chegar antes do `pos` da troca)

// a árvore INTEIRA no máximo: os bônus mais altos que alguém pode ter
const TUDO = { v: 1, nos: new Proxy({}, { get: (_, k) => (typeof k === 'string' ? 999 : undefined) }), barra: [] };
const PASSO_MAX = Caminho.passo(TUDO) * Caminho.passoAposEsquiva(TUDO, 0);
const BONUS_MAX = BUFF_DANO.resina * BUFF_DANO.furia * Caminho.danoDaEmboscada(TUDO) * Caminho.fraquezaElemental(TUDO);
const SETA_MAX = Math.max(0, ...Object.values(Caminho.ATIVAS).map((a) => a.dano ?? 0)) * Caminho.fraquezaElemental(TUDO);
const ARMAS = Object.values(ITEMS).filter((w) => (w.type === 'weapon' || w.type === 'torch') && w.damage > 0);
const TETO_ANTIGO = { dano: 500, poise: 300, qn: 9, qd: 500 };   // o de antes (e o do simulador: rede/mundo.js)
/** A arma pelo id: as mãos nuas (null), a arma, null (não é arma: o escudo) ou undefined (o servidor não a conhece). */
const armaDe = (id) => (id == null ? UNARMED : !(id in ITEMS) ? undefined : ITEMS[id].damage > 0 && ITEMS[id].type !== 'consumable' ? ITEMS[id] : null);

/** As fogueiras do mapa ativo (as tags `[linha, coluna]` do `assets/mapa.json`, em metros, como o world.js). */
function lerFogueiras(raiz) {
  let S = 1.5, k = 4;   // world.js: `S` e `CELL = 4 * S`
  try {
    const w = fs.readFileSync(path.join(raiz, 'js', 'world.js'), 'utf8');
    S = Number(w.match(/export const S = ([\d.]+)/)?.[1]) || S;
    k = Number(w.match(/export const CELL = (\d+) \* S/)?.[1]) || k;
  } catch { /* os padrões */ }
  const CELL = k * S;
  // os padrões do world.js (BONFIRE_POS, CAMP_POS), e as tags do mapa por cima
  const marcos = { masmorra: [20, 7], acampamento: [16, 47.5] };
  try {
    const d = JSON.parse(fs.readFileSync(path.join(raiz, 'assets', 'mapa.json'), 'utf8'));
    Object.assign(marcos, d.marcos?.[d.ativo] ?? {});
  } catch { /* só os padrões */ }
  return Object.values(marcos)
    .filter((v) => Array.isArray(v) && v.length === 2 && v.every(Number.isFinite))
    .map(([l, c]) => ({ x: c * CELL, z: l * CELL }));
}

export function criarRegras(raiz) {
  const arqBalanco = path.join(raiz, 'assets', 'balanco.json');
  const fogueiras = lerFogueiras(raiz);
  let lidoEm = 0, versao = 0;

  /** O balanceamento do arquivo (relido quando muda: o dono mexe no editor com o mundo local ligado). */
  function balanco() {
    const agora = Date.now();
    if (agora - lidoEm < RELER_MS) return BALANCO;
    lidoEm = agora;
    try {
      const t = fs.statSync(arqBalanco).mtimeMs;
      if (t !== versao) { versao = t; aplicarBalanco(JSON.parse(fs.readFileSync(arqBalanco, 'utf8'))); }
    } catch { /* sem o arquivo: os padrões do ficha.js */ }
    return BALANCO;
  }

  /** A velocidade mais alta que o jogo deixa alguém andar (m/s), já com a folga. */
  function velocidadeMaxima() {
    const b = balanco();
    return FOLGA * Math.max(
      Math.max(b.andar_velocidade, b.corrida_velocidade) * PASSO_MAX,
      ALCANCE_DO_ROLAMENTO * b.rolamento_distancia / b.rolamento_duracao,
      ALCANCE_DO_ROLAMENTO * b.dash_distancia / b.dash_duracao,
    );
  }

  /**
   * Confere um `pos` de `j` (e anota a arma que ele tem nas mãos). Corta no lugar (`c.x`/`c.z`) o
   * passo grande demais e devolve o motivo; o que passa devolve null.
   */
  function passo(j, c, agora = Date.now()) {
    if (!c || typeof c !== 'object') return null;
    anotarArmas(j, c, agora);
    if (!Number.isFinite(c.x) || !Number.isFinite(c.z)) return null;   // torto: o `limparInstantaneo` de quem recebe descarta
    const vmax = velocidadeMaxima(), cheio = vmax * BALDE_S;
    const m = j.passo;
    if (!m) { j.passo = { x: c.x, z: c.z, t: agora, balde: cheio }; return null; }   // o primeiro: onde o save o pôs
    m.balde = Math.min(cheio, m.balde + vmax * Math.max(0, agora - m.t) / 1000);
    m.t = agora;
    const dx = c.x - m.x, dz = c.z - m.z, d = Math.hypot(dx, dz);
    if (d <= m.balde) { m.balde -= d; m.x = c.x; m.z = c.z; return null; }
    if (fogueiras.some((f) => Math.hypot(c.x - f.x, c.z - f.z) < PERTO_DA_FOGUEIRA)) { m.x = c.x; m.z = c.z; m.balde = cheio; return null; }
    // rápido demais: anda só o que o balde deixa (os outros veem o boneco lá; o resto chega depois, no ritmo certo)
    const f = m.balde / d;
    m.x += dx * f; m.z += dz * f; m.balde = 0;
    c.x = Math.round(m.x * 100) / 100; c.z = Math.round(m.z * 100) / 100;
    return `andou ${d.toFixed(1)} m de uma vez (cabiam ${(d * f).toFixed(1)})`;
  }

  function anotarArmas(j, c, agora) {
    if (!('d' in c) && !('e' in c)) return;
    const ids = [c.d ?? null, c.e ?? null];
    // arma que o servidor não conhece (o jogo novo chegou antes do servidor reiniciar): o teto antigo
    const desconhecida = ids.some((id) => armaDe(id) === undefined);
    const novas = desconhecida ? [] : ids.map(armaDe).filter(Boolean);
    const a = j.armas;
    if (a && a.desconhecida === desconhecida && a.agora.length === novas.length && a.agora.every((w, i) => w === novas[i])) return;
    j.armas = { agora: novas, antes: a?.agora ?? [], desde: agora, desconhecida };
  }

  /** O máximo que um golpe de `j` pode ter: { dano, poise, qn, qd }. */
  function teto(j, fogo, agora) {
    const a = j.armas;
    if (a?.desconhecida) return TETO_ANTIGO;
    const armas = !a ? ARMAS : agora - a.desde < TROCOU_MS ? [...a.agora, ...a.antes] : a.agora;
    const n = Number.isFinite(j.nivel) ? j.nivel + NIVEIS_NA_SESSAO : NIVEL_DESCONHECIDO;
    const forca = bonusForcaDoNivel(n);
    let dano = UNARMED.damage * GOLPE_FORTE.dano * BONUS_MAX, poise = (UNARMED.poise ?? 10) * GOLPE_FORTE.poise, qn = 0, qd = 0;
    for (const w of armas) {
      dano = Math.max(dano, w.damage * GOLPE_FORTE.dano * (1 + forca * (ESCALA[w.escala ?? 'E'] ?? 1)) * BONUS_MAX);
      poise = Math.max(poise, (w.poise ?? 10) * GOLPE_FORTE.poise);
      if (w.quebra) { qn = Math.max(qn, w.quebra.nivel); qd = Math.max(qd, w.quebra.dano * GOLPE_FORTE.quebra); }
    }
    if (fogo) {   // a bomba (combat.js: poise 60) e a Seta de Fogo (poise 20)
      dano = Math.max(dano, (ITEMS.firebomb?.damage ?? 0) * (1 + forca * FORCA_NA_BOMBA), SETA_MAX);
      poise = Math.max(poise, 60);
    }
    return { dano: dano * FOLGA_DANO + 1, poise: poise * FOLGA_DANO + 1, qn, qd: qd * FOLGA_DANO + 1 };
  }

  /** Confere um `golpe` de `j`: devolve o motivo de RECUSAR, ou null (passa). */
  function golpe(j, c, agora = Date.now()) {
    if (!c || typeof c !== 'object') return 'golpe torto';
    const t = teto(j, !!c.fogo, agora);
    if (Number.isFinite(c.dano) && c.dano > t.dano) return `dano ${c.dano} (o teto é ${Math.floor(t.dano)})`;
    if (Number.isFinite(c.poise) && c.poise > t.poise) return `poise ${c.poise} (o teto é ${Math.floor(t.poise)})`;
    if (Number.isFinite(c.qn) && c.qn > t.qn) return `força contra escudo ${c.qn} (o teto é ${t.qn})`;
    if (Number.isFinite(c.qd) && c.qd > t.qd) return `dano no escudo ${c.qd} (o teto é ${Math.floor(t.qd)})`;
    return null;
  }

  return { passo, golpe, velocidadeMaxima, teto, fogueiras };
}
