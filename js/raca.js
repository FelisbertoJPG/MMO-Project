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
 *     cresce para a frente); cabeça, mãos e pés crescem a partir da junta. É feito uma
 *     vez por corpo, e a armadura (do pacote ou pintada) cresce junto: é a mesma malha.
 *  2. NOS OSSOS (`CorpoGuerreiro.aplicarRaca`): a ALTURA (a cena inteira), os OMBROS (os
 *     braços nascem mais para fora) e o QUADRIL (as coxas se afastam com a largura dele).
 * As animações não mudam: o retarget só copia giros.
 */
import * as THREE from 'three';
import { Assets } from './assets.js';

// [chave, rótulo, mínimo, máximo] — a tela Raças do editor monta os controles por aqui
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
];

/** A raça de número `n` (o dígito da aparência): null = humano, ou raça que não existe mais. */
export const racaDe = (n) => (n > 0 ? Assets.racas?.[n - 1] ?? null : null);
/** As proporções completas de uma raça (o que falta, ou está torto, vale 1). */
export function proporcoesDe(raca) {
  const p = {};
  for (const [k, , min, max] of PROPORCOES) {
    const v = raca?.proporcoes?.[k];
    p[k] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : 1;
  }
  return p;
}
/** Uma raça nova, igual ao humano (o ponto de partida do editor). */
export const racaNova = (id, nome) => ({
  id, nome, jogavel: false, pele: null, olhos: null, semCabelo: false, semBarba: false,
  proporcoes: Object.fromEntries(PROPORCOES.map(([k]) => [k, 1])),
});

const DEDOS = ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky'];
const maoE = (lado) => [`Hand${lado}`, ...DEDOS.flatMap((d) => ['', '001', '002'].map((f) => new RegExp(`^${d}${lado}${f}$`, 'i')))];

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
  // cabeça e mãos: crescem inteiras a partir da junta; os pés só no chão (não afundam)
  const ponto = (raiz, s) => (s.every(um) ? null : { a: de(raiz), d: null, s, tras: s[2] });
  por(['Head'], ponto('Head', [p.cabeca, p.cabeca, p.cabeca]));
  for (const l of ['L', 'R']) por(maoE(l), ponto(`Hand${l}`, [p.maos, p.maos, p.maos]));
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
