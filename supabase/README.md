# `supabase/` — o online da Masmorra

Usa o **mesmo projeto** do Duel Academy (`shclhlbfkdnnqxboiuqc`), para a mesma
conta entrar nos dois jogos. Mas tudo da Masmorra mora no **schema `masmorra`**,
separado do `public` do Duel Academy. A única ligação entre os dois é
`auth.users`, a tabela de contas.

## Ligar (uma vez)

1. **SQL Editor → New query →** colar `migrations/0001_masmorra_inicial.sql` → **Run**.
2. **Project Settings → Data API → Exposed schemas →** acrescentar `masmorra` e salvar.
   Sem isso, a API responde 406 a tudo daqui, e o jogo mostra "online desligado".
3. Reabrir o jogo (`masmorra.exe`).

## Desligar SÓ a Masmorra

Do mais leve ao definitivo. Nenhum deles afeta o Duel Academy:

| Como | O que acontece |
|---|---|
| `update masmorra.config set valor = 'false' where chave = 'ligado';` | Leituras, gravações, RPCs e canais ao vivo param na hora. O jogo segue offline. Volta com `'true'`. |
| Tirar `masmorra` de **Exposed schemas** | A API para de enxergar o schema. Os canais ao vivo só param com a linha de cima. |
| `drop schema masmorra cascade;` | Apaga tudo, inclusive as policies do canal ao vivo. |

## O que tem lá

| Tabela | O que guarda | Quem lê / escreve |
|---|---|---|
| `config` | o interruptor `ligado` | todos leem; só o SQL Editor muda |
| `jogadores` | o nome de cada conta na Masmorra (criado no 1º login por `entrar()`) | logados leem; muda só por `renomear()` |
| `saves` | o progresso de cada conta (cópia do `saves/conta-<id>.json`) | só o dono |
| `mensagens` + `avaliacoes` | texto livre no chão, até 140 letras; votos +1/−1, e com nota −3 a mensagem some | logados leem; escrita por `escrever_mensagem()`/`avaliar()` (com limite de 10/hora e 30 por autor) |
| `mortes` | manchas de sangue com os últimos 5 s gravados | logados leem; escrita por `registrar_morte()` |

Os **canais ao vivo** (os fantasmas, e depois o co-op) usam tópicos
`masmorra:*` **privados**. As policies em `realtime.messages` só deixam
entrar quem está logado e só com `ligado = true`. Os canais públicos do
Duel Academy não passam por elas.

## As chaves

A `publishable` (`sb_publishable_…`, em `js/rede/supabase.js`) é pública por
design: quem protege os dados é a RLS. A `secret`/`service_role` **nunca** entra
neste projeto.
