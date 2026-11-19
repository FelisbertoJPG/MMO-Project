/**
 * A FICHA (04/10/2026; a 3 é de 18/11/2026) — as REGRAS de nível, equipamento e carga,
 * todas aqui: mudar o equilíbrio é mudar um número deste arquivo, não caçar contas pelo jogo.
 *
 * A ideia: os níveis AJUDAM, o equipamento DECIDE. Não há mais atributos para escolher:
 * cada nível acima do 1 aumenta TUDO um pouco (vida, vigor, carga e o bônus de força) e
 * libera 1 ponto de habilidade. A força só vale o quanto a ARMA aproveita dela (`escala`,
 * de E a A) e arma pesada pede força mínima (`requisito`), medida pela força que o nível
 * dá (`forcaDoNivel`). A armadura absorve o golpe, mas pesa: passar da carga deixa o
 * rolamento lento e o fôlego curto.
 *
 * `FICHA` é a REVISÃO destas regras gravada no save (`jogador.ficha`): save de outra
 * revisão não é aberto (`fichaAtual` em save.js) — o personagem recomeça do zero. É o
 * reset de todos os jogadores quando o sistema muda tanto que o progresso antigo não
 * serve mais (a 2: o progresso da 1 ficava imortal com 20 em cada atributo; a 3: os
 * atributos saíram, e o nível passou a valer por tudo).
 */
export const FICHA = 3;

// O QUE CADA NÍVEL ACIMA DO 1 DÁ (nível 1 → nível 31)
export const VIDA_BASE = 200, VIDA_POR_NIVEL = 2;              // 200 → 260
export const VIGOR_BASE = 90, VIGOR_POR_NIVEL = 1;             // 90 → 120
export const CARGA_BASE = 30, CARGA_POR_NIVEL = 0.2;           // 30 → 36
export const BONUS_FORCA_POR_NIVEL = 0.005;                    // +0% → +15%, × a escala da arma
// a FORÇA que conta para o `requisito` das armas: 1 a cada 3 níveis (10 → 20)
export const FORCA_BASE = 10, NIVEIS_POR_FORCA = 3;

export const vidaDoNivel = (n) => VIDA_BASE + VIDA_POR_NIVEL * (n - 1);
export const vigorDoNivel = (n) => VIGOR_BASE + VIGOR_POR_NIVEL * (n - 1);
export const cargaDoNivel = (n) => Math.round((CARGA_BASE + CARGA_POR_NIVEL * (n - 1)) * 10) / 10;
export const bonusForcaDoNivel = (n) => Math.round(BONUS_FORCA_POR_NIVEL * (n - 1) * 1e4) / 1e4;
export const forcaDoNivel = (n) => FORCA_BASE + (n - 1) / NIVEIS_POR_FORCA;

/**
 * SÓ COMPATIBILIDADE: os três campos que o save continua gravando (`vigor`, `endurance`,
 * `strength`). O jogo não os lê mais; existem porque o `saveTorto()` e o
 * `personagem_valido()` de ANTES da migration 0005 exigem que somem 29 + nível, e o jogo
 * pode ir ao ar antes de a migration rodar. Depois dela, podem sair do save.
 */
export const atributosDeCompatibilidade = (n) => ({ vigor: 9 + n, endurance: 10, strength: 10 });

// AS HABILIDADES: cada nível acima do 1 libera 1 ponto. A árvore ainda não existe no jogo:
// por enquanto o jogador só acumula. `nos` = { id da habilidade: PONTOS gastos nela } (uma
// suprema, que custa 3, grava 3); `barra` = os 4 atalhos (o id, ou null).
export const VERSAO_HABILIDADES = 1;
export const VAGAS_DA_BARRA = 4;
const ID_HABILIDADE = /^[a-z][a-z0-9_.-]{0,59}$/;
export const habilidadesVazias = () => ({ v: VERSAO_HABILIDADES, nos: {}, barra: Array(VAGAS_DA_BARRA).fill(null) });
export const pontosGastos = (h) => Object.values(h.nos).reduce((s, n) => s + n, 0);
export const pontosDisponiveis = (nivel, h) => Math.max(0, nivel - 1 - pontosGastos(h));

/**
 * As habilidades que vieram do save, conferidas (a forma é a do `saveTorto()` do servidor
 * e a do `personagem_valido()` do banco). Save sem o campo, ou com ele torto, abre com a
 * árvore vazia: nenhum ponto se perde, porque os disponíveis saem do nível.
 */
export function habilidadesDoSave(h, nivel) {
  const objeto = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!objeto(h) || h.v !== VERSAO_HABILIDADES || !objeto(h.nos)) return habilidadesVazias();
  if (!Array.isArray(h.barra) || h.barra.length !== VAGAS_DA_BARRA) return habilidadesVazias();
  const bons = Object.entries(h.nos).every(([id, n]) => ID_HABILIDADE.test(id) && Number.isInteger(n) && n >= 1 && n <= 999);
  if (!bons || pontosGastos(h) > nivel - 1) return habilidadesVazias();
  if (!h.barra.every((id) => id === null || (typeof id === 'string' && ID_HABILIDADE.test(id)))) return habilidadesVazias();
  return { v: h.v, nos: { ...h.nos }, barra: [...h.barra] };
}

/**
 * O ÉTER (19/11/2026; o rascunho: `regras.eter` em planejamento/arvore-de-habilidades.json):
 * a barra das HABILIDADES. Começa vazia e ENCHE LUTANDO — golpe dado (uma fração do dano),
 * golpe recebido e bloqueio; magia não gera Éter. Passados `ETER_EM_COMBATE` s do último
 * golpe, esvazia aos poucos; descansar na fogueira zera. Não vai no save.
 */
export const ETER_MAX = 100;
export const ETER_DO_GOLPE = { fracao: 0.12, min: 3, max: 10 };   // golpe corpo a corpo que acerta
export const ETER_GOLPE_RECEBIDO = 5;
export const ETER_BLOQUEIO = 3;
export const ETER_EM_COMBATE = 8;          // s depois do último golpe (dado ou recebido)
export const ETER_PERDE_POR_SEG = 5;        // fora de combate
export const eterDoGolpe = (dano) => Math.min(ETER_DO_GOLPE.max, Math.max(ETER_DO_GOLPE.min, dano * ETER_DO_GOLPE.fracao));

export const ESCALA = { A: 1.2, B: 1.0, C: 0.75, D: 0.5, E: 0.25 };
// abaixo do requisito de força da arma: golpes fracos
export const SEM_REQUISITO = 0.6;

// O DANO QUE O JOGADOR RECEBE: os golpes dos inimigos valem 25% a mais do que a tabela
// deles (sem armadura, se sente), e a defesa somada (armadura + anel + comida) tem teto.
export const DANO_RECEBIDO = 1.25;
export const DEFESA_MAX = 0.75;

// O CUSTO de subir do nível `n` para o n+1 (600 no 1; ~1,8 mil no 10; ~16 mil no 30)
export const custoDoNivel = (n) => Math.round(600 * 1.12 ** (n - 1));

/**
 * O PESO carregado (armas, escudo e armadura) contra a carga máxima. Até 70% nada
 * muda; até 100% o rolamento cansa mais e anda menos; acima, sobrecarregado: sem
 * corrida, passo lento, fôlego que mal volta.
 */
export function estadoDaCarga(peso, maximo) {
  const r = maximo > 0 ? peso / maximo : 9;
  if (r <= 0.7) return { nome: 'Leve', fracao: r, regen: 1, rolagemCusto: 1, rolagemDist: 1, passo: 1, corre: true };
  if (r <= 1) return { nome: 'Pesada', fracao: r, regen: 0.85, rolagemCusto: 1.25, rolagemDist: 0.85, passo: 1, corre: true };
  return { nome: 'Sobrecarregado', fracao: r, regen: 0.5, rolagemCusto: 1.6, rolagemDist: 0.6, passo: 0.6, corre: false };
}

// Os LUGARES da armadura, na ordem do código do corpo (guerreiro.js: um dígito por lugar)
export const LUGARES = ['cabeca', 'peito', 'bracos', 'pernas'];
export const NOME_DO_LUGAR = { cabeca: 'Cabeça', peito: 'Peito', bracos: 'Braços', pernas: 'Pernas' };
