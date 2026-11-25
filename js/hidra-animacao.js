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
/** A MANDÍBULA (`mandibula<k>`, filha da cabeça; 25/11/2026): abre junto com a boca, girando o queixo para baixo em volta da
 *  articulação — `abre` rad com a boca escancarada (a mesma abertura da boca: semiaberta em repouso, toda no cuspe). */
export const MANDIBULA = { abre: 0.45 };

/**
 * OS OSSOS da hidra pelo nome (os do rigar.mjs; faltando um, aquela parte só não se mexe) e o eixo de erguer de cada perna.
 * Exportada (25/11/2026): o editor de cenas monta os mesmos para tocar as animações na aba Esqueleto.
 */
export function ossosDaHidra(bones, cfg) {
  const osso = (n) => bones.find((b) => b.name === n) ?? null;
  return {
    raiz: osso('raiz'), tronco: osso('tronco'),
    cabecas: cfg.bocas.map((_, k) => ['a', 'b', 'c'].map((s) => osso(`pescoco${k}${s}`)).concat([osso(`cabeca${k}`)])),
    bocas: cfg.bocas.map((_, k) => osso(`boca${k}`)),
    mandibulas: cfg.bocas.map((_, k) => osso(`mandibula${k}`)),
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
    let alvo = quem.state === 'dormant' ? BOCA.dormindo : quem.dead ? BOCA.morta : BOCA.repouso + (1 - BOCA.repouso) * empina;
    if (quem.state === 'pisao') alvo = Math.max(alvo, BOCA.pisao);
    if (!quem.dead && quem.state !== 'dormant') alvo += Math.sin(t * 1.1 + k * 1.9) * 0.05;   // respira
    const ab = quem.aberturas[k] = THREE.MathUtils.lerp(quem.aberturas[k], alvo, Math.min(1, dt * 8));
    boca?.scale.set(BOCA.largura[0] + BOCA.largura[1] * ab, BOCA.altura[0] + BOCA.altura[1] * ab, 1);
    O.mandibulas[k]?.rotation.set(ab * MANDIBULA.abre, 0, 0);   // (+x: o queixo, à frente, desce)
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
