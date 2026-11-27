# O guerreiro.glb sai do jogo; dele só fica o ESQUELETO

- **Data:** 2026-11-26 · **Commit:** aa33726 (versão 2026-11-26.1) · **Área:** `corpo-e-animacao`
- **Decidido:** o `guerreiro.glb` sai. Dele só fica `assets/corpos/esqueleto.glb`, com 106 KB em vez de 3 MB: os 54 ossos (a árvore, a pose de repouso, os inversos de ligação), a paleta de cores que o corpo de arquivo, o cabelo e o batom leem, e dois triângulos minúsculos presos aos ossos. O segundo tem cor por vértice; sem ele o material com cor não existe e o corpo sai cinza.
- **Por quê:** o dono disse: "o que importa são os 2 modelos do online, o masculino e o feminino; o resto era beta e teste". Foi conferido no jogo que o Masculino jovem e a Modelo 4 saem iguais com o arquivo velho e com o novo (diferença 0 na malha, na cor, no UV, nos pesos e nos ossos).
- **Descartado:** manter o `guerreiro.glb` inteiro só pelo esqueleto e pela paleta.
- **O que muda:** as armaduras do pacote (`A1_`/`A2_`/`A3_`, as cascas pintadas, o couro moldado, o cavalete) ficam sem visual até haver armaduras feitas nos corpos novos. A primeira é o peitoral de couro, uma malha da Meshy vestida pelo `vestir.mjs`. A regra está no `CLAUDE.md` (Personagem) e em `memory_claude/corpo-e-animacao.md`.
