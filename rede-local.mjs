// A REDE LOCAL da Masmorra (02/10/2026) — salas de duelo/co-op entre PCs da
// mesma rede, sem internet e sem Supabase. Usado só pelo server.js.
//
// O navegador não aceita conexões, então quem RETRANSMITE é este servidor:
//
//   página do anfitrião ──SSE──┐                 ┌──POST /__lan/falar── página do convidado
//   (localhost)                ├─ server.js do ──┤
//   página do anfitrião ──POST─┘   ANFITRIÃO     └──SSE /__lan/ouvir─── (http://192.168.x.x:porta)
//
// Cada sala é um código de 6 letras; o que um manda chega aos outros da sala
// (`{de, evento, carga}`, ver js/rede/transporte.js). A sala é ANUNCIADA na
// rede por UDP (broadcast na porta 41234) enquanto a página do anfitrião estiver
// ouvindo, e `/__lan/vizinhos` lista as salas que os outros servidores anunciam.
//
// Nada daqui é seguro contra quem está na mesma rede (o recado é do cliente,
// como no broadcast do Supabase): é jogo entre amigos na mesma casa/LAN. Quem
// confere o conteúdo é o jogo (`protocolo.js`). O que é do JOGADOR — o save —
// fica fechado para fora do computador (ver `soDaqui` no server.js).
import dgram from 'node:dgram';
import os from 'node:os';
import crypto from 'node:crypto';

const QUEM = 'masmorra-do-carrasco';
const PORTA_UDP = 41234;
const ANUNCIO_MS = 2000;
/** Sem anúncio por isto, o vizinho sai da lista. */
const VIZINHO_SOME_MS = 7000;
const SALA = /^[A-Z0-9]{6}$/;
const ID = /^[\w-]{1,64}$/;
const MAX_RECADO = 64 * 1024;

const nonce = crypto.randomBytes(8).toString('hex');   // para reconhecer o próprio anúncio
const salas = new Map();      // codigo → { clientes: Set<{id, res}>, anuncio: {nome, dono} | null }
const vizinhos = new Map();   // "ip:porta" → { ip, porta, salas, visto }

/** IPv4 desta máquina na rede (sem o 127.0.0.1), com o endereço de broadcast de cada uma. */
export function ipsLocais() {
  const lista = [];
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs ?? []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      const a = ip4(i.address), m = ip4(i.netmask);
      lista.push({ ip: i.address, broadcast: num4((a | ~m) >>> 0) });
    }
  }
  return lista;
}
const ip4 = (s) => s.split('.').reduce((n, x) => ((n << 8) | Number(x)) >>> 0, 0);
const num4 = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', ...CORS });
  res.end(JSON.stringify(obj));
}

/** Atende `/__lan/*`. Devolve false se a rota não é daqui. */
export function atenderLan(req, res, urlPath, { porta, ehDaqui }) {
  if (!urlPath.startsWith('/__lan/')) return false;
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return true; }
  const q = new URL(req.url, 'http://x').searchParams;
  const rota = urlPath.slice('/__lan/'.length);

  if (rota === 'info') { json(res, 200, { ips: ipsLocais().map((i) => i.ip), porta }); return true; }

  if (rota === 'vizinhos') {
    const agora = Date.now(), lista = [];
    for (const [k, v] of vizinhos) {
      if (agora - v.visto > VIZINHO_SOME_MS) { vizinhos.delete(k); continue; }
      for (const s of v.salas ?? []) lista.push({ codigo: s.codigo, nome: s.nome, ip: v.ip, porta: v.porta });
    }
    json(res, 200, { salas: lista });
    return true;
  }

  const codigo = q.get('sala') ?? '', id = q.get('id') ?? '';
  if (!SALA.test(codigo) || !ID.test(id)) { json(res, 400, { erro: 'sala ou id inválido' }); return true; }

  if (rota === 'ouvir' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...CORS });
    res.write(': ok\n\n');
    let sala = salas.get(codigo);
    if (!sala) { sala = { clientes: new Set(), anuncio: null }; salas.set(codigo, sala); }
    const cliente = { id, res };
    sala.clientes.add(cliente);
    // Só a página DESTE computador anuncia sala: senão qualquer um da rede
    // poria salas na lista dos outros em nome desta máquina.
    if (q.get('anunciar') === '1' && ehDaqui) sala.anuncio = { nome: (q.get('nome') ?? '').slice(0, 24), dono: cliente };
    const batida = setInterval(() => res.write(': .\n\n'), 15000);
    req.on('close', () => {
      clearInterval(batida);
      sala.clientes.delete(cliente);
      if (sala.anuncio?.dono === cliente) sala.anuncio = null;
      if (!sala.clientes.size) salas.delete(codigo);
    });
    return true;
  }

  if (rota === 'falar' && req.method === 'POST') {
    let corpo = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { corpo += c; if (corpo.length > MAX_RECADO) req.destroy(); });
    req.on('end', () => {
      let r;
      try { r = JSON.parse(corpo); } catch { return json(res, 400, { erro: 'JSON inválido' }); }
      if (typeof r?.evento !== 'string' || r.evento.length > 32) return json(res, 400, { erro: 'evento inválido' });
      const linha = `data: ${JSON.stringify({ de: id, evento: r.evento, carga: r.carga ?? null })}\n\n`;
      for (const c of salas.get(codigo)?.clientes ?? []) if (c.id !== id) c.res.write(linha);
      res.writeHead(204, CORS); res.end();
    });
    return true;
  }

  json(res, 404, { erro: 'rota desconhecida' });
  return true;
}

/** Liga o anúncio/escuta por UDP. Falhar aqui só desliga a LISTA de salas: entrar pelo IP continua. */
export function iniciarDescoberta(porta) {
  const udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  udp.on('error', (e) => console.warn('[rede local] sem descoberta de salas:', e.message));
  udp.on('message', (buf, rinfo) => {
    let m;
    try { m = JSON.parse(buf.toString('utf8')); } catch { return; }
    if (m?.quem !== QUEM || m.nonce === nonce || !Number.isInteger(m.porta) || !Array.isArray(m.salas)) return;
    const salasOk = m.salas.filter((s) => SALA.test(s?.codigo ?? '')).slice(0, 8)
      .map((s) => ({ codigo: s.codigo, nome: String(s.nome ?? '').slice(0, 24) }));
    vizinhos.set(`${rinfo.address}:${m.porta}`, { ip: rinfo.address, porta: m.porta, salas: salasOk, visto: Date.now() });
  });
  udp.bind(PORTA_UDP, () => {
    try { udp.setBroadcast(true); } catch { }
    setInterval(() => {
      const anunciadas = [...salas].filter(([, s]) => s.anuncio).map(([codigo, s]) => ({ codigo, nome: s.anuncio.nome }));
      const msg = Buffer.from(JSON.stringify({ quem: QUEM, nonce, porta, salas: anunciadas }));
      const destinos = new Set(['255.255.255.255', ...ipsLocais().map((i) => i.broadcast)]);
      for (const d of destinos) udp.send(msg, PORTA_UDP, d, () => {});
    }, ANUNCIO_MS);
  });
}
