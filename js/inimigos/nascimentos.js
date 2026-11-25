/**
 * ONDE NASCE CADA INIMIGO E CADA BICHO (24/11/2026: saiu do `spawnEnemies` do enemies.js, só dados,
 * para o servidor do Mundo online montar a mesma lista). Em células do mapa: [linha, coluna], e um
 * deslocamento `dx`/`dz` em unidades de `S` (a escala da masmorra).
 *
 * A ORDEM É O NOME NA REDE: o `netId` de cada um é a posição na lista (`e<i>`, ver main.js), os
 * esqueletos primeiro e os bichos depois. Novo entra sempre no FIM, e nunca se tira do meio.
 */
import { CELL, S, ARENA } from '../mapa-logico.js';

/** Os CHEFES (fichas em tipos.js): onde cada um espera, em metros. O `netId` é o nome (`carrasco`). */
export const CHEFES = {
  carrasco: { x: ARENA.x, z: ARENA.z - 4 * S, rumo: 0 },   // ao fundo da arena, junto ao cepo
  wyrm: { x: 0, z: 0, rumo: 0 },                          // (o lugar é o ninho: o traço `territorio` o acha no mapa)
};

/** O lugar (m) de quem nasce na célula [r, c], com o deslocamento. */
export const lugarDoNascimento = (r, c, dx = 0, dz = 0) => ({ x: c * CELL + dx * S, z: r * CELL + dz * S });

/** Os ESQUELETOS da masmorra: { tipo (ENEMY_TYPES), r, c, rumo, dormindo, dx, dz }. */
export const ESQUELETOS = [
  // Corredor das celas
  { tipo: 'minion', r: 23, c: 12, rumo: -Math.PI / 2, dormindo: true },
  // Sala da guarda
  { tipo: 'minion', r: 16, c: 5, rumo: 0, dormindo: true },
  { tipo: 'minion', r: 15, c: 9, rumo: 0, dormindo: true, dz: 0.5 },
  { tipo: 'rogue', r: 17, c: 9, rumo: Math.PI },
  // Alcova do tesouro
  { tipo: 'warrior', r: 16, c: 12, rumo: -Math.PI / 2 },
  // Ossário
  { tipo: 'warrior', r: 11, c: 7, rumo: 0, dz: 1.6 },
  { tipo: 'minion', r: 12, c: 5, rumo: 0, dormindo: true, dx: 1.5 },
  { tipo: 'minion', r: 10, c: 9, rumo: 0, dormindo: true },
  { tipo: 'rogue', r: 9, c: 4, rumo: Math.PI / 2 },
  { tipo: 'mage', r: 9, c: 11, rumo: Math.PI, dz: -0.5 },
  { tipo: 'mage', r: 13, c: 3, rumo: Math.PI / 2 },
];

/**
 * OS ANIMAIS (03/10/2026, js/animais.js): { tipo, r, c, rumo (null = sorteado), dx, dz }. Só nascem
 * onde a célula É ar livre (com o mapa `original` ativo ela é rocha, e o bicho nasceria dentro da
 * pedra) e se o modelo existe. Sempre DEPOIS dos esqueletos, e na mesma ordem.
 */
export const BICHOS = [
  // a floresta da masmorra: uma alcateia, uma raposa e um cervo
  { tipo: 'lobo', r: 15, c: 18, rumo: -Math.PI / 2 },
  { tipo: 'lobo', r: 17, c: 19, rumo: -Math.PI / 2 },
  { tipo: 'lobo', r: 14, c: 20, rumo: -Math.PI / 2 },
  { tipo: 'raposa', r: 12, c: 22 },
  { tipo: 'cervo', r: 19, c: 22 },
  // a mata: pacíficos em bando, os neutros sozinhos, e a outra alcateia no fundo
  { tipo: 'cervo', r: 12, c: 30 }, { tipo: 'cervo', r: 13, c: 31, dx: 0.6, dz: 0.4 }, { tipo: 'cervo', r: 12, c: 32 },
  { tipo: 'cervoReal', r: 14, c: 34 },
  { tipo: 'raposa', r: 20, c: 29 }, { tipo: 'raposa', r: 11, c: 36 },
  { tipo: 'cavalo', r: 18, c: 35 }, { tipo: 'cavalo', r: 19, c: 36, dx: 0.5 },
  { tipo: 'touro', r: 16, c: 37 },
  { tipo: 'lobo', r: 19, c: 31 }, { tipo: 'lobo', r: 20, c: 32 }, { tipo: 'lobo', r: 18, c: 30 },
  // a saída do acampamento (onde ficavam dois esqueletos): caça fácil para quem nasce ali
  { tipo: 'cervo', r: 15, c: 41, rumo: Math.PI / 2 },
  { tipo: 'cervo', r: 17, c: 40, rumo: Math.PI / 2 },
  // as COLINAS DO VENTO (04/10/2026, a leste do acampamento): manadas nos campos abertos,
  // cavalos selvagens no vale do moinho, um touro e um cervo real nas encostas, raposas
  // nas bordas — e uma alcateia guardando as ruínas do platô
  { tipo: 'cervo', r: 12, c: 68 }, { tipo: 'cervo', r: 13, c: 69, dx: 0.6, dz: 0.3 }, { tipo: 'cervo', r: 11, c: 70 },
  { tipo: 'cervo', r: 20, c: 84 }, { tipo: 'cervo', r: 21, c: 85, dx: -0.5, dz: 0.4 },
  { tipo: 'cavalo', r: 19, c: 66 }, { tipo: 'cavalo', r: 20, c: 67, dx: 0.6 }, { tipo: 'cavalo', r: 18, c: 75 },
  { tipo: 'cervoReal', r: 5, c: 82 },
  { tipo: 'touro', r: 14, c: 98 },
  { tipo: 'raposa', r: 4, c: 72 }, { tipo: 'raposa', r: 21, c: 95 }, { tipo: 'raposa', r: 9, c: 101 },
  { tipo: 'lobo', r: 12, c: 90 }, { tipo: 'lobo', r: 11, c: 96 }, { tipo: 'lobo', r: 5, c: 92 },
];
