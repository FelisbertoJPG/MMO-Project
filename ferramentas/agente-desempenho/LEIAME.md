# Agente de desempenho — `otimizador-de-desempenho`

Um agente do Claude Code que sabe **otimizar um jogo ou app 3D do jeito certo**: mede antes de mexer, acha quem limita o quadro (a placa, a CPU no desenho, a CPU na lógica, ou os trancos), muda uma coisa por vez e prova o ganho com números. Ele vem com as ferramentas de diagnóstico que usa.

Nasceu do caminho de otimização do **Lubelion Online** (three.js): tudo o que está escrito nele foi medido naquele jogo.

## O que tem na pasta

| arquivo | o que é |
| --- | --- |
| `otimizador-de-desempenho.md` | **o agente**: o método, como ler um relatório, os remédios por tipo de gargalo, as armadilhas de medida |
| `kit/monitor-desempenho.js` | **o monitor de desempenho**, para qualquer projeto three.js: F3 abre o painel, "Diagnosticar e copiar" gera o relatório |
| `kit/perfil-cpu.mjs` | **o perfil de CPU**: abre um Chrome, mede e diz em que função a CPU está; simula máquina fraca (`--freio`) |
| `instalar.mjs` | copia tudo para o lugar certo |

## Instalar

Precisa do [Claude Code](https://claude.com/claude-code), do Node 18 ou mais novo e do Chrome.

Num projeto só:

```
node instalar.mjs "C:\caminho\do\jogo"
```

Em todos os projetos desta máquina:

```
node instalar.mjs --usuario
```

À mão, se preferir: `otimizador-de-desempenho.md` vai para `.claude/agents/` e os dois arquivos de `kit/` vão para `.claude/kit-desempenho/` — dentro do projeto, ou dentro da pasta do usuário (`C:\Users\<você>\.claude\`).

Depois, abra (ou reabra) o Claude Code na pasta do jogo.

## Usar

Peça em linguagem normal:

> use o agente otimizador-de-desempenho para descobrir por que o jogo está lento no meu PC

> o jogo trava quando entro na floresta — chama o otimizador-de-desempenho

> (colando um relatório) o otimizador-de-desempenho pode ver isso?

Na primeira vez num projeto three.js ele instala o monitor dentro do jogo (um arquivo e duas linhas). Depois disso:

1. abra o jogo e vá ao lugar que trava;
2. pare, olhando para onde pesa;
3. aperte **F3** e clique em **Diagnosticar e copiar**;
4. espere cerca de 1 minuto **sem mexer e sem trocar de janela**;
5. cole o texto no Claude Code.

Esse relatório é o que o agente precisa — vale mais que qualquer descrição. Quem tem a máquina lenta é quem deve gerá-lo.

## As ferramentas sozinhas

O monitor, em qualquer projeto three.js (`WebGLRenderer`):

```js
import { MonitorDesempenho } from './monitor-desempenho.js';
const monitor = new MonitorDesempenho({ renderer, scene, camera, nome: 'Meu jogo' });
// opcional, no laço: monitor.fase('fisica') depois de cada bloco
```

O perfil de CPU, em qualquer página:

```
node kit/perfil-cpu.mjs http://localhost:5173 --segundos 5
node kit/perfil-cpu.mjs http://localhost:5173 --freio 4 --avaliar "await __monitor.diagnosticar().then(() => __monitor.relatorio())"
node kit/perfil-cpu.mjs --ajuda
```

## Limites

- O **monitor** é para three.js com `WebGLRenderer`. O **perfil de CPU** serve para qualquer página. O **método** do agente serve para qualquer motor (Unity, Godot, Unreal, 2D): ele usa o analisador do próprio motor.
- O agente não adivinha: sem medida ele pede a medida. Com a máquina dele rápida e a sua lenta, ele vai pedir o seu relatório.
- Ele não muda regra de jogo, não apaga asset sem cópia e diz o que cada troca de qualidade custa no visual.
