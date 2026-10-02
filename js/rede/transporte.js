/**
 * **Os canos por onde a sala conversa** — trocáveis, com a MESMA cara.
 *
 * A sala (`sala.js`) não sabe por onde o recado anda. Ela recebe um transporte
 * `{tipo, enviar(evento, carga), fechar()}` e um `aoReceber(evento, carga, de)`:
 *
 *   • `internet` — o broadcast do Supabase (canal privado `masmorra:sala:<código>`).
 *     Precisa de conta e de internet; ~100–200 ms por recado.
 *   • `local` — o retransmissor do `server.js` do ANFITRIÃO (`rede-local.mjs`):
 *     SSE para ouvir, POST para falar. Não precisa de conta nem de internet;
 *     1–5 ms na mesma rede.
 *
 * Quando os dois estão na mesma rede, a sala começa pela internet e TROCA para
 * a rede local assim que a sonda (`alcancavel`) alcança o servidor do outro.
 * No co-op (etapa 3) o cano é o mesmo — por isso ele mora aqui, e não na sala.
 */
import { SUPABASE_URL, SUPABASE_KEY, tokenValido } from './supabase.js';
import { ouvirTransmissoes } from './realtime.js';
import { temRedeLocal } from '../hospedagem.js';

/** O canal do Supabase. `de` vem dentro da carga (o broadcast não diz quem mandou). */
export function transporteInternet(codigo, meuId, aoReceber, aoEstado = () => {}) {
  const canal = ouvirTransmissoes(
    { url: SUPABASE_URL, apikey: SUPABASE_KEY, token: tokenValido, sala: `masmorra:sala:${codigo}`, privado: true },
    (evento, carga) => { if (carga && typeof carga === 'object') aoReceber(evento, carga.c ?? null, String(carga.de ?? '')); },
    aoEstado,
  );
  return {
    tipo: 'internet',
    enviar: (evento, carga) => canal.transmitir(evento, { de: meuId, c: carga }),
    fechar: canal.fechar,
  };
}

/**
 * O retransmissor da rede local. `base` = '' para o servidor DESTE computador
 * (o anfitrião), ou `http://<ip>:<porta>` para o do anfitrião (o convidado).
 * `anunciar` põe a sala na lista "salas na rede local" dos outros.
 */
export function transporteLocal(base, codigo, meuId, aoReceber, aoEstado = () => {}, { anunciar = false, nome = '' } = {}) {
  const q = `sala=${codigo}&id=${encodeURIComponent(meuId)}`;
  const fonte = new EventSource(`${base}/__lan/ouvir?${q}${anunciar ? `&anunciar=1&nome=${encodeURIComponent(nome)}` : ''}`);
  fonte.onopen = () => aoEstado(true);
  fonte.onerror = () => aoEstado(false);   // o EventSource reconecta sozinho
  fonte.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (typeof m?.evento === 'string') aoReceber(m.evento, m.carga ?? null, String(m.de ?? ''));
  };
  return {
    tipo: 'local',
    // text/plain: pedido "simples", sem a pré-consulta de CORS — um recado a
    // menos de ida e volta em cada golpe.
    enviar: (evento, carga) => fetch(`${base}/__lan/falar?${q}`, {
      method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ evento, carga }),
    }).catch(() => {}),
    fechar: () => fonte.close(),
  };
}

/**
 * O cano do MUNDO ONLINE (`servidor-mundo.mjs`): SSE para ouvir, POST para
 * falar, como o da rede local — mas com BILHETE (quem fala é quem o servidor
 * diz que é) e com a fala EM FILA:
 *
 *   • um POST por vez, e o que se acumulou enquanto ele ia sai junto no próximo
 *     (`lote`). Vários POSTs ao mesmo tempo viajam por conexões diferentes e
 *     chegam fora de ordem — a posição de agora atropelada pela de 100 ms atrás;
 *   • `troca: true` (posição, retrato do mundo): só o mais novo interessa, então
 *     o que ainda está na fila é SUBSTITUÍDO. Com a rede lenta a fila não cresce,
 *     os recados só ficam mais espaçados.
 *
 * `aoEstado(ligado, motivo)`: `motivo === 'bilhete'` quer dizer que o servidor
 * não nos conhece mais (caiu, reiniciou, a carência venceu) — é entrar de novo.
 */
export function transporteMundo(base, bilhete, aoReceber, aoEstado = () => {}) {
  const fonte = new EventSource(`${base}/__mundo/ouvir?b=${bilhete}`);
  let fechado = false;
  fonte.onopen = () => aoEstado(true);
  fonte.onerror = () => {
    if (fechado) return;
    // CONNECTING = o navegador está tentando de novo sozinho; CLOSED = desistiu
    // (o servidor recusou o bilhete): quem reabre é o mundo, entrando de novo
    aoEstado(false, fonte.readyState === EventSource.CLOSED ? 'bilhete' : 'rede');
  };
  fonte.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch { return; }
    if (typeof m?.evento === 'string') aoReceber(m.evento, m.carga ?? null, String(m.de ?? ''));
  };

  const fila = [];
  let emVoo = false;
  async function bombear() {
    if (emVoo || fechado || !fila.length) return;
    emVoo = true;
    const lote = fila.splice(0, 32);
    try {
      // text/plain: pedido "simples", sem a pré-consulta de CORS
      const r = await fetch(`${base}/__mundo/falar?b=${bilhete}`, {
        method: 'POST', headers: { 'content-type': 'text/plain' },
        body: JSON.stringify(lote.length === 1 ? { evento: lote[0].evento, carga: lote[0].carga } : { lote: lote.map(({ evento, carga }) => ({ evento, carga })) }),
      });
      if (r.status === 401 && !fechado) aoEstado(false, 'bilhete');
    } catch { /* a rede piscou: a posição seguinte cobre a que se perdeu */ }
    emVoo = false;
    bombear();
  }

  return {
    tipo: 'mundo',
    enviar(evento, carga, { troca = false } = {}) {
      if (fechado) return;
      // só troca o que TAMBÉM entrou como trocável: um `mundo` que leva os
      // relógios (`est`) entra sem `troca`, e o retrato seguinte não o apaga
      const i = troca ? fila.findIndex((x) => x.troca && x.evento === evento) : -1;
      if (i >= 0) fila[i].carga = carga; else fila.push({ evento, carga, troca });
      if (fila.length > 200) fila.splice(0, fila.length - 200);   // sem rede há muito tempo: o velho não interessa
      bombear();
    },
    fechar() { fechado = true; fonte.close(); },
  };
}

/** Responde em `ms` o servidor da Masmorra em `base`? É o teste de "mesma rede". */
export async function alcancavel(base, ms = 1500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`${base}/__saude`, { signal: ctl.signal, cache: 'no-store' });
    return r.ok && (await r.json())?.quem === 'masmorra-do-carrasco';
  } catch { return false; } finally { clearTimeout(t); }
}

/** Os endereços deste computador na rede (para o convidado tentar). null se o servidor for antigo. */
export async function minhaRede() {
  if (!temRedeLocal()) return null;   // host só de arquivos (GitHub Pages): não há `/__lan/*`
  try { const r = await fetch('/__lan/info', { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}

/** Salas anunciadas por outros computadores da rede local. */
export async function salasNaRede() {
  if (!temRedeLocal()) return [];
  try {
    const r = await fetch('/__lan/vizinhos', { cache: 'no-store' });
    return r.ok ? (await r.json()).salas ?? [] : [];
  } catch { return []; }
}

/** Dentre os IPs do anfitrião, o primeiro que responde. `null` = não estamos na mesma rede. */
export async function acharNaRede({ ips, porta } = {}) {
  if (!Array.isArray(ips) || !Number.isInteger(porta)) return null;
  const bases = ips.filter((ip) => /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)).slice(0, 6).map((ip) => `http://${ip}:${porta}`);
  const achou = await Promise.all(bases.map(async (b) => ((await alcancavel(b)) ? b : null)));
  return achou.find(Boolean) ?? null;
}
