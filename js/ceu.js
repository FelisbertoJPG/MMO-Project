/**
 * O CÉU (04/10/2026) — a abóbada com degradê, SOL, LUA, ESTRELAS e NUVENS que andam com o
 * vento, desenhada por UM shader numa esfera em volta da câmera; e o REFLEXO: o mesmo céu
 * vira o mapa de ambiente (PMREM) do mundo inteiro — as armas, a armadura e as peças
 * refletem o céu de AGORA (o azul do dia, o laranja do pôr do sol, o escuro da noite e da
 * masmorra), em vez do estúdio fixo de antes (RoomEnvironment).
 *
 * Quem dá as cores é o ciclo do dia (`cicloDoDia` no world.js): o horizonte é a cor da
 * NÉVOA (o que está longe some na névoa e emenda no céu sem costura), o alto é o fundo
 * escurecido. O sol nasce no leste às 6 e se põe às 18; a lua faz o arco oposto.
 *
 * O DESEMPENHO, pensado para não pesar:
 *  • a abóbada é desenhada por ÚLTIMO entre os opacos, com teste de profundidade: o
 *    shader do céu só roda nos pixels em que se vê céu (dentro da masmorra, quase nenhum);
 *  • as nuvens são ruído no shader (sem textura), com oitavas pela qualidade gráfica;
 *  • o REFLEXO é refeito de tempos em tempos (`REFLEXO_S` da qualidade), e logo quando se
 *    entra ou sai da masmorra; sempre na MESMA textura, então nada recompila;
 *  • o reflexo existe desde o começo (antes da primeira compilação dos shaders), e
 *    dentro da masmorra ele é escuro (o céu "apaga" com o `k` do ar livre);
 *  • ele vai SÓ para as armas e o corpo do guerreiro — no cenário inteiro ele lavava o
 *    verde do chão e das folhas.
 */
import * as THREE from 'three';

const RAIO = 250;   // < o `far` da câmera (300)
const AZUL_DO_DIA = new THREE.Color(0x2f6fd0);

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position.z = gl_Position.w;   // no fundo de tudo: só aparece onde nada foi desenhado
  }`;

const FRAG = /* glsl */`
  uniform vec3 uZenite, uHorizonte, uDentro, uLuz, uSol, uLua;
  uniform float uDia, uTempo, uK, uOitavas;
  varying vec3 vDir;

  float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
  float ruido(vec2 p) {
    vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 5; i++) { if (float(i) >= uOitavas) break; s += a * ruido(p); p = p * 2.03 + 17.1; a *= 0.5; }
    return s;
  }

  void main() {
    vec3 d = normalize(vDir);
    float alto = clamp(d.y, 0.0, 1.0);
    // o degradê: o horizonte é a névoa, o alto é o fundo escurecido
    vec3 cor = mix(uHorizonte, uZenite, pow(alto, 0.55));
    float noite = smoothstep(0.4, 0.05, uDia);   // estrelas só com o céu escuro de verdade

    // ESTRELAS (de noite, longe do horizonte), piscando devagar
    if (noite > 0.01 && d.y > 0.05) {
      vec2 g = floor(d.xz / (d.y + 0.6) * 260.0);
      float h = hash(g);
      float brilho = step(0.9965, h) * (0.6 + 0.4 * sin(uTempo * 1.7 + h * 60.0));
      cor += vec3(0.85, 0.9, 1.0) * brilho * noite * smoothstep(0.05, 0.35, d.y);
    }

    // o SOL: disco e halo (o halo pinta o céu em volta, mais forte no nascer e no pôr)
    float cs = dot(d, uSol);
    float acima = smoothstep(-0.12, 0.05, uSol.y);
    float c0 = max(cs, 0.0);
    cor += uLuz * (pow(c0, 5.0) * 0.28 + pow(c0, 28.0) * 0.5 + pow(c0, 400.0) * 1.6) * acima;
    float disco = smoothstep(0.9990, 0.9995, cs);
    cor = mix(cor, vec3(1.0, 0.93, 0.78) * 8.0, disco * acima);

    // a LUA: disco claro com manchas, halo frio, de noite
    float cl = dot(d, uLua);
    float luaAcima = smoothstep(-0.08, 0.06, uLua.y) * (0.25 + 0.75 * noite);
    float luaDisco = smoothstep(0.99925, 0.9996, cl);
    vec3 eixoX = normalize(cross(uLua, vec3(0.0, 1.0, 0.0)));
    vec3 eixoY = cross(eixoX, uLua);
    vec2 pl = vec2(dot(d, eixoX), dot(d, eixoY)) * 70.0;
    float manchas = 0.78 + 0.22 * ruido(pl * 1.3 + 3.0);
    cor += vec3(0.55, 0.62, 0.8) * pow(max(cl, 0.0), 300.0) * 0.35 * luaAcima;
    cor = mix(cor, vec3(0.92, 0.94, 1.0) * manchas * 1.6, luaDisco * luaAcima);

    // as NUVENS: ruído projetado num teto, andando com o vento; somem perto do horizonte
    if (d.y > 0.0 && uOitavas > 0.5) {
      vec2 p = d.xz / (d.y + 0.12) * 1.15 + vec2(uTempo * 0.008, uTempo * 0.003);
      // a cobertura muda devagar (manchas de céu limpo entre os grupos de nuvens)
      float n = fbm(p) * (0.75 + 0.5 * ruido(p * 0.18 + 9.0));
      float cobre = smoothstep(0.5, 0.72, n) * smoothstep(0.0, 0.25, d.y);
      // o lado de baixo mais escuro: a mesma nuvem um pouco na direção do sol
      float sombra = fbm(p + uSol.xz * 0.06);
      vec3 claro = mix(vec3(0.16, 0.18, 0.26), uLuz * 1.05 + 0.15, uDia);
      vec3 escuro = mix(vec3(0.08, 0.09, 0.14), uHorizonte * 0.75, uDia);
      vec3 nuvem = mix(claro, escuro, clamp((sombra - n) * 3.0 + 0.35, 0.0, 1.0));
      // a borda contra o sol acende (o "forro de prata")
      nuvem += uLuz * pow(max(cs, 0.0), 12.0) * 0.6 * (1.0 - cobre) * acima;
      cor = mix(cor, nuvem, cobre * 0.92);
    }

    // abaixo do horizonte: a névoa
    cor = mix(cor, uHorizonte, smoothstep(0.02, -0.08, d.y));
    // dentro da masmorra o céu "apaga" (é o que o reflexo mostra lá dentro)
    cor = mix(uDentro, cor, uK);
    gl_FragColor = vec4(cor, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

// ------------------------------------------------------------ o CLARÃO (o reflexo na lente)
/**
 * O CLARÃO (04/10/2026): olhar para o sol (ou a lua) dá um reflexo de lente — um halo
 * grande no astro, "fantasmas" (anéis e hexágonos) na reta do astro ao centro da tela, e
 * um véu de luz por cima de tudo quando se olha bem de frente. É uma cena à parte, de
 * planos aditivos numa câmera ortográfica, desenhada DEPOIS do quadro (`depoisDoQuadro`).
 *
 * Some atrás de árvore, parede e nuvem grossa: de 3 em 3 quadros lê-se um quadradinho de
 * pixels em volta do astro (`readPixels`, um só, e só quando ele está na tela) e compara-se
 * o disco com o céu logo em volta — à vista, o disco é mais claro. A visibilidade anda suave.
 * No gráfico Baixo não há clarão (`clarao` da qualidade).
 */
function texturaDoClarao(tipo) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  if (tipo === 'halo') {
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  } else if (tipo === 'anel') {
    const gr = g.createRadialGradient(64, 64, 40, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  } else {   // hexágono suave
    g.filter = 'blur(3px)';
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + Math.PI / 6; g[i ? 'lineTo' : 'moveTo'](64 + Math.cos(a) * 56, 64 + Math.sin(a) * 56); }
    g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// os elementos de cada astro: [textura, lugar na reta (0 = no astro, 1 = no centro da tela,
// além de 1 = do outro lado), tamanho (fração da altura da tela), cor, força]
const ELEMENTOS = {
  sol: [['halo', 0, 1.2, 0xffd9a0, 0.6], ['halo', 0, 0.3, 0xffffff, 0.85], ['hex', 0.42, 0.07, 0xffc890, 0.35], ['anel', 0.7, 0.14, 0xb8d0ff, 0.2],
    ['hex', 1.22, 0.1, 0x9ad0ff, 0.26], ['hex', 1.5, 0.05, 0xffb0a0, 0.32], ['anel', 1.85, 0.32, 0xffe0b0, 0.12]],
  lua: [['halo', 0, 0.6, 0xa8c0ff, 0.45], ['hex', 1.3, 0.055, 0xb0c8ff, 0.15], ['anel', 1.7, 0.2, 0xc0d0ff, 0.09]],
};

// o raio do disco de cada astro (radianos), o mesmo do shader do céu (o `smoothstep` do disco)
const RAIO_ASTRO = { sol: Math.acos(0.9993), lua: Math.acos(0.99935) };

class Clarao {
  constructor(game) {
    this.game = game;
    this.cena = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 2);
    const tex = { halo: texturaDoClarao('halo'), anel: texturaDoClarao('anel'), hex: texturaDoClarao('hex') };
    const plano = new THREE.PlaneGeometry(1, 1);
    const material = (map, cor) => new THREE.MeshBasicMaterial({ map, color: cor, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
    this.astros = {};
    for (const [nome, lista] of Object.entries(ELEMENTOS)) {
      this.astros[nome] = {
        vis: 0, alvo: 0,
        partes: lista.map(([t, pos, tam, cor, forca]) => {
          const m = new THREE.Mesh(plano, material(tex[t], cor));
          m.userData = { pos, tam, forca };
          m.visible = false;
          this.cena.add(m);
          return m;
        }),
      };
    }
    // o véu: a tela inteira um pouco mais clara olhando bem para o sol
    this.veu = new THREE.Mesh(plano, new THREE.MeshBasicMaterial({ color: 0xffe2b8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }));
    this.veu.scale.set(10, 10, 1);
    this.veu.visible = false;
    this.cena.add(this.veu);
    this.quadro = 0;
    this.px = new Uint8Array(4 * 9);
    this._v = new THREE.Vector3(); this._f = new THREE.Vector3();
  }

  /** depois do quadro: `dirs` = { sol, lua } (direções), `forca` = { sol, lua } (0–1) */
  depois(dt, dirs, forca) {
    const g = this.game, r = g.renderer, cam = g.camera, q = g.graficos?.q;
    if (q && q.clarao === false) return;
    this.quadro++;
    const aspecto = cam.aspect;
    this.cam.left = -aspecto; this.cam.right = aspecto; this.cam.updateProjectionMatrix();
    cam.getWorldDirection(this._f);
    let algum = false, veu = 0;
    for (const nome of ['sol', 'lua']) {
      const a = this.astros[nome], dir = dirs[nome];
      const p = this._v.copy(cam.position).addScaledVector(dir, 200).project(cam);
      const naFrente = this._f.dot(dir) > 0.05 && forca[nome] > 0.01;
      const naTela = naFrente && Math.abs(p.x) < 1.15 && Math.abs(p.y) < 1.15;
      // a TAMPA: a cor no lugar do astro (só se ele está na tela, de 3 em 3 quadros)
      if (!naTela) a.alvo = 0;
      else if (this.quadro % 3 === 0 && Math.abs(p.x) < 0.98 && Math.abs(p.y) < 0.98) {
        // UM bloco em volta do astro: o miolo (o disco) contra um anel um pouco fora dele.
        // O astro está à vista se o disco é mais claro que o céu em volta — a lua atrás de
        // nuvem fina ainda conta; atrás de árvore, parede ou nuvem grossa, não
        const gl = r.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        const raioPx = (RAIO_ASTRO[nome] / (cam.fov * Math.PI / 180)) * h;
        const R = Math.max(4, Math.min(70, Math.round(raioPx * 1.8))), lado = 2 * R + 1;
        const cx = Math.round((p.x + 1) / 2 * w), cy = Math.round((p.y + 1) / 2 * h);
        const x0 = Math.max(0, cx - R), y0 = Math.max(0, cy - R), lw = Math.min(w - x0, lado), lh = Math.min(h - y0, lado);
        if (this.px.length < lw * lh * 4) this.px = new Uint8Array(lado * lado * 4);
        gl.readPixels(x0, y0, lw, lh, gl.RGBA, gl.UNSIGNED_BYTE, this.px);
        let miolo = 0, nm = 0, anel = 0, na = 0;
        const rm = Math.max(1, raioPx * 0.4), ra = raioPx * 1.5;
        for (let yy = 0; yy < lh; yy++) for (let xx = 0; xx < lw; xx++) {
          const d = Math.hypot(x0 + xx - cx, y0 + yy - cy), i = (yy * lw + xx) * 4;
          const v = (this.px[i] + this.px[i + 1] + this.px[i + 2]) / 3;
          if (d <= rm) { miolo += v; nm++; } else if (d >= ra && d <= R) { anel += v; na++; }
        }
        miolo /= Math.max(1, nm); anel /= Math.max(1, na);
        const contraste = miolo - anel;
        a.alvo = THREE.MathUtils.smoothstep(contraste, 6, 30) * THREE.MathUtils.smoothstep(miolo, 50, 90);
        a.ultimo = { miolo: Math.round(miolo), anel: Math.round(anel), R };   // (para conferir)
      }
      a.vis += (a.alvo - a.vis) * Math.min(1, dt * 7);
      const f = a.vis * forca[nome];
      for (const m of a.partes) {
        const { pos, tam, forca: fo } = m.userData;
        m.visible = f > 0.003;
        if (!m.visible) continue;
        algum = true;
        // na reta do astro ao centro (e além, do outro lado)
        m.position.set(p.x * aspecto * (1 - pos), p.y * (1 - pos), 0);
        m.scale.set(tam * 2, tam * 2, 1);
        m.material.opacity = f * fo;
      }
      if (nome === 'sol') veu = f * Math.max(0, this._f.dot(dir)) ** 10 * 0.16;
    }
    this.veu.material.opacity = veu;
    this.veu.visible = veu > 0.003;
    if (!algum && !this.veu.visible) return;
    const auto = r.autoClear;
    r.autoClear = false;
    r.render(this.cena, this.cam);
    r.autoClear = auto;
  }
}

export class Ceu {
  constructor(game) {
    this.game = game;
    const u = (v) => ({ value: v });
    this.uniforms = {
      uZenite: u(new THREE.Color(0x5a8ccc)), uHorizonte: u(new THREE.Color(0xa9c8e8)), uDentro: u(new THREE.Color(0x0a0806)),
      uLuz: u(new THREE.Color(0xfff1d6)), uSol: u(new THREE.Vector3(0, 1, 0)), uLua: u(new THREE.Vector3(0, -1, 0)),
      uDia: u(1), uTempo: u(0), uK: u(1), uOitavas: u(4),
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    // a abóbada do jogo: segue a câmera, desenhada por último entre os opacos (o shader
    // só roda onde nada a cobre)
    this.abobada = new THREE.Mesh(new THREE.SphereGeometry(RAIO, 32, 16), this.material);
    this.abobada.name = 'ceu';
    this.abobada.frustumCulled = false;
    this.abobada.renderOrder = 1e6;
    this.abobada.matrixAutoUpdate = false;
    game.scene.add(this.abobada);

    // O REFLEXO: o céu numa cena só dele, passado a PMREM numa textura que é sempre a
    // mesma (o gerador alocaria uma nova a cada vez; guardamos a primeira)
    this.cenaReflexo = new THREE.Scene();
    this.cenaReflexo.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), this.material));
    this.pmrem = new THREE.PMREMGenerator(game.renderer);
    const alocar = this.pmrem._allocateTargets.bind(this.pmrem);
    this.pmrem._allocateTargets = () => {
      const t = alocar();
      if (!this.alvoReflexo) return (this.alvoReflexo = t);
      t.dispose();   // nunca usada: a textura nem chega a existir na placa
      return this.alvoReflexo;
    };
    this.refazerReflexo();
    this.reflexo = this.alvoReflexo.texture;
    // o reflexo NÃO vai para o mundo todo (`scene.environment`): no chão, na grama e nas
    // folhas ele vira uma luz azul-acinzentada por cima de tudo e o verde perde a vida
    // (foi o que aconteceu na primeira versão). Ele vai só para quem reflete: as armas
    // (`Gear.env`, gear.js) e o corpo do guerreiro (guerreiro.js).
    this.desdeReflexo = 0;
    this.kReflexo = 1;
    // a direção da LUZ do mundo: o sol de dia, a lua de noite (a mesma do desenho), trocando
    // suave no nascer e no pôr; nunca rasante demais
    this.luzDir = new THREE.Vector3(0, 1, 0);
    this.clarao = new Clarao(game);
    this.forca = { sol: 0, lua: 0 };
  }

  /** Depois do quadro desenhado (o laço do jogo): o clarão do sol e da lua. */
  depoisDoQuadro(dt) {
    this.clarao.depois(dt, { sol: this.uniforms.uSol.value, lua: this.uniforms.uLua.value }, this.forca);
  }

  refazerReflexo() { this.pmrem.fromScene(this.cenaReflexo, 0.02, 0.1, 100); }

  /**
   * Todo quadro (world.updateAmbience): `F` = o céu da hora (cicloDoDia), `h` = a hora,
   * `k` = quanto de ar livre (0 na masmorra), `dentro` = a cor do escuro de dentro.
   */
  update(dt, F, h, k, dentro) {
    const U = this.uniforms, q = this.game.graficos?.q;
    U.uTempo.value += dt;
    U.uHorizonte.value.copy(F.nevoa);
    // o alto do céu: de dia um azul mais fundo que o fundo (o mapeamento de tons desbota o
    // fundo para um cinza-azulado); de noite e no crepúsculo, o fundo escurecido
    U.uZenite.value.copy(F.fundo).multiplyScalar(0.62).lerp(AZUL_DO_DIA, F.dia * 0.85);
    U.uLuz.value.copy(F.luz);
    U.uDentro.value.copy(dentro);
    U.uDia.value = F.dia;
    U.uK.value = k;
    U.uOitavas.value = q?.nuvens ?? 4;
    // o sol: leste (+x) às 6, no alto às 12, oeste às 18 (abaixo do horizonte de noite);
    // a lua, o contrário
    const ang = ((h - 6) / 24) * Math.PI * 2;
    U.uSol.value.set(Math.cos(ang), Math.sin(ang), 0.3).normalize();
    // (o arco da lua é inclinado para o sul: no alto da noite fica a ~43°, onde a câmera
    // do jogo alcança; no zênite ninguém a veria)
    U.uLua.value.set(-Math.cos(ang), -Math.sin(ang) * 0.7, -0.75).normalize();
    const sol = U.uSol.value, lua = U.uLua.value, w = THREE.MathUtils.smoothstep(sol.y, -0.05, 0.15);
    this.luzDir.copy(lua).lerp(sol, w);
    this.luzDir.y = Math.max(0.25, this.luzDir.y);
    this.luzDir.normalize();
    // quanto cada astro brilha na lente: o sol acima do horizonte, a lua de noite; nada na masmorra
    this.forca.sol = k * THREE.MathUtils.smoothstep(sol.y, -0.03, 0.08);
    this.forca.lua = k * THREE.MathUtils.smoothstep(lua.y, -0.02, 0.1) * (1 - F.dia);
    // a abóbada em volta da câmera
    const cam = this.game.camera;
    this.abobada.matrix.makeTranslation(cam.position.x, cam.position.y, cam.position.z);
    this.abobada.matrixWorldNeedsUpdate = true;
    this.abobada.visible = k > 0.002;
    // o reflexo: de tempos em tempos, e logo ao entrar/sair da masmorra
    this.desdeReflexo += dt;
    if (this.desdeReflexo >= (q?.reflexoS ?? 6) || Math.abs(k - this.kReflexo) > 0.2) {
      this.desdeReflexo = 0;
      this.kReflexo = k;
      this.refazerReflexo();
    }
  }
}
