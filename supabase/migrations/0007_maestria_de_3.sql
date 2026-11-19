-- ============================================================================
-- Masmorra do Carrasco — a MAESTRIA DE 3 PONTOS (D19, 19/11/2026)
--
-- A Maestria de cada elemento passa de 5 para 3 pontos, com o mesmo ganho por ponto
-- (+2% de dano e +3% de resistência ao elemento). Só o CATÁLOGO muda:
--   • as 7 Maestrias: `ranks` 3, `por_ponto` com as 3 primeiras linhas e a descrição;
--   • a linha 1 do Fogo: `requer_minimo` pede a Maestria 3 (era 5).
--
-- O save NÃO muda: `personagem_valido()` e `saveTorto()` só conferem a forma e o total
-- de pontos. Quem já tinha 4 ou 5 pontos na Maestria do Fogo recebe o excesso de volta
-- ao abrir a árvore no jogo (`ArvoreUI.normalizar`, js/arvore.js).
--
-- Desfazer: rodar de novo os inserts das Maestrias e do Fogo da migration 0005.
-- ============================================================================

update masmorra.habilidades
   set ranks = 3,
       por_ponto = (select coalesce(jsonb_agg(e order by i), '[]'::jsonb)
                      from jsonb_array_elements(por_ponto) with ordinality as t(e, i)
                     where i <= 3),
       descricao = replace(descricao, 'Com 5 pontos', 'Com 3 pontos'),
       atualizado_em = now()
 where tipo = 'maestria';

update masmorra.habilidades
   set requer_minimo = jsonb_set(requer_minimo, '{fogo.maestria}', '3'::jsonb),
       atualizado_em = now()
 where requer_minimo ? 'fogo.maestria';
