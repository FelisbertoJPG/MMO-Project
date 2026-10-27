// O CORPO DE ARQUIVO (26/10/2026) — um 3º corpo do guerreiro feito de um modelo PRONTO (o primeiro: a
// "Feminino 2", um .glb do Meshy sem esqueleto nem cor), por `ferramentas/corpo-de-arquivo/importar.mjs`:
// a malha dele no lugar das peças do corpo do guerreiro (as armaduras continuam), presa aos MESMOS ossos
// — as animações, a pegada das armas e as duas mãos servem como sempre.
//
// O arquivo (`assets/corpos/<nome>.json`, `Assets.corpos`) traz a malha na pose T do guerreiro (cm), a
// REGIÃO de cada triângulo (pele, cabelo, roupa e o que foi desenhado no rosto: olhos e boca), os pesos e
// ONDE FICA CADA OSSO neste corpo (as pernas dela são mais longas, os ombros mais estreitos…). O
// `CorpoGuerreiro` move os ossos para lá (`ossosDoArquivo`, no `aplicarRaca`) e o esqueleto DELE ganha os
// inversos de ligação deste corpo (`inversosDoArquivo`): a malha fica na forma VERDADEIRA — a aba Modelo do
// editor a desenha crua, sem os ossos, e edita nela — e cada parte gira em volta da junta DESTE corpo. As
// armaduras, feitas para as juntas do guerreiro, andam junto com elas (guerreiro.js `geometriaFundida`: cada
// ponto mais o quanto os ossos dele andaram — `anda`).
//
// As CORES são de vértice, todas sobre um ponto do CINZA liso da paleta do guerreiro (o maior pedaço de
// uma cor só: de longe, a textura reduzida não mistura outra cor): a cor de vértice é a pedida ÷ a do
// cinza. Pele, cabelo e olhos são os da aparência (no Original, os do modelo: `jogo.cores`); a roupa é a do
// arquivo. Não há penteado, barba, sobrancelha, batom nem piscada: o rosto e o cabelo são os dele. As
// edições da aba Modelo valem (a chave do corpo é '<raça>:arquivo', modelagem.js `chaveDoCorpo`).
import * as THREE from 'three';
import { lerAparencia, corDaPele, CABELOS, OLHOS, corNaPaleta } from './aparencia.js';
import { aplicarModelagem, acrescentarTriangulos } from './modelagem.js';
import { racaDe } from './raca.js';

// ------------------------------------------------------------ O ROSTO DA MODELO 1 (26/10/2026)
// O dono: "carregue a boca/lábios da modelo 1 pro modelo 2, conecte com as malhas corretamente e permita batom e edições
// como a modelo 1" — e o mesmo com os olhos. O corpo de arquivo vem com BURACOS no rosto (importar.mjs, `rosto` no
// arquivo: a beira de cada um, cm) e o `CorpoGuerreiro` põe nele as peças do rosto do GUERREIRO — `Face` recortada só na
// boca e nos olhos (`rostoDaModelo`: a peça inteira, recortada depois das edições dela) e `Eyes` —, que na malha fundida (guerreiro.js `geometriaFundida`) ganham:
//  1. as EDIÇÕES DA MODELO 1 (a humana feminina, `humano:feminino`) que caem nelas (`edicoesDoRosto`: os puxões, os
//     cortes, os criados, os vértices movidos… e a parte dos olhos), aplicadas só nelas;
//  2. o LUGAR: cada pedaço (a boca, cada olho com a peça dos olhos) do tamanho `escala` e com a beira no meio do buraco;
//  3. a COSTURA: uma faixa liga a beira do pedaço à do buraco (um zíper pela ordem do ângulo em volta do meio do buraco).
// O `antes` delas continua o do guerreiro: o BATOM e a SOMBRA (folhas projetadas no modelo — boca.js, sombra.js), os
// cílios-delineado, a íris e a piscada saem como na modelo 1, e as edições da aba Modelo deste corpo pegam nelas.
// As regiões, em cm do guerreiro (pose T): a boca e cada olho (elipse de frente), e só o que está à frente de `frente`
export const ROSTO_DA_MODELO = { boca: { x: 0, y: 160.95, rx: 5.0, ry: 2.4 }, olho: { x: 4.96, y: 171.67, rx: 3.4, ry: 2.45 }, frente: 4 };
const BURACOS = ['boca', 'olho1', 'olho2'];
/** A região do rosto de um ponto do guerreiro (cm): 0 = a boca, 1 = o olho do lado +x, 2 = o do lado −x, −1 = fora. */
export function regiaoDoRosto(x, y, z, folga = 0) {
  const R = ROSTO_DA_MODELO, dentro = (cx, r) => ((x - cx) / (r.rx + folga)) ** 2 + ((y - r.y) / (r.ry + folga)) ** 2 < 1;
  if (z < R.frente - folga) return -1;
  return dentro(R.boca.x, R.boca) ? 0 : dentro(R.olho.x, R.olho) ? 1 : dentro(-R.olho.x, R.olho) ? 2 : -1;
}
// (o ponto que não cai em nenhuma — um criado na beira —: a região mais perto)
const regiaoMaisPerto = (x, y, z) => {
  const r = regiaoDoRosto(x, y, z, 1.5);
  if (r >= 0) return r;
  const R = ROSTO_DA_MODELO, d = [Math.hypot(x - R.boca.x, y - R.boca.y), Math.hypot(x - R.olho.x, y - R.olho.y), Math.hypot(x + R.olho.x, y - R.olho.y)];
  return d.indexOf(Math.min(...d));
};

/**
 * A peça `Face` INTEIRA para o transplante: as edições da modelo 1 precisam dela toda (ela refez os olhos com triângulos
 * criados que se apoiam em pontos de fora deles) — o que fica fora da boca e dos olhos some DEPOIS delas (`transplantarRosto`).
 * `raca`: a fusão molda esta peça com a raça da MODELO 1 — a arcada e o queixo dela, raca.js `moldarPeca` —, não com a deste
 * corpo: as edições dela foram feitas no rosto moldado (sem isso, a arcada do guerreiro caía sobre o olho e ele ficava
 * fechado). O `antes` continua o do modelo, onde as edições dela estão presas.
 */
export const rostoDaModelo = (face) => ({ name: face.name, geometry: face.geometry, skeleton: face.skeleton, material: face.material, bindMatrix: face.bindMatrix, raca: racaDe(0, 1) });

/** As edições da MODELO 1 que caem no rosto transplantado (a boca e os olhos), ou null. */
export function edicoesDoRosto(fem) {
  if (!fem) return null;
  // (todo o ROSTO dela — o recorte da boca e dos olhos vem depois delas: os criados se apoiam em pontos de fora deles)
  const doRosto = (de, em) => (de === 'corpo' || de === 'olhos') && Array.isArray(em) && em[1] > 150 && em[2] > 0 && Math.abs(em[0]) < 12;
  const so = (l, f) => (Array.isArray(l) ? l.filter(f) : []);
  const r = {
    partes: fem.partes?.olhos ? { olhos: fem.partes.olhos } : {},
    puxoes: so(fem.puxoes, (x) => doRosto(x.de, x.em)),
    cortes: so(fem.cortes, (x) => doRosto(x.de, x.em)),
    vertices: so(fem.vertices, (x) => doRosto(x.de, x.em)),
    novos: so(fem.novos, (x) => x.cantos?.every((c) => doRosto(c.de, c.em))),
    movidos: so(fem.movidos, (x) => doRosto(x.de, x.em)),
    apagados: so(fem.apagados, (x) => doRosto(x.de, x.em)),
    cores: so(fem.cores, (x) => doRosto(x.de, x.em)),
  };
  for (const k of Object.keys(r)) if (Array.isArray(r[k]) && !r[k].length) delete r[k];
  if (!Object.keys(r.partes).length) delete r.partes;
  return Object.keys(r).length ? r : null;
}

// a BEIRA de fora de uma peça (os triângulos da região `r`, só os de pele): as arestas de um triângulo só, soldadas pela
// posição — o laço mais longo (o de dentro, em volta do olho, é menor). Um vértice por ponto
function bordaDaRegiao(P, n, tag, origem, r) {
  const ch = (i) => `${P[i * 3].toFixed(3)},${P[i * 3 + 1].toFixed(3)},${P[i * 3 + 2].toFixed(3)}`;
  // (os triângulos CRIADOS da modelo 1 vêm em dobro — uma face de cada lado, nos mesmos pontos: contam uma vez só)
  const contas = new Map(), dono = new Map(), vistos = new Set(), conta = [];
  for (let t = 0; t < n / 3; t++) {
    const v = [t * 3, t * 3 + 1, t * 3 + 2];
    if (!v.every((i) => tag[i] === r && origem[i] === 0)) continue;
    const k = v.map(ch);
    if (k[0] === k[1] || k[1] === k[2] || k[0] === k[2]) continue;   // (cortado: os cantos juntos)
    const igual = [...k].sort().join('#');
    if (vistos.has(igual)) continue;
    vistos.add(igual); conta.push(t);
    for (let e = 0; e < 3; e++) {
      const a = k[e], b = k[(e + 1) % 3], aresta = a < b ? `${a}|${b}` : `${b}|${a}`;
      contas.set(aresta, (contas.get(aresta) ?? 0) + 1);
      if (!dono.has(a)) dono.set(a, v[e]);
    }
  }
  const proximo = new Map();
  for (const t of conta) {
    const v = [t * 3, t * 3 + 1, t * 3 + 2], k = v.map(ch);
    for (let e = 0; e < 3; e++) { const a = k[e], b = k[(e + 1) % 3]; if (contas.get(a < b ? `${a}|${b}` : `${b}|${a}`) === 1) proximo.set(a, b); }
  }
  let melhor = [], comp = 0;
  const visto = new Set();
  for (const a0 of proximo.keys()) {
    if (visto.has(a0)) continue;
    const l = [];
    for (let a = a0; a !== undefined && !visto.has(a); a = proximo.get(a)) { visto.add(a); l.push(dono.get(a)); }
    let c = 0;
    for (let i = 0; i < l.length; i++) { const p = l[i], q = l[(i + 1) % l.length]; c += Math.hypot(P[p * 3] - P[q * 3], P[p * 3 + 1] - P[q * 3 + 1], P[p * 3 + 2] - P[q * 3 + 2]); }
    if (c > comp) { comp = c; melhor = l; }
  }
  return melhor;
}
const centroDe = (P, l) => [0, 1, 2].map((e) => l.reduce((s, i) => s + P[i * 3 + e], 0) / l.length);

/**
 * O TRANSPLANTE do rosto na malha fundida (antes das edições deste corpo — o `base` da aba Modelo já o tem): as edições da
 * modelo 1 só nas peças do rosto, o lugar de cada pedaço e a costura. `faixas`: { face, olhos, arq } — os vértices de cada
 * peça ([de, até]). Devolve a geometria (outra, se entrou triângulo) e acerta o `ctx` (origem, antes).
 */
export function transplantarRosto(geo, ctx, tp, faixas) {
  const n0 = geo.attributes.position.count;
  // (o que é das peças do rosto: a Face, os Eyes e os criados da modelo 1, no fim)
  const doRosto = (i) => (faixas.face && i >= faixas.face[0] && i < faixas.face[1]) || (faixas.olhos && i >= faixas.olhos[0] && i < faixas.olhos[1]) || i >= n0;
  // a REGIÃO de cada vértice das peças do rosto, pelo TRIÂNGULO dele (o meio do `antes`): os olhos pelo lado; fora da boca e
  // dos olhos, −1
  const marcar = () => {
    const n = geo.attributes.position.count, t = new Int8Array(n).fill(-1), A = ctx.antes;
    for (let q = 0; q < n / 3; q++) {
      const v = q * 3;
      if (!doRosto(v)) continue;
      const olho = faixas.olhos && v >= faixas.olhos[0] && v < faixas.olhos[1];
      const r = olho ? (A[v * 3] > 0 ? 1 : 2) : regiaoDoRosto(...[0, 1, 2].map((e) => (A[v * 3 + e] + A[v * 3 + 3 + e] + A[v * 3 + 6 + e]) / 3));
      t[v] = t[v + 1] = t[v + 2] = r;
    }
    return t;
  };
  // 1. as edições da modelo 1, nas peças do rosto INTEIRAS (o resto do corpo fica de fora: origem 255)
  if (tp.fem) {
    const t0 = new Int8Array(n0).map((_, i) => (doRosto(i) ? 0 : -1)), origem = ctx.origem.slice();
    for (let i = 0; i < origem.length; i++) if (t0[i] < 0) origem[i] = 255;
    const ctxA = { ordem: ctx.ordem, origem, antes: ctx.antes, juntas: ctx.juntas };
    // (a parte "corpo inteiro" pega qualquer vértice perto do pincel — e a pele deste corpo está perto dos olhos: o que não é
    // do rosto transplantado volta para onde estava)
    const antesDela = geo.attributes.position.array.slice();
    aplicarModelagem(geo, tp.fem, ctxA);
    const PA = geo.attributes.position.array;
    for (let i = 0; i < n0; i++) if (t0[i] < 0) { PA[i * 3] = antesDela[i * 3]; PA[i * 3 + 1] = antesDela[i * 3 + 1]; PA[i * 3 + 2] = antesDela[i * 3 + 2]; }
    const g2 = acrescentarTriangulos(geo, ctxA);
    if (g2 !== geo) {
      const n1 = g2.attributes.position.count, o = new Uint8Array(n1);
      o.set(ctx.origem); o.set(ctxA.origem.subarray(n0), n0);
      ctx.origem = o; ctx.antes = ctxA.antes; geo = g2;
    }
  }
  // 2. o RECORTE: o que das peças do rosto fica fora da boca e dos olhos SOME (os três cantos no meio do triângulo)
  const tag = marcar(), P = geo.attributes.position.array, n = geo.attributes.position.count;
  for (let q = 0; q < n / 3; q++) {
    const v = q * 3;
    if (!doRosto(v) || tag[v] >= 0) continue;
    for (let e = 0; e < 3; e++) { const m = (P[v * 3 + e] + P[v * 3 + 3 + e] + P[v * 3 + 6 + e]) / 3; P[v * 3 + e] = P[v * 3 + 3 + e] = P[v * 3 + 6 + e] = m; }
  }
  // 3. o lugar: cada pedaço do tamanho `escala`, a beira dele no meio do buraco
  const furos = [];
  for (let r = 0; r < 3; r++) {
    const b = tp.buracos?.[BURACOS[r]];
    if (!b?.borda?.length) continue;
    // (a beira do buraco: os pontos do corpo de arquivo com aquele `antes`)
    const furo = b.borda.map((p) => {
      let melhor = -1, d = 0.02 ** 2;
      for (let i = faixas.arq[0]; i < faixas.arq[1]; i++) { const q = (ctx.antes[i * 3] - p[0]) ** 2 + (ctx.antes[i * 3 + 1] - p[1]) ** 2 + (ctx.antes[i * 3 + 2] - p[2]) ** 2; if (q < d) { d = q; melhor = i; } }
      return melhor;
    }).filter((i) => i >= 0);
    const borda = bordaDaRegiao(P, n, tag, ctx.origem, r);
    if (furo.length < 3 || borda.length < 3) continue;
    const ch = centroDe(P, furo), cp = centroDe(P, borda), s = b.escala ?? 1;
    for (let i = 0; i < n; i++) if (tag[i] === r) for (let e = 0; e < 3; e++) P[i * 3 + e] = ch[e] + (P[i * 3 + e] - cp[e]) * s;
    furos.push({ borda, furo, centro: ch });
  }
  geo.attributes.position.needsUpdate = true;
  // 4. a costura: um zíper entre a beira do pedaço e a do buraco (pela ordem do ângulo em volta do meio do buraco)
  const tris = [];
  for (const { borda, furo, centro } of furos) {
    const ang = (i) => Math.atan2(P[i * 3 + 1] - centro[1], P[i * 3] - centro[0]);
    const emOrdem = (l) => l.map((i) => [i, ang(i)]).sort((a, b) => a[1] - b[1]);
    const A = emOrdem(borda), B = emOrdem(furo), na = A.length, nb = B.length;
    const un = (L, q) => L[q % L.length][1] + (q >= L.length ? 2 * Math.PI : 0);
    let i = 0, j = 0;
    while (i < na || j < nb) {
      const a0 = A[i % na][0], b0 = B[j % nb][0];
      if (j >= nb || (i < na && un(A, i + 1) <= un(B, j + 1))) { tris.push([a0, A[(i + 1) % na][0], b0]); i++; } else { tris.push([a0, B[(j + 1) % nb][0], b0]); j++; }
    }
  }
  if (!tris.length) return geo;
  const k = tris.length * 3, n2 = n + k, g = new THREE.BufferGeometry(), a = new THREE.Vector3(), b2 = new THREE.Vector3(), c = new THREE.Vector3();
  // (cada triângulo virado para a FRENTE: o rosto olha para +z)
  for (const tri of tris) {
    a.fromArray(P, tri[0] * 3); b2.fromArray(P, tri[1] * 3).sub(a); c.fromArray(P, tri[2] * 3).sub(a);
    if (b2.cross(c).z < 0) [tri[1], tri[2]] = [tri[2], tri[1]];
  }
  for (const [nome, at] of Object.entries(geo.attributes)) {
    const s = at.itemSize, arr = new at.array.constructor(n2 * s);
    arr.set(at.array);
    tris.forEach((tri, q) => tri.forEach((src, e) => arr.set(at.array.subarray(src * s, (src + 1) * s), (n + q * 3 + e) * s)));
    g.setAttribute(nome, new THREE.BufferAttribute(arr, s, at.normalized));
  }
  const P2 = g.attributes.position.array, N2 = g.attributes.normal?.array;
  if (N2) for (let q = 0; q < tris.length; q++) {
    const v = (n + q * 3) * 3;
    a.fromArray(P2, v); b2.fromArray(P2, v + 3).sub(a); c.fromArray(P2, v + 6).sub(a);
    b2.cross(c).normalize();
    for (let e = 0; e < 3; e++) N2.set([b2.x, b2.y, b2.z], v + e * 3);
  }
  const o = new Uint8Array(n2), A2 = new Float32Array(n2 * 3);
  o.set(ctx.origem.subarray(0, n)); A2.set(ctx.antes.subarray(0, n * 3));
  tris.forEach((tri, q) => tri.forEach((src, e) => { o[n + q * 3 + e] = 0; A2.set(ctx.antes.subarray(src * 3, src * 3 + 3), (n + q * 3 + e) * 3); }));
  ctx.origem = o; ctx.antes = A2;
  g.userData = geo.userData;
  geo.dispose();
  return g;
}

export const REGIOES = ['pele', 'cabelo', 'roupa', 'branco', 'iris', 'escuro', 'brilho', 'boca'];
const FIXAS = { branco: '#f2eee6', escuro: '#1b1416', brilho: '#ffffff', boca: '#b4646c' };
const UV = [0.586, 0.44];               // (um ponto do cinza liso da paleta: 112/255)
const CINZA = [0.162, 0.162, 0.162];    // (o mesmo, linear — se a imagem não der para ler)

/** onde fica, na pose T (no espaço da malha), cada osso de `ordem`, segundo os inversos de ligação */
const juntas = (ordem, inversos, ligacao) => {
  const volta = ligacao.clone().invert(), m = new THREE.Matrix4();
  return ordem.map((_, i) => new THREE.Vector3().setFromMatrixPosition(m.copy(inversos[i]).invert()).applyMatrix4(volta));
};
/** O quanto cada osso de `ordem` anda neste corpo (cm, no espaço da malha; o que o arquivo não diz, nada). */
export function andaNoArquivo(corpo, ordem, inversos, ligacao) {
  const J = juntas(ordem, inversos, ligacao);
  return ordem.map((n, i) => (corpo.ossos[n] ? new THREE.Vector3(...corpo.ossos[n]).sub(J[i]) : new THREE.Vector3()));
}

/**
 * As posições LOCAIS dos ossos para este corpo: o osso vai para a junta do arquivo, com o giro de sempre
 * (local = inverso de ligação do pai · (junta − o quanto o pai andou)). Ossos sem junta no arquivo: null.
 */
export function ossosDoArquivo(corpo, ossos, ordem, inversos, ligacao) {
  const anda = andaNoArquivo(corpo, ordem, inversos, ligacao);
  return ossos.map((b) => {
    const alvo = corpo.ossos[b.name];
    if (!alvo) return null;
    const p = ordem.indexOf(b.parent?.name ?? '');
    if (p < 0) return null;
    return new THREE.Vector3(...alvo).sub(anda[p]).applyMatrix4(ligacao).applyMatrix4(inversos[p]);
  });
}

/**
 * Os INVERSOS DE LIGAÇÃO do esqueleto neste corpo: o osso no lugar novo, com o giro de sempre —
 * inverso · T(−o quanto ele andou, no espaço da ligação). Com eles, a malha do arquivo vai crua (a forma verdadeira).
 */
export function inversosDoArquivo(corpo, ordem, inversos, ligacao) {
  const anda = andaNoArquivo(corpo, ordem, inversos, ligacao), zero = new THREE.Vector3().applyMatrix4(ligacao), d = new THREE.Vector3();
  return inversos.map((m, i) => { d.copy(anda[i]).applyMatrix4(ligacao).sub(zero); return m.clone().multiply(new THREE.Matrix4().makeTranslation(-d.x, -d.y, -d.z)); });
}

const feitas = new Map();
/** Esquece as malhas feitas (o importador mudou o arquivo). */
export function esquecerCorpos() { for (const g of feitas.values()) g.dispose(); feitas.clear(); }

/**
 * A PEÇA do corpo de arquivo para a malha fundida (guerreiro.js `geometriaFundida`), na aparência `codigo`:
 * { name, geometry, skeleton, material, bindMatrix, semRaca, anda, juntas } — `semRaca`: as proporções não a
 * deformam (elas só afinam as armaduras); `anda`: o quanto cada osso de `ordem` andou (as armaduras vão junto);
 * `juntas`: onde fica cada osso neste corpo (os pivôs das partes da aba Modelo). A geometria é dividida por quem
 * tem as mesmas cores.
 */
export function pecaDoArquivo(corpo, codigo, { ordem, inversos, esqueleto, ligacao, material }) {
  if (corpo.uv) return pecaComTextura(corpo, { ordem, inversos, esqueleto, ligacao, material });
  const a = lerAparencia(codigo), c = corpo.jogo?.cores ?? {};
  const cores = { pele: corDaPele(a) ?? c.pele ?? '#f8bb7f', cabelo: CABELOS[a.cor]?.[1] ?? c.cabelo ?? '#2a1812', iris: OLHOS[a.olhos]?.[1] ?? c.olhos ?? '#2f7f95', roupa: c.roupa ?? '#232a44', ...FIXAS };
  const chave = `${corpo.nome}|${cores.pele}|${cores.cabelo}|${cores.iris}`;
  if (!feitas.has(chave)) {
    const base = corNaPaleta(material?.map, ...UV) ?? CINZA;
    const rgb = REGIOES.map((r) => { const k = new THREE.Color(cores[r]); return [k.r / Math.max(0.02, base[0]), k.g / Math.max(0.02, base[1]), k.b / Math.max(0.02, base[2])]; });
    const P = corpo.pos, I = corpo.idx, nt = I.length / 3;
    const indice = corpo.nomes.map((n) => ordem.indexOf(n));   // (o osso do arquivo → o índice na ordem do guerreiro)
    const pos = new Float32Array(nt * 9), nor = new Float32Array(nt * 9), cor = new Float32Array(nt * 9), uv = new Float32Array(nt * 6);
    const si = new Uint16Array(nt * 12), sw = new Float32Array(nt * 12);
    const a3 = new THREE.Vector3(), b3 = new THREE.Vector3(), c3 = new THREE.Vector3(), n3 = new THREE.Vector3(), d = new THREE.Vector3();
    for (let t = 0; t < nt; t++) {
      a3.fromArray(P, I[t * 3] * 3); b3.fromArray(P, I[t * 3 + 1] * 3); c3.fromArray(P, I[t * 3 + 2] * 3);
      n3.subVectors(c3, b3).cross(d.subVectors(a3, b3)).normalize();   // (a normal da FACE: o facetado)
      const k = rgb[corpo.regiao[t]] ?? rgb[0];
      for (let q = 0; q < 3; q++) {
        const v = I[t * 3 + q], o = t * 3 + q;
        for (let j = 0; j < 4; j++) { si[o * 4 + j] = Math.max(0, indice[corpo.ossoDe[v * 4 + j]] ?? 0); sw[o * 4 + j] = corpo.peso[v * 4 + j] / 255; }
        pos[o * 3] = P[v * 3]; pos[o * 3 + 1] = P[v * 3 + 1]; pos[o * 3 + 2] = P[v * 3 + 2];
        n3.toArray(nor, o * 3);
        cor[o * 3] = k[0]; cor[o * 3 + 1] = k[1]; cor[o * 3 + 2] = k[2];
        uv[o * 2] = UV[0]; uv[o * 2 + 1] = UV[1];
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(cor, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    // (em cache para sempre não: cada cor de pele da régua faz uma)
    if (feitas.size > 24) esquecerCorpos();
    feitas.set(chave, g);
  }
  const anda = andaNoArquivo(corpo, ordem, inversos, ligacao), juntasDele = new Map(Object.entries(corpo.ossos).map(([n, p]) => [n, new THREE.Vector3(...p)]));
  return { name: `corpo_${corpo.nome}`, geometry: feitas.get(chave), skeleton: esqueleto, material, bindMatrix: ligacao, semRaca: true, anda, juntas: juntasDele };
}

// ------------------------------------------------------------ O MODELO INTEIRO, COM A TEXTURA (27/10/2026)
// A FEMININO 3 (o dono: "carrega o esqueleto da fem2 nessa última e mapeia os vértices — o jogo carrega cada triângulo do
// modelo, aí podemos editar na mão"): o .glb do Meshy INTEIRO (todos os triângulos, a UV e a textura dele), com o esqueleto
// achado como o da Feminino 2 e os pesos passados da cópia reduzida para cada ponto (importar.mjs, `manter`). A cor é a
// da TEXTURA: a peça vai na malha fundida com o grupo dela (guerreiro.js: `textura` na peça → o 2º material da fundida,
// `materialDaTextura`) e as normais lisas do arquivo. Pele, cabelo e olhos já vêm pintados: o painel não os oferece.
const texturas = new Map();
/** A textura de um corpo (uma por caminho, dividida por todos os bonecos). */
export function texturaDoCorpo(caminho) {
  if (!texturas.has(caminho)) {
    const t = new THREE.TextureLoader().load(caminho);
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 4;   // (a UV do glTF: sem virar)
    texturas.set(caminho, t);
  }
  return texturas.get(caminho);
}
/** Um material com a textura do corpo, do jeito do material do guerreiro (`base`: a aspereza, o reflexo do céu). */
export function materialDaTextura(caminho, base) {
  const m = new THREE.MeshStandardMaterial({ map: texturaDoCorpo(caminho), roughness: base?.roughness ?? 0.85, metalness: 0 });
  if (base?.envMap) { m.envMap = base.envMap; m.envMapIntensity = base.envMapIntensity; }
  m.name = 'corpo-textura';
  return m;
}
function pecaComTextura(corpo, { ordem, inversos, esqueleto, ligacao, material }) {
  const chave = `${corpo.nome}|textura`;
  if (!feitas.has(chave)) {
    const P = corpo.pos, N = corpo.normal, U = corpo.uv, I = corpo.idx, n = I.length;
    const indice = corpo.nomes.map((nm) => ordem.indexOf(nm));
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let o = 0; o < n; o++) {
      const v = I[o];
      pos[o * 3] = P[v * 3]; pos[o * 3 + 1] = P[v * 3 + 1]; pos[o * 3 + 2] = P[v * 3 + 2];
      nor[o * 3] = N[v * 3]; nor[o * 3 + 1] = N[v * 3 + 1]; nor[o * 3 + 2] = N[v * 3 + 2];
      uv[o * 2] = U[v * 2]; uv[o * 2 + 1] = U[v * 2 + 1];
      for (let j = 0; j < 4; j++) { si[o * 4 + j] = Math.max(0, indice[corpo.ossoDe[v * 4 + j]] ?? 0); sw[o * 4 + j] = corpo.peso[v * 4 + j] / 255; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    feitas.set(chave, g);
  }
  const anda = andaNoArquivo(corpo, ordem, inversos, ligacao), juntasDele = new Map(Object.entries(corpo.ossos).map(([nm, p]) => [nm, new THREE.Vector3(...p)]));
  return { name: `corpo_${corpo.nome}`, geometry: feitas.get(chave), skeleton: esqueleto, material, bindMatrix: ligacao, semRaca: true, anda, juntas: juntasDele, textura: corpo.textura };
}
