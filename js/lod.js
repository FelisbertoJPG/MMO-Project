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
const RES = 256;   // pixels de cada foto (a textura é VISTAS × RES de largura)
const VER_DENTRO_DE_FORA = 40, VER_FORA_DE_DENTRO = 60;
const PERSONAGEM_LONGE = 110;   // personagem (inimigo, animal) mais longe que isto não é desenhado

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
      g.longe = false; g.oculto = false; g.lado = false;
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
    const fora = (this.world.ambience?.k ?? 0) > 0.5;
    for (const g of this.grupos) {
      const d = Math.max(0, g.centro.distanceTo(p) - g.raio);
      // as três regras, cada uma com folga para quem anda na divisa não ficar trocando
      const alemDe = (atual, limite, folga) => (atual ? d > limite - folga : d > limite);
      const lado = g.dentro === fora && alemDe(g.lado, fora ? VER_DENTRO_DE_FORA : VER_FORA_DE_DENTRO, 5);
      const longe = !!g.cartaz && alemDe(g.longe, D, 10);
      const oculto = !g.cartaz && (g.oculto ? d > g.raioPeca * foco / limiar * 0.9 : d > g.raioPeca * foco / limiar);
      if (lado === g.lado && longe === g.longe && oculto === g.oculto) continue;
      // o cartaz aparece se a árvore está longe e do lado de cá
      if (g.cartaz && (g.longe && !g.lado) !== (longe && !lado)) g.cartaz.sujo = true;
      g.lado = lado; g.longe = longe; g.oculto = oculto;
      const visivel = !lado && !longe && !oculto;
      for (const im of g.ims) im.visible = visivel;
    }
    for (const c of this.cartazes.values()) {
      if (!c.sujo) continue;
      c.sujo = false;
      let n = 0;
      for (const g of c.grupos) if (g.longe && !g.lado) for (const m of g.matrizes) c.malha.setMatrixAt(n++, m);
      c.malha.count = n;
      c.malha.instanceMatrix.needsUpdate = true;
    }
    this.tPersonagens = (this.tPersonagens ?? 0) + 1;
    if (this.tPersonagens % 8 === 0) this.personagens(camera, fora);
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
    const w = this.world, p = camera.position;
    // só com a partida rodando: na tela de título os animais ainda não animaram, e a pose de
    // repouso deles tem outro tamanho — a esfera saía pequena (conferido)
    if (w.game.state === 'title') return;
    // no máximo 12 preparados por passada: a esfera da pose percorre todos os vértices com os
    // ossos — todos de uma vez eram um pico de ~105 ms ao entrar no mundo (visto no monitor)
    let preparar = 12;
    for (const e of [...(w.game.all ?? []), ...(w.cadaveres ?? [])]) {
      const raiz = e.model?.root ?? e.model?.scene ?? e.root;
      if (!raiz || !e.pos) continue;
      if (!e.__lodMalhas) {
        if (preparar-- <= 0) continue;
        e.__lodMalhas = [];
        raiz.traverse((o) => {
          if (!o.isMesh) return;
          e.__lodMalhas.push(o);
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
              if (!s || !(s.radius > 0.05) || !Number.isFinite(s.center.x)) { o.boundingSphere = null; return; }
              // folga: o dobro, e no mínimo 4 m a mais — peça pequena (galhada, rabo) anda até
              // ~2,5 m quando o bicho troca de animação (pastar, correr), conferido
              s.radius = Math.max(s.radius * 2 + 1.5, s.radius + 4);
            }
            o.frustumCulled = true;
          }
        });
        e.__lodOculto = false;
      }
      const d = e.pos.distanceTo(p), dentro = !w.isOpenAir(...w.cellOf(e.pos));
      const folga = e.__lodOculto ? -5 : 0;
      const oculto = d > PERSONAGEM_LONGE + folga || (dentro === fora && d > (fora ? VER_DENTRO_DE_FORA : VER_FORA_DE_DENTRO) + folga);
      if (oculto === e.__lodOculto) continue;
      e.__lodOculto = oculto;
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
