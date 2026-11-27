# O Lubelion fica no Three.js, por ora (não vai para o Godot)

- **Data:** 2026-11-27 · **Commit:** T-003 · **Área:** o projeto todo
- **Decidido:** o jogo continua em Three.js puro, no navegador. Não há migração para o Godot. É uma decisão **provisória**: o dono disse "por hora".
- **Por quê:** o dono: "vou ficar por hora no three.js", depois de perguntar "sobre o godot, faz sentido irmos pra ele?" (a ideia veio do vídeo do devleor, `planejamento/estudos/devleor-godot-ia-notas.md`). Os motivos levados a ele:
  - **O argumento do vídeo já está atendido.** O devleor escolheu o Godot porque a cena dele é texto que a IA lê. O Lubelion já é assim: o código é JS, o conteúdo é JSON, e os `.glb` viram tabela por ferramenta.
  - **A troca seria reescrever tudo.** Em 27/11/2026 eram ~32 mil linhas de jogo em 97 arquivos, ~8,6 mil de ferramentas, ~1,4 mil de servidor e 344 commits. Boa parte é feita sob medida (o corpo de arquivo, a retopologia, a modelagem, o ímã, os penteados, os editores, o save, a rede).
  - **No navegador, o Godot perde quase tudo o que tem de bom.** O C# do Godot 4 ainda não exporta para a web (a documentação estável diz isso; o suporte estava em desenvolvimento, sem data). A web usa o renderizador de compatibilidade (WebGL 2, o mesmo do three.js). O motor em WebAssembly vem antes do jogo, e o navegador do celular é o ponto fraco do Godot.
  - **O anti-trapaça depende do JS nos dois lados.** O servidor roda os mesmos arquivos do jogo (o cérebro dos bichos, `regras-do-mundo.mjs`, o mapa lógico). No Godot, o caminho 2 teria de ser refeito.
- **Descartado:** migrar para o Godot (com C# ou GDScript). O que ele daria foi reconhecido: o editor pronto (cena, árvore de animação, retarget, navmesh, física) e o desempenho nativo no PC, no Android e na Steam.
- **O que muda:** nada no código. **Rever esta decisão** se o Lubelion deixar de ser jogo de navegador e virar um programa para baixar, ou se um jogo novo começar do zero.
