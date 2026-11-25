#!/usr/bin/env node
// A SIMPLIFICAÇÃO DE UM CHEFE DE ARQUIVO (25/11/2026; a Mycohydra — o dono: "carrega no modelo o corpo da hydra, porém pra edição,
// simplificação"): a ferramenta SIMPLIFICAR da aba Modelo do editor, com o chefe aberto (a linha "chefe" do topo), igual à do corpo de
// arquivo (ferramentas/corpo-de-arquivo/simplificar.mjs) — o mesmo modo do Blender (blender.py `simplificar`).
//
//   node ferramentas/chefe-de-arquivo/simplificar.mjs <config.json> [simplificar | desfazer | original]
//
// simplificar: lê o pedido `<nome>-simplificar.json` (a pintura da aba: `proteger`, `reduzir`, `juntar` — o meio de cada triângulo
//   pintado, em cm como a aba mostra — e `alvo`, o total de triângulos), dá a cada triângulo da malha de AGORA (a `fonte`) o grupo do meio
//   pintado mais perto (até 1,5 cm; o PROTEGER manda), e o Blender junta as ilhas do JUNTAR num ponto e reduz o resto, guardando o
//   formato e a UV. A malha nova vira a fonte (fonte.mjs `gravarFonte`: a de agora fica para o desfazer; o rigar.mjs refaz o esqueleto,
//   os pesos e a ficha). As marcas do JUNTAR são gastas (saem do pedido).
// desfazer: volta à malha de antes da última gravação (de novo: refaz).  original: volta ao modelo do Meshy (o desfazer traz de volta).
import fs from 'node:fs';
import { lerConfig, caminhos, lerGlb, paraVista, blender, gravarFonte, desfazerFonte, voltarAoOriginal } from './fonte.mjs';

const [arqCfg, acao = 'simplificar'] = process.argv.slice(2);
if (!arqCfg) { console.error('uso: node ferramentas/chefe-de-arquivo/simplificar.mjs <config.json> [simplificar | desfazer | original]'); process.exit(1); }
try {
  if (acao === 'desfazer') { desfazerFonte(arqCfg); console.log('[chefe] desfeito'); process.exit(0); }
  if (acao === 'original') { voltarAoOriginal(arqCfg); console.log('[chefe] de volta ao modelo original'); process.exit(0); }
  if (acao !== 'simplificar') throw new Error(`não conheço "${acao}"`);
  const { cfg } = lerConfig(arqCfg), c = caminhos(arqCfg, cfg);
  if (!cfg.caixa) throw new Error('o config não tem a `caixa` do original');
  const m = lerGlb(c.fonte), nt = m.idx.length / 3;
  // o meio de cada triângulo, em cm como a aba mostra, numa grade de 1,5 cm
  const L = 1.5, grade = new Map(), cel = (x) => Math.floor(x / L), meios = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) { const v = m.idx[t * 3 + k]; x += m.pos[v * 3]; y += m.pos[v * 3 + 1]; z += m.pos[v * 3 + 2]; }
    const p = paraVista(x / 3, y / 3, z / 3, cfg.caixa);
    meios.set(p, t * 3);
    const k = `${cel(p[0])},${cel(p[1])},${cel(p[2])}`;
    if (!grade.has(k)) grade.set(k, []);
    grade.get(k).push(t);
  }
  const maisPerto = (q) => {
    let b = -1, d = L * L;
    const cx = cel(q[0]), cy = cel(q[1]), cz = cel(q[2]);
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (let z = cz - 1; z <= cz + 1; z++) for (const t of grade.get(`${x},${y},${z}`) ?? []) {
      const e = (meios[t * 3] - q[0]) ** 2 + (meios[t * 3 + 1] - q[1]) ** 2 + (meios[t * 3 + 2] - q[2]) ** 2;
      if (e < d) { d = e; b = t; }
    }
    return b;
  };
  const pedido = fs.existsSync(c.pedido) ? JSON.parse(fs.readFileSync(c.pedido, 'utf8')) : {};
  const cats = new Array(nt).fill(0), contas = {};
  for (const [lista, cat] of [['reduzir', 2], ['juntar', 3], ['proteger', 1]]) {
    contas[lista] = 0;
    for (const q of pedido[lista] ?? []) { const t = maisPerto(q); if (t >= 0) { cats[t] = cat; contas[lista]++; } }
  }
  const alvo = Math.max(200, Math.round(Number(pedido.alvo) || nt));
  console.log(`[chefe] simplificando ${c.base}: ${nt} triângulos → ${alvo}; pintados: proteger ${contas.proteger}, reduzir muito ${contas.reduzir}, juntar ${contas.juntar}`);
  const uv = m.uv ?? new Float32Array((m.pos.length / 3) * 2);
  const nova = blender('simplificar', { pos: Array.from(m.pos), uv: Array.from(uv), idx: Array.from(m.idx), cats, alvo, simetria: 0 });
  if (!nova.idx?.length) throw new Error('o Blender não devolveu a malha');
  const r = gravarFonte(arqCfg, { pos: nova.pos, uv: nova.uv, idx: nova.idx, normal: nova.normal });
  if (pedido.juntar?.length) { pedido.juntar = []; fs.writeFileSync(c.pedido, JSON.stringify(pedido) + '\n'); }
  console.log(JSON.stringify({ ok: true, antes: nt, depois: r.triangulos }));
} catch (e) {
  console.error(`[chefe] ${e.message}`);
  console.log(JSON.stringify({ ok: false, erro: e.message }));
  process.exit(1);
}
