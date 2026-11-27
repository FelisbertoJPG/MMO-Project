#!/usr/bin/env node
// UMA ARMADURA a partir de uma COLAGEM da aba Armaduras do Editor de Personagem (26/11/2026; o dono: "no editor ter um botão de
// [armaduras] … carregar a armadura, redimensionar, cortar malha … e então mover pra cima do personagem, assim como é com o cabelo"):
//
//   node ferramentas/armadura-de-arquivo/da-colagem.mjs <chave do corpo> <id da colagem> --corpo <corpo de arquivo> --nome "<nome>"
//        --lugar peito --conjunto 1 [--cores <base64: rgb sRGB por triângulo, na ordem dos `novos` da colagem>]
//        [--esconde <base64: Uint32, os triângulos da pele do corpo que somem com ela vestida>] [--modelagem <arquivo>]
//   ex.: node ferramentas/armadura-de-arquivo/da-colagem.mjs humano:arquivo7 mw8nqbbs6x --corpo masculino3 --nome "Peitoral de couro" --lugar peito --conjunto 1
//
// Lê os triângulos criados (`novos`) daquela colagem no assets/modelagem.json — os cantos no MODELO do corpo (cm, pose T), como o dono
// os deixou (posta numa pose parada, a aba já os guardou na pose T, pela conta da pele) —, com o outro lado quando ela é espelhada,
// solda os cantos repetidos, tira os PESOS da pele do corpo mais perto (pele.mjs) e grava assets/armaduras-de-arquivo/<id>.json + a
// lista (o item arm<conjunto>_<lugar> vestido nesse corpo a mostra). As cores vêm da aba (a cor que cada triângulo tem na tela); sem
// elas, o couro. NÃO tira a colagem do corpo: quem chama (a aba) a tira e salva — o editor guarda as edições na memória e gravaria de
// volta. A última linha da saída é um JSON { ok, id, arquivo, triangulos, substituidas } (a rota do editor a lê).
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, LUGARES, idDoNome, ID_VALIDO, lerCorpo, pele, soldar, pesosPelaPele, gravarArmadura } from './pele.mjs';

const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const [CHAVE, COLAGEM] = args, NOME = (opt('nome') ?? '').trim(), CORPO = opt('corpo') ?? '', LUGAR = opt('lugar') ?? '', CONJUNTO = Number(opt('conjunto'));
const falhar = (m) => { console.error(`[armadura] ${m}`); console.log(JSON.stringify({ ok: false, erro: m })); process.exit(1); };
if (!/^[a-z0-9-]{1,30}(:feminino|:arquivo\d?)?$/.test(CHAVE ?? '') || !/^[a-z0-9]{1,24}$/.test(COLAGEM ?? '') || !NOME || NOME.length > 40 || !/^[a-z0-9-]{1,30}$/.test(CORPO)
  || !LUGARES.includes(LUGAR) || !Number.isInteger(CONJUNTO) || CONJUNTO < 1 || CONJUNTO > 9) {
  falhar('uso: node da-colagem.mjs <chave> <id da colagem> --corpo <corpo de arquivo> --nome "<nome>" --lugar cabeca|peito|bracos|pernas --conjunto 1-9 [--cores <base64>]');
}
const ID = idDoNome(NOME);
if (!ID_VALIDO.test(ID)) falhar(`o nome "${NOME}" não dá um id (use letras ou números)`);
if (!fs.existsSync(path.join(RAIZ, 'assets/corpos', `${CORPO}.json`))) falhar(`não há o corpo de arquivo ${CORPO}`);

// ---- a colagem (salva): os cantos e, espelhada, o outro lado (x trocado, a volta ao contrário: segue virada para fora)
// (`--modelagem <arquivo>`: a colagem de uma CÓPIA do modelagem.json — refazer uma armadura de ferramentas/armadura-de-arquivo/colagens/)
const ed = JSON.parse(fs.readFileSync(opt('modelagem') ? path.resolve(opt('modelagem')) : path.join(RAIZ, 'assets/modelagem.json'), 'utf8')).corpos?.[CHAVE];
const novos = (ed?.novos ?? []).filter((n) => n.colagem === COLAGEM);
if (!novos.length) falhar(`${CHAVE} não tem a colagem ${COLAGEM} no assets/modelagem.json (salve antes)`);
const cores64 = opt('cores'), coresDela = cores64 ? new Uint8Array(Buffer.from(cores64, 'base64')) : null;
if (coresDela && coresDela.length !== novos.length * 3) falhar(`as cores vieram para ${coresDela.length / 3} triângulos; a colagem tem ${novos.length}`);
const COURO = [123, 74, 43];
const tris = [], corDe = [];
novos.forEach((n, i) => {
  const c = n.cantos.map((k) => k.em), rgb = coresDela ? [...coresDela.subarray(i * 3, i * 3 + 3)] : COURO;
  if (c.length !== 3 || !c.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))) return;
  tris.push(c); corDe.push(rgb);
  if (n.espelho) { tris.push([c[0], c[2], c[1]].map(([x, y, z]) => [-x, y, z])); corDe.push(rgb); }
});
if (!tris.length) falhar('a colagem não tem triângulo inteiro');

// ---- a malha: um ponto por canto (a solda acha os repetidos — os pesos e o alisado andam por ela)
const nT = tris.length, pos = new Float32Array(nT * 9), idx = new Uint32Array(nT * 3), cor = new Uint8Array(nT * 3);
tris.forEach((t, i) => { t.forEach((p, k) => { pos.set(p, (i * 3 + k) * 3); idx[i * 3 + k] = i * 3 + k; }); cor.set(corDe[i], i * 3); });
const corpo = lerCorpo(CORPO);
const esconde64 = opt('esconde'), esconde = esconde64 ? [...new Uint32Array(new Uint8Array(Buffer.from(esconde64, 'base64')).buffer)].filter((t) => t < corpo.I.length / 3) : null;
const solda = soldar(pos, idx, 2);
const { nomes, ossoDe, peso } = pesosPelaPele(pos, solda, corpo, pele(corpo.P, corpo.I));

// ---- gravar (e a cópia da colagem, de onde ela sai de novo)
const pasta = path.join(RAIZ, 'ferramentas/armadura-de-arquivo/colagens');
fs.mkdirSync(pasta, { recursive: true });
fs.writeFileSync(path.join(pasta, `${ID}.json`), `${JSON.stringify({ _leiame: `A colagem ${COLAGEM} de ${CHAVE} (os triângulos criados dela, como estavam no assets/modelagem.json) de onde saiu a armadura "${ID}" — da-colagem.mjs. Para refazer: ponha os novos de volta no corpo, ou rode a ferramenta com uma cópia do modelagem.json.`, chave: CHAVE, colagem: COLAGEM, corpo: CORPO, novos })}\n`);
let g;
try { g = gravarArmadura({ id: ID, rotulo: NOME, corpo: CORPO, lugar: LUGAR, conjunto: CONJUNTO, de: `o "virar armadura" do editor: ferramentas/armadura-de-arquivo/da-colagem.mjs, a colagem ${COLAGEM} de ${CHAVE}`, nomes, pos, idx, cor, ossoDe, peso, esconde }); }
catch (e) { falhar(e.message); }
console.log(`[armadura] "${NOME}": ${g.arquivo} — ${nT} triângulos no corpo ${CORPO}, veste arm${CONJUNTO}_${LUGAR}${esconde?.length ? `, esconde ${esconde.length} triângulos da pele` : ''}${g.substituidas.length ? ` (saíram da lista: ${g.substituidas.join(', ')})` : ''}`);
console.log(JSON.stringify({ ok: true, id: ID, arquivo: g.arquivo, triangulos: nT, substituidas: g.substituidas }));
