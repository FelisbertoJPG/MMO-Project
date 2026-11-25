import * as THREE from 'three';

/**
 * A ANIMAÇÃO DA HIDRA (25/11/2026; saiu do js/hidra.js): os ossos pelo nome e cada osso a partir da pose de ligação, pela POSE que o
 * cérebro diz (js/inimigos/hidra.js: POSES_DA_HIDRA) e pelo que é só enfeite. Só usa o three — sem o jogo — para o editor de cenas
 * importar: a aba Esqueleto toca as animações da hidra com ela, e o que se vê lá é o que o jogo faz.
 */

/** O PÉ NO ALTO (rad, com o pé todo erguido): a coxa sobe para fora até o joelho chegar perto da altura do
 *  quadril, a canela volta e fica pendurada, o pé pende; o corpo pende para o outro lado. */
export const ERGUER = { coxa: 1.3, canela: -1.0, pe: -0.3, corpo: 0.1 };
/** AS BOCAS (a bocarra vertical de cada cabeça, por baixo do chapéu): o osso `boca<k>` escalado — 0 = fechada
 *  (os lábios e os dentes se encostam), 1 = escancarada. Em repouso ficam semiabertas e respiram; abrem tudo
 *  quando a cabeça EMPINA (o cuspe, o rugido: a pose `cab` > 0), um pouco no pisão; dormindo, quase fechadas. */
export const BOCA = { dormindo: 0.08, repouso: 0.35, pisao: 0.6, morta: 0.7, largura: [0.3, 0.85], altura: [0.8, 0.3] };
/** A MANDÍBULA DE BAIXO (`mandibula<k>`, filha da cabeça; 25/11/2026) — com `quem.comMandibulas` (o editor e, desde 25/11/2026 à noite,
 *  o corpo do jogo; sem ele, fica como o modelo veio e a boca escala).
 *  - COM a de CIMA (`maxila<k>`, as duas com `ponta` — o .glb as traz em `userData.ponta`): o modelo já vem de boca ABERTA; `s` = o
 *    quanto a de baixo foi para a de cima (0 como veio, 1 fechada: o giro até o queixo apontar para a ponta de cima, ou o ENCAIXE —
 *    `fecha`, medido no ossosDaHidra). A BOCA VIVA: parada, ela sobe e desce até `respira` (o do osso — `userData.respira`, do config —,
 *    senão `MANDIBULA.respira`), devagar; some quando a cabeça empina para atacar. A boca não escala (as mandíbulas fazem por ela).
 *  - SEM a de cima: abre `abre` rad além do modelo com a boca escancarada, e a boca escala. */
export const MANDIBULA = { abre: 0.45, respira: 0.1 };

/** a mandíbula de baixo `m` na fração `s` do caminho até a de cima (0 = como o modelo veio, 1 = fechada): o giro ou o encaixe */
export function porFechamento(m, fecha, s) {
  if (typeof fecha === 'number') { m.rotation.set(fecha * s, 0, 0); return; }
  m.position.copy(fecha.pos0).addScaledVector(fecha.anda, s);
  m.quaternion.identity().slerp(fecha.gira, s);
}

/** onde o osso está na pose de ligação, no espaço da malha (a pose de ligação do rigar.mjs não gira nada: a soma das posições) */
function naLigacao(b) {
  const v = b.position.clone();
  for (let p = b.parent; p?.isBone; p = p.parent) v.add(p.position);
  return v;
}
/** o giro em x (rad) que leva o queixo (a ponta da de baixo) a apontar, da articulação dela, para a ponta da de cima — ou null.
 *  Com `fecha: "encaixe"` no osso de baixo (o .glb: `userData.fecha`; 25/11/2026, o dono: "pega a mandíbula de baixo + o queixo e
 *  move até a mandíbula de cima, meio estático"): em vez do giro, o ENCAIXE — { pos0, anda, gira }: fechada, a articulação de baixo
 *  vai até a de cima (`anda`, no espaço da cabeça) e o osso se alinha com o de cima (`gira`), a peça inteira como um bloco.
 *  Exportada: a aba Esqueleto do editor a chama a cada quadro (o bloco da de baixo fechada, ao vivo, enquanto as juntas se movem) */
export function fechamentoDaBoca(baixo, cima) {
  const C = baixo?.userData.ponta, U = cima?.userData.ponta;
  if (!C || !U) return null;
  if (baixo.userData.fecha === 'encaixe') {
    const Hb = naLigacao(baixo), Hc = naLigacao(cima);
    const de = new THREE.Vector3().fromArray(C).sub(Hb).normalize(), para = new THREE.Vector3().fromArray(U).sub(Hc).normalize();
    return { pos0: baixo.position.clone(), anda: Hc.sub(Hb), gira: new THREE.Quaternion().setFromUnitVectors(de, para) };
  }
  const H = naLigacao(baixo), y1 = C[1] - H.y, z1 = C[2] - H.z, y2 = U[1] - H.y, z2 = U[2] - H.z;
  return Math.atan2(y1 * z2 - z1 * y2, y1 * y2 + z1 * z2);
}

/**
 * OS OSSOS da hidra pelo nome (os do rigar.mjs; faltando um, aquela parte só não se mexe) e o eixo de erguer de cada perna.
 * Exportada (25/11/2026): o editor de cenas monta os mesmos para tocar as animações na aba Esqueleto.
 */
export function ossosDaHidra(bones, cfg) {
  const osso = (n) => bones.find((b) => b.name === n) ?? null;
  const mandibulas = cfg.bocas.map((_, k) => osso(`mandibula${k}`)), maxilas = cfg.bocas.map((_, k) => osso(`maxila${k}`));
  return {
    raiz: osso('raiz'), tronco: osso('tronco'),
    cabecas: cfg.bocas.map((_, k) => ['a', 'b', 'c'].map((s) => osso(`pescoco${k}${s}`)).concat([osso(`cabeca${k}`)])),
    bocas: cfg.bocas.map((_, k) => osso(`boca${k}`)),
    mandibulas, maxilas,
    // (o giro que fecha a de baixo até a de cima, medido nas juntas como estão agora — chame com o esqueleto na pose de ligação)
    fecha: mandibulas.map((m, k) => fechamentoDaBoca(m, maxilas[k])),
    pernas: cfg.pes.map(([x, z], k) => {
      // o eixo de erguer: deitado, de lado para a perna — gira o pé PARA FORA e para cima
      const fora = new THREE.Vector3(x, 0, z).normalize();
      return { coxa: osso(`coxa${k}`), canela: osso(`canela${k}`), pe: osso(`pe${k}`), eixo: new THREE.Vector3(-fora.z, 0, fora.x) };
    }),
  };
}

/**
 * A ANIMAÇÃO: cada osso a partir da pose de ligação (o rigar.mjs não gira nenhum: a pose de ligação é o zero), pela POSE `a` do
 * cérebro e pelo que é só enfeite. `quem` anima — o corpo da hidra, ou o editor —: lê `state`, `dead`, `passo` e `arrastar` e
 * escreve em `aberturas` (o quanto cada boca está aberta, seguido devagar). `t` = o relógio (s). Exportada (25/11/2026): a aba
 * Esqueleto do editor de cenas a chama com as poses de POSES_DA_HIDRA, e o que se vê lá é o que o jogo faz.
 */
export function animarHidra(O, a, quem, t, dt) {
  const acordada = quem.state !== 'dormant';
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
    const empina = Math.max(0, Math.min(1, a.cab[k] ?? 0));
    // (`quem.abrir[k]`, se houver, manda a abertura de fora — o editor, para ver a boca abrir e fechar; no jogo não há)
    const deFora = quem.abrir?.[k];
    let alvo = deFora ?? (quem.state === 'dormant' ? BOCA.dormindo : quem.dead ? BOCA.morta : BOCA.repouso + (1 - BOCA.repouso) * empina);
    if (deFora == null && quem.state === 'pisao') alvo = Math.max(alvo, BOCA.pisao);
    if (deFora == null && !quem.dead && quem.state !== 'dormant') alvo += Math.sin(t * 1.1 + k * 1.9) * 0.05;   // respira
    const ab = quem.aberturas[k] = THREE.MathUtils.lerp(quem.aberturas[k], alvo, Math.min(1, dt * 8));
    // AS MANDÍBULAS só se mexem com `quem.comMandibulas`: o editor o liga, e o corpo do jogo também (25/11/2026, o dono: "pode subir pra
    // jogo com a animação de living"; antes ficava só no editor). Sem ele, elas ficam como o modelo veio e a boca abre escalando
    const m = O.mandibulas[k], fecha = quem.comMandibulas ? O.fecha[k] : null;
    if (fecha == null) {
      boca?.scale.set(BOCA.largura[0] + BOCA.largura[1] * ab, BOCA.altura[0] + BOCA.altura[1] * ab, 1);
      if (quem.comMandibulas) m?.rotation.set(ab * MANDIBULA.abre, 0, 0);   // (sem a de cima: +x, o queixo, à frente, desce)
    } else {
      // (as duas mandíbulas: `s` = o quanto a de baixo foi para a de cima — 0 como o modelo veio, 1 fechada nela. De fora (o editor), o
      // `abrir`; senão, a BOCA VIVA: sobe e desce um pouco, o `respira` do osso, e some quando a cabeça empina para atacar)
      boca?.scale.set(1, 1, 1);
      const s = deFora != null ? 1 - deFora : quem.dead ? 0
        : (m.userData.respira ?? MANDIBULA.respira) * (0.5 - 0.5 * Math.cos(t * (quem.state === 'dormant' ? 0.6 : 1.1) + k * 1.9)) * (1 - empina);
      porFechamento(m, fecha, s);
    }
  });
  // as PERNAS: o pé da pose sobe (coxa para fora e para cima, a canela devolve, o pé pende); as outras
  // arrastam um pouco quando ela gira no lugar
  O.pernas.forEach(({ coxa, canela, pe, eixo }, k) => {
    const arrasta = a.pe.some((x) => x > 0.05) ? 0 : Math.max(0, Math.sin(quem.passo + k * Math.PI / 2)) * 0.15 * quem.arrastar;
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
