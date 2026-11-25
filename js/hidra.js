import * as THREE from 'three';
import { clone as cloneSkinned } from '../vendor/jsm/utils/SkeletonUtils.js';
import { Assets } from './assets.js';
import { Interpolador, giroCurto } from './remoto.js';
import { Hidra, POSE_DA_HIDRA_PARADA } from './inimigos/hidra.js';
import { BOCA, ossosDaHidra, animarHidra } from './hidra-animacao.js';

/**
 * A HIDRA NO NAVEGADOR (25/11/2026; a primeira: a Mycohydra das WindHills) — o cérebro da hidra
 * (js/inimigos/hidra.js) com um CORPO: o .glb com esqueleto de assets/chefes/<modelo>.glb (o modelo do
 * Meshy, com os ossos e os pesos postos pelo ferramentas/chefe-de-arquivo/rigar.mjs). Não há clipes: a
 * animação é por CÓDIGO, osso a osso, pela pose que o cérebro diz (cada cabeça empinada ou curvada, cada
 * pé erguido, o giro das cabeças, o agachar) mais o que é só enfeite (o balanço das cabeças, o respirar,
 * o arrastar dos pés quando ela gira no lugar, o brilho que pulsa).
 *
 * Os OSSOS são achados pelo nome (o JSON do rigar.mjs): `raiz`, `tronco`, `pescoco<k>a|b|c` + `cabeca<k>` + `boca<k>`
 * + `mandibula<k>` para cada cabeça e `coxa<k>`, `canela<k>`, `pe<k>` para cada perna (k a partir de 0, na ordem das
 * `bocas` e dos `pes` da ficha). Faltando um osso, aquela parte só não se mexe.
 *
 * O BRILHO: a própria textura como `emissiveMap`, com pouca força e pulsando — o que é claro (as manchas
 * amarelas, a pele pálida) acende mais; à noite ela é um fungo que brilha, não uma silhueta preta.
 *
 * A ANIMAÇÃO (os ossos pela pose, as bocas, as mandíbulas, as pernas) mora no js/hidra-animacao.js, que só usa o three:
 * o editor de cenas a importa para tocar as animações na aba Esqueleto.
 *
 * O modelo pode não ter carregado (arquivo faltando): ela fica `fora` (nunca aparece) em vez de derrubar
 * o jogo, como o dragão.
 */

const BRILHO = { dormindo: 0.12, acordada: 0.32, furia: 0.5, pisca: 1.3 };
const COR_DO_BRILHO = 0xc8e070;
export class CorpoDaHidra extends Hidra {
  constructor(game, cfg, pos, rumo = 0) {
    super(game, cfg, pos, rumo);   // o cérebro (o `Game` é o mundo dele; a zona: o traço `zona`)
    this.game = game;
    this.root = new THREE.Group();
    const cena = Assets.chefes?.[cfg.modelo];
    if (!cena) {
      console.warn(`[hidra] sem assets/chefes/${cfg.modelo}.glb — ${cfg.name} não vai aparecer`);
      this.fora = true;
      this.sleep();
      return;
    }
    const modelo = cloneSkinned(cena);   // (um esqueleto só dela)
    this.root.add(modelo);
    modelo.traverse((m) => {
      if (!m.isSkinnedMesh) return;
      this.malha = m;
      // a malha anda (as pernas sobem, as cabeças empinam): a esfera de corte com folga, em vez de desligar o corte
      m.geometry = m.geometry.clone();
      m.geometry.computeBoundingSphere();
      m.geometry.boundingSphere.radius *= 1.3;
      m.material = m.material.clone();
      m.material.emissive = new THREE.Color(COR_DO_BRILHO);
      m.material.emissiveMap = m.material.map;
      m.material.emissiveIntensity = BRILHO.dormindo;
    });
    this.material = this.malha?.material;
    this.ossos = ossosDaHidra(this.malha?.skeleton.bones ?? [], cfg);
    this.aberturas = cfg.bocas.map(() => BOCA.dormindo);   // o quanto cada boca está aberta agora (vai até o alvo suave)
    this.passo = 0;          // o arrastar dos pés quando gira no lugar (enfeite): a fase
    this.arrastar = 0;       // … e a força (0 parada, 1 girando)
    this.facingAntes = this.facing;
    this.brilhoAlvo = BRILHO.dormindo;
    game.scene.add(this.root);
    this.ouvir((tipo, d) => this.aoEvento(tipo, d));
    this.vestirCorpo(0);
  }

  aoEvento(tipo, d) {
    const g = this.game;
    switch (tipo) {
      case 'rugiu': g.sfx.roar(); if (d.tremor) g.addShake(d.tremor); return;
      case 'olhosAcesos': this.brilhoAlvo = BRILHO.acordada; return;
      case 'adormeceu': this.brilhoAlvo = BRILHO.dormindo; return;
      case 'furia': this.brilhoAlvo = BRILHO.furia; g.sfx.roar(); g.addShake(0.4); return;
      case 'ergueu': g.sfx.swing(true); return;
      case 'tremeu': g.addShake(d.forca); return;
      case 'pisou':
        g.sfx.slam();
        g.addShake(0.7);
        g.effects.burst(d.pos.clone().setY(d.pos.y + 0.3), { count: 60, color: [0.42, 0.36, 0.26], speed: 8, size: 0.35, life: 1.0, gravity: 8 });
        return;
      case 'cuspiu':
        g.sfx.cast();
        g.effects.burst(d.pos, { count: 18, color: [0.55, 0.85, 0.3], speed: 3, size: 0.3, life: 0.5, gravity: 2 });
        return;
      case 'morreu': g.sfx.roar(); this.brilhoAlvo = 0; return;
    }
  }

  update(dt) {
    if (this.game.marionetes) {
      this.stateT = (this.stateT ?? 0) + dt;
      this.updateMarionete(dt);
    } else super.update(dt);
    this.vestirCorpo(dt);
  }

  /** O corpo segue o cérebro: o lugar, o rumo, o tombo, o brilho e os ossos na pose. */
  vestirCorpo(dt) {
    if (!this.malha) return;
    const raiz = this.root;
    raiz.position.copy(this.pos);
    raiz.visible = this.visivel;
    if (!this.game.marionetes && !this.active) return;   // (fora de cena: nem anima)
    raiz.rotation.set(0, this.facing, this.tombo ?? 0);
    // o brilho: vai até o alvo devagar, pulsa, e acende no golpe que pega
    const m = this.material, pulso = 1 + Math.sin((this.game.time ?? 0) * 1.7) * 0.25;
    this.brilho = THREE.MathUtils.lerp(this.brilho ?? this.brilhoAlvo, this.brilhoAlvo, Math.min(1, dt * 1.5));
    m.emissiveIntensity = this.flashT > 0 ? BRILHO.pisca : this.brilho * pulso;
    // o arrastar dos pés: quanto o corpo girou neste quadro (parada, os pés assentam)
    const girou = Math.abs(giroCurto(this.facing - this.facingAntes));
    this.facingAntes = this.facing;
    this.passo += girou * 9;
    if (dt > 0) this.arrastar = THREE.MathUtils.lerp(this.arrastar, Math.min(1, girou / dt / 0.25), Math.min(1, dt * 4));
    this.animar(dt, this.pose ?? POSE_DA_HIDRA_PARADA());
  }

  // ---------- Marionete (co-op e Mundo online, quando outro simula) ----------
  receberMarionete(e, quando) { (this.fio ??= new Interpolador()).receber(e, quando); }
  soltarMarionete() { this.fio = null; this.tombo = 0; }

  updateMarionete(dt) {
    const am = this.fio?.amostra();
    if (!am || !this.malha) return;
    const { a, b, k } = am, e = k < 0.5 ? a : b;
    this.pos.set(THREE.MathUtils.lerp(a.x, b.x, k), THREE.MathUtils.lerp(a.y, b.y, k), THREE.MathUtils.lerp(a.z, b.z, k));
    this.facing = a.g + giroCurto(b.g - a.g) * k;
    if (e.hp < this.hp - 0.5) { this.lastHit = this.game.time; this.flashT = 0.12; }
    this.hp = e.hp;
    this.active = e.ativo;
    this.dead = e.morto;
    this.visivel = e.visivel;
    if (this.state !== e.st) {
      this.setState(e.st);
      this.brilhoAlvo = e.st === 'dormant' ? BRILHO.dormindo : e.morto ? 0 : this.furia ? BRILHO.furia : BRILHO.acordada;
    }
    this.stateT = e.t ?? this.stateT;
    const x = e.extra ?? {};
    this.tombo = Number.isFinite(x.rz) ? x.rz : 0;
    this.pose = Hidra.poseDeNumeros(x.anim);
    if (this.flashT > 0) this.flashT -= dt;
  }

  /** ASSUMIR a hidra no meio do caminho (o cérebro: o traço `chefe`). */
  retomar(r) {
    this.soltarMarionete();
    super.retomar(r);
    this.brilhoAlvo = this.state === 'dormant' || this.state === 'gone' ? BRILHO.dormindo : this.furia ? BRILHO.furia : BRILHO.acordada;
  }

  // ----------------------------------------------------------- animação
  animar(dt, a) { animarHidra(this.ossos, a, this, this.game.time ?? 0, dt); }
}
