/**
 * **OS PERFIS DE PERSONAGEM** (18/11/2026) — as regras do nome e de onde vem a lista.
 *
 * Cada conta tem até 4 personagens, e cada um tem dois progressos separados: o da
 * Jornada (`masmorra.saves`) e o do Mundo online (`masmorra.personagens.dados`). Quem
 * joga sem conta não passa por aqui: continua com um único personagem local.
 *
 * **De onde vem a lista**:
 *   • com conta, do SUPABASE, direto do navegador (migration 0006): é o que funciona no
 *     GitHub Pages, que não tem servidor nosso;
 *   • no modo de teste (`?teste=Nome`), do servidor de mundo (`POST /__mundo/perfis`), que
 *     só atende quando foi subido com `MUNDO_AUTH=teste`.
 *
 * Quem garante as regras é o BANCO (limite de 4, nome único, código sorteado lá). As
 * contas daqui só evitam a viagem e dão o aviso na hora.
 *
 * **Falhar em LER a lista nunca vira "conta sem personagens"**: `listar` responde
 * `{ok: false, error}`, a tela mostra o erro e oferece tentar de novo.
 */
import { req, rpc } from './supabase.js';

export const MAX_PERFIS = 4;
const ID_PERFIL = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODIGO = /^[2-9A-HJ-NP-Z]{6}$/;

/**
 * A forma do nome que decide se dois nomes são o mesmo: "João" e "joao" dão "joao".
 * A MESMA conta de `masmorra.chave_do_nome()` e de `servidor-mundo.mjs`.
 */
export const chaveDoNome = (nome) => nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** O nome como ele é gravado: sem espaços nas pontas e com os acentos numa forma só. */
export const limparNome = (nome) => String(nome ?? '').trim().normalize('NFC');

/** O que há de errado com este nome? `null` = nada. */
export function erroDoNome(nome) {
  const n = [...nome].length;
  if (n < 3) return 'O nome precisa ter pelo menos 3 letras.';
  if (n > 16) return 'O nome pode ter no máximo 16 letras.';
  if (!/^[a-z0-9]+$/.test(chaveDoNome(nome))) return 'Use só letras e números, sem espaços.';
  return null;
}

/** Como o personagem é identificado para os outros jogadores: `Kael #7K3F9Q`. */
export const rotuloDoPerfil = (p) => (p?.codigo ? `${p.nome} #${p.codigo}` : p?.nome ?? '');

/** O que o banco (ou o servidor de teste) respondeu, na língua de quem joga. */
function traduzir(erro) {
  const texto = String(erro ?? '');
  if (texto.includes('nome_em_uso')) return 'Este nome já existe. Escolha outro.';
  if (texto.includes('nome_invalido')) return 'Use de 3 a 16 letras e números, sem espaços.';
  if (texto.includes('limite_de_personagens')) return `Cada conta pode ter até ${MAX_PERFIS} personagens.`;
  if (texto.includes('confirmacao_errada')) return 'O nome digitado não é o deste personagem.';
  if (texto.includes('personagem_nao_encontrado')) return 'Este personagem não existe mais.';
  if (texto.includes('aparencia_invalida')) return 'A aparência escolhida não é válida.';
  return texto || 'Não consegui falar com o servidor. Tente de novo.';
}

/** Só passa o perfil com a forma certa: o `id` vira caminho de arquivo e chave de save. */
function limparPerfil(p, nuvem) {
  if (!p || !ID_PERFIL.test(p.id ?? '') || typeof p.nome !== 'string' || !CODIGO.test(p.codigo ?? '')) return null;
  return {
    id: p.id, nome: p.nome, codigo: p.codigo, nuvem,
    aparencia: typeof p.aparencia === 'string' ? p.aparencia : null,
    nivel: Number.isInteger(p.nivel) ? p.nivel : null,
  };
}

function limparLista(linhas, nuvem) {
  if (!Array.isArray(linhas)) return null;
  const perfis = linhas.map((p) => limparPerfil(p, nuvem));
  return perfis.every(Boolean) ? perfis : null;
}

/** A lista no Supabase: a conta logada só enxerga os personagens dela (RLS). */
class PerfisNaNuvem {
  async listar() {
    const r = await req('personagens?select=id,nome,codigo,aparencia,nivel:dados->jogador->nivel&order=criado_em');
    if (r.status === 404) return { ok: false, error: 'A tabela dos personagens não existe no Supabase (falta rodar a migration 0006).' };
    const perfis = r.ok ? limparLista(r.dados, true) : null;
    return perfis ? { ok: true, perfis } : { ok: false, error: 'Não consegui ler os seus personagens.' };
  }

  async nomeLivre(nome) {
    const r = await rpc('nome_disponivel', { p_nome: nome });
    return r.ok ? r.dados === true : null;   // null = não deu para saber agora
  }

  async criar(nome, aparencia) {
    const r = await rpc('criar_personagem', { p_nome: nome, p_aparencia: aparencia });
    const perfil = r.ok ? limparPerfil(r.dados, true) : null;
    return perfil ? { ok: true, perfil } : { ok: false, error: traduzir(r.error) };
  }

  async apagar(id, nome) {
    const r = await rpc('apagar_personagem', { p_id: id, p_nome: nome });
    return r.ok ? { ok: true } : { ok: false, error: traduzir(r.error) };
  }
}

/** A lista no servidor de mundo, para o teste local sem conta. */
class PerfisDeTeste {
  constructor(base, nome) { this.base = base; this.token = `teste:${nome}`; }

  async pedir(corpo) {
    try {
      const r = await fetch(`${this.base}/__mundo/perfis`, {
        method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ token: this.token, ...corpo }),
      });
      const d = await r.json().catch(() => null);
      return d?.ok ? d : { ok: false, error: d?.erro ?? `HTTP ${r.status}` };
    } catch { return { ok: false, error: 'o servidor do mundo não respondeu' }; }
  }

  async listar() {
    const r = await this.pedir({ acao: 'listar' });
    const perfis = r.ok ? limparLista(r.perfis, false) : null;
    return perfis ? { ok: true, perfis } : { ok: false, error: 'Não consegui ler os seus personagens.' };
  }

  async nomeLivre(nome) {
    const r = await this.pedir({ acao: 'nome', nome });
    return r.ok ? r.livre === true : null;
  }

  async criar(nome, aparencia) {
    const r = await this.pedir({ acao: 'criar', nome, aparencia });
    const perfil = r.ok ? limparPerfil(r.perfil, false) : null;
    return perfil ? { ok: true, perfil } : { ok: false, error: traduzir(r.error) };
  }

  async apagar(id, nome) {
    const r = await this.pedir({ acao: 'apagar', id, nome });
    return r.ok ? { ok: true } : { ok: false, error: traduzir(r.error) };
  }
}

/** De onde vem a lista nesta página: `teste` = o nome de `?teste=`. */
export const fonteDosPerfis = ({ teste, base }) => (teste ? new PerfisDeTeste(base, teste) : new PerfisNaNuvem());
