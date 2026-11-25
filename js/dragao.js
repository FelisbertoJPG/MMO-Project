import * as THREE from 'three';
import { Assets } from './assets.js';
import { montarModelo } from './blocos.js';
import { materiaisDoJogo } from './gear.js';
import { Interpolador, giroCurto } from './remoto.js';
import { Draconico, POSE_PARADA } from './inimigos/dragao.js';

/**
 * O WYRM DAS CINZAS NO NAVEGADOR (24/11/2026: o cérebro saiu para js/inimigos/dragao.js, e a ficha
 * para js/inimigos/tipos.js, `wyrm`) — o chefe secreto do terraço (o andar de cima, 'a' no mapa, a
 * que só se chega pela escada escondida na floresta).
 *
 * O `Dragao` é o cérebro do dragão com um CORPO: um MODELO DE BLOCOS (assets/modelos/dragao.json,
 * montado no Editor de modelo), sem esqueleto. A animação é PROCEDURAL: cada peça do modelo (patas,
 * pescoço, cabeça, mandíbula, asas, cauda) é girada em volta do próprio pivô — é por isso que as
 * peças foram montadas com o pivô na articulação. A pose de cada quadro é o cérebro que diz (`pose`);
 * o corpo só gira as peças, acende a garganta, solta o fogo e repete o retrato da rede.
 *
 * O modelo pode não ter carregado (arquivo faltando): o dragão fica `fora` (nunca aparece) em vez de
 * derrubar o jogo — uma masmorra sem chefe secreto ainda é jogável.
 */

const EMISSIVO = 0x1c0a06;

export class Dragao extends Draconico {
  constructor(game, cfg, pos, rumo = 0) {
    super(game, cfg, pos, rumo);   // o cérebro (o `Game` é o mundo dele; o ninho: o traço `territorio`)
    this.game = game;
    this.root = new THREE.Group();
    const modelo = Assets.modelos?.[cfg.modelo];
    if (!modelo) {
      console.warn(`[dragão] sem assets/modelos/${cfg.modelo}.json — o chefe secreto não vai aparecer`);
      this.fora = true;
      this.sleep();
      return;
    }
    // um brilho de brasa por baixo das escamas: sem ele, à noite o dragão é só uma silhueta preta
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, emissive: EMISSIVO });
    // as primitivas postas no Editor de modelo (chifres, espinhos) usam os materiais do jogo
    const { raiz, pecas } = montarModelo(modelo, { material: this.material, materialDe: materiaisDoJogo().materialDe });
    raiz.scale.setScalar(cfg.escala);
    this.root.add(raiz);
    this.pecas = pecas;
    // a pose do arquivo: a animação SOMA a ela (girar a partir do zero
    // desfaria a inclinação das asas e o ângulo do pescoço do modelo)
    this.base = new Map([...pecas].map(([id, g]) => [id, g.rotation.clone()]));
    // os olhos e a garganta em brasa
    this.brasa = new THREE.PointLight(0xff6a20, 0, 14, 1.6);
    const cabeca = pecas.get('cabeca');
    if (cabeca) { this.brasa.position.set(0, 0.3, 1.4); cabeca.add(this.brasa); }
    game.scene.add(this.root);
    this.ouvir((tipo, d) => this.aoEvento(tipo, d));
    this.vestirCorpo(0);
  }

  aoEvento(tipo, d) {
    const g = this.game;
    switch (tipo) {
      case 'rugiu': g.sfx.roar(); if (d.tremor) g.addShake(d.tremor); return;
      case 'brandiu': g.sfx.swing(d.pesado); return;
      case 'tremeu': g.addShake(d.forca); return;
      case 'soprou': g.sfx.explosion(); return;
      case 'soprando': this.chamas(); return;
      case 'pancada':
        g.sfx.slam();
        g.addShake(0.6);
        g.effects.burst(d.pos.clone().setY(d.pos.y + 0.2), { count: 50, color: [0.45, 0.4, 0.35], speed: 7, size: 0.28, life: 0.9, gravity: 8 });
        return;
      case 'morreu': g.sfx.roar(); return;
    }
  }

  update(dt) {
    if (this.game.marionetes) {
      this.stateT = (this.stateT ?? 0) + dt;
      this.updateMarionete(dt);
    } else super.update(dt);
    this.vestirCorpo(dt);
  }

  /** O corpo segue o cérebro: o lugar, o rumo, o tombo, a garganta, o piscar e as peças na pose. */
  vestirCorpo(dt) {
    if (!this.pecas) return;
    const raiz = this.root;
    raiz.position.copy(this.pos);
    raiz.visible = this.visivel;
    if (!this.game.marionetes && !this.active) return;   // (fora de cena: nem anima)
    const pisca = this.flashT > 0;
    if (pisca !== this._piscando) { this._piscando = pisca; this.material.emissive.setHex(pisca ? 0x552211 : EMISSIVO); }
    raiz.rotation.set(0, this.facing, this.tombo ?? 0);
    this.brasa.intensity = this.brilhoDaBrasa ?? 0;
    // a poeira das cinzas de quem tomba
    if (!this.game.marionetes && this.state === 'morrendo' && Math.random() < 0.5) {
      this.game.effects.spawn({ pos: this.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 5, 0.4, (Math.random() - 0.5) * 5)), vel: new THREE.Vector3(0, 1 + Math.random(), 0), color: [0.35, 0.32, 0.3], size: 0.2, life: 1.4 });
    }
    this.animar(dt, this.pose ?? POSE_PARADA);
  }

  /** As labaredas do sopro (um quadro), saindo da boca de verdade do modelo. */
  chamas() {
    if (!this.pecas) return;
    const boca = this.bocaDoModelo(), frente = new THREE.Vector3(Math.sin(this.facing), 0, Math.cos(this.facing));
    for (let i = 0; i < 3; i++) {
      const dir = frente.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.35, -0.12 + (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.35)).normalize();
      this.game.effects.spawn({ pos: boca.clone(), vel: dir.multiplyScalar(13 + Math.random() * 5), color: [1, 0.35 + Math.random() * 0.35, 0.08], size: 0.45 + Math.random() * 0.4, life: 0.8, gravity: -1.5, drag: 0.6 });
    }
  }

  /** A boca do modelo, em coordenadas do mundo (de onde sai o fogo que se vê). */
  bocaDoModelo() {
    const cabeca = this.pecas.get('cabeca');
    return cabeca ? cabeca.localToWorld(new THREE.Vector3(0, 0.2, 1.8)) : this.boca();
  }

  // ---------- Marionete (co-op e Mundo online, quando outro simula) ----------
  receberMarionete(e, quando) { (this.fio ??= new Interpolador()).receber(e, quando); }
  soltarMarionete() { this.fio = null; this.tombo = 0; }

  updateMarionete(dt) {
    const am = this.fio?.amostra();
    if (!am || !this.pecas) return;
    const { a, b, k } = am, e = k < 0.5 ? a : b;
    this.pos.set(THREE.MathUtils.lerp(a.x, b.x, k), THREE.MathUtils.lerp(a.y, b.y, k), THREE.MathUtils.lerp(a.z, b.z, k));
    this.facing = a.g + giroCurto(b.g - a.g) * k;
    if (e.hp < this.hp - 0.5) { this.lastHit = this.game.time; this.flashT = 0.12; }
    this.hp = e.hp;
    this.active = e.ativo;
    this.dead = e.morto;
    this.visivel = e.visivel;
    if (this.state !== e.st) this.setState(e.st);
    this.stateT = e.t ?? this.stateT;
    const x = e.extra ?? {};
    this.tombo = Number.isFinite(x.rz) ? x.rz : 0;
    this.brilhoDaBrasa = Number.isFinite(x.br) ? x.br : 0;
    this.pose = Draconico.poseDeNumeros(x.anim);
    if (this.state === 'sopro' && this.stateT > 0.9 && this.stateT < 2.9) this.chamas();
    this.passo += dt * 5 * this.pose.andar;
    if (this.flashT > 0) this.flashT -= dt;
  }

  /** ASSUMIR o dragão no meio do caminho (o cérebro: o traço `chefe`). */
  retomar(r) {
    this.soltarMarionete();
    super.retomar(r);
  }

  // ----------------------------------------------------------- animação
  /** Gira cada peça a partir da pose do arquivo (ver `this.base`). */
  animar(dt, a) {
    const P = this.pecas, B = this.base;
    const gira = (id, dx = 0, dy = 0, dz = 0) => {
      const g = P.get(id), b = B.get(id);
      if (g && b) g.rotation.set(b.x + dx, b.y + dy, b.z + dz);
    };
    const tempo = this.game.time ?? 0;
    const respira = Math.sin(tempo * (this.state === 'dormant' ? 1.2 : 2.2)) * 0.04;
    const s = Math.sin(this.passo) * 0.55 * a.andar;
    gira('corpo', respira * 0.5, 0, Math.sin(this.passo) * 0.04 * a.andar);
    gira('pataFE', s); gira('pataTD', s);
    gira('pataFD', -s); gira('pataTE', -s);
    gira('pescoco', a.pescocoX + respira, a.pescocoY);
    gira('cabeca', a.cabecaX, a.pescocoY * 0.4);
    gira('mandibula', a.boca);
    const bate = a.asa + Math.sin(tempo * 1.4) * 0.08;
    gira('asaE', 0, 0, -bate); gira('asaD', 0, 0, bate);
    for (const [i, id] of ['cauda1', 'cauda2', 'cauda3'].entries()) {
      gira(id, 0, Math.sin(tempo * 1.6 - i * 0.7) * (0.12 + 0.08 * i) * (this.state === 'dormant' ? 0.4 : 1));
    }
  }
}
