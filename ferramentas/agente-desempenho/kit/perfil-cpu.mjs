#!/usr/bin/env node
/**
 * PERFIL DE CPU de uma página, pelo protocolo de depuração do Chrome — sem dependências
 * (Node 18+). Diz EM QUE FUNÇÃO a CPU do quadro está: é o que separa "o three.js
 * percorrendo a cena" de "montando chamadas de desenho" de "a lógica do jogo" — o que o
 * monitor, sozinho, junta tudo na fase "render".
 *
 *   node perfil-cpu.mjs <url> [opções]
 *
 *   --segundos 5        quanto tempo de amostras
 *   --espera 5          segundos depois de a página carregar, antes de preparar
 *   --preparar "<js>"   JavaScript rodado na página antes do perfil (pode usar await):
 *                       entrar no jogo, ir ao lugar pesado. `--preparar @arquivo.js` lê do arquivo
 *   --depois 2          segundos entre o preparar e o perfil (a cena assentar)
 *   --avaliar "<js>"    uma expressão avaliada NO FIM, com o resultado impresso — por exemplo
 *                       "await __monitor.diagnosticar().then(() => __monitor.relatorio())"
 *   --top 30            quantas linhas por tabela
 *   --salvar x.cpuprofile   grava o perfil (abre no DevTools: Performance → carregar)
 *   --headless          sem janela (a placa pode virar software: os números de GPU não valem;
 *                       a DIVISÃO da CPU por função continua valendo)
 *   --largura 1280 --altura 720
 *   --freio 4           a CPU da página N vezes mais lenta (o freio do DevTools): numa máquina
 *                       forte, é como se vê o que uma CPU fraca vê — o jogo sai do teto da tela
 *                       e o ganho de cada mudança aparece em quadros/s
 *   --escala 2          devicePixelRatio forçado (mais pixels: carrega a PLACA, que não tem freio)
 *   --chrome <caminho>  (ou a variável CHROME) quando o Chrome não está no lugar de sempre
 *   --anexar 9222       em vez de abrir um Chrome: usa um já aberto com
 *                       --remote-debugging-port=9222 (você navega até o lugar pesado à mão);
 *                       a página é a que tem <url> no endereço. Não fecha nada no fim.
 *
 * Abre um Chrome SEU, com perfil temporário, e o fecha no fim. A janela dele fica com o
 * laço rodando mesmo coberta por outra (janela escondida para de desenhar: é a armadilha
 * de medir pelo navegador do dia a dia).
 */
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ------------------------------------------------------------ os argumentos
const args = process.argv.slice(2);
const opcao = (nome, padrao = null) => { const i = args.indexOf(`--${nome}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : padrao; };
const tem = (nome) => args.includes(`--${nome}`);
const comValor = new Set(['segundos', 'espera', 'preparar', 'depois', 'avaliar', 'top', 'salvar', 'largura', 'altura', 'chrome', 'anexar', 'freio', 'escala']);
const url = args.find((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--') && comValor.has(args[i - 1].slice(2))));
if (!url || tem('ajuda') || tem('help')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*\*\n?/, '').replace(/^ \* ?/gm, ''));
  process.exit(url ? 0 : 1);
}
const SEGUNDOS = Number(opcao('segundos', 5)), ESPERA = Number(opcao('espera', 5)), DEPOIS = Number(opcao('depois', 2)), TOP = Number(opcao('top', 30));
const lerJs = (v) => (v?.startsWith('@') ? readFileSync(v.slice(1), 'utf8') : v);
const PREPARAR = lerJs(opcao('preparar')), AVALIAR = lerJs(opcao('avaliar'));
const ANEXAR = opcao('anexar') ? Number(opcao('anexar')) : null;
const FREIO = Number(opcao('freio', 1)), ESCALA = opcao('escala') ? Number(opcao('escala')) : null;
const dormir = (s) => new Promise((f) => setTimeout(f, s * 1000));

// ------------------------------------------------------------ um WebSocket mínimo (só ws:// local)
class Soquete {
  static conectar(endereco) {
    return new Promise((ok, erro) => {
      const u = new URL(endereco), s = net.connect(Number(u.port), u.hostname);
      const chave = crypto.randomBytes(16).toString('base64'), ws = new Soquete(s);
      let cabeca = Buffer.alloc(0);
      const aoDado = (d) => {
        cabeca = Buffer.concat([cabeca, d]);
        const fim = cabeca.indexOf('\r\n\r\n');
        if (fim < 0) return;
        s.off('data', aoDado);
        if (!/^HTTP\/1\.1 101/.test(cabeca.toString('latin1', 0, fim))) return erro(new Error('o Chrome recusou o WebSocket: ' + cabeca.toString('latin1', 0, 80)));
        s.on('data', (x) => ws.receber(x));
        ok(ws);
        if (cabeca.length > fim + 4) ws.receber(cabeca.subarray(fim + 4));
      };
      s.on('data', aoDado);
      s.on('error', erro);
      s.on('connect', () => s.write(`GET ${u.pathname}${u.search} HTTP/1.1\r\nHost: ${u.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: ${chave}\r\nSec-WebSocket-Version: 13\r\n\r\n`));
    });
  }

  constructor(s) { this.s = s; this.buf = Buffer.alloc(0); this.partes = []; this.aoTexto = () => {}; s.on('close', () => { this.fechado = true; this.aoFechar?.(); }); }

  enviar(texto, opcode = 1) {
    const dado = Buffer.from(texto), n = dado.length, mascara = crypto.randomBytes(4);
    const cab = n < 126 ? Buffer.from([0x80 | opcode, 0x80 | n]) : n < 65536 ? Buffer.from([0x80 | opcode, 0x80 | 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | opcode; b[1] = 0x80 | 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
    const corpo = Buffer.alloc(n);
    for (let i = 0; i < n; i++) corpo[i] = dado[i] ^ mascara[i & 3];
    this.s.write(Buffer.concat([cab, mascara, corpo]));
  }

  receber(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      let n = b[1] & 127, p = 2;
      if (n === 126) { if (b.length < 4) return; n = b.readUInt16BE(2); p = 4; } else if (n === 127) { if (b.length < 10) return; n = Number(b.readBigUInt64BE(2)); p = 10; }
      if (b.length < p + n) return;
      const fim = !!(b[0] & 0x80), opcode = b[0] & 15, corpo = b.subarray(p, p + n);
      this.buf = b.subarray(p + n);
      if (opcode === 9) this.enviar(corpo, 10);        // ping → pong
      else if (opcode === 8) { this.s.end(); return; }  // fechar
      else if (opcode <= 2) {
        this.partes.push(corpo);
        if (fim) { const t = Buffer.concat(this.partes).toString('utf8'); this.partes = []; this.aoTexto(t); }
      }
    }
  }

  fechar() { try { this.s.end(); } catch { /* já fechou */ } }
}

/** Uma sessão do protocolo de depuração: `await cdp.pedir('Dominio.metodo', { … })`. */
class Sessao {
  static async abrir(endereco) { const s = new Sessao(await Soquete.conectar(endereco)); return s; }

  constructor(ws) {
    this.ws = ws; this.id = 0; this.esperas = new Map(); this.ouvintes = new Map();
    ws.aoTexto = (t) => {
      const m = JSON.parse(t);
      if (m.id && this.esperas.has(m.id)) { const [ok, erro, metodo] = this.esperas.get(m.id); this.esperas.delete(m.id); m.error ? erro(new Error(`${metodo}: ${m.error.message}`)) : ok(m.result); }
      else if (m.method) for (const f of this.ouvintes.get(m.method) ?? []) f(m.params);
    };
    ws.aoFechar = () => { for (const [, erro, metodo] of this.esperas.values()) erro(new Error(`${metodo}: a página fechou`)); this.esperas.clear(); };
  }

  pedir(metodo, params = {}) { return new Promise((ok, erro) => { const id = ++this.id; this.esperas.set(id, [ok, erro, metodo]); this.ws.enviar(JSON.stringify({ id, method: metodo, params })); }); }

  uma(evento, limiteS) {
    return new Promise((ok) => {
      const f = (p) => { clearTimeout(t); this.ouvintes.set(evento, (this.ouvintes.get(evento) ?? []).filter((x) => x !== f)); ok(p); };
      const t = setTimeout(() => f(null), limiteS * 1000);
      this.ouvintes.set(evento, [...(this.ouvintes.get(evento) ?? []), f]);
    });
  }

  /** Roda JavaScript na página (com await) e devolve o valor. */
  async rodar(codigo) {
    const r = await this.pedir('Runtime.evaluate', { expression: `(async () => { ${codigo} })()`, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error('na página: ' + (r.exceptionDetails.exception?.description ?? r.exceptionDetails.text));
    return r.result?.value;
  }
}

// ------------------------------------------------------------ o Chrome
function acharChrome() {
  const pedido = opcao('chrome') ?? process.env.CHROME;
  if (pedido) return pedido;
  const e = process.env, lista = process.platform === 'win32' ? [
    `${e.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`, `${e['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`, `${e.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${e['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`, `${e.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ] : process.platform === 'darwin' ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium']
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
  const achado = lista.find((p) => p && existsSync(p));
  if (!achado) throw new Error('não achei o Chrome: passe --chrome <caminho> (ou a variável CHROME)');
  return achado;
}
const json = async (porta, caminho) => (await fetch(`http://127.0.0.1:${porta}${caminho}`)).json();
async function portaLivre() { return new Promise((ok) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => ok(p)); }); }); }

// ------------------------------------------------------------ o perfil → as tabelas
function resumir(perfil, quadrosPorS) {
  const nos = new Map(perfil.nodes.map((n) => [n.id, n])), pai = new Map();
  for (const n of perfil.nodes) for (const f of n.children ?? []) pai.set(f, n.id);
  const base = (u) => u.split('/').pop().split('?')[0] || '(a página)';
  const chave = (n) => { const c = n.callFrame, arq = c.url ? base(c.url) : ''; return `${c.functionName || '(anônima)'}${arq ? `  ${arq}:${c.lineNumber + 1}` : ''}`; };
  const arquivo = (n) => (n.callFrame.url ? base(n.callFrame.url) : n.callFrame.functionName.startsWith('(') ? n.callFrame.functionName : '(nativo do navegador)');
  // cada amostra vale o tempo até a seguinte (a última, a mediana)
  const d = perfil.timeDeltas ?? [], am = perfil.samples ?? [], ord = [...d].sort((a, b) => a - b), mediana = ord[ord.length >> 1] ?? 0;
  const proprio = new Map(), total = new Map(), porArquivo = new Map();
  let tudo = 0;
  const visto = new Set();
  for (let i = 0; i < am.length; i++) {
    const peso = (i + 1 < d.length ? d[i + 1] : mediana) / 1000, no = nos.get(am[i]);
    if (!no || !(peso > 0)) continue;
    tudo += peso;
    const k = chave(no);
    proprio.set(k, (proprio.get(k) ?? 0) + peso);
    porArquivo.set(arquivo(no), (porArquivo.get(arquivo(no)) ?? 0) + peso);
    visto.clear();
    for (let id = no.id; id !== undefined; id = pai.get(id)) { const kk = chave(nos.get(id)); if (!visto.has(kk)) { visto.add(kk); total.set(kk, (total.get(kk) ?? 0) + peso); } }
  }
  const de = (m, nome) => m.get(nome) ?? 0, pct = (v) => `${((100 * v) / Math.max(tudo, 1e-9)).toFixed(1).padStart(5)}%`;
  const ocioso = de(proprio, '(idle)'), lixo = de(proprio, '(garbage collector)'), programa = de(proprio, '(program)'), ocupado = tudo - ocioso;
  const L = [];
  L.push(`# Perfil de CPU — ${url}${FREIO > 1 ? ` · CPU com freio de ${FREIO}×` : ''}${ESCALA ? ` · devicePixelRatio ${ESCALA}` : ''}`);
  L.push(`${(tudo / 1000).toFixed(1)} s de amostras (${am.length} amostras)${quadrosPorS ? ` · ${quadrosPorS.toFixed(1)} quadros/s durante o perfil` : ''}${quadrosPorS ? ` · ${(ocupado / Math.max(1, quadrosPorS * tudo / 1000)).toFixed(1)} ms de CPU por quadro` : ''}`);
  L.push(`ociosa ${pct(ocioso).trim()} (folga: quanto mais, melhor) · ocupada ${pct(ocupado).trim()} · coleta de lixo ${pct(lixo).trim()} · "(program)" ${pct(programa).trim()} (o navegador e o driver da placa, fora do JavaScript)`);
  const tabela = (titulo, mapa, pular) => {
    L.push('');
    L.push(titulo);
    const linhas = [...mapa.entries()].filter(([k]) => !pular(k)).sort((a, b) => b[1] - a[1]).slice(0, TOP);
    for (const [k, v] of linhas) L.push(`${pct(v)}  ${v.toFixed(0).padStart(6)} ms  ${k}`);
  };
  tabela('## Por função — tempo PRÓPRIO (onde a CPU está de fato; % do tempo todo)', proprio, (k) => k === '(idle)');
  tabela('## Por função — tempo TOTAL (com o que ela chama: de onde o custo vem)', total, (k) => k === '(root)' || k === '(idle)');
  tabela('## Por arquivo — tempo próprio', porArquivo, (k) => k === '(idle)');
  L.push('');
  L.push('Como ler (three.js): updateMatrixWorld / updateMatrix / compose = refazer a matriz de CADA objeto da cena (objetos demais, ou parados com matrixAutoUpdate) ·');
  L.push('projectObject / intersectsObject / frustum = visitar os objetos para decidir o que desenhar · renderBufferDirect / setProgram / refreshUniforms / drawElements = montar as chamadas de desenho ·');
  L.push('Skeleton.update / boneTexture / texSubImage2D = esqueletos (um envio por esqueleto por quadro) · AnimationMixer / PropertyBinding = animação · (garbage collector) = lixo criado por quadro.');
  return L.join('\n');
}

// ------------------------------------------------------------ o roteiro
let chrome = null, pastaPerfil = null, porta = ANEXAR;
async function encerrar() {
  if (!chrome) return;
  try { const v = await json(porta, '/json/version'); const b = await Sessao.abrir(v.webSocketDebuggerUrl); b.pedir('Browser.close').catch(() => {}); await dormir(1); b.ws.fechar(); } catch { /* já fechou */ }
  for (let i = 0; i < 20 && chrome.exitCode === null; i++) await dormir(0.25);
  if (chrome.exitCode === null) chrome.kill();
  for (let i = 0; i < 12; i++) { try { rmSync(pastaPerfil, { recursive: true, force: true }); break; } catch { await dormir(0.5); } }
  chrome = null;
}
process.on('SIGINT', async () => { await encerrar(); process.exit(130); });

try {
  if (!ANEXAR) {
    porta = await portaLivre();
    pastaPerfil = mkdtempSync(path.join(os.tmpdir(), 'perfil-cpu-'));
    chrome = spawn(acharChrome(), [
      `--remote-debugging-port=${porta}`, `--user-data-dir=${pastaPerfil}`, '--no-first-run', '--no-default-browser-check', '--disable-default-apps',
      // a janela coberta ou em segundo plano continua desenhando (senão o laço para e a medida é de nada)
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--disable-features=CalculateNativeWinOcclusion',
      '--autoplay-policy=no-user-gesture-required', `--window-size=${opcao('largura', 1280)},${opcao('altura', 720)}`,
      ...(tem('headless') ? ['--headless=new'] : []), 'about:blank',
    ], { stdio: 'ignore' });
    chrome.on('error', (e) => { console.error('não consegui abrir o Chrome:', e.message); process.exit(1); });
  }
  let alvos = null;
  for (let i = 0; i < 80 && !alvos; i++) { try { alvos = await json(porta, '/json/list'); } catch { await dormir(0.25); } }
  if (!alvos) throw new Error(`o Chrome não respondeu na porta ${porta}${ANEXAR ? ' (abra-o com --remote-debugging-port=' + ANEXAR + ')' : ''}`);
  const paginas = alvos.filter((a) => a.type === 'page');
  const alvo = ANEXAR ? paginas.find((a) => a.url.includes(url)) ?? paginas[0] : paginas[0];
  if (!alvo) throw new Error('nenhuma página aberta no Chrome');
  const cdp = await Sessao.abrir(alvo.webSocketDebuggerUrl);
  await cdp.pedir('Page.enable'); await cdp.pedir('Runtime.enable');
  const erros = [];
  cdp.ouvintes.set('Runtime.exceptionThrown', [(p) => { if (erros.length < 8) erros.push(p.exceptionDetails?.exception?.description?.split('\n')[0] ?? p.exceptionDetails?.text); }]);
  if (ESCALA) await cdp.pedir('Emulation.setDeviceMetricsOverride', { width: Number(opcao('largura', 1280)), height: Number(opcao('altura', 720)), deviceScaleFactor: ESCALA, mobile: false });
  if (!ANEXAR) {
    const carregou = cdp.uma('Page.loadEventFired', 90);
    await cdp.pedir('Page.navigate', { url });
    if (!(await carregou)) console.error('(a página não terminou de carregar em 90 s: sigo assim mesmo)');
    await dormir(ESPERA);
  }
  if (PREPARAR) { const v = await cdp.rodar(PREPARAR); if (v !== undefined) console.error('preparar →', typeof v === 'string' ? v : JSON.stringify(v)); await dormir(DEPOIS); }
  if (FREIO > 1) { await cdp.pedir('Emulation.setCPUThrottlingRate', { rate: FREIO }); await dormir(1); }
  await cdp.rodar('window.__pc = { n: 0, fim: false }; (function f() { if (__pc.fim) return; __pc.n++; requestAnimationFrame(f); })();');
  await cdp.pedir('Profiler.enable');
  await cdp.pedir('Profiler.setSamplingInterval', { interval: 250 });
  const q0 = await cdp.rodar('return __pc.n;'), t0 = Date.now();
  await cdp.pedir('Profiler.start');
  await dormir(SEGUNDOS);
  const { profile } = await cdp.pedir('Profiler.stop');
  const q1 = await cdp.rodar('const n = __pc.n; __pc.fim = true; return n;'), dt = (Date.now() - t0) / 1000;
  if (opcao('salvar')) { writeFileSync(opcao('salvar'), JSON.stringify(profile)); console.error(`perfil gravado em ${opcao('salvar')}`); }
  console.log(resumir(profile, (q1 - q0) / dt));
  if (q1 - q0 < 3) console.log('\nATENÇÃO: quase nenhum quadro durante o perfil — a página não está desenhando (janela escondida? o jogo parado num menu?).');
  if (erros.length) console.log('\nErros de JavaScript na página durante a medida:\n' + erros.map((e) => `  ${e}`).join('\n'));
  if (AVALIAR) {
    const v = await cdp.rodar(`return (${AVALIAR.trim().replace(/;$/, '')});`);
    console.log('\n' + '='.repeat(80) + '\n' + (typeof v === 'string' ? v : JSON.stringify(v, null, 2)));
  }
  if (FREIO > 1 && ANEXAR) await cdp.pedir('Emulation.setCPUThrottlingRate', { rate: 1 });
  cdp.ws.fechar();
} catch (e) {
  console.error('ERRO:', e.message);
  process.exitCode = 1;
} finally {
  await encerrar();
}
