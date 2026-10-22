import * as THREE from 'three';
import { alvoDeTela, ajustarAlvo } from './fxaa.js';
import { tela } from './tela.js';

/**
 * O RETRATO DO HUD (22/10/2026) — o rosto do personagem num losango no canto de cima, como os
 * quadrinhos do WoW: é o PRÓPRIO modelo desenhado ao vivo por uma câmera pequena na frente dele,
 * meio de lado (3/4). A "respiração" é a da animação parada do corpo: a câmera segue o corpo (a
 * posição e o rumo), e a cabeça só de longe (devagar), então o peito subindo e a cabeça balançando
 * aparecem no quadro; rolar ou agachar não tira o rosto do losango por muito tempo.
 *
 * SEM SHADER NOVO NO MEIO DO JOGO: o retrato é desenhado num alvo "como a tela" (`alvoDeTela`,
 * o truque do FXAA: os mesmos programas, o mesmo tom e o mesmo sRGB), com a MESMA cena e as
 * MESMAS luzes — só a lente muda: ela vê de 5 cm até um palmo atrás da cabeça, então só o
 * personagem entra (o resto é cortado pelo `far`). O céu sai (`background` nulo, fundo
 * transparente; a abóbada do céu também sai) e o fundo do losango é pintado pela passada que põe o retrato na tela.
 * As sombras NÃO são redesenhadas para ele (`shadowMap.autoUpdate` desligado durante).
 *
 * A PASSADA: um quadrado em coordenadas de tela, recortado em losango, desenhado por cima do
 * quadro (no alvo que estiver ligado — a tela ou o do FXAA) no lugar do `#retrato` do HTML; a
 * moldura dourada é o CSS por cima. O shader dela compila no construtor (no carregamento).
 *
 * Custo: o retrato é redesenhado de 2 em 2 quadros (o percorrer da cena é o que pesa; o desenho
 * em si é um personagem em ~150 px); a passada é todo quadro (um quadrado).
 */
const FOV = 26;              // graus: lente estreita, o rosto sem distorção
const DIST = 0.78;           // m da cabeça (× a altura do corpo)
const GIRO = 0.55;           // rad: meio de lado (3/4), olhando um pouco para a direita da tela
const SEGUE = 2.2;           // quão rápido a câmera alcança a cabeça (1/s): devagar = a respiração aparece
const DE_QUANTOS = 2;        // redesenha de N em N quadros
const MAX_PX = 256;

const _cab = new THREE.Vector3(), _loc = new THREE.Vector3(), _alvo = new THREE.Vector3();
const _cor = new THREE.Color();

export class Retrato {
  constructor(game, el) {
    this.game = game;
    this.el = el;
    this.r = game.renderer;
    this.alvo = alvoDeTela();
    this.cam = new THREE.PerspectiveCamera(FOV, 1, 0.05, 2);
    this.cam.layers.enable(31);   // (a 1ª pessoa esconde o corpo na camada 31: aqui ele aparece)
    this.offset = null;           // a cabeça no espaço do corpo, suavizada
    this.quadro = 0;
    this.ret = { x: 0, y: 0, s: 0 };
    this.medido = -1;
    this.desenhou = false;

    this.material = new THREE.ShaderMaterial({
      uniforms: { tRetrato: { value: this.alvo.texture }, uRet: { value: new THREE.Vector4() }, uTem: { value: 0 } },
      depthTest: false, depthWrite: false, toneMapped: false, transparent: true,
      vertexShader: 'uniform vec4 uRet; varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(mix(uRet.xy, uRet.zw, uv), 0.0, 1.0); }',
      // o losango (|x| + |y| < 0,5); dentro, o retrato sobre um fundo escuro com luz de cima
      // (a cor do alvo vem já em sRGB e pré-multiplicada pelo alfa — o fundo do alvo é preto vazio)
      fragmentShader: `
        uniform sampler2D tRetrato; uniform float uTem; varying vec2 vUv;
        void main() {
          vec2 c = vUv - 0.5;
          float d = abs(c.x) + abs(c.y);
          if (d > 0.5) discard;
          vec3 fundo = mix(vec3(0.05, 0.04, 0.035), vec3(0.24, 0.17, 0.11), smoothstep(-0.5, 0.45, c.y));
          fundo *= 1.0 - 0.6 * smoothstep(0.25, 0.5, d);
          vec4 r = texture2D(tRetrato, vUv) * uTem;
          gl_FragColor = vec4(r.rgb + fundo * (1.0 - r.a), 1.0);
        }`,
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0), this.material);
    q.frustumCulled = false;
    this.cena = new THREE.Scene();
    this.cena.add(q);
    this.camQuad = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.r.compile(this.cena, this.camQuad);
  }

  /** Onde o `#retrato` está, em px do jogo (o `offsetLeft` não sofre o giro da tela deitada). */
  medir() {
    let x = 0, y = 0;
    for (let e = this.el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
    this.ret.x = x; this.ret.y = y; this.ret.s = this.el.offsetWidth;
  }

  /** O osso da cabeça do corpo vestido (ou do modelo antigo), guardado por corpo. */
  cabeca(m) {
    const dono = m.guerreiro ?? m;
    if (this._dono !== dono) { this._dono = dono; this._osso = m.guerreiro?.cena.getObjectByName('Head') ?? m.head ?? null; }
    return this._osso;
  }

  /** Chamado no fim do quadro, antes da passada do FXAA. */
  desenhar(dt) {
    const g = this.game, p = g.player, r = this.r;
    if (!p?.model || g.state !== 'playing') return;
    if (this.medido < 0 || ++this.medido > 30) { this.medir(); this.medido = 0; }
    const { x, y, s } = this.ret;
    if (s <= 0) { this.desenhou = false; return; }   // (HUD escondido)

    const W = tela.w || 1, H = tela.h || 1;
    if (this.quadro++ % DE_QUANTOS === 0 || !this.desenhou) this.retratar(dt * DE_QUANTOS, s);

    // a passada: o quadrado do #retrato em coordenadas de tela (-1..1)
    this.material.uniforms.uRet.value.set(x / W * 2 - 1, 1 - (y + s) / H * 2, (x + s) / W * 2 - 1, 1 - y / H * 2);
    const auto = r.autoClear;
    r.autoClear = false;
    r.render(this.cena, this.camQuad);
    r.autoClear = auto;
  }

  retratar(dt, s) {
    const g = this.game, p = g.player, m = p.model, r = this.r, cena = g.scene;
    const osso = this.cabeca(m);
    if (!osso) return;
    const px = Math.min(MAX_PX, Math.round(s * r.getPixelRatio()));
    ajustarAlvo(r, this.alvo, px, px);

    // a cabeça no espaço do corpo (posição do pé + rumo), seguida devagar
    osso.getWorldPosition(_cab);
    const f = p.facing, sn = Math.sin(f), cs = Math.cos(f);
    const dx = _cab.x - p.pos.x, dz = _cab.z - p.pos.z;
    _loc.set(dx * cs - dz * sn, _cab.y - p.pos.y, dx * sn + dz * cs);
    if (!this.offset || _loc.distanceToSquared(this.offset) > 4) this.offset = _loc.clone();
    else this.offset.lerp(_loc, 1 - Math.exp(-dt * SEGUE));
    const o = this.offset;
    const alto = m.guerreiro?.altura ?? 1;   // (a altura do corpo vestido: a raça baixa e a alta)
    _alvo.set(p.pos.x + o.x * cs + o.z * sn, p.pos.y + o.y + 0.07 * alto, p.pos.z - o.x * sn + o.z * cs);
    const fa = f + GIRO, d = DIST * alto;
    this.cam.position.set(_alvo.x + Math.sin(fa) * d, _alvo.y + 0.04 * alto, _alvo.z + Math.cos(fa) * d);
    this.cam.lookAt(_alvo);
    this.cam.far = d + 0.35 * alto;
    this.cam.updateProjectionMatrix();
    this.cam.updateMatrixWorld();

    // o modelo pode estar escondido pela câmera de sempre (perto da cabeça): aqui ele aparece
    const vis = m.scene.visible, visG = m.guerreiro?.cena.visible;
    m.scene.visible = true;
    if (m.guerreiro) m.guerreiro.cena.visible = true;
    // (o céu é desenhado "no fundo de tudo", sem o corte do `far`: sai também)
    const ceu = g.ceu?.abobada, visCeu = ceu?.visible;
    if (ceu) ceu.visible = false;
    const antes = r.getRenderTarget(), fundo = cena.background, sm = r.shadowMap;
    const smAuto = sm.autoUpdate, smPede = sm.needsUpdate, corA = r.getClearAlpha();
    r.getClearColor(_cor);
    cena.background = null;
    sm.autoUpdate = false; sm.needsUpdate = false;
    r.setClearColor(0x000000, 0);
    r.setRenderTarget(this.alvo);
    r.render(cena, this.cam);
    r.setRenderTarget(antes);
    r.setClearColor(_cor, corA);
    sm.autoUpdate = smAuto; sm.needsUpdate = smPede;
    cena.background = fundo;
    if (ceu) ceu.visible = visCeu;
    m.scene.visible = vis;
    if (m.guerreiro) m.guerreiro.cena.visible = visG;
    this.desenhou = true;
    this.material.uniforms.uTem.value = 1;
  }
}
