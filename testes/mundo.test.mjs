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

/** Um jogador de teste: entra, ouve (guardando tudo o que chega) e fala. */
async function jogador(nome) {
  const r = await fetch(`${BASE}/__mundo/entrar`, { method: 'POST', body: JSON.stringify({ token: `teste:${nome}`, v: 1, mapa: MAPA }) });
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
  assert.equal(i.v, 1);
  assert.equal(i.mapa, MAPA);
  assert.equal(i.jogadores, 0);
});

await teste('entrar RECUSA token ruim, versão errada e mapa errado', async () => {
  const tenta = async (corpo) => { const r = await fetch(`${BASE}/__mundo/entrar`, { method: 'POST', body: JSON.stringify(corpo) }); return [r.status, (await r.json()).ok]; };
  assert.deepEqual(await tenta({ token: 'teste:x', v: 1, mapa: MAPA }), [400, false], 'nome curto demais');
  // token que o Supabase não conhece: 401. Sem internet para perguntar, 502 —
  // de um jeito ou de outro, NÃO entra (este é o único ponto do teste que usa a rede)
  const [status, entrou] = await tenta({ token: 'um-token-qualquer', v: 1, mapa: MAPA });
  assert.ok((status === 401 || status === 502) && entrou === false, `token inventado: ${status}`);
  assert.deepEqual(await tenta({ token: 'teste:Ana', v: 999, mapa: MAPA }), [409, false], 'versão');
  assert.deepEqual(await tenta({ token: 'teste:Ana', v: 1, mapa: 'outro-mapa' }), [409, false], 'mapa');
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
  await beto.falar('golpe', { id: 'e3', dano: 17 });
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
    JSON.stringify({ ...SAVE(), jogador: { ...SAVE().jogador, vigor: 99 } }),            // atributos que não batem com o nível
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
  // quem simula agora manda o estado
  const sim = [beto, caio].find((j) => j.id === caio.ultimo('sim')?.carga.id) ?? beto;
  await sim.falar('mundo', { e: [['e0', 1, 0, 1, 0, null, 1, 5, 'idle', 5, 0, null]], est: { portas: [true], nevoa: true, chefes: { wyrm: 777 } } });
  assert.ok(await esperar(() => fs.existsSync(path.join(PASTA, 'estado.json')) && JSON.parse(fs.readFileSync(path.join(PASTA, 'estado.json'), 'utf8')).nevoa === true, 4000), 'o estado não foi para o disco');
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

await descer();
fs.rmSync(PASTA, { recursive: true, force: true });
console.log(`\n${passaram} testes passaram${falharam ? `, ${falharam} FALHARAM` : ''}\n`);
process.exit(falharam ? 1 : 0);
