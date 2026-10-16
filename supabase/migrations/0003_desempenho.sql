-- ============================================================================
-- Masmorra do Carrasco — o RELATÓRIO AUTOMÁTICO DE DESEMPENHO (js/telemetria.js)
--
-- O jogo manda sozinho, sem conta e sem clique, como roda em cada aparelho:
--   • 'jogo' — o relatório do monitor (90 s de partida, depois a cada 10 min, e ao fechar);
--   • 'erro' — a abertura que deu erro, ou a placa que ficou sem memória;
--   • 'caiu' — a página que MORREU à vista (o Safari mata a aba que passa da memória): a
--              abertura seguinte acha o rastro e o manda.
-- Nada de conta, nome nem endereço: `sessao` é sorteada por aba. O `aparelho` é o
-- userAgent do navegador, os núcleos, a memória e a tela.
--
-- Ninguém lê nem grava a tabela direto: grava-se por `registrar_desempenho()` (com
-- limites: a chave do jogo é pública) e lê-se por `ler_desempenho(chave)`, com a chave
-- de leitura guardada em `masmorra.segredos` (sem grant nenhum: só o SQL Editor a vê).
-- Quem lê é `ferramentas/desempenho/ler.mjs`.
--
-- Rodar: SQL Editor → New query → colar tudo → Run. (Depende da 0001.) Depois, a chave
-- de leitura (a MESMA do arquivo `ferramentas/desempenho/chave.txt`, que fica fora do git):
--   insert into masmorra.segredos values ('leitura_desempenho', '<a chave>')
--     on conflict (chave) do update set valor = excluded.valor;
-- Desfazer: drop function masmorra.registrar_desempenho(jsonb);
--           drop function masmorra.ler_desempenho(text, timestamptz, int);
--           drop table masmorra.desempenho; drop table masmorra.segredos;
-- ============================================================================

create table masmorra.desempenho (
  id bigint generated always as identity primary key,
  criado timestamptz not null default now(),
  sessao text not null,
  tipo text not null check (tipo in ('jogo', 'erro', 'caiu')),
  versao text, modo text, qualidade text, gpu text, aparelho text,
  fps real, cpu real, chamadas int,
  dados jsonb not null default '{}'::jsonb
);
create index desempenho_criado on masmorra.desempenho (criado desc);
create index desempenho_sessao on masmorra.desempenho (sessao);
alter table masmorra.desempenho enable row level security;   -- sem policy: só pelos RPCs

create table if not exists masmorra.segredos (chave text primary key, valor text not null);
alter table masmorra.segredos enable row level security;

/**
 * Grava um registro. Tudo o que vem é conferido e cortado; o que não serve é DESCARTADO em
 * silêncio (o jogo não espera resposta). No máximo 20 por sessão e 600 por hora no total; o
 * que tem mais de 30 dias sai.
 */
create or replace function masmorra.registrar_desempenho(p jsonb)
returns void language plpgsql security definer
set search_path = '' as $$
declare
  s text := left(p->>'sessao', 40);
  t text := p->>'tipo';
begin
  if not masmorra.ligado() then return; end if;
  if s is null or length(s) < 4 or t not in ('jogo', 'erro', 'caiu') then return; end if;
  if octet_length(p::text) > 48000 then return; end if;
  if (select count(*) from masmorra.desempenho where sessao = s) >= 20 then return; end if;
  if (select count(*) from masmorra.desempenho where criado > now() - interval '1 hour') >= 600 then return; end if;
  delete from masmorra.desempenho where criado < now() - interval '30 days';
  insert into masmorra.desempenho (sessao, tipo, versao, modo, qualidade, gpu, aparelho, fps, cpu, chamadas, dados)
  values (s, t, left(p->>'versao', 40), left(p->>'modo', 12), left(p->>'qualidade', 20), left(p->>'gpu', 200),
          left(p->>'aparelho', 500), (p->>'fps')::real, (p->>'cpu')::real, (p->>'chamadas')::int,
          case when jsonb_typeof(p->'dados') = 'object' then p->'dados' else '{}'::jsonb end);
exception when others then
  return;
end $$;
grant execute on function masmorra.registrar_desempenho(jsonb) to anon, authenticated;

/** Lê os registros, do mais novo ao mais velho — só com a chave de leitura certa. */
create or replace function masmorra.ler_desempenho(p_chave text, p_desde timestamptz default now() - interval '7 days', p_limite int default 300)
returns setof masmorra.desempenho language sql stable security definer
set search_path = '' as $$
  select d.* from masmorra.desempenho d
  where exists (select 1 from masmorra.segredos s where s.chave = 'leitura_desempenho' and s.valor = p_chave and length(p_chave) >= 16)
    and d.criado >= p_desde
  order by d.criado desc
  limit least(greatest(p_limite, 1), 2000);
$$;
grant execute on function masmorra.ler_desempenho(text, timestamptz, int) to anon, authenticated;
