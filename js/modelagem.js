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
 * `olhos`: { afasta, sobe, fundo (cm), tamanho, giro (graus) } — os olhos REPOSICIONADOS no rosto
 * (`moverOlhos`): cada olho vai com a pele em volta dele (o buraco do olho não fica para trás) e acompanha
 * o relevo do rosto onde chega (a altura da pele em volta, lá e cá), como o pé das presas.
 * Corpo sem edição: a malha é a de sempre, bit a bit. (E `pinturas`: as folhas pintadas no corpo —
 * pintura.js.)
 * `cortes`: [{ de, em: [x, y, z] }] — os TRIÂNGULOS REMOVIDOS (18/10/2026; a ferramenta "cortar" da
 * aba): cada um é achado pelo MEIO dele no MODELO (`em`, a média dos três cantos em `antes`) e pela
 * origem (`de`), e some (`cortarTriangulos`) — os três cantos vão para o mesmo ponto, com os
 * mesmos pesos (a contagem de vértices não muda: o que guarda índices dela segue valendo).
 * `vertices`: [{ de, em }] — os VÉRTICES CRIADOS (18/10/2026; a ferramenta "vértice" da aba): cada um
 * ENTRA na malha (`dividirNosVertices`) — o triângulo em que cai vira 3, ou, numa aresta, os dois
 * dela viram 2 cada (cortados e trocados por pedaços de um lado só) — e os cantos dos criados colam
 * nele: o triângulo novo divide a aresta com o corpo, sem rachadura.
 * `novos`: [{ cantos: [{ de, em }, ×3], espelho }] — os TRIÂNGULOS CRIADOS (18/10/2026; a ferramenta
 * "criar" da aba): cada canto é um ponto do MODELO numa origem, achado de novo como o centro de um
 * puxão (o lugar da malha mais perto dele — um vértice, se foi grudado num), DEPOIS das partes e dos
 * puxões e ANTES dos cortes (o triângulo de baixo ainda inteiro); o triângulo entra no FIM da malha
 * (`acrescentarTriangulos`, que devolve outra geometria), com os pesos, a cor e a UV do vértice que
 * mais pesa em cada canto, com as DUAS faces (dois triângulos, um de cada lado: tapando um buraco
 * entre peças que apontam para lados opostos não há "para fora" certo, e o lado de trás some).
 * `movidos`: [{ de, em, mover: [x, y, z], espelho }] — os VÉRTICES MOVIDOS (24/10/2026; a ferramenta
 * "mover" da aba): o vértice que o `em` marca no MODELO — um do corpo (o `antes` dele), um criado
 * (`vertices`) ou o canto de um triângulo criado — anda `mover` cm (`moverVertices`, `movidoEm`).
 * `apagados`: [{ de, em, com }] — os VÉRTICES APAGADOS do corpo (25/10/2026; a ferramenta "apagar vértice" da
 * aba): o vértice que o `em` marca no MODELO vai para onde está o vizinho `com` (`apagarVertices`): os triângulos
 * entre os dois ficam sem área e os outros esticam até o vizinho — o vértice some sem abrir buraco.
 * `semOlhos`: a peça dos olhos do modelo sai (guerreiro.js); o olho é uma folha com a imagem do dono.
 * `olhosLisos`: a peça dos olhos fica só com a plaquinha da frente, sem textura (pintura.js `olhosLisos`): o dono a molda.
 *
 * AS PARTES (`PARTES`) são de três tipos:
 *  - por OSSO (a cabeça, o peito, os braços…): o peso de cada vértice nos ossos dela — o
 *    mesmo jeito do `deformar` das raças: a parte emenda na vizinha sem abrir fresta, e a
 *    armadura presa àqueles ossos vai junto;
 *  - por ORIGEM (o cabelo, a barba, as sobrancelhas, os olhos, as presas, o busto): o que foi
 *    desenhado à parte (`ORIGENS`, marcado por vértice ao fundir o corpo);
 *  - por LUGAR (as orelhas: a aba da peça `Face`, `ORELHA` do raca.js; o busto: a pele em volta de
 *    cada seio e o top, sumindo devagar até a costura — o seio é costurado no peito, e uma parte
 *    que pegasse só ele abriria a costura).
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
 *     Puxão feito na pele do peito DEBAIXO de um seio (`sobOBusto`, raca.js `sobOBustoDe`) não faz
 *     nada: a costura tira essa pele (`torsoCosturado`), e com armadura no peito ela fica debaixo
 *     da armadura — os puxões que eram dela (feitos quando o seio era posto em cima) furavam as duas.
 */
import * as THREE from 'three';
import { Assets } from './assets.js';
import { temFeminino, ORELHA, BUSTO } from './raca.js';
import { pertoNoTriangulo } from './ima.js';
import { naPele } from './aparencia.js';

// o que cada pedaço da malha fundida é (o código de cada vértice em `ctx.origem`)
export const ORIGENS = ['corpo', 'armadura', 'cabelo', 'barba', 'sobrancelhas', 'presas', 'busto', 'olhos'];
/** A origem de uma peça da malha fundida, pelo nome dela (o penteado é marcado à parte). */
// (a casca de trás do olho apagado, `Eyes_casca` — pintura.js —, é pele)
export const origemDaPeca = (nome) => (nome === 'presas' ? 'presas' : /^(busto|top)_/.test(nome) ? 'busto' : /^Eyes(?!_casca)/.test(nome) ? 'olhos' : /^A[123]_|^casca_/.test(nome) ? 'armadura' : 'corpo');

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
  { id: 'busto', nome: 'Busto e top', lugar: 'busto', lados: true },
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
  return e && (Object.keys(e.partes ?? {}).length || e.puxoes?.length || e.pinturas?.length || e.olhos || e.cortes?.length || e.novos?.length || e.vertices?.length || e.cores?.length || e.movidos?.length || e.apagados?.length || e.semOlhos || e.olhosLisos || e.luzes?.length || e.cilios || e.iris || e.olhoCor || e.sobrancelha) ? e : null;
}

// A aba Modelo liga isto: as malhas fundidas passam a guardar o que ela precisa (`userData.modelagem`)
let aberta = false;
export function abrirModelagem(sim = true) { aberta = sim; }
// A PELE que a aba Modelo edita (26/10/2026): 'antiga' = as PEÇAS do guerreiro (as edições do corpo, como sempre); 'nova' =
// a PELE NOVA do corpo feminino (retopologia.js) — a camada `nova` de edições dentro do corpo, feita por cima dela
let peleEditada = 'antiga';
export const editarPele = (qual) => { peleEditada = qual === 'nova' ? 'nova' : 'antiga'; };
export const peleEmEdicao = () => peleEditada;
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
  if (p.lugar === 'busto') {
    // a pele e o top em volta de cada seio (no MODELO, antes da raça): inteiro dentro do pé dele
    // (`BUSTO`, no tamanho 100%), sumindo até um pouco além da costura
    const a = ctx.antes, o = BUSTO, s = THREE.MathUtils.smoothstep, pele = [ORIGENS.indexOf('corpo'), ORIGENS.indexOf('busto')];
    for (let i = 0; i < n; i++) {
      if (!pele.includes(ctx.origem[i]) || a[i * 3 + 2] < 0) continue;
      const dx = (Math.abs(a[i * 3]) - o.x) / o.rx, y = a[i * 3 + 1], dy = (y - o.y) / (y > o.y ? o.cima : o.baixo);
      w[i] = 1 - s(Math.hypot(dx, dy), 1, 1.6);
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
  const l = lugarNoModelo(x, geo, ctx, espelho, w);
  if (!l) return null;
  const [i, j, k, u, v, s] = l;
  return new THREE.Vector3(P[i * 3] * u + P[j * 3] * v + P[k * 3] * s, P[i * 3 + 1] * u + P[j * 3 + 1] * v + P[k * 3 + 1] * s, P[i * 3 + 2] * u + P[j * 3 + 2] * v + P[k * 3 + 2] * s);
}
// o lugar da malha que `x.em` marca (no MODELO, na origem `x.de`): [i, j, k, u, v, s] — os vértices do
// triângulo mais perto e o ponto nele (baricêntricas) — ou null. Os triângulos CRIADOS não contam
function lugarNoModelo(x, geo, ctx, espelho = false, w = null) {
  const idx = geo.index, nt = ctx.novosDe != null ? ctx.novosDe / 3 : (idx ? idx.count : geo.attributes.position.count) / 3, A = ctx.antes, o = ORIGENS.indexOf(x.de);
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
  return achado;
}

// O que SEGUE a pele (o couro do bojo, raca.js): cada vértice que segue um que mudou (ou que mudou ele
// mesmo) volta a ficar à folga dele, em cima da pele, pela normal MÉDIA da pele ali como está agora
function seguirAPele(P, idx, nt, ctx, mexeu) {
  const s = ctx.segue, alvo = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) if (s[i] >= 0 && (mexeu[i] || mexeu[s[i]])) alvo[s[i]] = 1;
  if (!alvo.includes(1)) return;
  const chave = (i) => `${Math.round(P[i * 3] * 200)},${Math.round(P[i * 3 + 1] * 200)},${Math.round(P[i * 3 + 2] * 200)}`;
  const media = new Map(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), seguidor = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) if (s[i] >= 0) seguidor[i] = 1;
  // (as faces da pele: as de quem não segue ninguém — o couro não entra na conta da normal)
  for (let t = 0; t < nt; t++) {
    const i = verticeDe(idx, t, 0), j = verticeDe(idx, t, 1), k = verticeDe(idx, t, 2);
    if (!(alvo[i] || alvo[j] || alvo[k]) || seguidor[i]) continue;
    a.fromArray(P, i * 3); b.fromArray(P, j * 3); c.fromArray(P, k * 3);
    n.subVectors(b, a).cross(c.sub(a));
    for (const v of [i, j, k]) { const ch = chave(v); (media.get(ch) ?? media.set(ch, new THREE.Vector3()).get(ch)).add(n); }
  }
  for (let i = 0; i < s.length; i++) {
    const j = s[i];
    if (j < 0 || !alvo[j]) continue;
    const m = media.get(chave(j));
    if (!m || m.lengthSq() < 1e-12) continue;
    m.normalize();
    for (let e = 0; e < 3; e++) P[i * 3 + e] = P[j * 3 + e] + m.getComponent(e) * ctx.folgaDoTop;
    mexeu[i] = 1;
  }
}

// As SOBRANCELHAS COLADAS (`sobrancelha.colar`, 0 a 1 — 25/10/2026, o dono: "a ponta da sobrancelha tá afastada do
// rosto"): ela nasce com a camada de baixo uns 3 a 4 mm DENTRO da pele e a de cima uns 3 mm fora; esvaziada a pele em
// volta dos olhos, o puxão (que anda pela normal de cada vértice) empurrava a camada de baixo — de faces viradas para
// dentro — para FORA: ela ficava achatada e solta até 9 mm. Cada ponto dela mede a altura sobre a pele (a distância, com
// sinal, ao triângulo de pele mais perto) agora e na malha de ANTES das edições (`ctx.base`) e volta (× `colar`) à de
// quando nasceu, pela normal da pele; o `frente` da parte vale por cima. O lugar dela ao longo do rosto (subir, afastar,
// o arco, os movidos) fica — só a altura sobre a pele volta
function colarSobrancelhas(P, ctx, edicoes, mexeu, nc) {
  const SOB = ORIGENS.indexOf('sobrancelhas'), O = ctx.origem, B = ctx.base, colar = Math.min(1, edicoes.sobrancelha.colar);
  const frente = edicoes.partes?.sobrancelhas?.mover?.[2] ?? 0;
  const sob = [];
  for (let i = 0; i < nc; i++) if (O[i] === SOB) sob.push(i);
  if (!sob.length) return;
  // (a pele: os triângulos do corpo perto delas, de pé agora e antes)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const i of sob) { x0 = Math.min(x0, P[i * 3]); x1 = Math.max(x1, P[i * 3]); y0 = Math.min(y0, P[i * 3 + 1]); y1 = Math.max(y1, P[i * 3 + 1]); }
  const tris = [];
  for (let i = 0; i < nc; i += 3) {
    if (O[i] !== 0) continue;
    const mx = (P[i * 3] + P[i * 3 + 3] + P[i * 3 + 6]) / 3, my = (P[i * 3 + 1] + P[i * 3 + 4] + P[i * 3 + 7]) / 3;
    if (mx > x0 - 3 && mx < x1 + 3 && my > y0 - 3 && my < y1 + 3) tris.push(i);
  }
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3(), cp = new THREE.Vector3(), nn = new THREE.Vector3(), tri = new THREE.Triangle();
  // a altura (com sinal) do vértice `i` sobre a pele em `X` (P ou a base); `normal` recebe a normal da pele ali
  const altura = (X, i, normal = null) => {
    q.fromArray(X, i * 3);
    let d = Infinity, s = 1;
    for (const k of tris) {
      tri.set(a.fromArray(X, k * 3), b.fromArray(X, k * 3 + 3), c.fromArray(X, k * 3 + 6));
      if (tri.getArea() < 1e-6) continue;   // (cortado)
      tri.closestPointToPoint(q, cp);
      const x = cp.distanceTo(q);
      if (x >= d) continue;
      d = x;
      tri.getNormal(nn);
      s = cp.sub(q).dot(nn) > 0 ? -1 : 1;
      normal?.copy(nn);
    }
    return d === Infinity ? null : d * s;
  };
  sob.forEach((i) => {
    const n = new THREE.Vector3(), agora = altura(P, i, n), antes = altura(B, i);
    if (agora === null || antes === null) return;
    const d = (agora - antes - frente) * colar;
    if (Math.abs(d) < 0.01 || n.lengthSq() < 0.5) return;
    P[i * 3] -= n.x * d; P[i * 3 + 1] -= n.y * d; P[i * 3 + 2] -= n.z * d;
    mexeu[i] = 1;
  });
}

// A altura (z) da PELE do rosto num ponto (x, y): o triângulo de pele (de frente, perto de `zRef`) mais
// para fora que cobre o ponto — ou null
export function zDaPele(P, idx, nt, origem, x, y, zRef) {
  let z = null;
  for (let t = 0; t < nt; t++) {
    const i = verticeDe(idx, t, 0), j = verticeDe(idx, t, 1), k = verticeDe(idx, t, 2);
    if (origem[i] !== 0) continue;
    const ax = P[i * 3], ay = P[i * 3 + 1], bx = P[j * 3], by = P[j * 3 + 1], cx = P[k * 3], cy = P[k * 3 + 1];
    const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (d <= 1e-9) continue;   // (de costas, ou de lado)
    const a = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d, b = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d, c = 1 - a - b;
    if (a < 0 || b < 0 || c < 0) continue;
    const zt = a * P[i * 3 + 2] + b * P[j * 3 + 2] + c * P[k * 3 + 2];
    if (Math.abs(zt - zRef) < 6 && (z === null || zt > z)) z = zt;
  }
  return z;
}
// a altura média da pele num anel em volta de (x, y)
function zEmVolta(P, idx, nt, origem, x, y, raio, zRef) {
  let s = 0, n = 0;
  for (let k = 0; k < 10; k++) {
    const g = (k / 10) * Math.PI * 2, z = zDaPele(P, idx, nt, origem, x + Math.cos(g) * raio, y + Math.sin(g) * raio, zRef);
    if (z !== null) { s += z; n++; }
  }
  return n ? s / n : null;
}
/**
 * OS OLHOS REPOSICIONADOS (`edicoes.olhos`): cada olho (os vértices de origem `olhos` do lado dele) anda
 * `afasta` cm para fora (nos dois), `sobe` para cima e `fundo` para a frente, cresce `tamanho` e gira
 * `giro` graus (espelhado no outro), em volta do meio dele — e a PELE em volta vai junto, inteira até a
 * beira do olho e sumindo 2 cm depois (a casca, as pálpebras: o buraco do olho não fica para trás). E ele
 * se COLA no rosto: sobe ou afunda o quanto a pele em volta do lugar novo está mais alta ou mais funda que
 * a do lugar de antes (como o pé das presas, que nasce na malha onde as réguas o põem).
 */
function moverOlhos(P, idx, nt, ctx, o, mexeu) {
  const OLH = ORIGENS.indexOf('olhos'), pele = [0, ORIGENS.indexOf('sobrancelhas')], s = o.tamanho ?? 1, g = ((o.giro ?? 0) * Math.PI) / 180;
  const n = P.length / 3, suave = THREE.MathUtils.smoothstep;
  for (const lado of [1, -1]) {
    let cx = 0, cy = 0, cz = 0, k = 0, x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (ctx.origem[i] !== OLH || P[i * 3] * lado <= 0) continue;
      cx += P[i * 3]; cy += P[i * 3 + 1]; cz += P[i * 3 + 2]; k++;
      x0 = Math.min(x0, P[i * 3]); x1 = Math.max(x1, P[i * 3]); y0 = Math.min(y0, P[i * 3 + 1]); y1 = Math.max(y1, P[i * 3 + 1]);
    }
    if (!k) continue;
    cx /= k; cy /= k; cz /= k;
    const r1 = Math.max(x1 - x0, y1 - y0) * 0.62, r2 = r1 + 2;
    const dx = (o.afasta ?? 0) * lado, dy = o.sobe ?? 0;
    // a cola: a pele em volta do lugar novo menos a do lugar de antes
    const antes = zEmVolta(P, idx, nt, ctx.origem, cx, cy, r1 * 1.25, cz), depois = antes === null || (!dx && !dy) ? antes : zEmVolta(P, idx, nt, ctx.origem, cx + dx, cy + dy, r1 * 1.25, cz);
    const dz = (antes !== null && depois !== null ? depois - antes : 0) + (o.fundo ?? 0);
    const cs = Math.cos(g * lado), sn = Math.sin(g * lado);
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      let w = 0;
      if (ctx.origem[i] === OLH) w = x * lado > 0 ? 1 : 0;
      else if (pele.includes(ctx.origem[i]) && x * lado > -0.5 && z > cz - 4) w = 1 - suave(Math.hypot(x - cx, y - cy), r1, r2);
      if (!(w > 0)) continue;
      const ax = (x - cx) * s, ay = (y - cy) * s;
      const nx = cx + ax * cs - ay * sn + dx, ny = cy + ax * sn + ay * cs + dy, nz = cz + (z - cz) * s + dz;
      P[i * 3] = x + (nx - x) * w; P[i * 3 + 1] = y + (ny - y) * w; P[i * 3 + 2] = z + (nz - z) * w;
      mexeu[i] = 1;
    }
  }
}

/**
 * O FORMATO DAS SOBRANCELHAS (`edicoes.sobrancelha: { arco, afina }`, 25/10/2026, pedido do dono: "dá uma polida na
 * sobrancelha"): de cada lado, a sobrancelha (origem `sobrancelhas`) vista de frente, de dentro (t = 0, perto do nariz)
 * para fora (t = 1). `arco` (cm): o meio sobe em arco, o pico a 60% do caminho (como a sobrancelha desenhada da
 * referência); `afina` (0 a 1): a ponta de fora afina — a altura em volta da linha do meio vai a (1 − afina) na ponta.
 * Só o y muda (as duas camadas juntas: a de cima da pele e a de fora); depois disso ela ainda é a PARTE sobrancelhas
 * (tamanho, posição, giro).
 */
function moldarSobrancelhas(P, ctx, o, mexeu) {
  const SOB = ORIGENS.indexOf('sobrancelhas'), n = P.length / 3, arco = Number.isFinite(o.arco) ? o.arco : 0, afina = Math.min(0.95, Math.max(0, Number.isFinite(o.afina) ? o.afina : 0));
  if (!arco && !afina) return;
  for (const lado of [1, -1]) {
    const vs = [];
    for (let i = 0; i < n; i++) if (ctx.origem[i] === SOB && P[i * 3] * lado > 0) vs.push(i);
    if (!vs.length) continue;
    let x0 = Infinity, x1 = -Infinity;
    for (const i of vs) { const ax = P[i * 3] * lado; x0 = Math.min(x0, ax); x1 = Math.max(x1, ax); }
    const larg = x1 - x0 || 1;
    // a linha do meio dela: o y médio em 8 faixas de t (faixa vazia: a vizinha)
    const NF = 8, soma = new Float64Array(NF), cont = new Float64Array(NF);
    for (const i of vs) { const f = Math.min(NF - 1, Math.floor(((P[i * 3] * lado - x0) / larg) * NF)); soma[f] += P[i * 3 + 1]; cont[f]++; }
    const meio = Array.from(soma, (s, f) => (cont[f] ? s / cont[f] : null));
    for (let f = 0; f < NF; f++) if (meio[f] === null) meio[f] = meio.slice(0, f).reverse().find((v) => v !== null) ?? meio.find((v) => v !== null);
    const linha = (t) => { const u = t * NF - 0.5, f = Math.max(0, Math.min(NF - 1, Math.floor(u))), g = Math.min(NF - 1, f + 1), a = Math.max(0, Math.min(1, u - f)); return meio[f] * (1 - a) + meio[g] * a; };
    for (const i of vs) {
      const t = Math.max(0, Math.min(1, (P[i * 3] * lado - x0) / larg)), ym = linha(t);
      const sobe = arco * Math.sin(Math.PI * Math.pow(t, 1.357)), esc = 1 - afina * THREE.MathUtils.smoothstep(t, 0.35, 1);
      P[i * 3 + 1] = ym + (P[i * 3 + 1] - ym) * esc + sobe;
      mexeu[i] = 1;
    }
  }
}

// o lugar do puxão é a pele do peito debaixo de um seio? (dentro do pé dele, no modelo)
function debaixoDoBusto(x, ctx) {
  if (x.de !== 'corpo' || !ctx.sobOBusto?.length) return false;
  const [px, py, pz] = x.em;
  return pz > 0 && ctx.sobOBusto.some((e) => {
    const dx = (px * e.lado - e.x) / e.rx, dy = (py - e.y) / (py > e.y ? e.cima : e.baixo);
    return px * e.lado > 0 && dx * dx + dy * dy < 0.97;
  });
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
  // ---- 0. o FORMATO das sobrancelhas (o arco e a ponta afinada — `edicoes.sobrancelha`), antes de mexer nelas como parte
  if (edicoes.sobrancelha) moldarSobrancelhas(P, ctx, edicoes.sobrancelha, mexeu);
  // ---- 1. as PARTES: crescer em volta do pivô, girar (`giro`, graus, no plano do rosto — nas de dois lados, espelhado) e andar
  for (const [id, t] of Object.entries(edicoes.partes ?? {})) {
    const p = PARTE.get(id);
    if (!p || !t) continue;
    const k = t.tamanho ?? 1, s = [k * (t.largura ?? 1), k * (t.altura ?? 1), k * (t.fundo ?? 1)], m = t.mover ?? [0, 0, 0], giro = ((t.giro ?? 0) * Math.PI) / 180;
    if (s.every((v) => Math.abs(v - 1) < 1e-5) && m.every((v) => Math.abs(v) < 1e-5) && Math.abs(giro) < 1e-6) continue;
    const w = pesosDe(id), piv = pivosDaParte(p, w, P, ctx);
    for (let i = 0; i < n; i++) {
      const f = w[i];
      if (!(f > 0)) continue;
      const lado = p.lados && P[i * 3] < 0 ? 1 : 0, o = piv[lado], sx = lado ? -1 : 1;
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      // (girada em volta do pivô: a ponta de fora sobe com o giro positivo, nos dois lados)
      const lx = (x - o.x) * s[0], ly = (y - o.y) * s[1], g = giro * sx, cs = Math.cos(g), sn = Math.sin(g);
      P[i * 3] = x + (o.x + lx * cs - ly * sn + m[0] * sx - x) * f;
      P[i * 3 + 1] = y + (o.y + lx * sn + ly * cs + m[1] - y) * f;
      P[i * 3 + 2] = z + (o.z + (z - o.z) * s[2] + m[2] - z) * f;
      mexeu[i] = 1;
    }
  }
  // ---- 1b. os OLHOS reposicionados (colados ao rosto)
  if (edicoes.olhos) moverOlhos(P, idx, nt, ctx, edicoes.olhos, mexeu);
  // ---- 2. os PUXÕES, na ordem
  for (const x of edicoes.puxoes ?? []) {
    if (!x?.em || !(x.raio > 0) || debaixoDoBusto(x, ctx)) continue;
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
  // (o couro do top segue a pele ANTES dos cortes — depois, ele reabria o triângulo cortado do top: cada
  // vértice voltava para cima da pele dele — e antes dos CRIADOS: o canto grudado num vértice do top
  // ficava onde o top estava antes de seguir, a 0,2–0,4 cm dele, e o buraco não fechava)
  if (ctx.segue && mexeu.includes(1)) seguirAPele(P, idx, nt, ctx, mexeu);
  // ---- 2-. os VÉRTICES MOVIDOS do corpo (depois do top seguir a pele: o vértice do top movido ficava onde a
  // pele o punha; antes dos vértices e dos triângulos criados, que colam nos do corpo e andam junto)
  if (edicoes.movidos?.length && !idx) moverVertices(P, ctx, edicoes.movidos, mexeu, ctx.novosDe ?? n);
  // ---- 2-'. os VÉRTICES APAGADOS do corpo: cada um vai para o vizinho (depois de os dois andarem; antes dos criados,
  // que colam nele e vão junto)
  if (edicoes.apagados?.length && !idx) apagarVertices(P, ctx, edicoes.apagados, mexeu, ctx.novosDe ?? n);
  // ---- 2-''. as SOBRANCELHAS COLADAS no rosto (`sobrancelha.colar`), com a pele e elas já onde ficam
  if (edicoes.sobrancelha?.colar > 0 && ctx.base && !idx) colarSobrancelhas(P, ctx, edicoes, mexeu, ctx.novosDe ?? n);
  // ---- 2a. as CORES: o triângulo do corpo pintado no editor pega um ponto da paleta (antes dos
  // vértices criados: os pedaços de um triângulo pintado herdam a cor dele)
  if (edicoes.cores?.length && !idx) pintarTriangulos(geo, edicoes.cores, ctx);
  // ---- 2b. os VÉRTICES CRIADOS entram na malha: o triângulo em que cada um cai vira 3 (numa aresta,
  // os dois daquela aresta viram 2 cada) — o de antes é cortado e os pedaços entram como criados de UM
  // lado, na volta dele. Assim o triângulo criado que cola no vértice divide a ARESTA com o corpo
  const div = edicoes.vertices?.length && !idx ? dividirNosVertices(geo, edicoes.vertices, edicoes.cortes ?? [], ctx) : null;
  // ---- 2c. os TRIÂNGULOS CRIADOS: onde cada canto está agora (antes dos cortes, que achatam o de baixo)
  const criados = [...(div?.novos ?? []), ...(edicoes.novos ?? []).map((x, n) => ({ ...x, n }))];
  const cortes = [...(edicoes.cortes ?? []), ...(div?.cortes ?? [])];
  // (os que VÃO ser cortados: o canto que gruda num vértice prefere a cópia dele que fica)
  ctx.novos = criados.length && !idx ? resolverNovos(geo, criados, ctx, P, edicoes.cores, cortes.length ? cortadosPor(cortes, ctx, geo) : null, edicoes.movidos) : null;
  // (malha que JÁ os tem — a vista da aba Modelo, refeita a partir da base: eles voltam ao lugar
  // achado agora, em vez de levar as partes e os puxões de novo)
  const o = ctx.ordensNovos;
  const dq = ctx.novosDoTri;
  if (ctx.novos && ctx.novosDe != null && o?.length === dq?.length && ctx.novosDe + o.length * 3 === n && dq.every((x) => x < ctx.novos.length)) {
    o.forEach((ord, q) => ord.forEach((c, e) => { const v = ctx.novosDe + q * 3 + e, t = ctx.novos[dq[q]]; for (let x = 0; x < 3; x++) P[v * 3 + x] = t.pos[c * 3 + x]; mexeu[v] = 1; }));
  }
  // ---- 3. os CORTES: o triângulo some (os do dono e os divididos pelos vértices criados)
  if (cortes.length) cortarTriangulos(geo, cortes, ctx, mexeu);
  if (!mexeu.includes(1)) return false;
  pos.needsUpdate = true;
  normaisDasFacesMexidas(geo, mexeu);
  geo.boundingBox = null; geo.boundingSphere = null;
  return true;
}

/** O meio do triângulo `t` no MODELO (a média dos cantos em `ctx.antes`), em `v`. Malha sem índice. */
export function meioNoModelo(t, ctx, v = new THREE.Vector3()) {
  const A = ctx.antes, i = t * 9;
  return v.set((A[i] + A[i + 3] + A[i + 6]) / 3, (A[i + 1] + A[i + 4] + A[i + 7]) / 3, (A[i + 2] + A[i + 5] + A[i + 8]) / 3);
}
// o meio guardado e o achado agora: o `em` é gravado a 2 casas (cm)
const PERTO_DO_CORTE = 0.02;
// some com os triângulos de `cortes` (só na malha SEM índice: cada triângulo tem os seus vértices)
function cortarTriangulos(geo, cortes, ctx, mexeu) {
  if (geo.index || !ctx.antes) return;
  const P = geo.attributes.position.array, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  for (const t of cortadosPor(cortes, ctx, geo)) {
    // os três cantos no meio de agora, presos como o primeiro (senão a animação os separava)
    const i = t * 9;
    for (let k = 0; k < 3; k++) { const v = (P[i + k] + P[i + 3 + k] + P[i + 6 + k]) / 3; P[i + k] = P[i + 3 + k] = P[i + 6 + k] = v; }
    for (const a of [si, sw]) if (a) for (let j = 1; j < 3; j++) for (let k = 0; k < a.itemSize; k++) a.array[(t * 3 + j) * a.itemSize + k] = a.array[t * 3 * a.itemSize + k];
    if (si) si.needsUpdate = true;
    if (sw) sw.needsUpdate = true;
    mexeu[t * 3] = mexeu[t * 3 + 1] = mexeu[t * 3 + 2] = 1;
  }
}
// os triângulos do CORPO que os `cortes` pegam (pelo meio no modelo e a origem): um Set
function cortadosPor(cortes, ctx, geo) {
  // (os CRIADOS nunca: quem troca um triângulo ruim corta-o e cria outro nos MESMOS cantos — o mesmo
  // meio. No jogo os cortes vêm antes de eles entrarem; na vista da aba, que já os tem, o corte os
  // apagava, e o triângulo novo aparecia no boneco e sumia na edição)
  const nt = ctx.novosDe != null ? ctx.novosDe / 3 : geo.attributes.position.count / 3, fora = new Set();
  // (uma grade de 1 cm com os cortes: cada triângulo só confere os da casa dele)
  const grade = new Map(), casa = (x, y, z) => `${Math.floor(x)},${Math.floor(y)},${Math.floor(z)}`;
  for (const c of cortes) {
    const o = ORIGENS.indexOf(c?.de);
    if (o < 0 || !Array.isArray(c.em) || c.em.length !== 3) continue;
    const ks = new Set();
    for (const dx of [-1, 1]) for (const dy of [-1, 1]) for (const dz of [-1, 1]) ks.add(casa(c.em[0] + dx * PERTO_DO_CORTE, c.em[1] + dy * PERTO_DO_CORTE, c.em[2] + dz * PERTO_DO_CORTE));
    for (const k of ks) (grade.get(k) ?? grade.set(k, []).get(k)).push({ o, em: c.em });
  }
  if (!grade.size) return fora;
  const m = new THREE.Vector3();
  for (let t = 0; t < nt; t++) {
    meioNoModelo(t, ctx, m);
    const l = grade.get(casa(m.x, m.y, m.z));
    if (l?.some((c) => c.o === ctx.origem[t * 3] && Math.abs(c.em[0] - m.x) < PERTO_DO_CORTE && Math.abs(c.em[1] - m.y) < PERTO_DO_CORTE && Math.abs(c.em[2] - m.z) < PERTO_DO_CORTE)) fora.add(t);
  }
  return fora;
}

// ---- as CORES (`cores: [{ de, em, uv, tom? }]` no corpo, a ferramenta "colorir" do editor): o triângulo
// achado pelo meio no MODELO (como os cortes) fica todo com o `uv` (um ponto da paleta do corpo) e o
// `tom` (a cor de vértice — o couro do top é um texel claro vezes o tom dele; sem `tom`, `tomDaCor`)
const uvValido = (uv) => Array.isArray(uv) && uv.length === 2 && uv.every(Number.isFinite);
function pintarTriangulos(geo, cores, ctx) {
  const uv = geo.attributes.uv, cor = geo.attributes.color;
  if (!uv || !ctx.antes) return;
  const l = cores.filter((c) => uvValido(c?.uv));
  const achados = cortadosPor(l, ctx, geo), m = new THREE.Vector3();
  for (const t of achados) {
    meioNoModelo(t, ctx, m);
    const c = corNoMeio(l, ORIGENS[ctx.origem[t * 3]], m);
    if (!c) continue;
    const tom = tomDaCor(geo, ctx, c.uv, c.tom);
    for (let k = 0; k < 3; k++) { uv.setXY(t * 3 + k, c.uv[0], c.uv[1]); if (tom) cor.setXYZ(t * 3 + k, tom[0], tom[1], tom[2]); }
  }
  if (achados.size) { uv.needsUpdate = true; if (cor) cor.needsUpdate = true; }
}
/**
 * O TOM (a cor de vértice) de um ponto `uv` da paleta: a pele é tingida pela cor de vértice
 * (aparencia.js `tingir`), então o ponto na faixa da pele leva o tom da pele de quem veste (o de
 * um vértice de pele do corpo); o resto, nenhum (branco). O triângulo pintado guardava o tom do
 * vértice de onde saiu, e a cor escolhida saía multiplicada por ele (escura). Sem cor de vértice: null
 */
export function tomDaCor(geo, ctx, uv, tom = null) {
  const cor = geo.attributes.color, U = geo.attributes.uv;
  if (!cor) return null;
  if (Array.isArray(tom) && tom.length === 3 && tom.every(Number.isFinite)) return tom;
  if (!naPele(uv[0], uv[1])) return [1, 1, 1];
  if (!ctx.tomDaPele) {
    const corpo = ORIGENS.indexOf('corpo'), busto = ORIGENS.indexOf('busto');
    let i = 0;
    for (; i < cor.count; i++) if ((ctx.origem[i] === corpo || ctx.origem[i] === busto) && naPele(U.getX(i), U.getY(i))) break;
    ctx.tomDaPele = i < cor.count ? [cor.getX(i), cor.getY(i), cor.getZ(i)] : [1, 1, 1];
  }
  return ctx.tomDaPele;
}
// a cor gravada para o triângulo de meio `m` (no modelo) e origem `de` — ou null
function corNoMeio(cores, de, m) {
  return cores.find((c) => c.de === de && Array.isArray(c.em) && Math.abs(c.em[0] - m.x) < PERTO_DO_CORTE && Math.abs(c.em[1] - m.y) < PERTO_DO_CORTE && Math.abs(c.em[2] - m.z) < PERTO_DO_CORTE && uvValido(c.uv)) ?? null;
}

/**
 * AS LUZES (24/10/2026; `luzes: [{ de, em, n: [x, y, z] }]` no corpo, a ferramenta "luz" da aba): o triângulo achado
 * pelo meio no MODELO (como os cortes e as cores — os criados também) é iluminado como se apontasse para `n` (a
 * normal dos três cantos, no espaço da malha). O queixo refeito da humana, com as faces viradas um pouco para baixo,
 * saía escuro ao lado da bochecha clara: com a luz da bochecha, sai no mesmo tom. A face de trás de um criado (ele
 * tem as duas) leva a normal ao contrário. Depois dos planos do rosto (guerreiro.js `planosDoRosto`), que a refariam
 */
export function aplicarLuzes(geo, luzes, ctx) {
  const nor = geo.attributes.normal, P = geo.attributes.position.array;
  if (!nor || geo.index || !ctx?.antes || !luzes?.length) return;
  const l = luzes.filter((x) => ORIGENS.includes(x?.de) && [x.em, x.n].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite)))
    .map((x) => ({ o: ORIGENS.indexOf(x.de), em: x.em, n: new THREE.Vector3(...x.n).normalize() }));
  const m = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < P.length / 9; t++) {
    meioNoModelo(t, ctx, m);
    const x = l.find((x) => x.o === ctx.origem[t * 3] && Math.abs(x.em[0] - m.x) < PERTO_DO_CORTE && Math.abs(x.em[1] - m.y) < PERTO_DO_CORTE && Math.abs(x.em[2] - m.z) < PERTO_DO_CORTE);
    if (!x) continue;
    a.fromArray(P, t * 9); b.fromArray(P, t * 9 + 3).sub(a); c.fromArray(P, t * 9 + 6).sub(a);
    const f = b.cross(c);
    if (f.lengthSq() < 1e-12) continue;   // (cortado)
    const s = f.dot(x.n) < 0 ? -1 : 1;
    for (let k = 0; k < 3; k++) nor.setXYZ(t * 3 + k, x.n.x * s, x.n.y * s, x.n.z * s);
  }
  nor.needsUpdate = true;
}

// ---- os VÉRTICES MOVIDOS (`movidos: [{ de, em, mover: [x, y, z], espelho }]`, 24/10/2026; a ferramenta "mover"
// da aba): o vértice que o `em` marca no MODELO anda `mover` cm. `espelho`: o do outro lado também, com o x ao
// contrário (o do meio, uma vez só)
const NO_MOVIDO = 0.009;   // cm: o `em` gravado (3 casas) e o `antes` do vértice
const COLADO = 1e-3;       // cm: outro vértice no mesmo ponto (a emenda de duas peças)
const MEIO = 0.05;         // cm: |x| abaixo disto, o vértice é do meio
const ladosDoMovido = (m) => (m.espelho && Math.abs(m.em[0]) >= MEIO ? [1, -1] : [1]);
const movidoValido = (m) => ORIGENS.includes(m?.de) && [m.em, m.mover].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite));
// os do CORPO (os `nc` primeiros vértices): toda cópia do vértice (a mesma origem e o `antes` = o `em`), o que
// está COLADO nela agora (a emenda com outra peça, ou outra origem: sem isso abria fresta; a armadura só com
// a armadura) e o que SEGUE a pele nela (o couro do top). O vértice criado e o canto de um triângulo criado
// andam no `resolverNovos` (`movidoEm`), e os que colam num do corpo vão com ele
function moverVertices(P, ctx, movidos, mexeu, nc) {
  const A = ctx.antes, O = ctx.origem, ARM = ORIGENS.indexOf('armadura'), s = ctx.segue;
  const perto = (a, b) => Math.abs(P[a * 3] - P[b * 3]) < COLADO && Math.abs(P[a * 3 + 1] - P[b * 3 + 1]) < COLADO && Math.abs(P[a * 3 + 2] - P[b * 3 + 2]) < COLADO;
  for (const m of movidos) {
    if (!movidoValido(m)) continue;
    const o = ORIGENS.indexOf(m.de);
    for (const lado of ladosDoMovido(m)) {
      const ex = m.em[0] * lado, ey = m.em[1], ez = m.em[2], vai = new Set(), onde = [];
      for (let v = 0; v < nc; v++) {
        if (O[v] !== o || Math.abs(A[v * 3] - ex) >= NO_MOVIDO || Math.hypot(A[v * 3] - ex, A[v * 3 + 1] - ey, A[v * 3 + 2] - ez) >= NO_MOVIDO) continue;
        vai.add(v);
        if (!onde.some((q) => perto(q, v))) onde.push(v);
      }
      if (!vai.size) continue;
      for (let v = 0; v < nc; v++) if (!vai.has(v) && (O[v] === ARM) === (o === ARM) && onde.some((q) => perto(q, v))) vai.add(v);
      if (s) for (let v = 0; v < Math.min(s.length, nc); v++) if (s[v] >= 0 && vai.has(s[v])) vai.add(v);
      for (const v of vai) { P[v * 3] += m.mover[0] * lado; P[v * 3 + 1] += m.mover[1]; P[v * 3 + 2] += m.mover[2]; mexeu[v] = 1; }
    }
  }
}
// os APAGADOS: toda cópia do vértice `em` (a mesma origem e o `antes`), o que está colado nela e o que a segue vão
// para o lugar de agora do vizinho `com` (a mesma origem). Sem o vizinho (cortado, outro modelo), nada muda
const apagadoValido = (x) => ORIGENS.includes(x?.de) && [x.em, x.com].every((v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite));
function apagarVertices(P, ctx, apagados, mexeu, nc) {
  const A = ctx.antes, O = ctx.origem, ARM = ORIGENS.indexOf('armadura'), s = ctx.segue;
  const perto = (a, b) => Math.abs(P[a * 3] - P[b * 3]) < COLADO && Math.abs(P[a * 3 + 1] - P[b * 3 + 1]) < COLADO && Math.abs(P[a * 3 + 2] - P[b * 3 + 2]) < COLADO;
  const no = (o, [x, y, z], v) => O[v] === o && Math.abs(A[v * 3] - x) < NO_MOVIDO && Math.hypot(A[v * 3] - x, A[v * 3 + 1] - y, A[v * 3 + 2] - z) < NO_MOVIDO;
  for (const x of apagados) {
    if (!apagadoValido(x)) continue;
    const o = ORIGENS.indexOf(x.de);
    let alvo = -1;
    for (let v = 0; v < nc && alvo < 0; v++) if (no(o, x.com, v)) alvo = v;
    if (alvo < 0) continue;
    const vai = new Set(), onde = [];
    for (let v = 0; v < nc; v++) if (no(o, x.em, v)) { vai.add(v); if (!onde.some((q) => perto(q, v))) onde.push(v); }
    if (!vai.size) continue;
    for (let v = 0; v < nc; v++) if (!vai.has(v) && (O[v] === ARM) === (o === ARM) && onde.some((q) => perto(q, v))) vai.add(v);
    if (s) for (let v = 0; v < Math.min(s.length, nc); v++) if (s[v] >= 0 && vai.has(s[v])) vai.add(v);
    const ax = P[alvo * 3], ay = P[alvo * 3 + 1], az = P[alvo * 3 + 2];
    for (const v of vai) { P[v * 3] = ax; P[v * 3 + 1] = ay; P[v * 3 + 2] = az; mexeu[v] = 1; }
  }
}
// o quanto o ponto `em` (no modelo) da origem `de` foi movido: [x, y, z] cm (a soma dos que o pegam) — ou null
function movidoEm(movidos, de, em) {
  let d = null;
  for (const m of movidos) {
    if (m?.de !== de || !movidoValido(m)) continue;
    for (const lado of ladosDoMovido(m)) {
      if (Math.hypot(m.em[0] * lado - em[0], m.em[1] - em[1], m.em[2] - em[2]) >= NO_MOVIDO) continue;
      d ??= [0, 0, 0];
      d[0] += m.mover[0] * lado; d[1] += m.mover[1]; d[2] += m.mover[2];
    }
  }
  return d;
}

// ---- os VÉRTICES CRIADOS dentro da malha (no MODELO, `antes`): { novos: os pedaços (criados de um
// lado só, `umLado`, n = −1), cortes: os triângulos do corpo que eles trocam } — ou null
const MESMO_PONTO = 1e-3;   // cm: o mesmo vértice (o `em` de um vértice do corpo é o `antes` dele)
const NA_BEIRA = 0.04;      // a baricêntrica abaixo disto: o ponto está na aresta (ou no canto)
function dividirNosVertices(geo, vertices, cortesDoDono, ctx) {
  const A = ctx.antes, nt = (ctx.novosDe ?? geo.attributes.position.count) / 3, cortados = cortadosPor(cortesDoDono, ctx, geo);
  // (o canto guarda o VÉRTICE dele, `i`: numa emenda há outro vértice no mesmo ponto, de outra peça e
  // com outros pesos — achado de novo pela posição, o canto andava com a outra peça e abria fresta ao animar)
  const ponto = (i) => ({ de: ORIGENS[ctx.origem[i]], em: [A[i * 3], A[i * 3 + 1], A[i * 3 + 2]], i });
  const mesmo = (p, q) => p.de === q.de && p.em.every((x, k) => Math.abs(x - q.em[k]) < MESMO_PONTO);
  const v3 = (p) => new THREE.Vector3(p.em[0], p.em[1], p.em[2]), bar = new THREE.Vector3();
  // cada triângulo do corpo mexido → os pedaços dele, na volta dele: [[p, p, p], …]
  const pedacos = new Map(), de = (t) => pedacos.get(t) ?? pedacos.set(t, [[ponto(t * 3), ponto(t * 3 + 1), ponto(t * 3 + 2)]]).get(t);
  // o pedaço que tem a aresta q→p (o vizinho do outro lado da aresta p→q): de um já mexido, ou de um do corpo
  const vizinho = (p, q) => {
    for (const l of pedacos.values()) for (const s of l) for (let k = 0; k < 3; k++) if (mesmo(s[k], q) && mesmo(s[(k + 1) % 3], p)) return { l, s, k };
    for (let t = 0; t < nt; t++) {
      if (pedacos.has(t) || cortados.has(t)) continue;
      for (let k = 0; k < 3; k++) if (mesmo(ponto(t * 3 + k), q) && mesmo(ponto(t * 3 + (k + 1) % 3), p)) { const l = de(t); return { l, s: l[0], k }; }
    }
    return null;
  };
  for (const v of vertices) {
    if (!Array.isArray(v?.em) || v.em.length !== 3 || ORIGENS.indexOf(v.de) < 0) continue;
    const lugar = lugarNoModelo(v, geo, ctx);
    if (!lugar || cortados.has(Math.floor(lugar[0] / 3))) continue;
    // (o lugar dele vai junto: todos os pedaços que o usam caem no MESMO ponto, com os mesmos pesos)
    const V = { de: v.de, em: [...v.em], lugar }, l = de(Math.floor(lugar[0] / 3)), q = v3(V);
    // o pedaço em que ele cai (o mais perto) e onde nele
    let s = null, b = null, dm = Infinity;
    for (const x of l) {
      pertoNoTriangulo(q, v3(x[0]), v3(x[1]), v3(x[2]), bar);
      const d = v3(x[0]).multiplyScalar(bar.x).add(v3(x[1]).multiplyScalar(bar.y)).add(v3(x[2]).multiplyScalar(bar.z)).distanceToSquared(q);
      if (d < dm) { dm = d; s = x; b = [bar.x, bar.y, bar.z]; }
    }
    if (s.some((p) => mesmo(p, V))) continue;
    const beira = b.map((x) => x < NA_BEIRA), nb = beira.filter(Boolean).length;
    if (nb >= 2) continue;   // num canto: já é um vértice
    if (!nb) { l.splice(l.indexOf(s), 1, [s[0], s[1], V], [s[1], s[2], V], [s[2], s[0], V]); continue; }
    // numa ARESTA (a oposta ao canto de baricêntrica ~0): os dois lados dela viram 2
    const k = beira.indexOf(true), pc = s[k], pa = s[(k + 1) % 3], pb = s[(k + 2) % 3];
    l.splice(l.indexOf(s), 1, [pa, V, pc], [V, pb, pc]);
    const o = vizinho(pa, pb);
    if (o) { const qb = o.s[o.k], qa = o.s[(o.k + 1) % 3], pr = o.s[(o.k + 2) % 3]; o.l.splice(o.l.indexOf(o.s), 1, [qb, V, pr], [V, qa, pr]); }
  }
  // o PEDAÇO que o dono cortou (o meio dele no modelo e a origem, como o corte de um triângulo do
  // corpo) não entra — 23/10/2026: quem refazia a ponta do nariz marcava um vértice nela e não conseguia
  // tirar os pedaços em volta dele
  const doDono = cortesDoDono.filter((c) => Array.isArray(c?.em) && c.em.length === 3);
  const cortado = (s, de) => doDono.some((c) => c.de === de && [0, 1, 2].every((k) => Math.abs(c.em[k] - (s[0].em[k] + s[1].em[k] + s[2].em[k]) / 3) < PERTO_DO_CORTE));
  const novos = [], cortes = [], m = new THREE.Vector3();
  for (const [t, l] of pedacos) {
    if (l.length < 2) continue;
    meioNoModelo(t, ctx, m);
    const de = ORIGENS[ctx.origem[t * 3]];
    cortes.push({ de, em: [m.x, m.y, m.z] });
    for (const s of l) if (!cortado(s, de)) novos.push({ cantos: s, umLado: true, n: -1 });
  }
  return cortes.length ? { novos, cortes } : null;   // (todos os pedaços cortados: o triângulo de baixo continua fora)
}

// os cantos de cada triângulo criado, na malha de agora (`novos`: cada um com `n`, o número dele na
// lista do dono, −1 nos pedaços dos vértices criados, e `umLado`): [{ n, umLado, fonte: os
// vértices que dão pesos/cor/UV, pos: 9 números, antes: 9 números (no modelo) }] — ou null
// cantos de criados a menos disto (cm, no modelo) um do outro são o MESMO ponto (a SOLDA): dois
// triângulos colados à mão num vértice quase igual (84,35 × 84,37) ficavam com um vão finíssimo
const SOLDA = 0.1;
// Cada canto fica no lugar MARCADO (`em`): preso ao ponto da pele mais perto e somado o que falta até o
// `em` — encostado na pele, o canto do meio de um criado (um vértice criado nele) afundava no corpo. Os
// triângulos CORTADOS valem (ainda inteiros aqui): o canto grudado num vértice de um pedaço cortado (a
// cúpula do busto da Humana, quase toda cortada) ia se prender a um vivo a 46 cm e era arrastado
function resolverNovos(geo, novos, ctx, P, cores = null, cortados = null, movidos = null) {
  const A = ctx.antes, meio = new THREE.Vector3();
  const lista = [], soldados = [];
  // o canto que MARCA um vértice do corpo (o `em` é o `antes` dele, até o arredondamento de 2 casas)
  // gruda NELE (20/10/2026): o triângulo mais perto podia ser outra superfície quase no mesmo ponto do
  // modelo — a dobra do lábio, no queixo da Humana — que os puxões levam para outro lugar (vãos de 0,3 cm).
  // O ponto tem uma CÓPIA por triângulo, e as dos triângulos cortados podem ter ido para outro lugar (os
  // pesos de outra peça, nos puxões): vale a de um triângulo que FICA
  const grade = new Map(), nc = ctx.novosDe ?? A.length / 3, cel = (x) => Math.round(x * 100);
  for (let v = 0; v < nc; v++) { const k = `${cel(A[v * 3])},${cel(A[v * 3 + 1])},${cel(A[v * 3 + 2])}`; if (!grade.has(k)) grade.set(k, []); grade.get(k).push(v); }
  const noVertice = (de, em) => {
    const o = ORIGENS.indexOf(de), [x, y, z] = em.map(cel);
    let achado = -1;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) {
      for (const v of grade.get(`${x + a},${y + b},${z + c}`) ?? []) {
        if (ctx.origem[v] !== o || Math.hypot(A[v * 3] - em[0], A[v * 3 + 1] - em[1], A[v * 3 + 2] - em[2]) >= 0.009) continue;
        if (!cortados?.has(Math.floor(v / 3))) return v;
        if (achado < 0) achado = v;
      }
    }
    return achado;
  };
  // o ponto já visto (da mesma origem) a menos da SOLDA, ou este mesmo — e passa a ser visto
  const soldar = (de, em) => {
    const j = soldados.find((s) => s.de === de && Math.abs(s.em[0] - em[0]) < SOLDA && Math.abs(s.em[1] - em[1]) < SOLDA && Math.abs(s.em[2] - em[2]) < SOLDA);
    if (j) return j.em;
    soldados.push({ de, em });
    return em;
  };
  novos.forEach((x) => {
    const n = x.n, umLado = !!x.umLado;
    if (!Array.isArray(x?.cantos) || x.cantos.length !== 3 || !x.cantos.every((c) => Array.isArray(c?.em) && c.em.length === 3)) return;
    for (const lado of x.espelho ? [false, true] : [false]) {
      const fonte = [], pos = [], antes = [], sobes = [];
      for (const c of x.cantos) {
        // (o pedaço de um vértice criado já sabe o vértice, ou o lugar, de cada canto)
        // (o canto onde está de fato — do lado espelhado, o x ao contrário — e soldado aos já vistos;
        // o canto a menos da SOLDA do meio É do meio: o espelho o mantém — colado num vértice do corpo
        // em x = −0,05, o outro lado ia para +0,05, a 0,1 cm, e as duas metades nunca se juntavam)
        const em = c.i != null || c.lugar ? c.em : soldar(c.de, lado && Math.abs(c.em[0]) >= SOLDA ? [-c.em[0], c.em[1], c.em[2]] : c.em);
        const doCorpo = c.i == null && !c.lugar ? noVertice(c.de, em) : -1;
        const vi = !(c.sobe > 0) ? doCorpo : -1;   // (o afastado precisa do triângulo: a normal dele)
        const l = c.i != null ? [c.i, c.i, c.i, 1, 0, 0] : vi >= 0 ? [vi, vi, vi, 1, 0, 0] : c.lugar ?? lugarNoModelo({ de: c.de, em }, geo, ctx);
        if (!l) break;
        const [i, j, k, u, v, s] = l;
        fonte.push(u >= v && u >= s ? i : v >= s ? j : k);
        // (o pedaço de um vértice criado está NO vértice — e o canto que gruda num: nada a somar)
        const marcado = c.i == null && !c.lugar && vi < 0;
        // (o vértice criado e o canto solto MOVIDOS; o do corpo já andou — `moverVertices` — e quem cola nele vai junto)
        const mv = c.i == null && doCorpo < 0 && movidos?.length ? movidoEm(movidos, c.de, em) : null;
        for (let e = 0; e < 3; e++) pos.push(P[i * 3 + e] * u + P[j * 3 + e] * v + P[k * 3 + e] * s + (marcado ? em[e] - (A[i * 3 + e] * u + A[j * 3 + e] * v + A[k * 3 + e] * s) : 0) + (mv ? mv[e] : 0));
        // (o canto AFASTADO da pele: `sobe` cm pela normal da face onde ele se prende, como ela está
        // AGORA — o sutiã criado fica por cima da pele e a acompanha quando ela muda; um afastamento
        // somado no `em` ia pela normal do modelo e, no busto muito puxado, prendia em outro triângulo)
        const sobe = marcado && Number.isFinite(c.sobe) && c.sobe > 0 ? Math.min(c.sobe, 20) : 0;
        if (sobe) {
          const pa = meio.fromArray(P, i * 3), ab = new THREE.Vector3().fromArray(P, j * 3).sub(pa), ac = new THREE.Vector3().fromArray(P, k * 3).sub(pa), nf = ab.cross(ac).normalize();
          for (let e = 0; e < 3; e++) pos[pos.length - 3 + e] += nf.getComponent(e) * sobe;
        }
        sobes.push(sobe);
        antes.push(c.i != null || c.lugar ? (lado ? -c.em[0] : c.em[0]) : em[0], em[1], em[2]);
      }
      // (os atributos dos vértices de onde sai — pesos, cor, UV — copiados JÁ: os cortes, logo depois, trocam
      // os pesos do triângulo cortado, e o canto que colou num vértice dele andava com o osso errado ao animar)
      const copia = fonte.length === 3 ? Object.fromEntries(Object.entries(geo.attributes).map(([nome, at]) => [nome, fonte.map((f) => at.array.slice(f * at.itemSize, (f + 1) * at.itemSize))])) : null;
      // (a COR: o criado pintado leva o `uv` dele; o pedaço de um vértice criado, o das `cores` pelo meio)
      const c = !copia?.uv ? null : uvValido(x.uv) ? x : n < 0 && cores?.length ? corNoMeio(cores, ORIGENS[ctx.origem[fonte[0]]], meio.set((antes[0] + antes[3] + antes[6]) / 3, (antes[1] + antes[4] + antes[7]) / 3, (antes[2] + antes[5] + antes[8]) / 3)) : null;
      if (c) {
        const uv = c.uv;
        copia.uv = copia.uv.map((u) => u.map((_, k) => uv[k]));
        const tom = copia.color && tomDaCor(geo, ctx, uv, c.tom);
        if (tom) copia.color = copia.color.map((c) => c.map((_, k) => tom[k] ?? 1));
      }
      if (fonte.length === 3) lista.push({ n, lado, fonte, pos, antes, umLado, copia, sobes });
    }
  });
  return lista.length ? lista : null;
}
/**
 * Os TRIÂNGULOS CRIADOS (`ctx.novos`, do `aplicarModelagem`) no FIM da malha: devolve OUTRA
 * geometria (a de antes é descartada) — ou a mesma, se não há nenhum. O `ctx` cresce junto
 * (`origem`, `antes`, `base`) e ganha `novosDe` (o 1º vértice criado), `novosQuem` (de cada
 * triângulo criado, o número dele em `novos`) e `criado` (1 = vértice CRIADO pela ferramenta, 0 = do
 * corpo: a marca que a aba usa para achá-los — destacar, grudar nos vértices do corpo).
 */
export function acrescentarTriangulos(geo, ctx) {
  if (!ctx?.novos || geo.index) return geo;
  // (cada um DUAS vezes, uma de cada lado: as duas faces — menos os pedaços dos vértices criados,
  // que trocam um triângulo do corpo e ficam na volta dele)
  const dq = ctx.novos.flatMap((t, q) => (t.umLado ? [q] : [q, q])), l = dq.map((q) => ctx.novos[q]);
  const n0 = geo.attributes.position.count, k = l.length * 3, g = new THREE.BufferGeometry();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const ordens = dq.map((q, i) => (i > 0 && dq[i - 1] === q ? [0, 2, 1] : [0, 1, 2]));
  for (const [nome, at] of Object.entries(geo.attributes)) {
    const s = at.itemSize, arr = new at.array.constructor((n0 + k) * s);
    arr.set(at.array);
    l.forEach((t, q) => ordens[q].forEach((o, e) => arr.set(t.copia?.[nome]?.[o] ?? at.array.subarray(t.fonte[o] * s, (t.fonte[o] + 1) * s), (n0 + q * 3 + e) * s)));
    g.setAttribute(nome, new THREE.BufferAttribute(arr, s, at.normalized));
  }
  const P = g.attributes.position.array, N = g.attributes.normal?.array;
  const origem = new Uint8Array(n0 + k), antes = new Float32Array((n0 + k) * 3), base = ctx.base ? new Float32Array((n0 + k) * 3) : null;
  origem.set(ctx.origem); antes.set(ctx.antes); base?.set(ctx.base);
  // (1 = criado pelo dono, 2 = pedaço de um triângulo dividido por um vértice criado)
  const criado = new Uint8Array(n0 + k);
  l.forEach((t, q) => criado.fill(t.n < 0 ? 2 : 1, n0 + q * 3, n0 + q * 3 + 3));
  // (o `sobe` de cada canto: a aba cola um canto novo num canto afastado e precisa dele)
  const sobe = new Float32Array(n0 + k);
  l.forEach((t, q) => ordens[q].forEach((o, e) => { sobe[n0 + q * 3 + e] = t.sobes?.[o] ?? 0; }));
  l.forEach((t, q) => {
    ordens[q].forEach((o, e) => {
      const v = n0 + q * 3 + e;
      for (let x = 0; x < 3; x++) { P[v * 3 + x] = t.pos[o * 3 + x]; antes[v * 3 + x] = t.antes[o * 3 + x]; if (base) base[v * 3 + x] = t.pos[o * 3 + x]; }
      origem[v] = ctx.origem[t.fonte[o]];
    });
    // a normal reta da face (o facetado do modelo)
    const v = (n0 + q * 3) * 3;
    a.fromArray(P, v); b.fromArray(P, v + 3).sub(a); c.fromArray(P, v + 6).sub(a);
    b.cross(c).normalize();
    if (N) for (let e = 0; e < 3; e++) N.set([b.x, b.y, b.z], v + e * 3);
  });
  Object.assign(ctx, { origem, antes, ...(base ? { base } : {}), novosDe: n0, novosQuem: l.map((t) => t.n), ordensNovos: ordens, novosDoTri: dq, criado, sobe });
  g.userData = geo.userData;
  geo.dispose();
  return g;
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
