/**
 * O CAPIM (04/10/2026) — as graminhas que cobrem o chão de ar livre e balançam com o
 * vento (o jeito dos campos de Mondstadt).
 *
 * Um `InstancedMesh` só, de folhas finas (5 vértices cada), posto nas células de
 * floresta ('f') EM VOLTA do jogador (`RAIO` células): quando ele muda de célula, as
 * folhas são remontadas — cada célula sempre com as MESMAS folhas (sorteio pela própria
 * célula), então ninguém vê o capim pular. O vento é do shader (`onBeforeCompile`): a
 * ponta da folha anda numa onda que corre pelo mundo, e o pé fica parado; nada disso
 * custa CPU por quadro. A altura do pé é a do chão (`alturaChao`), então o capim sobe as
 * colinas. Longe do jogador as folhas encolhem até sumir (sem borda dura).
 *
 * Quantas folhas por célula vem da qualidade gráfica (`capim` em graficos.js): no Baixo,
 * nenhuma. Sem sombra (seriam milhares de folhas na sombra da tocha).
 */
import * as THREE from 'three';
import { Assets } from './assets.js';
import { CELL } from './world.js';

const RAIO = 6;   // células em volta do jogador (~36 m)

export class Capim {
  constructor(game) {
    this.game = game;
    this.celula = null;
    this.tempo = { value: 0 };
    // a folha: larga no pé, ponta fina, 1 m de altura (cada uma ganha a sua escala)
    const g = new THREE.BufferGeometry();
    const w = 0.035;
    g.setAttribute('position', new THREE.Float32BufferAttribute([-w, 0, 0, w, 0, 0, -w * 0.6, 0.5, 0, w * 0.6, 0.5, 0, 0, 1, 0], 3));
    // a normal para CIMA: a folha fina não escurece de lado (é como o capim estilizado faz)
    g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    // escura no pé, clara na ponta
    g.setAttribute('color', new THREE.Float32BufferAttribute([0.45, 0.45, 0.45, 0.45, 0.45, 0.45, 0.75, 0.75, 0.75, 0.75, 0.75, 0.75, 1, 1, 1], 3));
    g.setIndex([0, 1, 2, 2, 1, 3, 2, 3, 4]);
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
    this.maximo = (2 * RAIO + 1) ** 2 * 160;
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

  /** Quantas folhas por célula (a qualidade gráfica; 0 = sem capim). */
  get densidade() { return this.game.graficos?.q.capim ?? 120; }

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
            const alt = (0.25 + rnd() * 0.35) * (1 - longe * 0.6);
            q.setFromEuler(e.set((rnd() - 0.5) * 0.35, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.35));
            m.compose(pos, q, s.set(1, alt, 1));
            this.malha.setMatrixAt(i, m);
            const t = this.tons[Math.floor(rnd() * this.tons.length)];
            cor.setXYZ(i, t.r * (0.85 + rnd() * 0.3), t.g * (0.85 + rnd() * 0.3), t.b * (0.85 + rnd() * 0.3));
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
