// O MAPA LÓGICO NO SERVIDOR (24/11/2026): o mesmo `MapaLogico` do jogo (js/mapa-logico.js),
// montado dos mesmos arquivos que o navegador lê — `assets/mapa.json` (a variante ativa),
// `assets/decor.json`, `assets/caixas-das-pecas.json` e o `PROPS` do js/assets.js (só os nomes:
// peça fora dele não é posta, como no jogo). Com o three.js do npm (a mesma versão do vendor/),
// o caminho e o centro das células saem em `Vector3`, como no jogo.
//
// Quem usa: as regras do mundo (o passo que atravessa parede, regras-do-mundo.mjs) e, na etapa 3,
// os inimigos rodando no servidor.
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { MapaLogico, lerArquivoDoMapa, pecasDe } from './js/mapa-logico.js';

/** O `PROPS` do js/assets.js, lido do texto (o assets.js importa o GLTFLoader do navegador). */
export function lerProps(raiz) {
  const fonte = fs.readFileSync(path.join(raiz, 'js', 'assets.js'), 'utf8');
  const bloco = fonte.match(/export const PROPS = (\[[\s\S]*?\n\]);/);
  if (!bloco) throw new Error('não achei `export const PROPS = [ … ];` no js/assets.js');
  const lista = new Function(`return ${bloco[1]};`)();
  if (!Array.isArray(lista) || !lista.every((n) => typeof n === 'string')) throw new Error('o PROPS não é uma lista de nomes');
  return lista;
}

/** O mapa lógico da variante ativa, com a decoração e as peças. Lança erro se um arquivo não serve. */
export function lerMapaLogico(raiz) {
  const ler = (f) => JSON.parse(fs.readFileSync(path.join(raiz, 'assets', f), 'utf8'));
  const m = lerArquivoDoMapa(ler('mapa.json'));
  const decor = ler('decor.json');
  return new MapaLogico({
    mapa: m.linhas, relevo: m.relevo, agua: m.agua, marcos: m.marcos,
    decor: Array.isArray(decor?.itens) ? decor.itens : [],
    pecas: pecasDe(lerProps(raiz), ler('caixas-das-pecas.json')),
  }, { vetor: (x, y, z) => new THREE.Vector3(x, y, z) });
}
