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
 *     tronco, em volta da linha da coluna (a barriga cresce para a frente); a cabeça e
 *     os pés crescem a partir da junta. Em toda parte a LARGURA (o que se vê de frente)
 *     e a GROSSURA ou fundo (o que se vê de lado) são réguas separadas — com uma só, o
 *     braço do orc ficava forte de frente e fino de lado. É feito uma vez por corpo, e
 *     a armadura (do pacote ou pintada) cresce junto: é a mesma malha.
 *  2. NOS OSSOS (`CorpoGuerreiro.aplicarRaca`): a ALTURA (a cena inteira), os OMBROS (os
 *     braços nascem mais para fora), o QUADRIL (as coxas se afastam com a largura dele)
 *     e as MÃOS — a escala do osso da mão, que os dedos herdam. (Na malha, a mão crescia
 *     e as juntas dos dedos ficavam onde estavam: ao fechar a mão os dedos esticavam
 *     como espaguete.)
 * As animações não mudam: o retarget só copia giros.
 *
 * AS PRESAS (`pecasDaRaca`): um par de dentes que sobe do maxilar de baixo, desenhado
 * em código e preso ao osso da cabeça — mais uma peça da malha fundida. `presas` é o
 * tamanho (0 = sem).
 *
 * AS ORELHAS (`moldarPeca`, `ORELHA`): NÃO se acrescenta orelha — o modelo já tem uma (uma
 * abinha na peça `Face`; um par a mais por cima dava quatro). `orelhas` ESTICA a que há: o
 * canto de cima e de fora dela é puxado para cima, para trás e para fora, até virar ponta.
 * É feito na peça, antes de fundir (na malha fundida não dá para saber o que é orelha e o
 * que é cabelo ao lado dela), e só SEM elmo.
 */
import * as THREE from 'three';
import { Assets } from './assets.js';
import { texelClaro } from './casca.js';

// [chave, rótulo, mínimo, máximo, padrão (1 se não diz), segue] — a tela Raças do editor
// monta os controles por aqui. A LARGURA é o que se vê de FRENTE; a GROSSURA (o fundo), o
// que se vê de LADO. `segue`: de que chave vem o valor quando o arquivo não tem esta — as
// grossuras nasceram depois, e até então a régua da largura valia para as duas direções.
export const PROPORCOES = [
  ['altura', 'Altura', 0.8, 1.3],
  ['cabeca', 'Cabeça', 0.8, 1.4],
  ['pescoco', 'Pescoço — largura', 0.7, 1.8],
  ['pescocoGrossura', 'Pescoço — grossura', 0.7, 1.8, 1, 'pescoco'],
  ['ombros', 'Ombros — largura', 0.8, 1.5],
  ['ombrosGrossura', 'Ombros — grossura', 0.8, 1.8],
  ['peitoLargura', 'Peito — largura', 0.8, 1.6],
  ['peitoFundo', 'Peito — fundo', 0.8, 1.8],
  ['barrigaLargura', 'Barriga — largura', 0.8, 1.8],
  ['barrigaFrente', 'Barriga — para a frente', 0.8, 3],
  ['quadril', 'Quadril — largura', 0.8, 1.6],
  ['quadrilFundo', 'Quadril — fundo', 0.8, 1.8, 1, 'quadril'],
  ['bracos', 'Braços — largura', 0.7, 1.8],
  ['bracosGrossura', 'Braços — grossura', 0.7, 2.2, 1, 'bracos'],
  ['antebracos', 'Antebraços — largura', 0.7, 1.8],
  ['antebracosGrossura', 'Antebraços — grossura', 0.7, 2.2, 1, 'antebracos'],
  ['maos', 'Mãos', 0.8, 1.6],
  ['coxas', 'Coxas — largura', 0.7, 1.8],
  ['coxasGrossura', 'Coxas — grossura', 0.7, 1.8, 1, 'coxas'],
  ['canelas', 'Canelas — largura', 0.7, 1.8],
  ['canelasGrossura', 'Canelas — grossura', 0.7, 1.8, 1, 'canelas'],
  ['pes', 'Pés', 0.8, 1.6],
  ['presas', 'Presas (0 = sem)', 0, 2.5, 0],
  ['orelhas', 'Orelhas (esticadas)', 1, 3],
];

/** A raça de número `n` (o dígito da aparência): null = humano, ou raça que não existe mais. */
export const racaDe = (n) => (n > 0 ? Assets.racas?.[n - 1] ?? null : null);
/** As proporções completas de uma raça (o que falta, ou está torto, vale o padrão: o humano). */
export function proporcoesDe(raca) {
  const p = {}, tem = raca?.proporcoes;
  for (const [k, , min, max, padrao = 1, segue] of PROPORCOES) {
    const v = Number.isFinite(tem?.[k]) || !segue ? tem?.[k] : tem?.[segue];
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
  const uvDe = texelClaro(cabeca.material?.map) ?? [0.5, 0.5];
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

/**
 * As peças que a raça ACRESCENTA ao corpo (hoje, as presas), no formato da malha fundida
 * (`geometry`, `skeleton`, `material`, `name`). `pecas` são as do corpo do guerreiro.
 */
export function pecasDaRaca(raca, pecas) {
  const tamanho = proporcoesDe(raca).presas, cabeca = pecas.find((o) => o.name === 'head');
  if (!(tamanho > 0.01) || !cabeca?.geometry.attributes.uv) return [];
  const chave = tamanho.toFixed(2);
  if (!presas.has(chave)) presas.set(chave, geometriaDasPresas(tamanho, cabeca));
  return [{ name: 'presas', geometry: presas.get(chave), skeleton: cabeca.skeleton, material: cabeca.material, bindMatrix: cabeca.bindMatrix }];
}

// ------------------------------------------------------------ as orelhas
// A orelha do modelo (a do lado +x; cm, pose T) é uma abinha na peça `Face`: nasce no lado
// da cabeça (`raiz`) e sai para fora e para trás até a `borda`, com a ponta de BAIXO no
// lóbulo e o alto reto. Esticar é puxar o canto de cima e de fora na direção `ponta`
// (fora, cima, trás): cada vértice vai junto na medida em que está ALTO na orelha e LONGE
// da cabeça (`curva`: os expoentes das duas medidas) — o canto vira a ponta, a borda de
// trás e a de cima viram os dois lados dela, e o lóbulo e a raiz não saem do lugar.
// `passo`: quantos cm a ponta anda a cada 100% da régua.
export const ORELHA = {
  caixa: { x: 10.9, y: [164, 172.2], z: [-4.5, -1] },   // onde estão os vértices dela
  raiz: [10.6, -1.2], borda: [12.5, -3.8],              // (x, z)
  lobulo: 164.5, alto: 171.5,
  ponta: [0.5, 0.75, -0.43], passo: 6, curva: [1.5, 2],
};
const naPeca = (nome) => /^Face(_|$)/.test(nome);   // (a tingida chama-se `Face_tingido`)
/**
 * As proporções da raça que se fazem NA PEÇA, antes de fundir (hoje, as orelhas): muda a
 * geometria no lugar — quem chama dá uma cópia (guerreiro.js `geometriaFundida`).
 * Com ELMO a orelha fica como o modelo a tem: esticada, a ponta furava o elmo.
 */
export function moldarPeca(geo, nome, raca, elmo = false) {
  const quanto = proporcoesDe(raca).orelhas - 1;
  if (elmo || !naPeca(nome) || Math.abs(quanto) < 1e-3) return;
  const pos = geo.attributes.position, nor = geo.attributes.normal, o = ORELHA;
  const ax = o.borda[0] - o.raiz[0], az = o.borda[1] - o.raiz[1], comprimento = Math.hypot(ax, az);
  const dir = new THREE.Vector3(...o.ponta).normalize(), mexeu = new Uint8Array(pos.count);
  const entre = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), lado = Math.sign(x), fora = Math.abs(x);
    if (fora < o.caixa.x || y < o.caixa.y[0] || y > o.caixa.y[1] || z < o.caixa.z[0] || z > o.caixa.z[1]) continue;
    // quão longe da cabeça (ao longo da aba) e quão alto na orelha, de 0 a 1
    const longe = entre(((fora - o.raiz[0]) * ax + (z - o.raiz[1]) * az) / comprimento, 0, comprimento);
    const alto = entre(y, o.lobulo, o.alto);
    const d = longe ** o.curva[0] * alto ** o.curva[1] * quanto * o.passo;
    if (!d) continue;
    pos.setXYZ(i, x + lado * dir.x * d, y + dir.y * d, z + dir.z * d);
    mexeu[i] = 1;
  }
  pos.needsUpdate = true;
  // as normais das faces que mudaram (a peça não tem índice: cada triângulo tem os seus
  // três vértices, e a normal é a da face — o facetado do modelo)
  if (!nor || geo.index) return;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let t = 0; t < pos.count; t += 3) {
    if (!mexeu[t] && !mexeu[t + 1] && !mexeu[t + 2]) continue;
    a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1).sub(a); c.fromBufferAttribute(pos, t + 2).sub(a);
    b.cross(c).normalize();
    for (let k = 0; k < 3; k++) nor.setXYZ(t + k, b.x, b.y, b.z);
  }
  nor.needsUpdate = true;
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

  // a regra de cada osso: { a: de onde cresce, d: o eixo ao longo do qual NÃO cresce (null
  // = a partir do ponto), e: os três eixos da conta, s: quanto cresce em cada um, tras: o
  // fator do terceiro eixo para quem está ATRÁS (do lado negativo dele) }
  const corpo = [lado, cima, frente];
  const regras = new Array(ordem.length).fill(null);
  const por = (nomes, regra) => {
    for (const n of nomes) ordem.forEach((o, i) => { if (typeof n === 'string' ? o === n : n.test(o)) regras[i] = typeof regra === 'function' ? regra(o) : regra; });
  };
  const um = (v) => Math.abs(v - 1) < 1e-4;
  // o tronco: em volta da linha da coluna (de pé), a largura e o fundo separados
  const tronco = (raiz, largura, fundo, tras = fundo) => (um(largura) && um(fundo) && um(tras) ? null : { a: de(raiz), d: cima, e: corpo, s: [largura, 1, fundo], tras });
  por(['Hips'], tronco('Hips', p.quadril, p.quadrilFundo));
  por(['Spine003', 'Spine002'], tronco('Spine003', p.barrigaLargura, p.barrigaFrente, 1 + (p.barrigaFrente - 1) * 0.25));
  por(['Spine001', 'Spine'], tronco('Spine001', p.peitoLargura, p.peitoFundo));
  // os ombros (as clavículas) são do peito, com o fundo dele vezes a grossura deles
  por(['CollarL', 'CollarR'], tronco('Spine001', p.peitoLargura, p.peitoFundo * p.ombrosGrossura));
  // os membros: cada osso em volta do próprio eixo (dele até o filho), a LARGURA (o que se
  // vê de frente) e a GROSSURA (de lado) separadas. `ref` é a direção do corpo que dá a
  // largura: nas pernas e no pescoço, o lado; nos BRAÇOS, a de cima — na pose T o braço
  // está deitado, e o que ali é "para cima" é o que fica "para o lado" com o braço caído
  const membro = (filho, largura, grossura, ref) => (o) => {
    const f = de(filho(o));
    if ((um(largura) && um(grossura)) || !f) return null;
    const d = f.clone().sub(de(o)).normalize(), l = ref.clone().addScaledVector(d, -ref.dot(d)).normalize();
    return { a: de(o), d, e: [l, d, new THREE.Vector3().crossVectors(d, l)], s: [largura, 1, grossura], tras: grossura };
  };
  por(['Neck'], membro(() => 'Head', p.pescoco, p.pescocoGrossura, lado));
  por(['ArmL', 'ArmR'], membro((o) => `Elbow${o.slice(-1)}`, p.bracos, p.bracosGrossura, cima));
  por(['ElbowL', 'ElbowR'], membro((o) => `Hand${o.slice(-1)}`, p.antebracos, p.antebracosGrossura, cima));
  por(['Thighl', 'Thighr'], membro((o) => `Shin${o.slice(-1)}`, p.coxas, p.coxasGrossura, lado));
  por(['Shinl', 'Shinr'], membro((o) => `Foot${o.slice(-1)}`, p.canelas, p.canelasGrossura, lado));
  // a cabeça cresce inteira a partir da junta; os pés só no chão (não afundam). As MÃOS
  // não são aqui: é a escala do osso (`aplicarRaca`), senão os dedos esticam ao fechar
  const ponto = (raiz, s) => (s.every(um) ? null : { a: de(raiz), d: null, e: corpo, s, tras: s[2] });
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
      const e = g.e, x = r.dot(e[0]), y = r.dot(e[1]), z = r.dot(e[2]), sz = z < 0 ? g.tras : g.s[2];
      somaV.addScaledVector(v, w).addScaledVector(e[0], w * x * (g.s[0] - 1)).addScaledVector(e[1], w * y * (g.s[1] - 1)).addScaledVector(e[2], w * z * (sz - 1));
      // a normal: cada parte dividida pelo que aquela direção cresceu
      const nx = n.dot(e[0]), ny = n.dot(e[1]), nz = n.dot(e[2]);
      somaN.addScaledVector(n, w).addScaledVector(e[0], w * nx * (1 / g.s[0] - 1)).addScaledVector(e[1], w * ny * (1 / g.s[1] - 1)).addScaledVector(e[2], w * nz * (1 / sz - 1));
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
