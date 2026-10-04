// Carregamento de modelos: personagens (Quaternius UAL, CC0) e cenário (KayKit Dungeon, CC0)
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/jsm/utils/SkeletonUtils.js';

// Exportado porque virou CONTRATO: o editor de cenas lê esta lista para montar
// a gaveta dele. Um .glb em assets/dungeon/ que NÃO esteja aqui existe no disco
// e o jogo não consegue usá-lo, porque Assets.prop() só conhece o que está
// nesta lista. Oferecer na gaveta o que não está aqui daria uma decoração que
// salva e derruba o jogo no carregamento. Para usar um, acrescente aqui (o
// `levar-ao-jogo.mjs` do editor faz isso).
export const PROPS = [
  'wall', 'wall_cracked', 'wall_gated', 'wall_doorway', 'wall_pillar', 'wall_shelves', 'wall_arched',
  'floor_tile_large', 'floor_tile_large_rocks', 'floor_dirt_large', 'floor_dirt_large_rocky', 'floor_tile_big_grate',
  'pillar', 'pillar_decorated', 'column', 'torch_mounted', 'chest', 'chest_gold',
  'barrel_large', 'barrel_small', 'box_stacked', 'crates_stacked', 'keg', 'rubble_large', 'rubble_half',
  'bed_floor', 'candle_triple', 'candle_lit', 'candle_melted', 'table_medium_broken', 'stool', 'shelf_small_candles',
  'keyring_hanging', 'sword_shield_broken', 'bottle_A_green', 'banner_patternA_red', 'banner_red', 'coin_stack_small',
  // levadas pelo editor de cenas (ferramentas/levar-ao-jogo.mjs) — pacotes KayKit: floresta, masmorra (CC0)
  'Tree_1_A', 'Tree_1_B', 'Tree_1_C', 'Tree_2_A', 'Tree_2_B', 'Tree_2_C',
  'Tree_2_D', 'Tree_3_A', 'Tree_3_B', 'Tree_4_A', 'Tree_4_B', 'Tree_4_C',
  'Tree_Bare_1_A', 'Tree_Bare_2_B', 'Bush_1_A', 'Bush_1_C', 'Bush_2_A', 'Bush_2_C',
  'Bush_3_A', 'Bush_4_B', 'Grass_1_A', 'Grass_1_C', 'Grass_2_A', 'Grass_2_B',
  'Rock_1_A', 'Rock_1_C', 'Rock_2_A', 'Rock_3_A', 'Rock_3_R', 'Rock_1_J',
  'Rock_2_H', 'Rock_3_M', 'wall_broken', 'wall_half', 'wall_half_endcap_sloped', 'wall_corner',
  'wall_endcap', 'barrier_colum_half', 'floor_dirt_small_weeds', 'floor_tile_small_broken_A', 'floor_tile_small_broken_B',
  // levadas pelo editor de cenas (ferramentas/levar-ao-jogo.mjs) — pacotes KayKit: masmorra (CC0)
  'barrier', 'stairs',
  // levadas pelo editor de cenas (ferramentas/levar-ao-jogo.mjs) — pacotes: estilizada, megakit, natureza (CC0)
  'estilizada-NormalTree_3', 'megakit-Rock_Medium_3', 'natureza-WoodLog',
  // levadas pelo editor de cenas (ferramentas/levar-ao-jogo.mjs) — pacotes: hex, natureza (CC0)
  'tent', 'weaponrack', 'target', 'wheelbarrow', 'fence_wood_straight', 'resource_lumber',
  'sack', 'crate_open', 'bucket_water', 'natureza-TreeStump',
];

// Os MODELOS DE BLOCOS (assets/modelos/<nome>.json), montados no Editor de
// modelo do editor de cenas e trazidos por `ferramentas/levar-modelo.mjs` —
// que também mantém esta lista. A montagem deles é `js/blocos.js`, uma CÓPIA
// da do editor (não edite lá: ver o cabeçalho do arquivo).
// Os ANIMAIS (03/10/2026, pacote Ultimate Animated Animals da Quaternius):
// GLB em assets/animais/<nome>.glb, com o esqueleto e as animações de cada um
// (Idle, Walk, Gallop, Attack…, Death). Quem os usa é `js/animais.js`.
// ANIMAÇÕES vindas de fora (Mixamo…), já passadas para o esqueleto do manequim UAL por
// `ferramentas/guerreiro/retarget-mixamo.mjs`: assets/animacoes/<nome>.json
// (AnimationClip.toJSON). Entram em Assets.clips pelo NOME do clipe, como as do UAL;
// faltando uma, o jogo segue com as de sempre.
export const ANIMACOES = ['greatsword-idle'];
export const ANIMAIS_MODELOS = ['cervo', 'cervoReal', 'raposa', 'lobo', 'touro', 'cavalo'];

export const MODELOS = ['dragao', 'traje-knight', 'traje-corpse', 'traje-executioner', 'traje-skminion', 'traje-skwarrior', 'traje-skrogue', 'traje-skmage'];

/** Um modelo de blocos, ou `null` com o motivo no console (o jogo abre sem ele). */
export async function carregarAnimacao(nome) {
  try {
    const r = await fetch(`assets/animacoes/${nome}.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return THREE.AnimationClip.parse(await r.json());
  } catch (e) { console.warn(`[animação] sem assets/animacoes/${nome}.json:`, e.message); return null; }
}

// os ajustes da pegada das armas de duas mãos (a tela Empunhadura do editor grava);
// faltando ou torto, valem os números padrão do character.js
export async function carregarEmpunhadura() {
  try {
    const r = await fetch('assets/empunhadura.json', { cache: 'no-store' });
    if (!r.ok) return {};
    const j = await r.json();
    return j && typeof j === 'object' && !Array.isArray(j) ? (j.armas ?? {}) : {};
  } catch { return {}; }
}

async function carregarModelo(nome) {
  try {
    const r = await fetch(`assets/modelos/${nome}.json`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const m = await r.json();
    if (!Array.isArray(m?.pecas) || !(m.bloco > 0)) throw new Error('não é um modelo de blocos');
    return m;
  } catch (e) {
    console.warn(`[modelo] não consegui ler assets/modelos/${nome}.json:`, e.message);
    return null;
  }
}

/**
 * A decoração da masmorra, de `assets/decor.json` — gravada pelo editor de
 * cenas (`trhee_js_scene_editor`).
 *
 * Falhar aqui NÃO derruba o jogo: ele abre sem decoração, com o motivo no
 * console. Uma masmorra sem barril é jogável; uma tela preta não é. Mas o
 * `console.warn` não é opcional — "faltou e ninguém viu" é o defeito que faria
 * alguém procurar o bug no editor enquanto o arquivo nem estava sendo servido.
 */
async function carregarDecor() {
  try {
    const r = await fetch('assets/decor.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    // `grama`: a cor do chão do ar livre, escolhida no editor de cenas (a roda
    // de cor da placa de grama). Sem ela, os verdes de sempre do buildGrass.
    const grama = typeof d?.grama === 'string' && /^#[0-9a-f]{6}$/i.test(d.grama) ? d.grama : null;
    return { itens: Array.isArray(d?.itens) ? d.itens : [], grama };
  } catch (e) {
    console.warn('[decor] não consegui ler assets/decor.json — a masmorra abre vazia:', e.message);
    return { itens: [], grama: null };
  }
}

/**
 * O MAPA da masmorra, de `assets/mapa.json` — gravado pelo editor de cenas.
 *
 * O arquivo guarda VARIANTES e diz qual está ativa, para dar pra fazer uma
 * masmorra nova usando a atual de base sem perder a original.
 *
 * Devolve `null` quando não dá, e quem chama cai no `MAPA_DE_EMERGENCIA` do
 * `world.js` — a diferença para a decoração é que uma masmorra sem barril é
 * jogável e uma masmorra sem paredes não existe. Mas o `console.error` é
 * barulhento de propósito: abrir com um mapa DIFERENTE do que está no arquivo
 * é pior que não abrir, e é o tipo de coisa que se descobre meia hora depois.
 */
async function carregarMapa() {
  try {
    const r = await fetch('assets/mapa.json', { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const d = await r.json();
    const mapas = d?.mapas;
    if (!mapas || typeof mapas !== 'object') throw new Error('sem o objeto `mapas`');
    const nomes = Object.keys(mapas);
    if (!nomes.length) throw new Error('nenhuma variante');
    const ativo = typeof d.ativo === 'string' && mapas[d.ativo] ? d.ativo : nomes[0];
    if (ativo !== d.ativo) {
      console.warn(`[mapa] "${d.ativo}" não existe no arquivo — usando "${ativo}"`);
    }
    const linhas = mapas[ativo];
    // As mensagens e manchas online são gravadas com o nome do mapa: uma
    // mensagem deixada na `floresta` não pode aparecer dentro da rocha do `original`.
    Assets.mapaNome = ativo;
    // as TAGS de lugar desta variante (world.js, aplicarMarcos); faltando, valem as do código
    const m = d.marcos?.[ativo];
    Assets.marcos = m && typeof m === 'object' && !Array.isArray(m) ? m : {};
    if (!Array.isArray(linhas) || !linhas.length) throw new Error(`a variante "${ativo}" está vazia`);
    // Linha de tamanho diferente é o erro mais fácil de cometer editando à mão,
    // e o jogo o absorveria em silêncio (`ch()` devolve rocha fora da faixa):
    // apareceria como uma parede que ninguém desenhou.
    if (linhas.some((l) => typeof l !== 'string' || l.length !== linhas[0].length)) {
      throw new Error(`a variante "${ativo}" tem linhas de tamanhos diferentes`);
    }
    return linhas;
  } catch (e) {
    console.error('[mapa] não consegui ler assets/mapa.json — usando o mapa de '
      + 'EMERGÊNCIA embutido no world.js, que pode estar desatualizado:', e.message);
    return null;
  }
}

export const Assets = {
  props: {},
  clips: {},
  baseScene: null,
  decor: [],
  grama: null,   // a cor do chão do ar livre (decor.json), ou null = a de sempre
  mapa: null,
  mapaNome: 'emergencia',
  marcos: {},    // as tags de lugar da variante ativa (mapa.json → `marcos`): ver world.js
  modelos: {},   // nome → modelo de blocos (MODELOS)
  animais: {},   // nome → { scene, clips } (ANIMAIS_MODELOS)
  empunhadura: {},   // arma de duas mãos → os ajustes da pegada (assets/empunhadura.json; character.js)
  guerreiro: null,   // o corpo do jogador (guerreiro.js); faltando, todos usam o boneco antigo

  async load(onProgress = () => {}) {
    const loader = new GLTFLoader();
    const jobs = [
      ['char', 'UAL1', 'assets/characters/UAL1.glb'],
      ['char', 'UAL2', 'assets/characters/UAL2.glb'],
      ...PROPS.map((n) => ['prop', n, `assets/dungeon/${n}.glb`]),
      ...ANIMAIS_MODELOS.map((n) => ['animal', n, `assets/animais/${n}.glb`]),
      ['guerreiro', 'guerreiro', 'assets/guerreiro/guerreiro.glb'],   // o corpo do jogador (guerreiro.js)
    ];
    let done = 0;
    await Promise.all(jobs.map(async ([kind, name, url]) => {
      // um animal faltando não derruba o jogo: ele só não nasce (animais.js)
      const gltf = kind === 'animal' || kind === 'guerreiro' ? await loader.loadAsync(url).catch((e) => { console.warn(`[animais] sem ${url}:`, e.message); return null; }) : await loader.loadAsync(url);
      if (!gltf) { onProgress(++done / jobs.length); return; }
      gltf.scene.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = true; c.receiveShadow = true;
          if (c.material) { c.material.roughness = 1; c.material.metalness = 0; }
        }
      });
      if (kind === 'animal') {
        // a cor está no material (low poly, sem textura): escurecida para a noite,
        // como a natureza, uma vez por material
        const vistos = new Set();
        gltf.scene.traverse((c) => { if (c.isMesh && !vistos.has(c.material)) { vistos.add(c.material); c.material.color.multiply(new THREE.Color(0xb0b8b0)); } });
        this.animais[name] = { scene: gltf.scene, clips: gltf.animations };
      } else if (kind === 'guerreiro') {
        this.guerreiro = gltf.scene;
      } else if (kind === 'char') {
        for (const clip of gltf.animations) this.clips[clip.name] ??= clip;
        if (name === 'UAL1') this.baseScene = gltf.scene;
      } else this.props[name] = gltf.scene;
      onProgress(++done / jobs.length);
    }));
    // Depois dos glTF e antes de `new World(...)`, que é síncrono: assim o
    // mundo já encontra o mapa e a decoração prontos, e o boot não muda de forma.
    const [mapa, decor] = await Promise.all([carregarMapa(), carregarDecor()]);
    this.empunhadura = await carregarEmpunhadura();
    for (const clip of await Promise.all(ANIMACOES.map(carregarAnimacao))) if (clip) this.clips[clip.name] = clip;
    this.mapa = mapa; this.decor = decor.itens; this.grama = decor.grama;
    for (const [nome, m] of await Promise.all(MODELOS.map(async (n) => [n, await carregarModelo(n)]))) {
      if (m) this.modelos[nome] = m;
    }
    this.tuneMaterials();
  },

  // Paleta mais fria e sombria para o cenário
  tuneMaterials() {
    for (const name of PROPS) {
      // A NATUREZA (pacote de floresta) mantém a cor da textura, só escurecida
      // para a noite: com o tom de pedra/madeira abaixo, as árvores sairiam
      // cinza-marrom, indistinguíveis das ruínas em volta.
      const natureza = /^(Tree|Bush|Grass|Rock)_/.test(name);
      // Os pacotes QUATERNIUS (prefixo do pacote no nome) têm a cor no próprio
      // material — o tronco low poly não tem textura nenhuma. Trocar a cor o
      // deixaria cinza; ela é MULTIPLICADA pelo mesmo tom da natureza (escurecer
      // para a noite). Uma vez por material: um material repetido em duas
      // malhas escureceria duas vezes.
      if (/^(megakit|vila|estilizada|arvores|natureza|plantio)-/.test(name)) {
        const vistos = new Set();
        this.props[name].traverse((c) => {
          if (!c.isMesh || vistos.has(c.material)) return;
          vistos.add(c.material);
          c.material.color.multiply(new THREE.Color(0xa8b4a8));
        });
        continue;
      }
      const stone = /wall|floor|pillar|column|rubble|barrier/.test(name);
      const cor = natureza ? 0xa8b4a8 : stone ? 0x6f6a66 : 0x8a8078;
      this.props[name].traverse((c) => { if (c.isMesh) c.material.color.setHex(cor); });
    }
    this.baseScene.traverse((c) => {
      if (c.isMesh) {
        c.material.roughness = 0.85; c.material.metalness = 0.1;
        c.material.color.setHex(c.material.name === 'M_Joints' ? 0x1c1916 : 0x2f2925);
      }
    });
  },

  character() {
    const scene = cloneSkinned(this.baseScene);
    const materials = [];
    scene.traverse((c) => {
      if (c.isMesh) { c.material = c.material.clone(); materials.push(c.material); c.frustumCulled = false; }
    });
    return { scene, materials };
  },

  // de novo, se o carregamento do começo falhou (o provador tenta outra vez)
  carregarGuerreiro() {
    this._guerreiro ??= new GLTFLoader().loadAsync('assets/guerreiro/guerreiro.glb')
      .then((gltf) => { this.guerreiro = gltf.scene; return true; })
      .catch((e) => { console.warn('[guerreiro] não carregou:', e.message); this._guerreiro = null; return false; });
    return this.guerreiro ? Promise.resolve(true) : this._guerreiro;
  },

  prop(name) { return this.props[name].clone(true); },

  meshInfo(name) {
    const root = this.props[name];
    root.updateMatrixWorld(true);
    let info = null;
    root.traverse((c) => { if (c.isMesh && !info) info = { geometry: c.geometry, material: c.material, matrix: c.matrixWorld.clone() }; });
    return info;
  },
};
