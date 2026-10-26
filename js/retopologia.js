/**
 * A PELE NOVA (26/10/2026, pedido do dono com a prancha de topologia "limpa" da personagem feminina: "diminuir o
 * tanto de triângulos sobrepostos do corpo e usar essa topologia mais polida").
 *
 * O corpo do guerreiro é feito de PEÇAS soltas (o tronco de cima e o de baixo, o trapézio, o ombro, o braço, o
 * antebraço, a coxa, a canela, o quadril — duas vezes: `hips` e `hips_02` têm os mesmos pontos, uma com a UV da pele
 * e a outra com a da roupa de baixo) que se encavalam nas emendas; no corpo feminino somam-se o busto costurado e os
 * cortes e criados da aba Modelo. A pele nova é UMA malha de ANÉIS que copia essa forma — como o modelo de referência
 * (quads em anéis, triângulos só nas junções) — e entra no lugar dessas peças, no fim da malha fundida
 * (guerreiro.js `geometriaFundida`), DEPOIS da raça e das edições: o que o dono esculpe continua valendo (é a forma
 * que se copia), e a cabeça, o rosto, as mãos e os pés ficam como são (as pontas dos tubos entram neles).
 *
 * COMO SE FAZ:
 *  - os TUBOS: tronco, pernas, braços e pescoço. Cada anel é um leque de raios saídos do eixo (os ossos, como a raça
 *    os deixou) no plano dele; cada raio acha a pele (`amostra`: o primeiro encontro e, até `janela` cm depois dele,
 *    a camada de FORA — a roupa de baixo por cima da pele, a peça de cima na emenda de duas). Raio que não acha nada
 *    (um buraco de um corte) leva a distância dos vizinhos. Anéis consecutivos viram quads;
 *  - as JUNÇÕES (o quadril: o tronco e as duas pernas; os ombros: o tronco, os dois braços e o pescoço): vistos do
 *    MEIO da junção, os anéis são círculos na esfera; entre eles, uma GRADE de direções (`passoJuncao`) acha a pele
 *    pelo raio do meio (a que cai na boca de um anel, ou passa dela, fica de fora), e o casco convexo das direções
 *    (`casco`) liga tudo — tirado o miolo de cada anel (por onde o tubo segue): o quadril e os ombros saem da forma
 *    de verdade, com triângulos do tamanho dos anéis;
 *  - cada vértice leva os PESOS (os ossos) da pele em que caiu, alisados pela malha (`suavizar`: as emendas entre as
 *    peças, que eram de um osso só, viram rampas); cada FACE, a UV e a cor do ponto da pele no meio dela (uma cor por
 *    face: a borda da roupa de baixo não borra).
 *
 * Os números ficam em `PELE`. Desligar (`PELE.ligada = false`) volta às peças.
 */
import * as THREE from 'three';
import { naPele } from './aparencia.js';

export const PELE = {
  ligada: true,
  // quantos vértices em volta de cada anel, e de quantos em quantos cm os anéis (no busto, mais juntos)
  tronco: 16, pernas: 10, bracos: 8, pescoco: 8,
  passoTronco: 5, passoBusto: 3.4, passoPernas: 6.5, passoBracos: 6, passoPescoco: 3.5,
  janela: 6,       // cm: as cascas que o raio atravessa saindo, até aqui uma da outra, são a mesma pele (vale a de fora)
  passoJuncao: 0.24,   // radianos entre os pontos da grade de uma junção, vistos do meio dela
  suavizar: 0,     // passadas de alisar os pesos (0: cada ponto com os pesos da pele de baixo nele — a pele nova dobra como as peças;
                   // alisados, o peito e os ombros eram puxados pelos braços abaixados e a humana ficava disforme na aba Raça)
  detalhe: 2,      // quantas vezes a face com um detalhe fino da roupa por dentro (uma alça) se divide em quatro
};
// as peças da pele que a pele nova TROCA (com o "_tingido" da aparência; o busto costurado é `busto_<tamanho>`)
export const TROCADAS = /^(neck|Trapezius|Shoulder|Upper_Torso|Lower_Torso|hips|hips_02|arm|Forearm|thigh|shin)(_tingido)?$|^busto_/;
// os ossos do corpo que ela cobre (um triângulo CRIADO na aba Modelo preso a um deles também é trocado)
export const OSSOS_DO_CORPO = /^(Hips|Spine\d*|Neck|Collar[LR]|Arm[LR]|Elbow[LR]|Thigh[lr]|Shin[lr])$/;

const V3 = THREE.Vector3;
const CELULA = 6;   // cm: o lado das células da grade de busca da pele de baixo
const X = new V3(1, 0, 0), Y = new V3(0, 1, 0), Z = new V3(0, 0, 1);

// ------------------------------------------------------------ a pele de baixo (os triângulos trocados)
class Fonte {
  // (`ctx`: o da modelagem da malha de baixo — `antes`, onde cada vértice estava no MODELO, e `origem`; sem ele, null)
  constructor(geo, tris, ctx = null) {
    this.A = ctx?.antes ?? null; this.O = ctx?.origem ?? null;
    const a = geo.attributes;
    this.P = a.position.array; this.uv = a.uv ?? null; this.cor = a.color ?? null; this.si = a.skinIndex; this.sw = a.skinWeight;
    // (os cortados da aba Modelo são pontos: área zero, o raio não os acha)
    this.tris = tris;
    const n = tris.length, P = this.P;
    this.min = new Float32Array(n * 3); this.max = new Float32Array(n * 3);
    tris.forEach((t, j) => {
      for (let k = 0; k < 3; k++) {
        const a0 = P[t * 9 + k], a1 = P[t * 9 + 3 + k], a2 = P[t * 9 + 6 + k];
        this.min[j * 3 + k] = Math.min(a0, a1, a2); this.max[j * 3 + k] = Math.max(a0, a1, a2);
      }
    });
  }
  /** os triângulos que o PLANO (ponto c, normal n) corta, até R cm do ponto */
  fatia(c, n, R) {
    const P = this.P, l = [];
    for (const j of this.pertoJ(c, R)) {
      const t = this.tris[j];
      let mn = Infinity, mx = -Infinity;
      for (let k = 0; k < 3; k++) { const i = t * 9 + k * 3, d = (P[i] - c.x) * n.x + (P[i + 1] - c.y) * n.y + (P[i + 2] - c.z) * n.z; mn = Math.min(mn, d); mx = Math.max(mx, d); }
      if (mn <= 0.01 && mx >= -0.01) l.push(t);
    }
    return l;
  }
  /** há ROUPA (UV fora da faixa de pele) num triângulo até R cm do ponto? */
  roupaPerto(c, R) {
    if (!this.roupa) this.roupa = this.tris.map((t) => !this.ehPele({ t, u: 1 / 3, v: 1 / 3 }));
    return this.pertoJ(c, R).some((j) => this.roupa[j]);
  }
  /** os triângulos até R cm do ponto */
  perto(c, R) { return this.pertoJ(c, R).map((j) => this.tris[j]); }
  // (pela GRADE de células de `CELULA` cm: cada triângulo está nas células que a caixa dele toca — a busca olha só as do
  // raio, não a pele toda: a pele nova saía ~130 ms mais lenta por corpo)
  pertoJ(c, R) {
    if (!this.grade) {
      this.grade = new Map(); this.visto = new Uint32Array(this.tris.length); this.vez = 0;
      const mn = this.min, mx = this.max, q = (x) => Math.floor(x / CELULA);
      this.tris.forEach((t, j) => {
        for (let x = q(mn[j * 3]); x <= q(mx[j * 3]); x++) for (let y = q(mn[j * 3 + 1]); y <= q(mx[j * 3 + 1]); y++) for (let z = q(mn[j * 3 + 2]); z <= q(mx[j * 3 + 2]); z++) {
          const k = `${x},${y},${z}`, l = this.grade.get(k);
          if (l) l.push(j); else this.grade.set(k, [j]);
        }
      });
    }
    const q = (x) => Math.floor(x / CELULA), l = [], vez = ++this.vez;
    for (let x = q(c.x - R); x <= q(c.x + R); x++) for (let y = q(c.y - R); y <= q(c.y + R); y++) for (let z = q(c.z - R); z <= q(c.z + R); z++) {
      const cel = this.grade.get(`${x},${y},${z}`);
      if (cel) for (const j of cel) if (this.visto[j] !== vez) { this.visto[j] = vez; if (!this.longe(j, c, R)) l.push(j); }
    }
    return l;
  }
  longe(j, c, R) {
    const mn = this.min, mx = this.max;
    const dx = Math.max(mn[j * 3] - c.x, 0, c.x - mx[j * 3]), dy = Math.max(mn[j * 3 + 1] - c.y, 0, c.y - mx[j * 3 + 1]), dz = Math.max(mn[j * 3 + 2] - c.z, 0, c.z - mx[j * 3 + 2]);
    return dx * dx + dy * dy + dz * dz > R * R;
  }
  /** o raio (o, d unitário) contra um triângulo (Möller–Trumbore): { t, dist, u, v } ou null */
  cruzar(o, d, t) {
    const P = this.P, i = t * 9;
    const ax = P[i], ay = P[i + 1], az = P[i + 2];
    const e1x = P[i + 3] - ax, e1y = P[i + 4] - ay, e1z = P[i + 5] - az, e2x = P[i + 6] - ax, e2y = P[i + 7] - ay, e2z = P[i + 8] - az;
    const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-9) return null;
    const inv = 1 / det, sx = o.x - ax, sy = o.y - ay, sz = o.z - az;
    const u = (sx * px + sy * py + sz * pz) * inv;
    if (u < 0 || u > 1) return null;
    const qx = sy * e1z - sz * e1y, qy = sz * e1x - sx * e1z, qz = sx * e1y - sy * e1x;
    const v = (d.x * qx + d.y * qy + d.z * qz) * inv;
    if (v < 0 || u + v > 1) return null;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return dist > 1e-3 ? { t, dist, u, v } : null;
  }
  /**
   * Onde o raio acha a pele: o primeiro encontro e, até `janela` cm depois dele, o de FORA (a camada de cima); empate
   * (a mesma posição: o quadril duas vezes) fica com o que NÃO é pele — a roupa por cima. `R`: até onde procurar.
   */
  amostra(o, d, cand, R, janela = PELE.janela) {
    const hits = [];
    for (const t of cand) { const h = this.cruzar(o, d, t); if (h && h.dist <= R) hits.push(h); }
    if (!hits.length) return null;
    hits.sort((a, b) => a.dist - b.dist);
    // as SAÍDAS em seguida (a normal da face a favor do raio: a casca de uma peça, e a de outra por cima dela, até
    // `janela` cm uma da outra): vale a de FORA. Uma ENTRADA depois de uma saída é outra parte do corpo (a outra perna,
    // o braço): para ali. Encontros no mesmo lugar (o quadril duas vezes; o criado, que tem as duas faces) são um só —
    // e, sendo um deles roupa, vale a roupa
    let m = null;
    for (let i = 0; i < hits.length;) {
      let j = i;
      while (j < hits.length && hits[j].dist - hits[i].dist <= 0.05) j++;
      const saidas = hits.slice(i, j).filter((h) => this.saindo(h, d));
      if (m && hits[i].dist - m.dist > janela) break;
      if (!saidas.length) { if (m) break; i = j; continue; }
      m = saidas.find((h) => !this.ehPele(h)) ?? saidas[0];
      i = j;
    }
    if (!m) return null;
    m.p = o.clone().addScaledVector(d, m.dist);
    return m;
  }
  /** o primeiro encontro, qualquer que seja (o raio que começa FORA do corpo: o gancho, de baixo) */
  primeiro(o, d, cand, R) {
    let m = null;
    for (const t of cand) { const h = this.cruzar(o, d, t); if (h && h.dist <= R && (!m || h.dist < m.dist)) m = h; }
    if (m) m.p = o.clone().addScaledVector(d, m.dist);
    return m;
  }
  // a face do triângulo olha para onde o raio vai (o raio está SAINDO da casca)
  saindo(h, d) {
    const P = this.P, i = h.t * 9;
    const e1x = P[i + 3] - P[i], e1y = P[i + 4] - P[i + 1], e1z = P[i + 5] - P[i + 2], e2x = P[i + 6] - P[i], e2y = P[i + 7] - P[i + 1], e2z = P[i + 8] - P[i + 2];
    return (e1y * e2z - e1z * e2y) * d.x + (e1z * e2x - e1x * e2z) * d.y + (e1x * e2y - e1y * e2x) * d.z > 0;
  }
  // os pesos dos três cantos do triângulo do encontro, pelo lugar dentro dele
  bari(h) { return [1 - h.u - h.v, h.u, h.v]; }
  ehPele(h) { if (!this.uv) return true; const [u, v] = this.uvDe(h); return naPele(u, v); }
  uvDe(h) {
    const b = this.bari(h), A = this.uv.array, s = this.uv.itemSize, r = [0, 0];
    for (let k = 0; k < 3; k++) for (let j = 0; j < 2; j++) r[j] += A[(h.t * 3 + k) * s + j] * b[k];
    return r;
  }
  corDe(h) {
    const b = this.bari(h), A = this.cor.array, s = this.cor.itemSize, r = new Array(s).fill(0);
    for (let k = 0; k < 3; k++) for (let j = 0; j < s; j++) r[j] += A[(h.t * 3 + k) * s + j] * b[k];
    return r;
  }
  /** onde o ponto estava no MODELO (antes da raça e das edições): pelo lugar dele no triângulo da malha de baixo */
  antesDe(h) {
    const b = this.bari(h), A = this.A, r = new V3();
    for (let k = 0; k < 3; k++) { const i = (h.t * 3 + k) * 3; r.x += A[i] * b[k]; r.y += A[i + 1] * b[k]; r.z += A[i + 2] * b[k]; }
    return r;
  }
  /** os ossos e os pesos no ponto: Map osso → peso */
  pesos(h) {
    const b = this.bari(h), m = new Map(), I = this.si.array, W = this.sw.array, s = this.si.itemSize;
    for (let k = 0; k < 3; k++) for (let j = 0; j < s; j++) {
      const w = W[(h.t * 3 + k) * s + j] * b[k];
      if (w > 1e-5) { const o = I[(h.t * 3 + k) * s + j]; m.set(o, (m.get(o) ?? 0) + w); }
    }
    return m;
  }
}

// ------------------------------------------------------------ o casco convexo (das direções, todas na esfera)
/** O casco convexo de pontos (incremental): as faces [i, j, k], viradas para fora. Ponto que cai na face (os da esfera, quase no plano) entra nela. */
function casco(pts) {
  const n = pts.length;
  if (n < 4) return [];
  const faces = [], arestas = new Map();
  const chave = (a, b) => `${a},${b}`;
  const plano = (a, b, c) => { const nn = new V3().subVectors(pts[b], pts[a]).cross(new V3().subVectors(pts[c], pts[a])).normalize(); return { n: nn, d: nn.dot(pts[a]) }; };
  const acrescentar = (a, b, c) => { const f = { v: [a, b, c], ...plano(a, b, c), viva: true }; faces.push(f); const i = faces.length - 1; arestas.set(chave(a, b), i); arestas.set(chave(b, c), i); arestas.set(chave(c, a), i); return f; };
  // o tetraedro de partida: os mais afastados
  let i0 = 0, i1 = 0, i2 = 0, i3 = 0, m = -1;
  for (let i = 1; i < n; i++) { const d = pts[i].distanceToSquared(pts[i0]); if (d > m) { m = d; i1 = i; } }
  m = -1;
  const linha = new V3().subVectors(pts[i1], pts[i0]).normalize();
  for (let i = 0; i < n; i++) { const v = new V3().subVectors(pts[i], pts[i0]); const d = v.addScaledVector(linha, -v.dot(linha)).lengthSq(); if (d > m) { m = d; i2 = i; } }
  m = -1;
  const p0 = plano(i0, i1, i2);
  for (let i = 0; i < n; i++) { const d = Math.abs(p0.n.dot(pts[i]) - p0.d); if (d > m) { m = d; i3 = i; } }
  if (p0.n.dot(pts[i3]) - p0.d > 0) [i1, i2] = [i2, i1];   // (o quarto fica ATRÁS da primeira face)
  acrescentar(i0, i1, i2); acrescentar(i0, i3, i1); acrescentar(i1, i3, i2); acrescentar(i2, i3, i0);
  const feitos = new Set([i0, i1, i2, i3]);
  for (let p = 0; p < n; p++) {
    if (feitos.has(p)) continue;
    feitos.add(p);
    let vis = faces.filter((f) => f.viva && f.n.dot(pts[p]) - f.d > 1e-10);
    // (na esfera nenhum fica de fora; o que cai no plano de uma face — de um anel quase plano — entra NELA)
    if (!vis.length) { let melhor = null, mx = -Infinity; for (const f of faces) if (f.viva) { const s = f.n.dot(pts[p]) - f.d; if (s > mx) { mx = s; melhor = f; } } vis = [melhor]; }
    for (const f of vis) f.viva = false;
    // o horizonte: as arestas de uma face vista cuja vizinha não é vista
    const horizonte = [];
    for (const f of vis) for (let e = 0; e < 3; e++) {
      const a = f.v[e], b = f.v[(e + 1) % 3], viz = faces[arestas.get(chave(b, a))];
      if (!viz || viz.viva) horizonte.push([a, b]);
    }
    for (const [a, b] of horizonte) acrescentar(a, b, p);
  }
  return faces.filter((f) => f.viva).map((f) => f.v);
}

// ------------------------------------------------------------ a malha nova
class Malha {
  constructor(fonte) { this.f = fonte; this.v = []; this.faces = []; }
  /** um vértice: o ponto, os pesos, o encontro (a UV de reserva) e onde estava no MODELO (`a`: do encontro, ou dado) */
  vertice(p, h, w = h ? this.f.pesos(h) : new Map(), a = h && this.f.A ? this.f.antesDe(h) : null) { this.v.push({ p, h, w, a }); return this.v.length - 1; }
  /** o "antes" entre dois vértices (o ponto novo de um lado) */
  antesEntre(i, j, s) { const a = this.v[i].a, b = this.v[j].a; return a && b ? a.clone().lerp(b, s) : null; }
  /** uma face virada para fora de `dentro`; `de`: de onde sai o raio do meio dela (a UV e a cor) */
  // (`orientar` false: a ordem já vem certa — a do casco)
  face(a, b, c, dentro, de, orientar = true) {
    const A = this.v[a].p, B = this.v[b].p, C = this.v[c].p, n = new V3().subVectors(B, A).cross(new V3().subVectors(C, A));
    // (a face de área zero FICA: tirá-la deixava um lado de anel sem face — a malha abria ali)
    const meio = A.clone().add(B).add(C).multiplyScalar(1 / 3);
    this.faces.push({ v: orientar && n.lengthSq() > 1e-12 && n.dot(meio.clone().sub(dentro)) < 0 ? [a, c, b] : [a, b, c], dentro, de });
  }
}

/**
 * Um ANEL: `K` raios no plano (U, V) a partir de `c`, a fase em frações de volta. Recentra uma vez (o meio do que
 * achou, menos no eixo `trava`). Devolve { c, U, V, n, ids } ou null (pouco achado).
 */
function anel(M, c, U, V, K, R, trava = null, fase = 0) {
  const n = new V3().crossVectors(U, V).normalize();
  let cand = M.f.fatia(c, n, R), hits = null;
  for (let vez = 0; vez < 2; vez++) {
    hits = [];
    for (let k = 0; k < K; k++) {
      const a = ((k + fase) / K) * Math.PI * 2, d = U.clone().multiplyScalar(Math.cos(a)).addScaledVector(V, Math.sin(a));
      hits.push({ d, h: M.f.amostra(c, d, cand, R) });
    }
    const bons = hits.filter((x) => x.h);
    if (bons.length < K * 0.6) return null;
    if (vez) break;
    // recentra: o meio dos pontos achados (no plano)
    const m = bons.reduce((s, x) => s.add(x.h.p), new V3()).multiplyScalar(1 / bons.length);
    m.addScaledVector(n, -m.clone().sub(c).dot(n));
    if (trava) m.setComponent(trava, c.getComponent(trava));
    c = m;
    cand = M.f.fatia(c, n, R);
  }
  // o raio que não achou nada (um buraco de corte): a distância dos vizinhos achados
  const dist = hits.map((x) => x.h?.dist ?? null);
  const ids = hits.map((x, k) => {
    if (x.h) return M.vertice(x.h.p, x.h);
    let a = k, b = k;
    do a = (a + K - 1) % K; while (dist[a] === null);
    do b = (b + 1) % K; while (dist[b] === null);
    const r = (dist[a] + dist[b]) / 2, viz = hits[a].h;
    return M.vertice(c.clone().addScaledVector(x.d, r), viz, M.f.pesos(viz));
  });
  return { c, U, V, n, ids, K };
}

/**
 * O tubo que parou ANTES de onde devia (a pele dali foi cortada na aba Modelo: a canela escondida no pé) ganha um anel
 * a mais — o último, levado até `alvo` no `eixo` (dentro do pé, da mão): a boca da peça de lá fica coberta.
 */
function estender(M, aneis, eixo, alvo) {
  const u = aneis[aneis.length - 1];
  if (!u || Math.abs(u.c.getComponent(eixo) - alvo) < 0.5) return aneis;
  const passo = new V3().setComponent(eixo, alvo - u.c.getComponent(eixo));
  const ids = u.ids.map((id) => { const x = M.v[id], p = x.p.clone().sub(u.c).multiplyScalar(0.94).add(u.c).add(passo); return M.vertice(p, x.h, new Map(x.w)); });
  return [...aneis, { ...u, c: u.c.clone().add(passo), ids }];
}
/** os quads entre anéis seguidos (o mesmo K): a UV/cor de cada um pelo raio do meio dos dois centros ao meio dele */
function tubo(M, aneis) {
  for (let i = 0; i + 1 < aneis.length; i++) {
    const A = aneis[i], B = aneis[i + 1], dentro = A.c.clone().add(B.c).multiplyScalar(0.5);
    for (let k = 0; k < A.K; k++) {
      const a = A.ids[k], b = A.ids[(k + 1) % A.K], c = B.ids[(k + 1) % B.K], d = B.ids[k];
      M.face(a, b, c, dentro, dentro); M.face(a, c, d, dentro, dentro);
    }
  }
}

// a direção de cada ponto de um anel, vista de C (unitária)
const direcoes = (M, anel, C) => anel.ids.map((id) => M.v[id].p.clone().sub(C).normalize());
/** A folga entre os anéis de uma junção vista de C (graus): o menor afastamento de um ponto de um anel do "chapéu" de outro. */
function folgaDaJuncao(M, aneis, C) {
  const ds = aneis.map((a) => direcoes(M, a, C)), meios = ds.map((l) => l.reduce((s, d) => s.add(d), new V3()).normalize());
  const raios = ds.map((l, i) => Math.max(...l.map((d) => d.angleTo(meios[i]))));
  let folga = Infinity;
  for (let i = 0; i < aneis.length; i++) for (let j = 0; j < aneis.length; j++) if (i !== j) for (const d of ds[j]) folga = Math.min(folga, d.angleTo(meios[i]) - raios[i]);
  return (folga * 180) / Math.PI;
}
// quantos pontos de um anel caem na BOCA de outro, vistos de C (0 = a junção fecha)
function sobra(M, aneis, C) {
  let n = 0;
  aneis.forEach((a, i) => a.ids.forEach((id) => { const d = M.v[id].p.clone().sub(C).normalize(); if (aneis.some((b, j) => j !== i && naBoca(M, b, C, d))) n++; }));
  return n;
}
// o ponto dentro do polígono do anel (no plano dele)?
function dentroDoAnel(M, anel, p) {
  const q = (x) => { const v = x.clone().sub(anel.c); return [v.dot(anel.U), v.dot(anel.V)]; }, [px, py] = q(p), l = anel.ids.map((id) => q(M.v[id].p));
  let dentro = false;
  for (let i = 0, j = l.length - 1; i < l.length; j = i++) if ((l[i][1] > py) !== (l[j][1] > py) && px < ((l[j][0] - l[i][0]) * (py - l[i][1])) / (l[j][1] - l[i][1]) + l[i][0]) dentro = !dentro;
  return dentro;
}
// a direção d (vista de C) cai na BOCA de um anel (o miolo dele, por onde o tubo segue)?
function naBoca(M, a, C, d) {
  const den = d.dot(a.n);
  if (Math.abs(den) < 1e-6) return false;
  const t = a.c.clone().sub(C).dot(a.n) / den;
  return t > 0 && dentroDoAnel(M, a, C.clone().addScaledVector(d, t));
}
// o ponto já passou da boca do anel, para o lado do tubo (o lado do plano dele em que C não está)?
const alemDaBoca = (a, C, p) => Math.sign(p.clone().sub(a.c).dot(a.n)) !== Math.sign(C.clone().sub(a.c).dot(a.n));
/**
 * Uma JUNÇÃO: os anéis (cada um aberto para o lado de onde o tubo segue) e uma GRADE de pontos da pele entre eles —
 * cada direção vista de C (uma a cada `passo` radianos, pela espiral de ouro) que não cai na boca de um anel nem passa
 * dela acha a pele pelo raio de C — ligados pelo casco das direções, tirado o miolo de cada anel. Devolve as faces e
 * quantos ERROS a malha teria (lado de anel sem exatamente uma face, lado de dentro sem exatamente duas: 0 = fecha).
 * `giro`: a espiral girada (outra grade).
 */
function juncao(M, aneis, C, R, passo = 0.24, giro = 0) {
  const pts = [], quem = [], cand = M.f.perto(C, R);
  aneis.forEach((a, r) => a.ids.forEach((id, k) => { pts.push(M.v[id].p.clone().sub(C).normalize()); quem.push({ id, r, k }); }));
  const dosAneis = pts.slice(), N = Math.round((4 * Math.PI) / (passo * passo)), ouro = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), d = new V3(Math.cos(ouro * i + giro) * r, y, Math.sin(ouro * i + giro) * r);
    if (aneis.some((a) => naBoca(M, a, C, d)) || dosAneis.some((q) => q.angleTo(d) < passo * 0.55)) continue;
    const h = M.f.amostra(C, d, cand, R);
    if (!h || aneis.some((a) => alemDaBoca(a, C, h.p))) continue;
    pts.push(d); quem.push({ id: M.vertice(h.p, h), r: -1 });
  }
  const tris = [];
  for (const [i, j, k] of casco(pts)) {
    const a = quem[i], b = quem[j], c = quem[k];
    if (a.r >= 0 && a.r === b.r && b.r === c.r) {
      // o miolo do anel (por onde o tubo segue) sai; o triângulo que tapa um DENTE dele (uma reentrância) fica
      const meio = M.v[a.id].p.clone().add(M.v[b.id].p).add(M.v[c.id].p).multiplyScalar(1 / 3);
      if (dentroDoAnel(M, aneis[a.r], meio)) continue;
    }
    tris.push([a.id, b.id, c.id]);
  }
  // a conferência: cada lado de anel numa face só (do outro lado dele está o tubo), cada lado de dentro em duas
  const chave = (x, y) => (x < y ? `${x},${y}` : `${y},${x}`), doAnel = new Set(), uso = new Map();
  for (const a of aneis) a.ids.forEach((id, k) => doAnel.add(chave(id, a.ids[(k + 1) % a.K])));
  for (const [a, b, c] of tris) for (const [x, y] of [[a, b], [b, c], [c, a]]) { const k = chave(x, y); uso.set(k, (uso.get(k) ?? 0) + 1); }
  let erros = 0;
  for (const [k, n] of uso) if (n !== (doAnel.has(k) ? 1 : 2)) erros++;
  for (const k of doAnel) if (!uso.has(k)) erros++;
  return { tris, erros };
}
/**
 * A junção que FECHA: tenta o meio um pouco mais acima, abaixo, à frente, atrás e outras grades até a malha fechar sem
 * erro (ou fica com a de menos erros) e só então põe as faces (os pontos de grade das outras tentativas ficam sem uso).
 */
const TENTATIVAS = [[0, 0, 0.24, 0], [0, 0, 0.24, 0.9], [1.2, 0, 0.24, 0], [-1.2, 0, 0.24, 0], [0, 1.2, 0.24, 0], [0, -1.2, 0.24, 0], [0, 0, 0.21, 0], [0, 0, 0.27, 0],
  [1.2, 1.2, 0.22, 0.4], [-1.2, -1.2, 0.26, 0.4], [2.4, 0, 0.24, 1.7], [-2.4, 0, 0.24, 1.7], [0, 2.4, 0.2, 2.3], [0, -2.4, 0.28, 2.3]];
function juncaoFirme(M, aneis, C0, R) {
  let melhor = null;
  for (const [dy, dz, passo, giro] of TENTATIVAS) {
    const C = C0.clone().add(new V3(0, dy, dz)), r = juncao(M, aneis, C, R, passo * (PELE.passoJuncao / 0.24), giro);
    if (!melhor || r.erros < melhor.erros) melhor = { ...r, C };
    if (!r.erros) break;
  }
  for (const [a, b, c] of melhor.tris) M.face(a, b, c, melhor.C, melhor.C, false);
  return melhor.erros;
}

/**
 * O QUADRIL como uma CALÇA (a topologia de sempre): os três anéis são horizontais e têm os pontos nos mesmos ângulos
 * (0 = a frente, 90° = +x), então a metade +x do anel do tronco (frente, lado, costas) se costura à metade de FORA da
 * perna +x, a outra metade à da outra perna, e a VIRILHA é uma ponte de quads entre os lados de DENTRO das duas pernas,
 * com uma fileira do meio assentada na pele (o raio do meio da pélvis até ela); um triângulo no púbis e um atrás fecham.
 * Cada lado de anel fica numa face só, por construção. (K do tronco e das pernas: pares.)
 */
function calca(M, T, E, D, C, cand) {
  const kt = T.K / 2, kp = E.K / 2;
  // a tira entre duas linhas de pontos (de tamanhos quaisquer): avança na que está atrás
  const ziper = (A, B) => {
    for (let i = 0, j = 0; i < A.length - 1 || j < B.length - 1;) {
      if (j >= B.length - 1 || (i < A.length - 1 && (i + 1) / (A.length - 1) <= (j + 1) / (B.length - 1))) { M.face(A[i], A[i + 1], B[j], C, C); i++; }
      else { M.face(A[i], B[j + 1], B[j], C, C); j++; }
    }
  };
  const K = E.K, anelT = (i) => T.ids[i % T.K], deE = (i) => E.ids[i % K], deD = (i) => D.ids[i % K];
  // os lados: o tronco da frente às costas pelo +x com a perna +x do lado de DENTRO da frente, por fora, até o de dentro
  // de trás; das costas à frente pelo −x com a outra perna do mesmo jeito
  ziper(Array.from({ length: kt + 1 }, (_, i) => anelT(i)), [deE(K - 1), ...Array.from({ length: kp + 2 }, (_, i) => deE(i))]);
  ziper(Array.from({ length: kt + 1 }, (_, i) => anelT(kt + i)), [deD(kp - 1), ...Array.from({ length: kp + 1 }, (_, i) => deD(kp + i)), deD(1)]);
  // a virilha: só os pontos de DENTRO de cada perna, da frente às costas, e a fileira do meio (na pele, entre as duas)
  const dentroE = Array.from({ length: kp - 1 }, (_, i) => deE(K - 1 - i)), dentroD = Array.from({ length: kp - 1 }, (_, i) => deD(1 + i));
  const meio = dentroE.map((a, i) => {
    const b = dentroD[i], p = M.v[a].p.clone().add(M.v[b].p).multiplyScalar(0.5), d = p.clone().sub(C), r = d.length();
    const h = M.f.amostra(C, d.normalize(), cand, r * 2 + 4), w = new Map();
    for (const x of [a, b]) for (const [o, q] of M.v[x].w) w.set(o, (w.get(o) ?? 0) + q / 2);
    return h && h.dist < r * 2 ? M.vertice(h.p, h) : M.vertice(p, M.v[a].h, w, M.antesEntre(a, b, 0.5));
  });
  ziper(dentroE, meio); ziper(meio, dentroD);
  // o púbis (o tronco da frente, o de dentro das duas pernas e o meio) e o de trás
  const u = kp - 2;
  M.face(anelT(0), dentroE[0], meio[0], C, C); M.face(anelT(0), meio[0], dentroD[0], C, C);
  M.face(anelT(kt), meio[u], dentroE[u], C, C); M.face(anelT(kt), dentroD[u], meio[u], C, C);
}

// as estações de um tubo de `de` a `ate` (o passo; as `fixas` — as juntas — entram com ±`perto`, e as do passo perto delas saem)
function estacoes(de, ate, passo, fixas = [], perto = 2.5) {
  const n = Math.max(1, Math.round(Math.abs(ate - de) / passo)), l = [];
  for (let i = 0; i <= n; i++) l.push(de + ((ate - de) * i) / n);
  const dentro = (x) => (de < ate ? x > de + 1 && x < ate - 1 : x < de - 1 && x > ate + 1);
  const f = fixas.flatMap((x) => [x - perto, x, x + perto]).filter(dentro);
  const todas = [...l.filter((x, i) => i === 0 || i === n || !f.some((y) => Math.abs(y - x) < perto * 0.8)), ...f];
  return todas.sort((a, b) => (de < ate ? a - b : b - a));
}
// o ponto de uma linha de juntas na altura (ou no x) dado: por trechos
function naLinha(linha, eixo, valor) {
  for (let i = 0; i + 1 < linha.length; i++) {
    const a = linha[i], b = linha[i + 1], va = a.getComponent(eixo), vb = b.getComponent(eixo);
    if ((valor - va) * (valor - vb) <= 0 && va !== vb) return a.clone().lerp(b, (valor - va) / (vb - va));
  }
  const fim = Math.abs(valor - linha[0].getComponent(eixo)) < Math.abs(valor - linha[linha.length - 1].getComponent(eixo)) ? linha[0] : linha[linha.length - 1];
  return fim.clone().setComponent(eixo, valor);
}

/**
 * A pele nova de uma malha fundida (não indexada): `trocar[t]` = 1 nos triângulos da pele que ela substitui;
 * `junta(nome)`: onde está um osso (cm, como a raça o deixou); `faixa(nome)`: os vértices [de, até] de uma peça
 * (as mãos, os pés, a cabeça: onde os tubos acabam). Devolve { geo, removidos(v): quantos vértices tirados antes de v,
 * info } — ou null (a forma não deu: fica a de antes).
 */
export function peleNova(geo, { trocar, junta, faixa, ctx = null }) {
  const nt = geo.attributes.position.count / 3, tris = [];
  for (let t = 0; t < nt; t++) if (trocar[t]) tris.push(t);
  if (tris.length < 50) return null;
  const relogio = [performance.now()], marca = () => relogio.push(performance.now());
  const M = new Malha(new Fonte(geo, tris, ctx)), P = geo.attributes.position.array;
  const J = (n) => junta(n);
  const quadril = J('Hips'), pescoco = J('Neck'), cabeca = J('Head');
  // os pontos extremos de uma peça (para onde o tubo vai)
  const extremo = (nome, eixo, lado, maior) => {
    const f = faixa(nome);
    if (!f) return null;
    let r = maior ? -Infinity : Infinity;
    for (let v = f[0]; v < f[1]; v++) { const x = P[v * 3 + eixo]; if (lado && Math.sign(P[v * 3]) !== lado) continue; r = maior ? Math.max(r, x) : Math.min(r, x); }
    return Number.isFinite(r) ? r : null;
  };
  const tudo = M.f.tris;
  marca();
  // A ROUPA (o top, a calcinha: a pele com a UV fora da faixa de pele): a fração dos raios de um anel que a acham, e as
  // ALTURAS em que ela começa ou acaba (onde a fração passa de meio) — um anel ali, e a borda da roupa corre por ele
  const roupa = (c, U, V, K = 12, R = 32) => {
    const cand = M.f.fatia(c, new V3().crossVectors(U, V).normalize(), R);
    let r = 0, n = 0;
    for (let k = 0; k < K; k++) { const a = (k / K) * Math.PI * 2, h = M.f.amostra(c, U.clone().multiplyScalar(Math.cos(a)).addScaledVector(V, Math.sin(a)), cand, R); if (h) { n++; if (!M.f.ehPele(h)) r++; } }
    return n ? r / n : 0;
  };
  const bordas = (centro, de, ate, U, V, R) => {
    const l = [], passo = de < ate ? 0.5 : -0.5;
    let antes = null;
    for (let y = de; passo > 0 ? y <= ate : y >= ate; y += passo) {
      const f = roupa(centro(y), U, V, 12, R);
      if (antes && (antes.f - 0.5) * (f - 0.5) < 0) l.push(antes.y + ((y - antes.y) * (0.5 - antes.f)) / (f - antes.f));
      antes = { y, f };
    }
    return l;
  };
  // as estações com as bordas da roupa no lugar das do passo que caem perto delas
  const comBordas = (ys, l) => [...ys.filter((y) => !l.some((b) => Math.abs(b - y) < 1.4)), ...l].sort((a, b) => a - b);
  // ---- as PERNAS: do alto da coxa até dentro do pé
  const zQ = quadril.z;
  // o gancho: um raio de baixo para cima no meio, entre as pernas
  const gancho = M.f.primeiro(new V3(0, quadril.y - 40, zQ), Y, tudo, 60)?.p.y ?? quadril.y - 4;
  const fimDaPerna = (extremo('shin', 1, 0, false) ?? J('Footl').y) + 1.2;   // (dentro do pé: a canela do modelo desce até ali)
  const linhaDaPerna = (s) => { const L = s > 0 ? 'l' : 'r'; return [J(`Thigh${L}`), J(`Shin${L}`), J(`Foot${L}`)]; };
  const doTronco = (y) => naLinha(['Hips', 'Spine003', 'Spine002', 'Spine001', 'Spine', 'Neck'].map(J), 1, y).setX(0).setY(y);
  // o alto da coxa e a base do tronco: logo abaixo e logo acima do GANCHO (a calça, `calca`, os costura; as nádegas e o
  // alto das coxas são dos tubos, de anéis)
  const melhorMeio = (aneis, y0, y1, z) => {
    let melhor = null;
    for (let i = 0; i <= 24; i++) {
      const C = new V3(0, y0 + ((y1 - y0) * i) / 24, z), s = sobra(M, aneis, C), f = folgaDaJuncao(M, aneis, C);
      if (!melhor || s < melhor.sobra || (s === melhor.sobra && f > melhor.folga)) melhor = { C, sobra: s, folga: f };
    }
    return melhor;
  };
  const baseDoTronco = anel(M, doTronco(gancho + 2.5), Z, X, PELE.tronco, 32, 0), topoDaCoxa = gancho - 2.5;
  const topos = [1, -1].map((s) => anel(M, naLinha(linhaDaPerna(s), 1, topoDaCoxa).setY(topoDaCoxa), Z, X, PELE.pernas, 30, 1));
  if (!baseDoTronco || topos.some((a) => !a)) return null;
  const pernas = [1, -1].map((s, i) => {
    const linha = linhaDaPerna(s), alturas = estacoes(topoDaCoxa, fimDaPerna, PELE.passoPernas, [linha[1].y]);
    const aneis = estender(M, [topos[i], ...alturas.slice(1).map((y) => anel(M, naLinha(linha, 1, y).setY(y), Z, X, PELE.pernas, 30, 1)).filter(Boolean)], 1, fimDaPerna);
    tubo(M, aneis);
    return aneis;
  });
  marca();
  // ---- os BRAÇOS: do ombro até dentro da mão
  const bracos = [1, -1].map((s) => {
    const L = s > 0 ? 'L' : 'R', linha = [J(`Arm${L}`), J(`Elbow${L}`), J(`Hand${L}`)];
    const mao = extremo('Hand', 0, s, s < 0) ?? linha[2].x - s * 3;
    const xs = estacoes(linha[0].x + s * 3, mao + s * 1.5, PELE.passoBracos, [linha[1].x]);
    const aneis = estender(M, xs.map((x) => anel(M, naLinha(linha, 0, x).setX(x), Z, Y, PELE.bracos, 20, 0, 0.5)).filter(Boolean), 0, xs[xs.length - 1]);
    tubo(M, aneis);
    return aneis;
  });
  // ---- o TRONCO: do quadril até debaixo do braço (o sovaco: de DENTRO do primeiro anel do braço, para baixo)
  const sovaco = Math.min(...bracos.map((l) => { const b = l[0]; return M.f.amostra(b.c, Y.clone().negate(), M.f.fatia(b.c, X, 20), 20, 0)?.p.y ?? b.c.y - 6; }));
  const deTronco = baseDoTronco.c.y, ateTronco = sovaco - 2.5;
  // (na faixa do busto — a do modelo, a raça mexe pouco nela — os anéis mais juntos; e um anel em cada borda da roupa)
  let ys = [];
  for (let y = deTronco; y < ateTronco - 1; y += y > 119 && y < 137 ? PELE.passoBusto : PELE.passoTronco) ys.push(y);
  ys.push(ateTronco);
  ys = comBordas(ys, bordas(doTronco, deTronco + 1, ateTronco - 1, Z, X, 32));
  const tronco = [baseDoTronco, ...ys.slice(1).map((y) => anel(M, doTronco(y), Z, X, PELE.tronco, 32, 0)).filter(Boolean)];
  tubo(M, tronco);
  // ---- o PESCOÇO: de cima dos ombros até dentro da cabeça
  const topoDoBraco = Math.max(...bracos.map((l) => Math.max(...l[0].ids.map((id) => M.v[id].p.y))));
  const cabecaBaixo = extremo('head', 1, 0, false) ?? cabeca.y;
  const linhaPescoco = [pescoco, cabeca];
  const yp = estacoes(topoDoBraco + 2, cabecaBaixo + 1, PELE.passoPescoco);
  const colo = estender(M, yp.map((y) => anel(M, naLinha(linhaPescoco, 1, y).setX(0).setY(y), Z, X, PELE.pescoco, 14, 0)).filter(Boolean), 1, yp[yp.length - 1]);
  tubo(M, colo);
  if (pernas.some((l) => l.length < 2) || bracos.some((l) => l.length < 2) || tronco.length < 2 || colo.length < 2) return null;
  marca();
  // ---- as JUNÇÕES: o meio de cada uma onde nenhuma boca cai na outra e os anéis ficam mais separados (vistos dele)
  const dosOmbros = [tronco[tronco.length - 1], bracos[0][0], bracos[1][0], colo[0]];
  const mo = melhorMeio(dosOmbros, tronco[tronco.length - 1].c.y, colo[0].c.y, J('Spine').z);
  const meioDoQuadril = new V3(0, gancho + 1, zQ);
  calca(M, tronco[0], pernas[0][0], pernas[1][0], meioDoQuadril, M.f.perto(meioDoQuadril, 30));
  const tortosOmbros = juncaoFirme(M, dosOmbros, mo.C, 30), tortos = tortosOmbros;
  marca();
  // ---- os PESOS alisados pela malha (as emendas das peças viram rampas), e no máximo 4 ossos por vértice
  const viz = M.v.map(() => new Set());
  for (const f of M.faces) for (let e = 0; e < 3; e++) { viz[f.v[e]].add(f.v[(e + 1) % 3]); viz[f.v[(e + 1) % 3]].add(f.v[e]); }
  for (let vez = 0; vez < PELE.suavizar; vez++) {
    const novos = M.v.map((x, i) => {
      const w = new Map();
      for (const [o, p] of x.w) w.set(o, p * 0.5);
      const n = viz[i].size;
      for (const j of viz[i]) for (const [o, p] of M.v[j].w) w.set(o, (w.get(o) ?? 0) + (p * 0.5) / n);
      return w;
    });
    M.v.forEach((x, i) => { x.w = novos[i]; });
  }
  marca();
  // ---- os DETALHES FINOS da roupa (as alças, menos largas que uma face): a face de cantos todos iguais (pele ou roupa) com
  // um ponto de DENTRO da outra é dividida em quatro — no meio de cada lado —, e a vizinha que ganhou um ponto num lado se divide também (dois ou três pedaços: não abre fresta)
  const classe = (i) => (M.v[i].h && !M.f.ehPele(M.v[i].h) ? 1 : 0);
  const chaveL = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const naFace = (f, b) => { const p = new V3(); f.v.forEach((i, k) => p.addScaledVector(M.v[i].p, b[k])); return p; };
  const classeEm = (de, p) => { const d = p.clone().sub(de), r = d.length(); const h = r > 1e-4 ? M.f.amostra(de, d.normalize(), M.f.perto(p, 6), r + 6) : null; return h ? { h, k: M.f.ehPele(h) ? 0 : 1, r } : null; };
  for (let nivel = 0; nivel < PELE.detalhe; nivel++) {
    const meios = new Map(), lados = new Map();
    for (const f of M.faces) {
      const cl = f.v.map(classe);
      if (cl[0] !== cl[1] || cl[1] !== cl[2]) continue;
      // (só onde há roupa na pele de baixo, perto da face: nas pernas e nos braços nus não se olha nada)
      const meioF = naFace(f, [1 / 3, 1 / 3, 1 / 3]);
      if (!M.f.roupaPerto(meioF, Math.max(...f.v.map((i) => M.v[i].p.distanceTo(meioF))) + 1)) continue;
      // (o meio, e cinco pontos ao longo de cada LADO — uma alça que atravessa a face cruza dois lados dela —, cada lado olhado uma vez)
      const noLado = (a, b) => { const k = chaveL(a, b); if (!lados.has(k)) lados.set(k, [1, 2, 3, 4, 5].some((i) => { const x = classeEm(f.de, M.v[a].p.clone().lerp(M.v[b].p, i / 6)); return x && x.k !== cl[0]; })); return lados.get(k); };
      const fino = [0, 1, 2].some((e) => noLado(f.v[e], f.v[(e + 1) % 3])) || (() => { const x = classeEm(f.de, naFace(f, [1 / 3, 1 / 3, 1 / 3])); return x && x.k !== cl[0]; })();
      if (!fino) continue;
      for (let e = 0; e < 3; e++) {
        const a = f.v[e], b = f.v[(e + 1) % 3], k = chaveL(a, b);
        if (meios.has(k)) continue;
        const p = M.v[a].p.clone().add(M.v[b].p).multiplyScalar(0.5), x = classeEm(f.de, p), w = new Map();
        for (const i of [a, b]) for (const [o, q] of M.v[i].w) w.set(o, (w.get(o) ?? 0) + q / 2);
        // (o ponto fica na RETA do lado: a forma é a dos anéis; o raio só diz se ali é pele ou roupa — a alça é uma fita
        // levantada da pele, e o ponto assentado nela fazia um degrau)
        meios.set(k, M.vertice(p, x?.h ?? M.v[a].h, w, M.antesEntre(a, b, 0.5)));
      }
    }
    if (!meios.size) break;
    const novas = [];
    for (const f of M.faces) {
      const [a, b, c] = f.v, ab = meios.get(chaveL(a, b)), bc = meios.get(chaveL(b, c)), ca = meios.get(chaveL(c, a));
      const s = (x) => ({ v: x, dentro: f.dentro, de: f.de });
      if (ab !== undefined && bc !== undefined && ca !== undefined) novas.push(s([a, ab, ca]), s([ab, b, bc]), s([ca, bc, c]), s([ab, bc, ca]));
      else if (ab === undefined && bc === undefined && ca === undefined) novas.push(f);
      else {
        // (um ou dois lados com ponto: o leque a partir do primeiro canto que vem depois de um ponto)
        const poli = [];
        for (const [x, m] of [[a, ab], [b, bc], [c, ca]]) { poli.push(x); if (m !== undefined) poli.push(m); }
        const i0 = poli.findIndex((x, i) => i > 0 && [ab, bc, ca].includes(poli[i - 1]) ) - 1, ini = Math.max(0, i0);
        const roda = [...poli.slice(ini), ...poli.slice(0, ini)];
        for (let i = 1; i + 1 < roda.length; i++) novas.push(s([roda[0], roda[i], roda[i + 1]]));
      }
    }
    M.faces = novas;
  }
  // ---- a BORDA DA ROUPA: cada vértice é pele ou roupa (o ponto em que caiu); a face que tem os dois é CORTADA onde a roupa
  // começa — em cada lado dela, o ponto achado por raios (dividindo ao meio seis vezes), o MESMO para as duas faces do
  // lado (não abre fresta): a borda do top e da calcinha vira uma linha que segue a de verdade, sem serrilhar
  const cortes = new Map();
  const corte = (a, b, de) => {
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (!cortes.has(k)) {
      const [i, j] = a < b ? [a, b] : [b, a], A = M.v[i], B = M.v[j], ci = classe(i);
      const cand = M.f.perto(A.p.clone().add(B.p).multiplyScalar(0.5), A.p.distanceTo(B.p) + 6);
      let lo = 0, hi = 1;
      for (let vez = 0; vez < 6; vez++) {
        const m = (lo + hi) / 2, p = A.p.clone().lerp(B.p, m), d = p.clone().sub(de), r = d.length();
        const h = r > 1e-4 ? M.f.amostra(de, d.normalize(), cand, r + 6) : null;
        if ((h ? (M.f.ehPele(h) ? 0 : 1) : ci) === ci) lo = m; else hi = m;
      }
      const s = (lo + hi) / 2, w = new Map();
      for (const [o, p] of A.w) w.set(o, p * (1 - s));
      for (const [o, p] of B.w) w.set(o, (w.get(o) ?? 0) + p * s);
      cortes.set(k, M.vertice(A.p.clone().lerp(B.p, s), null, w, M.antesEntre(i, j, s)));
    }
    return cortes.get(k);
  };
  const finais = [];
  for (const f of M.faces) {
    const c = f.v.map(classe);
    if (c[0] === c[1] && c[1] === c[2]) { finais.push({ v: f.v, k: c[0], f }); continue; }
    // (o canto diferente primeiro: girar a face não muda a volta dela)
    const o = c[0] !== c[1] && c[0] !== c[2] ? 0 : c[1] !== c[0] && c[1] !== c[2] ? 1 : 2;
    const a = f.v[o], b = f.v[(o + 1) % 3], d = f.v[(o + 2) % 3], ab = corte(a, b, f.de), ad = corte(a, d, f.de);
    finais.push({ v: [a, ab, ad], k: c[o], f }, { v: [ab, b, d], k: 1 - c[o], f }, { v: [ab, d, ad], k: 1 - c[o], f });
  }
  // a UV e a cor de cada face: o ponto da pele no meio da face de onde ela veio, se é da mesma (pele ou roupa); senão, o de
  // um canto dela que é
  const amostraDe = (x) => {
    const f = x.f;
    if (f.h === undefined) {
      const meio = M.v[f.v[0]].p.clone().add(M.v[f.v[1]].p).add(M.v[f.v[2]].p).multiplyScalar(1 / 3), d = meio.clone().sub(f.de), r = d.length();
      f.h = r > 1e-4 ? M.f.amostra(f.de, d.normalize(), M.f.perto(meio, 10), r + 6) : null;
    }
    if (f.h && (M.f.ehPele(f.h) ? 0 : 1) === x.k) return f.h;
    for (const i of f.v) if (M.v[i].h && classe(i) === x.k) return M.v[i].h;
    return f.h ?? M.v[f.v[0]].h ?? M.v[f.v[1]].h ?? M.v[f.v[2]].h;
  };
  marca();
  // (conferência: os lados ABERTOS — numa face só: as bocas dos tubos nas mãos, nos pés e na cabeça — e os DOBRADOS, em mais de duas)
  const usoDosLados = new Map();
  for (const x of finais) for (let e = 0; e < 3; e++) { const a = x.v[e], b = x.v[(e + 1) % 3], k = a < b ? `${a},${b}` : `${b},${a}`; usoDosLados.set(k, (usoDosLados.get(k) ?? 0) + 1); }
  let abertos = 0, dobrados = 0;
  for (const n of usoDosLados.values()) { if (n === 1) abertos++; else if (n > 2) dobrados++; }
  // ---- a malha final: os triângulos que ficam, na ordem, e a pele nova no fim
  const fica = [];
  for (let t = 0; t < nt; t++) if (!trocar[t]) fica.push(t);
  const nf = finais.length, total = (fica.length + nf) * 3, g = new THREE.BufferGeometry();
  const quatro = (w) => { const l = [...w].sort((a, b) => b[1] - a[1]).slice(0, 4), s = l.reduce((x, [, p]) => x + p, 0) || 1; while (l.length < 4) l.push([0, 0]); return l.map(([o, p]) => [o, p / s]); };
  const pesos4 = M.v.map((x) => quatro(x.w)), amostras = finais.map(amostraDe);
  for (const [nome, at] of Object.entries(geo.attributes)) {
    const s = at.itemSize, arr = new at.array.constructor(total * s);
    fica.forEach((t, j) => arr.set(at.array.subarray(t * 3 * s, (t * 3 + 3) * s), j * 3 * s));
    const de = fica.length * 3;
    finais.forEach((x, q) => {
      const h = amostras[q];
      let n = null;
      if (nome === 'normal') { n = new V3().subVectors(M.v[x.v[1]].p, M.v[x.v[0]].p).cross(new V3().subVectors(M.v[x.v[2]].p, M.v[x.v[0]].p)); n = n.lengthSq() > 1e-14 ? n.normalize() : Y; }
      const uv = nome === 'uv' && h ? M.f.uvDe(h) : null, cor = nome === 'color' && h ? M.f.corDe(h) : null;
      x.v.forEach((vi, e) => {
        const o = (de + q * 3 + e) * s, v = M.v[vi];
        if (nome === 'position') arr.set([v.p.x, v.p.y, v.p.z], o);
        else if (nome === 'normal') arr.set([n.x, n.y, n.z], o);
        else if (nome === 'uv') arr.set(uv ?? [at.array[0], at.array[1]], o);
        else if (nome === 'color') arr.set(cor ?? new Array(s).fill(1), o);
        else if (nome === 'skinIndex') arr.set(pesos4[vi].map(([osso]) => osso), o);
        else if (nome === 'skinWeight') arr.set(pesos4[vi].map(([, p]) => p), o);
      });
    });
    g.setAttribute(nome, new THREE.BufferAttribute(arr, s, at.normalized));
  }
  marca();
  // (a ORIGEM e o ANTES de cada vértice da malha nova — o que a modelagem precisa para editar a pele nova: os que ficam,
  // como estavam; os novos, do ponto da malha de baixo em que caíram)
  let origem = null, antes = null;
  if (M.f.A && M.f.O) {
    const O = M.f.O, A = M.f.A, de = fica.length * 3;
    origem = new Uint8Array(total); antes = new Float32Array(total * 3);
    fica.forEach((t, j) => { origem.set(O.subarray(t * 3, t * 3 + 3), j * 3); antes.set(A.subarray(t * 9, t * 9 + 9), j * 9); });
    finais.forEach((x, q) => x.v.forEach((vi, e) => {
      const k = de + q * 3 + e, v = M.v[vi], a = v.a ?? v.p;
      origem[k] = v.h ? O[v.h.t * 3] : 0;
      antes[k * 3] = a.x; antes[k * 3 + 1] = a.y; antes[k * 3 + 2] = a.z;
    }));
  }
  g.userData = { ...geo.userData };
  // quantos vértices tirados antes de cada vértice de antes (para as faixas que a malha guarda: o cabelo, o rosto)
  const tirados = new Int32Array(nt + 1);
  for (let t = 0; t < nt; t++) tirados[t + 1] = tirados[t] + (trocar[t] ? 3 : 0);
  const info = { ms: relogio.slice(1).map((x, i) => Math.round(x - relogio[i])), trocados: tris.length, novos: nf, cortados: cortes.size, abertos, dobrados, tortosOmbros, folgaOmbros: Math.round(mo.folga), sobraOmbros: mo.sobra, topoDaCoxa: Math.round(topoDaCoxa * 10) / 10, fimDaPerna: pernas.map((l) => Math.round(l[l.length - 1].c.y * 10) / 10), pePedido: Math.round(fimDaPerna * 10) / 10, fimDoBraco: bracos.map((l) => Math.round(l[l.length - 1].c.x * 10) / 10), aneis: { pernas: pernas.map((l) => l.length), bracos: bracos.map((l) => l.length), tronco: tronco.length, colo: colo.length }, gancho: Math.round(gancho * 10) / 10, sovaco: Math.round(sovaco * 10) / 10 };
  if (tortos) console.warn('[pele nova] junção com lados soltos:', info);
  g.userData.peleNova = info;
  return { geo: g, origem, antes, removidos: (v) => tirados[Math.min(nt, Math.floor(v / 3))] + (trocar[Math.floor(v / 3)] ? v % 3 : 0), info };
}
