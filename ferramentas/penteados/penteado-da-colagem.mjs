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

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const [CHAVE, COLAGEM] = args, NOME = (opt('nome') ?? '').trim(), CORPO = opt('corpo') ?? '', LISTAS = (opt('listas') ?? '').split(',').filter(Boolean);
const falhar = (m) => { console.error(`[penteado] ${m}`); console.log(JSON.stringify({ ok: false, erro: m })); process.exit(1); };
if (!/^[a-z0-9-]{1,30}(:feminino|:arquivo\d?)?$/.test(CHAVE ?? '') || !/^[a-z0-9]{1,24}$/.test(COLAGEM ?? '') || !NOME || NOME.length > 40 || !/^[a-z0-9-]{1,30}$/.test(CORPO)
  || !LISTAS.every((l) => /^(arquivo:[a-z0-9-]{1,30}|raca:[a-z0-9-]{1,30}(:feminino)?|humano:feminino)$/.test(l))) {
  falhar('uso: node penteado-da-colagem.mjs <chave> <id da colagem> --nome "<nome>" --corpo <corpo de arquivo> --listas arquivo:<nome>,raca:<id>[:feminino],humano:feminino');
}
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));
// grava mantendo o fim de linha do arquivo (no Windows o git o deixa com CRLF)
const gravar = (rel, texto, antes = null) => fs.writeFileSync(path.join(RAIZ, rel), antes?.includes('\r\n') ? texto.replace(/\r?\n/g, '\r\n') : texto);

// ---- a colagem (salva) e a cópia dela
const ed = JSON.parse(ler('assets/modelagem.json')).corpos?.[CHAVE];
const novos = (ed?.novos ?? []).filter((n) => n.colagem === COLAGEM);
if (!novos.length) falhar(`${CHAVE} não tem a colagem ${COLAGEM} no assets/modelagem.json (salve antes)`);
if (!existe(`assets/corpos/${CORPO}.json`)) falhar(`não há o corpo de arquivo ${CORPO}`);

// ---- os nomes: o do molde (letras, números e hífen) e o id do penteado (só letras), sem repetir
const semAcento = NOME.normalize('NFD').replace(/[̀-ͯ]/g, '');
const codigo = ler('js/penteado.js');
const moldesDoCodigo = JSON.parse((codigo.match(/export const MOLDES = (\[[^\]]*\])/)?.[1] ?? '[]').replace(/'/g, '"'));
const arqMoldes = existe('assets/penteados/moldes.json') ? ler('assets/penteados/moldes.json') : null;
const registro = arqMoldes ? JSON.parse(arqMoldes) : { moldes: [] };
const doArquivo = existe('assets/penteados.json') ? Object.keys(JSON.parse(ler('assets/penteados.json')).penteados ?? {}) : [];
const idsUsados = new Set([...codigo.matchAll(/^\s+([A-Za-z]+): \{ nome:/gm)].map((m) => m[1]).concat(doArquivo, registro.moldes.map((m) => m.id)));
let molde = semAcento.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 22) || 'cabelo';   // (até 22: a sessão do editor é `molde-<nome>`, e a chave da modelagem vai até 30)
for (let n = 2, base = molde; moldesDoCodigo.includes(molde) || registro.moldes.some((m) => m.molde === molde) || existe(`assets/penteados/${molde}.json`); n++) molde = `${base}-${n}`;
const palavras = semAcento.replace(/[^A-Za-z ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
let id = (palavras.map((p, i) => (i ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase())).join('') || 'cabelo').slice(0, 26);
for (let n = 0, base = id; idsUsados.has(id); n++) id = base + 'BCDEFGHIJKLMNOPQRSTUVWXYZ'[n % 25].repeat(1 + Math.floor(n / 25));

// ---- 1. o molde
fs.mkdirSync(path.join(RAIZ, 'ferramentas/penteados/colagens'), { recursive: true });
gravar(`ferramentas/penteados/colagens/${molde}.json`, JSON.stringify({ _leiame: `A colagem ${COLAGEM} de ${CHAVE} (os triângulos criados dela, como estavam no assets/modelagem.json) de onde saiu o molde "${molde}" — penteado-da-colagem.mjs. Para refazer o molde, ponha estes \`novos\` de volta no corpo e rode o molde-da-colagem.mjs.`, chave: CHAVE, colagem: COLAGEM, corpo: CORPO, novos }) + '\n');
let saida = '';
try { saida = execFileSync(process.execPath, [path.join(AQUI, 'molde-da-colagem.mjs'), CHAVE, COLAGEM, molde, '--corpo', CORPO], { cwd: RAIZ, encoding: 'utf8' }); }
catch (e) { falhar(`o molde-da-colagem.mjs falhou: ${(e.stderr ?? e.message).toString().slice(-400)}`); }
process.stdout.write(saida);
const tris = JSON.parse(ler(`assets/penteados/${molde}.json`)).idx.length / 3;

// ---- 2. o registro
registro.moldes.push({ molde, id, nome: NOME });
gravar('assets/penteados/moldes.json', `{\n  "_leiame": ${JSON.stringify('Os MOLDES DO ARQUIVO (js/assets.js `lerMoldesDoArquivo`, js/penteado.js `PENTEADOS_DE_MOLDE`): cada molde (assets/penteados/<molde>.json) vai para o FIM da lista MOLDES do código, NESTA ORDEM (é o número da forma `molde`: nunca reordene nem apague do meio), e nasce o penteado `id` com o `nome`. Escrito pelo ferramentas/penteados/penteado-da-colagem.mjs (a aba Modelo do editor, "virar penteado").')},\n  "moldes": [\n${registro.moldes.map((m) => `    ${JSON.stringify(m)}`).join(',\n')}\n  ]\n}\n`, arqMoldes);

// ---- 3. as listas (o id no FIM)
// (o `"penteados": [ … ]` que vem depois de `ancora` no texto: acrescenta o id no estilo da lista — uma linha ou uma por item)
function noFimDaLista(texto, ancora) {
  const a = texto.indexOf(ancora);
  if (a < 0) return null;
  const m = /"penteados"\s*:\s*\[/g;
  m.lastIndex = a;
  const ini = m.exec(texto);
  if (!ini) return null;
  const abre = ini.index + ini[0].length, fecha = texto.indexOf(']', abre), dentro = texto.slice(abre, fecha);
  const l = JSON.parse(`[${dentro}]`);
  if (l.includes(id)) return texto;
  let novo;
  if (!l.length) novo = JSON.stringify(id);
  else if (dentro.includes('\n')) { const ind = dentro.match(/\n([ \t]*)"[^"]*"\s*$/)?.[1] ?? '  '; novo = `${dentro.replace(/\s*$/, '')},${dentro.includes('\r\n') ? '\r\n' : '\n'}${ind}${JSON.stringify(id)}${dentro.match(/\s*$/)[0]}`; }
  else novo = `${dentro.replace(/\s*$/, '')}${dentro.includes(', ') ? ', ' : ','}${JSON.stringify(id)}`;
  return texto.slice(0, abre) + novo + texto.slice(fecha);
}
const feitas = [];
let racas = null, textoRacas = null;
for (const lista of LISTAS) {
  const [tipo, qual, fem] = lista.split(':');
  if (tipo === 'arquivo') {
    for (const rel of [`assets/corpos/${qual}.json`, `ferramentas/corpo-de-arquivo/${qual}.json`]) {
      if (!existe(rel)) { if (rel.startsWith('assets/')) falhar(`não há ${rel}`); continue; }
      const t = ler(rel), n = noFimDaLista(t, '"jogo"');
      if (n === null) falhar(`não achei o jogo.penteados de ${rel}`);
      if (n !== t) gravar(rel, n);
      JSON.parse(n);   // (confere: o arquivo continua um JSON)
    }
  } else {
    textoRacas ??= ler('assets/racas.json');
    racas ??= JSON.parse(textoRacas);
    const r = tipo === 'humano' ? racas.humano?.feminino : (() => { const x = racas.racas.find((y) => y.id === qual); return fem ? x?.feminino : x; })();
    if (!r) falhar(`não há a lista ${lista} no racas.json`);
    if (!Array.isArray(r.penteados)) {
      // (a raça sem lista própria usa a PENTEADOS_PADRAO: a dela começa por essa, e os números de quem já joga não mudam)
      r.penteados = JSON.parse((codigo.match(/export const PENTEADOS_PADRAO = (\[[^\]]*\])/)?.[1] ?? 'null').replace(/'/g, '"'));
      if (!Array.isArray(r.penteados)) falhar('não li a PENTEADOS_PADRAO do penteado.js');
    }
    if (!r.penteados.includes(id)) r.penteados.push(id);
  }
  feitas.push(lista);
}
// (o racas.json é o JSON.stringify(…, null, 2) da rota do editor: o diff fica só na lista)
if (racas) gravar('assets/racas.json', JSON.stringify(racas, null, 2) + '\n', textoRacas);

console.log(`[penteado] "${NOME}": o penteado ${id}, o molde ${molde} (nº ${moldesDoCodigo.length + registro.moldes.length - 1}, ${tris} triângulos), nas listas ${feitas.join(', ') || '(nenhuma)'}`);
console.log(JSON.stringify({ ok: true, id, molde, nome: NOME, listas: feitas, triangulos: tris }));
