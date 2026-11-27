# Orc e Elfo saem do jogo

- **Data:** 2026-11-26 · **Commit:** aa33726 (junto com a saída do `guerreiro.glb`, versão 2026-11-26.1) · **Área:** `aparencia-e-racas`
- **Decidido:** Orc e Elfo ficam com `jogavel: false`. Uma raça sem corpo próprio vira Humano do mesmo sexo (`racaQueExiste`, `raca.js`), e o save não muda.
- **Por quê:** nenhuma das duas tem corpo próprio entre os corpos de arquivo. Elas dependiam do `guerreiro.glb`, que saiu no mesmo commit. O dono disse: "o que importa são os 2 modelos do online, o masculino e o feminino; o resto era beta e teste".
- **Descartado:** refazer Orc e Elfo nos corpos novos agora. Não ficou registrado se elas voltam depois.
- **O que muda:** raça é sempre `racaDe(a.raca, a.sexo)`, e quem jogava de Orc ou Elfo aparece como Humano. A ordem das raças no save não muda: raça nova entra no FIM. A regra está no `CLAUDE.md` (Personagem) e em `memory_claude/aparencia-e-racas.md`.
