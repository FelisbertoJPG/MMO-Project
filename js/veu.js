/**
 * O VÉU (16/10/2026) — na câmera ISOMÉTRICA (player.js, `cameraIsometrica`), o que fica entre a
 * câmera e o personagem, acima da cintura dele (a copa das árvores, o alto de uma parede, uma
 * tenda), fica MEIO transparente num círculo em volta dele — como nos jogos isométricos.
 *
 * É transparência PONTILHADA (dithering): uma parte dos pixels some num padrão fino de ruído
 * (`uVeu` = quanto: 0,6 no meio do círculo, sumindo até a borda), e a peça continua OPACA para o
 * resto — sem passar para o desenho dos transparentes (a ordem de desenho de uma copa de árvore
 * transparente sobre outra seria um problema), sem shader novo na hora (o gancho entra nos
 * materiais dos lotes da decoração já no carregamento, e fica parado com `uVeu` = 0 fora da
 * isométrica) e sem mexer na sombra (a sombra usa outro material: a árvore some na frente, mas
 * a sombra dela fica).
 *
 * A conta é no ESPAÇO DA VISTA: o círculo é em volta do personagem como a câmera o vê (`uVeuAlvo`,
 * o peito dele na vista), e só o que está mais perto da câmera que ele (`z` maior) e acima de
 * `uVeuChao` (a cintura, no mundo) entra — o chão e o que está no pé dele não.
 */
import * as THREE from 'three';

/** Os uniformes, DIVIDIDOS por todos os materiais com o véu (mudar aqui muda em todos). */
export const VEU = {
  uVeu: { value: 0 },
  uVeuAlvo: { value: new THREE.Vector3() },
  uVeuChao: { value: 0 },
  uVeuRaio: { value: 3.2 },
};

/** Põe o véu num material (por cima do gancho de shader que ele já tenha). */
export function vestirVeu(m) {
  if (m.userData.veu) return m;
  m.userData.veu = true;
  const antes = m.onBeforeCompile, chave = m.customProgramCacheKey;
  m.onBeforeCompile = function (sh, r) {
    antes?.call(this, sh, r);
    Object.assign(sh.uniforms, VEU);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVeuVista;\nvarying float vVeuY;')
      .replace('#include <project_vertex>', `#include <project_vertex>
  vVeuVista = mvPosition.xyz;
  vec4 veuMundo = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
    veuMundo = instanceMatrix * veuMundo;
  #endif
  vVeuY = ( modelMatrix * veuMundo ).y;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVeuVista;\nvarying float vVeuY;\nuniform float uVeu;\nuniform vec3 uVeuAlvo;\nuniform float uVeuChao;\nuniform float uVeuRaio;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
  if ( uVeu > 0.0 && vVeuY > uVeuChao && vVeuVista.z > uVeuAlvo.z + 0.5 ) {
    float veuPerto = 1.0 - smoothstep( uVeuRaio * 0.55, uVeuRaio, length( vVeuVista.xy - uVeuAlvo.xy ) );
    float veuRuido = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
    if ( veuRuido < uVeu * veuPerto ) discard;
  }`);
  };
  m.customProgramCacheKey = function () { return `${chave.call(this)}|veu`; };
  return m;
}
