/**
 * O ESCUDO DOS INIMIGOS (16/10/2026) — material, durabilidade e postura.
 *
 * Quem tem escudo (`cfg.left` em `ENEMY_TYPES`) defende de frente (`blockChance`). Agora o
 * golpe defendido gasta DUAS coisas, mostradas sobre o inimigo (ui.js, `.ebar .escudo`):
 *   • a DURABILIDADE do escudo (a barra branca) — só se a arma tem força para o MATERIAL dele:
 *     cada arma tem `quebra: { nivel, dano }` (items.js) e cada material um `nivel`; abaixo
 *     dele o golpe não arranha o escudo. A adaga não quebra nem madeira; a espada longa racha
 *     madeira; o machado, madeira e ferro; o espadão, tudo. Golpe forte vale 1,6×. Zerou: o
 *     escudo SE PARTE em pedaços (fratura.js) e a postura quebra junto (cambaleia longo);
 *   • a POSTURA da guarda (os três losangos) — TODO golpe defendido gasta o equilíbrio do golpe
 *     (`poise`), de qualquer arma: "nem toda arma quebra o escudo, mas toda quebra a postura".
 *     Zerou: a guarda abre (cambaleia) e volta cheia. Sem apanhar por `RECUPERA_APOS` s, ela
 *     volta aos poucos.
 * O escudo quebrado volta inteiro quando o inimigo renasce (`Enemy.reset`).
 */
export const MATERIAIS_DE_ESCUDO = {
  madeira: { nome: 'Madeira', nivel: 1, durabilidade: 100 },
  ferro: { nome: 'Ferro', nivel: 2, durabilidade: 160 },
  aco: { nome: 'Aço', nivel: 3, durabilidade: 220 },
};

/** O material de cada escudo (o `kind` do `shieldMesh`); o que não está aqui é de aço. */
const MATERIAL_DO_ESCUDO = { round: 'madeira', rustyRound: 'madeira' };

export function materialDoEscudo(kind) { return MATERIAIS_DE_ESCUDO[MATERIAL_DO_ESCUDO[kind] ?? 'aco']; }

/** A postura da guarda volta depois de tanto tempo sem apanhar, e quanto (fração por segundo). */
export const RECUPERA_APOS = 2.5, RECUPERA_POR_S = 0.4;
/** Quantos losangos a postura mostra. */
export const LOSANGOS = 3;

/** O que um golpe faz no escudo: `quebra` da arma ({ nivel, dano }, já com o forte), contra o material. */
export function danoNoEscudo(quebra, material) {
  if (!quebra || !(quebra.nivel >= material.nivel)) return 0;
  return Math.max(0, quebra.dano || 0);
}

/** Um escudo novo para um inimigo (`kind` = o do `shieldMesh`). */
export function novoEscudo(kind, posturaMax) {
  const material = materialDoEscudo(kind);
  return { kind, material, max: material.durabilidade, vida: material.durabilidade, quebrado: false, postura: posturaMax, posturaMax, ultimoGolpe: -99 };
}
