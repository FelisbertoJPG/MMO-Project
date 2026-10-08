/**
 * **O CHAT DE VOZ** (07/10/2026) — falar com quem está junto, nos dois modos.
 *
 * O áudio NÃO passa pelo servidor: cada par de jogadores abre uma conexão
 * WebRTC direta (só áudio, Opus). O que passa pelos canos de sempre é só a
 * SINALIZAÇÃO — a oferta, a resposta e os candidatos de rede —, como o recado
 * `voz` com destinatário (`para`):
 *
 *   • Mundo online: o `servidor-mundo.mjs` entrega o `voz` só ao `para`;
 *   • Sala (Jornada): pelo cano da sala (Supabase ou rede local), só o outro ouve.
 *
 * **Com quem**: na sala, com o outro jogador, sempre. No Mundo online, é VOZ
 * DE PERTO: liga com quem chega a `RAIO_LIGA`, desliga além de `RAIO_SOLTA`
 * (folga para não ficar ligando e desligando na borda), no máximo `MAX_PARES`
 * (os mais perto). A voz vem de onde o boneco está (PannerNode HRTF): da
 * esquerda, da direita.
 *
 * **A distância (nos dois modos)**: cheia até `PERTO`, e daí cai em curva
 * (`audivel`) até sumir em `RAIO_OUVE` — perto do fim já é um murmúrio. O
 * aviso de "falando" (o ícone sobre a cabeça, o nome no HUD) usa o nível que
 * CHEGA ao ouvido (o do microfone dele × a distância): de longe, não dá para
 * saber se a pessoa está falando ou não.
 *
 * **Quem oferece**: o de id MENOR; o maior só responde. Assim os dois nunca
 * oferecem ao mesmo tempo. Quem não quer voz responde `nao`, e o outro só
 * tenta de novo depois de `ESPERA_NAO_MS` — ou antes, se receber um `quero`
 * (mandado por quem acabou de ligar a voz).
 *
 * **O microfone** só é pedido quando há o que mandar: no "aberto", ao entrar
 * gente; no "segurar para falar", no primeiro aperto da tecla. A conexão já
 * nasce com o canal de áudio (`addTransceiver`), e o microfone entra depois
 * por `replaceTrack` — nada de renegociar. Segurar para falar é só ligar e
 * desligar a trilha (`enabled`): desligada, ela manda silêncio.
 *
 * **O retransmissor (TURN, 08/10/2026)**: só com STUN (descobrir o endereço de
 * fora), entre redes fechadas (o 4G do celular, rede de empresa) a conexão não
 * fechava — "não conectou". Agora cada conexão pede ao servidor de mundo as
 * credenciais de um TURN da Cloudflare (`buscarTurn`) e, com elas, o áudio dá a
 * volta por lá quando o caminho direto não abre. Servidor sem TURN = só STUN.
 *
 * O contrato com `game.sessao`: `outros` (os `JogadorRemoto`, com `id` e
 * `pos`), `eu` (o meu id, o mesmo que os outros veem como `de`) e
 * `enviarVoz(para, carga)`; e a sessão entrega o que chega em `receber(de, carga)`.
 */
import * as THREE from 'three';

const CHAVE = 'masmorra:voz';
export const MODOS = ['mudo', 'aberto', 'segurar'];
const PADRAO = { modo: 'segurar', tecla: 'KeyV', volume: 0.8 };

/** As teclas que o jogo já usa: não servem para falar. */
const DO_JOGO = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyF', 'KeyQ', 'KeyR', 'KeyC', 'KeyE', 'KeyI', 'Tab',
  'KeyT', 'KeyM', 'KeyO', 'Enter', 'NumpadEnter', 'Escape', 'KeyY', 'KeyN', 'KeyX', 'Digit1', 'Digit2', 'ArrowDown', 'F3']);
/** A tecla virtual do botão "Falar" do celular (toque.js aperta, aqui se lê). */
export const TECLA_TOQUE = 'VozToque';

const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }, { urls: 'stun:stun.cloudflare.com:3478' }];
const RAIO_LIGA = 40;          // m: chegou a isto, liga
const RAIO_SOLTA = 55;         // m: passou disto, desliga
const RAIO_OUVE = 35;          // m: a voz some aqui
const PERTO = 3;               // m: até aqui, volume cheio

/** Quanto da voz chega a `d` metros: 1 até `PERTO`, caindo em curva (quadrado) até 0 em `RAIO_OUVE`. */
export function audivel(d) {
  if (d <= PERTO) return 1;
  if (d >= RAIO_OUVE) return 0;
  const k = (RAIO_OUVE - d) / (RAIO_OUVE - PERTO);
  return k * k;
}
const MAX_PARES = 8;
const ESCOLHER_MS = 500;       // de quanto em quanto tempo revê com quem ligar
const LIGANDO_MAX_MS = 20_000; // sem fechar a conexão nisto: "não conectou"
const ESPERA_NAO_MS = 30_000;
const ESPERA_FALHOU_MS = 60_000;
const QUERO_MS = 8000;
const BITRATE = 32_000;        // Opus de voz: sobra
export const FALANDO = 0.015;       // nível (RMS) acima disto = "está falando"

const ehId = (s) => typeof s === 'string' && s.length > 0 && s.length <= 80;

/** O nome da tecla para a tela: 'KeyV' → 'V', 'Mouse3' → 'Botão lateral 1'. */
export function nomeDaTecla(code) {
  if (!code) return '—';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad\d$/.test(code)) return `Num ${code.slice(6)}`;
  if (code === 'Mouse3') return 'Botão lateral 1';
  if (code === 'Mouse4') return 'Botão lateral 2';
  const nomes = { CapsLock: 'Caps Lock', ShiftLeft: 'Shift esq.', ShiftRight: 'Shift dir.', ControlLeft: 'Ctrl esq.', ControlRight: 'Ctrl dir.',
    AltLeft: 'Alt esq.', AltRight: 'Alt dir.', Backquote: "'", Backslash: ']', IntlBackslash: '\\', Minus: '-', Equal: '=', BracketLeft: '´', BracketRight: '[',
    Semicolon: 'Ç', Quote: '~', Comma: ',', Period: '.', Slash: ';', ArrowUp: '↑', ArrowLeft: '←', ArrowRight: '→' };
  return nomes[code] ?? code;
}

function lerAjustes() {
  try {
    const d = JSON.parse(localStorage.getItem(CHAVE) ?? 'null');
    if (!d || typeof d !== 'object') return { ...PADRAO };
    return {
      modo: MODOS.includes(d.modo) ? d.modo : PADRAO.modo,
      tecla: typeof d.tecla === 'string' && d.tecla.length < 32 && !DO_JOGO.has(d.tecla) ? d.tecla : PADRAO.tecla,
      volume: Number.isFinite(d.volume) ? Math.min(1, Math.max(0, d.volume)) : PADRAO.volume,
    };
  } catch { return { ...PADRAO }; }
}

/** O ícone de "falando" sobre a cabeça: um só material para todos. */
let materialDoIcone = null;
function iconeFalando() {
  if (!materialDoIcone) {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    g.shadowColor = 'black'; g.shadowBlur = 6;
    g.fillStyle = '#ffe2a0'; g.strokeStyle = '#ffe2a0'; g.lineWidth = 4; g.lineCap = 'round';
    // o alto-falante e duas ondas
    g.beginPath(); g.moveTo(12, 26); g.lineTo(22, 26); g.lineTo(34, 14); g.lineTo(34, 50); g.lineTo(22, 38); g.lineTo(12, 38); g.closePath(); g.fill();
    g.beginPath(); g.arc(34, 32, 10, -0.9, 0.9); g.stroke();
    g.beginPath(); g.arc(34, 32, 18, -0.9, 0.9); g.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    materialDoIcone = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  }
  const s = new THREE.Sprite(materialDoIcone);
  s.scale.set(0.38, 0.38, 1);
  s.position.y = 2.6;
  s.visible = false;
  return s;
}

export class Voz {
  constructor(game) {
    this.game = game;
    const a = lerAjustes();
    /** 'mudo' (só ouve) | 'aberto' (microfone sempre ligado) | 'segurar' (fala com a tecla apertada) */
    this.modo = a.modo;
    this.tecla = a.tecla;
    this.volume = a.volume;
    this.pares = new Map();          // id → par (ver `criarPar`)
    this.espera = new Map();         // id → {ate, motivo: 'nao' | 'falhou'}: até quando não tento ligar de novo
    this.queroEnviado = new Map();   // id → quando mandei o último `quero`
    this.sessao = null;              // a sessão com quem as conexões foram abertas
    this.mic = null;                 // {stream, trilha, fonte, analise} — o microfone, quando pedido
    this.pedindoMic = null;          // a promessa do getUserMedia em andamento
    this.semMic = '';                // por que não há microfone (negado, sem https…)
    this.apertada = false;           // a tecla de falar, pelos MEUS ouvintes (vale fora do mouse travado)
    this.falando = false;            // estou mandando voz agora
    this.nivelMic = 0;
    this.ultimaEscolha = 0;
    this.amostra = new Float32Array(512);   // reaproveitada: nada de lixo por quadro
    this.ouvirTeclas();
  }

  // ------------------------------------------------------------ os ajustes

  gravarAjustes() {
    try { localStorage.setItem(CHAVE, JSON.stringify({ modo: this.modo, tecla: this.tecla, volume: this.volume })); } catch { }
  }

  mudarModo(modo) {
    if (!MODOS.includes(modo) || modo === this.modo) return;
    const antes = this.querVoz;
    this.modo = modo;
    this.gravarAjustes();
    if (modo === 'aberto') this.pedirMicrofone();
    if (modo === 'mudo') this.soltarMicrofone();
    if (!antes && this.querVoz) this.anunciar();
  }

  mudarVolume(v) {
    const antes = this.querVoz;
    this.volume = Math.min(1, Math.max(0, v));
    this.gravarAjustes();
    if (this.saida) this.saida.gain.value = this.volume;
    if (!antes && this.querVoz) this.anunciar();
  }

  /** `null` = aceita; senão, o motivo da recusa. */
  mudarTecla(code) {
    if (DO_JOGO.has(code)) return `${nomeDaTecla(code)} já é do jogo`;
    this.tecla = code;
    this.gravarAjustes();
    return null;
  }

  /** Participo de alguma conexão? Mudo e sem volume = nem falo nem ouço: nada abre. */
  get querVoz() { return this.modo !== 'mudo' || this.volume > 0; }

  // ------------------------------------------------------------ a tecla de falar

  ouvirTeclas() {
    const naCaixa = (e) => e.target instanceof Element && e.target.closest('input, textarea');
    addEventListener('keydown', (e) => {
      if (this.capturando || naCaixa(e) || e.code !== this.tecla) return;
      if (this.modo === 'segurar') { this.apertada = true; if (!e.repeat) this.aoApertar(); }
    });
    addEventListener('keyup', (e) => { if (e.code === this.tecla) this.apertada = false; });
    // os botões laterais do mouse: o navegador os usa para VOLTAR página — aqui não
    const botao = (e) => (e.button === 3 || e.button === 4) && `Mouse${e.button}` === this.tecla;
    addEventListener('mousedown', (e) => {
      if (this.capturando || !botao(e)) return;
      e.preventDefault();
      if (this.modo === 'segurar') { this.apertada = true; this.aoApertar(); }
    });
    addEventListener('mouseup', (e) => { if (botao(e)) { e.preventDefault(); this.apertada = false; } });
    addEventListener('auxclick', (e) => { if (botao(e)) e.preventDefault(); });
    addEventListener('blur', () => { this.apertada = false; });
  }

  aoApertar() {
    if (!this.mic) this.pedirMicrofone();
    this.game.sfx.ctx?.resume?.();
  }

  /**
   * Espera a próxima tecla (ou botão lateral do mouse) para ser a de falar.
   * `pronto(code | null, recusa?)`: null = desistiu (Esc).
   */
  capturarTecla(pronto) {
    this.pararCaptura();
    this.capturando = true;
    const fim = (code, recusa) => { this.pararCaptura(); pronto(code, recusa); };
    const tecla = (e) => {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.code === 'Escape') return fim(null);
      const recusa = this.mudarTecla(e.code);
      fim(recusa ? null : e.code, recusa);
    };
    const mouse = (e) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.mudarTecla(`Mouse${e.button}`);
      fim(`Mouse${e.button}`);
    };
    // na captura (antes do `Input` do jogo): a tecla escolhida não vira ação no jogo
    addEventListener('keydown', tecla, true);
    addEventListener('mousedown', mouse, true);
    this.pararCaptura = () => {
      removeEventListener('keydown', tecla, true);
      removeEventListener('mousedown', mouse, true);
      this.capturando = false;
      this.pararCaptura = () => {};
    };
  }

  pararCaptura() {}

  // ------------------------------------------------------------ o microfone

  get podeMic() { return !!navigator.mediaDevices?.getUserMedia; }

  pedirMicrofone() {
    if (this.mic || this.pedindoMic) return this.pedindoMic;
    if (!this.podeMic) {
      this.semMic = window.isSecureContext ? 'este navegador não dá acesso ao microfone' : 'o microfone só funciona em https ou em localhost';
      return null;
    }
    this.pedindoMic = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })
      .then((stream) => {
        this.pedindoMic = null;
        if (this.modo === 'mudo') { for (const t of stream.getTracks()) t.stop(); return; }
        const trilha = stream.getAudioTracks()[0];
        trilha.enabled = false;   // quem liga é o `update`, conforme o modo e a tecla
        this.mic = { stream, trilha };
        this.semMic = '';
        const ctx = this.contexto();
        if (ctx) {
          this.mic.fonte = ctx.createMediaStreamSource(stream);
          this.mic.analise = ctx.createAnalyser();
          this.mic.analise.fftSize = 512;
          this.mic.fonte.connect(this.mic.analise);   // só para medir: não vai para os alto-falantes
        }
        for (const p of this.pares.values()) p.remetente?.replaceTrack(trilha).catch(() => {});
        trilha.addEventListener('ended', () => { this.soltarMicrofone(); this.semMic = 'o microfone foi desligado'; });
        // no celular, o pedido de permissão tira o jogo da tela cheia (toque.js deita de novo
        // no próximo toque) e não havia sinal nenhum de que o microfone abriu (08/10/2026)
        if (this.game.toque) this.game.ui?.toast(`Microfone ligado — o medidor no menu (☰) mostra o seu som.${document.fullscreenElement ? '' : ' Toque na tela para voltar à tela cheia.'}`);
      })
      .catch((e) => {
        this.pedindoMic = null;
        this.semMic = e?.name === 'NotAllowedError' ? 'o navegador não deu permissão para o microfone'
          : e?.name === 'NotFoundError' ? 'nenhum microfone encontrado' : `não consegui abrir o microfone (${e?.name ?? e})`;
        this.game.ui?.toast(`Chat de voz: ${this.semMic}.`);
      });
    return this.pedindoMic;
  }

  soltarMicrofone() {
    if (!this.mic) return;
    for (const p of this.pares.values()) p.remetente?.replaceTrack(null).catch(() => {});
    for (const t of this.mic.stream.getTracks()) t.stop();
    try { this.mic.fonte?.disconnect(); } catch { }
    this.mic = null;
    this.falando = false;
    this.nivelMic = 0;
  }

  /** O AudioContext do jogo (o dos efeitos), com uma saída própria para as vozes. */
  contexto() {
    const sfx = this.game.sfx;
    if (!sfx.ctx) { try { sfx.init(); } catch { return null; } }
    const ctx = sfx.ctx;
    if (!this.saida) {
      // direto no destino, e não no `master` dos efeitos: o volume das vozes é só o daqui
      this.saida = ctx.createGain();
      this.saida.gain.value = this.volume;
      this.saida.connect(ctx.destination);
    }
    return ctx;
  }

  // ------------------------------------------------------------ todo quadro

  update() {
    const s = this.game.sessao;
    if (s !== this.sessao) { this.fecharTudo(false); this.sessao = s; this.espera.clear(); }
    const ativo = !!s?.enviarVoz && this.game.state === 'playing';

    // falar: a trilha só leva som com o modo e a tecla mandando
    const quer = this.modo === 'aberto' || (this.modo === 'segurar' && (this.apertada || this.game.input.isDown(TECLA_TOQUE)));
    if (quer && this.modo === 'segurar' && !this.mic && this.game.input.pressed(TECLA_TOQUE)) this.aoApertar();
    // sem sessão a trilha liga também (não há conexão para levar o som): é o medidor do menu, para testar sozinho
    if (this.mic) this.mic.trilha.enabled = quer;
    this.falando = !!this.mic && quer && ativo;
    this.nivelMic = this.mic?.analise ? this.nivel(this.mic.analise) : 0;

    if (!ativo || !this.querVoz) { if (this.pares.size) this.fecharTudo(true); return; }
    if (this.modo === 'aberto' && !this.mic && !this.semMic && this.pares.size) this.pedirMicrofone();

    const agora = performance.now();
    if (agora - this.ultimaEscolha >= ESCOLHER_MS) { this.ultimaEscolha = agora; this.escolher(s, agora); }
    this.posicionar(s);
  }

  /** Liga com quem deve, desliga de quem não deve mais. */
  escolher(s, agora) {
    if (!this.turn) this.buscarTurn(s);   // já vai pedindo: a primeira conexão não espera
    const eu = s.eu, perto = this.game.modo === 'mmo', meu = this.game.player.pos;
    const candidatos = [];
    for (const r of s.outros) {
      if (!ehId(r.id) || r.sumindo) continue;
      const d = perto ? Math.hypot(r.pos.x - meu.x, r.pos.z - meu.z) : 0;
      if (d <= (this.pares.has(r.id) ? RAIO_SOLTA : RAIO_LIGA)) candidatos.push([d, r.id]);
    }
    candidatos.sort((a, b) => a[0] - b[0]);
    const quero = new Set(candidatos.slice(0, MAX_PARES).map((c) => c[1]));

    const conhecidos = new Set(s.outros.map((r) => r.id));
    for (const [id, p] of [...this.pares]) {
      // a oferta pode chegar antes da primeira posição de quem ofereceu: espera o boneco aparecer
      if (!quero.has(id) && (conhecidos.has(id) || agora - p.criado > 5000)) this.fechar(id, true);
    }
    for (const [id, p] of this.pares) {
      if (p.estado === 'ligando' && agora - p.criado > LIGANDO_MAX_MS) this.falhou(id, 'não conectou');
    }
    for (const id of quero) {
      if (this.pares.has(id) || (this.espera.get(id)?.ate ?? 0) > agora) continue;
      if (eu < id) this.oferecer(id);
      else if (agora - (this.queroEnviado.get(id) ?? -1e9) > QUERO_MS) {
        // quem oferece é o outro: aviso que estou aqui (ele pode ter desistido de mim)
        this.queroEnviado.set(id, agora);
        this.enviar(id, { t: 'quero' });
      }
    }
  }

  /** Quem acabou de ligar a voz avisa os de perto: quem desistiu por um `nao` tenta de novo. */
  anunciar() {
    this.queroEnviado.clear();
    this.espera.clear();
  }

  /** A voz vem de onde o boneco está; quem escuta está na cabeça do jogador, olhando com a câmera. */
  posicionar(s) {
    const ctx = this.game.sfx.ctx;
    if (!ctx || !this.pares.size) return;
    const p = this.game.player.pos, cam = this.game.camera, L = ctx.listener;
    const f = cam.getWorldDirection(this._dir ??= new THREE.Vector3());
    const t = ctx.currentTime + 0.05;
    if (L.positionX) {
      L.positionX.linearRampToValueAtTime(p.x, t); L.positionY.linearRampToValueAtTime(p.y + 1.6, t); L.positionZ.linearRampToValueAtTime(p.z, t);
      L.forwardX.linearRampToValueAtTime(f.x, t); L.forwardY.linearRampToValueAtTime(f.y, t); L.forwardZ.linearRampToValueAtTime(f.z, t);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y + 1.6, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
    const remotos = new Map(s.outros.map((r) => [r.id, r]));
    for (const par of this.pares.values()) {
      const r = remotos.get(par.id);
      this.prenderIcone(par, r);
      if (!r || !par.panner) continue;
      const pn = par.panner;
      if (pn.positionX) {
        pn.positionX.linearRampToValueAtTime(r.pos.x, t); pn.positionY.linearRampToValueAtTime(r.pos.y + 1.6, t); pn.positionZ.linearRampToValueAtTime(r.pos.z, t);
      } else pn.setPosition(r.pos.x, r.pos.y + 1.6, r.pos.z);
      par.audivel = audivel(Math.hypot(r.pos.x - p.x, r.pos.y - p.y, r.pos.z - p.z));
      par.ganho.gain.setTargetAtTime(par.audivel, ctx.currentTime, 0.08);
      // o nível que CHEGA: de longe o "falando" some junto com a voz
      par.nivel = par.analise ? this.nivel(par.analise) * par.audivel : 0;
      par.falandoAte = par.nivel > FALANDO ? performance.now() + 250 : (par.falandoAte ?? 0);
      if (par.icone) par.icone.visible = performance.now() < par.falandoAte;
    }
  }

  /** O ícone de falando vai no boneco — que pode ter sido trocado (saiu e voltou). */
  prenderIcone(par, r) {
    if (par.remoto === r) return;
    if (par.icone) par.icone.removeFromParent();
    par.remoto = r ?? null;
    if (!r) return;
    par.icone ??= iconeFalando();
    r.model.root.add(par.icone);
  }

  nivel(analise) {
    const a = this.amostra;
    analise.getFloatTimeDomainData(a);
    let soma = 0;
    for (let i = 0; i < a.length; i++) soma += a[i] * a[i];
    return Math.sqrt(soma / a.length);
  }

  // ------------------------------------------------------------ as conexões

  /**
   * O RETRANSMISSOR (TURN, 08/10/2026): só com STUN, celular no 4G "não conectou"
   * com ninguém. As credenciais (da Cloudflare, que vencem) vêm do servidor de
   * mundo — `POST /__mundo/ice`, com o bilhete no Mundo ou o token da conta na
   * sala. Devolve a lista, ou null (servidor sem TURN, sala sem conta, servidor
   * fora do ar): aí a voz segue só com STUN, como antes.
   */
  buscarTurn(s) {
    const agora = performance.now();
    if (this.turn && agora < this.turn.ate) return Promise.resolve(this.turn.lista);
    if (this.pedindoTurn) return this.pedindoTurn;
    if (agora < (this.turnFalhouAte ?? 0)) return Promise.resolve(null);
    const g = this.game;
    this.pedindoTurn = (async () => {
      const corpo = s.bilhete ? { b: s.bilhete } : { token: await g.tokenDoMundo?.()?.() };
      if (!corpo.b && !corpo.token) return null;
      if (!s.bilhete && !g.haMundo?.()) return null;
      const base = s.bilhete ? (s.base ?? '') : g.enderecoDoMundo();
      // na sala o servidor pode estar dormindo (o Render acorda em ~1 min): espera
      const r = await fetch(`${base}/__mundo/ice`, {
        method: 'POST', body: JSON.stringify(corpo), signal: AbortSignal.timeout(90_000),
      });
      const d = await r.json();
      return Array.isArray(d?.iceServers) && d.iceServers.length ? d.iceServers : null;
    })().catch(() => null).then((lista) => {
      this.pedindoTurn = null;
      // o servidor guarda as credenciais por 12 h; aqui, 6 h. Sem TURN, pergunta de novo em 5 min
      if (lista) this.turn = { lista, ate: performance.now() + 6 * 3600_000 };
      else this.turnFalhouAte = performance.now() + 5 * 60_000;
      return lista;
    });
    return this.pedindoTurn;
  }

  /**
   * Põe o TURN na conexão antes de ela juntar os candidatos (`setLocalDescription`).
   * Espera no máximo `ms`: com o servidor acordando, a conexão não fica parada —
   * vai só com STUN, e a próxima já leva o TURN.
   */
  async comTurn(par, ms = 5000) {
    const lista = await Promise.race([this.buscarTurn(this.sessao), new Promise((ok) => setTimeout(ok, ms, null))]);
    if (!lista || this.pares.get(par.id) !== par) return;
    try { par.pc.setConfiguration({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, ...lista] }); } catch (e) { console.warn('[voz] TURN:', e); }
  }

  criarPar(id, ofertante) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const par = { id, pc, ofertante, estado: 'ligando', criado: performance.now(), pendentes: [], temRemota: false, nivel: 0 };
    this.pares.set(id, par);
    pc.onicecandidate = (e) => { if (e.candidate) this.enviar(id, { t: 'ice', c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (this.pares.get(id) !== par) return;
      const st = pc.connectionState;
      if (st === 'connected') { par.estado = 'ligado'; this.limitarBitrate(par); }
      else if (st === 'failed') this.falhou(id, 'a conexão caiu');
    };
    pc.ontrack = (e) => this.tocar(par, e.streams[0] ?? new MediaStream([e.track]));
    return par;
  }

  async oferecer(id) {
    const par = this.criarPar(id, true);
    try {
      par.transceptor = par.pc.addTransceiver('audio', { direction: 'sendrecv' });
      par.remetente = par.transceptor.sender;
      if (this.mic) await par.remetente.replaceTrack(this.mic.trilha);
      await this.comTurn(par);
      if (this.pares.get(id) !== par) return;
      const oferta = await par.pc.createOffer();
      await par.pc.setLocalDescription(oferta);
      if (this.pares.get(id) !== par) return;
      this.enviar(id, { t: 'oferta', sdp: par.pc.localDescription.sdp });
    } catch (e) {
      console.warn('[voz] oferta:', e);
      this.falhou(id, 'erro ao ligar');
    }
  }

  async responder(id, sdp) {
    this.fechar(id, false);   // o outro recomeçou (recarregou, perdeu a conexão): começa do zero também
    const par = this.criarPar(id, false);
    try {
      await par.pc.setRemoteDescription({ type: 'offer', sdp });
      par.temRemota = true;
      par.transceptor = par.pc.getTransceivers()[0];
      if (!par.transceptor) throw new Error('oferta sem áudio');
      par.transceptor.direction = 'sendrecv';
      par.remetente = par.transceptor.sender;
      if (this.mic) await par.remetente.replaceTrack(this.mic.trilha);
      await this.comTurn(par);
      if (this.pares.get(id) !== par) return;
      const resposta = await par.pc.createAnswer();
      await par.pc.setLocalDescription(resposta);
      if (this.pares.get(id) !== par) return;
      this.enviar(id, { t: 'resposta', sdp: par.pc.localDescription.sdp });
      await this.esvaziar(par);
    } catch (e) {
      console.warn('[voz] resposta:', e);
      this.falhou(id, 'erro ao ligar');
    }
  }

  async esvaziar(par) {
    for (const c of par.pendentes.splice(0)) { try { await par.pc.addIceCandidate(c); } catch { } }
  }

  /** O som de um par: elemento <audio> mudo (o Chrome só toca stream remoto no WebAudio com ele) → volume → posição → saída. */
  tocar(par, stream) {
    const ctx = this.contexto();
    if (!ctx || par.fonte) return;
    par.audio = new Audio();
    par.audio.muted = true;
    par.audio.srcObject = stream;
    par.audio.play().catch(() => {});
    par.fonte = ctx.createMediaStreamSource(stream);
    par.analise = ctx.createAnalyser();
    par.analise.fftSize = 512;
    // o panner só dá a DIREÇÃO (rolloff 0); a distância é o `ganho`, posto por `audivel` em `posicionar`
    par.panner = new PannerNode(ctx, { panningModel: 'HRTF', rolloffFactor: 0 });
    par.ganho = ctx.createGain();
    par.ganho.gain.value = 0;   // até saber onde o outro está
    par.fonte.connect(par.analise);
    par.fonte.connect(par.panner).connect(par.ganho).connect(this.saida);
  }

  limitarBitrate(par) {
    const s = par.remetente;
    if (!s?.getParameters) return;
    try {
      const p = s.getParameters();
      if (!p.encodings?.length) return;
      p.encodings[0].maxBitrate = BITRATE;
      s.setParameters(p).catch(() => {});
    } catch { }
  }

  falhou(id, motivo) {
    const p = this.pares.get(id);
    if (p) console.warn(`[voz] ${id}: ${motivo}`);
    this.fechar(id, true);
    this.espera.set(id, { ate: performance.now() + ESPERA_FALHOU_MS, motivo: 'falhou' });
    this.falhas ??= new Map();
    this.falhas.set(id, motivo);
  }

  fechar(id, avisar) {
    const p = this.pares.get(id);
    if (!p) return;
    this.pares.delete(id);
    if (avisar) this.enviar(id, { t: 'tchau' });
    try { p.pc.close(); } catch { }
    try { p.fonte?.disconnect(); p.panner?.disconnect(); p.ganho?.disconnect(); } catch { }
    if (p.audio) { p.audio.srcObject = null; }
    p.icone?.removeFromParent();
  }

  fecharTudo(avisar) {
    for (const id of [...this.pares.keys()]) this.fechar(id, avisar);
  }

  // ------------------------------------------------------------ recados

  enviar(id, carga) {
    this.sessao?.enviarVoz?.(id, { ...carga, para: id });
  }

  /** Um recado `voz` de `de` (o id que o SERVIDOR/cano diz, não o escrito na carga). */
  receber(de, c) {
    const s = this.sessao;
    if (!s || !ehId(de) || !c || typeof c !== 'object' || c.para !== s.eu) return;
    const p = this.pares.get(de);
    switch (c.t) {
      case 'oferta':
        if (typeof c.sdp !== 'string' || c.sdp.length > 20_000) return;
        // só quem tem o id menor oferece; e quem não quer voz diz não
        if (!(de < s.eu)) return;
        if (!this.querVoz || this.game.state !== 'playing') return this.enviar(de, { t: 'nao' });
        this.falhas?.delete(de);
        return void this.responder(de, c.sdp);
      case 'resposta':
        if (!p?.ofertante || p.temRemota || typeof c.sdp !== 'string' || c.sdp.length > 20_000) return;
        p.temRemota = true;
        return void p.pc.setRemoteDescription({ type: 'answer', sdp: c.sdp }).then(() => this.esvaziar(p)).catch(() => this.falhou(de, 'resposta ruim'));
      case 'ice': {
        const k = c.c;
        if (!p || !k || typeof k !== 'object' || typeof k.candidate !== 'string' || k.candidate.length > 1000) return;
        const cand = { candidate: k.candidate, sdpMid: typeof k.sdpMid === 'string' ? k.sdpMid : null, sdpMLineIndex: Number.isInteger(k.sdpMLineIndex) ? k.sdpMLineIndex : null };
        if (p.temRemota) p.pc.addIceCandidate(cand).catch(() => {});
        else if (p.pendentes.length < 64) p.pendentes.push(cand);
        return;
      }
      case 'tchau': return this.fechar(de, false);
      case 'nao':
        this.fechar(de, false);
        this.espera.set(de, { ate: performance.now() + ESPERA_NAO_MS, motivo: 'nao' });
        return;
      case 'quero':
        // o outro ligou a voz (ou está esperando por mim): se ele tinha dito não, tento já.
        // Depois de uma FALHA, não: a rede entre os dois não fecha, e tentar a cada `quero` seria um laço
        if (this.espera.get(de)?.motivo === 'nao') { this.espera.delete(de); this.ultimaEscolha = 0; }
        return;
    }
  }

  // ------------------------------------------------------------ para a tela

  /** O que o painel de opções e o HUD mostram. */
  resumo() {
    const s = this.sessao, nomes = new Map((s?.outros ?? []).map((r) => [r.id, r.nome || 'alguém']));
    const ligados = [], ligando = [], falando = [];
    const agora = performance.now();
    for (const p of this.pares.values()) {
      const nome = nomes.get(p.id) ?? 'alguém';
      (p.estado === 'ligado' ? ligados : ligando).push(nome);
      if (agora < (p.falandoAte ?? 0)) falando.push(nome);
    }
    const falhas = [...(this.falhas ?? [])].filter(([id]) => nomes.has(id) && !this.pares.has(id)).map(([id]) => nomes.get(id));
    return { ligados, ligando, falando, falhas, temSessao: !!s?.enviarVoz, turn: !!this.turn };
  }
}
