/**
 * AS RAÇAS (12/10/2026) — o MESMO corpo do guerreiro com outra cor e outras PROPORÇÕES:
 * o Orc é o guerreiro verde, careca, com a barriga, o tronco, os braços e as pernas
 * maiores. São DADO (`assets/racas.json`, `Assets.racas`), e quem as edita é a tela
 * "Raças" do editor de cenas (que monta o boneco com ESTE código).
 *
 * A raça é o 6º dígito da APARÊNCIA (aparencia.js): 0 (ou nenhum) = humano, n = a
 * n-ésima raça do arquivo — por isso a ORDEM do arquivo não muda (raça nova, no fim).
 *
 * Uma raça: { id, nome, jogavel, pele, olhos, semCabelo, semBarba, proporcoes }.
 *  - `pele` / `olhos` ('#rrggbb' ou null): a cor é a da raça, e não a que o jogador escolheu;
 *  - `semCabelo` / `semBarba`: a peça sai;
 *  - `jogavel`: aparece no editor de personagem do jogo (falso = só no editor de cenas);
 *  - `proporcoes`: os números de `PROPORCOES` (1 = como o modelo é; o que falta vale 1).
 *
 * COMO SE MUDA A PROPORÇÃO, em dois lugares:
 *  1. NA MALHA (`deformar`, chamado ao fundir o corpo — guerreiro.js `geometriaFundida`):
 *     cada vértice é engrossado em volta do osso a que está preso (a mistura dos pesos
 *     dele emenda uma parte na outra). Membros engrossam em volta do próprio eixo; o
 *     tronco, em volta da linha da coluna, com a LARGURA e o FUNDO separados (a barriga
 *     cresce para a frente); a cabeça e os pés crescem a partir da junta. É feito uma
 *     vez por corpo, e a armadura (do pacote ou pintada) cresce junto: é a mesma malha.
 *  2. NOS OSSOS (`CorpoGuerreiro.aplicarRaca`): a ALTURA (a cena inteira), os OMBROS (os
 *     braços nascem mais para fora), o QUADRIL (as coxas se afastam com a largura dele)
 *     e as MÃOS — a escala do osso da mão, que os dedos herdam. (Na malha, a mão crescia
 *     e as juntas dos dedos ficavam onde estavam: ao fechar a mão os dedos esticavam
 *     como espaguete.)
 * As animações não mudam: o retarget só copia giros.
 *
 * AS PRESAS (`pecasDaRaca`): um par de dentes que sobe do maxilar de baixo, desenhado
 * em código e preso ao osso da cabeça — mais uma peça da malha fundida. `presas` é o
 * tamanho (0 = sem). AS ORELHAS PONTUDAS (`orelhas`) são do mesmo jeito, na cor da PELE.
 */
import * as THREE from 'three';
import { Assets } from './assets.js';
import { texelClaro } from './casca.js';

// [chave, rótulo, mínimo, máximo, padrão (1 se não diz)] — a tela Raças do editor monta os
// controles por aqui
export const PROPORCOES = [
  ['altura', 'Altura', 0.8, 1.3],
  ['cabeca', 'Cabeça', 0.8, 1.4],
  ['pescoco', 'Pescoço (grossura)', 0.7, 1.8],
  ['ombros', 'Ombros (largura)', 0.8, 1.5],
  ['peitoLargura', 'Peito — largura', 0.8, 1.6],
  ['peitoFundo', 'Peito — fundo', 0.8, 1.8],
  ['barrigaLargura', 'Barriga — largura', 0.8, 1.8],
  ['barrigaFrente', 'Barriga — para a frente', 0.8, 3],
  ['quadril', 'Quadril', 0.8, 1.6],
  ['bracos', 'Braços (grossura)', 0.7, 1.8],
  ['antebracos', 'Antebraços (grossura)', 0.7, 1.8],
  ['maos', 'Mãos', 0.8, 1.6],
  ['coxas', 'Coxas (grossura)', 0.7, 1.8],
  ['canelas', 'Canelas (grossura)', 0.7, 1.8],
  ['pes', 'Pés', 0.8, 1.6],
  ['presas', 'Presas (0 = sem)', 0, 2.5, 0],
  ['orelhas', 'Orelhas pontudas (0 = sem)', 0, 2.5, 0],
];

/** A raça de número `n` (o dígito da aparência): null = humano, ou raça que não existe mais. */
export const racaDe = (n) => (n > 0 ? Assets.racas?.[n - 1] ?? null : null);
/** As proporções completas de uma raça (o que falta, ou está torto, vale o padrão: o humano). */
export function proporcoesDe(raca) {
  const p = {};
  for (const [k, , min, max, padrao = 1] of PROPORCOES) {
    const v = raca?.proporcoes?.[k];
    p[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : padrao;
  }
  return p;
}
/** Uma raça nova, igual ao humano (o ponto de partida do editor). */
export const racaNova = (id, nome) => ({
  id, nome, jogavel: false, pele: null, olhos: null, semCabelo: false, semBarba: false,
  proporcoes: proporcoesDe(null),
});

// ------------------------------------------------------------ as presas
// O caminho de uma presa (a do lado +x), em cm no espaço da pose T do modelo: nasce
// dentro do lábio de baixo, no canto da boca, e sobe curvando para fora e para a frente.
// [x, y, z, raio] — o tamanho estica o caminho a partir da base e engrossa junto.
const PRESA = [[3.0, 157.8, 12.4, 1.4], [3.5, 160.4, 15.5, 1.25], [4.1, 163.0, 16.5, 0.9], [4.5, 166.0, 16.7, 0]];
const LADOS_DA_PRESA = 5, MARFIM = ['#b9ad8c', '#e6dcc0', '#f4eedc', '#fbf8ee'];
const presas = new Map();
function geometriaDasPresas(tamanho, cabeca) {
  const tris = [], cores = [], cor = new THREE.Color();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), eixo = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3();
  for (const lado of [1, -1]) {
    // os anéis: em volta do caminho, de pé no eixo dele
    const aneis = PRESA.map(([x, y, z, r], i) => {
      const [x0, y0, z0] = PRESA[0], k = i ? tamanho : 1;
      a.set(lado * (x0 + (x - x0) * k), y0 + (y - y0) * k, z0 + (z - z0) * k);
      const [xa, ya, za] = PRESA[Math.max(0, i - 1)], [xb, yb, zb] = PRESA[Math.min(PRESA.length - 1, i + 1)];
      eixo.set(lado * (xb - xa), yb - ya, zb - za).normalize();
      u.set(1, 0, 0).addScaledVector(eixo, -eixo.x).normalize(); w.crossVectors(eixo, u);
      const raio = r * (0.75 + 0.25 * tamanho);
      return Array.from({ length: LADOS_DA_PRESA }, (_, j) => {
        const t = (j / LADOS_DA_PRESA) * Math.PI * 2;
        return a.clone().addScaledVector(u, Math.cos(t) * raio).addScaledVector(w, Math.sin(t) * raio);
      });
    });
    for (let i = 0; i < aneis.length - 1; i++) for (let j = 0; j < LADOS_DA_PRESA; j++) {
      const j2 = (j + 1) % LADOS_DA_PRESA, p = [aneis[i][j], aneis[i][j2], aneis[i + 1][j2], aneis[i + 1][j]];
      const c = [i, i, i + 1, i + 1];
      // (a ordem dos triângulos vira com o lado, para a face ficar para fora nas duas)
      for (const t of lado > 0 ? [[0, 1, 2], [0, 2, 3]] : [[0, 2, 1], [0, 3, 2]]) {
        if (i === aneis.length - 2 && t.includes(3) && t.includes(2)) continue;   // a ponta é um ponto só
        for (const v of t) { tris.push(p[v].x, p[v].y, p[v].z); cor.set(MARFIM[c[v]]); cores.push(cor.r, cor.g, cor.b); }
      }
    }
  }
  return presaNaCabeca(tris, cores, cabeca, texelClaro(cabeca.material?.map) ?? [0.5, 0.5]);
}
/** Triângulos soltos (cm, pose T) → uma geometria presa ao osso da cabeça, com uma UV só. */
function presaNaCabeca(tris, cores, cabeca, uvDe) {
  const n = tris.length / 3, g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(tris, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  // os outros atributos no MESMO tipo dos da cabeça (o `mergeGeometries` recusa tipos diferentes)
  const igual = (nome) => { const m = cabeca.geometry.attributes[nome]; return new THREE.BufferAttribute(new m.array.constructor(n * m.itemSize), m.itemSize, m.normalized); };
  const osso = Math.max(0, cabeca.skeleton.bones.findIndex((o) => o.name === 'Head'));
  const uv = igual('uv'), si = igual('skinIndex'), sw = igual('skinWeight');
  for (let i = 0; i < n; i++) { uv.setXY(i, uvDe[0], uvDe[1]); si.setXYZW(i, osso, 0, 0, 0); sw.setXYZW(i, 1, 0, 0, 0); }
  g.setAttribute('uv', uv); g.setAttribute('skinIndex', si); g.setAttribute('skinWeight', sw);
  g.computeVertexNormals();   // sem índice: normal por face
  return g;
}

// ------------------------------------------------------------ as orelhas pontudas
// A orelha do lado +x (cm, pose T): a base, três pontos enterrados no lado da cabeça
// (frente-baixo, alto, trás), e a ponta, para cima, para trás e para fora. O tamanho
// estica a ponta a partir do meio da base.
const ORELHA = { base: [[9.6, 168.6, 3.2], [9.8, 175.2, 2.6], [9.4, 171.4, -3.4]], ponta: [16.2, 182.0, -7.0] };
const orelhas = new Map();
function geometriaDasOrelhas(tamanho, cabeca) {
  const tris = [], cores = [];
  for (const lado of [1, -1]) {
    const b = ORELHA.base.map(([x, y, z]) => new THREE.Vector3(lado * x, y, z));
    const meio = b[0].clone().add(b[1]).add(b[2]).multiplyScalar(1 / 3);
    const ponta = new THREE.Vector3(lado * ORELHA.ponta[0], ORELHA.ponta[1], ORELHA.ponta[2]).sub(meio).multiplyScalar(tamanho).add(meio);
    const n = new THREE.Vector3(), u = new THREE.Vector3(), w = new THREE.Vector3();
    for (let i = 0; i < 3; i++) {
      // cada face lateral, virada para FORA (para longe do terceiro ponto da base)
      let p = [b[i], b[(i + 1) % 3], ponta];
      n.crossVectors(u.subVectors(p[1], p[0]), w.subVectors(p[2], p[0]));
      if (n.dot(w.subVectors(b[(i + 2) % 3], p[0])) > 0) p = [p[1], p[0], p[2]];
      for (const v of p) { tris.push(v.x, v.y, v.z); cores.push(1, 1, 1); }
    }
  }
  // a UV de um ponto de PELE: o vértice da cabeça mais perto de onde a orelha nasce
  const pos = cabeca.geometry.attributes.position, uv = cabeca.geometry.attributes.uv;
  let perto = 0, d = Infinity;
  for (let i = 0; i < pos.count; i++) { const q = Math.hypot(pos.getX(i) - 10, pos.getY(i) - 172, pos.getZ(i)); if (q < d) { d = q; perto = i; } }
  return presaNaCabeca(tris, cores, cabeca, [uv.getX(perto), uv.getY(perto)]);
}
/**
 * As peças que a raça ACRESCENTA ao corpo (hoje, as presas), no formato da malha fundida
 * (`geometry`, `skeleton`, `material`, `name`). `pecas` são as do corpo do guerreiro.
 */
export function pecasDaRaca(raca, pecas) {
  const p = proporcoesDe(raca), cabeca = pecas.find((o) => o.name === 'head'), saida = [];
  if (!cabeca?.geometry.attributes.uv) return saida;
  const peca = (nome, tamanho, cache, fazer, pele = false) => {
    if (!(tamanho > 0.01)) return;
    const chave = tamanho.toFixed(2);
    if (!cache.has(chave)) cache.set(chave, fazer(tamanho, cabeca));
    // (o nome leva o tamanho: é a chave das peças tingidas, aparencia.js)
    saida.push({ name: `${nome}-${chave}`, geometry: cache.get(chave), skeleton: cabeca.skeleton, material: cabeca.material, bindMatrix: cabeca.bindMatrix, pele });
  };
  peca('presas', p.presas, presas, geometriaDasPresas);
  peca('orelhas', p.orelhas, orelhas, geometriaDasOrelhas, true);   // `pele`: tingidas com a cor da pele
  return saida;
}

/**
 * Engrossa a malha fundida do corpo pelas proporções da raça (muda a geometria NO LUGAR).
 * `ordem` e `inversos` são os ossos do esqueleto único (nomes e inversos de ligação) e
 * `ligacao` a matriz de ligação das peças: a conta é feita no espaço em que os ossos
 * estão na pose T.
 */
export function deformar(geo, raca, ordem, inversos, ligacao) {
  const p = proporcoesDe(raca);
  const lugar = new Map(ordem.map((n, i) => [n, new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(inversos[i]).invert())]));
  const de = (n) => lugar.get(n);
  if (!de('Hips') || !de('Head') || !de('ArmL') || !de('ArmR') || !de('Footl') || !de('ToeL')) return;   // outro esqueleto: fica como é
  // os eixos do corpo na pose T: para cima, para o lado e para a frente (a ponta do pé)
  const cima = de('Head').clone().sub(de('Hips')).normalize();
  const lado = de('ArmL').clone().sub(de('ArmR'));
  lado.addScaledVector(cima, -lado.dot(cima)).normalize();
  const frente = new THREE.Vector3().crossVectors(lado, cima).normalize();
  if (frente.dot(de('ToeL').clone().sub(de('Footl'))) < 0) frente.negate();

  // a regra de cada osso: { a: de onde cresce, d: o eixo (null = a partir do ponto),
  // s: [lado, cima, frente], tras: o fator do fundo para quem está ATRÁS do eixo }
  const regras = new Array(ordem.length).fill(null);
  const por = (nomes, regra) => {
    for (const n of nomes) ordem.forEach((o, i) => { if (typeof n === 'string' ? o === n : n.test(o)) regras[i] = typeof regra === 'function' ? regra(o) : regra; });
  };
  const um = (v) => Math.abs(v - 1) < 1e-4;
  // o tronco: em volta da linha da coluna (de pé), a largura e o fundo separados
  const tronco = (raiz, largura, fundo, tras = fundo) => (um(largura) && um(fundo) && um(tras) ? null : { a: de(raiz), d: cima, s: [largura, 1, fundo], tras });
  por(['Hips'], tronco('Hips', p.quadril, p.quadril));
  por(['Spine003', 'Spine002'], tronco('Spine003', p.barrigaLargura, p.barrigaFrente, 1 + (p.barrigaFrente - 1) * 0.25));
  por(['Spine001', 'Spine', 'CollarL', 'CollarR'], tronco('Spine001', p.peitoLargura, p.peitoFundo));
  // os membros: cada osso em volta do próprio eixo (dele até o filho)
  const membro = (filho, g) => (o) => {
    const f = de(filho(o));
    return um(g) || !f ? null : { a: de(o), d: f.clone().sub(de(o)).normalize(), s: [g, g, g], tras: g };
  };
  por(['Neck'], membro(() => 'Head', p.pescoco));
  por(['ArmL', 'ArmR'], membro((o) => `Elbow${o.slice(-1)}`, p.bracos));
  por(['ElbowL', 'ElbowR'], membro((o) => `Hand${o.slice(-1)}`, p.antebracos));
  por(['Thighl', 'Thighr'], membro((o) => `Shin${o.slice(-1)}`, p.coxas));
  por(['Shinl', 'Shinr'], membro((o) => `Foot${o.slice(-1)}`, p.canelas));
  // a cabeça cresce inteira a partir da junta; os pés só no chão (não afundam). As MÃOS
  // não são aqui: é a escala do osso (`aplicarRaca`), senão os dedos esticam ao fechar
  const ponto = (raiz, s) => (s.every(um) ? null : { a: de(raiz), d: null, s, tras: s[2] });
  por(['Head'], ponto('Head', [p.cabeca, p.cabeca, p.cabeca]));
  for (const l of ['l', 'r']) por([`Foot${l}`, `Toe${l.toUpperCase()}`], ponto(`Foot${l}`, [p.pes, 1, p.pes]));
  if (!regras.some(Boolean)) return;

  const pos = geo.attributes.position, nor = geo.attributes.normal, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
  const volta = new THREE.Matrix4().copy(ligacao).invert();
  const v = new THREE.Vector3(), n = new THREE.Vector3(), r = new THREE.Vector3(), somaV = new THREE.Vector3(), somaN = new THREE.Vector3();
  const normalIda = new THREE.Matrix3().getNormalMatrix(ligacao), normalVolta = new THREE.Matrix3().getNormalMatrix(volta);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(ligacao);
    if (nor) n.fromBufferAttribute(nor, i).applyMatrix3(normalIda).normalize();
    somaV.set(0, 0, 0); somaN.set(0, 0, 0);
    let peso = 0;
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (!w) continue;
      peso += w;
      const g = regras[si.getComponent(i, k)];
      if (!g) { somaV.addScaledVector(v, w); somaN.addScaledVector(n, w); continue; }
      // o vértice visto do osso, sem a parte que corre AO LONGO do eixo (essa não cresce)
      r.subVectors(v, g.a);
      if (g.d) r.addScaledVector(g.d, -r.dot(g.d));
      const x = r.dot(lado), y = r.dot(cima), z = r.dot(frente), sz = z < 0 ? g.tras : g.s[2];
      somaV.addScaledVector(v, w).addScaledVector(lado, w * x * (g.s[0] - 1)).addScaledVector(cima, w * y * (g.s[1] - 1)).addScaledVector(frente, w * z * (sz - 1));
      // a normal: cada parte dividida pelo que aquela direção cresceu
      const nx = n.dot(lado), ny = n.dot(cima), nz = n.dot(frente);
      somaN.addScaledVector(n, w).addScaledVector(lado, w * nx * (1 / g.s[0] - 1)).addScaledVector(cima, w * ny * (1 / g.s[1] - 1)).addScaledVector(frente, w * nz * (1 / sz - 1));
    }
    if (!peso) continue;
    somaV.multiplyScalar(1 / peso).applyMatrix4(volta);
    pos.setXYZ(i, somaV.x, somaV.y, somaV.z);
    if (nor) { somaN.applyMatrix3(normalVolta).normalize(); nor.setXYZ(i, somaN.x, somaN.y, somaN.z); }
  }
  pos.needsUpdate = true;
  if (nor) nor.needsUpdate = true;
  geo.boundingBox = null; geo.boundingSphere = null;
}
