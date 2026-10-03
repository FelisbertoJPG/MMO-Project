/**
 * **AS RECEITAS** (03/10/2026) — o que a panela da fogueira sabe fazer.
 *
 * Receita → comida que cura → comida com status. Cada uma pede ingredientes
 * (`ITEMS` do tipo `ingrediente`) e dá uma comida (`use: 'comer'`). A panela
 * hoje é simples (escolhe, tem os ingredientes, cozinha — `Game.cozinhar`); o
 * MINIGAME de cozinhar entra por cima disto depois, sem mudar o formato:
 * `dificuldade` (1 a 3) e `tempo` (segundos no fogo) já estão aqui para ele.
 *
 * Receita nova = uma linha aqui (e a comida em `items.js`, se for nova).
 */
import { ITEMS } from './items.js';

export const RECEITAS = [
  // ---- comidas que curam
  { id: 'pao', resultado: 'paoDuro', qtd: 2, ingredientes: [['farinha', 2]], dificuldade: 1, tempo: 6 },
  { id: 'assado', resultado: 'carneAssada', qtd: 1, ingredientes: [['carneCrua', 1]], dificuldade: 1, tempo: 8 },
  { id: 'ensopado', resultado: 'ensopado', qtd: 1, ingredientes: [['cogumelo', 2], ['raiz', 1]], dificuldade: 2, tempo: 10 },
  { id: 'cha', resultado: 'chaErva', qtd: 1, ingredientes: [['erva', 2]], dificuldade: 1, tempo: 5 },
  // ---- comidas com status
  { id: 'mingau', resultado: 'mingau', qtd: 1, ingredientes: [['farinha', 1], ['mel', 1]], dificuldade: 2, tempo: 7 },
  { id: 'guisado', resultado: 'guisado', qtd: 1, ingredientes: [['raiz', 2], ['carneCrua', 1]], dificuldade: 2, tempo: 12 },
  { id: 'picante', resultado: 'caldoPicante', qtd: 1, ingredientes: [['pimenta', 2], ['raiz', 1]], dificuldade: 3, tempo: 9 },
];

/** Dá para fazer agora? (`contar(id)` = quantos o jogador tem) */
export function podeCozinhar(receita, contar) {
  return receita.ingredientes.every(([id, n]) => contar(id) >= n);
}

// confere na carga: receita apontando para item que não existe é erro de digitação
for (const r of RECEITAS) {
  for (const id of [r.resultado, ...r.ingredientes.map(([i]) => i)]) {
    if (!ITEMS[id]) console.error(`[receitas] "${r.id}" usa "${id}", que não está em ITEMS`);
  }
}
