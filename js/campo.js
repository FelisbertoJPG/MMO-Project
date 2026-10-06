/**
 * O CAMPO (05/10/2026) — a arte do chão e do capim do ar livre, toda DESENHADA EM CÓDIGO
 * (nenhum arquivo de imagem), no jeito dos campos estilizados: poucas imagens leves que
 * se repetem, e a cor vindo do terreno.
 *
 *  • `atlasDoCapim()` — um canvas de 512 px com 4 "cartas": dois tufos de capim, um tufo
 *    com flores e uma moitinha. O capim é pintado CLARO e quase sem cor (a cor vem do
 *    chão, ver `corDoChao`); as flores já vêm coloridas. O capim (`capim.js`) usa cada
 *    carta em planos cruzados: um tufo inteiro em 6 triângulos.
 *  • `texturaDoChao()` — 256 px repetidos a cada `REPETE_CHAO` m: só manchas suaves de
 *    claro/escuro e uns fiapos, perto do branco (multiplica a cor de vértice do chão).
 *  • `corDoChao(world, x, z, alvo)` — A COR DO TERRENO num ponto: a grama do `decor.json`
 *    com manchas amareladas (ruído largo), variação fina, mais escura junto à rocha e mais
 *    clara e amarela nos campos (as WindHills). O CHÃO (`buildGrass`, cor por vértice) e o
 *    CAPIM (a cor de cada tufo) usam esta mesma conta: o pé do capim some no chão.
 */
import * as THREE from 'three';
import { Assets } from './assets.js';

export const REPETE_CHAO = 4;   // metros por repetição da textura do chão
export const CARTAS = { capim: 0, capimBaixo: 1, flores: 2, moita: 3 };

// ------------------------------------------------------------ ruído (determinístico)
const hash = (i, k) => { let h = (i * 374761393 + k * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sv = (t) => t * t * (3 - 2 * t);
function ruido(x, z) {
  const i = Math.floor(x), k = Math.floor(z), tx = sv(x - i), tz = sv(z - k);
  const a = hash(i, k), b = hash(i + 1, k), c = hash(i, k + 1), d = hash(i + 1, k + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;   // 0..1
}

// ------------------------------------------------------------ a cor do terreno
const _amarelo = new THREE.Color(0x9fb04a), _escuro = new THREE.Color(0x2c5a2e), _base = new THREE.Color();
let baseGrama = null;
/** A cor do chão em (x, z), em `alvo` (um THREE.Color). */
export function corDoChao(world, x, z, alvo = new THREE.Color()) {
  if (!baseGrama) baseGrama = new THREE.Color(Assets.grama ?? '#4e8f4f');
  _base.copy(baseGrama);
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

// ------------------------------------------------------------ o atlas do capim
/**
 * As 4 cartas (256 px cada; carta k na coluna k % 2 e na LINHA DE BAIXO para k < 2 — o
 * canvas vira de cabeça para baixo na textura, `flipY`). O pé de toda carta é a borda de
 * baixo dela, no meio; o alto do desenho chega perto da borda de cima.
 */
export function atlasDoCapim() {
  const L = 256, c = document.createElement('canvas');
  c.width = c.height = L * 2;
  const g = c.getContext('2d');
  let s = 1234; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const origem = (k) => [(k % 2) * L, (1 - Math.floor(k / 2)) * L];

  // uma folha: base larga, ponta fina e curvada, preenchida com degradê (escura no pé)
  const folha = (ox, oy, bx, alt, larg, curva, claro, escuro) => {
    const px = ox + L / 2 + bx, py = oy + L - 2, tx = px + curva, ty = py - alt;
    const grad = g.createLinearGradient(0, py, 0, ty);
    grad.addColorStop(0, escuro); grad.addColorStop(1, claro);
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(px - larg, py);
    g.quadraticCurveTo(px - larg * 0.6 + curva * 0.35, py - alt * 0.55, tx, ty);
    g.quadraticCurveTo(px + larg * 0.6 + curva * 0.45, py - alt * 0.5, px + larg, py);
    g.closePath(); g.fill();
    // a nervura clara no meio
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = Math.max(1, larg * 0.18);
    g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + curva * 0.4, py - alt * 0.55, tx, ty); g.stroke();
  };
  const tufo = (k, n, altMin, altMax, abre) => {
    const [ox, oy] = origem(k);
    for (let i = 0; i < n; i++) {
      const lado = (rnd() - 0.5) * 2, bx = lado * 46 * abre;
      const alt = altMin + rnd() * (altMax - altMin) * (1 - Math.abs(lado) * 0.35);
      const tom = 220 + Math.round(rnd() * 35), esc = 165 + Math.round(rnd() * 30);
      folha(ox, oy, bx, alt, 7 + rnd() * 6, lado * 70 * abre + (rnd() - 0.5) * 40,
        `rgb(${tom},${tom},${Math.round(tom * 0.92)})`, `rgb(${esc},${esc},${Math.round(esc * 0.95)})`);
    }
  };
  tufo(CARTAS.capim, 26, 150, 245, 1);        // o capim alto
  tufo(CARTAS.capimBaixo, 30, 85, 160, 1.25); // o rasteiro, mais aberto

  // as FLORES: capim verde (já colorido) e flores de cinco pétalas
  {
    const [ox, oy] = origem(CARTAS.flores);
    for (let i = 0; i < 18; i++) {
      const lado = (rnd() - 0.5) * 2, v = 120 + Math.round(rnd() * 40);
      folha(ox, oy, lado * 50, 70 + rnd() * 70, 6 + rnd() * 5, lado * 60, `rgb(${Math.round(v * 0.75)},${v + 40},${Math.round(v * 0.55)})`, `rgb(40,${v - 30},40)`);
    }
    const cores = ['#f4f1e6', '#f6d64a', '#e9a8c4', '#f4f1e6', '#b9a5f0'];
    for (let i = 0; i < 9; i++) {
      const fx = ox + L / 2 + (rnd() - 0.5) * 170, fy = oy + 40 + rnd() * 110, r = 9 + rnd() * 6;
      // a haste
      g.strokeStyle = '#4f7a35'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(fx, fy); g.quadraticCurveTo(fx + (rnd() - 0.5) * 30, (fy + oy + L) / 2, ox + L / 2 + (fx - ox - L / 2) * 0.35, oy + L - 2); g.stroke();
      g.fillStyle = cores[i % cores.length];
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + rnd();
        g.beginPath(); g.ellipse(fx + Math.cos(a) * r * 0.75, fy + Math.sin(a) * r * 0.75, r * 0.62, r * 0.4, a, 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = '#f2b32a'; g.beginPath(); g.arc(fx, fy, r * 0.32, 0, Math.PI * 2); g.fill();
    }
  }

  // a MOITA: um monte de folhinhas redondas, clara em cima e escura embaixo (tingida)
  {
    const [ox, oy] = origem(CARTAS.moita);
    for (let i = 0; i < 420; i++) {
      const a = rnd() * Math.PI, r = Math.sqrt(rnd()) * 100;
      const x = ox + L / 2 + Math.cos(a) * r * 1.15, y = oy + L - 6 - Math.sin(a) * r * 1.05;
      const altura = (oy + L - y) / 200, v = Math.round(170 + altura * 70 + rnd() * 20);
      g.fillStyle = `rgb(${v},${v},${Math.round(v * 0.9)})`;
      g.beginPath(); g.ellipse(x, y, 7 + rnd() * 5, 4 + rnd() * 3, rnd() * Math.PI, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
