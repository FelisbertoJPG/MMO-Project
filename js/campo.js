/**
 * O CAMPO (05/10/2026) — a arte do chão do ar livre, toda DESENHADA EM CÓDIGO (nenhum arquivo
 * de imagem), no jeito dos campos estilizados: uma imagem leve que se repete, e a cor vindo
 * do terreno. (O atlas de cartas do capim saiu na 2026-10-11.7: o capim é de geometria, `capim.js`.)
 *
 *  • `texturaDoChao()` — 256 px repetidos a cada `REPETE_CHAO` m: só manchas suaves de
 *    claro/escuro e uns fiapos, perto do branco (multiplica a cor de vértice do chão).
 *  • `corDoChao(world, x, z, alvo)` — A COR DO TERRENO num ponto: a grama do `decor.json`
 *    com manchas amareladas (ruído largo), variação fina, mais escura junto à rocha e mais
 *    clara e amarela nos campos (as WindHills). O CHÃO (`buildGrass`, cor por vértice) e o
 *    CAPIM (a cor de cada touceira) usam esta mesma conta: o pé do capim some no chão.
 */
import * as THREE from 'three';
import { Assets } from './assets.js';

export const REPETE_CHAO = 4;   // metros por repetição da textura do chão

// ------------------------------------------------------------ ruído (determinístico)
const hash = (i, k) => { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sv = (t) => t * t * (3 - 2 * t);
function ruido(x, z) {
  const i = Math.floor(x), k = Math.floor(z), tx = sv(x - i), tz = sv(z - k);
  const a = hash(i, k), b = hash(i + 1, k), c = hash(i, k + 1), d = hash(i + 1, k + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;   // 0..1
}

// ------------------------------------------------------------ a cor do terreno
const _amarelo = new THREE.Color(0xa8c048), _escuro = new THREE.Color(0x2f6030), _base = new THREE.Color();
const _vivo = new THREE.Color(0x7cb444), _terra = new THREE.Color(0xb39a6c), _terraEscura = new THREE.Color(0x8f7650);
const _areia = new THREE.Color(0xe6d9a8), _areiaMolhada = new THREE.Color(0xbfd7b4);
let baseGrama = null;
/** A cor do chão em (x, z), em `alvo` (um THREE.Color). */
export function corDoChao(world, x, z, alvo = new THREE.Color()) {
  if (!baseGrama) baseGrama = new THREE.Color(Assets.grama ?? '#4e8f4f');
  _base.copy(baseGrama).lerp(_vivo, 0.45);   // o verde do decor.json puxado para o claro-amarelado
  // manchas largas amareladas (~45 m) e variação fina (~9 m)
  const largo = ruido(x / 45 + 11.3, z / 45 - 4.1), fino = ruido(x / 9 - 2.2, z / 9 + 7.9);
  let amarelo = Math.max(0, largo - 0.45) * 0.9;
  // nos campos (WindHills) mais claro e amarelo; o alto dos morros também
  if (world?.areaRelevo) {
    const [[r0, c0], [r1, c1]] = world.areaRelevo, r = z / 6, c = x / 6;
    if (r >= r0 && r <= r1 && c >= c0 && c <= c1) amarelo += 0.12;
  }
  const alto = world?.relevoEm ? Math.max(0, world.relevoEm(x, z)) : 0;
  amarelo += Math.min(0.15, alto * 0.02);
  alvo.copy(_base).lerp(_amarelo, Math.min(0.55, amarelo));
  // junto à rocha (a borda do mapa): mais escuro, como sob as árvores
  if (world?.pertoDaRocha?.(x, z, 3)) alvo.lerp(_escuro, 0.3);
  alvo.multiplyScalar(0.92 + fino * 0.16);
  // os CAMINHOS: terra batida (com manchas mais escuras), a borda virando grama
  const caminho = caminhoEm(world, x, z);
  if (caminho > 0.01) alvo.lerp(_base.copy(_terra).lerp(_terraEscura, ruido(x / 2.3, z / 2.3) * 0.6), Math.min(1, caminho * 1.15));
  // a ÁGUA (js/agua.js): AREIA na praia (do capim à beira, com a borda irregular) e no fundo, onde
  // ela vai ficando esverdeada com a profundidade (é o que se vê por dentro d'água)
  const fundo = world?.fundoDaAgua ? world.fundoDaAgua(x, z) : -Infinity;
  if (fundo > -0.5) {
    const t = Math.min(1, Math.max(0, (fundo + 0.42 + (fino - 0.5) * 0.12) / 0.24));
    alvo.lerp(_base.copy(_areia).multiplyScalar(0.93 + fino * 0.12), t * t * (3 - 2 * t));
    if (fundo > 0) alvo.lerp(_areiaMolhada, Math.min(0.6, fundo * 0.9));
  }
  return alvo;
}

// ------------------------------------------------------------ a textura do chão
export function texturaDoChao() {
  const T = 256, c = document.createElement('canvas');
  c.width = c.height = T;
  const g = c.getContext('2d'), img = g.createImageData(T, T);
  // manchas suaves que REPETEM sem costura (o ruído é periódico em T)
  const per = (x, z, f) => {
    const n = T / f, i = Math.floor(x / f), k = Math.floor(z / f), tx = sv(x / f - i), tz = sv(z / f - k);
    const h = (a, b) => hash(((a % n) + n) % n, ((b % n) + n) % n);
    const a = h(i, k), b = h(i + 1, k), cc = h(i, k + 1), d = h(i + 1, k + 1);
    return a + (b - a) * tx + (cc - a) * tz + (a - b - cc + d) * tx * tz;
  };
  for (let z = 0; z < T; z++) for (let x = 0; x < T; x++) {
    const v = 0.9 + per(x, z, 64) * 0.08 + per(x, z, 16) * 0.05 + per(x, z, 4) * 0.025;
    const i = (z * T + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(Math.min(1, v) * 255); img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // fiapos de capim rasteiro (um pouco mais escuros), espalhados sem costura
  let s = 91; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 1.4; g.lineCap = 'round';
  for (let n = 0; n < 260; n++) {
    const x = rnd() * T, z = rnd() * T, a = -Math.PI / 2 + (rnd() - 0.5) * 1.2, l = 4 + rnd() * 7;
    for (const [dx, dz] of [[0, 0], [T, 0], [-T, 0], [0, T], [0, -T]]) {
      g.beginPath(); g.moveTo(x + dx, z + dz); g.lineTo(x + dx + Math.cos(a) * l, z + dz + Math.sin(a) * l); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------ os CAMINHOS de terra
/**
 * OS CAMINHOS (05/10/2026): onde o chão é TERRA e o capim não nasce — como as trilhas dos
 * campos estilizados, em que o capim fechado só se abre nas passagens. Uma grade (o passo
 * do relevo, CELL/4) com 0 = capim e 1 = terra, feita uma vez ao montar o mundo
 * (`montarCaminhos`, ANTES do chão) e lida por `caminhoEm`:
 *  • a ESTRADA: uma faixa de terra que serpenteia pela linha 16, da porta da masmorra ao
 *    acampamento e às WindHills (`ESTRADA`);
 *  • as TRILHAS de pedra (as `RockPath` do decor.json) e as placas de terra/piso no ar
 *    livre: uma mancha de terra em volta de cada uma;
 *  • as FOGUEIRAS: um terreiro em volta.
 * A borda é suave (a terra vai virando grama), com um ruído para não sair redonda.
 */
const ESTRADA = { linha: 16, deColuna: 14.6, ateColuna: 64, meiaLargura: 1.25 };
const NA_TERRA = /RockPath|^floor_dirt|^floor_tile/;
const PASSO_CAMINHO = 1.5;

export function montarCaminhos(world) {
  const CELL = 6, S = 1.5, P = PASSO_CAMINHO;
  const nx = Math.ceil(world.cols * CELL / P) + 2, nz = Math.ceil(world.rows * CELL / P) + 2;
  const g = new Float32Array(nx * nz);
  const x0 = -CELL / 2, z0 = -CELL / 2;
  const marcar = (x, z, r, forca = 1) => {
    const i0 = Math.floor((x - r - x0) / P), i1 = Math.ceil((x + r - x0) / P);
    const k0 = Math.floor((z - r - z0) / P), k1 = Math.ceil((z + r - z0) / P);
    for (let k = Math.max(0, k0); k <= Math.min(nz - 1, k1); k++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) {
      const px = x0 + i * P, pz = z0 + k * P;
      const borda = r * (0.85 + 0.3 * ruido(px / 3.1 + 5, pz / 3.1 - 2));
      const v = forca * (1 - sv(Math.min(1, Math.max(0, (Math.hypot(px - x, pz - z) - borda * 0.55) / (borda * 0.45)))));
      if (v > g[k * nx + i]) g[k * nx + i] = v;
    }
  };
  // a estrada: pontos ao longo da linha central serpenteante
  for (let c = ESTRADA.deColuna; c <= Math.min(ESTRADA.ateColuna, world.cols - 1); c += 0.12) {
    const x = c * CELL;
    const z = ESTRADA.linha * CELL + Math.sin(x / 23) * 2.1 + Math.sin(x / 8.7 + 1.3) * 0.7;
    const larg = ESTRADA.meiaLargura * (0.8 + 0.5 * ruido(x / 11, 3.3));
    if (world.ch(Math.round(z / CELL), Math.round(x / CELL)) === 'f') marcar(x, z, larg * 1.6);
  }
  // as trilhas de pedra e as placas de terra do decor.json (só no ar livre)
  for (const d of Assets.decor ?? []) {
    if (!NA_TERRA.test(d.prop) || world.ch(d.cel[0], d.cel[1]) !== 'f') continue;
    const x = d.cel[1] * CELL + (d.off?.[0] ?? 0) * S, z = d.cel[0] * CELL + (d.off?.[1] ?? 0) * S;
    marcar(x, z, /RockPath/.test(d.prop) ? 2.2 * (d.escala ?? 1) : 3.2);
  }
  world.caminhos = { g, nx, nz, x0, z0, P };
}

/** Quanto do chão em (x, z) é terra (0 = capim, 1 = caminho), interpolado. */
export function caminhoEm(world, x, z) {
  const c = world?.caminhos;
  if (!c) return 0;
  const fx = (x - c.x0) / c.P, fz = (z - c.z0) / c.P, i = Math.floor(fx), k = Math.floor(fz);
  if (i < 0 || k < 0 || i >= c.nx - 1 || k >= c.nz - 1) return 0;
  const tx = fx - i, tz = fz - k, a = c.g[k * c.nx + i], b = c.g[k * c.nx + i + 1], d = c.g[(k + 1) * c.nx + i], e = c.g[(k + 1) * c.nx + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (d * (1 - tx) + e * tx) * tz;
}
/** Um terreiro de terra em volta de (x, z) — as fogueiras (chamado depois de montadas). */
export function terreiro(world, x, z, r = 3) {
  const c = world.caminhos;
  if (!c) return;
  for (let k = 0; k < c.nz; k++) for (let i = 0; i < c.nx; i++) {
    const px = c.x0 + i * c.P, pz = c.z0 + k * c.P, d = Math.hypot(px - x, pz - z);
    if (d > r) continue;
    const v = 1 - sv(Math.min(1, Math.max(0, (d - r * 0.55) / (r * 0.45))));
    if (v > c.g[k * c.nx + i]) c.g[k * c.nx + i] = v;
  }
}
