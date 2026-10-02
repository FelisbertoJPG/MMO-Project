-- ============================================================================
-- Masmorra do Carrasco — o PERSONAGEM do Mundo online (MMO) na nuvem
--
-- O servidor de mundo (`servidor-mundo.mjs`) pode rodar numa plataforma que
-- APAGA o disco a cada reinício (o plano grátis do Render). Lá ele não guarda
-- arquivo nenhum (`MUNDO_SAVES=nuvem`), e o personagem de cada conta mora
-- AQUI — lido e gravado pelo próprio jogo (`js/rede/mundo.js`), com o token da
-- conta, como o save da Jornada (`masmorra.saves`, migration 0001).
--
-- São DUAS tabelas de propósito: `saves` é o progresso da Jornada (o mundo só
-- seu); `personagens` é o do mundo de todos. Um não pode sobrescrever o outro.
--
-- Quem protege é a RLS (cada conta só enxerga e grava a própria linha) e
-- `personagem_valido()`, que é o `saveTorto()` do servidor em SQL: confere a
-- FORMA e os LIMITES. Não é à prova de trapaça — quem grava é o cliente —, é o
-- que impede um nível 9999 escrito à mão e um JSON torto de entrarem.
--
-- Rodar: SQL Editor → New query → colar tudo → Run. (Depende da 0001.)
-- Desfazer: drop table masmorra.personagens; drop function masmorra.personagem_valido(jsonb);
-- ============================================================================

/**
 * Este JSON é um save de personagem aceitável? As MESMAS contas do
 * `saveTorto()` em `servidor-mundo.mjs` — mudou lá, mude aqui.
 * Qualquer coisa inesperada (texto onde devia haver número) vale `false`.
 */
create or replace function masmorra.personagem_valido(d jsonb)
returns boolean language plpgsql immutable
set search_path = '' as $$
declare
  j jsonb;
  nivel int; vigor int; endurance int; strength int;
  almas bigint;
begin
  if d is null or jsonb_typeof(d) is distinct from 'object' then return false; end if;
  if (d->>'versao') is distinct from '1' then return false; end if;
  j := d->'jogador';
  if jsonb_typeof(j) is distinct from 'object'
     or jsonb_typeof(d->'inventario') is distinct from 'object'
     or jsonb_typeof(d->'mundo') is distinct from 'object' then
    return false;
  end if;

  nivel := (j->>'nivel')::int;
  vigor := (j->>'vigor')::int;
  endurance := (j->>'endurance')::int;
  strength := (j->>'strength')::int;
  almas := (j->>'almas')::bigint;
  if nivel is null or vigor is null or endurance is null or strength is null or almas is null then return false; end if;
  if nivel not between 1 and 999 then return false; end if;
  if vigor not between 1 and 999 or endurance not between 1 and 999 or strength not between 1 and 999 then return false; end if;
  -- cada nível é um ponto num atributo: os três somam 30 no nível 1
  if vigor + endurance + strength <> 29 + nivel then return false; end if;
  if almas not between 0 and 1000000000 then return false; end if;

  if jsonb_typeof(d->'inventario'->'itens') is distinct from 'array' then return false; end if;
  if jsonb_array_length(d->'inventario'->'itens') > 200 then return false; end if;
  return true;
exception when others then
  return false;
end;
$$;
-- a função roda dentro do CHECK da tabela, com os privilégios de quem grava
grant execute on function masmorra.personagem_valido(jsonb) to authenticated;


create table masmorra.personagens (
  dono           uuid primary key references masmorra.jogadores(id) on delete cascade default auth.uid(),
  dados          jsonb not null
                 check (pg_column_size(dados) < 262144)
                 check (masmorra.personagem_valido(dados)),
  salvo_em       timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

alter table masmorra.personagens enable row level security;
grant select, insert, update, delete on masmorra.personagens to authenticated;
create policy personagens_dono on masmorra.personagens for all to authenticated
  using (dono = auth.uid() and masmorra.ligado())
  with check (dono = auth.uid() and masmorra.ligado());
