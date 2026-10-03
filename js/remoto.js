// O boneco de OUTRO jogador na sua tela — alimentado por instantâneos (`js/rede/protocolo.js`).
//
// Nível 1: é o FANTASMA (translúcido, sem colisão nem combate) e o replay da
// mancha de sangue (vermelho). Nível 2/3: o mesmo boneco vira SÓLIDO e entra em
// `game.jogadores` — por isso ele já tem o contrato de alvo que os inimigos
// usam (`pos`, `radius`, `height`, `dead`, `iframes`, `takeDamage`). Quem
// decide o que fazer com o dano num remoto é a sessão de co-op (`aoSofrerDano`);
// no nível 1 ninguém o ataca, porque ele não está em `game.jogadores`.
import * as THREE from 'three';
import { CharacterModel, weaponMesh, shieldMesh } from './character.js';
import { armaduraDe } from './guerreiro.js';
import { MAO_OCUPADA } from './player.js';
import { ITEMS } from './items.js';

/** Quanto atrás do "agora" o boneco é desenhado: é a folga para interpolar entre dois recados. */
const ATRASO_MS = 160;
/** Recados guardados (o suficiente para ~2 s de folga a 8 por segundo). */
const MAX_BUFFER = 20;

const APARENCIAS = {
  fantasma: { cor: 0xa8c8ff, brilho: 0x2c4c9a, opacidade: 0.38 },
  sangue: { cor: 0xff4a3a, brilho: 0x8a1408, opacidade: 0.55 },
  // Na sala: o boneco SÓLIDO, com a cor da armadura dele e só um brilho tingido
  aliado: { cor: null, brilho: 0x14284f, opacidade: 1 },
  rival: { cor: null, brilho: 0x5a0c08, opacidade: 1 },
  solido: null,   // o boneco como ele é
};

export const giroCurto = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const loopa = (clip) => /Loop|Idle/.test(clip);

/**
 * A fila de recados de alguém de fora, desenhada `ATRASO_MS` no passado: é a
 * folga que deixa o boneco andar LISO entre dois recados em vez de pular. Serve
 * ao jogador remoto e às marionetes do co-op (os inimigos do convidado, que só
 * repetem o que o anfitrião manda — ver `Enemy.updateMarionete`).
 */
export class Interpolador {
  constructor() { this.fila = []; this.ultimo = 0; }
  receber(estado, quando = performance.now()) {
    this.fila.push({ quando, estado });
    if (this.fila.length > MAX_BUFFER) this.fila.shift();
    this.ultimo = quando;
  }
  /** `{a, b, k}`: os dois recados em volta do instante desenhado e quanto andar de um para o outro. */
  amostra(agora = performance.now()) {
    const f = this.fila;
    if (!f.length) return null;
    const alvo = agora - ATRASO_MS;
    let i = f.length - 1;
    while (i > 0 && f[i - 1].quando > alvo) i--;
    const depois = f[i], antes = f[Math.max(0, i - 1)];
    const span = depois.quando - antes.quando;
    const k = span > 0 ? THREE.MathUtils.clamp((alvo - antes.quando) / span, 0, 1) : 1;
    while (f.length > 2 && f[1].quando < alvo) f.shift();
    return { a: antes.estado, b: depois.estado, k };
  }
  limpar() { this.fila = []; }
}

export class JogadorRemoto {
  constructor(game, { id, nome = '', aparencia = 'fantasma' } = {}) {
    this.game = game;
    this.id = id;
    this.remoto = true;
    this.model = new CharacterModel({ outfit: 'knight' });
    this.pos = this.model.root.position;
    this.radius = 0.42;
    this.height = 1.85;
    this.facing = 0;
    this.state = 'free';
    this.buffer = [];
    this.maos = { d: undefined, e: undefined };
    this.aparencia = aparencia;
    this.opacidade = 0;          // nasce invisível e aparece aos poucos
    this.sumindo = false;
    this.aoSofrerDano = null;    // a sala preenche (duelo; depois, co-op)
    this.nome = nome;
    this.hpFrac = 1;             // vida de 0 a 1, do instantâneo (`h`)
    this.lockable = true;
    this.etiqueta = nome ? criarEtiqueta(nome) : null;
    if (this.etiqueta) { this.etiqueta.position.y = 2.25; this.model.root.add(this.etiqueta); }
    game.scene.add(this.model.root);
    this.aplicarAparencia();
  }

  /** Põe (ou troca) o nome sobre a cabeça — ele chega depois, do banco. */
  nomear(nome) {
    this.nome = nome;
    if (this.etiqueta) { this.model.root.remove(this.etiqueta); this.etiqueta.material.map?.dispose(); this.etiqueta.material.dispose(); }
    this.etiqueta = nome ? criarEtiqueta(nome) : null;
    if (this.etiqueta) { this.etiqueta.position.y = 2.25; this.model.root.add(this.etiqueta); }
    this.aplicarOpacidade();
  }

  get dead() { return this.state === 'dead'; }
  // O contrato de "alvo" que a mira travada, o golpe e a barra de chefe leem
  get active() { return !this.sumindo; }
  /** Na arena do Carrasco? (o chefe só luta com quem está lá dentro) */
  get inArena() { const w = this.game.world; const [r, c] = w.cellOf(this.pos); return w.isArenaCell(r, c); }
  get name() { return this.nome; }
  get hp() { return this.hpFrac * 1000; }
  get maxHp() { return 1000; }

  /** Troca o visual (aliado ↔ rival) sem refazer o boneco. */
  mudarAparencia(nome) { this.aparencia = nome; this.aplicarAparencia(); }
  get iframes() { return ['roll', 'fog', 'rest', 'restUp', 'lying', 'standing', 'dead'].includes(this.state); }

  /** Contrato de alvo (nível 2). No nível 1 nada chama isto. */
  takeDamage(amount, srcPos, opts = {}) {
    if (this.iframes) return 'iframe';
    this.aoSofrerDano?.(this, amount, srcPos, opts);
    return 'hit';
  }

  /** Chega um instantâneo (já limpo). `quando` = ms no relógio de quem desenha. */
  receber(inst, quando = performance.now()) {
    this.buffer.push({ quando, inst });
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
    this.ultimoRecado = quando;
    if (this.buffer.length === 1) this.colocar(inst, inst, 0);
  }

  update(dt, agora = performance.now()) {
    const b = this.buffer;
    if (b.length) {
      const alvo = agora - ATRASO_MS;
      // O par de recados em volta do instante desenhado; sem recado mais novo,
      // fica parado no último (inventar movimento é pior que esperar o próximo).
      let i = b.length - 1;
      while (i > 0 && b[i - 1].quando > alvo) i--;
      const depois = b[i], antes = b[Math.max(0, i - 1)];
      const span = depois.quando - antes.quando;
      const k = span > 0 ? THREE.MathUtils.clamp((alvo - antes.quando) / span, 0, 1) : 1;
      this.colocar(antes.inst, depois.inst, k);
      // descarta o que já ficou para trás
      while (b.length > 2 && b[1].quando < alvo) b.shift();
    }
    const meta = this.sumindo ? 0 : 1;
    this.opacidade += (meta - this.opacidade) * Math.min(1, dt * 4);
    this.aplicarOpacidade();
    this.model.update(dt);
  }

  colocar(a, b, k) {
    this.pos.set(
      THREE.MathUtils.lerp(a.x, b.x, k),
      THREE.MathUtils.lerp(a.y, b.y, k),
      THREE.MathUtils.lerp(a.z, b.z, k));
    // giro pelo caminho curto: de 3,0 para −3,0 rad são poucos graus, não uma volta
    this.facing = a.g + giroCurto(b.g - a.g) * k;
    this.model.root.rotation.y = this.facing;
    const atual = k < 0.5 ? a : b;
    this.state = atual.st ?? 'free';
    if (atual.a && atual.a !== this.model.currentName) {
      this.model.play(atual.a, { loop: loopa(atual.a), speed: atual.s || 1, fade: 0.15, from: atual.t ?? 0 });
    }
    if (atual.d !== this.maos.d || atual.e !== this.maos.e) this.equipar(atual.d, atual.e);
    this.model.duasMaos = !!ITEMS[this.maos.d]?.twoHanded && this.maos.e !== 'torch' && !MAO_OCUPADA.includes(this.state);
    if (atual.h != null) this.hpFrac = atual.h;
    if (atual.c && atual.c !== this.corpo) this.vestir(atual.c);
  }

  /** O corpo que o outro escolheu no provador (guerreiro.js); os materiais voltam a ser tingidos. */
  vestir(c) {
    this.corpo = c;
    this.model.usarGuerreiro(armaduraDe(c));
    this.aplicarAparencia();
  }

  equipar(d, e) {
    this.maos = { d, e };
    const arma = d && ITEMS[d]?.model ? weaponMesh(ITEMS[d].model) : null;
    this.model.equip('r', arma);
    let esq = null, costas = null;
    if (e === 'torch') esq = weaponMesh('torch');
    else if (e && ITEMS[e]?.model) { const s = shieldMesh(ITEMS[e].model); if (ITEMS[d]?.twoHanded) costas = s; else esq = s; }
    this.model.equip('l', esq);
    this.model.equipCostas(costas);
    this.aplicarAparencia();
  }

  /** Materiais próprios, translúcidos e tingidos (fantasma/sangue). */
  aplicarAparencia() {
    const ap = APARENCIAS[this.aparencia];
    this.mats = [];
    this.model.root.traverse((o) => {
      // escondida (o manequim sob o guerreiro, as peças soltas da malha fundida) não se vê: nem clona
      if (!o.isMesh || !o.material || o.userData.etiqueta || !o.visible) return;
      if (!o.userData.matProprio) {
        o.material = o.material.clone(); o.userData.matProprio = true;
        o.material.userData.corOriginal = o.material.color?.getHex();
        o.material.userData.brilhoOriginal = o.material.emissive?.getHex();
      }
      const m = o.material, ud = m.userData;
      // a armadura fundida (character.js) guarda a cor nos vértices: o fantasma
      // a pinta de UMA cor, então desliga a cor dos vértices enquanto está tingido
      ud.vertexColorsOriginal ??= m.vertexColors;
      const semCorDeVertice = !!ap?.cor && ud.vertexColorsOriginal;
      if (m.vertexColors !== (ud.vertexColorsOriginal && !semCorDeVertice)) { m.vertexColors = ud.vertexColorsOriginal && !semCorDeVertice; m.needsUpdate = true; }
      const translucido = ap && ap.opacidade < 1;
      m.transparent = !!translucido; m.depthWrite = !translucido;
      o.castShadow = !translucido;
      if (m.color) m.color.setHex(ap?.cor ?? ud.corOriginal ?? 0xffffff);
      if (m.emissive) m.emissive.setHex(ap ? ap.brilho : ud.brilhoOriginal ?? 0);
      ud.opacidadeBase = ap?.opacidade ?? 1;
      this.mats.push(m);
    });
    this.aplicarOpacidade();
  }

  aplicarOpacidade() {
    for (const m of this.mats) {
      const o = (m.userData.opacidadeBase ?? 1) * this.opacidade;
      m.opacity = o;
      // sólido só fica transparente enquanto aparece/some
      if ((m.userData.opacidadeBase ?? 1) >= 1) { m.transparent = o < 0.99; m.depthWrite = o >= 0.99; }
    }
    if (this.etiqueta) this.etiqueta.material.opacity = this.opacidade * 0.85;
    this.model.root.visible = this.opacidade > 0.01;
  }

  /** Começa a sumir; `pronto` = já sumiu (pode chamar `remover`). */
  sumir() { this.sumindo = true; }
  get sumiu() { return this.sumindo && this.opacidade < 0.02; }

  remover() {
    this.game.scene.remove(this.model.root);
    this.model.root.traverse((o) => { if (o.isMesh && o.userData.matProprio) o.material.dispose(); });
    this.etiqueta?.material.map?.dispose();
  }
}

/** O nome flutuando sobre a cabeça. */
function criarEtiqueta(texto) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 48;
  const g = c.getContext('2d');
  g.font = '28px Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'black'; g.shadowBlur = 6;
  g.fillStyle = '#dfe8ff';
  g.fillText(texto.slice(0, 24), 128, 24);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(1.6, 0.3, 1);
  s.userData.etiqueta = true;
  return s;
}
