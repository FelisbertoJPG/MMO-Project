/**
 * OS TRAÇOS (24/11/2026): o que um inimigo PODE ter além do comum, ligado pela FICHA. A chave do
 * traço na ficha (`tipos.js`) é a configuração dele; sem a chave, o inimigo não o tem. Um chefe
 * novo, um esqueleto de elite com duas fases ou um necromante que invoca são uma ficha nova, sem
 * classe nova. O Carrasco é só uma ficha com `chefe`, `arena`, `fases`, `perseguir`, `firme`,
 * `invocar` e `morte`.
 *
 * Cada traço responde a GANCHOS que o cérebro chama (cerebro.js: `traco(gancho, …)`), sempre com
 * `(inimigo, configuração do traço, …)`. Os que decidem devolvem um valor (o primeiro traço que
 * devolve algo diferente de `undefined` vence); os outros só agem:
 *   iniciar, nascer            no constructor: antes do primeiro `reset` e depois dele
 *   aoReset                    ao voltar de pé
 *   invulneravel → true        não leva dano agora          travavel → false   não dá para travar a mira
 *   naArena → true             fica na zona do chefe        podeMirar(j), podeLutar → bool
 *   pensar(dt) → true          cuidou do estado atual (a IA comum não roda)
 *   aoSofrer(res)              depois de um golpe que pegou ('hit' ou 'blocked')
 *   cambalear(de, dur) → false (não cambaleia) ou a duração;  depoisDeCambalear
 *   antesDeMorrer              conjurar(golpe) → true  cuidou do feitiço
 *   depois(dt)                 no fim de cada quadro        morrendo(dt) → true  cuidou da morte
 *   retomar(r) → true          assumiu o retrato             dormir, acordar   (o `sleep`/`wake` do chefe)
 * O que se VÊ de cada traço (olhos, rugido, explosão) sai em evento: o corpo (enemies.js) desenha.
 */
import * as THREE from 'three';
import { ENEMY_TYPES } from './tipos.js';
import { yawTo, turnTowards, flatDist } from '../geometria.js';

export const TRACOS = {
  /**
   * CHEFE: `{ intro, rugido }` (s). Dorme até o jogo o acordar (`wake`, ao entrar na arena), acorda
   * rugindo, e vencido fica fora (`gone`) até `sleep` (no Mundo online, o relógio do chefe).
   * `defeated` vai no save (save.js) e na rede.
   */
  chefe: {
    iniciar(e) { e.isBoss = true; e.defeated = false; },
    nascer(e) { e.sleep(); },
    invulneravel(e) { return ['dormant', 'intro', 'gone'].includes(e.state) || undefined; },
    travavel(e) { return e.state === 'gone' ? false : undefined; },
    dormir(e) {
      e.cfg = e.cfgBase;   // (a fase muda a ficha: volta a de antes)
      e.reset();
      e.phase = 1; e.speedMul = 1;
      e.active = !e.defeated; e.visivel = !e.defeated;
      e.setState(e.defeated ? 'gone' : 'dormant');
      e.posarDormindo();
      e.emitir('adormeceu');
      return true;
    },
    acordar(e) {
      if (e.state !== 'dormant') return true;
      e.setState('intro');
      e.tocar(e.idleAnim, { fade: 1.2 });
      return true;
    },
    pensar(e, c) {
      if (e.state === 'dormant' || e.state === 'gone') return true;
      if (e.state !== 'intro') return undefined;
      if (e.stateT > c.rugido && !e.st.roared) {
        e.st.roared = true;
        e.emitir('rugiu', { tremor: 0.6 });
        e.emitir('olhosAcesos');
      }
      if (e.stateT > c.intro) { e.setState('chase'); e.cooldown = 0.6; }
      return true;
    },
    antesDeMorrer(e) { e.defeated = true; },
    /** Assumir no meio do caminho: dormindo, vencido ou sem retrato, `sleep` resolve; em luta, segue dela na fase certa. */
    retomar(e, c, r) {
      e.sleep();
      if (e.defeated || !r || r.morto || !r.ativo || r.st === 'dormant' || r.st === 'gone') return true;
      e.pos.set(r.x, 0, r.z);
      e.pos.y = e.mundo.world.alturaChao(e.pos);
      e.facing = r.g;
      e.hp = Math.min(e.maxHp, Math.max(1, r.hp));
      e.emitir('olhosAcesos');
      (e.cfg.fases ?? []).forEach((f, i) => { if (e.hp <= e.maxHp * f.vida) e.entrarNaFase(i + 2); });
      e.setState('chase');
      e.cooldown = 1.2;
      e.tocar(e.idleAnim, { fade: 0 });
      return true;
    },
  },

  /** ARENA (`true`): só luta com quem está dentro da arena, e fica na zona dela. */
  arena: {
    naArena() { return true; },
    podeMirar(e, c, j) { return j.inArena; },
    podeLutar(e) { return !e.alvo.dead && e.alvo.inArena; },
  },

  /** LACAIO (`true`, quem foi invocado): luta com qualquer um vivo, dentro da arena do chefe. */
  lacaio: {
    naArena() { return true; },
    podeLutar(e) { return !e.alvo.dead; },
  },

  /**
   * FASES: a lista, da 2ª em diante — `{ vida (fração), explode, dura (s), velocidade, giro, pausa,
   * explosao: { raio, dano, poise } }`. Passando de `vida`, ele recua (invulnerável), explode em
   * volta (quem estiver no raio leva o dano, sem defesa) e volta mais rápido e agressivo.
   */
  fases: {
    invulneravel(e) { return e.state === 'phase' || undefined; },
    aoSofrer(e, fases) {
      if (e.dead) return;
      const n = (e.phase ?? 1) + 1, f = fases[n - 2];
      if (!f || e.hp > e.maxHp * f.vida) return;
      e.phase = n;
      e.pos.y = e.mundo.world.alturaChao(e.pos);
      e.setState('phase', { fase: n });
      e.tocar('Hit_Knockback', { loop: false, restart: true, duration: 1.2 });
    },
    pensar(e, fases) {
      if (e.state !== 'phase') return undefined;
      const f = fases[e.st.fase - 2];
      if (e.stateT > f.explode && !e.st.burst) {
        e.st.burst = true;
        e.emitir('rugiu', { tremor: 0.8 });
        e.emitir('explodiu', { pos: e.pos.clone(), raio: f.explosao.raio });
        const p = e.alvo;
        if (flatDist(p.pos, e.pos) < f.explosao.raio) p.takeDamage(f.explosao.dano, e.pos, { poise: f.explosao.poise, unblockable: true });
        e.entrarNaFase(e.st.fase);
      }
      if (e.stateT > f.dura) { e.setState('chase'); e.cooldown = 0.2; }
      return true;
    },
  },

  /**
   * PERSEGUIR DIRETO: `{ perto, correDe, corrida, andar: [anim, ref], correr: [anim, ref] }`. Anda
   * reto até o alvo, sem rodear nem procurar caminho (quem rodeia são os esqueletos), e corre de
   * longe. `ref` = a velocidade (m/s, × a escala da ficha) em que a animação anda no próprio passo.
   */
  perseguir: {
    pensar(e, c, dt) {
      if (e.state !== 'chase') return undefined;
      const p = e.alvo;
      if (!e.canEngage()) { e.tocar(e.idleAnim, { fade: 0.3 }); return true; }
      const d = flatDist(p.pos, e.pos);
      e.cooldown -= dt;
      e.facing = turnTowards(e.facing, yawTo(e.pos, p.pos), dt * e.cfg.turnRate);
      if (e.cooldown <= 0) {
        const atk = e.pickAttack(d);
        if (atk) { e.startAttack(atk); return true; }
      }
      if (d > c.perto) {
        const corre = d > c.correDe;
        const s = e.cfg.speed * e.speedMul * (corre ? c.corrida : 1);
        e.pos.x += Math.sin(e.facing) * s * dt;
        e.pos.z += Math.cos(e.facing) * s * dt;
        const [anim, ref] = corre ? c.correr : c.andar;
        e.tocar(anim, { speed: s / (ref * e.cfg.scale) });
      } else e.tocar(e.idleAnim, { fade: 0.2 });
      return true;
    },
  },

  /** FIRME: `{ cambalear (s), recuo (fração do tranco) }`. Cambaleia sempre o mesmo, recua menos e não cai do salto. */
  firme: {
    cambalear(e, c) {
      if (e.state === 'attack' && e.st.atk?.leap) return false;
      e.pos.y = e.mundo.world.alturaChao(e.pos);
      return c.cambalear;
    },
    depoisDeCambalear(e, c) { e.knock.multiplyScalar(c.recuo); },
  },

  /**
   * INVOCAR: `{ tipo, quantos, max, vida, raio }`. O feitiço `cast: 'summon'` levanta `quantos`
   * lacaios do chão a `raio` m do alvo (até `max` vivos). Eles somem quando ele volta de pé e
   * morrem com ele. Quem cria e tira do mundo é o mundo (`mundo.invocar`/`mundo.dispensar`).
   */
  invocar: {
    iniciar(e) { e.minions = []; },
    aoReset(e) { for (const m of e.minions) e.mundo.dispensar(m); e.minions = []; },
    antesDeMorrer(e) { for (const m of e.minions) if (!m.dead) m.die(); },
    conjurar(e, c, a) {
      if (a.cast !== 'summon') return undefined;
      if (e.minions.filter((m) => !m.dead).length >= c.max) return true;
      e.emitir('rugiu', { tremor: 0 });
      for (let i = 0; i < c.quantos; i++) {
        const ang = Math.random() * Math.PI * 2;
        const p = e.alvo.pos.clone().add(new THREE.Vector3(Math.cos(ang) * c.raio, 0, Math.sin(ang) * c.raio));
        e.mundo.world.resolve(p, 0.6);
        const m = e.mundo.invocar({ ...ENEMY_TYPES[c.tipo], souls: 0, drops: [], hp: c.vida, lacaio: true }, p, yawTo(p, e.alvo.pos), { dormant: true });
        m.awaken();
        e.emitir('invocou', { pos: p });
        e.minions.push(m);
      }
      return true;
    },
    depois(e) {
      e.minions = e.minions.filter((m) => { if (m.active) return true; e.mundo.dispensar(m); return false; });
    },
  },

  /** MORTE: `{ estilo: 'encolher', espera, dura }` (s). Em vez de afundar, some encolhendo (o corpo desenha). */
  morte: {
    morrendo(e, c) {
      if (c.estilo !== 'encolher') return undefined;
      if (e.stateT > c.espera) {
        const k = Math.min(1, (e.stateT - c.espera) / c.dura);
        if (k >= 1 && e.active) { e.active = false; e.visivel = false; e.setState('gone'); e.dead = true; }
      }
      return true;
    },
  },
};
