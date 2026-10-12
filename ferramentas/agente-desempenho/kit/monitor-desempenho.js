/**
 * MONITOR DE DESEMPENHO PORTÁTIL — para qualquer projeto three.js (WebGLRenderer).
 *
 * É a ferramenta de diagnóstico do agente `otimizador-de-desempenho`, tirada do monitor do
 * jogo de origem (Lubelion Online, `js/monitor.js`) e solta das coisas de lá. Diz ONDE o
 * quadro gasta tempo (CPU por fase, GPU), ONDE na cena pesa, QUANDO travou e por quê — e,
 * com "Diagnosticar e copiar", mede o lugar desligando UMA coisa de cada vez.
 *
 * INSTALAR (uma linha, depois de criar o renderer):
 *
 *   import { MonitorDesempenho } from './monitor-desempenho.js';
 *   const monitor = new MonitorDesempenho({ renderer, scene, camera, nome: 'Meu jogo' });
 *
 * Não precisa mexer no laço: o monitor embrulha `requestAnimationFrame`, `renderer.render` e
 * a passagem de sombra, e daí tira os quadros, a CPU, as chamadas de desenho e a GPU.
 * F3 abre o painel; `window.__monitor` é o mesmo objeto (console e automação).
 *
 * OPCIONAL, para o relatório dizer mais:
 *   - `monitor.fase('nome')` depois de cada bloco do laço (física, IA, interface…): a CPU
 *     de cada um, por quadro. Sem isso há só "antes do render", "render" e "resto";
 *   - `onde: () => ({ rotulo, x, y, z, yaw })`: onde o jogador está (o padrão é a câmera) —
 *     devolva sempre o MESMO objeto (o monitor não pode gerar lixo por quadro);
 *   - `contexto: () => 'qualidade Alto'`: uma linha livre que vai no relatório;
 *   - `monitor.evento('trocou para o Baixo')`: o que muda os números no meio da sessão;
 *   - `testes: [{ nome, liga, desliga, acao, perde, lento }]` (ou `monitor.teste({...})`):
 *     os testes do lugar que só o projeto sabe fazer (sem o capim, sem a água, LOD mais
 *     perto…). `acao` = a mudança concreta se pesar; `perde` = o que se vê de diferente;
 *     `lento: true` = recompila shader (espera mais antes de medir).
 *
 * REGRAS DA CASA (não as quebre ao mexer aqui):
 *   - nada de objeto/array novo por quadro: é o monitor que mede a coleta de lixo;
 *   - nunca ESPERAR a placa (ler pixels, esperar consulta): a resposta da GPU chega
 *     quadros depois e só é lida quando está pronta;
 *   - tudo o que um teste mexe volta ao que era, mesmo se der erro.
 *
 * Só WebGLRenderer (o WebGPURenderer tem outro `info` e outro cronômetro). Um cronômetro
 * de GPU por vez: se o projeto já mede a placa com `TIME_ELAPSED`, passe `gpu: false`.
 */
const N = 7200;              // quadros guardados (~2 min a 60/s)
const MAX_FASES = 24;
const PICO_MS = 50;          // abaixo disto não é pico (é só um quadro lento)
const MAX_PICOS = 300;
const ANTES = '(antes do render)', RENDER = 'render', RESTO = '(resto do quadro)';

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const mil = (v) => (v >= 1e6 ? (v / 1e6).toFixed(2) + ' mi' : v >= 1e3 ? (v / 1e3).toFixed(0) + ' mil' : String(Math.round(v)));
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const percentil = (ord, p) => (ord.length ? ord[Math.min(ord.length - 1, Math.floor(ord.length * p))] : NaN);
const barra = (v, max, larg = 16) => '█'.repeat(Math.max(0, Math.round((v / Math.max(max, 1e-9)) * larg)));
const graus = (rad) => Math.round((((rad ?? 0) * 180 / Math.PI) % 360 + 360) % 360);

export class MonitorDesempenho {
  constructor({ renderer, scene = null, camera = null, nome = null, onde = null, contexto = null, testes = [],
    tecla = 'F3', bloco = 24, eixoCima = 'y', painel = true, gpu = true, global = '__monitor' } = {}) {
    if (!renderer?.info || typeof renderer.render !== 'function' || typeof renderer.getContext !== 'function') {
      throw new Error('MonitorDesempenho: passe { renderer } (um THREE.WebGLRenderer)');
    }
    this.renderer = renderer; this.cena = scene; this.camera = camera;
    this.nome = nome ?? (document.title || location.pathname);
    this._ondeFn = onde; this._contextoFn = contexto;
    this.bloco = bloco; this.eixoCima = eixoCima; this.tecla = tecla;
    this.testesDoProjeto = [...testes];
    this.fases = []; this.idx = new Map();
    this.q = {
      t: new Float64Array(N), intervalo: new Float32Array(N), cpu: new Float32Array(N), gpu: new Float32Array(N).fill(NaN),
      chamadas: new Uint32Array(N), tri: new Uint32Array(N), sombra: new Uint32Array(N), fase: new Float32Array(N * MAX_FASES),
    };
    this.atual = new Float32Array(MAX_FASES);
    this._pos = { rotulo: '', x: 0, y: 0, z: 0, yaw: 0 };
    this._dentro = 0; this._nivel = 0; this._renders = 0; this._ultRaf = -1e9; this._temQuadro = false;
    this._cpu = 0; this._ch = 0; this._tri = 0; this._sombraCh = 0; this._sombraTri = 0; this._maiorCh = -1;
    this._cam = null; this._cena = null; this._primeiraCam = null; this._sombraFeita = false;
    this.sombraParada = false;   // (um teste do lugar: a passagem de sombra não é redesenhada)
    this.melhorMediana = Infinity;   // o quadro mais curto que a máquina já sustentou (o teto da tela, se ela chega lá)
    this.semRaf = 0;             // quadros contados sem o rAF embrulhado (laço em setTimeout, XR…)
    this.zerar();
    // a GPU: consultas de tempo, reaproveitadas
    const gl = renderer.getContext();
    this.gl = gl;
    this.ext = gpu && gl.getExtension ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    this.livres = []; this.pendentes = []; this.consulta = null; this.gpuAlheia = false;
    // os quadros longos do navegador (com o script culpado), quando ele sabe dizer
    this.loaf = [];
    try {
      const tipo = PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ? 'long-animation-frame' : 'longtask';
      this.tipoLongo = tipo;
      this._observador = new PerformanceObserver((lista) => {
        for (const e of lista.getEntries()) {
          this.loaf.push({ ini: e.startTime, dur: e.duration, bloq: e.blockingDuration ?? null,
            scripts: (e.scripts ?? []).map((s) => ({ fonte: (s.sourceURL || '').split('/').pop() + (s.sourceCharPosition >= 0 ? `@${s.sourceCharPosition}` : ''), funcao: s.sourceFunctionName || s.invoker || '?', dur: s.duration, tipo: s.invokerType, invocador: s.invoker })) });
          if (this.loaf.length > 400) this.loaf.shift();
        }
      });
      this._observador.observe({ type: tipo, buffered: false });
    } catch { this.tipoLongo = null; }
    this._ligar();
    this._aoTeclar = (e) => { if (e.code === this.tecla) { e.preventDefault(); this.alternar(); } };
    window.addEventListener('keydown', this._aoTeclar);
    if (painel) this.montarPainel();
    if (global) { this._global = global; window[global] = this; }
  }

  /** Começa a sessão de novo (o botão "Zerar"): picos, segundos e lugares. */
  zerar() {
    this.n = 0;
    this.ultInicio = 0;
    this.sessaoIni = performance.now(); this.relogioIni = new Date();
    this.picos = []; this.segundos = []; this.seg = null;
    this.regioes = new Map(); this.lugares = new Map();
    this.medianaRecente = 16.7;
    this.anterior = null;
    this.diagnostico = null;
    this.janelasDiag = [];   // [início, fim] de cada teste do lugar (fora das contas)
    this.eventos = [];       // o que mudou os números durante a sessão
  }

  // ------------------------------------------------------------ os embrulhos
  _ligar() {
    const m = this, r = this.renderer, ri = r.info.render;
    // 1. OS QUADROS: cada chamada de `requestAnimationFrame` passa por aqui. O carimbo de
    //    tempo que o navegador entrega é o mesmo para todas as chamadas do mesmo quadro: quando
    //    muda, o quadro virou. O embrulho de cada função é guardado (o laço pede a MESMA
    //    função todo quadro): nada novo por quadro.
    const raf = window.requestAnimationFrame;
    this._rafOrig = raf;
    const embrulhos = new WeakMap();
    this._rafNosso = function (cb) {
      if (typeof cb !== 'function') return raf.call(window, cb);
      let e = embrulhos.get(cb);
      if (!e) { e = (t) => m._chamada(cb, t); embrulhos.set(cb, e); }
      return raf.call(window, e);
    };
    window.requestAnimationFrame = this._rafNosso;
    // 2. A PASSAGEM DE SOMBRA: o three.js a desenha dentro do `render` e zera o
    //    `renderer.info` antes do desenho principal — as chamadas dela não apareceriam
    //    (no jogo de origem eram ~2.200 por quadro, o dobro do resto). Contadas por fora.
    const sm = r.shadowMap;
    if (sm && typeof sm.render === 'function') {
      const sombraOrig = sm.render;
      this._sombraOrig = sombraOrig;
      sm.render = function (...args) {
        if (m.sombraParada && m._sombraFeita) return undefined;   // (o teste "sombra parada")
        const c0 = ri.calls, t0 = ri.triangles;
        const v = sombraOrig.apply(sm, args);
        const d = ri.calls - c0;
        if (d > 0) { m._sombraFeita = true; m._sombraCh += d; m._sombraTri += ri.triangles - t0; }
        return v;
      };
    }
    // 3. O RENDER: o tempo dentro dele é a fase "render"; as chamadas e os triângulos de
    //    cada chamada somam no quadro (reflexo, pós-processamento, interface 3D: cada uma é
    //    um `render`). A câmera PRINCIPAL é a da chamada que mais desenhou.
    const renderOrig = r.render;
    this._renderOrig = renderOrig;
    r.render = function (cena, cam) {
      if (m._nivel > 0) return renderOrig.call(r, cena, cam);   // um render dentro de outro: é do de fora
      const t0 = performance.now(), fora = m._dentro === 0;
      if (fora) m._quadroSemRaf(cam, t0); else m.fase(ANTES, t0);
      if (m._renders++ === 0) m._primeiraCam = cam;
      m._gpuComecar();
      const c0 = ri.calls, tr0 = ri.triangles, s0 = m._sombraCh, st0 = m._sombraTri;
      m._nivel++;
      try { return renderOrig.call(r, cena, cam); }
      finally {
        m._nivel--;
        // (`info.autoReset` desligado — quem usa compositor às vezes desliga — os números
        // acumulam: vale a diferença, menos o que foi da sombra)
        const auto = r.info.autoReset !== false;
        const ch = auto ? ri.calls : ri.calls - c0 - (m._sombraCh - s0), tri = auto ? ri.triangles : ri.triangles - tr0 - (m._sombraTri - st0);
        m._ch += ch; m._tri += tri;
        if (ch >= m._maiorCh) { m._maiorCh = ch; m._cam = cam; m._cena = cena; }
        const t1 = performance.now();
        m.fase(RENDER, t1);
        if (fora) { m._cpu += t1 - t0; m._gpuTerminar(); }
      }
    };
  }

  /** Tira o monitor: os embrulhos voltam ao que eram e o painel sai. */
  destruir() {
    const r = this.renderer;
    if (window.requestAnimationFrame === this._rafNosso) window.requestAnimationFrame = this._rafOrig;
    if (this._renderOrig) r.render = this._renderOrig;
    if (this._sombraOrig) r.shadowMap.render = this._sombraOrig;
    this._observador?.disconnect();
    window.removeEventListener('keydown', this._aoTeclar);
    this.el?.remove();
    if (this._global && window[this._global] === this) delete window[this._global];
  }

  /** Uma chamada de `requestAnimationFrame` (o laço do projeto, ou qualquer outro que use). */
  _chamada(cb, t) {
    if (this._dentro > 0) return cb(t);
    const t0 = performance.now();
    this._ultRaf = t0;
    if (t !== this._carimbo) { this._carimbo = t; this._virar(t0); }
    this.marca = t0;
    this._dentro = 1;
    try { return cb(t); }
    finally {
      this._dentro = 0;
      const t1 = performance.now();
      this.fase(RESTO, t1);
      this._cpu += t1 - t0;
      this._gpuTerminar();
    }
  }

  /** Um `render` fora do rAF embrulhado (laço em setTimeout, XR, rAF guardado antes do
   *  monitor): o quadro vira quando a PRIMEIRA câmera do quadro aparece de novo. A CPU do
   *  quadro, aí, é só a do render (o resto do laço o monitor não vê). */
  _quadroSemRaf(cam, t0) {
    if (t0 - this._ultRaf < 500 && this._temQuadro) { this.marca = t0; return; }   // um render avulso no meio de um laço com rAF
    if (!this._temQuadro || this._renders === 0 || cam === this._primeiraCam) { this._virar(t0); this.semRaf++; }
    this.marca = t0;
  }

  _virar(t0) {
    if (this._temQuadro) this._fim(t0);
    this._inicio(t0);
    this._temQuadro = true;
  }

  // ------------------------------------------------------------ o quadro
  _inicio(t) {
    // depois de uma pausa longa (aba escondida, menu sem laço) o intervalo não conta
    const intervalo = this.ultInicio && t - this.ultInicio < 2000 ? t - this.ultInicio : 0;
    this.ultInicio = t; this.marca = t; this.t0 = t; this.intervaloAtual = intervalo;
    this.atual.fill(0);
    this._cpu = 0; this._ch = 0; this._tri = 0; this._sombraCh = 0; this._sombraTri = 0; this._maiorCh = -1; this._renders = 0;
    this.q.gpu[this.n % N] = NaN;
    if (intervalo && intervalo > PICO_MS && intervalo > 2.5 * this.medianaRecente && this.anterior && !this.diagnosticando) this.registrarPico(t, intervalo);
  }

  /** O fim de uma fase: o tempo desde a última marca vai para `nome`. Chame no laço do
   *  projeto depois de cada bloco (`monitor.fase('fisica')`). */
  fase(nome, t = performance.now()) {
    let i = this.idx.get(nome);
    if (i === undefined) { if (this.fases.length >= MAX_FASES) return; i = this.fases.length; this.fases.push(nome); this.idx.set(nome, i); }
    this.atual[i] += t - this.marca;
    this.marca = t;
  }

  _gpuComecar() {
    if (!this.ext || this.consulta) return;
    const gl = this.gl;
    // outro cronômetro de GPU já ligado (o do próprio projeto): não brigar com ele
    if (gl.getQuery(this.ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) { this.gpuAlheia = true; return; }
    this.consulta = this.livres.pop() ?? gl.createQuery();
    gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.consulta);
  }

  _gpuTerminar() {
    if (!this.consulta) return;
    const gl = this.gl;
    if (gl.getQuery(this.ext.TIME_ELAPSED_EXT, gl.CURRENT_QUERY) === this.consulta) {
      gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pendentes.push({ q: this.consulta, slot: this.n % N, n: this.n });
    } else { gl.deleteQuery(this.consulta); this.gpuAlheia = true; }   // alguém a encerrou: não vale
    this.consulta = null;
  }

  /** As consultas da GPU que já responderam (nunca espera). */
  lerGpu() {
    if (!this.ext || !this.pendentes.length) return;
    const gl = this.gl, disjunto = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    while (this.pendentes.length) {
      const pe = this.pendentes[0];
      if (!gl.getQueryParameter(pe.q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.pendentes.shift();
      if (!disjunto && this.n - pe.n < N) {
        const ms = gl.getQueryParameter(pe.q, gl.QUERY_RESULT) / 1e6, antes = this.q.gpu[pe.slot];
        this.q.gpu[pe.slot] = (Number.isFinite(antes) ? antes : 0) + ms;
        if (this.seg) { this.seg.gpu += ms; this.seg.gpuN++; }
        const rg = this.regioes.get(this.anterior?.regiao); if (rg) { rg.gpu += ms; rg.gpuN++; }
      }
      this.livres.push(pe.q);
    }
  }

  /** Onde o jogador está: o que o projeto disser (`onde`), ou a câmera principal. */
  _onde() {
    const o = this._ondeFn?.();
    if (o) return o;
    const c = this.camera ?? this._cam, p = this._pos;
    if (!c?.matrixWorld) return p;
    const e = c.matrixWorld.elements;
    p.x = e[12]; p.y = e[13]; p.z = e[14];
    p.yaw = this.eixoCima === 'z' ? Math.atan2(-e[8], -e[9]) : Math.atan2(-e[8], -e[10]);   // para onde a câmera olha
    return p;
  }

  _fim(t) {
    const r = this.renderer, Q = this.q, slot = this.n % N, info = r.info;
    this.lerGpu();
    const cpu = this._cpu, chamadas = this._ch + this._sombraCh, tri = this._tri + this._sombraTri;
    Q.t[slot] = this.t0; Q.intervalo[slot] = this.intervaloAtual; Q.cpu[slot] = cpu;
    Q.chamadas[slot] = chamadas; Q.tri[slot] = tri; Q.sombra[slot] = this._sombraCh;
    Q.fase.set(this.atual, slot * MAX_FASES);
    // o que mudou desde o quadro anterior (para explicar um pico no próximo) — no MESMO
    // objeto, sem criar nada por quadro
    const heap = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : NaN;
    const progs = info.programs?.length ?? 0, tex = info.memory.textures, geo = info.memory.geometries;
    const o = this._onde(), ev = this.eixoCima === 'z';
    const regiao = o.rotulo || 'cena';
    const a = this.anterior ??= { fases: new Float32Array(MAX_FASES), progs: 0, tex: 0, geo: 0, heap };   // (o 1º quadro: tudo o que ele compilou e subiu conta)
    a.dProg = progs - a.progs; a.dTex = tex - a.tex; a.dGeo = geo - a.geo; a.dHeap = heap - a.heap;
    a.progs = progs; a.tex = tex; a.geo = geo; a.heap = heap;
    a.slot = slot; a.n = this.n; a.cpu = cpu; a.fases.set(this.atual); a.chamadas = chamadas; a.tri = tri; a.sombra = this._sombraCh;
    a.regiao = regiao; a.x = o.x ?? 0; a.y = o.y ?? 0; a.z = o.z ?? 0; a.yaw = o.yaw ?? 0;
    // QUAIS shaders compilaram (os programas novos ficam no fim da lista do three.js) — só
    // quando houve (raro: não gera lixo por quadro)
    a.novosProgs = a.dProg > 0 ? (info.programs ?? []).slice(-a.dProg).map((pr) => pr.type + (pr.name ? ` "${pr.name}"` : '')).join(', ') : null;
    this.chamadasDoQuadro = chamadas; this.triDoQuadro = tri; this.sombraDoQuadro = this._sombraCh;
    this.n++;
    const iv = this.intervaloAtual;
    // durante o teste do lugar a cena é mexida de propósito: fora das contas da sessão
    if (iv > 0 && !this.diagnosticando) {
      const b = this.bloco, ca = Math.floor(a.x / b), cb = Math.floor((ev ? a.y : a.z) / b);
      this.agregar(iv, cpu, regiao, ca * 100003 + cb, chamadas, tri, t, a);
    }
    if ((this.n & 7) === 0) this.atualizarMediana();
    if (this.aberto && t - (this.ultPainel ?? 0) > 250) { this.ultPainel = t; this.desenharPainel(); }
  }

  /** Um acontecimento que muda os números (trocar de qualidade, entrar noutra fase do
   *  jogo): vai para o relatório, e os picos logo depois dele dizem "logo depois de". */
  evento(texto) {
    const t = performance.now(), a = this.anterior;
    this.eventos.push({ t, s: (t - this.sessaoIni) / 1000, relogio: new Date().toLocaleTimeString('pt-BR'), texto, onde: a ? `${a.regiao} x ${fmt(a.x, 0)} z ${fmt(this.eixoCima === 'z' ? a.y : a.z, 0)}` : '' });
    if (this.eventos.length > 100) this.eventos.shift();
  }

  /** Acrescenta um teste do lugar do projeto: { nome, liga, desliga, acao, perde, lento }. */
  teste(t) { this.testesDoProjeto.push(t); return this; }

  agregar(iv, cpu, regiao, chave, chamadas, tri, t, a) {
    const s = Math.floor((t - this.sessaoIni) / 1000);
    if (!this.seg || this.seg.s !== s) {
      if (this.seg) { this.segundos.push(this.seg); if (this.segundos.length > 7200) this.segundos.shift(); }
      this.seg = { s, n: 0, soma: 0, max: 0, cpu: 0, gpu: 0, gpuN: 0, chamadas: 0, tri: 0, lentos: 0, regiao, ctx: this._contexto() };
    }
    const S = this.seg;
    S.n++; S.soma += iv; S.max = Math.max(S.max, iv); S.cpu += cpu; S.chamadas += chamadas; S.tri += tri; if (iv > 33.4) S.lentos++; S.regiao = regiao;
    this.acumular(this.regioes, regiao, iv, cpu, chamadas, tri, a);
    this.acumular(this.lugares, chave, iv, cpu, chamadas, tri, a);
  }

  acumular(mapa, chave, iv, cpu, chamadas, tri, p) {
    let a = mapa.get(chave);
    if (!a) mapa.set(chave, (a = { n: 0, soma: 0, max: 0, cpu: 0, gpu: 0, gpuN: 0, chamadas: 0, tri: 0, lentos: 0, hist: new Uint32Array(64), regiao: p.regiao, x: 0, y: 0, z: 0 }));
    a.n++; a.soma += iv; a.max = Math.max(a.max, iv); a.cpu += cpu; a.chamadas += chamadas; a.tri += tri; if (iv > 33.4) a.lentos++;
    a.hist[Math.min(63, Math.floor(iv / 4))]++;   // histograma de 4 em 4 ms (para o p95)
    a.x = p.x; a.y = p.y; a.z = p.z; a.regiao = p.regiao;
  }

  _contexto() { try { return this._contextoFn ? String(this._contextoFn() ?? '') : ''; } catch { return ''; } }

  /** A mediana dos últimos 30 quadros (de 8 em 8), num vetor fixo: curta para acompanhar
   *  uma mudança de patamar (com 120, depois de trocar de qualidade, quadros normais
   *  contavam como pico por segundos). */
  atualizarMediana() {
    const v = (this._med ??= new Float32Array(30));
    let k = 0;
    for (let i = 1; i <= Math.min(this.n, 30); i++) { const x = this.q.intervalo[(this.n - i) % N]; if (x > 0) v[k++] = x; }
    if (!k) return;
    const s = v.subarray(0, k).sort();
    this.medianaRecente = s[k >> 1];
    if (k >= 20 && this.medianaRecente > 2) this.melhorMediana = Math.min(this.melhorMediana, this.medianaRecente);
  }

  registrarPico(t, intervalo) {
    const a = this.anterior;
    this.picos.push({ t, s: (t - this.sessaoIni) / 1000, relogio: new Date().toLocaleTimeString('pt-BR'), intervalo, mediana: this.medianaRecente, ...a, fases: Float32Array.from(a.fases), ctx: this._contexto() });
    if (this.picos.length > MAX_PICOS) this.picos.shift();
  }

  // ------------------------------------------------------------ medições
  /** As estatísticas dos quadros cujo começo caiu em [t0, t1] (ms de performance.now). */
  janela(t0, t1 = Infinity, comDiagnostico = false) {
    const Q = this.q, iv = [], cpu = [], gpu = [], fases = new Float64Array(MAX_FASES);
    let chamadas = 0, tri = 0, sombra = 0;
    const foraDoDiag = (t) => comDiagnostico || !this.janelasDiag.some(([a, b]) => t >= a && t <= b);
    for (let i = 1; i <= Math.min(this.n, N); i++) {
      const s = (this.n - i) % N, t = Q.t[s];
      if (t < t0) break;
      if (t > t1 || !(Q.intervalo[s] > 0) || !foraDoDiag(t)) continue;
      iv.push(Q.intervalo[s]); cpu.push(Q.cpu[s]); if (Number.isFinite(Q.gpu[s])) gpu.push(Q.gpu[s]);
      chamadas += Q.chamadas[s]; tri += Q.tri[s]; sombra += Q.sombra[s];
      for (let f = 0; f < this.fases.length; f++) fases[f] += Q.fase[s * MAX_FASES + f];
    }
    const n = iv.length, soma = iv.reduce((x, y) => x + y, 0), ord = [...iv].sort((x, y) => x - y);
    const media = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
    return {
      n, fps: n ? (1000 * n) / soma : NaN, media: n ? soma / n : NaN, mediana: percentil(ord, 0.5), p95: percentil(ord, 0.95), p99: percentil(ord, 0.99), max: ord[n - 1] ?? NaN,
      cpu: media(cpu), gpu: media(gpu), gpuN: gpu.length, chamadas: n ? chamadas / n : NaN, tri: n ? tri / n : NaN, sombra: n ? sombra / n : NaN,
      fases: [...fases].slice(0, this.fases.length).map((v) => (n ? v / n : 0)),
      lentos33: iv.filter((x) => x > 33.4).length, lentos50: iv.filter((x) => x > 50).length, lentos100: iv.filter((x) => x > 100).length,
    };
  }

  /** Os números dos últimos `seg` segundos num objeto simples — para comparar antes e
   *  depois por automação (`__monitor.resumo(10)`). */
  resumo(seg = 10) {
    const j = this.janela(performance.now() - seg * 1000), c = this.censo(), ar = (v, d = 1) => (Number.isFinite(v) ? Number(v.toFixed(d)) : null);
    return {
      quadros: j.n, fps: ar(j.fps), mediana: ar(j.mediana), p95: ar(j.p95), max: ar(j.max, 0), cpu: ar(j.cpu, 2), gpu: ar(j.gpu, 2),
      render: ar(j.fases[this.idx.get(RENDER)] ?? NaN, 2), chamadas: ar(j.chamadas, 0), daSombra: ar(j.sombra, 0), triangulos: ar(j.tri, 0),
      gargalo: this.gargalo(j), programas: this.renderer.info.programs?.length ?? null, texturas: this.renderer.info.memory.textures, geometrias: this.renderer.info.memory.geometries,
      objetosNaCena: c?.objetos ?? null, ossos: c?.ossos ?? null, esqueletos: c?.esqueletos ?? null, picos: this.picos.length,
    };
  }

  /** O limite provável: placa (GPU), CPU no render, CPU na lógica, ou fora do laço. */
  gargalo(j) {
    if (!(j.n > 10)) return '—';
    const frame = j.mediana, gpu = Number.isFinite(j.gpu) ? j.gpu : 0, render = j.fases[this.idx.get(RENDER)] ?? 0;
    // A MEDIDA DA PLACA COBRE A CPU DO RENDER: a consulta vai do primeiro `render` ao fim do
    // quadro, e enquanto a CPU monta as chamadas de desenho a placa está esperando — com a
    // CPU lenta no render, "GPU" sai alta sem a placa ser o limite. Quando as duas são
    // parecidas, quem desempata é o teste de ¼ dos pixels (não muda nada = é a CPU).
    if (gpu > 0.8 * frame) {
      return render > 0.6 * gpu
        ? `CPU no render ou GPU — a medida da placa (${fmt(gpu)} de ${fmt(frame)} ms) cobre os ${fmt(render)} ms em que a CPU monta as ${Math.round(j.chamadas)} chamadas: o teste de ¼ dos pixels desempata (se não muda nada, é a CPU)`
        : `GPU (a placa leva ${fmt(gpu)} de ${fmt(frame)} ms)`;
    }
    if (j.cpu > 0.8 * frame) {
      return render > 0.5 * j.cpu ? `CPU no render (${fmt(render)} ms: o three.js percorrendo a cena e montando ${Math.round(j.chamadas)} chamadas de desenho)` : `CPU na lógica do projeto (${fmt(j.cpu - render)} ms fora do render)`;
    }
    // nem a CPU nem a placa enchem o quadro: ou é o teto da tela (o quadro mais curto que
    // esta máquina já sustentou), ou o tempo está fora do laço
    if (frame <= 1.1 * this.melhorMediana && frame < 21) return `nenhum (no teto da tela, ~${Math.round(1000 / frame)}/s: CPU ${fmt(j.cpu)} e GPU ${fmt(gpu)} de ${fmt(frame)} ms)`;
    return `fora do laço (${fmt(frame - Math.max(j.cpu, gpu))} ms sem dono: navegador, composição da página, espera da placa — ou a CPU e a placa em fila, ${fmt(j.cpu + gpu)} ms, perdendo a vez da tela${this.ext ? '' : '; sem o cronômetro da GPU, pode ser a placa'})`;
  }

  // ------------------------------------------------------------ o teste do lugar
  /** Os testes que servem para qualquer cena three.js (cada um desliga UMA coisa). */
  testesGerais() {
    const r = this.renderer, cena = this.cena ?? this._cena, cam = this.camera ?? this._cam, pr = r.getPixelRatio();
    if (!cena || !cam) return [];
    const esq = [], inst = [], transp = [], soltos = [], luzes = [];
    const comEsqueleto = new Set();
    const visivel = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    cena.traverse((o) => {
      if (o.isLight) { if ((o.isPointLight || o.isSpotLight) && visivel(o)) luzes.push(o); return; }
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.layers.test(cam.layers) || !visivel(o)) return;
      if (o.isSkinnedMesh) { esq.push(o); if (o.skeleton) comEsqueleto.add(o.skeleton); } else if (o.isInstancedMesh) inst.push(o);
      else if (o.isPoints || o.isLine || o.isSprite) soltos.push(o);
      const mat = [].concat(o.material)[0];
      if (!o.isSkinnedMesh && !o.isInstancedMesh && (mat?.transparent || mat?.alphaTest > 0)) transp.push(o);
    });
    // esconder por CAMADA (a máscara guardada e devolvida): não mexe no `visible`, que é do
    // projeto, nem recompila nada
    const guardadas = new Map();
    const esconder = (lista) => () => { for (const o of lista) { guardadas.set(o, o.layers.mask); o.layers.mask = 0; } };
    const mostrar = (lista) => () => { for (const o of lista) if (guardadas.has(o)) { o.layers.mask = guardadas.get(o); guardadas.delete(o); } };
    const mascara = cam.layers.mask, autoMatriz = cena.matrixWorldAutoUpdate;
    const t = [['metade da resolução (¼ dos pixels)', () => r.setPixelRatio(pr / 2), () => r.setPixelRatio(pr), 'menos resolução (teto de `pixelRatio` por qualidade, ou resolução automática)', 'imagem menos nítida']];
    if (this._sombraFeita) t.push(['sombras paradas (sem redesenhar)', () => { this.sombraParada = true; }, () => { this.sombraParada = false; }, 'sombra mais barata: menos objetos projetando, mapa menor, alcance menor, ou desligada na qualidade baixa', 'sombras menos nítidas, mais curtas ou ausentes']);
    if (esq.length) t.push([`sem as malhas com esqueleto (${esq.length}, em ${comEsqueleto.size} esqueletos)`, esconder(esq), mostrar(esq), 'personagens: UMA malha e UM esqueleto por personagem, cortar por distância, tirar da cena quem está escondido', 'personagens somem mais cedo ao longe']);
    if (inst.length) t.push([`sem as malhas instanciadas (${inst.length})`, esconder(inst), mostrar(inst), null, null]);
    if (transp.length) t.push([`sem os transparentes e os com recorte (${transp.length})`, esconder(transp), mostrar(transp), 'menos camadas transparentes/recortadas sobrepostas (folhas em blocos, cartazes de longe, partículas menores)', 'vegetação e efeitos menos detalhados']);
    if (soltos.length) t.push([`sem pontos, linhas e sprites (${soltos.length})`, esconder(soltos), mostrar(soltos), null, null]);
    if (autoMatriz !== undefined) t.push(['sem refazer as matrizes da cena (updateMatrixWorld)', () => { cena.matrixWorldAutoUpdate = false; }, () => { cena.matrixWorldAutoUpdate = autoMatriz; }, 'objetos parados com `matrixAutoUpdate = false` (ou num grupo parado); personagem escondido FORA da cena; enfeite sem esqueleto', 'nada (é só CPU)']);
    if (luzes.length) t.push([`sem as luzes pontuais/de foco (${luzes.length})`, () => { for (const l of luzes) l.visible = false; }, () => { for (const l of luzes) l.visible = true; }, `orçamento FIXO de luzes (as mais perto; hoje ${luzes.length} acesas): toda luz custa em todo pixel`, 'menos luzes iluminando ao mesmo tempo', true]);
    for (const p of this.testesDoProjeto) t.push([p.nome, p.liga, p.desliga, p.acao ?? null, p.perde ?? null, !!p.lento]);
    t.push(['sem NADA na tela (o custo fixo)', () => cam.layers.disableAll(), () => { cam.layers.mask = mascara; }, null, null]);
    return t;
  }

  /**
   * O TESTE DO LUGAR. Com a câmera parada no lugar pesado: mede a base, depois liga UM teste
   * de cada vez (com a base de novo a cada 2 — a máquina oscila, cada teste é comparado com a
   * média da base de antes e da de depois). Teste que recompila shader (`lento`) espera mais
   * antes de medir. Tudo volta ao que era no fim, mesmo se der erro. ~1 min.
   */
  async diagnosticar(copiarNoFim = false) {
    if (this.diagnosticando) return this.diagnostico;
    this.diagnosticando = true;
    const testes = this.testesGerais();
    // a janela escondida: o navegador para de desenhar quando a janela fica coberta ou
    // minimizada (os testes saíam "NaN"). Escondida, a medida espera ela voltar (até 30 s);
    // a que pegou poucos quadros é refeita.
    const aparecer = () => new Promise((f) => {
      const fimEspera = setTimeout(() => { document.removeEventListener('visibilitychange', h); f(false); }, 30000);
      const h = () => { if (!document.hidden) { clearTimeout(fimEspera); document.removeEventListener('visibilitychange', h); f(true); } };
      document.addEventListener('visibilitychange', h); h();
    });
    const medir = async (espera) => {
      for (let tentativa = 0; ; tentativa++) {
        await aparecer();
        await new Promise((f) => setTimeout(f, espera));
        const t0 = performance.now();
        await new Promise((f) => setTimeout(f, 1300));
        const j = this.janela(t0, performance.now(), true);
        if (j.n >= 10 || tentativa >= 2) return j;
      }
    };
    const res = [], bases = [], janela = [performance.now(), Infinity];
    this.janelasDiag.push(janela);
    const passo = (txt) => { this.estadoDiag = txt; this.desenharPainel(); };
    try {
      passo('medindo a base');
      bases.push(await medir(700));
      for (let i = 0; i < testes.length; i++) {
        const [nome, liga, desliga, acao, perde, lento] = testes[i];
        passo(`medindo ${i + 1}/${testes.length}: ${nome}`);
        try { liga(); res.push({ nome, acao, perde, antes: bases.length - 1, com: await medir(lento ? 1800 : 700) }); }
        catch (e) { res.push({ nome, erro: String(e?.message ?? e), antes: bases.length - 1, com: this.janela(Infinity) }); }
        finally { try { desliga(); } catch (e) { console.warn('[monitor] não desfiz o teste', nome, e); } }
        if (i % 2 === 1 || i === testes.length - 1) { passo(`medindo ${i + 1}/${testes.length}: base`); bases.push(await medir(lento ? 1800 : 700)); }
      }
      const m2 = (a, b) => (Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a : b);
      for (const x of res) {
        const b0 = bases[x.antes], b1 = bases[x.antes + 1] ?? b0;
        x.base = { fps: m2(b0.fps, b1.fps), gpu: m2(b0.gpu, b1.gpu), cpu: m2(b0.cpu, b1.cpu), chamadas: m2(b0.chamadas, b1.chamadas) };
        x.bases = [{ fps: b0.fps, gpu: b0.gpu, cpu: b0.cpu }, { fps: b1.fps, gpu: b1.gpu, cpu: b1.cpu }];
      }
      const a = this.anterior, gl = this.gl;
      this.diagnostico = {
        quando: new Date().toLocaleTimeString('pt-BR'), s: (performance.now() - this.sessaoIni) / 1000,
        onde: a ? `${a.regiao} x ${fmt(a.x)} y ${fmt(a.y)} z ${fmt(a.z)}, olhando ${graus(a.yaw)}°${this._contexto() ? `, ${this._contexto()}` : ''}` : '?',
        tela: `${gl.drawingBufferWidth}×${gl.drawingBufferHeight}`, res,
      };
    } finally {
      // um segundo de folga: o último teste ainda pode estar desfazendo (shaders, luzes)
      await new Promise((f) => setTimeout(f, 1000));
      janela[1] = performance.now();
      this.diagnosticando = false; this.estadoDiag = null;
      this.ultInicio = 0;   // o intervalo do primeiro quadro depois não conta
      this.desenharPainel();
    }
    if (copiarNoFim) await this.copiar();
    return this.diagnostico;
  }

  // ------------------------------------------------------------ a cena
  /** O censo da cena: quanto o three.js tem de PERCORRER por quadro (ele refaz a matriz e
   *  visita todo objeto, desenhado ou não) e o que há nela. */
  censo() {
    const cena = this.cena ?? this._cena;
    if (!cena) return null;
    const c = { objetos: 0, autoMatriz: 0, ossos: 0, malhas: 0, comEsqueleto: 0, esqueletos: 0, instanciadas: 0, copias: 0, soltos: 0, semCorte: 0, projetamSombra: 0, luzes: {}, luzesSombra: 0, materiais: {}, nMateriais: 0 };
    const esqueletos = new Set(), mats = new Set();
    const visivel = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    cena.traverse((o) => {
      c.objetos++;
      if (o.matrixAutoUpdate) c.autoMatriz++;
      if (o.isBone) { c.ossos++; return; }
      if (o.isLight) { if (visivel(o)) { c.luzes[o.type] = (c.luzes[o.type] ?? 0) + 1; if (o.castShadow) c.luzesSombra++; } return; }
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !visivel(o)) return;
      if (o.isSkinnedMesh) { c.comEsqueleto++; if (o.skeleton) esqueletos.add(o.skeleton); } else if (o.isInstancedMesh) { c.instanciadas++; c.copias += o.count; } else if (o.isMesh) c.malhas++; else c.soltos++;
      if (o.frustumCulled === false) c.semCorte++;
      if (o.castShadow) c.projetamSombra++;
      for (const m of [].concat(o.material)) if (m && !mats.has(m)) { mats.add(m); c.materiais[m.type] = (c.materiais[m.type] ?? 0) + 1; }
    });
    c.esqueletos = esqueletos.size; c.nMateriais = mats.size; c._mats = mats;
    return c;
  }

  /** As texturas que os materiais da cena usam, das maiores para as menores. */
  texturas(mats) {
    const vistas = new Map();
    const olhar = (v, onde) => {
      if (!v?.isTexture || vistas.has(v.uuid)) return;
      let im = v.image, lados = 1;
      if (Array.isArray(im)) { lados = im.length; im = im[0]; }
      const w = im?.width ?? im?.videoWidth ?? 0, h = im?.height ?? im?.videoHeight ?? 0;
      const src = typeof im?.src === 'string' ? im.src : typeof im?.currentSrc === 'string' ? im.currentSrc : '';
      const nome = v.name || (src && !src.startsWith('data:') && !src.startsWith('blob:') ? src.split('/').pop().split('?')[0] : '') || onde;
      vistas.set(v.uuid, { nome, w, h, lados, comprimida: !!v.isCompressedTexture, mb: (w * h * lados * 4 * (v.generateMipmaps ? 1.33 : 1)) / 1048576 });
    };
    for (const m of mats ?? []) {
      for (const k in m) { const v = m[k]; if (v && v.isTexture) olhar(v, `${m.name || m.type}.${k}`); }
      if (m.uniforms) for (const k in m.uniforms) olhar(m.uniforms[k]?.value, `${m.name || m.type}.${k}`);
    }
    // as iguais (mesmo nome e tamanho) somadas: o mesmo atlas embutido em vários .glb vira
    // UMA CÓPIA POR ARQUIVO na placa — é onde a memória de vídeo some sem ninguém ver
    const grupos = new Map();
    for (const t of vistas.values()) {
      const k = `${t.nome}|${t.w}|${t.h}|${t.lados}`, g = grupos.get(k);
      if (g) { g.copias++; g.mb += t.mb; } else grupos.set(k, { ...t, copias: 1 });
    }
    return [...grupos.values()].sort((a, b) => b.mb - a.mb);
  }

  /** O que mais pesa no campo de visão agora (triângulos × cópias), pela esfera de cada objeto. */
  maisPesados(k) {
    const cena = this.cena ?? this._cena, cam = this.camera ?? this._cam;
    if (!cena || !cam?.projectionMatrix) return [];
    const M = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse), planos = this.planosDoFrustum(M), grupos = new Map();
    const visivel = (o) => { if (!o.layers.test(cam.layers)) return false; for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
    cena.traverse((o) => {
      if (!(o.isMesh || o.isPoints) || !o.geometry || !visivel(o)) return;
      const geo = o.geometry;
      if (o.frustumCulled !== false) {
        const esf = o.isInstancedMesh ? (o.boundingSphere ?? (o.computeBoundingSphere?.(), o.boundingSphere)) : (geo.boundingSphere ?? (geo.computeBoundingSphere(), geo.boundingSphere));
        if (!esf) return;
        const c = esf.center.clone().applyMatrix4(o.matrixWorld), rad = esf.radius * o.matrixWorld.getMaxScaleOnAxis();
        if (planos.some(([a, b, cc, d]) => a * c.x + b * c.y + cc * c.z + d < -rad)) return;
      }
      const tri = (geo.index ? geo.index.count : geo.attributes.position?.count ?? 0) / 3, n = o.isInstancedMesh ? o.count : 1;
      const mat = [].concat(o.material)[0];
      let nome = o.name; for (let p = o.parent; !nome && p; p = p.parent) nome = p.name;
      nome = `${nome || geo.name || '(sem nome)'} / ${mat?.name || mat?.type || '?'}`;
      const a = grupos.get(nome) ?? { tri: 0, ch: 0, inst: 0, sombra: false, tipo: mat?.type, transp: mat?.transparent, recorte: mat?.alphaTest > 0, esq: !!o.isSkinnedMesh };
      a.tri += tri * n; a.ch += [].concat(o.material).length; a.inst += n; a.sombra ||= o.castShadow;
      grupos.set(nome, a);
    });
    return [...grupos.entries()].sort((a, b) => b[1].tri - a[1].tri).slice(0, k)
      .map(([nome, a]) => `${nome.slice(0, 48).padEnd(50)} ${mil(a.tri).padStart(9)} triâng. · ${String(a.ch).padStart(4)} chamadas · ${a.inst} cópias · ${a.tipo}${a.esq ? ' esqueleto' : ''}${a.transp ? ' transparente' : ''}${a.recorte ? ' recorte' : ''}${a.sombra ? ' sombra' : ''}`);
  }

  planosDoFrustum(m) {
    const e = m.elements, pl = [];
    const add = (a, b, c, d) => { const l = Math.hypot(a, b, c); pl.push([a / l, b / l, c / l, d / l]); };
    add(e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]); add(e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]);
    add(e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]); add(e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]);
    add(e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]); add(e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]);
    return pl;
  }

  // ------------------------------------------------------------ o relatório
  relatorio() {
    const r = this.renderer, gl = this.gl, agora = performance.now(), L = [];
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuNome = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const sess = (agora - this.sessaoIni) / 1000, ev = this.eixoCima === 'z';
    const tudo = this.janela(this.sessaoIni), ult10 = this.janela(agora - 10000), ult60 = this.janela(agora - 60000);
    L.push(`# Relatório de desempenho — ${this.nome}`);
    L.push(`${location.origin}${location.pathname} · gerado ${new Date().toLocaleString('pt-BR')} · sessão ${mmss(sess)} (desde ${this.relogioIni.toLocaleTimeString('pt-BR')})${this._contexto() ? ` · ${this._contexto()}` : ''}`);
    L.push('');
    L.push('## Máquina e configuração');
    L.push(`GPU: ${gpuNome}`);
    L.push(`navegador: ${navigator.userAgent.match(/(Chrome|Firefox|Edg|Safari)\/[\d.]+/g)?.join(' ') ?? navigator.userAgent} · núcleos ${navigator.hardwareConcurrency ?? '?'} · memória ${navigator.deviceMemory ?? '?'} GB · ${navigator.platform}`);
    L.push(`tela: ${innerWidth}×${innerHeight} (devicePixelRatio ${devicePixelRatio}) → desenhando ${gl.drawingBufferWidth}×${gl.drawingBufferHeight} (pixelRatio ${fmt(r.getPixelRatio(), 2)}) · antisserrilhado ${gl.getContextAttributes()?.antialias ? 'sim' : 'não'}`);
    L.push(`motor: ${r.domElement?.dataset?.engine ?? 'three.js'} · sombras ${r.shadowMap?.enabled ? `ligadas (tipo ${r.shadowMap.type}${r.shadowMap.autoUpdate === false ? ', redesenho manual' : ''})` : 'desligadas'} · tom ${r.toneMapping ?? '?'}`);
    if (gl.getContextAttributes()?.antialias) L.push('antisserrilhado (MSAA) ligado: o teste do lugar não o mede — ele é escolhido ao criar o contexto, só reabrindo a página. Em placa integrada pode custar 20–30% dos quadros.');
    L.push(`cronômetro da GPU: ${this.ext ? `sim${this.gpuAlheia ? ' (outro cronômetro de GPU ativo na página: parte dos quadros ficou sem medida)' : ''}` : 'NÃO (sem o tempo da placa; o gargalo é deduzido)'} · quadros longos do navegador: ${this.tipoLongo ?? 'não'}${this.semRaf > 20 ? ` · ${this.semRaf} quadros contados SEM o rAF embrulhado: a CPU deles é só a do render` : ''}`);
    L.push('');
    L.push('## Resumo');
    const linhaResumo = (rot, j) => `${rot.padEnd(14)} FPS ${fmt(j.fps).padStart(5)} · quadro mediana ${fmt(j.mediana)} p95 ${fmt(j.p95)} p99 ${fmt(j.p99)} máx ${fmt(j.max, 0)} ms · CPU ${fmt(j.cpu)} · GPU ${fmt(j.gpu)} ms · ${Math.round(j.chamadas)} chamadas (${Math.round(j.sombra || 0)} da sombra) · ${mil(j.tri || 0)} triâng. · lentos >33ms ${j.n ? Math.round(100 * j.lentos33 / j.n) : 0}% >50ms ${j.n ? Math.round(100 * j.lentos50 / j.n) : 0}% >100ms ${j.lentos100}`;
    // os últimos 10 s podem ter sido o próprio teste do lugar (fica fora das contas)
    L.push(ult10.n ? linhaResumo('últimos 10 s', ult10) : 'últimos 10 s    (foram do teste do lugar, ou a janela estava escondida: fora das contas)');
    L.push(linhaResumo('último 1 min', ult60));
    L.push(linhaResumo(`sessão (${Math.round(tudo.n / Math.max(tudo.fps || 1, 1))} s)`, tudo));
    L.push(`gargalo agora (10 s): ${this.gargalo(ult10)}`);
    L.push(`gargalo no último minuto: ${this.gargalo(ult60)}`);
    if (this.eventos.length) {
      L.push('eventos (os números de antes e de depois não se comparam):');
      for (const e of this.eventos) L.push(`  ${mmss(e.s)} (${e.relogio}) · ${e.texto}${e.onde ? ` · em ${e.onde}` : ''}`);
    }
    L.push('');
    L.push('## Onde vai a CPU (média por quadro, último minuto)');
    const ord = this.fases.map((nome, i) => [nome, ult60.fases[i] ?? 0]).sort((a, b) => b[1] - a[1]);
    const maxF = ord[0]?.[1] ?? 1;
    for (const [nome, v] of ord) if (v >= 0.05) L.push(`${nome.padEnd(20)} ${fmt(v, 2).padStart(6)} ms  ${barra(v, maxF)}`);
    L.push('(render = o three.js percorrendo a cena e montando o quadro — NÃO separa percorrer de desenhar: para isso, um perfil de CPU. O trabalho da PLACA é a GPU acima.)');
    if (this.fases.length <= 3) L.push('(sem marcas do projeto: `monitor.fase(\'nome\')` depois de cada bloco do laço separa a lógica em partes)');
    L.push('');
    if (this.regioes.size > 1) {
      L.push('## Por região (sessão)');
      L.push('região         tempo   FPS  mediana  p95   máx   CPU   GPU  chamadas  triâng.  lentos>33');
      for (const [nome, a] of [...this.regioes.entries()].sort((x, y) => y[1].n - x[1].n)) {
        L.push(`${String(nome).padEnd(13)} ${mmss(a.soma / 1000)}  ${fmt(1000 * a.n / a.soma, 0).padStart(4)}  ${fmt(this.histP(a.hist, a.n, 0.5), 0).padStart(5)}  ${fmt(this.histP(a.hist, a.n, 0.95), 0).padStart(4)}  ${fmt(a.max, 0).padStart(4)}  ${fmt(a.cpu / a.n).padStart(4)}  ${fmt(a.gpuN ? a.gpu / a.gpuN : NaN).padStart(4)}  ${String(Math.round(a.chamadas / a.n)).padStart(8)}  ${mil(a.tri / a.n).padStart(8)}  ${Math.round(100 * a.lentos / a.n)}%`);
      }
      L.push('');
    }
    L.push(`## Os lugares mais pesados (blocos de ${this.bloco} m com 3 s ou mais, pela média do quadro)`);
    const lugares = [...this.lugares.values()].filter((a) => a.soma > 3000).sort((x, y) => y.soma / y.n - x.soma / x.n).slice(0, 8);
    for (const a of lugares) L.push(`${String(a.regiao).padEnd(12)} perto de x ${fmt(a.x, 0)} ${ev ? 'y' : 'z'} ${fmt(ev ? a.y : a.z, 0)} · ${fmt(a.soma / a.n)} ms (${fmt(1000 * a.n / a.soma, 0)} FPS) · p95 ${fmt(this.histP(a.hist, a.n, 0.95), 0)} · ${Math.round(a.chamadas / a.n)} chamadas · ${mil(a.tri / a.n)} triâng. · ficou ${mmss(a.soma / 1000)}`);
    if (!lugares.length) L.push('(ainda pouco tempo)');
    L.push('');
    this.secaoPicos(L);
    this.secaoCena(L);
    L.push('## Linha do tempo (blocos de 10 s, últimos 5 min)');
    L.push('quando  FPS   máx   CPU   GPU  chamadas  triâng.  lentos  região / contexto');
    const segs = [...this.segundos, ...(this.seg ? [this.seg] : [])].filter((s) => s.s >= sess - 300);
    for (let i = 0; i < segs.length; i += 10) {
      const b = segs.slice(i, i + 10), n = b.reduce((s, x) => s + x.n, 0), soma = b.reduce((s, x) => s + x.soma, 0), gN = b.reduce((s, x) => s + x.gpuN, 0);
      if (!n) continue;
      L.push(`${mmss(b[0].s)}   ${fmt(1000 * n / soma, 0).padStart(3)}  ${fmt(Math.max(...b.map((x) => x.max)), 0).padStart(4)}  ${fmt(b.reduce((s, x) => s + x.cpu, 0) / n).padStart(4)}  ${fmt(gN ? b.reduce((s, x) => s + x.gpu, 0) / gN : NaN).padStart(4)}  ${String(Math.round(b.reduce((s, x) => s + x.chamadas, 0) / n)).padStart(8)}  ${mil(b.reduce((s, x) => s + x.tri, 0) / n).padStart(8)}  ${String(b.reduce((s, x) => s + x.lentos, 0)).padStart(5)}  ${[...new Set(b.map((x) => x.regiao))].join('→')}${b.some((x) => x.ctx) ? ` / ${[...new Set(b.map((x) => x.ctx).filter(Boolean))].join('→')}` : ''}`);
    }
    L.push('');
    this.secaoLeitura(L, ult60);
    return L.join('\n');
  }

  histP(hist, n, p) {
    let acc = 0;
    for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc >= n * p) return i * 4 + 2; }
    return NaN;
  }

  /** Os picos: os piores, em ordem de tempo, cada um com o que o quadro culpado fez. */
  secaoPicos(L) {
    L.push(`## Picos (quadro acima de ${PICO_MS} ms e de 2,5× a mediana) — ${this.picos.length} na sessão`);
    if (!this.picos.length) { L.push('nenhum'); L.push(''); return; }
    // cada causa: [categoria (para a contagem), texto (com os números)]
    const classe = (p) => {
      const c = [];
      if (p.dProg > 0) c.push(['compilou shader', `compilou ${p.dProg} shader(s)${p.novosProgs ? ` (${p.novosProgs})` : ''}`]);
      if (p.dTex > 0 || p.dGeo > 20) c.push(['subiu textura/geometria', `+${p.dTex} textura(s), +${p.dGeo} geometria(s)`]);
      if (p.dHeap < -2) c.push(['coleta de lixo', `coleta de lixo (${fmt(p.dHeap, 0)} MB)`]);
      // o script que o navegador aponta — menos o próprio laço (o `onAnimationFrame` do
      // three.js e o embrulho do monitor), que não diz nada: aí quem explica são as fases
      const loaf = this.loafDe(p);
      const fora = (loaf?.scripts ?? []).filter((s) => !(s.funcao === 'onAnimationFrame' && /three/.test(s.fonte)) && !/monitor-desempenho/.test(s.fonte) && s.invocador !== 'FrameRequestCallback' && s.dur > 20).sort((a, b) => b.dur - a.dur)[0];
      if (fora) c.push(['script fora do laço', `script fora do laço: ${fora.funcao} (${fora.fonte || 'sem arquivo'}) ${fmt(fora.dur, 0)} ms`]);
      const gpu = this.q.gpu[p.slot];
      if (p.cpu > 0.6 * p.intervalo) {
        const [nome, v] = [...p.fases].map((x, i) => [this.fases[i], x]).sort((a, b) => b[1] - a[1])[0];
        if (!c.length || v > 0.5 * p.cpu) c.push([`CPU: ${nome}`, `CPU, na fase "${nome}" (${fmt(v, 0)} ms)`]);
      } else if (Number.isFinite(gpu) && gpu > 0.6 * p.intervalo) c.push(['placa (GPU)', `placa (GPU ${fmt(gpu, 0)} ms)`]);
      else if (!c.length) c.push(['fora do laço', 'fora do laço (navegador, composição da página, sistema)']);
      return c;
    };
    const causas = {};
    for (const p of this.picos) for (const [k] of classe(p)) causas[k] = (causas[k] ?? 0) + 1;
    L.push('por causa: ' + Object.entries(causas).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(' · '));
    const piores = [...this.picos].sort((a, b) => b.intervalo - a.intervalo).slice(0, 25).sort((a, b) => a.t - b.t);
    for (const p of piores) {
      const gpu = this.q.gpu[p.slot];
      L.push(`- ${mmss(p.s)} (${p.relogio}) · ${fmt(p.intervalo, 0)} ms (mediana ${fmt(p.mediana, 0)}) · ${p.regiao} x ${fmt(p.x, 0)} y ${fmt(p.y, 0)} z ${fmt(p.z, 0)} olhando ${graus(p.yaw)}°${p.ctx ? ` · ${p.ctx}` : ''}`);
      // um evento (troca de qualidade…) nos 5 s antes explica o pico melhor que tudo
      const ev = [...this.eventos].reverse().find((e) => e.t <= p.t && p.t - e.t < 5000);
      L.push(`    quadro culpado: CPU ${fmt(p.cpu, 0)} ms (${this.topFases(p.fases, 3)}) · GPU ${fmt(gpu, 0)} ms · ${p.chamadas} chamadas${p.sombra ? ` (${p.sombra} da sombra)` : ''} · ${mil(p.tri)} triâng. → ${classe(p).map((x) => x[1]).join('; ')}${ev ? ` · logo depois de: ${ev.texto}` : ''}`);
    }
    L.push('');
  }

  topFases(fases, k) {
    return [...fases].map((v, i) => [this.fases[i], v]).filter((x) => x[0]).sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, v]) => `${n} ${fmt(v, 0)}`).join(', ');
  }

  loafDe(p) {
    const ini = p.t - p.intervalo - 5, fim = p.t + 5;
    let melhor = null;
    for (const e of this.loaf) if (e.ini >= ini && e.ini <= fim && (!melhor || e.dur > melhor.dur)) melhor = e;
    return melhor;
  }

  /** A cena agora: quanto há para percorrer, o que está aceso, as texturas, e o que mais pesa na vista. */
  secaoCena(L) {
    const info = this.renderer.info, mem = performance.memory, c = this.censo();
    L.push('## A cena agora');
    L.push(`chamadas ${this.chamadasDoQuadro ?? info.render.calls} (${this.sombraDoQuadro ?? 0} da passagem de sombra) · triângulos ${mil(this.triDoQuadro ?? info.render.triangles)} · programas ${info.programs?.length ?? '?'} · texturas ${info.memory.textures} · geometrias ${info.memory.geometries}${mem ? ` · memória JS ${Math.round(mem.usedJSHeapSize / 1048576)} de ${Math.round(mem.jsHeapSizeLimit / 1048576)} MB` : ''}`);
    if (!c) { L.push('(sem a cena: passe `scene` ao criar o monitor)'); L.push(''); return; }
    L.push(`objetos na cena: ${c.objetos} (o three.js percorre TODOS por quadro) · com a matriz refeita todo quadro (matrixAutoUpdate): ${c.autoMatriz} · ossos: ${c.ossos}`);
    L.push(`visíveis: ${c.malhas} malhas · ${c.comEsqueleto} com esqueleto (${c.esqueletos} esqueletos: cada um manda os ossos à placa todo quadro) · ${c.instanciadas} instanciadas (${c.copias} cópias) · ${c.soltos} pontos/linhas/sprites · sem corte de câmera (frustumCulled = false): ${c.semCorte} · projetam sombra: ${c.projetamSombra}`);
    L.push(`luzes visíveis: ${Object.entries(c.luzes).map(([k, v]) => `${v} ${k.replace('Light', '')}`).join(', ') || 'nenhuma'} · projetando sombra: ${c.luzesSombra} · materiais: ${c.nMateriais} (${Object.entries(c.materiais).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${v} ${k.replace(/^Mesh|Material$/g, '')}`).join(', ')})`);
    const tx = this.texturas(c._mats), total = tx.reduce((s, t) => s + t.mb, 0), nTex = tx.reduce((s, t) => s + t.copias, 0);
    if (tx.length) {
      L.push(`texturas nos materiais da cena: ${nTex}, ~${fmt(total, 0)} MB na placa (sem compressão). As que mais ocupam (as iguais somadas):`);
      for (const t of tx.slice(0, 8)) L.push(`  ${String(t.nome).slice(0, 44).padEnd(46)} ${t.w}×${t.h}${t.lados > 1 ? ` ×${t.lados} lados` : ''}${t.copias > 1 ? ` · ${t.copias} CÓPIAS iguais` : ''} · ~${fmt(t.mb)} MB${t.comprimida ? ' (comprimida: menos que isto)' : ''}`);
      const repetidas = tx.filter((t) => t.copias > 1), sobra = repetidas.reduce((s, t) => s + t.mb * (1 - 1 / t.copias), 0);
      if (sobra > 16) L.push(`  → ~${fmt(sobra, 0)} MB são CÓPIAS da mesma imagem (o mesmo atlas embutido em vários modelos): carregar a imagem uma vez e dividir a textura entre os materiais.`);
    }
    L.push('mais pesados no campo de visão agora (triângulos × cópias):');
    for (const l of this.maisPesados(12)) L.push(`  ${l}`);
    L.push('');
  }

  /** As conclusões: frases curtas do que os números dizem, e o teste do lugar, se feito. */
  secaoLeitura(L, j) {
    L.push('## Leitura automática');
    const r = this.renderer, dicas = [], c = this.censo();
    const pix = this.gl.drawingBufferWidth * this.gl.drawingBufferHeight;
    dicas.push(`gargalo no último minuto: ${this.gargalo(j)}.`);
    if (Number.isFinite(j.gpu) && j.gpu > 0.8 * j.mediana && r.getPixelRatio() > 1) dicas.push(`a placa é o limite e o pixelRatio é ${fmt(r.getPixelRatio(), 2)} (${(pix / 1e6).toFixed(1)} milhões de pixels por quadro): menos resolução rende quase na proporção — ver "metade da resolução" no teste do lugar.`);
    if (j.sombra > 300) dicas.push(`a passagem de sombra faz ${Math.round(j.sombra)} das ${Math.round(j.chamadas)} chamadas por quadro (uma luz pontual com sombra redesenha a cena 6 vezes): menos objetos projetando sombra, alcance menor, ou sombra só na qualidade alta.`);
    if (j.chamadas > 1000) dicas.push(`${Math.round(j.chamadas)} chamadas de desenho por quadro é muito para placa integrada ou CPU fraca: juntar em lotes (InstancedMesh, geometrias fundidas), cortar por distância.`);
    if (j.tri > 2e6) dicas.push(`${mil(j.tri)} triângulos por quadro: LOD/cartaz mais perto, ou peças mais leves.`);
    if (c) {
      if (c.esqueletos > 40) dicas.push(`${c.esqueletos} esqueletos visíveis: cada um manda todos os ossos à placa todo quadro — UMA malha e UM esqueleto por personagem, e enfeite sem esqueleto.`);
      if (c.objetos > 5000) dicas.push(`${c.objetos} objetos na cena (${c.autoMatriz} com a matriz refeita todo quadro, ${c.ossos} ossos): o three.js percorre todos, desenhados ou não — objetos parados com matrixAutoUpdate = false ou num grupo parado, e quem está escondido FORA da cena.`);
      const pontuais = (c.luzes.PointLight ?? 0) + (c.luzes.SpotLight ?? 0);
      if (pontuais > 6) dicas.push(`${pontuais} luzes pontuais/de foco visíveis: cada uma custa em TODO pixel de todo material iluminado, mesmo longe — orçamento fixo (as mais perto).`);
      const tx = this.texturas(c._mats), mbTex = tx.reduce((s, t) => s + t.mb, 0);
      if (mbTex > 256) dicas.push(`~${fmt(mbTex, 0)} MB de texturas na placa: numa placa de 1–2 GB isso sozinho derruba o desempenho (ela passa a trocar memória) — texturas menores (≤ 512 px em peça pequena), sem mapas que não se veem, e sem cópias repetidas.`);
      if (c.semCorte > 30) dicas.push(`${c.semCorte} objetos sem corte de câmera (frustumCulled = false): são desenhados sempre, e em toda passagem de sombra.`);
    }
    const nPicos = this.picos.length, comp = this.picos.filter((p) => p.dProg > 0).length, gc = this.picos.filter((p) => p.dHeap < -2).length;
    if (comp) dicas.push(`${comp} pico(s) compilando shader no meio do uso: algum material/luz/sombra mudou depois do carregamento — compilar E desenhar tudo uma vez no carregamento.`);
    if (gc) dicas.push(`${gc} pico(s) com coleta de lixo: algo cria muitos objetos por quadro (vetores, arrays, closures).`);
    if (nPicos && !comp && !gc) dicas.push('os picos não são compilação nem coleta de lixo: ver "quadro culpado" (fase da CPU, GPU ou fora do laço).');
    for (const d of dicas) L.push(`- ${d}`);
    L.push('');
    const D = this.diagnostico;
    L.push('## Teste do lugar ("Diagnosticar e copiar")');
    if (!D) { L.push(`não feito — no lugar pesado, olhando para onde pesa: ${this.tecla} e "Diagnosticar e copiar" (cerca de 1 min; o relatório já sai com ele).`); return; }
    // O TETO DA TELA: a tela não mostra mais quadros do que a frequência dela (60 numa
    // comum, 144 numa de jogo). Há teto quando, sem desenhar NADA, o quadro ainda tem FOLGA
    // (a CPU e a placa somadas não enchem o intervalo: ele está esperando a tela) — e o teste
    // que encosta no teto esconde o ganho em quadros/s. Nesses, o ganho é o TEMPO poupado:
    // o da placa ou o da CPU, o que mais caiu (numa máquina fraca é isso que vira quadros).
    const nadaR = D.res.find((x) => x.nome.startsWith('sem NADA')), nd = nadaR?.com;
    const teto = nd && nd.n > 10 && nd.cpu + (Number.isFinite(nd.gpu) ? nd.gpu : 0) < 0.7 * nd.mediana ? nd.fps : Infinity;
    const poupou = (antes, depois) => (Number.isFinite(antes) && Number.isFinite(depois) && antes > 0.2 ? 1 - depois / antes : NaN);
    const ganhos = D.res.map((x) => {
      const noTeto = Number.isFinite(teto) && (x.com.fps >= 0.93 * teto || x.base.fps >= 0.93 * teto);
      const gG = poupou(x.base.gpu, x.com.gpu), gC = poupou(x.base.cpu, x.com.cpu);
      const pelaCpu = noTeto && (!Number.isFinite(gG) || gC > gG);
      // A BASE INSTÁVEL: a medida de antes e a de depois do teste diferem em mais de 25% no
      // número que dá o ganho — a câmera andou, a cena mudou, a máquina fez outra coisa. Um
      // "ganho" assim é ruído: fica marcado e fora das recomendações.
      const k = !noTeto ? 'fps' : pelaCpu ? 'cpu' : 'gpu', [u, v] = [x.bases?.[0]?.[k], x.bases?.[1]?.[k]];
      const instavel = Number.isFinite(u) && Number.isFinite(v) && Math.abs(u - v) > 0.25 * Math.max((u + v) / 2, 1e-6) ? `${k === 'fps' ? 'FPS' : k.toUpperCase()} ${fmt(u)} → ${fmt(v)}` : null;
      return { ...x, noTeto, gG, gC, instavel, via: !noTeto ? '' : pelaCpu ? ' da CPU' : ' da GPU', g: !noTeto ? x.com.fps / x.base.fps - 1 : pelaCpu ? gC : gG };
    });
    const pct = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%` : '— (sem quadros: a janela ficou escondida)');
    const ch = (v) => (Number.isFinite(v) ? String(Math.round(v)) : '—');
    L.push(`feito às ${D.quando} (sessão ${mmss(D.s)}) em ${D.onde}, desenhando ${D.tela ?? '?'}. Cada linha: a base (média da de antes e da de depois) → com a mudança.`);
    if (Number.isFinite(teto)) L.push(`A TELA LIMITA a ~${Math.round(teto)} quadros/s (sem desenhar nada o quadro ainda tem folga: está esperando a tela). Onde o teste encostou no teto, o ganho é o TEMPO poupado ("da GPU" ou "da CPU", o que mais caiu) — o de quadros/s está escondido pelo teto. Numa máquina mais fraca, é esse tempo que vira quadros.`);
    for (const x of ganhos) {
      L.push(`${String(x.nome).slice(0, 52).padEnd(53)} ${fmt(x.base.fps, 1).padStart(5)} → ${fmt(x.com.fps, 1).padStart(5)} FPS · GPU ${fmt(x.base.gpu)} → ${fmt(x.com.gpu)} · CPU ${fmt(x.base.cpu)} → ${fmt(x.com.cpu)} ms · ${ch(x.base.chamadas)} → ${ch(x.com.chamadas)} chamadas  =  ${x.erro ? `ERRO: ${x.erro}` : `${pct(x.g)}${x.via}`}${x.instavel ? `  ⚠ base instável (${x.instavel} entre a de antes e a de depois): não vale` : ''}`);
    }
    const instaveis = ganhos.filter((x) => x.instavel && !x.nome.startsWith('sem NADA')).length;
    if (instaveis) L.push(`⚠ ${instaveis} teste(s) com a base instável ficaram FORA das recomendações: a câmera ou a cena mudou durante a medida. Refaça com tudo parado (câmera, personagem, nada novo entrando na vista).`);
    // a leitura: o que fazer, do que mais rende; se são os pixels; e o piso (sem nada na tela)
    const acoes = ganhos.filter((x) => x.acao && x.g >= 0.05 && !x.instavel).sort((a, b) => b.g - a.g);
    L.push('');
    L.push('O que fazer aqui (do que mais rende; cada uma sozinha, os ganhos não somam exato; mudanças de ±5% são ruído da medida):');
    if (acoes.length) for (const x of acoes) L.push(`  ${pct(x.g).padStart(5)}${x.via}  ${x.acao} — perde: ${x.perde}`);
    else L.push('  nada sozinho rende 5% ou mais aqui: o lugar já está leve, ou o custo está espalhado.');
    const util = ganhos.filter((x) => !x.acao && !x.nome.startsWith('sem NADA') && x.g > 0.08 && !x.instavel).sort((a, b) => b.g - a.g);
    if (util.length) L.push(`- onde está o peso (para mexer nas peças): ${util.map((x) => `${x.nome.replace(/^sem (a |o |as |os )?/, '')} (${pct(x.g)}${x.via})`).join(', ')}.`);
    const meia = ganhos.find((x) => x.nome.startsWith('metade'));
    const gPix = meia ? (meia.noTeto ? meia.gG : meia.g) : NaN;
    if (meia && Number.isFinite(gPix)) L.push(gPix > 0.3 ? `- os PIXELS pesam (${pct(gPix)}${meia.noTeto ? ' da GPU' : ''} com ¼ deles): resolução, camadas transparentes/recortadas e luz por pixel são o caminho.` : `- os pixels NÃO são o problema aqui (${pct(gPix)}${meia.noTeto ? ' da GPU' : ''} com ¼ deles): baixar a resolução quase não ajuda; o peso é de geometria/chamadas ou CPU.`);
    if (nadaR) L.push(Number.isFinite(teto)
      ? `- sem desenhar nada: ${fmt(nadaR.com.fps, 0)} quadros/s com ${fmt(nd.cpu)} ms de CPU por quadro — o teto da tela; o piso do projeto (lógica + o three.js percorrendo a cena) são esses ${fmt(nd.cpu)} ms.`
      : `- sem desenhar nada o quadro leva ${fmt(1000 / nadaR.com.fps)} ms (${fmt(nadaR.com.fps, 0)} FPS): é o piso (lógica, interface, navegador, e o three.js percorrendo a cena). Tudo acima disso é o desenho do lugar.`);
  }

  // ------------------------------------------------------------ o painel
  montarPainel() {
    const el = document.createElement('div');
    el.id = 'monitor-desempenho';
    el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147483000;display:none;width:300px;padding:8px 10px;background:rgba(10,12,18,.88);color:#dfe6f0;font:11px/1.45 ui-monospace,Consolas,monospace;border:1px solid #3a4560;border-radius:6px;pointer-events:auto;user-select:none';
    const botao = 'flex:1;padding:3px 4px;background:#1e2636;color:#dfe6f0;border:1px solid #3a4560;border-radius:4px;font:inherit;cursor:pointer';
    el.innerHTML = `<div data-p="linhas"></div><canvas width="284" height="56" style="display:block;margin:6px 0;width:284px;height:56px;background:#05070b"></canvas>
      <div style="display:flex;gap:4px"><button data-a="diag" style="${botao}">Diagnosticar e copiar</button><button data-a="copiar" style="${botao}">Só copiar</button><button data-a="zerar" style="${botao};flex:0 0 auto">Zerar</button></div>
      <div style="color:#8a94a8;margin-top:4px">${this.tecla} fecha · pare a câmera no lugar pesado antes de diagnosticar</div>`;
    document.body.appendChild(el);
    this.el = el; this.linhas = el.querySelector('[data-p="linhas"]'); this.cv = el.querySelector('canvas');
    el.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'copiar') this.copiar();
      if (a === 'diag') this.diagnosticar(true);
      if (a === 'zerar') { this.zerar(); this.aviso('Monitor zerado.'); }
    });
  }

  alternar(aberto = !this.aberto) {
    this.aberto = aberto;
    if (this.el) this.el.style.display = aberto ? 'block' : 'none';
    if (aberto) this.desenharPainel();
  }

  aviso(txt) { this.ultAviso = txt; this.ultAvisoT = performance.now(); this.desenharPainel(); }

  desenharPainel() {
    if (!this.aberto || !this.el) return;
    const agora = performance.now(), j = this.janela(agora - 2000), a = this.anterior, ctx = this._contexto();
    this.linhas.innerHTML = [
      `<b style="color:#fff">${fmt(j.fps, 0)} FPS</b> · ${fmt(j.mediana)} ms (p95 ${fmt(j.p95, 0)})${ctx ? ` · ${ctx}` : ''}`,
      `CPU ${fmt(j.cpu)} · GPU ${this.ext ? fmt(j.gpu) : 'n/d'} ms`,
      `gargalo: ${this.gargalo(j).replace(/ \(.*/, '')}`,
      `${Math.round(j.chamadas)} chamadas${j.sombra > 0 ? ` (sombra ${Math.round(j.sombra)})` : ''} · ${mil(j.tri || 0)} triâng. · ${this.renderer.info.programs?.length ?? '?'} prog.`,
      a ? `${a.regiao} x ${fmt(a.x, 0)} z ${fmt(this.eixoCima === 'z' ? a.y : a.z, 0)} · picos ${this.picos.length}` : '',
      this.estadoDiag ? `<i style="color:#e0c060">${this.estadoDiag}…</i>` : '',
      !this.estadoDiag && this.ultAviso && agora - this.ultAvisoT < 6000 ? `<i style="color:#80d090">${this.ultAviso}</i>` : '',
    ].filter(Boolean).join('<br>');
    // o gráfico: os últimos quadros (barras), com as linhas de 60 e 30 por segundo
    const c = this.cv.getContext('2d'), W = this.cv.width, H = this.cv.height, esc = H / 66;
    c.clearRect(0, 0, W, H);
    const m = Math.min(this.n, W);
    for (let i = 0; i < m; i++) {
      const s = (this.n - 1 - i) % N, v = this.q.intervalo[s];
      c.fillStyle = v > 50 ? '#e05040' : v > 33.4 ? '#e0b040' : '#70b070';
      const h = Math.min(H, v * esc);
      c.fillRect(W - 1 - i, H - h, 1, h);
    }
    c.fillStyle = 'rgba(255,255,255,.35)';
    c.fillRect(0, H - 16.7 * esc, W, 1); c.fillRect(0, H - 33.3 * esc, W, 1);
  }

  async copiar() {
    let texto;
    try { texto = this.relatorio(); } catch (e) { texto = `(erro montando o relatório: ${e.stack})`; }
    this.ultRelatorio = texto;
    try {
      await navigator.clipboard.writeText(texto);
      this.aviso('Relatório copiado: cole para quem está otimizando.');
    } catch {
      // sem a área de transferência (página sem https, permissão): o texto numa caixa, já selecionado
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.cssText = 'position:fixed;left:5vw;top:10vh;width:90vw;height:70vh;z-index:2147483001;font:11px ui-monospace,Consolas,monospace';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { }
      if (ok) { ta.remove(); this.aviso('Relatório copiado.'); }
      else { this.aviso('Copie o texto da caixa (Ctrl+C) — clique fora para fechar.'); ta.addEventListener('blur', () => ta.remove()); ta.focus(); }
    }
    return texto;
  }
}

/** Atalho: `instalar({ renderer, scene, camera })` — devolve o monitor (um por página). */
export function instalar(opcoes) {
  if (window.__monitor instanceof MonitorDesempenho) return window.__monitor;
  return new MonitorDesempenho(opcoes);
}
