#!/usr/bin/env node
// GUARDAR A FORMA depois de mudar as JUNTAS de um corpo de arquivo (02/11/2026; o Masculino, a junta da cabeça): os pesos são refeitos (o
// "calor" do Blender) e um peso de 1% a 8% num braço, que aparece ou some, leva o ponto junto na ida para a pose T: até 1 cm no ombro, de um
// lado só. As edições e o formato da pose T são do dono, e mudar a junta não deve mexer neles. Aqui cada ponto que saiu do lugar tem a posição
// corrigida na `<nome>-simples.json` (a malha de entrada), o corpo é refeito e a conta se repete até voltar:
//
//   node ferramentas/corpo-de-arquivo/guardar-forma.mjs <recorte.json> <corpo-de-antes.json> [--ate-x 12]
//
// `corpo-de-antes.json` = a cópia de assets/corpos/<nome>.json de antes da mudança (a mesma malha). Só corrige perto do tronco (|x| até --ate-x cm):
// neles o peso no braço é pequeno e o giro é quase nenhum. Nos braços o que muda fica abaixo de 1 mm e a conta não valeria.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url)), RAIZ = path.resolve(AQUI, '../..');
const args = process.argv.slice(2), recorte = args[0], arqAntes = args[1];
const falha = (m) => { console.error(`[corpo] ${m}`); process.exit(1); };
if (!recorte || !arqAntes) falha('uso: guardar-forma.mjs <recorte.json> <corpo-de-antes.json> [--ate-x 12]');
const i = args.indexOf('--ate-x'), ATE_X = i < 0 ? 12 : Number(args[i + 1]);
const cfg = JSON.parse(fs.readFileSync(path.resolve(RAIZ, recorte), 'utf8'));
const ARQ = path.join(AQUI, `${cfg.nome}-simples.json`), CORPO = path.join(RAIZ, 'assets/corpos', `${cfg.nome}.json`), k = cfg.cmPorUnidade;
if (!k) falha('o recorte não tem cmPorUnidade');
const de64 = (s, T) => { const b = Buffer.from(s, 'base64'); return new T(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const lerP = (f) => { const c = JSON.parse(fs.readFileSync(f, 'utf8')); return { P: de64(c.pos, Float32Array), I: de64(c.idx32, Uint32Array) }; };
const A = lerP(path.resolve(arqAntes));
const VOLTAS = 8;
for (let volta = 1; volta <= VOLTAS; volta++) {
  const B = lerP(CORPO);
  if (A.I.length !== B.I.length || A.I.some((v, n) => v !== B.I[n])) falha('o corpo de antes não é da mesma malha');
  const s = JSON.parse(fs.readFileSync(ARQ, 'utf8'));
  let n = 0, pior = 0;
  for (let v = 0; v < A.P.length / 3; v++) {
    if (Math.abs(A.P[v * 3]) > ATE_X) continue;
    const d = [0, 1, 2].map((e) => A.P[v * 3 + e] - B.P[v * 3 + e]), q = Math.hypot(...d);
    if (q <= 0.001) continue;
    n++; pior = Math.max(pior, q);
    for (let e = 0; e < 3; e++) s.pos[v * 3 + e] += d[e] / k;
  }
  console.log(`[corpo] volta ${volta}: ${n} ponto(s) fora do lugar, o pior a ${pior.toFixed(4)} cm`);
  if (!n) break;
  if (volta === VOLTAS) falha(`não voltou ao lugar em ${VOLTAS - 1} voltas: confira a mudança nas juntas`);
  fs.writeFileSync(ARQ, JSON.stringify(s) + '\n');
  execFileSync(process.execPath, [path.join(AQUI, 'importar.mjs'), recorte], { cwd: RAIZ, stdio: 'ignore' });
}
