import { NASCER } from './world.js';
import { tela } from './tela.js';
import { alvoDeTela, ajustarAlvo, Fxaa } from './fxaa.js';

/**
 * A MEDIÇÃO DO CARREGAMENTO (20/10/2026; a qualidade "Automático", graficos.js): no fim do
 * carregamento, com os shaders já aquecidos, o jogo desenha o lugar mais pesado que se conhece
 * — o acampamento, de onde se acorda no Mundo online, olhando para os quatro lados — no tamanho
 * da TELA INTEIRA (o jogo é jogado maximizado; a placa paga por pixel: o painel do VS Code a
 * 1260×790 rodava a 60 e o Chrome a 1920×945 a 44 na mesma Radeon 740M) e mede, num alvo fora da
 * tela (fxaa.js, `alvoDeTela`: os MESMOS programas da tela, nada compila):
 *   • `ultra`: a qualidade Ultra com MSAA (um alvo de 4 amostras: o MSAA da placa, medido sem
 *     reabrir o jogo);
 *   • `fxaa`: o Alto com a passada do FXAA;
 *   • `alto`: o Alto sem antisserrilhado.
 * O tempo da PLACA vem do cronômetro da GPU (`EXT_disjoint_timer_query_webgl2`); sem ele, o do
 * quadro inteiro esperando a placa (`gl.finish`: no carregamento pode, no meio do jogo nunca). O
 * da CPU é o do `render` (o resto do laço soma ~3 ms: `escolherPerfil`, graficos.js).
 * Tudo volta como estava (o jogador, a câmera, o clima, a qualidade, o alvo).
 */
const AQUECE = 4, QUADROS = 16;

export async function medirDesempenho(game) {
  const r = game.renderer, w = game.world, G = game.graficos, gl = r.getContext();
  const p = game.player, cam = game.camera, amb = w.ambience, sol = amb?.lua;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  const esperar = () => new Promise((ok) => setTimeout(ok, 0));
  // o tamanho: a tela inteira na resolução do Alto (o Ultra tem a mesma)
  const dpr = Math.min(devicePixelRatio, 2);
  const W = Math.round(Math.max(tela.w, screen.width || 0) * dpr), H = Math.round(Math.max(tela.h, (screen.height || 0) * 0.88) * dpr);
  const antes = {
    pos: p.pos.clone(), camPos: cam.position.clone(), camQ: cam.quaternion.clone(), aspecto: cam.aspect,
    k: amb?.k, kc: amb?.kc, nome: G.nome, alvo: r.getRenderTarget(),
  };
  const msaa = alvoDeTela(4), plano = alvoDeTela(0), saida = alvoDeTela(0), fx = new Fxaa(r);
  const medidas = {};
  try {
    ajustarAlvo(r, msaa, W, H); ajustarAlvo(r, plano, W, H); ajustarAlvo(r, saida, W, H); fx.ajustar(W, H);
    cam.aspect = W / H; cam.updateProjectionMatrix();
    const { pos } = w.retorno(NASCER.id, 0);
    p.pos.copy(pos);
    if (amb) amb.k = 1;
    game.capim.celula = null; game.capim.update(0);
    for (const [nome, qual, alvo, comFxaa] of [['ultra', 'ultra', msaa, false], ['fxaa', 'alto', fx.alvo, true], ['alto', 'alto', plano, false]]) {
      if (G.nome !== qual) { G.nome = qual; G.aplicar(); }   // (Ultra ↔ Alto: os mesmos programas)
      w.distribuirLuzes(true);
      const consultas = [], cpu = [], parede = [];
      for (let i = 0; i < AQUECE + QUADROS; i++) {
        const rumo = (i % 4) * Math.PI / 2 + 0.4;
        cam.position.set(pos.x, pos.y + 2.2, pos.z);
        cam.rotation.set(-0.12, rumo, 0, 'YXZ');
        cam.updateMatrixWorld();
        w.update(1 / 60, cam);   // o céu, o LOD e as chamas para esta vista
        if (sol?.castShadow) sol.shadow.needsUpdate = true;   // (de dia e de noite: o custo do dia)
        const vale = i >= AQUECE, q = vale && ext ? gl.createQuery() : null;
        if (q) gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
        const t0 = performance.now();
        r.setRenderTarget(alvo);
        r.render(game.scene, cam);
        if (comFxaa) fx.passada(saida);
        const t1 = performance.now();
        if (q) { gl.endQuery(ext.TIME_ELAPSED_EXT); consultas.push(q); }
        if (vale) {
          cpu.push(t1 - t0);
          if (!ext) { gl.finish(); parede.push(performance.now() - t0); }
        }
        await esperar();
      }
      let gpu = [];
      if (ext) {
        gl.finish();
        for (let tentativa = 0; tentativa < 30 && !consultas.every((q) => gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)); tentativa++) await new Promise((ok) => setTimeout(ok, 16));
        const torto = gl.getParameter(ext.GPU_DISJOINT_EXT);
        for (const q of consultas) {
          if (!torto && gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6);
          gl.deleteQuery(q);
        }
      }
      if (!gpu.length) gpu = parede;   // (sem o cronômetro: o quadro inteiro, CPU e placa)
      medidas[nome] = { gpu: mediana(gpu), cpu: mediana(cpu) };
    }
    medidas.tela = `${W}×${H}`;
    medidas.metodo = ext ? 'cronômetro da GPU' : 'quadro inteiro (gl.finish)';
  } finally {
    p.pos.copy(antes.pos);
    cam.position.copy(antes.camPos); cam.quaternion.copy(antes.camQ); cam.aspect = antes.aspecto; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    if (amb) { amb.k = antes.k; amb.kc = antes.kc; }
    if (G.nome !== antes.nome) { G.nome = antes.nome; G.aplicar(); }
    r.setRenderTarget(antes.alvo);
    // (o material do FXAA de passagem NÃO é descartado: o programa dele fica para o FXAA de verdade)
    msaa.dispose(); plano.dispose(); saida.dispose(); fx.alvo.dispose();
    // (o capim de volta em volta do jogador: o do acampamento ficava desenhado na tela de título)
    game.capim.celula = null; game.capim.update(0);
    w.distribuirLuzes();
  }
  return medidas;
}

function mediana(v) {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  return s[s.length >> 1];
}
