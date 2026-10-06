/**
 * O CAPIM (04/10/2026; em CARTAS desde 05/10/2026) — as graminhas que cobrem o chão de ar
 * livre e balançam com o vento (o jeito dos campos estilizados).
 *
 * Um `InstancedMesh` só. Cada instância é um TUFO INTEIRO desenhado numa CARTA do atlas
 * (`campo.js`: capim alto, capim rasteiro, flores, moitinha) em três planos cruzados — 6
 * triângulos por tufo, recortados pela transparência da imagem (`alphaTest`). Antes eram
 * folhas de geometria: 18 triângulos por tufo e mais que o dobro de tufos.
 *
 * A COR de cada tufo é a do CHÃO embaixo dele (`corDoChao`, a mesma conta do chão): o pé
 * some no terreno e as manchas amareladas do campo passam pelo capim. As flores não são
 * tingidas. Os tufos ficam em volta do jogador (`RAIO` células), remontados quando ele
 * muda de célula, cada célula sempre com o MESMO sorteio (não pula). O vento é do shader
 * (a ponta anda numa onda que corre pelo mundo; o pé fica parado) e não custa CPU.
 * Sobe o relevo (`alturaChao`); não nasce sobre peça que não é natureza (`podeCapim`).
 *
 * Quantos TUFOS por célula vem da qualidade gráfica (`capim` em graficos.js): no Baixo,
 * nenhum. Sem sombra.
 */
import * as THREE from 'three';
import { CELL } from './world.js';
import { atlasDoCapim, corDoChao, CARTAS } from './campo.js';

const RAIO = 6;   // células em volta do jogador (~36 m)
const TUFOS_MAX = 30;   // por célula (o Alto usa 22)
// que carta cada tufo usa (pesos): mais capim, um pouco de flor e de moita
const SORTEIO = [[CARTAS.capim, 0.48], [CARTAS.capimBaixo, 0.4], [CARTAS.moita, 0.05], [CARTAS.flores, 0.07]];

/**
 * A geometria do TUFO: três planos de 1 × 1 cruzados a 60°, o pé em y = 0. `position.y`
 * (0 a 1) é o que o vento usa; a cor por vértice escurece o pé (sombra de contato).
 */
function geometriaDoTufo() {
  const pos = [], uv = [], cor = [], idx = [];
  for (let p = 0; p < 3; p++) {
    const a = (p / 3) * Math.PI, dx = Math.cos(a) * 0.5, dz = Math.sin(a) * 0.5, b = pos.length / 3;
    pos.push(-dx, 0, -dz, dx, 0, dz, dx, 1, dz, -dx, 1, -dz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    cor.push(0.8, 0.8, 0.8, 0.8, 0.8, 0.8, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  // a normal para CIMA: o tufo não escurece de lado (é como o capim estilizado faz)
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.setIndex(idx);
  return g;
}

export class Capim {
  constructor(game) {
    this.game = game;
    this.celula = null;
    this.tempo = { value: 0 };
    const g = geometriaDoTufo();
    this.maximo = (2 * RAIO + 1) ** 2 * TUFOS_MAX;
    // a CARTA de cada tufo (0–3): o shader escolhe o quarto do atlas
    this.cartas = new THREE.InstancedBufferAttribute(new Float32Array(this.maximo), 1);
    g.setAttribute('aCarta', this.cartas);
    const mat = new THREE.MeshLambertMaterial({ map: atlasDoCapim(), vertexColors: true, side: THREE.DoubleSide, alphaTest: 0.45 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTempo = this.tempo;
      sh.vertexShader = 'uniform float uTempo;\nattribute float aCarta;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
        vMapUv = vMapUv * 0.5 + vec2(mod(aCarta, 2.0), floor(aCarta / 2.0)) * 0.5;`).replace('#include <project_vertex>', `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        // o VENTO: uma onda que corre pelo mundo (rajadas por cima), a ponta anda, o pé não
        float h = position.y;
        float fase = uTempo * 1.7 + mvPosition.x * 0.28 + mvPosition.z * 0.19;
        float onda = sin(fase) * 0.65 + sin(fase * 2.3 + mvPosition.z * 0.7) * 0.25 + sin(uTempo * 0.4 + mvPosition.x * 0.05) * 0.35;
        float k = h * h * 0.22;
        mvPosition.x += onda * k;
        mvPosition.z += onda * k * 0.55;
        mvPosition = modelViewMatrix * mvPosition;
        gl_Position = projectionMatrix * mvPosition;`);
      // as DUAS faces com a normal para cima: a de trás não vira "luz por baixo" (preta)
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
        `float faceDirection = 1.0;
        vec3 normal = normalize( vNormal );
        vec3 nonPerturbedNormal = normal;`);
    };
    this.malha = new THREE.InstancedMesh(g, mat, this.maximo);
    this.malha.count = 0;
    this.malha.frustumCulled = false;   // as folhas estão em volta do jogador: sempre há o que ver
    this.malha.castShadow = false; this.malha.receiveShadow = false;
    this.malha.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maximo * 3), 3);
    game.scene.add(this.malha);
  }

  /** Quantos tufos por célula (a qualidade gráfica; 0 = sem capim). */
  get densidade() { return Math.min(TUFOS_MAX, this.game.graficos?.q.capim ?? 22); }

  /** Remonta já (a qualidade mudou). */
  refazer() { this.celula = null; }

  update(dt) {
    this.tempo.value += dt;
    const w = this.game.world, p = this.game.player.pos;
    const [r0, c0] = w.cellOf(p);
    const chave = `${r0},${c0},${this.densidade}`;
    if (chave === this.celula) return;
    this.celula = chave;
    const n = this.densidade, m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    const cor = this.malha.instanceColor, tom = new THREE.Color();
    let i = 0;
    if (n > 0) {
      for (let r = r0 - RAIO; r <= r0 + RAIO; r++) {
        for (let c = c0 - RAIO; c <= c0 + RAIO; c++) {
          if (w.ch(r, c) !== 'f') continue;
          const dist = Math.hypot(r - r0, c - c0);
          if (dist > RAIO + 0.5) continue;
          // longe, menos e menores (sem borda dura)
          const longe = Math.max(0, Math.min(1, (dist - (RAIO - 2.5)) / 3));
          const quantas = Math.round(n * (1 - longe * 0.7));
          let sem = ((r * 73856093) ^ (c * 19349663)) >>> 0;   // o sorteio é DA CÉLULA
          const rnd = () => ((sem = (sem * 1664525 + 1013904223) >>> 0) / 4294967296);
          for (let k = 0; k < quantas && i < this.maximo; k++) {
            pos.set(c * CELL + (rnd() - 0.5) * CELL, 0, r * CELL + (rnd() - 0.5) * CELL);
            pos.y = w.alturaChao(pos);
            // a carta, e o tamanho dela (a carta tem o tufo inteiro: ~1 m de largura)
            let u = rnd(), carta = SORTEIO[0][0];
            for (const [k, peso] of SORTEIO) { if ((u -= peso) < 0) { carta = k; break; } }
            const grande = carta === CARTAS.moita ? 1.25 : carta === CARTAS.capimBaixo ? 0.75 : 1;
            const alt = (0.55 + rnd() * 0.35) * grande * (1 - longe * 0.5), larg = (0.9 + rnd() * 0.5) * grande;
            q.setFromEuler(e.set(0, rnd() * Math.PI * 2, 0));
            m.compose(pos, q, s.set(larg, alt, larg));
            const v = 0.92 + rnd() * 0.16;
            // em cima de peça que não é natureza (fogueira, barril, parede, pedra…), nada de
            // capim (World.podeCapim). Os sorteios já foram feitos: a célula não muda o resto
            if (!w.podeCapim(pos.x, pos.z, 0.3 * larg)) continue;
            this.malha.setMatrixAt(i, m);
            this.cartas.setX(i, carta);
            // a cor: a do CHÃO embaixo (o capim pintado claro vira a cor do terreno); a flor, a dela
            if (carta === CARTAS.flores) cor.setXYZ(i, v, v, v);
            else { corDoChao(w, pos.x, pos.z, tom).multiplyScalar(v * 1.25); cor.setXYZ(i, tom.r, tom.g, tom.b); }
            i++;
          }
        }
      }
    }
    this.malha.count = i;
    this.malha.instanceMatrix.needsUpdate = true;
    cor.needsUpdate = true;
    this.cartas.needsUpdate = true;
  }
}
