/**
 * Cliente Supabase mínimo, sem dependência nenhuma — o mesmo desenho do
 * `duel academy/web/js/supabase.js` (sessão guardada, renovação sozinha,
 * `req` que nunca lança), enxugado para o que a Masmorra usa.
 *
 * É o MESMO projeto do Duel Academy (a mesma conta entra nos dois jogos), mas
 * todo dado daqui vive no schema `masmorra` — ver
 * `supabase/migrations/0001_masmorra_inicial.sql`. Por isso cada pedido ao
 * PostgREST leva `Accept-Profile`/`Content-Profile: masmorra`: sem eles a API
 * procuraria as tabelas no `public`, que é do outro jogo.
 *
 * OFFLINE: sem rede, a sessão guardada é preservada e o jogo abre normalmente
 * (o online só não liga). Só uma recusa explícita do servidor apaga a sessão.
 */

// A chave publicável é PÚBLICA por projeto: quem protege os dados é a RLS.
// A `secret`/`service_role` nunca pode aparecer aqui.
export const SUPABASE_URL = 'https://shclhlbfkdnnqxboiuqc.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_FxGEPSbXqJEBBUqG9ugJ6w_3z5AaVzC';
const SCHEMA = 'masmorra';

// Chave própria: o Duel Academy roda em outra origem, mas mesmo que não
// rodasse, a sessão de um jogo não deve sobrescrever a do outro.
const CHAVE_SESSAO = 'masmorra:sb-session';
const MARGEM_RENOVACAO_MS = 60_000;

class SemRede extends Error {}

// ---------------------------------------------------------------- sessão

/** `{access_token, refresh_token, expires_at, user}` ou null. */
export function sessao() {
  try { const cru = localStorage.getItem(CHAVE_SESSAO); return cru ? JSON.parse(cru) : null; } catch { return null; }
}

function guardar(s) {
  try {
    if (s) localStorage.setItem(CHAVE_SESSAO, JSON.stringify(s));
    else localStorage.removeItem(CHAVE_SESSAO);
  } catch { /* modo privativo: a sessão só não sobrevive ao recarregar */ }
}

function daResposta(j, anterior) {
  return {
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
    user: j.user ?? anterior?.user ?? null,
  };
}

/** Id da conta logada (o `sub` do token), ou null. */
export function contaId() { return sessao()?.user?.id ?? null; }

// ------------------------------------------------------------------ HTTP

async function pedir(url, opts) {
  let r;
  try { r = await fetch(url, opts); } catch { throw new SemRede('sem conexao'); }
  const texto = await r.text();
  let corpo = null;
  try { corpo = texto ? JSON.parse(texto) : null; } catch { corpo = texto; }
  return { ok: r.ok, status: r.status, corpo };
}

function mensagemDeErro(corpo, padrao) {
  return corpo?.msg || corpo?.message || corpo?.error_description || corpo?.error || corpo?.error_code || padrao;
}

let renovando = null;

/** Um access token válido (renova se preciso), ou null sem sessão. */
export async function tokenValido() {
  const s = sessao();
  if (!s?.access_token) return null;
  if (Date.now() < s.expires_at - MARGEM_RENOVACAO_MS || !s.refresh_token) return s.access_token;
  // Renovações simultâneas dividem a mesma: o GoTrue invalida o refresh token
  // a cada uso, e duas em paralelo derrubariam a sessão.
  if (!renovando) renovando = renovar(s).finally(() => { renovando = null; });
  return renovando;
}

async function renovar(s) {
  let r;
  try {
    r = await pedir(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
  } catch (e) {
    if (e instanceof SemRede) return s.access_token;   // offline: segura a sessão
    throw e;
  }
  if (!r.ok) { guardar(null); return null; }           // recusa explícita: desloga
  const nova = daResposta(r.corpo, s);
  guardar(nova);
  return nova.access_token;
}

// ------------------------------------------------------------------ conta

/**
 * Cria a conta. `usuario` vai nos metadados (o mesmo campo do Duel Academy) e
 * vira o nome na Masmorra no primeiro `entrar()` (RPC `masmorra.entrar`).
 * Com confirmação de e-mail ligada, volta sem sessão: `precisaConfirmar`.
 */
export async function cadastrar(email, senha, usuario) {
  try {
    const r = await pedir(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password: senha, data: { usuario } }),
    });
    if (!r.ok) return { ok: false, error: mensagemDeErro(r.corpo, 'não consegui criar a conta') };
    if (r.corpo?.access_token) { guardar(daResposta(r.corpo)); return { ok: true, precisaConfirmar: false }; }
    return { ok: true, precisaConfirmar: true };
  } catch { return { ok: false, error: 'sem conexão' }; }
}

export async function entrar(email, senha) {
  try {
    const r = await pedir(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify({ email, password: senha }),
    });
    if (!r.ok) return { ok: false, error: traduzirErro(mensagemDeErro(r.corpo, 'e-mail ou senha inválidos')) };
    guardar(daResposta(r.corpo));
    return { ok: true };
  } catch { return { ok: false, error: 'sem conexão' }; }
}

function traduzirErro(e) {
  if (/invalid login credentials/i.test(e)) return 'e-mail ou senha inválidos';
  if (/email not confirmed/i.test(e)) return 'confirme o e-mail antes de entrar (veja sua caixa de entrada)';
  return e;
}

/** Sai — apaga a sessão local SEMPRE, mesmo offline. */
export async function sair() {
  const s = sessao();
  if (s?.access_token) {
    try { await pedir(`${SUPABASE_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${s.access_token}` } }); } catch { }
  }
  guardar(null);
}

// -------------------------------------------------------------- PostgREST

/**
 * Pedido autenticado ao PostgREST, no schema `masmorra`. `caminho` é relativo
 * a `/rest/v1/` (`'mensagens?mapa=eq.floresta'`, `'rpc/entrar'`).
 * Devolve `{ok, status, dados, error}` e nunca lança.
 */
export async function req(caminho, { method = 'GET', body, prefer, keepalive = false } = {}) {
  const headers = { apikey: SUPABASE_KEY };
  if (method === 'GET' || method === 'HEAD') headers['accept-profile'] = SCHEMA;
  else headers['content-profile'] = SCHEMA;
  try {
    const token = await tokenValido();
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (prefer) headers.prefer = prefer;
    const r = await pedir(`${SUPABASE_URL}/rest/v1/${caminho}`, {
      method, headers, keepalive,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { ok: r.ok, status: r.status, dados: r.corpo, error: r.ok ? null : mensagemDeErro(r.corpo, `HTTP ${r.status}`) };
  } catch (e) {
    if (e instanceof SemRede) return { ok: false, status: 0, dados: null, error: 'sem conexão' };
    console.warn('[supabase] falha inesperada em', caminho, e);
    return { ok: false, status: 0, dados: null, error: e?.message || 'falha inesperada' };
  }
}

/** Atalho para RPC: `rpc('entrar')`, `rpc('avaliar', {p_mensagem: 3, p_voto: 1})`. */
export function rpc(nome, args = {}, opts = {}) {
  return req(`rpc/${nome}`, { method: 'POST', body: args, ...opts });
}
