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
    luzes: 8, luzesFora: 4, filtroDeCor: true, particulas: 1, capim: 55,   // luzes de cenário: na masmorra / ao ar livre (world.distribuirLuzes)
    nuvens: 5, reflexoS: 4, clarao: true,   // o céu (ceu.js): oitavas das nuvens, segundos entre um reflexo e outro, o reflexo de lente do sol e da lua
    impostor: 120, limiarPx: 1.5,   // o LOD (lod.js): a partir de quantos metros a árvore vira cartaz; peça com menos pixels de raio que isto some
  },
  medio: {
    nome: 'Médio', pixelRatio: 1.25, antialias: true,
    // metade da resolução, redesenhada a cada 2 quadros (o alcance da sombra o
    // three.js tira da distância da luz a cada quadro — não é opção aqui)
    sombra: { mapa: 256, aCada: 2 }, tipoSombra: THREE.PCFShadowMap,
    luzes: 5, luzesFora: 3, filtroDeCor: true, particulas: 0.7, capim: 28,
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
  }

  get q() { return QUALIDADES[this.nome]; }

  /** O antisserrilhado é decidido ANTES de existir o renderizador. */
  static antialias(nome) { return (QUALIDADES[nome] ?? QUALIDADES.alto).antialias; }

  /** Aplica a qualidade no que já existe (renderizador, tocha, luzes, partículas). */
  aplicar() {
    const g = this.game, q = this.q, r = g.renderer;
    r.setPixelRatio(Math.min(devicePixelRatio, q.pixelRatio));
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
    this.nome = nome;
    try { localStorage.setItem(CHAVE, nome); } catch { }
    this.aplicar();
  }

  /**
   * Todo quadro: a sombra da tocha é redesenhada só com a tocha acesa e, no
   * Médio, a cada 2 quadros (a luz anda com o jogador; a diferença não se nota).
   */
  update() {
    const luz = this.game.player?.torchLight, s = this.q.sombra;
    if (!luz || !s) return;
    this.quadro++;
    luz.shadow.autoUpdate = false;
    if (luz.intensity > 0 && this.quadro % s.aCada === 0) luz.shadow.needsUpdate = true;
  }
}
