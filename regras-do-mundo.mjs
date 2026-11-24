// AS REGRAS DO MUNDO ONLINE — o que o servidor CONFERE no que cada jogador diz, pelos MESMOS
// números do jogo: o balanceamento (`assets/balanco.json`, lido pelo `aplicarBalanco` do js/ficha.js),
// as armas (js/items.js), a tabela dos golpes (js/ataques.js) e a árvore (js/caminhos.js). Mudou o
// número no editor (o painel Balanceamento), a regra muda junto — relida a cada RELER_MS.
//
// 24/11/2026, o CAMINHO 1:
//   • O PASSO (`pos`): ninguém anda mais rápido que o mais rápido possível — a corrida com todos
//     os bônus da árvore, o rolamento, o dash — × FOLGA. Um BALDE de metros enche nessa velocidade
//     (cabe BALDE_S segundos dela: o atraso da rede junta recados); o `pos` que pede mais do que há
//     no balde é CORTADO no caminho: os outros (e o simulador, que confere o alcance do golpe pelo
//     boneco que vê) veem o boneco só até onde dava. Cair perto de uma FOGUEIRA (renascer, voltar
//     para casa) vale sempre.
//   • O TETO DO GOLPE (`golpe`, o que vai ao simulador): o dano, o poise e a força contra escudo
//     não passam do máximo da arma que ele tem nas mãos (o `d`/`e` do último `pos`; antes do
//     primeiro, a mais forte), no nível dele, com TODOS os bônus juntos.
//
// 24/11/2026, a ETAPA 1 do caminho 2 (o VIGOR e o RITMO): o jogo manda quantos golpes (`n`) e
// rolamentos (`r`) já começou, no instantâneo, e cada golpe leva o número do seu ataque (`n`).
//   • O VIGOR: o servidor leva a conta do vigor de cada um SEMPRE pelo lado mais generoso (o máximo
//     do nível + NIVEIS_NA_SESSAO e da árvore inteira, a recuperação com dois anéis, a comida e a
//     árvore, e o golpe e o rolamento mais baratos) — o vigor de verdade nunca passa do daqui. Se
//     nem assim havia o mínimo para o golpe (`golpe_vigor_minimo`), o ataque NÃO VALE.
//   • O RITMO: fichas que voltam no ritmo do golpe mais rápido da arma nas mãos (× FOLGA_RITMO, até
//     FICHAS_MAX juntas); ataque sem ficha NÃO VALE.
//   • O ACERTO: só passa golpe de um ataque que valeu, ainda em curso, e uma vez por inimigo.
//   • A BOMBA e a SETA (`pj`): o teto e o ritmo delas.
// O rolamento só GASTA (não é barrado: o "Guarda Firme" devolve 1 de vigor que daqui não se vê).
//
// O que NÃO confere ainda (a etapa 3: os inimigos no servidor): o que o SIMULADOR faz com as
// próprias mãos (os golpes dele não passam por aqui), a vida de cada um, e o vigor gasto correndo,
// bloqueando ou furtivo (só deixa o de verdade mais baixo que o daqui: nunca acusa ninguém).
import fs from 'node:fs';
import path from 'node:path';
import {
  BALANCO, aplicarBalanco, bonusForcaDoNivel, vigorDoNivel, ESCALA,
  GOLPE_FORTE, BUFF_DANO, FORCA_NA_BOMBA, ALCANCE_DO_ROLAMENTO, FOLEGO_DA_COMIDA,
} from './js/ficha.js';
import { ITEMS, UNARMED, GOLPE_DA_TOCHA } from './js/items.js';
import { ATTACKS } from './js/ataques.js';
import * as Caminho from './js/caminhos.js';
import { CELL, lerArquivoDoMapa, lugaresDasFogueiras } from './js/mapa-logico.js';

const FOLGA = 1.25;            // a velocidade: 25% acima do máximo (o tranco do golpe recebido, o relógio da rede)
const BALDE_S = 4;             // s de velocidade máxima guardados no balde
const PERTO_DA_FOGUEIRA = 12;  // m: onde se acorda (3,2 m do fogo) + o espalhar (1,8 m) + folga
const FOLGA_DANO = 1.05;       // o dano: 5% acima do teto (e +1, o arredondamento de quem manda)
const NIVEIS_NA_SESSAO = 20;   // o nível é o da ENTRADA; quem sobe na fogueira não pode cair no teto
const NIVEL_DESCONHECIDO = 999;   // sem saber o nível (o Supabase não respondeu): o teto do save
const RELER_MS = 5000;
const TROCOU_MS = 3000;        // a arma de antes ainda vale (o golpe pode chegar antes do `pos` da troca)
const ANEIS = 2;               // os dedos (inventory.js: `rings: [null, null]`)
const FOLGA_RITMO = 2;         // o ritmo: o dobro do golpe mais rápido da arma (a rede junta e atrasa recados)
const FICHAS_MAX = 4;          // golpes seguidos que o ritmo deixa passar de uma vez
const ATAQUES_EM_CURSO = 2;    // golpe de um ataque até 2 números atrás (o `pos` do ataque novo passa na frente)
const ACERTOS_GUARDADOS = 64;
const TETO_ANTIGO = { dano: 500, poise: 300, qn: 9, qd: 500 };   // o de antes (e o do simulador: rede/mundo.js)

// a árvore INTEIRA no máximo: os bônus mais altos (e os descontos maiores) que alguém pode ter
const TUDO = { v: 1, nos: new Proxy({}, { get: (_, k) => (typeof k === 'string' ? 999 : undefined) }), barra: [] };
const PASSO_MAX = Caminho.passo(TUDO) * Caminho.passoAposEsquiva(TUDO, 0);
const BONUS_MAX = BUFF_DANO.resina * BUFF_DANO.furia * Caminho.danoDaEmboscada(TUDO) * Caminho.fraquezaElemental(TUDO);
const SETA = Object.values(Caminho.ATIVAS).find((a) => a.dano > 0) ?? { dano: 0, recarga: 1 };
const SETA_MAX = SETA.dano * Caminho.fraquezaElemental(TUDO);
const CONSUMO_MIN = Caminho.consumoDeVigor(TUDO);
const VIGOR_EXTRA_MAX = Caminho.vigorExtra(TUDO);
const GOLPE_RAPIDO_MAX = Caminho.golpeRapido(TUDO);
const ANEL_DE_FOLEGO = Math.max(0, ...Object.values(ITEMS).map((i) => i.effect?.staminaRegen ?? 0));
const ARMAS = Object.values(ITEMS).filter((w) => (w.type === 'weapon' || w.type === 'torch') && w.damage > 0);
/** A arma pelo id: as mãos nuas (null), a arma, null (não é arma: o escudo) ou undefined (o servidor não a conhece). */
const armaDe = (id) => (id == null ? UNARMED : !(id in ITEMS) ? undefined : ITEMS[id].damage > 0 && ITEMS[id].type !== 'consumable' ? ITEMS[id] : null);
/** A tocha como ARMA de golpe (o player.js a monta assim: o jab dela). */
const TOCHA = { ...ITEMS.torch, ...GOLPE_DA_TOCHA, light: ['jab'], heavy: null };
const paraGolpe = (w) => (w === ITEMS.torch ? TOCHA : w);

/** As fogueiras do mapa ativo (as tags `[linha, coluna]` do `assets/mapa.json`, em metros, como o world.js). */
function lerFogueiras(raiz) {
  // as fogueiras pela conta do MAPA LÓGICO (o padrão, e a tag do mapa por cima), e o `inicio`
  let marcos = {};
  try { marcos = lerArquivoDoMapa(JSON.parse(fs.readFileSync(path.join(raiz, 'assets', 'mapa.json'), 'utf8'))).marcos; } catch { /* só os padrões */ }
  const lugares = lugaresDasFogueiras(marcos).map(({ x, z }) => ({ x, z }));
  const i = marcos.inicio;
  if (Array.isArray(i) && i.length === 2 && i.every(Number.isFinite)) lugares.push({ x: i[1] * CELL, z: i[0] * CELL });
  return lugares;
}

/** O intervalo mais curto entre dois golpes da arma `w` (s): o golpe mais rápido, emendado o quanto antes (`solta`). */
function menorIntervalo(w, b) {
  let menor = Infinity;
  const golpes = [...(w.light ?? []).map((k) => [k, false]), ...(w.heavy ? [[w.heavy, true]] : [])];
  for (const [chave, pesado] of golpes) {
    const s = ATTACKS[chave];
    if (!s) continue;
    const from = s.from ?? 0, seg = s.to - from;
    const vel = (w.speed ?? 1) * (pesado ? b.pesado_velocidade : 1) * b.golpe_velocidade * GOLPE_RAPIDO_MAX;
    const solta = w.terminaGolpe ? 1 : Math.min(1, (s.hit[1] - from) / seg + 0.08);   // player.js `solta`
    menor = Math.min(menor, (seg / vel) * solta);
  }
  return menor;
}

/**
 * As regras do mundo. `avisar(j, motivo)`: quem passou de uma regra que não tem resposta na hora
 * (o ataque que não valeu é descoberto no `pos`; os golpes dele são recusados depois).
 */
export function criarRegras(raiz, { avisar = () => {} } = {}) {
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

  const nivelDe = (j) => (Number.isFinite(j.nivel) ? j.nivel + NIVEIS_NA_SESSAO : NIVEL_DESCONHECIDO);

  /** A velocidade mais alta que o jogo deixa alguém andar (m/s), já com a folga. */
  function velocidadeMaxima() {
    const b = balanco();
    return FOLGA * Math.max(
      Math.max(b.andar_velocidade, b.corrida_velocidade) * PASSO_MAX,
      ALCANCE_DO_ROLAMENTO * b.rolamento_distancia / b.rolamento_duracao,
      ALCANCE_DO_ROLAMENTO * b.dash_distancia / b.dash_duracao,
    );
  }

  // ------------------------------------------------------------ o passo

  /**
   * Confere um `pos` de `j`: anota a arma nas mãos e os golpes e rolamentos que ele começou, e corta
   * no lugar (`c.x`/`c.z`) o passo grande demais — devolve o motivo do corte, ou null.
   */
  function passo(j, c, agora = Date.now()) {
    if (!c || typeof c !== 'object') return null;
    anotarArmas(j, c, agora);
    if (Number.isInteger(c.n)) registrarAtaques(j, c.n, agora);
    if (Number.isInteger(c.r)) registrarRolamentos(j, c.r, agora);
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
    // quem golpeia é a mão DIREITA (o player.js: `this.weapon`; sem arma, os punhos) — e a TOCHA, em
    // qualquer das mãos (o golpe dela). O escudo da esquerda não ataca.
    const direita = armaDe(c.d ?? null);
    // arma que o servidor não conhece (o jogo novo chegou antes do servidor reiniciar): o teto antigo
    const desconhecida = direita === undefined;
    const novas = desconhecida ? [] : [direita ?? UNARMED];
    if (!desconhecida && (c.d === 'torch' || c.e === 'torch') && !novas.includes(ITEMS.torch)) novas.push(ITEMS.torch);
    const a = j.armas;
    if (a && a.desconhecida === desconhecida && a.agora.length === novas.length && a.agora.every((w, i) => w === novas[i])) return;
    j.armas = { agora: novas, antes: a?.agora ?? [], desde: agora, desconhecida };
  }

  /** As armas com que `j` pode estar golpeando agora (a de antes, logo depois de trocar; sem saber, todas). */
  function armasNasMaos(j, agora) {
    const a = j.armas;
    if (!a || a.desconhecida) return [...ARMAS, UNARMED];
    return agora - a.desde < TROCOU_MS ? [...a.agora, ...a.antes] : a.agora;
  }

  // ------------------------------------------------------------ o vigor e o ritmo

  /** O vigor de `j` pelo lado generoso, já com o que voltou até `agora`. */
  function vigorDe(j, agora) {
    const b = balanco();
    const max = vigorDoNivel(nivelDe(j)) + VIGOR_EXTRA_MAX;
    const v = (j.vigor ??= { v: max, t: agora, espera: 0 });
    const desde = Math.max(v.t, v.espera);
    if (agora > desde) {
      const volta = b.vigor_recupera * Caminho.recuperaVigor(TUDO) * (1 + ANEIS * ANEL_DE_FOLEGO + FOLEGO_DA_COMIDA);
      v.v = Math.min(max, v.v + volta * (agora - desde) / 1000);
    }
    v.v = Math.min(v.v, max);
    v.t = Math.max(v.t, agora);
    return v;
  }

  /** O pos (ou o golpe) disse que `j` já começou `n` golpes: confere o vigor e o ritmo de cada um novo. */
  function registrarAtaques(j, n, agora) {
    const g = (j.golpes ??= { n: null, fichas: FICHAS_MAX, t: agora, invalidos: new Set(), acertos: new Set() });
    // o primeiro que se vê (ou o jogo recarregou e o contador voltou): é só a base
    if (g.n === null || n < g.n) { g.n = n; g.t = agora; return; }
    if (n === g.n) return;
    const b = balanco(), armas = armasNasMaos(j, agora).map(paraGolpe);
    const intervalo = Math.min(...armas.map((w) => menorIntervalo(w, b)));
    const custo = Math.min(...armas.map((w) => w.stamina ?? 0)) * b.golpe_vigor * CONSUMO_MIN;
    g.fichas = Math.min(FICHAS_MAX, g.fichas + ((agora - g.t) / 1000) * FOLGA_RITMO / intervalo);
    g.t = agora;
    for (let num = g.n + 1; num <= n && num <= g.n + 20; num++) {
      const v = vigorDe(j, agora);
      const semVigor = v.v < Math.max(b.golpe_vigor_minimo, 0.01);
      const depressa = g.fichas < 1;
      g.fichas = Math.max(0, g.fichas - 1);
      v.v = Math.max(0, v.v - custo);
      v.espera = Math.max(v.espera, agora + b.vigor_espera_golpe * 1000);
      if (semVigor || depressa) {
        g.invalidos.add(num);
        avisar(j, semVigor ? `golpe ${num} sem vigor` : `golpe ${num} mais rápido que a arma deixa`);
      }
    }
    g.n = n;
    for (const x of g.invalidos) if (x < n - 10) g.invalidos.delete(x);
  }

  /** …e `r` rolamentos: cada um novo só GASTA vigor (não é barrado: ver o cabeçalho). */
  function registrarRolamentos(j, r, agora) {
    const o = (j.rolou ??= { r: null });
    if (o.r === null || r < o.r) { o.r = r; return; }
    if (r === o.r) return;
    const b = balanco();
    const custo = Math.min(b.rolamento_vigor, b.dash_vigor) * Caminho.custoDoRolamento(TUDO) * CONSUMO_MIN;
    for (let k = o.r + 1; k <= r && k <= o.r + 20; k++) {
      const v = vigorDe(j, agora);
      v.v = Math.max(0, v.v - custo);
      v.espera = Math.max(v.espera, agora + b.rolamento_espera * 1000);
    }
    o.r = r;
  }

  // ------------------------------------------------------------ o golpe

  /** O máximo que um golpe de PERTO de `j` pode ter: { dano, poise, qn, qd }. */
  function teto(j, agora) {
    if (j.armas?.desconhecida) return TETO_ANTIGO;
    const armas = armasNasMaos(j, agora);
    const forca = bonusForcaDoNivel(nivelDe(j));
    let dano = 0, poise = 0, qn = 0, qd = 0;
    for (const w of armas) {
      dano = Math.max(dano, w.damage * GOLPE_FORTE.dano * (1 + forca * (ESCALA[w.escala ?? 'E'] ?? 1)) * BONUS_MAX);
      poise = Math.max(poise, (paraGolpe(w).poise ?? 10) * GOLPE_FORTE.poise);
      if (w.quebra) { qn = Math.max(qn, w.quebra.nivel); qd = Math.max(qd, w.quebra.dano * GOLPE_FORTE.quebra); }
    }
    return { dano: dano * FOLGA_DANO + 1, poise: poise * FOLGA_DANO + 1, qn, qd: qd * FOLGA_DANO + 1 };
  }

  /** O teto da BOMBA e da SETA, e o ritmo delas (golpes por segundo e de uma vez). */
  function tetoDoProjetil(j, tipo) {
    const forca = bonusForcaDoNivel(nivelDe(j));
    if (tipo === 'bomba') return { dano: (ITEMS.firebomb?.damage ?? 0) * (1 + forca * FORCA_NA_BOMBA) * FOLGA_DANO + 1, poise: 61, porSeg: 4, deUmaVez: 8 };
    return { dano: SETA_MAX * FOLGA_DANO + 1, poise: 21, porSeg: FOLGA_RITMO / Math.max(0.2, SETA.recarga ?? 1), deUmaVez: 2 };
  }

  function projetil(j, c, agora) {
    const t = tetoDoProjetil(j, c.pj);
    if (Number.isFinite(c.dano) && c.dano > t.dano) return `${c.pj}: dano ${c.dano} (o teto é ${Math.floor(t.dano)})`;
    if (Number.isFinite(c.poise) && c.poise > t.poise) return `${c.pj}: poise ${c.poise} (o teto é ${t.poise - 1})`;
    if ((c.qn ?? 0) > 0 || (c.qd ?? 0) > 0) return `${c.pj}: força contra escudo`;
    const r = ((j.projeteis ??= {})[c.pj] ??= { fichas: t.deUmaVez, t: agora });
    r.fichas = Math.min(t.deUmaVez, r.fichas + ((agora - r.t) / 1000) * t.porSeg);
    r.t = agora;
    if (r.fichas < 1) return `${c.pj} mais depressa do que dá`;
    r.fichas -= 1;
    return null;
  }

  /** Confere um `golpe` de `j`: devolve o motivo de RECUSAR, ou null (passa). */
  function golpe(j, c, agora = Date.now()) {
    if (!c || typeof c !== 'object') return 'golpe torto';
    if (c.pj === 'bomba' || c.pj === 'seta') return projetil(j, c, agora);
    if (c.pj != null) return `projétil desconhecido (${String(c.pj).slice(0, 16)})`;
    // o golpe de perto é de um ATAQUE: o número dele, que valeu, ainda em curso, uma vez por inimigo
    if (!Number.isInteger(c.n) || c.n < 0) return 'golpe sem o número do ataque';
    registrarAtaques(j, c.n, agora);
    const g = j.golpes;
    if (g.invalidos.has(c.n)) return `golpe do ataque ${c.n}, que não valeu`;
    if (c.n < g.n - ATAQUES_EM_CURSO) return `golpe do ataque ${c.n}, que já acabou (o último é ${g.n})`;
    const chave = `${c.n}:${c.id}`;
    if (g.acertos.has(chave)) return `o ataque ${c.n} acertou o mesmo inimigo de novo`;
    g.acertos.add(chave);
    if (g.acertos.size > ACERTOS_GUARDADOS) g.acertos.delete(g.acertos.values().next().value);
    const t = teto(j, agora);
    if (Number.isFinite(c.dano) && c.dano > t.dano) return `dano ${c.dano} (o teto é ${Math.floor(t.dano)})`;
    if (Number.isFinite(c.poise) && c.poise > t.poise) return `poise ${c.poise} (o teto é ${Math.floor(t.poise)})`;
    if (Number.isFinite(c.qn) && c.qn > t.qn) return `força contra escudo ${c.qn} (o teto é ${t.qn})`;
    if (Number.isFinite(c.qd) && c.qd > t.qd) return `dano no escudo ${c.qd} (o teto é ${Math.floor(t.qd)})`;
    return null;
  }

  return { passo, golpe, velocidadeMaxima, teto, tetoDoProjetil, vigorDe, fogueiras, menorIntervalo: (w) => menorIntervalo(paraGolpe(w), balanco()) };
}
