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
 *
 * As distâncias vêm da qualidade gráfica (`impostor` em metros e `limiarPx`, graficos.js).
 */
import * as THREE from 'three';
import { Assets } from './assets.js';

export const VISTAS = 8;
const RES = 256;   // pixels de cada foto (a textura é VISTAS × RES de largura)

/** As peças que viram impostor ao longe: as árvores (o toco não). */
export const viraImpostor = (prop) => /Tree(?!Stump)/.test(prop);

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
  const base = caixa.min.y;
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
  const novoAlvo = (colorSpace) => new THREE.WebGLRenderTarget(RES * VISTAS, RES, {
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
      alvo.viewport.set(i * RES, 0, RES, RES);
      alvo.scissor.set(i * RES, 0, RES, RES);
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
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNormais;
        varying vec3 vImpDir, vImpD;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef USE_MAP
          vec3 impN = texture2D(uNormais, vMapUv).xyz * 2.0 - 1.0;
          normal = normalize((viewMatrix * vec4(vImpDir * impN.x + vec3(0.0, impN.y, 0.0) + vImpD * impN.z, 0.0)).xyz);
        #endif`);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uLado, uBase;
        varying vec3 vImpDir, vImpD;`)
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
        float impFoto = mod(floor(impAng / (6.2831853 / ${VISTAS}.0) + 0.5), ${VISTAS}.0);
        vec3 impW = impP + impDir * (position.x * uLado * impS) + vec3(0.0, ((position.y + 0.5) * uLado + uBase) * impS, 0.0);
        #ifdef USE_MAP
          vMapUv = vec2((impFoto + position.x + 0.5) / ${VISTAS}.0, position.y + 0.5);
        #endif
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

export class LOD {
  /**
   * `grupos`: de `World.agruparDecoracao` — por peça e região, os lotes (`ims`), onde
   * estão as cópias (`matrizes`), o meio e o raio da região (`centro`, `raio`) e o raio da
   * peça (`raioPeca`).
   */
  constructor(world, grupos) {
    this.world = world;
    this.grupos = grupos;
    this.cartazes = new Map();   // peça → { malha (InstancedMesh), grupos, sujo }
    const r = world.game.renderer;
    const plano = new THREE.PlaneGeometry(1, 1);
    for (const g of grupos) {
      g.longe = false; g.oculto = false;
      if (!viraImpostor(g.prop)) continue;
      let c = this.cartazes.get(g.prop);
      if (!c) {
        const fotos = assarImpostor(r, g.prop);
        const total = grupos.filter((x) => x.prop === g.prop).reduce((s, x) => s + x.matrizes.length, 0);
        const malha = new THREE.InstancedMesh(plano, materialDoCartaz(fotos), total);
        malha.count = 0;
        malha.frustumCulled = false;   // os cartazes estão espalhados pelo mapa inteiro
        malha.name = `cartaz:${g.prop}`;
        world.scene.add(malha);
        c = { malha, grupos: [], sujo: false };
        this.cartazes.set(g.prop, c);
      }
      c.grupos.push(g);
      g.cartaz = c;
    }
  }

  /** Todo quadro: o que está longe vira cartaz; o detalhe pequeno longe some. */
  update(camera) {
    const q = this.world.game.graficos?.q ?? {};
    const D = q.impostor ?? 110, limiar = q.limiarPx ?? 2;
    const H = this.world.game.renderer.domElement.clientHeight || innerHeight;
    const foco = (H / 2) / Math.tan(camera.fov * Math.PI / 360);
    const p = camera.position;
    for (const g of this.grupos) {
      const d = Math.max(0, g.centro.distanceTo(p) - g.raio);
      if (g.cartaz) {
        // folga de 10 m: quem anda na divisa não fica trocando
        const longe = g.longe ? d > D - 10 : d > D;
        if (longe !== g.longe) {
          g.longe = longe;
          for (const im of g.ims) im.visible = !longe;
          g.cartaz.sujo = true;
        }
      } else {
        const alcance = g.raioPeca * foco / limiar;
        const oculto = g.oculto ? d > alcance * 0.9 : d > alcance;
        if (oculto !== g.oculto) {
          g.oculto = oculto;
          for (const im of g.ims) im.visible = !oculto;
        }
      }
    }
    for (const c of this.cartazes.values()) {
      if (!c.sujo) continue;
      c.sujo = false;
      let n = 0;
      for (const g of c.grupos) if (g.longe) for (const m of g.matrizes) c.malha.setMatrixAt(n++, m);
      c.malha.count = n;
      c.malha.instanceMatrix.needsUpdate = true;
    }
  }

  /** Números para conferir (o console: `game.world.lod.resumo()`). */
  resumo() {
    let cartazes = 0, longe = 0, ocultos = 0;
    for (const c of this.cartazes.values()) cartazes += c.malha.count;
    for (const g of this.grupos) { if (g.longe) longe++; if (g.oculto) ocultos++; }
    return { tiposDeArvore: this.cartazes.size, cartazesNaTela: cartazes, gruposDeArvoreLonge: longe, gruposDeDetalheOcultos: ocultos, grupos: this.grupos.length };
  }
}
