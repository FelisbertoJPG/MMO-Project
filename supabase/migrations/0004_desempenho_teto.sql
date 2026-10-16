-- ============================================================================
-- Masmorra do Carrasco — o relatório de desempenho com TETO (depois da 0003)
--
-- A chave de envio do jogo é pública: no teto da 0003 (600 por hora × 48 KB) alguém
-- mal-intencionado encheria os 500 MB do plano grátis — que é o MESMO banco do Duel
-- Academy — em ~17 h. No uso normal um relatório tem ~7 KB. Aqui:
--   • a tabela inteira não passa de 30 MB (cheia, o registro novo é descartado);
--   • no máximo 200 por hora no total, 12 por sessão, 40 KB cada;
--   • um INTERRUPTOR só do relatório: `masmorra.config`, chave 'desempenho'
--       desligar: insert into masmorra.config values ('desempenho', 'false')
--                   on conflict (chave) do update set valor = excluded.valor;
--       religar:  update masmorra.config set valor = 'true' where chave = 'desempenho';
--   • LIMPAR tudo com a chave de leitura: `limpar_desempenho(chave)` — ou
--       node ferramentas/desempenho/ler.mjs --limpar
--     (no SQL Editor: truncate masmorra.desempenho;)
--
-- Rodar: SQL Editor → New query → colar tudo → Run.
-- ============================================================================

create or replace function masmorra.registrar_desempenho(p jsonb)
returns void language plpgsql security definer
set search_path = '' as $$
declare
  s text := left(p->>'sessao', 40);
  t text := p->>'tipo';
begin
  if not masmorra.ligado() then return; end if;
  if coalesce((select (valor #>> '{}')::boolean from masmorra.config where chave = 'desempenho'), true) is false then return; end if;
  if s is null or length(s) < 4 or t not in ('jogo', 'erro', 'caiu') then return; end if;
  if octet_length(p::text) > 40000 then return; end if;
  if pg_total_relation_size('masmorra.desempenho') > 30 * 1024 * 1024 then return; end if;
  if (select count(*) from masmorra.desempenho where sessao = s) >= 12 then return; end if;
  if (select count(*) from masmorra.desempenho where criado > now() - interval '1 hour') >= 200 then return; end if;
  delete from masmorra.desempenho where criado < now() - interval '30 days';
  insert into masmorra.desempenho (sessao, tipo, versao, modo, qualidade, gpu, aparelho, fps, cpu, chamadas, dados)
  values (s, t, left(p->>'versao', 40), left(p->>'modo', 12), left(p->>'qualidade', 20), left(p->>'gpu', 200),
          left(p->>'aparelho', 500), (p->>'fps')::real, (p->>'cpu')::real, (p->>'chamadas')::int,
          case when jsonb_typeof(p->'dados') = 'object' then p->'dados' else '{}'::jsonb end);
exception when others then
  return;
end $$;

/** Apaga TODOS os registros — só com a chave de leitura certa. Devolve quantos saíram. */
create or replace function masmorra.limpar_desempenho(p_chave text)
returns bigint language plpgsql security definer
set search_path = '' as $$
declare n bigint;
begin
  if not exists (select 1 from masmorra.segredos s where s.chave = 'leitura_desempenho' and s.valor = p_chave and length(p_chave) >= 16) then
    return -1;
  end if;
  delete from masmorra.desempenho;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function masmorra.limpar_desempenho(text) to anon, authenticated;
