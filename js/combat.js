import * as THREE from 'three';
import { GLOW } from './world.js';

const _v = new THREE.Vector3();

// Ângulo (rad) entre a direção "facing" (yaw) e o vetor até o alvo
export function angleToTarget(fromPos, facing, toPos) {
  const dx = toPos.x - fromPos.x, dz = toPos.z - fromPos.z;
  const a = Math.atan2(dx, dz);
  let d = a - facing;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

export function yawTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }

export function turnTowards(cur, target, maxStep) {
  let d = target - cur;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return cur + THREE.MathUtils.clamp(d, -maxStep, maxStep);
}

export function flatDist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

// ---------- Partículas (um único THREE.Points com shader aditivo) ----------
export class Effects {
  constructor(game) {
    this.game = game;
    this.max = 5000;
    this.parts = [];
    const geo = new THREE.BufferGeometry();
    this.posArr = new Float32Array(this.max * 3);
    this.colArr = new Float32Array(this.max * 3);
    this.alphaArr = new Float32Array(this.max);
    this.sizeArr = new Float32Array(this.max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('pcolor', new THREE.BufferAttribute(this.colArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphaArr, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizeArr, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { scale: { value: 800 } },
      vertexShader: `
        attribute vec3 pcolor; attribute float alpha; attribute float size; uniform float scale;
        varying vec3 vColor; varying float vAlpha;
        void main(){ vColor = pcolor; vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec3 vColor; varying float vAlpha;
        void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor * a * vAlpha, a * vAlpha); }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    game.scene.add(this.points);
    this.rings = [];
  }

  setScale(height, fov) {
    this.material.uniforms.scale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  spawn(p) {
    if (this.parts.length >= this.max) this.parts.shift();
    p.age = 0;
    p.gravity ??= 0; p.drag ??= 0;
    p.vel ??= new THREE.Vector3();
    this.parts.push(p);
  }

  burst(pos, { count = 20, color = [1, 0.8, 0.5], speed = 4, size = 0.1, life = 0.5, gravity = 9, up = 1, spread = 1 } = {}) {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3((Math.random() - 0.5) * 2 * spread, Math.random() * up + 0.2, (Math.random() - 0.5) * 2 * spread)
        .normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      this.spawn({ pos: pos.clone(), vel: v, color, size: size * (0.6 + Math.random() * 0.8), life: life * (0.6 + Math.random() * 0.6), gravity, drag: 1.5 });
    }
  }

  sparks(pos) { this.burst(pos, { count: 18, color: [1, 0.75, 0.35], speed: 7, size: 0.07, life: 0.35, gravity: 12 }); }
  blood(pos) { this.burst(pos, { count: 22, color: [0.55, 0.02, 0.02], speed: 4, size: 0.12, life: 0.6, gravity: 14 }); }
  darkBlood(pos) { this.burst(pos, { count: 22, color: [0.25, 0.05, 0.3], speed: 4, size: 0.14, life: 0.6, gravity: 10 }); }

  soulStream(from, count = 30) {
    for (let i = 0; i < count; i++) {
      this.spawn({
        pos: from.clone().add(new THREE.Vector3((Math.random() - 0.5), Math.random() * 1.5, (Math.random() - 0.5))),
        vel: new THREE.Vector3((Math.random() - 0.5) * 4, 2 + Math.random() * 3, (Math.random() - 0.5) * 4),
        color: [0.75, 0.88, 1], size: 0.13, life: 3, home: true, delay: Math.random() * 0.5,
      });
    }
  }

  fire(pos, radius) {
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * radius;
      this.spawn({
        pos: pos.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.3, 0.2, Math.sin(a) * r * 0.3)),
        vel: new THREE.Vector3(Math.cos(a) * r * 2, 2 + Math.random() * 4, Math.sin(a) * r * 2),
        color: Math.random() < 0.5 ? [1, 0.5, 0.1] : [1, 0.8, 0.3], size: 0.35 + Math.random() * 0.3, life: 0.7, gravity: -2, drag: 3,
      });
    }
  }

  // Onda de choque visual (anel que se expande no chão)
  ring(pos, maxR, dur, color = 0xff6a30) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, 0.08, pos.z);
    this.game.scene.add(m);
    this.rings.push({ m, maxR, dur, t: 0 });
  }

  update(dt) {
    const player = this.game.player;
    const target = _v.copy(player.pos); target.y += 1.1;
    let n = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (p.delay > 0) { p.delay -= dt; }
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      if (p.home && p.age > 0.5) {
        const dir = target.clone().sub(p.pos);
        const d = dir.length();
        if (d < 0.4) { this.parts.splice(i, 1); continue; }
        p.vel.lerp(dir.normalize().multiplyScalar(14), Math.min(1, dt * 4));
      } else {
        p.vel.y -= p.gravity * dt;
        p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      }
      p.pos.addScaledVector(p.vel, dt);
    }
    for (const p of this.parts) {
      const k = 1 - p.age / p.life;
      this.posArr[n * 3] = p.pos.x; this.posArr[n * 3 + 1] = p.pos.y; this.posArr[n * 3 + 2] = p.pos.z;
      this.colArr[n * 3] = p.color[0]; this.colArr[n * 3 + 1] = p.color[1]; this.colArr[n * 3 + 2] = p.color[2];
      this.alphaArr[n] = Math.min(1, k * 1.5);
      this.sizeArr[n] = p.size * (0.5 + 0.5 * k);
      n++;
    }
    const g = this.points.geometry;
    g.setDrawRange(0, n);
    for (const k of ['position', 'pcolor', 'alpha', 'size']) g.attributes[k].needsUpdate = true;

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const k = r.t / r.dur;
      if (k >= 1) { this.game.scene.remove(r.m); r.m.geometry.dispose(); this.rings.splice(i, 1); continue; }
      const s = Math.max(0.01, r.maxR * k);
      r.m.scale.set(s, s, 1);
      r.m.material.opacity = 0.9 * (1 - k);
    }
  }
}

// ---------- Projéteis ----------
export class Projectiles {
  constructor(game) { this.game = game; this.list = []; }

  makeGlow(color, size) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW.tex, color, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.set(size, size, 1);
    return s;
  }

  // Orbe sombrio (inimigos)
  // `visual`: cópia de um projétil do OUTRO jogador no co-op (rede/coop.js) —
  // aparece, voa e explode, mas não fere ninguém: o dano é de quem o criou.
  orb({ pos, dir, speed = 9, damage = 25, homing = 0, color = 0x9a50ff, size = 0.9, life = 4, delay = 0, alvo = null, visual = false }) {
    const g = new THREE.Group();
    g.add(this.makeGlow(color, size));
    g.add(this.makeGlow(0xffffff, size * 0.3));
    g.position.copy(pos);
    this.game.scene.add(g);
    this.list.push({ kind: 'orb', mesh: g, pos: g.position, vel: dir.clone().normalize().multiplyScalar(speed), speed, damage, homing: visual ? 0 : homing, life, delay, color, alvo, visual });
    if (!visual) this.game.sessao?.aoProjetil?.('orb', { pos, dir, speed, life, delay });
  }

  bomb({ pos, vel, damage, radius, visual = false }) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), new THREE.MeshStandardMaterial({ color: 0x3a2e28, roughness: 0.9 }));
    g.add(m);
    const spark = this.makeGlow(0xffaa40, 0.4); spark.position.y = 0.15; g.add(spark);
    g.position.copy(pos);
    this.game.scene.add(g);
    this.list.push({ kind: 'bomb', mesh: g, pos: g.position, vel, damage, radius, life: 4, visual });
    if (!visual) this.game.sessao?.aoProjetil?.('bomb', { pos, vel, radius });
  }

  // Onda de choque que se expande pelo chão — role através dela
  shock({ pos, maxR, speed = 10, damage = 30, poise = 60, skip = false, visual = false }) {
    this.game.effects.ring(pos, maxR, maxR / speed, 0xff7a40);
    this.list.push({ kind: 'shock', mesh: null, pos: pos.clone(), r: 0, maxR, speed, damage, poise, hit: skip, life: 10, visual });
    if (!visual) this.game.sessao?.aoProjetil?.('shock', { pos, maxR, speed });
  }

  explodeBomb(p) {
    const game = this.game;
    game.effects.fire(p.pos, p.radius);
    game.effects.ring(p.pos, p.radius, 0.35, 0xff7a20);
    game.sfx.explosion();
    game.addShake(0.35);
    if (p.visual) return;
    for (const e of game.allEnemies()) {
      if (e.dead) continue;
      const d = flatDist(e.pos, p.pos);
      if (d < p.radius + e.radius) game.golpear(e, p.damage * (1 - 0.4 * (d / (p.radius + e.radius))), p.pos, 60, { fire: true });
    }
  }

  update(dt) {
    const game = this.game;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      // Quem o projétil persegue (o orbe mira o alvo de quem o lançou); qualquer
      // jogador no caminho é atingido — ver `game.jogadores`.
      const player = p.alvo && !p.alvo.dead ? p.alvo : game.player;
      if (p.delay > 0) {
        p.delay -= dt;
        // Orbe paira antes de ser disparado
        p.mesh.position.y += Math.sin(game.time * 6 + i) * dt * 0.3;
        if (p.delay <= 0 && p.kind === 'orb') {
          const aim = player.pos.clone(); aim.y += 1.0;
          p.vel.copy(aim.sub(p.pos).normalize().multiplyScalar(p.speed));
          game.sfx.cast();
        }
        continue;
      }
      p.life -= dt;
      let remove = p.life <= 0;

      if (p.kind === 'orb') {
        if (p.homing > 0 && !player.dead) {
          const want = player.pos.clone(); want.y += 1.0;
          want.sub(p.pos).normalize().multiplyScalar(p.speed);
          p.vel.lerp(want, Math.min(1, dt * p.homing));
        }
        p.pos.addScaledVector(p.vel, dt);
        if (Math.random() < 0.7) {
          game.effects.spawn({ pos: p.pos.clone(), vel: new THREE.Vector3(), color: [0.5, 0.25, 0.9], size: 0.25, life: 0.35 });
        }
        for (const j of p.visual ? [] : game.jogadores) {
          const d = Math.hypot(p.pos.x - j.pos.x, p.pos.z - j.pos.z);
          const dy = p.pos.y - (j.pos.y + 1);
          if (remove || j.dead || d >= j.radius + 0.35 || Math.abs(dy) >= 1.1) continue;
          const res = j.takeDamage(p.damage, p.pos, { poise: 25 });
          if (res !== 'iframe') { remove = true; game.effects.burst(p.pos, { count: 25, color: [0.6, 0.3, 1], speed: 4, size: 0.15, life: 0.5, gravity: 2 }); }
        }
        if (game.world.acimaDoChao(p.pos) < 0.05 || !game.world.pointInside(p.pos)) {
          remove = true;
          game.effects.burst(p.pos, { count: 15, color: [0.6, 0.3, 1], speed: 3, size: 0.12, life: 0.4, gravity: 2 });
        }
      } else if (p.kind === 'shock') {
        p.r += p.speed * dt;
        // `p.hit` vira um conjunto: a onda acerta cada jogador uma vez só
        if (!(p.hit instanceof Set)) p.hit = new Set(p.hit ? game.jogadores : []);
        for (const j of p.visual ? [] : game.jogadores) {
          const d = flatDist(j.pos, p.pos);
          if (p.hit.has(j) || j.dead || d >= p.r + j.radius || d <= p.r - 1.0 - j.radius) continue;
          const res = j.takeDamage(p.damage, p.pos, { poise: p.poise });
          if (res !== 'iframe') p.hit.add(j);
        }
        if (p.r >= p.maxR) remove = true;
      } else if (p.kind === 'bomb') {
        p.vel.y -= 16 * dt;
        p.pos.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += dt * 10;
        let hit = game.world.acimaDoChao(p.pos) <= 0.13 || !game.world.pointInside(p.pos);
        for (const e of game.allEnemies()) {
          if (!e.dead && flatDist(e.pos, p.pos) < e.radius + 0.2 && p.pos.y < e.pos.y + e.height) hit = true;
        }
        if (hit) { this.explodeBomb(p); remove = true; }
      }

      if (remove) { if (p.mesh) game.scene.remove(p.mesh); this.list.splice(i, 1); }
    }
  }

  clear() {
    for (const p of this.list) if (p.mesh) this.game.scene.remove(p.mesh);
    this.list = [];
  }
}
