import { ITEMS } from './items.js';
import { RECEITAS } from './receitas.js';
import { req } from './rede/supabase.js';
import { temSaveEmArquivo } from './hospedagem.js';
import { CELL, NASCER } from './world.js';
import { FICHA, LUGARES } from './ficha.js';

// Progresso do jogador. Os inimigos comuns NÃO entram: eles renascem a cada
// fogueira, então continuar é como acordar depois de um descanso. O que fica é
// o que o jogador conquistou — atributos, almas, itens, portas, baús, tochas, chefes.
//
// ONDE MORA (01/10/2026: um save POR CONTA):
//   • sem conta  → `saves/progresso.json` (rota `/__save` do server.js);
//   • com conta  → `saves/conta-<id>.json` E `masmorra.saves` na nuvem, para
//     continuar de outro computador. Ao abrir, vence o MAIS NOVO dos dois
//     (`salvoEm`). Local grava sempre (é barato); a nuvem no máximo a cada
//     `NUVEM_MS`, ou na hora em momentos marcantes (fogueira, chefe, fechar).
//   • o primeiro login num computador que tem um save SEM conta e nenhum da
//     conta ADOTA aquele save — é o progresso de quem jogava antes de ter conta.
//
// SEM O NOSSO SERVIDOR (02/10/2026: o jogo no GitHub Pages, ver `hospedagem.js`)
// não existe `/__save`: o "local" passa a ser o `localStorage` do navegador, com
// as mesmas regras (um por conta, um sem conta, vence o mais novo, adoção). Lá o
// endereço da página é fixo, então o motivo de o save ser arquivo — o launcher
// subir o jogo em outra porta, e cada porta ter o seu `localStorage` — não vale.
const URL_SAVE = '/__save';
const VERSAO = 1;
// A REVISÃO DO MAPA em que o save foi gravado (`jogador.mapa`). Na 2 (03/10/2026)
// a MATA abriu 14 colunas entre a floresta e o acampamento: tudo da coluna 26 em
// diante andou 84 m para leste. Save sem ela é de antes — ver `aplicarProgresso`.
const MAPA_REV = 2;
const MATA_X = 25.5 * CELL, MATA_ANDOU = 14 * CELL;
const NUVEM_MS = 60_000;
let ultimaNuvem = 0;

const urlLocal = (conta) => (conta ? `${URL_SAVE}?conta=${encodeURIComponent(conta)}` : URL_SAVE);
const valido = (d) => (d?.versao === VERSAO ? d : null);
/**
 * O save é da FICHA de agora (ficha.js `FICHA`: a revisão das regras de nível e
 * atributos)? Save de outra revisão NÃO é aberto — o personagem recomeça do zero e o
 * save novo grava por cima. É o reset de todos os jogadores (04/10/2026: a ficha 2).
 * Não é "falhou em ler": o save foi lido, e é de propósito que ele não vale mais.
 */
export const fichaAtual = (d) => (d?.jogador?.ficha === FICHA ? d : null);
const chaveNavegador = (conta) => `masmorra:save:${conta ?? 'sem-conta'}`;

async function lerLocal(conta) {
  if (!temSaveEmArquivo()) {
    try { return fichaAtual(valido(JSON.parse(localStorage.getItem(chaveNavegador(conta))))); } catch { return null; }
  }
  try {
    const r = await fetch(urlLocal(conta), { cache: 'no-store' });
    return r.ok ? fichaAtual(valido(await r.json())) : null;
  } catch { return null; }
}

async function lerNuvem(conta) {
  const r = await req(`saves?select=dados&dono=eq.${encodeURIComponent(conta)}`);
  return r.ok && Array.isArray(r.dados) ? fichaAtual(valido(r.dados[0]?.dados)) : null;
}

/**
 * Lê o progresso de quem está jogando (`online.contaId`, ou ninguém).
 * Devolve `{dados, origem}` — origem: 'local' | 'nuvem' | 'adotado' — ou null.
 */
export async function lerProgresso(online) {
  const conta = online?.contaId ?? null;
  if (!conta) { const d = await lerLocal(null); return d ? { dados: d, origem: 'local' } : null; }
  const [local, nuvem] = await Promise.all([lerLocal(conta), online.ativo ? lerNuvem(conta) : null]);
  if (local || nuvem) {
    const maisNovo = !nuvem || (local && local.salvoEm >= nuvem.salvoEm) ? local : nuvem;
    return { dados: maisNovo, origem: maisNovo === local ? 'local' : 'nuvem' };
  }
  const semConta = await lerLocal(null);
  return semConta ? { dados: semConta, origem: 'adotado' } : null;
}

export async function apagarProgresso(online) {
  const conta = online?.contaId ?? null;
  if (temSaveEmArquivo()) await fetch(urlLocal(conta), { method: 'DELETE' }).catch(() => {});
  else { try { localStorage.removeItem(chaveNavegador(conta)); } catch { } }
  if (conta && online.ativo) await req(`saves?dono=eq.${encodeURIComponent(conta)}`, { method: 'DELETE' });
}

/**
 * Grava agora. `aoSair`: a página está fechando (sendBeacon para o local,
 * fetch `keepalive` para a nuvem — os dois sobrevivem ao fechamento).
 * `nuvem`: manda para a nuvem já, sem esperar o intervalo.
 */
export function salvarProgresso(game, { aoSair = false, nuvem = false } = {}) {
  // No duelo nada é de verdade (posição na arena, itens que voltam no fim): não grava
  // nem no mundo de outro (co-op): as portas e a névoa de lá não são as suas
  if (game.state !== 'playing' || game.sessao?.duelo || (game.marionetes && game.regras.visitaSoAjuda)) return;
  // MUNDO ONLINE: o personagem só existe no servidor de mundo (`rede/mundo.js`) —
  // nada de arquivo local nem de `masmorra.saves`, que são da Jornada.
  if (game.modo === 'mmo') return game.sessao?.salvar(coletar(game), { aoSair, nuvem });
  const online = game.online, conta = online?.contaId ?? null;
  const dados = coletar(game);
  const txt = JSON.stringify(dados);
  let local;
  if (!temSaveEmArquivo()) {
    // gravar no navegador é na hora: não há pedido para sobreviver ao fechamento
    try { localStorage.setItem(chaveNavegador(conta), txt); } catch (e) { console.warn('Não consegui salvar o progresso no navegador:', e); }
  } else if (aoSair && navigator.sendBeacon) navigator.sendBeacon(urlLocal(conta), new Blob([txt], { type: 'application/json' }));
  else {
    local = fetch(urlLocal(conta), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: txt })
      .catch((e) => console.warn('Não consegui salvar o progresso:', e));
  }
  if (conta && online.ativo && (aoSair || nuvem || Date.now() - ultimaNuvem > NUVEM_MS)) {
    ultimaNuvem = Date.now();
    req('saves', { method: 'POST', body: { dono: conta, dados, salvo_em: dados.salvoEm }, prefer: 'resolution=merge-duplicates', keepalive: aoSair })
      .then((r) => { if (!r.ok) console.warn('[save] nuvem recusou:', r.error); });
  }
  return local;
}

export function coletar(game) {
  const p = game.player, inv = game.inventory, w = game.world;
  // Morto (entre cair e renascer): grava como se já tivesse renascido,
  // com as almas na mancha de sangue — fechar o jogo não as devolve.
  let almas = p.souls, mancha = w.bloodstain ? { x: w.bloodstain.pos.x, z: w.bloodstain.pos.z, almas: w.bloodstain.souls } : null;
  if (p.dead && game.deathPos) { mancha = almas > 0 ? { x: game.deathPos.x, z: game.deathPos.z, almas } : mancha; almas = 0; }
  // Posição só fora de luta de chefe: no meio dela, volta para a fogueira
  const pos = p.dead || game.bossFight || p.inArena ? null : { x: p.pos.x, y: p.pos.y, z: p.pos.z, rumo: p.facing };
  return {
    versao: VERSAO,
    salvoEm: new Date().toISOString(),
    jogador: {
      ficha: FICHA,   // a revisão das regras (ficha.js): save de outra não é aberto
      nivel: p.level, vigor: p.vigor, endurance: p.endurance, strength: p.strength,
      almas, vida: p.dead ? null : Math.ceil(p.hp), pos,
      fogueira: p.fogueira,
      mapa: MAPA_REV,
      nascer: NASCER.chave,   // onde ficava a tag `nascer` quando gravou (ver aplicarProgresso)
      receitas: [...p.receitas],   // as descobertas na panela   // onde renasce (save de antes das duas fogueiras não tem: é a da masmorra)
    },
    inventario: {
      itens: [...inv.items.entries()],
      equipado: { weapon: inv.equipped.weapon, left: inv.equipped.left, rings: [...inv.equipped.rings], armadura: { ...inv.equipped.armadura } },
      ultimoEscudo: inv.lastShield, tocha: inv.torchTime,
      cinto: [...inv.belt], cintoIdx: inv.beltIdx,
    },
    mundo: {
      fogueiraAcesa: game.fogueirasAcesas.has('masmorra'),   // o campo de antes das duas fogueiras
      fogueiras: [...game.fogueirasAcesas],
      chaveCaiu: !!w.chaveCaiu || !!w.fallingKey,
      portas: w.doors.map((d) => d.open),
      baus: w.chests.map((c) => c.open),
      tochas: w.torches.map((t) => t.lit),
      itensNoChao: w.pickups.map((x) => ({ id: x.itemId, qtd: x.qty, x: x.pos.x, z: x.pos.z, fixo: x.persistent })),
      mancha,
      carrascoVencido: game.boss.defeated,
      dragaoVencido: game.dragao.defeated,
    },
  };
}

/** Põe o mundo e o jogador no estado salvo. Roda na tela de título, antes de `start`. */
export function aplicarProgresso(game, s) {
  const p = game.player, inv = game.inventory, w = game.world, m = s.mundo, j = s.jogador;
  // No MUNDO ONLINE o save é do PERSONAGEM: baús, tochas, itens e a mancha são
  // dele; portas, névoa e chefes são do mundo de todos e vêm de quem o simula.
  const doMundo = game.modo !== 'mmo';
  const existe = (id) => id && ITEMS[id];
  // Save de antes da mata (MAPA_REV): o que estava do acampamento para lá andou junto
  const deAntesDaMata = !(j.mapa >= MAPA_REV);
  const andou = (x) => (deAntesDaMata && x > MATA_X ? x + MATA_ANDOU : x);

  // Inventário
  inv.items.clear();
  for (const [id, n] of s.inventario.itens ?? []) if (existe(id)) inv.items.set(id, n);
  // O ESTUS SAIU DO JOGO (03/10/2026): quem o tinha ganha comida no lugar, e ela
  // entra no cinto onde o frasco estava
  const tinhaEstus = (s.inventario.itens ?? []).some(([id]) => id === 'estus');
  if (tinhaEstus) inv.items.set('paoDuro', Math.min(ITEMS.paoDuro.max, (inv.items.get('paoDuro') ?? 0) + 5));
  const eq = { weapon: null, left: null, rings: [null, null], ...s.inventario.equipado };
  inv.equipped.weapon = existe(eq.weapon) ? eq.weapon : null;
  inv.equipped.left = existe(eq.left) ? eq.left : null;
  inv.equipped.rings = eq.rings.map((r) => (existe(r) ? r : null));
  // a armadura: cada lugar só aceita peça daquele lugar, e que esteja no inventário
  for (const l of LUGARES) {
    const id = eq.armadura?.[l];
    inv.equipped.armadura[l] = existe(id) && ITEMS[id].lugar === l && inv.items.has(id) ? id : null;
  }
  inv.lastShield = existe(s.inventario.ultimoEscudo) ? s.inventario.ultimoEscudo : null;
  inv.torchTime = s.inventario.tocha ?? 0;
  inv.belt = [0, 1, 2, 3].map((i) => {
    const id = s.inventario.cinto?.[i] === 'estus' ? 'paoDuro' : s.inventario.cinto?.[i];
    return existe(id) && inv.items.has(id) ? id : null;
  });
  inv.beltIdx = s.inventario.cintoIdx ?? 0;
  if (!inv.belt[inv.beltIdx]) inv.cycleQuick();

  // Atributos
  p.level = j.nivel; p.vigor = j.vigor; p.endurance = j.endurance; p.strength = j.strength;
  p.receitas = new Set((Array.isArray(j.receitas) ? j.receitas : []).filter((id) => typeof id === 'string' && RECEITAS.some((r) => r.id === id)));
  p.souls = j.almas;
  game.ui.displaySouls = j.almas;

  // Mundo
  game.fogueirasAcesas = new Set(Array.isArray(m.fogueiras) ? m.fogueiras.filter((id) => typeof id === 'string') : m.fogueiraAcesa ? ['masmorra'] : []);
  w.chaveCaiu = m.chaveCaiu;
  (doMundo ? m.portas ?? [] : []).forEach((aberta, i) => {
    const d = w.doors[i];
    if (!aberta || !d) return;
    w.openDoor(d);
    d.t = 1;
    if (d.door) d.door.rotation.y = -1.7;
  });
  (m.baus ?? []).forEach((aberto, i) => {
    const c = w.chests[i];
    if (!aberto || !c) return;
    w.openChest(c);
    c.t = 1;
    if (c.lid) c.lid.rotation.x = -1.25;
  });
  (m.tochas ?? []).forEach((acesa, i) => { if (!acesa && w.torches[i]) w.takeTorch(w.torches[i]); });
  for (const x of [...w.pickups]) w.removePickup(x);
  for (const x of m.itensNoChao ?? []) if (existe(x?.id) && Number.isFinite(x.x) && Number.isFinite(x.z)) w.addPickup(x.id, x.qtd, { x: andou(x.x), z: x.z }, x.fixo);
  if (m.mancha) w.setBloodstain({ x: andou(m.mancha.x), z: m.mancha.z }, m.mancha.almas);

  if (doMundo && m.carrascoVencido) {
    game.boss.defeated = true;
    game.boss.sleep();
    w.openFog();
    w.fog.mat.uniforms.opacity.value = 0;   // some já, sem o esmaecer
  }
  if (doMundo && m.dragaoVencido) {
    game.dragao.defeated = true;
    game.dragao.sleep();
  }

  p.refreshEquipment();

  // Onde acordar: onde estava, ou na última fogueira em que descansou
  p.fogueira = w.fogueira(j.fogueira).id;
  // De antes da mata, renasce no acampamento NOVO: no Mundo online, todos (é lá que
  // se nasce); na Jornada, quem estava do acampamento para lá
  let pos = j.pos;
  if (deAntesDaMata && (!doMundo || (pos && pos.x > MATA_X))) {
    p.fogueira = w.fogueira('acampamento').id;
    pos = null;
  }
  // A TAG `nascer` do mapa mudou desde que gravou (o mapa foi editado e o ponto de
  // nascer foi para outro lugar): no Mundo online todos acordam no novo
  if (!doMundo && typeof j.nascer === 'string' && j.nascer !== NASCER.chave) {
    p.fogueira = w.fogueira(NASCER.id).id;
    pos = null;
  }
  // e, em qualquer modo, um lugar salvo que virou ROCHA numa edição do mapa não vale
  if (pos && !(Number.isFinite(pos.x) && Number.isFinite(pos.z) && w.isFloor(...w.cellOf(pos)))) pos = null;
  p.respawn();
  if (pos) {
    p.pos.set(pos.x, pos.y, pos.z);
    p.pos.y = w.alturaChao(p.pos);
    p.facing = pos.rumo ?? Math.PI;
    p.camYaw = p.facing;
  }
  if (j.vida != null) p.hp = Math.min(p.maxHp, Math.max(1, j.vida));
}
