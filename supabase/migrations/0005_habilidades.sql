-- ============================================================================
-- Masmorra do Carrasco — o CATÁLOGO das habilidades e a validação do save novo
--
-- Três tabelas de catálogo, que o jogo só LÊ (o dono as edita por um editor
-- próprio, com a chave de serviço; o cliente não tem grant de escrita):
--   • `elementos`   — os 7 elementos;
--   • `habilidades` — as Maestrias dos 7 e a árvore do Fogo (os outros elementos
--                     entram depois, um de cada vez);
--   • `reacoes`     — as 21 reações, só como REGISTRO: `tem_efeito_no_jogo` fica
--                     false até o jogo as implementar.
--
-- E troca `masmorra.personagem_valido()` pela versão da ficha 3 (js/ficha.js):
-- os atributos não precisam mais somar 29 + nível, e `jogador.habilidades` é
-- conferido. Saves de antes (sem o campo) continuam valendo.
--
-- ORDEM DE PUBLICAÇÃO: tanto faz rodar antes ou depois de publicar o jogo. O jogo
-- novo continua gravando os três atributos com a soma antiga (ficha.js,
-- `atributosDeCompatibilidade`), então passa na função de antes; e esta função
-- aceita o save do jogo de antes.
--
-- Rodar: SQL Editor → New query → colar tudo → Run. (Depende da 0001 e da 0002.)
-- Desfazer: drop table masmorra.reacoes, masmorra.habilidades, masmorra.elementos;
--           e rodar de novo o `create or replace function` de personagem_valido da 0002.
-- ============================================================================


-- ============================================================================
-- OS ELEMENTOS
-- ============================================================================

create table masmorra.elementos (
  id             text primary key check (id ~ '^[a-z][a-z0-9_]{0,29}$'),
  nome           text not null,
  cor            text not null check (cor ~ '^#[0-9a-fA-F]{6}$'),
  identidade     text not null default '',
  ordem          int not null default 0,      -- a ordem de mostrar
  atualizado_em  timestamptz not null default now()
);

alter table masmorra.elementos enable row level security;
revoke all on masmorra.elementos from anon, authenticated;
grant select on masmorra.elementos to authenticated;
create policy elementos_leitura on masmorra.elementos for select to authenticated
  using (masmorra.ligado());


-- ============================================================================
-- AS HABILIDADES
--
-- `linha`: 0 = a base da árvore (a Maestria); de 1 a 3, as linhas de escolhas.
-- `requer`: ids das habilidades de que esta NASCE; basta 1 ponto em UMA delas.
--   Nascer de outra não é substituir: as duas ficam disponíveis (a Rajada de Fogo
--   nasce da Bola de Fogo, e o jogador continua com a Bola).
-- `requer_minimo`: { id: pontos } que precisam estar gastos (a linha 1 pede a Maestria 5).
-- `efeitos`: [{ stat, op, valor }] por ponto, para o jogo calcular.
-- `por_ponto`: o texto de cada ponto, na ordem.
-- `ativa`: os dados da habilidade que se usa (forma, éter, recarga...); null na passiva.
-- ============================================================================

create table masmorra.habilidades (
  id             text primary key check (id ~ '^[a-z][a-z0-9_.-]{0,59}$'),
  elemento       text not null references masmorra.elementos(id) on update cascade,
  nome           text not null,
  coluna         text not null check (coluna in ('base', 'magia', 'defesa', 'arma')),
  tipo           text not null check (tipo in ('maestria', 'ativa', 'passiva', 'suprema')),
  linha          int not null default 0 check (linha >= 0),
  ordem          int not null default 0,
  ranks          int not null default 1 check (ranks >= 1),
  custo          int not null default 1 check (custo >= 1),
  requer         jsonb not null default '[]'::jsonb check (jsonb_typeof(requer) = 'array'),
  requer_minimo  jsonb not null default '{}'::jsonb check (jsonb_typeof(requer_minimo) = 'object'),
  efeitos        jsonb not null default '[]'::jsonb check (jsonb_typeof(efeitos) = 'array'),
  por_ponto      jsonb not null default '[]'::jsonb check (jsonb_typeof(por_ponto) = 'array'),
  descricao      text not null default '',
  ativa          jsonb check (ativa is null or jsonb_typeof(ativa) = 'object'),
  atualizado_em  timestamptz not null default now()
);
create index habilidades_do_elemento on masmorra.habilidades (elemento, linha, ordem);

alter table masmorra.habilidades enable row level security;
revoke all on masmorra.habilidades from anon, authenticated;
grant select on masmorra.habilidades to authenticated;
create policy habilidades_leitura on masmorra.habilidades for select to authenticated
  using (masmorra.ligado());


-- ============================================================================
-- AS REAÇÕES — só o registro: nenhuma tem efeito no jogo ainda
-- ============================================================================

create table masmorra.reacoes (
  id                  text primary key check (id ~ '^[a-z][a-z0-9_.-]{0,59}$'),
  nome                text not null,
  elemento_a          text not null references masmorra.elementos(id) on update cascade,
  elemento_b          text not null references masmorra.elementos(id) on update cascade,
  efeito              jsonb not null default '{}'::jsonb check (jsonb_typeof(efeito) = 'object'),
  descricao           text not null default '',
  tem_efeito_no_jogo  boolean not null default false,
  atualizado_em       timestamptz not null default now(),
  check (elemento_a <> elemento_b)
);

alter table masmorra.reacoes enable row level security;
revoke all on masmorra.reacoes from anon, authenticated;
grant select on masmorra.reacoes to authenticated;
create policy reacoes_leitura on masmorra.reacoes for select to authenticated
  using (masmorra.ligado());


-- ============================================================================
-- OS DADOS INICIAIS
-- ============================================================================

insert into masmorra.elementos (id, nome, cor, identidade, ordem) values
  ('fogo', 'Fogo', '#ff6a30', 'Dano contínuo e explosões', 1),
  ('agua', 'Água', '#3f9bff', 'Sustento, empurrão e controle de espaço', 2),
  ('terra', 'Terra', '#a9793f', 'Quebra de postura e defesa', 3),
  ('vento', 'Vento', '#9fe8c8', 'Mobilidade, alcance e velocidade', 4),
  ('luz', 'Luz', '#ffe9a8', 'Cura, proteção e dano contra mortos-vivos', 5),
  ('trevas', 'Trevas', '#7a4fc0', 'Roubo de vida, maldições e risco por recompensa', 6),
  ('eletrico', 'Elétrico', '#d9f25c', 'Velocidade, atordoamento e saltos entre alvos', 7);

-- A Maestria de cada elemento: 5 pontos, +2% de dano e +3% de resistência por ponto
-- (a do Fogo vem junto com a árvore dele, logo abaixo)
insert into masmorra.habilidades (id, elemento, nome, coluna, tipo, linha, ordem, ranks, custo, requer, requer_minimo, efeitos, por_ponto, descricao, ativa) values
  ('agua.maestria', 'agua', 'Maestria da Água', 'base', 'maestria', 0, 1, 5, 1, '[]'::jsonb, '{}'::jsonb, '[{"stat":"dano.agua","op":"mul","valor":0.02},{"stat":"resist.agua","op":"soma","valor":0.03}]'::jsonb, '["+2% de dano e +3% de resistência à água","+4% de dano e +6% de resistência à água","+6% de dano e +9% de resistência à água","+8% de dano e +12% de resistência à água","+10% de dano e +15% de resistência à água"]'::jsonb, 'Treinar a água aumenta o dano e a resistência à água. Com 5 pontos, abre Manipular, Defesa e Imbuir.', null),
  ('terra.maestria', 'terra', 'Maestria da Terra', 'base', 'maestria', 0, 1, 5, 1, '[]'::jsonb, '{}'::jsonb, '[{"stat":"dano.terra","op":"mul","valor":0.02},{"stat":"resist.terra","op":"soma","valor":0.03}]'::jsonb, '["+2% de dano e +3% de resistência à terra","+4% de dano e +6% de resistência à terra","+6% de dano e +9% de resistência à terra","+8% de dano e +12% de resistência à terra","+10% de dano e +15% de resistência à terra"]'::jsonb, 'Treinar a terra aumenta o dano e a resistência à terra. Com 5 pontos, abre Manipular, Defesa e Imbuir.', null),
  ('vento.maestria', 'vento', 'Maestria do Vento', 'base', 'maestria', 0, 1, 5, 1, '[]'::jsonb, '{}'::jsonb, '[{"stat":"dano.vento","op":"mul","valor":0.02},{"stat":"resist.vento","op":"soma","valor":0.03}]'::jsonb, '["+2% de dano e +3% de resistência ao vento","+4% de dano e +6% de resistência ao vento","+6% de dano e +9% de resistência ao vento","+8% de dano e +12% de resistência ao vento","+10% de dano e +15% de resistência ao vento"]'::jsonb, 'Treinar o vento aumenta o dano e a resistência ao vento. Com 5 pontos, abre Manipular, Defesa e Imbuir.', null),
  ('luz.maestria', 'luz', 'Maestria da Luz', 'base', 'maestria', 0, 1, 5, 1, '[]'::jsonb, '{}'::jsonb, '[{"stat":"dano.luz","op":"mul","valor":0.02},{"stat":"resist.luz","op":"soma","valor":0.03}]'::jsonb, '["+2% de dano e +3% de resistência à luz","+4% de dano e +6% de resistência à luz","+6% de dano e +9% de resistência à luz","+8% de dano e +12% de resistência à luz","+10% de dano e +15% de resistência à luz"]'::jsonb, 'Treinar a luz aumenta o dano e a resistência à luz. Com 5 pontos, abre Manipular, Defesa e Imbuir.', null),
  ('trevas.maestria', 'trevas', 'Maestria das Trevas', 'base', 'maestria', 0, 1, 5, 1, '[]'::jsonb, '{}'::jsonb, '[{"stat":"dano.trevas","op":"mul","valor":0.02},{"stat":"resist.trevas","op":"soma","valor":0.03}]'::jsonb, '["+2% de dano e +3% de resistência às trevas","+4% de dano e +6% de resistência às trevas","+6% de dano e +9% de resistência às trevas","+8% de dano e +12% de resistência às trevas","+10% de dano e +15% de resistência às trevas"]'::jsonb, 'Treinar as trevas aumenta o dano e a resistência às trevas. Com 5 pontos, abre Manipular, Defesa e Imbuir.', null),
  ('eletrico.maestria', 'eletrico', 'Maestria da Eletricidade', 'base', 'maestria', 0, 1, 5, 1, '[]'::jsonb, '{}'::jsonb, '[{"stat":"dano.eletrico","op":"mul","valor":0.02},{"stat":"resist.eletrico","op":"soma","valor":0.03}]'::jsonb, '["+2% de dano e +3% de resistência à eletricidade","+4% de dano e +6% de resistência à eletricidade","+6% de dano e +9% de resistência à eletricidade","+8% de dano e +12% de resistência à eletricidade","+10% de dano e +15% de resistência à eletricidade"]'::jsonb, 'Treinar a eletricidade aumenta o dano e a resistência à eletricidade. Com 5 pontos, abre Manipular, Defesa e Imbuir.', null);

-- A árvore do Fogo: a base e as 3 linhas
insert into masmorra.habilidades (id, elemento, nome, coluna, tipo, linha, ordem, ranks, custo, requer, requer_minimo, efeitos, por_ponto, descricao, ativa) values
  ('fogo.maestria', 'fogo', 'Maestria do Fogo', 'base', 'maestria', 0, 1, 5, 1, '[]'::jsonb, '{}'::jsonb, '[{"stat":"dano.fogo","op":"mul","valor":0.02},{"stat":"resist.fogo","op":"soma","valor":0.03}]'::jsonb, '["+2% de dano e +3% de resistência ao fogo","+4% de dano e +6% de resistência ao fogo","+6% de dano e +9% de resistência ao fogo","+8% de dano e +12% de resistência ao fogo","+10% de dano e +15% de resistência ao fogo"]'::jsonb, 'Treinar o fogo aumenta o dano e a resistência às chamas. Com 5 pontos, abre Manipular, Defesa e Imbuir.', null),
  ('fogo.bola', 'fogo', 'Bola de Fogo', 'magia', 'ativa', 1, 1, 3, 1, '[]'::jsonb, '{"fogo.maestria":5}'::jsonb, '[]'::jsonb, '["35 de dano","42 de dano","50 de dano"]'::jsonb, 'Projétil que acende o alvo.', '{"forma":"orb","marca":"fogo","alcance":15,"eter":20,"recarga":3,"clip":"cast"}'::jsonb),
  ('fogo.pele', 'fogo', 'Pele de Brasa', 'defesa', 'passiva', 1, 2, 3, 1, '[]'::jsonb, '{"fogo.maestria":5}'::jsonb, '[]'::jsonb, '["Queima por 1 s","Queima por 2 s","Queima por 3 s"]'::jsonb, 'Quem acerta você corpo a corpo começa a queimar.', null),
  ('fogo.imbuir', 'fogo', 'Imbuir Chamas', 'arma', 'ativa', 1, 3, 3, 1, '[]'::jsonb, '{"fogo.maestria":5}'::jsonb, '[]'::jsonb, '["Dura 20 s","Dura 25 s","Dura 30 s"]'::jsonb, 'A arma causa dano de fogo e 15% a mais.', '{"forma":"imbuir","marca":"fogo","eter":25,"recarga":30,"clip":"cast"}'::jsonb),
  ('fogo.rajada', 'fogo', 'Rajada de Fogo', 'magia', 'ativa', 2, 1, 3, 1, '["fogo.bola"]'::jsonb, '{}'::jsonb, '[]'::jsonb, '["3 bolas em leque","4 bolas em leque","5 bolas em leque"]'::jsonb, 'Dispara uma rajada de bolas menores, com 18 de dano cada. Nasce da Bola de Fogo e fica disponível junto com ela.', '{"forma":"orb","marca":"fogo","alcance":13,"eter":30,"recarga":5,"clip":"cast"}'::jsonb),
  ('fogo.cinzas', 'fogo', 'Cinzas Protetoras', 'defesa', 'passiva', 2, 2, 3, 1, '["fogo.pele"]'::jsonb, '{}'::jsonb, '[]'::jsonb, '["-4% de dano recebido","-8% de dano recebido","-12% de dano recebido"]'::jsonb, 'Vale enquanto houver um inimigo queimando perto de você.', null),
  ('fogo.golpe', 'fogo', 'Golpe Flamejante', 'arma', 'passiva', 2, 3, 3, 1, '["fogo.imbuir"]'::jsonb, '{}'::jsonb, '[]'::jsonb, '["Onda de 20 de dano","Onda de 30 de dano","Onda de 40 de dano"]'::jsonb, 'Com a arma imbuída, o golpe pesado solta uma onda de fogo.', null),
  ('fogo.sol', 'fogo', 'Sol Caído', 'magia', 'suprema', 3, 1, 1, 3, '["fogo.rajada"]'::jsonb, '{}'::jsonb, '[]'::jsonb, '["160 de dano em área"]'::jsonb, 'Uma esfera de fogo cai do céu.', '{"forma":"bomb","marca":"fogo","raio":7,"alcance":14,"eter":80,"recarga":60,"conjuracao":1.2,"clip":"summon","suprema":true}'::jsonb),
  ('fogo.avatar', 'fogo', 'Avatar de Brasa', 'defesa', 'suprema', 3, 2, 1, 3, '["fogo.cinzas"]'::jsonb, '{}'::jsonb, '[]'::jsonb, '["-30% de dano por 15 s"]'::jsonb, 'Vira chamas vivas e queima quem estiver perto.', '{"forma":"imbuir","marca":"fogo","duracao":15,"eter":80,"recarga":75,"clip":"summon","suprema":true}'::jsonb),
  ('fogo.danca', 'fogo', 'Dança das Chamas', 'arma', 'suprema', 3, 3, 1, 3, '["fogo.golpe"]'::jsonb, '{}'::jsonb, '[]'::jsonb, '["6 golpes de 30 de dano"]'::jsonb, 'Sequência rápida de cortes em chamas.', '{"forma":"linha","marca":"fogo","alcance":6,"eter":80,"recarga":60,"clip":"cast","suprema":true}'::jsonb);

-- As 21 reações (`tem_efeito_no_jogo` fica no padrão: false)
insert into masmorra.reacoes (id, nome, elemento_a, elemento_b, efeito, descricao) values
  ('vaporizacao', 'Vaporização', 'fogo', 'agua', '{"tipo":"dano_multiplicado","mult":1.5}'::jsonb, 'O golpe que dispara a reação causa 50% a mais.'),
  ('fundicao', 'Fundição', 'fogo', 'terra', '{"tipo":"vulneravel","dano_recebido":1.2,"duracao":6,"postura":30}'::jsonb, 'O alvo recebe 20% a mais de dano por 6 s e perde postura.'),
  ('labareda', 'Labareda', 'fogo', 'vento', '{"tipo":"espalhar_queimadura","raio":4,"duracao":3}'::jsonb, 'A queimadura salta para os inimigos em volta.'),
  ('atoleiro', 'Atoleiro', 'agua', 'terra', '{"tipo":"lentidao_em_area","raio":3,"velocidade":0.6,"duracao":5}'::jsonb, 'O chão vira lama e deixa os inimigos 40% mais lentos.'),
  ('geada', 'Geada', 'agua', 'vento', '{"tipo":"congelar","duracao":1.5,"vira_postura":60}'::jsonb, 'Congela o alvo por 1,5 s. Em chefe, tira postura.'),
  ('cegueira', 'Cegueira', 'terra', 'vento', '{"tipo":"ataca_menos","pausa_entre_ataques":1.5,"duracao":5,"vira_postura":40}'::jsonb, 'A areia nos olhos deixa o alvo 50% mais lento para atacar.'),
  ('purgacao', 'Purgação', 'fogo', 'luz', '{"tipo":"queimadura_forte","mult":2,"duracao":4}'::jsonb, 'A queimadura causa o dobro de dano por 4 s.'),
  ('consagracao', 'Consagração', 'agua', 'luz', '{"tipo":"cura_em_area","cura":30,"raio":5}'::jsonb, 'Cura 30 de vida dos aliados em volta.'),
  ('egide', 'Égide', 'terra', 'luz', '{"tipo":"escudo","absorve":40,"duracao":8}'::jsonb, 'Um escudo de cristal absorve 40 de dano por 8 s.'),
  ('refracao', 'Refração', 'vento', 'luz', '{"tipo":"perde_alvo","duracao":2,"raio":4,"vira_postura":30}'::jsonb, 'Os inimigos em volta perdem o alvo por 2 s.'),
  ('fulgor', 'Fulgor', 'eletrico', 'luz', '{"tipo":"atordoar_em_area","duracao":1,"raio":4,"vira_postura":50}'::jsonb, 'Um clarão atordoa os inimigos em volta por 1 s.'),
  ('caos', 'Caos', 'luz', 'trevas', '{"tipo":"dano_puro","mult":1.8,"ignora_resistencia":true}'::jsonb, 'PROVISÓRIO: o golpe causa 80% a mais e ignora as resistências do alvo. O dono vai trazer a ideia desta reação.'),
  ('chama_negra', 'Chama Negra', 'fogo', 'trevas', '{"tipo":"dano_por_segundo","dps":15,"duracao":5}'::jsonb, 'Chamas negras causam 15 de dano por segundo durante 5 s.'),
  ('corrupcao', 'Corrupção', 'agua', 'trevas', '{"tipo":"veneno","dps":10,"duracao":8}'::jsonb, 'O veneno causa 10 de dano por segundo durante 8 s.'),
  ('sepultamento', 'Sepultamento', 'terra', 'trevas', '{"tipo":"imobilizar","duracao":1.5,"vira_postura":60}'::jsonb, 'Mãos de pedra prendem o alvo por 1,5 s. Em chefe, tiram postura.'),
  ('pavor', 'Pavor', 'vento', 'trevas', '{"tipo":"medo","duracao":2,"vira_postura":40}'::jsonb, 'O alvo foge apavorado por 2 s. Em chefe, perde postura.'),
  ('drenagem', 'Drenagem', 'eletrico', 'trevas', '{"tipo":"ganha_eter","eter":15,"postura":20}'::jsonb, 'Rouba a energia do alvo: devolve 15 de Éter.'),
  ('detonacao', 'Detonação', 'fogo', 'eletrico', '{"tipo":"explosao","dano":40,"raio":3.5,"postura":35}'::jsonb, 'A marca explode e causa 40 de dano em volta do alvo.'),
  ('conducao', 'Condução', 'agua', 'eletrico', '{"tipo":"dano_em_cadeia","dano":25,"raio":6,"saltos":3}'::jsonb, 'A descarga salta para até 3 inimigos próximos.'),
  ('magnetismo', 'Magnetismo', 'terra', 'eletrico', '{"tipo":"puxar","raio":5,"postura":25}'::jsonb, 'Os inimigos em volta são puxados para o alvo.'),
  ('trovoada', 'Trovoada', 'vento', 'eletrico', '{"tipo":"atordoar","duracao":0.8,"empurrao":4,"vira_postura":45}'::jsonb, 'O trovão atordoa o alvo por 0,8 s e o empurra.');


-- ============================================================================
-- A VALIDAÇÃO DO SAVE
-- ============================================================================

/**
 * Este JSON é um save de personagem aceitável? As MESMAS contas do
 * `saveTorto()` em `servidor-mundo.mjs` — mudou lá, mude aqui.
 * Qualquer coisa inesperada (texto onde devia haver número) vale `false`.
 *
 * `jogador.habilidades` é opcional (save sem o campo = árvore vazia). Quando vem:
 * { v: 1, nos: { id: pontos gastos }, barra: [4 vagas, cada uma um id ou null] },
 * e a soma dos pontos gastos não passa de nível - 1.
 */
create or replace function masmorra.personagem_valido(d jsonb)
returns boolean language plpgsql immutable
set search_path = '' as $$
declare
  id_valido constant text := '^[a-z][a-z0-9_.-]{0,59}$';
  j jsonb; inv jsonb; h jsonb; v jsonb;
  k text;
  n numeric;
  nivel numeric;
  gastos numeric := 0;
begin
  if d is null or jsonb_typeof(d) is distinct from 'object' then return false; end if;
  if d->'versao' is distinct from '1'::jsonb then return false; end if;
  j := d->'jogador';
  inv := d->'inventario';
  if jsonb_typeof(j) is distinct from 'object'
     or jsonb_typeof(inv) is distinct from 'object'
     or jsonb_typeof(d->'mundo') is distinct from 'object' then
    return false;
  end if;

  -- o nível e os três atributos, que só existem por compatibilidade (ficha.js):
  -- a soma deixou de ser exigida, só o limite continua
  foreach k in array array['nivel', 'vigor', 'endurance', 'strength'] loop
    if jsonb_typeof(j->k) is distinct from 'number' then return false; end if;
    n := (j->>k)::numeric;
    if n <> trunc(n) or n not between 1 and 999 then return false; end if;
  end loop;
  nivel := (j->>'nivel')::numeric;

  if jsonb_typeof(j->'almas') is distinct from 'number' then return false; end if;
  n := (j->>'almas')::numeric;
  if n <> trunc(n) or n not between 0 and 1000000000 then return false; end if;

  -- a árvore de habilidades: save sem o campo vale como árvore vazia
  h := j->'habilidades';
  if h is not null then
    if jsonb_typeof(h) is distinct from 'object'
       or h->'v' is distinct from '1'::jsonb
       or jsonb_typeof(h->'nos') is distinct from 'object'
       or jsonb_typeof(h->'barra') is distinct from 'array' then
      return false;
    end if;
    if jsonb_array_length(h->'barra') <> 4 then return false; end if;
    for v in select value from jsonb_array_elements(h->'barra') loop
      if jsonb_typeof(v) = 'null' then continue; end if;
      if jsonb_typeof(v) is distinct from 'string' or (v #>> '{}') !~ id_valido then return false; end if;
    end loop;
    for k, v in select key, value from jsonb_each(h->'nos') loop
      if k !~ id_valido or jsonb_typeof(v) is distinct from 'number' then return false; end if;
      n := (v #>> '{}')::numeric;
      if n <> trunc(n) or n not between 1 and 999 then return false; end if;
      gastos := gastos + n;
    end loop;
    if gastos > nivel - 1 then return false; end if;
  end if;

  if jsonb_typeof(inv->'itens') is distinct from 'array' then return false; end if;
  if jsonb_array_length(inv->'itens') > 200 then return false; end if;
  for v in select value from jsonb_array_elements(inv->'itens') loop
    if jsonb_typeof(v) is distinct from 'array'
       or jsonb_typeof(v->0) is distinct from 'string'
       or jsonb_typeof(v->1) is distinct from 'number' then
      return false;
    end if;
    if length(v->>0) > 40 then return false; end if;
    n := (v->>1)::numeric;
    if n <> trunc(n) or n not between 0 and 999 then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;
-- a função roda dentro do CHECK da tabela, com os privilégios de quem grava
grant execute on function masmorra.personagem_valido(jsonb) to authenticated;
