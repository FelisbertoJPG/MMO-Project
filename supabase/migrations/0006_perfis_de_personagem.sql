-- ============================================================================
-- Masmorra do Carrasco — os PERFIS DE PERSONAGEM
--
-- Antes: um personagem por conta (`personagens.dono` era a chave) e um save da
-- Jornada por conta (`saves.dono`). Agora cada conta tem ATÉ 4 PERSONAGENS, e cada
-- um tem os seus dois progressos, que continuam sem se misturar:
--   • `personagens.dados` — o do Mundo online;
--   • `saves`             — o da Jornada (uma linha por personagem).
--
-- **O RECOMEÇO (autorizado pelo dono): esta migration APAGA os dados de
-- `masmorra.personagens` e `masmorra.saves`.** Os logins, `masmorra.jogadores`,
-- as mensagens, as avaliações e as mortes ficam como estão.
--
-- O QUE O CLIENTE PODE FAZER SOZINHO: ler os próprios personagens e gravar neles
-- `dados`, `salvo_em` e `aparencia`. Criar e apagar só pelos RPCs daqui
-- (`criar_personagem`, `apagar_personagem`); id, dono, nome e código são permanentes
-- (o gatilho `personagem_ao_mudar` recusa a troca, venha de quem vier). O limite de 4
-- e o código público saem do gatilho `personagem_ao_criar`: quem insere não escolhe.
--
-- O NOME: de 3 a 16 caracteres, letras e números, sem espaços; letra acentuada vale.
-- O alfabeto é o latino (a-z, 0-9 e o que se decompõe neles: á, ç, ñ...), de propósito:
-- com o cirílico, "а" e "a" seriam nomes diferentes que se leem iguais.
-- A MESMA conta em `js/rede/perfis.js` e em `servidor-mundo.mjs` (`chaveDoNome`):
-- mudou aqui, mude lá.
--
-- O CÓDIGO PÚBLICO (`Kael #7K3F9Q`): 6 caracteres de um alfabeto sem 0, O, 1 e I.
-- Qualquer jogador vê nome e código; só a moderação (SQL Editor) liga o código à conta:
-- a RLS só mostra a linha ao próprio dono.
--
-- ORDEM DE PUBLICAÇÃO: esta migration e o jogo novo têm de ir JUNTOS — o jogo de antes
-- grava em colunas que deixam de existir. Ver o relatório da etapa / `memory_claude/rede-e-mmo.md`.
--
-- Rodar: SQL Editor → New query → colar tudo → Run. (Depende da 0001, 0002 e 0005.)
-- Desfazer (os dados apagados NÃO voltam):
--   drop table masmorra.saves; drop table masmorra.personagens;
--   drop function masmorra.criar_personagem(text, text), masmorra.apagar_personagem(uuid, text),
--     masmorra.nome_disponivel(text), masmorra.personagem_ao_criar(), masmorra.personagem_ao_mudar(),
--     masmorra.novo_codigo(), masmorra.nome_valido(text), masmorra.chave_do_nome(text);
--   e rodar de novo o `create table masmorra.saves` da 0001 e o `create table masmorra.personagens` da 0002.
-- ============================================================================

begin;

-- ============================================================================
-- O RECOMEÇO
-- ============================================================================

drop table masmorra.saves;
drop table masmorra.personagens;


-- ============================================================================
-- O NOME
-- ============================================================================

/**
 * A forma do nome que decide se dois nomes são o mesmo: sem acentos e em minúsculas
 * ("João" e "joao" dão "joao"). O `lower` vem DEPOIS de tirar os acentos: sobrou só
 * ASCII, e o resultado não depende do idioma do banco.
 */
create or replace function masmorra.chave_do_nome(p_nome text)
returns text language sql immutable parallel safe
set search_path = '' as $$
  select lower(regexp_replace(normalize(p_nome, NFD), '[̀-ͯ]', '', 'g'));
$$;
-- as duas rodam dentro do CHECK e da coluna gerada, com os privilégios de quem grava
grant execute on function masmorra.chave_do_nome(text) to authenticated;

/** O nome segue a regra? (ver o cabeçalho) */
create or replace function masmorra.nome_valido(p_nome text)
returns boolean language sql immutable parallel safe
set search_path = '' as $$
  select coalesce(
    p_nome = normalize(p_nome, NFC)
    and char_length(p_nome) between 3 and 16
    and p_nome !~ '[̀-ͯ]'
    and masmorra.chave_do_nome(p_nome) ~ '^[a-z0-9]{3,16}$',
    false);
$$;
grant execute on function masmorra.nome_valido(text) to authenticated;


-- ============================================================================
-- OS PERSONAGENS
-- ============================================================================

create table masmorra.personagens (
  id             uuid primary key default gen_random_uuid(),
  dono           uuid not null references masmorra.jogadores(id) on delete cascade,
  nome           text not null check (masmorra.nome_valido(nome)),
  nome_chave     text generated always as (masmorra.chave_do_nome(nome)) stored,
  codigo         text not null check (codigo ~ '^[2-9A-HJ-NP-Z]{6}$'),
  -- o código da aparência (js/aparencia.js), onde também estão a raça e o sexo
  aparencia      text check (aparencia is null or aparencia ~ '^[0-9][0-9a-f~.]{4,63}$'),
  -- o progresso do MUNDO ONLINE (null = ainda não entrou)
  dados          jsonb
                 check (dados is null or pg_column_size(dados) < 262144)
                 check (dados is null or masmorra.personagem_valido(dados)),
  salvo_em       timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  -- a chave que a tabela `saves` usa para garantir que o save é do dono do personagem
  unique (id, dono)
);

-- O que torna o nome e o código únicos no servidor inteiro
create unique index personagens_nome_unico on masmorra.personagens (nome_chave);
create unique index personagens_codigo_unico on masmorra.personagens (codigo);
create index personagens_do_dono on masmorra.personagens (dono, criado_em);

alter table masmorra.personagens enable row level security;
revoke all on masmorra.personagens from anon, authenticated;
-- De propósito sem `dono`: o jogo não precisa dele e ele não sai pela API.
grant select (id, nome, codigo, aparencia, dados, salvo_em, criado_em, atualizado_em) on masmorra.personagens to authenticated;
grant update (aparencia, dados, salvo_em) on masmorra.personagens to authenticated;
-- Sem grant de INSERT nem de DELETE: criar e apagar são os RPCs abaixo.
create policy personagens_ler on masmorra.personagens for select to authenticated
  using (dono = auth.uid() and masmorra.ligado());
create policy personagens_gravar on masmorra.personagens for update to authenticated
  using (dono = auth.uid() and masmorra.ligado())
  with check (dono = auth.uid() and masmorra.ligado());


-- ============================================================================
-- O CÓDIGO PÚBLICO E AS REGRAS QUE VALEM PARA QUALQUER ESCRITA
-- ============================================================================

/**
 * Um código sorteado de 6 caracteres. 32 letras no alfabeto: cada byte `& 31` escolhe
 * uma sem viés. `gen_random_uuid` é a fonte aleatória que existe sem extensão nenhuma;
 * os bytes 0 a 5 de um UUID v4 são todos sorteados.
 */
create or replace function masmorra.novo_codigo()
returns text language plpgsql volatile
set search_path = '' as $$
declare
  alfabeto constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  bytes bytea := uuid_send(gen_random_uuid());
  saida text := '';
begin
  for i in 0..5 loop
    saida := saida || substr(alfabeto, (get_byte(bytes, i) & 31) + 1, 1);
  end loop;
  return saida;
end;
$$;

/**
 * Antes de criar: o LIMITE DE 4 e o CÓDIGO. A trava por conta faz dois pedidos ao
 * mesmo tempo esperarem na fila, senão os dois contariam 3 e os dois passariam.
 */
create or replace function masmorra.personagem_ao_criar()
returns trigger language plpgsql security definer
set search_path = '' as $$
declare
  candidato text;
begin
  perform pg_advisory_xact_lock(hashtextextended('masmorra.personagens:' || new.dono::text, 0));
  if (select count(*) from masmorra.personagens where dono = new.dono) >= 4 then
    raise exception 'limite_de_personagens';
  end if;
  loop
    candidato := masmorra.novo_codigo();
    exit when not exists (select 1 from masmorra.personagens where codigo = candidato);
  end loop;
  new.codigo := candidato;
  return new;
end;
$$;
create trigger personagem_ao_criar before insert on masmorra.personagens
  for each row execute function masmorra.personagem_ao_criar();

/** Id, dono, nome e código são permanentes. */
create or replace function masmorra.personagem_ao_mudar()
returns trigger language plpgsql
set search_path = '' as $$
begin
  if new.id is distinct from old.id or new.dono is distinct from old.dono
     or new.nome is distinct from old.nome or new.codigo is distinct from old.codigo then
    raise exception 'campo_permanente';
  end if;
  new.atualizado_em := now();
  return new;
end;
$$;
create trigger personagem_ao_mudar before update on masmorra.personagens
  for each row execute function masmorra.personagem_ao_mudar();


-- ============================================================================
-- OS RPCs: CRIAR, APAGAR E PERGUNTAR PELO NOME
-- ============================================================================

/**
 * Cria um personagem da conta logada. Devolve `{id, nome, codigo, aparencia, criado_em}`.
 * Os erros que o jogo traduz para a tela: `nome_invalido`, `nome_em_uso`,
 * `aparencia_invalida` e `limite_de_personagens` (este vem do gatilho).
 */
create or replace function masmorra.criar_personagem(p_nome text, p_aparencia text)
returns jsonb language plpgsql security definer
set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_nome text := normalize(trim(coalesce(p_nome, '')), NFC);
  p masmorra.personagens;
  restricao text;
begin
  if uid is null then raise exception 'nao autenticado'; end if;
  if not masmorra.ligado() then raise exception 'masmorra desligada'; end if;
  if not masmorra.nome_valido(v_nome) then raise exception 'nome_invalido'; end if;
  if p_aparencia is not null and p_aparencia !~ '^[0-9][0-9a-f~.]{4,63}$' then raise exception 'aparencia_invalida'; end if;

  -- o código é sorteado de novo se dois pedidos tirarem o mesmo ao mesmo tempo
  for tentativa in 1..5 loop
    begin
      insert into masmorra.personagens (dono, nome, codigo, aparencia)
      values (uid, v_nome, '222222', p_aparencia)   -- (o gatilho troca o código)
      returning * into p;
      return jsonb_build_object('id', p.id, 'nome', p.nome, 'codigo', p.codigo, 'aparencia', p.aparencia, 'criado_em', p.criado_em);
    exception when unique_violation then
      get stacked diagnostics restricao = constraint_name;
      if restricao = 'personagens_nome_unico' then raise exception 'nome_em_uso'; end if;
      if restricao <> 'personagens_codigo_unico' then raise; end if;
    end;
  end loop;
  raise exception 'nao consegui sortear um codigo livre';
end;
$$;
grant execute on function masmorra.criar_personagem(text, text) to authenticated;

/**
 * Apaga um personagem da conta logada, para sempre, com os dois progressos. `p_nome`
 * é o nome digitado para confirmar. O nome fica livre na hora.
 * Erros: `personagem_nao_encontrado` e `confirmacao_errada`.
 */
create or replace function masmorra.apagar_personagem(p_id uuid, p_nome text)
returns boolean language plpgsql security definer
set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_nome text;
begin
  if uid is null then raise exception 'nao autenticado'; end if;
  if not masmorra.ligado() then raise exception 'masmorra desligada'; end if;
  select nome into v_nome from masmorra.personagens where id = p_id and dono = uid for update;
  if not found then raise exception 'personagem_nao_encontrado'; end if;
  if masmorra.chave_do_nome(normalize(trim(coalesce(p_nome, '')), NFC)) <> masmorra.chave_do_nome(v_nome) then
    raise exception 'confirmacao_errada';
  end if;
  delete from masmorra.personagens where id = p_id and dono = uid;
  return true;
end;
$$;
grant execute on function masmorra.apagar_personagem(uuid, text) to authenticated;

/**
 * Este nome pode ser usado? A tela pergunta enquanto o jogador digita. Só diz sim ou
 * não: quem é o dono do nome a RLS não mostra. Quem garante de verdade é o índice único.
 */
create or replace function masmorra.nome_disponivel(p_nome text)
returns boolean language plpgsql stable security definer
set search_path = '' as $$
declare
  v_nome text := normalize(trim(coalesce(p_nome, '')), NFC);
begin
  if auth.uid() is null then raise exception 'nao autenticado'; end if;
  if not masmorra.ligado() then raise exception 'masmorra desligada'; end if;
  if not masmorra.nome_valido(v_nome) then return false; end if;
  return not exists (select 1 from masmorra.personagens where nome_chave = masmorra.chave_do_nome(v_nome));
end;
$$;
grant execute on function masmorra.nome_disponivel(text) to authenticated;


-- ============================================================================
-- OS SAVES DA JORNADA — um por personagem
--
-- A chave estrangeira dupla (personagem, dono) é o que impede gravar no personagem
-- de outra conta: a linha só existe se aquele personagem for mesmo daquele dono, e a
-- RLS obriga o dono a ser quem está logado.
-- ============================================================================

create table masmorra.saves (
  personagem     uuid primary key,
  dono           uuid not null default auth.uid(),
  dados          jsonb not null check (pg_column_size(dados) < 262144),
  salvo_em       timestamptz not null,
  atualizado_em  timestamptz not null default now(),
  foreign key (personagem, dono) references masmorra.personagens (id, dono) on delete cascade
);

alter table masmorra.saves enable row level security;
revoke all on masmorra.saves from anon, authenticated;
grant select, insert, update, delete on masmorra.saves to authenticated;
create policy saves_dono on masmorra.saves for all to authenticated
  using (dono = auth.uid() and masmorra.ligado())
  with check (dono = auth.uid() and masmorra.ligado());

commit;
