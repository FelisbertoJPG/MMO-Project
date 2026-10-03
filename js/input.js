// Teclado + mouse com estados "segurando", "pressionou neste frame" e "soltou neste frame"
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressedSet = new Set();
    this.releasedSet = new Set();
    this.mouseDown = [false, false, false];
    this.mousePressedArr = [false, false, false];
    this.mouseReleasedArr = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    // CELULAR (js/toque.js): sem mouse travado; os botões na tela apertam as
    // MESMAS teclas e botões virtuais (`apertar`/`soltar`), e o joystick dá um
    // eixo analógico (`eixo` = {x: direita, z: frente}, de -1 a 1). O jogo não
    // sabe de onde veio a tecla — é o que deixa o combate, o MMO e a sala
    // funcionarem no toque sem uma linha a mais.
    this.toque = false;
    this.eixo = null;

    window.addEventListener('keydown', (e) => {
      // Digitando numa caixa de texto (login, mensagem): a tecla é do texto, não do jogo
      if (e.target instanceof Element && e.target.closest('input, textarea')) return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressedSet.add(e.code);
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.releasedSet.add(e.code);
    });
    window.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.mouseDown[e.button] = true;
      this.mousePressedArr[e.button] = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (this.mouseDown[e.button]) this.mouseReleasedArr[e.button] = true;
      this.mouseDown[e.button] = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    window.addEventListener('wheel', (e) => { if (this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('blur', () => this.clearAll());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.mouseDown = [false, false, false];
    });
  }

  requestLock() {
    if (this.toque) return;   // no celular não há mouse para travar
    const p = this.canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  // ---- teclas e botões VIRTUAIS (os controles de toque) ----
  apertar(code) { if (!this.down.has(code)) this.pressedSet.add(code); this.down.add(code); }
  soltar(code) { if (this.down.delete(code)) this.releasedSet.add(code); }
  mouseApertar(b) { this.mouseDown[b] = true; this.mousePressedArr[b] = true; }
  mouseSoltar(b) { if (this.mouseDown[b]) this.mouseReleasedArr[b] = true; this.mouseDown[b] = false; }

  isDown(code) { return this.down.has(code); }
  pressed(code) { return this.pressedSet.has(code); }
  released(code) { return this.releasedSet.has(code); }
  mousePressed(b) { return this.mousePressedArr[b]; }
  mouseReleased(b) { return this.mouseReleasedArr[b]; }

  clearAll() {
    this.down.clear();
    this.mouseDown = [false, false, false];
    this.eixo = null;
    this.endFrame();
  }

  endFrame() {
    this.pressedSet.clear();
    this.releasedSet.clear();
    this.mousePressedArr = [false, false, false];
    this.mouseReleasedArr = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }
}
