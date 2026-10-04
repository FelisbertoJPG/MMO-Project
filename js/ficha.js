/**
 * A FICHA (04/10/2026) — as REGRAS de nível, atributos, equipamento e carga, todas aqui:
 * mudar o equilíbrio é mudar um número deste arquivo, não caçar contas pelo jogo.
 *
 * A ideia: os níveis AJUDAM, o equipamento DECIDE. Cada atributo rende menos a cada
 * ponto (as `faixas`: até 20 rende bem, de 21 a 40 metade, depois quase nada), a força
 * só vale o quanto a ARMA aproveita dela (`escala`, de E a A) e arma pesada pede força
 * mínima (`requisito`). A armadura absorve o golpe, mas pesa: a RESISTÊNCIA dá a carga
 * que se aguenta, e passar dela deixa o rolamento lento e o fôlego curto.
 *
 * Com 20 em cada atributo (nível 31) e sem armadura, o Carrasco ainda mata em ~4 golpes;
 * com a média, em ~6; com a pesada, em ~7–8 (e aí é preciso resistência para carregá-la).
 *
 * `FICHA` é a REVISÃO destas regras gravada no save (`jogador.ficha`): save de outra
 * revisão não é aberto (`fichaAtual` em save.js) — o personagem recomeça do zero. É o
 * reset de todos os jogadores quando o sistema muda tanto que o progresso antigo não
 * serve mais (a 2 é esta: o progresso da 1 ficava imortal com 20 em cada atributo).
 */
export const FICHA = 2;

export const ATRIBUTO_INICIAL = 10;

/**
 * Quanto um atributo rende: soma, ponto a ponto desde o inicial, o ganho da faixa em
 * que o ponto cai. `faixas` = [[até, ganho por ponto], ...] em ordem.
 */
export function curva(pontos, faixas) {
  let total = 0, de = ATRIBUTO_INICIAL;
  for (const [ate, ganho] of faixas) {
    if (pontos <= de) break;
    total += (Math.min(pontos, ate) - de) * ganho;
    de = ate;
  }
  return total;
}

// VITALIDADE → vida (200 no 10; 300 no 20; 400 no 40)
export const VIDA_BASE = 200;
export const VITALIDADE = [[20, 10], [40, 5], [99, 1.5]];
// RESISTÊNCIA → vigor (90 → 130 → 170) e CARGA máxima (30 → 45 → 61)
export const VIGOR_BASE = 90;
export const RESISTENCIA_VIGOR = [[20, 4], [40, 2], [99, 0.5]];
export const CARGA_BASE = 30;
export const RESISTENCIA_CARGA = [[20, 1.5], [40, 0.8], [99, 0.3]];
// FORÇA → o bônus de dano, que a arma aproveita na proporção da escala dela
// (+30% no 20, +60% no 40, numa arma de escala B)
export const FORCA = [[20, 0.03], [40, 0.015], [99, 0.004]];
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
