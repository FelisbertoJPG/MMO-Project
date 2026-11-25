import * as THREE from 'three';
import { clone as cloneSkinned } from '../vendor/jsm/utils/SkeletonUtils.js';
import { Assets } from './assets.js';
import { Interpolador, giroCurto } from './remoto.js';
import { Hidra, POSE_DA_HIDRA_PARADA } from './inimigos/hidra.js';

/**
 * A HIDRA NO NAVEGADOR (25/11/2026; a primeira: a Mycohydra das WindHills) — o cérebro da hidra
 * (js/inimigos/hidra.js) com um CORPO: o .glb com esqueleto de assets/chefes/<modelo>.glb (o modelo do
 * Meshy, com os ossos e os pesos postos pelo ferramentas/chefe-de-arquivo/rigar.mjs). Não há clipes: a
 * animação é por CÓDIGO, osso a osso, pela pose que o cérebro diz (cada cabeça empinada ou curvada, cada
 * pé erguido, o giro das cabeças, o agachar) mais o que é só enfeite (o balanço das cabeças, o respirar,
 * o arrastar dos pés quando ela gira no lugar, o brilho que pulsa).
 *
 * Os OSSOS são achados pelo nome (o JSON do rigar.mjs): `raiz`, `tronco`, `pescoco<k>a|b|c` + `cabeca<k>` + `boca<k>`
 * para cada cabeça e `coxa<k>`, `canela<k>`, `pe<k>` para cada perna (k a partir de 0, na ordem das
 * `bocas` e dos `pes` da ficha). Faltando um osso, aquela parte só não se mexe.
 *
 * O BRILHO: a própria textura como `emissiveMap`, com pouca força e pulsando — o que é claro (as manchas
 * amarelas, a pele pálida) acende mais; à noite ela é um fungo que brilha, não uma silhueta preta.
 *
 * O modelo pode não ter carregado (arquivo faltando): ela fica `fora` (nunca aparece) em vez de derrubar
 * o jogo, como o dragão.
 */

const BRILHO = { dormindo: 0.12, acordada: 0.32, furia: 0.5, pisca: 1.3 };
const COR_DO_BRILHO = 0xc8e070;
/** O PÉ NO ALTO (rad, com o pé todo erguido): a coxa sobe para fora até o joelho chegar perto da altura do
 *  quadril, a canela volta e fica pendurada, o pé pende; o corpo pende para o outro lado. */
const ERGUER = { coxa: 1.3, canela: -1.0, pe: -0.3, corpo: 0.1 };
/** AS BOCAS (a bocarra vertical de cada cabeça, por baixo do chapéu): o osso `boca<k>` escalado — 0 = fechada
 *  (os lábios e os dentes se encostam), 1 = escancarada. Em repouso ficam semiabertas e respiram; abrem tudo
 *  quando a cabeça EMPINA (o cuspe, o rugido: a pose `cab` > 0), um pouco no pisão; dormindo, quase fechadas. */
const BOCA = { dormindo: 0.08, repouso: 0.35, pisao: 0.6, morta: 0.7, largura: [0.3, 0.85], altura: [0.8, 0.3] };

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
    const osso = (n) => this.malha?.skeleton.bones.find((b) => b.name === n) ?? null;
    this.ossos = {
      raiz: osso('raiz'), tronco: osso('tronco'),
      cabecas: cfg.bocas.map((_, k) => ['a', 'b', 'c'].map((s) => osso(`pescoco${k}${s}`)).concat([osso(`cabeca${k}`)])),
      bocas: cfg.bocas.map((_, k) => osso(`boca${k}`)),
      pernas: cfg.pes.map(([x, z], k) => {
        // o eixo de erguer: deitado, de lado para a perna — gira o pé PARA FORA e para cima
        const fora = new THREE.Vector3(x, 0, z).normalize();
        return { coxa: osso(`coxa${k}`), canela: osso(`canela${k}`), pe: osso(`pe${k}`), eixo: new THREE.Vector3(-fora.z, 0, fora.x) };
      }),
    };
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
  /** Cada osso a partir da pose de ligação (o rigar.mjs não gira nenhum: a pose de ligação é o zero). */
  animar(dt, a) {
    const O = this.ossos, t = this.game.time ?? 0;
    const acordada = this.state !== 'dormant';
    // o respirar: o tronco incha e murcha um pouco
    const respira = Math.sin(t * (acordada ? 1.3 : 0.6)) * 0.02;
    O.tronco?.scale.setScalar(1 + respira);
    O.tronco?.rotation.set(respira * 0.5, 0, 0);
    // as CABEÇAS: o giro (todas para o alvo, na base), o empinar/curvar (a pose: + empina, − curva) e o balanço
    O.cabecas.forEach(([pa, pb, pc, cab], k) => {
      const e = a.cab[k] ?? 0, bal = acordada ? 1 : 0.4;
      const sx = Math.sin(t * 0.9 + k * 1.7) * 0.05 * bal, sz = Math.sin(t * 0.7 + k * 2.3) * 0.06 * bal;
      pa?.rotation.set(0, a.giro * 0.45, 0);
      pb?.rotation.set(-e * 0.3 + sx, a.giro * 0.25, sz);
      pc?.rotation.set(-e * 0.35 + sx, 0, sz);
      cab?.rotation.set(-e * 0.55 + sx * 0.5, 0, 0);
    });
    // as BOCAS: o alvo de cada uma pelo estado e pela pose, seguido devagar; abrir é escalar o osso
    O.bocas.forEach((boca, k) => {
      if (!boca) return;
      const empina = Math.max(0, Math.min(1, a.cab[k] ?? 0));
      let alvo = this.state === 'dormant' ? BOCA.dormindo : this.dead ? BOCA.morta : BOCA.repouso + (1 - BOCA.repouso) * empina;
      if (this.state === 'pisao') alvo = Math.max(alvo, BOCA.pisao);
      if (!this.dead && this.state !== 'dormant') alvo += Math.sin(t * 1.1 + k * 1.9) * 0.05;   // respira
      const ab = this.aberturas[k] = THREE.MathUtils.lerp(this.aberturas[k], alvo, Math.min(1, dt * 8));
      boca.scale.set(BOCA.largura[0] + BOCA.largura[1] * ab, BOCA.altura[0] + BOCA.altura[1] * ab, 1);
    });
    // as PERNAS: o pé da pose sobe (coxa para fora e para cima, a canela devolve, o pé pende); as outras
    // arrastam um pouco quando ela gira no lugar
    O.pernas.forEach(({ coxa, canela, pe, eixo }, k) => {
      const arrasta = a.pe.some((x) => x > 0.05) ? 0 : Math.max(0, Math.sin(this.passo + k * Math.PI / 2)) * 0.15 * this.arrastar;
      const l = Math.max(a.pe[k] ?? 0, arrasta);
      coxa?.quaternion.setFromAxisAngle(eixo, l * ERGUER.coxa);
      canela?.quaternion.setFromAxisAngle(eixo, l * ERGUER.canela);
      pe?.quaternion.setFromAxisAngle(eixo, l * ERGUER.pe);
    });
    // o corpo inteiro pende para o lado oposto ao pé que sobe (o peso)
    const ergue = a.pe.reduce((m, x, k) => (x > (a.pe[m] ?? 0) ? k : m), 0);
    const eixo = O.pernas[ergue]?.eixo;
    if (O.raiz && eixo) O.raiz.quaternion.setFromAxisAngle(eixo, -(a.pe[ergue] ?? 0) * ERGUER.corpo);
  }
}
