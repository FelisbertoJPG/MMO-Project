/**
 * O CAPIM (04/10/2026) — as graminhas que cobrem o chão de ar livre e balançam com o
 * vento (o jeito dos campos de Mondstadt).
 *
 * Um `InstancedMesh` só, de TUFOS (cada instância é um tufo de `FOLHAS_POR_TUFO` folhas
 * largas e afinando, abertas para fora como um leque — o capim agrupado dos campos de
 * Mondstadt, ver `grass/` na raiz), posto nas células de
 * floresta ('f') EM VOLTA do jogador (`RAIO` células): quando ele muda de célula, as
 * folhas são remontadas — cada célula sempre com as MESMAS folhas (sorteio pela própria
 * célula), então ninguém vê o capim pular. O vento é do shader (`onBeforeCompile`): a
 * ponta da folha anda numa onda que corre pelo mundo, e o pé fica parado; nada disso
 * custa CPU por quadro. A altura do pé é a do chão (`alturaChao`), então o capim sobe as
 * colinas. Não nasce sobre peça que não é NATUREZA (`World.podeCapim`, categorias.js).
 * Longe do jogador as folhas encolhem até sumir (sem borda dura).
 *
 * Quantos TUFOS por célula vem da qualidade gráfica (`capim` em graficos.js): no Baixo,
 * nenhum. O tufo é o que deixa o capim volumoso sem pesar: menos instâncias, cada uma com
 * várias folhas. Sem sombra (seriam milhares de folhas na sombra da tocha).
 */
import * as THREE from 'three';
import { Assets } from './assets.js';
import { CELL } from './world.js';

const RAIO = 6;   // células em volta do jogador (~36 m)
const FOLHAS_POR_TUFO = 6;
const TUFOS_MAX = 60;   // por célula (o Alto usa 55)

/**
 * A geometria do TUFO (uma só, dividida por todas as instâncias; a variedade vem do giro
 * e da escala de cada uma): as folhas saem de perto do centro, cada uma inclinada para
 * fora e curvada (o meio anda menos que a ponta). Altura 0 a 1 em `position.y` — é o que
 * o vento do shader usa para saber o quanto a ponta anda. Cor por vértice: escura no pé,
 * verde no meio e a ponta mais clara e amarelada (o tom do campo vem da instância).
 */
function geometriaDoTufo() {
  let sem = 977;
  const rnd = () => ((sem = (sem * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pos = [], cor = [], idx = [];
  for (let f = 0; f < FOLHAS_POR_TUFO; f++) {
    const a = (f / FOLHAS_POR_TUFO) * Math.PI * 2 + (rnd() - 0.5) * 0.9;
    const dx = Math.cos(a), dz = Math.sin(a);
    const r0 = 0.03 + rnd() * 0.14, inclina = 0.2 + rnd() * 0.35;
    const h = 0.65 + rnd() * 0.35, w = 0.05 + rnd() * 0.03;
    // a face da folha: de lado para a direção em que ela se inclina, com um pouco de giro
    const t = a + Math.PI / 2 + (rnd() - 0.5) * 0.8, wx = Math.cos(t), wz = Math.sin(t);
    const bx = dx * r0, bz = dz * r0, b = pos.length / 3;
    const ponto = (subida, lado, larg) => {
      const curva = inclina * subida * subida;   // curva: o meio anda menos que a ponta
      pos.push(bx + dx * curva + wx * lado * larg, subida * h, bz + dz * curva + wz * lado * larg);
    };
    ponto(0, -1, w); ponto(0, 1, w); ponto(0.5, -1, w * 0.7); ponto(0.5, 1, w * 0.7); ponto(1, 0, 0);
    cor.push(0.45, 0.48, 0.4, 0.45, 0.48, 0.4, 0.88, 0.98, 0.72, 0.88, 0.98, 0.72, 1.12, 1.22, 0.62);
    idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3, b + 2, b + 3, b + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  // a normal para CIMA: a folha não escurece de lado (é como o capim estilizado faz)
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
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTempo = this.tempo;
      sh.vertexShader = 'uniform float uTempo;\n' + sh.vertexShader.replace('#include <project_vertex>', `
        vec4 mvPosition = vec4( transformed, 1.0 );
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
        #endif
        // o VENTO: uma onda que corre pelo mundo (rajadas por cima), a ponta anda, o pé não
        float h = position.y;
        float fase = uTempo * 1.7 + mvPosition.x * 0.28 + mvPosition.z * 0.19;
        float onda = sin(fase) * 0.65 + sin(fase * 2.3 + mvPosition.z * 0.7) * 0.25 + sin(uTempo * 0.4 + mvPosition.x * 0.05) * 0.35;
        float k = h * h * 0.16;
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
    this.maximo = (2 * RAIO + 1) ** 2 * TUFOS_MAX;
    this.malha = new THREE.InstancedMesh(g, mat, this.maximo);
    this.malha.count = 0;
    this.malha.frustumCulled = false;   // as folhas estão em volta do jogador: sempre há o que ver
    this.malha.castShadow = false; this.malha.receiveShadow = false;
    this.malha.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maximo * 3), 3);
    // os tons: os da grama do chão (`grama` no decor.json), um pouco mais vivos
    const base = Assets.grama ? new THREE.Color(Assets.grama) : new THREE.Color(0x33502a);
    this.tons = [1.15, 1.35, 1.0, 1.5].map((m) => base.clone().multiplyScalar(m));
    game.scene.add(this.malha);
  }

  /** Quantos tufos por célula (a qualidade gráfica; 0 = sem capim). */
  get densidade() { return Math.min(TUFOS_MAX, this.game.graficos?.q.capim ?? 55); }

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
    const cor = this.malha.instanceColor;
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
            const alt = (0.4 + rnd() * 0.4) * (1 - longe * 0.6), larg = 0.9 + rnd() * 0.5;
            q.setFromEuler(e.set((rnd() - 0.5) * 0.2, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.2));
            m.compose(pos, q, s.set(larg, alt, larg));
            const t = this.tons[Math.floor(rnd() * this.tons.length)], v1 = rnd(), v2 = rnd(), v3 = rnd();
            // em cima de peça que não é natureza (fogueira, barril, parede, pedra…), nada de
            // capim (World.podeCapim). Os sorteios já foram feitos: a célula não muda o resto
            if (!w.podeCapim(pos.x, pos.z, 0.3 * larg)) continue;
            this.malha.setMatrixAt(i, m);
            cor.setXYZ(i, t.r * (0.85 + v1 * 0.3), t.g * (0.85 + v2 * 0.3), t.b * (0.85 + v3 * 0.3));
            i++;
          }
        }
      }
    }
    this.malha.count = i;
    this.malha.instanceMatrix.needsUpdate = true;
    cor.needsUpdate = true;
  }
}
