/**
 * OS CAMINHOS (D28, 21/11/2026; a BETA da árvore livre): o que os cards da página dos 3
 * começos (a face "Caminhos" da tecla K) FAZEM no jogo.
 *
 * A árvore se desenha no Editor de Árvore (`planejamento/arvores/resumo-3-comecos.json`) e
 * vira catálogo pelo `ferramentas/habilidades/gerar-catalogo.mjs`: o id de cada card é
 * `caminho.<nome com que o card nasceu, sem acento>` (o editor mantém o id ao renomear: o efeito e
 * os pontos seguem; apagar o card devolve os pontos).
 * O que o card faz mora AQUI, pelo id. Card sem linha em EFEITOS aceita ponto, mas a tela
 * avisa "ainda sem efeito no jogo".
 *
 * A MOBILIDADE é do VIGOR e da recuperação dele: a Furtividade (a ativa dos Passos Leves) gasta
 * vigor enquanto dura (21/11/2026).
 *
 * Os começos trancam o que antes todo mundo tinha: o golpe pesado (Maestria em Batalha) e a
 * BARRA (Éter). O ROLAMENTO é de todos, mas lento e custoso (o balanceamento, ficha.js BALANCO):
 * a Esquiva só o barateia (21/11/2026). A barra é UMA SÓ: o caminho muda
 * o que ela é — Éter (enche lutando) ou, com o Conhecimento Arcano, Mana (enche sozinha).
 * Equipamento: as armas de duas mãos pedem Armas Pesadas; a armadura de placas, a Couraça.
 */
import { ETER_MAX } from './ficha.js';

export const PREFIXO = 'caminho.';
const tem = (h, nome) => (h?.nos?.[PREFIXO + nome] ?? 0) > 0;
// o CUSTO por ponto de cada card (do catálogo: `definirCustos`, ArvoreUI.montar), para contar os
// níveis dos cards de mais de 1 ponto (os pontos gravados são níveis × custo)
const CUSTOS = new Map();
export function definirCustos(nos) { for (const n of nos ?? []) CUSTOS.set(n.id, n.custo || 1); }
const nivel = (h, nome) => Math.floor((h?.nos?.[PREFIXO + nome] ?? 0) / (CUSTOS.get(PREFIXO + nome) ?? 1));

/** O que cada card faz no jogo (a linha "No jogo:" da tela K). */
export const EFEITOS = {
  maestria_em_batalha: 'Libera o golpe pesado (F).',
  vigor: '+10 de vigor máximo.',
  resistencia: '+3% de defesa (a única resistência que o jogo tem hoje).',
  bloqueio_firme: 'Bloquear gasta 20% menos vigor.',
  muralha: 'Golpes pesados não quebram mais a sua guarda.',
  escudo_drenador: 'Cada golpe bloqueado devolve 3 de vida.',
  armas_pesadas: 'Libera empunhar as armas de duas mãos.',
  couraca: 'Libera vestir a armadura de placas.',
  eter: 'Libera a barra de Éter (100): enche batendo, apanhando e bloqueando; fora de combate, esvazia.',
  conhecimento_do_eter: '+20 na barra.',
  fluxo_do_eter: 'O Éter enche 25% mais rápido.',
  conhecimento_elemental: 'Golpe de fogo em quem é fraco a fogo (os esqueletos) causa 15% a mais. (A fraqueza ainda não aparece na tela.)',
  maestria_elemental: 'A SETA DE FOGO: ponha numa vaga (teclas 1 a 4); gasta 25 da barra. E abre a Arte Arcana (o círculo dos elementos).',
  conhecimento_arcano: 'A barra vira MANA: +100, enche sozinha (5 por segundo) e não com golpes. Descansar na fogueira a enche.',
  // a MOBILIDADE (a Esquiva; os ids ficaram os de quando os cards nasceram)
  furtividade_e_esquiva: '+10% de recuperação de vigor.',
  passo_ligeiro: 'Anda e corre 15% mais rápido.',
  folego_leve: 'Tudo que gasta vigor gasta 20% menos (golpe, corrida, rolamento, bloqueio).',
  passos_leves: 'Libera a FURTIVIDADE: ponha numa vaga (teclas 1 a 4), que liga e desliga. Furtivo, você vira uma sombra, o nome some para os outros jogadores, os passos não fazem som e o inimigo só te percebe dentro da área da furtividade; gasta vigor enquanto dura (sem vigor, acaba). Atacar, apanhar ou outra habilidade tiram da furtividade; rolar, não. E agachado (tecla Z), os inimigos te percebem 15% mais perto.',
  golpe_pelas_costas: 'Sair da furtividade (levantar, atacar ou rolar agachado): o golpe seguinte sai 10% mais rápido.',
  emboscada: 'Sair da furtividade (a Furtividade ou o agachar): o golpe seguinte causa +15% de dano. Nível 1 e 2: a área em que te percebem na Furtividade encolhe 15% cada. Nível 3: esse golpe faz o alvo SANGRAR.',
  rolamento: 'O rolamento gasta 10% menos vigor.',   // o card Esquiva (nasceu "Rolamento")
  nova_habilidade: '+15% de recuperação de vigor.',   // a Recuperação de Vigor (nasceu "Nova habilidade")
  passo_de_esquiva: 'O rolamento gasta 10% menos vigor por ponto.',   // a Esquiva Avançada
  esquiva_perfeita: 'Nível 1: o rolamento vira um DASH (rápido, sem rolar no chão) e gasta 15% menos vigor. Nível 2: +10% de velocidade de movimento. Nível 3: +10% de velocidade por 2 s depois de esquivar.',   // o Mestre da Esquiva
};
export const efeitoDe = (id) => (id.startsWith(PREFIXO) ? EFEITOS[id.slice(PREFIXO.length)] ?? null : null);

// ---- as travas ----
export const podeGolpePesado = (h) => tem(h, 'maestria_em_batalha');
export const podeDuasMaos = (h) => tem(h, 'armas_pesadas');
export const podePlacas = (h) => tem(h, 'couraca');
/** A Arte Arcana (o círculo dos elementos) abre com a Maestria Elemental. */
export const abreArteArcana = (h) => tem(h, 'maestria_elemental');

// ---- a barra única ----
export const MANA_EXTRA = 100;
export const MANA_POR_SEG = 5;
/** O que a barra é: null (sem barra), 'eter' (enche lutando) ou 'mana' (enche sozinha). */
export const modoDaBarra = (h) => (!tem(h, 'eter') ? null : tem(h, 'conhecimento_arcano') ? 'mana' : 'eter');
export const barraMax = (h) => ETER_MAX + (tem(h, 'conhecimento_do_eter') ? 20 : 0) + (modoDaBarra(h) === 'mana' ? MANA_EXTRA : 0);
export const fluxoDoEter = (h) => (tem(h, 'fluxo_do_eter') ? 1.25 : 1);

// ---- os números ----
export const vigorExtra = (h) => (tem(h, 'vigor') ? 10 : 0);
export const defesaExtra = (h) => (tem(h, 'resistencia') ? 0.03 : 0);
/** × na velocidade de andar e correr: o Passo Ligeiro (+15%) e o nível 2 do Mestre da Esquiva (+10%). */
export const passo = (h) => (tem(h, 'passo_ligeiro') ? 1.15 : 1) * (nivel(h, 'esquiva_perfeita') >= 2 ? 1.1 : 1);
export const custoDoBloqueio = (h) => (tem(h, 'bloqueio_firme') ? 0.8 : 1);
export const guardaFirme = (h) => tem(h, 'muralha');
export const vidaPorBloqueio = (h) => (tem(h, 'escudo_drenador') ? 3 : 0);
export const fraquezaElemental = (h) => (tem(h, 'conhecimento_elemental') ? 1.15 : 1);

// ---- a MOBILIDADE ----
/** × em TODO vigor gasto (golpe, corrida, rolamento, bloqueio): o Fôlego Leve. */
export const consumoDeVigor = (h) => (tem(h, 'folego_leve') ? 0.8 : 1);
/** × na recuperação do vigor: a raiz (+10%) e a Recuperação de Vigor (+15%). */
export const recuperaVigor = (h) => 1 + (tem(h, 'furtividade_e_esquiva') ? 0.1 : 0) + (tem(h, 'nova_habilidade') ? 0.15 : 0);
/** × no vigor do rolamento: a Esquiva (−10%), a Esquiva Avançada (−10% por nível) e o Mestre da Esquiva (−15%). */
export const custoDoRolamento = (h) => Math.max(0.1, 1 - (tem(h, 'rolamento') ? 0.1 : 0) - 0.1 * nivel(h, 'passo_de_esquiva') - (tem(h, 'esquiva_perfeita') ? 0.15 : 0));
/** O Mestre da Esquiva: o rolamento vira um DASH (o tempo, a distância e a invulnerabilidade: `dash_*` do balanceamento). */
export const rolamentoViraDash = (h) => tem(h, 'esquiva_perfeita');
/** O nível 3 do Mestre da Esquiva: +10% de velocidade por `seg` depois de esquivar (`t` = s desde o fim da esquiva). */
export const APOS_ESQUIVA = { mult: 1.1, seg: 2 };
export const passoAposEsquiva = (h, t) => (t >= 0 && t < APOS_ESQUIVA.seg && nivel(h, 'esquiva_perfeita') >= 3 ? APOS_ESQUIVA.mult : 1);
/**
 * AGACHAR (de todos, tecla Z): o inimigo só percebe o jogador a esta fração da distância de
 * sempre (`Enemy.updateAI`, pelo `alvo.furtividade`); os Passos Leves tiram mais 15%.
 */
export const AGACHADO_PERCEBE = 0.6, AGACHADO_PASSO = 0.45;
export const furtividade = (h, agachado) => (agachado ? AGACHADO_PERCEBE * (tem(h, 'passos_leves') ? 0.85 : 1) : 1);
/**
 * A FURTIVIDADE (a ativa dos Passos Leves): o inimigo só percebe o jogador furtivo dentro da ÁREA
 * (`furtividade_area` do balanceamento, em metros), × esta conta: a Emboscada (níveis 1 e 2) a encolhe 15% cada.
 */
export const areaDaFurtividade = (h) => 1 - 0.15 * Math.min(2, nivel(h, 'emboscada'));
/** SAIR DA FURTIVIDADE vale para o golpe seguinte, até esta janela (s). */
export const JANELA_DA_SAIDA = 3;
export const golpeRapido = (h) => (tem(h, 'golpe_pelas_costas') ? 1.1 : 1);
/** A Emboscada: × no dano do golpe que sai da furtividade (a de antes era um crítico de 15%). */
export const danoDaEmboscada = (h) => (tem(h, 'emboscada') ? 1.15 : 1);
/** O nível 3 da Emboscada: o golpe que sai da furtividade faz SANGRAR (`porSeg` de dano por `seg`). */
export const sangraNaSaida = (h) => nivel(h, 'emboscada') >= 3;
export const SANGRAMENTO = { seg: 5, porSeg: 4 };

// ---- as ativas que já funcionam (o id do card → como usa) ----
export const ATIVAS = {
  'caminho.maestria_elemental': { nome: 'Seta de Fogo', custo: 25, recarga: 1.2, dano: 40 },
  // a que LIGA E DESLIGA (`alterna`): não gasta a barra, gasta vigor enquanto dura (Player.alternarFurtividade)
  'caminho.passos_leves': { nome: 'Furtividade', alterna: true, recarga: 0.5 },
};
