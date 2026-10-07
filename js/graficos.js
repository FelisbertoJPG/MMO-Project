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

export const QUALIDADES = {
  alto: {
    nome: 'Alto', pixelRatio: 2, antialias: true,
    // a luz da tocha na mão: um cubo de sombras (seis vistas do cenário)
    sombra: { mapa: 512, aCada: 1 }, tipoSombra: THREE.PCFSoftShadowMap,
    luzes: 8, luzesFora: 4, filtroDeCor: true, particulas: 1, capim: 64,   // luzes de cenário: na masmorra / ao ar livre (world.distribuirLuzes)
    nuvens: 5, reflexoS: 4, clarao: true,   // o céu (ceu.js): oitavas das nuvens, segundos entre um reflexo e outro, o reflexo de lente do sol e da lua
    impostor: 120, limiarPx: 1.5,   // o LOD (lod.js): a partir de quantos metros a árvore vira cartaz; peça com menos pixels de raio que isto some
  },
  medio: {
    nome: 'Médio', pixelRatio: 1.25, antialias: true,
    // metade da resolução (o alcance da sombra o three.js tira da distância da luz a cada
    // quadro — não é opção aqui). Redesenhada TODO quadro desde 07/10/2026: a cada 2, a
    // sombra do personagem (no chão e no corpo) ficava meio passo atrasada num quadro e certa
    // no outro — o personagem "flicava" no Médio. Depois de os personagens longe saírem da
    // sombra (lod.js) ela ficou ~7× mais barata: todo quadro custou 0,8 quadro/s.
    sombra: { mapa: 256, aCada: 1 }, tipoSombra: THREE.PCFShadowMap,
    luzes: 5, luzesFora: 3, filtroDeCor: true, particulas: 0.7, capim: 34,
    nuvens: 4, reflexoS: 8, clarao: true,
    impostor: 90, limiarPx: 2.5,
  },
  baixo: {
    nome: 'Baixo', pixelRatio: 1, antialias: false,
    sombra: null, tipoSombra: THREE.BasicShadowMap,
    luzes: 3, luzesFora: 2, filtroDeCor: false, particulas: 0.45, capim: 0,
    nuvens: 2, reflexoS: 20, clarao: false,
    impostor: 65, limiarPx: 3.5,
  },
};

const CHAVE = 'masmorra:graficos';
const CHAVE_AUTO = 'masmorra:resolucao-auto';

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
const ESCALA_MIN = { alto: 0.7, medio: 0.65, baixo: 0.6 };

/** A qualidade guardada (ou a padrão: Médio no celular, Alto no computador). */
export function qualidadeSalva(toque = false) {
  try { const q = localStorage.getItem(CHAVE); if (QUALIDADES[q]) return q; } catch { }
  return toque ? 'medio' : 'alto';
}

export class Graficos {
  constructor(game, nome) {
    this.game = game;
    this.nome = QUALIDADES[nome] ? nome : 'alto';
    this.quadro = 0;
    this.escala = 1;   // fração da resolução da qualidade (a resolução automática mexe nela)
    try { this.auto = localStorage.getItem(CHAVE_AUTO) !== 'nao'; } catch { this.auto = true; }
    this.res = { ini: 0, quadros: 0, baixos: 0, altos: 0, esperaAte: 0 };
  }

  /** A resolução da qualidade, antes da escala automática. */
  get resolucaoBase() { return Math.min(devicePixelRatio, this.q.pixelRatio); }

  /** Liga ou desliga a resolução automática (menu de pausa); desligada, volta a 100%. */
  alternarAuto(ligar = !this.auto) {
    this.auto = ligar;
    try { localStorage.setItem(CHAVE_AUTO, ligar ? 'sim' : 'nao'); } catch { }
    if (!ligar && this.escala !== 1) this.mudarEscala(1, 'resolução automática desligada');
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
    if (!this.auto || document.hidden || this.game.state === 'title') { R.teste = null; return; }
    // DEPOIS DE DESCER, CONFERE (07/10/2026): num relatório ela desceu a 70% três vezes sem
    // ganho nenhum (o limite era a sombra da tocha, não os pixels) — e cada mudança custa um
    // tranco. O segundo da mudança não conta; com os 2 seguintes, se não ganhou 8%, volta e
    // não tenta descer de novo por 60 s.
    if (R.teste) {
      if (t < R.teste.de) return;
      R.teste.fps.push(fps);
      if (R.teste.fps.length < 2) return;
      const depois = (R.teste.fps[0] + R.teste.fps[1]) / 2, { antes, escala } = R.teste;
      R.teste = null;
      if (depois < antes * 1.08) {
        this.mudarEscala(escala, `não ajudou: ${Math.round(antes)} → ${Math.round(depois)} quadros/s`);
        R.bloqueioAte = t + 60000;
      }
      return;
    }
    if (t < R.esperaAte) return;
    // menos pixels só ajudam quando a PLACA é o limite: com o tempo da GPU do monitor
    // (monitor.js), quadro lento por CPU (lógica, chamadas de desenho) não baixa a resolução
    const j = this.game.monitor?.ext ? this.game.monitor.janela(t - 1000) : null;
    const placa = !j || !Number.isFinite(j.gpu) || j.gpu > 0.6 * j.mediana;
    R.baixos = fps < FPS_MIN && placa ? R.baixos + 1 : 0;
    R.altos = fps > FPS_MIN + 8 ? R.altos + 1 : 0;
    const min = ESCALA_MIN[this.nome] ?? 0.7;
    if (R.baixos >= 2 && this.escala > min + 0.001 && t >= (R.bloqueioAte ?? 0)) {
      const escala = this.escala;
      this.mudarEscala(Math.max(min, Math.round((escala - 0.1) * 100) / 100), `${Math.round(fps)} quadros/s`);
      R.teste = { antes: fps, escala, de: t + 1500, fps: [] };
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
    this.escala = 1; this.res.esperaAte = performance.now() + 3000; this.res.teste = null; this.res.bloqueioAte = 0;
    r.setPixelRatio(this.resolucaoBase);
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = !!q.sombra;
    r.shadowMap.type = q.tipoSombra;
    r.shadowMap.needsUpdate = true;
    const luz = g.player?.torchLight;
    if (luz) {
      luz.castShadow = !!q.sombra;
      if (q.sombra) {
        if (luz.shadow.mapSize.x !== q.sombra.mapa) {
          luz.shadow.mapSize.set(q.sombra.mapa, q.sombra.mapa);
          luz.shadow.map?.dispose(); luz.shadow.map = null;   // refeito no tamanho novo
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
    const luz = this.game.player?.torchLight, s = this.q.sombra;
    if (!luz || !s) return;
    this.quadro++;
    luz.shadow.autoUpdate = false;
    if (luz.intensity > 0 && this.quadro % s.aCada === 0) luz.shadow.needsUpdate = true;
  }
}
