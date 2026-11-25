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
 * OS CHEFES: fichas como as de cima, com TRAÇOS (tracos.js) — cada chave abaixo de `drops` liga um.
 * Chefe novo = uma ficha nova aqui (e o lugar dele em `CHEFES`, nascimentos.js).
 */
const ESCALA_DO_CARRASCO = 1.55;
ENEMY_TYPES.carrasco = {
  name: 'O Carrasco da Masmorra', outfit: 'executioner', skinTint: 0x4e4038, hp: 1500, souls: 5000, speed: 2.9,
  runAnim: 'Jog_Fwd_Loop', runRef: 3.9 * ESCALA_DO_CARRASCO, idleAnim: 'Sword_Idle',
  radius: 0.75, height: 1.85 * ESCALA_DO_CARRASCO, scale: ESCALA_DO_CARRASCO, poise: 170, aggro: 999, cooldown: [0.8, 1.7], turnRate: 2.4,
  right: 'greataxe',
  attacks: [
    { anim: 'heavy1', dmg: 50, poise: 70, reach: 3.4, range: 3.4, lunge: 2.5, speed: 0.7, next: 'b2', nextChance: 0.6, weight: 1.3 },
    { id: 'b2', anim: 'heavy2', dmg: 46, poise: 70, reach: 3.4, range: 0, follow: true, lunge: 2.0, speed: 0.7, next: 'b3', nextChance: 0.45 },
    { id: 'b3', anim: 'heavy3', dmg: 52, poise: 80, reach: 3.4, range: 0, follow: true, lunge: 2.0, speed: 0.7 },
    { anim: 'overhead', dmg: 74, poise: 110, reach: 3.6, range: 3.8, lunge: 2.0, speed: 0.6, shock: { radius: 3.0, speed: 10 } },
    { anim: 'dash', dmg: 56, poise: 90, reach: 3.2, range: 11, minRange: 5, lunge: 12, dash: true, speed: 0.55, trackMul: 1.3 },
    { anim: 'heavy4', dmg: 46, poise: 80, reach: 3.6, range: 3.0, speed: 0.8, arc: 2.2, weight: 0.8 },
    // Fase 2
    { anim: 'leap', dmg: 72, poise: 120, reach: 3.2, range: 17, minRange: 6.5, leap: true, speed: 0.75, arc: 3.2, phase: 2, shock: { radius: 7, speed: 12 }, weight: 1.2, gap: 5, after: 'NinjaJump_Land', recover: 0.9 },
    { anim: 'summon', cast: 'summon', range: 40, phase: 2, gap: 22, weight: 2, speed: 0.9 },
  ],
  drops: [],
  animDormindo: 'Crouch_Idle_Loop',   // ajoelhado junto ao cepo, esperando o próximo condenado
  chefe: { intro: 2.6, rugido: 1.2 },
  arena: true,
  fases: [{ vida: 0.5, explode: 0.9, dura: 2.4, velocidade: 1.2, giro: 3.1, pausa: [0.5, 1.2], explosao: { raio: 7, dano: 30, poise: 100 } }],
  perseguir: { perto: 3.0, correDe: 12, corrida: 1.35, andar: ['Walk_Loop', 1.5], correr: ['Jog_Fwd_Loop', 3.9] },
  firme: { cambalear: 1.3, recuo: 0.3 },
  invocar: { tipo: 'minion', quantos: 2, max: 3, vida: 80, raio: 4.5 },
  morte: { estilo: 'encolher', espera: 3.5, dura: 1.5 },
  corpo: { olhos: 'brasa', pulsoNaFase: true },
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
