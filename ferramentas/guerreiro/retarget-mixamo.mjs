// Uma animação do MIXAMO → um clipe no esqueleto do JOGO (o manequim UAL), em
// assets/animacoes/<nome>.json (AnimationClip.toJSON). O jogo carrega a lista
// ANIMACOES do assets.js para Assets.clips, e o guerreiro copia o manequim como
// sempre (guerreiro.js) — nada mais muda.
//
// Uso (desta pasta):
//   node retarget-mixamo.mjs "<animação.fbx>" ../../assets/characters/UAL1.glb <NomeDoClipe> ../../assets/animacoes/<arquivo>.json [--endireitar=0.6]
//
// `--endireitar=k` (0 a 1) tira a corcunda: o giro que o quadril, a coluna, o pescoço e a cabeça
// fizeram desde a pose T (que é ereta) é reduzido em k. Os braços guardam o giro que
// tinham no mundo (as mãos não se soltam do cabo, só acompanham o peito).
//
// A conta (os dois esqueletos estão na pose T no arquivo): para cada osso UAL com
// par no Mixamo, o giro que o osso Mixamo fez desde a pose T, NO MUNDO, é aplicado
// ao osso UAL (UAL = Mixamo(t) × Mixamo(T)⁻¹ × UAL(T)); os sem par seguem o pai na
// pose de repouso. O quadril leva também o deslocamento, na proporção das alturas.
import fs from 'node:fs';
globalThis.self = globalThis; globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, getContext: () => null }) };
const THREE = await import('./three.module.min.js');
const { FBXLoader } = await import('./addons/FBXLoader.js');
THREE.TextureLoader.prototype.load = function () { return new THREE.Texture(); };
console.warn = () => {};

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const [FBX, UAL, NOME, SAIDA] = args;
const ENDIREITAR = Number(process.argv.find((a) => a.startsWith('--endireitar='))?.split('=')[1] ?? 0);
const COLUNA = new Set(['pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head']);
if (!SAIDA) { console.log('uso: node retarget-mixamo.mjs <anim.fbx> <UAL1.glb> <NomeDoClipe> <saida.json>'); process.exit(1); }

// ---- o Mixamo, com a animação
const buf = fs.readFileSync(FBX);
const mix = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
const clipeMix = mix.animations[0];

// ---- o UAL: só a árvore de nós do glTF (a pose de repouso), sem malha nem textura
const glb = fs.readFileSync(UAL);
const j = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)));
const nos = j.nodes.map((n) => {
  const o = n.skin !== undefined || n.mesh !== undefined ? new THREE.Object3D() : new THREE.Bone();
  o.name = n.name ?? '';
  if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
  if (n.translation) o.position.fromArray(n.translation);
  if (n.rotation) o.quaternion.fromArray(n.rotation);
  if (n.scale) o.scale.fromArray(n.scale);
  return o;
});
j.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => nos[i].add(nos[c])));
const ual = new THREE.Group();
for (const i of j.scenes[j.scene ?? 0].nodes) ual.add(nos[i]);
ual.updateMatrixWorld(true);
const osso = (n) => ual.getObjectByName(n);

// ---- os pares: osso UAL → osso Mixamo
const PARES = {
  pelvis: 'Hips', spine_01: 'Spine', spine_02: 'Spine1', spine_03: 'Spine2', neck_01: 'Neck', Head: 'Head',
};
for (const [l, L] of [['l', 'Left'], ['r', 'Right']]) {
  Object.assign(PARES, {
    [`clavicle_${l}`]: `${L}Shoulder`, [`upperarm_${l}`]: `${L}Arm`, [`lowerarm_${l}`]: `${L}ForeArm`, [`hand_${l}`]: `${L}Hand`,
    [`thigh_${l}`]: `${L}UpLeg`, [`calf_${l}`]: `${L}Leg`, [`foot_${l}`]: `${L}Foot`, [`ball_${l}`]: `${L}ToeBase`,
  });
  for (const [u, m] of [['thumb', 'Thumb'], ['index', 'Index'], ['middle', 'Middle'], ['ring', 'Ring'], ['pinky', 'Pinky']])
    for (const k of [1, 2, 3]) PARES[`${u}_0${k}_${l}`] = `${L}Hand${m}${k}`;
}
const mixOsso = (n) => mix.getObjectByName(`mixamorig${n}`) ?? mix.getObjectByName(`mixamorig:${n}`);

// ---- as poses T (no mundo) dos dois
mix.updateMatrixWorld(true);
const q = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const tMix = {}, tUal = {};
for (const [u, m] of Object.entries(PARES)) {
  const a = osso(u), b = mixOsso(m);
  if (!a || !b) { console.log(`  (sem par: ${u} ↔ ${m})`); continue; }
  tUal[u] = q(a); tMix[u] = q(b);
}
// a ordem do UAL, pai antes do filho, e a pose de repouso local de cada um
const ordem = []; ual.traverse((o) => { if (o.isBone) ordem.push(o); });
const restoLocal = new Map(ordem.map((o) => [o, o.quaternion.clone()]));
const pelvis = osso('pelvis'), hips = mixOsso('Hips');
const pelvisT = pelvis.getWorldPosition(new THREE.Vector3()), hipsT = hips.getWorldPosition(new THREE.Vector3());
const proporcao = pelvisT.y / hipsT.y;

// ---- amostrar o Mixamo a 30 quadros/s e montar as trilhas do UAL
const mixer = new THREE.AnimationMixer(mix);
const acao = mixer.clipAction(clipeMix); acao.play();
const FPS = 30, n = Math.max(2, Math.round(clipeMix.duration * FPS) + 1);
const tempos = [], quats = new Map(ordem.map((o) => [o.name, []])), posPelvis = [];
const mundo = new Map();
for (let f = 0; f < n; f++) {
  const t = Math.min(clipeMix.duration, f / FPS);
  mixer.setTime(t); mix.updateMatrixWorld(true);
  tempos.push(t);
  mundo.clear();
  for (const o of ordem) {
    const paiQ = o.parent?.isBone ? mundo.get(o.parent) : q(o.parent);   // o pai que não é osso fica parado
    let w;
    if (tUal[o.name]) {
      // D = o giro desde a pose T, no mundo; na coluna, reduzido (endireitar)
      const D = q(mixOsso(PARES[o.name])).multiply(tMix[o.name].clone().invert());
      if (ENDIREITAR && COLUNA.has(o.name)) D.slerp(new THREE.Quaternion(), ENDIREITAR);
      w = D.multiply(tUal[o.name]);
    }
    else w = paiQ.clone().multiply(restoLocal.get(o));
    mundo.set(o, w);
    const local = paiQ.clone().invert().multiply(w);
    quats.get(o.name).push(...local.toArray());
  }
  // o quadril: o deslocamento do Mixamo desde a pose T, na proporção, no espaço do pai do pelvis
  const d = hips.getWorldPosition(new THREE.Vector3()).sub(hipsT).multiplyScalar(proporcao).add(pelvisT);
  const pai = pelvis.parent; pai.updateMatrixWorld(true);
  posPelvis.push(...d.applyMatrix4(pai.matrixWorld.clone().invert()).toArray());
}
// a postura no meio do clipe (o quanto o tronco e a cabeça inclinam)
{
  const f = Math.floor(n * 0.3);
  ual.updateMatrixWorld(true);
  for (const o of ordem) { const a = quats.get(o.name); o.quaternion.fromArray(a, f * 4); }
  pelvis.position.fromArray(posPelvis, f * 3);
  ual.updateMatrixWorld(true);
  const P = (nm) => osso(nm).getWorldPosition(new THREE.Vector3());
  const ang = (a, b) => { const d = b.clone().sub(a); return (Math.atan2(Math.hypot(d.x, d.z), d.y) * 180 / Math.PI).toFixed(1) + '°'; };
  console.log(`  postura: quadril→peito ${ang(P('pelvis'), P('spine_03'))} | peito→cabeça ${ang(P('spine_03'), P('Head'))} | quadril→cabeça ${ang(P('pelvis'), P('Head'))} (0° = ereto)`);
}
const trilhas = [];
for (const o of ordem) if (tUal[o.name] || o === pelvis) trilhas.push(new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, tempos, quats.get(o.name)));
trilhas.push(new THREE.VectorKeyframeTrack(`${pelvis.name}.position`, tempos, posPelvis));
const clipe = new THREE.AnimationClip(NOME, clipeMix.duration, trilhas);
fs.mkdirSync(new URL('.', 'file:///' + SAIDA.replace(/\\/g, '/')).pathname.replace(/^\/([A-Z]:)/, '$1'), { recursive: true });
fs.writeFileSync(SAIDA, JSON.stringify(THREE.AnimationClip.toJSON(clipe)));
console.log(`${NOME}: ${clipe.duration.toFixed(2)} s, ${trilhas.length} trilhas, ${n} quadros → ${SAIDA} (${(fs.statSync(SAIDA).size / 1024 | 0)} KB)`);
