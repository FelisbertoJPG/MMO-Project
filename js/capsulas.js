/**
 * A SOMBRA DETALHADA DO PERSONAGEM (26/11/2026; a ideia 1 de planejamento/estudos/genshin-ps4-notas.md:
 * o "AO de cápsula" do Genshin). Umas esferas presas aos ossos de cada personagem por perto (quadril,
 * peito, cabeça, joelhos e pés) escurecem o CHÃO em volta dele, na conta do próprio material do chão:
 *  - a OCLUSÃO (sem direção): a luz do céu e do ambiente (`indirectDiffuse`) chega menos perto do
 *    corpo — a mancha embaixo e o contato dos pés;
 *  - a SOMBRA SUAVE na direção da luz direcional (o sol de dia, a lua de noite): a forma acompanha a
 *    pose. Vale também sem mapa de sombra (o Médio e o Baixo, onde o personagem parecia flutuar).
 * Nenhuma chamada de desenho a mais: a CPU só copia o lugar dos ossos para um uniforme; a GPU faz uma
 * conta curta por pixel do chão, e só perto de um personagem (o alcance de cada um corta o resto).
 * Opção do menu (Sombras › "Sombra detalhada do personagem", graficos.js: `sombraPersonagem`):
 * desligada, `uCapN` = 0 e o shader sai na hora — ligar e desligar não recompila nada.
 * Quem recebe: o chão de grama (world.js), o tapete de capim (capim.js) e o piso da masmorra.
 * Os personagens NÃO recebem (as esferas ficam dentro do corpo: ele sairia preto).
 *
 * A SOMBRA DAS NUVENS (26/11/2026, opção "Sombra das nuvens") mora no MESMO gancho do chão (os dois
 * mexem no mesmo trecho do shader): o chão faz a conta da nuvem do céu (ceu.js, `NUVEM`) a partir do
 * ponto dele, na direção do sol ou da lua, e tapa a luz direcional onde ela passa. O resto do mundo
 * (árvores, personagens) só a sente pelo lugar do jogador: o world.js baixa a luz direcional inteira
 * (`ambience.nuvemG`) quando a nuvem tapa o astro sobre ele — e o chão DIVIDE por isso (`uNuvem.z`),
 * senão ficaria escuro duas vezes ali e escuro demais fora da nuvem.
 */
import * as THREE from 'three';
import { NUVEM } from './ceu.js';

const MAX_P = 4;     // personagens com sombra ao mesmo tempo (os mais perto do jogador)
const POR = 7;       // esferas por personagem
const PERTO = 30;    // m: além disso, ninguém entra
const OSSOS = [   // [nomes (o primeiro que existir), raio em m na escala 1]
  [['pelvis', 'hips'], 0.17],
  [['spine_03', 'chest', 'upperchest', 'spine2', 'spine_02'], 0.17],
  [['head'], 0.12],
  [['calf_l', 'lowerleg_l', 'leftleg', 'shin_l'], 0.08],
  [['calf_r', 'lowerleg_r', 'rightleg', 'shin_r'], 0.08],
  [['foot_l', 'leftfoot'], 0.07],
  [['foot_r', 'rightfoot'], 0.07],
];

const U = {
  uCapPers: { value: Array.from({ length: MAX_P }, () => new THREE.Vector4()) },
  uCapEsf: { value: Array.from({ length: MAX_P * POR }, () => new THREE.Vector4()) },
  uCapN: { value: 0 },
  // x = a força da sombra das nuvens (0 = desligada), y = o tempo do céu, z = 1 / o que a luz já perdeu no jogador, w = oitavas
  uNuvem: { value: new THREE.Vector4(0, 0, 1, 3) },
};
const ESCALA_NUVEM = 1.15 / NUVEM.altura, f6 = (x) => x.toFixed(6);

const PARS = /* glsl */`
#define CAP_MAX_P ${MAX_P}
#define CAP_POR ${POR}
uniform vec4 uCapPers[ CAP_MAX_P ];          // centro (mundo) e alcance de cada personagem
uniform vec4 uCapEsf[ CAP_MAX_P * CAP_POR ];  // as esferas: centro (mundo) e raio (0 = vazia)
uniform int uCapN;                            // quantos personagens (0 = desligada)
uniform vec4 uNuvem;                          // a sombra das nuvens (ver acima)
// (o ruído das nuvens: o mesmo do ceu.js)
float nvHash( vec2 p ) { p = fract( p * vec2( 123.34, 456.21 ) ); p += dot( p, p + 45.32 ); return fract( p.x * p.y ); }
float nvRuido( vec2 p ) {
	vec2 i = floor( p ), f = fract( p ), u = f * f * ( 3.0 - 2.0 * f );
	return mix( mix( nvHash( i ), nvHash( i + vec2( 1, 0 ) ), u.x ), mix( nvHash( i + vec2( 0, 1 ) ), nvHash( i + vec2( 1, 1 ) ), u.x ), u.y );
}
// quanto da luz do sol/lua chega ao ponto p (mundo), olhando na direção l, por entre as nuvens
float nuvemSombra( vec3 p, vec3 l ) {
	vec2 q = p.xz * ${f6(ESCALA_NUVEM)} + l.xz * ( 1.15 / ( max( l.y, 0.05 ) + 0.12 ) ) + uNuvem.y * vec2( ${f6(NUVEM.vento[0])}, ${f6(NUVEM.vento[1])} );
	float s = 0.0, a = 0.5;
	vec2 r = q;
	for ( int i = 0; i < 3; i ++ ) { if ( float( i ) >= uNuvem.w ) break; s += a * nvRuido( r ); r = r * 2.03 + 17.1; a *= 0.5; }
	float n = s * ( 0.75 + 0.5 * nvRuido( q * 0.18 + 9.0 ) );
	return min( ( 1.0 - uNuvem.x * smoothstep( 0.44, 0.64, n ) ) * uNuvem.z, uNuvem.z );
}
vec3 capMundo( vec3 v ) { return ( vec4( v - viewMatrix[ 3 ].xyz, 0.0 ) * viewMatrix ).xyz; }
vec3 capDirMundo( vec3 d ) { return ( vec4( d, 0.0 ) * viewMatrix ).xyz; }
// a OCLUSÃO de uma esfera (cosseno: vista do ponto, quanto do céu ela tapa); a de perto vale 1,6x o raio
float capAO( vec3 p, vec3 n ) {
	float ao = 1.0;
	for ( int i = 0; i < CAP_MAX_P; i ++ ) {
		if ( i >= uCapN ) break;
		vec4 P = uCapPers[ i ];
		if ( distance( p, P.xyz ) > P.w ) continue;
		for ( int j = 0; j < CAP_POR; j ++ ) {
			vec4 e = uCapEsf[ i * CAP_POR + j ];
			if ( e.w <= 0.0 ) continue;
			vec3 r = e.xyz - p;
			float l = max( length( r ), 0.001 ), raio = e.w * 1.6;
			ao *= 1.0 - clamp( dot( n, r / l ) * raio * raio / ( l * l ), 0.0, 1.0 );
		}
	}
	return ao;
}
// a SOMBRA SUAVE de uma esfera na direção da luz (a penumbra cresce com a distância)
float capSombra( vec3 p, vec3 l ) {
	float s = 1.0;
	for ( int i = 0; i < CAP_MAX_P; i ++ ) {
		if ( i >= uCapN ) break;
		vec4 P = uCapPers[ i ];
		if ( distance( p, P.xyz ) > P.w ) continue;
		for ( int j = 0; j < CAP_POR; j ++ ) {
			vec4 e = uCapEsf[ i * CAP_POR + j ];
			if ( e.w <= 0.0 ) continue;
			vec3 oc = p - e.xyz;
			float b = dot( oc, l );
			if ( b > 0.0 ) continue;   // a esfera está do outro lado da luz
			float h = b * b - ( dot( oc, oc ) - e.w * e.w );
			float d = sqrt( max( 0.0, e.w * e.w - h ) ) - e.w;
			float t = - b - sqrt( max( h, 0.0 ) );
			if ( t > 0.0 ) s *= smoothstep( 0.0, 1.0, 1.4 * d / t );
		}
	}
	return mix( 1.0, s, 0.85 );
}
`;

/** O material (de CHÃO) passa a receber a sombra de cápsula e a das nuvens (uma vez por material; encadeia o que já havia). */
export function aplicarSombrasDoChao(m) {
  if (!m || m.userData.capsulas) return m;
  m.userData.capsulas = true;
  const antes = m.onBeforeCompile, chave = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    antes?.call(this, sh, r);
    Object.assign(sh.uniforms, U);
    // o laço das luzes do three.js (já com o remendo da cascata, graficos.js): na DIRECIONAL, antes de
    // somar a luz, a sombra das esferas (a pontual da tocha e a dos holofotes não passam por aqui)
    const ch = THREE.ShaderChunk.lights_fragment_begin, a = ch.indexOf('directionalLights[ i ];');
    const b = a >= 0 ? ch.indexOf('\t\tRE_Direct( directLight', a) : -1;
    const luzes = b > a
      ? `${ch.slice(0, b)}\t\tif ( uCapN > 0 || uNuvem.x > 0.0 ) {
\t\t\tvec3 pMundo = capMundo( geometryPosition ), lMundo = normalize( capDirMundo( directLight.direction ) );
\t\t\tif ( uCapN > 0 ) directLight.color *= capSombra( pMundo, lMundo );
\t\t\tif ( uNuvem.x > 0.0 ) directLight.color *= nuvemSombra( pMundo, lMundo );
\t\t}\n${ch.slice(b)}`
      : ch;
    if (b <= a) console.warn('capsulas.js: o laço das luzes do three.js mudou — a sombra de cápsula fica só na oclusão, e a das nuvens some');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <lights_pars_begin>', `#include <lights_pars_begin>\n${PARS}`)
      .replace('#include <lights_fragment_begin>', luzes)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n\tif ( uCapN > 0 ) reflectedLight.indirectDiffuse *= capAO( capMundo( geometryPosition ), normalize( capDirMundo( geometryNormal ) ) );');
  };
  // (a chave padrão do three.js é o TEXTO do onBeforeCompile — o deste invólucro é o mesmo em todo
  // material: a do gancho de antes vai junto, senão dois materiais podiam dividir um programa)
  const padrao = chave === THREE.Material.prototype.customProgramCacheKey, txt = String(antes ?? '');
  m.customProgramCacheKey = function () { return `${padrao ? txt : chave.call(this)}|capsulas`; };
  m.needsUpdate = true;
  return m;
}

const _v = new THREE.Vector3(), _m = new THREE.Vector3();
const ossosDe = new WeakMap();   // raiz do modelo → [{ osso, raio }] (ou [] sem esqueleto conhecido)
function ossos(raiz) {
  let l = ossosDe.get(raiz);
  if (l) return l;
  const porNome = new Map();
  raiz.traverse((o) => { if (o.isBone && !porNome.has(o.name.toLowerCase())) porNome.set(o.name.toLowerCase(), o); });
  l = [];
  for (const [nomes, raio] of OSSOS) {
    const osso = nomes.map((n) => porNome.get(n)).find(Boolean);
    if (osso) l.push({ osso, raio });
  }
  if (l.length < 3) l = [];   // (bicho de outro esqueleto: a esfera única, abaixo)
  ossosDe.set(raiz, l);
  return l;
}

/** A cada quadro, antes do desenho: a sombra das nuvens, e os personagens mais perto com o lugar dos ossos. */
export function atualizarSombrasDoChao(game) {
  const ceu = game.ceu?.uniforms, oit = ceu?.uOitavas.value ?? 0, nv = U.uNuvem.value;
  const g = game.world?.ambience?.nuvemG ?? 1;
  nv.set(game.graficos?.sombraNuvens && oit > 0.5 ? NUVEM.forca : 0, ceu?.uTempo.value ?? 0, 1 / Math.max(g, 0.05), Math.min(oit, 3));
  if (!game.graficos?.sombraPersonagem || !game.player) { U.uCapN.value = 0; return; }
  const eu = game.player.pos, cands = [];
  for (const lista of [game.jogadores, game.all]) {
    for (const c of lista ?? []) {
      const raiz = c?.model?.root ?? c?.root;
      if (!raiz?.visible || c.dead || !c.pos) continue;
      const d = c.pos.distanceToSquared(eu);
      if (d < PERTO * PERTO) cands.push({ c, raiz, d });
    }
  }
  cands.sort((x, y) => x.d - y.d);
  const luz = game.ceu?.luzDir ?? game.world?.ambience?.ceu?.dir;
  const ly = Math.max(0.25, luz?.y ?? 1), deitada = Math.sqrt(Math.max(0, 1 - ly * ly)) / ly;   // quanto a sombra se estica por metro de altura
  let n = 0;
  for (const { c, raiz } of cands) {
    if (n >= MAX_P) break;
    // (os ossos de AGORA: a animação já andou neste quadro, mas a matriz só seria refeita no desenho —
    // sem isto a mancha ficava um quadro atrás de quem corre)
    raiz.updateMatrixWorld();
    const e = raiz.matrixWorld.elements, escala = Math.hypot(e[0], e[1], e[2]) || 1;
    const lista = ossos(raiz), base = n * POR;
    let topo = 0;
    for (let j = 0; j < POR; j++) {
      const v = U.uCapEsf.value[base + j];
      const o = lista[j];
      if (o) { o.osso.getWorldPosition(_v); v.set(_v.x, _v.y, _v.z, o.raio * escala); topo = Math.max(topo, _v.y - c.pos.y); }
      else if (j === 0 && !lista.length) {   // sem esqueleto conhecido: uma esfera do tamanho do bicho
        const r = Math.min(c.radius ?? 0.5, 1.2);
        v.set(c.pos.x, c.pos.y + r, c.pos.z, r); topo = 2 * r;
      } else v.set(0, 0, 0, 0);
    }
    _m.set(c.pos.x, c.pos.y + topo * 0.5, c.pos.z);
    U.uCapPers.value[n].set(_m.x, _m.y, _m.z, 1.5 + topo * (0.6 + deitada));
    n++;
  }
  U.uCapN.value = n;
}
