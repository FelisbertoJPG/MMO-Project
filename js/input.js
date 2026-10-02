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
    const p = this.canvas.requestPointerLock?.();
    if (p && p.catch) p.catch(() => {});
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  isDown(code) { return this.down.has(code); }
  pressed(code) { return this.pressedSet.has(code); }
  released(code) { return this.releasedSet.has(code); }
  mousePressed(b) { return this.mousePressedArr[b]; }
  mouseReleased(b) { return this.mouseReleasedArr[b]; }

  clearAll() {
    this.down.clear();
    this.mouseDown = [false, false, false];
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
