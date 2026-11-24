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
 * INICIAIS = a Maestria que o personagem já conhece ao nascer (D20); as outras virão das
 * missões. A tela esconde o elemento que o personagem não conhece.
 *
 * OS CAMINHOS (D28, 21/11/2026): a página dos 3 começos vem do EDITOR DE ÁRVORE
 * (`planejamento/arvores/resumo-3-comecos.json`, o que o dono desenha): cada card vira
 * `caminho.<nome sem acento>`, com o começo de que descende (ou `hibrido`) e o lugar na tela
 * (`x`/`y`, centrados e na escala da tecla K). O que cada card FAZ no jogo mora em
 * js/caminhos.js. A Arte Marcial e a Canalização saíram do catálogo (seguem no rascunho).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const plano = JSON.parse(readFileSync(raiz + 'planejamento/arvore-de-habilidades.json', 'utf8'));

const FUNCIONAIS = new Set(['fogo']);
const INICIAIS = new Set(['fogo']);
const PONTOS_DA_MAESTRIA = plano.modelo_de_arvore.regras.maestria.pontos;   // 3 (D19)
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
  id: `${e.id}.maestria`, nome: MAESTRIA[e.id], tipo: 'maestria', coluna: 'base', ranks: PONTOS_DA_MAESTRIA, custo: 1, requer: [],
  por_ponto: Array.from({ length: PONTOS_DA_MAESTRIA }, (_, i) => `+${2 * (i + 1)}% de dano e +${3 * (i + 1)}% de resistência`),
  desc: `Treinar o elemento aumenta o dano e a resistência a ele. Com ${PONTOS_DA_MAESTRIA} pontos, abre o resto do galho.`,
});

const elementos = plano.elementos.map((e) => {
  const modelo = plano.modelo_de_arvore[e.id];
  const arvore = modelo
    ? { modelo: 'linhas', maestria: no(modelo.base[0]), linhas: modelo.linhas.map((l) => ({ linha: l.linha, escolhas: l.escolhas.map(no) })) }
    : { modelo: 'tiers', maestria: maestriaPadrao(e), nos: plano.arvores_elementais[e.id].map(no) };
  return { id: e.id, nome: e.nome, cor: e.cor, identidade: e.identidade, funcional: FUNCIONAIS.has(e.id), inicial: INICIAIS.has(e.id), arvore };
});

const reacoes = plano.reacoes.map((r) => ({
  id: r.id, nome: r.nome, elementos: r.elementos, desc: r.desc ?? '',
  conhecimento: `Conhecimento ${FEMININOS.has(r.arvore.nome) ? 'da' : 'do'} ${r.arvore.nome}`,
  arvore: r.arvore.nome, nos: r.arvore.nos.map(no),
}));

// OS CAMINHOS (D28): a página dos 3 começos, do Editor de Árvore
const PAGINA = 'planejamento/arvores/resumo-3-comecos.json';
const COMECOS = [   // a raiz de cada começo (o nome do card sem acento) e a cor dele
  { id: 'batalha', nome: 'Batalha', raiz: 'maestria_em_batalha', cor: '#d08a5a' },
  { id: 'eter', nome: 'Éter', raiz: 'eter', cor: '#a77dff' },
  { id: 'esquiva', nome: 'Esquiva', raiz: 'furtividade_e_esquiva', cor: '#7fc79a' },
];
const COR_HIBRIDO = '#e8c25a';
const ESCALA_DA_PAGINA = 0.6;      // o editor espaça 200 × 150; na tecla K, 120 × 90
const ID_HABILIDADE = /^[a-z][a-z0-9_.-]{0,59}$/;   // o mesmo do save (ficha.js, saveTorto)

function caminhos() {
  const pag = JSON.parse(readFileSync(raiz + PAGINA, 'utf8'));
  const novo = (velho) => `caminho.${velho.slice(velho.indexOf('.') + 1)}`;
  const por = new Map(pag.nos.map((n) => [n.id, n]));
  // AS RAÍZES: pelo id (o editor mantém o id ao renomear); a que não achar fica com o card SEM
  // requisito que sobrar, pela posição na página (da esquerda para a direita: Batalha, Éter, Esquiva)
  const raizes = new Map();
  const soltos = pag.nos.filter((n) => !Object.keys(n.requer_minimo ?? {}).length && n.tipo !== 'identidade').sort((a, b) => a.pos[0] - b.pos[0]);
  const faltam = [];
  for (const c of COMECOS) {
    const id = `${pag.arvore}.${c.raiz}`;
    if (por.has(id)) raizes.set(id, c); else faltam.push(c);
  }
  const livres = soltos.filter((s) => !raizes.has(s.id));   // já em ordem da esquerda para a direita
  faltam.forEach((c, i) => {
    if (!livres[i]) throw new Error(`não achei a raiz do começo ${c.nome} em ${PAGINA}`);
    raizes.set(livres[i].id, c);
  });
  const memo = new Map();
  const comecosDe = (id) => {
    if (memo.has(id)) return memo.get(id);
    const s = new Set(raizes.has(id) ? [raizes.get(id).id] : []);
    memo.set(id, s);
    for (const r of Object.keys(por.get(id)?.requer_minimo ?? {})) for (const c of comecosDe(r)) s.add(c);
    return s;
  };
  // o centro de cada card (o editor grava o canto: o card tem 150 × 70); a página centrada no zero
  const cx = (n) => n.pos[0] + 75, cy = (n) => n.pos[1] + 35;
  const xs = pag.nos.map(cx), ys = pag.nos.map(cy);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const nos = pag.nos.map((n) => {
    const cs = [...comecosDe(n.id)];
    const req = Object.fromEntries(Object.entries(n.requer_minimo ?? {}).map(([k, v]) => {
      if (!por.has(k)) throw new Error(`${n.nome} pede ${k}, que não existe`);
      return [novo(k), v];
    }));
    return {
      id: novo(n.id), nome: n.nome, tipo: n.tipo, ranks: n.ranks ?? 1, custo: n.custo ?? 1, requer: [], requer_minimo: req,
      por_ponto: (n.por_ponto ?? []).slice(0, n.ranks ?? 1), desc: n.desc ?? '', ...(n.ativa ? { ativa: n.ativa } : {}),
      comeco: cs.length === 1 ? cs[0] : 'hibrido',
      x: Math.round((cx(n) - mx) * ESCALA_DA_PAGINA), y: Math.round((cy(n) - my) * ESCALA_DA_PAGINA),
    };
  });
  const ids = new Set(nos.map((n) => n.id));
  if (ids.size !== nos.length) throw new Error('dois cards com o mesmo nome na página');
  for (const n of nos) if (!ID_HABILIDADE.test(n.id)) throw new Error(`id que o save não aceita: ${n.id}`);
  return {
    fonte: PAGINA, cor_hibrido: COR_HIBRIDO,
    comecos: [...raizes].map(([id, c]) => ({ id: c.id, nome: c.nome, cor: c.cor, raiz: novo(id) })),
    nos,
  };
}

const saida = {
  _leiame: `GERADO por ferramentas/habilidades/gerar-catalogo.mjs a partir de planejamento/arvore-de-habilidades.json (os elementos e as reações) e de ${PAGINA} (os caminhos): não edite aqui. Os números são provisórios.`,
  regras: {
    maestria: PONTOS_DA_MAESTRIA,
    pontos_por_linha: plano.modelo_de_arvore.regras.limite_de_pontos_por_linha,
    reacao_abre_com_maestria: plano.regras.arvore_de_reacao.abre_com_maestria_em_cada_elemento,
  },
  elementos, reacoes, caminhos: caminhos(),
};
writeFileSync(raiz + 'assets/habilidades.json', JSON.stringify(saida, null, 1) + '\n');
const porComeco = {};
for (const n of saida.caminhos.nos) porComeco[n.comeco] = (porComeco[n.comeco] ?? 0) + 1;
console.log(`assets/habilidades.json: ${elementos.length} elementos (${[...FUNCIONAIS].join(', ')} funcional), ${reacoes.length} reações, ${saida.caminhos.nos.length} cards nos caminhos`, porComeco);
