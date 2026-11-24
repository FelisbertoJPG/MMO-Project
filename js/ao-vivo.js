/**
 * AO VIVO (21/11/2026): o BALANCEAMENTO e a ligação com o Editor de Árvore.
 *
 * Em todo lugar (o Pages também), o jogo lê `assets/balanco.json` ao abrir (ficha.js, BALANCO).
 * No jogo LOCAL (localhost), ele também escuta o Editor de Árvore por um canal de eventos — o
 * editor mora na aba Árvore do Editor de Personagem (porta 8090, /__alvo/ds/arvore/; 24/11/2026)
 * e ainda roda sozinho (`node ferramentas/habilidades/editor-arvore.mjs`, 5181): tenta um, o outro:
 *   • `catalogo` — o editor gravou a página dos Caminhos e regerou `assets/habilidades.json`:
 *     a tela K relê e redesenha (os pontos não mudam);
 *   • `balanco` — o dono mexeu num número do painel Balanceamento: vale no próximo golpe.
 * Sem o editor ligado, tenta de novo a cada 20 s (dois erros de conexão no console, nada mais).
 * O atraso é do navegador (`setTimeout`), não do jogo: a ligação continua com o jogo pausado.
 */
import { aplicarBalanco } from './ficha.js';

const EDITORES = ['http://127.0.0.1:8090/__alvo/ds/arvore/eventos', 'http://127.0.0.1:5181/eventos'];

export function ligarAoVivo(game) {
  game.arvore?.carregar().catch((e) => console.warn('[arvore]', e));   // os custos dos cards (caminhos.js)
  fetch('assets/balanco.json', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => j && aplicarBalanco(j))
    .catch((e) => console.warn('[balanco]', e));
  if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname) || typeof EventSource === 'undefined') return;
  let qual = 0;   // o editor da vez (EDITORES); caiu ou não respondeu, vai para o próximo
  const ligar = () => {
    const es = new EventSource(EDITORES[qual]);
    es.addEventListener('catalogo', () => game.arvore?.recarregar());
    es.addEventListener('balanco', (e) => {
      try { aplicarBalanco(JSON.parse(e.data)); game.ui?.toast('Balanceamento atualizado pelo editor.'); } catch { /* evento torto: ignora */ }
    });
    es.onerror = () => { es.close(); qual = (qual + 1) % EDITORES.length; setTimeout(ligar, qual ? 0 : 20000); };
  };
  ligar();
}
