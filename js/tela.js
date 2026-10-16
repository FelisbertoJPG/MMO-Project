/**
 * A TELA DEITADA POR CSS (15/10/2026). No celular o jogo é deitado: o Android põe a página em
 * tela cheia e trava a horizontal (`ControlesToque.deitarTela`), mas o Safari do iPhone não tem
 * nem tela cheia nem trava — o "toque aqui para deitar a tela" não fazia nada, e com o
 * bloqueio de rotação ligado o jogo ficava preso no "Gire o celular". Ali (navegador que não
 * deita sozinho, ou trava que falhou), jogando e com a tela EM PÉ, a PÁGINA gira 90° pelo CSS
 * (`html.girada`): o corpo da página fica deitado, com o tamanho da tela trocado, e quem segura
 * o celular deitado (o alto do aparelho para a esquerda) vê o jogo de pé. Com o celular deitado
 * de verdade (rotação livre), a tela já é larga e nada gira.
 *
 * Quem mede a tela pergunta AQUI (`tela.w`, `tela.h`: o tamanho como o jogo a vê) e quem lê um
 * dedo converte o ponto (`pontoNaTela`): `innerWidth`/`clientX`/`getBoundingClientRect` são da
 * tela FÍSICA. O CSS usa `--vw`/`--vh` (1% da tela do jogo) no lugar de `vw`/`vh`.
 */
export const tela = {
  girada: false,
  get w() { return this.girada ? innerHeight : innerWidth; },
  get h() { return this.girada ? innerWidth : innerHeight; },
};

/** Um ponto da tela física (`clientX`/`clientY`) no sistema da página girada. */
export function pontoNaTela(x, y) { return tela.girada ? { x: y, y: innerWidth - x } : { x, y }; }

/** Um retângulo (`getBoundingClientRect`) no sistema da página girada. */
export function retanguloNaTela(r) {
  if (!tela.girada) return r;
  return { left: r.top, right: r.bottom, top: innerWidth - r.right, bottom: innerWidth - r.left, width: r.height, height: r.width };
}

let ultimo = null;
/**
 * Gira (ou desgira) a página. `deitar` = jogando no celular num navegador que não deita a tela
 * sozinho; só gira com a tela em pé. Chamada todo quadro pelo `ControlesToque` (só age quando
 * algo muda) — e avisa com um `resize`, que refaz o tamanho do quadro.
 */
export function atualizarTela(deitar) {
  const girada = !!deitar && innerHeight > innerWidth;
  const chave = `${girada}|${innerWidth}|${innerHeight}`;
  if (chave === ultimo) return;
  ultimo = chave;
  tela.girada = girada;
  const raiz = document.documentElement, s = raiz.style;
  raiz.classList.toggle('girada', girada);
  s.setProperty('--tela-w', `${innerWidth}px`);
  s.setProperty('--tela-h', `${innerHeight}px`);
  s.setProperty('--vw', `${tela.w / 100}px`);
  s.setProperty('--vh', `${tela.h / 100}px`);
  dispatchEvent(new Event('resize'));
}
