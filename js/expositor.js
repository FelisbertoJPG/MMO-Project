/**
 * OS EXPOSITORES (16/10/2026) — o SUPORTE DE ARMAS e o CAVALETE DE ARMADURA, feitos em código
 * (os pacotes não têm: o `weaponrack` do KayKit é uma miniatura com as armas moldadas na peça),
 * com os ITENS DE VERDADE neles: as armas do jogo (`weaponMesh`/`shieldMesh`) em pé no suporte e
 * as peças da armadura do guerreiro (as do `guerreiro.glb`, na pose do arquivo — os braços
 * abertos, no travessão do cavalete) vestidas no cavalete.
 *
 * Chegando perto, cada item se PEGA (E; a ficha do item caído aparece — ui.js `mostrarLoot`); ou
 * o expositor se QUEBRA no golpe (é um quebrável LOCAL, como o mato: a madeira se parte pela
 * fratura e volta inteira depois, vazia) e o que ainda estava nele CAI NO CHÃO como item caído,
 * para pegar. O que já saiu de cada um fica no save do personagem (`mundo.expositores`).
 *
 * O lugar de cada um é ACHADO perto da fogueira dele (`lugarLivre`: o primeiro ponto do anel,
 * a partir do rumo pedido, sem parede, água, colisão nem o terreiro da fogueira por perto) — mexer
 * na decoração não os enterra num barril. Expositor novo = uma linha em `EXPOSITORES`.
 */
import * as THREE from 'three';
import { Assets } from './assets.js';
import { Gear } from './gear.js';
import { weaponMesh, shieldMesh } from './character.js';
import { ITEMS, raridadeDe } from './items.js';

export const EXPOSITORES = [
  // o acampamento: a espada longa e o machado; o couro do Batedor
  { tipo: 'armas', perto: 'acampamento', rumo: 0.6, itens: ['longsword', 'axe', 'shieldRound'] },
  { tipo: 'armadura', perto: 'acampamento', rumo: -0.7, conjunto: 1, itens: ['arm1_peito', 'arm1_bracos', 'arm1_pernas'] },
  // a masmorra: o espadão e o escudo de cavaleiro; a malha do Sentinela
  { tipo: 'armas', perto: 'masmorra', rumo: 2.2, itens: ['greatsword', 'shieldKnight'] },
  { tipo: 'armadura', perto: 'masmorra', rumo: -2.2, conjunto: 2, itens: ['arm2_cabeca', 'arm2_peito', 'arm2_bracos', 'arm2_pernas'] },
];

const MADEIRA = 0x5a3d26;

/** Monta todos (no fim do World): devolve a lista, com os quebráveis e os interagíveis já no mundo. */
export function montarExpositores(world) {
  const lista = [];
  EXPOSITORES.forEach((def, n) => {
    const f = world.fogueira(def.perto);
    if (!f || f.id !== def.perto) return;
    const lugar = lugarLivre(world, f.pos, def.rumo);
    if (!lugar) { console.warn(`[expositor] sem lugar livre perto da fogueira ${def.perto}`); return; }
    const exp = { n, def, pos: lugar, itens: [] };
    // virado para a fogueira
    const giro = Math.atan2(f.pos.x - lugar.x, f.pos.z - lugar.z);
    const chao = world.alturaChao(lugar);
    const armacao = def.tipo === 'armas' ? armacaoDeArmas() : armacaoDeArmadura();
    armacao.position.set(lugar.x, chao, lugar.z); armacao.rotation.y = giro;
    const itens = new THREE.Group();
    itens.position.copy(armacao.position); itens.rotation.y = giro;
    world.scene.add(armacao, itens);
    itens.updateMatrixWorld(true);
    const objetos = def.tipo === 'armas' ? armasNoSuporte(def.itens) : armaduraNoCavalete(def.conjunto, def.itens);
    def.itens.forEach((id, k) => {
      const obj = objetos[k];
      if (!obj) return;
      itens.add(obj);
      obj.updateMatrixWorld(true);
      const ponto = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
      const it = { type: 'expositor', exp, k, itemId: id, qty: 1, raridade: raridadeDe(id), obj, ponto,
        mesh: { position: ponto }, pos: new THREE.Vector3(ponto.x, 0, ponto.z), radius: 1.25, label: `Pegar ${ITEMS[id]?.name ?? id}` };
      exp.itens.push(it);
      world.interactables.push(it);
    });
    // o quebrável (LOCAL: só quem quebrou vê, e volta inteiro depois — como o mato)
    const circulo = { x: lugar.x, z: lugar.z, r: def.tipo === 'armas' ? 0.75 : 0.45 };
    world.circles.push(circulo);
    const q = { i: -1 - n, prop: `expositor-${def.tipo}`, cfg: { local: true, pedacos: 9, cor: MADEIRA, expositor: exp }, raiz: armacao, pos: lugar.clone(), raio: circulo.r + 0.2, circulo, rCirculo: circulo.r, quebrado: false };
    world.quebraveis.push(q);
    exp.q = q;
    lista.push(exp);
  });
  return lista;
}

/** Tira o item `k` do expositor (pegou, ou caiu no chão): some dele e para de ser interagível. */
export function tirarDoExpositor(world, exp, k) {
  const it = exp.itens[k];
  if (!it || it.tirado) return;
  it.tirado = true;
  it.obj.visible = false;
  world.interactables = world.interactables.filter((x) => x !== it);
}

/** O expositor quebrou: o que ainda estava nele cai no chão em volta (itens caídos, para pegar). */
export function derrubarItens(world, exp, origem) {
  for (const it of exp.itens) {
    if (it.tirado) continue;
    tirarDoExpositor(world, exp, it.k);
    const a = Math.random() * Math.PI * 2, d = 0.5 + Math.random() * 0.8;
    const de = origem ? Math.atan2(exp.pos.x - origem.x, exp.pos.z - origem.z) : a;
    const rumo = de + (Math.random() - 0.5) * 1.8;
    world.addPickup(it.itemId, 1, { x: exp.pos.x + Math.sin(rumo) * d, z: exp.pos.z + Math.cos(rumo) * d }, true);
  }
}

/** O que saiu de cada expositor, para o save: uma lista de `true` por item tirado. */
export function estadoDosExpositores(world) { return (world.expositores ?? []).map((e) => e.itens.map((it) => !!it.tirado)); }

/** Põe o estado salvo (o que falta no save, volta para o expositor). */
export function aplicarExpositores(world, salvo) {
  (world.expositores ?? []).forEach((exp, n) => {
    exp.itens.forEach((it, k) => {
      const tirado = !!salvo?.[n]?.[k];
      if (tirado) tirarDoExpositor(world, exp, k);
      else if (it.tirado) { it.tirado = false; it.obj.visible = true; world.interactables.push(it); }
    });
  });
}

// ------------------------------------------------------------------ o lugar

/** O primeiro ponto livre num anel em volta de `centro`, começando do `rumo` pedido. */
function lugarLivre(world, centro, rumo) {
  // as caixas das peças da decoração por perto (objetos, construções, pedras)
  const caixas = [];
  for (const cat of ['objeto', 'construcao', 'pedra']) {
    for (const d of world.decorPorCategoria?.[cat] ?? []) {
      if (Math.hypot(d.obj.position.x - centro.x, d.obj.position.z - centro.z) > 12) continue;
      d.obj.updateMatrixWorld(true);
      caixas.push(new THREE.Box3().setFromObject(d.obj));
    }
  }
  for (const raio of [4.6, 5.4, 3.9, 6.2]) {
    for (let k = 0; k < 24; k++) {
      const a = rumo + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 12);
      const p = new THREE.Vector3(centro.x + Math.sin(a) * raio, 0, centro.z + Math.cos(a) * raio);
      if (world.solidAt(p.x, p.z, 1.1)) continue;
      if (world.fundoDaAgua?.(p.x, p.z) > -0.5) continue;
      if (world.circles.some((c) => c.r > 0 && Math.hypot(c.x - p.x, c.z - p.z) < c.r + 1.2)) continue;
      if (world.interactables.some((i) => i.pos && Math.hypot(i.pos.x - p.x, i.pos.z - p.z) < 1.6)) continue;
      // nem em cima de uma peça da decoração (um colchonete não tem colisão, mas está lá): pela CAIXA dela
      if (caixas.some((c) => p.x > c.min.x - 0.7 && p.x < c.max.x + 0.7 && p.z > c.min.z - 0.7 && p.z < c.max.z + 0.7)) continue;
      return p;
    }
  }
  return null;
}

// ------------------------------------------------------------------ as armações (madeira)

const caixa = (l, a, p, x, y, z, mat) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(l, a, p), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  return m;
};

/** O suporte de armas: dois pés, o trilho de baixo (onde o cabo assenta) e o travessão de cima. */
function armacaoDeArmas() {
  const g = new THREE.Group(), M = Gear.mats.wood;
  for (const x of [-0.8, 0.8]) {
    g.add(caixa(0.09, 1.55, 0.09, x, 0.78, 0, M));        // os pés
    g.add(caixa(0.12, 0.07, 0.55, x, 0.035, 0, M));       // as sapatas
  }
  g.add(caixa(1.72, 0.08, 0.08, 0, 1.38, -0.12, M));      // o travessão (onde a lâmina encosta)
  g.add(caixa(1.72, 0.12, 0.3, 0, 0.2, 0.02, M));         // o trilho de baixo
  g.add(caixa(1.72, 0.05, 0.05, 0, 0.8, -0.12, M));       // a travessa do meio
  return g;
}

/** O cavalete: a cruz de pé no chão, o mastro, o travessão dos ombros e a cabeça. */
function armacaoDeArmadura() {
  const g = new THREE.Group(), M = Gear.mats.wood;
  const ombro = alturaDoOsso(/upper_?arm|shoulder/i) ?? 1.42, cabeca = alturaDoOsso(/^head|head$/i) ?? 1.62;
  g.add(caixa(0.75, 0.07, 0.12, 0, 0.035, 0, M));
  g.add(caixa(0.12, 0.07, 0.75, 0, 0.035, 0, M));
  const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, cabeca, 8), M);
  mastro.position.y = cabeca / 2; mastro.castShadow = true;
  g.add(mastro);
  g.add(caixa(1.25, 0.06, 0.06, 0, ombro, -0.02, M));
  const bola = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), M);
  bola.position.y = cabeca + 0.05; bola.castShadow = true;
  g.add(bola);
  return g;
}

/**
 * A ESCALA do guerreiro: o arquivo é em CENTÍMETROS — a mesma conta do `CorpoGuerreiro` (o quadril
 * dele na altura do quadril do manequim UAL).
 */
function escalaDoGuerreiro() {
  const b = Assets.baseScene, g = Assets.guerreiro;
  if (!b || !g) return 0.01;
  b.updateMatrixWorld(true); g.updateMatrixWorld(true);
  const hu = b.getObjectByName('pelvis')?.getWorldPosition(new THREE.Vector3()).y;
  const hg = g.getObjectByName('Hips')?.getWorldPosition(new THREE.Vector3()).y;
  return hu > 0 && hg > 0 ? hu / hg : 0.01;
}

/** A altura de um osso do guerreiro na pose do arquivo (em metros). */
function alturaDoOsso(re) {
  const c = Assets.guerreiro;
  if (!c) return null;
  c.updateMatrixWorld(true);
  let y = null;
  c.traverse((o) => { if (y == null && o.isBone && re.test(o.name)) y = o.getWorldPosition(new THREE.Vector3()).y; });
  return y == null ? null : y * escalaDoGuerreiro();
}

// ------------------------------------------------------------------ os itens

/** As armas em pé no suporte (o cabo no trilho, a lâmina encostada no travessão); o escudo, na ponta. */
function armasNoSuporte(ids) {
  const armas = ids.filter((id) => ITEMS[id]?.type !== 'shield'), comEscudo = armas.length < ids.length;
  const largura = comEscudo ? 0.95 : 1.4, passo = largura / Math.max(1, armas.length);
  let i = 0;
  return ids.map((id) => {
    const def = ITEMS[id];
    if (!def?.model) return null;
    if (def.type === 'shield') {
      const s = shieldMesh(def.model);
      const casca = new THREE.Group(); casca.add(s);
      s.rotation.x = Math.PI / 2 - 0.25;          // de pé, encostado
      casca.position.set(0.5, 0.62, 0.22);
      return casca;
    }
    const m = weaponMesh(def.model);
    m.rotation.x = -Math.PI / 2 + 0.16;           // em pé (a arma é feita para +Z), encostada para trás
    m.position.set(-0.72 + passo * (i + 0.5), 0.27, 0.06);
    i++;
    const casca = new THREE.Group(); casca.add(m);
    return casca;
  });
}

/**
 * As peças da armadura do guerreiro (o conjunto `n`: as malhas `A<n>_…`), cada lugar do item, na
 * pose do arquivo ("assadas": sem ossos), com a aparência do corpo do jogo (o mesmo acerto do
 * `CorpoGuerreiro`: rugosidade, sem metal, o reflexo do céu).
 */
function armaduraNoCavalete(n, ids) {
  const fonte = Assets.guerreiro;
  if (!fonte) return ids.map(() => null);
  fonte.updateMatrixWorld(true);
  const re = new RegExp(`^A${n}_`), v = new THREE.Vector3(), k = escalaDoGuerreiro();
  const LUGAR = [['cabeca', /Helmet/i], ['bracos', /Forearm/i], ['pernas', /Boot|Pant|Knee|Thigh/i]];
  const lugarDe = (nome) => LUGAR.find(([, r]) => r.test(nome))?.[0] ?? 'peito';
  const mats = new Map();
  const porLugar = new Map();
  fonte.traverse((o) => {
    if (!o.isSkinnedMesh || !re.test(o.name)) return;
    const g = o.geometry.clone(), pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { o.applyBoneTransform(i, v.fromBufferAttribute(pos, i)); v.applyMatrix4(o.matrixWorld).multiplyScalar(k); pos.setXYZ(i, v.x, v.y, v.z); }
    g.deleteAttribute('skinIndex'); g.deleteAttribute('skinWeight');
    g.computeVertexNormals(); g.computeBoundingSphere();
    if (!mats.has(o.material)) {
      const m = o.material.clone();
      m.roughness = 0.85; m.metalness = 0;
      if (Gear.env) { m.envMap = Gear.env; m.envMapIntensity = 0.5; }
      mats.set(o.material, m);
    }
    const malha = new THREE.Mesh(g, mats.get(o.material));
    malha.castShadow = true; malha.receiveShadow = true;
    const lugar = lugarDe(o.name);
    if (!porLugar.has(lugar)) porLugar.set(lugar, new THREE.Group());
    porLugar.get(lugar).add(malha);
  });
  return ids.map((id) => porLugar.get(ITEMS[id]?.lugar) ?? null);
}
