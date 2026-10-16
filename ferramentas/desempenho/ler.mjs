#!/usr/bin/env node
/**
 * LÊ O RELATÓRIO AUTOMÁTICO DE DESEMPENHO (js/telemetria.js → Supabase, migration 0003).
 * Node 18+, sem dependências.
 *
 *   node ferramentas/desempenho/ler.mjs              o resumo dos últimos 7 dias
 *   node ferramentas/desempenho/ler.mjs --dias 2     outro período
 *   node ferramentas/desempenho/ler.mjs --id 123     o relatório inteiro de um registro
 *   node ferramentas/desempenho/ler.mjs --json       tudo, cru
 *
 * A chave de leitura vem de DESEMPENHO_CHAVE ou de `chave.txt` nesta pasta (fora do git) e
 * tem de ser a mesma de `masmorra.segredos` (ver a migration 0003).
 */
import { readFileSync, existsSync } from 'node:fs';

const URL_ = 'https://shclhlbfkdnnqxboiuqc.supabase.co', CHAVE_API = 'sb_publishable_FxGEPSbXqJEBBUqG9ugJ6w_3z5AaVzC';   // (as de js/rede/supabase.js)
const args = process.argv.slice(2);
const opcao = (n, p = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && i + 1 < args.length ? args[i + 1] : p; };
const arquivo = new URL('./chave.txt', import.meta.url);
const chave = process.env.DESEMPENHO_CHAVE || (existsSync(arquivo) ? readFileSync(arquivo, 'utf8').trim() : '');
if (!chave) { console.error('Sem a chave de leitura: DESEMPENHO_CHAVE ou ferramentas/desempenho/chave.txt.'); process.exit(1); }

const dias = Number(opcao('dias', 7)), id = opcao('id') ? Number(opcao('id')) : null;
const r = await fetch(`${URL_}/rest/v1/rpc/ler_desempenho`, {
  method: 'POST',
  headers: { apikey: CHAVE_API, 'content-type': 'application/json', 'content-profile': 'masmorra' },
  body: JSON.stringify({ p_chave: chave, p_desde: new Date(Date.now() - dias * 86400000).toISOString(), p_limite: 2000 }),
});
if (!r.ok) {
  const t = await r.text();
  console.error(`O Supabase respondeu ${r.status}: ${t.slice(0, 300)}`);
  if (r.status === 404) console.error('(a migration 0003_desempenho.sql ainda não foi rodada no SQL Editor?)');
  process.exit(1);
}
const linhas = await r.json();
if (args.includes('--json')) { console.log(JSON.stringify(linhas, null, 2)); process.exit(0); }
if (id != null) {
  const l = linhas.find((x) => x.id === id);
  if (!l) { console.error(`Registro ${id} não achado nos últimos ${dias} dias.`); process.exit(1); }
  const { dados, ...resto } = l;
  console.log(JSON.stringify(resto, null, 2));
  if (dados?.relatorio) { console.log('\n' + dados.relatorio); delete dados.relatorio; }
  console.log(JSON.stringify(dados, null, 2));
  process.exit(0);
}

// ---- o resumo
const curto = (ua = '') => {
  const m = ua.match(/\((iPhone|iPad)[^)]*OS (\d+[_\d]*)/) ?? ua.match(/Android [\d.]+; ([^;)]+)/);
  const nav = ua.match(/(CriOS|FxiOS|EdgA|SamsungBrowser|Firefox|Chrome|Version)\/(\d+)/);
  const sis = m ? (m[1] === 'iPhone' || m[1] === 'iPad' ? `${m[1]} iOS ${m[2].replace(/_/g, '.')}` : m[1].trim()) : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '?';
  const navegador = nav ? `${{ Version: 'Safari', CriOS: 'Chrome iOS' }[nav[1]] ?? nav[1]} ${nav[2]}` : '';
  return `${sis}${navegador ? ' · ' + navegador : ''}${ua.match(/memória (\S+) GB/) ? ` · ${ua.match(/memória (\S+) GB/)[1]} GB` : ''}`;
};
const gpuCurta = (g = '') => g.replace(/^ANGLE \(([^,]+), /, '$1 ').replace(/ \(0x[0-9A-F]+\)| Direct3D.*| OpenGL ES.*|, D3D11\)|\)$/g, '').slice(0, 48);
const data = (s) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const mediana = (a) => { const o = a.filter(Number.isFinite).sort((x, y) => x - y); return o.length ? o[Math.floor(o.length / 2)] : NaN; };
const f = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : '—');

const sessoes = new Set(linhas.map((l) => l.sessao));
console.log(`${linhas.length} registros nos últimos ${dias} dias · ${sessoes.size} sessões · ${linhas.filter((l) => l.tipo === 'caiu').length} quedas · ${linhas.filter((l) => l.tipo === 'erro').length} erros\n`);

// por aparelho (a placa + o sistema)
const grupos = new Map();
for (const l of linhas) {
  const k = `${gpuCurta(l.gpu ?? '?')} | ${curto(l.aparelho)}`;
  if (!grupos.has(k)) grupos.set(k, { sessoes: new Set(), fps: [], cpu: [], ch: [], quedas: 0, erros: 0, qual: new Set() });
  const g = grupos.get(k);
  g.sessoes.add(l.sessao);
  if (l.tipo === 'jogo') { g.fps.push(l.fps); g.cpu.push(l.cpu); g.ch.push(l.chamadas); if (l.qualidade) g.qual.add(l.qualidade); }
  if (l.tipo === 'caiu') g.quedas++;
  if (l.tipo === 'erro') g.erros++;
}
console.log('## Por aparelho (mediana dos relatórios de jogo)');
console.log('sessões  FPS    CPU ms  chamadas  quedas erros  qualidade        placa | aparelho');
for (const [k, g] of [...grupos].sort((a, b) => b[1].sessoes.size - a[1].sessoes.size)) {
  console.log(`${String(g.sessoes.size).padStart(6)}  ${f(mediana(g.fps)).padStart(5)}  ${f(mediana(g.cpu)).padStart(6)}  ${f(mediana(g.ch), 0).padStart(8)}  ${String(g.quedas).padStart(6)} ${String(g.erros).padStart(5)}  ${[...g.qual].join('/').padEnd(15)}  ${k}`);
}

const problemas = linhas.filter((l) => l.tipo !== 'jogo').slice(0, 30);
if (problemas.length) {
  console.log('\n## Quedas e erros (os mais novos)');
  for (const l of problemas) {
    const d = l.dados ?? {};
    const oque = l.tipo === 'caiu'
      ? (d.quando === 'abrindo' ? `caiu ABRINDO em "${d.etapa}" (${d.segundos ?? '?'} s)` : `caiu JOGANDO (${d.jogado ?? '?'} s jogados, ${d.regiao ?? '?'}, ${l.fps ?? '?'} quadros/s, memória JS ${d.memoria ?? '?'} MB)`)
      : `ERRO: ${d.erro ?? '?'}${d.etapa ? ` (em "${d.etapa}")` : ''}`;
    console.log(`#${l.id} ${data(l.criado)} v${l.versao ?? '?'} · ${oque} · ${gpuCurta(l.gpu ?? '?')} · ${curto(l.aparelho)}`);
  }
}

const jogos = linhas.filter((l) => l.tipo === 'jogo').slice(0, 25);
if (jogos.length) {
  console.log('\n## Relatórios de jogo (os mais novos; o texto inteiro: --id N)');
  for (const l of jogos) console.log(`#${l.id} ${data(l.criado)} v${l.versao ?? '?'} · ${l.modo ?? '?'} · ${(l.qualidade ?? '?').padEnd(7)} · ${f(l.fps).padStart(5)} quadros/s · CPU ${f(l.cpu)} ms · ${l.chamadas ?? '?'} chamadas · ${l.dados?.jogado ?? '?'} s · ${gpuCurta(l.gpu ?? '?')} · ${curto(l.aparelho)}`);
}
