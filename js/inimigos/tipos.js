/**
 * OS TIPOS DE INIMIGO (os esqueletos da masmorra): a FICHA de cada um, só dados. O cérebro
 * (cerebro.js) a lê para decidir; o corpo (enemies.js) para vestir e animar. Mora aqui, fora do
 * enemies.js, para o servidor do Mundo online ler sem carregar o desenho.
 *
 * Cada golpe (`attacks`): `anim` = a linha de `ATTACKS` (js/ataques.js); `dmg`/`poise` = o dano e o
 * tranco; `reach` = o alcance do acerto, `range` = de que distância ele escolhe esse golpe; `lunge` =
 * o avanço; `next`/`nextChance` = o golpe que pode emendar (`follow` = só emendado); `cast` = feitiço.
 */
export const ENEMY_TYPES = {
  minion: {
    name: 'Esqueleto Desperto', outfit: 'skMinion', skeleton: true, hp: 70, souls: 50, speed: 2.2,
    runAnim: 'Zombie_Walk_Fwd_Loop', runRef: 1.1, idleAnim: 'Zombie_Idle_Loop',
    radius: 0.4, height: 1.8, scale: 1, poise: 15, aggro: 11, cooldown: [0.9, 2.0], turnRate: 4.5,
    right: 'rustySword', fireWeak: 1.3,
    attacks: [
      { anim: 'scratch', dmg: 22, poise: 30, reach: 1.6, range: 1.8, lunge: 1.5, speed: 0.9 },
      { anim: 'slashA', dmg: 20, poise: 25, reach: 1.9, range: 2.0, lunge: 2.0, speed: 0.55, next: 'm2', nextChance: 0.4 },
      { id: 'm2', anim: 'slashB', dmg: 18, poise: 25, reach: 1.9, range: 0, follow: true, lunge: 1.8, speed: 0.55 },
    ],
    drops: [['firebomb', 0.12], ['lostSoul', 0.15], ['cogumelo', 0.25]],
  },
  warrior: {
    name: 'Guerreiro Esqueleto', outfit: 'skWarrior', skeleton: true, hp: 150, souls: 150, speed: 2.6,
    runAnim: 'Jog_Fwd_Loop', runRef: 3.9, idleAnim: 'Sword_Idle',
    radius: 0.45, height: 1.9, scale: 1.05, poise: 45, aggro: 12, cooldown: [1.0, 2.2], turnRate: 3.6,
    right: 'rustyAxe', left: 'rustyRound', blockChance: 0.55, fireWeak: 1.3,
    attacks: [
      { anim: 'slashC', dmg: 30, poise: 40, reach: 2.0, range: 2.2, lunge: 2.0, speed: 0.8, next: 'w2', nextChance: 0.45 },
      { id: 'w2', anim: 'overhead', dmg: 36, poise: 55, reach: 2.1, range: 0, follow: true, lunge: 1.8, speed: 0.75 },
      { anim: 'dash', dmg: 38, poise: 60, reach: 2.0, range: 6, minRange: 3.2, lunge: 6.5, speed: 0.75, trackMul: 1.4 },
    ],
    // a MALHA do Sentinela (rara; a primeira que sair é a que cai — ver onEnemyKilled)
    drops: [['arm2_peito', 0.05], ['arm2_bracos', 0.06], ['arm2_pernas', 0.06], ['resin', 0.4], ['lostSoul', 0.3], ['carneCrua', 0.35]],
  },
  rogue: {
    name: 'Ladino Esqueleto', outfit: 'skRogue', skeleton: true, hp: 85, souls: 110, speed: 3.6,
    runAnim: 'Jog_Fwd_Loop', runRef: 3.9, idleAnim: 'Sword_Idle',
    radius: 0.4, height: 1.85, scale: 1, poise: 12, aggro: 13, cooldown: [0.5, 1.4], turnRate: 6, dodgeChance: 0.35,
    right: 'dagger', fireWeak: 1.3,
    attacks: [
      { anim: 'slashA', dmg: 18, poise: 20, reach: 1.6, range: 1.8, lunge: 3.2, speed: 0.7, next: 'r2', nextChance: 0.5 },
      { id: 'r2', anim: 'hook', dmg: 16, poise: 20, reach: 1.6, range: 0, follow: true, lunge: 2.5, speed: 0.6 },
    ],
    drops: [['blossom', 0.35], ['pimenta', 0.4]],
  },
  mage: {
    name: 'Necromante Esqueleto', outfit: 'skMage', skeleton: true, hp: 60, souls: 120, speed: 2.2,
    runAnim: 'Walk_Loop', runRef: 1.5, idleAnim: 'Spell_Simple_Idle_Loop',
    radius: 0.4, height: 1.9, scale: 1, poise: 8, aggro: 16, cooldown: [1.8, 3.0], turnRate: 5, ranged: true,
    right: 'staff', fireWeak: 1.3,
    attacks: [
      { anim: 'summon', cast: 'orb', dmg: 28, range: 15, minRange: 2.5, speed: 1.0 },
      { anim: 'slashA', dmg: 16, poise: 20, reach: 1.8, range: 1.9, lunge: 1.5, speed: 0.6 },
    ],
    drops: [['firebomb', 0.35], ['erva', 0.45]],
  },
};

/**
 * O REFORÇO DOS ESQUELETOS (05/10/2026): com a ficha nova (ficha.js) eles ficaram fracos
 * demais. O ajuste fica AQUI, por cima da tabela, para ser mexido num lugar só: vida,
 * dano dos golpes, equilíbrio (quanto aguenta sem cambalear), a pausa entre ataques
 * (menor = mais agressivo) e as almas (um pouco mais, que agora dão mais trabalho).
 */
export const REFORCO_ESQUELETOS = { vida: 1.6, dano: 1.2, equilibrio: 1.5, pausa: 0.85, almas: 1.3 };
for (const t of Object.values(ENEMY_TYPES)) {
  if (!t.skeleton) continue;
  const R = REFORCO_ESQUELETOS;
  t.hp = Math.round(t.hp * R.vida);
  t.poise = Math.round(t.poise * R.equilibrio);
  t.souls = Math.round(t.souls * R.almas);
  t.cooldown = t.cooldown.map((c) => Math.round(c * R.pausa * 100) / 100);
  for (const a of t.attacks) a.dmg = Math.round(a.dmg * R.dano);
}
