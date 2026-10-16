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
// `Esculpidos` (game.esculpidos) põe cada modelo carregado ao lado da fogueira do acampamento,
// passando pelas animações — é a vitrine para AVALIAR o personagem (o NPC de verdade, com
// lugar e comportamento, é outra etapa). No console: `game.esculpidos.trazer()` o traz para a
// frente do jogador; `game.esculpidos.tocar('Walk_Loop')` fixa uma animação; `tocar()` volta
// ao roteiro.
import * as THREE from 'three';
import { Assets, ESCULPIDOS } from './assets.js';
import { clone as cloneSkinned } from '../vendor/jsm/utils/SkeletonUtils.js';
import { Gear } from './gear.js';

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

// A VITRINE: o roteiro de animações que o esculpido repete ([clipe, segundos]; 0 = uma vez)
const ROTEIRO = [
  ['Idle_Loop', 6], ['Idle_Talking_Loop', 5], ['Spell_Simple_Shoot', 0], ['Idle_Loop', 3],
  ['Walk_Loop', 4], ['Jog_Fwd_Loop', 3], ['Dance_Loop', 5], ['Sword_Attack', 0], ['Roll', 0],
];
const LONGE = 70;   // metros da câmera: mais longe, nem anima nem desenha

export class Esculpidos {
  constructor(game) {
    this.game = game;
    this.lista = [];
    const w = game.world, fogo = w.fogueiras?.find((f) => f.id === 'acampamento') ?? w.fogueiras?.[0];
    ESCULPIDOS.forEach((nome, i) => {
      if (!Assets.esculpidos[nome] || !fogo) return;
      const corpo = new CorpoEsculpido(nome);
      // ao lado de onde se acorda na fogueira (fora dos bancos de tronco), olhando para lá
      const pos = fogo.pos.clone().add(new THREE.Vector3(3.6 + i * 1.2, 0, 2.4));
      pos.y = w.alturaChao(pos);
      const olhar = fogo.pos.clone().add(new THREE.Vector3(fogo.acordar[0], 0, fogo.acordar[1]));
      corpo.root.position.copy(pos);
      corpo.root.rotation.y = Math.atan2(olhar.x - pos.x, olhar.z - pos.z);
      game.scene.add(corpo.root);
      const e = { corpo, passo: -1, t: 0, fixo: null };
      this.proximo(e);
      this.lista.push(e);
    });
  }

  proximo(e) {
    e.passo = (e.passo + 1) % ROTEIRO.length;
    const [nome, seg] = ROTEIRO[e.passo];
    e.t = seg || e.corpo.duracao(nome);
    e.corpo.play(nome, { loop: seg > 0 });
  }

  update(dt) {
    const cam = this.game.camera.position;
    for (const e of this.lista) {
      const perto = e.corpo.root.position.distanceTo(cam) < LONGE;
      e.corpo.root.visible = perto;
      if (!perto) continue;
      if (!e.fixo && (e.t -= dt) <= 0) this.proximo(e);
      e.corpo.update(dt);
    }
  }

  /** (console) traz o primeiro esculpido para 2,5 m na frente do jogador, olhando para ele */
  trazer() {
    const e = this.lista[0], p = this.game.player;
    if (!e) return 'nenhum esculpido carregado';
    const f = p.facing ?? 0, pos = p.pos.clone().add(new THREE.Vector3(Math.sin(f) * 2.5, 0, Math.cos(f) * 2.5));
    pos.y = this.game.world.alturaChao(pos);
    e.corpo.root.position.copy(pos);
    e.corpo.root.rotation.y = f + Math.PI;
    return 'ok';
  }

  /** (console) fixa uma animação; sem nome, volta ao roteiro */
  tocar(nome) {
    for (const e of this.lista) {
      e.fixo = nome ?? null;
      if (nome) e.corpo.play(nome);
      else { e.passo = -1; this.proximo(e); }
    }
  }
}
