/**
 * OS CÍLIOS-DELINEADO e a ÍRIS (24-25/10/2026, pedidos do dono: "põe ao redor do olho outra malha, chamada
 * cílios-delineado — um contorno mais grosso acima e mais fino abaixo"; depois, com a foto de uma personagem de
 * referência: "deixa os olhos como estes — remove as sombras da malha dos olhos, aumenta o delineado + cílios").
 *
 * Tudo é feito do olho COMO ELE FICOU (a raça, a modelagem: a posição, o tamanho, os vértices movidos), no fim do
 * `geometriaFundida` (guerreiro.js), como as pálpebras da piscada: ajustar o olho leva tudo junto. Uma malha à parte
 * (`CorpoGuerreiro.vestirCilios`), presa aos ossos do olho, com o material do corpo (a cor vem de texels da paleta:
 * o escuro e o claro, pintura.js `uvEscura`/`uvClara`, e, na íris, da cor de vértice).
 *  - os CÍLIOS-DELINEADO (`cilios` no corpo: { cima, baixo, asa, fios } cm): uma faixa escura em volta da tampa da
 *    frente de cada olho — grossa no meio de cima (afinando até os cantos), fina embaixo —, a ASA no canto de fora e
 *    os FIOS (os cílios: pontas que saem da beira de cima, mais longas para o canto de fora);
 *  - a ÍRIS (`iris` no corpo: { tamanho, pupila }): um disco na cor dos olhos de quem veste (a da raça, ou a escolhida
 *    na Aparência), com a pupila escura e um brilho, RECORTADO pelo contorno do olho (as pálpebras tapam o alto e o
 *    baixo dela, como num olho de verdade). `tamanho`: o raio em vezes a meia largura do olho; `pupila`: em vezes o
 *    raio da íris.
 * E `alisarOlhos`: o olho liso (`olhosLisos`) com UMA luz em cada olho (a normal média da tampa) — as facetas dele
 * saíam umas claras, outras escuras ("as sombras da malha dos olhos").
 */
import * as THREE from 'three';
import { ORIGENS, zDaPele } from './modelagem.js';

export const CILIOS_PADRAO = { cima: 0.26, baixo: 0.06, asa: 0.55, fios: 0 };
export const IRIS_PADRAO = { tamanho: 0.42, pupila: 0.38 };
const OLHOS = ORIGENS.indexOf('olhos');
const LEVANTA = 0.03;   // cm à frente do olho e da pele (a faixa não briga com eles)
const DENTRO = 0.03;    // cm para dentro do olho na beira: sem fresta entre a faixa e o olho
const NA_FRENTE = { iris: 0.045, pupila: 0.06, brilho: 0.075 };   // cm à frente do plano do olho

const normalDe = (P, t, n = new THREE.Vector3()) => {
  const a = new THREE.Vector3().fromArray(P, t * 9), b = new THREE.Vector3().fromArray(P, t * 9 + 3).sub(a), c = new THREE.Vector3().fromArray(P, t * 9 + 6).sub(a);
  return n.crossVectors(b, c);
};

// a tampa da frente de um olho (lado +1 / −1): os triângulos do olho virados para a frente (a casca de trás e o aro, não)
function tampaDoOlho(P, origem, lado) {
  const tris = [], n = new THREE.Vector3(), nf = new THREE.Vector3();
  for (let t = 0; t < P.length / 9; t++) {
    if (origem[t * 3] !== OLHOS || P[t * 9] * lado <= 0) continue;
    normalDe(P, t, nf);
    if (nf.lengthSq() < 1e-12 || nf.clone().normalize().z < 0.35) continue;
    tris.push(t); n.add(nf);
  }
  return { tris, n: n.lengthSq() ? n.normalize() : null };
}

// a BORDA da tampa: o laço das arestas que só um triângulo usa — [{ p: Vector3, v: o vértice }]
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

/** O olho liso com UMA luz em cada olho: a normal média da tampa em todos os triângulos do olho daquele lado. */
export function alisarOlhos(geo, origem) {
  const P = geo.attributes.position.array, nor = geo.attributes.normal;
  if (!nor || geo.index || !origem) return;
  for (const lado of [1, -1]) {
    const { n } = tampaDoOlho(P, origem, lado);
    if (!n) continue;
    for (let t = 0; t < P.length / 9; t++) if (origem[t * 3] === OLHOS && P[t * 9] * lado > 0) for (let k = 0; k < 3; k++) nor.setXYZ(t * 3 + k, n.x, n.y, n.z);
  }
  nor.needsUpdate = true;
}

// um polígono (2D, [[a, b], …]) recortado por um polígono CONVEXO no sentido anti-horário (Sutherland–Hodgman)
function recortar(poli, janela) {
  let saida = poli;
  for (let i = 0; i < janela.length && saida.length; i++) {
    const [ax, ay] = janela[i], [bx, by] = janela[(i + 1) % janela.length], dentro = ([x, y]) => (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0;
    const entrada = saida;
    saida = [];
    for (let k = 0; k < entrada.length; k++) {
      const p = entrada[k], q = entrada[(k + 1) % entrada.length], dp = dentro(p), dq = dentro(q);
      if (dp) saida.push(p);
      if (dp !== dq) {
        const ex = q[0] - p[0], ey = q[1] - p[1], den = (bx - ax) * ey - (by - ay) * ex;
        if (Math.abs(den) > 1e-12) { const s = ((ax - p[0]) * (by - ay) - (ay - p[1]) * (bx - ax)) / -den; saida.push([p[0] + ex * s, p[1] + ey * s]); }
      }
    }
  }
  return saida;
}
const circulo = (cx, cy, r, n = 20) => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r]);

/**
 * A malha dos olhos desenhados em malha sobre `geo` (a malha fundida, ou a vista do editor, na pose T; `origem`: o
 * código de cada vértice — modelagem.js `ORIGENS`): os cílios-delineado (`o.cilios`) e a íris (`o.iris`) — uma
 * BufferGeometry, ou null (não há olho, ou nada a fazer). `uvs`: { escuro, claro } (os texels); `corIris`: '#rrggbb'.
 */
export function geometriaDosCilios(geo, origem, o, uvs, corIris = '#4a3020') {
  const P = geo.attributes.position.array, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, nt = P.length / 9;
  if (!si || !sw || geo.index || !origem || !(o?.cilios || o?.iris)) return null;
  const A = { ...CILIOS_PADRAO, ...(o.cilios ?? {}) }, I = { ...IRIS_PADRAO, ...(o.iris ?? {}) };
  const ci = new THREE.Color(corIris), corDaIris = [ci.r, ci.g, ci.b];
  const pos = [], nor = [], fonte = [], uv = [], cor = [];
  for (const lado of [1, -1]) {
    const { tris, n } = tampaDoOlho(P, origem, lado);
    const L = tris.length ? bordaDoOlho(P, tris) : [];
    if (L.length < 3 || !n) continue;
    const C = L.reduce((s, x) => s.add(x.p), new THREE.Vector3()).multiplyScalar(1 / L.length);
    const U = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();   // (o "para cima" no plano do olho)
    const R = new THREE.Vector3().crossVectors(U, n).normalize();                  // (o "para o lado")
    // um triângulo (virado para fora do olho, para onde `n` aponta), com a cor de um texel e uma cor de vértice
    const tri = (a, b, c, va, vb, vc, t = uvs?.escuro, k = [1, 1, 1]) => {
      const f = b.clone().sub(a).cross(c.clone().sub(a));
      const [x, y, z] = f.dot(n) < 0 ? [a, c, b] : [a, b, c], [vx, vy, vz] = f.dot(n) < 0 ? [va, vc, vb] : [va, vb, vc];
      for (const [q, v] of [[x, vx], [y, vy], [z, vz]]) { pos.push(q.x, q.y, q.z); nor.push(n.x, n.y, n.z); fonte.push(v); uv.push(t?.[0] ?? 0, t?.[1] ?? 0); cor.push(...k); }
    };
    // ---- a ÍRIS, a pupila e o brilho: discos no plano do olho, recortados pela borda dele (no 2D do plano)
    if (o.iris) {
      const em2d = (p) => { const d = p.clone().sub(C); return [d.dot(R), d.dot(U)]; };
      let janela = L.map((x) => em2d(x.p));
      // (anti-horário: a área com sinal positiva)
      if (janela.reduce((s, [x, y], i) => { const [x2, y2] = janela[(i + 1) % janela.length]; return s + x * y2 - x2 * y; }, 0) < 0) janela = janela.reverse();
      const meiaLargura = Math.max(...janela.map(([x]) => Math.abs(x))), r = meiaLargura * I.tamanho;
      // (a tampa é ABAULADA — o meio mais à frente que a borda: cada ponto do disco assenta nela, pela altura do
      // triângulo da tampa debaixo dele; num plano pela borda, a íris ficava atrás da tampa)
      const tampa2d = tris.map((t) => [0, 1, 2].map((e) => { const v = new THREE.Vector3().fromArray(P, t * 9 + e * 3); return [...em2d(v), v.clone().sub(C).dot(n)]; }));
      const altura = ([a, b]) => {
        let melhor = null, dm = Infinity;
        for (const [[x1, y1, h1], [x2, y2, h2], [x3, y3, h3]] of tampa2d) {
          const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3);
          if (Math.abs(d) < 1e-12) continue;
          const l1 = ((y2 - y3) * (a - x3) + (x3 - x2) * (b - y3)) / d, l2 = ((y3 - y1) * (a - x3) + (x1 - x3) * (b - y3)) / d, l3 = 1 - l1 - l2;
          const fora = Math.max(0, -l1) + Math.max(0, -l2) + Math.max(0, -l3);
          if (fora < dm) { dm = fora; const c1 = Math.max(0, l1), c2 = Math.max(0, l2), c3 = Math.max(0, l3), s = c1 + c2 + c3 || 1; melhor = (c1 * h1 + c2 * h2 + c3 * h3) / s; }
        }
        return melhor ?? 0;
      };
      const de2d = (q, h) => C.clone().addScaledVector(R, q[0]).addScaledVector(U, q[1]).addScaledVector(n, altura(q) + h);
      // (em leque a partir do MEIO do pedaço recortado: um triângulo grande de borda a borda passaria por baixo da tampa)
      const disco = (poli, h, t, k) => {
        const p = recortar(poli, janela);
        if (p.length < 3) return;
        const m2 = [p.reduce((s, x) => s + x[0], 0) / p.length, p.reduce((s, x) => s + x[1], 0) / p.length];
        for (let i = 0; i < p.length; i++) tri(de2d(m2, h), de2d(p[i], h), de2d(p[(i + 1) % p.length], h), L[0].v, L[0].v, L[0].v, t, k);
      };
      // (a íris um tico mais clara que a cor pura — ela "acende" no rosto; a pupila escura; o brilho no alto, para dentro)
      disco(circulo(0, 0, r), NA_FRENTE.iris, uvs?.claro, corDaIris.map((x) => Math.min(1.4, x * 1.25 + 0.04)));
      disco(circulo(0, 0, r * I.pupila, 16), NA_FRENTE.pupila, uvs?.escuro);
      disco(circulo(-lado * r * 0.3, r * 0.32, r * 0.17, 8), NA_FRENTE.brilho, uvs?.claro, [1.3, 1.3, 1.3]);
    }
    if (!o.cilios) continue;
    // ---- os CÍLIOS-DELINEADO: a faixa em volta da borda
    // a pele na frente? a faixa assenta nela (o osso da sobrancelha costuma estar à frente do plano do olho)
    const naPele = (q) => { const z = zDaPele(P, null, nt, origem, q.x, q.y, q.z); if (z !== null && z + LEVANTA > q.z) q.z = z + LEVANTA; return q; };
    const m = L.length;
    // os CANTOS — o de dentro (perto do nariz) e o de fora — e as duas metades da borda entre eles: a de cima e a de baixo
    let ki = 0, ko = 0;
    for (let i = 1; i < m; i++) { if (L[i].p.x * lado < L[ki].p.x * lado) ki = i; if (L[i].p.x * lado > L[ko].p.x * lado) ko = i; }
    const cadeia = (passo) => { const l = [ki]; for (let i = ki, k = 0; i !== ko && k < m; k++) { i = (i + passo + m) % m; l.push(i); } return l; };
    const ca = cadeia(1), cb = cadeia(-1), subida = (l) => l.reduce((s, i) => s + L[i].p.clone().sub(C).dot(U), 0) / l.length;
    const [deCima, deBaixo] = subida(ca) > subida(cb) ? [ca, cb] : [cb, ca];
    // (no plano do olho: [a ao lado, b para cima, h para a frente] — e de volta)
    const em2 = (p) => { const d = p.clone().sub(C); return [d.dot(R), d.dot(U), d.dot(n)]; };
    const de2 = ([a, b, h]) => C.clone().addScaledVector(R, a).addScaledVector(U, b).addScaledVector(n, h);
    // ---- a de BAIXO: a faixa fina, pela normal da borda
    const dentroB = [], foraB = [];
    for (const i of deBaixo) {
      const p = L[i].p, tg = L[(i + 1) % m].p.clone().sub(L[(i + m - 1) % m].p);
      const d = new THREE.Vector3().crossVectors(tg, n).normalize();
      if (d.dot(p.clone().sub(C)) < 0) d.negate();
      dentroB.push(p.clone().addScaledVector(d, -DENTRO).addScaledVector(n, LEVANTA));
      foraB.push(naPele(p.clone().addScaledVector(d, A.baixo).addScaledVector(n, LEVANTA)));
    }
    for (let j = 0; j + 1 < deBaixo.length; j++) {
      const va = L[deBaixo[j]].v, vb = L[deBaixo[j + 1]].v;
      tri(dentroB[j], foraB[j], foraB[j + 1], va, va, vb);
      tri(dentroB[j], foraB[j + 1], dentroB[j + 1], va, vb, vb);
    }
    // ---- a de CIMA: um ARCO grosso e liso (24/10: seguindo o octógono da tampa, saía em pedaços retos e fino). A beira
    // de fora é uma curva — do canto de dentro, sobe sobre o olho (a grossura `cima` a 60% do caminho) e sai na ponta da
    // ASA, além do canto de fora; a beira de dentro é a borda de cima do olho no mesmo lugar (ou o canto, na asa)
    const cima2 = deCima.map((i) => em2(L[i].p)), a0 = cima2[0][0], aE = cima2[cima2.length - 1][0], s = Math.sign(aE - a0) || 1;
    const naBorda = (a) => {   // (o ponto da borda de cima no lado `a`: [a, b, h], e o vértice mais perto)
      for (let j = 0; j + 1 < cima2.length; j++) {
        const [x1, y1, h1] = cima2[j], [x2, y2, h2] = cima2[j + 1];
        if ((a - x1) * (a - x2) <= 0 && x1 !== x2) { const f = (a - x1) / (x2 - x1); return { q: [a, y1 + (y2 - y1) * f, h1 + (h2 - h1) * f], v: L[deCima[f < 0.5 ? j : j + 1]].v }; }
      }
      const fim = (a - a0) * s <= 0 ? 0 : cima2.length - 1;
      return { q: cima2[fim], v: L[deCima[fim]].v };
    };
    const pA = [a0, cima2[0][1] + A.baixo], pico = a0 + (aE - a0) * 0.6, pB = [pico, naBorda(pico).q[1] + A.cima];
    const pC = A.asa > 0 ? [aE + s * A.asa, cima2[cima2.length - 1][1] + A.asa * 0.45] : [aE, cima2[cima2.length - 1][1] + A.baixo];
    const pK = [2 * pB[0] - (pA[0] + pC[0]) / 2, 2 * pB[1] - (pA[1] + pC[1]) / 2];   // (a curva passa por pB no meio)
    const curva = (t) => [(1 - t) ** 2 * pA[0] + 2 * (1 - t) * t * pK[0] + t * t * pC[0], (1 - t) ** 2 * pA[1] + 2 * (1 - t) * t * pK[1] + t * t * pC[1]];
    const N = 20, dentroC = [], foraC = [], vC = [];
    for (let j = 0; j <= N; j++) {
      const [a, b] = curva(j / N), alem = (a - aE) * s > 0, borda = naBorda(alem ? aE : a);
      dentroC.push(de2([borda.q[0], borda.q[1] - DENTRO, borda.q[2] + LEVANTA]));
      foraC.push(naPele(de2([a, b, borda.q[2] + LEVANTA])));
      vC.push(borda.v);
    }
    for (let j = 0; j < N; j++) {
      tri(dentroC[j], foraC[j], foraC[j + 1], vC[j], vC[j], vC[j + 1]);
      if (dentroC[j].distanceToSquared(dentroC[j + 1]) > 1e-10) tri(dentroC[j], foraC[j + 1], dentroC[j + 1], vC[j], vC[j + 1], vC[j + 1]);
    }
    // os FIOS (os cílios): pontas finas saindo da curva, da metade dela até a asa, mais longas para fora
    if (A.fios > 0) for (const t of [0.4, 0.52, 0.63, 0.73, 0.82, 0.9]) {
      const [a, b] = curva(t), [a2, b2] = curva(t + 0.01), tl = Math.hypot(a2 - a, b2 - b) || 1, tg = [(a2 - a) / tl, (b2 - b) / tl];
      let nr = [-tg[1], tg[0]];
      if (nr[1] < 0) nr = [-nr[0], -nr[1]];   // (para fora do olho: para cima)
      const rumo = [nr[0] * 0.65 + s * 0.45, nr[1] * 0.65 + 0.25], rl = Math.hypot(...rumo), quanto = A.fios * (0.55 + 0.75 * t);
      const h = naBorda(Math.min((a - a0) * s, (aE - a0) * s) * s + a0).q[2] + LEVANTA, larg = 0.045;
      const ponta = naPele(de2([a + (rumo[0] / rl) * quanto, b + (rumo[1] / rl) * quanto, h]));
      tri(naPele(de2([a - tg[0] * larg, b - tg[1] * larg, h])), ponta, naPele(de2([a + tg[0] * larg, b + tg[1] * larg, h])), vC[0], vC[0], vC[0]);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry(), k = pos.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  // (os ossos de cada ponto: os do vértice do olho de onde ele sai)
  const ossos = new Uint16Array(k * 4), pesos = new Float32Array(k * 4);
  fonte.forEach((v, i) => { for (let c = 0; c < 4; c++) { ossos[i * 4 + c] = si.getComponent(v, c); pesos[i * 4 + c] = sw.getComponent(v, c); } });
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ossos, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(pesos, 4));
  return g;
}
