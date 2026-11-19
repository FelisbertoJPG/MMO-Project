/**
 * Gera `assets/habilidades.json` (o CATÁLOGO que o jogo lê: a tela da árvore, js/arvore.js)
 * a partir do rascunho `planejamento/arvore-de-habilidades.json`. Mudou o rascunho? Rode:
 *
 *   node ferramentas/habilidades/gerar-catalogo.mjs
 *
 * O Fogo já vem no modelo aprovado (Maestria + 3 linhas); os outros 6 elementos ainda estão
 * no formato antigo (nós por `tier`) e entram só PARA VER: `funcional: false` = a tela mostra,
 * mas não deixa gastar ponto. Elemento que passar a funcionar entra em FUNCIONAIS.
 * As reações viram os GALHOS DE REAÇÃO, cada um com a sua maestria: o "Conhecimento do …".
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const plano = JSON.parse(readFileSync(raiz + 'planejamento/arvore-de-habilidades.json', 'utf8'));

const FUNCIONAIS = new Set(['fogo']);
// os nomes das Maestrias são os da migration 0005
const MAESTRIA = {
  fogo: 'Maestria do Fogo', agua: 'Maestria da Água', terra: 'Maestria da Terra', vento: 'Maestria do Vento',
  luz: 'Maestria da Luz', trevas: 'Maestria das Trevas', eletrico: 'Maestria da Eletricidade',
};
// o artigo de cada árvore de reação ("Conhecimento DO Caos", "DA Peste")
const FEMININOS = new Set(['Areia', 'Chama Sagrada', 'Água Benta', 'Miragem', 'Peste', 'Cripta', 'Assombração', 'Tempestade', 'Magnetita']);

const no = (n) => ({
  id: n.id, nome: n.nome, tipo: n.tipo, ...(n.coluna ? { coluna: n.coluna } : {}),
  ranks: n.ranks, custo: n.custo, requer: n.requer ?? [],
  ...(n.tier ? { tier: n.tier } : {}), ...(n.requer_em_cada ? { requer_em_cada: n.requer_em_cada } : {}),
  ...(n.por_ponto ? { por_ponto: n.por_ponto } : {}), desc: n.desc ?? '',
});

const maestriaPadrao = (e) => ({
  id: `${e.id}.maestria`, nome: MAESTRIA[e.id], tipo: 'maestria', coluna: 'base', ranks: 5, custo: 1, requer: [],
  por_ponto: [1, 2, 3, 4, 5].map((k) => `+${2 * k}% de dano e +${3 * k}% de resistência`),
  desc: `Treinar o elemento aumenta o dano e a resistência a ele. Com 5 pontos, abre o resto do galho.`,
});

const elementos = plano.elementos.map((e) => {
  const modelo = plano.modelo_de_arvore[e.id];
  const arvore = modelo
    ? { modelo: 'linhas', maestria: no(modelo.base[0]), linhas: modelo.linhas.map((l) => ({ linha: l.linha, escolhas: l.escolhas.map(no) })) }
    : { modelo: 'tiers', maestria: maestriaPadrao(e), nos: plano.arvores_elementais[e.id].map(no) };
  return { id: e.id, nome: e.nome, cor: e.cor, identidade: e.identidade, funcional: FUNCIONAIS.has(e.id), arvore };
});

const reacoes = plano.reacoes.map((r) => ({
  id: r.id, nome: r.nome, elementos: r.elementos, desc: r.desc ?? '',
  conhecimento: `Conhecimento ${FEMININOS.has(r.arvore.nome) ? 'da' : 'do'} ${r.arvore.nome}`,
  arvore: r.arvore.nome, nos: r.arvore.nos.map(no),
}));

const saida = {
  _leiame: 'GERADO por ferramentas/habilidades/gerar-catalogo.mjs a partir de planejamento/arvore-de-habilidades.json: não edite aqui. Os números são provisórios.',
  regras: { maestria: 5, pontos_por_linha: 3, reacao_abre_com_maestria: 5 },
  elementos, reacoes,
};
writeFileSync(raiz + 'assets/habilidades.json', JSON.stringify(saida, null, 1) + '\n');
console.log(`assets/habilidades.json: ${elementos.length} elementos (${[...FUNCIONAIS].join(', ')} funcional), ${reacoes.length} reações`);
