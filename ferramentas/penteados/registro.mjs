// O REGISTRO DE UM PENTEADO NOVO (17/11/2026: saiu do penteado-da-colagem.mjs para o penteado-salvo-como.mjs usar também):
// os nomes (o do molde e o id, sem repetir), a entrada no FIM de assets/penteados/moldes.json e o id no FIM das listas pedidas.
// Quem usa: penteado-da-colagem.mjs (a aba Modelo, "virar penteado") e penteado-salvo-como.mjs (a aba Cabelo, "salvar como").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');
export const existe = (rel) => fs.existsSync(path.join(RAIZ, rel));
// grava mantendo o fim de linha do arquivo (no Windows o git o deixa com CRLF)
export const gravar = (rel, texto, antes = null) => fs.writeFileSync(path.join(RAIZ, rel), antes?.includes('\r\n') ? texto.replace(/\r?\n/g, '\r\n') : texto);
// a lista em que o penteado entra: `arquivo:<corpo de arquivo>`, `raca:<id>`, `raca:<id>:feminino` ou `humano:feminino`
export const LISTA_VALIDA = /^(arquivo:[a-z0-9-]{1,30}|raca:[a-z0-9-]{1,30}(:feminino)?|humano:feminino)$/;

const codigo = () => ler('js/penteado.js');
export const moldesDoCodigo = () => JSON.parse((codigo().match(/export const MOLDES = (\[[^\]]*\])/)?.[1] ?? '[]').replace(/'/g, '"'));
export function lerRegistro() {
  const texto = existe('assets/penteados/moldes.json') ? ler('assets/penteados/moldes.json') : null;
  const j = texto ? JSON.parse(texto) : {};
  return { texto, moldes: Array.isArray(j.moldes) ? j.moldes : [] };
}

/** Do nome ("Desgrenhado cortado"): o nome do MOLDE (letras, números e hífen) e o ID do penteado (só letras), sem repetir os que já há. */
export function nomesNovos(NOME) {
  const semAcento = NOME.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const cod = codigo(), registro = lerRegistro(), doCodigo = moldesDoCodigo();
  const doArquivo = existe('assets/penteados.json') ? Object.keys(JSON.parse(ler('assets/penteados.json')).penteados ?? {}) : [];
  const idsUsados = new Set([...cod.matchAll(/^\s+([A-Za-z]+): \{ nome:/gm)].map((m) => m[1]).concat(doArquivo, registro.moldes.map((m) => m.id).filter(Boolean)));
  let molde = semAcento.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 22) || 'cabelo';   // (até 22: a sessão do editor é `molde-<nome>`, e a chave da modelagem vai até 30)
  for (let n = 2, base = molde; doCodigo.includes(molde) || registro.moldes.some((m) => m.molde === molde) || existe(`assets/penteados/${molde}.json`); n++) molde = `${base}-${n}`;
  const palavras = semAcento.replace(/[^A-Za-z ]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  let id = (palavras.map((p, i) => (i ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase())).join('') || 'cabelo').slice(0, 26);
  for (let n = 0, base = id; idsUsados.has(id); n++) id = base + 'BCDEFGHIJKLMNOPQRSTUVWXYZ'[n % 25].repeat(1 + Math.floor(n / 25));
  return { molde, id };
}

/** Põe `entrada` ({ molde, id, nome }, ou só { molde }) no FIM de assets/penteados/moldes.json; devolve o número do molde (o lugar em MOLDES). */
export function registrarMolde(entrada) {
  const { texto, moldes } = lerRegistro();
  if (!moldes.some((m) => m.molde === entrada.molde)) moldes.push(entrada);
  gravar('assets/penteados/moldes.json', `{\n  "_leiame": ${JSON.stringify('Os MOLDES DO ARQUIVO (js/assets.js `lerMoldesDoArquivo`, js/penteado.js `PENTEADOS_DE_MOLDE`): cada molde (assets/penteados/<molde>.json) vai para o FIM da lista MOLDES do código, NESTA ORDEM (é o número da forma `molde`: nunca reordene nem apague do meio), e nasce o penteado `id` com o `nome` (sem `id`: só o molde — a versão de um corpo). Escrito pelo ferramentas/penteados/penteado-da-colagem.mjs (a aba Modelo do editor, "virar penteado"), pelo penteado-salvo-como.mjs (a aba Cabelo, "salvar como") e pela rota molde-gravar do editor.')},\n  "moldes": [\n${moldes.map((m) => `    ${JSON.stringify(m)}`).join(',\n')}\n  ]\n}\n`, texto);
  return moldesDoCodigo().length + moldes.findIndex((m) => m.molde === entrada.molde);
}

// (o `"penteados": [ … ]` que vem depois de `ancora` no texto: acrescenta o id no estilo da lista — uma linha ou uma por item)
function noFimDaLista(texto, ancora, id) {
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

/**
 * O id no FIM de cada lista (a ordem é o número no save): `arquivo:<nome>` = o `jogo.penteados` do corpo de arquivo (o gerado,
 * assets/corpos/<nome>.json, e o recorte, ferramentas/corpo-de-arquivo/<nome>.json); `raca:<id>[:feminino]` e `humano:feminino` = as
 * listas do racas.json (a raça sem lista própria usa a PENTEADOS_PADRAO: a lista nova começa por ela, e os números de antes não mudam).
 * Devolve as feitas; erro = Error.
 */
export function porNasListas(id, LISTAS) {
  const feitas = [];
  let racas = null, textoRacas = null;
  for (const lista of LISTAS) {
    const [tipo, qual, fem] = lista.split(':');
    if (tipo === 'arquivo') {
      for (const rel of [`assets/corpos/${qual}.json`, `ferramentas/corpo-de-arquivo/${qual}.json`]) {
        if (!existe(rel)) { if (rel.startsWith('assets/')) throw new Error(`não há ${rel}`); continue; }
        const t = ler(rel), n = noFimDaLista(t, '"jogo"', id);
        if (n === null) throw new Error(`não achei o jogo.penteados de ${rel}`);
        JSON.parse(n);   // (confere: o arquivo continua um JSON)
        if (n !== t) gravar(rel, n);
      }
    } else {
      textoRacas ??= ler('assets/racas.json');
      racas ??= JSON.parse(textoRacas);
      const r = tipo === 'humano' ? racas.humano?.feminino : (() => { const x = racas.racas.find((y) => y.id === qual); return fem ? x?.feminino : x; })();
      if (!r) throw new Error(`não há a lista ${lista} no racas.json`);
      if (!Array.isArray(r.penteados)) {
        r.penteados = JSON.parse((codigo().match(/export const PENTEADOS_PADRAO = (\[[^\]]*\])/)?.[1] ?? 'null').replace(/'/g, '"'));
        if (!Array.isArray(r.penteados)) throw new Error('não li a PENTEADOS_PADRAO do penteado.js');
      }
      if (!r.penteados.includes(id)) r.penteados.push(id);
    }
    feitas.push(lista);
  }
  // (o racas.json é o JSON.stringify(…, null, 2) da rota do editor: o diff fica só na lista)
  if (racas) gravar('assets/racas.json', JSON.stringify(racas, null, 2) + '\n', textoRacas);
  return feitas;
}
