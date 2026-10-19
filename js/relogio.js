/**
 * O RELÓGIO DE TESTE (19/10/2026) — para ver o jogo numa hora escolhida (o dia, o pôr do sol, a
 * noite) sem esperar o relógio de verdade (`horaDoMundo`, world.js: um dia a cada 20 min). Só
 * aparece com `?relogio` no endereço (http://localhost:5173/?relogio): um painel no canto com a
 * hora, uma régua de 0 a 24 h e "Soltar" (volta ao relógio de verdade). Ele só prende
 * `globalThis.__hora` NESTE navegador — o mesmo que `__hora = 12` no console —: os outros
 * jogadores do Mundo online continuam na hora deles.
 */
import { horaDoMundo } from './world.js';

const fmt = (h) => `${String(Math.floor(h) % 24).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

function montar() {
  const caixa = document.createElement('div');
  caixa.id = 'relogio-de-teste';
  caixa.style.cssText = 'position:fixed;top:8px;right:8px;z-index:99999;padding:8px 10px;background:rgba(10,10,14,.82);'
    + 'color:#eee;font:13px/1.3 sans-serif;border:1px solid #555;border-radius:6px;display:flex;gap:8px;align-items:center;user-select:none';
  caixa.innerHTML = '<span>Hora</span><b id="relogio-hora" style="min-width:44px">--:--</b>'
    + '<input id="relogio-regua" type="range" min="0" max="24" step="0.25" style="width:160px">'
    + '<button id="relogio-soltar" type="button" style="font:inherit;cursor:pointer">Soltar</button>';
  // (o clique no painel não pode chegar ao jogo: atacar, prender o mouse)
  for (const ev of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'click', 'wheel']) caixa.addEventListener(ev, (e) => e.stopPropagation());
  document.body.appendChild(caixa);
  const regua = caixa.querySelector('#relogio-regua'), hora = caixa.querySelector('#relogio-hora'), soltar = caixa.querySelector('#relogio-soltar');
  const mostrar = () => {
    const h = horaDoMundo();
    hora.textContent = fmt(h);
    if (document.activeElement !== regua) regua.value = h;
    soltar.disabled = !Number.isFinite(globalThis.__hora);
  };
  regua.addEventListener('input', () => { globalThis.__hora = +regua.value % 24; mostrar(); });
  soltar.addEventListener('click', () => { globalThis.__hora = null; regua.blur(); mostrar(); });
  mostrar();
  setInterval(mostrar, 1000);
}

if (new URLSearchParams(location.search).has('relogio')) {
  if (document.body) montar(); else addEventListener('DOMContentLoaded', montar);
}
