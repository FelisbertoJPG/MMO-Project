---
name: registrar-decisao
description: Receita para REGISTRAR uma decisao grande do Lubelion (Desktop/ds) em planejamento/decisoes/ (o ADR - Decidido / Por que / Descartado / O que muda), no mesmo commit da mudanca. Use quando o dono decidir tirar ou trazer de volta um sistema, mudar a arquitetura, escolher um caminho entre opcoes, disser "registra essa decisao", ou antes de propor de novo algo que talvez ja tenha sido descartado.
---

# Registrar uma decisão

O formato, a regra e a lista ficam em `planejamento/decisoes/README.md`. Leia lá antes da primeira vez.

## Antes de propor algo grande
`grep -ril <assunto> planejamento/decisoes`. Se o que você ia propor está em **Descartado**, diga isso ao dono e o motivo, antes de propor de novo.

## É decisão?
- **Sim:** uma escolha entre caminhos que alguém poderia querer desfazer depois. Exemplos: um sistema que sai, uma arquitetura nova, um "não vamos fazer X", uma regra do dono que muda o rumo.
- **Não:** ajuste, cor, número, conserto de bug. Para isso o commit basta.

## Como escrever
1. Arquivo `planejamento/decisoes/AAAA-MM-DD-titulo-curto.md`, com a data da decisão (sem acento no nome do arquivo).
2. Os campos do README: **Data · Commit · Área**, **Decidido**, **Por quê** (a fala do dono entre aspas, exata), **Descartado**, **O que muda** (a regra que passa a valer e onde ela está escrita: `CLAUDE.md`, a base da área).
3. **Não invente.** O motivo e o que foi descartado saem da conversa, do commit ou da memória. Se não houver registro, escreva "não ficou registrado".
4. Uma linha na tabela "As decisões" do README, em ordem de data.
5. Entra **no mesmo commit** da mudança. Como o hash ainda não existe, ponha no campo Commit o `T-NNN` do quadro; `git log --grep T-NNN` acha o commit.
6. A decisão revista não se apaga. Escreva uma nova e ponha no topo da antiga `> Substituída por <arquivo>.`

O que vira regra de código continua indo também para o `CLAUDE.md` e para a base da área. A decisão guarda o **porquê**; a base guarda o **como é**.
