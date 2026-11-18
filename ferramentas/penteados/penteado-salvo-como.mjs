#!/usr/bin/env node
// "SALVAR COMO" DA ABA CABELO (17/11/2026; o dono: "pegar um cabelo na área de cabelo e clicar em [salvar como], dou um nome e ganho um
// novo penteado baseado na edição que fiz — arrancar um pedaço de um dos cabelos e salvar com outro nome, mantendo 2 estilos diferentes
// provenientes do mesmo penteado, o inteiro e o editado/cortado"):
//
//   node ferramentas/penteados/penteado-salvo-como.mjs [<entrada.json>] --nome "Desgrenhado cortado" --listas arquivo:masculino3 [--de <molde>]
//
// Com a <entrada.json> ({ pos: [x, y, z, …] }, os triângulos em cm como a aba Modelo do editor os mostra — as edições do pincel aplicadas,
// o cortado de fora) e o --de (o molde de onde veio: o crânio dele vale; "<base>--<corpo>" que ainda não foi gravado = o da base): a malha
// vira o MOLDE novo assets/penteados/<molde>.json (os pontos soldados, como a rota molde-gravar do editor) e o molde e o penteado entram no
// FIM de assets/penteados/moldes.json. Sem a entrada (só as réguas mudaram): só o id novo. Nos dois casos, o id no FIM das --listas
// (registro.mjs). As MEDIDAS do penteado novo (o tamanho, a posição) quem grava é a aba, no assets/penteados.json. O penteado de onde
// veio NÃO muda. A última linha da saída é um JSON { ok, id, molde, numero, nome, listas, triangulos } (a rota do editor a lê).
import fs from 'node:fs';
import { ler, existe, gravar, LISTA_VALIDA, nomesNovos, registrarMolde, porNasListas } from './registro.mjs';

const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const ENTRADA = args[0] && !args[0].startsWith('--') ? args[0] : null;
const NOME = (opt('nome') ?? '').trim(), DE = opt('de'), LISTAS = (opt('listas') ?? '').split(',').filter(Boolean);
const falhar = (m) => { console.error(`[salvar como] ${m}`); console.log(JSON.stringify({ ok: false, erro: m })); process.exit(1); };
if (!NOME || NOME.length > 40 || !LISTAS.every((l) => LISTA_VALIDA.test(l)) || (ENTRADA && !/^[a-z0-9-]{1,60}$/.test(DE ?? ''))) {
  falhar('uso: node penteado-salvo-como.mjs [<entrada.json> --de <molde>] --nome "<nome>" --listas arquivo:<nome>,raca:<id>[:feminino],humano:feminino');
}

const { molde, id } = nomesNovos(NOME);
let numero = null, tris = null;
if (ENTRADA) {
  let p;
  try { p = JSON.parse(fs.readFileSync(ENTRADA, 'utf8')); } catch (e) { falhar(`não li a entrada: ${e.message}`); }
  if (!Array.isArray(p?.pos) || !p.pos.length || p.pos.length % 9 || !p.pos.every((v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 5000)) falhar('a malha veio torta');
  // (o crânio do molde de onde veio: a versão de um corpo ainda não gravada é a malha da base)
  const fonte = [DE, DE.split('--')[0]].find((m) => existe(`assets/penteados/${m}.json`));
  if (!fonte) falhar(`não há o molde ${DE}`);
  const cranio = JSON.parse(ler(`assets/penteados/${fonte}.json`)).cranio;
  if (!cranio) falhar(`o molde ${fonte} não tem o crânio`);
  // (soldar: o mesmo lugar, até 0,001 cm, é o mesmo ponto; o triângulo que encolhe a um ponto ou a uma linha sai)
  const pos = [], idx = [], visto = new Map();
  const ponto = (i) => { const k = [0, 1, 2].map((e) => Math.round(p.pos[i + e] * 1000)).join(); if (!visto.has(k)) { visto.set(k, pos.length / 3); pos.push(...[0, 1, 2].map((e) => Math.round(p.pos[i + e] * 1000) / 1000)); } return visto.get(k); };
  for (let t = 0; t < p.pos.length; t += 9) { const [a, b, c] = [t, t + 3, t + 6].map(ponto); if (a !== b && b !== c && a !== c) idx.push(a, b, c); }
  if (!idx.length) falhar('a malha ficou sem triângulos');
  tris = idx.length / 3;
  gravar(`assets/penteados/${molde}.json`, JSON.stringify({ _leiame: `O MOLDE "${molde}" (js/penteado.js, a forma \`molde\`): o penteado "${NOME}", salvo na aba Cabelo do editor ("salvar como") em ${new Date().toISOString().slice(0, 10)} a partir do molde "${fonte}" com as edições do pincel — pos, idx (virada para fora) e o crânio de onde veio (cm). Gerado por ferramentas/penteados/penteado-salvo-como.mjs.`, pos, idx, cranio }));
  numero = registrarMolde({ molde, id, nome: NOME });
}
let feitas = [];
try { feitas = porNasListas(id, LISTAS); } catch (e) { falhar(e.message); }

console.log(`[salvar como] "${NOME}": o penteado ${id}${ENTRADA ? `, o molde ${molde} (nº ${numero}, ${tris} triângulos, de ${DE})` : ' (só as medidas)'}, nas listas ${feitas.join(', ') || '(nenhuma)'}`);
console.log(JSON.stringify({ ok: true, id, molde: ENTRADA ? molde : null, numero, nome: NOME, listas: feitas, triangulos: tris }));
