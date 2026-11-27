# Registro de decisões

Um arquivo por **decisão grande**: o que foi decidido, por quê, o que foi descartado e o que muda. É a memória do **porquê**. A base de cada área (`memory_claude/`) guarda **como é hoje**; o commit guarda o **que mudou**; aqui fica o motivo, num lugar só.

**Antes de propor uma mudança grande** (trocar um sistema, tirar ou voltar com algo, mudar a arquitetura), procure aqui (`grep -ri <assunto> planejamento/decisoes`). Se o que você ia propor está em "Descartado", diga isso ao dono antes de propor de novo.

## Quando escrever

- **Sim:** uma escolha entre caminhos que alguém poderia querer desfazer depois. Por exemplo: um sistema que sai do jogo, uma arquitetura nova, uma regra do dono que muda o rumo, um "não vamos fazer X".
- **Não:** ajuste, cor, número de balanceamento, conserto de bug. Para isso o commit basta.
- Quem escreve é quem fez a mudança, **no mesmo commit**. Use a skill `registrar-decisao`.

## O formato

Arquivo `AAAA-MM-DD-titulo-curto.md`, com a data da decisão:

```markdown
# <a decisão, numa frase>

- **Data:** AAAA-MM-DD · **Commit:** <hash curto> · **Área:** <base em memory_claude/>
- **Decidido:** o que ficou valendo.
- **Por quê:** o motivo, com a fala do dono entre aspas quando houver.
- **Descartado:** as outras opções e por que não (ou "não ficou registrado").
- **O que muda:** a regra que passa a valer no código e onde ela está escrita.
```

Decisão revista: **não apague a antiga**. Escreva uma nova e ponha no topo da antiga `> Substituída por <arquivo>.`

## As decisões

| Data | Decisão |
|---|---|
| 2026-11-24 | [O servidor confere o passo e o golpe pelos números do jogo](2026-11-24-servidor-confere-pelos-numeros-do-jogo.md) |
| 2026-11-24 | [O caminho 2 amadurece no PC do dono antes de ir para um Render](2026-11-24-caminho-2-local-antes-do-render.md) |
| 2026-11-24 | [Inimigo = cérebro + corpo; inimigo diferente = ficha + traços](2026-11-24-inimigo-cerebro-e-corpo.md) |
| 2026-11-24 | [A Feminino 2 e o Masculino Adulto saem do jogo](2026-11-24-feminino-2-e-masculino-adulto-saem.md) |
| 2026-11-26 | [O guerreiro.glb sai; só o esqueleto fica](2026-11-26-guerreiro-glb-sai.md) |
| 2026-11-26 | [Orc e Elfo saem do jogo](2026-11-26-orc-e-elfo-saem.md) |
