/**
 * COMER E BEBER (05/10/2026) — as animações `Comer` e `Beber`, que os pacotes não têm (o
 * `Consume` do UAL é um gesto na altura do peito: a mão nunca chega à boca). Elas são
 * "assadas" em `AnimationClip`s de verdade no carregamento (`assarRefeicoes`, depois do
 * `Assets.load`) e entram em `Assets.clips` como qualquer outra: o guerreiro copia o
 * manequim, o jogador remoto toca pelo nome, nada mais precisa saber delas.
 *
 * Como: num manequim UAL clonado, quadro a quadro (30/s), a pose de PARADO (`Idle_Loop`)
 * + a mão ESQUERDA (a direita segura a arma) levada à boca por IK de dois ossos, com os
 * dedos fechados (a pegada da tocha) e a cabeça acompanhando:
 *  - COMER: sobe, dá `MORDIDAS` (a mão afasta e volta; a cabeça vem ao encontro) e desce;
 *  - BEBER: sobe, inclina a cabeça para trás devagar (o copo vai junto), uns goles, desce.
 * A boca é um ponto no referencial da CABEÇA (`BOCA`). Tudo aqui é número para ajustar.
 *
 * O que vai na mão (`objetoDaRefeicao`) o `Player` põe na esquerda enquanto come/bebe e
 * devolve o equipamento no fim.
 */
import * as THREE from 'three';
import { clone as clonar } from '../vendor/jsm/utils/SkeletonUtils.js';
import { Assets } from './assets.js';

const FPS = 30;
export const DURACAO = { Comer: 2.0, Beber: 1.8 };
const MORDIDAS = 3;
// a boca no referencial do osso da cabeça (m): um pouco acima do pivô e à frente
const BOCA = new THREE.Vector3(0, 0.05, 0.13);
const DEDOS_L = ['thumb', 'index', 'middle', 'ring', 'pinky'].flatMap((d) => [1, 2, 3].map((i) => `${d}_0${i}_l`));

const _q = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qm = new THREE.Quaternion();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _ba = new THREE.Vector3(), _bc = new THREE.Vector3(), _ac = new THREE.Vector3(), _at = new THREE.Vector3(), _eixo = new THREE.Vector3();

/** gira um osso por um giro dado NO MUNDO (mantendo o resto da hierarquia) */
function girarNoMundo(osso, qMundo) {
  osso.getWorldQuaternion(_qm);
  osso.parent.getWorldQuaternion(_qp);
  osso.quaternion.copy(_qp.invert().multiply(_q.copy(qMundo).multiply(_qm)));
  osso.updateMatrixWorld(true);
}

/** IK de dois ossos (ombro A, cotovelo B, punho C) até `alvo`, cotovelo para o lado do `polo` */
function ik(A, B, C, alvo, polo) {
  A.getWorldPosition(_a); B.getWorldPosition(_b); C.getWorldPosition(_c);
  const lab = _a.distanceTo(_b), lcb = _b.distanceTo(_c);
  const lat = THREE.MathUtils.clamp(_a.distanceTo(alvo), Math.abs(lab - lcb) + 0.002, lab + lcb - 0.002);
  _ba.subVectors(_a, _b).normalize(); _bc.subVectors(_c, _b).normalize();
  const atual = Math.acos(THREE.MathUtils.clamp(_ba.dot(_bc), -1, 1));
  const quer = Math.acos(THREE.MathUtils.clamp((lab * lab + lcb * lcb - lat * lat) / (2 * lab * lcb), -1, 1));
  _eixo.crossVectors(_ba, _bc);
  if (_eixo.lengthSq() < 1e-10) _eixo.set(0, 1, 0).cross(_ba);
  girarNoMundo(B, new THREE.Quaternion().setFromAxisAngle(_eixo.normalize(), quer - atual));
  C.getWorldPosition(_c);
  _ac.subVectors(_c, _a).normalize(); _at.subVectors(alvo, _a).normalize();
  girarNoMundo(A, new THREE.Quaternion().setFromUnitVectors(_ac, _at));
  // o polo: gira o braço em volta da reta ombro→alvo até o cotovelo ficar do lado dele
  B.getWorldPosition(_b);
  const pb = _b.clone().sub(_a).addScaledVector(_at, -_b.clone().sub(_a).dot(_at));
  const pp = polo.clone().sub(_a).addScaledVector(_at, -polo.clone().sub(_a).dot(_at));
  if (pb.lengthSq() < 1e-8 || pp.lengthSq() < 1e-8) return;
  pb.normalize(); pp.normalize();
  girarNoMundo(A, new THREE.Quaternion().setFromAxisAngle(_at, Math.atan2(_eixo.crossVectors(pb, pp).dot(_at), pb.dot(pp))));
}

const suave = (x) => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };

function assar(nome) {
  const D = DURACAO[nome], N = Math.round(D * FPS);
  const fonte = clonar(Assets.baseScene);
  const mixer = new THREE.AnimationMixer(fonte);
  mixer.clipAction(Assets.clips.Idle_Loop).play();
  // os dedos fechados: a pose da mão esquerda segurando a tocha
  const dedos = new Map();
  if (Assets.clips.Idle_Torch_Loop) {
    const outra = clonar(Assets.baseScene), m2 = new THREE.AnimationMixer(outra);
    m2.clipAction(Assets.clips.Idle_Torch_Loop).play(); m2.setTime(0.2);
    for (const n of DEDOS_L) { const o = outra.getObjectByName(n); if (o) dedos.set(n, o.quaternion.clone()); }
  }
  const osso = (n) => fonte.getObjectByName(n);
  const [A, B, C, cab, pescoco] = ['upperarm_l', 'lowerarm_l', 'hand_l', 'Head', 'neck_01'].map(osso);
  const ossos = [];
  fonte.traverse((o) => { if (o.isBone) ossos.push(o); });
  const tempos = new Float32Array(N + 1), giros = ossos.map(() => new Float32Array((N + 1) * 4));
  const pelvis = osso('pelvis'), posPelvis = new Float32Array((N + 1) * 3);
  const repouso = new THREE.Vector3(), boca = new THREE.Vector3(), alvo = new THREE.Vector3(), polo = new THREE.Vector3(), frente = new THREE.Vector3();
  const X = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= N; i++) {
    const t = i / FPS, u = t / D;
    mixer.setTime(t);
    fonte.updateMatrixWorld(true);
    // subir (0–28%), segurar, descer (78–100%)
    const w = suave(u / 0.28) * (1 - suave((u - 0.78) / 0.22));
    const meio = THREE.MathUtils.clamp((u - 0.28) / 0.5, 0, 1);
    // a CABEÇA: ao comer vem ao encontro de cada mordida; ao beber inclina para trás
    let mordida = 0, cabeca = 0;
    if (nome === 'Comer') {
      mordida = meio > 0 && meio < 1 ? Math.sin(Math.PI * MORDIDAS * meio) ** 2 : 0;
      cabeca = 0.14 * mordida * w;
    } else {
      cabeca = -0.42 * suave(meio * 1.6) * w + 0.035 * Math.sin(Math.PI * 6 * meio) * w;
    }
    if (cab && cabeca) cab.quaternion.multiply(_q.setFromAxisAngle(X, cabeca));
    if (pescoco && cabeca) pescoco.quaternion.multiply(_q.setFromAxisAngle(X, cabeca * 0.35));
    fonte.updateMatrixWorld(true);
    // os dedos fechados (o que vai na mão)
    for (const [n, q] of dedos) { const o = osso(n); o.quaternion.slerp(q, Math.min(1, w * 1.5)); }
    // a MÃO à boca: afastada nas pausas entre as mordidas, encostada ao beber
    C.getWorldPosition(repouso);
    boca.copy(BOCA).applyMatrix4(cab.matrixWorld);
    frente.set(0, 0, 1).applyQuaternion(cab.getWorldQuaternion(_qm)).setY(0).normalize();
    // a mão para À FRENTE da boca (o que ela segura fica entre a mão e a boca)
    const longe = nome === 'Comer' ? 0.13 + 0.1 * (1 - mordida) : 0.14;
    alvo.copy(boca).addScaledVector(frente, longe).addScaledVector(_c.set(0, -1, 0), 0.03);
    alvo.lerpVectors(repouso, alvo, w);
    if (w > 0.001) {
      A.getWorldPosition(polo);
      const lado = Math.sign(repouso.x - fonte.getWorldPosition(_b).x) || 1;
      polo.add(_b.set(0.35 * lado, -0.5, -0.1));
      ik(A, B, C, alvo, polo);
    }
    tempos[i] = t;
    ossos.forEach((o, k) => o.quaternion.toArray(giros[k], i * 4));
    if (pelvis) pelvis.position.toArray(posPelvis, i * 3);
  }
  const trilhas = ossos.map((o, k) => new THREE.QuaternionKeyframeTrack(`${o.name}.quaternion`, tempos, giros[k]));
  if (pelvis) trilhas.push(new THREE.VectorKeyframeTrack(`${pelvis.name}.position`, tempos, posPelvis));
  return new THREE.AnimationClip(nome, D, trilhas);
}

/** Assa `Comer` e `Beber` em Assets.clips (depois do Assets.load; sem o Idle_Loop, nada). */
export function assarRefeicoes() {
  if (!Assets.baseScene || !Assets.clips.Idle_Loop) return;
  for (const nome of Object.keys(DURACAO)) {
    try { Assets.clips[nome] = assar(nome); } catch (e) { console.warn(`[refeição] não assei ${nome}:`, e); }
  }
}

/** O que vai na mão esquerda ao comer (um naco) ou beber (um caneco de madeira). */
export function objetoDaRefeicao(bebida, cor = 0x8a5a2e) {
  const g = new THREE.Group();
  if (bebida) {
    const madeira = new THREE.MeshStandardMaterial({ color: 0x6a4424, roughness: 0.9 });
    const copo = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.038, 0.1, 8, 1, true), madeira);
    madeira.side = THREE.DoubleSide;
    const fundo = new THREE.Mesh(new THREE.CircleGeometry(0.038, 8).rotateX(Math.PI / 2), madeira);
    fundo.position.y = -0.05;
    const liquido = new THREE.Mesh(new THREE.CircleGeometry(0.04, 8).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: cor, roughness: 0.4 }));
    liquido.position.y = 0.03;
    g.add(copo, fundo, liquido);
  } else {
    const naco = new THREE.Mesh(new THREE.DodecahedronGeometry(0.05, 0), new THREE.MeshStandardMaterial({ color: cor, roughness: 0.9, flatShading: true }));
    naco.scale.set(1.3, 0.8, 1);
    g.add(naco);
  }
  // maior que a mão e um pouco para fora da palma: dentro do punho fechado não se via
  g.scale.setScalar(1.7);
  g.position.set(0, 0.04, 0.02);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
