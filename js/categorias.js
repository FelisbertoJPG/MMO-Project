/**
 * AS CATEGORIAS DAS PEÇAS (04/10/2026) — toda peça do cenário (`PROPS` / `decor.json`)
 * pertence a UMA categoria, decidida pelo nome:
 *
 * - `natureza`   — árvores, arbustos, mato, flores, troncos e tocos: o que NASCE no chão.
 * - `pedra`      — pedras e entulho (barram sozinhos: `RAIO_AUTOMATICO` no world.js).
 * - `construcao` — paredes, pisos, pilares, cercas, barracas, o moinho, a trilha de pedras.
 * - `objeto`     — o que se põe no chão: barris, caixotes, velas, baldes, armas, mesas…
 *
 * O CAPIM só cresce sobre `natureza` (`CRESCE_CAPIM`): a planta das outras peças vira chão
 * sem capim (`World.marcarSemCapim`). As peças de código (fogueira, baú) marcam a delas.
 * Para pegar só as peças de um tipo: `game.world.decorPorCategoria.objeto` (cada uma com
 * `i` = posição no decor.json, `prop` e o `Object3D`).
 *
 * A ordem da tabela importa: vale a PRIMEIRA que bate (`megakit-RockPath_*` é trilha —
 * construção — e não pedra). Peça que não bate em nenhuma é `objeto`: na dúvida, sem
 * capim por cima. Peça nova de pacote: confira em qual cai.
 */
export const CATEGORIAS = [
  ['construcao', /RockPath|^wall|^floor|^pillar|^column|^barrier|^stairs|^banner|^fence|^tent$|^building_/],
  ['natureza', /Tree|Bush|(^|-)Grass|Flower|WoodLog|TreeStump|Plant|Mushroom|Fern/],
  ['pedra', /(^|-)Rock_|^rubble_/],
];

/** As categorias sobre as quais o capim pode crescer. */
export const CRESCE_CAPIM = new Set(['natureza']);

const _cache = new Map();
/** A categoria de uma peça pelo nome (`objeto` quando nenhuma regra bate). */
export function categoriaDaPeca(nome) {
  if (!_cache.has(nome)) _cache.set(nome, CATEGORIAS.find(([, re]) => re.test(nome))?.[0] ?? 'objeto');
  return _cache.get(nome);
}
