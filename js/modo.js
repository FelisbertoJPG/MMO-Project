// OS DOIS MODOS DE JOGO (02/10/2026) — o que muda de um para o outro, num lugar só.
//
//   • `offline` — a JORNADA de sempre: acorda na cela, o mundo é só seu, o save
//     fica neste computador (e na conta), e o amigo entra pela sala (tecla O).
//   • `mmo` — o MUNDO ONLINE: um mapa para todos (`rede/mundo.js`), o personagem
//     guardado no servidor (`servidor-mundo.mjs`), nasce no acampamento com a adaga.
//
// O código pergunta `game.regras.<nome>` em vez de `game.modo === 'mmo'`: assim
// cada diferença tem nome, e um terceiro modo é uma linha aqui, não uma caça
// aos `if` pelo jogo.
export const REGRAS = {
  offline: {
    /** Abrir um menu congela a simulação (sozinho; com alguém na sala já não congela). */
    pausa: true,
    /** Descansar e morrer fazem os inimigos renascerem e os chefes voltarem a dormir. */
    mundoReinicia: true,
    /** No mundo de OUTRO (co-op) só se ajuda: nada de baú, porta, item, fogueira. */
    visitaSoAjuda: true,
    /** A luta de chefe é do mundo inteiro (barra e música ligam para quem está nele). */
    lutaDoMundo: true,
    /** Os fantasmas dos outros jogadores (Supabase) passam pelo seu mundo. */
    fantasmas: true,
    /** Metros de sorteio em volta do ponto de acordar (0 = sempre no mesmo lugar). */
    espalharAoAcordar: 0,
  },
  mmo: {
    pausa: false,
    // os inimigos renascem por TEMPO e quem cuida dos chefes é o simulador
    mundoReinicia: false,
    // o mundo é de todos: cada um abre o SEU baú, descansa, pega o SEU item
    visitaSoAjuda: false,
    // a luta é de quem está NELA: barra e música por jogador (`Mundo.atualizarLuta`)
    lutaDoMundo: false,
    // quem está no mundo aparece de verdade, sólido
    fantasmas: false,
    // vários acordam na mesma fogueira: um em cima do outro, os corpos nem se separam
    espalharAoAcordar: 1.8,
  },
};
