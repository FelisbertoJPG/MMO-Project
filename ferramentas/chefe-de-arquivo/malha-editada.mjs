#!/usr/bin/env node
// A MALHA EDITADA DE UM CHEFE DE ARQUIVO (25/11/2026; a primeira: a Mycohydra). Quem chama é a rota do editor de cenas
// (/__alvo/ds/chefe/<nome>/malha: o "gravar no chefe" e o "reduzir → gravar no chefe" da aba Modelo, com o chefe aberto — a linha
// "chefe" do topo). A aba abre a malha de AGORA do chefe (a `fonte`: o original ou a editada) e o que chega aqui são os triângulos da
// vista — com as edições da sessão (cortar ✂, mover vértice, criar △…) já aplicadas — e o UV de cada canto.
//
//   node ferramentas/chefe-de-arquivo/malha-editada.mjs <config.json> <entrada.json>
//
// entrada: { pos: [x, y, z, …] (cm, como a aba mostra: × 100 com o pé do ORIGINAL em y = 0; três cantos por triângulo),
//            uv: [u, v, …] (dois por canto), reduzir?: <triângulos> }
// Volta ao espaço do original; com `reduzir`, o Blender (blender.py `reduzirchefe`) reduz guardando o UV; solda e grava como a nova
// fonte (fonte.mjs `gravarFonte`: a textura do original, o desfazer de um passo, o rigar.mjs). A última linha da saída é { ok, antes, depois }.
import fs from 'node:fs';
import { lerConfig, daVista, blender, soldar, gravarFonte } from './fonte.mjs';

const falhar = (m) => { console.error(`[malha-editada] ${m}`); console.log(JSON.stringify({ ok: false, erro: m })); process.exit(1); };
const [arqCfg, arqEnt] = process.argv.slice(2);
if (!arqCfg || !arqEnt) falhar('uso: node ferramentas/chefe-de-arquivo/malha-editada.mjs <config.json> <entrada.json>');
const { cfg } = lerConfig(arqCfg);
const ent = JSON.parse(fs.readFileSync(arqEnt, 'utf8'));
let { pos, uv } = ent;
if (!Array.isArray(pos) || !pos.length || pos.length % 9 || !Array.isArray(uv) || uv.length !== (pos.length / 3) * 2 || !pos.every(Number.isFinite) || !uv.every(Number.isFinite)) falhar('entrada torta');
if (!cfg.original || !cfg.caixa) falhar('o config não tem `original` e `caixa` (o modelo de onde a aba parte e a caixa dele)');
const antes = pos.length / 9;
pos = daVista(pos, cfg.caixa);
try {
  if (ent.reduzir != null) {
    const alvo = Math.round(Number(ent.reduzir));
    if (!(alvo >= 50)) falhar('reduzir para quantos? (50 ou mais)');
    if (alvo < antes) ({ pos, uv } = blender('reduzirchefe', { pos, uv }, alvo));
  }
  const r = gravarFonte(arqCfg, soldar(pos, uv));
  console.log(JSON.stringify({ ok: true, antes, depois: r.triangulos }));
} catch (e) { falhar(e.message); }
