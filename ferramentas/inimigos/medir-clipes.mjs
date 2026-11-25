#!/usr/bin/env node
/**
 * OS CLIPES DOS BICHOS (24/11/2026): lê as animações de cada modelo de `ANIMAIS_MODELOS`
 * (js/assets.js) no próprio .glb (`assets/animais/<modelo>.glb`) e grava
 * `assets/clipes-dos-bichos.json`: { modelo: { clipe: duração em s } }.
 *
 * O CÉREBRO do bicho (js/inimigos/quadrupede.js) escolhe a animação pelo nome (o primeiro que o
 * modelo tem: `Gallop` ou `Walk`) e mede o ataque pela duração do clipe (a janela do golpe é uma
 * fração dela). No jogo e no servidor do Mundo online, pela MESMA tabela — o servidor não abre
 * modelo nenhum. A duração é a do three.js (`AnimationClip.resetDuration`: o maior tempo das
 * trilhas, que é o `max` do acessor de entrada de cada canal).
 *
 *   node ferramentas/inimigos/medir-clipes.mjs
 *
 * Rode de novo quando um modelo de bicho entrar ou mudar (o `npm test` acusa bicho sem medida).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** O `ANIMAIS_MODELOS` do js/assets.js, lido do texto. */
export function lerModelosDosBichos(raiz = RAIZ) {
  const fonte = readFileSync(path.join(raiz, 'js', 'assets.js'), 'utf8');
  const m = fonte.match(/export const ANIMAIS_MODELOS\s*=\s*(\[[^\]]*\]);/);
  if (!m) throw new Error('não achei `export const ANIMAIS_MODELOS = [ … ];` no js/assets.js');
  return new Function(`return ${m[1]};`)();
}

function jsonDoGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é um .glb');
  let p = 12;
  while (p < buf.length) {
    const tam = buf.readUInt32LE(p), tipo = buf.readUInt32LE(p + 4);
    if (tipo === 0x4e4f534a) return JSON.parse(buf.toString('utf8', p + 8, p + 8 + tam));
    p += 8 + tam;
  }
  throw new Error('o .glb não tem JSON');
}

/** { clipe: duração } de um .glb. */
export function medirClipes(arquivo) {
  const json = jsonDoGlb(readFileSync(arquivo));
  const clipes = {};
  (json.animations ?? []).forEach((a, i) => {
    let dur = 0;
    for (const c of a.channels) {
      if (c.target?.node === undefined || !json.nodes?.[c.target.node]) continue;   // (o GLTFLoader pula o canal sem nó)
      const ac = json.accessors[a.samplers[c.sampler].input];
      if (!ac?.max) throw new Error(`a animação ${a.name} tem um tempo sem max`);
      dur = Math.max(dur, ac.max[0]);
    }
    clipes[a.name ?? `animation_${i}`] = dur;
  });
  return clipes;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const saida = {};
  for (const modelo of lerModelosDosBichos()) {
    const arq = path.join(RAIZ, 'assets', 'animais', `${modelo}.glb`);
    if (!existsSync(arq)) { console.error(`sem ${modelo}.glb: o bicho não nasce (nem aqui, nem no servidor)`); continue; }
    saida[modelo] = medirClipes(arq);
  }
  const linhas = Object.entries(saida).map(([m, c]) => `  ${JSON.stringify(m)}: ${JSON.stringify(c)}`);
  const leiame = 'As animações de cada modelo de bicho (ANIMAIS_MODELOS, js/assets.js) e a duração delas (s), lidas do .glb. '
    + 'Gerado por ferramentas/inimigos/medir-clipes.mjs — não edite à mão. O cérebro dos bichos (js/inimigos/quadrupede.js) escolhe '
    + 'a animação e mede o ataque por aqui, no jogo e no servidor do Mundo online.';
  writeFileSync(path.join(RAIZ, 'assets', 'clipes-dos-bichos.json'), `{\n "_leiame": ${JSON.stringify(leiame)},\n "modelos": {\n${linhas.join(',\n')}\n }\n}\n`);
  console.log(`${Object.keys(saida).length} modelos → assets/clipes-dos-bichos.json`);
}
