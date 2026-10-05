/**
 * AS ARMADURAS PINTADAS (04/10/2026) — a "casca": uma peça de armadura feita DO PRÓPRIO
 * CORPO do guerreiro. O desenho diz, para cada peça do corpo (Upper_Torso, arm, thigh…),
 * QUAIS triângulos a armadura cobre, de que COR e com que FOLGA (cm afastada da pele);
 * esses triângulos são copiados, empurrados para fora e pintados. Por serem o corpo, cada
 * vértice já vem preso aos mesmos ossos: a peça acompanha qualquer animação sem esticar,
 * e entra na malha fundida do guerreiro como mais uma peça (guerreiro.js, `vestir`).
 *
 * Os desenhos moram em `assets/armaduras.json` (lido por `carregarArmaduras`, em
 * `Assets.armaduras`) e são PINTADOS na tela "Armaduras" do editor de cenas
 * (armadura.html, que monta o guerreiro com os módulos do jogo e usa ESTE arquivo).
 *
 * Um desenho:
 *   { "id": "tunica-batedor", "nome": "Túnica do Batedor", "lugar": "peito", "conjunto": 1,
 *     "cores": ["#7a5232", "#2c1b0f", …],
 *     "partes": { "Upper_Torso": [[triângulo, índice da cor, folga em décimos de cm], …], … } }
 * O `lugar` + `conjunto` diz qual peça de armadura do jogo ele desenha (items.js: o
 * `arm<conjunto>_<lugar>`): com o desenho, as peças do pacote daquele lugar saem.
 *
 * Cada ponto anda pela normal MÉDIA dele (os vértices repetidos nas quinas andam juntos,
 * e as emendas não abrem), com a folga média dos triângulos pintados que o tocam. As
 * normais saem retas por face (o jeito low poly do modelo). A textura do modelo é uma
 * paleta: as UVs da casca apontam para o ponto mais claro dela (`texelClaro`), para a
 * cor pintada aparecer como é.
 */
import * as THREE from 'three';

// as peças do corpo que podem ser pintadas (o resto — olhos, cabelo, barba, a corrente —
// fica de fora)
export const PECAS_PINTAVEIS = ['head', 'neck', 'Trapezius', 'Shoulder', 'Upper_Torso', 'Lower_Torso', 'hips', 'arm', 'Forearm', 'Hand', 'thigh', 'shin', 'Feet'];

let uvClaro = null;
/** O ponto mais claro e menos colorido da paleta do modelo (u, v), ou undefined. */
export function texelClaro(mapa) {
  if (uvClaro !== null) return uvClaro;
  uvClaro = undefined;
  const img = mapa?.image;
  if (!img?.width) return uvClaro;
  try {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let melhor = -1, onde = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], gg = d[i + 1], b = d[i + 2];
      const nota = (r + gg + b) / 3 - (Math.max(r, gg, b) - Math.min(r, gg, b)) * 1.5;
      if (nota > melhor) { melhor = nota; onde = i / 4; }
    }
    uvClaro = [((onde % c.width) + 0.5) / c.width, (Math.floor(onde / c.width) + 0.5) / c.height];   // glTF: flipY falso
  } catch { /* sem leitura da imagem: fica a UV do corpo */ }
  return uvClaro;
}

/**
 * O "molde" de uma peça do corpo: a geometria sem índice (um triângulo = 3 vértices
 * seguidos, na ordem dos triângulos do arquivo — é o número que o desenho guarda), a
 * chave de posição de cada vértice e a normal média de cada posição. Feito uma vez.
 */
const moldes = new Map();
export function moldeDe(peca) {
  if (moldes.has(peca.name)) return moldes.get(peca.name);
  const g = peca.geometry.index ? peca.geometry.toNonIndexed() : peca.geometry.clone();
  const pos = g.attributes.position, nor = g.attributes.normal;
  const chaves = new Array(pos.count), media = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
    chaves[i] = k;
    const m = media.get(k) ?? new THREE.Vector3();
    m.x += nor.getX(i); m.y += nor.getY(i); m.z += nor.getZ(i);
    media.set(k, m);
  }
  for (const m of media.values()) m.normalize();
  const molde = { geometria: g, chaves, media, triangulos: pos.count / 3 };
  moldes.set(peca.name, molde);
  return molde;
}

/** A parte de casca de UMA peça do corpo: os triângulos pintados, afastados e coloridos. */
function parte(peca, lista, cores) {
  const { geometria: f, chaves, media } = moldeDe(peca);
  const pos = f.attributes.position;
  const faces = lista.filter(([t]) => Number.isInteger(t) && t >= 0 && t * 3 + 2 < pos.count);
  if (!faces.length) return null;
  // a folga de cada POSIÇÃO: a média dos triângulos pintados que a tocam
  const folga = new Map();
  for (const [t, , fd] of faces) for (let v = 0; v < 3; v++) {
    const k = chaves[t * 3 + v], s = folga.get(k) ?? [0, 0];
    s[0] += (fd ?? 20) / 10; s[1]++; folga.set(k, s);
  }
  const n = faces.length * 3, g = new THREE.BufferGeometry();
  for (const nome of ['position', 'uv', 'skinIndex', 'skinWeight']) {
    const a = f.attributes[nome];
    if (!a) continue;
    const arr = new a.array.constructor(n * a.itemSize);
    faces.forEach(([t], j) => { for (let v = 0; v < 3; v++) for (let c = 0; c < a.itemSize; c++) arr[(j * 3 + v) * a.itemSize + c] = a.array[(t * 3 + v) * a.itemSize + c]; });
    g.setAttribute(nome, new THREE.BufferAttribute(arr, a.itemSize, a.normalized));
  }
  const p = g.attributes.position, cor = new Float32Array(n * 3), c = new THREE.Color();
  faces.forEach(([t, ci], j) => {
    c.set(cores[ci] ?? '#808080');
    for (let v = 0; v < 3; v++) {
      const k = chaves[t * 3 + v], [s, q] = folga.get(k), m = media.get(k), d = s / q, i = j * 3 + v;
      p.setXYZ(i, p.getX(i) + m.x * d, p.getY(i) + m.y * d, p.getZ(i) + m.z * d);
      cor[i * 3] = c.r; cor[i * 3 + 1] = c.g; cor[i * 3 + 2] = c.b;
    }
  });
  g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
  const uv = texelClaro(peca.material?.map);
  if (uv && g.attributes.uv) for (let i = 0; i < n; i++) g.attributes.uv.setXY(i, uv[0], uv[1]);
  g.computeVertexNormals();   // sem índice: normal por face
  return g;
}

// as geometrias de cada desenho (feitas uma vez e divididas por todos os guerreiros);
// quem MUDA um desenho (o editor) chama `esquecerCasca`
const feitas = new WeakMap();
export function esquecerCasca(desenho) {
  for (const g of feitas.get(desenho)?.values() ?? []) g?.dispose();
  feitas.delete(desenho);
}

/**
 * As peças de um desenho, a partir das peças do corpo do guerreiro: objetos no formato
 * que a malha fundida usa (`geometry`, `skeleton`, `material`, `name`), presos aos ossos
 * da peça de onde saíram.
 */
export function pecasDaCasca(desenho, pecas) {
  if (!feitas.has(desenho)) feitas.set(desenho, new Map());
  const cache = feitas.get(desenho), saida = [];
  for (const [nome, lista] of Object.entries(desenho.partes ?? {})) {
    const peca = pecas.find((o) => o.name === nome);
    if (!peca || !Array.isArray(lista)) continue;
    if (!cache.has(nome)) cache.set(nome, parte(peca, lista, desenho.cores ?? []));
    const geometry = cache.get(nome);
    if (geometry) saida.push({ name: `casca_${desenho.id}_${nome}`, geometry, skeleton: peca.skeleton, material: peca.material, bindMatrix: peca.bindMatrix });
  }
  return saida;
}

/** O desenho de um lugar + conjunto (ou undefined): o que o jogo usa no lugar das peças do pacote. */
export const desenhoDe = (armaduras, lugar, conjunto) => armaduras?.find((d) => d.lugar === lugar && String(d.conjunto) === String(conjunto));
