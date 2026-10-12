/**
 * A ÁGUA (11/10/2026) — os espelhos d'água rasa do ar livre (a lagoa das WindHills), no jeito
 * das enseadas dos jogos low poly estilizados: turquesa clara, o fundo de areia aparecendo, uma
 * rede de linhas brancas correndo na superfície e espuma na beira. Tudo DESENHADO EM CÓDIGO.
 *
 * Os dados vêm do `mapa.json` (`agua.<variante>`: o `nivel` em metros e a `caixa` [x0, z0, x1,
 * z1]; quem os grava é `ferramentas/cenarios/lagoa.mjs`, que também cava a bacia no relevo). A
 * água é UM plano na altura do nível, do tamanho da caixa: ela só aparece onde o chão está
 * abaixo dele (no resto, o chão a cobre). Cada vértice leva a PROFUNDIDADE (`aFundo` = nível −
 * chão): é ela que dá a cor (rasa clara, funda turquesa), a transparência e a espuma da beira.
 * Embaixo, um LEITO opaco cor de areia tapa o que não tem chão (as células de rocha no meio da
 * lagoa — a ilhota —, onde se veria o céu por dentro d'água).
 *
 * Quem mais sabe da água: `World.fundoDaAgua` (quanta água há num ponto), `corDoChao` (a areia
 * da praia e do fundo) e o capim, que não nasce nela. Anda-se por dentro: é rasa (~70 cm).
 *
 * As VITÓRIAS-RÉGIAS (folhas boiando, algumas com flor) também são daqui, e não do `decor.json`:
 * a altura delas é a da ÁGUA, e o decorador do editor zera a altura de quem está perto do chão.
 *
 * OS RESPINGOS (`pisar`, `onda`): quem anda dentro d'água — o jogador, os outros jogadores,
 * inimigos e bichos — deixa ANÉIS que se abrem na superfície (um a cada 80 cm andados, um
 * maior ao entrar ou rolar, um devagar de vez em quando parado) e GOTAS que sobem (as partículas
 * de sempre, `effects.burst`). Os anéis são um `InstancedMesh` de `ONDAS` cópias reaproveitadas.
 */
import * as THREE from 'three';
import { CELL, horaDoMundo } from './world.js';

const PASSO = 1.5;        // a grade do plano d'água (m): a mesma do chão (CELL / 4)
const ONDAS = 72;         // quantos anéis de respingo ao mesmo tempo
const PERTO = 50;         // só há respingo de quem está a menos disto do jogador (m)

/** A folha: um disco de 7 lados com um corte (a fenda da vitória-régia), a cor nos vértices. */
function geometriaDaFolha() {
  const pos = [], cor = [], N = 9, verde = [0.11, 0.36, 0.12], claro = [0.2, 0.5, 0.15];
  for (let i = 0; i < N - 1; i++) {      // falta um gomo: a fenda
    const a = (i / N) * Math.PI * 2, b = ((i + 1) / N) * Math.PI * 2;
    pos.push(0, 0, 0, Math.cos(b), 0, Math.sin(b), Math.cos(a), 0, Math.sin(a));
    const t = i % 2 ? 0.92 : 1;
    cor.push(...claro, ...verde.map((v) => v * t), ...verde.map((v) => v * t));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3));
  return g;
}

/** A flor: uma coroa de pétalas pontudas (duas voltas) e o miolo. */
function geometriaDaFlor() {
  const pos = [], cor = [], rosa = [0.95, 0.56, 0.7], branco = [1, 0.9, 0.93], miolo = [0.95, 0.72, 0.2];
  const petala = (a, r, h, abre, c0, c1) => {
    const l = 0.32, ca = Math.cos(a), sa = Math.sin(a), px = -sa * l * r, pz = ca * l * r;
    pos.push(0, 0.02, 0, ca * r * 0.55 + px, h * 0.5, sa * r * 0.55 + pz, ca * r * abre, h, sa * r * abre,
      0, 0.02, 0, ca * r * abre, h, sa * r * abre, ca * r * 0.55 - px, h * 0.5, sa * r * 0.55 - pz);
    cor.push(...c0, ...c1, ...c1, ...c0, ...c1, ...c1);
  };
  for (let i = 0; i < 7; i++) petala((i / 7) * Math.PI * 2, 1, 0.42, 1, rosa, branco);
  for (let i = 0; i < 5; i++) petala((i / 5) * Math.PI * 2 + 0.4, 0.6, 0.62, 0.55, branco, branco);
  pos.push(-0.1, 0.3, -0.1, 0, 0.42, 0.12, 0.1, 0.3, -0.1);
  cor.push(...miolo, ...miolo, ...miolo);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
  g.computeVertexNormals();
  return g;
}

export class Agua {
  constructor(game) {
    this.game = game;
    this.tempo = { value: 0 };
    this.malhas = [];
    const w = game.world;
    if (!w.agua.length) return;

    // SEM a luz da cena (MeshBasic): com ela (o sol mais o céu passam de 1 ao meio-dia) a cor
    // estourava para o branco e a água ficava leitosa, fosca — e de noite, quase sem luz, apagava.
    // A claridade é dela: `uLuz`, que o `update` acerta pela hora (cheia de dia, ~55% de noite: a
    // lagoa continua brilhando sob a lua). O brilho vem das linhas e das CINTILAÇÕES (os pontos de luz).
    this.luz = { value: 1 };
    const mat = this.mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTempo = this.tempo;
      sh.uniforms.uLuz = this.luz;
      sh.vertexShader = 'attribute float aFundo;\nvarying float vFundo;\nvarying vec2 vXZ;\n'
        + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n\tvFundo = aFundo;\n\tvXZ = position.xz;');
      sh.fragmentShader = 'uniform float uTempo;\nuniform float uLuz;\nvarying float vFundo;\nvarying vec2 vXZ;\n'
        + 'vec2 sorteAgua(vec2 p) { return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }\n'
        + sh.fragmentShader.replace('#include <color_fragment>', `
        if (vFundo < -0.03) discard;
        float fundo = max(vFundo, 0.0), prof = smoothstep(0.0, 0.75, fundo);
        vec3 corAgua = mix(vec3(0.42, 0.82, 0.76), vec3(0.07, 0.44, 0.58), prof);
        // a REDE de linhas claras: as bordas de células que se mexem devagar (Voronoi)
        vec2 pa = vXZ * 0.78 + vec2(uTempo * 0.05, uTempo * 0.035) + 0.35 * sin(vXZ.yx * 0.31 + uTempo * 0.2), ia = floor(pa), fa = fract(pa);
        float d1 = 9.0, d2 = 9.0;
        for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
          vec2 viz = vec2(float(i), float(j)), pt = sorteAgua(ia + viz);
          pt = 0.5 + 0.42 * sin(uTempo * 0.5 + 6.2831 * pt);
          float dq = length(viz + pt - fa);
          if (dq < d1) { d2 = d1; d1 = dq; } else if (dq < d2) d2 = dq;
        }
        float rede = smoothstep(0.09, 0.0, d2 - d1) * (0.55 - 0.3 * prof);
        // a ESPUMA: uma faixa que vai e volta na beira
        float beira = smoothstep(0.13, 0.0, vFundo) * (0.62 + 0.38 * sin(uTempo * 1.5 + vXZ.x * 0.8 + vXZ.y * 0.6));
        // as CINTILAÇÕES: um ponto de luz no meio de algumas células, piscando cada um no seu tempo
        vec2 quem = sorteAgua(ia + 0.5);
        float cintila = smoothstep(0.1, 0.0, d1) * step(0.45, quem.x) * pow(0.5 + 0.5 * sin(uTempo * (1.6 + quem.y * 2.4) + quem.x * 40.0), 6.0);
        float brancoAgua = clamp(rede + beira + cintila * 0.9, 0.0, 1.0);
        diffuseColor.rgb = mix(corAgua, vec3(1.0), brancoAgua) * uLuz;
        diffuseColor.a = max(mix(0.4, 0.84, prof), brancoAgua * 0.92);`);
    };
    const matLeito = new THREE.MeshLambertMaterial({ color: 0x8fb7a8 });
    // os ANÉIS dos respingos: um aro chato que cresce e some (aditivo: a cor escurecendo é o sumir)
    const aro = new THREE.RingGeometry(0.925, 1, 24);
    aro.rotateX(-Math.PI / 2);
    this.ondas = new THREE.InstancedMesh(aro, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), ONDAS);
    this.ondas.name = 'respingos';
    this.ondas.frustumCulled = false;
    this.ondas.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(ONDAS * 3), 3);
    this.ondas.count = ONDAS;
    this.vivas = Array.from({ length: ONDAS }, () => ({ t: 1, dur: 1, x: 0, y: 0, z: 0, r0: 0, r1: 0, forca: 0 }));
    this.proxima = 0;
    this.pes = new WeakMap();   // quem anda → onde estava e quanto andou desde o último anel
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._gota = new THREE.Vector3();
    for (let i = 0; i < ONDAS; i++) { this.ondas.setMatrixAt(i, this._m.makeScale(0, 0, 0)); this.ondas.instanceColor.setXYZ(i, 0, 0, 0); }
    game.scene.add(this.ondas);
    const gFolha = geometriaDaFolha(), gFlor = geometriaDaFlor();
    const matPlanta = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

    for (const a of w.agua) {
      const [x0, z0, x1, z1] = a.caixa, nx = Math.ceil((x1 - x0) / PASSO), nz = Math.ceil((z1 - z0) / PASSO);
      const pos = [], fundo = [], idx = [];
      for (let k = 0; k <= nz; k++) for (let i = 0; i <= nx; i++) {
        const x = x0 + (i / nx) * (x1 - x0), z = z0 + (k / nz) * (z1 - z0);
        pos.push(x, a.nivel, z);
        // sem chão (rocha): fundo "fundo" — quem aparece embaixo é o leito
        fundo.push(w.ch(Math.round(z / CELL), Math.round(x / CELL)) === 'f' ? a.nivel - w.relevoEm(x, z) : 0.9);
      }
      for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
        const p = k * (nx + 1) + i, q = p + nx + 1;
        idx.push(p, q, p + 1, p + 1, q, q + 1);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('aFundo', new THREE.Float32BufferAttribute(fundo, 1));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill([0, 1, 0]).flat(), 3));
      g.setIndex(idx);
      const espelho = new THREE.Mesh(g, mat);
      espelho.name = `água: ${a.nome ?? ''}`;
      const leito = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), matLeito);
      leito.rotation.x = -Math.PI / 2;
      leito.position.set((x0 + x1) / 2, a.nivel - 1.3, (z0 + z1) / 2);
      game.scene.add(leito, espelho);
      this.malhas.push(espelho, leito);

      // as vitórias-régias: em grupos, onde a água tem de um palmo a meio metro
      let s = (Math.round(x0 * 31 + z0 * 17) >>> 0) || 7;
      const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
      const folhas = [], flores = [], m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), t = new THREE.Vector3();
      for (let n = 0; n < 60 && folhas.length < 70; n++) {
        const gx = x0 + rnd() * (x1 - x0), gz = z0 + rnd() * (z1 - z0);
        for (let k = 2 + Math.floor(rnd() * 5); k > 0; k--) {
          const x = gx + (rnd() - 0.5) * 3.4, z = gz + (rnd() - 0.5) * 3.4, f = w.fundoDaAgua(x, z), r = 0.32 + rnd() * 0.3, giro = rnd() * Math.PI * 2, flor = rnd() < 0.3;
          if (f < 0.22 || f > 0.6 || w.ch(Math.round(z / CELL), Math.round(x / CELL)) !== 'f') continue;
          q.setFromEuler(e.set(0, giro, 0));
          folhas.push(m.compose(v.set(x, a.nivel + 0.025, z), q, t.set(r, 1, r)).clone());
          if (flor) flores.push(m.compose(v.set(x + 0.1, a.nivel + 0.03, z + 0.08), q, t.setScalar(r * 0.75)).clone());
        }
      }
      for (const [geo, lista] of [[gFolha, folhas], [gFlor, flores]]) {
        if (!lista.length) continue;
        const im = new THREE.InstancedMesh(geo, matPlanta, lista.length);
        lista.forEach((mt, i) => im.setMatrixAt(i, mt));
        im.name = 'vitórias-régias';
        im.computeBoundingSphere();
        game.scene.add(im);
        this.malhas.push(im);
      }
    }
  }

  /** Um anel na superfície, em (x, z): abre de `r0` a `r1` metros em `dur` segundos. */
  onda(x, y, z, r0, r1, dur, forca = 1) {
    const o = this.vivas[this.proxima];
    this.proxima = (this.proxima + 1) % ONDAS;
    o.t = 0; o.dur = dur; o.x = x; o.y = y; o.z = z; o.r0 = r0; o.r1 = r1; o.forca = forca;
  }

  /** Quem está em `pos` mexeu na água? Anéis e gotas conforme andou, entrou ou está parado. */
  pisar(quem, pos, dt, raio = 0.4) {
    const w = this.game.world, fundo = w.fundoDaAgua(pos.x, pos.z);
    let p = this.pes.get(quem);
    if (!p) this.pes.set(quem, p = { x: pos.x, z: pos.z, andou: 0, parado: 0, dentro: false });
    const passo = Math.hypot(pos.x - p.x, pos.z - p.z);
    p.x = pos.x; p.z = pos.z;
    // fora d'água, no ar (um salto) ou "teleportado" (mais de 3 m num quadro): nada
    const dentro = fundo > 0.04 && pos.y - w.alturaChao(pos) < 0.35 && passo < 3;
    if (!dentro) { p.dentro = false; p.andou = 0; return; }
    const nivel = pos.y + fundo + 0.012, vel = passo / Math.max(dt, 1e-3);
    if (!p.dentro) {                       // ENTROU: o respingo maior
      p.dentro = true;
      this.onda(pos.x, nivel, pos.z, raio * 0.6, raio * 3.6, 1.1, 1);
      this.game.effects.burst(this._gota.set(pos.x, nivel + 0.05, pos.z), { count: 10, color: [0.8, 0.95, 1], speed: 2.6, size: 0.07, life: 0.5, gravity: 9, up: 2.2, spread: 1.2 });
    }
    p.andou += passo;
    if (p.andou > 0.8) {                   // ANDANDO: um anel a cada 80 cm, gotas (mais se corre ou rola)
      p.andou = 0; p.parado = 0;
      const forte = Math.min(1, vel / 6);
      this.onda(pos.x, nivel, pos.z, raio * 0.4, raio * (2 + forte * 1.6), 0.75 + forte * 0.3, 0.55 + forte * 0.45);
      this.game.effects.burst(this._gota.set(pos.x, nivel + 0.04, pos.z), { count: 3 + Math.round(forte * 6), color: [0.8, 0.95, 1], speed: 1.4 + forte * 1.8, size: 0.06, life: 0.38, gravity: 9, up: 1.3 + forte * 1.2, spread: 1 });
    } else if (vel < 0.3 && (p.parado += dt) > 1.7) {   // PARADO: um anel devagar de vez em quando
      p.parado = 0;
      this.onda(pos.x, nivel, pos.z, raio * 0.7, raio * 2.2, 1.6, 0.35);
    }
  }

  update(dt) {
    this.tempo.value += dt;
    if (!this.ondas) return;
    // a luz própria da água, pela hora: de dia clara, de noite quase nada
    const h = horaDoMundo(), dia = Math.max(0, Math.min(1, Math.sin(((h - 5.5) / 13) * Math.PI) * 1.6));
    this.luz.value = 0.55 + 0.45 * dia;   // a claridade da água: cheia de dia, um pouco mais da metade de noite
    // quem pode estar na água: o jogador, os outros jogadores, e os inimigos e bichos de perto
    const g = this.game, eu = g.player.pos;
    this.pisar(g.player, eu, dt);
    for (const o of g.sessao?.outros ?? []) if (o?.pos) this.pisar(o, o.pos, dt);
    for (const e of g.all) {
      if (!e || !e.active || e.dead || !e.pos || Math.abs(e.pos.x - eu.x) > PERTO || Math.abs(e.pos.z - eu.z) > PERTO) continue;
      this.pisar(e, e.pos, dt, Math.max(0.35, e.radius ?? 0.4));
    }
    // os anéis: crescem freando e somem
    const cor = this.ondas.instanceColor;
    for (let i = 0; i < ONDAS; i++) {
      const o = this.vivas[i];
      if (o.t >= 1) continue;
      o.t = Math.min(1, o.t + dt / o.dur);
      const k = 1 - (1 - o.t) * (1 - o.t), r = o.t >= 1 ? 0 : o.r0 + (o.r1 - o.r0) * k, luz = (1 - o.t) * 0.42 * o.forca * (0.25 + 0.75 * dia);
      this.ondas.setMatrixAt(i, this._m.compose(this._v.set(o.x, o.y, o.z), this._q, this._s.set(r, 1, r)));
      cor.setXYZ(i, luz, luz, luz);
    }
    this.ondas.instanceMatrix.needsUpdate = true;
    cor.needsUpdate = true;
  }
}
