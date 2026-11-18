// O LIVRO DE HABILIDADES (18/11/2026): guia de desenvolvimento, fora do jogo.
//
// Lê planejamento/arvore-de-habilidades.json e grava planejamento/livro-de-habilidades.html,
// uma página só, que abre direto no navegador. O JSON é a fonte: mude os dados lá e rode de novo.
//
// Uso (da raiz do jogo):
//   node ferramentas/habilidades/gerar-livro.mjs [--fragmento=<arquivo>]
// (--fragmento grava também a versão sem a casca do HTML, a que é publicada como artefato)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raiz = path.resolve(aqui, '..', '..');
const dados = JSON.parse(fs.readFileSync(path.join(raiz, 'planejamento', 'arvore-de-habilidades.json'), 'utf8'));
const modelo = fs.readFileSync(path.join(aqui, 'livro-modelo.html'), 'utf8');

// (o `<` escapado: um texto dos dados nunca fecha o <script> da página)
const fragmento = modelo.replace('__DADOS__', () => JSON.stringify(dados).replace(/</g, '\\u003c'));
const casca = '<!doctype html>\n<html lang="pt-BR">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n';

const saida = path.join(raiz, 'planejamento', 'livro-de-habilidades.html');
fs.writeFileSync(saida, casca + fragmento, 'utf8');
console.log(`livro gravado: ${path.relative(raiz, saida)} (revisão ${dados.revisao_do_rascunho} dos dados)`);

const opcao = process.argv.find((a) => a.startsWith('--fragmento='));
if (opcao) fs.writeFileSync(opcao.slice('--fragmento='.length), fragmento, 'utf8');
