/**
 * A FRATURA (16/10/2026) — o que quebra se parte NOS PEDAÇOS DELE (o barril em tábuas de
 * barril, o escudo em lascas do escudo), com a textura e a cor do próprio objeto, em vez dos
 * blocos de cor de antes.
 *
 * `fragmentos(raiz, chave, n)` corta a superfície do objeto em `n` pedaços: os triângulos (os
 * grandes subdivididos antes, senão a lateral de um caixote — dois triângulos — viraria um
 * pedaço só) vão para a SEMENTE mais perto (Voronoi: `n` pontos sorteados dentro do objeto).
 * Cada pedaço é a casca daquele trecho, ENGROSSADA (uma segunda camada para dentro, virada ao
 * contrário): voa como uma lasca maciça, sem material novo — usa os materiais do objeto, que já
 * foram compilados (um material de dois lados seria outro shader, compilado na hora: tranco).
 * A conta é feita UMA vez por `chave` (a peça) e dividida por todas as cópias; quem põe os
 * pedaços no mundo e os faz voar é o `World` (`soltarFragmentos`).
 */
import * as THREE from 'three';

const cache = new Map();
const MAX_TRI = 2400;   // acima disto não subdivide (já é fino o bastante, e a conta pesaria)

/**
 * Os pedaços de um objeto, no espaço da RAIZ dele: `[{ centro, raio, partes: [{ geometry, material }] }]`.
 * As geometrias são centradas no `centro` (o pedaço gira em volta do meio dele).
 */
export function fragmentos(raiz, chave, n = 8) {
  const k = `${chave}|${n}`;
  if (cache.has(k)) return cache.get(k);
  raiz.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(raiz.matrixWorld).invert();
  // 1) os triângulos de todas as malhas, no espaço da raiz, por material
  const tris = [];   // { a, b, c (Vector3), na, nb, nc, ua, ub, uc, ca, cb, cc, mat }
  const m = new THREE.Matrix4(), nm = new THREE.Matrix3();
  raiz.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible) return;
    const g = o.geometry, pos = g.attributes.position;
    if (!pos) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    nm.getNormalMatrix(m);
    const nor = g.attributes.normal, uv = g.attributes.uv, cor = g.attributes.color;
    const idx = g.index, total = idx ? idx.count : pos.count;
    const grupos = Array.isArray(o.material) ? (g.groups.length ? g.groups : [{ start: 0, count: total, materialIndex: 0 }]) : [{ start: 0, count: total, materialIndex: -1 }];
    const v = (i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m);
    const vn = (i) => (nor ? new THREE.Vector3().fromBufferAttribute(nor, i).applyMatrix3(nm).normalize() : null);
    const vu = (i) => (uv ? new THREE.Vector2().fromBufferAttribute(uv, i) : null);
    const vc = (i) => (cor ? new THREE.Vector3(cor.getX(i), cor.getY(i), cor.getZ(i)) : null);
    for (const gr of grupos) {
      const mat = gr.materialIndex < 0 ? o.material : o.material[gr.materialIndex];
      if (!mat) continue;
      for (let t = gr.start; t + 2 < gr.start + gr.count; t += 3) {
        const [i0, i1, i2] = idx ? [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)] : [t, t + 1, t + 2];
        tris.push({ p: [v(i0), v(i1), v(i2)], n: [vn(i0), vn(i1), vn(i2)], u: [vu(i0), vu(i1), vu(i2)], c: [vc(i0), vc(i1), vc(i2)], mat });
      }
    }
  });
  if (!tris.length) { cache.set(k, []); return []; }
  const caixa = new THREE.Box3();
  for (const t of tris) for (const p of t.p) caixa.expandByPoint(p);
  const tam = caixa.getSize(new THREE.Vector3()), diag = tam.length() || 1;
  // 2) subdivide os triângulos grandes (até um quinto do objeto), enquanto couber
  const limite = diag / 5;
  for (let volta = 0; volta < 3 && tris.length < MAX_TRI; volta++) {
    const novos = [];
    for (const t of tris) {
      const [a, b, c] = t.p;
      if (Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) <= limite || tris.length + novos.length > MAX_TRI) { novos.push(t); continue; }
      novos.push(...dividir(t));
    }
    tris.length = 0; tris.push(...novos);
  }
  // 3) as sementes: pontos sorteados num núcleo do objeto (80% da caixa)
  const sementes = [];
  for (let i = 0; i < n; i++) {
    sementes.push(new THREE.Vector3(
      caixa.min.x + tam.x * (0.1 + 0.8 * Math.random()),
      caixa.min.y + tam.y * (0.1 + 0.8 * Math.random()),
      caixa.min.z + tam.z * (0.1 + 0.8 * Math.random())));
  }
  // 4) cada triângulo vai para a semente mais perto do meio dele
  const porSemente = sementes.map(() => []);
  const meio = new THREE.Vector3();
  for (const t of tris) {
    meio.copy(t.p[0]).add(t.p[1]).add(t.p[2]).divideScalar(3);
    let melhor = 0, dm = Infinity;
    for (let i = 0; i < sementes.length; i++) { const d = meio.distanceToSquared(sementes[i]); if (d < dm) { dm = d; melhor = i; } }
    porSemente[melhor].push(t);
  }
  // 5) cada pedaço: a casca e a camada de dentro (engrossada), por material
  const grossura = THREE.MathUtils.clamp(diag * 0.02, 0.008, 0.04);
  const pedacos = [];
  for (const lista of porSemente) {
    if (!lista.length) continue;
    const centro = new THREE.Vector3();
    for (const t of lista) centro.add(t.p[0]).add(t.p[1]).add(t.p[2]);
    centro.divideScalar(lista.length * 3);
    let raio = 0;
    for (const t of lista) for (const p of t.p) raio = Math.max(raio, p.distanceTo(centro));
    const porMat = new Map();
    for (const t of lista) { if (!porMat.has(t.mat)) porMat.set(t.mat, []); porMat.get(t.mat).push(t); }
    const partes = [];
    for (const [mat, ts] of porMat) partes.push({ material: mat, geometry: geometriaDaLasca(ts, centro, grossura) });
    pedacos.push({ centro, raio, partes });
  }
  cache.set(k, pedacos);
  return pedacos;
}

/** Um triângulo em quatro (pelos meios dos lados), com tudo interpolado. */
function dividir(t) {
  const mid = (arr, i, j) => (arr[i] ? arr[i].clone().lerp(arr[j], 0.5) : null);
  const novo = (arr) => [arr[0], arr[1], arr[2], mid(arr, 0, 1), mid(arr, 1, 2), mid(arr, 2, 0)];
  const P = novo(t.p), N = novo(t.n), U = novo(t.u), C = novo(t.c);
  N.forEach((x) => x?.normalize());
  const tri = (i, j, k) => ({ p: [P[i], P[j], P[k]], n: [N[i], N[j], N[k]], u: [U[i], U[j], U[k]], c: [C[i], C[j], C[k]], mat: t.mat });
  return [tri(0, 3, 5), tri(3, 1, 4), tri(5, 4, 2), tri(3, 4, 5)];
}

/** A lasca: os triângulos (de fora) e a mesma casca para dentro, ao contrário. */
function geometriaDaLasca(ts, centro, grossura) {
  const temN = !!ts[0].n[0], temU = !!ts[0].u[0], temC = !!ts[0].c[0];
  const N = ts.length * 6;
  const pos = new Float32Array(N * 3), nor = new Float32Array(N * 3);
  const uv = temU ? new Float32Array(N * 2) : null, cor = temC ? new Float32Array(N * 3) : null;
  let k = 0;
  const face = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const por = (t, i, dentro) => {
    const p = t.p[i], n = t.n[i] ?? face;
    const s = dentro ? -1 : 1;
    pos[k * 3] = p.x - centro.x - (dentro ? n.x * grossura : 0);
    pos[k * 3 + 1] = p.y - centro.y - (dentro ? n.y * grossura : 0);
    pos[k * 3 + 2] = p.z - centro.z - (dentro ? n.z * grossura : 0);
    nor[k * 3] = n.x * s; nor[k * 3 + 1] = n.y * s; nor[k * 3 + 2] = n.z * s;
    if (uv) { uv[k * 2] = t.u[i]?.x ?? 0; uv[k * 2 + 1] = t.u[i]?.y ?? 0; }
    if (cor) { cor[k * 3] = t.c[i]?.x ?? 1; cor[k * 3 + 1] = t.c[i]?.y ?? 1; cor[k * 3 + 2] = t.c[i]?.z ?? 1; }
    k++;
  };
  for (const t of ts) {
    face.crossVectors(e1.subVectors(t.p[1], t.p[0]), e2.subVectors(t.p[2], t.p[0])).normalize();
    por(t, 0, false); por(t, 1, false); por(t, 2, false);
    por(t, 0, true); por(t, 2, true); por(t, 1, true);   // a de dentro, com a volta invertida
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (uv) g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (cor) g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
  if (!temN) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
