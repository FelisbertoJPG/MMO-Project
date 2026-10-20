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
/**
 * A CAIXA DA SOMBRA DO SOL ADIANTADA (20/10/2026; o dono: "a sombra só aparece no chão perto do
 * personagem, no Alto"). A caixa era um quadrado de `raio` CENTRADO no jogador: metade dela ficava
 * atrás, onde a câmera quase não olha, e à frente a sombra sumia a ~30 m (começava a clarear em 72%
 * da caixa). Agora o centro vai `AVANCO_DO_SOL`·raio à frente da câmera (world.js,
 * `updateAmbience`): no Alto (42 m) a sombra vai inteira até ~53 m à frente e some aos poucos até
 * ~64 m; atrás ficam ~19 m (a câmera está atrás do jogador). O MESMO mapa e o mesmo custo de placa.
 * O canto mais longe da caixa fica a `CANTO_DO_SOL`·raio da vista: até ali a árvore que já é cartaz
 * ainda projeta sombra (o `imSombra`).
 */
export const AVANCO_DO_SOL = 0.55;
const CANTO_DO_SOL = Math.hypot(1 + AVANCO_DO_SOL, 1);
/** A faixa do pontilhado do OUTRO LADO (m) e o passo do limite dele ao trocar de lado (×/s). */
const LADO_FAIXA = 10, LADO_PASSO = 1.2;
/** O limite do outro lado andando até o alvo, multiplicando (o longe anda mais rápido que o perto). */
const andarLimite = (v, alvo, dt) => v < alvo ? Math.min(alvo, v * (1 + LADO_PASSO * dt)) : Math.max(alvo, v / (1 + LADO_PASSO * dt));
export const CAMADA_SOMBRA = 30;
/**
 * OS TIPOS DE PEÇA (20/10/2026; as opções avançadas "por tipo", graficos.js): GRAMA (a vegetação
 * miúda e o capim), PEDRAS, ÁRVORES (árvores, arbustos, tocos e troncos) e CENÁRIO (o resto).
 * A ORDEM é o número do tipo no shader (`aLod.w`, `uPassagem[ ]`): tipo novo entra no FIM.
 */
export const TIPOS = ['grama', 'pedras', 'arvores', 'cenario'];
export const tipoDaPeca = (prop) => /Tree|Bush|WoodLog/.test(prop) ? 'arvores'
  : /^gi-|(^|-)Grass|Flower|Plant|Fern/.test(prop) ? 'grama'
  : /(^|-)Rock|^rubble|Seixos/.test(prop) ? 'pedras' : 'cenario';
/** "Sem limite" para o outro lado (m): um número, não `Infinity` — vai para o shader. */
const LADO_LONGE = 3000;
// (os valores de partida — antes do primeiro `update`, no pré-aquecimento: nada some)
const v4 = (x, y, z, w) => [0, 1, 2, 3].map(() => new THREE.Vector4(x, y, z, w));
export const TROCA = {
  uTrocaVista: { value: new THREE.Vector3() },
  // POR TIPO (20/10/2026): x, y = a faixa modelo → cartaz (perto, longe); z = metros de distância
  // por metro de raio até o detalhe ficar com `limiarPx` (foco/limiar); w = a fração final dessa
  // distância em que ele some (0 = corte seco, a passagem suave desligada)
  uPassagem: { value: v4(1e6 - 1, 1e6, 1e6, 0.25) },
  // x = o teto do detalhe escolhido à mão (m por metro de raio, no mínimo 1 m; 1e6 = sem teto);
  // y = a faixa do OUTRO LADO (m; ~0 = seca)
  uCorte: { value: v4(1e6, 10, 0, 0) },
  // O OUTRO LADO (20/10/2026): até onde se vê o que é de DENTRO da masmorra (x) e o de FORA (y) —
  // 40 m e "sem limite" ao ar livre, "sem limite" e 60 m dentro; na troca, anda aos poucos (`update`)
  uOutroLado: { value: new THREE.Vector2(LADO_LONGE, LADO_LONGE) },
  // A SOMBRA ACOMPANHANDO A PASSAGEM (opção avançada "sombra com passagem suave"): 1 = o material
  // de profundidade das cópias (a sombra do sol) usa o mesmo pontilhado; e a sombra da árvore que
  // já é cartaz (o lote `imSombra`) some aos poucos até `uSombraAte` m
  uSombraSuave: { value: 1 },
  uSombraAte: { value: 1e6 },
  uSombraFaixa: { value: 10 },
  // A PEÇA SOLTA (fogueira, barril, tocha: fora dos lotes) some em pontilhado até `uSoltaAte` m
  // (o JS a esconde logo depois, `soltas`); `uSoltaLado` = a faixa do outro lado dela. Quem diz se
  // ela é de dentro é o MAPA (`uMapaDentro`: 1 byte por célula, `World.ehDeDentro`; `uMapaTam` =
  // colunas, linhas, o lado da célula), no lugar da origem da malha — a mesma conta do JS
  uSoltaAte: { value: 1e6 },
  uSoltaFaixa: { value: 12 },
  uSoltaLado: { value: 10 },
  uMapaDentro: { value: null },
  uMapaTam: { value: new THREE.Vector3(1, 1, 6) },
};
const TROCA_RUIDO = 'fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) )';
/**
 * O PONTILHADO DA DISTÂNCIA NUM SHADER SÓ (20/10/2026). Era um por tipo de passagem ('troca',
 * 'sumir', 'solta'): cada material ganhava um programa a mais por tipo. Agora a conta é UMA, e
 * quem escolhe é o dado — nos lotes (instanciados), o atributo por cópia `aLod`: xyz = o lugar da
 * RAIZ da peça (a mesma distância do JS e do cartaz), e w = o CÓDIGO da cópia (`codigoDaCopia`):
 *   0 = nada; |w| = 1 + tipo·1000 + (de dentro ? 500 : 0) + o raio do detalhe (0 = não some);
 *   w < 0 = a cópia vira CARTAZ (a passagem modelo → cartaz), w > 0 = o detalhe que some.
 * Em cima disso, o OUTRO LADO (o de dentro da masmorra visto de fora, e o contrário) some na
 * faixa antes do limite. Na malha comum (a peça solta), a distância é a da origem dela. O
 * material de profundidade das sombras (`profundidadeDaPassagem`) usa a mesma conta (com
 * `uLodSombra` = 1: a sombra da árvore que já é cartaz, que some no fim do alcance).
 */
const LOD_DECL = `uniform vec3 uTrocaVista;
uniform vec4 uPassagem[ 4 ], uCorte[ 4 ];
uniform vec2 uOutroLado;
uniform float uSombraSuave, uSombraAte, uSombraFaixa, uSoltaAte, uSoltaFaixa, uSoltaLado, uLodSombra;
uniform sampler2D uMapaDentro;
uniform vec3 uMapaTam;
varying float vPassagem;
#ifdef USE_INSTANCING
  attribute vec4 aLod;
#endif`;
const LOD_GLSL = (fator) => `#ifdef USE_INSTANCING
    vPassagem = 0.0;
    if ( aLod.w != 0.0 ) {
      float lodDist = distance( ( modelMatrix * vec4( aLod.xyz, 1.0 ) ).xyz, uTrocaVista );
      float lodW = abs( aLod.w ) - 1.0, lodTf = floor( lodW / 1000.0 + 1e-4 );
      float lodR = lodW - lodTf * 1000.0, lodDentro = step( 499.5, lodR );
      lodR -= lodDentro * 500.0;
      int lodT = int( lodTf + 0.5 );
      vec4 lodP = uPassagem[ lodT ], lodC = uCorte[ lodT ];
      if ( uLodSombra > 0.5 ) vPassagem = smoothstep( uSombraAte - uSombraFaixa, uSombraAte, lodDist );
      else if ( aLod.w < 0.0 ) vPassagem = smoothstep( lodP.x, lodP.y, lodDist );
      else if ( lodR > 0.0 ) {
        float lodAte = min( lodR * lodP.z, lodC.x * max( 1.0, lodR ) );
        vPassagem = clamp( ( lodDist - lodAte * ( 1.0 - lodP.w ) ) / max( lodAte * lodP.w, 1e-3 ), 0.0, 1.0 );
      }
      float lodLim = mix( uOutroLado.y, uOutroLado.x, lodDentro );
      vPassagem = max( vPassagem, clamp( ( lodDist - lodLim + lodC.y ) / max( lodC.y, 1e-3 ), 0.0, 1.0 ) ) * ${fator};
    }
  #else
    vec3 soltaO = modelMatrix[ 3 ].xyz;
    float soltaD = distance( soltaO, uTrocaVista );
    float soltaDentro = step( 0.5, texture( uMapaDentro, ( soltaO.xz / uMapaTam.z + 0.5 ) / uMapaTam.xy ).r );
    float soltaLim = mix( uOutroLado.y, uOutroLado.x, soltaDentro );
    vPassagem = max( smoothstep( uSoltaAte - uSoltaFaixa, uSoltaAte, soltaD ),
      clamp( ( soltaD - soltaLim + uSoltaLado ) / max( uSoltaLado, 1e-3 ), 0.0, 1.0 ) ) * ${fator};
  #endif`;
/** Põe o pontilhado num shader (o da cor ou o da profundidade): some onde o ruído < `vPassagem`. */
function pontilhar(sh, fator = '1.0') {
  // (shader sem os pontos de encaixe — um gancho que reescreveu o vértice: fica como está)
  if (!sh.vertexShader.includes('#include <common>') || !sh.vertexShader.includes('#include <project_vertex>')
    || !sh.fragmentShader.includes('#include <common>') || !sh.fragmentShader.includes('#include <clipping_planes_fragment>')) return false;
  Object.assign(sh.uniforms, TROCA);
  sh.uniforms.uLodSombra ??= { value: 0 };
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', `#include <common>\n${LOD_DECL}`)
    .replace('#include <project_vertex>', `#include <project_vertex>\n  ${LOD_GLSL(fator)}`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vPassagem;')
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if ( ${TROCA_RUIDO} < vPassagem ) discard;`);
  return true;
}

/**
 * O pontilhado da distância num material (por cima do gancho que ele já tenha): os materiais SÓ
 * dos lotes (world.js, `unico`) e os das peças soltas (`LOD.vestirSoltas`). Um programa só para
 * tudo (a chave `|lod`): o que muda de uma peça para outra é o dado (`aLod`) e os uniformes.
 */
export function vestirPassagem(m) {
  if (m.userData.passagem) return m;
  m.userData.passagem = 'lod';
  const antes = m.onBeforeCompile, chave = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    antes?.call(this, sh, r);
    pontilhar(sh);
  };
  m.customProgramCacheKey = function () { return `${chave.call(this)}|lod`; };
  return m;
}
export const vestirTroca = (m) => vestirPassagem(m);

/** O código da cópia no `aLod.w` (ver `LOD_DECL`): o tipo, o lado da masmorra, cartaz ou o raio do detalhe. */
export function codigoDaCopia(g) {
  const base = 1 + Math.max(0, TIPOS.indexOf(tipoDaPeca(g.prop ?? ''))) * 1000 + (g.dentro ? 500 : 0);
  return g.cartaz ? -base : base + Math.min(499, Math.max(0, g.raioPeca ?? 0));
}

/**
 * A SOMBRA COM O MESMO PONTILHADO (20/10/2026): o material de PROFUNDIDADE (o que desenha a
 * peça no mapa de sombra do sol) de um lote, com a passagem dele — sem isto a sombra ficava
 * inteira até o JS tirar a cópia do lote, e saltava. Um por material do lote (o three.js copia
 * nele, a cada desenho, o `map`/`alphaTest`/lado do material: o recorte das folhas continua).
 * `longe` = o do lote só de sombra da árvore que já é cartaz (`uLodSombra` 1: some no fim do
 * alcance). Os dois dividem UM programa (a diferença é um uniforme do material). Lote de vários
 * materiais diferentes nisso: `null` (fica a sombra de sempre). Liga e desliga pelo
 * `uSombraSuave` (uniforme: não recompila). Nunca descartados (`dispose`): são do jogo todo.
 */
const PROFUNDIDADES = new Map();
export function profundidadeDaPassagem(material, tipo) {
  const mats = [].concat(material), m0 = mats[0];
  if (mats.some((x) => x.map !== m0.map || x.alphaMap !== m0.alphaMap || x.alphaTest !== m0.alphaTest || x.side !== m0.side || x.shadowSide !== m0.shadowSide)) return null;
  const k = `${m0.uuid}|${tipo}`;
  let d = PROFUNDIDADES.get(k);
  if (!d) {
    d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    d.name = `sombra|${tipo}`;
    const modo = tipo === 'longe' ? 1 : 0;
    d.onBeforeCompile = (sh) => { sh.uniforms.uLodSombra = { value: modo }; pontilhar(sh, 'uSombraSuave'); };
    d.customProgramCacheKey = () => 'sombra-lod';
    PROFUNDIDADES.set(k, d);
  }
  return d;
}

/** As peças que viram impostor ao longe: as árvores (o toco não), os arbustos `lp-Bush_*` e,
 *  desde 19/10/2026 (mesmo dia), a vegetação miúda — flores, juncos, trigo (`gi-`), os tufos
 *  `Grass_*`, plantas e samambaias: ~2.700 cópias que trocavam de uma vez por região de 48 m. */
export const viraImpostor = (prop) => /Tree(?!Stump)|Bush|^gi-|(^|-)Grass|Flower|Plant|Fern/.test(prop);

/**
 * AS FOTOS DOS CARTAZES GUARDADAS NO NAVEGADOR (20/10/2026; opção avançada "pré-carregar tudo").
 * A cada abertura o jogo fotografava os 51 tipos (`VISTAS` fotos de cor e de normais cada);
 * com a opção ligada, as fotos ficam no IndexedDB do navegador (os pixels crus, como saíram da
 * placa: a cor já multiplicada pelo alfa) e na abertura seguinte vêm de lá. A CHAVE muda com o
 * que muda a foto: `FOTO_VERSAO` (suba ao mexer em `assarImpostor`), `RES`, `VISTAS`, a revisão
 * do three.js e a digital do modelo (vértices, malhas, caixa, as texturas). Tudo em try/catch:
 * falhou = fotografa como antes. Ler os pixels (`readRenderTargetPixels`) só no carregamento.
 */
const FOTO_VERSAO = 1;
const BANCO = 'masmorra-cartazes', GAVETA = 'fotos';
const FOTOS = { ligado: false, lidas: new Map(), novas: [], usadas: new Set() };

function abrirBanco() {
  return new Promise((ok, falha) => {
    const p = indexedDB.open(BANCO, 1);
    p.onupgradeneeded = () => { if (!p.result.objectStoreNames.contains(GAVETA)) p.result.createObjectStore(GAVETA); };
    p.onsuccess = () => ok(p.result);
    p.onerror = () => falha(p.error);
    p.onblocked = () => falha(new Error('banco bloqueado'));
  });
}

/** A chave das fotos de uma peça: muda quando o modelo, a resolução, as vistas ou o código da foto mudam. */
function chaveDaFoto(prop, fonte, lado, base, res) {
  let vertices = 0, malhas = 0;
  const tex = [];
  fonte.traverse((o) => {
    if (!o.isMesh) return;
    malhas++;
    vertices += o.geometry?.attributes?.position?.count ?? 0;
    for (const m of [].concat(o.material)) { const i = m?.map?.image; tex.push(i ? `${i.width}x${i.height}` : '-'); }
  });
  return [prop, FOTO_VERSAO, RES, VISTAS, res, THREE.REVISION, malhas, vertices, lado.toFixed(3), base.toFixed(3), tex.join(',')].join('|');
}

/** Lê as fotos guardadas (main.js, ANTES de montar o mundo). Sem a opção ou com erro: nada. */
export async function carregarFotosGuardadas(ligado) {
  FOTOS.ligado = !!ligado;
  FOTOS.lidas.clear(); FOTOS.novas = []; FOTOS.usadas.clear();
  if (!FOTOS.ligado) return 0;
  try {
    const db = await abrirBanco();
    await new Promise((ok, falha) => {
      const t = db.transaction(GAVETA, 'readonly'), g = t.objectStore(GAVETA), c = g.openCursor();
      c.onsuccess = () => {
        const cur = c.result;
        if (!cur) return;
        const v = cur.value;
        if (v?.cor instanceof Uint8Array && v?.normal instanceof Uint8Array) FOTOS.lidas.set(String(cur.key), v);
        cur.continue();
      };
      t.oncomplete = ok; t.onerror = () => falha(t.error); t.onabort = () => falha(t.error);
    });
    db.close();
  } catch (e) { console.warn('[cartaz] não consegui ler as fotos guardadas:', e?.message ?? e); FOTOS.lidas.clear(); }
  return FOTOS.lidas.size;
}

/** Grava as fotos novas e apaga as que não servem mais (chave velha). Sem esperar: o jogo segue. */
export async function gravarFotosNovas() {
  if (!FOTOS.ligado) return;
  const novas = FOTOS.novas, velhas = [...FOTOS.lidas.keys()].filter((k) => !FOTOS.usadas.has(k));
  FOTOS.novas = []; FOTOS.lidas.clear();   // (a memória das lidas: as texturas já têm os pixels)
  if (!novas.length && !velhas.length) return;
  try {
    const db = await abrirBanco();
    await new Promise((ok, falha) => {
      const t = db.transaction(GAVETA, 'readwrite'), g = t.objectStore(GAVETA);
      for (const f of novas) g.put({ cor: f.cor, normal: f.normal }, f.chave);
      for (const k of velhas) g.delete(k);
      t.oncomplete = ok; t.onerror = () => falha(t.error); t.onabort = () => falha(t.error);
    });
    db.close();
  } catch (e) { console.warn('[cartaz] não consegui guardar as fotos:', e?.message ?? e); }
}

/** O botão "apagar o guardado" das opções avançadas: some com o banco inteiro. */
export function apagarFotosGuardadas() {
  return new Promise((ok) => {
    try {
      const p = indexedDB.deleteDatabase(BANCO);
      p.onsuccess = () => ok(true); p.onerror = () => ok(false); p.onblocked = () => ok(false);
    } catch { ok(false); }
  });
}

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
  // AS FOTOS GUARDADAS NO NAVEGADOR (opção "pré-carregar tudo"): a mesma chave = as mesmas fotos
  const chave = FOTOS.ligado ? chaveDaFoto(prop, fonte, lado, base, res) : null;
  const guardada = chave && FOTOS.lidas.get(chave);
  if (guardada && guardada.cor?.length === res * VISTAS * res * 4 && guardada.normal?.length === guardada.cor.length) {
    try {
      FOTOS.usadas.add(chave);
      const tex = (px, colorSpace) => {
        const t = new THREE.DataTexture(px, res * VISTAS, res, THREE.RGBAFormat, THREE.UnsignedByteType);
        t.colorSpace = colorSpace; t.generateMipmaps = true; t.flipY = false;
        t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
        t.needsUpdate = true;
        t.onUpdate = () => { t.image.data = null; };   // subiu para a placa: a cópia na memória do JS não faz falta

        return t;
      };
      return { textura: tex(guardada.cor, THREE.SRGBColorSpace), normais: tex(guardada.normal, THREE.NoColorSpace), lado, base };
    } catch (e) { console.warn('[cartaz] a foto guardada falhou — fotografando de novo:', e?.message ?? e); }
  }
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
  const alvoAntes = renderer.getRenderTarget();   // (o do FXAA, se ligado: js/fxaa.js)
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
  renderer.setRenderTarget(alvoAntes);
  renderer.setClearColor(corAntes, alfaAntes);
  for (const n of trocados.values()) n.dispose();   // só serviam para a foto
  // (no CARREGAMENTO ler os pixels da placa é aceitável — no meio do jogo, nunca)
  if (chave) {
    try {
      const w = res * VISTAS, cor = new Uint8Array(w * res * 4), normal = new Uint8Array(w * res * 4);
      renderer.readRenderTargetPixels(alvoCor, 0, 0, w, res, cor);
      renderer.readRenderTargetPixels(alvoNormal, 0, 0, w, res, normal);
      FOTOS.novas.push({ chave, cor, normal });
      FOTOS.usadas.add(chave);
    } catch (e) { console.warn('[cartaz] não consegui guardar a foto:', e?.message ?? e); }
  }
  return { textura: alvoCor.texture, normais: alvoNormal.texture, lado, base };
}

/**
 * O material do cartaz: o Lambert do three.js (luz, névoa, tudo igual), com o vértice
 * trocado — a posição sai do lugar da cópia (`instanceMatrix`), virada para a câmera, e a
 * coordenada da textura escolhe a foto do ângulo. A normal de cada pixel vem da foto das
 * normais, levada do espaço da vista (direita, cima, para a câmera) para o mundo.
 */
function materialDoCartaz({ textura, normais, lado, base }, tipo = 2) {
  const m = new THREE.MeshLambertMaterial({ map: textura, alphaTest: 0.5 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLado = { value: lado };
    sh.uniforms.uBase = { value: base };
    sh.uniforms.uNormais = { value: normais };
    Object.assign(sh.uniforms, TROCA);
    // a faixa da passagem e a do OUTRO LADO do TIPO dele (grama ou árvores: o mesmo vetor do
    // `uPassagem`/`uCorte`, por referência — um uniforme do material, o programa é um só)
    sh.uniforms.uPassT = { value: TROCA.uPassagem.value[tipo] };
    sh.uniforms.uCorteT = { value: TROCA.uCorte.value[tipo] };
    // AS DUAS FOTOS VIZINHAS (19/10/2026): com uma só (a mais perto do ângulo), girar a câmera
    // trocava a foto de uma vez a cada 45° — de perto (40 m) a árvore "pulava". Agora mistura a
    // de antes e a de depois pela fração do ângulo. As fotos têm a cor já multiplicada pelo alfa
    // (o fundo é preto transparente): mistura-se assim e divide-se pelo alfa misturado.
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uNormais;
        varying vec3 vImpDir, vImpD;
        varying vec2 vImpUv2;
        varying float vImpT, vTroca, vImpLado;`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float impRuido = ${TROCA_RUIDO};
        if ( impRuido >= vTroca || impRuido < vImpLado ) discard;`)
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
        uniform vec4 uPassT, uCorteT;
        uniform vec2 uOutroLado;
        attribute float aDentro;
        varying vec3 vImpDir, vImpD;
        varying vec2 vImpUv2;
        varying float vImpT, vTroca, vImpLado;`)
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
        float impVista = distance( impP, uTrocaVista );
        vTroca = smoothstep( uPassT.x, uPassT.y, impVista );
        // (o OUTRO LADO: o cartaz some na mesma faixa do modelo — ver LOD_GLSL)
        vImpLado = clamp( ( impVista - mix( uOutroLado.y, uOutroLado.x, aDentro ) + uCorteT.y ) / max( uCorteT.y, 1e-3 ), 0.0, 1.0 );
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
  let n = 0, a = im.geometry.attributes.aLod;
  for (const c of l.copias) if (tudo || (c.g.visivel && !c.cortada && !c.longe && !c.oculta)) { a?.setXYZW(n, c.p.x, c.p.y, c.p.z, c.cod); im.setMatrixAt(n++, c.m); }
  if (a) a.needsUpdate = true;
  im.count = n;
  im.visible = n > 0;
  im.instanceMatrix.needsUpdate = true;
  if (n) im.computeBoundingSphere();
  // a árvore que já é cartaz, mas cuja sombra ainda se vê
  const s = l.imSombra;
  if (!s) return;
  // (no pré-aquecimento, TODAS: o material de profundidade dele — o da sombra que some longe — é outro)
  n = 0; a = s.geometry.attributes.aLod;
  for (const c of l.copias) if (tudo || (c.g.visivel && !c.cortada && c.longe && c.comSombra)) { a?.setXYZW(n, c.p.x, c.p.y, c.p.z, c.cod); s.setMatrixAt(n++, c.m); }
  if (a) a.needsUpdate = true;
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
    // O MAPA DE DENTRO (20/10/2026): 1 byte por célula (`World.ehDeDentro`), para o shader da peça
    // solta saber de que lado da masmorra ela está (`uMapaDentro`; o JS usa a mesma conta)
    const cols = world.cols, rows = world.rows, dentro = new Uint8Array(cols * rows);
    for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) dentro[rr * cols + cc] = world.ehDeDentro(rr, cc) ? 255 : 0;
    const mapa = new THREE.DataTexture(dentro, cols, rows, THREE.RedFormat, THREE.UnsignedByteType);
    mapa.minFilter = mapa.magFilter = THREE.NearestFilter; mapa.generateMipmaps = false; mapa.unpackAlignment = 1; mapa.needsUpdate = true;
    TROCA.uMapaDentro.value = mapa;
    TROCA.uMapaTam.value.set(cols, rows, world.center(0, 1).x);   // (o lado da célula: `CELL`)
    for (const g of grupos) {
      g.longe = false; g.oculto = false; g.lado = false;
      g.t = Math.max(0, TIPOS.indexOf(tipoDaPeca(g.prop)));   // o tipo (grama, pedras, árvores, cenário)
      if (!viraImpostor(g.prop)) continue;
      let c = this.cartazes.get(g.prop);
      if (!c) {
        const fotos = assarImpostor(r, g.prop);
        const total = grupos.filter((x) => x.prop === g.prop).reduce((s, x) => s + x.matrizes.length, 0);
        // (um plano por tipo: dividindo a geometria, o three.js religava os atributos a cada cartaz — world.js, `cascaDaGeometria`)
        const geo = plano.clone();
        geo.setAttribute('aDentro', new THREE.InstancedBufferAttribute(new Float32Array(total), 1));   // o lado da masmorra (o outro lado)
        const malha = new THREE.InstancedMesh(geo, materialDoCartaz(fotos, g.t), total);
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
      // (`c.p`: o lugar da RAIZ da peça — o mesmo do cartaz e do `aLod` no shader; `c.cod`: o código da cópia, `codigoDaCopia`)
      c.l = l; c.p = c.raiz ?? new THREE.Vector3().setFromMatrixPosition(c.m);
      c.cod = codigoDaCopia(c.g);   // (o `aLod.w` dela: tipo, lado, cartaz ou o raio do detalhe)
      c.longe = false; c.comSombra = false; c.oculta = false;
      (c.g.copias ??= []).push(c);
      if (l.sombra) c.g.projeta = true;
    }
    // o `aLod` das cópias, na ordem em que o mundo as pôs no lote (todas à vista)
    for (const l of lotes) {
      const a = l.im?.geometry.attributes.aLod;
      if (!a) continue;
      l.copias.forEach((c, i) => a.setXYZW(i, c.p.x, c.p.y, c.p.z, c.cod));
      a.needsUpdate = true;
    }
  }

  /** Todo quadro: o que está longe vira cartaz; o detalhe pequeno longe some. */
  update(camera) {
    const q = this.world.game.graficos?.q ?? {};
    // as distâncias e a passagem suave das OPÇÕES AVANÇADAS (graficos.js), POR TIPO de peça
    // (20/10/2026: grama, pedras, árvores, cenário — no modo "tudo junto" os quatro são iguais);
    // a passagem desligada = a troca seca (sem a faixa) e a árvore que é cartaz sem sombra
    const G = this.world.game.graficos;
    const limiar = q.limiarPx ?? 2, A = q.alcance ?? Infinity;
    const H = this.world.game.renderer.domElement.clientHeight || innerHeight;
    // (a câmera isométrica — player.js — vê de longe com lente estreita; ela diz de onde uma
    // câmera comum veria, e com que lente: as distâncias e os pixels saem iguais)
    const foco = (H / 2) / Math.tan((camera.userData.lodFov ?? camera.fov) * Math.PI / 360), K = foco / limiar;
    const p = camera.userData.vistaDe ?? camera.position;
    const fora = (this.world.ambience?.k ?? 0) > 0.5;
    TROCA.uTrocaVista.value.copy(p);
    // O OUTRO LADO ANDA AOS POUCOS (20/10/2026): ao passar pela porta da masmorra, o limite de
    // quem ficou do outro lado ia de "sem limite" a 40/60 m de uma vez — tudo além disso sumia (ou
    // aparecia) num quadro. Agora ele anda (`andarLimite`: ×1,2 por segundo, de 40 m ao "sem
    // limite" em ~3,5 s) e o pontilhado acompanha; o JS só esconde o grupo que já sumiu de todo
    const agora = performance.now(), dt = Math.min(0.1, Math.max(0, (agora - (this.tAntes ?? agora)) / 1000));
    this.tAntes = agora;
    const alvoD = fora ? VER_DENTRO_DE_FORA : LADO_LONGE, alvoF = fora ? LADO_LONGE : VER_FORA_DE_DENTRO;
    if (this.limDentro === undefined) { this.limDentro = alvoD; this.limFora = alvoF; }
    this.limDentro = andarLimite(this.limDentro, alvoD, dt);
    this.limFora = andarLimite(this.limFora, alvoF, dt);
    // (o ALCANCE do Mínimo também: nem o lote nem o cartaz além dele — a névoa já fechou ali)
    const limD = Math.min(this.limDentro, A), limF = Math.min(this.limFora, A);
    TROCA.uOutroLado.value.set(limD, limF);
    // OS NÚMEROS DE CADA TIPO: no shader (`uPassagem`, `uCorte`) e no JS (`this.par`), os mesmos
    const P = this.par ??= { cartazDe: [0, 0, 0, 0], modeloAte: [0, 0, 0, 0], sombraAte: [0, 0, 0, 0], teto: [0, 0, 0, 0] };
    const comSol = !!q.sol && G?.sombras !== false;
    let mudou = false;
    for (let t = 0; t < TIPOS.length; t++) {
      const tipo = TIPOS[t], suave = G ? G.suaveDe(tipo) : true, banda = suave ? BANDA : 0;
      // (só a grama e as árvores viram cartaz; nas pedras e no cenário a faixa do cartaz não é usada)
      const Dt = G ? (G.distanciaDe(tipo === 'grama' ? 'grama' : 'arvores') ?? 40) : (q.impostor ?? 110);
      const teto = (tipo === 'pedras' || tipo === 'cenario') ? (G?.distanciaDe(tipo) ?? Infinity) : Infinity;
      // até onde a árvore que virou cartaz ainda projeta a sombra do sol: a caixa dela é um
      // quadrado de `raio` em volta do jogador (o canto a √2·raio), e a câmera fica atrás dele
      // (o raio é o da opção avançada "distância das sombras", ou o da qualidade)
      // (com a cascata — "Sempre carregadas" —, até onde a caixa de LONGE chega: graficos.js, `LONGE`)
      const sol = suave && comSol ? (G?.cascata ? (G.longe?.raio ?? 150) * Math.hypot(1 + (G.longe?.avanco ?? 0.6), 1) + 6 : (G?.raioDaSombra ?? q.sol.raio) * CANTO_DO_SOL + 6) : 0;
      const cartazDe = Dt - banda - FOLGA, modeloAte = Dt + FOLGA, sombraAte = Math.max(modeloAte, sol);
      if (P.cartazDe[t] !== cartazDe || P.modeloAte[t] !== modeloAte || P.sombraAte[t] !== sombraAte || P.teto[t] !== teto) mudou = true;
      P.cartazDe[t] = cartazDe; P.modeloAte[t] = modeloAte; P.sombraAte[t] = sombraAte; P.teto[t] = teto;
      // (o detalhe: metros de distância por metro de raio até ficar com `limiar` px; some no último quarto)
      TROCA.uPassagem.value[t].set(Dt - Math.max(banda, 0.01), Dt, K, suave ? 0.25 : 0);
      TROCA.uCorte.value[t].set(Number.isFinite(teto) ? teto : 1e6, suave ? LADO_FAIXA : 0.01, 0, 0);
    }
    // a sombra da árvore que já é cartaz (só as árvores projetam sombra de longe): some 1,5 m antes
    // do fim do lote dela (a vista anda 1 m sem refazer) e começa só depois do fim do modelo (a
    // sombra do modelo, no lote dele, é inteira)
    const tA = TIPOS.indexOf('arvores'), sombraAte = P.sombraAte[tA] - 1.5;
    TROCA.uSombraSuave.value = G?.sombraSuave === false ? 0 : 1;
    TROCA.uSombraAte.value = sombraAte;
    TROCA.uSombraFaixa.value = Math.max(0.01, Math.min(10, sombraAte - P.modeloAte[tA]));
    // A PEÇA SOLTA (o cenário): some de todo em `soltaFim` pela ORIGEM de cada malha, e o JS a
    // esconde quando todas as malhas dela passaram disso + 3 m (`soltas`, a mesma conta)
    const tC = TIPOS.indexOf('cenario'), suaveC = G ? G.suaveDe('cenario') : true;
    this.soltaFim = Math.min(SOLTA_LONGE, A + 5, P.teto[tC]);
    TROCA.uSoltaAte.value = this.soltaFim;
    TROCA.uSoltaFaixa.value = suaveC ? Math.min(12, this.soltaFim * 0.3) : 0.01;
    TROCA.uSoltaLado.value = suaveC ? LADO_FAIXA : 0.01;
    this.world.ambience?.lua?.shadow.camera.layers.enable(CAMADA_SOMBRA);
    // SÓ QUANDO A CÂMERA ANDOU 1 m (15/10/2026): as ~1.300 contas de distância eram 2–3 ms por
    // quadro com a CPU freada 8× (um celular fraco), parado ou só girando a câmera. As trocas
    // têm folga de 5–10 m: 1 m de atraso não se vê (e todo quadro enquanto o outro lado anda)
    const u = this.ultimo, ladoMudou = !u || u.limD !== limD || u.limF !== limF;
    if (!u || mudou || ladoMudou || u.p.distanceToSquared(p) > 1 || u.K !== K) {
      if (u) { u.p.copy(p); u.K = K; u.limD = limD; u.limF = limF; } else this.ultimo = { p: p.clone(), K, limD, limF };
      this.grupos_(p, K, limD, limF, mudou);
    }
    // (fora do "andou 1 m": o pré-aquecimento suja os cartazes com a câmera parada)
    for (const c of this.cartazes.values()) {
      if (!c.sujo) continue;
      c.sujo = false;
      let n = 0;
      const ad = c.malha.geometry.attributes.aDentro;
      for (const g of c.grupos) if (!g.lado) for (let i = 0; i < g.matrizes.length; i++) if (g.ehCartaz[i]) { ad?.setX(n, g.dentro ? 1 : 0); c.malha.setMatrixAt(n++, g.matrizes[i]); }
      if (ad) ad.needsUpdate = true;
      c.malha.count = n;
      c.malha.instanceMatrix.needsUpdate = true;
    }
    this.tPersonagens = (this.tPersonagens ?? 0) + 1;
    if (this.tPersonagens % 8 === 0) this.personagens(camera, fora);
    // (as soltas: de 8 em 8 quadros, e todo quadro enquanto o outro lado anda)
    if (this.tPersonagens % 8 === 4 || ladoMudou) this.soltas(camera);
  }

  /** As três regras de cada grupo da decoração (o cartaz, o outro lado, o detalhe pequeno). */
  grupos_(p, K, limD, limF, mudou = false) {
    // a árvore: cartaz a partir do começo da faixa da passagem, modelo até o fim dela, e o modelo
    // só de sombra até onde a sombra do sol alcança (com folga: a vista anda até 1 m sem refazer)
    // — os números do TIPO do grupo (`this.par`, de `update`)
    const P = this.par;
    for (const g of this.grupos) {
      const d = Math.max(0, g.centro.distanceTo(p) - g.raio), t = g.t;
      // as três regras, cada uma com folga para quem anda na divisa não ficar trocando (sem
      // função criada por grupo: eram ~1.300 por quadro, lixo para o coletor)
      // O OUTRO LADO EM PONTILHADO (20/10/2026): o shader apaga a cópia na faixa antes de `lim`
      // (pela distância DELA, que é ≥ `d`); o grupo sai do lote além de `lim` + 2 e volta a `lim` + 1
      // — ainda invisível. Antes, o grupo inteiro sumia de uma vez em `lim`
      const lim = g.dentro ? limD : limF;
      const lado = d > (g.lado ? lim + 1 : lim + 2);
      if (g.cartaz) {
        const cartazDe = P.cartazDe[t], modeloAte = P.modeloAte[t], sombraAte = P.sombraAte[t];
        if (lado !== g.lado) g.cartaz.sujo = true;
        g.lado = lado;
        if (!lado !== g.visivel) { g.visivel = !lado; for (const l of g.lotes) this.sujos.add(l); }
        // o grupo inteiro longe de tudo: só cartaz (e, já assim, nada a refazer — a não ser que
        // as distâncias tenham mudado: as opções avançadas)
        const todoLonge = d > (g.projeta ? sombraAte : modeloAte) + 1;
        if (lado || (todoLonge && g.todoLonge && !mudou)) continue;
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
      // está na divisa decide cópia por cópia.
      // EM PONTILHADO (20/10/2026): quem some na tela é o SHADER (LOD_GLSL: do último quarto até
      // `ate`, onde a cópia fica com `limiar` px — ou no teto do tipo, escolhido à mão); o JS só tira
      // do lote o que já sumiu de todo — além de `ate` + 3 m, e põe de volta a `ate` + 1,5 m (a vista
      // anda 1 m sem refazer: a cópia que entra ainda está invisível). Antes era um corte seco em `ate`
      const ate = Math.min(g.raioPeca * K, P.teto[t] * Math.max(1, g.raioPeca));
      const oculto = g.oculto ? d > ate + 1.5 : d > ate + 3;
      if (lado !== g.lado || oculto !== g.oculto) {
        g.lado = lado; g.oculto = oculto;
        const visivel = !lado && !oculto;
        if (visivel !== g.visivel) { g.visivel = visivel; for (const l of g.lotes) this.sujos.add(l); }
      }
      if (!g.visivel) continue;
      const divisa = d + 2 * g.raio > ate + 1.5;
      if (!divisa && !g.divisa) continue;
      g.divisa = divisa;
      for (const c of g.copias ?? []) {
        const oc = divisa && (c.oculta ? c.p.distanceTo(p) > ate + 1.5 : c.p.distanceTo(p) > ate + 3);
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
  /**
   * O PONTILHADO DAS PEÇAS SOLTAS (20/10/2026): os materiais delas ganham a passagem da distância
   * (`vestirPassagem`, o ramo da malha comum: some aos poucos até `uSoltaAte`, e o outro lado pelo
   * mapa de dentro), no CARREGAMENTO — o `preaquecer` (main.js) chama isto antes de desenhar, então
   * nada compila no meio do jogo. Mesmo filtro de `soltas` (a peça com ossos fica de fora: os
   * personagens). O material é o original, dividido com quem mais o use: perto não muda nada, e
   * longe assim nada mais é desenhado. Material dividido com algo que NÃO é solta (o chão, um
   * personagem) fica sem o pontilhado — essa malha ainda some de uma vez (`soltas`: `semPassagem`).
   * Peça que entra depois (item caído, mensagem do chão) não passa por aqui.
   */
  vestirSoltas() {
    if (this.soltasVestidas) return;
    this.soltasVestidas = true;
    const w = this.world, g = w.game, lotes = new Set(), caixa = new THREE.Box3(), esfera = new THREE.Sphere();
    for (const gr of this.grupos) for (const im of gr.ims) lotes.add(im);
    const fora_ = new Set();
    for (const e of [g.player, ...(g.all ?? []), ...(w.cadaveres ?? [])]) { const r = e?.model?.root ?? e?.model?.scene ?? e?.root; if (r) fora_.add(r); }
    // as candidatas (o filtro de `soltas`) e os materiais de TODO o resto da cena: material
    // dividido com o chão, a água, um personagem… não ganha o pontilhado (sumiria junto)
    const candidatas = [], proibidos = new Set();
    for (const o of w.scene.children) {
      let ok = !(o.isLight || o.isInstancedMesh || o.isPoints || o.isSprite || o.isCamera || lotes.has(o) || fora_.has(o));
      ok &&= !(o.frustumCulled === false || /^(ceu|água|capim|respingos|vitórias|cartaz|lotes)/.test(o.name ?? ''));
      if (ok) o.traverse((m) => { if (m.isSkinnedMesh) ok = false; });
      // (o grande — o chão, o leito da lagoa — não some pela distância: a origem dele pode estar longe)
      if (ok) { caixa.setFromObject(o).getBoundingSphere(esfera); ok = esfera.radius > 0 && esfera.radius <= 20; }
      if (ok) { candidatas.push(o); continue; }
      o.traverse((m) => { if (m.material) for (const mat of [].concat(m.material)) proibidos.add(mat); });
    }
    for (const o of candidatas) o.traverse((m) => {
      if (!m.isMesh || m.isInstancedMesh) return;
      for (const mat of [].concat(m.material)) if (mat && !mat.isShaderMaterial && !mat.userData.passagem && !proibidos.has(mat)) { vestirPassagem(mat); mat.needsUpdate = true; }
    });
  }

  soltas(camera) {
    const w = this.world, g = w.game, p = camera.userData.vistaDe ?? camera.position;
    if (g.state === 'title') return;
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
        // AS MALHAS QUE SOMEM EM PONTILHADO (20/10/2026): a origem de cada uma (a distância do shader)
        // e o lado da masmorra dela (o mesmo mapa do shader, `uMapaDentro`). A solta só é escondida
        // quando TODAS já sumiram de todo — pela distância ou pelo outro lado. Sem nenhuma (só chama,
        // ou material sem o pontilhado), a regra de antes, pela esfera
        const origens = [], dentros = [];
        for (const m of malhas) {
          if (m.isSprite || ![].concat(m.material).every((x) => x?.userData.passagem)) continue;
          const o_ = m.getWorldPosition(new THREE.Vector3());
          origens.push(o_); dentros.push(w.ehDeDentro(...w.cellOf(o_)));
        }
        this.listaDeSoltas.push({ malhas, centro: esfera.center.clone(), raio: esfera.radius, dentro: w.ehDeDentro(...w.cellOf(esfera.center)), oculto: false, origens, dentros, semPassagem: origens.length < malhas.length });
      }
    }
    const fim = this.soltaFim ?? SOLTA_LONGE, limD = this.ultimo?.limD ?? LADO_LONGE, limF = this.ultimo?.limF ?? LADO_LONGE;
    for (const s of this.listaDeSoltas) {
      let oculto;
      if (s.origens.length) {
        // (folga: sai além do fim + 3 m / do limite + 2, volta a + 1,5 / + 1 — ainda invisível no shader)
        const fF = s.oculto ? 1.5 : 3, fL = s.oculto ? 1 : 2;
        oculto = true;
        for (let i = 0; i < s.origens.length && oculto; i++) {
          const di = s.origens[i].distanceTo(p);
          if (!(di > fim + fF || di > (s.dentros[i] ? limD : limF) + fL)) oculto = false;
        }
      } else {
        const d = Math.max(0, s.centro.distanceTo(p) - s.raio), folga = s.oculto ? -5 : 0;
        oculto = d > fim + folga || d > (s.dentro ? limD : limF) + folga;
      }
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

  /**
   * COMO AS PEÇAS ESTÃO CARREGADAS AGORA (20/10/2026; o relatório do monitor e a telemetria): cada
   * peça da decoração, por tipo, no estado em que a vista de agora a põe — as mesmas contas do
   * `grupos_`, refeitas aqui só quando o relatório pede (nada por quadro):
   *   • árvores e grama (as que viram cartaz): `modelo` (inteiro), `passagem` (na faixa em
   *     pontilhado), `cartaz` (a foto; `sombraDeCartaz` = destas, as que ainda projetam sombra);
   *   • pedras e cenário (o detalhe que some): `modelo`, `sumindo` (no último quarto, em
   *     pontilhado), `oculto` (fora do lote);
   *   • `outroLado`: do outro lado da masmorra (o grupo fora do lote).
   * E as peças soltas (visíveis / escondidas) e os limites de cada tipo (m).
   */
  /** O quanto a caixa da sombra do sol vai à frente (fração do raio; world.js e o monitor). */
  get avancoDoSol() { return AVANCO_DO_SOL; }

  situacao(camera) {
    const p = camera.userData.vistaDe ?? camera.position, P = this.par, K = this.ultimo?.K ?? Infinity;
    const tipos = {};
    for (const t of TIPOS) tipos[t] = { modelo: 0, passagem: 0, cartaz: 0, sombraDeCartaz: 0, sumindo: 0, oculto: 0, outroLado: 0 };
    const limites = {};
    if (P) for (let t = 0; t < TIPOS.length; t++) limites[TIPOS[t]] = { cartazDe: P.cartazDe[t], modeloAte: P.modeloAte[t], sombraAte: P.sombraAte[t], teto: Number.isFinite(P.teto[t]) ? P.teto[t] : null };
    for (const g of this.grupos) {
      // (a peça, não a malha: no detalhe as cópias de uma peça dividem o lugar da raiz, `c.p`)
      const s = tipos[TIPOS[g.t]], pos = g.cartaz ? g.pos : g.copias ? [...new Set(g.copias.map((c) => c.p))] : (g.posicoes ?? []);
      if (g.lado) { s.outroLado += pos.length; continue; }
      if (!P) continue;
      if (g.cartaz) {
        for (const q of pos) {
          const d = q.distanceTo(p);
          if (d <= P.cartazDe[g.t]) s.modelo++;
          else if (d <= P.modeloAte[g.t]) s.passagem++;
          else { s.cartaz++; if (g.projeta && d < P.sombraAte[g.t]) s.sombraDeCartaz++; }
        }
        continue;
      }
      const ate = Math.min(g.raioPeca * K, P.teto[g.t] * Math.max(1, g.raioPeca));
      for (const q of pos) {
        const d = q.distanceTo(p);
        if (g.oculto || d > ate) s.oculto++;
        else if (d > ate * 0.75) s.sumindo++;
        else s.modelo++;
      }
    }
    let visiveis = 0, escondidas = 0;
    for (const s of this.listaDeSoltas ?? []) if (s.oculto) escondidas++; else visiveis++;
    return { tipos, soltas: { visiveis, escondidas }, limites, soltaFim: this.soltaFim ?? null };
  }

  /** Números para conferir (o console: `game.world.lod.resumo()`). */
  resumo() {
    let cartazes = 0, longe = 0, ocultos = 0, outroLado = 0;
    for (const c of this.cartazes.values()) cartazes += c.malha.count;
    for (const g of this.grupos) { if (g.longe) longe++; if (g.oculto) ocultos++; if (g.lado) outroLado++; }
    return { tiposDeArvore: this.cartazes.size, cartazesNaTela: cartazes, gruposDeArvoreLonge: longe, gruposDeDetalheOcultos: ocultos, gruposDoOutroLado: outroLado, grupos: this.grupos.length };
  }
}
