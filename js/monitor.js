/**
 * O MONITOR DE DESEMPENHO (06/10/2026) — F3, ou "Desempenho" no menu de pausa.
 *
 * Para fazer o jogo bonito E leve: diz ONDE o quadro gasta tempo, ONDE no mapa pesa e
 * QUANDO travou (e por quê). O botão "Copiar relatório" põe tudo num texto para colar.
 *
 * GRAVA SEMPRE, desde o começo da partida (custa ~15 leituras de relógio por quadro), com
 * o painel aberto ou não — um tranco que já passou está no relatório:
 *  • o laço do jogo (main.js) marca as FASES (`fase('mundo')`, `fase('render')`…): a CPU
 *    de cada uma, por quadro;
 *  • a GPU: uma consulta de tempo (`EXT_disjoint_timer_query_webgl2`) em volta do quadro
 *    inteiro — a resposta chega quadros depois e nunca bloqueia. Com ela dá para dizer se
 *    o limite é a placa ou a CPU;
 *  • por quadro (os últimos `N`, num anel): o intervalo entre quadros, CPU, GPU, chamadas
 *    de desenho, triângulos, onde estava; por SEGUNDO (a sessão inteira); por REGIÃO e por
 *    bloco de 24 m do mapa (os lugares que pesam);
 *  • os PICOS: quadro mais longo que `PICO_MS` e que 2,5× a mediana recente. O culpado é o
 *    quadro ANTERIOR (o intervalo medido no quadro F é o que o F−1 levou): guarda as fases
 *    dele, se compilou shader (programas a mais), subiu textura/geometria, se houve coleta
 *    de lixo (a memória do JS caiu), e — pelo `long-animation-frame` do navegador — que
 *    script segurou o quadro.
 *
 * "DIAGNOSTICAR AQUI" (com o menu aberto, a câmera parada): mede o FPS desligando UMA
 * coisa de cada vez (metade dos pixels, a decoração, as árvores, os cartazes, as luzes, a
 * tocha, o capim, o céu, o clarão, tudo), intercalando com a base. O ganho de cada uma é
 * onde vale otimizar NAQUELE lugar. Tudo volta ao que era no fim, mesmo se der erro.
 */
const N = 7200;              // quadros guardados (~2 min a 60/s)
const MAX_FASES = 24;
const PICO_MS = 50;          // abaixo disto não é pico (é só um quadro lento)
const MAX_PICOS = 300;
const BLOCO = 4;             // células por bloco de lugar (4 × 6 m = 24 m, o lote da decoração)

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));
const mil = (v) => (v >= 1e6 ? (v / 1e6).toFixed(2) + ' mi' : v >= 1e3 ? (v / 1e3).toFixed(0) + ' mil' : String(Math.round(v)));
const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const percentil = (ord, p) => (ord.length ? ord[Math.min(ord.length - 1, Math.floor(ord.length * p))] : NaN);
const barra = (v, max, larg = 16) => '█'.repeat(Math.max(0, Math.round((v / Math.max(max, 1e-9)) * larg)));

export class Monitor {
  constructor(game) {
    this.game = game;
    this.fases = []; this.idx = new Map();
    this.q = {
      t: new Float64Array(N), intervalo: new Float32Array(N), cpu: new Float32Array(N), gpu: new Float32Array(N).fill(NaN),
      chamadas: new Uint32Array(N), tri: new Uint32Array(N), fase: new Float32Array(N * MAX_FASES),
      sombra: new Uint32Array(N),   // das chamadas, quantas foram da passagem de sombra (a tocha)
    };
    this.atual = new Float32Array(MAX_FASES);
    this.zerar();
    // A PASSAGEM DE SOMBRA (07/10/2026): o three.js a desenha dentro do render e zera o
    // `renderer.info` antes do desenho principal — as chamadas dela não apareciam. Com a tocha
    // acesa eram ~2.200 por quadro no Alto (o dobro do resto). Contadas aqui, por fora.
    const sm = game.renderer.shadowMap, ri = game.renderer.info.render, sombraOrig = sm.render.bind(sm);
    this.sombraQuadro = 0; this.sombraTriQuadro = 0;
    sm.render = (...args) => {
      const c0 = ri.calls, t0 = ri.triangles;
      sombraOrig(...args);
      this.sombraQuadro += ri.calls - c0; this.sombraTriQuadro += ri.triangles - t0;
    };
    // a GPU: consultas de tempo, reaproveitadas
    const gl = game.renderer.getContext();
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    this.livres = []; this.pendentes = []; this.consulta = null;
    // os quadros longos do navegador (com o script culpado), quando ele sabe dizer
    this.loaf = [];
    try {
      const tipo = PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame') ? 'long-animation-frame' : 'longtask';
      this.tipoLongo = tipo;
      new PerformanceObserver((lista) => {
        for (const e of lista.getEntries()) {
          this.loaf.push({ ini: e.startTime, dur: e.duration, bloq: e.blockingDuration ?? null,
            scripts: (e.scripts ?? []).map((s) => ({ fonte: (s.sourceURL || '').split('/').pop() + (s.sourceCharPosition >= 0 ? `@${s.sourceCharPosition}` : ''), funcao: s.sourceFunctionName || s.invoker || '?', dur: s.duration, tipo: s.invokerType })) });
          if (this.loaf.length > 400) this.loaf.shift();
        }
      }).observe({ type: tipo, buffered: false });
    } catch { this.tipoLongo = null; }
    fetch('assets/versao.json', { cache: 'no-store' }).then((r) => r.json()).then((v) => { this.versao = v.versao; }).catch(() => {});
    window.addEventListener('keydown', (e) => { if (e.code === 'F3') { e.preventDefault(); this.alternar(); } });
    this.montarPainel();
  }

  /** Começa a sessão de novo (o botão "Zerar"): picos, segundos, regiões e lugares. */
  zerar() {
    this.n = 0;
    this.ultInicio = 0;
    this.sessaoIni = performance.now(); this.relogioIni = new Date();
    this.picos = []; this.segundos = []; this.seg = null;
    this.regioes = new Map(); this.lugares = new Map();
    this.medianaRecente = 16.7;
    this.anterior = null;
    this.diagnostico = null;
    this.janelasDiag = [];   // [início, fim] de cada "Diagnosticar aqui" (fora das contas)
    this.eventos = [];       // o que mudou os números durante a sessão (qualidade trocada…)
  }

  // ------------------------------------------------------------ as marcas do laço
  /** O começo de um quadro jogando (main.js). */
  inicio() {
    const t = performance.now();
    // depois de uma pausa longa (título, aba escondida) o intervalo não conta
    const intervalo = this.ultInicio && t - this.ultInicio < 2000 ? t - this.ultInicio : 0;
    this.ultInicio = t; this.marca = t; this.t0 = t; this.intervaloAtual = intervalo;
    this.atual.fill(0);
    this.sombraQuadro = 0; this.sombraTriQuadro = 0;
    if (intervalo && intervalo > PICO_MS && intervalo > 2.5 * this.medianaRecente && this.anterior && !this.diagnosticando) this.registrarPico(t, intervalo);
  }

  /**
   * Logo antes do render principal: começa a medir a GPU. Não no começo do quadro (como era
   * até 06/10): a consulta de tempo conta também a placa PARADA esperando o JavaScript, e
   * um quadro lento por CPU (lógica, um script pesado) saía como "GPU". Do render em diante
   * a placa recebe trabalho seguido.
   */
  antesDoRender() {
    if (this.ext && !this.consulta) {
      this.consulta = this.livres.pop() ?? this.gl.createQuery();
      this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.consulta);
    }
  }

  /** O fim de uma fase: o tempo desde a última marca vai para `nome`. */
  fase(nome) {
    const t = performance.now();
    let i = this.idx.get(nome);
    if (i === undefined) { if (this.fases.length >= MAX_FASES) return; i = this.fases.length; this.fases.push(nome); this.idx.set(nome, i); }
    this.atual[i] += t - this.marca;
    this.marca = t;
  }

  /** O fim do quadro: grava tudo e vê se as respostas da GPU chegaram. */
  fim() {
    const t = performance.now(), g = this.game, r = g.renderer, Q = this.q;
    const slot = this.n % N;
    if (this.consulta) {
      this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pendentes.push({ q: this.consulta, slot, n: this.n });
      this.consulta = null;
    }
    this.lerGpu();
    const info = r.info, cpu = t - this.t0;
    Q.t[slot] = this.t0; Q.intervalo[slot] = this.intervaloAtual; Q.cpu[slot] = cpu; Q.gpu[slot] = NaN;
    Q.chamadas[slot] = this.chamadasDoQuadro; Q.tri[slot] = this.triDoQuadro; Q.sombra[slot] = this.sombraDoQuadro ?? 0;
    Q.fase.set(this.atual, slot * MAX_FASES);
    // o que mudou desde o quadro anterior (para explicar um pico no próximo) — no MESMO
    // objeto, sem criar nada por quadro (o monitor não pode ser ele mesmo o lixo que mede)
    const heap = performance.memory ? performance.memory.usedJSHeapSize / 1048576 : NaN;
    const progs = info.programs?.length ?? 0, tex = info.memory.textures, geo = info.memory.geometries;
    const p = g.player?.pos;
    const lin = p ? Math.round(p.z / 6) : 0, col = p ? Math.round(p.x / 6) : 0;   // World.cellOf, sem o array
    const regiao = this.regiao(lin, col);
    const a = this.anterior ??= { fases: new Float32Array(MAX_FASES), progs, tex, geo, heap };
    a.dProg = progs - a.progs; a.dTex = tex - a.tex; a.dGeo = geo - a.geo; a.dHeap = heap - a.heap;
    a.progs = progs; a.tex = tex; a.geo = geo; a.heap = heap;
    a.slot = slot; a.n = this.n; a.cpu = cpu; a.fases.set(this.atual); a.chamadas = Q.chamadas[slot]; a.tri = Q.tri[slot];
    a.regiao = regiao; a.lin = lin; a.col = col; a.x = p?.x ?? 0; a.y = p?.y ?? 0; a.z = p?.z ?? 0;
    a.yaw = g.player?.camYaw ?? 0; a.menu = g.menu || null; a.sombra = Q.sombra[slot]; a.tocha = !!g.player?.torchLit;
    // QUAIS shaders compilaram (os programas novos ficam no fim da lista do three.js): o TIPO
    // do material (`type`) e o nome dele (`name`, quase sempre vazio) — só quando houve (raro:
    // não gera lixo por quadro)
    a.novosProgs = a.dProg > 0 ? (info.programs ?? []).slice(-a.dProg).map((pr) => pr.type + (pr.name ? ` "${pr.name}"` : '')).join(', ') : null;
    this.n++;
    const iv = this.intervaloAtual;
    // durante o "Diagnosticar aqui" o jogo é mexido de propósito: fora das contas da sessão
    if (iv > 0 && !this.diagnosticando) { this.agregar(iv, cpu, regiao, lin, col, Q.chamadas[slot], Q.tri[slot], t); if (a.tocha) this.seg.tocha++; }
    if ((this.n & 7) === 0) this.atualizarMediana();
    if (this.aberto && t - (this.ultPainel ?? 0) > 250) { this.ultPainel = t; this.desenharPainel(); }
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
        const ms = gl.getQueryParameter(pe.q, gl.QUERY_RESULT) / 1e6;
        this.q.gpu[pe.slot] = ms;
        if (this.seg) { this.seg.gpu += ms; this.seg.gpuN++; }
        const rg = this.regioes.get(this.anterior?.regiao); if (rg) { rg.gpu += ms; rg.gpuN++; }
      }
      this.livres.push(pe.q);
    }
  }

  /** Um acontecimento que muda os números (a troca de qualidade, graficos.js): vai para o
   *  relatório, e os picos logo depois dele dizem "logo depois de". */
  evento(texto) {
    const t = performance.now(), a = this.anterior;
    this.eventos.push({ t, s: (t - this.sessaoIni) / 1000, relogio: new Date().toLocaleTimeString('pt-BR'), texto, onde: a ? `${a.regiao} [${a.lin}, ${a.col}]` : '' });
    if (this.eventos.length > 100) this.eventos.shift();
  }

  /** A região do mapa pela célula (as faixas de colunas da variante `floresta`). */
  regiao(lin, col) {
    const w = this.game.world;
    if (!w.isOpenAir(lin, col)) return 'masmorra';
    if (col >= 55) return 'WindHills';
    if (col >= 40) return 'acampamento';
    if (col >= 26) return 'mata';
    return 'floresta';
  }

  agregar(iv, cpu, regiao, lin, col, chamadas, tri, t) {
    const s = Math.floor((t - this.sessaoIni) / 1000);
    if (!this.seg || this.seg.s !== s) {
      if (this.seg) { this.segundos.push(this.seg); if (this.segundos.length > 7200) this.segundos.shift(); }
      this.seg = { s, n: 0, soma: 0, max: 0, cpu: 0, gpu: 0, gpuN: 0, chamadas: 0, tri: 0, lentos: 0, tocha: 0, regiao, qual: this.game.graficos?.q.nome };
    }
    const S = this.seg;
    S.n++; S.soma += iv; S.max = Math.max(S.max, iv); S.cpu += cpu; S.chamadas += chamadas; S.tri += tri; if (iv > 33.4) S.lentos++; S.regiao = regiao;
    this.acumular(this.regioes, regiao, iv, cpu, chamadas, tri, regiao, lin, col);
    this.acumular(this.lugares, Math.floor(lin / BLOCO) * 10000 + Math.floor(col / BLOCO), iv, cpu, chamadas, tri, regiao, lin, col);
  }

  acumular(mapa, chave, iv, cpu, chamadas, tri, regiao, lin, col) {
    let a = mapa.get(chave);
    if (!a) mapa.set(chave, (a = { n: 0, soma: 0, max: 0, cpu: 0, gpu: 0, gpuN: 0, chamadas: 0, tri: 0, lentos: 0, hist: new Uint32Array(64), regiao, lin, col }));
    a.n++; a.soma += iv; a.max = Math.max(a.max, iv); a.cpu += cpu; a.chamadas += chamadas; a.tri += tri; if (iv > 33.4) a.lentos++;
    a.hist[Math.min(63, Math.floor(iv / 4))]++;   // histograma de 4 em 4 ms (para o p95)
    a.lin = lin; a.col = col; a.regiao = regiao;
  }

  /** Logo depois do render principal: o `renderer.info` é zerado a cada `render()`, e o
   *  clarão desenha depois — sem isto as chamadas do quadro sairiam as do clarão. */
  depoisDoRender() {
    const i = this.game.renderer.info.render;
    // com as da passagem de sombra (que o `info` já tinha zerado): o número de verdade
    this.chamadasDoQuadro = i.calls + this.sombraQuadro; this.triDoQuadro = i.triangles + this.sombraTriQuadro;
    this.sombraDoQuadro = this.sombraQuadro;
  }

  /**
   * A mediana dos últimos 30 quadros (de 8 em 8): curta para acompanhar uma mudança de
   * patamar — com 120 quadros, depois de trocar de Baixo para Alto, os quadros NORMAIS do
   * Alto contavam como pico por segundos (17 de 22 "picos" num relatório). Num vetor fixo:
   * o monitor não gera lixo.
   */
  atualizarMediana() {
    const v = (this._med ??= new Float32Array(30));
    let k = 0;
    for (let i = 1; i <= Math.min(this.n, 30); i++) { const x = this.q.intervalo[(this.n - i) % N]; if (x > 0) v[k++] = x; }
    if (!k) return;
    const s = v.subarray(0, k).sort();
    this.medianaRecente = s[k >> 1];
  }

  registrarPico(t, intervalo) {
    const a = this.anterior, g = this.game;
    const h = g.world && typeof g.world.ambience === 'object' ? this.horaDoMundo() : null;
    this.picos.push({
      t, s: (t - this.sessaoIni) / 1000, relogio: new Date().toLocaleTimeString('pt-BR'), intervalo, mediana: this.medianaRecente,
      ...a, fases: Float32Array.from(a.fases), hora: h, outros: g.sessao?.outros?.length ?? 0, modo: g.modo,
    });
    if (this.picos.length > MAX_PICOS) this.picos.shift();
  }

  horaDoMundo() {
    const v = globalThis.__hora;
    if (Number.isFinite(v)) return v;
    return ((Date.now() / 1000) % 1200) / 1200 * 24;   // DIA_S = 20 min (world.js)
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

  /** O limite provável: placa (GPU), lógica (CPU) ou o que não é nenhum dos dois. */
  gargalo(j) {
    if (!(j.n > 10)) return '—';
    const frame = j.mediana;
    if (Number.isFinite(j.gpu) && j.gpu > 0.8 * frame) return `GPU (a placa leva ${fmt(j.gpu)} de ${fmt(frame)} ms)`;
    if (j.cpu > 0.8 * frame) {
      const ir = this.idx.get('render');
      const render = ir !== undefined ? j.fases[ir] : 0;
      return render > 0.5 * j.cpu ? `CPU no render (${fmt(render)} ms montando ${Math.round(j.chamadas)} chamadas de desenho)` : `CPU na lógica do jogo (${fmt(j.cpu - render)} ms)`;
    }
    if (frame < 18) return 'nenhum (no limite da tela, ~60/s)';
    return `fora do laço (${fmt(frame - Math.max(j.cpu, j.gpu || 0))} ms: navegador, composição da página ou espera da placa)`;
  }

  // ------------------------------------------------------------ "Diagnosticar aqui"
  /**
   * O TESTE DO LUGAR (melhorado em 07/10/2026 — antes eu refazia estes testes à mão, rodada
   * após rodada). Cada teste desliga UMA coisa e diz o que fazer se ela pesar: `acao` (a
   * mudança concreta) e `perde` (o que se vê de diferente). A base é medida a cada 2 testes
   * e cada teste é comparado com a média da base de antes e da de depois (a máquina oscila).
   * Teste que recompila shader (`lento`) espera mais antes de medir. `copiarNoFim`: o botão
   * "Diagnosticar e copiar" — o relatório vai para a área de transferência quando acaba.
   */
  async diagnosticar(copiarNoFim = false) {
    if (this.diagnosticando) return;
    const g = this.game, w = g.world, r = g.renderer;
    this.diagnosticando = true;
    g.graficos.pausaAuto = true;   // a resolução automática não mexe na escala enquanto mede
    const lotes = [], arvores = [], cartazes = [];
    for (const gr of w.lod?.grupos ?? []) for (const im of gr.ims) { lotes.push(im); if (gr.cartaz) arvores.push(im); }
    for (const c of w.lod?.cartazes?.values() ?? []) { cartazes.push(c.malha); lotes.push(c.malha); }
    const camadas = (lista, l) => { for (const o of lista) o.layers.set(l); };
    const q = g.graficos.q, pr = r.getPixelRatio(), luzes = [w.luzesNoOrcamento, w.luzesForaNoOrcamento];
    const tocha = g.player?.torchLight, acesa = !!g.player?.torchLit && !!q.sombra;
    const recompilar = () => g.scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    const entes = [...(g.all ?? []), ...(w.cadaveres ?? [])];
    const personagens = (esconder) => { for (const e of entes) for (const o of e.__lodMalhas ?? []) o.layers.set(esconder || e.__lodOculto ? 31 : 0); };
    const sombraCurta = (m) => { const s = tocha.shadow, orig = s.updateMatrices.bind(s); this._sombraOrig = orig; s.updateMatrices = (l, f) => { orig(l, f); if (s.camera.far !== m) { s.camera.far = m; s.camera.updateProjectionMatrix(); } }; };
    const impostorAntes = q.impostor, tipoAntes = r.shadowMap.type;
    // [nome, liga, desliga, ação, o que se perde, recompila?]
    const testes = [
      ['metade da resolução (¼ dos pixels)', () => r.setPixelRatio(pr / 2), () => r.setPixelRatio(pr), 'menos resolução (resolução automática, ou `pixelRatio` da qualidade)', 'imagem menos nítida'],
      ['sem a decoração inteira', () => camadas(lotes, 31), () => camadas(lotes, 0), null, null],
      ['sem as árvores de perto', () => camadas(arvores, 31), () => camadas(arvores, 0), null, null],
      [`cartaz a partir de 45 m (hoje ${impostorAntes})`, () => { q.impostor = 45; }, () => { q.impostor = impostorAntes; }, `\`impostor\` da qualidade ${q.nome}: 45 m`, 'árvores a partir de 45 m viram cartaz (de perto um pouco menos detalhe)'],
      ['sem os cartazes de árvore', () => camadas(cartazes, 31), () => camadas(cartazes, 0), null, null],
      ['sem os personagens (inimigos, animais)', () => personagens(true), () => personagens(false), 'personagens: cortar mais perto (`PERSONAGEM_LONGE`, lod.js) ou modelos mais leves', 'bichos/inimigos somem mais cedo ao longe'],
      ['sem as luzes de cenário', () => { w.luzesNoOrcamento = 0; w.luzesForaNoOrcamento = 0; w.distribuirLuzes(); }, () => { [w.luzesNoOrcamento, w.luzesForaNoOrcamento] = luzes; w.distribuirLuzes(); }, `menos luzes de cenário (\`luzes\`/\`luzesFora\` da qualidade ${q.nome}: hoje ${luzes[0]}/${luzes[1]})`, 'menos tochas/fogueiras iluminando ao mesmo tempo', true],
      ...(acesa ? [
        ['tocha acesa SEM sombra', () => { tocha.castShadow = false; }, () => { tocha.castShadow = true; }, `sombra da tocha desligada na qualidade ${q.nome}`, 'sem as sombras que a tocha faz (personagem, árvores)', true],
        ['sombra da tocha sem suavização', () => { r.shadowMap.type = 0; r.shadowMap.needsUpdate = true; recompilar(); }, () => { r.shadowMap.type = tipoAntes; r.shadowMap.needsUpdate = true; recompilar(); }, `\`tipoSombra\` da qualidade ${q.nome}: BasicShadowMap`, 'a borda da sombra da tocha fica serrilhada', true],
        ['sombra da tocha só até 12 m (hoje 24)', () => sombraCurta(12), () => { tocha.shadow.updateMatrices = this._sombraOrig; }, 'alcance da sombra da tocha 12 m (a luz continua 24)', 'o que está a mais de 12 m da tocha não faz sombra dela'],
        ['tocha apagada', () => g.player.toggleTorch(), () => g.player.toggleTorch(), 'apagar a tocha quando não precisa (de dia)', 'menos luz em volta'],
      ] : []),
      ['sem o capim', () => g.capim?.malha?.layers.set(31), () => g.capim?.malha?.layers.set(0), `capim menos denso (\`capim\` da qualidade ${q.nome}: hoje ${q.capim})`, 'chão menos coberto'],
      ['sem o céu desenhado', () => g.ceu?.abobada.layers.set(31), () => g.ceu?.abobada.layers.set(0), null, null],
      ['sem o clarão do sol/lua', () => { this._clarao = q.clarao; q.clarao = false; }, () => { q.clarao = this._clarao; }, 'clarão desligado nesta qualidade', 'sem o reflexo de lente'],
      ['sem NADA na tela (o custo fixo)', () => g.camera.layers.disableAll(), () => g.camera.layers.set(0), null, null],
    ];
    const medir = async (espera) => { await new Promise((f) => setTimeout(f, espera)); const t0 = performance.now(); await new Promise((f) => setTimeout(f, 1300)); return this.janela(t0, performance.now(), true); };
    const res = [], bases = [], janela = [performance.now(), Infinity];
    this.janelasDiag.push(janela);
    const passo = (txt) => { this.estadoDiag = txt; this.desenharPainel(); };
    try {
      passo('medindo a base');
      bases.push(await medir(700));
      for (let i = 0; i < testes.length; i++) {
        const [nome, liga, desliga, acao, perde, lento] = testes[i];
        passo(`medindo ${i + 1}/${testes.length}: ${nome}`);
        try { liga(); res.push({ nome, acao, perde, antes: bases.length - 1, com: await medir(lento ? 1800 : 700) }); } finally { desliga(); }
        // a base de novo a cada 2 testes (e no fim): cada teste usa a média das bases em volta
        if (i % 2 === 1 || i === testes.length - 1) { passo(`medindo ${i + 1}/${testes.length}: base`); bases.push(await medir(lento ? 1800 : 700)); }
      }
      for (const x of res) {
        const b0 = bases[x.antes], b1 = bases[x.antes + 1] ?? b0;
        x.base = { fps: (b0.fps + b1.fps) / 2, gpu: (b0.gpu + b1.gpu) / 2, chamadas: (b0.chamadas + b1.chamadas) / 2 };
      }
      const p = g.player?.pos, [lin, col] = p ? w.cellOf(p) : [0, 0];
      this.diagnostico = { quando: new Date().toLocaleTimeString('pt-BR'), s: (performance.now() - this.sessaoIni) / 1000, onde: `${this.regiao(lin, col)} [${lin}, ${col}] x ${fmt(p?.x)} z ${fmt(p?.z)}, olhando ${Math.round((((g.player?.camYaw ?? 0) * 180 / Math.PI) % 360 + 360) % 360)}°${acesa ? ', tocha acesa' : ''}, qualidade ${q.nome}`, tela: `${this.gl.drawingBufferWidth}×${this.gl.drawingBufferHeight}`, res };
      if (!copiarNoFim) g.ui?.toast('Diagnóstico pronto: está no relatório.');
    } finally {
      // um segundo de folga: o último teste ainda pode estar desfazendo (shaders, luzes)
      await new Promise((f) => setTimeout(f, 1000));
      janela[1] = performance.now();
      this.diagnosticando = false; this.estadoDiag = null; g.graficos.pausaAuto = false;
      this.ultInicio = 0;   // o intervalo do primeiro quadro depois não conta
      this.desenharPainel();
    }
    if (copiarNoFim) await this.copiar();
  }

  // ------------------------------------------------------------ o relatório
  relatorio() {
    const g = this.game, r = g.renderer, gl = this.gl, agora = performance.now(), L = [];
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const gpuNome = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const q = g.graficos.q, sess = (agora - this.sessaoIni) / 1000;
    const tudo = this.janela(this.sessaoIni), ult10 = this.janela(agora - 10000), ult60 = this.janela(agora - 60000);
    L.push(`# Relatório de desempenho — Masmorra do Carrasco`);
    L.push(`versão ${this.versao ?? '?'} · gerado ${new Date().toLocaleString('pt-BR')} · sessão ${mmss(sess)} (desde ${this.relogioIni.toLocaleTimeString('pt-BR')}) · modo ${g.modo}${g.sessao?.outros?.length ? ` · ${g.sessao.outros.length} outros jogadores` : ''}`);
    L.push('');
    L.push('## Máquina e configuração');
    L.push(`GPU: ${gpuNome}`);
    L.push(`navegador: ${navigator.userAgent.match(/(Chrome|Firefox|Edg|Safari)\/[\d.]+/g)?.join(' ') ?? navigator.userAgent} · núcleos ${navigator.hardwareConcurrency ?? '?'} · memória ${navigator.deviceMemory ?? '?'} GB · ${navigator.platform}`);
    L.push(`tela: ${innerWidth}×${innerHeight} (devicePixelRatio ${devicePixelRatio}) → desenhando ${gl.drawingBufferWidth}×${gl.drawingBufferHeight} (pixelRatio ${fmt(r.getPixelRatio(), 2)}) · antisserrilhado ${gl.getContextAttributes().antialias ? 'sim' : 'não'} · escala de resolução ${Math.round((g.graficos.escala ?? 1) * 100)}% (automática ${g.graficos.auto ? 'ligada' : 'desligada'})`);
    L.push(`qualidade: ${q.nome} — pixelRatio até ${q.pixelRatio}, sombra da tocha ${q.sombra ? `${q.sombra.mapa}px a cada ${q.sombra.aCada}` : 'não'}, luzes ${q.luzes} (ar livre ${q.luzesFora}), capim ${q.capim}, nuvens ${q.nuvens}, clarão ${q.clarao ? 'sim' : 'não'}, cartaz a partir de ${q.impostor} m, detalhe some abaixo de ${q.limiarPx} px`);
    // o antisserrilhado (MSAA) é escolhido ao criar a página: só dá para medir reabrindo o jogo
    if (gl.getContextAttributes().antialias) L.push(`antisserrilhado ligado: o teste do lugar não o mede (só reabrindo o jogo). Referência: numa Radeon 740M a 1920×945, no Médio com a tocha acesa, ele custava ~26% (29,1 → 36,7 quadros/s, 07/10/2026).`);
    L.push(`cronômetro da GPU: ${this.ext ? 'sim' : 'NÃO (sem o tempo da placa; o gargalo é deduzido)'} · quadros longos do navegador: ${this.tipoLongo ?? 'não'}`);
    L.push('');
    L.push('## Resumo (só jogando)');
    const linhaResumo = (rot, j) => `${rot.padEnd(14)} FPS ${fmt(j.fps).padStart(5)} · quadro mediana ${fmt(j.mediana)} p95 ${fmt(j.p95)} p99 ${fmt(j.p99)} máx ${fmt(j.max, 0)} ms · CPU ${fmt(j.cpu)} · GPU ${fmt(j.gpu)} ms · ${Math.round(j.chamadas)} chamadas (${Math.round(j.sombra || 0)} da sombra da tocha) · ${mil(j.tri || 0)} triâng. · lentos >33ms ${j.n ? Math.round(100 * j.lentos33 / j.n) : 0}% >50ms ${j.n ? Math.round(100 * j.lentos50 / j.n) : 0}% >100ms ${j.lentos100}`;
    // os últimos 10 s podem ter sido o próprio teste do lugar (fica fora das contas)
    L.push(ult10.n ? linhaResumo('últimos 10 s', ult10) : `últimos 10 s    (foram do teste do lugar: fora das contas)`);
    L.push(linhaResumo('último 1 min', ult60));
    L.push(linhaResumo(`jogado (${Math.round(tudo.n / Math.max(tudo.fps || 1, 1))} s)`, tudo));
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
    for (const [nome, v] of ord) if (v >= 0.05) L.push(`${nome.padEnd(14)} ${fmt(v, 2).padStart(6)} ms  ${barra(v, maxF)}`);
    L.push(`(render = o three.js montando e enviando o quadro; o trabalho da PLACA é a GPU acima)`);
    L.push('');
    L.push('## Por região (sessão)');
    L.push('região         tempo   FPS  mediana  p95   máx   CPU   GPU  chamadas  triâng.  lentos>33');
    for (const [nome, a] of [...this.regioes.entries()].sort((x, y) => y[1].n - x[1].n)) {
      L.push(`${nome.padEnd(13)} ${mmss(a.soma / 1000)}  ${fmt(1000 * a.n / a.soma, 0).padStart(4)}  ${fmt(this.histP(a.hist, a.n, 0.5), 0).padStart(5)}  ${fmt(this.histP(a.hist, a.n, 0.95), 0).padStart(4)}  ${fmt(a.max, 0).padStart(4)}  ${fmt(a.cpu / a.n).padStart(4)}  ${fmt(a.gpuN ? a.gpu / a.gpuN : NaN).padStart(4)}  ${String(Math.round(a.chamadas / a.n)).padStart(8)}  ${mil(a.tri / a.n).padStart(8)}  ${Math.round(100 * a.lentos / a.n)}%`);
    }
    L.push('');
    L.push(`## Os lugares mais pesados (blocos de ${BLOCO * 6} m com 3 s ou mais de jogo, pela média do quadro)`);
    const lugares = [...this.lugares.values()].filter((a) => a.soma > 3000).sort((x, y) => y.soma / y.n - x.soma / x.n).slice(0, 8);
    for (const a of lugares) L.push(`${a.regiao.padEnd(12)} célula ~[${a.lin}, ${a.col}] (x ${a.col * 6} z ${a.lin * 6}) · ${fmt(a.soma / a.n)} ms (${fmt(1000 * a.n / a.soma, 0)} FPS) · p95 ${fmt(this.histP(a.hist, a.n, 0.95), 0)} · ${Math.round(a.chamadas / a.n)} chamadas · ${mil(a.tri / a.n)} triâng. · ficou ${mmss(a.soma / 1000)}`);
    if (!lugares.length) L.push('(ainda pouco tempo de jogo)');
    L.push('');
    this.secaoPicos(L);
    this.secaoCena(L);
    L.push('## Linha do tempo (blocos de 10 s, últimos 5 min)');
    L.push('quando  FPS   máx   CPU   GPU  chamadas  triâng.  lentos  tocha  qualidade  região');
    const segs = [...this.segundos, ...(this.seg ? [this.seg] : [])].filter((s) => s.s >= sess - 300);
    for (let i = 0; i < segs.length; i += 10) {
      const b = segs.slice(i, i + 10), n = b.reduce((s, x) => s + x.n, 0), soma = b.reduce((s, x) => s + x.soma, 0), gN = b.reduce((s, x) => s + x.gpuN, 0);
      if (!n) continue;
      L.push(`${mmss(b[0].s)}   ${fmt(1000 * n / soma, 0).padStart(3)}  ${fmt(Math.max(...b.map((x) => x.max)), 0).padStart(4)}  ${fmt(b.reduce((s, x) => s + x.cpu, 0) / n).padStart(4)}  ${fmt(gN ? b.reduce((s, x) => s + x.gpu, 0) / gN : NaN).padStart(4)}  ${String(Math.round(b.reduce((s, x) => s + x.chamadas, 0) / n)).padStart(8)}  ${mil(b.reduce((s, x) => s + x.tri, 0) / n).padStart(8)}  ${String(b.reduce((s, x) => s + x.lentos, 0)).padStart(5)}  ${(Math.round(100 * b.reduce((s, x) => s + (x.tocha ?? 0), 0) / n) + '%').padStart(5)}  ${[...new Set(b.map((x) => x.qual))].join('→').padEnd(9)}  ${[...new Set(b.map((x) => x.regiao))].join('→')}`);
    }
    L.push('');
    this.secaoDiagnostico(L, ult60);
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
      // o script que o navegador aponta — menos o próprio laço do jogo (o setAnimationLoop
      // do three.js), que não diz nada: aí quem explica são as fases
      const loaf = this.loafDe(p);
      const fora = (loaf?.scripts ?? []).filter((s) => !(s.funcao === 'onAnimationFrame' && /three/.test(s.fonte)) && s.dur > 20).sort((a, b) => b.dur - a.dur)[0];
      if (fora) c.push(['script fora do laço do jogo', `script fora do laço: ${fora.funcao} (${fora.fonte || 'sem arquivo'}) ${fmt(fora.dur, 0)} ms`]);
      const gpu = this.q.gpu[p.slot];
      if (p.cpu > 0.6 * p.intervalo) {
        const [nome, v] = [...p.fases].map((x, i) => [this.fases[i], x]).sort((a, b) => b[1] - a[1])[0];
        if (!c.length || v > 0.5 * p.cpu) c.push([`CPU do jogo: ${nome}`, `CPU do jogo, na fase "${nome}" (${fmt(v, 0)} ms)`]);
      } else if (Number.isFinite(gpu) && gpu > 0.6 * p.intervalo) c.push(['placa (GPU)', `placa (GPU ${fmt(gpu, 0)} ms)`]);
      else if (!c.length) c.push(['fora do laço', 'fora do laço do jogo (navegador, composição da página, sistema)']);
      return c;
    };
    const causas = {};
    for (const p of this.picos) for (const [k] of classe(p)) causas[k] = (causas[k] ?? 0) + 1;
    L.push('por causa: ' + Object.entries(causas).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ×${v}`).join(' · '));
    const piores = [...this.picos].sort((a, b) => b.intervalo - a.intervalo).slice(0, 25).sort((a, b) => a.t - b.t);
    for (const p of piores) {
      const gpu = this.q.gpu[p.slot];
      L.push(`- ${mmss(p.s)} (${p.relogio}) · ${fmt(p.intervalo, 0)} ms (mediana ${fmt(p.mediana, 0)}) · ${p.regiao} [${p.lin}, ${p.col}] x ${fmt(p.x, 0)} z ${fmt(p.z, 0)} olhando ${Math.round(((p.yaw * 180 / Math.PI) % 360 + 360) % 360)}°${p.tocha ? ' · tocha acesa' : ''}${p.menu ? ` · menu ${p.menu}` : ''}`);
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

  /** A cena agora: o que está sendo desenhado e o que mais pesa no campo de visão. */
  secaoCena(L) {
    const g = this.game, r = g.renderer, info = r.info, cam = g.camera;
    L.push('## A cena agora');
    const mem = performance.memory;
    L.push(`tocha ${g.player?.torchLit ? 'ACESA' : 'apagada'} · chamadas ${this.chamadasDoQuadro ?? info.render.calls} (${this.sombraDoQuadro ?? 0} da sombra da tocha) · triângulos ${mil(this.triDoQuadro ?? info.render.triangles)} · programas ${info.programs?.length} · texturas ${info.memory.textures} · geometrias ${info.memory.geometries}${mem ? ` · memória JS ${Math.round(mem.usedJSHeapSize / 1048576)} de ${Math.round(mem.jsHeapSizeLimit / 1048576)} MB` : ''}`);
    const luzes = {}; let sombras = 0;
    g.scene.traverse((o) => { if (o.isLight && o.visible) { luzes[o.type] = (luzes[o.type] ?? 0) + 1; if (o.castShadow) sombras++; } });
    L.push(`luzes visíveis: ${Object.entries(luzes).map(([k, v]) => `${v} ${k.replace('Light', '')}`).join(', ')} · projetando sombra: ${sombras} · orçamento ${g.world.luzesNoOrcamento} dentro / ${g.world.luzesForaNoOrcamento} fora`);
    if (g.world.lod) L.push(`LOD: ${JSON.stringify(g.world.lod.resumo())}`);
    if (g.capim?.malha) L.push(`capim: ${g.capim.malha.count} tufos`);
    // o que mais pesa no campo de visão (pela esfera de cada objeto)
    L.push('mais pesados no campo de visão agora (triângulos × cópias):');
    for (const l of this.maisPesados(12)) L.push(`  ${l}`);
    L.push('');
  }

  maisPesados(k) {
    const g = this.game, cam = g.camera, M = cam.projectionMatrix.clone().multiply(cam.matrixWorldInverse);
    const planos = this.planosDoFrustum(M), grupos = new Map();
    // o nome da PEÇA (decor.json) de cada lote da decoração — o InstancedMesh não tem nome
    const pecaDoLote = new Map();
    for (const gr of g.world.lod?.grupos ?? []) for (const im of gr.ims) pecaDoLote.set(im, gr.prop);
    const visivel = (o) => { for (let p = o; p; p = p.parent) if (!p.visible || !p.layers.test(cam.layers)) return false; return true; };
    g.scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints) || !o.geometry || !visivel(o)) return;
      const geo = o.geometry;
      if (o.frustumCulled !== false) {
        const esf = o.isInstancedMesh ? (o.boundingSphere ?? (o.computeBoundingSphere(), o.boundingSphere)) : (geo.boundingSphere ?? (geo.computeBoundingSphere(), geo.boundingSphere));
        if (!esf) return;
        const c = esf.center.clone().applyMatrix4(o.matrixWorld), rad = esf.radius * o.matrixWorld.getMaxScaleOnAxis();
        if (planos.some(([a, b, cc, d]) => a * c.x + b * c.y + cc * c.z + d < -rad)) return;
      }
      const tri = (geo.index ? geo.index.count : geo.attributes.position.count) / 3, n = o.isInstancedMesh ? o.count : 1;
      const mat = [].concat(o.material)[0];
      let nome = pecaDoLote.get(o) ?? o.name; for (let p = o.parent; !nome && p; p = p.parent) nome = p.name;
      if (o === g.capim?.malha) nome = 'capim (capim.js)';
      nome = `${nome || geo.name || '(sem nome)'} / ${mat?.name || mat?.type || '?'}`;
      const a = grupos.get(nome) ?? { tri: 0, ch: 0, inst: 0, sombra: false, tipo: mat?.type, transp: mat?.transparent, recorte: mat?.alphaTest > 0 };
      a.tri += tri * n; a.ch++; a.inst += n; a.sombra ||= o.castShadow;
      grupos.set(nome, a);
    });
    return [...grupos.entries()].sort((a, b) => b[1].tri - a[1].tri).slice(0, k)
      .map(([nome, a]) => `${nome.slice(0, 48).padEnd(50)} ${mil(a.tri).padStart(9)} triâng. · ${String(a.ch).padStart(4)} chamadas · ${a.inst} cópias · ${a.tipo}${a.transp ? ' transparente' : ''}${a.recorte ? ' recorte' : ''}${a.sombra ? ' sombra' : ''}`);
  }

  planosDoFrustum(m) {
    const e = m.elements, pl = [];
    const add = (a, b, c, d) => { const l = Math.hypot(a, b, c); pl.push([a / l, b / l, c / l, d / l]); };
    add(e[3] - e[0], e[7] - e[4], e[11] - e[8], e[15] - e[12]); add(e[3] + e[0], e[7] + e[4], e[11] + e[8], e[15] + e[12]);
    add(e[3] + e[1], e[7] + e[5], e[11] + e[9], e[15] + e[13]); add(e[3] - e[1], e[7] - e[5], e[11] - e[9], e[15] - e[13]);
    add(e[3] - e[2], e[7] - e[6], e[11] - e[10], e[15] - e[14]); add(e[3] + e[2], e[7] + e[6], e[11] + e[10], e[15] + e[14]);
    return pl;
  }

  /** As conclusões: frases curtas do que os números dizem, e o teste do lugar, se feito. */
  secaoDiagnostico(L, j) {
    L.push('## Leitura automática');
    const g = this.game, r = g.renderer, dicas = [];
    const pix = this.gl.drawingBufferWidth * this.gl.drawingBufferHeight;
    dicas.push(`gargalo no último minuto: ${this.gargalo(j)}.`);
    if (Number.isFinite(j.gpu) && j.gpu > 0.8 * j.mediana && r.getPixelRatio() > 1) dicas.push(`a placa é o limite e o pixelRatio é ${r.getPixelRatio()} (${(pix / 1e6).toFixed(1)} milhões de pixels por quadro): menos resolução rende quase na proporção — ver "metade da resolução" no teste do lugar.`);
    if (j.sombra > 300) dicas.push(`a sombra da tocha faz ${Math.round(j.sombra)} das ${Math.round(j.chamadas)} chamadas por quadro (ela redesenha 6 vezes o que projeta sombra em 24 m): apagar a tocha de dia, ou menos peças projetando sombra, ou a sombra mais curta.`);
    if (j.chamadas > 1000) dicas.push(`${Math.round(j.chamadas)} chamadas de desenho por quadro é muito para placa integrada: juntar lotes, cortar por distância.`);
    if (j.tri > 2e6) dicas.push(`${mil(j.tri)} triângulos por quadro: LOD/cartaz mais perto, ou peças mais leves.`);
    const nPicos = this.picos.length, comp = this.picos.filter((p) => p.dProg > 0).length, gc = this.picos.filter((p) => p.dHeap < -2).length;
    if (comp) dicas.push(`${comp} pico(s) compilando shader no meio do jogo: algum material/luz mudou depois do carregamento — o ideal é compilar tudo no carregamento.`);
    if (gc) dicas.push(`${gc} pico(s) com coleta de lixo: algo cria muitos objetos por quadro (vetores, arrays, closures).`);
    if (nPicos && !comp && !gc) dicas.push(`os picos não são compilação nem coleta de lixo: ver a coluna "quadro culpado" (fase da CPU, GPU ou fora do laço).`);
    for (const d of dicas) L.push(`- ${d}`);
    L.push('');
    const D = this.diagnostico;
    L.push('## Teste do lugar ("Diagnosticar e copiar")');
    if (!D) { L.push('não feito — no lugar pesado, olhando para onde pesa: F3, Esc e "Diagnosticar e copiar" (cerca de 1 min; o relatório já sai com ele).'); return; }
    // O TETO DA TELA (07/10/2026): a tela não mostra mais quadros do que a frequência dela
    // (60 numa comum). Se nem "sem NADA" passa de ~60, há teto — e o teste que encosta nele
    // esconde o ganho (um relatório deu "+25%" para algo que poupava 36% da GPU). Nesses, o
    // ganho vem pelo TEMPO DA GPU (sem teto): quanto da placa a mudança poupou.
    const nadaR = D.res.find((x) => x.nome.startsWith('sem NADA'));
    const teto = nadaR && nadaR.com.fps < 100 ? nadaR.com.fps : Infinity;
    const ganhos = D.res.map((x) => {
      const noTeto = Number.isFinite(teto) && (x.com.fps >= 0.93 * teto || x.base.fps >= 0.93 * teto) && Number.isFinite(x.base.gpu) && x.base.gpu > 0;
      return { ...x, noTeto, g: noTeto ? 1 - x.com.gpu / x.base.gpu : x.com.fps / x.base.fps - 1 };
    });
    const pct = (v) => `${v >= 0 ? '+' : ''}${Math.round(v * 100)}%`;
    L.push(`feito às ${D.quando} (sessão ${mmss(D.s)}) em ${D.onde}, desenhando ${D.tela ?? '?'}. Cada linha: a base (média da de antes e da de depois) → com a mudança.`);
    if (Number.isFinite(teto)) L.push(`A TELA LIMITA a ~${Math.round(teto)} quadros/s (nem sem desenhar nada passou disso): onde o teste encostou no teto (marcado "pela GPU") o ganho é o tempo de placa poupado — o de quadros/s está escondido pelo teto.`);
    for (const x of ganhos) {
      L.push(`${x.nome.padEnd(44)} ${fmt(x.base.fps, 1).padStart(5)} → ${fmt(x.com.fps, 1).padStart(5)} FPS · GPU ${fmt(x.base.gpu)} → ${fmt(x.com.gpu)} ms · ${Math.round(x.base.chamadas)} → ${Math.round(x.com.chamadas)} chamadas  =  ${pct(x.g)}${x.noTeto ? ' pela GPU' : ''}`);
    }
    // a leitura: o que fazer, do que mais rende; se são os pixels; e o piso (sem nada na tela)
    const acoes = ganhos.filter((x) => x.acao && x.g >= 0.05).sort((a, b) => b.g - a.g);
    L.push('');
    L.push('O que fazer aqui (do que mais rende; cada uma sozinha, os ganhos não somam exato; mudanças de ±5% são ruído da medida):');
    if (acoes.length) for (const x of acoes) L.push(`  ${pct(x.g).padStart(5)}${x.noTeto ? ' da GPU' : ''}  ${x.acao} — perde: ${x.perde}`);
    else L.push('  nada sozinho rende 5% ou mais aqui: o lugar já está leve, ou o custo está espalhado.');
    const util = ganhos.filter((x) => !x.acao && !x.nome.startsWith('sem NADA') && x.g > 0.08).sort((a, b) => b.g - a.g);
    if (util.length) L.push(`- onde está o peso (para mexer nas peças): ${util.map((x) => `${x.nome.replace(/^sem (a |o |as |os )?/, '')} (${pct(x.g)}${x.noTeto ? ' da GPU' : ''})`).join(', ')}.`);
    const meia = ganhos.find((x) => x.nome.startsWith('metade'));
    if (meia) L.push(meia.g > 0.3 ? `- os PIXELS pesam (${pct(meia.g)}${meia.noTeto ? ' da GPU' : ''} com ¼ deles): resolução, camadas de folha/transparência e luz por pixel são o caminho.` : `- os pixels NÃO são o problema aqui (${pct(meia.g)}${meia.noTeto ? ' da GPU' : ''} com ¼ deles): baixar a resolução quase não ajuda; o peso é de geometria/chamadas ou CPU.`);
    if (nadaR) L.push(Number.isFinite(teto)
      ? `- sem desenhar nada: ${fmt(nadaR.com.fps, 0)} quadros/s — o teto da tela, não o piso do jogo. Com a placa a ${fmt(ganhos[0]?.base.gpu)} ms por quadro, o desenho é o que segura abaixo do teto.`
      : `- sem desenhar nada o quadro leva ${fmt(1000 / nadaR.com.fps)} ms (${fmt(nadaR.com.fps, 0)} FPS): é o piso (lógica do jogo, interface, navegador). Tudo acima disso é o desenho do lugar.`);
  }

  // ------------------------------------------------------------ o painel
  montarPainel() {
    const el = document.createElement('div');
    el.id = 'monitor';
    el.className = 'hidden';
    el.innerHTML = `<div class="mon-linhas"></div><canvas width="284" height="56"></canvas>
      <div class="mon-botoes"><button data-a="diag">Diagnosticar e copiar</button><button data-a="copiar">Só copiar</button><button data-a="zerar">Zerar</button></div>
      <div class="mon-dica">F3 fecha · Esc libera o mouse para clicar</div>`;
    document.body.appendChild(el);
    this.el = el; this.linhas = el.querySelector('.mon-linhas'); this.cv = el.querySelector('canvas');
    el.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'copiar') this.copiar();
      if (a === 'diag') this.diagnosticar(true);
      if (a === 'zerar') { this.zerar(); this.game.ui?.toast('Monitor zerado.'); }
    });
  }

  alternar(aberto = !this.aberto) {
    this.aberto = aberto;
    this.el.classList.toggle('hidden', !aberto);
    if (aberto) this.desenharPainel();
  }

  desenharPainel() {
    if (!this.aberto) return;
    const agora = performance.now(), j = this.janela(agora - 2000), a = this.anterior;
    const q = this.game.graficos.q;
    this.linhas.innerHTML = [
      `<b>${fmt(j.fps, 0)} FPS</b> · ${fmt(j.mediana)} ms (p95 ${fmt(j.p95, 0)}) · ${q.nome} ${Math.round((this.game.graficos.escala ?? 1) * 100)}%`,
      `CPU ${fmt(j.cpu)} · GPU ${this.ext ? fmt(j.gpu) : 'n/d'} ms`,
      `gargalo: ${this.gargalo(j).replace(/ \(.*/, '')}`,
      `${Math.round(j.chamadas)} chamadas${j.sombra > 0 ? ` (sombra ${Math.round(j.sombra)})` : ''} · ${mil(j.tri || 0)} triâng. · ${this.game.renderer.info.programs?.length} prog.`,
      a ? `${a.regiao} [${a.lin}, ${a.col}] · picos ${this.picos.length}` : '',
      this.estadoDiag ? `<i>${this.estadoDiag}…</i>` : '',
      // lento e sem teste do lugar recente: o painel mesmo sugere
      !this.estadoDiag && j.fps < 30 && (!this.diagnostico || (agora - this.sessaoIni) / 1000 - this.diagnostico.s > 300) ? '<i>lento aqui: Esc → "Diagnosticar e copiar"</i>' : '',
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
    try {
      await navigator.clipboard.writeText(texto);
      this.game.ui?.toast('Relatório copiado.');
    } catch {
      // sem a área de transferência (página sem https, permissão): o texto numa caixa, já selecionado
      const ta = document.createElement('textarea');
      ta.id = 'monitor-texto'; ta.value = texto;
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch { }
      if (ok) { ta.remove(); this.game.ui?.toast('Relatório copiado.'); }
      else { this.game.ui?.toast('Copie o texto da caixa (Ctrl+C) — clique fora para fechar.'); ta.addEventListener('blur', () => ta.remove()); ta.focus(); }
    }
  }
}
