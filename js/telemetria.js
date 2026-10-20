/**
 * O RELATÓRIO AUTOMÁTICO DE DESEMPENHO (15/10/2026). Para saber como o jogo roda nos aparelhos
 * dos outros, era preciso cada um abrir o monitor, clicar "Diagnosticar e copiar" e mandar o
 * texto — e de quem o jogo NEM ABRE (o Safari do iPhone mata a aba que passa da memória) não
 * vinha nada. Agora o jogo manda sozinho, sem conta e sem clique, ao Supabase
 * (`masmorra.registrar_desempenho`, migration 0003), três tipos:
 *   • `jogo`  — o relatório do monitor (o mesmo texto do "Copiar relatório", sem o teste do
 *               lugar) com 90 s de partida, depois a cada 10 min, e ao fechar a página;
 *   • `carga` — a abertura que deu erro (o vigia do index.html: a mensagem e a etapa);
 *   • `caiu`  — a página que MORREU à vista: na abertura seguinte, o vigia acha o rastro que
 *               ficou (`masmorra:carga`, gravado a cada etapa da carga, ou `masmorra:vivo`, a
 *               cada 15 s jogando) sem o "saí direito" e o manda (ver index.html).
 * Nada de conta, nome nem endereço: uma `sessao` sorteada por aba. Quem lê é
 * `ferramentas/desempenho/ler.mjs` (com a chave de leitura, que não está no repositório).
 * `localStorage['masmorra:telemetria'] = 'nao'` desliga neste navegador.
 */
import { SUPABASE_URL, SUPABASE_KEY } from './rede/supabase.js';

const PRIMEIRO_S = 90, A_CADA_S = 600, TIQUE_S = 15;

/** Manda um registro (sem esperar, e sobrevivendo ao fechar da página: `keepalive`). */
export function enviarDesempenho(tipo, campos) {
  try { if (localStorage.getItem('masmorra:telemetria') === 'nao') return; } catch { }
  const corpo = JSON.stringify({ p: { sessao: globalThis.__sessao ?? 'sem-sessao', tipo, versao: globalThis.__versao ?? '?', ...campos } });
  if (corpo.length > 60000) return;   // o `keepalive` não leva mais de 64 KB
  try {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/registrar_desempenho`, {
      method: 'POST', keepalive: true, body: corpo,
      headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json', 'content-profile': 'masmorra' },
    }).catch(() => { });
  } catch { }
}

/** O aparelho, numa linha (o navegador, os núcleos, a memória, a tela). */
export function aparelho() {
  return `${navigator.userAgent} · núcleos ${navigator.hardwareConcurrency ?? '?'} · memória ${navigator.deviceMemory ?? '?'} GB · tela ${screen.width}×${screen.height} @${devicePixelRatio}`;
}

export class Telemetria {
  constructor(game) {
    this.game = game;
    this.jogado = 0;          // segundos de partida com a página à vista
    this.proximo = PRIMEIRO_S;
    this.desdeOUltimo = 0;
    setInterval(() => this.tique(), TIQUE_S * 1000);
    document.addEventListener('visibilitychange', () => this.marcarVivo());
    // fechou, recarregou, trocou de página: SAIU DIREITO (o rastro some) — e o que jogou vai junto
    addEventListener('pagehide', () => {
      try { localStorage.removeItem('masmorra:vivo'); } catch { }
      if (this.desdeOUltimo >= 45) this.enviar();
    });
  }

  /** O nome da placa, lido UMA vez: o `getParameter` espera a placa terminar o que tem na fila
   *  (num relatório, o `marcarVivo` de 15 em 15 s dava trancos de 40–57 ms jogando). */
  get gpu() {
    if (this._gpu) return this._gpu;
    const gl = this.game.renderer?.getContext();
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    const nome = (ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl?.getParameter(gl.RENDERER);
    if (nome) this._gpu = nome;
    return nome || '?';
  }

  /** O resumo do último minuto (para as colunas da tabela e o rastro de quem cair). */
  resumo() {
    const m = this.game.monitor, j = m?.janela(performance.now() - 60000);
    const w = this.game.world, p = this.game.player?.pos;
    let regiao = null;
    try { if (p && w) { const [l, c] = w.cellOf(p); regiao = m.regiao(l, c); } } catch { }
    return {
      modo: this.game.modo, qualidade: this.game.graficos?.q?.nome, gpu: this.gpu,
      fps: j && Number.isFinite(j.fps) ? +j.fps.toFixed(1) : null,
      cpu: j && Number.isFinite(j.cpu) ? +j.cpu.toFixed(1) : null,
      chamadas: j && Number.isFinite(j.chamadas) ? Math.round(j.chamadas) : null,
      regiao, memoria: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    };
  }

  /** O rastro de quem está jogando: se a página morrer à vista, a próxima abertura o manda. */
  marcarVivo() {
    if (this.game.state !== 'playing') return;
    try { localStorage.setItem('masmorra:vivo', JSON.stringify({ s: globalThis.__sessao, t: Date.now(), visivel: !document.hidden, versao: globalThis.__versao, jogado: Math.round(this.jogado), aparelho: aparelho(), ...this.resumo() })); } catch { }
  }

  tique() {
    if (this.game.state !== 'playing' || document.hidden) return;
    this.jogado += TIQUE_S;
    this.desdeOUltimo += TIQUE_S;
    this.marcarVivo();
    if (this.jogado >= this.proximo) { this.proximo += A_CADA_S; this.enviar(); }
  }

  enviar() {
    if (this.game.state !== 'playing' || !this.game.monitor) return;
    this.desdeOUltimo = 0;
    let relatorio = '';
    try { relatorio = this.game.monitor.relatorio(); } catch (e) { relatorio = `(o relatório falhou: ${e?.message ?? e})`; }
    // (o servidor recusa o registro acima de 40 mil BYTES — `registrar_desempenho`, supabase/migrations/0004 —, e o
    // acento e o desenho das tabelas valem 2–3 bytes: o relatório vai cortado em ~30 mil bytes, não letras)
    const bytes = (t) => new TextEncoder().encode(t).length;
    relatorio = relatorio.slice(0, 30000);
    while (relatorio.length > 1000 && bytes(relatorio) > 30000) relatorio = relatorio.slice(0, Math.floor(relatorio.length * 0.9));
    // (20/10/2026) as peças por estado e o peso por tipo (monitor.js, `cargas`), e o perfil do Automático
    let cargas = null;
    try { cargas = this.game.monitor.cargasCompactas?.() ?? null; } catch { }
    const auto = this.game.graficos?.autoQ ? (this.game.graficos.perfil?.perfil ?? 'sem medir') : null;
    enviarDesempenho('jogo', { ...this.resumo(), aparelho: aparelho(), dados: { jogado: Math.round(this.jogado), relatorio, cargas, auto } });
  }
}
