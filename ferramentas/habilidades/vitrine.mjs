/**
 * VITRINE DA ÁRVORE DE HABILIDADES — uma página local só com a tela da tecla K, aberta direto
 * e com pontos infinitos, para ver o layout e decidir como ela fica. Nada é gravado.
 *
 *   node ferramentas/habilidades/vitrine.mjs        → http://localhost:5180
 *   (VITRINE_PORTA=xxxx muda a porta)
 *
 * Usa os MESMOS arquivos do jogo (js/arvore.js, css/style.css, assets/habilidades.json e o
 * bloco #arvore do index.html, lido a cada pedido): mudou lá, é só recarregar a página.
 * Fica fora do server.js de propósito: não entra na lista branca nem vai para o Pages.
 */
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const raiz = fileURLToPath(new URL('../../', import.meta.url));
const porta = Number(process.env.VITRINE_PORTA) || 5180;
const ARQUIVOS = {
  '/css/style.css': 'text/css; charset=utf-8',
  '/js/arvore.js': 'text/javascript; charset=utf-8',
  '/js/ficha.js': 'text/javascript; charset=utf-8',
  '/assets/habilidades.json': 'application/json; charset=utf-8',
};

/** O bloco da tela da árvore, tirado do index.html do jogo (do comentário ao fim do overlay). */
function blocoDaArvore() {
  const s = readFileSync(raiz + 'index.html', 'utf8');
  const i = s.indexOf('<!-- Árvore de habilidades');
  const dica = s.indexOf('[K / Esc]', i);
  if (i < 0 || dica < 0) throw new Error('o bloco #arvore não está no index.html');
  const fim = s.indexOf('</div>', s.indexOf('</div>', dica) + 6) + 6;
  return s.slice(i, fim).replace(/<div class="hint">[^<]*<\/div>/,
    '<div class="hint">Vitrine: pontos infinitos, nada é gravado · roda do mouse: aproximar · arrastar: mover · <label style="cursor:pointer"><input type="checkbox" id="tudo"> mostrar o que fica escondido</label> · <button id="maestria">+ Adicionar maestria</button> <button id="zerar">Zerar a árvore</button></div>');
}

const pagina = () => `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Vitrine da Árvore</title>
  <link rel="icon" href="data:," />
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=EB+Garamond:ital@0;1&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="css/style.css" />
  <style>body { background: #0a0908; } #arvore { background: radial-gradient(circle at 40% 45%, #1d1610, #050404 75%); }</style>
</head>
<body>
${blocoDaArvore()}
<div id="toast-vitrine" style="position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9;font-family:var(--serif);color:var(--gold)"></div>
<script type="module">
  import { ArvoreUI } from './js/arvore.js';
  import { habilidadesVazias } from './js/ficha.js';

  // pontos infinitos: o nível só existe para a conta não travar
  class Vitrine extends ArvoreUI {
    disponiveis() { return 1e9; }
    renderLado() {
      super.renderLado();
      const b = this.pontos.querySelector('b');
      if (b) b.textContent = '∞';
    }
  }
  const aviso = document.getElementById('toast-vitrine');
  let tempo = 0;
  const game = {
    player: { level: 1e9, habilidades: habilidadesVazias() },
    ui: { toast: (t) => { aviso.textContent = t; clearTimeout(tempo); tempo = setTimeout(() => (aviso.textContent = ''), 2000); } },
    salvar() {},
    sfx: {},
  };
  const arvore = new Vitrine(game);
  window.arvore = arvore;
  arvore.juramentosLiberados = true;   // na vitrine dá para jurar (no jogo, só com o refazer)
  arvore.fechar = () => {};          // aqui ela nunca fecha
  arvore.abrir();
  // descobre o próximo elemento (a ordem do catálogo), para ver o aro chegar até ele
  const btMaestria = document.getElementById('maestria');
  const proximo = () => arvore.cat?.elementos.find((e) => !arvore.conhecido(e));
  const marcar = () => { const e = proximo(); btMaestria.disabled = !e; btMaestria.textContent = e ? '+ Adicionar maestria (' + e.nome + ')' : 'Todas as maestrias descobertas'; };
  btMaestria.addEventListener('click', () => { const e = proximo(); if (e) arvore.descobrir(e.id); marcar(); });
  setTimeout(marcar, 800);
  document.getElementById('zerar').addEventListener('click', () => {
    game.player.habilidades = habilidadesVazias();
    arvore.pend = {};
    arvore.descobertos.clear();
    arvore.antesFace = {};
    arvore.vistaInicial();
    arvore.render();
    marcar();
  });
  document.getElementById('tudo').addEventListener('change', (e) => {
    arvore.mostrarTudo = e.target.checked;
    arvore.vistaInicial();
    arvore.render();
  });
</script>
</body>
</html>`;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x').pathname;
  try {
    if (url === '/' || url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(pagina());
    }
    if (ARQUIVOS[url]) {
      res.writeHead(200, { 'Content-Type': ARQUIVOS[url], 'Cache-Control': 'no-store' });
      return res.end(readFileSync(raiz + url.slice(1)));
    }
    res.writeHead(404); res.end('404');
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(String(e.message));
  }
}).listen(porta, '127.0.0.1', () => console.log(`Vitrine da árvore: http://localhost:${porta}`));
