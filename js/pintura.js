/**
 * A PINTURA (13/10/2026) — desenhar no corpo: os olhos, uma pintura de guerra, uma tatuagem.
 * Quem pinta é a aba Modelo do Editor de Personagem (o editor de cenas); o jogo desenha.
 *
 * Os olhos do modelo são uma malhinha de 9 pontos com um desenho de ~60 × 30 pixels dentro da
 * textura (a paleta do modelo): não há como fazê-los bem mexendo na malha. A pintura é por
 * FOLHAS: uma imagem de alta resolução PROJETADA no corpo, como um decalque — um retângulo de
 * `largura` × `altura` cm, de pé na frente de um lugar do corpo (o centro: `em`, um ponto do
 * MODELO, achado como o dos puxões da modelagem: `centroDoPuxao`), olhando na direção `dir`;
 * tudo o que ela cobre (até `prof` cm para dentro e para fora do centro) e está virado para ela
 * recebe a imagem. Só na `parte` dela (modelagem.js; "corpo" = em tudo), e nunca na armadura, no
 * cabelo, na barba ou nas sobrancelhas. `espelho`: a mesma imagem, espelhada, do outro lado (o olho
 * direito é o esquerdo espelhado: pinta-se um, sai o outro).
 *
 * A MALHA da folha (`geometriaDaFolha`) são os triângulos do corpo COMO ELE FICOU (a raça, a
 * modelagem), recortados no retângulo e levantados um fio acima da pele, presos aos mesmos ossos
 * (os pesos de cada ponto, misturados): uma malha a mais por folha no corpo, que acompanha toda
 * animação (guerreiro.js, `vestirPinturas`).
 *
 * AS TINTAS: a imagem tem duas metades — a COR (RGBA) e o TIPO (R = pele, G = olhos, B = cabelo,
 * de 0 a 255: quanto daquela cor é a do personagem). O que foi pintado com a tinta "pele" sai na
 * cor da pele de quem a veste, "olhos" na cor dos olhos dele e "cabelo" na do cabelo (`comporFolha`):
 * a íris pintada segue a cor que o jogador escolhe no painel de Aparência.
 *
 * O OLHO DO MODELO tem duas camadas — o olho e, atrás, uma casca um pouco maior, escura (o contorno) —
 * e um desenho minúsculo: as bordas dele (de lado para a folha, sem tinta) e a casca mostravam o
 * desenho velho em volta do pintado. `apagaOlhos` (a folha dos olhos já nasce com ele): a peça
 * `Eyes` passa a ser toda do texel mais ESCURO dela (`olhosApagados`) — o pintado manda, e o que
 * fica sem tinta vira a linha dos cílios.
 *
 * NO ARQUIVO: as `pinturas` de um corpo em assets/modelagem.json — { id, nome, parte, de, em,
 * dir, cima, largura, altura, prof, px: [w, h], espelho, apagaOlhos, arquivo } — e a imagem em
 * assets/pintura/<arquivo>.png (2w × h: a cor à esquerda, o tipo à direita).
 */
import * as THREE from 'three';
import { ORIGENS, pesosDaParte, centroDoPuxao } from './modelagem.js';
import { misturar } from './ima.js';

export const PASTA_DA_PINTURA = 'assets/pintura/';
/** As tintas: a cor escolhida, ou a do personagem (o índice no TIPO é o da tinta − 1). */
export const TINTAS = ['cor', 'pele', 'olhos', 'cabelo'];
/** As cores de quem não escolheu ("Original"): a pele da paleta do modelo, um castanho de íris, o cabelo do modelo. */
export const CORES_DO_MODELO = { pele: '#f8bb7f', olhos: '#4a3020', cabelo: '#62423c' };
// o que NÃO recebe pintura
const FORA = new Set(['armadura', 'cabelo', 'barba', 'sobrancelhas'].map((o) => ORIGENS.indexOf(o)));
// o triângulo recebe a folha se está virado para ela (o cosseno da normal dele com a dela): numa face
// quase de lado a imagem projetada estica e vira uma faixa (a borda de cima do olho saía um risco branco)
const VIRADA = 0.45;
const LEVANTA = 0.015;  // cm acima da pele (e o material empurra para a frente na profundidade)
const OLHOS = ORIGENS.indexOf('olhos');

// ------------------------------------------------------------ a imagem
/** Uma imagem de folha vazia: { w, h, cor: RGBA, tipo: RGBA (R pele, G olhos, B cabelo; A sempre 255) }. */
export function imagemVazia(w, h) {
  const tipo = new Uint8ClampedArray(w * h * 4);
  for (let i = 3; i < tipo.length; i += 4) tipo[i] = 255;
  return { w, h, cor: new Uint8ClampedArray(w * h * 4), tipo };
}
/** A imagem de um PNG de folha (uma imagem ou canvas de 2w × h: a cor à esquerda, o tipo à direita). */
export function imagemDoPng(fonte) {
  const W = fonte.width, w = W >> 1, h = fonte.height, c = document.createElement('canvas');
  c.width = W; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(fonte, 0, 0);
  const d = g.getImageData(0, 0, W, h).data, img = imagemVazia(w, h);
  for (let y = 0; y < h; y++) {
    img.cor.set(d.subarray(y * W * 4, (y * W + w) * 4), y * w * 4);
    img.tipo.set(d.subarray((y * W + w) * 4, (y * W + 2 * w) * 4), y * w * 4);
  }
  for (let i = 3; i < img.tipo.length; i += 4) img.tipo[i] = 255;
  return img;
}
/** O canvas (2w × h) de que sai o PNG de uma imagem de folha. */
export function canvasDaImagem(img) {
  const c = document.createElement('canvas');
  c.width = img.w * 2; c.height = img.h;
  const g = c.getContext('2d'), d = g.createImageData(img.w * 2, img.h);
  for (let y = 0; y < img.h; y++) {
    d.data.set(img.cor.subarray(y * img.w * 4, (y + 1) * img.w * 4), y * img.w * 8);
    d.data.set(img.tipo.subarray(y * img.w * 4, (y + 1) * img.w * 4), (y * img.w * 2 + img.w) * 4);
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** As imagens das folhas de todos os corpos da modelagem: Map arquivo → imagem (a que falta só avisa). */
export async function carregarPinturas(modelagem) {
  const imagens = new Map(), arquivos = new Set();
  for (const e of Object.values(modelagem?.corpos ?? {})) for (const f of e?.pinturas ?? []) if (/^[a-z0-9-]{1,80}$/.test(f?.arquivo ?? '')) arquivos.add(f.arquivo);
  await Promise.all([...arquivos].map(async (a) => {
    try {
      const r = await fetch(`${PASTA_DA_PINTURA}${a}.png`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const bmp = await createImageBitmap(await r.blob(), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
      imagens.set(a, imagemDoPng(bmp));
      bmp.close?.();
    } catch (e) { console.warn(`[pintura] não li ${a}.png: ${e.message}`); }
  }));
  return imagens;
}

const rgb = (hex) => { const n = parseInt(String(hex).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
/**
 * A imagem que se vê de uma folha (num canvas w × h): a COR, com o que é de cada tinta do
 * personagem trocado pela cor dele (`cores`: { pele, olhos, cabelo }, '#rrggbb').
 */
export function comporFolha(img, cores, destino) {
  const g = destino.getContext('2d'), out = g.createImageData(img.w, img.h), o = out.data, c = img.cor, t = img.tipo;
  const k = [rgb(cores.pele), rgb(cores.olhos), rgb(cores.cabelo)];
  for (let i = 0; i < o.length; i += 4) {
    let a = t[i] / 255, b = t[i + 1] / 255, d = t[i + 2] / 255;
    const s = a + b + d;
    if (s > 1) { a /= s; b /= s; d /= s; }
    const resto = 1 - Math.min(1, s);
    for (let e = 0; e < 3; e++) o[i + e] = c[i + e] * resto + k[0][e] * a + k[1][e] * b + k[2][e] * d;
    o[i + 3] = c[i + 3];
  }
  g.putImageData(out, 0, 0);
}

// as texturas do jogo, uma por folha e cores (divididas por quem tem as mesmas)
const texturas = new Map();
/** Esquece as texturas das folhas (o editor, depois de pintar). */
export function esquecerTexturasDaPintura() { for (const t of texturas.values()) t.dispose(); texturas.clear(); }
/** A textura de uma folha nas cores de um personagem — ou null (a imagem não foi lida). `imagens`: Map arquivo → imagem. */
export function texturaDaFolha(folha, cores, imagens) {
  const img = imagens?.get(folha.arquivo);
  if (!img) return null;
  const chave = `${folha.arquivo}|${cores.pele}|${cores.olhos}|${cores.cabelo}`;
  if (!texturas.has(chave)) {
    const c = document.createElement('canvas');
    c.width = img.w; c.height = img.h;
    comporFolha(img, cores, c);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    texturas.set(chave, t);
  }
  return texturas.get(chave);
}

// ------------------------------------------------------------ a projeção
/**
 * Os eixos de uma folha: o centro `c`, `n` (para FORA, de onde ela olha), `u` (o lado da imagem:
 * da esquerda para a direita, vista de frente) e `v` (para cima). `espelho`: os da folha espelhada
 * (o reflexo em x de cada um — a imagem sai espelhada do outro lado).
 */
export function eixosDaFolha(folha, centro, espelho = false) {
  const n = new THREE.Vector3(...folha.dir).negate().normalize(), v = new THREE.Vector3(...folha.cima);
  v.addScaledVector(n, -v.dot(n)).normalize();
  const u = new THREE.Vector3().crossVectors(v, n), c = centro.clone();
  if (espelho) for (const x of [n, v, u, c]) x.x = -x.x;
  return { c, n, u, v };
}
/** Onde um ponto (cm, no espaço da malha) cai na folha: [u, v] (0 a 1 dentro dela) e a profundidade (cm; + = para fora). */
export function naFolha(folha, eixos, p) {
  const dx = p.x - eixos.c.x, dy = p.y - eixos.c.y, dz = p.z - eixos.c.z;
  return [(dx * eixos.u.x + dy * eixos.u.y + dz * eixos.u.z) / folha.largura + 0.5, (dx * eixos.v.x + dy * eixos.v.y + dz * eixos.v.z) / folha.altura + 0.5, dx * eixos.n.x + dy * eixos.n.y + dz * eixos.n.z];
}
/** O centro da folha na malha como ela está (o lugar do corpo que o `em` dela marca), ou null. */
export function centroDaFolha(folha, geo, ctx, P = ctx.base ?? geo.attributes.position.array) {
  return centroDoPuxao({ de: folha.de, em: folha.em }, geo, ctx, false, P, folha.parte && folha.parte !== 'corpo' ? pesosDaParte(folha.parte, geo, ctx) : null);
}

// um polígono recortado num lado da caixa: os que ficam (`dentro`), mais onde cada aresta cruza
function recortar(poli, eixo, limite, dentro) {
  const saida = [];
  for (let m = 0; m < poli.length; m++) {
    const a = poli[m], b = poli[(m + 1) % poli.length], da = dentro(a.q[eixo]), db = dentro(b.q[eixo]);
    if (da) saida.push(a);
    if (da !== db) {
      const t = (limite - a.q[eixo]) / (b.q[eixo] - a.q[eixo]);
      saida.push({ q: a.q.map((x, k) => x + (b.q[k] - x) * t), b: a.b.map((x, k) => x + (b.b[k] - x) * t) });
    }
  }
  return saida;
}

/**
 * A malha de uma folha sobre uma malha do corpo (a fundida, ou a vista do editor): os triângulos
 * que ela cobre, recortados nela, com a UV da imagem e os ossos do corpo — ou null (não cobre nada).
 * `ctx`: o que a malha fundida guardou para a modelagem (`origem`, `antes`…).
 */
export function geometriaDaFolha(folha, geo, ctx) {
  // a projeção é feita na malha de ANTES das edições da modelagem (`ctx.base`) e cada ponto vai para onde
  // o lugar dele foi parar: a tinta GRUDA na malha (o olho reposicionado leva o desenho junto)
  const P = geo.attributes.position.array, Q = ctx.base?.length === P.length ? ctx.base : P, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, idx = geo.index;
  const nt = (idx ? idx.count : P.length / 3) / 3, vi = (t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);
  const centro = centroDaFolha(folha, geo, ctx, Q);
  if (!centro || !si || !sw) return null;
  const w = folha.parte && folha.parte !== 'corpo' ? pesosDaParte(folha.parte, geo, ctx) : null;
  const L = folha.largura / 2, H = folha.altura / 2, D = folha.prof;
  const pesoDe = (i) => ({ o: [0, 1, 2, 3].map((k) => si.getComponent(i, k)), p: [0, 1, 2, 3].map((k) => sw.getComponent(i, k)) });
  const pos = [], nor = [], uv = [], ossos = [], pesos = [];
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), fn = new THREE.Vector3(), e1 = new THREE.Vector3();
  const A1 = new THREE.Vector3(), B1 = new THREE.Vector3(), C1 = new THREE.Vector3(), fn1 = new THREE.Vector3();
  for (const espelho of folha.espelho ? [false, true] : [false]) {
    const E = eixosDaFolha(folha, centro, espelho);
    for (let t = 0; t < nt; t++) {
      const i = vi(t, 0), j = vi(t, 1), k = vi(t, 2);
      if (FORA.has(ctx.origem[i]) || (w && w[i] + w[j] + w[k] < 1.5)) continue;
      A.fromArray(Q, i * 3); B.fromArray(Q, j * 3); C.fromArray(Q, k * 3);
      fn.subVectors(B, A).cross(e1.subVectors(C, A));
      if (fn.lengthSq() < 1e-12) continue;
      fn.normalize();
      if (fn.dot(E.n) < VIRADA) continue;
      const q = [A, B, C].map((p) => { const [a, b, d] = naFolha(folha, E, p); return [(a - 0.5) * folha.largura, (b - 0.5) * folha.altura, d]; });
      // (longe da folha, nem recorta)
      if (q.every((x) => x[0] < -L) || q.every((x) => x[0] > L) || q.every((x) => x[1] < -H) || q.every((x) => x[1] > H) || q.every((x) => x[2] < -D) || q.every((x) => x[2] > D)) continue;
      let poli = [{ q: q[0], b: [1, 0, 0] }, { q: q[1], b: [0, 1, 0] }, { q: q[2], b: [0, 0, 1] }];
      poli = recortar(poli, 0, -L, (x) => x >= -L); poli = recortar(poli, 0, L, (x) => x <= L);
      poli = recortar(poli, 1, -H, (x) => x >= -H); poli = recortar(poli, 1, H, (x) => x <= H);
      poli = recortar(poli, 2, -D, (x) => x >= -D); poli = recortar(poli, 2, D, (x) => x <= D);
      if (poli.length < 3) continue;
      // (no OLHO a luz é a de uma superfície lisa de frente para a folha: as facetas dele — a de cima,
      // virada para o céu — clareavam a tinta em riscos; na pele, a luz é a da faceta, como a da pele)
      A1.fromArray(P, i * 3); B1.fromArray(P, j * 3); C1.fromArray(P, k * 3);
      fn1.subVectors(B1, A1).cross(e1.subVectors(C1, A1)).normalize();
      const luz = ctx.origem[i] === OLHOS ? E.n : fn1;
      const wi = pesoDe(i), wj = pesoDe(j), wk = pesoDe(k);
      const canto = (c) => {
        const [a, b, d] = c.b;
        // (levantada na direção da FOLHA, a mesma para todos: pela normal de cada face, as emendas abriam frestas)
        pos.push(A1.x * a + B1.x * b + C1.x * d + E.n.x * LEVANTA, A1.y * a + B1.y * b + C1.y * d + E.n.y * LEVANTA, A1.z * a + B1.z * b + C1.z * d + E.n.z * LEVANTA);
        nor.push(luz.x, luz.y, luz.z);
        uv.push(c.q[0] / folha.largura + 0.5, c.q[1] / folha.altura + 0.5);
        const m = misturar([[wi, a], [wj, b], [wk, d]]);
        ossos.push(...m.o); pesos.push(...m.p);
      };
      for (let m = 1; m < poli.length - 1; m++) { canto(poli[0]); canto(poli[m]); canto(poli[m + 1]); }
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry(), n = pos.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));   // (o material é o do corpo, com cor de vértice)
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(ossos, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(pesos, 4));
  return g;
}

/**
 * O material de uma folha: o do CORPO (a mesma luz, o mesmo reflexo, o mesmo shader com ossos e
 * cor de vértice), com a imagem dela, transparente e um pouco à frente na profundidade (não briga
 * com a pele). Só o empurrão FIXO: o que cresce com a inclinação da face fazia a tinta da casca de
 * trás do olho passar na frente dele, na borda.
 */
export const EMPURRA = { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -2 };
export function materialDaPintura(doCorpo, map) {
  const m = doCorpo.clone();
  Object.assign(m, { map, transparent: true, depthWrite: false, vertexColors: true, ...EMPURRA });
  return m;
}

// ------------------------------------------------------------ o olho do modelo, apagado
const apagados = new Map(), escuros = new WeakMap();
// a UV de um texel PRETO no meio de uma área preta da textura (filtrada, a borda de uma área escura
// pega a cor do vizinho): o miolo do quadrado de 9 × 9 mais escuro, procurado entre os pixels quase pretos
function uvEscura(peca) {
  const img = peca.material?.map?.image;
  if (!img?.width) return null;
  if (escuros.has(img)) return escuros.get(img);
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const W = c.width, H = c.height, px = g.getImageData(0, 0, W, H).data, brilho = (x, y) => { const k = (y * W + x) * 4; return px[k] + px[k + 1] + px[k + 2]; };
  let melhor = Infinity, achado = null;
  for (let y = 4; y < H - 4; y += 2) for (let x = 4; x < W - 4; x += 2) {
    if (brilho(x, y) > 24) continue;
    let pior = 0;
    for (let dy = -4; dy <= 4 && pior < melhor; dy++) for (let dx = -4; dx <= 4; dx++) pior = Math.max(pior, brilho(x + dx, y + dy));
    if (pior < melhor) { melhor = pior; achado = [(x + 0.5) / W, (y + 0.5) / H]; if (!pior) break; }
  }
  escuros.set(img, achado);
  return achado;
}
// Os triângulos da CASCA de cada olho. O olho do modelo é, de cada lado, UMA plaquinha fechada: a tampa da
// FRENTE (9 pontos, 8 triângulos), a de trás (os mesmos 9 pontos ~1,7 mm para dentro) e o ARO que as liga.
// A casca é tudo menos a tampa da frente. Acha-se pelos GÊMEOS: cada ponto de uma tampa tem o seu na outra,
// colado nele; o triângulo do aro tem um par de gêmeos, o de tampa não; das duas tampas, a da frente é a
// de maior z.
export function cascaDoOlho(g) {
  const P = g.attributes.position, nt = P.count / 3, casca = new Uint8Array(nt);
  const chave = (i) => `${P.getX(i).toFixed(4)},${P.getY(i).toFixed(4)},${P.getZ(i).toFixed(4)}`;
  for (const lado of [1, -1]) {
    const pts = new Map(), tris = [];
    for (let t = 0; t < nt; t++) {
      if (P.getX(t * 3) * lado <= 0) continue;
      tris.push(t);
      for (let e = 0; e < 3; e++) pts.set(chave(t * 3 + e), [P.getX(t * 3 + e), P.getY(t * 3 + e), P.getZ(t * 3 + e)]);
    }
    if (pts.size < 6) continue;
    const ks = [...pts.keys()], vs = [...pts.values()];
    const diag = Math.hypot(...[0, 1, 2].map((e) => Math.max(...vs.map((v) => v[e])) - Math.min(...vs.map((v) => v[e]))));
    const gemeo = new Map();
    for (const k of ks) {
      let m = Infinity, q = null;
      for (const o of ks) { if (o === k) continue; const d = Math.hypot(pts.get(k)[0] - pts.get(o)[0], pts.get(k)[1] - pts.get(o)[1], pts.get(k)[2] - pts.get(o)[2]); if (d < m) { m = d; q = o; } }
      if (m < diag * 0.08) gemeo.set(k, q);
    }
    const cantos = (t) => [0, 1, 2].map((e) => chave(t * 3 + e));
    const tampa = tris.filter((t) => { const c = cantos(t); return !c.some((x) => c.includes(gemeo.get(x))); });
    // as duas tampas: os grupos de triângulos de tampa ligados por um ponto
    const pai = new Map(), raiz = (k) => { while (pai.get(k) !== k) k = pai.get(k); return k; };
    for (const t of tampa) { const c = cantos(t); for (const k of c) if (!pai.has(k)) pai.set(k, k); pai.set(raiz(c[1]), raiz(c[0])); pai.set(raiz(c[2]), raiz(c[0])); }
    const grupos = new Map();
    for (const t of tampa) { const r = raiz(chave(t * 3)), gr = grupos.get(r) ?? grupos.set(r, { z: 0, n: 0, tris: new Set() }).get(r); for (const k of cantos(t)) { gr.z += pts.get(k)[2]; gr.n++; } gr.tris.add(t); }
    if (grupos.size < 2) continue;   // (não é a plaquinha que se esperava: fica tudo como olho)
    const frente = [...grupos.values()].reduce((m, gr) => (gr.z / gr.n > m.z / m.n ? gr : m));
    for (const t of tris) if (!frente.tris.has(t)) casca[t] = 1;
  }
  return casca;
}
// uma peça só com uns triângulos de outra (sem índice), e `mudar(g)` nela
function parteDa(g0, quais, mudar) {
  const tris = [];
  for (let t = 0; t < quais.length; t++) if (quais[t]) tris.push(t);
  const g = new THREE.BufferGeometry();
  for (const [nome, a] of Object.entries(g0.attributes)) {
    const s = a.itemSize, arr = new a.array.constructor(tris.length * 3 * s);
    tris.forEach((t, j) => arr.set(a.array.subarray(t * 3 * s, (t + 1) * 3 * s), j * 3 * s));
    g.setAttribute(nome, new THREE.BufferAttribute(arr, s, a.normalized));
  }
  mudar(g);
  return g;
}
/**
 * Os olhos debaixo de uma folha pintada (`apagaOlhos`), no formato da malha fundida: [o olho — todo
 * do texel PRETO, sem o tom da íris (o pintado manda; o que fica sem tinta vira a linha dos cílios) —,
 * a CASCA de trás — na cor da PELE (`pele`: a peça da cabeça, tingida ou não), como a pálpebra: preta,
 * ela fazia um contorno grosso em volta do olho]. A casca se chama `Eyes_casca` (é pele para a
 * modelagem e a pintura); sem a peça da cabeça, ou sem casca, fica tudo preto como antes.
 */
export function olhosApagados(peca, pele) {
  const id = `${peca.geometry.uuid}|${pele?.geometry.uuid}`;
  if (!apagados.has(id)) {
    const g0 = peca.geometry, casca = g0.index ? new Uint8Array(0) : cascaDoOlho(g0), uv = uvEscura(peca);
    const preto = (g) => { if (uv) for (let i = 0; i < g.attributes.uv.count; i++) g.attributes.uv.setXY(i, uv[0], uv[1]); g.attributes.color?.array.fill(1); };
    if (!casca.includes(1) || !pele?.geometry.attributes.uv) { const g = g0.clone(); preto(g); apagados.set(id, [g]); }
    else {
      // a cor da pele: a UV e a cor de vértice de um ponto da cabeça na faixa de pele da paleta
      const pu = pele.geometry.attributes.uv, pc = pele.geometry.attributes.color;
      let k = 0;
      for (let i = 0; i < pu.count; i++) { const u = pu.getX(i), v = pu.getY(i); if (u >= 0.33 && u <= 0.46 && v >= 0.28 && v <= 0.34) { k = i; break; } }
      const naPele = (g) => {
        for (let i = 0; i < g.attributes.uv.count; i++) g.attributes.uv.setXY(i, pu.getX(k), pu.getY(k));
        const c = g.attributes.color;
        if (c) for (let i = 0; i < c.count; i++) c.setXYZ(i, pc ? pc.getX(k) : 1, pc ? pc.getY(k) : 1, pc ? pc.getZ(k) : 1);
      };
      apagados.set(id, [parteDa(g0, casca.map((x) => 1 - x), preto), parteDa(g0, casca, naPele)]);
    }
  }
  const [olho, casca] = apagados.get(id), base = { skeleton: peca.skeleton, material: peca.material, bindMatrix: peca.bindMatrix };
  return casca ? [{ name: peca.name, geometry: olho, ...base }, { name: 'Eyes_casca', geometry: casca, ...base }] : [{ name: peca.name, geometry: olho, ...base }];
}

/**
 * Para o preaquecer do jogo (main.js): uma folha de um triângulo no corpo do jogador, para o
 * shader da pintura (transparente, com ossos) compilar no carregamento — e não no meio do jogo,
 * quando chega alguém pintado. Devolve quem a tira.
 */
export function aquecerPintura(corpo) {
  if (!corpo?.fundida) return () => {};
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 100, 0, 1, 100, 0, 0, 101, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(9).fill(1), 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(12), 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], 4));
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const tex = new THREE.CanvasTexture(c), m = new THREE.SkinnedMesh(g, materialDaPintura(corpo.fundida.material, tex));
  m.frustumCulled = false; m.receiveShadow = true;
  corpo.cena.add(m);
  m.bind(corpo.esqueleto, corpo.fundida.bindMatrix);
  return () => { corpo.cena.remove(m); g.dispose(); m.material.dispose(); tex.dispose(); };
}
