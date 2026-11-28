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
// (`vale`: só os triângulos t com vale(t) — os pesos da peça do peito, sem o antebraço, a mão e as pernas)
export function pele(P, I, vale = null) {
  const TRI = [];
  for (let t = 0; t < I.length / 3; t++) {
    const a = pt(P, I[t * 3]), b = pt(P, I[t * 3 + 1]), c = pt(P, I[t * 3 + 2]);
    if (vale && !vale(t)) { TRI.push({ fora: true }); continue; }
    TRI.push({ a, b, c, n: norm(cross(sub(c, b), sub(a, b))), mn: [0, 1, 2].map((k) => Math.min(a[k], b[k], c[k])), mx: [0, 1, 2].map((k) => Math.max(a[k], b[k], c[k])) });
  }
  return {
    // (`n`: só a pele virada para o mesmo lado — o produto com a normal dela acima de 0,2; sem nenhuma assim, a mais perto de todas)
    perto(p, n = null) {
      let mel = null, md = Infinity;
      for (let t = 0; t < TRI.length; t++) {
        const T = TRI[t];
        if (T.fora || (n && dot(T.n, n) < 0.2)) continue;
        // (a caixa do triângulo já mais longe que o melhor: pula)
        const dx = Math.max(T.mn[0] - p[0], 0, p[0] - T.mx[0]), dy = Math.max(T.mn[1] - p[1], 0, p[1] - T.mx[1]), dz = Math.max(T.mn[2] - p[2], 0, p[2] - T.mx[2]);
        if (dx * dx + dy * dy + dz * dz >= md) continue;
        const [q, bar] = pertoNoTri(p, T), d2 = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
        if (d2 < md) { md = d2; mel = { q, t, bar }; }
      }
      if (!mel) return this.perto(p);
      const v = sub(p, mel.q), d = Math.sqrt(md), lado = dot(v, TRI[mel.t].n) >= 0 ? 1 : -1;
      return { ...mel, d: d * lado, fora: d > 1e-4 ? (lado > 0 ? norm(v) : norm([-v[0], -v[1], -v[2]])) : TRI[mel.t].n };
    },
  };
}

/** O RAIO (Möller–Trumbore): a distância da 1ª batida a partir de `o` na direção `dir` (unitária) numa malha; Infinity se não bate. */
export function raio(o, dir, P, I) {
  let melhor = Infinity;
  for (let t = 0; t < I.length / 3; t++) {
    const a = pt(P, I[t * 3]), b = pt(P, I[t * 3 + 1]), c = pt(P, I[t * 3 + 2]), e1 = sub(b, a), e2 = sub(c, a), h = cross(dir, e2), det = dot(e1, h);
    if (Math.abs(det) < 1e-9) continue;
    const f = 1 / det, s = sub(o, a), u = f * dot(s, h); if (u < 0 || u > 1) continue;
    const q = cross(s, e1), v = f * dot(dir, q); if (v < 0 || u + v > 1) continue;
    const k = f * dot(e2, q); if (k > 1e-6 && k < melhor) melhor = k;
  }
  return melhor;
}

/**
 * A PELE QUE A PEÇA COBRE (27/11/2026; o dono: "apagar a malha correspondente ao torso no corpo do personagem: ombro, peito e um pedaço
 * de manga curta"): os triângulos do corpo que ela tapa — o lugar deles no arquivo do corpo, o `esconde` da armadura (guerreiro.js
 * `esconderPele`). Um ponto da pele está coberto quando o raio que sai dele para fora (a normal do jogo) bate na peça a até `alcance` cm
 * em TODAS as `poses` ([os pontos do corpo, os da peça], na mesma pose): com os braços baixados, o raio de dentro do braço batia no colete;
 * na pose T, a "asa" da manga tapava o sovaco; nas duas juntas, só fica o que a peça cobre de verdade. Pescoço e cabeça nunca (a gola).
 * Perto da borda (a menos de `margem` cm de um ponto descoberto, andando pela malha na pose T) fica à mostra, e o triângulo só some com
 * os três cantos cobertos: a pele vai até debaixo da barra e da manga, sem buraco na beirada.
 */
// (`dentro` cm — 28/11/2026, a peça APERTADA: a pele que fura a peça por pouco — o raio para DENTRO bate nela até `dentro` cm — também está
// coberta: o peito saltado do corpo aparecia em manchas pela peça justa)
export function peleCoberta(corpo, poses, XI, { alcance = 8, margem = 1, dentro = 0 } = {}) {
  const { id, vizinhos } = soldar(corpo.P, corpo.I), n = corpo.P.length / 3, unicos = [...new Set(id)], I = corpo.I;
  const cabeca = new Set(['Neck', 'Head'].map((x) => corpo.nomes.indexOf(x)).filter((i) => i >= 0));
  const naCabeca = (v) => { let w = 0; for (let j = 0; j < 4; j++) if (cabeca.has(corpo.ossoDe[v * 4 + j])) w += corpo.peso[v * 4 + j]; return w > 127; };
  const coberto = new Uint8Array(n);
  for (const v of unicos) coberto[v] = naCabeca(v) ? 0 : 1;
  for (const [P, X] of poses) {
    // a normal de cada ponto soldado: a soma das dos triângulos em volta (pela área), a de fora do jogo — (c − b) × (a − b)
    const N = new Float32Array(n * 3);
    for (let t = 0; t < I.length; t += 3) {
      const a = pt(P, I[t]), b = pt(P, I[t + 1]), c = pt(P, I[t + 2]), f = cross(sub(c, b), sub(a, b));
      for (let q = 0; q < 3; q++) { const u = id[I[t + q]]; N[u * 3] += f[0]; N[u * 3 + 1] += f[1]; N[u * 3 + 2] += f[2]; }
    }
    // (a caixa da peça, folgada pelo alcance: o ponto fora dela nem atira)
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let v = 0; v < X.length / 3; v++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], X[v * 3 + k] - alcance); mx[k] = Math.max(mx[k], X[v * 3 + k] + alcance); }
    for (const v of unicos) {
      if (!coberto[v]) continue;
      const p = pt(P, v), dir = norm(pt(N, v));
      if (p.some((x, k) => x < mn[k] || x > mx[k])) { coberto[v] = 0; continue; }
      coberto[v] = raio([p[0] + dir[0] * 0.05, p[1] + dir[1] * 0.05, p[2] + dir[2] * 0.05], dir, X, XI) <= alcance
        || (dentro > 0 && raio([p[0] - dir[0] * 0.05, p[1] - dir[1] * 0.05, p[2] - dir[2] * 0.05], [-dir[0], -dir[1], -dir[2]], X, XI) <= dentro) ? 1 : 0;
    }
  }
  // a margem: a distância (pela malha, na pose T) até o ponto descoberto mais perto
  const dist = new Float32Array(n).fill(Infinity), fila = [];
  for (const v of unicos) if (!coberto[v]) { dist[v] = 0; fila.push(v); }
  while (fila.length) {
    const v = fila.shift();
    for (const w of vizinhos[v]) {
      const d = dist[v] + Math.hypot(...sub(pt(corpo.P, v), pt(corpo.P, w)));
      if (d < margem && d < dist[w]) { dist[w] = d; fila.push(w); }
    }
  }
  const some = (v) => coberto[id[v]] && dist[id[v]] >= margem;
  const esconde = [];
  for (let t = 0; t < I.length / 3; t++) if (some(I[t * 3]) && some(I[t * 3 + 1]) && some(I[t * 3 + 2])) esconde.push(t);
  return esconde;
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
// (`normais`: a normal de cada ponto de X — cada um pega a pele virada para o mesmo lado: no sovaco, a manga segue o braço e a lateral o
// tronco; sem isso, o ponto perto dos dois seguia os dois e esticava em "asa" ao subir o braço)
export function pesosPelaPele(X, { id, vizinhos }, corpo, aPele, rigidos = new Map(), normais = null) {
  const n = X.length / 3, nomes = corpo.nomes.slice(), sem = new Set(['Neck', 'Head']);
  const troca = nomes.indexOf('Spine') >= 0 ? nomes.indexOf('Spine') : nomes.indexOf('Spine001');
  const unicos = [...new Set(id)];
  let W = Array.from({ length: n }, () => new Float32Array(nomes.length));
  for (const v of unicos) {
    const p = aPele.perto(pt(X, v), normais ? pt(normais, v) : null), cantos = [0, 1, 2].map((k) => corpo.I[p.t * 3 + k]);
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
 * arquivo dela fica): é esta que veste o item agora. Devolve { arquivo, substituidas }. Com `previa` (um caminho), grava o mesmo
 * arquivo LÁ e não mexe no jogo nem na lista (a prévia do tamanho no editor).
 */
export function gravarArmadura({ id, rotulo, corpo, lugar, conjunto, de, nomes, pos, idx, cor, ossoDe, peso, esconde = null, escondeCriados = null, previa = null }) {
  if (!ID_VALIDO.test(id)) throw new Error(`id torto: ${id}`);
  if (!LUGARES.includes(lugar) || !Number.isInteger(conjunto) || conjunto < 1 || conjunto > 9) throw new Error('lugar ou conjunto torto');
  const pasta = path.join(RAIZ, 'assets/armaduras-de-arquivo'), cam = previa ? path.resolve(previa) : path.join(pasta, `${id}.json`);
  fs.mkdirSync(path.dirname(cam), { recursive: true });
  fs.writeFileSync(cam, JSON.stringify({
    _leiame: `Armadura de arquivo "${id}" (${de} — não edite à mão): a malha vestida no corpo "${corpo}" (cm, pose T, o espaço da malha dele). pos (Float32), idx32 (Uint32), cor (Uint8 rgb por triângulo), ossoDe/peso (Uint8, 4 por ponto; o osso é o lugar em nomes; os pesos somam 255). Veste o item arm${conjunto}_${lugar} nesse corpo.`,
    id, rotulo, corpo, lugar, conjunto, nomes, vertices: pos.length / 3, triangulos: idx.length / 3,
    pos: para64(pos), idx32: para64(idx), cor: para64(cor), ossoDe: para64(ossoDe), peso: para64(peso),
    // (os triângulos da PELE do corpo que somem com ela vestida — o lugar deles no arquivo do corpo, Uint32)
    ...(esconde?.length ? { esconde: esconde.length, esconde32: para64(Uint32Array.from(esconde)) } : {}),
    // (… e os triângulos CRIADOS na aba Modelo que somem também: o meio de cada um no modelo, cm — guerreiro.js `criadosQueSomem`)
    ...(escondeCriados?.length ? { escondeCriados } : {}),
  }) + '\n');
  if (previa) return { arquivo: cam, substituidas: [] };
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
