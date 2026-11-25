/**
 * O COMPORTAMENTO HIDRA (25/11/2026; a primeira: a MYCOHYDRA, o chefe das WindHills): um colosso de
 * várias cabeças ENRAIZADO — não anda (`imovel`: nem o empurrão dos corpos o tira do lugar), só gira
 * devagar no próprio eixo para encarar quem luta. De PERTO, PISOTEIA com o pé mais perto do alvo
 * (o pisão fere em volta do pé e solta uma onda de choque pelo chão); de LONGE, as cabeças CUSPEM
 * veneno, uma depois da outra (os orbes, que são regra: `projectiles.orb`). Na FÚRIA (pouca vida) cospem
 * mais cabeças e a pausa encurta. A base (vida, estado, alvo, morte, troca de simulador) é a do
 * cerebro.js; dormir, acordar e a zona da luta são os traços `chefe` e `zona` (tracos.js). Os números
 * de cada golpe moram na ficha (`golpes`, `furia`), e o que veio do MODELO também: onde fica cada
 * BOCA e cada PÉ (`bocas`, `pes`, em metros com o bicho olhando para +Z — medidos pelo
 * ferramentas/chefe-de-arquivo/rigar.mjs, que imprime as juntas em metros).
 *
 * O dano entra pelo cilindro do corpo (`radius` × `height`, como em todo inimigo): a espada só alcança
 * as pernas e a barriga, e o que é ARREMESSADO acerta até as cabeças — com o mesmo dano.
 *
 * O corpo (js/hidra.js) é o .glb com esqueleto, animado por código: o cérebro diz a POSE de cada quadro
 * (`pose`: cada cabeça empinada ou curvada, cada pé erguido, o giro das cabeças, o agachar), e a pose
 * vai também no retrato da rede (`poseEmNumeros`): quem não simula anima com ela.
 *
 * Os EVENTOS deste comportamento (o corpo desenha): 'pisou' { pos } (o pé bateu no chão),
 * 'ergueu' { perna } (o pé começa a subir), 'cuspiu' { cabeca, pos } (um orbe saiu),
 * 'tremeu' { forca } (o golpe pegou), 'furia', 'morreu'.
 */
import * as THREE from 'three';
import { yawTo, turnTowards, flatDist } from '../geometria.js';
import { Inimigo } from './cerebro.js';

/** Quantas cabeças e pés a pose leva (a ficha pode ter menos: o resto fica parado). */
const CABECAS = 5, PES = 4;
const poseParada = () => ({ cab: new Array(CABECAS).fill(0), pe: new Array(PES).fill(0), giro: 0, agacha: 0 });
const suave = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };

export class Hidra extends Inimigo {
  renascer() {
    this.pos.y = this.mundo.world.alturaChao(this.pos);
    this.cooldown = this.cfg.chefe?.pausa ?? 1.5;
    this.tombo = 0;
    this.furia = false;
    this.pose = poseParada();
    return {};
  }

  /** Enraizada: o empurrão dos corpos (`Game.separate`) não a tira do lugar. */
  get imovel() { return true; }
  get lockable() { return this.active && !this.dead && !['dormant', 'gone'].includes(this.state) && super.lockable; }
  get invulnerable() { return this.state === 'morrendo' || super.invulnerable; }
  get estadoDeMorto() { return 'morrendo'; }
  /** Mira quem a zona deixa (traço `zona`: quem está no lugar da luta); sem o traço, qualquer um. */
  podeMirar(j) { return this.traco('podeMirar', j) ?? true; }

  // ---------- Dano ----------
  receberGolpe(amount, srcPos, poise, opts = {}) {
    if (!this.active || this.dead || this.invulnerable) return null;
    // FUNGO: o fogo entra mais (a ficha: `fireWeak`)
    this.applyDamage(amount * (opts.fire ? (this.cfg.fireWeak ?? 1) : 1));
    this.flashT = 0.12;
    if (this.hp <= 0) { this.die(); return 'hit'; }
    const f = this.cfg.furia;
    if (f && !this.furia && this.hp <= this.maxHp * f.vida) { this.furia = true; this.emitir('furia'); }
    return 'hit';
  }

  // ---------- O quadro ----------
  /** A pose de partida do quadro (dormindo: as cabeças caídas e o corpo baixo) e o alvo. */
  preparar(dt) {
    this.escolherAlvo(dt);
    const a = this.pose;
    const dormindo = this.state === 'dormant';
    a.cab.fill(dormindo ? -0.8 : 0); a.pe.fill(0); a.giro = 0; a.agacha = dormindo ? 0.6 : 0;
  }

  decidir(dt) {
    const p = this.alvo, c = this.cfg, g = c.golpes, a = this.pose, t = this.stateT;
    const d = flatDist(this.pos, p.pos);
    // as cabeças acompanham o alvo (o corpo gira devagar; elas, mais depressa)
    const ang = Math.atan2(Math.sin(yawTo(this.pos, p.pos) - this.facing), Math.cos(yawTo(this.pos, p.pos) - this.facing));
    a.giro = THREE.MathUtils.clamp(ang, -0.6, 0.6);

    switch (this.state) {
      case 'intro': {   // (o rugido e o fim da entrada: o traço `chefe`) — levanta do chão, empina as cabeças no rugido e as baixa
        const T = c.chefe?.intro ?? 3, R = c.chefe?.rugido ?? 1;
        a.agacha = 0.6 * (1 - suave(t / R));
        a.cab.fill(t < R ? -0.8 + 1.8 * suave(t / R) : 1 - suave((t - R - 0.8) / Math.max(0.1, T - R - 0.8)));
        break;
      }

      case 'chase': {   // de olho: gira no lugar e escolhe o golpe
        this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * c.giro);
        this.cooldown -= dt * (this.furia ? (c.furia?.ritmo ?? 1) : 1);
        if (this.cooldown <= 0 && !p.dead) this.escolherAtaque(d);
        break;
      }

      case 'pisao': {
        // ergue o pé mais perto do alvo (0 – sobe), bate (sobe → sobe + 0,15), volta
        const gp = g.pisao, sobe = gp.sobe, k = this.st.perna;
        if (t < sobe) {
          a.pe[k] = suave(t / sobe);
          a.agacha = -0.15 * a.pe[k];   // o corpo pende para o outro lado
          if (!this.st.ergueu) { this.st.ergueu = true; this.emitir('ergueu', { perna: k }); }
        } else if (t < sobe + 0.15) a.pe[k] = 1 - (t - sobe) / 0.15;
        else if (!this.st.bateu) {
          this.st.bateu = true;
          const centro = this.pe(k);
          centro.y = this.mundo.world.alturaChao(centro);
          if (!p.dead && flatDist(p.pos, centro) < gp.raio + (p.radius ?? 0.5)) {
            const res = p.takeDamage(gp.dano, centro, { poise: gp.poise });
            if (res !== 'iframe') this.emitir('tremeu', { forca: gp.tremor });
          }
          this.mundo.projectiles.shock({ pos: centro, maxR: gp.onda.raio, speed: gp.onda.velocidade, damage: gp.onda.dano, poise: gp.onda.poise });
          this.emitir('pisou', { pos: centro });
        } else a.agacha = 0.1 * Math.max(0, 1 - (t - sobe - 0.15) / 0.4);   // o tranco do peso
        if (t > sobe + 0.15 + gp.depois) this.fimDeAtaque();
        break;
      }

      case 'cuspe': {
        // cada cabeça da vez: empina (a boca, que fica por baixo do chapéu, aponta para o alvo),
        // cospe e volta. Começam escalonadas por `intervalo`.
        const gc = g.cuspe, ordem = this.st.ordem;
        let acabou = true;
        ordem.forEach((k, i) => {
          const t0 = i * gc.intervalo, tc = t0 + gc.mira;   // a hora do cuspe desta cabeça
          if (t < t0) { acabou = false; return; }
          if (t < tc) { a.cab[k] = suave((t - t0) / gc.mira); acabou = false; }
          else if (t < tc + 0.5) { a.cab[k] = 1 - 1.4 * suave((t - tc) / 0.18) + 0.4 * suave((t - tc - 0.18) / 0.32); acabou = false; }
          if (t >= tc && !this.st.cuspiu.has(k)) { this.st.cuspiu.add(k); this.cuspir(k, p); }
        });
        // (o corpo segue girando para quem foge)
        this.facing = turnTowards(this.facing, yawTo(this.pos, p.pos), dt * c.giro * 0.5);
        if (acabou && t > 0.2) this.fimDeAtaque();
        break;
      }
    }
  }

  /** Um orbe de veneno da boca `k` no alvo (o orbe é regra: voa, persegue um pouco e fere quem pega). */
  cuspir(k, p) {
    const gc = this.cfg.golpes.cuspe, boca = this.boca(k);
    const mira = p.pos.clone(); mira.y += 1;
    const dir = mira.sub(boca);
    if (dir.lengthSq() < 1e-6) return;
    this.mundo.projectiles.orb({ pos: boca, dir: dir.normalize(), speed: gc.velocidade, damage: gc.dano, homing: gc.guia, color: gc.cor, size: gc.tamanho, life: gc.vida });
    this.emitir('cuspiu', { cabeca: k, pos: boca });
  }

  escolherAtaque(d) {
    const c = this.cfg, g = c.golpes;
    if (d < c.perto && (d < c.perto * 0.6 || Math.random() < 0.75)) {
      // o pé mais perto de onde o alvo está
      let perna = 0, menor = Infinity;
      (c.pes ?? []).forEach((_, k) => { const dd = flatDist(this.pe(k), this.alvo.pos); if (dd < menor) { menor = dd; perna = k; } });
      return this.setState('pisao', { perna });
    }
    // quantas cabeças cospem (na fúria, mais), em ordem sorteada
    const n = Math.min(c.bocas.length, g.cuspe.cabecas + (this.furia ? (c.furia?.cabecas ?? 0) : 0));
    const ordem = [...c.bocas.keys()].sort(() => Math.random() - 0.5).slice(0, n);
    this.setState('cuspe', { ordem, cuspiu: new Set() });
  }

  fimDeAtaque() {
    this.setState('chase');
    const [p0, p1] = this.cfg.pausa, f = this.furia ? (this.cfg.furia?.pausa ?? 1) : 1;
    this.cooldown = (p0 + Math.random() * (p1 - p0)) * f;
  }

  /** Enraizada: volta sempre para casa (nem o golpe nem o empurrão a movem), e o agachar baixa o corpo. */
  pisar() {
    this.pos.x = this.home.x; this.pos.z = this.home.z;
    this.pos.y = this.mundo.world.alturaChao(this.pos) - this.pose.agacha * 1.2;
    this.ultimaAnim = this.pose;   // vai no `TIPO.MUNDO`: quem não simula anima com ela
  }

  /** Morrendo: as cabeças caem, tomba um pouco e afunda na terra; em 7 s sai de cena. */
  updateDeath(dt) {
    if (this.traco('morrendo', dt)) return;
    const t = this.stateT, k = suave(t / 2.2), a = this.pose;
    this.tombo = k * 0.25;
    a.cab.fill(-1 * k); a.pe.fill(0); a.giro = 0;
    a.agacha = 0.6 * k + (t > 3 ? (t - 3) * 1.5 : 0);
    if (t > 7) { this.active = false; this.visivel = false; this.setState('gone'); }
    this.pisar();
  }

  // ---------- Onde ficam as partes (sem o modelo: a tabela da ficha, girada pelo rumo) ----------
  /** O ponto `[x, y, z]` do corpo (m, olhando para +Z) no mundo. */
  noMundo([x, y, z]) {
    const c = Math.cos(this.facing), s = Math.sin(this.facing);
    return new THREE.Vector3(this.pos.x + x * c + z * s, this.pos.y + y, this.pos.z - x * s + z * c);
  }
  /** A boca da cabeça `k` (de onde sai o cuspe). */
  boca(k) { return this.noMundo(this.cfg.bocas[k]); }
  /** O pé `k` (no chão; de onde sai o pisão). */
  pe(k) { const [x, z] = this.cfg.pes[k]; return this.noMundo([x, 0, z]); }

  // ---------- A pose na rede ----------
  /** A pose em números (o `extra.anim` do retrato): as cabeças, os pés, o giro e o agachar. */
  poseEmNumeros() { const a = this.pose; return [...a.cab, ...a.pe, a.giro, a.agacha]; }
  /** O contrário (quem anima pelo retrato). Números a menos ou tortos: a pose parada. */
  static poseDeNumeros(n) {
    const a = poseParada();
    if (!Array.isArray(n) || n.length !== CABECAS + PES + 2) return a;
    a.cab = n.slice(0, CABECAS); a.pe = n.slice(CABECAS, CABECAS + PES);
    a.giro = n[CABECAS + PES]; a.agacha = n[CABECAS + PES + 1];
    return a;
  }

  /** Assumida do retrato no meio da luta: a fúria segue a vida. */
  retomar(r) {
    super.retomar(r);
    const f = this.cfg.furia;
    this.furia = !!(f && !this.defeated && this.hp <= this.maxHp * f.vida);
  }
}

export const POSE_DA_HIDRA_PARADA = poseParada;
