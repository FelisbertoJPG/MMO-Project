#!/usr/bin/env node
// "APLICAR NO ONLINE" DA ABA CABELO (17/11/2026; o dono: "criar mais um botão que vai servir de push, algo como 'Aplicar no Online' — o
// game online passa a conter aquele penteado com aquele nome pra aquele modelo escolhido"):
//
//   node ferramentas/penteados/publicar-penteado.mjs <id do penteado> --listas arquivo:masculino3
//
// 1. o id no FIM das --listas (registro.mjs: a lista do corpo escolhido na aba);
// 2. se algo do cabelo mudou desde o último commit, sobe a `versao` de assets/versao.json (quem está jogando recarrega em até 1 min);
// 3. commit SÓ dos arquivos do cabelo — assets/penteados.json, assets/penteados/moldes.json, os moldes que o penteado usa (a base e as
//    versões de cada corpo), as listas tocadas e a versao.json — e push. O resto do que estiver por commitar (o corpo, o código) fica.
// O penteados.json vai inteiro: os outros penteados SALVOS na aba vão junto. A última linha da saída é um JSON
// { ok, id, nome, listas, commit, versao, arquivos } — sem `commit`: já estava no online (a rota do editor a lê).
import { execFileSync } from 'node:child_process';
import { RAIZ, ler, existe, gravar, LISTA_VALIDA, moldesDoCodigo, lerRegistro, porNasListas } from './registro.mjs';

const args = process.argv.slice(2), opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : null; };
const ID = args[0], LISTAS = (opt('listas') ?? '').split(',').filter(Boolean);
const falhar = (m) => { console.error(`[online] ${m}`); console.log(JSON.stringify({ ok: false, erro: m })); process.exit(1); };
if (!/^[A-Za-z]{1,30}$/.test(ID ?? '') || !LISTAS.length || !LISTAS.every((l) => LISTA_VALIDA.test(l))) falhar('uso: node publicar-penteado.mjs <id> --listas arquivo:<nome>,raca:<id>[:feminino],humano:feminino');

// ---- o penteado: do arquivo (a aba Cabelo), de um molde registrado ou do código
const doArquivo = existe('assets/penteados.json') ? JSON.parse(ler('assets/penteados.json')).penteados ?? {} : {};
const registro = lerRegistro().moldes, doCodigo = moldesDoCodigo(), nomesDosMoldes = [...doCodigo, ...registro.map((m) => m.molde)];
const doRegistro = registro.find((m) => m.id === ID);
const p = doArquivo[ID] ?? (doRegistro ? { nome: doRegistro.nome, formas: [['molde', { molde: doCodigo.length + registro.indexOf(doRegistro) }]] } : null);
if (!p && !new RegExp(`^\\s+${ID}: \\{ nome:`, 'm').test(ler('js/penteado.js'))) falhar(`não há o penteado ${ID} (salve-o na aba Cabelo antes)`);
const nome = p?.nome ?? ID;
// (os moldes que ele usa: a base e as versões de cada corpo)
const moldes = new Set();
for (const formas of [p?.formas, ...Object.values(p?.corpos ?? {}).map((v) => v?.formas)]) for (const [t, m] of formas ?? []) {
  const n = t === 'molde' ? nomesDosMoldes[Math.round(m?.molde ?? 0)] : null;
  if (n) moldes.add(n);
}

// ---- 1. a lista do corpo
let feitas = [];
try { feitas = porNasListas(ID, LISTAS); } catch (e) { falhar(e.message); }

// ---- os arquivos do cabelo
const arquivos = ['assets/penteados.json', 'assets/penteados/moldes.json', ...[...moldes].map((n) => `assets/penteados/${n}.json`)];
for (const l of LISTAS) { const [t, q] = l.split(':'); if (t === 'arquivo') arquivos.push(`assets/corpos/${q}.json`, `ferramentas/corpo-de-arquivo/${q}.json`); else arquivos.push('assets/racas.json'); }
const lista = [...new Set(arquivos)].filter(existe);
const git = (...a) => execFileSync('git', a, { cwd: RAIZ, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const erroDoGit = (e) => String(e.stderr || e.message).trim().slice(-500);
let mudados;
try { mudados = git('status', '--porcelain', '--', ...lista).split('\n').filter(Boolean); } catch (e) { falhar(`git status: ${erroDoGit(e)}`); }
if (!mudados.length) {
  console.log(`[online] "${nome}" já está no online (nada do cabelo mudou desde o último commit)`);
  console.log(JSON.stringify({ ok: true, id: ID, nome, listas: feitas, commit: null, versao: null, arquivos: [] }));
  process.exit(0);
}

// ---- 2. a versão (quem está jogando recarrega)
const vtxt = ler('assets/versao.json'), vj = JSON.parse(vtxt), d = new Date();
const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, m = String(vj.versao ?? '').match(/^(\d{4}-\d{2}-\d{2})\.(\d+)$/);
vj.versao = m && m[1] === dia ? `${dia}.${Number(m[2]) + 1}` : `${dia}.1`;
vj.nota = `Penteado: ${nome}`.slice(0, 80);
gravar('assets/versao.json', JSON.stringify(vj, null, 2) + '\n', vtxt);
lista.push('assets/versao.json');

// ---- 3. commit (só estes arquivos) e push
let commit;
try {
  git('add', '--', ...lista);
  git('commit', '-m', `Penteado "${nome}" (${ID}) no online, na lista ${feitas.join(', ')} - o "aplicar no online" da aba Cabelo do editor. Versao ${vj.versao}`, '--', ...lista);
  commit = git('rev-parse', '--short', 'HEAD').trim();
} catch (e) { falhar(`não fiz o commit: ${erroDoGit(e)}`); }
try { git('push'); } catch (e) { falhar(`o commit ${commit} ficou só aqui: o push falhou (${erroDoGit(e)})`); }

console.log(`[online] "${nome}" (${ID}) no online: commit ${commit}, versão ${vj.versao}, ${mudados.length} arquivo(s) do cabelo`);
console.log(JSON.stringify({ ok: true, id: ID, nome, listas: feitas, commit, versao: vj.versao, arquivos: mudados.map((l) => l.slice(3)) }));
