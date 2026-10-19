/**
 * **AS QUALIDADES GRÁFICAS** (03/10/2026) — Alto, Médio e Baixo.
 *
 * **Alto é o jogo como ele era** antes do caminho de otimização (backup na tag
 * git `graficos-antes-da-otimizacao`): mesma sombra da tocha, mesma resolução,
 * mesmo filtro de cor. Médio e Baixo trocam um pouco de beleza por quadros.
 *
 * O que NÃO está aqui vale para as três e não muda o visual (por isso não é
 * opção): a decoração em lotes (`World.agruparDecoracao`), os shaders
 * compilados no carregamento (`Game.load`) e o orçamento FIXO de luzes
 * (`World.distribuirLuzes` — ligar e desligar luzes recompilava todos os
 * shaders no meio do jogo, que era o "engasgo").
 *
 * Mudar de qualidade aplica quase tudo na hora; o antisserrilhado só vale ao
 * reabrir o jogo (o WebGL o escolhe ao criar o contexto). A escolha fica no
 * `localStorage` deste navegador; sem escolha, o celular começa no Médio.
 */
import * as THREE from 'three';
import { tela } from './tela.js';

export const QUALIDADES = {
  alto: {
    nome: 'Alto', pixelRatio: 2, antialias: true,
    // a luz da tocha na mão: um cubo de sombras (seis vistas do cenário)
    sombra: { mapa: 512, aCada: 1 }, tipoSombra: THREE.PCFSoftShadowMap,
    // a sombra do SOL (e da lua) ao ar livre: o lado do mapa (px) e o raio em volta do jogador (m)
    sol: { mapa: 2048, raio: 42 },
    luzes: 8, luzesFora: 4, filtroDeCor: true, particulas: 1, capim: 40,   // luzes de cenário: na masmorra / ao ar livre (world.distribuirLuzes)
    nuvens: 5, reflexoS: 4, clarao: true,   // o céu (ceu.js): oitavas das nuvens, segundos entre um reflexo e outro, o reflexo de lente do sol e da lua
    // o LOD (lod.js): a partir de quantos metros a árvore e o arbusto viram cartaz; peça com menos pixels de raio que isto some.
    // 40 m desde 19/10/2026 (era 120/90/65): nítido o acampamento inteiro — da fogueira à saída são ~33 m —, além disso a foto
    impostor: 40, limiarPx: 1.5,
  },
  medio: {
    nome: 'Médio', pixelRatio: 1.25, antialias: true,
    // metade da resolução (o alcance da sombra o three.js tira da distância da luz a cada
    // quadro — não é opção aqui). Redesenhada TODO quadro desde 07/10/2026: a cada 2, a
    // sombra do personagem (no chão e no corpo) ficava meio passo atrasada num quadro e certa
    // no outro — o personagem "flicava" no Médio. Depois de os personagens longe saírem da
    // sombra (lod.js) ela ficou ~7× mais barata: todo quadro custou 0,8 quadro/s.
    sombra: { mapa: 256, aCada: 1 }, tipoSombra: THREE.PCFShadowMap,
    // a sombra do SOL é só do Alto (11/10/2026): ela redesenha tudo o que projeta sombra em volta do
    // jogador a cada quadro, e nas máquinas do Médio o limite é a CPU montando chamadas de desenho
    // (GT 730: 14 quadros/s com ela, a 40% da resolução). Aqui fica a da tocha, como sempre foi.
    sol: null,
    luzes: 5, luzesFora: 3, filtroDeCor: true, particulas: 0.7, capim: 34,
    nuvens: 4, reflexoS: 8, clarao: true,
    impostor: 40, limiarPx: 2.5,
  },
  baixo: {
    nome: 'Baixo', pixelRatio: 1, antialias: false,
    sombra: null, tipoSombra: THREE.BasicShadowMap, sol: null,
    luzes: 3, luzesFora: 2, filtroDeCor: false, particulas: 0.45, capim: 0,
    nuvens: 2, reflexoS: 20, clarao: false,
    impostor: 40, limiarPx: 3.5,
  },
  // O CELULAR FRACO (15/10/2026; relatório de um PowerVR GE8320 com 2 GB: 12–16 quadros/s no
  // Baixo, a CPU no limite). Ali o que pesa é a CPU, e o que o Baixo tira para poupá-la (o capim,
  // o filtro de cor, o reflexo do sol) quase não custa CPU: o capim é UMA chamada de desenho, o
  // filtro é da página. Então fica o Baixo no que custa CPU (sem sombras, poucas luzes, o
  // detalhe pequeno some de longe) e a BELEZA volta: o capim (mais ralo que o do Médio, as
  // touceiras maiores — o tapete continua fechado), o tom da masmorra, as nuvens, o clarão.
  // Escolhido sozinho no celular fraco (`ehCelularFraco`), sem escolha guardada.
  celular: {
    nome: 'Celular', pixelRatio: 1, antialias: false,
    sombra: null, tipoSombra: THREE.BasicShadowMap, sol: null,
    luzes: 3, luzesFora: 2, filtroDeCor: true, particulas: 0.6, capim: 20,
    nuvens: 3, reflexoS: 20, clarao: true,
    impostor: 40, limiarPx: 3.5,
  },
  // SEM PLACA DE VÍDEO (18/10/2026; relatório de um Windows com o "Microsoft Basic Render Driver":
  // o navegador desenha com a CPU — 4 núcleos, 4 GB —, 1–2 quadros/s no Alto e 6 no Celular a 40%
  // da resolução, com 62 ms de "render" e 85 ms fora do laço). Ali a CPU faz o trabalho da placa:
  // cada TRIÂNGULO e cada PIXEL custam, então sai o capim (189 mil triângulos dos 642 mil), as
  // árvores viram cartaz logo, o detalhe pequeno some cedo e a resolução começa abaixo de 1.
  // E O LONGE NÃO EXISTE (o `alcance`, em metros): perto vai tudo — até o capim, ralo e só em
  // volta (`capimRaio` células, ~18 m) —; até o alcance a névoa fecha, e além dele nada é
  // desenhado: o `far` da câmera, a decoração (lod.js, como o "outro lado"), as peças soltas e
  // os personagens; o céu encolhe junto (ceu.js). Qualidade sem `alcance` = o longe de sempre.
  // Escolhido sozinho na placa de software (`placaDeSoftware`), com um aviso de como ligar a placa.
  minimo: {
    nome: 'Mínimo', pixelRatio: 0.6, antialias: false,
    sombra: null, tipoSombra: THREE.BasicShadowMap, sol: null,
    luzes: 2, luzesFora: 1, filtroDeCor: false, particulas: 0.3, capim: 8, capimRaio: 3,
    nuvens: 2, reflexoS: 30, clarao: false,
    impostor: 15, limiarPx: 6, alcance: 70,   // (15 m desde 19/10/2026: era 35)
  },
};

/**
 * A SOMBRA DO SOL SOME AOS POUCOS NA BORDA (19/10/2026). A caixa da sombra do sol anda com o
 * jogador (`sol.raio` m para cada lado): o que saía dela perdia a sombra de uma vez — andando,
 * a borda das sombras "cortava" no chão. Aqui, no `getShadow` do three.js (o da luz direcional;
 * a da tocha é o `getPointShadow`, que não muda), a sombra clareia do último quarto da caixa até
 * a borda. Vale para todo material compilado depois (este módulo carrega antes de tudo).
 */
{
  const ch = THREE.ShaderChunk.shadowmap_pars_fragment, ini = ch.indexOf('float getShadow( sampler2D');
  const fim = 'return mix( 1.0, shadow, shadowIntensity );', k = ch.indexOf(fim, ini);
  if (ini >= 0 && k >= 0) {
    THREE.ShaderChunk.shadowmap_pars_fragment = ch.slice(0, k) + `vec2 bordaDaSombra = abs( shadowCoord.xy * 2.0 - 1.0 );
		float someNaBorda = smoothstep( 0.72, 0.97, max( bordaDaSombra.x, bordaDaSombra.y ) );
		return mix( 1.0, shadow, shadowIntensity * ( 1.0 - someNaBorda ) );` + ch.slice(k + fim.length);
  } else console.warn('graficos.js: o getShadow do three.js mudou — a sombra do sol não some aos poucos na borda');
}

const CHAVE = 'masmorra:graficos';
const CHAVE_AUTO = 'masmorra:resolucao-auto';
const CHAVE_FIXA = 'masmorra:resolucao';      // a resolução escolhida à mão (fração de 0 a 1)
const CHAVE_SOMBRAS = 'masmorra:sombras';
const CHAVE_DISTANCIA = 'masmorra:distancia';   // a distância de carregamento escolhida à mão (m)
const CHAVE_DINAMICO = 'masmorra:dinamico';     // o carregamento dinâmico ligado ou não
/**
 * AS OPÇÕES AVANÇADAS (19/10/2026; menu de pausa → Qualidade Gráfica → Opções avançadas).
 * A DISTÂNCIA DE CARREGAMENTO: até onde árvores, arbustos e plantas são o modelo de verdade
 * (além, o cartaz — lod.js); por cima do `impostor` da qualidade, de `DISTANCIAS[0]` a `DIST_MAX`
 * (o limite seguro: além de 80 m o cartaz já mal se distingue do modelo, e os triângulos crescem
 * com o quadrado da distância). O CARREGAMENTO DINÂMICO: as passagens suaves (o pontilhado
 * modelo ↔ cartaz, o capim encolhendo, a sombra da árvore que já é cartaz); desligado, tudo troca
 * de uma vez — um pouco mais leve na placa, para a máquina que não aguenta.
 */
export const DISTANCIAS = [20, 30, 40, 50, 60, 80];
const DIST_MAX = 80;
/** As resoluções que o menu de pausa oferece (fração da resolução da qualidade). */
export const RESOLUCOES = [1, 0.85, 0.7, 0.55, 0.4];

/**
 * A RESOLUÇÃO AUTOMÁTICA (06/10/2026): quando os quadros não dão conta, o jogo desenha com
 * menos pixels (a imagem é esticada na tela, um pouco menos nítida) e volta quando sobra.
 * No acampamento, no Alto, os PIXELS eram o limite (o teste do lugar do monitor: +106% de
 * quadros com ¼ deles). Desce 10% depois de 2 s seguidos abaixo de `FPS_MIN`; sobe 10%
 * depois de 5 s folgados E se a conta (quadros × (escala/nova)²) diz que continua acima de
 * `FPS_MIN + 8` — sem isso ela subia e descia sem parar. Só desce se a PLACA é o limite
 * (o tempo da GPU do monitor > 60% do quadro): lento por CPU, menos pixels não ajudam. 3 s entre uma mudança e outra
 * (mudar a resolução refaz a imagem da tela: custa um quadro). O piso é `escalaMin` da
 * qualidade. Liga/desliga no menu de pausa; a escolha fica no `localStorage`.
 */
const FPS_MIN = 40;
const ESCALA_MIN = { alto: 0.7, medio: 0.65, baixo: 0.6, celular: 0.75, minimo: 0.6 };
const CHAVE_SEM_PLACA = 'masmorra:sem-placa';   // já pôs o Mínimo uma vez neste navegador

/**
 * A qualidade guardada (ou a padrão: Celular no celular fraco, Médio no celular, Alto no computador).
 * Na PLACA DE SOFTWARE vai o Mínimo — por cima até da escolha guardada, UMA vez (quem tinha o Alto
 * de antes, como no relatório de 18/10, nem sabia por que o jogo não andava); depois vale a do menu.
 */
export function qualidadeSalva(toque = false) {
  let q = null;
  try { q = localStorage.getItem(CHAVE); } catch { }
  if (placaDeSoftware()) {
    let visto = false;
    try { visto = localStorage.getItem(CHAVE_SEM_PLACA) === 'sim'; localStorage.setItem(CHAVE_SEM_PLACA, 'sim'); } catch { }
    if (!visto || !QUALIDADES[q]) return 'minimo';
  }
  if (QUALIDADES[q]) return q;
  return !toque ? 'alto' : ehCelularFraco() ? 'celular' : 'medio';
}

/** O nome da placa, lido de um contexto WebGL de passagem (o do jogo ainda não existe). Uma vez só. */
let placaLida = null;
export function nomeDaPlaca() {
  if (placaLida != null) return placaLida;
  placaLida = '';
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    placaLida = (ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl?.getParameter(gl.RENDERER) || '';
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { }
  return placaLida;
}

/**
 * SEM PLACA DE VÍDEO: o navegador desenha com a CPU — a aceleração de hardware desligada, o
 * driver de vídeo faltando (o "Basic Render Driver" do Windows é o que sobra sem ele) ou a placa
 * na lista negra do navegador. Nenhuma qualidade deixa isso bom: o remédio é ligar a placa.
 */
export function placaDeSoftware(placa = nomeDaPlaca()) {
  return /SwiftShader|Basic Render|llvmpipe|softpipe|Software Rasterizer|Microsoft WARP/i.test(placa);
}

/**
 * CELULAR FRACO: pouca memória (`deviceMemory` ≤ 3 GB — o Safari não diz, e o iPhone fica no
 * Médio) ou uma placa de entrada (PowerVR, Mali antigas, Adreno 3xx–5xx), lida de um contexto
 * WebGL de passagem (o do jogo ainda não existe: o antisserrilhado sai da qualidade).
 */
export function ehCelularFraco() {
  if ((navigator.deviceMemory ?? 8) <= 3) return true;
  return /PowerVR|Mali-(T|4|G31|G51|G52|G71|G72)|Adreno \(TM\) [345]\d\d/i.test(nomeDaPlaca());
}

export class Graficos {
  constructor(game, nome, toque = false) {
    this.game = game;
    this.toque = toque;
    this.nome = QUALIDADES[nome] ? nome : 'alto';
    this.quadro = 0;
    this.escala = 1;   // fração da resolução da qualidade (a resolução automática mexe nela)
    try { this.auto = localStorage.getItem(CHAVE_AUTO) !== 'nao'; } catch { this.auto = true; }
    // A RESOLUÇÃO À MÃO (11/10/2026): o jogador escolhe uma fração fixa no menu de pausa, e a
    // automática fica desligada enquanto ela valer (`fixa` = null: quem manda é a automática, ou 100%)
    this.fixa = null;
    try { const f = Number(localStorage.getItem(CHAVE_FIXA)); if (RESOLUCOES.includes(f)) { this.fixa = f; this.auto = false; } } catch { }
    // AS SOMBRAS (a do sol e a da tocha) ligadas ou não, por cima da qualidade (o Baixo não tem)
    // NO CELULAR ELAS COMEÇAM DESLIGADAS (13/10/2026; quem quiser liga no menu de pausa, e a escolha
    // fica). Relatório de um Mali-G76 no Alto: 32 quadros/s com a CPU no "render" (17,5 ms), 179 das
    // 543 chamadas eram da sombra da tocha, e baixar a resolução não ajudou — o limite era a CPU.
    // Com a CPU freada 4× no mesmo lugar: 29,6 → 41 quadros/s sem as sombras (de dia, com a do sol,
    // 27 → 41); Alto, Médio e Baixo quase não mudam a CPU — o que muda é a sombra.
    try { const s = localStorage.getItem(CHAVE_SOMBRAS); this.sombras = s ? s !== 'nao' : !toque; } catch { this.sombras = !toque; }
    this.distancia = null;   // null = a da qualidade
    try { const d = Number(localStorage.getItem(CHAVE_DISTANCIA)); if (DISTANCIAS.includes(d)) this.distancia = d; } catch { }
    try { this.dinamico = localStorage.getItem(CHAVE_DINAMICO) !== 'nao'; } catch { this.dinamico = true; }
    this.res = { ini: 0, quadros: 0, baixos: 0, altos: 0, esperaAte: 0 };
  }

  /** A resolução da qualidade, antes da escala automática. */
  get resolucaoBase() { return Math.min(devicePixelRatio, this.q.pixelRatio); }

  /**
   * A resolução do menu de pausa: `'auto'` (a automática decide) ou uma fração de `RESOLUCOES`
   * (fica nela, e a automática desliga). Guardada no `localStorage`.
   */
  escolherResolucao(v) {
    const auto = v === 'auto';
    this.auto = auto;
    this.fixa = auto ? null : v;
    try { localStorage.setItem(CHAVE_AUTO, auto ? 'sim' : 'nao'); auto ? localStorage.removeItem(CHAVE_FIXA) : localStorage.setItem(CHAVE_FIXA, String(v)); } catch { }
    const nova = auto ? 1 : v;
    if (nova !== this.escala) this.mudarEscala(nova, auto ? 'resolução automática ligada' : 'escolhida no menu');
    this.res.teste = null;
  }

  /** Há sombra nesta qualidade (o Baixo não tem) e o jogador não a desligou? */
  get comSombras() { return this.sombras && !!this.q.sombra; }

  /** Até onde a vegetação é o modelo (m): a escolhida à mão ou a da qualidade (lod.js). */
  get distanciaDeCarga() { return Math.min(DIST_MAX, this.distancia ?? this.q.impostor ?? 110); }

  /** A distância de carregamento à mão (`null` = a da qualidade). O LOD a lê a cada quadro. */
  escolherDistancia(v) {
    this.distancia = DISTANCIAS.includes(v) ? v : null;
    try { if (this.distancia) localStorage.setItem(CHAVE_DISTANCIA, String(this.distancia)); else localStorage.removeItem(CHAVE_DISTANCIA); } catch { }
    this.game.monitor?.evento(`distância de carregamento ${this.distanciaDeCarga} m${this.distancia ? '' : ' (a da qualidade)'}`);
  }

  /** O carregamento dinâmico ligado ou não (lod.js e capim.js o leem a cada quadro). */
  alternarDinamico(ligar = !this.dinamico) {
    if (ligar === this.dinamico) return;
    this.dinamico = ligar;
    try { localStorage.setItem(CHAVE_DINAMICO, ligar ? 'sim' : 'nao'); } catch { }
    this.game.monitor?.evento(`carregamento dinâmico ${ligar ? 'ligado' : 'desligado'}`);
  }

  /** Liga ou desliga as sombras (menu de pausa). Muda os shaders: recompila e desenha uma vez, como a troca de qualidade. */
  alternarSombras(ligar = !this.sombras) {
    if (ligar === this.sombras) return;
    this.sombras = ligar;
    try { localStorage.setItem(CHAVE_SOMBRAS, ligar ? 'sim' : 'nao'); } catch { }
    const escala = this.escala;
    this.aplicar();
    if (escala !== this.escala) { this.escala = escala; this.game.renderer.setPixelRatio(this.resolucaoBase * escala); }
    this.game.preaquecer?.();
    this.game.monitor?.evento(`sombras ${ligar ? 'ligadas' : 'desligadas'}`);
  }

  mudarEscala(nova, motivo) {
    const antes = this.escala;
    this.escala = nova;
    this.game.renderer.setPixelRatio(this.resolucaoBase * nova);
    this.res.esperaAte = performance.now() + 3000;
    this.res.baixos = this.res.altos = 0;
    this.game.monitor?.evento(`resolução ${Math.round(antes * 100)}% → ${Math.round(nova * 100)}% (${motivo})`);
  }

  /** Todo quadro: conta os quadros e, de segundo em segundo, decide se mexe na escala. */
  ajustarResolucao() {
    const R = this.res, t = performance.now();
    R.quadros++;
    if (!R.ini) { R.ini = t; R.quadros = 0; return; }
    if (t - R.ini < 1000) return;
    const fps = (1000 * R.quadros) / (t - R.ini);
    R.ini = t; R.quadros = 0;
    // `pausaAuto`: o teste do lugar do monitor está medindo (mexer na escala no meio estragaria)
    if (!this.auto || this.pausaAuto || document.hidden || this.game.state === 'title') { R.teste = null; return; }
    // DEPOIS DE DESCER, CONFERE (07/10/2026): num relatório ela desceu a 70% três vezes sem
    // ganho nenhum (o limite era a sombra da tocha, não os pixels) — e cada mudança custa um
    // tranco. O segundo da mudança não conta; com os 2 seguintes, se não ganhou, volta e
    // não tenta descer de novo por 30 s.
    // PELO TEMPO DA PLACA TAMBÉM (08/10/2026): no Alto, logo depois de trocar a qualidade, ela
    // voltou a 100% com "não ajudou: 28 → 26" — a câmera tinha girado e os quadros/s não
    // comparavam nada — e passou o minuto seguinte a 23 quadros/s, num lugar onde o teste do
    // lugar dava +116% com ¼ dos pixels. Ajudou = ganhou 8% de quadros OU a GPU (o que os
    // pixels mexem) caiu 7%. Com a sombra da tocha como limite (o caso de 07/10) nenhum dos dois muda.
    if (R.teste) {
      if (t < R.teste.de) return;
      R.teste.fps.push(fps);
      if (R.teste.fps.length < 2) return;
      const depois = (R.teste.fps[0] + R.teste.fps[1]) / 2, { antes, gpuAntes, escala } = R.teste;
      const jd = this.game.monitor?.ext ? this.game.monitor.janela(R.teste.de, t) : null;
      const gpuDepois = jd?.gpuN > 10 ? jd.gpu : NaN;
      R.teste = null;
      const placaAliviou = gpuDepois < gpuAntes * 0.93;   // NaN (sem o cronômetro da GPU) = falso
      if (depois < antes * 1.08 && !placaAliviou) {
        const gpu = Number.isFinite(gpuDepois) && Number.isFinite(gpuAntes) ? ` · GPU ${gpuAntes.toFixed(1)} → ${gpuDepois.toFixed(1)} ms` : '';
        this.mudarEscala(escala, `não ajudou: ${Math.round(antes)} → ${Math.round(depois)} quadros/s${gpu}`);
        R.bloqueioAte = t + 30000;
      }
      return;
    }
    if (t < R.esperaAte) return;
    // menos pixels só ajudam quando a PLACA é o limite: com o tempo da GPU do monitor
    // (monitor.js), quadro lento por CPU (lógica, chamadas de desenho) não baixa a resolução
    // SEM O CRONÔMETRO DA GPU (o celular: os Mali não o têm) a placa é o limite só se a CPU do
    // jogo NÃO é (13/10/2026): num Mali-G76 com 21 ms de CPU num quadro de 27, ela desceu a 90% e
    // a 80% às cegas, não ganhou nada, voltou — três mudanças em 8 s, cada uma com os seus trancos
    const j = this.game.monitor ? this.game.monitor.janela(t - 1000) : null;
    const placa = !j || (Number.isFinite(j.gpu) ? j.gpu > 0.6 * j.mediana : !(j.cpu > 0.7 * j.mediana));
    R.baixos = fps < FPS_MIN && placa ? R.baixos + 1 : 0;
    R.altos = fps > FPS_MIN + 8 ? R.altos + 1 : 0;
    const min = ESCALA_MIN[this.nome] ?? 0.7;
    if (R.baixos >= 2 && this.escala > min + 0.001 && t >= (R.bloqueioAte ?? 0)) {
      const escala = this.escala;
      this.mudarEscala(Math.max(min, Math.round((escala - 0.1) * 100) / 100), `${Math.round(fps)} quadros/s`);
      R.teste = { antes: fps, gpuAntes: j?.gpuN > 10 ? j.gpu : NaN, escala, de: t + 1500, fps: [] };
    } else if (R.altos >= 5 && this.escala < 0.999) {
      const prox = Math.min(1, Math.round((this.escala + 0.1) * 100) / 100), cresce = (prox / this.escala) ** 2;
      // a previsão: só a parte da PLACA cresce com os pixels (sem o tempo da GPU, o quadro todo)
      const previsto = j && Number.isFinite(j.gpu) ? 1000 / (j.mediana + j.gpu * (cresce - 1)) : fps / cresce;
      if (previsto > FPS_MIN + 8) this.mudarEscala(prox, `${Math.round(fps)} quadros/s, sobrando`);
    }
  }

  get q() { return QUALIDADES[this.nome]; }

  /** O antisserrilhado é decidido ANTES de existir o renderizador. */
  static antialias(nome) { return (QUALIDADES[nome] ?? QUALIDADES.alto).antialias; }

  /** Aplica a qualidade no que já existe (renderizador, tocha, luzes, partículas). */
  aplicar() {
    const g = this.game, q = this.q, r = g.renderer;
    // uma qualidade nova começa de novo em 100%; a automática reajusta se precisar
    // (a escolhida à mão continua valendo)
    this.escala = this.fixa ?? 1; this.res.esperaAte = performance.now() + 3000; this.res.teste = null; this.res.bloqueioAte = 0;
    r.setPixelRatio(this.resolucaoBase * this.escala);
    r.setSize(tela.w, tela.h);
    const sombras = this.comSombras;
    r.shadowMap.enabled = sombras;
    r.shadowMap.type = q.tipoSombra;
    r.shadowMap.needsUpdate = true;
    const luz = g.player?.torchLight;
    if (luz) {
      luz.castShadow = sombras;
      if (sombras) {
        if (luz.shadow.mapSize.x !== q.sombra.mapa) {
          luz.shadow.mapSize.set(q.sombra.mapa, q.sombra.mapa);
          luz.shadow.map?.dispose(); luz.shadow.map = null;   // refeito no tamanho novo
        }
      }
    }
    // a sombra do SOL: a luz direcional do ar livre (world.js), numa caixa em volta do jogador
    const sol = g.world?.ambience?.lua;
    if (sol) {
      sol.castShadow = sombras && !!q.sol;
      if (sol.castShadow) {
        const c = sol.shadow.camera, R = q.sol.raio;
        c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = 260;
        c.updateProjectionMatrix();
        sol.shadow.bias = -0.0004; sol.shadow.normalBias = 1.5 * (2 * R / q.sol.mapa);   // ~1,5 texel
        if (sol.shadow.mapSize.x !== q.sol.mapa) {
          sol.shadow.mapSize.set(q.sol.mapa, q.sol.mapa);
          sol.shadow.map?.dispose(); sol.shadow.map = null;
        }
      }
    }
    if (g.effects) g.effects.fator = q.particulas;
    document.body.classList.toggle('sem-filtro', !q.filtroDeCor);
    if (g.world) { g.world.luzesNoOrcamento = q.luzes; g.world.luzesForaNoOrcamento = q.luzesFora; }
    // castShadow e o número de luzes mudam os shaders: recompila uma vez agora,
    // em vez de engasgar no primeiro quadro — com os DOIS orçamentos de luzes (ar
    // livre e masmorra), para a troca entre eles nunca compilar nada no meio do jogo
    if (g.scene && g.camera) {
      if (g.world) for (const fora of [true, false]) { g.world.distribuirLuzes(fora); r.compile(g.scene, g.camera); }
      else r.compile(g.scene, g.camera);
    }
    g.world?.distribuirLuzes();
  }

  /** Troca de qualidade (menu de pausa) e guarda a escolha. */
  trocar(nome) {
    if (!QUALIDADES[nome] || nome === this.nome) return;
    const antes = this.q.nome;
    this.nome = nome;
    try { localStorage.setItem(CHAVE, nome); } catch { }
    this.aplicar();
    // os shaders da qualidade nova DESENHADOS uma vez (o Chrome só os termina no primeiro
    // desenho; sem isso, girar a câmera depois de trocar travava): main.js
    this.game.preaquecer?.();
    // no relatório do monitor (monitor.js): sem isto, os números de antes e de depois se misturavam
    this.game.monitor?.evento(`qualidade ${antes} → ${this.q.nome}${this.q.antialias !== this.game.renderer.getContextAttributes().antialias ? ' (o antisserrilhado só muda ao reabrir o jogo)' : ''}`);
  }

  /**
   * Todo quadro: a sombra da tocha é redesenhada só com a tocha acesa e, no
   * no ritmo `aCada` da qualidade (hoje todo quadro nas duas: a cada 2 o personagem
   * "flicava" no Médio — a sombra dele ficava meio passo atrasada num quadro sim, outro não).
   */
  update() {
    this.ajustarResolucao();
    // O ALCANCE (o Mínimo): o `far` da câmera fecha nele, contado de onde uma câmera comum veria
    // (a isométrica fica longe do jogador: `vistaDe`, player.js). Só mexe quando muda 1 m.
    const cam = this.game.camera, A = this.q.alcance;
    if (cam) {
      const v = cam.userData.vistaDe;
      const far = A ? Math.round(A + 10 + (v ? cam.position.distanceTo(v) : 0)) : 300;
      if (Math.abs(cam.far - far) >= 1) { cam.far = far; cam.updateProjectionMatrix(); }
    }
    // a sombra do sol só é redesenhada ao AR LIVRE (dentro da masmorra a luz dele é 0)
    const amb = this.game.world?.ambience, sol = amb?.lua;
    // E SÓ DE DIA (11/10/2026): de noite a luz da lua é fraca, a sombra dela quase não se vê, e é
    // justo quando a tocha está acesa (outra sombra, seis vistas). A força da sombra acompanha o
    // dia (`shadow.intensity`, um número: não recompila); em zero, ela nem é redesenhada.
    if (sol?.castShadow) {
      const forca = Math.max(0, Math.min(1, ((amb.ceu?.dia ?? 1) - 0.12) / 0.25));
      sol.shadow.intensity = forca;
      sol.shadow.autoUpdate = false;
      if (forca > 0 && amb.k > 0.02 && sol.intensity > 0 && !this.solParado) sol.shadow.needsUpdate = true;   // `solParado`: o teste do lugar do monitor
    }
    const luz = this.game.player?.torchLight, s = this.comSombras && this.q.sombra;
    if (!luz || !s) return;
    this.quadro++;
    luz.shadow.autoUpdate = false;
    if (luz.intensity > 0 && this.quadro % s.aCada === 0) luz.shadow.needsUpdate = true;
  }
}
