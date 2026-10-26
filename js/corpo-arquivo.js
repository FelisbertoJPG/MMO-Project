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
