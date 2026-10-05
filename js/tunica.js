/**
 * A TÚNICA DE COURO (04/10/2026) — o nosso desenho para o peito do conjunto de couro (o
 * `arm1_peito`, "Peitoral do Batedor"): uma túnica simples, low poly, no lugar das peças
 * A1 do pacote do guerreiro.
 *
 * Ela é feita DO PRÓPRIO CORPO do guerreiro: as peças do tronco, dos ombros, do braço e a
 * parte de cima das coxas são copiadas, INFLADAS para fora (cada vértice anda pela normal
 * média do ponto — assim as emendas não abrem) e pintadas de couro. Por ser o corpo, cada
 * vértice já vem preso aos mesmos ossos: a túnica acompanha qualquer animação sem esticar,
 * e entra na malha fundida do guerreiro como mais uma peça (`guerreiro.js`, `vestir`).
 *
 * O DESENHO (tudo aqui, para ajustar): `COURO` e as cores das faixas; `FOLGA` (cm) de cada
 * parte; a manga curta (`MANGA`: até onde vai no braço); a barra na coxa (`BARRA`: altura
 * em cm na pose T) que abre um pouco (`ABRE`), como saia de túnica; o CINTO (faixa escura
 * mais saltada na cintura). As faces ganham um leve sorteio de tom e normais retas — o
 * jeito low poly do resto do modelo.
 *
 * A textura do modelo é uma paleta: as UVs da túnica apontam para o ponto mais claro e
 * neutro dela (`texelClaro`), para que a cor de couro dos vértices apareça como é.
 */
import * as THREE from 'three';

const COURO = new THREE.Color(0x7a5232);
const COURO_ESCURO = new THREE.Color(0x5e3d22);
const CINTO = new THREE.Color(0x2c1b0f);
const FIVELA = new THREE.Color(0xb8954a);
const COSTURA = new THREE.Color(0x9a6c42);

// a folga (cm, no tamanho do modelo) de cada peça do corpo que vira túnica
const FOLGA = { Upper_Torso: 2.2, Lower_Torso: 2.6, hips: 2.9, Trapezius: 1.9, Shoulder: 2.1, arm: 1.7, thigh: 2.6 };
const MANGA = 0.5;                  // a manga cobre esta fração do braço (do ombro para o cotovelo)
const BARRA = 72, ABRE = 0.14;      // a barra na coxa (y na pose T) e quanto ela abre por cm abaixo do quadril
const QUADRIL = 94;                 // onde a coxa começa (y)
const CINTA = [99.5, 104];          // a faixa do cinto (y), no Lower_Torso e no quadril
const BARRA_ESCURA = 3.5;           // os últimos cm da barra, mais escuros

const cache = new Map();
let uvClaro = null;

/** O ponto mais claro e menos colorido da paleta do modelo (u, v), ou null. */
function texelClaro(mapa) {
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
    const x = onde % c.width, y = Math.floor(onde / c.width);
    uvClaro = [(x + 0.5) / c.width, (y + 0.5) / c.height];   // glTF: flipY falso, v = linha de cima para baixo
  } catch { /* sem leitura da imagem: fica a UV do corpo */ }
  return uvClaro;
}

// sorteio estável por face (o mesmo tom em todo guerreiro)
const tom = (i) => { let h = Math.imul(i + 7, 2654435761) >>> 0; h ^= h >>> 13; return ((h >>> 0) / 4294967296) * 2 - 1; };

/** A parte de túnica de UMA peça do corpo (geometria pronta, presa aos mesmos ossos). */
function parteDaTunica(peca) {
  const nome = peca.name;
  const fonte = peca.geometry.index ? peca.geometry.toNonIndexed() : peca.geometry.clone();
  const pos = fonte.attributes.position, nor = fonte.attributes.normal;
  // a normal MÉDIA de cada ponto (os vértices repetidos nas quinas andam juntos)
  const chave = (i) => `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
  const media = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = chave(i), m = media.get(k) ?? new THREE.Vector3();
    m.x += nor.getX(i); m.y += nor.getY(i); m.z += nor.getZ(i);
    media.set(k, m);
  }
  // que faces ficam: a manga curta no braço, a parte de cima na coxa
  let xMin = Infinity, xMax = -Infinity;
  for (let i = 0; i < pos.count; i++) { const ax = Math.abs(pos.getX(i)); xMin = Math.min(xMin, ax); xMax = Math.max(xMax, ax); }
  const fica = (a, b, c) => {
    if (nome === 'arm') return (Math.abs(pos.getX(a)) + Math.abs(pos.getX(b)) + Math.abs(pos.getX(c))) / 3 < xMin + (xMax - xMin) * MANGA;
    if (nome === 'thigh') return (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3 > BARRA;
    return true;
  };
  const faces = [];
  for (let f = 0; f < pos.count / 3; f++) if (fica(f * 3, f * 3 + 1, f * 3 + 2)) faces.push(f);
  if (!faces.length) return null;

  const n = faces.length * 3, attrs = {};
  for (const [k, a] of Object.entries(fonte.attributes)) {
    if (!['position', 'uv', 'skinIndex', 'skinWeight'].includes(k)) continue;
    const arr = new a.array.constructor(n * a.itemSize);
    faces.forEach((f, j) => { for (let v = 0; v < 3; v++) for (let c = 0; c < a.itemSize; c++) arr[(j * 3 + v) * a.itemSize + c] = a.array[(f * 3 + v) * a.itemSize + c]; });
    attrs[k] = new THREE.BufferAttribute(arr, a.itemSize, a.normalized);
  }
  const p = attrs.position, cor = new Float32Array(n * 3), v = new THREE.Vector3(), c = new THREE.Color();
  for (let j = 0; j < n; j++) {
    const f = faces[Math.floor(j / 3)] * 3 + (j % 3);
    const y = pos.getY(f);
    let folga = FOLGA[nome] ?? 2;
    if (nome === 'thigh') folga += Math.max(0, QUADRIL - y) * ABRE;              // a barra abre
    const noCinto = (nome === 'Lower_Torso' || nome === 'hips') && y >= CINTA[0] && y <= CINTA[1];
    if (noCinto) folga += 0.7;                                                    // o cinto salta
    v.copy(media.get(chave(f))).normalize().multiplyScalar(folga);
    p.setXYZ(j, pos.getX(f) + v.x, pos.getY(f) + v.y, pos.getZ(f) + v.z);
  }
  // a cor por FACE (low poly): couro com um leve sorteio; cinto, fivela, barra e costura
  for (let j = 0; j < n; j += 3) {
    const f = faces[j / 3] * 3;
    const y = (pos.getY(f) + pos.getY(f + 1) + pos.getY(f + 2)) / 3;
    const x = (pos.getX(f) + pos.getX(f + 1) + pos.getX(f + 2)) / 3;
    const z = (pos.getZ(f) + pos.getZ(f + 1) + pos.getZ(f + 2)) / 3;
    const noCinto = (nome === 'Lower_Torso' || nome === 'hips') && y >= CINTA[0] && y <= CINTA[1];
    if (noCinto) c.copy(Math.abs(x) < 3 && z > 0 ? FIVELA : CINTO);
    else if (nome === 'thigh' && y < BARRA + BARRA_ESCURA) c.copy(COURO_ESCURO);
    else if (nome === 'Upper_Torso' && Math.abs(x) < 0.8 && z > 0) c.copy(COSTURA);   // a costura da frente
    else c.copy(COURO).lerp(COURO_ESCURO, 0.5 + 0.5 * tom(f + nome.length * 997));
    for (let v2 = 0; v2 < 3; v2++) { cor[(j + v2) * 3] = c.r; cor[(j + v2) * 3 + 1] = c.g; cor[(j + v2) * 3 + 2] = c.b; }
  }
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(attrs)) g.setAttribute(k, a);
  g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
  // a paleta: todas as UVs no ponto claro (a cor é a dos vértices)
  const uv = texelClaro(peca.material?.map);
  if (uv && g.attributes.uv) for (let j = 0; j < n; j++) g.attributes.uv.setXY(j, uv[0], uv[1]);
  g.computeVertexNormals();   // sem índice: normal por face, as facetas do low poly
  fonte.dispose?.();
  return g;
}

/**
 * As peças da túnica, a partir das peças do corpo do guerreiro: objetos no formato que a
 * malha fundida usa (`geometry`, `skeleton`, `material`, `name`), presos aos ossos da peça
 * de onde saíram. A geometria é feita uma vez e dividida por todos os guerreiros.
 */
export function pecasDaTunica(pecas) {
  const saida = [];
  for (const nome of Object.keys(FOLGA)) {
    const peca = pecas.find((o) => o.name === nome);
    if (!peca) continue;
    if (!cache.has(nome)) cache.set(nome, parteDaTunica(peca));
    const geometry = cache.get(nome);
    if (geometry) saida.push({ name: `tunica_${nome}`, geometry, skeleton: peca.skeleton, material: peca.material, bindMatrix: peca.bindMatrix });
  }
  return saida;
}
