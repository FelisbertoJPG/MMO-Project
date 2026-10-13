/**
 * A PISCADA (13/10/2026) — as PÁLPEBRAS do guerreiro.
 *
 * O olho do modelo é uma plaquinha (a tampa da frente: 9 pontos) com o desenho por cima — a folha
 * pintada (pintura.js) ou o da textura. Não há pálpebra na malha para descer: ela é uma malhinha
 * À PARTE, cor de pele, um fio à frente do olho, que vai da beira de cima dele até onde o olho
 * está fechado, com a linha dos CÍLIOS (uma faixa escura) na beira de baixo.
 *
 * É feita sobre o olho COMO ELE FICOU (a raça, a modelagem, os olhos reposicionados): a beirada da
 * tampa vista de frente dá, em cada coluna, o alto e o baixo do olho, e cada ponto da pálpebra
 * assenta na tampa (um raio pelo z) — a pálpebra acompanha o olho torto, afastado ou maior.
 *
 * São `ETAPAS` geometrias (1/ETAPAS fechado … todo fechado), uma por degrau, divididas por todos
 * os guerreiros do mesmo corpo — e não uma só com `drawRange`: dois piscando em degraus diferentes
 * brigariam pela faixa. Sem osso nem shader novo: presa aos ossos do olho, com o material do
 * corpo; o guerreiro.js (`piscar`) troca a geometria e só a desenha ENQUANTO o olho pisca.
 */
import * as THREE from 'three';

export const ETAPAS = 6;
/** Os tempos de uma piscada (s): a pálpebra desce, fica e sobe. */
export const PISCADA = { fecha: 0.07, parada: 0.04, abre: 0.13 };
/** Quanto falta para a próxima piscada (s) — de vez em quando, duas seguidas. */
export const proximaPiscada = () => (Math.random() < 0.15 ? 0.1 + Math.random() * 0.15 : 2.2 + Math.random() * 4.3);

const COLUNA = 0.45;    // cm: a largura máxima de uma coluna da grade
const FILEIRAS = 4;
const LEVANTA = 0.08;   // cm à frente do olho (a tinta da folha fica a 0,015)
// cm: o quanto a pálpebra passa da beirada do olho, em toda a volta — levantada, olhando de lado
// sobrava um fio do branco do olho na beira (mais que a LEVANTA: cobre até ~45° de lado)
const SOBRA = 0.1;
const CILIOS = 0.11;    // cm: a faixa escura na beira de baixo
const TOM = 0.93, TOM_DOS_CILIOS = 0.15;   // a cor da pele vezes isto

/**
 * As geometrias das pálpebras (uma por etapa; a última é o olho fechado) sobre a malha fundida —
 * ou null. `olhos`: { de, n } = os vértices da peça dos olhos na malha (sem índice); `casca`: por
 * triângulo dela, 1 = não é a tampa da frente (pintura.js `cascaDoOlho`); `pele`: um vértice de
 * pele (a UV e a cor de vértice dele são as da pálpebra).
 */
export function geometriasDasPalpebras(geo, olhos, casca, pele) {
  const P = geo.attributes.position, uv = geo.attributes.uv, cor = geo.attributes.color, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  if (geo.index || !uv || !si || !sw || !(pele >= 0)) return null;
  const tom = cor ? [cor.getX(pele), cor.getY(pele), cor.getZ(pele)] : [1, 1, 1], uvPele = [uv.getX(pele), uv.getY(pele)];
  const saida = Array.from({ length: ETAPAS }, () => ({ pos: [], nor: [], uv: [], cor: [], ossos: [], pesos: [] }));
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const lado of [1, -1]) {
    // a tampa da frente do olho deste lado
    const tris = [];
    let primeiro = -1;
    for (let t = 0; t < olhos.n / 3; t++) {
      const i = olhos.de + t * 3;
      if (casca?.[t] || (P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) * lado <= 0) continue;
      if (primeiro < 0) primeiro = i;
      tris.push([0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(P, i + k)));
    }
    if (tris.length < 2) continue;
    // a normal dela e a BEIRADA (as arestas de um triângulo só)
    const n = new THREE.Vector3(), arestas = new Map(), nome = (p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`;
    for (const [a, b, c] of tris) {
      n.add(e1.subVectors(b, a).cross(e2.subVectors(c, a)));
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const k = [nome(p), nome(q)].sort().join('|');
        if (arestas.has(k)) arestas.get(k).vezes++; else arestas.set(k, { p, q, vezes: 1 });
      }
    }
    // (a pálpebra é enrolada como a tampa: vista de frente, no mesmo sentido dos triângulos dela)
    const avesso = n.z < 0;
    if (avesso) n.negate();
    n.normalize();
    const beira = [...arestas.values()].filter((a) => a.vezes === 1);
    // o alto e o baixo do olho numa coluna (x), vistos de frente
    const altoEBaixo = (x) => {
      let alto = -Infinity, baixo = Infinity;
      for (const { p, q } of beira) {
        if (x < Math.min(p.x, q.x) - 1e-6 || x > Math.max(p.x, q.x) + 1e-6) continue;
        const ys = Math.abs(q.x - p.x) < 1e-6 ? [p.y, q.y] : [p.y + ((x - p.x) / (q.x - p.x)) * (q.y - p.y)];
        for (const y of ys) { alto = Math.max(alto, y); baixo = Math.min(baixo, y); }
      }
      return [alto, baixo];
    };
    // o z da tampa num ponto (x, y): o triângulo que o contém (ou, na beirada, o que quase o contém)
    const zEm = (x, y) => {
      let melhor = -Infinity, z = 0;
      for (const [a, b, c] of tris) {
        const d = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y);
        if (Math.abs(d) < 1e-9) continue;
        const u = ((b.y - c.y) * (x - c.x) + (c.x - b.x) * (y - c.y)) / d, v = ((c.y - a.y) * (x - c.x) + (a.x - c.x) * (y - c.y)) / d, w = 1 - u - v, m = Math.min(u, v, w);
        if (m > melhor) { melhor = m; z = u * a.z + v * b.z + w * c.z; }
      }
      return z;
    };
    // as colunas: nos cantos da beirada (o contorno sai exato) e, entre eles, a cada COLUNA cm
    const cantos = [...new Set(beira.flatMap((a) => [a.p.x, a.q.x]).map((x) => +x.toFixed(4)))].sort((a, b) => a - b), xs = [];
    for (let i = 0; i < cantos.length - 1; i++) {
      const partes = Math.max(1, Math.ceil((cantos[i + 1] - cantos[i]) / COLUNA));
      for (let m = 0; m < partes; m++) xs.push(cantos[i] + ((cantos[i + 1] - cantos[i]) * m) / partes);
    }
    xs.push(cantos[cantos.length - 1]);
    const colunas = xs.map((x) => [x, ...altoEBaixo(x)]).filter(([, alto, baixo]) => alto >= baixo);
    if (colunas.length < 2) continue;
    // a SOBRA: uma coluna a mais de cada lado, e o alto e o baixo de todas um pouco além da beirada
    colunas.unshift([colunas[0][0] - SOBRA, colunas[0][1], colunas[0][2]]);
    colunas.push([colunas[colunas.length - 1][0] + SOBRA, colunas[colunas.length - 1][1], colunas[colunas.length - 1][2]]);
    for (const c of colunas) { c[1] += SOBRA; c[2] -= SOBRA; }
    const ossos = [0, 1, 2, 3].map((k) => si.getComponent(primeiro, k)), pesos = [0, 1, 2, 3].map((k) => sw.getComponent(primeiro, k));
    saida.forEach((s, etapa) => {
      const f = (etapa + 1) / ETAPAS;
      // a grade desta etapa: do alto do olho até onde a pálpebra chegou, e a faixa dos cílios na beira
      const grade = colunas.map(([x, alto, baixo]) => {
        const desce = f * (alto - baixo), cilios = Math.min(CILIOS, desce * 0.4), ys = [];
        for (let i = 0; i <= FILEIRAS; i++) ys.push(alto - (i / FILEIRAS) * (desce - cilios));
        ys.push(alto - desce);
        return ys.map((y) => new THREE.Vector3(x, y, zEm(x, y)).addScaledVector(n, LEVANTA));
      });
      const canto = (p, k) => {
        s.pos.push(p.x, p.y, p.z); s.nor.push(n.x, n.y, n.z); s.uv.push(...uvPele);
        s.cor.push(tom[0] * k, tom[1] * k, tom[2] * k); s.ossos.push(...ossos); s.pesos.push(...pesos);
      };
      for (let j = 0; j < grade.length - 1; j++) for (let i = 0; i <= FILEIRAS; i++) {
        const a = grade[j][i], b = grade[j + 1][i], c = grade[j][i + 1], d = grade[j + 1][i + 1], k = i < FILEIRAS ? TOM : TOM_DOS_CILIOS;
        for (const t of avesso ? [[a, b, c], [b, d, c]] : [[a, c, b], [b, c, d]]) for (const p of t) canto(p, k);
      }
    });
  }
  if (!saida[0].pos.length) return null;
  return saida.map((s) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(s.cor, 3));   // (o material é o do corpo, com cor de vértice)
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(s.ossos, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(s.pesos, 4));
    return g;
  });
}
