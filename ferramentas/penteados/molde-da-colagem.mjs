#!/usr/bin/env node
// O MOLDE DE UM CABELO a partir de um PEDAÇO COLADO na aba Modelo do editor (06/11/2026; o dono, com o cabelo do "Busto cabelo"
// colado no Masculino jovem: "o cabelo ficou com a parte desgrenhada pra dentro da nuca… esse cabelo em diferentes modelos vai ter
// diferentes proporções e dimensões" — e escolheu: virar PENTEADO):
//
//   node ferramentas/penteados/molde-da-colagem.mjs <chave do corpo> <id da colagem> <nome do molde> --corpo <corpo de arquivo>
//   ex.: node ferramentas/penteados/molde-da-colagem.mjs humano:arquivo7 mw4dzbvn20 lobo-preguicoso --corpo masculino3
//
// Lê os triângulos criados (`novos`) daquela colagem no assets/modelagem.json — os cantos no MODELO (cm, pose T), como o dono os
// deixou —, solda os cantos repetidos e grava assets/penteados/<nome>.json: { pos, idx, cranio } — `cranio` = o crânio do corpo em
// que o cabelo foi ajustado, MEDIDO COMO O JOGO MEDE (js/penteado.js `medirCranio`: os pontos presos à cabeça — peso da Head
// ≥ 0,5 —, o topo deles com |x| < 15 e, na faixa de 8 a 4 cm abaixo do topo, a meia largura e o meio do fundo). No jogo, a forma
// `molde` leva o cabelo do crânio daqui ao crânio de quem o veste. Mudou a conta lá, mude aqui.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const [CHAVE, COLAGEM, NOME] = args, CORPO = opt('corpo');
if (!CHAVE || !COLAGEM || !/^[a-z0-9-]{1,40}$/.test(NOME ?? '') || !CORPO) {
  console.error('uso: node molde-da-colagem.mjs <chave> <id da colagem> <nome-do-molde> --corpo <corpo de arquivo>');
  process.exit(1);
}

// ---- os triângulos da colagem
const ed = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/modelagem.json'), 'utf8')).corpos?.[CHAVE];
const tris = (ed?.novos ?? []).filter((n) => n.colagem === COLAGEM).map((n) => n.cantos.map((k) => k.em));
if (!tris.length) { console.error(`[molde] ${CHAVE} não tem a colagem ${COLAGEM}`); process.exit(1); }
const pos = [], idx = [], visto = new Map();
const ponto = (p) => {
  const k = p.map((v) => Math.round(v * 1000)).join();
  if (!visto.has(k)) { visto.set(k, pos.length / 3); pos.push(...p.map((v) => Math.round(v * 1000) / 1000)); }
  return visto.get(k);
};
for (const t of tris) { const [a, b, c] = t.map(ponto); if (a !== b && b !== c && a !== c) idx.push(a, b, c); }

// ---- o crânio do corpo em que ele foi ajustado (a mesma conta do jogo: penteado.js `medirCranio`)
const corpo = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets/corpos', `${CORPO}.json`), 'utf8'));
const de64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const P = de64(corpo.pos, Float32Array), osso = de64(corpo.ossoDe, Uint8Array), peso = de64(corpo.peso, Uint8Array), head = corpo.nomes.indexOf('Head');
const cabeca = [];
for (let v = 0; v < P.length / 3; v++) {
  let w = 0;
  for (let j = 0; j < 4; j++) if (osso[v * 4 + j] === head) w += peso[v * 4 + j] / 255;
  if (w >= 0.5) cabeca.push([P[v * 3], P[v * 3 + 1], P[v * 3 + 2]]);
}
const cranio = medirCranio(cabeca);
if (!cranio) { console.error(`[molde] não achei o crânio de ${CORPO}`); process.exit(1); }

const saida = path.join(RAIZ, 'assets/penteados', `${NOME}.json`);
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, JSON.stringify({
  _leiame: `O MOLDE "${NOME}" (js/penteado.js, a forma \`molde\`): a malha de um cabelo — pos (cm, pose T, no MODELO do corpo ${CORPO}), idx (a ordem dos cantos: virada para fora) — e o crânio em que ela foi ajustada (cranio: topo, l = a meia largura, z = o meio do fundo, cm). Gerado por ferramentas/penteados/molde-da-colagem.mjs a partir da colagem ${COLAGEM} de ${CHAVE}: não edite à mão.`,
  pos, idx, cranio,
}) + '\n');
let y0 = Infinity, y1 = -Infinity;
for (let i = 1; i < pos.length; i += 3) { y0 = Math.min(y0, pos[i]); y1 = Math.max(y1, pos[i]); }
console.log(`[molde] ${NOME}: ${idx.length / 3} triângulos, ${pos.length / 3} pontos, de ${y0.toFixed(1)} a ${y1.toFixed(1)} cm; crânio de ${CORPO}: ${JSON.stringify(cranio)}`);

// (a cópia da conta do jogo — penteado.js `medirCranio`)
function medirCranio(pts) {
  let topo = -Infinity;
  for (const p of pts) if (Math.abs(p[0]) < 15) topo = Math.max(topo, p[1]);
  if (!Number.isFinite(topo)) return null;
  let l = 0, z0 = Infinity, z1 = -Infinity;
  for (const p of pts) if (p[1] > topo - 8 && p[1] < topo - 4) { l = Math.max(l, Math.abs(p[0])); z0 = Math.min(z0, p[2]); z1 = Math.max(z1, p[2]); }
  if (!(l > 0)) return null;
  const r = (v) => Math.round(v * 1000) / 1000;
  return { topo: r(topo), l: r(l), z: r((z0 + z1) / 2) };
}
