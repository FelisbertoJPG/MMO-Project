# A decoração (decor.json)

> Tópico tirado do CLAUDE.md (o texto de lá, sem cortes). O índice de todos os tópicos é o CLAUDE.md da raiz.

**A decoração vive em `assets/decor.json`, não no código** (26/09/2026). `buildDecor()` era 38 chamadas de `place()` escritas à mão; hoje é um laço sobre `Assets.decor`, e quem grava o arquivo é o **editor de cenas** (pasta `Documents/projects/trhee_js_scene_editor`, tela `ds.html`). Mover um barril meio metro deixou de ser editar código, recarregar e olhar.
- **`placeDecor(d)` é o caminho do dado e não tem regra escondida**: escala, altura e raio de colisão vêm do arquivo. `place()` continua existindo para o que ainda é posicionado em código (a arena, em `buildArena()`) e **mantém** a regra antiga de escala por nome (`/pillar|column|banner/` → escala `S`) — a arena depende dela, e tirá-la encolheria os pilares de lá em silêncio.
- **Peça fora de `PROPS` é PULADA com aviso no console**, em vez de derrubar o mundo: `Assets.prop()` devolveria `undefined` e o `.clone()` levaria junto toda a decoração seguinte. Por isso `PROPS` agora é **exportado** — o editor lê essa lista para só oferecer o que o jogo sabe carregar.
- **Os cadáveres (`addCorpse`) ficaram no código de propósito**: são espalhados com `Math.random()`, então não há posição para gravar. Congelá-los num arquivo mudaria o jogo.
- `assets/decor.json` faltando **não impede o jogo de abrir** — a masmorra vem sem decoração, com o motivo no console.
- Todo `.glb` de `assets/dungeon/` está hoje em `PROPS`; um novo só entra na gaveta do editor depois de acrescentado à lista (o `levar-ao-jogo.mjs` do editor faz isso).
