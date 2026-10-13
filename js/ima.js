/**
 * O ÍMÃ (12/10/2026) — grudar uma coisa na MALHA do personagem: as presas e a barba no
 * rosto, a mecha e a barba longa no corpo (raca.js, penteado.js).
 *
 * Antes cada uma era posta por uma conta à parte da malha: a barba alargava "como o
 * queixo" e as presas andavam por uma linha desenhada à mão — e bastava uma régua nova
 * (o queixo, a altura da presa) para a barba ficar flutuando a dois dedos do rosto e a
 * presa nascer no ar. O ímã inverte: acha-se ONDE da pele a coisa está — o triângulo e o
 * lugar dentro dele (as coordenadas baricêntricas) — na malha como o MODELO é, e depois
 * pergunta-se onde esse mesmo lugar foi parar na malha como a raça a deixou (`lugar`). O
 * que está grudado vai junto com a pele, seja qual for a proporção, e pode herdar os
 * ossos dela (`pesos`).
 *
 * Aqui só há geometria: quem deforma (o queixo, as proporções) é quem chama.
 */
import * as THREE from 'three';

/**
 * Os triângulos de umas peças, como o modelo é: cada um, os 3 cantos — { p: o ponto, o: os
 * 4 ossos (na ordem única `ordem`; sem ela, os da peça), w: os 4 pesos, n: a normal MÉDIA
 * do lugar (os cantos repetidos nas quinas têm a mesma: quem sai por ela sai junto) }.
 */
export function triangulosDe(pecas, ordem = null) {
  const tris = [], media = new Map();
  const chave = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)},${p.z.toFixed(2)}`;
  for (const peca of pecas) {
    const g = peca.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight;
    const troca = ordem && peca.skeleton ? peca.skeleton.bones.map((o) => Math.max(0, ordem.indexOf(o.name))) : null;
    const canto = (i) => ({
      p: new THREE.Vector3().fromBufferAttribute(pos, i),
      o: si ? [0, 1, 2, 3].map((k) => (troca ? troca[si.getComponent(i, k)] ?? 0 : si.getComponent(i, k))) : [0, 0, 0, 0],
      w: sw ? [0, 1, 2, 3].map((k) => sw.getComponent(i, k)) : [1, 0, 0, 0],
    });
    const n = g.index ? g.index.count : pos.count;
    for (let t = 0; t + 2 < n; t += 3) {
      const tri = [0, 1, 2].map((k) => canto(g.index ? g.index.getX(t + k) : t + k));
      const face = new THREE.Vector3().subVectors(tri[1].p, tri[0].p).cross(new THREE.Vector3().subVectors(tri[2].p, tri[0].p));
      for (const k of tri) { const c = chave(k.p); media.set(c, (media.get(c) ?? new THREE.Vector3()).add(face)); }
      tris.push(tri);
    }
  }
  for (const n of media.values()) n.normalize();
  for (const tri of tris) for (const k of tri) k.n = media.get(chave(k.p));
  return tris;
}

const _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _ap = new THREE.Vector3(), _bp = new THREE.Vector3(), _cp = new THREE.Vector3();
// as coordenadas baricêntricas do ponto do triângulo (a, b, c) mais perto de p (Ericson, "Real-Time Collision Detection")
function pertoNoTriangulo(p, a, b, c, bar) {
  _ab.subVectors(b, a); _ac.subVectors(c, a); _ap.subVectors(p, a);
  const d1 = _ab.dot(_ap), d2 = _ac.dot(_ap);
  if (d1 <= 0 && d2 <= 0) return bar.set(1, 0, 0);
  _bp.subVectors(p, b);
  const d3 = _ab.dot(_bp), d4 = _ac.dot(_bp);
  if (d3 >= 0 && d4 <= d3) return bar.set(0, 1, 0);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return bar.set(1 - v, v, 0); }
  _cp.subVectors(p, c);
  const d5 = _ab.dot(_cp), d6 = _ac.dot(_cp);
  if (d6 >= 0 && d5 <= d6) return bar.set(0, 0, 1);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return bar.set(1 - w, 0, w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + d5 - d6); return bar.set(0, 1 - w, w); }
  const den = 1 / (va + vb + vc);
  return bar.set(1 - (vb + vc) * den, vb * den, vc * den);
}

const _bar = new THREE.Vector3(), _q = new THREE.Vector3();
/**
 * O lugar da malha MAIS PERTO de um ponto: { tri, bar: [3], q: o ponto de lá, d: a
 * distância } — ou null (malha vazia).
 */
export function grudar(tris, p) {
  let d = Infinity, achado = null;
  const bar = [0, 0, 0], q = new THREE.Vector3();
  for (const tri of tris) {
    pertoNoTriangulo(p, tri[0].p, tri[1].p, tri[2].p, _bar);
    _q.set(0, 0, 0).addScaledVector(tri[0].p, _bar.x).addScaledVector(tri[1].p, _bar.y).addScaledVector(tri[2].p, _bar.z);
    const dq = _q.distanceToSquared(p);
    if (dq < d) { d = dq; achado = tri; bar[0] = _bar.x; bar[1] = _bar.y; bar[2] = _bar.z; q.copy(_q); }
  }
  return achado ? { tri: achado, bar, q, d: Math.sqrt(d) } : null;
}

/**
 * O lugar da malha que um RAIO paralelo ao eixo z encontra na posição (x, y) do modelo —
 * vindo da frente (`frente`: o de maior z) ou de trás (o de menor): { tri, bar } — ou null
 * (não há malha ali).
 */
export function raio(tris, x, y, frente = false) {
  let z = frente ? -Infinity : Infinity, achado = null, bar = null;
  for (const tri of tris) {
    const A = tri[0].p, B = tri[1].p, C = tri[2].p, d = (B.y - C.y) * (A.x - C.x) + (C.x - B.x) * (A.y - C.y);
    if (Math.abs(d) < 1e-9) continue;
    const a = ((B.y - C.y) * (x - C.x) + (C.x - B.x) * (y - C.y)) / d, b = ((C.y - A.y) * (x - C.x) + (A.x - C.x) * (y - C.y)) / d, g = 1 - a - b;
    if (a < -1e-4 || b < -1e-4 || g < -1e-4) continue;
    const zt = a * A.z + b * B.z + g * C.z;
    if (frente ? zt > z : zt < z) { z = zt; achado = tri; bar = [a, b, g]; }
  }
  return achado ? { tri: achado, bar } : null;
}

const _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3(), _h = new THREE.Vector3(), _s = new THREE.Vector3(), _k = new THREE.Vector3();
/**
 * O lugar da malha que um RAIO QUALQUER encontra: sai de `origem` na direção `dir` (de
 * tamanho 1) e fica com o encontro mais LONGE (`longe`: saindo de dentro do corpo, é a pele
 * de fora) ou com o mais perto — { tri, bar, t: a que distância } — ou null (não há malha ali).
 */
export function raioDe(tris, origem, dir, longe = true) {
  let melhor = longe ? -Infinity : Infinity, achado = null, bar = null;
  for (const tri of tris) {
    const A = tri[0].p;
    _e1.subVectors(tri[1].p, A); _e2.subVectors(tri[2].p, A);
    _h.crossVectors(dir, _e2);
    const a = _e1.dot(_h);
    if (Math.abs(a) < 1e-9) continue;   // (o raio corre ao longo do triângulo)
    _s.subVectors(origem, A);
    const u = _s.dot(_h) / a;
    if (u < -1e-4 || u > 1 + 1e-4) continue;
    _k.crossVectors(_s, _e1);
    const v = dir.dot(_k) / a;
    if (v < -1e-4 || u + v > 1 + 1e-4) continue;
    const t = _e2.dot(_k) / a;
    if (t <= 1e-6 || (longe ? t <= melhor : t >= melhor)) continue;
    melhor = t; achado = tri; bar = [1 - u - v, u, v];
  }
  return achado ? { tri: achado, bar, t: melhor } : null;
}

/**
 * Onde um lugar da malha ({ tri, bar }) foi parar: `mover(canto)` devolve o ponto de um
 * canto na malha como ela ficou (um Vector3 NOVO). Devolve { p: o ponto, n: a normal do
 * triângulo de lá (para o lado de `fora`, um vetor; sem ele, como o triângulo está) }.
 */
export function lugar({ tri, bar }, mover, fora = null) {
  const V = tri.map(mover);
  const n = new THREE.Vector3().subVectors(V[1], V[0]).cross(new THREE.Vector3().subVectors(V[2], V[0])).normalize();
  if (fora && n.dot(fora) < 0) n.negate();
  return { p: new THREE.Vector3().addScaledVector(V[0], bar[0]).addScaledVector(V[1], bar[1]).addScaledVector(V[2], bar[2]), n };
}
/** A normal MÉDIA (lisa) de um lugar da malha, como o modelo é. */
export const normalLisa = ({ tri, bar }) => new THREE.Vector3().addScaledVector(tri[0].n, bar[0]).addScaledVector(tri[1].n, bar[1]).addScaledVector(tri[2].n, bar[2]).normalize();

/** Os pesos (ossos) de um lugar da malha: a mistura dos 3 cantos, os 4 maiores — { o, p }. */
export function pesos({ tri, bar }) { return misturar(tri.map((k, i) => [{ o: k.o, p: k.w }, bar[i]])); }
/** Mistura pesos: [[{ o, p }, quanto], …] → { o: os 4 ossos, p: os 4 pesos (somam 1) }. */
export function misturar(partes) {
  const soma = new Map();
  for (const [w, f] of partes) for (let k = 0; k < 4; k++) if (w.p[k] && f) soma.set(w.o[k], (soma.get(w.o[k]) ?? 0) + w.p[k] * f);
  const maiores = [...soma].sort((a, b) => b[1] - a[1]).slice(0, 4), total = maiores.reduce((s, x) => s + x[1], 0) || 1;
  return { o: [0, 1, 2, 3].map((k) => maiores[k]?.[0] ?? 0), p: [0, 1, 2, 3].map((k) => (maiores[k]?.[1] ?? 0) / total) };
}
