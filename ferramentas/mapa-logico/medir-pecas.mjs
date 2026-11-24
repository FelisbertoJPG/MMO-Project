#!/usr/bin/env node
/**
 * AS CAIXAS DAS PEÇAS (24/11/2026): mede cada peça do `PROPS` (js/assets.js) no próprio .glb
 * (`assets/dungeon/<nome>.glb`) e grava `assets/caixas-das-pecas.json`, com a caixa de cada uma
 * em escala 1 e sem giro: [minX, minY, minZ, maxX, maxY, maxZ].
 *
 * É dessa tabela que o MAPA LÓGICO (js/mapa-logico.js) tira o raio automático das pedras e o
 * tamanho das peças. O jogo e o servidor do Mundo online usam a MESMA tabela, então montam as
 * mesmas colisões, e o servidor não precisa abrir modelo nenhum.
 *
 * A conta é a do jogo: `new THREE.Box3().setFromObject(gltf.scene)`, com a caixa de cada malha
 * vinda do `min`/`max` do acessor POSITION (o mesmo que o GLTFLoader usa) e as transformações
 * dos nós montadas pelo three.js do `vendor/`.
 *
 *   node ferramentas/mapa-logico/medir-pecas.mjs
 *
 * Rode de novo quando uma peça entrar no `PROPS` ou um .glb mudar (o `npm test` acusa peça
 * sem medida).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as THREE from '../../vendor/three.module.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** O `PROPS` do js/assets.js, lido do texto (o assets.js importa o three e o GLTFLoader do navegador). */
export function lerProps(raiz = RAIZ) {
  const fonte = readFileSync(path.join(raiz, 'js', 'assets.js'), 'utf8');
  const bloco = fonte.match(/export const PROPS = (\[[\s\S]*?\n\]);/);
  if (!bloco) throw new Error('não achei `export const PROPS = [ … ];` no js/assets.js');
  const lista = new Function(`return ${bloco[1]};`)();
  if (!Array.isArray(lista) || !lista.every((n) => typeof n === 'string')) throw new Error('o PROPS não é uma lista de nomes');
  return lista;
}

/** O JSON de dentro de um .glb. */
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

// a escala dos acessores normalizados (GLTFLoader: getNormalizedComponentScale)
const NORMALIZADO = { 5120: 1 / 127, 5121: 1 / 255, 5122: 1 / 32767, 5123: 1 / 65535 };

/** A caixa (escala 1, sem giro) da cena de um .glb, como o three.js a mede. */
export function medirGlb(arquivo) {
  const json = jsonDoGlb(readFileSync(arquivo));
  const caixaDaPrimitiva = (prim) => {
    const ac = json.accessors?.[prim.attributes?.POSITION];
    if (!ac?.min || !ac?.max) throw new Error('acessor POSITION sem min/max');
    const b = new THREE.Box3(new THREE.Vector3(ac.min[0], ac.min[1], ac.min[2]), new THREE.Vector3(ac.max[0], ac.max[1], ac.max[2]));
    if (ac.normalized) { const k = NORMALIZADO[ac.componentType] ?? 1; b.min.multiplyScalar(k); b.max.multiplyScalar(k); }
    return b;
  };
  const no = (i) => {
    const def = json.nodes[i], o = new THREE.Object3D();
    if (def.matrix) o.applyMatrix4(new THREE.Matrix4().fromArray(def.matrix));
    else {
      if (def.translation) o.position.fromArray(def.translation);
      if (def.rotation) o.quaternion.fromArray(def.rotation);
      if (def.scale) o.scale.fromArray(def.scale);
    }
    if (def.mesh !== undefined) {
      for (const prim of json.meshes[def.mesh].primitives) {
        const g = new THREE.BufferGeometry();
        g.boundingBox = caixaDaPrimitiva(prim);
        o.add(new THREE.Mesh(g));
      }
    }
    for (const f of def.children ?? []) o.add(no(f));
    return o;
  };
  const cena = new THREE.Group();
  for (const i of json.scenes[json.scene ?? 0].nodes) cena.add(no(i));
  const b = new THREE.Box3().setFromObject(cena);
  if (b.isEmpty()) throw new Error('a cena não tem malha');
  return [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pecas = {}, erros = [];
  for (const nome of lerProps()) {
    try { pecas[nome] = medirGlb(path.join(RAIZ, 'assets', 'dungeon', `${nome}.glb`)); }
    catch (e) { erros.push(`${nome}: ${e.message}`); }
  }
  const saida = {
    _leiame: 'A caixa de cada peça do PROPS (js/assets.js) em escala 1 e sem giro: [minX, minY, minZ, maxX, maxY, maxZ], '
      + 'medida no .glb. Gerado por ferramentas/mapa-logico/medir-pecas.mjs — não edite à mão. O mapa lógico '
      + '(js/mapa-logico.js) tira daqui o tamanho das peças, no jogo e no servidor do Mundo online.',
    pecas,
  };
  // (uma peça por linha: o diff de um .glb que mudou fica numa linha só)
  const linhas = Object.entries(pecas).map(([n, c]) => `  ${JSON.stringify(n)}: ${JSON.stringify(c)}`);
  writeFileSync(path.join(RAIZ, 'assets', 'caixas-das-pecas.json'), `{\n "_leiame": ${JSON.stringify(saida._leiame)},\n "pecas": {\n${linhas.join(',\n')}\n }\n}\n`);
  console.log(`${Object.keys(pecas).length} peças medidas → assets/caixas-das-pecas.json`);
  if (erros.length) { console.error(`${erros.length} sem medida:\n  ${erros.join('\n  ')}`); process.exitCode = 1; }
}
