# A "Feminino 2" e o "Masculino Adulto" saem do jogo

- **Data:** 2026-11-24 · **Commit:** 9c26da9 · **Área:** `aparencia-e-racas`
- **Decidido:** os dois corpos (`feminino2` e `masculino1`) voltam para `CORPOS_DO_EDITOR` (`assets.js`). Os arquivos continuam no projeto, e só o Editor de Personagem os carrega. Quem jogava com um deles passa a jogar com o corpo padrão do mesmo sexo (`sexoQueExiste`, `raca.js`), e o save não muda.
- **Por quê:** eram corpos de teste e subiram para o jogo por acidente.
- **Descartado:** não ficou registrado. Os arquivos ficam porque o Editor de Personagem continua usando.
- **O que muda:** o cabelo pronto (`malha`) acha o corpo pelo `NUMERO_DOS_CORPOS`, e não mais pelo lugar na lista do jogo. A linha Sexo do painel anda por `sexosDoPainel`. A regra está no `CLAUDE.md` (Personagem) e em `memory_claude/aparencia-e-racas.md`.
