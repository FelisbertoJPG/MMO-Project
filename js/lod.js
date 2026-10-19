/**
 * O LOD DA DECORAÇÃO (05/10/2026) — o que está LONGE continua lá, mais barato.
 *
 * Olhando para o horizonte, o jogo desenhava ~1.400 lotes e ~3 milhões de triângulos até
 * 300 m: cada árvore detalhada da Quaternius tem 3–10 mil triângulos, e a 150 m ela é uma
 * mancha de 20 pixels. Duas regras, as duas pela distância ao LOTE (`World.agruparDecoracao`:
 * peças iguais numa região de 24 m) e com folga para não ficar trocando na divisa:
 *
 *  • ÁRVORE LONGE VIRA IMPOSTOR: no carregamento, cada tipo de árvore é "fotografado" de
 *    `VISTAS` ângulos em volta (`assarImpostor`) numa textura só. Longe, o lote da árvore
 *    some e ela é um CARTAZ de 2 triângulos que encara a câmera (girando só em volta do
 *    eixo de pé) e mostra a foto do ângulo de onde se olha — o giro com que ela foi
 *    plantada entra na conta. Todos os cartazes de um tipo são UM `InstancedMesh`: uma
 *    chamada de desenho. A foto guarda a COR (luz ambiente pura, sem sol): quem ilumina o
 *    cartaz é o céu de agora, como as árvores de verdade, e a névoa vale igual.
 *  • DETALHE PEQUENO LONGE SOME: peça que ficaria com menos de `limiarPx` pixels de raio na
 *    tela (capim de decoração, flores, pedrinhas) não é desenhada. A conta usa o tamanho
 *    da peça e a altura da tela, então vale para qualquer resolução.
 *  • O OUTRO LADO SOME (06/10/2026): a masmorra (paredes, pisos, móveis — o grupo é
 *    `dentro` quando a maioria das cópias está em célula que não é ar livre) era desenhada
 *    com o jogador no acampamento: atrás da rocha, mas no campo de visão (~130 chamadas e
 *    ~250 mil triângulos jogados fora, visto no monitor). Ao ar livre, o que é de dentro
 *    some além de `VER_DENTRO_DE_FORA` m (perto da porta continua, para ver a entrada);
 *    na masmorra, o que é de fora some além de `VER_FORA_DE_DENTRO` m (a névoa escura de
 *    dentro já cobre ~95% disso). "Fora" é o `k` do ar livre passando de 0,5.
 *
 * As distâncias vêm da qualidade gráfica (`impostor` em metros e `limiarPx`, graficos.js).
 */
import * as THREE from 'three';
import { Assets } from './assets.js';

export const VISTAS = 8;
const RES = 256;   // pixels de cada foto da ÁRVORE (a textura é VISTAS × RES de largura); a peça pequena tem menos (`resDaFoto`)
/** A resolução de cada foto pelo tamanho da peça (m): árvore 256, arbusto 128, flor e tufo 64. */
const resDaFoto = (lado) => (lado >= 5 ? RES : lado >= 1.5 ? RES / 2 : RES / 4);
const VER_DENTRO_DE_FORA = 40, VER_FORA_DE_DENTRO = 60;
const SOLTA_LONGE = 130;        // peça solta do cenário (fogueira, tocha, baú, porta) mais longe que isto não é desenhada
const PERSONAGEM_LONGE = 110;   // personagem (inimigo, animal) mais longe que isto não é desenhado

/**
 * A PASSAGEM MODELO ↔ CARTAZ (19/10/2026). Com o cartaz a 40 m (era 120), trocar de uma vez se
 * via: a árvore "piscava". Agora cada ÁRVORE (não o grupo de 24 m) passa de um para o outro numa
 * faixa de `BANDA` metros, em PONTILHADO — o mesmo ruído do véu (veu.js): o modelo perde os pixels
 * onde o ruído fica abaixo de `vTroca` e o cartaz fica SÓ com esses, então os dois se completam
 * (nada de buraco nem de transparência). `vTroca` vem da distância da cópia à vista, no shader;
 * aqui no JS só se decide quem entra no lote (com `FOLGA` para a câmera que andou menos de 1 m).
 * A SOMBRA não troca: o cartaz não a projeta, então a árvore que já virou cartaz mas está dentro
 * da caixa da sombra do sol continua num lote SÓ DE SOMBRA (`imSombra`, world.js), na camada
 * `CAMADA_SOMBRA`, que a câmera não desenha e a luz do sol desenha.
 */
const BANDA = 8, FOLGA = 2;
export const CAMADA_SOMBRA = 30;
export const TROCA = {
  uTrocaVista: { value: new THREE.Vector3() },
  uTrocaPerto: { value: 32 },
  uTrocaLonge: { value: 40 },
};
const TROCA_DECL = 'uniform vec3 uTrocaVista;\nuniform float uTrocaPerto;\nuniform float uTrocaLonge;\nvarying float vTroca;';
const TROCA_RUIDO = 'fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) )';
const trocaDe = (pos) => `vTroca = smoothstep( uTrocaPerto, uTrocaLonge, distance( ${pos}, uTrocaVista ) );`;

/** O lado MODELO da passagem num material dos lotes de árvore/arbusto (por cima do gancho que ele já tenha). */
export function vestirTroca(m) {
  if (m.userData.troca) return m;
  m.userData.troca = true;
  const antes = m.onBeforeCompile, chave = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    antes?.call(this, sh, r);
    Object.assign(sh.uniforms, TROCA);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${TROCA_DECL}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
  #ifdef USE_INSTANCING
    ${trocaDe('( modelMatrix * instanceMatrix[3] ).xyz')}
  #else
    vTroca = 0.0;
  #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vTroca;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if ( ${TROCA_RUIDO} < vTroca ) discard;`);
  };
  m.customProgramCacheKey = function () { return `${chave.call(this)}|troca`; };
  return m;
}

/** As peças que viram impostor ao longe: as árvores (o toco não), os arbustos `lp-Bush_*` e,
 *  desde 19/10/2026 (mesmo dia), a vegetação miúda — flores, juncos, trigo (`gi-`), os tufos
 *  `Grass_*`, plantas e samambaias: ~2.700 cópias que trocavam de uma vez por região de 48 m. */
export const viraImpostor = (prop) => /Tree(?!Stump)|Bush|^gi-|(^|-)Grass|Flower|Plant|Fern/.test(prop);

/**
 * As fotos de uma árvore: `VISTAS` vistas em volta, de lado, numa câmera ortográfica que
 * enquadra a árvore inteira num quadrado de `lado` metros com o pé embaixo (`base`). São
 * DUAS texturas iguais na forma: a COR (luz ambiente pura) e as NORMAIS (a direção de cada
 * folha naquele pixel, no espaço da vista) — com elas o cartaz é iluminado pixel a pixel
 * como a árvore de verdade: o lado da copa contra o sol escurece. Só com a cor (e uma
 * normal só para o cartaz todo) as árvores longe saíam claras e saturadas demais.
 */
function assarImpostor(renderer, prop) {
  const fonte = Assets.props[prop];
  const caixa = new THREE.Box3().setFromObject(fonte);
  const raioH = Math.max(-caixa.min.x, caixa.max.x, -caixa.min.z, caixa.max.z);
  const lado = Math.max(2 * raioH, caixa.max.y - caixa.min.y) * 1.02;
  const base = caixa.min.y, res = resDaFoto(lado);
  // a cena da COR: luz ambiente pura de força π — o material de pé (MeshStandard) devolve a própria cor
  const cenaCor = new THREE.Scene();
  cenaCor.add(fonte.clone(true));
  cenaCor.add(new THREE.AmbientLight(0xffffff, Math.PI));
  // a cena das NORMAIS: os mesmos materiais (a mesma textura recortando a folha), com a
  // saída trocada pela normal; sem transparência (normal não se mistura)
  const cenaNormal = new THREE.Scene(), trocados = new Map();
  const copia = fonte.clone(true);
  copia.traverse((o) => {
    if (!o.isMesh) return;
    o.material = [].concat(o.material).map((orig) => {
      if (!trocados.has(orig)) {
        const n = orig.clone();
        n.transparent = false; n.depthWrite = true; n.alphaTest = orig.alphaTest || 0.5;
        n.onBeforeCompile = (sh) => {
          sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
            '#include <dithering_fragment>\n  gl_FragColor = vec4(normalize(normal) * 0.5 + 0.5, 1.0);');
        };
        n.customProgramCacheKey = () => 'impostor-normal';
        trocados.set(orig, n);
      }
      return trocados.get(orig);
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  cenaNormal.add(copia);
  const novoAlvo = (colorSpace) => new THREE.WebGLRenderTarget(res * VISTAS, res, {
    samples: 4, generateMipmaps: true, colorSpace,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  });
  const alvoCor = novoAlvo(THREE.SRGBColorSpace), alvoNormal = novoAlvo(THREE.NoColorSpace);
  const meio = lado / 2, cam = new THREE.OrthographicCamera(-meio, meio, meio, -meio, 0.01, lado * 4);
  const corAntes = renderer.getClearColor(new THREE.Color()), alfaAntes = renderer.getClearAlpha();
  for (const [alvo, cena, fundo] of [[alvoCor, cenaCor, 0x000000], [alvoNormal, cenaNormal, 0x8080ff]]) {
    renderer.setClearColor(fundo, 0);
    alvo.scissorTest = true;
    for (let i = 0; i < VISTAS; i++) {
      // a vista i olha a árvore do ângulo θ = i·2π/VISTAS (medido como atan2(x, z), no
      // espaço da própria árvore) — o mesmo que o shader do cartaz calcula
      const t = (i / VISTAS) * Math.PI * 2;
      cam.position.set(Math.sin(t) * lado * 2, base + meio, Math.cos(t) * lado * 2);
      cam.lookAt(0, base + meio, 0);
      alvo.viewport.set(i * res, 0, res, res);
      alvo.scissor.set(i * res, 0, res, res);
      renderer.setRenderTarget(alvo);
      renderer.clear();
      renderer.render(cena, cam);
    }
  }
  renderer.setRenderTarget(null);
  renderer.setClearColor(corAntes, alfaAntes);
  for (const n of trocados.values()) n.dispose();   // só serviam para a foto
  return { textura: alvoCor.texture, normais: alvoNormal.texture, lado, base };
}

/**
 * O material do cartaz: o Lambert do three.js (luz, névoa, tudo igual), com o vértice
 * trocado — a posição sai do lugar da cópia (`instanceMatrix`), virada para a câmera, e a
 * coordenada da textura escolhe a foto do ângulo. A normal de cada pixel vem da foto das
 * normais, levada do espaço da vista (direita, cima, para a câmera) para o mundo.
 */
function materialDoCartaz({ textura, normais, lado, base }) {
  const m = new THREE.MeshLambertMaterial({ map: textura, alphaTest: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLado = { value: lado };
    sh.uniforms.uBase = { value: base };
    sh.uniforms.uNormais = { value: normais };
    Object.assign(sh.uniforms, TROCA);
    // AS DUAS FOTOS VIZINHAS (19/10/2026): com uma só (a mais perto do ângulo), girar a câmera
    // trocava a foto de uma vez a cada 45° — de perto (40 m) a árvore "pulava". Agora mistura a
    // de antes e a de depois pela fração do ângulo. As fotos têm a cor já multiplicada pelo alfa
    // (o fundo é preto transparente): mistura-se assim e divide-se pelo alfa misturado.
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNormais;
        varying vec3 vImpDir, vImpD;
        varying vec2 vImpUv2;
        varying float vImpT, vTroca;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        if ( ${TROCA_RUIDO} >= vTroca ) discard;`)
      .replace('#include <map_fragment>', `#ifdef USE_MAP
          vec4 impC0 = texture2D( map, vMapUv ), impC1 = texture2D( map, vImpUv2 );
          float impA = mix( impC0.a, impC1.a, vImpT );
          diffuseColor *= vec4( mix( impC0.rgb, impC1.rgb, vImpT ) / max( impA, 1e-3 ), impA );
        #endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef USE_MAP
          vec3 impN = normalize( mix( texture2D(uNormais, vMapUv).xyz, texture2D(uNormais, vImpUv2).xyz, vImpT ) * 2.0 - 1.0 );
          normal = normalize((viewMatrix * vec4(vImpDir * impN.x + vec3(0.0, impN.y, 0.0) + vImpD * impN.z, 0.0)).xyz);
        #endif`);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uLado, uBase;
        uniform vec3 uTrocaVista;
        uniform float uTrocaPerto;
        uniform float uTrocaLonge;
        varying vec3 vImpDir, vImpD;
        varying vec2 vImpUv2;
        varying float vImpT, vTroca;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vec3 impP = vec3(instanceMatrix[3]);
        float impS = length(vec3(instanceMatrix[1]));
        vec3 impX = vec3(instanceMatrix[0]);
        float impGiro = atan(-impX.z, impX.x);
        vec2 impPara = cameraPosition.xz - impP.xz;
        float impDist = max(length(impPara), 1e-4);
        vec3 impD = vec3(impPara.x / impDist, 0.0, impPara.y / impDist);
        vec3 impDir = vec3(impD.z, 0.0, -impD.x);
        float impAng = atan(impPara.x, impPara.y) - impGiro;
        float impF = impAng / (6.2831853 / ${VISTAS}.0), impF0 = floor(impF);
        float impFoto = mod(impF0, ${VISTAS}.0), impFoto2 = mod(impF0 + 1.0, ${VISTAS}.0);
        vImpT = impF - impF0;
        vec3 impW = impP + impDir * (position.x * uLado * impS) + vec3(0.0, ((position.y + 0.5) * uLado + uBase) * impS, 0.0);
        #ifdef USE_MAP
          vMapUv = vec2((impFoto + position.x + 0.5) / ${VISTAS}.0, position.y + 0.5);
        #endif
        vImpUv2 = vec2((impFoto2 + position.x + 0.5) / ${VISTAS}.0, position.y + 0.5);
        ${trocaDe('impP')}
        vImpDir = impDir; vImpD = impD;`)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        transformedNormal = normalize(mat3(viewMatrix) * impD);`)
      .replace('#include <begin_vertex>', 'vec3 transformed = impW;')
      .replace('#include <project_vertex>', `vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', `#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
          vec4 worldPosition = vec4(transformed, 1.0);
        #endif`);
    m.userData.shader = sh;
  };
  return m;
}

/**
 * Reescreve um LOTE DE DESENHO da decoração (world.js, `agruparDecoracao`: uma peça no mapa
 * inteiro, ou numa região de 96 m se projeta sombra) só com as cópias dos grupos à vista e não
 * cortadas (a vegetação); `tudo` = todas (o pré-aquecimento). A esfera do corte de câmera
 * passa a ser a dessas cópias.
 */
export function reescreverLote(l, tudo = false) {
  const im = l.im;
  if (!im) return;
  let n = 0;
  for (const c of l.copias) if (tudo || (c.g.visivel && !c.cortada && !c.longe && !c.oculta)) im.setMatrixAt(n++, c.m);
  im.count = n;
  im.visible = n > 0;
  im.instanceMatrix.needsUpdate = true;
  if (n) im.computeBoundingSphere();
  // a árvore que já é cartaz, mas cuja sombra ainda se vê
  const s = l.imSombra;
  if (!s) return;
  n = 0;
  if (!tudo) for (const c of l.copias) if (c.g.visivel && !c.cortada && c.longe && c.comSombra) s.setMatrixAt(n++, c.m);
  s.count = n;
  s.visible = n > 0;
  s.instanceMatrix.needsUpdate = true;
  if (n) s.computeBoundingSphere();
}

export class LOD {
  /**
   * `grupos`: de `World.agruparDecoracao` — por peça e região, os lotes (`ims`), onde
   * estão as cópias (`matrizes`), o meio e o raio da região (`centro`, `raio`) e o raio da
   * peça (`raioPeca`). `lotes`: os lotes de desenho (cada um com as suas `copias`, e o grupo
   * de cada cópia) — um grupo que aparece ou some reescreve os lotes dele.
   */
  constructor(world, grupos, lotes = []) {
    this.world = world;
    this.grupos = grupos;
    this.lotes = lotes;
    this.sujos = new Set();
    this.tudo = false;
    this.cartazes = new Map();   // peça → { malha (InstancedMesh), grupos, sujo }
    const r = world.game.renderer;
    const plano = new THREE.PlaneGeometry(1, 1);
    for (const g of grupos) {
      g.longe = false; g.oculto = false; g.lado = false;
      if (!viraImpostor(g.prop)) continue;
      let c = this.cartazes.get(g.prop);
      if (!c) {
        const fotos = assarImpostor(r, g.prop);
        const total = grupos.filter((x) => x.prop === g.prop).reduce((s, x) => s + x.matrizes.length, 0);
        // (um plano por tipo: dividindo a geometria, o three.js religava os atributos a cada cartaz — world.js, `cascaDaGeometria`)
        const malha = new THREE.InstancedMesh(plano.clone(), materialDoCartaz(fotos), total);
        malha.count = 0;
        malha.frustumCulled = false;   // os cartazes estão espalhados pelo mapa inteiro
        malha.name = `cartaz:${g.prop}`;
        world.scene.add(malha);
        c = { malha, grupos: [], sujo: false };
        this.cartazes.set(g.prop, c);
      }
      c.grupos.push(g);
      g.cartaz = c;
      // (a troca é por ÁRVORE: onde está cada uma, e se ela é cartaz agora)
      g.pos = g.matrizes.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
      g.ehCartaz = g.matrizes.map(() => false);
      g.copias = [];
    }
    for (const l of lotes) for (const c of l.copias) {
      c.l = l; c.p = new THREE.Vector3().setFromMatrixPosition(c.m);
      c.longe = false; c.comSombra = false; c.oculta = false;
      (c.g.copias ??= []).push(c);
      if (l.sombra) c.g.projeta = true;
    }
  }

  /** Todo quadro: o que está longe vira cartaz; o detalhe pequeno longe some. */
  update(camera) {
    const q = this.world.game.graficos?.q ?? {};
    // a distância e o "dinâmico" das OPÇÕES AVANÇADAS (graficos.js); desligado, a troca é seca
    // (sem a faixa da passagem) e a árvore que é cartaz não projeta sombra
    const G = this.world.game.graficos, D = G?.distanciaDeCarga ?? q.impostor ?? 110, dinamico = G?.dinamico !== false;
    const limiar = q.limiarPx ?? 2, A = q.alcance ?? Infinity, banda = dinamico ? BANDA : 0;
    // até onde a árvore que virou cartaz ainda projeta a sombra do sol: a caixa dela é um
    // quadrado de `raio` em volta do jogador (o canto a √2·raio), e a câmera fica atrás dele
    const sol = dinamico && q.sol && G?.sombras !== false ? q.sol.raio * 1.45 + 6 : 0;
    const H = this.world.game.renderer.domElement.clientHeight || innerHeight;
    // (a câmera isométrica — player.js — vê de longe com lente estreita; ela diz de onde uma
    // câmera comum veria, e com que lente: as distâncias e os pixels saem iguais)
    const foco = (H / 2) / Math.tan((camera.userData.lodFov ?? camera.fov) * Math.PI / 360);
    const p = camera.userData.vistaDe ?? camera.position;
    const fora = (this.world.ambience?.k ?? 0) > 0.5;
    TROCA.uTrocaVista.value.copy(p);
    TROCA.uTrocaPerto.value = D - Math.max(banda, 0.01);
    TROCA.uTrocaLonge.value = D;
    this.world.ambience?.lua?.shadow.camera.layers.enable(CAMADA_SOMBRA);
    // SÓ QUANDO A CÂMERA ANDOU 1 m (15/10/2026): as ~1.300 contas de distância eram 2–3 ms por
    // quadro com a CPU freada 8× (um celular fraco), parado ou só girando a câmera. As trocas
    // têm folga de 5–10 m: 1 m de atraso não se vê
    const u = this.ultimo;
    if (!u || u.p.distanceToSquared(p) > 1 || u.fora !== fora || u.D !== D || u.limiar !== limiar || u.foco !== foco || u.A !== A || u.sol !== sol || u.banda !== banda) {
      this.ultimo = { p: p.clone(), fora, D, limiar, foco, A, sol, banda };
      this.grupos_(p, fora, D, limiar, foco, A, sol, banda);
    }
    // (fora do "andou 1 m": o pré-aquecimento suja os cartazes com a câmera parada)
    for (const c of this.cartazes.values()) {
      if (!c.sujo) continue;
      c.sujo = false;
      let n = 0;
      for (const g of c.grupos) if (!g.lado) for (let i = 0; i < g.matrizes.length; i++) if (g.ehCartaz[i]) c.malha.setMatrixAt(n++, g.matrizes[i]);
      c.malha.count = n;
      c.malha.instanceMatrix.needsUpdate = true;
    }
    this.tPersonagens = (this.tPersonagens ?? 0) + 1;
    if (this.tPersonagens % 8 === 0) this.personagens(camera, fora);
    if (this.tPersonagens % 8 === 4) this.soltas(camera, fora);
  }

  /** As três regras de cada grupo da decoração (o cartaz, o outro lado, o detalhe pequeno). */
  grupos_(p, fora, D, limiar, foco, A = Infinity, sol = 0, banda = BANDA) {
    // a árvore: cartaz a partir do começo da faixa da passagem, modelo até o fim dela, e o modelo
    // só de sombra até onde a sombra do sol alcança (com folga: a vista anda até 1 m sem refazer)
    const cartazDe = D - banda - FOLGA, modeloAte = D + FOLGA, sombraAte = Math.max(modeloAte, sol);
    for (const g of this.grupos) {
      const d = Math.max(0, g.centro.distanceTo(p) - g.raio);
      // as três regras, cada uma com folga para quem anda na divisa não ficar trocando (sem
      // função criada por grupo: eram ~1.300 por quadro, lixo para o coletor)
      const lim = fora ? VER_DENTRO_DE_FORA : VER_FORA_DE_DENTRO;
      // (além do ALCANCE do Mínimo também: nem o lote nem o cartaz — a névoa já fechou ali)
      const lado = (g.dentro === fora && d > (g.lado ? lim - 5 : lim)) || d > (g.lado ? A - 5 : A);
      if (g.cartaz) {
        if (lado !== g.lado) g.cartaz.sujo = true;
        g.lado = lado;
        if (!lado !== g.visivel) { g.visivel = !lado; for (const l of g.lotes) this.sujos.add(l); }
        // o grupo inteiro longe de tudo: só cartaz (e, já assim, nada a refazer)
        const todoLonge = d > (g.projeta ? sombraAte : modeloAte) + 1;
        if (lado || (todoLonge && g.todoLonge)) continue;
        g.todoLonge = todoLonge;
        g.longe = false;
        for (let i = 0; i < g.pos.length; i++) {
          const ehCartaz = g.pos[i].distanceTo(p) > cartazDe;
          if (ehCartaz !== g.ehCartaz[i]) { g.ehCartaz[i] = ehCartaz; g.cartaz.sujo = true; }
          if (ehCartaz) g.longe = true;
        }
        for (const c of g.copias) {
          const dc = c.p.distanceTo(p), longe = dc > modeloAte, comSombra = longe && dc < sombraAte;
          if (longe !== c.longe || comSombra !== c.comSombra) { c.longe = longe; c.comSombra = comSombra; this.sujos.add(c.l); }
        }
        continue;
      }
      // O DETALHE PEQUENO some CÓPIA POR CÓPIA (19/10/2026): pelo grupo (48 m), a pedrinha a
      // 60 m sumia junto com a de 100 m. O grupo inteiro além do limite some como antes; o que
      // está na divisa decide cópia por cópia — cada uma some quando fica com `limiar` px, onde
      // a troca não se vê
      const ate = g.raioPeca * foco / limiar;
      const oculto = g.oculto ? d > ate * 0.9 : d > ate;
      if (lado !== g.lado || oculto !== g.oculto) {
        g.lado = lado; g.oculto = oculto;
        const visivel = !lado && !oculto;
        if (visivel !== g.visivel) { g.visivel = visivel; for (const l of g.lotes) this.sujos.add(l); }
      }
      if (!g.visivel) continue;
      const divisa = d + 2 * g.raio > ate * 0.9;
      if (!divisa && !g.divisa) continue;
      g.divisa = divisa;
      for (const c of g.copias ?? []) {
        const oc = divisa && (c.oculta ? c.p.distanceTo(p) > ate * 0.9 : c.p.distanceTo(p) > ate);
        if (oc !== c.oculta) { c.oculta = oc; this.sujos.add(c.l); }
      }
    }
    if (this.sujos.size && !this.tudo) { for (const l of this.sujos) reescreverLote(l); this.sujos.clear(); }
  }

  /** O pré-aquecimento (main.js) desenha o mapa INTEIRO: todas as cópias nos lotes, e depois de volta. */
  mostrarTudo(sim) {
    this.tudo = sim;
    for (const l of this.lotes) reescreverLote(l, sim);
    this.sujos.clear();
  }

  /**
   * AS PEÇAS SOLTAS DO CENÁRIO (11/10/2026): o que o mundo põe na cena fora dos lotes da
   * decoração — as fogueiras (~25 malhas cada: pedras, lenha, espada), as tochas de parede, os
   * baús, as portas, os braseiros da arena, as mensagens do chão — não tinha regra de distância
   * nenhuma: do acampamento, olhando para a masmorra, desenhavam-se ~95 peças a 220–280 m,
   * ATRÁS da rocha (num relatório de uma GT 730 no Baixo, 604 chamadas de desenho com a CPU no
   * limite). Aqui elas ganham as duas regras da decoração: do outro lado da masmorra além de
   * `VER_DENTRO_DE_FORA` / `VER_FORA_DE_DENTRO`, ou além de `SOLTA_LONGE` m, o desenho some
   * (por `layers`, como os personagens: o jogo mexe no `visible` de porta, névoa e tampa de baú).
   * A lista é feita UMA vez, no primeiro quadro: os filhos diretos da cena que não são luz,
   * lote, partícula, personagem, céu, chão, capim nem água (o que entra depois — item caído,
   * projétil — fica de fora, sempre desenhado). A luz de dentro delas não muda (`distribuirLuzes`).
   */
  soltas(camera, fora) {
    const w = this.world, g = w.game, p = camera.userData.vistaDe ?? camera.position;
    if (g.state === 'title') return;
    const alcance = (g.graficos?.q.alcance ?? Infinity) + 5;   // o longe do Mínimo (graficos.js)
    if (!this.listaDeSoltas) {
      const fora_ = new Set();
      for (const e of [g.player, ...(g.all ?? []), ...(w.cadaveres ?? []), ...(g.sessao?.outros ?? [])]) { const r = e?.model?.root ?? e?.model?.scene ?? e?.root; if (r) fora_.add(r); }
      const lotes = new Set(); for (const gr of this.grupos) for (const im of gr.ims) lotes.add(im);
      const caixa = new THREE.Box3(), esfera = new THREE.Sphere();
      this.listaDeSoltas = [];
      for (const o of w.scene.children) {
        if (o.isLight || o.isInstancedMesh || o.isPoints || o.isSprite || o.isCamera || fora_.has(o) || lotes.has(o)) continue;
        if (o.frustumCulled === false || /^(ceu|água|capim|respingos|vitórias)/.test(o.name ?? '')) continue;
        const malhas = []; let ossos = false;
        // (as CHAMAS também — sprites, 15/10/2026: do acampamento desenhavam-se as 52 das tochas da
        // masmorra, a 210–290 m, atrás da rocha; eram um quinto das chamadas de desenho)
        o.traverse((m) => { if (m.isSkinnedMesh) ossos = true; else if ((m.isMesh && !m.isInstancedMesh) || m.isSprite) malhas.push(m); });
        if (ossos || !malhas.length) continue;
        caixa.setFromObject(o).getBoundingSphere(esfera);
        if (!(esfera.radius > 0) || esfera.radius > 20) continue;      // o chão, o leito da lagoa: grandes demais para sumir pela distância
        this.listaDeSoltas.push({ malhas, centro: esfera.center.clone(), raio: esfera.radius, dentro: w.ehDeDentro(...w.cellOf(esfera.center)), oculto: false });
      }
    }
    for (const s of this.listaDeSoltas) {
      const d = Math.max(0, s.centro.distanceTo(p) - s.raio), folga = s.oculto ? -5 : 0;
      const oculto = d > Math.min(SOLTA_LONGE, alcance) + folga || (s.dentro === fora && d > (fora ? VER_DENTRO_DE_FORA : VER_FORA_DE_DENTRO) + folga);
      if (oculto === s.oculto) continue;
      s.oculto = oculto;
      for (const m of s.malhas) m.layers.set(oculto ? 31 : 0);
    }
  }

  /**
   * OS PERSONAGENS (07/10/2026): inimigos, animais, o Carrasco e o dragão tinham as malhas
   * animadas SEM corte de câmera (`frustumCulled = false`) — 428 malhas desenhadas em todo
   * quadro, 315 delas a mais de 40 m (os animais do mapa inteiro, os esqueletos da
   * masmorra), e com a tocha acesa a sombra dela redesenhava TODAS seis vezes (~1.900
   * chamadas). Agora, na primeira vez que cada um aparece aqui: o corte de câmera ligado,
   * com a esfera da pose de agora folgada (como a armadura fundida do character.js). E pela
   * distância, como a decoração: do outro lado da masmorra além de `VER_DENTRO_DE_FORA` /
   * `VER_FORA_DE_DENTRO`, ou além de `PERSONAGEM_LONGE` m, o desenho some (por `layers`:
   * o jogo mexe no `visible` das peças de equipamento). A lógica deles continua igual.
   */
  personagens(camera, fora) {
    const w = this.world, p = camera.userData.vistaDe ?? camera.position;
    const alcance = (w.game.graficos?.q.alcance ?? Infinity) + 5;   // o longe do Mínimo (graficos.js)
    // só com a partida rodando: na tela de título os animais ainda não animaram, e a pose de
    // repouso deles tem outro tamanho — a esfera saía pequena (conferido)
    if (w.game.state === 'title') return;
    // A ESFERA DA POSE percorre todos os vértices com os ossos: todos de uma vez eram um pico de
    // ~105 ms ao entrar no mundo, e 12 por passada, 589 ms num celular fraco (relatório de um
    // PowerVR GE8320, 15/10/2026). Agora o teto é de TEMPO (3 ms por passada, no mínimo um), e
    // só de quem está à vista desde a passada anterior (já desenhado: os ossos estão na pose) —
    // esconder pela distância não espera por ela
    const limite = performance.now() + 3;
    for (const e of [...(w.game.all ?? []), ...(w.cadaveres ?? [])]) {
      const raiz = e.model?.root ?? e.model?.scene ?? e.root;
      if (!raiz || !e.pos) continue;
      if (!e.__lodMalhas) {
        e.__lodMalhas = [];
        raiz.traverse((o) => { if (o.isMesh) e.__lodMalhas.push(o); });
        e.__lodOculto = false;
        e.__lodEsfera = false;
      } else if (!e.__lodEsfera && !e.__lodOculto && performance.now() < limite) {
        e.__lodEsfera = true;
        for (const o of e.__lodMalhas) {
          if (o.frustumCulled === false && o.isSkinnedMesh) {
            // a esfera da POSE DE VERDADE (com os ossos — quando o LOD passa aqui o personagem
            // já foi desenhado): a da geometria crua ficava no lugar errado nos animais (o
            // modelo é reescalado na montagem) — conferido: 195 malhas fora da esfera, um
            // lobo podia sumir na tela. Folgada para as animações e o corpo deitado. A que
            // for MANUAL (a armadura fundida do character.js, `userData.esferaManual`) fica; a
            // que o modelo já trazia, não (nos animais ela estava errada). Esfera ruim: sem corte.
            if (!o.userData.esferaManual) {
              o.boundingSphere = null;
              o.computeBoundingSphere();
              const s = o.boundingSphere;
              if (!s || !(s.radius > 0.05) || !Number.isFinite(s.center.x)) { o.boundingSphere = null; continue; }
              // folga: o dobro, e no mínimo 4 m a mais — peça pequena (galhada, rabo) anda até
              // ~2,5 m quando o bicho troca de animação (pastar, correr), conferido
              s.radius = Math.max(s.radius * 2 + 1.5, s.radius + 4);
            }
            o.frustumCulled = true;
          }
        }
      }
      const d = e.pos.distanceTo(p), dentro = !w.isOpenAir(...w.cellOf(e.pos));
      const folga = e.__lodOculto ? -5 : 0;
      const oculto = d > Math.min(PERSONAGEM_LONGE, alcance) + folga || (dentro === fora && d > (fora ? VER_DENTRO_DE_FORA : VER_FORA_DE_DENTRO) + folga);
      if (oculto === e.__lodOculto) continue;
      e.__lodOculto = oculto;
      // ESCONDIDO, SAI DA CENA (11/10/2026): só com `layers` ele não era desenhado, mas o three.js
      // continuava percorrendo os ossos dele a cada quadro (`updateMatrixWorld`, `projectObject`: os
      // bichos e inimigos do mapa inteiro somavam ~2.500 ossos, e isso era ~35% da CPU do quadro numa
      // GT 730). Fora da cena, nada o percorre; a lógica dele (posição, IA, golpes) não depende disso.
      // Quem o tira da cena de vez (lacaio morto) também o tira de `game.all`, e ele não volta por aqui.
      if (oculto) { if (raiz.parent) { e.__lodPai = raiz.parent; raiz.parent.remove(raiz); } }
      else if (e.__lodPai && !raiz.parent) e.__lodPai.add(raiz);
      if (e.model) e.model.oculto = oculto;   // a animação dele passa a rodar a cada 4 quadros (character.js, animais.js)
      // malhas que entraram no modelo depois (arma trocada, armadura) também
      raiz.traverse((o) => { if (o.isMesh && !e.__lodMalhas.includes(o)) e.__lodMalhas.push(o); });
      for (const o of e.__lodMalhas) o.layers.set(oculto ? 31 : 0);
    }
  }

  /** Números para conferir (o console: `game.world.lod.resumo()`). */
  resumo() {
    let cartazes = 0, longe = 0, ocultos = 0, outroLado = 0;
    for (const c of this.cartazes.values()) cartazes += c.malha.count;
    for (const g of this.grupos) { if (g.longe) longe++; if (g.oculto) ocultos++; if (g.lado) outroLado++; }
    return { tiposDeArvore: this.cartazes.size, cartazesNaTela: cartazes, gruposDeArvoreLonge: longe, gruposDeDetalheOcultos: ocultos, gruposDoOutroLado: outroLado, grupos: this.grupos.length };
  }
}
