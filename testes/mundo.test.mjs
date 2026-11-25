// Testes do SERVIDOR DE MUNDO (servidor-mundo.mjs), por HTTP, com o servidor de
// verdade num processo à parte — é o único lugar em que rota, cano e disco se
// encontram.
//
//   node testes/mundo.test.mjs
//
// O que erra CALADO num servidor destes, e por isso está aqui:
//   • recado indo para quem não devia (um `dano` que chega a todos mata o grupo
//     inteiro; um `golpe` que chega a todos não fere ninguém);
//   • dois simuladores ao mesmo tempo, ou nenhum (os inimigos param para todos);
//   • o save que grava pela metade, ou que aceita qualquer coisa;
//   • os dados saindo pelo servidor estático.
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORTA = 58731;
const BASE = `http://127.0.0.1:${PORTA}`;
const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), 'mundo-teste-'));
const MAPA = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets', 'mapa.json'), 'utf8')).ativo;
/** A versão do protocolo (`VERSAO_MUNDO` do servidor). */
const V = 2;

let filho = null;
function subir(mais = {}) {
  filho = spawn(process.execPath, [path.join(RAIZ, 'server.js')], {
    env: { ...process.env, PORT: String(PORTA), MUNDO_AUTH: 'teste', MUNDO_DIR: PASTA, MUNDO_CARENCIA_MS: '400', MUNDO_SEM_MUNDO_MS: '700', ...mais },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  filho.stderr.on('data', (d) => process.stderr.write(`[servidor] ${d}`));
  return esperar(async () => (await fetch(`${BASE}/__mundo/info`)).ok, 5000);
}
const descer = () => new Promise((ok) => { if (!filho) return ok(); filho.once('exit', ok); filho.kill(); filho = null; });

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(cond, ms = 2000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try { if (await cond()) return true; } catch { }
    await dormir(30);
  }
  return false;
}

/** Fala com a lista de personagens do modo de teste: `{status, ...resposta}`. */
async function perfis(conta, corpo) {
  const r = await fetch(`${BASE}/__mundo/perfis`, { method: 'POST', body: JSON.stringify({ token: `teste:${conta}`, ...corpo }) });
  return { status: r.status, ...(await r.json()) };
}
/** O personagem `nome` da conta `conta` (cria na primeira vez). */
async function perfilDe(conta, nome = conta) {
  const achado = (await perfis(conta, { acao: 'listar' })).perfis.find((p) => p.nome === nome);
  if (achado) return achado;
  const r = await perfis(conta, { acao: 'criar', nome });
  assert.ok(r.ok, `criar ${nome}: ${r.erro}`);
  return r.perfil;
}
const pedirEntrada = (conta, personagem) => fetch(`${BASE}/__mundo/entrar`, { method: 'POST', body: JSON.stringify({ token: `teste:${conta}`, v: V, mapa: MAPA, personagem }) });

/** Um jogador de teste: entra com um personagem, ouve (guardando tudo o que chega) e fala. */
async function jogador(nome, conta = nome) {
  const perfil = await perfilDe(conta, nome);
  const r = await pedirEntrada(conta, perfil.id);
  const entrada = await r.json();
  assert.ok(entrada.ok, `entrar(${nome}): ${entrada.erro}`);
  const j = { nome, id: entrada.id, bilhete: entrada.bilhete, entrada, recados: [], fechado: false };
  const ctl = new AbortController();
  const resp = await fetch(`${BASE}/__mundo/ouvir?b=${j.bilhete}`, { signal: ctl.signal });
  assert.equal(resp.status, 200);
  (async () => {
    const leitor = resp.body.getReader(), dec = new TextDecoder();
    let resto = '';
    try {
      for (;;) {
        const { value, done } = await leitor.read();
        if (done) break;
        resto += dec.decode(value, { stream: true });
        let i;
        while ((i = resto.indexOf('\n\n')) >= 0) {
          const bloco = resto.slice(0, i); resto = resto.slice(i + 2);
          if (bloco.startsWith('data: ')) j.recados.push(JSON.parse(bloco.slice(6)));
        }
      }
    } catch { }
    j.fechado = true;
  })();
  j.falar = (evento, carga) => fetch(`${BASE}/__mundo/falar?b=${j.bilhete}`, { method: 'POST', body: JSON.stringify({ evento, carga }) });
  j.desligar = () => ctl.abort();
  j.de = (evento) => j.recados.filter((x) => x.evento === evento);
  j.ultimo = (evento) => j.de(evento).at(-1);
  j.chegou = (evento, cond = () => true, ms = 2000) => esperar(() => j.de(evento).some(cond), ms);
  assert.ok(await j.chegou('ola'), `${nome} não recebeu o ola`);
  return j;
}

const SAVE = () => ({
  versao: 1, salvoEm: '2020-01-01T00:00:00.000Z',
  jogador: { nivel: 3, vigor: 11, endurance: 10, strength: 11, almas: 420, vida: 200, pos: null, fogueira: 'acampamento' },
  inventario: { itens: [['dagger', 1], ['estus', 3]], equipado: { weapon: 'dagger', left: null, rings: [null, null] }, ultimoEscudo: null, tocha: 0, cinto: ['estus', null, null, null], cintoIdx: 0 },
  mundo: { baus: [], tochas: [], itensNoChao: [], mancha: null, fogueiras: ['acampamento'] },
});

let passaram = 0, falharam = 0;
async function teste(nome, fn) {
  try { await fn(); passaram++; console.log(`  ok  ${nome}`); }
  catch (e) { falharam++; console.log(`  FALHOU  ${nome}\n      ${String(e?.message ?? e).split('\n').join('\n      ')}`); }
}

console.log('\nMUNDO — o servidor do MMO\n');
assert.ok(await subir(), `o servidor não subiu na porta ${PORTA}`);

let ana, beto, caio;

await teste('/__mundo/info diz quem é, a versão e o mapa', async () => {
  const i = await (await fetch(`${BASE}/__mundo/info`)).json();
  assert.equal(i.quem, 'masmorra-do-carrasco');
  assert.equal(i.v, V);
  assert.equal(i.mapa, MAPA);
  assert.equal(i.jogadores, 0);
});

await teste('entrar RECUSA token ruim, versão errada e mapa errado', async () => {
  const tenta = async (corpo) => { const r = await fetch(`${BASE}/__mundo/entrar`, { method: 'POST', body: JSON.stringify(corpo) }); return [r.status, (await r.json()).ok]; };
  assert.deepEqual(await tenta({ token: 'teste:x', v: V, mapa: MAPA }), [400, false], 'nome curto demais');
  // token que o Supabase não conhece: 401. Sem internet para perguntar, 502 —
  // de um jeito ou de outro, NÃO entra (este é o único ponto do teste que usa a rede)
  const [status, entrou] = await tenta({ token: 'um-token-qualquer', v: V, mapa: MAPA });
  assert.ok((status === 401 || status === 502) && entrou === false, `token inventado: ${status}`);
  assert.deepEqual(await tenta({ token: 'teste:Ana', v: 999, mapa: MAPA }), [409, false], 'versão');
  assert.deepEqual(await tenta({ token: 'teste:Ana', v: V, mapa: 'outro-mapa' }), [409, false], 'mapa');
  assert.equal((await fetch(`${BASE}/__mundo/entrar`, { method: 'POST', body: 'isto não é json' })).status, 400);
});

await teste('sem bilhete (ou com um inventado) não se ouve, não se fala, não se salva', async () => {
  const falso = 'a'.repeat(48);
  for (const [rota, method] of [['ouvir', 'GET'], ['falar', 'POST'], ['personagem', 'GET'], ['personagem', 'POST'], ['sair', 'POST']]) {
    assert.equal((await fetch(`${BASE}/__mundo/${rota}`, { method })).status, 401, `${rota} sem bilhete`);
    assert.equal((await fetch(`${BASE}/__mundo/${rota}?b=${falso}`, { method })).status, 401, `${rota} com bilhete falso`);
  }
});

await teste('o primeiro a entrar vira o SIMULADOR; o segundo é avisado a todos', async () => {
  ana = await jogador('Ana');
  assert.equal(ana.entrada.personagem, null, 'personagem novo');
  assert.ok(await ana.chegou('sim', (r) => r.carga.id === ana.id), 'Ana não virou simuladora');
  beto = await jogador('Beto');
  assert.ok(await ana.chegou('entrou', (r) => r.carga.id === beto.id && r.carga.nome === 'Beto'), 'Ana não soube do Beto');
  const ola = beto.ultimo('ola').carga;
  assert.equal(ola.eu, beto.id);
  assert.equal(ola.simulador, ana.id, 'o Beto chega sabendo quem simula');
  assert.deepEqual(ola.jogadores.map((j) => j.nome).sort(), ['Ana', 'Beto']);
  assert.equal(beto.de('sim').filter((r) => r.carga.id === beto.id).length, 0, 'o Beto NÃO pode virar simulador com a Ana ativa');
});

await teste('pos vai para os OUTROS, com o remetente dito pelo servidor', async () => {
  await beto.falar('pos', { x: 1, z: 2, id: 'eu-minto-o-id' });
  assert.ok(await ana.chegou('pos', (r) => r.de === beto.id && r.carga.x === 1));
  await dormir(80);
  assert.equal(beto.de('pos').length, 0, 'o Beto recebeu o próprio eco');
});

await teste('ROTEAMENTO: golpe só ao simulador, dano só ao alvo, mundo só DO simulador', async () => {
  caio = await jogador('Caio');
  // golpe do Beto: chega só à Ana
  await beto.falar('golpe', { id: 'e3', dano: 17, n: 1 });   // (`n`: o número do ataque — regras-do-mundo.mjs)
  assert.ok(await ana.chegou('golpe', (r) => r.de === beto.id && r.carga.id === 'e3'));
  await dormir(80);
  assert.equal(caio.de('golpe').length, 0, 'o golpe vazou para o Caio');
  // dano da Ana para o Beto: chega só ao Beto
  await ana.falar('dano', { para: beto.id, dano: 30 });
  assert.ok(await beto.chegou('dano', (r) => r.carga.dano === 30));
  await dormir(80);
  assert.equal(caio.de('dano').length, 0, 'o dano vazou para o Caio');
  // dano de quem NÃO simula é descartado
  await beto.falar('dano', { para: caio.id, dano: 999 });
  // mundo de quem não simula é descartado; o da simuladora chega aos outros dois
  await beto.falar('mundo', { e: [['e0', 1, 0, 1, 0, null, 1, 10, 'idle', 5, 0, null]], falso: true });
  await ana.falar('mundo', { e: [['e0', 9, 0, 9, 0, null, 1, 70, 'idle', 5, 0, null]] });
  assert.ok(await beto.chegou('mundo', (r) => r.de === ana.id));
  assert.ok(await caio.chegou('mundo', (r) => r.de === ana.id));
  await dormir(80);
  assert.equal(caio.de('dano').length, 0, 'aceitou dano de quem não simula');
  assert.equal(caio.de('mundo').filter((r) => r.carga.falso).length, 0, 'aceitou mundo de quem não simula');
  assert.equal(ana.de('mundo').length, 0, 'a simuladora recebeu o próprio mundo');
});

// a fogueira do acampamento (a tag do mapa, [linha, coluna]; CELL = 6 m, o world.js), onde se acorda
const ACAMPAMENTO = (() => {
  const [l, c] = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets', 'mapa.json'), 'utf8')).marcos?.[MAPA]?.acampamento ?? [16, 47.5];
  return { x: c * 6 + 3.2, z: l * 6 };
})();

await teste('REGRAS: o passo rápido demais é CORTADO; acordar na fogueira vale de qualquer distância', async () => {
  // acordar na fogueira (o Beto estava na rocha do teste do pos, do outro lado do mapa) passa como veio
  await beto.falar('pos', { x: ACAMPAMENTO.x, z: ACAMPAMENTO.z });
  assert.ok(await ana.chegou('pos', (r) => r.de === beto.id && r.carga.x === ACAMPAMENTO.x), 'acordar na fogueira foi cortado');
  // 500 m de uma vez (pela estrada, para leste) não passam — anda só o que cabia
  const doBeto = () => ana.de('pos').filter((q) => q.de === beto.id), n0 = doBeto().length;
  await beto.falar('pos', { x: ACAMPAMENTO.x + 500, z: ACAMPAMENTO.z });
  assert.ok(await esperar(() => doBeto().length > n0, 2000), 'o pos cortado não chegou');
  const x = doBeto().at(-1).carga.x;
  assert.ok(x > ACAMPAMENTO.x && x < ACAMPAMENTO.x + 100, `o salto passou inteiro: x = ${x}`);
  // e de volta para casa (longe demais para o balde, mas é a fogueira)
  await beto.falar('pos', { x: ACAMPAMENTO.x, z: ACAMPAMENTO.z });
  assert.ok(await ana.chegou('pos', (r) => r.de === beto.id && r.carga.x === ACAMPAMENTO.x), 'voltar à fogueira foi cortado');
});

await teste('REGRAS: o passo que ATRAVESSA a parede não anda (o mapa lógico no servidor)', async () => {
  // a Sala da Fogueira da masmorra: acordar no fogo, andar até a parede de cima (célula 19,4)
  const [l, c] = JSON.parse(fs.readFileSync(path.join(RAIZ, 'assets', 'mapa.json'), 'utf8')).marcos?.[MAPA]?.masmorra ?? [20, 7];
  await beto.falar('pos', { x: c * 6, z: l * 6 + 2.6 });
  await beto.falar('pos', { x: 24.5, z: 114 });
  assert.ok(await ana.chegou('pos', (r) => r.de === beto.id && r.carga.x === 24.5 && r.carga.z === 114), 'o passo honesto até a parede foi cortado');
  const doBeto = () => ana.de('pos').filter((q) => q.de === beto.id);
  const tentar = async (x, z) => {
    const n0 = doBeto().length;
    await beto.falar('pos', { x, z });
    assert.ok(await esperar(() => doBeto().length > n0, 2000), 'o pos não chegou');
    return doBeto().at(-1).carga;
  };
  // parar DENTRO da rocha (a célula 18,4) não anda
  assert.equal((await tentar(24.5, 108)).z, 114, 'entrou na rocha');
  // a Sala da Guarda fica do outro lado da rocha: 12 m em linha reta, mas 8 células (~47 m) andando
  // pela porta — mais do que ele podia ter andado agora (o balde: ~25 m com o balanceamento de hoje)
  assert.equal((await tentar(24.5, 102)).z, 114, 'atravessou a parede');
  // e o caminho de verdade, pela PORTA (a célula 18,7; aberta ou fechada, conta como passagem), passa:
  // 21 m até a Sala da Guarda, 5 células andando — cabe no balde e no caminho
  await beto.falar('pos', { x: 42, z: 102 });
  assert.ok(await ana.chegou('pos', (r) => r.de === beto.id && r.carga.x === 42 && r.carga.z === 102), 'o caminho pela porta foi cortado');
  await ana.falar('mundo', { e: [] });   // (a simuladora segue falando)
});

await teste('REGRAS: golpe acima do teto da arma que está na mão NÃO chega ao simulador', async () => {
  await beto.falar('pos', { x: ACAMPAMENTO.x, z: ACAMPAMENTO.z, d: 'dagger', e: null });
  await beto.falar('golpe', { id: 'e7', dano: 900, poise: 10, n: 1 });   // absurdo
  await beto.falar('golpe', { id: 'e8', dano: 150, poise: 10, n: 1 });   // de espadão, com a adaga na mão (nível 1)
  await beto.falar('golpe', { id: 'e6', dano: 40, poise: 200, n: 1 });   // poise de quem não tem a arma
  await beto.falar('golpe', { id: 'e9', dano: 40, poise: 10, n: 1 });    // o de verdade
  assert.ok(await ana.chegou('golpe', (r) => r.carga.id === 'e9'), 'o golpe honesto não chegou');
  assert.equal(ana.de('golpe').filter((r) => ['e6', 'e7', 'e8'].includes(r.carga.id)).length, 0, 'golpe acima do teto chegou');
});

await teste('O VIGOR E O RITMO: golpe sem o número do ataque não passa, nem o mesmo ataque no mesmo inimigo duas vezes', async () => {
  await beto.falar('golpe', { id: 'f1', dano: 20, poise: 8 });                    // sem `n`
  await beto.falar('golpe', { id: 'f2', dano: 20, poise: 8, n: 1 });
  await beto.falar('golpe', { id: 'f2', dano: 20, poise: 8, n: 1 });              // o mesmo ataque, de novo
  await beto.falar('golpe', { id: 'f3', dano: 20, poise: 8, n: 1, pj: 'canhao' }); // projétil inventado
  assert.ok(await ana.chegou('golpe', (r) => r.carga.id === 'f2'), 'o golpe honesto não chegou');
  await dormir(80);
  assert.equal(ana.de('golpe').filter((r) => r.carga.id === 'f2').length, 1, 'o mesmo ataque acertou o mesmo inimigo duas vezes');
  assert.equal(ana.de('golpe').filter((r) => ['f1', 'f3'].includes(r.carga.id)).length, 0, 'passou golpe sem número (ou projétil inventado)');
  await ana.falar('mundo', { e: [] });   // (a simuladora segue falando: calada 2,5 s, o servidor a troca)
});

await teste('O VIGOR E O RITMO: ataque sem vigor ou rápido demais NÃO vale; a Seta e a bomba têm teto e ritmo', async () => {
  // 20 ataques de adaga de uma vez: nem pelo vigor mais generoso (120) dá — os últimos não valem
  await beto.falar('pos', { x: ACAMPAMENTO.x, z: ACAMPAMENTO.z, d: 'dagger', e: null, n: 21, r: 0 });
  await beto.falar('golpe', { id: 'g1', dano: 20, poise: 8, n: 21 });
  // a Seta: duas seguidas passam, a terceira não; a bomba acima do teto, não
  for (const id of ['s1', 's2', 's3']) await beto.falar('golpe', { id, dano: 40, poise: 20, fogo: true, pj: 'seta' });
  await beto.falar('golpe', { id: 's4', dano: 300, poise: 60, fogo: true, pj: 'bomba' });
  await beto.falar('golpe', { id: 's5', dano: 80, poise: 60, fogo: true, pj: 'bomba' });
  assert.ok(await ana.chegou('golpe', (r) => r.carga.id === 's5'), 'a bomba honesta não chegou');
  await dormir(80);
  const ids = ana.de('golpe').map((r) => r.carga.id);
  assert.ok(ids.includes('s1') && ids.includes('s2'), 'as duas primeiras Setas não chegaram');
  assert.ok(!ids.includes('g1'), 'golpe de ataque sem vigor passou');
  assert.ok(!ids.includes('s3'), 'a terceira Seta seguida passou');
  assert.ok(!ids.includes('s4'), 'bomba acima do teto passou');
  await ana.falar('mundo', { e: [] });
});

await teste('evento: do simulador vai a todos (ou ao `para`); dos outros, só o projétil', async () => {
  await ana.falar('evento', { tipo: 'almas', n: 50, para: beto.id });
  assert.ok(await beto.chegou('evento', (r) => r.carga.tipo === 'almas'));
  await ana.falar('evento', { tipo: 'chefe', nome: 'CARRASCO' });
  assert.ok(await caio.chegou('evento', (r) => r.carga.tipo === 'chefe'));
  await beto.falar('evento', { tipo: 'almas', n: 99999 });
  await beto.falar('evento', { tipo: 'proj', k: 'bomb' });
  assert.ok(await caio.chegou('evento', (r) => r.carga.tipo === 'proj' && r.de === beto.id));
  await dormir(80);
  assert.equal(caio.de('evento').filter((r) => r.carga.tipo === 'almas').length, 0, 'almas vazaram (do `para` ou de quem não simula)');
  // acao (abrir porta…) de quem não simula vai só ao simulador
  await caio.falar('acao', { tipo: 'porta', i: 1 });
  assert.ok(await ana.chegou('acao', (r) => r.de === caio.id && r.carga.i === 1));
  assert.equal(beto.de('acao').length, 0);
});

await teste('voz (a sinalização do chat de voz) vai SÓ ao `para`, de qualquer um, e nunca volta a quem mandou', async () => {
  // quem não simula também fala (a voz não é do simulador)
  await caio.falar('voz', { para: beto.id, t: 'oferta', sdp: 'v=0' });
  assert.ok(await beto.chegou('voz', (r) => r.de === caio.id && r.carga.t === 'oferta'));
  await beto.falar('voz', { para: caio.id, t: 'resposta', sdp: 'v=0' });
  assert.ok(await caio.chegou('voz', (r) => r.de === beto.id && r.carga.t === 'resposta'));
  // sem `para`, para si mesmo ou para quem não está no mundo: não vai a ninguém
  await caio.falar('voz', { t: 'ice' });
  await caio.falar('voz', { para: caio.id, t: 'ice' });
  await caio.falar('voz', { para: 'teste-ninguem', t: 'ice' });
  await dormir(80);
  assert.equal(ana.de('voz').length, 0, 'a voz vazou para quem não era o `para`');
  assert.equal(caio.de('voz').filter((r) => r.carga.t !== 'resposta').length, 0);
  assert.equal(beto.de('voz').length, 1);
});

await teste('quem chega recebe o ÚLTIMO mundo e o estado (portas, relógios)', async () => {
  await ana.falar('mundo', { e: [], est: { portas: [true, false, true], nevoa: false, chefes: { carrasco: 123 } } });
  await dormir(100);
  const dora = await jogador('Dora');
  const ola = dora.ultimo('ola').carga;
  assert.deepEqual(ola.estado, { portas: [true, false, true], nevoa: false, chefes: { carrasco: 123 } });
  assert.ok(ola.mundo, 'sem o retrato do mundo');
  await fetch(`${BASE}/__mundo/sair?b=${dora.bilhete}`, { method: 'POST' });
  assert.ok(await ana.chegou('saiu', (r) => r.carga.id === dora.id), 'a saída da Dora não foi avisada');
});

await teste('janela escondida PASSA o bastão: o próximo mais antigo assume, com o mundo junto', async () => {
  await ana.falar('visivel', { v: false });
  assert.ok(await beto.chegou('sim', (r) => r.carga.id === beto.id), 'o Beto não assumiu');
  const sim = beto.de('sim').find((r) => r.carga.id === beto.id).carga;
  assert.ok(sim.mundo && sim.estado, 'quem assume precisa do retrato e do estado');
  assert.ok(await caio.chegou('sim', (r) => r.carga.id === beto.id), 'o Caio não soube da troca');
  // a Ana voltou: NÃO retoma (trocar à toa é um tranco para todos)
  await ana.falar('visivel', { v: true });
  await dormir(150);
  assert.equal(caio.ultimo('sim').carga.id, beto.id);
});

await teste('simulador CALADO (travou) é trocado; simulador que caiu é trocado na hora', async () => {
  // o Beto simula e não manda `mundo`: em ~0,7 s (MUNDO_SEM_MUNDO_MS do teste) o bastão passa
  assert.ok(await caio.chegou('sim', (r) => r.carga.id !== beto.id, 3000), 'ninguém assumiu do simulador calado');
  const novo = caio.ultimo('sim').carga.id;
  assert.equal(novo, ana.id, 'devia voltar para a mais antiga');
  // a Ana cai (fecha o cano): o próximo assume SEM esperar a carência
  const antes = Date.now();
  ana.desligar();
  assert.ok(await caio.chegou('sim', (r) => r.carga.id !== ana.id && r.carga.id !== null && caio.recados.indexOf(r) > caio.recados.indexOf(caio.de('sim').find((x) => x.carga.id === ana.id)), 1500), 'ninguém assumiu de quem caiu');
  assert.ok(Date.now() - antes < 1500);
  // …e depois da carência (0,4 s no teste) ela é dada como saída
  assert.ok(await caio.chegou('saiu', (r) => r.carga.id === ana.id, 3000), 'quem caiu nunca saiu da lista');
});

await teste('a mesma conta entrando de novo DERRUBA a sessão antiga', async () => {
  const beto2 = await jogador('Beto');
  assert.ok(await beto.chegou('expulso'), 'a sessão velha não foi avisada');
  assert.ok(await esperar(() => beto.fechado), 'o cano velho ficou aberto');
  assert.equal((await beto.falar('pos', {})).status, 401, 'o bilhete velho continua valendo');
  assert.equal(beto2.id, beto.id);
  beto = beto2;
});

await teste('PERSONAGEM: grava, volta igual, e o relógio que vale é o do servidor', async () => {
  const url = `${BASE}/__mundo/personagem?b=${beto.bilhete}`;
  assert.equal((await (await fetch(url)).json()).personagem, null);
  const r = await (await fetch(url, { method: 'POST', body: JSON.stringify(SAVE()) })).json();
  assert.ok(r.ok, r.erro);
  const volta = (await (await fetch(url)).json()).personagem;
  assert.equal(volta.jogador.almas, 420);
  assert.deepEqual(volta.inventario.itens, [['dagger', 1], ['estus', 3]]);
  assert.notEqual(volta.salvoEm, '2020-01-01T00:00:00.000Z', 'aceitou a data do cliente');
  const arq = path.join(PASTA, 'personagens', `${beto.id}.json`);
  assert.ok(fs.existsSync(arq), 'o arquivo não está onde devia');
  assert.equal(fs.readdirSync(path.join(PASTA, 'personagens')).filter((f) => f.endsWith('.tmp')).length, 0, 'sobrou temporário');
  // o save de um NÃO é o de outro
  assert.equal((await (await fetch(`${BASE}/__mundo/personagem?b=${caio.bilhete}`)).json()).personagem, null);
});

await teste('PERSONAGEM: save torto é RECUSADO e não apaga o bom', async () => {
  const url = `${BASE}/__mundo/personagem?b=${beto.bilhete}`;
  const ruins = [
    'isto não é json',
    JSON.stringify({ versao: 2 }),
    JSON.stringify({ ...SAVE(), jogador: { ...SAVE().jogador, nivel: 9999 } }),
    JSON.stringify({ ...SAVE(), jogador: { ...SAVE().jogador, vigor: 0 } }),             // atributo de compatibilidade fora do limite
    JSON.stringify({ ...SAVE(), jogador: { ...SAVE().jogador, almas: -5 } }),
    JSON.stringify({ ...SAVE(), inventario: { ...SAVE().inventario, itens: [['x'.repeat(80), 1]] } }),
    JSON.stringify({ ...SAVE(), lixo: 'x'.repeat(300 * 1024) }),                          // grande demais
  ];
  for (const corpo of ruins) {
    const r = await fetch(url, { method: 'POST', body: corpo }).catch(() => ({ status: 400 }));
    assert.equal(r.status, 400, `aceitou: ${corpo.slice(0, 60)}`);
  }
  assert.equal((await (await fetch(url)).json()).personagem.jogador.almas, 420, 'o save bom se perdeu');
});

await teste('PERSONAGEM: jogador.habilidades tem de ter a forma certa e caber no nível', async () => {
  const url = `${BASE}/__mundo/personagem?b=${beto.bilhete}`;
  // SAVE() é nível 3: libera 2 pontos
  const com = (habilidades, resto = {}) => JSON.stringify({ ...SAVE(), jogador: { ...SAVE().jogador, ...resto, habilidades } });
  const barra = [null, null, null, null];
  const bons = [
    JSON.stringify(SAVE()),                                                      // save sem o campo: árvore vazia
    com({ v: 1, nos: {}, barra }),
    com({ v: 1, nos: { 'fogo.bola': 1, 'fogo.pele': 1 }, barra: ['fogo.bola', null, null, null] }),
    com({ v: 1, nos: {}, barra }, { vigor: 99 }),                                // a soma dos atributos não é mais exigida
  ];
  for (const corpo of bons) assert.ok((await fetch(url, { method: 'POST', body: corpo })).ok, `recusou: ${corpo.slice(80, 240)}`);
  const ruins = [
    com(null),
    com([]),
    com({ v: 2, nos: {}, barra }),
    com({ v: 1, nos: [], barra }),
    com({ v: 1, nos: {}, barra: [null, null, null] }),
    com({ v: 1, nos: {}, barra: [1, null, null, null] }),
    com({ v: 1, nos: { 'Fogo Bola': 1 }, barra }),
    com({ v: 1, nos: { 'fogo.bola': 0 }, barra }),
    com({ v: 1, nos: { 'fogo.bola': 1.5 }, barra }),
    com({ v: 1, nos: { 'fogo.bola': '1' }, barra }),
    com({ v: 1, nos: { 'fogo.bola': 2, 'fogo.pele': 1 }, barra }),               // 3 pontos gastos no nível 3
  ];
  for (const corpo of ruins) assert.equal((await fetch(url, { method: 'POST', body: corpo })).status, 400, `aceitou: ${corpo.slice(80, 240)}`);
  assert.ok((await fetch(url, { method: 'POST', body: JSON.stringify(SAVE()) })).ok);
});

await teste('PERFIS: nome de 3 a 16 letras e números, único sem olhar maiúscula nem acento', async () => {
  const criar = (conta, nome) => perfis(conta, { acao: 'criar', nome });
  for (const ruim of ['ab', 'x'.repeat(17), 'com espaco', 'traço-no-meio', 'ponto.final', 'Кирилл', '', 42]) {
    const r = await criar('Nomes', ruim);
    assert.equal(r.erro, 'nome_invalido', `aceitou o nome ${JSON.stringify(ruim)}`);
  }
  const joao = await criar('Nomes', 'João');
  assert.ok(joao.ok, joao.erro);
  assert.match(joao.perfil.codigo, /^[2-9A-HJ-NP-Z]{6}$/, 'código fora do alfabeto (sem 0, O, 1, I)');
  for (const igual of ['joao', 'JOAO', 'Joãó', 'jOãO']) {
    assert.equal((await criar('OutraConta', igual)).erro, 'nome_em_uso', `${igual} passou por cima de João`);
  }
  assert.equal((await perfis('OutraConta', { acao: 'nome', nome: 'joao' })).livre, false, 'a tela diria que o nome está livre');
  assert.equal((await perfis('OutraConta', { acao: 'nome', nome: 'Kael99' })).livre, true);
});

await teste('PERFIS: no máximo 4 por conta, e o 5º é recusado pelo servidor', async () => {
  for (const nome of ['Quatro1', 'Quatro2', 'Quatro3', 'Quatro4']) assert.ok((await perfis('Lotada', { acao: 'criar', nome })).ok);
  const quinto = await perfis('Lotada', { acao: 'criar', nome: 'Quatro5' });
  assert.equal(quinto.status, 409);
  assert.equal(quinto.erro, 'limite_de_personagens');
  assert.equal((await perfis('Lotada', { acao: 'listar' })).perfis.length, 4);
});

await teste('ENTRAR: personagem de outra conta é recusado, e id torto nem chega ao disco', async () => {
  const daLia = await perfilDe('Lia');
  const r = await pedirEntrada('Rui', daLia.id);
  assert.equal(r.status, 403, 'entrou com o personagem da outra conta');
  assert.equal((await r.json()).ok, false);
  for (const torto of [undefined, null, 42, '', '../../estado', '..\\..\\estado', 'a'.repeat(36), daLia.id.toUpperCase(), `${daLia.id}/../x`, `${daLia.id}.json`]) {
    assert.equal((await pedirEntrada('Lia', torto)).status, 400, `aceitou o id ${JSON.stringify(torto)}`);
  }
  // um id bem formado que não existe também não entra
  assert.equal((await pedirEntrada('Lia', '00000000-0000-4000-8000-000000000000')).status, 403);
});

await teste('PERFIS: dois personagens da mesma conta têm progressos separados', async () => {
  const um = await jogador('Primeiro', 'Dupla');
  assert.equal(um.entrada.nome, 'Primeiro', 'o nome no mundo é o do personagem');
  const url = (j) => `${BASE}/__mundo/personagem?b=${j.bilhete}`;
  const save = SAVE(); save.jogador.almas = 111;
  assert.ok((await fetch(url(um), { method: 'POST', body: JSON.stringify(save) })).ok);
  // entrar com o outro personagem da mesma conta derruba a sessão do primeiro
  const dois = await jogador('Segundo', 'Dupla');
  assert.ok(await um.chegou('expulso'), 'duas sessões da mesma conta ao mesmo tempo');
  assert.notEqual(dois.id, um.id);
  assert.equal(dois.entrada.personagem, null, 'o segundo personagem herdou o progresso do primeiro');
  const outro = SAVE(); outro.jogador.almas = 222;
  assert.ok((await fetch(url(dois), { method: 'POST', body: JSON.stringify(outro) })).ok);
  dois.desligar();
  const volta = await jogador('Primeiro', 'Dupla');
  assert.equal(volta.entrada.personagem.jogador.almas, 111, 'o primeiro perdeu o progresso dele');
  volta.desligar();
});

await teste('PERFIS: apagar pede o nome certo, é definitivo e o nome fica livre na hora', async () => {
  const p = await perfilDe('Apaga', 'Efemero');
  const j = await jogador('Efemero', 'Apaga');
  assert.ok((await fetch(`${BASE}/__mundo/personagem?b=${j.bilhete}`, { method: 'POST', body: JSON.stringify(SAVE()) })).ok);
  j.desligar();
  assert.equal((await perfis('Apaga', { acao: 'apagar', id: p.id, nome: 'Outro' })).erro, 'confirmacao_errada');
  assert.equal((await perfis('Lia', { acao: 'apagar', id: p.id, nome: 'Efemero' })).erro, 'personagem_nao_encontrado', 'apagou o personagem de outra conta');
  assert.ok((await perfis('Apaga', { acao: 'apagar', id: p.id, nome: 'efemero' })).ok);
  assert.equal((await pedirEntrada('Apaga', p.id)).status, 403, 'o personagem apagado ainda entra');
  assert.ok(await esperar(() => !fs.existsSync(path.join(PASTA, 'personagens', `${p.id}.json`))), 'o save ficou no disco');
  assert.ok((await perfis('Lia', { acao: 'criar', nome: 'Efemero' })).ok, 'o nome não ficou livre');
});

await teste('PERFIS: save ilegível NÃO vira personagem novo', async () => {
  const p = await perfilDe('Quebrado');
  const arq = path.join(PASTA, 'personagens', `${p.id}.json`);
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, '{ metade de um save');
  const r = await pedirEntrada('Quebrado', p.id);
  assert.equal(r.status, 500, 'entrou com o save estragado');
  assert.equal(fs.readFileSync(arq, 'utf8'), '{ metade de um save', 'mexeu no arquivo');
  fs.rmSync(arq);
});

await teste('CHAT do mundo: o nome e o código são os do servidor, não os do recado', async () => {
  const ze = await jogador('ZeDoChat');
  await ze.falar('chat', { texto: '  oi, gente  ', nome: 'Impostor', codigo: 'AAAAAA' });
  assert.ok(await caio.chegou('chat', (r) => r.de === ze.id), 'a mensagem não chegou');
  const c = caio.ultimo('chat').carga;
  assert.deepEqual(c, { nome: 'ZeDoChat', codigo: ze.entrada.codigo, texto: 'oi, gente' });
  // a conta nunca viaja: quem está no mundo só conhece o personagem
  assert.ok(!JSON.stringify(caio.recados).includes('teste-zedochat'), 'o id da conta vazou para os outros jogadores');
  ze.desligar();
});

await teste('os DADOS não saem pelo servidor estático (nem disfarçados)', async () => {
  fs.mkdirSync(path.join(RAIZ, 'saves'), { recursive: true });
  for (const caminho of ['/saves/progresso.json', '/SAVES/progresso.json', '/saves./progresso.json', '/js/../saves/progresso.json',
    '/mundo/estado.json', '/server.js', '/servidor-mundo.mjs', '/package.json', '/saves%5Cprogresso.json']) {
    // pedido CRU: o `fetch` normalizaria o `..` antes de mandar
    const status = await new Promise((ok) => {
      import('node:net').then(({ connect }) => {
        const s = connect(PORTA, '127.0.0.1', () => s.write(`GET ${caminho} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
        let txt = '';
        s.on('data', (d) => { txt += d; });
        s.on('close', () => ok(Number(txt.split(' ')[1])));
      });
    });
    assert.ok(status === 403 || status === 404, `${caminho} saiu com ${status}`);
  }
  assert.equal((await fetch(`${BASE}/`)).status, 200, 'a página do jogo parou de abrir');
  assert.equal((await fetch(`${BASE}/js/main.js`)).status, 200);
  assert.equal((await fetch(`${BASE}/assets/mapa.json`)).status, 200);
});

await teste('recado torto ou grande demais não derruba nada', async () => {
  const url = `${BASE}/__mundo/falar?b=${caio.bilhete}`;
  assert.equal((await fetch(url, { method: 'POST', body: '{{{{' })).status, 400);
  assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify({ evento: 'x'.repeat(200), carga: 1 }) })).status, 204, 'evento desconhecido é só ignorado');
  const r = await fetch(url, { method: 'POST', body: JSON.stringify({ evento: 'pos', carga: 'x'.repeat(200 * 1024) }) }).catch(() => ({ status: 400 }));
  assert.equal(r.status, 400);
  // um lote vale como vários recados
  await fetch(url, { method: 'POST', body: JSON.stringify({ lote: [{ evento: 'pos', carga: { x: 5 } }, { evento: 'pos', carga: { x: 6 } }] }) });
  assert.ok(await beto.chegou('pos', (x) => x.carga.x === 6));
  assert.ok((await fetch(`${BASE}/__mundo/info`)).ok, 'o servidor caiu');
});

await teste('o ESTADO do mundo sobrevive ao servidor reiniciar; o retrato dos inimigos, não', async () => {
  // quem simula agora manda o estado. Os DOIS mandam (o servidor ignora quem não simula): sem
  // ninguém falar nos testes de antes, o simulador calado é trocado a cada 2,5 s, e escolher um
  // só aqui às vezes pegava o que acabara de perder a vez (o teste falhava por tempo)
  const recado = { e: [['e0', 1, 0, 1, 0, null, 1, 5, 'idle', 5, 0, null]], est: { portas: [true], nevoa: true, chefes: { wyrm: 777 } } };
  const noDisco = () => fs.existsSync(path.join(PASTA, 'estado.json')) && JSON.parse(fs.readFileSync(path.join(PASTA, 'estado.json'), 'utf8')).nevoa === true;
  let foi = false;
  for (let k = 0; k < 4 && !foi; k++) { for (const j of [beto, caio]) await j.falar('mundo', recado); foi = await esperar(noDisco, 1500); }
  assert.ok(foi, 'o estado não foi para o disco');
  beto.desligar(); caio.desligar();
  await descer();
  assert.ok(await subir(), 'o servidor não voltou');
  const eva = await jogador('Eva');
  const ola = eva.ultimo('ola').carga;
  assert.deepEqual(ola.estado, { portas: [true], nevoa: true, chefes: { wyrm: 777 } });
  assert.equal(ola.mundo, null, 'um mundo que ficou vazio não pode entregar a luta congelada de antes');
  // e o personagem do Beto continua lá
  const beto3 = await jogador('Beto');
  assert.equal(beto3.entrada.personagem.jogador.almas, 420);
  eva.desligar(); beto3.desligar();
});

await teste('HOSPEDAR=1: o save e as salas de quem hospeda NÃO atendem nem a localhost', async () => {
  // atrás de um túnel ou de um proxy, todo visitante chega como 127.0.0.1 —
  // e este teste é exatamente um pedido de 127.0.0.1
  assert.notEqual((await fetch(`${BASE}/__save`)).status, 403, 'sem HOSPEDAR, o save atende quem é daqui');
  assert.equal((await fetch(`${BASE}/__lan/info`)).status, 200, 'sem HOSPEDAR, as salas atendem');
  await descer();
  assert.ok(await subir({ HOSPEDAR: '1' }), 'o servidor não voltou com HOSPEDAR=1');
  for (const method of ['GET', 'POST', 'DELETE']) {
    assert.equal((await fetch(`${BASE}/__save`, { method, body: method === 'POST' ? '{}' : undefined })).status, 403, `/__save ${method}`);
  }
  for (const rota of ['info', 'vizinhos', 'ouvir?sala=ABCDEF&id=x', 'falar?sala=ABCDEF&id=x']) {
    assert.equal((await fetch(`${BASE}/__lan/${rota}`)).status, 404, `/__lan/${rota}`);
  }
  // o que ele existe para servir continua de pé
  assert.equal((await fetch(`${BASE}/`)).status, 200);
  assert.ok((await (await fetch(`${BASE}/__mundo/info`)).json()).quem);
  const fia = await jogador('Fia');
  assert.equal(fia.ultimo('ola').carga.eu, fia.id);
  fia.desligar();
});

await teste('MUNDO_SAVES=nuvem (o Render): NADA em disco — nem personagem, nem estado', async () => {
  await descer();
  const pasta2 = fs.mkdtempSync(path.join(os.tmpdir(), 'mundo-nuvem-'));
  assert.ok(await subir({ HOSPEDAR: '1', MUNDO_SAVES: 'nuvem', MUNDO_DIR: pasta2, FRENTE_EM: 'https://exemplo.test/jogo/' }), 'o servidor não subiu');
  assert.equal((await (await fetch(`${BASE}/__mundo/info`)).json()).saves, 'nuvem');
  const gil = await jogador('Gil');
  assert.equal(gil.entrada.saves, 'nuvem', 'o jogo precisa saber que o personagem não está aqui');
  assert.equal(gil.entrada.personagem, null);
  // gravar aqui sumiria no próximo reinício: tem de ser RECUSADO, não aceito calado
  const url = `${BASE}/__mundo/personagem?b=${gil.bilhete}`;
  assert.equal((await fetch(url, { method: 'POST', body: JSON.stringify(SAVE()) })).status, 409);
  assert.equal((await fetch(url)).status, 409);
  // o estado do mundo vale em memória (quem chega recebe), e não vai para o disco
  await gil.falar('mundo', { e: [], est: { portas: [true], nevoa: false, chefes: {}, mortos: {} } });
  await dormir(2800);
  const hugo = await jogador('Hugo');
  assert.deepEqual(hugo.ultimo('ola').carga.estado?.portas, [true]);
  assert.deepEqual(fs.readdirSync(pasta2), [], 'escreveu em disco');
  // FRENTE_EM: este servidor é só o mundo — a página vai para onde o jogo está, e arquivo do jogo não sai
  const raizDoSite = await fetch(`${BASE}/`, { redirect: 'manual' });
  assert.equal(raizDoSite.status, 302);
  assert.equal(raizDoSite.headers.get('location'), 'https://exemplo.test/jogo/');
  assert.equal((await fetch(`${BASE}/js/main.js`)).status, 404, 'o jogo saiu pelo servidor de mundo');
  assert.equal((await fetch(`${BASE}/__saude`)).status, 200, 'a sonda de vida do Render tem de responder');
  gil.desligar(); hugo.desligar();
  fs.rmSync(pasta2, { recursive: true, force: true });
});

await teste('/__mundo/ice: o TURN da voz só para quem joga, sem a porta 53, e a Cloudflare chamada uma vez só', async () => {
  await descer();
  assert.ok(await subir(), 'o servidor não voltou');
  // sem as variáveis, o servidor diz que não tem retransmissor (e a voz segue só com STUN)
  const ivo = await jogador('Ivo');
  const pedirIce = (corpo) => fetch(`${BASE}/__mundo/ice`, { method: 'POST', body: JSON.stringify(corpo) });
  let r = await (await pedirIce({ b: ivo.bilhete })).json();
  assert.equal(r.ok, true);
  assert.equal(r.iceServers, null);
  ivo.desligar();

  // uma Cloudflare de mentira, que conta quantas vezes foi chamada
  const http = await import('node:http');
  const pedidos = [];
  const cf = http.createServer((req, res) => {
    let corpo = '';
    req.on('data', (c) => { corpo += c; });
    req.on('end', () => {
      pedidos.push({ url: req.url, auth: req.headers.authorization, corpo: JSON.parse(corpo) });
      res.writeHead(201, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.cloudflare.com:53'] },
        { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turn:turn.cloudflare.com:53?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
      ] }));
    });
  });
  await new Promise((ok) => cf.listen(0, '127.0.0.1', ok));
  await descer();
  assert.ok(await subir({ TURN_CF_ID: 'chave1', TURN_CF_TOKEN: 'segredo', TURN_CF_API: `http://127.0.0.1:${cf.address().port}` }), 'o servidor não subiu');
  try {
    // sem bilhete nem conta, nada
    assert.equal((await pedirIce({})).status, 401);
    assert.equal((await pedirIce({ b: '0'.repeat(48) })).status, 401);
    assert.equal((await pedirIce({ token: 'teste:x' })).status, 400, 'nome de teste inválido');
    assert.equal(pedidos.length, 0, 'quem não joga fez o servidor pedir credencial');
    // com bilhete (Mundo) e com conta (sala; `teste:` neste servidor)
    const jaq = await jogador('Jaq');
    r = await (await pedirIce({ b: jaq.bilhete })).json();
    assert.deepEqual(r.iceServers, [
      { urls: ['stun:stun.cloudflare.com:3478'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' },
    ]);
    r = await (await pedirIce({ token: 'teste:Kau' })).json();
    assert.equal(r.iceServers.length, 2);
    // o segredo foi para a Cloudflare, do jeito dela, e só uma vez
    assert.equal(pedidos.length, 1, 'cada pedido de credencial foi à Cloudflare');
    assert.equal(pedidos[0].url, '/v1/turn/keys/chave1/credentials/generate-ice-servers');
    assert.equal(pedidos[0].auth, 'Bearer segredo');
    assert.equal(pedidos[0].corpo.ttl, 86400);
    jaq.desligar();
  } finally {
    cf.close();
  }
});

await teste('o THREE do servidor (npm) é o MESMO arquivo do vendor/ do jogo', async () => {
  // o jogo usa o vendor/ (import map); o servidor, o pacote do npm. Se as versões se separarem, a
  // mesma conta dá outro número nos dois lados. Subiu o vendor? `npm install --save-exact three@<versão>`
  const { createRequire } = await import('node:module');
  const doNpm = createRequire(path.join(RAIZ, 'package.json')).resolve('three');   // (o build/three.cjs)
  const um = fs.readFileSync(path.join(path.dirname(doNpm), 'three.module.js'));
  assert.ok(um.equals(fs.readFileSync(path.join(RAIZ, 'vendor', 'three.module.js'))), 'o three do npm não é o do vendor/');
});

await teste('o CÉREBRO do inimigo roda sem o navegador: persegue, ataca, conjura, bloqueia e morre', async () => {
  const THREE = await import('three');
  const { Inimigo } = await import('../js/inimigos/cerebro.js');
  const { ENEMY_TYPES } = await import('../js/inimigos/tipos.js');
  const { ESQUELETOS, lugarDoNascimento } = await import('../js/inimigos/nascimentos.js');
  const { lerMapaLogico } = await import('../mapa-do-servidor.mjs');
  const world = lerMapaLogico(RAIZ);
  const golpes = [], orbes = [], mortos = [];
  const alvo = { pos: new THREE.Vector3(), radius: 0.5, dead: false, state: 'idle', inArena: false, takeDamage: (dano) => { golpes.push(dano); return 'hit'; } };
  const mundo = { time: 0, world, player: alvo, marionetes: false, alvoPara: () => alvo, onEnemyKilled: (e) => mortos.push(e),
    projectiles: { orb: (o) => orbes.push(o), shock: () => {} } };
  const lutar = (tipo) => {
    const n = ESQUELETOS.find((x) => x.tipo === tipo), l = lugarDoNascimento(n.r, n.c, n.dx, n.dz);
    const e = new Inimigo(mundo, ENEMY_TYPES[tipo], new THREE.Vector3(l.x, 0, l.z), n.rumo);
    const eventos = new Set(); e.ouvir((t) => eventos.add(t));
    // o alvo a 4,5 m, num lugar que ele vê
    for (let k = 0; k < 32; k++) {
      const a = e.facing + k * Math.PI / 16, c = e.pos.clone().add(new THREE.Vector3(Math.sin(a) * 4.5, 0, Math.cos(a) * 4.5));
      if (world.pointInside(c) && world.lineOfSight(e.pos, c)) { alvo.pos.copy(c); break; }
    }
    const estados = new Set();
    for (let i = 0; i < 30 * 15; i++) { mundo.time += 1 / 30; e.update(1 / 30); estados.add(e.state); }
    for (let i = 0; i < 40 && !e.dead; i++) { e.takeDamage(40, alvo.pos.clone(), 30, {}); for (let k = 0; k < 20; k++) { mundo.time += 1 / 30; e.update(1 / 30); } }
    return { e, estados, eventos };
  };
  const g = lutar('warrior');
  assert.ok(g.estados.has('chase') && g.estados.has('attack'), `o guerreiro não lutou: ${[...g.estados]}`);
  assert.ok(golpes.length > 0, 'o guerreiro não acertou o alvo');
  assert.ok(g.e.dead && mortos.includes(g.e), 'o guerreiro não morreu');
  assert.ok(['anim', 'avistou', 'brandiu', 'morreu'].every((t) => g.eventos.has(t)), `faltou evento: ${[...g.eventos]}`);
  assert.ok(g.eventos.has('bloqueou') || g.eventos.has('ferido'), 'nenhum golpe no guerreiro contou');
  const m = lutar('mage');
  assert.ok(orbes.length > 0 && m.eventos.has('conjurou'), 'o necromante não conjurou');
  assert.ok(orbes.every((o) => o.pos.distanceTo(m.e.home) < 40 && Number.isFinite(o.dir.x)), 'o feitiço saiu de lugar torto');
});

await teste('o MAPA LÓGICO: toda peça do PROPS tem caixa medida, e as colisões montam dos arquivos do jogo', async () => {
  const { lerProps } = await import('../mapa-do-servidor.mjs');
  const { MapaLogico, lerArquivoDoMapa, pecasDe } = await import('../js/mapa-logico.js');
  const ler = (f) => JSON.parse(fs.readFileSync(path.join(RAIZ, f), 'utf8'));
  const caixas = ler('assets/caixas-das-pecas.json'), props = lerProps(RAIZ);
  assert.deepEqual(props.filter((n) => !caixas.pecas[n]), [], 'peça sem medida: rode node ferramentas/mapa-logico/medir-pecas.mjs');
  const m = lerArquivoDoMapa(ler('assets/mapa.json'));
  const w = new MapaLogico({ mapa: m.linhas, relevo: m.relevo, agua: m.agua, decor: ler('assets/decor.json').itens, marcos: m.marcos, pecas: pecasDe(props, caixas) });
  assert.ok(w.boxes.length > 100 && w.circles.length > 100, 'quase nenhuma colisão');
  // a porta fechada barra o caminho; aberta, não (a caixa do vão é a mesma que o resolve usa)
  const p = w.passagens.find((x) => x.porta);
  assert.ok(p && w.edgeBlocked(p.e.a, p.e.b));
  p.porta.disabled = true;
  assert.equal(w.edgeBlocked(p.e.a, p.e.b), false);
  // o resolve (a colisão dos inimigos) roda no mapa lógico sozinho, sem o three.js
  const pos = { x: p.ex, y: 0, z: p.ez - 6 }, antes = { ...pos };
  w.resolve(pos, 0.5);
  assert.ok(Number.isFinite(pos.x) && Number.isFinite(pos.z) && Math.hypot(pos.x - antes.x, pos.z - antes.z) < 7);
});

await descer();
fs.rmSync(PASTA, { recursive: true, force: true });
console.log(`\n${passaram} testes passaram${falharam ? `, ${falharam} FALHARAM` : ''}\n`);
process.exit(falharam ? 1 : 0);
