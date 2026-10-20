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
 * crescem na mesma proporção — SEM DEGRAU desde 19/10/2026 (ver `ventoENormal` e `update`).
 * O vento é do shader (a ponta anda numa onda que corre pelo
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
const DENSIDADE_MAX = 90;   // o teto do `capim` da qualidade (o Alto usa 40)
// a grade e as folhas de GEOMETRIA
const PASSO_MIN = 0.3;            // a grade mais fina do tapete (m), no Alto
const FOLHAS = 6;                 // folhas por touceira
/**
 * O CAPIM SEM DEGRAU (19/10/2026). Eram três grades (perto, meio, longe) trocadas por CÉLULA
 * de 6 m: a ~13 e a ~25 m a célula inteira trocava de touceiras de uma vez, e na borda (~39 m)
 * o tapete entrava e saía em quadrados — andando, o capim "pipocava". Agora é UMA grade (a fina),
 * e cada touceira tem a sua SORTE (0–1). A densidade cai com a distância (`densidade`: 1 até
 * ¼ do raio, `LONGE` a ¾, zero na borda): no shader, a touceira cuja sorte passa da densidade
 * dali ENCOLHE até sumir (`FAIXA` de sorte), e as que ficam alargam na mesma proporção (a
 * cobertura não muda); na borda todas afundam. O JS só escolhe, por célula, as touceiras que
 * PODEM aparecer (a sorte em ordem: um começo do lote) e remonta o tapete a cada `MEXEU` metros.
 */
const LONGE = 1 / (2.2 * 2.2);    // a densidade longe (a grade 2,2× mais aberta de antes)
const FAIXA = 0.1;                // a faixa de sorte em que a touceira encolhe
const MEXEU = 2;                  // m andados para remontar o tapete (a folga das contas)
const suave = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** A densidade do tapete a `d` metros do jogador (a MESMA conta do shader), com `fim` = o raio em metros. */
function densidade(d, fim) {
  return (1 - (1 - LONGE) * suave(fim * 0.25, fim * 0.75, d)) * (1 - suave(fim * 0.78, fim, d));
}

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

/** O shader do capim: o VENTO, as duas faces com a mesma luz e a DENSIDADE pela distância. */
function ventoENormal(sh, tempo, u) {
  sh.uniforms.uTempo = tempo;
  Object.assign(sh.uniforms, u);
  sh.vertexShader = 'uniform float uTempo;\nuniform vec2 uCentro;\nuniform float uFim;\nuniform float uSuave;\nattribute float aSorte;\n' + sh.vertexShader.replace('#include <project_vertex>', `
        // a DENSIDADE (a mesma conta de \`densidade\` no JS): a touceira de sorte alta encolhe
        // longe; as que ficam alargam (a grade "abre"); na borda todas afundam
        #ifdef USE_INSTANCING
          float capD = distance( vec2( instanceMatrix[3].x, instanceMatrix[3].z ), uCentro );
          float capBase = mix( 1.0, ${LONGE.toFixed(4)}, smoothstep( uFim * 0.25, uFim * 0.75, capD ) );
          float capDens = capBase * ( 1.0 - smoothstep( uFim * 0.78, uFim, capD ) ) * ${(1 + FAIXA).toFixed(2)};
          // (o carregamento dinâmico desligado, graficos.js: a touceira aparece de uma vez)
          float capVer = uSuave > 0.5 ? 1.0 - smoothstep( capDens - ${FAIXA.toFixed(2)}, capDens, aSorte ) : step( aSorte, capDens - ${FAIXA.toFixed(2)} );
          float capEsc = clamp( inversesqrt( capBase ), 1.0, 2.2 );
          transformed.xz *= capEsc * capVer;
          transformed.y *= capVer * ( 1.0 + ( capEsc - 1.0 ) * 0.2 );
        #endif
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
    this.u = { uCentro: { value: new THREE.Vector2() }, uFim: { value: RAIO * CELL }, uSuave: { value: 1 } };
    const gp = geometriaDaTouceira();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => ventoENormal(sh, this.tempo, this.u);
    // (uma célula a mais em volta: o jogador anda dentro da dele, e o tapete vai a `raio` METROS·CELL dele)
    this.maximo = (2 * RAIO + 3) ** 2 * Math.ceil(CELL / PASSO_MIN) ** 2;
    this.sorte = new THREE.InstancedBufferAttribute(new Float32Array(this.maximo), 1);
    gp.setAttribute('aSorte', this.sorte);
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
   * O tapete de UMA célula, na grade fina (guardado: andar só calcula as que entraram), com as
   * touceiras EM ORDEM DE SORTE: quem pode aparecer a uma distância é sempre um começo do lote.
   */
  celulaDoTapete(w, r, c) {
    const nivel = 0, chave = r * 1024 + c;
    let pronta = this.prontas.get(chave);
    if (pronta) return pronta;
    const passo = this.passo, n = Math.max(1, Math.round(CELL / passo)), real = CELL / n;
    const mats = new Float32Array(n * n * 16), cores = new Float32Array(n * n * 3), sortes = new Float32Array(n * n);
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
      const v = 0.95 + rnd() * 0.1, sorte = rnd(), vez = rnd();
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
      sortes[i] = vez;
      i++;
    }
    // em ordem de sorte
    const ordem = Array.from({ length: i }, (_, k) => k).sort((a, b) => sortes[a] - sortes[b]);
    pronta = { n: i, mats: new Float32Array(i * 16), cores: new Float32Array(i * 3), sortes: new Float32Array(i) };
    ordem.forEach((k, j) => {
      pronta.mats.set(mats.subarray(k * 16, k * 16 + 16), j * 16);
      pronta.cores.set(cores.subarray(k * 3, k * 3 + 3), j * 3);
      pronta.sortes[j] = sortes[k];
    });
    if (this.prontas.size > 400) this.prontas.clear();   // andou muito: recomeça (as de perto voltam já)
    this.prontas.set(chave, pronta);
    return pronta;
  }

  /** O `capim` da qualidade gráfica (0 = sem capim): dele sai o `passo` da grade. */
  get densidade() { return Math.min(DENSIDADE_MAX, this.game.graficos?.q.capim ?? 22); }

  /** Até quantas células em volta do jogador (o `capimRaio` da qualidade; o Mínimo, sem placa, só o perto). */
  get raio() { return Math.min(RAIO, this.game.graficos?.q.capimRaio ?? RAIO); }

  /** Remonta já (a qualidade mudou). */
  refazer() { this.celula = null; this.prontas.clear(); }

  update(dt) {
    this.tempo.value += dt;
    const w = this.game.world, p = this.game.player.pos;
    // (a distância da GRAMA escolhida nas opções avançadas, modo "por tipo", encurta o tapete)
    const R = this.raio, fim = Math.min(R * CELL, this.game.graficos?.distanciaTipo?.('grama') ?? Infinity);
    // o shader segue o jogador TODO quadro (a densidade anda junto, sem degrau)
    this.u.uCentro.value.set(p.x, p.z);
    this.u.uFim.value = fim;
    this.u.uSuave.value = (this.game.graficos?.suaveDe?.('grama') ?? this.game.graficos?.dinamico !== false) ? 1 : 0;
    // o tapete (quem PODE aparecer) só a cada `MEXEU` metros — as contas têm essa folga
    const u = this.celula, chave = `${this.densidade},${R},${fim}`;
    if (u && u.chave === chave && Math.hypot(p.x - u.x, p.z - u.z) < MEXEU) return;
    this.celula = { chave, x: p.x, z: p.z };
    const [r0, c0] = w.cellOf(p);
    let j = 0;
    if (this.densidade > 0) {
      for (let r = r0 - R - 1; r <= r0 + R + 1; r++) {
        for (let c = c0 - R - 1; c <= c0 + R + 1; c++) {
          if (w.ch(r, c) !== 'f') continue;
          // o ponto da célula mais perto do jogador
          const dx = Math.max(0, Math.abs(p.x - c * CELL) - CELL / 2), dz = Math.max(0, Math.abs(p.z - r * CELL) - CELL / 2);
          const dMin = Math.max(0, Math.hypot(dx, dz) - MEXEU);
          if (dMin >= fim) continue;
          const t = this.celulaDoTapete(w, r, c);
          // as que podem aparecer: sorte abaixo da densidade dali (a maior da célula)
          const ate = densidade(dMin, fim) * (1 + FAIXA);
          let n = 0, hi = t.n;
          while (n < hi) { const m = (n + hi) >> 1; if (t.sortes[m] < ate) n = m + 1; else hi = m; }
          if (!n || j + n > this.maximo) continue;
          this.tapete.instanceMatrix.array.set(t.mats.subarray(0, n * 16), j * 16);
          this.tapete.instanceColor.array.set(t.cores.subarray(0, n * 3), j * 3);
          this.sorte.array.set(t.sortes.subarray(0, n), j);
          j += n;
        }
      }
    }
    this.tapete.count = j;
    this.tapete.instanceMatrix.needsUpdate = true;
    this.tapete.instanceColor.needsUpdate = true;
    this.sorte.needsUpdate = true;
  }
}
