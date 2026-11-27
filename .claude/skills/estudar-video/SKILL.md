---
name: estudar-video
description: Receita para ESTUDAR um video ou aula do YouTube para o Lubelion (Desktop/ds) - pegar a legenda, fazer a transcricao limpa com os minutos e as notas do que serve para o jogo (a tabela "o video x o Lubelion"), em planejamento/estudos/ fora do git. Use quando o dono mandar um link de video, aula ou palestra para estudar ou trazer para o projeto.
---

# Estudar um vídeo para o Lubelion

Os exemplos prontos são `planejamento/estudos/devleor-godot-ia-*` e `genshin-ps4-*`. Copie o formato deles.

## 0. Onde fica
Em `planejamento/estudos/`, **fora do git de propósito**: é transcrição de terceiros e o repositório é público. Nunca `git add` nessa pasta. Cada estudo tem três arquivos, com `<nome>` = `canal-assunto` curto:
1. `<nome>-legenda-original.txt`: a legenda crua, em blocos `[mm:ss] texto`.
2. `<nome>-transcricao.md`: o texto limpo.
3. `<nome>-notas.md`: o que serve para o jogo. **É o que se lê primeiro.**

## 1. A legenda
- Use o jeito que funcionar e **anote aqui qual foi** (o do devleor não ficou registrado). As opções:
  - o dono cola a legenda;
  - a transcrição do próprio YouTube pela extensão do Chrome ("Mostrar transcrição");
  - `yt-dlp --write-auto-subs --sub-langs pt --skip-download <url>` (não está instalado nesta máquina).
- O título, o canal, a duração, os capítulos e os links vêm da descrição do vídeo.

## 2. A transcrição (`-transcricao.md`)
- Cabeçalho: o canal, o link, a duração, o link para as notas e **como foi feita** (de qual legenda, o que foi corrigido).
- Divida pelos capítulos da descrição. Cada título é um link para o minuto: `## [m:ss — Capítulo](https://www.youtube.com/watch?v=ID&t=Ns)`.
- Limpe os vícios de fala e conserte os nomes que a legenda errou (anote no cabeçalho). Onde ficar em dúvida, marque **[?]**. Partes sem conteúdo (agradecimentos) viram um resumo marcado *(resumo)*.

## 3. As notas (`-notas.md`)
1. **Panorama**: a tese do vídeo em uma frase e as peças dela, numa tabela curta se ajudar.
2. **A tabela "o vídeo × o Lubelion"**: etapa | no vídeo | no Lubelion hoje (com arquivo e nome de verdade, conferidos no código) | situação (**Já faz** / **Em parte** / **Falta** / Não se aplica).
3. **Onde o Lubelion já está à frente.**
4. **O que vale copiar, do que mais rende para o que menos**: cada item com o porquê, o como (arquivos, comandos) e o custo. Respeite as regras do dono (pedido direto, gasto proporcional).
5. **Links do vídeo**, dizendo quais foram abertos e quais não.

Nada nas notas sem conferir: o que diz "o Lubelion hoje" sai do código e das bases, não da memória.

## 4. Fechar
- Uma linha na memória `estudos-de-video`: o nome, a data, do que é e o que já foi aplicado (no começo, "nada aplicado ainda").
- **Não aplique nada sem o dono**: mudança de processo ou de arquitetura se conversa antes.
- Responda com o resumo das notas e as ideias em ordem, perguntando quais o dono quer trazer.
