// O que as ferramentas das ARMADURAS DE ARQUIVO dividem (26/11/2026): o corpo de arquivo lido do disco, a PELE dele para achar o
// ponto mais perto (com o lado de fora), os PESOS de uma malha pela pele mais perto e GRAVAR a armadura (o arquivo e a lista).
//   vestir.mjs      — uma malha pronta (a Meshy) vestida sozinha num corpo (encaixe por medidas, braços baixados)
//   da-colagem.mjs  — uma COLAGEM que o dono pôs no corpo na aba Armaduras do editor (a posição é a dele)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const LUGARES = ['cabeca', 'peito', 'bracos', 'pernas'];   // (a ordem do código da armadura: js/ficha.js)
export const ID_VALIDO = /^[a-z0-9-]{1,40}$/;
export const de64 = (s, T) => { const u = Buffer.from(s, 'base64'); return new T(u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength)); };
export const para64 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64');
/** o nome dado pelo dono → o id do arquivo (letras sem acento, números e hífen) */
export const idDoNome = (nome) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

/** O corpo de arquivo (assets/corpos/<nome>.json), com as juntas corrigidas na aba Esqueleto do editor por cima, como no jogo. */
export function lerCorpo(nome) {
  const j = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/corpos', `${nome}.json`), 'utf8'));
  const corpo = { nome, P: de64(j.pos, Float32Array), I: j.idx32 ? de64(j.idx32, Uint32Array) : de64(j.idx, Uint16Array), nomes: j.nomes, ossoDe: de64(j.ossoDe, Uint8Array), peso: de64(j.peso, Uint8Array), ossos: { ...j.ossos } };
  try {
    const e = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/esqueletos.json'), 'utf8'));
    Object.assign(corpo.ossos, Object.fromEntries(Object.entries(e?.[nome] ?? e?.corpos?.[nome] ?? {}).filter(([n, v]) => n in corpo.ossos && Array.isArray(v))));
  } catch { /* sem correções */ }
  return corpo;
}

// ------------------------------------------------------------------ a geometria
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const pt = (P, v) => [P[v * 3], P[v * 3 + 1], P[v * 3 + 2]];
export const media = (l) => l.reduce((s, x) => s + x, 0) / l.length;
// o ponto do triângulo mais perto de p (Ericson, Real-Time Collision Detection 5.1.5), com o baricentro
function pertoNoTri(p, { a, b, c }) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return [a, [1, 0, 0]];
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return [b, [0, 1, 0]];
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return [[a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v], [1 - v, v, 0]]; }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return [c, [0, 0, 1]];
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return [[a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w], [1 - w, 0, w]]; }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / ((d4 - d3) + (d5 - d6)); return [[b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w], [0, 1 - w, w]]; }
  const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
  return [[a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w], [1 - v - w, v, w]];
}

/**
 * A PELE de um corpo (os pontos P, que podem ser os da pose — os braços baixados —, e os triângulos I): `perto(p)` = a pele mais perto
 * { q, t (o triângulo), bar (o baricentro), d (com sinal: − = dentro), fora (a direção para fora) }. A normal de fora é a do jogo
 * (corpo-arquivo.js: (c − b) × (a − b)).
 */
export function pele(P, I) {
  const TRI = [];
  for (let t = 0; t < I.length / 3; t++) {
    const a = pt(P, I[t * 3]), b = pt(P, I[t * 3 + 1]), c = pt(P, I[t * 3 + 2]);
    TRI.push({ a, b, c, n: norm(cross(sub(c, b), sub(a, b))), mn: [0, 1, 2].map((k) => Math.min(a[k], b[k], c[k])), mx: [0, 1, 2].map((k) => Math.max(a[k], b[k], c[k])) });
  }
  return {
    perto(p) {
      let mel = null, md = Infinity;
      for (let t = 0; t < TRI.length; t++) {
        const T = TRI[t];
        // (a caixa do triângulo já mais longe que o melhor: pula)
        const dx = Math.max(T.mn[0] - p[0], 0, p[0] - T.mx[0]), dy = Math.max(T.mn[1] - p[1], 0, p[1] - T.mx[1]), dz = Math.max(T.mn[2] - p[2], 0, p[2] - T.mx[2]);
        if (dx * dx + dy * dy + dz * dz >= md) continue;
        const [q, bar] = pertoNoTri(p, T), d2 = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (d2 < md) { md = d2; mel = { q, t, bar }; }
      }
      const v = sub(p, mel.q), d = Math.sqrt(md), lado = dot(v, TRI[mel.t].n) >= 0 ? 1 : -1;
      return { ...mel, d: d * lado, fora: d > 1e-4 ? (lado > 0 ? norm(v) : norm([-v[0], -v[1], -v[2]])) : TRI[mel.t].n };
    },
  };
}

/** Os pontos SOLDADOS pela posição (a malha da Meshy e a colagem repetem o ponto em cada triângulo) e os vizinhos de cada um. */
export function soldar(P, I, casas = 3) {
  const n = P.length / 3, mapa = new Map(), id = new Int32Array(n);
  for (let v = 0; v < n; v++) { const k = `${P[v * 3].toFixed(casas)},${P[v * 3 + 1].toFixed(casas)},${P[v * 3 + 2].toFixed(casas)}`; if (!mapa.has(k)) mapa.set(k, v); id[v] = mapa.get(k); }
  const vizinhos = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < I.length; t += 3) for (let q = 0; q < 3; q++) { const a = id[I[t + q]], b = id[I[t + (q + 1) % 3]]; vizinhos[a].add(b); vizinhos[b].add(a); }
  return { id, vizinhos };
}

/**
 * Os PESOS de uma malha (os pontos X) pela pele mais perto (`pele`, feita dos pontos do corpo na mesma pose que X): os dos três cantos
 * do triângulo, pelo baricentro, SEM pescoço e cabeça (viram a coluna de cima: as edições da aba Modelo mexem no pescoço e a gola
 * iria junto), alisados pelos vizinhos (`soldar`); `rigidos` (ponto → o ponto de onde copia: as fivelas) copiam. Devolve { nomes,
 * ossoDe, peso } como o corpo: 4 por ponto, o osso é o lugar em `nomes`, os pesos somam 255.
 */
export function pesosPelaPele(X, { id, vizinhos }, corpo, aPele, rigidos = new Map()) {
  const n = X.length / 3, nomes = corpo.nomes.slice(), sem = new Set(['Neck', 'Head']);
  const troca = nomes.indexOf('Spine') >= 0 ? nomes.indexOf('Spine') : nomes.indexOf('Spine001');
  const unicos = [...new Set(id)];
  let W = Array.from({ length: n }, () => new Float32Array(nomes.length));
  for (const v of unicos) {
    const p = aPele.perto(pt(X, v)), cantos = [0, 1, 2].map((k) => corpo.I[p.t * 3 + k]);
    cantos.forEach((c, k) => {
      for (let j = 0; j < 4; j++) {
        let o = corpo.ossoDe[c * 4 + j];
        const w = corpo.peso[c * 4 + j] / 255 * p.bar[k];
        if (!w) continue;
        if (sem.has(nomes[o]) && troca >= 0) o = troca;
        W[v][o] += w;
      }
    });
  }
  for (let it = 0; it < 3; it++) {
    const novo = W.map((w) => w.slice());
    for (const v of unicos) { const vz = [...vizinhos[v]]; if (!vz.length) continue; for (let o = 0; o < nomes.length; o++) novo[v][o] = 0.5 * W[v][o] + 0.5 * media(vz.map((w) => W[w][o])); }
    W = novo;
  }
  for (const [v, de] of rigidos) W[v] = W[de].slice();
  const ossoDe = new Uint8Array(n * 4), peso = new Uint8Array(n * 4);
  for (let v = 0; v < n; v++) {
    const w = W[id[v]], top = [...w.keys()].sort((a, b) => w[b] - w[a]).slice(0, 4).filter((o) => w[o] > 0.01), soma = top.reduce((s, o) => s + w[o], 0) || 1;
    let resto = 255;
    top.forEach((o, j) => { const q = j === top.length - 1 ? resto : Math.round(w[o] / soma * 255); ossoDe[v * 4 + j] = o; peso[v * 4 + j] = q; resto -= q; });
    if (!top.length) { ossoDe[v * 4] = troca; peso[v * 4] = 255; }
  }
  return { nomes, ossoDe, peso };
}

/**
 * GRAVA uma armadura: assets/armaduras-de-arquivo/<id>.json e o id no FIM da lista (assets/armaduras-de-arquivo/lista.json, que o
 * jogo lê — js/assets.js `carregarArmadurasDeArquivo`). Outra armadura da lista no MESMO corpo, lugar e conjunto sai da lista (o
 * arquivo dela fica): é esta que veste o item agora. Devolve { arquivo, substituidas }.
 */
export function gravarArmadura({ id, rotulo, corpo, lugar, conjunto, de, nomes, pos, idx, cor, ossoDe, peso, esconde = null }) {
  if (!ID_VALIDO.test(id)) throw new Error(`id torto: ${id}`);
  if (!LUGARES.includes(lugar) || !Number.isInteger(conjunto) || conjunto < 1 || conjunto > 9) throw new Error('lugar ou conjunto torto');
  const pasta = path.join(RAIZ, 'assets/armaduras-de-arquivo'), cam = path.join(pasta, `${id}.json`);
  fs.mkdirSync(pasta, { recursive: true });
  fs.writeFileSync(cam, JSON.stringify({
    _leiame: `Armadura de arquivo "${id}" (${de} — não edite à mão): a malha vestida no corpo "${corpo}" (cm, pose T, o espaço da malha dele). pos (Float32), idx32 (Uint32), cor (Uint8 rgb por triângulo), ossoDe/peso (Uint8, 4 por ponto; o osso é o lugar em nomes; os pesos somam 255). Veste o item arm${conjunto}_${lugar} nesse corpo.`,
    id, rotulo, corpo, lugar, conjunto, nomes, vertices: pos.length / 3, triangulos: idx.length / 3,
    pos: para64(pos), idx32: para64(idx), cor: para64(cor), ossoDe: para64(ossoDe), peso: para64(peso),
    // (os triângulos da PELE do corpo que somem com ela vestida — o lugar deles no arquivo do corpo, Uint32)
    ...(esconde?.length ? { esconde: esconde.length, esconde32: para64(Uint32Array.from(esconde)) } : {}),
  }) + '\n');
  const camLista = path.join(pasta, 'lista.json');
  let lista = [];
  try { lista = JSON.parse(fs.readFileSync(camLista, 'utf8')).armaduras ?? []; } catch { /* lista nova */ }
  const substituidas = lista.filter((x) => {
    if (x === id) return false;
    try { const o = JSON.parse(fs.readFileSync(path.join(pasta, `${x}.json`), 'utf8')); return o.corpo === corpo && o.lugar === lugar && o.conjunto === conjunto; } catch { return false; }
  });
  lista = [...lista.filter((x) => x !== id && !substituidas.includes(x)), id];
  fs.writeFileSync(camLista, `${JSON.stringify({ _leiame: 'As ARMADURAS DE ARQUIVO que o jogo carrega (js/assets.js `carregarArmadurasDeArquivo`): o id = assets/armaduras-de-arquivo/<id>.json. Gravada pelas ferramentas de ferramentas/armadura-de-arquivo/ (vestir.mjs, da-colagem.mjs — o "virar armadura" do editor).', armaduras: lista }, null, 2)}\n`);
  return { arquivo: path.relative(RAIZ, cam), substituidas };
}
