// O ARBUSTO PRÓPRIO (11/10/2026) — os arbustos do mapa viram uma MOITA DE CAPIM: o tufo de capim
// que a floresta tinha (um leque de folhas largas no pé e de ponta fina e curvada — as cartas de
// imagem que o tapete de geometria aposentou), só que maior, com muito mais folhas juntas e em low poly — cada folha é um prisma de
// três lados que afina até a ponta (9 triângulos, faces planas), sem textura, a cor nos vértices
// (escura no pé, clara na ponta, como o desenho do tufo).
//
// Faz as duas coisas:
//   - DESENHA os modelos (`lp-Bush_1..3`, em `assets/dungeon/`): cheio, largo e baixo, alto;
//   - TROCA no decor.json, no mesmo lugar e índice, cada arbusto do KayKit (`Bush_*`) e, nas
//     WindHills, cada peça `gi-` que tomou o lugar de um arbusto (`ERAM`: o decor.json de antes da
//     vegetação `gi-`, lido do git) por uma moita 25% mais larga que o arbusto que estava ali
//     (entre 1,6 e 3,4 m).
// Determinístico e pode rodar de novo (o sorteio é pela posição no arquivo; rodar outra vez não
// troca mais nada e redesenha os mesmos modelos).
//
// Uso (da raiz do jogo): node ferramentas/lowpoly/arbusto.mjs
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { caixaDoGlb, gravarGlb } from './glb.mjs';

const ANTES_DAS_GI = '4a4d6e0';     // o commit de antes de os arbustos das WindHills virarem peças `gi-`
const MAIOR = 1.25;
const FACETA = 0.9;                 // quanto da normal da face sobra (0 = tudo para cima, liso)
const LARGURA = [1.6, 3.4];          // m: os arbustos antigos iam de 30 cm (um tufo) a mais de 4 m

// ---- o desenho
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const hex = (h) => [16, 8, 0].map((d) => linear(((h >> d) & 255) / 255));
const mistura = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// o verde do capim da floresta (a `grama` do decor.json puxada para o `_vivo` do campo.js)
const VERDE = mistura(hex(0x4e8f4f), hex(0x7cb444), 0.45), PE = hex(0x2c5a2e), PONTA = hex(0xa8c048);

function moita({ semente, folhas, raio, alto, abre }) {
  let s = semente;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pos = [], normal = [], cor = [];
  // `dentro` é um ponto do miolo da folha: a face fica virada para fora dele
  const tri = (a, b, c, ca, cb, cc, dentro) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]], l = Math.hypot(...n) || 1;
    if (n[0] * (a[0] - dentro[0]) + n[1] * (a[1] - dentro[1]) + n[2] * (a[2] - dentro[2]) < 0) return tri(a, c, b, ca, cc, cb, dentro);
    pos.push(...a, ...b, ...c); cor.push(...ca, ...cb, ...cc);
    // a normal puxada para CIMA: a moita recebe a luz do chão, como o capim (com a normal da face
    // pura, o lado de costas para o sol saía quase preto no meio do capim claro); sobra a faceta
    const m = [n[0] / l * FACETA, n[1] / l * FACETA + 1, n[2] / l * FACETA], lm = Math.hypot(...m);
    for (let i = 0; i < 3; i++) normal.push(m[0] / lm, m[1] / lm, m[2] / lm);
  };
  for (let f = 0; f < folhas; f++) {
    // o pé: mais folhas no meio; a folha de fora é mais curta e cai mais para fora
    const t = Math.sqrt((f + 0.5) / folhas), g = f * 2.39996 + rnd() * 0.5, r = t * raio;
    const ox = Math.cos(g) * r, oz = Math.sin(g) * r;
    const h = alto * (1 - 0.5 * t * t) * (0.75 + rnd() * 0.45), larg = (0.15 + rnd() * 0.09) * (alto / 1.3);
    const para = g + (rnd() - 0.5) * 0.9, cai = (0.1 + abre * t) * (0.8 + rnd() * 0.4);      // para onde cai, e quanto (rad)
    const dx = Math.cos(para), dz = Math.sin(para), lx = -dz, lz = dx;                         // o lado da folha
    // a espinha: pé, meio (inclinada) e ponta (dobrando mais para fora)
    const em = (frac, extra) => { const a = cai * (1 + extra); return [ox + dx * Math.sin(a) * h * frac, Math.cos(a) * h * frac, oz + dz * Math.sin(a) * h * frac]; };
    const meio = em(0.55, 0), ponta = em(1, 0.9);
    // três lados: as duas beiradas e a quilha (para o lado de dentro da curva)
    const anel = (c, w, q) => [[c[0] + lx * w, c[1], c[2] + lz * w], [c[0] - lx * w, c[1], c[2] - lz * w], [c[0] - dx * q, c[1] + q * 0.3, c[2] - dz * q]];
    const a = anel([ox, -0.05, oz], larg, larg * 0.7), b = anel(meio, larg * 0.72, larg * 0.5);
    const tom = 0.62 + rnd() * 0.2;
    const c0 = mistura(PE, VERDE, 0.4).map((v) => v * tom), c1 = VERDE.map((v) => v * tom), c2 = mistura(VERDE, PONTA, 0.45).map((v) => v * tom);
    const media = (l) => [0, 1, 2].map((e) => l.reduce((x, q) => x + q[e], 0) / l.length);
    const miolo = media([...a, ...b]), mioloDaPonta = media([...b, ponta]);
    for (let i = 0; i < 3; i++) {
      const j = (i + 1) % 3;
      tri(a[i], b[j], a[j], c0, c1, c0, miolo); tri(a[i], b[i], b[j], c0, c1, c1, miolo);
      tri(b[i], ponta, b[j], c1, c2, c1, mioloDaPonta);
    }
  }
  return { pos, normal, cor };
}
const MODELOS = {
  'lp-Bush_1': { semente: 7, folhas: 84, raio: 0.5, alto: 1.3, abre: 0.62 },      // a cheia
  'lp-Bush_2': { semente: 23, folhas: 96, raio: 0.68, alto: 0.95, abre: 0.8 },   // larga e baixa
  'lp-Bush_3': { semente: 41, folhas: 68, raio: 0.4, alto: 1.65, abre: 0.42 },     // alta
};
for (const [nome, m] of Object.entries(MODELOS)) gravarGlb(`assets/dungeon/${nome}.glb`, nome, moita(m));
const lista = Object.keys(MODELOS).map((n, i) => [n, [3, 2, 2][i]]);
const largura = (prop) => { const c = caixaDoGlb(`assets/dungeon/${prop}.glb`); return Math.max(c[0], c[2]); };
const larguras = new Map();
const larg = (prop) => (larguras.has(prop) ? larguras : larguras.set(prop, largura(prop))).get(prop);

// ---- a troca
const acaso = (i) => { let h = Math.imul(i + 1, 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const escolhe = (t) => { t *= lista.reduce((s, [, p]) => s + p, 0); for (const [nome, p] of lista) if ((t -= p) < 0) return nome; return lista[0][0]; };
const ERAM = JSON.parse(execSync(`git show ${ANTES_DAS_GI}:assets/decor.json`, { maxBuffer: 1 << 28 }).toString()).itens;

const texto = fs.readFileSync('assets/decor.json', 'utf8');
const fimDeLinha = texto.includes('\r\n') ? '\r\n' : '\n';
const todas = texto.split(/\r?\n/);
const eItem = (l) => /^\s*\{"prop"/.test(l);
const conta = {};
let i = -1;
for (let n = 0; n < todas.length; n++) {
  if (!eItem(todas[n])) continue;
  i++;
  const virgula = /,\s*$/.test(todas[n]) ? ',' : '';
  const d = JSON.parse(todas[n].replace(/,\s*$/, ''));
  // o arbusto que está (ou estava) ali: dele vem a largura
  const era = /^Bush_/.test(d.prop) ? d : (d.troca && d.prop.startsWith('gi-') && /Bush/.test(ERAM[i]?.prop ?? '')) ? ERAM[i] : null;
  if (!era) continue;
  const novo = escolhe(acaso(i));
  d.escala = +(Math.min(LARGURA[1], Math.max(LARGURA[0], larg(era.prop) * (era.escala ?? 1) * MAIOR)) / larg(novo)).toFixed(3);
  d.prop = novo;
  delete d.troca; delete d.y;       // a moita nasce do chão: pode ser enterrada os 20 cm do relevo
  todas[n] = '    ' + JSON.stringify(d) + virgula;
  conta[novo] = (conta[novo] ?? 0) + 1;
}
const novo = todas.join(fimDeLinha);
JSON.parse(novo);
fs.writeFileSync('assets/decor.json', novo);
console.log('moitas:', Object.keys(MODELOS).map((n) => { const c = caixaDoGlb(`assets/dungeon/${n}.glb`); return `${n} ${c.map((v) => v.toFixed(2)).join('×')} m, ${MODELOS[n].folhas * 9} triângulos`; }).join(' | '));
console.log('trocadas agora:', Object.entries(conta).map(([k, v]) => `${k} ${v}`).join(', ') || 'nenhuma');
