#!/usr/bin/env node
// UM PENTEADO NOVO a partir de uma COLAGEM da aba Modelo do editor, de uma vez (08/11/2026; o dono: "ponha ele automático na lista
// de cabelo quando eu exportar pro modelo e salvar") — o que antes era feito à mão (o Lobo preguiçoso, o Longo com Franja):
//
//   node ferramentas/penteados/penteado-da-colagem.mjs <chave do corpo> <id da colagem> --nome "Rabo de cavalo" --corpo <corpo de arquivo>
//        --listas arquivo:masculino3,raca:orc,raca:orc:feminino,humano:feminino
//   ex.: node ferramentas/penteados/penteado-da-colagem.mjs humano:arquivo7 mw8nqbbs6x --nome "Rabo de cavalo" --corpo masculino3 --listas arquivo:masculino3
//
// 1. o MOLDE: roda o molde-da-colagem.mjs (a colagem tem de estar SALVA no assets/modelagem.json) → assets/penteados/<molde>.json;
// 2. o REGISTRO: o molde e o penteado no FIM de assets/penteados/moldes.json (js/assets.js `lerMoldesDoArquivo`: o molde vai para o
//    fim de MOLDES e o penteado nasce com a forma `molde`) — o nome do molde e o id saem do nome, sem repetir os que já há;
// 3. as LISTAS: o id no FIM de cada lista pedida (a ordem é o número no save): `arquivo:<nome>` = o `jogo.penteados` do corpo de
//    arquivo (o gerado, assets/corpos/<nome>.json, e o recorte, ferramentas/corpo-de-arquivo/<nome>.json); `raca:<id>` e
//    `raca:<id>:feminino` = as listas do racas.json (a raça sem lista própria usa a PENTEADOS_PADRAO: a lista nova começa por ela,
//    e os números de antes não mudam); `humano:feminino` = a do humano feminino do racas.json;
// 4. a CÓPIA da colagem (os `novos` dela) em ferramentas/penteados/colagens/<molde>.json — é de onde o molde sai de novo.
// NÃO tira a colagem do corpo: quem chama (a aba Modelo) a tira e salva — o editor guarda as edições na memória e gravaria de volta.
// A última linha da saída é um JSON { ok, id, molde, nome, listas, triangulos } (a rota do editor a lê).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { RAIZ, ler, existe, gravar, LISTA_VALIDA, nomesNovos, registrarMolde, porNasListas } from './registro.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const [CHAVE, COLAGEM] = args, NOME = (opt('nome') ?? '').trim(), CORPO = opt('corpo') ?? '', LISTAS = (opt('listas') ?? '').split(',').filter(Boolean);
const falhar = (m) => { console.error(`[penteado] ${m}`); console.log(JSON.stringify({ ok: false, erro: m })); process.exit(1); };
if (!/^[a-z0-9-]{1,30}(:feminino|:arquivo\d?)?$/.test(CHAVE ?? '') || !/^[a-z0-9]{1,24}$/.test(COLAGEM ?? '') || !NOME || NOME.length > 40 || !/^[a-z0-9-]{1,30}$/.test(CORPO)
  || !LISTAS.every((l) => LISTA_VALIDA.test(l))) {
  falhar('uso: node penteado-da-colagem.mjs <chave> <id da colagem> --nome "<nome>" --corpo <corpo de arquivo> --listas arquivo:<nome>,raca:<id>[:feminino],humano:feminino');
}

// ---- a colagem (salva) e a cópia dela
const ed = JSON.parse(ler('assets/modelagem.json')).corpos?.[CHAVE];
const novos = (ed?.novos ?? []).filter((n) => n.colagem === COLAGEM);
if (!novos.length) falhar(`${CHAVE} não tem a colagem ${COLAGEM} no assets/modelagem.json (salve antes)`);
if (!existe(`assets/corpos/${CORPO}.json`)) falhar(`não há o corpo de arquivo ${CORPO}`);


// ---- os nomes: o do molde (letras, números e hífen) e o id do penteado (só letras), sem repetir (registro.mjs)
const { molde, id } = nomesNovos(NOME);

// ---- 1. o molde
fs.mkdirSync(path.join(RAIZ, 'ferramentas/penteados/colagens'), { recursive: true });
gravar(`ferramentas/penteados/colagens/${molde}.json`, JSON.stringify({ _leiame: `A colagem ${COLAGEM} de ${CHAVE} (os triângulos criados dela, como estavam no assets/modelagem.json) de onde saiu o molde "${molde}" — penteado-da-colagem.mjs. Para refazer o molde, ponha estes \`novos\` de volta no corpo e rode o molde-da-colagem.mjs.`, chave: CHAVE, colagem: COLAGEM, corpo: CORPO, novos }) + '\n');
let saida = '';
try { saida = execFileSync(process.execPath, [path.join(AQUI, 'molde-da-colagem.mjs'), CHAVE, COLAGEM, molde, '--corpo', CORPO], { cwd: RAIZ, encoding: 'utf8' }); }
catch (e) { falhar(`o molde-da-colagem.mjs falhou: ${(e.stderr ?? e.message).toString().slice(-400)}`); }
process.stdout.write(saida);
const tris = JSON.parse(ler(`assets/penteados/${molde}.json`)).idx.length / 3;

// ---- 2. o registro e 3. as listas (registro.mjs)
const numero = registrarMolde({ molde, id, nome: NOME });
let feitas = [];
try { feitas = porNasListas(id, LISTAS); } catch (e) { falhar(e.message); }

console.log(`[penteado] "${NOME}": o penteado ${id}, o molde ${molde} (nº ${numero}, ${tris} triângulos), nas listas ${feitas.join(', ') || '(nenhuma)'}`);
console.log(JSON.stringify({ ok: true, id, molde, nome: NOME, listas: feitas, triangulos: tris }));
