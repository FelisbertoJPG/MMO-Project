// Personagem humanoide realista (manequim Quaternius UAL) com trajes e armas presos aos ossos
import * as THREE from 'three';
import { Assets } from './assets.js';
import { buildOutfit, makeWeapon, makeShield } from './gear.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { CorpoGuerreiro } from './guerreiro.js';

// Golpes: tempos em SEGUNDOS do clipe (medidos pela velocidade da ponta da lâmina).
// from/to recortam trechos de clipes longos (combos); hit = janela de dano; arc = abertura do golpe.
export const ATTACKS = {
  slashA: { clip: 'Sword_Regular_A', to: 0.43, hit: [0.18, 0.31], arc: 1.3 },
  slashB: { clip: 'Sword_Regular_B', to: 0.53, hit: [0.19, 0.31], arc: 1.3 },
  slashC: { clip: 'Sword_Regular_C', to: 1.15, hit: [0.58, 0.74], arc: 1.1 },
  overhead: { clip: 'Sword_Attack', to: 0.95, hit: [0.36, 0.52], arc: 0.7 },
  dash: { clip: 'Sword_Dash', to: 0.95, hit: [0.26, 0.4], arc: 0.8 },
  heavy1: { clip: 'Sword_Heavy_Combo', from: 0, to: 0.85, hit: [0.33, 0.62], arc: 1.4 },
  heavy2: { clip: 'Sword_Heavy_Combo', from: 0.8, to: 1.5, hit: [1.1, 1.3], arc: 1.4 },
  heavy3: { clip: 'Sword_Heavy_Combo', from: 1.45, to: 2.25, hit: [1.72, 1.98], arc: 1.4 },
  heavy4: { clip: 'Sword_Heavy_Combo', from: 2.2, to: 3.1, hit: [2.57, 2.72], arc: 1.5 },
  hook: { clip: 'Melee_Hook', to: 0.47, hit: [0.22, 0.29], arc: 1.1 },
  jab: { clip: 'Punch_Jab', to: 0.6, hit: [0.12, 0.22], arc: 0.9 },
  cross: { clip: 'Punch_Cross', to: 0.65, hit: [0.16, 0.25], arc: 0.9 },
  scratch: { clip: 'Zombie_Scratch', to: 1.25, hit: [0.5, 0.66], arc: 1.2 },
  cast: { clip: 'Spell_Simple_Shoot', to: 0.5, hit: [0.06, 0.1], arc: 0 },
  throw: { clip: 'OverhandThrow', to: 1.0, hit: [0.28, 0.32], arc: 0 },
  leap: { clip: 'NinjaJump_Start', to: 0.97, hit: [0.9, 0.97], arc: 3.2 },
  summon: { clip: 'Spell_Simple_Enter', to: 1.2, hit: [0.9, 0.95], arc: 0 },
};

export class CharacterModel {
  constructor({ outfit = 'knight', scale = 1, skinTint = null, hideBody = false, armadura = false } = {}) {
    const { scene, materials } = Assets.character();
    this.scene = scene;
    // Traje montado na pose T (antes de qualquer transformação/animação)
    scene.updateMatrixWorld(true);
    buildOutfit(scene, outfit);
    this.body = [];
    scene.traverse((c) => { if (c.isSkinnedMesh) this.body.push(c); });
    // As dezenas de blocos da armadura viram poucas malhas (uma por tipo de
    // material): mesmo visual, uma fração das chamadas de desenho
    if (this.body[0]) fundirTraje(scene, this.body[0]);
    for (const m of this.body) m.visible = !hideBody;
    if (skinTint) for (const m of materials) m.color.setHex(skinTint);

    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.root.add(this.pivot);
    this.pivot.add(scene);
    scene.scale.setScalar(scale);
    this.scale = scale;
    this.handR = scene.getObjectByName('hand_r');
    this.handL = scene.getObjectByName('hand_l');
    this.lowerArmL = scene.getObjectByName('lowerarm_l');
    this.head = scene.getObjectByName('Head');
    this.materials = [];
    scene.traverse((c) => { if (c.isMesh && c.material && !this.materials.includes(c.material)) this.materials.push(c.material); });
    this.flashMats = [];
    scene.traverse((c) => { if (c.isMesh && c.material?.isMeshStandardMaterial) { c.material = c.material.clone(); this.flashMats.push(c.material); } });
    this.baseEmissive = this.flashMats.map((m) => m.emissive.clone());
    this.mixer = new THREE.AnimationMixer(scene);
    this.actions = {};
    this.current = null; this.currentName = null;
    this.slotR = null; this.slotL = null; this.slotCostas = null;
    // AS DUAS MÃOS (arma de duas mãos): quem anima liga `duasMaos`; o peso entra e sai suave
    this.duasMaos = false;
    this.pesoDuasMaos = 0;
    // o corpo do guerreiro (guerreiro.js): o manequim segue animando, invisível.
    // `armadura` como em `usarGuerreiro` (false = só o manequim, o padrão dos inimigos)
    this.guerreiro = armadura !== false && Assets.guerreiro ? new CorpoGuerreiro(this, armadura) : null;
  }

  // O PROVADOR (provador.js) troca o corpo com o jogo rodando: `false` = o boneco
  // antigo; null = o guerreiro sem armadura; 'A1'/'A2'/'A3' = com uma das dele.
  // As armas na mão passam para o corpo novo, com a mesma pegada.
  usarGuerreiro(armadura) {
    if (armadura === false) {
      if (!this.guerreiro) return;
      this.guerreiro.remover();
      this.guerreiro = null;
    } else if (this.guerreiro) {
      this.guerreiro.vestir(armadura);
      return;
    } else {
      if (!Assets.guerreiro) return;
      this.guerreiro = new CorpoGuerreiro(this, armadura);
    }
    for (const lado of ['r', 'l']) {
      const obj = (lado === 'r' ? this.slotR : this.slotL)?.children[0];
      if (obj) this.equip(lado, obj);
    }
    const costas = this.slotCostas?.children[0];
    if (costas) this.equipCostas(costas);
  }

  duration(name) { return Assets.clips[name]?.duration ?? 1; }

  action(name) {
    if (!this.actions[name]) {
      const clip = Assets.clips[name];
      if (!clip) { console.warn('Animação inexistente:', name); return null; }
      this.actions[name] = this.mixer.clipAction(clip);
    }
    return this.actions[name];
  }

  play(name, { fade = 0.18, loop = true, speed = 1, duration = null, restart = false, from = 0 } = {}) {
    const a = this.action(name);
    if (!a) return null;
    const ts = duration ? a.getClip().duration / duration : speed;
    if (this.current === a && !restart) { a.timeScale = ts; return a; }
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = !loop;
    a.timeScale = ts;
    a.time = from;
    a.setEffectiveWeight(1);
    if (this.current && this.current !== a && fade > 0) a.crossFadeFrom(this.current, fade, false);
    else if (this.current && this.current !== a) this.current.stop();
    a.play();
    this.current = a; this.currentName = name;
    return a;
  }

  pose(name, t = 0) {
    const a = this.action(name);
    this.mixer.stopAllAction();
    a.reset(); a.play(); a.paused = true; a.time = t;
    this.mixer.update(0);
    this.current = a; this.currentName = name;
  }

  // Arma na mão direita: construída na pose T e presa ao osso da mão
  equip(side, obj) {
    const hand = side === 'r' ? this.handR : this.handL;
    const key = side === 'r' ? 'slotR' : 'slotL';
    if (this[key]) { this[key].parent?.remove(this[key]); this[key] = null; }
    if (!obj) return;
    const shield = !!obj.userData.shield;
    const boneName = shield ? 'lowerarm_l' : side === 'r' ? 'hand_r' : 'hand_l';
    const holder = new THREE.Group();
    let osso = this.scene.getObjectByName(boneName);
    holder.matrix.copy(gripMatrix(boneName, side, shield));
    if (this.guerreiro) ({ osso, matriz: holder.matrix } = this.guerreiro.pegada(boneName, holder.matrix));
    holder.matrix.decompose(holder.position, holder.quaternion, holder.scale);
    holder.userData.base = holder.matrix.clone();   // a pegada sem o ajuste da EMPUNHADURA
    holder.add(obj);
    osso.add(holder);
    this[key] = holder;
  }

  // O escudo nas COSTAS (arma de duas mãos): preso ao alto da coluna, virado para trás
  equipCostas(obj) {
    if (this.slotCostas) { this.slotCostas.parent?.remove(this.slotCostas); this.slotCostas = null; }
    if (!obj) return;
    const holder = new THREE.Group();
    let osso = this.scene.getObjectByName('spine_03');
    holder.matrix.copy(costasMatrix());
    if (this.guerreiro) ({ osso, matriz: holder.matrix } = this.guerreiro.pegada('spine_03', holder.matrix));
    holder.matrix.decompose(holder.position, holder.quaternion, holder.scale);
    holder.add(obj);
    osso.add(holder);
    this.slotCostas = holder;
  }

  flash(on) {
    this.flashMats.forEach((m, i) => { if (on) m.emissive.setRGB(0.35, 0.2, 0.16); else m.emissive.copy(this.baseEmissive[i]); });
  }

  setEmissive(r, g, b) { for (const m of this.flashMats) m.emissive.setRGB(r, g, b); }

  update(dt) {
    this.mixer.update(dt);
    const meta = this.duasMaos && this.slotR ? 1 : 0;
    this.pesoDuasMaos += (meta - this.pesoDuasMaos) * Math.min(1, dt * 10);
    const comDuas = this.pesoDuasMaos > 0.01 && this.slotR;
    const e = comDuas ? empunhadura(this.slotR.children[0]?.userData.arma) : null;
    // no manequim, ANTES do retarget (o guerreiro copia o que ele fizer): os dedos da
    // esquerda fechados no cabo e as CORREÇÕES DE POSE da empunhadura desta animação
    if (comDuas) {
      this.fecharDedosEsquerdos(this.pesoDuasMaos);
      this.corrigirPose(e, this.pesoDuasMaos);
    }
    this.guerreiro?.seguir();
    // o grude no cabo (IK), na força que a empunhadura pede (0 = mão solta, só a pose)
    if (comDuas && e.ik > 0.01) this.segurarComAsDuas(this.pesoDuasMaos * e.ik);
    else if (comDuas) this.girarArma(1, e);
    else if (this.slotR?.userData.girada) this.girarArma(0);   // largou: a arma volta à pegada de uma mão
  }

  // o giro da arma na mão direita que a EMPUNHADURA pede (só com as duas mãos), no peso
  girarArma(peso, e = null) {
    const h = this.slotR, base = h.userData.base;
    if (!base) return;
    h.matrix.copy(base);
    if (e && peso > 0) {
      // pegada × giro do pulso × onde a mão segura na arma (`armaPos`, no espaço da arma)
      _qt.setFromEuler(_eu.set(e.arma[0] * GRAU, e.arma[1] * GRAU, e.arma[2] * GRAU));
      h.matrix.multiply(_mt.makeRotationFromQuaternion(_qr.identity().slerp(_qt, peso)));
      h.matrix.multiply(_mt.makeTranslation(e.armaPos[0] * peso, e.armaPos[1] * peso, e.armaPos[2] * peso));
    }
    h.matrix.decompose(h.position, h.quaternion, h.scale);
    h.userData.girada = !!(e && peso > 0);
  }

  /**
   * AS DUAS MÃOS na arma de duas mãos, com a ESPADA SOLTA (04/10/2026). Os clipes do
   * UAL são de uma mão; aqui a espada não é presa à mão direita: ela tem lugar próprio
   * e as DUAS mãos vão até ela (IK), cada pulso escolhendo o seu jeito de fechar no cabo.
   *
   *  1. a espada da animação (mão direita × pegada) mais o ajuste: `espadaGiro` (gira
   *     em volta do ponto da mão direita) e `cabo` (anda: lado/alto/frente do tronco);
   *  2. ela anda inteira para a frente do peito (`frenteMin`), para o meio, e até os
   *     dois pulsos alcançarem — senão um braço atravessaria o corpo;
   *  3. os pontos das mãos no cabo: a direita em `armaPos`, a esquerda `maoEsq.abaixo`
   *     para o pomo;
   *  4. cada mão gira EM VOLTA DO CABO até o pulso ficar o mais reto possível em relação
   *     ao antebraço (o cotovelo de um IK de teste) — é o que tira o pulso quebrado —, e
   *     por cima disso vem o giro que se pediu (`arma`, `maoEsq.giro`);
   *  5. a espada fica onde foi posta, alcance a mão ou não. `ik` mistura tudo com a
   *     animação (0 = a espada volta à mão direita e as mãos à animação).
   */
  segurarComAsDuas(peso) {
    const e = empunhadura(this.slotR.children[0]?.userData.arma);
    const h = this.slotR, base = h.userData.base;
    if (!base) return;
    const g = this.guerreiro;
    const osso = (ual, gu) => (g ? g.cena.getObjectByName(gu) : this.scene.getObjectByName(ual));
    const ombroL = osso('upperarm_l', 'ArmL'), cotL = osso('lowerarm_l', 'ElbowL'), maoL = osso('hand_l', 'HandL');
    const ombroR = osso('upperarm_r', 'ArmR'), cotR = osso('lowerarm_r', 'ElbowR'), maoR = osso('hand_r', 'HandR');
    // a espada volta à pegada de uma mão: é dela que sai a espada da animação
    h.matrix.copy(base); h.matrix.decompose(h.position, h.quaternion, h.scale);
    h.userData.girada = true;
    this.root.updateMatrixWorld(true);
    const pegaL = this.pegadaEsquerda();

    // 1. a espada da animação, e o antebraço de cada mão como a animação o tem (no
    //    espaço da mão: é a referência de "pulso reto")
    _S0.multiplyMatrices(maoR.matrixWorld, base).decompose(_Sp0, _Sq0, _t2);
    // Um clipe de DUAS MÃOS (o GreatSword_Idle do Mixamo…) já traz as palmas juntas: aí a
    // espada vai de uma palma à outra, como o clipe a segura, e a esquerda fica na
    // distância dele — o IK só faz o ajuste fino. Num clipe de uma mão, nada muda.
    _t1.setFromMatrixPosition(_hT.multiplyMatrices(maoL.matrixWorld, pegaL));   // a palma esquerda da animação
    const entre = _t1.distanceTo(_Sp0);
    const doClipe = entre > 0.04 && entre < 0.35;
    if (doClipe) _Sq0.premultiply(_qz.setFromUnitVectors(_t4.set(0, 0, 1).applyQuaternion(_Sq0), _t3.subVectors(_Sp0, _t1).normalize()));
    const abaixoBase = doClipe ? entre : EMPUNHADURA_PADRAO.maoEsq.abaixo;
    // o pulso da animação de cada mão: o giro LOCAL dela (contra o antebraço), o giro do
    // antebraço e a direção dele (cotovelo → pulso) — é o "pulso natural" a imitar
    pulsoDaAnimacao(maoR, cotR, _natR); pulsoDaAnimacao(maoL, cotL, _natL);
    const sL = ombroL.getWorldPosition(_sL), sR = ombroR.getWorldPosition(_sR);
    const lado = _lado.subVectors(sR, sL).normalize(), alto = _alto.set(0, 1, 0);
    const frente = _frente.crossVectors(alto, lado).normalize();
    const peito = _peito.addVectors(sL, sR).multiplyScalar(0.5).addScaledVector(alto, -0.2);
    // 2. ANTES do ajuste: a espada da ANIMAÇÃO anda inteira para a frente do peito, para o
    //    meio, e até os dois pulsos alcançarem (com a pegada PADRÃO: o que se ajusta nas
    //    mãos não pode empurrar a espada). Depois disso o ajuste vale como foi pedido.
    const Sq = _Sq.copy(_Sq0), Sp = _Sp.copy(_Sp0);
    const pR0 = _pRl.set(0, 0, 0), pL0 = _pLl.set(0, 0, -abaixoBase);
    const oR = _oR.set(0, 0, 0).applyMatrix4(_inv.copy(base).invert());
    const oL = _oL.set(0, 0, 0).applyMatrix4(_inv.copy(pegaL).invert()).add(pL0);
    const alcR = (sR.distanceTo(cotR.getWorldPosition(_t1)) + _t1.distanceTo(maoR.getWorldPosition(_t2))) * 0.97;
    const alcL = (sL.distanceTo(cotL.getWorldPosition(_t1)) + _t1.distanceTo(maoL.getWorldPosition(_t2))) * 0.97;
    const ponto = (o, alvo) => alvo.copy(o).applyQuaternion(Sq).add(Sp);
    const anda = _anda.set(0, 0, 0);
    // (num clipe de duas mãos a postura é a dele: não empurra)
    for (let k = 0; k < (doClipe ? 0 : 6); k++) {
      const R = ponto(pR0, _t1).add(anda), L = ponto(pL0, _t2).add(anda);
      const falta = e.frenteMin - Math.min(_t4.subVectors(R, peito).dot(frente), _t4.subVectors(L, peito).dot(frente));
      if (falta > 0) anda.addScaledVector(frente, falta);
      const xR = _t4.subVectors(ponto(pR0, _t1).add(anda), peito).dot(lado), xL = _t4.subVectors(ponto(pL0, _t2).add(anda), peito).dot(lado);
      if (xR > 0.28) anda.addScaledVector(lado, 0.28 - xR);
      else if (xL < -0.15) anda.addScaledVector(lado, -0.15 - xL);
      for (const [o, ombro, alc] of [[oL, sL, alcL], [oR, sR, alcR]]) {
        ponto(o, _t1).add(anda).sub(ombro);
        if (_t1.length() > alc) anda.addScaledVector(_t1, -(1 - alc / _t1.length()));
      }
    }
    Sp.add(anda);
    // 3. o AJUSTE: a espada gira (em volta do ponto da mão direita) e anda nos eixos do
    //    tronco; as mãos correm no cabo cada uma por si (a direita em `armaPos`, a esquerda
    //    `maoEsq.abaixo` para o pomo) — nenhuma mexe na espada nem na outra
    Sq.multiply(_qt.setFromEuler(_eu.set(e.espadaGiro[0] * GRAU, e.espadaGiro[1] * GRAU, e.espadaGiro[2] * GRAU)));
    Sp.addScaledVector(lado, e.cabo[0]).addScaledVector(alto, e.cabo[1]).addScaledVector(frente, e.cabo[2]);
    // (a esquerda: a distância do clipe — ou a padrão — mais o que se ajustou)
    const pR = _pRl.set(e.armaPos[0], e.armaPos[1], e.armaPos[2]), pL = _pLl.set(0, 0, -(abaixoBase + e.maoEsq.abaixo - EMPUNHADURA_PADRAO.maoEsq.abaixo));
    // a força do grude mistura com a animação (a espada e as mãos)
    Sp.lerpVectors(_Sp0, Sp, peso); Sq.copy(_qt.copy(_Sq0).slerp(Sq, peso));
    const poloR = _poloR.copy(sR).addScaledVector(lado, 0.35).addScaledVector(alto, -0.45).addScaledVector(frente, -0.1);
    const poloL = _poloL.copy(sL).addScaledVector(lado, -0.35).addScaledVector(alto, -0.45).addScaledVector(frente, -0.1);

    // 3–4. cada mão: o giro em volta do cabo que deixa o pulso mais reto, mais o pedido
    for (const [mao, cot, ombro, polo, pnt, pega, nat, giro, chave, ld] of [
      [maoR, cotR, ombroR, poloR, pR, base, _natR, e.arma, '_rollR', 'r'],
      [maoL, cotL, ombroL, poloL, pL, pegaL, _natL, e.maoEsq.giro, '_rollL', 'l'],
    ]) {
      const G = ponto(pnt, _G);   // o ponto da mão no cabo, no mundo
      const la = ombro.getWorldPosition(_t1).distanceTo(cot.getWorldPosition(_t2)), lb = _t2.distanceTo(mao.getWorldPosition(_t4));
      _invPega.copy(pega).invert();
      let melhor = -Infinity, rolo = 0;
      const S = ombro.getWorldPosition(_Sw), dentro = mao === maoR ? 1 : -1;   // o lado de dentro (lado+ é a direita)
      for (let k = 0; k < 24; k++) {
        const th = (k / 24) * Math.PI * 2;
        _qTeste.copy(Sq).multiply(_qz.setFromAxisAngle(_Z, th));
        _hT.compose(G, _qTeste, _um).multiply(_invPega).decompose(_w, _qMaoT, _t2);
        // o cotovelo: o do polo, e girado em volta da reta ombro→pulso (−90° a +90°)
        cotoveloDoIK(S, _w, la, lb, polo, _cot0);
        _eixoOP.subVectors(_w, S).normalize();
        for (let m = -6; m <= 6; m++) {
          const fi = m * (Math.PI / 12);
          _cot.copy(_cot0).sub(S).applyAxisAngle(_eixoOP, fi).add(S);
          // a DOBRA do pulso: o antebraço que a mão espera (o da animação, visto da mão)
          // contra o que o cotovelo dá — a torção se acerta depois, no próprio antebraço
          let nota = _t4.copy(nat.naMao).applyQuaternion(_qMaoT).dot(_t3.subVectors(_cot, _w).normalize()) + 0.02 * Math.cos(th) + 0.03 * Math.cos(fi);
          // cotovelo para DENTRO do corpo (passando do meio do peito) ou para trás das costas: castigo
          const lat = _t4.subVectors(_cot, peito).dot(lado) * dentro, fr = _t4.dot(frente);
          if (lat < 0.1) nota -= (0.1 - lat) * 4;
          if (fr < -0.12) nota -= (-0.12 - fr) * 4;
          // e o antebraço passando POR DENTRO do tronco (o meio dele no miolo do peito)
          for (const u of [0.35, 0.65]) {
            _t3.lerpVectors(_cot, _w, u).sub(peito);
            const mx = Math.abs(_t3.dot(lado)), mz = _t3.dot(frente);
            if (mx < 0.2 && mz < 0.12 && Math.abs(_t3.y) < 0.4) nota -= (0.2 - mx) * (0.12 - mz) * 60;
          }
          if (nota > melhor) { melhor = nota; rolo = th; _cotMelhor.copy(_cot); }
        }
      }
      polo.copy(_cotMelhor);   // o IK põe o cotovelo do lado do escolhido
      this[chave] = rolo;
      _qTeste.copy(Sq).multiply(_qz.setFromAxisAngle(_Z, rolo)).multiply(_qt.setFromEuler(_eu.set(giro[0] * GRAU, giro[1] * GRAU, giro[2] * GRAU)));
      _hT.compose(G, _qTeste, _um).multiply(_invPega).decompose(_alvo, _qAlvo, _t2);
      mao.getWorldPosition(_pR); mao.getWorldQuaternion(_qMao);
      _alvo.lerpVectors(_pR, _alvo, peso); _qAlvo.copy(_qMao.slerp(_qAlvo, peso));
      // O COTOVELO que se pediu: gira em volta da reta ombro→pulso (o que estava no
      // automático, mais `cotovelos` e as chaves `cotovelo_r`/`_l` desta animação)
      const i2 = ld === 'r' ? 0 : 1;
      const giroCot = (e.cotovelos[i2] + this.extraDaCamada(e, `cotovelo_${ld}`)) * GRAU * peso;
      if (giroCot) polo.sub(_Sw).applyAxisAngle(_eixoOP.subVectors(_alvo, _Sw).normalize(), giroCot).add(_Sw);
      ikDoisOssos(ombro, cot, mao, _alvo, polo);
      porNoMundo(mao, _qAlvo);
      // a TORÇÃO do pulso volta a ser a da animação: o antebraço gira em volta do próprio
      // eixo (cotovelo e pulso não saem do lugar) e a mão fica onde estava
      torcerAntebraco(cot, mao, nat, peso);
      porNoMundo(mao, _qAlvo);
      // a TORÇÃO DO BÍCEPS que se pediu: o braço gira em volta do próprio eixo (`bracos`
      // e as chaves `braco_r`/`_l`); antebraço e mão ficam onde estavam
      const giroBraco = (e.bracos[i2] + this.extraDaCamada(e, `braco_${ld}`)) * GRAU * peso;
      if (giroBraco) {
        cot.getWorldQuaternion(_qFa);
        ombro.quaternion.multiply(_qz.setFromAxisAngle(_eixoT.copy(cot.position).normalize(), giroBraco));
        ombro.updateMatrixWorld(true);
        porNoMundo(cot, _qFa);
        porNoMundo(mao, _qAlvo);
      }
    }
    // 5. a espada onde foi posta, presa à mão só como filha (o osso a leva no quadro seguinte)
    maoR.updateMatrixWorld(true);
    h.matrix.copy(_inv.copy(maoR.matrixWorld).invert()).multiply(_S.compose(Sp, Sq, _um));
    h.matrix.decompose(h.position, h.quaternion, h.scale);
    h.updateMatrixWorld(true);
  }

  /**
   * As CORREÇÕES DE POSE (`camadas` da empunhadura): giros extras em ossos do
   * manequim, por animação, em CHAVES no tempo do clipe — entre duas chaves, o giro
   * de cada osso é interpolado; antes da primeira e depois da última, vale a ponta.
   * A camada `*` vale para as animações sem camada própria. Feitas na tela
   * Empunhadura (modo Pose) para desfazer o que o IK deforma.
   */
  // uma chave de NÚMERO das camadas (`cotovelo_r`, `braco_l`…: graus no primeiro campo),
  // interpolada no tempo do clipe como as de osso; sem chave, 0
  extraDaCamada(e, nome) {
    const chaves = e.camadas[this.currentName] ?? e.camadas['*'];
    if (!chaves?.length) return 0;
    const t = this.current?.time ?? 0;
    let i = 0;
    while (i < chaves.length - 1 && chaves[i + 1].t <= t) i++;
    const a = chaves[i], b = chaves[Math.min(i + 1, chaves.length - 1)];
    const va = a.ossos[nome]?.[0] ?? 0, vb = b.ossos[nome]?.[0] ?? 0;
    if (t < chaves[0].t || b === a || b.t <= a.t) return va;
    return va + (vb - va) * THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
  }

  corrigirPose(e, peso) {
    const chaves = e.camadas[this.currentName] ?? e.camadas['*'];
    if (!chaves?.length) return;
    const t = this.current?.time ?? 0;
    let i = 0;
    while (i < chaves.length - 1 && chaves[i + 1].t <= t) i++;
    const a = chaves[i], b = chaves[Math.min(i + 1, chaves.length - 1)];
    const u = b === a || b.t <= a.t ? 0 : THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1);
    const antes = t < chaves[0].t;
    this._ossosPose ??= new Map();
    for (const nome of new Set([...Object.keys(a.ossos), ...Object.keys(b.ossos)])) {
      if (!this._ossosPose.has(nome)) this._ossosPose.set(nome, this.scene.getObjectByName(nome) ?? null);
      const o = this._ossosPose.get(nome);
      if (!o) continue;
      const ga = a.ossos[nome] ?? ZERO3, gb = b.ossos[nome] ?? ZERO3;
      _qa1.setFromEuler(_eu.set(ga[0] * GRAU, ga[1] * GRAU, ga[2] * GRAU));
      if (!antes && u > 0) _qb1.setFromEuler(_eu.set(gb[0] * GRAU, gb[1] * GRAU, gb[2] * GRAU)), _qa1.slerp(_qb1, u);
      o.quaternion.multiply(_qb1.identity().slerp(_qa1, peso));
    }
  }

  // Os clipes de uma mão deixam a esquerda ABERTA (ela está livre): no cabo, os dedos
  // vão para a pose de quem segura a tocha (o primeiro quadro do `Idle_Torch_Loop`)
  fecharDedosEsquerdos(peso) {
    const dedos = dedosDaTocha();
    if (!this._dedosL) this._dedosL = [...dedos.keys()].map((n) => this.scene.getObjectByName(n));
    let i = 0;
    for (const q of dedos.values()) { const o = this._dedosL[i++]; if (o) o.quaternion.slerp(q, peso); }
  }

  // a pegada da mão esquerda (osso da mão → arma), a da tocha; no guerreiro, no osso dele
  pegadaEsquerda() {
    const chave = this.guerreiro ?? this;
    if (this._pegaL?.chave !== chave) {
      const naUal = gripMatrix('hand_l', 'l', false);
      this._pegaL = { chave, m: this.guerreiro ? this.guerreiro.pegada('hand_l', naUal.clone()).matriz : naUal.clone() };
    }
    return this._pegaL.m;
  }
}

// os dedos da mão esquerda (falanges 01–03) no primeiro quadro do clipe da tocha
let dedosTocha = null;
function dedosDaTocha() {
  if (dedosTocha) return dedosTocha;
  dedosTocha = new Map();
  const clip = Assets.clips.Idle_Torch_Loop;
  for (const t of clip?.tracks ?? []) {
    const [osso, prop] = t.name.split('.');
    if (prop === 'quaternion' && /^(thumb|index|middle|ring|pinky)_0[123]_l$/.test(osso)) dedosTocha.set(osso, new THREE.Quaternion().fromArray(t.values, 0));
  }
  return dedosTocha;
}

// ---------------------------------------------------------------- IK de dois ossos
// Gira o ombro e o cotovelo para a ponta (`osC`) chegar ao alvo, mantendo o plano
// de dobra do braço: (1) o cotovelo abre/fecha até a distância ombro→ponta ser a
// do alvo (teorema dos cossenos), (2) o ombro gira essa reta até o alvo. Tudo em
// giros NO MUNDO, convertidos para o local de cada osso; alvo fora do alcance =
// braço esticado na direção dele.
const _alvoLocal = new THREE.Vector3(), _alvo = new THREE.Vector3(), _inv = new THREE.Matrix4();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _ba = new THREE.Vector3(), _bc = new THREE.Vector3(), _ac = new THREE.Vector3(), _at = new THREE.Vector3(), _eixo = new THREE.Vector3();
const _qw = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _qr = new THREE.Quaternion(), _qMao = new THREE.Quaternion(), _qt = new THREE.Quaternion();
// A EMPUNHADURA de cada arma de duas mãos: os números que a tela Empunhadura do
// editor de cenas ajusta e grava em `assets/empunhadura.json` (`Assets.empunhadura`).
// O que faltar no arquivo vem daqui. Distâncias em metros, giros em graus.
// A ESPADA É SOLTA: tem lugar próprio, e as duas mãos vão até ela (`segurarComAsDuas`).
//   cabo       — quanto a ESPADA anda: [lado, alto, frente] do tronco
//   espadaGiro — quanto ela gira (x, y, z, no espaço dela, em volta do ponto da mão direita)
//   frenteMin  — os pontos das mãos, no mínimo isto à frente do peito
//   armaPos    — onde a mão DIREITA segura na espada: [x, y, z] no espaço dela (z = ao longo)
//   arma       — o PULSO direito: giro extra da mão no cabo (por cima do giro automático)
//   maoEsq     — a mão ESQUERDA: `abaixo` da direita no cabo (para o pomo) e `giro`, o pulso
//                dela; (`pos` ficou sem uso)
//   cotovelos  — [dir, esq] graus: o cotovelo gira em volta da reta ombro→pulso (o braço
//                todo muda sem a mão sair do cabo), por cima da escolha automática
//   bracos     — [dir, esq] graus: a torção do BÍCEPS (o braço em volta do próprio eixo)
//   (os dois também por chave nas `camadas`: `cotovelo_r`, `cotovelo_l`, `braco_r`, `braco_l`)
//   ik        — a FORÇA do grude no cabo: 1 = as mãos presas aos seus pontos (IK),
//               0 = soltas (só a animação e as correções de pose); no meio, misturado
//   camadas   — as CORREÇÕES DE POSE por animação: { "<clipe>" | "*": [ { t, ossos:
//               { "<osso do manequim>": [x, y, z] graus } } … ] } (ver `corrigirPose`)
export const EMPUNHADURA_PADRAO = { ik: 1, armaPos: [0, 0, 0], espadaGiro: [0, 0, 0], cotovelos: [0, 0], bracos: [0, 0], cabo: [0, 0, 0], frenteMin: 0.3, arma: [0, 0, 0], maoEsq: { abaixo: 0.11, pos: [0, 0, 0], giro: [0, 0, 0] }, camadas: {} };
const v2 = (v, p) => (Array.isArray(v) && v.length === 2 && v.every(Number.isFinite) ? v : p);
const v3 = (v, p) => (Array.isArray(v) && v.length === 3 && v.every(Number.isFinite) ? v : p);
export function empunhadura(arma) {
  const e = (arma && Assets.empunhadura?.[arma]) || {}, p = EMPUNHADURA_PADRAO, m = e.maoEsq ?? {};
  return {
    ik: Number.isFinite(e.ik) ? THREE.MathUtils.clamp(e.ik, 0, 1) : p.ik,
    armaPos: v3(e.armaPos, p.armaPos), espadaGiro: v3(e.espadaGiro, p.espadaGiro),
    cotovelos: v2(e.cotovelos, p.cotovelos), bracos: v2(e.bracos, p.bracos),
    cabo: v3(e.cabo, p.cabo), frenteMin: Number.isFinite(e.frenteMin) ? e.frenteMin : p.frenteMin, arma: v3(e.arma, p.arma),
    maoEsq: { abaixo: Number.isFinite(m.abaixo) ? m.abaixo : p.maoEsq.abaixo, pos: v3(m.pos, p.maoEsq.pos), giro: v3(m.giro, p.maoEsq.giro) },
    camadas: e.camadas && typeof e.camadas === 'object' ? e.camadas : {},
  };
}
const ZERO3 = [0, 0, 0];
const _qa1 = new THREE.Quaternion(), _qb1 = new THREE.Quaternion();
const GRAU = Math.PI / 180;
const _desce = new THREE.Matrix4(), _hL = new THREE.Matrix4(), _mt = new THREE.Matrix4(), _eu = new THREE.Euler();
const _lado = new THREE.Vector3(), _alto = new THREE.Vector3(), _frente = new THREE.Vector3(), _peito = new THREE.Vector3(), _poloR = new THREE.Vector3(), _poloL = new THREE.Vector3();
const _pb = new THREE.Vector3(), _pp = new THREE.Vector3();
// o pulso como a animação o tem: giro local da mão, giro do antebraço e a direção dele
function pulsoDaAnimacao(mao, cot, alvo) {
  cot.getWorldQuaternion(alvo.antebraco);
  mao.getWorldQuaternion(_qa1);
  alvo.local.copy(alvo.antebraco).invert().multiply(_qa1);
  alvo.dir.copy(mao.getWorldPosition(_wA)).sub(cot.getWorldPosition(_cotA)).normalize();
  alvo.naMao.copy(alvo.dir).negate().applyQuaternion(_qa1.invert());   // pulso → cotovelo, no espaço da mão
  return alvo;
}
// a parte de um giro em volta de um eixo (decomposição balanço × torção)
function torcaoDe(q, eixo, alvo) {
  const p = q.x * eixo.x + q.y * eixo.y + q.z * eixo.z;
  alvo.set(eixo.x * p, eixo.y * p, eixo.z * p, q.w);
  return alvo.lengthSq() < 1e-12 ? alvo.identity() : alvo.normalize();
}
// gira o antebraço em volta do PRÓPRIO eixo (o osso da mão é filho dele: a direção do
// filho é o eixo) até a torção do pulso igualar a da animação
function torcerAntebraco(cot, mao, nat, peso) {
  const eixo = _eixoT.copy(mao.position).normalize();
  cot.getWorldQuaternion(_qa1); mao.getWorldQuaternion(_qb1);
  const local = _qa1.invert().multiply(_qb1);            // o pulso agora
  torcaoDe(local, eixo, _tw1); torcaoDe(nat.local, eixo, _tw2);
  // o antebraço gira por Δ (no local dele) e a mão fica: o pulso vira Δ⁻¹ × pulso. Para a
  // torção dele virar a da animação: Δ = torção agora × torção da animação⁻¹
  const delta = _tw1.multiply(_tw2.invert());
  if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
  cot.quaternion.multiply(_tw3.identity().slerp(delta, peso));   // (_tw3: `delta` É o _tw1)
  cot.updateMatrixWorld(true);
}
const _eixoT = new THREE.Vector3(), _tw1 = new THREE.Quaternion(), _tw2 = new THREE.Quaternion(), _tw3 = new THREE.Quaternion();
const _Sw = new THREE.Vector3(), _cot0 = new THREE.Vector3(), _eixoOP = new THREE.Vector3(), _cotMelhor = new THREE.Vector3();
const _natR = { antebraco: new THREE.Quaternion(), local: new THREE.Quaternion(), dir: new THREE.Vector3(), naMao: new THREE.Vector3() };
const _natL = { antebraco: new THREE.Quaternion(), local: new THREE.Quaternion(), dir: new THREE.Vector3(), naMao: new THREE.Vector3() };
const _qFa = new THREE.Quaternion();
// onde o IK de dois ossos poria o cotovelo: no círculo entre ombro e pulso, para o lado do polo
function cotoveloDoIK(S, W, a, b, polo, alvo) {
  const d = THREE.MathUtils.clamp(S.distanceTo(W), Math.abs(a - b) + 1e-4, a + b - 1e-4);
  const u = _u.subVectors(W, S).normalize();
  const ao = (a * a - b * b + d * d) / (2 * d), alt = Math.sqrt(Math.max(0, a * a - ao * ao));
  const p = _pp2.subVectors(polo, S); p.addScaledVector(u, -p.dot(u));
  if (p.lengthSq() < 1e-8) p.set(0, -1, 0).addScaledVector(u, u.y); p.normalize();
  return alvo.copy(S).addScaledVector(u, ao).addScaledVector(p, alt);
}
const _cotA = new THREE.Vector3(), _wA = new THREE.Vector3(), _u = new THREE.Vector3(), _pp2 = new THREE.Vector3();
const _S0 = new THREE.Matrix4(), _S = new THREE.Matrix4(), _hT = new THREE.Matrix4(), _invPega = new THREE.Matrix4();
const _Sp0 = new THREE.Vector3(), _Sp = new THREE.Vector3(), _Sq0 = new THREE.Quaternion(), _Sq = new THREE.Quaternion();
const _fR = new THREE.Vector3(), _fL = new THREE.Vector3(), _pRl = new THREE.Vector3(), _pLl = new THREE.Vector3(), _G = new THREE.Vector3(), _w = new THREE.Vector3(), _cot = new THREE.Vector3();
const _qTeste = new THREE.Quaternion(), _qz = new THREE.Quaternion(), _qMaoT = new THREE.Quaternion(), _Z = new THREE.Vector3(0, 0, 1);
const _desliza = new THREE.Vector3(), _oR = new THREE.Vector3(), _oL = new THREE.Vector3(), _anda = new THREE.Vector3(), _t3 = new THREE.Vector3(), _t4 = new THREE.Vector3();
const _Rg = new THREE.Vector3(), _Lg = new THREE.Vector3(), _eixo2 = new THREE.Vector3(), _um = new THREE.Vector3(1, 1, 1);
const _qAlvo = new THREE.Quaternion(), _qArma = new THREE.Quaternion(), _qArma2 = new THREE.Quaternion(), _qEixo = new THREE.Quaternion(), _hR = new THREE.Matrix4();
// põe o osso `o` com o giro `q` no MUNDO (o pai fica onde está)
function porNoMundo(o, q) {
  o.parent.getWorldQuaternion(_qp);
  o.quaternion.copy(_qp.invert().multiply(q));
  o.updateMatrixWorld(true);
}
const _pR = new THREE.Vector3(), _d = new THREE.Vector3(), _sL = new THREE.Vector3(), _sR = new THREE.Vector3(), _R = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();
// gira o osso `o` no MUNDO por `r` (o pai fica onde está)
function girarNoMundo(o, r) {
  o.getWorldQuaternion(_qw);
  o.parent.getWorldQuaternion(_qp);
  o.quaternion.copy(_qp.invert().multiply(r.multiply(_qw)));
  o.updateMatrixWorld(true);
}
function ikDoisOssos(osA, osB, osC, alvo, polo = null) {
  osA.getWorldPosition(_a); osB.getWorldPosition(_b); osC.getWorldPosition(_c);
  const lab = _a.distanceTo(_b), lcb = _b.distanceTo(_c);
  const lat = THREE.MathUtils.clamp(_a.distanceTo(alvo), Math.abs(lab - lcb) + 0.002, lab + lcb - 0.002);
  // (1) o cotovelo: o ângulo em B que dá a distância `lat`
  _ba.subVectors(_a, _b).normalize(); _bc.subVectors(_c, _b).normalize();
  const atual = Math.acos(THREE.MathUtils.clamp(_ba.dot(_bc), -1, 1));
  const quer = Math.acos(THREE.MathUtils.clamp((lab * lab + lcb * lcb - lat * lat) / (2 * lab * lcb), -1, 1));
  _eixo.crossVectors(_ba, _bc);
  if (_eixo.lengthSq() < 1e-10) _eixo.set(0, 1, 0).cross(_ba);   // braço reto: dobra para qualquer lado
  _eixo.normalize();
  girarNoMundo(osB, _qr.setFromAxisAngle(_eixo, quer - atual));
  // (2) o ombro: a reta ombro→ponta para cima do alvo
  osC.getWorldPosition(_c);
  _ac.subVectors(_c, _a).normalize(); _at.subVectors(alvo, _a).normalize();
  girarNoMundo(osA, _qr.setFromUnitVectors(_ac, _at));
  // (3) o POLO: gira o braço em volta da reta ombro→alvo (a mão não sai do lugar)
  // até o cotovelo ficar do lado do polo
  if (!polo) return;
  osB.getWorldPosition(_b);
  _pb.subVectors(_b, _a).addScaledVector(_at, -_b.clone().sub(_a).dot(_at));
  _pp.subVectors(polo, _a).addScaledVector(_at, -polo.clone().sub(_a).dot(_at));
  if (_pb.lengthSq() < 1e-8 || _pp.lengthSq() < 1e-8) return;
  _pb.normalize(); _pp.normalize();
  const ang = Math.atan2(_eixo.crossVectors(_pb, _pp).dot(_at), _pb.dot(_pp));
  girarNoMundo(osA, _qr.setFromAxisAngle(_at, ang));
}

// Matriz local (relativa ao osso) de uma arma/escudo, calculada na pose T da cena-fonte
const gripCache = {};
function gripMatrix(boneName, side, shield) {
  const key = boneName + side + shield;
  if (gripCache[key]) return gripCache[key];
  const src = Assets.baseScene;
  src.updateMatrixWorld(true);
  const hp = src.getObjectByName(side === 'r' ? 'hand_r' : 'hand_l').getWorldPosition(new THREE.Vector3());
  const sx = Math.sign(hp.x);
  const target = shield
    ? new THREE.Matrix4().makeTranslation(hp.x - sx * 0.19, hp.y + 0.075, hp.z)
    : new THREE.Matrix4().makeTranslation(hp.x + sx * 0.075, hp.y - 0.02, hp.z + 0.005);
  const bone = src.getObjectByName(boneName);
  gripCache[key] = bone.matrixWorld.clone().invert().multiply(target);
  return gripCache[key];
}

// Matriz local (no osso spine_03) do escudo nas costas, na pose T: atrás do peito,
// um pouco abaixo. O escudo é feito (gear.js) com a face para +Y e o alto para −Z:
// Rx(−90°) põe a face para trás (−Z) e Rz(180°) desvira o alto para cima
let costasCache = null;
function costasMatrix() {
  if (costasCache) return costasCache;
  const src = Assets.baseScene;
  src.updateMatrixWorld(true);
  const osso = src.getObjectByName('spine_03');
  const p = osso.getWorldPosition(new THREE.Vector3());
  const alvo = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y - 0.12, p.z - 0.2),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)), new THREE.Vector3(1, 1, 1));
  costasCache = osso.matrixWorld.clone().invert().multiply(alvo);
  return costasCache;
}

export function weaponMesh(kind) { const w = makeWeapon(kind); w.userData.arma = kind; return w; }
export function shieldMesh(kind) { const s = makeShield(kind); s.userData.shield = true; return s; }

// ---------------------------------------------------------------- a armadura fundida
//
// O DESEMPENHO (03/10/2026): cada boneco tinha ~84 malhas soltas (os blocos dos
// `traje-*.json`, presos aos ossos), e com 19 inimigos e 16 cadáveres eram ~2.700
// das ~3.500 malhas da cena — uma chamada de desenho cada, repetida 6 vezes pela
// sombra da tocha. Aqui elas viram UMA malha por tipo de material, sem mudar
// nada do que se vê:
//
//   • a COR de cada bloco vai para os vértices (o shader já multiplica a cor do
//     material pela do vértice — branco × cor do vértice = a cor de antes), e
//     blocos de materiais iguais em tudo menos a cor passam a dividir um;
//   • os blocos de TODOS os ossos entram numa `SkinnedMesh` só, cada vértice
//     preso ao seu osso com peso 1 — o mesmo jeito do corpo do boneco. A posição
//     guardada é `inv(osso(T) · inversoDoOsso) · bloco(T) · p`, então em qualquer
//     pose o bloco vai para `osso(agora) · inv(osso(T)) · bloco(T) · p`: exatamente
//     o que um filho rígido do osso faria.
//
// Fica de fora o que muda sozinho depois: o material dos OLHOS (o Carrasco
// acende, o cadáver apaga), o que é transparente, e as armas (presas depois).
function assinaturaDoMaterial(m) {
  return [m.type, m.map?.uuid, m.normalMap?.uuid, m.roughnessMap?.uuid, m.metalnessMap?.uuid, m.emissiveMap?.uuid,
    m.envMap?.uuid, m.roughness, m.metalness, m.emissive?.getHex(), m.emissiveIntensity, m.envMapIntensity,
    m.side, m.flatShading, m.alphaTest, m.opacity, m.transparent].join('|');
}

function fundirTraje(scene, corpo) {
  const esqueleto = corpo.skeleton;
  scene.updateMatrixWorld(true);
  const olho = scene.userData.eyeMat;
  const grupos = new Map();
  scene.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || !o.visible || Array.isArray(o.material) || !o.material?.color) return;
    if (o.material === olho || o.material.transparent) return;
    let osso = o.parent;
    while (osso && !osso.isBone) osso = osso.parent;
    const i = osso ? esqueleto.bones.indexOf(osso) : -1;
    if (i < 0) return;
    // algum ancestral escondido: o bloco não aparece hoje, e não deve aparecer fundido
    for (let a = o.parent; a && a !== scene; a = a.parent) if (!a.visible) return;
    const k = assinaturaDoMaterial(o.material);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push({ o, i });
  });
  const _m = new THREE.Matrix4();
  for (const lista of grupos.values()) {
    if (lista.length < 2) continue;   // um bloco sozinho não ganha nada fundido
    const comUV = lista.some(({ o }) => o.geometry.attributes.uv);
    const geos = [];
    for (const { o, i } of lista) {
      let g = o.geometry.clone();
      for (const nome of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(nome)) g.deleteAttribute(nome);
      g.morphAttributes = {};
      if (g.index) g = g.toNonIndexed();
      const n = g.attributes.position.count;
      if (!g.attributes.normal) g.computeVertexNormals();
      if (comUV && !g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      // a cor do material para os vértices (multiplicando a que o bloco já tiver)
      const c = o.material.color, cor = new Float32Array(n * 3), antes = g.attributes.color;
      for (let v = 0; v < n; v++) {
        cor[v * 3] = c.r * (antes ? antes.getX(v) : 1);
        cor[v * 3 + 1] = c.g * (antes ? antes.getY(v) : 1);
        cor[v * 3 + 2] = c.b * (antes ? antes.getZ(v) : 1);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(cor, 3));
      // a posição no espaço de ligação do osso (ver o comentário acima)
      _m.multiplyMatrices(esqueleto.bones[i].matrixWorld, esqueleto.boneInverses[i]).invert().multiply(o.matrixWorld);
      g.applyMatrix4(_m);
      const idx = new Uint16Array(n * 4), peso = new Float32Array(n * 4);
      for (let v = 0; v < n; v++) { idx[v * 4] = i; peso[v * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(peso, 4));
      geos.push(g);
    }
    const geo = mergeGeometries(geos);
    if (!geo) continue;   // atributos que não casam: deixa os blocos como estavam
    const mat = lista[0].o.material.clone();
    mat.color.setRGB(1, 1, 1);
    mat.vertexColors = true;
    const malha = new THREE.SkinnedMesh(geo, mat);
    malha.castShadow = lista.some(({ o }) => o.castShadow);
    malha.receiveShadow = lista.some(({ o }) => o.receiveShadow);
    malha.bind(esqueleto, new THREE.Matrix4());
    // o boneco deitado (cadáver, morte) passa da esfera da pose T: uma folgada
    malha.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.4);
    malha.frustumCulled = corpo.frustumCulled;
    scene.add(malha);
    for (const { o } of lista) {
      // uma peça pode ser PAI de outra (o editor deixa): a filha fica, no mesmo lugar
      for (const filha of [...o.children]) o.parent.attach(filha);
      o.removeFromParent();
    }
  }
}
