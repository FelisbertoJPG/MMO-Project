/**
 * O ESQUELETO DESMONTADO (16/10/2026) — o esqueleto vencido não afunda inteiro: ele DESMONTA, e
 * as partes dele (o crânio com o elmo, o peito, a bacia, os braços, os antebraços com a mão, as
 * coxas, as canelas com o pé, a arma, o escudo) caem soltas e ficam espalhadas no chão.
 *
 * `desmontar(modelo, world, origem)`: no instante em que é chamado, cada triângulo da armadura
 * fundida (character.js `fundirTraje`: cada vértice preso a UM osso) vai para a PARTE do osso dele
 * (`parteDoOsso`), já na POSE de agora (os vértices "assados" pelos ossos, como o `congelar` dos
 * cadáveres); as peças rígidas (os olhos, a arma, o escudo) vão inteiras. Cada parte vira uma
 * peça sem ossos, com os MESMOS materiais (nada a compilar), e voa pela física dos pedaços do
 * mundo (`World.pedacos`: cai, quica, para; some afundando depois de `vida` s). As geometrias são
 * só desta morte: o mundo as descarta junto com a peça (`descartar`).
 */
import * as THREE from 'three';

/** A parte do corpo de cada osso do manequim (UAL): os dedos vão com a mão, a mão com o antebraço… */
export function parteDoOsso(nome) {
  const n = nome.toLowerCase();
  const lado = /(_l|\.l|left)(_|$|\d)/.test(n) ? 'l' : /(_r|\.r|right)(_|$|\d)/.test(n) ? 'r' : '';
  if (/head|neck/.test(n)) return 'cabeca';
  if (/upperarm/.test(n)) return `braco_${lado}`;
  if (/lowerarm|hand|thumb|index|middle|ring|pinky/.test(n)) return `antebraco_${lado}`;
  if (/thigh/.test(n)) return `coxa_${lado}`;
  if (/calf|foot|ball|toe/.test(n)) return `canela_${lado}`;
  if (/clavicle|spine_0?[23]|spine[23]/.test(n)) return 'peito';
  return 'bacia';
}

const VIDA = 25;   // segundos no chão antes de afundar

export function desmontar(modelo, world, origem = null) {
  const raiz = modelo.root;
  raiz.updateMatrixWorld(true);
  const slots = [modelo.slotR, modelo.slotL, modelo.slotCostas].filter(Boolean);
  // parte → material → { pos: [], uv: [], cor: [] } (no MUNDO)
  const partes = new Map();
  const balde = (parte, mat) => {
    if (!partes.has(parte)) partes.set(parte, new Map());
    const m = partes.get(parte);
    if (!m.has(mat)) m.set(mat, { pos: [], uv: [], cor: [] });
    return m.get(mat);
  };
  const v = new THREE.Vector3();
  const visivel = (o) => { for (let p = o; p && p !== raiz.parent; p = p.parent) if (!p.visible) return false; return true; };
  raiz.traverse((o) => {
    if (!o.isMesh || !visivel(o) || Array.isArray(o.material)) return;
    const g = o.geometry, pos = g.attributes.position;
    if (!pos) return;
    const uv = g.attributes.uv, cor = g.attributes.color, idx = g.index, total = idx ? idx.count : pos.count;
    const vert = (i, b) => {
      v.fromBufferAttribute(pos, i);
      if (o.isSkinnedMesh) o.applyBoneTransform(i, v);
      v.applyMatrix4(o.matrixWorld);
      b.pos.push(v.x, v.y, v.z);
      b.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      b.cor.push(cor ? cor.getX(i) : 1, cor ? cor.getY(i) : 1, cor ? cor.getZ(i) : 1);
    };
    let parteRigida = null;
    if (!o.isSkinnedMesh) {
      // a arma e o escudo: cada um uma peça; o resto (os olhos), a parte do osso em que está
      const slot = slots.find((s) => { for (let p = o; p; p = p.parent) if (p === s) return true; return false; });
      if (slot) parteRigida = slot === modelo.slotR ? 'arma' : 'escudo';
      else { let osso = o.parent; while (osso && !osso.isBone) osso = osso.parent; parteRigida = osso ? parteDoOsso(osso.name) : 'bacia'; }
    }
    const si = g.attributes.skinIndex, ossos = o.skeleton?.bones;
    for (let t = 0; t + 2 < total; t += 3) {
      const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
      const parte = parteRigida ?? parteDoOsso(ossos?.[si.getX(i0)]?.name ?? '');
      const b = balde(parte, o.material);
      vert(i0, b); vert(i1, b); vert(i2, b);
    }
  });
  if (!partes.size) return 0;
  // o meio do corpo (para as partes caírem para longe dele) e o empurrão de quem matou
  const caixaCorpo = new THREE.Box3().setFromObject(raiz), meioCorpo = caixaCorpo.getCenter(new THREE.Vector3());
  const de = origem ? new THREE.Vector3(meioCorpo.x - origem.x, 0, meioCorpo.z - origem.z) : new THREE.Vector3();
  if (de.lengthSq() > 1e-6) de.normalize();
  world.pedacos ??= [];
  let n = 0;
  for (const mats of partes.values()) {
    const caixa = new THREE.Box3();
    for (const b of mats.values()) for (let i = 0; i < b.pos.length; i += 3) caixa.expandByPoint(v.set(b.pos[i], b.pos[i + 1], b.pos[i + 2]));
    const centro = caixa.getCenter(new THREE.Vector3()), tam = caixa.getSize(new THREE.Vector3());
    const peca = new THREE.Group();
    peca.position.copy(centro);
    for (const [mat, b] of mats) {
      for (let i = 0; i < b.pos.length; i += 3) { b.pos[i] -= centro.x; b.pos[i + 1] -= centro.y; b.pos[i + 2] -= centro.z; }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      if (mat.vertexColors) geo.setAttribute('color', new THREE.Float32BufferAttribute(b.cor, 3));
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const malha = new THREE.Mesh(geo, mat);
      malha.castShadow = true; malha.receiveShadow = true;
      peca.add(malha);
    }
    world.scene.add(peca);
    // desaba: um pouco para cima, para longe do meio do corpo e de quem bateu, girando
    const fora = centro.clone().sub(meioCorpo).setY(0);
    if (fora.lengthSq() > 1e-6) fora.normalize();
    const vel = new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.8 + Math.random() * 2.2, (Math.random() - 0.5) * 1.6)
      .addScaledVector(fora, 1.4).addScaledVector(de, 2.2);
    const giro = new THREE.Vector3((Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9);
    const meia = THREE.MathUtils.clamp(Math.min(tam.x, tam.y, tam.z) / 2, 0.03, 0.2);
    world.pedacos.push({ m: peca, vel, giro, t: 0, meia, vida: VIDA, descartar: true });
    n++;
  }
  return n;
}
