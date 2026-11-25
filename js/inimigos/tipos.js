/**
 * AS FICHAS DE TODAS AS CRIATURAS (os esqueletos, os bichos e os chefes), só dados. O cérebro
 * (cerebro.js e o comportamento da ficha: `comportamento`, o padrão é `humanoide`) a lê para decidir;
 * o corpo (enemies.js, animais.js) para vestir e animar. Mora aqui para o servidor do Mundo online
 * ler sem carregar o desenho. As chaves de TRAÇO (tracos.js) ligam o que vai além do comum.
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
 * OS BICHOS (03/10/2026; o comportamento `quadrupede`, quadrupede.js): modelos do pacote Ultimate
 * Animated Animals (Quaternius), em `assets/animais/<modelo>.glb`. `escala` deixa o bicho do tamanho
 * certo ao lado do jogador (1,85 m); `andar`/`correr` em m/s; `medo` (pacífico: foge de quem chega a
 * tantos m), `raiva` (neutro: s de revide), `faro` (agressivo: m em que caça); `ataques` = { clipe,
 * dano, poise, alcance, janela [frações do clipe], atras (o coice) }; `espera` = a pausa entre golpes.
 * Bicho novo = uma ficha aqui, o modelo em ANIMAIS_MODELOS (assets.js) e `medir-clipes.mjs` de novo.
 */
// (o fogo do golpe entra × 1,25; não pega fogo nem sangra depois)
const BICHO = { comportamento: 'quadrupede', fireWeak: 1.25, queima: false, sangra: false };
Object.assign(ENEMY_TYPES, {
  cervo: { ...BICHO, name: 'Cervo', modelo: 'cervo', escala: 0.36, temperamento: 'pacifico',
    hp: 60, souls: 40, drops: [['carneCrua', 0.8]], andar: 1.3, correr: 7.5, radius: 0.5, height: 1.5, medo: 10 },
  raposa: { ...BICHO, name: 'Raposa', modelo: 'raposa', escala: 0.2, temperamento: 'pacifico',
    hp: 30, souls: 20, drops: [['carneCrua', 0.35], ['erva', 0.2]], andar: 1.2, correr: 6.8, radius: 0.3, height: 0.6, medo: 8 },
  cavalo: { ...BICHO, name: 'Cavalo Selvagem', modelo: 'cavalo', escala: 0.42, temperamento: 'pacifico',
    hp: 140, souls: 70, drops: [['carneCrua', 0.6]], andar: 1.6, correr: 9, radius: 0.7, height: 2.0, medo: 11 },
  cervoReal: { ...BICHO, name: 'Cervo Real', modelo: 'cervoReal', escala: 0.45, temperamento: 'neutro',
    hp: 150, souls: 120, drops: [['carneCrua', 1]], andar: 1.3, correr: 7, radius: 0.6, height: 1.9, raiva: 20,
    ataques: [
      { clipe: 'Attack_Headbutt', dano: 30, poise: 55, alcance: 2.1, janela: [0.35, 0.6] },
      { clipe: 'Attack_Kick', dano: 24, poise: 40, alcance: 1.9, janela: [0.3, 0.55], atras: true },
    ],
    espera: [1.0, 2.2] },
  touro: { ...BICHO, name: 'Touro Selvagem', modelo: 'touro', escala: 0.4, temperamento: 'neutro',
    hp: 240, souls: 180, drops: [['carneCrua', 1]], andar: 1.2, correr: 7.8, radius: 0.85, height: 1.8, raiva: 25,
    ataques: [
      { clipe: 'Attack_Headbutt', dano: 46, poise: 85, alcance: 2.4, janela: [0.35, 0.6] },
      { clipe: 'Attack_Kick', dano: 32, poise: 50, alcance: 2.1, janela: [0.3, 0.55], atras: true },
    ],
    espera: [1.2, 2.6] },
  lobo: { ...BICHO, name: 'Lobo', modelo: 'lobo', escala: 0.4, temperamento: 'agressivo',
    hp: 85, souls: 80, drops: [['carneCrua', 0.5]], andar: 1.4, correr: 7.2, radius: 0.45, height: 1.0, faro: 14,
    ataques: [{ clipe: 'Attack', dano: 20, poise: 25, alcance: 1.7, janela: [0.3, 0.55] }],
    espera: [0.7, 1.7] },
});

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
 * O WYRM DAS CINZAS (o chefe secreto do terraço; o comportamento `dragao`, inimigos/dragao.js): o corpo é o MODELO DE
 * BLOCOS `assets/modelos/dragao.json` (montado no Editor de modelo), na escala `escala`. Mora no andar de cima (o traço
 * `territorio`: o ninho é a célula mais longe da escada) e acorda quando alguém pisa lá. `velocidade` (m/s) e `giro`
 * (rad/s) da perseguição, `perto` = onde para de andar; `golpes` = os números de cada golpe (o ritmo de cada um é a
 * coreografia do dragao.js); `pausa` = entre um golpe e outro.
 */
ENEMY_TYPES.wyrm = {
  comportamento: 'dragao', name: 'Wyrm das Cinzas', modelo: 'dragao', escala: 1.4,
  hp: 2400, souls: 8000, drops: [], radius: 2.3, height: 4.2,
  fireWeak: 0.35, queima: false, sangra: false,   // ESCAMA DE DRAGÃO: o fogo quase não entra
  velocidade: 3.3, giro: 1.5, perto: 4.2, pausa: [1.1, 2.3],
  golpes: {
    mordida: { dano: 58, poise: 90, alcance: 6.2, angulo: 0.7, tremor: 0.3 },
    cauda: { dano: 46, poise: 110, alcance: 7.8, tremor: 0.35 },
    sopro: { dano: 13, poise: 12, alcance: 14, angulo: 0.38, intervalo: 0.3 },
    salto: { dano: 55, poise: 90, raio: 8, velocidade: 11 },
  },
  chefe: { intro: 2.6, rugido: 1.0, tremor: 0.5, pausa: 1.5 },
  territorio: { nivel: 1 },
};

/**
 * A MYCOHYDRA (25/11/2026; o chefe das WindHills, nas ruínas do platô): uma hidra-cogumelo de 14 m e cinco
 * cabeças, ENRAIZADA (o comportamento `hidra`, inimigos/hidra.js). O corpo é um .glb com esqueleto
 * (`modelo`: assets/chefes/<modelo>.glb, feito do modelo do Meshy por ferramentas/chefe-de-arquivo/rigar.mjs).
 * De perto PISOTEIA (`perto`: até onde o pisão alcança, do centro), de longe CUSPE veneno. `giro` (rad/s):
 * como ela vira no lugar; `pausa` = entre um golpe e outro. O cilindro do dano (`radius` × `height`) cobre as
 * pernas e vai até as cabeças: a espada pega embaixo, o arremesso pega em cima, o dano é o mesmo.
 * `bocas` e `pes` = o que veio do MODELO (m, olhando para +Z): as juntas das cabeças (um pouco à frente e abaixo,
 * onde fica a boca, por baixo do chapéu) e dos pés, impressas pelo rigar.mjs. Mudou a junta lá? Copie para cá.
 * `furia`: abaixo de `vida` (fração), cospem `cabecas` a mais, a pausa vezes `pausa` e o relógio do golpe vezes `ritmo`.
 * FUNGO: o fogo entra mais (`fireWeak`) e ele queima.
 */
ENEMY_TYPES.mycohydra = {
  comportamento: 'hidra', name: 'Mycohydra', modelo: 'mycohydra',
  hp: 3000, souls: 9000, drops: [], radius: 5, height: 14,
  fireWeak: 1.5, sangra: false,
  giro: 0.4, perto: 10, pausa: [1.3, 2.6],
  golpes: {
    pisao: { dano: 60, poise: 110, raio: 3.5, sobe: 0.95, depois: 0.8, tremor: 0.55,
      onda: { raio: 11, velocidade: 12, dano: 28, poise: 60 } },
    cuspe: { dano: 26, velocidade: 15, guia: 0.7, vida: 5, cor: 0x86d44a, tamanho: 1.4,
      cabecas: 3, intervalo: 0.35, mira: 0.55 },
  },
  furia: { vida: 0.5, cabecas: 2, pausa: 0.7, ritmo: 1.2 },
  bocas: [[0.03, 11.94, 1.11], [4.7, 10.34, 1.8], [4.44, 6.42, 1.7], [-4.08, 9.66, 0.97], [-4.97, 6.42, 2]],
  pes: [[4.3, 1.02], [2.24, -3.98], [-2.76, 3.52], [-4.67, -1.77]],
  chefe: { intro: 3.2, rugido: 1.2, tremor: 0.7, pausa: 1.5 },
  zona: { acordar: 18, luta: 34 },
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
