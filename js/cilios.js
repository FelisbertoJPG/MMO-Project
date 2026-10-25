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
    const m = L.length, dentro = [], fora = [], subida = [], normais = [];
    for (let i = 0; i < m; i++) {
      const p = L[i].p, tg = L[(i + 1) % m].p.clone().sub(L[(i + m - 1) % m].p);
      const d = new THREE.Vector3().crossVectors(tg, n).normalize();
      if (d.dot(p.clone().sub(C)) < 0) d.negate();
      const u = p.clone().sub(C).addScaledVector(n, -p.clone().sub(C).dot(n)).normalize().dot(U);
      subida.push(u); normais.push(d);
      // (grossa no meio de cima, afinando até os cantos; embaixo, a fina)
      const g = u > 0 ? A.baixo + (A.cima - A.baixo) * Math.pow(u, 0.8) : A.baixo;
      dentro.push(p.clone().addScaledVector(d, -DENTRO).addScaledVector(n, LEVANTA));
      fora.push(naPele(p.clone().addScaledVector(d, g).addScaledVector(n, LEVANTA)));
    }
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      tri(dentro[i], fora[i], fora[j], L[i].v, L[i].v, L[j].v);
      tri(dentro[i], fora[j], dentro[j], L[i].v, L[j].v, L[j].v);
    }
    // a ASA: do canto de fora (o mais longe do meio do rosto), para fora e um pouco para cima
    let k = 0;
    for (let i = 1; i < m; i++) if (L[i].p.x * lado > L[k].p.x * lado) k = i;
    const lateral = L[k].p.clone().sub(C).addScaledVector(n, -L[k].p.clone().sub(C).dot(n)).normalize();
    if (A.asa > 0) {
      const j = subida[(k + 1) % m] > subida[(k + m - 1) % m] ? (k + 1) % m : (k + m - 1) % m;   // (o vizinho de cima)
      const ponta = naPele(L[k].p.clone().addScaledVector(lateral, A.asa).addScaledVector(U, A.asa * 0.45).addScaledVector(n, LEVANTA));
      tri(fora[k], ponta, fora[j], L[k].v, L[k].v, L[j].v);
      tri(dentro[k], fora[k], fora[j], L[k].v, L[k].v, L[j].v);
    }
    // os FIOS (os cílios): uma ponta em cada aresta de cima da faixa (do meio do olho para fora), saindo para fora e para
    // cima, maiores perto do canto de fora
    if (A.fios > 0) for (let i = 0; i < m; i++) {
      const j = (i + 1) % m, uMeio = (subida[i] + subida[j]) / 2;
      if (uMeio < 0.15) continue;
      const lado2 = (L[i].p.x + L[j].p.x) / 2 * lado > C.x * lado;
      if (!lado2) continue;   // (só da metade de fora)
      const dd = normais[i].clone().add(normais[j]).normalize(), quanto = A.fios * (0.7 + 0.6 * (1 - uMeio));
      const rumo = dd.clone().multiplyScalar(0.55).addScaledVector(lateral, 0.45).addScaledVector(U, 0.35).normalize();
      // (duas pontas FINAS por trecho — a base de cada uma, 30% do trecho: com o trecho inteiro, virava um serrilhado grosso)
      for (const f of [0.3, 0.75]) {
        const a = fora[i].clone().lerp(fora[j], f - 0.15), b = fora[i].clone().lerp(fora[j], f + 0.15), meioBase = a.clone().add(b).multiplyScalar(0.5);
        const ponta = naPele(meioBase.addScaledVector(rumo, quanto * (f > 0.5 ? 1 : 0.8)).addScaledVector(n, LEVANTA));
        tri(a, ponta, b, L[i].v, L[i].v, L[j].v);
      }
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
