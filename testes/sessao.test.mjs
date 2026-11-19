// Sessão do Supabase com respostas controladas: sem conta nem pedidos à internet.
import assert from 'node:assert/strict';
import { sessao, tokenValido } from '../js/rede/supabase.js';

const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const memoria = new Map();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (k) => memoria.get(k) ?? null,
  setItem: (k, v) => memoria.set(k, v),
  removeItem: (k) => memoria.delete(k),
} });
const CHAVE = 'masmorra:sb-session';
const preparar = () => {
  const s = { access_token: 'acesso-teste', refresh_token: 'renovacao-teste', expires_at: Date.now() - 1000, user: { id: 'conta-teste' } };
  memoria.set(CHAVE, JSON.stringify(s));
  return s;
};
const resposta = (status, corpo = {}) => new Response(JSON.stringify(corpo), { status });
const renovada = () => resposta(200, { access_token: 'acesso-novo', refresh_token: 'renovacao-nova', expires_in: 3600 });
let passaram = 0, falharam = 0;
async function teste(nome, fn) {
  try { await fn(); passaram++; console.log(`  ok  ${nome}`); }
  catch (e) { falharam++; console.log(`  FALHOU  ${nome}\n      ${e.message}`); }
}

console.log('\nSESSÃO — renovação do Supabase\n');
try {
  for (const status of [429, 500, 502, 503, 504]) {
    await teste(`HTTP ${status} na renovação preserva a sessão guardada`, async () => {
      const anterior = preparar();
      globalThis.fetch = async () => resposta(status, { message: 'falha temporária' });
      assert.equal(await tokenValido(), anterior.access_token);
      assert.deepEqual(sessao(), anterior);
    });
  }
  for (const status of [400, 401]) {
    await teste(`HTTP ${status} recusando o refresh token ainda apaga a sessão`, async () => {
      preparar();
      globalThis.fetch = async () => resposta(status, { code: 'refresh_token_not_found' });
      assert.equal(await tokenValido(), null);
      assert.equal(sessao(), null);
    });
  }
  await teste('depois da falha temporária, a próxima tentativa renova normalmente', async () => {
    const anterior = preparar();
    let chamadas = 0;
    globalThis.fetch = async () => ++chamadas === 1 ? resposta(503) : renovada();
    assert.equal(await tokenValido(), anterior.access_token);
    assert.equal(await tokenValido(), 'acesso-novo');
    assert.equal(sessao().refresh_token, 'renovacao-nova');
    assert.equal(sessao().user.id, anterior.user.id);
    assert.equal(chamadas, 2);
  });
  await teste('sem rede a sessão continua guardada', async () => {
    const anterior = preparar();
    globalThis.fetch = async () => { throw new TypeError('sem conexão'); };
    assert.equal(await tokenValido(), anterior.access_token);
    assert.deepEqual(sessao(), anterior);
  });
  await teste('pedidos simultâneos compartilham a mesma renovação', async () => {
    preparar();
    let chamadas = 0, concluir;
    globalThis.fetch = () => { chamadas++; return new Promise((ok) => { concluir = ok; }); };
    const a = tokenValido(), b = tokenValido();
    assert.equal(chamadas, 1);
    concluir(renovada());
    assert.deepEqual(await Promise.all([a, b]), ['acesso-novo', 'acesso-novo']);
  });
} finally {
  globalThis.fetch = originalFetch;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else delete globalThis.localStorage;
}
console.log(`\n${passaram} testes passaram${falharam ? `, ${falharam} FALHARAM` : ''}\n`);
if (falharam) process.exitCode = 1;
