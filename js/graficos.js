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
import { Fxaa } from './fxaa.js';

export const QUALIDADES = {
  // O ULTRA (20/10/2026; o "gráficos no máximo" do Automático): o Alto com o longe nítido — a árvore
  // vira cartaz a 80 m (o teto seguro, `DIST_MAX`), o detalhe pequeno só some com 1 px, e a sombra
  // do sol vai a 60 m num mapa de 4096 (mais nítida que a do Alto, 2048 em 42 m). Os MESMOS
  // programas do Alto (mesmo tipo de sombra, mesmas luzes): trocar entre os dois não compila nada.
  ultra: {
    nome: 'Ultra', pixelRatio: 2, antialias: true,
    sombra: { mapa: 512, aCada: 1 }, tipoSombra: THREE.PCFSoftShadowMap,
    sol: { mapa: 4096, raio: 60 },
    luzes: 8, luzesFora: 4, filtroDeCor: true, particulas: 1, capim: 40,
    nuvens: 5, reflexoS: 4, clarao: true,
    impostor: 80, limiarPx: 1,
  },
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

/**
 * A SOMBRA EM CASCATA ("Sempre carregadas", 21/10/2026; o dono: "a sombra das árvores e objetos só
 * aparece depois de uma certa distância"). Uma caixa só de sombra do sol tem um fim: além dela, nada.
 * Com "Sempre carregadas", uma SEGUNDA luz direcional (world.js, `luaLonge`: sem luz nenhuma, só a
 * sombra) cobre uma caixa bem maior (`LONGE`), num mapa menos nítido e redesenhado a cada poucos
 * quadros; aqui, no laço das luzes direcionais do three.js, a sombra de perto (a luz 0) PASSA para a
 * de longe (a luz 1) na mesma faixa em que ela clareia na borda (os mesmos 72%–97% do `getShadow`
 * acima) — em vez de sumir. A luz 1 não ilumina (o corpo do laço é pulado para ela). Só há duas
 * luzes direcionais com sombra quando a cascata está ligada: `NUM_DIR_LIGHT_SHADOWS > 1` é o sinal.
 * (Se o three.js mudar o texto, sai um aviso no console e a cascata não junta — nada quebra.)
 */
{
  const ch = THREE.ShaderChunk.lights_fragment_begin;
  const ini = '\t\tdirectionalLight = directionalLights[ i ];', fimS = '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\t}\n\t#pragma unroll_loop_end';
  const sombra = '\t\t#endif\n\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\t}\n\t#pragma unroll_loop_end';
  // (o laço das DIRECIONAIS: o das pontuais e o dos holofotes vêm antes e acabam igual — procurar depois de `ini`)
  const a = ch.indexOf(ini), b = a >= 0 ? ch.indexOf(sombra, a) : -1;
  if (a >= 0 && b > a && ch.indexOf(fimS, a) === b + '\t\t#endif\n'.length) {
    const longe = `\t\t#if defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 1 ) && ( UNROLLED_LOOP_INDEX == 0 )
		{
			vec4 cPerto = vDirectionalShadowCoord[ 0 ];
			cPerto.xyz /= cPerto.w;
			vec2 bPerto = abs( cPerto.xy * 2.0 - 1.0 );
			float tLonge = smoothstep( 0.72, 0.97, max( bPerto.x, bPerto.y ) );
			if ( cPerto.z > 1.0 || max( bPerto.x, bPerto.y ) > 1.0 ) tLonge = 1.0;
			if ( tLonge > 0.0 && directLight.visible && receiveShadow ) {
				DirectionalLightShadow sombraLonge = directionalLightShadows[ 1 ];
				float sLonge = getShadow( directionalShadowMap[ 1 ], sombraLonge.shadowMapSize, sombraLonge.shadowIntensity, sombraLonge.shadowBias, sombraLonge.shadowRadius, vDirectionalShadowCoord[ 1 ] );
				directLight.color *= mix( 1.0, sLonge, tLonge );
			}
		}
		#endif
`;
    THREE.ShaderChunk.lights_fragment_begin = ch.slice(0, a)
      + '\t\t#if !( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 1 ) && ( UNROLLED_LOOP_INDEX == 1 ) )\n'
      + ch.slice(a, b) + '\t\t#endif\n' + longe
      + '\t\tRE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n\t\t#endif\n\t}\n\t#pragma unroll_loop_end'
      + ch.slice(b + sombra.length);
  } else console.warn('graficos.js: o laço das luzes do three.js mudou — a sombra em cascata ("Sempre carregadas") não junta');
}

const CHAVE = 'masmorra:graficos';
const CHAVE_AUTO = 'masmorra:resolucao-auto';
const CHAVE_FIXA = 'masmorra:resolucao';      // a resolução escolhida à mão (fração de 0 a 1)
const CHAVE_SOMBRAS = 'masmorra:sombras';
const CHAVE_DISTANCIA = 'masmorra:distancia';   // a distância de carregamento escolhida à mão (m)
const CHAVE_DINAMICO = 'masmorra:dinamico';     // o carregamento dinâmico ligado ou não
const CHAVE_SOMBRA_DIST = 'masmorra:sombra-distancia';   // a distância das sombras (o raio da caixa do sol, m)
const CHAVE_SOMBRA_SUAVE = 'masmorra:sombra-suave';      // a sombra com passagem suave ligada ou não
const CHAVE_SOMBRA_DETALHE = 'masmorra:sombra-detalhe';  // 'alto' | 'medio' | 'baixo' (ausente = o da qualidade)
const CHAVE_SOMBRA_SEMPRE = 'masmorra:sombra-sempre';    // 'sim' = "Sempre carregadas" (a cascata)
const CHAVE_PRECARREGAR = 'masmorra:precarregar';        // pré-carregar tudo (e guardar as fotos dos cartazes)
const CHAVE_DIST_MODO = 'masmorra:distancia-modo';       // 'tipo' = uma distância por tipo de peça
const CHAVE_DIST_TIPOS = 'masmorra:distancia-tipos';     // {grama, pedras, arvores, cenario}: m (ausente = padrão)
const CHAVE_PASS_MODO = 'masmorra:passagem-modo';        // 'tipo' = a passagem suave escolhida por tipo
const CHAVE_PASS_TIPOS = 'masmorra:passagem-tipos';      // {grama, pedras, arvores, cenario}: true/false
const CHAVE_AA = 'masmorra:antisserrilhado';             // 'nao' | 'msaa' | 'fxaa' (ausente = o da qualidade)
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
/**
 * MAIS TRÊS (20/10/2026). A DISTÂNCIA DAS SOMBRAS: o raio da caixa da sombra do sol em volta do
 * jogador (o `sol.raio` da qualidade, ou um destes; o mapa de sombra continua do mesmo tamanho —
 * mais longe = sombra mais borrada; não recompila nada). A SOMBRA COM PASSAGEM SUAVE: a sombra
 * acompanha o pontilhado do que some ou vira cartaz (lod.js, `profundidadeDaPassagem`; um
 * uniforme, não recompila). PRÉ-CARREGAR TUDO (vale ao reabrir o jogo): no carregamento sobem para
 * a placa as texturas e as malhas de TODAS as peças (main.js, `preaquecer`), e as fotos dos
 * cartazes ficam guardadas no navegador (lod.js) — a abertura seguinte não as tira de novo.
 */
export const DISTANCIAS_SOMBRA = [20, 30, 50, 60, 80, 120];
/**
 * O DETALHE DAS SOMBRAS (21/10/2026; opções avançadas → Sombras): o mapa da sombra do sol (px) e o
 * filtro (o tipo vale para a da tocha também; trocar o tipo recompila: o menu aquece de novo).
 * "Desligado" é o mesmo que desligar as sombras. Ausente = o da qualidade.
 */
export const DETALHES_SOMBRA = {
  alto: { mapa: 4096, tipo: THREE.PCFSoftShadowMap },
  medio: { mapa: 2048, tipo: THREE.PCFSoftShadowMap },
  baixo: { mapa: 1024, tipo: THREE.PCFShadowMap },
};
/** A CASCATA ("Sempre carregadas"): o raio da caixa de longe (m), o quanto ela vai à frente e de quantos em quantos quadros é redesenhada. */
export const LONGE = { raio: 150, avanco: 0.6, aCada: 3 };
const CAMADA_SOMBRA_SOL = 30;   // (= `CAMADA_SOMBRA` do lod.js: a sombra da árvore que já é cartaz)
/**
 * POR TIPO DE PEÇA (20/10/2026, pedido do dono). Os tipos são os do LOD (`tipoDaPeca`, lod.js):
 * GRAMA (o capim e a vegetação miúda `gi-`/Grass/Flower/Plant/Fern), PEDRAS, ÁRVORES (árvores e
 * arbustos) e CENÁRIO (o resto: peças soltas, construções, objetos). A DISTÂNCIA de cada um: na
 * grama e nas árvores, onde o modelo vira cartaz (e, na grama, até onde vai o capim); nas pedras
 * e no cenário, que não viram cartaz, até onde aparecem — a peça de até 1 m de raio some a X m, a
 * maior vai mais longe na proporção do raio (a casa de 6 m a 6·X), e nunca além da regra dos pixels
 * (`limiarPx`), que é o Padrão. A PASSAGEM SUAVE (o pontilhado) também pode ser escolhida por tipo:
 * desligada, o corte seco de antes (um pouco mais leve). Tudo por uniforme: nada recompila.
 */
export const TIPOS_LOD = [
  { id: 'grama', nome: 'Grama' }, { id: 'pedras', nome: 'Pedras' },
  { id: 'arvores', nome: 'Árvores' }, { id: 'cenario', nome: 'Cenário' },
];
export const DISTANCIAS_TIPO = {
  grama: DISTANCIAS, arvores: DISTANCIAS,
  pedras: [30, 40, 60, 80, 120], cenario: [30, 40, 60, 80, 120],
};
const lerJson = (k) => { try { const v = JSON.parse(localStorage.getItem(k) ?? 'null'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
/**
 * As resoluções que o menu de pausa oferece (fração da resolução da qualidade; opções avançadas
 * desde 20/10/2026). As de antes (0,85, 0,7, 0,55, 0,4) continuam na lista: a escolha guardada vale.
 */
export const RESOLUCOES = [1, 0.9, 0.85, 0.8, 0.7, 0.6, 0.55, 0.5, 0.4];

/**
 * O ANTISSERRILHADO (20/10/2026; opções avançadas): `nao`, `msaa` (o da placa: só se escolhe ao
 * criar o contexto WebGL — vale ao reabrir o jogo) ou `fxaa` (pós-processo leve, js/fxaa.js — na
 * hora). Ausente = o da qualidade (MSAA no Alto e no Médio). Numa Radeon 740M a 1920×945 o MSAA
 * custava ~26% dos quadros (07/10/2026); o FXAA é uma passada só na tela.
 */
export const ANTISSERRILHADOS = ['nao', 'msaa', 'fxaa'];
const lerAA = () => { try { const v = localStorage.getItem(CHAVE_AA); return ANTISSERRILHADOS.includes(v) ? v : null; } catch { return null; } };

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
  // o AUTOMÁTICO (sem escolha guardada, ou "auto"; só no computador): a qualidade do perfil medido
  // nesta máquina, ou o Alto até medir (main.js, no fim do carregamento)
  if (!toque && (!q || q === 'auto')) return perfilGuardado()?.q ?? 'alto';
  if (QUALIDADES[q]) return q;
  return !toque ? 'alto' : ehCelularFraco() ? 'celular' : 'medio';
}

/**
 * O AUTOMÁTICO (20/10/2026): no fim do carregamento o jogo mede esta máquina (medidor.js) e
 * escolhe um PERFIL pela taxa de quadros — o alvo é `ALVO_FPS` (o dono: 45, "agradável aos
 * olhos"). Mede na primeira abertura e de novo quando muda a ASSINATURA (a placa, o navegador, a
 * tela ou `PERFIL_VERSAO` — suba-a quando as qualidades mudarem de custo); o botão "Medir de novo"
 * das opções avançadas refaz. O perfil guardado vale enquanto a qualidade estiver em
 * "Automático"; escolher uma qualidade à mão desliga o Automático até voltar a ele.
 *   • ULTRA: o Ultra com MSAA, se ele cabe com folga (15%) no alvo;
 *   • EQUILÍBRIO: o Alto com FXAA, se cabe no alvo;
 *   • MELHOR DESEMPENHO: o PRIMEIRO corte é o antisserrilhado (o dono, 20/10/2026: "desligar o
 *     antisserrilhado deixa o jogo bem leve") — o Alto sem ele; se ainda não der, o Médio e
 *     depois o Baixo, sem ele (estimados pelo Alto: eles mudam os shaders, e medi-los no
 *     carregamento custaria compilar tudo de novo). A resolução automática ajusta o resto.
 */
export const ALVO_FPS = 45;
export const PERFIL_VERSAO = 1;
const CHAVE_PERFIL = 'masmorra:perfil-auto';
export const PERFIS = { ultra: 'Ultra', equilibrio: 'Equilíbrio', desempenho: 'Melhor desempenho' };

/** O quadro estimado (ms) de uma medida: a placa ou a CPU (o `render` + ~3 ms do resto do laço). */
const quadroDe = (m) => Math.max(m?.gpu ?? Infinity, (m?.cpu ?? Infinity) + 3);

/** O perfil para as medidas do medidor.js: `{ perfil, q, aa }`. */
export function escolherPerfil(m) {
  const alvo = 1000 / ALVO_FPS;
  if (quadroDe(m.ultra) <= alvo * 0.85) return { perfil: 'ultra', q: 'ultra', aa: 'msaa' };
  if (quadroDe(m.fxaa) <= alvo) return { perfil: 'equilibrio', q: 'alto', aa: 'fxaa' };
  const e = quadroDe(m.alto);
  if (e <= alvo * 1.1) return { perfil: 'desempenho', q: 'alto', aa: 'nao' };
  if (e <= alvo * 1.6) return { perfil: 'desempenho', q: 'medio', aa: 'nao' };
  return { perfil: 'desempenho', q: 'baixo', aa: 'nao' };
}

/** A assinatura desta máquina: medida em outra, o perfil não vale. */
export function assinaturaDaMaquina() {
  const nav = navigator.userAgent.match(/(Edg|OPR|Chrome|Firefox|Version)\/(\d+)/);
  return `${nomeDaPlaca()}|${nav ? `${nav[1]} ${nav[2]}` : navigator.userAgent}|${screen.width}×${screen.height}@${devicePixelRatio}|v${PERFIL_VERSAO}`;
}

/** O perfil medido nesta máquina (`null` = medir). */
export function perfilGuardado() {
  try {
    const p = JSON.parse(localStorage.getItem(CHAVE_PERFIL) ?? 'null');
    return p && p.assinatura === assinaturaDaMaquina() && QUALIDADES[p.q] && PERFIS[p.perfil] ? p : null;
  } catch { return null; }
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
    // o AUTOMÁTICO (só no computador): sem qualidade escolhida à mão, ou "auto"
    let qGuardada = null;
    try { qGuardada = localStorage.getItem(CHAVE); } catch { }
    this.autoQ = !toque && !placaDeSoftware() && (!qGuardada || qGuardada === 'auto');
    this.perfil = this.autoQ ? perfilGuardado() : null;
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
    this.distanciaSombra = null;   // null = a da qualidade
    try { const d = Number(localStorage.getItem(CHAVE_SOMBRA_DIST)); if (DISTANCIAS_SOMBRA.includes(d)) this.distanciaSombra = d; } catch { }
    try { this.sombraSuave = localStorage.getItem(CHAVE_SOMBRA_SUAVE) !== 'nao'; } catch { this.sombraSuave = true; }
    this.sombraDetalhe = null;   // null = o da qualidade
    try { const d = localStorage.getItem(CHAVE_SOMBRA_DETALHE); if (DETALHES_SOMBRA[d]) this.sombraDetalhe = d; } catch { }
    try { this.sombraSempre = localStorage.getItem(CHAVE_SOMBRA_SEMPRE) === 'sim'; } catch { this.sombraSempre = false; }
    try { this.preCarregar = localStorage.getItem(CHAVE_PRECARREGAR) === 'sim'; } catch { this.preCarregar = false; }
    // (por tipo: o modo e os valores; valor fora da lista = o padrão)
    try { this.distModo = localStorage.getItem(CHAVE_DIST_MODO) === 'tipo' ? 'tipo' : 'junto'; } catch { this.distModo = 'junto'; }
    try { this.passModo = localStorage.getItem(CHAVE_PASS_MODO) === 'tipo' ? 'tipo' : 'todos'; } catch { this.passModo = 'todos'; }
    this.distTipos = {}; this.passTipos = {};
    const dt = lerJson(CHAVE_DIST_TIPOS), pt = lerJson(CHAVE_PASS_TIPOS);
    for (const { id } of TIPOS_LOD) {
      if (DISTANCIAS_TIPO[id].includes(dt[id])) this.distTipos[id] = dt[id];
      this.passTipos[id] = pt[id] !== false;
    }
    this.aa = lerAA();   // null = o da qualidade
    this.fxaa = null;    // o pós-processo, quando ligado (js/fxaa.js)
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

  /**
   * A distância ESCOLHIDA para um tipo (m) no modo "Por tipo"; `null` = o padrão dele (no modo
   * "tudo junto", sempre `null`). Quem usa: o capim (grama).
   */
  distanciaTipo(tipo) { return this.distModo === 'tipo' ? (this.distTipos[tipo] ?? null) : null; }

  /**
   * A distância de um tipo para o LOD (lod.js, a cada quadro): grama e árvores = onde vira cartaz
   * (a escolhida, ou a de carregamento); pedras e cenário = o teto de até onde aparecem (`null` =
   * só a regra dos pixels).
   */
  distanciaDe(tipo) {
    const v = this.distanciaTipo(tipo);
    if (tipo === 'grama' || tipo === 'arvores') return Math.min(DIST_MAX, v ?? this.distanciaDeCarga);
    return v;
  }

  /** A passagem suave (o pontilhado) de um tipo está ligada? ("todos" = o carregamento dinâmico). */
  suaveDe(tipo) { return this.passModo === 'tipo' ? this.passTipos[tipo] !== false : this.dinamico !== false; }

  /** "Padrão (tudo junto)" ou "Por tipo" na distância de carregamento. */
  escolherModoDistancia(modo) {
    modo = modo === 'tipo' ? 'tipo' : 'junto';
    if (modo === this.distModo) return;
    this.distModo = modo;
    try { modo === 'tipo' ? localStorage.setItem(CHAVE_DIST_MODO, 'tipo') : localStorage.removeItem(CHAVE_DIST_MODO); } catch { }
    this.game.monitor?.evento(`distância de carregamento ${modo === 'tipo' ? `por tipo (${this.resumoDistancias()})` : `tudo junto (${this.distanciaDeCarga} m)`}`);
  }

  /** A distância de um tipo à mão (`null` = o padrão dele); só vale no modo "Por tipo". */
  escolherDistanciaTipo(tipo, v) {
    if (!DISTANCIAS_TIPO[tipo]) return;
    if (DISTANCIAS_TIPO[tipo].includes(v)) this.distTipos[tipo] = v; else delete this.distTipos[tipo];
    try { localStorage.setItem(CHAVE_DIST_TIPOS, JSON.stringify(this.distTipos)); } catch { }
    this.game.monitor?.evento(`distância por tipo: ${this.resumoDistancias()}`);
  }

  /** "Todos" (o carregamento dinâmico Ligado/Desligado) ou "Por tipo" na passagem suave. */
  escolherModoPassagem(modo) {
    modo = modo === 'tipo' ? 'tipo' : 'todos';
    if (modo === this.passModo) return;
    this.passModo = modo;
    try { modo === 'tipo' ? localStorage.setItem(CHAVE_PASS_MODO, 'tipo') : localStorage.removeItem(CHAVE_PASS_MODO); } catch { }
    this.game.monitor?.evento(`passagem suave ${modo === 'tipo' ? `por tipo (${this.resumoPassagens()})` : `para todos (${this.dinamico ? 'ligada' : 'desligada'})`}`);
  }

  /** Liga ou desliga a passagem suave de um tipo (modo "Por tipo"). */
  alternarPassagemTipo(tipo, ligar = !this.passTipos[tipo]) {
    if (!DISTANCIAS_TIPO[tipo] || ligar === this.passTipos[tipo]) return;
    this.passTipos[tipo] = ligar;
    try { localStorage.setItem(CHAVE_PASS_TIPOS, JSON.stringify(this.passTipos)); } catch { }
    this.game.monitor?.evento(`passagem suave por tipo: ${this.resumoPassagens()}`);
  }

  /** "grama 40 m, pedras padrão…" (eventos e o relatório do monitor). */
  resumoDistancias() { return TIPOS_LOD.map(({ id, nome }) => `${nome.toLowerCase()} ${this.distTipos[id] ? `${this.distTipos[id]} m` : 'padrão'}`).join(', '); }
  resumoPassagens() { return TIPOS_LOD.map(({ id, nome }) => `${nome.toLowerCase()} ${this.passTipos[id] !== false ? 'suave' : 'seca'}`).join(', '); }

  /** O raio da caixa da sombra do sol (m): o escolhido à mão ou o da qualidade; `null` sem sombra do sol. */
  get raioDaSombra() { return this.q.sol ? (this.distanciaSombra ?? this.q.sol.raio) : null; }

  /** O mapa da sombra do sol (px): o do detalhe escolhido, ou o da qualidade. */
  get mapaDoSol() { return DETALHES_SOMBRA[this.sombraDetalhe]?.mapa ?? this.q.sol?.mapa ?? 2048; }

  /** O filtro das sombras: o do detalhe escolhido, ou o da qualidade. */
  get tipoDaSombra() { return (this.comSombras && DETALHES_SOMBRA[this.sombraDetalhe]?.tipo) || this.q.tipoSombra; }

  /** Os números da caixa de longe (lod.js os lê sem importar este módulo). */
  get longe() { return LONGE; }

  /** A cascata ("Sempre carregadas") vale agora? (só com a sombra do sol: o Alto e o Ultra) */
  get cascata() { return this.sombraSempre && this.comSombras && !!this.q.sol; }

  /**
   * A distância das sombras à mão (`null` = a da qualidade; `'sempre'` = "Sempre carregadas", a
   * cascata). Um número muda só a caixa do sol (nada recompila); ligar/desligar a cascata põe ou
   * tira uma luz com sombra — os shaders mudam: aplica e aquece de novo, como ligar as sombras.
   */
  escolherDistanciaSombra(v) {
    const sempre = v === 'sempre';
    if (!sempre) {
      this.distanciaSombra = DISTANCIAS_SOMBRA.includes(v) ? v : null;
      try { if (this.distanciaSombra) localStorage.setItem(CHAVE_SOMBRA_DIST, String(this.distanciaSombra)); else localStorage.removeItem(CHAVE_SOMBRA_DIST); } catch { }
    }
    const mudouCascata = sempre !== this.sombraSempre;
    this.sombraSempre = sempre;
    try { sempre ? localStorage.setItem(CHAVE_SOMBRA_SEMPRE, 'sim') : localStorage.removeItem(CHAVE_SOMBRA_SEMPRE); } catch { }
    if (mudouCascata) this.reaplicarSombras(); else this.caixaDoSol();
    this.game.monitor?.evento(sempre ? `distância das sombras: sempre carregadas (perto ${this.raioDaSombra ?? '—'} m + longe ${LONGE.raio} m)` : `distância das sombras ${this.raioDaSombra ?? '—'} m${this.distanciaSombra ? '' : ' (a da qualidade)'}`);
  }

  /** O detalhe das sombras (`null` = o da qualidade; `'desligado'` = sem sombras). */
  escolherDetalheSombra(v) {
    if (v === 'desligado') { this.alternarSombras(false); return; }
    this.sombraDetalhe = DETALHES_SOMBRA[v] ? v : null;
    try { this.sombraDetalhe ? localStorage.setItem(CHAVE_SOMBRA_DETALHE, this.sombraDetalhe) : localStorage.removeItem(CHAVE_SOMBRA_DETALHE); } catch { }
    if (!this.sombras) this.alternarSombras(true);
    else this.reaplicarSombras();
    this.game.monitor?.evento(`detalhe das sombras ${this.sombraDetalhe ?? 'da qualidade'} (sol ${this.mapaDoSol} px)`);
  }

  /** Aplica de novo o que muda os shaders das sombras (sem perder a escala da resolução) e aquece. */
  reaplicarSombras() {
    const escala = this.escala;
    this.aplicar();
    if (escala !== this.escala) { this.escala = escala; this.game.renderer.setPixelRatio(this.resolucaoBase * escala); }
    this.game.preaquecer?.();
  }

  /** A sombra com passagem suave ligada ou não (lod.js lê a cada quadro: um uniforme). */
  alternarSombraSuave(ligar = !this.sombraSuave) {
    if (ligar === this.sombraSuave) return;
    this.sombraSuave = ligar;
    try { localStorage.setItem(CHAVE_SOMBRA_SUAVE, ligar ? 'sim' : 'nao'); } catch { }
    this.game.monitor?.evento(`sombra com passagem suave ${ligar ? 'ligada' : 'desligada'}`);
  }

  /** Pré-carregar tudo (vale na próxima abertura do jogo: é o carregamento que muda). */
  alternarPreCarregar(ligar = !this.preCarregar) {
    if (ligar === this.preCarregar) return;
    this.preCarregar = ligar;
    try { localStorage.setItem(CHAVE_PRECARREGAR, ligar ? 'sim' : 'nao'); } catch { }
    this.game.monitor?.evento(`pré-carregar tudo ${ligar ? 'ligado' : 'desligado'} (vale ao reabrir)`);
  }

  /** A caixa da sombra do sol no raio de agora (a qualidade ou a distância das sombras); e a de longe. */
  caixaDoSol() {
    const amb = this.game.world?.ambience, sol = amb?.lua, R = this.raioDaSombra;
    if (!sol?.castShadow || !R) return;
    const c = sol.shadow.camera;
    c.left = -R; c.right = R; c.top = R; c.bottom = -R; c.near = 1; c.far = 260;
    c.updateProjectionMatrix();
    sol.shadow.bias = -0.0004; sol.shadow.normalBias = 1.5 * (2 * R / this.mapaDoSol);   // ~1,5 texel
    const longe = amb.luaLonge;
    if (longe?.castShadow) {
      const L = LONGE.raio, cl = longe.shadow.camera;
      cl.left = -L; cl.right = L; cl.top = L; cl.bottom = -L; cl.near = 1; cl.far = 600;
      cl.updateProjectionMatrix();
      longe.shadow.bias = -0.0008; longe.shadow.normalBias = 1.5 * (2 * L / longe.shadow.mapSize.x);
    }
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
  static antialias(nome) { const aa = lerAA(); return aa ? aa === 'msaa' : (QUALIDADES[nome] ?? QUALIDADES.alto).antialias; }

  /**
   * O MSAA do contexto WebGL (main.js, ANTES de existir o renderizador): o escolhido; no
   * Automático, o do perfil (antes de medir, nenhum: o Equilíbrio e o Desempenho não o usam, e o
   * Ultra o liga na abertura seguinte); senão o da qualidade.
   */
  get antialiasInicial() {
    if (this.aa) return this.aa === 'msaa';
    if (this.autoQ) return this.perfil?.aa === 'msaa';
    return this.q.antialias;
  }

  /** O antisserrilhado que vale: o escolhido, o do perfil (Automático) ou o da qualidade. */
  get tipoAA() { return this.aa ?? (this.autoQ ? (this.perfil?.aa ?? 'nao') : (this.q.antialias ? 'msaa' : 'nao')); }

  /** O MSAA do contexto (o que a página tem agora; muda só ao reabrir). */
  get msaaDoContexto() { return !!this.game.renderer?.getContextAttributes()?.antialias; }

  /** A escolha precisa reabrir o jogo para valer? (o MSAA pedido ≠ o do contexto) */
  get aaReabrir() { return (this.tipoAA === 'msaa') !== this.msaaDoContexto; }

  /** Escolhe o antisserrilhado (`null` = o da qualidade). O FXAA liga e desliga na hora. */
  escolherAntisserrilhado(v) {
    this.aa = ANTISSERRILHADOS.includes(v) ? v : null;
    try { if (this.aa) localStorage.setItem(CHAVE_AA, this.aa); else localStorage.removeItem(CHAVE_AA); } catch { }
    this.aplicarFxaa();
    this.game.monitor?.evento(`antisserrilhado ${this.nomeAA()}${this.aa ? '' : ' (o da qualidade)'}${this.aaReabrir ? ' (o MSAA só muda ao reabrir o jogo)' : ''}`);
  }

  /** O nome do antisserrilhado que vale (o monitor e o menu). */
  nomeAA(t = this.tipoAA) { return t === 'fxaa' ? 'FXAA' : t === 'msaa' ? 'MSAA' : 'desligado'; }

  /**
   * Liga ou desliga o FXAA conforme a escolha (troca de qualidade e menu). Nunca junto do MSAA do
   * contexto (pagaria os dois: ele espera reabrir); e o MSAA pedido que ainda não veio (só ao
   * reabrir) usa o FXAA até lá.
   */
  aplicarFxaa() {
    const t = this.tipoAA, quer = !this.msaaDoContexto && (t === 'fxaa' || t === 'msaa'), r = this.game.renderer;
    if (quer && !this.fxaa && r) { this.fxaa = new Fxaa(r); this.fxaa.ligar(); }
    else if (!quer && this.fxaa) { this.fxaa.desligar(); this.fxaa = null; }
  }

  /** No fim do quadro (main.js): com o FXAA, a passada que põe o quadro na tela. */
  apresentar() { this.fxaa?.apresentar(); }

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
    r.shadowMap.type = this.tipoDaSombra;
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
        const m = this.mapaDoSol;
        if (sol.shadow.mapSize.x !== m) {
          sol.shadow.mapSize.set(m, m);
          sol.shadow.map?.dispose(); sol.shadow.map = null;
        }
      }
      // A CASCATA ("Sempre carregadas"): a luz de longe só existe na cena com ela ligada (posta e
      // tirada SÓ aqui, que já recompila tudo; quem chama aquece de novo — `reaplicarSombras`)
      const longe = g.world.ambience.luaLonge;
      if (longe) {
        const quer = this.cascata;
        longe.visible = quer; longe.castShadow = quer;
        if (quer) {
          const m = Math.max(1024, this.mapaDoSol / 2);
          if (longe.shadow.mapSize.x !== m) { longe.shadow.mapSize.set(m, m); longe.shadow.map?.dispose(); longe.shadow.map = null; }
          longe.shadow.camera.layers.enable(CAMADA_SOMBRA_SOL);
          longe.shadow.autoUpdate = false; longe.shadow.needsUpdate = true;
        }
      }
      if (sol.castShadow) this.caixaDoSol();
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
    this.aplicarFxaa();
  }

  /** Troca de qualidade (menu de pausa) e guarda a escolha. */
  trocar(nome) {
    if (!QUALIDADES[nome] || (nome === this.nome && !this.autoQ)) return;
    const antes = this.q.nome;
    this.autoQ = false;   // escolhida à mão: o Automático para até voltar a ele
    if (nome === this.nome) {   // (a mesma do perfil: só deixa de ser automática)
      try { localStorage.setItem(CHAVE, nome); } catch { }
      this.aplicarFxaa();
      this.game.monitor?.evento(`qualidade ${this.q.nome} à mão (era o Automático)`);
      return;
    }
    this.nome = nome;
    try { localStorage.setItem(CHAVE, nome); } catch { }
    this.aplicar();
    // os shaders da qualidade nova DESENHADOS uma vez (o Chrome só os termina no primeiro
    // desenho; sem isso, girar a câmera depois de trocar travava): main.js
    this.game.preaquecer?.();
    // no relatório do monitor (monitor.js): sem isto, os números de antes e de depois se misturavam
    this.game.monitor?.evento(`qualidade ${antes} → ${this.q.nome}${this.aaReabrir ? ' (o antisserrilhado só muda ao reabrir o jogo)' : ''}`);
  }

  /** O nome do perfil do Automático (o menu e o monitor). */
  get nomePerfil() { return this.perfil ? PERFIS[this.perfil.perfil] : null; }

  /** Volta ao Automático. `false` = não há perfil desta máquina: o main.js mede (`medirEAplicar`). */
  escolherAutomatico() {
    if (this.toque) return true;
    this.autoQ = true;
    try { localStorage.setItem(CHAVE, 'auto'); } catch { }
    this.perfil = perfilGuardado();
    if (!this.perfil) return false;
    this.aplicarPerfil(this.perfil);
    return true;
  }

  /** Esquece o perfil medido ("Medir de novo"): a próxima abertura mede. O de agora continua valendo até lá. */
  esquecerPerfil() {
    try { localStorage.removeItem(CHAVE_PERFIL); } catch { }
    this.game.monitor?.evento('Automático: medir de novo na próxima abertura');
  }

  /** Guarda o perfil medido (com as medidas, para o relatório do monitor). */
  guardarPerfil(p, medidas) {
    const r = (m) => (m ? { gpu: Math.round(m.gpu * 10) / 10, cpu: Math.round(m.cpu * 10) / 10 } : null);
    const g = { ...p, assinatura: assinaturaDaMaquina(), quando: Date.now(), medidas: { ultra: r(medidas.ultra), fxaa: r(medidas.fxaa), alto: r(medidas.alto), tela: medidas.tela, metodo: medidas.metodo } };
    try { localStorage.setItem(CHAVE_PERFIL, JSON.stringify(g)); } catch { }
    return g;
  }

  /** Aplica o perfil (só no Automático): a qualidade dele e o antisserrilhado dele. */
  aplicarPerfil(p) {
    this.perfil = p;
    if (!this.autoQ) return;
    const antes = this.q.nome, nova = QUALIDADES[p.q];
    if (p.q !== this.nome) {
      const recompila = this.q.tipoSombra !== nova.tipoSombra || !this.q.sol !== !nova.sol || !this.q.sombra !== !nova.sombra || this.q.luzes !== nova.luzes || this.q.luzesFora !== nova.luzesFora;
      this.nome = p.q;
      this.aplicar();
      if (recompila) this.game.preaquecer?.();
    } else this.aplicarFxaa();
    this.game.monitor?.evento(`Automático: ${PERFIS[p.perfil]} (${this.q.nome}, antisserrilhado ${this.nomeAA()})${antes !== this.q.nome ? ` — era ${antes}` : ''}${this.aaReabrir ? ' (o MSAA liga ao reabrir o jogo; até lá, o FXAA)' : ''}`);
  }

  /** O resumo do Automático para o relatório do monitor. */
  resumoAutomatico() {
    const p = this.perfil, m = p?.medidas, f = (x) => (x ? `${x.gpu} ms na placa, ${x.cpu} ms de CPU` : '—');
    if (!p) return `Automático ${this.autoQ ? 'ligado (ainda não mediu)' : 'desligado'}`;
    return `Automático ${this.autoQ ? 'ligado' : 'desligado (qualidade à mão)'}: ${PERFIS[p.perfil]} (${QUALIDADES[p.q].nome}, antisserrilhado ${this.nomeAA(p.aa)}) · medido em ${new Date(p.quando).toLocaleDateString('pt-BR')} a ${m?.tela ?? '?'} (${m?.metodo ?? '?'}), alvo ${ALVO_FPS} quadros/s: Ultra+MSAA ${f(m?.ultra)} · Alto+FXAA ${f(m?.fxaa)} · Alto ${f(m?.alto)}`;
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
      // a de LONGE (a cascata): a mesma força, redesenhada de `LONGE.aCada` em `LONGE.aCada` quadros
      const longe = amb.luaLonge;
      if (longe?.castShadow) {
        longe.shadow.intensity = forca;
        this.quadroLonge = ((this.quadroLonge ?? 0) + 1) % LONGE.aCada;
        if (forca > 0 && amb.k > 0.02 && sol.intensity > 0 && !this.solParado && this.quadroLonge === 0) longe.shadow.needsUpdate = true;
      }
    }
    const luz = this.game.player?.torchLight, s = this.comSombras && this.q.sombra;
    if (!luz || !s) return;
    this.quadro++;
    luz.shadow.autoUpdate = false;
    if (luz.intensity > 0 && this.quadro % s.aCada === 0) luz.shadow.needsUpdate = true;
  }
}
