/**
 * O CAPIM (04/10/2026; o TAPETE desde 11/10/2026, no mapa todo desde a versão 2026-10-11.7) —
 * a grama que cobre o chão de ar livre e balança com o vento, como nos jogos de campo
 * estilizado (Genshin, Zelda).
 *
 * Um `InstancedMesh` só. A unidade é uma TOUCEIRA de FOLHAS DE GEOMETRIA (não é imagem de tufo
 * recortada): sem textura, sem transparência, a normal para cima, a cor do CHÃO embaixo
 * (`corDoChao`, a mesma conta do chão) clareando até a ponta — o vão entre as folhas é da
 * mesma cor e não aparece. Em vez de sorteio (que deixa buraco aqui e amontoa ali), uma GRADE
 * fina com desvio cobre a célula inteira, cada touceira mais larga que o passo (uma entra na
 * outra). Só em volta do jogador (`RAIO` células); longe dele a grade abre e as touceiras
 * crescem na mesma proporção. O vento é do shader (a ponta anda numa onda que corre pelo
 * mundo; o pé fica parado) e não custa CPU. Sobe o relevo (`alturaChao`); não nasce sobre
 * peça que não é natureza (`podeCapim`) nem nos caminhos de terra (`caminhoEm`).
 *
 * A densidade vem da qualidade gráfica (`capim` em graficos.js → `passo`): no Baixo, nenhum.
 * Sem sombra. (Até a 2026-10-11.6 o tapete era só das WindHills, e o resto do ar livre tinha
 * TUFOS em cartas de imagem — três planos cruzados com um desenho do `campo.js`.)
 */
import * as THREE from 'three';
import { CELL } from './world.js';
import { corDoChao, caminhoEm } from './campo.js';

const RAIO = 6;   // células em volta do jogador (~36 m)
const DENSIDADE_MAX = 90;   // o teto do `capim` da qualidade (o Alto usa 64)
// a grade e as folhas de GEOMETRIA
const PASSO_MIN = 0.3;            // a grade mais fina do tapete (m), no Alto
const NIVEIS = [1, 1.5, 2.2];     // longe do jogador, a grade abre (e as touceiras crescem junto)
const PERTO = [2, 4];             // até quantas células vale cada nível (depois, o último)
const FOLHAS = 6;                 // folhas por touceira

/**
 * A TOUCEIRA do tapete: `FOLHAS` folhas de GEOMETRIA (não é imagem recortada) — cada uma é
 * uma tira que afina até a ponta (5 vértices, 3 triângulos), plantada num disco de raio 0,5,
 * virada para um lado qualquer e caindo um pouco para fora. Altura 1 (a instância dá a
 * altura e o tamanho da touceira). A normal é para CIMA em todo vértice — a folha recebe a
 * luz do chão onde está, sem lado escuro — e a cor por vértice clareia do pé à ponta.
 */
function geometriaDaTouceira() {
  const pos = [], cor = [], idx = [];
  let s = 977; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let f = 0; f < FOLHAS; f++) {
    const a = (f / FOLHAS) * Math.PI * 2 + rnd() * 0.9, r = f === 0 ? 0 : 0.18 + rnd() * 0.3;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const yaw = rnd() * Math.PI, lx = Math.cos(yaw), lz = Math.sin(yaw);        // a direção da LARGURA da folha
    const h = 0.6 + rnd() * 0.4, meia = 0.055 + rnd() * 0.03;                   // altura e meia largura
    const cai = (0.12 + rnd() * 0.22) * (f === 0 ? 0.3 : 1), cx = Math.cos(a) * cai, cz = Math.sin(a) * cai;   // cai para fora
    const b = pos.length / 3;
    pos.push(bx - lx * meia, 0, bz - lz * meia, bx + lx * meia, 0, bz + lz * meia);
    pos.push(bx + cx * 0.3 - lx * meia * 0.8, h * 0.5, bz + cz * 0.3 - lz * meia * 0.8, bx + cx * 0.3 + lx * meia * 0.8, h * 0.5, bz + cz * 0.3 + lz * meia * 0.8);
    pos.push(bx + cx, h, bz + cz);
    const meio = 0.86 + h * 0.12, ponta = 0.98 + h * 0.2;
    cor.push(0.74, 0.74, 0.74, 0.74, 0.74, 0.74, meio, meio, meio, meio, meio, meio, ponta, ponta, ponta * 0.97);
    idx.push(b, b + 1, b + 3, b, b + 3, b + 2, b + 2, b + 3, b + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.setIndex(idx);
  return g;
}

/** O shader do capim: o VENTO e as duas faces com a mesma luz. */
function ventoENormal(sh, tempo) {
  sh.uniforms.uTempo = tempo;
  sh.vertexShader = 'uniform float uTempo;\n' + sh.vertexShader.replace('#include <project_vertex>', `
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
}

export class Capim {
  constructor(game) {
    this.game = game;
    this.celula = null;
    this.tempo = { value: 0 };
    const gp = geometriaDaTouceira();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => ventoENormal(sh, this.tempo);
    this.maximo = (2 * RAIO + 1) ** 2 * Math.ceil(CELL / PASSO_MIN) ** 2;
    this.tapete = new THREE.InstancedMesh(gp, mat, this.maximo);
    this.tapete.name = 'capim (capim.js)';
    this.tapete.count = 0;
    this.tapete.frustumCulled = false;   // as folhas estão em volta do jogador: sempre há o que ver
    this.tapete.castShadow = false; this.tapete.receiveShadow = true;   // recebe a sombra do sol (senão a das árvores sumia debaixo do capim)
    this.tapete.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maximo * 3), 3);
    game.scene.add(this.tapete);
    this.prontas = new Map();   // célula + nível → o tapete dela já calculado
  }

  /** O passo da grade do tapete (m), da qualidade gráfica: 30 cm no Alto, ~41 cm no Médio. */
  get passo() { return Math.max(PASSO_MIN, Math.min(0.9, PASSO_MIN * Math.sqrt(64 / Math.max(1, this.densidade)))); }

  /**
   * O tapete de UMA célula (guardado: andar uma célula só calcula as que entraram). `nivel` é
   * a distância: longe, a grade é mais aberta e as cartas maiores na mesma proporção — a
   * cobertura não muda e não aparece buraco, só há menos folhas.
   */
  celulaDoTapete(w, r, c, nivel) {
    const chave = (r * 1024 + c) * 4 + nivel;
    let pronta = this.prontas.get(chave);
    if (pronta) return pronta;
    const passo = this.passo * NIVEIS[nivel], n = Math.max(1, Math.round(CELL / passo)), real = CELL / n;
    const mats = new Float32Array(n * n * 16), cores = new Float32Array(n * n * 3);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), pos = new THREE.Vector3(), tom = new THREE.Color();
    let sem = (((r * 73856093) ^ (c * 19349663)) + nivel * 7919) >>> 0;
    const rnd = () => ((sem = (sem * 1664525 + 1013904223) >>> 0) / 4294967296);
    let i = 0;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      pos.set((c - 0.5) * CELL + (a + 0.5 + (rnd() - 0.5) * 0.9) * real, 0, (r - 0.5) * CELL + (b + 0.5 + (rnd() - 0.5) * 0.9) * real);
      // a touceira é mais larga que o passo (entra nas vizinhas); a altura ondula em manchas
      const larg = real * (1.9 + rnd() * 0.7);
      const mancha = 0.8 + 0.4 * (0.5 + 0.5 * Math.sin(pos.x * 0.31 + Math.sin(pos.z * 0.23) * 1.7) * Math.cos(pos.z * 0.27));
      const alt = (0.3 + rnd() * 0.16) * mancha * (1 + nivel * 0.12);
      e.set(0, rnd() * Math.PI * 2, 0);
      const v = 0.95 + rnd() * 0.1, sorte = rnd();
      if (!w.podeCapim(pos.x, pos.z, 0.15)) continue;
      const caminho = caminhoEm(w, pos.x, pos.z);
      if (caminho > 0.25 && sorte < caminho * 1.6) continue;
      // nem na ÁGUA nem na areia da praia (a borda rareia)
      if (w.fundoDaAgua(pos.x, pos.z) > -0.44 + sorte * 0.14) continue;
      pos.y = w.alturaChao(pos) - 0.02;
      m.compose(pos, q.setFromEuler(e), s.set(larg, alt, larg));
      m.toArray(mats, i * 16);
      corDoChao(w, pos.x, pos.z, tom).multiplyScalar(v * 1.12);
      cores[i * 3] = tom.r; cores[i * 3 + 1] = tom.g; cores[i * 3 + 2] = tom.b;
      i++;
    }
    pronta = { n: i, mats: mats.subarray(0, i * 16), cores: cores.subarray(0, i * 3) };
    if (this.prontas.size > 900) this.prontas.clear();   // andou muito: recomeça (as de perto voltam já)
    this.prontas.set(chave, pronta);
    return pronta;
  }

  /** O `capim` da qualidade gráfica (0 = sem capim): dele sai o `passo` da grade. */
  get densidade() { return Math.min(DENSIDADE_MAX, this.game.graficos?.q.capim ?? 22); }

  /** Remonta já (a qualidade mudou). */
  refazer() { this.celula = null; this.prontas.clear(); }

  update(dt) {
    this.tempo.value += dt;
    const w = this.game.world, p = this.game.player.pos;
    const [r0, c0] = w.cellOf(p);
    const chave = `${r0},${c0},${this.densidade}`;
    if (chave === this.celula) return;
    this.celula = chave;
    let j = 0;
    if (this.densidade > 0) {
      for (let r = r0 - RAIO; r <= r0 + RAIO; r++) {
        for (let c = c0 - RAIO; c <= c0 + RAIO; c++) {
          if (w.ch(r, c) !== 'f') continue;
          const dist = Math.hypot(r - r0, c - c0);
          if (dist > RAIO + 0.5) continue;
          const t = this.celulaDoTapete(w, r, c, dist <= PERTO[0] ? 0 : dist <= PERTO[1] ? 1 : 2);
          if (j + t.n > this.maximo) continue;
          this.tapete.instanceMatrix.array.set(t.mats, j * 16);
          this.tapete.instanceColor.array.set(t.cores, j * 3);
          j += t.n;
        }
      }
    }
    this.tapete.count = j;
    this.tapete.instanceMatrix.needsUpdate = true;
    this.tapete.instanceColor.needsUpdate = true;
  }
}
