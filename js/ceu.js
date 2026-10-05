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
