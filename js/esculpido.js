// O CORPO ESCULPIDO (16/10/2026) — um personagem feito pelo CONTORNO de fotos
// (ferramentas/contorno/esculpir.mjs → assets/esculpidos/<nome>.glb), sem o arquivo original.
//
// O esqueleto do arquivo é o do manequim UAL com OUTRAS PROPORÇÕES: os mesmos 65 ossos, os
// mesmos nomes e os mesmos giros de repouso — só os comprimentos mudam (o Dennis é "chibi":
// cabeça grande, pernas curtas). Então as animações do jogo servem direto, sem manequim
// invisível nem retarget por quadro: cada clipe do UAL é ADAPTADO uma vez (`clipeAdaptado`,
// dividido por todos os bonecos do mesmo modelo) — os giros ficam como estão (o giro local de
// cada osso dá a mesma pose em qualquer comprimento) e só o deslocamento do quadril e da raiz
// encolhe na proporção da altura do quadril. Um esqueleto, um mixer e uma malha por boneco.
//
// O CAJADO vem solto no arquivo (em pé, a ponta no chão) e vai para a mão direita aqui: com o
// boneco parado (`Idle_Loop`), ele fica em pé ao lado do corpo, com a palma no meio dele; daí
// em diante acompanha a mão em toda animação.
//
// No jogo ele é uma RAÇA JOGÁVEL (`PersonagemEsculpido`, abaixo: o corpo de quem escolhe a
// raça dele). A vitrine do acampamento (16/10, o boneco passando pelas animações ao lado da
// fogueira) saiu quando ele virou raça; o `CorpoEsculpido` sozinho, com o mixer dele, serve
// para um NPC.
import * as THREE from 'three';
import { Assets, ESCULPIDOS } from './assets.js';
import { clone as cloneSkinned } from '../vendor/jsm/utils/SkeletonUtils.js';
import { Gear } from './gear.js';
import { lerAparencia } from './aparencia.js';
import { racaDe, esculpidoDe } from './raca.js';
import { armaduraDe, NU } from './guerreiro.js';

// os clipes do UAL adaptados a um modelo esculpido: fonte → (nome → clipe)
const adaptados = new WeakMap();
function clipeAdaptado(fonte, nome) {
  let mapa = adaptados.get(fonte);
  if (!mapa) {
    mapa = new Map();
    const ossos = new Set();
    fonte.traverse((o) => { if (o.isBone) ossos.add(o.name); });
    // a altura do quadril dos dois (no espaço da raiz, que é Z para cima): a proporção do passo
    const pu = Assets.baseScene.getObjectByName('pelvis').position, pc = fonte.getObjectByName('pelvis').position;
    mapa.ossos = ossos;
    mapa.k = pc.z / pu.z;
    mapa.resto = { pelvis: [pu, pc], root: [Assets.baseScene.getObjectByName('root').position, fonte.getObjectByName('root').position] };
    adaptados.set(fonte, mapa);
  }
  if (mapa.has(nome)) return mapa.get(nome);
  const orig = Assets.clips[nome];
  if (!orig) { mapa.set(nome, null); return null; }
  const trilhas = [];
  for (const t of orig.tracks) {
    const ponto = t.name.lastIndexOf('.'), osso = t.name.slice(0, ponto), prop = t.name.slice(ponto + 1);
    if (!mapa.ossos.has(osso)) continue;
    if (prop === 'quaternion') trilhas.push(t);
    else if (prop === 'position' && mapa.resto[osso]) {
      // o deslocamento desde o repouso, encolhido, somado ao repouso do esculpido
      const [ru, rc] = mapa.resto[osso], v = t.values.slice(), k = mapa.k;
      for (let i = 0; i < v.length; i += 3) {
        v[i] = rc.x + (v[i] - ru.x) * k; v[i + 1] = rc.y + (v[i + 1] - ru.y) * k; v[i + 2] = rc.z + (v[i + 2] - ru.z) * k;
      }
      trilhas.push(new THREE.VectorKeyframeTrack(t.name, t.times, v));
    }
    // (as outras posições e as escalas ficam as do esculpido: são elas que dão as proporções)
  }
  const clipe = new THREE.AnimationClip(nome, orig.duration, trilhas);
  mapa.set(nome, clipe);
  return clipe;
}

export class CorpoEsculpido {
  constructor(nome) {
    const fonte = Assets.esculpidos[nome];
    this.nome = nome;
    this.fonte = fonte;
    this.root = new THREE.Group();
    this.cena = cloneSkinned(fonte);
    this.root.add(this.cena);
    this.cena.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false;   // (a caixa da malha é a da pose T)
    });
    this.mixer = new THREE.AnimationMixer(this.cena);
    this.atual = null; this.nomeAtual = null;
    const cajado = this.cena.getObjectByName('Cajado');
    if (cajado) this.empunhar(cajado, 'hand_r');
  }

  /** a animação `nome` (um clipe do jogo, adaptado); como `CharacterModel.play` */
  play(nome, { fade = 0.25, loop = true, speed = 1 } = {}) {
    const clipe = clipeAdaptado(this.fonte, nome);
    if (!clipe) return null;
    const a = this.mixer.clipAction(clipe);
    if (this.atual === a) return a;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = speed;
    a.play();
    if (this.atual && fade > 0) a.crossFadeFrom(this.atual, fade, false);
    else this.atual?.stop();
    this.atual = a; this.nomeAtual = nome;
    return a;
  }

  duracao(nome) { return Assets.clips[nome]?.duration ?? 1; }

  update(dt) { this.mixer.update(dt); }

  // a peça solta (o cajado) vai para o osso da mão: em pé, a ponta no chão, a palma no meio
  // dela — medido na pose parada; daí em diante ela segue a mão
  empunhar(obj, nomeDoOsso) {
    const osso = this.cena.getObjectByName(nomeDoOsso);
    if (!osso) return;
    const a = this.play('Idle_Loop', { fade: 0 });
    if (a) { a.time = 0; this.mixer.update(0); }
    this.root.updateMatrixWorld(true);
    const palma = new THREE.Vector3().fromArray(obj.userData.palma ?? [0, 0.05, 0]).applyMatrix4(osso.matrixWorld);
    this.root.worldToLocal(palma);
    const emPe = new THREE.Matrix4().makeTranslation(palma.x, 0, palma.z);
    const m = new THREE.Matrix4().copy(osso.matrixWorld).invert().multiply(this.root.matrixWorld).multiply(emPe);
    m.decompose(obj.position, obj.quaternion, obj.scale);
    osso.add(obj);
  }
}

// A RAÇA ESCULPIDA (16/10/2026): o esculpido no lugar do guerreiro, como CORPO DE QUEM JOGA
// (o jogador e os outros jogadores: `CharacterModel.guerreiro`). A raça diz qual (`esculpido`
// no racas.json, raca.js `esculpidoDe`), e o código do corpo que viaja na rede já leva a raça:
// os outros o veem sem nada novo no protocolo.
//
// Como o guerreiro, ele SEGUE o manequim UAL, que continua animando invisível (golpes, janelas
// de acerto, a mão esquerda fechada, as correções de pose — tudo igual). Só que aqui não há
// retarget: os ossos têm os mesmos nomes e os mesmos giros de repouso, então cada osso COPIA o
// giro local do par dele, e o quadril e a raiz copiam o deslocamento, encolhido na proporção
// da altura do quadril (a conta do `clipeAdaptado`). As armas vão para os ossos dele com a
// mesma pegada (`pegada`, como a do guerreiro).
//
// O que ele NÃO faz: a armadura não aparece (o casaco é a roupa; a ficha conta igual), nem a
// aparência (pele, cabelo, barba, olhos: ele já vem pintado), nem as proporções, a modelagem,
// a pintura e a piscada da raça. O CAJADO fica na mão direita enquanto ela está vazia; com
// uma arma nela, ele some.
export const esculpidoDoCodigo = (armadura) => {
  if (armadura === false) return null;
  const a = lerAparencia(String(armadura ?? '').split(':')[1]);
  return esculpidoDe(racaDe(a.raca, a.sexo));
};

// um material próprio por boneco (o clarão de dano não acende os outros), com o céu de agora,
// como o do guerreiro
function materiaisProprios(cena) {
  const proprio = new Map();
  cena.traverse((o) => {
    if (!o.isMesh) return;
    if (!proprio.has(o.material)) {
      const m = o.material.clone();
      if (Gear.env) { m.envMap = Gear.env; m.envMapIntensity = 0.5; }
      proprio.set(o.material, m);
    }
    o.material = proprio.get(o.material);
  });
  return [...proprio.values()];
}

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
export class PersonagemEsculpido {
  constructor(modelo, armadura) {
    this.modelo = modelo;
    this.esculpido = esculpidoDoCodigo(armadura);
    this.corpo = new CorpoEsculpido(this.esculpido);
    this.corpo.mixer.stopAllAction();   // (o mixer dele só serviu para pôr o cajado na mão)
    this.cena = this.corpo.root;
    this.materiais = materiaisProprios(this.cena);
    for (const m of this.materiais) { modelo.flashMats.push(m); modelo.baseEmissive.push(m.emissive.clone()); }
    // o cajado num grupo próprio: é ele que some com uma arma na mão (o `visible` da malha
    // fica como está — o jogador remoto só tinge o que está à mostra)
    const cajado = this.cena.getObjectByName('Cajado');
    if (cajado) { this.mao = new THREE.Group(); cajado.parent.add(this.mao); this.mao.add(cajado); }
    this.vestir(armadura);

    // o manequim some (menos as armas: trocado com o jogo rodando, elas ainda estão nele)
    this.escondidos = [];
    const armas = new Set();
    for (const slot of [modelo.slotR, modelo.slotL, modelo.slotCostas]) slot?.traverse((o) => armas.add(o));
    modelo.scene.traverse((o) => { if (o.isMesh && o.visible && !armas.has(o)) { o.visible = false; this.escondidos.push(o); } });
    modelo.pivot.add(this.cena);

    // os pares de ossos (o dele ← o do manequim), e o quadril e a raiz, que andam
    const fonte = this.corpo.fonte, ual = modelo.scene, base = Assets.baseScene;
    this.pares = [];
    this.corpo.cena.traverse((o) => { const u = o.isBone && ual.getObjectByName(o.name); if (u?.isBone) this.pares.push(o, u); });
    this.k = fonte.getObjectByName('pelvis').position.z / base.getObjectByName('pelvis').position.z;
    this.andam = ['pelvis', 'root'].map((n) => ({
      e: this.corpo.cena.getObjectByName(n), u: ual.getObjectByName(n),
      re: fonte.getObjectByName(n).position.clone(), ru: base.getObjectByName(n).position.clone(),
    })).filter((x) => x.e && x.u);

    // a pose T dos dois, no espaço do pivot (para a pegada das armas): a do manequim vem do
    // manequim-FONTE e a dele do arquivo — nenhum dos dois anima
    base.updateMatrixWorld(true); fonte.updateMatrixWorld(true);
    ual.updateMatrix(); this.cena.updateMatrix();
    const baseInv = new THREE.Matrix4().copy(base.matrixWorld).invert(), fonteInv = new THREE.Matrix4().copy(fonte.matrixWorld).invert();
    this.poseT = (nome) => ({
      u: new THREE.Matrix4().multiplyMatrices(ual.matrix, baseInv).multiply(base.getObjectByName(nome).matrixWorld),
      e: new THREE.Matrix4().multiplyMatrices(this.cena.matrix, fonteInv).multiply(fonte.getObjectByName(nome).matrixWorld),
    });
    // A ALTURA em relação ao humano (a câmera da Aparência e a da primeira pessoa: os olhos do
    // humano a 1,6 m): os olhos dele, um pouco abaixo do meio entre o osso da cabeça e o topo
    let topo = 0;
    fonte.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      topo = Math.max(topo, o.geometry.boundingBox.max.y);
    });
    const cabeca = _p.setFromMatrixPosition(this.poseT('Head').e).y;
    this.altura = topo > cabeca ? (cabeca + (topo - cabeca) * 0.42) / 1.6 : 1;
    this.pegadas = new Map();
  }

  // o código do corpo (o que viaja: a armadura, que só a ficha usa, e a aparência)
  vestir(armadura) {
    this.armadura = armaduraDe(armadura ?? NU) || NU;
    this.alturaMudou = false;
  }

  // depois do mixer: o esqueleto dele copia o do manequim
  seguir() {
    const p = this.pares;
    for (let i = 0; i < p.length; i += 2) p[i].quaternion.copy(p[i + 1].quaternion);
    for (const a of this.andam) a.e.position.copy(a.u.position).sub(a.ru).multiplyScalar(this.k).add(a.re);
    if (this.mao) this.mao.visible = !this.modelo.slotR?.children.length;
  }

  piscar() { /* (ele não tem pálpebra) */ }

  // a arma no osso dele, a partir da pegada no osso UAL: na pose T, a arma fica com a
  // orientação e o tamanho que teria na mão do manequim, no lugar da mão dele
  pegada(ossoUal, matrizNoUal) {
    if (!this.pegadas.has(ossoUal)) {
      const { u, e } = this.poseT(ossoUal);
      u.decompose(_p, _q, _s);
      const naMaoDele = new THREE.Matrix4().compose(new THREE.Vector3().setFromMatrixPosition(e), _q, _s);
      this.pegadas.set(ossoUal, e.clone().invert().multiply(naMaoDele));
    }
    return { osso: this.corpo.cena.getObjectByName(ossoUal), matriz: this.pegadas.get(ossoUal).clone().multiply(matrizNoUal) };
  }

  // devolve o manequim como estava
  remover() {
    const { modelo } = this;
    this.cena.removeFromParent();
    for (const o of this.escondidos) o.visible = true;
    for (const m of this.materiais) {
      const i = modelo.flashMats.indexOf(m);
      if (i >= 0) { modelo.flashMats.splice(i, 1); modelo.baseEmissive.splice(i, 1); }
      m.dispose();
    }
  }
}

/**
 * (Game.preaquecer) um boneco de cada esculpido no meio do mapa, com o material de quem joga
 * com ele: o shader compila no carregamento, e não quando o primeiro chega. Devolve quem os tira.
 */
export function aquecerEsculpidos(cena, pos) {
  const postos = [];
  for (const nome of ESCULPIDOS) {
    if (!Assets.esculpidos[nome]) continue;
    const c = new CorpoEsculpido(nome);
    postos.push([c, materiaisProprios(c.root)]);
    c.root.position.copy(pos);
    cena.add(c.root);
  }
  return () => { for (const [c, mats] of postos) { c.root.removeFromParent(); for (const m of mats) m.dispose(); } };
}
