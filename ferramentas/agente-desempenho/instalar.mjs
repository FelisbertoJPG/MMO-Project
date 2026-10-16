#!/usr/bin/env node
/**
 * Instala o agente `otimizador-de-desempenho` e o kit dele (Node 18+, sem dependências).
 *
 *   node instalar.mjs <pasta do projeto>   → <projeto>/.claude/agents/ e <projeto>/.claude/kit-desempenho/
 *   node instalar.mjs --usuario            → ~/.claude/agents/ e ~/.claude/kit-desempenho/
 *                                            (vale para TODOS os projetos desta máquina)
 *
 * Também instala o comando /agent_otimizador (<.claude>/commands/), que chama o agente.
 *
 * Rodar de novo atualiza (regrava os quatro arquivos). Não mexe em mais nada do projeto: quem
 * põe o monitor dentro do jogo é o agente, quando for trabalhar nele.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv[2];
if (!arg || arg === '--ajuda' || arg === '--help') {
  console.log('uso:\n  node instalar.mjs <pasta do projeto>   (só para esse projeto)\n  node instalar.mjs --usuario            (para todos os projetos desta máquina)');
  process.exit(arg ? 0 : 1);
}
const doUsuario = arg === '--usuario';
const raiz = doUsuario ? os.homedir() : path.resolve(arg);
if (!existsSync(raiz) || !statSync(raiz).isDirectory()) { console.error(`não achei a pasta: ${raiz}`); process.exit(1); }

const base = path.join(raiz, '.claude');
const copias = [
  ['otimizador-de-desempenho.md', path.join(base, 'agents', 'otimizador-de-desempenho.md')],
  ['agent_otimizador.md', path.join(base, 'commands', 'agent_otimizador.md')],
  [path.join('kit', 'monitor-desempenho.js'), path.join(base, 'kit-desempenho', 'monitor-desempenho.js')],
  [path.join('kit', 'perfil-cpu.mjs'), path.join(base, 'kit-desempenho', 'perfil-cpu.mjs')],
];
for (const [de, para] of copias) {
  const origem = path.join(AQUI, de);
  if (!existsSync(origem)) { console.error(`faltou no pacote: ${de}`); process.exit(1); }
  mkdirSync(path.dirname(para), { recursive: true });
  copyFileSync(origem, para);
  console.log(`  ${para}`);
}
console.log(`\nInstalado ${doUsuario ? 'para todos os projetos desta máquina' : `no projeto ${raiz}`}.`);
console.log('Abra (ou reabra) o Claude Code no projeto e peça, por exemplo:');
console.log('  /agent_otimizador descobrir por que o jogo está lento');
console.log('  (ou: "use o agente otimizador-de-desempenho para descobrir por que o jogo está lento")');
console.log('(`/agents` lista os agentes que o Claude Code está vendo.)');
