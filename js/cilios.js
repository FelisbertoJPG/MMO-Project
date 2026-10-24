/**
 * OS CÍLIOS-DELINEADO (24/10/2026, pedido do dono: "põe ao redor do olho outra malha, chamada cílios-delineado —
 * um contorno mais grosso acima e mais fino abaixo") — uma faixa escura em volta da tampa da frente de cada olho,
 * com uma ASA no canto de fora. É feita do olho COMO ELE FICOU (a raça, a modelagem: a posição, o tamanho, os
 * vértices movidos), no fim do `geometriaFundida` (guerreiro.js), como as pálpebras da piscada: ajustar o olho
 * leva a faixa junto. Uma malha à parte (`CorpoGuerreiro.vestirCilios`), presa aos ossos do olho, com o material
 * do corpo e a cor de um texel escuro da paleta (pintura.js `uvEscura`).
 *
 * `cilios` no corpo do assets/modelagem.json: { cima, baixo, asa } (cm) — a grossura no alto do olho (no meio de
 * cima; ela afina até os cantos), embaixo, e o comprimento da asa. Sem `cilios`, nada.
 */
import * as THREE from 'three';
import { ORIGENS, zDaPele } from './modelagem.js';

export const CILIOS_PADRAO = { cima: 0.26, baixo: 0.06, asa: 0.55 };
const OLHOS = ORIGENS.indexOf('olhos');
const LEVANTA = 0.03;   // cm à frente do olho e da pele (a faixa não briga com eles)
const DENTRO = 0.03;    // cm para dentro do olho na beira: sem fresta entre a faixa e o olho

const normalDe = (P, t, n = new THREE.Vector3()) => {
  const a = new THREE.Vector3().fromArray(P, t * 9), b = new THREE.Vector3().fromArray(P, t * 9 + 3).sub(a), c = new THREE.Vector3().fromArray(P, t * 9 + 6).sub(a);
  return n.crossVectors(b, c);
};

// a BORDA da tampa da frente de um olho: o laço das arestas que só um triângulo usa — [{ p: Vector3, v: o vértice }]
function bordaDoOlho(P, tris) {
  const chave = (v) => `${Math.round(P[v * 3] * 1e4)},${Math.round(P[v * 3 + 1] * 1e4)},${Math.round(P[v * 3 + 2] * 1e4)}`;
  const usos = new Map(), arestas = [];
  for (const t of tris) for (let e = 0; e < 3; e++) {
    const a = t * 3 + e, b = t * 3 + ((e + 1) % 3), ka = chave(a), kb = chave(b), k = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
    usos.set(k, (usos.get(k) ?? 0) + 1);
    arestas.push({ k, ka, kb, a });
  }
  const seguinte = new Map();
  for (const x of arestas) if (usos.get(x.k) === 1) seguinte.set(x.ka, x);
  // (o maior laço: a tampa é um leque, a borda é um laço só)
  let melhor = [];
  const vistos = new Set();
  for (const ini of seguinte.keys()) {
    if (vistos.has(ini)) continue;
    const laco = [];
    let k = ini;
    while (k && !vistos.has(k)) { vistos.add(k); const x = seguinte.get(k); if (!x) break; laco.push({ p: new THREE.Vector3().fromArray(P, x.a * 3), v: x.a }); k = x.kb; }
    if (laco.length > melhor.length) melhor = laco;
  }
  return melhor;
}

/**
 * A malha dos cílios-delineado sobre os olhos de `geo` (a malha fundida, ou a vista do editor, na pose T; `origem`:
 * o código de cada vértice — modelagem.js `ORIGENS`) — uma BufferGeometry, ou null (não há olho). `uv`: o texel da cor.
 */
export function geometriaDosCilios(geo, origem, ajustes, uv) {
  const P = geo.attributes.position.array, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, nt = P.length / 9;
  if (!si || !sw || geo.index || !origem) return null;
  const A = { ...CILIOS_PADRAO, ...(ajustes ?? {}) };
  const pos = [], nor = [], fonte = [];
  const nf = new THREE.Vector3();
  for (const lado of [1, -1]) {
    // a tampa da frente deste olho: os triângulos do olho virados para a frente (a casca de trás e o aro, não)
    const tris = [];
    const n = new THREE.Vector3();
    for (let t = 0; t < nt; t++) {
      if (origem[t * 3] !== OLHOS || P[t * 9] * lado <= 0) continue;
      normalDe(P, t, nf);
      if (nf.lengthSq() < 1e-12 || nf.clone().normalize().z < 0.35) continue;
      tris.push(t); n.add(nf);
    }
    const L = tris.length ? bordaDoOlho(P, tris) : [];
    if (L.length < 3) continue;
    n.normalize();
    const C = L.reduce((s, x) => s.add(x.p), new THREE.Vector3()).multiplyScalar(1 / L.length);
    const U = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();   // (o "para cima" no plano do olho)
    // a pele na frente? a faixa assenta nela (o osso da sobrancelha costuma estar à frente do plano do olho)
    const naPele = (q) => { const z = zDaPele(P, null, nt, origem, q.x, q.y, q.z); if (z !== null && z + LEVANTA > q.z) q.z = z + LEVANTA; return q; };
    const m = L.length, dentro = [], fora = [], subida = [];
    for (let i = 0; i < m; i++) {
      const p = L[i].p, tg = L[(i + 1) % m].p.clone().sub(L[(i + m - 1) % m].p);
      const d = new THREE.Vector3().crossVectors(tg, n).normalize();
      if (d.dot(p.clone().sub(C)) < 0) d.negate();
      const u = p.clone().sub(C).addScaledVector(n, -p.clone().sub(C).dot(n)).normalize().dot(U);
      subida.push(u);
      // (grossa no meio de cima, afinando até os cantos; embaixo, a fina)
      const g = u > 0 ? A.baixo + (A.cima - A.baixo) * Math.pow(u, 0.8) : A.baixo;
      dentro.push(p.clone().addScaledVector(d, -DENTRO).addScaledVector(n, LEVANTA));
      fora.push(naPele(p.clone().addScaledVector(d, g).addScaledVector(n, LEVANTA)));
    }
    // os triângulos (virados para fora do olho, para onde `n` aponta)
    const tri = (a, b, c, va, vb, vc) => {
      const f = b.clone().sub(a).cross(c.clone().sub(a));
      const [x, y, z] = f.dot(n) < 0 ? [a, c, b] : [a, b, c], [vx, vy, vz] = f.dot(n) < 0 ? [va, vc, vb] : [va, vb, vc];
      for (const [q, v] of [[x, vx], [y, vy], [z, vz]]) { pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); fonte.push(v); }
    };
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      tri(dentro[i], fora[i], fora[j], L[i].v, L[i].v, L[j].v);
      tri(dentro[i], fora[j], dentro[j], L[i].v, L[j].v, L[j].v);
    }
    // a ASA: do canto de fora (o mais longe do meio do rosto), para fora e um pouco para cima
    if (A.asa > 0) {
      let k = 0;
      for (let i = 1; i < m; i++) if (L[i].p.x * lado > L[k].p.x * lado) k = i;
      const j = subida[(k + 1) % m] > subida[(k + m - 1) % m] ? (k + 1) % m : (k + m - 1) % m;   // (o vizinho de cima)
      const lateral = L[k].p.clone().sub(C).addScaledVector(n, -L[k].p.clone().sub(C).dot(n)).normalize();
      const ponta = naPele(L[k].p.clone().addScaledVector(lateral, A.asa).addScaledVector(U, A.asa * 0.45).addScaledVector(n, LEVANTA));
      tri(fora[k], ponta, fora[j], L[k].v, L[k].v, L[j].v);
      tri(dentro[k], fora[k], fora[j], L[k].v, L[k].v, L[j].v);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry(), k = pos.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(k * 2).map((_, i) => (uv ? uv[i % 2] : 0)), 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(k * 3).fill(1), 3));
  // (os ossos de cada ponto: os do vértice do olho de onde ele sai)
  const ossos = new Uint16Array(k * 4), pesos = new Float32Array(k * 4);
  fonte.forEach((v, i) => { for (let c = 0; c < 4; c++) { ossos[i * 4 + c] = si.getComponent(v, c); pesos[i * 4 + c] = sw.getComponent(v, c); } });
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ossos, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(pesos, 4));
  return g;
}
