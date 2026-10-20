import * as THREE from 'three';

/**
 * O FXAA (20/10/2026; opções avançadas → Antisserrilhado → FXAA): o antisserrilhado de
 * pós-processo, leve, que se liga e desliga NA HORA (o MSAA da placa só se escolhe ao criar o
 * contexto WebGL, ao reabrir o jogo). O quadro é desenhado num alvo do tamanho da tela e, no fim
 * do quadro (`apresentar`, depois do clarão), uma passada só suaviza as bordas e põe na tela.
 *
 * AS CORES IGUAIS ÀS DA TELA, SEM SHADER NOVO: desenhando num alvo comum, o three.js tira o tom
 * (ACES) e a conversão sRGB — os programas seriam OUTROS (compilando no meio do jogo) e os shaders
 * que escrevem a cor crua (as partículas, a névoa) mudariam de cor. O alvo é marcado como o da
 * realidade virtual (`isXRRenderTarget`) com a cor em sRGB: o three.js aplica o tom e o sRGB nele
 * como na tela (vendor/three.module.js, `getParameters` e `setProgram`), os programas são os
 * MESMOS, e a cor do fundo e da névoa também (`getUnlitUniformColorSpace`). O alvo é RGBA8 sem a
 * conversão da placa: a cor criada com `NoColorSpace` (RGBA8) e só depois marcada sRGB — criada
 * já em sRGB, a placa o faria SRGB8_ALPHA8 e codificaria a cor duas vezes.
 *
 * O ALVO FICA LIGADO (`setRenderTarget`) entre os quadros: todo desenho do jogo vai nele sem que
 * ninguém precise saber (o aquecimento, as consultas do clarão contra a profundidade dele). Quem
 * desenha noutro alvo devolve o de antes (a sombra, o reflexo e o PMREM do three.js já fazem;
 * as fotos dos cartazes, lod.js, também).
 */
/**
 * Um alvo "como a tela" (o truque acima): o mesmo tom e o mesmo sRGB da tela, os mesmos programas.
 * `amostras` > 0 = com MSAA (a medição do carregamento, medidor.js, mede o MSAA assim).
 */
export function alvoDeTela(amostras = 0) {
  const a = new THREE.WebGLRenderTarget(1, 1, { type: THREE.UnsignedByteType, depthBuffer: true, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, samples: amostras });
  a.isXRRenderTarget = true;
  return a;
}

/** O alvo em `w`×`h` (refeito só se mudou): a cor criada RGBA8 e só depois marcada sRGB. */
export function ajustarAlvo(r, a, w, h) {
  if (w === a.width && h === a.height && a.texture.colorSpace === THREE.SRGBColorSpace) return false;
  a.texture.colorSpace = THREE.NoColorSpace;
  a.setSize(w, h);
  r.initRenderTarget(a);
  a.texture.colorSpace = THREE.SRGBColorSpace;
  return true;
}

export class Fxaa {
  constructor(renderer) {
    this.r = renderer;
    this.alvo = alvoDeTela();
    this.tam = new THREE.Vector2();
    this.material = new THREE.ShaderMaterial({
      uniforms: { tQuadro: { value: this.alvo.texture }, uPasso: { value: new THREE.Vector2(1, 1) } },
      depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      // o FXAA "de console" (Timothy Lottes): o brilho dos 4 cantos dá a direção da borda, e a cor
      // é a média ao longo dela; onde não há borda (contraste pequeno) fica o ponto do meio
      fragmentShader: `
        uniform sampler2D tQuadro; uniform vec2 uPasso; varying vec2 vUv;
        const vec3 BRILHO = vec3(0.299, 0.587, 0.114);
        void main() {
          vec3 m = texture2D(tQuadro, vUv).rgb;
          float lNO = dot(texture2D(tQuadro, vUv + vec2(-1.0, 1.0) * uPasso).rgb, BRILHO);
          float lNE = dot(texture2D(tQuadro, vUv + vec2(1.0, 1.0) * uPasso).rgb, BRILHO);
          float lSO = dot(texture2D(tQuadro, vUv + vec2(-1.0, -1.0) * uPasso).rgb, BRILHO);
          float lSE = dot(texture2D(tQuadro, vUv + vec2(1.0, -1.0) * uPasso).rgb, BRILHO);
          float lM = dot(m, BRILHO);
          float lMin = min(lM, min(min(lNO, lNE), min(lSO, lSE)));
          float lMax = max(lM, max(max(lNO, lNE), max(lSO, lSE)));
          if (lMax - lMin < max(0.0312, lMax * 0.125)) { gl_FragColor = vec4(m, 1.0); return; }
          vec2 dir = vec2(-((lNO + lNE) - (lSO + lSE)), (lNO + lSO) - (lNE + lSE));
          float reduz = max((lNO + lNE + lSO + lSE) * 0.25 * 0.125, 1.0 / 128.0);
          float menor = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduz);
          dir = clamp(dir * menor, vec2(-8.0), vec2(8.0)) * uPasso;
          vec3 a = 0.5 * (texture2D(tQuadro, vUv + dir * (1.0 / 3.0 - 0.5)).rgb + texture2D(tQuadro, vUv + dir * (2.0 / 3.0 - 0.5)).rgb);
          vec3 b = a * 0.5 + 0.25 * (texture2D(tQuadro, vUv - dir * 0.5).rgb + texture2D(tQuadro, vUv + dir * 0.5).rgb);
          float lB = dot(b, BRILHO);
          gl_FragColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
        }`,
    });
    const tela = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    tela.frustumCulled = false;
    this.cena = new THREE.Scene();
    this.cena.add(tela);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** O alvo no tamanho do que se desenha (a tela × a resolução; ou `w`×`h`); refeito só quando muda. */
  ajustar(w, h) {
    const t = w ? this.tam.set(w, h) : this.r.getDrawingBufferSize(this.tam);
    if (ajustarAlvo(this.r, this.alvo, t.x, t.y)) this.material.uniforms.uPasso.value.set(1 / t.x, 1 / t.y);
  }

  /** A passada do FXAA do alvo para `destino` (null = a tela). */
  passada(destino = null) {
    const r = this.r, auto = r.autoClear;
    r.setRenderTarget(destino);
    r.autoClear = false;   // (a passada cobre a tela inteira)
    r.render(this.cena, this.cam);
    r.autoClear = auto;
  }

  /** Liga: o shader da passada compilado agora, e o alvo passa a receber os desenhos. */
  ligar() {
    this.r.setRenderTarget(null);
    this.r.compile(this.cena, this.cam);
    this.ajustar();
    this.r.setRenderTarget(this.alvo);
  }

  /** No fim do quadro: a passada para a tela; e o alvo volta a receber os desenhos. */
  apresentar() {
    this.passada(null);
    this.ajustar();
    this.r.setRenderTarget(this.alvo);
  }

  desligar() {
    if (this.r.getRenderTarget() === this.alvo) this.r.setRenderTarget(null);
    this.alvo.dispose();
  }
}
