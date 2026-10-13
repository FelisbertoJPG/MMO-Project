/**
 * A MODELAGEM (12/10/2026) — mexer na MALHA do corpo, parte por parte. Quem edita é a aba
 * "Modelo" do Editor de Personagem (o editor de cenas, `modelagem.html`, que monta o boneco
 * com ESTE código); o jogo aplica o que ela gravou.
 *
 * O que se edita é um CORPO: o humano ou uma raça, masculino ou feminino (`chaveDoCorpo`:
 * 'humano', 'orc', 'orc:feminino'…). As edições moram em `assets/modelagem.json`
 * (`Assets.modelagem.corpos[chave]`):
 *   { partes: { <parte>: { tamanho, largura, altura, fundo, mover: [x, y, z] } },
 *     puxoes: [{ parte, de, em: [x, y, z], raio, mover: [x, y, z] (ou inflar), espelho }] }
 * Corpo sem edição: a malha é a de sempre, bit a bit.
 *
 * AS PARTES (`PARTES`) são de três tipos:
 *  - por OSSO (a cabeça, o peito, os braços…): o peso de cada vértice nos ossos dela — o
 *    mesmo jeito do `deformar` das raças: a parte emenda na vizinha sem abrir fresta, e a
 *    armadura presa àqueles ossos vai junto;
 *  - por ORIGEM (o cabelo, a barba, as sobrancelhas, os olhos, as presas, o busto): o que foi
 *    desenhado à parte (`ORIGENS`, marcado por vértice ao fundir o corpo);
 *  - por LUGAR (as orelhas: a aba da peça `Face`, `ORELHA` do raca.js).
 *
 * QUANDO: na malha FUNDIDA, depois das proporções da raça (guerreiro.js `geometriaFundida`)
 * — o que se vê na aba é o que se ajusta. Só a malha muda: os ossos ficam, e as animações
 * dobram nas mesmas juntas.
 *  1. as PARTES: cada uma cresce (`tamanho` e, por eixo do corpo, `largura` = x, `altura` =
 *     y, `fundo` = z) em volta do PIVÔ dela (a junta do osso; nas de dois lados, a de cada
 *     lado; sem junta, o meio dela) e anda `mover` cm — nas de dois lados o x é "para fora"
 *     nos dois;
 *  2. os PUXÕES, na ordem em que foram feitos: o PINCEL da aba. Cada um tem um CENTRO na
 *     malha e um `raio` (cm); o que está dentro anda `mover` cm (estender a malha para outro
 *     ponto) ou sai `inflar` cm pela normal (+ engorda, − murcha) — inteiro no centro e
 *     sumindo até a beirada —, só na `parte` dele. `espelho`: o mesmo do outro lado (cada
 *     vértice usa o pincel do lado em que está: os dois lados nunca somam).
 *     O CENTRO é guardado como um ponto do MODELO (`em`: antes da raça) e achado de novo a
 *     cada montagem — o triângulo mais perto dele, entre os da mesma origem (`de`) — e o
 *     pincel age onde esse lugar foi parar: mudar as réguas da raça depois não o tira dali.
 */
import * as THREE from 'three';
import { Assets } from './assets.js';
import { temFeminino, ORELHA } from './raca.js';
import { pertoNoTriangulo } from './ima.js';

// o que cada pedaço da malha fundida é (o código de cada vértice em `ctx.origem`)
export const ORIGENS = ['corpo', 'armadura', 'cabelo', 'barba', 'sobrancelhas', 'presas', 'busto', 'olhos'];
/** A origem de uma peça da malha fundida, pelo nome dela (o penteado é marcado à parte). */
export const origemDaPeca = (nome) => (nome === 'presas' ? 'presas' : /^(busto|top)_/.test(nome) ? 'busto' : /^Eyes/.test(nome) ? 'olhos' : /^A[123]_|^casca_/.test(nome) ? 'armadura' : 'corpo');

/**
 * As partes que se editam: { id, nome, e UMA regra — `tudo`, `ossos` (os nomes, no esqueleto
 * do guerreiro), `origem` ou `lugar` }; `pivo`: a junta (ou [a do lado +x, a do −x]) em
 * volta da qual ela cresce; `lados`: é um par (o x de `mover` é "para fora" nos dois).
 */
export const PARTES = [
  { id: 'corpo', nome: 'Corpo inteiro', tudo: true },
  { id: 'cabeca', nome: 'Cabeça', ossos: /^Head$/, pivo: ['Head'] },
  { id: 'cabelo', nome: 'Cabelo', origem: 'cabelo', pivo: ['Head'] },
  { id: 'barba', nome: 'Barba', origem: 'barba', pivo: ['Head'] },
  { id: 'sobrancelhas', nome: 'Sobrancelhas', origem: 'sobrancelhas', lados: true },
  { id: 'olhos', nome: 'Olhos', origem: 'olhos', lados: true },
  { id: 'orelhas', nome: 'Orelhas', lugar: 'orelha', lados: true },
  { id: 'presas', nome: 'Presas', origem: 'presas', lados: true },
  { id: 'pescoco', nome: 'Pescoço', ossos: /^Neck$/, pivo: ['Neck'] },
  { id: 'ombros', nome: 'Ombros', ossos: /^Collar[LR]$/, pivo: ['CollarL', 'CollarR'], lados: true },
  { id: 'peito', nome: 'Peito', ossos: /^Spine(001)?$/, pivo: ['Spine001'] },
  { id: 'busto', nome: 'Busto e top', origem: 'busto', lados: true },
  { id: 'barriga', nome: 'Barriga', ossos: /^Spine00[23]$/, pivo: ['Spine003'] },
  { id: 'quadril', nome: 'Quadril', ossos: /^Hips$/, pivo: ['Hips'] },
  { id: 'bracos', nome: 'Braços', ossos: /^Arm[LR]$/, pivo: ['ArmL', 'ArmR'], lados: true },
  { id: 'antebracos', nome: 'Antebraços', ossos: /^Elbow[LR]$/, pivo: ['ElbowL', 'ElbowR'], lados: true },
  { id: 'maos', nome: 'Mãos', ossos: /^(Hand|Thumb|Index|Middle|Ring|Pinky)/, pivo: ['HandL', 'HandR'], lados: true },
  { id: 'coxas', nome: 'Coxas', ossos: /^Thigh[lr]$/, pivo: ['Thighl', 'Thighr'], lados: true },
  { id: 'canelas', nome: 'Canelas', ossos: /^Shin[lr]$/, pivo: ['Shinl', 'Shinr'], lados: true },
  { id: 'pes', nome: 'Pés', ossos: /^(Foot[lr]|Toe[LR])$/, pivo: ['Footl', 'Footr'], lados: true },
];
const PARTE = new Map(PARTES.map((p) => [p.id, p]));

/** A chave do corpo da raça `raca` (o dígito da aparência; 0 = humano) no `sexo` dela. */
export function chaveDoCorpo(raca, sexo) {
  const id = (raca > 0 && Assets.racas?.[raca - 1]?.id) || 'humano';   // (raça que não existe mais = o humano, como em racaDe)
  return sexo === 1 && temFeminino(id === 'humano' ? 0 : raca) ? `${id}:feminino` : id;
}
/** As edições do corpo (ou null: não há — a malha fica como é). */
export function edicoesDoCorpo(raca, sexo) {
  const e = Assets.modelagem?.corpos?.[chaveDoCorpo(raca, sexo)];
  return e && (Object.keys(e.partes ?? {}).length || e.puxoes?.length) ? e : null;
}

// A aba Modelo liga isto: as malhas fundidas passam a guardar o que ela precisa (`userData.modelagem`)
let aberta = false;
export function abrirModelagem(sim = true) { aberta = sim; }
export const modelagemAberta = () => aberta;

/**
 * Quanto cada vértice da malha é da parte `id` (0 a 1): um Float32Array. `ctx`: o que a
 * malha fundida guardou (`origem`, `antes`, `ordem`).
 */
export function pesosDaParte(id, geo, ctx) {
  const p = PARTE.get(id), n = geo.attributes.position.count, w = new Float32Array(n);
  if (!p) return w;
  if (p.tudo) return w.fill(1);
  if (p.origem) {
    const o = ORIGENS.indexOf(p.origem);
    for (let i = 0; i < n; i++) if (ctx.origem[i] === o) w[i] = 1;
    return w;
  }
  if (p.lugar === 'orelha') {
    // a aba da orelha no MODELO (antes da raça), com a beirada suave: a raiz dela estica
    const a = ctx.antes, c = ORELHA.caixa, s = THREE.MathUtils.smoothstep;
    for (let i = 0; i < n; i++) {
      if (ctx.origem[i] !== 0) continue;
      const x = Math.abs(a[i * 3]), y = a[i * 3 + 1], z = a[i * 3 + 2];
      w[i] = s(x, c.x - 0.05, c.x + 0.2) * s(y, c.y[0] - 0.6, c.y[0]) * (1 - s(y, c.y[1], c.y[1] + 0.6)) * s(z, c.z[0] - 0.6, c.z[0]) * (1 - s(z, c.z[1], c.z[1] + 0.6));
    }
    return w;
  }
  const marca = ctx.ordem.map((nome) => p.ossos.test(nome)), si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < 4; k++) if (marca[si.getComponent(i, k)]) s += sw.getComponent(i, k);
    w[i] = Math.min(1, s);
  }
  return w;
}

// os pivôs de uma parte: [o do lado +x, o do −x] (sem lados, os dois iguais)
function pivosDaParte(p, w, P, ctx) {
  if (p.tudo) return [new THREE.Vector3(), new THREE.Vector3()];
  const a = p.pivo && ctx.juntas?.get(p.pivo[0]), b = p.pivo && ctx.juntas?.get(p.pivo[1] ?? p.pivo[0]);
  if (a && b) return [a, b];
  // sem junta: o meio do que é da parte (de cada lado)
  const soma = [new THREE.Vector3(), new THREE.Vector3()], peso = [0, 0];
  for (let i = 0; i < w.length; i++) {
    if (w[i] < 0.5) continue;
    const k = p.lados && P[i * 3] < 0 ? 1 : 0;
    soma[k].x += P[i * 3] * w[i]; soma[k].y += P[i * 3 + 1] * w[i]; soma[k].z += P[i * 3 + 2] * w[i]; peso[k] += w[i];
  }
  const meio = soma.map((s, k) => (peso[k] ? s.multiplyScalar(1 / peso[k]) : null));
  if (!p.lados) return [meio[0] ?? new THREE.Vector3(), meio[0] ?? new THREE.Vector3()];
  return [meio[0] ?? meio[1]?.clone().setX(-meio[1].x) ?? new THREE.Vector3(), meio[1] ?? meio[0]?.clone().setX(-meio[0].x) ?? new THREE.Vector3()];
}

// os 3 vértices do triângulo t (a malha fundida quase sempre é sem índice)
const verticeDe = (idx, t, k) => (idx ? idx.getX(t * 3 + k) : t * 3 + k);

/**
 * Onde está, AGORA, o centro de um puxão — o lugar da malha que o `em` dele marca (o
 * triângulo mais perto do ponto, no MODELO, entre os vértices da origem `de` e da parte):
 * um Vector3 nas posições `P` como estão — ou null (não há malha dessa origem).
 */
export function centroDoPuxao(x, geo, ctx, espelho = false, P = geo.attributes.position.array, w = null) {
  const idx = geo.index, nt = (idx ? idx.count : geo.attributes.position.count) / 3, A = ctx.antes, o = ORIGENS.indexOf(x.de);
  const q = new THREE.Vector3(espelho ? -x.em[0] : x.em[0], x.em[1], x.em[2]);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), bar = new THREE.Vector3(), perto = new THREE.Vector3();
  let melhor = Infinity, achado = null;
  for (let t = 0; t < nt; t++) {
    const i = verticeDe(idx, t, 0), j = verticeDe(idx, t, 1), k = verticeDe(idx, t, 2);
    if (o >= 0 && ctx.origem[i] !== o) continue;
    if (w && !(w[i] + w[j] + w[k] > 0)) continue;
    a.fromArray(A, i * 3); b.fromArray(A, j * 3); c.fromArray(A, k * 3);
    // (de longe, nem a conta do triângulo)
    if (a.distanceToSquared(q) > melhor + 900 && b.distanceToSquared(q) > melhor + 900 && c.distanceToSquared(q) > melhor + 900) continue;
    pertoNoTriangulo(q, a, b, c, bar);
    perto.set(0, 0, 0).addScaledVector(a, bar.x).addScaledVector(b, bar.y).addScaledVector(c, bar.z);
    const d = perto.distanceToSquared(q);
    if (d < melhor) { melhor = d; achado = [i, j, k, bar.x, bar.y, bar.z]; }
  }
  if (!achado) return null;
  const [i, j, k, u, v, s] = achado;
  return new THREE.Vector3(P[i * 3] * u + P[j * 3] * v + P[k * 3] * s, P[i * 3 + 1] * u + P[j * 3 + 1] * v + P[k * 3 + 1] * s, P[i * 3 + 2] * u + P[j * 3 + 2] * v + P[k * 3 + 2] * s);
}

// a normal MÉDIA de cada lugar perto dos centros (as quinas repetidas andam juntas: nada abre)
function normaisPerto(P, idx, nt, centros, raio) {
  const media = new Map(), r2 = (raio + 0.5) ** 2, chave = (i) => `${Math.round(P[i * 3] * 200)},${Math.round(P[i * 3 + 1] * 200)},${Math.round(P[i * 3 + 2] * 200)}`;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < nt; t++) {
    const i = verticeDe(idx, t, 0), j = verticeDe(idx, t, 1), k = verticeDe(idx, t, 2);
    a.fromArray(P, i * 3); b.fromArray(P, j * 3); c.fromArray(P, k * 3);
    if (!centros.some((C) => a.distanceToSquared(C) < r2 || b.distanceToSquared(C) < r2 || c.distanceToSquared(C) < r2)) continue;
    n.subVectors(b, a).cross(c.sub(a));   // (do tamanho da área: o triângulo grande pesa mais)
    for (const v of [i, j, k]) { const ch = chave(v); (media.get(ch) ?? media.set(ch, new THREE.Vector3()).get(ch)).add(n); }
  }
  return (i) => media.get(chave(i))?.clone().normalize() ?? null;
}

/**
 * Aplica as edições de um corpo à malha (muda a geometria NO LUGAR) e devolve se mexeu.
 * `ctx`: o que a malha fundida guardou — `ordem` (os ossos), `juntas` (nome → Vector3, no
 * espaço da malha), `antes` (as posições do MODELO) e `origem` (o código de cada vértice).
 */
export function aplicarModelagem(geo, edicoes, ctx) {
  if (!edicoes) return false;
  const pos = geo.attributes.position, P = pos.array, n = pos.count, idx = geo.index, nt = (idx ? idx.count : n) / 3;
  const mexeu = new Uint8Array(n);
  const pesos = new Map(), pesosDe = (id) => pesos.get(id) ?? pesos.set(id, pesosDaParte(id, geo, ctx)).get(id);
  // ---- 1. as PARTES: crescer em volta do pivô e andar
  for (const [id, t] of Object.entries(edicoes.partes ?? {})) {
    const p = PARTE.get(id);
    if (!p || !t) continue;
    const k = t.tamanho ?? 1, s = [k * (t.largura ?? 1), k * (t.altura ?? 1), k * (t.fundo ?? 1)], m = t.mover ?? [0, 0, 0];
    if (s.every((v) => Math.abs(v - 1) < 1e-5) && m.every((v) => Math.abs(v) < 1e-5)) continue;
    const w = pesosDe(id), piv = pivosDaParte(p, w, P, ctx);
    for (let i = 0; i < n; i++) {
      const f = w[i];
      if (!(f > 0)) continue;
      const lado = p.lados && P[i * 3] < 0 ? 1 : 0, o = piv[lado], sx = lado ? -1 : 1;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      P[i * 3] = x + (o.x + (x - o.x) * s[0] + m[0] * sx - x) * f;
      P[i * 3 + 1] = y + (o.y + (y - o.y) * s[1] + m[1] - y) * f;
      P[i * 3 + 2] = z + (o.z + (z - o.z) * s[2] + m[2] - z) * f;
      mexeu[i] = 1;
    }
  }
  // ---- 2. os PUXÕES, na ordem
  for (const x of edicoes.puxoes ?? []) {
    if (!x?.em || !(x.raio > 0)) continue;
    const w = pesosDe(PARTE.has(x.parte) ? x.parte : 'corpo');
    const c = centroDoPuxao(x, geo, ctx, false, P, w);
    if (!c) continue;
    // o espelho: o mesmo pincel do outro lado (cada vértice usa o do lado em que está)
    const ce = x.espelho ? centroDoPuxao(x, geo, ctx, true, P, w) : null;
    const r2 = x.raio * x.raio, inflar = Number.isFinite(x.inflar) ? x.inflar : null;
    const d = inflar === null ? new THREE.Vector3(...(x.mover ?? [0, 0, 0])) : null, de = d && d.clone().setX(-d.x);
    const normal = inflar !== null ? normaisPerto(P, idx, nt, ce ? [c, ce] : [c], x.raio) : null;
    for (let i = 0; i < n; i++) {
      if (!(w[i] > 0)) continue;
      const outro = ce && P[i * 3] * c.x < 0, C = outro ? ce : c;
      const dx = P[i * 3] - C.x, dy = P[i * 3 + 1] - C.y, dz = P[i * 3 + 2] - C.z, q = (dx * dx + dy * dy + dz * dz) / r2;
      if (q >= 1) continue;
      const f = (1 - q) ** 2 * w[i];
      let v = outro ? de : d;
      if (normal) { v = normal(i); if (!v) continue; v.multiplyScalar(inflar); }
      P[i * 3] += v.x * f; P[i * 3 + 1] += v.y * f; P[i * 3 + 2] += v.z * f;
      mexeu[i] = 1;
    }
  }
  if (!mexeu.includes(1)) return false;
  pos.needsUpdate = true;
  normaisDasFacesMexidas(geo, mexeu);
  geo.boundingBox = null; geo.boundingSphere = null;
  return true;
}

// a normal reta das faces que mudaram (o facetado do modelo); com índice, a lisa de todas
function normaisDasFacesMexidas(geo, mexeu) {
  const nor = geo.attributes.normal;
  if (!nor) return;
  if (geo.index) { geo.computeVertexNormals(); return; }
  const P = geo.attributes.position.array, a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < mexeu.length; t += 3) {
    if (!mexeu[t] && !mexeu[t + 1] && !mexeu[t + 2]) continue;
    a.fromArray(P, t * 3); b.fromArray(P, t * 3 + 3).sub(a); c.fromArray(P, t * 3 + 6).sub(a);
    b.cross(c).normalize();
    for (let k = 0; k < 3; k++) nor.setXYZ(t + k, b.x, b.y, b.z);
  }
  nor.needsUpdate = true;
}
