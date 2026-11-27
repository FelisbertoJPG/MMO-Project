#!/usr/bin/env node
// GRAVA uma armadura feita no editor (27/11/2026; a aba Armaduras do Editor de Personagem, "vestir no esqueleto" — o dono: "carregar
// apenas o esqueleto do player … colocarmos a armadura por cima do esqueleto … a armadura recebe aquele esqueleto, como se fosse um
// modelo novo com esqueleto do player"): a aba já fez a malha na pose T, os pesos (a pele do jogador debaixo, com as QUEBRAS) e a cor;
// aqui só se confere e grava (pele.mjs `gravarArmadura`: o arquivo e a lista).
//   node ferramentas/armadura-de-arquivo/gravar.mjs <entrada.json>
//   entrada: { nome, corpo, lugar, conjunto, nomes, pos (cm), idx, cor (rgb por triângulo, 0–255), ossoDe, peso (4 por ponto), esconde? }
// A última linha da saída é um JSON { ok, id, arquivo, triangulos, substituidas } (a rota do editor a lê).
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, LUGARES, idDoNome, ID_VALIDO, gravarArmadura } from './pele.mjs';

const falhar = (m) => { console.error(`[armadura] ${m}`); console.log(JSON.stringify({ ok: false, erro: m })); process.exit(1); };
let e;
try { e = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); } catch (err) { falhar(`não li a entrada: ${err.message}`); }
const inteiros = (l, max) => Array.isArray(l) && l.every((x) => Number.isInteger(x) && x >= 0 && x <= max);
const nome = typeof e?.nome === 'string' ? e.nome.trim() : '', id = idDoNome(nome);
if (!nome || nome.length > 40 || !ID_VALIDO.test(id)) falhar('o nome da armadura (letras ou números, até 40)');
if (!/^[a-z0-9-]{1,30}$/.test(e.corpo ?? '') || !fs.existsSync(path.join(RAIZ, 'assets/corpos', `${e.corpo}.json`))) falhar(`não há o corpo de arquivo ${e.corpo}`);
if (!LUGARES.includes(e.lugar) || !Number.isInteger(e.conjunto) || e.conjunto < 1 || e.conjunto > 9) falhar('lugar ou conjunto torto');
if (!Array.isArray(e.nomes) || !e.nomes.length || e.nomes.length > 255 || !e.nomes.every((n) => typeof n === 'string' && /^[A-Za-z0-9_.]{1,40}$/.test(n))) falhar('os nomes dos ossos');
const nv = (e.pos?.length ?? 0) / 3;
if (!Array.isArray(e.pos) || !nv || !Number.isInteger(nv) || !e.pos.every((x) => Number.isFinite(x) && Math.abs(x) < 5000)) falhar('os pontos');
if (!inteiros(e.idx, nv - 1) || !e.idx.length || e.idx.length % 3) falhar('os triângulos');
if (!inteiros(e.cor, 255) || e.cor.length !== e.idx.length) falhar('as cores (rgb por triângulo)');
if (!inteiros(e.ossoDe, e.nomes.length - 1) || e.ossoDe.length !== nv * 4 || !inteiros(e.peso, 255) || e.peso.length !== nv * 4) falhar('os pesos (4 por ponto)');
if (e.esconde != null && !inteiros(e.esconde, 1e7)) falhar('o esconde');
let g;
try {
  g = gravarArmadura({
    id, rotulo: nome, corpo: e.corpo, lugar: e.lugar, conjunto: e.conjunto, de: 'a aba Armaduras do editor, "vestir no esqueleto" (ferramentas/armadura-de-arquivo/gravar.mjs)',
    nomes: e.nomes, pos: Float32Array.from(e.pos), idx: Uint32Array.from(e.idx), cor: Uint8Array.from(e.cor), ossoDe: Uint8Array.from(e.ossoDe), peso: Uint8Array.from(e.peso), esconde: e.esconde ?? null,
  });
} catch (err) { falhar(err.message); }
console.log(`[armadura] "${nome}": ${g.arquivo} — ${e.idx.length / 3} triângulos no corpo ${e.corpo}, veste arm${e.conjunto}_${e.lugar}${e.esconde?.length ? `, esconde ${e.esconde.length} triângulos da pele` : ''}${g.substituidas.length ? ` (saíram da lista: ${g.substituidas.join(', ')})` : ''}`);
console.log(JSON.stringify({ ok: true, id, arquivo: g.arquivo, triangulos: e.idx.length / 3, substituidas: g.substituidas }));
