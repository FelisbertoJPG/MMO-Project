/**
 * EDITOR DE ÁRVORE — uma página local para o dono DESENHAR uma árvore de habilidades: criar
 * os quadrinhos, ligá-los (requisitos), dar os pontos de cada um e gravar o JSON que o Claude
 * lê depois (19/11/2026, para a árvore do Novato — D27).
 *
 * MORA NO EDITOR DE PERSONAGEM (24/11/2026; é ferramenta de dev): a aba Árvore do editor de cenas
 * (`personagem.html#arvore`, porta 8090). O `alvo-servidor.mjs` de lá importa este arquivo e
 * passa a ele o que chega em /__alvo/ds/arvore/… (`atenderEditorArvore`) — ligou o editor, a
 * árvore está junto. Por isso a página só usa endereço RELATIVO (`balanco`, não `/balanco`).
 * Ainda roda sozinho (outro PC, sem o editor de cenas):
 *   node ferramentas/habilidades/editor-arvore.mjs      → http://localhost:5181
 *   ?arvore=nome abre outra árvore (padrão: "novato"); EDITOR_ARVORE_PORTA=xxxx muda a porta
 *
 * Grava em planejamento/arvores/<nome>.json (a versão de ANTES DESTA SESSÃO do editor fica em
 * <nome>.anterior.json: com o "Ao vivo", a página grava sozinha a cada mudança).
 * Fica fora do server.js de propósito, como a vitrine: não entra na lista branca, não vai para
 * o Pages e só atende nesta máquina (127.0.0.1).
 *
 * AO VIVO COM O JOGO LOCAL (21/11/2026; o outro lado é js/ao-vivo.js):
 *   • gravou a página dos Caminhos (PAGINA_DO_JOGO) → roda o gerar-catalogo.mjs e avisa o
 *     jogo pelo canal `/eventos` (`catalogo`): a tela K muda na hora;
 *   • `/balanco` lê e grava `assets/balanco.json` (o painel Balanceamento) e avisa (`balanco`).
 * Só o `/eventos` (só leitura) responde a outra origem; os POSTs pedem `application/json`, que
 * um site de fora não manda sem permissão (o navegador barra).
 */
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, copyFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';

const aqui = fileURLToPath(new URL('./', import.meta.url));
const raiz = fileURLToPath(new URL('../../', import.meta.url));
const pasta = fileURLToPath(new URL('../../planejamento/arvores/', import.meta.url));
const PAGINA_DO_JOGO = 'resumo-3-comecos';   // a do gerar-catalogo.mjs (PAGINA)
const BALANCO = raiz + 'assets/balanco.json';
const comBackup = new Set();                  // as árvores que já guardaram o .anterior nesta sessão
const ouvintes = new Set();                   // o jogo local escutando (/eventos)

/** Manda um evento para todo jogo local ligado. */
function avisar(tipo, dados = {}) {
  for (const res of ouvintes) res.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`);
}

/** Roda o gerador do catálogo; devolve null (deu certo) ou a linha do erro. */
function gerarCatalogo() {
  return new Promise((ok) => execFile(process.execPath, [aqui + 'gerar-catalogo.mjs'], { cwd: raiz, timeout: 20000 }, (erro, _saida, falha) => {
    ok(erro ? (String(falha || erro.message).trim().split('\n').find((l) => /Error:/.test(l)) ?? 'o gerador falhou') : null);
  }));
}

/** Os valores do balanceamento ({ campo: valor }). */
const valoresDo = (b) => Object.fromEntries(Object.entries(b.campos).map(([k, c]) => [k, c.valor]));
const porta = Number(process.env.EDITOR_ARVORE_PORTA) || 5181;
const NOME_OK = /^[a-z0-9][a-z0-9_-]{0,40}$/;
const PAGINAS = {
  '/': ['editor-arvore.html', 'text/html; charset=utf-8'],
  '/editor-arvore.js': ['editor-arvore.js', 'text/javascript; charset=utf-8'],
};

const responder = (res, cod, corpo, tipo = 'application/json; charset=utf-8') => {
  res.writeHead(cod, { 'Content-Type': tipo, 'Cache-Control': 'no-store' });
  res.end(typeof corpo === 'string' ? corpo : JSON.stringify(corpo));
};

function lerCorpo(req, max = 2e6) {
  return new Promise((ok, falha) => {
    let s = '';
    req.setEncoding('utf8');
    req.on('data', (p) => { s += p; if (s.length > max) { falha(new Error('grande demais')); req.destroy(); } });
    req.on('end', () => ok(s));
    req.on('error', falha);
  });
}

/** O que barra uma árvore torta antes de gravar (o editor sempre manda certo; isto é a trava). */
function arvoreTorta(a) {
  if (!a || typeof a !== 'object' || !Array.isArray(a.nos)) return 'falta a lista "nos"';
  if (!Number.isFinite(a.pontos)) return '"pontos" não é número';
  const ids = new Set();
  for (const n of a.nos) {
    if (typeof n?.id !== 'string' || !n.id || ids.has(n.id)) return `id faltando ou repetido: ${n?.id}`;
    ids.add(n.id);
  }
  for (const n of a.nos) {
    for (const id of Object.keys(n.requer_minimo ?? {})) if (!ids.has(id)) return `${n.id} pede ${id}, que não existe`;
  }
  return null;
}

/** JSON com 2 espaços, mas com a posição `[x, y]` numa linha só (fica legível). */
const formatar = (a) => JSON.stringify(a, null, 2)
  .replace(/"pos": \[\s+(-?[\d.]+),\s+(-?[\d.]+)\s+\]/g, '"pos": [$1, $2]') + '\n';

/**
 * Atende um pedido do editor. `url` é o endereço A PARTIR do editor ('/', '/balanco',
 * '/arvore?nome=…'): o servidor daqui passa o dele; o Editor de Personagem, o que vem depois de
 * /__alvo/ds/arvore. Sempre responde (o que não conhece vira 404).
 */
export async function atenderEditorArvore(req, res, url) {
  try {
    const pag = PAGINAS[url.pathname];
    if (pag && req.method === 'GET') return responder(res, 200, readFileSync(aqui + pag[0], 'utf8'), pag[1]);

    // o canal do jogo local (js/ao-vivo.js): só eventos, só leitura
    if (url.pathname === '/eventos' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'Access-Control-Allow-Origin': '*' });
      res.write('retry: 5000\n\n');
      ouvintes.add(res);
      const vivo = setInterval(() => res.write(': ok\n\n'), 25000);
      req.on('close', () => { clearInterval(vivo); ouvintes.delete(res); });
      return;
    }

    // gravar só com JSON (um site de fora não consegue mandar isso para cá sem permissão)
    if (req.method === 'POST' && !/^application\/json/.test(req.headers['content-type'] ?? '')) return responder(res, 415, { erro: 'só application/json' });

    if (url.pathname === '/balanco') {
      const b = JSON.parse(readFileSync(BALANCO, 'utf8'));
      if (req.method === 'GET') return responder(res, 200, b);
      if (req.method === 'POST') {
        const novo = JSON.parse(await lerCorpo(req, 1e4));
        for (const [k, c] of Object.entries(b.campos)) {
          const v = Number(novo?.[k]);
          if (!Number.isFinite(v)) continue;
          const casas = String(c.passo).split('.')[1]?.length ?? 0;
          c.valor = Number(Math.min(c.max, Math.max(c.min, v)).toFixed(casas));
        }
        writeFileSync(BALANCO + '.tmp', JSON.stringify(b, null, 2) + '\n');
        renameSync(BALANCO + '.tmp', BALANCO);
        avisar('balanco', valoresDo(b));
        return responder(res, 200, { ok: true, valores: valoresDo(b), jogos: ouvintes.size });
      }
    }

    if (url.pathname === '/arvores') {
      const nomes = existsSync(pasta) ? readdirSync(pasta).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((n) => NOME_OK.test(n)) : [];
      return responder(res, 200, nomes);
    }

    if (url.pathname === '/arvore') {
      const nome = url.searchParams.get('nome') ?? '';
      if (!NOME_OK.test(nome)) return responder(res, 400, { erro: 'nome de árvore inválido' });
      const arq = pasta + nome + '.json';
      if (req.method === 'GET') {
        // arquivo que não existe = árvore nova (null); arquivo torto = erro, para a página NÃO gravar por cima
        if (!existsSync(arq)) return responder(res, 200, 'null');
        return responder(res, 200, JSON.stringify(JSON.parse(readFileSync(arq, 'utf8'))));
      }
      if (req.method === 'POST') {
        const a = JSON.parse(await lerCorpo(req));
        const torta = arvoreTorta(a);
        if (torta) return responder(res, 400, { erro: torta });
        mkdirSync(pasta, { recursive: true });
        // o .anterior guarda a versão de ANTES desta sessão (o "Ao vivo" grava a cada mudança)
        if (existsSync(arq) && !comBackup.has(nome)) { copyFileSync(arq, pasta + nome + '.anterior.json'); comBackup.add(nome); }
        writeFileSync(arq + '.tmp', formatar(a));
        renameSync(arq + '.tmp', arq);
        const resposta = { ok: true, arquivo: `planejamento/arvores/${nome}.json` };
        if (nome === PAGINA_DO_JOGO) {
          const erro = await gerarCatalogo();
          if (erro) resposta.jogo_erro = erro;
          else { avisar('catalogo'); resposta.jogo = ouvintes.size ? `jogo atualizado (${ouvintes.size})` : 'catálogo gerado (nenhum jogo local ligado)'; }
        }
        return responder(res, 200, resposta);
      }
    }
    responder(res, 404, { erro: '404' });
  } catch (e) {
    responder(res, 500, { erro: String(e.message) });
  }
}

// rodado direto (não importado pelo Editor de Personagem): o servidor próprio
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  http.createServer((req, res) => atenderEditorArvore(req, res, new URL(req.url, 'http://x')))
    .listen(porta, '127.0.0.1', () => console.log(`Editor de árvore: http://localhost:${porta}`));
}
