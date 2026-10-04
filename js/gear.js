// Armaduras, ossos e armas medievais procedurais, presos ao esqueleto do manequim (Quaternius UAL).
// Todas as peças são modeladas em espaço de mundo na pose T (manequim de 1,83 m virado para +Z,
// braço esquerdo em +X) e depois presas ao osso com bone.attach(), então seguem qualquer animação.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/jsm/environments/RoomEnvironment.js';
import { Assets } from './assets.js';
import { montarModelo } from './blocos.js';

export const Gear = { env: null, mats: {} };

function grimeTexture(seed, base = 180, spread = 70) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  let s = seed;
  const r = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  g.fillStyle = `rgb(${base},${base},${base})`; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2600; i++) {
    const v = base + (r() - 0.6) * spread;
    g.fillStyle = `rgba(${v},${v * 0.97},${v * 0.92},${0.25 + r() * 0.4})`;
    const w = 2 + r() * 14;
    g.fillRect(r() * 256, r() * 256, w, w * (0.3 + r()));
  }
  // Riscos
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 40; i++) { g.beginPath(); const x = r() * 256, y = r() * 256; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 60, y + (r() - 0.5) * 20); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// `reflexo`: o mapa de ambiente do CÉU (ceu.js) — as armas refletem o céu de agora; sem
// ele, o estúdio de antes (RoomEnvironment)
export function initGear(renderer, reflexo = null) {
  Gear.env = reflexo ?? new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  const grime = grimeTexture(7);
  const rust = grimeTexture(31, 150, 110);
  const cloth = grimeTexture(55, 170, 90);
  const std = (o) => new THREE.MeshStandardMaterial({ envMap: Gear.env, envMapIntensity: 0.4, ...o });
  Gear.mats = {
    steel: std({ color: 0x77787c, metalness: 0.65, roughness: 0.45, map: grime, envMapIntensity: 0.9 }),
    darkSteel: std({ color: 0x4c4d53, metalness: 0.6, roughness: 0.52, map: grime, envMapIntensity: 0.9 }),
    blade: std({ color: 0x9a9ca2, metalness: 0.95, roughness: 0.28, map: grime, envMapIntensity: 0.8 }),
    rusty: std({ color: 0x6a4a36, metalness: 0.6, roughness: 0.8, map: rust }),
    gold: std({ color: 0x7a5e2a, metalness: 0.9, roughness: 0.45, map: grime }),
    leather: std({ color: 0x3a2618, metalness: 0, roughness: 0.85, map: cloth, envMapIntensity: 0.15 }),
    darkLeather: std({ color: 0x1e1510, metalness: 0, roughness: 0.9, map: cloth, envMapIntensity: 0.1 }),
    wood: std({ color: 0x4a3322, metalness: 0, roughness: 0.9, map: cloth, envMapIntensity: 0.1 }),
    tabard: std({ color: 0x3d1512, metalness: 0, roughness: 1, map: cloth, side: THREE.DoubleSide, envMapIntensity: 0.1 }),
    cape: std({ color: 0x3b2c22, metalness: 0, roughness: 1, map: cloth, side: THREE.DoubleSide, envMapIntensity: 0.1 }),
    rag: std({ color: 0x3a342a, metalness: 0, roughness: 1, map: cloth, side: THREE.DoubleSide, envMapIntensity: 0.1 }),
    robe: std({ color: 0x1c1826, metalness: 0, roughness: 1, map: cloth, side: THREE.DoubleSide, envMapIntensity: 0.1 }),
    hood: std({ color: 0x0c0a0a, metalness: 0, roughness: 1, map: cloth, side: THREE.DoubleSide, envMapIntensity: 0.05 }),
    bone: std({ color: 0xbdb49c, metalness: 0, roughness: 0.8, map: grime, envMapIntensity: 0.2 }),
    socket: new THREE.MeshBasicMaterial({ color: 0x050303 }),
    under: std({ color: 0x2b2622, metalness: 0.3, roughness: 0.85, map: grime, envMapIntensity: 0.2 }),
    skin: std({ color: 0x6b5a4e, metalness: 0, roughness: 0.75, envMapIntensity: 0.15 }),
    orb: new THREE.MeshStandardMaterial({ color: 0x40107a, emissive: 0x8a3aff, emissiveIntensity: 2.2 }),
    torchHead: std({ color: 0x2a1a10, metalness: 0, roughness: 1, emissive: 0x401000 }),
  };
}

// ---------- Utilitários ----------
function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Cilindro entre dois pontos (espaço do mundo)
function segment(a, b, r0, r1, mat, radial = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const m = mesh(new THREE.CylinderGeometry(r1, r0, len, radial), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

function boneWorld(skel, name) { return skel.getObjectByName(name).getWorldPosition(new THREE.Vector3()); }
function attach(skel, boneName, obj) {
  const bone = skel.getObjectByName(boneName);
  bone.attach(obj);
  return obj;
}

// ---------- Armas (eixo da lâmina = +Z, origem no meio da empunhadura) ----------
export function makeWeapon(kind) {
  const M = Gear.mats;
  const g = new THREE.Group();
  const bladeGeo = (len, w, t) => {
    const b = new THREE.CylinderGeometry(1, 1, len, 4, 1);
    b.rotateY(Math.PI / 4); b.scale(w, 1, t); b.rotateX(Math.PI / 2);
    return b;
  };
  const tipGeo = (len, w, t) => {
    const b = new THREE.CylinderGeometry(0, 1, len, 4, 1);
    b.rotateY(Math.PI / 4); b.scale(w, 1, t); b.rotateX(Math.PI / 2);
    return b;
  };
  const sword = (bladeLen, w, gripLen, guardW, mat = M.blade, guardMat = M.darkSteel) => {
    g.add(mesh(new THREE.CylinderGeometry(0.017, 0.019, gripLen, 8).rotateX(Math.PI / 2), M.leather));
    g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), guardMat, 0, 0, -gripLen / 2 - 0.02));
    g.add(mesh(new THREE.BoxGeometry(guardW, 0.03, 0.035), guardMat, 0, 0, gripLen / 2 + 0.01));
    const z0 = gripLen / 2 + 0.03;
    g.add(mesh(bladeGeo(bladeLen, w, 0.008), mat, 0, 0, z0 + bladeLen / 2));
    g.add(mesh(tipGeo(w * 3.2, w, 0.008), mat, 0, 0, z0 + bladeLen + w * 1.6));
    g.userData.length = z0 + bladeLen + w * 3;
    g.userData.blade = mat;
  };
  switch (kind) {
    case 'longsword': sword(0.86, 0.034, 0.2, 0.22); break;
    case 'dagger': sword(0.32, 0.026, 0.11, 0.1); break;
    case 'greatsword': sword(1.3, 0.055, 0.36, 0.38); break;
    case 'rustySword': sword(0.72, 0.034, 0.18, 0.18, M.rusty, M.rusty); break;
    case 'axe': case 'rustyAxe': case 'greataxe': {
      const big = kind === 'greataxe';
      const hl = big ? 1.55 : 0.72;
      const headMat = kind === 'rustyAxe' ? M.rusty : M.steel;
      g.add(mesh(new THREE.CylinderGeometry(0.02, 0.024, hl, 8).rotateX(Math.PI / 2), M.wood, 0, 0, hl / 2 - 0.12));
      const shape = new THREE.Shape();
      const s = big ? 2.1 : 1;
      shape.moveTo(0, -0.05 * s);
      shape.quadraticCurveTo(0.12 * s, -0.08 * s, 0.2 * s, -0.17 * s);
      shape.quadraticCurveTo(0.26 * s, 0, 0.2 * s, 0.17 * s);
      shape.quadraticCurveTo(0.12 * s, 0.08 * s, 0, 0.05 * s);
      shape.lineTo(0, -0.05 * s);
      const hg = new THREE.ExtrudeGeometry(shape, { depth: 0.014 * s, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.006, bevelSegments: 1 });
      hg.translate(0, 0, -0.007 * s);
      // plano da lâmina contém o cabo (+Z) e a direção do corte (+Y do mundo na pose T)
      hg.rotateY(Math.PI / 2); hg.rotateX(-Math.PI / 2);
      const headZ = hl - 0.2 * (big ? 1.4 : 1);
      g.add(mesh(hg, headMat, 0, 0, headZ));
      if (big) { const back = mesh(hg.clone(), headMat, 0, 0, headZ); back.rotation.z = Math.PI; g.add(back); }
      g.add(mesh(new THREE.BoxGeometry(0.05, 0.05, 0.1 * s), M.darkSteel, 0, 0, headZ));
      g.userData.length = hl;
      g.userData.blade = headMat;
      break;
    }
    case 'staff': {
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.024, 1.7, 7).rotateX(Math.PI / 2), M.wood, 0, 0, 0.35));
      const orb = mesh(new THREE.SphereGeometry(0.065, 12, 10), M.orb, 0, 0, 1.25);
      g.add(orb);
      for (let i = 0; i < 3; i++) {
        const prong = segment(new THREE.Vector3(0, 0, 1.15), new THREE.Vector3(Math.cos(i * 2.1) * 0.06, Math.sin(i * 2.1) * 0.06, 1.33), 0.008, 0.004, M.wood);
        g.add(prong);
      }
      g.userData.orb = orb;
      g.userData.length = 1.3;
      break;
    }
    case 'torch': {
      g.add(mesh(new THREE.CylinderGeometry(0.022, 0.028, 0.55, 7).rotateX(Math.PI / 2), M.wood, 0, 0, 0.12));
      g.add(mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.12, 8).rotateX(Math.PI / 2), M.torchHead, 0, 0, 0.42));
      g.userData.flameAt = new THREE.Vector3(0, 0, 0.52);
      g.userData.length = 0.5;
      break;
    }
  }
  return g;
}

// Escudos: face do escudo perpendicular ao eixo Y da pose T (costas da mão)
export function makeShield(kind) {
  const M = Gear.mats;
  const g = new THREE.Group();
  if (kind === 'round' || kind === 'rustyRound') {
    const wood = kind === 'rustyRound' ? M.rusty : M.wood;
    g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.035, 22), wood));
    g.add(mesh(new THREE.TorusGeometry(0.3, 0.018, 6, 26).rotateX(Math.PI / 2), M.darkSteel));
    g.add(mesh(new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.steel, 0, 0.018, 0));
    for (let i = -1; i <= 1; i += 2) g.add(mesh(new THREE.BoxGeometry(0.6, 0.04, 0.035), M.darkSteel, 0, 0.012, i * 0.13));
  } else {
    // Escudo de cavaleiro (heater), aço escuro com cruz desgastada
    const s = new THREE.Shape();
    s.moveTo(-0.26, 0.34); s.lineTo(0.26, 0.34); s.lineTo(0.26, 0.02);
    s.quadraticCurveTo(0.24, -0.26, 0, -0.42); s.quadraticCurveTo(-0.24, -0.26, -0.26, 0.02); s.lineTo(-0.26, 0.34);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2 });
    geo.rotateX(-Math.PI / 2);
    g.add(mesh(geo, M.darkSteel));
    g.add(mesh(new THREE.BoxGeometry(0.06, 0.012, 0.62), M.gold, 0, 0.045, 0.02));
    g.add(mesh(new THREE.BoxGeometry(0.4, 0.012, 0.06), M.gold, 0, 0.045, 0.15));
  }
  return g;
}

// ---------- Trajes ----------
// O TRAJE DO ARQUIVO vence o do código: `assets/modelos/traje-<tipo>.json`,
// editado no Editor de modelo do editor de cenas. Os arquivos saíram DESTE
// código (`ferramentas/importar-trajes.mjs` roda o buildOutfit abaixo e anota
// cada peça), e um teste de lá confere que o arquivo monta o mesmo boneco,
// vértice por vértice. O código continua aqui como a volta: traje sem arquivo
// (ou arquivo que não carregou) é montado como sempre foi.
export const nomeDoTraje = (kind) => `traje-${kind.toLowerCase()}`;

export function buildOutfit(skel, kind) {
  const traje = Assets.modelos[nomeDoTraje(kind)];
  if (traje) return vestirDoArquivo(skel, traje);
  buildOutfitDoCodigo(skel, kind);
}

/**
 * Veste o boneco com um traje de ARQUIVO: monta as peças (`blocos.js`, a mesma
 * montagem do editor) e prende cada uma no osso dela MANTENDO o lugar da pose
 * T — o mesmo `attach` do código abaixo. Os materiais são os do jogo
 * (`Gear.mats`, com textura); a `cor` de uma primitiva troca só a cor dela.
 *
 * Os ganchos que o resto do jogo usa continuam existindo mesmo que o traje
 * editado os perca: `eyeMat` (o world.js apaga os olhos das ossadas) e
 * `eyeAnchor` (onde o Carrasco acende os olhos) — sem eles, o cadáver ou o
 * chefe derrubariam o jogo ao nascer.
 */
/**
 * Os materiais das PRIMITIVAS de um modelo de arquivo (traje ou bicho): os do
 * jogo (`Gear.mats`, com textura), e a `cor` de uma primitiva tinge uma cópia
 * só dela. Um por montagem: o `olho` é um material por boneco, como sempre foi
 * (o world.js apaga os olhos de uma ossada sem apagar os das outras).
 */
export function materiaisDoJogo() {
  const olho = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  const tingidos = new Map();
  const materialDe = (nome, cor) => {
    if (nome === 'olho') return olho;
    const base = Gear.mats[nome] ?? Gear.mats.steel;
    if (!cor) return base;
    const chave = `${nome}:${cor}`;
    if (!tingidos.has(chave)) { const m = base.clone(); m.color.set(cor); tingidos.set(chave, m); }
    return tingidos.get(chave);
  };
  return { materialDe, olho };
}

function vestirDoArquivo(skel, traje) {
  const { materialDe, olho } = materiaisDoJogo();
  const { raiz, pecas, ancoras } = montarModelo(traje, { materialDe });
  raiz.updateMatrixWorld(true);
  for (const p of traje.pecas) {
    const osso = p.osso && skel.getObjectByName(p.osso);
    if (osso) osso.attach(pecas.get(p.id));
    else if (!p.pai) skel.attach(pecas.get(p.id));   // sem osso nem pai: solta no boneco (a filha vai com o pai)
    if (p.osso && !osso) console.warn(`[traje] ${traje.nome}: o osso "${p.osso}" não existe no manequim`);
  }
  skel.userData.eyeMat = olho;
  skel.userData.eyeAnchor = ancoras.get('olhos')
    ?? attach(skel, 'Head', new THREE.Object3D().translateY(1.715).translateZ(0.15));
}

function buildOutfitDoCodigo(skel, kind) {
  const M = Gear.mats;
  const P = (n) => boneWorld(skel, n);
  const add = (bone, m) => attach(skel, bone, m);
  const sides = [['l', 1], ['r', -1]];

  const armor = (plate = M.darkSteel, trim = M.steel) => {
    // Elmo fechado
    const helm = new THREE.Group();
    helm.add(mesh(new THREE.CylinderGeometry(0.128, 0.132, 0.24, 18), plate, 0, 1.705, 0.012));
    helm.add(mesh(new THREE.SphereGeometry(0.128, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), plate, 0, 1.825, 0.012));
    helm.add(mesh(new THREE.BoxGeometry(0.2, 0.016, 0.03), M.socket, 0, 1.725, 0.14));
    helm.add(mesh(new THREE.BoxGeometry(0.022, 0.28, 0.03), trim, 0, 1.73, 0.137));
    for (let i = 0; i < 4; i++) helm.add(mesh(new THREE.BoxGeometry(0.012, 0.012, 0.03), M.socket, -0.07 + i * 0.012, 1.66, 0.135));
    helm.add(mesh(new THREE.TorusGeometry(0.13, 0.01, 6, 24).rotateX(Math.PI / 2), trim, 0, 1.59, 0.012));
    add('Head', helm);
    add('neck_01', mesh(new THREE.CylinderGeometry(0.095, 0.12, 0.1, 16), plate, 0, 1.52, -0.005));
    // Peitoral, placas do abdômen, cinto e saiote
    const chest = mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.3, 22), plate, 0, 1.34, 0.005); chest.scale.z = 0.8; add('spine_03', chest);
    const ridge = mesh(new THREE.BoxGeometry(0.02, 0.28, 0.03), trim, 0, 1.34, 0.158); add('spine_03', ridge);
    const belly = mesh(new THREE.CylinderGeometry(0.168, 0.158, 0.2, 20), plate, 0, 1.12, 0.005); belly.scale.z = 0.8; add('spine_01', belly);
    add('pelvis', mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.05, 18), M.leather, 0, 0.99, 0));
    const skirt = mesh(new THREE.CylinderGeometry(0.165, 0.22, 0.24, 20, 1, true), plate, 0, 0.86, 0); skirt.scale.z = 0.85; add('pelvis', skirt);
    for (const [s, n] of sides) {
      // Ombreiras em camadas
      const u = 'upperarm_' + s;
      const p1 = mesh(new THREE.SphereGeometry(0.12, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), plate, n * 0.2, 1.47, -0.055); p1.scale.set(1.25, 0.85, 1.15); add(u, p1);
      const p2 = mesh(new THREE.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), plate, n * 0.27, 1.43, -0.06); p2.scale.set(1.1, 0.7, 1.1); add(u, p2);
      add(u, segment(new THREE.Vector3(n * 0.22, 1.441, -0.066), new THREE.Vector3(n * 0.45, 1.441, -0.069), 0.055, 0.049, plate, 12));
      add('lowerarm_' + s, mesh(new THREE.SphereGeometry(0.056, 12, 8), trim, n * 0.466, 1.441, -0.07));
      add('lowerarm_' + s, segment(new THREE.Vector3(n * 0.49, 1.441, -0.069), new THREE.Vector3(n * 0.72, 1.441, -0.066), 0.051, 0.044, plate, 12));
      add('hand_' + s, mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.07, 12).rotateZ(Math.PI / 2), plate, n * 0.765, 1.441, -0.064));
      add('hand_' + s, mesh(new THREE.BoxGeometry(0.1, 0.035, 0.09), plate, n * 0.82, 1.452, -0.06));
      // Coxotes, joelheiras, grevas e sapatos de ferro
      const x = n * 0.089;
      add('thigh_' + s, segment(new THREE.Vector3(x, 0.9, 0.006), new THREE.Vector3(x, 0.57, 0.004), 0.088, 0.072, plate, 14));
      const knee = mesh(new THREE.SphereGeometry(0.068, 12, 8), trim, x, 0.535, 0.03); knee.scale.z = 1.15; add('calf_' + s, knee);
      add('calf_' + s, segment(new THREE.Vector3(x, 0.5, -0.004), new THREE.Vector3(x, 0.13, -0.025), 0.063, 0.052, plate, 14));
      add('foot_' + s, mesh(new THREE.BoxGeometry(0.105, 0.085, 0.27), plate, x, 0.055, 0.055));
    }
  };

  switch (kind) {
    case 'knight': {
      armor();
      // Tabardo rasgado e capa
      const tab = mesh(new THREE.PlaneGeometry(0.24, 0.5, 1, 4), M.tabard, 0, 0.68, 0.16); add('pelvis', tab);
      const tabB = mesh(new THREE.PlaneGeometry(0.24, 0.45, 1, 4), M.tabard, 0, 0.7, -0.15); add('pelvis', tabB);
      const capeGeo = new THREE.PlaneGeometry(0.5, 1.0, 4, 6);
      const pos = capeGeo.attributes.position;
      for (let i = 0; i < pos.count; i++) { if (pos.getY(i) < -0.4) pos.setY(i, pos.getY(i) + (Math.sin(i * 7.3) * 0.5 + 0.5) * 0.12); pos.setZ(i, -Math.pow((pos.getY(i) - 0.5) / 1, 2) * 0.12); }
      capeGeo.computeVertexNormals();
      add('spine_03', mesh(capeGeo, M.cape, 0, 0.98, -0.17));
      break;
    }
    case 'corpse': armor(M.rusty, M.rusty); break;
    case 'executioner': {
      // Capuz pontudo, avental de couro, braçadeiras e botas
      const hood = new THREE.Group();
      const dome = mesh(new THREE.SphereGeometry(0.135, 18, 14), M.hood, 0, 1.7, 0.01); dome.scale.set(1, 1.15, 1.08); hood.add(dome);
      const tip = mesh(new THREE.ConeGeometry(0.09, 0.22, 14), M.hood, 0, 1.9, -0.04); tip.rotation.x = -0.35; hood.add(tip);
      hood.add(mesh(new THREE.CylinderGeometry(0.14, 0.23, 0.16, 18, 1, true), M.hood, 0, 1.5, 0));
      add('Head', hood);
      skel.userData.eyeAnchor = add('Head', new THREE.Object3D().translateY(1.715).translateZ(0.15));
      const apron = mesh(new THREE.PlaneGeometry(0.34, 0.95, 1, 6), M.darkLeather, 0, 0.92, 0.17); add('spine_01', apron);
      add('spine_02', mesh(new THREE.TorusGeometry(0.17, 0.02, 6, 20).rotateX(Math.PI / 2), M.leather, 0, 1.2, 0));
      add('pelvis', mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.07, 18), M.leather, 0, 0.99, 0));
      add('spine_03', segment(new THREE.Vector3(0.17, 1.46, 0.1), new THREE.Vector3(-0.15, 1.02, 0.15), 0.025, 0.025, M.leather));
      for (const [s, n] of sides) {
        add('lowerarm_' + s, segment(new THREE.Vector3(n * 0.55, 1.441, -0.069), new THREE.Vector3(n * 0.73, 1.441, -0.066), 0.058, 0.05, M.darkLeather, 12));
        const x = n * 0.089;
        add('calf_' + s, segment(new THREE.Vector3(x, 0.45, -0.004), new THREE.Vector3(x, 0.08, -0.02), 0.07, 0.068, M.darkLeather, 12));
        add('foot_' + s, mesh(new THREE.BoxGeometry(0.11, 0.1, 0.28), M.darkLeather, x, 0.06, 0.055));
        add('thigh_' + s, segment(new THREE.Vector3(x, 0.93, 0.006), new THREE.Vector3(x, 0.55, 0.004), 0.1, 0.085, M.darkLeather, 12));
      }
      const pauldron = mesh(new THREE.SphereGeometry(0.15, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.rusty, 0.21, 1.47, -0.05);
      pauldron.scale.set(1.3, 0.9, 1.2); add('upperarm_l', pauldron);
      break;
    }
    default: {
      // Esqueletos: ossos reais sobre o rig
      buildSkeleton(skel);
      if (kind === 'skWarrior') {
        const helm = new THREE.Group();
        helm.add(mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.rusty, 0, 1.73, 0.01));
        helm.add(mesh(new THREE.CylinderGeometry(0.155, 0.16, 0.015, 20), M.rusty, 0, 1.735, 0.01));
        helm.add(mesh(new THREE.BoxGeometry(0.022, 0.1, 0.02), M.rusty, 0, 1.69, 0.115));
        add('Head', helm);
        const pd = mesh(new THREE.SphereGeometry(0.11, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), M.rusty, 0.2, 1.47, -0.05); pd.scale.set(1.25, 0.85, 1.15); add('upperarm_l', pd);
        add('pelvis', rag(0.15, 0.22, 0.36, 0.84, M.rag));
      } else if (kind === 'skMinion') {
        add('pelvis', rag(0.14, 0.2, 0.3, 0.85, M.rag));
      } else if (kind === 'skRogue') {
        const hood = mesh(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), M.rag, 0, 1.69, -0.01);
        hood.scale.set(1, 1.15, 1.1); add('Head', hood);
        add('spine_03', mesh(new THREE.CylinderGeometry(0.13, 0.25, 0.22, 16, 1, true), M.rag, 0, 1.44, -0.01));
        add('pelvis', rag(0.15, 0.2, 0.32, 0.84, M.darkLeather));
      } else if (kind === 'skMage') {
        const hood = mesh(new THREE.ConeGeometry(0.17, 0.45, 16, 1, true), M.robe, 0, 1.8, -0.02); add('Head', hood);
        add('spine_03', mesh(new THREE.CylinderGeometry(0.16, 0.22, 0.45, 16, 1, true), M.robe, 0, 1.3, 0));
        add('pelvis', rag(0.2, 0.34, 0.85, 0.55, M.robe));
      }
    }
  }
}

// Saiote de pano com a barra rasgada
function rag(r0, r1, h, y, mat) {
  const geo = new THREE.CylinderGeometry(r0, r1, h, 16, 3, true);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -h / 2 + 0.01) p.setY(i, p.getY(i) + ((i * 7919) % 13) / 13 * h * 0.35);
  geo.computeVertexNormals();
  return mesh(geo, mat, 0, y, 0);
}

function buildSkeleton(skel) {
  const M = Gear.mats;
  const P = (n) => boneWorld(skel, n);
  const add = (bone, m) => attach(skel, bone, m);
  const link = (a, b, r0, r1 = r0, joint = true) => {
    const pa = P(a), pb = P(b);
    add(a, segment(pa, pb, r0, r1, M.bone, 7));
    if (joint) add(b, mesh(new THREE.SphereGeometry(r1 * 1.35, 8, 6), M.bone, pb.x, pb.y, pb.z));
  };
  // Coluna
  link('pelvis', 'spine_01', 0.022); link('spine_01', 'spine_02', 0.022); link('spine_02', 'spine_03', 0.021);
  link('spine_03', 'neck_01', 0.018); link('neck_01', 'Head', 0.016, 0.016, false);
  for (const [s, n] of [['l', 1], ['r', -1]]) {
    link('clavicle_' + s, 'upperarm_' + s, 0.014, 0.016);
    link('upperarm_' + s, 'lowerarm_' + s, 0.021, 0.018);
    // Rádio e ulna
    const a = P('lowerarm_' + s), b = P('hand_' + s);
    add('lowerarm_' + s, segment(a.clone().add(new THREE.Vector3(0, 0, 0.012)), b.clone().add(new THREE.Vector3(0, 0, 0.01)), 0.011, 0.01, M.bone, 6));
    add('lowerarm_' + s, segment(a.clone().add(new THREE.Vector3(0, 0, -0.014)), b.clone().add(new THREE.Vector3(0, 0, -0.012)), 0.012, 0.011, M.bone, 6));
    add('hand_' + s, mesh(new THREE.BoxGeometry(0.09, 0.02, 0.07), M.bone, n * 0.8, 1.44, -0.06));
    for (let f = 0; f < 4; f++) add('hand_' + s, mesh(new THREE.BoxGeometry(0.08, 0.012, 0.012), M.bone, n * 0.88, 1.44, -0.035 - f * 0.024));
    link('thigh_' + s, 'calf_' + s, 0.03, 0.025);
    link('calf_' + s, 'foot_' + s, 0.022, 0.02);
    add('foot_' + s, mesh(new THREE.BoxGeometry(0.07, 0.04, 0.2), M.bone, n * 0.089, 0.04, 0.07));
  }
  // Bacia
  const hip = mesh(new THREE.TorusGeometry(0.1, 0.028, 6, 14), M.bone, 0, 0.94, 0); hip.rotation.x = Math.PI / 2 + 0.3; hip.scale.set(1.25, 1, 0.8); add('pelvis', hip);
  // Costelas
  for (let i = 0; i < 6; i++) {
    const y = 1.2 + i * 0.045;
    const r = 0.12 + Math.sin((i / 5) * Math.PI) * 0.035;
    const rib = mesh(new THREE.TorusGeometry(r, 0.01, 5, 18, Math.PI * 1.55), M.bone, 0, y, -0.01);
    rib.rotation.x = Math.PI / 2; rib.rotation.z = -Math.PI / 2 + Math.PI * 0.225 * 2 + Math.PI;
    rib.scale.set(1.05, 0.8, 1);
    add(i < 3 ? 'spine_02' : 'spine_03', rib);
  }
  add('spine_03', mesh(new THREE.BoxGeometry(0.03, 0.2, 0.015), M.bone, 0, 1.3, 0.13));
  // Crânio, órbitas, mandíbula e olhos brilhando
  const skull = new THREE.Group();
  const cran = mesh(new THREE.SphereGeometry(0.1, 16, 12), M.bone, 0, 1.71, 0.0); cran.scale.set(0.88, 1, 1.08); skull.add(cran);
  skull.add(mesh(new THREE.BoxGeometry(0.1, 0.06, 0.08), M.bone, 0, 1.64, 0.05));
  for (const n of [-1, 1]) skull.add(mesh(new THREE.SphereGeometry(0.026, 8, 6), M.socket, n * 0.037, 1.705, 0.085));
  skull.add(mesh(new THREE.BoxGeometry(0.085, 0.03, 0.085), M.bone, 0, 1.6, 0.045));
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffa040 });
  for (const n of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 6, 4), eyeMat); e.position.set(n * 0.037, 1.705, 0.1); skull.add(e); }
  add('Head', skull);
  skel.userData.eyeMat = eyeMat;
}

export { attach as attachToBone };
