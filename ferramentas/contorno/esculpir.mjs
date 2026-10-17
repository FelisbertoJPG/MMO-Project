// O ESCULPIDO PELO CONTORNO (16/10/2026): um personagem 3D a partir de FOTOS (frente, lado,
// costas e uma colorida de frente), sem o arquivo original — o "caminho 3":
//   1. CONTORNO: em cada foto, o fundo liso é tirado (inundação a partir da borda) e sobra a
//      silhueta;
//   2. PICOTAR: o recorte (<nome>.json) diz, peça por peça, em que caixa de cada foto ler a
//      largura (frente/costas) e a profundidade (lado) — capuz, casaco, pernas, mochila,
//      braços, mãos, cajado;
//   3. PREENCHER: cada peça vira um volume fatia a fatia: em cada altura, a largura da frente
//      e a profundidade do lado viram uma seção arredondada (superelipse) — o "casco visual"
//      de duas vistas, com os cantos gastos como massinha;
//   4. ESCULPIR: o rosto afunda dentro do capuz; os olhos entram; as cores vêm da foto
//      colorida PROJETADA de frente (o que olha para a frente) e da cor da peça (o resto);
//   5. COLAR NOS OSSOS: o esqueleto é o do manequim UAL (os mesmos nomes e os mesmos giros de
//      repouso, só os comprimentos mudam: as proporções do personagem) — então TODAS as
//      animações do jogo servem (js/esculpido.js copia os giros). Os braços são montados na
//      pose T (estendidos), as pernas e o tronco como na foto; cada peça segue a sua corrente
//      de ossos (pesos por altura, ou ao longo do braço).
// O cajado sai como peça rígida à parte (o jogo o põe na mão direita).
//
// LOW-POLY FACETADO (17/10/2026, `lowpoly` no recorte): em vez de uma fatia a cada `passo` pixels
// (os calombos de "massa de modelar": cada linha da foto um pouco mais larga ou mais estreita),
// cada peça fica só com as fatias que MUDAM a forma — as séries alisadas, as alturas obrigatórias
// (as juntas dos ossos, com uma fatia antes e outra depois do joelho, do tornozelo, do cotovelo e
// do pulso, para dobrar sem amassar; as divisas das faixas de cor; o rosto) e, entre elas, a que
// mais foge da reta, até nenhuma fugir mais que `tolerancia` (Douglas–Peucker) —, com poucos
// `lados` em volta; cada triângulo sai com os SEUS vértices e a normal da face (faces planas de
// verdade). Os pesos são os mesmos (a conta é pela posição) e as cópias de um vértice levam os
// mesmos pesos: a malha não abre ao dobrar.
// COR SÓLIDA (`corSolida`): nada de foto pintada — cada peça (e cada faixa dela, o rosto, a
// borda do rosto, a frente do casaco) tem UMA cor lisa, a do recorte; o gerador imprime, ao lado,
// a mediana da foto colorida em cada região (`foto #rrggbb`), o ponto de partida para escolher.
//
// Uso (da raiz do jogo):
//   node ferramentas/contorno/esculpir.mjs ferramentas/contorno/dennis.json ["<pasta das fotos>"] [--conferir=<pasta>]
// (sem a pasta, vale a `fotos` do recorte)
// Grava assets/esculpidos/<nome>.glb. Com --conferir, grava na pasta as fotos com a silhueta e
// as caixas (vistas-<nome>.png) e o resultado desenhado de 4 lados (resultado-<nome>.png).
// Usa o three r185 de ferramentas/guerreiro (o do jogo não tem o GLTFExporter).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lerImagem, gravarPng } from './imagem.mjs';

globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, getContext: () => null }) };
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then((r) => { this.result = r; this.onloadend?.(); this.onload?.(); }); } readAsDataURL(b) { b.arrayBuffer().then((r) => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(r).toString('base64'); this.onloadend?.(); this.onload?.(); }); } };
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '../..');
const THREE = await import('../guerreiro/three.module.min.js');
const { GLTFExporter } = await import('../guerreiro/addons/GLTFExporter.js');
console.warn = () => {};

const args = process.argv.slice(2);
const [ARQ_RECORTE, PASTA_ARG] = args.filter((a) => !a.startsWith('--'));
if (!ARQ_RECORTE) { console.log('uso: node esculpir.mjs <recorte.json> <pasta das fotos> [--conferir=<pasta>] [--saida=<arquivo.glb>]'); process.exit(1); }
const opcao = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const R = JSON.parse(fs.readFileSync(ARQ_RECORTE, 'utf8'));
// a pasta das fotos: a do comando, ou a que o recorte lembra (`fotos`; o Editor de Personagem regera por ela)
const PASTA = PASTA_ARG ?? R.fotos;
if (!PASTA || !fs.existsSync(PASTA)) { console.log(`sem a pasta das fotos (${PASTA ?? 'nem no comando nem em "fotos" do recorte'})`); process.exit(1); }
const H = R.altura;
const SAIDA = opcao('saida') ?? path.join(RAIZ, 'assets/esculpidos', `${R.nome}.glb`);
const CONFERIR = opcao('conferir');
// o LOW-POLY (null = as fatias densas e lisas de antes) e a COR SÓLIDA (ver o cabeçalho)
const LP = R.lowpoly ? { lados: 12, tolerancia: 0.008, alisar: 3, juntas: 0.03, ...R.lowpoly } : null;
const SOLIDA = !!R.corSolida;

const V3 = THREE.Vector3;
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const suave = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };
const linear = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };   // (o three já guarda em linear)
const deSrgb = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };

// ---------------------------------------------------------------- 1. AS VISTAS E O CONTORNO
function abrirVista(nome, def) {
  const im = lerImagem(path.join(PASTA, def.arquivo));
  const { largura: L, altura: A, rgb } = im;
  // o fundo: a cor do meio da borda; é fundo tudo que se chega da borda sem passar de `tolerancia`
  const borda = [];
  for (let x = 0; x < L; x++) borda.push(x, (A - 1) * L + x);
  for (let y = 0; y < A; y++) borda.push(y * L, y * L + L - 1);
  const fundo = [0, 1, 2].map((k) => borda.map((i) => rgb[i * 3 + k]).sort((a, b) => a - b)[borda.length >> 1]);
  const longe = (i) => Math.hypot(rgb[i * 3] - fundo[0], rgb[i * 3 + 1] - fundo[1], rgb[i * 3 + 2] - fundo[2]) > def.tolerancia;
  const ehFundo = new Uint8Array(L * A), pilha = [...borda];
  while (pilha.length) {
    const i = pilha.pop();
    if (ehFundo[i] || longe(i)) continue;
    ehFundo[i] = 1;
    const x = i % L, y = (i / L) | 0;
    if (x > 0) pilha.push(i - 1); if (x < L - 1) pilha.push(i + 1);
    if (y > 0) pilha.push(i - L); if (y < A - 1) pilha.push(i + L);
  }
  const mascara = ehFundo.map((f) => 1 - f);
  const m = def.marcos, esc = m.chao - m.topo;
  return { nome, ...def, im, L, A, mascara, esc, fundo };
}
const vistas = Object.fromEntries(Object.entries(R.vistas).map(([n, d]) => [n, abrirVista(n, d)]));
const REF = vistas.frente;
// a altura de referência (0 = chão, 1 = topo do capuz, medida na FRENTE) de cada marco
const vMarco = Object.fromEntries(Object.entries(REF.marcos).map(([k, y]) => [k, (REF.marcos.chao - y) / REF.esc]));
for (const V of Object.values(vistas)) {
  // pares (v da frente, y desta foto) dos marcos que as duas têm, de baixo para cima
  V.pares = Object.entries(V.marcos).filter(([k]) => k in vMarco).map(([k, y]) => [vMarco[k], y]).sort((a, b) => a[0] - b[0]);
  const P = V.pares;
  // v → y: linear por trechos entre os marcos (fora deles, o trecho mais perto continua)
  V.yDe = (v) => {
    let i = 0; while (i < P.length - 2 && v > P[i + 1][0]) i++;
    const [v0, y0] = P[i], [v1, y1] = P[i + 1];
    return y0 + ((v - v0) / (v1 - v0)) * (y1 - y0);
  };
  V.vDe = (y) => {
    let i = 0; while (i < P.length - 2 && y < P[i + 1][1]) i++;
    const [v0, y0] = P[i], [v1, y1] = P[i + 1];
    return v0 + ((y - y0) / (y1 - y0)) * (v1 - v0);
  };
  // x da foto → coordenada do mundo, em alturas (frente: +x = a esquerda do personagem;
  // lado: +z = a frente dele, que olha para a esquerda da foto; costas: espelhada)
  V.mundo = (x) => ((x - V.eixo) / V.esc) * (V.espelhar ? -1 : 1);
}

/** O trecho da silhueta na linha `y`, dentro de [x0, x1]: o mais largo, o da direita, o da esquerda ou "tudo" */
function trecho(V, y, x0, x1, escolha = 'maior') {
  const yi = Math.round(y);
  if (yi < 0 || yi >= V.A) return null;
  const trechos = [];
  let ini = -1;
  for (let x = Math.max(0, x0); x <= Math.min(V.L - 1, x1) + 1; x++) {
    const dentro = x <= Math.min(V.L - 1, x1) && V.mascara[yi * V.L + x];
    if (dentro && ini < 0) ini = x;
    if (!dentro && ini >= 0) { trechos.push([ini - 0.5, x - 0.5]); ini = -1; }
  }
  if (!trechos.length) return null;
  if (escolha === 'direita') return trechos[trechos.length - 1];
  if (escolha === 'esquerda') return trechos[0];
  if (escolha === 'tudo') return [trechos[0][0], trechos[trechos.length - 1][1]];   // (de uma ponta à outra: o casaco aberto embaixo)
  return trechos.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
}
/** os buracos de uma lista (null) viram o vizinho válido mais perto */
function tapar(lista) {
  const ok = lista.map((x, i) => (x ? i : -1)).filter((i) => i >= 0);
  if (!ok.length) return null;
  return lista.map((x, i) => x ?? lista[ok.reduce((a, b) => (Math.abs(b - i) < Math.abs(a - i) ? b : a))]);
}
/** média móvel de uma série de números */
const alisar = (s, r = 2) => s.map((_, i) => { let t = 0, n = 0; for (let k = -r; k <= r; k++) if (s[i + k] != null) { t += s[i + k]; n++; } return t / n; });

/**
 * LOW-POLY: das fatias densas (posições `ys`, crescentes; `series` = as medidas em cada uma), só
 * as que mudam a forma. As séries são alisadas; entram as pontas, as OBRIGATÓRIAS (`forcadas`:
 * [posição, prioridade] — perto demais uma da outra, fica a de maior prioridade) e, entre cada
 * duas, a fatia que mais foge da reta, até nenhuma fugir mais que `tol` (Douglas–Peucker).
 */
function simplificar(ys, series, forcadas = [], tol = LP.tolerancia * H, r = LP.alisar) {
  const n = ys.length, lisas = series.map((s) => alisar(s, r));
  const em = (s, y) => {
    if (y <= ys[0]) return s[0];
    if (y >= ys[n - 1]) return s[n - 1];
    let i = 0; while (ys[i + 1] < y) i++;
    return s[i] + ((s[i + 1] - s[i]) * (y - ys[i])) / (ys[i + 1] - ys[i]);
  };
  const perto = 0.012 * H;   // (duas fatias mais perto que isso viram lasca)
  const chaves = [];
  for (const [y] of [[ys[0], 9], [ys[n - 1], 9], ...forcadas].sort((a, b) => b[1] - a[1])) {
    if (y < ys[0] || y > ys[n - 1]) continue;
    if (chaves.every((c) => Math.abs(c - y) >= perto)) chaves.push(y);
  }
  chaves.sort((a, b) => a - b);
  const extra = [];
  const dividir = (y0, y1) => {
    let pior = -1, desvio = tol;
    for (let i = 0; i < n; i++) {
      const y = ys[i];
      if (y < y0 + perto || y > y1 - perto) continue;
      const t = (y - y0) / (y1 - y0);
      for (const s of lisas) {
        const d = Math.abs(s[i] - (em(s, y0) + (em(s, y1) - em(s, y0)) * t));
        if (d > desvio) { desvio = d; pior = i; }
      }
    }
    if (pior < 0) return;
    extra.push(ys[pior]); dividir(y0, ys[pior]); dividir(ys[pior], y1);
  };
  for (let k = 0; k < chaves.length - 1; k++) dividir(chaves[k], chaves[k + 1]);
  const finais = [...chaves, ...extra].sort((a, b) => a - b);
  return { ys: finais, series: lisas.map((s) => finais.map((y) => em(s, y))) };
}

/**
 * As FATIAS de uma peça: para cada altura v (de baixo para cima), o centro e a meia-largura
 * em x (da frente ou das costas) e em z (do lado), em ALTURAS.
 */
function fatias(p) {
  const [nx, ...cx] = p.x, VX = vistas[nx];
  const [nz, ...cz] = p.z ?? [null], VZ = nz ? vistas[nz] : null;
  const [V, c] = p.altura === 'z' ? [VZ, cz] : [VX, cx];
  // (`estender`: a peça sobe além da caixa, com a medida da última linha — a perna para dentro do casaco)
  const vBase = V.vDe(c[3]), vTopo = V.vDe(p.estender ?? c[1]);
  const passo = (R.passo ?? 2) / REF.esc;
  const n = Math.max(2, Math.round((vTopo - vBase) / passo) + 1);
  const ler = (W, cc, v, escolha) => {
    const y = W.yDe(v);
    if (y < cc[1] - 0.5 || y > cc[3] + 0.5) return null;
    const t = trecho(W, y, cc[0], cc[2], escolha);
    return t && [W.mundo(t[0]), W.mundo(t[1])].sort((a, b) => a - b);
  };
  const vs = [...Array(n)].map((_, i) => vBase + ((vTopo - vBase) * i) / (n - 1));
  const sx = tapar(vs.map((v) => ler(VX, cx, v, p.escolha)));
  const sz = VZ ? tapar(vs.map((v) => ler(VZ, cz, v, 'maior'))) : null;
  if (!sx || (VZ && !sz)) throw new Error(`a peça ${p.nome} não achou silhueta nas caixas`);
  return {
    v: vs,
    cx: alisar(sx.map((s) => (s[0] + s[1]) / 2)), ax: alisar(sx.map((s) => (s[1] - s[0]) / 2)),
    cz: sz ? alisar(sz.map((s) => (s[0] + s[1]) / 2)) : null, az: sz ? alisar(sz.map((s) => (s[1] - s[0]) / 2)) : null,
  };
}

// ---------------------------------------------------------------- 2. O ESQUELETO (o do UAL, nas proporções do personagem)
const glbUal = fs.readFileSync(path.join(RAIZ, 'assets/characters/UAL1.glb'));
const jUal = JSON.parse(glbUal.subarray(20, 20 + glbUal.readUInt32LE(12)));
const nos = jUal.nodes.map((n) => {
  if (n.mesh !== undefined || n.skin !== undefined) return null;
  const o = n.name === 'Armature' ? new THREE.Group() : new THREE.Bone();
  o.name = n.name;
  if (n.translation) o.position.fromArray(n.translation);
  if (n.rotation) o.quaternion.fromArray(n.rotation);
  if (n.scale) o.scale.fromArray(n.scale);
  return o;
});
jUal.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => { if (nos[i] && nos[c]) nos[i].add(nos[c]); }));
const armature = nos.find((o) => o?.name === 'Armature');
armature.updateMatrixWorld(true);
const osso = (n) => armature.getObjectByName(n);
const U = {};   // a posição de cada osso do manequim na pose T (metros)
armature.traverse((o) => { if (o.isBone) U[o.name] = o.getWorldPosition(new V3()); });

const E = R.esqueleto;
const kT = ((E.pescoco - E.quadril) * H) / (U.neck_01.y - U.pelvis.y);       // o tronco
const kL = (E.coxa[1] * H) / U.thigh_l.y;                                       // as pernas (na frente/trás)
const kA = (E.braco * H) / (U.hand_l.x - U.upperarm_l.x);                       // os braços
const kM = (E.mao * H) / (U.middle_04_leaf_l.x - U.hand_l.x);                   // as mãos
const alvo = {};
const tronco = (p) => new V3(p.x * kT, E.quadril * H + (p.y - U.pelvis.y) * kT, p.z * kT);
armature.traverse((o) => {
  if (!o.isBone) return;
  const n = o.name, s = n.endsWith('_l') ? 1 : -1, l = n.endsWith('_l') ? 'l' : 'r';
  const p = U[n];
  if (n === 'root') alvo[n] = new V3();
  else if (/^thigh_/.test(n)) alvo[n] = new V3(s * E.coxa[0] * H, E.coxa[1] * H, p.z * kL);
  else if (/^calf_/.test(n)) alvo[n] = new V3(s * E.coxa[0] * H, E.joelho * H, p.z * kL);
  else if (/^foot_/.test(n)) alvo[n] = new V3(s * E.coxa[0] * H, E.tornozelo * H, p.z * kL);
  else if (/^ball/.test(n)) alvo[n] = p.clone().sub(U[`foot_${l}`]).multiplyScalar(E.pe).add(alvo[`foot_${l}`]);
  else if (/^upperarm_/.test(n)) alvo[n] = new V3(s * E.ombro[0] * H, E.ombro[1] * H, U[n].z * kT);
  else if (/^(lowerarm|hand)_/.test(n)) alvo[n] = p.clone().sub(U[`upperarm_${l}`]).multiplyScalar(kA).add(alvo[`upperarm_${l}`]);
  else if (/^(thumb|index|middle|ring|pinky)_/.test(n)) alvo[n] = p.clone().sub(U[`hand_${l}`]).multiplyScalar(kM).add(alvo[`hand_${l}`]);
  else alvo[n] = tronco(p);
});
// os giros de repouso ficam os do manequim; só a posição de cada osso muda (de cima para baixo)
const ossos = [];
armature.traverse((o) => {
  if (!o.isBone) return;
  ossos.push(o);
  o.parent.updateWorldMatrix(true, false);
  o.position.copy(alvo[o.name].clone().applyMatrix4(o.parent.matrixWorld.clone().invert()));
  o.updateWorldMatrix(false, false);
});
armature.updateMatrixWorld(true);
const P = (n) => osso(n).getWorldPosition(new V3());
const indice = (n) => ossos.findIndex((b) => b.name === n);

// ---------------------------------------------------------------- 3. PREENCHER: as peças
const superelipse = (t, e) => Math.sign(t) * Math.abs(t) ** (2 / e);
/**
 * Um volume por FATIAS (anéis de N pontos) com tampa embaixo e em cima. `aneis`: [{ y, cx, cz,
 * a, b }] ao longo do eixo local Y; `mapa(x, y, z)` leva ao mundo. `fase` gira os pontos do anel
 * em frações de um lado (0,5 no low-poly: uma FACE de frente, de lado e de costas, não uma quina).
 */
function lofting(aneis, N, expoente, { cupulaBaixo = 0, cupulaCima = 0, fase = 0, mapa = (x, y, z) => [x, y, z] } = {}) {
  const pos = [], idx = [], meta = [];
  aneis.forEach((r, i) => {
    for (let k = 0; k < N; k++) {
      const th = (2 * Math.PI * (k + fase)) / N, c = Math.cos(th), s = Math.sin(th);
      pos.push(...mapa(r.cx + r.a * superelipse(c, expoente), r.y, r.cz + r.b * superelipse(s, expoente)));
      meta.push({ anel: i, frente: s });
    }
  });
  const R0 = aneis.length;
  for (let i = 0; i < R0 - 1; i++) for (let k = 0; k < N; k++) {
    const a = i * N + k, b = i * N + ((k + 1) % N), c = (i + 1) * N + k, d = (i + 1) * N + ((k + 1) % N);
    idx.push(a, c, b, b, c, d);
  }
  const tampa = (r, i, dy, cima) => {
    const centro = pos.length / 3;
    pos.push(...mapa(r.cx, r.y + dy, r.cz)); meta.push({ anel: i, frente: 0 });
    for (let k = 0; k < N; k++) {
      const a = i * N + k, b = i * N + ((k + 1) % N);
      if (cima) idx.push(b, a, centro); else idx.push(a, b, centro);
    }
  };
  tampa(aneis[0], 0, -cupulaBaixo, false);
  tampa(aneis[R0 - 1], R0 - 1, cupulaCima, true);
  // o lado de fora para fora (o volume com sinal tem de dar positivo)
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [p0, p1, p2] = [idx[t], idx[t + 1], idx[t + 2]].map((i) => new V3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    vol += p0.dot(p1.clone().cross(p2));
  }
  if (vol < 0) for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2], idx[t + 1]];
  return { pos, idx, meta };
}
/** um elipsoide (raios rx, ry, rz) em volta de `centro`, feito em fatias ao longo de x (no low-poly, `lp` = [N, M]) */
function elipsoide(centro, rx, ry, rz, N = 14, M = 9, lp = null) {
  if (LP && lp) [N, M] = lp;
  const aneis = [...Array(M)].map((_, i) => {
    const t = -1 + (2 * (i + 0.5)) / M, k = Math.sqrt(1 - t * t);
    return { y: t * rx, cx: 0, cz: 0, a: ry * k, b: rz * k };
  });
  const tam = rx * (1 / M);
  return lofting(aneis, N, 2, { cupulaBaixo: tam, cupulaCima: tam, fase: LP ? 0.5 : 0, mapa: (x, y, z) => [centro.x + y, centro.y + x, centro.z + z] });
}

/** pesos ao longo de uma CORRENTE de ossos: `coord` cresce do 1º para o último; `juntas[i]` = onde o osso i começa */
function pesosCorrente(coord, nomes, juntas, raio) {
  const w = nomes.map((_, i) => {
    const ini = i === 0 ? -Infinity : juntas[i], fim = i === nomes.length - 1 ? Infinity : juntas[i + 1];
    return clamp01(Math.min((coord - (ini - raio)) / (2 * raio), ((fim + raio) - coord) / (2 * raio)));
  });
  return nomes.map((n, i) => [indice(n), w[i]]);
}
/** os 4 maiores pesos, somando 1 */
function quatro(lista) {
  const junto = new Map();
  for (const [i, w] of lista) if (w > 1e-4) junto.set(i, (junto.get(i) ?? 0) + w);
  const top = [...junto].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const soma = top.reduce((s, [, w]) => s + w, 0) || 1;
  while (top.length < 4) top.push([0, 0]);
  return top.map(([i, w]) => [i, w / soma]);
}

const pecas = [];   // { nome, pos, idx, cor (por vértice), pesos (por vértice), projetar }
const corDe = (p, v) => linear(p.faixas?.find(([ate]) => v < ate)?.[1] ?? p.cor);

for (const p of R.pecas.filter((x) => !x.tipo)) {
  const f = fatias(p);
  let aneis = f.v.map((v, i) => ({ y: v * H, cx: f.cx[i] * H, cz: f.cz[i] * H, a: Math.max(0.004, f.ax[i] * H), b: Math.max(0.004, f.az[i] * H) }));
  const nomes = p.ossos, perna = /^thigh_/.test(nomes[0]), yQuadril = P('pelvis').y;
  if (LP) {
    // as alturas OBRIGATÓRIAS: as divisas das faixas e o rosto (3), as juntas da perna com uma
    // fatia antes e outra depois (2), as juntas do tronco e o quadril, onde a saia começa (1)
    const forcadas = [];
    for (const [ate] of p.faixas ?? []) forcadas.push([ate * H, 3]);
    if (p.rosto) for (const k of [-1, -0.6, 0, 0.6, 1]) forcadas.push([(p.rosto.v + k * p.rosto.raioV) * H, 3]);
    for (const n of nomes.slice(1)) {
      const y = P(n).y;
      forcadas.push([y, 1]);
      if (perna) forcadas.push([y - LP.juntas * H, 2], [y + LP.juntas * H, 2]);
    }
    if (p.saia) {
      forcadas.push([yQuadril, 1]);
      // a BARRA da saia não afina (na foto, os cantos arredondados da barra; aqui a perna, que
      // sobe por dentro, furava o casaco ali): nos últimos 5% da altura, a medida de cima
      const y5 = aneis[0].y + 0.05 * H, ref = aneis.find((r) => r.y >= y5) ?? aneis.at(-1);
      for (const r of aneis) if (r.y < y5) { r.a = Math.max(r.a, ref.a); r.b = Math.max(r.b, ref.b); }
    }
    const s = simplificar(aneis.map((r) => r.y), ['cx', 'cz', 'a', 'b'].map((k) => aneis.map((r) => r[k])), forcadas);
    aneis = s.ys.map((y, i) => ({ y, cx: s.series[0][i], cz: s.series[1][i], a: s.series[2][i], b: s.series[3][i] }));
  }
  const topoEstreito = aneis.at(-1).a < 0.06 * H;
  const g = lofting(aneis, LP ? (p.lados ?? LP.lados) : p.projetar ? 48 : 32, p.expoente ?? 2.4, { cupulaCima: topoEstreito ? aneis.at(-1).a * 0.4 : 0, fase: LP ? 0.5 : 0 });
  // ESCULPIR o rosto: a frente do capuz, dentro da elipse do rosto, afunda (um prato com a borda macia)
  const afundado = new Uint8Array(g.meta.length);
  if (p.rosto) {
    const { u, v, raioU, raioV, fundo } = p.rosto;
    for (let i = 0; i < g.meta.length; i++) {
      if (g.meta[i].frente <= 0) continue;
      const x = g.pos[i * 3] / H, y = g.pos[i * 3 + 1] / H;
      const r = Math.hypot((x - u) / raioU, (y - v) / raioV);
      if (r >= 1) continue;
      // (no low-poly a borda macia é a própria face inclinada: tudo que está dentro afunda inteiro,
      // com o meio um pouco para a frente — um rosto liso dentro do capuz)
      g.pos[i * 3 + 2] -= LP ? fundo * H * (1 - 0.3 * (1 - r * r)) : fundo * H * (1 - suave(0.7, 1, r)) - 0.3 * fundo * H * (1 - r * r);
      afundado[i] = 1;
    }
  }
  // os pesos: a corrente de ossos pela altura (as pernas de cima para baixo)
  const juntas = nomes.map((n) => (perna ? -P(n).y : P(n).y));
  const yBase = Math.min(...aneis.map((r) => r.y));
  const pesos = [], cor = [];
  for (let i = 0; i < g.pos.length / 3; i++) {
    const x = g.pos[i * 3], y = g.pos[i * 3 + 1];
    let w = pesosCorrente(perna ? -y : y, nomes, juntas, 0.03 * H);
    // a SAIA do casaco (abaixo do quadril) acompanha um pouco as coxas, cada lado a sua
    if (p.saia && y < yQuadril) {
      const s = p.saia * clamp01((yQuadril - y) / (yQuadril - yBase)), lado = suave(-0.04 * H, 0.04 * H, x);
      w = w.map(([k, q]) => [k, q * (1 - s)]).concat([[indice('thigh_l'), s * lado], [indice('thigh_r'), s * (1 - lado)]]);
    }
    pesos.push(quatro(w));
    cor.push(corDe(p, y / H));
  }
  // (a cor sólida de cada face: o rosto afundado, a borda dele, a frente aberta do casaco, as faixas)
  const corEm = (c, nAfundados, nz) => {
    if (p.rosto && nAfundados === 3) return ['rosto', p.rosto.cor ?? p.cor];
    // (a borda de baixo é a do capuz, que passa por baixo do queixo: o forro só aparece em cima e dos lados)
    if (p.rosto && nAfundados && c.y / H >= p.rosto.v - 0.6 * p.rosto.raioV) return ['borda do rosto', p.rosto.borda ?? p.rosto.cor ?? p.cor];
    const fr = p.frente;
    if (fr && nz > 0.5 && Math.abs(c.x / H - (fr.u ?? 0)) < fr.meia && c.y / H > (fr.de ?? -1) && c.y / H < (fr.ate ?? 2)) return ['frente', fr.cor];
    const k = p.faixas?.findIndex(([ate]) => c.y / H < ate) ?? -1;
    return k >= 0 ? [`faixa ${k + 1}`, p.faixas[k][1]] : ['', p.cor];
  };
  pecas.push({ nome: p.nome, ...g, pesos, cor, projetar: !!p.projetar, afundado, corEm });
}

// OS BRAÇOS: o perfil (a largura ao longo do braço) é o da foto, com o braço pendurado; aqui ele
// é montado na pose T, do ombro até o pulso, em volta da linha dos ossos
for (const p of R.pecas.filter((x) => x.tipo === 'braco')) {
  const s = p.lado === 'l' ? 1 : -1;
  const [nx, x0, y0, x1, y1] = p.x, VX = vistas[nx];
  const n = Math.max(6, Math.round((y1 - y0) / (R.passo ?? 2)));
  const larg = tapar([...Array(n)].map((_, i) => { const t = trecho(VX, y0 + ((y1 - y0) * i) / (n - 1), x0, x1, p.escolha); return t && t[1] - t[0]; }));
  const raio = alisar(larg.map((l) => Math.max(p.raioMin ?? 0, l / VX.esc / 2)), 2).map((r) => r * H);
  const ombro = P(`upperarm_${p.lado}`), pulso = P(`hand_${p.lado}`);
  const s0 = Math.abs(ombro.x) - 0.03 * H, s1 = Math.abs(pulso.x);
  let aneis = raio.map((r, i) => ({ y: s0 + ((s1 - s0) * i) / (n - 1), cx: 0, cz: 0, a: r, b: r }));
  const nomes = p.ossos, juntas = nomes.map((nm) => Math.abs(P(nm).x));
  if (LP) {
    // obrigatórias: o cotovelo e o pulso, com uma fatia antes e outra depois; a divisa do punho
    const forcadas = juntas.slice(1).flatMap((j) => [[j, 1], [j - LP.juntas * 0.8 * H, 2], [j + LP.juntas * 0.8 * H, 2]]);
    if (p.punho) forcadas.push([s0 + (s1 - s0) * p.punho[0], 3]);
    const sm = simplificar(aneis.map((r) => r.y), [aneis.map((r) => r.a)], forcadas);
    aneis = sm.ys.map((y, i) => ({ y, cx: 0, cz: 0, a: sm.series[0][i], b: sm.series[0][i] }));
  }
  const g = lofting(aneis, LP ? (p.lados ?? LP.ladosBraco ?? 8) : 20, 2, { cupulaBaixo: raio[0] * 0.6, fase: LP ? 0.5 : 0, mapa: (x, y, z) => [s * y, ombro.y + x, ombro.z + z] });
  const pesos = [], cor = [];
  for (let i = 0; i < g.pos.length / 3; i++) {
    const a = Math.abs(g.pos[i * 3]);
    pesos.push(quatro(pesosCorrente(a, nomes, juntas, 0.025 * H)));
    const t = (a - s0) / (s1 - s0);
    cor.push(linear(p.punho && t > p.punho[0] ? p.punho[1] : p.cor));
  }
  const corEm = (c) => (p.punho && (Math.abs(c.x) - s0) / (s1 - s0) > p.punho[0] ? ['punho', p.punho[1]] : ['', p.cor]);
  pecas.push({ nome: p.nome, ...g, pesos, cor, corEm });
}

// AS MÃOS: um elipsoide do tamanho da mão da foto, com o polegar; presas ao osso da mão
const palmas = {};
for (const p of R.pecas.filter((x) => x.tipo === 'mao')) {
  const s = p.lado === 'l' ? 1 : -1;
  const [nx, x0, y0, x1, y1] = p.x, VX = vistas[nx];
  let largura = 0;
  for (let y = y0; y <= y1; y++) { const t = trecho(VX, y, x0, x1, 'maior'); if (t) largura = Math.max(largura, t[1] - t[0]); }
  const comp = ((y1 - y0) / VX.esc) * H, larg = (largura / VX.esc) * H, esp = larg * 0.75;
  const pulso = P(`hand_${p.lado}`);
  const centro = pulso.clone().add(new V3(s * comp * 0.45, 0, 0));
  palmas[p.lado] = centro.clone();
  const partes = [elipsoide(centro, comp / 2, esp / 2, larg / 2, 14, 9, [8, 4]), elipsoide(pulso.clone().add(new V3(s * comp * 0.3, -esp * 0.1, larg * 0.42)), comp * 0.22, esp * 0.32, esp * 0.32, 10, 6, [6, 3])];
  for (const g of partes) {
    const w = quatro([[indice(`hand_${p.lado}`), 1]]);
    pecas.push({ nome: p.nome, ...g, pesos: g.meta.map(() => w), cor: g.meta.map(() => linear(p.cor)), corEm: () => ['', p.cor] });
  }
}

// ---------------------------------------------------------------- 4. AS NORMAIS E AS CORES DA FOTO
const COR = vistas.cor;
// a foto colorida DESFOCADA (só entre pontos do personagem): a malha tem um ponto a cada ~2 pixels
// da foto, e os detalhes finos (as costuras, as bordas) viravam listras
const DESFOQUE = 2, corLisa = new Float32Array(COR.L * COR.A * 3);
for (let y = 0; y < COR.A; y++) for (let x = 0; x < COR.L; x++) {
  const t = [0, 0, 0]; let n = 0;
  for (let dy = -DESFOQUE; dy <= DESFOQUE; dy++) for (let dx = -DESFOQUE; dx <= DESFOQUE; dx++) {
    const xx = x + dx, yy = y + dy;
    if (xx < 0 || yy < 0 || xx >= COR.L || yy >= COR.A || !COR.mascara[yy * COR.L + xx]) continue;
    for (let k = 0; k < 3; k++) t[k] += deSrgb(COR.im.rgb[(yy * COR.L + xx) * 3 + k]);
    n++;
  }
  for (let k = 0; k < 3; k++) corLisa[(y * COR.L + x) * 3 + k] = n ? t[k] / n : 0;
}
/** a cor da foto colorida no ponto (x, y) do mundo, vista de frente — ou null (fundo / borda) */
function corDaFoto(x, y) {
  const px = Math.round(COR.eixo + (x / H) * COR.esc), py = Math.round(COR.yDe(y / H));
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const xx = px + dx, yy = py + dy;
    if (xx < 0 || yy < 0 || xx >= COR.L || yy >= COR.A || !COR.mascara[yy * COR.L + xx]) return null;
  }
  const o = (py * COR.L + px) * 3;
  return [corLisa[o], corLisa[o + 1], corLisa[o + 2]];
}
for (const pc of pecas) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pc.pos, 3));
  g.setIndex(pc.idx);
  g.computeVertexNormals();
  pc.normal = [...g.attributes.normal.array];
  if (!pc.projetar || SOLIDA) continue;   // (na cor sólida, a foto só dá a SUGESTÃO de cor, abaixo)
  for (let i = 0; i < pc.cor.length; i++) {
    const nz = pc.normal[i * 3 + 2], w = suave(0.4, 0.8, nz);
    if (w <= 0) continue;
    const c = corDaFoto(pc.pos[i * 3], pc.pos[i * 3 + 1]);
    if (c) pc.cor[i] = pc.cor[i].map((b, k) => b + (c[k] - b) * w);
  }
}

/** o z mais à frente da peça no ponto (x, y): um raio vindo de frente (vale para qualquer número de fatias) */
function zNaFrente(pc, x, y) {
  let z = -Infinity;
  const q = (i) => [pc.pos[i * 3], pc.pos[i * 3 + 1], pc.pos[i * 3 + 2]];
  for (let t = 0; t < pc.idx.length; t += 3) {
    const [a, b, c] = [pc.idx[t], pc.idx[t + 1], pc.idx[t + 2]].map(q);
    const d = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
    if (Math.abs(d) < 1e-12) continue;
    const u = ((x - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (y - a[1])) / d, v = ((b[0] - a[0]) * (y - a[1]) - (x - a[0]) * (b[1] - a[1])) / d;
    if (u < 0 || v < 0 || u + v > 1) continue;
    z = Math.max(z, a[2] + u * (b[2] - a[2]) + v * (c[2] - a[2]));
  }
  return z;
}

// OS OLHOS: duas bolinhas brancas pousadas no rosto afundado (presas à cabeça)
if (R.olhos) {
  const capuz = pecas.find((pc) => pc.nome === 'capuz');
  for (const [u, v] of R.olhos.pontos) {
    const z = zNaFrente(capuz, u * H, v * H);
    const r = R.olhos.raio * H;
    const g = elipsoide(new V3(u * H, v * H, z - r * 0.35), r * 0.9, r, r * 0.7, 12, 7, [8, 3]);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3)); geo.setIndex(g.idx); geo.computeVertexNormals();
    const w = quatro([[indice('Head'), 1]]);
    pecas.push({ nome: 'olho', ...g, normal: [...geo.attributes.normal.array], pesos: g.meta.map(() => w), cor: g.meta.map(() => linear(R.olhos.cor)), corEm: () => ['', R.olhos.cor] });
  }
}

// ---------------------------------------------------------------- 4b. A COR SÓLIDA E AS FACES PLANAS
const centroDe = (pc, a, b, c) => new V3(...[0, 1, 2].map((k) => (pc.pos[a * 3 + k] + pc.pos[b * 3 + k] + pc.pos[c * 3 + k]) / 3));
const normalDe = (pc, a, b, c) => {
  const v = (i) => new V3(pc.pos[i * 3], pc.pos[i * 3 + 1], pc.pos[i * 3 + 2]);
  const p0 = v(a);
  return v(b).sub(p0).cross(v(c).sub(p0)).normalize();
};
const hexDe = (c) => '#' + new THREE.Color(...c).getHexString();   // (linear → o #rrggbb do recorte)
const sugestoes = new Map();   // "peça / região" → { usada, amostras da foto }
/** a COR SÓLIDA de cada face (`corFace`, linear) — e, nas peças `projetar`, as amostras da foto de cada região */
function pintarSolido(pc) {
  pc.corFace = [];
  for (let t = 0; t < pc.idx.length; t += 3) {
    const [a, b, c] = [pc.idx[t], pc.idx[t + 1], pc.idx[t + 2]];
    const centro = centroDe(pc, a, b, c), n = normalDe(pc, a, b, c);
    const nAf = pc.afundado ? pc.afundado[a] + pc.afundado[b] + pc.afundado[c] : 0;
    const [regiao, hex] = pc.corEm(centro, nAf, n.z);
    pc.corFace.push(linear(hex));
    const chave = regiao ? `${pc.nome} / ${regiao}` : pc.nome;
    if (!sugestoes.has(chave)) sugestoes.set(chave, { usada: hex, amostras: [] });
    // a foto de frente só vale para o que olha para a frente
    if (!pc.projetar || n.z < 0.5) continue;
    for (const [wa, wb] of [[1 / 3, 1 / 3], [2 / 3, 1 / 6], [1 / 6, 2 / 3], [1 / 6, 1 / 6]]) {
      const x = pc.pos[a * 3] * wa + pc.pos[b * 3] * wb + pc.pos[c * 3] * (1 - wa - wb);
      const y = pc.pos[a * 3 + 1] * wa + pc.pos[b * 3 + 1] * wb + pc.pos[c * 3 + 1] * (1 - wa - wb);
      const cf = corDaFoto(x, y);
      if (cf) sugestoes.get(chave).amostras.push(cf);
    }
  }
}
/** FACES PLANAS: cada triângulo com os seus 3 vértices e a normal da face; os pesos copiados (a malha não abre ao dobrar) */
function facetar(pc) {
  const pos = [], normal = [], cor = [], pesos = [], idx = [];
  for (let t = 0; t < pc.idx.length; t += 3) {
    const tri = [pc.idx[t], pc.idx[t + 1], pc.idx[t + 2]], n = normalDe(pc, ...tri);
    for (const i of tri) {
      idx.push(pos.length / 3);
      pos.push(pc.pos[i * 3], pc.pos[i * 3 + 1], pc.pos[i * 3 + 2]);
      normal.push(n.x, n.y, n.z);
      cor.push(pc.corFace ? pc.corFace[t / 3] : pc.cor[i]);
      if (pc.pesos) pesos.push(pc.pesos[i]);
    }
  }
  return { ...pc, pos, normal, cor, pesos: pc.pesos ? pesos : undefined, idx };
}
/** a peça pronta para a malha: a cor sólida (por face), e as faces planas no low-poly */
function acabar(pc) {
  if (SOLIDA) pintarSolido(pc);
  if (LP) return facetar(pc);
  // (cor sólida sem low-poly: cada vértice com a cor da primeira face que o usa)
  if (pc.corFace) for (let t = pc.idx.length - 3; t >= 0; t -= 3) for (let k = 0; k < 3; k++) pc.cor[pc.idx[t + k]] = pc.corFace[t / 3];
  return pc;
}
const prontas = pecas.map(acabar);

// ---------------------------------------------------------------- 5. A MALHA ÚNICA, O CAJADO E O ARQUIVO
function juntar(lista) {
  const pos = [], nor = [], cor = [], si = [], sw = [], idx = [];
  for (const pc of lista) {
    const base = pos.length / 3;
    pos.push(...pc.pos); nor.push(...pc.normal);
    for (const c of pc.cor) cor.push(...c);
    for (const w of pc.pesos ?? []) { for (const [i] of w) si.push(i); for (const [, q] of w) sw.push(q); }
    for (const i of pc.idx) idx.push(base + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  if (si.length) { g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4)); }
  g.setIndex(idx);
  return g;
}
const material = new THREE.MeshStandardMaterial({ name: 'Esculpido', vertexColors: true, roughness: 0.85, metalness: 0 });
const corpo = new THREE.SkinnedMesh(juntar(prontas), material);
corpo.name = 'Corpo';
armature.add(corpo);
armature.updateMatrixWorld(true);
corpo.bind(new THREE.Skeleton(ossos));

// O CAJADO: em pé, a ponta de baixo no chão (o jogo o põe na mão direita, js/esculpido.js)
let cajado = null, pecaCajado = null;
if (R.cajado) {
  const p = R.cajado, [nx, x0, y0, x1, y1] = p.x, VX = vistas[nx];
  const n = Math.max(8, Math.round((y1 - y0) / (R.passo ?? 2)));
  const ys = [...Array(n)].map((_, i) => y1 - ((y1 - y0) * i) / (n - 1));   // de baixo para cima
  const ignorado = (y) => (p.ignorar ?? []).some(([a, b]) => y >= a && y <= b);
  const larg = tapar(ys.map((y) => { if (ignorado(y)) return null; const t = trecho(VX, y, x0, x1, p.escolha); return t && Math.min(p.largMax ?? 99, t[1] - t[0]); }));
  // (o trecho escondido pela mão fica com a largura do vizinho mais perto)
  const prof = larg.map((l) => Math.min(l, p.profMax ?? l));
  let aneis = ys.map((y, i) => ({ y: (VX.vDe(y) - VX.vDe(y1)) * H, cx: 0, cz: 0, a: (larg[i] / VX.esc / 2) * H, b: (prof[i] / VX.esc / 2) * H }));
  if (LP) {
    const sm = simplificar(aneis.map((r) => r.y), [aneis.map((r) => r.a), aneis.map((r) => r.b)]);
    aneis = sm.ys.map((y, i) => ({ y, cx: 0, cz: 0, a: sm.series[0][i], b: sm.series[1][i] }));
  }
  const g = lofting(aneis, LP ? (p.lados ?? 6) : 10, 2.2, { cupulaCima: aneis.at(-1).a * 0.5, fase: LP ? 0.5 : 0 });
  const base = linear(p.cor);
  // os veios da madeira: faixas mais escuras e mais claras ao longo do comprimento (na cor sólida, não)
  const cor = g.pos.filter((_, i) => i % 3 === 1).map((y) => { const k = SOLIDA ? 1 : 0.85 + 0.15 * Math.sin(y * 47) * Math.sin(y * 13 + 1); return base.map((c) => c * k); });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3)); geo.setIndex(g.idx); geo.computeVertexNormals();
  pecaCajado = acabar({ nome: 'cajado', ...g, normal: [...geo.attributes.normal.array], cor, corEm: () => ['', p.cor] });
  cajado = new THREE.Mesh(juntar([pecaCajado]), material);
  cajado.name = 'Cajado';
  // onde a mão segura: o meio da mão direita, no espaço do osso da mão (o jogo calibra o resto)
  const mao = osso('hand_r');
  cajado.userData.palma = palmas.r ? palmas.r.clone().applyMatrix4(mao.matrixWorld.clone().invert()).toArray().map((v) => +v.toFixed(4)) : [0, 0.05, 0];
}

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
const glb = await new GLTFExporter().parseAsync(cajado ? [armature, cajado] : [armature], { binary: true, onlyVisible: false });
fs.writeFileSync(SAIDA, Buffer.from(glb));
const nv = corpo.geometry.attributes.position.count;
console.log(`gravado ${path.relative(RAIZ, SAIDA)} (${(fs.statSync(SAIDA).size / 1024) | 0} KB) | ${pecas.length} peças, ${nv} vértices, ${corpo.geometry.index.count / 3} triângulos${cajado ? ` (+ ${cajado.geometry.index.count / 3} do cajado)` : ''}, ${ossos.length} ossos | altura ${H} m${LP ? ' | low-poly' : ''}${SOLIDA ? ' | cor sólida' : ''}`);
// a COR SÓLIDA: a cor que cada região usa e a mediana da foto colorida nela (o ponto de partida para escolher no recorte)
if (SOLIDA) for (const [chave, { usada, amostras }] of sugestoes) {
  const med = amostras.length >= 12 ? hexDe([0, 1, 2].map((k) => amostras.map((c) => c[k]).sort((a, b) => a - b)[amostras.length >> 1])) : null;
  console.log(`  ${chave.padEnd(22)} ${usada}${med ? `   (foto ${med}, ${amostras.length} pontos)` : ''}`);
}

// ---------------------------------------------------------------- CONFERIR (imagens)
if (CONFERIR) {
  fs.mkdirSync(CONFERIR, { recursive: true });
  // as fotos lado a lado, com o fundo apagado e as caixas das peças
  const CORES = [[255, 80, 80], [80, 255, 80], [90, 160, 255], [255, 220, 60], [255, 90, 255], [60, 255, 255], [255, 150, 40], [200, 200, 255], [160, 255, 160]];
  const lista = Object.values(vistas), K = 2, Lt = lista.reduce((s, V) => s + V.L * K + 8, 0), At = Math.max(...lista.map((V) => V.A)) * K;
  const img = new Uint8Array(Lt * At * 3);
  let ox = 0;
  for (const V of lista) {
    for (let y = 0; y < V.A * K; y++) for (let x = 0; x < V.L * K; x++) {
      const i = ((y / K) | 0) * V.L + ((x / K) | 0), o = (y * Lt + ox + x) * 3, f = V.mascara[i] ? 1 : 0.25;
      for (let k = 0; k < 3; k++) img[o + k] = V.im.rgb[i * 3 + k] * f;
    }
    const caixa = (c, cor) => {
      const [x0, y0, x1, y1] = c.map((v) => v * K);
      for (let x = x0; x <= x1; x++) for (const y of [y0, y1]) if (y >= 0 && y < At) img.set(cor, (y * Lt + ox + x) * 3);
      for (let y = y0; y <= y1; y++) for (const x of [x0, x1]) if (y >= 0 && y < At) img.set(cor, (y * Lt + ox + x) * 3);
    };
    [...R.pecas, { x: R.cajado?.x }].forEach((p, j) => {
      for (const c of [p.x, p.z]) if (c && c[0] === V.nome) caixa(c.slice(1), CORES[j % CORES.length]);
    });
    for (const [k, y] of Object.entries(V.marcos)) for (let x = 0; x < V.L * K; x += 3) img.set([255, 255, 255], (y * K * Lt + ox + x) * 3);
    ox += V.L * K + 8;
  }
  gravarPng(path.join(CONFERIR, `vistas-${R.nome}.png`), Lt, At, img);

  // o resultado desenhado (pose T) de frente, de lado, de costas e de três quartos
  const g = corpo.geometry, posA = g.attributes.position.array, corA = g.attributes.color.array, id = g.index.array;
  const cp = pecaCajado && { pos: pecaCajado.pos.map((v, i) => v + (i % 3 === 0 ? P('hand_r').x : i % 3 === 2 ? P('hand_r').z : 0)), idx: pecaCajado.idx, cor: pecaCajado.cor };
  const W = 420, Ht = 470, esc = 340 / H, vistasR = [0, Math.PI / 2, Math.PI, Math.PI / 4];
  const out = new Float32Array(W * vistasR.length * Ht * 3).fill(0.12), zb = new Float32Array(W * vistasR.length * Ht).fill(-Infinity);
  const tri = (pv, cv, ia, ib, ic, ang, col0) => {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const pr = [ia, ib, ic].map((i) => { const x = pv[i * 3], y = pv[i * 3 + 1], z = pv[i * 3 + 2]; return [x * ca - z * sa, y, x * sa + z * ca]; });
    const n = new V3(...pr[1]).sub(new V3(...pr[0])).cross(new V3(...pr[2]).sub(new V3(...pr[0]))).normalize();
    if (n.z <= 0) return;
    const luz = 0.35 + 0.65 * Math.max(0, n.dot(new V3(0.35, 0.55, 0.75).normalize()));
    const c = [0, 1, 2].map((k) => ((cv(ia)[k] + cv(ib)[k] + cv(ic)[k]) / 3) * luz);
    const s = pr.map(([x, y, z]) => [col0 + W / 2 + x * esc, Ht - 12 - y * esc, z]);
    const [mx, Mx, my, My] = [Math.min(...s.map((q) => q[0])), Math.max(...s.map((q) => q[0])), Math.min(...s.map((q) => q[1])), Math.max(...s.map((q) => q[1]))];
    const d = (s[1][0] - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (s[1][1] - s[0][1]);
    if (Math.abs(d) < 1e-9) return;
    for (let y = Math.max(0, Math.floor(my)); y <= Math.min(Ht - 1, Math.ceil(My)); y++) for (let x = Math.max(col0, Math.floor(mx)); x <= Math.min(col0 + W - 1, Math.ceil(Mx)); x++) {
      const px = x + 0.5, py = y + 0.5;
      const b1 = ((px - s[0][0]) * (s[2][1] - s[0][1]) - (s[2][0] - s[0][0]) * (py - s[0][1])) / d;
      const b2 = ((s[1][0] - s[0][0]) * (py - s[0][1]) - (px - s[0][0]) * (s[1][1] - s[0][1])) / d;
      if (b1 < 0 || b2 < 0 || b1 + b2 > 1) continue;
      const z = s[0][2] + b1 * (s[1][2] - s[0][2]) + b2 * (s[2][2] - s[0][2]), o = y * W * vistasR.length + x;
      if (z <= zb[o]) continue;
      zb[o] = z; out.set(c, o * 3);
    }
  };
  vistasR.forEach((ang, j) => {
    for (let t = 0; t < id.length; t += 3) tri(posA, (i) => [corA[i * 3], corA[i * 3 + 1], corA[i * 3 + 2]], id[t], id[t + 1], id[t + 2], ang, j * W);
    if (cp) for (let t = 0; t < cp.idx.length; t += 3) tri(cp.pos, (i) => cp.cor[i], cp.idx[t], cp.idx[t + 1], cp.idx[t + 2], ang, j * W);
  });
  const rgb = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) { const v = out[i]; rgb[i] = Math.round(255 * Math.min(1, v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)); }
  gravarPng(path.join(CONFERIR, `resultado-${R.nome}.png`), W * vistasR.length, Ht, rgb);
  console.log('conferir:', CONFERIR);
}
