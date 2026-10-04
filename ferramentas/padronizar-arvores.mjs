// AS ÁRVORES PADRONIZADAS (04/10/2026) — a floresta, a mata e o acampamento tinham as
// árvores low poly do KayKit (`Tree_*`); as WindHills, as detalhadas da Quaternius
// (`estilizada-*`, `megakit-*`). Esta ferramenta troca cada `Tree_*` do decor.json por
// uma detalhada, mantendo o lugar, o giro, a colisão e a ALTURA (a escala nova faz a
// árvore nova ter a altura da antiga, dentro de `ALTURA_MIN`–`ALTURA_MAX`).
//
// As secas (`Tree_Bare_*`) viram as secas do mesmo pacote (`estilizada-DeadTree_*`);
// as outras são sorteadas de `VIVAS` pelo peso — o sorteio é pela POSIÇÃO no arquivo,
// então rodar de novo num decor.json igual dá o mesmo resultado.
//
// `ALTURAS` são as alturas dos modelos em escala 1 (m), medidas no jogo
// (Box3 de `Assets.props[nome]`). Peça nova numa das listas: meça e acrescente.
//
// Uso (da raiz do jogo): node ferramentas/padronizar-arvores.mjs
import fs from 'node:fs';

const ALTURAS = {
  Tree_1_A: 4.16, Tree_1_B: 4.93, Tree_1_C: 7.81, Tree_2_A: 4.67, Tree_2_B: 6.04, Tree_2_C: 6.92, Tree_2_D: 8.09,
  Tree_3_A: 3.51, Tree_3_B: 4.35, Tree_4_A: 5.27, Tree_4_B: 6.94, Tree_4_C: 10.77, Tree_Bare_1_A: 2.86, Tree_Bare_2_B: 5.54,
  'estilizada-NormalTree_1': 6.87, 'estilizada-NormalTree_2': 6.56, 'estilizada-NormalTree_3': 5.28, 'estilizada-NormalTree_4': 5.1,
  'estilizada-NormalTree_5': 2.98, 'megakit-CommonTree_1': 7.26, 'estilizada-BirchTree_2': 7.57, 'estilizada-MapleTree_2': 6.71,
  'estilizada-DeadTree_1': 6.2, 'estilizada-DeadTree_2': 6.2, 'estilizada-DeadTree_3': 4.96,
};
// [peça, peso] — a bordo (MapleTree) é outonal: rara, só um toque de cor
const VIVAS = [
  ['estilizada-NormalTree_1', 3], ['estilizada-NormalTree_2', 3], ['megakit-CommonTree_1', 3], ['estilizada-NormalTree_4', 2],
  ['estilizada-BirchTree_2', 2], ['estilizada-NormalTree_3', 1], ['estilizada-NormalTree_5', 1], ['estilizada-MapleTree_2', 0.4],
];
const SECAS = [['estilizada-DeadTree_1', 1], ['estilizada-DeadTree_2', 1], ['estilizada-DeadTree_3', 1]];
const ALTURA_MIN = 7, ALTURA_MAX = 18;

const sorteio = (lista, i) => {
  let h = Math.imul(i + 1, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
  let t = ((h >>> 0) / 4294967296) * lista.reduce((s, [, p]) => s + p, 0);
  for (const [nome, p] of lista) { if ((t -= p) < 0) return nome; }
  return lista[0][0];
};

const arq = 'assets/decor.json';
const raw = fs.readFileSync(arq, 'utf8');
const crlf = raw.includes('\r\n');
const linhas = raw.replace(/\r\n/g, '\n').split('\n');
const ini = linhas.indexOf('  "itens": [') + 1;
let trocadas = 0, i = -1;
const conta = {};
for (let n = ini; n < linhas.length && linhas[n].trim() !== ']'; n++) {
  i++;
  const fim = linhas[n].endsWith(',') ? ',' : '';
  const it = JSON.parse(linhas[n].replace(/,$/, ''));
  if (!/^Tree_/.test(it.prop)) continue;
  if (!ALTURAS[it.prop]) throw new Error(`sem a altura de ${it.prop}`);
  const novo = sorteio(/^Tree_Bare/.test(it.prop) ? SECAS : VIVAS, i);
  const altura = Math.min(ALTURA_MAX, Math.max(ALTURA_MIN, ALTURAS[it.prop] * (it.escala ?? 1)));
  it.prop = novo;
  it.escala = Math.round((altura / ALTURAS[novo]) * 1000) / 1000;
  linhas[n] = JSON.stringify(it) + fim;
  conta[novo] = (conta[novo] ?? 0) + 1;
  trocadas++;
}
let texto = linhas.join('\n');
JSON.parse(texto);
if (crlf) texto = texto.replace(/\n/g, '\r\n');
fs.writeFileSync(arq, texto);
console.log(`${trocadas} árvores trocadas:`, Object.entries(conta).map(([k, v]) => `${k} ${v}`).join(', '));
