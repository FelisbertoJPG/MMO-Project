// Servidor estático mínimo (sem dependências) — módulos ES não carregam via file://
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { atenderLan, iniciarDescoberta } from './rede-local.mjs';
import { criarMundo } from './servidor-mundo.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const saveDir = path.join(root, 'saves');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Um save por CONTA (`?conta=<id do Supabase>`) e um sem conta (`progresso.json`,
// quem joga offline). O id é conferido por formato: ele vira nome de arquivo.
function progresso(req, res) {
  const json = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  const conta = new URL(req.url, 'http://x').searchParams.get('conta');
  if (conta && !UUID.test(conta)) return json(400, { erro: 'conta inválida' });
  const saveFile = path.join(saveDir, conta ? `conta-${conta.toLowerCase()}.json` : 'progresso.json');
  if (req.method === 'GET') {
    return fs.readFile(saveFile, 'utf8', (err, txt) => {
      if (err) return json(404, { erro: 'sem progresso salvo' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(txt);
    });
  }
  if (req.method === 'DELETE') {
    return fs.rm(saveFile, { force: true }, () => json(200, { ok: true }));
  }
  if (req.method === 'POST') {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; if (body.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { JSON.parse(body); } catch { return json(400, { erro: 'JSON inválido' }); }
      // Grava num temporário e renomeia: um desligamento no meio não corrompe o save
      fs.mkdirSync(saveDir, { recursive: true });
      const tmp = saveFile + '.tmp';
      fs.writeFile(tmp, body, (err) => {
        if (err) return json(500, { erro: err.message });
        fs.rename(tmp, saveFile, (err2) => err2 ? json(500, { erro: err2.message }) : json(200, { ok: true }));
      });
    });
    return;
  }
  res.writeHead(405); res.end();
}

// O servidor escuta em TODAS as interfaces (é o que deixa o amigo da mesma rede
// entrar na sala, e quem hospeda um mundo recebe os jogadores por aqui). Por
// isso o que é do jogador — o save — só atende pedidos deste próprio computador.
const soDaqui = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);

// `HOSPEDAR=1`: este servidor está na internet (atrás de um túnel, de um proxy,
// numa VPS) só para servir o jogo e o MUNDO ONLINE. Aí "é deste computador?" não
// quer dizer mais nada — o túnel e o proxy rodam AQUI, e todo pedido de fora
// chega como 127.0.0.1. Sem esta trava, qualquer visitante leria, gravaria e
// APAGARIA o save da Jornada de quem hospeda, e abriria salas em nome dele.
// Com ela, `/__save` e `/__lan/*` não existem neste servidor.
const HOSPEDANDO = process.env.HOSPEDAR === '1';

// O MUNDO ONLINE (servidor-mundo.mjs): as rotas `/__mundo/*`.
const mundo = criarMundo(root);

// O que o servidor estático entrega é uma lista BRANCA: a página e as pastas
// do jogo. Os dados (`saves/`, `mundo/`) ficam de fora — sem isto, qualquer um
// da rede baixaria `/saves/conta-<id>.json` ou `/mundo/personagens/<id>.json`.
// Branca, e não "menos estas duas": no Windows `/saves./x` e `/SAVES/x` abrem a
// mesma pasta, e uma lista negra teria de conhecer todos os disfarces.
const FRENTE = new Set(['index.html', 'css', 'js', 'vendor', 'assets']);

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // Identidade para o launcher (masmorra.exe): é como ele distingue "o jogo já
  // está nesta porta" de "outro programa pegou a porta" (a 5173 é a do Vite).
  // Também é a sonda de "estamos na mesma rede?" da sala (js/rede/transporte.js),
  // que vem de outra origem — daí o CORS.
  if (urlPath === '/__saude') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    // `hospedando`: o jogo sabe que aqui não há `/__save` (js/hospedagem.js)
    return res.end(JSON.stringify({ quem: 'masmorra-do-carrasco', pid: process.pid, hospedando: HOSPEDANDO }));
  }
  // Progresso do jogador (js/save.js). Fica em ARQUIVO, e não no localStorage:
  // o launcher pode subir o jogo em outra porta, e cada porta tem o seu.
  if (urlPath === '/__save') {
    if (HOSPEDANDO || !soDaqui(req)) { res.writeHead(403); return res.end(); }
    return progresso(req, res);
  }
  // Salas na rede local (rede-local.mjs)
  if (HOSPEDANDO && urlPath.startsWith('/__lan/')) { res.writeHead(404); return res.end(); }
  if (atenderLan(req, res, urlPath, { porta: port, ehDaqui: soDaqui(req) })) return;
  // O mundo online (servidor-mundo.mjs)
  if (mundo.atender(req, res, urlPath)) return;
  const file = path.normalize(path.join(root, urlPath === '/' ? 'index.html' : urlPath));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  if (!FRENTE.has(path.relative(root, file).split(path.sep)[0])) { res.writeHead(404); return res.end('404'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(port, () => {
  console.log(`Cinzas do Abismo rodando em http://localhost:${port}`);
  if (HOSPEDANDO) console.log('HOSPEDAR=1: servindo o jogo e o mundo online para fora — sem save local e sem salas da rede local');
  else iniciarDescoberta(port);
});
