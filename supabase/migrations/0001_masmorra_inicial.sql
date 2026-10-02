-- ============================================================================
-- Masmorra do Carrasco — esquema inicial (online nível 1)
--
-- MESMO projeto Supabase do Duel Academy (as contas são as mesmas), mas TUDO
-- daqui mora no schema `masmorra`, separado do `public` de lá. A única ponte
-- com o resto do projeto é `auth.users` — a Masmorra não lê nem escreve
-- nenhuma tabela do Duel Academy, e o Duel Academy não sabe que ela existe.
--
-- COMO DESLIGAR SÓ A MASMORRA (do mais leve ao definitivo):
--   1. update masmorra.config set valor = 'false' where chave = 'ligado';
--      → toda leitura/escrita, os RPCs e os canais ao vivo param na hora.
--   2. Settings → Data API → Exposed schemas: tirar `masmorra`.
--      → a API deixa de enxergar o schema (os canais ao vivo continuam, ver 1).
--   3. drop schema masmorra cascade;
--      → apaga tudo, inclusive as policies do canal ao vivo (dependem de
--        `masmorra.ligado()`). O Duel Academy não perde nada.
--
-- ANTES DE USAR: Settings → Data API → Exposed schemas → acrescentar `masmorra`.
-- Sem isso a API responde 406 ("schema must be one of ...") a tudo daqui.
--
-- Rodar: SQL Editor → New query → colar tudo → Run.
-- ============================================================================

create schema if not exists masmorra;
grant usage on schema masmorra to anon, authenticated;

-- Nada entra por padrão: cada tabela recebe abaixo só o que precisa.
alter default privileges in schema masmorra revoke all on tables from anon, authenticated;
alter default privileges in schema masmorra revoke execute on functions from public;


-- ============================================================================
-- O INTERRUPTOR
-- ============================================================================

create table masmorra.config (
  chave  text primary key,
  valor  jsonb not null
);
insert into masmorra.config (chave, valor) values ('ligado', 'true');

alter table masmorra.config enable row level security;
grant select on masmorra.config to anon, authenticated;
create policy config_todos_leem on masmorra.config for select using (true);

-- Toda policy e todo RPC daqui passam por esta função. É ela que faz o
-- interruptor valer em tudo de uma vez.
create or replace function masmorra.ligado()
returns boolean language sql stable security definer
set search_path = '' as $$
  select coalesce((select (valor #>> '{}')::boolean from masmorra.config where chave = 'ligado'), false);
$$;
grant execute on function masmorra.ligado() to anon, authenticated;


-- ============================================================================
-- JOGADORES — o nome de cada conta DENTRO da Masmorra
--
-- Próprio, e não o `public.perfis` do Duel Academy: lê-lo amarraria um jogo
-- ao outro, e o `drop schema` deixaria de ser limpo.
-- ============================================================================

create table masmorra.jogadores (
  id         uuid primary key references auth.users(id) on delete cascade,
  nome       text not null check (char_length(nome) between 3 and 24),
  criado_em  timestamptz not null default now(),
  visto_em   timestamptz not null default now()
);

alter table masmorra.jogadores enable row level security;
grant select on masmorra.jogadores to authenticated;
-- Todos leem os nomes: é o que aparece sobre os fantasmas e nas mensagens.
create policy jogadores_leitura on masmorra.jogadores
  for select to authenticated using (masmorra.ligado());

/**
 * Entra na Masmorra: cria o jogador na primeira vez e devolve `{id, nome}`.
 * O nome vem do cadastro (`usuario` nos metadados — o mesmo campo que o Duel
 * Academy usa) ou do começo do e-mail. Nome repetido é permitido: o que
 * identifica é o id, e um nome único travaria o primeiro acesso de alguém.
 */
create or replace function masmorra.entrar()
returns masmorra.jogadores language plpgsql security definer
set search_path = '' as $$
declare uid uuid := auth.uid(); j masmorra.jogadores; base text;
begin
  if uid is null then raise exception 'nao autenticado'; end if;
  if not masmorra.ligado() then raise exception 'masmorra desligada'; end if;

  select * into j from masmorra.jogadores where id = uid;
  if found then
    update masmorra.jogadores set visto_em = now() where id = uid returning * into j;
    return j;
  end if;

  select coalesce(nullif(u.raw_user_meta_data->>'usuario', ''), split_part(coalesce(u.email, ''), '@', 1))
    into base from auth.users u where u.id = uid;
  base := left(regexp_replace(coalesce(base, ''), '[^a-zA-Z0-9_ -]', '', 'g'), 24);
  if char_length(base) < 3 then base := 'Morto-vivo'; end if;

  insert into masmorra.jogadores (id, nome) values (uid, base) returning * into j;
  return j;
end;
$$;
grant execute on function masmorra.entrar() to authenticated;

/** Troca o próprio nome. */
create or replace function masmorra.renomear(p_nome text)
returns masmorra.jogadores language plpgsql security definer
set search_path = '' as $$
declare j masmorra.jogadores; v_nome text := trim(coalesce(p_nome, ''));
begin
  if auth.uid() is null then raise exception 'nao autenticado'; end if;
  if not masmorra.ligado() then raise exception 'masmorra desligada'; end if;
  if char_length(v_nome) not between 3 and 24 then raise exception 'o nome precisa ter de 3 a 24 letras'; end if;
  update masmorra.jogadores set nome = v_nome where id = auth.uid() returning * into j;
  return j;
end;
$$;
grant execute on function masmorra.renomear(text) to authenticated;


-- ============================================================================
-- SAVES — o progresso de cada conta (cópia na nuvem do `saves/<id>.json`)
-- ============================================================================

create table masmorra.saves (
  dono           uuid primary key references masmorra.jogadores(id) on delete cascade default auth.uid(),
  dados          jsonb not null check (pg_column_size(dados) < 262144),
  salvo_em       timestamptz not null,
  atualizado_em  timestamptz not null default now()
);

alter table masmorra.saves enable row level security;
grant select, insert, update, delete on masmorra.saves to authenticated;
create policy saves_dono on masmorra.saves for all to authenticated
  using (dono = auth.uid() and masmorra.ligado())
  with check (dono = auth.uid() and masmorra.ligado());


-- ============================================================================
-- MENSAGENS no chão — texto livre, moderado pelos próprios jogadores
--
-- Texto LIVRE (decisão de 01/10/2026). A moderação é por voto: cada jogador
-- dá +1 ou −1 uma vez por mensagem, e a mensagem some de todos quando a nota
-- chega a −3. O autor continua vendo a dele (para não parecer bug).
-- ============================================================================

create table masmorra.mensagens (
  id         bigint generated always as identity primary key,
  autor      uuid not null default auth.uid() references masmorra.jogadores(id) on delete cascade,
  mapa       text not null check (char_length(mapa) between 1 and 40),
  -- abs() < limite também barra NaN e Infinity (no Postgres, NaN é maior que tudo)
  x          real not null check (abs(x) < 10000),
  y          real not null check (abs(y) < 1000),
  z          real not null check (abs(z) < 10000),
  texto      text not null check (char_length(texto) between 1 and 140),
  nota       int not null default 0,
  oculta     boolean not null default false,
  criado_em  timestamptz not null default now()
);
create index mensagens_por_mapa on masmorra.mensagens (mapa, criado_em desc);

alter table masmorra.mensagens enable row level security;
grant select, delete on masmorra.mensagens to authenticated;
create policy mensagens_leitura on masmorra.mensagens for select to authenticated
  using (masmorra.ligado() and (not oculta or autor = auth.uid()));
create policy mensagens_apagar_a_minha on masmorra.mensagens for delete to authenticated
  using (autor = auth.uid());

create table masmorra.avaliacoes (
  mensagem  bigint not null references masmorra.mensagens(id) on delete cascade,
  quem      uuid not null references masmorra.jogadores(id) on delete cascade,
  voto      smallint not null check (voto in (-1, 1)),
  primary key (mensagem, quem)
);
alter table masmorra.avaliacoes enable row level security;
grant select on masmorra.avaliacoes to authenticated;
create policy avaliacoes_as_minhas on masmorra.avaliacoes for select to authenticated
  using (quem = auth.uid());

/**
 * Escreve uma mensagem. Limites: 10 por hora, e cada autor mantém no máximo
 * 30 no mundo (a mais antiga sai). O insert é só por aqui — por isso a tabela
 * não tem grant de insert.
 */
create or replace function masmorra.escrever_mensagem(p_mapa text, p_x real, p_y real, p_z real, p_texto text)
returns masmorra.mensagens language plpgsql security definer
set search_path = '' as $$
declare uid uuid := auth.uid(); m masmorra.mensagens; t text := trim(coalesce(p_texto, ''));
begin
  if uid is null then raise exception 'nao autenticado'; end if;
  if not masmorra.ligado() then raise exception 'masmorra desligada'; end if;
  if char_length(t) not between 1 and 140 then raise exception 'a mensagem precisa ter de 1 a 140 letras'; end if;
  if (select count(*) from masmorra.mensagens where autor = uid and criado_em > now() - interval '1 hour') >= 10 then
    raise exception 'calma: no máximo 10 mensagens por hora';
  end if;

  insert into masmorra.mensagens (autor, mapa, x, y, z, texto)
  values (uid, p_mapa, p_x, p_y, p_z, t) returning * into m;

  delete from masmorra.mensagens where id in (
    select id from masmorra.mensagens where autor = uid order by criado_em desc offset 30);
  return m;
end;
$$;
grant execute on function masmorra.escrever_mensagem(text, real, real, real, text) to authenticated;

/** Vota numa mensagem (+1/−1; votar de novo troca o voto). Devolve a nota nova. */
create or replace function masmorra.avaliar(p_mensagem bigint, p_voto int)
returns int language plpgsql security definer
set search_path = '' as $$
declare uid uuid := auth.uid(); n int;
begin
  if uid is null then raise exception 'nao autenticado'; end if;
  if not masmorra.ligado() then raise exception 'masmorra desligada'; end if;
  if p_voto not in (-1, 1) then raise exception 'voto invalido'; end if;
  if exists (select 1 from masmorra.mensagens where id = p_mensagem and autor = uid) then
    raise exception 'nao da para avaliar a propria mensagem';
  end if;

  insert into masmorra.avaliacoes (mensagem, quem, voto) values (p_mensagem, uid, p_voto)
  on conflict (mensagem, quem) do update set voto = excluded.voto;

  select coalesce(sum(voto), 0) into n from masmorra.avaliacoes where mensagem = p_mensagem;
  update masmorra.mensagens set nota = n, oculta = n <= -3 where id = p_mensagem;
  return n;
end;
$$;
grant execute on function masmorra.avaliar(bigint, int) to authenticated;


-- ============================================================================
-- MORTES — as manchas de sangue dos outros, com os últimos segundos gravados
-- ============================================================================

create table masmorra.mortes (
  id         bigint generated always as identity primary key,
  autor      uuid not null default auth.uid() references masmorra.jogadores(id) on delete cascade,
  mapa       text not null check (char_length(mapa) between 1 and 40),
  -- abs() < limite também barra NaN e Infinity (no Postgres, NaN é maior que tudo)
  x          real not null check (abs(x) < 10000),
  y          real not null check (abs(y) < 1000),
  z          real not null check (abs(z) < 10000),
  causa      text check (char_length(causa) <= 60),
  -- os últimos segundos antes de morrer, no formato de `js/rede/protocolo.js`
  rastro     jsonb not null default '[]' check (pg_column_size(rastro) < 32768),
  criado_em  timestamptz not null default now()
);
create index mortes_por_mapa on masmorra.mortes (mapa, criado_em desc);

alter table masmorra.mortes enable row level security;
grant select on masmorra.mortes to authenticated;
create policy mortes_leitura on masmorra.mortes for select to authenticated using (masmorra.ligado());

/** Registra a morte. No máximo uma a cada 5 s, e cada autor guarda as 20 últimas. */
create or replace function masmorra.registrar_morte(p_mapa text, p_x real, p_y real, p_z real, p_causa text, p_rastro jsonb)
returns bigint language plpgsql security definer
set search_path = '' as $$
declare uid uuid := auth.uid(); novo bigint;
begin
  if uid is null then raise exception 'nao autenticado'; end if;
  if not masmorra.ligado() then raise exception 'masmorra desligada'; end if;
  if exists (select 1 from masmorra.mortes where autor = uid and criado_em > now() - interval '5 seconds') then
    return null;
  end if;
  if jsonb_typeof(coalesce(p_rastro, '[]')) <> 'array' then raise exception 'rastro invalido'; end if;

  insert into masmorra.mortes (autor, mapa, x, y, z, causa, rastro)
  values (uid, p_mapa, p_x, p_y, p_z, left(p_causa, 60), coalesce(p_rastro, '[]'))
  returning id into novo;

  delete from masmorra.mortes where id in (
    select id from masmorra.mortes where autor = uid order by criado_em desc offset 20);
  return novo;
end;
$$;
grant execute on function masmorra.registrar_morte(text, real, real, real, text, jsonb) to authenticated;


-- ============================================================================
-- CANAIS AO VIVO (Realtime) — os fantasmas, e mais tarde o co-op
--
-- Os canais da Masmorra são PRIVADOS (`config.private = true` no join): só
-- entra quem está logado, e só enquanto `masmorra.ligado()`. Os canais
-- públicos do Duel Academy não passam por estas policies e não mudam nada.
-- O tópico é `masmorra:<sala>` — o prefixo é o que separa os dois jogos.
-- ============================================================================

create policy masmorra_canal_ouvir on realtime.messages for select to authenticated
  using (realtime.topic() like 'masmorra:%' and masmorra.ligado());

create policy masmorra_canal_falar on realtime.messages for insert to authenticated
  with check (realtime.topic() like 'masmorra:%' and masmorra.ligado());
